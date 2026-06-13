#!/usr/bin/env node
// Pipeline de validation Âtrebois — à lancer après chaque modif lourde : `npm run check`.
// 1) bundle esbuild strict (RC) · 2) analyse de portée acorn (variables non déclarées)
// 3) présence des blocs vitaux (str_replace peut "manger" un bloc voisin sans casser la syntaxe).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "src/TimberHearth.jsx";
const OUT = "/tmp/th_check_bundle.mjs";
let fail = 0;
const ok = (m) => console.log("  \x1b[32m✓\x1b[0m " + m);
const ko = (m) => { console.log("  \x1b[31m✗ " + m + "\x1b[0m"); fail++; };

// 1) bundle ------------------------------------------------------------------
console.log("\n[1/3] esbuild bundle");
try {
  execSync(`npx --yes esbuild ${SRC} --loader:.jsx=jsx --bundle --external:three --external:react --external:react-dom --format=esm --target=es2020 --outfile=${OUT}`, { stdio: "pipe" });
  ok("bundle RC=0");
} catch (e) {
  ko("bundle échoué :\n" + (e.stderr?.toString() || e.message));
}

// 2) portée (acorn) ----------------------------------------------------------
console.log("[2/3] analyse de portée (acorn)");
try {
  const acorn = await import("acorn");
  const walk = await import("acorn-walk");
  const code = readFileSync(OUT, "utf8");
  const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "module" });
  const declared = new Set();
  const globals = new Set(["window","document","console","Math","requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout","setInterval","clearInterval","Date","JSON","Object","Array","Map","Set","WeakMap","WeakSet","Float32Array","Uint8Array","Uint16Array","Int32Array","Float64Array","ArrayBuffer","DataView","Promise","URL","Blob","navigator","localStorage","sessionStorage","performance","isNaN","isFinite","parseInt","parseFloat","String","Number","Boolean","undefined","NaN","Infinity","globalThis","structuredClone","AudioContext","webkitAudioContext","Image","fetch","Symbol","Error","TypeError","RangeError","RegExp","encodeURIComponent","decodeURIComponent","Reflect","Proxy","queueMicrotask","requestIdleCallback","atob","btoa","crypto"]);
  const collect = (p) => { if (!p) return;
    if (p.type === "Identifier") declared.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach((pr) => collect(pr.value || pr.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach((e) => e && collect(e));
    else if (p.type === "AssignmentPattern") collect(p.left);
    else if (p.type === "RestElement") collect(p.argument);
  };
  walk.full(ast, (node) => {
    if (node.type === "VariableDeclarator") collect(node.id);
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") { if (node.id) declared.add(node.id.name); node.params.forEach(collect); }
    if (node.type === "ClassDeclaration" && node.id) declared.add(node.id.name);
    if (node.type === "CatchClause") collect(node.param);
    if (node.type === "ImportDefaultSpecifier" || node.type === "ImportSpecifier" || node.type === "ImportNamespaceSpecifier") declared.add(node.local.name);
  });
  const missing = new Map();
  walk.ancestor(ast, { Identifier(node, anc) {
    const name = node.name;
    if (declared.has(name) || globals.has(name)) return;
    const p = anc[anc.length - 2]; if (!p) return;
    if (p.type === "MemberExpression" && p.property === node && !p.computed) return;
    if (p.type === "Property" && p.key === node && !p.computed) return;
    if (p.type === "MethodDefinition" && p.key === node) return;
    if (p.type === "LabeledStatement" || p.type === "BreakStatement" || p.type === "ContinueStatement") return;
    if (p.type === "ImportSpecifier" || p.type === "ImportDefaultSpecifier") return;
    missing.set(name, (missing.get(name) || 0) + 1);
  }});
  // "React" est un faux positif attendu (JSX compilé en React.createElement, fourni à l'exécution).
  const real = [...missing.entries()].filter(([n]) => n !== "React");
  if (real.length === 0) ok("aucune variable non déclarée (hors React)");
  else { ko("variables lues jamais déclarées :"); real.sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`      - ${n} (${c}x)`)); }
} catch (e) {
  ko("analyse de portée impossible : " + e.message);
}

// 3) blocs vitaux ------------------------------------------------------------
console.log("[3/3] présence des blocs vitaux");
try {
  const s = readFileSync(SRC, "utf8");
  const VITAL = [
    "loopTime +=",                              // horloge de boucle
    "setMini(",                                 // mise à jour minimap
    "setHud((h) => ({ ...h, time: remain",       // compteur supernova
    "captureFrame(dt)",                         // enregistreur debug
    "composer.render()",                        // rendu post-process
    "playWake",                                 // réveil paupières (EVO-1)
    "terrainHeight",                            // terrain analytique (EVO-2)
    "motifLoop()",                              // motif audio (EVO-3)
    "InstancedMesh",                            // instancing (EVO-4)
  ];
  let miss = 0;
  for (const v of VITAL) { const n = (s.match(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length; if (n < 1) { console.log(`      - MANQUANT : ${v}`); miss++; } }
  if (miss === 0) ok(`${VITAL.length} blocs vitaux présents`);
  else ko(`${miss} bloc(s) vital(aux) manquant(s)`);
} catch (e) {
  ko("lecture source impossible : " + e.message);
}

console.log("");
if (fail) { console.log(`\x1b[31m✗ check : ${fail} problème(s)\x1b[0m\n`); process.exit(1); }
console.log("\x1b[32m✓ check OK\x1b[0m\n");
