# Run: Surface telescope eyepiece

Status: accepted for pull request
Date: 2026-11-23

## Objective and scope

Revise [issue #3](https://github.com/StaringSnake/claynetarium/issues/3) from preset zoom buttons to an explicit Earth/lunar telescope with continuous scroll and pinch zoom. Work stayed in the normal `feature/surface-telescope-zoom` checkout at `d9d8499`. Unrelated local harness and planning edits were preserved. No work on issue #4, commit, push, merge, or deployment.

## Implementation and decisions

- `index.html`, `styles.css`, `src/app.js`: Telescope/Exit disclosure and labeled native range, centered CSS aperture and rim, and continuous 1×–8× focal-length input. The existing sky projection and occlusion are unchanged.
- Wheel zoom uses normalized vertical deltas over the active scene only. Pinch uses the change in separation from the start of the pinch; it does not aim the camera, and the remaining finger cannot aim until all contacts lift. A new single-finger drag still aims.
- Outside telescope mode the sky uses normal 1× framing. Reopening recalls the last setting at the same observer, including after orbit; a different observer or world resets it. Escape exits when focused on the view or its telescope controls.
- `README.md`, `tests/browser.test.js`: usage and browser acceptance for controls, rendering, gestures, fallback, and mode transitions.

## Independent review fixes

- Browser trackpad pinch may arrive as Ctrl+wheel. The active telescope scene now handles it like ordinary wheel zoom and cancels the default there only. Controls, inactive sky, and orbit leave Ctrl+wheel to the browser. Command/Meta is not a pinch signal and is not captured; unmodified orbit zoom is unchanged.
- Hiding focused telescope controls now moves focus to the viewport when the whole group disappears, or to the Telescope button when only the slider closes. Unrelated focus is untouched by the telescope; Escape retains its existing return-to-button behavior, and rides retain their existing transition focus.
- Both regressions were reproduced before the fix: a Chromium Ctrl+wheel reached the page uncanceled, and a real lift-off left the scene unfocused after hiding the focused slider. Both focused tests now pass alongside the existing keyboard Escape path.

## Review handoff

- `npm test`: 16 model/playback tests passed.
- Initial eyepiece verification with `TELESCOPE_SCREENSHOTS=node_modules/.review npm run test:browser`: static build and 23 tests passed in headless Chrome 157. The suite exercises wheel and touch at intermediate zoom, telescope entry and exit, keyboard slider, fit and target sizes, unchanged aim on pinch, orbit gestures, ordinary page scrolling, world/observer changes, and renderer fallback.
- After review fixes, `npm test` and `TELESCOPE_SCREENSHOTS=node_modules/.review npm run test:browser` passed again: 16 model/playback and 25 browser tests, including the build and both regressions.
- Desktop and portrait screenshots were visually inspected at 2.25× (wheel) and 2.4× (pinch). Both show a centered circular sky, thin rim, dark surround, and unobstructed controls. Pixel comparisons at 1× verify unfiltered center samples and opaque diagonals.
- `node --check src/app.js`, `node --check tests/browser.test.js`, and `git diff --check`: passed. No configured type or lint command.

Browser evidence is headless Chrome, including emulated touch and Ctrl+wheel input rather than physical phone or trackpad hardware. Other engines and assistive-technology speech were not checked.

## User-feedback revision: optical distortion and 32×

- Kept the existing scene and aperture dimensions; resizing is deferred to issue #4. Magnification is continuous from 1× to 32× using the existing controls and gesture rates.
- The Canvas 2D pincushion curves the horizon and constellation lines and displaces star and planet positions. The Sun, Moon, lunar Earth, and regolith use warped paths; labels follow their anchors but the text is not warped. Sky clipping and ground fill share the same horizon path. A slight rim falloff is aesthetic only. See [ADR 0007](../adr/0007-distort-eyepiece-geometry-in-canvas.md).
- The WebGL-disabled browser test compared both modes at the same 1×: the centered solar pixels were unchanged, the off-center Sun shifted outward by 12.2 CSS px, and the horizon curved by 9 px between center and ±63% of the aperture radius, with no gaps in the sampled ground columns. The tests cover the 32× clamp via keyboard, wheel, and touch; the existing orbit journey still zooms independently and restores the saved 23.35× surface setting.
- `npm test` passed 16 model/playback tests; `TELESCOPE_SCREENSHOTS=node_modules/.review npm run test:browser` passed the build and 26 browser tests. With the same test and controls but the undistorted renderer substituted, the geometry test failed as intended: all three sampled ground columns began at pixel 384.
- Visually inspected `telescope-desktop-2.25x.png`, `telescope-desktop-32x.png`, `telescope-portrait-2.4x.png`, `telescope-portrait-32x.png`, and `telescope-desktop-horizon-1x.png` in ignored `node_modules/.review/`. The horizon bends continuously into the rim; the centered solar disk stays round and its label is legible on the phone. Lunar Earth fills the desktop field at 32×, so only part of the disk and terminator are visible; its full-disk phase is verified at 8×. The controls stay visible without enlarging the footprint.
- Local redraw microbenchmark on an Intel i7-9750H using Chrome 157 software Canvas 2D with a one-pixel readback to flush. Each row used 40 warm-ups and 240 redraws alternating daytime Sun, nighttime stars, near-horizon, and lunar Earth views while panning. Baseline was the `d9d8499` renderer at the same magnifications, including calling it directly at 32×. Times are in milliseconds; browser layout, compositing, and physical phone performance are not represented. Script and raw results: `node_modules/.review/measure-eyepiece.mjs` and `eyepiece-optics-timings.txt`.

| CSS canvas / backing DPR | Magnification | Before p50 / p95 | After p50 / p95 |
| --- | ---: | ---: | ---: |
| 1156×486 / 1 | 1× | 1.2 / 1.4 | 1.2 / 1.4 |
| 1156×486 / 1 | 4× | 1.2 / 1.4 | 1.1 / 1.3 |
| 1156×486 / 1 | 32× | 1.5 / 1.8 | 1.1 / 1.3 |
| 366×312 / 2 | 1× | 1.1 / 1.6 | 1.1 / 1.3 |
| 366×312 / 2 | 4× | 1.3 / 1.6 | 1.0 / 1.2 |
| 366×312 / 2 | 32× | 1.1 / 1.4 | 0.9 / 1.1 |

The measured renderer did not slow down at 32× in this workload. Bounds on work come from fixed path sampling and pruning constellation chords outside the field, not from lowering resolution or changing the scene size.

Cumulative issue #3 diff from `870b2fd`: `node_modules/.review/telescope-issue-3-cumulative.patch`. Local changes since `d9d8499`: `node_modules/.review/telescope-issue-3-working.patch`. Both exclude unrelated harness and planning edits.

## Review follow-up: Sun and Moon label anchors

The checkout's Sun/Moon loop already used the raw result of `project(v)` at the reported line; the point-source planet and star loop maps the center once and applies a screen-space text offset. Renamed the disk center to `projected` and made the label's pre-lens limb explicit so it cannot be confused with a mapped center. The ordinary 1× path keeps the original label offset.

The new browser regression samples actual Moon disk and label pixels at ordinary 1× and two off-axis positions at 32×. It excludes pixels hidden by the rim. The prior checkout passed as written; with a second warp injected into the built bundle only, the near-rim label gap reached 14 px and only five solid label pixels remained inside the aperture. The expected gap is 5–10 px. The test passes with the single mapping.

Follow-up verification: `npm test` passed 16 tests; `npm run test:browser` passed the build and 27 tests in Chrome 157. The focused Moon label test, `node --check` on both changed JavaScript files, and `git diff --check` passed. The cumulative and working patches were regenerated.

## Final review and independent local acceptance

- General review: **APPROVE**, including the rim-label follow-up. Performance review: **APPROVE**, unchanged by the focused label fix. Both review verdicts were received through the conductor handoff.
- Independent local verification: **PASS**. Before this journal update, the nine issue files reproduced the reviewed cumulative patch against `870b2fd` byte for byte. `npm test` passed 16 tests, `npm run test:browser` built the site and passed 27 tests, and JavaScript syntax and diff whitespace checks passed.
- Browser assertions covered the aperture, fixed optical axis and curved horizon, Moon label spacing at the rim, fractional wheel and touch pinch zoom bounded at 32×, keyboard zoom and focus restoration, unchanged paused observer and clock readouts, running playback, far-side occlusion, and independent orbit zoom.
