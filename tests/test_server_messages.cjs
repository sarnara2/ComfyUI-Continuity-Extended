// Actual locale lookup + both compiled-prompt rendering paths, using a RAM DOM.
// No ComfyUI process, browser, user workflow, or GPU job is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');

const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '..');
const webRoot = path.join(sourceRoot, 'web', 'creator');
const read = name => fs.readFileSync(path.join(webRoot, name), 'utf8');
const strip = source => source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
let passed = 0;
const check = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };

class RamNode {
  constructor(tag = '', text = null) {
    this.tagName = tag.toUpperCase(); this.nodeType = text === null ? 1 : 3;
    this._text = text ?? ''; this.children = []; this.attrs = {}; this.isConnected = true;
    this.style = {}; this.hidden = false; this.events = {};
    this.classList = {add() {}, remove() {}, toggle() {}};
  }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) {
    for (const node of nodes.flat()) {
      if (node == null || node === false) continue;
      this.children.push(node instanceof RamNode ? node : new RamNode('', String(node)));
    }
  }
  replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(name, fn) { this.events[name] = fn; }
  focus() {}
}
function el(tag, attrs = {}, children = []) {
  const node = new RamNode(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.events[key.slice(2)] = value;
    else node[key] = value;
  }
  node.append(children); return node;
}
function find(node, className) {
  if ((node.class ?? '').split(' ').includes(className)) return node;
  for (const child of node.children ?? []) {
    const found = find(child, className); if (found) return found;
  }
  return null;
}

