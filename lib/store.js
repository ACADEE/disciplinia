// Stockage à double backend :
//  - en local (npm start) : fichiers JSON dans data/ (comme avant) ;
//  - sur Netlify (fonction serverless) : Netlify Blobs, persistant entre les déploiements.
// Toutes les fonctions sont désormais asynchrones.
// GAP: pas de verrouillage concurrent — si deux utilisateurs enregistrent exactement au même
// moment, la dernière écriture gagne. Acceptable pour une démo / un poste RH unique ;
// passer à une vraie base (Postgres) en phase 2 pour du multi-utilisateurs.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
// Environnement serverless (Netlify Functions tourne sur AWS Lambda).
const SERVERLESS = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);

let blobStorePromise = null;
function blobStore() {
  if (!blobStorePromise) {
    // @netlify/blobs est un module ESM : import dynamique depuis CommonJS.
    blobStorePromise = import("@netlify/blobs").then(({ getStore }) => getStore("disciplina"));
  }
  return blobStorePromise;
}

async function read(name, fallback) {
  if (SERVERLESS) {
    const s = await blobStore();
    const v = await s.get(name, { type: "json" });
    return v === null || v === undefined ? fallback : v;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Fichier ${name} illisible, valeur par défaut utilisée :`, e.message);
    return fallback;
  }
}

async function write(name, value) {
  if (SERVERLESS) {
    const s = await blobStore();
    await s.setJSON(name, value);
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

module.exports = {
  getDossiers: () => read("dossiers.json", []),
  saveDossiers: (d) => write("dossiers.json", d),
  getSalaries: () => read("salaries.json", []),
  saveSalaries: (s) => write("salaries.json", s),
  getConfig: () => read("config.json", null),
  saveConfig: (c) => write("config.json", c),
  DATA_DIR,
  SERVERLESS,
};
