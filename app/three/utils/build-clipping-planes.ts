import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Object3DEventMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
} from "three";
import { DragControls, OrbitControls } from "three/examples/jsm/Addons.js";
import { Extent } from "./build-scene";
import earcut from "earcut";
import {
  ClippingGroup,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  WebGPURenderer,
} from "three/webgpu";
import { vec4 } from "three/tsl";

export enum Orientation {
  X = "X",
  Y = "Y",
  Z = "Z",
  NX = "NX",
  NY = "NY",
  NZ = "NZ",
}

type PlaneMesh = Mesh<PlaneGeometry, MeshBasicNodeMaterial, Object3DEventMap>;
type EdgeMesh = LineSegments<
  EdgesGeometry<PlaneGeometry>,
  LineBasicMaterial,
  Object3DEventMap
>;
type PlaneMeshMap = {
  [key in Orientation]: PlaneMesh;
};
type EdgeMeshMap = {
  [key in Orientation]: EdgeMesh;
};

let currentExtent: Extent;
const BUFFER = 500;

export function buildClippingplanes(
  renderer: WebGPURenderer,
  camera: PerspectiveCamera,
  orbitControls: OrbitControls,
  extent: Extent,
  meshes: Mesh[],
  scene: Scene
) {
  // Set current extent to given extent
  currentExtent = { ...extent };

  const planesData = [
    {
      normal: new Vector3(1, 0, 0),
      d: -extent.xmin,
      orientation: Orientation.X,
    },
    {
      normal: new Vector3(0, 1, 0),
      d: -extent.ymin,
      orientation: Orientation.Y,
    },
    {
      normal: new Vector3(0, 0, 1),
      d: -extent.zmin,
      orientation: Orientation.Z,
    },
    {
      normal: new Vector3(-1, 0, 0),
      d: extent.xmax,
      orientation: Orientation.NX,
    },
    {
      normal: new Vector3(0, -1, 0),
      d: extent.ymax,
      orientation: Orientation.NY,
    },
    {
      normal: new Vector3(0, 0, -1),
      d: extent.zmax,
      orientation: Orientation.NZ,
    },
  ];

  const planeMeshes: PlaneMesh[] = [];
  const edgeMeshes: EdgeMesh[] = [];
  const planes: Plane[] = [];
  const planeMeshMap = {} as Partial<PlaneMeshMap>;
  const edgeMeshMap = {} as Partial<EdgeMeshMap>;

  // Create plane meshes
  for (const p of planesData) {
    let name;
    let planeCenter;
    let width;
    let height;
    if (p.orientation === Orientation.X || p.orientation === Orientation.NX) {
      name = p.orientation;
      width = extent.ymax - extent.ymin;
      height = extent.zmax - extent.zmin;
      planeCenter = new Vector3(
        p.orientation === Orientation.X ? -p.d : p.d,
        extent.ymax - width / 2,
        extent.zmax - height / 2
      );
    } else if (
      p.orientation === Orientation.Y ||
      p.orientation === Orientation.NY
    ) {
      name = p.orientation;
      width = extent.xmax - extent.xmin;
      height = extent.zmax - extent.zmin;
      planeCenter = new Vector3(
        extent.xmax - width / 2,
        p.orientation === Orientation.Y ? -p.d : p.d,
        extent.zmax - height / 2
      );
    } else {
      name = p.orientation;
      width = extent.xmax - extent.xmin;
      height = extent.ymax - extent.ymin;
      planeCenter = new Vector3(
        extent.xmax - width / 2,
        extent.ymax - height / 2,
        p.orientation === Orientation.Z ? -p.d : p.d
      );
    }

    // Plane is given in Hesse normal form: a * x + b* y + c * y + d = 0, where normal = (a, b, c) and d = d
    const plane = new Plane(
      p.normal,
      p.orientation === Orientation.Z || p.orientation === Orientation.NZ
        ? scene.scale.z * p.d
        : p.d
    );

    // Visual representation of the clipping plane
    const planeGeometry = new PlaneGeometry(width, height);
    const planeMesh = new Mesh(
      planeGeometry,
      new MeshBasicNodeMaterial({
        visible: true,
        color: 0xa92a4e,
        transparent: true,
        opacity: 0.1,
        side: DoubleSide,
      })
    );
    planeMesh.name = name;
    planeMesh.userData.plane = plane;

    // Create the edges geometry
    const edgesGeometry = new EdgesGeometry(planeGeometry);
    const edgesMaterial = new LineBasicMaterial({ color: 0xa92a4e });
    const edges = new LineSegments(edgesGeometry, edgesMaterial);

    // Translate meshes
    planeMesh.position.set(planeCenter.x, planeCenter.y, planeCenter.z);
    edges.position.set(planeCenter.x, planeCenter.y, planeCenter.z);

    // Rotate meshes
    if (p.orientation === Orientation.X || p.orientation === Orientation.NX) {
      planeMesh.rotateY(Math.PI / 2);
      planeMesh.rotateZ(Math.PI / 2);
      edges.rotateY(Math.PI / 2);
      edges.rotateZ(Math.PI / 2);
    } else if (
      p.orientation === Orientation.Y ||
      p.orientation === Orientation.NY
    ) {
      planeMesh.rotateX(Math.PI / 2);
      edges.rotateX(Math.PI / 2);
    }

    planeMeshes.push(planeMesh);
    edgeMeshes.push(edges);
    planes.push(plane);

    planeMeshMap[p.orientation] = planeMesh;
    edgeMeshMap[p.orientation] = edges;
  }

  for (const o in Orientation) {
    const capMeshGroupName = `cap-mesh-group-${o}`;
    let capMeshGroup = scene.getObjectByName(capMeshGroupName) as ClippingGroup;
    if (capMeshGroup) {
      capMeshGroup.clear();
    } else {
      capMeshGroup = new ClippingGroup();
      capMeshGroup.name = capMeshGroupName;
      capMeshGroup.clippingPlanes = planes;
      scene.add(capMeshGroup);
    }
  }

  // Add meshes to the scene
  const planeMeshGroup = new Group();
  planeMeshGroup.name = "clipping-planes";
  planeMeshGroup.add(...planeMeshes);

  const edgeMeshGroup = new Group();
  edgeMeshGroup.name = "clipping-plane-edges";
  edgeMeshGroup.add(...edgeMeshes);

  const clippingBox = new Group();
  clippingBox.add(planeMeshGroup, edgeMeshGroup);
  clippingBox.name = "clipping-box";
  scene.add(clippingBox);

  // Enable DragControls for the clipping planes
  const dragControls = new DragControls(
    planeMeshes,
    camera,
    renderer.domElement
  );

  dragControls.addEventListener("dragstart", () => {
    // Disable OrbitControls when dragging starts
    orbitControls.enabled = false;
  });

  dragControls.addEventListener("dragend", () => {
    // Reenable OrbitControls when dragging ends
    orbitControls.enabled = true;
  });

  dragControls.addEventListener("drag", (event) => {
    const object = event.object as PlaneMesh;
    const plane = event.object.userData.plane;
    const width = object.geometry.parameters.width;
    const height = object.geometry.parameters.height;
    const orientation = object.name as Orientation;

    if (orientation === Orientation.Z || orientation === Orientation.NZ) {
      // Fix rotation of dragged mesh
      event.object.rotation.set(0, 0, 0);

      let newZ = 0;
      if (orientation === Orientation.Z) {
        if (event.object.position.z < extent.zmin) {
          newZ = extent.zmin;
        } else if (event.object.position.z > currentExtent.zmax - BUFFER) {
          newZ = currentExtent.zmax - BUFFER;
        } else {
          newZ = event.object.position.z;
        }
      } else {
        if (event.object.position.z > extent.zmax) {
          newZ = extent.zmax;
        } else if (event.object.position.z < currentExtent.zmin + BUFFER) {
          newZ = currentExtent.zmin + BUFFER;
        } else {
          newZ = event.object.position.z;
        }
      }

      // Reset position of plane
      plane.constant = orientation === Orientation.Z ? -newZ : newZ;
      plane.constant = scene.scale.z * plane.constant;

      // Update current extent
      if (orientation === Orientation.Z) {
        currentExtent.zmin = newZ;
      } else {
        currentExtent.zmax = newZ;
      }

      // Set position of dragged meshes
      object.position.x = currentExtent.xmax - width / 2;
      object.position.y = currentExtent.ymax - height / 2;
      object.position.z = newZ;

      const edgeMesh = edgeMeshMap[orientation];
      if (edgeMesh) {
        edgeMesh.position.x = currentExtent.xmax - width / 2;
        edgeMesh.position.y = currentExtent.ymax - height / 2;
        edgeMesh.position.z = newZ;
      }

      // Resize other meshes to disable dragging of clipped surface parts
      resizeMeshes(
        orientation,
        planeMeshMap as PlaneMeshMap,
        edgeMeshMap as EdgeMeshMap
      );
    } else if (
      orientation === Orientation.Y ||
      orientation === Orientation.NY
    ) {
      // Fix rotation of dragged mesh
      event.object.rotation.set(Math.PI / 2, 0, 0);

      let newY = 0;
      if (orientation === Orientation.Y) {
        if (event.object.position.y < extent.ymin) {
          newY = extent.ymin;
        } else if (event.object.position.y > currentExtent.ymax - BUFFER) {
          newY = currentExtent.ymax - BUFFER;
        } else {
          newY = event.object.position.y;
        }
      } else {
        if (event.object.position.y > extent.ymax) {
          newY = extent.ymax;
        } else if (event.object.position.y < currentExtent.ymin + BUFFER) {
          newY = currentExtent.ymin + BUFFER;
        } else {
          newY = event.object.position.y;
        }
      }

      // Reset position of plane
      plane.constant = orientation === Orientation.Y ? -newY : newY;

      // Update current extent
      if (orientation === Orientation.Y) {
        currentExtent.ymin = newY;
      } else {
        currentExtent.ymax = newY;
      }

      // Set position of dragged mesh
      object.position.x = currentExtent.xmax - width / 2;
      object.position.y = newY;
      object.position.z = currentExtent.zmax - height / 2;

      const edgeMesh = edgeMeshMap[orientation];
      if (edgeMesh) {
        edgeMesh.position.x = currentExtent.xmax - width / 2;
        edgeMesh.position.y = newY;
        edgeMesh.position.z = currentExtent.zmax - height / 2;
      }

      // Resize other meshes
      resizeMeshes(
        orientation,
        planeMeshMap as PlaneMeshMap,
        edgeMeshMap as EdgeMeshMap
      );
    } else {
      // Fix rotation of dragged mesh
      event.object.rotation.set(0, Math.PI / 2, Math.PI / 2);

      let newX = 0;
      if (orientation === Orientation.X) {
        if (event.object.position.x < extent.xmin) {
          newX = extent.xmin;
        } else if (event.object.position.x > currentExtent.xmax - BUFFER) {
          newX = currentExtent.xmax - BUFFER;
        } else {
          newX = event.object.position.x;
        }
      } else {
        if (event.object.position.x > extent.xmax) {
          newX = extent.xmax;
        } else if (event.object.position.x < currentExtent.xmin + BUFFER) {
          newX = currentExtent.xmin + BUFFER;
        } else {
          newX = event.object.position.x;
        }
      }

      // Reset position of plane
      plane.constant = orientation === Orientation.X ? -newX : newX;

      // Update current extent
      if (orientation === Orientation.X) {
        currentExtent.xmin = newX;
      } else {
        currentExtent.xmax = newX;
      }

      // Set position of dragged mesh
      object.position.x = newX;
      object.position.y = currentExtent.ymax - width / 2;
      object.position.z = currentExtent.zmax - height / 2;

      const edgeMesh = edgeMeshMap[orientation];
      if (edgeMesh) {
        edgeMesh.position.x = newX;
        edgeMesh.position.y = currentExtent.ymax - width / 2;
        edgeMesh.position.z = currentExtent.zmax - height / 2;
      }

      // Resize other meshes
      resizeMeshes(
        orientation,
        planeMeshMap as PlaneMeshMap,
        edgeMeshMap as EdgeMeshMap
      );
    }

    // Remove existing cap meshes
    const capMeshGroupName = `cap-mesh-group-${orientation}`;
    const capMeshGroup = scene.getObjectByName(
      capMeshGroupName
    ) as ClippingGroup;
    if (capMeshGroup) {
      capMeshGroup.clear();

      // Generate new cap meshes
      generateCapMeshes(
        meshes,
        plane.clone(),
        orientation,
        scene,
        capMeshGroup
      );
    }
  });

  return { planes, dragControls };
}

