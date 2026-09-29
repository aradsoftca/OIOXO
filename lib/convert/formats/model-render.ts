/**
 * GLB / glTF → PNG snapshot or turntable GIF, rendered on the user's GPU with
 * three.js (loaded only when this conversion runs). The model is centred,
 * framed to its bounding sphere and lit by a neutral studio environment.
 *
 * Limits: a .gltf that points at external .bin/texture files cannot resolve
 * them from a single dropped file (embedded/data-URI .gltf and .glb work);
 * Draco-compressed meshes need a decoder we don't ship.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenderOpts { size?: number; background?: string | null }

async function setup(buffer: ArrayBuffer, size: number, background: string | null) {
  const THREE: any = await import('three');
  const { GLTFLoader }: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { RoomEnvironment }: any = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { MeshoptDecoder }: any = await import('three/examples/jsm/libs/meshopt_decoder.module.js');

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf: any = await new Promise((resolve, reject) => {
    loader.parse(buffer, '', resolve, (e: unknown) => {
      const msg = String((e as Error)?.message ?? e);
      if (/draco/i.test(msg)) reject(new Error('This model uses Draco mesh compression, which this converter cannot decode yet.'));
      else if (/fetch|load|uri|buffer/i.test(msg)) reject(new Error('This .gltf refers to separate .bin or texture files. Use the .glb version, or a .gltf with embedded data.'));
      else reject(new Error(`Could not read the 3D model: ${msg}`));
    });
  });

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: background === null, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.setClearColor(background ?? 0x000000, background === null ? 0 : 1);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const model = gltf.scene ?? gltf.scenes?.[0];
  if (!model) throw new Error('The file contains no scene to render.');
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) throw new Error('The model has no visible geometry.');
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius || 1;
  model.position.sub(center);            // pivot = bounding-box centre
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  const fov = 35;
  const camera = new THREE.PerspectiveCamera(fov, 1, radius / 100, radius * 100);
  const dist = (radius / Math.sin((fov * Math.PI) / 360)) * 1.05;
  camera.position.copy(new THREE.Vector3(1, 0.55, 1.25).normalize().multiplyScalar(dist));
  camera.lookAt(0, 0, 0);

  const dispose = () => {
    envTex.dispose(); pmrem.dispose();
    scene.traverse((o: any) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const v of Object.values(m)) (v as any)?.isTexture && (v as any).dispose(); m.dispose?.(); }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
  };
  return { renderer, scene, camera, pivot, canvas, dispose };
}

const toBlob = (c: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Image encode failed'))), type));

/** One 3/4-view snapshot, transparent background by default. */
export async function renderModelPng(buffer: ArrayBuffer, opts: RenderOpts = {}): Promise<Blob> {
  const size = opts.size ?? 1024;
  const r = await setup(buffer, size, opts.background === undefined ? null : opts.background);
  try {
    r.renderer.render(r.scene, r.camera);
    return await toBlob(r.canvas, 'image/png');
  } finally { r.dispose(); }
}

interface GifInstance {
  addFrame: (canvas: HTMLCanvasElement, opts: { delay: number; copy: boolean }) => void;
  on: (event: string, cb: (arg: Blob) => void) => void;
  render: () => void;
}

/** A 360° turntable: `frames` steps around the vertical axis, looping GIF on white. */
export async function renderModelGif(
  buffer: ArrayBuffer,
  opts: { size?: number; frames?: number; delayMs?: number; onProgress?: (ratio: number) => void } = {},
): Promise<Blob> {
  const size = opts.size ?? 512;
  const frames = opts.frames ?? 24;
  // GIF alpha is 1-bit, so anti-aliased edges look ragged on transparency: use white.
  const r = await setup(buffer, size, '#ffffff');
  const snaps: HTMLCanvasElement[] = [];
  try {
    for (let i = 0; i < frames; i++) {
      r.pivot.rotation.y = (i / frames) * Math.PI * 2;
      r.renderer.render(r.scene, r.camera);
      // gif.js reads pixels through a 2D context, which a WebGL canvas doesn't have.
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d')!.drawImage(r.canvas, 0, 0);
      snaps.push(c);
      opts.onProgress?.(((i + 1) / frames) * 0.5);
    }
  } finally { r.dispose(); }

  const { niceThreadCount } = await import('@/lib/compute/concurrency');
  const mod = await import('gif.js');
  const GIFEnc = (mod as unknown as { default: new (o: Record<string, unknown>) => GifInstance }).default;
  return new Promise<Blob>((resolve, reject) => {
    const gif = new GIFEnc({ workers: niceThreadCount(), quality: 5, width: size, height: size, workerScript: '/gif.worker.js' });
    for (const c of snaps) gif.addFrame(c, { delay: opts.delayMs ?? 80, copy: true });
    gif.on('progress', ((p: number) => opts.onProgress?.(0.5 + p * 0.5)) as unknown as (arg: Blob) => void);
    gif.on('finished', (blob: Blob) => resolve(blob));
    gif.on('abort', () => reject(new Error('GIF aborted')));
    gif.render();
  });
}
