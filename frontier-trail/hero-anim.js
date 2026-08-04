const APP_SELECTOR = '#app';
const SCENE_SELECTOR = '.scene';

const BIOME_BY_REGION = {
  newEngland: 'forest',
  greatLakes: 'lake',
  ohioValley: 'river',
  mississippi: 'river',
  missouri: 'river',
  plains: 'plains',
  rockies: 'mountains',
  basin: 'desert',
  desert: 'desert',
  sierra: 'mountains',
  california: 'california',
  arkansas: 'forest',
  texasNorth: 'texas',
  texasCentral: 'texas',
  texasGulf: 'gulf',
};

function detectWeather(text = '') {
  const value = text.toLowerCase();
  if (/thunder|lightning|violent storm|storm building/.test(value)) return 'storm';
  if (/snow|sleet|blizzard|freez|flurr/.test(value)) return 'snow';
  if (/rain|shower|squall|drizzle/.test(value)) return 'rain';
  if (/fog|mist|low cloud/.test(value)) return 'fog';
  if (/dust|alkali|dry heat|merciless|hot afternoon|extreme heat/.test(value)) return 'dust';
  if (/cold|northwest wind|sharp north wind|mountain wind/.test(value)) return 'wind';
  return 'clear';
}

function resourcePercent(labelPattern) {
  const rows = document.querySelectorAll('.resource-row');
  for (const row of rows) {
    const text = row.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!labelPattern.test(text)) continue;
    const match = text.match(/(\d{1,3})\s*%/);
    if (match) return Number(match[1]);
  }
  return null;
}

function conditionBand(value, wornAt, damagedAt) {
  if (value === null) return 'good';
  if (value < damagedAt) return 'damaged';
  if (value < wornAt) return 'worn';
  return 'good';
}

function ambientMarkup() {
  return `
    <div class="scene-ambient" aria-hidden="true">
      <span class="scenic-sun"></span>
      <span class="scenic-cloud cloud-one"></span>
      <span class="scenic-cloud cloud-two"></span>
      <span class="scenic-cloud cloud-three"></span>
      <span class="scenic-prop prop-left"></span>
      <span class="scenic-prop prop-right"></span>
      <span class="scenic-birds"></span>
      <span class="weather-layer weather-rain"></span>
      <span class="weather-layer weather-snow"></span>
      <span class="weather-layer weather-fog"></span>
      <span class="weather-layer weather-dust"></span>
      <span class="weather-layer weather-storm"></span>
    </div>`;
}

function wagonMarkup() {
  return `
    <span class="wagon-horse">
      <span class="horse-head"></span>
      <span class="horse-leg leg-one"></span>
      <span class="horse-leg leg-two"></span>
      <span class="horse-leg leg-three"></span>
      <span class="horse-leg leg-four"></span>
    </span>
    <span class="wagon-hitch"></span>
    <span class="wagon-cargo"></span>
    <span class="wagon-patch patch-one"></span>
    <span class="wagon-patch patch-two"></span>
    <span class="wagon-dust"></span>`;
}

function currentRegion(scene) {
  const regionClass = [...scene.classList].find((name) => name.startsWith('region-'));
  return regionClass ? regionClass.slice('region-'.length) : 'plains';
}

function currentMode(scene) {
  const eyebrow = scene.querySelector('.scene-copy .eyebrow')?.textContent ?? '';
  const mode = eyebrow.split('·').at(-1)?.trim().toLowerCase() ?? 'road';
  return mode.replace(/\s+/g, '-');
}

function enhanceScene() {
  const app = document.querySelector(APP_SELECTOR);
  const scene = app?.querySelector(SCENE_SELECTOR);
  if (!scene) return;

  if (!scene.querySelector('.scene-ambient')) {
    scene.insertAdjacentHTML('afterbegin', ambientMarkup());
  }

  const wagon = scene.querySelector('.wagon');
  if (wagon && !wagon.querySelector('.wagon-horse')) {
    wagon.insertAdjacentHTML('afterbegin', wagonMarkup());
  }

  const region = currentRegion(scene);
  const weatherText = scene.querySelector('.scene-copy p')?.textContent ?? '';
  const wagonPercent = resourcePercent(/wagon\s*\/\s*equipment/i);
  const animalPercent = resourcePercent(/animals/i);

  scene.dataset.biome = BIOME_BY_REGION[region] ?? 'plains';
  scene.dataset.weather = detectWeather(weatherText);
  scene.dataset.mode = currentMode(scene);
  scene.dataset.wagonState = conditionBand(wagonPercent, 80, 50);
  scene.dataset.animalState = conditionBand(animalPercent, 70, 40);
}

let queued = false;
function queueEnhancement() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    enhanceScene();
  });
}

function boot() {
  const app = document.querySelector(APP_SELECTOR);
  if (!app) return;
  enhanceScene();
  new MutationObserver(queueEnhancement).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
