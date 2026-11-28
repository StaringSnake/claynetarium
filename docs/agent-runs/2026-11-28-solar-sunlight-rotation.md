# Run: Solar sunlight, axial rotation and faster playback (#29)

Status: verified for PR
Started: 2026-11-28

## Objective
Implement #29 against the approved lighting/clock criteria (AC3, lighting in AC4, AC5–6), without changing the astronomy positions, Earth–Moon orbit, camera behavior or travel.

## Handoffs
- Conductor → frontend implementer: implement, verify, and prepare the exact unstaged review diff and this journal. Live #29 read. Normal checkout only: `feature/solar-sunlight-rotation` from fetched `origin/main` at `ad80dbb9e219471788d9d120441669ceb9935252` (merged #28). No subdelegation; unrelated local edits kept.

## Decisions
- Approved spec: one Sun-centered light without distance falloff; faint ambient; luminous Sun; no new assets, eclipses or shadows. Keep the three existing rates and add fixed 1/7/30/365 day/s presets with labeled month/year approximations.
- Implementation: absolute J2000 ecliptic body bases from Astronomy Engine’s IAU elements plus Earth Greenwich apparent sidereal rotation. Sample positions and axes from the same instant with the existing 50 ms running gate and immediate paused edits; no intermediate ephemerides. See ADR 0012.

## Changes
- `src/{app,astronomy,solar-view}.js`: coherent samples, axial world transforms including Saturn’s equator, point/ambient lighting and independently luminous Sun.
- `index.html`, `styles.css`, `README.md`: shared Time select, duration labels, and fast-playback guidance.
- `tests/{model,browser,playback}.test.js`, `tests/fixtures/solar-rotation-spice.js`: independent axes, fixed-time lighting, playback, and regression coverage. `docs/adr/{0009*,0012*}` and this journal document the decision and evidence.

## Verification
- `npm test`: 26/26. Independent NASA/JPL NAIF SPICE frames at 2024-04-08 12:00 and 15:00 UTC for all ten Solar bodies (Earth ITRF93); maximum pole and prime deviations ≈0.00012° and 0.049°, 3-hour rotation differences <0.0001°. Retrograde Venus, Uranus, and Pluto check against prograde Mars. Existing independent Horizons fixtures pass.
- `npm run build`, `npm run test:browser` (45/45), `node --check` on changed JavaScript and `git diff --check` passed. No separate type or lint commands are configured.
- Controlled browser frames: average RGB day/night 133/35 and 139/38 for Mars, 156/49 and 156/47 for Pluto from opposite camera angles; Saturn ring Sun-facing face 82/88 versus unlit 54/54. The Sun is bright; outlines remain visible. All four rates advance exact durations in one controlled real second, changing rate preserves the anchor, Pause freezes, scrubbing reproduces the playback image at the same instant, Earth inherits the clock, and Now restores 1×. Boundary and Earth–Moon paths remain covered.
- Inspected actual Chrome/SwiftShader viewport captures at 1220×900 and 390×664 iPhone emulation. Desktop shows inward-facing crescents around a bright patterned Sun. On phone, Pluto’s dark limb stays discernible, Saturn’s two bands fit, and the Time sheet wraps the rate note above the dial without horizontal overflow. The native select is 123×44 CSS px in both captures with label and described-by help; note contrast is 9.13:1. Real-speed captures at 1 day/s show the Mars paint sliding left-to-right under a nearly stationary terminator; `screens/{desktop,phone}-spin-contact.png` track one visible surface patch into night in about 245–257 ms while the camera follows the planet.
- Benchmark: Chrome 158 / SwiftShader, warmed focused Mars with guides, 60 submissions per viewport and rate (3600×, 1 day/s and 365 days/s), base vs. current with identical rate inputs. One model sample per submission in both; 11 draws at slower rates and 7–12 where yearly movement changes culling. In both builds median gaps 63–64 ms, p95 65–67 ms; model+scene synchronous update and renderer submit p95 ≤1 ms with ~1 ms timer resolution. Node 24 warm sweep of 1,600 instants per repetition: position-only ≈47–48 μs/sample, added axes ≈4–6 μs/sample. GPU/compositor duration and physical phones were not measured.
- Review assets: `.git/info/solar-sunlight-rotation/` contains screenshots, probes, raw timing data, and `review.patch`; applying it to a scratch export of the exact base reproduces all 13 task files byte for byte.

### Independent acceptance (2026-11-28)
- Verified SHA-256 `2e114b781374168c248569ce71f240a08c9f1fcc577a4cba09b72cc1c97bef93`. Applied the patch in a temporary Git index rooted at `ad80dbb9e219471788d9d120441669ceb9935252` and matched all 13 working file blobs before adding this journal entry. No spec files or unrelated local edits are included.
- AC3 — The scene test confirmed one zero-decay point light at the rendered Sun, faint ambient, and no camera-facing fill. The browser reproduced the Mars and Pluto day/night contrast from both camera angles, clear Saturn ring-face contrast, visible night sides, and a bright Sun.
- AC4 (lighting) — Independently reran `npm test` (26/26) and `npm run test:browser` (45/45, including build, on Chrome 158/SwiftShader). Legacy Earth–Moon astronomy, orbit, landing, and rocket round trips passed. Recomputed the desktop and emulated-phone render-cost summaries from all 12 baseline/current traces; each had 60 model samples for 60 submissions, with no material timing or draw-count change at the benchmark's resolution.
- AC5 — Regenerated the ten-body vectors from the local NAIF SPICE kernels and matched the two fixture rows. Maximum pole/prime errors were 0.000113°/0.048588°; maximum 3-hour rotation difference was 0.0000021°. Paused camera movement leaves the axes alone and scrubbing back restores the same render. A fresh 1 day/s recording showed the same painted Mars patch crossing into darkness under a nearly stationary terminator on desktop and emulated phone.
- AC6 — With controlled time, the browser advanced exactly 1, 7, 30 and 365 days for one real second at each rate. Rate changes preserved the anchor; Pause held the instant; a scrub to the playback instant produced an identical frame; Earth inherited the clock; Now restored wall time at 1×. Legacy rates and date-bound behavior passed.

## Reviews
- General: APPROVE. The initial light-position finding was withdrawn: the rendered Sun is at the origin and the scene test asserts the light and Sun positions are equal.
- Performance: APPROVE on the exact review patch.
- Dedicated security review skipped: the patch does not change trust boundaries, credentials, permissions, dependencies, network runtime, or workflows.

## Risks And Blockers
- At 20 samples/s, spin above ~10 rotations/real-second is undersampled (earlier with dropped frames); fast playback can skip turns or appear reversed. Rates and sampled phases are not altered to smooth that out. Procedural surfaces are illustrative; flat ring faces dim near edge-on sunlight. Phone evidence is emulated, not native assistive technology or a hardware performance claim.

## Outcome
Local acceptance passed for #29. Delivery scope is the reviewed files plus this journal update, followed by a non-force push, PR, and hosted CI verification. No merge or deployment authorized.
