# EA Value Pro — EA-VALUE 3.0.0

PWA d'analyse sportive (football, basketball). Moteur statistique, **pas de « fausse IA »** : STATISTICAL MODEL · MODEL ENGINE · DECISION ENGINE. Il préfère NO BET à un faux signal et DATA UNAVAILABLE à une donnée inventée.

## Démarrage
Servir le dossier en HTTP(S) (service worker requis) puis ouvrir `index.html`. Ex. : `npx serve .` ou `python3 -m http.server`.
Nouvel onglet **Pro 3.0** : ANALYSE · MARCHÉS · DÉCISION · HISTORIQUE · MODEL LAB · BANKROLL. Les onglets historiques (Genèse, Basket Analyse, Histoire, Bets, Communauté, Classement…) sont conservés.

## Utiliser Pro 3.0
1. Choisir le sport et le mode (VALUE ou HIGH PROBABILITY). FAST MODE pour un téléphone faible (2 000 simulations, animations coupées).
2. ANALYSE : saisir équipes, moyennes de buts (foot) ou pace/ORtg/DRtg (basket). Effectif / Fatigue / Rotation : 🟢🟡🟠🔴 ou ⚪ « Je ne sais pas » (= information manquante, jamais « normal »). Les champs facultatifs (saison précédente, xG, statistiques des absents, dates des derniers matchs) rendent le calcul plus précis.
3. MARCHÉS : saisir les cotes (facultatif). Elles ne changent jamais la probabilité du modèle.
4. DÉCISION : BET / CHECK / NO BET, commentaire (pour/contre/risques/prix), qualité des informations, evidence ledger. « Enregistrer dans EA Memory » fige la prédiction.
5. HISTORIQUE : saisir cote de clôture et résultat après le match → ROI, CLV, mémoire par compétition/marché.
6. MODEL LAB : statut des modèles, calibration, backtest walk-forward, Model Health, Auto Discovery (expérimental), réglages.
7. BANKROLL : mise indicative et simulateur (toujours « SIMULATION — NOT A GUARANTEE »).

## Sauvegarde
L'export/import JSON existant inclut désormais EA Memory et les réglages Pro (`ea_pro_*`). Les migrations de stockage font un backup avant chaque étape et restaurent automatiquement en cas d'échec.

## Tests
```
node tests/run.js          # fonctions historiques de index.html (31)
node tests/run-pro.js      # modules EA 3.0 (120)
node tests/static-audit.js # audit statique
PLAYWRIGHT_PATH=<chemin>/playwright node tests/ui-mobile.js   # navigateur, 360/375/390/412/768 px
```

## Déploiement
Incrémenter `CACHE_NAME` du service worker à chaque publication (actuellement `ea-cabinet-cache-v19`). Documentation : `MODEL_DOCUMENTATION.md`, `AUDIT_REPORT.md`, `CHANGELOG.md`, `TEST_REPORT.md`.
