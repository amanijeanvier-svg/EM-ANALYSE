# EA Value Engine v2 — audit et modifications

Version moteur : EA-VALUE-2.2.0

## Modifications principales
- Séparation stricte P_MODEL / P_MARKET : les cotes bookmaker ne modifient pas la probabilité sportive.
- Évaluation par marché : EV, break-even, edge en points.
- Seuil VALUE prudent : EV >= 5%.
- EV > 12% classée comme anomalie à vérifier, pas comme pari exceptionnel.
- NO BET automatique si qualité des données < 60%, accord des modèles < 65% ou incertitude trop large.
- Kelly fractionné à 25%, plafonné à 2% de bankroll.
- Mode petite bankroll avec bankroll configurable (500 par défaut).
- Mise suggérée calculée uniquement après validation du prix et du signal.
- Les paris sans cote bookmaker ne sont plus considérés comme des value bets réels.
- Versionnement du moteur dans les enregistrements.
- Service worker incrémenté à v6 pour forcer la prise en compte de la nouvelle version.

## Validation effectuée
- Syntaxe JavaScript vérifiée avec Node.js.
- Recherche de références aux nouvelles fonctions effectuée.
- Archive PWA reconstruite à partir du projet fourni.

## Limites encore présentes
- Les cotes restent saisies manuellement dans cette version.
- Les données historiques externes ne sont pas magiquement ajoutées : un vrai backtest dépend de données historiques suffisamment complètes.
- L'intervalle d'incertitude reste une approximation de garde-fou et non un intervalle statistique de confiance calibré.


## Phase B — Value Audit & Calibration Pro
- Conservation de la cote bookmaker et de l'EV dans chaque évaluation vérifiée.
- Audit ROI réel uniquement sur les paris dont la cote bookmaker était effectivement connue.
- Calcul du ROI, hit rate, EV moyenne et drawdown maximal.
- Calibration avancée : Brier Score, Log Loss et ECE (Expected Calibration Error).
- Buckets de fiabilité 0–10% … 90–100% pour comparer probabilité annoncée et fréquence observée.
- Les résultats sans cote ne sont jamais comptés comme rendement financier.
- Le moteur reste orienté NO BET lorsque l'échantillon est trop faible ou les données insuffisantes.

## Validation Phase B
- JavaScript extrait de l'HTML et validé par `node --check`.
- Service worker incrémenté à v7.


## EA-64 — Market vs Model
- Chaque pari peut conserver la cote d'entrée réellement saisie.
- Calcul automatique : probabilité modèle, probabilité implicite du marché, cote juste, edge en points et EV.
- La cote ne modifie jamais P_MODEL.

## EA-65 — Closing Line Value
- Chaque pari peut recevoir une cote de clôture après le match.
- CLV calculée uniquement lorsque cote d'entrée + cote de clôture existent réellement.
- Affichage de la variation de cote et du CLV en points de probabilité implicite.
- Les données CLV sont conservées dans les évaluations vérifiées pour l'historique.

