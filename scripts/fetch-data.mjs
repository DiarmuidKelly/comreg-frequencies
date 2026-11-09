#!/usr/bin/env node
/**
 * Fetches the raw Radio Frequency Plan for Ireland dataset from ComReg's RFPI API
 * into data/raw/. Nothing here is normalised — build-data.mjs does that — so the
 * raw payloads stay diffable when ComReg amend the plan.
 *
 * Endpoints (reverse-engineered from https://rfpi.comreg.ie/js/scripts.index.js):
 *   /api/FrequencyTable/?pageSize=&pageNumber=   the whole table, as a JSON string
 *   /api/FrequencyRange/                         canonical band list
 *   /api/ContentType/                            legend: content type ids -> names
 *   /api/Content/{id}                            one footnote/service/instrument
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const BASE = 'https://rfpi.comreg.ie/api';

/** Concurrent requests against ComReg's API. Kept low — it is a small public service. */
const CONCURRENCY = 6;
const RETRIES = 3;

async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'comreg-frequencies/1.0 (+https://github.com/DiarmuidKelly/comreg-frequencies)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRIES) throw new Error(`${url}: ${err.message}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
}

/** Runs `worker` over `items` with a fixed-size pool, preserving input order. */
async function pool(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

/** Every content id referenced anywhere in the table, so we fetch each exactly once. */
function collectContentIds(table) {
  const ids = new Set();
  for (const row of table) {
    for (const cell of row) {
      for (const item of cell.c ?? []) ids.add(item.id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

async function main() {
  await mkdir(RAW, { recursive: true });

  console.log('> frequency table');
  const tablePayload = await getJson(`${BASE}/FrequencyTable/?pageSize=1000&pageNumber=1`);
  await writeFile(resolve(RAW, 'frequency-table.json'), JSON.stringify(tablePayload, null, 0) + '\n');
  console.log(`  ${tablePayload.TotalRecords} bands`);

  console.log('> frequency ranges, content types');
  const [ranges, contentTypes] = await Promise.all([
    getJson(`${BASE}/FrequencyRange/`),
    getJson(`${BASE}/ContentType/`),
  ]);
  await writeFile(resolve(RAW, 'frequency-ranges.json'), JSON.stringify(ranges, null, 2) + '\n');
  await writeFile(resolve(RAW, 'content-types.json'), JSON.stringify(contentTypes, null, 2) + '\n');

  const ids = collectContentIds(JSON.parse(tablePayload.ReadOnlyTable));
  console.log(`> ${ids.length} content items (concurrency ${CONCURRENCY})`);

  let done = 0;
  const content = await pool(ids, async (id) => {
    const item = await getJson(`${BASE}/Content/${id}`);
    if (++done % 100 === 0) console.log(`  ${done}/${ids.length}`);
    return item;
  });

  // Drop the per-row churn fields: they are server-side bookkeeping and would make
  // every refresh look like a change.
  const cleaned = content.map(({ CreatedOn, UsageCount, OrderIndex, PendingActions, ...keep }) => keep);
  await writeFile(resolve(RAW, 'content.json'), JSON.stringify(cleaned, null, 2) + '\n');

  console.log(`done: ${cleaned.length} content items`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
