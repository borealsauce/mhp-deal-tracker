const DATA_URL = "data/listings.json";
const SAVED_URL = "data/saved.json";
const EST_URL = "data/est_inputs.json";
const LS = {
  status: "mhpDealTracker.status.v1",
  chase: "mhpDealTracker.chase.v1",
  sorts: "mhpDealTracker.sorts.v1",
  mode: "mhpDealTracker.sortMode.v1",
  view: "mhpDealTracker.view.v1",
  tab: "mhpDealTracker.tab.v1",
  score: "mhpDealTracker.scoreOverride.v1",
  colOrder: "mhpDealTracker.colOrder.v1",
  colWidths: "mhpDealTracker.colWidths.v1",
  cardSize: "mhpDealTracker.cardSize.v1",
  mapWidth: "mhpDealTracker.mapWidth.v1",
  notes: "mhpDealTracker.notes.v1",
  cap: "mhpDealTracker.capOverride.v1",
  deleted: "mhpDealTracker.deleted.v1",
  showDeleted: "mhpDealTracker.showDeleted.v1",
  value: "mhpDealTracker.valueOverride.v1",
};

const GROUPS = {
  seller_financing: { label: "Seller financing", color: "#12875A", pill: "sf", short: "Seller financing" },
  other_passes: { label: "Other passes", color: "#2B6CB0", pill: "pass", short: "Other pass" },
  missing_info: { label: "Missing info — chase broker", color: "#C05621", pill: "miss", short: "Missing info" },
  saved_mhp: { label: "Crexi saved — MHP", color: "#12875A", pill: "sf", short: "Saved MHP" },
  saved_nnn: { label: "Crexi saved — NNN", color: "#6B4C9A", pill: "nnn", short: "Saved NNN" },
};

const MAIN_STATUS = ["", "Interested", "Contacted", "Pass"];
const CHASE_STATUS = ["Not contacted", "Asked", "Got info"];

/* Deal score 1–10: weighted average of available factors only (missing
   factors are skipped and weights are renormalized). Never invents a
   value for a blank field. Tooltip shows the breakdown.

   Factor                         Weight
   City / public water & sewer       20
   Occupancy (80–85%+ favored)       20
   TOH share of known homes          20
   3-mile population (isolation)     15
   Cap rate                          10
   Seller financing (a plus)         10
   Price per pad                      5
*/
const SCORE_WEIGHTS = {
  utilities: 20,
  occupancy: 20,
  tohShare: 20,
  pop3: 15,
  cap: 10,
  sf: 10,
  ppl: 5,
};

const COLS = {
  status: { label: "Status", type: "status" },
  chase: { label: "Chase status", type: "chase" },
  name: { label: "Park", type: "text" },
  city: { label: "City", type: "text" },
  state: { label: "State", type: "text" },
  price: { label: "Price", type: "num" },
  pads: { label: "Pads", type: "pads" },
  toh: { label: "TOH", type: "num" },
  poh: { label: "POH", type: "num" },
  score: { label: "Score", type: "score" },
  cap: { label: "Cap", type: "pct" },
  occupancy: { label: "Occupancy", type: "pct" },
  utilities: { label: "Utilities", type: "text" },
  pop3: { label: "3-mi pop", type: "num" },
  sf_terms: { label: "Seller financing", type: "text" },
  is_new: { label: "New / seen", type: "bool" },
  missing: { label: "Missing fields", type: "missing" },
  broker: { label: "Broker", type: "broker" },
  phone: { label: "Phone", type: "text" },
  email: { label: "Email", type: "text" },
  note: { label: "Note", type: "text" },
  type: { label: "Type", type: "text" },
  est_value: { label: "Est. Value", type: "num" },
  purchase_cap: { label: "Purchase Cap", type: "pct" },
  market_cap: { label: "Market Cap", type: "pct" },
  vs_ask: { label: "Value vs Ask", type: "num" },
  mynotes: { label: "My Notes", type: "notes" },
  noi: { label: "NOI", type: "num" },
  ppl: { label: "Price / pad", type: "num" },
  acres: { label: "Acres", type: "num" },
  added: { label: "Date added", type: "num" },
  sel: { label: "", type: "sel" },
  act: { label: "", type: "act" },
};

/* Fields shown in the sort dropdown (card and table). */
const SORT_FIELDS = [
  "price","est_value","purchase_cap","market_cap","vs_ask","score",
  "pads","toh","poh","occupancy","cap","noi","ppl","acres","pop3",
  "city","state","name","is_new","added","mynotes","note",
  "utilities","sf_terms","status","type","missing","broker","chase",
];

const MAIN_COLS = ["sel","status","name","city","state","price","est_value","purchase_cap","market_cap","vs_ask","pads","toh","poh","score","cap","occupancy","utilities","pop3","sf_terms","is_new","note","mynotes","act"];
const MISS_COLS = ["sel","chase","name","city","state","price","est_value","purchase_cap","market_cap","vs_ask","missing","broker","phone","email","pads","toh","poh","score","occupancy","utilities","pop3","is_new","note","mynotes","act"];
const SAVED_COLS = ["sel","status","name","type","city","state","price","est_value","purchase_cap","market_cap","vs_ask","pads","toh","poh","score","cap","occupancy","utilities","pop3","sf_terms","note","mynotes","act"];
const SKIP_SORT = { sel: true, act: true };

let DATA = { listings: [], saved: [], as_of_label: "" };
let EST = { listings: {}, defaults: { occupancy_pct: 85, tier_caps: { rural: 10.5, secondary: 9, metro: 7.5 } } };
let map, markersLayer, markerById = {};
let selectedId = null;
let sorts = [];
let sortMode = "multi";
let view = "cards";
let tab = "all_qualified";
let colOrder = { main: null, miss: null };
let colWidths = {};
let cardSize = "m";
let mapWidth = 48;
let showDeleted = false;
let selectedKeys = new Set();
let toastTimer = null;
let lastDeleted = [];

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function statusMap() { return loadJSON(LS.status, {}); }
function chaseMap() { return loadJSON(LS.chase, {}); }
function scoreOverrideMap() { return loadJSON(LS.score, {}); }
function getStatus(id) { return statusMap()[id] || ""; }
function getChase(id) { return chaseMap()[id] || "Not contacted"; }
function setStatus(id, v) { const m = statusMap(); if (v) m[id] = v; else delete m[id]; saveJSON(LS.status, m); }
function setChase(id, v) { const m = chaseMap(); m[id] = v; saveJSON(LS.chase, m); }
function getScoreOverride(id) {
  const v = scoreOverrideMap()[id];
  return (typeof v === "number" && !isNaN(v)) ? v : null;
}
function setScoreOverride(id, v) {
  const m = scoreOverrideMap();
  if (v == null) delete m[id];
  else m[id] = v;
  saveJSON(LS.score, m);
}

function money(p) {
  if (p == null || p === "") return "Unpriced";
  return "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function moneyCompact(p) {
  if (p == null || p === "" || isNaN(Number(p))) return "Unpriced";
  const v = Number(p);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000000) {
    const m = abs / 1000000;
    const s = (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.?0+$/, "");
    return sign + "$" + s + "M";
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const s = (k >= 100 ? String(Math.round(k)) : k.toFixed(k >= 10 ? 0 : 1)).replace(/\.0$/, "");
    return sign + "$" + s + "k";
  }
  return sign + "$" + Math.round(abs).toLocaleString("en-US");
}
function listingKey(row) {
  if (row && row.id != null && row.id !== "") return String(row.id);
  return String((row && (row.url || row.name)) || "");
}
function findRow(id) {
  const k = String(id);
  const lists = [DATA.listings || [], DATA.saved || []];
  for (const list of lists) {
    const hit = list.find(x => String(x.id) === k);
    if (hit) return hit;
  }
  return null;
}
function notesMap() { return loadJSON(LS.notes, {}); }
function getNotes(row) {
  const m = notesMap();
  const key = listingKey(row);
  if (m[key]) return m[key];
  if (row && row.url && m[row.url]) return m[row.url];
  return "";
}
function setNotes(row, text) {
  const m = notesMap();
  const key = listingKey(row);
  const v = String(text || "");
  if (v) m[key] = v;
  else delete m[key];
  if (row && row.url && row.url !== key) {
    if (v) m[row.url] = v;
    else delete m[row.url];
  }
  saveJSON(LS.notes, m);
}
function capOverrideMap() { return loadJSON(LS.cap, {}); }
function getCapOverride(row) {
  const m = capOverrideMap();
  const v = m[listingKey(row)];
  return (typeof v === "number" && !isNaN(v) && v > 0) ? v : null;
}
function setCapOverride(row, v) {
  const m = capOverrideMap();
  const key = listingKey(row);
  if (v == null) delete m[key];
  else m[key] = v;
  saveJSON(LS.cap, m);
}
function deletedState() {
  const raw = loadJSON(LS.deleted, { keys: [] });
  if (Array.isArray(raw)) return { keys: raw.map(String) };
  return { keys: Array.isArray(raw.keys) ? raw.keys.map(String) : [] };
}
function deletedKeySet() { return new Set(deletedState().keys); }
function persistDeleted(set) { saveJSON(LS.deleted, { keys: Array.from(set) }); }
function isDeleted(row) {
  const d = deletedKeySet();
  if (d.has(listingKey(row))) return true;
  if (row && row.url && d.has(String(row.url))) return true;
  return false;
}
function markDeleted(rows) {
  const d = deletedKeySet();
  const batch = [];
  rows.forEach(row => {
    const keys = [];
    const k = listingKey(row);
    if (k) { d.add(k); keys.push(k); }
    if (row.url) { d.add(String(row.url)); keys.push(String(row.url)); }
    batch.push({ keys, name: row.name || k });
    selectedKeys.delete(k);
  });
  persistDeleted(d);
  return batch;
}
function unmarkDeleted(batch) {
  const d = deletedKeySet();
  (batch || []).forEach(item => (item.keys || []).forEach(k => d.delete(String(k))));
  persistDeleted(d);
}
function deletedInUniverse() {
  return activeUniverse().filter(isDeleted);
}

function parseMoneyish(s) {
  if (s == null || s === "") return null;
  if (typeof s === "number" && !isNaN(s)) return s;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function isMhpRow(row) {
  if (row && row.saved_group && row.saved_group !== "MHP") return false;
  return true;
}
function normCity(c) {
  if (!c) return "";
  const s = String(c).trim().replace(/\s+/g, " ");
  if (/^ca[nñ]on city$/i.test(s)) return "Canon City";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase());
  }
  return s;
}
function cityKey(row) { return normCity(row && row.city) + "|" + (row && row.state || ""); }
function listingFacts(row) {
  const m = (EST.listings || {});
  return m[listingKey(row)] || m[String(row && row.id)] || {};
}
function valueOverrideMap() { return loadJSON(LS.value, {}); }
function getValueOverride(row) {
  const v = valueOverrideMap()[listingKey(row)];
  return (typeof v === "number" && !isNaN(v) && v > 0) ? v : null;
}
function setValueOverride(row, v) {
  const m = valueOverrideMap();
  const key = listingKey(row);
  if (v == null) delete m[key];
  else m[key] = v;
  saveJSON(LS.value, m);
}
function clearEstOverrides(row) {
  setValueOverride(row, null);
  setCapOverride(row, null);
}

