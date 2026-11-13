import { describe, expect, it } from 'vitest';
import { cellAt, cellName, colIndex, colName, evaluateSheet, formulaFunctions, SHEET_FUNCTIONS, shiftFormula, type SheetCells } from './sheetFormula';

const one = (formula: string, cells: SheetCells = {}) => evaluateSheet({ ...cells, Z99: formula }).Z99;
const v = (formula: string, cells: SheetCells = {}) => one(formula, cells).value;
const err = (formula: string, cells: SheetCells = {}) => one(formula, cells).error;

describe('sheet formulas — cell names', () => {
  it('columns and cells, both ways', () => {
    expect([colIndex('A'), colIndex('Z'), colIndex('AA'), colIndex('XFD')]).toEqual([1, 26, 27, 16384]);
    expect([colName(1), colName(26), colName(27), colName(702), colName(703)]).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    expect(cellAt('$b$7')).toEqual({ col: 2, row: 7 });
    expect(cellAt('B0')).toBeUndefined();
    expect(cellAt('SUM')).toBeUndefined();
    expect(cellName(28, 3)).toBe('AB3');
  });
});

describe('sheet formulas — arithmetic', () => {
  it('order of operations, brackets, powers, percent and signs', () => {
    expect(v('=1+2*3')).toBe(7);
    expect(v('=(1+2)*3')).toBe(9);
    expect(v('=2^3^2')).toBe(64); // left to right, as in Excel
    expect(v('=-2^2')).toBe(4); // the sign first, as in Excel
    expect(v('=2^-1')).toBe(0.5);
    expect(v('=50%*200')).toBe(100);
    expect(v('=10/4')).toBe(2.5);
    expect(v('=1.5e3+.5')).toBe(1500.5);
  });

  it('shows fifteen significant digits, so 0.1 + 0.2 is 0.3', () => {
    expect(v('=0.1+0.2')).toBe(0.3);
    expect(v('=1.1*3')).toBe(3.3);
  });

  it('a load schedule line: watts × quantity ÷ 1000, then the demand', () => {
    const cells: SheetCells = { F7: 750, G7: 2, H7: '=F7*G7/1000', I7: 0.8, J7: '=H7*I7' };
    const r = evaluateSheet(cells);
    expect(r.H7.value).toBe(1.5);
    expect(r.J7.value).toBe(1.2);
  });

  it('blank cells count as zero; numbers typed as text are read as numbers; other text is #VALUE!', () => {
    expect(v('=A1+5')).toBe(5);
    expect(v('=A1+5', { A1: '12' })).toBe(17);
    expect(v('=A1&"x"')).toBe('x');
    expect(err('=A1+5', { A1: 'abc' })).toBe('#VALUE!');
  });

  it('division by zero and broken formulas', () => {
    expect(err('=1/0')).toBe('#DIV/0!');
    expect(err('=1/A1')).toBe('#DIV/0!');
    expect(err('=1+')).toBe('#ERROR!');
    expect(err('=(1+2')).toBe('#ERROR!');
    expect(err('="open')).toBe('#ERROR!');
    expect(err('=1 2')).toBe('#ERROR!');
    expect(err('=A1:A3')).toBe('#VALUE!');
    expect(err('=Sheet2')).toBe('#NAME?');
  });

  it('text: joining, quotes inside quotes, comparison without regard to case', () => {
    expect(v('="DB-"&"GF"&"-"&1')).toBe('DB-GF-1');
    expect(v('="say ""hi"""')).toBe('say "hi"');
    expect(v('="abc"="ABC"')).toBe(true);
    expect(v('=3>2')).toBe(true);
    expect(v('=3<>3')).toBe(false);
    expect(v('=2<="a"')).toBe(true); // numbers sort before text
  });
});

