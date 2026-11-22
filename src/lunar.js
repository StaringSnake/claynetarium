import * as A from 'astronomy-engine';
import { EARTH_KM, MOON_KM, RAD, starCatalog } from './astronomy.js';
import { DAY, SECOND } from './clock.js';

// Apollo 11: 0.67416 N, 23.47314 E (NASA/LRO landing-site coordinates).
export const lunarSites = {
  apollo: { name: 'Apollo 11 · Near side', lat: 0.67416, lon: 23.47314 },
  far: { name: 'Far-side equator', lat: 0, lon: 180 },
};

const vector = ({ x, y, z }) => [x, y, z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const length = v => Math.hypot(...v);
const unit = v => v.map(x => x / length(v));
const radiusAngle = (km, v) => Math.asin(km / (A.KM_PER_AU * length(v))) / RAD;

function observer(instant, site) {
  const time = A.MakeTime(new Date(instant));
  const axis = A.RotationAxis(A.Body.Moon, time);
  const pole = vector(axis.north);
  // Body equator ascending node on J2000 equator; W rotates east from it.
  const node = unit(cross([0, 0, 1], pole));
  const quarter = cross(pole, node);
  const spin = ((axis.spin % 360) + site.lon) * RAD;
  const lat = site.lat * RAD;
  const meridian = node.map((x, i) => x * Math.cos(spin) + quarter[i] * Math.sin(spin));
  const up = meridian.map((x, i) => x * Math.cos(lat) + pole[i] * Math.sin(lat));
  const east = cross(pole, meridian), north = cross(up, east);
  const position = vector(A.GeoMoon(time)).map((x, i) => x + up[i] * MOON_KM / A.KM_PER_AU);
  const local = v => [dot(v, east), dot(v, up), dot(v, north)];
  return { time, position, local };
}

function direction([east, up, north]) {
  return { azimuth: (Math.atan2(east, north) / RAD + 360) % 360,
    altitude: Math.atan2(up, Math.hypot(east, north)) / RAD };
}

function sunAt({ time, position, local }) {
  const fromEarth = vector(A.HelioVector(A.Body.Earth, time)).map(x => -x);
  const ray = subtract(fromEarth, position);
  return { fromEarth, sun: { name: 'Sun', ...direction(local(ray)), diameter: 2 * radiusAngle(695700, ray) } };
}

const starVectors = starCatalog.map(([name, ra, dec, magnitude]) => {
  const a = ra * 15 * RAD, d = dec * RAD;
  return { name, magnitude, ray: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)] };
});

export function lunarSkyAt(instant, site) {
  const station = observer(instant, site);
  const { fromEarth, sun } = sunAt(station);
  const ray = station.position.map(x => -x);
  const towardSun = unit(fromEarth);
  const earth = { name: 'Earth', ...direction(station.local(ray)), diameter: 2 * radiusAngle(EARTH_KM, ray),
    illumination: (1 + dot(towardSun, unit(station.position))) / 2, light: station.local(towardSun) };
  earth.visible = earth.altitude + earth.diameter / 2 > 0;
  return { sun, earth, airless: true, planets: [], stars: starVectors.map(({ name, magnitude, ray }) =>
    ({ name, magnitude, ...direction(station.local(ray)) })) };
}

export function solarLimbAltitude(instant, site) {
  const { sun } = sunAt(observer(instant, site));
  return sun.altitude + sun.diameter / 2;
}

export function nextLunarSolarEvents(instant, end, site) {
  // Both stations are equatorial: both crossings occur within a synodic month.
  // A 12 h bracket cannot skip a day or night here; cap work at 35 days.
  const limit = Math.floor(Math.min(end, instant + 35 * DAY) / SECOND);
  let left = Math.floor(instant / SECOND);
  const events = { sunrise: null, sunset: null };
  if (left >= limit) return events;
  const above = second => solarLimbAltitude(second * SECOND, site) >= 0;
  let wasAbove = above(left);
  while (left < limit && (events.sunrise === null || events.sunset === null)) {
    const right = Math.min(left + 43200, limit), isAbove = above(right);
    const key = isAbove ? 'sunrise' : 'sunset';
    if (isAbove !== wasAbove && events[key] === null) {
      let a = left, b = right;
      while (b - a > 1) {
        const mid = Math.floor((a + b) / 2);
        if (above(mid) === wasAbove) a = mid;
        else b = mid;
      }
      events[key] = b * SECOND;
    }
    wasAbove = isAbove;
    left = right;
  }
  return events;
}
