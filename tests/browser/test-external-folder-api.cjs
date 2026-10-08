// Real API module against a deterministic ComfyUI transport; no network or disk import.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../web/creator/api.js'), 'utf8')
  .replace(/^import [^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const calls = [], writes = [];
const id = 'a'.repeat(32), token = `external:${id}/한글 사진.png`;
const response = body => ({ok:true,status:200,json:async()=>body});
const api = {
  apiURL:route=>'/api'+route,
  getUserData:async()=>response({favorites:[],lastShelf:{input:'all',renders:'all'},externalFolder:id}),
  storeUserData:(file,body)=>writes.push({file,body}),
  async fetchApi(route, options) {
    assert.ok(!route.startsWith('/api/'), 'fetchApi must receive a route, not an already-prefixed URL');
    calls.push({route,options});
    if(route.endsWith('/list'))return response({folders:[{id,name:'Photos',path:'H:/Photos'}],user:'alice'});
    if(route.endsWith('/choose'))return response({folder:{id,name:'Photos',path:'H:/Photos'}});
    if(route.endsWith('/reveal'))return response({path:'H:/Photos'});
    if(route.endsWith('/assets'))return response({assets:[{path:token,kind:'image'}],truncated:false});
    if(route.endsWith('/import'))return response({assets:JSON.parse(options.body).assets.map(row=>({...row,path:'continuity/imports/picture.png'}))});
    if(route.includes('/probe?'))return response({has_audio:true,duration:2,width:100,height:50});
    if(route.includes('/peaks?'))return response({peaks:[0,.5,1]});
    return response({removed:true});
  },
};
const moduleApi = new Function('api','t','localStorage','isAtlasRef','atlasUrl','runJob','applyTextScale','applySurfaceLift','applyTheme',
  source+'\nreturn {listExternalFolders,chooseExternalFolder,listExternalAssets,importExternalAssets,removeExternalFolder,revealExternalFolder,viewUrl,thumbUrl,probe,fetchPeaks,loadPickerPrefs,savePickerPrefs,pickerPrefsHeld};')(
    api,key=>key,{setItem(){},getItem(){return null;}},()=>false,()=>'',()=>{},()=>{},()=>{},()=>{});
(async()=>{
  const registry=await moduleApi.listExternalFolders();assert.equal(registry.folders[0].id,id);
  await moduleApi.chooseExternalFolder();
  await moduleApi.listExternalAssets({folder:id,kind:'image'});
  const scan=calls.at(-1);assert.deepEqual(JSON.parse(scan.options.body),{folder:id,kind:'image'});
  assert.equal(scan.options.method,'POST');assert.equal(scan.options.headers['Content-Type'],'application/json');
  assert.equal(await moduleApi.revealExternalFolder(id),'H:/Photos');
  const crop={x:.1,y:0,w:.9,h:1};
  for(const address of [moduleApi.viewUrl(token),moduleApi.thumbUrl(token,3),moduleApi.viewUrl(token,{preview:true}),moduleApi.viewUrl(token,{crop})]) {
    const url=new URL(address,'http://local.test');
    assert.ok(url.pathname.startsWith('/api/continuity/folders/'));
    assert.equal(url.searchParams.get('filename'),token);assert.equal(url.searchParams.get('user'),'alice');
  }
  assert.equal((await moduleApi.probe(token)).duration,2);
  assert.deepEqual([...await moduleApi.fetchPeaks(token)],[0,.5,1]);
  assert.ok(calls.at(-1).route.startsWith('/continuity/folders/peaks?'));
  const picked={path:token,takes:'person',ref_size:'match',crop,trim:{start:1,end:2},track:'picture'};
  const imported=await moduleApi.importExternalAssets([picked]);
  assert.equal(imported[0].path,'continuity/imports/picture.png');assert.deepEqual(imported[0].crop,crop);
  assert.equal(picked.path,token,'API transport cannot mutate the external selection');
  const before=calls.length;const native=[{path:'existing.png'}];
  assert.equal(await moduleApi.importExternalAssets(native),native);assert.equal(calls.length,before);
  await moduleApi.removeExternalFolder(id);assert.equal(calls.at(-1).route,'/continuity/folders/remove');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{folder:id});
  const prefs=await moduleApi.loadPickerPrefs();assert.equal(prefs.externalFolder,id);
  moduleApi.savePickerPrefs(prefs);assert.equal(writes.at(-1).body.externalFolder,id);
  assert.equal(await moduleApi.pickerPrefsHeld(),1);
  assert.ok(moduleApi.viewUrl('native.png').startsWith('/api/view?'));
  console.log('PASS real folder API: transport, per-user previews, route prefix, options, preferences and unchanged builtin paths');
})().catch(error=>{console.error(error);process.exitCode=1;});
