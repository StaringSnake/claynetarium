# Lunar rocket run journal — 2026-11-22

## Status
Completed locally. General review approved with no remaining findings.

## Started
2026-11-22 on `feature/cheese-startup` at `ddc038933c961f8998ae6f48b9fa28809fe2a665`; created local `feature/lunar-landings` at the same revision.

## Objective
Implement and verify the approved [lunar-landings spec](../specs/lunar-landings.md): two surface stations, one shared simulation clock, site-specific sky and solar events, and skippable rocket travel and flag arrivals without losing the Earth location.

## Handoffs
- Conductor → frontend implementer: user-approved spec and local-only implementation/verification delegated explicitly.
- Frontend implementer → conductor: delivered the initial diff and evidence for read-only general review.
- Conductor → frontend implementer: add automatic normal-motion round-trip coverage and bring the spec gate and journal up to date. After general review approval, the conductor delegated journal-only closure.

## Decisions
- Use the pinned Astronomy Engine's IAU rotation and J2000 vectors; see [ADR 0003](../adr/0003-use-offline-lunar-topocentric-geometry.md) for conventions, verified Apollo coordinates and numerical tolerances. Horizons DE441/MEAN_ME references were retrieved using only public site coordinates, object IDs and dates; no local data was uploaded.
- Keep the selected Earth site in memory while traveling, change clock display rules at arrival, and do not re-anchor the simulation on a ride. An instant outside the destination range is preserved with an explicit pause/notice, not clamped. A solar jump pauses at the first second past the airless upper-limb crossing.
- Use a 2.4-second CSS/SVG ride, a noninteractive foreground flag vignette, and the same arrival for animated, skipped and reduced-motion trips. Keep the current Earth globe route and opt-in location controls intact.

## Changes
- Added the offline lunar observer, Earth disk/lighting and solar-event search (`src/lunar.js`); integrated it with the shared clock, globe actions and Canvas sky (`src/app.js`, `src/astronomy.js`, `src/sky-view.js`). Added ride, flag, landing actions and Field Notes in `index.html` and `styles.css`.
- Added independent Horizons fixtures, Node checks, and desktop/emulated phone journeys. Left the existing glossary, planet backlog and harness changes untouched. No Jupiter or other planet implementation.
- Review follow-up: added a bounded browser test that completes both legs without skipping, checks a flag at each arrival, and confirms the playing clock advances during and after each ride without moving backwards at arrival. Existing skip and reduced-motion tests are unchanged. Updated only the spec's approval marker; no requirement or production code changed in the follow-up.

## Verification
- Actual, 2026-11-22, on the uncommitted working tree above `ddc0389`: `npm test` passed 8/8 (Node v24.20.0). Earth direction, size, phase and projected Sun orientation met the fixture tolerances at both Apollo epochs. Far-side Earth was fully occulted at both epochs and near the locally sampled libration extreme. Both solar events at each site agreed within 5 minutes of the independent minute brackets; checks covered signs, strictly future results and the last supported date.
- `LUNAR_VISUAL_DIR=/var/folders/_r/p01z0x_55ts1x2jd71mcmnrh0000gn/T/opencode npm run test:browser` passed the static build and 9/9 Playwright Core tests on Chrome 157.0.8103.80 (desktop and iPhone 13 touch emulation). Tested keyboard and touch skip, uninterrupted accelerated playback, paused exact UTC/civil restore, both jumps, disabled boundary jumps, no WebGL and context-loss recovery, and existing startup/opt-in geolocation/Earth/globe regressions. The lunar journey made only the existing three static requests.
- Inspected `lunar-*.png` frames in the visual directory: clay shape readable at launch and touchdown; flag planted in the foreground on both screen sizes; Apollo disk at physical size; black sky and level cratered horizon on the far side. `git diff --check` passed. No separate lint or typecheck script is configured.
- Local model timing (200 warmed Node samples): lunar sky 0.078 ms mean, solar pair 1.735 ms mean; cache holds one pair per active station/time interval. Existing regression counters reported 1,854 startup texture ellipses and 20 globe samples in the simulated 100-frame, one-second workload. No real-device timing claim.
- Follow-up, actual 2026-11-22 on the uncommitted `feature/lunar-landings` tree above `ddc0389`: `npm test` passed 8/8; `npm run test:browser` passed the build and 10/10 Chrome tests, including the new unskipped Apollo 11 round trip at 60× playback and the existing skip/reduced-motion journeys. The new test uses bounded state waits, no fixed sleeps. `git diff HEAD --check` and the incremental diff check passed.

## Reviews
- General review requested direct coverage of both automatic arrivals and clock continuity during the unskipped normal-motion round trip. The general reviewer approved the incremental browser test with no remaining findings.
- Performance specialist unavailable. The general reviewer, acting as fallback, approved the bounded search and single-pair cache.
- No security reviewer needed: no new trust boundary or untrusted inputs, and existing opt-in geolocation behavior is unchanged.

## Risks And Blockers
No implementation blockers. The lunar geometry is an educational approximation with sampled reference coverage, not a precision ephemeris across 1900–2100. No physical phone, Safari, or Firefox verification was performed. The foreground flag is illustrative, not sky geometry.

## Outcome
Review closed. Only this journal changed at closure; no tests were rerun. No commits, push, deployment, external issues or additional reviewer calls.
