-- Organization properties now need a real interior. Properties that only had an exterior spot are
-- hidden from the shop instead of deleted, so this is reversible with enabled=TRUE. A property an
-- organization already owns stays listed and keeps working. The new interior properties
-- (mlo_*) are added by the bot shop seed from DEFAULT_SHOP.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.
UPDATE org_shop_items SET enabled=FALSE
 WHERE kind='property'
   AND item_key IN (
     'bennys','bahama_mamas','upnatom','elysian_warehouse',
     'lab_sandy','lab_oneil','lab_sawmill','lab_raton_bunker','lab_zancudo_bunker',
     'lab_route68_bunker','lab_thomson_bunker','lab_farmhouse_bunker','lab_chumash_bunker',
     'hq_trailer_sandy','hq_forum_drive','hq_grove_street','hq_el_burro','hq_lost_vinewood',
     'hq_chumash_beach','hq_richman','hq_whispymound','hq_rockford','hq_fuente_blanca',
     'golf_club','pier_stands','cluckin_bell','lamesa_factory','puerta_marina','lsia_hangar'
   )
   AND NOT EXISTS (SELECT 1 FROM org_properties p WHERE p.item_key=org_shop_items.item_key);
