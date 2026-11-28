# 0011: Sample fixed orbit guides from the Solar System ephemeris

Status: Accepted
Date: 2026-11-28
Author: Frontend Implementer

## Context

The illustrated Solar System needs recognizable, selectable orbit guides in the same reference frame and display scale as its bodies. Moving guides with the clock would add work and change hit targets during interaction. Review measured that sampling the guides in the browser delayed the first useful frame and that pointer bursts ran a full pick per event.

## Decision

At build time sample 256 points over approximately one sidereal period per body from 1900-01-01 UTC, close each curve with a chord, and pack the positions after the same display mapping as the live bodies. Bundle the asset offline; submit the bodies first and construct the depth-tested guides on a subsequent animation frame only if shown. Process the latest pending hover at most once per frame, sharing the pick rules with exact click and tap: screen-space tolerance, mesh priority, then frontmost guide and stable body order for depth ties.

## Alternatives considered

- Rotate or scale a stock ellipse: cheap, but detached from the ephemeris and easy to get wrong for Pluto.
- Resample around the current instant: closer to date-specific motion, but makes guides and their hit targets move and adds recurring sampling and uploads.
- Chunk the initial sampling in the browser: avoids a larger bundle but still costs 2,304 ephemeris evaluations on each visit and adds scheduling and partial-readiness states.
- Cache projected paths: not needed after coalescing hover; a cache would need camera and clipping invalidation and could diverge from click and tap.

## Consequences

Guides illustrate the modeled shape, not a predicted track; perturbations and the closure chord introduce small differences. The reference epoch lets Pluto's one revolution cover the supported edit range. Packing adds about 37 kB of uncompressed coordinate data to the bundle, with no extra request or browser guide sampling; decoding, instanced geometry creation and first GPU shader use still cost work after the initial bodies-only submission. Hidden guides have no draw calls or hit targets. The frame can recheck an existing hover as positions change, but processes it or the latest queued input, never both. The body picker remains available while guides are loading, hidden or crowded.
