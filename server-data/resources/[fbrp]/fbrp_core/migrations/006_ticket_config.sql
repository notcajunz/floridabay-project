-- Ticket types, their modal forms and response-time priorities become database configuration
-- so the control panel can edit them live. Seeded with the previous built-in defaults.
CREATE TABLE IF NOT EXISTS ticket_priorities (
  level TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  label VARCHAR(40) NOT NULL,
  sla_minutes INT UNSIGNED NOT NULL DEFAULT 240
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO ticket_priorities(level,label,sla_minutes) VALUES
  (0,'Critical',10),
  (1,'High',30),
  (2,'Priority',60),
  (3,'Standard',240);

CREATE TABLE IF NOT EXISTS ticket_types (
  type_key VARCHAR(24) NOT NULL PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  description VARCHAR(100) NOT NULL DEFAULT '',
  priority TINYINT UNSIGNED NOT NULL DEFAULT 3,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  fields LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(fields))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO ticket_types(type_key,label,description,priority,enabled,sort_order,fields) VALUES
  ('support','General Support','Questions, account problems, and anything else.',3,TRUE,1,
   '[{"id":"subject","label":"Subject","style":"short","required":true,"max":100},{"id":"description","label":"Describe what you need","style":"paragraph","required":true,"max":1000},{"id":"tried","label":"What have you already tried?","style":"paragraph","required":false,"max":500}]'),
  ('store','Store / Purchase','Package grants, purchases, and missing items.',1,TRUE,2,
   '[{"id":"transaction","label":"Transaction or receipt ID","style":"short","required":false,"max":80},{"id":"item","label":"Package or item","style":"short","required":true,"max":100},{"id":"issue","label":"What went wrong?","style":"paragraph","required":true,"max":1000}]'),
  ('report','Player Report','Rule violations, exploits, or abuse by another player.',0,TRUE,3,
   '[{"id":"player","label":"Player name or server ID","style":"short","required":true,"max":80},{"id":"scene","label":"Scene, time, or server ID","style":"short","required":false,"max":80},{"id":"what","label":"What happened?","style":"paragraph","required":true,"max":1000},{"id":"evidence","label":"Evidence links","style":"paragraph","required":false,"max":500}]'),
  ('appeal','Ban Appeal','Appeal a Florida Bay moderation action.',3,TRUE,4,
   '[{"id":"ban","label":"Ban or case ID","style":"short","required":false,"max":60},{"id":"why","label":"Why should the action be reviewed?","style":"paragraph","required":true,"max":1000}]'),
  ('bug','Bug Report','Report a reproducible server or bot problem.',3,TRUE,5,
   '[{"id":"what","label":"What is broken?","style":"paragraph","required":true,"max":1000},{"id":"steps","label":"Steps to reproduce","style":"paragraph","required":true,"max":1000},{"id":"clip","label":"Screenshot or video link","style":"short","required":false,"max":300}]'),
  ('creator','Partnership / Creator','Creator, community, or partnership proposals.',2,TRUE,6,
   '[{"id":"organisation","label":"Organization or channel","style":"short","required":true,"max":100},{"id":"audience","label":"Audience and reach","style":"short","required":true,"max":100},{"id":"proposal","label":"Your proposal","style":"paragraph","required":true,"max":1000},{"id":"links","label":"Relevant links","style":"paragraph","required":false,"max":500}]'),
  ('security','Security Ticket','Privately disclose a security concern.',1,TRUE,7,
   '[{"id":"subject","label":"Security concern","style":"short","required":true,"max":100},{"id":"description","label":"Detailed description","style":"paragraph","required":true,"max":1000},{"id":"affected","label":"Affected systems","style":"short","required":false,"max":200},{"id":"evidence","label":"Private evidence links","style":"paragraph","required":false,"max":500}]'),
  ('management','Management Ticket','Escalations and requests for server management.',2,TRUE,8,
   '[{"id":"subject","label":"Subject","style":"short","required":true,"max":100},{"id":"description","label":"Detailed request","style":"paragraph","required":true,"max":1000},{"id":"area","label":"Department or area","style":"short","required":false,"max":100},{"id":"outcome","label":"Requested outcome","style":"paragraph","required":false,"max":500}]');
