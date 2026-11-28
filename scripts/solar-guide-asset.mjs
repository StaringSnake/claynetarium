import { solarOrbitGuides } from '../src/astronomy.js';
import { solarDisplayPosition } from '../src/solar-display.js';

export function solarGuideBuildOptions() {
  const guides = solarOrbitGuides().map(points => {
    const positions = points.flatMap(solarDisplayPosition);
    const bytes = Buffer.alloc(positions.length * 4);
    positions.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
    return bytes.toString('base64');
  });
  return { define: { SOLAR_GUIDE_DATA: JSON.stringify(guides) } };
}
