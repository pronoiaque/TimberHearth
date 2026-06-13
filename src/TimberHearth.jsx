// TimberHearth.jsx — Vite + three r178 (WebGL2)
// Install :  npm i three@0.178.0
// Assets (optionnels, self-hostés) dans /public/assets/ — voir ASSETS plus bas.
// Tout asset externe a un fallback procédural : le jeu tourne même sans /public/assets/.
//
// Hommage non-commercial. Outer Wilds © Mobius Digital / Annapurna Interactive.
// Ne PAS embarquer l'OST originale ni des modèles "fan" dérivés de l'IP sans droits.

import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"; // EVO-8 : éclairage d'environnement PBR

const CFG = {
  R: 400, G: 30, EYE: 1.4, WALK: 7, RUN: 13, JUMP: 11, INTERACT: 4.5,
  LOOP: 22 * 60, SUPERNOVA_WARN: 120,
  // EVO-5 : poussée/amortissement recalibrés pour atteindre l'Attlerock (vitesse terminale ~60 u/s au lieu de ~22).
  SHIP_THRUST: 95, SHIP_ROLL: 1.6, SHIP_PITCHYAW: 1.1, SHIP_DAMP: 0.22,
  O2_MAX: 100, O2_DRAIN: 0.4, O2_DRAIN_EVA: 0.8, O2_REFILL: 40,   // par seconde (mode easy)
  // EVO-5 : réservoir agrandi + drain réduit → autonomie ~230 s de poussée continue (voyage lunaire confortable).
  FUEL_MAX: 160, FUEL_DRAIN: 0.7, FUEL_REFILL: 40,                 // par seconde
};

// ---- Manifeste d'assets (chemins relatifs, self-host CC0) -------------------
// Dépose tes fichiers ici ; sinon le fallback procédural prend le relais.
const BASE = (import.meta?.env?.BASE_URL ?? "/") + "assets/";
const ASSETS = {
  // Modèle Hearthian (générique/CC0 que TU as le droit d'utiliser ; PAS un fan-model OW).
  // Si présent : recoloré par PNJ (peau/vêtements) et orienté à la surface. Sinon → mesh procédural.
  hearthianGLB: null,                         // ex : BASE + "hearthian.glb"
  // Végétation CC0 (Kenney Nature Kit / Quaternius) — convertis en .glb, dépose ici :
  treeGLB: BASE + "tree.glb",                 // fallback : cône + tronc procéduraux
  // Textures CC0 répétables (ambientCG, Poly Haven, Kenney) — fallback : couleur unie
  groundTex: BASE + "ground_grass.jpg",       // sol herbeux
  barkTex: BASE + "bark.jpg",                 // écorce des troncs
  // Audio CC0 (Freesound CC0 / musique tallbeard CC0) :
  ambienceMP3: BASE + "ambience_night.mp3",   // fallback : vent brown-noise + grillons proc.
  musicMP3: BASE + "campfire_folk_cc0.mp3",   // fallback : pas de musique (silence)
};

// ---- Shaders ciel -----------------------------------------------------------
const SKY_VERT = `varying vec3 vDir;
void main(){ vDir=normalize((modelMatrix*vec4(position,1.0)).xyz);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FRAG = `precision highp float;
uniform vec3 uSun; uniform float uSuper; uniform float uDying; varying vec3 vDir;
const vec3 DAY_Z=vec3(0.20,0.38,0.65),DAY_H=vec3(0.58,0.78,0.95),DUSK=vec3(0.77,0.35,0.30);
const vec3 NIG_Z=vec3(0.03,0.05,0.12),NIG_H=vec3(0.10,0.12,0.22);
float hash(vec3 p){return fract(sin(dot(floor(p),vec3(127.1,311.7,74.7)))*43758.5453);}
// EVO-6+ : champ d'étoiles cellulaire — un point net (jitter) par cellule, densité uniforme,
// sans les arcs ni anneaux concentriques de l'ancien step(hash(grille)).
float starField(vec3 d){
  vec3 p=d*230.0; vec3 ip=floor(p); vec3 fp=fract(p)-0.5;
  float present=step(0.93,hash(ip));                          // ~7% des cellules portent une étoile
  vec3 j=vec3(hash(ip+11.5),hash(ip+27.3),hash(ip+41.7))-0.5; // position aléatoire dans la cellule
  float dd=length(fp-j*0.7);
  float bright=0.45+0.55*hash(ip+5.1);                        // magnitudes variées
  return present*bright*smoothstep(0.16,0.0,dd);
}
void main(){
  vec3 d=normalize(vDir); float sd=dot(d,uSun); float zen=clamp(d.y,0.0,1.0); float sh=uSun.y;
  float day=clamp(sh*2.0+0.5,0.0,1.0);
  vec3 sky=mix(mix(NIG_H,NIG_Z,zen),mix(DAY_H,DAY_Z,zen),day);
  float dusk=1.0-clamp(abs(sh)*3.0,0.0,1.0); sky=mix(sky,DUSK,dusk*0.6);
  sky+=vec3(1.0,0.95,0.7)*pow(clamp(sd,0.0,1.0),32.0)*day*0.7;
  sky=mix(sky,vec3(1.0,0.97,0.85),smoothstep(0.9975,0.999,sd));
  float starB=clamp(1.0-day*1.5,0.0,1.0); sky+=vec3(0.92,0.95,1.0)*starField(d)*starB*0.95;
  sky=mix(sky,sky*vec3(1.25,0.55,0.40)+vec3(0.06,0.0,0.0),uDying*0.85);
  sky=mix(sky,vec3(0.9,0.3,0.1),uSuper*0.5);
  gl_FragColor=vec4(sky,1.0);
}`;

const NPCS = [
  { id: "slate", name: "Slate", skin: 0x4f7e9a, eye: 0xc87830, droop: 0.4, cloth: 0x5c3d1e, lat: 87.5, lon: 3,
    lines: ["Tiens, notre pilote ! De retour de ta nuit à la belle étoile.",
      "J'ai recyclé le réservoir d'oxygène de secours en chambre de combustion. Ça n'a explosé qu'une fois. Bon, deux.",
      "Va chercher les codes de lancement chez Hornfels, à l'observatoire."] },
  { id: "hornfels", name: "Hornfels", skin: 0x5585a0, eye: 0xe8c820, droop: 0.5, cloth: 0x8a7a60, lat: 84, lon: 25,
    lines: ["Te voilà ! Les conditions sont idéales pour décoller.",
      "Tu seras notre premier astronaute équipé de l'outil de traduction nomai.",
      "Voici tes codes. La statue remontée des Profondeurs… ses yeux refusent de s'ouvrir."] },
  { id: "gossan", name: "Gossan", skin: 0x4a8a70, eye: 0xe85520, droop: 0.45, cloth: 0x6b7054, lat: 80, lon: -40,
    lines: ["Salut, jeune éclos. Grand jour.",
      "Tu as visité la Grotte Zéro-G ? L'apesanteur, c'est de la survie là-haut.",
      "Si tu ne respectes pas le vide, il ne te respecte pas non plus. C'est moi qui le dis."] },
  { id: "spinel", name: "Spinel", skin: 0x7080b0, eye: 0x60c0e0, droop: 0.15, cloth: 0x2a3060, lat: 82, lon: 70,
    lines: ["La Lune Quantique était visible cette nuit. Et puis non.",
      "Elle ne reste en place que tant qu'on l'observe. On regarde ailleurs et — pouf.",
      "Trois ans que je la traque. L'univers a un sens de l'humour épouvantable."] },
  { id: "hal", name: "Hal", skin: 0x6098c0, eye: 0x70c050, droop: 0.1, cloth: 0x4a5568, lat: 84, lon: 34,
    lines: ["L'outil de traduction ? C'est NOTRE projet — le tien et le mien. Bon, surtout le mien.",
      "Les nomais écrivaient en spirales. Quand deux d'entre eux parlaient, leurs spirales s'entrelaçaient.",
      "Si tu trouves de l'écriture nomai là-haut… reviens tout me raconter. Tout."] },
  { id: "galena", name: "Galena", skin: 0x5078a0, eye: 0x80e080, droop: 0.1, cloth: 0x4a3540, lat: 83, lon: 20,
    lines: ["Ces textes nomais sont extraordinaires. Chaque conversation entrelace les voix.",
      "Trois mois que je suis ici et je ne lis toujours qu'une page par jour.",
      "Tant de sens dans chaque courbe. C'était une langue, mais aussi une relation."] },
  { id: "mica", name: "Mica", skin: 0x7ab0c8, eye: 0xc09060, droop: 0.2, cloth: 0xd95f1a, lat: 86, lon: 2,
    lines: ["Salut ! Tu veux t'entraîner sur la maquette avant le grand saut ?",
      "Le pilotage, c'est cent pour cent d'instinct et zéro pour cent de panique.",
      "Enfin… c'est ce que je dis aux éclos. Entre nous, garde un œil sur le carburant."] },
  { id: "rutile", name: "Rutile", skin: 0x5a8890, eye: 0xf0a030, droop: 0.45, cloth: 0x3a4a6a, lat: 85, lon: -14,
    lines: ["Systèmes nominaux. Carburant à cent pour cent. Train d'atterrissage fonctionnel.",
      "J'ai vérifié chaque vaisseau que Slate a construit. À chaque fois, une surprise non documentée.",
      "Cette fois : le réservoir d'oxygène de secours a été 'réaffecté'. Je n'ai pas posé de question."] },
  { id: "arkose", name: "Arkose", skin: 0x5090c8, eye: 0xb0d020, droop: 0.0, cloth: 0x3a6530, lat: 86, lon: 51, height: 1.25,
    lines: ["Oh — salut. Je… regardais cette zone. Scientifiquement. À distance de sécurité.",
      "Cette pierre que j'ai lancée a juste… disparu. Hornfels dit que c'est de la Matière Fantôme.",
      "La clôture, c'est ma ligne de sécurité. Je RESTE derrière la ligne. (lance une autre pierre)"] },
  { id: "tektite", name: "Tektite", skin: 0x3a5a72, eye: 0xe04020, droop: 0.35, cloth: 0x2a4030, lat: 76, lon: 34,
    lines: ["Tu as vu cette chose ? Une Graine de Ronce Noire. Elle a déjà pris racine.",
      "L'intérieur est plus grand que l'extérieur. La physique y est… fausse. Je n'aime pas ça.",
      "(à voix basse) Tu entends ? On dirait un harmonica. Ne le dis pas à Gneiss."] },
  { id: "gneiss", name: "Gneiss", skin: 0x4a7a90, eye: 0xd0c050, droop: 0.4, cloth: 0x3d5030, lat: 87, lon: 10,
    lines: ["Tu as vu le cratère au nord ? Une Graine de Ronce Noire y a pris racine.",
      "Tektite veut la détruire tout de suite. Moi, je pense qu'il faut l'ÉTUDIER d'abord.",
      "Un spécimen vivant si près de chez nous… et qui ferait de la musique ? Imagine l'article !"] },
  { id: "marl", name: "Marl", skin: 0x6070a0, eye: 0xa0d080, droop: 0.75, cloth: 0x704030, lat: 87, lon: -12,
    lines: ["Jour de lancement. À chaque fois, je viens ici et je regarde.",
      "Tu lèves les yeux : c'est l'infini. Tu baisses les yeux : c'est la maison.",
      "Je n'ai jamais rejoint le programme. Mais ça n'a jamais empêché personne d'essayer."] },
  { id: "tephra", name: "Tephra", skin: 0x487080, eye: 0xe0a840, droop: 0.5, cloth: 0x6a4520, lat: 84, lon: 14,
    lines: ["Prêt pour le lancement ? J'ai vérifié les planches de la tour ce matin.",
      "Cet arbre a mille ans. On l'a juste évidé et posé une fusée dessus.",
      "Il a survécu à tout ce que la planète lui a envoyé. Il survivra bien à notre petit programme."] },
  { id: "moraine", name: "Moraine", skin: 0x4a6880, eye: 0xc07030, droop: 0.5, cloth: 0x5a7050, lat: 86, lon: -22,
    lines: ["Bonjour. (fixe sa ligne) Bonne journée pour ça.",
      "Je pêche le quadrupède. Le poisson à quatre yeux. Comme chaque matin.",
      "Les geysers sont plus bruyants ces temps-ci. Comme s'ils essayaient de dire quelque chose."] },
  { id: "porphy", name: "Porphy", skin: 0x608898, eye: 0xd0c080, droop: 0.4, cloth: 0xd95f1a, lat: 88, lon: 42,
    lines: ["Oh — éclos ! Jour de lancement. Tu es excité ? Tu devrais.",
      "La propulsion de ton vaisseau vient des cristaux de gravité nomais.",
      "On ignore comment ça marche exactement. Mais ça marche. La meilleure sorte d'ingénierie."] },
  { id: "tuff", name: "Tuff", skin: 0x4a6a58, eye: 0xd07030, droop: 0.3, cloth: 0x3d2510, lat: 71, lon: 118,
    lines: ["(penché sur sa pioche) Oh, salut. Tu cherches la Grotte Zéro-G ?",
      "C'est moi qui l'ai trouvée en creusant. Pile au centre de la planète, la gravité s'annule.",
      "Gossan y entraîne les astronautes. Moi, je préfère le poids honnête de la roche."] },
];

// 'rumor' = visible en silhouette même non découvert (indice). Les autres n'apparaissent qu'une fois 'learn'.
const LOG_NODES = {
  // colonne gauche : le programme / village
  outer_wilds: { label: "Outer Wilds Ventures", short: "OWV", x: 0.12, y: 0.15, color: "#d95f1a", base: true,
    text: "Le programme spatial hearthien. Fondateurs : Hornfels, Gossan, Slate, Feldspar." },
  timber_hearth: { label: "Âtrebois (Timber Hearth)", short: "Âtrebois", x: 0.12, y: 0.4, color: "#ff7d25", base: true,
    text: "Ta planète natale. Le Village occupe un grand cratère." },
  talked_slate: { label: "Slate — l'ingénieur", short: "Slate", x: 0.12, y: 0.62, color: "#8fb0c0",
    text: "A bricolé le vaisseau. Cherche Feldspar depuis longtemps." },
  talked_marl: { label: "Marl — le contemplatif", short: "Marl", x: 0.12, y: 0.82, color: "#8fb0c0",
    text: "N'a jamais rejoint le programme. Regarde chaque lancement." },
  // colonne 2 : observatoire / nomai
  talked_hornfels: { label: "Codes de lancement (Hornfels)", short: "Codes", x: 0.36, y: 0.15, color: "#e8c820",
    text: "Hornfels remet les codes et veille sur la statue nomai." },
  nomai_statue: { label: "Statue-mémoire nomai", short: "Statue", x: 0.36, y: 0.37, color: "#4060c0", rumor: true,
    text: "Yeux scellés… jusqu'à ce que tu utilises la sonde. Elle attend quelqu'un." },
  observatory_exhibits: { label: "Expositions de l'Observatoire", short: "Musée", x: 0.36, y: 0.58, color: "#c8a84b",
    text: "Artefacts nomais, cristal de gravité, rocher quantique." },
  talked_hal: { label: "Hal — écriture en spirale", short: "Hal", x: 0.36, y: 0.78, color: "#7cc050",
    text: "Les nomais écrivaient en spirales entrelacées. Outil de traduction." },
  // colonne 3 : phénomènes
  launched_scout: { label: "Sonde Scout", short: "Scout", x: 0.6, y: 0.12, color: "#ffaa33",
    text: "Caméra-sonde lançable. Révèle ce que l'œil ne voit pas." },
  found_ghost_matter: { label: "Matière Fantôme", short: "Ghost", x: 0.6, y: 0.32, color: "#00fff0", rumor: true,
    text: "Gaz létal invisible à l'œil, visible via la sonde. Près du village." },
  quantum_grove: { label: "Bosquet Quantique", short: "Quantique", x: 0.6, y: 0.52, color: "#d0d0ff", rumor: true,
    text: "Un éclat qui se déplace dès qu'on cesse de l'observer." },
  rode_geyser: { label: "Geysers", short: "Geysers", x: 0.6, y: 0.72, color: "#4db8b8",
    text: "Colonnes d'eau qui propulsent vers l'espace." },
  // colonne 4 : ronce noire / feldspar
  talked_tektite: { label: "Tektite — la Graine", short: "Tektite", x: 0.84, y: 0.2, color: "#e04020", rumor: true,
    text: "Une Graine de Ronce Noire a pris racine. Tektite veut la détruire." },
  signal_feldspar: { label: "Signal de Feldspar", short: "Feldspar", x: 0.84, y: 0.42, color: "#c8a84b", rumor: true,
    text: "Un harmonica résonne depuis l'intérieur de la Graine. Feldspar y serait." },
  // bas : grotte zéro-g / vaisseau / espace
  talked_gossan: { label: "Gossan — entraînement EVA", short: "Gossan", x: 0.6, y: 0.9, color: "#7ac0a0",
    text: "Recommande la Grotte Zéro-G pour apprendre l'apesanteur." },
  zero_g_cave: { label: "Grotte Zéro-G", short: "Zéro-G", x: 0.36, y: 0.95, color: "#80a0ff", rumor: true,
    text: "Au centre de la planète, la gravité s'annule." },
  repaired_machine: { label: "Machine EVA réparée", short: "Machine", x: 0.12, y: 0.97, color: "#34d399",
    text: "Exercice de réparation en apesanteur, réussi." },
  piloted_ship: { label: "Pilotage du vaisseau", short: "Vaisseau", x: 0.84, y: 0.66, color: "#fbbf24",
    text: "Le vaisseau répond aux commandes. L'espace s'ouvre." },
  attlerock: { label: "L'Attlerock (lune)", short: "Attlerock", x: 0.6, y: 0.66, color: "#aaaaa6", rumor: true,
    text: "La lune d'Âtrebois. Faible gravité, une station nomai au pôle. Accessible en vaisseau." },
  // PNJ secondaires regroupés (un seul nœud "villageois")
  talked_spinel: { label: "Spinel — Lune Quantique", short: "Spinel", x: 0.84, y: 0.86, color: "#60c0e0", rumor: true,
    text: "Traque une lune qui n'existe que lorsqu'on l'observe." },
};
// arêtes (relient les nœuds entre eux ; affichées en plein si les deux bouts sont connus)
const LOG_EDGES = [
  ["outer_wilds", "timber_hearth"], ["timber_hearth", "talked_slate"], ["timber_hearth", "talked_marl"],
  ["outer_wilds", "talked_hornfels"], ["talked_hornfels", "nomai_statue"], ["nomai_statue", "observatory_exhibits"],
  ["observatory_exhibits", "talked_hal"], ["talked_hornfels", "launched_scout"],
  ["launched_scout", "found_ghost_matter"], ["launched_scout", "quantum_grove"], ["nomai_statue", "launched_scout"],
  ["timber_hearth", "rode_geyser"], ["talked_hal", "signal_feldspar"],
  ["talked_tektite", "signal_feldspar"], ["found_ghost_matter", "talked_tektite"],
  ["talked_gossan", "zero_g_cave"], ["zero_g_cave", "repaired_machine"], ["talked_hornfels", "piloted_ship"], ["piloted_ship", "attlerock"],
  ["piloted_ship", "signal_feldspar"], ["timber_hearth", "talked_gossan"], ["timber_hearth", "talked_spinel"],
];
const LABELS = Object.fromEntries(Object.entries(LOG_NODES).map(([k, v]) => [k, v.text || v.label]));

// Poème de Gabbro (Bosquet Quantique) — strophes originales, change à chaque lecture
const GABBRO_POEM = [
  "Au-delà des étoiles qui s'éteignent,\nje cherche la note juste\ndans le silence entre les boucles.",
  "Le sable coule toujours vers le bas,\nl'eau coule toujours vers le bas ;\nmoi, j'observe depuis mon île.",
  "Ma flûte appelle ceux qui partent\net ceux qui ne savent pas encore\nqu'ils sont déjà partis.",
  "L'univers retient son souffle.\nMoi, je le laisse filer —\nil reviendra bien me chercher.",
];

// ---- AssetManager (fallback systématique) -----------------------------------
class AssetManager {
  constructor() {
    this.gltf = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    this.gltf.setDRACOLoader(draco);
    this.tex = new THREE.TextureLoader();
    this.errors = new Set();
  }
  async loadGLTF(url, fallbackFn) {
    if (!url) return fallbackFn();
    try { const g = await this.gltf.loadAsync(url); return g.scene; }
    catch (e) { this.errors.add(url); console.warn(`[Assets] GLB échec ${url} → fallback`); return fallbackFn(); }
  }
  // Texture répétable sRGB ; retourne null si absente (→ couleur unie en fallback)
  async loadTexture(url, repeat = 4) {
    if (!url) return null;
    try {
      const t = await this.tex.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;       // r155+ : sinon couleurs délavées
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      return t;
    } catch (e) { this.errors.add(url); console.warn(`[Assets] texture échec ${url} → couleur unie`); return null; }
  }
  async loadAudioBuffer(ctx, url) {
    if (!url) return null;
    try { const r = await fetch(url); if (!r.ok) throw 0; return await ctx.decodeAudioData(await r.arrayBuffer()); }
    catch (e) { this.errors.add(url); console.warn(`[Assets] audio échec ${url} → fallback proc.`); return null; }
  }
}

// ---- Hearthian procédural (CapsuleGeometry — OK en r178) --------------------
function makeHearthian({ skin, eye, droop, cloth, height = 1.4 }) {
  const g = new THREE.Group(); const s = height / 1.4;
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78, metalness: 0.05 });
  const clothM = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.88 });
  const eyeM = new THREE.MeshStandardMaterial({ color: eye, emissive: eye, emissiveIntensity: 0.25, roughness: 0.18, metalness: 0.1 });
  const pupM = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.2 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * s, 0.35 * s, 6, 16), clothM);
  torso.position.y = 0.65 * s; g.add(torso);
  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 16, 12), clothM);
  hip.position.y = 0.42 * s; g.add(hip);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 28, 20), skinM);
  head.scale.set(1, 0.88, 0.95); head.position.y = 1.08 * s; g.add(head);

  const hy = 1.10 * s;
  for (const sx of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 18, 12), eyeM); e.position.set(0.07 * s * sx, hy, 0.16 * s); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 12, 8), pupM); p.position.set(0.07 * s * sx, hy, 0.19 * s); g.add(p);
    const se = new THREE.Mesh(new THREE.SphereGeometry(0.028 * s, 12, 8), eyeM); se.position.set(0.17 * s * sx, hy - 0.02 * s, 0.08 * s); g.add(se);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.18 * s, 6), skinM);
    const droopA = THREE.MathUtils.lerp(-0.3, 0.8, droop);
    ear.position.set(0.2 * s * sx, 1.2 * s, -0.05 * s);
    ear.rotation.z = -sx * (Math.PI * 0.15) + droopA * 0.6 * sx; ear.rotation.x = -0.3; g.add(ear);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, 0.28 * s, 4, 6), clothM);
    arm.position.set(0.28 * s * sx, 0.72 * s, 0); arm.rotation.z = -0.3 * sx; g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), skinM);
    hand.position.set(0.34 * s * sx, 0.5 * s, 0); hand.scale.set(1, 0.7, 0.8); g.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * s, 0.25 * s, 4, 6), clothM);
    leg.position.set(0.1 * s * sx, 0.2 * s, 0); g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 5), clothM);
    foot.position.set(0.1 * s * sx, 0.04 * s, 0.04 * s); foot.scale.set(1, 0.5, 1.5); g.add(foot);
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return g;
}

// Instancie un PNJ depuis un prototype GLB : clone profond + matériaux clonés + recoloration.
// Heuristique simple : les matériaux clairs → peau (couleur PNJ), les sombres → vêtements.
// Normalise la taille à ~1.4 u de haut et pose les pieds à l'origine (comme makeHearthian).
function instantiateHearthianGLB(proto, { skin, cloth, eye, height = 1.4 }) {
  const g = proto.clone(true);
  g.traverse((c) => {
    if (!c.isMesh) return;
    c.castShadow = true;
    const src = Array.isArray(c.material) ? c.material : [c.material];
    c.material = src.map((m) => {
      const nm = m.clone();
      const lum = nm.color ? (nm.color.r + nm.color.g + nm.color.b) / 3 : 0.5;
      if (nm.emissive && (nm.emissive.r + nm.emissive.g + nm.emissive.b) > 0.3) nm.color.setHex(eye);   // parties émissives → yeux
      else if (lum > 0.45) nm.color.setHex(skin);                                                        // clair → peau
      else nm.color.setHex(cloth);                                                                       // sombre → vêtements
      return nm;
    });
    if (Array.isArray(c.material) && c.material.length === 1) c.material = c.material[0];
  });
  // normalisation taille + pieds au sol
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = size.y > 1e-3 ? height / size.y : 1;
  g.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(g);
  g.position.y -= box2.min.y; // pose les pieds à y=0 dans le repère local
  // on enveloppe dans un groupe pour que l'orientation surface s'applique au pivot pieds
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}

const latLon = (R, la, lo) => {
  const a = THREE.MathUtils.degToRad(la), b = THREE.MathUtils.degToRad(lo);
  return new THREE.Vector3(R * Math.cos(a) * Math.sin(b), R * Math.sin(a), R * Math.cos(a) * Math.cos(b));
};
const orient = (o, n) => o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());

// ===================== EVO-2 : TERRAIN ANALYTIQUE =====================
// Hauteur déterministe h(direction) utilisée par le mesh ET les collisions (cohérence parfaite).
// Les zones de gameplay (FLAT_SPOTS) sont aplaties (h→0) : tout l'existant posé à CFG.R reste valide.
const TERRAIN_AMP = 7;        // amplitude des collines (unités monde)
const TERRAIN_FREQ = 2.4;     // fréquence du bruit sur la sphère unité
const FLAT_SPOTS = [          // [lat, lon, rayon angulaire °] — h forcé à 0 (smoothstep)
  [86, 0, 10], [76, 30, 5], [70, 120, 5], [80, 150, 3], [72, 80, 3], [-20, 40, 3], [60, -120, 3], [40, 100, 3],
];
const CRATERS = [             // [lat, lon, rayon °, profondeur] — cuvette + rebord
  [30, -30, 8, 5], [-40, 160, 10, 6], [10, 100, 7, 4], [-60, -80, 9, 5], [55, 40, 6, 4],
];
const _ihash = (x, y, z) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const _sm = (t) => t * t * (3 - 2 * t);
const vnoise3 = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ux = _sm(x - ix), uy = _sm(y - iy), uz = _sm(z - iz);
  const c = (dx, dy, dz) => _ihash(ix + dx, iy + dy, iz + dz);
  const L = (a, b, t) => a + (b - a) * t;
  const x00 = L(c(0, 0, 0), c(1, 0, 0), ux), x10 = L(c(0, 1, 0), c(1, 1, 0), ux);
  const x01 = L(c(0, 0, 1), c(1, 0, 1), ux), x11 = L(c(0, 1, 1), c(1, 1, 1), ux);
  return L(L(x00, x10, uy), L(x01, x11, uy), uz);
};
const fbm3 = (x, y, z) => { let a = 0, amp = 0.5, f = 1; for (let o = 0; o < 4; o++) { a += amp * vnoise3(x * f + 13.7, y * f + 7.3, z * f + 3.1); amp *= 0.5; f *= 2.03; } return a; };
const FLAT_DIRS = FLAT_SPOTS.map(([la, lo, r]) => ({ n: latLon(1, la, lo).normalize(), cosOut: Math.cos(r * Math.PI / 180), cosIn: Math.cos(r * 0.55 * Math.PI / 180) }));
const CRATER_DIRS = CRATERS.map(([la, lo, r, d]) => ({ n: latLon(1, la, lo).normalize(), r: r * Math.PI / 180, d }));
const terrainHeight = (n) => {
  let h = (fbm3(n.x * TERRAIN_FREQ, n.y * TERRAIN_FREQ, n.z * TERRAIN_FREQ) - 0.5) * 2 * TERRAIN_AMP; // collines/vallées
  h += (fbm3(n.x * 7 + 50, n.y * 7 + 50, n.z * 7 + 50) - 0.5) * 1.6;                                  // micro-relief
  for (const c of CRATER_DIRS) {                                                                       // cratères
    const ang = Math.acos(THREE.MathUtils.clamp(n.dot(c.n), -1, 1));
    if (ang < c.r) { const t = ang / c.r; h += -c.d * _sm(1 - t) + c.d * 0.35 * Math.exp(-Math.pow((t - 0.92) * 9, 2)); }
  }
  { // crête du cratère du village : anneau gaussien juste au-delà du flatten principal (10°), pic à 13°
    const angDeg = Math.acos(THREE.MathUtils.clamp(n.dot(FLAT_DIRS[0].n), -1, 1)) * 180 / Math.PI;
    h += 5.5 * Math.exp(-Math.pow((angDeg - 13) / 2.6, 2));
  }
  let mask = 1; // aplatissement des zones de gameplay
  for (const f of FLAT_DIRS) {
    const d = n.dot(f.n);
    if (d > f.cosOut) { const t = THREE.MathUtils.clamp((d - f.cosOut) / (f.cosIn - f.cosOut), 0, 1); mask = Math.min(mask, 1 - _sm(t)); }
  }
  return THREE.MathUtils.clamp(h * mask, -6, 9);
};
const groundR = (n) => CFG.R + terrainHeight(n); // rayon du sol d'Âtrebois dans la direction unitaire n

// ===================== EVO-7 — Couche tactile (smartphone / tablette) =====================
// Pad joystick générique (deux exemplaires : DÉPLACER à gauche, REGARDER à droite).
// onVec(x,y) reçoit un vecteur -1..1 ; le pad gauche pilote KeyW/S/A/D, le droit la visée continue.
function TouchPad({ side, color, label, onVec, api }) {
  const ref = useRef(null), idRef = useRef(null);
  const [k, setK] = useState({ x: 0, y: 0 });
  const RAD = 54;
  const upd = (t) => { const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const len = Math.hypot(dx, dy) || 1; const cl = Math.min(len, RAD); const nx = dx / len * cl, ny = dy / len * cl; setK({ x: nx, y: ny }); onVec(nx / RAD, ny / RAD); };
  const start = (e) => { e.preventDefault(); api.current?.start(); const t = e.changedTouches[0]; idRef.current = t.identifier; upd(t); };
  const move = (e) => { for (const t of e.changedTouches) if (t.identifier === idRef.current) upd(t); };
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === idRef.current) { idRef.current = null; setK({ x: 0, y: 0 }); onVec(0, 0); } };
  const pos = side === "left" ? { left: 16 } : { right: 16 };
  const c = color || "rgba(125,211,252,.4)";
  return (
    <div ref={ref} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
      style={{ position: "absolute", bottom: 22, ...pos, width: 132, height: 132, borderRadius: "50%", background: "rgba(8,20,32,.28)", border: `1px solid ${c}`, touchAction: "none", pointerEvents: "auto" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 56, height: 56, marginLeft: -28, marginTop: -28, borderRadius: "50%", background: c, opacity: 0.45, transform: `translate(${k.x}px,${k.y}px)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", marginTop: -7, textAlign: "center", fontSize: 10, fontFamily: "monospace", color: "rgba(226,232,240,.45)", pointerEvents: "none" }}>{label}</div>
    </div>
  );
}
// Bouton tactile (impulsion via onDown, ou maintien via onDown/onUp).
function TouchBtn({ label, color, onDown, onUp }) {
  return <div onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onDown && onDown(); }}
    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onUp && onUp(); }}
    onTouchCancel={() => onUp && onUp()}
    style={{ minWidth: 52, height: 44, padding: "0 10px", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: color || "#e2e8f0", background: "rgba(8,20,32,.6)", border: `1px solid ${color || "rgba(125,211,252,.4)"}`, touchAction: "none", pointerEvents: "auto", userSelect: "none" }}>
    {label}
  </div>;
}
// Bouton bascule (ex. Courir) : conserve son état actif.
function TouchToggle({ label, color, code, api }) {
  const [on, setOn] = useState(false);
  const c = color || "rgba(125,211,252,.4)";
  return <div onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); const nv = !on; setOn(nv); api.current?.hold(code, nv); }}
    style={{ minWidth: 52, height: 44, padding: "0 10px", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: on ? "#0b1220" : (color || "#e2e8f0"), background: on ? c : "rgba(8,20,32,.6)", border: `1px solid ${c}`, touchAction: "none", pointerEvents: "auto", userSelect: "none" }}>
    {label}
  </div>;
}

