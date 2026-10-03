import { BlurFilter, Container, Geometry, GlProgram, GpuProgram, Mesh, RenderTexture, Shader, Sprite, UniformGroup, type Renderer as PixiRenderer } from 'pixi.js';
import { blue, green, red } from './color';

/**
 * The look of the game in one place: every world layer is rendered at NATIVE resolution
 * (≈ 320×180 + a 1 px margin) into its own render texture, then a single full-screen pass
 * combines them at screen resolution:
 *
 *   lit     = terrain · L                       (L = lightmap, sampled bilinearly → smooth falloff)
 *   lit     = lit·(1−ent.a) + ent · max(L, floor)   (creatures/items stay readable in the dark)
 *   lit     = lit·(1−emis.a) + emis             (lava, crystals, glowing sprites: unlit, full bright)
 *   colour  = lit + bloom · k  → white flash mix
 *
 * The lightmap stores L/2 so lights can over-expose up to 2× (warm light turns grass tips yellow).
 * World layers are sampled with nearest filtering (crisp pixels); the sub-native-pixel camera
 * remainder is applied as a screen-pixel offset of the output quad (smooth scrolling).
 */
export const MARGIN = 1;

/** Lightmap encoding: stored value = light / LIGHT_RANGE. */
export const LIGHT_RANGE = 2;

const VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAG = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTerrain;
uniform sampler2D uEntity;
uniform sampler2D uLight;
uniform sampler2D uEmissive;
uniform sampler2D uBloom;
uniform float uFloor;
uniform float uBloomK;
uniform float uFlash;
uniform vec3 uFlashColor;
void main() {
  vec3 L = texture(uLight, vUV).rgb * ${LIGHT_RANGE.toFixed(1)};
  vec3 lit = texture(uTerrain, vUV).rgb * L;
  vec4 e = texture(uEntity, vUV);
  lit = lit * (1.0 - e.a) + e.rgb * max(L, vec3(uFloor));
  vec4 m = texture(uEmissive, vUV);
  lit = lit * (1.0 - m.a) + m.rgb;
  lit += texture(uBloom, vUV).rgb * uBloomK;
  lit = mix(lit, uFlashColor, uFlash);
  finalColor = vec4(lit, 1.0);
}`;

/** The same composite for the WebGPU renderer (Pixi's mesh bind-group conventions: 0 global, 1 local). */
export const COMPOSITE_WGSL = `
struct GlobalUniforms {
  uProjectionMatrix: mat3x3<f32>,
  uWorldTransformMatrix: mat3x3<f32>,
  uWorldColorAlpha: vec4<f32>,
  uResolution: vec2<f32>,
}
struct LocalUniforms {
  uTransformMatrix: mat3x3<f32>,
  uColor: vec4<f32>,
  uRound: f32,
}
struct CompositeUniforms {
  uFloor: f32,
  uBloomK: f32,
  uFlash: f32,
  uFlashColor: vec3<f32>,
}
@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> compositeUniforms: CompositeUniforms;
@group(2) @binding(1) var uTerrain: texture_2d<f32>;
@group(2) @binding(2) var uTerrainSampler: sampler;
@group(2) @binding(3) var uEntity: texture_2d<f32>;
@group(2) @binding(4) var uEntitySampler: sampler;
@group(2) @binding(5) var uLight: texture_2d<f32>;
@group(2) @binding(6) var uLightSampler: sampler;
@group(2) @binding(7) var uEmissive: texture_2d<f32>;
@group(2) @binding(8) var uEmissiveSampler: sampler;
@group(2) @binding(9) var uBloom: texture_2d<f32>;
@group(2) @binding(10) var uBloomSampler: sampler;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) vUV: vec2<f32>,
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>, @location(1) aUV: vec2<f32>) -> VSOutput {
  let mvp = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
  var out: VSOutput;
  out.position = vec4<f32>((mvp * vec3<f32>(aPosition, 1.0)).xy, 0.0, 1.0);
  out.vUV = aUV;
  return out;
}

