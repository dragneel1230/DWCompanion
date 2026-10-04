# Запрос в DE и политика по сторонним программам

## Статус
- 2026-09-29: пользователь заполняет тикет на support.warframe.com
  (Submit a request → раздел **Community** → Category **Marketing or Community Outreach**,
  если в конце списка нет более подходящего вроде «Other»/«Fan Content»).
- Номер тикета: **#4364733**
- 2026-10-02: пришёл автоответ поддержки (не ответ по сути): тикет в очереди, задержки из-за наплыва,
  просят не создавать повторные тикеты.
- Ответ: _ждём_

Когда придёт ответ — сохранить сюда целиком и обновить `DESIGN.md` §2E.

## Политика DE (статья «Third-Party Software and You», обновлена 2026-09-17)
- Списка разрешённого/запрещённого ПО нет и не будет.
- «Используете стороннее ПО — на свой риск». 100% гарантия — не использовать.
- Решает контекст; ложные срабатывания решаются тикетом, но бан держится до разбора.
- Главная опасность — автоволны: если программу найдут источником эксплойта, банят её пользователей.
- Жёсткие баны: изменение файлов игры, читы, эксплойты, AFK-фарм.
- **Overwolf в статье не упомянут.** Утверждение «DE одобрили Overwolf» — со слов FAQ AlecaFrame,
  официально в текущей статье не подтверждено.

## Как Overwolf/AlecaFrame получают инвентарь (для справки)
Нативный модуль Overwolf читает память процесса (по FAQ WFHelper — ищет JSON с `LastInventorySync`),
передаёт в приложение. Пассивно: обновление требует слетать на реле/в додзё (игра сама
перезапрашивает инвентарь). Требование «Overwolf до игры» — из-за внедрения DLL для оверлея,
а не из-за запросов к API. Одобрение (если оно есть) относится к Overwolf как партнёру, а не к методу.

## Текст отправленного запроса

Subject: `Third-party companion app — asking which data access methods are allowed`

```
Hello,

I'm building a companion app for Warframe, for personal use for now and possibly released for free later. Before writing any code that touches the game, I want to make sure everything I do is within your Terms of Service and EULA.

I have read "Third-Party Software and You" and understand that you don't provide a list of allowed software. I'm not asking for a whitelist — I'm asking about specific methods, so I can avoid anything you consider unacceptable.

What the app does:
- A reference for items, drop tables, crafting and mod builds, using the Public Export data and public drop tables.
- World state (fissures, cycles, Baro, etc.) and item prices from warframe.market.
- An overlay during relic reward selection that shows prices of the offered rewards. It works by reading the local EE.log file as a trigger, capturing the screen through standard Windows APIs and recognizing item names with OCR.
- Overlays are separate always-on-top windows. Nothing is injected into the game process.

What the app will never do: modify game files, inject into or write to game memory, automate any in-game actions (macros, auto-clicking, auto-trading, sending chat messages), or give any gameplay advantage.

My questions:

1. Is there an official or sanctioned way for a player to access their own inventory data (owned items, mastery progress) from a third-party app? For example, an export, a public API, or a partner integration such as Overwolf.

2. Are the methods described above allowed: reading EE.log, screen capture + OCR on the relic reward screen, and a separate always-on-top overlay window?

3. Is it allowed for a third-party app to open the game process with read-only memory access (no writing, no injection) to read the player's own inventory data?

4. Is it allowed for a third-party app to request the player's own inventory from your servers using the player's current session, on manual request only (for example, a "refresh" button)?

5. If the app is ever released publicly for free, are there any rules about using item names, icons and other game assets in it?

If some of these questions should go to another team, I'd be grateful if you could forward them or tell me who to contact.

Thank you!
```

Почему так: вопросы 3 и 4 разделены намеренно (DE могут разрешить одно и запретить другое);
имитацию мобильного приложения не упоминаем — звучит как «хочу подделать клиент».
