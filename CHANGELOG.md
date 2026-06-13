# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/).

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
