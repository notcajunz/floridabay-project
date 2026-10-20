import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPropertySetup, SETUP_CHANNEL_ID } from '../src/property-setup.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = (file) => fs.readFileSync(path.resolve(here, '..', file), 'utf8');

test('purchases of a property wait for DevOps and announce themselves', () => {
  const economy = source('src/economy.js');
  assert.match(economy, /INSERT INTO org_properties\(item_key,org_id,purchased_by,purchased_at,setup_status\) VALUES\(\?,\?,\?,\?,'pending'\)/);
  assert.match(economy, /propertySetup\?\.announce\(row\.item_key\)/);
  assert.match(economy, /propertySetup\?\.retire\(/);
  assert.equal(SETUP_CHANNEL_ID, '1559610554430005398');
  const index = source('src/index.js');
  assert.match(index, /propsetup:/);
  assert.match(index, /propertySetup\.start\(\)/);
});

test('the setup message names the property, its location and offers both buttons', () => {
  const setup = createPropertySetup({ client: {}, db: {}, audit: async () => {}, authority: null });
  const row = {
    item_key: 'bennys', label: "Benny's", org_id: 4, org_name: 'Los Santos Customs', org_type: 'business', purchased_by: '123456789012345678',
    price: 95000, setup_status: 'pending', data: { area: 'Strawberry', x: -205.7, y: -1310.6, z: 31.3 }, spots: ['door', 'terminal'],
  };
  const embed = setup.embedFor(row).toJSON();
  const text = JSON.stringify(embed);
  assert.match(text, /Strawberry/);
  assert.match(text, /-205\.7, -1310\.6, 31\.3/);
  assert.match(text, /\$95,000/);
  assert.match(text, /Waiting for setup/);
  const [actions] = setup.buttons('bennys', 'pending');
  const [ready, notReady] = actions.toJSON().components;
  assert.equal(ready.custom_id, 'propsetup:ready:bennys');
  assert.equal(notReady.custom_id, 'propsetup:pending:bennys');
  assert.ok(!ready.disabled && notReady.disabled, 'only the matching action is offered');
  const done = setup.buttons('bennys', 'ready')[0].toJSON().components;
  assert.ok(done[0].disabled && !done[1].disabled);
});

test('only Dev Manager and above may press the setup buttons and the owner is messaged', () => {
  const setup = source('src/property-setup.js');
  assert.match(setup, /devopsManagerIds\(DEV_MANAGER_LEVEL\)/);
  assert.match(setup, /DEV_MANAGER_LEVEL = 5/);
  assert.match(setup, /Only Dev Manager and above can mark a property as set up/);
  assert.match(setup, /user\?\.send\(/);
  assert.match(setup, /\/economy\/refresh/);
});
