# 0003: Use offline lunar topocentric geometry

Status: Accepted
Date: 2026-11-22
Author: Frontend implementer

## Context
The two lunar stations need their own rotating frame, Earth phase, and airless solar crossings. Astronomy Engine 2.1.19 supplies J2000 vectors and an IAU lunar rotation axis and prime meridian, but its observer and rise/set APIs are Earth-specific. Horizons supplies independent airless topocentric readings in an east-positive high-precision lunar mean Earth frame (MEAN_ME).

## Decision
We will rotate an east-positive spherical surface station into J2000 with `RotationAxis(Moon)`, subtract its offset, and project Earth and Sun onto local east/north/up axes. Before implementing, set reference tolerances to 0.15° altitude, 0.5° circular azimuth away from the vertical singularity, 0.01° diameter, 0.2 percentage points illumination, and 5 minutes for a solar crossing. Search offline for the first UTC second on the new side of the level horizon, using the geometric solar upper limb, no refraction, and no terrain.

[NASA's LRO-derived site table](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) gives the Apollo 11 lunar module at 0.67416° N, 23.47314° E in the Mean Earth/Polar Axis system. The illustrative far-side station is 0°, 180° E; both stations use zero elevation above the 1737.4 km spherical reference surface. The projected Sun direction check also uses 0.5° tolerance; fixture provenance and timing brackets are in `tests/fixtures/lunar-horizons.js`.

## Alternatives considered
- Invert the geocentric Moon phase or lock Earth in the sky: loses libration, topocentric parallax and the lighting direction.
- Ship a high-precision lunar orientation kernel or call online Horizons: adds data/dependency or network overhead to a static app.

## Consequences
Positions and contacts are educational estimates, not mission ephemerides. The IAU approximation and geometric vectors omit apparent aberration, light-time and other small corrections; a spherical Earth gives a single angular diameter rather than an oblate limb. Reference tests cover selected epochs, not the whole date range. A trip changes the display clock but never clamps the instant: if the new civil/UTC range excludes it, playback pauses with an explanation until a supported date is selected.
