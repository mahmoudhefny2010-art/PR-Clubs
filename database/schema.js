const crypto = require('node:crypto');
function identifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unsafe SQL identifier.');
  return `[${name}]`;
}
function describe(model) {
  const indexes = model.schema.indexes().map(([keys, options], n) => ({ keys, options,
    name: `IX_${model.modelName}_${n}_${crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex').slice(0, 6)}` }));
  for (const [n, index] of require('./legacy-indexes').legacyIndexes(model.modelName).entries()) {
    indexes.push({ keys: index.keys, options: { unique: index.unique }, reviewedLegacy: true,
      name: `IX_${model.modelName}_legacy_${n}_${crypto.createHash('sha256').update(JSON.stringify(index.keys)).digest('hex').slice(0, 6)}` });
  }
  const indexed = new Set(indexes.flatMap(i => Object.keys(i.keys)));
  const columns = Object.entries(model.schema.paths).filter(([name, p]) => !name.includes('.') && ['String', 'Number', 'Boolean', 'Date', 'ObjectId'].includes(p.instance)).map(([name, p]) => {
    let type;
    if (p.instance === 'ObjectId') type = 'CHAR(24)';
    else if (p.instance === 'Date') type = 'DATETIME2(3)';
    else if (p.instance === 'Boolean') type = 'BIT';
    else if (p.instance === 'Number') type = name === 'id' || name === 'clubId' || name === 'eventIndex' || name === 'eventRequestId' ? 'BIGINT' : 'FLOAT(53)';
    else type = `NVARCHAR(${indexed.has(name) || name === '_id' ? Math.min(p.options.maxlength || 254, 400) : p.options.maxlength || 'MAX'})`;
    return { name, path: p, type, indexed: indexed.has(name), string: ['String', 'ObjectId'].includes(p.instance) };
  });
  return { name: model.modelName, table: `[dbo].${identifier(model.modelName)}`, columns, indexes, model };
}
function literal(v) { return `N'${String(v).replaceAll("'", "''")}'`; }
function indexFilter(spec, index) {
  const conditions = [];
  const o = index.options;
  // Presence columns distinguish an absent key from an explicitly stored NULL.
  if (o.sparse) conditions.push('(' + Object.keys(index.keys).map(k => `${identifier(`_has_${k}`)} = 1`).join(' OR ') + ')');
  for (const [key, value] of Object.entries(o.partialFilterExpression || {})) {
    const col = spec.columns.find(c => c.name === key);
    if (!col) throw new Error(`Unsupported partial index path ${spec.name}.${key}`);
    if (value === null) conditions.push(`${identifier(key)} IS NULL`);
    else if (typeof value === 'boolean') conditions.push(`${identifier(key)} = ${value ? 1 : 0}`);
    else if (value?.$type === 'string' && col.path.instance === 'String') conditions.push(`${identifier(key)} IS NOT NULL`);
    else throw new Error(`Unsupported partial index predicate ${spec.name}.${key}`);
  }
  // All current sparse indexes have one key. SQL filtered indexes prohibit OR.
  if (o.sparse && Object.keys(index.keys).length !== 1) throw new Error('Compound sparse indexes need an explicit reviewed mapping.');
  return conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
}
function createTable(spec) {
  const definitions = spec.columns.map(c => `${identifier(c.name)} ${c.type}${c.string ? ' COLLATE Latin1_General_100_BIN2' : ''} ${c.name === '_id' || c.path.options.required === true ? 'NOT NULL' : 'NULL'}`);
  definitions.push('[_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1)', '[_version] BIGINT NOT NULL DEFAULT 0', `CONSTRAINT ${identifier(`PK_${spec.name}`)} PRIMARY KEY ([_id])`);
  for (const key of new Set(spec.indexes.filter(i => i.options.sparse).flatMap(i => Object.keys(i.keys)))) definitions.push(`${identifier(`_has_${key}`)} BIT NOT NULL`);
  for (const c of spec.columns) {
    if (c.path.enumValues?.length) definitions.push(`CHECK (${identifier(c.name)} IS NULL OR ${identifier(c.name)} IN (${c.path.enumValues.map(literal).join(', ')}))`);
    for (const [option, operator] of [['min', '>='], ['max', '<=']]) if (typeof c.path.options[option] === 'number') definitions.push(`CHECK (${identifier(c.name)} IS NULL OR ${identifier(c.name)} ${operator} ${c.path.options[option]})`);
    if (c.path.instance === 'ObjectId') definitions.push(`CHECK (${identifier(c.name)} IS NULL OR (LEN(${identifier(c.name)}) = 24 AND ${identifier(c.name)} NOT LIKE '%[^0-9a-f]%'))`);
  }
  const sql = [`CREATE TABLE ${spec.table} (\n  ${definitions.join(',\n  ')}\n);`];
  for (const index of spec.indexes) {
    if (Object.keys(index.keys).some(key => !spec.columns.some(c => c.name === key))) throw new Error(`Index requires explicit mapping: ${spec.name}.${index.name}`);
    sql.push(`CREATE ${index.options.unique ? 'UNIQUE ' : ''}NONCLUSTERED INDEX ${identifier(index.name)} ON ${spec.table} (${Object.entries(index.keys).map(([k, direction]) => `${identifier(k)} ${direction === -1 ? 'DESC' : 'ASC'}`).join(', ')})${indexFilter(spec, index)};`);
  }
  return sql.join('\n');
}
function foreignKeys(specs) {
  const statements = [];
  for (const spec of specs) {
    for (const c of spec.columns) {
      const reference = c.path.options.ref || (spec.name === 'AttendanceRecord' && c.name === 'sessionId' ? 'AttendanceSession' : spec.name === 'SpeakerRequest' && c.name === 'inviteId' ? 'SpeakerInvite' : null);
      if (spec.name === 'SupervisorReview' && c.name === 'supervisorId') {
        statements.push(`ALTER TABLE ${spec.table} ADD [_supervisorReference] CHAR(24) COLLATE Latin1_General_100_BIN2 NULL;`,
          `ALTER TABLE ${spec.table} ADD CONSTRAINT [FK_SupervisorReview_CurrentSupervisor] FOREIGN KEY ([_supervisorReference]) REFERENCES [dbo].[ClubAccount] ([_id]) ON DELETE SET NULL;`);
      } else if (reference) statements.push(`ALTER TABLE ${spec.table} ADD CONSTRAINT ${identifier(`FK_${spec.name}_${c.name}`)} FOREIGN KEY (${identifier(c.name)}) REFERENCES [dbo].${identifier(reference)} ([_id]);`);
    }
    if (spec.columns.some(c => c.name === 'clubId') && spec.name !== 'Club') {
      // 0 is an existing global/MIU scope, never create a fabricated club.
      statements.push(`ALTER TABLE ${spec.table} ADD [_clubReference] BIGINT NULL;`,
        `ALTER TABLE ${spec.table} ADD CONSTRAINT ${identifier(`CK_${spec.name}_clubReference`)} CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));`,
        `ALTER TABLE ${spec.table} ADD CONSTRAINT ${identifier(`FK_${spec.name}_Club`)} FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);`);
    }
  }
  return statements;
}
module.exports = { identifier, describe, createTable, foreignKeys, literal };
