# backend/ingestion/web/og_image.py
#
# PHOTOS DE RESTAURANT DEPUIS LEUR PROPRE SITE (LS-03).
#
# 427 restaurants sur 10 686 ont une photo, toutes issues du collecteur payant
# et concentrées sur la zone témoin. Or 3 373 restaurants ont un site web sans
# photo chez nous — et ces sites publient presque tous une balise `og:image`.
#
# CE QU'EST `og:image`, ET POURQUOI CE N'EST PAS DU SCRAPING AGRESSIF. C'est
# une balise qu'un site pose EXPRÈS pour dire « voici l'image à afficher quand
# on partage cette page ». C'est ce que lisent Facebook, WhatsApp, Slack ou
# Signal quand on colle un lien. Lire une méta-donnée publique posée pour être
# lue n'est pas contourner quoi que ce soit : aucun déguisement, aucun
# contournement, un agent identifiable et le `robots.txt` respecté.
#
# RENDEMENT MESURÉ AVANT D'ÊTRE PROMIS. Sur 40 sites tirés au hasard : 50 % de
# balises trouvées, et ~37 % après filtrage des logos et des URL cassées. Le
# filtrage n'est pas cosmétique — l'échantillon contenait un logo SVG et une
# URL littérale `[object Object]`, produite par un bogue du site lui-même.
#
# ON STOCKE L'URL, JAMAIS L'IMAGE (D-021, D-025). Même règle que pour les
# cartes : elle reste chez son hébergeur et ne transite pas par nos serveurs.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.ingestion.web.og_image --limite 50 --a-blanc
#     python -m backend.ingestion.web.og_image

import argparse
import re
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.robotparser import RobotFileParser

from backend import config

# Agent identifiable : un site doit pouvoir savoir qui l'interroge, et nous
# joindre. C'est la contrepartie minimale de la lecture automatisée.
AGENT = "LocalSignalBot/1.0 (projet de memoire HETIC; lecture de og:image)"

EN_TETES = {
    "User-Agent": AGENT,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr,en;q=0.8",
}

DELAI_S = 10

# Au-delà, on cesse de lire : `og:image` vit dans le `<head>`, et télécharger
# une page entière pour une balise des premiers kilo-octets serait grossier
# autant qu'inutile.
LECTURE_MAX_OCTETS = 400_000

# Une vignette de moins de 10 ko est presque toujours un logo ou un pictogramme.
TAILLE_MIN_OCTETS = 10_000

# Types acceptés. Le SVG est écarté : c'est un logo dans la quasi-totalité des
# cas, jamais une photo de salle ou de plat.
TYPES_ACCEPTES = ("image/jpeg", "image/jpg", "image/png", "image/webp")

_OG = re.compile(
    rb'<meta[^>]+(?:property|name)\s*=\s*["\']'
    rb'(?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["\'][^>]*>',
    re.I,
)
_CONTENU = re.compile(rb'content\s*=\s*["\']([^"\']+)["\']', re.I)

# Valeurs manifestement invalides rencontrées en conditions réelles.
_ABERRANTES = ("[object object]", "undefined", "null", "none", "false")

_robots_cache: dict[str, RobotFileParser | None] = {}
_verrou_robots = threading.Lock()


def _origine(url: str) -> str:
    p = urllib.parse.urlparse(url)
    return f"{p.scheme}://{p.netloc}"


def robots_autorise(url: str) -> bool:
    """
    Le `robots.txt` du site autorise-t-il cette lecture ?

    Un site injoignable ou sans `robots.txt` est considéré comme autorisant :
    c'est la convention, et refuser par défaut reviendrait à ne rien lire.
    """
    origine = _origine(url)
    with _verrou_robots:
        if origine in _robots_cache:
            lecteur = _robots_cache[origine]
        else:
            lecteur = RobotFileParser()
            lecteur.set_url(f"{origine}/robots.txt")
            try:
                lecteur.read()
            except Exception:
                lecteur = None
            _robots_cache[origine] = lecteur

    if lecteur is None:
        return True
    try:
        return lecteur.can_fetch(AGENT, url)
    except Exception:
        return True


def normaliser(site: str) -> str:
    site = (site or "").strip()
    if not site:
        return ""
    if not site.startswith(("http://", "https://")):
        site = "https://" + site
    return site


def extraire_og(site: str) -> str | None:
    """URL de l'image déclarée par la page, ou None."""
    try:
        requete = urllib.request.Request(site, headers=EN_TETES)
        with urllib.request.urlopen(requete, timeout=DELAI_S) as reponse:
            if "html" not in (reponse.headers.get("Content-Type") or ""):
                return None
            html = reponse.read(LECTURE_MAX_OCTETS)
            page_finale = reponse.geturl()
    except Exception:
        return None

    trouvee = _OG.search(html)
    if not trouvee:
        return None
    contenu = _CONTENU.search(trouvee.group(0))
    if not contenu:
        return None

    url = contenu.group(1).decode("utf-8", "replace").strip()
    if not url or url.lower() in _ABERRANTES:
        return None

    # Une URL relative se résout contre la page RÉELLEMENT servie, après
    # redirections — sinon elle pointe dans le vide.
    return urllib.parse.urljoin(page_finale, url)


