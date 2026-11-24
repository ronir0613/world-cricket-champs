/* ==========================================================================
   Front-end shell: top bar, tabs, button prompts, NEW dots, notifications,
   motion and sound, player identity, settings, theme, tour, save slots.
   Loaded after index.html's script and features.js, and uses their helpers.
   ========================================================================== */

const html = document.documentElement;
const shell = document.querySelector("#shell");
const promptBar = document.querySelector("#promptBar");
const cwcAppEl = document.querySelector("#cwcApp");
const splashEl = document.querySelector("#splash");

/* ---------- Global settings, shared by every save ---------- */
const SETTINGS_KEY = "wcc-settings";
const SETTINGS_DEFAULTS = { sfx: true, sfxVolume: 0.6, haptics: true, theme: "day", text: "100", reduceMotion: false, colour: "off" };

function readSettings() {
  try { return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch (_) { return { ...SETTINGS_DEFAULTS }; }
}
let settings = readSettings();
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* Storage may be unavailable. */ }
  applySettings();
}
function applySettings() {
  html.dataset.theme = settings.theme;
  html.dataset.colour = settings.colour;
  html.style.fontSize = `${settings.text}%`;
  html.classList.toggle("reduce-motion", settings.reduceMotion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", settings.theme === "night" ? "#0a1424" : "#ffffff");
}
applySettings();
const motionReduced = () => settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Sound kit and haptics ---------- */
const WCCSound = (() => {
  let ctx = null;
  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(steps, type = "sine", level = 0.06) {
    const audio = context();
    let at = audio.currentTime;
    for (const [frequency, duration] of steps) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, at);
      const peak = Math.max(0.0002, level * settings.sfxVolume);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
      at += duration * 0.8;
    }
  }
  function whoosh() {
    const audio = context();
    const length = Math.floor(audio.sampleRate * 0.16);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(600, audio.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, audio.currentTime + 0.15);
    gain.gain.value = 0.05 * settings.sfxVolume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  }
  const SOUNDS = {
    focus: () => tone([[880, 0.05]], "sine", 0.025),
    select: () => tone([[660, 0.06], [990, 0.08]], "triangle", 0.05),
    back: () => tone([[560, 0.06], [400, 0.09]], "triangle", 0.045),
    tab: () => tone([[740, 0.05], [880, 0.06]], "sine", 0.035),
    unlock: () => tone([[523, 0.09], [659, 0.09], [784, 0.09], [1046, 0.22]], "triangle", 0.07),
    error: () => tone([[180, 0.12], [150, 0.14]], "square", 0.03),
    page: whoosh
  };
  return {
    play(name) {
      if (!settings.sfx || !SOUNDS[name]) return;
      try { SOUNDS[name](); } catch (_) { /* Audio is optional. */ }
    }
  };
})();
window.WCCSound = WCCSound;

function buzz(pattern = 8) {
  if (!settings.haptics || !navigator.vibrate || !window.matchMedia("(pointer: coarse)").matches) return;
  try { navigator.vibrate(pattern); } catch (_) { /* Vibration is optional. */ }
}

let navDirection = "forward";
document.addEventListener("click", (event) => {
  const control = event.target.closest("button, a[href], label.choice-tile, .segmented label, .swatch, .identity-option");
  if (!control || control.disabled || control.closest("#rotatePrompt")) return;
  const isBack = control.matches(".btn-back, [data-back-home], [data-back-to-hub], [data-nation-back], [data-venue-list], #backFromHub, #backToHome, #backFromCareer, #backFromStoryMode, #backFromCreate, #backFromQuickMatch, #backFromVenues, #pickerHome, #hubHome, #backToStage, #versusBack, #backFromTeamSheet") && !control.matches("#newCareer, #replayTutorial, #resetSave, #kitReset, #welcomeSkip, #coachSkip, [data-close-dialog]");
  if (isBack) navDirection = "back";
  WCCSound.play(isBack ? "back" : "select");
  buzz(isBack ? 6 : 10);
}, true);

