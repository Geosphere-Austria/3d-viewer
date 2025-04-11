import {
  DataArrayTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  Vector4,
} from "three";
import {
  Break,
  Fn,
  If,
  Loop,
  oneMinus,
  positionWorld,
  texture,
  uniform,
  uniformArray,
  vec4,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

export interface TileData {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  x: number;
  y: number;
  zoom: number;
  texture: Texture;
}

const maxTiles = 48;
const width = 256;
const height = 256;
const size = width * height;

const canvas = new OffscreenCanvas(width, height);
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const tileBounds: Vector4[] = Array(maxTiles).fill(new Vector4(0, 0, 0, 0));

const data = new Uint8Array(4 * size * maxTiles);
const tileCache: {
  [key: string]: {
    imageData: Uint8ClampedArray;
  };
} = {};

const dataArrayTexture = new DataArrayTexture(data, width, height, maxTiles);
dataArrayTexture.format = RGBAFormat;
dataArrayTexture.generateMipmaps = false;
dataArrayTexture.magFilter = LinearFilter;
dataArrayTexture.minFilter = LinearFilter;
dataArrayTexture.colorSpace = SRGBColorSpace;
dataArrayTexture.needsUpdate = true;

// Create shader material
export const topoNodeMaterial = new MeshStandardNodeMaterial({
  alphaToCoverage: true,
});
const tileBoundsUniform = uniformArray(tileBounds);
const dataArrayTextureUniform = uniform(dataArrayTexture);

const fragmentShader = /*#__PURE__*/ Fn(() => {
  const color = vec4(191.0 / 255.0, 209.0 / 255.0, 229.0 / 255.0, 1.0).toVar();
  Loop({ start: 0, end: maxTiles, condition: "<" }, ({ i }) => {
    const bounds = tileBoundsUniform.element(i);

    If(
      positionWorld.x
        .greaterThanEqual(bounds.x)
        .and(positionWorld.x.lessThanEqual(bounds.y))
        .and(positionWorld.y.greaterThanEqual(bounds.z))
        .and(positionWorld.y.lessThanEqual(bounds.w)),
      () => {
        const uv = positionWorld.xy
          .sub(bounds.xz)
          .div(bounds.yw.sub(bounds.xz))
          .toVar();
        uv.y.assign(oneMinus(uv.y));

        const tile = texture(dataArrayTextureUniform.value, uv);
        color.assign(tile.depth(i));
        Break();
      }
    );
  });

  return color;
});

topoNodeMaterial.colorNode = fragmentShader();

let oldKeys: string[] = [];
export function updateTiles(newTiles: TileData[]) {
  if (newTiles.length > maxTiles) {
    newTiles = newTiles.slice(0, maxTiles);
  }

  const newKeys = newTiles.map((t) => getTileDataKey(t));
  const update =
    oldKeys.some((k, i) => k !== newKeys[i]) || oldKeys.length === 0;

  // Only update if tiles changed
  if (update) {
    for (let i = 0; i < newTiles.length; i++) {
      updateDataArrayTexture(newTiles[i], i);
    }

    dataArrayTexture.needsUpdate = true;
    oldKeys = newKeys;
  }
}

// Update buffer
function updateDataArrayTexture(tileData: TileData, index: number) {
  const k = getTileDataKey(tileData);
  const cachedData = tileCache[k]?.imageData;

  if (cachedData) {
    tileBounds[index] = getTileBounds(tileData);
    data.set(cachedData, index * size * 4);
  } else {
    const imageData = getImageData(tileData.texture);

    if (imageData) {
      // Update cache and buffer
      tileCache[k] = { imageData };
      tileBounds[index] = getTileBounds(tileData);
      data.set(imageData, index * size * 4);
    }
  }
}

function getTileDataKey(t: TileData) {
  return `${t.zoom}/${t.x}/${t.y}`;
}

function getTileBounds(t: TileData) {
  return new Vector4(t.xmin, t.xmax, t.ymin, t.ymax);
}

// Create a canvas and draw the image on it
function getImageData(texture: Texture) {
  const image = texture.source.data;

  // Draw the image onto the canvas
  if (ctx) {
    ctx.drawImage(image, 0, 0);

    // Get the pixel data from the canvas
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return imageData.data;
  } else {
    return null;
  }
}
