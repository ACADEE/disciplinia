// Génère un document Word (.docx) à partir du texte d'un courrier.
// Mise en page professionnelle et sobre, texte brut (pas de Markdown).
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require("docx");

// Sécurité : retire tout Markdown résiduel (au cas où un ancien courrier en contiendrait).
function sansMarkdown(t) {
  return t
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/`([^`]*)`/g, "$1");
}

const POLICE = "Times New Roman";
const TAILLE = 24; // demi-points = 12 pt

function paragraphe(ligne) {
  const texte = ligne.trimEnd();

  // L'objet du courrier est mis en gras (repère visuel classique d'un courrier).
  if (/^objet\s*:/i.test(texte)) {
    return new Paragraph({
      spacing: { before: 120, after: 240 },
      children: [new TextRun({ text: texte, font: POLICE, size: TAILLE, bold: true })],
    });
  }

  // Ligne vide → espacement.
  if (texte === "") {
    return new Paragraph({ children: [new TextRun({ text: "", font: POLICE, size: TAILLE })] });
  }

  // Corps de lettre : justifié pour un rendu soigné.
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 276 }, // interligne ~1,15
    children: [new TextRun({ text: texte, font: POLICE, size: TAILLE })],
  });
}

// Retourne le .docx encodé en base64 (transportable en JSON via serverless-http).
async function courrierEnDocxBase64(dossier) {
  const texte = sansMarkdown((dossier.courrier || "").replace(/\r\n/g, "\n"));
  const paragraphes = texte.split("\n").map(paragraphe);

  const doc = new Document({
    creator: "Disciplina",
    title: `Courrier ${dossier.reference || ""}`.trim(),
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, // ~2 cm
        },
        children: paragraphes,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer.toString("base64");
}

module.exports = { courrierEnDocxBase64 };
