// Production duration UI and frame-grid math in an isolated browser. State
// attachment/model metadata are fixtures; no ComfyUI or media server is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const editor = read('editor.js');
const state = read('state.js');
const canvas = read('canvas.js');
const pills = read('pills.js');
const method = name => {
  const found = editor.match(new RegExp(`^  ${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Production method ${name}`);
  return found[0];
};
const fn = (source, name) => {
  const found = source.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production function ${name}`);
  return found[0].replace(/^export /, '');
};
const dom = fn(read('dom.js'), 'el');
const css = ['base', 'editor', 'timeline'].map(name => {
  const found = read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/);
  assert.ok(found, `Production CSS ${name}`);
  return found[1];
}).join('\n');
const translations = {
  'Match length': '길이 맞추기',
  'Length matched': '길이 맞춤 완료',
  'Reference @{handle}: {seconds} s': '참조 @{handle}: {seconds}초',
  'Match target: {seconds} s': '맞춤 목표: {seconds}초',
  'Reference and match target lengths': '참조 및 맞춤 목표 길이',
  'hard cut': '하드 컷',
  'continues': '이어짐',
  'Start frame': '시작 프레임',
  'End frame': '끝 프레임',
  'from last frame': '마지막 프레임부터',
};
const code = `
${dom}
${['legalFrameCounts', 'framesForSeconds', 'secondsForFrames', 'matchSeconds'].map(name => fn(canvas, name)).join('\n')}
${['refSeconds', 'timedRefs', 'lengthMatch'].map(name => fn(state, name)).join('\n')}
const RULES = {fps:24,frameStep:17,frameOffset:5,minSeconds:1,maxSeconds:60};
const rulesFor = () => RULES;
const pieceFamily = () => 'fixture';
const timedAssets = value => value.assets.filter(asset => ['audio','video'].includes(asset.kind) && asset.enabled !== false);
const roleOf = asset => asset.role || 'reference';
const lengthLed = asset => ['full','voice','motion','edit','continue'].includes(asset.takes || 'full');
const lengthClaim = ${state.match(/const lengthClaim =[^]*?;/)[0].replace(/^const lengthClaim = /, '')}
const S = {
  lengthMatch: (...args) => { window.matchCalls++; return lengthMatch(...args); },
  pieceFamily, hasReferences: () => true, frameAsset: () => null,
  blockedReason: (value,role) => value.continue && role === 'first_frame' ? 'From the previous last frame' : null,
  continues: value => !!value.continue, aspectSourceAsset: () => null,
  showSeconds: seconds => Number.isInteger(seconds) ? String(seconds) : Number(seconds).toFixed(2),
  canDo: value => !!value.predicts,
  familyOf: () => ({capabilities:{duration:{min_seconds:1,max_seconds:60}}}),
};
let locale = 'en';
const translations = ${JSON.stringify(translations)};
const t = (text, values = {}) => (locale === 'ko' ? translations[text] || text : text)
  .replace(/\\{([^}]+)\\}/g, (_, key) => values[key] ?? key);
const icon = () => el('span',{style:{width:'16px',height:'16px',display:'block',flex:'none'},text:'◷'});
const isTrainedLength = () => true;
const pillClass = () => 'mmc-pill-seg';
${fn(pills, 'pillSet')}
const resolutionPillText = () => ({title:'Fixture canvas',sub:'768p'});
class Subject {
  ${['matchTail', 'matchReadout', 'renderPills', 'renderContinue'].map(method).join('\n')}
  lengthOf(filename) { return this.lengths[filename] ?? null; }
  modelPill() { return []; }
  renderRouting() { return null; }
  commit() { this.commits++; this.render(); }
  render() {
    const frames = framesForSeconds(this.state.duration_s, RULES);
    this.host.replaceChildren(this.renderPills({frames,seconds:frames / RULES.fps,fromImage:false},'fixture'));
  }
}
window.matchCalls = 0;
window.fixtureTarget = seconds => matchSeconds(seconds,RULES).toFixed(2);
window.subject = Object.assign(new Subject(), {
  state:{duration_s:6,aspect:'16:9',short_edge:768,prompt:'Unchanged @vid-1',
    assets:[{kind:'video',filename:'source.mp4',handle:'vid-1'}]},
  piece:{predicts:false}, lengths:{'source.mp4':12.34}, durationPill:true,
  canvasPills:false, continuePill:true, commits:0, host:el('div',{class:'mmc-root fixture-host'}),
});
document.body.append(subject.host);
window.setFixture = ({assets, lengths, duration=6, auto=false, predicts=false, language='en', continues=false}={}) => {
  subject.state={duration_s:duration,auto_duration:auto,aspect:'16:9',short_edge:768,
    prompt:'Unchanged @vid-1',assets:assets || [{kind:'video',filename:'source.mp4',handle:'vid-1'}],
    ...(continues ? {continue:true} : {})};
  subject.lengths=lengths || {'source.mp4':12.34}; subject.piece={predicts};
  subject.commits=0; locale=language; window.matchCalls=0; subject.render();
};
setFixture();
`;
new vm.Script(code, {filename:'duration-match-production-fixture.js'});
const results = [];
let browser, requests = 0;
async function check(name, fn) { await fn(); results.push({name,passed:true}); }
(async () => {
  browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined});
  const page = await browser.newPage({viewport:{width:1100,height:750}});
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<html class="dark-theme"><head><style>${css}
    :root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
    body{margin:0;background:#171718}.fixture-host{width:620px;height:auto;margin:24px;box-sizing:border-box}
  </style></head><body></body></html>`);
  await page.evaluate(`(() => {${code}})()`);
  await check('Read-only reference and existing model target visible without hover', async () => {
    assert.deepEqual(await page.evaluate(() => ({
      reference:document.querySelector('.mmc-duration-match-reference').textContent,
      target:document.querySelector('.mmc-duration-match-target').textContent,
      wanted:fixtureTarget(12.34), commits:subject.commits,
      calls:window.matchCalls,
      readonly:document.querySelector('.mmc-duration-match-info').querySelector('button,input,select') === null,
    })),{reference:'Reference @vid-1: 12.34 s',target:'Match target: 12.25 s',wanted:'12.25',commits:0,calls:1,readonly:true});
    if (process.env.CONTINUITY_UX_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR,{recursive:true});
      await page.locator('.fixture-host').screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'duration-match-normal.png')});
    }
  });
  await check('Match changes only current duration, commits once, and becomes non-interactive', async () => {
    const before = await page.evaluate(() => JSON.stringify(subject.state));
    await page.locator('button.mmc-dur-match').click();
    const after = await page.evaluate(() => ({state:subject.state,commits:subject.commits,
      button:!!document.querySelector('button.mmc-dur-match'),
      matched:document.querySelector('.mmc-dur-match.on').textContent}));
    const expected = JSON.parse(before); expected.duration_s = 12.25;
    assert.deepEqual(after,{state:expected,commits:1,button:false,matched:'Length matched'});
  });
  await check('Native keyboard activation retains the same single action', async () => {
    await page.evaluate(() => setFixture());
    await page.locator('button.mmc-dur-match').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => ({duration:subject.state.duration_s,commits:subject.commits})),{duration:12.25,commits:1});
  });
  await check('Trimmed reference shows its range, never describes it as whole source', async () => {
    await page.evaluate(() => setFixture({assets:[{kind:'video',filename:'source.mp4',handle:'vid-1',trim:{start:2,end:8.6}}]}));
    assert.deepEqual(await page.evaluate(() => ({text:document.querySelector('.mmc-duration-match-info').textContent,
      range:subject.state.assets[0].trim,source:subject.lengths['source.mp4'],commits:subject.commits})),
      {text:'Reference @vid-1: 6.60 sMatch target: 6.58 s',range:{start:2,end:8.6},source:12.34,commits:0});
  });
  await check('Authoritative length selection still prefers dialogue to a longer style reference', async () => {
    await page.evaluate(() => setFixture({assets:[{kind:'audio',filename:'voice.wav',handle:'aud-1',takes:'voice'},
      {kind:'video',filename:'style.mp4',handle:'vid-1',takes:'style'}],lengths:{'voice.wav':5.1,'style.mp4':40}}));
    assert.equal(await page.locator('.mmc-duration-match-reference').textContent(),'Reference @aud-1: 5.10 s');
  });
  await check('Auto duration, unmeasured files and stills retain no match action or readout', async () => {
    for (const options of [{auto:true,predicts:true},{lengths:{}},{assets:[{kind:'image',filename:'image.png',handle:'ref-1'}]}]) {
      assert.equal(await page.evaluate(options => {setFixture(options);return document.querySelectorAll('.mmc-dur-match,.mmc-duration-match-info').length;},options),0);
    }
  });
  await check('Null and frame-grid matches preserve immutable reference state on render', async () => {
    assert.equal(await page.evaluate(() => {
      setFixture({duration:12.3});
      const before=JSON.stringify(subject.state);subject.render();
      return JSON.stringify(subject.state)===before && subject.commits===0 &&
        document.querySelector('.mmc-dur-match').tagName==='SPAN' && subject.matchTail(null).length===0;
    }),true);
  });
  await check('Continuation, frame and duration pills share one top line; readout stays below', async () => {
    await page.setViewportSize({width:1280,height:750});
    await page.addStyleTag({content:'.fixture-host{width:1100px}'});
    for (const scale of [1,1.6]) for (const language of ['en','ko']) for (const duration of [6,12.25]) {
      await page.evaluate(({scale,language,duration}) => {
        document.documentElement.style.setProperty('--mmc-type',String(scale));
        setFixture({duration,language,continues:true});
      },{scale,language,duration});
      const measurement=await page.evaluate(() => {
        const row=document.querySelector('.mmc-pills');
        const continuePill=row.querySelector('.mmc-continue').getBoundingClientRect();
        const frames=row.querySelector('.mmc-frames').getBoundingClientRect();
        const duration=row.querySelector('.mmc-duration-control > .mmc-pill').getBoundingClientRect();
        const readout=row.querySelector('.mmc-duration-match-info').getBoundingClientRect();
        return {tops:[continuePill.top,frames.top,duration.top],readoutTop:readout.top,durationBottom:duration.bottom,
          alignment:getComputedStyle(row).alignItems,commits:subject.commits,
          continued:subject.state.continue,reference:row.querySelector('.mmc-duration-match-reference').textContent,
          target:row.querySelector('.mmc-duration-match-target').textContent};
      });
      assert.ok(Math.max(...measurement.tops)-Math.min(...measurement.tops)<0.5,JSON.stringify(measurement));
      assert.ok(measurement.readoutTop>=measurement.durationBottom+3.5,JSON.stringify(measurement));
      assert.equal(measurement.alignment,'flex-start');assert.equal(measurement.commits,0);
      assert.equal(measurement.continued,true);
      assert.equal(measurement.reference,language==='ko'?'참조 @vid-1: 12.34초':'Reference @vid-1: 12.34 s');
      assert.equal(measurement.target,language==='ko'?'맞춤 목표: 12.25초':'Match target: 12.25 s');
    }
    if(process.env.CONTINUITY_UX_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR,{recursive:true});
      await page.locator('.fixture-host').screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'duration-match-aligned-ko-large.png')});
    }
  });
  await check('Rows without a duration readout retain centered alignment and continuation behavior', async () => {
    assert.equal(await page.evaluate(() => {
      setFixture({lengths:{},continues:true});const row=document.querySelector('.mmc-pills');
      const centered=getComputedStyle(row).alignItems==='center'&&!row.querySelector('.mmc-duration-control');
      const before=JSON.stringify({...subject.state,continue:false});
      row.querySelector('.mmc-continue').click();
      return centered&&subject.commits===1&&JSON.stringify(subject.state)===before;
    }),true);
  });
  await check('Narrow 320px and Korean large text wrap the duration group without overflow', async () => {
    await page.setViewportSize({width:320,height:750});
    await page.addStyleTag({content:'.fixture-host{width:100%;margin:0}.mmc-root{padding:12px}'});
    for (const scale of [1,1.6]) for (const duration of [6,59.99]) {
      await page.evaluate(({scale,duration}) => {
        document.documentElement.style.setProperty('--mmc-type',String(scale));
        setFixture({duration,language:'ko',assets:[{kind:'video',filename:'source.mp4',handle:'very_long_reference_handle_123456789'}]});
      },{scale,duration});
      const measurement = await page.evaluate(() => {
        const host=subject.host,control=document.querySelector('.mmc-duration-control');
        return {page:document.documentElement.scrollWidth,view:window.innerWidth,
          hostScroll:host.scrollWidth,hostWidth:host.clientWidth,
          controlScroll:control.scrollWidth,controlWidth:control.clientWidth,
          actionFont:getComputedStyle(document.querySelector('.mmc-dur-match')).fontSize,
          expectedFont:12 * Number(getComputedStyle(document.documentElement).getPropertyValue('--mmc-type'))};
      });
      assert.ok(measurement.page <= measurement.view,JSON.stringify(measurement));
      assert.ok(measurement.hostScroll <= measurement.hostWidth + 1,JSON.stringify(measurement));
      assert.ok(measurement.controlScroll <= measurement.controlWidth + 1,JSON.stringify(measurement));
      assert.ok(Math.abs(parseFloat(measurement.actionFont)-measurement.expectedFont)<0.01);
    }
    if (process.env.CONTINUITY_UX_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'duration-match-ko-320-large.png'),fullPage:true});
    }
  });
  assert.equal(requests,0,'No network requests');
  console.log(JSON.stringify({suite:'duration-match-usability',checks:results.length,requests,results},null,2));
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {if(browser)await browser.close();});
