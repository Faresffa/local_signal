"""
Exporte les données de la base locale pour la vidéo 3D (public/data/*.json).

À lancer depuis la racine du dépôt :
    python apps/video/capture/export_data.py

- paris.json      : un point par restaurant (coordonnées en km autour du centre
                    de Paris, Local Signal sur 100, nombre d'avis Google).
- sites.json      : sites touristiques.
- candidates.json : restaurants susceptibles d'apparaître à l'écran. La
                    sélection finale (fetch_photos.mjs) ne garde QUE ceux dont
                    la photo a réellement été récupérée.
"""
import json
import math
import os
import sqlite3

LAT0, LNG0 = 48.8566, 2.3522
KX = math.cos(math.radians(LAT0)) * 111.32
KY = 110.57
OUT = os.path.join("apps", "video", "public", "data")
os.makedirs(OUT, exist_ok=True)


def xy(lat, lng):
    return round((lng - LNG0) * KX, 4), round(-(lat - LAT0) * KY, 4)


c = sqlite3.connect("local_signal.db")
c.row_factory = sqlite3.Row

seen, points = set(), []
for r in c.execute(
    "select id, lat, lng, local_signal, review_count from restaurants "
    "where lat is not null and lng is not null"
):
    if r["id"] in seen:
        continue
    seen.add(r["id"])
    x, z = xy(r["lat"], r["lng"])
    if abs(x) > 9 or abs(z) > 7:
        continue
    ls = None if r["local_signal"] is None else round(r["local_signal"], 1)
    points.append([x, z, ls, r["review_count"] or 0])

with open(os.path.join(OUT, "paris.json"), "w", encoding="utf8") as f:
    json.dump(points, f, separators=(",", ":"))

sites, seen_sites = [], set()
for r in c.execute("select name, lat, lng from tourist_sites"):
    x, z = xy(r["lat"], r["lng"])
    if abs(x) > 9 or abs(z) > 7 or (x, z) in seen_sites:
        continue
    seen_sites.add((x, z))
    sites.append([x, z, r["name"]])
with open(os.path.join(OUT, "sites.json"), "w", encoding="utf8") as f:
    json.dump(sites, f, ensure_ascii=False, separators=(",", ":"))

cands = []
for r in c.execute(
    "select id, name, cuisine, lat, lng, local_signal, confidence, photo_ref "
    "from restaurants where zone = 'quartier-latin' and local_signal >= 78 "
    "and confidence >= 0.6 order by local_signal desc limit 40"
):
    x, z = xy(r["lat"], r["lng"])
    cands.append({
        "id": r["id"], "name": r["name"], "cuisine": r["cuisine"],
        "score": round(r["local_signal"] / 10, 1), "x": x, "z": z,
        "has_ref": bool((r["photo_ref"] or "").strip()),
    })
with open(os.path.join(OUT, "candidates.json"), "w", encoding="utf8") as f:
    json.dump(cands, f, ensure_ascii=False, indent=1)

# Contrôle d'une affirmation de la vidéo : les restaurants très commentés
# sont-ils plus proches des sites touristiques que les autres ?
def near(x, z):
    return min(math.hypot(x - sx, z - sz) for sx, sz, _ in sites)

pts = sorted((p for p in points if p[3] > 0), key=lambda p: -p[3])
top = pts[: len(pts) // 20]
rest = pts[len(pts) // 2 :]
avg = lambda L: sum(near(p[0], p[1]) for p in L) / len(L)
print(len(points), "points,", len(sites), "sites,", len(cands), "candidats")
print("distance moyenne au site le plus proche : top 5 %% avis = %.3f km, moitié basse = %.3f km" % (avg(top), avg(rest)))
