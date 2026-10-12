-- Replace the public Ban Appeal ticket option with IAA transfer/merge requests.
-- Ban appeals remain available through the dedicated member portal and route
-- their private staff ticket through Management.
UPDATE ticket_types SET enabled=FALSE WHERE type_key='appeal';

INSERT INTO ticket_types(type_key,label,description,priority,enabled,sort_order,fields)
VALUES(
  'iaa',
  'IAA Ticket',
  'Transfer and merge requests for staff, departments, gangs, and other server roles.',
  2,
  TRUE,
  4,
  '[{"id":"subject","label":"Transfer or merge request","style":"short","required":true,"max":100},{"id":"origin","label":"Current server, department, or role","style":"short","required":true,"max":120},{"id":"request","label":"Describe the transfer or merge","style":"paragraph","required":true,"max":1000},{"id":"evidence","label":"Proof or supporting links","style":"paragraph","required":false,"max":500}]'
)
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  description=VALUES(description),
  priority=VALUES(priority),
  enabled=VALUES(enabled),
  sort_order=VALUES(sort_order),
  fields=VALUES(fields);
