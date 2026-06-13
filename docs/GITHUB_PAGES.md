# 🌐 Mettre Âtrebois en ligne avec GitHub Pages

Guide pas à pas pour publier le jeu sur `https://pronoiaque.github.io/TimberHearth/`.
Le dépôt est déjà configuré (workflow + base Vite) : il reste **3 réglages** à faire une seule fois.

---

## Ce qui est déjà prêt dans le dépôt

| Élément | Rôle |
|---|---|
| `.github/workflows/deploy.yml` | Build + déploiement automatique à chaque push sur `main`. |
| `vite.config.js` | Base `/TimberHearth/` en mode Pages (`GHPAGES=1`), `./` en local. |
| Fallback `404.html` | Généré par le workflow (évite les 404 au rechargement). |

Tu **n'as pas** besoin de builder ni de pousser un dossier `dist/` à la main : le workflow s'en charge.

---

## Étape 1 — Pousser le dépôt sur GitHub

Depuis le dossier du projet :

```bash
git init
git add .
git commit -m "Âtrebois — mise en ligne GitHub Pages"
git branch -M main
git remote add origin https://github.com/pronoiaque/TimberHearth.git
git push -u origin main
```

> Le dépôt distant doit s'appeler **`TimberHearth`** (voir Étape 3 si ce n'est pas le cas).

## Étape 2 — Activer Pages avec la source « GitHub Actions »

Sur la page du dépôt GitHub :

1. **Settings** (Paramètres) → **Pages** (menu de gauche).
2. Section **Build and deployment** → **Source** : choisir **`GitHub Actions`**.
   *(⚠️ surtout pas « Deploy from a branch » : le workflow ne prendrait pas la main.)*
3. C'est tout — rien d'autre à configurer ici.

## Étape 3 — (si besoin) Adapter le nom du dépôt

Pages sert le site sous `https://<utilisateur>.github.io/<nom-du-dépôt>/`. La base Vite doit correspondre.

- **Dépôt nommé `TimberHearth`** → rien à faire (valeur par défaut).
- **Dépôt nommé autrement** (ex. `atrebois`) → éditer `vite.config.js` :
  ```js
  const base = process.env.GHPAGES ? "/atrebois/" : "./";
  ```
  puis commit + push.
- **Dépôt « utilisateur » `pronoiaque.github.io`** (site racine) → mettre :
  ```js
  const base = process.env.GHPAGES ? "/" : "./";
  ```

---

## Lancer / suivre le déploiement

- Le déploiement part **automatiquement** à chaque `git push` sur `main`.
- Pour le lancer à la main : onglet **Actions** → workflow **« Deploy to GitHub Pages »** → **Run workflow**.
- Suivre l'avancement dans **Actions** (build ~1–2 min). Une fois le job `deploy` au vert, l'URL publique
  s'affiche dans **Settings → Pages** et dans le résumé du run.

**URL finale :** https://pronoiaque.github.io/TimberHearth/

---

## Vérifier en local avant de pousser (optionnel)

Reproduire exactement le build de Pages :

```bash
npm ci
npm run check                 # bundle + portée + blocs vitaux
GHPAGES=1 npm run build       # build avec la base /TimberHearth/
npm run preview               # http://localhost:4173/ (ou le port affiché)
```

Dans `dist/index.html`, les liens doivent commencer par `/TimberHearth/assets/...`.

---

## Dépannage

| Symptôme | Cause probable | Correctif |
|---|---|---|
| **Page blanche**, console : 404 sur `/assets/...` | La base ne correspond pas au nom du dépôt | Aligner `base` dans `vite.config.js` (Étape 3) puis push |
| Le workflow ne se déclenche pas | Source Pages mal réglée | Settings → Pages → Source = **GitHub Actions** |
| `Error: Pages site not found` dans Actions | Pages jamais activé | Faire l'Étape 2, relancer le workflow |
| 404 au **rechargement** d'une sous-page | Pas de fallback | Déjà géré (le workflow copie `index.html` → `404.html`) |
| Build qui échoue sur `npm run check` | Régression de code (variable/bloc) | Lire le rapport du run ; corriger ; re-push |
| Ancienne version servie | Cache navigateur / CDN Pages | Recharger sans cache (Ctrl/Cmd+Shift+R), attendre ~1 min |

---

## Comment ça marche (résumé)

À chaque push sur `main`, le workflow `deploy.yml` : installe les dépendances → lance `npm run check` →
`npm run build` avec `GHPAGES=1` (base `/TimberHearth/`) → copie `index.html` en `404.html` →
publie le dossier `dist/` sur l'environnement **github-pages**. Aucune branche `gh-pages` n'est nécessaire :
le déploiement passe par les actions officielles `upload-pages-artifact` + `deploy-pages`.
