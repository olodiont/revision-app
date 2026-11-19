# App de révision avec commentaires — document de conception

Date : 2026-11-19
Statut : en attente de validation (questions du relecteur intégrées)

## 1. Intention

L'utilisateur révise (surtout maths, code et principes informatiques) en demandant à Claude des corrections et des explications. Dans un chat classique, chaque question de suivi s'ajoute en bas du fil : au bout de quelques questions, il se perd et doit remonter toute la conversation.

L'app remplace le fil linéaire par une **correction principale propre**, sur laquelle l'utilisateur **surligne un passage et pose sa question en commentaire**. Chaque commentaire est un mini-fil indépendant, repliable, affiché en marge (comme Google Docs). L'utilisateur garde ses exercices dans une bibliothèque pour les relire avant un examen.

Usage : personnel, une seule personne, en local sur un PC Windows.

## 2. Objectifs

1. Créer un exercice à partir d'un énoncé : photo, PDF, Word ou texte tapé (plusieurs fichiers possibles).
2. Demander à Claude une correction ou une explication, affichée en Markdown avec formules (KaTeX), code coloré et schémas.
3. Surligner n'importe quel passage de la correction et y accrocher un commentaire (question). Claude répond dans le fil du commentaire. L'utilisateur peut relancer dans le même fil.
4. Demander un schéma à un endroit précis (« fais un schéma ici ») ; il s'affiche dans le fil du commentaire.
5. Marquer un commentaire comme résolu (il se replie).
6. Corriger la correction : depuis un fil, demander à Claude de réécrire un passage ; voir avant/après ; accepter ou refuser ; garder l'historique des versions.
7. Bibliothèque Matière → Chapitre → Exercice, avec recherche plein texte.
8. Mode révision à la demande (voir §6.6).
9. Export Markdown d'un exercice ou d'une matière.
10. Bouton « Ouvrir le dossier de stockage » pour voir et vider les données facilement.

## 3. Non-objectifs

- Multi-utilisateur, comptes, synchronisation cloud.
- Version mobile ou application de bureau empaquetée (Electron/Tauri). Possible plus tard en emballant l'app web, sans réécriture.
- Distribution de l'app à d'autres personnes.
- Mode clé API dans cette première version (mais l'appel à Claude est isolé pour pouvoir l'ajouter, voir §5.3).
- Édition manuelle libre de la correction par l'utilisateur (les modifications passent par la proposition de Claude + validation). Le constructeur peut l'ajouter si c'est trivial.

## 4. Anti-objectifs (ce qui serait un échec même si « ça marche »)

- **Dépenser des tokens sans action explicite de l'utilisateur.** Aucun appel à Claude en arrière-plan : pas de résumé automatique, pas de suggestions spontanées, pas de pré-génération. Chaque appel correspond à un clic ou à un envoi.
- **Perdre un commentaire.** Un commentaire n'est jamais supprimé implicitement ; s'il ne peut plus être accroché, il devient « détaché » et reste visible.
- **Envoyer tout l'historique à chaque question.** Chaque appel n'envoie que le contexte utile (§5.4).
- **Enfermer les données.** Elles sont locales, exportables en Markdown, et l'utilisateur peut tout supprimer.

## 5. Contraintes et choix techniques

### 5.1 Approches considérées

| Approche | Pour | Contre | Décision |
|---|---|---|---|
| **A. Web app locale (React + serveur Node)** | Simple à construire et à faire évoluer ; tout l'écosystème web (KaTeX, Mermaid, surlignage) ; peut devenir une app de bureau plus tard | S'ouvre dans un onglet de navigateur, pas une appli avec icône | **Choisie par l'utilisateur** |
| B. App de bureau (Electron/Tauri) | Fenêtre et icône dédiées | Packaging et mises à jour lourds pour un gain esthétique ; faisable plus tard depuis A | Écartée pour l'instant |
| C. Plugin Obsidian | Rendu Markdown/maths/Mermaid déjà là | Commentaires en marge, avant/après, mode révision difficiles dans l'éditeur Obsidian ; dépendance | Écartée |
| (Python / Streamlit) | Rapide | Commentaires ancrés sur une sélection de texte très pénibles | Écartée |

