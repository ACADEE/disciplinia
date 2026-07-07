// Application Express partagée entre le serveur local (server.js) et la
// Netlify Function (netlify/functions/api.js). Le stockage étant asynchrone
// (fichiers en local, Netlify Blobs en ligne), toutes les routes sont async.
const express = require("express");
const path = require("path");
const store = require("./store");
const { seed } = require("./seed");
const { qualifier, sanctionById } = require("./qualification");
const { proposerSanctionIA } = require("./qualifIA");
const { executerGeneration } = require("./generate");
const { courrierEnDocxBase64 } = require("./docx");
const { MOTIFS, SANCTIONS, STATUTS, TYPES_COURRIER } = require("./catalog");

const app = express();

// Initialisation des données (config + démo) — mémoïsée et PARESSEUSE : elle ne doit
// pas s'exécuter à l'import, car sur Netlify le contexte Blobs n'est disponible qu'après
// connectLambda(event) (appelé dans la fonction). En cas d'échec, on autorise un nouvel essai.
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = seed().catch((e) => {
      readyPromise = null;
      console.error("Échec du seed initial :", e.message);
      throw e;
    });
  }
  return readyPromise;
}

app.use(express.json({ limit: "5mb" }));

// Sur Netlify, la fonction peut recevoir le chemin technique /.netlify/functions/api/… :
// on le normalise vers /api/… pour que les routes ci-dessous matchent dans tous les cas.
app.use((req, res, next) => {
  if (req.url.startsWith("/.netlify/functions/api")) {
    req.url = "/api" + (req.url.slice("/.netlify/functions/api".length) || "");
  }
  next();
});

// Code d'accès : si la variable d'environnement APP_PASSWORD est définie (déploiement
// public), toutes les routes /api exigent l'en-tête x-app-password correspondant.
// GAP: protection minimale à code unique partagé — pas de comptes utilisateurs ni de
// rôles (RH vs direction). Vraie authentification prévue en phase 2.
app.use("/api", (req, res, next) => {
  const requis = process.env.APP_PASSWORD;
  if (requis && req.headers["x-app-password"] !== requis) {
    return res.status(401).json({ erreur: "Code d'accès requis ou invalide." });
  }
  next();
});

// En local, Express sert aussi le frontend ; sur Netlify c'est le CDN qui s'en charge.
app.use(express.static(path.join(__dirname, "..", "public")));

// Wrapper : Express 4 ne remonte pas les rejets des handlers async.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function pushHistorique(dossier, action) {
  dossier.historique = dossier.historique || [];
  dossier.historique.push({ date: new Date().toISOString(), action });
}

