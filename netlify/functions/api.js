// Netlify Function : encapsule l'application Express complète.
// Les requêtes /api/* y sont redirigées par netlify.toml.
const { connectLambda } = require("@netlify/blobs");
const serverless = require("serverless-http");
const { app, ensureReady } = require("../../lib/app");

const handler = serverless(app);

exports.handler = async (event, context) => {
  // IMPÉRATIF avant tout accès à Netlify Blobs dans une fonction en mode Lambda :
  // connecte le contexte Blobs (URL + token) à partir de l'event. Sans cet appel,
  // getStore() lève une erreur et toute l'API renvoie 500.
  connectLambda(event);
  await ensureReady(); // seed des données (config + démo) au premier appel
  return handler(event, context);
};
