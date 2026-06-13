import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base du site :
// - GitHub Pages sert le projet sous https://<user>.github.io/TimberHearth/ → base "/TimberHearth/"
//   (activée par la variable d'env GHPAGES=1, posée par le workflow .github/workflows/deploy.yml)
// - en local (dev / preview) ou autre hébergement : base relative "./"
// Si le dépôt n'a pas le nom "TimberHearth", ajuste la valeur ci-dessous.
const base = process.env.GHPAGES ? "/TimberHearth/" : "./";

export default defineConfig({
  plugins: [react()],
  base,
  server: { port: 5174, open: true },
  build: { outDir: "dist", sourcemap: false },
});
