/* ==========================================================================
   Match-day presentation: versus screen and team sheets (Quick Match).
   Squads are fictional and generated from the team code, so they are the
   same every time. Uses helpers from index.html, features.js and shell.js.
   ========================================================================== */

const versusScreen = document.querySelector("#versusScreen");
const teamSheetPage = document.querySelector("#teamSheetPage");
const LINEUP_KEY = "world-cricket-champs-lineups";

const NAME_POOLS = {
  south: {
    first: ["Arjun", "Rohan", "Vikram", "Imran", "Kamal", "Farhan", "Sahil", "Nadeem", "Tariq", "Dinesh", "Asif", "Rahim", "Kasun", "Nuwan", "Zubair", "Harsh", "Omar", "Irfan", "Mahesh", "Sajid", "Yasir", "Rafiq", "Aman", "Bilal"],
    last: ["Rao", "Mehta", "Qureshi", "Perera", "Hossain", "Malik", "Fernando", "Iqbal", "Joshi", "Siddiqui", "Silva", "Rahman", "Patil", "Karim", "Chaudhry", "Nair", "Ahmadi", "Dissanayake", "Saleem", "Bhatt", "Hamidi", "Sarkar", "Gill", "Jayasena"]
  },
  west: {
    first: ["Jack", "Oliver", "Liam", "Ben", "Sam", "Tom", "Ryan", "Josh", "Lachlan", "Callum", "Pieter", "Tendai", "Blessing", "Sipho", "Ethan", "Harry", "Noah", "Kieran", "Riaan", "Tinashe", "Declan", "Morne", "Archie", "Luke"],
    last: ["Walker", "Bennett", "Hughes", "Turner", "Fraser", "Reid", "Morgan", "Pretorius", "Nel", "Moyo", "Dube", "Carter", "Hayes", "Brooks", "Lawson", "Botha", "Ncube", "Ellis", "Sinclair", "Doyle", "Marais", "Chikwanha", "Hartley", "Quinn"]
  }
};
const SOUTH_TEAMS = new Set(["IND", "PAK", "SL", "BAN", "AFG"]);
const ROLE_TEMPLATE = [
  ["Opening batter", "bat"], ["Opening batter", "bat"], ["Top-order batter", "bat"], ["Middle-order batter", "bat"],
  ["Wicketkeeper batter", "keeper"], ["All-rounder", "all"], ["All-rounder", "all"],
  ["Spin bowler", "bowl"], ["Pace bowler", "bowl"], ["Pace bowler", "bowl"], ["Pace bowler", "bowl"]
];

