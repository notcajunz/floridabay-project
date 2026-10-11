-- Network server types are now main, staff, gang, department, community, business, partner and other.
-- Rename the retired types on servers and on global role scopes.
UPDATE network_guilds SET kind='gang' WHERE kind='clan';
UPDATE network_guilds SET kind='department' WHERE kind='organization';
UPDATE network_guilds SET kind='other' WHERE kind NOT IN ('main','staff','gang','department','community','business','partner','other');
UPDATE network_syncs SET scope='gang' WHERE scope='clan';
UPDATE network_syncs SET scope='department' WHERE scope='organization';
