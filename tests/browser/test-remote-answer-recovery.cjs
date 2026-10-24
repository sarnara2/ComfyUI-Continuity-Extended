// The complete current queue module in a RAM-only host. Fake time, HTTP and
// websocket events; no browser, server, model, GPU or external network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const source = fs.readFileSync(path.join(root, 'web/creator/queue.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function clock() {
  let now = 0, next = 0;
  const tasks = new Map();
  return {
    setTimeout(fn, delay = 0) { const id = ++next; tasks.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    count() { return tasks.size; },
    async advance(ms) {
      const end = now + ms;
      await flush();
      while (true) {
        const due = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        tasks.delete(due[0]); now = due[1].at; due[1].fn(); await flush();
      }
      now = end; await flush();
    },
  };
}
const response = (answer, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => answer });
function fixture({ lookup = () => response({ status: 'pending' }) } = {}) {
  const timer = clock(), listeners = new Map(), requests = [], originals = [], acknowledgements = [];
  let poll = 0;
  const api = {
    clientId: 'mock-browser',
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fetchApi(route, options) {
      const request = { route, ...options, body: JSON.parse(options.body), time: poll };
      requests.push(request);
      if (route === '/continuity/answers') {
        if (request.body.ack) { acknowledgements.push(request); return Promise.resolve(response({ status: 'acknowledged' })); }
        return Promise.resolve().then(() => lookup(request, ++poll));
      }
      return new Promise((resolve, reject) => originals.push({ ...request, reply: (answer, status) => resolve(response(answer, status)), reject }));
    },
  };
  const forbiddenStorage = new Proxy({}, { get() { throw new Error('Recovery must not touch saved browser storage'); }, set() { throw new Error('Recovery must not save tokens'); } });
  const context = vm.createContext({ console, Promise, AbortController, api, app: {},
    localStorage: forbiddenStorage, sessionStorage: forbiddenStorage,
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
    t: (text, values = {}) => text.replace(/\{([^}]+)\}/g, (_, key) => values[key] ?? `{${key}}`),
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\nthis.subject = {run, queueState, busy};', context);
  const count = () => [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0);
  const baseline = count();
  return { ...context.subject, timer, originals, acknowledgements, requests,
    polls: () => requests.filter(x => x.route === '/continuity/answers' && !x.body.ack),
    say(type, detail = {}) { for (const fn of [...(listeners.get(type) || [])]) fn({ detail }); },
    count: () => count() - baseline,
    assertClean() { assert.equal(count() - baseline, 0, 'Per-call listeners removed'); assert.equal(timer.count(), 0, 'Recovery timers removed'); },
  };
}
function observe(promise) {
  const state = { pending: true };
  promise.then(value => { delete state.pending; state.value = value; }, error => {
    delete state.pending; state.error = error.message;
    if (error.cancelled === true) state.cancelled = true;
  });
  return state;
}
const ticket = id => ({ answer_id: id, answer_token: `secret-${id}` });
const complete = (id, result) => ({ status: 'complete', prompt_id: id, result });
const results = [];
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log('PASS ' + name); }

