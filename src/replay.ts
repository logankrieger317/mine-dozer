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

mountReplayControl();
