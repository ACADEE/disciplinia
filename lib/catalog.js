// Catalogue métier : motifs disciplinaires, échelle des sanctions, grille de gravité par défaut.
// GAP: cette grille par défaut est une proposition générique. Elle doit être remplacée par la
// grille réelle de l'entreprise via l'onglet Configuration (elle y est entièrement éditable).

// Échelle des sanctions (droit du travail français, secteur privé).
const SANCTIONS = [
  { id: "rappel_ordre", label: "Rappel à l'ordre (non disciplinaire)", entretienRequis: false, niveau: 0 },
  { id: "avertissement", label: "Avertissement", entretienRequis: false, niveau: 1 },
  { id: "blame", label: "Blâme", entretienRequis: false, niveau: 1 },
  { id: "mise_a_pied", label: "Mise à pied disciplinaire", entretienRequis: true, niveau: 2 },
  { id: "mutation", label: "Mutation disciplinaire", entretienRequis: true, niveau: 2 },
  { id: "retrogradation", label: "Rétrogradation", entretienRequis: true, niveau: 2 },
  { id: "licenciement_simple", label: "Licenciement pour faute simple (cause réelle et sérieuse)", entretienRequis: true, niveau: 3 },
  { id: "licenciement_grave", label: "Licenciement pour faute grave", entretienRequis: true, niveau: 4 },
  { id: "licenciement_lourde", label: "Licenciement pour faute lourde", entretienRequis: true, niveau: 4 },
];

// Motifs disciplinaires — couverture large adaptée au transport routier de voyageurs/marchandises.
// niveauDefaut : 1 = faute légère, 2 = faute sérieuse, 3 = faute grave potentielle, 4 = faute grave/lourde.
// sanction1 = sanction proposée en première occurrence, sanctionRecidive = en cas de récidive (< 3 ans).
const MOTIFS = [
  { id: "retard", label: "Retards répétés / non-respect des horaires", niveauDefaut: 1, sanction1: "rappel_ordre", sanctionRecidive: "avertissement" },
  { id: "absence_injustifiee", label: "Absence injustifiée", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "abandon_poste", label: "Abandon de poste", niveauDefaut: 3, sanction1: "mise_a_pied", sanctionRecidive: "licenciement_grave" },
  { id: "insubordination", label: "Insubordination / refus d'exécuter une consigne", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "exces_vitesse", label: "Excès de vitesse", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "telephone_volant", label: "Usage du téléphone au volant", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "temps_conduite", label: "Non-respect des temps de conduite / de repos", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "fraude_tachygraphe", label: "Fraude au chronotachygraphe / carte conducteur", niveauDefaut: 4, sanction1: "licenciement_grave", sanctionRecidive: "licenciement_grave" },
  { id: "alcool_stupefiants", label: "Alcool ou stupéfiants au volant / en service", niveauDefaut: 4, sanction1: "licenciement_grave", sanctionRecidive: "licenciement_grave" },
  { id: "vol", label: "Vol (carburant, recettes, matériel, marchandises…)", niveauDefaut: 4, sanction1: "licenciement_grave", sanctionRecidive: "licenciement_grave" },
  { id: "violence", label: "Violence physique / agression", niveauDefaut: 4, sanction1: "licenciement_grave", sanctionRecidive: "licenciement_grave" },
  { id: "injures_menaces", label: "Injures, menaces, comportement irrespectueux", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "harcelement", label: "Harcèlement moral ou sexuel", niveauDefaut: 4, sanction1: "licenciement_grave", sanctionRecidive: "licenciement_grave" },
  { id: "degradation", label: "Dégradation volontaire de matériel / véhicule", niveauDefaut: 3, sanction1: "mise_a_pied", sanctionRecidive: "licenciement_grave" },
  { id: "securite", label: "Non-respect des consignes de sécurité", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "clients", label: "Comportement inapproprié envers usagers / clients", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
  { id: "negligence", label: "Négligence professionnelle / faute de conduite", niveauDefaut: 1, sanction1: "rappel_ordre", sanctionRecidive: "avertissement" },
  { id: "autre", label: "Autre motif (à préciser)", niveauDefaut: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" },
];

// Statuts du workflow, dans l'ordre.
const STATUTS = [
  { id: "nouveau", label: "Fait saisi" },
  { id: "qualifie", label: "Qualifié" },
  { id: "courrier_genere", label: "Courrier généré" },
  { id: "en_validation", label: "En validation" },
  { id: "valide", label: "Validé" },
  { id: "envoye", label: "Envoyé" },
  { id: "archive", label: "Archivé" },
  { id: "sans_suite", label: "Classé sans suite" },
];

const TYPES_COURRIER = [
  { id: "rappel_ordre", label: "Courrier de rappel à l'ordre" },
  { id: "notification_simple", label: "Notification de sanction (avertissement / blâme)" },
  { id: "convocation", label: "Convocation à entretien préalable" },
  { id: "notification_sanction", label: "Notification de sanction (après entretien)" },
];

module.exports = { SANCTIONS, MOTIFS, STATUTS, TYPES_COURRIER };
