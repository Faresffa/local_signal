# backend/ingestion/menu_scan/lecture_locale.py
#
# LECTURE DES CARTES, ENTIÈREMENT EN LOCAL (D-032).
#
#     photo   →  OCR RapidOCR         →  texte          hors ligne, illimité
#     texte   →  code déterministe    →  4 observations reproductibles
#     texte   →  modèle local Ollama  →  2 observations sémantiques
#
# POURQUOI CETTE VOIE REMPLACE L'ENVOI D'IMAGES. Le palier gratuit distant
# plafonne à 200 000 jetons par jour et une image de carte en consomme 2 950 :
# 68 pages quotidiennes, donc seize jours pour les 1 120 pages du Quartier
# latin. En local, ni quota ni facture, et le tout tient en une à deux heures.
#
# UN APPEL DE MODÈLE PAR RESTAURANT, PAS PAR PAGE. L'OCR relève chaque page
# séparément, puis les textes sont CONCATÉNÉS avant l'appel sémantique. Les
# cinq pages d'une carte sont une seule carte (D-031) : les analyser séparément
# rendrait cinq cuisines pour un seul restaurant. On passe ainsi de 1 120
# appels à 318.
#
# TOUT CE QUI EST OBTENU EST CONSERVÉ. Le texte OCR entre en base, même s'il
# n'alimente aucun indicateur aujourd'hui : ce qui ne sert pas maintenant peut
# fonder un indicateur demain, permettre de recalibrer sans retraiter les
# images, ou constituer une preuve. La base de menus structurés est l'actif du
# projet (CLAUDE.md §3).
#
# Les IMAGES, elles, ne sont jamais conservées — œuvres de leurs auteurs
# (D-021, D-025). Le texte qu'on en tire est un fait, il se garde.

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
from backend.ingestion.menu_scan.ocr_local import (
    dedupliquer_pages, observations_deterministes,
)
from backend.ingestion.menu_scan.providers import ollama_provider

TAILLE_MAX_OCTETS = 12 * 1024 * 1024

# L'OCR travaille mieux sur une image nette et pas trop lourde. 1600 px est un
# compromis : au-delà le gain de reconnaissance est nul et le temps augmente,
# en dessous les petits caractères d'une description se perdent.
COTE_MAX_PX = 1600

_verrou_base = threading.Lock()
_verrou_sortie = threading.Lock()
_verrou_ocr = threading.Lock()
_ocr = None


def _log(message: str) -> None:
    with _verrou_sortie:
        print(message, flush=True)


def _moteur_ocr():
    """
    Instance unique du moteur OCR.

    Il charge ses modèles ONNX au premier appel — quelques secondes. Le
    partager entre les fils évite de payer ce coût pour chaque page.
    """
    global _ocr
    with _verrou_ocr:
        if _ocr is None:
            from rapidocr_onnxruntime import RapidOCR
            _ocr = RapidOCR()
        return _ocr


def _telecharger(url: str) -> bytes | None:
    try:
        rep = requests.get(url, timeout=30, stream=True)
        rep.raise_for_status()
        data = rep.raw.read(TAILLE_MAX_OCTETS + 1, decode_content=True)
    except Exception:
        return None
    return data if data and len(data) <= TAILLE_MAX_OCTETS else None


def _preparer(image: bytes) -> bytes:
    """Normalise l'image pour l'OCR. En cas d'échec, rend l'originale."""
    try:
        img = Image.open(io.BytesIO(image))
        img.load()
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        if max(img.size) > COTE_MAX_PX:
            img.thumbnail((COTE_MAX_PX, COTE_MAX_PX), Image.LANCZOS)
        sortie = io.BytesIO()
        img.save(sortie, format="JPEG", quality=90)
        return sortie.getvalue()
    except Exception:
        return image


def _ocr_page(url: str) -> list[str]:
    """Relève le texte d'une page. Liste vide si la page est hors d'atteinte."""
    brut = _telecharger(url)
    if brut is None:
        return []
    image = _preparer(brut)
    try:
        resultat, _ = _moteur_ocr()(image)
    except Exception:
        return []
    return [x[1] for x in resultat] if resultat else []


