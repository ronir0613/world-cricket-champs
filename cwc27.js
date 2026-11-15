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
  const dashboard = document.querySelector("#cwcDashboard");
  const fixtureChoices = document.querySelector("#fixtureChoices");
  const fixturePage = document.querySelector("#fixturePage");
  const fixturesTeamName = document.querySelector("#fixturesTeamName");
  const fixturesTitle = document.querySelector("#fixturesTitle");
  const myFixtureTeam = document.querySelector("#myFixtureTeam");
  const myFixtureFlag = document.querySelector("#myFixtureFlag");
  const nextFixtureStage = document.querySelector("#nextFixtureStage");
  const nextFixtureTeams = document.querySelector("#nextFixtureTeams");
  const fixturesDisplay = document.querySelector("#fixturesDisplay");
  const fixtureStageSelect = document.querySelector("#fixtureStageSelect");
  const fixturePager = document.querySelector("#fixturePager");
  const fixturePageLabel = document.querySelector("#fixturePageLabel");
  const previousFixturePage = document.querySelector("#previousFixturePage");
  const nextFixturePage = document.querySelector("#nextFixturePage");

  let selectedTeam = null;
  let fixtureScope = "my";
  let fixtureView = "bracket";
  let fixturePageIndex = 0;
  const pageSize = 6;

  function readSavedTeam() {
    try { return byCode.get(localStorage.getItem(storageKey)) || null; }
    catch (_) { return null; }
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
      ? "Starts in the Super Series; the winner advances to Group B as Q-B."
      : selectedTeam.code === "Q-A"
        ? "The Qualifier Champion enters Group A. Country to be confirmed after the 2027 Qualifier."
        : `${selectedTeam.type} · ${selectedTeam.group}`;
  }

  function renderTeamPicker() {
    tournamentHub.hidden = true;
    teamPicker.hidden = false;
    renderTeamGrid();
    renderTeamPreview();
    document.title = "Choose your team | CWC27";
  }

  function closeCwc() {
    cwcApp.classList.remove("is-active");
    cwcApp.hidden = true;
    document.querySelector("#home").classList.add("is-active");
    document.querySelector("#home").setAttribute("aria-hidden", "false");
    document.title = "Home | World Cricket Champs";
  }

  function openHub() {
    if (!selectedTeam) return;
    try { localStorage.setItem(storageKey, selectedTeam.code); } catch (_) { /* Storage may be unavailable. */ }
    teamPicker.hidden = true;
    tournamentHub.hidden = false;
    dashboard.hidden = false;
    fixtureChoices.hidden = true;
    fixturePage.hidden = true;
    hubTeamFlag.innerHTML = flagContent(selectedTeam);
    hubTeamName.textContent = selectedTeam.name;
    document.title = "CWC27 | World Cricket Champs";
    renderNextFixture();
  }

  function teamInfo(code) {
    if (byCode.has(code)) return byCode.get(code);
    if (code === "Q-B") return { code, name: "Super Series winner", flag: "" };
    const slot = super7Slots.find((item) => item.code === code);
    if (slot) return byCode.get(slot.teamCode);
    return { code, name: code, flag: "" };
  }

  function flagContent(team) {
    if (team.flag) return `<img src="assets/flags/${team.flag}" alt="" draggable="false" loading="lazy" decoding="async">`;
    return `<span class="flag-fallback" aria-hidden="true">${team.code}</span>`;
  }

  function teamInline(code, highlight = false) {
    const team = teamInfo(code);
    const name = highlight ? `<strong>${team.name}</strong>` : team.name;
    const qualifier = team.code.startsWith("Q") ? " is-qualifier" : "";
    return `<span class="fixture-team${highlight ? " is-selected-team" : ""}"><span class="fixture-flag${qualifier}" aria-hidden="true">${flagContent(team)}</span><span>${name}</span></span>`;
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
      { number: matches.length + 1, stage: "Knockouts", round: "Semi-Final 1", home: "Super 7 1st place", away: "Super 7 4th place", group: "", venue: "" },
      { number: matches.length + 2, stage: "Knockouts", round: "Semi-Final 2", home: "Super 7 2nd place", away: "Super 7 3rd place", group: "", venue: "" },
      { number: matches.length + 3, stage: "Knockouts", round: "Final", home: "Winner SF1", away: "Winner SF2", group: "", venue: "" }
    );
    return matches;
  }

  const fixtures = buildFixtures();

  function renderNextFixture() {
    const match = fixtures.find((fixture) => fixture.home === selectedTeam.code || fixture.away === selectedTeam.code);
    if (!match) {
      nextFixtureStage.textContent = "Schedule to be announced";
      nextFixtureTeams.innerHTML = teamInline(selectedTeam.code, true);
      return;
    }
    nextFixtureStage.textContent = `${match.stage}${typeof match.round === "number" ? ` · Round ${match.round}` : ` · ${match.round}`} · Date TBA`;
    nextFixtureTeams.innerHTML = `${teamInline(match.home, match.home === selectedTeam.code)}<span class="next-fixture-vs">VS</span>${teamInline(match.away, match.away === selectedTeam.code)}`;
  }

  function openFixtureChoices() {
    dashboard.hidden = true;
    fixtureChoices.hidden = false;
    fixturePage.hidden = true;
    myFixtureTeam.textContent = selectedTeam.name;
    myFixtureFlag.innerHTML = flagContent(selectedTeam);
  }

  function openFixtures(scope = "my") {
    fixtureChoices.hidden = true;
    fixturePage.hidden = false;
    fixturesTeamName.textContent = selectedTeam.name;
    fixturesTitle.textContent = scope === "all" ? "All Fixtures" : "My Fixtures";
    fixtureScope = scope;
    fixtureView = "bracket";
    fixturePageIndex = 0;
    fixtureStageSelect.value = "all";
    updateFixtureControls();
    renderFixturesPage();
  }

  function updateFixtureControls() {
    document.querySelectorAll("[data-fixture-view]").forEach((button) => {
      const active = button.dataset.fixtureView === fixtureView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    fixtureStageSelect.disabled = fixtureView === "bracket";
  }

  function bracketFlag(code, label = "") {
    const team = teamInfo(code);
    const isSelected = selectedTeam && team.code === selectedTeam.code;
    const isQualifier = team.code.startsWith("Q");
    return `<span class="bracket-flag${isSelected ? " is-selected" : ""}${isQualifier ? " is-qualifier" : ""}" title="${label || team.name}" aria-label="${label || team.name}">${flagContent(team)}</span>`;
  }

  function renderBracket() {
    const groupFlags = (codes) => codes.map((code) => `<div class="bracket-team-node" title="${teamInfo(code).name}">${bracketFlag(code)}</div>`).join("");
    const slotNodes = (slots) => slots.map((slot) => `<div class="bracket-slot"><span>${slot.code}</span>${bracketFlag(slot.teamCode, `${slot.code} · ${slot.seededFor} seed`)}</div>`).join("");
    const placeholderMatch = (name, first, second) => `<article class="bracket-match"><h3>${name}</h3><div class="bracket-match-flags">${bracketFlag(first, `${name} first place slot`)}${bracketFlag(second, `${name} second place slot`)}</div></article>`;
    const selectedCallout = selectedTeam ? `<p class="bracket-selected">Gold outline marks ${selectedTeam.name}.</p>` : "";
    const trophy = `<svg class="trophy-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14v5c0 6-3 9-7 9s-7-3-7-9V4Zm7 14v6m-6 3h12M6 7H3v3c0 4 2 6 6 6m17-9h3v3c0 4-2 6-6 6M11 27l-2 3h14l-2-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<div class="bracket-heading"><div><p class="cwc-eyebrow">CWC27 · Symmetrical tournament bracket</p><h2>Road to the Final</h2></div><span class="bracket-total">57 MATCHES</span></div>
      <div class="bracket-board" aria-label="CWC27 tournament bracket">
        <section class="bracket-column group-column group-a-column"><h3>Group A</h3>${groupFlags(groupA)}</section>
        <section class="bracket-column super-column super-a-column"><h3>Super 7</h3>${slotNodes(super7Slots.slice(0, 3))}<p>A1–A3</p></section>
        <section class="bracket-center">
          <div class="bracket-semifinals">${placeholderMatch("Semi-Final 1", "Super 7 1st place", "Super 7 4th place")}${placeholderMatch("Semi-Final 2", "Super 7 2nd place", "Super 7 3rd place")}</div>
          <div class="champion-badge">${trophy}<b>WORLD CHAMPION · TBD</b></div>
          ${placeholderMatch("Final", "Winner SF1", "Winner SF2")}
          <div class="bracket-trophy" aria-label="Cricket World Cup trophy">${trophy}</div>
          <div class="wildcard-slot"><span>AB4 · WILDCARD</span>${bracketFlag("ENG", "Wildcard pre-seed · England")}</div>
        </section>
        <section class="bracket-column super-column super-b-column"><h3>Super 7</h3>${slotNodes(super7Slots.slice(3, 6))}<p>B1–B3</p></section>
        <section class="bracket-column group-column group-b-column"><h3>Group B</h3>${groupFlags(groupB)}</section>
      </div>
      ${selectedCallout}<p class="bracket-footnote">Super Series winner enters Group B as Q-B. Top three from each group and the better fourth-place team advance. Flags remain active until results are entered.</p>`;
  }

  function filteredFixtures() {
    const selectedStage = fixtureStageSelect.value;
    return fixtures.filter((fixture) => {
      const inStage = selectedStage === "all" || fixture.stage === selectedStage;
      const includesTeam = fixture.home === selectedTeam.code || fixture.away === selectedTeam.code;
      return inStage && (fixtureScope === "all" || includesTeam);
    });
  }

  function renderFixtureList() {
    const matches = filteredFixtures();
    const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
    fixturePageIndex = Math.min(fixturePageIndex, pageCount - 1);
    const pageMatches = matches.slice(fixturePageIndex * pageSize, (fixturePageIndex + 1) * pageSize);
    fixturePager.hidden = pageCount <= 1;
    fixturePageLabel.textContent = `${fixturePageIndex + 1} / ${pageCount} · ${matches.length} fixtures`;
    previousFixturePage.disabled = fixturePageIndex === 0;
    nextFixturePage.disabled = fixturePageIndex >= pageCount - 1;
    if (matches.length === 0) {
      fixturesDisplay.innerHTML = `<div class="fixture-empty">No fixtures for this team in the selected stage.</div>`;
      return;
    }
    fixturesDisplay.innerHTML = `<div class="fixture-list">${pageMatches.map((match) => {
      const detail = `${match.stage}${typeof match.round === "number" ? ` · Round ${match.round}` : ` · ${match.round}`}${match.group ? ` · ${match.group}` : ""}`;
      const venue = match.venue || "Date & venue TBA";
      return `<article class="fixture-row"><div class="fixture-meta">Match ${String(match.number).padStart(2, "0")}<span>${detail}</span></div><div class="fixture-pair">${teamInline(match.home, match.home === selectedTeam.code)}<span class="fixture-vs">VS</span>${teamInline(match.away, match.away === selectedTeam.code)}</div><span class="fixture-venue">${venue} · Date TBA</span></article>`;
    }).join("")}</div>`;
  }

  function renderFixturesPage() {
    updateFixtureControls();
    fixturePager.hidden = true;
    if (fixtureView === "bracket") {
      fixturesDisplay.innerHTML = renderBracket();
      return;
    }
    renderFixtureList();
  }

  function setToggle(buttons, value, key) {
    const target = buttons.find((button) => button.dataset[key] === value);
    if (!target) return;
    if (key === "fixtureView") fixtureView = value;
    fixturePageIndex = 0;
    renderFixturesPage();
  }

  enterTournament.addEventListener("click", openHub);
  document.querySelector("#pickerHome").addEventListener("click", closeCwc);
  document.querySelector("#hubHome").addEventListener("click", closeCwc);
  document.querySelector("#changeTeam").addEventListener("click", () => {
    tournamentHub.hidden = true;
    teamPicker.hidden = false;
    renderTeamPicker();
  });
  document.querySelector("#myFixturesCard").addEventListener("click", openFixtureChoices);
  document.querySelector("#openMyFixtures").addEventListener("click", () => openFixtures("my"));
  document.querySelector("#openAllFixtures").addEventListener("click", () => openFixtures("all"));
  document.querySelector("#backToDashboard").addEventListener("click", () => {
    fixtureChoices.hidden = true;
    fixturePage.hidden = true;
    dashboard.hidden = false;
  });
  document.querySelector("#backToFixtureChoices").addEventListener("click", () => {
    fixturePage.hidden = true;
    fixtureChoices.hidden = false;
  });
  fixtureStageSelect.addEventListener("change", () => {
    fixturePageIndex = 0;
    renderFixturesPage();
  });
  previousFixturePage.addEventListener("click", () => {
    fixturePageIndex = Math.max(0, fixturePageIndex - 1);
    renderFixturesPage();
  });
  nextFixturePage.addEventListener("click", () => {
    fixturePageIndex += 1;
    renderFixturesPage();
  });
  document.querySelectorAll("[data-fixture-view]").forEach((button) => button.addEventListener("click", () => {
    const buttons = [...document.querySelectorAll("[data-fixture-view]")];
    setToggle(buttons, button.dataset.fixtureView, "fixtureView");
  }));

  window.CWC27 = {
    open() {
      document.querySelector("#home").classList.remove("is-active");
      document.querySelector("#home").setAttribute("aria-hidden", "true");
      cwcApp.hidden = false;
      cwcApp.classList.add("is-active");
      selectedTeam = readSavedTeam();
      renderTeamPicker();
    }
  };
})();
