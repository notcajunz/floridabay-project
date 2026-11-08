-- Florida Bay SQLite sanitized logical export
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

DROP TABLE IF EXISTS "activity_log";
CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    subject TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (1,886537252241723030,'coord','remove',476826378291999427,'anon_9d7bdbfbeef678c95893',NULL,'2026-10-15 23:03:05');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (2,886537252241723030,'coord','rank',297491885037935744,'anon_66a92bad04855c80f138',NULL,'2026-10-15 23:10:06');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (3,886537252241723030,'department','added',247905561182501065,'Department of Homefront Security',NULL,'2026-10-15 23:10:10');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (4,886537252241723030,'coord','rank',297491885037935744,'anon_9d7bdbfbeef678c95893',NULL,'2026-10-15 23:12:02');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (5,886537252241723030,'department','updated',476826378291999427,'Department of Homefront Security',NULL,'2026-10-15 23:12:35');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (6,886537252241723030,'coord','rank',247905561182501065,'anon_3b67946f48a30cb0b584',NULL,'2026-10-15 23:12:40');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (7,886537252241723030,'coord','rank',476826378291999427,'anon_744077356f3772c3cd07',NULL,'2026-10-15 23:12:59');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (8,886537252241723030,'coord','job-add',297491885037935744,'anon_66a92bad04855c80f138',NULL,'2026-10-15 23:13:45');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (9,886537252241723030,'coord','job-add',297491885037935744,'anon_66a92bad04855c80f138',NULL,'2026-10-15 23:14:15');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (10,886537252241723030,'coord','job-remove',297491885037935744,'anon_66a92bad04855c80f138',NULL,'2026-10-15 23:14:36');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (11,886537252241723030,'coord','job-remove',297491885037935744,'anon_66a92bad04855c80f138',NULL,'2026-10-15 23:14:46');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (12,886537252241723030,'coord','rank',297491885037935744,'anon_e661f941c4aeb535744c',NULL,'2026-10-15 23:15:23');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (13,886537252241723030,'coord','rank',476826378291999427,'anon_744077356f3772c3cd07',NULL,'2026-10-16 00:17:15');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (14,886537252241723030,'coord','rank',349871204133286961,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-16 20:26:25');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (15,886537252241723030,'email','registrar',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 21:51:00');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (16,886537252241723030,'email','wipe',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 21:53:10');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (17,886537252241723030,'email','registrar',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 21:54:38');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (18,886537252241723030,'email','registrar',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 22:25:24');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (19,886537252241723030,'email','Folder',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 22:31:19');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (20,886537252241723030,'email','Folder',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 22:32:25');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (21,886537252241723030,'email','Folder',297491885037935744,'Department of Homefront Security',NULL,'2026-10-16 22:33:33');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (22,886537252241723030,'department','added',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-17 10:40:58');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (23,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-17 10:41:52');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (24,886537252241723030,'department','created',700823762332333365,'central intelligence agency',NULL,'2026-10-17 11:58:30');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (25,886537252241723030,'department','removed',297491885037935744,'central intelligence agency',NULL,'2026-10-17 13:06:21');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (26,886537252241723030,'coord','rank',380553176519871664,'anon_3b67946f48a30cb0b584',NULL,'2026-10-17 21:41:36');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (27,886537252241723030,'department','created',700823762332333365,'National Guard',NULL,'2026-10-17 22:42:56');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (28,886537252241723030,'department','added',247905561182501065,'Blaine County Sheriff''s Office',NULL,'2026-10-17 23:13:14');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (29,886537252241723030,'department','removed',247905561182501065,'Blaine County Sheriff Office',NULL,'2026-10-17 23:14:01');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (30,886537252241723030,'department','updated',297491885037935744,'Department of Homefront Security',NULL,'2026-10-18 10:15:57');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (31,886537252241723030,'department','added',297491885037935744,'San Andreas Department of Transportation',NULL,'2026-10-18 15:20:06');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (32,886537252241723030,'email','registrar',297491885037935744,'Department of Homefront Security',NULL,'2026-10-18 15:23:42');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (33,886537252241723030,'email','Folder',297491885037935744,'Department of Homefront Security',NULL,'2026-10-18 15:24:17');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (34,886537252241723030,'department','updated',297491885037935744,'Department of Homefront Security',NULL,'2026-10-18 16:41:41');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (35,886537252241723030,'coord','rank',297491885037935744,'anon_8e206559f83a185d25c1',NULL,'2026-10-18 18:00:09');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (36,886537252241723030,'department','added',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-19 15:37:42');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (37,886537252241723030,'department','updated',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-19 15:39:24');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (38,886537252241723030,'department','updated',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-19 15:40:33');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (39,886537252241723030,'department','removed',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-19 15:40:56');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (40,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-19 15:41:16');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (41,886537252241723030,'department','updated',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-19 15:43:32');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (42,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-19 15:43:57');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (43,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-19 21:54:12');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (44,886537252241723030,'sticky','set',297491885037935744,'anon_ebb2b6dece0730d2a1b9',NULL,'2026-10-20 05:24:45');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (45,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-20 10:32:17');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (46,886537252241723030,'coord','rank',297491885037935744,'anon_82e89d8bd78f1c147255',NULL,'2026-10-20 10:34:22');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (47,886537252241723030,'coord','rank',297491885037935744,'anon_8e97edf824c9a23d9c56',NULL,'2026-10-20 17:10:25');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (48,886537252241723030,'coord','remove',297491885037935744,'anon_8e97edf824c9a23d9c56',NULL,'2026-10-20 17:11:37');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (49,886537252241723030,'coord','rank',297491885037935744,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-20 17:12:46');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (50,886537252241723030,'coord','remove',297491885037935744,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-20 17:13:15');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (51,886537252241723030,'coord','rank',297491885037935744,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-20 18:59:37');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (52,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-20 19:02:08');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (53,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-20 19:32:06');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (54,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-20 21:05:30');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (55,886537252241723030,'department','updated',297491885037935744,'Department of Homefront Security',NULL,'2026-10-20 21:31:33');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (56,886537252241723030,'department','updated',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-20 21:32:35');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (57,886537252241723030,'coord','rank',380553176519871664,'anon_1faf4f2e7920b61068cf',NULL,'2026-10-21 03:33:02');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (58,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-21 03:36:04');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (59,886537252241723030,'role','add',732962643469999124,'anon_da415eb8ea35fee8ac6b',NULL,'2026-10-21 08:45:24');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (60,886537252241723030,'role','add',732962643469999124,'anon_c43f99a4164cd2ac303b',NULL,'2026-10-21 08:48:56');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (61,886537252241723030,'role','add',732962643469999124,'anon_989d763506692939fdf2',NULL,'2026-10-21 09:30:08');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (62,886537252241723030,'role','add',732962643469999124,'anon_82e89d8bd78f1c147255',NULL,'2026-10-21 09:43:28');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (63,886537252241723030,'role','add',732962643469999124,'anon_82e89d8bd78f1c147255',NULL,'2026-10-21 09:43:38');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (64,886537252241723030,'role','add',732962643469999124,'anon_50cbc19da9b1cdd15195',NULL,'2026-10-21 09:45:22');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (65,886537252241723030,'department','added',297491885037935744,'San Andreas Fire & Rescue',NULL,'2026-10-21 09:48:20');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (66,886537252241723030,'department','removed',297491885037935744,'Blaine County Sheriff Office',NULL,'2026-10-21 09:53:35');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (67,886537252241723030,'department','created',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-21 09:54:23');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (68,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-21 09:56:38');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (69,269231333391306466,'dept_role','perm_set',297491885037935744,'Allow · <@&anon_eb4f0c6285ba6420dec5> → every role',NULL,'2026-10-21 17:24:43');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (70,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-21 20:24:40');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (71,886537252241723030,'department','updated',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-21 22:29:12');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (72,886537252241723030,'role','add',732962643469999124,'anon_0a17119d585b25edd610',NULL,'2026-10-21 23:12:50');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (73,886537252241723030,'department','removed',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 06:25:34');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (74,886537252241723030,'department','added',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 06:26:38');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (75,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 06:27:34');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (76,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-22 07:33:29');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (77,886537252241723030,'department','removed',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 11:43:44');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (78,886537252241723030,'department','added',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 11:45:51');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (79,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 11:47:17');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (80,886537252241723030,'department','removed',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 12:15:45');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (81,886537252241723030,'cooldown','clear',732962643469999124,'anon_8e97edf824c9a23d9c56',NULL,'2026-10-22 12:16:15');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (82,886537252241723030,'department','added',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 12:17:04');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (83,886537252241723030,'department','status',297491885037935744,'Blaine County Sheriff''s Office',NULL,'2026-10-22 12:18:02');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (84,886537252241723030,'sticky','set',297491885037935744,'anon_72f2be60fd177b69ff82',NULL,'2026-10-22 19:32:44');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (85,886537252241723030,'coord','sheet-sync',NULL,'',NULL,'2026-10-23 00:36:15');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (86,886537252241723030,'role','add',732962643469999124,'anon_7539b86da051907f8219',NULL,'2026-10-23 06:17:02');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (87,886537252241723030,'department','added',297491885037935744,'Roxwood Police Department',NULL,'2026-10-24 17:35:53');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (88,886537252241723030,'email','registrar',732962643469999124,'Blaine County Sheriff''s Office',NULL,'2026-10-25 06:04:06');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (89,886537252241723030,'email','Folder',732962643469999124,'Blaine County Sheriff''s Office',NULL,'2026-10-25 06:06:54');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (90,886537252241723030,'role','add',211737496841853573,'anon_eab28fa6b1e99a85500e',NULL,'2026-10-25 21:05:02');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (91,886537252241723030,'coord','sync',297491885037935744,'',NULL,'2026-10-26 20:47:04');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (92,886537252241723030,'coord','rank',297491885037935744,'anon_2da1f3eebf589b7fe0d1',NULL,'2026-10-26 20:48:04');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (93,886537252241723030,'coord','remove',297491885037935744,'anon_2da1f3eebf589b7fe0d1',NULL,'2026-10-26 20:48:56');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (94,886537252241723030,'department','updated',476826378291999427,'San Andreas Department of Transportation',NULL,'2026-10-27 02:59:30');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (95,886537252241723030,'coord','rank',297491885037935744,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-27 12:25:41');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (96,886537252241723030,'coord','rank',297491885037935744,'anon_82e89d8bd78f1c147255',NULL,'2026-10-27 13:05:59');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (97,886537252241723030,'role','add',732962643469999124,'anon_82e89d8bd78f1c147255',NULL,'2026-10-27 13:10:07');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (98,886537252241723030,'role','add',732962643469999124,'anon_82e89d8bd78f1c147255',NULL,'2026-10-27 13:10:21');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (99,886537252241723030,'role','add',732962643469999124,'anon_82e89d8bd78f1c147255',NULL,'2026-10-27 13:10:34');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (100,886537252241723030,'department','updated',297491885037935744,'Roxwood Police Department',NULL,'2026-10-28 09:12:44');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (101,886537252241723030,'coord','remove',297491885037935744,'anon_2a181c89b83d51e4bdeb',NULL,'2026-10-29 16:47:34');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (102,886537252241723030,'coord','remove',297491885037935744,'anon_e661f941c4aeb535744c',NULL,'2026-10-29 16:48:33');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (103,886537252241723030,'role','add',732962643469999124,'anon_aa1e54e0e31c15b72cdd',NULL,'2026-11-01 13:49:53');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (104,886537252241723030,'coord','rank',211737496841853573,'anon_5d1201c080c775cd578c',NULL,'2026-11-01 16:54:04');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (105,886537252241723030,'coord','rank',297491885037935744,'anon_5d1201c080c775cd578c',NULL,'2026-11-01 17:02:20');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (106,886537252241723030,'coord','remove',476826378291999427,'anon_5d1201c080c775cd578c',NULL,'2026-11-01 18:50:56');