def lire_restaurant(resto: dict, modele: str | None) -> dict:
    """
    Relève, agrège et analyse la carte d'un restaurant.

    Les pages sont lues séparément par l'OCR puis concaténées : c'est une seule
    carte, elle doit produire une seule observation (D-031).
    """
    nom = resto["name"]
    try:
        urls = json.loads(resto["menu_photo_urls"] or "[]")
    except json.JSONDecodeError:
        urls = []
    if not urls:
        return {"statut": "sans_photo", "nom": nom}

    # Chaque page est relevee separement, puis les doublons sont ecartes :
    # plusieurs clients photographient souvent LA MEME page, et concatener sans
    # verifier doublerait le nombre de plats (D-032).
    pages = [_ocr_page(u) for u in urls]
    distinctes = dedupliquer_pages(pages)
    ecartees = len([p for p in pages if p]) - len(distinctes)

    lignes: list[str] = []
    for page in distinctes:
        lignes.extend(page)

    if not lignes:
        _log(f"  x  {nom[:30]:32s} OCR muet sur {len(urls)} page(s)")
        return {"statut": "echec", "nom": nom}

    det = observations_deterministes(lignes)
    texte = det.pop("texte")

    # Un seul appel sémantique, sur le texte de TOUTES les pages réunies.
    sem = ollama_provider.analyser_texte(texte, modele=modele) or {}

    observations = {
        "cuisines": sem.get("cuisines", []),
        "dish_count": det["dish_count"],
        # La langue vient du modèle : la détection statistique échoue sur une
        # carte, qui est une liste de syntagmes nominaux et non de la prose.
        "languages": sem.get("languages") or det["languages"],
        "vernacular_ratio": sem.get("vernacular_ratio", 0.0),
        "has_tourist_menu": det["has_tourist_menu"],
        "has_dish_photos": det["has_dish_photos"],
    }

    # Une carte sans plat compté ET sans cuisine reconnue n'est pas une carte.
    lisible = observations["dish_count"] > 0 or bool(observations["cuisines"])
    note = score_menu(observations) if lisible else {"score": None}

    with _verrou_base:
        _enregistrer(resto["id"], observations, note["score"], lisible,
                     urls[0], texte, len(lignes))

    if not lisible:
        _log(f"  x  {nom[:30]:32s} illisible ({len(lignes)} lignes relevees)")
        return {"statut": "illisible", "nom": nom}

    doublons = f" ({ecartees} page(s) en double ecartee(s))" if ecartees else ""
    _log(f"  ok {nom[:30]:32s} {observations['dish_count']:3d} plats · "
         f"{'/'.join(observations['cuisines'])[:18]:20s} · "
         f"vern {observations['vernacular_ratio']:.2f} · menu {note['score']:.2f}{doublons}")
    return {"statut": "lu", "nom": nom, "score": note["score"],
            "plats": observations["dish_count"]}


def _enregistrer(restaurant_id, observations, note, lisible, source, texte, n_lignes):
    """Écrit l'observation ET le texte brut relevé."""
    conn = repo.get_connection() if hasattr(repo, "get_connection") else sqlite3.connect(config.DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO menus (restaurant_id, provider, observations_json, menu_score,
                           readable, source_url, ocr_text, ocr_lines)
        VALUES (?,?,?,?,?,?,?,?)
    """, (restaurant_id, "ocr-local", json.dumps(observations, ensure_ascii=False),
          note, int(lisible), source, texte, n_lignes))
    conn.commit()
    conn.close()


def lire_zone(zone: str, limite: int | None, modele: str | None, workers: int) -> dict:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    sql = """
        SELECT r.id, r.name, r.menu_photo_urls
          FROM restaurants r
         WHERE r.zone = ?
           AND r.menu_photo_urls IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM menus m
                            WHERE m.restaurant_id = r.id
                              AND (m.provider LIKE 'vision-%' OR m.provider = 'ocr-local'))
         ORDER BY r.name
    """
    params = [zone]
    if limite:
        sql += " LIMIT ?"
        params.append(limite)
    restos = [dict(r) for r in conn.execute(sql, params)]
    conn.close()

    pages = sum(len(json.loads(r["menu_photo_urls"] or "[]")) for r in restos)
    print(f"[Local] {len(restos)} restaurants, {pages} pages a relever.")
    print(f"[Local] modele : {modele or config.OLLAMA_MODEL}\n")
    if not restos:
        return {}

    compteurs, plats = {}, []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futurs = [pool.submit(lire_restaurant, r, modele) for r in restos]
        for f in as_completed(futurs):
            try:
                res = f.result()
            except Exception as e:
                _log(f"  x  erreur inattendue : {type(e).__name__}: {e}")
                compteurs["echec"] = compteurs.get("echec", 0) + 1
                continue
            compteurs[res["statut"]] = compteurs.get(res["statut"], 0) + 1
            if res.get("plats"):
                plats.append(res["plats"])

    compteurs["plats_median"] = sorted(plats)[len(plats) // 2] if plats else 0
    return compteurs


def main():
    parser = argparse.ArgumentParser(
        description="Lit les cartes en local : OCR + modele Ollama (D-032).")
    parser.add_argument("--zone", default="quartier-latin")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--workers", type=int, default=2,
                        help="restaurants traites de front")
    args = parser.parse_args()

    if not ollama_provider.disponible():
        print("[ERREUR] Serveur Ollama injoignable. Lancez `ollama serve`.",
              file=sys.stderr)
        sys.exit(1)

    debut = time.time()
    try:
        c = lire_zone(args.zone, args.limit, args.model, args.workers)
    except KeyboardInterrupt:
        print("\n[Local] interrompu — les cartes deja lues sont en base.")
        sys.exit(1)

    if not c:
        print("Rien a lire dans cette zone.")
        return

    print(f"\n{'='*62}")
    print(f"  cartes lues       : {c.get('lu', 0)}")
    print(f"  illisibles        : {c.get('illisible', 0)}")
    print(f"  echecs            : {c.get('echec', 0)}")
    print(f"  mediane des plats : {c.get('plats_median', 0)}")
    print(f"  duree             : {(time.time()-debut)/60:.1f} min")
    print(f"{'='*62}")
    print("\nEtape suivante — recalculer les scores :")
    print(f"  python -m backend.ingestion.osm.load {args.zone} --score-only")


if __name__ == "__main__":
    main()
