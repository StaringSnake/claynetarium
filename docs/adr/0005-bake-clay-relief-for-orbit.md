# 0005: Bake clay relief for orbit without changing the body meshes

Status: Accepted
Date: 2026-11-22
Author: Frontend implementer

## Context
Orbit needs recognizable raised continents and indented lunar craters under the existing moving Sun. Earth pin coordinates and both orbit scales must stay tied to the same body geometry, and the rocket must retain its existing Earth appearance. The site is static and offline-first, so orbit should not fetch additional assets.

## Decision
We will bake fixed-size, seeded color and bump maps on orbit demand in short tasks between frames, then apply them through Three.js's existing matte Lambert material. We will keep the existing World Atlas coordinate projection, unwrap each orbit polygon and align its holes before rasterization, and retain the original gridded Earth map for the rocket on the same WebGL renderer as in ADR 0004.

## Alternatives considered
- Displace the body meshes or add continent and crater meshes: relief would affect the silhouette, and the pin surface would no longer match the visual surface without additional geometry or raycasting rules.
- Reuse the rocket's painted Earth and lunar textures: the Earth grid would remain, and the lunar highlights are painted rather than shaped by the orbit Sun.
- Evaluate the relief procedurally in the shader every frame: moves synthesis into the hot path and requires maintaining a custom material.
- Prebuild static maps or generate them in a separate worker: avoids main-thread synthesis but adds either shipped texture bytes and decoding or a second bundle and worker lifecycle.

## Consequences
Picking, framing, physical body sizes and light sources stay unchanged. The app retains two 1024×512 color maps and two single-channel relief maps after both are ready, about 7 MiB of GPU texture storage with mipmaps, plus CPU backing arrays. The bodies can appear as solid matte spheres until the first maps are ready, especially with reduced motion or slow hardware. Baking has a 4 ms target per task with bounded checkpoints, not a hard latency guarantee; upload and shader setup still occur on the rendering path. Bump detail cannot alter the silhouette or cast shadows, and lunar impressions are stylized rather than a catalog of named craters.
