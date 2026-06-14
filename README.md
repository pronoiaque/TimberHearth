<div align="center">

# 🪐 Âtrebois — *Timber Hearth*

**Hommage non-commercial à [Outer Wilds](https://www.mobiusdigitalgames.com/outer-wilds.html)**
*Exploration spatiale narrative, 3D, dans le navigateur.*

[![stack](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)
[![three](https://img.shields.io/badge/three.js-r178-049ef4)](https://threejs.org)
[![vite](https://img.shields.io/badge/Vite-5-646cff)](https://vitejs.dev)
[![license](https://img.shields.io/badge/code-MIT-green)](LICENSE)

</div>

---

Réveille-toi près d'un feu de camp sur **Âtrebois**, lève les yeux vers une étoile vieillissante,
grimpe dans ton vaisseau de bois et de tôle, et pars explorer. Une **boucle de 22 minutes** s'achève
toujours par une supernova — puis tu rouvres les yeux au feu, ta mémoire (et ton **journal d'enquête**) intactes.

🎮 **Jouer en ligne** : https://pronoiaque.github.io/TimberHearth/ *(déployé automatiquement via GitHub Pages)*

> ⚠️ **Projet personnel non commercial.** Outer Wilds © Mobius Digital / Annapurna Interactive.
> Aucune reproduction de la bande-son, des textes ou des assets du jeu original — tout le contenu de ce dépôt
> (dialogues, poèmes, **musique synthétisée**) est **original**. Voir [`NOTICE.md`](NOTICE.md).

## ✨ Fonctionnalités

- **Planète sphérique complète** (gravité radiale, marche tout autour du globe) avec **relief analytique** :
  collines, vallées, cratères, et un **village niché dans une cuvette**. Collisions et mesh dérivent de la
  *même* fonction de hauteur → cohérence parfaite.
- **Vol spatial 6DOF** avec gestion **O₂ / carburant**, HUD de vol et caméra de suivi. **Alunissage
  automatique** (descente spéculative qui suit l'astre, même la lune en orbite).
- **Verrouillage d'astre & pilote automatique** : vise un astre, **verrouille-le** (`T`), lis sa **distance /
  vitesse relative** autour du réticule (valeurs + vecteur de dérive coloré), et laisse le **pilote auto** (`Y`)
  faire l'interception (oriente, accélère, freine).
- **Système multi-corps** générique : une **lune (l'Attlerock)** en orbite réelle ; ajouter un astre = une ligne.
- **Le Puits sans fond** : un tunnel traversant menant à une **bulle d'apesanteur** au cœur de la planète.
- **Boucle temporelle** : compte à rebours de 22 min, **soleil qui meurt visiblement** (géante rouge) sur la fin,
  réveil en **fondu de paupières**.
- **16 personnages** aux dialogues originaux, **journal d'enquête** en graphe de rumeurs, **sonde Scout** avec
  vue déportée (PIP), **Signalscope**.
- **Bande-son 100 % procédurale** : timbre de corde pincée (**Karplus-Strong**), motif original spatialisé,
  **silence en haute altitude**.
- **Contrôles universels** : clavier **AZERTY/QWERTY**, **manette / joystick** (menu de remappage complet `M`,
  pensé pour le Thrustmaster T16000M), et **écran tactile** (deux pads + boutons + invites tappables, visée par
  **capteurs d'inclinaison** du téléphone, **plein écran**) — détecté automatiquement.
- **Rendu soigné** : reflets PBR (carte d'environnement), ombres douces, **vaisseau détaillé** (coque tonneau en
  bois cerclée de cuivre, verrière en verre, tuyères, pieds, feux de navigation clignotants).
- **Minimap pseudo-sphère** façon carte d'OW, et **outil de debug intégré** (touche `L` → enregistrement TSV).
- **Sans dépendance d'assets** : tout a un *fallback* procédural — `npm install` puis `npm run dev` suffisent.

## 🎮 Commandes

### Clavier / souris

| Action | Touche(s) |
|---|---|
| Se déplacer | `Z Q S D` / `W A S D` |
| Sauter / jet d'apesanteur | `Espace` |
| Courir | `Maj` |
| Orientation | souris |
| Interagir · avancer le dialogue | `E` ou clic |
| Monter / descendre du vaisseau | `E` (près du vaisseau) / `R` |
| Pilotage — poussée | `Z Q S D` / `W A S D` |
| Pilotage — monter / descendre | `Espace` / `Maj` |
| Pilotage — roulis | `←` / `→` |
| **Alunissage automatique** (astre verrouillé / le plus proche) | `G` |
| **Verrouiller l'astre visé** | `T` |
| **Pilote automatique** (vers la cible verrouillée) | `Y` |
| Sonde Scout (lancer / rappeler) | `F` |
| Signalscope | `C` |
| Journal d'enquête | `Tab` |
| **Menu manette / joystick** (remappage) | `M` |
| Debug (enregistrement TSV) | `L` |
| Vitesse de boucle ×10 (test) | bouton en haut à droite |

> Clavier **AZERTY** et **QWERTY** gérés (lecture de `event.code`).

### Manette / Joystick

Branche la manette et appuie sur un bouton pour la faire détecter, puis ouvre le **menu de remappage** (`M`) :
chaque action se mappe sur un **bouton**, le tangage / lacet / roulis sur des **axes analogiques**. Mapping par
défaut pensé pour le **Thrustmaster T16000M** ; réglages **persistés** (localStorage). Le clavier reste actif en parallèle.

### Tactile (smartphone / tablette)

Détecté automatiquement. **Pad gauche** = déplacement, **pad droit** = visée (ou **capteurs d'inclinaison** du
téléphone via le bouton *AXE TÉL*). Les **invites contextuelles sont tappables** (« Parler à… / Embarquer », « Pour
verrouiller… »). Boutons d'action contextuels (Saut/Courir au sol ; Monter/Descendre/Alunir/Auto/Sortir en vol) et
bouton **plein écran** ⛶.

## 🚀 Installation

Prérequis : **Node.js ≥ 18**.

```bash
git clone https://github.com/pronoiaque/TimberHearth.git
cd TimberHearth
npm install
npm run dev      # → http://localhost:5174/
```

Build de production :

```bash
npm run build    # génère dist/
npm run preview  # sert le build localement
```

## 🌐 Déploiement (GitHub Pages)

Le dépôt inclut un workflow `.github/workflows/deploy.yml` qui **build et déploie automatiquement**
sur GitHub Pages à chaque push sur `main`. Pour l'activer une première fois :

1. Pousser le dépôt sur GitHub (branche `main`).
2. **Settings → Pages → Build and deployment → Source : `GitHub Actions`**.
3. Le prochain push (ou *Run workflow* depuis l'onglet *Actions*) publie le site sur
   `https://<utilisateur>.github.io/TimberHearth/`.

> Le build Pages utilise la base `/TimberHearth/` (variable `GHPAGES=1`). Si le dépôt porte un autre nom,
> ajuste la valeur dans `vite.config.js`. Le workflow génère aussi un `404.html` (fallback SPA).

📖 **Guide pas à pas (activation, dépannage)** : [`docs/GITHUB_PAGES.md`](docs/GITHUB_PAGES.md)

## 🗂️ Structure

```
TimberHearth/
├─ index.html                 Point d'entrée Vite
├─ package.json               Scripts (dev / build / preview / check)
├─ vite.config.js             Config Vite (React, base relative)
├─ src/
│  ├─ main.jsx                Bootstrap React
│  ├─ App.jsx                 Conteneur plein écran
│  ├─ TimberHearth.jsx        ★ Le jeu (moteur three.js + UI)
│  └─ styles.css              Reset minimal
├─ public/assets/             Assets CC0 optionnels (sinon fallback procédural)
├─ tools/
│  ├─ check.mjs               Pipeline de validation (npm run check)
│  └─ scope.cjs               Analyseur de portée (acorn)
├─ docs/
│  ├─ EVO_Atrebois_1-5.md     Plan d'évolutions (format générateur)
│  └─ GITHUB_PAGES.md         Guide de mise en ligne (Pages)
├─ CHANGELOG.md
├─ NOTICE.md                  Cadre Outer Wilds / assets
└─ LICENSE                    MIT (code)
```

## 🛠️ Développement & validation

Le jeu tient dans un fichier moteur dense. Pour fiabiliser les modifications, un pipeline est fourni :

```bash
npm run check
```

Il enchaîne : **(1)** bundle esbuild strict, **(2)** analyse de portée **acorn** (détecte les variables lues mais
jamais déclarées — ce qu'esbuild laisse passer), **(3)** vérification de **présence des blocs vitaux**
(une édition mal ciblée peut supprimer un bloc *sans* casser la syntaxe). Lancer après chaque modif lourde.

## 🧭 Gameplay

Parle aux habitants au village, suis les fils du **journal d'enquête**, descends le **Puits** jusqu'au cœur,
décolle vers l'**Attlerock**, et reviens avant la supernova. La boucle réinitialise le monde mais **pas** tes
découvertes : c'est en accumulant les indices d'une boucle à l'autre que l'histoire se dévoile.

## 🌱 Roadmap

Plan d'origine (format générateur) : [`docs/EVO_Atrebois_1-5.md`](docs/EVO_Atrebois_1-5.md).
Historique détaillé : [`CHANGELOG.md`](CHANGELOG.md). État actuel :

- ✅ **EVO-1** Réveil paupières + soleil mourant
- ✅ **EVO-2** Terrain analytique (relief, cratères, cuvette du village)
- ✅ **EVO-3** Bande-son procédurale (Karplus-Strong) + spatialisation
- ✅ **EVO-4** Performance : instancing + occlusion planétaire
- ✅ **EVO-5** Manette / joystick (remappage `M`) + équilibrage carburant lunaire + garde-fous `npm run check`
- ✅ **EVO-6** Verrouillage d'astre + pilote automatique (réticule instrumenté)
- ✅ **EVO-7** Support tactile (deux pads, invites tappables, capteurs d'inclinaison, plein écran)
- ✅ **EVO-8** Qualité graphique (reflets PBR, ombres, détails)
- ✅ **EVO-9** Refonte du vaisseau (coque tonneau, verrière, tuyères, pieds, feux de nav.)

Backlog : modularisation du fichier moteur · PNJ animés sur la boucle · vrai cockpit en vue première personne ·
2ᵉ planète · contenu lore additionnel.

## 🙏 Crédits & remerciements

- **Mobius Digital** & **Annapurna Interactive** pour *Outer Wilds*, l'œuvre qui inspire ce projet.
- [three.js](https://threejs.org), [React](https://react.dev), [Vite](https://vitejs.dev).
- Développé par **[pronoiaque](https://github.com/pronoiaque)**.

---

<div align="center"><sub>Fait avec admiration. Bon vol. ✦</sub></div>
