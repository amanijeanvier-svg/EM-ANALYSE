## Correctif — EA DATABASE ne voyait pas les matchs analysés + historique des combinés (cache v32)
**EA DATABASE (coller / importer la sauvegarde JSON)**
- **Cause 1** : le champ d'import de l'onglet 📊 ne lisait que du CSV (`parseCSV`). Un JSON collé tient sur une seule ligne → 0 ligne importée, sans message d'erreur.
- **Cause 2** : la base ne se nourrissait que de `DB` (analyses de moins de 24 h) et de `ea_pro_memory`. L'historique permanent **TRACK**, qui contient les 180+ matchs validés, n'était **pas une source** de la database.
- Nouveau : `D.fromTrack`, `D.fromBackup` (track + db + mémoire d'une sauvegarde) et `D.dedupeRows` (un même match vu par plusieurs sources n'est compté qu'une fois, la date exacte est préférée).
- `sources()` inclut maintenant TRACK : ouvrir l'onglet 📊 ou « Reconstruire depuis l'historique » intègre tous les matchs validés.
- Le champ d'import détecte le JSON (sauvegarde complète ou tableau de matchs) ; bouton « 📂 Choisir le fichier .json / .csv » (recommandé : un gros collage peut être coupé) ; un JSON incomplet affiche une erreur claire.
- Import de sauvegarde des Réglages : relance la réparation de l'archive et met la database à jour.

**Historique des combinés**
- `buildArchivedCombos` figeait un résultat vide `[]` (truthy en JS) calculé trop tôt ; ne fige plus qu'un jour terminé ET non vide. `archiveResult` dégèle le jour à chaque nouveau pari vérifié et est idempotent (plus de paris en double à la revalidation).
- `markResult` : l'archivage passe en premier, les mises à jour annexes (calibration, ratings, serveur) sont isolées dans des `try/catch` : une erreur annexe ne fait plus perdre le pari de l'historique.
- Paris non vérifiables (`hit === null`) exclus des combinés archivés ; le sélecteur n'affiche plus le jour courant en double.
- `repairArchiveOnce` (unique, drapeau `ea_archive_repair_v2`) : retire les doublons, dégèle les combinés vides/incomplets, reconstitue depuis TRACK les matchs absents de l'archive (datés au jour de validation).

## EA FINAL — intégration dans GENÈSE et BASKET ANALYSE + vérification S155
- **Nouveau `js/ea-bridge.js`** : sous « Paris retenus » (Genèse et Basket Analyse), bloc « 🎯 Verdict EA × Base de données » : pour chaque pari, probabilité du moteur → consensus base interne → probabilité finale, cote juste, cote minimale, edge/EV dès que la « Cote entrée » est saisie (mise à jour en direct), confiance, risque, stabilité, conflit, FINAL DECISION GATE, pourquoi / pourquoi pas ; équipes vs baseline du championnat, H2H en base, combiné (ou « ❌ Aucun combiné suffisamment solide »). Les calculs historiques ne sont pas modifiés ; le verdict est conservé dans l'enregistrement (`dbVerdict`).
- Marchés couverts par la base : buts Over/Under, BTTS, 1X2, double chance, corners / tirs cadrés / cartons (totaux), basket : victoire, total de points, marge. Tout autre marché (scores exacts, tranches) : « non couvert », jamais estimé.
- **Base alimentée automatiquement** : chaque résultat saisi (`markResult`) est ajouté immédiatement à EA DATABASE (score + corners/tirs cadrés/cartons totaux réels) ; au démarrage l'historique persistant est lu directement dans `ea_v3_store` (correctif : la synchronisation dépendait avant du moment où l'app charge son historique).
- **Mode live anti-leakage** : pour une analyse du jour, les résultats déjà connus à date approximative sont utilisés (signalés) ; en backtest strict ils restent exclus.
- Totaux de corners / tirs cadrés / cartons saisis « total seulement » acceptés sans découpage inventé ; total ≠ somme des équipes ⇒ quarantaine.
- Tests ajoutés : `run-bridge.js` (15), `run-crosscheck.js` (14, recalcul brut), `ui-bridge.js` (Playwright 360/412 px + installation avec historique pré-existant).
- Limite structurelle découverte : l'app conserve ses analyses 24 h seulement (RECORD_TTL_MS) et l'archive ne contient pas les scores ; la base ne se remplit donc qu'à partir des résultats saisis + imports CSV.

