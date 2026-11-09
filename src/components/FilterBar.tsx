/**
 * Filters and legend, in one row above the charts.
 *
 * The family toggles double as the chart legend — the same swatches, in palette
 * order — so identity is never carried by colour alone and the legend is always
 * on screen.
 */
import { FAMILIES, ITU_BANDS, familyColour, formatHz } from '../lib/spectrum';
import { hasActiveFilters, parseFrequency, type Filters } from '../lib/search';

interface Props {
  filters: Filters;
  resultCount: number;
  totalCount: number;
  textured: boolean;
  onChange: (next: Filters) => void;
  onJump: (lo: number, hi: number) => void;
  onToggleTexture: () => void;
}

export function FilterBar({
  filters,
  resultCount,
  totalCount,
  textured,
  onChange,
  onJump,
  onToggleTexture,
}: Props) {
  const tuned = parseFrequency(filters.query);

  const toggleFamily = (key: string) => {
    const families = new Set(filters.families);
    if (families.has(key)) families.delete(key);
    else families.add(key);
    onChange({ ...filters, families });
  };

  return (
    <div className="filters">
      <div className="filter-row">
        <label className="search">
          <span className="sr-only">Search the plan</span>
          <input
            type="search"
            value={filters.query}
            placeholder="Search a frequency (2.4 GHz), a service, a footnote (5.441), a usage…"
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </label>

        <label className="jump">
          <span className="sr-only">Jump to an ITU band</span>
          <select
            value=""
            onChange={(event) => {
              const itu = ITU_BANDS.find((b) => b.abbr === event.target.value);
              if (itu) onJump(itu.lo, itu.hi);
            }}
          >
            <option value="">Jump to…</option>
            {ITU_BANDS.map((itu) => (
              <option key={itu.abbr} value={itu.abbr}>
                {itu.abbr} · {formatHz(itu.lo)}–{formatHz(itu.hi)}
              </option>
            ))}
          </select>
        </label>

        <label className="toggle" title="Only bands where the family holds a primary allocation">
          <input
            type="checkbox"
            checked={filters.primaryOnly}
            onChange={(event) => onChange({ ...filters, primaryOnly: event.target.checked })}
          />
          Primary only
        </label>

        <label className="toggle" title="Add a texture to every fill, for colour-vision, print and forced-colours">
          <input type="checkbox" checked={textured} onChange={onToggleTexture} />
          Texture
        </label>

        <span className="result-count">
          {resultCount === totalCount ? (
            <>{totalCount} bands</>
          ) : (
            <>
              <strong>{resultCount}</strong> of {totalCount} bands
            </>
          )}
          {tuned && <em> · tuned to {formatHz(tuned)}</em>}
        </span>

        {hasActiveFilters(filters) && (
          <button
            type="button"
            className="reset"
            onClick={() => onChange({ query: '', families: new Set(), window: null, primaryOnly: false })}
          >
            Reset filters
          </button>
        )}
      </div>

      <div className="legend" role="group" aria-label="Service families">
        {FAMILIES.map((family) => {
          const active = filters.families.has(family.key);
          return (
            <button
              key={family.key}
              type="button"
              className={`legend-item${active ? ' active' : ''}`}
              aria-pressed={active}
              onClick={() => toggleFamily(family.key)}
            >
              <span className="swatch" style={{ background: familyColour(family) }} aria-hidden />
              {family.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
