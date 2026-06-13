const acorn = require('acorn');
const walk = require('acorn-walk');
const fs = require('fs');
const code = fs.readFileSync('/tmp/th_scope.mjs','utf8');
const ast = acorn.parse(code,{ecmaVersion:2022,sourceType:'module'});
const declared = new Set();
const globals = new Set(['window','document','console','Math','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','setInterval','clearInterval','Date','JSON','Object','Array','Map','Set','WeakMap','WeakSet','Float32Array','Uint8Array','Uint16Array','Int32Array','ArrayBuffer','Promise','URL','Blob','navigator','localStorage','sessionStorage','performance','isNaN','isFinite','parseInt','parseFloat','String','Number','Boolean','undefined','NaN','Infinity','globalThis','structuredClone','AudioContext','webkitAudioContext','Image','fetch','Symbol','Error','TypeError','RangeError','RegExp','encodeURIComponent','decodeURIComponent','Float64Array','DataView','Reflect','Proxy','queueMicrotask','requestIdleCallback','atob','btoa','crypto']);
function collectPat(p){ if(!p)return;
  if(p.type==='Identifier') declared.add(p.name);
  else if(p.type==='ObjectPattern') p.properties.forEach(pr=>collectPat(pr.value||pr.argument));
  else if(p.type==='ArrayPattern') p.elements.forEach(e=>e&&collectPat(e));
  else if(p.type==='AssignmentPattern') collectPat(p.left);
  else if(p.type==='RestElement') collectPat(p.argument);
}
walk.full(ast,(node)=>{
  if(node.type==='VariableDeclarator') collectPat(node.id);
  if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression'){ if(node.id)declared.add(node.id.name); node.params.forEach(collectPat); }
  if(node.type==='ClassDeclaration'&&node.id) declared.add(node.id.name);
  if(node.type==='CatchClause') collectPat(node.param);
  if(node.type==='ImportDefaultSpecifier'||node.type==='ImportSpecifier'||node.type==='ImportNamespaceSpecifier') declared.add(node.local.name);
});
const missing=new Map();
walk.ancestor(ast,{ Identifier(node,anc){
  const name=node.name;
  if(declared.has(name)||globals.has(name))return;
  const p=anc[anc.length-2]; if(!p)return;
  if(p.type==='MemberExpression'&&p.property===node&&!p.computed)return;
  if(p.type==='Property'&&p.key===node&&!p.computed)return;
  if(p.type==='MethodDefinition'&&p.key===node)return;
  if(p.type==='LabeledStatement'||p.type==='BreakStatement'||p.type==='ContinueStatement')return;
  if(p.type==='ImportSpecifier'||p.type==='ImportDefaultSpecifier')return;
  missing.set(name,(missing.get(name)||0)+1);
}});
const arr=[...missing.entries()].sort((a,b)=>b[1]-a[1]);
console.log('=== identifiants lus jamais déclarés ===');
for(const [n,c] of arr) console.log('  '+n+'  ('+c+'x)');
console.log(arr.length?('TOTAL: '+arr.length):'AUCUN — portée OK');
