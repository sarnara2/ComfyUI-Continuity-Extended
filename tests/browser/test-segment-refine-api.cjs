// Actual refine API validation and actual RefinePanel + PromptBox in offline
// Chromium. The job backend is RAM-only; no ComfyUI, AI, media file or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const read = name => fs.readFileSync(path.join(root, 'web/creator', name), 'utf8');
const strip = text => text.replace(/^import\b[^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const fn = (name, source) => {
  const match = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(match, 'Actual ' + name); return match[0].replace(/^export /, '');
};
const method = (name, source) => {
  const match=source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(match,'Actual method '+name);return match[0];
};
const refine = read('refine.js'), state = read('state.js');
const panel = refine.match(/^export class RefinePanel \{[^]*?^\}/m);
assert.ok(panel, 'Actual RefinePanel');
const code = `
${strip(read('dom.js'))}
const t=(text,values={})=>text.replace(/\\{(\\w+)\\}/g,(_,key)=>values[key]??'{'+key+'}');
const TAG_OFFSET={img:0,vid:1,aud:2};
${['hue','tagIndex','takenHandles','motionOf','replacesOf','subjectFiles','missingPromptHandles','subjectCitationRe','citedSubjects'].map(name=>fn(name,state)).join('\n')}
${strip(read('variations.js'))}
const layoutVariations=layout;
${strip(read('dialogue.js'))}
${strip(read('dialogue-view.js'))}
${strip(read('prompt.js'))}
const REF_SECTIONS=['subject_definitions','summary','retention_analysis'];
const chosenModel=()=> 'fixture-model';
${panel[0].replace(/^export /,'')}
const jobs=[];
const refine=async payload=>new Promise((resolve,reject)=>jobs.push({payload:structuredClone(payload),resolve,reject}));
${['refineField','refineSegment'].map(name=>fn(name,refine)).join('\n')}
const refineOwners=new WeakSet();
${fn('withRefineOwner',refine)}
class ActualEditorRefine { ${method('refine',read('editor.js'))} }
const S={serializeTimeline:JSON.stringify,isClip:segment=>segment.kind==='clip',isSingle:piece=>piece.mode==='single'};
const refineModel=chosenModel;
${['splitExplicitPrompt','refineSources'].map(name=>fn(name,read('prompt-sections.js'))).join('\n')}
${fn('serializeRefined',state)}
const FIELDS=new Set(['subject_definitions','summary','retention_analysis','detailed_description','integrated_multimodal_description','overall_soundscape','non_diegetic_music']);
S.hasPromptSections=piece=>piece.family!=='ltx';
class ActualTimelineRefine {
 ${['refineAll','takePiece'].map(name=>method(name,read('timeline.js'))).join('\n')}
}
window.makeTimeline=()=>{
 makeEditor(0);window.timelineEditor=new ActualTimelineRefine();
 Object.assign(timelineEditor,{timeline:editorPiece,modal:el('div'),commits:0,soundscapeBox:el('textarea'),musicBox:el('textarea'),setGlobalPrompt(text){this.timeline.prompt=text;},audioEdited(){},updateSectionSummaries(){},renderBar(){},commit(){this.commits++;}});
 document.body.append(timelineEditor.modal);
};
window.startTimeline=()=>{window.timelinePending=timelineEditor.refineAll({});};
window.replyTimeline=(patch={})=>jobs.at(-1).resolve({scope:'shot',target_scope:'timeline',field:'all',shots:[{index:0,body:'FIRST ALL',sections:{summary:'FIRST SUMMARY ALL',retention_analysis:'FIRST RULE ALL'},fields:['prompt','summary','retention_analysis']},{index:1,body:'SECOND ALL',sections:{summary:'SECOND SUMMARY ALL',retention_analysis:'SECOND RULE ALL'},fields:['prompt','summary','retention_analysis']}],piece:'GLOBAL ALL',soundscape:'SOUND ALL',music:'MUSIC ALL',...patch});
window.makeEditor=(index=1,preserve=false)=>{
 if(!preserve)window.editorPiece={prompt:'SHARED GLOBAL',soundscape:'SHARED SOUND',music:'SHARED SCORE',subjects:[{handle:'anna',description:'kept identity'}],segments:[{prompt:'첫 번째 인물이 걷는다',prompt_sections:{summary:'첫 번째 요약',retention_analysis:'첫 번째 규칙'}},{prompt:'두 번째 인물이 달린다',prompt_sections:{summary:'두 번째 요약',retention_analysis:'두 번째 규칙'}}]};
 window.editor=new ActualEditorRefine();Object.assign(editor,{state:editorPiece.segments[index],piece:editorPiece,structuredPrompt:true,refineEpoch:0,commits:0,refineTarget:()=>({kind:'segment',index,data:structuredClone(editorPiece)}),commitPrompt(){this.refineEpoch++;this.commits++;},sectionEditor:{source:()=>({body:editor.state.prompt}),readField:field=>refineSources(editor.state)[field]},root:el('div')});
 document.body.append(editor.root);editor.refinePanel=new RefinePanel({getState:()=>editor.state,audioFields:false,promptOnly:true,createPromptBox:options=>new PromptBox({getCast:()=>editorPiece.subjects,...options})});
 editor.refinePanel.readSource=field=>refineSources(editor.state)[field];
 const hosts=Object.fromEntries(['summary','retention_analysis','prompt'].map(field=>{const host=el('div',{'data-refined-field':field});editor.root.append(host);return[field,host];}));editor.refinePanel.setFieldHosts(hosts);
};
window.startEditor=(field='segment')=>{window.editorPending=editor.refine({},field);};
window.editorSnapshot=()=>({piece:structuredClone(editorPiece),commits:editor.commits,problems:editor.refinePanel.problems});
window.runField=(field,index=1)=>{window.apiAnswer=refineField({kind:'segment',index,data:{segments:[{},{}]}},field).then(result=>({ok:true,result}),error=>({ok:false,error:error.message}));};
window.runSegment=()=>{window.apiAnswer=refineSegment({kind:'segment',index:1,data:{segments:[{},{}]}}).then(result=>({ok:true,result}),error=>({ok:false,error:error.message}));};
window.reply=(patch={})=>{const job=jobs.at(-1);job.resolve({scope:'field',target_scope:job.payload.scope,field:job.payload.field,index:job.payload.index,body:'Rewritten body',...(job.payload.field==='segment'?{sections:{summary:'Rewritten summary',retention_analysis:'Retain face'}}:{}),...patch});};
window.jobState=()=>jobs.map(job=>job.payload);
window.makePanel=()=>{
 window.panelState={prompt:'ORIGINAL RAW PROMPT',assets:[{handle:'ref-1',kind:'image',filename:'not-opened.png'}],soundscape:'original audio',music:'original score',refined:{body:'@anna greets @ref-1 and @ref-9.',scope:'shot',enabled:true,sections:{summary:'@anna closeup.',retention_analysis:'@anna: retain face.'}}};
 window.cast=[{handle:'anna',from:['ref-1']}];window.commits=0;
 window.panel=new RefinePanel({getState:()=>panelState,onCommit:()=>{commits++;panel.render();},audioFields:false,promptOnly:true,createPromptBox:options=>new PromptBox({getCast:()=>cast,...options})});
 document.body.append(panel.root);
};
window.panelSnapshot=()=>({state:structuredClone(panelState),commits,boxes:[...panel.promptBoxes].map(([key,box])=>({key,text:box.getValue(),tags:[...box.root.querySelectorAll('[data-handle]')].map(node=>({handle:node.dataset.handle,missing:node.classList.contains('mmc-ref-missing')}))}))});
`;
let browser, network = 0;
const results = [];
const check = async (name, run) => { await run(); results.push(name); console.log('PASS ' + name); };
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{network++;return route.abort();});
  await page.setContent('<html><head><style>.mmc-prompt{white-space:pre-wrap;min-height:48px}.mmc-prompt-head,.mmc-compiled{display:none}.mmc-ref-missing{border:1px solid red}.mmc-refined-fold{display:block}</style></head><body></body></html>');
  await page.evaluate(code);
  await check('All three field names retain selected segment scope/index',async()=>{
    for(const field of ['summary','retention_analysis','prompt']){
      await page.evaluate(field=>runField(field),field);
      const payload=(await page.evaluate(()=>jobState())).at(-1);
      assert.deepEqual([payload.kind,payload.scope,payload.field,payload.index],['field','segment',field,1]);
      await page.evaluate(()=>reply());assert.equal((await page.evaluate(()=>apiAnswer)).ok,true);
    }
  });
  await check('Whole-card API validates body and both sections atomically',async()=>{
    await page.evaluate(()=>runSegment());await page.evaluate(()=>reply());
    const answer=await page.evaluate(()=>apiAnswer);
    assert.equal(answer.ok,true);assert.deepEqual(answer.result.sections,{summary:'Rewritten summary',retention_analysis:'Retain face'});
    for(const patch of [{index:0},{target_scope:'timeline'},{field:'prompt'},{sections:{summary:'incomplete'}},{sections:{summary:'s',retention_analysis:'r',subject_definitions:'forbidden'}},{piece:'forbidden shared global'},{shots:[{index:0,body:'forbidden sibling'}]}]){
      await page.evaluate(()=>runSegment());await page.evaluate(patch=>reply(patch),patch);assert.equal((await page.evaluate(()=>apiAnswer)).ok,false);
    }
  });
  await check('Only explicit unchanged responses may return an empty field',async()=>{
    await page.evaluate(()=>runField('summary'));await page.evaluate(()=>reply({body:'',unchanged:true}));assert.equal((await page.evaluate(()=>apiAnswer)).ok,true);
    await page.evaluate(()=>runField('summary'));await page.evaluate(()=>reply({body:''}));assert.equal((await page.evaluate(()=>apiAnswer)).ok,false);
  });
  await check('Actual Editor applies all three outputs only to the selected card',async()=>{
    await page.evaluate(()=>makeEditor(1));const before=await page.evaluate(()=>editorSnapshot());
    await page.evaluate(()=>startEditor());await page.evaluate(()=>reply());await page.evaluate(()=>editorPending);
    const after=await page.evaluate(()=>editorSnapshot());assert.deepEqual(after.piece.segments[0],before.piece.segments[0]);
    assert.deepEqual(after.piece.segments[1].prompt_sections,before.piece.segments[1].prompt_sections);
    assert.deepEqual(after.piece.segments[1].refined.sections,{summary:'Rewritten summary',retention_analysis:'Retain face'});
    assert.deepEqual(after.piece.segments[1].refined.fields,['summary','retention_analysis','prompt']);
    assert.equal(after.piece.prompt,before.piece.prompt);assert.deepEqual(after.piece.subjects,before.piece.subjects);assert.equal(after.commits,1);
  });
  await check('Actual per-field Editor refinement changes only its selected overlay field',async()=>{
    for(const field of ['summary','retention_analysis','prompt']){
      await page.evaluate(()=>makeEditor(0));await page.evaluate(field=>startEditor(field),field);await page.evaluate(()=>reply());await page.evaluate(()=>editorPending);
      const after=await page.evaluate(()=>editorSnapshot()),rewrite=after.piece.segments[0].refined;
      assert.deepEqual(rewrite.fields,[field]);assert.equal(after.piece.segments[1].refined,undefined);
      if(field==='prompt'){assert.equal(rewrite.body,'Rewritten body');assert.deepEqual(rewrite.sections,{});}
      else {assert.equal(rewrite.body,undefined);assert.deepEqual(rewrite.sections,{[field]:'Rewritten body'});}
      const hosts=await page.evaluate(()=>Object.fromEntries(Object.entries(editor.refinePanel.fieldHosts).map(([key,host])=>[key,host.textContent])));
      assert.match(hosts[field],/Rewritten body/);
      for(const sibling of ['summary','retention_analysis','prompt'].filter(key=>key!==field))assert.equal(hosts[sibling],'');
    }
  });
  await check('Summary and retention rewrites render below only their own inputs and do not freeze Korean description',async()=>{
    await page.evaluate(()=>makeEditor(0));await page.evaluate(()=>startEditor('summary'));await page.evaluate(()=>reply({body:'The first person walks.'}));await page.evaluate(()=>editorPending);
    await page.evaluate(()=>{editor.state.prompt='첫 번째 인물이 이제 앉는다';editor.refinePanel.render();});
    const snap=await page.evaluate(()=>editorSnapshot());assert.equal(snap.piece.segments[0].refined.body,undefined);assert.equal(snap.piece.segments[0].prompt,'첫 번째 인물이 이제 앉는다');
    assert.match(await page.evaluate(()=>editor.refinePanel.fieldHosts.summary.textContent),/The first person walks/);
    assert.equal(await page.evaluate(()=>editor.refinePanel.fieldHosts.prompt.textContent),'');
    await page.evaluate(()=>startEditor('retention_analysis'));await page.evaluate(()=>reply({body:'Retain the first face.'}));await page.evaluate(()=>editorPending);
    assert.match(await page.evaluate(()=>editor.refinePanel.fieldHosts.retention_analysis.textContent),/Retain the first face/);
    await page.evaluate(()=>editor.refinePanel.clearField('summary'));
    const after=await page.evaluate(()=>editorSnapshot());assert.deepEqual(after.piece.segments[0].refined.fields,['retention_analysis']);assert.deepEqual(after.piece.segments[0].refined.sections,{retention_analysis:'Retain the first face.'});
  });
  await check('Refining card 2 then card 1 keeps every per-field and whole-card output on its owner',async()=>{
    for(const field of ['summary','retention_analysis','prompt','segment']){
      await page.evaluate(()=>makeEditor(1));await page.evaluate(field=>startEditor(field),field);await page.evaluate(()=>reply({body:'SECOND ENGLISH OUTPUT',sections:{summary:'SECOND ENGLISH SUMMARY',retention_analysis:'SECOND ENGLISH RULE'}}));await page.evaluate(()=>editorPending);
      const second=(await page.evaluate(()=>editorSnapshot())).piece.segments[1];
      await page.evaluate(()=>makeEditor(0,true));await page.evaluate(field=>startEditor(field),field);
      const request=(await page.evaluate(()=>jobState())).at(-1);assert.equal(request.index,0);assert.equal(request.field,field);assert.equal(request.data.segments[0].prompt,'첫 번째 인물이 걷는다');
      await page.evaluate(()=>reply({body:'FIRST ENGLISH OUTPUT',sections:{summary:'FIRST ENGLISH SUMMARY',retention_analysis:'FIRST ENGLISH RULE'}}));await page.evaluate(()=>editorPending);
      const after=await page.evaluate(()=>editorSnapshot());assert.deepEqual(after.piece.segments[1],second);assert.ok(!JSON.stringify(after.piece.segments[0]).includes('SECOND ENGLISH'));
    }
  });
  await check('A later field rewrite preserves earlier real description drafts including legacy whole-card records',async()=>{
    for(const legacy of [false,true]){
      await page.evaluate(()=>makeEditor(0));await page.evaluate(legacy=>{editor.state.refined={body:'FIRST REFINED DESCRIPTION',scope:'shot',enabled:true,sections:{summary:'Earlier summary'},...(legacy?{}:{fields:['prompt','summary']})};},legacy);
      await page.evaluate(()=>startEditor('retention_analysis'));await page.evaluate(()=>reply({body:'New retention rule'}));await page.evaluate(()=>editorPending);
      const draft=(await page.evaluate(()=>editorSnapshot())).piece.segments[0].refined;assert.equal(draft.body,'FIRST REFINED DESCRIPTION');assert.deepEqual(draft.fields,['prompt','summary','retention_analysis']);assert.equal(draft.sections.summary,'Earlier summary');
    }
  });
  await check('Field source snapshots survive serialization and retain independent stale state',async()=>{
    await page.evaluate(()=>makeEditor(0));await page.evaluate(()=>startEditor('summary'));await page.evaluate(()=>reply());await page.evaluate(()=>editorPending);
    assert.equal(await page.evaluate(()=>editor.refinePanel.stale),false);
    await page.evaluate(()=>{editor.state.prompt_sections.summary='수정한 새 요약';editor.state.refined=serializeRefined(editor.state.refined).refined;});
    assert.equal(await page.evaluate(()=>editor.refinePanel.stale),true);
    await page.evaluate(()=>startEditor('prompt'));await page.evaluate(()=>reply({body:'Updated description'}));await page.evaluate(()=>editorPending);
    assert.equal(await page.evaluate(()=>editor.refinePanel.stale),true);
    await page.evaluate(()=>editor.refinePanel.clearField('summary'));
    assert.equal(await page.evaluate(()=>editor.refinePanel.stale),false);
  });
  await check('Legacy retention source order matches the visible block editor without duplicate paragraphs',async()=>{
    const sources=await page.evaluate(()=>[refineSources({prompt:'retention_analysis:\nLEGACY\n\ndetailed_description:\nBODY',retention_blocks:[{type:'text',text:'MANUAL'}]}),refineSources({prompt:'retention_analysis:\nLEGACY\n\ndetailed_description:\nBODY',retention_blocks:[{type:'text',text:'LEGACY'},{type:'text',text:'MANUAL'}]})]);
    assert.equal(sources[0].prompt,'BODY');assert.equal(sources[0].retention_analysis,'LEGACY\n\nMANUAL');assert.deepEqual(sources[0],sources[1]);
  });
  await check('Actual late responses cannot overwrite changed, replaced or disconnected owners',async()=>{
    for(const action of ['edit','replace','disconnect','epoch','wrong-index']){
      await page.evaluate(()=>makeEditor(1));await page.evaluate(()=>startEditor());
      await page.evaluate(action=>{if(action==='edit')editor.state.prompt='USER EDIT';if(action==='replace')editor.state=structuredClone(editor.state);if(action==='disconnect')editor.root.remove();if(action==='epoch')editor.refineEpoch++;},action);
      const before=await page.evaluate(()=>editorSnapshot());await page.evaluate(action=>reply(action==='wrong-index'?{index:0}:{}),action);await page.evaluate(()=>editorPending);
      const after=await page.evaluate(()=>editorSnapshot());assert.deepEqual(after.piece,before.piece);assert.equal(after.commits,0);
    }
  });
  await check('Timeline Refine all applies every indexed card and shared field to the same owner',async()=>{
    await page.evaluate(()=>makeTimeline());await page.evaluate(()=>startTimeline());
    const request=(await page.evaluate(()=>jobState())).at(-1);assert.deepEqual([request.kind,request.scope,request.field],['field','timeline','all']);assert.equal(request.data.segments.length,2);
    await page.evaluate(()=>replyTimeline());await page.evaluate(()=>timelinePending);
    const after=await page.evaluate(()=>({state:timelineEditor.timeline,commits:timelineEditor.commits}));
    assert.equal(after.state.segments[0].refined.body,'FIRST ALL');assert.equal(after.state.segments[1].refined.body,'SECOND ALL');
    assert.deepEqual([after.state.prompt,after.state.soundscape,after.state.music],['GLOBAL ALL','SOUND ALL','MUSIC ALL']);assert.equal(after.commits,1);
  });
  await check('Refine all rejects late owner, field, order and modal changes without partial writes',async()=>{
    for(const action of ['edit','replace','reorder','close']){
      await page.evaluate(()=>makeTimeline());await page.evaluate(()=>startTimeline());
      await page.evaluate(action=>{if(action==='edit')timelineEditor.timeline.segments[0].prompt='USER EDIT';if(action==='replace')timelineEditor.timeline=structuredClone(timelineEditor.timeline);if(action==='reorder')timelineEditor.timeline.segments.reverse();if(action==='close')timelineEditor.modal.remove();},action);
      const before=await page.evaluate(()=>structuredClone(timelineEditor.timeline));await page.evaluate(()=>replyTimeline());await page.evaluate(()=>timelinePending);
      assert.deepEqual(await page.evaluate(()=>timelineEditor.timeline),before);assert.equal(await page.evaluate(()=>timelineEditor.commits),0);
    }
  });
  await check('Malformed Refine all indices are rejected before any card is changed',async()=>{
    for(const shots of [[{index:0,body:'valid'},{index:8,body:'invalid'}],[{index:0,body:'first'},{index:0,body:'duplicate'}],[{index:0,body:{bad:true}}]]){
      await page.evaluate(()=>makeTimeline());const before=await page.evaluate(()=>structuredClone(timelineEditor.timeline));await page.evaluate(()=>startTimeline());
      await page.evaluate(shots=>replyTimeline({shots}),shots);await page.evaluate(()=>timelinePending);
      assert.deepEqual(await page.evaluate(()=>timelineEditor.timeline),before);assert.match(await page.evaluate(()=>timelineEditor.refineError),/invalid result/);
    }
  });
  await check('Structured Refine all rejects missing scope, fields, sections and incomplete card coverage atomically',async()=>{
    for(const patch of [{scope:'field'},{field:'segment'},{target_scope:'segment'},{piece:{}},{music:null},{soundscape:[]},{sections:{summary:'old global section'}},{shots:[]},{shots:[{index:0,body:'One',sections:{summary:'Summary',retention_analysis:'Rule'},fields:['prompt','summary','retention_analysis']}]},{shots:[{index:0,body:'One',sections:{summary:'Summary'},fields:['prompt']}]}]){
      await page.evaluate(()=>makeTimeline());const before=await page.evaluate(()=>structuredClone(timelineEditor.timeline));await page.evaluate(()=>startTimeline());await page.evaluate(patch=>replyTimeline(patch),patch);await page.evaluate(()=>timelinePending);
      assert.deepEqual(await page.evaluate(()=>timelineEditor.timeline),before);assert.match(await page.evaluate(()=>timelineEditor.refineError),/invalid result/);
    }
  });
  await check('Strict Refine all replaces old whole-pass summary metadata while preserving original undo sources',async()=>{
    await page.evaluate(()=>{makeTimeline();timelineEditor.timeline.refined={sections:{summary:'OLD MERGED SUMMARY',retention_analysis:'OLD MERGED RULE'},replaced:{prompt:'ORIGINAL GLOBAL',soundscape:'ORIGINAL SOUND',music:'ORIGINAL MUSIC'}};});
    await page.evaluate(()=>startTimeline());await page.evaluate(()=>replyTimeline());await page.evaluate(()=>timelinePending);
    assert.deepEqual(await page.evaluate(()=>timelineEditor.timeline.refined),{replaced:{prompt:'ORIGINAL GLOBAL',soundscape:'ORIGINAL SOUND',music:'ORIGINAL MUSIC'}});
  });
  await check('Non-structured families keep their original all-timeline request and result shape',async()=>{
    await page.evaluate(()=>{makeTimeline();timelineEditor.timeline.family='ltx';});await page.evaluate(()=>startTimeline());assert.equal((await page.evaluate(()=>jobState())).at(-1).kind,'timeline');
    await page.evaluate(()=>replyTimeline({shots:[{index:0,body:'LTX one'},{index:1,body:'LTX two'}]}));await page.evaluate(()=>timelinePending);
    assert.equal(await page.evaluate(()=>timelineEditor.timeline.segments[0].refined.body),'LTX one');
  });
  await check('Refined bodies and sections use actual PromptBox tag recognition',async()=>{
    await page.evaluate(()=>makePanel());const snapshot=await page.evaluate(()=>panelSnapshot());
    assert.equal(await page.locator('.mmc-refined textarea').count(),0);
    assert.deepEqual(snapshot.boxes.map(box=>box.key),['body','section:summary','section:retention_analysis']);
    assert.deepEqual(snapshot.boxes[0].tags,[{handle:'anna',missing:false},{handle:'ref-1',missing:false},{handle:'ref-9',missing:true}]);
    assert.ok(snapshot.boxes.slice(1).every(box=>box.tags[0].handle==='anna'));
    assert.equal(snapshot.state.prompt,'ORIGINAL RAW PROMPT');
  });
  await check('Reconnect matching references clears warning without changing text',async()=>{
    const before=await page.evaluate(()=>panelSnapshot());
    await page.evaluate(()=>{panelState.assets.push({handle:'ref-9',kind:'image',filename:'not-opened-either.png'});panel.syncBoxes();});
    const after=await page.evaluate(()=>panelSnapshot());assert.equal(after.boxes[0].text,before.boxes[0].text);assert.equal(after.boxes[0].tags.find(tag=>tag.handle==='ref-9').missing,false);
  });
  await check('Rich text preserves literal selection/copy and scoped writes',async()=>{
    const before=await page.evaluate(()=>panelSnapshot());
    const copied=await page.evaluate(()=>{const box=panel.promptBoxes.get('body');const range=document.createRange();range.selectNodeContents(box.root);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return selection.toString();});
    assert.equal(copied.replace(/\u200b/g,''),before.boxes[0].text);
    await page.evaluate(()=>{const box=panel.promptBoxes.get('section:summary');box.setValue('New @anna summary @missing');box.hooks.onInput(box.getValue());});
    const after=await page.evaluate(()=>panelSnapshot());assert.equal(after.state.refined.sections.summary,'New @anna summary @missing');assert.equal(after.state.refined.body,before.state.refined.body);assert.equal(after.state.prompt,before.state.prompt);assert.equal(after.state.soundscape,before.state.soundscape);assert.equal(after.commits,1);
  });
  await check('Card apply preserves definitions and commits the supplied section snapshot together',async()=>{
    await page.evaluate(()=>{panelState.refined.sections.subject_definitions='Existing definition';panel.apply({body:'ignored global',piece:'ignored',soundscape:'ignored'},{body:'New card body',sections:{subject_definitions:'Existing definition',summary:'New card summary',retention_analysis:'New manual rules'}});});
    const after=await page.evaluate(()=>panelSnapshot());assert.deepEqual(after.state.refined.sections,{subject_definitions:'Existing definition',summary:'New card summary',retention_analysis:'New manual rules'});assert.equal(after.state.refined.body,'New card body');assert.equal(after.state.prompt,'ORIGINAL RAW PROMPT');assert.equal(after.state.soundscape,'original audio');
    await page.evaluate(()=>panel.destroy());assert.equal(await page.evaluate(()=>panel.promptBoxes.size),0);
  });
  assert.deepEqual(errors,[]);assert.equal(network,0);
  console.log(JSON.stringify({passed:results.length,networkRequests:network,pageErrors:errors,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
