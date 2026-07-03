# Disciplina — MVP de gestion des procédures disciplinaires

Application pour une entreprise de transport (Haute-Savoie, ~640 dossiers/an) : transforme un fait rapporté en courrier disciplinaire conforme au règlement intérieur et au droit du travail, avec dashboard de synthèse pour la direction.

## Démarrage

```bash
npm install
npm start          # → http://localhost:3005
```

Clé API Anthropic (génération des courriers par `claude-sonnet-5`) :
- soit variable d'environnement `ANTHROPIC_API_KEY` (recommandé — voir `.env.example`),
- soit saisie dans l'onglet **Configuration** (stockée en local dans `data/config.json`).

Sans clé, l'application fonctionne intégralement en **mode simulation** (courriers gabarits marqués `[SIMULATION]`).

`npm run seed` réinitialise les données de démonstration (en local).

## Déploiement Netlify

Le dépôt est prêt pour Netlify : frontend statique (`public/`) + API dans une fonction serverless (`netlify/functions/api.js`, Express encapsulé par `serverless-http`) + données dans **Netlify Blobs** (persistantes entre déploiements). La configuration est dans `netlify.toml` — rien à régler dans l'interface Netlify côté build.

À définir dans **Site settings → Environment variables** puis redéployer :

| Variable | Rôle |
|----------|------|
| `APP_PASSWORD` | Code d'accès demandé par l'application (**indispensable** : sans lui, le site est ouvert à tous) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (sinon mode simulation) |

Limites du déploiement en ligne : code d'accès unique partagé (pas de comptes/rôles — phase 2), écritures concurrentes non verrouillées (dernier enregistrement gagne).

## Sauvegarde des données

Les données en ligne sont stockées dans **Netlify Blobs** (persistant entre déploiements) mais **sans sauvegarde automatique**. Depuis l'onglet **Configuration → Sauvegarde des données**, bouton **« Télécharger une sauvegarde »** : un fichier JSON daté (`disciplina-sauvegarde-AAAA-MM-JJ.json`) contenant tous les dossiers, salariés et la configuration (la clé API n'y figure jamais). **À faire régulièrement** (ex. chaque semaine) et à conserver en lieu sûr. C'est aussi le format de reprise si l'on migre vers un vrai SQL plus tard.

## Migrer vers un vrai SQL plus tard (phase 2)

Tout le stockage passe par une couche unique — [lib/store.js](lib/store.js), avec les signatures async `getDossiers/saveDossiers/getSalaries/saveSalaries/getConfig/saveConfig`. Passer à une vraie base ne demande de réécrire **que ce fichier**, sans toucher au reste de l'app. Cibles possibles : **SQLite sur un petit serveur FR/EU** (OVH/Scaleway/Render+disque — maîtrise des données sensibles, bon pour le RGPD) ou **Postgres managé EU**. L'export JSON ci-dessus sert de format de reprise pour réinjecter les données existantes.

## Workflow couvert (bout en bout)

1. **Saisie du fait** — salarié, motif (18 motifs : vol, excès de vitesse, violence, alcool, fraude chronotachygraphe…), dates, description circonstanciée, témoins.
2. **Qualification** — proposition automatique (grille de gravité + détection de récidive < 3 ans) avec garde-fous juridiques : prescription 2 mois (L1332-4), entretien préalable obligatoire (L1332-2), non bis in idem, durée max de mise à pied, faute lourde = intention de nuire. **La décision finale reste humaine** (sanction modifiable).
3. **Génération du courrier** — convocation à entretien préalable, notification de sanction, avertissement ou rappel à l'ordre, rédigé par l'API Anthropic à partir du règlement intérieur déposé. Éditable, imprimable (Ctrl+P → PDF).
4. **Validation** — circuit courrier généré → en validation → validé → envoyé → archivé (ou classé sans suite).
5. **Dashboard direction** — volumes, répartition par motif/mois/statut, salariés les plus concernés, alertes de prescription.

## ⚠️ Manques comblés par des données fictives (à remplacer)

| # | Manque | Où le combler |
|---|--------|----------------|
| 1 | **Règlement intérieur réel** — absent ; les courriers ne citent que le Code du travail | Configuration → coller le texte ou charger un .txt/.md |
| 2 | **Grille de gravité réelle** — grille générique proposée par l'outil | Configuration → tableau éditable |
| 3 | **Entreprise fictive** « Transports Savoie Léman », adresse, signataire | Configuration → bloc Entreprise |
| 4 | **Salariés et dossiers fictifs** (15 salariés, 18 dossiers inventés) | `npm run seed` après import des vraies données |
| 5 | **Clé API Anthropic** — seule Anne-Sophie/Samuel peuvent la fournir | `.env` ou Configuration |
| 6 | **Durée max de mise à pied** du règlement intérieur réel | Configuration |
| 7 | Import des **640 dossiers Excel existants** | Non couvert par le MVP — phase 2 |
| 8 | Dépôt du règlement en **PDF/DOCX** (extraction de texte) | Phase 2 — copier-coller en attendant |
| 9 | **Envoi réel** des courriers (LRAR électronique, e-mail) | Phase 2 — le statut « envoyé » est déclaratif |
| 10 | **Multi-utilisateurs / droits** (RH vs direction) | Phase 2 — accès par code unique partagé (`APP_PASSWORD`) en attendant |

Chaque manque est aussi marqué `GAP:` dans le code et signalé par un bandeau ⚠️ dans l'interface.

## Avertissement

Cet outil **assiste** la procédure disciplinaire, il ne remplace ni la DRH ni un avocat. Chaque courrier doit être relu et validé par un humain avant envoi (c'est le rôle de l'étape « validation »).

## Structure

```
server.js            API Express + statique
lib/catalog.js       Motifs, sanctions, statuts, types de courrier
lib/qualification.js Grille + garde-fous droit du travail
lib/letter.js        Génération via API Anthropic (claude-sonnet-5) + fallback simulation
lib/seed.js          Données fictives (config, salariés, dossiers)
lib/store.js         Persistance JSON (data/)
public/              Frontend (vanilla JS, français)
lessons.md           Mémoire de session (à lire au démarrage, enrichir à la fin)
```
