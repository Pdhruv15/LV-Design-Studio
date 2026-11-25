import { describe, expect, it } from 'vitest';
import { FORM4_GROUPS } from '../calc/form4';
import { DEWA_GENERAL_NOTES } from '../docs/sldNotes';
import { REPORT_TYPES } from '../docs/reportTypes';
import { PROJECT_STATUSES } from '../types';
import { PEOPLE } from './params';
import { EXTRAS } from './priceList';
import { RECIPIENTS, recipientGroup } from './submissions';

/** Default texts shown for any project must not name one supply authority; the user types the real name. */
const NAMES = /\b(DEWA|ADDC|AADC|SEWA|FEWA|EtihadWE|Etihad WE)\b/;

describe('default texts name no fixed authority', () => {
  it('recipient list, report types, general notes, BOQ lines, parameters, statuses and Form 4 groups', () => {
    const texts = [
      ...RECIPIENTS,
      ...REPORT_TYPES.flatMap((t) => [t.label, t.description]),
      ...DEWA_GENERAL_NOTES,
      ...EXTRAS.map((e) => e.description),
      ...PEOPLE.map((p) => p.hint),
      ...PROJECT_STATUSES.map((s) => s.label),
      ...FORM4_GROUPS.map((g) => g.label)
    ];
    expect(texts.filter((t) => NAMES.test(t))).toEqual([]);
  });
  it('the authority recipient is still recognised as an authority', () => {
    expect(RECIPIENTS).toContain('Authority');
    expect(recipientGroup('Authority')).toBe('Authority');
  });
});
