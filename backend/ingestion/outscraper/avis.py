# backend/ingestion/outscraper/avis.py
#
# RÉCOLTE DU TEXTE DES AVIS (LS-01).
#
# LE DÉFAUT QUE CETTE VOIE CORRIGE. La base portait `review_count` — le NOMBRE
# d'avis — mais jamais leur contenu. Or l'indicateur langue pèse 0,30 du Local
# Signal et se calcule sur la langue de rédaction : sans texte, il valait
# `0,50` pour les 468 restaurants de la zone témoin. Trente pour cent du poids
# du score ne séparait aucun restaurant de son voisin.
#
# POURQUOI LES AVIS LES PLUS RÉCENTS ET NON LES PLUS PERTINENTS. Le
# fournisseur propose `most_relevant`, qui rend des avis plus longs — donc plus
# faciles à détecter. On prend pourtant `newest`, délibérément : « le plus
# pertinent » est un classement de Google, pondéré par sa propre mesure de
# popularité. S'en servir ferait rentrer par la fenêtre le signal que le projet
# existe pour ne pas utiliser (D-001). Les avis récents décrivent en outre la
# clientèle ACTUELLE, ce qui est précisément ce qu'on veut mesurer.
#
# `ignore_empty` ÉCARTE LES AVIS SANS TEXTE. Une note sans commentaire ne porte
# aucune langue : la payer serait payer pour rien.
#
# POURQUOI LA RÉPONSE BRUTE EST ÉCRITE SUR DISQUE AVANT L'IMPORT. Chaque appel
# consomme du quota, donc de l'argent. Si la logique d'import doit être
# corrigée — et elle l'a déjà été pour les photos, une réponse réelle ayant
# révélé des formes inattendues — on réimporte le fichier sans repayer. Une
# requête facturée ne doit jamais être perdue parce qu'un parseur avait un
# défaut.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.ingestion.outscraper.avis --limite 10 --a-blanc
#     python -m backend.ingestion.outscraper.avis --limite 10
#     python -m backend.ingestion.outscraper.avis --zone quartier-latin

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from backend import config

# Avis demandés par restaurant. CE NOMBRE EST CALCULÉ, PAS CHOISI.
#
# On estime une proportion — la part d'avis en langue locale. La marge d'erreur
# à 95 % vaut 1,96 × racine(0,25 / n) :
#
#      10 avis  →  ± 31 points   inutilisable : on ne distingue pas 80 % de 40 %
#      20 avis  →  ± 22 points   limite
#      50 avis  →  ± 14 points   exploitable
#     100 avis  →  ± 10 points   confortable
#     200 avis  →  ±  7 points   quatre fois le coût pour 7 points de plus
#
# 50 est le point où l'estimation devient exploitable sans que le coût
# s'emballe. Un restaurant qui en a moins en rend simplement moins : le lissage
# bayésien tire alors son score vers l'a priori neutre, ce qui est exactement
# le comportement voulu (D-003). On ne coupe JAMAIS à un nombre fixe par le bas
# — ce serait jeter de l'information sur les restaurants bien pourvus.
AVIS_PAR_RESTAURANT = 50

# Lots envoyés en une requête. Le fournisseur accepte plusieurs requêtes à la
# fois ; grouper réduit la latence sans changer le coût.
TAILLE_LOT = 10

# Garde-fou de facturation. Le fournisseur NE BLOQUE PAS au-delà du palier
# gratuit : sa documentation dit que la tâche sera terminée et qu'une facture
# suivra. Le filet est donc de notre côté.
PLAFOND_DEFAUT = 200

DOSSIER_BRUT = Path("data/collecte")


def _client():
    """Client Outscraper. Clé par l'environnement uniquement (D-016)."""
    cle = os.environ.get("OUTSCRAPER_API_KEY", "").strip()
    if not cle:
        raise RuntimeError(
            "OUTSCRAPER_API_KEY absente de l'environnement. "
            "Ajoutez-la dans .env (non versionné) avant de lancer."
        )
    try:
        from outscraper import ApiClient
    except ImportError as e:
        raise RuntimeError("Paquet `outscraper` absent : pip install outscraper") from e
    return ApiClient(api_key=cle)


def _requete(resto: dict) -> str:
    """
    Identifie un restaurant pour le fournisseur.

    L'identifiant de lieu est préféré quand il existe : il désigne l'endroit
    sans ambiguïté, là où « nom + adresse » peut tomber sur un homonyme — le
    défaut exact qui avait attribué 56 fiches au mauvais restaurant (D-036).
    """
    if resto.get("google_place_id"):
        return resto["google_place_id"]
    morceaux = [resto["name"]]
    if resto.get("address"):
        morceaux.append(resto["address"])
    elif resto.get("city"):
        morceaux.append(resto["city"])
    return ", ".join(morceaux)