// Bascule capteurs d'inclinaison du téléphone (gyroscope/boussole) — visée par inclinaison.
function TiltToggle({ api }) {
  const [on, setOn] = useState(false);
  if (typeof window === "undefined" || !window.DeviceOrientationEvent) return null;
  const c = "rgba(167,139,250,.65)";
  return <div onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); const nv = !on; setOn(nv); api.current?.tilt(nv); }}
    style={{ minWidth: 52, height: 44, padding: "0 8px", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.05, color: on ? "#0b1220" : "#c4b5fd", background: on ? c : "rgba(8,20,32,.6)", border: `1px solid ${c}`, touchAction: "none", pointerEvents: "auto", userSelect: "none" }}>
    AXE&nbsp;TÉL
  </div>;
}

// ===================== EVO-5 — Remappage manette / joystick (menu « M ») =====================
// Périphérique de référence : Thrustmaster T16000M (6 axes DSoF · 16 boutons · hat).
// Les actions « maintien » injectent une touche clavier équivalente dans `keys` (le moteur ne change pas) ;
// les actions « impulsion » déclenchent une fonction sur front montant ; les axes pilotent le vaisseau en analogique.
const PAD_HOLD = [
  { id: "fwd",   label: "Poussée avant",       code: "KeyW" },
  { id: "back",  label: "Poussée arrière",     code: "KeyS" },
  { id: "right", label: "Latéral droite",      code: "KeyD" },
  { id: "left",  label: "Latéral gauche",      code: "KeyA" },
  { id: "up",    label: "Monter / Sauter",     code: "Space" },
  { id: "down",  label: "Descendre / Courir",  code: "ShiftLeft" },
  { id: "rollL", label: "Roulis gauche",       code: "ArrowLeft" },
  { id: "rollR", label: "Roulis droite",       code: "ArrowRight" },
  { id: "autoland", label: "Atterrissage assisté", code: "KeyG" },
];
const PAD_EDGE = [
  { id: "interact", label: "Interagir / Parler", code: "KeyE" },
  { id: "exit",     label: "Sortir du vaisseau", code: "KeyR" },
  { id: "scout",    label: "Lancer la sonde",    code: "KeyF" },
  { id: "scope",    label: "Signalscope",        code: "KeyC" },
  { id: "log",      label: "Journal de bord",    code: "Tab" },
];
const PAD_AXES = [
  { id: "axPitch", label: "Tangage (axe)" },
  { id: "axYaw",   label: "Lacet (axe)" },
  { id: "axRoll",  label: "Roulis (axe)" },
];
const PAD_AXIS_IDS = new Set(PAD_AXES.map((a) => a.id));
// Mapping par défaut typique du T16000M : manche X=lacet, Y=tangage, vrille=roulis, gâchette/boutons pour le reste.
const DEFAULT_BINDS = {
  axYaw: { axis: 0 }, axPitch: { axis: 1 }, axRoll: { axis: 2 },
  fwd: { button: 0 }, back: { button: 1 }, up: { button: 2 }, down: { button: 3 },
  right: { button: 5 }, left: { button: 4 }, rollL: { button: 6 }, rollR: { button: 7 },
  autoland: { button: 8 }, interact: { button: 9 }, exit: { button: 10 },
  scout: { button: 11 }, scope: { button: 12 }, log: { button: 13 },
};
const PADBINDS_KEY = "timberhearth_padbinds_v1";
const loadBinds = () => {
  let b = { ...DEFAULT_BINDS };
  try { const raw = localStorage.getItem(PADBINDS_KEY); if (raw) b = { ...DEFAULT_BINDS, ...JSON.parse(raw) }; } catch (e) {}
  return b;
};
const saveBinds = (b) => { try { localStorage.setItem(PADBINDS_KEY, JSON.stringify(b)); } catch (e) {} };
const bindLabel = (b) => {
  if (!b) return "—";
  if (b.button != null) return "Bouton " + (b.button + 1);
  if (b.axis != null) return "Axe " + (b.axis + 1) + (b.dir == null ? "" : b.dir > 0 ? " +" : " −");
  return "—";
};
// Codes clavier fusionnés chaque frame (clavier OU manette) avant la lecture par le moteur.
const SYNC_CODES = ["KeyW","KeyZ","KeyS","KeyD","KeyA","KeyQ","Space","ShiftLeft","ArrowLeft","ArrowRight","KeyG","KeyE","KeyF","KeyC","KeyR"];

