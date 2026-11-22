# Feature spec: 3D rocket travel and the cheese alien

## Goal
From the Earth location I actually picked, let me board a hand-molded clay rocket and watch it launch from there, fly through space, and touch down at the lunar site I chose. Then have the rocket poop out a cheese alien that bursts into a flag. Let me fly home from the normal interface without using the demo.

## Decisions
- Flight -> Replace the flat SVG ride with a guided, high-detail 3D flight at the selected origin and destination. Show launch, transit through space, descent, and actual surface contact in a continuous spatial journey; no steering. (source: user)
- Arrival gag -> After touchdown, the rocket poops out a clay cheese alien. The alien bursts into a cheese flag, which visibly unfurls in the landing scene. The flag is not a screen overlay. (source: user)
- Navigation -> Expose **Travel** from the regular Earth sky after selecting a real location, and **Return to Earth** from the lunar surface. The demo may share those controls but is not a prerequisite. (source: user)
- Supported routes -> Earth to Apollo 11 or the far-side equator, and either site back to the selected Earth location. Keep the existing lunar sky, event readouts, playback and clock rules. Keep all changes local. (source: user | existing code)

## Assumptions
- Use a third-person camera that follows the rocket and frames both the launch and landing. Both bodies should be recognizable from space; use a textured or detailed surface and a lit clay model with visible depth and molded details. The camera may change angles without teleporting the rocket. Needs confirmation before release: no.
- Use presentational distances, speed, and terrain for the ride; identify the sequence as illustrative. Both endpoints still use the selected site's position on its world. The existing true-scale globe and astronomy calculations are unchanged. Needs confirmation before release: no.
- Treat the burst as a cartoon puff of crumb-like pieces, not a violent effect. The planted flag remains visible through the arrival beat before handing control back to the sky. Reserve the orbit-only flag behavior for future destination specs. Needs confirmation before release: no.
- Target a 1280×720 or higher render buffer for a desktop viewport of at least 1280×720 CSS pixels where supported. Adapt rendering on phones and keep travel controls readable and usable. This target does not replace the visual check. Needs confirmation before release: no.
- Keep **Skip ride** available during motion. Skip or reduced motion bypasses both the flight and the burst, reaching the same destination with a static planted flag. If 3D cannot start or is lost mid-flight, preserve the observer and clock and explain what happened; never silently substitute the rejected flat animation. Needs confirmation before release: no.

## Out of scope
- Manual piloting, physical trajectory simulation, terrain-accurate landing sites, new destinations, and external publication.
- Changes to lunar reference calculations, existing location privacy, or automatic geolocation.

## Acceptance criteria
1. In a fresh session, pick a city or enter valid Earth coordinates without ever using **Try demo sky**. Open **Travel** from the Earth sky and choose either lunar site. From each lunar site, **Return to Earth** takes you back to the exact selected Earth site. Repeat the route with the other lunar site. Assert unchanged paused time, continued running time, lunar UTC, and restored Earth clock display.
2. Watch an unskipped outbound and return ride at normal motion. For each leg, capture launch at the selected origin, a midflight shot with the rocket traveling in 3D space, descent with the destination visible, and touchdown with the rocket resting on—not passing into—the surface. Scenes must use perspective and lit 3D geometry; moving a 2D rocket over changing backgrounds does not pass. Verify the desktop render-buffer target where supported, and inspect frames on desktop and a phone-sized viewport for clipping and readable framing.
3. At both kinds of surface arrival (Moon and Earth), inspect the unskipped sequence: rocket touches down, cheese alien visibly exits, alien visibly bursts, and the cheese flag visibly unfurls before the sky resumes. The alien, debris, and flag must share the landing scene's depth and perspective; checking only a final flag state does not pass.
4. Verify from keyboard and touch that skipping reaches the same destination and static flag without resetting the clock. With reduced motion, verify no flight, burst, or unfurl animation. With WebGL unavailable or lost during travel, verify a clear message, an intact observer and clock, and a usable interface.
5. The Earth sky, lunar sky and event-jump checks, opt-in geolocation, cheese start, and true-scale versus illustrated globe continue to pass. Record the normal-UI journey and visual evidence separately from automated state checks; leave any unverified item open.

## Impacted areas
- Earth and lunar travel controls, 3D trip staging and camera, arrival visuals, and browser acceptance checks. No backend, storage changes, or new permissions.
- Updates the travel controls and ride presentation in the [lunar landings spec](lunar-landings.md) when approved. Lunar observer geometry and solar-event behavior remain unchanged.

## Open risks
- **Visual quality:** Render resolution is measurable, but it does not establish that the clay material, camera or gag look good. Inspect the unskipped scene in both directions before calling it done.
- **Scale and mobile performance:** Interplanetary distances, terminal surface contact, and a close-up gag are hard to frame in one journey. Verify the result on a phone-sized viewport; physical-device performance remains unknown until measured.

GATE: user-approved; implemented locally; general review and performance fallback approved with no findings
