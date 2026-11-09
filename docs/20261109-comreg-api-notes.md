# ComReg RFPI API — reverse-engineering notes

*9 November 2026*

Notes from working out how [rfpi.comreg.ie](https://rfpi.comreg.ie/) serves the Radio Frequency Plan
for Ireland, kept because none of it is documented and the shapes are non-obvious.

## Endpoints

Found in the minified bundle at `/js/scripts.index.js`:

```js
this.Api = {
  FrequencyTable: this.ApiBase + "FrequencyTable/",
  FrequencyRange: this.ApiBase + "FrequencyRange/",
  ContentItem:    this.ApiBase + "Content/",
  ContentType:    this.ApiBase + "ContentType/",
}
this.CONTENT_TYPE_RADIO_SERVICE = 1
```

`ApiBase` is `/api/`. That last constant is the key that unlocks the table: the `i` field on every
table entry is a **ContentTypeId**.

| Endpoint | Notes |
|---|---|
| `GET /api/FrequencyTable/?pageSize=1000&pageNumber=1` | Whole table in one response |
| `GET /api/FrequencyRange/` | 566 canonical band names, ids in steps of 100 |
| `GET /api/ContentType/` | 18 content types with usage counts |
| `GET /api/Content/{id}` | One item: text, description, `LinkToSource` |

Only the by-id form of `/api/Content/` works. `/api/Content/`, `?pageSize=`, and `?contentTypeId=`
all return 500. There is no bulk fetch, hence 667 individual requests at a polite concurrency of 6.

## The table payload

```json
{ "Page": 1, "Pages": 1, "PageSize": 1000, "TotalRecords": 566, "ReadOnlyTable": "<a JSON string>" }
```

`ReadOnlyTable` is a **JSON string that must be parsed again**. It yields 2,291 rows × 7 columns.

### Columns

| # | Heading | Holds |
|---|---|---|
| 0 | Frequency Band | Band label; `r` > 0 opens a band and gives its rowspan |
| 1 | ITU | ITU Region 1 allocation + ITU footnotes |
| 2 | European | European Common Allocation + ECA footnotes |
| 3 | National Usage | Irish usage + IRL footnotes |
| 4 | Legislation | Irish S.I.s and EU Decisions |
| 5 | CEPT | ECC/ERC Decisions, CEPT Recommendations |
| 6 | Notes | ComReg documents, agreements, commentary |

### Cell and item shape

```jsonc
// cell
{ "c": [ /* items */ ] | null, "r": 2, "t": "8.3000 - 9 kHz", "pa": false, "pd": false, "pm": false }

// item
{
  "r":  "METEOROLOGICAL AIDS",  // rendered text — case is meaningful
  "t":  "Meteorological Aids",  // canonical content text
  "s":  null,                   // suffix, e.g. "as amended by 2008/673/EC"
  "en": null,                   // the text itself, for uncatalogued prose
  "p":  true,                   // PRIMARY allocation (ComReg upper-case these)
  "i":  1,                      // ContentTypeId
  "id": 18,                     // ContentId — fetch /api/Content/18
  "u":  "18,meteorological-aids" // "<id>,<slug>"
}
```

Three things worth knowing:

1. **A band is a row group, not a row.** Column 0 carries a rowspan of 2–8; the rows it spans are
   sub-entries, and columns 1–3 line up row-for-row within the group. The 566 bands occupy 2,291
   rows.
2. **`p` encodes primary vs secondary allocation.** ComReg follow the ITU convention of upper-casing
   primary services, and `p` mirrors it. `r` preserves the case; `t` does not.
3. **Content id 1063 is a sentinel** meaning "loose prose, not a catalogued item". The real text is
   in `en`, `t` is empty, and there is nothing to look up. 2,274 of 8,618 entries are like this.

### Content types

```
1 Radio Service       2 National Usage       3 CEPT Arrangement     4 CEPT Documentation
5 CEPT Recommendation 6 European Footnote    7 ITU Documentation    8 ITU Footnote
9 Primary Legislation 10 Secondary Legislation  11 European Legislation  12 Abbreviation
13 Definition         14 ComReg Documentation   15 Other Documentation   16 Additional Content
17 Notes
```

Type 2 does double duty: in column 3 it is a national usage entry with its own id, everywhere else
it is usually the 1063 prose sentinel.

### Fields that turned out to be noise

`pa` / `pd` / `pm` (pending add/delete/modify) are `false` throughout. `in` is non-null on exactly
three items, always `""`. `CreatedOn`, `UsageCount`, `OrderIndex` and `PendingActions` on content
items are server-side bookkeeping and are stripped during fetch so refreshes diff cleanly.

## Data observations

- All 566 band labels parse with one regex: `(num) - (num) (Hz|kHz|MHz|GHz|THz)`, both edges sharing
  the trailing unit.
- The plan is edge-to-edge contiguous with **one** exception: `395 – 399.99 MHz` is followed by
  `399.9 – 400.05 MHz`, a genuine 90 kHz overlap in ComReg's data.
- 32 distinct radio services; ids 32 and 10209 are the same service ("Standard Frequency and Time
  Signal–Satellite") differing only by an en dash.
- 667 referenced content ids, of which 666 are real and one is the 1063 sentinel.
- The first band starts at 0 Hz, which a log axis cannot plot. The charts floor at 3 kHz — the
  bottom of ITU band 4 (VLF) per ITU-R V.431 — and the plan allocates nothing below 8.3 kHz anyway.