## Audit du 21/09/2026 — vérification EA-64/EA-65 + reste du cahier des charges
- Correctif : le badge/onglet "SAFE Bets 82%+" violait la section 24 du cahier des charges
  ("ne jamais utiliser SAFE/GARANTI/CERTAIN"). Renommé en "Probabilité élevée 82%+" /
  "PROBA ÉLEVÉE" côté affichage (les clés internes `data-sub="safe"` restent inchangées
  pour ne pas casser l'état UI déjà persisté chez les utilisateurs).
- EA-64 (Market vs Model) et EA-65 (CLV) vérifiés : calculs corrects, aucune fuite de la
  cote bookmaker dans P_MODEL, activation uniquement quand les deux cotes existent réellement.
- Phase B (Brier/Log Loss/ECE/buckets de fiabilité) vérifiée : formules standards, pas d'erreur
  de bornes sur les buckets.
- Service worker incrémenté à v9.

## Toujours pas implémenté (voir audit complet transmis à l'utilisateur)
(néant côté cahier des charges initial — voir "Limites connues" plus bas pour les
compromis assumés et les points qui resteraient à renforcer avec plus de recul)

## Session — CORRECTIF CRITIQUE : le verdict ne se générait plus du tout
- Cause : `computeGeneseLambdas()` (foot) et `computeBasketPoints()` (basket) calculaient
  `aSerieAdj`, `bSerieAdj`, `aSerieFor`, `aSerieRaw`, `bSerieFor`, `bSerieRaw`, `fatigueScoreA`,
  `fatigueScoreB` en interne mais ne les renvoyaient jamais (`return {...}` incomplet). Les
  fonctions `runAnalysisGe`/équivalent basket les utilisaient pourtant directement (ex.
  `if(aSerieAdj.applied)`), provoquant un crash JS ("aSerieAdj is not defined") systématique,
  à chaque analyse, foot et basket, sans exception — juste après le calcul des paris et juste
  avant l'affichage du verdict final. Symptôme observé : les champs se remplissent normalement,
  mais "Générer le verdict" ne produit jamais de résultat visible.
- Correctif : les 8 variables ajoutées au `return` des deux fonctions de calcul, et
  récupérées à la destructuration dans les fonctions appelantes. Aucune redéclaration en
  conflit, syntaxe validée (`node --check`) sur les deux blocs `<script>` du fichier.
- Moteur : EA-VALUE-2.5.1. Service worker : v16.

## Session — Walk-Forward Backtest (section 10/55/56/57)
- Bug corrigé : `computeVerifiedValuePerformance` itérait TRACK[sport] dans son ordre de
  stockage (le plus récent en premier, à cause du chargement trié + unshift à l'ajout), donc
  le drawdown cumulait les profits dans le mauvais sens chronologique. Corrigé par un tri
  chronologique croissant explicite avant tout calcul cumulatif.
- Chaque P_MODEL reste figé au moment de l'analyse (jamais recalculé après coup avec des
  données plus récentes) : le test est walk-forward par construction, et c'est maintenant
  vérifié et affiché explicitement (première/dernière date, N, statut chronologique).
- Ajout : ROI réel par tranche d'edge 0-3/3-5/5-8/8-12/>12% (section 29/71), ROI par
  championnat N≥5 (section 57), CLV moyen agrégé sur l'échantillon vérifié.
- Limite assumée : ce n'est pas un rejeu sur des données historiques externes (l'appli est à
  saisie manuelle, il n'existe pas de base de matchs passés indépendante) — le walk-forward
  porte sur l'historique réel des analyses de l'utilisateur, ce qui est la seule donnée
  honnête disponible dans cette architecture.
- Moteur : EA-VALUE-2.5.0. Service worker : v15.

## Session — Value Scanner, cartons, météo
- Value Scanner (section 26/12) : l'onglet "Value Bets" affiche désormais un grade de confiance
  A/B/C par pari (qualité des données, accord des modèles, incertitude, échantillon de
  calibration du marché), trié par grade puis par edge. Message "NO VALUE BET DETECTED" explicite.
- Modèle cartons dédié (section 78) : champs de saisie "Cartons (moy.)" par équipe (football),
  `pickCardsMarket()` sur une loi de Poisson paramétrée par la moyenne de cartons déclarée (pas
  une réutilisation du lambda buts), marché vérifiable dans l'Historique, classé séparément
  (`stat_cards`) dans les stats de calibration.
- Module météo (section 41) : champs optionnels vent/pluie/état du terrain (football). Purement
  informatif — NONE/LOW/MEDIUM/HIGH affiché dans le contexte narratif au-delà de MEDIUM, mais
  AUCUNE correction appliquée au lambda, conformément à la consigne explicite du cahier des
  charges ("ne pas fabriquer une correction arbitraire" / "seulement si le modèle possède
  suffisamment de données historiques pour justifier cette relation", ce qui n'est pas le cas).
- Moteur : EA-VALUE-2.4.0. Service worker : v14.

## Session du 21/09/2026 (suite 3) — Module fatigue calculé (section 40)
- Ajout, en plus du curseur manuel existant (case "Enchaînement fatigant" + sévérité faible/
  modéré/élevé, qui reste utile sans chiffres précis), d'un calcul objectif à partir de données
  concrètes : jours de repos depuis le dernier match, nombre de matchs sur 7 jours (foot+basket)
  et sur 14 jours (foot uniquement — moins pertinent en NBA où les séquences sont plus denses et
  mieux capturées par la fenêtre 7 jours), et prolongation (foot uniquement).
- Score de fatigue 0-100, retourne null (aucune valeur inventée) si rien n'est renseigné.
- Correction volontairement faible et plafonnée, conformément à la consigne explicite du cahier
  des charges ("et non attaque -15%") : au score maximal, -2.5% sur l'attaque de l'équipe
  fatiguée et +1.8% sur ce que l'adversaire est susceptible de marquer contre elle. Les deux
  équipes sont traitées symétriquement et indépendamment du curseur manuel (les deux peuvent
  s'appliquer ensemble, ce ne sont pas la même source d'information).
- Transparence : une phrase apparaît dans le contexte narratif de l'analyse uniquement quand le
  score dépasse 40/100, avec le chiffre affiché.
- Service worker incrémenté à v12.

## Session du 21/09/2026 (suite 2) — Opponent Strength Adjustment
- Sections 37/43 : ajout d'un champ "force des adversaires série" (0-100, optionnel) par équipe,
  foot et basket, à côté du champ Elo dans Classement & contexte. Le formulaire ne permet pas de
  taguer l'adversaire de CHAQUE match de la série individuellement (ça demanderait un champ par
  ligne) — c'est donc un niveau moyen déclaré pour l'ensemble de la série saisie, pas un vrai
  FORM RAW/FORM ADJUSTED match par match comme décrit littéralement dans le cahier des charges.
  Assumé comme compromis raisonnable plutôt que de laisser la correction totalement absente.
- Si le champ est vide : aucune correction (IMPACT UNKNOWN, comme demandé section 39/43) —
  jamais de valeur inventée.
- Correction bornée à ±15% du signal de forme pondérée par récence (jamais de correction
  extrême, comme demandé), appliquée après la pondération de récence déjà en place.
- Transparence : quand la correction s'applique, une phrase dans le contexte narratif de
  l'analyse l'indique explicitement (à la hausse/à la baisse/inchangée) — il n'existe pas
  encore de section numérique dédiée "COMMENT LE MODÈLE A CONSTRUIT LE LAMBDA" (section 5) dans
  cette appli ; ce serait un chantier séparé plus large touchant tout l'affichage du dossier.
- Service worker incrémenté à v11.

## Session du 21/09/2026 (suite) — reprise du chantier interrompu + parité basket
- Pondération de la forme récente par ordre chronologique (sections 34/36) : implémentée
  (`weightedRecentAvg`, poids 30/22/17/12/9/6/4 configurables) et branchée sur les lambdas
  football ET basket, plus les rappels affichés dans "comment le modèle a construit le lambda".
  Comme le formulaire n'a pas de champ date par match, la décroissance se fait sur le RANG dans
  la série saisie (le plus ancien en premier, convention déjà utilisée par trendIndex) — c'est
  une approximation assumée, pas une vraie décroissance calendaire.
- Décroissance H2H (section 35/42) : même principe, poids plus doux (34/26/19/13/8), appliqué
  aux moyennes A-vs-B et B-vs-A utilisées dans h2hGap/defGap, foot et basket.
- Parité basket/football sur l'ajustement de force : le basket réutilisait encore l'ancienne
  version (amortissement plat ×0.7 uniquement en 'coupe', jamais en 'europe' ; plafond simple
  ±40% sans palier blowout ; ancrage ligue non réduit en coupe/Europe). Les trois corrections
  déjà faites côté football ont été reportées à l'identique côté basket, à l'échelle des points :
  plafond dynamique avec palier blowout au-delà de |strengthGap|>0.65 (jusqu'à ±60% au lieu de
  ±40%), amortissement scindé qualityIdx/enjeuIdx uniquement (Elo/H2H/défense non touchés) pour
  'coupe' ET 'europe', et ancrage ligue plafonné à 0.12 (au lieu de 0.35) en compétition
  hétérogène.
- Simulateur de croissance de bankroll (section 22/68) : nouvel écran dans Profil, Monte Carlo
  (3000 tirages) sur bankroll/nombre de paris/mise %/cote/win rate saisis, affichant scénarios
  conservateur (P10) / central (médiane) / optimiste (P90), drawdown maximal moyen et risque de
  ruine — jamais présenté comme une prévision garantie.
- Service worker incrémenté à v10.
