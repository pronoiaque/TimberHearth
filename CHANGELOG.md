# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/).

## [0.9.0] — 2026-06-13

### Ajouté
- **EVO-9 — Refonte du vaisseau** (reprise du plan « Refonte du vaisseau » du roadmap) :
  - **Coque tonneau** en `LatheGeometry` (profil ventru, bois lasuré) cerclée de **hoops cuivre**, nez orienté
    vers l'avant (-Z).
  - **Verrière en verre** (`MeshPhysicalMaterial` à transmission) avec cerclage cuivre — reflets/réfraction
    via la carte d'environnement (EVO-8), intensité relevée à 0.5.
  - **3 tuyères cuivre** (1 centrale + 2 latérales) avec **flammes additives** indexées sur la poussée.
  - **4 pieds amortisseurs articulés** (rotule + jambe inclinée + patin), **aileron dorsal**, **antenne + parabole**.
  - **Feux de navigation** bâbord rouge / tribord vert **clignotants** (repère d'orientation nocturne).
  - **Intérieur** réaligné face à l'avant (siège, console, écran de bord conservé).
  - Empreinte de **collision inchangée** (rayon 2.2) — refonte strictement visuelle.

## [0.8.0] — 2026-06-13

### Ajouté
- **EVO-8 — Qualité graphique** (reprise du backlog « refonte vaisseau / finesse ») :
  - **Reflets d'environnement PBR** : carte `RoomEnvironment` via `PMREMGenerator` (`scene.environment`,
    intensité 0.35) → métaux et verre crédibles (cockpit, tuyères, statue nomai…).
  - **Ombres plus nettes** : carte d'ombre du soleil `1024 → 2048` + `bias` ajusté.
  - **Vaisseau détaillé** : cerclage cuivre de coque, aileron dorsal, antenne + parabole, **feux de
    navigation** (vert/rouge), 4 pieds amortisseurs — purement visuel, **empreinte de collision inchangée**.
  - **PNJ affinés** : têtes/yeux/torses plus lisses (segments accrus), matériaux ajustés pour les gros plans.
- **EVO-7 — Plein écran** : `requestFullscreen()` déclenché au démarrage (geste utilisateur) + bouton **⛶**
  (tactile) pour basculer ; fallbacks vendeurs, ignoré si non supporté (ex. iPhone).

### Corrigé
- **Touches tactiles maintenues au changement de mode** : une commande maintenue (ex. **COUR**/`Maj`) restait
  active à l'embarquement (poussée « descente » bloquée en vol) ; les maintiens tactiles sont désormais
  réinitialisés à l'entrée et à la sortie du vaisseau. *(Rappel : en vol, les boutons à pied — Saut/Courir —
  ne sont plus affichés, remplacés par Monter/Descendre/Alunir/Auto/Sortir.)*

## [0.7.3] — 2026-06-13

### Modifié
- **EVO-7 — Visée capteurs en paysage** : `beta`/`gamma` étant relatifs au portrait naturel, le vecteur
  d'inclinaison est désormais **pivoté selon l'angle d'écran** (`screen.orientation.angle`) — le mapping
  lacet/tangage est donc correct en **portrait comme en paysage** (les deux sens).

## [0.7.2] — 2026-06-13

### Ajouté
- **EVO-7 — Visée par capteurs du téléphone** : bouton **« AXE TÉL »** (tactile) activant l'**inclinomètre**
  (`DeviceOrientationEvent`, gyroscope/boussole) — incliner le téléphone gauche/droite pilote le **lacet**,
  avant/arrière le **tangage** (relatif à une **calibration** prise à l'activation, zone morte 4°). Permission
  iOS gérée (demandée au tap) ; se combine avec le pad **REGARDER**. Masqué si le capteur est absent.

### Corrigé
- **Invite contextuelle figée** : « Embarquer dans le vaisseau — [E] » (et autres `prompt`) restaient
  affichés après l'action, car la branche qui les met à jour ne tourne qu'**à pied** ; l'invite est désormais
  vidée dès le passage en mode vaisseau. (Bug présent de longue date.)

## [0.7.1] — 2026-06-13

### Modifié
- **EVO-7 — Ergonomie tactile** : les boutons serrés (qui chevauchaient les jauges) laissent place à
  **deux pads joystick visibles** — **DÉPLACER** (gauche : avant/arrière/latéraux) et **REGARDER**
  (droite : visée continue haut/bas/gauche/droite, proportionnelle). Les **invites contextuelles** sont
  désormais **tappables** : « Parler à … / Embarquer — [E] » déclenche l'interaction (maintien géré pour la
  réparation), et « Pour verrouiller « l'Attlerock » » verrouille l'astre visé. Boutons restants regroupés
  au-dessus des pads (Saut/Courir ou Monter/Descendre/Alunir, sonde, scope, auto, sortie, journal).

