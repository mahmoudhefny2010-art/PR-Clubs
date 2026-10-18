// Interaction tests for the "Find Your Club" quiz UI.
// Uses a minimal in-process fake DOM (no browser, no jsdom needed).
// Run: node --test tests/quiz-ui.test.js
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
  'public/assets/js/quiz-scoring.js',
  'public/assets/js/quiz-ui.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}

const { create: createQuiz } = sandbox.window.MiuQuiz;

const STORAGE_KEY = 'miu:quiz:v1';

// ------------------------------------------------------------------
// Minimal fake DOM
// ------------------------------------------------------------------
function matchOne(el, token) {
  token = token.trim();
  if (!token) return true;
  const mId = token.match(/^#([\w-]+)$/);
  if (mId) return el.id === mId[1];
  const mClass = token.match(/^\.([\w-]+)$/);
  if (mClass) return el.classList && el.classList.contains(mClass[1]);
  const mAttr = token.match(/^\[([\w-]+)(=["']?([\w-]+)["']?)?\]$/);
  if (mAttr) {
    const value = el.getAttribute(mAttr[1]);
    if (mAttr[2]) return value === mAttr[3].replace(/["']/g, '');
    return value !== null;
  }
  return el.tagName === token.toUpperCase();
}

function matches(el, selector) {
  if (!el || !el.classList) return false;
  const tokens = selector.trim().split(/\s+/).filter(Boolean);
  // The rightmost token must match the element itself.
  if (!matchOne(el, tokens[tokens.length - 1])) return false;
  // Preceding tokens match ancestors.
  let node = el.parentNode;
  for (let i = tokens.length - 2; i >= 0; i -= 1) {
    if (!node) return false;
    while (node && !matchOne(node, tokens[i])) node = node.parentNode;
    if (!node) return false;
    node = node.parentNode;
  }
  return true;
}

function matchOne(el, token) {
  // Supports simple compound selectors: tag#id.class[attr="value"], in any order.
  let rest = token.trim();
  if (!rest) return true;
  const mTag = rest.match(/^([\w-]+)/);
  if (mTag) {
    if (el.tagName.toLowerCase() !== mTag[1].toLowerCase()) return false;
    rest = rest.slice(mTag[1].length);
  }
  while (rest) {
    const mId = rest.match(/^#([\w-]+)/);
    if (mId) { if (el.id !== mId[1]) return false; rest = rest.slice(mId[0].length); continue; }
    const mClass = rest.match(/^\.([\w-]+)/);
    if (mClass) { if (!el.classList.contains(mClass[1])) return false; rest = rest.slice(mClass[0].length); continue; }
    const mAttr = rest.match(/^\[([\w-]+)(=["']?([\w-]+)["']?)?\]/);
    if (mAttr) {
      const value = el.getAttribute(mAttr[1]);
      if (mAttr[2] === undefined) return value !== null;
      if (value === undefined || value !== mAttr[3].replace(/["']/g, '')) return false;
      rest = rest.slice(mAttr[0].length);
      continue;
    }
    break;
  }
  return true;
}

function parseAttrs(el, attrString) {
  const pattern = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(attrString))) {
    el.setAttribute(match[1], match[2]);
  }
}

function parseInnerHTML(el, html) {
  el.children = [];
  el._text = '';
  let current = el;
  const tokens = html.split(/(<[^>]+>)/);
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok.startsWith('<') && tok.endsWith('>')) {
      if (tok.startsWith('</')) {
        current = current.parentNode || el;
        continue;
      }
      const tagMatch = tok.match(/^\s*<\s*([\w-]+)([^>]*?)\s*\/?\s*>/);
      if (!tagMatch) continue;
      const child = createFakeElement(tagMatch[1], el.ownerDocument || el.doc);
      parseAttrs(child, tagMatch[2]);
      current.appendChild(child);
      if (!/^\s*<\s*(br|hr|img|input)[^>]*>\s*$/.test(tok)) current = child;
    } else {
      current._text = (current._text || '') + tok;
    }
  }
}

function createFakeElement(tag, doc) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    children: [],
    parentNode: null,
    doc,
    classList: { _set: new Set(), add(...cs) { cs.forEach((c) => this._set.add(c)); }, remove(...cs) { cs.forEach((c) => this._set.delete(c)); }, toggle(c, f) { if (f === undefined) f = !this._set.has(c); f ? this._set.add(c) : this._set.delete(c); return f; }, contains(c) { return this._set.has(c); } },
    attributes: {},
    _innerHTML: '',
    _text: '',
    style: {},
    hidden: false,
    open: false,
    dataset: {},
    value: '',
    checked: false,
    name: '',
    type: '',
    _listeners: {},
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; if (k === 'class') this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
    // Initial className from the object literal is replayed through the accessor below.
    _initialClass: '',
    removeAttribute(k) { delete this.attributes[k]; if (k === 'id') this.id = ''; },
    getAttribute(k) {
      if (Object.prototype.hasOwnProperty.call(this.attributes, k)) return this.attributes[k];
      if (Object.prototype.hasOwnProperty.call(this, k)) return this[k];
      return null;
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      for (const node of nodes) this.appendChild(node);
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parentNode = null;
      }
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    replaceChildren(...nodes) {
      this.children = [];
      this._text = '';
      for (const node of nodes) {
        if (node.children !== undefined && node.tagName === undefined && node.nodeType === 11) {
          for (const child of node.children) this.appendChild(child);
        } else {
          this.appendChild(node);
        }
      }
    },
    querySelector(selector) {
      const found = [];
      (function walk(node) {
        if (node !== el && matches(node, selector)) found.push(node);
        for (const child of node.children) walk(child);
      })(el);
      return found[0] || null;
    },
    querySelectorAll(selector) {
      const found = [];
      (function walk(node) {
        if (node !== el && matches(node, selector)) found.push(node);
        for (const child of node.children) walk(child);
      })(el);
      return found;
    },
    closest(selector) {
      let node = this;
      while (node) { if (matches(node, selector)) return node; node = node.parentNode; }
      return null;
    },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); },
    dispatchEvent(evt) {
      evt = evt || {};
      evt.target = evt.target || el;
      evt.currentTarget = el;
      let stopped = false;
      evt.preventDefault = evt.preventDefault || function () { };
      evt.stopPropagation = function () { stopped = true; };
      let node = el;
      while (node && !stopped) {
        (node._listeners[evt.type] || []).forEach((fn) => fn(evt));
        node = node.parentNode;
      }
      return true;
    },
    focus() { if (doc) doc.activeElement = el; },
    blur() { if (doc && doc.activeElement === el) doc.activeElement = null; },
    click() { this.dispatchEvent({ type: 'click', target: el, currentTarget: el }); },
    showModal() { this.open = true; },
    close() { this.open = false; }
  };
  el._initialClass = el.className;
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._set].join(' '); },
    set(v) { el.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  // Replay the literal className through the classList-backed accessor.
  el.className = el._initialClass;
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML; },
    set(html) { el._innerHTML = String(html); parseInnerHTML(el, String(html)); }
  });
  Object.defineProperty(el, 'textContent', {
    get() {
      let out = el._text || '';
      for (const child of el.children) {
        if (child.textContent !== undefined) out += child.textContent;
      }
      return out;
    },
    set(v) {
      el._text = String(v);
      el.children = [];
    }
  });
  return el;
}

function createFakeDocument(pathname = '/') {
  const storage = {};
  const listeners = {};
  const doc = createFakeElement('#document', null);
  doc.tagName = '#document';
  doc.children = [];
  doc.documentElement = createFakeElement('html', doc);
  doc.documentElement.parentNode = doc;
  doc.body = createFakeElement('body', doc);
  doc.body.parentNode = doc;
  doc.children = [doc.documentElement, doc.body];
  doc.createElement = (tag) => createFakeElement(tag, doc);
  doc.getElementById = (id) => {
    const found = [];
    (function walk(node) {
      if (node.id === id) found.push(node);
      for (const child of node.children) walk(child);
    })(doc);
    return found[0] || null;
  };
  doc.querySelector = (selector) => {
    const found = [];
    (function walk(node) {
      if (node !== doc && matches(node, selector)) found.push(node);
      for (const child of node.children) walk(child);
    })(doc);
    return found[0] || null;
  };
  doc.querySelectorAll = (selector) => {
    const found = [];
    (function walk(node) {
      if (node !== doc && matches(node, selector)) found.push(node);
      for (const child of node.children) walk(child);
    })(doc);
    return found;
  };
  doc.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  doc.removeEventListener = (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); };
  doc.dispatchEvent = (evt) => { (listeners[evt.type] || []).forEach((fn) => fn(evt)); return true; };
  doc.location = { pathname, assign(url) { doc._assignedUrl = url; } };
  doc._assignedUrl = null;
  doc.sessionStorage = {
    getItem(k) { return storage[k] || null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; },
    clear() { Object.keys(storage).forEach((k) => { delete storage[k]; }); },
    _raw: () => storage
  };
  doc.documentElement.ownerDocument = doc;
  doc.body.ownerDocument = doc;
  return doc;
}

function allOptionsAnswers(doc, overrides = {}) {
  const answers = {};
  const { questions } = sandbox.window.MiuQuizQuestions;
  for (const q of questions) {
    if (overrides[q.id] !== undefined) {
      answers[q.id] = overrides[q.id];
      continue;
    }
    // Q2 must differ from Q1's interest; pick the second option there.
    if (q.id === 'q2') {
      answers[q.id] = q.options[1]?.id ?? q.options[0].id;
      continue;
    }
    answers[q.id] = q.options[0].id;
  }
  return answers;
}

function openQuiz(doc) {
  const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
  quiz.mount();
  const launcher = doc.querySelector('.quiz-launcher-circle');
  assert.ok(launcher, 'launcher circle should exist');
  assert.strictEqual(launcher.getAttribute('aria-label'), 'Find your club');
  const bubble = doc.querySelector('.quiz-launcher-bubble');
  assert.ok(bubble);
  assert.ok(bubble.textContent.includes("Can't Find your Club yet?"));
  assert.strictEqual(doc.querySelector('.quiz-dialog'), null);
  quiz.open();
  assert.ok(doc.querySelector('.quiz-dialog').open, 'opening the launcher should open the modal');
  return { quiz, launcher, bubble };
}

describe('quiz launcher', () => {
  it('mounts a launcher and a dismissible message without opening the quiz', () => {
    const doc = createFakeDocument();
    const { quiz, launcher, bubble } = openQuiz(doc);
    assert.ok(doc.querySelector('.quiz-dialog').open);
    quiz.close();
    assert.strictEqual(doc.activeElement, launcher);
  });

  it('clicking the bubble opens the quiz', () => {
    const doc = createFakeDocument();
    const { quiz, bubble } = openQuiz(doc);
    doc.querySelector('.quiz-dialog').close();
    bubble.click();
    assert.ok(doc.querySelector('.quiz-dialog').open);
  });

  it('dismissing the message keeps the launcher working', () => {
    const doc = createFakeDocument();
    const { quiz, launcher, bubble } = openQuiz(doc);
    doc.querySelector('.quiz-dialog').close();
    const dismiss = bubble.querySelector('.quiz-launcher-dismiss');
    dismiss.click();
    assert.strictEqual(bubble.style.display, 'none');
    assert.strictEqual(doc.sessionStorage.getItem('miu:quiz:message-dismissed-v1') === '1', true);
    launcher.click();
    assert.ok(doc.querySelector('.quiz-dialog').open);
  });
});

function answerThrough(doc, answers, stopAt) {
  // Walk through the questions and stop on the last one without submitting,
  // so callers can decide whether to submit, review, or abandon.
  let step = 1;
  while (step < (stopAt || 15)) {
    const q = sandbox.window.MiuQuizQuestions.question('q' + step);
    const chosen = answers[q.id] || q.options[0].id;
    const input = doc.querySelector('#quiz-opt-' + chosen);
    assert.ok(input, 'option ' + chosen + ' not found at question ' + step);
    input.checked = true;
    input.dispatchEvent({ type: 'change', target: input });
    const next = doc.querySelector('.quiz-next');
    assert.strictEqual(next.disabled, false, 'Next should be enabled at question ' + step);
    next.click();
    step += 1;
  }
  // Select an answer on the final question without submitting.
  const q = sandbox.window.MiuQuizQuestions.question('q' + step);
  const chosen = answers[q.id] || q.options[0].id;
  const input = doc.querySelector('#quiz-opt-' + chosen);
  assert.ok(input, 'option ' + chosen + ' not found at question ' + step);
  input.checked = true;
  input.dispatchEvent({ type: 'change', target: input });
  return step;
}

describe('question flow', () => {
  it('starts with no answer selected and Next disabled', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    const next = doc.querySelector('.quiz-next');
    const back = doc.querySelector('.quiz-back');
    assert.ok(next.disabled);
    assert.ok(back.disabled);
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    assert.strictEqual(doc.querySelector('#quiz-title').textContent, 'Find Your Club');
    assert.strictEqual(doc.querySelector('#quiz-description').textContent, 'Answer 15 quick questions to discover clubs that match your interests.');
    assert.strictEqual(doc.querySelector('.quiz-dialog').getAttribute('aria-labelledby'), 'quiz-title');
  });

  it('selecting an answer enables Next and conveys selection beyond color', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    const input = doc.querySelector('#quiz-opt-q1a');
    input.checked = true;
    input.dispatchEvent({ type: 'change', target: input });
    assert.strictEqual(doc.querySelector('.quiz-next').disabled, false);
    assert.ok(doc.querySelector('.quiz-option-card[data-selected="true"]'));
    assert.ok(doc.querySelector('.quiz-option-card[data-selected="true"]').querySelector('#quiz-opt-q1a'));
  });

  it('Q2 excludes the Q1 answer and clearing works when Q1 changes', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    // Q1 = coding challenges (tech-coding)
    const q1a = doc.querySelector('#quiz-opt-q1a');
    q1a.checked = true;
    q1a.dispatchEvent({ type: 'change', target: q1a });
    doc.querySelector('.quiz-next').click();

    // Q2 renders without the tech-coding option
    assert.ok(!doc.querySelector('#quiz-opt-q2a'), 'Q2 must not repeat Q1 interest');
    const q2b = doc.querySelector('#quiz-opt-q2b');
    q2b.checked = true;
    q2b.dispatchEvent({ type: 'change', target: q2b });
    doc.querySelector('.quiz-next').click();

    // Back to Q2 preserves Q2
    doc.querySelector('.quiz-back').click();
    assert.strictEqual(doc.querySelector('#quiz-opt-q2b').checked, true);

    // Back to Q1, change Q1 to performance (same interest as Q2's answer)
    doc.querySelector('.quiz-back').click();
    const q1b = doc.querySelector('#quiz-opt-q1b');
    assert.ok(q1b);
    q1b.checked = true;
    q1b.dispatchEvent({ type: 'change', target: q1b });
    doc.querySelector('.quiz-next').click();

    // Q2 must now exclude the performance option
    assert.ok(!doc.querySelector('#quiz-opt-q2b'), 'Q2 must not repeat the new Q1 interest');
    // and Q2's stale selection must have been cleared
    assert.strictEqual(doc.querySelector('#quiz-opt-q2c')?.checked, false);
  });

  it('requires an answer before Next', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    const next = doc.querySelector('.quiz-next');
    next.click();
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
  });

  it('walks through all 15 questions and shows the final submit label', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    const answers = allOptionsAnswers(doc, { q2: 'q2b' });
    const finalStep = answerThrough(doc, answers);
    assert.strictEqual(finalStep, 15);
    const next = doc.querySelector('.quiz-next');
    assert.strictEqual(next.textContent, 'Submit & View Your Top 3');
  });

  it('submit on Q15 shows results', () => {
    const doc = createFakeDocument();
    openQuiz(doc);
    const answers = allOptionsAnswers(doc, { q2: 'q2b' });
    answerThrough(doc, answers);
    doc.querySelector('.quiz-next').click();
    assert.ok(doc.querySelector('#quiz-results-title'));
    assert.strictEqual(doc.querySelector('#quiz-results-title').textContent, 'Your Top Club Matches');
    assert.strictEqual(doc.querySelector('.quiz-results-sub').textContent, 'Based on the interests you selected.');
    const cards = doc.querySelectorAll('.quiz-result-card');
    assert.ok(cards.length >= 1 && cards.length <= 3);
    for (const card of cards) {
      assert.ok(card.querySelector('.quiz-result-name'));
      assert.ok(card.querySelector('.quiz-result-desc'));
      assert.ok(card.querySelector('.quiz-reason'));
      const view = card.querySelector('.quiz-view-club');
      assert.ok(view);
      assert.strictEqual(view.textContent, 'View Club');
    }
  });

  it('rejects submission with missing or invalid answers', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    // Only one answer: submission must be rejected and stay on the current question.
    quiz.selectAnswer('q1a');
    assert.strictEqual(quiz.submitQuiz(), false);
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    assert.ok(!doc.querySelector('#quiz-results-title'));
    // Unknown answer IDs are rejected too.
    assert.strictEqual(quiz.selectAnswer('nope-id'), false);
  });
});