DROP TABLE IF EXISTS "departments";
CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    initials TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'In Development',
    role_color INTEGER NOT NULL DEFAULT 0,
    base_role_id INTEGER,
    command_role_id INTEGER,
    head_id INTEGER,
    fbrp_org_id TEXT,
    invite TEXT,
    hide_leaderboard INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, external_guild_id TEXT,
    UNIQUE(guild_id, name)
);
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (1,886537252241723030,'Department of Homefront Security','DHS','Handpicked','In Development',2123412,658259735734762378,637539032008307617,297491885037935744,'3','https://discord.gg/xAQsMpBCtK',0,247905561182501065,'2026-10-15 23:10:10','2026-10-20 21:31:33','anon_ca304eb4e5478ee22bdb1720');
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (4,886537252241723030,'National Guard','NG','Armed Forces','In Development',16776960,219116627077527130,153924297033421241,NULL,NULL,NULL,0,700823762332333365,'2026-10-17 22:42:55','2026-10-17 22:42:55',NULL);
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (6,886537252241723030,'San Andreas Department of Transportation','SADOT','Other','In Development',15844367,558914667186221889,628673501831526471,NULL,'8',NULL,0,297491885037935744,'2026-10-18 15:20:06','2026-10-27 02:59:30','anon_08b18bc650ad2273c0c308b5');
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (8,886537252241723030,'San Andreas Fire & Rescue','SAFR','Other','In Development',16711680,144874168932541143,885759605814202999,NULL,NULL,NULL,0,297491885037935744,'2026-10-21 09:48:20','2026-10-21 09:48:20','anon_082214d2649eb2338d853618');
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (12,886537252241723030,'Blaine County Sheriff''s Office','BCSO','Main LEO','Launched',12287744,367475160930492205,577855515617151512,297491885037935744,'5',NULL,0,297491885037935744,'2026-10-22 12:17:03','2026-10-22 12:18:02','anon_dee143e57e8a323e701b4cfa');
INSERT INTO "departments" ("id","guild_id","name","initials","category","status","role_color","base_role_id","command_role_id","head_id","fbrp_org_id","invite","hide_leaderboard","created_by","created_at","updated_at","external_guild_id") VALUES (13,886537252241723030,'Roxwood Police Department','RPD','Handpicked','In Development',2264872,815394249558872628,607425570724933011,NULL,'7',NULL,0,297491885037935744,'2026-10-24 17:35:53','2026-10-28 09:12:44','anon_8da29e8050331155b92807f2');

