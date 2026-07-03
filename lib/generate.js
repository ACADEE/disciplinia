// Worker de génération de courrier, partagé entre :
//  - le serveur local (server.js) : lancé en tâche de fond (Node reste vivant) ;
//  - la fonction Netlify de fond (netlify/functions/generer-background.js) : jusqu'à 15 min.
// Sépare l'appel IA (long) de la requête HTTP → plus de timeout 504 sur Netlify.
const store = require("./store");
const { genererCourrier } = require("./letter");

function pushHistorique(dossier, action) {
  dossier.historique = dossier.historique || [];
  dossier.historique.push({ date: new Date().toISOString(), action });
}

// Effectue réellement la génération et enregistre le résultat sur le dossier.
async function executerGeneration(id) {
  const dossiers = await store.getDossiers();
  const dossier = dossiers.find((x) => x.id === id);
  if (!dossier) {
    console.error(`Génération : dossier ${id} introuvable.`);
    return;
  }
  try {
    const salarie = (await store.getSalaries()).find((s) => s.id === dossier.salarieId);
    const config = await store.getConfig();
    const resultat = await genererCourrier(dossier, salarie, config);
    dossier.courrier = resultat.texte;
    dossier.courrierSimulation = resultat.simulation;
    dossier.statut = "courrier_genere";
    dossier.generation = { statut: "termine", termineLe: new Date().toISOString(), simulation: resultat.simulation };
    pushHistorique(
      dossier,
      resultat.simulation ? "Courrier généré en mode SIMULATION (pas de clé API)" : `Courrier généré via ${resultat.modele}`
    );
  } catch (e) {
    console.error(`Génération ${id} échouée :`, e.message);
    dossier.generation = { statut: "erreur", message: e.message, termineLe: new Date().toISOString() };
    pushHistorique(dossier, `Échec de la génération : ${e.message}`);
  }
  // Relire avant d'écrire pour ne pas écraser d'éventuelles modifs concurrentes d'autres dossiers.
  const frais = await store.getDossiers();
  const idx = frais.findIndex((x) => x.id === id);
  if (idx >= 0) {
    frais[idx] = dossier;
    await store.saveDossiers(frais);
  }
}

module.exports = { executerGeneration };
