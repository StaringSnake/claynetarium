# Earth Sky

A static planetarium for looking up from Earth and exploring the Earth–Moon system. Each visit starts inside a fictional wheel of cheese. Drag, swipe, or focus the view and use the arrow keys to look around. To see the real sky, choose **Use my location**, **Pick a place** (search built-in cities, enter coordinates, or place a globe pin), or **Try demo sky** (Reykjavík, no location request). If location is denied or unavailable, you can still pick a place or try the demo.

The first site opens the sky at the current instant. Later site changes keep the simulation instant, and a reload returns to the cheese. Location and searches are neither sent by the app nor stored between visits. If you explicitly request location, the browser or OS may use its own location service.

## Run locally

With Node.js 22+ and npm:

```sh
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000/>. Do not open the source HTML directly. `dist/` is the complete static output; its relative URLs also work under a project path such as `/planetarium/`. Browser location requires a secure context (HTTPS or loopback). The cheese interior and surface sky use Canvas 2D and do not require WebGL 2. Globe features, including globe pins, require WebGL 2.

Use the date dial or a date field for large jumps, and the time-of-day dial or time field for finer changes. Edits pause playback. Drag the sky or use arrow keys to look around; in globe mode, drag to orbit and pinch, scroll, or use the zoom buttons. In pin mode, click/tap Earth or use the viewport's arrow keys and Enter to pin the center. The orbit overview compresses the separation and enlarges the Moon; the default globe mode does neither. The surface marker and its label are annotations, not physical objects.

## Code map

- [`src/app.js`](src/app.js): browser entry point, controls, rendering, and travel.
- [`src/playback.js`](src/playback.js): simulation instant, speed, live/play state, and bounds.
- [`src/clock.js`](src/clock.js): civil-time conversion and formatting.

## Verification

CI runs on pull requests and pushes to `main`. The **Verify static site** job reports build and test failures in GitHub Checks and does not deploy. To reproduce it locally, use Node.js 24 and install Google Chrome:

```sh
npm ci
npm run build         # Produces the static site in dist/
npm test              # Deterministic playback, model, and reference fixtures
npm run test:browser  # Builds, serves under /planetarium/, runs headless Google Chrome
```

Set `CHROME_PATH` to use a nonstandard Chromium executable. Browser tests use one desktop viewport and a Chromium iPhone-sized touch emulation, not Safari or a physical phone. Run `npm audit` separately to check for dependency advisories. Independent fixtures in `tests/model.test.js` are from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [USNO Astronomical Applications](https://aa.usno.navy.mil/data/api); none of these services are contacted at runtime.

## Model and data limits

- The 22 built-in cities have hand-curated city-center coordinates and IANA zones. Globe pins, manual coordinates, and device coordinates use explicitly labeled UTC; worldwide civil zone lookup is not bundled. City offsets use the browser's `Intl` data, which can be incomplete for historical dates, and future laws can change. A zone change preserves the instant even if its new local date briefly falls outside the supported 1900–2100 edit range.
- Directions use a sea-level observer and standard refraction; solar events assume a level sea-level horizon and standard limb/refraction conventions. Terrain, elevation, and weather are not modeled, and grazing crossings are particularly sensitive. Illuminated fraction is geocentric, while apparent Moon diameter and center direction are topocentric. Comparisons are sampled, not a range-wide accuracy certification.
- The hand-curated star table contains 30 rounded J2000 positions and approximate visual magnitudes (individual astronomical facts; see the [SIMBAD object database](https://simbad.cds.unistra.fr/simbad/) for reference). It transforms precession and nutation but omits proper motion and annual aberration. The three constellation stick figures are schematic. Marker brightness is for orientation, not visibility prediction. Globe relief and lunar texture are not simulated.
- Land outlines are [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) public-domain data, version 4.1.0, via World Atlas `land-110m` (ISC distribution). Astronomy Engine and Three.js are MIT; TopoJSON Client is ISC. The build includes redistribution notices in `dist/licenses/` and `dist/app.js.LEGAL.txt`.

## Release to GitHub Pages

The expected URL is <https://staringsnake.github.io/claynetarium/> after an authorized deployment. Merging the workflow or pushing to `main` does not publish the site.

1. Before dispatching, obtain explicit release approval for a full commit SHA. An authorized maintainer must verify that **Settings → Pages → Build and deployment → Source** is **GitHub Actions**, and that the `github-pages` environment allows deployments only from the `main` branch (no tags) and has a required reviewer. Enable **Prevent self-review** and disallow bypassing protection rules. Do not dispatch if these protections are not in place.
2. Open **Actions → Deploy to GitHub Pages → Run workflow**, choose `main`, and enter the full approved commit SHA in `approved_sha`. The workflow stops before checkout if either the ref or SHA does not match. It uploads only `dist/` after build, model checks, and browser checks succeed.
3. Before approving the waiting **Publish static site** job, the required reviewer must compare the run's full commit SHA with the independently approved release SHA. Reject the deployment if they differ or the approval cannot be verified.
4. Once the deployment succeeds, use the job’s HTTPS URL and confirm it opens at `/claynetarium/`. Check that the wheel renders, **Try demo sky** opens the sky, and reload returns to the wheel. In the browser Network panel, confirm `styles.css` and `app.js` load from `/claynetarium/` without errors. Open `app.js.LEGAL.txt` and the four notices under `licenses/` (`astronomy-engine.txt`, `three.txt`, `topojson-client.txt`, and `world-atlas.txt`) relative to the project URL. Record the URL, deployed SHA, and smoke-test result in the release record.

To roll back, revert the bad change through the normal review process so that `main` restores the known-good site. Obtain release approval for the resulting full `main` commit SHA, then dispatch with that SHA and repeat reviewer approval and the smoke test. Do not dispatch from the previous tag or a rollback branch.

The static GitHub Pages build does not enforce an anti-framing policy: the HTML meta CSP cannot set `frame-ancestors`. Other sites can embed the page in a frame. If embedding must be blocked, use a deployment that sets `Content-Security-Policy: frame-ancestors 'none'` as an HTTP response header and verify the served response.