@fragment
fn mainFragment(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
  let u = compositeUniforms;
  let L = textureSample(uLight, uLightSampler, vUV).rgb * ${LIGHT_RANGE.toFixed(1)};
  var lit = textureSample(uTerrain, uTerrainSampler, vUV).rgb * L;
  let e = textureSample(uEntity, uEntitySampler, vUV);
  lit = lit * (1.0 - e.a) + e.rgb * max(L, vec3<f32>(u.uFloor));
  let m = textureSample(uEmissive, uEmissiveSampler, vUV);
  lit = lit * (1.0 - m.a) + m.rgb;
  lit = lit + textureSample(uBloom, uBloomSampler, vUV).rgb * u.uBloomK;
  lit = mix(lit, u.uFlashColor, u.uFlash);
  return vec4<f32>(lit, 1.0);
}`;

export interface LayerScene {
  /** Root rendered into the layer's texture. */
  readonly root: Container;
  /** Child in world space; positioned by the camera. */
  readonly world: Container;
}

function scene(): LayerScene {
  const root = new Container();
  const world = new Container();
  root.addChild(world);
  return { root, world };
}

function rt(w: number, h: number, linear: boolean): RenderTexture {
  return RenderTexture.create({ width: w, height: h, resolution: 1, antialias: false, scaleMode: linear ? 'linear' : 'nearest', dynamic: true });
}

export class Compositor {
  readonly terrain = scene();
  readonly entities = scene();
  readonly light = scene();
  readonly emissive = scene();
  /** Bloom: blurred copy of the emissive layer + additive halo sprites (world space). */
  readonly bloom = scene();
  /** The on-screen output quad (add to the stage). */
  readonly output: Mesh<Geometry, Shader>;
  /** Native size of the layer textures (view + 2·MARGIN). */
  w = 0;
  h = 0;
  private terrainRT: RenderTexture;
  private entityRT: RenderTexture;
  private lightRT: RenderTexture;
  private emissiveRT: RenderTexture;
  private bloomRT: RenderTexture;
  private bloomSrc: Sprite;
  private uniforms: UniformGroup;
  private ambient = new Float32Array([0, 0, 0, 1]);
  private clearBlack = new Float32Array([0, 0, 0, 1]);
  private clearClear = new Float32Array([0, 0, 0, 0]);
  private readonly scenes: readonly LayerScene[] = [this.terrain, this.entities, this.light, this.emissive, this.bloom];

  constructor() {
    this.terrainRT = rt(8, 8, false);
    this.entityRT = rt(8, 8, false);
    this.lightRT = rt(8, 8, true);
    this.emissiveRT = rt(8, 8, false);
    this.bloomRT = rt(8, 8, true);
    // Blurred emissive copy sits in bloom.root (screen-aligned, not in world space).
    this.bloomSrc = new Sprite(this.emissiveRT);
    const blur = new BlurFilter({ strength: 6, quality: 3, kernelSize: 9 });
    blur.resolution = 1;
    this.bloomSrc.filters = [blur];
    this.bloom.root.addChildAt(this.bloomSrc, 0);
    this.uniforms = new UniformGroup({
      uFloor: { value: 0.5, type: 'f32' },
      uBloomK: { value: 0.9, type: 'f32' },
      uFlash: { value: 0, type: 'f32' },
      uFlashColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    });
    const geometry = new Geometry({
      attributes: {
        aPosition: [0, 0, 1, 0, 1, 1, 0, 1],
        aUV: [0, 0, 1, 0, 1, 1, 0, 1],
      },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    // GLSL for WebGL (preferred by main.ts) and WGSL for WebGPU; samplers only matter to WebGPU.
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'shardfall-composite' }),
      gpuProgram: GpuProgram.from({
        name: 'shardfall-composite',
        vertex: { source: COMPOSITE_WGSL, entryPoint: 'mainVertex' },
        fragment: { source: COMPOSITE_WGSL, entryPoint: 'mainFragment' },
      }),
      resources: {
        compositeUniforms: this.uniforms,
        uTerrain: this.terrainRT.source,
        uTerrainSampler: this.terrainRT.source.style,
        uEntity: this.entityRT.source,
        uEntitySampler: this.entityRT.source.style,
        uLight: this.lightRT.source,
        uLightSampler: this.lightRT.source.style,
        uEmissive: this.emissiveRT.source,
        uEmissiveSampler: this.emissiveRT.source.style,
        uBloom: this.bloomRT.source,
        uBloomSampler: this.bloomRT.source.style,
      },
    });
    this.output = new Mesh({ geometry, shader });
  }

  /** Resize layer textures to a native view of vw×vh px (no-op when unchanged). */
  resize(vw: number, vh: number): void {
    const w = Math.ceil(vw) + MARGIN * 2;
    const h = Math.ceil(vh) + MARGIN * 2;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const t of [this.terrainRT, this.entityRT, this.lightRT, this.emissiveRT, this.bloomRT]) t.resize(w, h, 1);
  }

  /** Readability floor for the entity layer (0 = fully lit by the lightmap, 1 = unlit). */
  set floor(v: number) {
    this.uniforms.uniforms.uFloor = v;
  }

  set bloomStrength(v: number) {
    this.uniforms.uniforms.uBloomK = v;
  }

  /** 0..1 full-screen flash towards `color` (hit-stop juice). */
  setFlash(amount: number, color = 0xffffff): void {
    const u = this.uniforms.uniforms;
    u.uFlash = amount;
    const c = u.uFlashColor as Float32Array;
    c[0] = red(color) / 255;
    c[1] = green(color) / 255;
    c[2] = blue(color) / 255;
  }

  /** Ambient light colour (already scaled 0..LIGHT_RANGE) the lightmap is cleared to. */
  setAmbient(r: number, g: number, b: number): void {
    this.ambient[0] = Math.min(1, r / LIGHT_RANGE);
    this.ambient[1] = Math.min(1, g / LIGHT_RANGE);
    this.ambient[2] = Math.min(1, b / LIGHT_RANGE);
  }

  /** Place every layer's world container for an integer camera position (native px). */
  setCamera(ix: number, iy: number): void {
    const scenes = this.scenes;
    for (let i = 0; i < scenes.length; i++) scenes[i]!.world.position.set(MARGIN - ix, MARGIN - iy);
  }

  /** Render all layers; then place the output quad: `fx,fy` = sub-pixel camera remainder (0..1). */
  render(r: PixiRenderer, scale: number, fx: number, fy: number): void {
    r.render({ container: this.terrain.root, target: this.terrainRT, clear: true, clearColor: this.clearBlack });
    r.render({ container: this.entities.root, target: this.entityRT, clear: true, clearColor: this.clearClear });
    r.render({ container: this.light.root, target: this.lightRT, clear: true, clearColor: this.ambient });
    r.render({ container: this.emissive.root, target: this.emissiveRT, clear: true, clearColor: this.clearClear });
    r.render({ container: this.bloom.root, target: this.bloomRT, clear: true, clearColor: this.clearBlack });
    this.output.scale.set(this.w * scale, this.h * scale);
    this.output.position.set(-Math.round((MARGIN + fx) * scale), -Math.round((MARGIN + fy) * scale));
  }

  destroy(): void {
    this.output.destroy();
    for (const t of [this.terrainRT, this.entityRT, this.lightRT, this.emissiveRT, this.bloomRT]) t.destroy(true);
  }
}
