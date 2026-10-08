'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Client-only host for the Climber game. Phaser and the game code are fetched with a dynamic
 * import after the page has rendered, so they never run on the server and never load on any
 * other page.
 */
export function SoloGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = mountRef.current;
    if (!target) return;
    let unmount: (() => void) | undefined;
    let cancelled = false;
    const flags = Object.fromEntries(new URLSearchParams(window.location.search));

    import('@teckin/climber/client')
      .then((module) =>
        module.default.mount(target, {
          flags,
          assetBaseUrl: '/game-assets/climber/',
          themeId: process.env.NEXT_PUBLIC_CLIMBER_THEME,
        }),
      )
      .then((teardown) => {
        if (cancelled) teardown();
        else unmount = teardown;
      })
      .catch((error: unknown) => {
        console.error('The game failed to start', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-surface">
      <div ref={mountRef} data-testid="game-root" className="absolute inset-0" />
      {failed ? (
        <p role="alert" className="absolute inset-x-6 top-1/3 text-center text-lg">
          The game could not start on this device. Try reloading the page.
        </p>
      ) : null}
    </div>
  );
}
