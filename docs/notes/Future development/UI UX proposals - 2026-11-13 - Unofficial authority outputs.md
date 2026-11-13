# Unofficial authority outputs — proposal (2026-11-13)

Needs a decision. Nothing here is implemented.

## Why

A read-only audit of standards and authority material in the app (2026-11-12) found no copied standard text. Two outputs follow an authority's own material closely, and `NOTICE.md` now says they are unofficial. The outputs themselves do not say so yet.

## Proposal 1 — DM-D-013 sheet

`src/docs/dmForm.ts` lays the page out like the Dubai Municipality sheet, with its title and undertaking wording (`DM_TITLE`, `DM_UNDERTAKING` in `src/calc/dmSubstation.ts`).

Add one small line at the foot of the page, black, same font as the notes:

> Prepared with LV Design Studio. Not an official Dubai Municipality form — check against the current DM-D-013 before submission.

This changes PDF output, so it needs the `dm-d-013` baseline updated on the Mac (`npm run test:pdf:update`).

## Proposal 2 — DEWA cable / breaker limits

`src/calc/authorityLimits.ts` has built-in limits after DEWA Regulations Appendix 5, Tables 1 to 3. Where the limits are shown (Standards → Design references, cable limits card), add one line of help text:

> Built-in values are unofficial. Check them against the current DEWA Regulations; edit a row if the edition has changed.

## Decision needed

- Approve, change the wording, or drop each proposal.
