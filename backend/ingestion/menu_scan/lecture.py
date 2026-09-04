# backend/ingestion/menu_scan/lecture.py
#
# LECTURE DES CARTES COLLECTÉES (D-004, D-031).
#
# Prend les URL de photos rangées en base par la collecte, télécharge chaque
# image, la fait lire par le modèle de vision, puis AGRÈGE les pages d'une même
# carte en une observation unique.
#
# CE QUI EST STOCKÉ, ET CE QUI NE L'EST PAS. Les images sont téléchargées en
# mémoire, analysées, puis JETÉES. Seules les observations dérivées entrent en
# base — cuisines, nombre de plats, langues, ratio vernaculaire. Aucune photo
# n'est conservée ni réaffichée (D-021, D-025).
#
# LE MODÈLE OBSERVE, IL NE JUGE PAS (D-014). Il ne lui est jamais demandé si un
# restaurant est authentique : il compte des plats et relève des langues. Le
# score est ensuite calculé par du code déterministe, ce qui le rend
# reproductible, auditable et calibrable — trois propriétés qu'une note rendue
# directement par un modèle n'aurait pas.
#
# PARALLÉLISME. Les pages d'un même restaurant sont lues simultanément, et
# plusieurs restaurants sont traités de front. Les écritures en base et
# l'affichage sont sérialisés par des verrous : SQLite n'aime pas les écritures
# concurrentes, et des lignes de journal entrelacées sont illisibles.

import argparse
import io
import json
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from PIL import Image

from backend import config
from backend.core.scoring.menu_score import score_menu
from backend.db import repository as repo
from backend.ingestion.menu_scan.agregation import agreger
from backend.ingestion.menu_scan.client import analyze_menu_image

# Au-delà, l'image n'est probablement pas une carte, et la charger coûterait
# plus qu'elle ne rapporte.
TAILLE_MAX_OCTETS = 12 * 1024 * 1024

# Côté le plus long, en pixels, avant envoi au modèle.
#
# Le collecteur rend les photos en 2048 px. À cette taille, une seule image
# dépasse la limite de jetons par minute du palier gratuit : « Request too
# large ». Or une carte se lit parfaitement à 1024 px — le texte d'un menu est
# gros, ce n'est pas de la reconnaissance de manuscrit.
#
# Réduire divise les jetons d'image par environ quatre. C'est ce qui rend la
# lecture des 334 cartes possible sans palier payant.
COTE_MAX_PX = 1024

# Qualité JPEG après réduction. 85 est le seuil au-delà duquel l'œil ne
# distingue plus, et le modèle encore moins.
QUALITE_JPEG = 85

# Reprises sur limite de débit, et attente de base entre deux essais.
TENTATIVES_MAX = 4
ATTENTE_INITIALE_S = 20

_verrou_base = threading.Lock()
_verrou_sortie = threading.Lock()


def _log(message: str) -> None:
    with _verrou_sortie:
        print(message, flush=True)


def _telecharger(url: str) -> bytes | None:
    """Rapporte les octets de l'image, ou None si elle est hors d'atteinte."""
    try:
        rep = requests.get(url, timeout=30, stream=True)
        rep.raise_for_status()
        data = rep.raw.read(TAILLE_MAX_OCTETS + 1, decode_content=True)
    except Exception:
        return None
    if not data or len(data) > TAILLE_MAX_OCTETS:
        return None
    return data


def _reduire(image: bytes) -> bytes:
    """
    Ramène l'image à `COTE_MAX_PX` sur son côté le plus long.

    Une image trop grande est refusée par le fournisseur avant même d'être
    analysée. La réduction est donc une condition de fonctionnement, pas une
    optimisation.

    En cas d'échec de décodage, l'image d'origine est renvoyée : mieux vaut
    tenter l'appel que perdre la carte sur un format exotique.
    """
    try:
        img = Image.open(io.BytesIO(image))
        img.load()
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        if max(img.size) > COTE_MAX_PX:
            img.thumbnail((COTE_MAX_PX, COTE_MAX_PX), Image.LANCZOS)
        sortie = io.BytesIO()
        img.save(sortie, format="JPEG", quality=QUALITE_JPEG, optimize=True)
        return sortie.getvalue()
    except Exception:
        return image


def _lire_page(url: str, provider: str | None):
    """
    Télécharge, réduit, et fait analyser une page.

    Reprend sur limite de débit. Le palier gratuit plafonne la sortie à
    1000 jetons par minute pour toute l'organisation : en traitement de lot on
    la touche forcément. Sans cette reprise, un refus PASSAGER marquerait la
    carte illisible de façon DÉFINITIVE, le module ne repassant jamais sur un
    restaurant déjà enregistré.
    """
    image = _telecharger(url)
    if image is None:
        return None
    image = _reduire(image)

    for tentative in range(TENTATIVES_MAX):
        try:
            return analyze_menu_image(image, "carte.jpg", provider=provider)
        except Exception as e:
            limite = "429" in str(e) or "rate_limit" in str(e).lower()
            if not limite or tentative == TENTATIVES_MAX - 1:
                return None
            # Attente croissante : la limite se libère à la minute.
            time.sleep(ATTENTE_INITIALE_S * (tentative + 1))
    return None


