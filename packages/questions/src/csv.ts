/**
 * A small RFC 4180 CSV reader and writer. Spreadsheet apps save in slightly different ways, so
 * the reader also takes a byte order mark, CR/LF or LF line ends, and semicolon or tab separators
 * (Excel uses semicolons where the decimal mark is a comma).
 */

/** The separators the reader recognises, in the order it prefers them. */
const separators = [',', ';', '\t'] as const;

/** Picks the separator from the first line: the one that appears most outside quotes. */
function detectSeparator(text: string): string {
  const firstLineEnd = text.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const unquoted = firstLine.replace(/"[^"]*"/g, '');
  let best: string = ',';
  let bestCount = 0;
  for (const separator of separators) {
    const count = unquoted.split(separator).length - 1;
    if (count > bestCount) {
      best = separator;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Reads CSV text into rows of cells. Every line is a row, blank ones included, so row numbers
 * match what a spreadsheet shows (a quoted cell may span lines and still counts as one row).
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  if (source.length === 0) return [];
  const separator = detectSeparator(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
      } else {
        cell += character;
      }
      index += 1;
      continue;
    }
    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === separator) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
    index += 1;
  }
  // A final line end does not start another row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Spreadsheets run a cell starting with these as a formula. Cells we write that start with one
 * get a leading apostrophe, which spreadsheets show as text. A minus followed by a digit or a
 * space is left alone so negative numbers stay readable in maths sets.
 */
function needsFormulaGuard(value: string): boolean {
  if (/^[=+@\t\r]/.test(value)) return true;
  return /^-(?![\d\s.]|$)/.test(value);
}

/** One cell as CSV text: guarded against formulas and quoted when needed. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (needsFormulaGuard(text)) text = `'${text}`;
  if (/[",\r\n;\t]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Rows as CSV text with CRLF line ends (what spreadsheet apps expect). */
export function toCsv(
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Undoes {@link csvCell}'s formula guard when reading a cell back. */
export function unguardCsvCell(value: string): string {
  return value.startsWith("'") && needsFormulaGuard(value.slice(1)) ? value.slice(1) : value;
}