/* Error sound when a validation message appears. */
new MutationObserver((records) => {
  if (records.some((record) => record.target.matches(".field-error") && !record.target.hidden)) { WCCSound.play("error"); buzz([20, 40, 20]); }
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

/* ---------- Page transitions ---------- */
function animateIn(element, direction) {
  if (!element || motionReduced()) return;
  element.classList.remove("enter-forward", "enter-back");
  void element.offsetWidth;
  element.classList.add(direction === "back" ? "enter-back" : "enter-forward");
  element.addEventListener("animationend", () => element.classList.remove("enter-forward", "enter-back"), { once: true });
}

function visibleHomeSection() {
  return [...home.querySelectorAll(":scope > section")].find((section) => !section.hidden) || null;
}

const baseShowPage = showPage;
showPage = function showPageWithShell(page, title) {
  const before = visibleHomeSection();
  baseShowPage(page, title);
  if (page !== before) { animateIn(page, navDirection); WCCSound.play("page"); }
  navDirection = "forward";
  scheduleShellUpdate();
};

window.addEventListener("hashchange", () => {
  window.requestAnimationFrame(() => {
    const target = [document.querySelector("#teamPicker:not([hidden])"), document.querySelector("#fixturePage:not([hidden])"), document.querySelector("#stageView:not([hidden])")].find(Boolean);
    animateIn(target, navDirection);
    navDirection = "forward";
  });
});

/* ---------- Seen-state for NEW dots (per save) ---------- */
const SEEN_KEY = "world-cricket-champs-seen";
const NEW_KEYS = ["career", "cwc27", "quick-match", "store", "trophies", "nets", "venues"];
function seenSet() { return new Set(storeGet(SEEN_KEY, [])); }
function markSeen(key) {
  if (!key) return;
  const seen = seenSet();
  if (seen.has(key)) return;
  seen.add(key);
  storeSet(SEEN_KEY, [...seen]);
  renderPips();
}
const TILE_PIP_KEYS = { "CWC27": "cwc27", "Career": "career", "Quick Match": "quick-match", "Store / Kit Locker": "store", "Trophy & Achievements": "trophies", "Practice Nets": "nets" };
document.querySelectorAll(".modes > .mode[data-mode]").forEach((tile) => {
  const key = TILE_PIP_KEYS[tile.dataset.mode];
  if (!key) return;
  const pip = document.createElement("span");
  pip.className = "new-pip tile-pip";
  pip.dataset.newKey = key;
  pip.textContent = "New";
  pip.hidden = true;
  tile.append(pip);
});
function renderPips() {
  const seen = seenSet();
  document.querySelectorAll("[data-new-key]").forEach((pip) => { pip.hidden = seen.has(pip.dataset.newKey); });
}

/* ---------- Tabs ---------- */
const TABS = ["home", "career", "cwc27", "quick-match", "store", "trophies"];
const SECTION_TAB = { homeMenu: "home", careerModesPage: "career", storyTeamSelectPage: "career", careerCreatePage: "career", careerHubPage: "career", careerSchedulePage: "career", careerTrainingPage: "career", careerInboxPage: "career", careerStatsPage: "career", quickMatchPage: "quick-match", teamSheetPage: "quick-match", kitPage: "store", trophyPage: "trophies" };
const SECTION_SEEN = { netsPage: "nets", venuesPage: "venues" };

function currentTab() {
  if (!splashEl.hidden) return null;
  if (cwcAppEl.classList.contains("is-active")) return "cwc27";
  const section = visibleHomeSection();
  return section ? SECTION_TAB[section.id] || null : null;
}

function goTab(tab) {
  if (!tab) return;
  const fromCwc = cwcAppEl.classList.contains("is-active");
  if (tab === currentTab() && tab !== "home") return;
  WCCSound.play("tab");
  if (tab === "cwc27") {
    if (typeof showLoading === "function") showLoading("CWC27");
    window.CWC27.open();
    scheduleShellUpdate();
    return;
  }
  if (fromCwc) window.CWC27.close();
  if (tab === "home") showPage(homeMenu, "Home | World Cricket Champs");
  if (tab === "career") { if (typeof showLoading === "function") showLoading("Career"); if (readCareer()) openHub(); else showPage(careerModesPage, "Career | World Cricket Champs"); }
  if (tab === "quick-match") { if (typeof showLoading === "function") showLoading("Quick Match"); openQuickMatch(); }
  if (tab === "store") openFeaturePage("kit");
  if (tab === "trophies") openFeaturePage("trophies");
  const button = shell.querySelector(`[data-tab="${tab}"]`);
  if (button && html.classList.contains("nav-focus")) button.focus();
}

function stepTab(delta) {
  if (!splashEl.hidden || document.querySelector("dialog[open]") || !document.querySelector("#coach").hidden || !document.querySelector("#versusScreen").hidden) return;
  const index = Math.max(0, TABS.indexOf(currentTab() || "home"));
  goTab(TABS[(index + delta + TABS.length) % TABS.length]);
}

shell.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => goTab(button.dataset.tab)));
shell.querySelector("[data-shoulder=prev]").addEventListener("click", () => stepTab(-1));
shell.querySelector("[data-shoulder=next]").addEventListener("click", () => stepTab(1));
document.querySelector("#shellBrand").addEventListener("click", () => goTab("home"));
window.addEventListener("wcc:tab", (event) => stepTab(event.detail));
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.matches && event.target.matches("input, textarea, select")) return;
  if (event.key === "q" || event.key === "Q") stepTab(-1);
  if (event.key === "e" || event.key === "E") stepTab(1);
});

