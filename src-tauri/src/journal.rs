// Relic journal: every relic the player opened and what it gave, from EE.log (no OCR, no guessing):
//   "Dialog::CreateOkCancel(description=Вы уверены, что хотите взять Реликвия Лит P9 [СИЯЮЩАЯ] с собой на миссию?"
//       -> the relic taken into the mission / the next round of an endless one (last confirm wins);
//   "VoidProjections: <account> gets reward /Lotus/StoreItems/..." -> what that relic gave the player.
// Which card the player then picked is not in the log: the app may attach the squad's cards (overlay OCR)
// and the player can mark the pick by hand. Times: game start from "Current time: ... [UTC: ...]" + the
// line's seconds. Kept in <app data>/journal.json; the log of the running game is re-read at start
// (entries dedupe by id), so relics opened before the app started are there too.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
pub struct Opening {
    pub id: String, // "<game start ms>-<log seconds>"
    pub t: u64,     // unix ms
    pub mission: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<String>, // "SolNode36": names the mission when the log has no name (joined in progress)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>, // "VoidT1"
    pub relic: Option<String>, // as the dialog shows it: "Реликвия Лит P9 [СИЯЮЩАЯ]"
    pub reward: String,        // "/Lotus/Types/Recipes/..." (StoreItems prefix dropped)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub offer: Vec<String>, // every card on the screen (from the overlay), when known
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picked: Option<String>,
    // Who marked the pick: "inv" — the inventory snapshot after the mission (what arrived), "hand" — the player.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pick_by: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct File {
    v: u32,
    entries: Vec<Opening>,
    // The player's account id ("<account> gets reward" is always the player's own relic): the public
    // profile (Collection tab) is looked up by it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    account: Option<String>,
}

#[derive(Default)]
struct Parser {
    start: u64, // unix ms of the game start
    mission: Option<String>,
    node: Option<String>,
    tier: Option<String>,
    relic: Option<String>,
    screen_open: bool,
}

pub struct Journal {
    path: PathBuf,
    entries: Vec<Opening>,
    ids: HashSet<String>,
    parser: Parser,
    pending_offer: Option<(u64, Vec<String>)>, // cards read before the log line arrived
    account: Option<String>,
    dirty: bool, // account changed without a new entry
}

pub type JournalState = Arc<Mutex<Journal>>;

pub fn init(app: &AppHandle) -> JournalState {
    let dir = app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir());
    let path = dir.join("journal.json");
    let file: File = fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let ids = file.entries.iter().map(|e| e.id.clone()).collect();
    Arc::new(Mutex::new(Journal { path, entries: file.entries, ids, parser: Parser::default(), pending_offer: None, account: file.account, dirty: false }))
}

impl Journal {
    fn save(&self) {
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let file = File { v: 1, entries: self.entries.clone(), account: self.account.clone() };
        if let Ok(json) = serde_json::to_vec(&file) {
            let tmp = self.path.with_extension("json.tmp");
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, &self.path);
            }
        }
    }

    // One EE.log line; returns a new entry when the line completes one.
    fn line(&mut self, line: &str) -> Option<Opening> {
        let p = &mut self.parser;
        if let Some(i) = line.find("Current time: ") {
            p.start = line[i..].find("[UTC: ").and_then(|j| parse_utc(&line[i + j + 6..])).unwrap_or(0);
            *p = Parser { start: p.start, ..Default::default() };
            return None;
        }
        if let Some(r) = relic_in_dialog(line) {
            p.relic = Some(r);
        } else if line.contains("Set squad mission: {") || line.contains("Requested mission: {") || line.contains("joining mission in-progress: {") {
            // {"difficulty":"","voidTier":"VoidT1","quest":"","name":"SolNode36_ActiveMission"}
            let field = |key: &str| {
                line.split(&format!("\"{key}\":\"")).nth(1).and_then(|r| r.split('"').next()).filter(|v| !v.is_empty()).map(str::to_string)
            };
            let node = field("name").map(|n| n.trim_end_matches("_ActiveMission").to_string());
            if node != p.node {
                p.mission = None;
            }
            p.node = node;
            p.tier = field("voidTier");
        } else if let Some(i) = line.find("ThemedSquadOverlay.lua: Mission name: ") {
            p.mission = Some(line[i + "ThemedSquadOverlay.lua: Mission name: ".len()..].trim().to_string());
        } else if line.contains("OpenVoidProjectionRewardScreen") {
            p.screen_open = true;
        } else if line.contains("ServerFramework:OpenLevel - /Lotus/Levels/Proc/PlayerShip") {
            p.mission = None;
            p.relic = None;
            p.node = None;
            p.tier = None;
        } else if let Some(i) = line.find(" gets reward /Lotus/StoreItems/") {
            let acc = line[..i].rsplit(' ').next().filter(|a| a.len() == 24 && a.chars().all(|c| c.is_ascii_hexdigit()));
            if let Some(a) = acc {
                if self.account.as_deref() != Some(a) {
                    self.account = Some(a.to_string());
                    self.dirty = true;
                }
            }
            let p = &mut self.parser;
            // One per reward screen: the player's own relic.
            if !p.screen_open || p.start == 0 {
                return None;
            }
            p.screen_open = false;
            let secs = log_seconds(line)?;
            let id = format!("{}-{}", p.start, (secs * 1000.0) as u64);
            if self.ids.contains(&id) {
                return None;
            }
            let reward = line[i + " gets reward ".len()..].trim().replacen("/Lotus/StoreItems/", "/Lotus/", 1);
            let t = p.start + (secs * 1000.0) as u64;
            let offer = match self.pending_offer.take() {
                Some((at, items)) if at.abs_diff(t) < 60_000 => items,
                _ => Vec::new(),
            };
            let e = Opening {
                id: id.clone(),
                t,
                mission: p.mission.clone(),
                node: p.node.clone(),
                tier: p.tier.clone(),
                relic: p.relic.clone(),
                reward,
                offer,
                picked: None,
                pick_by: None,
            };
            self.ids.insert(id);
            self.entries.push(e.clone());
            return Some(e);
        }
        None
    }
}

