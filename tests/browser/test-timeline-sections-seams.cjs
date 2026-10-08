// Isolated browser checks: actual helper, methods and CSS, with model/API seams
// stubbed. This does not import ComfyUI or perform any GPU generation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../web/creator');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('timeline.js');
const castSource = read('cast.js');
const creatorSource = fs.readFileSync(path.join(root, '../creator.js'), 'utf8');
const sectionState = creatorSource.match(/^const SECTION_STATE = .*;$/m);
const sectionAdapter = creatorSource.match(/^const sectionControls = \(node\) => \(\{[^]*?^\}\);/m);
assert.ok(sectionState && sectionAdapter, 'node-owned section controls');
const method = (name, code = source) => {
  const found = code.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, name); return found[0];
};
const helper = read('disclosure.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const domSource = read('dom.js');
const dom = domSource.match(/export function el\([^]*?^\}/m)[0].replace(/^export /, '');
const popovers = [
  domSource.match(/const popoverOwners[^]*?(?=\/\*\* Close-on-outside-click)/)[0],
  ...['floatAbove','dismissable','placeNear'].map(name => domSource.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'))[0].replace(/^export /,'')),
].join('\n').replace(/^export /gm,'');
const css = ['base', 'editor', 'timeline'].map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code = `
${dom}
${popovers}
${helper}
${sectionState[0]}
${sectionAdapter[0]}
const t = (text, vars = {}) => text.replace(/\\{([^}]+)\\}/g, (_, key) => vars[key] ?? key);
const icon = () => el('span', { text: '·' });
const seamGroup = children => children.length ? el('div', {class:'mmc-tl-seam-group'}, children) : null;
const blendSeconds = (frames, rules) => (frames / rules.fps).toFixed(1);
const blendSetsTail = (segment, piece) => S.continuesAudio(segment) && S.feather(segment, piece) > 1;
const passNumbers = () => '1';
const rulesFor = () => ({fps:24});
const SoundLane = class { constructor(options) { this.options=options; this.host = el('div'); } };
const mountOverlay = (node) => { document.body.append(node); return () => node.remove(); };
const S = {
  takesReferences: state => state.takesRefs !== false,
  familyOf: () => ({label:'Fixture'}),
  pieceFamily: () => 'fixture',
  continues: item => !!item.continue,
  continuesAudio: item => !!item.continue_audio,
  isClip: item => item?.kind === 'clip',
  blockedReason: (item, key) => item['blocked_' + key] || null,
  continueSource: (item,index) => item.continue_from ?? index,
  feather: item => item.feather ?? 1,
  featherPin: () => false,
  canDo: state => state.storyboard !== false,
  storyboardSheet: () => [],
  clipSeamBlocked: (state,index,key) => state.segments[index]['blocked_' + key] || null,
  maxClipFeather: () => 24,
  poolCitedGlobally: (state, asset) => (state.prompt || '').includes('@' + asset.handle),
  refCaps: () => ({files:4}),
};
let pickerAnswer = null;
const openPicker = async () => pickerAnswer;
class Subject {
 ${['sectionOptions','noAudioButton','mount','textBox','setGlobalPrompt','renderPool','openCastMember','renderClipJoin','renderJoin','citeName','citeInGlobal','addPoolAssets'].map(name=>method(name)).join('\n')}
 globalPromptBox() {
   const root = el('div', {contenteditable:'true',class:'mmc-prompt'});
   return {root, frame:el('div',{class:'mmc-tl-prompt-frame'},[root]),
     setValue(value) { root.textContent=value; }, closeMenu() { window.menuClosed++; }};
 }
 render() { this.renderPool(); }
 renderCast() {}
 renderBar() {}
 commit() { this.commits++; this.renderPool(); }
 poolChip(asset) { return el('button',{text:asset.handle}); }
 poolPlate() { return null; }
 poolEntry(pick) { return {handle:'ref-'+(this.timeline.assets.length+1),kind:pick.kind,filename:pick.path}; }
 earlierPasses() { return this.passes || []; }
 close() { this.unmount(); }
 pickFeather(anchor) { window.lastPick={kind:'blend',anchor}; }
 pickClipFeather(anchor) { window.lastPick={kind:'clipBlend',anchor}; }
 pickContinueFrom(anchor) { window.lastPick={kind:'source',anchor}; }
 pickStoryboard(anchor) { window.lastPick={kind:'board',anchor}; }
 mergeAt() { window.lastPick={kind:'merge'}; }
}
window.menuClosed=0;
window.subject=Object.assign(new Subject(),{timeline:{prompt:'Standing scene',soundscape:'Room tone',music:'N/A',assets:[],subjects:[],segments:[{},{}]},commits:0});
window.createDisclosure=createDisclosure;
window.setPickerAnswer = value => { pickerAnswer=value; };
window.Subject=Subject;
window.makePopover=(anchor, name) => {
  const node=el('div',{class:'mmc-pop'},[el('button',{text:name})]);document.body.append(node);
  placeNear(node,anchor); const close=dismissable(node,()=>{window.popoverClosed.push(name);});return {node,close};
};
window.popoverClosed=[];
const WearsPanel = class {};
class FixtureCast {
 ${['constructor','openMember','render'].map(name=>method(name,castSource)).join('\n')}
 ${castSource.match(/^  isExpanded\(.*$/m)[0]}
 ${castSource.match(/^  reveal\(.*$/m)[0]}
 typing() { return false; }
 problem(subject) { return subject.problem || ''; }
 card(subject) { return el('div',{text:subject.handle+(this.opened===subject?' open':' shut')}); }
}
window.FixtureCast=FixtureCast;
const CastShelf=FixtureCast;
class PersistentSubject extends Subject {
 ${method('constructor').replace(/\{\r?\n/, '{\n    super();\n')}
 ${method('renderCast')}
 render() { this.renderPool(); this.renderCast(); }
}
const openTimeline = options => { window.openedOptions=options; };
class FixtureBody {
 ${method('open')}
 commit() {}
 widgetIO() { return {}; }
}
window.sectionKeys=['global_prompt','overall_soundscape','non_diegetic_music','references','cast'];
window.fixtureNode=properties => ({properties,widgets:[{name:'creator_data',value:'unchanged generation blob'}],dirty:0,graph:{setDirtyCanvas(){this.owner.dirty++;}}});
window.makePersistent = (node, soundSnaps = null) => {
 node.graph.owner=node;
 const view=new PersistentSubject({timeline:{prompt:'Standing scene',soundscape:'Room tone',music:'N/A',assets:[],subjects:[],segments:[{},{}]},sections:sectionControls(node),soundSnaps},()=>{});
 view.commits=0; view.mount(); return view;
};
window.sectionList=view => [view.promptSection,view.soundscapeSection,view.musicSection,view.poolSection,view.castShelf.section];
window.FixtureBody=FixtureBody;
window.sectionControls=sectionControls;
subject.mount();
`;
const results = [];
new (require('node:vm').Script)(code, { filename: 'timeline-fixture.js' });
let browser, requests = 0;
async function check(name, fn) { await fn(); results.push({name,passed:true}); }
(async () => {
  browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true});
  const page = await browser.newPage({viewport:{width:1100,height:850}});
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<html><head><style>${css}</style></head><body style="--mmc-type:1;--mmc-surface:#242424;--mmc-surface-2:#333;--mmc-line:#555;--mmc-line-2:#777;--mmc-text:#eee;--mmc-dim:#bbb;--mmc-accent:#acf;background:#111;font-family:Arial"></body></html>`);
  await page.evaluate(`(() => { ${code} })()`);
  await check('Four Timeline shells open by default and global label retains prompt value', async () => {
    assert.deepEqual(await page.evaluate(() => ({states:[subject.promptSection,subject.soundscapeSection,subject.musicSection,subject.poolSection].map(s=>s.isOpen()),label:subject.promptSection.toggle.textContent,prompt:subject.timeline.prompt,aria:subject.soundscapeBox.getAttribute('aria-labelledby')===subject.soundscapeSection.titleId})),{states:[true,true,true,true],label:'⌄global_prompt',prompt:'Standing scene',aria:true});
  });
  await check('Independent folding retains textarea DOM, values and serialized state', async () => {
    assert.equal(await page.evaluate(() => {
      const before=JSON.stringify(subject.timeline), input=subject.soundscapeBox;
      subject.soundscapeSection.toggle.click();
      const good=subject.musicSection.isOpen()&&!subject.soundscapeSection.isOpen();
      subject.soundscapeSection.toggle.click();
      return good&&input===subject.soundscapeBox&&input.value==='Room tone'&&before===JSON.stringify(subject.timeline)&&subject.commits===0;
    }),true);
  });
  await check('Native Enter and Space toggle exactly once; prompt menu closes on fold', async () => {
    const button=page.locator('.mmc-tl-section-toggle').first();
    await button.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),false);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),true);
    assert.equal(await page.evaluate(()=>menuClosed),1);
  });
  await check('Programmatic collapse restores focus and hides body from tab order', async () => {
    assert.equal(await page.evaluate(() => {
      subject.musicBox.focus(); subject.musicSection.setOpen(false);
      const good=document.activeElement===subject.musicSection.toggle&&getComputedStyle(subject.musicSection.body).display==='none';
      subject.musicSection.setOpen(true); return good;
    }),true);
  });
  await check('Pool shell/toggle remains focused and collapsed across refresh; warnings visible', async () => {
    assert.equal(await page.evaluate(() => {
      const toggle=subject.poolSection.toggle;
      subject.poolSection.setOpen(false); toggle.focus(); subject.poolError='Fixture failure'; subject.renderPool();
      return toggle===subject.poolSection.toggle&&document.activeElement===toggle&&!subject.poolSection.isOpen()&&!subject.poolWarning.hidden&&subject.poolWarning.textContent==='Fixture failure';
    }),true);
  });
  await check('Unsupported empty pool hides; existing unsupported refs retain visible warning', async () => {
    assert.equal(await page.evaluate(() => {
      subject.timeline.takesRefs=false; subject.renderPool();
      const hidden=getComputedStyle(subject.poolHost).display==='none';
      subject.timeline.assets=[{handle:'ref-1'}]; subject.renderPool();
      const good=hidden&&!subject.poolHost.hidden&&subject.poolSection.toggle.textContent.includes('reads no attached references');
      subject.timeline.takesRefs=true; subject.renderPool();return good;
    }),true);
  });
  await check('Right action cancel does not toggle; successful Add reveals and retains assets', async () => {
    assert.equal(await page.evaluate(async () => {
      subject.poolSection.setOpen(false); setPickerAnswer(null); subject.poolAdd.click(); await Promise.resolve();
      const cancelled=!subject.poolSection.isOpen(); setPickerAnswer([{path:'test.png',kind:'image'}]);
      subject.poolAdd.click(); await Promise.resolve();
      return cancelled&&subject.poolSection.isOpen()&&subject.timeline.assets.length===2;
    }),true);
  });
  await check('Successful citation reveals global prompt without changing stored key', async () => {
    assert.equal(await page.evaluate(() => {
      subject.promptSection.setOpen(false); subject.citeName('subject');
      return subject.promptSection.isOpen()&&subject.timeline.prompt.includes('@subject')&&!Object.hasOwn(subject.timeline,'global_prompt');
    }),true);
  });
  await check('Hidden Cast navigation forces open while visible navigation keeps normal toggle', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const calls=[]; let expanded=false;
      subject.castShelf={isExpanded:()=>expanded,openMember:(handle,options)=>{calls.push(options.forceOpen);return handle==='known'?'opened':false;},reveal:()=>{expanded=true;}};
      subject.openCastMember('bad'); const unknown=expanded; subject.openCastMember('known'); subject.openCastMember('known');
      return {calls,unknown,expanded};
    }),{calls:[true,true,false],unknown:false,expanded:true});
  });
  await check('Actual CastShelf methods preserve already-open member across whole-shelf hide/reveal', async () => {
    assert.equal(await page.evaluate(() => {
      const member={handle:'subject'},other={handle:'subject_2'},members=[member,other];
      const shelf=new FixtureCast({getCast:()=>members,getAssets:()=>[],disclosure:true});
      subject.castShelf=shelf;subject.castHost.replaceChildren(shelf.root);shelf.render();
      const initial=shelf.isExpanded(),toggle=shelf.section.toggle;
      shelf.openMember('subject');shelf.section.setOpen(false);
      subject.openCastMember('missing');const untouched=!shelf.isExpanded()&&shelf.opened===member;
      subject.openCastMember('subject');const revealed=shelf.isExpanded()&&shelf.opened===member;
      subject.openCastMember('subject');const shut=shelf.opened===null;
      shelf.section.setOpen(false);shelf.render();
      return initial&&untouched&&revealed&&shut&&toggle===shelf.section.toggle&&!shelf.isExpanded();
    }),true);
  });
  await check('Cast reference warnings remain visible outside folded list', async () => {
    assert.equal(await page.evaluate(() => {
      const shelf=subject.castShelf; shelf.getCast()[0].problem='Missing reference';shelf.render();shelf.section.setOpen(false);
      return !shelf.sectionWarning.hidden&&shelf.sectionWarning.textContent==='@subject: Missing reference'&&!shelf.section.body.contains(shelf.sectionWarning);
    }),true);
  });
  await check('Nested picker pointer preserves ancestor; scoped collapse cleans descendants after anchor refresh', async () => {
    await page.evaluate(() => {
      subject.poolSection.setOpen(true);
      const anchor=document.createElement('button');subject.poolSection.body.append(anchor);
      window.parentPop=makePopover(anchor,'parent');
      window.childPop=makePopover(parentPop.node.firstChild,'child');
      window.otherPop=makePopover(subject.musicBox,'other');
      // Ownership must survive ordinary chip refresh detaching the anchor.
      anchor.remove();
    });
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    assert.equal(await page.evaluate(() => {
      childPop.node.firstChild.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      return parentPop.node.isConnected&&childPop.node.isConnected;
    }),true);
    await page.evaluate(()=>subject.poolSection.setOpen(false));
    assert.deepEqual(await page.evaluate(()=>({parent:parentPop.node.isConnected,child:childPop.node.isConnected,other:otherPop.node.isConnected,closed:[...popoverClosed].sort()})),{parent:false,child:false,other:false,closed:['child','other','parent']});
  });
  await check('Collapse without pointer event never dismisses an unrelated live popover', async () => {
    assert.equal(await page.evaluate(() => {
      subject.poolSection.setOpen(true);
      const anchor=document.createElement('button');subject.poolSection.body.append(anchor);
      const inside=makePopover(anchor,'owned-new'),outside=makePopover(subject.musicBox,'unrelated-new');
      subject.poolSection.setOpen(false);const good=!inside.node.isConnected&&outside.node.isConnected;
      outside.close();outside.close();return good&&popoverClosed.filter(x=>x==='unrelated-new').length===1;
    }),true);
  });
  await check('Default outside pointer dismissal still disposes once after deferred registration', async () => {
    await page.evaluate(()=>{window.regularPop=makePopover(subject.musicBox,'regular');});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    await page.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
    assert.equal(await page.evaluate(()=>!regularPop.node.isConnected&&popoverClosed.filter(x=>x==='regular').length===1),true);
  });
  await check('Seam option matrix has no empty groups; One pass stays direct child', async () => {
    const rows=await page.evaluate(() => {
      const result=[];
      for (const [on,sound,passes] of [[false,false,2],[false,true,2],[true,false,1],[true,true,2]]) {
        const s=Object.assign(new Subject(),{timeline:{segments:[{},{},{continue:on,continue_audio:sound}]},passes:Array.from({length:passes},(_,i)=>({start:i,end:i+1})),commits:0});
        const node=s.renderJoin(2);document.body.append(node);
        result.push({groups:node.querySelectorAll('.mmc-tl-seam-group').length,options:node.querySelectorAll('.mmc-tl-join-from').length,empty:[...node.querySelectorAll('.mmc-tl-seam-group')].some(g=>!g.children.length),merge:node.querySelector('.mmc-tl-join-merge')?.parentNode===node});node.remove();
      }return result;
    });
    assert.deepEqual(rows,[{groups:3,options:0,empty:false,merge:true},{groups:4,options:1,empty:false,merge:true},{groups:4,options:1,empty:false,merge:true},{groups:4,options:2,empty:false,merge:true}]);
  });
  await check('Clip seams and generation after clip keep original capability gates', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const s=Object.assign(new Subject(),{timeline:{segments:[{},{kind:'clip',continue:true}]},commits:0});
      const front=s.renderJoin(1);const f={groups:front.children.length,merge:!!front.querySelector('.mmc-tl-join-merge'),board:!!front.querySelector('.mmc-tl-join-board')};
      s.timeline.segments=[{kind:'clip'},{continue:false}];const back=s.renderJoin(1);return {front:f,backMerge:!!back.querySelector('.mmc-tl-join-merge')};
    }),{front:{groups:3,merge:false,board:false},backMerge:false});
  });
  await check('Seam buttons preserve callback anchors and disabled behavior', async () => {
    assert.equal(await page.evaluate(() => {
      const s=Object.assign(new Subject(),{timeline:{assets:[],segments:[{},{},{continue:true,continue_audio:true}]},passes:[{start:0,end:1},{start:1,end:2}],commits:0});
      const node=s.renderJoin(2),options=node.querySelectorAll('.mmc-tl-join-from');
      options[0].click();const first=lastPick.kind==='source'&&lastPick.anchor===options[0];
      options[1].click();const second=lastPick.kind==='blend'&&lastPick.anchor===options[1];
      s.timeline.segments[2]={blocked_continue:'No reference keyframes'};const locked=s.renderJoin(2).querySelector('button');locked.click();
      return first&&second&&locked.disabled&&s.commits===0;
    }),true);
  });
  await check('Large localized headings and action buttons do not overlap at narrow widths', async () => {
    const rows=await page.evaluate(() => {
      const results=[];
      for(const [title,hint] of [['작품 레퍼런스','한 번만 첨부하세요. 전역 프롬프트에 인용한 참조는 모든 세그먼트에 사용됩니다.'],['作品リファレンス','グローバルプロンプトで参照すると、すべてのセグメントで使用されます。'],['作品参考素材','在全局提示词中引用素材名称，即可应用到所有片段。'],['non_diegetic_music','The score only the audience hears.']]) {
        const action=document.createElement('button');action.textContent='From library';
        const d=createDisclosure({title,hint,content:document.createElement('textarea'),actions:[action]});
        Object.assign(d.root.style,{width:'285px'});d.root.style.setProperty('--mmc-type','1.5');document.body.append(d.root);
        const a=action.getBoundingClientRect(),b=d.toggle.getBoundingClientRect(),r=d.root.getBoundingClientRect();
        results.push({overlap: a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,overflow:d.root.scrollWidth>r.width+1});d.root.remove();
      }return results;
    });assert.ok(rows.every(r=>!r.overlap&&!r.overflow),JSON.stringify(rows));
  });
  await check('Restoring a closed disclosure is inert; callbacks run only on actual changes', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const changes=[];let before=0;
      const d=createDisclosure({title:'Stored closed',content:document.createElement('textarea'),initialOpen:false,onOpenChange:value=>changes.push(value),onBeforeCollapse:()=>before++});
      document.body.append(d.root);
      const initial={open:d.isOpen(),hidden:d.body.hidden,aria:d.toggle.getAttribute('aria-expanded'),before,changes:changes.length};
      d.setOpen(false);d.setOpen(true);d.setOpen(true);d.setOpen(false);d.setOpen(false);
      d.root.remove();return {initial,before,changes};
    }),{initial:{open:false,hidden:true,aria:'false',before:0,changes:0},before:1,changes:[true,false]});
  });
  await check('All five sections remain open by default and initialization writes no preferences', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const node=fixtureNode(undefined),view=makePersistent(node);
      const result={open:sectionList(view).map(d=>d.isOpen()),properties:node.properties??null,dirty:node.dirty,blob:node.widgets[0].value};
      view.close();return result;
    }),{open:[true,true,true,true,true],properties:null,dirty:0,blob:'unchanged generation blob'});
  });
  await check('All five collapsed sections survive modal close/reopen without changing creator_data', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const node=fixtureNode({mmc_face_piece:true,mmc_timeline_sections:{}}),oldMap=node.properties.mmc_timeline_sections;
      const view=makePersistent(node),before=JSON.stringify(view.timeline);
      for(const d of sectionList(view))d.toggle.click();
      const original=JSON.stringify(view.timeline)===before&&node.widgets[0].value==='unchanged generation blob';
      view.close();const reopened=makePersistent(node);
      const result={open:sectionList(reopened).map(d=>d.isOpen()),states:sectionKeys.map(key=>node.properties.mmc_timeline_sections[key]),dirty:node.dirty,oldMapKeys:Object.keys(oldMap).length,original,face:node.properties.mmc_face_piece};
      reopened.close();return result;
    }),{open:[false,false,false,false,false],states:[false,false,false,false,false],dirty:5,oldMapKeys:0,original:true,face:true});
  });
  await check('Mixed section states survive workflow-properties JSON roundtrip and reload', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const node=fixtureNode({mmc_timeline_sections:{}}),view=makePersistent(node);
      sectionList(view).forEach((d,index)=>d.setOpen(index%2===0));view.close();
      const saved=JSON.stringify({properties:node.properties,widgets_values:[node.widgets[0].value]}),loaded=JSON.parse(saved);
      const restored=fixtureNode({}),adapter=sectionControls(restored);
      restored.properties=loaded.properties;
      const reopened=makePersistent(restored),result={open:sectionList(reopened).map(d=>d.isOpen()),lateRead:sectionKeys.map(key=>adapter.read(key)),dirty:restored.dirty,blob:loaded.widgets_values[0]};
      reopened.close();return result;
    }),{open:[true,false,true,false,true],lateRead:[true,false,true,false,true],dirty:0,blob:'unchanged generation blob'});
  });
  await check('Section preferences are node-local and only explicit false restores closed', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const first=fixtureNode({}),second=fixtureNode({mmc_timeline_sections:{global_prompt:'false',overall_soundscape:0,non_diegetic_music:null,references:true}});
      const a=makePersistent(first),b=makePersistent(second);sectionList(a).forEach(d=>d.setOpen(false));
      const result={first:sectionList(a).map(d=>d.isOpen()),second:sectionList(b).map(d=>d.isOpen()),secondDirty:second.dirty,shared:first.properties.mmc_timeline_sections===second.properties.mmc_timeline_sections};
      a.close();b.close();return result;
    }),{first:[false,false,false,false,false],second:[true,true,true,true,true],secondDirty:0,shared:false});
  });
  await check('Programmatic prompt, reference and Cast reveals update stored state for next reopen', async () => {
    assert.deepEqual(await page.evaluate(async () => {
      const closed=Object.fromEntries(sectionKeys.map(key=>[key,false])),node=fixtureNode({mmc_timeline_sections:closed}),view=makePersistent(node);
      view.citeName('subject');setPickerAnswer([{path:'preserved.png',kind:'image'}]);await view.addPoolAssets();
      view.timeline.subjects=[{handle:'subject'}];view.renderCast();view.openCastMember('subject');
      view.close();const reopened=makePersistent(node),result={open:sectionList(reopened).map(d=>d.isOpen()),stored:sectionKeys.map(key=>node.properties.mmc_timeline_sections[key]),dirty:node.dirty};
      reopened.close();return result;
    }),{open:[true,false,false,true,true],stored:[true,false,false,true,true],dirty:3});
  });
  await check('TimelineBody passes its node-owned section adapter through every modal open', async () => {
    assert.equal(await page.evaluate(() => {
      const sections=sectionControls(fixtureNode({})),soundSnaps=new Set(),body=Object.assign(new FixtureBody(),{timeline:{segments:[]},sections,soundSnaps});
      body.open();const first=openedOptions.sections===sections&&openedOptions.edit===null&&openedOptions.soundSnaps===soundSnaps;
      body.open({edit:2});const passed=first&&openedOptions.sections===sections&&openedOptions.edit===2&&openedOptions.soundSnaps===soundSnaps;
      const view=makePersistent(fixtureNode({}),soundSnaps),lane=view.sound.options.snaps===soundSnaps;view.close();return passed&&lane;
    }),true);
  });
  await check('Each N/A button changes only its own field and commits once without unfolding it', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const node=fixtureNode({mmc_timeline_sections:{overall_soundscape:false,non_diegetic_music:false}}),view=makePersistent(node);
      view.timeline.music='Original score';view.musicBox.value='Original score';
      const other=JSON.stringify({prompt:view.timeline.prompt,assets:view.timeline.assets,subjects:view.timeline.subjects,segments:view.timeline.segments});
      const sound=view.soundscapeSection.head.querySelector('.mmc-tl-na'),music=view.musicSection.head.querySelector('.mmc-tl-na');
      sound.click();const first={sound:view.timeline.soundscape,music:view.timeline.music,commits:view.commits,closed:!view.soundscapeSection.isOpen()&&!view.musicSection.isOpen()};
      view.timeline.music='Original score';view.musicBox.value='Original score';music.click();
      const result={first,sound:view.soundscapeBox.value,music:view.musicBox.value,commits:view.commits,dirty:node.dirty,closed:!view.soundscapeSection.isOpen()&&!view.musicSection.isOpen(),preserved:other===JSON.stringify({prompt:view.timeline.prompt,assets:view.timeline.assets,subjects:view.timeline.subjects,segments:view.timeline.segments})};
      view.close();return result;
    }),{first:{sound:'N/A',music:'Original score',commits:1,closed:true},sound:'N/A',music:'N/A',commits:2,dirty:0,closed:true,preserved:true});
  });
  await check('Inline audio heading whitespace toggles once while N/A Enter and Space never toggle', async () => {
    await page.evaluate(()=>{
      window.audioNode=fixtureNode({}),window.audioView=makePersistent(audioNode);
      audioView.soundscapeSection.head.id='audio-sound-head';audioView.musicSection.head.id='audio-music-head';
    });
    await page.locator('#audio-sound-head').click({position:{x:470,y:12}});
    assert.deepEqual(await page.evaluate(()=>[audioView.soundscapeSection.isOpen(),audioNode.dirty,audioView.commits]),[false,1,0]);
    const soundNA=page.locator('#audio-sound-head .mmc-tl-na');await soundNA.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(()=>[audioView.soundscapeSection.isOpen(),audioNode.dirty,audioView.commits,audioView.timeline.soundscape]),[false,1,2,'N/A']);
    await page.locator('#audio-sound-head .mmc-tl-section-toggle').click();
    assert.deepEqual(await page.evaluate(()=>[audioView.soundscapeSection.isOpen(),audioNode.dirty,audioView.commits]),[true,2,2]);
    await page.evaluate(()=>audioView.close());
  });
  await check('24px audio pills stay beside labels and clear header outlines at narrow widths and text scales', async () => {
    const rows=await page.evaluate(()=>{
      const node=fixtureNode({}),view=makePersistent(node),results=[];
      for(const width of [850,285,220])for(const scale of [1,1.25,1.5])for(const section of [view.soundscapeSection,view.musicSection]){
        section.root.style.width=width+'px';section.root.style.setProperty('--mmc-type',String(scale));
        const pill=section.head.querySelector('.mmc-tl-na'),label=section.head.querySelector('.mmc-tl-section-title');
        const h=section.head.getBoundingClientRect(),p=pill.getBoundingClientRect(),l=label.getBoundingClientRect();
        results.push({width,scale,title:label.textContent,height:p.height,topGap:p.top-h.top,bottomGap:h.bottom-p.bottom,rightGap:h.right-p.right,labelGap:p.left-l.right,overflow:section.head.scrollWidth>h.width+1,font:Number.parseFloat(getComputedStyle(pill).fontSize)});
      }view.close();return results;
    });
    assert.ok(rows.every(r=>r.height===24&&r.topGap>=2&&r.bottomGap>=2&&r.rightGap>=2&&r.labelGap>=2&&!r.overflow&&Math.abs(r.font-13*r.scale)<0.01),JSON.stringify(rows));
  });
  if(process.env.SCREENSHOT_PATH){
    await page.evaluate(()=>{
      const view=makePersistent(fixtureNode({mmc_timeline_sections:{overall_soundscape:false,non_diegetic_music:false}}));
      const host=document.createElement('div');host.id='sound-heads-proof';
      host.append(view.soundscapeSection.root,view.musicSection.root);
      Object.assign(host.style,{width:'1000px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',padding:'24px',background:'#181818'});
      document.body.replaceChildren(host);
    });
    await page.locator('#sound-heads-proof').screenshot({path:process.env.SCREENSHOT_PATH});
  }
  assert.equal(requests,0);
  console.log(JSON.stringify({passed:results.length,requests,results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
