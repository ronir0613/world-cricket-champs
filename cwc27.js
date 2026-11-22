(() => {
  const teams = [
    { code: "IND", name: "India", flag: "IN.svg", type: "Direct qualifier", group: "Group A" },
    { code: "AUS", name: "Australia", flag: "AU.svg", type: "Direct qualifier", group: "Group A" },
    { code: "PAK", name: "Pakistan", flag: "PK.svg", type: "Direct qualifier", group: "Group A" },
    { code: "AFG", name: "Afghanistan", flag: "AF.svg", type: "Direct qualifier", group: "Group A" },
    { code: "ZIM", name: "Zimbabwe", flag: "ZW.svg", type: "Direct qualifier", group: "Group A" },
    { code: "NZL", name: "New Zealand", flag: "NZ.svg", type: "Direct qualifier", group: "Group B" },
    { code: "SA", name: "South Africa", flag: "ZA.svg", type: "Direct qualifier", group: "Group B" },
    { code: "ENG", name: "England", flag: "ENG.svg", type: "Direct qualifier", group: "Group B" },
    { code: "SL", name: "Sri Lanka", flag: "LK.svg", type: "Direct qualifier", group: "Group B" },
    { code: "BAN", name: "Bangladesh", flag: "BD.svg", type: "Direct qualifier", group: "Group B" },
    { code: "QF1", name: "Qualifier Entrant 1", flag: "", type: "Qualifier entrant", group: "Super Series" },
    { code: "QF2", name: "Qualifier Entrant 2", flag: "", type: "Qualifier entrant", group: "Super Series" },
    { code: "QF3", name: "Qualifier Entrant 3", flag: "", type: "Qualifier entrant", group: "Super Series" },
    { code: "Q-A", name: "Qualifier Champion", flag: "", type: "Qualifier champion", group: "Group A" }
  ];

  const byCode = new Map(teams.map((team) => [team.code, team]));
  const groupA = ["IND", "AUS", "PAK", "AFG", "ZIM", "Q-A"];
  const groupB = ["NZL", "SA", "ENG", "SL", "BAN", "Q-B"];
  const super7Slots = [
    { code: "A1", teamCode: "IND", seededFor: "India" },
    { code: "A2", teamCode: "AUS", seededFor: "Australia" },
    { code: "A3", teamCode: "PAK", seededFor: "Pakistan" },
    { code: "B1", teamCode: "NZL", seededFor: "New Zealand" },
    { code: "B2", teamCode: "SA", seededFor: "South Africa" },
    { code: "B3", teamCode: "SL", seededFor: "Sri Lanka" },
    { code: "AB4", teamCode: "ENG", seededFor: "England" }
  ];

  const storageKey = "world-cricket-champs-selected-cwc27-team";
  const cwcApp = document.querySelector("#cwcApp");
  const teamPicker = document.querySelector("#teamPicker");
  const tournamentHub = document.querySelector("#tournamentHub");
  const teamGrid = document.querySelector("#teamGrid");
  const previewType = document.querySelector("#previewType");
  const previewFlag = document.querySelector("#previewFlag");
  const previewName = document.querySelector("#previewName");
  const previewDetails = document.querySelector("#previewDetails");
  const previewGroup = document.querySelector("#previewGroup");
  const enterTournament = document.querySelector("#enterTournament");
  const hubTeamFlag = document.querySelector("#hubTeamFlag");
  const hubTeamName = document.querySelector("#hubTeamName");
  const stageView = document.querySelector("#stageView");
  const fixturePage = document.querySelector("#fixturePage");
  const fixturesTeamName = document.querySelector("#fixturesTeamName");
  const fixturesDisplay = document.querySelector("#fixturesDisplay");
  const backToStage = document.querySelector("#backToStage");

  let selectedTeam = null;
  let fixtureReturnStage = "groups";

  function readSavedTeam() {
    try { return byCode.get(localStorage.getItem(storageKey)) || null; }
    catch (_) { return null; }
  }

  function flagContent(team) {
    if (team.flag) return `<img src="assets/flags/${team.flag}" alt="" draggable="false" loading="lazy" decoding="async">`;
    return `<span class="flag-fallback" aria-hidden="true">${team.code}</span>`;
  }

  function renderTeamGrid() {
    const buttons = teams.map((team) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-option";
      button.setAttribute("aria-pressed", String(selectedTeam?.code === team.code));
      button.setAttribute("aria-label", `${team.name}, ${team.type}, ${team.group}`);

      const flag = document.createElement("span");
      flag.className = `team-flag${team.code.startsWith("Q") ? " is-qualifier" : ""}`;
      flag.setAttribute("aria-hidden", "true");
      flag.innerHTML = flagContent(team);
      const name = document.createElement("span");
      name.className = "team-option-name";
      name.textContent = team.name;
      const meta = document.createElement("span");
      meta.className = "team-option-meta";
      meta.textContent = team.group;
      button.append(flag, name, meta);
      button.addEventListener("click", () => {
        selectedTeam = team;
        renderTeamGrid();
        renderTeamPreview();
      });
      return button;
    });
    teamGrid.replaceChildren(...buttons);
  }

  function renderTeamPreview() {
    enterTournament.disabled = !selectedTeam;
    if (!selectedTeam) {
      previewType.textContent = "Select a team";
      previewFlag.replaceChildren();
      previewFlag.classList.remove("is-qualifier");
      previewName.textContent = "Choose your country";
      previewDetails.textContent = "Your selected team will appear here.";
      previewGroup.textContent = "14 teams · 57 matches";
      return;
    }
    previewType.textContent = selectedTeam.type;
    previewFlag.innerHTML = flagContent(selectedTeam);
    previewFlag.classList.toggle("is-qualifier", selectedTeam.code.startsWith("Q"));
    previewName.textContent = selectedTeam.name;
    previewGroup.textContent = selectedTeam.group;
    previewDetails.textContent = selectedTeam.code.startsWith("QF")
      ? "Starts in the Super Series; group placement is pending."
      : selectedTeam.code === "Q-A"
        ? "The Qualifier Champion enters Group A. Country to be confirmed after the 2027 Qualifier."
        : `${selectedTeam.type} · ${selectedTeam.group}`;
  }

  function setAppActive(active) {
    cwcApp.classList.toggle("is-active", active);
    cwcApp.hidden = !active;
    document.querySelector("#home").classList.toggle("is-active", !active);
    document.querySelector("#home").setAttribute("aria-hidden", String(active));
  }

  function closeCwc() {
    setAppActive(false);
    if (window.location.hash.startsWith("#/cwc27/")) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    document.title = "Home | World Cricket Champs";
    window.dispatchEvent(new Event("wcc:home-shown"));
  }

  function navigate(route, replace = false) {
    const nextHash = `#/cwc27/${route}`;
    if (replace) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
      renderRoute();
    } else if (window.location.hash === nextHash) {
      renderRoute();
    } else {
      window.location.hash = nextHash;
    }
  }

  function parseRoute() {
    const raw = window.location.hash.replace(/^#/, "");
    const match = raw.match(/^\/cwc27\/(team|groups|super7|semi-finals|finals|fixtures)(?:\?from=(groups|super7))?$/);
    if (!match) return null;
    return { page: match[1], from: match[2] || "groups" };
  }

  function teamInfo(code) {
    if (byCode.has(code)) return byCode.get(code);
    const slot = super7Slots.find((item) => item.code === code);
    if (slot) return { code: slot.teamCode, name: slot.seededFor, flag: byCode.get(slot.teamCode).flag };
    if (code === "Q-B") return { code, name: "Super Series winner", flag: "" };
    return { code, name: code, flag: "" };
  }

  function teamInline(code, highlight = false) {
    const team = teamInfo(code);
    const qualifier = team.code.startsWith("Q") ? " is-qualifier" : "";
    return `<span class="fixture-team${highlight ? " is-selected-team" : ""}"><span class="fixture-flag${qualifier}" aria-hidden="true">${flagContent(team)}</span><span${highlight ? " class=\"fixture-team-name\"" : ""}>${team.name}</span></span>`;
  }

  function roundRobin(codes) {
    const rotation = [...codes];
    if (rotation.length % 2 === 1) rotation.push(null);
    const rounds = [];
    for (let round = 0; round < rotation.length - 1; round += 1) {
      const matches = [];
      for (let index = 0; index < rotation.length / 2; index += 1) {
        const home = rotation[index];
        const away = rotation[rotation.length - 1 - index];
        if (home && away) matches.push({ home, away });
      }
      rounds.push(matches);
      const fixed = rotation[0];
      const rest = rotation.slice(1);
      rest.unshift(rest.pop());
      rotation.splice(0, rotation.length, fixed, ...rest);
    }
    return rounds;
  }

  function buildFixtures() {
    const matches = [];
    const addRound = (stage, round, pairings, group = "", venue = "") => {
      pairings.forEach((pairing) => matches.push({
        number: matches.length + 1, stage, round, group, venue,
        home: pairing.home, away: pairing.away
      }));
    };
    roundRobin(["QF1", "QF2", "QF3"]).forEach((pairings, index) => addRound("Super Series", index + 1, pairings, "", "Windhoek, Namibia"));
    const groupARounds = roundRobin(groupA);
    const groupBRounds = roundRobin(groupB);
    for (let round = 0; round < 5; round += 1) {
      addRound("Group Stage", round + 1, groupARounds[round], "Group A");
      addRound("Group Stage", round + 1, groupBRounds[round], "Group B");
    }
    roundRobin(super7Slots.map((slot) => slot.code)).forEach((pairings, index) => addRound("Super 7", index + 1, pairings));
    matches.push(
      { number: matches.length + 1, stage: "Semi-Finals", round: "Semi-Final 1", home: "Super 7 1st place", away: "Super 7 4th place", group: "", venue: "" },
      { number: matches.length + 2, stage: "Semi-Finals", round: "Semi-Final 2", home: "Super 7 2nd place", away: "Super 7 3rd place", group: "", venue: "" },
      { number: matches.length + 3, stage: "Finals", round: "Final", home: "Winner SF1", away: "Winner SF2", group: "", venue: "" }
    );
    return matches;
  }

  const fixtures = buildFixtures();

  function groupNameForSelectedTeam() {
    return selectedTeam.group === "Group A" || selectedTeam.group === "Group B" ? selectedTeam.group : "";
  }

  function fixturesForSelectedTeam(stage) {
    const groupCode = selectedTeam.code;
    if (stage === "groups") {
      return selectedTeam.group === "Group A" || selectedTeam.group === "Group B"
        ? fixtures.filter((match) => match.stage === "Group Stage" && (match.home === groupCode || match.away === groupCode))
        : [];
    }
    const slot = super7Slots.find((entry) => entry.teamCode === groupCode);
    return slot
      ? fixtures.filter((match) => match.stage === "Super 7" && (match.home === slot.code || match.away === slot.code))
      : [];
  }

  function matchCard(match, index) {
    const selectedCode = selectedTeam.code;
    const homeInfo = teamInfo(match.home);
    const awayInfo = teamInfo(match.away);
    const homeSelected = match.home === selectedCode || homeInfo.code === selectedCode;
    const awaySelected = match.away === selectedCode || awayInfo.code === selectedCode;
    return `<article class="team-fixture-match"><span class="team-fixture-index">${String(index + 1).padStart(2, "0")}</span><span class="team-fixture-stage">${match.stage}${match.group ? ` · ${match.group}` : ""} · Round ${match.round}</span><div class="team-fixture-pair">${teamInline(match.home, homeSelected)}<span class="fixture-vs">VS</span>${teamInline(match.away, awaySelected)}</div><span class="team-fixture-date">Date TBA</span></article>`;
  }

  function renderFixturePage(from) {
    fixtureReturnStage = from === "super7" ? "super7" : "groups";
    stageView.hidden = true;
    fixturePage.hidden = false;
    fixturesTeamName.textContent = selectedTeam.name;
    backToStage.setAttribute("aria-label", `Back to ${fixtureReturnStage === "super7" ? "Super 7" : "Groups"}`);
    const teamFixtures = fixturesForSelectedTeam(fixtureReturnStage);
    if (!teamFixtures.length) {
      const message = fixtureReturnStage === "groups"
        ? `${selectedTeam.name} is awaiting a group assignment.`
        : `${selectedTeam.name} does not have a confirmed Super 7 seed yet.`;
      fixturesDisplay.innerHTML = `<div class="fixture-empty"><h3>No fixtures assigned yet</h3><p>${message}</p></div>`;
      return;
    }
    const sectionName = fixtureReturnStage === "groups" ? selectedTeam.group : `Super 7 · ${super7Slots.find((slot) => slot.teamCode === selectedTeam.code).code} seeded route`;
    const note = fixtureReturnStage === "super7" ? `<p class="fixture-section-note">Potential schedule based on the current pre-seed. Participation depends on group results.</p>` : "";
    const sections = `<section class="team-fixture-section"><header><h3>${sectionName}</h3><span>${teamFixtures.length} fixtures</span></header>${note}<div class="team-fixture-bracket">${teamFixtures.map((match, index) => matchCard(match, index)).join("")}</div></section>`;
    fixturesDisplay.innerHTML = `<div class="fixture-board-heading"><div><p class="cwc-eyebrow">CWC27 · Team schedule</p><h2>${selectedTeam.name} fixtures</h2></div><span class="fixture-total">${teamFixtures.length} MATCHES</span></div>${sections}`;
  }

  const stageDetails = {
    groups: { title: "Groups", matchCount: 30, teamCount: 12, format: "Five group matches per team", next: "super7", nextLabel: "Continue to Super 7" },
    super7: { title: "Super 7", matchCount: 21, teamCount: 7, format: "Six round-robin matches per team", next: "semi-finals", nextLabel: "Continue to Semi-Finals" },
    "semi-finals": { title: "Semi-Finals", matchCount: 2, teamCount: 4, format: "Top four teams play for a place in the final", next: "finals", nextLabel: "Continue to Finals" },
    finals: { title: "Finals", matchCount: 1, teamCount: 2, format: "One match decides the champion", next: "", nextLabel: "" }
  };

  function statsMarkup(stage) {
    const details = stageDetails[stage];
    return `<aside class="stats-card" aria-label="Tournament statistics"><div class="stats-card-header"><span class="dashboard-card-kicker">Tournament stats</span><span class="stats-status">Results pending</span></div><div class="stats-metrics"><div class="stat-tile"><strong>${details.matchCount}</strong><span>Stage matches</span></div><div class="stat-tile"><strong>${details.teamCount}</strong><span>Teams or slots</span></div><div class="stat-tile"><strong>57</strong><span>Tournament matches</span></div><div class="stat-tile"><strong>—</strong><span>Matches completed</span></div></div><p class="stats-note">${details.format}. Results and player stats will appear here after matches are entered.</p></aside>`;
  }

  function fixtureCard(stage) {
    const group = groupNameForSelectedTeam();
    const qualifierNote = !group && stage === "groups" ? "Group assignment pending" : group;
    const count = stage === "groups"
      ? fixtures.filter((match) => match.stage === "Group Stage" && (match.home === selectedTeam.code || match.away === selectedTeam.code)).length
      : super7Slots.some((slot) => slot.teamCode === selectedTeam.code) ? 6 : 0;
    const meta = stage === "groups" ? (qualifierNote || "Your group is yet to be assigned") : count ? `${count} potential seeded fixtures` : "Seed and fixtures to be determined";
    return `<button class="dashboard-card fixtures-card" type="button" data-open-fixtures><span class="dashboard-card-kicker">My fixtures</span><span class="fixtures-card-flag" aria-hidden="true">${flagContent(selectedTeam)}</span><span class="fixtures-card-main">${selectedTeam.name}</span><span class="fixtures-card-meta">${meta}</span><span class="dashboard-card-action">View my fixtures <span aria-hidden="true">→</span></span></button>`;
  }

  function bracketFlag(code, label = "") {
    const team = teamInfo(code);
    const selected = team.code === selectedTeam.code || code === selectedTeam.code;
    const qualifier = team.code.startsWith("Q") ? " is-qualifier" : "";
    return `<span class="bracket-flag${selected ? " is-selected" : ""}${qualifier}" title="${label || team.name}" aria-label="${label || team.name}">${flagContent(team)}</span>`;
  }

  function knockoutMatch(title, first, second) {
    return `<article class="bracket-match"><h3>${title}</h3><div class="bracket-contenders"><div>${bracketFlag(first, `${title}: ${first}`)}<span>${first}</span></div><div>${bracketFlag(second, `${title}: ${second}`)}<span>${second}</span></div></div></article>`;
  }

  function knockoutMarkup(stage) {
    if (stage === "semi-finals") {
      return `<div class="knockout-bracket"><div class="knockout-round"><h3>Semi-Finals</h3>${knockoutMatch("Semi-Final 1", "Super 7 1st place", "Super 7 4th place")}${knockoutMatch("Semi-Final 2", "Super 7 2nd place", "Super 7 3rd place")}</div><div class="knockout-connector" aria-hidden="true">→</div><div class="knockout-round knockout-next"><h3>Next</h3>${knockoutMatch("Final", "Winner SF1", "Winner SF2")}</div></div>`;
    }
    return `<div class="knockout-bracket final-bracket"><div class="knockout-round"><h3>Final</h3>${knockoutMatch("World Cup Final", "Winner SF1", "Winner SF2")}<div class="champion-badge"><svg class="trophy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg><b>Champion · TBD</b></div></div></div>`;
  }

  function renderStage(stage) {
    const details = stageDetails[stage];
    const group = groupNameForSelectedTeam();
    const subheading = stage === "groups"
      ? group || "Group assignment pending"
      : stage === "super7"
        ? (super7Slots.find((slot) => slot.teamCode === selectedTeam.code)?.code || "Seed to be determined")
        : "Road to the trophy";
    const layout = stage === "groups" || stage === "super7"
      ? `<div class="stage-card-grid">${fixtureCard(stage)}${statsMarkup(stage)}</div>`
      : `<div class="knockout-layout"><section class="knockout-panel" aria-label="${details.title} bracket">${knockoutMarkup(stage)}</section>${statsMarkup(stage)}</div>`;
    stageView.hidden = false;
    fixturePage.hidden = true;
    const nextAction = details.next
      ? `<button class="cwc-primary stage-next" type="button" data-next-stage="${details.next}">${details.nextLabel}<span aria-hidden="true">→</span></button>`
      : `<span class="stage-complete">Tournament final · Champion TBD</span>`;
    stageView.innerHTML = `<header class="stage-heading"><div><p class="cwc-eyebrow">ICC Cricket World Cup 2027 · ${selectedTeam.name}</p><h2>${details.title}</h2><p class="stage-subtitle">${subheading}</p></div><span class="stage-unlocked">Test build · Stage unlocked</span></header>${layout}<footer class="stage-footer"><span>All stages are available in this test build.</span>${nextAction}</footer>`;
  }

  function renderRoute() {
    const route = parseRoute();
    if (!route) {
      if (window.location.hash.startsWith("#/cwc27/")) navigate("team", true);
      return;
    }
    setAppActive(true);
    selectedTeam = selectedTeam || readSavedTeam();
    if (route.page !== "team" && !selectedTeam) {
      navigate("team", true);
      return;
    }
    if (route.page === "team") {
      teamPicker.hidden = false;
      tournamentHub.hidden = true;
      renderTeamGrid();
      renderTeamPreview();
      document.title = "Choose your team | CWC27";
      return;
    }

    teamPicker.hidden = true;
    tournamentHub.hidden = false;
    hubTeamFlag.innerHTML = flagContent(selectedTeam);
    hubTeamName.textContent = selectedTeam.name;
    document.querySelectorAll("[data-stage-link]").forEach((link) => {
      const active = link.dataset.stageLink === route.page || (route.page === "fixtures" && link.dataset.stageLink === route.from);
      link.classList.toggle("is-current", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (route.page === "fixtures") {
      renderFixturePage(route.from);
      document.title = `My fixtures · ${selectedTeam.name} | CWC27`;
    } else {
      renderStage(route.page);
      document.title = `${stageDetails[route.page].title} | CWC27`;
    }
  }

  enterTournament.addEventListener("click", () => {
    if (!selectedTeam) return;
    try { localStorage.setItem(storageKey, selectedTeam.code); } catch (_) { /* Storage may be unavailable. */ }
    navigate("groups");
  });

  document.querySelector("#pickerHome").addEventListener("click", closeCwc);
  document.querySelector("#hubHome").addEventListener("click", closeCwc);
  backToStage.addEventListener("click", () => navigate(fixtureReturnStage));

  stageView.addEventListener("click", (event) => {
    const fixturesButton = event.target.closest("[data-open-fixtures]");
    if (fixturesButton) {
      const currentStage = parseRoute()?.page === "super7" ? "super7" : "groups";
      navigate(`fixtures?from=${currentStage}`);
      return;
    }
    const nextButton = event.target.closest("[data-next-stage]");
    if (nextButton) navigate(nextButton.dataset.nextStage);
  });

  window.addEventListener("hashchange", renderRoute);
  window.CWC27 = {
    open() {
      selectedTeam = readSavedTeam();
      setAppActive(true);
      if (!parseRoute()) navigate(selectedTeam ? "groups" : "team", true);
      else renderRoute();
    },
    savedTeam() {
      const team = readSavedTeam();
      return team ? { name: team.name, flag: team.flag ? `assets/flags/${team.flag}` : "" } : null;
    }
  };

  if (window.location.hash.startsWith("#/cwc27/")) window.CWC27.open();
})();
