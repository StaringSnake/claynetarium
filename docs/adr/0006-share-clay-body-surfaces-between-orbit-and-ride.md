# 0006: Share the clay body surfaces between orbit and the rocket ride

Status: Accepted
Date: 2026-11-23
Author: Frontend implementer

## Context
Orbit and the rocket ride depict the same Earth and Moon but stage them at different sizes and under different lights. ADR 0005 kept separate legacy ride textures, which made the transition look like a change of props. Orbit picking and rocket station contact both depend on keeping the current sphere geometry.

## Decision
We will use one pair of matte materials and one on-demand atlas queue per renderer, whichever 3D scene is used first. Both scenes will render immediately with the shared flat colors and pick up the baked maps without replacing their geometry, lights, or camera choreography.

## Alternatives considered
- Keep independent maps with a matched palette: two sets of seams and impressions can drift, and the ride still pays for its own bake.
- Ship or eagerly generate clay maps: avoids the initial flat appearance but adds shipped assets or delays a visit that may never open either 3D scene.

## Consequences
Both scenes retain their own framing and lighting but depict the same coast seams, tool marks, and craters. A cold scene may show solid-colored bodies until the bake finishes; if an atlas fails, that body remains flat in both scenes while the other can finish. The existing four textures are still the only body atlases uploaded, and neither scene waits for the bake to start drawing. The broader relief stays cosmetic and still cannot change a silhouette.
