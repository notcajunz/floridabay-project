-- Emergency classification for personal vehicles. The portal's AI importer proposes this
-- value and managers can correct it before or after creating the personal.
ALTER TABLE personal_vehicles
  ADD COLUMN IF NOT EXISTS emergency_class VARCHAR(16) NOT NULL DEFAULT 'civilian' AFTER bulletproof;