function numericPadsField(row) {
  const facts = listingFacts(row);
  if (facts.pads != null && facts.pads > 0) {
    return { n: Number(facts.pads), detail: facts.pads_source || ("pads from listing details: " + facts.pads), assumed: false };
  }
  const raw = row && row.pads;
  if (typeof raw === "number" && raw > 0) return { n: raw, detail: raw + " pads (listing field)", assumed: false };
  const s = String(raw == null ? "" : raw).trim();
  if (!s || /^n\/a/i.test(s)) return null;
  const n = firstNum(s);
  if (n != null && n > 0) return { n, detail: s, assumed: false };
  return null;
}

function lotRentInfo(row) {
  const facts = listingFacts(row);
  if (facts.lot_rent != null && facts.lot_rent > 0) {
    return { rent: Number(facts.lot_rent), detail: facts.lot_rent_source || ("stated lot rent $" + facts.lot_rent), assumed: false, comps: [] };
  }
  if (row && row.lot_rent != null && row.lot_rent !== "") {
    const n = parseMoneyish(row.lot_rent);
    if (n != null) return { rent: n, detail: "stated lot rent $" + n, assumed: false, comps: [] };
  }
  const blob = [row && row.note, row && row.sf_terms].filter(Boolean).join(" ");
  if (blob) {
    let m = blob.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:[-–]|to)\s*\$?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:avg(?:erage)?\s+)?(?:monthly\s+)?lot rents?/i);
    if (m) return { rent: (parseMoneyish(m[1]) + parseMoneyish(m[2])) / 2, detail: "midpoint of $" + m[1] + "–$" + m[2] + " lot rent (from notes)", assumed: false, comps: [] };
    m = blob.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:avg(?:erage)?\s+)?(?:monthly\s+)?(?:in\s+)?lot rents?/i);
    if (m) return { rent: parseMoneyish(m[1]), detail: "$" + m[1] + " lot rent (from notes)", assumed: false, comps: [] };
    m = blob.match(/lot rents?\s*(?:of|is|are|:)?\s*\$\s*([0-9][0-9,]*(?:\.\d+)?)/i);
    if (m) return { rent: parseMoneyish(m[1]), detail: "$" + m[1] + " lot rent (from notes)", assumed: false, comps: [] };
  }
  const ck = cityKey(row);
  const city = (EST.city_lot_rent || {})[ck];
  if (city && city.rent) {
    return { rent: Number(city.rent), detail: "Area lot-rent estimate $" + Math.round(city.rent) + " (" + (city.source || "city comps") + ")", assumed: true, comps: city.comps || [] };
  }
  const st = (EST.state_lot_rent || {})[row && row.state];
  if (st && st.rent) {
    return { rent: Number(st.rent), detail: "State lot-rent estimate $" + Math.round(st.rent) + " for " + row.state + " (" + (st.source || "state comps") + ")", assumed: true, comps: st.comps || [] };
  }
  return null;
}
function occupiedPadsInfo(row) {
  const facts = listingFacts(row);
  if (facts.occupied != null && facts.occupied > 0) {
    return { n: Number(facts.occupied), detail: facts.occupied_source || (facts.occupied + " occupied (listing details)"), assumed: false };
  }
  const pads = numericPadsField(row);
  if (facts.occupancy_pct != null && pads) {
    const n = Math.round(pads.n * Number(facts.occupancy_pct) / 100);
    return { n, detail: n + " occupied (" + facts.occupancy_pct + "% × " + pads.n + " pads)", assumed: false };
  }
  const occRaw = String((row && row.occupancy) || (row && row.note) || "");
  const of = occRaw.match(/(\d+)\s+of\s+(\d+)/i);
  if (of) return { n: +of[1], detail: of[1] + " of " + of[2] + " occupied", assumed: false };
  const vacant = occRaw.match(/(\d+)\s+vacant/i);
  if (vacant && pads) return { n: pads.n - +vacant[1], detail: pads.n + " pads − " + vacant[1] + " vacant", assumed: false };
  const occupied = occRaw.match(/(\d+)\s+occupied/i);
  if (occupied) {
    const occNum = firstNum(row && row.occupancy);
    // "n/a (19 occupied)" or occupancy that is a count, not a percent
    if (occNum == null || occNum === +occupied[1] || /^n\/a/i.test(occRaw) || occNum > 100) {
      return { n: +occupied[1], detail: occupied[1] + " occupied", assumed: false };
    }
  }
  const occ = firstNum(row && row.occupancy);
  if (pads && occ != null && occ > 0) {
    const pct = occ > 1.5 ? occ : occ * 100;
    if (pct <= 100) {
      const n = Math.round(pads.n * pct / 100);
      return { n, detail: n + " occupied (" + dash(row.occupancy) + ")", assumed: false };
    }
  }
  if (pads) {
    const pct = (EST.defaults && EST.defaults.occupancy_pct) || 85;
    const n = Math.round(pads.n * pct / 100);
    return { n, detail: n + " occupied (assumed " + pct + "% of " + pads.n + " pads — occupancy not stated)", assumed: true };
  }
  return null;
}
function padEstimateLastResort(row) {
  const pads = numericPadsField(row);
  if (pads) return pads;
  const price = row && row.price != null && row.price !== "" ? Number(row.price) : null;
  if (price == null || !(price > 0)) return null;
  const st = (EST.state_ppl || {})[row.state];
  const ppl = st && st.ppl ? st.ppl : ((EST.defaults && EST.defaults.overall_ppl) || 75000);
  const n = Math.max(1, Math.round(price / ppl));
  const src = st && st.source ? st.source : ((EST.defaults && EST.defaults.overall_ppl_note) || "overall median price/pad");
  return { n, detail: n + " pads estimated as ask " + money(price) + " ÷ " + money(ppl) + "/pad (" + src + ")", assumed: true, lastResort: true };
}
function isWellSeptic(row) {
  const u = String((row && row.utilities) || "").toLowerCase();
  return /\bwell\b|private well|septic/.test(u);
}
function pohShare(row) {
  const facts = listingFacts(row);
  const toh = typeof row.toh === "number" ? row.toh : (typeof facts.toh === "number" ? facts.toh : null);
  const poh = typeof row.poh === "number" ? row.poh : (typeof facts.poh === "number" ? facts.poh : null);
  if (toh != null && poh != null && toh + poh > 0) return poh / (toh + poh);
  return null;
}
function tohShareApprox(row) {
  const facts = listingFacts(row);
  const toh = typeof row.toh === "number" ? row.toh : (typeof facts.toh === "number" ? facts.toh : null);
  const poh = typeof row.poh === "number" ? row.poh : (typeof facts.poh === "number" ? facts.poh : null);
  const pads = numericPadsField(row);
  if (toh != null && poh != null && toh + poh > 0) return toh / (toh + poh);
  if (toh != null && pads) return toh / pads.n;
  return null;
}
function expenseRatio(row) {
  const well = isWellSeptic(row);
  const poh = pohShare(row);
  const toh = tohShareApprox(row);
  const util = factorUtilities(row);
  const city = !!(util && util.points === 10);
  if (poh != null && poh > 0.5) {
    return { ratio: 0.45, detail: "45% expense (POH share " + Math.round(poh * 100) + "%)" };
  }
  if (well) return { ratio: 0.45, detail: "45% expense (well/septic)" };
  if (toh != null && toh >= 0.5 && city) {
    return { ratio: 0.35, detail: "35% expense (TOH-heavy, city utilities)" };
  }
  return { ratio: 0.45, detail: "45% expense default (need TOH-heavy city-utility mix for 35%)" };
}
function popTierName(pop3) {
  if (pop3 == null || pop3 === "") return "secondary";
  const p = Number(pop3);
  if (isNaN(p)) return "secondary";
  if (p < 5000) return "rural";
  if (p <= 50000) return "secondary";
  return "metro";
}
function marketCapInfo(row) {
  const p = row.pop3 == null || row.pop3 === "" ? null : Number(row.pop3);
  const tier = popTierName(p);
  const defaults = (EST.defaults && EST.defaults.tier_caps) || { rural: 10.5, secondary: 9, metro: 7.5 };
  let base = defaults[tier] != null ? defaults[tier] : 9;
  let reason;
  let comps = [];
  const stTier = (EST.state_tier_caps || {})[(row.state || "") + "|" + tier];
  const stCap = (EST.state_caps || {})[row.state || ""];
  if (stTier && stTier.n >= 2 && stTier.cap) {
    base = Number(stTier.cap);
    reason = stTier.source + (p != null && !isNaN(p) ? " 3-mi pop " + p.toLocaleString("en-US") + "." : "");
    comps = stTier.comps || [];
  } else if (stCap && stCap.n >= 3 && stCap.cap) {
    base = Number(stCap.cap);
    reason = stCap.source + " Used in place of the " + base + "% " + tier + " default because city-tier comps were thin.";
    comps = stCap.comps || [];
  } else if (p == null || isNaN(p)) {
    reason = "3-mi pop unknown — used " + base + "% " + tier + " default" + (stTier && stTier.n ? " (only " + stTier.n + " listed cap in this state/tier)" : "");
    comps = (stTier && stTier.comps) || (stCap && stCap.comps) || [];
  } else {
    const label = tier === "rural" ? "rural/small town" : (tier === "metro" ? "larger metro/suburban" : "small metro/secondary");
    reason = label + " default " + base + "% (3-mi pop " + p.toLocaleString("en-US") + ")" + (stTier && stTier.n ? "; only " + stTier.n + " listed cap in this state/tier, so the default was kept" : "; not enough listed caps in this state/tier");
    comps = (stTier && stTier.comps) || (stCap && stCap.comps) || [];
  }
  const poh = pohShare(row);
  const pohAdj = (poh != null && poh > 0.5) ? 1 : 0;
  const utilAdj = isWellSeptic(row) ? 0.5 : 0;
  return {
    cap: base + pohAdj + utilAdj,
    base, pohAdj, utilAdj, reason, comps, tier,
    pohNote: pohAdj ? ("+1% because POH share is " + Math.round(poh * 100) + "%") : null,
    utilNote: utilAdj ? "+0.5% because utilities are well/septic" : null,
  };
}
function formatCompLine(c, kind) {
  if (!c) return "";
  const where = [c.name, (c.city ? c.city + ", " + (c.state || "") : c.state)].filter(Boolean).join(" — ");
  const fig = kind === "cap"
    ? ((c.cap != null ? c.cap + "%" : "") + " listed cap")
    : (c.rent != null ? ("$" + Math.round(c.rent) + " lot rent") : (c.detail || ""));
  return [where, fig, c.detail].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
}
function statedNoi(row) {
  const facts = listingFacts(row);
  const fromFacts = facts.noi != null ? Number(facts.noi) : null;
  const fromRow = parseMoneyish(row && row.noi);
  if (fromRow != null && fromRow > 0) return { noi: fromRow, detail: "Stated NOI " + money(fromRow), confidence: "high" };
  if (fromFacts != null && fromFacts > 0) return { noi: fromFacts, detail: facts.noi_source || ("Stated NOI " + money(fromFacts) + " (from listing text)"), confidence: "high" };
  return null;
}
function derivedNoi(row) {
  const facts = listingFacts(row);
  if (facts.gross_annual != null && facts.gross_annual > 0) {
    const exp = expenseRatio(row);
    const noi = Number(facts.gross_annual) * (1 - exp.ratio);
    return {
      noi,
      detail: "Stated gross " + money(facts.gross_annual) + " (" + (facts.gross_source || "listing text") + ") × (1 − " + exp.detail + ") = " + money(Math.round(noi)),
      confidence: "medium",
      assumedRent: false,
      assumedOcc: false,
    };
  }
  let occ = occupiedPadsInfo(row);
  let pads = numericPadsField(row);
  let lastResortPads = false;
  if (!occ) {
    const est = padEstimateLastResort(row);
    if (est) {
      pads = est;
      lastResortPads = !!est.lastResort;
      const pct = (EST.defaults && EST.defaults.occupancy_pct) || 85;
      occ = { n: Math.round(est.n * pct / 100), detail: Math.round(est.n * pct / 100) + " occupied (assumed " + pct + "% of " + est.detail + ")", assumed: true };
    }
  }
  const rent = lotRentInfo(row);
  function impliedFromListedCap() {
    const cap = facts.listing_cap != null ? Number(facts.listing_cap) : firstNum(row && row.cap);
    const ask = row && row.price != null && row.price !== "" ? Number(row.price) : null;
    if (cap != null && cap > 0 && ask != null && ask > 0) {
      const noi = ask * (cap / 100);
      return {
        noi,
        detail: "NOI implied from the listing’s " + cap + "% cap × ask " + money(ask) + " = " + money(Math.round(noi)) + (facts.listing_cap_source ? " (" + facts.listing_cap_source + ")" : "") + ". Lot-rent comps were not used as the main income, because this looks POH-heavy or mixed-use.",
        confidence: "low",
        assumedRent: true,
        assumedOcc: true,
        impliedFromCap: true,
      };
    }
    return null;
  }
  const pohHeavy = (pohShare(row) != null && pohShare(row) > 0.5) || !!facts.mixed_use;
  if (pohHeavy && (!rent || rent.assumed)) {
    const implied = impliedFromListedCap();
    if (implied) return implied;
  }
  if (!occ || !rent || occ.n <= 0 || rent.rent <= 0) {
    const implied = impliedFromListedCap();
    if (implied) return implied;
    return null;
  }
  const exp = expenseRatio(row);
  const gi = occ.n * rent.rent * 12;
  const noi = gi * (1 - exp.ratio);
  const assumedRent = !!rent.assumed;
  const assumedOcc = !!occ.assumed;
  let confidence = "medium";
  if (assumedRent || lastResortPads) confidence = "low";
  else if (!assumedOcc && !rent.assumed) confidence = "medium";
  return {
    noi,
    detail: occ.detail + " × " + rent.detail + " × 12 × (1 − " + exp.detail + ") = " + money(Math.round(noi)),
    confidence,
    assumedRent,
    assumedOcc,
    lastResortPads,
    comps: rent.comps || [],
  };
}
function estValueInfo(row) {
  if (!isMhpRow(row)) {
    return {
      value: null, calculatedValue: null, vsAsk: null, color: null, cap: null, capOverride: null,
      purchaseCap: null, insufficient: true, edited: false, confidence: null,
      tooltip: "Estimated value is for mobile home parks only. NNN / retail rows are left blank.",
    };
  }
  const stated = statedNoi(row);
  const derived = stated ? null : derivedNoi(row);
  const noi = stated ? stated.noi : (derived ? derived.noi : null);
  const noiSource = stated ? stated.detail : (derived ? derived.detail : null);
  const confidence = stated ? "high" : (derived ? derived.confidence : null);
  if (noi == null || noi <= 0) {
    return {
      value: null, calculatedValue: null, vsAsk: null, color: null, cap: null, capOverride: null,
      purchaseCap: null, insufficient: true, edited: false, confidence: null,
      tooltip: "Still not enough data to estimate a value (need NOI, lot rent, or pads/price).",
    };
  }
  const mkt = marketCapInfo(row);
  const capOverride = getCapOverride(row);
  const cap = capOverride != null ? capOverride : mkt.cap;
  const calculatedValue = noi / (cap / 100);
  const valueOverride = getValueOverride(row);
  const edited = valueOverride != null || capOverride != null;
  const value = valueOverride != null ? valueOverride : calculatedValue;
  const ask = (row.price == null || row.price === "") ? null : Number(row.price);
  const purchaseCap = (ask != null && ask > 0) ? (noi / ask) * 100 : null;
  let vsAsk = null, color = null;
  if (ask != null && ask > 0) {
    vsAsk = ((value - ask) / ask) * 100;
    if (value >= ask) color = "up";
    else if (ask > value * 1.2) color = "down";
    else color = "mid";
  }
  const lines = [
    "Est. Value = adjusted NOI ÷ market cap rate.",
    "Basis: " + noiSource + ".",
    "Confidence: " + (confidence === "high" ? "High (stated NOI)" : confidence === "medium" ? "Medium (stated rent, occupancy, or gross income)" : "Low (area lot-rent, assumed occupancy, pad estimate, or cap-implied NOI)") + ".",
    capOverride != null
      ? ("Your cap-rate override: " + cap.toFixed(2) + "% (computed market cap was " + mkt.cap.toFixed(2) + "%).")
      : ("Market cap " + cap.toFixed(2) + "% (" + mkt.reason
        + (mkt.pohNote ? "; " + mkt.pohNote : "")
        + (mkt.utilNote ? "; " + mkt.utilNote : "") + ")."),
  ];
  const capComps = (mkt.comps || []).slice(0, 4);
  if (capComps.length) {
    lines.push("Cap comps: " + capComps.map(c => formatCompLine(c, "cap")).join("; ") + ".");
  }
  const rentComps = ((derived && derived.comps) || lotRentInfo(row) && lotRentInfo(row).comps || []).slice(0, 4);
  if (!stated && rentComps.length) {
    lines.push("Rent comps: " + rentComps.map(c => formatCompLine(c, "rent")).join("; ") + ".");
  }
  lines.push("Calculated Est. Value: " + money(Math.round(calculatedValue)) + ".");
  if (valueOverride != null) lines.push("Your value override: " + money(Math.round(valueOverride)) + ".");
  if (purchaseCap != null) lines.push("Purchase cap (adjusted NOI ÷ ask): " + purchaseCap.toFixed(2) + "%.");
  if (ask != null && ask > 0) {
    lines.push("Ask: " + money(ask) + ". Value vs ask: " + (vsAsk >= 0 ? "+" : "") + vsAsk.toFixed(1) + "%.");
    if (color === "down" && !edited) lines.push("Ask is more than 20% above estimated value.");
  } else {
    lines.push("No asking price, so Purchase Cap and Value vs Ask are blank.");
  }
  lines.push("Click the value to type your own dollar estimate, click Market Cap to change the cap rate, or reset to the calculated value.");
  return {
    value, calculatedValue, vsAsk, color, cap, capOverride, valueOverride,
    purchaseCap, noi, noiSource, confidence, edited, insufficient: false,
    tooltip: lines.join("\n"),
  };
}
function promptCap(row) {
  const info = estValueInfo(row);
  const current = info.capOverride != null ? String(info.capOverride) : "";
  const computed = marketCapInfo(row).cap;
  const hint = "Computed market cap is " + computed.toFixed(2) + "%. Enter a cap rate % to override, or leave blank to use the computed cap.";
  const raw = window.prompt(hint, current);
  if (raw == null) return;
  const trimmed = String(raw).trim().replace(/%$/, "");
  if (!trimmed) {
    setCapOverride(row, null);
    render();
    return;
  }
  const n = parseFloat(trimmed);
  if (isNaN(n) || n <= 0 || n >= 40) {
    window.alert("Enter a cap rate between 0 and 40, as a percent (for example 9.5).");
    return;
  }
  setCapOverride(row, Math.round(n * 100) / 100);
  render();
}
function promptValue(row) {
  const info = estValueInfo(row);
  const computed = info.calculatedValue != null ? Math.round(info.calculatedValue) : null;
  const current = info.valueOverride != null ? String(Math.round(info.valueOverride)) : (computed != null ? String(computed) : "");
  const hint = (computed != null ? ("Calculated value is " + money(computed) + ". ") : "") + "Enter your estimated value in dollars, or leave blank to reset to the calculated value.";
  const raw = window.prompt(hint, current);
  if (raw == null) return;
  const trimmed = String(raw).trim().replace(/[$,]/g, "");
  if (!trimmed) {
    setValueOverride(row, null);
    render();
    return;
  }
  const n = parseFloat(trimmed);
  if (isNaN(n) || n <= 0) {
    window.alert("Enter a positive dollar amount (for example 725000).");
    return;
  }
  setValueOverride(row, Math.round(n));
  render();
}
function vsAskLabel(info) {
  if (info.insufficient || info.vsAsk == null) return "—";
  const n = info.vsAsk;
  const sign = n > 0 ? "+" : "";
  return sign + (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1)) + "%";
}
function pctLabel(n, digits) {
  if (n == null || isNaN(n)) return "—";
  const d = digits == null ? 1 : digits;
  return n.toFixed(d) + "%";
}
function confDot(conf) {
  if (!conf) return "";
  const label = conf === "high" ? "High confidence (stated NOI)" : conf === "medium" ? "Medium confidence (stated rent or income)" : "Low confidence (assumed rent, occupancy, or pads)";
  return `<span class="conf-dot conf-${conf}" title="${esc(label)}"></span>`;
}
function editedClass(info) { return info && info.edited ? " est-edited" : ""; }

