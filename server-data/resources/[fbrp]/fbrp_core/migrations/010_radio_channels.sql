CREATE TABLE IF NOT EXISTS radio_channels (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(180) NULL,
  color CHAR(7) NOT NULL DEFAULT '#43E8D8',
  org_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(32) NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY radio_channel_number(channel),
  INDEX radio_channel_org(org_id,enabled,sort_order),
  CONSTRAINT fk_radio_channel_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO radio_channels(channel,name,description,color,org_id,sort_order,enabled,created_by,created_at) VALUES
 (1,'Community One','Open community frequency.','#43E8D8',NULL,10,TRUE,'migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 (2,'Community Two','Open secondary community frequency.','#6FA8FF',NULL,20,TRUE,'migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);
