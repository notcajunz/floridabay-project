-- Every Department Coordination ladder rank grants the global Department Coordinator group.
-- In particular, probationary coordinators must receive the network-wide display role too.
INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name) VALUES
  ('1558235113295315004','1560393378485637140','department_coordinator'),
  ('1558235113295315004','1560393380939300884','department_coordinator'),
  ('1558235113295315004','1560393383527059477','department_coordinator'),
  ('1558235113295315004','1560393388933513226','department_coordinator'),
  ('1558235113295315004','1560393390938529862','department_coordinator'),
  ('1558235113295315004','1560393399935307866','department_coordinator'),
  ('1558235113295315004','1560393402477051914','department_coordinator'),
  ('1558235113295315004','1560393453479657563','department_coordinator'),
  ('1558235113295315004','1560393456323534958','department_coordinator');