// Prochain numéro d'ID basé sur le maximum existant (et non sur la longueur du tableau),
// pour éviter toute collision d'identifiant après une suppression.
function prochainNumero(items, prefixe) {
  const re = new RegExp(`^${prefixe}(\\d+)$`);
  let max = 0;
  for (const it of items) {
    const m = re.exec(String(it.id || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// Les motifs sont désormais pilotés par la grille de gravité (éditable en Configuration),
// et non plus par le catalogue statique. Triés du moins grave au plus grave.
function motifsDepuisGrille(config) {
  const grille = (config && config.grille) || [];
  return grille
    .map((g) => ({
      id: g.motifId,
      label: g.motifLabel,
      niveauDefaut: g.niveau,
      sanction1: g.sanction1,
      sanctionRecidive: g.sanctionRecidive,
    }))
    .sort((a, b) => a.niveauDefaut - b.niveauDefaut || a.label.localeCompare(b.label, "fr"));
}

// --- Référentiels ---
app.get("/api/referentiels", ah(async (req, res) => {
  const config = await store.getConfig();
  res.json({
    motifs: motifsDepuisGrille(config),
    sanctions: SANCTIONS,
    statuts: STATUTS,
    typesCourrier: TYPES_COURRIER,
    apiKeyPresente: Boolean(process.env.ANTHROPIC_API_KEY || (config && config.apiKey)),
    modele: (config && config.modele) || "claude-sonnet-5",
  });
}));

// --- Salariés ---
app.get("/api/salaries", ah(async (req, res) => res.json(await store.getSalaries())));

app.post("/api/salaries", ah(async (req, res) => {
  const { prenom, nom, poste, dateEmbauche, adresse } = req.body;
  if (!prenom || !nom) return res.status(400).json({ erreur: "Prénom et nom requis." });
  const salaries = await store.getSalaries();
  const id = `S${String(prochainNumero(salaries, "S")).padStart(3, "0")}`;
  const salarie = { id, prenom, nom, poste: poste || "", dateEmbauche: dateEmbauche || null, adresse: adresse || "" };
  salaries.push(salarie);
  await store.saveSalaries(salaries);
  res.json(salarie);
}));

// Historique disciplinaire complet d'un salarié (remplace le suivi manuel de la récidive).
app.get("/api/salaries/:id/historique", ah(async (req, res) => {
  const salarie = (await store.getSalaries()).find((s) => s.id === req.params.id);
  if (!salarie) return res.status(404).json({ erreur: "Salarié introuvable." });
  const dossiers = (await store.getDossiers())
    .filter((d) => d.salarieId === salarie.id)
    .sort((a, b) => (a.dateFait < b.dateFait ? 1 : -1));
  const troisAns = Date.now() - 3 * 365 * 24 * 3600 * 1000;
  const sanctionsInvocables = dossiers.filter(
    (d) =>
      d.sanctionRetenue &&
      d.sanctionRetenue !== "rappel_ordre" &&
      ["valide", "envoye", "archive"].includes(d.statut) &&
      new Date(d.dateFait).getTime() > troisAns
  ).length;
  res.json({ salarie, dossiers, stats: { total: dossiers.length, sanctionsInvocables } });
}));

// Modification d'un salarié (prénom, nom, poste). Met à jour le nom dénormalisé
// stocké sur ses dossiers pour rester cohérent.
app.patch("/api/salaries/:id", ah(async (req, res) => {
  const salaries = await store.getSalaries();
  const salarie = salaries.find((s) => s.id === req.params.id);
  if (!salarie) return res.status(404).json({ erreur: "Salarié introuvable." });
  const { prenom, nom, poste } = req.body;
  if (prenom !== undefined) salarie.prenom = String(prenom).trim() || salarie.prenom;
  if (nom !== undefined) salarie.nom = String(nom).trim() || salarie.nom;
  if (poste !== undefined) salarie.poste = String(poste).trim();
  await store.saveSalaries(salaries);

  // Propager le nom sur les dossiers rattachés.
  const dossiers = await store.getDossiers();
  let modifies = 0;
  for (const d of dossiers) {
    if (d.salarieId === salarie.id) {
      const nouveauNom = `${salarie.prenom} ${salarie.nom}`;
      if (d.salarieNom !== nouveauNom) { d.salarieNom = nouveauNom; modifies++; }
    }
  }
  if (modifies) await store.saveDossiers(dossiers);
  res.json(salarie);
}));

// Suppression d'un salarié ET, en cascade, de tous ses dossiers disciplinaires. Irréversible.
app.delete("/api/salaries/:id", ah(async (req, res) => {
  const salaries = await store.getSalaries();
  const salarie = salaries.find((s) => s.id === req.params.id);
  if (!salarie) return res.status(404).json({ erreur: "Salarié introuvable." });

  const dossiers = await store.getDossiers();
  const restants = dossiers.filter((d) => d.salarieId !== salarie.id);
  const dossiersSupprimes = dossiers.length - restants.length;

  await store.saveDossiers(restants);
  await store.saveSalaries(salaries.filter((s) => s.id !== salarie.id));

  res.json({ salarieId: salarie.id, dossiersSupprimes });
}));

// --- Dossiers ---
app.get("/api/dossiers", ah(async (req, res) => {
  const dossiers = (await store.getDossiers()).slice().sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
  res.json(dossiers);
}));

app.get("/api/dossiers/:id", ah(async (req, res) => {
  const d = (await store.getDossiers()).find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ erreur: "Dossier introuvable." });
  res.json(d);
}));

app.post("/api/dossiers", ah(async (req, res) => {
  const { salarieId, motifId, dateFait, dateConnaissance, lieu, description, temoins } = req.body;
  if (!salarieId || !motifId || !dateFait || !description) {
    return res.status(400).json({ erreur: "Champs requis : salarié, motif, date du fait, description." });
  }
  const salarie = (await store.getSalaries()).find((s) => s.id === salarieId);
  if (!salarie) return res.status(400).json({ erreur: "Salarié inconnu." });
  const config = await store.getConfig();
  const motif = motifsDepuisGrille(config).find((m) => m.id === motifId);
  if (!motif) return res.status(400).json({ erreur: "Motif inconnu." });

  const dossiers = await store.getDossiers();
  const num = prochainNumero(dossiers, "D");
  const annee = new Date(dateFait).getFullYear();
  const dossier = {
    id: `D${String(num).padStart(4, "0")}`,
    reference: `DISC-${annee}-${String(num).padStart(3, "0")}`,
    salarieId,
    salarieNom: `${salarie.prenom} ${salarie.nom}`,
    motifId,
    motifLabel: motif.label,
    dateFait,
    dateConnaissance: dateConnaissance || dateFait,
    lieu: lieu || "",
    description,
    temoins: temoins || "",
    statut: "nouveau",
    niveauGravite: null,
    sanctionRetenue: null,
    typeCourrier: null,
    courrier: null,
    courrierSimulation: false,
    historique: [],
    creeLe: new Date().toISOString(),
  };
  pushHistorique(dossier, "Fait saisi");
  dossiers.push(dossier);
  await store.saveDossiers(dossiers);
  res.json(dossier);
}));

// Qualification : proposition (grille + garde-fous) enrichie par l'IA à partir de la
// description libre du fait. La proposition IA est calculée une fois puis mise en cache
// sur le dossier ; sans clé API, on garde la proposition déterministe.
app.get("/api/dossiers/:id/qualification", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const config = await store.getConfig();
  const base = qualifier(dossier, config.grille, dossiers, config);

  if (!dossier.propositionIA) {
    try {
      const ia = await proposerSanctionIA(dossier, config, base);
      if (ia) {
        dossier.propositionIA = ia;
        await store.saveDossiers(dossiers);
      }
    } catch (e) {
      console.error("Qualification IA échouée :", e.message);
    }
  }
  if (dossier.propositionIA) {
    base.sanctionProposee = dossier.propositionIA.sanctionProposee;
    base.niveauGravite = dossier.propositionIA.niveauGravite;
    base.justificationIA = dossier.propositionIA.justification;
    base.parIA = true;
  }
  res.json(base);
}));