## EA FINAL LAYER (S99–S155)
- Nouveau `js/ea-dbfinal.js` : FINAL DECISION GATE (13 contrôles, critiques → NO BET / BLOCKED, jamais contournable), niveau de risque LOW/MEDIUM/HIGH/EXTREME (EV élevé ≠ risque faible si incertitude grande), confiance globale multi-facteurs (plafonnée par le facteur le plus faible, facteurs indisponibles listés, −15 si OVERFITTING RISK), sizing branché au Risk Engine (« POSITION SIZE NOT AVAILABLE » sinon), pipeline d'analyse en 16 étapes, rapport multi-marchés (7 marchés indépendants, priorités, combiné via le Parlay Optimizer ou « ❌ Aucun combiné suffisamment solide »), EA PERFORMANCE (pertes visibles, CLV UNAVAILABLE sans clôture), mémoire de patterns d'erreurs (N ≥ 30), DISTRIBUTION SHIFT, registre des moteurs ACTIVE/PARTIAL/UNAVAILABLE/INSUFFICIENT DATA conforme au code (xG partiel, Elo partiel, IA prédictive indisponible), 17 couches identifiables, pipeline d'ajout de match (11 étapes), contrôle final exécuté pour de vrai (MOBILE et REGRESSION restent ⚪ : non vérifiables depuis l'application), API-ready (importData, validateData, normalizeData, deduplicateData, rebuildDatabase, updateDatabase, updateModels, settleMatch, runAnalysis ; aucun appel réseau).
- `ea-database.js` : versions (schéma, paramètres, dernier rebuild, historique), FULL REBUILD contrôlé en 14 étapes avec sauvegarde préalable et RESTORE PREVIOUS STATE en cas d'échec, snapshots de décision immuables (hash) avec résultat stocké séparément.
- `js/ea-dbui2.js` + `ea-dbui.js` : 27 sous-sections dans 📊 EA DATABASE (analyse multi-marchés, ajout de match, performance, décisions, moteurs, dérive, contrôle final, tableaux traçables STAT/VALUE/N/PERIOD/CONFIDENCE/SOURCE/LAST UPDATE avec les matchs sources), CSS mobile, erreurs d'affichage isolées par section, mise à jour automatique locale au démarrage.
- Correction : la saisie de corners / tirs cadrés d'un match se fait par équipe (aucun découpage d'un total n'est inventé).
- Tests : `run-dbfinal.js` (30), `ui-database.js`, `ui-database-mobile.js` (Playwright, 360 et 412 px). Service worker v30.
- Limites : prompt reçu tronqué à S155 (message final) ; la base du projet livré est vide (vos données sont dans votre navigateur) ; Elo/xG nécessitent des saisies ; cartons et mi-temps non disponibles ; corrélations du combiné provisoires ; aucune API.

## EA DATABASE INTELLIGENCE (S50–S99, prompt reçu tronqué à S99)
- Nouveau `js/ea-dbintel.js` : anti-leakage (`PRE_MATCH_CUTOFF` strict : date fiable < date du match ; données à date approximative exclues ; contrôle 🟢 SAFE / 🔴 BLOCKED), qualité de la base sur 9 dimensions (EXCELLENTE → INSUFFISANTE, jamais « solide » sous 30 matchs), équipe vs baseline (écarts shrinkés), horizons temporels à segments NON chevauchants (une série de 5 ne peut pas écraser 100 matchs ; signal de récence faible/moyen/fort ; poids de la base augmenté si changement de coach/effectif), matchup (signaux forts/moyens/faibles/contradictions/insuffisants, buts attendus attaque×défense), CONFLICT SCORE, tests de stabilité (priorN, fenêtre récente, retrait de 10 % des données, retrait du modèle), pipeline de décision VALUE / CHECK / NO BET / BLOCKED (probabilités modèle / implicite brute / normalisée / finale séparées, cote juste, cote minimale, edge, EV, EV après incertitude, raisons explicites, POURQUOI / POURQUOI PAS), EA CONFIDENCE plafonnée par le facteur le plus faible, priorités 🥇🥈🥉 (VALUE seulement), TREND SHIFT (test z, jamais présenté comme permanent), OVERFITTING RISK, évolution contrôlée (ADOPT / ROLLBACK / INSUFFICIENT hors échantillon), MODEL HEALTH, EA SYSTEM STATUS (aucun 🟢 simulé), interfaces API-ready sans connexion simulée.
- `ea-database.js` : DUPLICATE CANDIDATE (même date + mêmes équipes, compétition nommée autrement : non compté), mode `strict`, journal technique (200 événements), fenêtre récente configurable.
- Onglet 📊 EA DATABASE : aperçu & statut, baselines/équipe vs ligue, qualité, analyse (model inputs), santé, journal paginé, erreurs, recherche instantanée, barre de progression d'initialisation. Pro 3.0 : carte « Priorité des paris ».
- Tests : `node tests/run-dbintel.js` (21). Service worker v29.
- Non fait / limites : S99 coupé en cours de phrase ; la qualité de base et les signaux s'appuient sur les scores finaux (corners/tirs UNKNOWN sans import) ; les modèles historiques (Genèse/Basket Analyse) ne consomment pas encore le consensus de la base ; pas de moteur de cartons/mi-temps (aucune donnée) ; l'évolution contrôlée est un outil de test, aucune modification automatique de poids n'est activée.

