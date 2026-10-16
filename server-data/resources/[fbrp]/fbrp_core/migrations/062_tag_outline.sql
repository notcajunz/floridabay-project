-- Per-tag switch for the outline drawn around overhead tag text (GTA black outline or the light halo on dark colors).
ALTER TABLE headtags
  ADD COLUMN IF NOT EXISTS outline BOOLEAN NOT NULL DEFAULT TRUE AFTER chat_tag;
