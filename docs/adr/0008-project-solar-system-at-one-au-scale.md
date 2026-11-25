# 0008: Project the Solar System at one AU scale

Status: Superseded by [0009](0009-illustrate-solar-system-in-perspective.md)

Date: 2026-11-24

Author: Frontend Implementer

## Context

The welcome map must span Pluto's orbit and separate the inner planets without distorting distances. The existing local Earth–Moon globe uses a different frame, scale, and purpose. The map must work in both portrait and landscape and should not allocate a second WebGL context.

## Decision

Use Astronomy Engine's geometric heliocentric vectors in the fixed J2000 ecliptic frame, in AU, and show them with a face-on orthographic camera on the existing renderer. Subtract the camera target before sending coordinates to the renderer and use one AU-to-pixel ratio in both axes at every zoom; screen-sized dots and optional labels are only annotations.

## Alternatives considered

- Perspective: different depths would have different apparent scales and would tie framing to clipping and orientation.
- Compressed distances or enlarged model-space bodies: easier to see everything at a glance, but would obscure the very distance relationships the map teaches.
- Reuse the local Earth-relative globe scene: mixes heliocentric AU with Earth radii and couples the welcome with local surface and ride resources.

## Consequences

Pluto fits across orientations while zoom reveals the inner planets without any distance remapping. The map shows projected separations in the ecliptic plane, not the full 3D distances, and the inner bodies initially overlap at full scale. Future orbit guides should use the same astronomical frame; 3D visualization or physical body sizes would require separate treatment.
