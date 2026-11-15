# CWC27 Tournament Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the CWC27 participant-selection flow and tournament hub with brackets, standings, and fixtures.

**Architecture:** Keep the existing static HTML app. Add a dedicated CWC27 view with a participant picker and three hub tabs; keep the tournament data and rendering in `cwc27.js` and styles in `cwc27.css`.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript.

**Spec:** `CWC27_SPEC.md`

## Global Constraints

- Show all 10 named direct qualifiers and 4 unresolved qualifier entrants.
- The participant picker appears every time the user enters CWC27.
- The hub exposes Brackets, Standings, and Fixtures.
- Show 57 fixtures: 3 Super Series, 30 Group Stage, 21 Super 7, and 3 Knockouts.
- Stage standings initialize at 0; do not invent results or match dates.

## Review Focus

- Qualifier country identities are unknown: show QF1–QF3 and Q-A placeholders.
- Fixtures have no supplied match dates: label dates TBA and preserve supplied venue information only.
- User selection is local only: never imply it changes tournament results.
- Round-robin byes in the 7-team stage must still yield 21 matches and six matches per team.
- The screen must remain navigable at narrow widths with keyboard-accessible country tiles and tabs.

### Task 1: Participant selection and hub shell

**Files:**
- Modify: `index.html`
- Create: `cwc27.css`
- Create: `cwc27.js`

- [x] Add a CWC27 overlay with a country-selection view, selected-team summary, and hub navigation.
- [x] Add all 14 participant entries; persist the selected participant locally and keep change-team/back-to-home controls.
- [x] Add responsive styling matching the supplied country-selection layout reference.

### Task 2: Tournament views and data

**Files:**
- Modify: `cwc27.js`

- [x] Render bracket progression for Super Series, Groups, Super 7, and Knockouts using the specified advancement rules and seed slots.
- [x] Render Group A, Group B, and Super 7 standings with zeroed P/W/T/NR/L/points/NRR values and reset explanation.
- [x] Generate 57 fixture pairings from the specified round robins and knockout slots; show dates as TBA and Windhoek for Super Series.
- [x] Confirm the interface data contains 3 + 30 + 21 + 3 fixtures and each Super 7 slot has six opponents.