export default function TimberHearth() {
  const mountRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [introText, setIntroText] = useState(null); // texte d'ouverture scénarisée
  const [fast, setFast] = useState(false);
  const [hud, setHud] = useState({ time: CFG.LOOP, prompt: "", warn: false, loops: 0 });
  const [dialog, setDialog] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState([]);     // [ids connus]
  const [logSel, setLogSel] = useState(null); // id du nœud sélectionné
  const [deaths, setDeaths] = useState(0);
  const [scope, setScope] = useState(false);
  const [sig, setSig] = useState(0);       // 0..1 force du signal (HUD)
  const [zeroG, setZeroG] = useState(false);
  const [flying, setFlying] = useState(false);
  const [scoutActive, setScoutActive] = useState(false);
  const [dbgRec, setDbgRec] = useState(false);
  const [gauges, setGauges] = useState({ o2: 100, fuel: 100 });
  const [flyHud, setFlyHud] = useState({ alt: 0, spd: 0, vspd: 0, danger: false, auto: false });
  const [mini, setMini] = useState({ pLat: 90, pLon: 0, sLat: 0, sLon: 0, flying: false });
  const [repair, setRepair] = useState(null); // {active,pct} | null
  // EVO-5 : remappage manette (menu « M »)
  const [showRemap, setShowRemap] = useState(false);
  const [padBinds, setPadBinds] = useState(loadBinds);
  const [padInfo, setPadInfo] = useState({ connected: false, id: "" });
  const [listening, setListening] = useState(null); // id d'action en cours de capture
  const bindsRef = useRef(padBinds); bindsRef.current = padBinds;
  const listeningRef = useRef(null); listeningRef.current = listening;
  const padInfoRef = useRef(padInfo); padInfoRef.current = padInfo;
  const showRemapRef = useRef(showRemap); showRemapRef.current = showRemap;
  // EVO-6 : verrouillage d'astre (lock-on) + pilote automatique (mode vaisseau)
  const [flyTgt, setFlyTgt] = useState({ locked: false });   // instrumentation du réticule
  const [lockMsg, setLockMsg] = useState(null);              // message éphémère (~10 s)
  const lockedRef = useRef(null);    // id de l'astre verrouillé
  const autoRef = useRef(false);     // pilote auto actif
  const candidateRef = useRef(null); // astre actuellement au centre du réticule
  // EVO-7 : support écran tactile (smartphone / tablette)
  const [isTouch] = useState(() => typeof window !== "undefined" && (("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0));
  const isTouchRef = useRef(isTouch); isTouchRef.current = isTouch;
  const touchApiRef = useRef(null);  // API impérative pont rendu→moteur
  const rootRef = useRef(null);      // conteneur racine (cible du plein écran)
  const overlayRef = useRef(null);          // fondu mort/supernova piloté en JS
  const hudRef = useRef(hud); hudRef.current = hud;
  const dialogRef = useRef(dialog); dialogRef.current = dialog;
  const fastRef = useRef(fast); fastRef.current = fast;
  const showLogRef = useRef(showLog); showLogRef.current = showLog;
  const sigRef = useRef(0);
  const zeroGRef = useRef(false);
  const flyingRef = useRef(false);
  const scoutActiveRef = useRef(false);
  const gaugesRef = useRef({ o2: 100, fuel: 100 });
  const flyHudRef = useRef({ alt: 0, spd: 0, vspd: 0, danger: false, auto: false });
  const miniRef = useRef({ pLat: 90, pLon: 0, sLat: 0, sLon: 0 });
  const repairRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth || window.innerWidth || 1280;
    const H = mount.clientHeight || window.innerHeight || 720;
    try {
    const assets = new AssetManager();

    // --- Persistance (Ship Log) — localStorage dispo en standalone (≠ artifact)
    const SAVE_KEY = "timberhearth_save_v1";
    // Modèle du Journal de bord en graphe : nœuds (x,y normalisés 0..1) + arêtes + lieu/couleur.
    let save = { knowledge: [], deaths: 0 };
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) save = JSON.parse(raw); } catch (e) {}
    const knowledge = new Set(save.knowledge || []);
    // nœuds connus dès le départ
    Object.entries(LOG_NODES).forEach(([k, v]) => { if (v.base) knowledge.add(k); });
    let deathCount = save.deaths || 0;
    const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ knowledge: [...knowledge], deaths: deathCount })); } catch (e) {} };
    const syncLog = () => setLog([...knowledge]);
    const learn = (key) => { if (knowledge.has(key)) return; knowledge.add(key); persist(); syncLog(); };
    setDeaths(deathCount); syncLog();

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;       // r155+ : explicite
    renderer.toneMapping = THREE.ACESFilmicToneMapping;     // évite la surexposition (lumières physiques)
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // EVO-4 : occlusion planétaire — objets de surface masqués quand sur la face opposée du globe
    const occludables = []; // { obj, dir(unit) }
    const registerSurfaceObject = (obj, dirUnit) => { occludables.push({ obj, dir: dirUnit.clone().normalize() }); };
    scene.fog = new THREE.FogExp2(0x4466aa, 0.0009);
    // EVO-8 : carte d'environnement (PMREM) → reflets PBR crédibles sur métaux/verre (vaisseau, tuyères, statue…)
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if ("environmentIntensity" in scene) scene.environmentIntensity = 0.5; // EVO-9 : reflets PBR plus marqués (métaux/verre du vaisseau)
    const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 6000);

    // Lumières — unités physiques (r155+) : intensités élevées + decay par défaut
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; // EVO-8 : ombres plus nettes
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 800;
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120 });
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0x88aaff, 0x554433, 1.0));

    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    scene.add(sunMesh);

    // ===================== SYSTÈME DE CORPS CÉLESTES (générique, extensible) =====================
    // Chaque corps : { id, R (rayon surface), G (gravité surface), soi (sphère d'influence),
    //   parent (id du corps orbité ou null=origine fixe), orbit {a (rayon), inc (inclinaison), phase, speed},
    //   group (THREE.Object3D), pos/prevPos (monde), flags (home, hasShaft...) }.
    // Pour AJOUTER UNE PLANÈTE : pousser un objet dans BODIES via makeBody(). La physique suit automatiquement.
    const ZERO = new THREE.Vector3(0, 0, 0);
    const BODIES = [];
    const bodyById = {};
    const registerBody = (b) => {
      b.pos = b.pos || (b.center ? b.center.clone() : new THREE.Vector3());
      b.center = b.pos;                              // alias : center suit toujours pos (corps mobile inclus)
      b.prevPos = new THREE.Vector3();
      if (!b.orbit) b.pos.copy(b._fixed || ZERO);   // corps fixe à l'origine ou position donnée
      BODIES.push(b); bodyById[b.id] = b; return b;
    };
    // calcule la position monde d'un corps à partir de son orbite autour de son parent (récursif, mémoïsé par frame)
    const computeBodyPos = (b, seen) => {
      if (!b.orbit) { b.pos.copy(b.center || ZERO); return b.pos; }
      const parent = b.orbit.parent ? bodyById[b.orbit.parent] : null;
      const base = parent ? computeBodyPos(parent, seen) : ZERO;
      const o = b.orbit, a = o.phase;
      b.pos.set(
        base.x + Math.cos(a) * o.a,
        base.y + Math.sin(a) * o.a * (o.inc ?? 0.35) + (o.lift ?? 0),
        base.z + Math.sin(a) * o.a * (o.flat ?? 0.7)
      );
      return b.pos;
    };
    const updateBodies = (dt) => {
      for (const b of BODIES) { b.prevPos.copy(b.pos); if (b.orbit) b.orbit.phase += b.orbit.speed * dt; }
      for (const b of BODIES) computeBodyPos(b);
      for (const b of BODIES) { if (b.group) b.group.position.copy(b.pos); if (b.spin && b.group) b.group.rotation.y += b.spin * dt; }
    };
    // corps gravitationnel dominant pour une position : le 1er dont on est dans la SOI (plus proche en priorité), sinon le corps "home"
    const gravBody = (p) => {
      let best = null, bestD = Infinity;
      for (const b of BODIES) { if (b.soi == null) continue; const d = p.distanceTo(b.pos); if (d < b.soi && d < bestD) { bestD = d; best = b; } }
      if (best) return best;
      return homeBody;
    };
    // EVO-6+ : astre le plus proche (par distance à la surface) — cible par défaut de l'atterrissage spéculatif
    const nearestBody = (p) => { let best = homeBody, bd = Infinity; for (const b of BODIES) { const d = p.distanceTo(b.pos) - b.R; if (d < bd) { bd = d; best = b; } } return best; };

    // --- Âtrebois : corps "home" (fixe à l'origine) ---
    const homeBody = registerBody({ id: "atrebois", name: "Âtrebois", center: ZERO.clone(), R: CFG.R, G: CFG.G, soi: null, home: true, hasShaft: true });

    // --- L'Attlerock (lune) : orbite Âtrebois ---
    const MOON_R = 55, MOON_G = 16, MOON_SOI = 130;
    const moon = new THREE.Group();
    const moonGeo = new THREE.SphereGeometry(MOON_R, 48, 32);
    const mcol = []; const mp = moonGeo.attributes.position; const g1 = new THREE.Color(0x8a8a86), g2 = new THREE.Color(0x6a6a66);
    for (let i = 0; i < mp.count; i++) { const n = Math.sin(mp.getX(i) * 0.18) * Math.cos(mp.getY(i) * 0.16) * Math.sin(mp.getZ(i) * 0.2); const c = g1.clone().lerp(g2, (n + 1) / 2); c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.04); mcol.push(c.r, c.g, c.b); }
    moonGeo.setAttribute("color", new THREE.Float32BufferAttribute(mcol, 3));
    const moonSurf = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    moonSurf.receiveShadow = true; moon.add(moonSurf);
    const moonStation = new THREE.Group();
    const stBase = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xc8a84b, metalness: 0.3, roughness: 0.5 })); stBase.position.y = 0.75; moonStation.add(stBase);
    const stDome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8a84b, metalness: 0.4, roughness: 0.4 })); stDome.position.y = 1.5; moonStation.add(stDome);
    moonStation.position.set(0, MOON_R, 0); moon.add(moonStation);
    scene.add(moon);
    const moonBody = registerBody({
      id: "attlerock", name: "l'Attlerock", R: MOON_R, G: MOON_G, soi: MOON_SOI, group: moon, spin: 0.05,
      orbit: { parent: "atrebois", a: 1040, inc: 0.35, flat: 0.7, lift: 240, phase: 0, speed: 0.06 },
    });
    computeBodyPos(moonBody); moonBody.prevPos.copy(moonBody.pos); moon.position.copy(moonBody.pos);
    const moonStationWorld = new THREE.Vector3();


    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSuper: { value: 0 }, uDying: { value: 0 } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    }));
    scene.add(sky);

    // Planète
    const pg = new THREE.SphereGeometry(CFG.R, 128, 96); // densifié pour le relief (EVO-2)
    const colors = []; const pos = pg.attributes.position;
    const grass = new THREE.Color(0x676e4c), rock = new THREE.Color(0x7a7268), sand = new THREE.Color(0xc9b07a);
    const vN = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      vN.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const h = terrainHeight(vN);                                   // même fonction que les collisions
      pos.setXYZ(i, vN.x * (CFG.R + h), vN.y * (CFG.R + h), vN.z * (CFG.R + h));
      let c = grass.clone();
      if (h > 3.2) c = rock.clone(); else if (h < -2.2) c = sand.clone();
      c.offsetHSL(0, 0, h / 22 + (Math.random() - 0.5) * 0.04);      // hauts plus clairs, creux plus sombres
      colors.push(c.r, c.g, c.b);
    }
    pg.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    pg.computeVertexNormals();
    const planetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const planet = new THREE.Mesh(pg, planetMat);
    planet.receiveShadow = true; scene.add(planet);
    // Texture sol CC0 (multipliée par les vertexColors → garde la variation herbe/roche/sable)
    assets.loadTexture(ASSETS.groundTex, 60).then((t) => { if (t) { planetMat.map = t; planetMat.needsUpdate = true; } });

    const placeOnSurface = (o, la, lo, up = 0) => {
      const n = latLon(CFG.R, la, lo).normalize();
      o.position.copy(n.clone().multiplyScalar(groundR(n) + up)); orient(o, n); scene.add(o);
    };

    // Feu de camp
    const campfire = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x3d2510, roughness: 1 }));
      log.position.y = 0.1; log.rotation.z = Math.PI / 2; log.rotation.y = (i / 5) * Math.PI * 2; campfire.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8833 }));
    flame.position.y = 0.9; campfire.add(flame);
    const fireLight = new THREE.PointLight(0xff8833, 50, 30, 2); fireLight.position.y = 1.2; campfire.add(fireLight);
    placeOnSurface(campfire, 88, 0, 0);
    const campWorldPos = campfire.position.clone();

    // Observatoire — structure creuse visitable
    const colliders = []; // hoisté : utilisé dès l'observatoire (statue) puis tour/maisons/PNJ
    const obs = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 1 });
    const woodLightMat = new THREE.MeshStandardMaterial({ color: 0x6a4520, roughness: 1 });
    const OBS_W = 12, OBS_D = 10, OBS_H = 5, WALL = 0.4, DOOR_W = 2.4;
    // sol
    const oFloor = new THREE.Mesh(new THREE.BoxGeometry(OBS_W, 0.3, OBS_D), woodLightMat);
    oFloor.position.y = 0.15; oFloor.receiveShadow = true; obs.add(oFloor);
    // plafond
    const oCeil = new THREE.Mesh(new THREE.BoxGeometry(OBS_W, 0.3, OBS_D), woodMat);
    oCeil.position.y = OBS_H; obs.add(oCeil);
    // murs : arrière, gauche, droite pleins ; façade avec ouverture (2 segments + linteau)
    const mkWall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat); m.position.set(x, y, z); m.castShadow = true; obs.add(m); return m; };
    mkWall(OBS_W, OBS_H, WALL, 0, OBS_H / 2, -OBS_D / 2);            // arrière
    mkWall(WALL, OBS_H, OBS_D, -OBS_W / 2, OBS_H / 2, 0);           // gauche
    mkWall(WALL, OBS_H, OBS_D, OBS_W / 2, OBS_H / 2, 0);            // droite
    const sideW = (OBS_W - DOOR_W) / 2;                            // façade (z = +D/2), porte au centre
    mkWall(sideW, OBS_H, WALL, -(DOOR_W / 2 + sideW / 2), OBS_H / 2, OBS_D / 2);
    mkWall(sideW, OBS_H, WALL, (DOOR_W / 2 + sideW / 2), OBS_H / 2, OBS_D / 2);
    mkWall(DOOR_W, OBS_H - 3, WALL, 0, OBS_H - (OBS_H - 3) / 2, OBS_D / 2); // linteau au-dessus de la porte
    // toit + tourelle télescope
    const oroof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 3, 4), woodMat);
    oroof.position.y = OBS_H + 1.5; oroof.rotation.y = Math.PI / 4; obs.add(oroof);
    const otow = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 12), new THREE.MeshStandardMaterial({ color: 0x4a2a10 }));
    otow.position.set(4, OBS_H + 2, 2); obs.add(otow);
    const odome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9bb8c5, metalness: 0.3 }));
    odome.position.set(4, OBS_H + 4, 2); obs.add(odome);
    // éclairage intérieur
    const obsLight = new THREE.PointLight(0xffe0b0, 8, 20, 2); obsLight.position.set(0, OBS_H - 1, 0); obs.add(obsLight);

    // --- Statue-mémoire Nomai (centre, interactive) ---
    const statue = new THREE.Group();
    const statueBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 6, 12), new THREE.MeshStandardMaterial({ color: 0xd0e8ff, emissive: 0x3060a0, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2 }));
    statueBody.position.y = 1.1; statue.add(statueBody);
    const statueHead = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd0e8ff, emissive: 0x3060a0, emissiveIntensity: 0.4, roughness: 0.4 }));
    statueHead.scale.set(1, 1.25, 0.9); statueHead.position.y = 2.0; statue.add(statueHead);
    // yeux (fermés par défaut : sombres ; s'ouvrent = émissifs cyan quand sonde trouvée)
    const statueEyeMat = new THREE.MeshStandardMaterial({ color: 0x081018, emissive: 0x000000, emissiveIntensity: 0 });
    const statueEyes = [];
    for (const sx of [1, -1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), statueEyeMat); e.position.set(0.14 * sx, 2.05, 0.36); statue.add(e); statueEyes.push(e); }
    const statueLight = new THREE.PointLight(0x4080ff, 0, 6, 2); statueLight.position.y = 2; statue.add(statueLight);
    statue.position.set(0, 0.3, -1.5); obs.add(statue);

    // --- Vitrines d'exposition (avec plaque interactive) ---
    const exhibits = []; // {pos(monde calc. après placeOnSurface), label, text}
    const caseMat = new THREE.MeshPhysicalMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.25, roughness: 0.1, transmission: 0.6 });
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
    const EXHIBIT_DEFS = [
      { x: -4, z: -3, color: 0xc8a84b, label: "Buste Nomai", text: "Premier buste nomai intact remonté des Profondeurs Géantes. Fourrure étrangement préservée." },
      { x: -4, z: 0, color: 0xd0d0ff, label: "Rocher quantique", text: "Cet échantillon change de position dès qu'on cesse de l'observer. Personne n'a réussi à le surprendre.", quantum: true },
      { x: 4, z: -3, color: 0x8888ff, label: "Cristal de gravité", text: "Fragment de technologie nomai. Génère un champ gravitationnel localisé — base de nos réacteurs." },
      { x: 4, z: 0, color: 0x70c0a0, label: "Spécimen vivant", text: "Poisson des profondeurs. Immobile depuis trois jours. Il respire, très lentement." },
      { x: -4, z: 3, color: 0xc0b090, label: "Fragment de mur", text: "Écriture nomai en spirale. Les conversations entrelacent les spirales de chaque locuteur." },
      { x: 4, z: 3, color: 0xb0c8e0, label: "Maquette du système", text: "Le Soleil, les Jumelles, Âtrebois, les Profondeurs, la Lanterne… et la Lune Quantique, parfois." },
    ];
    const quantumCaseObjects = []; // objets quantiques de l'observatoire (rejoignent le système global plus bas)
    EXHIBIT_DEFS.forEach((ex) => {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), pedestalMat);
      ped.position.set(ex.x, 0.5, ex.z); obs.add(ped);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), caseMat);
      glass.position.set(ex.x, 1.5, ex.z); obs.add(glass);
      const item = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: ex.color, emissive: ex.color, emissiveIntensity: 0.3, roughness: 0.4 }));
      item.position.set(ex.x, 1.5, ex.z); obs.add(item);
      ex._item = item; ex._local = new THREE.Vector3(ex.x, 1.2, ex.z); // pour interaction (plaque)
      exhibits.push(ex);
      if (ex.quantum) quantumCaseObjects.push({ item, ex });
    });

    placeOnSurface(obs, 84, 28, 0);
    // positions monde des points d'interaction (après placeOnSurface : obs a sa transform finale)
    obs.updateMatrixWorld(true);
    exhibits.forEach((ex) => { ex.worldPos = ex._item.getWorldPosition(new THREE.Vector3()); });
    const statueWorld = statue.getWorldPosition(new THREE.Vector3());
    // Collision de murs : matrices monde<->local figées (l'observatoire est statique)
    const obsMat = obs.matrixWorld.clone();
    const obsInv = obsMat.clone().invert();
    const obsWorldCenter = new THREE.Vector3(0, OBS_H / 2, 0).applyMatrix4(obsMat);
    // murs en repère local (rectangles projetés sur le plan xz) : {cx, cz, hx, hz}
    const _sideW = (OBS_W - DOOR_W) / 2;
    const OBS_WALLS = [
      { cx: 0, cz: -OBS_D / 2, hx: OBS_W / 2, hz: WALL / 2 },                       // arrière
      { cx: -OBS_W / 2, cz: 0, hx: WALL / 2, hz: OBS_D / 2 },                       // gauche
      { cx: OBS_W / 2, cz: 0, hx: WALL / 2, hz: OBS_D / 2 },                        // droite
      { cx: -(DOOR_W / 2 + _sideW / 2), cz: OBS_D / 2, hx: _sideW / 2, hz: WALL / 2 }, // façade gauche
      { cx: (DOOR_W / 2 + _sideW / 2), cz: OBS_D / 2, hx: _sideW / 2, hz: WALL / 2 },  // façade droite
    ]; // (le linteau au-dessus de la porte est ignoré : au-dessus de la tête)
    const OBS_PLAYER_R = 0.35;
    colliders.push({ base: statueWorld.clone(), radius: 0.7 }); // ne pas traverser la statue


    // Tour de lancement + vaisseau
    const launch = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d1f08, roughness: 1 });
    assets.loadTexture(ASSETS.barkTex, 1).then((t) => { if (t) { t.repeat.set(2, 6); trunkMat.map = t; trunkMat.needsUpdate = true; } });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 25, 12), trunkMat);
    trunk.position.y = 12.5; trunk.castShadow = true; launch.add(trunk);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, metalness: 0.4 }));
    pad.position.y = 25.3; launch.add(pad);
    // chaise de Feldspar (premier vol) au pied du tronc, accoudoir manquant
    const fchair = new THREE.Group();
    const fseat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 })); fseat.position.y = 0.5; fchair.add(fseat);
    const fback = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.15), new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 })); fback.position.set(0, 0.85, -0.3); fchair.add(fback);
    const farm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a3015 })); farm.position.set(0.35, 0.65, 0); fchair.add(farm); // un seul accoudoir (l'autre arraché)
    fchair.position.set(3.5, 0, 3.5); launch.add(fchair);
    placeOnSurface(launch, 86, -8, 0);
    launch.updateMatrixWorld(true);
    const fchairWorld = new THREE.Vector3(3.5, 0.5, 3.5).applyMatrix4(launch.matrixWorld);

    // --- Vaisseau (world-space, pilotable) ---
    const ship = new THREE.Group();
    // ===== EVO-9 : refonte du vaisseau — coque tonneau (LatheGeometry), nez vitré, tuyères cuivre, pieds articulés =====
    // Avant = -Z (le pilote regarde -Z) ; arrière/tuyères = +Z (côté caméra). Profite de scene.environment (reflets PBR).
    const shipWoodMat = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.72, metalness: 0.08, envMapIntensity: 0.8 });
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.5 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.4 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 0.6, ior: 1.45, transparent: true, opacity: 0.55, envMapIntensity: 1.6 });
    // Coque : profil tonneau tourné autour de Y, basculé pour pointer le nez vers -Z.
    const hullProfile = [[0.05, -1.75], [0.55, -1.62], [0.92, -1.05], [1.14, -0.25], [1.2, 0.45], [1.08, 1.05], [0.74, 1.5], [0.36, 1.74], [0.06, 1.84]].map(([r, y]) => new THREE.Vector2(r, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(hullProfile, 32), shipWoodMat);
    hull.rotation.x = -Math.PI / 2; hull.position.set(0, 0.15, 0); ship.add(hull);
    // Cerclage cuivre (look « tonneau »)
    for (const [z, r] of [[-0.9, 1.0], [-0.1, 1.22], [0.7, 0.98]]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 12, 36), copperMat); hoop.position.set(0, 0.15, z); ship.add(hoop); }
    // Verrière (bulle de verre) à l'avant
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.66, 28, 20), glassMat); canopy.position.set(0, 0.5, -1.05); ship.add(canopy);
    const canopyRim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 10, 28), copperMat); canopyRim.position.set(0, 0.42, -0.75); canopyRim.rotation.x = Math.PI * 0.42; ship.add(canopyRim);
    // Tuyères + flammes (arrière, +Z)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a33, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames = [];
    const mkThruster = (x, y, z, sc) => {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * sc, 0.24 * sc, 0.6 * sc, 16), copperMat); bell.rotation.x = Math.PI / 2; bell.position.set(x, y, z); ship.add(bell);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.26 * sc, 1.7 * sc, 14), flameMat); fl.rotation.x = Math.PI / 2; fl.position.set(x, y, z + 1.0 * sc); fl.visible = false; ship.add(fl); flames.push(fl);
    };
    mkThruster(0, 0.12, 1.7, 1.25); mkThruster(0.82, 0.0, 1.45, 0.8); mkThruster(-0.82, 0.0, 1.45, 0.8);
    // Pieds amortisseurs articulés (4)
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const hipJ = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), steelMat); hipJ.position.set(sx * 0.8, -0.6, sz * 0.7); ship.add(hipJ);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.85, 8), steelMat); thigh.position.set(sx * 1.0, -0.95, sz * 0.9); thigh.rotation.set(sz * 0.42, 0, -sx * 0.5); ship.add(thigh);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 14), copperMat); foot.position.set(sx * 1.28, -1.32, sz * 1.12); ship.add(foot);
    }
    // Aileron dorsal + antenne + parabole
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.15), shipWoodMat); fin.position.set(0, 1.2, 0.7); ship.add(fin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), steelMat); mast.position.set(0.55, 1.15, -0.2); ship.add(mast);
    const shipDish = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), steelMat); shipDish.position.set(0.55, 1.65, -0.2); shipDish.rotation.x = Math.PI * 0.25; ship.add(shipDish);
    // Feux de navigation (bâbord rouge / tribord vert) — clignotent dans animate
    const navLights = [];
    for (const [x, col] of [[1.22, 0x33ff66], [-1.22, 0xff3344]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.4, roughness: 0.3 })); m.position.set(x, 0.2, -0.1); ship.add(m); navLights.push(m); }
    const shipLight = new THREE.PointLight(0xfff0d0, 3.2, 7, 2); shipLight.position.set(0, 0.5, -0.7); ship.add(shipLight);
    // --- Intérieur cockpit (faiblement visible à travers la verrière) ---
    const interior = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }));
    seat.position.set(0, 0.2, 0.3); interior.add(seat);
    const seatback = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }));
    seatback.position.set(0, 0.55, 0.6); interior.add(seatback);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7, metalness: 0.35, envMapIntensity: 1.2 }));
    console_.position.set(0, 0.42, -0.45); console_.rotation.x = 0.4; interior.add(console_);
    const dashScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), new THREE.MeshBasicMaterial({ color: 0x102838 }));
    dashScreen.position.set(0, 0.5, -0.55); dashScreen.rotation.x = 0.4; interior.add(dashScreen);
    const dashGlow = new THREE.PointLight(0x40c0ff, 0.6, 3, 2); dashGlow.position.set(0, 0.55, -0.4); interior.add(dashGlow);
    ship.add(interior);
    ship.scale.setScalar(0.9);
    ship.traverse((o) => { if (o.isMesh) o.castShadow = true; }); // ombres sur toutes les pièces…
    canopy.castShadow = false; flames.forEach((f) => (f.castShadow = false)); // …sauf verre et flammes
    scene.add(ship);
    // pose initiale : posé au sol dans une clairière près du village
    const padNormal = latLon(CFG.R, 87.5, -6).normalize();
    const shipState = {
      pos: padNormal.clone().multiplyScalar(groundR(padNormal) + 2.2),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      flying: false, landed: true,
    };
    // Ressources (vie de la boucle)
    const res = { o2: CFG.O2_MAX, fuel: CFG.FUEL_MAX };
    // oriente le vaisseau : +Y local = normale planète (debout sur le pad)
    shipState.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), padNormal);
    ship.position.copy(shipState.pos); ship.quaternion.copy(shipState.quat);

    // Colliders cylindriques : {base: point surface, radius}. Repoussent le joueur dans le plan tangent.
    const surfacePoint = (la, lo) => { const n = latLon(CFG.R, la, lo).normalize(); return n.multiplyScalar(groundR(n)); };
    colliders.push({ base: surfacePoint(86, -8), radius: 3.6 }); // tronc tour de lancement

    // Maisons (cheminée + porte + détail rustique par variante)
    const houseDefs = [[87, -25, 0x5c3d1e, 0], [85, 18, 0x6a4520, 1], [83, 50, 0x8b6840, 2], [88, 35, 0x704030, 3], [83, -34, 0x5c3d1e, 4], [82, 14, 0x6a4520, 5]];
    houseDefs.forEach(([la, lo, tone, variant]) => {
      const h = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 4), new THREE.MeshStandardMaterial({ color: tone, roughness: 1 }));
      b.position.y = 1.75; b.castShadow = true; h.add(b);
      const r = new THREE.Mesh(new THREE.ConeGeometry(4, 2, 4), new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 1 }));
      r.position.y = 4.5; r.rotation.y = Math.PI / 4; h.add(r);
      // cheminée
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x7a7268 }));
      chim.position.set(1.5, 4.4, 1); h.add(chim);
      // porte
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 1 }));
      door.position.set(0, 1.0, 2.02); h.add(door);
      // fenêtre éclairée
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      win.position.set(-1.4, 2.0, 2.02); h.add(win);
      // détail rustique selon variante
      if (variant === 0) { // pile de bois
        for (let i = 0; i < 5; i++) { const logm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f15 })); logm.rotation.z = Math.PI / 2; logm.position.set(-2.8, 0.15 + (i % 3) * 0.26, 1 - Math.floor(i / 3) * 0.26); h.add(logm); }
      } else if (variant === 1) { // tonneau
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a1a })); barrel.position.set(2.8, 0.5, -1); h.add(barrel);
      } else if (variant === 2) { // pot de fleur sur rebord
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x8a4a30 })); pot.position.set(-1.4, 1.55, 2.1); h.add(pot);
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd04a6a, emissive: 0x401015 })); flower.position.set(-1.4, 1.8, 2.1); h.add(flower);
      } else if (variant === 3) { // antenne bricolée
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 4), new THREE.MeshStandardMaterial({ color: 0x888 })); ant.position.set(-1.5, 5.5, -1); h.add(ant);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshStandardMaterial({ color: 0xcc4010 })); tip.position.set(-1.5, 6.5, -1); h.add(tip);
      } else if (variant === 4) { // corde à linge (poteaux + fil)
        for (const x of [-2.5, 2.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x4a2f15 })); p.position.set(x, 1.1, -2.5); h.add(p); }
      } else { // lanterne sur porte
        const lant = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc66 })); lant.position.set(0.8, 2.2, 2.1); h.add(lant);
        const ll = new THREE.PointLight(0xffcc66, 2, 6, 2); ll.position.copy(lant.position); h.add(ll);
      }
      placeOnSurface(h, la, lo, 0);
      colliders.push({ base: surfacePoint(la, lo), radius: 3.4 });
    });

    // --- Tour Radio (fermée, dégâts d'incendie — §4.6) ---
    const radio = new THREE.Group();
    const latticeMat = new THREE.MeshStandardMaterial({ color: 0x8a5020, roughness: 0.7, metalness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 5), latticeMat);
      leg.position.set(Math.cos(a) * 1.2, 7, Math.sin(a) * 1.2);
      leg.rotation.x = Math.sin(a) * 0.08; leg.rotation.z = -Math.cos(a) * 0.08; radio.add(leg);
    }
    for (let h2 = 2; h2 < 14; h2 += 3) { // entretoises croisées
      const cross = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), latticeMat); cross.position.y = h2; radio.add(cross);
      const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2; radio.add(cross2);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), new THREE.MeshStandardMaterial({ color: 0x6a6a6a, metalness: 0.5, side: THREE.DoubleSide }));
    dish.position.y = 14.5; dish.rotation.x = -0.6; radio.add(dish);
    // cabane à la base + traces de brûlure
    const shack = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 1 }));
    shack.position.set(0, 1.25, 3); shack.castShadow = true; radio.add(shack);
    const burn = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2), new THREE.MeshBasicMaterial({ color: 0x0a0805, transparent: true, opacity: 0.7 }));
    burn.position.set(0, 1.4, 5.02); radio.add(burn);
    placeOnSurface(radio, 80, 60, 0);
    colliders.push({ base: surfacePoint(80, 60), radius: 2.0 });
    const radioWorld = radio.getWorldPosition(new THREE.Vector3());

    // --- Cimetière des donateurs (§2.3) : trois stèles ---
    const grave = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.18), stoneMat);
      st.position.set((i - 1) * 1.3, 0.6, 0); st.rotation.z = (Math.random() - 0.5) * 0.08; st.castShadow = true; grave.add(st);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 12, 1, false, 0, Math.PI), stoneMat);
      top.position.set((i - 1) * 1.3, 1.2, 0); top.rotation.x = Math.PI / 2; grave.add(top);
    }
    placeOnSurface(grave, 84, -24, 0);
    const graveWorld = grave.getWorldPosition(new THREE.Vector3());

    // --- Station maquette de Mica (§2.3) : petite plateforme + mini-vaisseau ---
    const micaStation = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.3 }));
    platform.position.y = 0.2; micaStation.add(platform);
    const miniShip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a4a28, metalness: 0.3 }));
    miniShip.position.y = 1.0; micaStation.add(miniShip);
    const miniCockpit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8a840, metalness: 0.4 }));
    miniCockpit.position.set(0, 1.3, 0.3); micaStation.add(miniCockpit);
    placeOnSurface(micaStation, 86, 4, 0);
    const micaStationWorld = micaStation.getWorldPosition(new THREE.Vector3());

    // Arbres : GLB CC0 si présent, sinon procédural — instanciés autour du village
    let treePrototype = null;
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f15, roughness: 1 });
    assets.loadTexture(ASSETS.barkTex, 1).then((t) => { if (t) { t.repeat.set(1, 2); barkMat.map = t; barkMat.needsUpdate = true; } });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a6e3a, roughness: 1 });
    const buildProceduralTree = () => null; // (EVO-4 : plus de prototype cloné, on instancie)
    const scatterTrees = () => {
      // EVO-4 : collecte des transforms puis 2 InstancedMesh (troncs/feuillages) → 2 draw calls au lieu de ~628
      const isClear = (la, lo) => {
        const near = (cla, clo, r) => Math.abs(la - cla) < r && Math.abs(((lo - clo + 540) % 360) - 180) > 180 - r;
        return !near(86, 0, 8) && !near(76, 30, 6) && !near(70, 120, 6);
      };
      const mats = []; // matrices monde de chaque arbre
      const tmp = new THREE.Object3D();
      const pushTree = (n, s) => {
        tmp.position.copy(n.clone().multiplyScalar(groundR(n)));
        tmp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
        tmp.rotateY(Math.random() * Math.PI * 2); tmp.scale.setScalar(s); tmp.updateMatrix();
        mats.push(tmp.matrix.clone());
      };
      let placed = 0;
      for (let i = 0; i < 320 && placed < 260; i++) {
        const la = -88 + Math.random() * 176, lo = (Math.random() - 0.5) * 360;
        const dens = Math.cos(la * Math.PI / 180) * 0.7 + 0.3;
        if (Math.random() > dens || !isClear(la, lo)) continue;
        pushTree(latLon(CFG.R, la, lo).normalize(), 0.7 + Math.random() * 0.9); placed++;
      }
      for (let b = 0; b < 8; b++) {
        const cla = -70 + Math.random() * 140, clo = (Math.random() - 0.5) * 340;
        if (!isClear(cla, clo)) continue;
        for (let k = 0; k < 6; k++) pushTree(latLon(CFG.R, cla + (Math.random() - 0.5) * 6, clo + (Math.random() - 0.5) * 6).normalize(), 0.8 + Math.random() * 0.7);
      }
      const count = mats.length;
      // tronc : pivot en bas (translate +1.5 pour poser la base au sol) ; feuillage : cône à y=3
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 5); trunkGeo.translate(0, 1.5, 0);
      const leafGeo = new THREE.ConeGeometry(1.6, 4, 6); leafGeo.translate(0, 4.5, 0);
      const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, count);
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
      trunks.castShadow = leaves.castShadow = true;
      trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage); leaves.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let i = 0; i < count; i++) { trunks.setMatrixAt(i, mats[i]); leaves.setMatrixAt(i, mats[i]); }
      trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
      trunks.frustumCulled = leaves.frustumCulled = false; // sphère : objets répartis tout autour
      scene.add(trunks); scene.add(leaves);
    };
    // --- Relief : rochers (instanciés) et buttes ---
    const scatterRocks = () => {
      // EVO-4 : 3 géométries de roche pré-déformées → 3 InstancedMesh, couleur variée par instance
      const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: false });
      const protos = [];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.IcosahedronGeometry(1, 0); const p = g.attributes.position;
        for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * (0.8 + Math.random() * 0.4), p.getY(v) * (0.7 + Math.random() * 0.5), p.getZ(v) * (0.8 + Math.random() * 0.4));
        g.computeVertexNormals(); protos.push(g);
      }
      const buckets = [[], [], []]; // transforms + couleur, par proto
      const tmp = new THREE.Object3D();
      const cA = new THREE.Color(0x6a6258), cB = new THREE.Color(0x554a3a);
      for (let i = 0; i < 90; i++) {
        const la = -85 + Math.random() * 170, lo = (Math.random() - 0.5) * 360;
        const n = latLon(CFG.R, la, lo).normalize();
        const r = 0.8 + Math.random() * 3.5, kp = i % 3;
        tmp.position.copy(n.clone().multiplyScalar(groundR(n) + r * 0.3));
        tmp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
        tmp.rotateZ(Math.random()); tmp.scale.setScalar(r); tmp.updateMatrix();
        buckets[kp].push({ m: tmp.matrix.clone(), c: (Math.random() > 0.5 ? cA : cB) });
      }
      buckets.forEach((items, kp) => {
        if (!items.length) return;
        const im = new THREE.InstancedMesh(protos[kp], rockMat, items.length);
        im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
        const col = new Float32Array(items.length * 3);
        items.forEach((it, i) => { im.setMatrixAt(i, it.m); col[i * 3] = it.c.r; col[i * 3 + 1] = it.c.g; col[i * 3 + 2] = it.c.b; });
        im.instanceColor = new THREE.InstancedBufferAttribute(col, 3); im.instanceMatrix.needsUpdate = true;
        scene.add(im);
      });
      // buttes (peu nombreuses, laissées en meshes simples)
      for (let i = 0; i < 14; i++) {
        const la = -80 + Math.random() * 160, lo = (Math.random() - 0.5) * 360;
        const n = latLon(CFG.R, la, lo).normalize();
        const hill = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0x4a6e3a, roughness: 1, flatShading: true }));
        hill.position.copy(n.clone().multiplyScalar(groundR(n) - 1)); orient(hill, n);
        hill.receiveShadow = true; scene.add(hill);
      }
    };
    scatterRocks();
    // --- Maisons/cabanes isolées hors village (avant-postes) ---
    [[78, -50], [72, 80], [80, 150], [-20, 40], [60, -120], [40, 100]].forEach(([la, lo]) => {
      const h = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.5), new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 1 }));
      b.position.y = 1.5; b.castShadow = true; h.add(b);
      const r = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 1 }));
      r.position.y = 3.8; r.rotation.y = Math.PI / 4; h.add(r);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
      lamp.position.set(0, 2.2, 1.8); h.add(lamp);
      const ll = new THREE.PointLight(0xffcc66, 1.5, 8, 2); ll.position.copy(lamp.position); h.add(ll);
      const n = latLon(CFG.R, la, lo).normalize();
      h.position.copy(n.clone().multiplyScalar(groundR(n))); orient(h, n); h.rotateY(Math.random() * Math.PI);
      registerSurfaceObject(h, n); // EVO-4 : occlusion (cabanes éloignées)
      scene.add(h);
    });

    // Lucioles
    const N_FF = 80, ffPos = new Float32Array(N_FF * 3), ffPh = new Float32Array(N_FF);
    for (let i = 0; i < N_FF; i++) {
      const p = latLon(CFG.R + 1 + Math.random() * 2.5, 84 + Math.random() * 8, (Math.random() - 0.5) * 60);
      ffPos[i * 3] = p.x; ffPos[i * 3 + 1] = p.y; ffPos[i * 3 + 2] = p.z; ffPh[i] = Math.random() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPos, 3));
    ffGeo.setAttribute("aPhase", new THREE.BufferAttribute(ffPh, 1));
    const ffMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDay: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float aPhase; uniform float uTime,uDay; varying float vB;
        void main(){ vec3 p=position; p+=normalize(position)*sin(uTime*1.5+aPhase)*0.3;
        vB=max(0.0,sin(uTime*3.0+aPhase))*(1.0-uDay);
        gl_PointSize=6.0*vB; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `varying float vB; void main(){ if(vB<0.05) discard; gl_FragColor=vec4(1.0,0.95,0.4,vB); }`,
    });
    scene.add(new THREE.Points(ffGeo, ffMat));

    // Geysers : colonne d'eau périodique, applique une poussée verticale au joueur dans la colonne
    const geysers = [];
    const geyserMat = new THREE.MeshPhysicalMaterial({ color: 0x4db8b8, transparent: true, opacity: 0.65, roughness: 0.1, transmission: 0.3 });
    [[80, 95], [74, -60], [82, 150]].forEach(([la, lo], gi) => {
      const n = latLon(CFG.R, la, lo).normalize();
      const base = n.clone().multiplyScalar(CFG.R);
      const col = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const rad = 1.5 - i * 0.12;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.9, rad, 8, 8, 1, true), geyserMat);
        seg.position.y = i * 8 + 4; col.add(seg);
      }
      col.position.copy(base); orient(col, n); col.visible = false; scene.add(col);
      geysers.push({ normal: n, base, col, period: 26 + gi * 6, timer: Math.random() * 20, state: "idle", t: 0 });
    });

    // Matière Fantôme : poche létale invisible à l'œil, révélée par la caméra de la sonde
    const ghostCenter = latLon(CFG.R, 86, 55).normalize().multiplyScalar(CFG.R + 1.2);
    const ghostNormal = ghostCenter.clone().normalize();
    const GHOST_RADIUS = 3.2;
    // clôture d'avertissement (visible, elle)
    const fence = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x5c3d1e }));
      post.position.set(Math.cos(a) * 4.2, 0.7, Math.sin(a) * 4.2); fence.add(post);
    }
    fence.position.copy(ghostNormal.clone().multiplyScalar(groundR(ghostNormal))); orient(fence, ghostNormal); scene.add(fence);
    // particules cyan (opacité pilotée par la révélation)
    const GHOST_N = 220, gPos = new Float32Array(GHOST_N * 3);
    for (let i = 0; i < GHOST_N; i++) {
      const o = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(GHOST_RADIUS * 2);
      gPos[i * 3] = ghostCenter.x + o.x; gPos[i * 3 + 1] = ghostCenter.y + o.y; gPos[i * 3 + 2] = ghostCenter.z + o.z;
    }
    const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
    const gMat = new THREE.PointsMaterial({ color: 0x00fff0, size: 0.35, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const ghostPoints = new THREE.Points(gGeo, gMat); scene.add(ghostPoints);
    let ghostReveal = 0; // 0..1

    // Scout : sonde lancée vers l'avant, révèle la Matière Fantôme à proximité (vue PIP)
    const scout = {
      mesh: new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff8800, emissiveIntensity: 2 })),
      light: new THREE.PointLight(0xffaa33, 8, 12, 2),
      cam: new THREE.PerspectiveCamera(75, 1, 0.05, 4000),
      vel: new THREE.Vector3(), alive: false, ttl: 0,
    };
    scout.mesh.add(scout.light); scout.mesh.visible = false; scene.add(scout.mesh);
    scout.mesh.add(scout.cam); // la caméra suit la sonde (regarde vers l'avant local -Z)
    const launchScout = () => {
      const up = player.pos.clone().normalize();
      const right = new THREE.Vector3().crossVectors(player.forward, up).normalize();
      const dir = player.forward.clone().applyAxisAngle(right, player.pitch).normalize();
      scout.mesh.position.copy(player.pos).addScaledVector(up, CFG.EYE).addScaledVector(dir, 1);
      scout.vel.copy(dir).multiplyScalar(45);
      scout.alive = true; scout.ttl = 12; scout.mesh.visible = true;
      learn("launched_scout");
    };

    // Graine de Ronce Noire : émet l'harmonica de Feldspar sur la fréquence OWV (détectable au Signalscope)
    const seedNormal = latLon(CFG.R, 76, 30).normalize();
    const seedPos = seedNormal.clone().multiplyScalar(CFG.R + 3.2);
    const seed = new THREE.Group();
    const seedBody = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), new THREE.MeshStandardMaterial({ color: 0x1a0a2a, roughness: 1, emissive: 0x3a1060, emissiveIntensity: 0.4 }));
    seed.add(seedBody);
    for (let i = 0; i < 7; i++) {
      const tend = new THREE.Mesh(new THREE.ConeGeometry(0.35, 4 + Math.random() * 2, 5), new THREE.MeshStandardMaterial({ color: 0x0a0018, roughness: 1 }));
      const a = (i / 7) * Math.PI * 2, tilt = 0.6 + Math.random() * 0.5;
      tend.position.set(Math.cos(a) * 2.4, Math.sin(tilt) * 1.5, Math.sin(a) * 2.4);
      tend.rotation.set(Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2); seed.add(tend);
    }
    const seedLight = new THREE.PointLight(0x8030c0, 4, 18, 2); seed.add(seedLight);
    seed.position.copy(seedPos); orient(seed, seedNormal); scene.add(seed);
    // léger cratère sombre sous la graine (disque)
    const crater = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 1 }));
    crater.position.copy(seedNormal.clone().multiplyScalar(CFG.R + 0.3)); orient(crater, seedNormal); crater.rotateX(-Math.PI / 2); scene.add(crater);

    // État Signalscope
    let scopeOn = false, signal = 0, harmLast = -999, lastFootstep = 0, bobPhase = 0;

    // Bosquet Quantique : objets qui se téléportent quand ils sortent du champ de vision
    const GROVE = [[82, -72], [83, -68], [81, -69], [82.5, -65], [80.5, -71]].map(([la, lo]) => ({ n: latLon(CFG.R, la, lo).normalize() }));
    const grovePos = GROVE.map((g) => g.n.clone().multiplyScalar(groundR(g.n)));
    const makeQuantumTree = () => {
      const t = new THREE.Group();
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 5), new THREE.MeshStandardMaterial({ color: 0x4a2f15, emissive: 0x102030, emissiveIntensity: 0.4 })));
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 6), new THREE.MeshStandardMaterial({ color: 0x3a6e6a, emissive: 0x104040, emissiveIntensity: 0.5 }));
      leaf.position.y = 3; t.add(leaf); t.traverse((c) => { if (c.isMesh) c.castShadow = true; }); return t;
    };
    const makeShard = () => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xd0e8ff, emissive: 0x4070ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3 }));
      m.add(new THREE.PointLight(0x6090ff, 5, 14, 2)); return m;
    };
    const quantums = [];
    [makeShard(), makeQuantumTree(), makeQuantumTree()].forEach((mesh, i) => {
      const idx = i % grovePos.length;
      mesh.position.copy(grovePos[idx]); orient(mesh, GROVE[idx].n);
      if (i === 0) mesh.position.copy(GROVE[idx].n.clone().multiplyScalar(CFG.R + 1.2)); // shard flotte un peu
      scene.add(mesh);
      quantums.push({ mesh, isShard: i === 0, idx, wasVisible: false, cd: 0 });
    });
    // Flashes de téléportation
    const flashes = [];
    // Panneau-poème de Gabbro (planté au bord du Bosquet)
    const poemPost = new THREE.Group();
    const ppPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f15 })); ppPole.position.y = 0.8; poemPost.add(ppPole);
    const ppBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 })); ppBoard.position.y = 1.5; poemPost.add(ppBoard);
    const ppGlow = new THREE.PointLight(0x80c0ff, 1.5, 5, 2); ppGlow.position.set(0, 1.5, 0.5); poemPost.add(ppGlow);
    { const pn = latLon(CFG.R, 82, -74).normalize(); poemPost.position.copy(pn.clone().multiplyScalar(groundR(pn))); orient(poemPost, pn); scene.add(poemPost); }
    const poemWorld = poemPost.getWorldPosition(new THREE.Vector3());
    let poemIdx = 0;
    const flashGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const spawnFlash = (p) => {
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(p); scene.add(m); flashes.push({ m, ttl: 0.5 });
    };
    const frustum = new THREE.Frustum(), fMat = new THREE.Matrix4();

    // --- Grotte Zéro-G : puits traversant du sud vers le centre de la planète ---
    // Axe du puits = normale au point d'entrée. Le long de cet axe, la collision sol est désactivée.
    const shaftNormal = latLon(CFG.R, 70, 120).normalize();
    const SHAFT_RADIUS = 3.5;          // rayon libre du puits
    const ZEROG_RADIUS = 16;           // rayon de la bulle d'apesanteur au centre
    // Habillage : paroi opaque du tunnel (faces internes visibles) + anneaux de soutènement
    const shaftGroup = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.9, side: THREE.DoubleSide });
    // paroi : cylindre creux de la surface jusqu'à la bulle, rendu côté intérieur (BackSide) pour qu'on voie la roche depuis le puits
    const shaftLen = CFG.R - ZEROG_RADIUS;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS + 0.5, SHAFT_RADIUS + 0.5, shaftLen, 24, 1, true), wallMat);
    wall.position.copy(shaftNormal.clone().multiplyScalar(ZEROG_RADIUS + shaftLen / 2));
    orient(wall, shaftNormal); // +Y local aligné sur l'axe du puits
    shaftGroup.add(wall);
    for (let d = CFG.R - 6; d > ZEROG_RADIUS; d -= 8) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS, 0.3, 6, 16), ringMat);
      ring.position.copy(shaftNormal.clone().multiplyScalar(d));
      orient(ring, shaftNormal); ring.rotateX(Math.PI / 2);
      shaftGroup.add(ring);
    }
    // lampes le long du puits (sinon noir total dans le tunnel opaque)
    for (let d = CFG.R - 20; d > ZEROG_RADIUS + 10; d -= 60) {
      const l = new THREE.PointLight(0xffd28a, 3, 40, 2);
      l.position.copy(shaftNormal.clone().multiplyScalar(d));
      shaftGroup.add(l);
    }
    // Entrée : margelle + panneau
    const rim = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_RADIUS + 0.6, 0.5, 8, 20), new THREE.MeshStandardMaterial({ color: 0x5c3d1e }));
    rim.position.copy(shaftNormal.clone().multiplyScalar(CFG.R)); orient(rim, shaftNormal); rim.rotateX(Math.PI / 2);
    shaftGroup.add(rim);
    scene.add(shaftGroup);
    // Bulle zéro-G au centre : sphère wireframe ténue + machine à réparer (placeholder pour l'étape 2)
    const zerogBubble = new THREE.Mesh(
      new THREE.SphereGeometry(ZEROG_RADIUS, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x3060a0, wireframe: true, transparent: true, opacity: 0.12 })
    );
    scene.add(zerogBubble);
    const zerogLight = new THREE.PointLight(0x80a0ff, 6, ZEROG_RADIUS * 2.5, 2);
    scene.add(zerogLight); // au centre (0,0,0)

    // Machine à réparer (exercice EVA de Gossan), flottant au centre de la grotte
    const machine = new THREE.Group(); scene.add(machine);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.6, metalness: 0.4, emissive: 0x202830, emissiveIntensity: 0.3 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), coreMat);
    machine.add(core);
    const coreLight = new THREE.PointLight(0xff5030, 0, 10, 2); machine.add(coreLight); // rouge tant que cassé
    // 4 modules : position "correcte" (slot) + position dérivée actuelle
    const moduleDefs = [
      { slot: new THREE.Vector3(2.2, 0, 0), geo: new THREE.BoxGeometry(0.9, 0.9, 0.9), color: 0x7a8aa0 },
      { slot: new THREE.Vector3(-2.2, 0, 0), geo: new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), color: 0x9a7a50 },
      { slot: new THREE.Vector3(0, 2.2, 0), geo: new THREE.TorusGeometry(0.5, 0.18, 8, 14), color: 0x6a9a7a },
      { slot: new THREE.Vector3(0, -2.2, 0), geo: new THREE.OctahedronGeometry(0.7, 0), color: 0xaa6a6a },
    ];
    const modules = moduleDefs.map((d, i) => {
      const mesh = new THREE.Mesh(d.geo, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.5, metalness: 0.3 }));
      // dérive initiale : décalée de 2.5–4 u dans une direction pseudo-aléatoire
      const drift = new THREE.Vector3(Math.cos(i * 1.7), Math.sin(i * 2.3), Math.cos(i * 0.9)).normalize().multiplyScalar(3 + i * 0.4);
      mesh.position.copy(d.slot.clone().add(drift));
      mesh.userData = { slot: d.slot.clone(), repaired: false, phase: i * 1.3, drift };
      machine.add(mesh);
      return mesh;
    });
    let machineRepaired = false, repairTarget = null, repairHold = 0;

    // helpers de localisation joueur dans le puits / la bulle
    const inShaftColumn = (p) => {
      const along = p.dot(shaftNormal);                       // projection le long de l'axe du puits
      if (along < ZEROG_RADIUS - 2) return false;             // sous la bulle centrale : sol plein (pas de traversée vers l'autre face)
      const radial = p.clone().sub(shaftNormal.clone().multiplyScalar(along)).length();
      return radial < SHAFT_RADIUS;
    };

    // PNJ
    const npcMeshes = [];
    NPCS.forEach((n) => {
      const m = makeHearthian(n);
      const surf = latLon(CFG.R, n.lat, n.lon).normalize();
      m.position.copy(surf.clone().multiplyScalar(groundR(surf))); orient(m, surf); scene.add(m);
      npcMeshes.push({ data: n, worldPos: m.position.clone(), mesh: m, normal: surf, baseQuat: m.quaternion.clone() });
      colliders.push({ base: surf.clone().multiplyScalar(CFG.R), radius: 0.6 });
    });
    // Si un GLB Hearthian est fourni : remplace chaque mesh procédural par le GLB recoloré (même transform)
    if (ASSETS.hearthianGLB) {
      assets.loadGLTF(ASSETS.hearthianGLB, () => null).then((proto) => {
        if (!proto) return;
        npcMeshes.forEach((entry) => {
          const repl = instantiateHearthianGLB(proto, { skin: entry.data.skin, cloth: entry.data.cloth, eye: entry.data.eye });
          repl.position.copy(entry.mesh.position);
          repl.quaternion.copy(entry.mesh.quaternion);
          scene.remove(entry.mesh);
          scene.add(repl);
          entry.mesh = repl; entry.baseQuat = repl.quaternion.clone();
        });
      });
    }

    // Joueur
    // spawn : à côté du feu (pas dedans), légèrement au sud
    const spawnNormal = latLon(CFG.R, 88, 4).normalize();
    const player = { pos: spawnNormal.clone().multiplyScalar(groundR(spawnNormal) + 0.5), vel: new THREE.Vector3(), forward: new THREE.Vector3(), pitch: 0, grounded: false };
    { const up = player.pos.clone().normalize(); player.forward.set(0, 0, 1).sub(up.clone().multiplyScalar(up.z)).normalize(); if (player.forward.lengthSq() < 0.01) player.forward.set(1, 0, 0); }
    const camUp = player.pos.clone().normalize();
    const lookDirRef = new THREE.Vector3(0, 0, 1); // direction de visée (frame n-1, suffisant pour l'aim)

    // Audio (clic requis)
    let ctx = null, crackleT = null, ambienceSrc = null, musicSrc = null, masterGain = null;
    let worldGain = null, firePanner = null, seedPanner = null, motifT = null, lastO2Beep = -999;
    const startAudio = async () => {
      if (ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
        masterGain = master;
        // Bus "monde" : tout ce qui appartient à l'atmosphère passe ici (silence spatial en altitude)
        worldGain = ctx.createGain(); worldGain.gain.value = 1; worldGain.connect(master);
        // Sources spatialisées (HRTF) : feu de camp, Graine
        const mkPanner = (pos) => {
          const p = ctx.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse";
          p.refDistance = 8; p.maxDistance = 400; p.rolloffFactor = 1.1;
          if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
          else p.setPosition(pos.x, pos.y, pos.z);
          p.connect(worldGain); return p;
        };
        firePanner = mkPanner(campWorldPos);
        seedPanner = mkPanner(seedPos);
        // Ambiance : MP3 CC0 si présent, sinon vent brown-noise propre (amplitude saine + fondu anti-clic de boucle)
        const amb = await assets.loadAudioBuffer(ctx, ASSETS.ambienceMP3);
        if (amb) { ambienceSrc = ctx.createBufferSource(); ambienceSrc.buffer = amb; ambienceSrc.loop = true; const g = ctx.createGain(); g.gain.value = 0.4; ambienceSrc.connect(g); g.connect(worldGain); ambienceSrc.start(); }
        else {
          const n = ctx.sampleRate * 4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
          for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 2.0; }
          const f0 = Math.floor(ctx.sampleRate * 0.08); // fondu in/out → pas de clic au bouclage
          for (let i = 0; i < f0; i++) { const w = i / f0; d[i] *= w; d[n - 1 - i] *= w; }
          const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
          const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 480;
          const g = ctx.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(worldGain); s.start();
        }
        // Musique CC0 optionnelle (bus monde)
        const mus = await assets.loadAudioBuffer(ctx, ASSETS.musicMP3);
        if (mus) { musicSrc = ctx.createBufferSource(); musicSrc.buffer = mus; musicSrc.loop = true; const g = ctx.createGain(); g.gain.value = 0.25; musicSrc.connect(g); g.connect(worldGain); musicSrc.start(); }
        // Crépitement du feu — spatialisé au feu de camp
        const crackle = () => {
          if (!ctx) return;
          const dd = 0.05 + Math.random() * 0.1, nb = ctx.createBuffer(1, ctx.sampleRate * dd, ctx.sampleRate), nd = nb.getChannelData(0);
          for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
          const ns = ctx.createBufferSource(); ns.buffer = nb;
          const hf = ctx.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3000 + Math.random() * 4000;
          const g = ctx.createGain(); g.gain.value = 0.05 + Math.random() * 0.06; ns.connect(hf); hf.connect(g); g.connect(firePanner); ns.start();
          crackleT = setTimeout(crackle, 150 + Math.random() * 400);
        }; crackle();
        motifLoop(); // EVO-3 : motif de corde pincée au feu de camp
      } catch (e) { /* audio facultatif */ }
    };

    // ===================== EVO-3 : corde pincée (Karplus-Strong) + motif ORIGINAL =====================
    // Synthèse physique : buffer de bruit recirculé filtré (timbre banjo/corde). Composition originale,
    // pentatonique de La mineur — aucune reproduction de musique existante.
    const KS_CACHE = new Map();
    const ksBuffer = (freq) => {
      let b = KS_CACHE.get(freq); if (b) return b;
      const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * 1.7);
      b = ctx.createBuffer(1, len, sr); const d = b.getChannelData(0);
      for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
      for (let i = N + 1; i < len; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N - 1]);
      KS_CACHE.set(freq, b); return b;
    };
    const pluck = (freq, when, vol = 0.5) => {
      if (!ctx || !firePanner) return;
      const src = ctx.createBufferSource(); src.buffer = ksBuffer(freq);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 1.6);
      src.connect(g); g.connect(firePanner); src.start(when); src.stop(when + 1.65);
    };
    const MOTIF_HZ = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63 };
    const MOTIF_BASE = [ // [note, temps] à 70 BPM — phrase originale, calme, qui respire
      ["A3", 1], ["C4", 0.5], ["D4", 0.5], ["E4", 1.5], ["rest", 0.5], ["D4", 0.5], ["C4", 0.5], ["A3", 2],
      ["rest", 1], ["G3", 0.5], ["A3", 0.5], ["C4", 1], ["A3", 1], ["E3", 2.5],
    ];
    const MOTIF_BEAT = 60 / 70;
    const playMotifPhrase = () => {
      // variation à chaque reprise : permutation locale + octave basse occasionnelle (jamais deux fois identique)
      const seq = MOTIF_BASE.map((x) => x.slice());
      if (Math.random() < 0.35) {
        const i = 1 + Math.floor(Math.random() * (seq.length - 3));
        if (seq[i][0] !== "rest" && seq[i + 1][0] !== "rest") { const t = seq[i][0]; seq[i][0] = seq[i + 1][0]; seq[i + 1][0] = t; }
      }
      let t = ctx.currentTime + 0.1, total = 0;
      for (const [note, beats] of seq) {
        const dur = beats * MOTIF_BEAT;
        if (note !== "rest") pluck(MOTIF_HZ[note] * (Math.random() < 0.12 ? 0.5 : 1), t + (Math.random() - 0.5) * 0.03, 0.42 + Math.random() * 0.15);
        t += dur; total += dur;
      }
      return total;
    };
    const motifLoop = () => {
      if (!ctx) return;
      const near = !flyingRef.current && gravBody(player.pos).home && player.pos.distanceTo(campWorldPos) < 50;
      let wait = 4;
      if (near) wait = playMotifPhrase() + 7 + Math.random() * 9;
      motifT = setTimeout(motifLoop, wait * 1000);
    };

    // Harmonica de Feldspar (mélodie procédurale : sinus + vibrato). Joué quand le Signalscope verrouille la Graine.
    const HARM = [["E4", 0.5], ["G4", 0.25], ["A4", 0.75], ["G4", 0.25], ["E4", 1.0], ["D4", 0.5], ["E4", 1.2], ["rest", 0.7], ["A4", 0.4], ["G4", 0.4], ["E4", 0.9], ["D4", 0.4], ["E4", 0.4], ["G4", 1.4]];
    const HZ = { E4: 329.63, G4: 392.0, A4: 440.0, D4: 293.66, rest: 0 };
    const HARM_DUR = HARM.reduce((a, [, d]) => a + d * 1.05, 0);
    const playHarmonica = () => {
      if (!ctx || !masterGain) return;
      let t = ctx.currentTime + 0.05;
      for (const [note, dur] of HARM) {
        if (note !== "rest") {
          const osc = ctx.createOscillator(), g = ctx.createGain();
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = HZ[note];
          lfo.frequency.value = 5.5; lg.gain.value = 7; lfo.connect(lg); lg.connect(osc.frequency);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.05);
          g.gain.setValueAtTime(0.1, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(g); g.connect(seedPanner || masterGain);
          lfo.start(t); lfo.stop(t + dur); osc.start(t); osc.stop(t + dur);
        }
        t += dur * 1.05;
      }
    };
    // Bruit de pas : court burst filtré
    const playFootstep = () => {
      if (!ctx || !masterGain) return;
      const d = 0.08, nb = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 350 + Math.random() * 120; f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0.18; ns.connect(f); f.connect(g); g.connect(worldGain || masterGain); ns.start();
    };
    // Son de supernova : grondement sub-grave montant + souffle d'explosion
    const playSupernovaSound = () => {
      if (!ctx || !masterGain) return;
      const now = ctx.currentTime;
      const rumble = ctx.createOscillator(); rumble.type = "sawtooth";
      rumble.frequency.setValueAtTime(28, now); rumble.frequency.exponentialRampToValueAtTime(90, now + 2.5);
      const rg = ctx.createGain(); rg.gain.setValueAtTime(0, now); rg.gain.linearRampToValueAtTime(0.5, now + 1.5); rg.gain.linearRampToValueAtTime(0, now + 3);
      rumble.connect(rg); rg.connect(masterGain); rumble.start(now); rumble.stop(now + 3);
      // souffle (bruit blanc qui déferle)
      const d = 1.2, nb = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1);
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(400, now + 1.4); lp.frequency.exponentialRampToValueAtTime(6000, now + 2.2);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0, now + 1.4); ng.gain.linearRampToValueAtTime(0.6, now + 1.8); ng.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
      ns.connect(lp); lp.connect(ng); ng.connect(masterGain); ns.start(now + 1.4);
    };

    // Input — `keys` est la carte FUSIONNÉE (clavier OU manette) lue par le moteur ;
    // `kbd` est l'état clavier brut, `padHold` l'état manette ; fusion chaque frame via updateInput().
    const keys = {};
    const kbd = {};
    const padHold = {};
    const padEdgePrev = {};
    const touchHold = {};                  // EVO-7 : touches maintenues par la couche tactile
    const touchMove = { x: 0, y: 0 };      // EVO-7 : sortie du pad de déplacement XY (-1..1)
    const touchLook = { x: 0, y: 0 };      // EVO-7 : sortie du pad de visée (-1..1), regard continu
    const tiltLook = { x: 0, y: 0 };       // EVO-7 : sortie des capteurs d'inclinaison du téléphone (-1..1)
    let padAxisLook = { yaw: 0, pitch: 0, roll: 0 };
    let activeNpc = null;
    let dlgOpen = false;                 // flag SYNCHRONE (dialogRef est async via React)
    const advanceDialog = () => {
      if (!activeNpc) { dlgOpen = false; setDialog(null); return; }
      activeNpc.i++;
      if (activeNpc.i >= activeNpc.ref.data.lines.length) { setDialog(null); activeNpc = null; dlgOpen = false; }
      else setDialog({ name: activeNpc.ref.data.name, line: activeNpc.ref.data.lines[activeNpc.i], idx: activeNpc.i + 1, total: activeNpc.ref.data.lines.length });
    };

    const clearTouchHold = () => { for (const c of SYNC_CODES) touchHold[c] = false; touchMove.x = 0; touchMove.y = 0; }; // EVO-7 : évite qu'une touche tactile maintenue (ex. COUR) reste active au changement de mode
    const enterShip = () => {
      shipState.flying = true; shipState.landed = false;
      flyingRef.current = true; setFlying(true);
      clearTouchHold();
      learn("piloted_ship");
    };
    const exitShip = () => {
      shipState.flying = false;
      flyingRef.current = false; setFlying(false);
      lockedRef.current = null; autoRef.current = false; // EVO-6 : on relâche le verrou en sortant
      clearTouchHold();
      // dépose le joueur juste à côté du vaisseau, sur la verticale locale
      const upS = shipState.pos.clone().normalize();
      player.pos.copy(shipState.pos).addScaledVector(upS, -1.5);
      if (player.pos.length() < CFG.R) player.pos.normalize().multiplyScalar(CFG.R + 0.1);
      player.vel.copy(shipState.vel.clone().multiplyScalar(0.0));
      player.forward.set(1, 0, 0).sub(upS.clone().multiplyScalar(upS.x)).normalize();
    };
    const showInfo = (name, text) => { activeNpc = null; dlgOpen = true; setDialog({ name, line: text, idx: 1, total: 1 }); document.exitPointerLock(); };
    const tryInteract = () => {
      if (dlgOpen) { advanceDialog(); return; }
      if (flyingRef.current) return;
      // près du vaisseau (et il est posé) → embarquer
      if (shipState.landed && player.pos.distanceTo(shipState.pos) < 6) { enterShip(); document.exitPointerLock(); return; }
      // statue Nomai
      if (player.pos.distanceTo(statueWorld) < 3.2) {
        learn("nomai_statue");
        const opened = knowledge.has("launched_scout");
        showInfo("Statue-mémoire nomai",
          opened ? "Ses yeux se sont ouverts. Une présence ancienne semble t'observer — et se souvenir."
                 : "Une statue nomai intacte. Ses yeux restent clos, scellés. Comme si elle attendait quelqu'un.");
        return;
      }
      // vitrines d'exposition
      let exNear = null, exBest = 2.6;
      for (const ex of exhibits) { const d = player.pos.distanceTo(ex.worldPos); if (d < exBest) { exBest = d; exNear = ex; } }
      if (exNear) { learn("observatory_exhibits"); showInfo(exNear.label, exNear.text); return; }
      // Tour Radio (fermée)
      if (player.pos.distanceTo(radioWorld) < 5) { showInfo("Tour Radio — FERMÉE", "Dégâts d'incendie causés par l'essai non autorisé d'une fusée-modèle bien trop puissante. Voir Hornfels."); return; }
      // Cimetière des donateurs
      if (player.pos.distanceTo(graveWorld) < 4) { showInfo("Cimetière des donateurs", "Trois stèles, gravées de noms à demi effacés. Ceux qui ont cru au programme avant qu'il n'existe."); return; }
      // Station maquette de Mica
      if (player.pos.distanceTo(micaStationWorld) < 3) { showInfo("Station maquette", "Un modèle réduit du vaisseau, pour s'entraîner au pilotage sans risquer sa peau. Mica supervise."); return; }
      // Chaise de Feldspar
      if (player.pos.distanceTo(fchairWorld) < 2.5) { showInfo("Chaise de Feldspar", "Le siège du tout premier vol. Un accoudoir manque — Feldspar l'a rapporté comme trophée, en riant."); return; }
      // Poème de Gabbro (Bosquet)
      if (player.pos.distanceTo(poemWorld) < 3) { learn("quantum_grove"); const st = GABBRO_POEM[poemIdx % GABBRO_POEM.length]; poemIdx++; showInfo("Poème — gravé dans le bois", st); return; }
      // Station Nomai de l'Attlerock (au pôle de la lune)
      if (player.pos.distanceTo(moonStationWorld) < 6) { learn("attlerock"); showInfo("Station nomai — Attlerock", "Un avant-poste nomai en ruine au pôle de la lune. D'ici, on observait le ciel d'Âtrebois. Les inscriptions parlent d'un signal venu d'ailleurs."); return; }
      // PNJ
      let near = null, best = CFG.INTERACT;
      for (const n of npcMeshes) { const d = player.pos.distanceTo(n.worldPos); if (d < best) { best = d; near = n; } }
      if (near) { activeNpc = { ref: near, i: 0 }; dlgOpen = true; setDialog({ name: near.data.name, line: near.data.lines[0], idx: 1, total: near.data.lines.length }); learn("talked_" + near.data.id); document.exitPointerLock(); }
    };
    const kd = (e) => {
      kbd[e.code] = true;
      if (e.code === "KeyE") tryInteract();
      if (e.code === "KeyR" && flyingRef.current) exitShip();
      if (e.code === "KeyF" && !dlgOpen && !flyingRef.current) launchScout();
      if (e.code === "KeyC" && !dlgOpen && !flyingRef.current) { scopeOn = !scopeOn; setScope(scopeOn); }
      if (e.code === "Tab") { e.preventDefault(); setShowLog((v) => !v); }
      if (e.code === "KeyL") toggleDebug();
      if (e.code === "KeyM") { setShowRemap((v) => !v); document.exitPointerLock(); } // EVO-5 : menu manette
      // EVO-6 : verrouillage d'astre / pilote auto (mode vaisseau)
      if (e.code === "KeyT" && flyingRef.current) {
        if (lockedRef.current) { lockedRef.current = null; autoRef.current = false; }
        else if (candidateRef.current) lockedRef.current = candidateRef.current;
      }
      if (e.code === "KeyY" && flyingRef.current && lockedRef.current) autoRef.current = !autoRef.current;
    };
    const ku = (e) => { kbd[e.code] = false; };

    // ---- EVO-5 : lecture manette + fusion clavier/manette (appelée en tête de frame) ----
    const fireEdge = (id) => {
      if (id === "interact") tryInteract();
      else if (id === "exit") { if (flyingRef.current) exitShip(); }
      else if (id === "scout") { if (!dlgOpen && !flyingRef.current) launchScout(); }
      else if (id === "scope") { if (!dlgOpen && !flyingRef.current) { scopeOn = !scopeOn; setScope(scopeOn); } }
      else if (id === "log") setShowLog((v) => !v);
    };
    const bindActive = (gp, b) => {
      if (!b) return false;
      if (b.button != null) { const btn = gp.buttons[b.button]; return !!(btn && btn.pressed); }
      if (b.axis != null && b.dir != null) { const v = gp.axes[b.axis] ?? 0; return Math.sign(v) === b.dir && Math.abs(v) > 0.5; }
      return false;
    };
    const axisVal = (gp, b) => {
      if (!b || b.axis == null) return 0;
      let v = gp.axes[b.axis] ?? 0;
      if (Math.abs(v) < 0.12) return 0;            // zone morte
      return b.inv ? -v : v;
    };
    const captureInput = (gp, id) => {
      const isAxis = PAD_AXIS_IDS.has(id);
      for (let i = 0; i < gp.buttons.length; i++) if (gp.buttons[i].pressed) return isAxis ? null : { button: i };
      for (let i = 0; i < gp.axes.length; i++) { const v = gp.axes[i] ?? 0; if (Math.abs(v) > 0.6) return isAxis ? { axis: i } : { axis: i, dir: v > 0 ? 1 : -1 }; }
      return null;
    };
    const applyBind = (id, binding) => {
      const next = { ...bindsRef.current, [id]: binding };
      bindsRef.current = next; saveBinds(next); setPadBinds(next);
      listeningRef.current = null; setListening(null);
    };
    const updateInput = () => {
      for (const c of SYNC_CODES) padHold[c] = false;
      padAxisLook = { yaw: 0, pitch: 0, roll: 0 };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const p of pads) { if (p && p.connected) { gp = p; break; } }
      const info = gp ? { connected: true, id: gp.id } : { connected: false, id: "" };
      if (info.connected !== padInfoRef.current.connected || info.id !== padInfoRef.current.id) { padInfoRef.current = info; setPadInfo(info); }
      if (gp) {
        const binds = bindsRef.current;
        if (listeningRef.current) {
          const cap = captureInput(gp, listeningRef.current);
          if (cap) applyBind(listeningRef.current, cap);
        } else {
          for (const a of PAD_HOLD) if (bindActive(gp, binds[a.id])) padHold[a.code] = true;
          for (const a of PAD_EDGE) { const now = bindActive(gp, binds[a.id]); if (now && !padEdgePrev[a.id]) fireEdge(a.id); padEdgePrev[a.id] = now; }
          padAxisLook = { yaw: axisVal(gp, binds.axYaw), pitch: axisVal(gp, binds.axPitch), roll: axisVal(gp, binds.axRoll) };
        }
      }
      // EVO-7 : déplacement tactile (pad XY) → injection numérique dans les touches directionnelles
      const tm = touchMove;
      touchHold["KeyW"] = tm.y < -0.35; touchHold["KeyS"] = tm.y > 0.35;
      touchHold["KeyD"] = tm.x > 0.35;  touchHold["KeyA"] = tm.x < -0.35;
      for (const c of SYNC_CODES) keys[c] = !!(kbd[c] || padHold[c] || touchHold[c]);
    };
    // Visée réutilisable (souris + glissé tactile) : mx/my = déplacement en pixels
    const applyLook = (mx, my) => {
      if (flyingRef.current) {
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -mx * 0.0022);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -my * 0.0022);
        shipState.quat.multiply(qYaw).multiply(qPitch).normalize();
        return;
      }
      const up = player.pos.clone().normalize();
      player.forward.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, -mx * 0.0022)).normalize();
      player.pitch = THREE.MathUtils.clamp(player.pitch - my * 0.0022, -1.4, 1.4);
    };
    const onMouse = (e) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      applyLook(e.movementX, e.movementY);
    };
    // EVO-7 : API impérative pour la couche tactile (le rendu React ne voit pas le closure de l'effet)
    touchApiRef.current = {
      start: () => startAudio(),
      look: (dx, dy) => applyLook(dx, dy),
      look2: (x, y) => { touchLook.x = x; touchLook.y = y; },   // pad de visée → regard continu (consommé par frame)
      move: (x, y) => { touchMove.x = x; touchMove.y = y; },
      hold: (code, on) => { touchHold[code] = !!on; },
      tap: (id) => {
        if (id === "interact") tryInteract();
        else if (id === "scout") { if (!dlgOpen && !flyingRef.current) launchScout(); }
        else if (id === "scope") { if (!dlgOpen && !flyingRef.current) { scopeOn = !scopeOn; setScope(scopeOn); } }
        else if (id === "log") setShowLog((v) => !v);
        else if (id === "exit") { if (flyingRef.current) exitShip(); }
        else if (id === "lock") { if (flyingRef.current) { if (lockedRef.current) { lockedRef.current = null; autoRef.current = false; } else if (candidateRef.current) lockedRef.current = candidateRef.current; } }
        else if (id === "auto") { if (flyingRef.current && lockedRef.current) autoRef.current = !autoRef.current; }
      },
      tilt: async (on) => {                                   // EVO-7 : capteurs d'inclinaison (gyroscope/boussole)
        tiltEnabled = !!on; tiltBase = null; tiltLook.x = 0; tiltLook.y = 0;
        const DOE = window.DeviceOrientationEvent;
        if (on && DOE && DOE.requestPermission) {
          try { await DOE.requestPermission(); } catch (e) {}
        }
        return tiltEnabled;
      },
    };
    // EVO-7 : lecture des capteurs d'orientation du téléphone (inclinomètre) → axe de visée relatif à une calibration.
    let tiltEnabled = false, tiltBase = null;
    const onOrient = (e) => {
      if (!tiltEnabled || e.beta == null || e.gamma == null) return;
      if (!tiltBase) tiltBase = { beta: e.beta, gamma: e.gamma };  // position de repos capturée à l'activation
      // beta/gamma sont relatifs au PORTRAIT naturel ; on tourne le vecteur selon l'angle d'écran → gère le paysage.
      let ang = 0;
      if (window.screen && window.screen.orientation && window.screen.orientation.angle != null) ang = window.screen.orientation.angle;
      else if (window.orientation != null) ang = window.orientation;
      const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const dG = e.gamma - tiltBase.gamma, dB = e.beta - tiltBase.beta;
      const sx = dG * ca + dB * sa;  // composante « écran horizontale » → lacet
      const sy = dB * ca - dG * sa;  // composante « écran verticale »  → tangage
      const dz = 4, span = 32;                                     // zone morte 4°, pleine échelle à 32° d'inclinaison
      const f = (v) => { const s = Math.sign(v) * Math.max(0, Math.abs(v) - dz); return THREE.MathUtils.clamp(s / span, -1, 1); };
      tiltLook.x = f(sx); // inclinaison latérale (écran) → lacet
      tiltLook.y = f(sy); // inclinaison avant/arrière (écran) → tangage
    };
    window.addEventListener("deviceorientation", onOrient);
    const onClick = () => { if (dlgOpen || showLogRef.current) { startAudio(); return; } renderer.domElement.requestPointerLock(); startAudio(); };
    const dlgClick = () => { if (dlgOpen) advanceDialog(); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", onMouse); window.addEventListener("click", dlgClick);
    renderer.domElement.addEventListener("click", onClick);

    let loopTime = 0, lastHud = 0, lastOccl = 0;
    // EVO-6 : état du message éphémère de verrouillage + throttles HUD cible
    let lkMsg = null, lkUntil = 0, lkLastCand = null, lkLastLocked = null, lkPushed = null, tgtPushedAt = 0;
    const tgtRef = { locked: false };
    let fade = 0, dying = false;
    const resetLoop = () => {
      loopTime = 0;
      player.pos.copy(spawnNormal.clone().multiplyScalar(groundR(spawnNormal) + 0.5));
      player.vel.set(0, 0, 0);
      scout.alive = false; scout.mesh.visible = false;
      // ressources pleines
      res.o2 = CFG.O2_MAX; res.fuel = CFG.FUEL_MAX;
      // si on pilotait : on ressort, vaisseau reposé sur le pad
      if (flyingRef.current) { flyingRef.current = false; setFlying(false); }
      lockedRef.current = null; autoRef.current = false; // EVO-6 : reset du verrou à chaque boucle
      shipState.pos.copy(padNormal.clone().multiplyScalar(groundR(padNormal) + 2.2));
      shipState.vel.set(0, 0, 0);
      shipState.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), padNormal);
      shipState.landed = true;
      ship.position.copy(shipState.pos); ship.quaternion.copy(shipState.quat);
      setDialog(null); activeNpc = null; setHud((h) => ({ ...h, loops: h.loops + 1 }));
      playWake(); // EVO-1 : battement de paupières à chaque réveil
    };
    // Transition fondu : { color, isDeath }
    const transition = ({ color = "0,0,0", isDeath = false }) => {
      if (dying) return;
      dying = true;
      if (isDeath) { deathCount++; persist(); setDeaths(deathCount); }
      const t0 = performance.now(); let didReset = false;
      const step = () => {
        const e = (performance.now() - t0) / 1000;
        if (e < 0.6) fade = e / 0.6;
        else if (e < 0.9) { fade = 1; if (!didReset) { resetLoop(); didReset = true; } }
        else if (e < 1.8) fade = 1 - (e - 0.9) / 0.9;
        else { fade = 0; dying = false; if (overlayRef.current) overlayRef.current.style.opacity = 0; return; }
        if (overlayRef.current) { overlayRef.current.style.background = `rgba(${color},${fade})`; overlayRef.current.style.opacity = 1; }
        requestAnimationFrame(step);
      };
      step();
    };
    const die = () => transition({ color: "0,0,0", isDeath: true });
    const supernova = () => { playSupernovaSound(); transition({ color: "255,255,255", isDeath: false }); };
    const onResize = () => { const w = mount.clientWidth, h = mount.clientHeight; renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);

    // Chargement asynchrone des arbres (n'empêche pas le jeu de démarrer)
    scatterTrees(); // EVO-4 : arbres instanciés (la texture d'écorce se branche en async sur barkMat)

    // Post-processing : bloom (feu, étoiles, supernova)
    const composer = new EffectComposer(renderer);
    composer.setSize(W, H);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.6, 0.85);
    composer.addPass(bloom);

    const clock = new THREE.Clock(); let raf;

    // ===================== DEBUG / HISTORISATION (touche L) =====================
    // L : démarre la capture (>=100 variables/frame en RAM). L de nouveau : stoppe + télécharge un .txt.
    // (Le navigateur ne peut pas écrire vers un file:/// imposé ; le fichier va dans Téléchargements.)
    const DBG_MAX_FRAMES = 20000; // garde-fou RAM (~5-6 min à 60fps) ; au-delà, arrêt auto + dump
    let dbgOn = false, dbgFrames = [], dbgFrameNo = 0, dbgStartT = 0;
    const dbg = {}; // rempli pendant la frame par les sous-systèmes, sérialisé en fin de frame
    const fmtN = (v) => (typeof v === "number" ? (Number.isFinite(v) ? +v.toFixed(4) : String(v)) : v);
    const v3 = (p, x) => { if (!x) { dbg[p + "_x"] = dbg[p + "_y"] = dbg[p + "_z"] = null; return; } dbg[p + "_x"] = x.x; dbg[p + "_y"] = x.y; dbg[p + "_z"] = x.z; };
    const q4 = (p, q) => { dbg[p + "_x"] = q.x; dbg[p + "_y"] = q.y; dbg[p + "_z"] = q.z; dbg[p + "_w"] = q.w; };

    const captureFrame = (dt) => {
      if (!dbgOn) return;
      // corps gravitationnel courant (joueur ou vaisseau selon le mode) — base des calculs relatifs
      const actorPos = flyingRef.current ? shipState.pos : player.pos;
      const gb = gravBody(actorPos);
      const pBodyP = gravBody(player.pos);
      const sBodyP = gravBody(shipState.pos);
      const pRel = player.pos.clone().sub(pBodyP.center);
      const sRel = shipState.pos.clone().sub(sBodyP.center);

      // --- temps / boucle ---
      dbg.frame = dbgFrameNo;
      dbg.t = +(clock.elapsedTime).toFixed(4);
      dbg.dt = +dt.toFixed(5);
      dbg.fps = dt > 0 ? +(1 / dt).toFixed(1) : 0;
      dbg.loopTime = +loopTime.toFixed(3);
      dbg.loopRemain = +Math.max(0, CFG.LOOP - loopTime).toFixed(2);
      dbg.fast = fastRef.current ? 1 : 0;
      dbg.deaths = deathCount;
      dbg.loops = hudRef.current.loops;
      // --- corps gravitationnel courant ---
      dbg.body_id = gb.id;
      dbg.body_is_home = gb.home ? 1 : 0;
      dbg.body_R = gb.R;
      dbg.body_G = gb.G;
      v3("body_center", gb.center);
      // --- joueur (relatif à SON corps) ---
      v3("player_pos", player.pos); v3("player_vel", player.vel); v3("player_fwd", player.forward);
      dbg.player_pitch = +player.pitch.toFixed(4);
      dbg.player_grounded = player.grounded ? 1 : 0;
      dbg.player_body = pBodyP.id;
      dbg.player_alt = +(pRel.length() - (pBodyP.home ? groundR(pRel.clone().normalize()) : pBodyP.R)).toFixed(3);
      dbg.player_speed = +player.vel.length().toFixed(4);
      dbg.player_vUp = +player.vel.dot(pRel.clone().normalize()).toFixed(4);
      v3("camUp", camUp); v3("cam_pos", camera.position);
      dbg.cam_fov = +camera.fov.toFixed(2);
      // --- vaisseau (relatif à SON corps) ---
      dbg.flying = flyingRef.current ? 1 : 0;
      dbg.ship_landed = shipState.landed ? 1 : 0;
      dbg.ship_body = sBodyP.id;
      v3("ship_pos", shipState.pos); v3("ship_vel", shipState.vel); q4("ship_quat", shipState.quat);
      dbg.ship_alt = +(sRel.length() - (sBodyP.home ? groundR(sRel.clone().normalize()) : sBodyP.R)).toFixed(3);
      dbg.ship_speed = +shipState.vel.length().toFixed(4);
      dbg.ship_vUp = +shipState.vel.dot(sRel.clone().normalize()).toFixed(4);
      v3("ship_fwd", new THREE.Vector3(0, 0, -1).applyQuaternion(shipState.quat));
      v3("ship_up", new THREE.Vector3(0, 1, 0).applyQuaternion(shipState.quat));
      // --- ressources ---
      dbg.o2 = +res.o2.toFixed(2);
      dbg.fuel = +res.fuel.toFixed(2);
      dbg.autoland = (flyingRef.current && keys["KeyG"] && res.fuel > 0 && !shipState.landed) ? 1 : 0;
      // --- corps célestes (orbites) ---
      v3("moon_pos", moonBody.pos);
      dbg.moon_phase = +(moonBody.orbit ? moonBody.orbit.phase : 0).toFixed(3);
      dbg.bodies_count = BODIES.length;
      dbg.dist_moon_center = +actorPos.distanceTo(moonBody.pos).toFixed(2);
      dbg.in_moon_soi = actorPos.distanceTo(moonBody.pos) < (moonBody.soi || 0) ? 1 : 0;
      // --- soleil / ciel ---
      v3("sun_dir", sky.material.uniforms.uSun.value);
      dbg.supernova = +sky.material.uniforms.uSuper.value.toFixed(4);
      dbg.sun_intensity = +sun.intensity.toFixed(3);
      dbg.bloom_strength = +bloom.strength.toFixed(3);
      dbg.fire_intensity = +fireLight.intensity.toFixed(2);
      dbg.sun_elev = +Math.asin(THREE.MathUtils.clamp(sky.material.uniforms.uSun.value.y, -1, 1)).toFixed(4);
      dbg.day_factor = +THREE.MathUtils.clamp(sky.material.uniforms.uSun.value.y * 2 + 0.5, 0, 1).toFixed(4);
      // --- signalscope / graine ---
      dbg.scope_on = scopeOn ? 1 : 0;
      dbg.signal = +signal.toFixed(4);
      dbg.seed_light = +seedLight.intensity.toFixed(3);
      // --- matière fantôme / scout (+ PIP) ---
      dbg.ghost_reveal = +ghostReveal.toFixed(4);
      dbg.scout_alive = scout.alive ? 1 : 0;
      dbg.scout_ttl = +scout.ttl.toFixed(2);
      dbg.scout_pip = (scout.alive && scout.mesh.position.distanceTo(ghostCenter) < 14) ? 1 : 0;
      v3("scout_pos", scout.alive ? scout.mesh.position : null);
      // --- geysers (état + timer) ---
      geysers.forEach((g, i) => { dbg["geyser" + i + "_state"] = g.state; dbg["geyser" + i + "_timer"] = +g.timer.toFixed(2); });
      // --- grotte zéro-G / machine EVA ---
      dbg.inZeroG = zeroGRef.current ? 1 : 0;
      dbg.machine_repaired = machineRepaired ? 1 : 0;
      dbg.machine_modules_ok = modules.filter((m) => m.userData.repaired).length;
      dbg.repair_hold = +repairHold.toFixed(3);
      // --- bosquet quantique ---
      quantums.forEach((qm, i) => { dbg["quantum" + i + "_idx"] = qm.idx; dbg["quantum" + i + "_vis"] = qm.wasVisible ? 1 : 0; });
      // --- journal de bord ---
      dbg.knowledge_count = knowledge.size;
      // --- entrées clavier ---
      ["KeyW","KeyA","KeyS","KeyD","KeyZ","KeyQ","Space","ShiftLeft","ArrowLeft","ArrowRight","KeyE","KeyF","KeyC","KeyG","KeyR"].forEach((k) => { dbg["key_" + k] = keys[k] ? 1 : 0; });
      // --- distances utiles ---
      dbg.dist_seed = +player.pos.distanceTo(seedPos).toFixed(2);
      dbg.dist_ghost = +player.pos.distanceTo(ghostCenter).toFixed(2);
      dbg.dist_ship = +player.pos.distanceTo(shipState.pos).toFixed(2);
      dbg.dist_camp = +player.pos.distanceTo(campWorldPos).toFixed(2);
      dbg.dist_moonStation = +player.pos.distanceTo(moonStationWorld).toFixed(2);
      dbg.dist_center = +player.pos.length().toFixed(2);
      // --- perf / scène ---
      dbg.draw_calls = renderer.info.render.calls;
      dbg.triangles = renderer.info.render.triangles;
      dbg.geometries = renderer.info.memory.geometries;
      dbg.textures = renderer.info.memory.textures;
      dbg.programs = renderer.info.programs ? renderer.info.programs.length : 0;
      dbg.points_render = renderer.info.render.points;
      dbg.lines_render = renderer.info.render.lines;
      dbg.flashes = flashes.length;
      dbg.dbg_buffer = dbgFrames.length;

      // snapshot ordonné
      dbgFrames.push({ ...dbg });
      dbgFrameNo++;
      if (dbgFrames.length >= DBG_MAX_FRAMES) { console.warn("[DBG] cap atteint, dump auto"); stopAndDump(); }
    };

    const stopAndDump = () => {
      dbgOn = false;
      setDbgRec(false);
      if (!dbgFrames.length) return;
      // en-tête = union de toutes les clés rencontrées (TSV stable)
      const keySet = new Set();
      for (const f of dbgFrames) for (const k in f) keySet.add(k);
      const cols = [...keySet];
      const lines = [];
      lines.push("# Timber Hearth debug log");
      lines.push("# frames=" + dbgFrames.length + "  colonnes=" + cols.length + "  duree=" + (clock.elapsedTime - dbgStartT).toFixed(1) + "s");
      lines.push("# genere " + new Date().toISOString());
      lines.push(cols.join("\t"));
      for (const f of dbgFrames) lines.push(cols.map((c) => (c in f ? fmtN(f[c]) : "")).join("\t"));
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url; a.download = `timberhearth_debug_${stamp}.txt`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      console.log(`[DBG] ${dbgFrames.length} frames × ${cols.length} variables → ${a.download}`);
      dbgFrames = [];
    };
    const toggleDebug = () => {
      if (dbgOn) { stopAndDump(); }
      else { dbgOn = true; dbgFrames = []; dbgFrameNo = 0; dbgStartT = clock.elapsedTime; setDbgRec(true); console.log("[DBG] capture démarrée (L pour stopper + télécharger)"); }
    };

    // EVO-1 : couleurs du soleil mourant (hoistées hors boucle)
    const _lFwd = new THREE.Vector3(); // EVO-3 : temp orientation listener
    const SUN_C0 = new THREE.Color(0xfff0c0), SUN_C1 = new THREE.Color(0xff4818);
    const DIR_C0 = new THREE.Color(0xfff4e0), DIR_C1 = new THREE.Color(0xff7a45);
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      updateInput(); // EVO-5 : fusionne clavier + manette (axes analogiques dans padAxisLook)
      // EVO-7 : pad de visée tactile + capteurs d'inclinaison → regard continu (proportionnel, indépendant du framerate)
      const lookX = touchLook.x + tiltLook.x, lookY = touchLook.y + tiltLook.y;
      if ((lookX || lookY) && !dialogRef.current && !showLogRef.current && !showRemapRef.current) applyLook(lookX * 760 * dt, lookY * 760 * dt);
      loopTime += dt * (fastRef.current ? 10 : 1);
      const dur = CFG.LOOP, t = Math.min(loopTime, dur);

      const ang = (t / dur) * Math.PI * 2 - Math.PI * 0.4;
      const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.9 + 0.15, Math.sin(ang) * 0.3).normalize();
      sun.position.copy(sunDir.clone().multiplyScalar(500));
      sunMesh.position.copy(sunDir.clone().multiplyScalar(2500));
      sky.material.uniforms.uSun.value.copy(sunDir);
      const superF = THREE.MathUtils.clamp((t - (dur - CFG.SUPERNOVA_WARN)) / CFG.SUPERNOVA_WARN, 0, 1);
      sky.material.uniforms.uSuper.value = superF;
      const day = THREE.MathUtils.clamp(sunDir.y * 2 + 0.5, 0, 1);
      ffMat.uniforms.uDay.value = day; ffMat.uniforms.uTime.value += dt;
      sun.intensity = 0.5 + day * 2.5;
      // EVO-1 : le soleil meurt visiblement sur les ~3 dernières minutes (géante rouge), avant le flash
      const dyingF = THREE.MathUtils.smoothstep(loopTime, dur - 180, dur - 20);
      sunMesh.material.color.copy(SUN_C0).lerp(SUN_C1, dyingF);
      sunMesh.scale.setScalar(1 + dyingF * 1.3);
      sun.color.copy(DIR_C0).lerp(DIR_C1, dyingF);
      sky.material.uniforms.uDying.value = dyingF;
      fireLight.intensity = 45 + Math.sin(clock.elapsedTime * 12) * 8 + Math.random() * 4;
      flame.scale.y = 1 + Math.sin(clock.elapsedTime * 9) * 0.12;
      bloom.strength = 0.45 + superF * 1.8; // supernova fait monter le bloom
      if (loopTime >= dur && !dying) supernova();

      // --- Corps célestes : orbites + report du déplacement sur les corps posés dessus ---
      updateBodies(dt);
      for (const b of BODIES) {
        if (!b.orbit) continue;                         // seuls les corps mobiles emportent ce qui est posé dessus
        const delta = b.pos.clone().sub(b.prevPos);
        if (delta.lengthSq() < 1e-12) continue;
        if (!flyingRef.current && player.pos.distanceTo(b.pos) < b.R + 6) player.pos.add(delta);
        if (shipState.landed && shipState.pos.distanceTo(b.pos) < b.R + 6) shipState.pos.add(delta);
      }
      // station nomai de l'Attlerock en coords monde (pôle local +Y)
      moonStationWorld.copy(moonBody.pos).add(new THREE.Vector3(0, MOON_R + 1.5, 0));

      // Scout : vol balistique léger, révèle la Matière Fantôme à proximité
      if (scout.alive) {
        const sUp = scout.mesh.position.clone().normalize();
        scout.vel.addScaledVector(sUp, -CFG.G * 0.4 * dt); // gravité atténuée
        scout.mesh.position.addScaledVector(scout.vel, dt);
        // oriente la sonde dans le sens du vol (sa caméra regarde -Z local → vers l'avant)
        if (scout.vel.lengthSq() > 0.01) {
          const look = scout.mesh.position.clone().add(scout.vel);
          scout.mesh.lookAt(look); // -Z pointe vers la cible = direction de vol
        }
        scout.ttl -= dt;
        if (scout.mesh.position.length() <= CFG.R + 0.2) { scout.mesh.position.normalize().multiplyScalar(CFG.R + 0.2); scout.vel.multiplyScalar(0.1); }
        if (scout.ttl <= 0) { scout.alive = false; scout.mesh.visible = false; }
      }
      if (scoutActiveRef.current !== scout.alive) { scoutActiveRef.current = scout.alive; setScoutActive(scout.alive); }
      // révélation : sonde proche de la poche OU joueur très proche (caméra embarquée)
      const scoutNearGhost = scout.alive && scout.mesh.position.distanceTo(ghostCenter) < 9;
      const playerNearGhost = player.pos.distanceTo(ghostCenter) < 9;
      const wantReveal = scoutNearGhost || playerNearGhost ? 1 : 0;
      ghostReveal += (wantReveal - ghostReveal) * Math.min(1, dt * 4);
      gMat.opacity = ghostReveal * 0.9;
      if (ghostReveal > 0.4) learn("found_ghost_matter");

      // Geysers : machine à états + poussée joueur dans la colonne
      let geyserForce = null;
      for (const gz of geysers) {
        gz.timer += dt; gz.t += dt;
        if (gz.state === "idle" && gz.timer >= gz.period) { gz.state = "erupting"; gz.t = 0; gz.timer = 0; gz.col.visible = true; }
        else if (gz.state === "erupting") {
          const k = gz.t / 5; gz.col.scale.y = Math.min(1, k * 2) * (1 - k * 0.3);
          // joueur dans la colonne ?
          const toP = player.pos.clone().sub(gz.base);
          const along = toP.dot(gz.normal);
          const radial = toP.clone().sub(gz.normal.clone().multiplyScalar(along)).length();
          if (along > 0 && along < 64 && radial < 2.2) { geyserForce = gz.normal.clone().multiplyScalar(50); learn("rode_geyser"); }
          if (gz.t >= 5) { gz.state = "idle"; gz.col.visible = false; }
        }
      }

      // ===================== PILOTAGE DU VAISSEAU =====================
      if (flyingRef.current) {
        // FIX : vider l'invite contextuelle (« Embarquer… ») figée — la branche à pied ne tourne pas en vol
        if (hudRef.current.prompt) setHud((h) => ({ ...h, prompt: "" }));
        // axes locaux du vaisseau (utilisés partout : pilotage, caméra, flammes)
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(shipState.quat);
        const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(shipState.quat);
        const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(shipState.quat);
        let thrusting = false, autolandActive = false, autopilotActive = false;
        let upS, distS, sGroundR;
        // ===== EVO-6+ : ATTERRISSAGE SPÉCULATIF (G) — hors physique (gravité/vitesses coupées), toujours fonctionnel =====
        // cible = astre verrouillé sinon astre le plus proche ; glisse jusqu'au sol en suivant l'astre (lune mobile incluse).
        const landTarget = lockedRef.current ? bodyById[lockedRef.current] : nearestBody(shipState.pos);
        if (keys["KeyG"] && !shipState.landed && landTarget) {
          autolandActive = true; autoRef.current = false;     // coupe le pilote auto pour éviter la course-poursuite
          const relL = shipState.pos.clone().sub(landTarget.pos);
          upS = relL.clone().normalize();
          sGroundR = landTarget.home ? groundR(upS) : landTarget.R;
          distS = relL.length();
          const surf = landTarget.pos.clone().addScaledVector(upS, sGroundR + 2.2);
          shipState.pos.lerp(surf, Math.min(1, dt * 1.6));     // descente scriptée (approche exponentielle)
          shipState.vel.copy(landTarget.pos).sub(landTarget.prevPos).multiplyScalar(dt > 0 ? 1 / dt : 0); // colle au mouvement de l'astre
          shipState.quat.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upS), Math.min(1, dt * 3));
          if (shipState.pos.distanceTo(surf) < 0.6) { shipState.pos.copy(surf); shipState.landed = true; }
          res.o2 = Math.min(CFG.O2_MAX, res.o2 + CFG.O2_REFILL * dt);
          if (landTarget.home) res.fuel = Math.min(CFG.FUEL_MAX, res.fuel + CFG.FUEL_REFILL * dt);
          else learn("attlerock");
        } else {
        const body = gravBody(shipState.pos);                 // corps gravitationnel dominant
        if (!body.home) learn("attlerock");
        const rel = shipState.pos.clone().sub(body.center);   // position relative au centre du corps
        upS = rel.clone().normalize();
        distS = rel.length();
        // gravité radiale vers le corps (atténuée en altitude)
        const gShip = body.G * THREE.MathUtils.clamp(1 - (distS - body.R) / 120, 0.15, 1);
        shipState.vel.addScaledVector(upS, -gShip * dt);
        // sol réel sous le vaisseau (terrain sur Âtrebois, sphère lisse ailleurs) — EVO-2
        sGroundR = body.home ? groundR(upS) : body.R;
        const thrust = new THREE.Vector3();
        if (keys["KeyW"] || keys["KeyZ"]) thrust.add(fwd);
        if (keys["KeyS"]) thrust.sub(fwd);
        if (keys["KeyD"]) thrust.add(rgt);
        if (keys["KeyA"] || keys["KeyQ"]) thrust.sub(rgt);
        if (keys["Space"]) thrust.add(upL);
        if (keys["ShiftLeft"]) thrust.sub(upL);
        thrusting = thrust.lengthSq() > 0 && res.fuel > 0;
        if (thrusting) {
          shipState.vel.addScaledVector(thrust.normalize(), CFG.SHIP_THRUST * dt);
          res.fuel = Math.max(0, res.fuel - CFG.FUEL_DRAIN * dt);
        }
        // roulis au clavier (flèches)
        if (keys["ArrowLeft"]) shipState.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), CFG.SHIP_ROLL * dt));
        if (keys["ArrowRight"]) shipState.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -CFG.SHIP_ROLL * dt));
        // EVO-5 : pilotage analogique au joystick (tangage / lacet / roulis proportionnels)
        if (padAxisLook.yaw)   shipState.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -padAxisLook.yaw * CFG.SHIP_PITCHYAW * dt * 1.6));
        if (padAxisLook.pitch) shipState.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -padAxisLook.pitch * CFG.SHIP_PITCHYAW * dt * 1.6));
        if (padAxisLook.roll)  shipState.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -padAxisLook.roll * CFG.SHIP_ROLL * dt));
        if (padAxisLook.yaw || padAxisLook.pitch || padAxisLook.roll) shipState.quat.normalize();

        // --- EVO-6 : pilote automatique vers l'astre verrouillé (variations auto de direction + vitesse) ---
        const lockBody = lockedRef.current ? bodyById[lockedRef.current] : null;
        if (autoRef.current && lockBody && !shipState.landed && res.fuel > 0) {
          autopilotActive = true;
          const toB = lockBody.pos.clone().sub(shipState.pos);
          const distB = Math.max(0, toB.length() - lockBody.R);
          const dir = toB.clone().normalize();
          // DIRECTION : oriente le nez du vaisseau vers l'astre (rotation progressive)
          const curFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(shipState.quat);
          const qTo = new THREE.Quaternion().setFromUnitVectors(curFwd, dir);
          shipState.quat.premultiply(new THREE.Quaternion().slerp(qTo, Math.min(1, dt * 2))).normalize();
          // VITESSE : approche puis freinage (vitesse de rapprochement désirée ∝ distance), drift latéral annulé
          const bodyVel = lockBody.pos.clone().sub(lockBody.prevPos).multiplyScalar(dt > 0 ? 1 / dt : 0);
          const relVel = shipState.vel.clone().sub(bodyVel);
          const closing = relVel.dot(dir);
          const desired = THREE.MathUtils.clamp(distB * 0.35, 0, 55); // u/s vers l'astre (→0 à l'arrivée)
          const dv = THREE.MathUtils.clamp(desired - closing, -CFG.SHIP_THRUST * dt, CFG.SHIP_THRUST * dt);
          shipState.vel.addScaledVector(dir, dv);
          const lateral = relVel.clone().addScaledVector(dir, -closing);
          shipState.vel.addScaledVector(lateral, -Math.min(1, dt * 0.8)); // amortit la dérive perpendiculaire
          res.fuel = Math.max(0, res.fuel - CFG.FUEL_DRAIN * 0.8 * dt);
        }

        // amortissement léger (stabilisateurs)
        shipState.vel.multiplyScalar(Math.pow(1 - CFG.SHIP_DAMP * 0.1, dt * 60));
        shipState.pos.addScaledVector(shipState.vel, dt);
        // collision sol : atterrissage (relatif au corps dominant)
        const rel2 = shipState.pos.clone().sub(body.center);
        if (rel2.length() <= (body.home ? groundR(rel2.clone().normalize()) : body.R) + 2.2) {
          shipState.pos.copy(body.center).add(rel2.normalize().multiplyScalar((body.home ? groundR(rel2.clone().normalize()) : body.R) + 2.2));
          const vUp = shipState.vel.dot(upS);
          if (vUp < 0) shipState.vel.addScaledVector(upS, -vUp);
          shipState.vel.multiplyScalar(Math.pow(0.1, dt * 60)); // friction au sol
          if (shipState.vel.length() < 2) {
            const target = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upS);
            shipState.quat.slerp(target, Math.min(1, dt * 2));
            shipState.landed = true;
          }
        } else shipState.landed = false;
        // au sol/posé : recharge O2 + carburant (station de la tour)
        if (shipState.landed) {
          res.o2 = Math.min(CFG.O2_MAX, res.o2 + CFG.O2_REFILL * dt);
          res.fuel = Math.min(CFG.FUEL_MAX, res.fuel + CFG.FUEL_REFILL * dt);
        } else {
          // en vol, le vaisseau fournit l'O2 (pas de consommation pilote)
          res.o2 = Math.min(CFG.O2_MAX, res.o2 + CFG.O2_REFILL * 0.3 * dt);
        }
        } // fin de la branche physique normale (≠ atterrissage spéculatif)
        // applique au mesh
        ship.position.copy(shipState.pos); ship.quaternion.copy(shipState.quat);
        flames.forEach((f) => { f.visible = thrusting || autolandActive || autopilotActive; f.scale.y = 0.8 + Math.random() * 0.5; });
        // EVO-9 : feux de navigation clignotants (repère d'orientation nocturne)
        { const b = (Math.sin(clock.elapsedTime * 5) > 0.3) ? 2.6 : 0.5; for (const n of navLights) n.material.emissiveIntensity = b; }
        // caméra 3e personne rapprochée : derrière et au-dessus du vaisseau, regard vers l'avant
        const camOffset = fwd.clone().multiplyScalar(-9).add(upL.clone().multiplyScalar(3.5));
        const camTarget = shipState.pos.clone().add(camOffset);
        camera.position.lerp(camTarget, Math.min(1, dt * 8)); // suivi lissé
        camera.up.copy(upL);
        camera.lookAt(shipState.pos.clone().addScaledVector(fwd, 12).addScaledVector(upL, 1));
        sky.position.copy(camera.position);

        // ===================== EVO-6 : verrouillage d'astre + instrumentation du réticule =====================
        camera.updateMatrixWorld();
        const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
        const camRight = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
        const camUp = new THREE.Vector3().crossVectors(camRight, camDir).normalize();
        // astre le plus proche du centre du réticule (cône ~6°)
        let cand = null, candDot = 0.9945;
        for (const b of BODIES) {
          const d = b.pos.clone().sub(camera.position); const L = d.length(); if (L < 1e-3) continue;
          const dd = d.multiplyScalar(1 / L).dot(camDir);
          if (dd > candDot) { candDot = dd; cand = b; }
        }
        candidateRef.current = cand ? cand.id : null;
        const lockedId = lockedRef.current;
        const now6 = performance.now();
        // message éphémère (~10 s) : nouvelle cible visée, ou verrouillage acquis/relâché
        if (lockedId !== lkLastLocked) {
          lkMsg = lockedId ? "« " + (bodyById[lockedId]?.name || lockedId) + " » VERROUILLÉ · [Y] pilote auto · [T] relâcher" : null;
          lkUntil = now6 + 10000; lkLastLocked = lockedId;
        } else if (!lockedId && cand && cand.id !== lkLastCand) {
          lkMsg = "Pour verrouiller « " + (cand.name || cand.id) + " » : appuie sur [T]"; lkUntil = now6 + 10000;
        }
        lkLastCand = cand ? cand.id : null;
        // EVO-7 : sur tactile, garder l'invite de verrouillage tant qu'un astre est visé (pour pouvoir la taper)
        if (isTouchRef.current && !lockedId && cand) { lkMsg = "Pour verrouiller « " + (cand.name || cand.id) + " » : appuie ici"; lkUntil = now6 + 1500; }
        if (lkMsg && now6 > lkUntil) lkMsg = null;
        if (lkMsg !== lkPushed) { lkPushed = lkMsg; setLockMsg(lkMsg); }
        // instrumentation de la cible verrouillée (distance + vitesse relatives, vecteur de dérive)
        let tgt = { locked: false };
        const lb = lockedId ? bodyById[lockedId] : null;
        if (lb) {
          const relPos = lb.pos.clone().sub(shipState.pos);
          const dist = relPos.length() - lb.R;
          const n = relPos.clone().normalize();
          const bodyVel = lb.pos.clone().sub(lb.prevPos).multiplyScalar(dt > 0 ? 1 / dt : 0);
          const relVel = shipState.vel.clone().sub(bodyVel);
          const closing = relVel.dot(n);                 // + rapprochement / − éloignement
          const proj = lb.pos.clone().project(camera);
          const sr = relVel.dot(camRight), su = relVel.dot(camUp); // dérive latérale projetée écran
          tgt = {
            locked: true, name: lb.name || lockedId, auto: autoRef.current,
            dist: Math.round(dist), closing: +closing.toFixed(1), relSpd: +relVel.length().toFixed(1),
            mx: +((proj.x * 0.5 + 0.5) * 100).toFixed(1), my: +((-proj.y * 0.5 + 0.5) * 100).toFixed(1), inFront: proj.z < 1,
            arrDeg: Math.round(Math.atan2(-su, sr) * 180 / Math.PI),
            arrLen: Math.round(THREE.MathUtils.clamp(Math.hypot(sr, su) * 2.2, 0, 130)),
            approaching: closing >= 0,
          };
        }
        // pousse vers React (throttle : changements significatifs, max ~20 Hz)
        const pv = tgtRef, ch =
          pv.locked !== tgt.locked || pv.auto !== tgt.auto || pv.inFront !== tgt.inFront || pv.name !== tgt.name ||
          Math.abs((pv.dist || 0) - (tgt.dist || 0)) >= 1 || Math.abs((pv.closing || 0) - (tgt.closing || 0)) >= 0.3 ||
          Math.abs((pv.mx || 0) - (tgt.mx || 0)) >= 0.6 || Math.abs((pv.my || 0) - (tgt.my || 0)) >= 0.6 ||
          Math.abs((pv.arrDeg || 0) - (tgt.arrDeg || 0)) >= 4 || Math.abs((pv.arrLen || 0) - (tgt.arrLen || 0)) >= 4 ||
          pv.approaching !== tgt.approaching;
        if (ch && now6 - tgtPushedAt > 50) { Object.assign(tgtRef, { locked: false, name: undefined, auto: undefined, dist: undefined, closing: undefined, relSpd: undefined, mx: undefined, my: undefined, inFront: undefined, arrDeg: undefined, arrLen: undefined, approaching: undefined }, tgt); tgtPushedAt = now6; setFlyTgt({ ...tgt }); }
        // pulsation de l'écran de bord selon carburant
        dashScreen.material.color.setHex(res.fuel > 20 ? 0x102838 : 0x381010);
        // valeurs HUD de vol (throttlées)
        const altH = distS - sGroundR;
        const spdH = shipState.vel.length();
        const vSpdH = shipState.vel.dot(upS); // + monte, - descend
        const dangerH = !shipState.landed && altH < 25 && vSpdH < -12; // approche rapide du sol
        const fh = { alt: Math.round(altH), spd: +spdH.toFixed(1), vspd: +vSpdH.toFixed(1), danger: dangerH, auto: autolandActive };
        const pf = flyHudRef.current;
        if (pf.alt !== fh.alt || Math.abs(pf.spd - fh.spd) > 0.4 || Math.abs(pf.vspd - fh.vspd) > 0.4 || pf.danger !== fh.danger || pf.auto !== fh.auto) {
          flyHudRef.current = fh; setFlyHud(fh);
        }
        // supernova / mort gérées plus bas via les blocs existants ; on saute la physique joueur
      } else {

      const pBody = gravBody(player.pos);
      const pRel = player.pos.clone().sub(pBody.center);
      const up = pRel.clone().normalize();
      const distC = player.pos.length();              // distance au centre d'Âtrebois (pour zéro-G)
      // zéro-G seulement au cœur d'Âtrebois (la lune n'a pas de grotte)
      const gFactor = !pBody.home ? 1 : THREE.MathUtils.smoothstep(distC, ZEROG_RADIUS, ZEROG_RADIUS + 14);
      const inZeroG = gFactor < 0.5;
      player.vel.addScaledVector(up, -pBody.G * gFactor * dt);
      if (inZeroG) {
        // capture : plafonne la vitesse d'arrivée (sinon on traverse la bulle et on ressort en pendule)
        const vmax = 8;
        if (player.vel.length() > vmax) player.vel.setLength(vmax);
        player.vel.multiplyScalar(Math.pow(0.6, dt * 60));    // flottaison visqueuse
        if (player.pos.length() > 2) player.vel.addScaledVector(player.pos.clone().normalize(), -3 * dt); // dérive douce vers le cœur
      }
      if (geyserForce) player.vel.addScaledVector(geyserForce, dt);
      const frozen = dialogRef.current || showLogRef.current;
      if (frozen) {
        if (!inZeroG) { const vUp = player.vel.dot(up); player.vel.copy(up).multiplyScalar(vUp); }
        // en apesanteur gelée : on laisse la vitesse résiduelle s'amortir, pas d'input
      } else {
        player.forward.sub(up.clone().multiplyScalar(player.forward.dot(up)));
        if (player.forward.lengthSq() < 1e-5) player.forward.set(1, 0, 0).sub(up.clone().multiplyScalar(up.x));
        player.forward.normalize();
        // EVO-5 : visée au joystick à pied (lacet autour de la verticale locale, tangage borné)
        if (padAxisLook.yaw) player.forward.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, -padAxisLook.yaw * 2.4 * dt)).normalize();
        if (padAxisLook.pitch) player.pitch = THREE.MathUtils.clamp(player.pitch - padAxisLook.pitch * 2.4 * dt, -1.4, 1.4);
        const right = new THREE.Vector3().crossVectors(player.forward, up).normalize();
        const wish = new THREE.Vector3();
        if (keys["KeyW"] || keys["KeyZ"]) wish.add(player.forward);
        if (keys["KeyS"]) wish.sub(player.forward);
        if (keys["KeyD"]) wish.add(right);
        if (keys["KeyA"] || keys["KeyQ"]) wish.sub(right);
        const sp = keys["ShiftLeft"] ? CFG.RUN : CFG.WALK;
        if (inZeroG) {
          // EVA : poussée libre dans la direction de visée + montée/descente
          const r2 = new THREE.Vector3().crossVectors(player.forward, up).normalize();
          const look = player.forward.clone().applyAxisAngle(r2, player.pitch).normalize();
          const thrust = new THREE.Vector3();
          if (keys["KeyW"] || keys["KeyZ"]) thrust.add(look);
          if (keys["KeyS"]) thrust.sub(look);
          if (keys["KeyD"]) thrust.add(r2);
          if (keys["KeyA"] || keys["KeyQ"]) thrust.sub(r2);
          if (keys["Space"]) thrust.add(up);
          if (keys["ShiftLeft"]) thrust.sub(up);
          if (thrust.lengthSq() > 0) player.vel.addScaledVector(thrust.normalize(), 14 * dt);
        } else {
          const vUp = player.vel.dot(up);
          if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(sp);
          player.vel.copy(wish).addScaledVector(up, vUp);
          if (keys["Space"] && player.grounded) { player.vel.addScaledVector(up, CFG.JUMP); player.grounded = false; }
        }
      }
      player.pos.addScaledVector(player.vel, dt);
      // Collision sol relative au corps (terrain réel sur Âtrebois ; puits/grotte seulement sur Âtrebois)
      const pRel2 = player.pos.clone().sub(pBody.center);
      const onShaft = pBody.home && inShaftColumn(player.pos);
      const pGroundR = pBody.home ? groundR(pRel2.clone().normalize()) : pBody.R;
      if (pRel2.length() <= pGroundR + 0.05 && !onShaft) {
        player.pos.copy(pBody.center).add(pRel2.normalize().multiplyScalar(pGroundR));
        const vUp = player.vel.dot(up); if (vUp < 0) player.vel.addScaledVector(up, -vUp);
        player.grounded = true;
      } else player.grounded = false;
      // Paroi du puits : seulement sur Âtrebois
      if (pBody.home && player.pos.length() < CFG.R && inShaftColumn(player.pos)) {
        const along = player.pos.dot(shaftNormal);
        const axisPt = shaftNormal.clone().multiplyScalar(along);
        const radialV = player.pos.clone().sub(axisPt);
        const rl = radialV.length();
        if (rl > SHAFT_RADIUS - 0.4 && rl > 1e-4) {
          player.pos.copy(axisPt).add(radialV.multiplyScalar((SHAFT_RADIUS - 0.4) / rl));
        }
      }
      if (distC < ZEROG_RADIUS + 2) learn("zero_g_cave");
      if (zeroGRef.current !== inZeroG) { zeroGRef.current = inZeroG; setZeroG(inZeroG); }

      // Oxygène (joueur à pied) : recharge en zone respirable (village, vaisseau, intérieur d'Âtrebois)
      const nearVillage = player.pos.distanceTo(campWorldPos) < 60 && player.pos.length() <= CFG.R + 3;
      const nearShipO2 = shipState.landed && player.pos.distanceTo(shipState.pos) < 8;
      const insideHome = pBody.home && player.pos.length() < CFG.R - 8; // sous la surface (puits / grotte) = air
      if (nearVillage || nearShipO2 || insideHome) {
        res.o2 = Math.min(CFG.O2_MAX, res.o2 + CFG.O2_REFILL * dt);
      } else {
        const drain = inZeroG ? CFG.O2_DRAIN_EVA : CFG.O2_DRAIN; // EVA consomme plus
        res.o2 = Math.max(0, res.o2 - drain * dt);
        if (res.o2 < 25 && ctx && masterGain && clock.elapsedTime - lastO2Beep > 2) { // EVO-3 : alarme O2
          lastO2Beep = clock.elapsedTime;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = "square"; o.frequency.value = 880;
          g.gain.setValueAtTime(0.001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
          o.connect(g); g.connect(masterGain); o.start(); o.stop(ctx.currentTime + 0.16);
        }
        if (res.o2 <= 0 && !dying) die(); // asphyxie
        if (res.o2 < 25 && ctx && masterGain && clock.elapsedTime - lastO2Beep > 2) {
          lastO2Beep = clock.elapsedTime;
          const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square"; o.frequency.value = 880;
          g.gain.setValueAtTime(0.09, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
          o.connect(g); g.connect(masterGain); o.start(); o.stop(ctx.currentTime + 0.16);
        }
      }

      // Machine EVA : modules dérivent ; viser + maintenir E pour réparer
      machine.rotation.y += dt * 0.05;
      if (!machineRepaired) {
        coreLight.intensity = 1.5 + Math.sin(clock.elapsedTime * 6) * 1.0; // pulsation rouge
        // dérive flottante des modules non réparés
        for (const m of modules) {
          if (m.userData.repaired) continue;
          m.userData.phase += dt * 0.5;
          const base = m.userData.slot.clone().add(m.userData.drift);
          m.position.copy(base).add(new THREE.Vector3(Math.sin(m.userData.phase) * 0.3, Math.cos(m.userData.phase * 0.8) * 0.3, Math.sin(m.userData.phase * 1.2) * 0.3));
          m.rotation.x += dt * 0.4; m.rotation.z += dt * 0.3;
        }
        // sélection du module visé (cône autour de la direction caméra), à portée
        let aim = null, bestDot = 0.95;
        if (inZeroG || player.pos.length() < ZEROG_RADIUS + 6) {
          const eyeP = camera.position;
          for (const m of modules) {
            if (m.userData.repaired) continue;
            const to = m.getWorldPosition(new THREE.Vector3()).sub(eyeP);
            const dist = to.length();
            if (dist > 8) continue;
            const dot = to.normalize().dot(lookDirRef);
            if (dot > bestDot) { bestDot = dot; aim = m; }
          }
        }
        if (aim && keys["KeyE"]) {
          if (repairTarget !== aim) { repairTarget = aim; repairHold = 0; }
          repairHold += dt;
          if (repairHold >= 2.0) {
            aim.userData.repaired = true;
            aim.position.copy(aim.userData.slot); // snap en place
            aim.material.emissive = new THREE.Color(0x20c040); aim.material.emissiveIntensity = 0.6;
            spawnFlash(aim.getWorldPosition(new THREE.Vector3()));
            repairTarget = null; repairHold = 0;
            if (modules.every((mm) => mm.userData.repaired)) {
              machineRepaired = true; coreLight.color.set(0x30ff60); coreLight.intensity = 3;
              core.material.emissive = new THREE.Color(0x20c040); core.material.emissiveIntensity = 0.8;
              learn("repaired_machine");
            }
          }
        } else { repairTarget = null; repairHold = 0; }
        const ui = aim ? { active: !!keys["KeyE"], pct: Math.min(1, repairHold / 2.0) } : null;
        const prev = repairRef.current;
        const changed = (!prev && ui) || (prev && !ui) || (prev && ui && (prev.active !== ui.active || Math.abs(prev.pct - ui.pct) > 0.05));
        if (changed) { repairRef.current = ui; setRepair(ui); }
      } else {
        if (repairRef.current) { repairRef.current = null; setRepair(null); }
        coreLight.intensity = 2.5 + Math.sin(clock.elapsedTime * 2) * 0.5;
      }

      // Collisions horizontales : repousse hors des cylindres (uniquement près du sol)
      const distCenter = player.pos.length();
      if (distCenter < CFG.R + 4) {
        for (const c of colliders) {
          const d = player.pos.clone().sub(c.base);
          const upC = c.base.clone().normalize();
          const horiz = d.clone().sub(upC.clone().multiplyScalar(d.dot(upC))); // composante tangente
          const hl = horiz.length();
          const minDist = c.radius + 0.4;
          if (hl < minDist && hl > 1e-4) {
            const push = horiz.multiplyScalar((minDist - hl) / hl);
            player.pos.add(push);
            // annule la vitesse entrante dans le mur
            const inward = push.clone().normalize();
            const vIn = player.vel.dot(inward);
            if (vIn < 0) player.vel.addScaledVector(inward, -vIn);
          }
        }
      }

      // Collision des murs de l'Observatoire (résolution en repère local, ouverture de porte)
      if (player.pos.distanceTo(obsWorldCenter) < 11) {
        const lp = player.pos.clone().applyMatrix4(obsInv); // position locale
        if (lp.y > -1 && lp.y < OBS_H) {                    // dans la tranche de hauteur du bâtiment
          let moved = false;
          for (let iter = 0; iter < 2; iter++) {            // 2 passes pour les coins
            for (const w of OBS_WALLS) {
              const dx = lp.x - w.cx, dz = lp.z - w.cz;
              const px = (w.hx + OBS_PLAYER_R) - Math.abs(dx);
              const pz = (w.hz + OBS_PLAYER_R) - Math.abs(dz);
              if (px > 0 && pz > 0) {                        // pénétration : pousser sur l'axe de moindre enfoncement
                if (px < pz) lp.x = w.cx + Math.sign(dx || 1) * (w.hx + OBS_PLAYER_R);
                else lp.z = w.cz + Math.sign(dz || 1) * (w.hz + OBS_PLAYER_R);
                moved = true;
              }
            }
          }
          if (moved) {
            const corrected = lp.applyMatrix4(obsMat);       // retour en monde
            const delta = corrected.clone().sub(player.pos);
            player.pos.copy(corrected);
            // annule la vitesse entrant dans le mur (le long de la correction)
            if (delta.lengthSq() > 1e-8) {
              const nrm = delta.clone().normalize();
              const vIn = player.vel.dot(nrm);
              if (vIn < 0) player.vel.addScaledVector(nrm, -vIn);
            }
          }
        }
      }

      // Mort : entrée dans la poche de Matière Fantôme
      if (!dying && player.pos.distanceTo(ghostCenter) < GHOST_RADIUS) { learn("found_ghost_matter"); die(); }

      } // fin garde !flying

      if (!flyingRef.current) {
      const inZeroG = zeroGRef.current;                       // recalcul local (la déclaration du bloc physique est hors portée ici)
      const frozen = dialogRef.current || showLogRef.current;
      const _pr = player.pos.clone().sub(gravBody(player.pos).center);
      const up2 = _pr.lengthSq() > 1e-6 ? _pr.normalize() : camUp.clone();
      // bob de marche : seulement au sol, désactivé en apesanteur
      const horizSpeed = player.vel.clone().sub(up2.clone().multiplyScalar(player.vel.dot(up2))).length();
      if (player.grounded && !inZeroG && horizSpeed > 0.5 && !frozen) {
        bobPhase += dt * horizSpeed * 1.1;
        if (Math.sin(bobPhase) < -0.92 && clock.elapsedTime - lastFootstep > 0.18) { playFootstep(); lastFootstep = clock.elapsedTime; }
      }
      const bob = (player.grounded && !inZeroG && horizSpeed > 0.5) ? Math.sin(bobPhase) * 0.06 : 0;
      // up caméra : suit la gravité au sol, se fige doucement en apesanteur (évite le vertige au centre)
      camUp.lerp(up2, inZeroG ? 0.02 : 0.25).normalize();
      const eye = player.pos.clone().add(camUp.clone().multiplyScalar(CFG.EYE + bob));
      camera.position.copy(eye);
      const right2 = new THREE.Vector3().crossVectors(player.forward, camUp).normalize();
      const lookDir = player.forward.clone().applyAxisAngle(right2, player.pitch).normalize();
      camera.up.copy(camUp); camera.lookAt(eye.clone().add(lookDir));
      lookDirRef.copy(lookDir);

      // Signalscope : FOV resserré + détection directionnelle de la Graine (pas de ligne de vue requise)
      const wantFov = scopeOn ? 12 : 70;
      if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
      if (scopeOn) {
        const toSeed = seedPos.clone().sub(camera.position).normalize();
        const dotS = lookDir.dot(toSeed);
        signal = THREE.MathUtils.clamp((dotS - 0.95) / 0.05, 0, 1); // cône étroit
        if (signal > 0.75) {
          learn("signal_feldspar");
          if (clock.elapsedTime - harmLast > HARM_DUR + 1.2) { playHarmonica(); harmLast = clock.elapsedTime; }
        }
      } else { signal = 0; }
      if (Math.abs(sigRef.current - signal) > 0.04) { sigRef.current = signal; setSig(signal); }
      seedLight.intensity = 3 + Math.sin(clock.elapsedTime * 1.3) * 1.5; // pulsation

      // Statue nomai : yeux s'ouvrent (émissif cyan) une fois la sonde Scout utilisée
      const eyesOpen = knowledge.has("launched_scout");
      const eyeTarget = eyesOpen ? 1.6 + Math.sin(clock.elapsedTime * 2) * 0.3 : 0;
      statueEyeMat.emissiveIntensity += (eyeTarget - statueEyeMat.emissiveIntensity) * Math.min(1, dt * 2);
      statueEyeMat.emissive.setHex(0x00fff0);
      statueLight.intensity += (((eyesOpen ? 2 : 0)) - statueLight.intensity) * Math.min(1, dt * 2);
      // rocher quantique de l'observatoire : se téléporte dans sa vitrine quand on ne le regarde pas
      for (const qc of quantumCaseObjects) {
        const wp = qc.item.getWorldPosition(new THREE.Vector3());
        const vis = frustum.containsPoint(wp);
        if (qc._wasVis && !vis && (qc._cd || 0) <= 0) {
          qc.item.position.x = qc.ex.x + (Math.random() - 0.5) * 0.5;
          qc.item.position.z = qc.ex.z + (Math.random() - 0.5) * 0.5;
          qc.item.position.y = 1.5 + (Math.random() - 0.5) * 0.4;
          qc._cd = 1.0;
        }
        qc._cd = (qc._cd || 0) - dt;
        qc._wasVis = vis;
      }

      // Bosquet Quantique : téléporte un objet quand il quitte le champ de vision (frustum)
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      frustum.setFromProjectionMatrix(fMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const q of quantums) {
        q.cd -= dt;
        const visible = frustum.containsPoint(q.mesh.position);
        if (q.wasVisible && !visible && q.cd <= 0) {
          spawnFlash(q.mesh.position);
          const choices = grovePos.map((_, k) => k).filter((k) => k !== q.idx);
          q.idx = choices[Math.floor(Math.random() * choices.length)];
          q.mesh.position.copy(q.isShard ? GROVE[q.idx].n.clone().multiplyScalar(CFG.R + 1.2) : grovePos[q.idx]);
          orient(q.mesh, GROVE[q.idx].n);
          spawnFlash(q.mesh.position); q.cd = 0.8;
        }
        q.wasVisible = visible;
        if (q.isShard) { q.mesh.rotation.y += dt * 0.6; if (visible && player.pos.distanceTo(q.mesh.position) < 22) learn("quantum_grove"); }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fl = flashes[i]; fl.ttl -= dt;
        const k = fl.ttl / 0.5; fl.m.scale.setScalar(1 + (1 - k) * 3); fl.m.material.opacity = Math.max(0, k) * 0.85;
        if (fl.ttl <= 0) { scene.remove(fl.m); fl.m.material.dispose(); flashes.splice(i, 1); }
      }
      sky.position.copy(camera.position);

      // PNJ : se tournent vers le joueur quand il est proche (yeux = +Z), sinon idle ; bob respiratoire
      for (const n of npcMeshes) {
        const d = player.pos.distanceTo(n.worldPos);
        const up = n.normal;
        if (d < 12) {
          const toP = player.pos.clone().sub(n.worldPos);
          const flat = toP.sub(up.clone().multiplyScalar(toP.dot(up)));
          if (flat.lengthSq() > 1e-4) {
            // lookAt oriente -Z vers la cible → on vise l'opposé pour que +Z (les yeux) regarde le joueur
            const away = flat.clone().normalize().multiplyScalar(-1);
            const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), away, up);
            n.mesh.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 0.08);
          }
        } else {
          n.mesh.quaternion.slerp(n.baseQuat, 0.04);
        }
        n.mesh.position.copy(n.worldPos).addScaledVector(up, Math.sin(clock.elapsedTime * 1.5 + n.worldPos.x) * 0.03);
      }

      if (!dialogRef.current) {
        let near = null, best = CFG.INTERACT;
        for (const n of npcMeshes) { const d = player.pos.distanceTo(n.worldPos); if (d < best) { best = d; near = n; } }
        let wp = near ? `Parler à ${near.data.name} — [E]` : "";
        if (!wp && shipState.landed && player.pos.distanceTo(shipState.pos) < 6) wp = "Embarquer dans le vaisseau — [E]";
        if (hudRef.current.prompt !== wp) setHud((h) => ({ ...h, prompt: wp }));
      } else if (hudRef.current.prompt) setHud((h) => ({ ...h, prompt: "" }));
      } // fin sous-système joueur (!flying)

      if (clock.elapsedTime - lastHud > 0.5) {
        lastHud = clock.elapsedTime;
        const remain = Math.max(0, dur - loopTime);
        setHud((h) => ({ ...h, time: remain, warn: remain <= CFG.SUPERNOVA_WARN }));
        const go = Math.round(res.o2), gf = Math.round(res.fuel);
        if (gaugesRef.current.o2 !== go || gaugesRef.current.fuel !== gf) { gaugesRef.current = { o2: go, fuel: gf }; setGauges({ o2: go, fuel: gf }); }
        // minimap : lat/lon du joueur et du vaisseau (relatifs à Âtrebois)
        const toLL = (v) => { const n = v.clone().normalize(); return { lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * 180 / Math.PI, lon: Math.atan2(n.x, n.z) * 180 / Math.PI }; };
        const pll = toLL(player.pos), sll = toLL(shipState.pos);
        setMini({ pLat: pll.lat, pLon: pll.lon, sLat: sll.lat, sLon: sll.lon, flying: flyingRef.current });
      }

      // EVO-3 : listener audio = caméra ; bus monde fondu vers le silence en altitude
      if (ctx && ctx.listener) {
        const L = ctx.listener, cp = camera.position;
        camera.getWorldDirection(_lFwd);
        if (L.positionX) {
          L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z;
          L.forwardX.value = _lFwd.x; L.forwardY.value = _lFwd.y; L.forwardZ.value = _lFwd.z;
          L.upX.value = camera.up.x; L.upY.value = camera.up.y; L.upZ.value = camera.up.z;
        } else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(_lFwd.x, _lFwd.y, _lFwd.z, camera.up.x, camera.up.y, camera.up.z); }
      }
      if (ctx && ctx.listener) {
        const L = ctx.listener, cp = camera.position;
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        const up = camera.up;
        if (L.positionX) {
          L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z;
          L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
          L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
        } else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
      }
      if (occludables.length && clock.elapsedTime - lastOccl > 0.2) {
        lastOccl = clock.elapsedTime;
        const camDir = camera.position.clone().normalize(); // direction caméra depuis le centre d'Âtrebois
        for (const o of occludables) o.obj.visible = o.dir.dot(camDir) > -0.15; // marge horizon + relief
      }
      if (worldGain) {
        const actor = flyingRef.current ? shipState.pos : player.pos;
        const gAlt = 1 - THREE.MathUtils.smoothstep(actor.length() - CFG.R, 60, 140);
        worldGain.gain.value += (gAlt - worldGain.gain.value) * Math.min(1, dt * 3);
      }
      captureFrame(dt);
      composer.render();

      // --- PIP caméra de la sonde Scout (coin bas-gauche) ---
      if (scout.alive) {
        const W2 = renderer.domElement.width, H2 = renderer.domElement.height;
        const pr = renderer.getPixelRatio();
        const pw = Math.round(220 * pr), ph = Math.round(150 * pr);
        const px = Math.round(16 * pr), py = Math.round(120 * pr); // depuis le bas
        // la Matière Fantôme est rendue visible UNIQUEMENT pour la vue sonde
        const prevOpacity = gMat.opacity;
        const scoutSeesGhost = scout.mesh.position.distanceTo(ghostCenter) < 14;
        if (scoutSeesGhost) gMat.opacity = 0.95;
        scout.cam.aspect = pw / ph; scout.cam.updateProjectionMatrix();
        renderer.clearDepth();
        renderer.setScissorTest(true);
        renderer.setScissor(px, py, pw, ph);
        renderer.setViewport(px, py, pw, ph);
        renderer.render(scene, scout.cam);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, W2, H2);
        gMat.opacity = prevOpacity; // restaure (l'œil nu ne voit pas la matière)
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", onMouse); window.removeEventListener("click", dlgClick);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      if (crackleT) clearTimeout(crackleT);
      if (motifT) clearTimeout(motifT);
      if (motifT) clearTimeout(motifT);
      try { ambienceSrc?.stop(); musicSrc?.stop(); } catch (e) {}
      if (ctx) ctx.close();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    } catch (err) {
      console.error("[ÂTREBOIS] crash au setup :", err);
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;inset:0;z-index:9999;background:#1a0808;color:#ffd0d0;font:14px/1.6 monospace;padding:24px;overflow:auto;white-space:pre-wrap";
      const msg = (err && err.message) ? err.message : String(err);
      const stack = (err && err.stack) ? err.stack : "";
      d.textContent = "ÂTREBOIS — erreur d'initialisation\n\n>>> " + msg + "\n\n" + stack;
      mount.appendChild(d);
      return; // n'enchaîne pas
    }
  }, []);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // Séquence d'ouverture : réveil au feu de camp + texte d'intro, une seule fois
  // EVO-1 : réveil "paupières" — pilotage JS direct (aucun re-render)
  const eyelidTopRef = useRef(null), eyelidBottomRef = useRef(null);
  const playWake = () => {
    const a = eyelidTopRef.current, b = eyelidBottomRef.current;
    if (!a || !b) return;
    for (const el of [a, b]) { el.style.transition = "none"; el.style.transform = "translateY(0)"; }
    void a.offsetHeight; // force reflow (fermeture instantanée prise en compte)
    setTimeout(() => {
      for (const el of [a, b]) el.style.transition = "transform 1.5s cubic-bezier(.45,.05,.2,1)";
      a.style.transform = "translateY(-101%)";
      b.style.transform = "translateY(101%)";
    }, 250);
  };

  const beginGame = () => {
    setStarted(true);
    goFullscreen();   // EVO-7 : passe en plein écran (geste utilisateur requis ; ignoré si non supporté, ex. iPhone)
    playWake(); // réveil au feu de camp : battement de paupières
    // textes successifs
    setTimeout(() => setIntroText("Aujourd'hui, c'est ton premier vol solo."), 700);
    setTimeout(() => setIntroText("Outer Wilds Ventures — programme d'exploration"), 3200);
    setTimeout(() => setIntroText(null), 5600);
  };
  // EVO-7 : plein écran navigateur (avec fallbacks vendeurs). À déclencher depuis un geste utilisateur.
  const goFullscreen = () => {
    const el = rootRef.current || (typeof document !== "undefined" ? document.documentElement : null);
    if (!el || (typeof document !== "undefined" && document.fullscreenElement)) return;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) { try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  };
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { ex.call(document); } catch (e) {} }
    } else goFullscreen();
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100vh", background: "#000", overflow: "hidden", userSelect: "none", fontFamily: "system-ui, sans-serif" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {/* Overlay de fondu (mort / supernova) — piloté en JS, opacité 0 par défaut */}
      <div ref={overlayRef} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", opacity: 0, pointerEvents: "none", transition: "none" }} />
      {/* EVO-1 : paupières (réveil) — fermées par translateY(0), ouvertes hors écran */}
      <div ref={eyelidTopRef} style={{ position: "absolute", left: 0, right: 0, top: 0, height: "51%", background: "#000", transform: "translateY(-101%)", pointerEvents: "none", zIndex: 40 }} />
      <div ref={eyelidBottomRef} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "51%", background: "#000", transform: "translateY(101%)", pointerEvents: "none", zIndex: 40 }} />
      {introText && (
        <div style={{ position: "absolute", left: "50%", top: "62%", transform: "translateX(-50%)", color: "#fde68a", fontSize: 22, fontWeight: 300, letterSpacing: 1, textAlign: "center", textShadow: "0 2px 12px rgba(0,0,0,.9)", pointerEvents: "none", animation: "thFadeIn 1s ease" }}>
          {introText}
        </div>
      )}
      {dbgRec && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 13, padding: "3px 12px", borderRadius: 6, background: "rgba(60,0,0,.6)", color: "#fca5a5", display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "thBlink 1s steps(2) infinite" }} />
          REC debug — [L] pour stopper &amp; télécharger
        </div>
      )}
      <style>{`@keyframes thBlink{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}@keyframes thFadeIn{from{opacity:0}to{opacity:1}}`}</style>
      {scoutActive && started && (
        <div style={{ position: "absolute", left: 16, bottom: 120, width: 220, height: 150, border: "2px solid rgba(255,170,51,.7)", borderRadius: 4, boxShadow: "0 0 12px rgba(0,0,0,.6)", pointerEvents: "none", boxSizing: "content-box" }}>
          <div style={{ position: "absolute", top: -20, left: 0, fontFamily: "monospace", fontSize: 11, color: "#ffaa33" }}>● SCOUT — caméra sonde</div>
          {/* réticule du PIP */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 10, height: 10, border: "1px solid rgba(255,170,51,.5)", borderRadius: "50%" }} />
        </div>
      )}
      {started && (
        <div style={{ position: "absolute", bottom: 16, right: 16, width: 190, fontFamily: "monospace", fontSize: 11, color: "#cbd5e1", background: "rgba(0,0,0,.4)", padding: "8px 10px", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>O₂</span><span>{gauges.o2}%</span></div>
          <div style={{ width: "100%", height: 7, background: "rgba(255,255,255,.12)", borderRadius: 4, margin: "3px 0 8px", overflow: "hidden" }}>
            <div style={{ width: `${gauges.o2}%`, height: "100%", background: gauges.o2 > 25 ? "#34d399" : "#ef4444", transition: "width .25s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Carburant</span><span>{gauges.fuel}%</span></div>
          <div style={{ width: "100%", height: 7, background: "rgba(255,255,255,.12)", borderRadius: 4, marginTop: 3, overflow: "hidden" }}>
            <div style={{ width: `${gauges.fuel}%`, height: "100%", background: gauges.fuel > 20 ? "#fbbf24" : "#ef4444", transition: "width .25s" }} />
          </div>
        </div>
      )}
      {started && (() => {
        const d2r = Math.PI / 180, cx = 42, cy = 42, rad = 36;
        const toXYZ = (lat, lon) => [Math.cos(lat * d2r) * Math.sin(lon * d2r), Math.sin(lat * d2r), Math.cos(lat * d2r) * Math.cos(lon * d2r)];
        const p = toXYZ(mini.pLat, mini.pLon);
        const north = [0, 1, 0];
        let ex = [north[1] * p[2] - north[2] * p[1], north[2] * p[0] - north[0] * p[2], north[0] * p[1] - north[1] * p[0]];
        let exl = Math.hypot(ex[0], ex[1], ex[2]) || 1; ex = ex.map((v) => v / exl);
        const ey = [p[1] * ex[2] - p[2] * ex[1], p[2] * ex[0] - p[0] * ex[2], p[0] * ex[1] - p[1] * ex[0]];
        const proj = (lat, lon) => { const v = toXYZ(lat, lon); const z = v[0] * p[0] + v[1] * p[1] + v[2] * p[2]; const x = v[0] * ex[0] + v[1] * ex[1] + v[2] * ex[2]; const y = v[0] * ey[0] + v[1] * ey[1] + v[2] * ey[2]; return { x: cx + x * rad, y: cy - y * rad, front: z >= -0.05 }; };
        const shipP = proj(mini.sLat, mini.sLon);
        const grid = [];
        for (let lo = -150; lo <= 180; lo += 30) { const pts = []; for (let la = -80; la <= 80; la += 20) { const q = proj(la, lo); if (q.front) pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); } if (pts.length > 1) grid.push(<polyline key={"m" + lo} points={pts.join(" ")} fill="none" stroke="rgba(120,180,220,.25)" strokeWidth="0.5" />); }
        for (let la = -60; la <= 60; la += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 20) { const q = proj(la, lo); if (q.front) pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); } if (pts.length > 1) grid.push(<polyline key={"p" + la} points={pts.join(" ")} fill="none" stroke="rgba(120,180,220,.2)" strokeWidth="0.5" />); }
        return (
          <div style={{ position: "absolute", top: 56, left: 16, width: 84, height: 96 }}>
            <svg viewBox="0 0 84 84" style={{ width: 84, height: 84 }}>
              <circle cx={cx} cy={cy} r={rad} fill="rgba(10,25,40,.6)" stroke="rgba(120,180,220,.5)" strokeWidth="1" />
              {grid}
              {shipP.front && <g><circle cx={shipP.x} cy={shipP.y} r="3" fill="#ff9030" /><circle cx={shipP.x} cy={shipP.y} r="5" fill="none" stroke="#ff9030" strokeWidth="0.6" /></g>}
              <g><circle cx={cx} cy={cy} r="2.4" fill={mini.flying ? "#7dd3fc" : "#fde68a"} /><circle cx={cx} cy={cy} r="4.5" fill="none" stroke={mini.flying ? "#7dd3fc" : "#fde68a"} strokeWidth="0.8" /></g>
            </svg>
            <div style={{ textAlign: "center", fontSize: 8, fontFamily: "monospace", color: "#7dd3fc" }}>● vous <span style={{ color: "#ff9030" }}>● vaisseau</span></div>
          </div>
        );
      })()}
      <div style={{ position: "absolute", top: 16, left: 16, fontFamily: "monospace", fontSize: 18, padding: "4px 12px", borderRadius: 6, background: "rgba(0,0,0,.4)", color: hud.warn ? "#f87171" : "#fde68a" }}>
        ☀ Supernova dans {fmt(hud.time)} <span style={{ marginLeft: 12, fontSize: 12, color: "#94a3b8" }}>Boucle #{hud.loops + 1} · ☠ {deaths}</span>
      </div>
      {repair && started && (
        <div style={{ position: "absolute", left: "50%", top: "calc(50% + 40px)", transform: "translateX(-50%)", textAlign: "center", color: "#bfdbfe", fontFamily: "monospace", fontSize: 13, pointerEvents: "none" }}>
          {repair.active ? (
            <>
              <div>Réparation en cours… maintiens [E]</div>
              <div style={{ width: 180, height: 8, background: "rgba(125,211,252,.15)", borderRadius: 4, margin: "6px auto 0", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(repair.pct * 100)}%`, height: "100%", background: "#34d399", transition: "width .08s" }} />
              </div>
            </>
          ) : (
            <div>Module défectueux — maintiens [E] pour réparer</div>
          )}
        </div>
      )}
      {zeroG && started && (
        <div style={{ position: "absolute", top: 56, left: 16, fontFamily: "monospace", fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "rgba(48,96,160,.45)", color: "#bfdbfe" }}>
          ✦ APESANTEUR — ZQSD/WASD = poussée · Espace/Maj = monter/descendre
        </div>
      )}
      <button onClick={() => setFast((f) => !f)} style={{ position: "absolute", top: 16, right: 16, fontSize: 12, padding: "4px 12px", borderRadius: 6, background: "rgba(30,41,59,.7)", color: "#e2e8f0", border: "none", cursor: "pointer" }}>
        Vitesse boucle : {fast ? "×10 (test)" : "×1"}
      </button>
      {!dialog && started && !showLog && <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", color: "rgba(255,255,255,.6)", fontSize: 20, pointerEvents: "none" }}>+</div>}
      {hud.prompt && !dialog && (
        <div
          onTouchStart={isTouch ? (e) => { e.preventDefault(); e.stopPropagation(); touchApiRef.current?.hold("KeyE", true); touchApiRef.current?.tap("interact"); } : undefined}
          onTouchEnd={isTouch ? (e) => { e.preventDefault(); e.stopPropagation(); touchApiRef.current?.hold("KeyE", false); } : undefined}
          style={{ position: "absolute", left: "50%", bottom: isTouch ? 200 : 112, transform: "translateX(-50%)", background: isTouch ? "rgba(252,211,77,.18)" : "rgba(0,0,0,.55)", color: "#fef3c7", padding: isTouch ? "12px 20px" : "8px 16px", borderRadius: 10, fontSize: 14, border: isTouch ? "1px solid rgba(252,211,77,.6)" : "none", pointerEvents: isTouch ? "auto" : "none", touchAction: "none" }}>
          {hud.prompt}{isTouch ? "  ▸" : ""}
        </div>
      )}
      {flying && started && gauges.fuel <= 0 && (
        <div style={{ position: "absolute", left: "50%", top: 96, transform: "translateX(-50%)", background: "rgba(60,10,10,.8)", color: "#fca5a5", padding: "6px 16px", borderRadius: 8, fontSize: 14, fontFamily: "monospace", pointerEvents: "none" }}>
          ⚠ CARBURANT ÉPUISÉ — dérive balistique
        </div>
      )}
      {flying && started && !isTouch && (
        <div style={{ position: "absolute", bottom: 12, left: 16, fontSize: 12, color: "rgba(191,219,254,.85)", fontFamily: "monospace" }}>
          ✈ PILOTAGE — ZQSD/WASD poussée · Espace/Maj haut/bas · Souris orientation · ←/→ roulis · <b>[G]</b> alunissage auto (astre verrouillé / proche) · <b>[T]</b> verrouiller · <b>[Y]</b> pilote auto · <b>[R]</b> sortir
        </div>
      )}
      {/* EVO-6 : message éphémère de verrouillage (~10 s) — tappable sur tactile (verrouiller / pilote auto) */}
      {flying && started && lockMsg && (() => {
        const act = lockMsg.includes("verrouiller") ? "lock" : (lockMsg.includes("pilote auto") ? "auto" : null);
        const tappable = isTouch && act;
        return (
          <div
            onTouchStart={tappable ? (e) => { e.preventDefault(); e.stopPropagation(); touchApiRef.current?.tap(act); } : undefined}
            style={{ position: "absolute", top: "26%", left: "50%", transform: "translateX(-50%)", fontFamily: "monospace", fontSize: 14, color: "#fcd34d", background: tappable ? "rgba(251,191,36,.18)" : "rgba(8,20,32,.6)", border: "1px solid rgba(251,191,36,.5)", borderRadius: 8, padding: tappable ? "10px 16px" : "6px 14px", textShadow: "0 0 6px #000", pointerEvents: tappable ? "auto" : "none", touchAction: "none" }}>
            {lockMsg}{tappable ? "  ▸" : ""}
          </div>
        );
      })()}
      {flying && started && flyHud.auto && (
        <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)", fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#34d399", textShadow: "0 0 8px rgba(0,0,0,.8)" }}>
          ⤓ ALUNISSAGE AUTOMATIQUE
        </div>
      )}
      {flying && started && gauges.fuel <= 0 && (
        <div style={{ position: "absolute", top: "34%", left: "50%", transform: "translateX(-50%)", fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#ef4444", textShadow: "0 0 8px rgba(0,0,0,.8)" }}>
          ⚠ CARBURANT ÉPUISÉ — dérive balistique
        </div>
      )}
      {/* HUD cockpit : instruments + reticule + alerte */}
      {flying && started && (
        <>
          {/* réticule central */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 46, height: 46, border: "1px solid rgba(125,211,252,.6)", borderRadius: "50%", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 4, height: 4, background: "#7dd3fc", borderRadius: "50%", transform: "translate(-50%,-50%)" }} />
          </div>
          {/* panneau instruments bas-centre */}
          <div style={{ position: "absolute", bottom: 44, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 18, fontFamily: "monospace", fontSize: 13, color: "#bfdbfe", background: "rgba(8,20,32,.55)", border: "1px solid rgba(125,211,252,.25)", borderRadius: 8, padding: "8px 18px" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, opacity: .6 }}>ALT</div><div>{flyHud.alt} u</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, opacity: .6 }}>VITESSE</div><div>{flyHud.spd} u/s</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, opacity: .6 }}>VERT</div><div style={{ color: flyHud.vspd < -10 ? "#f87171" : "#bfdbfe" }}>{flyHud.vspd > 0 ? "▲" : "▼"} {Math.abs(flyHud.vspd)}</div></div>
          </div>
          {/* alerte d'approche */}
          {flyHud.danger && (
            <div style={{ position: "absolute", top: "32%", left: "50%", transform: "translateX(-50%)", fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "#fca5a5", textShadow: "0 0 8px rgba(0,0,0,.8)", animation: "thBlink .6s steps(2) infinite" }}>
              ⚠ APPROCHE RAPIDE — RALENTIR
            </div>
          )}
          {/* EVO-6 : instrumentation de l'astre verrouillé (distance/vitesse relatives + vecteur de dérive) */}
          {flyTgt.locked && (
            <>
              {/* marqueur de l'astre (si devant la caméra) */}
              {flyTgt.inFront && (
                <div style={{ position: "absolute", left: `${flyTgt.mx}%`, top: `${flyTgt.my}%`, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                  <div style={{ width: 28, height: 28, border: `2px solid ${flyTgt.auto ? "#fbbf24" : "#34d399"}`, borderRadius: 4, boxShadow: "0 0 6px rgba(0,0,0,.6)" }} />
                  <div style={{ position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", whiteSpace: "nowrap", marginTop: 3, fontFamily: "monospace", fontSize: 11, color: flyTgt.auto ? "#fbbf24" : "#34d399", textShadow: "0 0 4px #000" }}>
                    🔒 {flyTgt.name} · {flyTgt.dist} u{flyTgt.auto ? " · AUTO" : ""}
                  </div>
                </div>
              )}
              {/* lectures numériques (à droite du réticule) */}
              <div style={{ position: "absolute", left: "calc(50% + 36px)", top: "50%", transform: "translateY(-50%)", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, textShadow: "0 0 4px #000", pointerEvents: "none" }}>
                <div style={{ color: "#bfdbfe" }}>DIST <b>{flyTgt.dist}</b> u</div>
                <div style={{ color: "#bfdbfe" }}>V.REL <b>{flyTgt.relSpd}</b> u/s</div>
                <div style={{ color: flyTgt.approaching ? "#34d399" : "#f87171" }}>{flyTgt.approaching ? "▲ RAPPR" : "▼ ÉLOIGNE"} <b>{Math.abs(flyTgt.closing)}</b> u/s</div>
              </div>
              {/* flèche-vecteur de dérive (vitesse relative projetée écran ; vert = rapprochement, rouge = éloignement) */}
              {flyTgt.arrLen > 6 && (
                <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none" }}>
                  <div style={{ position: "absolute", height: 2, width: flyTgt.arrLen, background: flyTgt.approaching ? "#34d399" : "#f87171", transformOrigin: "0 50%", transform: `rotate(${flyTgt.arrDeg}deg)`, boxShadow: "0 0 4px #000" }}>
                    <div style={{ position: "absolute", right: -1, top: -3, width: 0, height: 0, borderLeft: `8px solid ${flyTgt.approaching ? "#34d399" : "#f87171"}`, borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }} />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {started && !dialog && !flying && !isTouch && <div style={{ position: "absolute", bottom: 12, left: 16, fontSize: 12, color: "rgba(226,232,240,.5)" }}>[F] sonde Scout · [C] Signalscope · [Tab] Journal de bord</div>}
      {/* EVO-7 : commandes tactiles — deux pads (DÉPLACER / REGARDER) + boutons au-dessus, hors menus/dialogues */}
      {isTouch && started && !dialog && !showLog && !showRemap && (
        <>
          <TouchPad side="left" color="rgba(125,211,252,.45)" label="DÉPLACER" api={touchApiRef} onVec={(x, y) => touchApiRef.current?.move(x, y)} />
          <TouchPad side="right" color="rgba(251,191,36,.5)" label="REGARDER" api={touchApiRef} onVec={(x, y) => touchApiRef.current?.look2(x, y)} />
          {/* bouton plein écran */}
          <div onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); }}
            style={{ position: "absolute", top: 92, right: 12, width: 40, height: 40, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#cbd5e1", background: "rgba(8,20,32,.55)", border: "1px solid rgba(125,211,252,.35)", pointerEvents: "auto", touchAction: "none" }}>⛶</div>
          {/* colonne gauche (au-dessus du pad de déplacement) : poussée verticale / saut */}
          <div style={{ position: "absolute", left: 16, bottom: 168, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
            {flying ? (<>
              <TouchBtn label="MONT" color="#7dd3fc" onDown={() => touchApiRef.current?.hold("Space", true)} onUp={() => touchApiRef.current?.hold("Space", false)} />
              <TouchBtn label="DESC" color="#7dd3fc" onDown={() => touchApiRef.current?.hold("ShiftLeft", true)} onUp={() => touchApiRef.current?.hold("ShiftLeft", false)} />
            </>) : (<>
              <TouchBtn label="SAUT" color="#7dd3fc" onDown={() => touchApiRef.current?.hold("Space", true)} onUp={() => touchApiRef.current?.hold("Space", false)} />
              <TouchToggle label="COUR" color="rgba(125,211,252,.5)" code="ShiftLeft" api={touchApiRef} />
            </>)}
          </div>
          {/* colonne droite (au-dessus du pad de visée) : actions */}
          <div style={{ position: "absolute", right: 16, bottom: 168, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", pointerEvents: "none" }}>
            {flying ? (<>
              <TouchBtn label="ALUN" color="#34d399" onDown={() => touchApiRef.current?.hold("KeyG", true)} onUp={() => touchApiRef.current?.hold("KeyG", false)} />
              <TouchBtn label="AUTO" color="#fbbf24" onDown={() => touchApiRef.current?.tap("auto")} />
              <TiltToggle api={touchApiRef} />
              <TouchBtn label="SORT" onDown={() => touchApiRef.current?.tap("exit")} />
              <TouchBtn label="≡" onDown={() => touchApiRef.current?.tap("log")} />
            </>) : (<>
              <TouchBtn label="E" color="#fcd34d" onDown={() => touchApiRef.current?.tap("interact")} />
              <TouchBtn label="F" onDown={() => touchApiRef.current?.tap("scout")} />
              <TouchBtn label="C" onDown={() => touchApiRef.current?.tap("scope")} />
              <TiltToggle api={touchApiRef} />
              <TouchBtn label="≡" onDown={() => touchApiRef.current?.tap("log")} />
            </>)}
          </div>
        </>
      )}
      {/* Signalscope : vignette + barre de force du signal */}
      {scope && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 200px 120px rgba(0,0,0,.85)", border: "2px solid rgba(125,211,252,.25)" }}>
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 90, height: 90, border: "1px solid rgba(125,211,252,.5)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", left: "50%", top: "calc(50% + 70px)", transform: "translateX(-50%)", textAlign: "center", color: "#7dd3fc", fontFamily: "monospace", fontSize: 12 }}>
            <div>SIGNALSCOPE — fréquence OWV</div>
            <div style={{ width: 200, height: 8, background: "rgba(125,211,252,.15)", borderRadius: 4, margin: "6px auto 0", overflow: "hidden" }}>
              <div style={{ width: `${Math.round(sig * 100)}%`, height: "100%", background: sig > 0.75 ? "#34d399" : "#7dd3fc", transition: "width .1s" }} />
            </div>
            <div style={{ marginTop: 4, color: sig > 0.75 ? "#34d399" : "#64748b" }}>{sig > 0.75 ? "♪ signal verrouillé — harmonica" : "balaie l'horizon…"}</div>
          </div>
        </div>
      )}
      {dialog && (
        <div style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", width: "min(680px,90vw)", background: "rgba(0,0,0,.8)", border: "1px solid rgba(180,120,40,.5)", borderRadius: 12, padding: 20, color: "#fffbeb" }}>
          <div style={{ color: "#fcd34d", fontWeight: 600, marginBottom: 4 }}>{dialog.name}</div>
          <div style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>{dialog.line}</div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>[E] ou clic pour continuer · {dialog.idx}/{dialog.total}</div>
        </div>
      )}
      {/* Journal de bord (Ship Log) — connaissances persistées en localStorage */}
      {showLog && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(860px,94vw)", height: "min(620px,86vh)", background: "rgba(8,15,26,.95)", border: "1px solid rgba(80,140,200,.4)", borderRadius: 12, padding: 16, color: "#e2e8f0", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: 18 }}>Journal de bord</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{log.length} / {Object.keys(LOG_NODES).length} indices · [Tab] fermer</div>
          </div>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {/* arêtes */}
              {LOG_EDGES.map(([a, b], i) => {
                const na = LOG_NODES[a], nb = LOG_NODES[b]; if (!na || !nb) return null;
                const known = log.includes(a) && log.includes(b);
                const hint = (log.includes(a) && LOG_NODES[b].rumor) || (log.includes(b) && LOG_NODES[a].rumor);
                if (!known && !hint) return null;
                return <line key={i} x1={na.x * 100} y1={na.y * 100} x2={nb.x * 100} y2={nb.y * 100}
                  stroke={known ? "rgba(125,211,252,.55)" : "rgba(125,211,252,.18)"} strokeWidth="0.3" strokeDasharray={known ? "0" : "1.2 1.2"} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            {/* nœuds (HTML positionné en %) */}
            {Object.entries(LOG_NODES).map(([id, n]) => {
              const known = log.includes(id);
              // un "rumor" non connu reste visible en silhouette s'il est relié à un nœud connu
              const hinted = !known && n.rumor && LOG_EDGES.some(([a, b]) => (a === id && log.includes(b)) || (b === id && log.includes(a)));
              if (!known && !hinted) return null;
              const sel = logSel === id;
              return (
                <div key={id} onClick={() => known && setLogSel(sel ? null : id)}
                  style={{ position: "absolute", left: `${n.x * 100}%`, top: `${n.y * 100}%`, transform: "translate(-50%,-50%)",
                    cursor: known ? "pointer" : "default", textAlign: "center", width: 92, pointerEvents: "auto" }}>
                  <div style={{ width: 16, height: 16, margin: "0 auto", borderRadius: "50%",
                    background: known ? n.color : "transparent", border: `2px solid ${known ? "#fff" : "rgba(148,163,184,.5)"}`,
                    boxShadow: sel ? `0 0 0 3px ${n.color}` : (known ? `0 0 8px ${n.color}` : "none"), opacity: known ? 1 : 0.5 }} />
                  <div style={{ fontSize: 9, marginTop: 2, color: known ? "#e2e8f0" : "#64748b", lineHeight: 1.1, fontFamily: "system-ui" }}>
                    {known ? n.short : "???"}
                  </div>
                </div>
              );
            })}
          </div>
          {/* détail du nœud sélectionné */}
          <div style={{ minHeight: 52, marginTop: 8, padding: "8px 12px", background: "rgba(0,0,0,.3)", borderRadius: 8, fontSize: 13 }}>
            {logSel && LOG_NODES[logSel] ? (
              <><div style={{ color: LOG_NODES[logSel].color, fontWeight: 600, marginBottom: 2 }}>{LOG_NODES[logSel].label}</div>
                <div style={{ color: "#cbd5e1" }}>{LOG_NODES[logSel].text}</div></>
            ) : (
              <div style={{ color: "#64748b" }}>Clique un nœud pour le détail. Les silhouettes « ??? » sont des indices à découvrir. Connaissances conservées entre boucles (localStorage).</div>
            )}
          </div>
        </div>
      )}
      {/* EVO-5 — Menu de remappage manette / joystick (touche M) */}
      {showRemap && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(640px,94vw)", maxHeight: "88vh", overflowY: "auto", background: "rgba(8,15,26,.96)", border: "1px solid rgba(80,140,200,.4)", borderRadius: 12, padding: 18, color: "#e2e8f0", fontFamily: "system-ui" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: 18 }}>Manette / Joystick — remappage</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>[M] fermer</div>
          </div>
          <div style={{ fontSize: 13, marginBottom: 10, color: padInfo.connected ? "#34d399" : "#f87171" }}>
            {padInfo.connected ? "● Détecté : " + padInfo.id : "○ Aucune manette détectée — branche le périphérique puis appuie sur un bouton."}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            Clique « Régler » puis actionne le bouton ou l'axe voulu sur ta manette. (Axes pour Tangage/Lacet/Roulis ; boutons pour le reste.)
          </div>
          {[["Axes de pilotage", PAD_AXES], ["Poussée & vol (maintien)", PAD_HOLD], ["Actions (impulsion)", PAD_EDGE]].map(([title, list]) => (
            <div key={title} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 }}>{title}</div>
              {list.map((a) => {
                const isListening = listening === a.id;
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: 6, background: isListening ? "rgba(245,158,11,.18)" : "rgba(255,255,255,.03)", marginBottom: 3 }}>
                    <span style={{ fontSize: 14 }}>{a.label}{a.code ? <span style={{ color: "#475569", fontSize: 11 }}> · clavier {a.code.replace("Key", "").replace("Left", "")}</span> : null}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#fcd34d", minWidth: 70, textAlign: "right" }}>
                        {isListening ? "actionne…" : bindLabel(padBinds[a.id])}
                      </span>
                      <button onClick={() => { listeningRef.current = a.id; setListening(a.id); }}
                        style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(125,211,252,.4)", background: "rgba(125,211,252,.1)", color: "#e2e8f0", cursor: "pointer" }}>
                        {isListening ? "…" : "Régler"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={() => { listeningRef.current = null; setListening(null); saveBinds({ ...DEFAULT_BINDS }); setPadBinds({ ...DEFAULT_BINDS }); }}
              style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>
              Réinitialiser (défauts T16000M)
            </button>
            <button onClick={() => { setShowRemap(false); setListening(null); listeningRef.current = null; }}
              style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "none", background: "rgba(245,158,11,.9)", color: "#000", fontWeight: 600, cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {!started && (
        <div onClick={beginGame} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, cursor: "pointer", background: "linear-gradient(#0b1e26,#174e7d)" }}>
          <h1 style={{ color: "#fde68a", fontSize: 40, fontWeight: 700, margin: "0 0 8px", letterSpacing: 2 }}>ÂTREBOIS</h1>
          <p style={{ color: "#cbd5e1", margin: "0 0 4px" }}>Outer Wilds Ventures — premier vol solo</p>
          <p style={{ color: "#94a3b8", fontSize: 14, maxWidth: 420, margin: "0 0 24px" }}>Hommage non-commercial · three r178 / WebGL2. Planète sphérique à gravité radiale, villageois, boucle 22 min.</p>
          <p style={{ color: "#cbd5e1", fontSize: 14, maxWidth: 460, margin: "0 0 24px" }}><b>ZQSD/WASD</b> bouger · <b>Souris</b> regarder · <b>Maj</b> courir · <b>Espace</b> sauter · <b>E</b> parler · <b>F</b> sonde Scout · <b>C</b> Signalscope · <b>Tab</b> journal · <b>M</b> manette/joystick · <b>L</b> debug</p>
          <div style={{ padding: "12px 24px", background: "rgba(245,158,11,.9)", color: "#000", fontWeight: 600, borderRadius: 8 }}>Cliquer pour démarrer (puis cliquer pour verrouiller la souris)</div>
        </div>
      )}
    </div>
  );
}
