// Isolated browser checks: real pool chip, replacement, picker option methods,
// preview viewer and CSS. API/state seams are stubbed; no ComfyUI/GPU render.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const timeline = read('timeline.js'), picker = read('picker.js'), dom = read('dom.js');
const method = (source, name) => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, name); return found[0];
};
const helper = name => dom.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'))[0].replace(/^export /, '');
const preview = read('reference-preview.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const css = ['base', 'timeline', 'editor', 'overlays'].map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code = `
${helper('el')}
${helper('mountOverlay')}
${helper('swappable')}
const t = (text, vars = {}) => text.replace(/\\{([^}]+)\\}/g, (_, key) => vars[key] ?? key);
const icon = () => el('span');
const S = {
  assetOwners: () => [], poolCitedGlobally: (piece,a) => piece.prompt.includes('@'+a.handle),
  poolCitations: () => [1], poolDoubles: () => [], tagIndex: () => 0,
  thumbCrop: a => a.crop ?? null, isPlate: () => false, croppable: () => false,
  plateSpec: () => false, takeable: () => false, sizeable: () => false,
  takes: a => a.takes || 'full', refSize: a => a.ref_size || 'max',
  trackFor: a => String(a.path || a.filename).startsWith('refmod:') ? 'picture' : a.track || 'picture',
  dropMods: a => { delete a.mods; }, nextPoolHandle: piece => 'ref-'+(piece.assets.length+1),
  isRefMod: a => String(a?.filename || '').startsWith('refmod:'),
};
window.urlCalls=[];
const viewUrl = (file,opts) => {urlCalls.push({file,opts});return file.endsWith('.webm')?videoUrl:imageUrl;};
${preview}
let answer = null, pendingAnswer = null;
window.pickerCalls=[];
const openPicker = options => {pickerCalls.push(options);return pendingAnswer || Promise.resolve(answer);};
class Pool {
 ${['poolChip','poolEntry','replacePoolAsset'].map(name=>method(timeline,name)).join('\n')}
 commit() { this.commits++; }
 citeInGlobal() { this.cites++; }
 foldPoolSheet(asset,chosen) { this.plates.push({asset,chosen}); }
}
class PickerOptions {
 ${['targetKind','referenceFile','referenceTakes','referenceSizeable','referencePick'].map(name=>method(picker,name)).join('\n')}
}
const takeOptions = a => a.kind === 'video' ? ['full','edit','motion','scene','person'] : ['full','person','scene','object','style'];
window.mountPool = (kind='image') => {
  document.querySelector('#pool-fixture')?.remove();
  const asset={kind,role:'reference',filename:kind==='video'?'motion.webm':kind==='audio'?'voice.wav':'portrait.png',handle:'ref-1',takes:kind==='video'?'edit':'person',ref_size:'max',mods:{h3:'saved.safetensors'},crop:{x:0.1},trim:{start:1,end:2},...(kind==='video'?{track:'picture'}:{})};
  const piece={prompt:'Global @ref-1 @subject',soundscape:'Room tone',music:'N/A',assets:[asset],subjects:[{handle:'subject',from:['ref-1']}],segments:[{prompt:'Repeat @ref-1 and @ref-1 @subject'}]};
  window.asset=asset;window.pool=Object.assign(new Pool(),{timeline:piece,commits:0,cites:0,plates:[]});
  const host=el('div',{id:'pool-fixture'},[pool.poolChip(asset)]);document.body.append(host);
  pickerCalls.length=0;answer=null;pendingAnswer=null;
};
window.setAnswer = value => {answer=value;pendingAnswer=null;};
window.deferPicker = () => {pendingAnswer=new Promise(resolve=>{window.resolvePicker=resolve;});};
window.PickerOptions=PickerOptions;
window.flush=()=>new Promise(resolve=>setTimeout(resolve,0));
window.previewable=previewable;window.openReferencePreview=openReferencePreview;
`;
new (require('node:vm').Script)(code, {filename:'pool-reference-fixture.js'});
const results=[];
let browser,requests=0;
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
(async()=>{
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<style>'+css+'</style><body></body>');
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=96;canvas.getContext('2d').fillRect(0,0,64,96);
    window.imageUrl=canvas.toDataURL();
    const chunks=[],stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
    recorder.ondataavailable=e=>chunks.push(e.data);
    const ended=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
    await new Promise(resolve=>setTimeout(resolve,300));recorder.stop();await ended;stream.getTracks().forEach(track=>track.stop());
    window.videoUrl=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
  });
  await page.evaluate('(()=>{'+code+'})()');
  for(const kind of ['image','video']) {
    await check(kind+' thumbnail: single click inert, double click previews without replacement',async()=>{
      await page.evaluate(kind=>mountPool(kind),kind);
      const before=await page.evaluate(()=>JSON.stringify(pool.timeline));
      const thumb=page.locator('#pool-fixture .mmc-asset-thumb');
      assert.match(await thumb.getAttribute('title'),/Double-click to preview @ref-1\. Click the handle to replace its file\./);
      await thumb.click();await page.evaluate(()=>flush());
      assert.deepEqual(await page.evaluate(()=>[pickerCalls.length,pool.commits,pool.cites,document.querySelectorAll('.mmc-reference-preview').length]),[0,0,0,0]);
      await thumb.dblclick();
      assert.equal(await page.locator('.mmc-reference-preview').count(),1);
      assert.equal(await page.locator('.mmc-reference-preview-stage '+(kind==='video'?'video':'img')).count(),1);
      assert.deepEqual(await page.evaluate(()=>[pickerCalls.length,pool.commits,pool.cites]),[0,0,0]);
      assert.equal(await page.evaluate(()=>JSON.stringify(pool.timeline)),before);
      if(kind==='video') assert.deepEqual(await page.evaluate(()=>{const v=document.querySelector('.mmc-reference-preview video');return {controls:v.controls,autoplay:v.autoplay,paused:v.paused,opts:urlCalls.at(-1).opts??null};}),{controls:true,autoplay:false,paused:true,opts:null});
      await page.keyboard.press('Escape');
    });
  }
  await check('Mouse and Enter on @handle reselect its file rather than cite the global prompt',async()=>{
    await page.evaluate(()=>mountPool('image'));
    const handle=page.locator('#pool-fixture button.mmc-tl-pool-cite');
    assert.match(await handle.getAttribute('title'),/Swap the file behind @ref-1.*handle stays/);
    await handle.click();await page.evaluate(()=>flush());
    await handle.focus();await page.keyboard.press('Enter');await page.evaluate(()=>flush());
    assert.deepEqual(await page.evaluate(()=>({calls:pickerCalls.length,cites:pool.cites,commits:pool.commits,prompt:pool.timeline.prompt,options:{kinds:pickerCalls[0].kinds,kind:pickerCalls[0].kind,only:pickerCalls[0].only,single:pickerCalls[0].single,capacity:pickerCalls[0].capacity(),referenceOptions:pickerCalls[0].referenceOptions}})),{calls:2,cites:0,commits:0,prompt:'Global @ref-1 @subject',options:{kinds:['image','renders'],kind:'image',only:'image',single:true,capacity:{used:0,max:1,filesLeft:1},referenceOptions:{takes:'person',ref_size:'max'}}});
  });
  await check('Reference picker cancellation leaves file, options, citations and cast unchanged',async()=>{
    assert.equal(await page.evaluate(async()=>{
      mountPool('video');const before=JSON.stringify(pool.timeline);setAnswer(null);await pool.replacePoolAsset(asset);
      setAnswer([]);await pool.replacePoolAsset(asset);return before===JSON.stringify(pool.timeline)&&pool.commits===0;
    }),true);
  });
  await check('Replacement preserves the handle, existing prompts and cast ownership',async()=>{
    assert.deepEqual(await page.evaluate(async()=>{
      mountPool('image');const subjects=JSON.stringify(pool.timeline.subjects),segments=JSON.stringify(pool.timeline.segments),prompt=pool.timeline.prompt;
      setAnswer([{kind:'image',path:'replacement.png',takes:'person',ref_size:'match'}]);await pool.replacePoolAsset(asset);
      return {filename:asset.filename,handle:asset.handle,role:asset.role,takes:asset.takes,size:asset.ref_size,mods:Object.hasOwn(asset,'mods'),trim:Object.hasOwn(asset,'trim'),crop:Object.hasOwn(asset,'crop'),preserved:subjects===JSON.stringify(pool.timeline.subjects)&&segments===JSON.stringify(pool.timeline.segments)&&prompt===pool.timeline.prompt,commits:pool.commits,cites:pool.cites};
    }),{filename:'replacement.png',handle:'ref-1',role:'reference',takes:'person',size:'match',mods:false,trim:false,crop:false,preserved:true,commits:1,cites:0});
  });
  await check('Video replacement applies picker timing, crop, soundtrack, takes and encoding size',async()=>{
    assert.deepEqual(await page.evaluate(async()=>{
      mountPool('video');setAnswer([{kind:'video',path:'replacement.webm',track:'picture+sound',trim:{start:0.5,end:4.2},crop:{x:0.2,y:0.1},takes:'motion',ref_size:'match'}]);await pool.replacePoolAsset(asset);
      return {filename:asset.filename,handle:asset.handle,track:asset.track,trim:asset.trim,crop:asset.crop,takes:asset.takes,size:asset.ref_size,mods:Object.hasOwn(asset,'mods'),commits:pool.commits};
    }),{filename:'replacement.webm',handle:'ref-1',track:'picture+sound',trim:{start:0.5,end:4.2},crop:{x:0.2,y:0.1},takes:'motion',size:'match',mods:false,commits:1});
  });
  await check('Reselecting the same path still applies changed reference options',async()=>{
    assert.deepEqual(await page.evaluate(async()=>{
      mountPool('video');setAnswer([{kind:'video',path:asset.filename,track:'picture+sound',trim:{start:0,end:3},takes:'motion',ref_size:'match'}]);await pool.replacePoolAsset(asset);
      return {filename:asset.filename,track:asset.track,trim:asset.trim,takes:asset.takes,size:asset.ref_size,mods:Object.hasOwn(asset,'mods'),commits:pool.commits};
    }),{filename:'motion.webm',track:'picture+sound',trim:{start:0,end:3},takes:'motion',size:'match',mods:true,commits:1});
  });
  await check('Same-file scope or encoding-size changes preserve existing media framing and saved mods',async()=>{
    assert.deepEqual(await page.evaluate(async()=>{
      mountPool('video');const crop=asset.crop,trim=asset.trim,mods=asset.mods,track=asset.track;
      setAnswer([{kind:'video',path:asset.filename,takes:'motion',ref_size:'match'}]);await pool.replacePoolAsset(asset);
      return {filename:asset.filename,takes:asset.takes,size:asset.ref_size,preserved:asset.crop===crop&&asset.trim===trim&&asset.mods===mods&&asset.track===track,commits:pool.commits};
    }),{filename:'motion.webm',takes:'motion',size:'match',preserved:true,commits:1});
  });
  await check('A reference removed while the picker is open cannot be mutated or committed',async()=>{
    assert.equal(await page.evaluate(async()=>{
      mountPool('image');const before=JSON.stringify(asset);deferPicker();const work=pool.replacePoolAsset(asset);pool.timeline.assets=[];
      resolvePicker([{kind:'image',path:'stale.png',takes:'scene',ref_size:'match'}]);await work;
      return before===JSON.stringify(asset)&&pool.timeline.assets.length===0&&pool.commits===0;
    }),true);
  });
  await check('Nonvisual audio retains its established single-click file replacement',async()=>{
    await page.evaluate(()=>mountPool('audio'));await page.locator('#pool-fixture .mmc-asset-thumb').click();await page.evaluate(()=>flush());
    assert.deepEqual(await page.evaluate(()=>[pickerCalls.length,pool.cites,document.querySelectorAll('.mmc-reference-preview').length]),[1,0,0]);
  });
  await check('Picker reference metadata reaches new pool entries unchanged',async()=>{
    assert.deepEqual(await page.evaluate(()=>{
      mountPool('video');const row={kind:'video',path:'imported.webm'},options=Object.assign(new PickerOptions(),{options:{referenceOptions:{takes:'edit',ref_size:'max'}},referenceDefaults:{takes:'edit',ref_size:'max'},referenceChanges:new Set(),settings:new Map([[row.path,{takes:'motion',ref_size:'match',track:'picture+sound',trim:{start:0.2,end:2.4},crop:{x:0.25}}]])});
      const picked=options.referencePick(row,false),entry=pool.poolEntry(picked);
      return {entry,sourceUnchanged:JSON.stringify(row)===JSON.stringify({kind:'video',path:'imported.webm'})};
    }),{entry:{handle:'ref-2',kind:'video',role:'reference',filename:'imported.webm',ref_size:'match',track:'picture+sound',takes:'motion',trim:{start:0.2,end:2.4},crop:{x:0.25}},sourceUnchanged:true});
  });
  await check('Untouched importer defaults stay omitted while seeded replacement metadata stays explicit',async()=>{
    assert.deepEqual(await page.evaluate(()=>{
      const row={kind:'image',path:'unconfigured.png'},options=Object.assign(new PickerOptions(),{options:{referenceOptions:{}},referenceDefaults:{takes:'full',ref_size:'max'},referenceChanges:new Set(),settings:new Map()});
      const untouched=options.referencePick(row,false);
      options.options.referenceOptions={takes:'person',ref_size:'match'};options.referenceDefaults={takes:'person',ref_size:'match'};
      const seeded=options.referencePick(row,false);return {untouched,seeded};
    }),{untouched:{kind:'image',path:'unconfigured.png'},seeded:{kind:'image',path:'unconfigured.png',takes:'person',ref_size:'match'}});
  });
  assert.equal(requests,0);
  console.log(JSON.stringify({passed:results.length,networkRequests:requests,scope:'isolated browser: actual pool/preview/picker methods; stubbed API/state; local synthetic media; no ComfyUI/GPU'}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
