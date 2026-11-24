# MHP Deal Tracker

On-market Crexi mobile home park tracker for listings that meet (or almost meet) the current buy box, plus a tab for Crexi properties saved on the user’s account.

Live: https://borealsauce.github.io/mhp-deal-tracker/

## What’s on the site

- **Qualified / Seller financing / Other passes:** parks that meet the current criteria.
- **Missing info — chase broker:** otherwise interesting parks missing price, occupancy, city water & sewer, pad count, RV share, or 3-mile population. Each row lists the exact gaps and any broker name, phone, or email present on the public Crexi listing. Do not contact brokers from this repo unless asked.
- **Crexi Saved:** all properties saved on the Crexi account (currently 17 MHP + 5 gas-station NNN). Default filter is MHP; switch the Group dropdown for NNN or all saved. Cards use the real Crexi listing photo. A later scrape of occupancy / TOH / POH / pads can be merged from `crexi_saved_details.csv`.
- Split list/map view (Leaflet + OpenStreetMap tiles). Pins follow the same filters as the list.
- **Card view** is styled like a Crexi listing card: large park photo on top (real listing image, or a plain name placeholder if the image is missing), then price, name, city/state, pads, TOH/POH, cap, and occupancy.
- **TOH** (tenant-owned homes) and **POH** (park-owned homes) columns sit immediately after Pads. Values are filled only from listing text or notes, or clearly implied from a known pad count and the other side. Rent-to-own / owner-financed homes are not folded into either count. Blank means unknown, not zero, unless the listing says there are none.
- **Score (1–10):** a badge on the card photo (top-left, green / yellow / red) and a table column. Hover the badge for the factor-by-factor breakdown. Click it to type your own 1–10 rating (stored in `localStorage`) or clear it to return to the computed score. Missing fields are skipped, not invented; the tooltip says how many factors were used. The formula is for MHPs; NNN / retail rows stay blank until you set a rating.
- Editable **Status** (Interested / Contacted / Pass) and **Chase status** (Not contacted / Asked / Got info) are stored only in the browser (`localStorage`).
- Table headers support stacked **multi-sort** (priority number + arrow), **column resize**, and **drag-to-reorder**. Use **Single sort** to replace the stack, and **Clear sorts** to reset. Sort, column order, and widths persist in `localStorage`. New columns (TOH, POH, Score) are inserted in their default position even if an older saved layout doesn’t mention them.
- **Export CSV** downloads the current filtered table (UTF-8 with BOM, quoted fields, CRLF) so it opens cleanly in Apple Numbers.

## Deal score formula

Weighted average of *available* factors only. Weights of skipped factors are dropped and the rest are renormalized so the result stays on a 1–10 scale, rounded to one decimal. Badge colors: green ≥ 7.5, yellow ≥ 5, red below 5.

| Factor | Weight | How it’s scored (points out of 10) |
|---|---|---|
| City / public water & sewer | 20 | Both city/public: 10. Water only / sewer not stated: 6. Stated but not clearly city: 2. Not stated: skipped. |
| Occupancy | 20 | ≥85%: 10. 80–85%: 7. 70–80%: 4. <70%: 1. Not stated: skipped. |
| TOH share of known homes | 20 | Needs both TOH and POH. ≥80% TOH: 10. ≥50%: 7. ≥20%: 4. Below that: 2. Otherwise skipped. |
| 3-mile population | 15 | ≥15k: 10. ≥8k: 8. ≥5k: 6. ≥3k: 3. Below 3k: 1. Missing: skipped. Under ~5,000 is treated as isolated. |
| Cap rate | 10 | ≥10%: 10. ≥8%: 7. ≥6%: 4. Below 6%: 2. Not stated: skipped. |
| Seller financing | 10 | Offered: 10. Seller may consider: 7. Not mentioned: 4 (neutral). Explicitly not offered: 1. |
| Price per pad | 5 | ≤$40k: 10. ≤$60k: 7. ≤$80k: 4. Above that: 2. Needs both price and pads. |

## Updating data

Buy-box data lives in `data/listings.json` (built from `data_listings.json` plus `toh_poh.json`). Saved properties are built from `crexi_saved.csv` into `data/saved.json`.

1. Refresh the Crexi pull in `/workspace/crexi_mhp/` and the classified CSV, or replace `crexi_saved.csv` (and optionally add `crexi_saved_details.csv` with occupancy / TOH / POH / pads).
2. From the project folder (one level above `site/`) run `python3 gen_data.py`.
3. Run `./publish.sh` to push GitHub Pages.

Do not invent prices, occupancy, utilities, pad counts, broker contacts, or TOH/POH. Use `n/a` or leave blank when the listing does not state them.

## Criteria (as of Nov 22, 2026)

Operating MHPs only; RV sites allowed up to 5% of spaces (unknown RV share goes to Missing info); city/municipal water and sewer only; occupancy about 80%+; more than about 5,000 people within 3 miles; priced $800K–$3.8M or unpriced; seller financing only if the listing itself says so; exclude California and the Northeast (ME, NH, VT, MA, RI, CT, NY, NJ, PA).
