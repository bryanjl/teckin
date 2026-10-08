import { questionCsvTemplate } from '@teckin/questions';

/** The question CSV template: the header row and example questions, as a download. */
export function GET(): Response {
  // A byte order mark makes Excel read the file as UTF-8 (accents, "°C").
  return new Response(`\uFEFF${questionCsvTemplate()}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="teckin-question-template.csv"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
