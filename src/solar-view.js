import * as T from 'three';
import { solarBodies } from './astronomy.js';

// Radius of the short viewport axis in AU. Pluto's aphelion is about 49 AU.
export const FULL_SYSTEM = 56;
export const INNER_SYSTEM = 1.85;
export const CLOSEST_SYSTEM = .25;

export function solarFrustum(width, height, radius) {
  const auPerPixel = 2 * radius / Math.min(width, height);
  return { auPerPixel, halfWidth: width * auPerPixel / 2, halfHeight: height * auPerPixel / 2 };
}

const colors = ['#ffcd77', '#bfc1cb', '#eac196', '#74bfeb', '#ee967f',
  '#edbd9f', '#efdaac', '#a9e3de', '#a2b7ff', '#d0bac4'];

export function solarView(renderer, labels) {
  const scene = new T.Scene();
  scene.background = new T.Color('#070d17');
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 250);
  camera.position.z = 125; // Looking down on the ecliptic; retain orbital height as depth.
  const geometry = new T.CircleGeometry(1, 24);
  const markers = solarBodies.map((body, index) => {
    const dot = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: colors[index], depthTest: false }));
    const label = document.createElement('span');
    label.textContent = body;
    labels.append(label);
    scene.add(dot);
    return { dot, label, projected: new T.Vector3() };
  });

  function draw(positions, { focus, radius }, width, height) {
    const { auPerPixel, halfWidth, halfHeight } = solarFrustum(width, height, radius);
    Object.assign(camera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const [cx, cy, cz] = positions[focus];
    // Cache CSS text widths for collision checks; zoom and playback don't reflow labels.
    for (const marker of markers) marker.textWidth ??= marker.label.offsetWidth;
    for (const [index, marker] of markers.entries()) {
      const [x, y, z] = positions[index];
      marker.dot.position.set(x - cx, y - cy, z - cz);
      marker.size = index === 0 ? 7 : index === focus ? 5 : 3.5;
      marker.dot.renderOrder = index === focus ? 2 : index === 0 ? 1 : 0;
      marker.dot.scale.setScalar(marker.size * auPerPixel);
      marker.projected.copy(marker.dot.position).project(camera);
      marker.x = (marker.projected.x + 1) * width / 2;
      marker.y = (1 - marker.projected.y) * height / 2;
    }

    // Prioritize the centered body; no labels are moved away from their markers.
    const used = [];
    const order = [focus, ...solarBodies.keys()].filter((index, i) => i === 0 || index !== focus);
    for (const index of order) {
      const { x, y, size, textWidth, label } = markers[index];
      const top = y - 9;
      const left = x >= 0 && x <= width && top >= 0 && top + 18 <= height ?
        [x + size + 5, x - size - 5 - textWidth].find(left => {
          const right = left + textWidth;
          return left >= 4 && right <= width - 4 &&
            !used.some(box => left < box.right + 4 && right > box.left - 4 && Math.abs(top - box.top) < 20) &&
            !markers.some(other => other.label !== label &&
              other.x + other.size > left && other.x - other.size < right && Math.abs(other.y - y) < 12);
        }) : undefined;
      label.style.visibility = left === undefined ? 'hidden' : 'visible';
      if (left !== undefined) {
        label.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        used.push({ left, right: left + textWidth, top });
      }
    }
    renderer.render(scene, camera);
  }
  return { draw };
}
