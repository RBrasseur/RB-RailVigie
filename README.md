# RB RailVigie

Application web (PWA) dédiée au **contrôle réglementaire des horaires, des intervalles de repos, des week-ends, des compteurs et des heures supplémentaires** (CP 226 / Lineas).
Elle fonctionne en binôme avec **RB RailSynthèse** (qui gère de son côté le calcul des primes financières).

## Fonctionnalités principales

1. **Identification souple & Vierge par défaut :**
   - La case du nom est vierge au démarrage pour le partage aux collègues.
   - Reconnaissance intelligente sans ordre ni casse (ex: écrire `Rémy Brasseur` reconnaît `BRASSEUR RÉMY MARCEL L`).
2. **Contrôle des intervalles entre deux prestations :**
   - **Repos journalier à domicile (14h00) :** Signale toute réduction sous 14h00 (autorisée 1 fois max/semaine).
   - **Alerte Anomalie (<= 12h00) :** Dès que le repos réduit descend à **12h00 ou moins**, la journée passe en anomalie rouge.
   - **Suivi automatique du rattrapage :** Le temps manquant sous 14h00 est automatiquement exigé sur le repos journalier suivant, **sauf s'il s'agit d'un découcher (hôtel)** — auquel cas le rattrapage saute le découcher et est vérifié sur le repos à domicile suivant.
   - **Découchers (Lit 1, Lit 2, et Lit "2" sur la même journée) :** Vérifie le minimum de **9h00** à l'hôtel et intègre les temps de trajet (>30 min à l'aller, 100 % au retour).
3. **Contrôle des Jours de Repos (`RX`) vs Alternements (`OO`) :**
   - Vérifie les **38h00** pour un `RX` isolé (et **62h00** pour un double `RX`).
   - Signale une erreur si un `RX` fait moins de 38h00 (indique qu'il faut un `OO`) ou si un `OO` est placé alors que les 38h00 étaient respectées.
4. **Qualification des Week-ends (Règle du jour de début) :**
   - Début vendredi (fin samedi) = 100 % Semaine.
   - Début samedi (fin dimanche) = 100 % Samedi.
   - Début dimanche (fin lundi) = 100 % Dimanche.
5. **Heures supplémentaires & Traçabilité PDF :**
   - Calcul à 3 niveaux : **Journalier (>10h)**, **Hebdomadaire (>46h)** et **Trimestriel (>38h en moyenne)**.
   - Export PDF détaillant d'où provient chaque heure supplémentaire et chaque anomalie de repos.
