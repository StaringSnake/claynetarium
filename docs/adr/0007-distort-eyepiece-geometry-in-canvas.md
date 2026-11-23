# 0007: Distort eyepiece geometry in Canvas 2D

Status: Accepted
Date: 2026-11-23
Author: Frontend Implementer

## Context

The surface telescope needs visible optical distortion near the rim without moving its aim, bending its text, or revealing objects below the horizon. It must still work without WebGL and keep redraw work bounded during gestures and playback.

## Decision

We will apply a monotone radial pincushion mapping to Canvas 2D scene geometry only in telescope mode. The ground and sky clip share a single sampled horizon, and labels use mapped anchors but remain unwarped.

## Alternatives considered

- CSS shading alone: changes color but not scene geometry.
- Canvas raster warp or WebGL postprocess: easier to apply to every pixel, but would warp text too unless rerendered; requires another image pass or renderer and complicates the fallback.

## Consequences

The center stays fixed and the same geometry controls where objects and the ground are drawn. Fixed path sampling bounds work independently of zoom and device pixel ratio, but new scenery has to explicitly use the mapping; the atmospheric gradient and text glyphs are not warped.