def lire_restaurant(resto: dict, provider: str | None, pages_paralleles: int) -> dict:
    """
    Lit toutes les pages d'un restaurant et enregistre l'observation agrégée.
    """
    nom = resto["name"]
    try:
        urls = json.loads(resto["menu_photo_urls"] or "[]")
    except json.JSONDecodeError:
        urls = []

    if not urls:
        return {"statut": "sans_photo", "nom": nom}

    # Les pages d'une même carte sont indépendantes : on les lit de front.
    analyses = []
    with ThreadPoolExecutor(max_workers=pages_paralleles) as pool:
        futurs = {pool.submit(_lire_page, u, provider): u for u in urls}
        for f in as_completed(futurs):
            r = f.result()
            if r is not None:
                analyses.append(r)

    if not analyses:
        _log(f"  x  {nom[:32]:34s} aucune page exploitable")
        return {"statut": "echec", "nom": nom}

    agregee = agreger(analyses)
    signal = agregee.to_menu_signal() if agregee else None

    if signal is None:
        # Carte illisible. On enregistre quand même : sans trace, on la
        # retenterait indéfiniment, et l'échec est lui-même une information.
        with _verrou_base:
            repo.save_menu_scan(resto["id"], f"vision-{provider or config.VISION_PROVIDER}",
                                agregee.model_dump() if agregee else {},
                                None, False, source_url=urls[0])
        _log(f"  x  {nom[:32]:34s} illisible ({len(analyses)} page(s) lues)")
        return {"statut": "illisible", "nom": nom}

    note = score_menu(signal)

    with _verrou_base:
        repo.save_menu_scan(resto["id"], f"vision-{provider or config.VISION_PROVIDER}",
                            agregee.model_dump(), note["score"], True,
                            source_url=urls[0])

    _log(f"  ok {nom[:32]:34s} {agregee.dish_count:3d} plats · "
         f"{'/'.join(agregee.cuisines)[:20]:22s} · menu {note['score']:.2f} "
         f"({len(analyses)} page(s))")
    return {"statut": "lu", "nom": nom, "score": note["score"],
            "plats": agregee.dish_count}


def lire_zone(zone: str, limite: int | None, provider: str | None,
              restaurants_paralleles: int, pages_paralleles: int) -> dict:
    """Lit les cartes de tous les restaurants d'une zone qui en ont une."""
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row

    # On ne relit jamais un restaurant déjà lu : chaque page coûte un appel.
    sql = """
        SELECT r.id, r.name, r.menu_photo_urls
          FROM restaurants r
         WHERE r.zone = ?
           AND r.menu_photo_urls IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM menus m
                            WHERE m.restaurant_id = r.id
                              AND m.provider LIKE 'vision-%')
         ORDER BY r.name
    """
    params = [zone]
    if limite:
        sql += " LIMIT ?"
        params.append(limite)

    restos = [dict(r) for r in conn.execute(sql, params)]
    conn.close()

    total_pages = sum(len(json.loads(r["menu_photo_urls"] or "[]")) for r in restos)
    print(f"[Lecture] {len(restos)} restaurants a lire, {total_pages} pages au total.")
    print(f"[Lecture] fournisseur : {provider or config.VISION_PROVIDER}\n")

    if not restos:
        return {}

    compteurs = {"lu": 0, "illisible": 0, "echec": 0, "sans_photo": 0}
    plats = []

    with ThreadPoolExecutor(max_workers=restaurants_paralleles) as pool:
        futurs = [pool.submit(lire_restaurant, r, provider, pages_paralleles)
                  for r in restos]
        for f in as_completed(futurs):
            try:
                res = f.result()
            except Exception as e:
                _log(f"  x  erreur inattendue : {type(e).__name__}: {e}")
                compteurs["echec"] += 1
                continue
            compteurs[res["statut"]] = compteurs.get(res["statut"], 0) + 1
            if res.get("plats"):
                plats.append(res["plats"])

    compteurs["plats_median"] = sorted(plats)[len(plats) // 2] if plats else 0
    return compteurs


def main():
    parser = argparse.ArgumentParser(
        description="Lit les cartes collectees et remplit l'indicateur menu (D-031).",
    )
    parser.add_argument("--zone", default="quartier-latin")
    parser.add_argument("--limit", type=int, default=None,
                        help="nombre de restaurants a traiter — borne la depense")
    parser.add_argument("--provider", choices=["groq", "claude"], default=None)
    parser.add_argument("--workers", type=int, default=3,
                        help="restaurants traites de front")
    parser.add_argument("--page-workers", type=int, default=3,
                        help="pages lues de front par restaurant")
    args = parser.parse_args()

    try:
        c = lire_zone(args.zone, args.limit, args.provider,
                      args.workers, args.page_workers)
    except KeyboardInterrupt:
        print("\n[Lecture] interrompue — les cartes deja lues sont en base.")
        sys.exit(1)

    if not c:
        print("Rien a lire : aucune carte en attente dans cette zone.")
        return

    print(f"\n{'='*62}")
    print(f"  cartes lues        : {c.get('lu', 0)}")
    print(f"  illisibles         : {c.get('illisible', 0)}")
    print(f"  echecs reseau      : {c.get('echec', 0)}")
    print(f"  mediane des plats  : {c.get('plats_median', 0)}")
    print(f"{'='*62}")
    print("\nEtape suivante — recalculer les scores :")
    print(f"  python -m backend.ingestion.osm.load {args.zone} --score-only")


if __name__ == "__main__":
    main()