function resizeMeshes(
  orientation: Orientation,
  planeMeshes: PlaneMeshMap,
  edgeMeshes: EdgeMeshMap
) {
  if (orientation === Orientation.X || orientation === Orientation.NX) {
    // Resize y-clipping-planes
    for (const o of [Orientation.Y, Orientation.NY]) {
      const planeMesh = planeMeshes[o];
      const width = currentExtent.xmax - currentExtent.xmin;
      const height = planeMesh.geometry.parameters.height;
      const y = planeMesh.position.y;
      const newPosition = new Vector3(
        currentExtent.xmax - width / 2,
        y,
        currentExtent.zmax - height / 2
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }

    // Resize z-clipping-planes
    for (const o of [Orientation.Z, Orientation.NZ]) {
      const planeMesh = planeMeshes[o];
      const width = currentExtent.xmax - currentExtent.xmin;
      const height = planeMesh.geometry.parameters.height;
      const z = planeMesh.position.z;
      const newPosition = new Vector3(
        currentExtent.xmax - width / 2,
        currentExtent.ymax - height / 2,
        z
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }
  } else if (orientation === Orientation.Y || orientation === Orientation.NY) {
    // Resize x-clipping-planes
    for (const o of [Orientation.X, Orientation.NX]) {
      const planeMesh = planeMeshes[o];
      const width = currentExtent.ymax - currentExtent.ymin;
      const height = planeMesh.geometry.parameters.height;
      const x = planeMesh.position.x;
      const newPosition = new Vector3(
        x,
        currentExtent.ymax - width / 2,
        currentExtent.zmax - height / 2
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }

    // Resize z-clipping-planes
    for (const o of [Orientation.Z, Orientation.NZ]) {
      const planeMesh = planeMeshes[o];
      const width = planeMesh.geometry.parameters.width;
      const height = currentExtent.ymax - currentExtent.ymin;
      const z = planeMesh.position.z;
      const newPosition = new Vector3(
        currentExtent.xmax - width / 2,
        currentExtent.ymax - height / 2,
        z
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }
  } else {
    // Resize x-clipping-planes
    for (const o of [Orientation.X, Orientation.NX]) {
      const height = currentExtent.zmax - currentExtent.zmin;
      const planeMesh = planeMeshes[o];
      const width = planeMesh.geometry.parameters.width;
      const x = planeMesh.position.x;
      const newPosition = new Vector3(
        x,
        currentExtent.ymax - width / 2,
        currentExtent.zmax - height / 2
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }

    // Resize y-clipping-planes
    for (const o of [Orientation.Y, Orientation.NY]) {
      const planeMesh = planeMeshes[o];
      const width = planeMesh.geometry.parameters.width;
      const height = currentExtent.zmax - currentExtent.zmin;
      const y = planeMesh.position.y;
      const newPosition = new Vector3(
        currentExtent.xmax - width / 2,
        y,
        currentExtent.zmax - height / 2
      );
      resizeClippingPlane(
        o,
        planeMeshes,
        edgeMeshes,
        width,
        height,
        newPosition
      );
    }
  }
}

function resizeClippingPlane(
  orientation: Orientation,
  planeMeshes: PlaneMeshMap,
  edgeMeshes: EdgeMeshMap,
  width: number,
  height: number,
  position: Vector3
) {
  const planeMesh = planeMeshes[orientation];
  const edgeMesh = edgeMeshes[orientation];
  const planeGeometry = new PlaneGeometry(width, height);

  planeMesh.geometry.dispose();
  planeMesh.geometry = planeGeometry;
  planeMesh.position.copy(position);

  edgeMesh.geometry.dispose();
  edgeMesh.geometry = new EdgesGeometry(planeGeometry);
  edgeMesh.position.copy(position);
}

// Extract contour and generate cap
function generateCapMeshes(
  meshes: Mesh[],
  plane: Plane,
  orientation: Orientation,
  scene: Scene,
  capMeshGroup: ClippingGroup
) {
  // Rescale to local coordinates
  if (orientation === Orientation.Z || orientation === Orientation.NZ)
    plane.constant /= scene.scale.z;

  // Iterate over the list of geologic meshes
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position.array;
    const indices = mesh.geometry.index ? mesh.geometry.index.array : null;
    const edges: Array<[Vector3, Vector3]> = [];

    for (
      let i = 0;
      i < (indices ? indices.length : position.length / 3);
      i += 3
    ) {
      const i1 = indices ? indices[i] * 3 : i * 3;
      const i2 = indices ? indices[i + 1] * 3 : (i + 1) * 3;
      const i3 = indices ? indices[i + 2] * 3 : (i + 2) * 3;

      // Account for local translation of the mesh to its original geometry
      const v1 = new Vector3(
        position[i1],
        position[i1 + 1],
        position[i1 + 2] + mesh.position.z
      );
      const v2 = new Vector3(
        position[i2],
        position[i2 + 1],
        position[i2 + 2] + mesh.position.z
      );
      const v3 = new Vector3(
        position[i3],
        position[i3 + 1],
        position[i3 + 2] + mesh.position.z
      );

      // Check if the triangle is cut by the plane
      const d1 = plane.distanceToPoint(v1);
      const d2 = plane.distanceToPoint(v2);
      const d3 = plane.distanceToPoint(v3);

      // Compute intersection points
      const intersections = [];

      if (d1 * d2 < 0) intersections.push(intersectEdge(v1, v2, d1, d2));
      if (d2 * d3 < 0) intersections.push(intersectEdge(v2, v3, d2, d3));
      if (d3 * d1 < 0) intersections.push(intersectEdge(v3, v1, d3, d1));

      if (intersections.length === 2) {
        const start = intersections[0];
        const end = intersections[1];
        edges.push([start, end]);
      }
    }

    // Intersection surface can be a multipolygon consisting of disconnected polygons
    const polygons: Vector3[][] = buildPolygons(edges);

    const color =
      mesh.material instanceof MeshStandardNodeMaterial
        ? mesh.material.color
        : new Color(0.1, 0.1, 0.1);

    const material = new MeshStandardNodeMaterial({
      side: DoubleSide,
      flatShading: true,
      wireframe: scene.userData.wireframe,
      alphaToCoverage: true,
    });

    material.colorNode = vec4(color.r, color.g, color.b, 1.0);

    polygons.forEach((polygon) => {
      const geometry = triangulatePolygon(polygon, plane);

      const capMesh = new Mesh(geometry, material);
      capMesh.visible = mesh.visible;
      capMesh.name = mesh.name;

      // Offset mesh to avoid flickering
      const normal = plane.normal.clone().multiplyScalar(10);

      const positionAttr = capMesh.geometry.attributes.position;
      for (let i = 0; i < positionAttr.count; i++) {
        const x = positionAttr.getX(i) + normal.x;
        const y = positionAttr.getY(i) + normal.y;
        const z = positionAttr.getZ(i) + normal.z;
        positionAttr.setXYZ(i, x, y, z);
      }
      positionAttr.needsUpdate = true;

      if (capMesh && geometry.index && geometry.index.count > 0) {
        capMeshGroup.add(capMesh);
      }
    });
  }
}

// Build polygons by grouping connected intersection edges
function buildPolygons(edges: Array<[Vector3, Vector3]>): Vector3[][] {
  const polygons: Vector3[][] = [];
  const edgeMap = new Map<string, [Vector3, Vector3]>();

  // Populate the edgeMap
  for (const [v1, v2] of edges) {
    edgeMap.set(`${v1.x},${v1.y},${v1.z}-${v2.x},${v2.y},${v2.z}`, [v1, v2]);
  }

  while (edgeMap.size > 0) {
    const polygon: Vector3[] = [];

    // Take any edge as a start
    const firstEdge = edgeMap.values().next().value;

    if (!firstEdge || firstEdge.length < 2) {
      throw new Error("Map is empty: no edges available");
    }

    const start = firstEdge[0];
    const end = firstEdge[1];

    edgeMap.delete(
      `${start.x},${start.y},${start.z}-${end.x},${end.y},${end.z}`
    );

    polygon.push(start, end);
    let lastPoint = end;
    while (true) {
      let foundNextEdge = false;

      for (const [key, [v1, v2]] of edgeMap) {
        // Check if v1 or v2 is the last point to continue the polygon
        if (lastPoint.distanceTo(v1) < 1e-6) {
          polygon.push(v2);
          lastPoint = v2;
          edgeMap.delete(key);
          foundNextEdge = true;
          break;
        } else if (lastPoint.distanceTo(v2) < 1e-6) {
          polygon.push(v1);
          lastPoint = v1;
          edgeMap.delete(key);
          foundNextEdge = true;
          break;
        }
      }

      // Stop if no connected edge is found
      if (!foundNextEdge) break;
    }

    // Ensure valid polygon with at least 3 vertices
    if (polygon.length >= 3) polygons.push(polygon);
  }

  return polygons;
}

function triangulatePolygon(vertices: Vector3[], plane: Plane) {
  // Choose a reference point on the plane (centroid of the vertices)
  const planeOrigin = vertices
    .reduce((sum, v) => sum.add(v.clone()), new Vector3())
    .divideScalar(vertices.length);

  // Construct the local 2D coordinate system
  const N = plane.normal.clone().normalize(); // Plane normal
  const T = new Vector3(1, 0, 0); // Temporary vector for tangent

  // Ensure T is not parallel to N
  if (Math.abs(N.dot(T)) > 0.9) {
    T.set(0, 1, 0);
  }

  const U = new Vector3().crossVectors(N, T).normalize(); // First tangent
  const V = new Vector3().crossVectors(N, U).normalize(); // Second tangent

  const projectedVertices = vertices.map(
    (v) =>
      new Vector2(
        v.clone().sub(planeOrigin).dot(U),
        v.clone().sub(planeOrigin).dot(V)
      )
  );

  // Prepare flat array for triangulation
  const flatVertices: number[] = projectedVertices.flatMap((v) => [v.x, v.y]);

  // Perform triangulation
  const indices = earcut(flatVertices);

  // Create geometry
  const positions: number[] = vertices.flatMap((v) => [v.x, v.y, v.z]);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setIndex(indices);

  return geometry;
}

// Function to find the intersection point between an edge and a plane
function intersectEdge(v1: Vector3, v2: Vector3, d1: number, d2: number) {
  const t = d1 / (d1 - d2);
  return new Vector3(
    v1.x + t * (v2.x - v1.x),
    v1.y + t * (v2.y - v1.y),
    v1.z + t * (v2.z - v1.z)
  );
}