/* ---------- Identity: badge, banner, level ---------- */
const IDENTITY_KEY = "world-cricket-champs-identity";
const BADGES = {
  ball: '<circle cx="12" cy="12" r="8"/><path d="M8 5.5c2.5 3.5 2.5 9.5 0 13M16 5.5c-2.5 3.5-2.5 9.5 0 13" stroke-dasharray="1.5 2"/>',
  bat: '<path d="M14.5 3.5l6 6-9 9-4 1 1-4z"/><path d="M5 17l2 2-2.5 2.5-2-2z"/>',
  stumps: '<path d="M7 5v15M12 5v15M17 5v15M6 5h12"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v1H4z"/><path d="M4 18h16M8 18v3M12 18v3M16 18v3"/>',
  gloves: '<path d="M7 21V9a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v4a2 2 0 0 1 4 0v7a5 5 0 0 1-5 5z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'
};
const BANNERS = {
  navy: { label: "Night stadium", css: "radial-gradient(120% 90% at 100% 0%, rgba(212,173,82,.28), transparent 55%), linear-gradient(150deg, #1d3f7a, #0d1f3d 80%)" },
  green: { label: "Outfield", css: "repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 40px, transparent 40px 80px), linear-gradient(150deg, #1f8a52, #0b4f2f)" },
  gold: { label: "Trophy gold", css: "radial-gradient(90% 90% at 20% 0%, rgba(255,255,255,.35), transparent 55%), linear-gradient(150deg, #c9993a, #6f4f12)" },
  maroon: { label: "Test cap", css: "linear-gradient(150deg, #8c1d2c, #3d0b14)" },
  wanderers: { label: "The Wanderers", css: "linear-gradient(90deg, rgba(8,20,44,.9), rgba(8,20,44,.35)), url('assets/photos/johannesburg.jpg') center / cover" },
  newlands: { label: "Newlands", css: "linear-gradient(90deg, rgba(8,20,44,.9), rgba(8,20,44,.35)), url('assets/photos/cape-town.jpg') center / cover" }
};
const TITLES = ["Rookie", "Debutant", "Regular", "Rising star", "Star", "Champion", "Legend"];