def _detecter(texte: str) -> str | None:
    """
    Langue d'un avis, ou None si indétectable.

    `langdetect` échoue sur les textes très courts (« Super ! ») et sur les
    suites d'émojis. On rend alors None plutôt qu'une langue au hasard :
    l'indicateur préfère « je ne sais pas » à une valeur inventée (D-012).
    """
    texte = (texte or "").strip()
    if len(texte) < 12:
        return None
    try:
        from langdetect import detect, DetectorFactory
        # Sans graine fixe, `langdetect` rend des résultats différents d'une
        # exécution à l'autre sur un même texte. Un score doit être reproductible.
        DetectorFactory.seed = 0
        return detect(texte)
    except Exception:
        return None


def _avis_du_bloc(bloc) -> list[dict]:
    """
    Extrait les avis d'un bloc de réponse, quelle qu'en soit la forme.

    Le fournisseur a déjà changé la structure de ses réponses une fois. On
    parcourt donc en cherchant les clés utiles plutôt qu'en supposant un chemin.
    """
    trouves: list[dict] = []

    def visiter(x):
        if isinstance(x, dict):
            texte = x.get("review_text") or x.get("text")
            if texte and isinstance(texte, str):
                trouves.append({
                    "review_id": x.get("review_id") or x.get("id"),
                    "text": texte,
                    "rating": x.get("review_rating") or x.get("rating"),
                    "published_at": (
                        x.get("review_datetime_utc")
                        or x.get("date") or x.get("published_at")
                    ),
                })
                return
            for v in x.values():
                visiter(v)
        elif isinstance(x, list):
            for v in x:
                visiter(v)

    visiter(bloc)
    return trouves


def candidats(conn: sqlite3.Connection, zone: str | None, limite: int | None,
              ordre: str = "aleatoire") -> list[dict]:
    """
    Restaurants qui méritent une collecte d'avis.

    On écarte ceux qui en ont déjà : chaque requête se facture.

    L'ORDRE EST ALÉATOIRE, ET C'EST UNE DÉCISION, PAS UN DÉTAIL. Classer par
    nombre d'avis décroissant serait plus efficace — un restaurant à 800 avis
    en a certainement dix avec du texte, un restaurant à 3 risque de rendre une
    requête pour rien. Mais si le budget force à s'arrêter en route, on
    n'obtiendrait la langue QUE pour les restaurants les plus commentés,
    c'est-à-dire les plus touristiques. L'indicateur censé révéler les
    restaurants invisibles serait alors calculé sur les plus visibles : le
    paradoxe de l'invisibilité, réintroduit par la porte de service (D-001).

    Un tirage aléatoire à graine fixe rend un sous-ensemble NON BIAISÉ et
    reproductible : deux exécutions interrompues au même point donnent le même
    échantillon, ce qui est indispensable pour que le résultat soit
    rapportable au mémoire.

    `--ordre frequence` reste disponible pour un test de coût, où l'on veut
    justement maximiser les chances d'obtenir du texte.
    """
    conn.row_factory = sqlite3.Row
    sql = """
        SELECT r.id, r.name, r.address, r.city, r.google_place_id, r.review_count
          FROM restaurants r
         WHERE NOT EXISTS (SELECT 1 FROM reviews v WHERE v.restaurant_id = r.id)
    """
    params: list = []
    if zone:
        sql += " AND r.zone = ?"
        params.append(zone)
    if ordre == "frequence":
        sql += " ORDER BY COALESCE(r.review_count, 0) DESC"
    else:
        # `abs(random())` de SQLite n'est pas reproductible d'une execution a
        # l'autre. On trie donc sur une empreinte stable de l'identifiant :
        # aleatoire vis-a-vis du nombre d'avis, identique a chaque lancement.
        sql += " ORDER BY substr(hex(r.id), -6), r.id"
    if limite:
        sql += " LIMIT ?"
        params.append(limite)
    return [dict(r) for r in conn.execute(sql, params)]


