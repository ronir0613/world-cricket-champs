/* ==========================================================================
   Feature screens: achievements, trophies, kit locker, welcome + pause
   menus, venue guide, practice nets and loading screens.
   Uses helpers defined in index.html (showPage, showToast, readCareer,
   saveCareer, flagImg, home, homeMenu, profileSettingsPage, ...).
   ========================================================================== */

/* ---------- Shared data ---------- */
const FEATURE_TEAMS = [
  { code: "IND", name: "India", flag: "assets/flags/IN.svg" },
  { code: "AUS", name: "Australia", flag: "assets/flags/AU.svg" },
  { code: "ENG", name: "England", flag: "assets/flags/ENG.svg" },
  { code: "PAK", name: "Pakistan", flag: "assets/flags/PK.svg" },
  { code: "NZL", name: "New Zealand", flag: "assets/flags/NZ.svg" },
  { code: "SA", name: "South Africa", flag: "assets/flags/ZA.svg" },
  { code: "SL", name: "Sri Lanka", flag: "assets/flags/LK.svg" },
  { code: "BAN", name: "Bangladesh", flag: "assets/flags/BD.svg" },
  { code: "AFG", name: "Afghanistan", flag: "assets/flags/AF.svg" },
  { code: "ZIM", name: "Zimbabwe", flag: "assets/flags/ZW.svg" }
];

const VENUES = [
  { id: "johannesburg", name: "The Wanderers Stadium", city: "Johannesburg", country: "South Africa", flag: "assets/flags/ZA.svg", photo: "assets/photos/johannesburg.jpg", capacity: "About 28,000", pitch: "Pace and bounce", known: "Nicknamed the Bullring. The ground sits high above sea level, so the ball carries through to the keeper." },
  { id: "cape-town", name: "Newlands", city: "Cape Town", country: "South Africa", flag: "assets/flags/ZA.svg", photo: "assets/photos/cape-town.jpg", capacity: "About 25,000", pitch: "True surface, early seam", known: "One of the most scenic grounds in world cricket, with Table Mountain rising behind the stands." },
  { id: "durban", name: "Kingsmead", city: "Durban", country: "South Africa", flag: "assets/flags/ZA.svg", photo: "assets/photos/durban.jpg", capacity: "About 25,000", pitch: "Swing in humid air", known: "A short walk from the Indian Ocean. Sea breezes and humidity help the ball swing." },
  { id: "harare", name: "Harare Sports Club", city: "Harare", country: "Zimbabwe", flag: "assets/flags/ZW.svg", photo: "assets/photos/harare.jpg", capacity: "About 10,000", pitch: "Good for batting", known: "A leafy, tree-lined ground in the heart of the city and Zimbabwe's main Test venue." },
  { id: "bulawayo", name: "Queens Sports Club", city: "Bulawayo", country: "Zimbabwe", flag: "assets/flags/ZW.svg", photo: "assets/photos/bulawayo.jpg", capacity: "About 13,000", pitch: "Slow and low", known: "Zimbabwe's second Test ground, in the country's second-largest city." },
  { id: "windhoek", name: "Wanderers Cricket Ground", city: "Windhoek", country: "Namibia", flag: "assets/flags/na.svg", photo: "assets/photos/windhoek.jpg", capacity: "Boutique ground", pitch: "Quick outfield at altitude", known: "The home of Namibian cricket, set in the capital's highlands. Hosts the Super Series." }
];

const LOADING_TIPS = [
  "Use the arrow keys or a controller to move around the menus.",
  "Press Esc or B to go back. On Home it opens the menu.",
  "Green pitches help seam bowlers. Dusty pitches help spinners.",
  "In CWC27, a win is worth 2 points and a tie or no result is worth 1.",
  "Points reset to zero at the start of every CWC27 stage.",
  "Spend training points in Story Mode to raise your skills.",
  "Check your career Inbox for messages from your coach and the selectors.",
  "Your saved kit appears on your Story Mode player card.",
  "The top three from each group, plus one wildcard, reach the Super 7.",
  "Overcast skies help the ball swing. Choose them in Quick Match."
];
const LOADING_PHOTOS = ["assets/photos/johannesburg.jpg", "assets/photos/cape-town.jpg", "assets/photos/matchday-1.jpg", "assets/photos/matchday-2.jpg", "assets/photos/durban.jpg"];

function storeGet(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
  catch (_) { return fallback; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Storage may be unavailable. */ }
}