function identity() { return { badge: "ball", banner: "navy", ...storeGet(IDENTITY_KEY, {}) }; }
function progress() {
  const count = ACHIEVEMENTS.filter((item) => unlockedAchievements()[item.id]).length;
  const xp = count * 100;
  const level = Math.min(TITLES.length, 1 + Math.floor(xp / 200));
  const atMax = level === TITLES.length;
  const into = atMax ? 200 : xp % 200;
  return { xp, level, title: TITLES[level - 1], into, atMax };
}
function badgeSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BADGES[name] || BADGES.ball}</svg>`;
}

function refreshIdentity() {
  const me = identity();
  const p = progress();
  const name = readStoredNametag() || "Player";
  document.querySelectorAll("#shellBadge, #profileBannerBadge").forEach((element) => { element.innerHTML = badgeSvg(me.badge); });
  document.querySelector("#shellName").textContent = name;
  document.querySelector("#shellTitle").textContent = p.title;
  document.querySelector("#shellLevel").textContent = String(p.level);
  document.querySelector("#shellXpBar").style.width = `${(p.into / 200) * 100}%`;
  document.querySelector("#profileBanner").style.background = (BANNERS[me.banner] || BANNERS.navy).css;
  document.querySelector("#profileBannerName").textContent = name;
  document.querySelector("#profileBannerTitle").textContent = p.title;
  document.querySelector("#profileBannerLevel").textContent = String(p.level);
  document.querySelector("#profileBannerXp").textContent = p.atMax ? `${p.xp} XP · Max level` : `${p.into} / 200 XP`;
  document.querySelector("#profileBannerXpBar").style.width = `${(p.into / 200) * 100}%`;
  const favourite = FEATURE_TEAMS.find((team) => team.code === storeGet(FAVOURITE_KEY, ""));
  document.querySelector("#profileBannerFlag").innerHTML = favourite ? `<img src="${favourite.flag}" alt="">` : "";
  document.querySelector("#shellProfile").setAttribute("aria-label", `Open your profile. ${name}, ${p.title}, level ${p.level}.`);
}

function renderIdentityPickers() {
  const me = identity();
  document.querySelector("#badgePicker").innerHTML = Object.keys(BADGES).map((name) => `<label class="identity-option" title="${name}"><input type="radio" name="identityBadge" value="${name}" ${name === me.badge ? "checked" : ""}><span class="identity-badge">${badgeSvg(name)}</span><span class="visually-hidden">${name}</span></label>`).join("");
  document.querySelector("#bannerPicker").innerHTML = Object.entries(BANNERS).map(([key, banner]) => `<label class="identity-option banner-option" title="${banner.label}"><input type="radio" name="identityBanner" value="${key}" ${key === me.banner ? "checked" : ""}><span class="banner-swatch" style="background:${banner.css}"></span><span class="banner-label">${banner.label}</span></label>`).join("");
}
document.querySelector("#profileSettingsPage").addEventListener("change", (event) => {
  if (event.target.name === "identityBadge") storeSet(IDENTITY_KEY, { ...identity(), badge: event.target.value });
  if (event.target.name === "identityBanner") storeSet(IDENTITY_KEY, { ...identity(), banner: event.target.value });
  if (event.target.id === "favouriteTeamSelect") window.setTimeout(refreshIdentity, 0);
  refreshIdentity();
});
nametagInput.addEventListener("input", refreshIdentity);
document.querySelector("#shellProfile").addEventListener("click", () => {
  if (cwcAppEl.classList.contains("is-active")) window.CWC27.close();
  showPage(profileSettingsPage, "Profile | World Cricket Champs");
  document.querySelector("#backToHome").focus();
});

/* Profile page opening also refreshes pickers. */
const profileObserver = new MutationObserver(() => { if (!profileSettingsPage.hidden) { renderIdentityPickers(); refreshIdentity(); } });
profileObserver.observe(profileSettingsPage, { attributes: true, attributeFilter: ["hidden"] });

/* Unlocks feed identity, sound and notifications. */
const baseUnlock = unlockAchievement;
unlockAchievement = function unlockWithShell(id) {
  const before = Boolean(unlockedAchievements()[id]);
  baseUnlock(id);
  if (!before && unlockedAchievements()[id]) {
    const levelBefore = progress().level;
    WCCSound.play("unlock");
    buzz([12, 40, 12]);
    refreshIdentity();
    renderNotifications();
    if (progress().level > levelBefore) showToast(`Level up! You're now level ${progress().level}.`);
  }
};

/* ---------- Notifications ---------- */
const NOTIF_SEEN_KEY = "world-cricket-champs-notifications-seen";
const notifDialog = document.querySelector("#notifDialog");

function notifications() {
  const items = [];
  const unlocked = unlockedAchievements();
  for (const item of ACHIEVEMENTS) {
    if (unlocked[item.id]) items.push({ kind: "achievement", time: unlocked[item.id], title: `Achievement unlocked: ${item.title}`, copy: item.copy, go: "trophies" });
  }
  const career = readCareer();
  if (career) {
    const unread = inboxFor(career).filter((message) => !(career.inboxRead || []).includes(message.id)).length;
    if (unread) items.push({ kind: "inbox", time: career.createdAt || new Date(0).toISOString(), title: `${unread} unread career ${unread === 1 ? "message" : "messages"}`, copy: "Your coach and the selectors have been in touch.", go: "inbox", sticky: true });
  } else {
    items.push({ kind: "tip", time: new Date(0).toISOString(), title: "Start your Story Mode career", copy: "Pick a country and create your player.", go: "career", sticky: true });
  }
  if (!window.CWC27.savedTeam()) items.push({ kind: "tip", time: new Date(0).toISOString(), title: "Pick a side for CWC27", copy: "Choose a team to follow through the tournament.", go: "cwc27", sticky: true });
  return items.sort((a, b) => (b.time > a.time ? 1 : -1));
}

