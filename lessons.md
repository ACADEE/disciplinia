# lessons.md — mémoire du projet

> **Résumé** : MVP de gestion disciplinaire pour une entreprise de transport (Haute-Savoie, ~640 dossiers/an). Node/Express + stockage JSON + API Anthropic (claude-sonnet-5) pour la génération des courriers. À lire au démarrage de chaque session, à enrichir à la fin.

## Règles de travail convenues avec Samuel
- Lire ce fichier au démarrage de chaque session, ajouter une leçon à la fin de chaque session.
- N'interrompre que pour : action irréversible, changement de scope, info que seul Samuel peut fournir.
- Noter clairement chaque endroit où un manque est comblé par des données fictives (marqueur `GAP:` dans le code, section « Manques à combler » du README, bandeaux ⚠️ dans l'UI).

## Leçons par session

### Session 1 — 2026-07-02 (création du MVP)
- Samuel a annoncé « trois ajustements » mais un seul a été décrit (ce fichier lessons.md). **Les deux autres ajustements restent à préciser par Samuel.**
- Choix techniques : Express + fichiers JSON (pas de base de données ni de dépendance native → installation fiable sous Windows/OneDrive). Frontend vanilla JS servi en statique.
- Modèle demandé explicitement : `claude-sonnet-5`. Clé API attendue dans `ANTHROPIC_API_KEY` ou dans la Configuration ; sans clé, génération simulée avec bandeau [SIMULATION].
- Attention : le projet vit dans un dossier OneDrive — la synchronisation peut verrouiller des fichiers pendant `npm install`. Si erreur EPERM/EBUSY, réessayer ou mettre OneDrive en pause.
- Bug corrigé en test : colonnes CSS fixes (220px) dans les graphiques du dashboard → barres à 0 px dans les panneaux étroits. Leçon : préférer `minmax(0, Xfr)` aux largeurs fixes dans les grilles imbriquées.
- Workflow testé de bout en bout dans le navigateur (dossier D0018 violence : qualification → convocation → validation → envoi → archivage), puis `npm run seed` pour restaurer les données de démo. Toujours réinitialiser les données après un test manuel.
- Les tests en mode simulation valident le circuit, pas la qualité des courriers : à retester avec la vraie clé API (claude-sonnet-5) dès que Samuel la fournit.

### Session 2 — 2026-07-02 (git, local, adaptation Netlify)
- Dépôt poussé sur https://github.com/ACADEE/disciplinia (branche main). `data/` et `.env` exclus du dépôt.
- Netlify ne lance pas de serveur Node : premier deploy → 404. Adaptation faite : Express encapsulé dans une Netlify Function (`serverless-http`), stockage à double backend (fichiers en local, Netlify Blobs en ligne), `netlify.toml` avec redirect `/api/*`.
- Sécurité du site public : code d'accès via env `APP_PASSWORD` (401 sinon), demandé par le navigateur au premier refus. À définir dans Netlify avec `ANTHROPIC_API_KEY`, puis redéployer.
- Piège rencontré : `EADDRINUSE` sur 3005 — ne jamais tuer l'instance de l'utilisateur ; `autoPort: true` ajouté au launch.json de test.
- Rappel pour les prochaines sessions : Samuel utilise le flux GitHub → Netlify ; un `git push` déclenche son déploiement.

### Session 3 — 2026-07-02 (bug Netlify : zone centrale vide)
- Symptôme : nav OK (statique/CDN) mais zone centrale vide. Cause : la fonction serverless renvoyait 500 sur tous les `/api/*`, et le démarrage de `public/app.js` n'avait pas de `catch` → écran blanc.
- Cause racine : **Netlify Blobs n'est pas auto-configuré dans une fonction en mode Lambda** (`exports.handler` + serverless-http). Il faut `connectLambda(event)` en tête du handler AVANT tout `getStore()`. Message d'erreur révélateur : « The environment has not been configured to use Netlify Blobs ».
- Piège secondaire corrigé : le seed tournait à l'import (`const ready = seed()`) donc AVANT `connectLambda`. Rendu paresseux via `ensureReady()` (mémoïsé), appelé après `connectLambda`.
- Robustesse ajoutée : l'IIFE de démarrage frontend affiche désormais un message d'erreur au lieu d'un écran blanc.
- Leçon générale : pour @netlify/blobs en fonction Lambda classique, toujours `connectLambda(event)` ; l'auto-config n'existe que pour les fonctions natives fetch de Netlify.

### Session 4 — 2026-07-03 (question base de données + sauvegarde)
- Samuel s'inquiétait de « manquer une base de données ». Décision prise avec lui : **rester sur Netlify Blobs + Netlify** pour l'instant (SQL auto-hébergé imposerait de quitter le serverless). SaaS refusé par principe.
- Point d'architecture à retenir : serverless (Netlify) + SQLite fichier local = incompatibles (pas de disque persistant). On ne peut pas cumuler serverless + SQL classique + sans SaaS ; il faut en lâcher un.
- `lib/store.js` est le **point de bascule unique** pour changer de stockage (signatures async stables). Migration future = réécrire ce seul fichier. Documenté dans le README.
- Ajouté : endpoint `GET /api/export` + bouton « Télécharger une sauvegarde » dans Configuration (JSON daté, clé API masquée). Le vrai risque de Blobs n'est pas l'absence de SQL mais l'absence de sauvegarde auto → export manuel régulier.
- Pour de vraies données disciplinaires (RGPD), recommandation future : SQLite sur serveur FR/EU. Reste en phase 2.

### Session 5 — 2026-07-03 (footer + déblocage étape 3 + bug 504 génération)
- Fait : footer avec statut connexion API Anthropic (`majFooter()`, vert = connectée / ambre = simulation) + modèle claude-sonnet-5. Déblocage auto de l'étape 3 après qualification (`vueDetail(id, {focusCourrier:true})` → scroll + surbrillance). Garde-fou : `vueDetail` catch les erreurs de chargement (plus d'« Uncaught Dossier introuvable »).
- **Bug 504 génération courrier (NON résolu à ce stade)** : cause = l'appel Anthropic (claude-sonnet-5, lettre complète) dépasse le timeout des fonctions synchrones Netlify (10s par défaut, 26s max selon plan). Le streaming Anthropic→fonction n'aide PAS (réponse bufferisée par serverless-http → toujours un seul renvoi). Correctifs possibles, dépendants du plan Netlify : fonction de fond + polling (Pro+), streaming de réponse (tous plans, mais casse l'unification local/serverless via Express), ou relever le timeout à 26s (selon plan). → Question posée à Samuel sur son plan Netlify avant d'implémenter.
- Le « Dossier introuvable » en cascade venait probablement du 504 laissant l'UI dans un état incohérent ; le catch ajouté le rend non bloquant.

### Session 6 — 2026-07-03 (fix 504 : génération en tâche de fond)
- Samuel est sur **plan Netlify payant (Pro+)** → solution retenue : génération asynchrone.
- Worker partagé `lib/generate.js` (`executerGeneration(id)`) utilisé par le local (fire-and-forget, Node reste vivant) ET la background function Netlify `netlify/functions/generer-background.js` (suffixe `-background` OBLIGATOIRE, jusqu'à 15 min).
- Route `POST /generer-courrier` : enregistre `generation.statut = "en_cours"`, déclenche le worker (Netlify : fetch interne vers `${process.env.URL}/.netlify/functions/generer-background` avec en-tête APP_PASSWORD ; local : appel non attendu), renvoie **202** sans attendre. Plus de 504.
- Frontend : `suivreGeneration()` interroge `GET /dossiers/:id` toutes les 2,5s jusqu'à `termine`/`erreur`. Reprise auto du suivi si on rouvre un dossier en cours (bannière ⏳). Testé bout en bout en local en simulation (202 → poll → courrier).
- À VÉRIFIER par Samuel sur le déploiement Netlify : que les background functions sont bien actives sur son plan (sinon fallback streaming à prévoir).

### Session 7 — 2026-07-03 (entretien dans courrier + export Word + renommage)
- Bug « [À COMPLÉTER] » sur date/heure/lieu d'entretien : la donnée arrivait bien jusqu'au prompt (vérifié via `buildUserPrompt` exporté). C'est l'IA qui remplaçait les valeurs par des placeholders par prudence juridique (règle des 5 jours ouvrables). Corrigé côté prompt : bloc « informations CONFIRMÉES, à reproduire EXACTEMENT » + règles système 4 et 6 durcies. NON testable en local (pas de clé) → à valider par Samuel sur Netlify.
- Leçon debug : quand une info « disparaît » du courrier, vérifier d'abord le prompt (données) AVANT de soupçonner le pipeline. Ici le pipeline était sain, le modèle hedgeait.
- Export Word : lib `docx` (pur JS, bundle OK dans les fonctions Netlify). Endpoint `GET /dossiers/:id/courrier-docx` renvoie le .docx en base64 (JSON, évite les soucis de réponse binaire via serverless-http). Client décode base64 → Blob → download. Bouton « Imprimer / PDF » remplacé par « Télécharger WORD ».
- Renommage signataire « Anne-Sophie Bertrand » → « Marie-Claude Richet » : défaut dans seed.js + migration `migrerConfig()` (appliquée à chaque démarrage, ne remplace que l'ancienne valeur exacte) pour renommer aussi la config déjà stockée en Blobs/local sans écraser un choix volontaire.

### Session 8 — 2026-07-03 (fix déterministe entretien + markdown)
- Le durcissement du prompt (session 7) NE suffisait PAS : le modèle remplaçait toujours date/heure/lieu par `[À COMPLÉTER]` et sortait du Markdown (`**...**`). Leçon clé : **ne pas dépendre uniquement de l'obéissance du modèle** pour une exigence stricte → post-traitement déterministe en code.
- Ajout dans letter.js : `injecterEntretien()` (remplace les motifs « Libellé : [placeholder] » Date/Heure/Lieu par les valeurs saisies) + `nettoyerMarkdown()` + `postTraiter()` appliqué à la sortie IA ET à la simulation. Règle système 9 = interdiction du Markdown (ceinture + bretelles).
- docx.js : mise en page pro (objet en gras, corps justifié, Times New Roman 12pt, marges 2cm) + strip Markdown défensif.
- IMPORTANT process : Samuel voyait « toujours » le bug car le correctif de session 7 avait été poussé mais il testait avant redéploiement / le modèle hedgeait encore. Toujours confirmer que le déploiement Netlify est à jour avant de conclure. Le fix déterministe (session 8) rend le résultat indépendant du modèle.

### Session 9 — 2026-07-07 (cadrage client → 3 évolutions)
- Créé FEATURES.md (inventaire F0-F44 pour cahier des charges inversé).
- Analyse des réponses client : mono-utilisateur (RRH/DRH) → archi actuelle OK ; 0 prud'hommes → argumentaire = TEMPS/homogénéité, pas risque juridique ; récidive suivie à la main sur Teams → notre détection auto = différenciateur.
- **Point clé métier** : le client sanctionne surtout via code du travail + code de la route + process internes + règles de courtoisie, PEU via le règlement intérieur. → Implémenté (F42) : `buildSystem` réécrit avec 5 bases de référence hiérarchisées (RI secondaire) ; config `processInternes` + `reglesCourtoisie` (seed + UI + save). `buildSystem` gère l'absence des champs (opt()).
- Implémenté aussi : camembert SVG des motifs (F29, helper `camembertHtml`, regroupe >8 en « Autres motifs ») ; vue historique par salarié (F44, endpoint `GET /api/salaries/:id/historique` + `vueHistoriqueSalarie`, compte les sanctions invocables <3 ans). Testé en local.
- Laissé volontairement en copier-coller : import Word/PDF du règlement (demande explicite Samuel « laisse 4 en copier coller »).

### Session 10 — 2026-07-07 (suppression/édition salariés + grille éditable + qualif IA)
- Suppression salarié en cascade (DELETE /api/salaries/:id) + popup de confirmation (helper `confirmModal`) + génération d'ID robuste `prochainNumero` (max+1, plus length+1) pour éviter collisions après suppression.
- Édition salarié (PATCH /api/salaries/:id) : prénom/nom/poste + propagation du nom dénormalisé (`salarieNom`) sur ses dossiers. UI inline dans Config.
- **Motifs désormais pilotés par la grille** (`motifsDepuisGrille`), plus par le catalogue statique : referentiels + POST /dossiers lisent config.grille. Permet ajout/édition/suppression de motifs en Config (grille éditable : label input + `btn-add-motif` + `g-del`, save relit le DOM). Motifs triés du moins au plus grave (niveau asc).
- Qualif IA (`lib/qualifIA.js`, `proposerSanctionIA`) : lit la description libre + grille, propose la sanction la plus adaptée (JSON parsé, fallback déterministe si pas de clé). Cachée sur `dossier.propositionIA`. NON testable en local (pas de clé) → à valider sur Netlify.
- Menu « Niveau de gravité » dans la qualif pilote la sanction retenue (`NIVEAU_SANCTION` map). Salariés triés par nom partout (`parNom`).
- Tout testé en local sauf la proposition IA (nécessite ANTHROPIC_API_KEY).

### Session 11 — 2026-07-08 (refonte UI/UX via skill ui-ux-pro-max)
- Refonte visuelle : nouveau design system dans app.css (thème clair aéré, police Inter, palette bleu #2563eb convivial, ombres douces `--shadow-*`, rayons 14px, transitions 170ms, focus-visible, `prefers-reduced-motion`, tabular-nums pour KPI/pourcentages). TOUTES les classes existantes conservées → aucun changement dans app.js requis.
- Icônes SVG (style Lucide) en remplacement des emojis dans la nav (index.html) — principal signal « pro » du skill. Emojis conservés dans les boutons d'action (labels).
- Responsive amélioré : sous 900px la sidebar devient une barre supérieure (avant : `display:none` → nav cachée sur mobile). Body passe en flex-direction column.
- Piège skill : `scripts` et `data` sont des symlinks non résolus sous Windows (fichiers texte contenant le chemin). Le vrai search.py est dans `.../2.5.0/src/ui-ux-pro-max/scripts/search.py`. Le skill recommandait un thème sombre data-dense — écarté au profit d'un thème clair (demande « convivial/simple/clair »).
- Vérifié via DOM (screenshots en timeout tout au long de la session — souci renderer preview, pas l'app).
