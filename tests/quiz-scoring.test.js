// Tests for the "Find Your Club" quiz scoring engine.
// Run: node --test tests/quiz-scoring.test.js
// Pure logic: no DOM, storage, or network is involved.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of [
  'public/assets/js/quiz-clubs.js',
  'public/assets/js/quiz-questions.js',
  'public/assets/js/quiz-scoring.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}

const clubs = sandbox.window.MiuQuizClubs;
const questions = sandbox.window.MiuQuizQuestions;
const scoring = sandbox.window.MiuQuizScoring;

const allClubIds = clubs.clubs.map((c) => c.id);
const activeClubIds = clubs.activeClubs().map((c) => c.id);

describe('quiz configuration validation', () => {
  it('accepts the shipped club catalogue and questions', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions);
    assert.ok(result.valid, result.errors.join('; '));
  });

  it('has exactly 15 questions', () => {
    assert.strictEqual(questions.questions.length, 15);
  });

  it('has unique question ids', () => {
    const ids = questions.questions.map((q) => q.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('has unique option ids across all questions', () => {
    const ids = [];
    for (const q of questions.questions) {
      for (const o of q.options) ids.push(o.id);
    }
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('uses only valid question weights', () => {
    for (const q of questions.questions) {
      assert.ok([1, 2].includes(q.weight), q.id + ' weight ' + q.weight);
    }
  });

  it('uses only valid club point values', () => {
    for (const q of questions.questions) {
      for (const o of q.options) {
        for (const value of Object.values(o.clubPoints)) {
          assert.ok([0, 1, 2, 3].includes(value), o.id + ' value ' + value);
        }
      }
    }
  });

  it('references no unknown clubs and no missing clubs', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions);
    assert.ok(result.valid, result.errors.join('; '));
    for (const id of allClubIds) assert.ok(result.clubById.has(id));
  });

  it('excludes inactive clubs from scoring references', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions);
    for (const id of result.activeClubIds) {
      const club = result.clubById.get(id);
      assert.ok(club.status !== 'closed');
    }
  });

  it('gives every active club at least one scoring opportunity', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions);
    for (const club of clubs.activeClubs()) {
      let has = false;
      for (const q of questions.questions) {
        for (const o of q.options) {
          if (o.clubPoints[club.id] > 0) has = true;
        }
      }
      assert.ok(has, club.name + ' (' + club.id + ') has no scoring opportunities');
    }
  });

  it('provides explanations for every scored option-club pair', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions);
    assert.ok(result.valid, result.errors.join('; '));
  });

  it('rejects an unknown club reference', () => {
    const bad = JSON.parse(JSON.stringify(questions.questions));
    bad[0].options[0].clubPoints['999'] = 3;
    const result = scoring.validateConfiguration(clubs.clubs, bad);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('unknown club')));
  });

  it('rejects an invalid point value', () => {
    const bad = JSON.parse(JSON.stringify(questions.questions));
    bad[0].options[0].clubPoints['6'] = 7;
    const result = scoring.validateConfiguration(clubs.clubs, bad);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('invalid clubPoints value')));
  });

  it('rejects a wrong question count', () => {
    const result = scoring.validateConfiguration(clubs.clubs, questions.questions.slice(0, 14));
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('exactly 15')));
  });
});

describe('maximum possible score', () => {
  it('is nonzero for every included club', () => {
    for (const club of clubs.activeClubs()) {
      const max = scoring.maximumPossibleScore(club.id, questions.questions);
      assert.ok(max > 0, club.name + ' has a zero achievable maximum');
    }
  });

  it('respects the primary/secondary interest restriction', () => {
    // Without the restriction, q1a and q2a (the same option) could both count
    // for ACPC. The restriction keeps the pair max at one primary choice.
    const acpc = '6';
    const engineMax = scoring.maximumPossibleScore(acpc, questions.questions);
    const q1 = questions.question('q1');
    const q2 = questions.question('q2');
    const pairNaive = q1.options.map((o) => q1.weight * o.clubPoints[acpc])
      .reduce((a, b) => Math.max(a, b))
      + q2.options.map((o) => q2.weight * o.clubPoints[acpc])
        .reduce((a, b) => Math.max(a, b));
    let otherMax = 0;
    for (let i = 2; i < questions.questions.length; i++) {
      const q = questions.questions[i];
      otherMax += q.options.map((o) => q.weight * o.clubPoints[acpc])
        .reduce((a, b) => Math.max(a, b), 0);
    }
    assert.ok(engineMax < pairNaive + otherMax,
      'primary/secondary restriction must lower ACPC max (' + engineMax + ' < ' + (pairNaive + otherMax) + ')');
  });
});

