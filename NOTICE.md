# NOTICE

## Cadre

**Âtrebois / TimberHearth** est un **projet personnel, non commercial**, réalisé par admiration
pour **Outer Wilds**.

> **Outer Wilds** © **Mobius Digital** / **Annapurna Interactive**.
> Ce dépôt n'est ni affilié, ni approuvé, ni sponsorisé par Mobius Digital ou Annapurna Interactive.

Ce projet **ne contient ni ne reproduit** :

- la **bande-son originale** d'Outer Wilds (toute la musique du jeu est **synthétisée de façon procédurale** —
  voir la synthèse Karplus-Strong et le motif original en pentatonique dans `src/TimberHearth.jsx`) ;
- les **textes / dialogues** originaux du jeu (tous les dialogues, poèmes et noms de ce projet sont **inédits**) ;
- les **modèles 3D, textures ou assets** extraits ou dérivés du jeu.

Les mécaniques (boucle temporelle, exploration d'astres, sonde, Signalscope, journal d'enquête…)
sont **inspirées** de l'expérience Outer Wilds ; leur **implémentation est entièrement originale**.

## Code

Le code de ce dépôt est distribué sous licence **MIT** (voir `LICENSE`).

## Assets self-hébergés (optionnels)

Le jeu fonctionne **sans aucun asset externe** : chaque ressource a un **fallback procédural**
(géométries, textures unies, audio synthétisé). Si vous déposez vos propres fichiers dans
`public/assets/` (voir `public/assets/README.md`), veillez à n'utiliser que des ressources dont
la licence vous y autorise — idéalement **CC0** (ex. Kenney, Quaternius, ambientCG, Poly Haven,
Freesound CC0). **N'ajoutez jamais** d'assets extraits d'Outer Wilds.
