# P-004 · Moon: scope lunar landings and the lunar sky

**Status:** Discovery · **Size:** S (spec only) · **Labels:** feature, moon · **Epic:** [Backlog](README.md)

## Goal
Plan a lunar surface journey where visitors can look back at Earth's phases and watch lunar sunrise and sunset using the shared simulation clock.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#out-of-scope) identifies this as a follow-up. No lunar implementation spec is approved.

## Tasks
- [ ] Decide landing sites, travel and return controls, lunar time display, and horizon/terrain fidelity.
- [ ] Identify representative references for Earth phases and position, Earth-hidden far-side visibility, and solar events.
- [ ] Write a lunar spec for approval before dividing it into implementation slices.

## Acceptance criteria
- The reviewed proposal defines an Earth → lunar surface → Earth journey, what happens to time during travel, and what is modeled versus illustrative.
- It defines reference cases for Earth illumination, horizon visibility, and lunar sunrise/sunset, and records any unresolved data or modeling needs.

## Dependencies
Product decisions are needed before implementation. Discovery can run alongside the release track.

## Flags
Assess whether cross-body observer modeling needs an ADR. No migration or security change.
