# Feature spec: Lunar landings and lunar sky

## Goal
Lift off from Earth in a funny Play-Doh-style rocket, choose a lunar landing site, and plant a cheese flag on arrival. Watch Earth change phase from Apollo 11, see why Earth isn't visible from the far side, and jump to a lunar sunrise or sunset. Take the rocket back without losing the Earth location you started from.

## Decisions
- Landing sites -> Two guided choices: Apollo 11 on the near side and one far-side site. (source: user)
- Travel -> Choose a landing site from **Travel** in the regular Earth sky. **Return to Earth** on the Moon goes back to the selected Earth surface location. Playback continues if running and holds the exact instant if paused. Globe exploration remains a separate action. (source: user | [3D rocket travel](3d-rocket-travel.md))
- Rocket ride -> Use a hand-molded, Play-Doh-style rocket for guided travel and departures from each supported world, starting with Earth and the Moon. Show a short, funny sequence rather than requiring steering. (source: user)
- Cheese flag -> After surface contact, a clay cheese alien exits the rocket and bursts into crumbs as a flag unfurls in the landing scene. At future orbit-only stops such as Jupiter, unfurl the flag from the rocket instead of implying a landing. (source: user | [3D rocket travel](3d-rocket-travel.md))
- Clock -> Use explicitly labeled UTC on the Moon. On return, restore the Earth location's existing civil time or UTC fallback for the same instant. (source: user)
- Lunar sunrise and sunset -> Show the next of each event in UTC and let visitors jump to either. Use a level, airless horizon and a simple illustrated lunar surface, not a reconstruction of terrain. (source: user)
- Scope and delivery -> Build the Moon first, then scope Jupiter and other planets separately. Keep work local; no push, Pages setup, or deployment. (source: user)

## Assumptions
- Use documented Apollo 11 coordinates and a fixed far-side equatorial site nominally at 0° latitude, 180° longitude. Confirm coordinate conventions before choosing reference fixtures. Needs confirmation before release: no.
- Reuse the existing date/time controls and look-around inputs. The Moon has no Earth-style atmospheric glow; existing optional labels and constellation lines remain usable. Honor reduced motion by using an immediate transition. If the globe is unavailable, keep the existing Earth sky usable and explain why globe-based lunar travel is unavailable. Needs confirmation before release: no.
- Use a perspective 3D scene for launch, visible space, descent, contact and the flag gag. Skipping or using reduced motion still shows the destination and a static flag. This ride is illustrative, not the true-scale globe or an astronomy calculation. Needs confirmation before release: no.
- Display Earth's phase and apparent disk size and orientation as calculated from the site, not merely the inverse of a Moon phase icon. Earth below the horizon is not drawn; show an explicit visibility status. Treat the Sun's upper limb crossing the level horizon as the event, without refraction; document the convention. Needs confirmation before release: no.
- Show only strictly future events within the supported UTC date range. If no event is found before the supported boundary, show a clear message and disable that jump. A jump sets the simulation instant to the event and pauses using the same convention as manual time edits. Needs confirmation before release: no.
- Use offline astronomy and existing static build constraints; do not introduce accounts, location persistence, or runtime requests. Assess pinned library capabilities and independent reference availability before committing to a Moon orientation model. Needs confirmation before release: no.

## Out of scope
- Arbitrary lunar pins, free flight, historical landing reenactments, a trajectory with simulated travel time, terrain shadows, and lunar eclipses.
- Jupiter and other destinations, expansion of Earth time-zone or star catalogs, and publication.

## Acceptance criteria
1. From a selected Earth location, lift off and land at either named site. When paused, arrival and return preserve the exact simulation instant and restore the selected Earth site and its clock display. When playing, travel does not stop or reset the clock. Reduced-motion mode reaches the same destination without animation.
2. At Apollo 11, two independently referenced instants with materially different Earth illumination show different phases, with the lit side oriented toward the projected Sun. At those instants, verify Earth's topocentric altitude, azimuth, and apparent size. At the far-side site, sample the same instants and at least one libration extreme: Earth is below the horizon, no Earth disk is drawn, and the visibility status explains why.
3. At both sites, verify one upcoming sunrise and one upcoming sunset against independent topocentric solar positions using the agreed frame and limb convention. The reported event times are in UTC, and samples immediately before and after the event cross the horizon in the right direction. Selecting either event moves the clock to that event and pauses playback. At the upper date boundary, an unavailable event is clearly identified and cannot be selected.
4. A desktop keyboard or mouse and an emulated phone touch journey can choose a lunar site, look around, and return. Existing cheese startup, opt-in location, Earth sky, and true-scale versus illustrative globe behavior still pass their regression checks. Without WebGL 2, the app does not leave the visitor stranded in a failed transition.
5. For launch, transit, landing and the arrival gag in both directions, use the visual and browser acceptance checks in [3D rocket travel](3d-rocket-travel.md).
6. A keyboard- and touch-accessible skip control reaches the same site and preserves the clock, showing a static planted flag. Reduced motion also omits all ride animation. Neither route adds simulated travel time or resets the Earth location.

## Impacted areas
- Earth–Moon globe navigation, rocket and flag visuals, lunar observer geometry, sky rendering, clock display, and an offline search for solar crossings.
- Deterministic model checks for lunar position, phase, and events, plus one critical Earth → Moon → Earth browser journey. No new backend, schema, or permissions.

## Open risks
- **High — lunar frame and fixtures:** Verify east-positive longitude, pole orientation, and libration against independent lunar topocentric references. JPL Horizons lunar surface observer tables are a candidate for altitude, azimuth, and angular diameter; confirm available phase output and derive limb crossings from bracketed reference samples using the same convention. Set tolerances before implementation; no fixtures have been acquired or validated yet.
- **Medium — renderer and date bounds:** Confirm that an airless horizon and physically sized Earth disk remain readable on a phone. Validate Earth civil date boundaries against the lunar UTC bounds without clamping a preserved travel instant silently.
- **Medium — travel visuals:** Check that the full ride and static arrival both read clearly on a small screen without making the visitor wait to use the astronomy controls.

GATE: approved by the user for local implementation
