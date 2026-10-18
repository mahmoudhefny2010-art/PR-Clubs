// "Find Your Club" quiz scoring engine.
//
// Pure recommendation logic: no DOM, no storage, no network. Results are
// calculated from the current answer map only; nothing is accumulated in click
// handlers and no maximum-score constants are maintained by hand.
window.MiuQuizScoring = (function () {
  'use strict';

  const EXPECTED_QUESTION_COUNT = 15;
  const VALID_POINT_VALUES = [0, 1, 2, 3];
  const VALID_WEIGHTS = [1, 2];

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function pointsFor(option, clubId) {
    const points = option && isPlainObject(option.clubPoints) ? option.clubPoints[clubId] : undefined;
    return Number.isFinite(Number(points)) ? Number(points) : 0;
  }

  function validateConfiguration(clubs, questions) {
    const errors = [];
    const activeClubIds = new Set();
    const clubById = new Map();

    for (const club of clubs) {
      if (!club || typeof club.id === 'undefined') {
        errors.push('Club record is missing an id.');
        continue;
      }
      const key = String(club.id);
      if (clubById.has(key)) errors.push('Duplicate club id: ' + key);
      clubById.set(key, club);
      if (club.status !== 'closed') activeClubIds.add(key);
    }

    if (!Array.isArray(questions)) {
      errors.push('Questions configuration is not an array.');
      return { valid: false, errors, activeClubIds, clubById };
    }

    if (questions.length !== EXPECTED_QUESTION_COUNT) {
      errors.push(
        'Expected exactly ' + EXPECTED_QUESTION_COUNT + ' questions, found ' + questions.length + '.'
      );
    }

    const questionIds = new Set();
    const optionIds = new Set();
    const scoringClubs = new Set();
    const clubsWithOpportunity = new Set();

    for (const q of questions) {
      if (!isPlainObject(q)) {
        errors.push('A question entry is not an object.');
        continue;
      }
      if (typeof q.id !== 'string' || !q.id) {
        errors.push('A question is missing a string id.');
        continue;
      }
      if (questionIds.has(q.id)) errors.push('Duplicate question id: ' + q.id);
      questionIds.add(q.id);

      if (typeof q.text !== 'string' || !q.text.trim()) {
        errors.push('Question ' + q.id + ' is missing text.');
      }
      if (!VALID_WEIGHTS.includes(q.weight)) {
        errors.push(
          'Question ' + q.id + ' has an invalid weight ' + q.weight + ' (expected ' + VALID_WEIGHTS.join(', ') + ').'
        );
      }
      if (!Array.isArray(q.options) || q.options.length === 0) {
        errors.push('Question ' + q.id + ' must have at least one option.');
        continue;
      }

      for (const o of q.options) {
        if (!isPlainObject(o)) {
          errors.push('Question ' + q.id + ' has an option that is not an object.');
          continue;
        }
        if (typeof o.id !== 'string' || !o.id) {
          errors.push('Question ' + q.id + ' has an option missing a string id.');
          continue;
        }
        if (optionIds.has(o.id)) errors.push('Duplicate option id: ' + o.id);
        optionIds.add(o.id);

        if (typeof o.label !== 'string' || !o.label.trim()) {
          errors.push('Option ' + o.id + ' is missing a label.');
        }

        const clubPoints = o.clubPoints;
        if (!isPlainObject(clubPoints)) {
          errors.push('Option ' + o.id + ' is missing clubPoints.');
          continue;
        }

        for (const [clubId, value] of Object.entries(clubPoints)) {
          if (!VALID_POINT_VALUES.includes(value)) {
            errors.push(
              'Option ' + o.id + ' has invalid clubPoints value ' + value + ' for club ' + clubId + '.'
            );
            continue;
          }
          if (!clubById.has(clubId)) {
            errors.push(
              'Option ' + o.id + ' references unknown club id: ' + clubId + '.'
            );
            continue;
          }
          scoringClubs.add(clubId);
          if (value > 0) clubsWithOpportunity.add(clubId);
        }

        const explanations = o.explanations;
        if (!isPlainObject(explanations)) {
          errors.push('Option ' + o.id + ' is missing explanations.');
          continue;
        }
        for (const clubId of Object.keys(clubPoints)) {
          if (clubPoints[clubId] > 0 && typeof explanations[clubId] !== 'string') {
            errors.push(
              'Option ' + o.id + ' is missing an explanation for club ' + clubId + '.'
            );
          }
        }
      }
    }

    for (const clubId of activeClubIds) {
      if (!clubsWithOpportunity.has(clubId)) {
        errors.push('Active club ' + clubId + ' has no scoring opportunities in any question.');
      }
    }

    for (const clubId of scoringClubs) {
      if (!activeClubIds.has(clubId)) {
        errors.push('Inactive club ' + clubId + ' is referenced in scoring.');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      activeClubIds,
      clubById,
      questionIds,
      optionIds
    };
  }

  function maximumPossibleScore(clubId, questions) {
    // Questions 1 and 2 share options: a student cannot pick the same interest
    // twice, so evaluate all valid primary/secondary pairs together.
    const first = questions[0];
    const second = questions[1];
    let pairBest = null;
    for (const primary of first.options) {
      const primaryPoints = pointsFor(primary, clubId);
      for (const secondary of second.options) {
        // Questions 1 and 2 cover the same interests; a student cannot pick
        // the same interest twice, so matching interestKeys are incompatible.
        if (primary.interestKey && primary.interestKey === secondary.interestKey) continue;
        const total = first.weight * primaryPoints + second.weight * pointsFor(secondary, clubId);
        if (pairBest === null || total > pairBest) pairBest = total;
      }
    }

    let total = pairBest === null ? 0 : pairBest;
    for (let i = 2; i < questions.length; i++) {
      const q = questions[i];
      let best = null;
      for (const o of q.options) {
        const value = q.weight * pointsFor(o, clubId);
        if (best === null || value > best) best = value;
      }
      if (best !== null) total += best;
    }
    return total;
  }

  function rawScore(clubId, answers, questions) {
    let total = 0;
    for (const q of questions) {
      const optionId = answers[q.id];
      if (!optionId) continue;
      const option = q.options.find((o) => o.id === optionId);
      if (!option) continue;
      total += q.weight * pointsFor(option, clubId);
    }
    return total;
  }

  // Specialist activity questions whose direct (3-point) matches count toward
  // activity-based tie-breaking. Generic goal questions never count here.
  const specialistQuestionIds = ['q3', 'q4', 'q5', 'q7', 'q9'];

  function directActivityMatches(clubId, answers, questions) {
    let count = 0;
    for (const q of questions) {
      if (!specialistQuestionIds.includes(q.id)) continue;
      const optionId = answers[q.id];
      if (!optionId) continue;
      const option = q.options.find((o) => o.id === optionId);
      if (option && pointsFor(option, clubId) === 3) count += 1;
    }
    return count;
  }

  function primaryContribution(clubId, answers, questions) {
    const first = questions[0];
    const optionId = answers[first.id];
    if (!optionId) return 0;
    const option = first.options.find((o) => o.id === optionId);
    return option ? first.weight * pointsFor(option, clubId) : 0;
  }

  function reasonsFor(clubId, answers, questions, limit = 2) {
    const contributions = [];
    for (const q of questions) {
      const optionId = answers[q.id];
      if (!optionId) continue;
      const option = q.options.find((o) => o.id === optionId);
      if (!option) continue;
      const points = pointsFor(option, clubId);
      if (points > 0 && option.explanations && option.explanations[clubId]) {
        contributions.push({ score: q.weight * points, text: option.explanations[clubId] });
      }
    }
    contributions.sort((a, b) => b.score - a.score);
    return contributions.slice(0, limit).map((item) => item.text);
  }

  function compute(clubs, questions, answers) {
    const validation = validateConfiguration(clubs, questions);
    if (!validation.valid) throw new Error('Invalid quiz configuration: ' + validation.errors.join('; '));

    const activeClubs = clubs.filter((club) => validation.activeClubIds.has(String(club.id)));
    const maximumByClub = new Map();
    for (const club of activeClubs) maximumByClub.set(club.id, maximumPossibleScore(club.id, questions));

    const scored = activeClubs.map((club) => {
      const raw = rawScore(club.id, answers, questions);
      const max = maximumByClub.get(club.id);
      const normalized = max > 0 ? raw / max : 0;
      return {
        club,
        raw,
        max,
        normalized
      };
    });

    scored.sort((a, b) => {
      if (b.normalized !== a.normalized) return b.normalized - a.normalized;
      const da = directActivityMatches(a.club.id, answers, questions);
      const db = directActivityMatches(b.club.id, answers, questions);
      if (db !== da) return db - da;
      const pa = primaryContribution(a.club.id, answers, questions);
      const pb = primaryContribution(b.club.id, answers, questions);
      if (pb !== pa) return pb - pa;
      return Number(a.club.id) - Number(b.club.id);
    });

    const top = scored.filter((item) => item.raw > 0).slice(0, 3);
    const empty = top.length === 0;

    return {
      version: 1,
      empty,
      results: top.map((item, index) => ({
        rank: index + 1,
        club: item.club,
        rawScore: item.raw,
        maximumScore: item.max,
        normalizedScore: item.normalized,
        normalizedDisplay: Math.round(Math.min(100, Math.max(0, item.normalized * 100))),
        reasons: reasonsFor(item.club.id, answers, questions)
      })),
      scored
    };
  }

  return {
    validateConfiguration,
    maximumPossibleScore,
    rawScore,
    directActivityMatches,
    primaryContribution,
    reasonsFor,
    compute,
    specialistQuestionIds,
    EXPECTED_QUESTION_COUNT
  };
})();