function enrichFromSaved() {
  const byId = {};
  (DATA.saved || []).forEach(s => { if (s && s.id != null) byId[String(s.id)] = s; });
  (DATA.listings || []).forEach(r => {
    const s = byId[String(r.id)];
    if (!s) return;
    ["noi", "acres", "cap", "thumbnail", "utilities", "sf_terms"].forEach(k => {
      if ((r[k] == null || r[k] === "" || String(r[k]).toLowerCase() === "n/a") && s[k]) r[k] = s[k];
    });
    if ((r.pads == null || r.pads === "" || String(r.pads).toLowerCase().startsWith("n/a")) && s.pads && !String(s.pads).toLowerCase().startsWith("n/a")) r.pads = s.pads;
    if ((r.occupancy == null || r.occupancy === "" || String(r.occupancy).toLowerCase().startsWith("n/a")) && s.occupancy && !String(s.occupancy).toLowerCase().startsWith("n/a")) r.occupancy = s.occupancy;
    if (typeof r.toh !== "number" && typeof s.toh === "number") r.toh = s.toh;
    if (typeof r.poh !== "number" && typeof s.poh === "number") r.poh = s.poh;
  });
}

function showToast(msg, undoFn) {
  const el = document.getElementById("toast");
  const msgEl = document.getElementById("toastMsg");
  const undo = document.getElementById("toastUndo");
  if (!el || !msgEl || !undo) return;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  msgEl.textContent = msg;
  el.hidden = false;
  undo.onclick = ev => {
    ev.preventDefault();
    el.hidden = true;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (undoFn) undoFn();
  };
  toastTimer = setTimeout(() => {
    el.hidden = true;
    toastTimer = null;
  }, 6000);
}

