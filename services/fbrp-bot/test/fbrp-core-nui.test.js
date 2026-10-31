import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Loads the fbrp_core NUI script against a stub DOM so the CAD/MDT and
// My Citizen renderers can be exercised without a game client.
const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, '../../../server-data/resources/[fbrp]/fbrp_core/web/app.js');

function stubElement() {
  const target = function () {};
  const el = new Proxy(target, {
    get(_, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (prop === 'dataset') return {};
      if (prop === 'children') return { length: 0 };
      if (prop === 'querySelector') return () => el;
      if (prop === 'querySelectorAll') return () => [];
      if (prop === 'then') return undefined;
      return el;
    },
    set() { return true; },
    apply() { return el; },
  });
  return el;
}

function loadApp() {
  const dom = stubElement();
  const context = {
    console,
    document: { querySelector: () => dom, querySelectorAll: () => [], addEventListener() {}, createElement: () => dom, body: dom, documentElement: dom, activeElement: null },
    window: { addEventListener() {}, innerWidth: 1920, innerHeight: 1080 }, innerWidth: 1920, innerHeight: 1080,
    fetch: async () => ({ json: async () => ({ ok: true }) }),
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 },
    URLSearchParams, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, Intl,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), context, { filename: 'app.js' });
  return (code) => vm.runInContext(code, context);
}

const citizen = {
  id: 12, citizen: 'FB-000012', firstName: 'Mara', lastName: 'Quill', dob: '1995-04-02', gender: 'Female', backstory: 'Charter captain.',
  identity: { canChange: true, cooldownDays: 7, minAge: 18 },
  details: { nickname: '<img src=x onerror=alert(1)>', heightCm: 170, eyeColor: 'Green', theme: 'sunset', showAddress: true, showPhone: false, showLicenses: true, address: '12 Seagrape Way', phone: '555-0123', organDonor: true },
  card: { id: 12, name: 'Mara Quill', citizen: 'FB-000012', dob: '1995-04-02', gender: 'Female', theme: 'sunset', licenses: [{ label: 'Driver license', status: 'valid' }] },
  aliases: [{ name: 'Mara Quell', changedAt: 1700000000000 }],
  licenses: [
    { id: 'driver', label: 'Driver license', status: 'valid', selfIssue: true, showOnId: true, restriction: 'Corrective lenses', issuedAt: 1700000000000 },
    { id: 'firearm', label: 'Firearm permit', status: 'none' },
    { id: 'pilot', label: 'Pilot license', status: 'pending' },
    { id: 'boat', label: 'Boat license', status: 'suspended' },
  ],
  vehicles: [{ plate: 'BAY 123', model: 'sultan', label: 'Sultan', stolen: false, impounded: false, registered_at: 1700000000000 }],
  history: [{ id: 1, kind: 'citation', charges: [{ title: 'Speeding' }], fine: 150, months: 0, officer_name: 'Officer Ray', created_at: 1700000000000 }],
  options: { themes: [{ id: 'classic', label: 'Bay Classic' }, { id: 'sunset', label: 'Sunset' }], eyeColors: ['Green'], hairColors: ['Black'], bloodTypes: ['O+'], restrictions: ['Corrective lenses'], maxHeightCm: 230, maxWeightKg: 250 },
};

test('character and spawn screens preview a choice before confirming it', () => {
  const run = loadApp();
  const characters = {
    maxSlots: 3,
    characters: [
      { id: 7, first_name: 'Avery', last_name: 'Stone', date_of_birth: '1994-08-17', gender: 'Female', backstory: 'Local dockworker.', citizen: 'FB-000007', nationality: 'Cuban', height_cm: 170 },
      { id: 9, first_name: 'Miles', last_name: 'Reed', date_of_birth: '1988-11-02', gender: 'Male', backstory: '' },
    ],
    playtime: 5400,
  };
  const characterHtml = run(`ui.showCharacterForm = false; ui.selectedCharacterId = 7; renderCharacters(${JSON.stringify(characters)})`);
  assert.match(characterHtml, /class="onboarding character-select"/);
  assert.match(characterHtml, /data-character-preview="7"/);
  assert.match(characterHtml, /data-character-id="7"/);
  assert.match(characterHtml, /Character Statistics/);
  assert.match(characterHtml, /FB-000007/);
  assert.match(characterHtml, /Cuban/);
  assert.match(characterHtml, /170 cm/);
  assert.match(characterHtml, /1h 30m/);
  assert.match(characterHtml, /class="slot slot-new" data-new-character/);
  const formHtml = run(`ui.showCharacterForm = true; renderCharacters(${JSON.stringify({ ...characters, nationalities: ['Cuban'], defaultNationality: 'American' })})`);
  assert.match(formHtml, /name="nationality"[^>]*value="American"/);
  assert.match(formHtml, /<option value="Cuban">/);
  assert.match(formHtml, /name="heightCm"/);

  const spawns = {
    character: { name: 'Avery Stone' },
    spawns: [
      { id: 'legion', label: 'Legion Square', description: 'Downtown', x: 215, y: -810, z: 30, h: 0 },
      { id: 'sandy', label: 'Sandy Shores', description: 'Blaine County', x: 1800, y: 3700, z: 34, h: 180 },
    ],
  };
  const spawnHtml = run(`ui.selectedSpawnId = 'legion'; renderSpawns(${JSON.stringify(spawns)})`);
  assert.match(spawnHtml, /class="onboarding spawn-select"/);
  assert.match(spawnHtml, /data-spawn-preview="legion"/);
  assert.match(spawnHtml, /class="spawn-confirm" data-spawn-id="legion"/);
  assert.match(spawnHtml, /Selected location/);
});

