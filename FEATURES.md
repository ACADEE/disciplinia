# Disciplina — Inventaire des fonctionnalités

> Document de référence décrivant l'application telle qu'elle est **réellement implémentée** (MVP).
> Objectif : permettre de reconstituer un cahier des charges fonctionnel (« reverse spec ») à partir de la liste des features.
> Chaque fonctionnalité porte un identifiant `Fxx` réutilisable dans un cahier des charges.

---

## 1. Vision & objectif

Application web qui transforme un **fait disciplinaire rapporté** en **courrier conforme au droit du travail**, avec qualification assistée, circuit de validation, archivage et tableau de bord de synthèse pour la direction.

- **Contexte** : entreprise de transport routier (voyageurs / marchandises), Haute-Savoie.
- **Volume cible** : ~640 dossiers / an, gérés aujourd'hui manuellement (Excel + Word) par la RRH/DRH.
- **Gains visés** : temps de rédaction, homogénéité des courriers, traçabilité, détection automatique de la récidive.
- **Positionnement** : l'outil **assiste** la procédure ; la **décision et la validation restent humaines**.

---

## 2. Utilisateurs & rôles

| Rôle | Description | État dans le MVP |
|------|-------------|------------------|
| Gestionnaire RH (RRH/DRH) | Saisit les faits, qualifie, génère, valide, archive | Utilisateur unique, tout l'accès |
| Direction (DRH/DG) | Consulte le tableau de bord de synthèse | Même accès (pas de rôle distinct) |
| Administrateur | Configure le règlement, la grille, l'entreprise, la clé API | Même accès (onglet Configuration) |

> **F0 — Modèle d'accès** : accès unique protégé par un **code d'accès partagé** (`APP_PASSWORD`). Pas de comptes individuels ni de rôles différenciés dans le MVP.

---

## 3. Périmètre fonctionnel (modules)

### Module 1 — Saisie du fait
- **F1** Création d'un dossier disciplinaire à partir d'un fait rapporté.
- **F2** Sélection du salarié concerné dans une liste, ou **ajout d'un nouveau salarié** à la volée (prénom, nom, poste).
- **F44** **Historique disciplinaire par salarié** : vue récapitulative de tous les dossiers d'un salarié (référence, date, motif, sanction, statut) + nombre de **sanctions invocables (< 3 ans)** — remplace le suivi manuel de la récidive (sur Teams aujourd'hui). Accessible depuis le détail d'un dossier.
- **F3** Choix du **motif** parmi un catalogue de 18 motifs métier (voir §5).
- **F4** Saisie de la **date du fait** et de la **date de connaissance** par l'employeur (point de départ du délai de prescription).
- **F5** Saisie du **lieu**, d'une **description circonstanciée** (texte libre), et des **témoins / éléments de preuve**.
- **F6** Attribution automatique d'une **référence** de dossier (`DISC-AAAA-NNN`) et d'un identifiant interne.

### Module 2 — Qualification assistée
- **F7** Proposition automatique d'un **niveau de gravité** (1 à 4) et d'une **sanction** selon la **grille de gravité** configurée.
- **F8** **Détection automatique de la récidive** : recherche des sanctions antérieures du même salarié datant de moins de 3 ans ; bascule sur la sanction « récidive » le cas échéant.
- **F9** Affichage des **antécédents invocables** (référence, motif, date, sanction).
- **F10** **Alertes juridiques** contextuelles (voir §6 : prescription, entretien obligatoire, non bis in idem, mise à pied, faute lourde).
- **F11** **Sanction modifiable** par le gestionnaire : la proposition n'est pas imposée (décision humaine).
- **F12** Déduction automatique du **type de courrier** à produire selon la sanction retenue.