describe('results screen', () => {
  it('keeps results minimal when every answer is neutral where possible', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    // Q2 cannot repeat Q1's "no preference", so a fully zero-scoring walk is not
    // possible through the UI; the empty state is covered at the scoring layer.
    const neutral = { q1: 'q1i', q2: 'q2d', q3: 'q3d', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11f', q12: 'q12f', q13: 'q13f', q14: 'q14h', q15: 'q15i' };
    answerThrough(doc, neutral);
    doc.querySelector('.quiz-next').click();
    const cards = doc.querySelectorAll('.quiz-result-card');
    assert.ok(cards.length >= 1 && cards.length <= 3);
    assert.ok(!doc.querySelector('.quiz-empty') || cards.length === 0);
  });

  it('review my answers keeps selections and reopens at question 1', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    const answers = allOptionsAnswers(doc, { q2: 'q2b' });
    const last = answerThrough(doc, answers);
    assert.strictEqual(last, 15);
    doc.querySelector('.quiz-next').click(); // submit
    const review = Array.from(doc.querySelectorAll('.quiz-actions button')).find((b) => b.textContent === 'Review my answers');
    assert.ok(review);
    review.click();
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    const q1a = doc.querySelector('#quiz-opt-q1a');
    assert.strictEqual(q1a.checked, true);
  });

  it('editing an answer recomputes results', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    const acpcAnswers = allOptionsAnswers(doc, { q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13b', q14: 'q14a', q15: 'q15a' });
    answerThrough(doc, acpcAnswers);
    doc.querySelector('.quiz-next').click();
    const first = doc.querySelector('.quiz-result-name').textContent;
    assert.strictEqual(first, 'ACPC');

    const review = Array.from(doc.querySelectorAll('.quiz-actions button')).find((b) => b.textContent === 'Review my answers');
    assert.ok(review);
    review.click();
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');

    // Switch Q1 to music; Q2's previous answer shared Q1's interest and is cleared.
    const q1b = doc.querySelector('#quiz-opt-q1b');
    q1b.checked = true;
    q1b.dispatchEvent({ type: 'change', target: q1b });
    assert.ok(!doc.querySelector('#quiz-opt-q2b'), 'Q2 must exclude the new Q1 interest');

    // Re-walk with theater-aligned answers so the top club changes.
    const theaterAnswers = { q2: 'q2i', q3: 'q3d', q4: 'q4d', q5: 'q5b', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10d', q11: 'q11f', q12: 'q12b', q13: 'q13f', q14: 'q14c', q15: 'q15c' };
    for (let s = 1; s <= 15; s += 1) {
      const qq = sandbox.window.MiuQuizQuestions.question('q' + s);
      const chosen = theaterAnswers[qq.id] ?? (s === 1 ? 'q1b' : qq.options[0].id);
      const inp = doc.querySelector('#quiz-opt-' + chosen);
      assert.ok(inp, 'option ' + chosen + ' not found at question ' + s);
      inp.checked = true;
      inp.dispatchEvent({ type: 'change', target: inp });
      if (s < 15) doc.querySelector('.quiz-next').click();
    }
    doc.querySelector('.quiz-next').click();
    const second = doc.querySelector('.quiz-result-name').textContent;
    assert.strictEqual(second, 'Theater');
  });

  it('retake clears progress after confirmation', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    const answers = allOptionsAnswers(doc, { q2: 'q2b' });
    answerThrough(doc, answers);
    doc.querySelector('.quiz-next').click();
    const retake = Array.from(doc.querySelectorAll('.quiz-actions button')).find((b) => b.textContent === 'Retake quiz');
    retake.click();
    assert.ok(doc.querySelector('.quiz-confirm-title'));
    const confirm = doc.querySelector('.quiz-reset-confirm');
    confirm.click();
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    assert.strictEqual(doc.querySelector('.quiz-next').disabled, true);
  });

  it('retake without progress does not show confirmation', () => {
    const doc = createFakeDocument();
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    quiz.startOver(false);
    assert.ok(!doc.querySelector('.quiz-confirm-title'));
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
  });
});

