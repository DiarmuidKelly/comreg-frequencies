/** Shapes of public/data/spectrum.json, as emitted by scripts/build-data.mjs. */

/** One catalogued item: a service, footnote, statutory instrument, decision, note. */
export interface ContentItem {
  /** Canonical name, e.g. "5.53" or "Fixed". */
  n: string;
  /** Content type id; look up a label in `meta.contentTypes`. */
  t: number;
  /** Full text of the footnote or entry. Absent for items ComReg left blank. */
  d?: string;
  /** Link to the authoritative source document. */
  l?: string;
}

/** One entry as it appears inside a band's column. */
export interface BandItem {
  /** Rendered text, exactly as ComReg present it (case is meaningful). */
  x: string;
  /** Content type id. */
  t: number;
  /** Content id, if this entry is catalogued and so has a description to show. */
  c?: number;
  /** 1 when ComReg upper-case the entry, which marks a primary allocation. */
  p?: 1;
  /** Row offset within the band's row group in the official table layout. */
  r?: number;
}

export interface Band {
  id: number;
  /** Official label, e.g. "87.5 - 108 MHz". */
  n: string;
  /** Lower edge in hertz. */
  lo: number | null;
  /** Upper edge in hertz. */
  hi: number | null;
  /** Content ids of every radio service allocated in the band. */
  s: number[];
  /** Content id of the first primary (upper-cased) service, if any. */
  ps: number | null;
  /** Six columns of entries, in table order: ITU, European, National, Legislation, CEPT, Notes. */
  c: BandItem[][];
}

export interface ColumnMeta {
  key: string;
  label: string;
  blurb: string;
}

export interface SpectrumData {
  meta: {
    source: string;
    api: string;
    generatedAt: string;
    bandCount: number;
    contentCount: number;
    columns: ColumnMeta[];
    contentTypes: Record<string, string>;
  };
  services: { id: number; name: string; bands: number }[];
  content: Record<string, ContentItem>;
  bands: Band[];
}
