/* ==========================================================================
   Pro layout behaviour: Home hub tabs and tiles, Career sub-tabs and header
   strip, shoulder-button navigation per screen, tour targets, corner logo.
   Only does anything while html[data-skin="pro"]; Classic is untouched.
   Remove this file's <script> tag together with pro.css to drop Pro.
   ========================================================================== */

const isPro = () => document.documentElement.dataset.skin === "pro";
const proHub = document.querySelector(".pro-hub");
const PRO_TABS = ["home", "play", "customise"];
let proTab = "home";

/* ---------- Hub tabs ---------- */
function switchProTab(name, options = {}) {
  if (!PRO_TABS.includes(name)) return;
  const direction = PRO_TABS.indexOf(name) >= PRO_TABS.indexOf(proTab) ? "forward" : "back";
  proTab = name;
  proHub.querySelectorAll("[data-pro-tab]").forEach((tab) => {
    const active = tab.dataset.proTab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  proHub.querySelectorAll("[data-pro-panel]").forEach((panel) => {
    const active = panel.dataset.proPanel === name;
    panel.hidden = !active;
    if (active && options.animate !== false) animateIn(panel, direction);
  });
  proHub.querySelectorAll("[data-pro-dot]").forEach((dot) => dot.classList.toggle("is-current", dot.dataset.proDot === name));
  proHub.querySelectorAll("[data-pro-art]").forEach((art) => art.classList.toggle("is-current", art.dataset.proArt === name));
  try { sessionStorage.setItem("world-cricket-champs-pro-tab", name); } catch (_) { /* ignore */ }
  if (options.focusTile) {
    const first = proHub.querySelector(`[data-pro-panel="${name}"] .pro-tile`);
    if (first) first.focus();
  }
}
proHub.querySelectorAll("[data-pro-tab]").forEach((tab) => tab.addEventListener("click", () => {
  WCCSound.play("tab");
  switchProTab(tab.dataset.proTab, { focusTile: document.documentElement.classList.contains("nav-focus") });
}));

/* ---------- Tile actions ---------- */
const PRO_ACTIONS = {
  "quick-match": () => { showLoading("Quick Match"); openQuickMatch(); },
  "cwc27": () => { showLoading("CWC27"); window.CWC27.open(); },
  "career": () => { showLoading("Career"); if (readCareer()) openHub(); else showPage(careerModesPage, "Career | World Cricket Champs"); },
  "news": () => document.querySelector("#shellBell").click(),
  "nets": () => { showLoading("Practice Nets"); openFeaturePage("nets"); },
  "venues": () => openVenues("home"),
  "settings": () => openSettings("audio"),
  "audio": () => openSettings("audio"),
  "controls": () => openSettings("controls"),
  "saves": () => openSettings("saves"),
  "profile": () => document.querySelector("#shellProfile").click(),
  "kit": () => openFeaturePage("kit"),
  "trophies": () => openFeaturePage("trophies"),
  "tour": () => startTour()
};
proHub.addEventListener("click", (event) => {
  const tile = event.target.closest("[data-pro-go]");
  if (!tile) return;
  const action = PRO_ACTIONS[tile.dataset.proGo];
  if (action) action();
});

/* ---------- Live tile content ---------- */
const PRO_NEWS = [
  ["CWC27 starts 2 October", "Hosted by South Africa, Zimbabwe and Namibia."],
  ["57 matches, four stages", "Super Series, Groups, Super 7 and the knockouts."],
  ["Wildcard race", "The better fourth-placed group team reaches the Super 7."],
  ["Points reset every stage", "Win 2 points. Tie or no result 1 point."],
  ["Six host venues", "From the Wanderers to Windhoek. Open the venue guide."]
];
let proNewsIndex = 0;

function flagTag(src, alt = "") { return src ? `<img src="${src}" alt="${alt}">` : `<span class="pro-flag-empty">?</span>`; }

function renderProHub() {
  if (!proHub) return;
  /* Quick Match: favourite or CWC27 team against a sensible opponent */
  const favourite = FEATURE_TEAMS.find((team) => team.code === storeGet(FAVOURITE_KEY, ""));
  const cwcTeam = window.CWC27.savedTeam();
  const homeTeam = favourite || FEATURE_TEAMS.find((team) => cwcTeam && team.name === cwcTeam.name) || FEATURE_TEAMS[0];
  const awayTeam = FEATURE_TEAMS.find((team) => team.code !== homeTeam.code && team.code === (homeTeam.code === "AUS" ? "ENG" : "AUS")) || FEATURE_TEAMS[1];
  document.querySelector("#proQmHomeFlag").innerHTML = flagTag(homeTeam.flag);
  document.querySelector("#proQmAwayFlag").innerHTML = flagTag(awayTeam.flag);
  document.querySelector("#proQmCaption").textContent = `${homeTeam.name} vs ${awayTeam.name}`;

  /* CWC27: next fixture for the saved team */
  const info = window.CWC27.nextFixtureInfo ? window.CWC27.nextFixtureInfo() : null;
  document.querySelector("#proCwcLabel").textContent = info ? "Continue" : "New tournament";
  document.querySelector("#proCwcFlag").innerHTML = info ? `${flagTag(info.team.flag)}${info.opponent ? `<span class="pro-vs">vs</span>${flagTag(info.opponent.flag)}` : ""}` : `<img class="pro-cwc-logo" src="gallary/1.png" alt="">`;
  document.querySelector("#proCwcNext").textContent = info && info.opponent ? `${info.team.name} vs ${info.opponent.name}` : info ? info.team.name : "Pick your team";
  document.querySelector("#proCwcStage").textContent = info && info.opponent ? `${info.stage} · Round ${info.round}` : "2 Oct – 21 Nov 2027";

  /* Story Mode */
  const career = readCareer();
  if (career) {
    document.querySelector("#proStoryBody").textContent = `${career.player.name} · ${career.country.teamName} · OVR ${overallFor(careerSkills(career))}`;
    const unread = inboxFor(career).filter((message) => !(career.inboxRead || []).includes(message.id)).length;
    document.querySelector("#proStoryMeta").textContent = unread ? `Next: Domestic debut · ${unread} new messages` : "Next: Domestic debut";
  } else {
    document.querySelector("#proStoryBody").textContent = "Create your player and play for your country.";
    document.querySelector("#proStoryMeta").textContent = "Season 1";
  }
  renderProNews();
}

function renderProNews() {
  const [title, body] = PRO_NEWS[proNewsIndex % PRO_NEWS.length];
  document.querySelector("#proNewsTitle").textContent = title;
  document.querySelector("#proNewsBody").textContent = body;
}
window.setInterval(() => {
  if (!isPro() || homeMenu.hidden || document.hidden) return;
  proNewsIndex += 1;
  const tile = document.querySelector(".pro-tile-news .pro-tile-copy");
  if (tile && !motionReduced()) { tile.classList.remove("is-swapping"); void tile.offsetWidth; tile.classList.add("is-swapping"); }
  renderProNews();
}, 6000);

const baseRefreshHomePro = refreshHome;
refreshHome = function refreshHomeWithPro() { baseRefreshHomePro(); renderProHub(); };

/* ---------- Career sub-tabs and header strip ---------- */
const CAREER_TABS = [
  ["central", "Central", "#careerHubPage"],
  ["schedule", "Schedule", "#careerSchedulePage"],
  ["training", "Training", "#careerTrainingPage"],
  ["inbox", "Inbox", "#careerInboxPage"],
  ["stats", "Stats", "#careerStatsPage"]
];
CAREER_TABS.forEach(([, , selector]) => {
  const page = document.querySelector(selector);
  const header = page && page.querySelector(".page-header");
  if (!header) return;
  const meta = document.createElement("div");
  meta.className = "pro-strip-meta";
  meta.setAttribute("aria-hidden", "true");
  header.append(meta);
  const nav = document.createElement("nav");
  nav.className = "pro-subtabs";
  nav.setAttribute("aria-label", "Career sections");
  nav.innerHTML = CAREER_TABS.map(([key, label]) => `<button type="button" data-career-tab="${key}">${label}</button>`).join("");
  header.after(nav);
});
document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-career-tab]");
  if (!tab) return;
  goCareerTab(tab.dataset.careerTab);
});
function goCareerTab(key) {
  if (key === "central") { openHub(); return; }
  const link = document.querySelector(`[data-career-page="${key}"]`);
  if (link) link.click();
}
function currentCareerTab() {
  const found = CAREER_TABS.find(([, , selector]) => { const page = document.querySelector(selector); return page && !page.hidden; });
  return found ? found[0] : null;
}
function refreshCareerChrome() {
  const career = readCareer();
  const current = currentCareerTab();
  document.querySelectorAll(".pro-subtabs [data-career-tab]").forEach((button) => {
    if (button.dataset.careerTab === current) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (!career) return;
  const overall = overallFor(careerSkills(career));
  document.querySelectorAll(".pro-strip-meta").forEach((meta) => {
    meta.innerHTML = `${flagTag(career.country.flag)}<span><b>${escapeHtml(career.player.name)}</b>${escapeHtml(career.country.teamName)} · ${escapeHtml(career.player.role)}</span><span class="pro-strip-rating"><b>${overall}</b>OVR</span>`;
  });
}

/* ---------- Page changes ---------- */
const baseShowPagePro = showPage;
showPage = function showPageWithPro(page, title) {
  baseShowPagePro(page, title);
  refreshCareerChrome();
  if (page === homeMenu) renderProHub();
};

/* ---------- Shoulder buttons / Q and E per screen ---------- */
const baseStepTab = stepTab;
stepTab = function stepTabPro(delta) {
  if (!isPro()) { baseStepTab(delta); return; }
  if (!document.querySelector("#splash").hidden || document.querySelector("dialog[open]") || !document.querySelector("#coach").hidden || !document.querySelector("#versusScreen").hidden) return;
  WCCSound.play("tab");
  if (document.querySelector("#cwcApp").classList.contains("is-active")) {
    const links = [...document.querySelectorAll("[data-stage-link]")];
    const index = Math.max(0, links.findIndex((link) => link.classList.contains("is-current")));
    links[(index + delta + links.length) % links.length].click();
    return;
  }
  if (!homeMenu.hidden) {
    const index = PRO_TABS.indexOf(proTab);
    switchProTab(PRO_TABS[(index + delta + PRO_TABS.length) % PRO_TABS.length], { focusTile: document.documentElement.classList.contains("nav-focus") });
    return;
  }
  const career = currentCareerTab();
  if (career) {
    const index = CAREER_TABS.findIndex(([key]) => key === career);
    goCareerTab(CAREER_TABS[(index + delta + CAREER_TABS.length) % CAREER_TABS.length][0]);
  }
};

/* ---------- Tour targets follow the layout ---------- */
const CLASSIC_TOUR = TOUR.map((step) => ({ ...step }));
const PRO_TOUR = [
  { target: ".pro-tabs", title: "Switch sections", copy: "Home, Play and Customise swap the tiles below. Press Q and E, or LB and RB on a controller." },
  { target: ".pro-grid-home .pro-tile-cwc", title: "Pick up where you left off", copy: "Tiles show what's next, like your next CWC27 match and your career." },
  { target: "#shellProfile", title: "Your profile", copy: "Your badge, title and level. Unlock achievements to level up." },
  { target: "#shellBell", title: "Notifications", copy: "Achievements, career messages and next steps collect here." }
];
function syncTour() {
  const steps = isPro() ? PRO_TOUR : CLASSIC_TOUR;
  TOUR.splice(0, TOUR.length, ...steps.map((step) => ({ ...step })));
}

/* ---------- Corner logo ---------- */
const proLogo = document.createElement("div");
proLogo.className = "pro-logo";
proLogo.setAttribute("aria-hidden", "true");
proLogo.innerHTML = "<span>World Cricket</span><b>Champs</b>";
document.body.append(proLogo);

/* ---------- Start ---------- */
function applyPro() {
  syncTour();
  if (isPro()) {
    let saved = "home";
    try { saved = sessionStorage.getItem("world-cricket-champs-pro-tab") || "home"; } catch (_) { /* ignore */ }
    switchProTab(saved, { animate: false });
    renderProHub();
    refreshCareerChrome();
  }
}
new MutationObserver(applyPro).observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] });
applyPro();