function unreadCount() {
  const seenAt = storeGet(NOTIF_SEEN_KEY, "");
  return notifications().filter((item) => item.kind === "inbox" || (item.kind === "achievement" && item.time > seenAt)).length;
}

function renderNotifications() {
  const count = unreadCount();
  const badge = document.querySelector("#shellBellCount");
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? "9+" : String(count);
  document.querySelector("#shellBell").setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
  const seenAt = storeGet(NOTIF_SEEN_KEY, "");
  const list = notifications();
  document.querySelector("#notifList").innerHTML = list.length ? list.map((item, index) => `
    <li><button class="notif-item notif-${item.kind}${(item.kind === "achievement" && item.time > seenAt) || item.kind === "inbox" ? " is-unread" : ""}" type="button" data-notif="${index}">
      <span class="notif-icon" aria-hidden="true"></span>
      <span class="notif-copy"><b>${item.title}</b><span>${item.copy}</span></span>
    </button></li>`).join("") : `<li class="notif-empty">You're all caught up.</li>`;
  document.querySelector("#notifList").dataset.items = JSON.stringify(list.map((item) => item.go));
}

document.querySelector("#shellBell").addEventListener("click", () => {
  renderNotifications();
  notifDialog.showModal();
  storeSet(NOTIF_SEEN_KEY, new Date().toISOString());
  renderNotifications();
  const first = notifDialog.querySelector(".notif-item");
  (first || notifDialog.querySelector("[data-close-dialog]")).focus();
});
notifDialog.addEventListener("click", (event) => {
  if (event.target === notifDialog || event.target.closest("[data-close-dialog]")) { notifDialog.close(); return; }
  const item = event.target.closest("[data-notif]");
  if (!item) return;
  const go = JSON.parse(document.querySelector("#notifList").dataset.items || "[]")[Number(item.dataset.notif)];
  notifDialog.close();
  if (go === "inbox") { if (cwcAppEl.classList.contains("is-active")) window.CWC27.close(); openHub(); document.querySelector("[data-career-page=inbox]").click(); }
  else goTab(go);
});

/* ---------- Button prompts ---------- */
const GLYPHS = {
  keyboard: { select: "<kbd>Enter</kbd>", back: "<kbd>Esc</kbd>", tabs: "<kbd>Q</kbd><kbd>E</kbd>" },
  xbox: { select: '<span class="glyph glyph-xa">A</span>', back: '<span class="glyph glyph-xb">B</span>', tabs: '<span class="glyph glyph-bumper">LB</span><span class="glyph glyph-bumper">RB</span>' },
  ps: { select: '<span class="glyph glyph-ps-cross">✕</span>', back: '<span class="glyph glyph-ps-circle">○</span>', tabs: '<span class="glyph glyph-bumper">L1</span><span class="glyph glyph-bumper">R1</span>' }
};
function renderPrompts() {
  const input = html.dataset.input || "pointer";
  const set = GLYPHS[input];
  const show = Boolean(set) && splashEl.hidden && document.querySelector("#rotatePrompt") && getComputedStyle(document.querySelector("#rotatePrompt")).display === "none";
  promptBar.hidden = !show;
  html.classList.toggle("prompts-on", show);
  if (!show) return;
  const dialogOpen = Boolean(document.querySelector("dialog[open]"));
  const onHome = currentTab() === "home" && !dialogOpen;
  const overlay = !document.querySelector("#versusScreen").hidden || !document.querySelector("#coach").hidden;
  const items = [[set.select, "Select"], [set.back, dialogOpen ? "Close" : onHome ? "Menu" : "Back"]];
  if (!dialogOpen && !overlay) items.push([set.tabs, "Switch tab"]);
  promptBar.innerHTML = items.map(([glyph, label]) => `<span class="prompt"><span class="prompt-glyphs">${glyph}</span>${label}</span>`).join("");
}
window.addEventListener("wcc:input-change", renderPrompts);