function deleteRows(rows) {
  const list = (rows || []).filter(r => r && !isDeleted(r));
  if (!list.length) return;
  const batch = markDeleted(list);
  lastDeleted = batch;
  const names = list.map(r => r.name).filter(Boolean);
  const msg = list.length === 1
    ? ("Deleted " + (names[0] || "listing"))
    : ("Deleted " + list.length + " listings");
  showToast(msg, () => {
    unmarkDeleted(batch);
    render();
    renderCounts();
  });
  render();
  renderCounts();
}
function restoreRows(rows) {
  const batch = (rows || []).map(r => ({
    keys: [listingKey(r), r.url].filter(Boolean).map(String),
    name: r.name,
  }));
  unmarkDeleted(batch);
  render();
  renderCounts();
}

function popFmt(n) { return n == null ? "n/a" : Number(n).toLocaleString("en-US"); }
function dash(s) { return s && String(s).trim() && String(s).toLowerCase() !== "n/a" ? s : "n/a"; }
function countFmt(v) { return v == null || v === "" ? "n/a" : String(v); }
function firstNum(s) {
  if (s == null || s === "") return null;
  if (typeof s === "number" && !isNaN(s)) return s;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function defaultCols() {
  if (tab === "missing_info") return MISS_COLS.slice();
  if (tab === "crexi_saved") return SAVED_COLS.slice();
  return MAIN_COLS.slice();
}
function orderKey() {
  if (tab === "missing_info") return "miss";
  if (tab === "crexi_saved") return "saved";
  return "main";
}

function mergeColOrder(defaults, saved) {
  if (!Array.isArray(saved) || !saved.length) return defaults.slice();
  const defSet = new Set(defaults);
  const cols = saved.filter(k => defSet.has(k));
  for (let i = 0; i < defaults.length; i++) {
    const k = defaults[i];
    if (cols.includes(k)) continue;
    let ins = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = cols.indexOf(defaults[j]);
      if (idx >= 0) { ins = idx + 1; break; }
    }
    cols.splice(ins, 0, k);
  }
  return cols;
}

function currentCols() {
  const defs = defaultCols();
  return mergeColOrder(defs, colOrder[orderKey()]);
}

function persistColOrder(cols) {
  colOrder[orderKey()] = cols.slice();
  saveJSON(LS.colOrder, colOrder);
}

function tabListings(list) {
  if (tab === "seller_financing") return list.filter(x => x.group === "seller_financing");
  if (tab === "other_passes") return list.filter(x => x.group === "other_passes");
  if (tab === "missing_info") return list.filter(x => x.group === "missing_info");
  return list.filter(x => x.group !== "missing_info");
}

function activeUniverse() {
  return tab === "crexi_saved" ? (DATA.saved || []) : DATA.listings;
}

function savedGroupValue() {
  const el = document.getElementById("savedGroup");
  return el ? el.value : "MHP";
}

