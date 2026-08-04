import Phaser from 'phaser';
import './style.css';

type Upgrade = 'power' | 'speed' | 'value' | 'scoop';
type MaterialKind = 'rock' | 'gold' | 'crystal';
type PickupKind = 'chest' | 'magnet' | 'nitro' | 'double';
type ObjectiveKind = 'collect' | 'deliver' | 'chest';

type Save = {
  coins: number;
  earned: number;
  power: number;
  speed: number;
  value: number;
  scoop: number;
  unlocked: number;
  current: number;
  cleared: number[];
};

type Level = {
  name: string;
  count: number;
  unlock: number;
  rockValue: number;
  goldChance: number;
  crystalChance: number;
  ground: number;
  wall: number;
};

type CargoItem = { kind: MaterialKind; value: number };
type Objective = { kind: ObjectiveKind; target: number; progress: number; reward: number; label: string };

const VIEW_W = 520;
const VIEW_H = 940;
const WORLD_W = 1200;
const WORLD_H = 2100;
const CRUSHER_X = WORLD_W / 2;
const CRUSHER_Y = 220;
const MIN_MINEABLES = 5;
const REPLENISH_BATCH = 5;

const LEVELS: Level[] = [
  { name: 'Gravel Pit', count: 12, unlock: 0, rockValue: 5, goldChance: 0, crystalChance: 0, ground: 0x8a5b32, wall: 0x51351f },
  { name: 'Granite Cut', count: 18, unlock: 50, rockValue: 11, goldChance: 0.12, crystalChance: 0, ground: 0x686765, wall: 0x3f4245 },
  { name: 'Gold Ridge', count: 24, unlock: 400, rockValue: 22, goldChance: 0.30, crystalChance: 0.03, ground: 0x81552d, wall: 0x56361e },
  { name: 'Crystal Basin', count: 30, unlock: 1100, rockValue: 45, goldChance: 0.20, crystalChance: 0.30, ground: 0x466f77, wall: 0x29444d },
];

const KEY = 'mine-dozer-save-v2';
const defaults: Save = { coins: 0, earned: 0, power: 1, speed: 1, value: 1, scoop: 1, unlocked: 0, current: 0, cleared: [] };
const state: Save = (() => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
})();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="shell">
    <div class="game-frame">
      <div class="hud">
        <div class="hud-top">
          <div class="logo">MINE<span>DOZER</span></div>
          <div class="coins"><span class="coin">$</span><span id="coins">0</span></div>
        </div>
        <div class="quarry-card"><b id="levelTitle"></b><small id="levelName"></small></div>
      </div>
      <div class="level-bar" id="levelBar"></div>
      <div class="toast" id="toast">MINE THE QUARRY</div>
      <div class="guide" id="guide"><span id="guideArrow">➤</span><div><b id="guideLabel">FIND MATERIAL</b><small id="guideDistance">0 m</small></div></div>
      <div class="meter-stack">
        <div class="meter-card"><div class="meter-title"><span>🪨 CARGO</span><b id="cargoText">0 / 6</b></div><div class="meter"><i id="cargoFill"></i></div></div>
        <div class="meter-card fever-card"><div class="meter-title"><span>🔥 CRUSHER FEVER</span><b id="feverText">0%</b></div><div class="meter"><i id="feverFill"></i></div></div>
        <div class="power-status hidden" id="powerStatus"></div>
      </div>
      <div class="objective-card"><small>QUICK JOB</small><b id="objectiveLabel">Collect material</b><span id="objectiveProgress">0 / 10</span></div>
      <div class="garage">
        <button class="upgrade" data-u="power"><span class="uicon">⚙️</span><b>ENGINE</b><span class="level" id="powerLevel"></span><span class="price" id="powerCost"></span></button>
        <button class="upgrade" data-u="speed"><span class="uicon">🏎️</span><b>SPEED</b><span class="level" id="speedLevel"></span><span class="price" id="speedCost"></span></button>
        <button class="upgrade" data-u="value"><span class="uicon">⚒️</span><b>CRUSHER</b><span class="level" id="valueLevel"></span><span class="price" id="valueCost"></span></button>
        <button class="upgrade" data-u="scoop"><span class="uicon">🪣</span><b>SCOOP</b><span class="level" id="scoopLevel"></span><span class="price" id="scoopCost"></span></button>
      </div>
      <div class="controls">
        <div class="joystick" id="joystick"><div class="stick" id="stick"></div></div>
        <button class="boost" id="boost">BOOST</button>
      </div>
      <div id="game"></div>
    </div>
  </div>`;

const $ = <T extends HTMLElement>(q: string) => document.querySelector<T>(q)!;
const toast = $<HTMLDivElement>('#toast');
const guide = $<HTMLDivElement>('#guide');
const guideArrow = $<HTMLSpanElement>('#guideArrow');
const guideLabel = $<HTMLElement>('#guideLabel');
const guideDistance = $<HTMLElement>('#guideDistance');
const powerStatus = $<HTMLDivElement>('#powerStatus');
let scene: Quarry | undefined;

const baseCosts: Record<Upgrade, number> = { power: 25, speed: 30, value: 40, scoop: 55 };
const cost = (k: Upgrade) => Math.floor(baseCosts[k] * Math.pow(1.65, state[k] - 1));

function say(text: string) {
  toast.textContent = text;
  toast.animate(
    [{ transform: 'translate(-50%, -7px)', opacity: 0.2 }, { transform: 'translate(-50%, 0)', opacity: 1 }],
    { duration: 220 },
  );
}

function syncUI() {
  $('#coins').textContent = Math.floor(state.coins).toLocaleString();
  $('#levelTitle').textContent = LEVELS[state.current].name.toUpperCase();
  $('#levelName').textContent = scene?.statusText() ?? `LEVEL ${state.current + 1}`;
  (['power', 'speed', 'value', 'scoop'] as Upgrade[]).forEach((k) => {
    $(`#${k}Level`).textContent = `LV. ${state[k]}`;
    $(`#${k}Cost`).textContent = `🪙 ${cost(k).toLocaleString()}`;
  });
  const bar = $('#levelBar');
  bar.innerHTML = '';
  LEVELS.forEach((level, index) => {
    const button = document.createElement('button');
    button.className = `level-btn${index === state.current ? ' active' : ''}`;
    button.textContent = index <= state.unlocked ? `${index + 1}` : `🔒 ${level.unlock}`;
    button.title = level.name;
    button.onclick = () => selectLevel(index);
    bar.appendChild(button);
  });
  save();
}