/* ---------- Achievements ---------- */
const ACHIEVEMENTS = [
  { id: "first-steps", title: "First steps", copy: "Start the game." },
  { id: "nametag", title: "Name in lights", copy: "Set your nametag." },
  { id: "cwc-team", title: "Pick a side", copy: "Choose a CWC27 team." },
  { id: "scout", title: "Scout", copy: "Open a CWC27 team page." },
  { id: "career", title: "Debutant", copy: "Create your Story Mode player." },
  { id: "training", title: "Nets session", copy: "Spend a training point." },
  { id: "inbox", title: "Inbox zero", copy: "Read every career message." },
  { id: "toss", title: "Heads or tails", copy: "Take part in a coin toss." },
  { id: "quick-match", title: "Match ready", copy: "Set up a Quick Match." },
  { id: "kit", title: "Kitted out", copy: "Save a custom kit." },
  { id: "venues", title: "Ground tour", copy: "Visit every venue in the guide." },
  { id: "nav", title: "Pro controls", copy: "Move around with the keys or a controller." }
];
const ACHIEVEMENT_KEY = "world-cricket-champs-achievements";
const achievementQueue = [];
let achievementTimer = null;

function unlockedAchievements() { return storeGet(ACHIEVEMENT_KEY, {}); }

function unlockAchievement(id) {
  const unlocked = unlockedAchievements();
  const achievement = ACHIEVEMENTS.find((item) => item.id === id);
  if (!achievement || unlocked[id]) return;
  unlocked[id] = new Date().toISOString();
  storeSet(ACHIEVEMENT_KEY, unlocked);
  achievementQueue.push(achievement);
  if (!achievementTimer) showNextAchievement();
  refreshFeatureTiles();
  if (!document.querySelector("#trophyPage").hidden) renderTrophies();
}

function showNextAchievement() {
  const toastElement = document.querySelector("#achievementToast");
  const next = achievementQueue.shift();
  if (!next) { achievementTimer = null; toastElement.classList.remove("is-visible"); return; }
  document.querySelector("#achievementToastTitle").textContent = next.title;
  toastElement.hidden = false;
  requestAnimationFrame(() => toastElement.classList.add("is-visible"));
  achievementTimer = window.setTimeout(() => {
    toastElement.classList.remove("is-visible");
    achievementTimer = window.setTimeout(showNextAchievement, 260);
  }, 2600);
}

window.addEventListener("wcc:achievement", (event) => unlockAchievement(event.detail));

/* Wrap the shared save so career milestones unlock as they happen. */
const baseSaveCareer = saveCareer;
saveCareer = function saveCareerWithAchievements(career) {
  baseSaveCareer(career);
  if (career && career.player) unlockAchievement("career");
  if (career && Number.isInteger(career.trainingPoints) && career.trainingPoints < 6) unlockAchievement("training");
  if (career && Array.isArray(career.inboxRead) && career.inboxRead.length >= 4) unlockAchievement("inbox");
};

document.querySelector("#start").addEventListener("click", () => window.setTimeout(() => unlockAchievement("first-steps"), 1200));
nametagInput.addEventListener("change", () => { if (nametagInput.value.trim()) unlockAchievement("nametag"); });
document.querySelector("#quickMatchPage").addEventListener("click", (event) => {
  if (event.target.closest("[data-qm-call]")) window.setTimeout(() => unlockAchievement("toss"), 1200);
  if (event.target.closest("#qmNext")) window.setTimeout(() => { if (qm && qm.step === QM_STEPS.length - 1) unlockAchievement("quick-match"); }, 0);
});

/* ---------- Trophy page ---------- */
const trophyPage = document.querySelector("#trophyPage");

function renderTrophies() {
  const unlocked = unlockedAchievements();
  const filter = trophyPage.querySelector("input[name=achievementFilter]:checked").value;
  const count = ACHIEVEMENTS.filter((item) => unlocked[item.id]).length;
  document.querySelector("#achievementsProgressText").textContent = `${count} of ${ACHIEVEMENTS.length} unlocked`;
  document.querySelector("#achievementsProgressBar").style.width = `${Math.round((count / ACHIEVEMENTS.length) * 100)}%`;
  const items = ACHIEVEMENTS.filter((item) => filter === "all" || (filter === "unlocked" ? unlocked[item.id] : !unlocked[item.id]));
  document.querySelector("#achievementsGrid").innerHTML = items.length
    ? items.map((item) => {
      const date = unlocked[item.id] ? new Date(unlocked[item.id]).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
      return `<li class="achievement${date ? " is-unlocked" : ""}"><span class="achievement-icon" aria-hidden="true"></span><span class="achievement-copy"><b>${item.title}</b><span>${item.copy}</span></span><span class="achievement-status">${date ? `Unlocked ${date}` : "Locked"}</span></li>`;
    }).join("")
    : `<li class="achievements-empty">${filter === "unlocked" ? "Nothing unlocked yet. Start exploring the menus." : "Every achievement is unlocked."}</li>`;
}
trophyPage.addEventListener("change", (event) => { if (event.target.name === "achievementFilter") renderTrophies(); });

/* ---------- Kit locker ---------- */
const KIT_KEY = "world-cricket-champs-kit";
const KIT_COLOURS = [
  ["Navy", "#17335c"], ["Royal", "#1f5fbf"], ["Sky", "#4aa3df"], ["Green", "#15945e"], ["Emerald", "#0b6e4f"], ["Gold", "#d4ad52"],
  ["Orange", "#e8742a"], ["Maroon", "#7a1f2b"], ["Red", "#c62828"], ["Black", "#1b1b1b"], ["White", "#f4f4f4"]
];
const kitPage = document.querySelector("#kitPage");
const kitForm = document.querySelector("#kitForm");

