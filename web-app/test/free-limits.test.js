const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('anonymous and signed-in free generation limits stay at three', () => {
  const analyze = read('web-app/api/analyze.js');
  const extension = read('browser-products/extension/sidepanel.js');
  const migration = read('web-app/api/supabase-migration-v10-anonymous-free-generations.sql');
  const upgradePage = read('web-app/upgrade.html');

  assert.match(analyze, /const ANONYMOUS_MONTHLY_LIMIT = 3;/);
  assert.match(analyze, /const FREE_MONTHLY_LIMIT = 3;/);
  assert.match(extension, /const ANON_TRIAL_LIMIT\s+= 3;/);
  assert.match(migration, /anonymous_limit CONSTANT INTEGER := 3;/);
  assert.match(upgradePage, /3 generations<\/strong> before sign-in/);
  assert.match(upgradePage, /3 more<\/strong> with a free account/);
});