// Applique la qualification (proposée ou modifiée par l'utilisateur).
app.post("/api/dossiers/:id/qualifier", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const { sanctionRetenue, niveauGravite, typeCourrier } = req.body;
  if (!sanctionRetenue) return res.status(400).json({ erreur: "Sanction requise." });

  const config = await store.getConfig();
  const proposition = qualifier(dossier, config.grille, dossiers, config);
  dossier.sanctionRetenue = sanctionRetenue;
  dossier.niveauGravite = niveauGravite || proposition.niveauGravite;
  dossier.recidive = proposition.recidive;
  dossier.antecedents = proposition.antecedents;
  const s = sanctionById(sanctionRetenue);
  dossier.typeCourrier =
    typeCourrier || (s.entretienRequis ? "convocation" : sanctionRetenue === "rappel_ordre" ? "rappel_ordre" : "notification_simple");
  dossier.statut = "qualifie";
  pushHistorique(dossier, `Qualifié : ${s.label} (niveau ${dossier.niveauGravite})`);
  await store.saveDossiers(dossiers);
  res.json(dossier);
}));

// Génération du courrier via l'API Anthropic.
// L'appel IA (long) est exécuté HORS de cette requête pour éviter le timeout serverless
// (504 sur Netlify). On enregistre l'état « en cours », on déclenche le worker, et on
// répond immédiatement (202). Le client suit ensuite l'avancement via GET /api/dossiers/:id.
app.post("/api/dossiers/:id/generer-courrier", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  if (!dossier.sanctionRetenue) return res.status(400).json({ erreur: "Qualifiez d'abord le dossier (sanction retenue)." });

  const { entretien, miseAPiedConservatoire, consignesRedaction, typeCourrier } = req.body || {};
  if (typeCourrier) dossier.typeCourrier = typeCourrier;
  dossier.entretien = entretien || dossier.entretien || null;
  dossier.miseAPiedConservatoire = Boolean(miseAPiedConservatoire);
  dossier.consignesRedaction = consignesRedaction || "";
  dossier.generation = { statut: "en_cours", demandeLe: new Date().toISOString() };
  await store.saveDossiers(dossiers);

  await declencherGeneration(dossier.id, req);
  res.status(202).json({ statut: "en_cours" });
}));