describe('sheet formulas — functions', () => {
  const col: SheetCells = { A1: 1.2, A2: 0.6, A3: 'note', A4: null, A5: 1.6, B1: 10, B2: 20 };

  it('SUM, AVERAGE, MIN, MAX, COUNT, COUNTA over ranges skip text and blanks', () => {
    expect(v('=SUM(A1:A5)', col)).toBe(3.4);
    expect(v('=SUM(A1:A5,B1:B2,5)', col)).toBe(38.4);
    expect(v('=AVERAGE(A1:A5)', col)).toBe(1.13333333333333);
    expect(v('=MIN(A1:A5)', col)).toBe(0.6);
    expect(v('=MAX(A1:B5)', col)).toBe(20);
    expect(v('=COUNT(A1:A5)', col)).toBe(3);
    expect(v('=COUNTA(A1:A5)', col)).toBe(4);
    expect(err('=AVERAGE(A3:A4)', col)).toBe('#DIV/0!');
    expect(v('=sum(a1:a2)', col)).toBe(1.8);
    expect(v('=SUM($A$1:$A$2)', col)).toBe(1.8);
    expect(v('=SUM(A2:A1)', col)).toBe(1.8);
  });

  it('ROUND goes half away from zero; ROUNDUP and ROUNDDOWN always one way', () => {
    expect(v('=ROUND(2.5,0)')).toBe(3);
    expect(v('=ROUND(-2.5,0)')).toBe(-3);
    expect(v('=ROUND(1.005,2)')).toBe(1.01);
    expect(v('=ROUND(1234.5,-2)')).toBe(1200);
    expect(v('=ROUNDUP(12.01,0)')).toBe(13);
    expect(v('=ROUNDUP(13,0)')).toBe(13);
    expect(v('=ROUNDUP(130/10,0)')).toBe(13);
    expect(v('=ROUNDDOWN(12.99,1)')).toBe(12.9);
    expect(v('=ROUNDUP(-1.1,0)')).toBe(-2);
    expect(err('=ROUND(1)')).toBe('#VALUE!');
  });

  it('IF works out only the branch it takes', () => {
    expect(v('=IF(A1>100,"over","ok")', { A1: 120 })).toBe('over');
    expect(v('=IF(A1>100,"over","ok")', { A1: 80 })).toBe('ok');
    expect(v('=IF(A1=0,0,10/A1)', { A1: 0 })).toBe(0);
    expect(v('=IF(FALSE,1)')).toBe(false);
    expect(err('=IF(1)')).toBe('#VALUE!');
  });

  it('AND, OR, NOT, ABS, SQRT', () => {
    expect(v('=AND(1<2,2<3)')).toBe(true);
    expect(v('=AND(1<2,2>3)')).toBe(false);
    expect(v('=OR(1>2,2>3)')).toBe(false);
    expect(v('=NOT(1>2)')).toBe(true);
    expect(v('=ABS(-4.2)')).toBe(4.2);
    expect(v('=SQRT(3)*400*100/1000')).toBe(69.2820323027551);
    expect(err('=SQRT(-1)')).toBe('#VALUE!');
  });

  it('VLOOKUP: exact, and approximate on a sorted first column (a breaker for a current)', () => {
    const t: SheetCells = { A1: 'L1', B1: 10, A2: 'P1', B2: 20, A3: 'A2', B3: 32, D1: 0, E1: 6, D2: 6, E2: 10, D3: 10, E3: 16, D4: 16, E4: 20 };
    expect(v('=VLOOKUP("p1",A1:B3,2,FALSE)', t)).toBe(20);
    expect(err('=VLOOKUP("X9",A1:B3,2,FALSE)', t)).toBe('#N/A');
    expect(v('=VLOOKUP(12.5,D1:E4,2)', t)).toBe(16);
    expect(v('=VLOOKUP(16,D1:E4,2,TRUE)', t)).toBe(20);
    expect(err('=VLOOKUP(-1,D1:E4,2)', t)).toBe('#N/A');
    expect(err('=VLOOKUP(1,D1:E4,3)', t)).toBe('#REF!');
    expect(err('=VLOOKUP(1,5,1)', t)).toBe('#VALUE!');
  });

  it('lists what it has', () => {
    expect(SHEET_FUNCTIONS).toEqual(['ABS', 'AND', 'AVERAGE', 'COUNT', 'COUNTA', 'IF', 'MAX', 'MIN', 'NOT', 'OR', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'SQRT', 'SUM', 'VLOOKUP']);
    expect(formulaFunctions('=IF(SUM(A1:A3)>0,XLOOKUP(1,A1:A3,B1:B3),0)').sort()).toEqual(['IF', 'SUM', 'XLOOKUP']);
    expect(formulaFunctions('=1+')).toEqual([]);
  });
});

