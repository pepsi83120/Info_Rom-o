# Dossier a importer

Ce dossier contient tout ce qu'il faut pour heberger La villa Romeo Admin.

## A importer sur GitHub

Importe tout le contenu de ce dossier dans un nouveau repo GitHub :

- `index.html`
- `guest.html`
- `src/`
- `storage/`
- `server.js`
- `package.json`
- `render.yaml`
- `README.md`
- `.gitignore`

## Deploiement Render

1. Va sur Render.
2. Cree un nouveau Blueprint.
3. Connecte le repo GitHub qui contient ces fichiers.
4. Render detectera `render.yaml`.
5. Le site sera lance avec `npm start`.
6. Le dossier `/data` sera utilise pour garder les donnees sauvegardees.

Une fois le site en ligne, les QR codes utiliseront automatiquement l'URL publique Render.