DROP TABLE IF EXISTS "dept_role_perms";
CREATE TABLE dept_role_perms (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    subject_type TEXT NOT NULL CHECK(subject_type IN ('user', 'role')),
    subject_id INTEGER NOT NULL,
    allowed INTEGER NOT NULL,
    set_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, role_id, subject_type, subject_id)
);
INSERT INTO "dept_role_perms" ("guild_id","role_id","subject_type","subject_id","allowed","set_by","updated_at") VALUES (269231333391306466,509319108620348317,'role',255784739363120160,1,297491885037935744,'2026-10-21 17:24:43');

DROP TABLE IF EXISTS "dept_role_requests";
CREATE TABLE dept_role_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    channel_id INTEGER,
    message_id INTEGER,
    reviewer_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
);

DROP TABLE IF EXISTS "permissions";
CREATE TABLE permissions (
    guild_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    PRIMARY KEY(guild_id, target_type, target_id, permission)
);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',623177586808776987,'/cooldown apply',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',623177586808776987,'/role add',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',623177586808776987,'/role remove',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',623177586808776987,'/temprole extend',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',623177586808776987,'/temprole list',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',268000485565763491,'/rolewipe',1);
INSERT INTO "permissions" ("guild_id","target_type","target_id","permission","allowed") VALUES (886537252241723030,'role',268000485565763491,'/temprole delete',1);

