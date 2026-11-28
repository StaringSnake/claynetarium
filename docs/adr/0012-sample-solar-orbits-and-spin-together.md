# 0012: Sample Solar System orbits and axial orientation together

Status: Accepted
Date: 2026-11-28
Author: Frontend Implementer

## Context

Issue #29 needs readable Sun-driven day and night as visitors follow and rotate around moving worlds. The illustrated positions and sizes of ADR 0009 are not a basis for physical irradiance. The shared clock must advance up to 365 simulated days per real second, far faster than the display can resolve every axial turn.

## Decision

Replace the directional fill of ADR 0009 with faint ambient light; make a zero-decay point light at the Sun the only source of directional illumination, and draw the Sun unlit. Compute absolute axial bases in the fixed J2000 ecliptic frame at the same shared instant as the existing position sample, using Astronomy Engine’s IAU rotation elements and Earth’s Greenwich apparent sidereal rotation. Orient only the Solar System world transforms, including Saturn’s equatorial rings, retaining the existing 50 ms running sample gate and immediate paused edits.

## Alternatives considered

- Integrate spin with the render delta or interpolate between wrapped angles: skipped time or an ambiguous shortest path can yield the wrong orientation or direction.
- Increase frame or ephemeris sampling with playback speed: expensive and still cannot resolve the highest presets at normal display refresh rates.
- Scale back fast body spins for legibility or light them from the camera: easier to see continuously, but either would misrepresent the shared simulation instant or the direction of the Sun.

## Consequences

The same sampled instant reproduces the same orientations and positions without stepping through skipped instants. At faster rates textures can strobe, appear to turn backward, or seem to stand still. The clay surfaces are illustrative, and neither the finite display spheres nor the diffuse ring faces model physical photometry, eclipses, or shadows. The Earth–Moon view and ride have separate scenes and keep their lighting and orientation behavior.
