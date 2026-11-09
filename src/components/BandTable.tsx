/**
 * The table view of the plan — and the accessible equivalent of the ribbon, so
 * nothing in the chart is conveyed by colour alone.
 *
 * 566 rows render fine without a virtualiser as long as each row is cheap and the
 * browser is allowed to skip offscreen layout, which `content-visibility: auto`
 * in the stylesheet handles.
 */
import { useEffect, useRef } from 'react';
import { dominantFamily, familiesOf, familyColour, formatHz, formatWidth } from '../lib/spectrum';
import type { Band, SpectrumData } from '../lib/types';

interface Props {
  data: SpectrumData;
  bands: Band[];
  selectedId: number | null;
  onSelect: (band: Band) => void;
}

export function BandTable({ data, bands, selectedId, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected row in view when selection arrives from the chart.
  useEffect(() => {
    if (selectedId == null) return;
    const row = listRef.current?.querySelector(`[data-band="${selectedId}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (bands.length === 0) {
    return (
      <div className="band-list empty">
        <p>No bands match these filters.</p>
      </div>
    );
  }

  return (
    <div className="band-list" ref={listRef} role="table" aria-label="Frequency bands">
      <div className="band-row head" role="row">
        <span role="columnheader">Band</span>
        <span role="columnheader">Width</span>
        <span role="columnheader">Services</span>
        <span role="columnheader">Irish usage</span>
      </div>
      {bands.map((band) => {
        const families = familiesOf(band);
        const dominant = dominantFamily(band);
        return (
          <div
            key={band.id}
            role="row"
            data-band={band.id}
            className={`band-row${band.id === selectedId ? ' selected' : ''}`}
            tabIndex={0}
            onClick={() => onSelect(band)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(band);
              }
            }}
          >
            <span className="band-name" role="cell">
              <span className="band-bar" style={{ background: familyColour(dominant) }} aria-hidden />
              {band.n}
            </span>
            <span className="band-width num" role="cell">
              {band.lo != null && band.hi != null ? formatWidth(band.lo, band.hi) : '—'}
            </span>
            <span className="band-families" role="cell">
              {families.map((family) => (
                <span key={family.key} className="chip">
                  <span className="swatch" style={{ background: familyColour(family) }} aria-hidden />
                  {family.label}
                </span>
              ))}
            </span>
            <span className="band-usage" role="cell">
              {usageSummary(band, data) || <em>—</em>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Up to three national usage entries, which is what the column is for. */
function usageSummary(band: Band, _data: SpectrumData): string {
  const entries = (band.c[2] ?? [])
    .filter((item) => item.c != null && item.t === 2)
    .map((item) => item.x);
  const unique = [...new Set(entries)];
  if (unique.length === 0) return '';
  const shown = unique.slice(0, 3).join(', ');
  return unique.length > 3 ? `${shown} +${unique.length - 3}` : shown;
}

/** Formats a band's edges for headings and the share link. */
export function bandEdges(band: Band): string {
  if (band.lo == null || band.hi == null) return band.n;
  return `${formatHz(band.lo)} – ${formatHz(band.hi)}`;
}
