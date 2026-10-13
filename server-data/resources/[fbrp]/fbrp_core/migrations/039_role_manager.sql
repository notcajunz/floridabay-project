-- Delegated Discord role management. Owners control each role's manager list;
-- owners and managers can grant, remove, and wipe that role's membership.
CREATE TABLE IF NOT EXISTS role_manager_roles (
  guild_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  owner_id VARCHAR(32) NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_by VARCHAR(32) NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (guild_id, role_id),
  INDEX role_manager_owner (guild_id, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_manager_members (
  guild_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  added_by VARCHAR(32) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY (guild_id, role_id, discord_id),
  CONSTRAINT role_manager_members_role_fk
    FOREIGN KEY (guild_id, role_id) REFERENCES role_manager_roles(guild_id, role_id)
    ON DELETE CASCADE,
  INDEX role_manager_member (guild_id, discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