// Déclenche le worker de génération sans bloquer la réponse HTTP.
async function declencherGeneration(id, req) {
  if (store.SERVERLESS) {
    // Netlify : déléguer à la fonction de fond (jusqu'à 15 min), qui renvoie 202 aussitôt.
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${req.headers.host}`;
    const headers = { "Content-Type": "application/json" };
    if (process.env.APP_PASSWORD) headers["x-app-password"] = process.env.APP_PASSWORD;
    try {
      await fetch(`${base}/.netlify/functions/generer-background`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error("Impossible de déclencher la génération de fond :", e.message);
    }
  } else {
    // Local : lancer sans attendre ; le process Node poursuit le traitement après la réponse.
    executerGeneration(id).catch((e) => console.error("Génération locale échouée :", e.message));
  }
}

// Export du courrier au format Word (.docx). Renvoie le fichier encodé en base64.
app.get("/api/dossiers/:id/courrier-docx", ah(async (req, res) => {
  const dossier = (await store.getDossiers()).find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  if (!dossier.courrier) return res.status(400).json({ erreur: "Aucun courrier à exporter (générez-le d'abord)." });
  const base64 = await courrierEnDocxBase64(dossier);
  res.json({ filename: `Courrier-${dossier.reference || dossier.id}.docx`, base64 });
}));

// Édition manuelle du courrier (relecture humaine avant validation).
app.patch("/api/dossiers/:id/courrier", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  dossier.courrier = req.body.courrier || dossier.courrier;
  pushHistorique(dossier, "Courrier modifié manuellement");
  await store.saveDossiers(dossiers);
  res.json(dossier);
}));

// Changement de statut (validation, envoi, archivage, sans suite).
app.post("/api/dossiers/:id/statut", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const { statut, commentaire } = req.body;
  if (!STATUTS.find((s) => s.id === statut)) return res.status(400).json({ erreur: "Statut inconnu." });
  dossier.statut = statut;
  pushHistorique(dossier, `Statut → ${STATUTS.find((s) => s.id === statut).label}${commentaire ? ` (${commentaire})` : ""}`);
  await store.saveDossiers(dossiers);
  res.json(dossier);
}));

// --- Dashboard ---
app.get("/api/dashboard", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const config = await store.getConfig();
  const parStatut = {};
  const parMotif = {};
  const parMois = {};
  const parSalarie = {};
  const enCours = [];

  for (const d of dossiers) {
    parStatut[d.statut] = (parStatut[d.statut] || 0) + 1;
    parMotif[d.motifLabel] = (parMotif[d.motifLabel] || 0) + 1;
    const mois = (d.dateFait || "").slice(0, 7);
    parMois[mois] = (parMois[mois] || 0) + 1;
    parSalarie[d.salarieNom] = (parSalarie[d.salarieNom] || 0) + 1;
    if (!["archive", "sans_suite", "envoye"].includes(d.statut)) enCours.push(d);
  }

  const alertes = [];
  for (const d of enCours) {
    const jours = Math.floor((Date.now() - new Date(d.dateConnaissance || d.dateFait).getTime()) / 86400000);
    if (jours > 60) alertes.push({ reference: d.reference, salarieNom: d.salarieNom, texte: `Prescription probable (${jours} j depuis connaissance du fait)`, niveau: "danger" });
    else if (jours > 45) alertes.push({ reference: d.reference, salarieNom: d.salarieNom, texte: `Prescription dans ${60 - jours} j`, niveau: "warning" });
  }

  res.json({
    total: dossiers.length,
    enCours: enCours.length,
    parStatut,
    parMotif,
    parMois,
    topSalaries: Object.entries(parSalarie).sort((a, b) => b[1] - a[1]).slice(0, 5),
    alertes,
    reglementDepose: Boolean(config.reglementInterieur && config.reglementInterieur.trim()),
  });
}));

// --- Configuration ---
app.get("/api/config", ah(async (req, res) => {
  const c = await store.getConfig();
  // La clé API n'est jamais renvoyée en clair au navigateur.
  res.json({ ...c, apiKey: c.apiKey ? "********" : "" });
}));

app.put("/api/config", ah(async (req, res) => {
  const actuel = await store.getConfig();
  const maj = { ...actuel, ...req.body };
  // "********" signifie « inchangée »
  if (req.body.apiKey === "********") maj.apiKey = actuel.apiKey;
  await store.saveConfig(maj);
  res.json({ ok: true });
}));

// --- Sauvegarde / export ---
// Renvoie l'intégralité des données (dossiers + salariés + config) en un seul JSON daté,
// pour sauvegarde manuelle. GAP: pas de sauvegarde automatique de Netlify Blobs — l'admin
// doit télécharger régulièrement ce fichier et le conserver en lieu sûr.
app.get("/api/export", ah(async (req, res) => {
  const [dossiers, salaries, config] = await Promise.all([
    store.getDossiers(),
    store.getSalaries(),
    store.getConfig(),
  ]);
  // Ne jamais exporter la clé API en clair (même masquage que GET /api/config).
  const configSansCle = { ...config, apiKey: config && config.apiKey ? "********" : "" };
  res.json({
    version: 1,
    exporteLe: new Date().toISOString(),
    dossiers,
    salaries,
    config: configSansCle,
  });
}));

// Gestion d'erreur centralisée (les rejets des handlers async arrivent ici via ah()).
app.use((err, req, res, next) => {
  console.error("Erreur serveur :", err);
  res.status(500).json({ erreur: "Erreur interne du serveur." });
});

module.exports = { app, ensureReady };