## EA DATABASE v1 (prompt « Database & Statistical Intelligence Engine », §1–48)
- Nouveau `js/ea-database.js` : base locale offline-first (`ea_database_v1`), identifiant unique de match (sport|compétition|saison|date|équipes) sans doublon (mise à jour si nouvelle version), donnée absente = `null`/UNKNOWN, contrôles d'intégrité (date manquante, équipe inconnue, score invalide, stats impossibles, négatifs) avec quarantaine visible, jamais de suppression silencieuse. Classement chronologique, filtre « avant la date » (aucune fuite du futur), mise à jour incrémentale avec cache invalidé par compétition/équipe, versioning (version, dernière mise à jour, dernier match, nb de matchs/équipes/compétitions). Processus d'initialisation en 11 étapes → 🟢 DATABASE READY.
- Profils compétition (1X2, double chance, buts, Over/Under 0.5–5.5, BTTS dont BTTS+Over/Under 2.5, corners, tirs cadrés, tirs avec lignes) et équipe (global/domicile/extérieur, clean sheets, forme, fenêtres 3/5/8/10/15/historique, séries signalées comme signal secondaire). Chaque statistique = k/n + niveau d'échantillon (VERY LOW → STRONG, configurable `CFG.levels`) ; jamais de « 100 % » sans k/n. Basket : schéma propre (points, marge, lignes de points).
- Consensus base + modèle (shrinkage vers la baseline de ligue, poids n/(n+20)), détection de CONFLIT STATISTIQUE, stabilité du signal, incertitude, provenance. Les jambes de combiné en conflit sont écartées (« conflit statistique »).
- Nouvel onglet 📊 EA DATABASE (`js/ea-dbui.js`) : 13 sous-sections, filtres (sport, compétition, saison, équipe, dom./ext., nb de matchs), recherche, H2H récent/ancien, import CSV, reconstruction automatique depuis l'historique existant (`DB`) et EA Memory, couche DATA PROVIDER (manuelle/locale, remplaçable par une API).
- Tests : `node tests/run-database.js` (15). Service worker v28.
- Non fait / limites : prompt reçu tronqué après §49 (Self-evolution) ; recency engine pondéré et matchup engine (attaque vs défense) non implémentés ; l'historique existant ne contient que des scores finaux, donc corners/tirs restent UNKNOWN tant qu'ils ne sont pas importés ; dates des analyses anciennes approximatives (marquées ⚠️) ; le consensus alimente pour l'instant le filtre de conflit du combiné, pas encore la probabilité des moteurs historiques.