### 5.2 Pile

- **Node.js ≥ 22**, TypeScript partout.
- **Front** : Vite + React 19 + Tailwind CSS v4. Interface en français.
- **Serveur** : petit serveur HTTP Node (Fastify, Hono ou Express : choix du constructeur) qui sert le front, l'API et le streaming des réponses (SSE recommandé).
- **Base** : SQLite dans un seul fichier. Préférer le module intégré `node:sqlite` (pas de compilation native sous Windows) ; `better-sqlite3` acceptable si besoin. Recherche via FTS5.
- **Rendu** : `react-markdown` + `remark-math` + `rehype-katex` ; coloration du code avec Shiki (ou équivalent) ; `mermaid` ; `function-plot` ; SVG nettoyé avec DOMPurify avant affichage.
- **Word** : conversion `.docx` → texte/Markdown côté serveur (ex. `mammoth`) avant l'envoi à Claude. Le fichier d'origine est conservé.
- **Lancement** : `npm start` (build + serveur) et un raccourci Windows (`.cmd`) qui démarre le serveur et ouvre le navigateur sur `http://localhost:<port>`. Le serveur n'écoute que sur `127.0.0.1`.

### 5.3 Appel à Claude (abonnement de l'utilisateur)

- Claude est appelé en lançant le CLI Claude Code en mode non interactif : `claude -p`, déjà connecté à l'abonnement de l'utilisateur. Aucune clé API.
- Sortie en streaming (`--output-format stream-json`, avec les options requises par la version installée) pour afficher la réponse au fil de l'eau.
- Le prompt est passé par l'entrée standard ; les instructions de l'app par `--append-system-prompt` ou `--system-prompt`.
- Outils de Claude Code : restreints au strict nécessaire. Seule la lecture des fichiers joints de l'exercice est autorisée (pour les photos et PDF) ; pas d'écriture, pas de commandes, pas de web.
- Répertoire de travail du processus : un dossier dédié dans le dossier de données de l'app (ex. `revision-data/claude-cwd/`), pour que l'historique de sessions que Claude Code enregistre dans `~/.claude/projects/` soit regroupé sous un seul projet identifiable. Si le CLI propose une option pour ne pas enregistrer la session, l'utiliser ; sinon, la page Stockage montre ce dossier d'historique et permet de l'ouvrir/le vider.
- Tout l'appel est isolé dans un seul module (« fournisseur Claude ») avec une interface du type `envoyer(contexte, consignes) → flux de texte`. Une implémentation avec clé API pourra être ajoutée plus tard sans toucher au reste.
- Erreurs à gérer avec un message clair en français : CLI introuvable, non connecté, limite d'usage atteinte, réponse interrompue (bouton Réessayer).
- Modèle : celui par défaut de Claude Code ; un réglage permet de le changer.
- Usage strictement personnel : la règle d'Anthropic interdit de proposer la connexion claude.ai dans un produit distribué. L'app ne doit pas être distribuée avec ce mode.

### 5.4 Contexte envoyé selon l'action

