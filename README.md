# MHP Deal Tracker

On-market Crexi mobile home park tracker for listings that meet (or almost meet) the current buy box.

Live: https://borealsauce.github.io/mhp-deal-tracker/

## What’s on the site

- **Qualified / Seller financing / Other passes:** parks that meet the current criteria.
- **Missing info — chase broker:** otherwise interesting parks missing price, occupancy, city water & sewer, pad count, RV share, or 3-mile population. Each row lists the exact gaps and any broker name, phone, or email present on the public Crexi listing. Do not contact brokers from this repo unless asked.
- Split list/map view (Leaflet + CARTO/OpenStreetMap tiles). Pins follow the same filters as the list.
- Editable **Status** (Interested / Contacted / Pass) and **Chase status** (Not contacted / Asked / Got info) are stored only in the browser (`localStorage`).
- Table headers support stacked **multi-sort** (priority number + arrow). Use **Single sort** to replace the stack, and **Clear sorts** to reset. Sort state persists in `localStorage`.

## Updating after a weekly Crexi digest

Data lives in `data/listings.json` (and is generated from `/workspace/crexi_mhp/` on the box).

1. Refresh the Crexi pull in `/workspace/crexi_mhp/` and the classified CSV.
2. Re-run the data builder (see `gen_data.py` in this project folder, one level above the published `site/`).
3. From this directory run `./publish.sh` to push GitHub Pages.

Do not invent prices, occupancy, utilities, pad counts, or broker contacts. Use `n/a` when the listing does not state them.

## Criteria (as of Nov 22, 2026)

Operating MHPs only; RV sites allowed up to 5% of spaces (unknown RV share goes to Missing info); city/municipal water and sewer only; occupancy about 80%+; more than about 5,000 people within 3 miles; priced $800K–$3.8M or unpriced; seller financing only if the listing itself says so; exclude California and the Northeast (ME, NH, VT, MA, RI, CT, NY, NJ, PA).
