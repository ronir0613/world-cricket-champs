/* ==========================================================================
   Rules and scorecard for a short limited-overs match. No graphics: the 3D
   practice match feeds it one ball at a time.

   createMatch({ overs, wickets, teams: [{ name, code, players }, ...], first })
     first: index of the team that bats first.
   match.ball(event) with
     { runs: runs completed by running, boundary: 0 | 4 | 6,
       extra: null | "wide" | "noball",
       wicket: null | { how, index (batter index), fielder } }
   returns { overEnd, inningsEnd, matchEnd } and keeps the card in match.innings.
   ========================================================================== */

export function createMatch({ overs = 2, wickets = 3, teams, first = 0 }) {
  const innings = [];
  let current = null, result = null;

  function startInnings(bat) {
    const team = teams[bat];
    current = {
      bat, bowl: 1 - bat, runs: 0, wkts: 0, legal: 0, extras: 0, fours: 0, sixes: 0,
      batters: team.players.map((name) => ({ name, runs: 0, balls: 0, fours: 0, sixes: 0, out: null })),
      striker: 0, nonStriker: 1, next: 2,
      bowling: [], bowler: null,
      overs: [[]], freeHit: false,
      target: innings.length ? innings[0].runs + 1 : null,
      done: false
    };
    innings.push(current);
    nextBowler(current);
    return current;
  }
  /* bowlers take overs in turn from the fielding side's list ([name, "pace" | "spin"]) */
  function nextBowler(inn) {
    const team = teams[inn.bowl];
    const list = team.bowl && team.bowl.length ? team.bowl : [[team.players[team.players.length - 1], "pace"]];
    const [name, kind] = list[(inn.overs.length - 1) % list.length];
    let b = inn.bowling.find((x) => x.name === name);
    if (!b) { b = { name, kind, balls: 0, runs: 0, wkts: 0 }; inn.bowling.push(b); }
    inn.bowler = b;
  }
  startInnings(first);

  const maxBalls = overs * 6;
  const allOut = () => Math.min(wickets, teams[current.bat].players.length - 1);

  function ball({ runs = 0, boundary = 0, extra = null, wicket = null }) {
    const inn = current;
    if (!inn || inn.done) return { overEnd: false, inningsEnd: true, matchEnd: !!result };
    const striker = inn.batters[inn.striker];
    const bat = boundary || runs;
    const over = inn.overs[inn.overs.length - 1];
    let mark;
    if (extra === "wide") {
      inn.extras += 1 + runs; inn.runs += 1 + runs;
      inn.bowler.runs += 1 + runs;
      mark = runs ? `${runs + 1}wd` : "wd";
    } else if (extra === "noball") {
      inn.extras += 1; inn.runs += 1 + bat;
      striker.runs += bat; striker.balls += 1;
      inn.bowler.runs += 1 + bat;
      mark = bat ? `${bat}nb` : "nb";
    } else {
      inn.legal += 1; inn.bowler.balls += 1;
      inn.runs += bat; inn.bowler.runs += bat;
      striker.runs += bat; striker.balls += 1;
      mark = String(bat);
    }
    if (boundary === 4) { striker.fours += 1; inn.fours += 1; }
    if (boundary === 6) { striker.sixes += 1; inn.sixes += 1; }
    inn.freeHit = extra === "noball" || (inn.freeHit && extra === "wide");

    /* odd runs run: the batters have changed ends */
    if (!boundary && runs % 2 === 1) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];

    if (wicket) {
      const out = inn.batters[wicket.index];
      out.out = wicket.how + (wicket.fielder ? ` (${wicket.fielder})` : "");
      inn.wkts += 1;
      if (wicket.how !== "run out") inn.bowler.wkts += 1;
      mark = "W";
      if (inn.wkts < allOut() && inn.next < inn.batters.length) {
        /* the new batter takes the end the dismissed one was at */
        if (inn.striker === wicket.index) inn.striker = inn.next; else inn.nonStriker = inn.next;
        inn.next += 1;
      }
    }
    over.push(mark);

    let overEnd = false;
    if (!extra && inn.legal % 6 === 0) {
      overEnd = true;
      [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
      if (inn.legal < maxBalls) { inn.overs.push([]); nextBowler(inn); }
    }
    const chased = inn.target != null && inn.runs >= inn.target;
    const inningsEnd = inn.legal >= maxBalls || inn.wkts >= allOut() || chased;
    if (inningsEnd) {
      inn.done = true;
      if (innings.length === 1) startInnings(inn.bowl);
      else { current = null; result = decide(); }
    }
    return { overEnd: overEnd && !inningsEnd, inningsEnd, matchEnd: !!result, mark };
  }

  function decide() {
    const [a, b] = innings;
    const chasing = teams[b.bat];
    if (b.runs > a.runs) {
      const left = allOutFor(b.bat) - b.wkts;
      return { winner: b.bat, text: `${chasing.name} won by ${left} wicket${left === 1 ? "" : "s"}`, margin: left };
    }
    if (b.runs < a.runs) {
      const by = a.runs - b.runs;
      return { winner: a.bat, text: `${teams[a.bat].name} won by ${by} run${by === 1 ? "" : "s"}`, margin: by };
    }
    return { winner: null, text: "Match tied" };
  }
  function allOutFor(teamIndex) { return Math.min(wickets, teams[teamIndex].players.length - 1); }

  return {
    overs, wickets, teams, innings, ball,
    get current() { return current; },
    get result() { return result; },
    oversText(inn) { return `${Math.floor(inn.legal / 6)}.${inn.legal % 6}`; },
    needText(inn) {
      if (!inn || inn.target == null) return "";
      const need = inn.target - inn.runs, left = maxBalls - inn.legal;
      return need > 0 ? `Need ${need} off ${left} ball${left === 1 ? "" : "s"}` : "";
    }
  };
}