| Action (toujours déclenchée par l'utilisateur) | Contexte envoyé |
|---|---|
| Générer la correction | Énoncé (texte + chemins des fichiers joints à lire) + consigne éventuelle de l'utilisateur. Si l'énoncé comporte des photos/PDF, Claude renvoie aussi, dans la même réponse et séparée par un format structuré, une **transcription texte de l'énoncé** (Markdown + formules), stockée et indexée pour la recherche et l'export |
| Refaire toute la correction | Énoncé + correction courante + consigne de l'utilisateur (« plus détaillée », « explique plutôt que corriger »…) |
| Question dans un commentaire | Énoncé + version courante de la correction + passage surligné + messages de ce fil uniquement |
| Schéma ici | Même contexte que la question + consigne « produis un schéma » |
| Corriger la correction | Énoncé + correction courante + passage visé + fil du commentaire ; Claude renvoie **uniquement le passage de remplacement** dans un format délimité/structuré facile à extraire |
| Exo similaire | Énoncé + correction courante ; Claude renvoie un nouvel énoncé et sa correction, séparés |
| Vérifier ma réponse | Énoncé + correction courante + réponse de l'utilisateur (texte ou photo) |

Les autres fils de commentaires ne sont pas envoyés.

### 5.5 Schémas

Le prompt système de l'app explique à Claude trois formats, du moins coûteux au plus coûteux, et lui demande de choisir le plus léger qui convient :

1. **Mermaid** (bloc ```` ```mermaid ````) : organigrammes, algorithmes, automates, séquences, classes, arbres, cartes mentales.
2. **Courbes de fonctions** (bloc ```` ```function-plot ```` contenant du JSON pour la bibliothèque `function-plot`) : courbes, tangentes, aires, points remarquables.
3. **SVG libre** (bloc ```` ```svg ````) : géométrie, vecteurs, figures que les deux autres ne savent pas faire. En dernier recours.

Seul le code source des schémas est stocké ; ils sont redessinés à l'affichage (aucun token pour les réafficher). Un schéma qui ne se dessine pas affiche son code source et un message d'erreur, sans casser la page.

La skill `mermaid` installée dans `~/.claude/skills/` peut être chargée par Claude Code ; les consignes du prompt système suffisent pour `function-plot` et le SVG.

## 6. Comportement

### 6.1 Écran principal

```
┌────────────┬──────────────────────────────┬─────────────────┐
│ Maths      │  Exo 3 – TD4 Intégrales      │ 💬 « pourquoi   │
│  Intégrales│  [énoncé]                    │   u = ln x ? »  │
│   • Exo 3  │  Correction :                │   ↳ réponse     │
│   • Exo 5  │  On pose u = ln x  ◄─────────┤   ↳ [schéma]    │
│ Info       │  ...                         │ ✓ 2 résolus     │
└────────────┴──────────────────────────────┴─────────────────┘
```

- Gauche : bibliothèque (Matière → Chapitre → Exercice), recherche, accès à la page Stockage.
- Centre : énoncé (texte + aperçu des fichiers joints) puis correction.
- Droite : commentaires alignés au mieux sur leur passage ; les résolus sont repliés et regroupés ; les détachés sont listés en bas.
- Sélectionner du texte dans la correction fait apparaître un petit bouton « Commenter ».

### 6.2 Commentaires

- Ancrage : citation exacte + quelques caractères avant/après + position dans le texte, rattachés à une version de la correction.
- Ce qu'on peut commenter *(choix de conception, validé)* : sélection libre dans le texte et dans les blocs de code (texte brut) ; une formule KaTeX, un schéma (Mermaid, courbe, SVG) se commente **en entier** (clic sur le bloc puis « Commenter »). Pas de sélection partielle à l'intérieur d'une formule ou d'un schéma rendu. Une sélection qui déborde sur une formule l'inclut entière. L'ancrage se fait sur la source Markdown.
- Statuts : ouvert, résolu, détaché.
- Un fil = suite de messages (utilisateur / Claude). Les réponses de Claude dans un fil supportent Markdown, formules, code et schémas.
- Bouton « Schéma ici » dans un fil.

### 6.3 Correction modifiable

- Depuis un fil, bouton « Corriger la correction » (ou demande en texte libre).
- Claude propose un passage de remplacement ; l'app montre l'avant/après (diff lisible) ; l'utilisateur accepte ou refuse.
- Accepter crée une nouvelle version complète de la correction (v1, v2…) avec sa date et le commentaire déclencheur. Le commentaire déclencheur passe en résolu.
- Les autres commentaires sont réancrés sur la nouvelle version : recherche exacte de la citation, puis recherche approchée. Ceux dont le passage a changé reçoivent l'étiquette « passage modifié ». Échec → statut détaché.
- Un sélecteur permet de voir les versions précédentes en lecture seule.
- **Refaire toute la correction** : bouton sur la correction, avec une consigne libre (« plus détaillée », « explique plutôt que corriger »). Il y a **un seul document principal par exercice** : une correction et une explication sont le même type de document, seule la consigne change. Refaire crée une nouvelle version complète (avec la même confirmation avant/après, en vue d'ensemble) ; l'ancienne reste dans l'historique ; les commentaires sont réancrés, ceux qui ne le peuvent pas passent en détachés.

### 6.4 Bibliothèque et recherche

- Créer, renommer, déplacer et supprimer matières, chapitres et exercices.
- Recherche plein texte sur titres, énoncés, corrections et commentaires.
- Supprimer un exercice supprime ses versions, commentaires, schémas et fichiers joints (avec confirmation).

### 6.5 Stockage

- Toutes les données sont dans un seul dossier :

```
revision-data/
├── revision.db       ← base SQLite
├── fichiers/<id-exo>/ ← fichiers d'origine (photos, PDF, Word)
└── claude-cwd/       ← répertoire de travail des appels Claude
```

- L'emplacement par défaut est au choix du constructeur (dossier de l'app ou `%APPDATA%`), affiché dans l'app, modifiable dans les réglages.
- Page **Stockage** :
  - chemin du dossier et taille occupée ;
  - bouton **« Ouvrir le dossier de stockage »** qui ouvre l'Explorateur Windows sur ce dossier (le serveur lance `explorer.exe <chemin>`) ;
  - chemin et bouton d'ouverture du dossier d'historique Claude Code correspondant (`~/.claude/projects/<…>`), si l'historique est enregistré ;
  - rappel en une phrase : les échanges envoyés à Claude transitent par Anthropic et suivent les réglages de confidentialité du compte claude.ai ; vider le stockage local ne les efface pas.
- L'app doit redémarrer proprement si l'utilisateur a supprimé le dossier ou la base (recréation à vide).

### 6.6 Mode révision (à la demande uniquement)

- **« Me tester » (0 token)** : masque la correction et les commentaires, laisse l'énoncé. **« Révéler »** remet tout. Option : révéler étape par étape (découpage par titres/paragraphes de la correction, sans appel à Claude).
- **« Exo similaire » (payant, au clic)** : Claude génère une variante ; elle est enregistrée comme un exercice enfant de l'exercice d'origine, affiché **sous lui dans l'arbre** (sous-ligne). Pas d'état « masqué » stocké : à chaque ouverture d'un exo similaire, l'app active « Me tester » ; l'utilisateur révèle quand il veut. L'export inclut sa correction normalement.
- **« Vérifie ma réponse » (payant, au clic)** : l'utilisateur envoie sa solution en texte ou en photo ; la réponse de Claude est rangée dans un fil dédié de l'exercice.

### 6.7 Export

- Exporter un exercice ou une matière en Markdown : énoncé, correction (version courante), commentaires en notes avec leurs fils, schémas en blocs de code, fichiers joints copiés à côté. Lisible dans n'importe quel éditeur et dans Obsidian.

## 7. Laissé au constructeur

- Choix précis du serveur HTTP, du gestionnaire d'état front, de la bibliothèque de diff et de recherche approchée.
- Schéma exact des tables SQLite (les entités sont : matière, chapitre, exercice, fichier joint, version de correction, commentaire, message, exercice similaire via lien parent).
- Format exact de sortie structurée pour « Corriger la correction » et « Exo similaire ».
- Textes du prompt système (en respectant §5.4 et §5.5).
- Détails visuels, dans l'esprit de l'esquisse §6.1, sobres et lisibles longtemps.
- Port local, emplacement par défaut du dossier de données.
- Tests : unitaires sur l'ancrage/réancrage des commentaires, le stockage et le fournisseur Claude (simulé) ; pas besoin d'appeler le vrai Claude dans les tests.
