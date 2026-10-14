const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog } = require('../database/catalog');
const { schemaSql } = require('../scripts/sqlserver-schema.cjs');

test('reviewed live legacy indexes retain their uniqueness in SQL without changing Mongo declarations', () => {
  const specs = catalog();
  const expected = { StudentFeedback: 1, AttendanceRecord: 2, AttendanceSession: 1 };
  const sql = schemaSql();
  for (const [name, count] of Object.entries(expected)) {
    const spec = specs.find(item => item.name === name);
    const legacy = spec.indexes.filter(index => index.reviewedLegacy);
    assert.equal(legacy.length, count);
    for (const index of legacy) {
      assert.ok(Object.keys(index.keys).every(key => spec.columns.some(column => column.name === key)));
      assert.ok(sql.includes('INDEX [' + index.name + ']'));
      if (name !== 'AttendanceSession') assert.ok(sql.includes('CREATE UNIQUE NONCLUSTERED INDEX [' + index.name + ']'));
    }
    assert.equal(spec.model.schema.indexes().some(([keys]) => JSON.stringify(keys) === JSON.stringify(legacy[0].keys)), false);
  }
});
