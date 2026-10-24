// Actual Timeline mount/pool/cast, CastShelf header/add callbacks, disclosure,
// audio input/N/A/undo, DOM helpers and ordered CSS. Catalog/execution/card body
// adapters stay local: no ComfyUI request, queue, media write or GPU work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const baseline = process.env.CONTINUITY_BASELINE_DIR ? path.resolve(process.env.CONTINUITY_BASELINE_DIR, 'web/creator') : path.resolve(__dirname, '../../../baseline/web/creator');
const hasBaseline = fs.existsSync(path.join(baseline, 'timeline.js')) && fs.existsSync(path.join(baseline, 'cast.js')) && fs.existsSync(path.join(baseline, 'disclosure.js'));
if (process.env.CONTINUITY_BASELINE_DIR) assert.ok(hasBaseline, 'The explicitly requested baseline must exist');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const before = name => fs.readFileSync(path.join(baseline, name), 'utf8');
const normalize = text => text.replace(/\r\n/g, '\n');
const timeline = read('timeline.js'), cast = read('cast.js'), dom = read('dom.js');
const method = (name, source) => {
  const one = source.match(new RegExp(`^  (?:async )?${name}\\([^\\n]*?\\) \\{[^\\n]*\\}`, 'm'));
  const found = one || source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Current production method ${name}`); return found[0];
};
const fn = name => {
  const found = dom.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Current DOM helper ${name}`); return found[0].replace(/^export /, '');
};
const stripModule = text => text.replace(/^import\b[^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const countStateHelpers=['motionOf','subjectFiles','replacesOf'].map(name=>read('state.js').match(new RegExp(`^export function ${name}\\([^]*?^\\}`,'m'))[0].replace(/^export /,'')).join('\n');
// Only the requested count presentation replaces these formerly textual hints.
// Actions, fold/input callbacks and capability gates remain in the comparison.
const countPresentation = text => normalize(text)
  .replace(/^    const hint = t\("Who is in it\. Name them once here, write @anna in the prompt, "\n                 \+ "and whatever is behind them rides in with them\."\);/m,'    COUNT_HINT;')
  .replace(/^    const hint = "";\n    const files = resolvedReferenceFiles\(cast\.flatMap\(\(subject\) =>\n      \[\.\.\.S\.subjectFiles\(subject\), \.\.\.S\.replacesOf\(subject\)\]\), this\.getAssets\(\)\);\n    const counts = mediaCountPills\(files, \{ supportingImages: true \}\);/m,'    COUNT_HINT;')
  .replace(/^      this\.section\.setHintNodes\(counts\);\n/m,'')
  .replace('el("span", { class: "mmc-cast-hint" }, [counts])','el("span", { class: "mmc-cast-hint", text: hint })')
  .replace(/^    this\.poolSection\.setText\(t\("Piece references"\), takesRefs\n      \? t\("Attached once\. Cite the @handle in the global prompt to use it in every "\n        \+ "segment, or in a segment's own prompt to use it just there\."\)\n      : t\("\{family\} reads no attached references — detach these, or put the piece "\n        \+ "back on a model that reads them\.", \{ family: S\.familyOf\(this\.timeline\)\.label \}\)\);/m,'    POOL_COUNTS;')
  .replace(/^    this\.poolSection\.setText\(t\("Piece references"\)\);\n    this\.poolSection\.setHintNodes\(mediaCountPills\(assets\)\);/m,'    POOL_COUNTS;')
  .replace(/^    this\.poolWarning\.textContent = this\.poolError \|\| "";\n    this\.poolWarning\.hidden = !this\.poolError;/m,'    POOL_WARNINGS;')
  .replace(/^    const warnings = \[\n      !takesRefs \? t\("\{family\} reads no attached references — detach these, or put the piece "\n        \+ "back on a model that reads them\.", \{ family: S\.familyOf\(this\.timeline\)\.label \}\) : "",\n      this\.poolError \|\| "",\n    \]\.filter\(Boolean\);\n    this\.poolWarning\.textContent = warnings\.join\("\\n"\);\n    this\.poolWarning\.hidden = !warnings\.length;/m,'    POOL_WARNINGS;');
// Compare the original header/input callbacks across both historical and newer
// baselines. Unrelated card/cast body presentation can evolve independently;
// the full product source freeze belongs to the separate integration audit.
if (hasBaseline) {
  const fieldPresentation = text => {
    let value=normalize(text).replace('      summary: true, inlineActions: true, actionsBeforeHint: true,\n      actions: [this.fieldRefineButton("prompt", this.promptBox.root)],','      hint: this.sectionPreview("prompt"), summary: true,');
    for(const [key,label]of [['soundscape','overall_soundscape'],['music','non_diegetic_music']])value=value.replace(`      summary: true,\n      actions: [this.noAudioButton("${key}", this.${key}Box, t("${label}")),\n        this.fieldRefineButton("${key}", this.${key}Box)] });`,`      hint: this.sectionPreview("${key}"), summary: true,\n      actions: [this.noAudioButton("${key}", this.${key}Box, t("${label}"))] });`);
    return value.replace(/^    this\.fieldRefineStatus = \{\};\n    for \(const \[key, section\] of \[\["prompt", this\.promptSection\],\n      \["soundscape", this\.soundscapeSection\], \["music", this\.musicSection\]\]\) \{\n      const status = el\("div", \{ class: "mmc-tl-field-refine-status", role: "status",\n        "aria-live": "polite", hidden: true \}\);\n      this\.fieldRefineStatus\[key\] = status;\n      section\.root\.append\(status\);\n    \}\n/m,'').replace(/^        this\.promptVersion = \(this\.promptVersion \?\? 0\) \+ 1;\n/m,'');
  };
  const headerPlumbing = text => countPresentation(fieldPresentation(text))
    .replace(/, actionsBeforeHint: true/g, '').replace(/^      actionsBeforeHint: true,\n/gm, '')
    .replace(', actionsBeforeHint = false', '').replace(/^    this\.actionsBeforeHint = actionsBeforeHint;\n/m, '')
    .replace(/^          actionsBeforeHint: this\.actionsBeforeHint,\n/m, '');
  for (const name of ['mount', 'renderCast', 'textBox', 'renderPool', 'undoAudioField', 'showAudioUndo', 'clearAudioUndo', 'audioEdited']) {
    assert.equal(headerPlumbing(method(name, timeline)), headerPlumbing(method(name, before('timeline.js'))), `${name} original header callbacks/gates`);
  }
  for (const name of ['constructor', 'render']) {
    const stripActions = text => text.replace(/^    this\.headerActions \?\?= \[[^]*?^    \];\r?\n/m, '');
    assert.equal(headerPlumbing(stripActions(method(name, cast))), headerPlumbing(stripActions(method(name, before('cast.js')))), `CastShelf ${name} original header callbacks/gates outside approved action ordering/label`);
  }
  const actionBody = text => text.match(/^    this\.headerActions \?\?= \[[^]*?^    \];/m)[0];
  const libraryCallback = text => normalize(actionBody(text).match(/        onclick: async \(\) => \{[^]*?^        \},/m)[0]);
  assert.equal(libraryCallback(method('render', cast)), libraryCallback(method('render', before('cast.js'))), 'Cast library callback body remains exact');
  assert.match(actionBody(method('render', cast)), /onclick: \(\) => this\.addSubject\(\)/);
}
const cssNames = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)].map(match => match[1]);
const css = cssNames.map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko = vm.runInNewContext(read('locales/ko.js').replace(/^export const /m, 'const ') + ';ko;', {});
const code = `
${['el', 'svg', 'floatAbove', 'dismissable', 'placeNear', 'closeOwnedPopovers', 'mountOverlay'].map(fn).join('\n')}
const popoverOwners = new WeakMap(), popoverClosers = new Map();
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /, '')}
const icon = (name, size=13) => svg(ICONS[name] || ICONS.effect, size);
let armedRefine=null;
const chosenModel=()=>null,queueBusy=()=>false,spinner=()=>el('span',{class:'mmc-spin'}),DEFAULT_VIDEO_FAMILY='h3',openSettings=()=>{};
const refineField=()=>{throw new Error('No refiner execution in the leading-actions fixture');};
${read('refine.js').match(/^export function refineButton\([^]*?^\}/m)[0].replace(/^export /,'')}
${stripModule(read('disclosure.js'))}
${hasBaseline ? stripModule(before('disclosure.js')).replace(/\bnextSection\b/g, 'baselineNextSection').replace(/\bcreateDisclosure\b/g, 'createBaselineDisclosure') : 'const createBaselineDisclosure=options=>createDisclosure({...options,actionsBeforeHint:false});'}
let locale='en', fixtureOptions={};
const ko=${JSON.stringify(ko)};
const t=(text,values={})=>(locale==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??'{'+key+'}');
${stripModule(read('media-counts.js'))}
${countStateHelpers}
const S={subjectFiles,replacesOf,DEFAULT_VIDEO_FAMILY:'h3',seedFeatures:()=>[{attr:'hair',is:''}],syncTimeline:()=>{},
  isSingle:piece=>piece.render==='single',takesReferences:()=>fixtureOptions.takesRefs!==false,
  familyOf:()=>({label:'No reference family',capabilities:{audio:{supplied:false}}}),
  pieceFamily:piece=>piece.family,castAssets:piece=>piece.assets||[],
  subjectCitedGlobally:()=>false,subjectCitations:()=>[],allTexts:piece=>[piece.prompt],handleWritten:()=>true};
const WearsPanel=class{constructor(options){this.options=options;}};
const P={keepSubject:()=>{throw new Error('No cast-library write in fixture');}};
const keepAsMod=()=>{throw new Error('No RefMod execution in fixture');};
const castFamilies=()=>[],rememberedWeights=()=>({}),timelineGeometry=()=>({width:768,height:1344});
const openPresetLibrary=async()=>{subject.calls.push('library');if(fixtureOptions.libraryAdds){subject.timeline.subjects.push({handle:'library_member',from:[]});}};
class CastShelf {
  ${['constructor','render','typing','reveal','save','addSubject'].map(name=>method(name,cast)).join('\n')}
  problem(){return fixtureOptions.castProblem||'';}
  card(member){return el('div',{class:'mmc-cast-card',style:{padding:'12px'}},[el('input',{class:'mmc-cast-name',value:member.handle})]);}
}
class SoundLane{constructor(){this.host=el('div',{class:'mmc-snd',text:'Sound lane (isolated)'});}render(){}}
class Subject {
  ${['constructor','commit','mount','close','clearCardPreviews','render','sectionOptions','sectionPreview','updateSectionSummaries','fieldValue','fieldRefineButton','refineTimelineField','textBox','noAudioButton','audioEdited','clearAudioUndo','showAudioUndo','undoAudioField','renderPool','renderCast'].map(name=>method(name,timeline)).join('\n')}
  globalPromptBox(){const root=el('div',{class:'mmc-prompt',contenteditable:'true',role:'textbox'});return{root,frame:el('div',{class:'mmc-tl-prompt-frame'},[root]),setValue:value=>root.textContent=value,closeMenu(){subject.calls.push('prompt-close');},refresh(){}};}
  renderBar(){this.barHost.replaceChildren(el('span',{class:'mmc-pill mmc-pill-static',text:'MiniMax H3'}));}
  renderLoras(){this.loraHost.replaceChildren();this.loraHost.hidden=true;}
  renderStrip(){this.stripHost.replaceChildren(el('div',{class:'mmc-tl-card',style:{width:'230px',height:'110px',padding:'12px'},text:'Segment 1 (isolated)'}));}
  poolChip(asset){return el('span',{class:'mmc-asset',text:'@'+asset.handle+' · '+asset.filename});}
  addPoolAssets(){this.calls.push('add-reference');}
  pieceTarget(){return{fixture:true};}
}
window.cleanup=()=>{if(window.subject?.overlay?.isConnected)subject.close();document.querySelectorAll('.fixture-extra').forEach(node=>node.remove());};
window.setFixture=(options={})=>{
  cleanup(); fixtureOptions=options;window.fixtureOptions=fixtureOptions;locale=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
  const piece={family:'h3',render:'chained',prompt:'Keep source framing, performance and timing. Replace only @subject identity.',
    soundscape:'Keep the original dialogue, room ambience and footsteps in sync with the source.',music:'N/A',
    subjects:options.emptyCast?[]:[{handle:'subject',from:[]}],assets:options.emptyAssets?[]:[{handle:'ref-1',kind:'image',filename:'portrait.png'}],
    segments:[{duration_s:14.38}],...options.piece};
  const views={};window.viewWrites=[];
  window.subject=new Subject({timeline:piece,sections:{read:key=>views[key]??options.open??false,write:(key,value)=>{views[key]=value;viewWrites.push([key,value]);}}},()=>{});
  subject.calls=[];subject.commits=0;subject.onCommit=()=>subject.commits++;subject.mount();
  window.sections=()=>({prompt:subject.promptSection,soundscape:subject.soundscapeSection,music:subject.musicSection,pool:subject.poolSection,cast:subject.castShelf.section});
  return JSON.stringify(piece);
};
window.snapshot=()=>({data:JSON.stringify(subject.timeline),calls:structuredClone(subject.calls),commits:subject.commits,views:structuredClone(viewWrites)});
window.extraShelf=(options={})=>{
  const castList=options.empty?[]:[{handle:'other',from:[]}];let writes=0,libraryCalls=0;
  const shelf=new CastShelf({getCast:()=>castList,setCast:list=>{castList.splice(0,castList.length,...list);},getAssets:()=>[],commit:()=>writes++,
    library:options.library?async()=>{libraryCalls++;}:null,disclosure:options.disclosure||false,actionsBeforeHint:options.leading||false});
  const host=el('div',{class:'fixture-extra mmc-root',style:{width:'800px',maxWidth:'100%',margin:'10px'}},[shelf.root]);document.body.append(host);shelf.render();
  return{shelf,host,snapshot:()=>({writes,libraryCalls,data:JSON.stringify(castList)})};
};
window.leadingLayout=()=>{
  const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  return{viewport:innerWidth,page:document.documentElement.scrollWidth,sections:Object.entries(sections()).map(([key,section])=>({key,open:section.isOpen(),root:rect(section.root),head:rect(section.head),
    title:rect(section.head.querySelector('.mmc-tl-section-title')),toggle:rect(section.toggle),
    hint:{hidden:getComputedStyle(section.head.querySelector('.mmc-tl-section-hint')).display==='none',box:rect(section.head.querySelector('.mmc-tl-section-hint'))},
    children:[...section.head.children].map(node=>node.className),
    actions:[...section.head.querySelectorAll('.mmc-tl-section-actions > button')].map(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node),walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),textBoxes=[];let text;
      while(text=walker.nextNode()){if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);for(const box of range.getClientRects())textBoxes.push({left:box.left,right:box.right,top:box.top,bottom:box.bottom});}
      return{box:rect(node),textBoxes,radius:style.borderRadius,height:style.height,text:node.textContent,hit:node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),nested:!!node.closest('.mmc-tl-section-toggle')};})}))};
};
Object.assign(window,{createDisclosure,createBaselineDisclosure,el,CastShelf,popoverOwners,popoverClosers,placeNear,dismissable});setFixture();
`;
new vm.Script(code, {filename:'timeline-leading-actions-current-production-fixture.js'});
const results=[],errors=[];let requests=0,browser;
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}button#outside{position:fixed;bottom:0;right:0}</style></head><body><button id="outside">Outside</button></body></html>');
  await page.evaluate('(()=>{'+code+'})()');
  const reset=options=>page.evaluate(options=>setFixture(options),options);
  const section=key=>page.locator(key==='cast'?'.mmc-tl-cast .mmc-tl-section':key==='pool'?'.mmc-tl-pool .mmc-tl-section':key==='prompt'?'.mmc-tl-body > .mmc-tl-section':'.mmc-tl-audio .mmc-tl-section').nth(key==='music'?1:0);
  const action=(key,index=0)=>{const buttons=section(key).locator('.mmc-tl-section-actions > button');return key==='cast'?(index===0?buttons.filter({has:page.locator('svg')}):buttons.filter({hasText:/^\+/})):buttons.nth(index);};
  const confirmNA=async key=>{const before=await page.evaluate(()=>snapshot());await action(key).click();assert.deepEqual(await page.evaluate(()=>snapshot()),before);await action(key).click();};
  const shot=async name=>{if(!artifacts)return;fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:true});};
  await check('Default disclosure DOM, ARIA and hint placement match the original/default-false branch',async()=>{
    for(const inlineActions of [false,true])for(const hasActions of [false,true]){
      const result=await page.evaluate(({inlineActions,hasActions})=>{
        const make=fn=>fn({title:'Default title',hint:'Default hint',content:el('input'),inlineActions,actions:hasActions?[el('button',{text:'Default action'})]:[]});
        const original=make(createBaselineDisclosure),current=make(createDisclosure),clean=node=>node.outerHTML.replace(/mmc-tl-section-\d+/g,'mmc-tl-section-N');
        return{old:clean(original.root),now:clean(current.root)};
      },{inlineActions,hasActions});assert.equal(result.now,result.old);
    }
    assert.equal(await section('prompt').locator('.mmc-tl-section-head-leading').count(),1);assert.equal(await section('prompt').locator('.mmc-tl-section-toggle .mmc-tl-section-hint').count(),0);assert.equal(await section('prompt').locator('.mmc-tl-field-refine').count(),1);
  });
  await check('Timeline audio/references/cast opt in to title then independent actions then hint, without nested buttons',async()=>{
    const result=await page.evaluate(()=>leadingLayout());
    for(const info of result.sections.filter(info=>info.key!=='prompt')){assert.deepEqual(info.children,['mmc-tl-section-toggle','mmc-tl-section-actions','mmc-tl-section-hint']);assert.ok(info.actions.length);assert.ok(info.actions.every(button=>!button.nested));}
    assert.equal(await page.locator('.mmc-tl-section-toggle button').count(),0);
    for(const key of ['soundscape','music','pool','cast'])assert.equal(await section(key).locator(':scope > .mmc-tl-section-head-leading').count(),1);
  });
  await check('Desktop actions sit geometrically between title and hint with matching small pill shape and six-pixel action gaps',async()=>{
    const result=await page.evaluate(()=>leadingLayout());for(const info of result.sections.filter(info=>info.key!=='prompt')){
      for(const button of info.actions){assert.ok(button.box.left>=info.title.right-1,info.key+' action follows title');if(!info.hint.hidden)assert.ok(button.box.right<=info.hint.box.left+1,info.key+' action precedes hint');assert.equal(button.height,'26px');assert.equal(button.radius,'999px');assert.ok(button.hit);}
      if(info.actions.length>1)assert.ok(Math.abs(info.actions[1].box.left-info.actions[0].box.right-6)<1);
    }
    await shot('timeline-leading-actions-desktop-en.png');
  });
  await check('Title/chevron and new sibling hint toggle once; actions never dispatch a disclosure toggle',async()=>{
    await reset({});for(const key of ['soundscape','music','pool','cast']){
      const toggle=section(key).locator('.mmc-tl-section-toggle');await toggle.click();assert.equal(await page.evaluate(key=>sections()[key].isOpen(),key),true);
      await toggle.click();assert.equal(await page.evaluate(key=>sections()[key].isOpen(),key),false);
      if(key==='soundscape'||key==='music')await section(key).locator(':scope > .mmc-tl-section-head').evaluate(node=>node.click());else await section(key).locator(':scope > .mmc-tl-section-head > .mmc-tl-section-hint').click();assert.equal(await page.evaluate(key=>sections()[key].isOpen(),key),true);
    }
    assert.equal(await page.evaluate(()=>viewWrites.length),12);assert.equal(await page.evaluate(()=>subject.commits),0);
    const beforeViews=await page.evaluate(()=>viewWrites.length);await action('pool').click();assert.equal(await page.evaluate(()=>viewWrites.length),beforeViews);assert.deepEqual(await page.evaluate(()=>subject.calls),['add-reference']);
  });
  await check('Enter/Space activate only the focused title or action, preserving aria-expanded/body linkage',async()=>{
    await reset({});for(const key of ['soundscape','music','pool','cast']){
      const toggle=section(key).locator('.mmc-tl-section-toggle');await toggle.focus();await page.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'true');await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.equal(await toggle.evaluate(node=>node.getAttribute('aria-controls')===node.closest('section').querySelector('.mmc-tl-section-body').id),true);
      assert.equal(await toggle.evaluate(node=>document.getElementById(node.getAttribute('aria-labelledby')).className),'mmc-tl-section-title');
    }
    await action('pool').focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');assert.deepEqual(await page.evaluate(()=>subject.calls),['add-reference','add-reference']);assert.equal(await page.evaluate(()=>subject.poolSection.isOpen()),false);
  });
  await check('Small-pill styling preserves native disabled behavior and existing N/A pressed/disabled colors instead of overriding semantic states',async()=>{
    await reset({});const saved=await page.evaluate(()=>snapshot());const result=await page.evaluate(()=>{
      const na=subject.soundscapeSection.head.querySelector('.mmc-tl-na'),add=subject.poolAdd;
      const standard=el('button',{class:'mmc-pill',text:'Control'});subject.modal.append(standard);
      const style=node=>{const s=getComputedStyle(node);return{color:s.color,border:s.borderTopColor,cursor:s.cursor};};
      na.setAttribute('aria-pressed','true');standard.setAttribute('aria-pressed','true');const pressed={na:style(na),standard:style(standard)};
      na.removeAttribute('aria-pressed');standard.removeAttribute('aria-pressed');na.disabled=true;add.disabled=true;standard.disabled=true;
      const disabled={na:style(na),add:style(add),standard:style(standard)};na.click();add.click();na.disabled=false;add.disabled=false;standard.remove();return{pressed,disabled};
    });assert.equal(result.pressed.na.color,result.pressed.standard.color);assert.equal(result.pressed.na.border,result.pressed.standard.border);
    assert.equal(result.disabled.na.color,result.disabled.standard.color);assert.equal(result.disabled.add.color,result.disabled.standard.color);assert.equal(result.disabled.na.cursor,'not-allowed');assert.equal(result.disabled.add.cursor,'not-allowed');assert.deepEqual(await page.evaluate(()=>snapshot()),saved);
  });
  await check('N/A edits its original field once, preserves other data/folding and restores text through the original Undo',async()=>{
    await reset({});const saved=await page.evaluate(()=>({sound:subject.timeline.soundscape,music:subject.timeline.music,prompt:subject.timeline.prompt,rest:JSON.stringify([subject.timeline.subjects,subject.timeline.assets,subject.timeline.segments])}));
    await confirmNA('soundscape');assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'N/A');assert.equal(await page.evaluate(()=>subject.soundscapeBox.value),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.evaluate(()=>subject.soundscapeSection.isOpen()),false);assert.equal(await page.evaluate(()=>subject.audioVersions.soundscape),1);
    await confirmNA('soundscape');assert.equal(await page.evaluate(()=>subject.commits),1);
    await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(()=>subject.timeline.soundscape),saved.sound);assert.equal(await page.evaluate(()=>subject.soundscapeBox.value),saved.sound);assert.equal(await page.evaluate(()=>subject.commits),2);assert.equal(await action('soundscape').evaluate(node=>document.activeElement===node),true);
    assert.deepEqual(await page.evaluate(()=>({music:subject.timeline.music,prompt:subject.timeline.prompt,rest:JSON.stringify([subject.timeline.subjects,subject.timeline.assets,subject.timeline.segments])})),{music:saved.music,prompt:saved.prompt,rest:saved.rest});
  });
  await check('Both N/A actions work open/closed, preserve unset ownership on Undo and invalidate stale Undo after a text edit',async()=>{
    for(const open of [false,true])for(const key of ['soundscape','music']){
      await reset({open,piece:{[key]:undefined}});await confirmNA(key);assert.equal(await page.evaluate(key=>sections()[key].isOpen(),key),open);
      // undefined is an owned value here; delete exercises the original absent-key branch.
      await page.evaluate(key=>{delete subject.timeline[key];subject[key==='music'?'musicBox':'soundscapeBox'].value='';},key);await confirmNA(key);await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(key=>Object.hasOwn(subject.timeline,key),key),false);
      await confirmNA(key);await page.evaluate(key=>sections()[key].setOpen(true),key);await section(key).locator('textarea').fill('User changed this field');assert.equal(await page.locator('.mmc-tl-na-undo').count(),0);assert.equal(await page.evaluate(()=>subject.undoAudioField()),false);
    }
  });
  await check('Reference Add keeps original no-reference/asset gates and restores the exact mounted action when supported again',async()=>{
    await reset({takesRefs:false,emptyAssets:true});assert.equal(await page.locator('.mmc-tl-pool').isVisible(),false);
    await reset({takesRefs:false});assert.equal(await page.locator('.mmc-tl-pool').isVisible(),true);assert.equal(await action('pool').count(),0);assert.equal(await section('pool').locator('.mmc-tl-section-warning').count(),0);assert.equal(await section('pool').evaluate(node=>node.classList.contains('mmc-tl-section-warning')),true);
    await page.evaluate(()=>{fixtureOptions.takesRefs=true;subject.renderPool();window.savedPoolAdd=subject.poolAdd;subject.poolAdd.focus();subject.renderPool();});assert.equal(await action('pool').evaluate(node=>node===savedPoolAdd&&node===document.activeElement),true);
    await action('pool').click();assert.deepEqual(await page.evaluate(()=>subject.calls),['add-reference']);assert.equal(await page.evaluate(()=>subject.poolSection.isOpen()),false);
    await page.evaluate(()=>{fixtureOptions.takesRefs=false;subject.renderPool();fixtureOptions.takesRefs=true;subject.renderPool();});assert.equal(await action('pool').evaluate(node=>node===savedPoolAdd),true);
  });
  await check('Original cast Add opens the shelf intentionally once, adds one person, commits once and focuses the new name',async()=>{
    await reset({emptyCast:true});await action('cast',1).click();assert.equal(await page.evaluate(()=>subject.timeline.subjects.length),1);assert.equal(await page.evaluate(()=>subject.timeline.subjects[0].handle),'subject');assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.evaluate(()=>subject.castShelf.section.isOpen()),true);assert.deepEqual(await page.evaluate(()=>viewWrites),[['cast',true]]);assert.equal(await page.locator('.mmc-tl-cast .mmc-cast-name').evaluate(node=>document.activeElement===node),true);
    await action('cast',1).click();assert.equal(await page.evaluate(()=>subject.timeline.subjects[1].handle),'subject_2');assert.equal(await page.evaluate(()=>subject.commits),2);assert.deepEqual(await page.evaluate(()=>viewWrites),[['cast',true]]);
  });
  await check('Cast library stays a separate original callback: opening alone does not fold/reveal; new arrival reveals once',async()=>{
    await reset({});await action('cast',0).click();assert.deepEqual(await page.evaluate(()=>subject.calls),['library']);assert.equal(await page.evaluate(()=>subject.castShelf.section.isOpen()),false);assert.equal(await page.evaluate(()=>subject.commits),0);
    await reset({libraryAdds:true});await action('cast',0).click();assert.equal(await page.evaluate(()=>subject.timeline.subjects.length),2);assert.equal(await page.evaluate(()=>subject.castShelf.section.isOpen()),true);assert.deepEqual(await page.evaluate(()=>viewWrites),[['cast',true]]);assert.deepEqual(await page.evaluate(()=>subject.calls),['library']);
  });
  await check('Node/library defaults keep their original non-leading header/action layout, including absent library and empty-cast cases',async()=>{
    for(const library of [false,true])for(const empty of [false,true])for(const disclosure of [false,true]){
      await page.evaluate(options=>{document.querySelectorAll('.fixture-extra').forEach(node=>node.remove());window.other=extraShelf(options);}, {library,empty,disclosure});
      const other=page.locator('.fixture-extra');assert.equal(await other.locator('.mmc-tl-section-head-leading').count(),0);assert.equal(await other.locator('.mmc-cast-new').count(),library?2:1);
      if(disclosure){assert.equal(await other.locator('.mmc-tl-section-toggle .mmc-tl-section-hint').count(),1);assert.equal(await other.locator('.mmc-tl-section-head > .mmc-tl-section-hint').count(),0);}else{assert.deepEqual(await other.locator('.mmc-cast-head').evaluate(node=>[...node.children].map(child=>child.className)),['mmc-tl-field-name','mmc-cast-hint',...Array(library?2:1).fill('mmc-ghost mmc-cast-new')]);}
      assert.equal(await other.locator('.mmc-cast-new').last().evaluate(node=>getComputedStyle(node).borderRadius),'0px');
    }
    await reset({});
  });
  await check('Background rerenders preserve each action/input identity, focus and section state without duplicate callbacks',async()=>{
    await reset({});await page.evaluate(()=>{window.actionNodes=Object.values(sections()).map(s=>s.head.querySelector('.mmc-tl-section-actions')?.firstChild);window.audioNode=subject.soundscapeBox;subject.poolAdd.focus();for(let i=0;i<6;i++)subject.render();});
    assert.equal(await page.evaluate(()=>Object.values(sections()).every((s,index)=>s.head.querySelector('.mmc-tl-section-actions')?.firstChild===actionNodes[index])&&subject.soundscapeBox===audioNode&&document.activeElement===subject.poolAdd),true);assert.equal(await page.evaluate(()=>subject.commits),0);assert.equal(await page.locator('.mmc-tl-section-head-leading').count(),5);assert.equal(await page.locator('.mmc-tl-na').count(),2);
    await page.evaluate(()=>subject.soundscapeSection.setOpen(true));await section('soundscape').locator('textarea').fill('Typed original audio description');assert.equal(await page.evaluate(()=>subject.soundscapeBox===audioNode&&document.activeElement===audioNode),true);assert.equal(await page.evaluate(()=>subject.commits),1);
  });
  await check('Folding retains input values, closes owned body popovers and returns focus from hidden content to its title',async()=>{
    await reset({open:true});await section('soundscape').locator('textarea').fill('Keep this original sentence');await page.evaluate(()=>subject.soundscapeSection.setOpen(false));assert.equal(await section('soundscape').locator('textarea').inputValue(),'Keep this original sentence');assert.equal(await section('soundscape').locator('.mmc-tl-section-toggle').evaluate(node=>document.activeElement===node),true);
    await page.evaluate(()=>{window.closedOwned=0;window.popup=el('div',{class:'mmc-pop fixture-owned'});document.body.append(popup);dismissable(popup,()=>closedOwned++);placeNear(popup,subject.poolSection.body.querySelector('.mmc-asset'));subject.poolSection.setOpen(false);});assert.equal(await page.evaluate(()=>closedOwned),1);assert.equal(await page.locator('.fixture-owned').count(),0);
  });
  await check('Visible errors remain outside folded bodies, and action/hint updates preserve title ordering when actions disappear',async()=>{
    await reset({castProblem:'Missing cast image'});await page.evaluate(()=>{subject.poolError='Unavailable reference';subject.renderPool();});assert.equal(await page.locator('.mmc-tl-pool-bad').filter({hasText:'Unavailable reference'}).isVisible(),true);assert.equal(await page.locator('.mmc-cast-section-warning').isVisible(),true);
    await page.evaluate(()=>{subject.poolSection.setActions();subject.poolSection.setHint('Changed help text');subject.poolSection.setText('Changed references','Changed help again');});assert.deepEqual(await section('pool').locator('.mmc-tl-section-head').evaluate(node=>[...node.children].map(child=>child.className)),['mmc-tl-section-toggle','mmc-tl-section-actions','mmc-tl-section-hint']);assert.equal(await action('pool').count(),0);assert.equal(await section('pool').locator('.mmc-tl-section-hint').textContent(),'Changed help again');
  });
  await check('Desktop English/Korean open/closed headings keep independent aligned pills between title and hint without overflow',async()=>{
    for(const language of ['en','ko'])for(const open of [false,true]){
      await reset({language,open});const result=await page.evaluate(()=>leadingLayout());assert.ok(result.page<=result.viewport+1);
      for(const info of result.sections.filter(info=>info.key!=='prompt'))for(const button of info.actions){assert.ok(button.box.left>=info.title.right-1);assert.ok(button.box.right<=info.root.right+1);assert.ok(Math.abs((button.box.top+button.box.bottom)-(info.toggle.top+info.toggle.bottom))<4);assert.ok(button.hit);if(!info.hint.hidden)assert.ok(button.box.right<=info.hint.box.left+1);}
      if(language==='ko'&&!open)await shot('timeline-leading-actions-desktop-ko.png');
    }
  });
  await check('320/640px English/Korean large text keeps pills independently clickable, in DOM reading order and within the section',async()=>{
    for(const width of [320,640])for(const language of ['en','ko'])for(const scale of [1,1.6])for(const open of [false,true]){
      await page.setViewportSize({width,height:1600});await reset({language,scale,open});
      // Modal body is a scrollport; inspect each section after scrolling it into view.
      for(const key of ['soundscape','music','pool','cast']){
        await section(key).scrollIntoViewIfNeeded();const info=await page.evaluate(key=>leadingLayout().sections.find(info=>info.key===key),key);
        assert.deepEqual(info.children,['mmc-tl-section-toggle','mmc-tl-section-actions','mmc-tl-section-hint']);
        for(const button of info.actions){assert.ok(button.box.left>=info.root.left-1&&button.box.right<=info.root.right+1,JSON.stringify({width,language,scale,key,button,root:info.root}));assert.ok(button.box.top>=info.head.top-1&&button.box.bottom<=info.head.bottom+1);assert.ok(button.hit,JSON.stringify({width,language,scale,key,button}));assert.equal(button.radius,'999px');
          for(const text of button.textBoxes)assert.ok(text.left>=button.box.left-1&&text.right<=button.box.right+1&&text.top>=button.box.top-1&&text.bottom<=button.box.bottom+1,JSON.stringify({width,language,scale,key,button,text}));}
        for(let i=1;i<info.actions.length;i++){const a=info.actions[i-1].box,b=info.actions[i].box;assert.ok(a.right<=b.left+1||a.bottom<=b.top+1,'Action buttons must not overlap');}
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(scale===1.6&&!open){await section('soundscape').scrollIntoViewIfNeeded();await shot('timeline-leading-actions-'+width+'-'+language+'-large.png');}
    }
  });
  await check('Reopening remembers only supplied view state and does not append buttons, reset text or perform writes',async()=>{
    await page.setViewportSize({width:1600,height:1100});await reset({language:'ko'});const saved=await page.evaluate(()=>snapshot());await reset({language:'ko'});assert.deepEqual(await page.evaluate(()=>snapshot()),saved);assert.equal(await page.locator('.mmc-tl-modal').count(),1);assert.equal(await page.locator('.mmc-tl-section-head-leading').count(),5);assert.equal(await page.locator('.mmc-cast-new').count(),2);
  });
  assert.deepEqual(errors,[],'No browser errors');assert.equal(requests,0,'No external requests');
  console.log(JSON.stringify({suite:'timeline-leading-actions',passed:results.length,baselineGuard:hasBaseline,networkRequests:requests,browserErrors:errors,results,
    scope:'actual frontend callbacks/DOM/CSS with safe catalog/execution/card-body adapters; no live ComfyUI/GPU proof'},null,2));
  await page.evaluate(()=>cleanup());await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