function filtered() {
  const q = (document.getElementById("q").value || "").trim().toLowerCase();
  const st = document.getElementById("state").value;
  const pmin = firstNum(document.getElementById("pmin").value);
  const pmax = firstNum(document.getElementById("pmax").value);
  const onlyNew = document.getElementById("onlyNew").checked;
  let list;
  if (tab === "crexi_saved") {
    list = (DATA.saved || []).slice();
    const g = savedGroupValue();
    if (g) list = list.filter(x => x.saved_group === g);
  } else {
    list = tabListings(DATA.listings.slice());
    if (onlyNew) list = list.filter(x => x.is_new);
  }
  if (st) list = list.filter(x => x.state === st);
  if (pmin != null) list = list.filter(x => x.price != null && x.price >= pmin);
  if (pmax != null) list = list.filter(x => x.price != null && x.price <= pmax);
  if (showDeleted) list = list.filter(isDeleted);
  else list = list.filter(x => !isDeleted(x));
  if (q) {
    list = list.filter(x => {
      const blob = [x.name, x.city, x.state, x.note, getNotes(x), x.sf_terms, x.broker_name, x.brokerage, x.utilities, x.property_type, x.saved_group, (x.missing_fields||[]).join(" "), x.toh, x.poh].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  return sortList(list);
}

/* ---------- Deal score ---------- */

function factorUtilities(row) {
  const u = (row.utilities || "").trim();
  const l = u.toLowerCase();
  if (!l || l === "n/a" || /^n\/a\s*\(/.test(l) || /source not stated/.test(l) || /type not stated/.test(l) || /central utilities/.test(l)) {
    return null;
  }
  const privateWater = /\bwell\b|private well/.test(l);
  const privateSewer = /septic/.test(l);
  const sewerMissing = /sewer not stated/.test(l);
  const both = /city water\s*[&/]\s*(city\s*)?sewer|municipal water\s*[&/]\s*sewer|public water\s*[&/]\s*sewer|all public utilities|all municipal utilities|city utilities|all public water\s*[&/]\s*sewer|city of .+\s*\+\s*.*sewer|city water\s*\/\s*sewer/.test(l);
  const water = /city water|municipal water|public water|county water|all public|all municipal|city utilities|city\/county water|city of /.test(l);
  const sewer = /city sewer|municipal.*sewer|public sewer|county sewer|& sewer|and sewer|all public|all municipal|city utilities/.test(l);
  if (privateWater && privateSewer) {
    return { points: 2, detail: "Well and/or septic (not city services): " + u };
  }
  if (privateWater || privateSewer) {
    return { points: 6, detail: "Mixed city and private utilities: " + u };
  }
  if (both || (water && sewer && !sewerMissing)) {
    return { points: 10, detail: "City/public water and sewer" };
  }
  if (water && sewerMissing) {
    return { points: 6, detail: "City/public water; sewer not stated" };
  }
  if (water || sewer) {
    return { points: 6, detail: u };
  }
  return { points: 2, detail: "Stated, but not clearly city services: " + u };
}

function factorOccupancy(row) {
  const n = firstNum(row.occupancy);
  if (n == null) return null;
  const pct = n > 1.5 ? n : n * 100;
  let band;
  if (pct >= 85) band = "≥85%";
  else if (pct >= 80) band = "80–85%";
  else if (pct >= 70) band = "70–80%";
  else band = "<70%";
  const points = pct >= 85 ? 10 : pct >= 80 ? 7 : pct >= 70 ? 4 : 1;
  const raw = dash(row.occupancy);
  const detail = (raw && raw !== "n/a" && raw !== String(pct) && raw !== pct + "%") ? raw + " (" + band + ")" : pct + "% (" + band + ")";
  return { points, detail };
}

function factorPop3(row) {
  const n = row.pop3;
  if (n == null || n === "") return null;
  const p = Number(n);
  if (isNaN(p)) return null;
  const label = p.toLocaleString("en-US") + " within 3 mi";
  if (p >= 15000) return { points: 10, detail: label };
  if (p >= 8000) return { points: 8, detail: label };
  if (p >= 5000) return { points: 6, detail: label + " (borderline)" };
  if (p >= 3000) return { points: 3, detail: label + " (isolated)" };
  return { points: 1, detail: label + " (isolated)" };
}

function factorSf(row) {
  const terms = (row.sf_terms || "").trim();
  const l = terms.toLowerCase();
  // A blank / "not mentioned" field is not stated — it is not a "no".
  if (!terms || /^not mentioned$/i.test(terms) || /^n\/a$/i.test(terms)) {
    return { points: 4, detail: "Not mentioned (neutral — not a no)" };
  }
  if (/^no\b/.test(l) || /not offered/.test(l) || /not open to seller financing/.test(l) || /will not be considered/.test(l)) {
    return { points: 1, detail: "Seller financing not offered" };
  }
  // "Yes, owner financing considered" is a plus, but weaker than firm terms.
  if (/consider/.test(l)) {
    return { points: 7, detail: "Seller may consider financing: " + terms };
  }
  if (row.sf === "A" || /^yes\b/.test(l) || /seller financing|owner financing|seller carries|seller finance/.test(l)) {
    return { points: 10, detail: terms || "Seller financing offered" };
  }
  return { points: 4, detail: terms };
}

function factorTohShare(row) {
  const toh = row.toh;
  const poh = row.poh;
  if (typeof toh !== "number" || typeof poh !== "number") return null;
  const homes = toh + poh;
  if (homes <= 0) return null;
  const pct = (toh / homes) * 100;
  const detail = toh + " TOH / " + homes + " known homes (" + Math.round(pct) + "%)";
  if (pct >= 80) return { points: 10, detail };
  if (pct >= 50) return { points: 7, detail };
  if (pct >= 20) return { points: 4, detail };
  return { points: 2, detail };
}

function factorCap(row) {
  const n = firstNum(row.cap);
  if (n == null) return null;
  const detail = n + "% cap";
  if (n >= 10) return { points: 10, detail };
  if (n >= 8) return { points: 7, detail };
  if (n >= 6) return { points: 4, detail };
  return { points: 2, detail };
}

function factorPpl(row) {
  const price = row.price;
  const pads = firstNum(row.pads);
  if (price == null || price === "" || pads == null || pads <= 0) return null;
  const ppl = price / pads;
  const label = "$" + Math.round(ppl).toLocaleString("en-US") + "/pad";
  if (ppl <= 40000) return { points: 10, detail: label };
  if (ppl <= 60000) return { points: 7, detail: label };
  if (ppl <= 80000) return { points: 4, detail: label };
  return { points: 2, detail: label };
}

function isMhpScoreRow(row) {
  if (row.saved_group && row.saved_group !== "MHP") return false;
  return true;
}

function scoreInfo(row) {
  if (!isMhpScoreRow(row)) {
    const override = getScoreOverride(row.id);
    return {
      factors: [{ key: "mhp", label: "MHP score", weight: 0, points: null, detail: "This 1–10 score is designed for mobile home parks. Set your own rating for NNN / retail." }],
      used: 0,
      total: 0,
      computed: null,
      override,
      value: override != null ? override : null,
    };
  }
  const factors = [
    { key: "utilities", label: "City services", weight: SCORE_WEIGHTS.utilities, ...((factorUtilities(row) || { points: null, detail: "Not stated — skipped" })) },
    { key: "occupancy", label: "Occupancy", weight: SCORE_WEIGHTS.occupancy, ...((factorOccupancy(row) || { points: null, detail: "Not stated — skipped" })) },
    { key: "tohShare", label: "TOH share", weight: SCORE_WEIGHTS.tohShare, ...((factorTohShare(row) || { points: null, detail: "Need both TOH and POH — skipped" })) },
    { key: "pop3", label: "3-mi population", weight: SCORE_WEIGHTS.pop3, ...((factorPop3(row) || { points: null, detail: "Not stated — skipped" })) },
    { key: "cap", label: "Cap rate", weight: SCORE_WEIGHTS.cap, ...((factorCap(row) || { points: null, detail: "Not stated — skipped" })) },
    { key: "sf", label: "Seller financing", weight: SCORE_WEIGHTS.sf, ...((factorSf(row) || { points: null, detail: "Not stated — skipped" })) },
    { key: "ppl", label: "Price per pad", weight: SCORE_WEIGHTS.ppl, ...((factorPpl(row) || { points: null, detail: "Need price and pads — skipped" })) },
  ];
  // The spread above may overwrite weight if factor returns weight — it doesn't.
  const used = factors.filter(f => f.points != null);
  const tw = used.reduce((s, f) => s + f.weight, 0);
  let computed = null;
  if (tw) {
    const raw = used.reduce((s, f) => s + f.points * f.weight, 0) / tw;
    computed = Math.min(10, Math.max(1, Math.round(raw * 10) / 10));
  }
  const override = getScoreOverride(row.id);
  const flags = Array.isArray(row.score_flags) ? row.score_flags : [];
  return { factors, used: used.length, total: factors.length, computed, override, flags, value: override != null ? override : computed };
}

function scoreColor(v) {
  if (v == null) return "none";
  if (v >= 7.5) return "green";
  if (v >= 5) return "yellow";
  return "red";
}

function scoreTooltip(info) {
  const lines = ["Deal score 1–10 (available factors only; weights renormalized)."];
  (info.flags || []).forEach(f => lines.push("Note: " + f));
  info.factors.forEach(f => {
    const pts = f.points == null ? "skipped" : (f.points + "/10");
    lines.push(f.label + " (wt " + f.weight + "): " + pts + " — " + f.detail);
  });
  lines.push("Computed from " + info.used + " of " + info.total + " factors: " + (info.computed != null ? info.computed : "n/a"));
  if (info.override != null) lines.push("Your override: " + info.override);
  lines.push("Click the score to set or clear your own 1–10 rating.");
  return lines.join("\n");
}

function promptScore(row) {
  const info = scoreInfo(row);
  const current = info.override != null ? String(info.override) : "";
  const hint = info.computed != null ? `Computed score is ${info.computed}. Enter a number 1–10, or leave blank to use the computed score.` : "No computed score (too little data). Enter a number 1–10, or leave blank.";
  const raw = window.prompt(hint, current);
  if (raw == null) return;
  const trimmed = String(raw).trim();
  if (!trimmed) {
    setScoreOverride(row.id, null);
    render();
    return;
  }
  const n = parseFloat(trimmed);
  if (isNaN(n) || n < 1 || n > 10) {
    window.alert("Score must be a number from 1 to 10.");
    return;
  }
  setScoreOverride(row.id, Math.round(n * 10) / 10);
  render();
}

function scoreBadgeHTML(row, extraClass) {
  const info = scoreInfo(row);
  const v = info.value;
  const color = scoreColor(v);
  const label = v == null ? "—" : (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const ov = info.override != null ? " overridden" : "";
  return `<button type="button" class="score-badge score-${color}${ov} ${extraClass || ""}" data-score-edit="${row.id}" title="${esc(scoreTooltip(info))}" onclick="event.stopPropagation()">${esc(label)}</button>`;
}

function sortValue(row, key) {
  if (key === "status") return getStatus(row.id) || "";
  if (key === "chase") return getChase(row.id) || "";
  if (key === "missing") return (row.missing_fields || []).length;
  if (key === "broker") return (row.broker_name || row.brokerage || "").toLowerCase();
  if (key === "phone") return row.broker_phone || "";
  if (key === "email") return row.broker_email || "";
  if (key === "is_new") return row.is_new ? 1 : 0;
  if (key === "score") return scoreInfo(row).value;
  if (key === "toh" || key === "poh") return typeof row[key] === "number" ? row[key] : null;
  if (key === "pads" || key === "cap" || key === "occupancy") return firstNum(row[key === "pads" ? "pads" : key === "cap" ? "cap" : "occupancy"]);
  if (key === "price" || key === "pop3") return row[key];
  if (key === "est_value") {
    const info = estValueInfo(row);
    return info.value;
  }
  if (key === "purchase_cap") {
    const info = estValueInfo(row);
    return info.purchaseCap;
  }
  if (key === "market_cap") {
    const info = estValueInfo(row);
    return info.cap;
  }
  if (key === "vs_ask") {
    const info = estValueInfo(row);
    return info.vsAsk;
  }
  if (key === "mynotes") return (getNotes(row) || "").toLowerCase();
  if (key === "noi") {
    const fromRow = parseMoneyish(row.noi);
    if (fromRow != null) return fromRow;
    const ev = estValueInfo(row);
    return ev && ev.noi != null ? ev.noi : null;
  }
  if (key === "ppl") {
    const price = row.price;
    const pads = firstNum(row.pads);
    if (price == null || price === "" || pads == null || pads <= 0) return null;
    return price / pads;
  }
  if (key === "acres") return firstNum(row.acres);
  if (key === "added") {
    const n = Number(row.id);
    return isNaN(n) ? null : n;
  }
  const v = row[key];
  return v == null ? "" : String(v).toLowerCase();
}

function cmp(a, b, key, dir) {
  let va = sortValue(a, key), vb = sortValue(b, key);
  const aNull = va == null || va === "";
  const bNull = vb == null || vb === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  let c;
  if (typeof va === "number" && typeof vb === "number") c = va - vb;
  else c = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
  return dir === "desc" ? -c : c;
}

function sortList(list) {
  const keys = sorts.length ? sorts : [{ key: "price", dir: "desc" }];
  return list.slice().sort((a, b) => {
    for (const s of keys) {
      const c = cmp(a, b, s.key, s.dir);
      if (c) return c;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

function onHeaderClick(key) {
  if (SKIP_SORT[key]) return;
  if (sortMode === "single") {
    if (sorts.length === 1 && sorts[0].key === key) {
      sorts[0].dir = sorts[0].dir === "asc" ? "desc" : "asc";
    } else {
      sorts = [{ key, dir: defaultDir(key) }];
    }
  } else {
    const i = sorts.findIndex(s => s.key === key);
    if (i >= 0) sorts[i].dir = sorts[i].dir === "asc" ? "desc" : "asc";
    else sorts.push({ key, dir: defaultDir(key) });
  }
  saveJSON(LS.sorts, sorts);
  render();
}

function defaultDir(key) {
  return (key === "price" || key === "cap" || key === "occupancy" || key === "pop3" || key === "is_new" || key === "score" || key === "toh" || key === "poh" || key === "est_value" || key === "vs_ask" || key === "purchase_cap" || key === "market_cap" || key === "noi" || key === "ppl" || key === "acres" || key === "added") ? "desc" : "asc";
}
function clearSorts() { sorts = []; saveJSON(LS.sorts, sorts); render(); }
function setSortMode(mode) {
  sortMode = mode;
  saveJSON(LS.mode, mode);
  if (mode === "single" && sorts.length > 1) {
    sorts = [sorts[0]];
    saveJSON(LS.sorts, sorts);
  }
  render();
}

function headerIndicator(key) {
  const i = sorts.findIndex(s => s.key === key);
  if (i < 0) return "";
  const arrow = sorts[i].dir === "asc" ? "▲" : "▼";
  return `<span class="ind">${i + 1}${arrow}</span>`;
}

function statusSelect(id, kind) {
  if (kind === "chase") {
    const cur = getChase(id);
    const opts = CHASE_STATUS.map(s => `<option${s===cur?" selected":""}>${s}</option>`).join("");
    return `<select data-chase="${id}" onclick="event.stopPropagation()">${opts}</select>`;
  }
  const cur = getStatus(id);
  const opts = MAIN_STATUS.map(s => `<option value="${esc(s)}"${s===cur?" selected":""}>${s || "—"}</option>`).join("");
  return `<select data-status="${id}" onclick="event.stopPropagation()">${opts}</select>`;
}

function pills(row) {
  if (row.saved_group) {
    const g = GROUPS[row.group];
    let h = `<span class="pill saved">Saved</span>`;
    if (g) h += `<span class="pill ${g.pill}">${esc(row.saved_group)}</span>`;
    return h;
  }
  const g = GROUPS[row.group];
  let h = `<span class="pill ${row.is_new ? "new" : "seen"}">${row.is_new ? "New" : "Previously seen"}</span>`;
  if (g) h += `<span class="pill ${g.pill}">${esc(g.short)}</span>`;
  return h;
}

function cardPhoto(row) {
  const src = row.thumbnail || "";
  const ph = `<div class="card-ph">${esc(row.name)}</div>`;
  if (!src) return ph;
  return `<img class="card-img" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">${ph}`;
}

function cardHTML(row) {
  const miss = (row.missing_fields || []).map(esc).join(", ");
  const brokerBits = [];
  if (row.broker_name) brokerBits.push(esc(row.broker_name));
  if (row.brokerage) brokerBits.push(esc(row.brokerage));
  const contact = [];
  if (row.broker_phone) contact.push(esc(row.broker_phone));
  if (row.broker_email) contact.push(`<a href="mailto:${esc(row.broker_email)}" onclick="event.stopPropagation()">${esc(row.broker_email)}</a>`);
  const facts = [
    `${dash(row.pads)} pads`,
    `TOH ${countFmt(row.toh)}`,
    `POH ${countFmt(row.poh)}`,
  ];
  if (dash(row.cap) !== "n/a") facts.push(`${dash(row.cap)} cap`);
  if (dash(row.occupancy) !== "n/a") facts.push(`${dash(row.occupancy)} occ`);
  if (row.noi) facts.push("NOI " + row.noi);
  if (row.acres) facts.push(row.acres + " ac");
  const flagLines = (row.score_flags || []).map(f => `<div class="flag-line">${esc(f)}</div>`).join("");
  const ev = estValueInfo(row);
  const vsCls = ev.insufficient ? "" : ("vs-ask pct " + (ev.edited ? "edited" : (ev.color || "")));
  const estCls = ev.insufficient ? "est-bit" : ("est-bit vs-ask " + (ev.edited ? "edited" : (ev.color || "")));
  const askLabel = moneyCompact(row.price);
  let compare;
  if (ev.insufficient) {
    compare = `<div class="price-compare"><span class="ask">${esc(askLabel)}</span></div>`;
  } else {
    const pct = ev.vsAsk == null ? "" : ` <span class="${vsCls}">· ${esc(vsAskLabel(ev))}</span>`;
    compare = `<div class="price-compare" title="${esc(ev.tooltip)}"><span class="ask">${esc(askLabel)}</span><span class="sep">/</span><button type="button" class="${estCls}" data-value-edit="${esc(listingKey(row))}" onclick="event.stopPropagation()">Est. ${esc(moneyCompact(ev.value))}</button>${pct}</div>`;
  }
  const resetBtn = ev.edited ? ` <button type="button" class="reset-est" data-est-reset="${esc(listingKey(row))}" title="Reset to calculated value" onclick="event.stopPropagation()">Reset</button>` : "";
  const editedMark = ev.edited ? ` <span class="edited-mark">edited</span>` : "";
  const estLine = ev.insufficient
    ? `<div class="est-line" title="${esc(ev.tooltip)}">Est. value —</div>`
    : `<div class="est-line${editedClass(ev)}">${confDot(ev.confidence)}<button type="button" class="est-val" data-value-edit="${esc(listingKey(row))}" title="${esc(ev.tooltip)}" onclick="event.stopPropagation()">Est. ${esc(money(Math.round(ev.value)))}</button>${editedMark}<span class="est-cap">Purchase ${esc(pctLabel(ev.purchaseCap))}</span><button type="button" class="est-cap-btn" data-cap-edit="${esc(listingKey(row))}" title="${esc(ev.tooltip)}" onclick="event.stopPropagation()">Mkt ${esc(pctLabel(ev.cap))}</button>${resetBtn}</div>`;
  const deleted = isDeleted(row);
  const delBtn = deleted
    ? `<button type="button" class="icon-btn restore card-delete" data-restore="${esc(listingKey(row))}" title="Restore listing" onclick="event.stopPropagation()">Restore</button>`
    : `<button type="button" class="icon-btn card-delete" data-delete="${esc(listingKey(row))}" title="Delete listing" onclick="event.stopPropagation()" aria-label="Delete">×</button>`;
  const checked = selectedKeys.has(listingKey(row)) ? " checked" : "";
  return `<article class="card g-${row.group}${selectedId==row.id?" selected":""}${deleted?" deleted":""}" data-id="${row.id}">
    <div class="card-media">
      ${cardPhoto(row)}
      ${scoreBadgeHTML(row, "on-photo")}
      ${delBtn}
      <div class="card-media-pills">${pills(row)}</div>
    </div>
    <div class="card-body">
      <div class="price-row">${compare}</div>
      <h3><a href="${esc(row.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(row.name)}</a></h3>
      <div class="meta">${esc(row.city)}, ${esc(row.state)}${row.address ? " · " + esc(row.address) : ""}</div>
      <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join("")}</div>
      ${estLine}
      ${row.sf_terms ? `<div class="sf-line"><strong>Seller financing:</strong> ${esc(row.sf_terms)}</div>` : ""}
      ${row.group === "missing_info" && miss ? `<div class="missing-line"><strong>Missing:</strong> ${miss}</div>` : ""}
      ${brokerBits.length || contact.length ? `<div class="broker"><strong>Broker:</strong> ${brokerBits.join(" — ") || "n/a"}${contact.length ? " · " + contact.join(" · ") : " · contact n/a on the public listing"}</div>` : (row.group==="missing_info" ? `<div class="broker"><strong>Broker:</strong> n/a on the public listing</div>` : "")}
      ${row.note ? `<div class="note">${esc(row.note)}</div>` : ""}
      ${flagLines}
      <div class="card-notes"><textarea class="my-notes" data-notes="${esc(listingKey(row))}" rows="2" placeholder="Your notes…" onclick="event.stopPropagation()">${esc(getNotes(row))}</textarea></div>
      <div class="row-status"><label class="chk" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-select="${esc(listingKey(row))}"${checked}> Select</label>${row.group==="missing_info" ? statusSelect(row.id,"chase") : statusSelect(row.id,"status")}</div>
    </div>
  </article>`;
}

function tableHTML(rows) {
  const cols = currentCols();
  const allSelected = rows.length && rows.every(r => selectedKeys.has(listingKey(r)));
  const head = cols.map(k => {
    const w = colWidths[k];
    const style = w ? ` style="width:${w}px"` : "";
    let label;
    if (k === "sel") {
      label = `<input type="checkbox" class="row-check" id="selectAll"${allSelected ? " checked" : ""} title="Select all visible">`;
    } else {
      label = `${esc(COLS[k].label)}${headerIndicator(k)}`;
    }
    return `<th data-key="${k}"${style}><span class="th-label">${label}</span><span class="col-resizer" data-resize="${k}"></span></th>`;
  }).join("");
  const body = rows.map(row => {
    const cells = cols.map(k => {
      const cls = (k === "sel") ? ' class="sel-cell"' : (k === "act" ? ' class="act-cell"' : "");
      return `<td${cls}>${cellHTML(row, k)}</td>`;
    }).join("");
    const deleted = isDeleted(row) ? " deleted" : "";
    return `<tr class="tr g-${row.group}${selectedId==row.id?" selected":""}${deleted}" data-id="${row.id}">${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function cellHTML(row, k) {
  if (k === "status") return statusSelect(row.id, "status");
  if (k === "chase") return statusSelect(row.id, "chase");
  if (k === "name") return `<div class="name"><a href="${esc(row.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(row.name)}</a></div>`;
  if (k === "price") return `<span class="p">${money(row.price)}</span>`;
  if (k === "pop3") return popFmt(row.pop3);
  if (k === "is_new") return row.is_new ? "New" : "Seen";
  if (k === "missing") return (row.missing_fields || []).length ? esc((row.missing_fields || []).join(", ")) : "—";
  if (k === "broker") return esc([row.broker_name, row.brokerage].filter(Boolean).join(" — ") || "n/a");
  if (k === "phone") return esc(row.broker_phone || "n/a");
  if (k === "email") return row.broker_email ? `<a href="mailto:${esc(row.broker_email)}" onclick="event.stopPropagation()">${esc(row.broker_email)}</a>` : "n/a";
  if (k === "pads") return esc(dash(row.pads));
  if (k === "toh" || k === "poh") return esc(countFmt(row[k]));
  if (k === "score") return scoreBadgeHTML(row, "in-table");
  if (k === "cap") return esc(dash(row.cap));
  if (k === "occupancy") return esc(dash(row.occupancy));
  if (k === "utilities") return esc(dash(row.utilities));
  if (k === "sf_terms") return esc(row.sf_terms || "n/a");
  if (k === "note") return esc(row.note || "");
  if (k === "city") return esc(row.city || "");
  if (k === "state") return esc(row.state || "");
  if (k === "type") return esc(row.property_type || row.type || "");
  if (k === "est_value") {
    const ev = estValueInfo(row);
    if (ev.insufficient) return `<span title="${esc(ev.tooltip)}">—</span>`;
    const reset = ev.edited ? ` <button type="button" class="reset-est" data-est-reset="${esc(listingKey(row))}" title="Reset to calculated value" onclick="event.stopPropagation()">Reset</button>` : "";
    const mark = ev.edited ? ` <span class="edited-mark">edited</span>` : "";
    return `<div class="est-cell${editedClass(ev)}">${confDot(ev.confidence)}<button type="button" class="est-btn" data-value-edit="${esc(listingKey(row))}" title="${esc(ev.tooltip)}" onclick="event.stopPropagation()">${esc(money(Math.round(ev.value)))}</button>${mark}${reset}</div>`;
  }
  if (k === "purchase_cap") {
    const ev = estValueInfo(row);
    if (ev.insufficient || ev.purchaseCap == null) return `<span title="${esc(ev.tooltip)}">—</span>`;
    return `<span class="${ev.edited ? "est-edited" : ""}" title="${esc("Purchase cap = adjusted NOI ÷ asking price. " + ev.tooltip)}">${esc(pctLabel(ev.purchaseCap, 2))}</span>`;
  }
  if (k === "market_cap") {
    const ev = estValueInfo(row);
    if (ev.insufficient || ev.cap == null) return `<span title="${esc(ev.tooltip)}">—</span>`;
    return `<button type="button" class="est-cap-btn${ev.capOverride != null ? " est-edited" : ""}" data-cap-edit="${esc(listingKey(row))}" title="${esc(ev.tooltip)}" onclick="event.stopPropagation()">${esc(pctLabel(ev.cap, 2))}</button>`;
  }
  if (k === "vs_ask") {
    const ev = estValueInfo(row);
    if (ev.insufficient || ev.vsAsk == null) return `<span title="${esc(ev.tooltip)}">—</span>`;
    const cls = ev.edited ? "vs-ask edited" : ("vs-ask " + (ev.color || ""));
    return `<span class="${cls}" title="${esc(ev.tooltip)}">${esc(vsAskLabel(ev))}</span>`;
  }
  if (k === "mynotes") {
    return `<textarea class="my-notes" data-notes="${esc(listingKey(row))}" rows="2" placeholder="Your notes…" onclick="event.stopPropagation()">${esc(getNotes(row))}</textarea>`;
  }
  if (k === "sel") {
    const checked = selectedKeys.has(listingKey(row)) ? " checked" : "";
    return `<input type="checkbox" class="row-check" data-select="${esc(listingKey(row))}"${checked} onclick="event.stopPropagation()">`;
  }
  if (k === "act") {
    if (isDeleted(row)) {
      return `<button type="button" class="icon-btn restore" data-restore="${esc(listingKey(row))}" title="Restore listing" onclick="event.stopPropagation()">Restore</button>`;
    }
    return `<button type="button" class="icon-btn" data-delete="${esc(listingKey(row))}" title="Delete listing" onclick="event.stopPropagation()" aria-label="Delete">×</button>`;
  }
  return esc(row[k] ?? "");
}

function popupHTML(row) {
  const info = scoreInfo(row);
  const score = info.value == null ? "n/a" : info.value;
  const miss = (row.missing_fields || []).length ? `<div class="missing-line"><strong>Missing:</strong> ${esc(row.missing_fields.join(", "))}</div>` : "";
  return `<div class="popup">
    <div class="p">${money(row.price)}</div>
    <div class="n">${esc(row.name)}</div>
    <div class="meta">${esc(row.city)}, ${esc(row.state)}</div>
    <div class="facts"><span>${dash(row.pads)} pads</span><span>TOH ${countFmt(row.toh)}</span><span>POH ${countFmt(row.poh)}</span><span>Score ${esc(score)}</span>${estValueInfo(row).value!=null?`<span>Est. ${esc(money(Math.round(estValueInfo(row).value)))}</span>`:""}</div>
    ${miss}
    <div style="margin-top:6px"><a href="${esc(row.url)}" target="_blank" rel="noopener">Open on Crexi</a></div>
  </div>`;
}

function bindListEvents(root) {
  root.querySelectorAll("[data-id]").forEach(el => {
    el.addEventListener("click", ev => {
      if (ev.target.closest("a, button, select, textarea, input, label, .my-notes, .icon-btn")) return;
      selectListing(+el.dataset.id, true);
    });
  });
  root.querySelectorAll("select[data-status]").forEach(s => {
    s.addEventListener("change", () => { setStatus(+s.dataset.status, s.value); });
  });
  root.querySelectorAll("select[data-chase]").forEach(s => {
    s.addEventListener("change", () => { setChase(+s.dataset.chase, s.value); });
  });
  root.querySelectorAll("[data-score-edit]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.scoreEdit);
      if (row) promptScore(row);
    });
  });
  root.querySelectorAll("[data-cap-edit]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.capEdit);
      if (row) promptCap(row);
    });
  });
  root.querySelectorAll("[data-value-edit]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.valueEdit);
      if (row) promptValue(row);
    });
  });
  root.querySelectorAll("[data-est-reset]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.estReset);
      if (row) { clearEstOverrides(row); render(); }
    });
  });
  root.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.delete);
      if (row) deleteRows([row]);
    });
  });
  root.querySelectorAll("[data-restore]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = findRow(btn.dataset.restore);
      if (row) restoreRows([row]);
    });
  });
  root.querySelectorAll("[data-select]").forEach(box => {
    box.addEventListener("click", ev => ev.stopPropagation());
    box.addEventListener("change", ev => {
      ev.stopPropagation();
      const key = box.dataset.select;
      if (box.checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
      renderToolbarState();
    });
  });
  const selectAll = root.querySelector("#selectAll");
  if (selectAll) {
    selectAll.addEventListener("click", ev => ev.stopPropagation());
    selectAll.addEventListener("change", ev => {
      ev.stopPropagation();
      const rows = filtered();
      if (selectAll.checked) rows.forEach(r => selectedKeys.add(listingKey(r)));
      else rows.forEach(r => selectedKeys.delete(listingKey(r)));
      render();
    });
  }
  root.querySelectorAll("[data-notes]").forEach(ta => {
    ta.addEventListener("click", ev => ev.stopPropagation());
    ta.addEventListener("pointerdown", ev => ev.stopPropagation());
    ta.addEventListener("input", () => {
      const row = findRow(ta.dataset.notes);
      if (row) setNotes(row, ta.value);
    });
  });
  root.querySelectorAll(".card-img").forEach(img => {
    img.addEventListener("error", () => {
      img.style.display = "none";
      const media = img.closest(".card-media");
      if (media) media.classList.add("no-photo");
    });
    img.addEventListener("load", () => {
      const media = img.closest(".card-media");
      if (media) media.classList.add("has-photo");
    });
  });
  bindTableChrome(root);
}