def recolter(conn: sqlite3.Connection, zone: str = None, limite: int = None,
             a_blanc: bool = False, langue: str = None, region: str = "FR",
             plafond: int = PLAFOND_DEFAUT, ordre: str = "aleatoire") -> dict:
    """Récolte les avis et les range dans la table `reviews`."""
    if langue is None:
        langue = config.TARGET_LANGUAGE

    restos = candidats(conn, zone, limite, ordre)
    if len(restos) > plafond:
        print(f"[Avis] {len(restos)} candidats — PLAFONNE a {plafond} "
              f"(garde-fou de facturation, --plafond pour le lever)")
        restos = restos[:plafond]

    print(f"[Avis] {len(restos)} restaurants, {AVIS_PAR_RESTAURANT} avis demandes chacun")
    if a_blanc:
        print("[Avis] A BLANC — aucune requete, aucune ecriture")
        for r in restos[:10]:
            print(f"   {r['name'][:34]:36s} {r.get('review_count') or 0:>5} avis connus")
        return {"restaurants": len(restos), "avis": 0, "a_blanc": True}

    if not restos:
        return {"restaurants": 0, "avis": 0, "a_blanc": False}

    client = _client()
    DOSSIER_BRUT.mkdir(parents=True, exist_ok=True)
    horodatage = datetime.now().strftime("%Y%m%d-%H%M%S")
    brut_total: list = []

    total_avis = 0
    sans_avis = 0
    langues: dict[str, int] = {}

    for debut in range(0, len(restos), TAILLE_LOT):
        lot = restos[debut:debut + TAILLE_LOT]
        print(f"  lot {debut // TAILLE_LOT + 1} — {len(lot)} restaurants…")

        try:
            reponses = client.google_maps_reviews(
                [_requete(r) for r in lot],
                reviews_limit=AVIS_PAR_RESTAURANT,
                limit=1,
                sort="newest",
                ignore_empty=True,
                language=langue,
                region=region,
            )
        except Exception as e:
            print(f"   [ERREUR] {type(e).__name__}: {e}")
            print("   Lot abandonne, on poursuit.")
            continue

        brut_total.append({"restaurants": [r["id"] for r in lot], "reponse": reponses})

        # LA REPONSE BRUTE EST ECRITE AVANT TOUT IMPORT : une requete facturee
        # ne doit jamais etre perdue a cause d'un defaut de parseur.
        chemin = DOSSIER_BRUT / f"avis-{zone or 'tous'}-{horodatage}.json"
        chemin.write_text(
            json.dumps(brut_total, ensure_ascii=False, indent=1), encoding="utf-8"
        )

        for resto, bloc in zip(lot, reponses if isinstance(reponses, list) else [reponses]):
            avis = _avis_du_bloc(bloc)
            if not avis:
                sans_avis += 1
                continue

            lignes = []
            for a in avis:
                code = _detecter(a["text"])
                langues[code or "indetectable"] = langues.get(code or "indetectable", 0) + 1
                lignes.append((
                    resto["id"], a["review_id"], a["text"], code,
                    a["rating"], a["published_at"], "outscraper",
                ))

            conn.executemany("""
                INSERT OR IGNORE INTO reviews
                    (restaurant_id, review_id, text, lang, rating, published_at, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, lignes)
            conn.commit()
            total_avis += len(lignes)

            part = sum(1 for l in lignes if l[3] == langue) / len(lignes)
            print(f"   {resto['name'][:30]:32s} {len(lignes):>3} avis  "
                  f"{part * 100:>3.0f} % en {langue}")

    return {
        "restaurants": len(restos),
        "avec_avis": len(restos) - sans_avis,
        "sans_avis": sans_avis,
        "avis": total_avis,
        "langues": langues,
        "a_blanc": False,
        "brut": str(chemin) if brut_total else None,
    }


def main() -> None:
    analyseur = argparse.ArgumentParser(
        description="Recolte le texte des avis pour activer l'indicateur langue (LS-01)."
    )
    analyseur.add_argument("--zone", default=None)
    analyseur.add_argument("--limite", type=int, default=None)
    analyseur.add_argument("--plafond", type=int, default=PLAFOND_DEFAUT)
    analyseur.add_argument("--ordre", choices=["aleatoire", "frequence"],
                           default="aleatoire",
                           help="aleatoire : echantillon non biaise (defaut). "
                                "frequence : les plus commentes d'abord, pour un test de cout.")
    analyseur.add_argument("--a-blanc", action="store_true",
                           help="montre les candidats sans consommer une requete")
    args = analyseur.parse_args()

    conn = sqlite3.connect(config.DB_PATH)
    try:
        res = recolter(conn, zone=args.zone, limite=args.limite,
                       a_blanc=args.a_blanc, plafond=args.plafond,
                       ordre=args.ordre)
    except RuntimeError as e:
        print(f"[ERREUR] {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    mode = " (A BLANC — rien consomme)" if res.get("a_blanc") else ""
    print()
    print("=" * 62 + mode)
    print(f"  restaurants interroges : {res['restaurants']}")
    if not res.get("a_blanc"):
        print(f"  avec au moins un avis  : {res.get('avec_avis', 0)}")
        print(f"  sans aucun avis texte  : {res.get('sans_avis', 0)}")
        print(f"  avis enregistres       : {res['avis']}")
        if res.get("langues"):
            print()
            print("  langues detectees :")
            for code, n in sorted(res["langues"].items(), key=lambda x: -x[1])[:8]:
                print(f"    {n:>5d}  {code}")
        if res.get("brut"):
            print()
            print(f"  reponse brute conservee : {res['brut']}")
    print("=" * 62)
    if not res.get("a_blanc") and res["avis"]:
        print()
        print("Etape suivante — recalculer les scores :")
        print("  python -m backend.ingestion.osm.load quartier-latin --score-only")


if __name__ == "__main__":
    main()
