-- Liveries that are already part of an imported vehicle pack are detected when the
-- pack is converted and listed for the personal vehicle. They have no files of their
-- own to remove, so they are marked builtin and carry a note on where they were found.
ALTER TABLE personal_liveries
  ADD COLUMN IF NOT EXISTS builtin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS detail VARCHAR(200) NULL;
