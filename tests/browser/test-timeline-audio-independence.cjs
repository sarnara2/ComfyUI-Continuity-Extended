// Reuse the existing real-source Timeline header harness (not its test runner):
// current mount/render/audio callbacks, disclosure/DOM helpers, summary logic
// and production CSS. Media/catalog/model execution remains isolated locally.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const baselineRoot = process.env.CONTINUITY_BASELINE_DIR ? path.resolve(process.env.CONTINUITY_BASELINE_DIR) : path.resolve(__dirname, '../../../baseline');
const baselineAvailable = fs.existsSync(path.join(baselineRoot, 'web/creator/timeline.js'));
if (process.env.CONTINUITY_BASELINE_DIR) assert.ok(baselineAvailable, 'The explicitly requested baseline must exist');
const read = (name, base=sourceRoot) => fs.readFileSync(path.join(base, name), 'utf8');
const method = (name, source) => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Current production method ${name}`); return found[0].replace(/\r\n/g, '\n');
};
if (baselineAvailable) {
  const now=read('web/creator/timeline.js'), old=read('web/creator/timeline.js', baselineRoot);
  // EXT50 adds only field actions/status containers and removes prose hints in
  // mount. Normalize those exact presentation insertions, not audio callbacks.
  const withoutFieldPresentation = text => {
    let value=text.replace('      summary: true, inlineActions: true, actionsBeforeHint: true,\n      actions: [this.fieldRefineButton("prompt", this.promptBox.root)],','      hint: this.sectionPreview("prompt"), summary: true,');
    for(const [key,label]of [['soundscape','overall_soundscape'],['music','non_diegetic_music']])value=value.replace(`      summary: true,\n      actions: [this.noAudioButton("${key}", this.${key}Box, t("${label}")),\n        this.fieldRefineButton("${key}", this.${key}Box)] });`,`      hint: this.sectionPreview("${key}"), summary: true,\n      actions: [this.noAudioButton("${key}", this.${key}Box, t("${label}"))] });`);
    return value.replace(/^    this\.fieldRefineStatus = \{\};\n    for \(const \[key, section\] of \[\["prompt", this\.promptSection\],\n      \["soundscape", this\.soundscapeSection\], \["music", this\.musicSection\]\]\) \{\n      const status = el\("div", \{ class: "mmc-tl-field-refine-status", role: "status",\n        "aria-live": "polite", hidden: true \}\);\n      this\.fieldRefineStatus\[key\] = status;\n      section\.root\.append\(status\);\n    \}\n/m,'')
      .replace(/^        run: async \(options\) => \{\n          try \{\n            await withRefineOwner\(this\.timeline, \(\) => this\.refineAll\(options\)\);\n          \} catch \(error\) \{\n            this\.refineError = String\(error\.message \|\| error\);\n            this\.renderBar\(\);\n          \}\n        \},/m,'        run: (options) => this.refineAll(options),')
      .replace(/^        \/\/ Keep the broad operation explicit even after an individual rewrite\.\n/m,'')
      .replace('label: t("Refine all"),','label: refined ? t("Refine again") : t("Refine all"),');
  };
  assert.equal(withoutFieldPresentation(method('mount',now)),withoutFieldPresentation(method('mount',old)),'Mount preserves original audio/input callbacks outside the exact field-action presentation');
  assert.equal(withoutFieldPresentation(method('renderBar',now)),withoutFieldPresentation(method('renderBar',old)),'Refine all keeps the broad callback with its explicit new stable label');
  assert.match(method('updateSectionSummaries',now),/this\.soundscapeSection\?\.setHint\(""\)/,'Sound preview is intentionally removed, not rewritten');
  assert.match(method('updateSectionSummaries',now),/this\.musicSection\?\.setHint\(""\)/,'Music preview is intentionally removed, not rewritten');
  for (const name of ['textBox','undoAudioField','showAudioUndo','clearAudioUndo','audioEdited','sectionOptions','sectionPreview']) {
    assert.equal(method(name, now), method(name, old), `${name} is unchanged; this fix is presentation only`);
  }
  const withoutCountNodes=text=>text.replace(/^    setHintNodes\(\.\.\.nodes\) \{\r?\n      const visible = nodes\.filter\(Boolean\);\r?\n      detail\.replaceChildren\(\.\.\.visible\);\r?\n      detail\.hidden = !visible\.length;\r?\n    \},\r?\n/m,'');
  assert.equal(withoutCountNodes(read('web/creator/disclosure.js')), withoutCountNodes(read('web/creator/disclosure.js', baselineRoot)), 'Each disclosure keeps its exact original independent state and callbacks outside the optional count-node setter');
}
function harness(base) {
  const filename = path.join(base, 'tests/browser/test-timeline-header-layout.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const end = source.indexOf('let browser, requests = 0;');
  assert.ok(end > 0, 'The shared fixture exposes its setup before launching a test runner');
  const setup = source.slice(0, end) + ';({code,css});';
  return vm.runInNewContext(setup, {
    require, console, __dirname:path.dirname(filename),
    process:{env:{...process.env,CONTINUITY_SOURCE_ROOT:base,CONTINUITY_BASELINE_DIR:baselineAvailable?baselineRoot:undefined}},
  }, {filename:'timeline-audio-source-harness-loader.cjs'});
}
const current=harness(sourceRoot), original=baselineAvailable?harness(baselineRoot):null;
const extension=`
window.setAudioFixture=(options={})=>{
  setFixture(options);window.viewWrites=[];window.viewState={...(options.viewState||{})};
  subject.sections={read:key=>viewState[key]??false,write:(key,value)=>{viewState[key]=value;viewWrites.push([key,value]);}};
  subject.timeline.soundscape=options.soundText??'Keep the original dialogue, room ambience and footsteps exactly in sync.';
  subject.timeline.music=options.musicText??'Quiet piano is heard only by the audience, not in the scene.';
  subject.soundscapeBox.value=subject.timeline.soundscape;subject.musicBox.value=subject.timeline.music;
  subject.updateSectionSummaries();
  subject.soundscapeSection.setOpen(options.soundOpen??viewState.overall_soundscape??false);
  subject.musicSection.setOpen(options.musicOpen??viewState.non_diegetic_music??false);
  viewWrites.length=0;subject.commits=0;return JSON.stringify(subject.timeline);
};
window.audioSections=()=>({sound:subject.soundscapeSection,music:subject.musicSection});
window.audioGeometry=()=>{
  const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const fields=Object.entries(audioSections()).map(([key,section])=>{
    const style=getComputedStyle(section.root),input=key==='sound'?subject.soundscapeBox:subject.musicBox;
    return{key,open:section.isOpen(),root:rect(section.root),head:rect(section.head),body:rect(section.body),input:rect(input),
      border:parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),bodyHidden:section.body.hidden,bodyDisplay:getComputedStyle(section.body).display,
      expanded:section.toggle.getAttribute('aria-expanded'),idMatches:section.toggle.getAttribute('aria-controls')===section.body.id,
      labelMatches:input.getAttribute('aria-labelledby')===section.titleId,value:input.value};
  });
  const row=subject.summaryHost,total=row.querySelector('.mmc-tl-total'),note=row.querySelector('.mmc-note');
  return{viewport:innerWidth,page:document.documentElement.scrollWidth,audio:rect(subject.audioHost),fields,
    columns:getComputedStyle(subject.audioHost).gridTemplateColumns,align:getComputedStyle(subject.audioHost).alignItems,
    summary:{host:rect(row),total:rect(total),note:rect(note),margin:getComputedStyle(total).marginLeft,
      classes:[...row.children].map(node=>node.className),text:[...row.children].map(node=>node.textContent),
      parent:row.parentElement.className,previous:row.previousElementSibling.className,next:row.nextElementSibling.className}};
};
window.audioState=()=>({data:JSON.stringify(subject.timeline),commits:subject.commits,writes:structuredClone(viewWrites),views:structuredClone(viewState),
  soundOpen:subject.soundscapeSection.isOpen(),musicOpen:subject.musicSection.isOpen()});
