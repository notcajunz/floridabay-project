-- A single Discord-gated tag may be offered in both wardrobe slots.
ALTER TABLE headtags
  MODIFY kind ENUM('head','gang','both') NOT NULL;
