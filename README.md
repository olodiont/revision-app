# Révision

App locale de révision avec Claude : on demande la correction d'un exercice (photo, PDF, Word ou texte), puis on sélectionne n'importe quel passage pour poser une question dessus. La réponse s'affiche en commentaire dans la marge, au lieu d'un long fil de discussion.

- Correction rangée exercice par exercice : outils utiles, puis chaque énoncé suivi de sa correction.
- Commentaires surlignés en jaune, rouvrables d'un clic, avec schémas (Mermaid, courbes, SVG).
- Correction modifiable passage par passage, avec historique des versions.
- Mode révision : « Me tester » (sans appel à Claude), exo similaire, vérification de ta réponse.
- Tout est stocké en local (SQLite) ; Claude n'est appelé que sur un clic.

## Prérequis

- Windows, Node.js 22 ou plus.
- [Claude Code](https://claude.com/claude-code) installé et connecté à ton abonnement : l'app l'appelle avec `claude -p`.

## Lancer

Double-clic sur `scripts/lancer-revision.cmd` : il installe les dépendances au premier lancement, compile l'interface si besoin, démarre le serveur et ouvre l'app dans le navigateur. Fermer l'onglet arrête l'app (et sa console).

En développement :

```
npm install
npm run dev     # serveur + interface avec rechargement
npm test        # tests
```

Les données sont dans `Documents\Revision\revision-data` (modifiable dans « Stockage et réglages »).

Usage personnel : l'app utilise la connexion Claude Code de son utilisateur et n'est pas faite pour être distribuée avec ce mode de connexion.
