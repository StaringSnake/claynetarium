# Run: Follow and orbit Solar System bodies (#20)

Date: 2026-11-25

## Objective and handoff

Conductor → Frontend Implementer: implement #20 and direct click/tap on visible bodies. Ordinary checkout, `feature/solar-camera-follow` from `origin/main` at `452fcf99f6a3fabd2b6e5e2717689c48a2d9648f`. Preserved the unrelated edits and local spec/plan. No staging, commit, push, merge, or deployment.

## Changes and decisions

- Picker and visible mesh selection share one follow action. Normal motion pulls back before approaching the moving target; reduced motion jumps directly. Drag/arrow keys orbit, pinch/scroll/buttons change distance, and selecting Sun restores the default wide framing and angle.
- Kept the illustrated camera and Earth orbit separate ([ADR 0010](../adr/0010-follow-bodies-in-the-illustrated-solar-scene.md)). Picking rays hit the nearest surface in the last rendered scene; drags, multi-touch and background do not select. The native picker remains available for keyboard navigation and hard-to-tap bodies.
- No change to ephemerides, observer, playback, visit flows, paths, assets or dependencies.
- Changed `src/app.js`, `src/solar-view.js`, `index.html`, `styles.css`, `README.md`, `tests/browser.test.js`, and the ADR/journal.

## Evidence and review

`npm test` passed 19/19; `npm run test:browser` built the site and passed 40/40, including the existing Earth orbit, surface, telescope, ride and fallback checks. The new cases measured the Sun shrinking from 144 to 22 CSS px during retreat, Jupiter staying centered while zoomed in and advancing five simulation days, and touch selecting a centered 140 px Venus in one frame under reduced motion. They also exercised nearest-surface selection at overlap, arrow-key rotation, drag/pinch rejection, resizing mid-transition, Sun reset, and entering Earth without resetting playback.

Logs, inspected desktop/phone screenshots and the scoped review patch are under `.git/info/solar-camera-follow/`. Browser evidence uses Chrome 158 and iPhone 13 touch emulation with SwiftShader; it is not physical-device, hardware performance, or screen-reader evidence.

Frontend Implementer → conductor: ready for independent code and visual review; no reviewer findings yet. Once reviewed, recheck the patch against the branch before staging. No backend work is needed.

## Independent acceptance and PR handoff

**Pass locally, no blockers.** Applied the approved `review.patch` (SHA-256 `cec0693940a5dec17b5f9f45e5fa39c1ed55589e589ebe20aeb737eb1427abf9`) to a temporary Git index at the base above and matched all eight files against the ordinary checkout before appending these notes. No app fixes or unrelated files were included.

- `npm test`: 19/19. `npm run test:browser`: build succeeded, 40/40. Fresh logs: `acceptance-unit.log` and `acceptance-browser.log` under `.git/info/solar-camera-follow/`; the implementer’s `final-browser.log` is corroboration, not the older `browser.log`.
- Direct mouse click, nearest visible surface, background rejection, emulated tap, and picker selection passed. Sun shrank 144→22 CSS px during retreat; touch reached centered Venus at 140 px in one reduced-motion frame. Drag changed the angle without changing the body; Jupiter stayed centered through zoom (226→278 px) and five simulated days. Touch drag and pinch did not trigger picks and zoom stayed centered.
- An independent Chrome probe (`acceptance-probe.mjs` in the same local evidence directory) matched the normal and reduced-motion Jupiter arrival pixels and the initial and reset Sun overview pixels after drag. The paused clock survived Solar gestures; playback instant and speed survived Earth entry. Tokyo coordinates, civil zone and UTC instant survived the legacy Earth orbit and return; the released navigation has no route back to Solar once an Earth observer is set, so there is no direct round-trip with an existing observer in Solar.
- Local evidence used Node 24.20.0, Chrome 158 with SwiftShader, and iPhone 13 touch emulation; it does not cover physical devices, Safari, hardware-GPU performance or screen readers. The PR should run hosted `CI / Verify static site` on the exact pushed head; no deployment is part of acceptance.
