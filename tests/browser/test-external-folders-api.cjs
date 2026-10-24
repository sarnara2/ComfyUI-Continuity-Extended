// Actual API wrappers with an in-memory fetch boundary; no live HTTP/browser,
// filesystem materialization, user profile or attachment/generation actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(repo,'../baseline');
const source=fs.readFileSync(path.join(repo,'web/creator/api.js'),'utf8');
const old=fs.readFileSync(path.join(baseline,'web/creator/api.js'),'utf8');
const newApi='export const listExternalAssets = ({ folder, kind, directory }) => folderPost("assets", {\n'
 +'  folder, kind, ...(directory === undefined ? {} : { directory }),\n});\n'
 +'// Read-only validation of remembered checks, even outside the visible folder.\n'
 +'// Restoring UI selection never calls importExternalAssets or an attachment.\n'
 +'export const checkExternalAssets = ({ paths, kind }) => folderPost("metadata", { paths, kind });';
assert.equal(source.replace(/\r\n/g,'\n').replace(newApi,'export const listExternalAssets = ({ folder, kind }) => folderPost("assets", { folder, kind });'),old.replace(/\r\n/g,'\n'),'Every other API owner byte preserved after only the two read-only wrappers');
const code=source.slice(source.indexOf('let externalUser = null;'),source.indexOf('function externalRoute(')).replace(/^export /gm,'');
let calls=[],ok=true,answer={assets:[],folders:[],directory:'',parent:null,truncated:false};
const context=vm.createContext({JSON_HEADERS:{'Content-Type':'application/json'},t:text=>text,
 api:{async fetchApi(url,options){calls.push({url,method:options.method,headers:options.headers,body:JSON.parse(options.body)});return{ok,status:400,json:async()=>answer};}}});
vm.runInContext(code+'\nObject.assign(globalThis,{listExternalAssets,checkExternalAssets,importExternalAssets});',context);
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;
const check=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
(async()=>{
 await check('Omitted or undefined directory keeps the exact legacy recursive POST',async()=>{
  for(const options of [{folder:'grant',kind:'image'},{folder:'grant',kind:'image',directory:undefined}]){
   calls=[];await context.listExternalAssets(options);assert.deepEqual(calls[0].body,{folder:'grant',kind:'image'});
   assert.equal(calls[0].url,'/continuity/folders/assets');
  }
 });
 await check('Explicit root and Unicode relative directory remain registered relative identities',async()=>{
  for(const directory of ['', '空 폴더/child']){calls=[];const result=await context.listExternalAssets({folder:'grant',kind:'image',directory});
   assert.deepEqual(calls[0].body,{folder:'grant',kind:'image',directory});assert.deepEqual(plain(result),answer);}
 });
 await check('Read-only metadata sends ordered tokens and current tab only without importing or probing',async()=>{
  calls=[];const paths=['external:one/a.png','external:two/deep/b.png'];answer={assets:[{path:paths[0],kind:'image'}],missing:[paths[1]]};
  assert.deepEqual(plain(await context.checkExternalAssets({paths,kind:'image'})),answer);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/continuity/folders/metadata');assert.deepEqual(calls[0].body,{paths,kind:'image'});
  assert.equal(calls[0].method,'POST');assert.deepEqual(plain(calls[0].headers),{'Content-Type':'application/json'});
 });
 await check('Server refusal propagates instead of synthesizing restored rows',async()=>{
  ok=false;answer={error:'isolated refusal'};await assert.rejects(context.checkExternalAssets({paths:[],kind:'image'}),/isolated refusal/);ok=true;
 });
 await check('Explicit external import remains a separate caller action',async()=>{
  calls=[];const internal=[{path:'input.png',kind:'image'}];assert.equal(await context.importExternalAssets(internal),internal);assert.equal(calls.length,0);
  answer={assets:[{path:'continuity/imports/copied.png',kind:'image'}]};await context.importExternalAssets([{path:'external:grant/source.png',kind:'image'}]);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/continuity/folders/import');
 });
 console.log(JSON.stringify({checks,liveRequests:0,scope:'In-memory fetch boundary, actual API wrappers; other API source reconstructed byte-exact'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
