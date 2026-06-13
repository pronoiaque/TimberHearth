# Assets (optionnels)

Le jeu tourne **sans aucun fichier ici** : tout a un *fallback* procédural.
Déposez vos propres ressources **CC0** pour enrichir le rendu. Noms attendus (voir `ASSETS` dans `src/TimberHearth.jsx`) :

| Fichier                    | Rôle                         | Fallback si absent                         |
|----------------------------|------------------------------|--------------------------------------------|
| `tree.glb`                 | Modèle d'arbre               | Arbres procéduraux (tronc + cône instanciés) |
| `ground_grass.jpg`         | Texture de sol herbeux       | Couleur unie + vertex colors par altitude   |
| `bark.jpg`                 | Texture d'écorce             | Couleur unie                               |
| `ambience_night.mp3`       | Ambiance sonore              | Vent brown-noise synthétisé                 |
| `campfire_folk_cc0.mp3`    | Musique d'ambiance           | Motif corde pincée procédural (Karplus-Strong) |

Sources CC0 recommandées : **Kenney**, **Quaternius**, **ambientCG**, **Poly Haven**, **Freesound (filtre CC0)**.

> ⚠️ N'ajoutez **jamais** d'assets extraits d'Outer Wilds (audio, modèles, textures). Voir `NOTICE.md`.
