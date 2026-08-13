// packages/shared/build-css.js
//
// Génère `tokens.css` depuis `tokens.js`, pour que le front web consomme
// exactement les mêmes valeurs que le mobile (D-022).
//
//   node packages/shared/build-css.js
//
// Le fichier généré ne doit jamais être édité à la main : toute modification
// se fait dans tokens.js, puis on relance ce script.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { tokens } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Convertit camelCase en kebab-case pour les noms de variables CSS. */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Les échelles numériques sont exprimées en pixels côté CSS. */
const PX_GROUPS = new Set(["spacing", "radius", "fontSize"]);

const lines = [
  "/* GÉNÉRÉ par packages/shared/build-css.js — NE PAS ÉDITER À LA MAIN.",
  " * Modifier packages/shared/tokens.js puis relancer le script.",
  " * Garantit que le web et le mobile partagent les mêmes valeurs (D-022). */",
  "",
  ":root {",
];

for (const [group, values] of Object.entries(tokens)) {
  lines.push(`  /* ${group} */`);
  for (const [name, value] of Object.entries(values)) {
    const suffix = PX_GROUPS.has(group) && typeof value === "number" ? "px" : "";
    lines.push(`  --${kebab(group)}-${kebab(name)}: ${value}${suffix};`);
  }
  lines.push("");
}

lines.push("}", "");

const target = join(here, "tokens.css");
writeFileSync(target, lines.join("\n"), "utf8");
console.log(`tokens.css généré (${Object.keys(tokens).length} groupes) -> ${target}`);