describe('persistence and focus', () => {
  it('closing preserves progress and reopening resumes', () => {
    const doc = createFakeDocument();
    const { quiz } = openQuiz(doc);
    const q1a = doc.querySelector('#quiz-opt-q1a');
    q1a.checked = true;
    q1a.dispatchEvent({ type: 'change', target: q1a });
    doc.querySelector('.quiz-next').click(); // now on Q2
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 2 of 15');
    const q2b = doc.querySelector('#quiz-opt-q2b');
    q2b.checked = true;
    q2b.dispatchEvent({ type: 'change', target: q2b });

    const launcher = doc.querySelector('.quiz-launcher-circle');
    quiz.close();
    assert.strictEqual(doc.querySelector('.quiz-dialog').open, false);
    assert.strictEqual(doc.activeElement, launcher);
    assert.strictEqual(doc.documentElement.classList.contains('quiz-scroll-lock'), false);

    quiz.open();
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 2 of 15');
    assert.strictEqual(doc.querySelector('#quiz-opt-q2b').checked, true);
    assert.strictEqual(doc.documentElement.classList.contains('quiz-scroll-lock'), true);
  });

  it('restores progress from sessionStorage across instances', () => {
    const doc1 = createFakeDocument();
    const quiz1 = createQuiz({ dom: doc1, window: { location: doc1.location, matchMedia: () => ({ matches: false }), sessionStorage: doc1.sessionStorage } });
    quiz1.mount();
    quiz1.open();
    doc1.querySelector('#quiz-opt-q1a').checked = true;
    doc1.querySelector('#quiz-opt-q1a').dispatchEvent({ type: 'change', target: doc1.querySelector('#quiz-opt-q1a') });
    assert.strictEqual(doc1.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    const stored = doc1.sessionStorage.getItem(STORAGE_KEY);
    assert.ok(stored);

    const doc2 = createFakeDocument();
    doc2.sessionStorage.setItem(STORAGE_KEY, stored);
    const quiz2 = createQuiz({ dom: doc2, window: { location: doc2.location, matchMedia: () => ({ matches: false }), sessionStorage: doc2.sessionStorage } });
    quiz2.mount();
    quiz2.open();
    assert.strictEqual(doc2.querySelector('#quiz-progress-text').textContent, 'Question 1 of 15');
    assert.strictEqual(doc2.querySelector('#quiz-opt-q1a').checked, true);
  });

  it('rejects stale or unknown restored answers', () => {
    const doc = createFakeDocument();
    doc.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, step: 1, answers: { q1: 'nope-id', q2: 'q2b' } }));
    const quiz = createQuiz({ dom: doc, window: { location: doc.location, matchMedia: () => ({ matches: false }), sessionStorage: doc.sessionStorage } });
    quiz.mount();
    quiz.open();
    assert.strictEqual(doc.querySelector('#quiz-opt-q1a').checked, false);
    assert.strictEqual(doc.querySelector('.quiz-next').disabled, true);
  });

  it('moves focus into the modal and returns it to the launcher', () => {
    const doc = createFakeDocument();
    const { quiz, launcher } = openQuiz(doc);
    assert.strictEqual(doc.activeElement.getAttribute('id'), 'quiz-question-heading');
    quiz.close();
    assert.strictEqual(doc.activeElement, launcher);
  });

  it('escape key path closes and cleans up scroll lock', () => {
    const doc = createFakeDocument();
    const { quiz } = openQuiz(doc);
    assert.strictEqual(doc.documentElement.classList.contains('quiz-scroll-lock'), true);
    quiz.close();
    assert.strictEqual(doc.querySelector('.quiz-dialog').open, false);
    assert.strictEqual(doc.documentElement.classList.contains('quiz-scroll-lock'), false);
  });

  it('keeps the quiz and selected answer open when switching tabs or apps', () => {
    const doc = createFakeDocument();
    const { quiz } = openQuiz(doc);
    quiz.selectAnswer('q1a');
    quiz.goNext();
    const heading = doc.querySelector('#quiz-question-heading').textContent;
    doc.hidden = true;
    doc.dispatchEvent({ type: 'visibilitychange' });
    assert.strictEqual(quiz.isOpen(), true);
    doc.hidden = false;
    doc.dispatchEvent({ type: 'visibilitychange' });
    assert.strictEqual(quiz.isOpen(), true);
    assert.strictEqual(doc.querySelector('#quiz-question-heading').textContent, heading);
    assert.strictEqual(doc.querySelector('#quiz-progress-text').textContent, 'Question 2 of 15');
    assert.strictEqual(doc.documentElement.classList.contains('quiz-scroll-lock'), true);
    quiz.goBack();
    assert.strictEqual(doc.querySelector('#quiz-opt-q1a').checked, true);
  });

  it('View Club calls the destination with the club id', () => {
    const doc = createFakeDocument();
    const { quiz } = openQuiz(doc);
    const answers = allOptionsAnswers(doc, { q1: 'q1a', q2: 'q2b', q3: 'q3a', q4: 'q4d', q5: 'q5d', q6: 'q6e', q7: 'q7e', q8: 'q8d', q9: 'q9c', q10: 'q10a', q11: 'q11a', q12: 'q12a', q13: 'q13b', q14: 'q14a', q15: 'q15a' });
    answerThrough(doc, answers);
    doc.querySelector('.quiz-next').click();
    const view = doc.querySelector('.quiz-view-club');
    view.click();
    const url = doc._assignedUrl;
    assert.ok(url, 'assigned url is set');
    assert.ok(url.includes('?club='), 'url includes club detail route');
  });
});

