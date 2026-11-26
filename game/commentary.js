/* ==========================================================================
   Match commentary from recorded clips (assets/commentary, made from the
   commentary/ folder by tools/commentary.py).

   say(event)    a ball's outcome: "miss-and-leave", "0", "1", "2", "3", "4", "6",
                 "catch", "bowled", "runout". Cuts off an earlier ball's line.
   special(name) a longer conversation piece ("virat", "bumrah", "smith", "starc").
                 Nothing interrupts it: ball calls are dropped until it ends.
   intro()       the match intro; resolves when it ends (or is skipped).
   A clip that is missing (there is no 2 yet) is simply skipped.
   ========================================================================== */
const BASE = new URL("../assets/commentary/", import.meta.url).href;
const EVENTS = ["miss-and-leave", "0", "1", "2", "3", "4", "6", "catch", "bowled", "runout"];
/* who each special is about: it plays when that team is batting or bowling */
export const SPECIALS = {
  virat: { team: "IND", role: "bat" },
  bumrah: { team: "IND", role: "bowl" },
  smith: { team: "AUS", role: "bat" },
  starc: { team: "AUS", role: "bowl" }
};

export function createCommentary({ volume = 0.9, enabled = true } = {}) {
  const clips = new Map();
  let current = null;            /* { audio, kind: "event" | "special" | "intro", done } */
  let paused = false;

  function clip(name) {
    if (clips.has(name)) return clips.get(name);
    const audio = new Audio(BASE + name + ".mp3");
    audio.preload = "auto";
    audio.volume = volume;
    audio.addEventListener("error", () => { audio.dataset.missing = "1"; });
    clips.set(name, audio);
    return audio;
  }
  if (enabled) ["match-intro", ...EVENTS, ...Object.keys(SPECIALS)].forEach(clip);

  function stopCurrent() {
    if (!current) return;
    const c = current;
    current = null;
    c.audio.pause();
    c.done();
  }
  function start(name, kind) {
    return new Promise((resolve) => {
      const audio = clip(name);
      if (!enabled || audio.dataset.missing) { resolve(false); return; }
      const entry = { audio, kind, done: () => resolve(true) };
      const finish = () => { audio.removeEventListener("ended", finish); if (current === entry) current = null; resolve(true); };
      audio.addEventListener("ended", finish);
      entry.done = finish;
      current = entry;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => finish());       /* blocked or missing: carry on silently */
    });
  }

  return {
    get busy() { return !!current && current.kind !== "event"; },
    get speaking() { return !!current; },
    say(name) {
      if (!enabled || paused || (current && current.kind !== "event")) return;
      stopCurrent();
      start(name, "event");
    },
    special(name) {
      if (!enabled || paused || (current && current.kind !== "event")) return false;
      stopCurrent();
      start(name, "special");
      return true;
    },
    intro() { stopCurrent(); return start("match-intro", "intro"); },
    skip() { stopCurrent(); },
    pause(on) {
      paused = on;
      if (!current) return;
      if (on) current.audio.pause(); else current.audio.play().catch(() => {});
    },
    stop() { stopCurrent(); clips.forEach((a) => { a.pause(); a.src = ""; }); clips.clear(); }
  };
}
