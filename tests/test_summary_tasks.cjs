// Pure, real summary-prefix helpers. No workflow, browser, network or generation.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '..');
let passed = 0;
const check = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
(async () => {
  const { TASKS, TASK_HELP, TASK_COMBINATIONS, splitTasks, taskSummary } = await import(pathToFileURL(path.join(root,'web','creator','summary-tasks.js')));
  check('six official roles, six help rows, five approved examples', () => {
    assert.equal(TASKS.length, 6); assert.equal(TASK_HELP.length, 6); assert.equal(TASK_COMBINATIONS.length, 5);
    for (const row of TASK_COMBINATIONS) assert.ok(row.tasks.every(task => TASKS.includes(task)));
    assert.deepEqual(TASK_COMBINATIONS[3].tasks,['video editing','reference generation','audio reuse']);
  });
  check('general task examples do not require people, dialogue, or a cast roster', () => {
    assert.deepEqual(TASK_COMBINATIONS.map(row => row.name),[
      'Generate a new video from a reference image',
      'Generate a new audiovisual scene from image and audio references',
      'Start from an exact frame with additional reference images',
      'Edit a target element and keep the original sound',
      'Continue a video and specify its final frame',
    ]);
    assert.deepEqual(TASK_COMBINATIONS.map(row => row.tasks),[
      ['reference generation'],
      ['reference generation','audio reference'],
      ['keyframe completion','reference generation'],
      ['video editing','reference generation','audio reuse'],
      ['video continuation','keyframe completion'],
    ]);
    for (const row of TASK_COMBINATIONS) assert.doesNotMatch(row.name,/\b(person|people|character|dialogue|cast)\b/i);
    assert.equal(TASK_HELP[1][1],'Use reference images or clips for visual features, setting, style, motion, or camera movement.');
    assert.equal(TASK_HELP[2][1],'Change a target element or background in the source video.');
    assert.equal(TASK_HELP[5][1],'Reference sound, voice, music, or rhythm characteristics.');
    const landscape='A wide aerial view of a misty mountain lake. No people are visible.';
    assert.equal(taskSummary(landscape,TASK_COMBINATIONS[0].tasks),'[reference generation] '+landscape);
  });
  for (const language of ['ko','ja','zh']) {
    const dictionary = (await import(pathToFileURL(path.join(root,'web','creator','locales',language+'.js'))))[language];
    check(`${language}: all task help and examples are translated with neutral example wording`, () => {
      for (const key of [...TASK_HELP.flat(),...TASK_COMBINATIONS.map(row=>row.name)]) {
        assert.equal(typeof dictionary[key],'string',`${language}: missing ${key}`);
        assert.ok(dictionary[key].trim(),`${language}: blank ${key}`);
        assert.notEqual(dictionary[key],key,`${language}: untranslated ${key}`);
      }
      for (const row of TASK_COMBINATIONS) assert.doesNotMatch(dictionary[row.name],/인물|대사|人物|台詞|对白/);
    });
  }
  check('canonical deduplicated prefix replaces every recognized leading task group', () => {
    const source='[REFERENCE GENERATION + video editing] [reference generation] [Shot 1] A person.';
    assert.deepEqual(splitTasks(source),{tasks:['reference generation','video editing'],body:'[Shot 1] A person.'});
    assert.equal(taskSummary(source,['video editing','video editing','audio reuse']),'[video editing + audio reuse] [Shot 1] A person.');
  });
  check('unknown custom or mixed prefixes are preserved, never silently discarded', () => {
    for (const body of ['[custom task] Original prose.','[reference generation + unknown] Original prose.','[Shot 1] [reference generation] Original prose.']) {
      assert.deepEqual(splitTasks(body),{tasks:[],body});
      assert.equal(taskSummary(body,['video editing']),`[video editing] ${body}`);
    }
  });
  check('summary line breaks, indentation, quotes, body tags and Unicode handles remain exact', () => {
    const body='\n\n  @여자_2 reads "[video editing]".\r\n [Shot 2] Continue.  ';
    assert.equal(splitTasks('[reference generation]'+body).body,body);
    assert.equal(taskSummary('[reference generation]'+body,['audio reuse']),'[audio reuse]'+body);
    assert.equal(taskSummary('[reference generation]'+body,[]),body);
    assert.equal(splitTasks('  Plain prose.\n').body,'  Plain prose.\n');
  });
  check('empty selection removes only owned task prefix and empty summary remains safe', () => {
    assert.equal(taskSummary('[video editing] Keep this sentence.',[]),'Keep this sentence.');
    assert.equal(taskSummary('',[]),'');
    assert.equal(taskSummary(null,['audio reference']),'[audio reference]');
    assert.equal(taskSummary('A person.',[]),'A person.');
  });
  console.log(JSON.stringify({passed,scope:'real pure helpers; no browser or generation'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
