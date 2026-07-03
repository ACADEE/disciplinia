// Fonction Netlify DE FOND (le suffixe "-background" est requis) : exécute l'appel IA
// long (jusqu'à 15 min) hors du cycle requête/réponse synchrone → contourne le 504.
// Déclenchée par la fonction api (POST interne), elle renvoie 202 immédiatement.
const { connectLambda } = require("@netlify/blobs");
const { executerGeneration } = require("../../lib/generate");

exports.handler = async (event) => {
  connectLambda(event); // contexte Netlify Blobs (indispensable en mode Lambda)

  // Même code d'accès que l'API si défini (la fonction est appelée en interne avec l'en-tête).
  if (process.env.APP_PASSWORD && event.headers["x-app-password"] !== process.env.APP_PASSWORD) {
    return { statusCode: 401, body: "Non autorisé" };
  }

  let id;
  try {
    id = JSON.parse(event.body || "{}").id;
  } catch {
    id = null;
  }
  if (!id) return { statusCode: 400, body: "Paramètre 'id' manquant" };

  await executerGeneration(id);
  return { statusCode: 200, body: "Génération terminée" };
};
