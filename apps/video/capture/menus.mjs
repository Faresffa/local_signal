import { chromium } from "playwright";
import fs from "node:fs";
const acc = JSON.parse(fs.readFileSync("capture/demo-account.json", "utf8"));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: "fr-FR", geolocation: { latitude: 48.8406, longitude: 2.3499 }, permissions: ["geolocation"] });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/");
await p.evaluate(async (a) => fetch("http://localhost:8000/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) }), acc);
await p.reload(); await p.waitForTimeout(3000);
try { await p.getByRole("button", { name: "Refuser" }).click({ timeout: 3000 }); } catch {}
const btns = p.getByRole("button", { name: "Voir la fiche" });
for (let i = 0; i < await btns.count(); i++) {
  const t = await btns.nth(i).evaluate((el) => { let e = el; for (let k = 0; k < 6 && e; k++) e = e.parentElement; return e.innerText; });
  if (t.includes("Louis-Marie")) { await btns.nth(i).click(); break; }
}
await p.waitForTimeout(2500);
await p.getByText(/Voir la carte \(/).click(); await p.waitForTimeout(3000);
const imgs = await p.$$eval("img", (els) => els.map((e) => ({ src: e.currentSrc, w: e.naturalWidth, h: e.naturalHeight })));
for (const [i, im] of imgs.entries()) {
  if (i === 0) continue;
  const r = await ctx.request.get(im.src);
  fs.writeFileSync(`public/shots/menu-hd-${i}.jpg`, await r.body());
}
console.log("ok", imgs.length - 1);
await b.close();
