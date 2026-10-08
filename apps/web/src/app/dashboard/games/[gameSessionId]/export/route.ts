import type { NextRequest } from 'next/server';
import { gameDisplayName, registeredGame } from '../../../../../games/registry';
import {
  reportExportParts,
  reportFileName,
  reportPlayersCsv,
  reportQuestionsCsv,
  type ReportExportPart,
} from '../../../../../lib/report-export';
import { currentHost } from '../../../../../lib/server/host';

/**
 * A report as CSV: `?part=players` (ranking and each player's figures) or `?part=questions`
 * (hardest first). Only the game's organisation gets it; anyone else gets a 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameSessionId: string }> },
): Promise<Response> {
  const { gameSessionId } = await params;
  const host = await currentHost();
  if (!host) return new Response('Sign in to download reports.', { status: 401 });
  const part = request.nextUrl.searchParams.get('part');
  if (!reportExportParts.includes(part as ReportExportPart)) {
    return new Response('Unknown export.', { status: 400 });
  }
  const found = await host.data.reports.forGame(gameSessionId);
  if (!found) return new Response('Not found.', { status: 404 });
  const columns = registeredGame(found.game.gameType)?.definition.reportColumns ?? [];
  const csv =
    part === 'players' ? reportPlayersCsv(found.report, columns) : reportQuestionsCsv(found.report);
  const fileName = reportFileName(
    gameDisplayName(found.game.gameType),
    found.game.endedAt ?? found.game.createdAt,
    part as ReportExportPart,
  );
  // A byte order mark makes Excel read the file as UTF-8 (accents in nicknames and questions).
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
