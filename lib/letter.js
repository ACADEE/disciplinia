// Génération du courrier disciplinaire via l'API Anthropic (modèle demandé : claude-sonnet-5).
// Sans clé API (ANTHROPIC_API_KEY ou Configuration), une lettre de SIMULATION est produite
// pour que le workflow reste testable de bout en bout.
const Anthropic = require("@anthropic-ai/sdk");
const { SANCTIONS, MOTIFS, TYPES_COURRIER } = require("./catalog");

function labelOf(list, id) {
  const item = list.find((x) => x.id === id);
  return item ? item.label : id;
}

function dateFr(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Prompt système stable (cache-friendly) : rôle + cadre juridique + règlement intérieur.
function buildSystem(config) {
  const reglement =
    config.reglementInterieur && config.reglementInterieur.trim()
      ? config.reglementInterieur
      : "[GAP: aucun règlement intérieur déposé dans la Configuration — ne citer aucun article du règlement intérieur, s'appuyer uniquement sur le Code du travail.]";

  return `Tu es un juriste en droit du travail français, spécialisé dans les procédures disciplinaires du secteur du transport routier. Tu rédiges des courriers disciplinaires pour l'entreprise suivante :

Entreprise : ${config.entreprise.nom}
Adresse : ${config.entreprise.adresse}
Signataire : ${config.entreprise.signataire}, ${config.entreprise.fonctionSignataire}
Convention collective : ${config.entreprise.conventionCollective}

RÈGLEMENT INTÉRIEUR DE L'ENTREPRISE :
${reglement}

RÈGLES DE RÉDACTION IMPÉRATIVES :
1. Courrier en français, formel, prêt à imprimer : en-tête entreprise, lieu et date, coordonnées du salarié, objet, mention "Lettre recommandée avec accusé de réception" (ou remise en main propre contre décharge pour un rappel à l'ordre).
2. Exposer les faits de manière précise, datée et circonstanciée, sans jugement de valeur ni qualification pénale (écrire "détournement/appropriation" plutôt que "vol" tant qu'aucune condamnation n'existe ; ne jamais qualifier pénalement les faits).
3. Citer les articles pertinents du Code du travail (L1332-1 à L1332-5, L1232-2 pour les convocations) et, si un règlement intérieur est fourni ci-dessus, les articles précis de ce règlement.
4. Pour une CONVOCATION à entretien préalable : indiquer date, heure, lieu de l'entretien, l'objet (sanction pouvant aller jusqu'à…, sans préjuger), le droit à assistance par une personne de l'entreprise (et conseiller du salarié si licenciement envisagé et absence d'IRP), et le cas échéant la mise à pied conservatoire.
5. Pour une NOTIFICATION de sanction : rappeler l'entretien préalable (date, assistance), les explications du salarié, motiver la sanction, préciser ses modalités (dates de mise à pied, effets), et mentionner les voies de contestation (conseil de prud'hommes).
6. Ne jamais inventer de faits, de dates, de témoins ou d'articles du règlement intérieur. Si une information nécessaire manque, insérer un espace réservé entre crochets : [À COMPLÉTER : …].
7. Ton ferme mais respectueux, proportionné à la gravité. Aucune mention discriminatoire ni référence à la vie privée.
8. Répondre UNIQUEMENT avec le texte du courrier, sans commentaire avant ou après.`;
}

function buildUserPrompt(dossier, salarie, config) {
  const sanctionLabel = labelOf(SANCTIONS, dossier.sanctionRetenue);
  const lignes = [
    `TYPE DE COURRIER À RÉDIGER : ${labelOf(TYPES_COURRIER, dossier.typeCourrier)}`,
    ``,
    `SALARIÉ :`,
    `- Nom : ${salarie.prenom} ${salarie.nom}`,
    `- Poste : ${salarie.poste}`,
    `- Adresse : ${salarie.adresse || "[À COMPLÉTER : adresse du salarié]"}`,
    `- Date d'embauche : ${dateFr(salarie.dateEmbauche)}`,
    ``,
    `FAIT REPROCHÉ :`,
    `- Motif : ${dossier.motifLabel}`,
    `- Date du fait : ${dateFr(dossier.dateFait)}`,
    `- Lieu : ${dossier.lieu || "[À COMPLÉTER : lieu]"}`,
    `- Description circonstanciée : ${dossier.description}`,
    dossier.temoins ? `- Témoins / éléments de preuve : ${dossier.temoins}` : null,
    ``,
    `QUALIFICATION RETENUE :`,
    `- Niveau de gravité : ${dossier.niveauGravite}/4`,
    `- Sanction : ${sanctionLabel}`,
    dossier.recidive
      ? `- Récidive : oui — antécédents invocables : ${(dossier.antecedents || [])
          .map((a) => `${a.motifLabel} (${dateFr(a.dateFait)}, ${labelOf(SANCTIONS, a.sanction)})`)
          .join(" ; ")}`
      : `- Récidive : non (première occurrence invocable)`,
  ];
  if (dossier.typeCourrier === "convocation") {
    lignes.push(
      ``,
      `ENTRETIEN PRÉALABLE : ${
        dossier.entretien && dossier.entretien.date
          ? `le ${dateFr(dossier.entretien.date)} à ${dossier.entretien.heure || "[À COMPLÉTER : heure]"}, lieu : ${dossier.entretien.lieu || config.entreprise.adresse}`
          : `[À COMPLÉTER : date, heure et lieu de l'entretien — prévoir au moins 5 jours ouvrables après première présentation de la convocation si un licenciement est envisagé]`
      }`,
      dossier.miseAPiedConservatoire ? `MISE À PIED CONSERVATOIRE : oui, à mentionner (effet immédiat).` : null
    );
  }
  if (dossier.consignesRedaction) {
    lignes.push(``, `CONSIGNES PARTICULIÈRES DU RÉDACTEUR : ${dossier.consignesRedaction}`);
  }
  return lignes.filter((l) => l !== null).join("\n");
}

async function genererCourrier(dossier, salarie, config) {
  const apiKey = process.env.ANTHROPIC_API_KEY || config.apiKey || null;

  if (!apiKey) {
    return {
      texte: courrierSimule(dossier, salarie, config),
      simulation: true,
      modele: null,
    };
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: config.modele || "claude-sonnet-5",
    max_tokens: 8000,
    system: [{ type: "text", text: buildSystem(config), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserPrompt(dossier, salarie, config) }],
  });

  const texte = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (response.stop_reason === "max_tokens") {
    throw new Error("Le courrier a été tronqué (max_tokens atteint). Réessayer.");
  }
  return { texte, simulation: false, modele: response.model };
}

// Lettre gabarit utilisée uniquement sans clé API, pour tester le workflow.
function courrierSimule(dossier, salarie, config) {
  const sanctionLabel = labelOf(SANCTIONS, dossier.sanctionRetenue);
  return `⚠️ [SIMULATION — généré sans appel à l'API Anthropic. Renseignez la clé API dans Configuration pour obtenir un courrier rédigé par claude-sonnet-5.]

${config.entreprise.nom}
${config.entreprise.adresse}

${salarie.prenom} ${salarie.nom}
${salarie.adresse || "[À COMPLÉTER : adresse du salarié]"}

Lettre recommandée avec accusé de réception

${config.entreprise.ville || "Annecy"}, le ${dateFr(new Date().toISOString())}

Objet : ${labelOf(TYPES_COURRIER, dossier.typeCourrier)} — ${dossier.motifLabel}

Madame, Monsieur,

Nous avons constaté les faits suivants : le ${dateFr(dossier.dateFait)}, ${dossier.description}

Ces faits constituent un manquement à vos obligations professionnelles. Conformément aux articles L1332-1 et suivants du Code du travail, nous ${
    dossier.typeCourrier === "convocation"
      ? `vous convoquons à un entretien préalable à une éventuelle sanction disciplinaire, le [À COMPLÉTER : date] à [À COMPLÉTER : heure], au ${config.entreprise.adresse}. Vous pouvez vous faire assister par une personne de votre choix appartenant au personnel de l'entreprise.`
      : `vous notifions par la présente la sanction suivante : ${sanctionLabel}.`
  }

Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.

${config.entreprise.signataire}
${config.entreprise.fonctionSignataire}`;
}

module.exports = { genererCourrier };
