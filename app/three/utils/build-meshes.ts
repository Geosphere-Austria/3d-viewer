import { BufferAttribute, BufferGeometry, DoubleSide, Mesh } from "three";

import { fetchVertices, fetchTriangleIndices, transform } from "./utils";
import { TRIANGLE_INDICES_URL, VERTICES_URL } from "../config";
import { topoNodeMaterial } from "../ShaderMaterial";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { color } from "three/tsl";

interface MappedFeature {
  featuregeom_id: number;
  name: string;
  geologicdescription: { "feature type": string; citation: string | null };
  preview: { legend_color: string; legend_text: string };
}

export async function buildMeshes(mappedFeatures: MappedFeature[]) {
  const meshes = [];
  for (let i = 0; i < mappedFeatures.length; i++) {
    const layerData = mappedFeatures[i];
    const mesh = await buildMesh(layerData);
    if (layerData.name === "Topography") {
      mesh.visible = false;
    } else {
      mesh.visible = true;
    }
    meshes.push(mesh);
  }

  return meshes;
}

async function buildMesh(layerData: MappedFeature) {
  const colorHex = `#${layerData.preview.legend_color}`;
  const name = layerData.preview.legend_text;
  const geomId = layerData.featuregeom_id.toString();

  const geometry = new BufferGeometry();
  const vertices = await fetchVertices(VERTICES_URL, geomId);

  // Transform coordinates to EPSG 3857
  const vertices3857 = new Float32Array(vertices.length);

  // Reduce coordinate precision
  for (let i = 0; i < vertices.length; i += 3) {
    const vertex = Array.from(vertices.slice(i, i + 3));
    vertices3857.set(
      transform(vertex).map((c) => parseInt(c.toFixed(0))),
      i
    );
  }

  const positions = new BufferAttribute(vertices3857, 3);
  geometry.setAttribute("position", positions);

  const indexArray = await fetchTriangleIndices(TRIANGLE_INDICES_URL, geomId);
  const indices = new BufferAttribute(indexArray, 1);

  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new MeshStandardNodeMaterial({
    color: colorHex,
    metalness: 0.1,
    roughness: 0.5,
    flatShading: true,
    side: DoubleSide,
    alphaToCoverage: true,
  });

  // Required by ClippingGroup otherwise clipping does not work
  material.colorNode = color(colorHex);

  const mesh = new Mesh(
    geometry,
    name === "Topography" ? topoNodeMaterial : material
  );
  mesh.name = name;
  mesh.userData.layerId = geomId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}
