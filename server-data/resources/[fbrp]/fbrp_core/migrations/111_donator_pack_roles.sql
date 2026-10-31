-- Donator menu packs: one ace group per pack, locked to its Discord role.
-- Having the Discord role puts the player in the group (discord_role_sources, one-way:
-- Discord is the source of truth, same as the VIP tuning role). Each group grants the
-- ace that fbrp_donatormenu/data/packs.lua checks.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES
 ('jdm_pack','JDM Car Pack',0,FALSE,'migration'),
 ('truck_pack','Truck Pack',0,FALSE,'migration'),
 ('aviation_pack','Aviation Pack',0,FALSE,'migration'),
 ('whitelist_package','Whitelist Package',0,FALSE,'migration'),
 ('uk_car_pack','UK Car Pack',0,FALSE,'migration'),
 ('australian_pack','Australian Vehicle Pack',0,FALSE,'migration'),
 ('vip_package','VIP Package',0,FALSE,'migration'),
 ('hemi_pack','Hemi Pack',0,FALSE,'migration')
ON DUPLICATE KEY UPDATE label=VALUES(label),staff_only=FALSE;

INSERT IGNORE INTO ace_entries(group_name,object,mode) VALUES
 ('jdm_pack','jdmpack','allow'),
 ('truck_pack','truckpack1','allow'),
 ('aviation_pack','aviationpack','allow'),
 ('whitelist_package','whitelisted','allow'),
 ('uk_car_pack','ukpack','allow'),
 ('australian_pack','aussiepack','allow'),
 ('vip_package','vip_package','allow'),
 ('hemi_pack','hemipack','allow');

INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name) VALUES
 ('1557594282976747550','1558778406403964958','jdm_pack'),
 ('1557594282976747550','1563444048277274694','truck_pack'),
 ('1557594282976747550','1558778407280447588','aviation_pack'),
 ('1557594282976747550','1557689750184398999','whitelist_package'),
 ('1557594282976747550','1558237679353593927','uk_car_pack'),
 ('1557594282976747550','1558237674412974221','australian_pack'),
 ('1557594282976747550','1557689749198868520','vip_package'),
 ('1557594282976747550','1564056853585854485','hemi_pack');
