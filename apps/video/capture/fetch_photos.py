"""
Sélection des restaurants montrés dans la vidéo : on ne garde que ceux dont la
VRAIE photo a pu être téléchargée et vérifiée.

À lancer depuis la racine du dépôt, après export_data.py :
    python apps/video/capture/fetch_photos.py

Critères d'une photo acceptée : au moins 400 × 300 px, image non unie (écart
type des couleurs > 25 sur une vignette 64 × 64), pas de doublon exact. Le nom
« NA » (fiche incomplète dans la base) est écarté.

Sortie : public/photos/<id>.jpg et public/data/featured.json (avec le libellé
du score arrondi comme dans l'app, lib/display.js::scoreSur10).
"""
import hashlib
import io
import json
import os
import sqlite3
import urllib.request

from PIL import Image, ImageStat

ROOT = os.path.join("apps", "video", "public")
os.makedirs(os.path.join(ROOT, "photos"), exist_ok=True)
db = sqlite3.connect("local_signal.db")
cands = json.load(open(os.path.join(ROOT, "data", "candidates.json"), encoding="utf8"))

keep, hashes = [], set()
for c in cands:
    if c["name"].strip().upper() == "NA":
        continue
    url, ls, conf = db.execute(
        "select photo_url, local_signal, confidence from restaurants where id = ?", (c["id"],)
    ).fetchone()
    url = (url or "").strip()
    if not url:
        print("-- pas de photo :", c["name"])
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:  # URL expirée, format inconnu…
        print("ERR", c["name"], str(e)[:60])
        continue
    w, h = im.size
    sd = sum(ImageStat.Stat(im.resize((64, 64))).stddev) / 3
    digest = hashlib.md5(data).hexdigest()
    if w < 400 or h < 300 or sd <= 25 or digest in hashes:
        print("NO ", c["name"], w, h, round(sd))
        continue
    hashes.add(digest)
    im.save(os.path.join(ROOT, "photos", f"{c['id']}.jpg"), quality=90)
    c["label"] = f"{ls / 10:.1f}".replace(".", ",")
    c["ls"], c["conf"] = ls, conf
    keep.append(c)
    print("OK ", c["name"])

json.dump(keep, open(os.path.join(ROOT, "data", "featured.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(keep), "restaurants retenus")
