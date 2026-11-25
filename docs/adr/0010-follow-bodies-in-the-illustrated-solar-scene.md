# 0010: Follow bodies in the illustrated Solar System scene

Status: Accepted
Date: 2026-11-25
Author: Frontend Implementer

## Context

Visitors can follow a moving world from the picker or from its rendered surface. The existing Earth orbit has its own scale, interaction state and navigation; Solar System presentation and modeled positions are already separate under ADR 0009.

## Decision

Keep Solar camera orientation, framing and follow state independent of Earth orbit. Follow display-space positions, retreat and retarget at wide framing before approaching the live destination, and resolve clicks against the last painted meshes in nearest-surface order.

## Alternatives considered

- Reuse the Earth camera state: would couple illustrated navigation and true-scale Earth–Moon behavior.
- Pick by projected label or enlarged screen-space disc: easier to tap, but can select an occluded body or a gap in Saturn's rings.
- Fly directly between close-ups: does not give the requested overview context between targets.

## Consequences

One camera and the existing meshes serve both drawing and picking; no second render or hit test runs on animation frames. Small or fully occluded bodies can be difficult or impossible to tap, so the native picker remains the unambiguous keyboard and touch alternative. Reduced motion and a Sun reset skip the animated path. Manual rotation or zoom during the transition takes over immediately at the selected body.
