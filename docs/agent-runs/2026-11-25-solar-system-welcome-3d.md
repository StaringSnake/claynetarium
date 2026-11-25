# Run: Revise #19 into a live 3D Solar System welcome

Date: 2026-11-25

## Objective and handoff

Conductor → Frontend Implementer: implement the approved revision of #19 on PR #26. The normal checkout and remote PR head both matched `ad2982f28b0af9414ecefc4e3c0c928fa0309223`. Read the revised issue, spec and plan; preserved unrelated checkout edits. No changes staged, committed, pushed, merged, or deployed.

## Changes and decisions

- `src/solar-display.js` and `src/solar-view.js`: share the existing WebGL renderer; draw Sun-lit spheres, procedural surfaces and Saturn's rings in perspective. Use a reusable radial display transform in a separate module for #22. No orbit paths or #20 camera animation/drag.
- `src/app.js`, `index.html`, and `README.md`: retain the welcome, picker, clock and existing Earth entry; use illustrated zoom ranges and show **Not to scale**. The astronomy, reference fixtures, Earth–Moon scale, globe, and travel implementations are unchanged.
- [ADR 0009](../adr/0009-illustrate-solar-system-in-perspective.md) supersedes ADR 0008. Framing covers Pluto on both axes, but perspective, conjunctions, enlarged bodies, and the welcome can hide some bodies or labels; the picker remains unambiguous.

## Verification and outcome

- `npm test` passed 19/19, including the original independent Horizons samples, display mapping and frustum checks. `npm run test:browser` built the static site and passed 38/38 on Chrome 158 with SwiftShader: rendered pixels and shading, desktop wheel, phone pinch and tap, keyboard focus, clock continuity, startup fallback, and existing true-scale Earth–Moon paths. Inspected screenshots of the welcome, full and inner views, and centered Saturn, Earth and Pluto.
- Local logs, captures, and the exact patch against PR #26's head: `.git/info/solar-system-welcome-3d/`. No native mobile picker, physical-device GPU timing, or screen-reader speech was checked.
- Frontend Implementer → conductor: checks passed, ready for independent code and visual review; no backend work required.

## Review and independent acceptance verification

- General and performance reviewers both returned **APPROVE** on the reviewed patch. The operations implementer acted as independent acceptance verifier. Before staging, local HEAD, the remote feature branch, and open PR #26 all pointed to `ad2982f28b0af9414ecefc4e3c0c928fa0309223`; the local and remote `main` base was `6b99d30cbc974b22fc62776dd2f5ce62619b561c`. Both reviewed patches reverse-checked against the checkout and produced the same staged tree (`a178522a6ce95043a9a3cab2fe74d67212fe5058`) in an isolated index. Unrelated checkout edits were excluded.
- Independently reran `npm test` (19 passed) and `npm run test:browser` (build succeeded, 38 passed) with Node 24.20.0 and Chrome/SwiftShader. Neither run had failures, skips, or retries. Compared the desktop full and centered Saturn captures and the phone welcome and inner captures with the independently executed pixel, shading, and framing checks: the scene is visibly 3D and marked **Not to scale**, with zoom from Pluto to the inner bodies. The suite also verified startup and reload without cheese, keyboard picker and dwarf-planet labeling, touch and wheel zoom, painted Earth entry, a usable WebGL-off fallback, and uninterrupted shared playback across dismissal, selection, and Earth entry.
- The unchanged astronomy and Horizons fixtures passed their pre-display vector comparison, including Pluto depth, and the existing physical Earth–Moon checks passed. Screenshots were reviewed from the implementer’s evidence; physical mobile devices, the native OS chooser, screen-reader speech, hardware GPU performance, and live JPL requests were not independently tested. No workflow or deployment changes were needed.
