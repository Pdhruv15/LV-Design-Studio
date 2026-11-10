import { useState } from 'react';
import { cleanMakes, DEFAULT_PREAMBLES, loadMakeLists, MAKE_CATEGORIES, MAX_MAKES, newMakeList, saveMakeLists, type BoqMakeList, type MakeEntry } from '../../model/boqMakes';

/** Approved makes (up to three per category) with a specification reference, and the
 * section preambles, of this project's BOQ. Starts from an office list and can be
 * saved back as one. */
export default function BoqMakesForm({ value, used, titles, onSave, onClose, onStatus }: {
  value?: BoqMakeList;
  used: Record<string, number>; // BOQ lines per category
  titles: Record<string, string>; // BOQ sections in the bill
  onSave: (list: BoqMakeList | undefined) => void;
  onClose: () => void;
  onStatus: (msg: string) => void;
}) {
  const [list, setList] = useState<BoqMakeList>(() => value ?? newMakeList('Project makes'));
  const [tab, setTab] = useState<'makes' | 'preambles'>('makes');
  const [onlyUsed, setOnlyUsed] = useState(Object.keys(used).length > 0);
  const [office, setOffice] = useState(loadMakeLists);
  const [section, setSection] = useState('general');

  const entry = (id: string): MakeEntry => list.categories[id] ?? { makes: [] };
  const setEntry = (id: string, e: MakeEntry) => setList({ ...list, categories: { ...list.categories, [id]: e } });
  const setMake = (id: string, i: number, v: string) => {
    const makes = [...entry(id).makes];
    while (makes.length < MAX_MAKES) makes.push('');
    makes[i] = v;
    setEntry(id, { ...entry(id), makes });
  };
  const cats = MAKE_CATEGORIES.filter((c) => !onlyUsed || used[c.id]);
  const sections = ['general', ...Object.keys(titles)];
  const officeText = (s: string) => office.find((l) => l.id === list.id)?.preambles[s] ?? DEFAULT_PREAMBLES[s] ?? '';

  /** Empty makes and spec references dropped, so the saved list holds what was typed. */
  const cleaned = (): BoqMakeList => ({
    ...list, name: list.name.trim() || 'Project makes',
    categories: Object.fromEntries(Object.entries(list.categories)
      .map(([id, e]) => [id, { makes: cleanMakes(e.makes), ...(e.specRef?.trim() ? { specRef: e.specRef.trim() } : {}) }] as const)
      .filter(([, e]) => e.makes.length || e.specRef)),
    preambles: Object.fromEntries(Object.entries(list.preambles).filter(([, t]) => t.trim()))
  });
  const saveOffice = () => {
    const l = cleaned();
    const next = [...office.filter((x) => x.id !== l.id && x.name !== l.name), { ...l, date: new Date().toISOString().slice(0, 10) }];
    saveMakeLists(next);
    setOffice(next);
    setList(l);
    onStatus(`Office list “${l.name}” saved — use it on your other projects`);
  };
  const load = (id: string) => { const l = office.find((x) => x.id === id); if (l) setList(structuredClone(l)); };

  return (
    <>
      <h3>Approved makes and preambles</h3>
      <div className="bom-tabs">
        <button className={`chip${tab === 'makes' ? ' on' : ''}`} aria-pressed={tab === 'makes'} onClick={() => setTab('makes')}>Approved makes</button>
        <button className={`chip${tab === 'preambles' ? ' on' : ''}`} aria-pressed={tab === 'preambles'} onClick={() => setTab('preambles')}>Preambles</button>
      </div>
      <div className="bom-prices">
        <label>List name <input className="bi-text" value={list.name} onChange={(e) => setList({ ...list, name: e.target.value })} /></label>
        <label><input type="checkbox" checked={list.orEqual !== false} onChange={(e) => setList({ ...list, orEqual: e.target.checked })} /> Print “or approved equal”</label>
        <select className="chip" value="" onChange={(e) => e.target.value && load(e.target.value)}>
          <option value="">Load office list…</option>
          {office.map((l) => <option key={l.id} value={l.id}>{l.name} ({Object.keys(l.categories).length} categories, {l.date})</option>)}
        </select>
        <button className="chip" onClick={saveOffice}>Save as office list</button>
      </div>

      {tab === 'makes' && <>
        <label><input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} /> Only categories used in this BOQ</label>
        <div className="table-scroll">
          <table className="bom-table">
            <thead><tr><th>Category</th><th>Make 1</th><th>Make 2</th><th>Make 3</th><th>Specification ref.</th><th className="num">Lines</th></tr></thead>
            <tbody>
              {cats.map((c, i) => <FragmentRows key={c.id} head={i === 0 || cats[i - 1].section !== c.section ? `${c.section} · ${titles[c.section] ?? c.section}` : undefined}>
                <tr>
                  <td>{c.label}</td>
                  {[0, 1, 2].map((n) => <td key={n}><input className="bi-text" aria-label={`${c.label}: make ${n + 1}`} value={entry(c.id).makes[n] ?? ''} placeholder="—" onChange={(e) => setMake(c.id, n, e.target.value)} /></td>)}
                  <td><input className="bi-text" aria-label={`${c.label}: specification reference`} value={entry(c.id).specRef ?? ''} placeholder="—" onChange={(e) => setEntry(c.id, { ...entry(c.id), specRef: e.target.value })} /></td>
                  <td className="num m">{used[c.id] ?? 0}</td>
                </tr>
              </FragmentRows>)}
            </tbody>
          </table>
        </div>
        <p className="m">Categories come from the BOQ lines (every MCCB line is in MCCB, and so on). A line can have its own makes in its pencil (Edit item) dialog. Make names are yours to type; the app ships none.</p>
      </>}

      {tab === 'preambles' && <div className="form-kv">
        <label>Preamble
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => <option key={s} value={s}>{s === 'general' ? 'General preamble' : `${s} · ${titles[s]}`}{list.preambles[s]?.trim() ? '' : ' (empty)'}</option>)}
          </select>
        </label>
        <button className="chip" onClick={() => setList({ ...list, preambles: { ...list.preambles, [section]: officeText(section) } })}>Reset to office text</button>
        <label style={{ gridColumn: '1 / -1' }}>Text <textarea rows={8} value={list.preambles[section] ?? ''} onChange={(e) => setList({ ...list, preambles: { ...list.preambles, [section]: e.target.value } })} /></label>
        <p className="m" style={{ gridColumn: '1 / -1' }}>The general preamble prints before the first bill; a section's text prints under its heading, in the Excel and PDF BOQ.</p>
      </div>}

      <div className="modal-actions">
        {value && <button className="chip" onClick={() => onSave(undefined)}>Remove from this BOQ</button>}
        <span className="sp" /><button className="chip" onClick={onClose}>Cancel</button><button className="chip primary" onClick={() => onSave(cleaned())}>Save</button>
      </div>
    </>
  );
}

/** A section heading row before a category's row. */
function FragmentRows({ head, children }: { head?: string; children: React.ReactNode }) {
  return <>{head && <tr className="bom-sec-row"><td colSpan={6}>{head}</td></tr>}{children}</>;
}
