// Données fictives réalistes pour la démonstration.
// GAP: TOUT ce fichier est fictif — entreprise, salariés, dossiers. À remplacer par les
// données réelles (import Excel à prévoir en phase 2).
const store = require("./store");
const { MOTIFS } = require("./catalog");

const CONFIG_DEFAUT = {
  entreprise: {
    // GAP: coordonnées fictives — à remplacer dans Configuration par celles de l'entreprise réelle.
    nom: "Transports Savoie Léman (FICTIF)",
    adresse: "12 avenue du Pont Neuf, 74000 Annecy",
    ville: "Annecy",
    signataire: "Marie-Claude Richet",
    fonctionSignataire: "Directrice des Ressources Humaines",
    conventionCollective: "CCN des transports routiers et activités auxiliaires du transport (IDCC 16)",
  },
  // GAP: règlement intérieur réel à déposer dans Configuration (vide par défaut).
  // Note client : la sanction s'appuie surtout sur le code du travail, le code de la route,
  // les process internes et les règles de courtoisie — le RI n'est que secondaire.
  reglementInterieur: "",
  // Process internes de l'entreprise (base de référence principale). GAP: à renseigner.
  processInternes: "",
  // Règles de courtoisie / savoir-être attendu (base de référence principale). GAP: à renseigner.
  reglesCourtoisie: "",
  // GAP: durée max de mise à pied à confirmer d'après le règlement intérieur réel.
  miseAPiedDureeMaxJours: null,
  // Grille de gravité par défaut — copie éditable du catalogue. GAP: à valider par l'entreprise.
  grille: MOTIFS.map((m) => ({
    motifId: m.id,
    motifLabel: m.label,
    niveau: m.niveauDefaut,
    sanction1: m.sanction1,
    sanctionRecidive: m.sanctionRecidive,
  })),
  modele: "claude-sonnet-5",
  apiKey: "",
};

// Salariés fictifs (conducteurs et personnel d'exploitation, prénoms/noms inventés).
const SALARIES = [
  ["Karim", "Benali", "Conducteur de car scolaire", "2018-03-12"],
  ["Sylvie", "Marchand", "Conductrice ligne régulière", "2015-09-01"],
  ["Thomas", "Perrier", "Conducteur SPL", "2020-06-15"],
  ["Nadia", "Rousset", "Conductrice ligne régulière", "2019-01-07"],
  ["Julien", "Delacroix", "Conducteur de car tourisme", "2016-11-21"],
  ["Marc", "Fontanel", "Conducteur SPL", "2012-04-02"],
  ["Émilie", "Vachoux", "Agente d'exploitation", "2021-02-15"],
  ["Patrick", "Excoffier", "Conducteur de car scolaire", "2010-09-06"],
  ["Laura", "Bergeron", "Conductrice périscolaire", "2022-08-29"],
  ["Mehdi", "Cherif", "Conducteur ligne régulière", "2017-05-10"],
  ["Franck", "Dupessey", "Mécanicien atelier", "2014-10-13"],
  ["Sophie", "Lanvers", "Conductrice SPL", "2019-11-04"],
  ["Antoine", "Gay", "Conducteur de car tourisme", "2013-07-22"],
  ["Céline", "Mermoz", "Agente de planning", "2018-01-08"],
  ["David", "Ruphy", "Conducteur ligne régulière", "2021-05-03"],
].map(([prenom, nom, poste, dateEmbauche], i) => ({
  id: `S${String(i + 1).padStart(3, "0")}`,
  prenom,
  nom,
  poste,
  dateEmbauche,
  adresse: `${10 + i} rue des Fictifs, 740${String(i % 10)}0 Haute-Savoie (ADRESSE FICTIVE)`,
}));

