import * as T from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { solarBodies } from './astronomy.js';
import { seededRandom } from './rocket-models.js';
import { solarDisplayPosition, unpackSolarGuide } from './solar-display.js';

// Short-axis framing radii in illustrated scene units, not AU.
export const FULL_SYSTEM = 31;
export const INNER_SYSTEM = 5.4;
const TRANSITION_RADIUS = FULL_SYSTEM * 1.12;
const FOV = 53;
const viewDirection = new T.Vector3(.18, .93, .33).normalize();
export const SOLAR_ORIENTATION = Object.freeze({
  theta: Math.atan2(viewDirection.x, viewDirection.z), latitude: Math.asin(viewDirection.y),
});
const paintedTilt = -.85; // Show the illustrative surface bands and ring opening, not their poles.
const guideColor = '#50667d', hoverColor = '#9fe7d6';
const guideWidth = 1.5; // CSS pixels, regardless of DPR or distance.
const appearances = [
  { radius: 1.08, colors: ['#f8a145', '#ffe3a0', '#ffbd59'] }, // Sun
  { radius: .34, colors: ['#817775', '#b3a6a2'] }, // Mercury
  { radius: .48, colors: ['#ba8d61', '#f7d5a2', '#e2ad78', '#f5dfb6'], bands: true }, // Venus
  { radius: .52 }, // Earth uses the shared clay globe material
  { radius: .36, colors: ['#b15f49', '#ef9b71', '#d27c55'] }, // Mars
  { radius: 1.08, colors: ['#c18a71', '#e3bd9b', '#f3dbbb', '#d49a7a', '#a56e5d', '#f1c7a2'], bands: true }, // Jupiter
  { radius: .91, colors: ['#d2ae7f', '#f3dcaa', '#fae8bb', '#e2c593'], bands: true, ring: 1.9 }, // Saturn
  { radius: .66, colors: ['#86c6c4', '#b7e4dc', '#9bd5cf'], bands: true }, // Uranus
  { radius: .64, colors: ['#547bbb', '#89ace3', '#6b92d4'], bands: true }, // Neptune
  { radius: .30, colors: ['#947f85', '#d8c6c2', '#aa8b7c'] }, // Pluto
];

export function solarBodyExtent(index) {
  const { radius, ring = 1 } = appearances[index];
  return radius * ring;
}

export function solarCamera(width, height, radius, target) {
  const aspect = width / height;
  const distance = radius * distancePerRadius(aspect);
  const camera = new T.PerspectiveCamera(FOV, aspect, .05, distance + 2 * FULL_SYSTEM);
  frameCamera(camera, target, distance, viewDirection);
  return camera;
}

function distancePerRadius(aspect) {
  const vertical = Math.tan(T.MathUtils.degToRad(FOV / 2));
  const shortAngle = Math.atan(vertical * Math.min(1, aspect));
  return 1 / Math.sin(shortAngle);
}

