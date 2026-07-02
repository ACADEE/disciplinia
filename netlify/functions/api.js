// Netlify Function : encapsule l'application Express complète.
// Les requêtes /api/* y sont redirigées par netlify.toml.
const serverless = require("serverless-http");
const { app, ready } = require("../../lib/app");

const handler = serverless(app);

exports.handler = async (event, context) => {
  await ready; // données initialisées (Netlify Blobs) avant la première requête
  return handler(event, context);
};
