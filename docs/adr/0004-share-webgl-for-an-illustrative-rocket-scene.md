# 0004: Share WebGL for a separate illustrative rocket scene

Status: Accepted
Date: 2026-11-22
Author: Frontend implementer

## Context
The guided flight needs readable stages, clear surface contact, and a close-up arrival gag. Physical Earth–Moon scale makes those views difficult to frame in one brief ride, and ride timing must not alter the observer or civil clock. Mobile browsers have finite WebGL context and framebuffer budgets.

## Decision
We will lazily build a separate perspective scene on the existing Three.js renderer and shared Earth map. The route uses body-local station normals, traveling along radial approaches and a shared lane at illustrative scale; only a successful or explicitly skipped arrival switches observers. The app will restore the globe buffer on exit and keep the ride's visual timeline separate from the simulation clock.

## Alternatives considered
- Stage the rocket inside the true-scale globe scene: couples close-up staging and playback to scale, observer picking and ephemeris rendering.
- Use a second renderer or prerendered movie: adds GPU context or media cost, and fixed media cannot stage the selected coordinates.

## Consequences
One context supports both 3D modes and no ride assets are fetched. A lost context affects globe and ride together; an interrupted trip leaves the observer at departure, and Return to Earth can take a static route when 3D is unavailable. The scene retains a bounded set of meshes after first use, adds first-flight setup cost, and its separate staging surfaces and light are not physical models. A slow browser can take longer to present the ride before handoff; the visitor may still skip it.