// "Вы уверены, что хотите взять Реликвия Лит P9 [СИЯЮЩАЯ] с собой на миссию?" -> "Реликвия Лит P9 [СИЯЮЩАЯ]".
// English client (not seen in a log yet): "... want to take Lith P9 Relic [RADIANT] on this mission?".
pub fn relic_in_dialog(line: &str) -> Option<String> {
    if !line.contains("Dialog::CreateOkCancel(description=") {
        return None;
    }
    let pick = |from: &str, to: &str| -> Option<String> {
        let i = line.find(from)? + from.len();
        let j = line[i..].find(to)?;
        let s = line[i..i + j].trim();
        (!s.is_empty()).then(|| s.to_string())
    };
    pick("хотите взять ", " с собой на миссию").or_else(|| pick("want to take ", " on this mission")).or_else(|| pick("want to take ", " with you"))
}

// "2627.023 Sys [Info]: ..." or "!2626.641 Sys ..." -> 2627.023
fn log_seconds(line: &str) -> Option<f64> {
    line.trim_start_matches('!').split(' ').next()?.parse().ok()
}

// "Tue Sep 29 17:21:06 2026]" -> unix ms.
fn parse_utc(s: &str) -> Option<u64> {
    let mut it = s.trim_end_matches(']').split_whitespace();
    let _dow = it.next()?;
    let mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].iter().position(|m| Some(*m) == it.clone().next())? as i64 + 1;
    it.next();
    let day: i64 = it.next()?.parse().ok()?;
    let hms: Vec<i64> = it.next()?.split(':').filter_map(|x| x.parse().ok()).collect();
    let year: i64 = it.next()?.trim_end_matches(']').parse().ok()?;
    if hms.len() != 3 {
        return None;
    }
    // Days from civil date (Howard Hinnant's algorithm).
    let (y, m) = if mon <= 2 { (year - 1, mon + 9) } else { (year, mon - 3) };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * m + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let secs = days * 86400 + hms[0] * 3600 + hms[1] * 60 + hms[2];
    u64::try_from(secs * 1000).ok()
}

// ---------- feeding from the log tail (bench.rs)

// The log written before the app started: entries only, no events.
pub fn history(app: &AppHandle, text: &str) {
    let Some(j) = app.try_state::<JournalState>() else { return };
    let mut j = j.lock().unwrap();
    let before = j.entries.len();
    for line in text.lines() {
        j.line(line);
    }
    if j.entries.len() != before || j.dirty {
        j.dirty = false;
        j.save();
    }
}

pub fn on_line(app: &AppHandle, line: &str) {
    let Some(j) = app.try_state::<JournalState>() else { return };
    let mut j = j.lock().unwrap();
    if let Some(e) = j.line(line) {
        j.dirty = false;
        j.save();
        let _ = app.emit("journal-new", e);
    } else if j.dirty {
        j.dirty = false;
        j.save();
    }
}

// ---------- commands

#[tauri::command]
pub fn account_id(j: tauri::State<JournalState>) -> Option<String> {
    j.lock().unwrap().account.clone()
}

#[tauri::command]
pub fn journal_list(j: tauri::State<JournalState>) -> Vec<Opening> {
    j.lock().unwrap().entries.clone()
}

// Cards the overlay read on the reward screen: attached to the entry of that screen (within 60 s).
#[tauri::command]
pub fn journal_offer(app: AppHandle, j: tauri::State<JournalState>, items: Vec<String>) {
    let mut j = j.lock().unwrap();
    let now = crate::bench::now_ms();
    // The log line may come seconds after the overlay read the cards: then wait for it.
    let Some(e) = j.entries.iter_mut().rev().find(|e| now.abs_diff(e.t) < 60_000 && e.offer.is_empty()) else {
        j.pending_offer = Some((now, items));
        return;
    };
    e.offer = items;
    let e = e.clone();
    j.save();
    let _ = app.emit("journal-update", e);
}

#[tauri::command]
pub fn journal_pick(app: AppHandle, j: tauri::State<JournalState>, id: String, item: Option<String>, by: Option<String>, offer: Option<Vec<String>>) {
    let mut j = j.lock().unwrap();
    let Some(e) = j.entries.iter_mut().find(|e| e.id == id) else { return };
    if let Some(o) = offer {
        e.offer = o; // corrected by the inventory (OCR misread a card)
    }
    e.pick_by = by.filter(|_| item.is_some());
    e.picked = item;
    let e = e.clone();
    j.save();
    let _ = app.emit("journal-update", e);
}

#[tauri::command]
pub fn journal_delete(app: AppHandle, j: tauri::State<JournalState>, id: String) {
    let mut j = j.lock().unwrap();
    j.entries.retain(|e| e.id != id);
    j.save();
    let _ = app.emit("journal-deleted", id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_and_dialog() {
        assert_eq!(parse_utc("Tue Sep 29 17:21:06 2026]"), Some(1790702466000));
        let l = "2347.532 Script [Info]: Dialog.lua: Dialog::CreateOkCancel(description=Вы уверены, что хотите взять Реликвия Лит P9 [СИЯЮЩАЯ] с собой на миссию? В случае";
        assert_eq!(relic_in_dialog(l).as_deref(), Some("Реликвия Лит P9 [СИЯЮЩАЯ]"));
    }
}
