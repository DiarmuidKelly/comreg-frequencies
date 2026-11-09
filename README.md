# The Irish Radio Spectrum

An interactive explorer for ComReg's [Radio Frequency Plan for Ireland](https://rfpi.comreg.ie/) —
all 566 allocated bands from 3 kHz to 3 THz, with every ITU footnote, statutory instrument, ECC
Decision and ComReg note in full. Plus a printable vector wall chart of the whole spectrum.

Unofficial. For anything binding, consult the official plan.

## What it does

- **Nine staves, one per ITU band.** VLF through THF each get a full-width logarithmic decade, so
  LF is as readable as SHF. Drag across any stave to zoom; the lower strip shows the window with
  direct band labels and takes wheel-zoom and drag-pan.
- **Search everything.** Type `2.4 GHz` to tune straight to the band containing it, `5.441` to find
  an ITU footnote, or `amateur` / `Wi-Fi` / `S.I. 264 of 2021` to match a service, a usage or an
  instrument. Footnote *body text* is searchable, not just its number.
- **Every entry in full.** Click any footnote, decision or instrument for its complete text, a link
  to the source document, and every other band that cites it.
- **Printable poster.** A0 / A1 / A2 / A3 vector PDF, generated in the browser, optionally
  highlighting the current filter.
- Light and dark themes, a colour-vision texture channel, and a table view throughout.

## Quick start

```sh
make dev        # install, build the data bundle, serve on http://localhost:5173
make help       # list every target
```

| Target | What it does |
|---|---|
| `make install` | Install dependencies |
| `make dev` | Dev server on `$PORT` (default 5173) |
| `make data` | Rebuild `public/data/spectrum.json` from `data/raw/` |
| `make refresh` | Re-scrape ComReg, then rebuild the bundle |
| `make check` | Type-check |
| `make build` | Production build into `dist/` |
| `make preview` | Serve the production build |
| `make deploy-cf` | Publish `dist/` to Cloudflare Pages |
| `make clean` | Remove `dist/` and the generated bundle |

## Data

ComReg publish the plan through an undocumented JSON API behind
[rfpi.comreg.ie](https://rfpi.comreg.ie/). Four endpoints matter:

| Endpoint | Contents |
|---|---|
| `/api/FrequencyTable/?pageSize=1000&pageNumber=1` | The whole table, as a JSON string inside a JSON object |
| `/api/FrequencyRange/` | Canonical band list |
| `/api/ContentType/` | Legend: content type ids to names |
| `/api/Content/{id}` | One footnote, service, instrument or decision, with its source link |

The table arrives as 2,291 rows × 7 columns of HTML-table-shaped JSON, where a *band* is a group of
rows held together by a `rowspan` on column 0.

- `scripts/fetch-data.mjs` pulls all of it — including a `/api/Content/{id}` call per referenced id,
  667 of them — into `data/raw/`, which **is committed**. The site never calls ComReg at runtime.
- `scripts/build-data.mjs` collapses the row groups into 566 band records, resolves every band edge
  to absolute hertz, and writes `public/data/spectrum.json` (~740 KiB, ~150 KiB gzipped). That file
  is **not** committed — it is derived, and regenerated on every build.

A scheduled workflow re-scrapes monthly and opens a PR only if `data/raw` actually changed, so the
PR diff doubles as a changelog of what ComReg amended.

### Known quirks in ComReg's data

- `395 – 399.99 MHz` and `399.9 – 400.05 MHz` overlap. That is in the source, not a parse error.
- Content id `1063` is a sentinel for "loose prose, not a catalogued item". Those entries have no
  description, so they render as plain text rather than dead links.
- Some entries you would expect to be catalogued are typed as prose by ComReg — `ECC/DEC/(14)02` in
  the 2300–2450 MHz band, for one. They are shown as written.

## Colour

Eight service families on a validated categorical palette, defined once in
[`src/lib/palette.ts`](src/lib/palette.ts) and applied as CSS custom properties, so the stylesheet,
the chart and the PDF exporter all read the same hexes.

ComReg name 32 distinct radio services — far past what a categorical palette can carry — so they
collapse into Fixed, Mobile, Broadcasting, Aeronautical, Maritime, Radiodetermination, Space &
science, and Amateur, plus a neutral for unallocated spectrum. Individual service names stay visible
in the tooltip, the row chips and the detail panel, so colour never carries meaning alone.

The palette passes the adjacent-pair gates in both modes (worst CVD ΔE 9.1 light / 8.4 dark). Three
light slots sit below 3:1 against the surface, so the relief rule applies: direct labels on the
ribbon, an always-visible legend, a hover tooltip, an optional texture channel, and the full table
view.

## Deploying

**GitHub Pages** — `.github/workflows/deploy.yml` builds and publishes on every push to `main`.
Enable Pages with "GitHub Actions" as the source. The workflow sets `BASE_PATH` to `/<repo>/`
automatically for a project page.

**Cloudflare Pages** — build command `npm run build`, output directory `dist`, and leave
`BASE_PATH` unset for a domain root. Or `make deploy-cf` with wrangler.

## Licence

Code: MIT. The underlying frequency plan is ComReg's and remains theirs.