/* ---------- Shell state ---------- */
let shellFrame = 0;
function scheduleShellUpdate() {
  if (shellFrame) return;
  shellFrame = window.requestAnimationFrame(() => { shellFrame = 0; updateShell(); });
}
function updateShell() {
  const on = splashEl.hidden;
  shell.hidden = !on;
  html.classList.toggle("shell-on", on);
  const tab = currentTab();
  shell.querySelectorAll("[data-tab]").forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (tab && tab !== "home") markSeen(tab);
  const section = visibleHomeSection();
  if (section && SECTION_SEEN[section.id] && !cwcAppEl.classList.contains("is-active")) markSeen(SECTION_SEEN[section.id]);
  renderPrompts();
}
new MutationObserver(scheduleShellUpdate).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden", "class", "open"] });
window.addEventListener("resize", scheduleShellUpdate);

/* ---------- Settings page ---------- */
const settingsPage = document.querySelector("#settingsPage");
function showSettingsTab(name) {
  settingsPage.querySelectorAll("[data-settings-tab]").forEach((button) => {
    if (button.dataset.settingsTab === name) button.setAttribute("aria-current", "true"); else button.removeAttribute("aria-current");
  });
  settingsPage.querySelectorAll("[data-settings-panel]").forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== name; });
  if (name === "saves") renderSaveSlots();
}
function syncSettingsControls() {
  document.querySelector("#sfxToggle").setAttribute("aria-checked", String(settings.sfx));
  document.querySelector("#hapticsToggle").setAttribute("aria-checked", String(settings.haptics));
  document.querySelector("#motionToggle").setAttribute("aria-checked", String(settings.reduceMotion));
  document.querySelector("#sfxVolume").value = String(Math.round(settings.sfxVolume * 100));
  document.querySelector("#sfxVolumeValue").textContent = `${Math.round(settings.sfxVolume * 100)}%`;
  const theme = settingsPage.querySelector(`input[name=settingTheme][value="${settings.theme}"]`);
  if (theme) theme.checked = true;
  const text = settingsPage.querySelector(`input[name=settingText][value="${settings.text}"]`);
  if (text) text.checked = true;
  document.querySelector("#colourMode").value = settings.colour;
}
function openSettings(tabName = "audio") {
  if (cwcAppEl.classList.contains("is-active")) window.CWC27.close();
  syncSettingsControls();
  showSettingsTab(tabName);
  showPage(settingsPage, "Settings | World Cricket Champs");
  settingsPage.querySelector("[data-back-home]").focus();
}
document.querySelector("#shellSettings").addEventListener("click", () => openSettings());
settingsPage.querySelectorAll("[data-settings-tab]").forEach((button) => button.addEventListener("click", () => showSettingsTab(button.dataset.settingsTab)));
document.querySelector("#sfxToggle").addEventListener("click", () => { saveSettings({ sfx: !settings.sfx }); syncSettingsControls(); });
document.querySelector("#hapticsToggle").addEventListener("click", () => { saveSettings({ haptics: !settings.haptics }); syncSettingsControls(); buzz(20); });
document.querySelector("#motionToggle").addEventListener("click", () => { saveSettings({ reduceMotion: !settings.reduceMotion }); syncSettingsControls(); });
document.querySelector("#sfxVolume").addEventListener("input", (event) => { saveSettings({ sfxVolume: Number(event.target.value) / 100 }); syncSettingsControls(); });
document.querySelector("#sfxVolume").addEventListener("change", () => WCCSound.play("select"));
settingsPage.addEventListener("change", (event) => {
  if (event.target.name === "settingTheme") saveSettings({ theme: event.target.value });
  if (event.target.name === "settingText") saveSettings({ text: event.target.value });
  if (event.target.id === "colourMode") saveSettings({ colour: event.target.value });
});