function bindTableChrome(root) {
  const table = root.querySelector("table.grid");
  if (!table) return;
  table.querySelectorAll("th[data-key]").forEach(th => {
    const key = th.dataset.key;
    th.addEventListener("pointerdown", ev => {
      if (ev.target.closest(".col-resizer, input, button, textarea, a")) return;
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      let dragging = false;
      const ghostKeys = currentCols();
      const onMove = e => {
        if (!dragging && Math.abs(e.clientX - startX) > 6) {
          dragging = true;
          th.classList.add("dragging");
        }
        if (!dragging) return;
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest("th[data-key]");
        table.querySelectorAll("th.drop-target").forEach(x => x.classList.remove("drop-target"));
        if (target && target !== th) target.classList.add("drop-target");
      };
      const onUp = e => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        th.classList.remove("dragging");
        const target = table.querySelector("th.drop-target");
        table.querySelectorAll("th.drop-target").forEach(x => x.classList.remove("drop-target"));
        if (dragging && target && target.dataset.key && target.dataset.key !== key) {
          const cols = ghostKeys.slice();
          const from = cols.indexOf(key);
          const to = cols.indexOf(target.dataset.key);
          if (from >= 0 && to >= 0) {
            cols.splice(from, 1);
            cols.splice(to, 0, key);
            persistColOrder(cols);
            render();
          }
        } else if (!dragging) {
          onHeaderClick(key);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  });
  table.querySelectorAll(".col-resizer").forEach(h => {
    h.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const th = h.closest("th");
      const key = th.dataset.key;
      const startX = ev.clientX;
      const startW = th.getBoundingClientRect().width;
      const onMove = e => {
        const w = Math.max(56, Math.round(startW + (e.clientX - startX)));
        th.style.width = w + "px";
        colWidths[key] = w;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        saveJSON(LS.colWidths, colWidths);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  });
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportCsv() {
  const rows = filtered();
  const cols = currentCols().filter(k => k !== "sel" && k !== "act");
  const headers = cols.map(k => COLS[k].label).concat(["URL"]);
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach(row => {
    const cells = cols.map(k => csvEscape(exportCell(row, k)));
    cells.push(csvEscape(row.url || ""));
    lines.push(cells.join(","));
  });
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const stamp = (DATA.as_of || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = "mhp-deal-tracker-" + stamp + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportCell(row, k) {
  if (k === "status") return getStatus(row.id) || "";
  if (k === "chase") return getChase(row.id);
  if (k === "name") return row.name || "";
  if (k === "price") return row.price == null || row.price === "" ? "" : row.price;
  if (k === "pop3") return row.pop3 == null ? "" : row.pop3;
  if (k === "is_new") return row.is_new ? "New" : "Seen";
  if (k === "missing") return (row.missing_fields || []).join("; ");
  if (k === "broker") return [row.broker_name, row.brokerage].filter(Boolean).join(" — ");
  if (k === "phone") return row.broker_phone || "";
  if (k === "email") return row.broker_email || "";
  if (k === "toh" || k === "poh") return row[k] == null ? "" : row[k];
  if (k === "score") {
    const info = scoreInfo(row);
    return info.value == null ? "" : info.value;
  }
  if (k === "type") return row.property_type || row.type || "";
  if (k === "est_value") {
    const ev = estValueInfo(row);
    return ev.value == null ? "" : Math.round(ev.value);
  }
  if (k === "purchase_cap") {
    const ev = estValueInfo(row);
    return ev.purchaseCap == null ? "" : Math.round(ev.purchaseCap * 100) / 100;
  }
  if (k === "market_cap") {
    const ev = estValueInfo(row);
    return ev.cap == null ? "" : Math.round(ev.cap * 100) / 100;
  }
  if (k === "vs_ask") {
    const ev = estValueInfo(row);
    return ev.vsAsk == null ? "" : Math.round(ev.vsAsk * 10) / 10;
  }
  if (k === "mynotes") return getNotes(row) || "";
  if (k === "sel" || k === "act") return "";
  if (k === "pads" || k === "cap" || k === "occupancy" || k === "utilities" || k === "sf_terms" || k === "note" || k === "city" || k === "state") {
    const v = row[k];
    return v == null ? "" : v;
  }
  return row[k] == null ? "" : row[k];
}

function renderList(rows) {
  const pane = document.getElementById("list");
  if (!rows.length) {
    pane.innerHTML = `<div class="empty">${showDeleted ? "No deleted listings in this view." : "No listings match these filters."}</div>`;
    return;
  }
  pane.innerHTML = view === "table" ? tableHTML(rows) : `<div class="cards">${rows.map(cardHTML).join("")}</div>`;
  bindListEvents(pane);
}

function pinIcon(color, selected) {
  const r = selected ? 9 : 7;
  const html = `<svg xmlns="http://www.w3.org/1998/svg" width="${r*2+8}" height="${r*2+8}" viewBox="0 0 ${r*2+8} ${r*2+8}">
    <circle cx="${r+4}" cy="${r+4}" r="${r+1}" fill="#fff"/>
    <circle cx="${r+4}" cy="${r+4}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
  return L.divIcon({ className: "", html, iconSize: [r*2+8, r*2+8], iconAnchor: [r+4, r+4], popupAnchor: [0, -(r+2)] });
}

function updateMap(rows) {
  if (!map) return;
  if (markersLayer) markersLayer.clearLayers();
  markerById = {};
  const pts = [];
  rows.forEach(row => {
    if (row.lat == null || row.lng == null) return;
    const color = (GROUPS[row.group] || {}).color || "#666";
    const m = L.marker([row.lat, row.lng], { icon: pinIcon(color, row.id === selectedId), title: row.name });
    m.bindPopup(popupHTML(row), { maxWidth: 280 });
    m.on("click", () => selectListing(row.id, false));
    markersLayer.addLayer(m);
    markerById[row.id] = m;
    pts.push([row.lat, row.lng]);
  });
  if (pts.length) {
    const b = L.latLngBounds(pts);
    if (!selectedId) map.fitBounds(b.pad(0.15));
  }
  if (selectedId && markerById[selectedId]) {
    markerById[selectedId].setIcon(pinIcon((GROUPS[(findRow(selectedId)||{}).group]||{}).color || "#666", true));
  }
}

function selectListing(id, fromList) {
  selectedId = id;
  document.querySelectorAll(".card, .tr").forEach(el => el.classList.toggle("selected", +el.dataset.id === id));
  const row = findRow(id);
  const m = markerById[id];
  if (row && m && row.lat != null && row.lng != null) {
    if (fromList) {
      map.setView([row.lat, row.lng], Math.max(map.getZoom(), 8), { animate: true });
      m.openPopup();
    }
    Object.entries(markerById).forEach(([k, mk]) => {
      const r = findRow(k);
      mk.setIcon(pinIcon((GROUPS[(r||{}).group]||{}).color || "#666", +k === id));
    });
  }
  const el = document.querySelector(`[data-id="${id}"]`);
  if (fromList === false && el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderCounts() {
  const all = (DATA.listings || []).filter(x => !isDeleted(x));
  const n = g => all.filter(x => x.group === g).length;
  document.getElementById("n-all").textContent = n("seller_financing") + n("other_passes");
  document.getElementById("n-sf").textContent = n("seller_financing");
  document.getElementById("n-pass").textContent = n("other_passes");
  document.getElementById("n-miss").textContent = n("missing_info");
  const savedCount = (DATA.saved || []).filter(x => !isDeleted(x)).length;
  const savedEl = document.getElementById("n-saved");
  if (savedEl) savedEl.textContent = savedCount;
  document.getElementById("hdr-counts").innerHTML =
    `<span><i class="dot" style="background:#12875A"></i>Seller financing ${n("seller_financing")}</span>` +
    `<span><i class="dot" style="background:#2B6CB0"></i>Other passes ${n("other_passes")}</span>` +
    `<span><i class="dot" style="background:#C05621"></i>Missing info ${n("missing_info")}</span>` +
    `<span><i class="dot" style="background:#6B4C9A"></i>Crexi saved ${savedCount}</span>`;
}

function clampMapWidth(n) {
  const v = Number(n);
  if (isNaN(v)) return 48;
  return Math.max(20, Math.min(70, Math.round(v)));
}
function applyMapWidth() {
  const split = document.getElementById("split") || document.querySelector(".split");
  if (split) split.style.setProperty("--map-width", mapWidth + "%");
  const slider = document.getElementById("mapWidth");
  if (slider && String(slider.value) !== String(mapWidth)) slider.value = String(mapWidth);
  if (map && typeof map.invalidateSize === "function") {
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 40);
  }
}

function visibleSorts() {
  return sorts.length ? sorts.slice() : [{ key: "price", dir: "desc", implicit: true }];
}
function materializeSorts() {
  if (!sorts.length) sorts = [{ key: "price", dir: "desc" }];
}
function sortOptionsHTML(selected, used) {
  return SORT_FIELDS.filter(k => COLS[k] && COLS[k].label).map(k => {
    const disabled = k !== selected && used[k] ? " disabled" : "";
    const sel = k === selected ? " selected" : "";
    return `<option value="${esc(k)}"${sel}${disabled}>${esc(COLS[k].label)}</option>`;
  }).join("");
}
function renderSortBar() {
  const bar = document.getElementById("sortBar");
  if (!bar) return;
  const list = visibleSorts();
  const used = {};
  list.forEach(s => { used[s.key] = true; });
  const chips = list.map((s, i) => {
    const num = sortMode === "multi" ? `<span class="sort-num">${i + 1}.</span>` : "";
    const arrow = s.dir === "asc" ? "↑" : "↓";
    const dirTitle = s.dir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending";
    const remove = (sortMode === "multi" && sorts.length) ? `<button type="button" class="sort-remove" data-sort-remove="${i}" title="Remove this sort" aria-label="Remove sort">×</button>` : "";
    return `<div class="sort-chip">${num}<select data-sort-index="${i}" aria-label="Sort field">${sortOptionsHTML(s.key, used)}</select><button type="button" class="sort-dir" data-sort-dir="${i}" title="${esc(dirTitle)}" aria-label="Sort direction">${arrow}</button>${remove}</div>`;
  }).join("");
  const add = sortMode === "multi"
    ? `<button type="button" class="sort-add" id="addSort">+ Add sort</button>`
    : "";
  bar.innerHTML = `<span class="sort-label">Sort</span>${chips}${add}`;
}
function setSortAt(index, key) {
  materializeSorts();
  if (sortMode === "single") {
    sorts = [{ key, dir: sorts[0] && sorts[0].key === key ? sorts[0].dir : defaultDir(key) }];
  } else {
    if (index < 0 || index >= sorts.length) return;
    const used = new Set(sorts.map(s => s.key));
    used.delete(sorts[index].key);
    if (used.has(key)) return;
    sorts[index] = { key, dir: defaultDir(key) };
  }
  saveJSON(LS.sorts, sorts);
  render();
}
function toggleSortDir(index) {
  materializeSorts();
  if (index < 0 || index >= sorts.length) return;
  sorts[index].dir = sorts[index].dir === "asc" ? "desc" : "asc";
  saveJSON(LS.sorts, sorts);
  render();
}
function removeSortAt(index) {
  materializeSorts();
  if (index < 0 || index >= sorts.length) return;
  sorts.splice(index, 1);
  saveJSON(LS.sorts, sorts);
  render();
}
function addSort() {
  materializeSorts();
  const used = new Set(sorts.map(s => s.key));
  const next = SORT_FIELDS.find(k => COLS[k] && COLS[k].label && !used.has(k));
  if (!next) return;
  sorts.push({ key: next, dir: defaultDir(next) });
  saveJSON(LS.sorts, sorts);
  render();
}

function applyCardSize() {
  document.body.classList.remove("card-s", "card-m", "card-l", "map-hidden");
  document.body.classList.add("card-" + (cardSize === "s" || cardSize === "l" ? cardSize : "m"));
  const sizeWrap = document.getElementById("cardSizeWrap");
  if (sizeWrap) sizeWrap.hidden = view !== "cards";
  document.querySelectorAll("[data-card-size]").forEach(b => {
    b.classList.toggle("active", b.dataset.cardSize === cardSize);
  });
}

function renderToolbarState() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("viewCards").classList.toggle("active", view === "cards");
  document.getElementById("viewTable").classList.toggle("active", view === "table");
  document.getElementById("modeMulti").classList.toggle("active", sortMode === "multi");
  document.getElementById("modeSingle").classList.toggle("active", sortMode === "single");
  const wrap = document.getElementById("savedGroupWrap");
  if (wrap) wrap.hidden = tab !== "crexi_saved";
  const nDel = deletedInUniverse().length;
  const showDel = document.getElementById("showDeleted");
  if (showDel) {
    showDel.textContent = (showDeleted ? "Hide deleted" : "Show deleted") + " (" + nDel + ")";
    showDel.classList.toggle("active", showDeleted);
    showDel.hidden = nDel === 0 && !showDeleted;
  }
  const delSel = document.getElementById("deleteSelected");
  if (delSel) {
    const nSel = selectedKeys.size;
    delSel.textContent = nSel ? ("Delete selected (" + nSel + ")") : "Delete selected";
    delSel.hidden = showDeleted;
  }
  applyCardSize();
  applyMapWidth();
  renderSortBar();
}

function render() {
  renderToolbarState();
  const rows = filtered();
  document.getElementById("shown").textContent = `${rows.length} shown`;
  renderList(rows);
  updateMap(rows);
}

function fillStates() {
  const sel = document.getElementById("state");
  const prev = sel.value;
  sel.innerHTML = `<option value="">All states</option>`;
  const states = [...new Set(activeUniverse().map(x => x.state).filter(Boolean))].sort();
  states.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; sel.appendChild(o);
  });
  if (states.includes(prev)) sel.value = prev;
}

function initMap() {
  map = L.map("map", { scrollWheelZoom: true, zoomControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  map.setView([39.5, -98.35], 4);
  markersLayer = L.layerGroup().addTo(map);
}

function bindChrome() {
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    tab = t.dataset.tab; saveJSON(LS.tab, tab); selectedId = null; fillStates(); render();
  }));
  ["q","state","pmin","pmax","onlyNew","savedGroup"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  document.getElementById("viewCards").addEventListener("click", () => { view = "cards"; saveJSON(LS.view, view); render(); });
  document.getElementById("viewTable").addEventListener("click", () => { view = "table"; saveJSON(LS.view, view); render(); });
  document.getElementById("modeMulti").addEventListener("click", () => setSortMode("multi"));
  document.getElementById("modeSingle").addEventListener("click", () => setSortMode("single"));
  document.getElementById("clearSorts").addEventListener("click", clearSorts);
  const exp = document.getElementById("exportCsv");
  if (exp) exp.addEventListener("click", exportCsv);
  document.querySelectorAll("[data-card-size]").forEach(b => {
    b.addEventListener("click", () => {
      cardSize = b.dataset.cardSize;
      saveJSON(LS.cardSize, cardSize);
      applyCardSize();
    });
  });
  const sortBar = document.getElementById("sortBar");
  if (sortBar) {
    sortBar.addEventListener("change", ev => {
      const sel = ev.target.closest("select[data-sort-index]");
      if (!sel) return;
      setSortAt(+sel.dataset.sortIndex, sel.value);
    });
    sortBar.addEventListener("click", ev => {
      const dir = ev.target.closest("[data-sort-dir]");
      if (dir) { toggleSortDir(+dir.dataset.sortDir); return; }
      const rm = ev.target.closest("[data-sort-remove]");
      if (rm) { removeSortAt(+rm.dataset.sortRemove); return; }
      if (ev.target.closest("#addSort")) addSort();
    });
  }
  const mapSlider = document.getElementById("mapWidth");
  if (mapSlider) {
    mapSlider.addEventListener("input", () => {
      mapWidth = clampMapWidth(mapSlider.value);
      applyMapWidth();
    });
    mapSlider.addEventListener("change", () => {
      mapWidth = clampMapWidth(mapSlider.value);
      saveJSON(LS.mapWidth, mapWidth);
      applyMapWidth();
    });
  }
  const showDel = document.getElementById("showDeleted");
  if (showDel) {
    showDel.addEventListener("click", () => {
      showDeleted = !showDeleted;
      saveJSON(LS.showDeleted, showDeleted);
      render();
    });
  }
  const delSel = document.getElementById("deleteSelected");
  if (delSel) {
    delSel.addEventListener("click", () => {
      const rows = (showDeleted ? [] : activeUniverse()).filter(r => selectedKeys.has(listingKey(r)) && !isDeleted(r));
      if (!rows.length) {
        window.alert("Select one or more listings first.");
        return;
      }
      deleteRows(rows);
    });
  }
  const expNotes = document.getElementById("exportNotes");
  if (expNotes) expNotes.addEventListener("click", exportNotesJson);
  const impNotes = document.getElementById("importNotes");
  const impFile = document.getElementById("importNotesFile");
  if (impNotes && impFile) {
    impNotes.addEventListener("click", () => impFile.click());
    impFile.addEventListener("change", () => {
      const file = impFile.files && impFile.files[0];
      if (file) importNotesJson(file);
      impFile.value = "";
    });
  }
}

function exportNotesJson() {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    notes: notesMap(),
    deleted: deletedState().keys,
    capOverrides: capOverrideMap(),
    valueOverrides: valueOverrideMap(),
    scoreOverrides: scoreOverrideMap(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mhp-deal-tracker-notes.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importNotesJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object") throw new Error("Not a JSON object");
      const notes = (data.notes && typeof data.notes === "object") ? data.notes : data;
      if (notes && typeof notes === "object" && !Array.isArray(notes)) {
        const m = notesMap();
        Object.keys(notes).forEach(k => {
          if (k === "version" || k === "exported_at" || k === "deleted" || k === "capOverrides" || k === "valueOverrides" || k === "scoreOverrides") return;
          const v = notes[k];
          if (v == null || v === "") delete m[k];
          else if (typeof v === "string" || typeof v === "number") m[k] = String(v);
        });
        saveJSON(LS.notes, m);
      }
      if (data.deleted) {
        const d = deletedKeySet();
        const incoming = Array.isArray(data.deleted) ? data.deleted : (data.deleted.keys || []);
        incoming.forEach(k => { if (k != null && k !== "") d.add(String(k)); });
        persistDeleted(d);
      }
      if (data.capOverrides && typeof data.capOverrides === "object") {
        const m = capOverrideMap();
        Object.keys(data.capOverrides).forEach(k => {
          const v = Number(data.capOverrides[k]);
          if (!isNaN(v) && v > 0) m[k] = v;
        });
        saveJSON(LS.cap, m);
      }
      if (data.valueOverrides && typeof data.valueOverrides === "object") {
        const m = valueOverrideMap();
        Object.keys(data.valueOverrides).forEach(k => {
          const v = Number(data.valueOverrides[k]);
          if (!isNaN(v) && v > 0) m[k] = v;
        });
        saveJSON(LS.value, m);
      }
      if (data.scoreOverrides && typeof data.scoreOverrides === "object") {
        const m = scoreOverrideMap();
        Object.keys(data.scoreOverrides).forEach(k => {
          const v = Number(data.scoreOverrides[k]);
          if (!isNaN(v)) m[k] = v;
        });
        saveJSON(LS.score, m);
      }
      render();
      renderCounts();
    } catch (err) {
      window.alert("Could not import notes: " + err.message);
    }
  };
  reader.readAsText(file);
}

function main() {
  sorts = loadJSON(LS.sorts, []);
  sortMode = loadJSON(LS.mode, "multi") || "multi";
  view = loadJSON(LS.view, "cards") || "cards";
  tab = loadJSON(LS.tab, "all_qualified") || "all_qualified";
  colOrder = loadJSON(LS.colOrder, { main: null, miss: null, saved: null }) || { main: null, miss: null, saved: null };
  colWidths = loadJSON(LS.colWidths, {}) || {};
  try {
    localStorage.removeItem("mhpDealTracker.showMap.v1");
    localStorage.removeItem("mhpDealTracker.mapWidth.v1");
  } catch (e) {}
  const savedSize = loadJSON(LS.cardSize, "m");
  cardSize = (savedSize === "s" || savedSize === "l") ? savedSize : "m";
  mapWidth = clampMapWidth(loadJSON(LS.mapWidth, 48));
  showDeleted = loadJSON(LS.showDeleted, false) === true;
  return Promise.all([
    fetch(DATA_URL).then(res => {
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.json();
    }),
    fetch(SAVED_URL).then(res => res.ok ? res.json() : { listings: [] }).catch(() => ({ listings: [] })),
    fetch(EST_URL).then(res => res.ok ? res.json() : {}).catch(() => ({})),
  ]).then(([data, saved, est]) => {
      DATA = data;
      DATA.saved = saved.listings || saved.saved || [];
      if (est && typeof est === "object") EST = Object.assign(EST, est);
      enrichFromSaved();
      document.getElementById("asof").textContent = "As of " + (DATA.as_of_label || DATA.as_of || "");
      fillStates();
      renderCounts();
      initMap();
      bindChrome();
      render();
      setTimeout(() => map.invalidateSize(), 100);
    });
}

main().catch(err => {
  document.getElementById("list").innerHTML = `<div class="empty">Could not load listings.json. ${esc(err.message)}</div>`;
  console.error(err);
});
