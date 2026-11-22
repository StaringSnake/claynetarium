// NASA/JPL Horizons API 1.2, DE441, retrieved 2026-11-22:
// https://ssd.jpl.nasa.gov/api/horizons.api (format=text, default OBSERVER table).
// CENTER='coord@301', COORD_TYPE='GEODETIC', SITE_COORD='23.47314,0.67416,0'
// or '180,0,0'. Center pole/equator MEAN_ME, east-positive, airless, UTC.
// Earth COMMAND='399', QUANTITIES='4,10,13'; Sun COMMAND='10', QUANTITIES='4,13'.
// Rows are verbatim numeric columns, with UTC dates normalized to ISO.
export const earthRows = [ // station, time, azimuth°, elevation°, lit%, diameter arcsec
  ['apollo', '2025-01-06T00:00Z', 267.963517, 64.825844, 61.34492, 7121.554],
  ['apollo', '2025-01-20T00:00Z', 271.643081, 67.597624, 32.80738, 6548.803],
  ['far', '2025-01-06T00:00Z', 99.106552, -88.417124, 61.24192, 7058.325],
  ['far', '2025-01-20T00:00Z', 316.865986, -88.297935, 32.88010, 6494.748],
  // Local altitude maximum in hourly samples Jan 26–28: near a libration extreme.
  ['far', '2025-01-26T18:00Z', 39.732127, -81.372297, 90.95183, 6767.562],
];

export const apolloSun = [ // time, azimuth°, elevation°; same instants as Earth above
  ['2025-01-06T00:00Z', 91.657206, 12.150132],
  ['2025-01-20T00:00Z', 268.674455, -2.110611],
];

// Next crossings after 2025-01-01T00:00Z, located with daily positions then
// bracketed at 1-minute cadence. Each row: before/after UTC, centre altitude°,
// equatorial diameter arcsec. Use altitude + diameter/7200 for the upper limb.
export const solarBrackets = [
  ['apollo', 'sunrise', ['2025-01-04T23:29Z', -.273233, 1953.171], ['2025-01-04T23:30Z', -.264785, 1953.170]],
  ['apollo', 'sunset', ['2025-01-19T20:21Z', -.263692, 1947.717], ['2025-01-19T20:22Z', -.272125, 1947.718]],
  ['far', 'sunrise', ['2025-01-21T17:40Z', -.278017, 1949.217], ['2025-01-21T17:41Z', -.269575, 1949.217]],
  ['far', 'sunset', ['2025-01-06T22:50Z', -.269694, 1951.011], ['2025-01-06T22:51Z', -.278133, 1951.010]],
];