describe('sheet formulas — the sheet as a whole', () => {
  it('works cells out in the order they depend on each other, however they are listed', () => {
    const r = evaluateSheet({ C1: '=B1*2', B1: '=A1+1', A1: 4, D1: '=SUM(A1:C1)' });
    expect([r.B1.value, r.C1.value, r.D1.value]).toEqual([5, 10, 19]);
  });

  it('an error carries to the cells that use it; the others are unaffected', () => {
    const r = evaluateSheet({ A1: '=1/0', B1: '=A1+1', C1: '=SUM(A1:B1)', D1: 7 });
    expect([r.A1.error, r.B1.error, r.C1.error]).toEqual(['#DIV/0!', '#DIV/0!', '#DIV/0!']);
    expect(r.D1).toEqual({ value: 7 });
  });

  it('a formula that refers to itself, directly or round a loop, is #CYCLE! and does not hang', () => {
    expect(evaluateSheet({ A1: '=A1+1' }).A1.error).toBe('#CYCLE!');
    const r = evaluateSheet({ A1: '=B1', B1: '=C1', C1: '=A1', D1: '=SUM(A1:A1)', E1: 3 });
    expect([r.A1.error, r.B1.error, r.C1.error, r.D1.error]).toEqual(['#CYCLE!', '#CYCLE!', '#CYCLE!', '#CYCLE!']);
    expect(r.E1.value).toBe(3);
  });

  it('typed cells: numbers, text, blanks, and "=" alone is text', () => {
    const r = evaluateSheet({ A1: '12.5', A2: ' 7 ', A3: 'MDB-1', A4: '', A5: true, A6: '=', A7: '1e3', A8: '12a' });
    expect([r.A1.value, r.A2.value, r.A3.value, r.A4.value, r.A5.value, r.A6.value, r.A7.value, r.A8.value]).toEqual([12.5, 7, 'MDB-1', null, true, '=', 1000, '12a']);
  });

  it('cell names are read whatever their case or $ signs', () => {
    expect(evaluateSheet({ a1: 2, $B$1: '=a1*3' }).B1.value).toBe(6);
  });

  it('a function it does not have: #NAME?, or the file\'s last value, marked — never dropped', () => {
    expect(evaluateSheet({ A1: '=XLOOKUP(1,B1:B3,C1:C3)' }).A1).toEqual({ value: null, error: '#NAME?', unsupported: true });
    const r = evaluateSheet({ A1: '=XLOOKUP(1,B1:B3,C1:C3)', A2: '=A1*2' }, { A1: 42 });
    expect(r.A1).toEqual({ value: 42, unsupported: true });
    expect(r.A2.value).toBe(84);
    // A last value is not used for a formula the sheet can work out, or for one that is simply wrong.
    expect(evaluateSheet({ A1: '=1+1' }, { A1: 99 }).A1.value).toBe(2);
    expect(evaluateSheet({ A1: '=1/0' }, { A1: 99 }).A1.error).toBe('#DIV/0!');
  });

  it('a large range is worked out without trouble', () => {
    const cells: SheetCells = { B1: '=SUM(A1:A2000)' };
    for (let i = 1; i <= 2000; i++) cells[`A${i}`] = i;
    expect(evaluateSheet(cells).B1.value).toBe(2001000);
  });
});

describe('sheet formulas — fill down and paste', () => {
  it('relative references follow, $ ones stay', () => {
    expect(shiftFormula('=F7*G7/1000', 1, 0)).toBe('=F8*G8/1000');
    expect(shiftFormula('=F7*$G$7', 2, 3)).toBe('=I9*$G$7');
    expect(shiftFormula('=$F7+F$7', 1, 1)).toBe('=$F8+G$7');
    expect(shiftFormula('=SUM(A1:A9)', 0, 2)).toBe('=SUM(C1:C9)');
    expect(shiftFormula('=sum(a1:a9)', 1, 0)).toBe('=sum(A2:A10)');
  });

  it('leaves text, function names and plain cells alone', () => {
    expect(shiftFormula('=IF(A1>0,"see B2","")', 1, 0)).toBe('=IF(A2>0,"see B2","")');
    expect(shiftFormula('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)');
    expect(shiftFormula('A1 is text', 1, 0)).toBe('A1 is text');
    expect(shiftFormula('=ROUND(A1,2)', 0, 0)).toBe('=ROUND(A1,2)');
  });

  it('a reference pushed off the sheet is #REF!', () => {
    expect(shiftFormula('=A1+B2', -1, 0)).toBe('=#REF!+B1');
    expect(evaluateSheet({ C3: shiftFormula('=A1+B2', -1, 0) }).C3.error).toBe('#REF!');
  });
});
