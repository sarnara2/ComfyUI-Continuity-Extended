// Real Timeline mount/bar/navigation/hold/renderMode/storyboard, real pill and
// refine DOM methods, and current production CSS. Media/catalog/geometry and
// model/refine execution are isolated adapters: no server, queue or GPU work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const timeline = read('timeline.js'), state = read('state.js'), dom = read('dom.js');
const pills = read('pills.js'), models = read('models.js'), refine = read('refine.js');
const method = (name, text = timeline) => {
  const found = text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Production method ${name}`); return found[0];
};
const fn = (name, text = dom) => {
  const found = text.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production function ${name}`); return found[0].replace(/^export /, '');
};
const constBody = name => {
  const found = state.match(new RegExp(`^export const ${name} =[^]*?;`, 'm'));
  assert.ok(found, `Production state helper ${name}`); return found[0].replace(/^export /, '');
};
const baseline = process.env.CONTINUITY_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_BASELINE_DIR, 'web/creator')
  : path.resolve(__dirname, '../../../baseline/web/creator');
if (fs.existsSync(path.join(baseline, 'timeline.js'))) {
  const original = fs.readFileSync(path.join(baseline, 'timeline.js'), 'utf8');
  for (const name of ['holdAllPills', 'renderMode', 'storyboardPill', 'pickStoryboardPolicy']) {
    assert.equal(method(name), method(name, original), `${name} keeps original behavior`);
  }
}
assert.match(method('mount'), /class: "mmc-modal-head mmc-tl-header"/);
assert.match(method('mount'), /this\.summaryHost, this\.loraHost, this\.navigationHost, this\.stripHost/);
assert.match(method('renderNavigation'), /this\.holdAllPills\(\)/);
assert.doesNotMatch(method('renderBar'), /this\.holdAllPills\(\)/);
assert.match(method('renderBar'), /this\.summaryHost\.replaceChildren\(/);
const cssNames = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)].map(match => match[1]);
const css = cssNames.map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko = vm.runInNewContext(read('locales/ko.js').replace(/^export const /m, 'const ') + ';ko;', {});
const disclosure = read('disclosure.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const viewHelpers = read('viewprefs.js').replace(/^export /gm, '');
const scrollbarHelpers = read('timeline-scrollbars.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const code = `
${['el', 'svg', 'floatAbove', 'dismissable', 'placeNear'].map(name => fn(name)).join('\n')}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${viewHelpers}
window.previewViewPrefs={readViewPrefs,patchViewPrefs,clearViewPrefs};
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /, '')}
const icon=(name,size=13)=>svg(ICONS[name]||ICONS.effect,size);
${disclosure}
let locale='en',fixtureOptions={};
${scrollbarHelpers}
const ko=${JSON.stringify(ko)};
const t=(text,values={})=>(locale==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??'{'+key+'}');
${['merged', 'isClip', 'isHeld', 'takeOn', 'shotInParts'].map(constBody).join('\n')}
${['passes', 'holdAll', 'dropMissingTakes','cardName','storyboardCards'].map(name => fn(name, state)).join('\n')}
const S={merged,isClip,isHeld,takeOn,shotInParts,passes,holdAll,dropMissingTakes,cardName,
 isSingle:piece=>piece.render==='single',pieceFamily:piece=>piece.family||'h3',
 hasPromptSections:()=>false,
 familyOf:()=>({capabilities:{audio:{supplied:false}}}),DEFAULT_VIDEO_FAMILY:'h3',MAX_AUDIO_TAIL_S:4,
 FAMILY_LABEL:{h3:'MiniMax H3',ltx:'LTX 2.5'},FAMILY_DESCRIPTION:{h3:'Local video family',ltx:'Another local video family'},VIDEO_FAMILIES:['h3','ltx'],
 syncTimeline:()=>{},timelineSeconds:piece=>piece.segments.reduce((n,segment)=>n+Number(segment.duration_s||0),0),
 timelineFrames:piece=>Math.round(S.timelineSeconds(piece)*24),hasAutoDuration:piece=>piece.segments.some(segment=>segment.duration_s==='auto'),
 sampledSeconds:piece=>piece.segments.filter(segment=>!isHeld(segment)&&!isClip(segment)).reduce((n,segment)=>n+Number(segment.duration_s||0),0),
 activeGlobalLoras:piece=>(piece.loras||[]).filter(entry=>!entry.muted),
 stripProblem:()=>fixtureOptions.problem||'',canDo:(_piece,feature)=>feature==='storyboard'&&fixtureOptions.storyboardAvailable!==false,
 storyboardPolicy:piece=>fixtureOptions.storyboardAvailable===false?null:piece.storyboard||null,
 storyboardCards,serializeTimeline:piece=>JSON.stringify(piece),
 continuesAudio:segment=>segment.continue_audio===true,feather:segment=>segment.feather||1,
 passMode:()=>fixtureOptions.passMode||'Ref2VA',
 setFamily:(piece,next)=>{if(piece.family===next)return false;piece.family=next;return true;},
};
const rulesFor=()=>({fps:24});
${['timelineSummary','observeTimelineSummary'].map(name => fn(name, read('timeline-summary.js'))).join('\n')}
const timelineGeometry=()=>({width:768,height:1344,ratio:9/16,fromInput:!!fixtureOptions.fromInput});
const describeRatio=()=> '9:16';
const resolutionPillText=()=>({title:'Resolution used for the output',sub:'768 × 1344'});
const aspectSourceLabel=()=> '@ref-1';
const probeAspectSizes=()=>{};
const rememberedWeights=()=>({});const adoptWeights=()=>{};
const blendSetsTail=(segment,piece)=>S.continuesAudio(segment)&&S.feather(segment,piece)>1;
const mountOverlay=overlay=>{document.body.append(overlay);return()=>overlay.remove();};
${['storyboardGuidance','confirmStoryboardChange'].map(name => fn(name, read('storyboard-notice.js'))).join('\n')}
const closeOwnedPopovers=()=>{};const WearsPanel=class{};
const spinner=()=>el('span',{class:'mmc-spin'});
const queueBusy=()=>false,chosenModel=()=>null,DEFAULT_VIDEO_FAMILY='h3';
const FILTER_FROM=8;
const terms=(query)=>query.toLowerCase().split(/\\s+/).filter(Boolean);
${fn('hits', pills)}
${fn('lit', pills)}
${['openChoicePopover', 'stepperPill', 'aspectGlyph'].map(name => fn(name, pills)).join('\n')}
const PILL_GLYPH=16;
${fn('familyPill', models)}
${refine.match(/^let armedRefine = null;$/m)?.[0] || ''}
${refine.match(/^const refineOwners = new WeakSet\(\);$/m)?.[0] || ''}
${refine.match(/^const refineActivities = new WeakMap\(\);$/m)?.[0] || ''}
${fn('refineActivity', refine)}
${refine.match(/^export async function withRefineOwner\([^]*?^\}/m)?.[0].replace(/^export /,'') || ''}
${fn('refineButton', refine)}
const openSettings=(anchor,onChange)=>openChoicePopover(anchor,{title:'Fixture refine settings',options:['Inspect only'],value:null,onPick:()=>onChange()});
const openResolutionPopover=(anchor,piece,_geometry,onChange)=>openChoicePopover(anchor,{title:'Resolution',options:[480,768],value:piece.short_edge,
 onPick:value=>{if(value===piece.short_edge)return;piece.short_edge=value;onChange();}});
