const { clone, get, set, matches, expr, projection, sort } = require('./values');
const EJSON = require('mongoose').mongo.BSON.EJSON;
const keyOf = value => EJSON.stringify(value, { relaxed: false });

async function* transform(source, operator, spec) {
  if (operator === '$group') {
    const groups = new Map();
    const accumulators = Object.entries(spec).filter(([key]) => key !== '_id').map(([key, value]) => {
      const [method] = Object.keys(value);
      if (Object.keys(value).length !== 1 || !['$sum', '$avg', '$first', '$push', '$addToSet'].includes(method)) throw new Error('Unsupported group accumulator.');
      return { key, method, input: value[method] };
    });
    for await (const doc of source) {
      const id = expr(spec._id, doc) ?? null, fingerprint = keyOf(id);
      let group = groups.get(fingerprint);
      if (!group) {
        group = { result: { _id: id }, states: new Map() };
        for (const a of accumulators) {
          group.result[a.key] = a.method === '$sum' ? 0 : a.method === '$avg' ? null : a.method === '$push' || a.method === '$addToSet' ? [] : undefined;
          group.states.set(a.key, { count: 0, total: 0, seen: new Set() });
        }
        groups.set(fingerprint, group);
      }
      for (const a of accumulators) {
        const value = expr(a.input, doc), state = group.states.get(a.key);
        if (a.method === '$sum' && typeof value === 'number') group.result[a.key] += value;
        else if (a.method === '$avg' && typeof value === 'number') { state.total += value; state.count++; }
        else if (a.method === '$first' && !state.count++) group.result[a.key] = value ?? null;
        else if (a.method === '$push' && value !== undefined) group.result[a.key].push(value);
        else if (a.method === '$addToSet' && value !== undefined) {
          const key = keyOf(value);
          if (!state.seen.has(key)) { state.seen.add(key); group.result[a.key].push(value); }
        }
      }
    }
    for (const group of groups.values()) {
      for (const a of accumulators) if (a.method === '$avg') { const state = group.states.get(a.key); group.result[a.key] = state.count ? state.total / state.count : null; }
      yield group.result;
    }
    return;
  }
  if (operator === '$sort') {
    const rows = []; for await (const doc of source) rows.push(doc);
    yield* sort(rows, spec); return;
  }
  if (operator === '$count') {
    let count = 0; for await (const doc of source) count++;
    if (count) yield { [spec]: count }; return;
  }
  if (!['$match', '$project', '$unwind'].includes(operator)) throw new Error(`Unsupported aggregate stage ${operator}`);
  for await (const doc of source) {
    if (operator === '$match') { if (matches(doc, spec)) yield doc; }
    else if (operator === '$project') yield projection(doc, spec);
    else {
      if (typeof spec !== 'string' || !spec.startsWith('$')) throw new Error('Unsupported unwind configuration.');
      const field = spec.slice(1), value = get(doc, field);
      if (value == null) continue;
      for (const item of Array.isArray(value) ? value : [value]) { const next = clone(doc); set(next, field, item); yield next; }
    }
  }
}
async function aggregateStream(source, pipeline) {
  for (const stage of pipeline) {
    if (!stage || Object.keys(stage).length !== 1) throw new Error('Invalid aggregate stage.');
    const [operator] = Object.keys(stage);
    source = transform(source, operator, stage[operator]);
  }
  const result = []; for await (const doc of source) result.push(doc);
  return result;
}
module.exports = { aggregateStream };
