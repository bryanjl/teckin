import { formatAccuracy, type QuestionReportRow } from '@teckin/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { gameDisplayName, registeredGame } from '../../../../games/registry';
import { formatReportStat } from '../../../../lib/report-export';
import { requireHost } from '../../../../lib/server/host';
import { buttonClass } from '../../sets/editor-styles';

export const metadata: Metadata = {
  title: 'Game report · Teckin',
  robots: { index: false, follow: false },
};

const playedOn = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const linkButton = 'inline-flex items-center justify-center text-center';

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? '–' : `${(milliseconds / 1000).toFixed(1)} s`;
}

function AccuracyBar({ accuracy }: { accuracy: number | null }) {
  const width = accuracy === null ? 0 : Math.round(accuracy * 100);
  return (
    <span
      aria-hidden="true"
      className="block h-2 w-full overflow-hidden rounded-full bg-ink-muted/20"
    >
      <span className="block h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
    </span>
  );
}

function QuestionRow({ question }: { question: QuestionReportRow }) {
  return (
    <li
      className="flex flex-col gap-2 rounded-2xl bg-surface-raised px-4 py-3"
      data-testid="report-question"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="break-words font-semibold">
          <span className="text-ink-muted">Q{question.number}. </span>
          {question.prompt}
        </span>
        <span className="shrink-0 text-lg font-bold" data-testid="report-question-accuracy">
          {formatAccuracy(question.accuracy)}
        </span>
      </div>
      <AccuracyBar accuracy={question.accuracy} />
      <span className="text-sm text-ink-muted">
        {question.timesAnswered === 0
          ? 'Nobody answered this question.'
          : `${question.correctAnswers} of ${question.timesAnswered} answers correct`}
      </span>
      {question.timesAnswered > 0 ? (
        <details>
          <summary className="inline-flex min-h-touch cursor-pointer items-center text-accent underline underline-offset-4">
            Answers chosen
          </summary>
          <ul className="flex flex-col gap-1 pt-1">
            {question.options.map((option) => (
              <li key={option.optionId} className="flex justify-between gap-3">
                <span className="break-words">
                  {option.text}
                  {option.isCorrect ? <span className="font-semibold"> (correct)</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{option.timesChosen}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/**
 * One game's report, phone first: the final ranking with each player's accuracy and questions
 * answered (and the game's own figures), then every question, hardest first, and CSV
 * downloads. Games of other organisations are not found.
 */
export default async function GameReportPage({
  params,
}: {
  params: Promise<{ gameSessionId: string }>;
}) {
  const { gameSessionId } = await params;
  const host = await requireHost(`/dashboard/games/${encodeURIComponent(gameSessionId)}`);
  const found = await host.data.reports.forGame(gameSessionId);
  if (!found) notFound();
  const { game, report } = found;
  const gameName = gameDisplayName(game.gameType);
  const columns = registeredGame(game.gameType)?.definition.reportColumns ?? [];
  const exportPath = `/dashboard/games/${encodeURIComponent(game.id)}/export`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboard/games"
          className="inline-flex min-h-touch items-center self-start text-accent underline underline-offset-4"
        >
          ← Past games
        </Link>
        <h1 className="break-words text-2xl font-bold" data-testid="report-title">
          {gameName} · {game.questionSetTitle}
        </h1>
        <p className="text-ink-muted">{playedOn.format(game.endedAt ?? game.createdAt)}</p>
      </header>

      {game.status !== 'ended' ? (
        <p
          role="status"
          className="rounded-2xl bg-surface-raised px-4 py-3"
          data-testid="report-live"
        >
          This game is still running, so the figures below may change.{' '}
          <Link href={`/host/${game.id}`} className="text-accent underline underline-offset-4">
            Open the host screen
          </Link>
        </p>
      ) : null}

      {game.playerDataDeletedAt ? (
        <p className="rounded-2xl bg-surface-raised px-4 py-3" data-testid="report-expired">
          Players’ answers from this game were deleted automatically when the data retention period
          ended, so there is no report left to show.
        </p>
      ) : (
        <>
          <section
            className="grid grid-cols-3 gap-2 text-center"
            aria-label="Summary"
            data-testid="report-summary"
          >
            {[
              ['Players', String(report.totals.players)],
              ['Answers', String(report.totals.answers)],
              ['Correct', formatAccuracy(report.totals.accuracy)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-surface-raised px-2 py-3">
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                <div className="text-sm text-ink-muted">{label}</div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="ranking-heading">
            <h2 id="ranking-heading" className="text-xl font-bold">
              Final ranking
            </h2>
            {report.players.length === 0 ? (
              <p className="text-ink-muted">Nobody joined this game.</p>
            ) : (
              <ol className="flex flex-col gap-2" data-testid="report-players">
                {report.players.map((player) => (
                  <li
                    key={player.participantId}
                    className="flex flex-col gap-1 rounded-2xl bg-surface-raised px-4 py-3"
                    data-testid="report-player"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-lg font-semibold">
                        <span className="tabular-nums text-ink-muted">
                          {player.rank === null ? '–' : `${player.rank}.`}{' '}
                        </span>
                        {player.nickname}
                      </span>
                      <span
                        className="shrink-0 text-lg font-bold"
                        data-testid="report-player-accuracy"
                      >
                        {formatAccuracy(player.accuracy)}
                      </span>
                    </div>
                    <span className="text-sm text-ink-muted" data-testid="report-player-answers">
                      {player.correctAnswers} of {player.questionsAnswered} correct · average{' '}
                      {seconds(player.averageMillisecondsTaken)}
                      {columns.map((column) => (
                        <span key={column.key}>
                          {' '}
                          · {column.label} {formatReportStat(player.gameStats[column.key], column)}
                        </span>
                      ))}
                      {player.removed ? <span> · removed by host</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="text-xl font-bold">
              Questions, hardest first
            </h2>
            <ol className="flex flex-col gap-2" data-testid="report-questions">
              {report.questions.map((question) => (
                <QuestionRow key={question.questionId} question={question} />
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="download-heading">
            <h2 id="download-heading" className="text-xl font-bold">
              Download
            </h2>
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              <a
                href={`${exportPath}?part=players`}
                download
                className={`${buttonClass} ${linkButton}`}
                data-testid="download-players"
              >
                Players (CSV)
              </a>
              <a
                href={`${exportPath}?part=questions`}
                download
                className={`${buttonClass} ${linkButton}`}
                data-testid="download-questions"
              >
                Questions (CSV)
              </a>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