test('My Citizen renders every tab and escapes player text', () => {
  const run = loadApp();
  run('currentView = "citizen"; ui.citizen = { tab: "identity" };');
  for (const tab of ['identity', 'details', 'card', 'licenses', 'vehicles', 'record']) {
    const html = run(`ui.citizen.tab = "${tab}"; renderCitizen(${JSON.stringify(citizen)})`);
    assert.match(html, /Mara Quill/);
    assert.match(html, /FB-000012/);
    assert.doesNotMatch(html, /<img src=x/, `${tab} tab must escape the nickname`);
  }
  const details = run(`renderCitizen.call(null, ${JSON.stringify(citizen)}) && (ui.citizen.tab = "details", renderCitizen(${JSON.stringify(citizen)}))`);
  assert.match(details, /&lt;img src=x/);
  const licenses = run(`ui.citizen.tab = "licenses"; renderCitizen(${JSON.stringify(citizen)})`);
  assert.match(licenses, /data-citizen-license="licenseApply" data-license="firearm"/);
  assert.match(licenses, /Withdraw/);
  assert.match(licenses, /Speak to a licensing officer/);
  const locked = run(`ui.citizen.tab = "identity"; renderCitizen(${JSON.stringify({ ...citizen, identity: { canChange: false, reason: 'Locked.' } })})`);
  assert.match(locked, /Locked\./);
  assert.match(locked, /disabled/);
});

test('ID card shows themed details and a licenses row', () => {
  const run = loadApp();
  const html = run(`idCardMarkup(${JSON.stringify({ ...citizen.card, nickname: 'Cap', heightCm: 170, address: '12 Seagrape Way', organDonor: true, warrants: 2 })})`);
  assert.match(html, /Florida Bay ID/);
  assert.match(html, /12 Seagrape Way/);
  assert.match(html, /Driver license/);
  assert.match(html, /2 active warrants/);
  assert.match(html, /Donor/);
});

test('CAD dashboard, dispatch, profile and reports render the new panels', () => {
  const run = loadApp();
  const payload = {
    statuses: [{ id: 'available', label: '10-8', short: '10-8', tone: 'ok' }], flags: [], reportKinds: ['Incident', 'Arrest'],
    licenses: [{ id: 'firearm', label: 'Firearm permit' }], penal: [],
    dashboard: {
      units: [], warrants: [], bolos: [], inmates: [], services: [], records: [], seizures: [], stats: { mine: {} },
      me: { id: 1, unit: { status: 'available' } },
      calls: [{ id: 5, kind: '911', caller: 'Sam', message: 'Shots fired', at: Date.now(), priority: 1, responders: [], notes: [] }],
      history: [{ id: 4, kind: '311', message: 'Noise complaint', at: Date.now(), closedAt: Date.now(), closedBy: 'Officer Ray', priority: 3, notes: 1 }],
      applications: [{ character_id: 12, kind: 'firearm', name: 'Mara Quill', updated_at: Date.now() }],
    },
  };
  run(`currentView = "mdt"; currentPayload = ${JSON.stringify(payload)}; mdtInit(currentPayload);`);
  const dash = run('ui.mdt.tab = "dashboard"; renderMdt()');
  assert.match(dash, /License applications/);
  assert.match(dash, /data-mdt-license-review="1"/);
  const dispatch = run('ui.mdt.tab = "dispatch"; renderMdt()');
  assert.match(dispatch, /Recently closed/);
  assert.match(dispatch, /P1/);
  assert.match(dispatch, /data-mdt-call-prio="5"/);
  const profile = {
    id: 12, name: 'Mara Quill', citizen: 'FB-000012', dob: '1995-04-02', gender: 'Female', flags: [], records: [], warrants: [], vehicles: [], notes: [], reports: [],
    details: { nickname: 'Cap', phone: '555-0123', heightCm: 170 }, aliases: [{ name: 'Mara Quell' }], lastSeen: Date.now(),
    licenses: [{ id: 'firearm', label: 'Firearm permit', status: 'pending', updatedBy: 'Mara Quill' }],
  };
  const html = run(`ui.mdt.profile = ${JSON.stringify(profile)}; ui.mdt.tab = "profile"; renderMdt()`);
  assert.match(html, /Citizen details/);
  assert.match(html, /Known aliases/);
  assert.match(html, /Mara Quell/);
  assert.match(html, /data-approve="1" data-refresh="profile"/);
  const reports = run('ui.mdt.tab = "reports"; ui.mdt.reports = []; renderMdt()');
  assert.match(reports, /All types/);
  const report = run(`ui.mdt.report = ${JSON.stringify({ id: 9, kind: 'Incident', title: 'T', narrative: 'N', author_name: 'A', created_at: 1, citizens: [], officers: [], addenda: [{ body: 'Later note', author_name: 'B', created_at: 2 }] })}; ui.mdt.tab = "report"; renderMdt()`);
  assert.match(report, /Later note/);
  assert.match(report, /mdt-addendum-form/);
});

