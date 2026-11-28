# 0009: Illustrate the Solar System in perspective

Status: Accepted
Date: 2026-11-25
Author: Frontend Implementer

Lighting amended by [ADR 0012](0012-sample-solar-orbits-and-spin-together.md).

## Context

Issue #19 replaces the true-distance, face-on marker map in ADR 0008 with a readable 3D welcome like Earth orbit. Pluto must fit on narrow screens without making the inner worlds disappear. The modeled positions, future orbit guides, and existing true-scale Earth–Moon mode need to remain independent of the welcome's presentation.

## Decision

Keep the J2000 ecliptic vectors in AU and apply a separate, origin-centered radial power mapping for display; #22 can use the same mapping for each guide sample. Render independently enlarged spheres and Saturn's rings in an oblique perspective from a separate scene on the existing renderer, framing a bounding sphere along the short viewport axis. Combine Sun-centered lighting with soft fill, and label the view **Not to scale**.

## Alternatives considered

- Keep the orthographic, AU-linear map: preserves projected distance ratios, but squeezes the inner worlds together and does not convey the intended depth.
- Spread bodies on a line or use per-body distance factors: easier to avoid overlap, but distorts directions or makes a common position mapping for guides harder to interpret.
- Load external planet textures: more detail, but adds asset weight and provenance requirements to a bounded startup change.

## Consequences

The display preserves heliocentric directions and radial order, not distance or size ratios; perspective and enlarged bodies can still produce overlap. The native picker remains available at conjunctions. Procedural paint and fill lighting are illustrative, not geographic or photometric data; Earth uses the existing clay material, with its atlas requested only on focus or through the existing orbit and travel flows. Earth–Moon scale, navigation, and the astronomy clock do not use this display transform.
