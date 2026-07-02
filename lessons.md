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
