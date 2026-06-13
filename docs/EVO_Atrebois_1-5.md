# ÂTREBOIS — Plan d'évolutions EVO-1 → EVO-5

> **Format** : document de génération. Chaque section EVO est autosuffisante : elle peut être collée telle quelle
> en début de session (avec le fichier `TimberHearth_r178.jsx` courant) pour produire l'implémentation.
> **Cadre** : hommage **non commercial** à Outer Wilds (© Mobius Digital / Annapurna). Tous les contenus produits
> (dialogues, poèmes, motifs musicaux, modèles) sont **originaux** — aucune reproduction de textes, musiques ou
> assets du jeu d'origine, aucun fan-model d'IP. Les mécaniques s'inspirent du lore, l'exécution est inédite.
>
> **Pipeline de validation obligatoire après chaque EVO** (déjà éprouvé sur ce projet) :
> 1. `npx esbuild TimberHearth_r178.jsx --loader:.jsx=jsx --bundle --external:three --external:react --external:react-dom --format=esm --outfile=/dev/null` → RC=0
> 2. Analyse de portée acorn (`scope.cjs`) → seul `React` toléré comme identifiant « non déclaré »
> 3. Grep de présence des blocs vitaux : `loopTime +=`, `setMini(`, `setHud((h) => ({ ...h, time: remain`, `captureFrame(dt)`, `composer.render()`
> 4. Test navigateur (panneau d'erreur rouge intégré + touche `L` pour log 136 colonnes/frame)

---

## État du projet au moment de ce plan (référence)

- **Stack** : React 18 + three r178 + Vite, fichier unique `TimberHearth_r178.jsx` (~2200 lignes), un `useEffect` moteur.
- **Monde** : Âtrebois R=400 (sphère lisse, vertex colors), Attlerock R=55 en orbite réelle (registre `BODIES`
  multi-corps générique : `registerBody`, `gravBody`, `updateBodies`, report de delta sur corps posés).
- **Systèmes** : vol 6DOF + autoland (G), O₂/carburant, puits Zéro-G (paroi opaque, capture en bulle),
  16 PNJ, Observatoire intérieur (slabs de collision en repère local), Ship Log en graphe SVG,
  minimap orthographique, Scout + PIP, debug touche L (TSV téléchargé), séquence d'intro, son de supernova.
- **Conventions** : positions par `latLon(R, lat, lon)` ; objets posés via `placeOnSurface(obj, lat, lon, up)` ;
  colliders cylindriques via `surfacePoint(lat, lon)` ; tout ce qui touche la gravité passe par `gravBody(pos)`
  et les champs `body.center / body.R / body.G / body.home`.

---

# EVO-1 — Réveil « paupières » + soleil mourant
**Impact : émotionnel maximal · Effort : faible · Risque : très faible · Statut : ✅ implémenté**

## Objectif
Donner corps à la boucle temporelle : (a) chaque réveil (début de partie, mort, supernova) s'ouvre par un
**battement de paupières** ; (b) le soleil **meurt visiblement** sur les dernières minutes (géante rouge),
pour que la fin de boucle se *sente* en levant les yeux, avant le flash.

## Spécification
- **Paupières** : deux panneaux noirs (moitié haute / moitié basse de l'écran) pilotés **en JS direct via refs**
  (aucun re-render React). Séquence `playWake()` : fermeture instantanée → 250 ms de noir → ouverture 1,5 s
  avec easing `cubic-bezier(.45,.05,.2,1)`. Déclencheurs : `beginGame()` (remplace le fondu noir d'intro,
  conserve les textes) et `resetLoop()` (moteur).
- **Soleil mourant** : `dyingF = smoothstep(loopTime, LOOP−180, LOOP−20)` (montée sur les 3 dernières minutes,
  saturé 20 s avant la supernova — le flash blanc existant prend le relais).
  - `sunMesh.material.color` : `#fff0c0 → #ff4818` ; `sunMesh.scale` : 1 → 2.3 (géante rouge).
  - Lumière directionnelle `sun.color` : `#fff4e0 → #ff7a45`.
  - **Shader ciel** : nouvel uniform `uDying` (float 0..1) ; teinte rouge multiplicative avant le mix `uSuper` :
    `sky = mix(sky, sky*vec3(1.25,0.55,0.40)+vec3(0.06,0,0), uDying*0.85);`
- **Aucune nouvelle dépendance**, aucun asset.

## Plan d'implémentation (ancres dans le fichier)
1. JSX : insérer les 2 divs paupières juste après l'overlay `overlayRef` (zIndex 40, pointerEvents none).
2. Composant : `eyelidTopRef/eyelidBottomRef` + `playWake()` (avant le `return`).
3. `beginGame()` : supprimer la manipulation d'overlay, appeler `playWake()` (textes d'intro inchangés).
4. `resetLoop()` (moteur) : appeler `playWake()` en fin de reset.
5. `SKY_FRAG` : `uniform float uDying;` + ligne de teinte ; objet `uniforms` du ciel : `uDying:{value:0}`.
6. `animate` : bloc « soleil mourant » après le calcul de `sunDir` (constantes couleurs hoistées hors boucle).

## Critères d'acceptation
- À chaque mort/supernova/début : écran noir bref puis ouverture en deux volets, fluide, sans flash blanc parasite.
- À ~3 min de la fin : ciel qui rougit progressivement, disque solaire visiblement plus gros et rouge.
- Aucun re-render React par frame (vérifier : pas de setState dans le chemin paupières/soleil).

## Risques
- Conflit overlay mort (fondu noir) ↔ paupières : l'overlay se coupe net au reset, les paupières prennent le relais — ordre à respecter.

---

# EVO-2 — Terrain analytique avec relief
**Impact : transforme la nature du monde · Effort : moyen-fort · Risque : moyen (collisions) · Statut : ✅ implémenté**

## Objectif
Remplacer la « boule de billard » par un terrain vivant : collines, vallées, cratères, **village dans une cuvette
bordée d'une crête**, micro-relief — tout en gardant des **collisions exactes** et **zéro régression** sur les
zones de gameplay existantes.

## Principe retenu : hauteur **analytique** + **zones aplaties**
- Une fonction **déterministe** `terrainHeight(n)` (n = direction unitaire) sert à la fois au **mesh**
  (déplacement des vertex) et aux **collisions** (sol à `groundR(n) = CFG.R + terrainHeight(n)`).
  → cohérence parfaite mesh/physique, coût ~0 (2-3 appels/frame).
- **FLAT_SPOTS** : liste de zones de gameplay où `h → 0` (masque smoothstep sur la distance angulaire).
  Tout ce qui existe à rayon exact `CFG.R` (village, bâtiments à collision murale, Graine, entrée du puits,
  cabanes isolées) reste **posé au sol sans modification**. Le relief vit *entre* ces zones.
- Bruit : **value noise 3D** maison (hash entier `Math.imul`, interpolation trilinéaire lissée), fbm 4 octaves +
  octave de micro-relief. Pas de dépendance externe, **pas de `Math.random`** dans le chemin hauteur (déterminisme).
- **Cratères** : liste fixe `[lat, lon, rayon°, profondeur]` → cuvette `smoothstep` + rebord gaussien.
- **Cuvette du village** : crête annulaire gaussienne (+5.5 u, pic à 13° du centre village) juste à l'extérieur
  du flatten (10°) → le village est *dans un cratère*, fidèle à l'esprit du lore.
- Amplitude bornée `h ∈ [−6, +9]` (1.5–2.3 % de R) ; géométrie planète densifiée 96×64 → **128×96**.
- **Couleurs par altitude** : herbe → roche (h > 3.2) → sable (h < −2.2), luminance modulée par h
  (multipliées par la texture sol existante).

## Branchements physiques (exhaustif)
| Point | Avant | Après |
|---|---|---|
| Mesh planète | sphère lisse | vertex déplacés à `R+h`, `computeVertexNormals()` |
| `placeOnSurface` | `R + up` | `groundR(n) + up` |
| `surfacePoint` (colliders) | `R` | `groundR(n)` |
| Collision sol joueur (home) | `pBody.R` | `groundR(dir)` |
| Collision sol vaisseau (home) | `body.R` | `groundR(dir)` |
| Autoland `altA` / HUD `altH` | `body.R` | `body.home ? groundR(upS) : body.R` |
| Spawn / pad vaisseau / resetLoop | `R + k` | `groundR(n) + k` |
| Arbres / rochers / buttes / cabanes | `R` | `groundR(n)` |
| O₂ `insideHome` | `< R − 1` | `< R − 8` (les vallées h≥−6 ne déclenchent plus « intérieur ») |
| Puits / rim / `inShaftColumn` | inchangés | couverts par le flatten (h=0 à l'entrée) |
| Lune / multi-corps | — | inchangé (`terrainHeight` ne s'applique qu'au corps `home`) |

`FLAT_SPOTS` initiaux : village `[86,0,10°]` (couvre obs/tour/vaisseau/ghost/bosquet/radio/cimetière),
Graine `[76,30,5°]`, puits `[70,120,5°]`, cabanes isolées `[80,150,3°] [72,80,3°] [−20,40,3°] [60,−120,3°] [40,100,3°]`.

## Critères d'acceptation
- Horizon vallonné visible depuis le village ; crête de cratère autour du village.
- Marcher hors du village : montées/descentes réelles, le joueur **suit le sol** (jamais enterré, jamais flottant).
- Vaisseau : se pose sur une colline à flanc → reste posé à la bonne hauteur ; HUD ALT cohérent près du sol.
- Toutes les zones de gameplay (PNJ, bâtiments, Graine, puits, geysers) inchangées visuellement et fonctionnellement.
- Arbres/rochers épousent le relief.
- Calibration : script Node sur 20 000 directions aléatoires → h min/max dans [−6, +9], moyenne ~0.

## Risques & parades
- **Tunneling** vaisseau à haute vitesse sur crête : couvert partiellement par le clamp existant ; raycast
  segmentaire prévu en EVO-4/“physique” si constaté.
- Objet legacy posé en dur à `CFG.R` hors flatten : symptôme = flotte/enterré → ajouter la zone à `FLAT_SPOTS`
  ou poser via `groundR`. (Inventaire fait : tous les cas connus sont couverts.)

---

# EVO-3 — Identité sonore : corde pincée procédurale + spatialisation
**Impact : âme du projet · Effort : moyen · Risque : faible · Statut : ✅ implémenté**

## Objectif
Une **musique originale** au timbre banjo/corde pincée (synthèse **Karplus-Strong**, ~30 lignes Web Audio),
spatialisation des sources du monde, et le **silence spatial** en quittant l'atmosphère.

## Spécification
- `pluck(freq, when, gain)` : buffer bruit blanc court → boucle filtrée passe-bas (delay = 1/freq,
  feedback ≈ 0.996) → decay naturel de corde. Aucun sample externe.
- **Motif original** (ne pas reproduire de thème existant) : 10–12 notes en **pentatonique mineure de La**
  (A C D E G), tempo ~70 BPM, variation aléatoire douce (octave, ordre) à chaque reprise ; joué au feu de camp,
  ré-instrumenté (tempo/registre) près de l'Observatoire et du Bosquet.
- **Spatialisation** : `PannerNode` (HRTF, distance inverse) sur feu de camp, geysers, harmonica de la Graine,
  machine EVA ; listener synchronisé à la caméra chaque frame (`ctx.listener` position + orientation).
- **Atmosphère** : gain master « monde » piloté par l'altitude — fondu vers le silence entre alt 60 et 140
  (ne reste que le moteur du vaisseau + bips HUD) ; retour du son en rentrant.
- Bips O₂ < 25 % (oscillateur court, 2 s d'intervalle).

## Plan
1. Module audio : `pluck()`, `startCampfireMotif()` (scheduler `setTimeout` sur `ctx.currentTime`), table du motif.
2. Convertir crépitement/vent existants vers des `PannerNode` positionnés ; boucle : mise à jour listener.
3. `animate` : gain monde = f(altitude corps home) ; arrêt/reprise propre du motif selon distance au feu.
4. Valider : pipeline standard + écoute (pas de clics, pas de fuite de nodes — `stop()` + GC des sources).

## Critères d'acceptation
- Au feu : motif de corde pincée audible, jamais identique deux reprises de suite, jamais strident.
- Tourner la tête → la source tourne (stéréo) ; s'éloigner → atténuation naturelle.
- Décoller : le monde s'éteint progressivement, silence spatial à haute altitude ; rentrer : retour du son.

---

# EVO-4 — Performance : instancing + occlusion planétaire
**Impact : marge pour tout le reste · Effort : moyen · Risque : faible · Statut : ✅ implémenté**

## Objectif
Ramener les centaines de draw calls (arbres clonés, rochers) à quelques-uns, et cesser de rendre
l'hémisphère opposé. Mesure avant/après via le debug `L` (`draw_calls`, `triangles`, `fps`).

## Spécification
- **Arbres** : `InstancedMesh` (1 par mesh du prototype : tronc, feuillage) ; matrices composées
  position(`groundR`)/orientation(`orient`)/échelle/rotation Y — remplir via `setMatrixAt`, `instanceMatrix.needsUpdate`.
  Les bosquets et la distribution actuelle (densité par latitude, exclusions) sont conservés tels quels.
- **Rochers** : 3 géométries déformées pré-calculées → 3 `InstancedMesh` (au lieu de 90 meshes uniques).
  `InstancedBufferAttribute` couleur pour varier les 2 teintes.
- **Occlusion planétaire** : par frame (throttle 0.2 s), pour chaque groupe « surface » enregistré
  (`registerSurfaceObject(obj, dirUnit)`) : `visible = dirUnit.dot(camDirUnit) > −0.15` (marge horizon + relief).
  S'applique aux bâtiments isolés, PNJ, props — PAS aux InstancedMesh globaux (déjà 1 draw call).
- **Mutualisation matériaux** : un `MeshStandardMaterial` partagé par famille (bois sombre, bois clair, roche…)
  au lieu de `new` par mesh.

## Critères d'acceptation
- `draw_calls` au village : réduction ≥ 60 % (mesuré au log L avant/après).
- Aucun pop visuel à l'horizon (marge −0.15 suffisante avec relief ±9).
- Zéro changement visuel à distance égale.

---

# EVO-5 — Modularisation + garde-fous (`npm run check`)
**Impact : assurance-vie du projet · Effort : moyen · Risque : faible (mécanique) · Statut : ⏳ à faire**

## Objectif
Sortir du fichier unique de 2200 lignes (cause directe des régressions « bloc mangé » rencontrées),
et **figer le pipeline de validation** en une commande.

## Découpage cible (imports ES, zéro changement de comportement)
```
src/
  game/
    config.js        (CFG, constantes)
    terrain.js       (EVO-2 : noise, FLAT_SPOTS, terrainHeight, groundR)
    bodies.js        (registre BODIES, registerBody, computeBodyPos, updateBodies, gravBody)
    sky.js           (SKY_VERT/FRAG, création ciel + soleil, soleil mourant)
    audio.js         (moteur Web Audio, pluck/motif, spatialisation)
    player.js        (état joueur, marche, collisions sol/murs, O₂)
    ship.js          (vaisseau, vol, autoland, ressources, caméra vol)
    npcs.js          (NPCS data + makeHearthian + interactions)
    world/           (village.js, observatory.js, shaft.js, grove.js, ghost.js, props.js)
    shiplog.js       (LOG_NODES/EDGES + persistance)
    debug.js         (captureFrame, dump TSV)
  ui/                (HUD.jsx, Minimap.jsx, ShipLog.jsx, Dialog.jsx, Gauges.jsx, FlightHud.jsx)
  TimberHearth.jsx   (composition : monte le moteur, branche l'UI)
```
Règles : le moteur expose un objet `game` (refs/état) consommé par l'UI via un petit store
(événements ou Zustand léger — au choix, pas de re-render par frame).

## Garde-fous (`package.json`)
```json
"scripts": {
  "check": "node tools/check.mjs",
  "dev": "vite", "build": "vite build"
}
```
`tools/check.mjs` enchaîne : (1) esbuild bundle strict → RC ; (2) analyse de portée acorn (le `scope.cjs`
du projet, généralisé multi-fichiers) ; (3) greps de blocs vitaux par fichier (liste déclarative) ;
(4) optionnel : lancement Puppeteer headless 5 s → échec si erreur console (attrape les écrans noirs).

## Migration sans casse (ordre imposé)
1. Extraire d'abord les **purs** (config, terrain, shiplog data, sky shaders) — aucun état.
2. Puis bodies.js (autonome). 3. Puis audio. 4. Puis player/ship (gros couplage : en dernier).
5. À chaque étape : `npm run check` + test navigateur avant l'étape suivante.

## Critères d'acceptation
- Comportement strictement identique (diff visuel nul) ; HMR par module (itération plus rapide).
- `npm run check` < 5 s, échoue sur : variable non déclarée, bloc vital manquant, erreur console au boot.

---

## Annexe — backlog au-delà d'EVO-5 (non chiffré)
PNJ keyframés sur la boucle (le village vit avec le temps) · vue cockpit interne propre · gamepad ·
fumée de cheminées + feuilles (sprites) · écran-titre 3D (scène réelle derrière le menu) · UI diégétique ·
référentiel solidaire pour corps mobiles (remplace le report de delta) · 2ᵉ planète via `registerBody` ·
Récepteur Warp / fresque / intérieur de la Graine (contenu lore).

---

# EVO-6 — Refonte du vaisseau (modèle + détails évolutifs)
**Impact : identité visuelle forte · Effort : moyen · Risque : faible · Statut : ⏳ à faire**

## Objectif
Remplacer le module « boîte + cockpit » par un vaisseau crédible façon bricolage de bois et de tôle,
avec des détails qui prennent du sens au fil des EVO (les éléments décoratifs deviennent fonctionnels).

## Spécification
- **Silhouette** : coque ventrue en lattes de bois (LatheGeometry profil tonneau), nez vitré
  (SphereGeometry hémisphérique, matériau physique transmission/opacity), 4 pieds amortisseurs articulés
  (cylindres + sphères), tuyère principale + 2 latérales (ConeGeometry inversées), antenne fouet + parabole.
- **Matériaux partagés** (préparer EVO-4) : bois lasuré, tôle rivetée (normalMap procédurale optionnelle),
  verre, cuivre des tuyères.
- **Détails évolutifs** (inertes aujourd'hui, branchés plus tard) :
  - feux de navigation clignotants (vert/rouge) → serviront de repère d'orientation nocturne ;
  - flamme de tuyère (cône additif scalé par la poussée) + lumière ponctuelle → feedback direct des commandes ;
  - trappe latérale → futur point d'embarquement E (remplace le rayon de proximité) ;
  - tableau de bord 3D (jauges cylindriques) → future UI diégétique (EVO backlog) ;
  - traces d'usure (decals sombres près des tuyères).
- **Échelle** : conserver l'empreinte de collision actuelle (~rayon 2.2) pour ne toucher ni l'autoland
  ni les poses : la refonte est strictement visuelle (groupe `ship` reconstruit, physique inchangée).

## Plan
1. Construire le nouveau groupe `buildShip()` pur (aucune dépendance d'état) retournant { group, thrusterFlame, navLights }.
2. Remplacer l'assemblage actuel ; rebrancher shipLight/cockpit refs existantes (dashScreen conservé).
3. `animate` : flamme scalée par `thrust.lengthSq()`, clignotants sur `clock.elapsedTime`.
4. Pipeline de validation complet + test visuel posé/vol/atterrissage.

## Critères d'acceptation
- Aucun changement de comportement physique (autoland, collisions, E identiques).
- Poussée visible (flamme + lumière) ; feux clignotants la nuit ; silhouette reconnaissable de loin.
