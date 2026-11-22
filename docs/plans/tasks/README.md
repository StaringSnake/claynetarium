# Planetarium task backlog

Earth sky, guided lift-off, the Earth–Moon orbit overview, and the interactive cheese fallback are implemented. The cheese is committed on local `feature/cheese-startup`; it has not been pushed or deployed.

## First public release

- [ ] [P-001 · Verify the core journey on physical phones](P-001-mobile-verification.md) — S; needs devices
- [ ] [P-002 · Extend independent astronomy checks](P-002-sky-accuracy.md) — M; confirm targets before sign-off
- [ ] [P-003 · Publish to GitHub Pages](P-003-github-pages.md) — S; needs release authorization and a release revision

P-001 and P-002 can run in parallel. Resolve or explicitly accept their remaining gaps before public release.

## New destinations

- [ ] [P-004 · Scope lunar landings and the lunar sky](P-004-lunar-landing.md) — S; discovery
- [ ] [P-005 · Scope a Jupiter flyby and its four largest moons](P-005-jupiter-flyby.md) — S; discovery
- [ ] [P-006 · Scope viewpoints at other planets](P-006-planet-viewpoints.md) — S; discovery

Recommended build order: Moon → Jupiter → other planets. These tickets define what needs deciding, not approved implementation scope. Discovery can proceed alongside release work.

## Earth sky improvements

- [ ] [P-007 · Evaluate offline time zones for map pins and device locations](P-007-offline-time-zones.md) — S; proposed
- [ ] [P-008 · Scope a richer star and constellation catalog](P-008-star-catalog.md) — S; proposed

Brightness remains approximate. Unrestricted free flight and photometrically calibrated brightness are not first-release blockers; revisit them if the destination specs call for them. Sizes estimate only the ticket as written: S ≈ half a day, M ≈ one to two days. All IDs are local, not GitHub issues.
