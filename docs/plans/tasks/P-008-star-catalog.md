# P-008 · sky: scope a richer star and constellation catalog

**Status:** Proposed · **Size:** S (evaluation only) · **Labels:** feature, sky · **Epic:** [Backlog](README.md)

## Goal
Show more of the recognizable sky beyond the current 30 stars and three constellation figures without cluttering phone screens.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#acceptance-criteria) #6 covers existing controls, not catalog expansion. The [project README](../../../README.md#model-and-data-limits) documents current limits.

## Tasks
- [ ] Agree on the most useful stars and figures, label defaults, and magnitude limits.
- [ ] Evaluate redistributable datasets for attribution, size, proper motion, and label density.
- [ ] Propose a bounded first expansion and validation cases for accuracy, dimmer behavior, and mobile load.

## Acceptance criteria
- The proposal identifies the first subset, its license and size, and a measurable reference-phone performance check.
- Proposed tests preserve switches for labels and figures and horizon occlusion. Brightness assumptions are explicit rather than presented as calibrated realism.

## Dependencies
Implementation needs scope approval. Reuse P-001's reference phone if available. Parallelizable with P-007.

## Flags
Data-license review before bundling. No migration or security change.
