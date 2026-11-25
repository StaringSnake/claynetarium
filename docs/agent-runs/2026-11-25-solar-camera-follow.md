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

**Original follow-up verdict: hold merge.** [PR #27](https://github.com/StaringSnake/claynetarium/pull/27) was opened after the required suites passed, at `cff483b7d256067ab78602737f9757919041b3b2`. A later targeted phone run reproduced a flaky whole-viewport screenshot assertion at `tests/browser.test.js:436`, with and without screenshot export enabled. The Solar frame was identical: all 44,352 differing pixels were inside the Full system button. See `acceptance-round-trip*.log` and the [PR diagnosis](https://github.com/StaringSnake/claynetarium/pull/27#issuecomment-7171707591). [Hosted CI on the original head](https://github.com/StaringSnake/claynetarium/actions/runs/45680297904) passed setup, build and model checks; its browser step was still in progress at the original handoff.

## Test-only fix verification

Matched `tests/browser.test.js` byte-for-byte to the reviewed `acceptance-test-fix.patch` (SHA-256 `ca9cf4a7872cc0c28b65a5f14eb29f899d4978c11ec96032c968b75b21517113`) against `cff483b7d256067ab78602737f9757919041b3b2`. The fix hides only the zoom controls, only during the camera comparison screenshots; it preserves the target checks and byte-for-byte comparisons. Evidence inherited from the reviewed revision: removing rotation or allowing selection after drag each fails its camera assertion. One earlier full run hit the unchanged ride-before-orbit test's existing 35-second limit; that test passed on the original head in isolation and in the implementer's serial full rerun. No application or workflow changes.

**Independent local verdict: pass.** Serial rerun on Node 24.20.0 and Chrome 158: `npm test` 19/19, `npm run test:browser` build and 40/40 (including the atlas test in 16.5 seconds), and `node --test --test-name-pattern='Solar focus|phone Solar|mode-specific accessible' tests/browser.test.js` 3/3. Logs: `.git/info/solar-camera-follow/acceptance-rerun-*.log`. The screenshot hold is cleared only after hosted `CI / Verify static site` passes on the updated PR head; see the [PR check](https://github.com/StaringSnake/claynetarium/pull/27/checks) and [hold note](https://github.com/StaringSnake/claynetarium/pull/27#issuecomment-7171676923) for the hosted verdict.

**Post-push verdict: blocked; keep the hold.** On `d701734698e43cdd0606a80149094cd4a11b29ae`, an isolated run of the unmutated phone test still failed the round-trip assertion. All 44,352 differing pixels were again inside the Full system button. Chrome reported `style-src-elem inline` violations for Playwright's injected screenshot stylesheet, so the controls were never hidden under the real page CSP. See `acceptance-rerun-phone-isolated.log`, `acceptance-rerun-csp.log`, and the [PR finding](https://github.com/StaringSnake/claynetarium/pull/27#issuecomment-7172044950). [Hosted CI on this exact head](https://github.com/StaringSnake/claynetarium/actions/runs/45683251430) concluded failure: build and model checks passed, but GitHub reported the browser step canceled with no test result. Left this note unstaged; no more commits or fixes.

## CSP-compatible test fix

Verified `tests/browser.test.js` byte-for-byte against `acceptance-csp-clip-fix.patch` (SHA-256 `6f7afc1c03e89275db4eef667201f85998abe2ecd5259fb28e6d171c9a2e1d8d`) on the `d701734698e43cdd0606a80149094cd4a11b29ae` base. The screenshot crops to the scene above the bottom overlays without injecting CSS or changing CSP, controls, test inputs, or assertions. The reviewed screenshots show 0 changed scene pixels after the round trip and 162,228 after a one-way drag. Reviewed negative controls fail if rotation is disabled or a drag can select a body.

**Independent local verdict: pass.** Ran serially on Node 24.20.0 and Chrome 158 (SwiftShader and emulated touch): `npm run build`, `node --test --test-timeout=30000 --test-name-pattern='phone Solar' tests/browser.test.js` (1/1), `npm test` (19/19), and `npm run test:browser` (build and 40/40, including the atlas case in 15.1 seconds). No retries, skips, or cancellations. Logs: `.git/info/solar-camera-follow/independent-clip-*.log`. [PR #27 checks](https://github.com/StaringSnake/claynetarium/pull/27/checks) and the [hold note](https://github.com/StaringSnake/claynetarium/pull/27#issuecomment-7171676923) record the hosted gate; leave the PR unmerged pending user approval.
