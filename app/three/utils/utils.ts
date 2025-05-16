import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { Extent } from "./build-scene";
import { unpackEdges, unpackVertices } from "./decoders";
import proj4 from "proj4";

export function getMaxSize(extent: Extent) {
  return Math.max(
    extent.xmax - extent.xmin,
    extent.ymax - extent.ymin,
    extent.zmax - extent.zmin
  );
}

export function getCenter3D(extent: Extent) {
  return new Vector3(
    (extent.xmin + extent.xmax) / 2,
    (extent.ymin + extent.ymax) / 2,
    (extent.zmax + extent.zmin) / 2
  );
}

export async function getMetadata(serviceUrl: string) {
  try {
    const response = await fetch(serviceUrl, {
      method: "GET",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return response.json();
    } else {
      throw new Error("HTTP error status: " + response.status);
    }
  } catch (e) {
    console.log(e);
  }
}

export async function request(url: string) {
  const response = await fetch(url);
  if (response.ok) {
    return response.arrayBuffer();
  } else {
    throw new Error("HTTP error status: " + response.status);
  }
}

export async function fetchTriangleIndices(edgeUrl: string, geomId: string) {
  const url = edgeUrl + geomId;
  const buffer = await request(url);
  return unpackEdges(buffer);
}

export async function fetchVertices(pointUrl: string, geomId: string) {
  const url = pointUrl + geomId;
  const buffer = await request(url);
  return unpackVertices(buffer);
}

// Transformation from EPSG 3034 to a modified EPSG 900913 using the mean radius to align with geo-three
const SOURCE = "EPSG:3034";
const DEST = "EPSG:3857";
proj4.defs(
  SOURCE,
  "+proj=lcc +lat_0=52 +lon_0=10 +lat_1=35 +lat_2=65 +x_0=4000000 +y_0=2800000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);
proj4.defs(
  DEST,
  "+proj=merc +a=6371008 +b=6371008 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
);
export function transform(p: number[]) {
  return proj4(SOURCE, DEST, p);
}

const MAX_EXTENT = 20015111.9287618;
function getTileSize(zoom: number): number {
  const numTiles = Math.pow(2, zoom);
  return (2 * MAX_EXTENT) / numTiles;
}

export function tileBounds(zoom: number, x: number, y: number): number[] {
  const tileSize = getTileSize(zoom);
  const minX = -MAX_EXTENT + x * tileSize;
  const minY = MAX_EXTENT - (y + 1) * tileSize;
  return [minX, tileSize, minY, tileSize];
}

const plane = new Plane(new Vector3(0, 0, 1), 0);

const corners = [
  new Vector2(-1, -1),
  new Vector2(1, 1),
  new Vector2(-1, 1),
  new Vector2(1, -1),
];

export const getFrustumBoundingBox = (camera: PerspectiveCamera) => {
  const points = [];

  const raycaster = new Raycaster();

  for (const ndc of corners) {
    // Convert NDC to world space ray
    raycaster.setFromCamera(ndc, camera);

    // Find intersection with the XY plane
    const intersection = new Vector3();
    const hit = raycaster.ray.intersectPlane(plane, intersection);
    if (hit) {
      points.push(intersection.clone());
    }
  }

  if (points.length > 1) {
    return [
      new Vector3(
        Math.min(points[0].x, points[1].x, points[2].x, points[3].x),
        Math.min(points[0].y, points[1].y, points[2].y, points[3].y),
        0
      ),
      new Vector3(
        Math.max(points[0].x, points[1].x, points[2].x, points[3].x),
        Math.max(points[0].y, points[1].y, points[2].y, points[3].y),
        0
      ),
    ];
  }

  return points;
};
