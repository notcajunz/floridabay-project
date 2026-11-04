# Translating the chat UI

The chat interface (input box, command hints and the `/editchat` editor) can be
shown in any language. You do **not** need the UI source code or any build tools -
these `.lua` files are plain text and ship with the resource.

## Switch language

1. Open `config.lua`.
2. Set the language code, e.g.:
   ```lua
   Config.language = 'es'
   ```
3. Restart the resource.

`en` (English) is always the fallback. If a language is missing a line, that line
shows in English instead - the UI is never left blank.

## Add your own language

1. Copy `locales/en.lua` and rename it to your two-letter language code
   (for example `de.lua` for German).
2. Inside the new file, change the table name from `Locales['en']` to your code,
   e.g. `Locales['de']`.
3. Translate the text on the **right** of each `=`. **Do not change the keys on
   the left** (`inputPlaceholder`, `btnSave`, …) - those must stay exactly as they
   are so the UI can find them.
4. Set `Config.language` to your code in `config.lua` and restart.

`locales/es.lua` is an example you can copy from or delete.

> Tip: keep the `…` character in `inputPlaceholder` if you want the same look, or
> replace it with `...` - both work.
