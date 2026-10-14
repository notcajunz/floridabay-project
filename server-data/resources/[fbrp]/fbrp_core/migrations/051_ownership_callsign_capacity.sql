-- Reserve 101-105 for Ownership and begin Management at 106.
UPDATE staff_roster_categories
SET callsign_end=105
WHERE name='Ownership';

UPDATE staff_roster_categories
SET callsign_start=106
WHERE name='Management';
