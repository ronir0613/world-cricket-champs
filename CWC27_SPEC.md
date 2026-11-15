# CWC27 Tournament Feature Specification

## Entry flow

1. Selecting **CWC27** from Home opens a participant-selection screen before any tournament views.
2. Show the participating countries as selectable tiles. Use the supplied image as a visual reference: a progress indicator and title above a selectable grid, with details for the selected country in a neighboring panel.
3. The player selects a country/team, then enters the tournament hub.
4. The tournament hub provides **Brackets**, **Standings**, and **Fixtures** views.

The attachment is a layout reference; its sample countries, flags, and starter-pack copy are not CWC27 data.

## Tournament overview

- **Teams:** 14 total: 10 direct qualifiers and 4 entrants from the February–March 2027 Qualifier.
- **Matches:** 57 across South Africa, Zimbabwe, and Namibia, from October 2 to November 21, 2027.
- **Points:** Win = 2, tie/no result = 1, loss = 0.
- **Stage reset:** Points, standings, and net run rate reset to zero at the start of every stage; no points carry over.
- **Overall tiebreakers:** Points, wins, net run rate, head-to-head, then initial ICC seeding.

## Stage 1 — Super Series (3 matches)

- **Entrants:** The three lowest-seeded Qualifier entrants: `QF1`, `QF2`, and `QF3`.
- **Format:** Single round-robin in Windhoek, Namibia; each team plays twice.
- **Advancement:** First place advances to Group B as `Q-B`. Second and third place are eliminated.

## Stage 2 — Group Stage / Super 12 (30 matches)

- **Format:** Two groups of six; single round-robin within each group, 15 matches per group and five matches per team.
- **Group A:** India, Australia, Pakistan, Afghanistan, Zimbabwe, Qualifier Champion (`Q-A`).
- **Group B:** New Zealand, South Africa, England, Sri Lanka, Bangladesh, Super Series Winner (`Q-B`).
- **Advancement:** Top three from each group (`A1`–`A3`, `B1`–`B3`) and one wildcard (`AB4`).
- **Wildcard:** The fourth-place team with the better record advances, comparing points, then wins, then net run rate. The other fourth-place team and remaining teams are eliminated.

## Stage 3 — Super 7 (21 matches)

- **Teams:** `A1`, `A2`, `A3`, `B1`, `B2`, `B3`, and `AB4`.
- **Format:** Single round-robin; each team plays the other six teams once.
- **Pre-seeded schedule slots:** `A1` = India, `A2` = Australia, `A3` = Pakistan, `B1` = New Zealand, `B2` = South Africa, `B3` = Sri Lanka, `AB4` = England.
- If a pre-seeded team does not advance, the unseeded qualifier from that group inherits its open slot.
- **Advancement:** The top four teams in the Super 7 table advance to the knockouts.

## Stage 4 — Knockouts (3 matches)

- **Semi-Final 1:** Super 7 first place vs. fourth place.
- **Semi-Final 2:** Super 7 second place vs. third place.
- **Final:** Winner of Semi-Final 1 vs. winner of Semi-Final 2.

## Participant data notes

The ten direct qualifiers named in the group lists are India, Australia, Pakistan, Afghanistan, Zimbabwe, New Zealand, South Africa, England, Sri Lanka, and Bangladesh. The four Qualifier entrants are not named yet; keep them as unresolved slots until their teams are supplied. The three lowest-seeded entrants are `QF1`–`QF3`; the remaining Qualifier Champion enters Group A as `Q-A`.
