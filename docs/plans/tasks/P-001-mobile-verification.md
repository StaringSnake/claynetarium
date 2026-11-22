# P-001 · release: verify the core journey on physical phones

**Status:** Open · **Size:** S · **Labels:** chore, mobile, release · **Epic:** [Backlog](README.md)

## Goal
Verify the cheese, sky, and globe on hardware. Chrome touch emulation does not establish Safari compatibility or real-device performance.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#acceptance-criteria) #8 and mobile-rendering risk; [Cheese fallback](../../specs/cheese-fallback.md#acceptance-criteria) #2–3.

## Tasks
- [ ] Select reference iPhone/Safari and Android/Chrome devices and agree on a frame-time target.
- [ ] Exercise cheese look-around, permission grant and denial, demo and manual selection, date scrubbing, lift-off, pinch/orbit, and return. Record devices, versions, and timing results.

## Acceptance criteria
- A repeatable device matrix records pass, fail, or untested for every journey, plus measured timing against the agreed target.
- Check that location denial leaves the exits usable and that a missing WebGL 2 context gives a clear fallback. Link any unresolved failures.

## Dependencies
Blocked by access to reference hardware. Parallelizable with P-002 and destination discovery.

## Flags
Use consenting testers. Do not include personal coordinates in evidence.
