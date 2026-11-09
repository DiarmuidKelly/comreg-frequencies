/**
 * Everything ComReg record about one band, laid out as the plan's six columns.
 *
 * Any catalogued entry is a button: pressing it opens the content drawer with the
 * full footnote or instrument text, which is the part the official table makes you
 * dig for.
 */
import { familiesOf, familyColour, formatWidth } from '../lib/spectrum';
import type { Band, BandItem, SpectrumData } from '../lib/types';

interface Props {
  data: SpectrumData;
  band: Band | null;
  onOpenContent: (contentId: number) => void;
}

export function BandDetail({ data, band, onOpenContent }: Props) {
  if (!band) {
    return (
      <aside className="detail">
        <div className="detail-empty">
          <h2>Pick a band</h2>
          <p>
            Click a band in the ribbon or the table to see its ITU allocation, European common
            allocation, Irish usage, the legislation behind it and every footnote in full.
          </p>
        </div>
      </aside>
    );
  }

  const families = familiesOf(band);

  return (
    <aside className="detail" aria-live="polite">
      <header className="detail-head">
        <h2>{band.n}</h2>
        <p className="detail-meta">
          {band.lo != null && band.hi != null ? `${formatWidth(band.lo, band.hi)} of spectrum` : ''}
          {' · band '}
          {band.id + 1} of {data.meta.bandCount}
        </p>
        <div className="detail-chips">
          {families.map((family) => (
            <span key={family.key} className="chip">
              <span className="swatch" style={{ background: familyColour(family) }} aria-hidden />
              {family.label}
            </span>
          ))}
        </div>
      </header>

      <div className="detail-columns">
        {data.meta.columns.map((column, index) => {
          const items = band.c[index] ?? [];
          return (
            <section key={column.key} className="detail-column">
              <h3 title={column.blurb}>{column.label}</h3>
              {items.length === 0 ? (
                <p className="detail-none">—</p>
              ) : (
                <ul>
                  {items.map((item, i) => (
                    <li key={`${i}-${item.x}`}>
                      <Entry data={data} item={item} onOpenContent={onOpenContent} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function Entry({
  data,
  item,
  onOpenContent,
}: {
  data: SpectrumData;
  item: BandItem;
  onOpenContent: (contentId: number) => void;
}) {
  const typeLabel = data.meta.contentTypes[String(item.t)] ?? '';
  const content = item.c != null ? data.content[String(item.c)] : undefined;

  // Prose that ComReg left uncatalogued: render as plain text, not a dead link.
  if (!content || item.c == null) {
    return <span className={`entry plain${item.p ? ' primary' : ''}`}>{item.x}</span>;
  }

  return (
    <button
      type="button"
      className={`entry link type-${item.t}${item.p ? ' primary' : ''}`}
      onClick={() => onOpenContent(item.c!)}
      title={`${typeLabel}${content.d ? ` — ${content.d.slice(0, 160)}${content.d.length > 160 ? '…' : ''}` : ''}`}
    >
      {item.x}
    </button>
  );
}
