-- Share codes for saved vMenu multiplayer characters. One row per code holds the saved character
-- JSON exactly as vMenu stores it, plus who created it and how often it was imported.
-- fbrp_core also creates this table on start, so deployment order does not matter.
CREATE TABLE IF NOT EXISTS outfit_shares (
  code VARCHAR(9) NOT NULL PRIMARY KEY,
  owner_license VARCHAR(100) NOT NULL,
  owner_discord VARCHAR(32) NULL,
  owner_name VARCHAR(80) NOT NULL,
  character_name VARCHAR(40) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  copies INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  KEY idx_outfit_shares_owner (owner_license, created_at)
) ENGINE=InnoDB;