## EA V3 — étape 5 : Market Performance, poids par marché, Risk Engine, backtest des règles
- Nouveau `js/ea-market.js` : performance par sport/marché (N, G/P, hit, ROI, EV, CLV, calibration), seuls les marchés ≥ 30 résultats sont affichés. Poids par marché progressif et borné (0,70–1,05, à partir de 100 observations, rétréci par n/(n+200)) ; il relève l'EV exigée des jambes de combiné, ne modifie jamais une probabilité et ne supprime aucun marché.
- Nouveau `js/ea-risk.js` : Risk Engine (plafond de mise 2 %, exposition ouverte ≤ 8 %, drawdown ≥ 20 % ou série ≥ 5 pertes ⇒ mise réduite de moitié, anti-martingale), uniquement plafonner/réduire. `plannedStake` enregistrée avec l'analyse (hors hash). Backtest des règles V3 (EV ≥ 5 %, qualité ≥ 60, BET) en 60/20/20 : ROI, hit, EV, drawdown, profit factor, CLV, simples/combinés.
- Affichés dans Model Lab et Bankroll. Test : `node tests/run-final.js` (14). Service worker v27.
- Limites connues : coefficients de corrélation et décote de cote du même match provisoires ; pool des combinés non persisté ; le moteur historique (Genèse/Basket Analyse) et Pro 3.0 ne sont pas fusionnés.

## EA V3 — étape 4 : snapshot immuable versionné + simples vs combinés
- `EA Memory` : chaque enregistrement porte un `snapshot` (date/heure, données saisies, tous les marchés avec probabilité/cote/edge/EV/décision/incertitude, qualité des données, commentaire, combiné éventuel, version du moteur) **inclus dans le hash** ; toute altération est détectée (✅ intact / ⚠️ altéré). Si les données changent, une nouvelle version est créée (`version`, `supersedes`) ; l'ancienne reste intacte. Les anciens enregistrements gardent leur hash.
- Combinés enregistrables (bouton « Enregistrer ce combiné »), réglables dans l'historique, exclus des statistiques des paris simples (`records()` ne renvoie plus que les simples).
- Carte « Simples vs Combinés » : N, ROI, cote moyenne, EV annoncé, nb de sélections ; verdict seulement à partir de 30 de chaque côté, écart de ROI ≥ 5 pts (configurable). Nouveau `js/ea-snapshot.js`, test `node tests/run-snapshot.js` (9). Service worker v26.
- Pas encore fait : Market Performance dédié, réduction progressive du poids d'un marché faible, fiche Risk Engine/exposition, mode backtest des nouvelles règles.

## EA V3 — étape 3 : calibration par tranches + League Profile
- Nouveau `js/ea-calibration.js` : tranches 0–50 / 50–55 … 90 %+, probabilité annoncée vs fréquence réelle, intervalle de Wilson, Brier, log loss, ECE. Paliers d'échantillon 12 / 50 / 100 / 300 / 500+ (Très faible → Solide), configurables (`config.sampleLevels`). Texte du type « calibration très faible : seulement 12 observations ». Mesure seulement : aucune probabilité n'est recalibrée.
- League Profile par sport / compétition : ROI, CLV, Brier, fiabilité par marché ; moyenne de buts, variance, avantage domicile, BTTS, Over 2.5 uniquement si assez de scores saisis. Informatif, aucune pondération automatique.
- Affichés dans Pro 3.0 › MODEL LAB. Tests : `node tests/run-calibration.js` (9). Service worker v25.
- Pas encore fait : snapshot immuable versionné, simples vs combinés, Market Performance dédié, apprentissage par marché avec réduction progressive de poids.

## EA V3 — étape 2 : retrait des combinés par risque + Post-match analysis + Error Memory
- Onglet Combinés historique : les catégories par niveau de risque sont retirées de l'interface ; un message renvoie vers le bloc unique « 🔥 COMBINÉ RENTABLE » (Pro 3.0 › DÉCISION). Les fonctions internes (`buildPrivateCombos`…) restent car les statistiques simples/combinés les utilisent.
- Nouveau `js/ea-postmortem.js` : diagnostic automatique de chaque pari réglé (bonne estimation, variance, cote insuffisante, information inconnue, mauvaise estimation), HYPOTHÈSE à confirmer, jamais de modification de la prédiction figée. Mémoire des erreurs par sport/compétition/marché ; prudence affichée seulement à partir de 30 observations (forte à 100), aucun paramètre du modèle ajusté automatiquement.
- Historique : champs facultatifs « Score dom./ext. » à la saisie du résultat (stocké dans `result.score`, hors hash de la prédiction) ; cartes POST-MATCH ANALYSIS et Error Memory.
- Tests : `node tests/run-postmortem.js` (9). Service worker `ea-cabinet-cache-v24`.
- Pas encore fait : calibration par tranches §10, League Profile, snapshot immuable versionné, performance simples vs combinés, Market Performance dédié.

