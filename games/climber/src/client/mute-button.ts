import type { GameSoundPlayer } from '@teckin/game-contracts';

/** Theme-supplied look of the mute button. */
export interface MuteButtonTheme {
  soundOnSvg: string;
  soundOffSvg: string;
  text: string;
  panel: string;
}

/**
 * Sound on/off toggle under the pause button. The choice is remembered by the platform's
 * sound player. Returns a function that removes the button.
 */
export function attachMuteButton(
  parent: HTMLElement,
  sound: GameSoundPlayer,
  theme: MuteButtonTheme,
): () => void {
  const button = parent.ownerDocument.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'mute-button';
  Object.assign(button.style, {
    position: 'absolute',
    // Under the pause button: the top row is full on a 375 px phone.
    top: 'calc(env(safe-area-inset-top, 0px) + 76px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
    width: '56px',
    height: '56px',
    padding: '14px',
    borderRadius: '16px',
    border: '2px solid rgba(255, 255, 255, 0.5)',
    background: `${theme.panel}73`,
    color: theme.text,
    touchAction: 'manipulation',
    zIndex: '15',
  } satisfies Partial<CSSStyleDeclaration>);
  const render = (muted: boolean): void => {
    button.innerHTML = muted ? theme.soundOffSvg : theme.soundOnSvg;
    button.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    button.setAttribute('aria-pressed', String(muted));
    button.dataset.muted = String(muted);
  };
  render(sound.muted);
  const onClick = (): void => sound.setMuted(!sound.muted);
  button.addEventListener('click', onClick);
  const stop = sound.onMutedChange(render);
  parent.append(button);
  return () => {
    stop();
    button.removeEventListener('click', onClick);
    button.remove();
  };
}
