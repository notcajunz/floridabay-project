-- A headtag may also be offered as an independently selectable chat tag.
ALTER TABLE headtags
  ADD COLUMN IF NOT EXISTS chat_tag BOOLEAN NOT NULL DEFAULT FALSE AFTER enabled;

ALTER TABLE player_tag_selection
  ADD COLUMN IF NOT EXISTS chat_tag_id INT UNSIGNED NULL AFTER gangtag_id,
  ADD INDEX selected_chat_tag(chat_tag_id),
  ADD CONSTRAINT fk_selected_chat_tag FOREIGN KEY(chat_tag_id) REFERENCES headtags(id) ON DELETE SET NULL;
