# Tournament Stage Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CWC27's follow-up hub with white, directly navigable Groups, Super 7, Semi-Finals, and Finals routes, plus team-only fixtures and stage statistics.

**Architecture:** Keep the static HTML/CSS/JavaScript app. Add hash-based route handling for team selection, four unlocked stages, and the selected team's fixture view. Render stage-specific contents from existing team and fixture data; keep browser history in sync with route navigation.

**Tech Stack:** HTML, CSS, vanilla JavaScript; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-tournament-stage-navigation-design.md`

## Global Constraints

- “Use hash routes so direct links, browser Back/Forward, and static hosting work without server rewrites.”
- “Stage navigation is always unlocked.”
- “Apply a white background throughout the CWC27 tournament UI.”
- “My Fixtures opens a full-page view containing only fixtures for the selected team, shown in bracket-style match cards.”
- “No match-result entry, standings simulation, or automatic stage-completion detection.”
- Do not add or run automated tests; the developer instruction forbids tests unless requested.
- Better Design principles/reviews are unavailable due to the service's exhausted quota; do not claim those checks passed.

## Review Focus

- Invalid or missing route: show team selection when no team is selected, and keep all stage routes reachable after selection.
- Direct stage link and browser Back/Forward: selected team remains loaded and view matches the URL.
- Team with no group assignment yet: Groups explains assignment is pending rather than showing an unrelated group.
- Selected team's fixture view: contains only that team's matches and has no all-fixtures/list toggle.
- Narrow screens: stage navigation, two-card stages, knockout columns, and fixture bracket remain readable and scrollable.

## Files

- Modify `index.html`: replace the old fixture choices/dashboard markup with stage navigation, stage content, and a team-only fixture page.
- Modify `cwc27.js`: implement route parsing/rendering/history, team-to-group selection, stage cards/stats/brackets, and the fixture view.
- Modify `cwc27.css`: switch the CWC27 interface to a white theme and style responsive stage and bracket layouts.

## Task 1: Route-based tournament stages

**Files:**
- Modify: `index.html`
- Modify: `cwc27.js`
- Modify: `cwc27.css`

**Interfaces:**
- Route values: `#/cwc27/team`, `#/cwc27/groups`, `#/cwc27/super7`, `#/cwc27/semi-finals`, `#/cwc27/finals`, and `#/cwc27/fixtures`.
- State: selected team is read from the existing localStorage key; fixture route carries its return stage in the hash query (`?from=<stage>`).
- Fixture generator remains the source of match pairings; fixture filtering uses selected team code and requested stage.

- [ ] Replace old fixture choice and dashboard markup with a shared stage nav, a stage view container, and a full-page selected-team fixtures container. Add Semi-Finals to the visible navigation.
- [ ] Add a route parser and renderer in `cwc27.js`; handle initial open, `hashchange`, stage links, team selection, change team, fixture back navigation, and browser history.
- [ ] Render Groups and Super 7 with My Fixtures and Tournament Stats cards. Groups shows the selected team's group when known. Render explicit pending assignment copy when group membership is unresolved.
- [ ] Render Semi-Finals and Finals with the applicable bracket on the left, tournament stats on the right, and a continue action between stages.
- [ ] Make My Fixtures open a full-page team-only bracket view; remove the all-fixtures choice, list toggle, and unrelated whole-tournament bracket from that route.
- [ ] Apply a white background to every CWC27 route and adapt text, panels, borders, selected states, focus rings, and responsive layouts for contrast and legibility.
- [ ] Inspect source consistency, route coverage, fixture filtering, and responsive rules without adding or running automated tests.

## Execution Notes

- Existing team data marks Q-A as Group A and QF1–QF3 as Super Series entrants. Do not invent group assignments for those three; show Groups with a pending-assignment message.
- User has selected the separate-route approach and approved the design note.
- No automated tests are authorized. Better Design's automated principles and review tools are blocked by quota exhaustion.
