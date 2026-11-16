# Tournament stage navigation design

## Intent

Replace the CWC27 follow-up hub with a white, route-based tournament flow. After team selection, open that team's Groups stage. Let the test build navigate freely among Groups, Super 7, Semi-Finals, and Finals.

## Goals

- Add navigation for Groups, Super 7, Semi-Finals, and Finals.
- Groups and Super 7 show two cards: My Fixtures and Tournament Stats.
- My Fixtures opens a full-page view containing only fixtures for the selected team, shown in bracket-style match cards.
- Semi-Finals and Finals show a stage bracket on the left and tournament statistics on the right.
- Provide a continue action from each stage to the next, while keeping every stage directly accessible in this test build.
- Keep the existing team picker and persist the selected team across route changes.

## Non-goals and constraints

- No match-result entry, standings simulation, or automatic stage-completion detection.
- Statistics use the data already available in the app and clearly show TBD/zero states when results are not available.
- Existing project is static HTML, CSS, and JavaScript, with no routing library.
- Better Design's required principle and review tools are currently unavailable because the service returned an exhausted free-query quota (HTTP 402).

## Approaches

- Update the current single-page hub: smallest change and simplest state handling, but browser history would not represent stage changes.
- Use separate routes (chosen): each stage has its own URL and browser history; adds route handling to the static app, which is reasonable for four directly addressable test stages.

## Behavior and visual direction

- Keep team selection as the entry route. Route the selected team to Groups A or B based on existing team data; qualifier entrants currently marked for Super Series should still enter Groups in this test flow unless a group is already assigned.
- Use hash routes so direct links, browser Back/Forward, and static hosting work without server rewrites.
- Stage navigation is always unlocked. Continue buttons advance Groups → Super 7 → Semi-Finals → Finals.
- Group and Super 7 fixture cards open the selected team's fixture view. Its only content is that team's match bracket plus a back-to-stage control.
- The Semi-Finals and Finals pages place their stage bracket on the left and a stats panel on the right.
- Apply a white background throughout the CWC27 tournament UI, retaining the existing cricket palette as restrained text, border, and accent colors.
- Because there is no results model, stats are tournament/stage totals and TBD states, not invented standings or player performance.

## Open implementation detail

For the four qualifier entrants whose group assignment is not yet known, use the available preview/group data: Q-A enters Group A; QF1–QF3 start in the Super Series in the source data. The test route will show Groups after team choice as requested, with an “assignment pending” note when a selected entrant does not have a Groups assignment.
