// Lanceur local — l'application Express vit dans lib/app.js (partagée avec la
// Netlify Function pour le déploiement en ligne).
// Démarrage : npm start  →  http://localhost:3005
const { app, ensureReady } = require("./lib/app");

const PORT = process.env.PORT || 3005;

ensureReady().then(() => {
  app.listen(PORT, () => {
    console.log(`MVP disciplinaire démarré : http://localhost:${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("ℹ️  Pas de clé API dans l'environnement — vérifiez l'onglet Configuration, sinon mode SIMULATION.");
    }
    if (!process.env.APP_PASSWORD) {
      console.log("ℹ️  APP_PASSWORD non défini — accès sans code (normal en local).");
    }
  });
});
