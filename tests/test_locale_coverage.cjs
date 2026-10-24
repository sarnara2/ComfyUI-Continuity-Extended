/* First-party locale coverage and model/UI language boundary. Source inspection
 * and RAM-only actual modules; no browser, ComfyUI, server or user data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const read = file => fs.readFileSync(path.join(web, 'creator', file), 'utf8');
const acorn = {exports:{}};
new Function('exports','module',process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'])(acorn.exports,acorn);
const parse = source => acorn.exports.parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
const strip = source => source.replace(/^import[^;]*;\r?\n/gm,'').replace(/^export /gm,'');
const skip = new Set(['styles','locales','vendor','node_modules','third_party','third-party']);

function walk(node, visit, parents=[]) {
  if(!node||typeof node!=='object'||!node.type)return;
  visit(node,parents);
  for(const value of Object.values(node)) {
    if(Array.isArray(value))value.forEach(child=>walk(child,visit,[node,...parents]));
    else if(value&&typeof value==='object')walk(value,visit,[node,...parents]);
  }
}
function sources(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ? skip.has(entry.name)?[]:sources(path.join(directory,entry.name))
    : /\.m?js$/.test(entry.name)?[path.join(directory,entry.name)]:[]);
}
function fixed(node) {
  if(node?.type==='Literal'&&typeof node.value==='string')return[node.value];
  if(node?.type==='TemplateLiteral'&&!node.expressions.length)return[node.quasis.map(part=>part.value.cooked).join('')];
  if(node?.type==='BinaryExpression'&&node.operator==='+') {
    const left=fixed(node.left),right=fixed(node.right);
    if(left&&right)return left.flatMap(a=>right.map(b=>a+b));
  }
  if(node?.type==='ConditionalExpression') {
    const yes=fixed(node.consequent),no=fixed(node.alternate);
    if(yes&&no)return[...yes,...no];
  }
  return null;
}
const slots = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();

// Proper names, model section identifiers, file types and example paths are
// deliberately literal UI text. This is not an exemption for ordinary prose.
const rawTechnical = new Set(['Continuity','GLB','RefMod','subject','overall_soundscape',
  'non_diegetic_music','.json · .safetensors','models/text_encoders/qwen3vl_4b.safetensors',
  'http://localhost:1234/v1','output/']);
const technicalKeys = new Set(['…/Streamline/bin/x64/nvngx_dlssnr.dll']);
// Protocol/model values, units, paths and interpolation-only layouts stay literal.
// Ordinary prose, including quality preset labels, is not exempted.
const sameEnglishTechnical = new Set(['Picture {n}','max','match','{seconds} s','cfg','NSFW',
  '.metadata.json','.civitai.info','.json / .txt','{backend} {model}','sha256 {hash}…','FL2VA','Ref2VA',
  'auto','— auto —','{name}: {error}','{label} — {mark} px','init','img {value}','default','→ ref',
  'temp {n}','cfg {n}','FirstBlockCache','VDN','VDN-H3 stage','spectrum','crf {crf}','Krea 2',
  'Ideogram 4.0','MiniMax H3','overall_soundscape','non_diegetic_music','{where}: {blocked}',
  'Turbo LoRA','turbo · {name}','shift {n}','{file} — {where}','{word} @{handle}','{from}–{to}',
  'ControlNet','VAE','RefMod','{tokens} tok','folder/name','{n} GB','{n} px','LoRA','turbo {quality}',
  '+ LoRA','{time} · {percent}%','TV','steps','sampler','sched','epoch {epoch}','{who} {how} — {language}']);
const catalogs = {}, report = {catalogs:{},staticMissing:[],dynamicSites:0,dynamicTypes:{},rawUnlocalized:[]};

for(const language of ['ko','ja','zh']) {
  const entries=[];
  walk(parse(read('locales/'+language+'.js')),node=>{
    if(node.type==='VariableDeclarator'&&node.id.name===language) {
      assert.equal(node.init.type,'ObjectExpression');
      for(const property of node.init.properties) {
        assert.equal(property.type,'Property');assert.equal(property.value.type,'Literal');
        entries.push([property.key.value??property.key.name,property.value.value]);
      }
    }
  });
  assert.ok(entries.length>0);
  const dictionary=Object.fromEntries(entries);catalogs[language]=dictionary;
  assert.equal(Object.keys(dictionary).length,entries.length,language+' has duplicate catalog keys');
  for(const [key,value]of entries) {
    assert.equal(typeof value,'string');assert.ok(value.trim(),language+' has an empty translation: '+key);
    assert.deepEqual(slots(value),slots(key),language+' changed interpolation slots: '+key);
  }
  const unchanged=entries.filter(([key,value])=>key===value).map(([key])=>key);
  assert.deepEqual(unchanged.filter(key=>!sameEnglishTechnical.has(key)),[],language+' has unchanged nontechnical English');
  report.catalogs[language]={keys:entries.length,duplicates:0,placeholderMismatches:0,
    unchangedTechnicalValues:unchanged.length};
}
for(const language of ['ja','zh'])assert.deepEqual(Object.keys(catalogs[language]).sort(),Object.keys(catalogs.ko).sort());

const sites=[],files=sources(web);
for(const file of files) {
  walk(parse(fs.readFileSync(file,'utf8')),(node,parents)=>{
    const site={file:path.relative(web,file),line:node.loc.start.line};
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='t') {
      const keys=fixed(node.arguments[0]);
      if(keys)keys.forEach(key=>sites.push({...site,key}));
      else {report.dynamicSites++;const type=node.arguments[0]?.type??'none';report.dynamicTypes[type]=(report.dynamicTypes[type]??0)+1;}
    }
    if(node.type==='Property'&&['text','title','placeholder','aria-label'].includes(node.key.name??node.key.value)
       && typeof node.value?.value==='string'&&/[A-Za-z]{3}/.test(node.value.value)
       && parents[1]?.type==='CallExpression'&&parents[1].callee.name==='el'
       && !rawTechnical.has(node.value.value))report.rawUnlocalized.push({...site,key:node.value.value});
    if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'
       && ['textContent','title','placeholder','innerText'].includes(node.left.property.name)
       && typeof node.right?.value==='string'&&/[A-Za-z]{3}/.test(node.right.value)
       && !rawTechnical.has(node.right.value))report.rawUnlocalized.push({...site,key:node.right.value});
  });
}

// Dynamic server-message templates are data in RULES, not literal t() calls.
// Audit those actual keys too, without exporting private runtime internals.
const diagnosticKeys=new Set([
  'creator_data must be a JSON object',
  'final-prompt drafts must name existing generation passes',
  'final-prompt draft needs the original compiled reference binding',
  'final-prompt draft must name stable card identities',
  'final-prompt draft pass changed; enable Force edit again for the current pass',
  'final-prompt draft must contain 1 to 200000 characters',
  'final-prompt draft references changed; reopen What the model reads and enable Force edit again',
  'motion','place','start','end','a reference video','a reference picture or video',
]);
walk(parse(read('server-messages.js')),node=>{
  if(node.type==='VariableDeclarator'&&node.id.name==='RULES') {
    assert.equal(node.init.type,'ArrayExpression');
    for(const row of node.init.elements) {
      assert.equal(row.type,'ArrayExpression');const key=row.elements[1];
      assert.equal(key.type,'Literal');assert.equal(typeof key.value,'string');diagnosticKeys.add(key.value);
    }
  }
});
const unique=new Set(sites.map(site=>site.key));
// Composer tab/choice labels are passed through a shared button helper.
for (const key of ['Choose', 'Preview', 'Help']) unique.add(key);
for(const language of ['ko','ja','zh']) {
  for(const key of [...unique,...diagnosticKeys]) {
    if(!technicalKeys.has(key)&&!Object.hasOwn(catalogs[language],key))report.staticMissing.push({language,key,site:sites.find(site=>site.key===key)});
  }
}
assert.deepEqual(report.staticMissing,[],'a first-party UI/diagnostic key is missing from a catalog');
assert.deepEqual(report.rawUnlocalized,[],'ordinary UI text bypasses t()');

// Execute actual i18n and the complete blockout module in RAM. UI labels must
// change locale, while generated model sentences and explicit handles do not.
let locale='en';
const runtime=vm.runInNewContext(
  ['ko','ja','zh'].map(language=>'const '+language+'='+JSON.stringify(catalogs[language])+';').join('\n')
  +'\n'+strip(read('i18n.js'))+'\n'+strip(read('blockout.js'))+'\n({moveSentence,stagingSentence,t});',
  {console,app:{extensionManager:{setting:{get:()=>locale}}}},
  {filename:'actual-locale-model-boundary.js'});
const camera={x:0,y:1.6,z:0,yaw:0,pitch:0,mm:32};
const paths=[[],[camera,{...camera,z:1.4}],
  [camera,{...camera,x:3,y:3,z:3,yaw:0.4,pitch:0.2,mm:50}],
  [camera,{...camera,x:-2,y:0.8,z:-1,yaw:0.5,pitch:-0.3,mm:16}]];
const objects=[{id:1,kind:'block',x:0,z:5,w:0.5,h:1.8,d:0.4,rot:0,plays:'여자_2',word:''},
  {id:2,kind:'block',x:-1.1,z:1.8,w:1.2,h:0.9,d:0.8,rot:0,plays:'',word:'table'}];
const prose=()=>paths.flatMap(marks=>[runtime.moveSentence(marks,4,'여자_2'),
  runtime.stagingSentence(objects,marks,4,camera,{w:704,h:396})]);
const english=prose();assert.equal(english[0],'The camera holds a static shot.');
assert.ok(english.some(text=>text.includes('@여자_2')),'model handles must be preserved');
for(const language of ['ko','ja','zh']) {
  locale=language;assert.notEqual(runtime.t('Add image'),'Add image');
  assert.deepEqual(prose(),english,language+' altered generated model prose');
}
walk(parse(read('blockout.js')),(node,parents)=>{
  const owner=parents.find(parent=>parent.type==='FunctionDeclaration');
  if(node.type==='CallExpression'&&node.callee.name==='t'
     && ['placeOf','articled','stagingSentence','moveSentence'].includes(owner?.id.name))
    assert.fail('model-only blockout builder calls the UI translator');
});

Object.assign(report,{files:files.length,staticSites:sites.length,staticKeys:unique.size,
  documentedTechnicalKeys:technicalKeys.size,diagnosticKeys:diagnosticKeys.size,
  modelSentencesPerLocale:english.length,modelLocales:['en','ko','ja','zh'],status:'PASS',
  limitation:'Dynamic t(variable) sites are inventoried, not claimed universally covered by static inspection.'});
console.log(JSON.stringify(report,null,2));
