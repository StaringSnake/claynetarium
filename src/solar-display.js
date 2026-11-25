// Display units only. Keep this origin-centered mapping shared by bodies and
// future orbit guides. Inputs remain heliocentric J2000 ecliptic coordinates in AU.
export function solarDisplayPosition([x, y, z]) {
  const au = Math.hypot(x, y, z);
  if (!au) return [0, 0, 0];
  const scale = 3.6 * au ** -.48;
  return [x * scale, z * scale, -y * scale]; // Three.js uses +Y as up.
}
