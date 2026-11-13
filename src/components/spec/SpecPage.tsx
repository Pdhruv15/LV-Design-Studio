import { useMemo, useRef, useState } from 'react';
import {
  AlignLeft, ArrowDown, ArrowUp, Baseline, Bold, Braces, ClipboardPaste, Copy, FilePlus2, FileText, FolderOpen, Heading1, Heading2, Italic, List, ListOrdered, PaintBucket, Paintbrush,
  Pencil, Pilcrow, Plus, Scissors, Search, StickyNote, Trash2, Underline, Undo2
} from 'lucide-react';
import type { Project } from '../../types';
import {
  addClause, addSection, moveClause, moveSection, removeClause, removeSection, specFields, specView, starterSpec, withClause, withSectionIncluded, withSectionTitle,
  fieldKeys, type SpecDoc, type SpecKind
} from '../../model/specDoc';
import { Big, Group, Icons, IconTool, PageRibbon, RIBBON_CSS, Rows, Small } from '../pageRibbon';

/** Specification: the project specification as sections of numbered clauses whose values come from the project.
 * This stage has the section list, the page with clause editing, and the File and Home tabs of the ribbon; export
 * to Word, the clause library and the office template follow (docs/notes/Future development, Specification writer). */

const CSS = `${RIBBON_CSS}
.spx { display: flex; flex-direction: column; gap: 12px; color: var(--tx); min-width: 0; }
.spx h3 { margin: 0; font-size: 18px; }
.spx-note { font-size: 12px; color: var(--mut); margin: 0; }
.spx-strip { display: flex; flex-wrap: wrap; gap: 8px 20px; border: 1px solid var(--line); border-radius: 6px; background: var(--p2); padding: 10px 12px; font-size: 12px; color: var(--mut); }
.spx-strip b { color: var(--tx); font-weight: 600; }
.spx-strip .bad { color: var(--bad); font-weight: 600; }
.spx-cols { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(220px, 280px); gap: 14px; align-items: start; }
@media (max-width: 1100px) { .spx-cols { grid-template-columns: 1fr; } }
.spx-card { border: 1px solid var(--line); border-radius: 9px; background: var(--panel); padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.spx-card h4 { margin: 0; font-size: 13px; }
.spx-sec { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 8px; border-radius: 6px; font-size: 12.5px; color: var(--mut); cursor: pointer; }
.spx-sec.on { background: var(--p2); }
.spx-sec.in { color: var(--tx); }
.spx-sec.on .spx-sec-t { font-weight: 600; }
.spx-sec input { width: 16px; height: 16px; accent-color: var(--acc); flex: none; }
.spx-sec button { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; color: inherit; font: inherit; padding: 6px 0; cursor: pointer; display: flex; gap: 8px; }
.spx-sec-n { width: 20px; color: var(--mut); flex: none; }
.spx-paper { background: #fff; color: #1a1a1a; border: 1px solid var(--line); padding: 40px 48px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.55; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.spx-head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; font-size: 11px; }
.spx-paper h5 { margin: 6px 0 2px; font-size: 17px; }
.spx-line { display: grid; grid-template-columns: 52px 1fr; gap: 6px; padding: 3px 4px; border-radius: 3px; cursor: text; border: 1px solid transparent; }
.spx-line.h { font-weight: 700; font-size: 13.5px; margin-top: 6px; }
.spx-line.n { font-style: italic; color: #444; }
.spx-line.sel { border-color: #b8860b; background: #fffbea; }
.spx-line textarea { box-sizing: border-box; width: 100%; min-height: 64px; border: 1px solid #999; padding: 4px 6px; font: inherit; font-weight: 400; font-style: normal; color: #1a1a1a; background: #fff; resize: vertical; }
.spx-f { background: #fff2cc; border-bottom: 1px solid #b8860b; padding: 0 3px; }
.spx-m { background: #fde2e0; border-bottom: 1px solid #b42318; padding: 0 3px; color: #7a1410; font-weight: 700; }
.spx-off { color: #7a1410; font-size: 12px; }
.spx-field { display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 12.5px; min-height: 26px; align-items: center; color: var(--mut); }
.spx-field b { color: var(--tx); font-weight: 400; }
.spx-field .bad { color: var(--bad); font-weight: 600; }
.spx-insert { box-sizing: border-box; height: 40px; max-width: 220px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12.5px; }
`;