DROP TABLE IF EXISTS "protected_roles";
CREATE TABLE protected_roles (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, role_id)
);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,528270910858014783);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,506525103650667902);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,302777933421396424);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,209225431222619643);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,779863018933385134);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,283844041660306915);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,324266401244174130);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,129544608723223857);
INSERT INTO "protected_roles" ("guild_id","role_id") VALUES (886537252241723030,268000485565763491);

DROP TABLE IF EXISTS "punishments";
CREATE TABLE punishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    punishment TEXT NOT NULL,
    notes TEXT,
    actor_id INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    edit_reason TEXT,
    duration_days INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "role_managers";
CREATE TABLE role_managers (
    guild_id INTEGER NOT NULL,
    managed_role_id INTEGER NOT NULL,
    manager_type TEXT NOT NULL CHECK(manager_type IN ('user', 'role')),
    manager_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, managed_role_id, manager_type, manager_id)
);

DROP TABLE IF EXISTS "settings";
CREATE TABLE settings (
    guild_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY(guild_id, key)
);
INSERT INTO "settings" ("guild_id","key","value") VALUES (886537252241723030,'panel:chain','[anon_4efa276213c7c6ffc78d]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (886537252241723030,'panel:hours','[anon_4ef0f01f0d2394f51016]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (886537252241723030,'ticket_panel','{"channel": anon_ffc7c90d01a63c82f326, "message": anon_ce6747ca9ffe7f8d722a}');

DROP TABLE IF EXISTS "stickies";
CREATE TABLE stickies (
    guild_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    embed TEXT NOT NULL,
    message_id INTEGER,
    created_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, channel_id)
);
INSERT INTO "stickies" ("guild_id","channel_id","embed","message_id","created_by","updated_at") VALUES (886537252241723030,283838212823134418,'{"flags": 0, "color": 5793266, "type": "rich", "description": "**Name:**\n**Needs roles:**\n**Approved By:**", "title": "Role Request"}',766213948349107754,297491885037935744,'2026-10-20 05:24:44');
INSERT INTO "stickies" ("guild_id","channel_id","embed","message_id","created_by","updated_at") VALUES (886537252241723030,382891988460075881,'{"flags": 0, "color": 5793266, "type": "rich", "description": "**Name:** (@Yourself)\n**Requesting:** (DC Job, Approvals etc)\n**Reasoning:**"}',581558928157703128,297491885037935744,'2026-10-22 19:32:43');