function defaultKit() {
  const career = readCareer();
  return {
    primary: "#17335c",
    secondary: "#d4ad52",
    pattern: "plain",
    name: (career?.player.name || readStoredNametag() || "Player").split(" ").pop().toUpperCase().slice(0, 12),
    number: career?.player.number || 18
  };
}
function savedKit() { return storeGet(KIT_KEY, null); }

function textOn(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#102a43" : "#ffffff";
}

function shirtSvg(kit, view = "back", size = "large") {
  const id = `kit${Math.random().toString(36).slice(2, 8)}`;
  const ink = textOn(kit.primary);
  const body = "M70 20 L100 8 Q120 22 140 8 L170 20 L222 52 L200 100 L178 88 L178 232 Q120 244 62 232 L62 88 L40 100 L18 52 Z";
  const patterns = {
    plain: "",
    sash: `<path d="M40 40 L95 8 L230 200 L180 240 Z" fill="${kit.secondary}" opacity=".9"/>`,
    stripes: [80, 104, 128, 152].map((x) => `<rect x="${x}" y="0" width="10" height="250" fill="${kit.secondary}" opacity=".85"/>`).join(""),
    panels: `<rect x="62" y="80" width="18" height="170" fill="${kit.secondary}"/><rect x="160" y="80" width="18" height="170" fill="${kit.secondary}"/>`
  };
  const front = `<path d="M100 8 Q120 40 140 8" fill="none" stroke="${kit.secondary}" stroke-width="8" stroke-linejoin="round"/><text x="150" y="80" fill="${ink}" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="28" text-anchor="middle">${kit.number}</text><circle cx="92" cy="74" r="11" fill="none" stroke="${ink}" stroke-width="3" opacity=".8"/>`;
  const back = `<path d="M100 8 Q120 20 140 8" fill="none" stroke="${kit.secondary}" stroke-width="8"/><text x="120" y="78" fill="${ink}" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="24" letter-spacing="2" text-anchor="middle">${escapeHtml(kit.name || "")}</text><text x="120" y="182" fill="${ink}" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="96" text-anchor="middle">${kit.number}</text>`;
  const detail = size === "small" ? "" : (view === "front" ? front : back);
  return `<svg viewBox="0 0 240 250" role="img" aria-label="${view === "front" ? "Front" : "Back"} of shirt"><defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="240" height="250" fill="${kit.primary}"/>${patterns[kit.pattern] || ""}<path d="M18 52 L40 100 L62 88 L62 70 Z M222 52 L200 100 L178 88 L178 70 Z" fill="${kit.secondary}" opacity=".9"/></g><path d="${body}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2"/>${detail}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function kitFromForm() {
  return {
    primary: kitForm.querySelector("input[name=kitPrimary]:checked").value,
    secondary: kitForm.querySelector("input[name=kitSecondary]:checked").value,
    pattern: kitForm.querySelector("input[name=kitPattern]:checked").value,
    name: document.querySelector("#kitName").value.trim().toUpperCase().slice(0, 12),
    number: Number(document.querySelector("#kitNumber").value)
  };
}

function renderKitPreview() {
  const kit = kitFromForm();
  const view = kitPage.querySelector("input[name=kitView]:checked").value;
  const shown = { ...kit, number: Number.isInteger(kit.number) && kit.number >= 1 && kit.number <= 99 ? kit.number : "" };
  document.querySelector("#kitPreview").innerHTML = shirtSvg(shown, view);
}

function swatchMarkup(name, selected) {
  return KIT_COLOURS.map(([label, hex]) => `<label class="swatch" title="${label}"><input type="radio" name="${name}" value="${hex}" ${hex === selected ? "checked" : ""}><span style="--swatch:${hex}"></span><span class="visually-hidden">${label}</span></label>`).join("");
}

function loadKitIntoForm(kit) {
  document.querySelector("#kitPrimary").innerHTML = swatchMarkup("kitPrimary", kit.primary);
  document.querySelector("#kitSecondary").innerHTML = swatchMarkup("kitSecondary", kit.secondary);
  kitForm.querySelector(`input[name=kitPattern][value=${kit.pattern}]`).checked = true;
  document.querySelector("#kitName").value = kit.name;
  document.querySelector("#kitNumber").value = kit.number;
  document.querySelector("#kitNumberError").hidden = true;
  renderKitPreview();
}

kitPage.addEventListener("input", renderKitPreview);
kitPage.addEventListener("change", renderKitPreview);
document.querySelector("#kitNumber").addEventListener("input", () => { document.querySelector("#kitNumberError").hidden = true; });
document.querySelector("#kitReset").addEventListener("click", () => loadKitIntoForm(defaultKit()));
kitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const kit = kitFromForm();
  if (!Number.isInteger(kit.number) || kit.number < 1 || kit.number > 99) {
    document.querySelector("#kitNumberError").hidden = false;
    document.querySelector("#kitNumber").focus();
    return;
  }
  storeSet(KIT_KEY, kit);
  showToast("Kit saved. It now appears on your player card.");
  unlockAchievement("kit");
  refreshFeatureTiles();
});

/* Show the saved kit on the career player card. */
const baseOpenHub = openHub;
openHub = function openHubWithKit() {
  baseOpenHub();
  const kit = savedKit();
  const slot = document.querySelector("#hubCardKit");
  if (slot) slot.innerHTML = kit ? shirtSvg(kit, "front", "small") : "";
};

/* ---------- Profile: favourite team and member since ---------- */
const FAVOURITE_KEY = "world-cricket-champs-favourite-team";
const MEMBER_KEY = "world-cricket-champs-member-since";
const WELCOMED_KEY = "world-cricket-champs-welcomed";

function teamOptions(selected) {
  return `<option value="">No favourite</option>` + FEATURE_TEAMS.map((team) => `<option value="${team.code}" ${team.code === selected ? "selected" : ""}>${team.name}</option>`).join("");
}

function refreshProfileExtras() {
  const favourite = storeGet(FAVOURITE_KEY, "");
  document.querySelector("#favouriteTeamSelect").innerHTML = teamOptions(favourite);
  const since = storeGet(MEMBER_KEY, null);
  document.querySelector("#memberSince").textContent = since ? `Playing since ${new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.` : "";
}
document.querySelector("#favouriteTeamSelect").addEventListener("change", (event) => {
  storeSet(FAVOURITE_KEY, event.target.value);
  showToast(event.target.value ? "Favourite team saved." : "Favourite team cleared.");
});
if (!storeGet(MEMBER_KEY, null)) storeSet(MEMBER_KEY, new Date().toISOString());
refreshProfileExtras();

/* ---------- First-run welcome ---------- */
const welcomeDialog = document.querySelector("#welcomeDialog");

function maybeWelcome() {
  if (storeGet(WELCOMED_KEY, false) || readStoredNametag()) return;
  document.querySelector("#welcomeTeam").innerHTML = teamOptions(storeGet(FAVOURITE_KEY, ""));
  document.querySelector("#welcomeNameError").hidden = true;
  welcomeDialog.showModal();
  document.querySelector("#welcomeName").focus();
}

document.querySelector("#start").addEventListener("click", () => window.setTimeout(maybeWelcome, 1100));
document.querySelector("#welcomeName").addEventListener("input", () => { document.querySelector("#welcomeNameError").hidden = true; });
document.querySelector("#welcomeForm").addEventListener("submit", (event) => {
  const name = document.querySelector("#welcomeName").value.trim().slice(0, 20);
  if (!name) {
    event.preventDefault();
    document.querySelector("#welcomeNameError").hidden = false;
    document.querySelector("#welcomeName").focus();
    return;
  }
  nametagInput.value = name;
  updateNametag();
  unlockAchievement("nametag");
  storeSet(FAVOURITE_KEY, document.querySelector("#welcomeTeam").value);
  storeSet(WELCOMED_KEY, true);
  refreshProfileExtras();
});
document.querySelector("#welcomeSkip").addEventListener("click", () => {
  storeSet(WELCOMED_KEY, true);
  welcomeDialog.close();
});
welcomeDialog.addEventListener("cancel", () => storeSet(WELCOMED_KEY, true));

/* ---------- Pause menu ---------- */
const pauseDialog = document.querySelector("#pauseDialog");

function openPause() {
  if (pauseDialog.open || welcomeDialog.open) return;
  pauseDialog.showModal();
  pauseDialog.querySelector("[data-pause=resume]").focus();
}
document.querySelector("#homeMenuButton").addEventListener("click", openPause);
window.addEventListener("wcc:open-pause", () => {
  if (!document.querySelector("#splash").hidden) return;
  if (document.querySelector("#cwcApp").classList.contains("is-active")) return;
  if (!homeMenu.hidden) openPause();
});
pauseDialog.addEventListener("click", (event) => {
  if (event.target === pauseDialog) { pauseDialog.close(); return; }
  const item = event.target.closest("[data-pause]");
  if (!item) return;
  const action = item.dataset.pause;
  pauseDialog.close();
  if (action === "trophies") openFeaturePage("trophies");
  if (action === "kit") openFeaturePage("kit");
  if (action === "venues") openVenues("home");
  if (action === "profile") { showPage(profileSettingsPage, "Profile | World Cricket Champs"); nametagInput.focus(); }
  if (action === "title") window.location.href = window.location.pathname;
});
pauseDialog.addEventListener("close", () => {
  if (homeMenu.hidden) return;
  document.querySelector("#homeMenuButton").focus();
});

/* ---------- Venue guide ---------- */
const venuesPage = document.querySelector("#venuesPage");
const VISITED_KEY = "world-cricket-champs-venues-visited";
let venuesReturn = "home";

/* The game's own 3D ground leads the guide: a rendered still on the card,
   and a live view you can look around on its page. */
const ARENA = {
  name: "WCC Arena", city: "Home ground", tag: "3D stadium · Playable in Practice Nets",
  capacity: "58,000", tiers: "Two, under a full roof", lights: "Four towers",
  known: "The game's own ground, built for World Cricket Champs. Two packed tiers wrap the field, with an LED ribbon between them, a big screen behind the striker and the scoreboard at the far end. The crowd jumps up for every four and six."
};
let arenaView = null;
const venuePreview = () => import("./game/venue-preview.js?v=3");
function closeArenaView() { if (arenaView) { arenaView.destroy(); arenaView = null; } }

function arenaCard() {
  return `
    <button class="venue-card venue-card-arena" type="button" data-arena>
      <span class="venue-photo"><img id="arenaStill" alt="" hidden></span>
      <span class="venue-card-copy">
        <span class="venue-country">${ARENA.city}</span>
        <b>${ARENA.name}</b>
        <span class="venue-pitch">${ARENA.tag}</span>
      </span>
      <span class="venue-badge">3D</span>
    </button>`;
}

function loadArenaStill() {
  venuePreview().then((m) => m.stadiumStill()).then((url) => {
    const img = document.querySelector("#arenaStill");
    if (!img) return;
    img.src = url;
    img.hidden = false;
  }).catch(() => {});
}

function showArena() {
  closeArenaView();
  const detail = document.querySelector("#venueDetail");
  detail.innerHTML = `
    <div class="venue-hero venue-hero-3d">
      <div class="venue-3d" id="arenaView"></div>
      <div class="venue-hero-copy">
        <span class="venue-country">${ARENA.city}</span>
        <h2>${ARENA.name}</h2>
        <span class="venue-3d-hint">Drag to look around</span>
      </div>
    </div>
    <div class="venue-facts">
      <div><dt>Capacity</dt><dd>${ARENA.capacity}</dd></div>
      <div><dt>Stands</dt><dd>${ARENA.tiers}</dd></div>
      <div><dt>Floodlights</dt><dd>${ARENA.lights}</dd></div>
    </div>
    <p class="venue-known">${ARENA.known}</p>
    <div class="venue-actions">
      <button class="btn-back" type="button" data-venue-list><span class="btn-back-icon" aria-hidden="true"></span>All venues</button>
      <button class="cwc-primary venue-play" type="button" data-arena-nets>Play in the Nets <span aria-hidden="true">→</span></button>
    </div>`;
  document.querySelector("#venueGrid").hidden = true;
  detail.hidden = false;
  venuesPage.scrollTop = 0;
  detail.querySelector("[data-venue-list]").focus();
  venuePreview().then((m) => {
    const host = document.querySelector("#arenaView");
    if (host && !detail.hidden) arenaView = m.mountStadiumView(host);
  }).catch(() => {});
}

function renderVenueGrid() {
  const visited = storeGet(VISITED_KEY, []);
  document.querySelector("#venueGrid").innerHTML = arenaCard() + VENUES.map((venue) => `
    <button class="venue-card" type="button" data-venue="${venue.id}">
      <span class="venue-photo"><img src="${venue.photo}" alt="" loading="lazy"></span>
      <span class="venue-card-copy">
        <span class="venue-country"><img src="${venue.flag}" alt="">${venue.city}, ${venue.country}</span>
        <b>${venue.name}</b>
        <span class="venue-pitch">${venue.pitch}</span>
      </span>
      ${visited.includes(venue.id) ? '<span class="venue-visited">Visited</span>' : ""}
    </button>`).join("");
  loadArenaStill();
}

function showVenue(id) {
  const venue = VENUES.find((item) => item.id === id);
  if (!venue) return;
  closeArenaView();
  const visited = new Set(storeGet(VISITED_KEY, []));
  visited.add(id);
  storeSet(VISITED_KEY, [...visited]);
  if (visited.size >= VENUES.length) unlockAchievement("venues");
  const detail = document.querySelector("#venueDetail");
  detail.innerHTML = `
    <div class="venue-hero">
      <img src="${venue.photo}" alt="${venue.name} in ${venue.city}">
      <div class="venue-hero-copy">
        <span class="venue-country"><img src="${venue.flag}" alt="">${venue.city}, ${venue.country}</span>
        <h2>${venue.name}</h2>
      </div>
    </div>
    <div class="venue-facts">
      <div><dt>Capacity</dt><dd>${venue.capacity}</dd></div>
      <div><dt>Pitch</dt><dd>${venue.pitch}</dd></div>
      <div><dt>Host nation</dt><dd>${venue.country}</dd></div>
    </div>
    <p class="venue-known">${venue.known}</p>
    <div class="venue-actions">
      <button class="btn-back" type="button" data-venue-list><span class="btn-back-icon" aria-hidden="true"></span>All venues</button>
      <button class="cwc-primary venue-play" type="button" data-venue-play="${venue.id}">Play a Quick Match here <span aria-hidden="true">→</span></button>
    </div>`;
  document.querySelector("#venueGrid").hidden = true;
  detail.hidden = false;
  venuesPage.scrollTop = 0;
  detail.querySelector("[data-venue-list]").focus();
}

function showVenueList(focusId) {
  closeArenaView();
  document.querySelector("#venueDetail").hidden = true;
  renderVenueGrid();
  document.querySelector("#venueGrid").hidden = false;
  const card = focusId && document.querySelector(`[data-venue="${focusId}"]`);
  if (card) card.focus();
}

function openVenues(from, venueId) {
  venuesReturn = from;
  if (from === "cwc" && window.CWC27) window.CWC27.close();
  document.querySelector("#venuesBackLabel").textContent = from === "cwc" ? "CWC27" : from === "quick-match" ? "Quick Match" : "Home";
  showPage(venuesPage, "Venue guide | World Cricket Champs");
  if (venueId) showVenue(venueId);
  else { showVenueList(); document.querySelector("#backFromVenues").focus(); }
}

venuesPage.addEventListener("click", (event) => {
  if (event.target.closest("[data-arena]")) { showArena(); return; }
  if (event.target.closest("[data-arena-nets]")) {
    closeArenaView();
    showPage(document.querySelector("#netsPage"), "Practice Nets | World Cricket Champs");
    document.querySelector("#netsPage [data-back-home]").focus();
    return;
  }
  const card = event.target.closest("[data-venue]");
  if (card) { showVenue(card.dataset.venue); return; }
  const list = event.target.closest("[data-venue-list]");
  if (list) { showVenueList(document.querySelector("[data-venue-play]")?.dataset.venuePlay); return; }
  const play = event.target.closest("[data-venue-play]");
  if (play) {
    openQuickMatch();
    document.querySelector("#qmVenue").value = play.dataset.venuePlay;
    renderQmVenuePreview();
  }
});

document.querySelector("#backFromVenues").addEventListener("click", () => {
  if (!document.querySelector("#venueDetail").hidden && venuesReturn !== "quick-match") { showVenueList(document.querySelector("[data-venue-play]")?.dataset.venuePlay); return; }
  closeArenaView();
  if (venuesReturn === "cwc") { window.CWC27.open(); return; }
  if (venuesReturn === "quick-match") { showPage(quickMatchPage, "Quick Match | World Cricket Champs"); renderQmStep(); return; }
  showPage(homeMenu, "Home | World Cricket Champs");
  document.querySelector("#homeMenuButton").focus();
});
window.addEventListener("wcc:open-venues", (event) => openVenues(event.detail?.from || "home"));

/* Quick Match venue preview */
function renderQmVenuePreview() {
  const venue = VENUES.find((item) => item.id === document.querySelector("#qmVenue").value) || VENUES[0];
  document.querySelector("#qmVenuePreview").innerHTML = `<img src="${venue.photo}" alt=""><span class="qm-venue-copy"><b>${venue.name}</b><span>${venue.city}, ${venue.country} · ${venue.pitch}</span></span><button class="text-link" type="button" data-qm-venue-guide="${venue.id}">Venue guide</button>`;
}
document.querySelector("#qmVenue").addEventListener("change", renderQmVenuePreview);
document.querySelector("#qmVenuePreview").addEventListener("click", (event) => {
  const link = event.target.closest("[data-qm-venue-guide]");
  if (link) openVenues("quick-match", link.dataset.qmVenueGuide);
});
renderQmVenuePreview();

/* ---------- Practice nets ---------- */
const PLAYABLE_DRILLS = { pace: "pace", spin: "spin" };
/* Bowler actions per drill (ids match game/ball.js ACTIONS). */
const DRILL_ACTIONS = {
  pace: [["auto", "Auto"], ["fast", "Fast"], ["medium", "Medium-fast"]],
  spin: [["auto", "Auto"], ["off", "Off-spin"], ["leg", "Leg-spin"]]
};
const ACTION_KEY = "world-cricket-champs-nets-actions";
function actionPicker(drillId) {
  const options = DRILL_ACTIONS[drillId];
  if (!options) return "";
  const saved = storeGet(ACTION_KEY, {})[drillId] || "auto";
  return `
        <fieldset class="choice-group drill-action">
          <legend>Bowler action</legend>
          <div class="segmented">
            ${options.map(([id, label]) => `<label><input type="radio" name="action-${drillId}" value="${id}"${id === saved ? " checked" : ""}><span>${label}</span></label>`).join("")}
          </div>
        </fieldset>`;
}
function chosenAction(drillId) {
  const input = document.querySelector(`input[name="action-${drillId}"]:checked`);
  return input ? input.value : "auto";
}
const DRILLS = [
  { id: "pace", title: "Facing pace", skill: "Batting", copy: "Leave, defend and punish short balls from a fast bowler.", photo: "assets/photos/nets.jpg", position: "30% 60%" },
  { id: "spin", title: "Facing spin", skill: "Batting", copy: "Use your feet and play with the turn on a dusty surface.", photo: "assets/photos/nets.jpg", position: "70% 55%" },
  { id: "death", title: "Death bowling", skill: "Bowling", copy: "Hit the blockhole with yorkers in the final overs.", photo: "assets/photos/matchday-1.jpg", position: "center" },
  { id: "catching", title: "Catching practice", skill: "Fielding", copy: "High balls, slip catches and sharp reactions.", photo: "assets/photos/matchday-2.jpg", position: "center" }
];
function renderDrills() {
  document.querySelector("#drillGrid").innerHTML = DRILLS.map((drill) => `
    <article class="drill-card">
      <span class="drill-photo"><img src="${drill.photo}" alt="" loading="lazy" style="object-position:${drill.position}"></span>
      <div class="drill-copy">
        <span class="hub-tile-kicker">${drill.skill}</span>
        <h2>${drill.title}</h2>
        <p>${drill.copy}</p>${actionPicker(drill.id)}
        <button class="cwc-primary" type="button" data-drill="${drill.title}" data-drill-id="${drill.id}">${PLAYABLE_DRILLS[drill.id] ? "Play drill" : "Coming soon"} <span aria-hidden="true">→</span></button>
      </div>
    </article>`).join("");
}
let netsModule = null;
async function launchDrill(drillId, level, button) {
  const favourite = FEATURE_TEAMS.find((team) => team.code === storeGet(FAVOURITE_KEY, ""));
  button.disabled = true;
  try {
    netsModule = netsModule || await import("./game/nets.js?v=21");
    netsModule.startNets({
      drill: drillId,
      level,
      action: chosenAction(drillId),
      batterKit: favourite ? favourite.code : "IND",
      onExit() {
        showPage(document.querySelector("#netsPage"), "Practice Nets | World Cricket Champs");
        const again = document.querySelector(`[data-drill-id="${drillId}"]`);
        if (again) again.focus();
      }
    });
  } catch (error) {
    console.error(error);
    showToast("The 3D nets couldn't start on this device.");
  } finally {
    button.disabled = false;
  }
}
/* ---------- Player movement lab ---------- */
let lab = null, labLoading = false;
const labEl = (id) => document.querySelector("#" + id);
function renderLabMoves() {
  if (!lab) return;
  const player = document.querySelector("input[name=labPlayer]:checked").value;
  labEl("labMoves").innerHTML = lab.moves[player].map((move, i) =>
    `<label class="lab-move"><input type="radio" name="labMove" value="${move.id}"${i === (player === "batter" ? 0 : 1) ? " checked" : ""}><span>${move.label}</span></label>`).join("");
}
async function openLab() {
  if (lab || labLoading) return;
  labLoading = true;
  const button = labEl("labOpen");
  button.disabled = true;
  button.firstChild.textContent = "Loading players… ";
  try {
    const module = await import("./game/movement-lab.js?v=3");
    const favourite = FEATURE_TEAMS.find((team) => team.code === storeGet(FAVOURITE_KEY, ""));
    lab = await module.startLab(labEl("labStage"), { kit: favourite ? favourite.code : "IND" });
    button.hidden = true;
    labEl("labControls").hidden = false;
    labEl("labPhase").hidden = false;
    renderLabMoves();
    lab.onTick(({ t, duration, phase, playing }) => {
      labEl("labPhase").textContent = phase;
      labEl("labTime").textContent = t.toFixed(2) + " s";
      if (document.activeElement !== labEl("labScrub")) labEl("labScrub").value = String(Math.round((t / duration) * 1000));
      labEl("labPlay").textContent = playing ? "Pause" : "Play";
    });
  } catch (error) {
    console.error(error);
    showToast("The movement lab couldn't start on this device.");
    button.disabled = false;
    button.firstChild.textContent = "Open movement lab ";
  } finally {
    labLoading = false;
  }
}
labEl("labOpen").addEventListener("click", openLab);
labEl("labControls").addEventListener("change", (event) => {
  if (!lab) return;
  const input = event.target;
  if (input.name === "labPlayer") { lab.setPlayer(input.value); renderLabMoves(); }
  if (input.name === "labMove") lab.setMove(input.value);
  if (input.name === "labSpeed") lab.setSpeed(Number(input.value));
  if (input.name === "labView") lab.setView(input.value);
});
labEl("labPlay").addEventListener("click", () => {
  if (!lab) return;
  if (labEl("labPlay").textContent === "Pause") lab.pause(); else lab.play();
});
labEl("labBack").addEventListener("click", () => lab && lab.step(-1));
labEl("labFwd").addEventListener("click", () => lab && lab.step(1));
labEl("labScrub").addEventListener("input", (event) => {
  if (!lab) return;
  lab.pause();
  const max = Number(event.target.max);
  lab.seek((Number(event.target.value) / max) * lab.duration());
});

document.querySelector("#drillGrid").addEventListener("change", (event) => {
  const input = event.target.closest("input[name^='action-']");
  if (!input) return;
  const saved = storeGet(ACTION_KEY, {});
  saved[input.name.slice(7)] = input.value;
  storeSet(ACTION_KEY, saved);
});
document.querySelector("#drillGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-drill]");
  if (!button) return;
  const level = document.querySelector("input[name=netsDifficulty]:checked").value;
  const playable = PLAYABLE_DRILLS[button.dataset.drillId];
  if (playable) { launchDrill(playable, level, button); return; }
  showToast(`${button.dataset.drill} (${level}) is coming soon.`);
});
renderDrills();

/* ---------- Loading screens ---------- */
const loadingScreen = document.querySelector("#loadingScreen");
const LOADING_SEEN_KEY = "world-cricket-champs-loading-seen";

function showLoading(label) {
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem(LOADING_SEEN_KEY) || "[]"); } catch (_) { seen = []; }
  if (seen.includes(label)) return;
  seen.push(label);
  try { sessionStorage.setItem(LOADING_SEEN_KEY, JSON.stringify(seen)); } catch (_) { /* Session storage may be unavailable. */ }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("#loadingPhoto").src = LOADING_PHOTOS[Math.floor(Math.random() * LOADING_PHOTOS.length)];
  document.querySelector("#loadingLabel").textContent = label;
  document.querySelector("#loadingTip").textContent = `Tip: ${LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]}`;
  loadingScreen.hidden = false;
  loadingScreen.classList.remove("is-leaving");
  window.setTimeout(() => {
    loadingScreen.classList.add("is-leaving");
    window.setTimeout(() => { loadingScreen.hidden = true; loadingScreen.classList.remove("is-leaving"); }, 260);
  }, reduced ? 350 : 1100);
}

const LOADING_LABELS = { "CWC27": "CWC27", "Career": "Career", "Quick Match": "Quick Match", "Practice Nets": "Practice Nets" };
document.querySelector("#homeMenu").addEventListener("click", (event) => {
  const tile = event.target.closest("[data-mode]");
  if (tile && LOADING_LABELS[tile.dataset.mode]) showLoading(LOADING_LABELS[tile.dataset.mode]);
}, true);

/* ---------- Opening the new pages ---------- */
function openFeaturePage(which) {
  if (which === "trophies") {
    renderTrophies();
    showPage(trophyPage, "Trophies | World Cricket Champs");
    trophyPage.querySelector("[data-back-home]").focus();
  }
  if (which === "kit") {
    loadKitIntoForm(savedKit() || defaultKit());
    showPage(kitPage, "Kit locker | World Cricket Champs");
    kitPage.querySelector("[data-back-home]").focus();
  }
  if (which === "nets") {
    showPage(document.querySelector("#netsPage"), "Practice Nets | World Cricket Champs");
    document.querySelector("#netsPage [data-back-home]").focus();
  }
}

window.openFeature = function openFeature(mode) {
  if (mode === "Trophy & Achievements") { openFeaturePage("trophies"); return true; }
  if (mode === "Store / Kit Locker") { openFeaturePage("kit"); return true; }
  if (mode === "Practice Nets") { openFeaturePage("nets"); return true; }
  return false;
};

const FEATURE_TILE_FOR_PAGE = { trophyPage: ".trophy-tile", kitPage: ".kit-tile", netsPage: ".nets-tile" };
document.querySelectorAll("[data-back-home]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.closest("section[id]");
    showPage(homeMenu, "Home | World Cricket Champs");
    const tile = document.querySelector(FEATURE_TILE_FOR_PAGE[page.id] || ".mode");
    if (tile) tile.focus();
  });
});

/* ---------- Home tile details ---------- */
function refreshFeatureTiles() {
  const unlocked = unlockedAchievements();
  const count = ACHIEVEMENTS.filter((item) => unlocked[item.id]).length;
  document.querySelector("#homeTrophyMeta").textContent = `${count} of ${ACHIEVEMENTS.length} achievements`;
  document.querySelector("#homeKitShirt").innerHTML = shirtSvg(savedKit() || defaultKit(), "front", "small");
}
const baseRefreshHome = refreshHome;
refreshHome = function refreshHomeWithFeatures() {
  baseRefreshHome();
  refreshFeatureTiles();
};
refreshFeatureTiles();

/* ---------- Landscape play on phones ---------- */
const rotateFullscreen = document.querySelector("#rotateFullscreen");
const canLockOrientation = Boolean(screen.orientation && screen.orientation.lock && document.documentElement.requestFullscreen);
if (!canLockOrientation) rotateFullscreen.hidden = true;
rotateFullscreen.addEventListener("click", async () => {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await screen.orientation.lock("landscape");
  } catch (_) {
    showToast("Turn your phone sideways to play.");
  }
});
