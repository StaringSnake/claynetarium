# 0005: Bake clay relief for orbit without changing the body meshes

Status: Accepted
Date: 2026-11-22
Author: Frontend implementer

## Context
Orbit needs recognizable raised continents and indented lunar craters under the existing moving Sun. Earth pin coordinates and both orbit scales must stay tied to the same body geometry, and the rocket must retain its existing Earth appearance. The site is static and offline-first, so orbit should not fetch additional assets.

## Decision
We will bake fixed-size, seeded color and bump maps for orbit on first use and apply them through Three.js's existing matte Lambert material. We will keep the existing World Atlas coordinate projection, wrap orbit coastlines at the antimeridian before baking relief, and retain the original gridded Earth map for the rocket on the same WebGL renderer as in ADR 0004.

## Alternatives considered
- Displace the body meshes or add continent and crater meshes: relief would affect the silhouette, and the pin surface would no longer match the visual surface without additional geometry or raycasting rules.
- Reuse the rocket's painted Earth and lunar textures: the Earth grid would remain, and the lunar highlights are painted rather than shaped by the orbit Sun.
- Evaluate the relief procedurally in the shader every frame: moves synthesis into the hot path and requires maintaining a custom material.

## Consequences
Picking, framing, physical body sizes and light sources stay unchanged. The app retains two 1024×512 color maps and two single-channel relief maps once both bodies have been drawn, about 7 MiB of GPU texture storage with mipmaps, plus CPU backing arrays. First use incurs a synchronous bake, and bump detail cannot alter the silhouette or cast shadows. The lunar impressions are stylized, not a catalog of named craters.
