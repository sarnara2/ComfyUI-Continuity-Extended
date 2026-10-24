// Actual attachment/cast methods, with picker and rendering seams stubbed.
// No ComfyUI workflow, file upload, live browser or GPU render is performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = Object.fromEntries(['state','editor','cast','presetlib','presets','prestage','timeline','soundlane']
  .map(name => [name, read(name + '.js')]));
const method = (file, name) => {
  const found = source[file].match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `${file}.${name}`); return found[0];
};
const fn = (file, name) => {
  const found = source[file].match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}\\r?$`, 'm'));
  assert.ok(found, `${file}.${name}`); return found[0].replace(/^export /,'');
};
const constant = name => source.state.match(new RegExp(`^export const ${name} = [^]*?;\\r?$`, 'm'))[0].replace(/^export /,'');
const compile = fs.readFileSync(path.join(root, '../../creator/compile.py'), 'utf8');
const tuple = name => JSON.parse(`[${compile.match(new RegExp(`^${name} = \\(([^\\n]*)\\)`, 'm'))[1]}]`);
const IMAGE_TAKES = tuple('IMAGE_TAKES');
const extra = compile.match(/^VIDEO_TAKES = IMAGE_TAKES \+ \(([^\n]*)\)/m)[1];
const TAKES = { image: IMAGE_TAKES, video: [...IMAGE_TAKES,...JSON.parse(`[${extra}]`)], audio:tuple('AUDIO_TAKES') };
const S = new Function('TAKES', `${['scopeKind','takeOptions','takes','takeable'].map(constant).join('\n')}
  ${['nextIn','plateEntry','slotTake','inheritTake','motionOf','replacesOf'].map(name=>fn('state',name)).join('\n')}
  return {takeOptions,takes,takeable,plateEntry,slotTake,inheritTake,motionOf,replacesOf};`)(TAKES);
Object.assign(S, {
  SUBJECT_TAKES:['person','object','scene','style'], SUBJECT_MARKERS:[], SUBJECT_HANDLE_RE:/^[A-Za-z][A-Za-z0-9_]*$/,
  blockedReason:()=>null, trackFor:asset=>asset.track||'picture',
  takenHandles:state=>new Set((state.assets||[]).flatMap(asset=>[asset.handle,...(asset.panels||[]).map(p=>p.handle)])),
  nextHandle:state=>'ref-'+((state.assets?.length||0)+1), nextPoolHandle:state=>'ref-'+((state.assets?.length||0)+1),
  nextPreStageHandle:state=>'ref-'+((state.refs?.length||0)+1),
  capacity:()=>({used:0,max:8,filesLeft:8}), refCaps:()=>({files:8}),
  isRefMod:new Function(`${constant('isRefMod')};return isRefMod;`)(),
  dropMods:asset=>delete asset.mods, sizeable:asset=>asset.role==='reference'&&['image','video'].includes(asset.kind)&&!S.isRefMod(asset),
  refSize:asset=>asset.ref_size||'max', subjectNotes:subject=>subject.notes||{}, subjectTriggers:subject=>subject.triggers||{},
  subjectFeatures:subject=>subject.features||[], serializeWears:()=>null, seedSubject:()=>{},
});
const roleSource = source.cast.match(/^export const ROLES = \[[^]*?^\];/m)[0].replace(/^export /,'');
const takeSource = source.cast.match(/^export const CAST_REFERENCE_TAKES = \{[^]*?^\};/m)[0].replace(/^export /,'');
const {ROLES,CAST_REFERENCE_TAKES,referenceRole} = new Function('S',`${roleSource}\n${takeSource}\n${fn('cast','referenceRole')}\nreturn {ROLES,CAST_REFERENCE_TAKES,referenceRole};`)(S);
let chosen = [], pickerOptions = null, menu = null;
const openPicker = async options => { pickerOptions=options; return chosen; };
const Editor = new Function('S','openPicker','CAST_REFERENCE_TAKES',`return class {
  ${['attachAssets','attachOneAsset','replaceAsset','mergeSheet'].map(name=>method('editor',name)).join('\n')}
  commit(){this.commits++;} pickerAspect(){return null;} cardSeconds(){return 15;}
  plateSpec(){return null;} async applySoundDefault(asset){this.defaults.push(asset.handle);}
  setTrack(asset,track){asset.track=track;return true;} probeKeyframe(){}
};`)(S,openPicker,CAST_REFERENCE_TAKES);
const Library = new Function('openPicker','CAST_REFERENCE_TAKES','referenceRole',`return class {
  ${method('presetlib','addFile')}
  async flushSave(){this.saved++;} renderSheet(){}
};`)(openPicker,CAST_REFERENCE_TAKES,referenceRole);
const P = new Function('S',`${source.presets.match(/^const pick = [^]*?;\r?$/m)[0]}
  ${fn('presets','storedFile')}\n${fn('presets','captureSubject')}\n${fn('presets','freeSubjectHandle')}
  const SUBJECT_SLOTS=['from','motion','voice','replaces'];
  ${fn('presets','addSubjectToPiece')}\nreturn {captureSubject,addSubjectToPiece};`)(S);
const Shelf = new Function('S','ROLES','referenceRole','openMenu','el','icon','assetThumb','t',`
  ${source.cast.match(/^const inRole = [^]*?;\r?$/m)[0]}
  const ROLE=Object.fromEntries(ROLES.map(role=>[role.key,role]));
  const LIST_ROLES=new Set(['from','motion','replaces']);
  return class {
  constructor(){this.referenceRequests=new WeakMap();}
  renderSoon(){throw new Error(this.note?.text||'Unexpected cast action failure');}
  ${['pickReference','referenceRequest','referenceActionGuard','attachReference','addRole'].map(name=>method('cast',name)).join('\n')}
};`)(S,ROLES,referenceRole,(_anchor,options)=>{menu=options;},()=>({}),()=>({}),()=>({}),text=>text);
// Both the live timeline window and the node body call this method.
const Timeline = new Function('S','openPicker','CAST_REFERENCE_TAKES',`return class {
  ${['attachOneCastAsset','foldPoolSheet','poolEntry'].map(name=>method('timeline',name)).join('\n')}
  poolPlate(){return null;} commit(){this.commits++;} renderPool(){}
};`)(S,openPicker,CAST_REFERENCE_TAKES);
const Prestage = new Function('S','openPicker','applyPick',`return class {
  ${method('prestage','attachOneRef')}
  refBlocked(){return null;} pickerAspect(){return null;} plateSpec(){return null;}
  commit(){this.commits++;}
};`)(Object.assign(Object.create(S),{preStageMaxRefs:()=>8,preStageCountedRefs:state=>state.refs}),openPicker,
  (row,pick)=>Object.assign(row,{filename:pick.path}));
const newEditor = () => Object.assign(new Editor(),{state:{assets:[]},piece:{},commits:0,defaults:[]});
let passed=0;
async function test(name, body){await body();passed++;process.stdout.write(`ok ${passed} - ${name}\n`);}

(async()=>{
  await test('shot references retain independent role, size, trim, crop and sound track',async()=>{
    const editor=newEditor();
    chosen=[{kind:'video',path:'one.mp4',takes:'edit',ref_size:'match',track:'picture+sound',trim:{start:1,end:8},crop:{x:.1}},
      {kind:'video',path:'two.mp4',takes:'motion',ref_size:'max',track:'picture'},
      {kind:'audio',path:'sound.wav',takes:'copy'}];
    await editor.attachAssets(chosen);
    assert.equal(editor.state.assets[0].takes,'edit');assert.equal(editor.state.assets[0].ref_size,'match');
    assert.deepEqual(editor.state.assets[0].trim,{start:1,end:8});assert.deepEqual(editor.state.assets[0].crop,{x:.1});
    assert.equal(editor.state.assets[1].takes,'motion');assert.equal(editor.state.assets[1].ref_size,'max');
    assert.equal(editor.state.assets[2].takes,'copy');assert.deepEqual(editor.defaults,[]);
  });
  await test('untouched shot defaults keep existing max sizing and video sound probing',async()=>{
    const editor=newEditor();await editor.attachAssets([{kind:'video',path:'legacy.mp4'}]);
    assert.equal(editor.state.assets[0].ref_size,'max');assert.equal(editor.state.assets[0].takes,undefined);
    assert.deepEqual(editor.defaults,['ref-1']);
  });
  await test('image rejects audio roles; sound-only video accepts audio rather than picture scope',async()=>{
    const editor=newEditor();await editor.attachAssets([{kind:'image',path:'still.png',takes:'copy'},
      {kind:'video',path:'audio.mp4',track:'sound',takes:'ambience'}]);
    assert.equal(editor.state.assets[0].takes,undefined);assert.equal(editor.state.assets[1].takes,'ambience');
    assert.equal(referenceRole(editor.state.assets[1]),'voice');
  });
  await test('cast roles follow explicit action/edit; audio and still kinds remain valid',()=>{
    assert.equal(referenceRole({kind:'image',takes:'motion'}),'motion');
    assert.equal(referenceRole({kind:'video',takes:'edit'}),'replaces');
    assert.equal(referenceRole({kind:'video',takes:'continue'}),'replaces');
    assert.equal(referenceRole({kind:'video',takes:'edit',track:'sound'}),'voice');
    // Marked stills now identify a replacement target as well as edit videos.
    // Preserve the current role contract rather than the old video-only rule.
    assert.equal(referenceRole({kind:'image',takes:'edit'}),'replaces');
    assert.deepEqual(CAST_REFERENCE_TAKES.audio,['voice']);assert.ok(!CAST_REFERENCE_TAKES.video.includes('camera'));
  });
  await test('cast plus keeps every selected file and binds each matching role',async()=>{
    const editor=newEditor(),subject={handle:'subject',takes:'person',from:[]};
    chosen=[{kind:'image',path:'face.png',takes:'person',ref_size:'match'},
      {kind:'video',path:'edit.mp4',takes:'edit',track:'picture',ref_size:'max'},
      {kind:'image',path:'pose.png',takes:'motion',ref_size:'match'},
      {kind:'audio',path:'voice.wav',takes:'voice'}];
    const shelf=Object.assign(new Shelf(),{getAssets:()=>editor.state.assets,getCast:()=>[subject],addAsset:who=>editor.attachOneAsset(who),save:()=>{},});
    shelf.pickReference({},subject);
    await menu.sections.at(-1).rows[0].onPick();
    assert.equal(editor.state.assets.length,4);assert.deepEqual(subject.from,['ref-1']);
    assert.deepEqual(subject.replaces,['ref-2']);assert.deepEqual(subject.motion,['ref-3']);assert.equal(subject.voice,'ref-4');
    assert.equal(pickerOptions.referenceOptions.allowedTakes,CAST_REFERENCE_TAKES);
    assert.equal(pickerOptions.capacity('audio').max,1);assert.equal(pickerOptions.capacity('video').max,8);
    assert.equal(editor.state.assets[0].ref_size,'match');assert.equal(editor.state.assets[1].takes,'edit');
  });
  await test('legacy single-asset cast callback still works and inherits subject scene narrowing',async()=>{
    const asset={kind:'image',role:'reference',handle:'ref-1',filename:'scene.png'},subject={handle:'place',takes:'scene',from:[]};
    const shelf=Object.assign(new Shelf(),{getAssets:()=>[asset],getCast:()=>[subject],addAsset:async()=>asset,save:()=>{},});
    shelf.pickReference({},subject);await menu.sections.at(-1).rows[0].onPick();
    assert.deepEqual(subject.from,['ref-1']);assert.equal(asset.takes,'scene');
  });
  await test('timeline cast import attaches a mixed batch into the pool',async()=>{
    const timeline=Object.assign(new Timeline(),{timeline:{assets:[],segments:[{},{}]},commits:0});
    chosen=[{kind:'image',path:'a.png',takes:'style',ref_size:'match'},
      {kind:'video',path:'b.mp4',takes:'edit',ref_size:'max',track:'picture',trim:{start:2,end:7}}];
    const added=await timeline.attachOneCastAsset();assert.equal(added.length,2);
    assert.equal(timeline.timeline.assets.length,2);assert.equal(added[0].takes,'style');assert.equal(added[0].ref_size,'match');
    assert.equal(added[1].takes,'edit');assert.deepEqual(added[1].trim,{start:2,end:7});
  });
  await test('timeline cast import attaches all files to the only shot, not a hidden pool',async()=>{
    const timeline=Object.assign(new Timeline(),{timeline:{assets:[],segments:[{assets:[]}]},commits:0});
    chosen=[{kind:'image',path:'a.png'},{kind:'image',path:'b.png'}];
    const added=await timeline.attachOneCastAsset();assert.equal(added.length,2);
    assert.equal(timeline.timeline.assets.length,0);assert.equal(timeline.timeline.segments[0].assets.length,2);
  });
  await test('cast library keeps per-file role/size/track/trim/crop before saving',async()=>{
    const library=Object.assign(new Library(),{target:null,saved:0}),member={files:[]};
    chosen=[{kind:'video',path:'edit.mp4',takes:'edit',ref_size:'match',track:'picture',trim:{start:1,end:6},crop:{mirror:'x'}},
      {kind:'audio',path:'voice.wav',takes:'voice'}];
    await library.addFile(member);assert.equal(member.files.length,2);assert.equal(member.files[0].slot,'replaces');
    assert.equal(member.files[0].takes,'edit');assert.equal(member.files[0].ref_size,'match');
    assert.deepEqual(member.files[0].trim,{start:1,end:6});assert.deepEqual(member.files[0].crop,{mirror:'x'});
    assert.equal(member.files[1].slot,'voice');assert.equal(member.files[1].ref_size,undefined);assert.equal(library.saved,1);
    assert.equal(pickerOptions.capacity('audio').max,1);assert.equal(pickerOptions.capacity('image').max,8);
  });
  await test('cast library voice replacement keeps other files and their typed notes',async()=>{
    const library=Object.assign(new Library(),{target:null,saved:0});
    const kept={slot:'from',kind:'image',filename:'keep.png',note:'keep this note',trigger:'wake'};
    const member={files:[kept,{slot:'voice',kind:'audio',filename:'old.wav'}]};
    chosen=[{kind:'audio',path:'new.wav',takes:'voice'}];await library.addFile(member);
    assert.equal(member.files.length,2);assert.equal(member.files[0],kept);assert.equal(member.files[1].filename,'new.wav');
  });
  await test('removed cast member is not rebound when an open picker returns',async()=>{
    const subject={handle:'removed',takes:'person',from:[]};let saved=0;
    const shelf=Object.assign(new Shelf(),{getAssets:()=>[],getCast:()=>[],
      addAsset:async()=>[{handle:'ref-1',kind:'image',role:'reference',filename:'a.png'}],save:()=>{saved++;}});
    shelf.pickReference({},subject);await menu.sections.at(-1).rows[0].onPick();
    assert.deepEqual(subject.from,[]);assert.equal(saved,0);
  });
  await test('cast library reload preserves metadata and explicit narrowing over automatic default',()=>{
    const stored={handle:'subject',takes:'person',files:[{slot:'from',kind:'image',filename:'style.png',takes:'style',ref_size:'match',crop:{x:.2}},
      {slot:'motion',kind:'image',filename:'pose.png',takes:'motion'},
      {slot:'replaces',kind:'video',filename:'edit.mp4',takes:'continue',ref_size:'max',track:'picture',trim:{start:2,end:9}},
      {slot:'voice',kind:'audio',filename:'voice.wav',takes:'voice'}]};
    const timeline={assets:[],subjects:[],segments:[{},{}]};
    const subject=P.addSubjectToPiece(stored,timeline,{pool:true});
    assert.equal(timeline.assets[0].takes,'style');assert.equal(timeline.assets[0].ref_size,'match');
    assert.equal(timeline.assets[2].takes,'continue');assert.deepEqual(timeline.assets[2].trim,{start:2,end:9});
    const captured=P.captureSubject(subject,timeline.assets).data.cast;
    const style=captured.files.find(f=>f.filename==='style.png');assert.equal(style.takes,'style');assert.deepEqual(style.crop,{x:.2});
    assert.equal(captured.files.find(f=>f.filename==='edit.mp4').takes,'continue');
  });
  await test('reusing an existing library file updates the chosen takes as well as size',()=>{
    const timeline={assets:[{kind:'image',role:'reference',handle:'ref-1',filename:'same.png',takes:'person'}],subjects:[],segments:[{},{}]};
    P.addSubjectToPiece({handle:'subject',takes:'person',files:[{slot:'from',kind:'image',filename:'same.png',takes:'style',ref_size:'match'}]},timeline,{pool:true});
    assert.equal(timeline.assets.length,1);assert.equal(timeline.assets[0].takes,'style');assert.equal(timeline.assets[0].ref_size,'match');
  });
  await test('same-file replacement can change import settings without removing the handle',async()=>{
    const editor=newEditor(),asset={handle:'ref-1',role:'reference',kind:'video',filename:'same.mp4',takes:'person',ref_size:'max'};
    editor.state.assets=[asset];chosen=[{kind:'video',path:'same.mp4',takes:'edit',ref_size:'match',track:'picture',trim:{start:1,end:3}}];
    await editor.replaceAsset(asset);assert.equal(asset.handle,'ref-1');assert.equal(asset.takes,'edit');assert.equal(asset.ref_size,'match');
    assert.deepEqual(asset.trim,{start:1,end:3});
    assert.deepEqual(pickerOptions.referenceOptions,{takes:'person',ref_size:'max'});
  });
  await test('picture editing retains a seeded sheet size and narrowing when no options changed',async()=>{
    const editor=newEditor(),seed={handle:'ref-1',role:'reference',kind:'image',filename:'old-sheet.png',takes:'style',ref_size:'match',
      panels:[{handle:'img-1',filename:'source.png',takes:'style'}]};
    editor.state.assets=[seed];await editor.mergeSheet(seed,[{plate:true,kind:'image',path:'new-sheet.png',panels:[{path:'source.png',cut:true}]}]);
    assert.equal(editor.state.assets[0].handle,'ref-1');assert.equal(editor.state.assets[0].ref_size,'match');
    assert.equal(editor.state.assets[0].takes,'style');assert.equal(editor.state.assets[0].panels[0].takes,'style');
  });
  await test('pool sheet picture editing preserves old match/person settings and every panel handle',()=>{
    const seed={handle:'ref-7',role:'reference',kind:'image',filename:'old-sheet.png',takes:'person',ref_size:'match',
      panels:[{handle:'ref-3',filename:'a.png',takes:'person'},{handle:'ref-8',filename:'b.png',takes:'style'}]};
    const timeline=Object.assign(new Timeline(),{timeline:{assets:[seed]},commits:0});
    timeline.foldPoolSheet(seed,[{plate:true,kind:'image',path:'edited-sheet.png',panels:[{path:'a.png',cut:true},{path:'b.png',cut:false}]}]);
    const entry=timeline.timeline.assets[0];assert.equal(entry.handle,'ref-7');assert.equal(entry.ref_size,'match');assert.equal(entry.takes,'person');
    assert.deepEqual(entry.panels.map(panel=>panel.handle),['ref-3','ref-8']);assert.deepEqual(entry.panels.map(panel=>panel.takes),['person','style']);
  });
  await test('pool sheet explicit chosen options override old settings without changing panel handles',()=>{
    const seed={handle:'ref-7',role:'reference',kind:'image',filename:'old-sheet.png',takes:'person',ref_size:'match',
      panels:[{handle:'ref-3',filename:'a.png',takes:'person'}]};
    const timeline=Object.assign(new Timeline(),{timeline:{assets:[seed]},commits:0});
    timeline.foldPoolSheet(seed,[{plate:true,kind:'image',path:'edited-sheet.png',takes:'style',ref_size:'max',
      panels:[{path:'a.png',cut:true,takes:'object'}]}]);
    const entry=timeline.timeline.assets[0];assert.equal(entry.handle,'ref-7');assert.equal(entry.ref_size,'max');assert.equal(entry.takes,'style');
    assert.equal(entry.panels[0].handle,'ref-3');assert.equal(entry.panels[0].takes,'object');
  });
  await test('taking pool sheet apart preserves the heir settings and all loose import metadata',()=>{
    const seed={handle:'ref-7',role:'reference',kind:'image',filename:'old-sheet.png',takes:'person',ref_size:'match',
      panels:[{handle:'ref-3',filename:'a.png',takes:'person'}]};
    const timeline=Object.assign(new Timeline(),{timeline:{assets:[seed]},commits:0});
    timeline.foldPoolSheet(seed,[{kind:'image',path:'a.png'},{kind:'video',path:'loose.mp4',takes:'edit',ref_size:'match',
      track:'picture+sound',trim:{start:2,end:8},crop:{x:.1}}]);
    const [heir,loose]=timeline.timeline.assets;assert.equal(heir.handle,'ref-7');assert.equal(heir.takes,'person');assert.equal(heir.ref_size,'match');
    assert.equal(loose.takes,'edit');assert.equal(loose.ref_size,'match');assert.equal(loose.track,'picture+sound');
    assert.deepEqual(loose.trim,{start:2,end:8});assert.deepEqual(loose.crop,{x:.1});assert.equal(timeline.commits,1);
  });
  await test('same-file scope/size change preserves trim, crop, track and valid saved mods',async()=>{
    const editor=newEditor(),asset={handle:'ref-1',role:'reference',kind:'video',filename:'same.mp4',takes:'person',ref_size:'max',
      trim:{start:1,end:8},crop:{x:.2},track:'picture+sound',mods:{h3:'refmod:kept'}};
    editor.state.assets=[asset];chosen=[{kind:'video',path:'same.mp4',takes:'edit',ref_size:'match'}];
    await editor.replaceAsset(asset);assert.deepEqual(asset.trim,{start:1,end:8});assert.deepEqual(asset.crop,{x:.2});
    assert.equal(asset.track,'picture+sound');assert.deepEqual(asset.mods,{h3:'refmod:kept'});assert.deepEqual(editor.defaults,[]);
  });
  await test('removed reference is not rewritten when an open replacement picker returns',async()=>{
    const editor=newEditor(),asset={handle:'ref-1',role:'reference',kind:'image',filename:'old.png',takes:'person'};
    chosen=[{kind:'image',path:'new.png',takes:'style',ref_size:'match'}];
    await editor.replaceAsset(asset);assert.equal(asset.filename,'old.png');assert.equal(asset.takes,'person');assert.equal(editor.commits,0);
  });
  await test('non-H3 prestage cast plus no longer discards a batch; forced-purpose selectors stay unchanged',async()=>{
    const prestage=Object.assign(new Prestage(),{state:{refs:[]},commits:0});chosen=[{kind:'image',path:'a.png'},{kind:'image',path:'b.png'}];
    const added=await prestage.attachOneRef({handle:'subject'});assert.equal(added.length,2);assert.equal(prestage.state.refs.length,2);
    assert.equal(pickerOptions.referenceOptions,undefined);
    for(const name of ['pickScreenContent','addGuide','setFrame'])assert.ok(!method('editor',name).includes('referenceOptions'),name);
    assert.ok(!method('soundlane','add').includes('referenceOptions'),'literal Sound lane cannot consume reference scope/size');
  });
  process.stdout.write(`PASS ${passed} actual import-context checks\n`);
})().catch(error=>{console.error(error);process.exitCode=1;});
