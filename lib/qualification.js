// Qualification d'un fait : propose un niveau de gravité, une sanction et un type de courrier,
// en appliquant la grille de gravité (Configuration) et les garde-fous du droit du travail.
// La proposition reste modifiable par l'utilisateur : l'outil assiste, il ne décide pas.
const { SANCTIONS } = require("./catalog");

const JOUR_MS = 24 * 3600 * 1000;

function sanctionById(id) {
  return SANCTIONS.find((s) => s.id === id) || SANCTIONS[1];
}

// Récidive : sanctions antérieures du même salarié datant de moins de 3 ans
// (art. L1332-5 : une sanction de plus de 3 ans ne peut plus être invoquée).
function historiqueInvocable(dossiers, salarieId, dossierId) {
  const limite = Date.now() - 3 * 365 * JOUR_MS;
  return dossiers.filter(
    (d) =>
      d.id !== dossierId &&
      d.salarieId === salarieId &&
      ["valide", "envoye", "archive"].includes(d.statut) &&
      d.sanctionRetenue &&
      d.sanctionRetenue !== "rappel_ordre" &&
      new Date(d.dateFait).getTime() > limite
  );
}

function qualifier(dossier, grille, dossiers, config) {
  const regle = grille.find((g) => g.motifId === dossier.motifId);
  const alertes = [];

  // GAP: si le motif n'est pas dans la grille de l'entreprise, on retombe sur une
  // proposition prudente (avertissement) — à compléter dans Configuration.
  if (!regle) {
    alertes.push({
      niveau: "warning",
      texte: `Le motif « ${dossier.motifId} » n'est pas couvert par la grille de gravité configurée. Proposition prudente par défaut — complétez la grille dans Configuration.`,
    });
  }

  const antecedents = historiqueInvocable(dossiers, dossier.salarieId, dossier.id);
  const recidive = antecedents.length > 0;
  const base = regle || { niveau: 2, sanction1: "avertissement", sanctionRecidive: "mise_a_pied" };
  const sanctionProposee = recidive ? base.sanctionRecidive : base.sanction1;
  const sanctionInfo = sanctionById(sanctionProposee);

  // --- Garde-fous légaux ---

  // Prescription : engagement des poursuites dans les 2 mois suivant la connaissance du fait (L1332-4).
  const dateConnaissance = new Date(dossier.dateConnaissance || dossier.dateFait);
  const joursEcoules = Math.floor((Date.now() - dateConnaissance.getTime()) / JOUR_MS);
  const joursRestants = 60 - joursEcoules;
  if (joursRestants < 0) {
    alertes.push({
      niveau: "danger",
      texte: `PRESCRIPTION PROBABLE : le fait est connu depuis ${joursEcoules} jours (> 2 mois, art. L1332-4). Vérifier si des poursuites ont été engagées à temps ou si le fait peut se rattacher à un fait nouveau.`,
    });
  } else if (joursRestants <= 15) {
    alertes.push({
      niveau: "warning",
      texte: `Délai de prescription : il reste ${joursRestants} jour(s) pour engager la procédure (2 mois à compter de la connaissance du fait, art. L1332-4).`,
    });
  }

  // Entretien préalable obligatoire pour les sanctions lourdes (L1332-2).
  let typeCourrier;
  if (sanctionInfo.entretienRequis) {
    typeCourrier = "convocation";
    alertes.push({
      niveau: "info",
      texte: `La sanction envisagée (${sanctionInfo.label}) impose un entretien préalable : convocation d'abord, notification au minimum 2 jours ouvrables et au maximum 1 mois après l'entretien (art. L1332-2).`,
    });
  } else if (sanctionProposee === "rappel_ordre") {
    typeCourrier = "rappel_ordre";
  } else {
    typeCourrier = "notification_simple";
  }

  // Mise à pied : durée maximale à prévoir au règlement intérieur.
  if (sanctionProposee === "mise_a_pied") {
    const dureeMax = config && config.miseAPiedDureeMaxJours;
    alertes.push({
      niveau: "info",
      texte: dureeMax
        ? `Mise à pied disciplinaire : durée maximale prévue au règlement intérieur = ${dureeMax} jour(s).`
        : `GAP: la durée maximale de mise à pied prévue au règlement intérieur n'est pas configurée — la sanction serait annulable sans cette mention. À renseigner dans Configuration.`,
    });
  }

  // Non bis in idem : un même fait ne peut être sanctionné deux fois.
  const memeFait = dossiers.find(
    (d) =>
      d.id !== dossier.id &&
      d.salarieId === dossier.salarieId &&
      d.motifId === dossier.motifId &&
      d.dateFait === dossier.dateFait &&
      !["sans_suite"].includes(d.statut)
  );
  if (memeFait) {
    alertes.push({
      niveau: "danger",
      texte: `Un dossier existe déjà pour ce salarié, ce motif et cette date (${memeFait.reference}). Un même fait ne peut pas être sanctionné deux fois (non bis in idem).`,
    });
  }

  // Faute lourde : intention de nuire requise.
  if (sanctionProposee === "licenciement_lourde") {
    alertes.push({
      niveau: "warning",
      texte: "La faute lourde suppose une intention de nuire à l'employeur, à démontrer. À défaut, retenir la faute grave.",
    });
  }

  if (recidive) {
    alertes.push({
      niveau: "info",
      texte: `Récidive : ${antecedents.length} sanction(s) antérieure(s) de moins de 3 ans invocable(s) (${antecedents
        .map((a) => `${a.reference} — ${a.motifLabel}`)
        .join(", ")}).`,
    });
  }

  return {
    niveauGravite: base.niveau,
    sanctionProposee,
    typeCourrier,
    recidive,
    antecedents: antecedents.map((a) => ({ reference: a.reference, motifLabel: a.motifLabel, dateFait: a.dateFait, sanction: a.sanctionRetenue })),
    alertes,
  };
}

module.exports = { qualifier, sanctionById };
