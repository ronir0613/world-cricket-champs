/* ==========================================================================
   Game-style navigation: arrow keys / D-pad move a highlight between
   controls, Enter / A selects, Escape / B goes back. Works with a keyboard
   and with any controller the browser exposes through the Gamepad API.
   ========================================================================== */
(() => {
  const FOCUSABLE = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  const root = document.documentElement;

  function isVisible(element) {
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const rect = rectFor(element);
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  /* Visually hidden radios live inside a tile or segment; use that box. */
  function rectFor(element) {
    if (element.matches("input[type=radio], input[type=checkbox]")) {
      const label = element.closest("label");
      if (label) return label.getBoundingClientRect();
    }
    return element.getBoundingClientRect();
  }

  function activeLayer() {
    const coach = document.querySelector("#coach:not([hidden])");
    if (coach) return coach;
    const versus = document.querySelector("#versusScreen:not([hidden])");
    if (versus) return versus;
    const dialog = document.querySelector("dialog[open]");
    if (dialog) return dialog;
    const loading = document.querySelector("#loadingScreen:not([hidden])");
    if (loading) return loading;
    const menu = document.querySelector("#menuPanel:not([hidden])");
    if (menu) return menu.closest("main");
    const cwc = document.querySelector("#cwcApp.is-active");
    if (cwc) return { querySelectorAll: (selector) => [...document.querySelectorAll(`#shell ${selector.split(",").join(", #shell ")}`), ...cwc.querySelectorAll(selector)] };
    const splash = document.querySelector("#splash:not([hidden])");
    if (splash) return splash;
    const homeEl = document.querySelector("#home");
    return { querySelectorAll: (selector) => [...document.querySelectorAll(`#shell ${selector.split(",").join(", #shell ")}`), ...homeEl.querySelectorAll(selector)] };
  }

  function candidates() {
    const layer = activeLayer();
    /* Every option tile is a stop; Enter / A picks the highlighted one. */
    return [...layer.querySelectorAll(FOCUSABLE)].filter(isVisible);
  }

  function center(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }

  function best(from, direction, pool) {
    const origin = rectFor(from);
    const start = center(origin);
    let winner = null;
    let winnerScore = Infinity;
    for (const element of pool) {
      if (element === from) continue;
      const rect = rectFor(element);
      const point = center(rect);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      let primary;
      let secondary;
      if (direction === "right") { if (rect.left < origin.right - 4 && dx <= 4) continue; primary = dx; secondary = dy; }
      if (direction === "left") { if (rect.right > origin.left + 4 && dx >= -4) continue; primary = -dx; secondary = dy; }
      if (direction === "down") { if (rect.top < origin.bottom - 4 && dy <= 4) continue; primary = dy; secondary = dx; }
      if (direction === "up") { if (rect.bottom > origin.top + 4 && dy >= -4) continue; primary = -dy; secondary = dx; }
      if (primary <= 0) continue;
      const score = primary + Math.abs(secondary) * 2.2;
      if (score < winnerScore) { winnerScore = score; winner = element; }
    }
    return winner;
  }

  function focusElement(element) {
    if (!element) return;
    root.classList.add("nav-focus");
    element.focus({ preventScroll: true });
    const rect = rectFor(element);
    if (rect.top < 0 || rect.bottom > window.innerHeight) element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    playTick();
  }

  let reportedNav = false;
  function move(direction) {
    if (!reportedNav) { reportedNav = true; window.dispatchEvent(new CustomEvent("wcc:achievement", { detail: "nav" })); }
    const pool = candidates();
    if (!pool.length) return;
    const current = document.activeElement;
    if (!current || current === document.body || !pool.includes(current)) {
      focusElement(pool[0]);
      return;
    }
    const next = best(current, direction, pool);
    if (next) focusElement(next);
  }

  function activate() {
    const element = document.activeElement;
    if (!element || element === document.body) { move("down"); return; }
    if (element.matches("input[type=radio], input[type=checkbox]")) { element.click(); return; }
    if (element.matches("button, a, [role=button]")) element.click();
  }

  /* Back: close the open menu, or press the visible back button. */
  function goBack() {
    const dialog = document.querySelector("dialog[open]");
    if (dialog) { dialog.close("cancel"); return; }
    if (!document.querySelector("#coach").hidden) { document.querySelector("#coachSkip").click(); return; }
    if (!document.querySelector("#versusScreen").hidden) { document.querySelector("#versusBack").click(); return; }
    const menu = document.querySelector("#menuPanel:not([hidden])");
    if (menu) { document.querySelector("#menuButton").click(); focusElement(document.querySelector("#menuButton")); return; }
    const layer = activeLayer();
    const back = [...layer.querySelectorAll(".btn-back, .cwc-back")].find((button) => isVisible(button) && !/Start a new career|Previous/.test(button.textContent));
    if (back) { back.click(); return; }
    /* Nothing to go back to: open the pause menu on Home. */
    window.dispatchEvent(new Event("wcc:open-pause"));
  }

  /* A soft tick for navigation, quiet and only when music is on. */
  let audio;
  function playTick() {
    if (window.WCCSound) { window.WCCSound.play("focus"); return; }
    try {
      if (localStorage.getItem("world-cricket-champs-music-enabled") === "false") return;
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.025, audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.07);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.08);
    } catch (_) { /* Sound is optional. */ }
  }

  const KEY_DIRECTIONS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const typing = target.matches && target.matches("input[type=text], input[type=number], input:not([type]), textarea, select");
    const slider = target.matches && target.matches("input[type=range]");

    if (event.key === "Escape") {
      if (typing) { target.blur(); return; }
      event.preventDefault();
      goBack();
      return;
    }
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    /* Let text fields and sliders keep their own left/right behaviour. */
    if ((typing || slider) && (direction === "left" || direction === "right")) return;
    if (target.matches && target.matches("select") && (direction === "up" || direction === "down")) return;
    event.preventDefault();
    move(direction);
  });

  document.addEventListener("keydown", (event) => {
    const nothingFocused = !document.activeElement || document.activeElement === document.body;
    if ((event.key === "Enter" || event.key === " ") && nothingFocused) {
      event.preventDefault();
      root.classList.add("nav-focus");
      const splash = document.querySelector("#splash:not([hidden])");
      if (splash) document.querySelector("#start").click();
      else move("down");
      return;
    }
    if (event.key === "Enter" && document.activeElement && document.activeElement.matches("input[type=radio]")) {
      event.preventDefault();
      document.activeElement.click();
    }
  });

  /* Track the input device so prompts can show the right buttons. */
  function setInput(kind) {
    if (root.dataset.input === kind) return;
    root.dataset.input = kind;
    window.dispatchEvent(new Event("wcc:input-change"));
  }
  /* Mouse or touch hides the navigation highlight again. */
  document.addEventListener("pointerdown", () => { root.classList.remove("nav-focus"); setInput("pointer"); }, true);
  document.addEventListener("keydown", (event) => {
    if (KEY_DIRECTIONS[event.key] || event.key === "Tab") root.classList.add("nav-focus");
    if (!event.ctrlKey && !event.metaKey) setInput("keyboard");
  }, true);

  /* ---------- Gamepad ---------- */
  const BUTTONS = { a: 0, b: 1, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 };
  const REPEAT_DELAY = 320;
  const REPEAT_RATE = 130;
  let polling = false;
  const held = {};

  function pressed(pad, name) { return Boolean(pad.buttons[BUTTONS[name]] && pad.buttons[BUTTONS[name]].pressed); }

  function poll(time) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) { polling = false; return; }
    const pad = pads[0];
    const axisX = pad.axes[0] || 0;
    const axisY = pad.axes[1] || 0;
    const state = {
      up: pressed(pad, "up") || axisY < -0.55,
      down: pressed(pad, "down") || axisY > 0.55,
      left: pressed(pad, "left") || axisX < -0.55,
      right: pressed(pad, "right") || axisX > 0.55,
      a: pressed(pad, "a"),
      b: pressed(pad, "b"),
      lb: pressed(pad, "lb"),
      rb: pressed(pad, "rb"),
      start: pressed(pad, "start")
    };
    if (Object.values(state).some(Boolean)) setInput(/054c|playstation|dualsense|dualshock|wireless controller/i.test(pad.id) ? "ps" : "xbox");
    /* While a game is on screen it reads the pad itself; just track what's held. */
    if (root.classList.contains("game-on")) {
      for (const [name, isDown] of Object.entries(state)) held[name] = isDown ? { since: time, last: time } : null;
      requestAnimationFrame(poll);
      return;
    }
    for (const [name, isDown] of Object.entries(state)) {
      const previous = held[name];
      if (isDown && !previous) {
        held[name] = { since: time, last: time };
        fire(name);
      } else if (isDown && previous && ["up", "down", "left", "right"].includes(name)) {
        if (time - previous.since > REPEAT_DELAY && time - previous.last > REPEAT_RATE) { previous.last = time; fire(name); }
      } else if (!isDown) {
        held[name] = null;
      }
    }
    requestAnimationFrame(poll);
  }

  function fire(name) {
    root.classList.add("nav-focus");
    if (name === "lb" || name === "rb") { window.dispatchEvent(new CustomEvent("wcc:tab", { detail: name === "lb" ? -1 : 1 })); return; }
    if (name === "start") { window.dispatchEvent(new Event("wcc:menu")); return; }
    if (name === "a") activate();
    else if (name === "b") goBack();
    else move(name);
  }

  function startPolling() {
    if (polling) return;
    polling = true;
    requestAnimationFrame(poll);
  }

  window.addEventListener("gamepadconnected", startPolling);
  if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) startPolling();
})();
