# P-007 · Earth clock: evaluate offline time zones for arbitrary locations

**Status:** Proposed · **Size:** S (evaluation only) · **Labels:** feature, clock, privacy · **Epic:** [Backlog](README.md)

## Goal
Determine whether pins and raw coordinates can show reliable civil time without contacting a location service. They currently use labeled UTC.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#assumptions) civil-time assumption and criterion #2; [ADR 0001](../../adr/0001-model-and-render-static-earth-sky.md) records the current fallback.

## Tasks
- [ ] Evaluate an offline coordinate-to-IANA data source for license, bytes, coverage, and lookup performance.
- [ ] Check inland, border, ocean, and unresolved examples; document historical zone and browser `Intl` limits.
- [ ] Recommend adopting or deferring the data. If adopting, propose a follow-up implementation spec.

## Acceptance criteria
- The evaluation documents source, license, footprint, and reproducible location cases. Unresolved locations retain explicit UTC without a nearest-city guess.
- Any proposed approach preserves the simulation instant and does not transmit or persist coordinates.

## Dependencies
Implementation needs approval to extend the UTC behavior. Parallelizable with P-008.

## Flags
Privacy-sensitive location data. Revisit ADR 0001 if a dataset is adopted.
