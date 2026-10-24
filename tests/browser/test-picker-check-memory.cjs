/* Paths-only display memory. No browser, API, workflow or media access. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '../..');
const store = new Map(); let moduleId = 0, passed = 0;
const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
const load = file => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(root, 'web/creator', file), 'utf8') + '\n// isolation ' + (++moduleId)).toString('base64'));
const test = async (name, body) => { await body(); passed++; console.log('PASS ' + name); };
(async () => {
  globalThis.localStorage = storage;
  const m = await load('picker-checks.js');
  const options = { selectionPurpose: 'cast-files', rememberSelection: true,
    kinds: ['image', 'video', 'audio'], kind: 'image' };
  const context = m.pickerSelectionContext(options, 'image');
  await test('explicit purpose / tab / kind / single isolation', () => {
    assert.equal(context, 'pickerchecks:cast-files:image:*:multiple');
    assert.notEqual(context, m.pickerSelectionContext(options, 'video'));
    assert.notEqual(context, m.pickerSelectionContext({ ...options, single: true }, 'image'));
    assert.notEqual(context, m.pickerSelectionContext({ ...options, only: 'image' }, 'image'));
    assert.notEqual(context, m.pickerSelectionContext({ ...options, selectionPurpose: 'pool-files' }, 'image'));
  });
  await test('view-only / seeded panels / missing or invalid purpose never store', () => {
    for (const patch of [{ viewOnly: true }, { plate: { panels: [{ path: 'live.png' }] } }, { selectionPurpose: null }, { selectionPurpose: '../bad' }]) {
      assert.equal(m.pickerSelectionContext({ ...options, ...patch }, 'image'), null);
    }
    assert.equal(m.pickerSelectionContext(options, 'renders'), null);
    assert.equal(m.pickerSelectionContext({ ...options, plate: { panels: [] } }, 'image'), context);
  });
  await test('only ordered strings survive; no settings or workflow payload', () => {
    m.writePickedPaths(context, ['B.png', 'A.png', 'B.png', '', null, { path: 'bad', crop: [1] }, 'bad\0.png', 'x'.repeat(2049)]);
    assert.deepEqual(m.readPickedPaths(context), ['B.png', 'A.png']);
    assert.deepEqual(JSON.parse(store.get('continuity-picker-checks-v1')).records[context], ['B.png', 'A.png']);
  });
  await test('read copies cannot mutate persisted checks', () => {
    const result = m.readPickedPaths(context); result.push('fake.png');
    assert.deepEqual(m.readPickedPaths(context), ['B.png', 'A.png']);
  });
  await test('reload restores paths, never executes actions', async () => {
    globalThis.fetch = () => { throw new Error('No API allowed'); };
    const fresh = await load('picker-checks.js');
    assert.deepEqual(fresh.readPickedPaths(context), ['B.png', 'A.png']);
    assert.equal(Object.keys(fresh).length, 4);
  });
  await test('invalid contexts do not change storage', () => {
    const before = store.get('continuity-picker-checks-v1');
    assert.deepEqual(m.writePickedPaths('__proto__', ['evil']), []);
    assert.equal(store.get('continuity-picker-checks-v1'), before);
  });
  await test('bounded paths and oldest context eviction', () => {
    m.writePickedPaths(context, Array.from({ length: 300 }, (_, i) => `file${i}.png`));
    assert.equal(m.readPickedPaths(context).length, 256);
    for (let i = 0; i < 70; i++) m.writePickedPaths(`pickerchecks:purpose-${i}:image:*:multiple`, ['a.png']);
    assert.equal(Object.keys(JSON.parse(store.get('continuity-picker-checks-v1')).records).length, 64);
    assert.deepEqual(m.readPickedPaths(context), []);
  });
  await test('record and total serialized storage remain bounded', () => {
    const rows = Array.from({ length: 256 }, (_, i) => `${i}-` + 'x'.repeat(2000));
    for (let i = 0; i < 70; i++) m.writePickedPaths(`pickerchecks:large-${i}:image:*:multiple`, rows);
    const raw = store.get('continuity-picker-checks-v1');
    assert.ok(raw.length <= 131072);
    for (const row of Object.values(JSON.parse(raw).records)) assert.ok(JSON.stringify(row).length <= 64002);
  });
  await test('corrupt / old-version / oversize storage is discarded', () => {
    for (const raw of ['{broken', JSON.stringify({ version: 99, records: { [context]: ['a'] } }), 'x'.repeat(131073)]) {
      store.set('continuity-picker-checks-v1', raw); assert.deepEqual(m.readPickedPaths(context), []);
    }
  });
  await test('prototype fields rejected, own records remain safe', () => {
    store.set('continuity-picker-checks-v1', JSON.stringify({ version: 1, records: { '__proto__': ['evil'], [context]: ['safe.png'] } }));
    assert.deepEqual(m.readPickedPaths(context), ['safe.png']);
    assert.deepEqual(m.readPickedPaths('__proto__'), []);
  });
  await test('clear context preserves other contexts; clear all empties memory', () => {
    const other = 'pickerchecks:pool-files:image:*:multiple';
    m.writePickedPaths(other, ['other.png']); m.clearPickedPaths(context);
    assert.deepEqual(m.readPickedPaths(other), ['other.png']);
    m.clearPickedPaths(); assert.deepEqual(m.readPickedPaths(other), []);
  });
  await test('denied and quota storage use independent session fallback', async () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const denied = await load('picker-checks.js'); denied.writePickedPaths(context, ['session.png']);
    assert.deepEqual(denied.readPickedPaths(context), ['session.png']);
    globalThis.localStorage = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
    const quota = await load('picker-checks.js'); quota.writePickedPaths(context, ['quota.png']);
    assert.deepEqual(quota.readPickedPaths(context), ['quota.png']);
    globalThis.localStorage = storage;
  });
  await test('view display memory retains fields and rejects action payload', async () => {
    const views = await load('viewprefs.js'), ctx = views.pickerViewContext(options);
    views.patchViewPrefs(ctx, { kind: 'video', sort: 'name', query: '한글', view: 'details', externalFolder: 'a'.repeat(32), directory: '인물/보조 이미지', selected: ['never'], crop: [1], track: 'audio' });
    assert.deepEqual(views.readViewPrefs(ctx), { kind: 'video', sort: 'name', query: '한글', view: 'details', externalFolder: 'a'.repeat(32), directory: '인물/보조 이미지' });
    const fresh = await load('viewprefs.js'); assert.equal(fresh.readViewPrefs(ctx).view, 'details');
    views.patchViewPrefs(ctx, { view: 'bad', externalFolder: 'x'.repeat(65), directory: 'x'.repeat(1025) });
    assert.equal(views.readViewPrefs(ctx).view, 'details');
  });
  await test('larger directory view records stay bounded and retain latest context', async () => {
    const views = await load('viewprefs.js'); views.clearViewPrefs();
    const kinds = ['image', 'video', 'audio', 'renders', 'guides', 'refmods', 'meshes'];
    let latest;
    for (let bits = 1; bits < 100; bits++) {
      const selectedKinds = kinds.filter((_, index) => bits & (1 << index));
      latest = views.pickerViewContext({ kinds: selectedKinds });
      views.patchViewPrefs(latest, { query: 'x'.repeat(512), directory: '한'.repeat(1024), externalFolder: 'f'.repeat(64), view: 'details' });
    }
    assert.ok(store.get('continuity-extended-view-prefs-v1').length <= 65536);
    assert.equal(views.readViewPrefs(latest).view, 'details');
    assert.equal((await load('viewprefs.js')).readViewPrefs(latest).directory.length, 1024);
  });
  console.log(JSON.stringify({ passed, apiRequests: 0, attachmentActions: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
