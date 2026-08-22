// apps/mobile/metro.config.js
//
// Metro ne surveille par défaut que la racine du projet (apps/mobile). Or le
// mobile importe les jetons de design depuis packages/shared (D-022), qui est
// en dehors de ce périmètre : sans cette configuration, le bundle échoue avec
// « Unable to resolve module ../../../packages/shared/tokens.js ».
//
// C'est la contrepartie du choix monorepo (D-011) : le partage de code entre
// web et mobile impose d'élargir explicitement la fenêtre de Metro.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Rend packages/shared visible par Metro, et permet le rechargement à chaud
// quand un jeton y est modifié.
config.watchFolders = [workspaceRoot];

// Résolution des dépendances : d'abord celles du mobile, puis celles hissées
// à la racine du monorepo.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
