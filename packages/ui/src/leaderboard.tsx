import type { PlayerStanding, ShellAppearance } from '@teckin/game-contracts';
import { useId } from 'react';

/** Props for {@link Leaderboard}. */
export interface LeaderboardProps {
  rows: readonly PlayerStanding[];
  appearance: ShellAppearance;
  /** This device's player, highlighted and labelled "You". */
  ownPlayerId?: string;
  /** Heading shown above the list. */
  title?: string;
  /** Show at most this many rows; this player's row is always added if it falls below. */
  maxRows?: number;
  /** A colour per player, drawn as a dot before the nickname (the host screen's player colours). */
  markerColourOf?: (playerId: string) => string | undefined;
  /** Bigger type for a projected host screen. */
  large?: boolean;
}

/**
 * The shared ranking list: rank, nickname, the game's score and a short detail line per
 * player. Used by the player's results screen and (later) the host screens, so every screen
 * shows the room's ranking the same way.
 */
export function Leaderboard({
  rows,
  appearance,
  ownPlayerId,
  title = 'Ranking',
  maxRows,
  markerColourOf,
  large = false,
}: LeaderboardProps) {
  const headingId = useId();
  const scale = large ? 1.4 : 1;
  const px = (size: number): number => Math.round(size * scale);
  let shown = maxRows === undefined ? [...rows] : rows.slice(0, maxRows);
  const own = rows.find((row) => row.playerId === ownPlayerId);
  if (own && !shown.includes(own)) shown = [...shown, own];

  return (
    <section aria-labelledby={headingId} data-testid="leaderboard">
      <h3
        id={headingId}
        style={{ margin: '8px 0', font: `700 ${px(20)}px ${appearance.fontFamily}` }}
      >
        {title}
      </h3>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {shown.map((row) => {
          const isOwn = row.playerId === ownPlayerId;
          const marker = markerColourOf?.(row.playerId);
          return (
            <li
              key={row.playerId}
              data-testid="leaderboard-row"
              data-player-id={row.playerId}
              data-rank={row.rank}
              data-own={isOwn ? 'true' : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '2.5em 1fr auto',
                alignItems: 'center',
                gap: 10,
                minHeight: px(48),
                padding: '6px 12px',
                borderRadius: 12,
                background: isOwn ? `${appearance.accent}33` : `${appearance.text}12`,
                outline: isOwn ? `2px solid ${appearance.accent}` : 'none',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: px(20), color: appearance.accent }}>
                {row.rank}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontWeight: 700,
                    fontSize: px(18),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {marker ? (
                    <span
                      aria-hidden="true"
                      data-testid="leaderboard-marker"
                      style={{
                        display: 'inline-block',
                        width: '0.7em',
                        height: '0.7em',
                        marginRight: '0.4em',
                        borderRadius: '50%',
                        background: marker,
                        verticalAlign: 'baseline',
                      }}
                    />
                  ) : null}
                  {row.nickname}
                </span>
                {isOwn || row.detail ? (
                  <span style={{ display: 'block', fontSize: px(14), color: appearance.textMuted }}>
                    {isOwn ? (
                      <strong style={{ color: appearance.accent }}>
                        You{row.detail ? ' · ' : ''}
                      </strong>
                    ) : null}
                    {row.detail}
                  </span>
                ) : null}
              </span>
              <span style={{ fontWeight: 700, fontSize: px(18) }}>{row.scoreLabel}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
