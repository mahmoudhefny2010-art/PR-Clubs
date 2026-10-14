const { identifier, literal } = require('./schema');
const { parts } = require('./values');
// Predicates run on SQL Server; values are always bound parameters.
function compile(spec, filter = {}) {
  const parameters = []; let serial = 0;
  const bind = value => { const name = `q${parameters.length}`; parameters.push({ name, value }); return '@' + name; };
  function walk(object, root = '[_payload]', top = true) {
    return Object.entries(object).map(([path, rule]) => {
      if (path === '$or' || path === '$and' || path === '$nor') {
        if (!Array.isArray(rule)) throw new Error('Logical predicates require arrays.');
        const condition = rule.length ? '(' + rule.map(f => walk(f, root, top)).join(path === '$and' ? ' AND ' : ' OR ') + ')' : path === '$and' ? '1=1' : '1=0';
        return path === '$nor' ? `NOT (${condition})` : condition;
      }
      if (path.startsWith('$')) throw new Error(`Unsupported SQL predicate ${path}`);
      parts(path);
      const [parent, ...rest] = path.split('.');
      if (top && rest.length && spec.model.schema.path(parent)?.instance === 'Array') {
        const alias = `j${serial++}`;
        return `EXISTS (SELECT 1 FROM OPENJSON(${root}, ${literal('$."' + parent + '"')}) ${alias} WHERE ${walk({ [rest.join('.')]: rule }, `${alias}.[value]`, false)})`;
      }
      const column = top && spec.columns.find(c => c.name === path);
      const arraySchema = top && spec.model.schema.path(path)?.instance === 'Array' ? spec.model.schema.path(path) : null;
      const p = column?.path || arraySchema?.$embeddedSchemaType;
      const jsonPath = '$.' + path.split('.').map(k => `"${k}"`).join('.');
      const scalar = column ? identifier(path) : `JSON_VALUE(${root}, ${literal(jsonPath)}) COLLATE Latin1_General_100_BIN2`;
      const exists = `EXISTS (SELECT 1 FROM OPENJSON(${root}${path.includes('.') ? ', ' + literal('$.' + path.split('.').slice(0, -1).map(k => `"${k}"`).join('.')) : ''}) WHERE [key] COLLATE Latin1_General_100_BIN2 = ${bind(path.split('.').at(-1))})`;
      function cast(value) {
        if (value == null) return value;
        return p ? p.castForQuery(null, value) : value;
      }
      function comparison(expression, value, operator = '=') {
        value = cast(value);
        if (value == null) return `${expression} IS ${operator === '<>' ? 'NOT ' : ''}NULL`;
        const param = bind(value instanceof Date ? value : value?.toHexString ? String(value) : value);
        let compare = expression;
        if (!column && (typeof value === 'number' || typeof value === 'boolean')) compare = `TRY_CONVERT(FLOAT, ${expression})`;
        if (!column && value instanceof Date) compare = `TRY_CONVERT(DATETIME2(3), ${expression}, 127)`;
        const exact = typeof value === 'string' && ['=', '<>'].includes(operator) ? ` AND DATALENGTH(${expression}) = DATALENGTH(${param})` : '';
        if (operator === '<>') return `(${expression} IS NULL OR NOT (${compare} = ${param}${typeof value === 'string' ? ` AND DATALENGTH(${expression}) = DATALENGTH(${param})` : ''}))`;
        return `(${compare} ${operator} ${param}${exact})`;
      }
      const arrayPath = top && spec.model.schema.path(path)?.instance === 'Array';
      const scalarMatch = value => {
        if (!arrayPath) return comparison(scalar, value);
        const alias = `j${serial++}`;
        return `EXISTS (SELECT 1 FROM OPENJSON(${root}, ${literal(jsonPath)}) ${alias} WHERE ${comparison(`${alias}.[value] COLLATE Latin1_General_100_BIN2`, value)})`;
      };
      function compactList(input, negate) {
        const values = input.map(cast), nonNull = values.filter(v => v != null);
        const kinds = new Set(nonNull.map(v => v?.toHexString ? 'objectId' : typeof v));
        if (kinds.size !== 1 || !['string', 'number', 'objectId'].includes([...kinds][0]) || arrayPath && values.includes(null)) return null;
        const kind = [...kinds][0], numeric = kind === 'number';
        const param = bind(JSON.stringify(nonNull.map(v => v?.toHexString ? String(v) : v)));
        const list = `in${serial++}`, element = `el${serial++}`;
        const expression = arrayPath ? `${element}.[value] COLLATE Latin1_General_100_BIN2` : scalar;
        const left = numeric && !column ? `TRY_CONVERT(FLOAT, ${expression})` : expression;
        const right = `${list}.[value]${numeric ? '' : ' COLLATE Latin1_General_100_BIN2'}`;
        const exact = kind === 'string' ? ` AND DATALENGTH(${expression}) = DATALENGTH(${list}.[value])` : '';
        const from = `${arrayPath ? `OPENJSON(${root}, ${literal(jsonPath)}) ${element} CROSS JOIN ` : ''}OPENJSON(${param}) WITH ([value] ${numeric ? 'FLOAT' : 'NVARCHAR(MAX)'} '$') ${list}`;
        const condition = `${values.includes(null) ? `${scalar} IS NULL OR ` : ''}EXISTS (SELECT 1 FROM ${from} WHERE ${left} = ${right}${exact})`;
        return negate ? `NOT (${condition})` : `(${condition})`;
      }
      if (!rule || typeof rule !== 'object' || rule instanceof Date || rule.toHexString || Array.isArray(rule)) {
        if (Array.isArray(rule)) throw new Error('Exact array filters require an explicit repository operation.');
        return scalarMatch(rule);
      }
      return Object.entries(rule).map(([op, value]) => {
        if (op === '$eq') return scalarMatch(value);
        if (op === '$ne') return value == null && !arrayPath ? `${scalar} IS NOT NULL` : `NOT (${scalarMatch(value)})${!arrayPath && value != null ? ` OR ${scalar} IS NULL` : ''}`;
        if (op === '$in' || op === '$nin') {
          if (value.length > 100) { const compact = compactList(value, op === '$nin'); if (compact) return compact; }
          const clause = value.length ? value.map(scalarMatch).join(' OR ') : '1=0';
          return op === '$nin' ? `(${!arrayPath && !value.includes(null) ? scalar + ' IS NULL OR ' : ''}NOT (${clause}))` : `(${clause})`;
        }
        if (op === '$exists') return value ? exists : `NOT (${exists})`;
        if (op === '$type' && value === 'string') return `${scalar} IS NOT NULL`;
        if (['$gt', '$gte', '$lt', '$lte'].includes(op)) return comparison(scalar, value, { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op]);
        if (op === '$elemMatch') { const alias = `j${serial++}`; return `EXISTS (SELECT 1 FROM OPENJSON(${root}, ${literal(jsonPath)}) ${alias} WHERE ${walk(value, `${alias}.[value]`, false)})`; }
        throw new Error(`Unsupported SQL predicate ${op}`);
      }).map(c => `(${c})`).join(' AND ') || '1=1';
    }).map(c => `(${c})`).join(' AND ') || '1=1';
  }
  const text = walk(filter);
  if (parameters.length > 1800) throw new Error('Query exceeds supported parameter limit; use a batched repository operation.');
  return { text, parameters };
}
module.exports = { compile };
