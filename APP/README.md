# La villa Romeo Admin

Panel admin autonome pour La villa Romeo.

## Ouvrir

Ouvre `index.html` dans un navigateur moderne.

## Fonctionnalites

- Dashboard executive avec revenus, occupation, messages et priorites.
- Gestion complete des logements.
- Fiche logement avec acces, portail invite, notes internes et preview.
- Reservations avec filtres, creation, edition et suppression.
- Petits-dejeuners avec suivi de production.
- Operations terrain: menage, maintenance, arrivees, conciergerie.
- Messages voyageurs.
- QR codes imprimables.
- QR codes configures pour ouvrir le portail client sur telephone via le Wi-Fi local.
- Onglet chiffres avec courbe annuelle, revenus, occupation, logements, petits-dejeuners et operations.
- Parametres generaux.
- Export JSON.
- Sauvegarde locale via `localStorage` et sauvegarde serveur JSON via `storage/state.json` quand le serveur Node est lance.
- Portail client dans `guest.html`.
- Les clients peuvent reserver un petit-dejeuner, appeler, envoyer un message et consulter les infos de sejour.
- Les evenements peuvent etre normaux ou a inscription, avec nombre de personnes et suivi des presences cote admin.
- Les demandes client sont ajoutees dans les donnees locales et visibles dans le panel admin apres rechargement.

## Structure

- `index.html`: point d'entree.
- `src/styles.css`: theme premium et responsive.
- `src/data.js`: donnees par defaut.
- `src/store.js`: persistance et export.
- `src/app.js`: logique SPA, rendu, actions et modales.
- `guest.html`: portail invite.
- `src/guest.css`: theme du portail client.
- `src/guest.js`: actions client et demandes.

## Liens utiles

- Admin sur ce PC: `http://localhost:4174/`
- Admin sur telephone, meme Wi-Fi: `http://192.168.1.205:4174/`
- Portail client sur telephone: `http://192.168.1.205:4174/guest.html?suite=1`

## Hebergement

Le projet est pret pour Render avec `render.yaml`.

1. Mets le dossier du projet sur GitHub.
2. Sur Render, cree un nouveau Blueprint depuis ce repo.
3. Render lancera `npm install` puis `npm start`.
4. Le disque persistant `/data` gardera `state.json`, donc les reservations, messages, evenements et inscriptions restent sauvegardes apres redemarrage.
5. Une fois le site en ligne, l'URL publique Render remplacera automatiquement l'URL Wi-Fi dans les QR codes.

Important: il faut un service Render avec disque persistant. Sans disque persistant, les donnees creees depuis l'admin peuvent etre perdues au redeploiement.
