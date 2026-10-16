-- Ownership gets a sixth callsign (101-106) and Management begins at 107.
UPDATE staff_roster_categories
SET callsign_start=107
WHERE name='Management';

UPDATE staff_roster_categories
SET callsign_end=106
WHERE name='Ownership';