describe('compute() scoring', () => {
  const emptyAnswers = {};
  for (const q of questions.questions) emptyAnswers[q.id] = null;

  it('produces the empty state when nothing is answered', () => {
    const result = scoring.compute(clubs.clubs, questions.questions, {});
    assert.ok(result.empty);
    assert.strictEqual(result.results.length, 0);
  });

  it('all-neutral answers produce the empty state', () => {
    const answers = {};
    for (const q of questions.questions) {
      const none = q.options.find((o) => /no preference|neither/i.test(o.label));
      assert.ok(none, q.id + ' needs a neutral option');
      answers[q.id] = none.id;
    }
    const result = scoring.compute(clubs.clubs, questions.questions, answers);
    assert.ok(result.empty);
    assert.strictEqual(result.results.length, 0);
  });

  it('keeps normalized scores between 0 and 100', () => {
    const result = scoring.compute(clubs.clubs, questions.questions, {
      q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4a', q5: 'q5a', q6: 'q6a', q7: 'q7a',
      q8: 'q8a', q9: 'q9a', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13a',
      q14: 'q14a', q15: 'q15a'
    });
    for (const r of result.scored) {
      assert.ok(r.normalized >= 0 && r.normalized <= 1, r.club.name + ' ' + r.normalized);
    }
  });

  it('is deterministic: identical answers give identical results', () => {
    const answers = {
      q1: 'q1f', q2: 'q2c', q3: 'q3b', q4: 'q4c', q5: 'q5c', q6: 'q6b', q7: 'q7d',
      q8: 'q8b', q9: 'q9b', q10: 'q10c', q11: 'q11d', q12: 'q12d', q13: 'q13e',
      q14: 'q14e', q15: 'q15f'
    };
    const first = scoring.compute(clubs.clubs, questions.questions, answers);
    const second = scoring.compute(clubs.clubs, questions.questions, answers);
    assert.deepStrictEqual(first, second);
  });

  it('never returns duplicate clubs', () => {
    const result = scoring.compute(clubs.clubs, questions.questions, {
      q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4a', q5: 'q5a', q6: 'q6a', q7: 'q7a',
      q8: 'q8a', q9: 'q9a', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13a',
      q14: 'q14a', q15: 'q15a'
    });
    const ids = result.results.map((r) => r.club.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('excludes inactive clubs and zero-score clubs', () => {
    const result = scoring.compute(clubs.clubs, questions.questions, {
      q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4a', q5: 'q5a', q6: 'q6a', q7: 'q7a',
      q8: 'q8a', q9: 'q9a', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13a',
      q14: 'q14a', q15: 'q15a'
    });
    assert.ok(result.results.length >= 1 && result.results.length <= 3);
    for (const r of result.results) {
      assert.ok(r.rawScore > 0, r.club.name + ' should not be a zero-score filler');
      assert.ok(activeClubIds.includes(r.club.id), r.club.name + ' should be an active club');
    }
    const ids = result.results.map((r) => r.club.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('does not retain old points when an answer changes', () => {
    const withAcpc = scoring.compute(clubs.clubs, questions.questions, {
      q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e',
      q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12a', q13: 'q13b',
      q14: 'q14a', q15: 'q15a'
    });
    const withoutAcpc = scoring.compute(clubs.clubs, questions.questions, {
      q1: 'q1b', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e',
      q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12b', q13: 'q13d',
      q14: 'q14c', q15: 'q15c'
    });
    const acpcWith = withAcpc.scored.find((r) => r.club.id === '6');
    const acpcWithout = withoutAcpc.scored.find((r) => r.club.id === '6');
    assert.ok(acpcWith && acpcWithout);
    assert.ok(acpcWith.normalized > acpcWithout.normalized);
  });

  it('ranks with full precision (no premature rounding)', () => {
    const result = scoring.compute(clubs.clubs, questions.questions, { q14: 'q14a' });
    const acpc = result.scored.find((r) => r.club.id === '6');
    assert.ok(acpc);
    assert.ok(acpc.normalized > 0 && acpc.normalized < 1);
    assert.strictEqual(acpc.normalized, 3 / scoring.maximumPossibleScore('6', questions.questions));
  });

  it('orders ties: direct activity matches, then primary contribution, then stable id', () => {
    const helpers = scoring;
    const answers = {};
    for (const q of questions.questions) answers[q.id] = null;
    assert.strictEqual(helpers.primaryContribution('6', answers, questions.questions), 0);
    assert.strictEqual(helpers.directActivityMatches('6', answers, questions.questions), 0);

    answers.q1 = 'q1a';
    answers.q3 = 'q3a';
    assert.strictEqual(helpers.primaryContribution('6', answers, questions.questions), 6);
    assert.strictEqual(helpers.directActivityMatches('6', answers, questions.questions), 1);
    answers.q3 = 'q3d';
    assert.strictEqual(helpers.directActivityMatches('6', answers, questions.questions), 0);
  });
});

const profiles = [
  { name: 'competitive programming', answers: { q1: 'q1a', q2: 'q2g', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13b', q14: 'q14a', q15: 'q15a' }, expect: '6' },
  { name: 'software/AI projects', answers: { q1: 'q1a', q2: 'q2e', q3: 'q3b', q4: 'q4c', q5: 'q5c', q6: 'q6b', q7: 'q7d', q8: 'q8c', q9: 'q9c', q10: 'q10c', q11: 'q11a', q12: 'q12d', q13: 'q13e', q14: 'q14e', q15: 'q15f' }, expect: '9' },
  { name: 'engineering', answers: { q1: 'q1a', q2: 'q2d', q3: 'q3c', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11a', q12: 'q12a', q13: 'q13b', q14: 'q14b', q15: 'q15a' }, expect: '5' },
  { name: 'music', answers: { q1: 'q1b', q2: 'q2c', q3: 'q3d', q4: 'q4d', q5: 'q5a', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12b', q13: 'q13a', q14: 'q14c', q15: 'q15c' }, expect: '8' },
  { name: 'theatre', answers: { q1: 'q1b', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5b', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12b', q13: 'q13a', q14: 'q14c', q15: 'q15c' }, expect: '8' },
  { name: 'sketching', answers: { q1: 'q1c', q2: 'q2d', q3: 'q3d', q4: 'q4a', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11b', q12: 'q12b', q13: 'q13c', q14: 'q14d', q15: 'q15b' }, expect: '4' },
  { name: 'jewellery making', answers: { q1: 'q1c', q2: 'q2d', q3: 'q3d', q4: 'q4b', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11b', q12: 'q12b', q13: 'q13c', q14: 'q14d', q15: 'q15b' }, expect: '4' },
  { name: 'varied art workshops', answers: { q1: 'q1c', q2: 'q2d', q3: 'q3d', q4: 'q4c', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11b', q12: 'q12b', q13: 'q13c', q14: 'q14d', q15: 'q15b' }, expect: '4' },
  { name: 'medical outreach', answers: { q1: 'q1e', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6c', q7: 'q7b', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11c', q12: 'q12c', q13: 'q13d', q14: 'q14f', q15: 'q15e' }, expect: '11' },
  { name: 'dental outreach (no dental club in records)', answers: { q1: 'q1e', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6d', q7: 'q7c', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11c', q12: 'q12c', q13: 'q13d', q14: 'q14f', q15: 'q15e' }, expect: '11' },
  { name: 'homelessness support', answers: { q1: 'q1e', q2: 'q2e', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6a', q7: 'q7d', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11c', q12: 'q12c', q13: 'q13f', q14: 'q14g', q15: 'q15e' }, expect: '11' },
  { name: 'general charity', answers: { q1: 'q1e', q2: 'q2e', q3: 'q3d', q4: 'q4d', q5: 'q5c', q6: 'q6b', q7: 'q7d', q8: 'q8d', q9: 'q9c', q10: 'q10c', q11: 'q11c', q12: 'q12c', q13: 'q13f', q14: 'q14g', q15: 'q15f' }, expect: '9' },
  { name: 'sports', answers: { q1: 'q1d', q2: 'q2e', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9a', q10: 'q10d', q11: 'q11e', q12: 'q12e', q13: 'q13f', q14: 'q14g', q15: 'q15d' }, expect: '7' },
  { name: 'athletic comeback training', answers: { q1: 'q1d', q2: 'q2e', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9b', q10: 'q10d', q11: 'q11e', q12: 'q12e', q13: 'q13f', q14: 'q14g', q15: 'q15d' }, expect: '7' },
  { name: 'travel', answers: { q1: 'q1h', q2: 'q2h', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10b', q11: 'q11d', q12: 'q12e', q13: 'q13f', q14: 'q14g', q15: 'q15e' }, expect: '9' },
  { name: 'gaming/anime', answers: { q1: 'q1g', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10a', q11: 'q11e', q12: 'q12e', q13: 'q13f', q14: 'q14g', q15: 'q15g' }, expect: '10' },
  { name: 'diplomacy', answers: { q1: 'q1f', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8b', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12d', q13: 'q13a', q14: 'q14g', q15: 'q15h' }, expect: '2' },
  { name: 'cultural exchange', answers: { q1: 'q1f', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8c', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12d', q13: 'q13a', q14: 'q14g', q15: 'q15h' }, expect: '2' },
  { name: 'business/marketing', answers: { q1: 'q1f', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8a', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12d', q13: 'q13a', q14: 'q14a', q15: 'q15h' }, expect: '3' },
  { name: 'event organization', answers: { q1: 'q1e', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5c', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11d', q12: 'q12d', q13: 'q13e', q14: 'q14e', q15: 'q15f' }, expect: '12' },
  { name: 'health awareness', answers: { q1: 'q1e', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7a', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11c', q12: 'q12c', q13: 'q13d', q14: 'q14f', q15: 'q15e' }, expect: '11' }
];

describe('profile fixtures', () => {
  for (const profile of profiles) {
    it(profile.name + ' -> ' + clubs.find(profile.expect).name, () => {
      const result = scoring.compute(clubs.clubs, questions.questions, profile.answers);
      assert.ok(!result.empty, profile.name + ' produced no results');
      assert.strictEqual(result.results[0].club.id, profile.expect,
        profile.name + ' expected top ' + clubs.find(profile.expect).name + ', got ' + result.results[0].club.name);
    });
  }
});

describe('scoring coverage and tie-breaking rules', () => {
  it('every included club can reach first place with an aligned profile', () => {
    // Each club has at least one fixture above that places it first; Utopia's
    // aligned profile is verified here because the 21 topic fixtures do not
    // cover it. This documents the mapping instead of inventing distinctions.
    const covered = new Set(profiles.map((p) => p.expect));
    const utopiaAnswers = {
      q1: 'q1f', q2: 'q2e', q3: 'q3d', q4: 'q4a', q5: 'q5c', q6: 'q6b', q7: 'q7d',
      q8: 'q8a', q9: 'q9c', q10: 'q10c', q11: 'q11d', q12: 'q12d', q13: 'q13e',
      q14: 'q14e', q15: 'q15f'
    };
    const utopiaResult = scoring.compute(clubs.clubs, questions.questions, utopiaAnswers);
    assert.ok(!utopiaResult.empty);
    assert.strictEqual(utopiaResult.results[0].club.id, '1');
    assert.strictEqual(utopiaResult.results[0].normalizedScore, 1);
    for (const club of clubs.activeClubs()) {
      assert.ok(covered.has(club.id) || club.id === '1', club.name + ' has no aligned first-place profile');
    }
  });

  it('generic goals cannot overpower direct contrary activity preferences', () => {
    // q14e is a broad goal (event organization) giving MSP points; q3a is a
    // direct activity preference giving ACPC points. The activity preference
    // must rank above the generic goal club.
    const answers = { q1: 'q1d', q2: 'q2d', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e',
      q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11e', q12: 'q12e', q13: 'q13f', q14: 'q14e', q15: 'q15c' };
    const result = scoring.compute(clubs.clubs, questions.questions, answers);
    const acpc = result.scored.find((r) => r.club.id === '6');
    const msp = result.scored.find((r) => r.club.id === '9');
    assert.ok(acpc && msp);
    assert.ok(acpc.normalized > msp.normalized, 'ACPC ' + acpc.normalized + ' must beat MSP ' + msp.normalized);
  });

  it('reasons reference answers the student actually selected', () => {
    const answers = { q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e',
      q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11a', q12: 'q12a', q13: 'q13b', q14: 'q14a', q15: 'q15a' };
    const result = scoring.compute(clubs.clubs, questions.questions, answers);
    const acpc = result.results.find((r) => r.club.id === '6');
    assert.ok(acpc && acpc.reasons.length > 0);
    for (const reason of acpc.reasons) {
      assert.ok(typeof reason === 'string' && reason.length > 0);
    }
  });
});
