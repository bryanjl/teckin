'use client';

import {
  climberStandings,
  climberTowerModel,
  climberVariantFor,
  climberVariantSwatches,
  isClimberRoomState,
  resolveClimberThemeId,
  type ClimberRoomStateView,
} from '@teckin/climber';
import { useEffect, useState } from 'react';
import type { HostGamePanel } from './host-game-panels';

/** Leaders whose names are written beside their dots; the rest show on hover. */
const labelledLeaders = 5;

/** Summit names from the deployment's theme, or numbers until (or unless) they load. */
function useSummitNames(): readonly string[] {
  const [names, setNames] = useState<readonly string[]>([]);
  useEffect(() => {
    const themeId = resolveClimberThemeId(undefined, process.env.NEXT_PUBLIC_CLIMBER_THEME);
    let cancelled = false;
    fetch(`/game-assets/climber/themes/${themeId}/theme.manifest.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest: unknown) => {
        const summitNames = (manifest as { names?: { summitNames?: unknown } } | null)?.names
          ?.summitNames;
        if (
          !cancelled &&
          Array.isArray(summitNames) &&
          summitNames.every((name) => typeof name === 'string')
        ) {
          setNames(summitNames);
        }
      })
      .catch(() => {
        // Numbers are fine without the theme.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}

/**
 * The tower view: the whole course as one tall column with a line per summit and a dot per
 * player at their height, in the colour of their climber on the phones. The five leaders
 * are named; every dot names its player on hover.
 */
function ClimberTower({ state }: { state: ClimberRoomStateView }) {
  const summitNames = useSummitNames();
  const model = climberTowerModel(state);
  return (
    <div
      data-testid="tower-view"
      role="img"
      aria-label={`Tower with ${model.dots.length} climbers`}
      className="relative h-full min-h-[320px] w-full overflow-hidden rounded-3xl bg-gradient-to-t from-slate-800 via-slate-900 to-indigo-950"
    >
      {/* Course: the climbing column sits right of the summit labels. */}
      <div className="absolute inset-y-8 right-6 left-40">
        <div className="absolute inset-0 rounded-xl border-2 border-dashed border-white/10" />
        {model.summits.map((summit) => (
          <div
            key={summit.number}
            data-testid="tower-summit"
            className="absolute right-0 left-0 border-t-2 border-amber-300/40"
            style={{ bottom: `${summit.heightFraction * 100}%` }}
          >
            <span className="absolute top-0 -left-36 w-32 -translate-y-1/2 text-right text-sm leading-tight text-slate-300">
              <span className="block font-bold text-amber-200">
                {summitNames[summit.number - 1] ?? `Summit ${summit.number}`}
              </span>
              {summit.heightMetres} m
            </span>
          </div>
        ))}
        {model.dots.map((dot) => {
          const labelled = dot.rank > 0 && dot.rank <= labelledLeaders;
          return (
            <div
              key={dot.playerId}
              data-testid="tower-dot"
              data-player-id={dot.playerId}
              data-height={dot.heightMetres}
              title={`${dot.nickname} · ${dot.heightMetres} m`}
              className="absolute flex items-center gap-2 transition-[bottom,left] duration-300 ease-linear motion-reduce:transition-none"
              style={{
                bottom: `${dot.heightFraction * 100}%`,
                left: `${dot.sideFraction * 100}%`,
                transform: 'translate(-14px, 50%)',
                opacity: dot.connected ? 1 : 0.4,
                zIndex: dot.rank > 0 ? 1000 - dot.rank : 0,
              }}
            >
              <span
                className="block size-7 shrink-0 rounded-full border-[3px] shadow-lg"
                style={{
                  background: dot.colour,
                  borderColor: dot.finished ? '#fde047' : '#0f172a',
                }}
              />
              {labelled ? (
                <span className="rounded-md bg-slate-950/80 px-2 py-0.5 text-base font-bold whitespace-nowrap text-white">
                  {dot.rank}. {dot.nickname}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The Climber's parts of the host screen. */
export const climberHostPanel: HostGamePanel = {
  title: 'Cogspire',
  standings: (state) => (isClimberRoomState(state) ? climberStandings(state) : []),
  winnerId: (state) => (isClimberRoomState(state) ? state.winnerId : ''),
  markerColourOf: (playerId) => climberVariantSwatches[climberVariantFor(playerId)],
  settingsSummary: (state) =>
    isClimberRoomState(state) ? [`Checkpoints ${state.checkpointsEnabled ? 'on' : 'off'}`] : [],
  LiveView: ({ state }) => (isClimberRoomState(state) ? <ClimberTower state={state} /> : null),
};
