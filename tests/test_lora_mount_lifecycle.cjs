// Real installed/source LoRA constructor, mount and teardown in a RAM-only DOM.
// File inventory and startup rendering are not needed to expose mount failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/creator/loras.js'), 'utf8');
const production = source.slice(source.indexOf('export function openLoras(')).replace(/^export /gm, '');
let checks = 0;

function fixture(failAt = '') {
  const nodes = [], observers = [], thumbnails = [], active = new Set(), listeners = new Map();
  const failure = new Error('fixture mount failure: ' + failAt);
  let unmounted = 0, targetsFor = null, started = 0;
  const document = {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
  const S = {
    DEFAULT_VIDEO_FAMILY: 'h3', routing: family => family === 'h3',
    checkpointsOf: family => family === 'h3' ? ['fl2va', 'ref2va'] : [],
    checkpointsFor: () => ['ref2va'], findLora: () => null,
    pieceFamily: piece => piece.family,
    timelineCheckpoints: piece => { targetsFor = piece; return piece.liveCheckpoints; },
  };
  function el(tag, attrs = {}, children = []) {
    if (failAt === 'dom' && attrs.class === 'mmc-modal-head') throw failure;
    const node = {tag, attrs, children, style: {}, classList: {add() {}, remove() {}, toggle() {}},
      focus() {}, isConnected: true};
    nodes.push(node); return node;
  }
  const context = vm.createContext({S, document, window: {}, el,
    readViewPrefs: () => ({}), patchViewPrefs() {}, baseName: name => name,
    t: text => text, setTimeout: () => 1, clearTimeout() {},
    LoraThumbnails: class { constructor() {this.closed = false; thumbnails.push(this);} close() {this.closed = true;} },
    ResizeObserver: class { constructor() {this.closed = false; observers.push(this);} disconnect() {this.closed = true;} },
    mountOverlay(overlay) {
      if (failAt === 'overlay') throw failure;
      active.add(overlay);
      return () => { active.delete(overlay); unmounted++; };
    },
  });
  vm.runInContext(production + `
    globalThis.managerClass = LoraManager;
    LoraManager.prototype.renderFoot = function() {
      if (${JSON.stringify(failAt)} === 'after-overlay') throw injectedFailure;
    };
    LoraManager.prototype.renderAdded = function() {};
    LoraManager.prototype.setTab = function(tab) { this.tab = tab; };
    LoraManager.prototype.start = function() { markStarted(); };
  `, vm.createContext(Object.assign(context, {injectedFailure: failure, markStarted: () => {started++;}})));
  return {context, failure, nodes, observers, thumbnails, active,
    get started() { return started; }, get targetsFor() { return targetsFor; },
    get unmounted() { return unmounted; },
    get listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
    closeButton: () => nodes.find(node => node.attrs.class === 'mmc-close'),
  };
}

(async () => {
  const contexts = [
    {name: 'global', options: {unified: true, contextLabel: 'Global LoRAs · all segments'}},
    {name: 'segment', options: {unified: true, contextLabel: 'Segment LoRAs · this card'}},
    {name: 'prestage', options: {family: 'still', checkpointModes: false, scope: 'prestage'}},
    {name: 'swap', options: {swapping: 'before.safetensors', contextLabel: 'Swap context'}},
  ];
  for (const {name, options} of contexts) {
    const f = fixture();
    let commits = 0;
    const state = {loras: [], prompt: 'Keep this source untouched'};
    const before = JSON.stringify(state);
    const opened = f.context.openLoras({state, onChange: () => {commits++;}, ...options});
    assert.equal(f.active.size, 1, name + ': real mount reaches its overlay'); checks++;
    assert.equal(f.listenerCount, 3, name + ': listeners are installed once'); checks++;
    assert.equal(f.started, 1, name + ': startup is reached'); checks++;
    if (options.contextLabel) {
      assert.ok(f.nodes.some(node => node.attrs.text === options.contextLabel), name + ': context label is visible'); checks++;
    }
    f.closeButton().attrs.onclick();
    await opened;
    assert.equal(f.active.size, 0, name + ': closing removes the overlay'); checks++;
    assert.equal(f.listenerCount, 0, name + ': closing removes listeners'); checks++;
    assert.ok(f.observers.every(observer => observer.closed), name + ': closing disconnects observers'); checks++;
    assert.ok(f.thumbnails.every(item => item.closed), name + ': closing stops thumbnails'); checks++;
    assert.equal(JSON.stringify(state), before, name + ': opening does not edit user inputs'); checks++;
    assert.equal(commits, 0, name + ': opening does not emit a settings commit'); checks++;
  }

  for (const failure of ['dom', 'overlay', 'after-overlay']) {
    const f = fixture(failure);
    await assert.rejects(f.context.openLoras({state: {loras: []}, unified: true}), error => error === f.failure);
    checks++;
    assert.equal(f.listenerCount, 0, failure + ': failure removes every listener'); checks++;
    assert.equal(f.active.size, 0, failure + ': failure leaves no overlay'); checks++;
    assert.ok(f.observers.every(observer => observer.closed), failure + ': failure disconnects observers'); checks++;
    assert.ok(f.thumbnails.every(item => item.closed), failure + ': failure stops thumbnail observers'); checks++;
    assert.equal(f.unmounted, failure === 'after-overlay' ? 1 : 0, failure + ': unmount only when mounted'); checks++;
  }

  const f = fixture();
  const mixedPiece = {family: 'h3', loras: [], segments: [{}, {}],
    liveCheckpoints: ['fl2va', 'ref2va'], turbo: {lora: 'distill.safetensors'}};
  const options = f.context.globalLoraOptions(mixedPiece);
  assert.equal(options.state, mixedPiece, 'global helper edits the actual piece'); checks++;
  assert.equal(f.targetsFor, mixedPiece, 'global helper asks for the timeline routes'); checks++;
  assert.deepEqual(options.targets, ['fl2va', 'ref2va'], 'global helper keeps both mixed checkpoints'); checks++;
  assert.equal(options.turbo, 'distill.safetensors', 'global helper preserves turbo ownership'); checks++;
  assert.equal(options.contextLabel, 'Global LoRAs · all segments', 'global helper sets the global scope label'); checks++;
  assert.equal(options.unified, true, 'global helper uses the same unified manager'); checks++;
  assert.equal(options.scope, 'piece', 'global helper uses piece presets'); checks++;
  assert.equal(options.family, 'h3', 'global helper preserves the current family'); checks++;
  const opened = f.context.openLoras(options);
  f.closeButton().attrs.onclick(); await opened;
  assert.equal(f.context.globalLoraOptions({family: 'still', liveCheckpoints: []}).turbo, null,
    'pieces without turbo do not invent a distillation owner'); checks++;
  console.log(JSON.stringify({suite: 'LoRA mount lifecycle', status: 'PASS', assertions: checks,
    contexts: contexts.map(item => item.name), failurePoints: ['dom', 'overlay', 'after-overlay']}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
