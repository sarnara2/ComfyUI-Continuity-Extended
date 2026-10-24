// Real Timeline.mount/createDisclosure/CastShelf.render shells and CSS, with
// reference/model/cast-card bodies isolated. No server, queue or GPU activity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const timeline = read('timeline.js'), cast = read('cast.js'), dom = read('dom.js');
const method = (name, source=timeline) => {
  const found=source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found,`Production method ${name}`);return found[0];
};
const fn = name=>dom.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'))[0].replace(/^export /,'');
const helper=read('disclosure.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const countsHelper=read('media-counts.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const countStateHelpers=['motionOf','subjectFiles','replacesOf','cardName'].map(name=>read('state.js').match(new RegExp(`^export function ${name}\\([^]*?^\\}`,'m'))[0].replace(/^export /,'')).join('\n');
const css=['base','editor','picker','overlays','timeline','cast','popovers','refine'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko=read('locales/ko.js').replace(/^export const /m,'window.ko = ');
const code=`
${fn('el')}
${fn('svg')}
${fn('floatAbove')}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${fn('dismissable')}
${fn('placeNear')}
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
${helper}
window.createDisclosure=createDisclosure;
let language='en';
const t=(text,values={})=>(language==='ko'?window.ko[text]||text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const icon=(name,size=13)=>svg(ICONS[name]||ICONS.effect,size);
let armedRefine=null;
const chosenModel=()=>null,queueBusy=()=>false,spinner=()=>el('span',{class:'mmc-spin'}),DEFAULT_VIDEO_FAMILY='h3',openSettings=()=>{};
const refineField=()=>{throw new Error('No refiner execution in the disclosure fixture');};
${read('refine.js').match(/^export function refineButton\([^]*?^\}/m)[0].replace(/^export /,'')}
${countsHelper}
${countStateHelpers}
const S={subjectFiles,replacesOf,cardName,pieceFamily:()=> 'h3',takesReferences:()=>true,familyOf:()=>({label:'MiniMax H3'}),DEFAULT_VIDEO_FAMILY:'h3',isClip:segment=>segment?.kind==='clip'};
const closeOwnedPopovers=()=>{window.closedMenus++;};
const SoundLane=class{constructor(){this.host=el('div',{class:'mmc-snd',text:'Sound lane (fixture)'});}};
const mountOverlay=element=>{document.body.append(element);return()=>element.remove();};
const WearsPanel=class{};
window.actions=0;window.closedMenus=0;
class FixtureCast{
 ${['constructor','render'].map(name=>method(name,cast)).join('\n')}
 typing(){return false;}
 problem(member){return member.problem||'';}
 card(member){return el('div',{class:'mmc-cast-card'},[
  el('div',{class:'mmc-cast-row'},[
   el('button',{class:'mmc-cast-grip',title:'Edit cast member',onclick:()=>actions++},[
    el('span',{class:'mmc-cast-line-ident'},[
     el('span',{class:'mmc-cast-line-name',text:'@'+member.handle}),
     el('span',{class:'mmc-cast-line-takes',text:t('person')}),
    ]),
   ]),
   el('span',{class:'mmc-cast-line-state',text:t('in shots {list}',{list:'1, 2'})}),
  ]),
 ]);}
 addSubject(){actions++;}
 reveal(){this.section.setOpen(true);}
}
class Subject{
 ${['mount','sectionOptions','sectionPreview','updateSectionSummaries','fieldValue','fieldRefineButton','refineTimelineField','segmentNavigator','openSegmentNavigator','cardLabel','renderNavigation','jumpToSegment','textBox','noAudioButton','audioEdited',
  'clearAudioUndo','showAudioUndo','undoAudioField'].map(name=>method(name)).join('\n')}
 globalPromptBox(){
  const root=el('div',{class:'mmc-prompt',contenteditable:'true',role:'textbox',tabindex:'0'});
  return{root,frame:el('div',{class:'mmc-tl-prompt-frame'},[root]),setValue:value=>{root.textContent=value;},closeMenu:()=>closedMenus++};
 }
 render(){
  this.poolSection.setActions(el('button',{class:'mmc-ghost mmc-tl-pool-add',text:'+ '+t('Add'),onclick:()=>actions++}));
  this.poolSection.setText(t('Piece references'),t("Attached once. Cite the @handle in the global prompt to use it in every segment, or in a segment's own prompt to use it just there."));
  this.poolSection.body.replaceChildren(el('div',{class:'mmc-assets'},['ref-1','ref-2'].map(handle=>el('div',{class:'mmc-asset'},[
   el('span',{class:'mmc-asset-thumb'},[icon('video',15)]),
   el('button',{class:'mmc-asset-handle',text:'@'+handle,onclick:()=>actions++}),
   el('span',{class:'mmc-tl-pool-where',text:t('in shots {list}',{list:'1, 2'})}),
   el('button',{class:'mmc-asset-x',text:'✕',onclick:()=>actions++}),
  ]))));
  if(!this.castShelf){
   this.castShelf=new FixtureCast({getCast:()=>this.timeline.subjects,getAssets:()=>[],disclosure:true,
    initialOpen:this.sections.read('cast'),onOpenChange:open=>this.sections.write('cast',open),library:()=>actions++});
   this.castHost.append(this.castShelf.root);
  }
  this.castShelf.render();
  this.barHost.replaceChildren(el('button',{class:'mmc-pill',text:'16:9'}),el('button',{class:'mmc-pill',text:'MiniMax H3'}));
  this.renderNavigation();
  this.stripHost.replaceChildren(...this.timeline.segments.map((segment,index)=>el('div',{class:'mmc-tl-pass'},[
   el('div',{class:'mmc-tl-pass-head'}),
   el('div',{class:'mmc-tl-pass-cards'},[el('div',{class:'mmc-tl-card fixture-segment','data-mmc-segment-index':index},[
    el('button',{class:'mmc-tl-edit mmc-ghost',text:t('Edit'),onclick:()=>actions++}),
    el('span',{text:'Segment '+(index+1)+' — original controls'}),
   ])]),
   el('div',{class:'mmc-tl-problem'}),
  ])));
 }
 commit(){this.commits++;this.updateSectionSummaries();}
 // This disclosure fixture has no held takes; real hold gates/actions are
 // exercised independently by the header-layout fixture.
 holdAllPills(){return [];}
 close(){this.clearAudioUndo();this.unmount();}
}
window.setFixture=(options={})=>{
 if(window.subject)subject.close();language=options.language||'en';window.actions=0;
 const values={global_prompt:options.open!==false,overall_soundscape:options.open!==false,non_diegetic_music:options.open!==false,references:options.open!==false,cast:options.open!==false};
 const sections={read:key=>values[key],write:(key,value)=>{values[key]=value;}};
 window.subject=Object.assign(new Subject(),{sections,audioVersions:{soundscape:0,music:0},commits:0,
  timeline:{prompt:'Face swap. Preserve source framing and performance in every frame. Use @subject for the identity.',
   soundscape:'Keep the original recorded ambience and physical sounds, at their original timing and pauses. Do not add music.',music:'N/A',
   subjects:[{handle:'subject'}],assets:[],segments:options.segments??[{},{}]}});
 subject.mount();window.sectionValues=values;return JSON.stringify(subject.timeline);
};
window.allSections=()=>[subject.promptSection,subject.soundscapeSection,subject.musicSection,subject.poolSection,subject.castShelf.section];
window.makePopup=()=>{
 const card=subject.poolSection.root;
 const popup=el('div',{class:'mmc-pop fixture-owned-menu',style:{position:'absolute',left:'12px',top:'100%',zIndex:'25'},text:'Existing reference menu'});
 card.append(popup);return popup.getBoundingClientRect().toJSON();
};
setFixture();
`;
new vm.Script(code,{filename:'timeline-disclosure-look-production-fixture.js'});
let browser,requests=0;const checks=[];
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const check=async(name,run)=>{await run();checks.push({name,passed:true});};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1350,height:1000}});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}.fixture-segment{min-height:100px;width:240px}@media(max-width:640px){.mmc-overlay{padding:12px}}</style></head><body></body></html>');
 await page.evaluate(ko);await page.evaluate('(()=>{'+code+'})()');
 await check('All five expanded shells share one 20px outer border, inner headers and inputs have none',async()=>{
  const rows=await page.evaluate(()=>allSections().map(section=>{
   const root=getComputedStyle(section.root),head=getComputedStyle(section.head),toggle=getComputedStyle(section.toggle);
   return{open:section.isOpen(),outer:root.borderTopWidth,radius:root.borderTopLeftRadius,head:head.borderTopWidth,toggle:toggle.borderTopWidth,gap:root.rowGap};
  }));
  assert.deepEqual(rows,Array.from({length:5},()=>({open:true,outer:'1px',radius:'20px',head:'0px',toggle:'0px',gap:'0px'})));
  assert.deepEqual(await page.evaluate(()=>[subject.promptBox.frame,subject.soundscapeBox,subject.musicBox].map(element=>getComputedStyle(element).borderTopWidth)),['0px','0px','0px']);
  if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await page.locator('.mmc-tl-modal').screenshot({path:path.join(artifacts,'timeline-disclosures-expanded.png')});}
 });
 await check('Collapsed shells keep same outline/rounding and all original mounted input values',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await page.evaluate(()=>allSections().forEach(section=>section.setOpen(false)));
  assert.deepEqual(await page.evaluate(()=>allSections().map(section=>({open:section.isOpen(),border:getComputedStyle(section.root).borderTopWidth,radius:getComputedStyle(section.root).borderTopLeftRadius,hidden:section.body.hidden}))),Array.from({length:5},()=>({open:false,border:'1px',radius:'20px',hidden:true})));
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
  if(artifacts)await page.locator('.mmc-tl-modal').screenshot({path:path.join(artifacts,'timeline-disclosures-collapsed.png')});
 });
 await check('N/A, reference Add and cast actions retain independent hitboxes without toggling headers',async()=>{
  const before=await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits}));await page.locator('.mmc-tl-na').first().click();assert.deepEqual(await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits})),before);await page.locator('.mmc-tl-na').first().click();assert.equal(await page.evaluate(()=>subject.soundscapeSection.isOpen()),false);assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'N/A');
  await page.locator('.mmc-tl-pool-add').click();await page.locator('.mmc-cast-new').first().click();assert.equal(await page.evaluate(()=>window.actions),2);
  assert.equal(await page.evaluate(()=>subject.poolSection.isOpen()),false);assert.equal(await page.evaluate(()=>subject.castShelf.section.isOpen()),false);
 });
 await check('Keyboard header/input focus remains visible and scoped, collapse preserves focus return',async()=>{
  await page.locator('.mmc-tl-section-toggle').first().focus();await page.keyboard.press('Enter');
  const outline=await page.locator('.mmc-tl-section-toggle').first().evaluate(element=>getComputedStyle(element).outlineWidth);assert.notEqual(outline,'0px');
  await page.locator('.mmc-prompt').focus();const focus=await page.evaluate(()=>getComputedStyle(subject.promptSection.root).borderColor);await page.locator('.mmc-prompt').blur();const blurred=await page.evaluate(()=>getComputedStyle(subject.promptSection.root).borderColor);assert.notEqual(focus,blurred);
  await page.evaluate(()=>{subject.promptBox.root.focus();subject.promptSection.setOpen(false);});assert.equal(await page.evaluate(()=>document.activeElement===subject.promptSection.toggle),true);
 });
 await check('Section/body overflow remains visible so existing popovers are not clipped',async()=>{
  await page.evaluate(()=>subject.poolSection.setOpen(true));await page.evaluate(()=>makePopup());
  assert.equal(await page.evaluate(()=>[subject.poolSection.root,subject.poolSection.body].every(element=>getComputedStyle(element).overflow==='visible')),true);
  const hit=await page.evaluate(()=>{const menu=document.querySelector('.fixture-owned-menu'),box=menu.getBoundingClientRect();return document.elementFromPoint(box.left+8,box.top+8)===menu;});assert.equal(hit,true);
  await page.locator('.fixture-owned-menu').evaluate(element=>element.remove());
 });
 await check('Between-area separators are thematic, translucent and never take pointer input',async()=>{
  const rows=await page.evaluate(()=>[subject.promptSection.root,subject.audioHost,subject.poolHost,subject.castHost].map(element=>{const style=getComputedStyle(element,'::after');return{content:style.content,height:style.height,pointer:style.pointerEvents,background:style.backgroundImage};}));
  for(const row of rows){assert.equal(row.content,'""');assert.equal(row.height,'1px');assert.equal(row.pointer,'none');assert.ok(row.background.includes('gradient'));}
 });
 await check('Cast diagnostics remain visible when folded and inside common bubble without input schema changes',async()=>{
  await page.evaluate(()=>{subject.timeline.subjects[0].problem='Missing cast reference';subject.castShelf.render();subject.castShelf.section.setOpen(false);});
  const result=await page.evaluate(()=>({visible:!subject.castShelf.sectionWarning.hidden,message:subject.castShelf.sectionWarning.textContent,
   inside:subject.castShelf.section.root.contains(subject.castShelf.sectionWarning),bodyContains:subject.castShelf.section.body.contains(subject.castShelf.sectionWarning)}));
  assert.deepEqual(result,{visible:true,message:'@subject: Missing cast reference',inside:true,bodyContains:false});
 });
 await check('Ordinary card buttons, modal picker disclosures and node-face cast are not rounded or hidden globally',async()=>{
  const original=await page.locator('.mmc-tl-edit').first().evaluate(element=>({radius:getComputedStyle(element).borderRadius,display:getComputedStyle(element).display}));
  assert.notEqual(original.radius,'20px');assert.notEqual(original.display,'none');
  const outside=await page.evaluate(()=>{const section=createDisclosure({title:'Outside timeline',content:document.createElement('textarea')});document.body.append(section.root);const styles={radius:getComputedStyle(section.root).borderRadius,outer:getComputedStyle(section.root).borderTopWidth};section.root.remove();return styles;});
  assert.equal(outside.outer,'0px');assert.notEqual(outside.radius,'20px');
 });
 await check('Segment navigator is left-aligned in its own strip-adjacent row with non-interactive top divider',async()=>{
  const placement=await page.evaluate(()=>{
   const host=subject.navigationHost,style=getComputedStyle(host),line=getComputedStyle(host,'::before');
   return{next:host.nextElementSibling===subject.stripHost,before:host.previousElementSibling===subject.loraHost,
    standalone:!subject.barHost.contains(host),align:style.justifyContent,visible:!host.hidden,
    divider:line.content,height:line.height,pointer:line.pointerEvents,top:line.top};
  });
  assert.deepEqual(placement,{next:true,before:true,standalone:true,align:'flex-start',visible:true,divider:'""',height:'1px',pointer:'none',top:'0px'});
  const before=await page.evaluate(()=>({state:JSON.stringify(subject.timeline),commits:subject.commits}));
  await page.locator('.mmc-tl-jump-select').click();
  await page.locator('.mmc-tl-jump-option').nth(1).click();
  assert.deepEqual(await page.evaluate(()=>({state:JSON.stringify(subject.timeline),commits:subject.commits})),before);
  assert.equal(await page.evaluate(()=>subject.jumpTarget.dataset.mmcSegmentIndex),'1');
  assert.equal(await page.locator('.mmc-tl-jump-select').getAttribute('aria-expanded'),'false');
 });
 await check('A single card offers Ready preview without a jump menu; an empty timeline hides navigation',async()=>{
  for(const segments of [[{}],[]]){
   await page.evaluate(segments=>setFixture({segments}),segments);
   assert.equal(await page.evaluate(()=>subject.navigationHost.hidden),segments.length===0);assert.equal(await page.locator('.mmc-tl-jump-select').count(),0);
   assert.equal(await page.locator('.mmc-tl-individual-preview').count(),segments.length);
  }
 });
 await check('320px Korean large-type expanded and mixed states retain contained header actions and no x-overflow',async()=>{
  await page.setViewportSize({width:320,height:1450});await page.evaluate(()=>document.documentElement.style.setProperty('--mmc-type','1.6'));await page.evaluate(()=>setFixture({language:'ko'}));
  const dims=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,modal:subject.modal.scrollWidth,width:subject.modal.clientWidth,
   sections:allSections().map(section=>({scroll:section.root.scrollWidth,width:section.root.clientWidth})),actions:[...document.querySelectorAll('.mmc-tl-section-actions')].filter(element=>element.children.length).map(element=>{const parent=element.closest('.mmc-tl-section').getBoundingClientRect(),rect=element.getBoundingClientRect();return{inside:rect.left>=parent.left&&rect.right<=parent.right+1};})}));
  assert.ok(dims.body<=dims.viewport);assert.ok(dims.modal<=dims.width+1);for(const section of dims.sections)assert.ok(section.scroll<=section.width+1);for(const action of dims.actions)assert.ok(action.inside);
  assert.equal(await page.evaluate(()=>subject.navigationHost.scrollWidth<=subject.navigationHost.clientWidth),true);
  if(artifacts)await page.locator('.mmc-tl-modal').screenshot({path:path.join(artifacts,'timeline-disclosures-ko-320-large.png')});
  await page.evaluate(()=>{subject.promptSection.setOpen(false);subject.musicSection.setOpen(false);subject.castShelf.section.setOpen(false);});
  assert.equal(await page.evaluate(()=>allSections().every(section=>getComputedStyle(section.root).borderTopLeftRadius==='20px')),true);
  if(artifacts)await page.locator('.mmc-tl-modal').screenshot({path:path.join(artifacts,'timeline-disclosures-ko-320-mixed.png')});
 });
 assert.equal(requests,0);console.log(JSON.stringify({checks,passed:checks.length,requests,scope:'isolated real disclosure/CastShelf shells and styles, no live render'},null,2));await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
