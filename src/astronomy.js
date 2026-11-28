import * as A from 'astronomy-engine';
import { DAY } from './clock.js';

export const RAD = Math.PI / 180;
export const EARTH_KM = 6371;
export const MOON_KM = 1737.4;
const SUN_KM = 695700;
const bodies = [A.Body.Sun, A.Body.Moon, A.Body.Mercury, A.Body.Venus, A.Body.Mars,
  A.Body.Jupiter, A.Body.Saturn, A.Body.Uranus, A.Body.Neptune];
// Selected naked-eye stars: rounded J2000 equatorial positions (hours/degrees) and V magnitudes.
export const starCatalog = [
  ['Sirius', 6.7525, -16.7161, -1.46], ['Canopus', 6.3992, -52.6957, -0.74],
  ['Arcturus', 14.2610, 19.1824, -0.05], ['Vega', 18.6156, 38.7837, 0.03],
  ['Capella', 5.2782, 45.9980, 0.08], ['Rigel', 5.2423, -8.2016, 0.13],
  ['Procyon', 7.6550, 5.2250, 0.34], ['Betelgeuse', 5.9195, 7.4071, 0.42],
  ['Altair', 19.8464, 8.8683, 0.77], ['Aldebaran', 4.5987, 16.5093, 0.86],
  ['Antares', 16.4901, -26.4320, 0.96], ['Spica', 13.4199, -11.1613, 0.98],
  ['Pollux', 7.7553, 28.0262, 1.14], ['Fomalhaut', 22.9608, -29.6222, 1.16],
  ['Deneb', 20.6905, 45.2803, 1.25], ['Regulus', 10.1395, 11.9672, 1.35],
  ['Bellatrix', 5.4189, 6.3497, 1.64], ['Elnath', 5.4382, 28.6075, 1.65],
  ['Alnilam', 5.6036, -1.2019, 1.69], ['Alnitak', 5.6793, -1.9426, 1.74],
  ['Polaris', 2.5303, 89.2641, 1.98], ['Saiph', 5.7959, -9.6696, 2.07],
  ['Mintaka', 5.5334, -0.2991, 2.23], ['Gienah', 20.7702, 33.9703, 2.48],
  ['Sadr', 20.3705, 40.2567, 2.23], ['Albireo', 19.5120, 27.9597, 3.08],
  ['Acrux', 12.4433, -63.0991, 0.76], ['Mimosa', 12.7954, -59.6888, 1.25],
  ['Gacrux', 12.5194, -57.1132, 1.63], ['Imai', 12.2524, -58.7489, 2.79],
];
export const patterns = [
  ['Betelgeuse', 'Alnitak', 'Saiph', 'Rigel', 'Mintaka', 'Bellatrix', 'Betelgeuse'],
  ['Alnitak', 'Alnilam', 'Mintaka'], ['Deneb', 'Sadr', 'Albireo'], ['Gienah', 'Sadr'],
  ['Acrux', 'Gacrux'], ['Imai', 'Mimosa'],
];

export function skyAt(instant, site) {
  const time = A.MakeTime(new Date(instant));
  const observer = new A.Observer(site.lat, site.lon, 0);
  const planets = bodies.map(name => {
    const eq = A.Equator(name, time, observer, true, true);
    const { azimuth, altitude } = A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    const radius = name === 'Sun' ? SUN_KM : name === 'Moon' ? MOON_KM : 0;
    const diameter = 2 * Math.asin(radius / (eq.dist * A.KM_PER_AU)) / RAD;
    return { name, azimuth, altitude, diameter, magnitude: name === 'Sun' ? -26 : A.Illumination(name, time).mag };
  });
  const rotation = A.Rotation_EQJ_EQD(time);
  const lights = starCatalog.map(([name, ra, dec, magnitude]) => {
    const vector = A.VectorFromSphere(new A.Spherical(dec, ra * 15, 1), time);
    const eq = A.EquatorFromVector(A.RotateVector(rotation, vector));
    const { azimuth, altitude } = A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    return { name, azimuth, altitude, magnitude };
  });
  const phase = A.MoonPhase(time);
  return { sun: planets[0], moon: planets[1], planets: planets.slice(2), stars: lights,
    illumination: A.Illumination(A.Body.Moon, time).phase_fraction, phase };
}

