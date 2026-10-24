// Production PromptBox + reference viewer + DOM/CSS. API/media adapters are
// in-memory. No server, user media mutation, queue, model, or GPU execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..'), 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dom = read('dom.js'), stateSource = read('state.js');
const fn = (name, source=dom) => {
  const found=source.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production ${name}`);return found[0].replace(/^export /,'');
};
const strip = source => source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const css=['base','editor','picker','overlays','popovers'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko=read('locales/ko.js').replace(/^export const /m,'window.ko = ');
const code=`
${['el','svg','icon','keepScroll','floatAbove','mountOverlay'].map(name=>fn(name)).join('\n')}
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
${fn('motionOf',stateSource)}
${fn('subjectFiles',stateSource)}
let locale='en';
const t=(text,values={})=>(locale==='ko'?window.ko[text]||text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const S={isRefMod:asset=>String(asset?.filename||'').startsWith('refmod:'),thumbCrop:asset=>asset.crop??null};
const tagIndex=handle=>Number(handle.match(/\\d+/)?.[0]||0)%8;
const citedSubjects=(texts,subjects)=>new Set(subjects.filter(s=>texts.some(text=>text.includes('@'+s.handle))).map(s=>s.handle));
const castFactsLine=()=>'';
const listPresets=async()=>[];
const listAssets=async()=>[];
const loadBody=async()=>null;
const LANGUAGES=['English'];
const refineSettings=()=>({});
const layoutVariations=()=>({marks:[],off:[]});
window.urlCalls=[];
const viewUrl=(file,options)=>{
 urlCalls.push({file,options});
 if(file==='bad.mp4')return 'data:video/mp4;base64,AAAA';
 if(/\\.(wav|mp3)$/.test(file))return audioUrl;
 if(/\\.(mp4|webm)$/.test(file))return videoUrl;
 return imageUrl;
};
${strip(read('reference-preview.js'))}
${strip(read('prompt.js'))}
window.setFixture=(options={})=>{
 window.box?.closeMenu();document.querySelector('#fixture')?.remove();locale=options.locale||'en';
 window.changes={input:[],cited:[],uncited:[],cast:[]};
 const asset=(handle,kind='image',filename=handle+'.png')=>({handle,kind,role:'reference',filename});
 window.state={assets:[asset('ref-1'),asset('ref-11')],prompt:options.prompt||'Use @ref-1:start, @ref-1 and @ref-11.',
  screens:[{handle:'phone-1',content:{filename:'screen.png',kind:'image'}},{handle:'laptop-1',content:{filename:'screen.mp4',kind:'video'}}]};
 window.pool=[asset('ref-2'),asset('ref-3','video','motion.mp4'),asset('ref-4','audio','voice.wav'),
  {...asset('ref-5','video','sound.mp4'),track:'sound'},asset('ref-6','video','bad.mp4'),
  ...Array.from({length:18},(_,index)=>asset('ref-'+(index+20)))];
 window.cast=[{handle:'subject',from:['ref-2'],motion:['ref-3'],voice:'ref-4'},
  {handle:'subject_2',from:['ref-20']},{handle:'subject_3',from:['ref-4']},{handle:'vacant'}];
 window.box=new PromptBox({getState:()=>state,getPool:()=>pool,getCast:()=>cast,
  getScreens:()=>state.screens.map(screen=>({handle:screen.handle,label:'Device',file:screen.content?.filename||''})),
  replaceHandles:true,attachBlocked:()=>null,onAttach:()=>null,
  onInput:value=>{state.prompt=value;changes.input.push(value);},
  onCited:handles=>changes.cited.push(...handles),onUncited:handles=>changes.uncited.push(...handles),
  onCastChip:handle=>changes.cast.push(handle)});
 const host=el('div',{id:'fixture',class:'mmc-root'},[box.frame]);document.body.append(host);box.setValue(state.prompt);
 window.stateBefore=JSON.stringify({state,pool,cast});
};
window.openHandle=(handle='ref-1',index=0)=>{
 const chips=[...box.root.querySelectorAll('[data-handle]')].filter(node=>node.dataset.handle===handle);
 box.editHandle(chips[index]);
};
window.rowFor=handle=>box.rows.find(row=>row.querySelector('.mmc-mention-handle')?.textContent==='@'+handle);
window.previewThumb=handle=>rowFor(handle)?.querySelector('.mmc-reference-preview-target');
window.setTarget=value=>{box.replacing.field.value=value;box.replacing.field.dispatchEvent(new Event('input',{bubbles:true}));};
window.snapshotChoice=()=>({field:box.replacing.field.value,all:box.replacing.all,prompt:box.getValue(),state:JSON.stringify({state,pool,cast}),edits:changes.input.length});
window.viewerDefault=()=>openReferencePreview([{filename:'voice.wav',kind:'audio'},{filename:'motion.mp4',kind:'video'}]);
setFixture();openHandle();
`;
new vm.Script(code,{filename:'handle-replacement-preview-production-fixture.js'});
let browser,requests=0;const checks=[];
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1350,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>:root{--comfy-menu-bg:#171717;--fg-color:#ddd;--input-text:#ddd;--mmc-type:1}body{margin:0;background:#171717;color:#ddd}#fixture{margin:120px 30px;width:800px}.mmc-prompt{min-height:180px}${css}</style>`);
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#73a';ctx.fillRect(0,0,96,64);window.imageUrl=canvas.toDataURL();
  const parts=[],stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
  recorder.ondataavailable=event=>parts.push(event.data);const ended=new Promise(resolve=>recorder.onstop=resolve);
  recorder.start();let frame=0;
  const ticker=setInterval(()=>{ctx.fillStyle=++frame%2?'#73a':'#3a7';ctx.fillRect(0,0,96,64);},45);
  await new Promise(resolve=>setTimeout(resolve,600));clearInterval(ticker);recorder.stop();await ended;
  stream.getTracks().forEach(track=>track.stop());window.videoUrl=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));
  // One-second synthetic PCM silence; proves native controls/load, not fidelity.
  const data=new ArrayBuffer(44+16000*2),view=new DataView(data),write=(at,text)=>[...text].forEach((char,i)=>view.setUint8(at+i,char.charCodeAt(0)));
  write(0,'RIFF');view.setUint32(4,data.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,32000,true);
  window.audioUrl=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
 });
 await page.addScriptTag({content:ko});await page.addScriptTag({content:code});
 const thumb=handle=>page.locator('.mmc-handle-list .mmc-mention-row').filter({has:page.locator('.mmc-mention-handle',{hasText:new RegExp('^@'+handle+'$')})}).locator('.mmc-mention-thumb');
 const reset=async options=>page.evaluate(options=>{setFixture(options);openHandle(options?.handle||'ref-1');},options);
 await check('replacement-only 540px width and 840px preferred height with a flexible scrolling list, viewport-clamped',async()=>{
  const got=await page.evaluate(()=>{const m=box.menu.getBoundingClientRect(),l=box.replacing.list;return{width:m.width,height:m.height,left:m.left,right:m.right,bottom:m.bottom,list:l.clientHeight,overflow:l.scrollHeight>l.clientHeight,head:box.menu.querySelector('.mmc-mention-head').getBoundingClientRect().top,actions:box.menu.querySelector('.mmc-handle-actions').getBoundingClientRect().bottom};});
  assert.equal(got.width,540);assert.equal(got.height,840);assert.ok(got.list>600);assert.ok(got.overflow&&got.left>=8&&got.right<=1342&&got.bottom<=992&&got.actions<=got.bottom);
  if(artifacts)await page.screenshot({path:path.join(artifacts,'handle-replacement-en-expanded.png')});
 });
 await check('independent thumbnail and selection buttons, no nested buttons',async()=>{
  assert.equal(await page.locator('.mmc-handle-list button button,.mmc-handle-list button [role="button"]').count(),0);
  assert.equal(await page.locator('.mmc-handle-choice').count(),25);
 });
 await check('single row and thumbnail clicks choose, never apply',async()=>{
  await page.evaluate(()=>rowFor('ref-2').querySelector('.mmc-handle-choice').click());
  assert.equal(await page.evaluate(()=>box.replacing.field.value),'ref-2');
  await thumb('ref-3').click();await page.waitForTimeout(320);
  assert.deepEqual(await page.evaluate(()=>[box.replacing.field.value,box.getValue(),changes.input.length]),['ref-3','Use @ref-1:start, @ref-1 and @ref-11.',0]);
 });
 await check('image double-click preserves manual target, scope, prompt and state',async()=>{
  await reset();await page.evaluate(()=>{setTarget('ref');box.replacing.field.value='ref-4';box.replacing.every.click();window.choice=snapshotChoice();});
  await thumb('ref-2').dblclick();await page.waitForTimeout(330);
  assert.equal(await page.locator('.mmc-reference-preview-stage img').count(),1);
  assert.deepEqual(await page.evaluate(()=>snapshotChoice()),await page.evaluate(()=>choice));
  assert.equal(await page.evaluate(()=>box.menu.style.display),'none');
  await page.locator('.mmc-reference-preview .mmc-close').click();
  assert.deepEqual(await page.evaluate(()=>snapshotChoice()),await page.evaluate(()=>choice));
  assert.ok(await page.evaluate(()=>box.menu.isConnected&&document.activeElement===box.replacing.field&&box.menu.style.display===''));
 });
 await check('source video native controls, no autoplay/crop/trim and Escape returns to picker',async()=>{
  await reset();await thumb('ref-3').dblclick();
  await page.waitForFunction(()=>document.querySelector('.mmc-reference-preview video')?.readyState>=1,{timeout:5000});
  assert.deepEqual(await page.evaluate(()=>{const media=document.querySelector('.mmc-reference-preview video');return[media.controls,media.autoplay,media.paused,urlCalls.at(-1).file,urlCalls.at(-1).options??null];}),[true,false,true,'motion.mp4',null]);
  if(artifacts)await page.screenshot({path:path.join(artifacts,'handle-replacement-video-preview.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-reference-preview').count(),0);
  assert.ok(await page.evaluate(()=>box.replacing&&!box.replacing.previewing&&document.activeElement===box.replacing.field));
 });
 await check('audio and sound-only video opt-in previews are paused native audio controls',async()=>{
  for(const handle of ['ref-4','ref-5']){
   await reset();await thumb(handle).dblclick();
   const media=page.locator('.mmc-reference-preview-stage audio');assert.equal(await media.count(),1);
   assert.deepEqual(await media.evaluate(audio=>[audio.controls,audio.autoplay,audio.paused]),[true,false,true]);
   const captured=await media.elementHandle();await page.locator('.mmc-reference-preview .mmc-close').click();
   assert.deepEqual(await captured.evaluate(audio=>[audio.paused,audio.hasAttribute('src'),audio.isConnected]),[true,false,false]);
  }
 });
 await check('viewer backdrop closes only viewer and restores replacement selection',async()=>{
  await reset();await page.evaluate(()=>{setTarget('ref');box.replacing.field.value='ref-4';});await thumb('ref-2').dblclick();
  await page.locator('.mmc-reference-preview-overlay').click({position:{x:2,y:2}});
  assert.deepEqual(await page.evaluate(()=>[!!box.replacing,box.replacing.field.value,box.menu.style.display,changes.input.length]),[true,'ref-4','',0]);
 });
 await check('double preview A then single select B has no delayed A selection',async()=>{
  await reset();await thumb('ref-2').dblclick();await page.keyboard.press('Escape');await thumb('ref-3').click();await page.waitForTimeout(330);
  assert.equal(await page.evaluate(()=>box.replacing.field.value),'ref-3');
 });
 await check('thumbnail Enter chooses; Space previews without editing and keeps keyboard focus',async()=>{
  await reset();await thumb('ref-3').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>box.replacing.field.value),'ref-3');
  await thumb('ref-2').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('.mmc-reference-preview-stage img').count(),1);
  assert.equal(await page.evaluate(()=>box.replacing.field.value),'ref-3');
  await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.activeElement===box.replacing.field));
 });
 await check('freshly replaced source is resolved at double-click, removed source never opens',async()=>{
  await reset();await page.evaluate(()=>{pool.find(row=>row.handle==='ref-3').filename='replaced.mp4';});await thumb('ref-3').dblclick();
  assert.equal(await page.evaluate(()=>urlCalls.at(-1).file),'replaced.mp4');await page.keyboard.press('Escape');
  await page.evaluate(()=>{pool=pool.filter(row=>row.handle!=='ref-3');});await thumb('ref-3').dblclick();await page.waitForTimeout(330);
  assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.equal(await page.evaluate(()=>box.menu.style.display),'');
 });
 await check('stale delayed thumbnail choice cannot change a new replacement menu',async()=>{
  await reset();await thumb('ref-3').click();await page.evaluate(()=>{box.closeMenu();openHandle();box.replacing.field.value='ref-2';});await page.waitForTimeout(330);
  assert.equal(await page.evaluate(()=>box.replacing.field.value),'ref-2');assert.equal(await page.evaluate(()=>changes.input.length),0);
 });
 await check('cast previews current available face, motion and voice; no-file cast stays selection-only',async()=>{
  await reset({prompt:'@subject waits with @subject_2.',handle:'subject'});
  await thumb('subject').dblclick();assert.equal(await page.locator('.mmc-reference-preview-stage img').count(),1);
  await page.getByRole('button',{name:'Next reference',exact:true}).click();assert.equal(await page.locator('.mmc-reference-preview-stage video').count(),1);
  await page.getByRole('button',{name:'Next reference',exact:true}).click();assert.equal(await page.locator('.mmc-reference-preview-stage audio').count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>previewThumb('vacant')),null);
  await page.evaluate(()=>rowFor('vacant').querySelector('.mmc-handle-choice').click());assert.equal(await page.evaluate(()=>box.replacing.field.value),'vacant');
 });
 await check('screen known content previews, empty/unknown sources are not fabricated',async()=>{
  await reset({prompt:'Place @phone-1 beside @laptop-1.',handle:'phone-1'});await thumb('laptop-1').dblclick();
  assert.equal(await page.locator('.mmc-reference-preview-stage video').count(),1);assert.equal(await page.evaluate(()=>urlCalls.at(-1).file),'screen.mp4');
  await page.keyboard.press('Escape');await page.evaluate(()=>{state.screens[1].content=null;});await thumb('laptop-1').dblclick();
  assert.equal(await page.locator('.mmc-reference-preview').count(),0);
 });
 await check('unsupported media displays real error and remains cancellable',async()=>{
  await reset();await thumb('ref-6').dblclick();await page.locator('.mmc-reference-preview-error').waitFor({state:'visible'});
  assert.match(await page.locator('.mmc-reference-preview-error').textContent(),/Preview unavailable/);
  await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>!!box.replacing));
 });
 await check('owner close tears down active viewer and cannot revive picker',async()=>{
  await reset();await thumb('ref-4').dblclick();await page.evaluate(()=>box.closeMenu());await page.waitForTimeout(330);
  assert.deepEqual(await page.evaluate(()=>[box.menu,box.replacing,document.querySelectorAll('.mmc-reference-preview').length]),[null,null,0]);
 });
 await check('Escape closes viewer, then replacement menu, with no hidden orphan layer',async()=>{
  await reset();await thumb('ref-2').dblclick();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mmc-handle-replace').count(),1);await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>[box.menu,box.replacing,document.querySelectorAll('.mmc-reference-preview').length]),[null,null,0]);
 });
 await check('single/exact-all replacements still preserve scope, prefix and citation lifecycle',async()=>{
  await reset();await page.evaluate(()=>{setTarget('ref-2');box.applyReplacement();});
  assert.equal(await page.evaluate(()=>state.prompt),'Use @ref-2:start, @ref-1 and @ref-11.');
  await reset();await page.evaluate(()=>{setTarget('ref-2');box.replacing.every.click();box.applyReplacement();});
  assert.equal(await page.evaluate(()=>state.prompt),'Use @ref-2:start, @ref-2 and @ref-11.');
  assert.deepEqual(await page.evaluate(()=>[changes.input.length,changes.cited,changes.uncited]),[1,['ref-2'],['ref-1']]);
 });
 await check('manual number + Enter, cancel, cast shortcut, stale prompt protections remain',async()=>{
  await reset({prompt:'@subject waits.',handle:'subject'});await page.locator('.mmc-handle-search input').fill('3');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>state.prompt),'@subject_3 waits.');
  await reset({prompt:'@subject waits.',handle:'subject'});await page.locator('.mmc-handle-edit').click();assert.deepEqual(await page.evaluate(()=>[changes.cast,changes.input.length]),[['subject'],0]);
  await reset();await page.evaluate(()=>{setTarget('ref-2');box.setValue('A changed @ref-1.');box.applyReplacement();});
  assert.match(await page.locator('.mmc-handle-note').textContent(),/prompt changed/);await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>box.getValue()),'A changed @ref-1.');
 });
 await check('ordinary autocomplete rows and default viewer retain visual-only behavior',async()=>{
  await reset();await page.evaluate(()=>{box.closeMenu();box.mode='@';box.menu=el('div',{class:'mmc-mention'});document.body.append(box.menu);box.query='';box.renderMenu();});
  assert.equal(await page.locator('.mmc-mention .mmc-reference-preview-target').count(),0);
  assert.ok(await page.evaluate(()=>box.rows.every(row=>row.tagName==='BUTTON')));
  await page.evaluate(()=>{box.closeMenu();viewerDefault();});assert.equal(await page.locator('.mmc-reference-preview-stage audio').count(),0);
  assert.equal(await page.locator('.mmc-reference-preview-count').textContent(),'1 / 1');await page.keyboard.press('Escape');
 });
 await check('KO 320px enlarged text keeps viewport, input/scope/actions and list scrolling',async()=>{
  await page.setViewportSize({width:320,height:680});await page.evaluate(()=>{document.documentElement.style.setProperty('--mmc-type','1.6');document.querySelector('#fixture').style.width='auto';});
  await reset({locale:'ko'});await page.evaluate(()=>{document.querySelector('#fixture').style.width='auto';});
  const got=await page.evaluate(()=>{const rect=box.menu.getBoundingClientRect(),actions=box.menu.querySelector('.mmc-handle-actions').getBoundingClientRect();return{left:rect.left,right:rect.right,bottom:rect.bottom,actions:actions.bottom,list:box.replacing.list.clientHeight,over:box.replacing.list.scrollHeight>box.replacing.list.clientHeight,field:box.replacing.field.getBoundingClientRect().right,width:box.menu.scrollWidth-box.menu.clientWidth};});
  assert.ok(got.left>=8&&got.right<=312&&got.bottom<=672&&got.actions<=got.bottom&&got.list>30&&got.over&&got.field<=312&&got.width<=1,JSON.stringify(got));
  if(artifacts)await page.screenshot({path:path.join(artifacts,'handle-replacement-ko-320-large.png')});
 });
 assert.deepEqual(errors,[],'No page errors');assert.equal(requests,0,'No external requests');
 console.log(JSON.stringify({passed:checks.length,networkRequests:requests,scope:'real PromptBox/viewer/DOM/CSS; stub API/state and synthetic local media, not ComfyUI/render/listening validation'}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
