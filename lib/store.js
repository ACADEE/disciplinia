// Stockage sur fichiers JSON (répertoire data/). Suffisant pour ~640 dossiers/an mono-poste.
// GAP: pour un déploiement multi-utilisateurs, remplacer par une vraie base (SQLite/Postgres).
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(name, fallback) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Fichier ${name} illisible, valeur par défaut utilisée :`, e.message);
    return fallback;
  }
}

function writeJson(name, value) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

module.exports = {
  getDossiers: () => readJson("dossiers.json", []),
  saveDossiers: (d) => writeJson("dossiers.json", d),
  getSalaries: () => readJson("salaries.json", []),
  saveSalaries: (s) => writeJson("salaries.json", s),
  getConfig: () => readJson("config.json", null),
  saveConfig: (c) => writeJson("config.json", c),
  DATA_DIR,
};
