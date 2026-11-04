// Enforces the 4-layer rule: api -> services -> data -> models; each layer only imports downward.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const ALLOWED = { api: ['services', 'models'], services: ['data', 'models'], data: ['models'], models: [] };
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]);

for (const layer of Object.keys(ALLOWED)) {
  test(`${layer} layer only imports from: ${ALLOWED[layer].join(', ') || '(nothing in src)'}`, () => {
    for (const f of files(path.join(SRC, layer)).filter(f => f.endsWith('.js'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        const target = path.resolve(path.dirname(f), m[1]);
        const rel = path.relative(SRC, target).split(path.sep);
        if (rel[0].startsWith('..')) continue;
        const targetLayer = Object.keys(ALLOWED).includes(rel[0]) ? rel[0] : null;
        const ok = rel[0] === layer || (targetLayer && ALLOWED[layer].includes(targetLayer)) || rel[0] === 'config.js' || rel[0] === 'config';
        assert.ok(ok, `${path.relative(SRC, f)} must not import ${m[1]}`);
      }
    }
  });
}

test('SQL lives only in the data layer', () => {
  for (const layer of ['api', 'services', 'models']) {
    for (const f of files(path.join(SRC, layer))) {
      assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i, `SQL found in ${path.relative(SRC, f)}`);
    }
  }
});

test('api layer does not use pg directly; data layer has no express/HTTP', () => {
  for (const f of files(path.join(SRC, 'api'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /require\(['"]pg['"]\)/);
  for (const f of files(path.join(SRC, 'data'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /require\(['"]express['"]\)|\bres\.status\b/);
});