(async () => {
  const {localizeDiagnostic} = await import(pathToFileURL(path.join(webRoot, 'server-messages.js')));
  const {t} = await import(pathToFileURL(path.join(webRoot, 'i18n.js')));
  let locale = 'en';
  globalThis.app = {extensionManager: {setting: {get: () => locale}}};
  const missing = '@여자_2 walks on here, and their reference files are not attached to this shot — enable or attach one of them again, or describe what they look like, or take the name out of this shot\'s prompt';
  const missingKey = "{subject} is mentioned in this segment, but its reference files are not attached. Enable or attach a reference, describe the subject, or remove the handle from this segment's prompt.";
  const emptySubject = '@locale_check: a subject needs something behind it — a picture or a clip to be built out of, a description of what they look like, a feature of theirs, a LoRA with a trigger word, or the person they stand in for';
  const emptySubjectKey = '{subject} has no reference or description yet. Attach a picture or video, describe the subject, add a feature or a LoRA trigger word, or select the person to replace.';
  const warning = 'The usage rule for @여자_2 mentions @ref-5, but @ref-5 is not cited in this shot. Cite @ref-5 in a segment field to send that reference.';
  const warningKey = 'The usage rule for {subject} mentions {handle}, but this segment does not use that reference. Add {handle} to a segment field to send it.';
  const cases = [
    [emptySubject, emptySubjectKey, {subject:'@locale_check'}],
    [missing, missingKey, {subject:'@여자_2'}],
    ['@subject walks on here, and every picture they are built out of waits for a word this shot does not say (red coat, hat) — write one of them, or take the words off one of their pictures, or describe them', "{subject}'s reference files require a trigger word ({words}) that is missing from this segment. Add a trigger word, remove the file's trigger condition, or describe the subject.", {subject:'@subject', words:'red coat, hat'}],
    ['@subject is sent as words alone to this family, and there are none — describe them, or send their pictures', '{subject} is sent as text only, but has no description. Describe the subject or send its images.', {subject:'@subject'}],
    ['@subject is both a subject and an attached file — one `@` means one thing, so rename one of them', '{handle} is used for both a cast member and a reference file. Rename one handle.', {handle:'@subject'}],
    ["@subject is also a file's handle — one @ means one thing", '{handle} is used for both a cast member and a reference file. Rename one handle.', {handle:'@subject'}],
    ['two subjects are both called @여자_2', 'Two cast members share the handle {handle}. Rename one of them.', {handle:'@여자_2'}],
    ['@subject is built out of @other, which is another subject — a subject is built out of files', '{subject} uses {source}, which is another cast member. Choose a reference file instead.', {subject:'@subject', source:'@other'}],
    ['@subject is built out of @ref-5, which is not attached to this generation', '{subject} uses {source}, but that reference file is not attached to this generation.', {subject:'@subject', source:'@ref-5'}],
    ['built out of @ref-1, @ref-5, which is not attached here', 'References {handles} are not attached here. Attach them or remove their cast links.', {handles:'@ref-1, @ref-5'}],
    ['@subject is built out of @ref-1, which is a first frame — a keyframe is a fact about one moment of the target video, not a reference somebody is made of', '{subject} uses {source} as a reference, but its role is {role}. Choose a reference file instead of a keyframe.', {subject:'@subject', source:'@ref-1', role:'first frame'}],
    ["@subject's voice is @ref-1, which is a image — a voice reference is audio", "{subject}'s voice uses {source}, but its type is {kind}. Choose an audio reference.", {subject:'@subject', source:'@ref-1', kind:'image'}],
    ['summary references @ref-5 but no such asset is attached', '{field} references {handles}, but those reference files are not attached.', {field:'summary', handles:'@ref-5'}],
    ['detailed_description references @ref-1, @ref-5 but they are muted — unmute them to send the pictures, or take the mentions out to render without them', 'References {handles} are muted. Enable them to send the files, or remove their handles from {field}.', {field:'detailed_description', handles:'@ref-1, @ref-5'}],
    ['summary references @ref-5 but it is muted — unmute it to send the picture, or take the mention out to render without it', 'References {handles} are muted. Enable them to send the files, or remove their handles from {field}.', {field:'summary', handles:'@ref-5'}],
    ['@ref-1: no filename', '{handle} has no reference filename.', {handle:'@ref-1'}],
    ["@ref-1: ref_size must be 'match' or 'max'", '{handle}: reference size must be match or max.', {handle:'@ref-1'}],
    ['\'folder/<사진> "A".png\' is not in the input folder any more', '{filename} is no longer in the input folder.', {filename:'\'folder/<사진> "A".png\''}],
    [warning, warningKey, {subject:'@여자_2', handle:'@ref-5'}],
    ['Replacement reference @ref-1 was captured from an earlier file attached as @video-2. Re-capture it to identify the target in the current video; its original capture is unchanged.', 'Replacement reference {handle} was captured from an earlier file at {source}. Capture it again to identify the target in the current video.', {handle:'@ref-1', source:'@video-2'}],
    ['The source video for replacement reference @ref-1 is not attached here. Attach the source or re-capture the replacement target.', 'The source video for replacement reference {handle} is not attached here. Attach the source or capture the replacement target again.', {handle:'@ref-1'}],
    ['Replacement reference @ref-1 is outside the current trim of @video-2. Re-capture a frame inside the selected portion.', 'Replacement reference {handle} is outside the current trim of {source}. Capture a frame inside the selected range.', {handle:'@ref-1', source:'@video-2'}],
  ];
  const staticMessages = [
    'creator_data must be a JSON object',
    'final-prompt drafts must name existing generation passes',
    'final-prompt draft needs the original compiled reference binding',
    'final-prompt draft must name stable card identities',
    'final-prompt draft pass changed; enable Force edit again for the current pass',
    'final-prompt draft must contain 1 to 200000 characters',
    'final-prompt draft references changed; reopen What the model reads and enable Force edit again',
  ];
  for (locale of ['en', 'ko', 'ja', 'zh', 'zh-TW']) {
    check(`${locale}: maintained dynamic diagnostic templates and literal parameters`, () => {
      for (const [raw, key, params] of cases) {
        const translated = Object.fromEntries(Object.entries(params).map(([name, value]) => [name,
          ['kind', 'role'].includes(name) ? t(value) : value]));
        const expected = t(key, translated), actual = localizeDiagnostic(raw);
        assert.equal(actual, expected, raw);
        if (locale !== 'en') assert.notEqual(t(key), key, `missing translation: ${key}`);
        for (const value of Object.values(translated)) assert.ok(actual.includes(value), `lost ${value}`);
      }
      assert.equal(localizeDiagnostic('@subject takes its motion from @ref-1, which is not attached to this generation'), t('{subject} gets its {purpose} from {source}, but that reference is not attached to this generation.', {subject:'@subject', purpose:t('motion'), source:'@ref-1'}));
      assert.equal(localizeDiagnostic('@subject takes its place from @ref-1, which is not a reference picture or video'), t('{subject} gets its {purpose} from {source}. Choose {wanted}.', {subject:'@subject', purpose:t('place'), source:'@ref-1', wanted:t('a reference picture or video')}));
      assert.equal(localizeDiagnostic("@ref-1 is this shot's start frame — a moment of the video being made, not a reference they are made of"), t("{handle} is this segment's {frame} frame. Use an ordinary reference file for the cast member.", {handle:'@ref-1', frame:t('start')}));
    });
    check(`${locale}: fixed diagnostics and bounded nested segment scope`, () => {
      for (const raw of staticMessages) {
        assert.equal(localizeDiagnostic(raw), t(raw));
        if (locale !== 'en') assert.notEqual(t(raw), raw, raw);
      }
      assert.equal(localizeDiagnostic(`segment 2: shot 1: ${missing}`), t('segment {number}: {message}', {number:'2', message:t('shot {number}: {message}', {number:'1', message:t(missingKey, {subject:'@여자_2'})})}));
      assert.doesNotThrow(() => localizeDiagnostic('segment 1: '.repeat(500) + 'unknown'));
    });
  }
  check('unknown technical errors, null and Error objects retain their details', () => {
    assert.equal(localizeDiagnostic(null), '');
    const raw = 'ThirdPartyError: EINVAL H:\\사진\\<image>.png "quoted"';
    assert.equal(localizeDiagnostic(raw), raw);
    assert.equal(localizeDiagnostic(new Error(raw)), raw);
    assert.equal(localizeDiagnostic('prefix ' + missing), 'prefix ' + missing);
  });

  let overlay;
  const context = vm.createContext({console, t, localizeDiagnostic,
    Node: {TEXT_NODE:3}, document: {activeElement:null, createTextNode:text=>new RamNode('', text)},
    window: {}, el, icon:()=>new RamNode('svg'), svg:()=>new RamNode('svg'),
    tagIndex:()=>0, mountOverlay:root=>{overlay=root;return ()=>{};},
    requestAnimationFrame:fn=>fn(), navigator:{clipboard:{writeText:async()=>{}}},
    createDisclosure:()=>{}, clearButton:()=>{}, refineButton:()=>{}, openTaskPresets:()=>{},
    openCompiledTagPreview:()=>()=>{}, setTimeout, clearTimeout,
  });
  vm.runInContext(strip(read('dialogue.js')) + '\n' + strip(read('dialogue-view.js')), context);
  vm.runInContext(strip(read('compiled-tags.js')) + '\nObject.assign(globalThis,{compiledTagNodes});', context);
  vm.runInContext(strip(read('prompt.js')) + '\nObject.assign(globalThis,{PromptBox});', context);
  vm.runInContext(strip(read('prompt-sections.js')) + '\nObject.assign(globalThis,{openCompiledPrompt});', context);
  for (locale of ['ko', 'ja', 'zh', 'en']) {
    const host = {compiledChildClose:null, compiledRevision:0,
      compiled:new RamNode('div'), compiledStatus:new RamNode('span'), compiledDoc:new RamNode('div')};
    check(`${locale}: actual PromptBox error/message/note rendering`, () => {
      context.PromptBox.prototype.drawCompiled.call(host, {problem:emptySubject});
      assert.equal(host.compiledDoc.textContent, localizeDiagnostic(emptySubject));
      context.PromptBox.prototype.drawCompiled.call(host, {problem:missing});
      assert.equal(host.compiledDoc.textContent, localizeDiagnostic(missing));
      context.PromptBox.prototype.drawCompiled.call(host, {message:warning, note:staticMessages[0]});
      assert.equal(host.compiledDoc.textContent, localizeDiagnostic(warning));
      assert.equal(host.compiledStatus.textContent, localizeDiagnostic(staticMessages[0]));
    });
    check(`${locale}: actual PromptBox preserves diagnostic-like model prose`, () => {
      const source = {text:`summary: ${missing}\n\ndetailed_description: @subject walks.`};
      const original = JSON.stringify(source);
      context.PromptBox.prototype.drawCompiled.call(host, source);
      assert.equal(find(host.compiledDoc, 'mmc-compiled-value').textContent, missing);
      assert.equal(JSON.stringify(source), original);
    });
    let answer = {problem:missing};
    const view = context.openCompiledPrompt(async()=>answer);
    await new Promise(resolve=>setImmediate(resolve));
    check(`${locale}: actual final-prompt modal error rendering`, () => {
      assert.equal(find(overlay, 'mmc-final-prompt-doc').textContent, localizeDiagnostic(missing));
    });
    answer = {problem:emptySubject}; await view.refresh();
    check(`${locale}: actual final-prompt modal empty Cast diagnostic localized`, () => {
      assert.equal(find(overlay, 'mmc-final-prompt-doc').textContent, t(emptySubjectKey, {subject:'@locale_check'}));
      assert.equal(answer.problem, emptySubject);
    });
    // A literal prompt can contain diagnostic-like sentences. It is model
    // content, so neither renderer may translate it or change a single byte.
    const literal = `subject_definitions:\n@subject <Picture 1> is a person.\n\nsummary: ${missing}\n\ndetailed_description:  Walk.\n\n`;
    answer = {text:literal, warnings:[warning], note:staticMessages[0], loras:[{name:'private-test-lora.safetensors',strength:0.5}],
      scope:'segment 2: ' + staticMessages[0], override:{enabled:false, set:()=>true}};
    const original = JSON.stringify(answer);
    await view.refresh();
    check(`${locale}: final model prompt unchanged, warnings/note localized and removed guidance absent`, () => {
      assert.equal(find(overlay, 'mmc-final-prompt-doc').textContent, literal);
      assert.equal(find(overlay, 'mmc-final-prompt-warnings').textContent, localizeDiagnostic(warning));
      assert.equal(find(overlay, 'mmc-final-prompt-status').textContent, localizeDiagnostic(staticMessages[0]));
      assert.equal(find(overlay, 'mmc-final-prompt-guidance'), null);
      assert.ok(!overlay.textContent.includes('private-test-lora.safetensors'));
      assert.equal(JSON.stringify(answer), original);
    });
    answer = {message:warning}; await view.refresh();
    check(`${locale}: actual final-prompt modal informational messages localized`, () => {
      assert.equal(find(overlay, 'mmc-final-prompt-doc').textContent, localizeDiagnostic(warning));
    });
    view.close();
  }
  check('raw API problem and final-draft recovery protocol stay untouched', () => {
    const api = read('api.js'), timeline = read('timeline.js');
    assert.ok(!api.includes('localizeDiagnostic'));
    assert.ok(timeline.includes('/final-prompt draft/i.test(answer.problem)'));
    assert.equal(staticMessages[6], 'final-prompt draft references changed; reopen What the model reads and enable Force edit again');
  });
  console.log(JSON.stringify({passed, scope:'actual i18n and RAM rendering; no live browser or generation'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
