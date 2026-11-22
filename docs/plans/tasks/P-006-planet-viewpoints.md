# P-006 · travel: scope viewpoints at other planets

**Status:** Discovery · **Size:** S (spec only) · **Labels:** feature, travel · **Epic:** [Backlog](README.md)

## Goal
Decide which remaining planetary viewpoints to support and how the Sun and Earth should look from them.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#out-of-scope) lists other planets as a follow-up. No destination list or implementation spec is approved.

## Tasks
- [ ] Choose the next planet and its first viewpoint. Do not present a giant planet as having a solid landing surface.
- [ ] Decide how navigation, clock state, apparent size, illumination, and visibility carry across destinations. Reuse the guided clay rocket to arrive and leave: plant the cheese flag at a surface landing or unfurl it from the rocket at an orbit-only stop.
- [ ] Write a spec for one destination first; leave further planets as later slices.

## Acceptance criteria
- The reviewed proposal names the first destination, viewpoint, travel behavior, and which effects are modeled versus illustrative.
- It defines a reference comparison for the Sun and Earth and explains what visitors see if either is behind the horizon or outside the view.

## Dependencies
Needs a destination choice. Recommended after P-004 and P-005 design so their travel interaction can inform it.

## Flags
Unrestricted free flight is not assumed. No migration or security change.