class SoundLane{constructor(){this.host=el('div',{class:'mmc-snd',text:'Sound lane (isolated)'});}render(){}}
class Subject{
 refreshReferences(){}
 disposePoolNamePress(){}
 watchPoolNamePress(){}
 updatePoolReferenceNotes(){}
 renderReferenceWarnings(){}
 ${['constructor','commit','mount','close','onEscape','clearCardPreviews','render','sectionOptions','sectionPreview','updateSectionSummaries','fieldValue','fieldRefineButton','globalPromptClearButton','refineTimelineField','textBox','noAudioButton',
 'audioEdited','clearAudioUndo','showAudioUndo','undoAudioField','geometry','renderBar','renderMode',
 'segmentNavigator','openSegmentNavigator','cardLabel','renderNavigation','jumpToSegment','holdAllPills','storyboardPill','pickStoryboardPolicy','confirmStoryboardEdit','showStoryboardInfo'].map(name => method(name)).join('\n')}
 globalPromptBox(){const root=el('div',{class:'mmc-prompt',contenteditable:'true',role:'textbox'});return{root,frame:el('div',{class:'mmc-tl-prompt-frame'},[root]),
  setValue:value=>root.textContent=value,closeMenu(){},refresh(){}};}
 renderPool(){this.poolSection.setText(t('Piece references'));this.poolSection.body.replaceChildren(el('div',{class:'mmc-assets',text:'@ref-1 — source video'}));}
 renderCast(){if(!this.castHost.children.length)this.castHost.append(el('div',{class:'mmc-tl-section',text:t('Cast')+' — @subject'}));}
 renderLoras(){this.loraHost.replaceChildren();this.loraHost.hidden=true;}
 renderStrip(){this.stripHost.replaceChildren(...this.timeline.segments.map((segment,index)=>el('div',{class:'mmc-tl-card',
  'data-mmc-segment-index':String(index),style:{width:'230px',minWidth:'230px',height:'150px'},text:t('Segment {n}',{n:index+1})+' · '+segment.duration_s+' s'})));}
 mergeAll(value){this.calls.push(['mode',value]);this.timeline.render=value?'single':'chained';this.timeline.segments.forEach((segment,index)=>{if(value&&index)segment.merge=true;else delete segment.merge;});this.commit();}
 openAspect(anchor){this.calls.push(['aspect-open']);return openChoicePopover(anchor,{title:'Aspect ratio',options:['9:16','16:9'],value:this.timeline.aspect,
  onPick:value=>{if(value===this.timeline.aspect)return;this.timeline.aspect=value;this.commit();}});}
 openLoras(){this.calls.push(['loras']);}
 refineAll(options){this.calls.push(['refine',typeof options.onProgress]);return Promise.resolve();}
 revertAll(){this.calls.push(['revert']);}
 storyboardHold(){return el('div',{text:'Existing storyboard retention controls'});}
 // Source-effect diagnostics are outside this header/control layout fixture.
 // The production choice, confirmation snapshot guard and apply callback run.
 storyboardEffectLines(){return ['Fixture source-effect diagnostics'];}
}
window.setFixture=(options={})=>{
 if(window.subject?.overlay?.isConnected)subject.close();
 document.querySelectorAll('body > .mmc-pop').forEach(node=>node.remove());
 fixtureOptions=options;locale=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
 const segments=options.segments||[
  {prompt:'Keep recorded performance',duration_s:14.38,hold:true,take:{filename:'first.mp4'}},
  {prompt:'Replace the visible performer',duration_s:14.38,continue_audio:true,feather:1,refined:{body:'Refined prompt'},take:{filename:'second.mp4'}},
 ];
 const piece={family:'h3',render:options.single?'single':'chained',aspect:'9:16',short_edge:768,audio_tail_s:1,storyboard:'previous',
  prompt:'Replace only the visible performer with @subject. Keep source performance and framing.',soundscape:'Keep original recorded dialogue and ambience.',music:'N/A',
  assets:[],subjects:[],loras:[{name:'Swap model',strength:1},{name:'Idle one',muted:true},{name:'Idle two',muted:true}],segments:structuredClone(segments)};
 if(options.single)piece.segments.forEach((segment,index)=>{if(index)segment.merge=true;});
 window.subject=new Subject({timeline:piece,sections:{read:()=>false,write(){}}},()=>{subject.closed=(subject.closed||0)+1;});
 subject.calls=[];subject.commits=0;subject.onCommit=()=>subject.commits++;subject.refineError=options.refineError||null;
 subject.gone=new Set(options.gone||[]);subject.mount();return JSON.stringify(piece);
};
window.snapshot=()=>({timeline:JSON.stringify(subject.timeline),commits:subject.commits,calls:structuredClone(subject.calls)});
window.getLayout=()=>{
 const rect=node=>{const value=node.getBoundingClientRect();return{left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height};};
 const head=subject.modal.querySelector('.mmc-tl-header'),title=head.querySelector('.mmc-tl-heading'),divider=head.querySelector('.mmc-tl-header-divider'),close=head.querySelector('.mmc-close');
 return{viewport:{width:innerWidth,height:innerHeight},page:document.documentElement.scrollWidth,modal:rect(subject.modal),header:rect(head),title:rect(title),divider:rect(divider),bar:rect(subject.barHost),close:rect(close),
  barScroll:subject.barHost.scrollWidth,barClient:subject.barHost.clientWidth,barY:subject.barHost.scrollHeight,barHeight:subject.barHost.clientHeight,
  headerScroll:head.scrollWidth,headerClient:head.clientWidth,nav:rect(subject.navigationHost),navScroll:subject.navigationHost.scrollWidth,navClient:subject.navigationHost.clientWidth,
  children:[...subject.barHost.children].map(node=>({box:rect(node),scroll:node.scrollWidth,client:node.clientWidth,text:node.textContent})),
  navChildren:[...subject.navigationHost.children].map(node=>({box:rect(node),scroll:node.scrollWidth,client:node.clientWidth,text:node.textContent})),
  bodyHeight:subject.stripHost.closest('.mmc-tl-body').clientHeight,closeHit:document.elementFromPoint(close.getBoundingClientRect().left+close.clientWidth/2,close.getBoundingClientRect().top+close.clientHeight/2)===close};
};
setFixture();
`;
new vm.Script(code, { filename: 'timeline-header-current-production-fixture.js' });
let browser, requests = 0;
const results = [], errors = [];
const artifacts = process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const check = async (name, run) => { await run(); results.push({ name, passed: true }); console.log('PASS ' + name); };
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent('<html class="dark-theme"><head><style>' + css + ':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style></head><body></body></html>');
  await page.evaluate('(()=>{' + code + '})()');
  const reset = async options => page.evaluate(options => setFixture(options), options);
  const shot = async name => { if (!artifacts) return; fs.mkdirSync(artifacts, { recursive: true }); await page.screenshot({ path: path.join(artifacts, name), fullPage: true }); };
  await check('Timeline Close alone uses the card ordinal accent and a larger bold glyph without changing its hitbox', async () => {
    for (const scale of [1, 1.6]) {
      await reset({ scale });
      await page.evaluate(scale => document.documentElement.style.setProperty('--mmc-type', String(scale)), scale);
      const close=page.locator('.mmc-tl-header > .mmc-close');
      const before=await close.boundingBox();
      const values=await close.evaluate(node=>{const s=getComputedStyle(node),ordinal=document.createElement('span');ordinal.className='mmc-tl-index';node.parentElement.append(ordinal);
        const color=getComputedStyle(ordinal).backgroundColor;ordinal.remove();return {color:s.color,accent:color,size:parseFloat(s.fontSize),weight:s.fontWeight};});
      assert.equal(values.color,values.accent);assert.equal(values.size,20*scale);assert.equal(values.weight,'600');
      await close.hover();assert.equal(await close.evaluate(n=>getComputedStyle(n).color),values.accent);
      await close.focus();assert.deepEqual(await close.boundingBox(),before);
      const plain=await page.evaluate(()=>{const n=document.createElement('button');n.className='mmc-close';document.body.append(n);const s=getComputedStyle(n),r={size:parseFloat(s.fontSize),color:s.color};n.remove();return r;});
      assert.ok(plain.size<values.size);assert.notEqual(plain.color,values.accent);
    }
    await reset({});await page.evaluate(()=>document.documentElement.style.setProperty('--mmc-type','1'));
  });
  await check('The original bar node is in the header after title/divider, before Close, not duplicated in the body', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const head=subject.modal.querySelector('.mmc-tl-header');return{order:[...head.children].map(node=>node.className),barCount:subject.modal.querySelectorAll('.mmc-tl-bar').length,
        bodyHasBar:subject.barHost.closest('.mmc-tl-body')!==null,summaryBody:subject.summaryHost.parentElement.className};
    }), { order: ['mmc-tab mmc-tl-heading', 'mmc-tl-header-divider', 'mmc-tl-bar', 'mmc-close'], barCount: 1, bodyHasBar: false, summaryBody: 'mmc-tl-body mmc-tl-scroll-managed' });
  });
  await check('Title divider is a subtle noninteractive vertical line and title/Close keep their own columns', async () => {
    const result=await page.evaluate(()=>{const node=subject.modal.querySelector('.mmc-tl-header-divider'),style=getComputedStyle(node);return{aria:node.getAttribute('aria-hidden'),pointer:style.pointerEvents,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,background:style.backgroundImage};});
    assert.equal(result.aria,'true');assert.equal(result.pointer,'none');assert.ok(result.width<=2&&result.height>=20);assert.ok(result.background.includes('gradient'));
    const boxes=await page.evaluate(()=>getLayout());assert.ok(boxes.title.right<boxes.divider.left&&boxes.divider.right<boxes.bar.left&&boxes.bar.right<boxes.close.left);
  });
  await check('All unchanged dynamic controls render in the header; totals, cost and diagnostic messages stay below', async () => {
    await reset({problem:'A supplied source is unavailable',refineError:'Refiner needs a text model'});
    assert.deepEqual(await page.evaluate(()=>({model:subject.barHost.querySelectorAll('.mmc-pill-model').length,mode:subject.barHost.querySelectorAll('.mmc-tl-render').length,
      refine:subject.barHost.querySelectorAll('.mmc-refine-split').length,revert:subject.barHost.querySelectorAll('.mmc-tl-unrefine').length,
      hold:subject.barHost.querySelectorAll('.mmc-tl-holdall').length,total:subject.summaryHost.querySelectorAll('.mmc-tl-total').length,
      problem:subject.summaryHost.querySelector('.mmc-tl-problem').textContent,warn:subject.summaryHost.querySelector('.mmc-warn').textContent})),
      {model:1,mode:1,refine:1,revert:1,hold:0,total:1,problem:'renderA supplied source is unavailable',warn:'Refiner needs a text model'});
    assert.equal(await page.locator('.mmc-tl-bar > [data-storyboard-policy]').textContent(),'Global storyboardprevious shot');
    assert.equal(await page.locator('.mmc-tl-bar > [data-storyboard-policy]').getAttribute('data-storyboard-policy'),'previous');
    assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group > span').textContent(),'1.0s tail');
    assert.deepEqual(await page.locator('.mmc-tl-bar > button').filter({hasText:'1 LoRA'}).locator('span').allTextContents(),['1 LoRA','2 idle']);
  });
  await check('Ready preview fits between Go-to-segment and the exact original Lock all/Unlock all helpers', async () => {
    await reset({});assert.deepEqual(await page.evaluate(()=>[...subject.navigationHost.children].map(node=>node.className)),['mmc-tl-jump','mmc-pill mmc-tl-individual-preview on','mmc-pill mmc-tl-holdall','mmc-pill mmc-tl-holdall','mmc-tl-navigation-divider']);
    assert.equal(await page.locator('.mmc-tl-navigation-divider').getAttribute('aria-hidden'),'true');
    assert.deepEqual(await page.locator('.mmc-tl-navigation .mmc-tl-holdall').allTextContents(),['Lock all','Unlock all']);
    assert.equal(await page.locator('.mmc-tl-bar .mmc-tl-holdall').count(),0);
  });
  await check('Mount and repeated rerenders/reopening are read-only and do not accumulate controls or commit callbacks', async () => {
    const before=await page.evaluate(()=>snapshot());await page.evaluate(()=>{for(let i=0;i<8;i++)subject.render();});assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    assert.equal(await page.locator('.mmc-tl-bar').count(),1);assert.equal(await page.locator('.mmc-tl-jump-select').count(),1);assert.equal(await page.locator('.mmc-tl-holdall').count(),2);
    await reset({});assert.equal(await page.locator('.mmc-tl-header').count(),1);assert.equal(await page.evaluate(()=>subject.commits),0);
  });
  await check('Header family choice uses the original onChange once, while opening is read-only', async () => {
    const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-tl-bar .mmc-pill-model').click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    await page.locator('body > .mmc-pop .mmc-opt').filter({hasText:'LTX 2.5'}).click();assert.equal(await page.evaluate(()=>subject.timeline.family),'ltx');assert.equal(await page.evaluate(()=>subject.commits),1);
    assert.equal(await page.locator('.mmc-tl-bar .mmc-pill-model').textContent(),'LTX 2.5');
  });
  await check('Moved mode, aspect and resolution controls retain one original callback per accepted choice', async () => {
    await reset({});await page.locator('.mmc-tl-render-opt').filter({hasText:'One pass'}).click();assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.evaluate(()=>subject.timeline.render),'single');
    await page.locator('.mmc-tl-bar > button').nth(1).click();await page.locator('body > .mmc-pop .mmc-opt').filter({hasText:'16:9'}).click();assert.equal(await page.evaluate(()=>subject.timeline.aspect),'16:9');assert.equal(await page.evaluate(()=>subject.commits),2);
    await page.locator('.mmc-tl-bar > button').nth(2).click();await page.locator('body > .mmc-pop .mmc-opt').filter({hasText:'480'}).click();assert.equal(await page.evaluate(()=>subject.timeline.short_edge),480);assert.equal(await page.evaluate(()=>subject.commits),3);
  });
  await check('Storyboard and unblended audio-tail pills retain their original commit paths', async () => {
    await reset({});const before=await page.evaluate(()=>snapshot());
    await page.locator('.mmc-tl-bar > [data-storyboard-policy]').click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    await page.locator('body > .mmc-pop .mmc-opt').filter({hasText:'Each shot sees the piece so far'}).click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    assert.equal(await page.locator('.mmc-storyboard-confirm').count(),1);await page.locator('.mmc-storyboard-confirm-cancel').click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    await page.locator('.mmc-tl-bar > [data-storyboard-policy]').click();await page.locator('body > .mmc-pop .mmc-opt').filter({hasText:'Each shot sees the piece so far'}).click();
    await page.locator('.mmc-storyboard-confirm-apply').click();assert.equal(await page.evaluate(()=>subject.timeline.storyboard),'all');assert.equal(await page.evaluate(()=>subject.commits),1);
    await page.locator('.mmc-tl-bar .mmc-pill-group .mmc-step').filter({hasText:'+'}).click();assert.equal(await page.evaluate(()=>subject.timeline.audio_tail_s),1.1);assert.equal(await page.evaluate(()=>subject.commits),2);
  });
  await check('LoRA and refine/revert are still independent original hooks, with no actual model/refiner execution', async () => {
    await reset({});const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await page.locator('.mmc-tl-bar > button').filter({hasText:'1 LoRA'}).click();await page.locator('.mmc-tl-refine').click();
    assert.deepEqual(await page.evaluate(()=>subject.calls),[['loras']]);assert.equal(await page.evaluate(()=>subject.commits),0);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Confirm');
    await page.locator('.mmc-tl-refine').click();await page.locator('.mmc-tl-unrefine').click();
    assert.deepEqual(await page.evaluate(()=>subject.calls),[['loras'],['refine','function'],['revert']]);assert.equal(await page.evaluate(()=>subject.commits),0);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
  });
  await check('Moved Lock all changes generated cards only and commits once; Unlock all restores original holds', async () => {
    await reset({segments:[{duration_s:12,hold:true,take:{filename:'first.mp4'}},{duration_s:12,take:{filename:'second.mp4'}},{kind:'clip',duration_s:4,filename:'source.mp4'}]});
    const clip=await page.evaluate(()=>JSON.stringify(subject.timeline.segments[2]));await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).click();
    assert.deepEqual(await page.evaluate(()=>subject.timeline.segments.map(segment=>segment.hold===true)),[true,true,false]);assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).isDisabled(),true);
    await page.locator('.mmc-tl-holdall').filter({hasText:/^Unlock all$/}).click();assert.deepEqual(await page.evaluate(()=>subject.timeline.segments.map(segment=>segment.hold===true)),[false,false,false]);assert.equal(await page.evaluate(()=>subject.commits),2);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline.segments[2])),clip);
  });
  await check('Single generated card can expose lock actions even when Go-to-segment is absent', async () => {
    await reset({segments:[{duration_s:12,take:{filename:'first.mp4'}}]});assert.equal(await page.locator('.mmc-tl-jump-select').count(),0);assert.equal(await page.evaluate(()=>subject.navigationHost.hidden),false);
    assert.deepEqual(await page.locator('.mmc-tl-holdall').allTextContents(),['Lock all','Unlock all']);assert.equal(await page.locator('.mmc-tl-holdall').filter({hasText:/^Unlock all$/}).isDisabled(),true);
    await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).click();assert.equal(await page.evaluate(()=>subject.timeline.segments[0].hold),true);assert.equal(await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).isDisabled(),true);assert.equal(await page.locator('.mmc-tl-holdall').filter({hasText:/^Unlock all$/}).isEnabled(),true);
  });
  await check('Empty and unshot timelines retain disabled Lock/Unlock controls; Ready preview appears only with a card', async () => {
    for(const segments of [[],[{duration_s:12,prompt:'One shot'}]]){await reset({segments});assert.equal(await page.evaluate(()=>subject.navigationHost.hidden),false);assert.equal(await page.locator('.mmc-tl-individual-preview').count(),segments.length);assert.deepEqual(await page.locator('.mmc-tl-holdall').allTextContents(),['Lock all','Unlock all']);assert.deepEqual(await page.locator('.mmc-tl-holdall').evaluateAll(nodes=>nodes.map(node=>node.disabled)),[true,true]);assert.equal(await page.locator('.mmc-tl-navigation-divider').count(),1);assert.equal(await page.locator('.mmc-tl-bar .mmc-pill-model').count(),1);}
    await reset({segments:[{duration_s:12},{duration_s:12}]});assert.equal(await page.evaluate(()=>subject.navigationHost.hidden),false);assert.equal(await page.locator('.mmc-tl-jump-select').count(),1);assert.deepEqual(await page.locator('.mmc-tl-holdall').evaluateAll(nodes=>nodes.map(node=>node.disabled)),[true,true]);
  });
  await check('Missing takes keep their original Forget action beside locks; no take or hold changes until pressed', async () => {
    await reset({gone:['first.mp4']});const before=await page.evaluate(()=>snapshot());assert.deepEqual(await page.locator('.mmc-tl-holdall').allTextContents(),['Lock all','Forget missing takes','Unlock all']);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    await page.locator('.mmc-tl-forget-gone').click();assert.equal(await page.evaluate(()=>subject.timeline.segments[0].take),undefined);assert.equal(await page.evaluate(()=>subject.timeline.segments[0].hold),true);assert.equal(await page.evaluate(()=>subject.timeline.segments[1].take.filename),'second.mp4');assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.locator('.mmc-tl-forget-gone').count(),0);
  });
  await check('Unshot held cards keep Lock all disabled; no silent workaround, mutation or commit', async () => {
    await reset({segments:[{duration_s:12,hold:true},{duration_s:12}]});assert.equal(await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).isDisabled(),true);const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-tl-holdall').filter({hasText:/^Lock all$/}).evaluate(node=>node.click());assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  });
  await check('Merged, single, unsupported-storyboard and blended-audio gates stay identical after the move', async () => {
    await reset({single:true});assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-static').textContent(),'Ref2VA');assert.equal(await page.locator('.mmc-tl-bar > [data-storyboard-policy]').count(),0);assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group').count(),0);
    await reset({segments:[{duration_s:12},{duration_s:12,merge:true},{duration_s:12,continue_audio:true,feather:1}]});assert.equal(await page.locator('.mmc-tl-render-mixed').textContent(),'Mixed');assert.equal(await page.locator('.mmc-tl-bar > [data-storyboard-policy]').count(),1);assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group').count(),1);
    await reset({storyboardAvailable:false,segments:[{duration_s:12},{duration_s:12,continue_audio:true,feather:22}]});assert.equal(await page.locator('.mmc-tl-bar > [data-storyboard-policy]').count(),0);assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group').count(),0);
  });
  await check('Header/body layout handles dynamic pill appearance/disappearance without stale gaps or controls', async () => {
    await reset({});await page.evaluate(()=>{subject.timeline.segments.forEach(segment=>{delete segment.refined;delete segment.continue_audio;});subject.renderBar();});
    assert.equal(await page.locator('.mmc-tl-unrefine').count(),0);assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group').count(),0);assert.equal(await page.locator('.mmc-tl-header').count(),1);
    await page.evaluate(()=>{subject.timeline.segments[1].refined={body:'new body'};subject.timeline.segments[1].continue_audio=true;subject.renderBar();});assert.equal(await page.locator('.mmc-tl-unrefine').count(),1);assert.equal(await page.locator('.mmc-tl-bar > .mmc-pill-group').count(),1);assert.equal(await page.evaluate(()=>subject.commits),0);
  });
  await check('Moved Go-to-segment opens a body-portal menu, dismisses/rerenders cleanly and does not edit or lock cards', async () => {
    await reset({});const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-tl-jump-select').click();assert.equal(await page.locator('body > .mmc-tl-jump-menu').count(),1);await page.locator('.mmc-tl-jump-option').nth(1).click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);assert.equal(await page.evaluate(()=>subject.jumpTarget.dataset.mmcSegmentIndex),'1');
    await page.locator('.mmc-tl-jump-select').click();await page.evaluate(()=>subject.renderBar());assert.equal(await page.locator('.mmc-tl-jump-menu').count(),0);assert.equal(await page.locator('.mmc-tl-jump-select').getAttribute('aria-expanded'),'false');
  });
  await check('Desktop header pills, title/divider and Close are contained and uniformly aligned in English and Korean', async () => {
    await page.setViewportSize({width:1600,height:1050});
    for(const language of ['en','ko']){await reset({language});const layout=await page.evaluate(()=>getLayout());assert.ok(layout.page<=layout.viewport.width);assert.ok(layout.closeHit&&layout.close.right<=layout.modal.right-8);assert.ok(layout.headerScroll<=layout.headerClient+1);assert.ok(layout.barScroll<=layout.barClient+1);
      for(const child of layout.children)assert.ok(child.box.left>=layout.bar.left-.1&&child.box.right<=layout.bar.right+.1,JSON.stringify(child));
      const rows=new Map();for(const child of layout.children){const center=Math.round((child.box.top+child.box.bottom)/2);if(!rows.has(center))rows.set(center,[]);rows.get(center).push(child.box.height);}assert.ok(rows.size<=2,JSON.stringify(layout));
      await shot('timeline-header-desktop-'+language+'.png');}
  });
  await check('320/640px enlarged English/Korean keep Close reachable, pills bounded and a usable separately scrolling body', async () => {
    for(const width of [320,640])for(const language of ['en','ko'])for(const scale of [1,1.6]){
      await page.setViewportSize({width,height:1100});await reset({language,scale,gone:['first.mp4']});const layout=await page.evaluate(()=>getLayout());
      assert.ok(layout.page<=width,JSON.stringify(layout));assert.ok(layout.closeHit&&layout.close.left>=layout.modal.left&&layout.close.right<=layout.modal.right&&layout.close.top>=0&&layout.close.bottom<=1100,JSON.stringify(layout));
      assert.ok(layout.headerScroll<=layout.headerClient+1&&layout.barScroll<=layout.barClient+1,JSON.stringify(layout));assert.ok(layout.navScroll<=layout.navClient+1,JSON.stringify(layout));
      assert.ok(layout.bodyHeight>=200,JSON.stringify(layout));assert.ok(layout.title.bottom<=layout.bar.top+1&&layout.close.bottom<=layout.bar.top+1,JSON.stringify(layout));
      for(const child of layout.children)assert.ok(child.box.left>=layout.bar.left-.1&&child.box.right<=layout.bar.right+.1,JSON.stringify(child));
      for(const child of layout.navChildren)assert.ok(child.box.left>=layout.nav.left-.1&&child.box.right<=layout.nav.right+.1,JSON.stringify(child));
      if(scale===1.6)await shot('timeline-header-'+width+'-'+language+'-large.png');
    }
  });
  await check('Tall wrapped headers scroll only their settings; body scroll and close visibility remain independent', async () => {
    await page.setViewportSize({width:320,height:700});await reset({language:'ko',scale:1.6});const layout=await page.evaluate(()=>getLayout());assert.ok(layout.barY>layout.barHeight);assert.ok(layout.closeHit);assert.ok(layout.bodyHeight>=100);
    const before=await page.evaluate(()=>subject.modal.querySelector('.mmc-close').getBoundingClientRect().toJSON());await page.evaluate(()=>{subject.barHost.scrollTop=subject.barHost.scrollHeight;subject.stripHost.closest('.mmc-tl-body').scrollTop=100;});assert.deepEqual(await page.evaluate(()=>subject.modal.querySelector('.mmc-close').getBoundingClientRect().toJSON()),before);
    assert.equal(await page.locator('.mmc-close').isVisible(),true);await shot('timeline-header-320-ko-scrolled.png');
  });
  await check('Header-originated choice popovers portal outside the scroll container, remain clickable and cross the header boundary when needed', async () => {
    for(const options of [{width:1600,scale:1},{width:640,scale:1.6}]){
      await page.setViewportSize({width:options.width,height:900});await reset({language:'ko',scale:options.scale});const before=await page.evaluate(()=>snapshot());await page.locator('.mmc-pill-model').click();
      const result=await page.evaluate(()=>{const pop=document.querySelector('body > .mmc-pop'),box=pop.getBoundingClientRect(),head=subject.modal.querySelector('.mmc-tl-header').getBoundingClientRect();return{parent:pop.parentElement===document.body,insideBar:subject.barHost.contains(pop),top:box.top,bottom:box.bottom,headerBottom:head.bottom,hit:pop.contains(document.elementFromPoint(box.left+12,Math.min(box.bottom-12,innerHeight-12)))};});
      assert.ok(result.parent&&!result.insideBar&&result.hit,JSON.stringify(result));if(options.width===1600)assert.ok(result.bottom>result.headerBottom,JSON.stringify(result));assert.ok(result.top>=0&&result.bottom<=900);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
      await shot('timeline-header-choice-portal-'+options.width+'.png');await page.keyboard.press('Escape');
    }
  });
  await check('Close keeps its exact action and removes the modal without changing timeline state', async () => {
    const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await page.locator('.mmc-close').click();assert.equal(await page.locator('.mmc-tl-modal').count(),0);assert.equal(await page.evaluate(()=>subject.closed),1);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
  });
  assert.deepEqual(errors, []); assert.equal(requests, 0);
  console.log(JSON.stringify({ suite: 'timeline-header-layout', passed: results.length, networkRequests: requests, results,
    scope: 'real frontend layout/DOM/state hold methods; isolated media/model/refiner adapters; no live ComfyUI/GPU proof' }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
