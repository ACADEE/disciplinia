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

// Retire le formatage Markdown : un courrier administratif est en texte brut.
function nettoyerMarkdown(t) {
  return t
    .replace(/\*\*(.*?)\*\*/gs, "$1") // **gras**
    .replace(/__(.*?)__/gs, "$1") // __gras__
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1") // # titres
    .replace(/`([^`]*)`/g, "$1"); // `code`
}

// Filet de sécurité DÉTERMINISTE : si l'IA a laissé des espaces réservés pour la date,
// l'heure ou le lieu de l'entretien alors que ces valeurs ont été saisies, on les injecte.
// Ne remplace que les motifs « Libellé : [ ... ] » — sans correspondance, aucune modification.
function injecterEntretien(texte, entretien) {
  if (!entretien || !entretien.date) return texte;
  const valeurs = [
    ["Date", dateFr(entretien.date)],
    ["Heure", entretien.heure],
    ["Lieu", entretien.lieu],
  ];
  let t = texte;
  for (const [libelle, valeur] of valeurs) {
    if (!valeur) continue;
    // « Date : [placeholder] » éventuellement précédé de puces/tirets. Insensible à la casse.
    const re = new RegExp(`(${libelle}\\s*:?\\s*)\\[[^\\]]*\\]`, "gi");
    t = t.replace(re, `$1${valeur}`);
  }
  return t;
}

// Nettoyage final commun (IA et simulation) : injection des infos d'entretien + suppression Markdown.
function postTraiter(texte, dossier) {
  return nettoyerMarkdown(injecterEntretien(texte, dossier.entretien)).trim();
}

// Prompt système stable (cache-friendly) : rôle + bases de référence de l'entreprise.
function buildSystem(config) {
  const opt = (v, absent) => (v && v.trim() ? v.trim() : absent);
  const reglement = opt(config.reglementInterieur, "[non déposé — ne citer aucun article du règlement intérieur]");
  const processInternes = opt(config.processInternes, "[non fournis]");
  const reglesCourtoisie = opt(config.reglesCourtoisie, "[non fournies]");

  return `Tu es un juriste en droit du travail français, spécialisé dans les procédures disciplinaires du secteur du transport routier. Tu rédiges des courriers disciplinaires pour l'entreprise suivante :

Entreprise : ${config.entreprise.nom}
Adresse : ${config.entreprise.adresse}
Signataire : ${config.entreprise.signataire}, ${config.entreprise.fonctionSignataire}
Convention collective : ${config.entreprise.conventionCollective}