(async () => {
  await check('Old immediate result is unchanged and creates no recovery work', async () => {
    const f = fixture(), p = f.run('/continuity/refine', {}), state = observe(p);
    f.originals[0].reply({ result: { body: 'direct' } }); await flush();
    assert.deepEqual(state, { value: { body: 'direct' } }); assert.equal(f.polls().length, 0); assert.equal(f.acknowledgements.length, 0); f.assertClean();
  });
  await check('Local queued work retains onQueued and exact token progress without recovery requests', async () => {
    const f = fixture(); let queued, progress;
    const p = f.run('/continuity/refine', {}, { onQueued: id => { queued = id; }, onProgress: (...args) => { progress = args; } });
    const state = observe(p); f.originals[0].reply({ prompt_id: 'local-1' }); await flush();
    f.say('progress_state', { prompt_id: 'local-1', nodes: { tokens: { value: 17, max: 64 } } });
    f.say('executed', { prompt_id: 'local-1', output: { continuity: ['local'] } }); await flush();
    assert.deepEqual(state, { value: 'local' }); assert.equal(queued, 'local-1'); assert.deepEqual(progress, [17 / 64, 17, 64]);
    assert.equal(f.polls().length, 0); assert.equal(f.acknowledgements.length, 0); f.assertClean();
  });
  await check('Upstream answer_id-only backend stays supported without polling a missing recovery API', async () => {
    const f = fixture(), state = observe(f.run('/continuity/chat/turn', {})); f.originals[0].reply({ answer_id: 'old-remote' }); await flush();
    f.say('reconnected'); await f.timer.advance(60000); assert.deepEqual(state, { pending: true }); assert.equal(f.polls().length, 0);
    f.say('mmc_answer', { prompt_id: 'old-remote', result: { say: 'hello' } }); await flush();
    assert.deepEqual(state, { value: { say: 'hello' } }); assert.equal(f.acknowledgements.length, 0); f.assertClean();
  });
  await check('A remote answer before its HTTP ticket is replayed once and acknowledged once', async () => {
    const f = fixture(), state = observe(f.run('/continuity/refine', {}));
    f.say('mmc_answer', { prompt_id: 'early', result: 'early body' }); f.say('mmc_answer', { prompt_id: 'early', result: 'duplicate' });
    f.originals[0].reply(ticket('early')); await flush(); assert.deepEqual(state, { value: 'early body' });
    assert.equal(f.acknowledgements.length, 1); assert.equal(f.polls().length, 0); f.assertClean();
  });
  await check('Ordinary websocket completion cancels recovery and never calls onQueued', async () => {
    const f = fixture(); let queued = 0;
    const state = observe(f.run('/continuity/chat/turn', {}, { onQueued: () => queued++ })); f.originals[0].reply(ticket('late')); await flush();
    f.say('mmc_answer', { prompt_id: 'late', result: 'chat turn' }); await flush(); await f.timer.advance(60000);
    assert.deepEqual(state, { value: 'chat turn' }); assert.equal(queued, 0); assert.equal(f.polls().length, 0); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('A missed websocket completion is recovered by periodic lookup with no reconnect event', async () => {
    const f = fixture({ lookup: (_, count) => response(count === 1 ? { status: 'pending' } : complete('poll', 'saved result')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('poll')); await flush();
    await f.timer.advance(1999); assert.equal(f.polls().length, 0); await f.timer.advance(1); assert.deepEqual(state, { pending: true });
    await f.timer.advance(2000); assert.deepEqual(state, { value: 'saved result' }); assert.equal(f.originals.length, 1); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('Reconnection immediately retrieves the same saved answer without re-running remote work', async () => {
    const f = fixture({ lookup: () => response(complete('reconnect', { body: 'hidden completion' })) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('reconnect')); await flush();
    f.say('reconnected'); await flush(); assert.deepEqual(state, { value: { body: 'hidden completion' } });
    assert.equal(f.originals.length, 1); assert.equal(f.polls().length, 1); assert.deepEqual(f.polls()[0].body, ticket('reconnect')); f.assertClean();
  });
  await check('Saved remote errors recover through the existing error path and acknowledge the answer', async () => {
    const f = fixture({ lookup: () => response({ status: 'complete', prompt_id: 'error', error: 'remote refused this request' }) });
    const state = observe(f.run('/continuity/chat/turn', {})); f.originals[0].reply(ticket('error')); await flush(); f.say('reconnected'); await flush();
    assert.deepEqual(state, { error: 'remote refused this request' }); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  for (const delivery of ['websocket', 'lookup']) await check(`Remote task cancellation keeps cancellation semantics through ${delivery}`, async () => {
    const cancelled = { status: 'complete', prompt_id: 'cancelled', error: 'cancelled', cancelled: true };
    const f = fixture({ lookup: () => response(cancelled) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('cancelled')); await flush();
    if (delivery === 'websocket') f.say('mmc_answer', cancelled);
    else f.say('reconnected');
    await flush(); assert.deepEqual(state, { error: 'cancelled', cancelled: true }); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('Transient HTTP failures back off and later recover without a duplicate generation request', async () => {
    const f = fixture({ lookup: (_, count) => count < 4 ? response({}, 503) : response(complete('backoff', 'returned')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('backoff')); await flush();
    await f.timer.advance(2000); assert.equal(f.polls().length, 1); await f.timer.advance(3999); assert.equal(f.polls().length, 1);
    await f.timer.advance(1); assert.equal(f.polls().length, 2); await f.timer.advance(8000); assert.equal(f.polls().length, 3);
    await f.timer.advance(10000); assert.deepEqual(state, { value: 'returned' }); assert.equal(f.originals.length, 1); f.assertClean();
  });
  await check('A reconnect bypasses a transient network backoff', async () => {
    const f = fixture({ lookup: (_, count) => count === 1 ? Promise.reject(new Error('network down')) : response(complete('network', 'online')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('network')); await flush(); await f.timer.advance(2000);
    assert.deepEqual(state, { pending: true }); f.say('reconnected'); await flush(); assert.deepEqual(state, { value: 'online' }); f.assertClean();
  });
  await check('A lookup that ignores abort signals is time-bounded and retried safely', async () => {
    let lateReply;
    const f = fixture({ lookup: (_, count) => count === 1 ? new Promise(resolve => { lateReply = resolve; }) : response(complete('hung', 'recovered')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('hung')); await flush(); await f.timer.advance(2000);
    await f.timer.advance(10000); assert.equal(f.polls()[0].signal.aborted, true); await f.timer.advance(4000);
    assert.deepEqual(state, { value: 'recovered' }); assert.equal(f.originals.length, 1); f.assertClean();
    lateReply(response(complete('hung', 'late stale lookup'))); await flush(); assert.deepEqual(state, { value: 'recovered' }); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('Websocket completion during an active lookup aborts it and ignores its later reply', async () => {
    let lateReply;
    const f = fixture({ lookup: () => new Promise(resolve => { lateReply = resolve; }) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('race')); await flush(); await f.timer.advance(2000);
    f.say('mmc_answer', { prompt_id: 'race', result: 'websocket won' }); await flush(); assert.equal(f.polls()[0].signal.aborted, true); f.assertClean();
    lateReply(response(complete('race', 'lookup lost'))); await flush(); assert.deepEqual(state, { value: 'websocket won' }); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('Reconnection cancels a stale active lookup and starts one fresh lookup', async () => {
    const f = fixture({ lookup: (_, count) => count === 1 ? new Promise(() => {}) : response(complete('retry-now', 'fresh connection')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('retry-now')); await flush(); await f.timer.advance(2000);
    f.say('reconnected'); f.say('reconnected'); await flush(); await f.timer.advance(0);
    assert.deepEqual(state, { value: 'fresh connection' }); assert.equal(f.polls().length, 2); assert.equal(f.polls()[0].signal.aborted, true); f.assertClean();
  });
  await check('Concurrent answer tickets and foreign events never settle another caller', async () => {
    const f = fixture({ lookup: request => response(complete(request.body.answer_id, request.body.answer_id === 'A' ? 'a result' : 'b result')) });
    const a = observe(f.run('/continuity/refine', {})), b = observe(f.run('/continuity/chat/turn', {}));
    f.originals[0].reply(ticket('A')); f.originals[1].reply(ticket('B')); await flush(); f.say('mmc_answer', { prompt_id: 'foreign', result: 'wrong' }); await flush();
    assert.deepEqual(a, { pending: true }); assert.deepEqual(b, { pending: true }); f.say('reconnected'); await flush();
    assert.deepEqual(a, { value: 'a result' }); assert.deepEqual(b, { value: 'b result' }); assert.equal(f.acknowledgements.length, 2); f.assertClean();
  });
  await check('A foreign ID in a lookup is ignored until the matching answer is received', async () => {
    const f = fixture({ lookup: () => response(complete('foreign', 'wrong')) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('ours')); await flush(); await f.timer.advance(2000);
    assert.deepEqual(state, { pending: true }); assert.equal(f.acknowledgements.length, 0);
    f.say('mmc_answer', { prompt_id: 'ours', result: 'correct' }); await flush(); assert.deepEqual(state, { value: 'correct' }); f.assertClean();
  });
  for (const status of [400, 401, 403, 404, 410]) await check(`Terminal recovery status ${status} clears busy wait instead of polling forever`, async () => {
    const f = fixture({ lookup: () => response({ error: 'not available' }, status) });
    const state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('expired')); await flush(); await f.timer.advance(2000);
    assert.deepEqual(state, { error: 'the job finished without an answer' }); assert.equal(f.polls().length, 1); assert.equal(f.acknowledgements.length, 0); f.assertClean();
  });
  await check('An early remote refusal keeps its original message and cleans all resources', async () => {
    const f = fixture(), state = observe(f.run('/continuity/refine', {})); f.say('mmc_answer', { prompt_id: 'early-error', error: 'expected refusal' });
    f.originals[0].reply(ticket('early-error')); await flush(); assert.deepEqual(state, { error: 'expected refusal' }); assert.equal(f.acknowledgements.length, 1); f.assertClean();
  });
  await check('Malformed matching websocket answers reject rather than resolve undefined', async () => {
    const f = fixture(), state = observe(f.run('/continuity/refine', {})); f.originals[0].reply(ticket('malformed')); await flush();
    f.say('mmc_answer', { prompt_id: 'malformed' }); await flush(); assert.deepEqual(state, { error: 'the job finished without an answer' }); assert.equal(f.acknowledgements.length, 0); f.assertClean();
  });
  await check('HTTP request rejection cleans collectors and does not post a duplicate job', async () => {
    const f = fixture(), state = observe(f.run('/continuity/refine', {})); f.originals[0].reject(new Error('HTTP connection lost before ticket')); await flush();
    assert.deepEqual(state, { error: 'HTTP connection lost before ticket' }); assert.equal(f.originals.length, 1); assert.equal(f.polls().length, 0); f.assertClean();
  });
  await check('Refused HTTP requests retain their existing error and leave no recovery work', async () => {
    const f = fixture(), state = observe(f.run('/continuity/refine', {})); f.originals[0].reply({ error: 'choose a model first' }, 400); await flush();
    assert.deepEqual(state, { error: 'choose a model first' }); assert.equal(f.originals.length, 1); f.assertClean();
  });
  await check('Recovery tokens stay out of caller state and the original work payload', async () => {
    const body = Object.freeze({ kind: 'field', summary: 'original prose' });
    const f = fixture({ lookup: () => response(complete('private', 'done')) });
    const state = observe(f.run('/continuity/refine', body)); f.originals[0].reply(ticket('private')); await flush(); f.say('reconnected'); await flush();
    assert.deepEqual(state, { value: 'done' }); assert.deepEqual(body, { kind: 'field', summary: 'original prose' });
    assert.deepEqual(f.originals[0].body, { kind: 'field', summary: 'original prose', client_id: 'mock-browser' }); f.assertClean();
  });
  const report = { source: path.join(root, 'web/creator/queue.js'), scope: 'Complete queue module in RAM-only host with fake clock/API/websocket; no real generation or network.', passed: results.length, total: results.length, realGenerationRequests: 0, externalRequests: 0, results };
  if (process.env.CONTINUITY_TEST_REPORT) fs.writeFileSync(process.env.CONTINUITY_TEST_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
