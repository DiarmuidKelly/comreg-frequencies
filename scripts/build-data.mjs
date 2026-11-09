#!/usr/bin/env node
/**
 * Normalises the raw ComReg RFPI payloads in data/raw/ into the single static
 * bundle the site loads at runtime: public/data/spectrum.json.
 *
 * The raw table is a 2,291-row x 7-column HTML table expressed as JSON, where a
 * frequency band is a *group* of rows held together by a rowspan on column 0.
 * This script collapses each group into one band record with six ordered lists of
 * content items, and resolves every band edge to an absolute frequency in hertz so
 * the UI can place it on a logarithmic spectrum axis.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = resolve(ROOT, 'public/data');

/** Column 0 is the band label; these are the six content columns, in table order. */
const COLUMNS = [
  { key: 'itu', label: 'ITU', blurb: 'Radio Regulations allocation for ITU Region 1' },
  { key: 'european', label: 'European', blurb: 'European Common Allocation (ECA) table' },
  { key: 'national', label: 'National Usage', blurb: 'How the band is actually used in Ireland' },
  { key: 'legislation', label: 'Legislation', blurb: 'Irish statutory instruments and EU law' },
  { key: 'cept', label: 'CEPT', blurb: 'ECC/ERC Decisions and CEPT Recommendations' },
  { key: 'notes', label: 'Notes', blurb: 'ComReg documents, agreements and commentary' },
];

/**
 * ComReg use id 1063 as a sentinel for "this is loose prose, not a catalogued
 * item" — such entries have no description to look up, so they are never links.
 */
const FREE_TEXT_ID = 1063;

const UNITS = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 };

/**
 * Parses a band label such as "19.9500 - 20.0500 kHz" or "275 - 3000 GHz" into
 * absolute hertz. Both edges share the trailing unit.
 */
function parseBand(label) {
  const m = /^\s*([\d.,]+)\s*(?:-|–|—|to)\s*([\d.,]+)\s*(Hz|kHz|MHz|GHz|THz)\s*$/i.exec(label);
  if (!m) return null;
  const scale = UNITS[m[3].toLowerCase()];
  const lo = Number(m[1].replace(/,/g, '')) * scale;
  const hi = Number(m[2].replace(/,/g, '')) * scale;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { lo, hi };
}

/** Collapses the runs of whitespace the source HTML leaves behind, keeping newlines. */
function tidy(text) {
  return String(text ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

function titleCase(upper) {
  return upper
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bItu\b/g, 'ITU')
    .replace(/\bCept\b/g, 'CEPT')
    .replace(/\bComreg\b/g, 'ComReg')
    .replace(/\bEu\b/g, 'EU');
}

async function readRaw(name) {
  return JSON.parse(await readFile(resolve(RAW, name), 'utf8'));
}

async function main() {
  const tablePayload = await readRaw('frequency-table.json');
  const contentTypes = await readRaw('content-types.json');
  const contentList = await readRaw('content.json').catch(() => {
    throw new Error('data/raw/content.json missing — run `npm run fetch:raw` first');
  });

  const table = JSON.parse(tablePayload.ReadOnlyTable);

  // --- content catalogue -------------------------------------------------
  const types = {};
  for (const t of contentTypes) {
    if (t.ContentTypeId !== 0) types[t.ContentTypeId] = titleCase(t.Description);
  }

  const content = {};
  for (const c of contentList) {
    if (c.ContentId === FREE_TEXT_ID) continue;
    const entry = { n: tidy(c.ContentText), t: c.ContentTypeId };
    const description = tidy(c.ContentDescription);
    if (description) entry.d = description;
    if (c.LinkToSource) entry.l = c.LinkToSource.trim();
    content[c.ContentId] = entry;
  }

  // --- bands -------------------------------------------------------------
  // A rowspan on column 0 opens a band and tells us how many rows it owns.
  const starts = [];
  table.forEach((row, i) => {
    if (row[0].r > 0) starts.push(i);
  });
  starts.push(table.length);

  const bands = [];
  const unparsed = [];

  for (let b = 0; b < starts.length - 1; b++) {
    const from = starts[b];
    const to = starts[b + 1];
    const label = tidy(table[from][0].t);
    const range = parseBand(label);
    if (!range) unparsed.push(label);

    const cols = COLUMNS.map(() => []);
    const serviceIds = new Set();
    let primaryServiceId = null;

    for (let r = from; r < to; r++) {
      COLUMNS.forEach((_, ci) => {
        const cell = table[r][ci + 1];
        for (const raw of cell.c ?? []) {
          const text = tidy(raw.r) || tidy(raw.en) || tidy(raw.t);
          if (!text) continue;
          const item = { x: text, t: raw.i };
          if (raw.id !== FREE_TEXT_ID && content[raw.id]) item.c = raw.id;
          if (raw.p) item.p = 1;
          if (r > from) item.r = r - from;
          cols[ci].push(item);

          // Services drive the chart colouring and the service filter. The ITU
          // and European columns both carry them; ComReg signal "primary
          // allocation" by upper-casing the service name, which `p` mirrors.
          if (raw.i === 1 && raw.id !== FREE_TEXT_ID && ci <= 1) {
            serviceIds.add(raw.id);
            if (raw.p && primaryServiceId === null) primaryServiceId = raw.id;
          }
        }
      });
    }

    const band = {
      id: b,
      n: label,
      lo: range?.lo ?? null,
      hi: range?.hi ?? null,
      s: [...serviceIds],
      ps: primaryServiceId,
      c: cols,
    };
    bands.push(band);
  }

  // --- service catalogue (legend + filter) --------------------------------
  const serviceUse = new Map();
  for (const band of bands) {
    for (const id of band.s) serviceUse.set(id, (serviceUse.get(id) ?? 0) + 1);
  }
  const services = [...serviceUse.entries()]
    .map(([id, count]) => ({ id, name: content[id]?.n ?? `#${id}`, bands: count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Sanity: the plan should be gap-free and strictly ascending.
  const gaps = [];
  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    const cur = bands[i];
    if (prev.hi != null && cur.lo != null && prev.hi !== cur.lo) {
      gaps.push(`${prev.n} -> ${cur.n}`);
    }
  }

  const bundle = {
    meta: {
      source: 'https://rfpi.comreg.ie/',
      api: 'https://rfpi.comreg.ie/api/FrequencyTable/',
      generatedAt: new Date().toISOString().slice(0, 10),
      bandCount: bands.length,
      contentCount: Object.keys(content).length,
      columns: COLUMNS,
      contentTypes: types,
    },
    services,
    content,
    bands,
  };

  await mkdir(OUT, { recursive: true });
  const json = JSON.stringify(bundle);
  await writeFile(resolve(OUT, 'spectrum.json'), json + '\n');

  console.log(`bands            ${bands.length}`);
  console.log(`content items    ${Object.keys(content).length}`);
  console.log(`services         ${services.length}`);
  console.log(`bundle           ${(json.length / 1024).toFixed(0)} KiB`);
  if (unparsed.length) console.warn(`unparsed labels  ${unparsed.length}: ${unparsed.slice(0, 5).join(', ')}`);
  if (gaps.length) console.warn(`band edge gaps   ${gaps.length}: ${gaps.slice(0, 3).join(' | ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
