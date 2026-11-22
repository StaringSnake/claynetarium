import * as T from 'three';
import { EARTH_KM, MOON_KM, RAD } from './astronomy.js';
import { bodySurfaces } from './orbit-surfaces.js';

export function radial(theta, latitude) {
  return new T.Vector3(Math.cos(latitude) * Math.cos(theta), Math.sin(latitude),
    -Math.cos(latitude) * Math.sin(theta));
}

export function globeView(canvas, onUnavailable, onSurfaceReady) {
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) return null;
  const renderer = new T.WebGLRenderer({ canvas, context });
  const scene = new T.Scene();
  scene.background = new T.Color('#070d17');
  const camera = new T.PerspectiveCamera(53, 1, .0001, 550);
  const unitSphere = new T.SphereGeometry(1, 64, 40);
  const surfaces = bodySurfaces(onSurfaceReady);
  const earth = new T.Mesh(unitSphere, surfaces.earth);
  const moon = new T.Mesh(unitSphere, surfaces.moon);
  const earthFrame = new T.Group();
  const marker = new T.Mesh(unitSphere, new T.MeshBasicMaterial({ color: '#ffd38f' }));
  marker.scale.setScalar(.026);
  earthFrame.add(earth, marker);
  const sun = new T.DirectionalLight(0xfff1d9, 2.2);
  scene.add(earthFrame, moon, sun, new T.AmbientLight(0xafc3ed, .13));

  const textCanvas = document.createElement('canvas');
  textCanvas.width = 512; textCanvas.height = 64;
  const textContext = textCanvas.getContext('2d');
  const textTexture = new T.CanvasTexture(textCanvas);
  textTexture.colorSpace = T.SRGBColorSpace;
  const label = new T.Sprite(new T.SpriteMaterial({ map: textTexture }));
  label.center.set(-.03, .46);
  scene.add(label);
  let lastSite;
  function unavailable() {
    surfaces.cancel();
    onUnavailable();
  }
  canvas.addEventListener('webglcontextlost', unavailable, { once: true });

  function resize(width, height, dpi) {
    renderer.setPixelRatio(dpi);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function draw(model, site, surface, orbit, progress) {
    surfaces.request(Boolean(site));
    earthFrame.rotation.y = model.spin;
    sun.position.fromArray(model.sun).normalize().multiplyScalar(500);
    moon.position.fromArray(model.moon);
    if (orbit.overview) moon.position.setLength(3.6);
    moon.scale.setScalar(orbit.overview ? .38 : MOON_KM / EARTH_KM);

    marker.visible = moon.visible = Boolean(site);
    let theta, latitude, vertical;
    if (site) {
      theta = site.lon * RAD + model.spin; latitude = site.lat * RAD;
      vertical = radial(theta, latitude);
      marker.position.copy(radial(site.lon * RAD, latitude)).multiplyScalar(1.005);
      label.position.copy(vertical).multiplyScalar(1.045);
      if (site !== lastSite) {
        textContext.clearRect(0, 0, 512, 64);
        textContext.fillStyle = '#ffd38f'; textContext.font = '34px system-ui';
        textContext.fillText(site.name, 0, 43, 512);
        textTexture.needsUpdate = true; lastSite = site;
      }
    }

    const target = orbit.focus === 'moon' ? moon.position : new T.Vector3();
    const end = radial(orbit.theta, orbit.latitude).multiplyScalar(orbit.distance).add(target);
    camera.up.set(0, 1, 0);
    camera.position.copy(end); camera.lookAt(target);
    if (site && progress < 1) {
      const endRotation = camera.quaternion.clone();
      const north = radial(theta, latitude + Math.PI / 2);
      const east = radial(theta + Math.PI / 2, 0);
      const az = surface.az * RAD, alt = surface.alt * RAD;
      const tangent = north.multiplyScalar(Math.cos(az) * Math.cos(alt))
        .addScaledVector(east, Math.sin(az) * Math.cos(alt)).addScaledVector(vertical, Math.sin(alt));
      // Stay above the sphere even if the user returns from the far side or the Moon.
      const arc = new T.Quaternion().setFromUnitVectors(vertical, end.clone().normalize());
      camera.position.copy(vertical).applyQuaternion(new T.Quaternion().slerp(arc, progress))
        .multiplyScalar(T.MathUtils.lerp(1.001, end.length(), progress ** 1.7));
      camera.up.copy(vertical);
      camera.lookAt(camera.position.clone().add(tangent));
      camera.quaternion.slerp(endRotation, progress);
    }
    label.visible = Boolean(site && vertical.dot(camera.position) > 1.04);
    if (label.visible) {
      const labelSize = Math.max(.028, label.position.distanceTo(camera.position) * .037);
      label.scale.set(labelSize * 8, labelSize, 1);
    }
    renderer.render(scene, camera);
  }

  function pick(x, y) {
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(2 * x - 1, 1 - 2 * y), camera);
    const hit = ray.intersectObject(earth, false)[0];
    if (!hit) return null;
    const { x: px, y: py, z: pz } = earth.worldToLocal(hit.point);
    return { lat: Math.atan2(py, Math.hypot(px, pz)) / RAD, lon: Math.atan2(-pz, px) / RAD };
  }

  return { resize, draw, pick, renderer, surfaces };
}
