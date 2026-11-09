/**
 * Overlay showing one catalogued item in full: an ITU footnote's text, a statutory
 * instrument, an ECC Decision, with a link to the source document and a list of
 * every band that cites it.
 */
import { useEffect, useMemo, useRef } from 'react';
import { formatHz } from '../lib/spectrum';
import type { Band, SpectrumData } from '../lib/types';

interface Props {
  data: SpectrumData;
  contentId: number | null;
  onClose: () => void;
  onSelectBand: (band: Band) => void;
}

export function ContentDrawer({ data, contentId, onClose, onSelectBand }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (contentId == null) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [contentId, onClose]);

  const citing = useMemo(() => {
    if (contentId == null) return [];
    return data.bands.filter((band) => band.c.some((column) => column.some((item) => item.c === contentId)));
  }, [data.bands, contentId]);

  if (contentId == null) return null;
  const content = data.content[String(contentId)];
  if (!content) return null;

  const typeLabel = data.meta.contentTypes[String(content.t)] ?? 'Entry';

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <span className="drawer-type">{typeLabel}</span>
          <h2 id="drawer-title">{content.n}</h2>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {content.d ? (
          <div className="drawer-body">
            {content.d.split('\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : (
          <p className="drawer-body muted">ComReg record no description for this entry.</p>
        )}

        {content.l && (
          <p className="drawer-source">
            <a href={content.l} target="_blank" rel="noreferrer noopener">
              Source document ↗
            </a>
          </p>
        )}

        <section className="drawer-citing">
          <h3>
            Applies to {citing.length} band{citing.length === 1 ? '' : 's'}
          </h3>
          <ul>
            {citing.slice(0, 40).map((band) => (
              <li key={band.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectBand(band);
                    onClose();
                  }}
                >
                  {band.n}
                  {band.lo != null && band.hi != null && (
                    <span className="muted"> · {formatHz(band.hi - band.lo, 3)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {citing.length > 40 && <p className="muted">…and {citing.length - 40} more</p>}
        </section>
      </div>
    </div>
  );
}
