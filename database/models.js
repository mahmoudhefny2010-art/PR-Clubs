const runtime = require('./runtime');
const { describe, identifier } = require('./schema');
const { compile } = require('./query');
const values = require('./values');
const registry = new Map();
function selectionMap(selection) {
  return typeof selection === 'string' ? Object.fromEntries(selection.split(/\s+/).filter(Boolean).map(k => [k.replace(/^[-+]/, ''), k.startsWith('-') ? 0 : 1])) : selection;
}
function bindParameters(request, parameters) {
  const sql = runtime.driver();
  for (const { name, value } of parameters) request.input(name, value instanceof Date ? sql.DateTime2(3) : typeof value === 'number' ? sql.Float : typeof value === 'boolean' ? sql.Bit : sql.NVarChar(sql.MAX), value);
  return request;
}
async function rows(spec, filter, options = {}, session, lock = false) {
  if (session?.pending) await session.pending;
  const where = compile(spec, filter);
  let suffix = '';
  if (options.sort) suffix = ' ORDER BY ' + Object.entries(options.sort).map(([key, direction]) => {
    if (!spec.columns.some(c => c.name === key)) throw new Error('Sorting requires a mapped scalar column.');
    if (![1, -1].includes(direction)) throw new Error('Invalid sort direction.');
    return `${identifier(key)} ${direction === -1 ? 'DESC' : 'ASC'}`;
  }).join(', ');
  let top = '';
  if (options.limit) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 0) throw new Error('Invalid limit.');
    top = `TOP (${options.limit}) `;
  }
  const result = await bindParameters(runtime.request(session), where.parameters).query(`SELECT ${top}[_payload], [_version] FROM ${spec.table}${lock ? ' WITH (UPDLOCK, HOLDLOCK)' : ''} WHERE ${where.text}${suffix};`);
  return result.recordset.map(row => ({ data: values.revive(require('mongoose').mongo.BSON.EJSON.parse(row._payload), spec.model.schema), version: Number(row._version) }));
}
async function* streamRows(spec, filter, session) {
  if (session?.pending) await session.pending;
  const where = compile(spec, filter);
  const request = bindParameters(runtime.request(session), where.parameters);
  const stream = request.toReadableStream({ highWaterMark: 50 });
  let failure, completed = false;
  const completion = request.query(`SELECT [_payload] FROM ${spec.table} WHERE ${where.text};`)
    .then(() => { completed = true; }, error => { failure = error; stream.destroy(error); });
  try {
    for await (const row of stream) yield values.revive(require('mongoose').mongo.BSON.EJSON.parse(row._payload), spec.model.schema);
    await completion;
    if (failure) throw failure;
  } finally {
    if (!completed) request.cancel();
    stream.destroy();
    await completion;
  }
}
function attach(spec, doc, version, session) {
  doc.$locals.sqlVersion = version;
  doc.$locals.sqlSession = session;
  doc.save = async function (options = {}) {
    await doc.validate();
    if (doc.isNew) {
      const created = await create(spec, doc.toObject({ depopulate: true }), options.session || session);
      doc.$init(created.toObject()); doc.isNew = false; doc.$locals.sqlVersion = created.$locals.sqlVersion; return doc;
    }
    const paths = doc.directModifiedPaths();
    const operation = { $set: {}, $unset: {} };
    for (const key of paths) { const v = doc.get(key); if (v === undefined) operation.$unset[key] = 1; else operation.$set[key] = v?.toObject ? v.toObject() : values.clone(v); }
    if (!paths.length) return doc;
    const changed = await mutate(spec, 'findOneAndUpdate', { _id: doc._id }, operation,
      { new: true, runValidators: true, expectedVersion: doc.$locals.sqlVersion }, options.session || doc.$locals.sqlSession);
    if (!changed) throw Object.assign(new Error('The record changed concurrently. Reload before saving.'), { status: 409, code: 'VERSION_CONFLICT' });
    doc.$init(changed.data); doc.isNew = false; doc.$locals.sqlVersion = changed.version; return doc;
  };
  return doc;
}
function materialize(spec, row, query) {
  if (!row) return null;
  const data = values.projection(row.data, query.options.selection, spec.model.schema);
  if (query.options.lean) return data;
  const doc = spec.model.hydrate(data, selectionMap(query.options.selection));
  return attach(spec, doc, row.version, query.sessionValue);
}
function scalarValue(column, value) {
  if (value == null) return null;
  if (column.path.instance === 'ObjectId') {
    if (!/^[a-f0-9]{24}$/.test(String(value))) throw new Error(`Invalid ObjectId for ${column.name}`);
    return String(value);
  }
  if (column.path.instance === 'Boolean' && typeof value !== 'boolean') throw new Error(`Invalid boolean for ${column.name}`);
  if (column.path.instance === 'String') {
    if (typeof value !== 'string') throw new Error(`Invalid string ${column.name}`);
    const length = /^NVARCHAR\((\d+)\)/.exec(column.type);
    if (length && value.length > Number(length[1])) throw new Error(`Value exceeds reviewed SQL length for ${column.name}; no truncation permitted.`);
    if (column.indexed && / $/.test(value)) throw new Error(`Trailing spaces in indexed ${column.name} require explicit review before SQL migration.`);
  }
  if (column.path.instance === 'Number' && (!Number.isFinite(value) || column.type === 'BIGINT' && !Number.isSafeInteger(value))) throw new Error(`Invalid or unsafe numeric value for ${column.name}`);
  if (column.path.instance === 'Date' && (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getUTCFullYear() < 1 || value.getUTCFullYear() > 9999)) throw new Error(`Date is outside SQL Server range for ${column.name}`);
  return value;
}
function stored(spec, data) {
  // Serialization must be lossless for the application's supported BSON subset.
  function check(value) {
    if (value === undefined) throw new Error('An explicitly undefined value requires migration review.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite data cannot be stored.'); return; }
    if (value instanceof Date) { if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() < 1 || value.getUTCFullYear() > 9999) throw new Error('Invalid/out-of-range date.'); return; }
    if (value.toHexString) return;
    if (Array.isArray(value)) { if (value.some(item => item === undefined)) throw new Error('Undefined array entries require explicit migration handling.'); value.forEach(check); return; }
    if (value.constructor !== Object) throw new Error('Unsupported BSON/object type requires an explicit migration mapping.');
    Object.values(value).forEach(check);
  }
  check(data);
  const result = Object.fromEntries(spec.columns.map(c => [c.name, scalarValue(c, data[c.name])]));
  result._payload = require('mongoose').mongo.BSON.EJSON.stringify(data);
  for (const key of new Set(spec.indexes.filter(i => i.options.sparse).flatMap(i => Object.keys(i.keys)))) result[`_has_${key}`] = Object.hasOwn(data, key) && data[key] !== undefined;
  if (spec.columns.some(c => c.name === 'clubId') && spec.name !== 'Club') result._clubReference = data.clubId || null;
  return result;
}
async function write(spec, data, version, session, insert) {
  const fields = stored(spec, data), request = runtime.request(session);
  if (spec.name === 'SupervisorReview') {
    const parent = await runtime.request(session).input('id', String(data.supervisorId)).query('SELECT [_id] FROM [dbo].[ClubAccount] WHERE [_id]=@id;');
    fields._supervisorReference = parent.recordset[0]?._id || null;
  }
  const sql = runtime.driver();
  const names = Object.keys(fields);
  names.forEach((name, n) => {
    const column = spec.columns.find(c => c.name === name), value = fields[name];
    let type = sql.NVarChar(sql.MAX);
    if (name === '_version' || name === '_clubReference' || column?.type === 'BIGINT') type = sql.BigInt;
    else if (name.startsWith('_has_') || column?.type === 'BIT') type = sql.Bit;
    else if (column?.type === 'FLOAT(53)') type = sql.Float;
    else if (column?.type === 'DATETIME2(3)') type = sql.DateTime2(3);
    else if (column?.type === 'CHAR(24)') type = sql.Char(24);
    // Keep MAX parameters so SQL cannot silently truncate a value on binding.
    request.input(`w${n}`, type, value);
  });
  request.input('expectedVersion', sql.BigInt, version || 0);
  try {
    const result = await request.query(insert
      ? `INSERT INTO ${spec.table} (${names.map(identifier).join(', ')}) VALUES (${names.map((_, n) => `@w${n}`).join(', ')});`
      : `UPDATE ${spec.table} SET ${names.filter(n => n !== '_id').map(n => `${identifier(n)} = @w${names.indexOf(n)}`).join(', ')}, [_version] = [_version] + 1 WHERE [_id] = @w${names.indexOf('_id')} AND [_version] = @expectedVersion;`);
    if (!insert && result.rowsAffected[0] !== 1) throw Object.assign(new Error('Concurrent database change.'), { status: 409, code: 'VERSION_CONFLICT' });
  } catch (error) { throw runtime.normalizeError(error, spec); }
}
async function create(spec, input, session) {
  return runtime.transaction(session, async active => {
    const doc = new spec.model(input);
    const now = new Date();
    if (spec.model.schema.options.timestamps) { doc.createdAt ||= now; doc.updatedAt ||= now; }
    if (spec.model.schema.options.versionKey !== false && doc[spec.model.schema.options.versionKey] === undefined) doc[spec.model.schema.options.versionKey] = 0;
    await doc.validate();
    const data = doc.toObject({ depopulate: true, flattenMaps: true });
    await write(spec, data, 0, active, true);
    return attach(spec, spec.model.hydrate(data), 0, session);
  });
}
function upsertSeed(filter) {
  const seed = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$')) continue;
    if (value === null || typeof value !== 'object' || value instanceof Date || value?.toHexString) values.set(seed, key, value);
    else if (Object.hasOwn(value, '$eq')) values.set(seed, key, value.$eq);
  }
  return seed;
}
async function mutate(spec, method, filter, operation, options, session) {
  return runtime.transaction(session, async active => {
    const many = ['updateMany', 'deleteMany'].includes(method);
    const deleting = ['deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method);
    const found = await rows(spec, filter, { sort: options.sort, limit: many ? 0 : 1 }, active, true);
    if (options.expectedVersion !== undefined && found[0]?.version !== options.expectedVersion) return null;
    let inserted = false;
    if (!found.length && options.upsert && !deleting) {
      const data = values.update(upsertSeed(filter), operation, true);
      const doc = await create(spec, data, active); inserted = true;
      found.push({ data: doc.toObject(), version: 0 });
    }
    const original = found[0] && values.clone(found[0]);
    let changed = 0;
    for (const row of found) {
      if (inserted) continue;
      if (deleting) {
        const result = await runtime.request(active).input('id', String(row.data._id)).query(`DELETE FROM ${spec.table} WHERE [_id] = @id;`);
        changed += result.rowsAffected[0]; continue;
      }
      let data = values.update(row.data, operation);
      if (spec.model.schema.options.timestamps && options.timestamps !== false) data.updatedAt = new Date();
      const validated = spec.model.hydrate(data);
      // Mongoose is retained only for schema casting, defaults and validation.
      if (options.runValidators) await validated.validate();
      const casted = validated.toObject({ depopulate: true, flattenMaps: true });
      // Retain undeclared legacy fields and exact absence while applying casting
      // to fields actually present; ordinary updates do not retrofit defaults.
      for (const key of Object.keys(data)) if (Object.hasOwn(casted, key)) data[key] = casted[key];
      if (values.equal(data, row.data)) continue;
      await write(spec, data, row.version, active, false); row.data = data; row.version++; changed++;
    }
    if (method === 'findOneAndDelete') return original || null;
    if (method === 'findOneAndUpdate') return inserted && !options.new && options.returnDocument !== 'after' ? null : options.new || options.returnDocument === 'after' ? found[0] || null : original || null;
    if (deleting) return { acknowledged: true, deletedCount: changed };
    return { acknowledged: true, matchedCount: inserted ? 0 : found.length, modifiedCount: changed, upsertedCount: inserted ? 1 : 0, upsertedId: inserted ? found[0].data._id : null };
  });
}
class Query {
  constructor(spec, method, filter, operation, options = {}) { Object.assign(this, { spec, method, filter: filter || {}, operation, options: { ...options, selection: options.selection || options.projection }, sessionValue: options.session }); }
  select(value) { this.options.selection = value; return this; }
  sort(value) { this.options.sort = value; return this; }
  limit(value) { this.options.limit = value; return this; }
  lean(value = true) { this.options.lean = value; return this; }
  session(value) { this.sessionValue = value; return this; }
  read(value) { if (value !== 'primary') throw new Error('SQL queries support primary reads only.'); return this; }
  readConcern(value) { if (value !== 'majority') throw new Error('Unsupported consistency policy.'); return this; }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
  finally(fn) { return this.exec().finally(fn); }
  exec() { return this.promise ||= this.execute(); }
  async execute() {
    const { spec, method } = this;
    if (this.sessionValue?.pending) await this.sessionValue.pending;
    if (method === 'countDocuments' || method === 'exists') {
      const where = compile(spec, this.filter);
      const sql = method === 'exists' ? `SELECT TOP (1) [_id] FROM ${spec.table} WHERE ${where.text};` : `SELECT COUNT_BIG(*) AS count FROM ${spec.table} WHERE ${where.text};`;
      const result = await bindParameters(runtime.request(this.sessionValue), where.parameters).query(sql);
      return method === 'exists' ? result.recordset[0] || null : Number(result.recordset[0].count);
    }
    if (method === 'aggregate') {
      const pipeline = this.operation;
      const first = pipeline[0]?.$match;
      return require('./aggregate-stream').aggregateStream(streamRows(spec, first || {}, this.sessionValue), first ? pipeline.slice(1) : pipeline);
    }
    if (method === 'distinct') {
      const data = await rows(spec, this.filter, {}, this.sessionValue);
      const vals = data.flatMap(r => { const v = values.get(r.data, this.operation); return v === undefined ? [] : Array.isArray(v) ? v : [v]; });
      return vals.filter((v, n) => vals.findIndex(other => values.equal(other, v)) === n);
    }
    if (['find', 'findOne'].includes(method)) {
      const data = await rows(spec, this.filter, { ...this.options, limit: method === 'findOne' ? 1 : this.options.limit }, this.sessionValue);
      return method === 'findOne' ? materialize(spec, data[0], this) : data.map(row => materialize(spec, row, this));
    }
    const result = await mutate(spec, method, this.filter, this.operation, this.options, this.sessionValue);
    return method.startsWith('findOneAnd') ? materialize(spec, result, this) : result;
  }
}
function bindModel(model) {
  if (registry.has(model.modelName)) return registry.get(model.modelName).proxy;
  const spec = describe(model);
  const methods = {};
  for (const method of ['find', 'findOne', 'countDocuments', 'exists', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete']) methods[method] = (filter, operation, options) => {
    if (['find', 'findOne', 'countDocuments', 'exists', 'deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method)) {
      if (['deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method)) options = operation;
      else options = { ...options, selection: operation };
      operation = undefined;
    }
    return new Query(spec, method, filter, operation, options);
  };
  methods.findById = (id, selection, options) => methods.findOne({ _id: id }, selection, options);
  methods.findByIdAndUpdate = (id, update, options) => methods.findOneAndUpdate({ _id: id }, update, options);
  methods.findByIdAndDelete = (id, options) => methods.findOneAndDelete({ _id: id }, options);
  methods.aggregate = pipeline => new Query(spec, 'aggregate', {}, pipeline);
  methods.distinct = (key, filter) => new Query(spec, 'distinct', filter, key).lean();
  methods.create = async (input, options = {}) => {
    if (!Array.isArray(input)) return create(spec, input, options.session);
    const result = await runtime.transaction(options.session, async active => { const created = []; for (const data of input) created.push(await create(spec, data, active)); return created; });
    if (!options.session) for (const doc of result) doc.$locals.sqlSession = undefined;
    return result;
  };
  methods.insertMany = (input, options) => methods.create(input, options);
  methods.bulkWrite = async (operations, options = {}) => runtime.transaction(options.session, async session => {
    const result = { acknowledged: true, matchedCount: 0, modifiedCount: 0, insertedCount: 0, upsertedCount: 0, deletedCount: 0 };
    for (const operation of operations) {
      const [method] = Object.keys(operation), value = operation[method];
      if (method === 'insertOne') { await create(spec, value.document, session); result.insertedCount++; continue; }
      if (!['updateOne', 'updateMany', 'deleteOne', 'deleteMany'].includes(method)) throw new Error(`Unsupported bulk operation ${method}`);
      const changed = await mutate(spec, method, value.filter, value.update, value, session);
      for (const key of ['matchedCount', 'modifiedCount', 'upsertedCount', 'deletedCount']) result[key] += changed[key] || 0;
    }
    return result;
  });
  methods.init = methods.createIndexes = async () => { if (!runtime.connection.readyState) throw new Error('SQL schema is not ready. Apply versioned migrations explicitly.'); return spec.proxy; };
  spec.proxy = new Proxy(model, {
    get(target, key) { if (Object.hasOwn(methods, key)) return methods[key]; return Reflect.get(target, key); },
    construct(target, args) { return attach(spec, new target(...args), 0); }
  });
  registry.set(model.modelName, spec); return spec.proxy;
}
module.exports = { bindModel, registry, Query, stored, write, rows, scalarValue };