## [0.7.0] — 2026-06-13

### Ajouté
- **EVO-7 — Support écran tactile (smartphone / tablette)** : détection automatique du tactile
  (`ontouchstart` / `maxTouchPoints`) ; les commandes tactiles ne s'affichent **que** dans ce cas.
  **Joystick virtuel XY** (déplacement) à gauche, **zone de visée au glissé du doigt** à droite, et
  **boutons pour les fonctions non remplaçables par un déplacement** : à pied (Saut, Courir, E, F, C, Journal),
  en vaisseau (Monter/Descendre, Alunissage, E, Verrouiller [T], Pilote auto [Y], Sortir, Journal). Le tout
  s'injecte dans le même pipeline d'entrées que clavier/manette (fusion par frame).

### Corrigé
- **Alunissage impossible** sur un astre verrouillé + pilote auto : le pilote auto et l'atterrissage se
  disputaient la commande et la lune (en orbite rapide) ne pouvait être « rattrapée ». L'**atterrissage est
  désormais spéculatif** (touche **`G`**) — **hors physique** (gravité/vitesses coupées) : le vaisseau glisse
  jusqu'au sol de l'astre **verrouillé** (sinon le plus proche) en **suivant son mouvement**, puis se pose. Le
  pilote auto est coupé automatiquement pendant la manœuvre.
- **Voûte étoilée mal répartie** (zones très denses, anneaux concentriques) : l'ancien échantillonnage
  `step(hash(grille cubique))` est remplacé par un **champ d'étoiles cellulaire** (un point net par cellule,
  position aléatoire, magnitudes variées) — distribution homogène, sans bandes ni arcs.

## [0.6.0] — 2026-06-13

