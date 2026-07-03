// Génère un document Word (.docx) à partir du texte d'un courrier.
// Le courrier est un texte brut avec sauts de ligne : chaque ligne devient un paragraphe.
const { Document, Packer, Paragraph, TextRun } = require("docx");

// Retourne le .docx encodé en base64 (transportable en JSON via serverless-http,
// sans se soucier de l'encodage binaire des réponses Netlify).
async function courrierEnDocxBase64(dossier) {
  const texte = dossier.courrier || "";
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");

  const paragraphes = lignes.map(
    (ligne) =>
      new Paragraph({
        spacing: { after: 120, line: 276 },
        children: [new TextRun({ text: ligne, font: "Times New Roman", size: 24 })], // 24 demi-points = 12 pt
      })
  );

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
