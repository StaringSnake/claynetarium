# P-005 · Jupiter: scope a flyby with the Galilean moons

**Status:** Discovery · **Size:** S (spec only) · **Labels:** feature, jupiter · **Epic:** [Backlog](README.md)

## Goal
Plan a space viewpoint near Jupiter where visitors can speed up time and watch Io, Europa, Ganymede, and Callisto.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#out-of-scope) lists Jupiter as a follow-up. No Jupiter implementation spec is approved.

## Tasks
- [ ] Choose entry and exit controls, viewing frame, playback speeds, and true-scale versus illustrative views. Reuse the guided clay rocket for arrival and departure; unfurl the cheese flag from the rocket at the viewing position. No surface landing.
- [ ] Identify candidate ephemerides and independent fixtures; decide whether transits, shadows, or eclipses are in the first slice.
- [ ] Write a Jupiter spec for approval before implementation breakdown.

## Acceptance criteria
- The reviewed proposal covers all four moons, shared-clock playback, and a viewpoint where their motion is readable.
- It defines independent position checks and explicitly includes or excludes event and scale behavior.

## Dependencies
Product decisions are needed before implementation. Coordinate shared navigation and clock behavior with P-004.

## Flags
Check ephemeris coverage, licensing, and ADR needs during design. No migration or security change.
