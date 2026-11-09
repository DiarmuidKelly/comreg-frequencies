/**
 * Poster download control: choose a paper size, then build the PDF in the browser.
 *
 * jsPDF is pulled in lazily so the ~350 kB of it never lands on the critical path
 * for someone who only wants to browse.
 */
import { useState } from 'react';
import type { Mode } from '../lib/palette';
import type { SpectrumData } from '../lib/types';
import type { PaperSize } from '../lib/poster';

const SIZES: { size: PaperSize; label: string; hint: string }[] = [
  { size: 'a0', label: 'A0', hint: '1189 × 841 mm — wall chart' },
  { size: 'a1', label: 'A1', hint: '841 × 594 mm — large print' },
  { size: 'a2', label: 'A2', hint: '594 × 420 mm' },
  { size: 'a3', label: 'A3', hint: '420 × 297 mm — desk copy' },
];

interface Props {
  data: SpectrumData;
  mode: Mode;
  /** Null when nothing is filtered, so the poster covers the whole plan. */
  filteredIds: Set<number> | null;
  filterLabel?: string;
}

export function PosterButton({ data, mode, filteredIds, filterLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PaperSize | null>(null);
  const [scope, setScope] = useState<'full' | 'filtered'>('full');

  const download = async (size: PaperSize) => {
    setBusy(size);
    try {
      const { buildPoster, posterFilename } = await import('../lib/poster');
      const options = {
        size,
        // A poster is printed on white paper, so it is always built light unless
        // the viewer is deliberately in dark mode and asks for a screen copy.
        mode: 'light' as Mode,
        highlight: scope === 'filtered' ? filteredIds : null,
        subtitle: scope === 'filtered' ? filterLabel : undefined,
      };
      const doc = await buildPoster(data, options);
      doc.save(posterFilename(options));
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="poster">
      <button type="button" className="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        Download poster PDF
      </button>

      {open && (
        <div className="poster-menu" role="menu">
          <p className="poster-blurb">
            The whole plan as a vector wall chart: nine staves, one per ITU band, each a full decade.
          </p>

          {filteredIds && (
            <div className="poster-scope">
              <label>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'full'}
                  onChange={() => setScope('full')}
                />
                Whole spectrum
              </label>
              <label>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'filtered'}
                  onChange={() => setScope('filtered')}
                />
                Highlight my filter ({filteredIds.size} bands)
              </label>
            </div>
          )}

          <ul>
            {SIZES.map(({ size, label, hint }) => (
              <li key={size}>
                <button type="button" role="menuitem" disabled={busy !== null} onClick={() => download(size)}>
                  <strong>{busy === size ? 'Building…' : label}</strong>
                  <span>{hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="poster-note">Mode: {mode === 'dark' ? 'poster prints light regardless' : 'light'}</p>
        </div>
      )}
    </div>
  );
}