def image_valable(url: str) -> tuple[bool, str]:
    """
    L'URL rend-elle vraiment une photo exploitable ?

    Une requête `HEAD` suffit : on veut le type et la taille, pas l'image. Ne
    rien vérifier laisserait passer les logos SVG et les URL cassées que
    l'échantillon a révélés.
    """
    try:
        requete = urllib.request.Request(url, headers={"User-Agent": AGENT}, method="HEAD")
        with urllib.request.urlopen(requete, timeout=DELAI_S) as reponse:
            type_mime = (reponse.headers.get("Content-Type") or "").split(";")[0].lower()
            taille = reponse.headers.get("Content-Length")
    except Exception as e:
        return False, f"inaccessible ({type(e).__name__})"

    if type_mime not in TYPES_ACCEPTES:
        return False, f"type {type_mime or 'inconnu'}"
    if taille and int(taille) < TAILLE_MIN_OCTETS:
        return False, f"trop petite ({int(taille) // 1024} ko)"
    return True, "ok"


def traiter(ligne: dict) -> dict:
    """Chaîne complète pour un restaurant."""
    site = normaliser(ligne["website"])
    if not site:
        return {**ligne, "url": None, "motif": "sans site"}

    if not robots_autorise(site):
        return {**ligne, "url": None, "motif": "robots.txt refuse"}

    url = extraire_og(site)
    if not url:
        return {**ligne, "url": None, "motif": "aucune balise"}

    valable, motif = image_valable(url)
    return {**ligne, "url": url if valable else None, "motif": motif}


def candidats(conn: sqlite3.Connection, zone: str | None, limite: int | None) -> list[dict]:
    """Restaurants qui ont un site web mais pas encore de photo."""
    sql = """
        SELECT id, name, website FROM restaurants
         WHERE website IS NOT NULL AND trim(website) <> ''
           AND (photo_url IS NULL OR trim(photo_url) = '')
    """
    params: list = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)
    sql += " ORDER BY local_signal DESC NULLS LAST"
    if limite:
        sql += " LIMIT ?"
        params.append(limite)

    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params)]


def main() -> None:
    analyseur = argparse.ArgumentParser(
        description="Recolte les photos declarees par les sites des restaurants (LS-03)."
    )
    analyseur.add_argument("--zone", default=None)
    analyseur.add_argument("--limite", type=int, default=None)
    analyseur.add_argument("--parallele", type=int, default=8,
                           help="requetes simultanees — rester modeste par politesse")
    analyseur.add_argument("--a-blanc", action="store_true",
                           help="montre ce qui serait ecrit sans rien ecrire")
    args = analyseur.parse_args()

    conn = sqlite3.connect(config.DB_PATH)
    lignes = candidats(conn, args.zone, args.limite)
    print(f"[og:image] {len(lignes)} restaurants avec un site et sans photo")
    if not lignes:
        return

    depart = time.monotonic()
    trouvees = rejetees = vides = 0
    motifs: dict[str, int] = {}

    with ThreadPoolExecutor(max_workers=args.parallele) as executeur:
        futurs = {executeur.submit(traiter, l): l for l in lignes}
        for i, futur in enumerate(as_completed(futurs), 1):
            r = futur.result()
            motifs[r["motif"]] = motifs.get(r["motif"], 0) + 1

            if r["url"]:
                trouvees += 1
                if not args.a_blanc:
                    conn.execute(
                        "UPDATE restaurants SET photo_url = ? WHERE id = ?",
                        (r["url"], r["id"]),
                    )
                if trouvees <= 8:
                    print(f"  ok {r['name'][:30]:32s} {r['url'][:58]}")
            elif r["motif"] == "aucune balise":
                vides += 1
            else:
                rejetees += 1

            if i % 200 == 0:
                print(f"  ... {i}/{len(lignes)} — {trouvees} trouvees")

    if not args.a_blanc:
        conn.commit()
    conn.close()

    duree = (time.monotonic() - depart) / 60
    print()
    print("=" * 62 + (" (A BLANC — rien ecrit)" if args.a_blanc else ""))
    print(f"  candidats            : {len(lignes)}")
    print(f"  photos retenues      : {trouvees}  ({100 * trouvees / len(lignes):.0f} %)")
    print(f"  sans balise          : {vides}")
    print(f"  balise mais rejetee  : {rejetees}")
    print(f"  duree                : {duree:.1f} min")
    print()
    print("  detail des motifs :")
    for motif, n in sorted(motifs.items(), key=lambda x: -x[1]):
        print(f"    {n:>5d}  {motif}")
    print("=" * 62)


if __name__ == "__main__":
    main()