function frameCamera(camera, target, distance, direction) {
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function paintedSurface({ colors, bands }, index) {
  const width = 128, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  const palette = colors.map(color => new T.Color(color).convertLinearToSRGB());
  const random = seededRandom(353 + index);
  const tint = new T.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = 2 * Math.PI * x / width, v = 2 * Math.PI * y / height;
    const wave = bands ? .5 + .38 * Math.sin(3 * v + .24 * Math.sin(u)) + .10 * Math.sin(9 * v + .4 * Math.cos(3 * u)) :
      .5 + .24 * Math.sin(5 * u + 3 * v) * Math.cos(2 * u - 6 * v) + .15 * Math.sin(8 * u + 2 * v);
    const at = T.MathUtils.clamp(wave + .13 * (random() - .5), 0, 1) * (palette.length - 1);
    const low = Math.floor(at);
    tint.copy(palette[low]).lerp(palette[Math.min(low + 1, palette.length - 1)], at - low);
    const i = 4 * (x + y * width);
    pixels[i] = 255 * tint.r;
    pixels[i + 1] = 255 * tint.g;
    pixels[i + 2] = 255 * tint.b;
    pixels[i + 3] = 255;
  }
  const map = new T.DataTexture(pixels, width, height, T.RGBAFormat);
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

export function solarView(renderer, surfaces, labels, guideData) {
  const scene = new T.Scene();
  scene.background = new T.Color('#070d17');
  const sunlight = new T.PointLight(0xfff1da, 2.6, 0, 0);
  const fill = new T.DirectionalLight(0xe2efff, .82);
  fill.position.copy(viewDirection);
  scene.add(sunlight, fill, new T.AmbientLight(0xbbcde8, .32));
  const sphere = new T.SphereGeometry(1, 32, 20);
  const worlds = solarBodies.map((body, index) => {
    const appearance = appearances[index];
    const material = body === 'Earth' ? surfaces.earth :
      new T.MeshLambertMaterial({ map: paintedSurface(appearance, index),
        emissive: index === 0 ? '#d07822' : 0 });
    const group = new T.Group();
    const globe = new T.Mesh(sphere, material);
    globe.rotation.x = paintedTilt;
    group.add(globe);
    if (appearance.ring) {
      for (const [inner, outer, color] of [[1.24, 1.62, '#c7a279'], [1.68, appearance.ring, '#f0dabb']]) {
        const ring = new T.Mesh(new T.RingGeometry(inner, outer, 64),
          new T.MeshLambertMaterial({ color, side: T.DoubleSide }));
        ring.rotation.x = paintedTilt - Math.PI / 2;
        group.add(ring);
      }
    }
    group.scale.setScalar(appearance.radius);
    const label = document.createElement('span');
    label.textContent = body;
    labels.append(label);
    scene.add(group);
    return { group, label };
  });
  let painted = false, guides;
  function prepareGuides(width, height) {
    guides = guideData.map((encoded, index) => {
      const geometry = new LineGeometry().setPositions(unpackSolarGuide(encoded));
      const material = new LineMaterial({ color: guideColor, linewidth: guideWidth, depthWrite: false,
        resolution: new T.Vector2(width, height) });
      const guide = new Line2(geometry, material);
      guide.renderOrder = 1; // Depth-test against bodies, which draw first.
      guide.userData.body = index + 1; // The Sun has no guide.
      scene.add(guide);
      return guide;
    });
  }
  const halo = new T.Mesh(sphere, new T.MeshBasicMaterial({ color: hoverColor, side: T.BackSide }));
  halo.scale.setScalar(1.07);
  halo.visible = false;
  const camera = new T.PerspectiveCamera(FOV, 1, .05);
  const target = new T.Vector3();
  const startOffset = new T.Vector3();
  const direction = new T.Vector3();
  const projection = new T.Vector3();
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  const pickMeshes = worlds.flatMap(({ group }) => group.children);
  let showGuides = true, hovered = -1, hoverPoint;
  let lastWidth, lastHeight, distanceScale, framedRadius = FULL_SYSTEM, framedFocus = 0, transition;

  function setHover(body) {
    if (body === hovered) return false;
    if (hovered > 0) {
      guides[hovered - 1].material.color.set(guideColor);
      guides[hovered - 1].renderOrder = 1;
      worlds[hovered].label.classList.remove('path-hover', 'path-key');
    }
    hovered = body;
    halo.visible = hovered > 0;
    if (hovered > 0) {
      worlds[hovered].group.add(halo);
      guides[hovered - 1].material.color.set(hoverColor);
      guides[hovered - 1].renderOrder = 2;
      worlds[hovered].label.classList.add('path-hover');
    }
    return true;
  }

  function setGuides(visible) {
    showGuides = visible;
    if (guides) for (const guide of guides) guide.visible = visible;
    if (!visible) clearHover();
  }

  function hover(x, y) {
    const body = pick(x, y, { pathsOnly: true });
    hoverPoint = body > 0 ? [x, y] : undefined;
    return setHover(body);
  }

  function clearHover() {
    hoverPoint = undefined;
    return setHover(-1);
  }

  function beginFocus(real) {
    startOffset.copy(target).sub(worlds[framedFocus].group.position);
    transition = { start: real, from: framedFocus, radius: framedRadius };
  }

  function cancelFocus() { transition = undefined; }

  function draw(positions, { focus, radius, theta, latitude }, width, height, real, { repaint, positionsChanged, pendingHover }) {
    // Submit the bodies before decoding or uploading any guide geometry.
    if (painted && showGuides && !guides) prepareGuides(width, height);
    if (focus === solarBodies.indexOf('Earth')) surfaces.request(false);
    for (const [index, world] of worlds.entries()) {
      world.group.position.fromArray(solarDisplayPosition(positions[index]));
    }
    const destination = worlds[focus].group.position;
    target.copy(destination);
    framedRadius = radius;
    framedFocus = focus;
    if (transition) {
      const elapsed = real - transition.start;
      // Retreat around the old anchor, move across at wide framing, then approach the live target.
      if (elapsed < 240) {
        framedFocus = transition.from;
        target.copy(worlds[framedFocus].group.position).add(startOffset);
        framedRadius = T.MathUtils.lerp(transition.radius, TRANSITION_RADIUS, T.MathUtils.smoothstep(elapsed, 0, 240));
      } else if (elapsed < 500) {
        framedFocus = transition.from;
        target.copy(worlds[framedFocus].group.position).add(startOffset)
          .lerp(destination, T.MathUtils.smoothstep(elapsed, 240, 500));
        framedRadius = TRANSITION_RADIUS;
      } else if (elapsed < 900) {
        framedRadius = T.MathUtils.lerp(TRANSITION_RADIUS, radius, T.MathUtils.smoothstep(elapsed, 500, 900));
      } else cancelFocus();
    }
    if (width !== lastWidth || height !== lastHeight) {
      camera.aspect = width / height;
      distanceScale = distancePerRadius(camera.aspect);
      camera.far = TRANSITION_RADIUS * distanceScale + 2 * FULL_SYSTEM;
      camera.updateProjectionMatrix();
      if (guides) for (const { material } of guides) material.resolution.set(width, height);
      lastWidth = width; lastHeight = height;
    }
    const horizontal = Math.cos(latitude);
    direction.set(Math.sin(theta) * horizontal, Math.sin(latitude), Math.cos(theta) * horizontal);
    frameCamera(camera, target, framedRadius * distanceScale, direction);
    // With an active hover, motion may put another guide or a body under a
    // stationary pointer. Recheck only when model positions changed.
    let hoverChanged = false;
    if (pendingHover || (hoverPoint && positionsChanged)) {
      scene.updateMatrixWorld();
      if (pendingHover) hoverChanged = hover(...pendingHover);
      else if (pick(...hoverPoint, { pathsOnly: true }) !== hovered) clearHover();
    }
    if (!repaint && !hoverChanged) return hovered > 0;

    const focalPixels = camera.projectionMatrix.elements[5] * height / 2;
    for (const [index, world] of worlds.entries()) {
      world.textWidth ??= world.label.offsetWidth;
      const depth = -projection.copy(world.group.position).applyMatrix4(camera.matrixWorldInverse).z;
      projection.copy(world.group.position).project(camera);
      world.x = (projection.x + 1) * width / 2;
      world.y = (1 - projection.y) * height / 2;
      const extent = solarBodyExtent(index);
      world.inView = depth > extent && Math.abs(projection.x) <= 1 && Math.abs(projection.y) <= 1;
      world.size = world.inView ? extent * (focalPixels + Math.hypot(world.x - width / 2, world.y - height / 2)) /
        (depth - extent) : 0;
    }

    // Keep labels attached to their body; the native picker covers conjunctions and offscreen worlds.
    const used = [];
    const order = new Set([hovered, focus, ...solarBodies.keys()]);
    for (const index of order) {
      if (index < 0) continue;
      const { x, y, size, textWidth, label, inView } = worlds[index];
      const slot = inView ? [
        [x + size + 5, y - 9], [x - size - 5 - textWidth, y - 9],
        [x - textWidth / 2, y - size - 23], [x - textWidth / 2, y + size + 5],
      ].find(([left, top]) => {
        const right = left + textWidth, bottom = top + 18;
        return left >= 4 && right <= width - 4 && top >= 4 && bottom <= height - 4 &&
          !used.some(box => left < box.right + 4 && right > box.left - 4 && Math.abs(top - box.top) < 22) &&
          !worlds.some(other => other.label !== label && other.inView &&
            other.x + other.size > left && other.x - other.size < right &&
            other.y + other.size > top && other.y - other.size < bottom);
      }) : undefined;
      // The active guide still needs a name when its world is out of frame.
      label.classList.toggle('path-key', index === hovered && !slot);
      label.style.visibility = slot || index === hovered ? 'visible' : 'hidden';
      if (slot) {
        const [left, top] = slot;
        label.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        used.push({ left, right: left + textWidth, top });
      } else if (index === hovered) label.style.transform = '';
    }
    renderer.render(scene, camera);
    painted = true;
    return hovered > 0;
  }

  function pick(x, y, { touch = false, pathsOnly = false } = {}) {
    if (!lastWidth || x < 0 || x >= 1 || y < 0 || y >= 1 || (pathsOnly && (!showGuides || !guides))) return -1;
    raycaster.setFromCamera(pointer.set(2 * x - 1, 1 - 2 * y), camera);
    const forward = -raycaster.ray.direction.dot(direction);
    raycaster.near = camera.near / forward;
    raycaster.far = camera.far / forward;
    // Intersect the last painted meshes, not enlarged label bounds. Nearest visible
    // surface wins, with exact depth ties retaining the renderer's body order.
    const [hit] = raycaster.intersectObjects(pickMeshes, false);
    if (hit) return pathsOnly ? -1 : worlds.findIndex(({ group }) => group === hit.object.parent);
    if (!showGuides || !guides) return -1;
    raycaster.params.Line2 = { threshold: 2 * (touch ? 12 : 5) - guideWidth };
    // The frontmost eligible guide wins at overlaps. Stable distance sorting
    // preserves Solar System order for equal hits.
    const [path] = raycaster.intersectObjects(guides, false);
    return path?.object.userData.body ?? -1;
  }

  return { draw, pick, setGuides, clearHover, beginFocus, cancelFocus,
    get guidesPending() { return painted && showGuides && !guides; },
    get animating() { return Boolean(transition); } };
}