/* Pause menu "Profile and settings" now opens Settings; add a Profile entry. */
const pauseProfile = document.querySelector("[data-pause=profile]");
if (pauseProfile) {
  pauseProfile.querySelector("span").textContent = "Settings";
  pauseProfile.dataset.pause = "settings";
  const profileItem = document.createElement("button");
  profileItem.type = "button";
  profileItem.dataset.pause = "profile-page";
  profileItem.innerHTML = "<span>Profile</span>";
  pauseProfile.before(profileItem);
}
document.querySelector("#pauseDialog").addEventListener("click", (event) => {
  const item = event.target.closest("[data-pause]");
  if (!item) return;
  if (item.dataset.pause === "settings") openSettings();
  if (item.dataset.pause === "profile-page") document.querySelector("#shellProfile").click();
});
window.addEventListener("wcc:menu", () => {
  if (!splashEl.hidden || document.querySelector("dialog[open]")) return;
  if (cwcAppEl.classList.contains("is-active")) window.CWC27.close();
  showPage(homeMenu, "Home | World Cricket Champs");
  openPause();
});

/* ---------- Confirm dialog ---------- */
const confirmDialog = document.querySelector("#confirmDialog");
function confirmAction(title, copy, okLabel) {
  return new Promise((resolve) => {
    document.querySelector("#confirmTitle").textContent = title;
    document.querySelector("#confirmCopy").textContent = copy;
    document.querySelector("#confirmOk").textContent = okLabel;
    confirmDialog.returnValue = "cancel";
    confirmDialog.showModal();
    confirmDialog.querySelector("button[value=cancel]").focus();
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "ok"), { once: true });
  });
}

/* ---------- Save slots ---------- */
const SLOTS_KEY = "wcc-slots";
const DATA_PREFIX = "world-cricket-champs-";
const GLOBAL_DATA_KEYS = ["world-cricket-champs-music-volume", "world-cricket-champs-music-enabled", "world-cricket-champs-recent-tracks"];
function isSaveKey(key) { return key.startsWith(DATA_PREFIX) && !GLOBAL_DATA_KEYS.includes(key); }
function readSlots() {
  const stored = storeGet(SLOTS_KEY, null);
  return stored && Array.isArray(stored.slots) ? stored : { active: 0, slots: [null, null, null] };
}
function currentSaveData() {
  const data = {};
  try { for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); if (isSaveKey(key)) data[key] = localStorage.getItem(key); } }
  catch (_) { /* Storage may be unavailable. */ }
  return data;
}
function clearSaveData() {
  try { Object.keys(currentSaveData()).forEach((key) => localStorage.removeItem(key)); } catch (_) { /* Storage may be unavailable. */ }
}
function summarise(data) {
  if (!data || !Object.keys(data).length) return null;
  const parse = (key, fallback) => { try { return JSON.parse(data[key]); } catch (_) { return fallback; } };
  const career = parse(`${DATA_PREFIX}career`, null);
  const achievements = Object.keys(parse(`${DATA_PREFIX}achievements`, {}) || {}).length;
  return {
    name: data[`${DATA_PREFIX}nametag`] || "Player",
    career: career ? `${career.player.name} · ${career.country.teamName}` : "No career yet",
    achievements
  };
}
function renderSaveSlots() {
  const state = readSlots();
  const html_ = state.slots.map((slot, index) => {
    const active = index === state.active;
    const info = summarise(active ? currentSaveData() : slot && slot.data);
    return `<article class="save-slot${active ? " is-active" : ""}">
      <span class="save-slot-number">Save ${index + 1}</span>
      ${info ? `<b>${escapeHtml(info.name)}</b><span>${escapeHtml(info.career)}</span><span>${info.achievements} of ${ACHIEVEMENTS.length} achievements</span>` : `<b>Empty</b><span>Start fresh with a new profile.</span>`}
      ${active ? `<span class="save-slot-status">In use</span>` : `<button class="cwc-primary" type="button" data-load-slot="${index}">${info ? "Load save" : "Start new save"} <span aria-hidden="true">→</span></button>`}
    </article>`;
  }).join("");
  document.querySelector("#saveSlots").innerHTML = html_;
}
document.querySelector("#saveSlots").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-load-slot]");
  if (!button) return;
  const target = Number(button.dataset.loadSlot);
  const ok = await confirmAction(`Switch to save ${target + 1}?`, "Your current save is kept. The game reloads to the title screen.", "Switch save");
  if (!ok) return;
  const state = readSlots();
  state.slots[state.active] = { data: currentSaveData(), savedAt: new Date().toISOString() };
  clearSaveData();
  const next = state.slots[target];
  if (next && next.data) Object.entries(next.data).forEach(([key, value]) => { try { localStorage.setItem(key, value); } catch (_) { /* ignore */ } });
  state.active = target;
  storeSet(SLOTS_KEY, state);
  try { sessionStorage.clear(); } catch (_) { /* ignore */ }
  window.location.href = window.location.pathname;
});
document.querySelector("#resetSave").addEventListener("click", async () => {
  const ok = await confirmAction("Reset this save?", "This permanently deletes the career, kit, achievements and profile in this save. Settings stay. This can't be undone.", "Reset save");
  if (!ok) return;
  clearSaveData();
  try { sessionStorage.clear(); } catch (_) { /* ignore */ }
  window.location.href = window.location.pathname;
});

