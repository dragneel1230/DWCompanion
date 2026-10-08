# DWCompanion — Dragneel's Warframe Companion

Компаньон для Warframe на русском (и английском): оверлей наград за реликвии, состояние мира, билды,
цены warframe.market, цели и путеводитель по фарму. Десктоп-приложение для Windows 10/11, бесплатное,
с открытым кодом (MIT).

**Скачать:** [последняя версия](https://github.com/dragneel1230/DWCompanion/releases/latest) →
`DWCompanion_x.y.z_x64-setup.exe`. Windows может показать SmartScreen («Неизвестный издатель»): у установщика нет
платного сертификата подписи кода → «Подробнее» → «Выполнить в любом случае». Дальше приложение обновляется само
(уведомление «Доступна версия…» → «Обновить»).

## Что умеет
- **Сейчас** — текущая миссия (из `EE.log`), разломы, циклы мира, Баро Ки'Тиир, все таймеры.
- **Оверлей наград** — на экране выбора награды за реликвию показывает цены и что нужно вашим целям.
- **Командный центр** — окно поверх игры по горячей клавише: те же разделы, не выходя из игры.
- **Билды** — варфреймы, оружие (включая оружие варфреймов), компаньоны, арчвинги, некрамехи; моды, мистификаторы,
  осколки архонта, расчёт характеристик; конфигурации A/B/C из игры.
- **Реликвии**, **Торговля** (цены, наборы, свои ордера на warframe.market), **Добыча** (где фармить), **Цели**,
  **Орбитер** (литейная, Гельминт), **Коллекция** (мастерство, синдикаты).
- **Уведомления** с фильтрами (разломы, Баро, цены, готовность в литейной).

## Что приложение делает с игрой — честно
Правила проекта (нарушение = риск бана, поэтому этого **нет** в коде):
- нет внедрения в процесс игры (DLL, хуки DirectX/оверлея), нет записи в память и изменения файлов игры;
- нет автоматизации: макросов, кликов, отправки чата, автотрейда;
- нет входа логином/паролем DE и имитации их приложений.

Что используется:
- чтение файла `EE.log` (лог игры) — миссия, реликвии, язык клиента;
- снимок экрана системным API (Windows Graphics Capture) + распознавание текста Windows — экран наград;
- отдельное окно поверх игры;
- публичные данные: экспорт DE (`warframe-public-export-plus`), worldState DE, warframe.market, вики.

**Инвентарь — единственное исключение, выключено по умолчанию.** Включается в настройках только после
предупреждения. Тогда приложение (`src-tauri/src/inv_session.rs`) один раз за запуск игры открывает её процесс
**только для чтения** (`PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION`), находит в памяти строку сессии
`accountId+nonce` — тем же способом, что открытая утилита [warframe-api-helper](https://github.com/Sainan/warframe-api-helper) —
и запрашивает у DE ваш `inventory.php` (только GET). Пара хранится в диспетчере учётных данных Windows и никуда больше
не уходит. DE не одобряли и не запрещали это явно (см. `docs/DE_REQUEST.md`) — используйте на свой риск.
Без инвентаря работает всё остальное; его можно и импортировать файлом.

## Сборка из исходников
Нужны Node 24+, pnpm, Rust (stable-msvc), WebView2.
```
pnpm install
pnpm data          # собрать базы из экспорта DE (static/data/<язык>/)
pnpm tauri dev     # запуск для разработки
pnpm tauri build   # установщик
```
Стек: Tauri 2 (Rust) + Svelte 5 + TypeScript. Устройство и решения — `docs/DESIGN.md`, план — `docs/ROADMAP.md`,
выпуск версий — `docs/RELEASE.md`.

## Источники данных
[warframe-public-export-plus](https://github.com/calamity-inc/warframe-public-export-plus) (экспорт DE и официальные
словари), [@wfcd/items](https://github.com/WFCD/warframe-items), официальные таблицы дропа DE,
[warframe.market](https://warframe.market), [Warframe Wiki](https://wiki.warframe.com), [relics.run](https://relics.run).

Не связано с Digital Extremes. Warframe и всё, что с ним связано, — товарные знаки Digital Extremes Ltd.

---

**English:** a Warframe companion app for Windows (Russian-first UI, English available): relic reward overlay,
world state, builds, warframe.market prices, goals. MIT. No injection, no automation, no game file or memory writes;
the optional inventory feature reads the game's session string read-only, once per game launch (see above).