function seededRandom(seedText) {
  let seed = 0;
  for (const char of seedText) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function squadFor(code) {
  const random = seededRandom(`wcc-${code}`);
  const pool = SOUTH_TEAMS.has(code) ? NAME_POOLS.south : NAME_POOLS.west;
  const usedFirst = new Set();
  const usedLast = new Set();
  const pick = (list, used) => {
    let name;
    do { name = list[Math.floor(random() * list.length)]; } while (used.has(name));
    used.add(name);
    return name;
  };
  return ROLE_TEMPLATE.map(([role, kind], index) => ({
    id: `${code}-${index}`,
    name: `${pick(pool.first, usedFirst)} ${pick(pool.last, usedLast)}`,
    role,
    kind,
    rating: 64 + Math.floor(random() * 24)
  }));
}

function lineupFor(code) {
  const squad = squadFor(code);
  const saved = storeGet(LINEUP_KEY, {})[code];
  const order = saved && Array.isArray(saved.order) && saved.order.length === squad.length ? saved.order : squad.map((player) => player.id);
  const byId = new Map(squad.map((player) => [player.id, player]));
  return {
    players: order.map((id) => byId.get(id)).filter(Boolean),
    captain: saved?.captain || squad[2].id,
    keeper: saved?.keeper || squad[4].id
  };
}

function saveLineup(code, lineup) {
  const all = storeGet(LINEUP_KEY, {});
  all[code] = { order: lineup.players.map((player) => player.id), captain: lineup.captain, keeper: lineup.keeper };
  storeSet(LINEUP_KEY, all);
}

/* ---------- Versus screen ---------- */
let versusReturnFocus = null;

function openVersus() {
  const home = qmTeam(qm.home);
  const away = qmTeam(qm.away);
  if (!home || !away) return;
  const venue = VENUES.find((item) => item.id === document.querySelector("#qmVenue").value) || VENUES[0];
  const format = qmValue("qmFormat");
  document.querySelector("#versusPhoto").src = venue.photo;
  document.querySelector("#versusHomeFlag").innerHTML = flagImg(home.flag);
  document.querySelector("#versusAwayFlag").innerHTML = flagImg(away.flag);
  document.querySelector("#versusHomeName").textContent = home.name;
  document.querySelector("#versusAwayName").textContent = away.name;
  document.querySelector("#versusFormat").textContent = `${format} · ${venue.name}`;
  document.querySelector("#versusDetails").textContent = `${venue.city} · ${qmValue("qmPitch")} pitch · ${qmValue("qmWeather")} · ${qmValue("qmTime")} · ${qmValue("qmDifficulty")}`;
  document.querySelector("#versusToss").textContent = qm.toss ? qm.toss.summary : "";
  versusReturnFocus = document.activeElement;
  versusScreen.hidden = false;
  versusScreen.classList.remove("is-entering");
  void versusScreen.offsetWidth;
  versusScreen.classList.add("is-entering");
  if (window.WCCSound) window.WCCSound.play("unlock");
  document.querySelector("#versusStart").focus();
}

function closeVersus() {
  versusScreen.hidden = true;
  if (versusReturnFocus && document.contains(versusReturnFocus)) versusReturnFocus.focus();
}

/* "Start match" on the last setup step opens the versus screen. */
document.addEventListener("click", (event) => {
  if (!event.target.closest("#qmNext")) return;
  if (!qm || qm.step !== QM_STEPS.length - 1) return;
  event.stopPropagation();
  event.preventDefault();
  openVersus();
}, true);

document.querySelector("#versusBack").addEventListener("click", closeVersus);
document.querySelector("#versusStart").addEventListener("click", () => {
  showToast("The match engine is coming soon. Your match is set up and ready.");
});
document.querySelector("#versusSheets").addEventListener("click", () => {
  versusScreen.hidden = true;
  openTeamSheets();
});

/* ---------- Team sheets ---------- */
const ROLE_ICONS = {
  bat: '<path d="M14.5 3.5l6 6-9 9-4 1 1-4z"/><path d="M5 17l2 2-2.5 2.5-2-2z"/>',
  bowl: '<circle cx="12" cy="12" r="7"/><path d="M8.5 6.5c2 3 2 8 0 11M15.5 6.5c-2 3-2 8 0 11" stroke-dasharray="1.5 2"/>',
  all: '<path d="M13 4l6 6-7 7-3 .8.8-3z"/><circle cx="7" cy="17" r="3.2"/>',
  keeper: '<path d="M7 21V9a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v4a2 2 0 0 1 4 0v7a5 5 0 0 1-5 5z"/>'
};
function roleIcon(kind) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ROLE_ICONS[kind]}</svg>`;
}

function renderSheet(container, code, editable) {
  const team = qmTeam(code);
  const lineup = lineupFor(code);
  const average = Math.round(lineup.players.reduce((sum, player) => sum + player.rating, 0) / lineup.players.length);
  container.innerHTML = `
    <header class="sheet-header">
      <span class="sheet-flag" aria-hidden="true">${flagImg(team.flag)}</span>
      <div><h2>${team.name}</h2><span>${editable ? "Your team" : "Opponent"} · Team rating ${average}</span></div>
    </header>
    <ol class="sheet-list" data-sheet="${code}" ${editable ? 'aria-label="Batting order, drag to reorder"' : ""}>
      ${lineup.players.map((player, index) => `
        <li class="sheet-row" data-player="${player.id}" ${editable ? 'draggable="true"' : ""}>
          <span class="sheet-order">${index + 1}</span>
          <span class="sheet-role" title="${player.role}">${roleIcon(player.kind)}</span>
          <span class="sheet-name"><b>${player.name}</b><span>${player.role}</span></span>
          <span class="sheet-tags">${player.id === lineup.captain ? '<span class="sheet-tag sheet-tag-c">C</span>' : ""}${player.id === lineup.keeper ? '<span class="sheet-tag sheet-tag-wk">WK</span>' : ""}</span>
          <span class="sheet-rating">${player.rating}</span>
          ${editable ? `<span class="sheet-controls">
            <button type="button" class="sheet-btn" data-move="-1" aria-label="Move ${player.name} up" ${index === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
            <button type="button" class="sheet-btn" data-move="1" aria-label="Move ${player.name} down" ${index === lineup.players.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
            <button type="button" class="sheet-btn sheet-btn-text${player.id === lineup.captain ? " is-on" : ""}" data-captain aria-pressed="${player.id === lineup.captain}" aria-label="Make ${player.name} captain">C</button>
            <button type="button" class="sheet-btn sheet-btn-text${player.id === lineup.keeper ? " is-on" : ""}" data-keeper aria-pressed="${player.id === lineup.keeper}" aria-label="Make ${player.name} wicketkeeper">WK</button>
          </span>` : ""}
        </li>`).join("")}
    </ol>`;
}

function openTeamSheets() {
  if (!qmTeam(qm.home) || !qmTeam(qm.away)) { showPage(quickMatchPage, "Quick Match | World Cricket Champs"); return; }
  renderSheet(document.querySelector("#sheetHome"), qm.home, true);
  renderSheet(document.querySelector("#sheetAway"), qm.away, false);
  showPage(teamSheetPage, "Team sheets | Quick Match");
  document.querySelector("#backFromTeamSheet").focus();
}

function updateLineup(code, change, focusSelector) {
  const lineup = lineupFor(code);
  change(lineup);
  saveLineup(code, lineup);
  renderSheet(document.querySelector("#sheetHome"), code, true);
  if (focusSelector) {
    const target = document.querySelector(focusSelector);
    if (target && !target.disabled) target.focus();
  }
}

teamSheetPage.addEventListener("click", (event) => {
  const row = event.target.closest("[data-player]");
  const list = event.target.closest("[data-sheet]");
  if (!row || !list || list.closest("#sheetAway")) return;
  const code = list.dataset.sheet;
  const id = row.dataset.player;
  const move = event.target.closest("[data-move]");
  if (move) {
    const delta = Number(move.dataset.move);
    updateLineup(code, (lineup) => {
      const index = lineup.players.findIndex((player) => player.id === id);
      const target = index + delta;
      if (target < 0 || target >= lineup.players.length) return;
      [lineup.players[index], lineup.players[target]] = [lineup.players[target], lineup.players[index]];
    }, `[data-player="${id}"] [data-move="${delta}"]`);
    return;
  }
  if (event.target.closest("[data-captain]")) updateLineup(code, (lineup) => { lineup.captain = id; }, `[data-player="${id}"] [data-captain]`);
  if (event.target.closest("[data-keeper]")) updateLineup(code, (lineup) => { lineup.keeper = id; }, `[data-player="${id}"] [data-keeper]`);
});

/* Drag and drop (mouse); touch and keyboard use the arrow buttons. */
let draggedId = null;
teamSheetPage.addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-player]");
  if (!row) return;
  draggedId = row.dataset.player;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedId);
});
teamSheetPage.addEventListener("dragover", (event) => {
  const row = event.target.closest("#sheetHome [data-player]");
  if (!row || !draggedId) return;
  event.preventDefault();
  teamSheetPage.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
  row.classList.add("is-drop-target");
});
teamSheetPage.addEventListener("drop", (event) => {
  const row = event.target.closest("#sheetHome [data-player]");
  if (!row || !draggedId) return;
  event.preventDefault();
  const code = row.closest("[data-sheet]").dataset.sheet;
  const targetId = row.dataset.player;
  updateLineup(code, (lineup) => {
    const from = lineup.players.findIndex((player) => player.id === draggedId);
    const to = lineup.players.findIndex((player) => player.id === targetId);
    const [moved] = lineup.players.splice(from, 1);
    lineup.players.splice(to, 0, moved);
  });
  draggedId = null;
});
teamSheetPage.addEventListener("dragend", () => {
  draggedId = null;
  teamSheetPage.querySelectorAll(".is-dragging, .is-drop-target").forEach((element) => element.classList.remove("is-dragging", "is-drop-target"));
});

document.querySelector("#backFromTeamSheet").addEventListener("click", () => {
  showPage(quickMatchPage, "Quick Match · Ready | World Cricket Champs");
  openVersus();
});
