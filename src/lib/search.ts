/**
 * Filtering for the band list. Everything runs client-side over 566 bands, so a
 * plain lower-cased haystack per band is quicker than any index we could ship,
 * and it lets a search for "5.441" hit a footnote number as readily as "Wi-Fi"
 * hits a national usage entry.
 */
import { AXIS_MAX, AXIS_MIN, FAMILY_BY_KEY, familiesOf } from './spectrum';
import type { Band, SpectrumData } from './types';

export interface Filters {
  query: string;
  /** Family keys to keep; empty means no family filter. */
  families: Set<string>;
  /**
   * Whether to intersect against the chart's zoom window. A flag rather than a
   * copy of the range, so the list keeps following the window as it moves —
   * snapshotting it here would freeze the list at whatever was on screen when
   * the box was ticked.
   */
  limitToWindow: boolean;
  /** When true, keep only bands with a primary allocation in a chosen family. */
  primaryOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  families: new Set(),
  limitToWindow: false,
  primaryOnly: false,
};

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.families.size > 0 ||
    filters.limitToWindow ||
    filters.primaryOnly
  );
}

/**
 * Builds the searchable text for each band: its label, every entry in all six
 * columns, and the full description of any catalogued item it references. The
 * descriptions are what make footnote text searchable.
 */
export function buildHaystacks(data: SpectrumData): string[] {
  return data.bands.map((band) => {
    const parts: string[] = [band.n];
    for (const column of band.c) {
      for (const item of column) {
        parts.push(item.x);
        if (item.c != null) {
          const content = data.content[String(item.c)];
          if (content?.d) parts.push(content.d);
        }
      }
    }
    return parts.join('  ').toLowerCase();
  });
}

/**
 * A quoted phrase matches literally; otherwise every whitespace-separated term
 * must appear somewhere in the band, in any order.
 */
function parseQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const quoted = /^"(.*)"$/.exec(trimmed);
  if (quoted) return [quoted[1]];
  return trimmed.split(/\s+/).filter(Boolean);
}

/**
 * Reads a free-text frequency out of the query, so typing "2.4 GHz" or "100MHz"
 * jumps to the band containing it rather than relying on a text match.
 */
export function parseFrequency(query: string): number | null {
  const m = /^\s*([\d.,]+)\s*(hz|khz|mhz|ghz|thz)\s*$/i.exec(query);
  if (!m) return null;
  const scale = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 }[m[2].toLowerCase()]!;
  const hz = Number(m[1].replace(/,/g, '')) * scale;
  if (!Number.isFinite(hz) || hz < AXIS_MIN / 10 || hz > AXIS_MAX) return null;
  return hz;
}

export function bandContains(band: Band, hz: number): boolean {
  return band.lo != null && band.hi != null && hz >= band.lo && hz < band.hi;
}

export function applyFilters(
  data: SpectrumData,
  haystacks: string[],
  filters: Filters,
  /** The chart's live zoom window, used only when `limitToWindow` is set. */
  window: { lo: number; hi: number },
): Band[] {
  const terms = parseQuery(filters.query);
  const tuned = parseFrequency(filters.query);
  const familyKeys = filters.families;

  return data.bands.filter((band) => {
    if (filters.limitToWindow) {
      if (band.lo == null || band.hi == null) return false;
      if (band.hi <= window.lo || band.lo >= window.hi) return false;
    }

    if (familyKeys.size > 0) {
      const present = filters.primaryOnly
        ? primaryFamilies(band)
        : familiesOf(band).map((f) => f.key);
      if (!present.some((key) => familyKeys.has(key))) return false;
    }

    if (tuned) return bandContains(band, tuned);
    if (terms.length === 0) return true;

    const haystack = haystacks[band.id];
    return terms.every((term) => haystack.includes(term));
  });
}

/** Family keys for which this band holds a *primary* allocation. */
function primaryFamilies(band: Band): string[] {
  const keys = new Set<string>();
  for (const column of band.c.slice(0, 2)) {
    for (const item of column) {
      if (item.t !== 1 || !item.p || item.c == null) continue;
      for (const [key, family] of FAMILY_BY_KEY) {
        if (family.services.includes(item.c)) keys.add(key);
      }
    }
  }
  return [...keys];
}
