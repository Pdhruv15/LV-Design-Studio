import { afterEach, describe, expect, it, vi } from 'vitest';
import { excelDate, fig, Figure, fmtDate, fmtDateLong, fmtDateTime, fmtFixed, fmtTime, fmtUpTo, txt } from './format';

describe('the same formats as text, for a screen', () => {
  it('prints what the figures print, as plain strings', () => {
    expect([txt.power(20558.8), txt.current(13073.2), txt.fault(10.7), txt.pct(18.5), txt.loading(2049), txt.volts(318), txt.energy(82890), txt.size(235), txt.weight(5.4), txt.fixed(3.5, 1)])
      .toEqual(['20,558.80', '13,073.2', '10.70', '18.50', '2,049.0', '318.0', '82,890.0', '235.00', '5.40', '3.5']);
  });

  it('writes ratings as an engineer does, and a dash when there is no value', () => {
    expect([txt.plain(1600), txt.plain(12.54, 1), txt.plain(undefined), txt.power(undefined), txt.current(NaN)]).toEqual(['1600', '12.5', '—', '—', '—']);
    expect(txt.power(-0.001)).toBe('0.00');
  });

  it('writes a date and a time together', () => {
    expect(fmtDateTime(new Date(2026, 10, 1, 14, 5))).toBe('1 Nov 2026, 14:05');
  });
});

describe('calculated figures', () => {
  it('prints each kind of value by its rule', () => {
    expect([
      fig.power(20558.8), fig.current(13073.2), fig.current(80), fig.fault(10.7), fig.pct(18.5), fig.loading(55.6), fig.loading(2049),
      fig.ratio(0.9), fig.ratio(1), fig.pf3(0.947), fig.volts(318), fig.energy(82890), fig.size(3.7), fig.size(235), fig.weight(5.4), fig.ohm(0.0144)
    ].map(String)).toEqual([
      '20,558.80', '13,073.2', '80.0', '10.70', '18.50', '55.6', '2,049.0',
      '0.90', '1.00', '0.947', '318.0', '82,890.0', '3.70', '235.00', '5.40', '0.0144'
    ]);
  });

  it('keeps the number behind the text, rounded to what is printed', () => {
    const f = fig.power(1687.634) as Figure;
    expect(f).toBeInstanceOf(Figure);
    expect(f.value).toBe(1687.63);
    expect(String(f)).toBe('1,687.63');
    expect(`${f} kW`).toBe('1,687.63 kW');
    expect(f.numFmt).toBe('#,##0.00');
    expect((fig.fixed(1234.5, 0) as Figure).numFmt).toBe('#,##0');
    expect((fig.ohm(1) as Figure).numFmt).toBe('#,##0.0000');
  });

  it('prints the same digits Excel stores, whichever way the value rounds', () => {
    for (const v of [1.005, 2.675, 1234.565, 0.125, 99.995, 1e-7]) {
      const f = fig.power(v) as Figure;
      expect(String(f).replace(/,/g, '')).toBe(f.value.toFixed(2));
    }
  });

  it('never prints a negative zero', () => {
    expect(String(fig.power(-0.001))).toBe('0.00');
    expect((fig.power(-0.001) as Figure).value).toBe(0);
    expect(String(fig.power(-1234.5))).toBe('-1,234.50');
  });

  it('shows a dash when there is no value', () => {
    for (const v of [undefined, NaN, Infinity]) {
      expect(fig.power(v)).toBe('—');
      expect(fig.plain(v)).toBe('—');
      expect(fmtFixed(v, 1)).toBe('—');
      expect(fmtUpTo(v)).toBe('—');
    }
  });

  it('writes ratings as an engineer does: no comma, no trailing zeros, a real number', () => {
    expect(fig.plain(1000)).toBe(1000);
    expect(fig.plain(1600.4)).toBe(1600);
    expect(fig.plain(12.5, 1)).toBe(12.5);
    expect(fig.plain(175, 1)).toBe(175);
  });
});

describe('dates and times', () => {
  afterEach(() => vi.useRealTimers());

  it('prints an ISO date without a leading zero, the day as written', () => {
    expect(fmtDate('2026-11-01')).toBe('1 Nov 2026');
    expect(fmtDate('2026-10-15')).toBe('15 Oct 2026');
    expect(fmtDate('2026-09-27')).toBe('27 Sep 2026');
    expect(fmtDateLong('2026-10-15')).toBe('15 October 2026');
    expect(fmtDateLong('2026-11-01')).toBe('1 November 2026');
  });

  it('leaves text that is not a date as it was typed', () => {
    for (const typed of ['15/10/26', 'October 2026', 'TBC', '', '2026-13-45', '2026-02-31']) {
      expect(fmtDate(typed)).toBe(typed);
      expect(fmtDateLong(typed)).toBe(typed);
      expect(excelDate(typed)).toBe(typed);
    }
    expect(fmtDate(undefined)).toBe('');
  });

  it('an Excel date is a real date, on the day written in any time zone', () => {
    expect(excelDate('2026-11-01')).toEqual(new Date(Date.UTC(2026, 10, 1)));
  });

  it('reads a time stamp in local time', () => {
    const at = new Date(2026, 10, 1, 14, 5, 30);
    expect(fmtDate(at)).toBe('1 Nov 2026');
    expect(fmtDate(at.getTime())).toBe('1 Nov 2026');
    expect(fmtDate(at.toISOString())).toBe('1 Nov 2026');
    expect(fmtDateLong(at)).toBe('1 November 2026');
    expect(fmtTime(at)).toBe('14:05');
    expect(fmtTime(new Date(2026, 10, 1, 9, 7))).toBe('09:07');
  });

  it('does not follow the language of the computer', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('wrong');
    expect(fmtDate('2026-11-01')).toBe('1 Nov 2026');
    expect(fmtDateLong(new Date(2026, 10, 1))).toBe('1 November 2026');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
