# Выпуск версии и автообновления

Исходники и выпуски — в одном публичном репозитории **https://github.com/dragneel1230/DWCompanion** (MIT):
код в `main`, установщики и `latest.json` — в Releases. Старое имя `DWCompanion-releases` GitHub перенаправляет
(на него смотрит версия 0.2.0).

## Как это работает
- Приложение (`src/lib/updater.svelte.ts`, плагин `tauri-plugin-updater`) при запуске (через 15 с) и раз в 6 часов
  читает `https://github.com/dragneel1230/DWCompanion/releases/latest/download/latest.json`.
  В dev-сборке не проверяет. Выключается: Настройки → «Обновления».
- Есть версия новее → баннер в углу (`components/UpdateBanner.svelte`: что нового, «Обновить» / «Позже») и одно
  уведомление Windows на версию. «Обновить» → скачивание, проверка подписи, тихая установка NSIS, перезапуск.
- Данные пользователя (localStorage WebView2, диспетчер учётных данных) обновление не трогает.

## Выпустить версию
1. Закоммитить изменения (скрипт не выпускает грязное дерево; `--allow-dirty` — обойти).
2. После патча игры — сначала `pnpm data` (базы входят в установщик).
3. `pnpm release 0.2.0 "Что нового: …"` (или `--notes-file notes.md` для многострочных заметок).

Скрипт `scripts/release.mjs`: поднимает версию (`package.json`, `tauri.conf.json`, `Cargo.toml`), собирает подписанный
установщик (`pnpm tauri build`), пишет `latest.json`, делает коммит `Release vX.Y.Z` и тег, отправляет их в `origin` (`main`), создаёт GitHub Release
через `gh` с установщиком и `latest.json`. Версия должна быть выше текущей.

Тестеру для первой установки — ссылка https://github.com/dragneel1230/DWCompanion/releases/latest
(SmartScreen: «Подробнее» → «Выполнить в любом случае» — нет сертификата подписи кода).

## Ключ подписи обновлений
- Приватный: `%USERPROFILE%\.tauri\dwcompanion.key` (без пароля), публичный — в `tauri.conf.json` → `plugins.updater.pubkey`.
- **Сделать резервную копию ключа** (флешка / облако). Потерян ключ → новые версии не примут подпись,
  тестеру придётся один раз переустановить вручную (с новым ключом в сборке).
- Ключ в репозиторий не класть. Другой путь: переменная `TAURI_SIGNING_PRIVATE_KEY` (путь или содержимое),
  пароль, если появится, — `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Если GitHub станет недоступен
В `tauri.conf.json` → `plugins.updater.endpoints` можно добавить второй адрес (зеркало с тем же `latest.json`).
Новый адрес узнают только версии, вышедшие после правки, — добавлять зеркало заранее, пока GitHub работает.

Требуется: `gh` (GitHub CLI, вход `gh auth login` под `dragneel1230`).
