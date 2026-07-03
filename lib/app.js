// Application Express partagée entre le serveur local (server.js) et la
// Netlify Function (netlify/functions/api.js). Le stockage étant asynchrone
// (fichiers en local, Netlify Blobs en ligne), toutes les routes sont async.
const express = require("express");
const path = require("path");
const store = require("./store");
const { seed } = require("./seed");
const { qualifier, sanctionById } = require("./qualification");
const { genererCourrier } = require("./letter");
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

// --- Référentiels ---
app.get("/api/referentiels", ah(async (req, res) => {
  const config = await store.getConfig();
  res.json({
    motifs: MOTIFS,
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
  const id = `S${String(salaries.length + 1).padStart(3, "0")}`;
  const salarie = { id, prenom, nom, poste: poste || "", dateEmbauche: dateEmbauche || null, adresse: adresse || "" };
  salaries.push(salarie);
  await store.saveSalaries(salaries);
  res.json(salarie);
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
  const motif = MOTIFS.find((m) => m.id === motifId);
  if (!motif) return res.status(400).json({ erreur: "Motif inconnu." });

  const dossiers = await store.getDossiers();
  const num = dossiers.length + 1;
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

// Qualification : calcule la proposition (grille + garde-fous), sans encore l'appliquer.
app.get("/api/dossiers/:id/qualification", ah(async (req, res) => {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const config = await store.getConfig();
  res.json(qualifier(dossier, config.grille, dossiers, config));
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

  const salarie = (await store.getSalaries()).find((s) => s.id === dossier.salarieId);
  const config = await store.getConfig();
  try {
    const resultat = await genererCourrier(dossier, salarie, config);
    dossier.courrier = resultat.texte;
    dossier.courrierSimulation = resultat.simulation;
    dossier.statut = "courrier_genere";
    pushHistorique(
      dossier,
      resultat.simulation ? "Courrier généré en mode SIMULATION (pas de clé API)" : `Courrier généré via ${resultat.modele}`
    );
    await store.saveDossiers(dossiers);
    res.json(dossier);
  } catch (e) {
    console.error("Erreur génération courrier :", e.message);
    res.status(502).json({ erreur: `Échec de la génération : ${e.message}` });
  }
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