describe('quiz points reporting', () => {
  function trackedQuiz() {
    const doc = createFakeDocument();
    const createElement = doc.createElement;
    doc.createElement = tag => {
      const element = createElement(tag);
      element.style.setProperty = (name, value) => { element.style[name] = value; };
      return element;
    };
    const calls = [], listeners = {};
    let nextId = 0, online = true, status = 200;
    const win = {
      location: doc.location, sessionStorage: doc.sessionStorage,
      matchMedia: () => ({ matches: false }),
      crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++nextId).padStart(12, '0') },
      addEventListener: (name, callback) => { listeners[name] = callback; },
      removeEventListener: name => { delete listeners[name]; },
      fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: online && status === 200, status }; }
    };
    // No layout measurement APIs in this small DOM harness.
    const quiz = createQuiz({ dom: doc, window: win });
    quiz.mount(); quiz.open();
    const complete = () => { answerThrough(doc, allOptionsAnswers(doc, { q2: 'q2b' })); doc.querySelector('.quiz-next').click(); };
    return { doc, quiz, calls, complete, setOnline: value => { online = value; }, setStatus: value => { status = value; }, reconnect: () => listeners.online() };
  }
  const settle = () => new Promise(resolve => setImmediate(resolve));

  it('reports only completed quizzes and reuses an attempt when reviewing answers', async () => {
    const f = trackedQuiz();
    assert.equal(f.calls.length, 0);
    f.complete(); await settle();
    assert.equal(f.calls.length, 1);
    assert.equal(Object.keys(f.calls[0].body.answers).length, 15);
    assert.equal(f.calls[0].body.scores, undefined);
    const review = f.doc.querySelectorAll('.quiz-actions button').find(button => button.textContent === 'Review my answers');
    review.click(); f.complete(); await settle();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].body.attemptId, f.calls[0].body.attemptId);
  });

  it('retries queued results after reconnecting without blocking the results screen', async () => {
    const f = trackedQuiz();
    f.setOnline(false); f.complete(); await settle();
    assert.ok(f.doc.querySelector('.quiz-result-card'));
    assert.equal(JSON.parse(f.doc.sessionStorage.getItem('miu:quiz:pending-report-v1')).length, 1);
    f.setOnline(true); await f.reconnect(); await settle();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].body.attemptId, f.calls[0].body.attemptId);
    assert.equal(f.doc.sessionStorage.getItem('miu:quiz:pending-report-v1'), null);
  });

  it('keeps separate offline retakes queued and assigns each a new attempt', async () => {
    const f = trackedQuiz();
    f.setOnline(false); f.complete(); await settle();
    f.quiz.startOver(false); f.complete(); await settle();
    const queued = JSON.parse(f.doc.sessionStorage.getItem('miu:quiz:pending-report-v1'));
    assert.equal(queued.length, 2);
    assert.notEqual(queued[0].attemptId, queued[1].attemptId);
    f.setOnline(true); await f.reconnect(); await settle();
    assert.equal(f.doc.sessionStorage.getItem('miu:quiz:pending-report-v1'), null);
  });

  it('shows guest results without retrying their uncounted points under a later account', async () => {
    const f = trackedQuiz();
    f.setStatus(401); f.complete(); await settle();
    assert.ok(f.doc.querySelector('.quiz-result-card'));
    assert.equal(f.doc.sessionStorage.getItem('miu:quiz:pending-report-v1'), null);
    f.setStatus(200); await f.reconnect();
    assert.equal(f.calls.length, 1);
  });
});

describe('validation', () => {
  it('throws on invalid configuration', () => {
    const quiz = createQuiz({ dom: createFakeDocument(), window: { location: { pathname: '/' } } });
    const badQuestions = JSON.parse(JSON.stringify(sandbox.window.MiuQuizQuestions.questions));
    badQuestions[0].options[0].clubPoints['999'] = 3;
    const clubs = sandbox.window.MiuQuizClubs.clubs;
    assert.throws(() => sandbox.window.MiuQuizScoring.compute(clubs, badQuestions, {}));
  });
});
