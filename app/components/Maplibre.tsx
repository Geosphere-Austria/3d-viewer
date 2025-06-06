"use client";
import maplibregl, {
  AddLayerObject,
  CustomLayerInterface,
  StyleSpecification,
} from "maplibre-gl";

import dataLight from "../styles/basemaps/data_light.json";
import dataDark from "../styles/basemaps/data_dark.json";
import { useContext, useEffect, useRef } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import * as THREE from "three";
import {
  SceneViewContext,
  SceneViewContextType,
} from "../providers/scene-view-provider";
import { buildMeshes } from "../three/utils/build-meshes";
import { getCenter3D, getMetadata, transform } from "../three/utils/utils";
import { SERVICE_URL } from "../three/config";
import { Extent } from "../three/utils/build-scene";

const basemapStyles: { [key: string]: StyleSpecification } = {
  "data-light": dataLight as unknown as StyleSpecification,
  "data-dark": dataDark as unknown as StyleSpecification,
};

function createCustomLayer(
  map: maplibregl.Map,
  model: THREE.Object3D<THREE.Object3DEventMap>,
  extent: Extent
) {
  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;

  const sceneOrigin = new maplibregl.LngLat(0, 0);

  return {
    id: "3d-model",
    type: "custom",
    renderingMode: "3d",

    onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      const center = getCenter3D(extent);

      // Directional light position
      const lightPosition = new THREE.Vector3(
        center.x,
        center.y - 15000,
        extent.zmax + 100000
      ).normalize();

      // Ambient light
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      scene.add(ambientLight);

      // Directional lights
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.01);
      directionalLight.position.set(
        lightPosition.x,
        lightPosition.y,
        lightPosition.z
      );

      scene.add(directionalLight);

      scene.add(model);
      scene.scale.set(1, 1, 10);

      // Use the MapLibre GL JS map canvas for three.js.
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });

      renderer.autoClear = false;
    },

    render(
      _gl: WebGLRenderingContext,
      args: { defaultProjectionData: { mainMatrix: ArrayLike<number> } }
    ) {
      const offsetFromCenterElevation =
        map.queryTerrainElevation(sceneOrigin) || 0;
      const sceneOriginMercator = maplibregl.MercatorCoordinate.fromLngLat(
        sceneOrigin,
        offsetFromCenterElevation
      );

      const sceneTransform = {
        translateX: sceneOriginMercator.x,
        translateY: sceneOriginMercator.y,
        translateZ: sceneOriginMercator.z,
        scale: sceneOriginMercator.meterInMercatorCoordinateUnits(),
      };

      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4()
        .makeTranslation(
          sceneTransform.translateX,
          sceneTransform.translateY,
          sceneTransform.translateZ
        )
        .scale(
          new THREE.Vector3(
            sceneTransform.scale,
            -sceneTransform.scale,
            sceneTransform.scale
          )
        );

      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);

      map.triggerRepaint();
    },
  } as CustomLayerInterface;
}

async function loadModel(map: maplibregl.Map, modelId: string) {
  const modelData = await getMetadata(SERVICE_URL + modelId);
  if (!modelData) return null;

  const mappedFeatures = modelData.mappedfeatures;
  if (!mappedFeatures) return;

  const modelarea = modelData.modelarea;

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

  const model = new THREE.Group();
  model.name = "geologic-model";
  await buildMeshes(mappedFeatures, model);

  const customLayer = createCustomLayer(map, model, extent);

  // Add layer before roads_runway layer of basemap
  map.addLayer(customLayer as AddLayerObject, "hills");
}

export function Maplibre(props: { modelId: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const { setSceneView } = useContext(SceneViewContext) as SceneViewContextType;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: basemapStyles["data-dark"],
      center: [16.3, 48.2],
      zoom: 9,
      maxZoom: 12,
      pitch: 45,
      maxPitch: 85,
      hash: true,
      attributionControl: false,
    });

    loadModel(map, props.modelId);

    return () => {
      map.remove();
    };
  }, [divRef, setSceneView, props.modelId]);

  return <div ref={mapContainerRef} className="h-full"></div>;
}