setAudioFixture();
`;
new vm.Script(current.code+'\n'+extension,{filename:'timeline-audio-current-production-fixture.js'});
const results=[],errors=[],baselineEvidence=[];let requests=0,browser;
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
const inside=(box,outer)=>box.left>=outer.left-1&&box.right<=outer.right+1;
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const build=async fixture=>{
    const page=await browser.newPage({viewport:{width:1600,height:1400}});page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{requests++;return route.abort();});
    await page.setContent('<html class="dark-theme"><head><style>'+fixture.css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style></head><body></body></html>');
    await page.evaluate('(()=>{'+fixture.code+'\n'+extension+'})()');return page;
  };
  const page=await build(current), previous=original?await build(original):null;
  const reset=options=>page.evaluate(options=>setAudioFixture(options),options);
  const geometry=()=>page.evaluate(()=>audioGeometry());
  const section=key=>page.locator('.mmc-tl-audio > .mmc-tl-section').nth(key==='music'?1:0);
  const confirmNA=async key=>{const before=await page.evaluate(()=>audioState());await section(key).locator('.mmc-tl-na').click();assert.deepEqual(await page.evaluate(()=>audioState()),before);await section(key).locator('.mmc-tl-na').click();};
  const shot=async name=>{if(!artifacts)return;fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:true});};
  if(previous){
    await previous.evaluate(()=>setAudioFixture({soundOpen:false,musicOpen:false}));const closed=await previous.evaluate(()=>audioGeometry());
    await previous.evaluate(()=>subject.soundscapeSection.setOpen(true));const expanded=await previous.evaluate(()=>audioGeometry());
    assert.ok(expanded.fields[1].root.height>closed.fields[1].root.height+20, 'Baseline reproduces closed sibling outline stretching');
    assert.equal(expanded.fields[1].expanded,'false');assert.equal(expanded.fields[1].bodyHidden,true);
    assert.ok(expanded.summary.total.left>expanded.summary.host.left+100, 'Baseline reproduces right-pushed time summary');
    baselineEvidence.push({expectedDefect:'closed-music-outline-stretches-when-sound-opens',closedHeight:closed.fields[1].root.height,stretchedHeight:expanded.fields[1].root.height,bodyStillHidden:true});
    baselineEvidence.push({expectedDefect:'time-summary-auto-margin-pushes-group-right',hostLeft:expanded.summary.host.left,totalLeft:expanded.summary.total.left});
    console.log('BASELINE EXPECTED DEFECTS '+JSON.stringify(baselineEvidence));
  }
  await check('All four desktop open/closed combinations give each audio section its own natural outline height',async()=>{
    for(const soundOpen of [false,true])for(const musicOpen of [false,true]){
      await reset({soundOpen,musicOpen});const result=await geometry();assert.equal(result.align,'start');assert.equal(result.fields[0].open,soundOpen);assert.equal(result.fields[1].open,musicOpen);
      assert.ok(Math.abs(result.fields[0].root.top-result.fields[1].root.top)<1);assert.ok(result.fields[0].root.right<result.fields[1].root.left);
      for(const field of result.fields){assert.equal(field.bodyHidden,!field.open);assert.equal(field.expanded,String(field.open));assert.ok(field.idMatches&&field.labelMatches);if(!field.open)assert.ok(Math.abs(field.root.height-field.head.height-field.border)<1,JSON.stringify(field));else assert.ok(field.root.height>field.head.height+field.border+30);}
    }
  });
  await check('Opening or closing either field never changes its unchanged sibling outline height or body/ARIA state',async()=>{
    for(const otherOpen of [false,true])for(const key of ['sound','music']){
      await reset({soundOpen:key==='music'?otherOpen:false,musicOpen:key==='sound'?otherOpen:false});const sibling=key==='sound'?1:0;
      const before=(await geometry()).fields[sibling];await section(key).locator('.mmc-tl-section-toggle').click();const open=(await geometry()).fields[sibling];await section(key).locator('.mmc-tl-section-toggle').click();const shut=(await geometry()).fields[sibling];
      for(const now of [open,shut]){assert.equal(now.open,before.open);assert.equal(now.bodyHidden,before.bodyHidden);assert.equal(now.expanded,before.expanded);assert.ok(Math.abs(now.root.height-before.root.height)<1);assert.ok(Math.abs(now.root.top-before.root.top)<1);}
      assert.deepEqual(await page.evaluate(()=>viewWrites),[[key==='sound'?'overall_soundscape':'non_diegetic_music',true],[key==='sound'?'overall_soundscape':'non_diegetic_music',false]]);assert.equal(await page.evaluate(()=>subject.commits),0);
    }
  });
  await check('Native Enter/Space and blank sibling header clicks affect only their own disclosure and write only their own view key once',async()=>{
    await reset({});for(const key of ['sound','music']){
      const own=section(key),toggle=own.locator('.mmc-tl-section-toggle');await toggle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
      await own.locator(':scope > .mmc-tl-section-head').evaluate(node=>node.click());
      assert.equal(await page.evaluate(key=>audioSections()[key].isOpen(),key),true);
    }
    assert.deepEqual(await page.evaluate(()=>viewWrites),[['overall_soundscape',true],['overall_soundscape',false],['overall_soundscape',true],['non_diegetic_music',true],['non_diegetic_music',false],['non_diegetic_music',true]]);assert.equal(await page.evaluate(()=>subject.commits),0);
  });
  await check('Resizing an open textarea grows only its own outline, not the closed or open sibling',async()=>{
    for(const key of ['sound','music'])for(const siblingOpen of [false,true]){
      await reset({soundOpen:key==='sound'||siblingOpen,musicOpen:key==='music'||siblingOpen});const own=key==='sound'?0:1,other=1-own;
      const before=await geometry();await section(key).locator('textarea').evaluate(node=>{node.style.height='230px';});const enlarged=await geometry();
      assert.ok(enlarged.fields[own].root.height>before.fields[own].root.height+40);assert.ok(Math.abs(enlarged.fields[other].root.height-before.fields[other].root.height)<1);
      assert.equal(await page.evaluate(()=>subject.commits),0);assert.deepEqual(await page.evaluate(()=>viewWrites),[]);
    }
  });
  await check('Programmatic fold of A keeps a caret in B; focus returns to A only when A itself contained the caret',async()=>{
    for(const key of ['sound','music']){
      await reset({soundOpen:true,musicOpen:true});const other=key==='sound'?'music':'sound';await section(other).locator('textarea').focus();
      await page.evaluate(key=>audioSections()[key].setOpen(false),key);assert.equal(await section(other).locator('textarea').evaluate(node=>document.activeElement===node),true);
      await page.evaluate(key=>audioSections()[key].setOpen(true),key);await section(key).locator('textarea').focus();await page.evaluate(key=>audioSections()[key].setOpen(false),key);assert.equal(await section(key).locator('.mmc-tl-section-toggle').evaluate(node=>document.activeElement===node),true);
      assert.equal(await page.evaluate(key=>audioSections()[key].isOpen(),other),true);
    }
  });
  await check('Typing, folding and background rerenders preserve both mounted input identities and unrelated text/data',async()=>{
    await reset({soundOpen:true,musicOpen:false});await page.evaluate(()=>{window.savedSound=subject.soundscapeBox;window.savedMusic=subject.musicBox;window.savedAudioData=JSON.stringify([subject.timeline.prompt,subject.timeline.assets,subject.timeline.subjects,subject.timeline.segments]);});
    await section('sound').locator('textarea').fill('User revised the original sound description');assert.equal(await page.evaluate(()=>subject.commits),1);const music=await page.evaluate(()=>subject.timeline.music);
    await page.evaluate(()=>{for(let n=0;n<5;n++)subject.render();subject.soundscapeSection.setOpen(false);subject.musicSection.setOpen(true);});
    assert.equal(await page.evaluate(()=>subject.soundscapeBox===savedSound&&subject.musicBox===savedMusic),true);assert.equal(await section('sound').locator('textarea').inputValue(),'User revised the original sound description');assert.equal(await page.evaluate(()=>subject.timeline.music),music);assert.equal(await page.evaluate(()=>JSON.stringify([subject.timeline.prompt,subject.timeline.assets,subject.timeline.subjects,subject.timeline.segments])===savedAudioData),true);
    assert.equal(await page.evaluate(()=>subject.commits),1);
  });
  await check('N/A and original Undo alter only A and leave B state, value and outline unchanged for every state combination',async()=>{
    for(const soundOpen of [false,true])for(const musicOpen of [false,true])for(const key of ['sound','music']){
      await reset({soundOpen,musicOpen});const own=key==='sound'?0:1,other=1-own;const data=await page.evaluate(()=>JSON.stringify(subject.timeline)),before=(await geometry()).fields[other];
      await confirmNA(key);assert.equal(await page.evaluate(key=>subject.timeline[key==='sound'?'soundscape':'music'],key),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);const after=(await geometry()).fields[other];
      assert.equal(after.open,before.open);assert.equal(after.value,before.value);assert.ok(Math.abs(after.root.height-before.root.height)<1);assert.deepEqual(await page.evaluate(()=>viewWrites),[]);
      await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),data);assert.equal(await page.evaluate(()=>subject.commits),2);assert.equal(await section(key).locator('.mmc-tl-na').evaluate(node=>document.activeElement===node),true);const undone=(await geometry()).fields[other];assert.equal(undone.open,before.open);assert.ok(Math.abs(undone.root.height-before.root.height)<1);
    }
  });
  await check('Cross-field N/A replaces only the original one-field Undo record and never changes either fold state',async()=>{
    await reset({soundOpen:false,musicOpen:true});const music=await page.evaluate(()=>subject.timeline.music);await confirmNA('sound');await confirmNA('music');await page.locator('.mmc-tl-na-undo').click();
    assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'N/A');assert.equal(await page.evaluate(()=>subject.timeline.music),music);assert.equal(await page.evaluate(()=>subject.soundscapeSection.isOpen()),false);assert.equal(await page.evaluate(()=>subject.musicSection.isOpen()),true);assert.equal(await page.evaluate(()=>subject.commits),3);assert.deepEqual(await page.evaluate(()=>viewWrites),[]);
  });
  await check('Summary time/count/cost group is left-aligned in its same body row, above unchanged card navigation',async()=>{
    await reset({});const result=(await geometry()).summary;assert.equal(result.margin,'0px');assert.ok(Math.abs(result.total.left-result.host.left)<1);assert.equal(result.parent,'mmc-tl-body');assert.equal(result.previous,'mmc-tl-cast');assert.equal(result.next,'mmc-tl-loras');assert.deepEqual(result.classes,['mmc-tl-total','mmc-note']);assert.ok(result.note.left>=result.total.right-1);assert.ok(Math.abs(result.total.top-result.note.top)<8);assert.equal(await page.locator('.mmc-tl-header .mmc-tl-total').count(),0);
  });
  const scenarios=[
    {name:'held-chained',options:{}},
    {name:'normal-all-rendered',options:{segments:[{duration_s:8},{duration_s:9}]}},
    {name:'single-shot-piece',options:{single:true,segments:[{duration_s:8},{duration_s:9}]}},
    {name:'mixed-merged-passes',options:{segments:[{duration_s:8},{duration_s:9,merge:true},{duration_s:10}]}},
    {name:'empty-piece',options:{segments:[]}},
    {name:'warnings',options:{problem:'A source reference is missing',refineError:'Choose a refiner model'}},
  ];
  await check('Normal/single/mixed/empty totals, next-render facts, costs and warnings preserve their actual source semantics',async()=>{
    for(const scenario of scenarios){await reset(scenario.options);const result=(await geometry()).summary;assert.ok(Math.abs(result.total.left-result.host.left)<1,scenario.name);assert.equal(result.margin,'0px');
      if(previous){await previous.evaluate(options=>setAudioFixture(options),scenario.options);const was=(await previous.evaluate(()=>audioGeometry())).summary;assert.deepEqual(result.classes,was.classes,scenario.name);assert.deepEqual(result.text,was.text,scenario.name);}
      assert.equal(await page.evaluate(()=>subject.commits),0);
    }
  });
  await check('Long diagnostic text still wraps within the summary row without displacing totals back to the right',async()=>{
    await reset({problem:'Missing source media. '.repeat(30),refineError:'Refiner configuration unavailable. '.repeat(20)});const result=await geometry();assert.ok(Math.abs(result.summary.total.left-result.summary.host.left)<1);assert.equal(await page.locator('.mmc-tl-summary-row .mmc-tl-problem').count(),1);assert.equal(await page.locator('.mmc-tl-summary-row .mmc-warn').count(),1);assert.ok(result.page<=result.viewport+1);
    for(const box of await page.locator('.mmc-tl-summary-row > *').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right};})))assert.ok(inside(box,result.summary.host));
  });
  await check('Independent view keys restore after reopening without workflow edits, duplicated controls or lost input contents',async()=>{
    await reset({});await section('sound').locator('.mmc-tl-section-toggle').click();const before=await page.evaluate(()=>audioState());
    await reset({viewState:before.views});assert.equal(await page.evaluate(()=>subject.soundscapeSection.isOpen()),true);assert.equal(await page.evaluate(()=>subject.musicSection.isOpen()),false);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before.data);assert.equal(await page.evaluate(()=>subject.commits),0);assert.deepEqual(await page.evaluate(()=>viewWrites),[]);assert.equal(await page.locator('.mmc-tl-audio > .mmc-tl-section').count(),2);assert.equal(await page.locator('.mmc-tl-na').count(),2);
  });
  await check('Desktop/320/640px EN/KO and enlarged type preserve all four independent outlines, ARIA and left summary without horizontal overflow',async()=>{
    for(const width of [1600,320,640])for(const language of ['en','ko'])for(const scale of [1,1.6])for(const soundOpen of [false,true])for(const musicOpen of [false,true]){
      await page.setViewportSize({width,height:1600});await reset({language,scale,soundOpen,musicOpen});const result=await geometry();assert.ok(result.page<=result.viewport+1,JSON.stringify({width,language,scale}));
      for(const field of result.fields){assert.ok(inside(field.root,result.audio));assert.equal(field.bodyHidden,!field.open);assert.equal(field.expanded,String(field.open));assert.ok(field.idMatches&&field.labelMatches);if(!field.open)assert.ok(Math.abs(field.root.height-field.head.height-field.border)<1,JSON.stringify({width,language,scale,field}));}
      assert.ok(Math.abs(result.summary.total.left-result.summary.host.left)<1);assert.ok(inside(result.summary.total,result.summary.host));
      if(width===1600)assert.ok(Math.abs(result.fields[0].root.top-result.fields[1].root.top)<1);else{assert.ok(Math.abs(result.fields[0].root.left-result.fields[1].root.left)<1);assert.ok(result.fields[1].root.top>=result.fields[0].root.bottom+10);}
      if(language==='ko'&&scale===1.6&&soundOpen&&!musicOpen){await page.locator('.mmc-tl-audio').scrollIntoViewIfNeeded();await shot('timeline-audio-summary-'+width+'-ko-large-sound-open.png');}
      if(width===1600&&language==='en'&&scale===1&&!soundOpen&&musicOpen)await shot('timeline-audio-summary-desktop-en-music-open.png');
      if(width===1600&&language==='ko'&&scale===1&&!soundOpen&&!musicOpen)await shot('timeline-audio-summary-desktop-ko-closed.png');
    }
  });
  await check('Stacked narrow layout moves the later section naturally but never stretches it when the earlier field resizes',async()=>{
    for(const width of [320,640])for(const language of ['en','ko']){
      await page.setViewportSize({width,height:1600});await reset({language,scale:1.6,soundOpen:true,musicOpen:false});const before=await geometry();await section('sound').locator('textarea').evaluate(node=>{node.style.height='230px';});const after=await geometry();
      assert.ok(after.fields[0].root.height>before.fields[0].root.height+30);assert.ok(Math.abs(after.fields[1].root.height-before.fields[1].root.height)<1);assert.ok(after.fields[1].root.top>before.fields[1].root.top+30);assert.equal(after.fields[1].bodyHidden,true);assert.equal(after.fields[1].expanded,'false');assert.ok(after.page<=after.viewport+1);
    }
  });
  await check('Scoped CSS leaves ordinary audio grids and totals outside Timeline with their original default alignment',async()=>{
    await page.setViewportSize({width:1600,height:1400});await reset({});const result=await page.evaluate(()=>{
      const host=document.createElement('div');host.className='fixture-ordinary mmc-root';host.style.cssText='position:fixed;left:20px;top:20px;width:800px;display:flex';
      const total=document.createElement('div');total.className='mmc-tl-total';total.textContent='Ordinary total';host.append(total);
      const audio=document.createElement('div');audio.className='mmc-tl-audio';host.append(audio);document.body.append(host);
      const value={audio:getComputedStyle(audio).alignItems,margin:getComputedStyle(total).marginLeft,left:total.getBoundingClientRect().left,hostLeft:host.getBoundingClientRect().left};host.remove();return value;
    });assert.equal(result.audio,'normal');assert.ok(result.left>result.hostLeft+100);
  });
  assert.deepEqual(errors,[],'No browser errors');assert.equal(requests,0,'No external requests');
  console.log(JSON.stringify({suite:'timeline-audio-independence',passed:results.length,baselineEvidence,networkRequests:requests,browserErrors:errors,results,
    scope:'actual source frontend/DOM/CSS and audio/summary callbacks with existing read-only execution adapters; no live ComfyUI/GPU proof'},null,2));
  if(previous)await previous.close();await page.evaluate(()=>subject.close());await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
