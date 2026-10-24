// Complete production CastShelf and reference viewer modules in an isolated DOM
// with real CSS/DOM helpers. Only host/catalog/media/execution adapters are fake.
// Synthetic in-memory media, no ComfyUI, disk-media changes, queue or GPU work.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(sourceRoot,'web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const cast=read('cast.js'),state=read('state.js'),dom=read('dom.js');
const method=(name,text=cast)=>{const found=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(found,`Production method ${name}`);return found[0];};
const fn=(name,text=dom)=>{const found=text.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(found,`Production function ${name}`);return found[0].replace(/^export /,'');};
const constant=(name,text=state)=>{const found=text.match(new RegExp(`^export const ${name} =[^]*?;`,'m'));assert.ok(found,`Production const ${name}`);return found[0].replace(/^export /,'');};
const stripModule=text=>text.replace(/^import\b[^]*?;\r?\n/gm,'').replace(/^export /gm,'');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator'):path.resolve(__dirname,'../../../baseline/web/creator');
if(fs.existsSync(path.join(baseline,'cast.js'))){const original=fs.readFileSync(path.join(baseline,'cast.js'),'utf8');
 for(const name of ['placeRow','pickPlace','pickMarker','pickTakes','markerButton','nameField','descriptionField','featureRow','setRole','addRole','clearRole','addSubject','reveal','reseed','save']){
  const body=method(name);const normalized=name==='pickMarker'?body.replace(/^      policy: true,\r?\n/m,''):body;
  assert.equal(normalized,method(name,original),`${name} original state/actions remain exact outside policy-menu presentation option`);
 }
}
assert.match(method('openCard'),/this\.markerButton\(subject\),\s*\/\/ Only the unused first-line space/);
assert.match(method('openCard'),/this\.descriptionField\(subject\),\s*\.\.\.this\.placeRow\(subject\)/);
assert.equal((method('openCard').match(/this\.markerButton\(subject\)/g)||[]).length,1);
assert.doesNotMatch(method('featureBlock'),/mmc-cast-marker|pickMarker/);
const cssNames=[...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)].map(match=>match[1]);
const css=cssNames.map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko=vm.runInNewContext(read('locales/ko.js').replace(/^export const /m,'const ')+';ko;',{});
const code=`
${['el','svg','floatAbove','dismissable','placeNear','closeOwnedPopovers','mountOverlay'].map(name=>fn(name)).join('\n')}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
const icon=(name,size=13)=>svg(ICONS[name]||ICONS.effect,size);
${stripModule(read('disclosure.js'))}
let locale='en',fixtureOptions={};
const ko=${JSON.stringify(ko)};
const t=(text,values={})=>(locale==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??'{'+key+'}');
const DEFAULT_REF_SIZE={image:'max',video:'match',audio:'match'};
${stripModule(read('media-counts.js'))}
const isPlate=()=>false;
${['SUBJECT_MARKERS','SUBJECT_TAKES','isRefMod','thumbCrop','sizeable','refSize'].map(name=>constant(name)).join('\n')}
${['replacesOf','motionOf','subjectFeatures','subjectMarker','subjectNotes','subjectFiles','splitTriggers','subjectTriggers','releaseClaim'].map(name=>fn(name,state)).join('\n')}
const S={SUBJECT_MARKERS,SUBJECT_TAKES,DEFAULT_REF_SIZE,isRefMod,thumbCrop,sizeable,refSize,replacesOf,motionOf,subjectFeatures,subjectMarker,subjectNotes,subjectFiles,splitTriggers,subjectTriggers,releaseClaim,
 DEFAULT_VIDEO_FAMILY:'h3',muted:asset=>asset.muted===true,tagIndex:handle=>(Number(String(handle).match(/\\d+/)?.[0])||1)-1,
 subjectProblem:()=>fixtureOptions.problem||'',allSubjectLoras:()=>[],inheritTake:()=>false,inheritTakes:()=>false,
 seedFeatures:()=>[{attr:'hair'},{attr:'clothing'}],tidyWears:()=>{},soleClaims:()=>[]};
const DEFAULT_SPACE='h3';
const modIn=()=>null,costMark=()=>null,keepable=()=>false,looks=(subject,assets)=>subject.from.map(handle=>assets.find(asset=>asset.handle===handle)).filter(Boolean);
const remakeMods=()=>{throw new Error('No real RefMod encode in this fixture');};
const loraBase=entry=>entry.name,openLoras=()=>{throw new Error('No model manager execution in this fixture');};
const WearsPanel=class{constructor(config){this.config=config;}render(){return null;}};
window.urlCalls=[];
const viewUrl=(file,options)=>{urlCalls.push({file,options});
 if(String(file).endsWith('.wav'))return audioUrl;
 if(String(file).endsWith('.webm')&&!options?.preview)return videoUrl;
 return String(file).includes('landscape')?landscapeUrl:portraitUrl;};
const refmodFileUrl=()=>portraitUrl;
${stripModule(read('reference-preview.js'))}
${stripModule(cast)}
Object.assign(window,{CastShelf,openReferencePreview,closeOwnedPopovers,el});
window.cleanFixture=()=>{
 activeClose?.();for(const close of [...popoverClosers.values()])close();
 if(window.shelf)clearTimeout(shelf.pending);window.unmountFixture?.();document.querySelector('.fixture-host')?.remove();
};
window.setFixture=(options={})=>{
 cleanFixture();fixtureOptions=options;locale=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
 window.assets=structuredClone(options.assets||[
  {handle:'ref-1',kind:'image',role:'reference',filename:'portrait.png',ref_size:'max',takes:'person'},
  {handle:'ref-2',kind:'image',role:'reference',filename:'landscape.png',ref_size:'match',takes:'person'},
  {handle:'ref-3',kind:'video',role:'reference',filename:'refmod:portrait',ref_size:'max',takes:'person'},
  {handle:'ref-4',kind:'video',role:'reference',filename:'motion.webm',crop:{x:.2},trim:{start:1,end:2},takes:'motion',track:'picture'},
  {handle:'aud-5',kind:'audio',role:'reference',filename:'voice.wav',takes:'voice'},
  {handle:'vid-6',kind:'video',role:'reference',filename:'source.webm',takes:'edit',track:'both'},
 ]);
 window.subject=structuredClone(options.subject||{handle:'subject',takes:'person',from:['ref-1','ref-2','ref-3'],motion:['ref-4'],voice:'aud-5',replaces:['vid-6'],
  description:'A nervous person wearing their own cardigan.',replaces_what:'the selected performer',features:[{attr:'hair',is:'long dark hair'},{attr:'clothing',is:'dark cardigan'}],
  notes:{'ref-1':'front-lit face'},triggers:{'ref-1':'face, close-up'}});
 window.castList=[subject];window.touches=0;window.commits=0;window.cites=0;window.hostEscapes=0;window.libraryCalls=0;
 window.shelf=new CastShelf({getCast:()=>castList,setCast:value=>castList=value,getAssets:()=>assets,
  whereCited:()=>({cited:true,text:options.where||'in shots 1, 2'}),cite:()=>cites++,touch:()=>touches++,commit:()=>commits++,
  library:options.library?async()=>{libraryCalls++;if(options.libraryArrival)castList.push({handle:'library_subject',from:[],takes:'person'});}:null,
  disclosure:options.host==='timeline',initialOpen:true,onOpenChange:()=>{}});
 const host=el('div',{class:'fixture-host'+(options.host==='timeline'?' mmc-modal mmc-tl-modal':' mmc-root'),
  style:options.host==='timeline'?{}:{width:(options.width||Math.min(innerWidth-40,1000))+'px'}});
 if(options.host==='timeline'){
  const body=el('div',{class:'mmc-tl-body'},[el('div',{class:'mmc-tl-cast'},[shelf.root])]);host.append(el('div',{class:'mmc-modal-head'},[el('span',{class:'mmc-tab',text:t('Timeline')})]),body);
  const overlay=el('div',{class:'mmc-overlay'},[host]);window.unmountFixture=mountOverlay(overlay,()=>hostEscapes++);
 }else{host.append(shelf.root);document.body.append(host);window.unmountFixture=()=>host.remove();}
 shelf.opened=subject;shelf.render();return JSON.stringify({subject,assets});
};
window.snapshot=()=>({data:JSON.stringify({subject,assets}),touches,commits});
window.fieldLayout=()=>{
 const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const card=shelf.root.querySelector('.mmc-cast-card'),ident=card.querySelector('.mmc-cast-ident'),description=card.querySelector('.mmc-cast-description'),label=description.querySelector('.mmc-cast-description-label'),input=description.querySelector('.mmc-cast-desc');
 return{page:document.documentElement.scrollWidth,viewport:innerWidth,host:rect(document.querySelector('.fixture-host')),card:rect(card),ident:rect(ident),description:rect(description),label:rect(label),input:rect(input),place:card.querySelector('.mmc-cast-place')?rect(card.querySelector('.mmc-cast-place')):null,marker:rect(card.querySelector('.mmc-cast-marker')),
  nodes:[...card.querySelectorAll('.mmc-cast-description,.mmc-cast-description-label,.mmc-cast-desc,.mmc-cast-place,.mmc-cast-marker')].map(node=>({box:rect(node),scroll:node.scrollWidth,client:node.clientWidth,class:node.className,tag:node.tagName})),order:[...ident.children].map(node=>node.className),nameOrder:[...card.querySelector('.mmc-cast-namerow').children].map(node=>node.className)};
};
`;
new vm.Script(code,{filename:'cast-detail-current-production-fixture.js'});
const results=[],errors=[];let browser,requests=0;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1200,height:1150}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;padding:20px;box-sizing:border-box;background:#171718}.fixture-host{box-sizing:border-box;max-width:100%}button#outside{position:fixed;right:0;bottom:0}</style></head><body><button id="outside">Outside</button></body></html>');
 await page.evaluate(async()=>{
  const image=(width,height,color)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);ctx.fillStyle='#eee';ctx.fillRect(width*.2,height*.2,width*.6,height*.6);return canvas.toDataURL();};
  window.portraitUrl=image(240,400,'#5c3a77');window.landscapeUrl=image(480,200,'#294d5c');
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;canvas.getContext('2d').fillRect(0,0,96,64);const chunks=[];const stream=canvas.captureStream(12);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});recorder.ondataavailable=event=>chunks.push(event.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await new Promise(resolve=>setTimeout(resolve,450));recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());window.videoUrl=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
  const samples=8000,buffer=new ArrayBuffer(44+samples*2),v=new DataView(buffer),string=(offset,value)=>[...value].forEach((letter,index)=>v.setUint8(offset+index,letter.charCodeAt(0)));
  string(0,'RIFF');v.setUint32(4,36+samples*2,true);string(8,'WAVE');string(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);string(36,'data');v.setUint32(40,samples*2,true);
  window.audioUrl=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
 });
 await page.evaluate('(()=>{'+code+'})()');const reset=async options=>page.evaluate(options=>setFixture(options),options);
 const popup=()=>page.locator('body > .mmc-cast-menu');
 const role=async index=>{await page.locator('.mmc-cast-ref').nth(index).click();await page.waitForTimeout(20);};
 const shot=async name=>{if(!artifacts)return;fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:true});};
 await reset({});
 await check('Description has a persistent semantic left label outside the input, with original editable text and reading order',async()=>{
  const before=await page.evaluate(()=>snapshot());assert.equal(await page.locator('.mmc-cast-description').evaluate(node=>node.tagName),'LABEL');assert.equal(await page.locator('.mmc-cast-description-label').textContent(),'what a picture cannot say');
  assert.deepEqual(await page.evaluate(()=>fieldLayout().order),['mmc-cast-namerow','mmc-cast-description','mmc-cast-line mmc-cast-place on']);
  const nameOrder=await page.evaluate(()=>fieldLayout().nameOrder);assert.equal(nameOrder[2],'mmc-cast-takes');assert.equal(nameOrder[3],'mmc-cast-marker');assert.equal(nameOrder[4],'mmc-cast-collapse-area');
  assert.equal(await page.locator('.mmc-cast-marker').count(),1);assert.equal(await page.locator('.mmc-cast-features .mmc-cast-marker').count(),0);assert.equal(await page.locator('.mmc-cast-description input').inputValue(),'A nervous person wearing their own cardigan.');assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  const boxes=await page.evaluate(()=>fieldLayout());assert.ok(boxes.label.right<=boxes.input.left&&Math.abs(boxes.label.top-boxes.input.top)<8);assert.ok(boxes.marker.bottom<=boxes.description.top&&boxes.description.bottom<=boxes.place.top);
 });
 await check('Persistent label survives empty/filled edits; typing touches once and preserves the mounted input/caret without structural commits',async()=>{
  const field=page.locator('.mmc-cast-description input');await field.evaluate(node=>window.oldDescription=node);await page.locator('.mmc-cast-description-label').click();assert.equal(await field.evaluate(node=>node===document.activeElement),true);
  await field.fill('Changed description');assert.equal(await page.evaluate(()=>subject.description),'Changed description');assert.equal(await page.evaluate(()=>touches),1);assert.equal(await page.evaluate(()=>commits),0);await page.evaluate(()=>shelf.render());assert.equal(await field.evaluate(node=>node===oldDescription),true);
  await field.fill('');assert.equal(await page.locator('.mmc-cast-description-label').textContent(),'what a picture cannot say');assert.equal(await page.evaluate(()=>touches),2);assert.equal(await page.evaluate(()=>commits),0);
 });
 await check('Place row keeps original edit/continue/sound-only/missing/bare gates and appears directly below the description only when eligible',async()=>{
  const cases=[
   {assets:[],subject:{handle:'subject',from:[]},visible:false,bare:true},
   {assets:[{handle:'vid-1',kind:'video',takes:'edit'}],subject:{handle:'subject',from:[]},visible:true,bare:true},
   {assets:[{handle:'vid-1',kind:'video',takes:'continue'}],subject:{handle:'subject',from:[]},visible:true,bare:true},
   {assets:[{handle:'vid-1',kind:'video',takes:'edit',track:'sound'}],subject:{handle:'subject',from:[]},visible:false,bare:true},
   {assets:[{handle:'vid-1',kind:'video',takes:'full'}],subject:{handle:'subject',from:[]},visible:false,bare:true},
   {assets:[{handle:'img-1',kind:'image',takes:'edit',filename:'portrait.png'}],subject:{handle:'subject',from:['img-1']},visible:false,bare:false},
   {assets:[],subject:{handle:'subject',from:[],replaces:['missing']},visible:true,bare:false},
  ];
  for(const entry of cases){await reset(entry);const before=await page.evaluate(()=>snapshot());assert.equal(await page.locator('.mmc-cast-place').count(),Number(entry.visible));assert.equal(await page.locator('.mmc-cast-description input').getAttribute('placeholder'),entry.bare?'describe them — this is all the model will know':'what a picture cannot say');
   if(entry.visible){const order=await page.evaluate(()=>fieldLayout().order);assert.equal(order.indexOf('mmc-cast-description')+1,order.findIndex(value=>value.startsWith('mmc-cast-line mmc-cast-place')));}assert.deepEqual(await page.evaluate(()=>snapshot()),before);}
 });
 await check('Replacement text retains original input touch/blur callbacks and does not open role menus or mutate other fields',async()=>{
  await reset({});const assets=await page.evaluate(()=>JSON.stringify(window.assets));await page.locator('.mmc-cast-replaces').fill('the person by the window');assert.equal(await page.evaluate(()=>subject.replaces_what),'the person by the window');assert.equal(await page.evaluate(()=>touches),1);assert.equal(await page.evaluate(()=>commits),0);assert.equal(await page.evaluate(()=>JSON.stringify(window.assets)),assets);assert.equal(await popup().count(),0);
 });
 await check('Preservation override remains the same original picker and returns to derived marker without changing feature rows',async()=>{
  await reset({});const features=await page.evaluate(()=>JSON.stringify(subject.features));await page.locator('.mmc-cast-marker').click();await popup().locator('.mmc-opt').filter({hasText:'weak_reference'}).click();assert.equal(await page.evaluate(()=>subject.relationship),'weak_reference');assert.equal(await page.evaluate(()=>commits),1);assert.equal(await page.locator('.mmc-cast-marker-value').textContent(),'weak_reference');
  await page.locator('.mmc-cast-marker').click();await popup().locator('.mmc-opt').filter({hasText:'decide for me'}).click();assert.equal(await page.evaluate(()=>subject.relationship),undefined);assert.equal(await page.locator('.mmc-cast-marker-value').textContent(),'fully_preserved');assert.equal(await page.evaluate(()=>commits),2);assert.equal(await page.evaluate(()=>JSON.stringify(subject.features)),features);
 });
 await check('Changed features still derive partially_preserved in the moved marker and preserve the original feature controls',async()=>{
  await reset({subject:{handle:'subject',from:['ref-1'],description:'Face reference',features:[{is:'dark hair',instead:'silver hair'}]}});assert.equal(await page.locator('.mmc-cast-marker-value').textContent(),'partially_preserved');assert.equal(await page.locator('.mmc-cast-feature-is').inputValue(),'dark hair');assert.equal(await page.locator('.mmc-cast-feature-instead').inputValue(),'silver hair');
  await page.locator('.mmc-cast-feature-instead').fill('short hair');assert.equal(await page.evaluate(()=>subject.features[0].instead),'short hair');assert.equal(await page.evaluate(()=>touches),1);assert.equal(await page.evaluate(()=>commits),0);
 });
 await check('Neighbouring type and preservation retain matching pill skins and the original no-op/change type menu callbacks',async()=>{
  await reset({});const before=await page.evaluate(()=>snapshot());const skin=await page.evaluate(()=>{
   const read=node=>{const c=getComputedStyle(node);return{border:c.borderTopWidth,colour:c.borderTopColor,radius:c.borderTopLeftRadius,padding:[c.paddingTop,c.paddingRight,c.paddingBottom,c.paddingLeft],minHeight:c.minHeight};};
   return [...shelf.root.querySelectorAll('.mmc-cast-namerow > .mmc-cast-takes,.mmc-cast-namerow > .mmc-cast-marker')].map(read);
  });assert.deepEqual(skin[0],skin[1]);assert.equal(skin[0].border,'1px');assert.notEqual(skin[0].colour,'rgba(0, 0, 0, 0)');assert.equal(skin[0].radius,'999px');
  await page.locator('.mmc-cast-takes').click();await popup().locator('.mmc-opt').filter({hasText:/^person/}).click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  const assets=await page.evaluate(()=>JSON.stringify(window.assets));await page.locator('.mmc-cast-takes').click();await popup().locator('.mmc-opt').filter({hasText:/^object/}).click();assert.equal(await page.evaluate(()=>subject.takes),'object');assert.equal(await page.evaluate(()=>commits),1);assert.equal(await page.evaluate(()=>touches),0);assert.equal(await page.evaluate(()=>JSON.stringify(window.assets)),assets);assert.equal(await page.locator('.mmc-cast-namerow > .mmc-cast-marker').count(),1);
 });
 await check('Only description/replacement identity inputs have visible idle skins identical to hover/focus, with native focus and unchanged text',async()=>{
  await reset({});const before=await page.evaluate(()=>snapshot());const skin=async selector=>page.locator(selector).evaluate(node=>{const c=getComputedStyle(node);return{border:c.borderTopWidth,colour:c.borderTopColor,background:c.backgroundColor};});
  for(const selector of ['.mmc-cast-description input','.mmc-cast-replaces']){await page.locator('#outside').focus();await page.mouse.move(1190,1140);const idle=await skin(selector);assert.equal(idle.border,'1px');assert.notEqual(idle.colour,'rgba(0, 0, 0, 0)');assert.notEqual(idle.background,'rgba(0, 0, 0, 0)');await page.locator(selector).hover();assert.deepEqual(await skin(selector),idle);await page.locator(selector).focus();assert.deepEqual(await skin(selector),idle);assert.equal(await page.locator(selector).evaluate(node=>node===document.activeElement),true);}
  await page.locator('#outside').focus();assert.equal((await skin('.mmc-cast-name')).background,'rgba(0, 0, 0, 0)');assert.deepEqual(await page.evaluate(()=>snapshot()),before);
 });
 await check('Moved place picker retains original role toggle/save once and preserves source clip/settings',async()=>{
  await reset({});const assets=await page.evaluate(()=>JSON.stringify(window.assets));await page.locator('.mmc-cast-place-clip').click();assert.equal(await popup().locator('.mmc-opt').count(),1);await popup().locator('.mmc-opt').click();assert.deepEqual(await page.evaluate(()=>subject.replaces),undefined);assert.equal(await page.evaluate(()=>commits),1);assert.equal(await page.evaluate(()=>JSON.stringify(window.assets)),assets);
  await page.locator('.mmc-cast-place-clip').click();await popup().locator('.mmc-opt').click();assert.deepEqual(await page.evaluate(()=>subject.replaces),['vid-6']);assert.equal(await page.evaluate(()=>commits),2);
 });
 await check('Reference popup begins with handle then inline preview then untouched note/trigger fields; opening is read-only',async()=>{
  await reset({});const before=await page.evaluate(()=>snapshot());await role(0);assert.deepEqual(await popup().evaluate(node=>[...node.children].slice(0,3).map(child=>child.className)),['mmc-pop-title','mmc-cast-role-preview mmc-reference-preview-target','mmc-cast-menu-words']);
  assert.equal(await popup().locator('.mmc-pop-title').textContent(),'@ref-1');assert.equal(await popup().locator('.mmc-cast-menu-field').nth(0).inputValue(),'front-lit face');assert.equal(await popup().locator('.mmc-cast-menu-field').nth(1).inputValue(),'face, close-up');assert.equal(await popup().evaluate(node=>node.scrollTop),0);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
 });
 await check('Role and MAX/MATCH controls retain original structural callbacks and notes/trigger mappings',async()=>{
  await popup().locator('.mmc-opt').filter({hasText:'Their action comes from this'}).click();assert.ok(await page.evaluate(()=>subject.motion.includes('ref-1')));assert.equal(await page.evaluate(()=>subject.from.includes('ref-1')),false);assert.equal(await page.evaluate(()=>subject.notes['ref-1']),'front-lit face');assert.equal(await page.evaluate(()=>subject.triggers['ref-1']),'face, close-up');assert.equal(await page.evaluate(()=>commits),1);
  await reset({});await role(0);await popup().locator('.mmc-opt').filter({hasText:/^match/}).click();assert.equal(await page.evaluate(()=>assets[0].ref_size),'match');assert.equal(await page.evaluate(()=>commits),1);
 });
 await check('Inline words retain touch-per-edit and Enter structural save without preview changing their values',async()=>{
  await reset({});await role(0);await popup().locator('.mmc-cast-menu-field').nth(0).fill('profile, soft light');await popup().locator('.mmc-cast-menu-field').nth(1).fill('profile, close-up');assert.equal(await page.evaluate(()=>touches),2);assert.equal(await page.evaluate(()=>commits),0);assert.equal(await page.evaluate(()=>subject.notes['ref-1']),'profile, soft light');
  await popup().locator('.mmc-cast-menu-field').nth(1).press('Enter');assert.equal(await popup().count(),0);assert.equal(await page.evaluate(()=>commits),1);assert.equal(await page.evaluate(()=>subject.triggers['ref-1']),'profile, close-up');
 });
 await check('Portrait, landscape and RefMod inline pictures are contained, not cropped, and never autoplay',async()=>{
  await reset({});for(const index of [0,1,2]){await role(index);await popup().locator('.mmc-cast-role-preview img').evaluate(async img=>{if(!img.complete)await new Promise(resolve=>img.onload=resolve);});const result=await popup().locator('.mmc-cast-role-preview').evaluate(node=>{const img=node.querySelector('img'),box=node.getBoundingClientRect(),rect=img.getBoundingClientRect();return{fit:getComputedStyle(img).objectFit,natural:[img.naturalWidth,img.naturalHeight],inside:rect.left>=box.left&&rect.right<=box.right&&rect.top>=box.top&&rect.bottom<=box.bottom,media:node.querySelectorAll('video,audio').length};});assert.equal(result.fit,'contain');assert.ok(result.inside);assert.equal(result.media,0);assert.ok(result.natural[0]>0&&result.natural[1]>0);await shot('cast-role-inline-'+['portrait','landscape','refmod'][index]+'.png');await page.keyboard.press('Escape');}
 });
 await check('Video inline preview is a still using preview:true while the larger viewer uses the uncropped playable source',async()=>{
  await role(3);assert.equal(await popup().locator('.mmc-cast-role-preview img').count(),1);assert.equal(await popup().locator('video').count(),0);assert.deepEqual(await page.evaluate(()=>urlCalls.at(-1)),{file:'motion.webm',options:{preview:true,crop:{x:.2}}});
  await popup().locator('.mmc-cast-role-preview').dblclick();assert.equal(await page.locator('.mmc-reference-preview video').count(),1);assert.deepEqual(await page.evaluate(()=>urlCalls.at(-1)),{file:'motion.webm',options:undefined});assert.deepEqual(await page.locator('.mmc-reference-preview video').evaluate(node=>({autoplay:node.autoplay,paused:node.paused,controls:node.controls})),{autoplay:false,paused:true,controls:true});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 });
 await check('Audio preview uses a quiet glyph inline and the existing controlled audio viewer only on request',async()=>{
  await role(4);assert.equal(await popup().locator('.mmc-cast-preview-audio').count(),1);assert.equal(await popup().locator('audio,video').count(),0);const before=await page.evaluate(()=>snapshot());await popup().locator('.mmc-cast-role-preview').dblclick();assert.deepEqual(await page.locator('.mmc-reference-preview audio').evaluate(node=>({autoplay:node.autoplay,paused:node.paused,controls:node.controls})),{autoplay:false,paused:true,controls:true});assert.deepEqual(await page.evaluate(()=>snapshot()),before);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 });
 await check('Double click and keyboard preview suspend only the parent menu, open above it and return focus with original fields/scroll intact',async()=>{
  await role(0);await popup().locator('.mmc-cast-menu-field').nth(0).fill('New note');await popup().evaluate(node=>{node.scrollTop=60;window.originalPopup=node;window.oldMenuScroll=node.scrollTop;node.querySelector('.mmc-cast-role-preview').addEventListener('dblclick',()=>{oldMenuScroll=node.scrollTop;},{capture:true,once:true});});const before=await page.evaluate(()=>snapshot());
  await popup().locator('.mmc-cast-role-preview').dblclick();assert.equal(await popup().count(),1);assert.equal(await popup().getAttribute('data-previewing'),'1');assert.equal(await page.locator('.mmc-reference-preview').count(),1);
  assert.ok(await page.evaluate(()=>{const parent=getComputedStyle(originalPopup),overlay=getComputedStyle(document.querySelector('.mmc-reference-preview-overlay'));return parent.visibility==='hidden'&&parent.pointerEvents==='none'||Number(overlay.zIndex)>Number(parent.zIndex);}));
  assert.equal(await page.locator('.mmc-reference-preview .mmc-close').evaluate(node=>{const box=node.getBoundingClientRect();return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===node;}),true);
  await shot('cast-role-large-viewer-parent-suspended.png');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.equal(await popup().evaluate(node=>node===originalPopup),true);assert.equal(await popup().getAttribute('data-previewing'),null);assert.equal(await popup().locator('.mmc-cast-role-preview').evaluate(node=>node===document.activeElement),true);assert.equal(await popup().locator('.mmc-cast-menu-field').nth(0).inputValue(),'New note');assert.equal(await popup().evaluate(node=>node.scrollTop),await page.evaluate(()=>oldMenuScroll));assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  await popup().locator('.mmc-cast-role-preview').press('Space');assert.equal(await page.locator('.mmc-reference-preview').count(),1);await page.keyboard.press('Escape');assert.equal(await popup().count(),1);await page.keyboard.press('Escape');assert.equal(await popup().count(),0);
 });
 await check('Viewer backdrop and buttons do not close the suspended menu; outside click closes the role popup only after preview ends',async()=>{
  await reset({host:'timeline'});await role(0);const before=await page.evaluate(()=>snapshot());await popup().locator('.mmc-cast-role-preview').dblclick();await page.locator('.mmc-reference-preview-overlay').click({position:{x:5,y:5}});assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.equal(await popup().count(),1);assert.equal(await page.evaluate(()=>hostEscapes),0);
  await page.locator('#outside').dispatchEvent('pointerdown');assert.equal(await popup().count(),0);assert.equal(await page.locator('.fixture-host').count(),1);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
 });
 await check('Programmatic parent close cleans viewer/media and stale preview callbacks cannot reopen a detached menu',async()=>{
  await role(3);await popup().locator('.mmc-cast-role-preview').dblclick();await page.evaluate(()=>{window.oldVideo=document.querySelector('.mmc-reference-preview video');window.detachedPreview=document.querySelector('.mmc-cast-role-preview');closeOwnedPopovers(shelf.root);});assert.equal(await popup().count(),0);assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.deepEqual(await page.evaluate(()=>[oldVideo.paused,oldVideo.getAttribute('src'),oldVideo.isConnected]),[true,null,false]);
  await page.evaluate(()=>detachedPreview.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));assert.equal(await page.locator('.mmc-reference-preview').count(),0);
 });
 await check('Missing referenced files keep the original removable role menu without a nonfunctional preview',async()=>{
  await reset({assets:[],subject:{handle:'subject',from:['missing']},problem:'Missing cast reference'});await role(0);assert.equal(await popup().locator('.mmc-cast-role-preview').count(),0);assert.equal(await popup().locator('.mmc-opt').count(),5);await popup().locator('.mmc-opt').filter({hasText:'Take it off @subject'}).click();assert.equal(await page.evaluate(()=>subject.from),undefined);assert.equal(await page.evaluate(()=>commits),1);
 });
 await check('Unsupported kinds and absent filenames remain selection-only, with no stuck preview suspension or altered mappings',async()=>{
  for(const asset of [{handle:'bad-1',kind:'other',role:'reference',filename:'unsupported.bin'},{handle:'bad-1',kind:'image',role:'reference',filename:''}]){
   await reset({assets:[asset],subject:{handle:'subject',from:['bad-1'],description:'Known subject'}});const before=await page.evaluate(()=>snapshot());await role(0);assert.equal(await popup().locator('.mmc-cast-role-preview').count(),0);assert.equal(await popup().getAttribute('data-previewing'),null);assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.deepEqual(await page.evaluate(()=>snapshot()),before);await page.keyboard.press('Escape');assert.equal(await popup().count(),0);
  }
 });
 await check('Preview errors remain visible/bounded and do not change role values or hide the note/trigger inputs',async()=>{
  await reset({});await role(0);const before=await page.evaluate(()=>snapshot());await popup().locator('.mmc-cast-role-preview img').dispatchEvent('error');assert.equal(await popup().locator('.mmc-cast-preview-error').isVisible(),true);assert.equal(await popup().locator('.mmc-cast-menu-field').count(),2);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
 });
 await check('Both shared shelf hosts preserve name/type/marker then description→place order and original data with empty/forced/changed states',async()=>{
  for(const host of ['node','timeline'])for(const relationship of [undefined,'weak_reference']){await reset({host,subject:{handle:'subject',from:['ref-1'],replaces:['vid-6'],description:'Persistent description',relationship,features:[{is:'dark hair',instead:'short hair'}]}});const before=await page.evaluate(()=>snapshot());const layout=await page.evaluate(()=>fieldLayout());assert.equal(layout.order[1],'mmc-cast-description');assert.ok(layout.order[2].includes('mmc-cast-place'));assert.equal(layout.nameOrder[2],'mmc-cast-takes');assert.ok(layout.nameOrder[3].includes('mmc-cast-marker'));assert.equal(layout.nameOrder[4],'mmc-cast-collapse-area');assert.equal(await page.locator('.mmc-cast-marker-value').textContent(),relationship||'partially_preserved');await page.evaluate(()=>shelf.render());assert.deepEqual(await page.evaluate(()=>snapshot()),before);}
 });
 await check('Desktop English/Korean descriptions stay labeled on the left with aligned field group and bounded diagnostics',async()=>{
  await page.setViewportSize({width:1200,height:1150});for(const language of ['en','ko'])for(const host of ['node','timeline']){await reset({language,host,problem:'Missing cast reference'});const layout=await page.evaluate(()=>fieldLayout());assert.ok(layout.label.right<=layout.input.left&&layout.label.top<layout.input.bottom);assert.ok(layout.marker.bottom<=layout.description.top&&layout.description.bottom<=layout.place.top);assert.ok(layout.page<=layout.viewport);for(const node of layout.nodes)assert.ok(node.box.left>=layout.card.left-8&&node.box.right<=layout.card.right+1,JSON.stringify(layout));await shot('cast-detail-desktop-'+host+'-'+language+'.png');}
 });
 await check('320/640px English/Korean large text wraps labels gracefully without x-overflow or reordered fields on either host',async()=>{
  for(const width of [320,640])for(const language of ['en','ko'])for(const host of ['node','timeline']){await page.setViewportSize({width,height:1350});await reset({language,host,scale:1.6,subject:{handle:'subject',from:['ref-1'],replaces:['vid-6'],description:'A long description that should remain editable',replaces_what:'the selected person near the window',relationship:'weak_reference',features:[]}});const layout=await page.evaluate(()=>fieldLayout());assert.ok(layout.page<=width,JSON.stringify(layout));assert.ok(layout.marker.bottom<=layout.description.top+.1&&layout.description.bottom<=layout.place.top+.1,JSON.stringify(layout));for(const node of layout.nodes){assert.ok(node.box.left>=layout.card.left-8&&node.box.right<=layout.card.right+1,JSON.stringify(layout));if(node.tag!=='INPUT')assert.ok(node.scroll<=node.client+1,JSON.stringify(node));}if(language==='ko')await shot('cast-detail-'+width+'-'+host+'-ko-large.png');}
 });
 await check('Compact shared cards reserve the face lane and independently reachable where/close/remove targets without overlap',async()=>{
  for(const width of [320,640])for(const language of ['en','ko'])for(const host of ['node','timeline']){
   await page.setViewportSize({width,height:1350});await reset({language,host,scale:1.6});const result=await page.evaluate(()=>{
    const card=shelf.root.querySelector('.mmc-cast-card'),face=card.querySelector('.mmc-cast-face').getBoundingClientRect(),side=card.querySelector('.mmc-cast-side').getBoundingClientRect(),caption=card.querySelector('.mmc-cast-where');
    const box=node=>{const value=node.getBoundingClientRect();return{left:value.left,right:value.right,top:value.top,bottom:value.bottom};};
    const overlap=(a,b)=>a.left<b.right-.1&&a.right>b.left+.1&&a.top<b.bottom-.1&&a.bottom>b.top+.1;
    return{face:box(card.querySelector('.mmc-cast-face')),side:box(card.querySelector('.mmc-cast-side')),overlap:overlap(face,side),caption:{scroll:caption.scrollWidth,width:caption.clientWidth},
     controls:[...card.querySelectorAll('.mmc-cast-side > button')].map(button=>{const rect=button.getBoundingClientRect();return{box:box(button),overlap:overlap(face,rect),hit:button.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2))};})};
   });
   assert.equal(result.overlap,false,JSON.stringify(result));assert.ok(result.caption.scroll<=result.caption.width+1,JSON.stringify(result));for(const control of result.controls){assert.equal(control.overlap,false,JSON.stringify(result));assert.equal(control.hit,true,JSON.stringify(result));}
  }
 });
 await check('Name/type/preservation stay in semantic order with readable fonts, safe whole-control wrapping and no overlap on both hosts',async()=>{
  for(const width of [320,640,1200])for(const language of ['en','ko'])for(const host of ['node','timeline'])for(const scale of [1,1.6])for(const relationship of [undefined,'weak_reference']){
   await page.setViewportSize({width,height:1350});await reset({language,host,scale,subject:{handle:'subject_long_name',takes:'person',from:['ref-1'],description:'A readable name row',features:[],relationship}});const before=await page.evaluate(()=>snapshot());const layout=await page.evaluate(()=>{
    const row=shelf.root.querySelector('.mmc-cast-namerow'),box=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};const controls=[...row.children].map(node=>({class:node.className,box:box(node),font:getComputedStyle(node).fontSize,scroll:node.scrollWidth,client:node.clientWidth}));
    return{row:box(row),controls,page:document.documentElement.scrollWidth};
   });assert.ok(layout.page<=width,JSON.stringify(layout));const [prefix,name,takes,marker]=layout.controls;assert.equal(takes.class,'mmc-cast-takes');assert.ok(marker.class.startsWith('mmc-cast-marker'));assert.ok(Math.abs(prefix.box.top+prefix.box.height/2-name.box.top-name.box.height/2)<1,JSON.stringify(layout));assert.ok(Math.abs(parseFloat(name.font)-13*scale)<.01);assert.ok(Math.abs(parseFloat(takes.font)-11.5*scale)<.01);assert.ok(Math.abs(await page.locator('.mmc-cast-marker-value').evaluate(node=>parseFloat(getComputedStyle(node).fontSize))-11*scale)<.01);
   for(const control of layout.controls){assert.ok(control.box.left>=layout.row.left-.1&&control.box.right<=layout.row.right+.1,JSON.stringify(layout));if(control.class.includes('mmc-cast-marker'))assert.ok(control.scroll<=control.client+1,JSON.stringify(layout));}
   for(let i=0;i<layout.controls.length;i++)for(let j=i+1;j<layout.controls.length;j++){const a=layout.controls[i].box,b=layout.controls[j].box;assert.equal(a.width>.1&&b.width>.1&&a.left<b.right-.1&&a.right>b.left+.1&&a.top<b.bottom-.1&&a.bottom>b.top+.1,false,JSON.stringify(layout));}
   assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  }
 });
 await check('Cast header is Add then Library in English/Korean on both hosts, preserves mounted targets and omits unavailable libraries',async()=>{
  await page.setViewportSize({width:1200,height:1150});assert.equal(ko.Library,'라이브러리');for(const host of ['node','timeline'])for(const language of ['en','ko']){
   await reset({host,language,library:true});const before=await page.evaluate(()=>snapshot());assert.deepEqual(await page.evaluate(()=>shelf.headerActions.map(button=>button.querySelector('span:last-child').textContent)),language==='ko'?['인물 추가','라이브러리']:['Add someone','Library']);assert.equal(await page.locator('.mmc-cast-new').count(),2);
   await page.evaluate(()=>{window.oldHeaderActions=[...shelf.headerActions];shelf.render();});assert.equal(await page.evaluate(()=>shelf.headerActions.every((button,index)=>button===oldHeaderActions[index])),true);assert.deepEqual(await page.evaluate(()=>snapshot()),before);await shot('cast-header-add-library-'+host+'-'+language+'.png');
   await reset({host,language});assert.equal(await page.locator('.mmc-cast-new').count(),1);assert.equal(await page.locator('.mmc-cast-new span:last-child').textContent(),language==='ko'?'인물 추가':'Add someone');
  }
 });
 await check('Reordered Add invokes the unchanged new-person defaults once and Library preserves its conditional reveal and original callback',async()=>{
  for(const host of ['node','timeline']){
   await reset({host,library:true});const before=await page.evaluate(()=>snapshot());if(host==='timeline')await page.evaluate(()=>shelf.section.setOpen(false));await page.locator('.mmc-cast-new').nth(1).click();assert.equal(await page.evaluate(()=>libraryCalls),1);assert.deepEqual(await page.evaluate(()=>snapshot()),before);if(host==='timeline')assert.equal(await page.evaluate(()=>shelf.isExpanded()),false);
   await reset({host,library:true,libraryArrival:true});if(host==='timeline')await page.evaluate(()=>shelf.section.setOpen(false));await page.locator('.mmc-cast-new').nth(1).click();await page.waitForFunction(()=>libraryCalls===1&&castList.length===2);if(host==='timeline')assert.equal(await page.evaluate(()=>shelf.isExpanded()),true);assert.equal(await page.evaluate(()=>commits),0);assert.equal(await page.evaluate(()=>touches),0);
   await reset({host,library:true});const assets=await page.evaluate(()=>JSON.stringify(window.assets));await page.locator('.mmc-cast-new').nth(0).click();assert.deepEqual(await page.evaluate(()=>castList[1]),{handle:'subject_2',from:[],takes:'person',features:[{attr:'hair'},{attr:'clothing'}],seeded:true});assert.equal(await page.evaluate(()=>shelf.opened===castList[1]),true);assert.equal(await page.evaluate(()=>commits),1);assert.equal(await page.evaluate(()=>touches),0);assert.equal(await page.evaluate(()=>libraryCalls),0);assert.equal(await page.evaluate(()=>JSON.stringify(window.assets)),assets);assert.equal(await page.locator('.mmc-cast-name').evaluate(node=>node===document.activeElement),true);
  }
 });
 await check('Large narrow role menus contain portrait/landscape/error media, fields and every original option inside viewport',async()=>{
  for(const width of [320,640])for(const language of ['en','ko']){await page.setViewportSize({width,height:1100});await reset({language,scale:1.6});for(const index of [0,1]){await role(index);await popup().locator('.mmc-cast-role-preview img').dispatchEvent('error');const layout=await popup().evaluate(node=>{const box=node.getBoundingClientRect();return{box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},scroll:node.scrollWidth,width:node.clientWidth,children:[...node.querySelectorAll('.mmc-cast-role-preview,.mmc-cast-preview-error,.mmc-cast-menu-field,.mmc-opt')].map(child=>({scroll:child.scrollWidth,width:child.clientWidth,box:child.getBoundingClientRect().toJSON()}))};});assert.ok(layout.box.left>=0&&layout.box.right<=width&&layout.box.top>=0&&layout.box.bottom<=1100,JSON.stringify(layout));assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));for(const child of layout.children)assert.ok(child.scroll<=child.width+1,JSON.stringify(child));if(index===0&&language==='ko')await shot('cast-role-preview-'+width+'-ko-large.png');await page.keyboard.press('Escape');}}
 });
 await check('Timeline-only Sound boundary has a faded pointer-transparent divider, without adding one to ordinary sound hosts',async()=>{
  await reset({});const result=await page.evaluate(()=>{const outside=el('div',{class:'mmc-snd'}),inside=el('div',{class:'mmc-snd'}),parent=el('div',{class:'mmc-tl-modal'},[el('div',{class:'mmc-tl-body'},[el('div',{class:'mmc-tl-strip'}),inside])]);document.body.append(parent,outside);const a=getComputedStyle(inside,'::before'),b=getComputedStyle(outside,'::before'),result={content:a.content,height:a.height,pointer:a.pointerEvents,background:a.backgroundImage,outside:b.content};parent.remove();outside.remove();return result;});assert.equal(result.content,'""');assert.equal(result.height,'1px');assert.equal(result.pointer,'none');assert.ok(result.background.includes('gradient'));assert.equal(result.outside,'none');
 });
 await check('Only supporting-file role menus gain the actual 510×680 desktop bounds; ordinary cast menus keep their original size',async()=>{
  await page.setViewportSize({width:1200,height:1150});
  for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await reset({language,scale});const before=await page.evaluate(()=>snapshot());
   for(const index of [0,3,4]){
    await role(index);const box=await popup().evaluate(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,preview:node.classList.contains('mmc-cast-preview-menu'),thumb:node.querySelector('.mmc-cast-role-preview').getBoundingClientRect().height}));
    assert.equal(box.preview,true);assert.equal(box.width,510);assert.equal(box.height,680);assert.ok(box.width>=340*1.5&&box.height>=320*2);assert.ok(box.thumb<=220);
    if(index===0&&language==='ko'&&scale===1.6){
     await popup().locator('.mmc-cast-role-preview img').evaluate(async img=>{if(!img.complete)await new Promise(resolve=>img.onload=resolve);});
     assert.equal(await popup().locator('.mmc-cast-preview-error').isVisible(),false);await shot('cast-role-expanded-fresh-desktop-ko-large.png');
    }
    assert.deepEqual(await page.evaluate(()=>snapshot()),before);await page.keyboard.press('Escape');
   }
   await page.locator('.mmc-cast-takes').click();const ordinary=await popup().evaluate(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,maxWidth:getComputedStyle(node).maxWidth,maxHeight:getComputedStyle(node).maxHeight,preview:node.classList.contains('mmc-cast-preview-menu')}));
   assert.equal(ordinary.preview,false);assert.equal(ordinary.maxWidth,'340px');assert.equal(ordinary.maxHeight,'320px');assert.ok(ordinary.width<=358&&ordinary.height<=338);await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  }
 });
 await check('Enlarged supporting-file role menus clamp to small viewports and keep both text fields and every original role accessible by native scrolling',async()=>{
  for(const width of [320,640])for(const height of [480,900]){
   await page.setViewportSize({width,height});await reset({host:'timeline',language:'ko',scale:1.6});const before=await page.evaluate(()=>snapshot());await role(0);
   const bounds=await popup().evaluate(node=>{const box=node.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,scroll:node.scrollWidth,client:node.clientWidth};});
   assert.equal(bounds.width,Math.min(510,width-16));assert.equal(bounds.height,Math.min(680,height-16));assert.ok(bounds.left>=7.9&&bounds.right<=width-7.9&&bounds.top>=7.9&&bounds.bottom<=height-7.9,JSON.stringify(bounds));assert.ok(bounds.scroll<=bounds.client+1);
   for(const field of await popup().locator('.mmc-cast-menu-field').all()){
    await field.scrollIntoViewIfNeeded();const hit=await field.evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('.mmc-cast-menu').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom&&node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});assert.equal(hit,true);
   }
   for(const option of await popup().locator('.mmc-opt').all()){
    await option.scrollIntoViewIfNeeded();const hit=await option.evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('.mmc-cast-menu').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom&&node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});assert.equal(hit,true);
   }
   await popup().evaluate(node=>{node.scrollTop=0;});await shot('cast-role-expanded-'+width+'x'+height+'-ko-large.png');assert.deepEqual(await page.evaluate(()=>snapshot()),before);await page.keyboard.press('Escape');
  }
 });
 await check('Preservation policy alone widens to420 and grows naturally to show all five original choices and notes on a roomy screen',async()=>{
  await page.setViewportSize({width:1200,height:1150});
  for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await reset({language,scale});const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-cast-marker').click();
   const layout=await popup().evaluate(node=>{const p=node.getBoundingClientRect();return{width:p.width,height:p.height,scroll:node.scrollHeight,client:node.clientHeight,policy:node.classList.contains('mmc-cast-policy-menu'),preview:node.classList.contains('mmc-cast-preview-menu'),options:[...node.querySelectorAll('.mmc-opt')].map(option=>{const r=option.getBoundingClientRect();return{inside:r.top>=p.top&&r.bottom<=p.bottom,hit:option.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),font:getComputedStyle(option.querySelector('.mmc-cast-menu-text > span')).fontSize,note:option.querySelector('.mmc-cast-menu-note').textContent};})};});
   assert.equal(layout.width,420);assert.equal(layout.policy,true);assert.equal(layout.preview,false);assert.equal(layout.options.length,5);assert.ok(layout.scroll<=layout.client+1);assert.ok(layout.height>320&&layout.height<680);
   for(const option of layout.options){assert.equal(option.inside,true);assert.equal(option.hit,true);assert.ok(option.note);assert.ok(Math.abs(parseFloat(option.font)-13*scale)<.01);}
   assert.deepEqual(await page.evaluate(()=>snapshot()),before);if(language==='ko'&&scale===1.6)await shot('cast-policy-expanded-desktop-ko-large.png');await page.keyboard.press('Escape');
  }
 });
 await check('Preservation policy remains viewport bounded at320px Korean large type, scrolling to every original option only when necessary',async()=>{
  for(const height of [320,480]){
   await page.setViewportSize({width:320,height});await reset({host:'timeline',language:'ko',scale:1.6});const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-cast-marker').click();
   const bounds=await popup().evaluate(node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,scroll:node.scrollHeight,client:node.clientHeight};});
   assert.equal(bounds.width,304);assert.ok(bounds.left>=7.9&&bounds.right<=312.1&&bounds.top>=7.9&&bounds.bottom<=height-7.9,JSON.stringify(bounds));assert.ok(bounds.scroll>bounds.client);assert.equal(await popup().locator('.mmc-opt').count(),5);
   for(const option of await popup().locator('.mmc-opt').all()){
    await option.scrollIntoViewIfNeeded();assert.equal(await option.evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('.mmc-cast-menu').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true);
   }
   await popup().evaluate(node=>{node.scrollTop=0;});await shot('cast-policy-expanded-320x'+height+'-ko-large.png');assert.deepEqual(await page.evaluate(()=>snapshot()),before);await page.keyboard.press('Escape');
  }
 });
 await page.evaluate(()=>cleanFixture());assert.deepEqual(errors,[]);assert.equal(requests,0);console.log(JSON.stringify({suite:'cast-detail-layout',passed:results.length,networkRequests:requests,results,scope:'actual frontend shelf/viewer/state helpers and CSS; synthetic media/host adapters; no live ComfyUI/GPU proof'},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
