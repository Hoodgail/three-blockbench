import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationMixer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BBModelLoader, type BBModel } from "../../src/index.js";
import "./style.css";

interface WorkbenchDebugAPI {
  ready: boolean;
  animation: string;
  setAnimation(name: string): boolean;
  setTime(time: number): void;
}

declare global {
  interface Window {
    __THREE_BLOCKBENCH__: WorkbenchDebugAPI;
  }
}

const canvas = requiredElement("model-canvas", HTMLCanvasElement);
const viewport = requiredElement("viewport", HTMLElement);
const loadState = requiredElement("load-state", HTMLElement);
const loadMessage = requiredElement("load-message", HTMLElement);
const clipList = requiredElement("clip-list", HTMLElement);
const playToggle = requiredElement("play-toggle", HTMLButtonElement);
const timeline = requiredElement("timeline", HTMLInputElement);
const currentTime = requiredElement("current-time", HTMLElement);
const duration = requiredElement("duration", HTMLElement);
const activeAnimation = requiredElement("active-animation", HTMLElement);
const toggleRig = requiredElement("toggle-rig", HTMLButtonElement);

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new Scene();
scene.background = new Color(0xd9e7ec);
const camera = new PerspectiveCamera(34, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 1.5;
controls.maxDistance = 8;
controls.target.set(0, 0.95, 0);

const keyLight = new DirectionalLight(0xfff2d8, 3.2);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
const rimLight = new DirectionalLight(0x74aee8, 2.1);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);
scene.add(new AmbientLight(0x8da4ad, 2.4));
const grid = new GridHelper(8, 128, 0x80a6b6, 0xb9d0d8);
grid.material.transparent = true;
grid.material.opacity = 0.32;
scene.add(grid);

let model: BBModel | null = null;
let mixer: AnimationMixer | null = null;
let action: AnimationAction | null = null;
let helper: SkeletonHelper | null = null;
let playing = true;
let scrubbing = false;
const clock = new Clock();
const query = new URLSearchParams(window.location.search);

window.__THREE_BLOCKBENCH__ = {
  ready: false,
  animation: "",
  setAnimation: (name) => setAnimation(name),
  setTime: (time) => {
    if (mixer === null || action === null) return;
    action.time = Math.max(0, Math.min(action.getClip().duration, time));
    mixer.update(0);
  },
};

new BBModelLoader().load(
  "./desert_dog.bbmodel",
  (loaded) => setupModel(loaded),
  (event) => {
    if (event.lengthComputable) loadMessage.textContent = `Reading Blockbench project… ${Math.round(event.loaded / event.total * 100)}%`;
  },
  (error) => {
    loadState.classList.add("is-error");
    loadMessage.textContent = error instanceof Error ? error.message : "The model could not be loaded.";
  },
);

function setupModel(loaded: BBModel): void {
  model = loaded;
  scene.add(loaded.scene);
  mixer = loaded.createMixer();
  helper = new SkeletonHelper(loaded.scene);
  helper.visible = false;
  scene.add(helper);
  requiredElement("mesh-count", HTMLElement).textContent = String(loaded.elements.size);
  requiredElement("bone-count", HTMLElement).textContent = String(loaded.bones.size);
  requiredElement("clip-count", HTMLElement).textContent = String(loaded.animations.length);
  requiredElement("runtime-note", HTMLElement).textContent = loaded.warnings.length === 0
    ? "99 meshes · 27 authored bones · zero loader warnings"
    : `${loaded.warnings.length} loader warning${loaded.warnings.length === 1 ? "" : "s"}`;

  for (const clip of loaded.animations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "clip-button";
    button.dataset.animation = clip.name;
    button.innerHTML = `<span>${clip.name.replace(/^animation\./, "")}</span><small>${clip.duration.toFixed(2)}s</small>`;
    button.addEventListener("click", () => setAnimation(clip.name));
    clipList.append(button);
  }

  frameModel();
  const requested = query.get("animation");
  const initial = requested === null ? "animation.idle" : normalizeAnimationName(requested);
  if (!setAnimation(initial)) setAnimation(loaded.animations[0]?.name ?? "");
  loadState.classList.add("is-loaded");
  window.__THREE_BLOCKBENCH__.ready = true;
}

function normalizeAnimationName(value: string): string {
  return value.startsWith("animation.") ? value : `animation.${value}`;
}

function setAnimation(name: string): boolean {
  if (model === null || mixer === null) return false;
  const clip = model.getAnimation(name);
  if (clip === undefined) return false;
  const previous = action;
  action = model.createAction(mixer, clip);
  action.reset().fadeIn(previous === null ? 0 : 0.18).play();
  previous?.fadeOut(0.18);
  playing = true;
  playToggle.innerHTML = "<span aria-hidden=\"true\">Ⅱ</span>";
  playToggle.setAttribute("aria-label", "Pause animation");
  activeAnimation.textContent = clip.name;
  duration.textContent = clip.duration.toFixed(2);
  timeline.max = String(clip.duration);
  window.__THREE_BLOCKBENCH__.animation = clip.name;
  clipList.querySelectorAll<HTMLButtonElement>(".clip-button").forEach((button) => {
    const selected = button.dataset.animation === clip.name;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (selected) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  return true;
}

function frameModel(): void {
  if (model === null) return;
  model.scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model.scene);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 2.15;
  controls.target.copy(center).add(new Vector3(0, size.y * 0.02, 0));
  camera.position.copy(center).add(new Vector3(distance * 0.78, distance * 0.38, distance));
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

playToggle.addEventListener("click", () => {
  playing = !playing;
  if (playing) {
    action?.play();
    playToggle.innerHTML = "<span aria-hidden=\"true\">Ⅱ</span>";
    playToggle.setAttribute("aria-label", "Pause animation");
  } else {
    action?.stopFading();
    playToggle.innerHTML = "<span class=\"play-icon\" aria-hidden=\"true\"></span>";
    playToggle.setAttribute("aria-label", "Play animation");
  }
});

timeline.addEventListener("pointerdown", () => { scrubbing = true; });
window.addEventListener("pointerup", () => { scrubbing = false; });
timeline.addEventListener("input", () => {
  if (action === null || mixer === null) return;
  mixer.setTime(Number(timeline.value));
});

toggleRig.addEventListener("click", () => {
  if (helper === null) return;
  helper.visible = !helper.visible;
  toggleRig.setAttribute("aria-pressed", String(helper.visible));
});
requiredElement("reset-camera", HTMLButtonElement).addEventListener("click", frameModel);

const resizeObserver = new ResizeObserver(() => resizeRenderer());
resizeObserver.observe(viewport);

function resizeRenderer(): void {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (playing && !scrubbing) mixer?.update(delta);
  model?.update(delta);
  if (action !== null) {
    currentTime.textContent = action.time.toFixed(2);
    if (!scrubbing) timeline.value = String(action.time);
  }
  controls.update();
  renderer.render(scene, camera);
}

function requiredElement<T extends Element>(id: string, constructor: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing #${id}`);
  return element;
}

resizeRenderer();
animate();
