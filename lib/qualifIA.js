// Proposition de sanction par l'IA : lit la description libre du fait, la grille de gravité
// de l'entreprise et propose la sanction la plus appropriée parmi les sanctions autorisées.
// Renvoie null si pas de clé API (on retombe alors sur la proposition déterministe).
const Anthropic = require("@anthropic-ai/sdk");
const { SANCTIONS } = require("./catalog");

async function proposerSanctionIA(dossier, config, propositionDeterministe) {
  const apiKey = process.env.ANTHROPIC_API_KEY || config.apiKey || null;
  if (!apiKey || !dossier.description) return null;

  const regle = (config.grille || []).find((g) => g.motifId === dossier.motifId) || {};
  const sanctionsListe = SANCTIONS.map((s) => `- ${s.id} : ${s.label} (niveau ${s.niveau})`).join("\n");

  const system = `Tu es un expert RH en discipline dans le transport routier. À partir de la description d'un fait, du motif et de la grille de gravité de l'entreprise, tu proposes la sanction LA PLUS APPROPRIÉE parmi la liste autorisée. Un même motif peut être plus ou moins grave selon les circonstances décrites : ajuste la sanction en conséquence (à la hausse pour un fait aggravé, à la baisse pour un fait mineur), en restant proportionné et conforme au droit du travail. Réponds UNIQUEMENT par un objet JSON, sans texte autour : {"sanctionId":"<id>","niveau":<1-4>,"justification":"<une phrase>"}. "sanctionId" DOIT être exactement l'un des identifiants de la liste autorisée.`;

  const user = `MOTIF : ${dossier.motifLabel}
GRILLE POUR CE MOTIF : niveau ${regle.niveau ?? "?"} ; sanction 1re occurrence = ${regle.sanction1 ?? "?"} ; sanction en récidive = ${regle.sanctionRecidive ?? "?"}
RÉCIDIVE DÉTECTÉE POUR CE SALARIÉ : ${propositionDeterministe && propositionDeterministe.recidive ? "oui" : "non"}

DESCRIPTION DU FAIT RAPPORTÉ :
${dossier.description}

SANCTIONS AUTORISÉES (choisir un id exactement dans cette liste) :
${sanctionsListe}`;

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: config.modele || "claude-sonnet-5",
    max_tokens: 500,
    system,
    messages: [{ role: "user", content: user }],
  });

  const texte = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const bloc = texte.match(/\{[\s\S]*\}/);
  if (!bloc) return null;
  let parsed;
  try {
    parsed = JSON.parse(bloc[0]);
  } catch {
    return null;
  }
  const sanction = SANCTIONS.find((s) => s.id === parsed.sanctionId);
  if (!sanction) return null;
  const niveau = Number(parsed.niveau);
  return {
    sanctionProposee: sanction.id,
    niveauGravite: niveau >= 1 && niveau <= 4 ? niveau : sanction.niveau || (propositionDeterministe && propositionDeterministe.niveauGravite) || 2,
    justification: String(parsed.justification || "").slice(0, 400),
    parIA: true,
  };
}

module.exports = { proposerSanctionIA };
