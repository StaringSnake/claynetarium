// Display units only. Keep this origin-centered mapping shared by bodies and
// orbit guides. Inputs remain heliocentric J2000 ecliptic coordinates in AU.
export function solarDisplayPosition([x, y, z]) {
  const au = Math.hypot(x, y, z);
  if (!au) return [0, 0, 0];
  const scale = 3.6 * au ** -.48;
  return [x * scale, z * scale, -y * scale]; // Three.js uses +Y as up.
}

// Build-time Float32 coordinates packed in little-endian order, bundled offline.
export function unpackSolarGuide(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const positions = new Float32Array(bytes.length / 4);
  for (let i = 0; i < positions.length; i++) positions[i] = view.getFloat32(i * 4, true);
  return positions;
}
