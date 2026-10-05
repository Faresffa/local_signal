// Filme l'application — web (:5173) et mobile Expo en version web (:8081) —
// avec le compte abonné de démonstration, depuis le Quartier latin.
// Captures déposées dans public/shots/.
//
// Point de départ : devant Tcham (rue Mouffetard, 5e). À 5 min à pied, les
// cinq premiers résultats ont tous une vraie photo : aucun restaurant sans
// image n'apparaît à l'écran.
import { chromium } from "playwright";
import fs from "node:fs";

const acc = JSON.parse(fs.readFileSync("capture/demo-account.json", "utf8"));
const OUT = "public/shots";
const POS = { latitude: 48.8401381, longitude: 2.3500385 };
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();

async function context(viewport, dpr, mobile) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: dpr, locale: "fr-FR", isMobile: mobile, hasTouch: mobile, geolocation: POS, permissions: ["geolocation"] });
  // Comme sur un vrai téléphone : pas de referrer vers les hébergeurs de
  // photos (sinon Chrome bloque les images Google dans la version web d'Expo).
  await ctx.route(/googleusercontent|ggpht|zenchef/, async (route) => {
    const h = { ...route.request().headers() };
    delete h.referer;
    route.continue({ headers: h });
  });
  return ctx;
}
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); }
}
const shot = (p, n, full = false) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
const text = async (p, n) => fs.writeFileSync(`${OUT}/${n}.txt`, await p.innerText("body"));

async function ouvrirFiche(page, nom, bouton = "Voir la fiche") {
  const btns = page.getByRole("button", { name: bouton });
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const t = await btns.nth(i).evaluate((el) => { let e = el; for (let k = 0; k < 6 && e; k++) e = e.parentElement; return e ? e.innerText : ""; });
    if (t.includes(nom)) { await btns.nth(i).click(); await page.waitForTimeout(3000); return; }
  }
  throw new Error("fiche introuvable : " + nom);
}

// ============================ WEB ============================
{
  const ctx = await context({ width: 1600, height: 900 }, 1.2, false);
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/");
  await p.evaluate(async (a) => fetch("http://localhost:8000/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) }), acc);
  await p.reload(); await p.waitForTimeout(3000);
  try { await p.getByRole("button", { name: "Refuser" }).click({ timeout: 3000 }); } catch {}

  await step("w-5min", async () => {
    const sel = p.locator("select").filter({ hasText: "5 min à pied" }).first();
    await sel.selectOption({ label: "5 min à pied" });
    await p.getByRole("button", { name: /Chercher/ }).first().click();
    await p.waitForTimeout(3500);
    await shot(p, "w01-home");
    await text(p, "w01");
  });
  await step("w-filtre", async () => {
    await p.getByRole("button", { name: /Score Local Signal/ }).click(); await p.waitForTimeout(700);
    await shot(p, "w02-filter-open");
    await p.locator("input.budget__poignee--min").last().fill("7.5"); await p.waitForTimeout(600);
    await shot(p, "w03-filter-set");
    await p.getByRole("button", { name: /^Voir \d+ restaurant/ }).click(); await p.waitForTimeout(3000);
    await shot(p, "w04-filtered");
  });
  await step("w-fiche", async () => {
    await ouvrirFiche(p, "Louis-Marie");
    await shot(p, "w05-detail");
    await p.getByText("Voir le détail du calcul").click(); await p.waitForTimeout(1200);
    await shot(p, "w06-detail-calc", true);
    await p.getByText(/Voir la carte \(/).click(); await p.waitForTimeout(3000);
    await shot(p, "w07-carte", true);
  });
  await step("w-pass", async () => {
    await p.goto("http://localhost:5173/"); await p.waitForTimeout(2500);
    await p.getByRole("button", { name: /Camille/ }).click(); await p.waitForTimeout(700);
    await shot(p, "w08-menu-compte");
    await text(p, "w08");
  });
  await step("w-restaurateurs", async () => {
    await p.goto("http://localhost:5173/"); await p.waitForTimeout(2500);
    await p.getByRole("button", { name: "Restaurateurs" }).first().click(); await p.waitForTimeout(2000);
    await shot(p, "w09-restaurateurs");
  });
  await ctx.close();
}

// ============================ MOBILE (Expo) ============================
{
  const ctx = await context({ width: 390, height: 844 }, 3, true);
  const m = await ctx.newPage();
  await m.goto("http://localhost:8081/"); await m.waitForTimeout(9000);
  await step("m-login", async () => {
    await m.getByText("Se connecter").first().click(); await m.waitForTimeout(2000);
    await m.locator("input[type=email]").fill(acc.email);
    await m.locator("input[type=password]").fill(acc.password);
    await m.getByText("Se connecter").last().click(); await m.waitForTimeout(4000);
    await text(m, "m00-apres-login");
  });
  await step("m-discover", async () => {
    // Retour à Découvrir si la connexion a laissé sur le compte.
    try { await m.getByText("Découvrir").last().click({ timeout: 3000 }); } catch {}
    await m.waitForTimeout(2000);
    await m.getByText("5 min", { exact: true }).first().click(); await m.waitForTimeout(5000);
    await shot(m, "m01-discover");
    await text(m, "m01");
    await m.mouse.wheel(0, 900); await m.waitForTimeout(2500);
    await shot(m, "m02-list");
  });
  await step("m-fiche", async () => {
    await m.mouse.wheel(0, -3000); await m.waitForTimeout(1500);
    await m.getByText("Les Crêpes de Louis-Marie").first().click(); await m.waitForTimeout(4000);
    await shot(m, "m03-detail");
    await text(m, "m03");
    await m.mouse.wheel(0, 700); await m.waitForTimeout(1500);
    await shot(m, "m04-detail-bas");
  });
  await step("m-scan", async () => {
    await m.goto("http://localhost:8081/"); await m.waitForTimeout(7000);
    await m.getByText("Scanner").last().click(); await m.waitForTimeout(2500);
    await shot(m, "m05-scan");
    await text(m, "m05");
  });
  await ctx.close();
}
await b.close();