DROP TABLE IF EXISTS "temp_roles";
CREATE TABLE temp_roles (
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY(guild_id, member_id, role_id)
);
INSERT INTO "temp_roles" ("guild_id","member_id","role_id","expires_at") VALUES (886537252241723030,211737496841853573,719241638267189452,'2026-11-02T15:13:24.496666+00:00');

DROP TABLE IF EXISTS "ticket_participants";
CREATE TABLE ticket_participants (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        added_by INTEGER,
        added_at INTEGER NOT NULL,
        PRIMARY KEY(ticket_id, user_id)
    );
INSERT INTO "ticket_participants" ("ticket_id","user_id","added_by","added_at") VALUES (1,380553176519871664,380553176519871664,1792320872);
INSERT INTO "ticket_participants" ("ticket_id","user_id","added_by","added_at") VALUES (2,297491885037935744,297491885037935744,1792354870);

DROP TABLE IF EXISTS "tickets";
CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        channel_id INTEGER,
        control_message_id INTEGER,
        author_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by INTEGER,
        claimed_at INTEGER,
        form_data TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        closed_by INTEGER,
        close_reason TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0
    );
INSERT INTO "tickets" ("id","guild_id","channel_id","control_message_id","author_id","type","subject","status","claimed_by","claimed_at","form_data","created_at","closed_at","closed_by","close_reason","reopen_count") VALUES (1,886537252241723030,587327524351999094,705702548130482727,380553176519871664,'cad','wasd','deleted',NULL,NULL,'[redacted]',1792320872,1792320880,380553176519871664,NULL,0);
INSERT INTO "tickets" ("id","guild_id","channel_id","control_message_id","author_id","type","subject","status","claimed_by","claimed_at","form_data","created_at","closed_at","closed_by","close_reason","reopen_count") VALUES (2,886537252241723030,588435094227654233,114699454337599521,297491885037935744,'cad','Test','deleted',NULL,NULL,'[redacted]',1792354870,1792354885,297491885037935744,NULL,0);

CREATE INDEX idx_activity_guild ON activity_log(guild_id, created_at);
CREATE UNIQUE INDEX idx_departments_external_guild ON departments(external_guild_id) WHERE external_guild_id IS NOT NULL AND external_guild_id <> '';
CREATE UNIQUE INDEX idx_departments_fbrp_org ON departments(fbrp_org_id)
    WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id <> '';
CREATE INDEX idx_departments_guild ON departments(guild_id);
CREATE INDEX idx_role_requests_pending ON dept_role_requests(guild_id, member_id, role_id, status);
CREATE INDEX idx_tickets_author ON tickets(guild_id, author_id, status);
CREATE INDEX idx_tickets_channel ON tickets(channel_id);
COMMIT;
PRAGMA foreign_keys=ON;