function selectLevel(index: number) {
  if (index > state.unlocked) {
    const price = LEVELS[index].unlock;
    if (index !== state.unlocked + 1) {
      say('UNLOCK LEVELS IN ORDER');
      return;
    }
    if (state.coins < price) {
      say(`NEED ${price - Math.floor(state.coins)} MORE COINS`);
      return;
    }
    state.coins -= price;
    state.unlocked = index;
    say(`${LEVELS[index].name.toUpperCase()} UNLOCKED!`);
  }
  state.current = index;
  save();
  scene?.scene.restart();
  syncUI();
}

document.querySelectorAll<HTMLButtonElement>('.upgrade').forEach((button) => {
  button.onclick = () => {
    const key = button.dataset.u as Upgrade;
    const price = cost(key);
    if (state.coins < price) {
      say(`NEED ${price - Math.floor(state.coins)} MORE COINS`);
      return;
    }
    state.coins -= price;
    state[key]++;
    syncUI();
    scene?.applyUpgradeVisuals(key);
    say(`${key.toUpperCase()} UPGRADED!`);
  };
});

const input = { x: 0, y: 0, boost: false };
const joy = $<HTMLDivElement>('#joystick');
const stick = $<HTMLDivElement>('#stick');
let joyId: number | null = null;

function moveJoy(event: PointerEvent) {
  const rect = joy.getBoundingClientRect();
  let x = event.clientX - rect.left - rect.width / 2;
  let y = event.clientY - rect.top - rect.height / 2;
  const magnitude = Math.hypot(x, y);
  const limit = 34;
  if (magnitude > limit) {
    x = (x / magnitude) * limit;
    y = (y / magnitude) * limit;
  }
  input.x = x / limit;
  input.y = y / limit;
  stick.style.transform = `translate(${x}px, ${y}px)`;
}

joy.onpointerdown = (event) => {
  joyId = event.pointerId;
  joy.setPointerCapture(event.pointerId);
  moveJoy(event);
};
joy.onpointermove = (event) => {
  if (event.pointerId === joyId) moveJoy(event);
};
const stopJoy = (event: PointerEvent) => {
  if (event.pointerId !== joyId) return;
  joyId = null;
  input.x = 0;
  input.y = 0;
  stick.style.transform = 'translate(0, 0)';
};
joy.onpointerup = stopJoy;
joy.onpointercancel = stopJoy;
const boost = $<HTMLButtonElement>('#boost');
boost.onpointerdown = () => (input.boost = true);
boost.onpointerup = boost.onpointercancel = () => (input.boost = false);

