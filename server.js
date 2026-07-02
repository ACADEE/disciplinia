// Serveur MVP — gestion des procédures disciplinaires.
// Démarrage : npm start  →  http://localhost:3005
const express = require("express");
const path = require("path");
const store = require("./lib/store");
const { seed } = require("./lib/seed");
const { qualifier, sanctionById } = require("./lib/qualification");
const { genererCourrier } = require("./lib/letter");
const { MOTIFS, SANCTIONS, STATUTS, TYPES_COURRIER } = require("./lib/catalog");

seed(); // initialise config + données fictives au premier lancement

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3005;

function pushHistorique(dossier, action) {
  dossier.historique = dossier.historique || [];
  dossier.historique.push({ date: new Date().toISOString(), action });
}

// --- Référentiels ---
app.get("/api/referentiels", (req, res) => {
  const config = store.getConfig();
  res.json({
    motifs: MOTIFS,
    sanctions: SANCTIONS,
    statuts: STATUTS,
    typesCourrier: TYPES_COURRIER,
    apiKeyPresente: Boolean(process.env.ANTHROPIC_API_KEY || (config && config.apiKey)),
    modele: (config && config.modele) || "claude-sonnet-5",
  });
});

// --- Salariés ---
app.get("/api/salaries", (req, res) => res.json(store.getSalaries()));

app.post("/api/salaries", (req, res) => {
  const { prenom, nom, poste, dateEmbauche, adresse } = req.body;
  if (!prenom || !nom) return res.status(400).json({ erreur: "Prénom et nom requis." });
  const salaries = store.getSalaries();
  const id = `S${String(salaries.length + 1).padStart(3, "0")}`;
  const salarie = { id, prenom, nom, poste: poste || "", dateEmbauche: dateEmbauche || null, adresse: adresse || "" };
  salaries.push(salarie);
  store.saveSalaries(salaries);
  res.json(salarie);
});

// --- Dossiers ---
app.get("/api/dossiers", (req, res) => {
  const dossiers = store.getDossiers().slice().sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
  res.json(dossiers);
});

app.get("/api/dossiers/:id", (req, res) => {
  const d = store.getDossiers().find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ erreur: "Dossier introuvable." });
  res.json(d);
});

app.post("/api/dossiers", (req, res) => {
  const { salarieId, motifId, dateFait, dateConnaissance, lieu, description, temoins } = req.body;
  if (!salarieId || !motifId || !dateFait || !description) {
    return res.status(400).json({ erreur: "Champs requis : salarié, motif, date du fait, description." });
  }
  const salarie = store.getSalaries().find((s) => s.id === salarieId);
  if (!salarie) return res.status(400).json({ erreur: "Salarié inconnu." });
  const motif = MOTIFS.find((m) => m.id === motifId);
  if (!motif) return res.status(400).json({ erreur: "Motif inconnu." });

  const dossiers = store.getDossiers();
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
  store.saveDossiers(dossiers);
  res.json(dossier);
});

// Qualification : calcule la proposition (grille + garde-fous), sans encore l'appliquer.
app.get("/api/dossiers/:id/qualification", (req, res) => {
  const dossiers = store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const config = store.getConfig();
  res.json(qualifier(dossier, config.grille, dossiers, config));
});

// Applique la qualification (proposée ou modifiée par l'utilisateur).
app.post("/api/dossiers/:id/qualifier", (req, res) => {
  const dossiers = store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const { sanctionRetenue, niveauGravite, typeCourrier } = req.body;
  if (!sanctionRetenue) return res.status(400).json({ erreur: "Sanction requise." });

  const config = store.getConfig();
  const proposition = qualifier(dossier, config.grille, dossiers, config);
  dossier.sanctionRetenue = sanctionRetenue;
  dossier.niveauGravite = niveauGravite || proposition.niveauGravite;
  dossier.recidive = proposition.recidive;
  dossier.antecedents = proposition.antecedents;
  // Le type de courrier découle de la sanction retenue, sauf choix explicite.
  const s = sanctionById(sanctionRetenue);
  dossier.typeCourrier =
    typeCourrier || (s.entretienRequis ? "convocation" : sanctionRetenue === "rappel_ordre" ? "rappel_ordre" : "notification_simple");
  dossier.statut = "qualifie";
  pushHistorique(dossier, `Qualifié : ${s.label} (niveau ${dossier.niveauGravite})`);
  store.saveDossiers(dossiers);
  res.json(dossier);
});