export function solarEvents(start, end, site) {
  if (end <= start) return { events: [], duration: 0, state: 'skipped' };
  const observer = new A.Observer(site.lat, site.lon, 0);
  const events = [];
  for (const [direction, type] of [[1, 'Sunrise'], [-1, 'Sunset']]) {
    let cursor = start;
    while (cursor < end) {
      const event = A.SearchRiseSet(A.Body.Sun, observer, direction, new Date(cursor), (end - cursor) / DAY);
      const instant = event?.date.getTime();
      if (instant === undefined || instant >= end) break;
      events.push({ type, instant });
      cursor = instant + 1000;
    }
  }
  events.sort((a, b) => a.instant - b.instant);
  const sun = A.Equator(A.Body.Sun, new Date(start), observer, true, true);
  const altitude = A.Horizon(new Date(start), observer, sun.ra, sun.dec).altitude;
  const cutoff = -(34 / 60 + Math.asin(SUN_KM / (sun.dist * A.KM_PER_AU)) / RAD);
  let up = events.length ? events[0].type === 'Sunset' : altitude > cutoff;
  let cursor = start;
  let duration = 0;
  for (const event of events) {
    if (up) duration += event.instant - cursor;
    up = event.type === 'Sunrise';
    cursor = event.instant;
  }
  if (up) duration += end - cursor;
  return { events, duration, state: events.length ? 'crossings' : up ? 'polar day' : 'polar night' };
}

export function spaceAt(instant) {
  const time = A.MakeTime(new Date(instant));
  const rotation = A.Rotation_EQJ_EQD(time);
  const sun = A.RotateVector(rotation, A.GeoVector(A.Body.Sun, time, false));
  const moon = A.RotateVector(rotation, A.GeoMoon(time));
  return { spin: A.SiderealTime(time) * 15 * RAD, sun: [sun.x, sun.z, -sun.y],
    moon: [moon.x, moon.z, -moon.y].map(x => x * A.KM_PER_AU / EARTH_KM) };
}

export const solarBodies = ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

// Geometric heliocentric vectors in AU, in the fixed J2000 ecliptic frame.
const toEcliptic = A.Rotation_EQJ_ECL();
function heliocentricEcliptic(body, time) {
  const { x, y, z } = A.RotateVector(toEcliptic, A.HelioVector(body, time));
  return [x, y, z];
}

export function solarSystemAt(instant) {
  const time = A.MakeTime(new Date(instant));
  return solarBodies.map(body => heliocentricEcliptic(body, time));
}

function solarDirection(vector) {
  const { x, y, z } = A.RotateVector(toEcliptic, vector);
  return [x, z, -y]; // Match the renderer's J2000 ecliptic frame without distance compression.
}

// Where each body's local +Y (modeled pole) and +X (prime meridian) point.
export function solarAxesAt(instant) {
  const time = A.MakeTime(new Date(instant));
  return solarBodies.map(body => {
    if (body === 'Earth') {
      // Greenwich apparent sidereal time is measured in the equator of date,
      // not from the IAU node used for the other bodies' prime meridians.
      const toJ2000 = A.Rotation_EQD_EQJ(time);
      const sidereal = A.SiderealTime(time) * 15 * RAD;
      const direction = (x, y, z) => solarDirection(A.RotateVector(toJ2000, new A.Vector(x, y, z, time)));
      return { north: direction(0, 0, 1), prime: direction(Math.cos(sidereal), Math.sin(sidereal), 0) };
    }
    const { ra, dec, spin, north } = A.RotationAxis(body, time);
    // IAU W is a signed rotation about north from the ascending node of
    // the body's equator on the J2000 equator (RA of the pole + 90°).
    const alpha = ra * 15 * RAD, delta = dec * RAD, w = (spin % 360) * RAD;
    const c = Math.cos(w), s = Math.sin(w), a = Math.cos(alpha), b = Math.sin(alpha);
    const prime = new A.Vector(-b * c - a * Math.sin(delta) * s,
      a * c - b * Math.sin(delta) * s, Math.cos(delta) * s, time);
    return { north: solarDirection(north), prime: solarDirection(prime) };
  });
}

// Approximate sidereal periods in days, Mercury through Pluto. Used only for
// choosing the sampling interval; the points themselves come from the ephemeris.
const orbitalDays = [87.969, 224.701, 365.256, 686.980, 4332.59, 10759.22, 30688.5, 60182, 90560];
export function solarOrbitGuides() {
  const epoch = Date.UTC(1900, 0, 1);
  const samples = 256;
  return solarBodies.slice(1).map((body, index) => {
    const points = Array.from({ length: samples }, (_, i) =>
      heliocentricEcliptic(body, A.MakeTime(new Date(epoch + orbitalDays[index] * DAY * i / samples))));
    return [...points, points[0]]; // A short closing chord, not a prediction.
  });
}
