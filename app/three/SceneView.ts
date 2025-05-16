import {
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { buildMeshes } from "./utils/build-meshes";
import { Extent, animate, buildScene } from "./utils/build-scene";
import { getMetadata, tileBounds, transform } from "./utils/utils";
import { MODEL_ID, SERVICE_URL } from "./config";
import {
  Orientation,
  buildClippingplanes,
} from "./utils/build-clipping-planes";
import {
  buildCoordinateGrid,
  buildHeightGrid,
} from "./utils/build-coordinate-grid";
import {
  DragControls,
  OBJExporter,
  OrbitControls,
} from "three/examples/jsm/Addons.js";
import {
  LODFrustum,
  MapPlaneNode,
  MapView,
  OpenStreetMapsProvider,
} from "geo-three";
import { Data, createSVG } from "./utils/create-borehole-svg";
import { TileData, updateTiles } from "./ShaderMaterial";

export type CustomEvent = CustomEventInit<{
  element: SVGSVGElement | null;
}>;

export class SceneView extends EventTarget {
  private _scene: Scene;
  private _model: Group;
  private _camera: PerspectiveCamera;
  private _container: HTMLElement;
  private _raycaster: Raycaster;
  private _extent: Extent;
  private _startX: number = 0;
  private _startY: number = 0;
  private _isDragging: boolean = false;
  private static _DRAG_THRESHOLD = 5;
  private _callback: EventListenerOrEventListenerObject | null = null;
  private _orbitControls: OrbitControls;
  private _dragControls: DragControls | null = null;
  private _renderer: WebGLRenderer;
  private static _DISPLACEMENT = 2000;

  constructor(
    scene: Scene,
    model: Group,
    camera: PerspectiveCamera,
    container: HTMLElement,
    extent: Extent,
    orbitControls: OrbitControls,
    renderer: WebGLRenderer
  ) {
    super();
    this._scene = scene;
    this._model = model;
    this._camera = camera;
    this._container = container;
    this._raycaster = new Raycaster();
    this._extent = extent;
    this._orbitControls = orbitControls;
    this._renderer = renderer;
  }

  static async create(container: HTMLElement, modelId: string) {
    const data = await init(container, modelId);
    if (data) {
      const { scene, model, camera, extent, controls, renderer } = data;

      return new SceneView(
        scene,
        model,
        camera,
        container,
        extent,
        controls,
        renderer
      );
    } else {
      return null;
    }
  }

  get scene() {
    return this._scene;
  }

  get model() {
    return this._model;
  }

  get camera() {
    return this._camera;
  }

  toggleClippingBox(on = true) {
    if (on) {
      this._resetClippingBox();
    } else {
      this._removeClippingBoxObjects();
    }
  }

  toggleLayerVisibility(layerName: string) {
    const mesh = this._model.getObjectByName(layerName);
    if (mesh) {
      mesh.visible = !mesh.visible;
    }

    // Set visibility for any existing cap meshes
    for (const key of Object.values(Orientation)) {
      const name = `cap-mesh-group-${key}`;
      const capMeshGroup = this._scene.getObjectByName(name);

      if (capMeshGroup) {
        for (const m of capMeshGroup.children) {
          if (m && m.name === layerName) {
            m.visible = !m.visible;
          }
        }
      }
    }
  }

  toggleCoordinateGrid() {
    const group = this._scene.getObjectByName("coordinate-grid");
    if (group) {
      group.visible = !group.visible;
    }
  }

  toggleWireFrame() {
    // Set global wireframe mode data
    this._scene.userData.wireframe = !this._scene.userData.wireframe;

    // Set wireframe for model
    const model = this._model;
    model.children.forEach((child) => {
      const material = (child as Mesh).material as MeshStandardMaterial;
      material.wireframe = !material.wireframe;
    });

    // Set wireframe for any existing cap meshes
    for (const key of Object.values(Orientation)) {
      const name = `cap-mesh-group-${key}`;
      const capMeshGroup = this._scene.getObjectByName(name);

      if (capMeshGroup) {
        capMeshGroup.children.forEach((mesh) => {
          const material = (mesh as Mesh).material as MeshStandardMaterial;
          if (material) {
            material.wireframe = !material.wireframe;
          }
        });
      }
    }
  }

  private _onPointerClick(event: MouseEvent) {
    // Convert screen position to NDC (-1 to +1 range)
    const pointer = new Vector2();
    const clientRectangle = this._container.getBoundingClientRect();
    pointer.x = (event.clientX / clientRectangle.width) * 2 - 1;
    pointer.y = -(event.clientY / clientRectangle.height) * 2 + 1;

    // Raycast from the camera
    this._raycaster.setFromCamera(pointer, this._camera);

    // Intersect with plane
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const worldPoint = new Vector3();
    this._raycaster.ray.intersectPlane(plane, worldPoint);

    // Cast a vertical ray from above
    this._castVerticalRay(worldPoint);
  }

  private _castVerticalRay(targetPosition: Vector3) {
    const z = this._extent.zmax + 10000;
    const startPoint = new Vector3(targetPosition.x, targetPosition.y, z);

    const direction = new Vector3(0, 0, -1);
    this._raycaster.set(startPoint, direction);

    // Check intersections with objects in the scene
    const meshes = this._model.children.filter((c) => c.name !== "Topography");
    const intersects = this._raycaster.intersectObjects(meshes, true);

    // Remove existing point and add visual marker
    this._removePoint();
    this._addPoint(targetPosition);

    // Iterate over intersections
    if (intersects.length > 0) {
      const data: Data[] = [];
      for (let i = 0; i < intersects.length; i += 2) {
        const depthStart = intersects[i].point.z;
        const depthEnd = intersects[i + 1].point.z;
        const name = intersects[i].object.name;
        const color = `#${(
          (intersects[i].object as Mesh).material as MeshStandardMaterial
        ).color.getHexString()}`;

        // Avoid duplicate entries, just update the depth information
        const index = data.findIndex((d) => d.name === name);
        if (index > -1) {
          data[index] = {
            depthStart: data[index].depthStart,
            depthEnd,
            name,
            color,
          };
        } else {
          data.push({ depthStart, depthEnd, name, color });
        }
      }

      const element = createSVG(data, 400, 600, this._extent);
      const event = new CustomEvent("svg-created", {
        detail: { element },
      });
      this.dispatchEvent(event);
    } else {
      const event = new CustomEvent("svg-created", {
        detail: null,
      });
      this.dispatchEvent(event);
    }
  }

  private _pointerDownListener = (event: PointerEvent) => {
    this._isDragging = false;
    this._startX = event.clientX;
    this._startY = event.clientY;
  };

  private _pointerMoveListener = (event: PointerEvent) => {
    if (
      Math.abs(event.clientX - this._startX) > SceneView._DRAG_THRESHOLD ||
      Math.abs(event.clientY - this._startY) > SceneView._DRAG_THRESHOLD
    ) {
      this._isDragging = true;
    }
  };

  private _pointerUpListener = (event: PointerEvent) => {
    if (!this._isDragging) {
      this._onPointerClick(event);
    }
  };

  enableRaycaster(callback: EventListenerOrEventListenerObject) {
    this._container.addEventListener("pointerdown", this._pointerDownListener);
    this._container.addEventListener("pointermove", this._pointerMoveListener);
    this._container.addEventListener("pointerup", this._pointerUpListener);

    // Add event listener for svg-created event
    this.addEventListener("svg-created", callback);
    this._callback = callback;
  }

  disableRaycaster() {
    this._container.removeEventListener(
      "pointerdown",
      this._pointerDownListener
    );
    this._container.removeEventListener(
      "pointermove",
      this._pointerMoveListener
    );
    this._container.removeEventListener("pointerup", this._pointerUpListener);

    if (this._callback) {
      this.removeEventListener("svg-created", this._callback);
    }
  }

  // Add point marker for bore profiles
  private _addPoint(point: Vector3) {
    const geometry = new SphereGeometry(1000, 16, 16);
    const material = new MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new Mesh(geometry, material);
    sphere.name = "point-marker";

    sphere.position.set(point.x, point.y, point.z);
    this._scene.add(sphere);
  }

  private _removePoint() {
    const o = this._scene.getObjectByName("point-marker");

    if (o) {
      this._scene.remove(o);
    }
  }

  // Function to export the group as an OBJ file
  exportOBJ() {
    const exporter = new OBJExporter();
    const objString = exporter.parse(this._model);

    // Create a Blob and trigger a download
    const blob = new Blob([objString], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "geologic_model.obj";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Reset view to initial extent
  resetView() {
    this._orbitControls.reset();
  }

  private _removeClippingBoxObjects() {
    // Remove existing boxes
    const box = this._scene.getObjectByName("clipping-box");
    if (box) {
      this._scene.remove(box);
    }

    // Remove existing cap meshes
    for (const o in Orientation) {
      const capMeshGroupName = `cap-mesh-group-${o}`;
      let capMeshGroup = this._scene.getObjectByName(capMeshGroupName);
      while (capMeshGroup) {
        this._scene.remove(capMeshGroup);
        capMeshGroup = this._scene.getObjectByName(capMeshGroupName);
      }
    }

    // Remove drag controls
    if (this._dragControls) {
      this._dragControls.dispose();
      this._dragControls = null;
    }

    // Remove clipping planes
    for (const mesh of this._model.children) {
      ((mesh as Mesh).material as Material).clippingPlanes = null;
    }
  }

  // Reset clipping box
  private _resetClippingBox() {
    this._removeClippingBoxObjects();

    const { planes, dragControls } = buildClippingplanes(
      this._renderer,
      this._camera,
      this._orbitControls,
      this._extent,
      this._model.children as Mesh[],
      this._scene
    );

    this._dragControls = dragControls;

    // Add clipping planes to the meshes
    for (const mesh of this._model.children) {
      ((mesh as Mesh).material as Material).clippingPlanes = planes;
    }
  }

  // Explode meshes
  explode(explode: boolean) {
    if (explode) {
      // Save previous zmax value
      this._scene.userData.zmax = this._extent.zmax;

      const maxDisplacement =
        this._model.children.length * SceneView._DISPLACEMENT;

      this._extent.zmax += maxDisplacement;
    } else {
      // Reset extent
      this._extent.zmax = this._scene.userData.zmax;
    }

    // Reset clipping box
    const box = this._scene.getObjectByName("clipping-box");
    if (box && box.visible) {
      this._resetClippingBox();
    }

    for (let i = 0; i < this._model.children.length; i++) {
      const mesh = this._model.children[i];

      if (explode) {
        const displacement =
          (this._model.children.length - i - 1) * SceneView._DISPLACEMENT;
        mesh.userData.originalPosition = mesh.position.clone();
        mesh.translateZ(displacement);
      } else {
        if (mesh.userData.originalPosition) {
          mesh.position.copy(mesh.userData.originalPosition);
        }
      }
    }
  }

  // Set z scaling factor
  setZScale(scale: number) {
    // Set scale factor
    this._scene.scale.set(1, 1, scale);

    // Reset clipping box
    const box = this._scene.getObjectByName("clipping-box");
    if (box && box.visible) {
      this._resetClippingBox();
    }
  }
}

async function init(container: HTMLElement, modelId = MODEL_ID) {
  const modelData = await getMetadata(SERVICE_URL + modelId);
  if (!modelData) return null;

  const mappedFeatures = modelData.mappedfeatures;
  const modelarea = modelData.modelarea;

  if (!mappedFeatures) return null;

  // Transfrom extent to EPSG 3857
  const pmin = transform([modelarea.x.min, modelarea.y.min, modelarea.z.min]);
  const pmax = transform([modelarea.x.max, modelarea.y.max, modelarea.z.max]);
  const extent: Extent = {
    xmin: pmin[0],
    xmax: pmax[0],
    ymin: pmin[1],
    ymax: pmax[1],
    zmin: pmin[2],
    zmax: pmax[2],
  };

  const { renderer, scene, camera, controls } = buildScene(container, extent);

  // Start render loop
  renderer.setAnimationLoop(animate(() => {}));

  // Build the 3D model
  const model = new Group();
  model.name = "geologic-model";
  scene.add(model);
  await buildMeshes(mappedFeatures, model);

  // Add a coordinate grid to the scene
  const { gridHelper, annotations } = buildCoordinateGrid(extent);
  const { heightGridHelper, heightAnnotations } = buildHeightGrid(extent);
  const annotationsGroup = new Group();
  annotationsGroup.name = "coordinate-grid";
  annotationsGroup.add(
    ...annotations,
    gridHelper,
    ...heightAnnotations,
    heightGridHelper
  );
  annotationsGroup.visible = false;
  scene.add(annotationsGroup);

  // Create a map tiles provider object
  const provider = new OpenStreetMapsProvider();

  // Create the map view for OSM topography
  const lod = new LODFrustum();
  lod.simplifyDistance = 225;
  lod.subdivideDistance = 80;

  const map = new MapView(MapView.PLANAR, provider);
  map.lod = lod;
  map.rotateX(Math.PI / 2);

  map.name = "osm-topography";
  map.visible = false;
  scene.add(map);

  // Update render loop to include topography
  const topography = scene.getObjectByName("Topography") as Mesh;
  renderer.setAnimationLoop(
    animate(rendererCallback(camera, renderer, scene, map, extent, topography))
  );

  return {
    scene,
    model,
    camera,
    extent,
    controls,
    renderer,
  };
}

function rendererCallback(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  scene: Scene,
  map: MapView,
  extent: Extent,
  topography: Mesh | undefined
) {
  return () => {
    if (topography && topography.visible) {
      map.lod.updateLOD(map, camera, renderer, scene);
      const tiles: TileData[] = [];
      traverse(map.root, extent, tiles);
      tiles.sort((a, b) => b.zoom - a.zoom);

      updateTiles(tiles);
    }
  };
}

function traverse(node: MapPlaneNode, extent: Extent, tiles: TileData[]) {
  const bounds = tileBounds(node.level, node.x, node.y);

  const xmin = bounds[0];
  const ymin = bounds[2];
  const xmax = xmin + bounds[1];
  const ymax = ymin + bounds[3];

  if (
    ((xmax >= extent.xmin && xmax <= extent.xmax) ||
      (xmin >= extent.xmin && xmin <= extent.xmax)) &&
    ((ymax >= extent.ymin && ymax <= extent.ymax) ||
      (ymin >= extent.ymin && ymin <= extent.ymax))
  ) {
    const texture = (node.material as MeshPhongMaterial).map;
    if (texture) {
      tiles.push({
        xmin,
        ymin,
        xmax,
        ymax,
        x: node.x,
        y: node.y,
        zoom: node.level,
        texture,
      });
    }
  }

  for (const c of node.children) {
    traverse(c as MapPlaneNode, extent, tiles);
  }
}