test('MDT lists Wraith plate reader reads and flags suspended owners', () => {
  const run = loadApp();
  const alpr = [
    { plate: 'HOT 1', cam: 'front', at: Date.now(), registered: true, model: 'Buffalo', owner: '<b>Rex</b>', hits: ['STOLEN', 'BOLO #3'], locked: true },
    { plate: 'NPC 22', cam: 'rear', at: Date.now(), registered: false, hits: [], locked: true },
  ];
  const payload = {
    statuses: [{ id: 'available', label: '10-8', short: '10-8', tone: 'ok' }], flags: [], reportKinds: ['Incident'], licenses: [], penal: [],
    dashboard: { units: [], warrants: [], bolos: [], inmates: [], services: [], records: [], seizures: [], calls: [], history: [], stats: { mine: {} }, me: { id: 1, unit: { status: 'available' } }, alpr },
  };
  run(`currentView = "mdt"; currentPayload = ${JSON.stringify(payload)}; mdtInit(currentPayload);`);
  const dash = run('ui.mdt.tab = "dashboard"; renderMdt()');
  assert.match(dash, /Plate reader/);
  assert.match(dash, /data-mdt-plate-open="HOT 1"/);
  assert.match(dash, /STOLEN/);
  assert.match(dash, /Rear camera · locked/);
  assert.doesNotMatch(dash, /<b>Rex<\/b>/);
  const plates = run(`ui.mdt.plate = ${JSON.stringify({ plate: 'HOT 1', registered: true, model: 'Buffalo', owner: 'Rex', license: 'suspended', flags: ['Armed & dangerous'], bolos: [] })}; ui.mdt.tab = "plates"; renderMdt()`);
  assert.match(plates, /Your plate reader reads/);
  assert.match(plates, /Owner driver license suspended/);
  assert.match(plates, /Owner flag: Armed &amp; dangerous/);
});

test('/showid previews the caller card, accepts a target id and is served by the server', () => {
  const root = new URL('../../../server-data/resources/%5Bfbrp%5D/fbrp_core/', import.meta.url);
  const client = fs.readFileSync(new URL('client/justice.lua', root), 'utf8');
  const server = fs.readFileSync(new URL('server/justice.lua', root), 'utf8');
  assert.match(client, /RegisterCommand\('showid', function\(_, args\)/);
  assert.match(client, /TriggerServerEvent\('fbrp:idcard:own'\)/);
  assert.match(server, /RegisterNetEvent\('fbrp:idcard:own'/);
});

test('placing someone in a vehicle detaches an escorted ped and verifies the warp', () => {
  const root = new URL('../../../server-data/resources/%5Bfbrp%5D/fbrp_core/', import.meta.url);
  const client = fs.readFileSync(new URL('client/interactions.lua', root), 'utf8');
  const seat = client.slice(client.indexOf("action == 'seat'"), client.indexOf("action == 'unseat'"));
  assert.match(seat, /DetachEntity\(ped,true,false\)/);
  assert.match(seat, /seatInVehicle\(ped,vehicle\)/);
  assert.match(client, /SetPedIntoVehicle\(ped,vehicle,seat\)/);
});