/* ---------- Guided tour ---------- */
const TOUR_KEY = "world-cricket-champs-tour-done";
const coach = document.querySelector("#coach");
const TOUR = [
  { target: ".shell-tab-list", title: "Switch areas", copy: "Jump between Home, Career, CWC27, Quick Match, Store and Trophies. Press Q and E, or LB and RB on a controller." },
  { target: "#shellProfile", title: "Your profile", copy: "Your badge, title and level live here. Unlock achievements to level up." },
  { target: "#shellBell", title: "Notifications", copy: "Achievements, career messages and next steps collect here." },
  { target: ".modes > .mode.cwc", title: "Featured", copy: "Pick up where you left off. The featured tile always shows what's next." }
];
let tourIndex = 0;
function placeCoach() {
  const step = TOUR[tourIndex];
  const target = document.querySelector(step.target);
  if (!target) { endTour(); return; }
  const rect = target.getBoundingClientRect();
  const pad = 6;
  const spot = document.querySelector("#coachSpot");
  Object.assign(spot.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
  const card = document.querySelector("#coachCard");
  const cardWidth = Math.min(340, window.innerWidth - 32);
  card.style.width = `${cardWidth}px`;
  const below = rect.bottom + 16;
  const fitsBelow = below + card.offsetHeight < window.innerHeight - 12;
  card.style.top = `${fitsBelow ? below : Math.max(12, rect.top - card.offsetHeight - 16)}px`;
  card.style.left = `${Math.min(Math.max(16, rect.left), window.innerWidth - cardWidth - 16)}px`;
}
function renderTourStep() {
  const step = TOUR[tourIndex];
  document.querySelector("#coachStep").textContent = `Tour · ${tourIndex + 1} of ${TOUR.length}`;
  document.querySelector("#coachTitle").textContent = step.title;
  document.querySelector("#coachCopy").textContent = step.copy;
  document.querySelector("#coachNext").firstChild.textContent = tourIndex === TOUR.length - 1 ? "Let's play " : "Next ";
  placeCoach();
  document.querySelector("#coachNext").focus();
}
function startTour() {
  if (!splashEl.hidden) return;
  if (cwcAppEl.classList.contains("is-active")) window.CWC27.close();
  showPage(homeMenu, "Home | World Cricket Champs");
  tourIndex = 0;
  coach.hidden = false;
  window.requestAnimationFrame(renderTourStep);
}
function endTour() {
  coach.hidden = true;
  storeSet(TOUR_KEY, true);
  scheduleShellUpdate();
}
document.querySelector("#coachNext").addEventListener("click", () => {
  if (tourIndex >= TOUR.length - 1) { endTour(); return; }
  tourIndex += 1;
  renderTourStep();
});
document.querySelector("#coachSkip").addEventListener("click", endTour);
window.addEventListener("resize", () => { if (!coach.hidden) placeCoach(); });
document.querySelector("#replayTutorial").addEventListener("click", startTour);
welcomeDialog.addEventListener("close", () => { if (!storeGet(TOUR_KEY, false)) window.setTimeout(startTour, 350); });
document.querySelector("#start").addEventListener("click", () => window.setTimeout(() => {
  if (!welcomeDialog.open && !storeGet(TOUR_KEY, false) && storeGet(WELCOMED_KEY, false)) startTour();
}, 1500));

/* ---------- Offline play ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* Offline mode is optional. */ }); });
}

/* ---------- Start up ---------- */
renderPips();
refreshIdentity();
renderNotifications();
updateShell();
const baseRefreshHomeShell = refreshHome;
refreshHome = function refreshHomeWithShell() { baseRefreshHomeShell(); refreshIdentity(); renderNotifications(); };
