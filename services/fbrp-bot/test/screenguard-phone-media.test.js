import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, '../../../server-data');
const read = (relative) => fs.readFileSync(path.join(serverData, relative), 'utf8');

test('screen guard does not treat the cinematic camera as a stuck screen', () => {
  const source = read('resources/[fbrp]/fbrp_core/client/screenguard.lua');
  assert.match(source, /not check\(IsGameplayCamRendering\) and not check\(IsCinematicCamRendering\)/);
});

test('screen guard gives a scripted spawn time to stream before calling the fade stuck', () => {
  const guard = read('resources/[fbrp]/fbrp_core/client/screenguard.lua');
  const characters = read('resources/[fbrp]/fbrp_core/client/characters.lua');
  assert.match(guard, /AddEventHandler\('fbrp:screen:expect'/);
  assert.match(guard, /held\('fade', not check\(IsScreenFadedIn\) and GetGameTimer\(\) >= graceUntil/);
  const fadeOut = characters.indexOf('DoScreenFadeOut(350)');
  const begin = characters.indexOf("TriggerEvent('fbrp:screen:expect',60000)");
  const end = characters.indexOf("TriggerEvent('fbrp:screen:expect',0)");
  assert.ok(fadeOut !== -1 && begin > fadeOut, 'grace starts with the spawn fade-out');
  assert.ok(end > begin, 'grace ends once the spawn finishes');
});

test('FiveManage token can come from the private sky_phone_fivemanage_token convar', () => {
  const provider = read('resources/[standalone]/sky_phone/source/server/media_provider_config.lua');
  assert.match(provider, /GetConvar\(SkyPhoneMediaProviderConfig\.FiveManageTokenConvar/);
  assert.match(provider, /FiveManageTokenConvar = "sky_phone_fivemanage_token"/);
  assert.match(read('secrets.cfg.example'), /^set sky_phone_fivemanage_token ""$/m);
  const tracked = read('resources/[standalone]/sky_phone/config/media.lua');
  assert.match(tracked, /FiveManage = \{\s*ApiKey = "",/, 'no token is committed in config/media.lua');
});
