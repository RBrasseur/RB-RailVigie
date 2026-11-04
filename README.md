# RB RailVigie

Application web (PWA plein écran sur Android) dédiée au **contrôle réglementaire des intervalles entre services, des jours de repos (`RX`), des alternements (`OO`), des week-ends, des compteurs et des heures supplémentaires** (CP 226 / Lineas).

## Fichiers du dépôt GitHub
- `index.html` : Interface principale de l'application
- `styles.css` : Feuille de style sombre adaptée mobile & bureau
- `app.js` : Moteur de vérification réglementaire et d'export PDF
- `manifest.json` : Configuration PWA avec icônes 192x192 et 512x512 intégrées (mode `standalone` sans barre d'adresse)
- `sw.js` : Service Worker requis par Chrome Android pour installer l'application en plein écran
- `README.md` : Documentation