type Tab = 'file' | 'home';
const KIND_CLASS: Record<SpecKind, string> = { heading: 'h', clause: '', note: 'n' };

export default function SpecPage({ project, onChange, onStatus, onUndo }: { project: Project; onChange: (p: Project, step?: boolean) => void; onStatus?: (m: string) => void; onUndo?: () => void }) {
  const doc: SpecDoc = useMemo(() => project.spec ?? starterSpec(), [project.spec]);
  const [tab, setTab] = useState<Tab>('home');
  const [sectionId, setSectionId] = useState(doc.sections[0]?.id ?? '');
  const [clauseId, setClauseId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  /** Where the cursor last was in the clause being edited, for Insert field. */
  const caret = useRef<number | null>(null);

  const section = doc.sections.find((s) => s.id === sectionId) ?? doc.sections[0];
  const clause = section?.clauses.find((c) => c.id === clauseId);
  const view = useMemo(() => specView(doc, project), [doc, project]);
  const fields = useMemo(() => specFields(project), [project]);
  // The section on the page: as numbered in the specification when included, else on its own so it can still be edited.
  const block = useMemo(() => {
    if (!section) return undefined;
    return view.blocks.find((b) => b.id === section.id) ?? specView({ ...doc, sections: [{ ...section, included: true }] }, project).blocks[0];
  }, [view, section, doc, project]);
  const used = useMemo(() => [...new Set((section?.clauses ?? []).flatMap((c) => fieldKeys(c.text)))], [section]);

  const save = (next: SpecDoc) => onChange({ ...project, spec: next }, true);
  const pick = (id: string | null) => { setClauseId(id); caret.current = null; };
  const commitText = (id: string, text: string) => { const c = section.clauses.find((x) => x.id === id); if (c && c.text !== text) save(withClause(doc, section.id, id, { text })); };
  const add = (kind: SpecKind) => {
    const text = kind === 'heading' ? 'New heading' : kind === 'note' ? 'Note: ' : 'New clause.';
    const next = addClause(doc, section.id, kind, text, clause?.id);
    const before = new Set(section.clauses.map((c) => c.id));
    save(next);
    pick(next.sections.find((s) => s.id === section.id)!.clauses.find((c) => !before.has(c.id))!.id);
  };
  const setKind = (kind: SpecKind) => { if (clause && clause.kind !== kind) save(withClause(doc, section.id, clause.id, { kind })); };
  const insertField = (key: string) => {
    if (!clause || !key) return;
    const now = editor.current?.value ?? clause.text, at = caret.current ?? now.length;
    save(withClause(doc, section.id, clause.id, { text: `${now.slice(0, at)}{{${key}}}${now.slice(at)}` }));
    caret.current = at + key.length + 4;
  };
  const addNewSection = () => {
    const next = addSection(doc, 'New section');
    save(next);
    setSectionId(next.sections[next.sections.length - 1].id); pick(null); setRenaming(true);
  };
  const dropSection = () => {
    if (doc.sections.length < 2) return;
    const rest = removeSection(doc, section.id);
    save(rest);
    setSectionId(rest.sections[0].id); pick(null);
  };
  const rename = (v: string) => { setRenaming(false); if (v.trim() && v.trim() !== section.title) save(withSectionTitle(doc, section.id, v)); };
  const startOver = () => { save(starterSpec()); setSectionId('S1'); pick(null); onStatus?.('Specification: the starter wording is back (undo to return to yours)'); };

  if (!section || !block) return <div className="spx"><style>{CSS}</style><h3>Specification</h3><p className="spx-note">No sections.</p></div>;
  const included = doc.sections.filter((s) => s.included).length;
  const numberOf = (id: string) => view.blocks.find((b) => b.id === id)?.no ?? '–';
  const keep = (e: { currentTarget: HTMLTextAreaElement }) => { caret.current = e.currentTarget.selectionStart; };

  return (
    <div className="spx">
      <style>{CSS}</style>
      <h3>Specification</h3>
      <p className="spx-note">The project specification, electrical and ELV. Tick the sections, edit the clauses in your own wording, and put project values in a clause as fields — they follow the design. The starter text is plain wording to edit, not text of any standard. Export to Word comes in the next stage.</p>

      <PageRibbon label="Specification tools" tab={tab} onTab={setTab} tabs={[{ id: 'file', name: 'File' }, { id: 'home', name: 'Home' }, { id: null, name: 'Specification' }, { id: null, name: 'Insert' }, { id: null, name: 'Review' }]}>
        {tab === 'file' ? (
          <>
            <Group name="Specification">
              <Big icon={FilePlus2} label="Starter wording" onClick={startOver} />
              <Big icon={FolderOpen} label="Open Word template" />
            </Group>
            <Group name="Sections">
              <Big icon={Plus} label="Add section" onClick={addNewSection} />
              <Rows>
                <Small icon={Pencil} label="Rename section" onClick={() => setRenaming(true)} />
                <Small icon={Trash2} label="Delete section" onClick={dropSection} disabled={doc.sections.length < 2} />
                <Small icon={ArrowUp} label="Move section up" onClick={() => save(moveSection(doc, section.id, -1))} disabled={doc.sections[0].id === section.id} />
                <Small icon={ArrowDown} label="Move section down" onClick={() => save(moveSection(doc, section.id, 1))} disabled={doc.sections[doc.sections.length - 1].id === section.id} />
              </Rows>
            </Group>
            <Group name="Output">
              <Big icon={FileText} label="Export Word" />
            </Group>
          </>
        ) : (
          <>
            <Group name="Clipboard">
              <Big icon={ClipboardPaste} label="Paste" />
              <Rows>
                <Small icon={Scissors} label="Cut" />
                <Small icon={Copy} label="Copy" />
                <Small icon={Paintbrush} label="Copy format" />
              </Rows>
            </Group>
            <Group name="Font">
              <Icons>
                <IconTool icon={Bold} label="Bold" />
                <IconTool icon={Italic} label="Italic" />
                <IconTool icon={Underline} label="Underline" />
                <IconTool icon={PaintBucket} label="Highlight" />
                <IconTool icon={Baseline} label="Text colour" />
                <IconTool icon={AlignLeft} label="Align left" />
              </Icons>
            </Group>
            <Group name="Clauses">
              <Big icon={ListOrdered} label="Add clause" onClick={() => add('clause')} />
              <Rows>
                <Small icon={Heading2} label="Add heading" onClick={() => add('heading')} />
                <Small icon={StickyNote} label="Add note" onClick={() => add('note')} />
                <Small icon={ArrowUp} label="Move up" onClick={clause ? () => save(moveClause(doc, section.id, clause.id, -1)) : undefined} disabled={!clause || section.clauses[0].id === clause.id} />
                <Small icon={ArrowDown} label="Move down" onClick={clause ? () => save(moveClause(doc, section.id, clause.id, 1)) : undefined} disabled={!clause || section.clauses[section.clauses.length - 1].id === clause.id} />
                <Small icon={Trash2} label="Delete clause" onClick={clause ? () => { save(removeClause(doc, section.id, clause.id)); pick(null); } : undefined} disabled={!clause} />
                <Small icon={List} label="Bullets" />
              </Rows>
            </Group>
            <Group name="Styles">
              <Rows>
                <Small icon={Heading1} label="Clause heading" onClick={clause ? () => setKind('heading') : undefined} disabled={!clause} pressed={clause?.kind === 'heading'} />
                <Small icon={Pilcrow} label="Clause" onClick={clause ? () => setKind('clause') : undefined} disabled={!clause} pressed={clause?.kind === 'clause'} />
                <Small icon={StickyNote} label="Note" onClick={clause ? () => setKind('note') : undefined} disabled={!clause} pressed={clause?.kind === 'note'} />
              </Rows>
            </Group>
            <Group name="Project data">
              <Braces size={26} aria-hidden style={{ color: 'var(--acc)' }} />
              <select className="spx-insert" aria-label="Insert field" value="" disabled={!clause} title={clause ? 'Put a project value in the clause being edited' : 'Click a clause first'} onChange={(e) => insertField(e.target.value)}>
                <option value="">Insert field…</option>
                {[...new Set(fields.map((f) => f.group))].map((g) => <optgroup key={g} label={g}>{fields.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}{f.value === undefined ? ' — not set' : ` — ${f.value}`}</option>)}</optgroup>)}
              </select>
            </Group>
            <Group name="Editing">
              <Rows>
                <Small icon={Search} label="Find and replace" />
                <Small icon={Undo2} label="Undo" onClick={onUndo} />
              </Rows>
            </Group>
            <Group name="Output">
              <Big icon={FileText} label="Export Word" />
            </Group>
          </>
        )}
      </PageRibbon>

      <div className="spx-strip">
        <span>Document: <b>{doc.title}</b></span>
        <span>{included} of {doc.sections.length} sections included</span>
        <span>{view.blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.runs.filter((r) => 'field' in r).length, 0), 0)} project values</span>
        {view.missing.length ? <span className="bad">{view.missing.length} missing: {[...new Set(view.missing.map((m) => m.label))].join(', ')}</span> : <span>None missing</span>}
      </div>

      <div className="spx-cols">
        <section className="spx-card" aria-label="Sections">
          <h4>Sections</h4>
          {doc.sections.map((s) => (
            <div key={s.id} className={`spx-sec${s.id === section.id ? ' on' : ''}${s.included ? ' in' : ''}`}>
              <input type="checkbox" checked={s.included} aria-label={`Include ${s.title}`} onChange={(e) => save(withSectionIncluded(doc, s.id, e.target.checked))} />
              {renaming && s.id === section.id
                ? <input type="text" aria-label="Section title" autoFocus defaultValue={s.title} style={{ flex: 1, minWidth: 0, width: 'auto', height: 28 }}
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(e.currentTarget.value); else if (e.key === 'Escape') setRenaming(false); }} onBlur={(e) => rename(e.currentTarget.value)} />
                : <button type="button" aria-current={s.id === section.id} onClick={() => { setSectionId(s.id); pick(null); setRenaming(false); }}><span className="spx-sec-n">{numberOf(s.id)}</span><span className="spx-sec-t">{s.title}</span></button>}
            </div>
          ))}
          <p className="spx-note">Tick a section to include it. Clauses renumber by themselves.</p>
        </section>

        <div className="spx-paper" aria-label={`Section ${section.title}`}>
          <div className="spx-head"><span>{project.name} — {doc.title}</span><span>Section {block.no}</span></div>
          <h5>{block.no} {block.title}</h5>
          {!section.included && <p className="spx-off">This section is not included in the specification. Tick it in the list to include it.</p>}
          {block.lines.length === 0 && <p className="spx-off">No clauses yet. Use Add clause.</p>}
          {block.lines.map((l) => {
            const c = section.clauses.find((x) => x.id === l.id)!;
            const sel = l.id === clauseId;
            return (
              <div key={l.id} data-clause={l.id} className={`spx-line ${KIND_CLASS[l.kind]}${sel ? ' sel' : ''}`} onClick={() => { if (!sel) pick(l.id); }}>
                <span>{l.no}</span>
                {sel
                  ? <textarea ref={editor} key={`${c.id}:${c.text}`} aria-label={`Edit clause ${l.no}`} defaultValue={c.text} autoFocus spellCheck
                      onSelect={keep} onKeyUp={keep} onClick={keep} onBlur={(e) => { keep(e); commitText(c.id, e.currentTarget.value); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.value = c.text; pick(null); } }} />
                  : <span>{l.runs.map((r, i) => ('text' in r ? <span key={i}>{r.text}</span> : r.value !== undefined ? <span key={i} className="spx-f" title={`Project value: ${r.label}`}>{r.value}</span> : <span key={i} className="spx-m" title={`The project has no value for: ${r.label}`}>DATA REQUIRED: {r.label}</span>))}</span>}
              </div>
            );
          })}
        </div>

        <section className="spx-card" aria-label="Project fields in this section">
          <h4>Project fields in this section</h4>
          {used.length === 0 && <p className="spx-note">No project values in this section yet. Click a clause, then Insert field.</p>}
          {used.map((k) => { const f = fields.find((x) => x.key === k); return <div key={k} className="spx-field"><span>{f?.label ?? k}</span>{f?.value !== undefined ? <b>{f.value}</b> : <span className="bad">Not set</span>}</div>; })}
          <p className="spx-note">A value that is not set shows as DATA REQUIRED on the page. Set it in the project and it fills in here. In a clause, a field is written as {'{{'}key{'}}'}.</p>
        </section>
      </div>
      <p className="spx-note">Click a clause to edit it; click elsewhere to finish, Esc to cancel. Greyed tools come in later stages.</p>
    </div>
  );
}
