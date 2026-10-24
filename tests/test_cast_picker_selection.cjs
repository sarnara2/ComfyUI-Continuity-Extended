/* Actual Picker/check stores in RAM: no browser, server, media or user storage.
 * Run against backup-before or backup-before-all-references to see the expected
 * fresh-selection regressions. Persistent checks now require explicit opt-in. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '..');
const overlay = process.env.CONTINUITY_SOURCE_OVERLAY;
const read = file => {
  const original = overlay && path.join(overlay, 'web/creator', file);
  return fs.readFileSync(original && fs.existsSync(original) ? original : path.join(root, 'web/creator', file), 'utf8');
};
const strip = source => source.replace(/^import[^;]*;\r?\n/gm, '').replace(/^export /gm, '');
const plain = value => JSON.parse(JSON.stringify(value));
const selected = picker => plain(picker.selected.map(row => row.path));
const old = {path:'old-person.png',kind:'image',subfolder:'',name:'old-person.png'};
const fresh = {path:'new-person.png',kind:'image',subfolder:'',name:'new-person.png'};
const video = {path:'new-motion.mp4',kind:'video',subfolder:'',name:'new-motion.mp4'};
const oldVideo = {path:'old-motion.mp4',kind:'video',subfolder:'',name:'old-motion.mp4'};
const audio = {path:'new-voice.wav',kind:'audio',subfolder:'',name:'new-voice.wav'};
const oldAudio = {path:'old-voice.wav',kind:'audio',subfolder:'',name:'old-voice.wav'};
const guide = {path:'continuity/control/new-guide.png',kind:'image',subfolder:'continuity/control',name:'new-guide.png'};
const oldGuide = {path:'continuity/control/old-guide.png',kind:'image',subfolder:'continuity/control',name:'old-guide.png'};
const render = {path:'new-render.png [output]',kind:'image',subfolder:'',name:'new-render.png'};
const oldRender = {path:'old-render.png [output]',kind:'image',subfolder:'',name:'old-render.png'};
const options = {selectionPurpose:'timeline-cast-files',kind:'image',
  kinds:['image','video','audio','renders','refmods']};
const freshOptions = {...options,rememberSelection:false};
const legacyOptions = {...options,rememberSelection:true};
const checksKey = 'continuity-picker-checks-v1';

function library(store = new Map()) {
  let storageReads = 0, storageWrites = 0, checkReads = 0, checkWrites = 0;
  const context = vm.createContext({console,URL,setTimeout,clearTimeout,
    fixtureRows:[old,fresh,video,oldVideo,audio,oldAudio,guide,oldGuide],fixtureOutputs:[oldRender,render],
    localStorage:{getItem:key=>{storageReads++;if(key===checksKey)checkReads++;return store.get(key)??null;},
      setItem:(key,value)=>{storageWrites++;if(key===checksKey)checkWrites++;store.set(key,value);}}});
  const source = `
const {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind}=(()=>{
${strip(read('viewprefs.js'))}
return {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind};})();
const {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths}=(()=>{
${strip(read('picker-checks.js'))}
return {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths};})();
const t = text => text;
const takeOptions = asset => asset.kind==='audio'?['full','style']:['full','object','scene','style','edit'];
let serverPrefs={favorites:[],lastShelf:{}};
const loadPickerPrefs=async()=>serverPrefs;
const savePickerPrefs=value=>{serverPrefs=value;};
const listExternalFolders=async()=>({folders:[]});
const listAssets=async({root='input'}={})=>root==='input'?fixtureRows:root==='output'?fixtureOutputs:[];
const listedFolders=()=>['people','other'];
const checkExternalAssets=()=>{throw Error('Unexpected external lookup');};
const dropQueued=()=>{throw Error('Unexpected queue action');};
${strip(read('picker.js'))}
function createPicker(options) {
 const picker=new Picker(options,result=>{picker.result=result;});
 const node=()=>({style:{},setAttribute(){}});
 Object.assign(picker,{tabs:[],uploadButton:node(),organizeButton:node(),revealButton:node(),
   addFolderButton:node(),grid:{childElementCount:0},
   renderShelves(){},renderGrid(){},renderFoot(){},hideFileInfo(){},unmount(){}});
 return picker;
}
({createPicker,pickerSelectionContext,readPickedPaths,writePickedPaths,readViewPrefs,
 patchViewPrefs:(context,value)=>patchViewPrefs(context,JSON.parse(JSON.stringify(value))),pickerViewContext});
`;
  const api = vm.runInContext(source, context, {filename:'actual-cast-picker-selection-fixture.js'});
  return {...api,store,counts:()=>({reads:storageReads,writes:storageWrites,checkReads,checkWrites})};
}

async function opened(api, opts=freshOptions) {
  const picker=api.createPicker(opts);
  await picker.load();
  assert.equal(picker.loadError,null,'the actual load path should finish successfully');
  return picker;
}

function seed(api, opts=options, paths=[old.path], kind='image') {
  // Simulate pending checks left by an older release, not a fresh picker write.
  const context=api.pickerSelectionContext({...opts,rememberSelection:true},kind);
  api.writePickedPaths(context,paths);
  return context;
}

// Parse actual caller option objects, not a textual occurrence in a comment.
function pickerCallOptions(file, method) {
  const embedded=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
  const module={exports:{}};
  new Function('exports','module',embedded)(module.exports,module);
  const tree=module.exports.parse(read(file),{ecmaVersion:'latest',sourceType:'module'});
  const found=[];
  function walk(node,inMethod=false) {
    if(!node||typeof node!=='object')return;
    if(node.type==='MethodDefinition')inMethod=node.key?.name===method;
    if(inMethod&&node.type==='CallExpression'&&node.callee?.name==='openPicker'){
      const spec=node.arguments[0];
      found.push(spec?.type==='ObjectExpression'
        && spec.properties.some(p=>p.key?.name==='rememberSelection'&&p.value.type==='Literal'&&p.value.value===false));
    }
    for(const value of Object.values(node)){
      if(Array.isArray(value))value.forEach(child=>walk(child,inMethod));
      else if(value&&typeof value==='object')walk(value,inMethod);
    }
  }
  walk(tree);
  return found;
}

const checks=[], failures=[];
async function check(name, body) {
  try {await body();checks.push({name,passed:true});}
  catch(error){checks.push({name,passed:false});failures.push({name,error:error.stack});}
}

(async()=>{
  await check('Actual old-policy path reproduces old+new and upload-only old selection',async()=>{
    const api=library();seed(api);
    const uploadOnly=await opened(api,legacyOptions);uploadOnly.absorb([fresh]);
    await uploadOnly.commit();assert.deepEqual(plain(uploadOnly.result.map(row=>row.path)),[old.path]);
    const addNew=await opened(api,legacyOptions);addNew.toggle(fresh);
    await addNew.commit();assert.deepEqual(plain(addNew.result.map(row=>row.path)),[old.path,fresh.path]);
  });

  await check('Fresh Cast picker ignores prior persistent checks and commits only this opening',async()=>{
    const api=library();seed(api);const saved=api.store.get(checksKey);
    const before=api.counts();
    const picker=await opened(api);assert.deepEqual(selected(picker),[]);
    picker.absorb([fresh]);assert.deepEqual(selected(picker),[],'upload alone must not revive old checks');
    picker.toggle(fresh);await picker.commit();
    assert.deepEqual(plain(picker.result.map(row=>row.path)),[fresh.path]);
    assert.equal(api.store.get(checksKey),saved,'Cast commit must not rewrite persistent checks');
    assert.deepEqual(selected(await opened(api)),[],'a new opening must start with no pending checks');
    assert.equal(api.counts().checkReads,before.checkReads,'fresh sessions must not read old pending checks');
    assert.equal(api.counts().checkWrites,before.checkWrites,'fresh sessions must not write persistent checks');
    assert.equal(api.pickerSelectionContext(freshOptions,'image'),null,'opt-out remains explicit in store API');
  });

  await check('All Cast purposes isolate different subjects and replacement roles',async()=>{
    for(const purpose of ['timeline-cast-files','segment-cast-files','prestage-cast-reference','preset-cast-files','preset-cast-refmods']){
      const api=library(),opts={...options,selectionPurpose:purpose};seed(api,opts);
      const first=await opened(api,{...opts,rememberSelection:false,subject:'first',replacement:false});
      assert.deepEqual(selected(first),[]);first.toggle(fresh);first.close(null);
      for(const role of [false,true]){
        const next=await opened(api,{...opts,rememberSelection:false,subject:'second',replacement:role});
        assert.deepEqual(selected(next),[],purpose+' must not resurrect another subject/role');next.close(null);
      }
    }
  });

  await check('Fresh module reload retains old storage bytes but never revives them in Cast',async()=>{
    const store=new Map(),first=library(store);seed(first);const saved=store.get(checksKey);
    const picker=await opened(first);picker.toggle(fresh);picker.close(null);
    const restarted=library(store),next=await opened(restarted);
    assert.deepEqual(selected(next),[]);assert.equal(store.get(checksKey),saved);
  });

  await check('Cancel discards the current opening without reviving it for another Cast',async()=>{
    const api=library(),picker=await opened(api);picker.toggle(fresh);picker.close(null);
    assert.equal(picker.result,null);assert.deepEqual(selected(await opened(api)),[]);
    assert.equal(api.store.get(checksKey),undefined);
  });

  await check('Same-opening image/video round trips retain explicit picks, not stored cross-kind picks',async()=>{
    const api=library();seed(api);seed(api,options,['old-motion.mp4'],'video');
    const saved=api.store.get(checksKey),picker=await opened(api);
    picker.toggle(fresh);picker.settings.set(fresh.path,{ref_size:'match'});
    picker.selectTab('video');await picker.restorePicked();assert.deepEqual(selected(picker),[]);
    picker.toggle(video);picker.selectTab('image');await picker.restorePicked();
    assert.deepEqual(selected(picker),[fresh.path]);
    assert.equal(picker.settings.get(fresh.path).ref_size,'match');
    picker.selectTab('video');await picker.restorePicked();assert.deepEqual(selected(picker),[video.path]);
    assert.equal(api.store.get(checksKey),saved,'per-opening tabs use only RAM checks');
  });

  await check('Same-opening folder/view changes preserve explicit picks and current view memory',async()=>{
    const api=library(),picker=await opened(api);picker.toggle(fresh);picker.setShelf('people');
    assert.deepEqual(selected(picker),[fresh.path]);picker.setShelf('other');assert.deepEqual(selected(picker),[fresh.path]);
    api.patchViewPrefs(picker.viewContext,{query:'portrait',view:'details',sort:'name'});
    picker.close(null);const next=await opened(api);
    assert.deepEqual(selected(next),[]);assert.equal(next.viewQuery,'portrait');
    assert.equal(next.viewMode,'details');assert.equal(next.sortOrder,'name');assert.equal(next.shelf,'other');
  });

  await check('Explicit attached sheet panels and editing recipes remain intact',async()=>{
    const api=library();seed(api);
    const panel={path:fresh.path,cut:true,rect:[0.1,0.2,0.3,0.4],crop:{x:0.1,y:0.2,w:0.5,h:0.5},takes:'full'};
    const picker=await opened(api,{...freshOptions,plate:{panels:[panel],sheet:false,cut:false},referenceOptions:{}});
    assert.deepEqual(selected(picker),[fresh.path]);assert.deepEqual(plain(picker.sheet),[fresh.path]);
    assert.equal(picker.cuts.get(fresh.path),true);assert.deepEqual(plain(picker.rects.get(fresh.path)),panel.rect);
    assert.deepEqual(plain(picker.settings.get(fresh.path).crop),panel.crop);
  });

  await check('Explicit opt-in still preserves non-Cast memory through commit and reload',async()=>{
    const api=library(),opts={...legacyOptions,selectionPurpose:'pool-files'};seed(api,opts);
    const picker=await opened(api,opts);assert.deepEqual(selected(picker),[old.path]);
    picker.toggle(old);picker.toggle(fresh);await picker.commit();
    assert.deepEqual(selected(await opened(library(api.store),opts)),[fresh.path]);
  });

  for(const [kind,previous,next,single=false] of [['image',old,fresh],['video',oldVideo,video],
    ['audio',oldAudio,audio],['renders',oldRender,render],['guides',oldGuide,guide],['image',old,fresh,true]]){
    await check('Default '+kind+(single?' single':'')+' import cannot resurrect a reference removed from the node',async()=>{
      const api=library(),opts={...options,kinds:[...options.kinds,'guides'],kind,single,
        selectionPurpose:'reference-'+kind+(single?'-single':'')};
      seed(api,opts,[previous.path],kind);
      const saved=api.store.get(checksKey),node={references:[previous.path]};
      node.references=[]; // The node has explicitly detached the former file.
      const picker=await opened(api,opts);assert.deepEqual(selected(picker),[]);
      await picker.commit();assert.equal(picker.result,undefined,'Add without a fresh pick must attach nothing');
      assert.deepEqual(node.references,[]);
      picker.toggle(next);await picker.commit();node.references=plain(picker.result.map(row=>row.path));
      assert.deepEqual(node.references,[next.path]);
      node.references=[];
      const reopened=await opened(api,opts);assert.deepEqual(selected(reopened),[]);
      reopened.toggle(next);reopened.close(null);
      assert.deepEqual(selected(await opened(library(api.store),opts)),[],'cancel/restart must not revive pending checks');
      assert.equal(api.store.get(checksKey),saved,'previous-release pending checks remain untouched, not reapplied');
      assert.equal(api.pickerSelectionContext(opts,kind),null,'persistence is opt-in, not the default');
    });
  }

  await check('Default import keeps this opening across kind switches without persisting it',async()=>{
    const api=library(),opts={...options,selectionPurpose:'piece-reference-files'};
    seed(api,opts);seed(api,opts,[oldVideo.path],'video');const saved=api.store.get(checksKey);
    const picker=await opened(api,opts);assert.deepEqual(selected(picker),[]);picker.toggle(fresh);
    picker.selectTab('video');await picker.restorePicked();assert.deepEqual(selected(picker),[]);
    picker.toggle(video);picker.selectTab('image');await picker.restorePicked();assert.deepEqual(selected(picker),[fresh.path]);
    picker.close(null);assert.deepEqual(selected(await opened(api,opts)),[]);assert.equal(api.store.get(checksKey),saved);
  });

  await check('Every real Cast file caller explicitly selects fresh per-opening policy',()=>{
    for(const [file,method] of [['timeline.js','attachOneCastAsset'],['editor.js','attachOneAsset'],
      ['prestage.js','attachOneRef'],['presetlib.js','addFile']]){
      assert.deepEqual(pickerCallOptions(file,method),[true],file+' '+method+' openPicker policy');
    }
  });

  console.log(JSON.stringify({suite:'Cast picker selection lifetime',source:root,sourceOverlay:overlay??null,passed:checks.filter(c=>c.passed).length,
    total:checks.length,checks,failures,scope:'actual source methods; RAM listing, localStorage and UI adapters only'},null,2));
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
