-- Bulletproof personals: bullets do not break the glass or reach anyone inside,
-- and the people inside cannot shoot out.
ALTER TABLE personal_vehicles
  ADD COLUMN IF NOT EXISTS bulletproof BOOLEAN NOT NULL DEFAULT FALSE AFTER enabled;
