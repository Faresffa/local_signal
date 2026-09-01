// apps/mobile/metro.config.js
//
// Metro ne suit pas, par défaut, les fichiers situés hors du dossier du projet.
// Surveiller la racine permet qu'une modification des jetons partagés
// déclenche un rechargement pendant le développement.
//
// Les jetons eux-mêmes ne sont PAS importés depuis packages/shared : ils sont
// générés en copie locale (src/tokens.generated.js), parce que la résolution
// inter-paquets de Metro n'est pas fiable. Voir packages/shared/build-css.js.

const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Surveiller la racine du dépôt, pour que packages/shared soit résolvable et
// que ses modifications déclenchent un rechargement.
config.watchFolders = [workspaceRoot];

// Chercher les dépendances d'abord dans l'application, puis à la racine.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