## EA V3 — étape 1 : Correlation Engine + Parlay Optimizer
- Nouveau `js/ea-parlay.js` (intégré à `index.html`) : corrélation entre marchés du même match (Over/BTTS, victoire/Over, nul/Under…), probabilité jointe bornée (Fréchet), rejet des marchés exclusifs ou à dépendance inconnue. ρ **PROVISOIRES**, configurables (`config.parlay.rho`).
- Optimiseur : combinaisons 2 à 4 jambes testées en arrière-plan, nombre de jambes libre ; filtres EV ≥ 5 %, EV pessimiste > 0 (probabilités − incertitude), probabilité jointe ≥ 30 %, données ≥ 60, jambes BET uniquement. Sinon « PAS DE COMBINÉ RENTABLE ».
- Onglet Pro 3.0 › DÉCISION : bloc unique « 🔥 COMBINÉ RENTABLE », « Pourquoi ? », « Pourquoi pas ? », comparaison avec le meilleur simple. Pool = analyses de la session ayant des cotes (non persisté). Cote du même match : décote PROVISOIRE de 7 %.
- Tests : `node tests/run-parlay.js` (10). Service worker `ea-cabinet-cache-v23`.
- **Pas encore fait** : suppression des anciens combinés par niveau de risque (`buildPrivateCombos`, onglet Combinés historique), post-mortem, calibration par tranches, League Profile.

## Correctif Pro 3.0 — affichage de l'onglet
- `index.html` est désormais **autonome** : le CSS (`css/ea-pro.css`) et les 9 modules (`js/ea-*.js`) y sont intégrés. Si les dossiers `js/` et `css/` ne sont pas publiés sur GitHub Pages (ou pas à jour), l'onglet Pro 3.0 s'affiche quand même.
- Si un module plante au démarrage, l'onglet affiche maintenant le message d'erreur au lieu de rester vide.
- Service worker : pré-cache fichier par fichier (un seul 404 dans `cache.addAll` bloquait toute la mise à jour) ; cache `ea-cabinet-cache-v21`.
- `js/` et `css/` restent dans le projet comme sources (tests) : après modification, ré-intégrer dans `index.html` (`tests/static-audit.js` détecte toute dérive).

## Correctif Basket Analyse — confiance des prédictions
- **Rebonds / passes à 100 %** : `poissonDist` était tronquée à k≤25 ; avec ~88 rebonds attendus, toute la masse se retrouvait après renormalisation sur k=25. Borne désormais adaptative, calcul en logarithmes.
- **Victoire à 99,7 %** : le nudge de force s'ajoutait tel quel à une probabilité déjà à ~97 %. Il est maintenant pondéré par 4p(1-p), et la probabilité de victoire est plafonnée à 95 %.
- **Simulation basket** : bruit de rythme commun aux deux équipes + erreur sur l'écart attendu (écart-type marge ≈ 12-13, total ≈ 17), au lieu de ≈ 11 pour les deux.
- Service worker : `ea-cabinet-cache-v20`.

# CHANGELOG

