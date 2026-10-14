-- Locked personals: the DevOps team can lock a personal vehicle. A locked
-- vehicle cannot be spawned and despawns when anyone tries to use it.
ALTER TABLE personal_vehicles
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE AFTER bulletproof,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(32) NULL AFTER locked,
  ADD COLUMN IF NOT EXISTS locked_at BIGINT NULL AFTER locked_by;
