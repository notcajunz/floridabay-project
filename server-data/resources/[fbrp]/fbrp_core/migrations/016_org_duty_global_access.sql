-- Discord users listed here may clock into any active organization with /duty,
-- including organizations created later, without holding its Discord role.
CREATE TABLE IF NOT EXISTS organization_duty_global_access (
  discord_id VARCHAR(32) PRIMARY KEY,
  added_by VARCHAR(32) NULL,
  added_at BIGINT NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO organization_duty_global_access(discord_id,added_by,added_at)
VALUES('1558772560085262356','system',UNIX_TIMESTAMP()*1000);
