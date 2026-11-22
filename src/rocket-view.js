import * as T from 'three';
import { radial } from './globe-view.js';
import { clayFlag, cloud, landingTerrain, moonTexture, starField } from './rocket-set.js';
import { cheeseAlien, clayPalette, clayRocket } from './rocket-models.js';

const V = (x, y, z) => new T.Vector3(x, y, z);
const up = V(0, 1, 0), laneNormal = V(0, 0, 1);
const RAD = Math.PI / 180;
const { lerp, smoothstep } = T.MathUtils;
const liftEnd = 2.8, coastEnd = 6.0, contact = 9.05;
const eject = 9.85, burst = 11.20, unfurl = 11.58, planted = 12.86;
export const rideDuration = 14150;

function localFrame(normal) {
  // Approach from the south of the local vertical so the top of the surface
  // shot stays on the same side of the camera as +Y in the cruise shot.
  const cameraSide = V(.26, -1, .32);
  const forward = cameraSide.clone().addScaledVector(normal, -normal.dot(cameraSide)).normalize();
  const right = V().crossVectors(normal, forward).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, normal, forward));
}

export function rocketView(renderer, earthMap) {
  const scene = new T.Scene();
  scene.background = new T.Color('#0a1124');
  scene.add(starField());
  const lens = new T.PerspectiveCamera(44, 1, .12, 670);
  const matteMoon = moonTexture();
  const earth = body(-41, 19, earthMap, null, '#c5e8ff');
  const moon = body(41, 6.9, matteMoon, matteMoon, '#c2b9b1');
  const key = new T.DirectionalLight('#fff0d5', 2.5);
  key.position.set(-38, 55, 40);
  const rim = new T.DirectionalLight('#b1c8ff', 1.2);
  rim.position.set(24, 19, -35);
  const fill = new T.DirectionalLight('#fff3e7', 1.05);
  scene.add(key, rim, fill, new T.HemisphereLight('#dbe6ff', '#b58885', 1.32));
  const clay = clayPalette();
  const { model, door } = clayRocket(clay);
  const craft = new T.Group(); craft.add(model); scene.add(craft);
  const exhaust = cloud('exhaust'); craft.add(exhaust.group);
  const soil = { earth: landingTerrain(clay, true), moon: landingTerrain(clay, false) };
  scene.add(soil.earth, soil.moon);
  const effects = new T.Group(); scene.add(effects);
  const alien = cheeseAlien(clay), crumbs = cloud('crumbs'), flag = clayFlag(clay);
  effects.add(alien, crumbs.group, flag.group);
  const shadow = new T.Mesh(new T.CircleGeometry(1.45, 48), new T.MeshBasicMaterial({
    color: '#413b42', transparent: true, opacity: .35, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .009;
  scene.add(shadow);
  let start, end, spaceAttitude;

  function body(x, radius, map, bumpMap, color) {
    const material = new T.MeshStandardMaterial({ map, bumpMap, bumpScale: .36, color, roughness: 1 });
    const globe = new T.Mesh(new T.SphereGeometry(radius, 96, 60), material);
    globe.position.x = x;
    scene.add(globe);
    return { globe, radius };
  }

  function station(body, site, terrain) {
    const normal = radial(site.lon * RAD, site.lat * RAD).applyQuaternion(body.globe.quaternion);
    const attitude = localFrame(normal);
    const contactRadius = body.radius + .055;
    const center = body.globe.position;
    const position = normal.clone().multiplyScalar(contactRadius).add(center);
    terrain.position.copy(position);
    terrain.quaternion.copy(attitude);
    return { normal, attitude, position, center, contactRadius };
  }

  function begin(earthSite, moonSite, returning) {
    const earthNormal = radial(earthSite.lon * RAD, earthSite.lat * RAD);
    earth.globe.quaternion.setFromUnitVectors(earthNormal, laneNormal);
    // Illustrative tidal lock: lunar prime meridian faces roughly Earthward.
    moon.globe.rotation.y = 3.65;
    const earthStation = station(earth, earthSite, soil.earth);
    const moonStation = station(moon, moonSite, soil.moon);
    [start, end] = returning ? [moonStation, earthStation] : [earthStation, moonStation];
    spaceAttitude = new T.Quaternion().setFromAxisAngle(laneNormal, returning ? 1.21 : -1.21);
    effects.position.copy(end.position);
    effects.quaternion.copy(end.attitude);
  }

  function resize(width, height, dpi) {
    // Preserve CSS aspect, but give a desktop ride at least 720 physical rows.
    // Narrow viewports use a capped scale instead of inflating to desktop targets.
    const desired = innerWidth >= 1280 && innerHeight >= 720 ? Math.max(dpi, 1280 / width, 720 / height) : Math.min(dpi, 1.5);
    const gpu = renderer.getContext();
    const [maxWidth, maxHeight] = gpu.getParameter(gpu.MAX_VIEWPORT_DIMS) ?? [width, height];
    const scale = Math.min(desired, maxWidth / width, maxHeight / height, 3072 / width, 2160 / height);
    renderer.setPixelRatio(scale);
    renderer.setSize(width, height, false);
    lens.aspect = width / height;
    lens.updateProjectionMatrix();
  }

  const position = V(), chase = V(), target = V(), normal = V(), cursor = V();
  const terminal = new T.Quaternion(), arc = new T.Quaternion();
  const floorFacing = new T.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
  const departureCam = V(-3.9, 2.95, 8.9), arrivalCam = V(3.4, 3.2, 9.6);
  const laneRadius = 36;
  function draw(ms) {
    const t = Math.max(0, ms / 1000);
    const coast = t >= liftEnd && t < coastEnd;
    const leaving = t < liftEnd;
    const site = leaving ? start : end;
    const launch = t / liftEnd, approach = (contact - t) / (contact - coastEnd);
    const altitude = smoothstep(leaving ? launch : approach, 0, 1);
    const spaceMix = coast ? 1 : smoothstep(altitude, .13, .88);
    if (coast) {
      const cruise = smoothstep(t, liftEnd, coastEnd);
      position.copy(start.center).lerp(end.center, cruise).addScaledVector(laneNormal, laneRadius);
    } else {
      // Leave and reach each selected normal radially; rotate around the world
      // only at altitude instead of taking a chord through the far side.
      terminal.setFromUnitVectors(site.normal, laneNormal);
      normal.copy(site.normal).applyQuaternion(arc.identity().slerp(terminal, smoothstep(altitude, .16, 1)));
      position.copy(site.center).addScaledVector(normal, lerp(site.contactRadius, laneRadius, altitude));
    }
    craft.position.copy(position);
    craft.quaternion.copy(site.attitude).slerp(spaceAttitude, spaceMix);
    const airborne = coast ? 1 : smoothstep(altitude, 0, .23);
    model.rotation.set(.06 * Math.sin(t * 8.6) * airborne, .14 * Math.sin(t * 3.6) * airborne,
      .105 * Math.sin(t * 6.7) * airborne);
    // A brief squash keeps the soles at contact while the clay settles.
    const settle = t >= contact ? Math.sin(Math.min((t - contact) / .58, 1) * Math.PI) * .09 : 0;
    model.scale.set(1 + settle / 2, 1 - settle, 1 + settle / 2);
    exhaust.update(t, t < contact ? smoothstep(altitude, .005, .16) : 0);

    const toward = Math.sign(end.center.x - start.center.x);
    const arrivalPull = smoothstep(t, contact - .35, eject + .68);
    chase.copy(leaving ? departureCam : arrivalCam).applyQuaternion(site.attitude);
    // Back the phone camera away just enough to keep the ship and flag in the same shot.
    cursor.set(-toward * 2.7, 4 + 2 * Math.sin(t * .7), lens.aspect < 1.15 ? 19 : 15.5);
    chase.lerp(cursor, spaceMix);
    chase.multiplyScalar(1 + .35 * Math.sin(Math.PI * spaceMix));
    lens.position.copy(position).add(chase);
    cursor.set(lerp(.22, 1.56, arrivalPull), lerp(1.52, 1.40, arrivalPull), .29).applyQuaternion(site.attitude);
    target.copy(cursor).lerp(V(toward * (lens.aspect < 1.15 ? 8 : 3.5), .25, -9), spaceMix ** 1.8).add(position);
    if (!coast) target.addScaledVector(site.normal, -.12 * altitude * (laneRadius - site.contactRadius) * (1 - spaceMix));
    lens.up.copy(up).applyQuaternion(site.attitude).lerp(up, spaceMix).normalize();
    lens.lookAt(target);
    fill.position.copy(lens.position).sub(target).normalize();

    shadow.visible = !coast && altitude < .13;
    shadow.position.copy(site.position).addScaledVector(site.normal, .009);
    shadow.quaternion.copy(site.attitude).multiply(floorFacing);
    shadow.material.opacity = .41 * (1 - smoothstep(altitude, 0, .13));
    const pop = smoothstep(t, eject, eject + .32) * (1 - smoothstep(t, burst, burst + .35));
    door.rotation.x = pop * 1.55;
    alien.visible = t >= eject + .12 && t < burst;
    const hop = smoothstep(t, eject + .12, burst - .20);
    alien.position.set(lerp(.76, 2.84, hop), lerp(.59, .01, hop) + Math.sin(Math.PI * hop) * .93,
      lerp(.56, .94, hop));
    alien.rotation.set(0, .24 + .6 * (1 - hop), -.30 * Math.sin(hop * 7));
    alien.scale.setScalar(lerp(.37, 1, smoothstep(hop, 0, .51)) * (1 + .14 * smoothstep(t, burst - .21, burst)));
    crumbs.group.position.set(2.84, .69, .94);
    crumbs.update(t - burst, 1);
    flag.group.position.set(2.84, 0, .94);
    flag.update(t, smoothstep(t, burst, unfurl + .12), smoothstep(t, unfurl, planted));
    renderer.render(scene, lens);

    if (t < liftEnd) return 'Launch';
    if (t < coastEnd) return 'Across space';
    if (t < contact) return 'Descent';
    if (t < eject) return 'Touchdown';
    if (t < burst) return 'Cheese alien';
    if (t < unfurl) return 'Crumb burst';
    if (t < planted) return 'Unfurling';
    return 'Flag planted';
  }

  return { begin, resize, draw };
}