### Module 3 — Génération du courrier (IA)
- **F13** Rédaction du courrier par l'**API Anthropic (modèle `claude-sonnet-5`)**, à partir des données du dossier, du contexte entreprise et des **bases de référence multi-sources** (voir F42).
- **F14** 4 **types de courrier** : rappel à l'ordre, notification simple (avertissement/blâme), convocation à entretien préalable, notification de sanction après entretien.
- **F15** Saisie des **paramètres d'entretien** (date, heure, lieu) et de la **mise à pied conservatoire** pour les convocations.
- **F16** Champ **consignes particulières** de rédaction (texte libre transmis à l'IA).
- **F17** **Injection déterministe** des date/heure/lieu d'entretien saisis dans le courrier final (garantie que les valeurs saisies apparaissent, indépendamment du modèle).
- **F18** **Texte brut sans Markdown** (nettoyage automatique) — courrier administratif prêt à l'emploi.
- **F19** Garde-fous rédactionnels imposés au modèle : pas de qualification pénale des faits, pas d'invention de faits/dates/témoins, espaces réservés `[À COMPLÉTER]` uniquement pour l'information réellement absente.
- **F20** **Génération asynchrone en tâche de fond** avec suivi de progression (évite les délais d'attente / time-out), reprise automatique du suivi si le dossier est rouvert pendant la rédaction.
- **F21** **Mode simulation** de secours : sans clé API, un courrier gabarit clairement marqué `[SIMULATION]` est produit pour tester le circuit de bout en bout.

### Module 4 — Édition, validation & archivage
- **F22** **Édition manuelle** du courrier généré (relecture humaine avant envoi).
- **F23** **Circuit de statuts** : Fait saisi → Qualifié → Courrier généré → En validation → Validé → Envoyé → Archivé (+ Classé sans suite).
- **F24** Actions de changement de statut avec **commentaire** optionnel.
- **F25** **Historique horodaté** de toutes les actions sur le dossier (timeline).

### Module 5 — Export du courrier
- **F26** **Téléchargement au format Word (.docx)** : mise en page professionnelle (Times New Roman 12 pt, marges 2 cm, objet en gras, corps justifié), nommé `Courrier-<référence>.docx`.
- **F27** **Copie** du courrier dans le presse-papiers.

### Module 6 — Tableau de bord (direction)
- **F28** Indicateurs clés : total de dossiers, dossiers en cours, courriers envoyés/archivés, nombre d'alertes de délai.
- **F29** **Répartition par motif** en **graphique camembert** (SVG) avec légende et pourcentages ; regroupement automatique au-delà de 8 motifs (« Autres motifs »).
- **F30** **Répartition par mois** (date du fait).
- **F31** **Répartition par statut**.
- **F32** **Salariés les plus concernés** (top 5).
- **F33** **Alertes de prescription** sur les dossiers en cours (2 mois, art. L1332-4).

### Module 7 — Configuration (administrateur)
- **F34** **Coordonnées entreprise** : raison sociale, adresse, ville, signataire, fonction du signataire, convention collective.
- **F35** **Dépôt du règlement intérieur** (copier-coller de texte ou import de fichier `.txt` / `.md`) ; cité dans les courriers **à titre secondaire**.
- **F42** **Bases de référence multi-sources** : la génération s'appuie surtout sur le **code du travail**, le **code de la route** (infractions de conduite), les **processus internes** et les **règles de courtoisie** — conformément à la pratique réelle de l'entreprise. Les process internes et règles de courtoisie sont saisissables en Configuration ; le code du travail et le code de la route sont mobilisés automatiquement par l'IA.
- **F36** **Durée maximale de mise à pied disciplinaire** (paramètre requis pour la validité de la sanction).
- **F37** **Grille de gravité entièrement éditable** : pour chaque motif, niveau (1-4), sanction en 1re occurrence, sanction en récidive.
- **F38** **Clé API Anthropic** et **modèle** paramétrables (défaut `claude-sonnet-5`) ; clé jamais renvoyée en clair au navigateur.

### Module 8 — Sauvegarde des données
- **F39** **Export complet** (dossiers + salariés + configuration) en un fichier JSON daté, depuis la Configuration ; clé API exclue de l'export.

### Module 9 — Sécurité & accès
- **F40** **Code d'accès applicatif** (`APP_PASSWORD`) exigé sur toutes les routes API en ligne ; demandé au navigateur et conservé pour la session.
- **F41** **Statut de connexion API** affiché en pied de page (connectée + modèle / mode simulation).

---

## 4. Référentiels métier

### Motifs disciplinaires (18)
Retards répétés · Absence injustifiée · Abandon de poste · Insubordination · Excès de vitesse · Téléphone au volant · Non-respect des temps de conduite/repos · Fraude au chronotachygraphe · Alcool/stupéfiants · Vol · Violence physique · Injures/menaces · Harcèlement · Dégradation volontaire · Non-respect des consignes de sécurité · Comportement inapproprié envers usagers/clients · Négligence professionnelle · Autre motif.

### Échelle des sanctions (9, du plus léger au plus lourd)
Rappel à l'ordre (non disciplinaire) · Avertissement · Blâme · Mise à pied disciplinaire · Mutation disciplinaire · Rétrogradation · Licenciement pour faute simple · Licenciement pour faute grave · Licenciement pour faute lourde.
> Attribut clé par sanction : **entretien préalable requis (oui/non)** et **niveau de gravité**.

### Types de courrier (4)
Rappel à l'ordre · Notification de sanction (avertissement/blâme) · Convocation à entretien préalable · Notification de sanction (après entretien).

### Statuts du workflow (8)
Fait saisi · Qualifié · Courrier généré · En validation · Validé · Envoyé · Archivé · Classé sans suite.

---

## 5. Règles de gestion & garde-fous juridiques

| Règle | Fondement | Comportement |
|-------|-----------|--------------|
| **Prescription 2 mois** | art. L1332-4 | Alerte si > 45 j (avertissement) ou > 60 j (danger) depuis la connaissance du fait |
| **Entretien préalable obligatoire** | art. L1332-2 | Imposé automatiquement pour toute sanction lourde (mise à pied, licenciement…) |
| **Récidive < 3 ans** | art. L1332-5 | Seules les sanctions de moins de 3 ans sont invocables ; bascule sur la sanction récidive |
| **Non bis in idem** | principe | Alerte si un dossier existe déjà pour le même salarié + motif + date |
| **Durée max de mise à pied** | règlement intérieur | Rappel de la durée plafond ; alerte si non configurée |
| **Faute lourde = intention de nuire** | jurisprudence | Avertissement rédactionnel si faute lourde retenue |
| **Décision humaine** | principe produit | La sanction proposée est toujours modifiable |

---

## 6. Modèle de données (entités principales)

- **Salarié** : id, prénom, nom, poste, date d'embauche, adresse.
- **Dossier** : id, référence, salarié, motif, dates (fait / connaissance / création), lieu, description, témoins, statut, niveau de gravité, sanction retenue, récidive + antécédents, type de courrier, paramètres d'entretien, mise à pied conservatoire, consignes, courrier (texte), état de génération, historique horodaté.
- **Configuration** : entreprise, règlement intérieur, durée max mise à pied, grille de gravité, clé API, modèle.

---

## 7. Parcours utilisateur (bout en bout)

1. **Nouveau dossier** → saisie du fait (F1-F6).
2. **Qualification** → l'outil propose gravité + sanction + alertes (F7-F12) ; le gestionnaire valide ou ajuste.
3. **Génération** → paramètres (entretien, consignes) puis rédaction IA en tâche de fond (F13-F21).
4. **Relecture** → édition manuelle éventuelle (F22).
5. **Validation** → soumission → validation direction → envoyé → archivé (F23-F25).
6. **Export** → téléchargement Word du courrier (F26).
7. **Pilotage** → suivi global au tableau de bord (F28-F33).

---

## 8. Architecture technique & hébergement

- **Frontend** : application monopage en JavaScript natif (pas de framework), servie en statique.
- **Backend** : API REST **Express (Node.js)**, encapsulée en **fonction serverless** (`serverless-http`) pour le déploiement.
- **Hébergement** : **Netlify** (CDN statique + Netlify Functions). Génération IA déportée dans une **background function** (jusqu'à 15 min).
- **Stockage** : **Netlify Blobs** en ligne / **fichiers JSON** en local — via une couche d'abstraction unique (`lib/store.js`) facilitant une future migration SQL.
- **IA** : API Anthropic, modèle `claude-sonnet-5`.
- **Dépôt** : GitHub, déploiement continu déclenché par `git push`.

---

## 9. Exigences non-fonctionnelles

- **Sécurité** : code d'accès applicatif ; clé API jamais exposée au navigateur ni exportée.
- **Résilience** : mode simulation sans clé ; gestion d'erreurs non bloquante (pas d'écran blanc).
- **Portabilité des données** : export JSON complet + import prévu.
- **Coût maîtrisé** : infra serverless, pas de base de données SaaS (choix assumé pour le MVP).
- **Langue** : intégralement en français, terminologie RH/juridique.

---

## 10. Limites connues & hypothèses (GAP)

- Données **fictives réalistes** en attendant les données réelles (entreprise, salariés, dossiers, grille).
- **Règlement intérieur réel** à déposer ; import **PDF/DOCX** non couvert (copier-coller en attendant).
- **Envoi réel** des courriers (LRAR/e-mail) non connecté : le statut « Envoyé » est déclaratif.
- **Mono-utilisateur** : pas de comptes/rôles distincts, pas de verrou d'écriture concurrente.
- **Import des 640 dossiers Excel** existants non couvert (phase 2).
- **Pas de sauvegarde automatique** du stockage : export manuel régulier recommandé.

---

## 11. Évolutions identifiées (issues du cadrage client)

> Points remontés lors des échanges de cadrage.

**Livrés (issus du cadrage client) :**
- ✅ **Base de référence élargie** au-delà du RI (code du travail, code de la route, process internes, règles de courtoisie) — voir F42.
- ✅ **Camembert des motifs** au tableau de bord — voir F29.
- ✅ **Historique disciplinaire par salarié** — voir F44.

**À arbitrer pour une V2 :**
- **Import Word/PDF** du règlement et des trames (le RI est disponible en Word ; conservé en **copier-coller** pour le moment).
- **Indicateur de temps gagné** (référence : ~40 min/dossier aujourd'hui, ~3 h/semaine de rédaction).

---

*Document généré à partir du code source du MVP. Les identifiants `Fxx` sont stables et peuvent être repris tels quels dans un cahier des charges.*
