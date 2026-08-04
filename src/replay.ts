import Phaser from 'phaser';

const mountReplayControl = () => {
  const frame = document.querySelector<HTMLElement>('.game-frame');
  const levelName = document.querySelector<HTMLElement>('#levelName');
  const levelBar = document.querySelector<HTMLElement>('#levelBar');

  if (!frame || !levelName || !levelBar) {
    window.setTimeout(mountReplayControl, 250);
    return;
  }

  const button = document.createElement('button');
  button.className = 'replay-quarry hidden';
  button.innerHTML = '<span>⟳</span><b>REFILL QUARRY</b><small>Replay this level for more coins</small>';
  frame.appendChild(button);

  button.addEventListener('click', () => {
    const activeLevel = levelBar.querySelector<HTMLButtonElement>('.level-btn.active');
    if (!activeLevel) return;

    button.classList.add('hidden');
    activeLevel.click();
  });

  const update = () => {
    const isEmpty = /0 LOADS LEFT/i.test(levelName.textContent ?? '');
    button.classList.toggle('hidden', !isEmpty);
  };

  new MutationObserver(update).observe(levelName, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  update();
};

type CollectibleScene = Phaser.Scene & {
  player?: Phaser.Physics.Arcade.Image;
  rocks?: Phaser.Physics.Arcade.Group;
  openChest?: (chest: Phaser.Physics.Arcade.Image) => void;
};

let attachedScene: CollectibleScene | null = null;
let attachedUpdate: (() => void) | null = null;

const detachChestCollector = () => {
  if (attachedScene && attachedUpdate) {
    attachedScene.events.off(Phaser.Scenes.Events.UPDATE, attachedUpdate);
  }

  attachedScene = null;
  attachedUpdate = null;
};

const attachChestCollector = () => {
  const games = (Phaser as unknown as { GAMES?: Phaser.Game[] }).GAMES ?? [];
  const game = games[0];
  const quarry = game?.scene
    .getScenes(true)
    .find((candidate) => {
      const scene = candidate as CollectibleScene;
      return Boolean(scene.player && scene.rocks && scene.openChest);
    }) as CollectibleScene | undefined;

  if (!quarry || quarry === attachedScene || !quarry.player || !quarry.rocks || !quarry.openChest) {
    return;
  }

  detachChestCollector();
  attachedScene = quarry;

  attachedUpdate = () => {
    const player = quarry.player;
    const rocks = quarry.rocks;
    const openChest = quarry.openChest;

    if (!player?.active || !rocks || !openChest) return;

    let collected = false;

    rocks.children.iterate((child) => {
      if (collected) return;

      const chest = child as Phaser.Physics.Arcade.Image;
      if (
        !chest?.active ||
        chest.getData('kind') !== 'chest' ||
        chest.getData('crushing')
      ) {
        return;
      }

      const pickupRadius = Math.max(
        68,
        (player.displayWidth + chest.displayWidth) / 2 + 6,
      );
      const distance = Phaser.Math.Distance.Between(
        player.x,
        player.y,
        chest.x,
        chest.y,
      );

      if (distance > pickupRadius) return;

      collected = true;
      chest.setData('crushing', true);

      const body = chest.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.enable = false;

      openChest.call(quarry, chest);
    });
  };

  quarry.events.on(Phaser.Scenes.Events.UPDATE, attachedUpdate);
  quarry.events.once(Phaser.Scenes.Events.SHUTDOWN, detachChestCollector);
};

mountReplayControl();
window.setInterval(attachChestCollector, 250);
