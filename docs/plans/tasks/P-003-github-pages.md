# P-003 · release: publish Earth Sky on GitHub Pages

**Status:** Needs release authorization · **Size:** S · **Labels:** chore, deployment · **Epic:** [Backlog](README.md)

## Goal
Give visitors a live HTTPS URL for Earth Sky and the cheese fallback, without a backend.

## Spec reference
[Earth Sky](../../specs/earth-sky.md#decisions) hosting decision and criterion #8. The existing local project-subpath test is not deployment evidence.

## Tasks
- [ ] Confirm repository access, the release revision, and the authorized Pages publication method for `druewilding/planetarium`.
- [ ] Build `dist/` from the lockfile; publish the approved output and document redeployment and rollback.
- [ ] Smoke-test cheese → demo → lift-off at the live project URL and verify asset and license links.

## Acceptance criteria
- The release loads at its HTTPS project URL and on reload with no backend, runtime keys, or automatic location prompt.
- Record the live URL, deployed revision, smoke result, and rollback steps.

## Dependencies
Blocked by explicit publication approval and a release revision that includes the cheese. Finish P-001/P-002 or explicitly accept outstanding release gaps.

## Flags
Public deployment and workflow permissions. No migration.
