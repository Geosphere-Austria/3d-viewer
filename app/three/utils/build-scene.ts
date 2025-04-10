import {
  PerspectiveCamera,
  Scene,
  AmbientLight,
  DirectionalLight,
  Group,
  Object3D,
  OrthographicCamera,
  Color,
  Vector3,
  BufferGeometry,
  BufferAttribute,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  ConeGeometry,
} from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getCenter3D, getMaxSize } from "./utils";
import { WebGPURenderer } from "three/webgpu";

export interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

let controls: OrbitControls;
let renderer: WebGPURenderer;
let camera: PerspectiveCamera;
let scene: Scene;
let overlayCamera: OrthographicCamera;
let overlayScene: Scene;
let maxSize = 0;
const compass = new Group();
const UI_WIDTH = 150;
const UI_HEIGHT = 150;

export function buildScene(container: HTMLElement, extent: Extent) {
  maxSize = getMaxSize(extent);
  const center = getCenter3D(extent);

  const width = container.clientWidth;
  const height = container.clientHeight;

  camera = new PerspectiveCamera(50, width / height, 10, maxSize * 20);

  camera.position.set(center.x, center.y - 200000, extent.zmax + 100000);
  camera.up.set(0, 0, 1);
  camera.lookAt(center);

  // Initialize the renderer
  renderer = new WebGPURenderer({
    logarithmicDepthBuffer: true,
    antialias: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;

  // Handle window resize event to adapt the aspect ratio
  window.addEventListener("resize", () => onWindowResize(container));

  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(center.x, center.y, center.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxDistance = maxSize * 5;
  controls.minDistance = maxSize / 5;
  controls.update();
  controls.saveState();

  // Set wireframe to false on initial load
  scene = new Scene();
  scene.userData.wireframe = false;
  const backgroundColor = new Color(0xbfd1e5);
  scene.background = backgroundColor;

  // Add lights to the scene
  buildDefaultLights(scene, extent);

  // Create Scene for UI overlay
  overlayScene = new Scene();

  // Create an overlay camera
  overlayCamera = new OrthographicCamera(
    -maxSize / 2,
    maxSize / 2,
    maxSize / 2,
    -maxSize / 2,
    0.1,
    10 * maxSize
  );

  // Sync overlay camera with main camera
  overlayCamera.position.copy(camera.position);
  overlayCamera.rotation.copy(camera.rotation);

  // Create compass
  createCompass(center);

  return { renderer, scene, camera, controls };
}

function onWindowResize(container: HTMLElement) {
  // Update the camera's aspect ratio and the renderer's size to reflect
  // the new screen dimensions upon a browser window resize
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Required if controls.enableDamping or controls.autoRotate are set to true
  controls.update();
}

// Callback for animation loop
export function animate(cb: () => void) {
  return () => {
    // Update controls for main camera
    controls.update();

    renderer.render(scene, camera);

    // Render the UI overlay
    renderOverlay();

    cb();
  };
}

// Render the overlay scene as an overlay
function renderOverlay() {
  // Sync overlay camera
  overlayCamera.position.copy(camera.position);
  overlayCamera.rotation.copy(camera.rotation);

  // Sync compass
  const dir = new Vector3();
  camera.getWorldDirection(dir);
  compass.position.set(
    camera.position.x + maxSize * dir.x,
    camera.position.y + maxSize * dir.y,
    camera.position.z + maxSize * dir.z
  );

  // Render the overlay scene to the screen (position it in the bottom left)
  renderer.setViewport(
    10,
    renderer.domElement.height - UI_HEIGHT - 10,
    UI_WIDTH,
    UI_HEIGHT
  );
  renderer.render(overlayScene, overlayCamera);
  renderer.setViewport(
    0,
    0,
    renderer.domElement.width,
    renderer.domElement.height
  );
}

function buildDefaultLights(scene: Scene, extent: Extent) {
  const center = getCenter3D(extent);

  // Directional light position
  const lightPosition = {
    x: center.x,
    y: center.y - 15000,
    z: extent.zmax + 100000,
  };

  const lights = [];

  // Ambient light
  const ambient = new AmbientLight(0xffffff, 1);
  lights.push(ambient);

  // Directional lights
  const directionalLight = new DirectionalLight(0xffffff, 2);
  directionalLight.position.set(
    lightPosition.x,
    lightPosition.y,
    lightPosition.z
  );

  // Create a target for the directional light
  const target = new Object3D();
  target.position.set(center.x, center.y, center.z);
  scene.add(target);

  directionalLight.target = target;
  lights.push(directionalLight);

  const lightsGroup = new Group();
  lightsGroup.name = "lights";
  lightsGroup.add(...lights);
  scene.add(lightsGroup);
}

function createCompass(center: Vector3) {
  const vertices = new Float32Array(
    [
      [0.2, 0, 0],
      [0, 1, 0],
      [-0.2, 0, 0],
      [-0.2, 0, 0],
      [0, -1, 0],
      [0.2, 0, 0],
    ].flat()
  );
  const positions = new BufferAttribute(vertices, 3);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", positions);

  const colors = new Float32Array([
    1,
    12 / 255,
    0,
    1,
    12 / 255,
    0,
    1,
    12 / 255,
    0,
    113 / 255,
    99 / 255,
    183 / 255,
    113 / 255,
    99 / 255,
    183 / 255,
    113 / 255,
    99 / 255,
    183 / 255,
  ]);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new MeshBasicMaterial({
    side: DoubleSide,
    vertexColors: true,
  });

  const needle = new Mesh(geometry, material);

  const coneGeometry = new ConeGeometry(0.1, 0.1, 32);
  const coneMaterial = new MeshBasicMaterial({ color: 0x444444 });
  const cone = new Mesh(coneGeometry, coneMaterial);
  cone.position.z = 0.055;
  cone.rotateX(Math.PI / 2);

  compass.add(needle, cone);
  compass.position.copy(center);
  compass.scale.set(maxSize * 0.5, maxSize * 0.5, maxSize * 0.5);
  overlayScene.add(compass);
}