### Ajouté
- **EVO-6 — Verrouillage d'astre & pilote automatique (mode vaisseau)** :
  - **Lock-on** : quand un astre passe au centre du **réticule**, une invite éphémère (~10 s) s'affiche —
    *« Pour verrouiller « l'Attlerock » : appuie sur [T] »*. La touche **`T`** verrouille / relâche la cible.
  - **Réticule instrumenté** : autour du viseur, **distance** et **vitesse relative** à l'astre verrouillé en
    **valeurs numériques**, plus un **vecteur-flèche** de dérive (vitesse relative projetée à l'écran),
    **vert** si on se rapproche / **rouge** si on s'éloigne, avec indicateur radial ▲/▼ du taux de rapprochement.
    Un **marqueur 🔒** suit l'astre à l'écran (nom + distance).
  - **Pilote automatique** (touche **`Y`**, sur la cible verrouillée) : **automatise direction et vitesse** —
    oriente le nez vers l'astre, accélère à l'approche puis **freine** à l'arrivée, et **annule la dérive
    latérale** pour un cap d'interception propre.

## [0.5.0] — 2026-06-13

### Ajouté
- **EVO-5 — Manette / Joystick & équilibrage lunaire** :
  - **Menu de remappage complet** (touche **`M`**) : prise en charge de la **Gamepad API** (axes + boutons),
    pensé pour le **Thrustmaster T16000M** (6 axes · 16 boutons · hat). Chaque action (poussée, latéraux,
    montée/descente, roulis, atterrissage assisté, interaction, sonde, Signalscope, journal) se mappe sur un
    **bouton**, et le **tangage / lacet / roulis** sur des **axes analogiques** (pilotage proportionnel, zone morte).
    Détection à chaud du périphérique, **mapping par défaut T16000M**, bouton de réinitialisation,
    **persistance** en `localStorage`. Le clavier reste actif en parallèle (fusion clavier+manette par frame).
  - **Carburant & poussée recalibrés** pour **atteindre l'Attlerock** : réservoir `100 → 160`, drain `1.0 → 0.7`,
    poussée `55 → 95`, amortissement `0.4 → 0.22` (vitesse terminale ~22 → ~60 u/s). Le voyage vers la lune
    est désormais réalisable sans tomber en panne sèche.

## [0.4.0] — 2026-06-13

### Ajouté
- **EVO-1 — Réveil & étoile mourante** : transition de réveil en **fondu de paupières** (début de partie, mort,
  supernova) ; le **soleil devient une géante rouge** sur les ~3 dernières minutes (couleur, taille, teinte du ciel
  via uniform `uDying`).
- **EVO-2 — Terrain analytique** : fonction de hauteur déterministe (value-noise 3D + fbm) partagée entre le **mesh**
  et les **collisions** ; **cratères**, **micro-relief**, **cuvette du village** (crête annulaire). Zones de gameplay
  aplaties (`FLAT_SPOTS`) → aucune régression. Couleurs du sol par altitude (herbe / roche / sable).
- **EVO-3 — Bande-son procédurale** : synthèse **Karplus-Strong** (corde pincée), **motif original** en pentatonique
  de La mineur joué au feu de camp (variations à chaque reprise) ; **spatialisation HRTF** (feu, Graine, harmonica) ;
  **silence progressif en altitude** ; bip d'alerte O₂ ; bandeau « carburant épuisé ».
- **EVO-4 — Performance** : arbres et rochers en **`InstancedMesh`** (de ~600+ draw calls à 5) ; **occlusion
  planétaire** des objets de surface sur la face opposée du globe.
- **Outils** : `npm run check` (bundle esbuild + analyse de portée acorn + vérification des blocs vitaux).
- **Packaging** : structure de dépôt Vite (`index.html`, `src/`, `public/assets/`), `README`, `NOTICE`, `LICENSE`,
  CI GitHub Actions.
- **Déploiement** : workflow **GitHub Pages** (build base `/TimberHearth/` + fallback SPA `404.html`) →
  publication automatique sur `https://pronoiaque.github.io/TimberHearth/`.

### Modifié
- **Planète agrandie** (rayon ×2) → exploration plus vaste ; orbite de la lune ajustée en proportion.
- **Carburant** recalibré (drain ÷4) pour permettre le voyage vers la lune.
- Vue de pilotage passée en **caméra de suivi** (corrige le clipping de la vue cockpit).
- Spawn déplacé **à côté** du feu de camp (au lieu de dedans).

### Corrigé
- Plusieurs **bugs de portée** issus du refactor multi-corps (variables `inZeroG`, `dur`, `frozen`, `keys` lues
  hors de leur bloc) — désormais couverts par `npm run check`.
- **Dialogues** bloqués au premier `E`/clic (passage à un drapeau d'état **synchrone**).
- **Puits d'apesanteur** : fin de la traversée infinie (capture par plafonnement de vitesse dans la bulle) ;
  **paroi de tunnel opaque** (on ne voit plus les étoiles à travers la planète) ; chute fluide.
- **HUD** figé (compteur de boucle, jauges, minimap) : bloc de rafraîchissement restauré et déplacé hors de la
  garde de vol.
- **Harmonica de la Graine** qui saturait à l'agonie (re-routé via le bus spatialisé).

## [0.3.0] — Multi-corps & exploration

### Ajouté
- Système **multi-corps** générique (registre d'astres, gravité par sphère d'influence, report d'inertie sur les
  corps mobiles) ; **lune l'Attlerock** en orbite réelle.
- **Puits sans fond** menant à une **bulle d'apesanteur** centrale.
- **Minimap** pseudo-sphère (projection orthographique centrée sur le joueur).
- **Sonde Scout** avec rendu **picture-in-picture** ; **Signalscope**.

## [0.2.0] — Vaisseau & vie au village

### Ajouté
- **Vol spatial 6DOF**, atterrissage assisté, ressources **O₂ / carburant**, HUD de vol.
- **16 personnages** aux dialogues originaux ; **journal d'enquête** en graphe ; **Observatoire** avec intérieur.
- Décor : bâtiments du village, arbres, rochers, geysers.

## [0.1.0] — Fondations

### Ajouté
- Planète sphérique, **gravité radiale**, marche tout autour du globe.
- Cycle jour/nuit, ciel par *shader*, **boucle de 22 minutes** et supernova.
- Séquence d'introduction ; **outil de debug** intégré (touche `L`, export TSV).

[0.4.0]: https://github.com/pronoiaque/TimberHearth/releases/tag/v0.4.0
