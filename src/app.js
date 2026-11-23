import { skyAt, solarEvents, spaceAt, EARTH_KM, RAD } from './astronomy.js';
import { civilClock, dateText, timeText, offsetText, SECOND, DAY, FIRST_DAY, LAST_DAY } from './clock.js';
import { cities, coordinateSite, demo, findCities } from './places.js';
import { cheeseView } from './cheese-view.js';
import { globeView } from './globe-view.js';
import { skyView } from './sky-view.js';
import { lunarSites, lunarSkyAt, nextLunarSolarEvents } from './lunar.js';
import { createPlayback } from './playback.js';
import { rocketView, rideDuration } from './rocket-view.js';

const $ = id => document.getElementById(id);
const view = $('viewport');
const skyCanvas = $('sky');
const spaceCanvas = $('space');
const cheeseCanvas = $('cheese');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = degrees => (degrees % 360 + 360) % 360;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const SPACE_SAMPLE_INTERVAL = 50; // Real milliseconds; input and flight still render on animation frames.
const surface = { az: 180, alt: 12, magnification: 1 };
const WHEEL_MAGNIFICATION_PER_PIXEL = .005;
const PINCH_MAGNIFICATION_PER_PIXEL = .02;
const telescope = $('telescope'), telescopeToggle = $('telescope-toggle'), telescopeRange = $('telescope-range');
const telescopeControls = $('telescope-controls');
let telescopeActive = false, telescopeMagnification = 1;
const pointers = new Map();
let dragged = false, telescopePinch = null;
const cheese = { yaw: .38, pitch: -.02 };
const orbit = { theta: 0, latitude: 0, distance: 4.3, focus: 'earth', overview: false };
const options = { glare: 1, labels: true, lines: true };
const playback = createPlayback();
let site = null, clock;
let lunarSite = null, ride = null, arrival = false, lunarEvents;
let rocket;
let sky, skySecond, space, spaceInstant, spaceSampleTime, shownDay, shownSecond;
let pendingLocation = null, flight = null, mode = 'surface', pinning = false;
let width, height, dpi, desktopRideBuffer, dirty = true;
let resizeQueued = false;
let globePreview, previewFrame = null;

const panelToggles = ['location-toggle', 'time-toggle', 'travel-toggle', 'view-toggle'].map($);
const panelFor = toggle => $(toggle.getAttribute('aria-controls'));
let openPanel = panelToggles[0];

function showPanel(toggle, focus = true) {
  const previous = openPanel;
  if (previous) {
    previous.setAttribute('aria-expanded', 'false');
    panelFor(previous).hidden = true;
  }
  openPanel = toggle;
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'true');
    const panel = panelFor(toggle);
    panel.hidden = false;
    panel.scrollTop = 0;
    if (focus) panel.querySelector('.panel-close').focus({ preventScroll: true });
  } else if (focus && previous) {
    (previous.hidden ? view : previous).focus({ preventScroll: true });
  }
}

for (const toggle of panelToggles) {
  toggle.addEventListener('click', () => showPanel(openPanel === toggle ? null : toggle));
  panelFor(toggle).querySelector('.panel-close').addEventListener('click', () => showPanel(null));
}
document.querySelector('.observatory').addEventListener('keydown', event => {
  if (openPanel && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault();
    showPanel(null);
  }
});

