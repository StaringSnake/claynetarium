// NASA/JPL Horizons API 1.2, DE441 and target-specific satellite solutions
// (including plu060_merged for Pluto), retrieved 2026-11-24:
// https://ssd.jpl.nasa.gov/api/horizons.api
// EPHEM_TYPE='VECTORS', CENTER='500@10', REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF',
// VEC_CORR='NONE', OUT_UNITS='AU-D', TIME_TYPE='UT', VEC_TABLE='1', CSV_FORMAT='YES'.
// COMMAND codes below target body centers, not planetary system barycenters.
export const solarReference = [
  ['2024-04-08T12:00:00Z', [
    ['Mercury', 199, -.394837361913, -.069338316999, .030549371937],
    ['Venus', 299, .693978645309, -.214027925959, -.042982484500],
    ['Earth', 399, -.947956669943, -.322869105248, .000023621003],
    ['Mars', 499, 1.018185740519, -.942133515031, -.044719178750],
    ['Jupiter', 599, 2.915682574648, 4.068387655265, -.082133082108],
    ['Saturn', 699, 9.160858307795, -3.203268411872, -.308886670767],
    ['Uranus', 799, 11.963027997505, 15.522280471132, -.097454687211],
    ['Neptune', 899, 29.857376076952, -1.479674772586, -.657582087443],
    ['Pluto', 999, 17.485852463712, -30.252284974719, -1.818430370941],
  ]],
  ['2040-01-01T00:00:00Z', [
    ['Mercury', 199, .016391949730, -.460807471322, -.039170166189],
    ['Earth', 399, -.164131813551, .969517565120, -.000088091293],
    ['Neptune', 899, 25.256159965940, 15.813164168526, -.907635338724],
    ['Pluto', 999, 31.283400217792, -22.307642348324, -6.663547160100],
  ]],
];

// Same geometric Horizons query, retrieved for the guide's exact vertex times
// (Mercury 199, Pluto 999; DE441 and plu060_merged). Pluto spans both sides
// of the ecliptic here, with Z far from zero.
export const solarGuideVertices = [
  ['Mercury', 64, '1900-01-22T23:48:50.400Z', [-.02624717780635860, -.4628977753377397, -.03533706901297991]],
  ['Pluto', 56, '1954-03-29T00:00:00.000Z', [-28.32461031412366, 20.10057915197307, 6.040028173727658]],
  ['Pluto', 166, '2060-10-10T12:00:00.000Z', [41.78109368648836, -6.460348908851729, -11.39311204635029]],
];
