import { useCallback, useEffect, useMemo, useState } from 'react';
import { SpectrumChart, type Window } from './components/SpectrumChart';
import { BandTable } from './components/BandTable';
import { BandDetail } from './components/BandDetail';
import { ContentDrawer } from './components/ContentDrawer';
import { FilterBar } from './components/FilterBar';
import { PosterButton } from './components/PosterButton';
import { AXIS_MAX, AXIS_MIN } from './lib/spectrum';
import { EMPTY_FILTERS, applyFilters, buildHaystacks, parseFrequency, type Filters } from './lib/search';
import { applyTheme, initialMode, type Mode } from './lib/palette';
import type { Band, SpectrumData } from './lib/types';

const FULL_WINDOW: Window = { lo: AXIS_MIN, hi: AXIS_MAX };

export function App() {
  const [data, setData] = useState<SpectrumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [window_, setWindow] = useState<Window>(FULL_WINDOW);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [contentId, setContentId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(() => initialMode());
  const [textured, setTextured] = useState(false);

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem('comreg-freq:theme', mode);
  }, [mode]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/spectrum.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SpectrumData>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const haystacks = useMemo(() => (data ? buildHaystacks(data) : []), [data]);

  const results = useMemo(
    () => (data ? applyFilters(data, haystacks, filters) : []),
    [data, haystacks, filters],
  );
  const visibleIds = useMemo(() => new Set(results.map((band) => band.id)), [results]);

  const selected = useMemo(
    () => (data && selectedId != null ? (data.bands[selectedId] ?? null) : null),
    [data, selectedId],
  );

  const selectBand = useCallback((band: Band) => setSelectedId(band.id), []);

  const jump = useCallback((lo: number, hi: number) => {
    // A little padding either side so the target does not sit flush to the edge.
    setWindow({ lo: Math.max(AXIS_MIN, lo / 1.15), hi: Math.min(AXIS_MAX, hi * 1.15) });
  }, []);

  // Typing a bare frequency moves the view there as well as filtering the list.
  useEffect(() => {
    const tuned = parseFrequency(filters.query);
    if (tuned == null || !data) return;
    const band = data.bands.find((b) => b.lo != null && b.hi != null && tuned >= b.lo && tuned < b.hi);
    if (band?.lo != null && band.hi != null) {
      setSelectedId(band.id);
      jump(band.lo, band.hi);
    }
  }, [filters.query, data, jump]);

  if (error) {
    return (
      <main className="fallback">
        <h1>Could not load the spectrum data</h1>
        <p>{error}</p>
        <p>
          If you are running this locally, build the dataset first with <code>npm run data</code>.
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="fallback">
        <p className="loading">Loading the Irish frequency plan…</p>
      </main>
    );
  }

  return (
    <div className="app viz-root">
      <header className="masthead">
        <div className="masthead-title">
          <h1>The Irish Radio Spectrum</h1>
          <p>
            Every one of the {data.meta.bandCount} bands in ComReg's{' '}
            <a href={data.meta.source} target="_blank" rel="noreferrer noopener">
              Radio Frequency Plan for Ireland
            </a>
            , with all {data.meta.contentCount} footnotes, instruments and decisions in full.
            Snapshot {data.meta.generatedAt}.
          </p>
        </div>
        <div className="masthead-actions">
          <PosterButton
            data={data}
            mode={mode}
            filteredIds={results.length === data.bands.length ? null : visibleIds}
            filterLabel={describeFilters(filters, results.length, data.bands.length)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
          >
            {mode === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        resultCount={results.length}
        totalCount={data.bands.length}
        textured={textured}
        onChange={setFilters}
        onJump={jump}
        onToggleTexture={() => setTextured((v) => !v)}
      />

      <SpectrumChart
        data={data}
        visible={visibleIds}
        selectedId={selectedId}
        window={window_}
        textured={textured}
        onWindowChange={setWindow}
        onSelect={selectBand}
      />

      <div className="body">
        <section className="table-pane">
          <div className="pane-head">
            <h2>Bands</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.window !== null}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    window: event.target.checked ? { lo: window_.lo, hi: window_.hi } : null,
                  })
                }
              />
              Limit to the zoomed view
            </label>
          </div>
          <BandTable data={data} bands={results} selectedId={selectedId} onSelect={selectBand} />
        </section>

        <BandDetail data={data} band={selected} onOpenContent={setContentId} />
      </div>

      <ContentDrawer
        data={data}
        contentId={contentId}
        onClose={() => setContentId(null)}
        onSelectBand={selectBand}
      />

      <footer className="site-foot">
        <p>
          Data from ComReg's{' '}
          <a href={data.meta.api} target="_blank" rel="noreferrer noopener">
            RFPI API
          </a>
          . This is an unofficial viewer — for anything binding, consult the{' '}
          <a href={data.meta.source} target="_blank" rel="noreferrer noopener">
            official plan
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

/** One line describing the active filters, printed on a filtered poster. */
function describeFilters(filters: Filters, shown: number, total: number): string | undefined {
  if (shown === total) return undefined;
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`matching “${filters.query.trim()}”`);
  if (filters.families.size) parts.push(`${[...filters.families].join(', ')}`);
  if (filters.primaryOnly) parts.push('primary allocations only');
  if (filters.window) parts.push('within the zoomed view');
  return `${shown} of ${total} bands${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}
