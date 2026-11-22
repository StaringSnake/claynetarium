# P-002 · astronomy: extend independent sky accuracy checks

**Status:** Open · **Size:** M · **Labels:** chore, astronomy, release · **Epic:** [Backlog](README.md)

## Goal
Extend the current sampled comparisons into a documented 1900–2100 verification matrix without claiming continuous certification.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#acceptance-criteria) #4–5 and its proposed numerical tolerances.

## Tasks
- [ ] Confirm targets and reference conventions for observer, time scale, horizon, limb, and refraction.
- [ ] Add independent fixtures near both date endpoints, in both hemispheres and at low and high latitudes. Reuse existing USNO and Horizons fixtures where they already cover a case.
- [ ] Document discrepancies and limits, including proper motion, historical civil time, and grazing solar events.

## Acceptance criteria
- Reproducible comparisons cover sampled directions, Sun and Moon apparent sizes, Moon illumination, and standard sunrise/sunset. Verify the illuminated side and waxing/waning orientation with documented reference geometry.
- Preserve coverage of polar day, polar night, and a one-crossing day. Record any coverage gaps and give missed tolerances their own follow-ups.

## Dependencies
Confirm numerical targets before sign-off. Parallelizable with P-001.

## Flags
No runtime astronomy service or new deployment requirement.
