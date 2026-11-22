# Run: Cheese fallback

Status: Cheese fallback implemented and verified locally on `feature/cheese-fallback` from `c9b0d3b`. Implementation left uncommitted and unpublished for review.

## Baseline
- Root commit `c9b0d3b08115f3cbafc626984a0ecf9cc9cf0f02` (`feat: add Earth Sky planetarium`) is on `druewilding/planetarium`, branch `feature/earth-sky`. The normal push succeeded and `git ls-remote --exit-code origin refs/heads/feature/earth-sky` returned the same hash.
- The baseline includes the existing application, tests, glossary, specs, ADR, and Earth Sky journal. The cheese spec was included as-is; its gate line still says “spec awaiting approval,” although the delegated task records user approval.
- Staged whitespace and secret-pattern checks found no issues. The prior Earth Sky journal records six model tests, four headless Chrome tests, a successful static build and syntax checks, and no findings from `npm audit`. These checks were not rerun for the commit and push.
- No push, PR, or deployment for the cheese increment. This journal remains untracked with the implementation.

## Implementation and evidence
- Startup uses a procedural Canvas 2D wheel interior with perspective, curved walls, a floor and ceiling. Pointer drag, touch and keyboard look-around use the same renderer with or without WebGL 2. ADR 0002 records the tradeoff.
- The observer and clock are unset until explicit geolocation, city/coordinate/globe selection, or the Reykjavík demo succeeds. A preview globe has no observer marker, local sky, or clock. Manual and demo selections invalidate any pending request; the browser call itself is not cancellable. Valid coordinates and local search results are not transmitted or persisted by the app.
- `npm test`: six model tests passed. `npm run test:browser`: static build plus seven Chrome tests passed on the Pages-style project subpath, including all existing sky/globe journeys, startup with browser permission, no-WebGL exits, privacy, async failures, and stale callbacks. Location success used Chromium's emulated location provider; failure tests used deterministic browser API stubs. `node --check` on changed JS and `git diff --check` passed; `npm audit` found zero vulnerabilities.
- Inspected desktop and iPhone 13-sized Chrome screenshots, including a turned view with WebGL 2 disabled. Verified no horizontal overflow, keyboard and touch input, and contrast of the startup text/action palette (minimum 9.13:1 across sampled pairs). No physical phone, Safari, Firefox, or screen reader was tested.
- Minified bundle grew about 3.8 kB (686,301 bytes at baseline; no extra runtime requests). The CPU raster is capped at 640×360 and draws only on input, resize, or view change; checks on a desktop with phone emulation are not a low-end handset performance claim.

## Review and P2 follow-up
- The general and security reviews approved the feature. Performance review was selected for the render hot path. The specialist was unavailable; fallback review reported P2 at `src/cheese-view.js` because both procedural textures were baked synchronously during startup, before the controls were wired and before the first cheese frame.
- **Fixed:** scale decorative grain by atlas area (1,024 wall flecks and 576 cap flecks instead of 4,200 each). This removes work rather than moving the same bake into the first frame. The atlas sizes, recessed-eye count, render loop, and controls are unchanged. The tradeoff is a sparser surface texture.
- The WebGL-disabled browser journey now counts offscreen Canvas 2D ellipse calls through the first rendered view, under a 2,000-call budget. On the pre-fix working tree, `npm run build && node --test --test-name-pattern='WebGL unavailable' tests/browser.test.js` reproduced P2 with 8,650 calls. The fixed working tree made 1,854 calls (78.6% fewer). This is an operation count, not an end-to-end timing claim.
- After the fix, `npm test` passed six tests, `npm run test:browser` built successfully and passed seven Chrome tests, and `node --check` on the changed JS plus `git diff --check` passed. Fresh desktop and iPhone-sized/no-WebGL captures still show a recognizable wheel interior and unchanged exits without horizontal overflow. No new physical-device measurements.