class Quarry extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Image;
  rocks!: Phaser.Physics.Arcade.Group;
  pickups!: Phaser.Physics.Arcade.Group;
  nodes!: Phaser.Physics.Arcade.Group;
  dumpZone!: Phaser.GameObjects.Zone;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  crusherGlow!: Phaser.GameObjects.Rectangle;

  cargo: CargoItem[] = [];
  cargoValue = 0;
  quotaProgress = 0;
  quotaRuns = 0;
  replenishTimer = 0;
  dustTimer = 0;
  trackTimer = 0;
  unloading = false;
  deliveryCombo = 0;
  deliveryComboUntil = 0;
  fever = 0;
  feverUntil = 0;
  magnetUntil = 0;
  nitroUntil = 0;
  doubleUntil = 0;
  nextPowerupAt = 0;
  nextEventAt = 0;
  loadsSinceChest = 0;
  nextChestAt = 10;
  objective!: Objective;
  objectiveCycle = 0;

  create() {
    scene = this;
    const level = LEVELS[state.current];
    this.cargo = [];
    this.cargoValue = 0;
    this.quotaProgress = 0;
    this.quotaRuns = 0;
    this.fever = 0;
    this.feverUntil = 0;
    this.deliveryCombo = 0;
    this.loadsSinceChest = 0;
    this.nextChestAt = Phaser.Math.Between(8, 14);
    this.nextPowerupAt = this.time.now + Phaser.Math.Between(14000, 22000);
    this.nextEventAt = this.time.now + Phaser.Math.Between(32000, 48000);
    this.objectiveCycle = Phaser.Math.Between(0, 2);
    this.objective = this.makeObjective();

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor(level.ground);
    this.drawWorld(level);
    this.makeTextures();
    this.drawCrusher();

    this.player = this.physics.add.image(WORLD_W / 2, WORLD_H - 210, 'dozer').setCollideWorldBounds(true).setDrag(900).setDepth(7);
    this.applyUpgradeVisuals('scoop');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(150, 220);

    this.rocks = this.physics.add.group({ collideWorldBounds: true });
    this.pickups = this.physics.add.group({ collideWorldBounds: true, immovable: true });
    this.nodes = this.physics.add.group({ collideWorldBounds: true, immovable: true });

    this.physics.add.collider(this.rocks, this.rocks);
    this.physics.add.collider(this.player, this.rocks, (_player, object) => {
      const rock = object as Phaser.Physics.Arcade.Image;
      if (rock.getData('collecting')) return;
      const body = rock.body as Phaser.Physics.Arcade.Body;
      const velocity = this.player.body.velocity;
      const force = 0.22 + state.power * 0.08 + state.scoop * 0.035;
      body.velocity.x += velocity.x * force;
      body.velocity.y += velocity.y * force;
    });
    this.physics.add.overlap(this.player, this.rocks, (_player, object) => this.collectOre(object as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.pickups, (_player, object) => this.collectPickup(object as Phaser.Physics.Arcade.Image));
    this.physics.add.collider(this.player, this.nodes, (_player, object) => this.hitNode(object as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.dumpZone, () => this.unloadCargo());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.spawnPiles(level.count + 8);
    this.spawnNodes();
    if (Math.random() < 0.35) this.spawnChest();
    syncUI();
    this.updateHud();
    say('SCOOP MATERIAL • HAUL IT TO THE CRUSHER');
  }

  drawWorld(level: Level) {
    const graphics = this.add.graphics();
    graphics.fillStyle(level.ground).fillRect(0, 0, WORLD_W, WORLD_H);
    for (let y = 80; y < WORLD_H; y += 44) {
      graphics.lineStyle(2, 0x2d1b10, 0.1);
      graphics.lineBetween(110, y, WORLD_W - 110, y + Phaser.Math.Between(-6, 6));
    }
    graphics.fillStyle(level.wall);
    for (let y = 0; y < WORLD_H; y += 64) {
      graphics.fillRoundedRect(0, y, 72 + Phaser.Math.Between(0, 34), 56, 14);
      graphics.fillRoundedRect(WORLD_W - Phaser.Math.Between(72, 106), y, 106, 56, 14);
    }
    for (let i = 0; i < 240; i++) {
      graphics.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.035, 0.13));
      graphics.fillCircle(Phaser.Math.Between(100, WORLD_W - 100), Phaser.Math.Between(80, WORLD_H - 80), Phaser.Math.Between(1, 5));
    }
    for (let i = 0; i < 46; i++) {
      const x = Math.random() < 0.5 ? Phaser.Math.Between(12, 96) : Phaser.Math.Between(WORLD_W - 96, WORLD_W - 12);
      const y = Phaser.Math.Between(120, WORLD_H - 120);
      graphics.fillStyle(0x2f6d2d, 0.8).fillCircle(x, y, Phaser.Math.Between(6, 13));
      graphics.fillStyle(0x75a948, 0.7).fillCircle(x + 5, y - 5, Phaser.Math.Between(3, 8));
    }
  }

  drawCrusher() {
    const x = CRUSHER_X - 240;
    const y = 100;
    const width = 480;
    const graphics = this.add.graphics().setDepth(4);
    graphics.fillStyle(0x202525).fillRoundedRect(x, y, width, 152, 22);
    graphics.lineStyle(5, 0x6d7371).strokeRoundedRect(x, y, width, 152, 22);
    graphics.fillStyle(0x111414).fillRect(x + 52, y + 60, width - 104, 66);
    for (let tx = x + 56; tx < x + width - 56; tx += 30) {
      graphics.fillStyle((tx / 30) % 2 ? 0xf6b51c : 0x181818).fillTriangle(tx, y + 52, tx + 15, y + 28, tx + 30, y + 52);
    }
    for (let tx = x + 66; tx < x + width - 66; tx += 38) {
      graphics.fillStyle(0xb8b9b7).fillTriangle(tx, y + 70, tx + 19, y + 120, tx + 38, y + 70);
      graphics.fillStyle(0x5d6060).fillTriangle(tx + 8, y + 70, tx + 19, y + 106, tx + 30, y + 70);
    }
    graphics.fillStyle(0x433020).fillRoundedRect(x - 28, y + 38, 58, 82, 12).fillRoundedRect(x + width - 30, y + 38, 58, 82, 12);
    graphics.fillStyle(0xff7c00).fillCircle(x, y + 28, 10).fillCircle(x + width, y + 28, 10);
    this.crusherGlow = this.add.rectangle(CRUSHER_X, CRUSHER_Y, 360, 56, 0xff7b00, 0.15).setDepth(3);
    this.tweens.add({ targets: this.crusherGlow, alpha: { from: 0.08, to: 0.32 }, duration: 500, yoyo: true, repeat: -1 });
    this.dumpZone = this.add.zone(CRUSHER_X, 300, 420, 120);
    this.physics.add.existing(this.dumpZone, true);
    this.add.text(CRUSHER_X, y + 24, 'ROCK CRUSHER', { fontSize: '21px', fontStyle: 'bold', color: '#ffd14a', stroke: '#4c2600', strokeThickness: 4 }).setOrigin(0.5).setDepth(5);
    this.add.text(CRUSHER_X, 285, 'DRIVE HERE TO UNLOAD', { fontSize: '14px', fontStyle: 'bold', color: '#fff2b0', stroke: '#2b1c00', strokeThickness: 4 }).setOrigin(0.5).setDepth(5);
  }

  makeTextures() {
    if (this.textures.exists('dozer')) return;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x17191a).fillRoundedRect(1, 16, 14, 67, 7).fillRoundedRect(73, 16, 14, 67, 7);
    graphics.fillStyle(0xf4ad19).fillRoundedRect(13, 18, 62, 58, 9);
    graphics.fillStyle(0xffca36).fillRoundedRect(23, 4, 42, 35, 8);
    graphics.fillStyle(0x18384b).fillRoundedRect(30, 10, 28, 17, 4);
    graphics.fillStyle(0x2b2520).fillRect(25, 0, 7, 17).fillRect(57, 0, 7, 17);
    graphics.fillStyle(0xe69300).fillRect(18, 63, 52, 13);
    graphics.fillStyle(0xffc62b).fillTriangle(8, 90, 79, 90, 70, 66).fillTriangle(8, 90, 18, 66, 70, 66);
    graphics.lineStyle(3, 0x7b4a00).strokeTriangle(8, 90, 79, 90, 70, 66);
    graphics.generateTexture('dozer', 88, 92);

    graphics.clear();
    graphics.fillStyle(0x686b70).fillCircle(13, 13, 12);
    graphics.fillStyle(0x92969b).fillCircle(9, 8, 5);
    graphics.fillStyle(0x4c4f53).fillCircle(17, 18, 4);
    graphics.generateTexture('rock', 26, 26);

    graphics.clear();
    graphics.fillStyle(0xb8750c).fillCircle(14, 14, 13);
    graphics.fillStyle(0xffcf3b).fillCircle(10, 8, 5);
    graphics.fillStyle(0xe99e11).fillCircle(19, 19, 4);
    graphics.generateTexture('gold', 28, 28);

    graphics.clear();
    graphics.fillStyle(0x305b79).fillTriangle(15, 1, 3, 29, 27, 29);
    graphics.fillStyle(0x73dcff).fillTriangle(15, 3, 11, 26, 21, 26);
    graphics.fillStyle(0xc5f6ff).fillTriangle(15, 3, 15, 23, 21, 26);
    graphics.generateTexture('crystal', 30, 30);

    graphics.clear();
    graphics.fillStyle(0x3a210f).fillRoundedRect(2, 10, 42, 28, 5);
    graphics.fillStyle(0x9b521f).fillRoundedRect(3, 2, 40, 18, 7);
    graphics.fillStyle(0xffc62b).fillRect(5, 16, 36, 5).fillRect(18, 2, 8, 36);
    graphics.fillStyle(0x6b360f).fillRect(5, 22, 36, 13);
    graphics.fillStyle(0xffdc55).fillRoundedRect(18, 20, 9, 11, 2);
    graphics.generateTexture('chest', 46, 40);

    this.makePickupTexture(graphics, 'magnet', 0xe53935, 'M');
    this.makePickupTexture(graphics, 'nitro', 0xff8a00, 'N');
    this.makePickupTexture(graphics, 'double', 0x6f42c1, '2X');

    graphics.clear();
    graphics.fillStyle(0x55585b).fillCircle(38, 38, 36);
    graphics.fillStyle(0x777b7f).fillCircle(27, 24, 14);
    graphics.fillStyle(0x3f4244).fillCircle(48, 47, 12);
    graphics.generateTexture('boulderNode', 76, 76);

    graphics.clear();
    graphics.fillStyle(0x6a461c).fillRoundedRect(3, 10, 76, 58, 18);
    graphics.fillStyle(0xffc52b).fillCircle(25, 29, 12).fillCircle(53, 39, 15).fillCircle(38, 54, 10);
    graphics.generateTexture('goldNode', 82, 78);

    graphics.clear();
    graphics.fillStyle(0x24485d).fillCircle(42, 55, 28);
    graphics.fillStyle(0x4cc8ff).fillTriangle(18, 58, 36, 4, 48, 58).fillTriangle(37, 58, 55, 0, 67, 58).fillTriangle(53, 58, 70, 18, 80, 58);
    graphics.fillStyle(0xc6f7ff).fillTriangle(36, 4, 36, 48, 48, 58);
    graphics.generateTexture('crystalNode', 86, 84);
    graphics.destroy();
  }

  makePickupTexture(graphics: Phaser.GameObjects.Graphics, key: string, color: number, label: string) {
    graphics.clear();
    graphics.fillStyle(0x1b1e22).fillCircle(22, 22, 21);
    graphics.lineStyle(4, color, 1).strokeCircle(22, 22, 18);
    graphics.fillStyle(color).fillCircle(22, 22, 13);
    graphics.generateTexture(key, 44, 44);
    void label;
  }

  cargoCapacity() {
    return 4 + state.scoop * 2;
  }

  applyUpgradeVisuals(key: Upgrade) {
    if (!this.player?.body) return;
    const width = Math.min(138, 60 + state.scoop * 10);
    const scale = 1 + Math.min(0.32, (state.scoop - 1) * 0.045);
    this.player.setScale(scale);
    this.player.body.setSize(width, 88, true);
    const milestone = Math.floor((state.power + state.speed + state.value + state.scoop) / 12);
    if (milestone >= 3) this.player.setTint(0xffe08a);
    else if (milestone >= 2) this.player.setTint(0xffc947);
    else this.player.clearTint();
    this.player.setAlpha(0.75);
    this.time.delayedCall(180, () => this.player.setAlpha(1));
    this.updateHud();
    if (key === 'scoop') say(`SCOOP CAPACITY ${this.cargoCapacity()}`);
  }

  statusText() {
    return `LEVEL ${state.current + 1} • QUOTA ${this.quotaProgress}/${LEVELS[state.current].count} • ${this.mineableCount()} DEPOSITED`;
  }

  makeObjective(): Objective {
    const kinds: ObjectiveKind[] = ['collect', 'deliver', 'chest'];
    const kind = kinds[this.objectiveCycle % kinds.length];
    this.objectiveCycle++;
    const reward = 75 * (state.current + 1);
    if (kind === 'collect') return { kind, target: 12 + state.current * 3, progress: 0, reward, label: 'Scoop material' };
    if (kind === 'deliver') return { kind, target: 3 + state.current, progress: 0, reward, label: 'Make deliveries' };
    return { kind, target: 1, progress: 0, reward: reward + 100, label: 'Open a chest' };
  }

  progressObjective(kind: ObjectiveKind, amount = 1) {
    if (this.objective.kind !== kind) return;
    this.objective.progress = Math.min(this.objective.target, this.objective.progress + amount);
    if (this.objective.progress >= this.objective.target) {
      state.coins += this.objective.reward;
      state.earned += this.objective.reward;
      say(`JOB COMPLETE! +${this.objective.reward} COINS`);
      this.objective = this.makeObjective();
      save();
    }
    this.updateHud();
  }

  mineableCount() {
    let count = 0;
    this.rocks?.children.iterate((object) => {
      const rock = object as Phaser.Physics.Arcade.Image;
      if (rock.active && !rock.getData('collecting')) count++;
      return true;
    });
    return count;
  }

  pickupCount(kind?: PickupKind) {
    let count = 0;
    this.pickups?.children.iterate((object) => {
      const pickup = object as Phaser.Physics.Arcade.Image;
      if (pickup.active && (!kind || pickup.getData('kind') === kind)) count++;
      return true;
    });
    return count;
  }

  spawnPiles(count: number) {
    const centers = [
      { x: 220, y: 760 }, { x: 970, y: 720 }, { x: 300, y: 1120 }, { x: 900, y: 1240 },
      { x: 230, y: 1580 }, { x: 950, y: 1640 }, { x: 590, y: 1840 },
    ];
    for (let i = 0; i < count; i++) {
      const center = centers[i % centers.length];
      const ring = Math.floor(i / centers.length);
      this.spawnRock(center.x + Phaser.Math.Between(-68, 68) + ring * 9, center.y + Phaser.Math.Between(-48, 48) + ring * 8);
    }
  }

  spawnDepositBatch(count = REPLENISH_BATCH, forcedKind?: MaterialKind) {
    const centers = [
      { x: 180, y: 620 }, { x: 1010, y: 650 }, { x: 250, y: 980 }, { x: 930, y: 1050 },
      { x: 210, y: 1420 }, { x: 980, y: 1480 }, { x: 600, y: 1900 },
    ];
    const center = Phaser.Utils.Array.GetRandom(centers);
    for (let i = 0; i < count; i++) {
      this.spawnRock(center.x + Phaser.Math.Between(-78, 78), center.y + Phaser.Math.Between(-58, 58), forcedKind);
    }
    syncUI();
    say(forcedKind ? `${forcedKind.toUpperCase()} DEPOSIT DISCOVERED!` : `NEW DEPOSIT DISCOVERED • +${count}`);
  }

  spawnRock(x: number, y: number, forcedKind?: MaterialKind) {
    const level = LEVELS[state.current];
    let kind: MaterialKind = forcedKind ?? 'rock';
    let multiplier = 1;
    if (!forcedKind) {
      const roll = Math.random();
      if (roll < level.crystalChance) kind = 'crystal';
      else if (roll < level.crystalChance + level.goldChance) kind = 'gold';
    }
    if (kind === 'gold') multiplier = 2.4;
    if (kind === 'crystal') multiplier = 3.3;
    const rock = this.rocks.create(x, y, kind) as Phaser.Physics.Arcade.Image;
    rock
      .setCircle(kind === 'rock' ? 12 : 13)
      .setDrag(420)
      .setBounce(0.03)
      .setData('kind', kind)
      .setData('value', Math.round(level.rockValue * multiplier))
      .setData('collecting', false)
      .setAngle(Phaser.Math.Between(-18, 18))
      .setScale(Phaser.Math.FloatBetween(0.82, 1.02));
  }

  collectOre(rock: Phaser.Physics.Arcade.Image) {
    if (!rock.active || rock.getData('collecting')) return;
    if (this.cargo.length >= this.cargoCapacity()) {
      if (this.time.now % 700 < 40) say('SCOOP FULL • RETURN TO CRUSHER');
      return;
    }
    rock.setData('collecting', true);
    const body = rock.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    const item: CargoItem = { kind: rock.getData('kind') as MaterialKind, value: rock.getData('value') as number };
    this.cargo.push(item);
    this.cargoValue += item.value;
    this.progressObjective('collect');
    this.tweens.add({ targets: rock, x: this.player.x, y: this.player.y - 28, scale: 0, angle: 180, duration: 150, onComplete: () => rock.destroy() });
    this.updateHud();
    $('#levelName').textContent = this.statusText();
    if (this.cargo.length >= this.cargoCapacity()) say('SCOOP FULL • RETURN TO CRUSHER');
  }

  unloadCargo() {
    if (this.unloading || this.cargo.length === 0) return;
    this.unloading = true;
    const count = this.cargo.length;
    const baseValue = this.cargoValue;
    const now = this.time.now;
    this.deliveryCombo = now < this.deliveryComboUntil ? Math.min(5, this.deliveryCombo + 1) : 1;
    this.deliveryComboUntil = now + 10000;
    const crusherMultiplier = 1 + (state.value - 1) * 0.28;
    const comboMultiplier = 1 + (this.deliveryCombo - 1) * 0.12;
    const feverMultiplier = now < this.feverUntil ? 2 : 1;
    const powerMultiplier = now < this.doubleUntil ? 2 : 1;
    const payout = Math.round(baseValue * crusherMultiplier * comboMultiplier * feverMultiplier * powerMultiplier);

    state.coins += payout;
    state.earned += payout;
    this.quotaProgress += count;
    this.loadsSinceChest += count;
    this.cargo = [];
    this.cargoValue = 0;
    this.fever = Math.min(100, this.fever + 12 + count * 5);
    if (this.fever >= 100 && this.feverUntil <= now) {
      this.feverUntil = now + 18000;
      say('🔥 CRUSHER FEVER! 2X PAYOUTS FOR 18 SECONDS');
    }

    for (let i = 0; i < Math.min(22, count * 3); i++) {
      const particle = this.add.circle(this.player.x + Phaser.Math.Between(-26, 26), this.player.y + Phaser.Math.Between(-18, 18), Phaser.Math.Between(3, 6), i % 3 === 0 ? 0xffc52a : 0xb9b9b9).setDepth(10);
      this.tweens.add({ targets: particle, x: CRUSHER_X + Phaser.Math.Between(-100, 100), y: CRUSHER_Y, alpha: 0, duration: Phaser.Math.Between(360, 620), onComplete: () => particle.destroy() });
    }
    const comboText = this.deliveryCombo > 1 ? ` • x${this.deliveryCombo} DELIVERY` : '';
    const text = this.add.text(this.player.x, this.player.y - 40, `+${payout}${comboText}`, { fontSize: '26px', fontStyle: 'bold', color: '#fff078', stroke: '#6a3900', strokeThickness: 6 }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: text, y: text.y - 90, scale: 1.18, alpha: 0, duration: 1000, onComplete: () => text.destroy() });
    this.cameras.main.shake(170, 0.008);
    this.crusherGlow.setAlpha(0.95);
    this.time.delayedCall(220, () => this.crusherGlow.setAlpha(0.2));
    this.progressObjective('deliver');
    this.checkQuota();
    if (this.loadsSinceChest >= this.nextChestAt && this.pickupCount('chest') === 0) {
      this.loadsSinceChest = 0;
      this.nextChestAt = Phaser.Math.Between(10, 18);
      this.time.delayedCall(700, () => this.spawnChest());
    }
    save();
    syncUI();
    this.updateHud();
    this.time.delayedCall(500, () => (this.unloading = false));
  }

  checkQuota() {
    const target = LEVELS[state.current].count;
    while (this.quotaProgress >= target) {
      this.quotaProgress -= target;
      this.quotaRuns++;
      if (!state.cleared.includes(state.current)) state.cleared.push(state.current);
      const bonus = 100 * (state.current + 1) + this.quotaRuns * 25;
      state.coins += bonus;
      state.earned += bonus;
      say(`QUOTA COMPLETE! +${bonus} COINS • KEEP MINING`);
    }
  }

  spawnNodes() {
    const level = state.current;
    const configs: Array<{ x: number; y: number; kind: MaterialKind }> = [
      { x: 300, y: 900, kind: 'rock' },
      { x: 900, y: 980, kind: level >= 1 ? 'gold' : 'rock' },
      { x: 340, y: 1500, kind: level >= 2 ? 'gold' : 'rock' },
      { x: 870, y: 1640, kind: level >= 3 ? 'crystal' : 'rock' },
    ];
    configs.forEach((config) => this.spawnNode(config.x, config.y, config.kind));
  }

  spawnNode(x: number, y: number, kind: MaterialKind) {
    const texture = kind === 'gold' ? 'goldNode' : kind === 'crystal' ? 'crystalNode' : 'boulderNode';
    const node = this.nodes.create(x, y, texture) as Phaser.Physics.Arcade.Image;
    node.setImmovable(true).setDepth(3).setData('kind', kind).setData('hp', 4 + state.current * 2).setData('lastHit', 0);
    const body = node.body as Phaser.Physics.Arcade.Body;
    body.setCircle(34);
  }

  hitNode(node: Phaser.Physics.Arcade.Image) {
    const now = this.time.now;
    const speed = this.player.body.velocity.length();
    if (speed < 70 || now - (node.getData('lastHit') as number) < 380) return;
    node.setData('lastHit', now);
    const damage = 1 + Math.floor((state.power - 1) / 3);
    const hp = (node.getData('hp') as number) - damage;
    node.setData('hp', hp);
    node.setTint(0xffffff);
    this.time.delayedCall(100, () => node.clearTint());
    this.cameras.main.shake(70, 0.004);
    if (hp <= 0) {
      const kind = node.getData('kind') as MaterialKind;
      const x = node.x;
      const y = node.y;
      for (let i = 0; i < 8 + state.current * 2; i++) this.spawnRock(x + Phaser.Math.Between(-65, 65), y + Phaser.Math.Between(-55, 55), kind);
      this.tweens.add({ targets: node, scale: 0, angle: 180, duration: 220, onComplete: () => node.destroy() });
      say(`${kind.toUpperCase()} VEIN BROKEN OPEN!`);
      this.time.delayedCall(18000, () => this.spawnNode(Phaser.Math.Between(180, WORLD_W - 180), Phaser.Math.Between(680, WORLD_H - 250), kind));
    }
  }

  spawnChest(force = false) {
    if (!force && this.pickupCount('chest') > 0) return;
    const spots = [
      { x: 170, y: 800 }, { x: 1020, y: 820 }, { x: 190, y: 1320 }, { x: 1010, y: 1380 }, { x: 600, y: 1850 },
    ];
    const spot = Phaser.Utils.Array.GetRandom(spots);
    const chest = this.pickups.create(spot.x + Phaser.Math.Between(-35, 35), spot.y + Phaser.Math.Between(-35, 35), 'chest') as Phaser.Physics.Arcade.Image;
    chest.setSize(40, 34, true).setDepth(6).setData('kind', 'chest').setData('collecting', false);
    this.tweens.add({ targets: chest, angle: { from: -4, to: 4 }, duration: 520, yoyo: true, repeat: -1 });
    this.attachRing(chest, 0xffd84a);
    say('TREASURE CHEST DISCOVERED!');
  }

  spawnPowerup(kind?: Exclude<PickupKind, 'chest'>) {
    const types: Array<Exclude<PickupKind, 'chest'>> = ['magnet', 'nitro', 'double'];
    const selected = kind ?? Phaser.Utils.Array.GetRandom(types);
    const pickup = this.pickups.create(Phaser.Math.Between(170, WORLD_W - 170), Phaser.Math.Between(620, WORLD_H - 220), selected) as Phaser.Physics.Arcade.Image;
    pickup.setCircle(20).setDepth(6).setData('kind', selected).setData('collecting', false);
    this.attachRing(pickup, selected === 'magnet' ? 0xff4d4d : selected === 'nitro' ? 0xffa51f : 0x9a6cff);
    say(`${selected.toUpperCase()} POWER-UP DROPPED!`);
  }

  attachRing(target: Phaser.Physics.Arcade.Image, color: number) {
    const ring = this.add.circle(target.x, target.y, 34, color, 0.1).setStrokeStyle(3, color, 0.8).setDepth(2);
    this.tweens.add({ targets: ring, scale: { from: 0.8, to: 1.35 }, alpha: { from: 0.7, to: 0 }, duration: 900, repeat: -1 });
    target.setData('ring', ring);
  }

  collectPickup(pickup: Phaser.Physics.Arcade.Image) {
    if (!pickup.active || pickup.getData('collecting')) return;
    pickup.setData('collecting', true);
    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    const ring = pickup.getData('ring') as Phaser.GameObjects.Arc | undefined;
    ring?.destroy();
    const kind = pickup.getData('kind') as PickupKind;
    if (kind === 'chest') {
      this.openChest(pickup);
      return;
    }
    const until = this.time.now + 20000;
    if (kind === 'magnet') this.magnetUntil = until;
    if (kind === 'nitro') this.nitroUntil = until;
    if (kind === 'double') this.doubleUntil = until;
    const labels: Record<Exclude<PickupKind, 'chest'>, string> = { magnet: 'MAGNET ACTIVE', nitro: 'UNLIMITED NITRO', double: 'DOUBLE VALUE' };
    say(`${labels[kind]} • 20 SECONDS`);
    this.rewardBurst(pickup.x, pickup.y, kind === 'magnet' ? 0xff4d4d : kind === 'nitro' ? 0xffa51f : 0x9a6cff);
    pickup.destroy();
    this.updateHud();
  }

  openChest(chest: Phaser.Physics.Arcade.Image) {
    const upgrades: Upgrade[] = ['power', 'speed', 'value', 'scoop'];
    const upgradeReward = Math.random() < 0.32;
    let label = '';
    if (upgradeReward) {
      const key = Phaser.Utils.Array.GetRandom(upgrades);
      state[key]++;
      label = `FREE ${key.toUpperCase()} UPGRADE!`;
      this.applyUpgradeVisuals(key);
    } else {
      const min = 180 + state.current * 120;
      const max = 420 + state.current * 260;
      const coins = Phaser.Math.Between(min, max);
      state.coins += coins;
      state.earned += coins;
      label = `+${coins} BONUS COINS!`;
    }
    this.progressObjective('chest');
    save();
    syncUI();
    this.rewardBurst(chest.x, chest.y, 0xffd84a, 24);
    const text = this.add.text(chest.x, chest.y, label, { fontSize: '25px', fontStyle: 'bold', align: 'center', color: '#fff17a', stroke: '#6b3500', strokeThickness: 6 }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: text, y: chest.y - 90, scale: 1.2, duration: 500, ease: 'Back.Out', hold: 700, alpha: 0, onComplete: () => text.destroy() });
    this.tweens.add({ targets: chest, scale: 0, angle: 360, duration: 280, onComplete: () => chest.destroy() });
    this.cameras.main.shake(220, 0.009);
    say(`CHEST OPENED • ${label}`);
  }

  rewardBurst(x: number, y: number, color: number, count = 16) {
    for (let i = 0; i < count; i++) {
      const particle = this.add.circle(x, y, Phaser.Math.Between(2, 6), i % 3 === 0 ? 0xffffff : color).setDepth(10);
      this.tweens.add({ targets: particle, x: x + Phaser.Math.Between(-105, 105), y: y + Phaser.Math.Between(-85, 60), alpha: 0, scale: Phaser.Math.FloatBetween(0.6, 1.8), duration: Phaser.Math.Between(500, 900), onComplete: () => particle.destroy() });
    }
  }

  triggerEvent() {
    const event = Phaser.Math.Between(0, 3);
    if (event === 0) {
      this.spawnDepositBatch(12, 'gold');
      say('🚨 GOLD RUSH! RICH DEPOSIT FOUND');
    } else if (event === 1) {
      this.spawnDepositBatch(10, 'crystal');
      say('💎 CRYSTAL BLOOM! HIGH-VALUE SHARDS FOUND');
    } else if (event === 2) {
      this.spawnChest(true);
      this.time.delayedCall(900, () => this.spawnChest(true));
      say('🎁 TREASURE DROP! TWO CHESTS LANDED');
    } else {
      this.doubleUntil = this.time.now + 25000;
      this.spawnPowerup('nitro');
      say('⚡ QUARRY SURGE! DOUBLE VALUE FOR 25 SECONDS');
    }
    this.nextEventAt = this.time.now + Phaser.Math.Between(38000, 60000);
  }

  updateHud() {
    const capacity = this.cargoCapacity();
    const cargoPercent = Math.min(100, (this.cargo.length / capacity) * 100);
    $('#cargoText').textContent = `${this.cargo.length} / ${capacity}`;
    ($<HTMLElement>('#cargoFill')).style.width = `${cargoPercent}%`;

    const now = this.time.now;
    const feverActive = now < this.feverUntil;
    const feverPercent = feverActive ? Math.max(0, ((this.feverUntil - now) / 18000) * 100) : this.fever;
    $('#feverText').textContent = feverActive ? `${Math.ceil((this.feverUntil - now) / 1000)}s` : `${Math.floor(this.fever)}%`;
    ($<HTMLElement>('#feverFill')).style.width = `${Math.max(0, Math.min(100, feverPercent))}%`;
    $('.fever-card').classList.toggle('active', feverActive);

    $('#objectiveLabel').textContent = `${this.objective.label} • +${this.objective.reward}`;
    $('#objectiveProgress').textContent = `${this.objective.progress} / ${this.objective.target}`;

    const active: string[] = [];
    if (now < this.magnetUntil) active.push(`🧲 ${Math.ceil((this.magnetUntil - now) / 1000)}s`);
    if (now < this.nitroUntil) active.push(`🔥 ${Math.ceil((this.nitroUntil - now) / 1000)}s`);
    if (now < this.doubleUntil) active.push(`2X ${Math.ceil((this.doubleUntil - now) / 1000)}s`);
    powerStatus.textContent = active.join('  ');
    powerStatus.classList.toggle('hidden', active.length === 0);
  }

  updateGuide() {
    const target = this.findGuideTarget();
    if (!target) {
      guide.classList.add('hidden');
      return;
    }
    guide.classList.remove('hidden');
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    guideArrow.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    guideLabel.textContent = target.label;
    guideDistance.textContent = `${Math.max(1, Math.round(Math.hypot(dx, dy) / 8))} m`;
  }

  findGuideTarget(): { x: number; y: number; label: string } | null {
    if (this.cargo.length >= this.cargoCapacity() || (this.cargo.length > 0 && this.mineableCount() === 0)) {
      return { x: CRUSHER_X, y: 300, label: 'RETURN TO CRUSHER' };
    }
    let best: { x: number; y: number; label: string; distance: number } | null = null;
    this.pickups?.children.iterate((object) => {
      const pickup = object as Phaser.Physics.Arcade.Image;
      if (!pickup.active) return true;
      const kind = pickup.getData('kind') as PickupKind;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y);
      const priorityDistance = kind === 'chest' ? distance - 900 : distance - 250;
      if (!best || priorityDistance < best.distance) best = { x: pickup.x, y: pickup.y, label: kind === 'chest' ? 'TREASURE CHEST' : `${kind.toUpperCase()} POWER-UP`, distance: priorityDistance };
      return true;
    });
    if (best) return best;
    this.rocks?.children.iterate((object) => {
      const rock = object as Phaser.Physics.Arcade.Image;
      if (!rock.active || rock.getData('collecting')) return true;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, rock.x, rock.y);
      if (!best || distance < best.distance) best = { x: rock.x, y: rock.y, label: 'NEAREST MATERIAL', distance };
      return true;
    });
    if (best) return best;
    this.nodes?.children.iterate((object) => {
      const node = object as Phaser.Physics.Arcade.Image;
      if (!node.active) return true;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, node.x, node.y);
      if (!best || distance < best.distance) best = { x: node.x, y: node.y, label: 'BREAKABLE DEPOSIT', distance };
      return true;
    });
    return best;
  }

  applyMagnet() {
    if (this.time.now >= this.magnetUntil) return;
    this.rocks.children.iterate((object) => {
      const rock = object as Phaser.Physics.Arcade.Image;
      if (!rock.active || rock.getData('collecting')) return true;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, rock.x, rock.y);
      if (distance > 230) return true;
      const body = rock.body as Phaser.Physics.Arcade.Body;
      const angle = Phaser.Math.Angle.Between(rock.x, rock.y, this.player.x, this.player.y);
      body.velocity.x += Math.cos(angle) * 18;
      body.velocity.y += Math.sin(angle) * 18;
      if (distance < 72) this.collectOre(rock);
      return true;
    });
  }

  update(_time: number, delta: number) {
    let x = input.x;
    let y = input.y;
    if (this.cursors.left.isDown || this.keys.A.isDown) x = -1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x = 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y = -1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y = 1;
    const moving = Math.abs(x) + Math.abs(y) > 0.1;
    const length = Math.hypot(x, y) || 1;
    const nitro = this.time.now < this.nitroUntil;
    const speed = (125 + state.speed * 18) * (input.boost || nitro ? 1.75 : 1);
    this.player.setVelocity((x / length) * speed, (y / length) * speed);
    if (moving) this.player.setRotation(Math.atan2(y, x) + Math.PI / 2);

    this.dustTimer += delta;
    this.trackTimer += delta;
    if (moving && this.dustTimer > 100) {
      this.dustTimer = 0;
      const dust = this.add.circle(this.player.x, this.player.y + 15, Phaser.Math.Between(3, 7), 0xd7b68a, 0.45).setDepth(2);
      this.tweens.add({ targets: dust, scale: 2, alpha: 0, duration: 430, onComplete: () => dust.destroy() });
    }
    if (moving && this.trackTimer > 170) {
      this.trackTimer = 0;
      const track = this.add.rectangle(this.player.x, this.player.y + 25, 34, 5, 0x24170e, 0.22).setRotation(this.player.rotation).setDepth(1);
      this.tweens.add({ targets: track, alpha: 0, duration: 6500, onComplete: () => track.destroy() });
    }

    this.applyMagnet();
    this.replenishTimer += delta;
    if (this.replenishTimer > 900) {
      this.replenishTimer = 0;
      if (this.mineableCount() < MIN_MINEABLES) this.spawnDepositBatch(REPLENISH_BATCH);
    }
    if (this.time.now >= this.nextPowerupAt && this.pickupCount() < 4) {
      this.spawnPowerup();
      this.nextPowerupAt = this.time.now + Phaser.Math.Between(18000, 30000);
    }
    if (this.time.now >= this.nextEventAt) this.triggerEvent();
    if (this.feverUntil > 0 && this.time.now >= this.feverUntil) {
      this.feverUntil = 0;
      this.fever = 0;
      say('CRUSHER FEVER ENDED');
    }
    this.updateGuide();
    this.updateHud();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#6c4a2b',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scene: [Quarry],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});