function notice(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function noGlobe() {
  const interrupted = Boolean(ride);
  globe = rocket = null; mode = 'surface'; flight = null; globePreview = null;
  if (interrupted) cancelRide('3D was interrupted. You are still at the departure site and your clock was not reset.');
  showCompatibility();
  setPin(false);
}

const cheeseRenderer = cheeseView(cheeseCanvas);
const skyRenderer = skyView(skyCanvas);
let globe;
if (skyRenderer) {
  try { globe = globeView(spaceCanvas, noGlobe, () => { dirty = true; queuePreview(); }); }
  catch { globe = null; }
}
if (!globe) noGlobe();

function showCompatibility() {
  notice('compatibility', site && !skyRenderer ?
    'This browser cannot draw the sky. Time, location and object readouts are still available.' :
    !site && !cheeseRenderer ? 'This browser cannot draw the cheese interior. You can still choose a location.' :
    !globe ? 'The 3D globe needs WebGL 2. Lunar travel from Earth is unavailable; the Earth sky still works.' : '');
}

function updatePlaybackBounds() {
  return playback.setBounds(clock.resolve(FIRST_DAY).instant, clock.resolve(LAST_DAY + 1).instant - 1);
}

function advance(real = performance.now()) {
  if (playback.advance(real, Date.now())) {
    playButton();
    notice('clock-status', `Playback stopped at the supported ${lunarSite ? 'UTC' : 'local'} date boundary.`);
  }
}

function playButton() { $('play').textContent = playback.playing ? 'Pause' : 'Play'; }

function editClock(day, seconds) {
  if (!Number.isInteger(day) || day < FIRST_DAY || day > LAST_DAY || !Number.isInteger(seconds) || seconds < 0 || seconds >= 86400) return;
  const result = clock.resolve(day, seconds);
  playback.edit(result.instant);
  shownSecond = undefined;
  lunarEvents = undefined;
  playButton();
  notice('clock-status', result.adjusted ? 'That local time did not occur. Moved to the first valid local time.' :
    result.repeated ? 'That local time occurs twice. Showing the earlier occurrence.' : '');
}

function cancelLocation() {
  if (!pendingLocation) return;
  clearTimeout(pendingLocation.timer);
  pendingLocation = null;
  $('locate').disabled = false;
  $('locate').textContent = 'Use my location';
}

function selectSite(next, message = '') {
  if (lunarSite || ride) return;
  const firstSite = !site;
  if (firstSite || site.lat !== next.lat || site.lon !== next.lon) resetTelescope();
  // Capture the instant under the old clock before swapping civil rules.
  if (firstSite) {
    playback.startLive(Date.now(), performance.now());
    mode = 'surface'; globePreview = null;
  } else advance();
  cancelLocation();
  site = next;
  try { clock = civilClock(site.zone); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    site = { ...site, zone: 'UTC', fallback: true }; clock = civilClock('UTC');
  }
  if (!updatePlaybackBounds()) {
    playButton();
    notice('clock-status', 'The same instant falls just outside this location’s supported dates. Choose a date to resume.');
  } else notice('clock-status', '');
  shownDay = shownSecond = skySecond = undefined;
  updateSky();
  if (!flight && mode === 'surface') aimSky();
  $('site').textContent = site.name;
  $('coordinates').textContent = `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}°`;
  notice('location-status', message);
  setPin(false);
  if (firstSite) {
    for (const id of ['site', 'coordinates', 'time-toggle', 'sky-panel', 'place-picker']) $(id).hidden = false;
    for (const id of ['choose-site', 'pick-place', 'demo', 'cancel-place']) $(id).hidden = true;
    $('location-toggle').classList.remove('primary');
    if (openPanel === $('location-toggle')) showPanel(null, false);
    showCompatibility();
    updateReadouts();
    if (!openPanel) view.focus({ preventScroll: true });
    requestAnimationFrame(tick);
  }
}

function aimSky() {
  const object = lunarSite ? (sky.earth.visible ? sky.earth : sky.sun.altitude > 0 ? sky.sun : null) :
    sky.sun.altitude > -3 ? sky.sun : sky.moon.altitude > 2 ? sky.moon : null;
  surface.az = object?.azimuth ?? (site.lat >= 0 ? 180 : 0);
  surface.alt = lunarSite && !sky.earth.visible ? 18 : clamp(object?.altitude ?? 24, 8, 80);
}

function updateSky() {
  const second = Math.floor(playback.instant / SECOND);
  if (skySecond === second) return;
  skySecond = second;
  sky = lunarSite ? lunarSkyAt(second * SECOND, lunarSite) : skyAt(second * SECOND, site);
  if (mode === 'surface' || flight) dirty = true;
}

function updateSpace(real = performance.now()) {
  const { instant, playing } = playback;
  if (spaceInstant === instant) return false;
  if (playing && spaceInstant !== undefined && real - spaceSampleTime < SPACE_SAMPLE_INTERVAL) return false;
  space = spaceAt(instant);
  spaceInstant = instant;
  spaceSampleTime = real;
  return true;
}

function updateReadouts() {
  if (shownSecond === skySecond) return;
  const { instant } = playback;
  const { day, seconds, offset } = clock.parts(instant);
  const date = dateText(day), localTime = timeText(seconds);
  shownSecond = skySecond;
  $('local-clock').textContent = `${date} · ${localTime}`;
  $('local-clock').dateTime = new Date(instant).toISOString();
  $('zone').textContent = !lunarSite && site.fallback ? 'UTC · no reliable civil zone for these coordinates' : `${clock.zone} · ${offsetText(offset)}`;
  $('date-dial').value = clamp(day, FIRST_DAY, LAST_DAY);
  $('date-dial').setAttribute('aria-valuetext', date);
  $('time-dial').value = seconds;
  $('time-dial').setAttribute('aria-valuetext', localTime);
  // Do not rewrite fields while typing; the change handlers normalize committed values.
  if (document.activeElement !== $('date-edit')) $('date-edit').value = date;
  if (document.activeElement !== $('time-edit')) $('time-edit').value = localTime;
  if ($('directions').parentElement.open) updateDirections();
  if (lunarSite) {
    $('earth-visibility').textContent = sky.earth.visible ?
      `Earth above the horizon · ${Math.round(sky.earth.illumination * 100)}% lit · ${sky.earth.diameter.toFixed(2)}° wide` :
      'Earth is below the horizon. The Moon blocks the view from this site.';
    updateLunarEvents();
    return;
  }
  const waxing = sky.phase < 180;
  $('phase').textContent = `${Math.round(sky.illumination * 100)}% · ${waxing ? 'waxing' : 'waning'}`;

  if (shownDay !== day) {
    shownDay = day;
    const [start, end] = clock.dayBounds(day);
    const solar = solarEvents(start, end, site);
    for (const [id, type, missing] of [['sunrise', 'Sunrise', 'Does not rise'], ['sunset', 'Sunset', 'Does not set']]) {
      const readings = solar.events.filter(event => event.type === type).map(event => {
        const local = clock.parts(event.instant);
        return `${timeText(local.seconds).slice(0, 5)}${end - start === DAY ? '' : ` (${offsetText(local.offset)})`}`;
      });
      $(id).textContent = readings.join(', ') || missing;
    }
    const minutes = Math.round(solar.duration / (60 * SECOND));
    $('daylight').textContent = `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    const state = { 'polar day': 'Polar day. ', 'polar night': 'Polar night. ', skipped: 'This date was skipped locally. ' };
    $('solar-note').textContent = `${state[solar.state] ?? ''}Estimated for a level, sea-level horizon.`;
  }
}

function updateLunarEvents() {
  const { instant } = playback;
  // Keep only the current station's upcoming pair; reuse while time moves forward
  // in the same interval. Clock edits invalidate it, including backward edits.
  if (lunarEvents && instant >= lunarEvents.from &&
      [lunarEvents.sunrise, lunarEvents.sunset].every(event => event === null || event > instant)) return;
  lunarEvents = { from: instant, ...nextLunarSolarEvents(instant, playback.end, lunarSite) };
  for (const event of ['sunrise', 'sunset']) {
    const at = lunarEvents[event];
    $(`next-${event}`).textContent = at === null ? 'None before the supported UTC date limit' :
      `${new Date(at).toISOString().slice(0, 19).replace('T', ' · ')} UTC`;
    $(`jump-${event}`).disabled = at === null;
  }
}

function updateDirections() {
  const objects = [sky.sun, sky.earth ?? sky.moon, ...sky.planets, ...sky.stars.slice(0, 5)];
  $('directions').replaceChildren(...objects.map(obj => {
    const li = document.createElement('li');
    li.textContent = `${obj.name}: ${obj.azimuth.toFixed(1)}° az, ${obj.altitude.toFixed(1)}° alt` +
      (obj.diameter ? ` · ${obj.diameter.toFixed(2)}° diameter` : '');
    return li;
  }));
}

function resize() {
  const nextWidth = view.clientWidth, nextHeight = view.clientHeight;
  const nextDpi = Math.min(devicePixelRatio || 1, 2);
  const nextDesktopRideBuffer = innerWidth >= 1280 && innerHeight >= 720;
  const sceneChanged = nextWidth !== width || nextHeight !== height || nextDpi !== dpi;
  const rideBufferChanged = ride && nextDesktopRideBuffer !== desktopRideBuffer;
  width = nextWidth; height = nextHeight; dpi = nextDpi; desktopRideBuffer = nextDesktopRideBuffer;
  if (!width || !height) return;
  if (!sceneChanged && !rideBufferChanged) return;
  if (sceneChanged) {
    const pixelsWide = Math.round(width * dpi), pixelsHigh = Math.round(height * dpi);
    if (skyCanvas.width !== pixelsWide) skyCanvas.width = pixelsWide;
    if (skyCanvas.height !== pixelsHigh) skyCanvas.height = pixelsHigh;
  }
  if (ride) rocket.resize(width, height, dpi, desktopRideBuffer);
  else globe?.resize(width, height, dpi);
  dirty = true;
  queuePreview();
}

function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    resize();
  });
}

function watchPixelRatio() {
  // Match the raw DPR so a display/zoom change can be detected even when the CSS box doesn't change.
  const query = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  query.addEventListener('change', () => {
    watchPixelRatio();
    queueResize();
  }, { once: true });
}

function viewControls() {
  const inSpace = mode === 'globe';
  const showTelescope = Boolean(site && skyRenderer && !inSpace && !flight && !ride);
  setTelescope(showTelescope && telescopeActive, showTelescope);
  $('rocket-ride').hidden = $('skip-ride').hidden = !ride;
  $('arrival-flag').hidden = !arrival || inSpace || Boolean(flight || ride);
  $('lunar-destinations').hidden = !globe || inSpace || Boolean(flight || ride || lunarSite);
  $('view-name').textContent = !site ? (inSpace ? 'Pick a globe location' : 'Inside the cheese wheel') :
    ride ? 'Rocket ride' : flight ? (flight.toSpace ? 'Lifting off' : 'Returning to surface') :
      inSpace ? 'Globe view' : lunarSite ? 'Lunar sky' : 'Surface sky';
  $('close-globe').hidden = Boolean(site) || !inSpace;
  $('flight').hidden = !site || Boolean(lunarSite || ride);
  $('bearing').hidden = !site || Boolean(ride);
  $('flight').textContent = inSpace ? 'Return to surface ↓' : 'Lift off ↗';
  $('flight').disabled = !globe || Boolean(flight);
  $('travel-toggle').hidden = !site || Boolean(flight || ride);
  $('return-earth').hidden = !lunarSite;
  if (openPanel?.hidden) showPanel(null);
  $('pin').disabled = !globe || Boolean(flight || ride);
  $('zoom').hidden = !inSpace || Boolean(flight || ride);
  $('orbit-tools').hidden = !site || !inSpace || Boolean(flight || ride);
  $('overview').setAttribute('aria-pressed', String(orbit.overview));
  $('view-badge').hidden = !site || !inSpace || Boolean(flight || ride);
  const help = ride ? 'Illustrative route, not to scale. The ride adds no simulation time.' :
    pinning ? 'Drag or use arrow keys to orbit. Tap Earth or press Enter to place a pin. Escape cancels.' :
    inSpace ? 'Drag or use arrow keys to orbit. Pinch, scroll or use the zoom buttons.' :
      telescopeActive ? 'Drag or use arrow keys to aim. Scroll or pinch to zoom, or use the magnification slider.' :
        showTelescope ? 'Drag or use arrow keys to aim. Open Telescope to magnify the center of the view.' :
        site ? 'Drag or use arrow keys to look around.' : 'Drag, swipe, or use arrow keys to look around inside the wheel.';
  $('view-help').textContent = $('panel-view-help').textContent = help;
  $('pin-help').hidden = !pinning;
  if (pinning) $('pin-help').textContent = help;
  spaceCanvas.hidden = !inSpace && !flight && !ride;
  skyCanvas.hidden = !site || Boolean(ride) || (inSpace && !flight);
  cheeseCanvas.hidden = Boolean(site) || inSpace;
  if (!inSpace) $('view-badge').textContent = '';
  dirty = true;
  queuePreview();
}

// Before selecting a site there is no running simulation. Redraw previews only on demand.
function drawPreview() {
  if (!width || !height) return;
  if (mode === 'globe') globe?.draw(globePreview, null, surface, orbit, 1);
  else cheeseRenderer?.(cheese.yaw, cheese.pitch, width, height);
}

function queuePreview() {
  if (site || previewFrame !== null) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null;
    if (!site) drawPreview();
  });
}

function frameEarth() {
  updateSpace();
  orbit.theta = site.lon * RAD + space.spin;
  orbit.latitude = clamp(site.lat * RAD, -1.55, 1.55);
  orbit.distance = orbit.overview ? Math.max(10, 10 * height / width) : 4.3;
  orbit.focus = 'earth'; dirty = true;
}

function fly(toSpace, placePin = false) {
  if (!globe || flight) return;
  if (openPanel === $('travel-toggle') || (placePin && openPanel === $('location-toggle'))) {
    const focusInPanel = panelFor(openPanel).contains(document.activeElement);
    showPanel(null, false);
    if (focusInPanel) view.focus({ preventScroll: true });
  }
  if (toSpace) { orbit.overview = false; frameEarth(); }
  else setPin(false);
  flight = { toSpace, placePin, start: performance.now(), duration: motion.matches ? 0 : 1150 };
  viewControls();
}

function startRide(destination) {
  if (ride || flight || (destination ? !site || lunarSite || !globe : !lunarSite)) return;
  if (pendingLocation) notice('location-status', '');
  cancelLocation();
  notice('travel-status', '');
  showPanel(null, false);
  ride = { destination, elapsed: 0, lastFrame: null };
  setTelescope(false, false);
  arrival = false;
  if (motion.matches || !globe) {
    if (!globe) notice('travel-status', '3D is unavailable. Returning to Earth without the ride.');
    finishRide();
    return;
  }
  try {
    rocket ??= rocketView(globe.renderer, globe.surfaces);
    rocket.begin(site, destination ?? lunarSite, !destination);
    rocket.resize(width, height, dpi, desktopRideBuffer);
    rocket.draw(0);
  } catch (error) {
    console.error('Unable to start the rocket scene', error);
    cancelRide('The 3D ride could not start. Your departure site and clock are unchanged.');
    return;
  }
  for (const id of ['earth-location-actions', 'place-picker', 'location-status']) $(id).hidden = true;
  $('ride-phase').textContent = 'Launch';
  $('ride-route').textContent = `${(lunarSite ?? site).name} → ${(destination ?? site).name}`;
  viewControls();
  $('skip-ride').focus({ preventScroll: true });
  $('skip-ride').scrollIntoView({ block: 'nearest' });
}

function restoreSiteControls() {
  for (const id of ['earth-location-actions', 'place-picker']) $(id).hidden = Boolean(lunarSite);
  $('location-status').hidden = Boolean(lunarSite) || !$('location-status').textContent;
}

function cancelRide(message) {
  ride = null;
  globe?.resize(width, height, dpi);
  restoreSiteControls();
  notice('travel-status', message);
  viewControls();
  $('travel-toggle').focus({ preventScroll: true });
}

function finishRide(staticFlag = true) {
  advance();
  lunarSite = ride.destination;
  resetTelescope();
  ride = null; mode = 'surface'; arrival = staticFlag;
  globe?.resize(width, height, dpi);
  clock = civilClock(lunarSite ? 'UTC' : site.zone);
  if (!updatePlaybackBounds()) {
    playButton();
    notice('clock-status', `The same instant is outside this station’s supported ${lunarSite ? 'UTC' : 'local'} dates. Choose a date to resume.`);
  } else notice('clock-status', '');
  const station = lunarSite ?? site;
  $('site').textContent = station.name;
  $('coordinates').textContent = `${station.lat.toFixed(3)}°, ${station.lon.toFixed(3)}°`;
  $('title').textContent = lunarSite ? 'Lunar Sky' : 'Earth Sky';
  $('clock-context').textContent = lunarSite ? 'Lunar time (UTC)' : 'Observer local time';
  for (const id of ['earth-notes', 'solar-note', 'glare-controls']) $(id).hidden = Boolean(lunarSite);
  $('lunar-notes').hidden = !lunarSite;
  restoreSiteControls();
  shownDay = shownSecond = skySecond = lunarEvents = undefined;
  updateSky(); aimSky(); updateReadouts();
  setPin(false);
  view.focus();
}

function setPin(enabled) {
  pinning = enabled;
  notice('pin-status', '');
  view.classList.toggle('pinning', enabled);
  $('pin').setAttribute('aria-pressed', String(enabled));
  viewControls();
}

function draw(real) {
  if (ride) {
    // Slow or backgrounded browsers can take longer, but must not jump over
    // touchdown or the burst. This does not affect the simulation clock.
    ride.elapsed += Math.min(real - (ride.lastFrame ?? real), 300);
    ride.lastFrame = real;
    const elapsed = ride.elapsed;
    if (motion.matches || elapsed >= rideDuration) finishRide(motion.matches);
    else {
      const phase = rocket.draw(elapsed);
      if ($('ride-phase').textContent !== phase) $('ride-phase').textContent = phase;
      return;
    }
  }
  let progress = mode === 'globe' ? 1 : 0;
  if (flight) {
    const t = flight.duration ? clamp((real - flight.start) / flight.duration, 0, 1) : 1;
    const eased = t * t * (3 - 2 * t);
    progress = flight.toSpace ? eased : 1 - eased;
    if (t === 1) {
      const { toSpace, placePin } = flight;
      mode = toSpace ? 'globe' : 'surface'; flight = null;
      setPin(placePin);
    }
  }
  const spaceVisible = Boolean(flight) || mode === 'globe';
  if (!width || !height) return;
  const spaceChanged = spaceVisible && globe && updateSpace(real);
  if (dirty || flight || spaceChanged) {
    if (spaceVisible && globe) {
      globe.draw(space, site, surface, orbit, progress);
      if (mode === 'globe') {
        const badge = $('view-badge');
        const text = `${orbit.overview ? 'Not to scale' : 'True Earth–Moon scale'} · ${Math.round(Math.hypot(...space.moon) * EARTH_KM).toLocaleString('en-US')} km center to center`;
        if (badge.textContent !== text) badge.textContent = text;
      }
    }
    if (progress < 1) skyRenderer?.draw(sky, surface, options, width, height, dpi, telescopeActive);
    const heading = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(surface.az / 45) % 8];
    $('bearing').textContent = mode === 'surface' && !flight ? `${heading} ${Math.round(surface.az) % 360}° · ${Math.round(surface.alt)}° altitude` : '';
    skyCanvas.style.opacity = String(1 - clamp((progress - .08) / .72, 0, 1));
    dirty = false;
  }
}

function tick(real) {
  advance(real); updateSky(); updateReadouts(); draw(real);
  requestAnimationFrame(tick);
}

$('locate').addEventListener('click', () => {
  if (pendingLocation) return;
  const api = navigator.geolocation;
  const alternatives = site ? 'Your current site is unchanged.' : 'You can still pick a place or try the demo sky.';
  if (typeof api?.getCurrentPosition !== 'function' || !isSecureContext) {
    notice('location-status', `Location is unavailable here. ${alternatives}`); return;
  }
  const request = {};
  const reject = message => {
    if (pendingLocation !== request) return;
    cancelLocation(); notice('location-status', `${message} ${alternatives}`);
  };
  request.timer = setTimeout(() => reject('Location timed out.'), 10000);
  pendingLocation = request;
  $('locate').disabled = true; $('locate').textContent = 'Locating…';
  notice('location-status', 'Waiting for browser location permission or a position…');
  try {
    api.getCurrentPosition(position => {
      if (pendingLocation !== request) return;
      const next = coordinateSite('Your location', position?.coords?.latitude, position?.coords?.longitude);
      if (next) selectSite(next, 'Location applied for this visit only.');
      else reject('The browser returned an invalid position.');
    }, error => reject(error.code === 1 ? 'Location permission was not granted.' :
      error.code === 3 ? 'Location timed out.' : 'The browser could not determine your location.'),
    { timeout: 9500, maximumAge: 0, enableHighAccuracy: false });
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error;
    reject('Location is unavailable here.');
  }
});

function closeGlobePreview() {
  if (site || !globePreview) return;
  globePreview = null; mode = 'surface'; setPin(false);
  showPanel($('location-toggle'), false);
  $('pin').focus();
}
function showPicker(open) {
  if (site) return;
  if (!open) closeGlobePreview();
  $('pick-place').setAttribute('aria-expanded', String(open));
  $('place-picker').hidden = !open;
  if (!open) $('pick-place').focus();
}
$('pick-place').addEventListener('click', () => showPicker($('place-picker').hidden));
$('cancel-place').addEventListener('click', () => showPicker(false));
$('close-globe').addEventListener('click', closeGlobePreview);
$('demo').addEventListener('click', () => selectSite(demo));

function listCities() {
  const matches = findCities($('city-search').value);
  $('city-results').replaceChildren(...(matches.length ? matches.map(city =>
    new Option(`${city.name}, ${city.country}`, String(cities.indexOf(city)))) : [new Option('No matching cities', '')]));
  $('city-results').disabled = $('city-select').disabled = !matches.length;
}
$('city-search').addEventListener('input', listCities);
$('city-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('city-results').disabled) selectSite(cities[Number($('city-results').value)]);
});
$('coordinate-form').addEventListener('submit', event => {
  event.preventDefault();
  const { lat, lon } = event.currentTarget.elements;
  const next = coordinateSite('Manual coordinates', lat.valueAsNumber, lon.valueAsNumber);
  if (next) selectSite(next);
});

$('play').addEventListener('click', () => {
  advance();
  if (!playback.toggle(performance.now())) {
    notice('clock-status', 'Choose a date or select Now to resume playback.'); return;
  }
  playButton(); notice('clock-status', '');
});
$('now').addEventListener('click', () => {
  playback.startLive(Date.now(), performance.now());
  spaceInstant = undefined;
  lunarEvents = shownSecond = undefined;
  $('speed').value = String(playback.rate); playButton(); notice('clock-status', '');
});
$('speed').addEventListener('change', () => {
  advance(); playback.setRate(Number($('speed').value), performance.now());
});
$('date-dial').min = FIRST_DAY; $('date-dial').max = LAST_DAY;
$('date-dial').addEventListener('input', event => editClock(event.target.valueAsNumber, clock.parts(playback.instant).seconds));
$('time-dial').addEventListener('input', event => editClock(clock.parts(playback.instant).day, event.target.valueAsNumber));
for (const [id, parse, format] of [
  ['date-edit', input => editClock(input.valueAsNumber / DAY, clock.parts(playback.instant).seconds), () => dateText(clock.parts(playback.instant).day)],
  ['time-edit', input => editClock(clock.parts(playback.instant).day, input.valueAsNumber / SECOND), () => timeText(clock.parts(playback.instant).seconds)],
]) {
  $(id).addEventListener('change', event => {
    if (event.target.validity.valid) parse(event.target);
    event.target.value = format();
  });
  $(id).addEventListener('blur', event => { event.target.value = format(); });
}
$('dimmer').addEventListener('input', event => { options.glare = event.target.valueAsNumber / 100; dirty = true; });
for (const key of ['labels', 'lines']) $(key).addEventListener('change', event => { options[key] = event.target.checked; dirty = true; });
$('directions').parentElement.addEventListener('toggle', event => { if (event.target.open) updateDirections(); });

$('flight').addEventListener('click', () => fly(mode === 'surface'));
$('return-earth').addEventListener('click', () => startRide(null));
$('skip-ride').addEventListener('click', () => { if (ride) finishRide(); });
for (const [id, destination] of Object.entries(lunarSites)) {
  $(`land-${id}`).addEventListener('click', () => startRide(destination));
}
for (const event of ['sunrise', 'sunset']) {
  $(`jump-${event}`).addEventListener('click', () => {
    if (!lunarSite) return;
    advance();
    const target = lunarEvents?.[event];
    if (target == null || target <= playback.instant) { updateLunarEvents(); return; }
    playback.pauseAt(target);
    lunarEvents = shownSecond = undefined;
    playButton(); notice('clock-status', '');
    updateSky(); updateReadouts();
  });
}
$('pin').addEventListener('click', () => {
  if (!site) {
    if (!globe) return;
    if (globePreview) { closeGlobePreview(); return; }
    globePreview = spaceAt(Date.now());
    Object.assign(orbit, { theta: globePreview.spin, latitude: .18, distance: 4.3, focus: 'earth', overview: false });
    mode = 'globe'; setPin(true);
  } else if (mode === 'surface') fly(true, true);
  else {
    if (orbit.focus !== 'earth') frameEarth();
    setPin(!pinning);
  }
  showPanel(null, false);
  view.focus({ preventScroll: true });
});
$('overview').addEventListener('click', () => {
  orbit.overview = !orbit.overview; frameEarth(); viewControls();
});
$('earth-focus').addEventListener('click', frameEarth);
$('moon-focus').addEventListener('click', () => {
  setPin(false); updateSpace();
  const [x, y, z] = space.moon;
  orbit.focus = 'moon'; orbit.distance = 1.7;
  orbit.theta = Math.atan2(z, -x); orbit.latitude = clamp(Math.atan2(-y, Math.hypot(x, z)), -1.55, 1.55);
  dirty = true;
});

function rotate(dx, dy) {
  if (!site && mode === 'surface') {
    cheese.yaw = (cheese.yaw - dx * .007) % (2 * Math.PI);
    cheese.pitch = clamp(cheese.pitch + dy * .007, -1.4, 1.4);
  } else if (mode === 'surface') {
    const sensitivity = .22 / surface.magnification;
    surface.az = wrap(surface.az - dx * sensitivity);
    surface.alt = clamp(surface.alt + dy * sensitivity, -83, 83);
  } else {
    orbit.theta -= dx * .007;
    orbit.latitude = clamp(orbit.latitude + dy * .007, -1.55, 1.55);
  }
  dirty = true;
  queuePreview();
}
function setTelescope(active, available = !telescope.hidden) {
  const hiding = !available ? telescope : !active ? telescopeControls : null;
  const focusWillBeHidden = hiding?.contains(document.activeElement);
  telescope.hidden = !available;
  if (telescopeActive !== active) {
    for (const id of pointers.keys()) {
      if (view.hasPointerCapture(id)) view.releasePointerCapture(id);
    }
    pointers.clear();
    telescopeActive = active;
    surface.magnification = active ? telescopeMagnification : 1;
    view.classList.toggle('eyepiece', active);
    telescopeToggle.classList.toggle('primary', !active);
    telescopeToggle.textContent = active ? 'Exit telescope' : 'Telescope';
    telescopeToggle.setAttribute('aria-expanded', String(active));
    telescopeControls.hidden = !active;
    dirty = true;
  }
  if (focusWillBeHidden) (available ? telescopeToggle : view).focus();
}

function setMagnification(value) {
  telescopeMagnification = clamp(value, 1, Number(telescopeRange.max));
  // The native step rounds the slider, not the focal length used for projection.
  const rounded = Number(telescopeMagnification.toFixed(2));
  const text = `${rounded}×`;
  telescopeRange.value = rounded;
  telescopeRange.setAttribute('aria-valuetext', text);
  $('magnification').textContent = text;
  if (!telescopeActive || surface.magnification === telescopeMagnification) return;
  surface.magnification = telescopeMagnification;
  dirty = true;
}

function resetTelescope() {
  setTelescope(false);
  setMagnification(1);
}

telescopeToggle.addEventListener('click', () => {
  if (telescope.hidden) return;
  setTelescope(!telescopeActive);
  viewControls();
});
telescopeRange.addEventListener('input', () => {
  if (telescopeActive) setMagnification(telescopeRange.valueAsNumber);
});
function escapeTelescope(event) {
  if (!telescopeActive || event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  setTelescope(false);
  viewControls();
  telescopeToggle.focus();
}
telescope.addEventListener('keydown', escapeTelescope);

function zoom(factor) {
  orbit.distance = clamp(orbit.distance * factor, orbit.focus === 'earth' ? 1.09 : .49, 150);
  dirty = true;
  queuePreview();
}
$('zoom-in').addEventListener('click', () => zoom(.77));
$('zoom-out').addEventListener('click', () => zoom(1.3));
view.addEventListener('wheel', event => {
  if (flight || ride) return;
  // Browsers send trackpad pinch as Ctrl+wheel. Meta is not that signal.
  if (telescopeActive && event.target === view && !event.metaKey && !event.altKey && !event.shiftKey) {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1;
    if (!event.cancelable || !event.deltaY) return;
    event.preventDefault();
    setMagnification(telescopeMagnification - event.deltaY * unit * WHEEL_MAGNIFICATION_PER_PIXEL);
  } else if (mode === 'globe' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); zoom(Math.exp(clamp(event.deltaY * .002, -1, 1)));
  }
}, { passive: false });
view.addEventListener('keydown', event => {
  if (event.target !== view || flight || ride) return;
  escapeTelescope(event);
  if (event.defaultPrevented) return;
  const keys = { ArrowLeft: [28, 0], ArrowRight: [-28, 0], ArrowUp: [0, 28], ArrowDown: [0, -28] };
  if (Object.hasOwn(keys, event.key)) { event.preventDefault(); rotate(...keys[event.key]); }
  if (event.key === 'Escape' && pinning) {
    event.preventDefault();
    if (!site) closeGlobePreview();
    else setPin(false);
  }
  if (pinning && event.key === 'Enter') { event.preventDefault(); placePin(.5, .5); }
});

function placePin(x, y) {
  // Resolve against the latest camera frame even if a click immediately follows an orbit.
  if (site) draw(performance.now());
  else drawPreview();
  const hit = globe.pick(x, y);
  if (hit) selectSite(coordinateSite('Globe pin', hit.lat, hit.lon), 'Globe pin applied.');
  else notice('pin-status', 'No Earth surface at that point. Tap Earth to place the pin.');
}

view.addEventListener('pointerdown', event => {
  if (flight || ride || event.target !== view || event.button !== 0 || pointers.size >= 2) return;
  const point = { x: event.clientX, y: event.clientY, type: event.pointerType };
  if (!pointers.size) {
    dragged = false;
    telescopePinch = null;
  } else {
    const [first] = pointers.values();
    if (telescopeActive) {
      if (point.type !== 'touch' || first.type !== 'touch') return;
      telescopePinch = { gap: Math.hypot(point.x - first.x, point.y - first.y), magnification: telescopeMagnification };
    }
    dragged = true;
  }
  view.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, point);
});
view.addEventListener('pointermove', event => {
  const before = pointers.get(event.pointerId);
  if (!before || flight || ride) return;
  const next = { x: event.clientX, y: event.clientY, type: before.type };
  const dx = next.x - before.x, dy = next.y - before.y;
  if (!dragged && Math.hypot(dx, dy) < 5) return;
  dragged = true;
  if (pointers.size === 1) {
    // After a pinch, do not turn the last contact's release movement into aim.
    if (!telescopePinch) rotate(dx, dy);
  } else if (telescopePinch || mode === 'globe') {
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
    const nextGap = Math.hypot(next.x - other.x, next.y - other.y);
    if (telescopePinch) {
      setMagnification(telescopePinch.magnification + (nextGap - telescopePinch.gap) * PINCH_MAGNIFICATION_PER_PIXEL);
    } else {
      const beforeGap = Math.hypot(before.x - other.x, before.y - other.y);
      zoom(Math.max(1, beforeGap) / Math.max(1, nextGap));
    }
  }
  pointers.set(event.pointerId, next);
});
view.addEventListener('pointerup', event => {
  const tracked = pointers.delete(event.pointerId);
  if (tracked && !dragged && pinning && globe && !flight && !ride) {
    const bounds = view.getBoundingClientRect();
    placePin((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  }
});
for (const type of ['pointercancel', 'lostpointercapture']) view.addEventListener(type, event => pointers.delete(event.pointerId));

listCities(); viewControls(); resize();
new ResizeObserver(queueResize).observe(view);
window.addEventListener('resize', queueResize);
watchPixelRatio();
$('loading').hidden = true;
