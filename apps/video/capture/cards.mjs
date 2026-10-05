// Génère une carte image par restaurant de la galerie (vraie photo + nom +
// verdict), avec les polices de l'application, pour les plaquer en 3D.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const featured = JSON.parse(fs.readFileSync("public/data/featured.json", "utf8"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
for (const r of featured) {
  const photo = "data:image/jpeg;base64," + fs.readFileSync(path.join("public/photos", r.id + ".jpg")).toString("base64");
  await p.setContent(`<!doctype html><html><head>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
  <style>
    body{margin:0;background:transparent}
    .c{width:600px;height:780px;border-radius:36px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
    .ph{height:520px;background:url(${photo}) center/cover}
    .b{padding:30px 34px;display:flex;flex-direction:column;gap:14px}
    .n{font-family:Outfit;font-weight:800;font-size:44px;color:#1c1a17;letter-spacing:-.02em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .row{display:flex;align-items:center;justify-content:space-between}
    .pill{display:inline-flex;gap:10px;align-items:center;padding:10px 22px;border-radius:999px;background:#e7f2ec;color:#2d6a4f;font-family:Outfit;font-weight:600;font-size:28px}
    .pill b{font-weight:800}
    .z{font-family:'Instrument Sans';font-weight:600;font-size:22px;color:#716a60;letter-spacing:.08em;text-transform:uppercase}
  </style></head><body><div class="c" id="c"><div class="ph"></div><div class="b">
    <div class="n">${r.name}</div>
    <div class="row"><span class="pill">Profil local <b>${r.label}/10</b></span><span class="z">Quartier latin</span></div>
  </div></div></body></html>`);
  await p.waitForLoadState("networkidle");
  await p.evaluate(() => document.fonts.ready);
  await p.locator("#c").screenshot({ path: `public/cards/${r.id}.png`, omitBackground: true });
}
console.log(featured.length, "cartes");
await b.close();