## EA-BK2 (Basketball Engine V2) — cahier des charges « CONSISTENCY + REALISTIC PROBABILITY ENGINE »
Nouveau module `js/ea-bk2.js` (intégré à `index.html`), branché sur **Basket Analyse** :
- **Distribution unique** : victoire, handicaps, totaux, totaux équipe, marges, fourchettes de score et rebonds/passes sont comptés sur les mêmes simulations Monte Carlo (défaut 10 000 ; 1 000 / 5 000 / 50 000 via Model Lab, FAST MODE conservé). Le nombre affiché est le nombre réellement exécuté.
- **Suppression du « nudge » de force ajouté après la simulation et du plafond arbitraire de 95 %** : l'écart de force (Elo/classement/H2H) est injecté dans la marge attendue AVANT la simulation (`strengthMarginPts`, configurable).
- **Filtre des probabilités extrêmes** : >95 % VERIFY, >98 % SECOND CHECK, >99 % EXTREME CONFIDENCE — VERIFY MODEL avec recalcul analytique indépendant (moyenne rétrécie, σ gonflé), 100 % bloqué sauf événement certain ; les comptages utilisent (k+1)/(n+2), jamais 0 ou 1 exact.
- **Probability Consistency Engine** : victoire affichée vs simulation, échelle de marges monotone, σ implicite vs σ simulé (cas « 99,7 % mais −20,5 à 63 % »), handicaps/totaux affichés vs simulation.
- **Early season** (≤ 3 matchs) : marge attendue rétrécie ×n/(n+k) (k configurable, PROVISOIRE), dispersion élargie, libellé EARLY SEASON / SAMPLE SIZE : LOW / UNCERTAINTY : HIGH.
- **MODEL UNCERTAINTY** LOW / MEDIUM / HIGH / VERY HIGH (distinct de la probabilité de l'événement).
- **Modèle vs marché** : cotes des deux équipes → probabilité sans marge, edge en pts, EV, VALUE / NO VALUE / UNCERTAIN ; écart ≥ 15 pts → MODEL-MARKET DIVERGENCE — MODEL REVIEW REQUIRED. Le marché reste un benchmark, jamais un réglage.
- **Rebonds / passes** : distribution surdispersée avec erreur sur la moyenne (au lieu d'un Poisson pur) + filtre extrême.
- **Audit avant affichage** (7 contrôles) → OK / MODEL WARNING / ANALYSIS INVALID ; panneau au format §24 (projection, victoire, marchés, incertitude, modèle vs marché, décision BET/CHECK/NO BET, WHY, RISKS).
- `calibrationCheck` (Brier, log loss, ECE, MODEL OVERCONFIDENT) : disponible et testé ; **non branché sur l'historique** tant que les résultats basket ne sont pas enregistrés par marché.
- Tests : `tests/run-bk2.js` (37), `tests/ui-bk2.js` (navigateur). Service worker : `ea-cabinet-cache-v22`.

## EA-VALUE-3.0.0
Ajouts (nouveau code modulaire dans `js/`, `css/`) :
- Onglet **Pro 3.0** : Match center, Data Quality, Context (Effectif / Fatigue / Rotation avec option « Je ne sais pas »), Model center, Market center, Value center (probabilité, cote juste, cote actuelle, edge, EV, minimum acceptable), Decision center (BET / CHECK / NO BET), Commentary, Evidence ledger, Memory, Model Health, Bankroll. Navigation ANALYSE / MARCHÉS / DÉCISION / HISTORIQUE / MODEL LAB / BANKROLL, une colonne sur mobile.
- Early Season Engine (Early Season Reliability, `PROVISIONAL WEIGHTS`), Context Quality, Information Shock Detector, Feature Importance.
- Moteur basket : pace attendu, ORtg/DRtg attendus, points/marge/total attendus, Monte Carlo réellement exécuté (P victoire, handicap, plus/moins).
- Consensus de modèles (`MODEL WEIGHTS NOT YET CALIBRATED` tant que non calibré), kill switch, Model Health, backtest walk-forward avec contrôle d'intégrité (hash) et anti look-ahead, CLV, mémoire par sport/compétition/marché, Auto Discovery expérimental.
- Bankroll : niveaux MICRO/SMALL/STANDARD, `STAKE SIZE TOO LARGE`, simulateur.
- `storageVersion` + migrations avec backup et restauration automatiques ; export/import JSON étendu à EA Memory.
- FAST MODE (coupe animations, réduit les simulations), nombre de simulations configurable (1 000 / 5 000 / 10 000 / 50 000).
- Version affichée dans Model Lab (À propos · Debug) et Aide. Service worker `ea-cabinet-cache-v19` (js/css en réseau d'abord, précachés).
- Tests : 31 (historique) + 120 (EA 3.0) + audit statique + test navigateur mobile.

Correctifs sur le moteur historique :
- Monte Carlo football : biais du rejet Dixon-Coles corrigé (nuls sous-estimés d'environ 4,3 points, victoires à domicile surestimées d'environ 3 points).
- `absenceAdjustment` (basket) : suppression de la pénalité arbitraire de 8 % par absent (retourne 1). L'impact des absences est traité dans Pro 3.0, seulement à partir de statistiques.

Décision utilisateur : pas d'import ni d'analyse de captures d'écran.

## EA-VALUE-2.5.3
Étape intermédiaire : correctif Monte Carlo, harness de tests.

## EA-VALUE-3.0.0 (correctif export)
- L'export JSON inclut maintenant aussi `ea_stagetension_*`, `ea_aggsens_*` (apprentissages par ligue) et `ea_bankroll`, jusque-là oubliés.
