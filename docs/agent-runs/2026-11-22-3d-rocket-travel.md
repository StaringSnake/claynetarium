# 3D rocket travel run journal — 2026-11-22

## Status
Implemented locally; general review and its performance fallback approved with no findings.

## Started
2026-11-22 on `feature/lunar-landings` at `ddc038933c961f8998ae6f48b9fa28809fe2a665`, with the prior lunar work uncommitted.

## Objective
Implement the approved [3D rocket travel spec](../specs/3d-rocket-travel.md) without changing observer geometry, simulation timing, or true-scale globe behavior.

## Handoffs
- Conductor → frontend implementer: implement the approved scope, verify it locally, preserve the dirty working tree, and record evidence and review status in this journal.
- Frontend implementer → conductor: incremental patch, tests, desktop/phone recordings and phase screenshots for a single general reviewer.

## Decisions
- [ADR 0004](../adr/0004-share-webgl-for-an-illustrative-rocket-scene.md): use a separate illustrative scene on the existing Three.js renderer. Ground positions use selected body-local coordinates; radius, distance, lighting and terrain are staged for the ride only.
- Successful and skipped rides commit the observer at arrival. Reduced motion and skip go straight to the sky with a static flag. Context loss cancels at the current observer; from the Moon the user can explicitly request a static return after loss. The clock remains independent of ride scheduling.

## Changes
- `src/rocket-{view,models,set}.js`: lit sculpted rocket, perspective follow camera, Earth/Moon staging, landing contact and in-scene hatch, cheese alien, ballistic crumbs and rolled flag geometry. Removed the animated SVG rocket and flag-pop CSS; the static arrival illustration is used only for bypassed rides.
- `src/{app,globe-view}.js`, `index.html`, `styles.css`: regular Earth Travel and lunar Return to Earth, phase/route captions outside the canvas, keyboard focus on Skip ride, WebGL interruption notice, shared renderer and restored ordinary buffer sizing.
- `tests/browser.test.js`: normal manual-site round trip with controlled render frames and running clock, keyboard/touch skip, reduced motion and actual `WEBGL_lose_context` during the return leg. Updated the approved specs. No astronomy modules, ephemeris fixtures, harness, packages or permissions changed for this task.

## Verification
Actual on the uncommitted branch, Node v24.20.0 and Chrome 157.0.8103.80. `E` below is `/var/folders/_r/p01z0x_55ts1x2jd71mcmnrh0000gn/T/opencode/rocket-travel`.

- `npm test`: 8/8 passed (`model.log`). `npm run build`: passed, also run by `npm run test:browser`. `npm run test:browser`: 10/10 passed (`browser.log`, Chrome/SwiftShader). The normal-motion state test uses controlled RAF, not wall-clock performance; a first real-time SwiftShader run missed a phase, and an early skip path exposed a canvas-sample-before-paint test race. The scene now caps visual frame advances independently of the clock, and the pixel check waits for paint.
- `VISUAL_RUN=final node "$E/visual.mjs"` and `VISUAL_RUN=final node "$E/sheets.mjs"`: passed. With Chrome's default rendering and actual RAF, captured both full legs for desktop 1280×720 (Apollo 11) and iPhone 13 Chrome touch emulation (far-side equator; `innerWidth`×`innerHeight` measured as 390×664 during the ride). Both started at manual `35.681°, 139.767°`, used Travel and Return to Earth, never used demo or skip, and returned to the original coordinates with the paused instant `2025-01-06T00:00:00.000Z`. Desktop buffer 2250×720 on both legs; phone 549×468. Report JSON and `visual.log` record the capture details.
- The implementer captured and inspected the ordered flight and arrival sheets for all four recordings: launch pad/lift, coast with recognizable worlds, descent, feet on a pad, visible ejection and crumbs, partial-to-full flag before sky. The ship and gag stay in frame in those samples; planet limbs move out of the narrow framing in some shots. Captured full compositor sequences as offline scrub/play HTML; visual inspection was of sampled frames across each leg, not a live human playback review. The general reviewer could not view the media, so there was no independent visual inspection. See `$E/final/{desktop,phone}/{out,back}/` for `flight-sheet.png`, `arrival-sheet.png`, individual JPEGs, `sky.png` and `playback.html`.
- `git diff HEAD --check` passed at implementation handoff. `$E/incremental.patch` is the preserved implementation patch relative to the pre-task working tree, not HEAD; it includes new files and same-path modifications of existing untracked specs. Forward and reverse `git apply --check` validated selection against the local before snapshot and implementation handoff tree respectively. The patch does not include this review closure.

## Reviews
- The general reviewer approved with no findings. The dedicated performance reviewer failed to start due to model incompatibility. The same general reviewer performed the fallback performance review and approved with no findings. The performance trigger still applies: per-frame WebGL, a larger desktop buffer, first-use CPU/GPU work and retained resources. Early software-rendering checks were slow; hardware performance and repeat-ride memory remain unverified.
- No security review was performed because no security boundary changed: no new permissions, network, dependency, persistence, credential handling, trust boundary or raw HTML from site names. Browser regression observes only the three existing static GETs on the tested route.

## Risks And Blockers
- No implementation blocker. Physical phones, Safari/Firefox, low-GPU frame rate and first-use/repeat memory are open. Visual inspection samples one normal-motion lunar route per viewport and one manual Earth site, not all possible site/viewport combinations. Not all animation frames were visually inspected.
- The branch contains unrelated pre-task edits and untracked harness/doc/fixture paths. Do not select by `git diff HEAD` or `git add -A`. The five modified runtime/test files include prior work in `index.html`, `styles.css`, `src/app.js` and `tests/browser.test.js`; the two modified specs were already untracked. The patch supplies the exact task increment. No paths were deleted.

## Outcome
Local review closed with no findings. Only the journal and spec review status changed at closure; no checks were rerun and the evidence was preserved. No stash, stage, commit, push, deployment, harness change, or external issue.
