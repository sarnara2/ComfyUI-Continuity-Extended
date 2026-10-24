// Production Timeline/disclosure methods in a network-blocked DOM fixture.
// No ComfyUI server, filesystem media changes, queueing or model execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const source = fs.readFileSync(path.join(root, 'timeline.js'), 'utf8');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const method = name => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `production method ${name}`); return found[0];
};
const disclosure = read('disclosure.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const dom = ['el','svg','floatAbove','dismissable','placeNear'].map(name=>read('dom.js').match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'))[0].replace(/^export /, '')).join('\n');
const css = ['base','editor','picker','overlays','timeline','popovers','refine'].map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
// Verify shortcut wiring and both actual card renderers, not only the fixture.
assert.match(method('renderBar'), /this\.renderNavigation\(\)/);
assert.match(method('renderNavigation'), /this\.segmentNavigator\(\)/);
assert.match(method('mount'), /this\.loraHost, this\.navigationHost, this\.stripHost/);
assert.doesNotMatch(method('renderBar'), /navigation \? \[navigation\]/);
for (const name of ['renderCard','renderClipCard']) assert.match(method(name), /"data-mmc-segment-index": String\(index\)/);
assert.doesNotMatch(method('jumpToSegment'), /this\.(?:commit|edit|editClip)\(|S\.(?:soloPass|holdAll)/);
const names = ['constructor','commit','textBox','globalPromptBox','setGlobalPrompt','sectionOptions',
  'sectionPreview','updateSectionSummaries','fieldValue','fieldRefineButton','refineTimelineField','audioEdited','clearAudioUndo','showAudioUndo',
  'undoAudioField','noAudioButton','mount','close','clearCardPreviews','render','segmentNavigator','openSegmentNavigator','cardLabel','renderNavigation','jumpToSegment',
  'takePiece','dropTimelineRewrite'];
const code = `
${dom}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${disclosure}
let locale='en';
const dictionaries={ko:${JSON.stringify(requireTextDictionary('ko'))}};
const t=(text,params={})=>(dictionaries[locale]?.[text]??text).replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??'{'+key+'}');
let armedRefine=null;
const icon=()=>el('span'),chosenModel=()=>null,queueBusy=()=>false,spinner=()=>el('span',{class:'mmc-spin'}),DEFAULT_VIDEO_FAMILY='h3',openSettings=()=>{};
const refineField=()=>{throw new Error('No refiner execution in the usability fixture');};
${read('refine.js').match(/^export function refineButton\([^]*?^\}/m)[0].replace(/^export /,'')}
const mountOverlay=node=>{document.body.append(node);return ()=>node.remove();};
${read('state.js').match(/^export function cardName\([^]*?^\}/m)[0].replace(/^export /,'')}
const S={cardName,syncTimeline:()=>{},isSingle:()=>false,isClip:segment=>segment.kind==='clip',
 familyOf:()=>({capabilities:{audio:{supplied:false}}})};
class PromptBox {
 constructor(config){this.config=config;this.root=el('div',{class:'mmc-prompt',contenteditable:'true'});
 this.frame=el('div',{},[this.root]);}
 setValue(value){this.root.textContent=value;}
 closeMenu(){} refresh(){}
}
class SoundLane {constructor(){this.host=el('div');} render(){}}
class Subject {
${names.map(method).join('\n')}
renderPool(){} renderCast(){} renderLoras(){} renderStrip(){}
renderBar(){this.renderNavigation();}
// These original navigation/audio cases intentionally have no held takes.
// The dedicated header fixture separately exercises real holdAllPills states.
holdAllPills(){return [];}
}
window.Subject=Subject; window.setLocale=value=>{locale=value;};
window.make=options=>{
 const timeline={prompt:'A quiet rainy street',soundscape:'Footsteps and rain',music:'N/A',
  assets:[],subjects:[],segments:Array.from({length:14},(_,i)=>({duration_s:13,prompt:'Scene '+(i+1),
  ...(i===12?{kind:'clip',filename:'clip_013.mp4'}:{})}))};
 const s=new Subject({timeline,...options},()=>{}); s.commits=0;s.onCommit=()=>s.commits++;s.mount();
 for(let i=0;i<14;i++)s.stripHost.append(el('div',{class:'mmc-tl-pass'},[
  el('div',{class:'mmc-tl-pass-head'}),el('div',{class:'mmc-tl-pass-cards'},[
   el('div',{class:'mmc-tl-card'+(i===12?' mmc-tl-clip':''),'data-mmc-segment-index':String(i),
    style:{width:'220px',minWidth:'220px',height:'170px'},text:'Segment '+(i+1)})])]));
 return s;
}; window.subject=make();
window.confirmNA=button=>{
 const before=JSON.stringify(subject.timeline),commits=subject.commits,undo=subject.audioUndo;
 button.click();
 if(JSON.stringify(subject.timeline)!==before||subject.commits!==commits||subject.audioUndo!==undo)throw new Error('First N/A press must only show confirmation');
 button.click();
};
`;
function requireTextDictionary(locale) {
  const text=read(`locales/${locale}.js`).replace(/^export const /m,'const ');
  return require('node:vm').runInNewContext(text+`;${locale};`,{});
}
new (require('node:vm').Script)(code);
const results=[];let browser,requests=0;
async function check(name,fn){await fn();results.push({name,passed:true});}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${css}:root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}</style><body style="--mmc-type:1;background:#111;font-family:Arial"></body>`);
 await page.evaluate(`(() => { ${code} })()`);
 await check('Collapsed headers hide prose previews while actual inputs still distinguish empty text from N/A',async()=>{
  assert.deepEqual(await page.evaluate(()=>{
   subject.promptSection.setOpen(false);subject.soundscapeSection.setOpen(false);subject.musicSection.setOpen(false);
   return [subject.promptSection,subject.soundscapeSection,subject.musicSection].map(s=>s.root.querySelector('.mmc-tl-section-hint').textContent);
  }),['','','']);
  assert.deepEqual(await page.evaluate(()=>[subject.timeline.prompt,subject.soundscapeBox.value,subject.musicBox.value]),['A quiet rainy street','Footsteps and rain','N/A']);
  await page.evaluate(()=>{subject.soundscapeBox.value='';subject.soundscapeBox.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>subject.soundscapeSection.root.querySelector('.mmc-tl-section-hint').textContent),'');
  assert.equal(await page.evaluate(()=>subject.soundscapeBox.value),'');
 });
 await check('Typing and programmatic/refiner/revert updates keep actual plain-text fields current without reintroducing previews',async()=>{
  assert.equal(await page.evaluate(()=>{
   subject.setGlobalPrompt('<img src=x onerror=alert(1)>\n  A scene');
   const safe=subject.promptBox.root.textContent==='<img src=x onerror=alert(1)>\n  A scene'&&!subject.promptSection.root.querySelector('img');
   subject.promptBox.config.onInput('New typed scene');
   const typed=subject.timeline.prompt==='New typed scene';
   subject.takePiece({soundscape:'Distant rain',music:'Soft score'});
   const refined=subject.soundscapeBox.value==='Distant rain';
   subject.dropTimelineRewrite();
   return safe&&typed&&refined&&subject.musicBox.value==='N/A'&&[subject.promptSection,subject.soundscapeSection,subject.musicSection].every(section=>section.head.querySelector('.mmc-tl-section-hint').hidden&&section.head.querySelector('.mmc-tl-section-hint').textContent==='');
  }),true);
 });
 await check('Long input text remains intact and never leaks into the header or claims audio silence',async()=>{
  assert.equal(await page.evaluate(()=>{
   subject.setGlobalPrompt('🌧'.repeat(200));
   const value=subject.promptSection.root.querySelector('.mmc-tl-section-hint').textContent;
   subject.musicSection.setOpen(true);
   return value===''&&Array.from(subject.promptBox.root.textContent).length===200&&getComputedStyle(subject.musicSection.root.querySelector('.mmc-tl-section-hint')).display==='none';
  }),true);
 });
 await check('N/A has one field-specific Undo; actions never toggle the disclosure',async()=>{
  assert.equal(await page.evaluate(()=>{
   subject.soundscapeBox.value='Original room tone';subject.soundscapeBox.dispatchEvent(new Event('input',{bubbles:true}));
   const before=subject.commits,other=subject.timeline.music;
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   const set=subject.timeline.soundscape==='N/A'&&subject.commits===before+1&&!subject.soundscapeSection.isOpen()&&!subject.audioUndoHost.hidden;
   const undone=subject.undoAudioField();
   return set&&undone&&subject.timeline.soundscape==='Original room tone'&&subject.timeline.music===other&&subject.commits===before+2&&subject.audioUndoHost.hidden;
  }),true);
 });
 await check('Repeated confirmed N/A retains the first recoverable value',async()=>{
  assert.equal(await page.evaluate(()=>{
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   const value=subject.audioUndo.value;confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   const same=subject.audioUndo.value===value;subject.undoAudioField();return same&&subject.timeline.soundscape==='Original room tone';
  }),true);
 });
 await check('Undo cannot overwrite subsequent editing or refining, even another N/A',async()=>{
  assert.equal(await page.evaluate(()=>{
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   subject.soundscapeBox.value='New text';subject.soundscapeBox.dispatchEvent(new Event('input',{bubbles:true}));
   const edit=!subject.undoAudioField()&&subject.timeline.soundscape==='New text';
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));subject.takePiece({soundscape:'N/A'});
   const refine=!subject.undoAudioField()&&subject.timeline.soundscape==='N/A';
   return edit&&refine;
  }),true);
 });
 await check('Undo rejects out-of-band changes and restores absent-key semantics',async()=>{
  assert.equal(await page.evaluate(()=>{
   subject.timeline.soundscape='Original';subject.soundscapeBox.value='Original';
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   subject.timeline.soundscape='External edit';
   const rejected=!subject.undoAudioField()&&subject.timeline.soundscape==='External edit';
   delete subject.timeline.soundscape;subject.soundscapeBox.value='';
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
   const undone=subject.undoAudioField();return rejected&&undone&&!Object.hasOwn(subject.timeline,'soundscape')&&subject.soundscapeBox.value==='';
  }),true);
 });
 await check('No Undo data, selection or display preferences enter creator_data',async()=>{
  assert.equal(await page.evaluate(()=>{
   const keys=Object.keys(subject.timeline).join('|');subject.timeline.music='Score';subject.musicBox.value='Score';
   confirmNA(subject.musicSection.head.querySelector('.mmc-tl-na'));subject.undoAudioField();
   return Object.keys(subject.timeline).join('|')===keys&&!Object.keys(subject.timeline).some(k=>/undo|jump|preview|summary|Versions/.test(k));
  }),true);
 });
 await check('Segment shortcut finds #13 without edit/render/lock/prompt mutation',async()=>{
  const before=await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits}));
  await page.locator('.mmc-tl-jump-select').click();
  await page.locator('.mmc-tl-jump-option').nth(12).click();
  // Smooth scroll can start late when several isolated browsers run together.
  // Wait for the observable result rather than a fixed animation duration.
  await page.waitForFunction(() => subject.stripHost.scrollLeft > 0, null, { timeout: 5000 });
  assert.equal(await page.evaluate(()=>subject.stripHost.scrollLeft>0),true);
  assert.equal(await page.evaluate(()=>subject.stripHost.querySelector('[data-mmc-segment-index="12"]').classList.contains('mmc-tl-jump-target')),true);
  assert.deepEqual(await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits})),before);
  assert.equal(await page.locator('.mmc-tl-jump-select').getAttribute('aria-expanded'),'false');
 });
 await check('Rounded navigation list is viewport bounded and scrolls long pieces',async()=>{
  await page.locator('.mmc-tl-jump-select').click();
  assert.equal(await page.locator('.mmc-tl-jump-option').count(),14);
  assert.equal(await page.evaluate(()=>{
   const menu=subject.jumpMenu.menu,box=menu.getBoundingClientRect(),style=getComputedStyle(menu);
   return style.borderTopLeftRadius==='20px'&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight
    &&menu.scrollHeight>menu.clientHeight&&style.overflowY==='auto'
    &&style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent';
  }),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mmc-tl-jump-menu').count(),0);
  assert.equal(await page.locator('.mmc-tl-jump-select').evaluate(node=>node===document.activeElement),true);
 });
 await check('Menu keyboard arrows/Home/End choose cards without a generation edit',async()=>{
  const before=await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits}));
  await page.locator('.mmc-tl-jump-select').press('ArrowUp');
  assert.equal(await page.locator('.mmc-tl-jump-option').nth(13).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Home');
  assert.equal(await page.locator('.mmc-tl-jump-option').nth(0).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('End');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  assert.equal(await page.locator('.mmc-tl-jump-menu').count(),0);
  assert.equal(await page.evaluate(()=>subject.jumpTarget?.dataset.mmcSegmentIndex),'12');
  assert.deepEqual(await page.evaluate(()=>({data:JSON.stringify(subject.timeline),commits:subject.commits})),before);
 });
 await check('Outside/rerender dismissal resets menu and expansion, without listeners or state leaks',async()=>{
  await page.locator('.mmc-tl-jump-select').click();await page.waitForTimeout(20);
  await page.locator('.mmc-tab').click();
  assert.equal(await page.locator('.mmc-tl-jump-menu').count(),0);
  assert.equal(await page.locator('.mmc-tl-jump-select').getAttribute('aria-expanded'),'false');
  await page.locator('.mmc-tl-jump-select').click();await page.evaluate(()=>subject.renderNavigation());
  assert.equal(await page.locator('.mmc-tl-jump-menu').count(),0);
  assert.equal(await page.locator('.mmc-tl-jump-select').getAttribute('aria-expanded'),'false');
 });
 await check('Stale menu rows cannot jump to a replaced segment',async()=>{
  await page.locator('.mmc-tl-jump-select').click();
  const before=await page.evaluate(()=>{
   const target=subject.jumpTarget;subject.savedSegment=subject.timeline.segments[1];subject.timeline.segments[1]={prompt:'replacement'};
   return target?.dataset.mmcSegmentIndex;
  });
  await page.locator('.mmc-tl-jump-option').nth(1).click();
  assert.equal(await page.evaluate(()=>subject.jumpTarget?.dataset.mmcSegmentIndex),before);
  await page.evaluate(()=>subject.timeline.segments[1]=subject.savedSegment);
 });
 await check('Repeat jumps, invalid indices, clip cards and reduced motion are safe',async()=>{
  assert.equal(await page.evaluate(()=>{
   const old=subject.jumpTarget;subject.jumpToSegment(0);
   return !old.classList.contains('mmc-tl-jump-target')&&subject.jumpToSegment(-1)===false&&subject.jumpToSegment(14)===false&&subject.jumpToSegment(1.5)===false;
  }),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>subject.jumpToSegment(12)),true);
  await page.waitForTimeout(1900);
  assert.equal(await page.evaluate(()=>subject.stripHost.querySelectorAll('.mmc-tl-jump-target').length),0);
 });
 await check('A single/empty timeline offers no meaningless jump control',async()=>{
  assert.equal(await page.evaluate(()=>{const prev=subject.timeline.segments;subject.timeline.segments=[];const empty=subject.segmentNavigator()===null;
   subject.timeline.segments=[{}];const single=subject.segmentNavigator()===null;subject.timeline.segments=prev;return empty&&single;}),true);
 });
 const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR || path.resolve(__dirname,'../../../artifacts');
 fs.mkdirSync(artifacts,{recursive:true});
 await page.evaluate(()=>{subject.setGlobalPrompt('Replace only the visible performer with @subject.');subject.timeline.soundscape='Keep the recorded dialogue and original ambience';subject.soundscapeBox.value=subject.timeline.soundscape;subject.updateSectionSummaries();subject.musicSection.setOpen(false);});
 await page.screenshot({path:path.join(artifacts,'timeline-usability-normal.png'),fullPage:true});
 await page.locator('.mmc-tl-jump-select').click();
 await page.screenshot({path:path.join(artifacts,'timeline-navigation-rounded-menu.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await check('Korean narrow/large-text grouping has no page/header/notice overflow',async()=>{
  await page.setViewportSize({width:390,height:850});
  await page.evaluate(()=>{
   subject.close();setLocale('ko');document.body.style.setProperty('--mmc-type','1.6');window.subject=make();
   subject.promptSection.setOpen(false);subject.soundscapeSection.setOpen(false);subject.musicSection.setOpen(false);
   confirmNA(subject.soundscapeSection.head.querySelector('.mmc-tl-na'));
  });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(()=>[...subject.modal.querySelectorAll('.mmc-tl-section-head,.mmc-tl-audio-undo')].every(n=>n.scrollWidth<=n.clientWidth+1)),true);
  await page.screenshot({path:path.join(artifacts,'timeline-usability-ko-narrow.png'),fullPage:true});
  await page.locator('.mmc-tl-jump-select').click();
  await page.screenshot({path:path.join(artifacts,'timeline-navigation-rounded-menu-ko-narrow.png'),fullPage:true});
  await page.keyboard.press('Escape');
 });
 await check('Closing clears transient Undo and navigation timers without generation edits',async()=>{
  assert.equal(await page.evaluate(()=>{
   subject.jumpToSegment(12);const data=JSON.stringify(subject.timeline);subject.close();
   return !subject.audioUndo&&!subject.jumpTarget?.classList.contains('mmc-tl-jump-target')&&!subject.overlay.isConnected&&data===JSON.stringify(subject.timeline);
  }),true);
 });
 assert.equal(requests,0);
 console.log(JSON.stringify({checks:results.length,requests,results},null,2));
 await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