// Dossiers fictifs répartis sur les 12 derniers mois, statuts variés.
function seedDossiers() {
  const cas = [
    // [salarieIdx, motifId, joursAvantAujourdhui, description, statut, sanctionRetenue]
    [0, "retard", 320, "prise de service à 6h55 au lieu de 6h30 au dépôt d'Annecy, ligne scolaire 12 assurée avec 25 minutes de retard, pour la troisième fois du mois", "archive", "avertissement"],
    [1, "exces_vitesse", 290, "excès de vitesse relevé par le chronotachygraphe : 98 km/h sur route limitée à 80 (RD 1508, secteur Sévrier), véhicule immatriculé GA-482-KL avec 34 passagers à bord", "archive", "avertissement"],
    [2, "telephone_volant", 260, "constat par le responsable d'exploitation de l'usage du téléphone tenu en main pendant la conduite sur l'autoroute A41, véhicule en charge", "archive", "avertissement"],
    [5, "temps_conduite", 240, "dépassement du temps de conduite continue de 5h12 sans pause (maximum 4h30), constaté à l'analyse mensuelle des données du chronotachygraphe", "archive", "avertissement"],
    [3, "clients", 210, "propos déplacés et ton agressif envers une usagère de la ligne 3, réclamation écrite reçue le lendemain, confirmée par un second signalement", "archive", "avertissement"],
    [7, "absence_injustifiee", 180, "absence non justifiée sur le service scolaire du matin, tournée assurée en urgence par un remplaçant, aucun justificatif fourni sous 48h malgré relance", "archive", "avertissement"],
    [4, "degradation", 150, "coup de pied volontaire dans la porte avant du car GC-113-PR à la suite d'une altercation au dépôt, devis de réparation de 1 840 € TTC", "archive", "mise_a_pied"],
    [1, "exces_vitesse", 120, "nouvel excès de vitesse : 112 km/h sur voie limitée à 90 (RD 1201), relevé chronotachygraphe, en récidive après l'avertissement notifié cette année", "envoye", "mise_a_pied"],
    [9, "insubordination", 100, "refus explicite d'assurer le service de remplacement demandé conformément au planning modifié, notifié dans les délais prévus par l'accord d'entreprise", "envoye", "avertissement"],
    [11, "securite", 80, "non-réalisation du contrôle de sécurité obligatoire avant départ (tour du véhicule), constatée deux fois par le chef d'exploitation la même semaine", "valide", "avertissement"],
    [6, "retard", 60, "trois retards de prise de poste sur deux semaines (12, 18 et 25 minutes), désorganisation du planning de l'exploitation", "valide", "rappel_ordre"],
    [8, "absence_injustifiee", 45, "absence injustifiée d'une journée complète, service périscolaire annulé faute de remplaçant disponible, aucun justificatif à ce jour", "en_validation", "avertissement"],
    [12, "vol", 30, "constat d'écarts répétés entre les recettes de billetterie encaissées à bord et les sommes remises à l'exploitation, écart cumulé estimé à 460 € sur trois semaines, relevés à l'appui", "courrier_genere", "licenciement_grave"],
    [10, "injures_menaces", 21, "injures et menaces verbales envers un collègue mécanicien devant témoins dans l'atelier du dépôt, rapport écrit du chef d'atelier", "qualifie", null],
    [13, "negligence", 14, "erreur répétée d'affectation des conducteurs sur le planning hebdomadaire ayant entraîné deux services non couverts", "qualifie", null],
    [14, "alcool_stupefiants", 7, "contrôle d'alcoolémie positif (0,42 mg/l d'air expiré) lors d'un contrôle interne avant prise de service, prise de service refusée, salarié raccompagné", "nouveau", null],
    [5, "fraude_tachygraphe", 3, "utilisation de la carte conducteur d'un collègue pour masquer un dépassement des temps de conduite, détectée lors du téléchargement mensuel des données", "nouveau", null],
    [2, "violence", 1, "altercation physique avec un autre conducteur sur le parking du dépôt (coup porté au visage), séparés par des collègues, deux témoins directs", "nouveau", null],
  ];

  return cas.map(([si, motifId, jours, description, statut, sanction], i) => {
    const motif = MOTIFS.find((m) => m.id === motifId);
    const dateFait = new Date(Date.now() - jours * 24 * 3600 * 1000);
    const dateConn = new Date(dateFait.getTime() + 24 * 3600 * 1000);
    const s = SALARIES[si];
    return {
      id: `D${String(i + 1).padStart(4, "0")}`,
      reference: `DISC-${dateFait.getFullYear()}-${String(i + 1).padStart(3, "0")}`,
      salarieId: s.id,
      salarieNom: `${s.prenom} ${s.nom}`,
      motifId,
      motifLabel: motif.label,
      dateFait: dateFait.toISOString().slice(0, 10),
      dateConnaissance: dateConn.toISOString().slice(0, 10),
      lieu: "Dépôt d'Annecy / réseau Haute-Savoie (FICTIF)",
      description,
      temoins: "",
      statut,
      niveauGravite: motif.niveauDefaut,
      sanctionRetenue: sanction,
      typeCourrier: null,
      courrier: statut === "courrier_genere" || statut === "en_validation" || statut === "valide" || statut === "envoye" || statut === "archive"
        ? "⚠️ [SIMULATION — courrier fictif de démonstration issu du jeu de données initial.]\n\nCourrier de démonstration : le contenu réel sera produit par le bouton « Générer le courrier »."
        : null,
      courrierSimulation: true,
      historique: [{ date: new Date(dateConn).toISOString(), action: "Fait saisi (donnée de démonstration fictive)" }],
      creeLe: dateConn.toISOString(),
    };
  });
}

async function seed({ reset = false } = {}) {
  if (reset || !(await store.getConfig())) await store.saveConfig(CONFIG_DEFAUT);
  if (reset || (await store.getSalaries()).length === 0) await store.saveSalaries(SALARIES);
  if (reset || (await store.getDossiers()).length === 0) await store.saveDossiers(seedDossiers());
  await migrerConfig();
}

// Migrations légères sur la config déjà stockée (locale ou Netlify Blobs), appliquées
// à chaque démarrage. Ne remplace que l'ancienne valeur par défaut exacte, pour ne jamais
// écraser une valeur choisie volontairement par l'admin.
async function migrerConfig() {
  const c = await store.getConfig();
  if (!c || !c.entreprise) return;
  if (c.entreprise.signataire === "Anne-Sophie Bertrand") {
    c.entreprise.signataire = "Marie-Claude Richet";
    await store.saveConfig(c);
  }
}

if (require.main === module) {
  seed({ reset: process.argv.includes("--reset") })
    .then(() => console.log("Données de démonstration (ré)initialisées."))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed, CONFIG_DEFAUT };
