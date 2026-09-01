// packages/shared/build-css.js
//
// Génère les jetons consommables par les deux interfaces depuis `tokens.js`,
// la source unique de vérité (D-022).
//
//   node packages/shared/build-css.js
//
// Produit deux fichiers, à ne jamais éditer à la main :
//
//   packages/shared/tokens.css            variables CSS, lues par le web
//   apps/mobile/src/tokens.generated.js   objet JS, lu par le mobile
//
// Pourquoi une copie pour le mobile plutôt qu'un import : Metro, l'empaqueteur
// de React Native, ne résout pas de façon fiable les fichiers situés hors du
// dossier de l'application. Forcer sa configuration s'est révélé fragile ;
// générer une copie depuis la même source atteint le même but sans dépendre
// d'un comportement d'outil.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { tokens } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const EOL = "\n";

/** camelCase vers kebab-case, pour les noms de variables CSS. */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Les échelles numériques sont exprimées en pixels côté CSS. */
const PX_GROUPS = new Set(["spacing", "radius", "fontSize"]);

/** Déclarations `--groupe-nom: valeur;` d'un groupe de jetons. */
function declarations(group, values, indent = "  ") {
  return Object.entries(values).map(([name, value]) => {
    const px = PX_GROUPS.has(group) && typeof value === "number" ? "px" : "";
    return `${indent}--${kebab(group)}-${kebab(name)}: ${value}${px};`;
  });
}

// ---------------------------------------------------------------- Web (CSS)

const css = [
  "/* GÉNÉRÉ par packages/shared/build-css.js. NE PAS ÉDITER À LA MAIN.",
  " * Modifier packages/shared/tokens.js puis relancer le script.",
  " * Garantit que le web et le mobile partagent les mêmes valeurs (D-022). */",
  "",
  ":root {",
];

// Mode clair et échelles communes.
for (const [group, values] of Object.entries(tokens)) {
  if (group === "colorDark") continue;
  css.push(`  /* ${group} */`, ...declarations(group, values), "");
}
css.push("  color-scheme: light dark;", "}", "");

// Mode sombre : suit le système par défaut.
css.push(
  "@media (prefers-color-scheme: dark) {",
  "  :root:not([data-theme='light']) {",
  ...declarations("color", tokens.colorDark, "    "),
  "  }",
  "}",
  "",
);

// Mode sombre : choix explicite de l'utilisateur, prioritaire sur le système.
css.push(
  "[data-theme='dark'] {",
  ...declarations("color", tokens.colorDark),
  "}",
  "",
);

const cssTarget = join(here, "tokens.css");
writeFileSync(cssTarget, css.join(EOL), "utf8");
console.log(`tokens.css généré (clair + sombre) -> ${cssTarget}`);

// ------------------------------------------------------------- Mobile (JS)

const js = [
  "// GÉNÉRÉ par packages/shared/build-css.js. NE PAS ÉDITER À LA MAIN.",
  "// Modifier packages/shared/tokens.js puis relancer le script.",
  "//",
  "// Copie locale des jetons : Metro ne résout pas les imports hors du dossier",
  "// de l'application. Le web lit tokens.css, le mobile lit ce fichier, et les",
  "// deux sortent de la même source (D-022).",
  "",
  `export const tokens = ${JSON.stringify(tokens, null, 2)};`,
  "",
  "export default tokens;",
  "",
];

const jsTarget = join(here, "..", "..", "apps", "mobile", "src", "tokens.generated.js");
writeFileSync(jsTarget, js.join(EOL), "utf8");
console.log(`tokens.generated.js généré -> ${jsTarget}`);