BASES DE RÉFÉRENCE POUR FONDER LA SANCTION (dans cette entreprise, la sanction s'appuie surtout sur les points 1 à 4 ; le règlement intérieur n'est que secondaire) :
1. CODE DU TRAVAIL — toujours applicable (procédure : L1332-1 à L1332-5 ; L1232-2 pour les convocations).
2. CODE DE LA ROUTE — à mobiliser pour toute infraction de conduite (excès de vitesse, téléphone au volant, alcool/stupéfiants, temps de conduite et de repos, etc.).
3. PROCESSUS INTERNES DE L'ENTREPRISE :
${processInternes}
4. RÈGLES DE COURTOISIE / SAVOIR-ÊTRE ATTENDU :
${reglesCourtoisie}
5. RÈGLEMENT INTÉRIEUR (source secondaire, à ne citer que s'il contient une clause réellement pertinente) :
${reglement}

RÈGLES DE RÉDACTION IMPÉRATIVES :
1. Courrier en français, formel, prêt à imprimer : en-tête entreprise, lieu et date, coordonnées du salarié, objet, mention "Lettre recommandée avec accusé de réception" (ou remise en main propre contre décharge pour un rappel à l'ordre).
2. Exposer les faits de manière précise, datée et circonstanciée, sans jugement de valeur ni qualification pénale (écrire "détournement/appropriation" plutôt que "vol" tant qu'aucune condamnation n'existe ; ne jamais qualifier pénalement les faits).
3. Fonder le courrier sur les bases de référence ci-dessus qui sont pertinentes au fait : citer systématiquement les articles pertinents du Code du travail ; invoquer le Code de la route lorsque le fait est une infraction de conduite ; s'appuyer sur les processus internes et les règles de courtoisie lorsqu'ils sont fournis et pertinents ; ne citer le règlement intérieur que s'il contient une clause précise applicable. Ne jamais inventer d'article ni de référence.
4. Pour une CONVOCATION à entretien préalable : indiquer date, heure, lieu de l'entretien, l'objet (sanction pouvant aller jusqu'à…, sans préjuger), le droit à assistance par une personne de l'entreprise (et conseiller du salarié si licenciement envisagé et absence d'IRP), et le cas échéant la mise à pied conservatoire. IMPÉRATIF : lorsque la date, l'heure et le lieu de l'entretien sont fournis dans le message (marqués « CONFIRMÉES »), reproduis-les EXACTEMENT et ne les remplace JAMAIS par un espace réservé [À COMPLÉTER] — ces informations sont validées par l'employeur. Tu peux, si utile, rappeler en une phrase le délai légal minimum (au moins 5 jours ouvrables après réception pour un licenciement), mais sans effacer les valeurs fournies.
5. Pour une NOTIFICATION de sanction : rappeler l'entretien préalable (date, assistance), les explications du salarié, motiver la sanction, préciser ses modalités (dates de mise à pied, effets), et mentionner les voies de contestation (conseil de prud'hommes).
6. Ne jamais inventer de faits, de dates, de témoins ou d'articles du règlement intérieur. N'insérer un espace réservé [À COMPLÉTER : …] QUE pour une information réellement absente du message — jamais pour une information qui y figure.
7. Ton ferme mais respectueux, proportionné à la gravité. Aucune mention discriminatoire ni référence à la vie privée.
8. Répondre UNIQUEMENT avec le texte du courrier, sans commentaire avant ou après.
9. TEXTE BRUT uniquement : n'utilise AUCUN formatage Markdown (pas de **gras**, de #titres, de \`code\`, ni de listes à puces Markdown). C'est un courrier administratif à imprimer.`;
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
    const ent = dossier.entretien || {};
    if (ent.date) {
      lignes.push(
        ``,
        `ENTRETIEN PRÉALABLE — informations CONFIRMÉES par l'employeur, à reproduire EXACTEMENT dans le courrier (ne JAMAIS les remplacer par un espace réservé [À COMPLÉTER]) :`,
        `- Date : ${dateFr(ent.date)}`,
        `- Heure : ${ent.heure || "[À COMPLÉTER : heure]"}`,
        `- Lieu : ${ent.lieu || config.entreprise.adresse}`
      );
    } else {
      lignes.push(
        ``,
        `ENTRETIEN PRÉALABLE : [À COMPLÉTER : date, heure et lieu de l'entretien — prévoir au moins 5 jours ouvrables après première présentation de la convocation si un licenciement est envisagé]`
      );
    }
    if (dossier.miseAPiedConservatoire) {
      lignes.push(`MISE À PIED CONSERVATOIRE : oui, à mentionner (effet immédiat).`);
    }
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
      texte: postTraiter(courrierSimule(dossier, salarie, config), dossier),
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

  const brut = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (response.stop_reason === "max_tokens") {
    throw new Error("Le courrier a été tronqué (max_tokens atteint). Réessayer.");
  }
  // Filet de sécurité : injecte les infos d'entretien saisies et retire le Markdown.
  return { texte: postTraiter(brut, dossier), simulation: false, modele: response.model };
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
      ? `vous convoquons à un entretien préalable à une éventuelle sanction disciplinaire, aux date, heure et lieu suivants :

Date : ${dossier.entretien && dossier.entretien.date ? dateFr(dossier.entretien.date) : "[À COMPLÉTER : date]"}
Heure : ${dossier.entretien && dossier.entretien.heure ? dossier.entretien.heure : "[À COMPLÉTER : heure]"}
Lieu : ${dossier.entretien && dossier.entretien.lieu ? dossier.entretien.lieu : config.entreprise.adresse}

Vous pouvez vous faire assister par une personne de votre choix appartenant au personnel de l'entreprise.`
      : `vous notifions par la présente la sanction suivante : ${sanctionLabel}.`
  }

Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.

${config.entreprise.signataire}
${config.entreprise.fonctionSignataire}`;
}

module.exports = { genererCourrier, buildSystem, buildUserPrompt, injecterEntretien, nettoyerMarkdown };
