# Contribuer

Projet personnel, mais les retours et correctifs sont bienvenus.

## Mise en route

```bash
npm install
npm run dev      # http://localhost:5174/
```

## Avant de proposer une modification

1. `npm run check` doit passer (bundle + analyse de portée + blocs vitaux).
2. Tester en conditions réelles : déplacement, vol, atterrissage (`G`), Puits, dialogues, boucle complète.
3. Conserver le **cadre non-commercial** : aucun asset/texte/audio extrait d'Outer Wilds (voir `NOTICE.md`).
4. Décrire le changement dans `CHANGELOG.md` (section *Non publié*).

## Style

- Le moteur vit dans `src/TimberHearth.jsx`. Les éditions doivent rester **ciblées** : une modification mal
  délimitée peut supprimer un bloc sans erreur de syntaxe — d'où `npm run check` et sa liste de blocs vitaux.
- Indentation 2 espaces, fins de ligne LF (voir `.editorconfig`).
- Déterminisme dans les chemins de rendu : éviter `Math.random()` au profit de valeurs reproductibles.
