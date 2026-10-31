import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server-data/resources/[fbrp]/fbrp_core/web');
const app = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(web, 'styles.css'), 'utf8');

test('the spawn selector has no San Andreas map but keeps the list, selection and spawn button', () => {
  const spawns = app.slice(app.indexOf('function renderSpawns'), app.indexOf('function renderControl'));
  assert.doesNotMatch(spawns, /spawn-map|Location overview|San Andreas|class="dot|MAP\./);
  assert.doesNotMatch(app, /const MAP = |\.spawn-map/);
  assert.doesNotMatch(css, /spawn-map|SAN ANDREAS/);
  assert.match(spawns, /data-spawn-preview/);
  assert.match(spawns, /class="spawn-confirm"[^>]*data-spawn-id/);
  assert.match(spawns, /<section class="spawn-detail">/);
  assert.match(css, /\.spawn-detail \.spawn-confirm/);
});
