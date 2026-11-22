# 0002: Render the cheese wheel with a Canvas 2D raycaster

Status: Accepted
Date: 2026-11-22
Author: Frontend Implementer

## Context
The no-location view needs to look like the inside of one continuous wheel from mouse, touch, and keyboard input. It must remain usable when WebGL 2 is unavailable, and the static site has no runtime asset service or backend.

## Decision
Cast camera rays from inside a short cylinder and use Canvas 2D to display procedurally textured walls, floor, and ceiling. Redraw on demand at a bounded raster size. Reuse the existing WebGL globe for an observer-free pin preview, separate from the cheese and the simulation clock.

## Alternatives considered
- Use Three.js for the wheel and a separate non-WebGL fallback: duplicates art and interaction work for two versions of the same experience.
- Use a panoramic image or CSS illustration: avoids per-pixel scene math, but would need a new art asset or less convincing perspective and seams.

## Consequences
The same interior works regardless of WebGL support and ships without image downloads or additional dependencies. The CPU performs raycasting on the main thread while looking around; the capped raster trades sharpness for bounded work, especially on high-DPI displays. Without Canvas 2D the scene cannot be drawn, but the exit controls remain usable.