// Génération du courrier via l'API Anthropic.
app.post("/api/dossiers/:id/generer-courrier", async (req, res) => {
  const dossiers = store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  if (!dossier.sanctionRetenue) return res.status(400).json({ erreur: "Qualifiez d'abord le dossier (sanction retenue)." });

  const { entretien, miseAPiedConservatoire, consignesRedaction, typeCourrier } = req.body || {};
  if (typeCourrier) dossier.typeCourrier = typeCourrier;
  dossier.entretien = entretien || dossier.entretien || null;
  dossier.miseAPiedConservatoire = Boolean(miseAPiedConservatoire);
  dossier.consignesRedaction = consignesRedaction || "";

  const salarie = store.getSalaries().find((s) => s.id === dossier.salarieId);
  const config = store.getConfig();
  try {
    const resultat = await genererCourrier(dossier, salarie, config);
    dossier.courrier = resultat.texte;
    dossier.courrierSimulation = resultat.simulation;
    dossier.statut = "courrier_genere";
    pushHistorique(
      dossier,
      resultat.simulation ? "Courrier généré en mode SIMULATION (pas de clé API)" : `Courrier généré via ${resultat.modele}`
    );
    store.saveDossiers(dossiers);
    res.json(dossier);
  } catch (e) {
    console.error("Erreur génération courrier :", e.message);
    res.status(502).json({ erreur: `Échec de la génération : ${e.message}` });
  }
});

// Édition manuelle du courrier (relecture humaine avant validation).
app.patch("/api/dossiers/:id/courrier", (req, res) => {
  const dossiers = store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  dossier.courrier = req.body.courrier || dossier.courrier;
  pushHistorique(dossier, "Courrier modifié manuellement");
  store.saveDossiers(dossiers);
  res.json(dossier);
});

// Changement de statut (validation, envoi, archivage, sans suite).
app.post("/api/dossiers/:id/statut", (req, res) => {
  const dossiers = store.getDossiers();
  const dossier = dossiers.find((x) => x.id === req.params.id);
  if (!dossier) return res.status(404).json({ erreur: "Dossier introuvable." });
  const { statut, commentaire } = req.body;
  if (!STATUTS.find((s) => s.id === statut)) return res.status(400).json({ erreur: "Statut inconnu." });
  dossier.statut = statut;
  pushHistorique(dossier, `Statut → ${STATUTS.find((s) => s.id === statut).label}${commentaire ? ` (${commentaire})` : ""}`);
  store.saveDossiers(dossiers);
  res.json(dossier);
});

// --- Dashboard ---
app.get("/api/dashboard", (req, res) => {
  const dossiers = store.getDossiers();
  const config = store.getConfig();
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

  // Alertes de délais sur les dossiers en cours (prescription 2 mois).
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
});

// --- Configuration ---
app.get("/api/config", (req, res) => {
  const c = store.getConfig();
  // La clé API n'est jamais renvoyée en clair au navigateur.
  res.json({ ...c, apiKey: c.apiKey ? "********" : "" });
});

app.put("/api/config", (req, res) => {
  const actuel = store.getConfig();
  const maj = { ...actuel, ...req.body };
  // "********" signifie « inchangée »
  if (req.body.apiKey === "********") maj.apiKey = actuel.apiKey;
  store.saveConfig(maj);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`MVP disciplinaire démarré : http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !(store.getConfig() || {}).apiKey) {
    console.log("⚠️  Pas de clé API Anthropic — la génération de courriers fonctionnera en mode SIMULATION.");
  }
});
