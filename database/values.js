const mongoose = require('mongoose');
function clone(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return new Date(value);
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(String(value));
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}
function parts(path) {
  const result = path.split('.');
  if (result.some(p => !/^[A-Za-z_][A-Za-z0-9_]*$|^\d+$/.test(p) || ['__proto__', 'constructor', 'prototype'].includes(p))) throw new Error('Unsupported field path.');
  return result;
}
function get(doc, path) {
  return parts(path).reduce((v, key) => Array.isArray(v) && !/^\d+$/.test(key) ? v.map(item => item?.[key]).flat() : v?.[key], doc);
}
function set(doc, path, value) {
  const keys = parts(path); let current = doc;
  for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]] ||= /^\d+$/.test(keys[i + 1]) ? [] : {};
  if (value === undefined) delete current[keys.at(-1)]; else current[keys.at(-1)] = value;
}
function comparable(v) { return v instanceof Date ? v.getTime() : v instanceof mongoose.Types.ObjectId ? String(v) : v; }
function equal(a, b) {
  if (a == null && b == null) return true;
  a = comparable(a); b = comparable(b);
  return a === b || a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b);
}
function testValue(v, rule) {
  if (rule && typeof rule === 'object' && !(rule instanceof Date) && !(rule instanceof mongoose.Types.ObjectId) && !Array.isArray(rule)) {
    if (!Object.keys(rule).some(k => k.startsWith('$'))) return equal(v, rule);
    return Object.entries(rule).every(([op, x]) => {
      if (op === '$eq') return testValue(v, x);
      if (op === '$ne') return !testValue(v, x);
      if (op === '$in') return x.some(item => testValue(v, item));
      if (op === '$nin') return !x.some(item => testValue(v, item));
      if (op === '$exists') return (v !== undefined) === Boolean(x);
      if (op === '$type') return x === 'string' ? typeof v === 'string' : x === 'number' ? typeof v === 'number' : x === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : false;
      if (op === '$elemMatch') return Array.isArray(v) && v.some(item => matches(item, x));
      if (['$gt', '$gte', '$lt', '$lte'].includes(op)) {
        if (v == null) return false;
        const a = comparable(v), b = comparable(x);
        return ({ $gt: a > b, $gte: a >= b, $lt: a < b, $lte: a <= b })[op];
      }
      throw new Error(`Unsupported value predicate ${op}`);
    });
  }
  return Array.isArray(v) && !Array.isArray(rule) ? v.some(item => equal(item, rule)) : equal(v, rule);
}
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, rule]) => {
    if (key === '$or') return rule.some(f => matches(doc, f));
    if (key === '$and') return rule.every(f => matches(doc, f));
    if (key === '$nor') return !rule.some(f => matches(doc, f));
    if (key.startsWith('$')) throw new Error(`Unsupported filter ${key}`);
    return testValue(get(doc, key), rule);
  });
}
function expr(value, doc, vars = {}) {
  if (typeof value === 'string') {
    if (value.startsWith('$$')) { const [key, ...rest] = value.slice(2).split('.'); return rest.length ? get(vars[key], rest.join('.')) : vars[key]; }
    return value.startsWith('$') ? get(doc, value.slice(1)) : value;
  }
  if (!value || value instanceof Date || value instanceof mongoose.Types.ObjectId || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => expr(v, doc, vars));
  const keys = Object.keys(value);
  if (keys.length !== 1 || !keys[0].startsWith('$')) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expr(v, doc, vars)]));
  const op = keys[0], input = value[op], ev = v => expr(v, doc, vars);
  switch (op) {
    case '$literal': return input;
    case '$ifNull': { const v = ev(input[0]); return v == null ? ev(input[1]) : v; }
    case '$cond': return ev(input[0]) ? ev(input[1]) : ev(input[2]);
    case '$eq': return equal(ev(input[0]), ev(input[1]));
    case '$ne': return !equal(ev(input[0]), ev(input[1]));
    case '$lt': return comparable(ev(input[0])) < comparable(ev(input[1]));
    case '$lte': return comparable(ev(input[0])) <= comparable(ev(input[1]));
    case '$gt': return comparable(ev(input[0])) > comparable(ev(input[1]));
    case '$gte': return comparable(ev(input[0])) >= comparable(ev(input[1]));
    case '$or': return input.some(v => ev(v));
    case '$and': return input.every(v => ev(v));
    case '$add': return input.reduce((total, v) => total + Number(ev(v)), 0);
    case '$size': { const a = ev(input); if (!Array.isArray(a)) throw new Error('$size requires an array.'); return a.length; }
    case '$isArray': return Array.isArray(ev(input));
    case '$toLower': return String(ev(input) ?? '').toLowerCase();
    case '$trim': return String(ev(input.input) ?? '').trim();
    case '$toString': { const v = ev(input); return v == null ? null : String(v); }
    case '$toLong': { const v = ev(input); return v instanceof Date ? v.getTime() : Number(v); }
    case '$concat': return input.map(ev).join('');
    case '$arrayElemAt': return ev(input[0])?.at(Number(ev(input[1])));
    case '$range': { const [a, b, step = 1] = input.map(ev); if (!step || Math.abs((b - a) / step) > 100000) throw new Error('Invalid/oversized range.'); return Array.from({ length: Math.max(0, Math.ceil((b - a) / step)) }, (_, i) => a + i * step); }
    case '$let': return expr(input.in, doc, { ...vars, ...Object.fromEntries(Object.entries(input.vars).map(([k, v]) => [k, ev(v)])) });
    case '$map': return ev(input.input).map(item => expr(input.in, doc, { ...vars, [input.as || 'this']: item }));
    case '$mergeObjects': return Object.assign({}, ...input.map(ev));
    case '$type': { const v = ev(input); return v === undefined ? 'missing' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }
    case '$convert': { const v = ev(input.input); if (v == null) return input.onNull; if (input.to !== 'string') throw new Error('Unsupported conversion.'); return typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId) ? input.onError : String(v); }
    case '$regexMatch': return new RegExp(input.regex).test(String(ev(input.input)));
    default: throw new Error(`Unsupported database expression ${op}`);
  }
}
function copyPath(source, target, keys) {
  if (!keys.length) return;
  const [key, ...rest] = keys;
  if (source?.[key] === undefined) return;
  if (!rest.length) { target[key] = clone(source[key]); return; }
  if (Array.isArray(source[key])) {
    const output = target[key] ||= source[key].map(() => ({}));
    source[key].forEach((item, n) => copyPath(item, output[n], rest));
  } else copyPath(source[key], target[key] ||= {}, rest);
}
function removePath(doc, keys) {
  const [key, ...rest] = keys;
  if (!rest.length) { delete doc[key]; return; }
  if (Array.isArray(doc[key])) doc[key].forEach(item => removePath(item, rest));
  else if (doc[key]) removePath(doc[key], rest);
}
function projection(doc, selection, schema) {
  let spec = typeof selection === 'string' ? Object.fromEntries(selection.split(/\s+/).filter(Boolean).map(k => [k.replace(/^[-+]/, ''), k.startsWith('-') ? 0 : k.startsWith('+') ? 2 : 1])) : selection || {};
  const inclusive = Object.values(spec).some(v => v !== 0 && v !== 2);
  const result = inclusive ? {} : clone(doc);
  if (inclusive) {
    if (spec._id !== 0 && doc._id !== undefined) result._id = clone(doc._id);
    for (const [key, flag] of Object.entries(spec)) {
      if (!flag) continue;
      if (flag === 1 || flag === 2) copyPath(doc, result, parts(key));
      else { const value = expr(flag, doc); if (value !== undefined) set(result, key, value); }
    }
  } else for (const [key, flag] of Object.entries(spec)) if (flag === 0) removePath(result, parts(key));
  for (const [key, p] of Object.entries(schema?.paths || {})) if (p.options.select === false && !spec[key]) removePath(result, parts(key));
  return result;
}
function update(doc, operation, inserted = false) {
  const result = clone(doc);
  if (Array.isArray(operation)) {
    for (const stage of operation) {
      if (Object.keys(stage).length !== 1 || !stage.$set) throw new Error('Unsupported update pipeline stage.');
      const computed = Object.entries(stage.$set).map(([key, value]) => [key, expr(value, result)]);
      for (const [key, value] of computed) set(result, key, value);
    }
    return result;
  }
  for (const [op, fields] of Object.entries(operation)) {
    if (!op.startsWith('$')) { set(result, op, clone(fields)); continue; }
    for (const [key, value] of Object.entries(fields)) {
      const current = get(result, key);
      switch (op) {
        case '$set': set(result, key, clone(value)); break;
        case '$setOnInsert': if (inserted && get(result, key) === undefined) set(result, key, clone(value)); break;
        case '$unset': set(result, key, undefined); break;
        case '$inc': if (current != null && typeof current !== 'number') throw new Error('Cannot increment a non-number.'); set(result, key, (current || 0) + value); break;
        case '$push': { const items = value?.$each || [value]; if (value?.$each && Object.keys(value).some(k => k !== '$each')) throw new Error('Unsupported push modifier.'); set(result, key, [...(current || []), ...clone(items)]); break; }
        case '$addToSet': { const a = [...(current || [])]; for (const item of value?.$each || [value]) if (!a.some(v => equal(v, item))) a.push(clone(item)); set(result, key, a); break; }
        case '$pull': set(result, key, (current || []).filter(item => !(typeof item === 'object' && value && typeof value === 'object' && !Object.keys(value).some(k => ['$in', '$eq'].includes(k)) ? matches(item, value) : testValue(item, value)))); break;
        default: throw new Error(`Unsupported update operator ${op}`);
      }
    }
  }
  return result;
}
function sort(rows, ordering = {}) {
  return rows.sort((a, b) => {
    for (const [key, direction] of Object.entries(ordering)) {
      const x = comparable(get(a, key)), y = comparable(get(b, key));
      if (equal(x, y)) continue;
      return (x == null ? -1 : y == null ? 1 : x < y ? -1 : 1) * direction;
    }
    return 0;
  });
}
function aggregate(rows, pipeline) {
  for (const stage of pipeline) {
    const [op] = Object.keys(stage), spec = stage[op];
    if (Object.keys(stage).length !== 1) throw new Error('Invalid aggregate stage.');
    if (op === '$match') rows = rows.filter(d => matches(d, spec));
    else if (op === '$sort') rows = sort(rows, spec);
    else if (op === '$project') rows = rows.map(d => projection(d, spec));
    else if (op === '$unwind') { const key = spec.replace(/^\$/, ''); rows = rows.flatMap(d => (get(d, key) || []).map(v => { const next = clone(d); set(next, key, v); return next; })); }
    else if (op === '$count') rows = rows.length ? [{ [spec]: rows.length }] : [];
    else if (op === '$group') {
      const groups = new Map();
      for (const d of rows) { const id = expr(spec._id, d) ?? null, k = JSON.stringify(id); const g = groups.get(k) || { id, rows: [] }; g.rows.push(d); groups.set(k, g); }
      rows = [...groups.values()].map(g => {
        const result = { _id: g.id };
        for (const [key, accumulator] of Object.entries(spec)) {
          if (key === '_id') continue;
          const [method] = Object.keys(accumulator), vals = g.rows.map(d => expr(accumulator[method], d));
          if (method === '$sum') result[key] = vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
          else if (method === '$avg') { const numbers = vals.filter(v => typeof v === 'number'); result[key] = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null; }
          else if (method === '$first') result[key] = vals[0];
          else if (method === '$push') result[key] = vals;
          else if (method === '$addToSet') result[key] = vals.filter((v, n) => vals.findIndex(other => equal(other, v)) === n);
          else throw new Error(`Unsupported accumulator ${method}`);
        }
        return result;
      });
    } else throw new Error(`Unsupported aggregate stage ${op}`);
  }
  return rows;
}
function revive(data, schema) {
  const result = clone(data);
  for (const [key, p] of Object.entries(schema.paths)) {
    if (key.includes('.') || result[key] == null) continue;
    if (p.instance === 'Date') result[key] = new Date(result[key]);
    else if (p.instance === 'ObjectId') result[key] = new mongoose.Types.ObjectId(result[key]);
    else if (p.schema) result[key] = p.instance === 'Array' ? result[key].map(item => revive(item, p.schema)) : revive(result[key], p.schema);
  }
  return result;
}
module.exports = { clone, parts, get, set, comparable, equal, matches, expr, projection, update, sort, aggregate, revive };
