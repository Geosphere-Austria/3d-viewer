import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";

import { fetchVertices, fetchTriangleIndices, transform } from "./utils";
import { TRIANGLE_INDICES_URL, VERTICES_URL } from "../config";
import { shaderMaterial } from "../ShaderMaterial";

interface MappedFeature {
  featuregeom_id: number;
  name: string;
  geologicdescription: { "feature type": string; citation: string | null };
  preview: { legend_color: string; legend_text: string };
}

export async function buildMeshes(
  mappedFeatures: MappedFeature[],
  model: Group
) {
  for (const mappedFeature of mappedFeatures) {
    const mesh = await buildMesh(mappedFeature);
    if (mappedFeature.name === "Topography") {
      mesh.visible = false;
    }

    model.add(mesh);
  }
}

async function buildMesh(layerData: MappedFeature) {
  const color = `#${layerData.preview.legend_color}`;
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

  const material = new MeshStandardMaterial({
    color: color,
    metalness: 0.1,
    roughness: 0.5,
    flatShading: true,
    side: DoubleSide,
    wireframe: false,
  });

  const mesh = new Mesh(
    geometry,
    name === "Topography" ? shaderMaterial : material
  );

  mesh.name = name;
  mesh.userData.layerId = geomId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}
