const DATA_URL = "data/listings.json";
const SAVED_URL = "data/saved.json";
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
};

const MAIN_COLS = ["status","name","city","state","price","pads","toh","poh","score","cap","occupancy","utilities","pop3","sf_terms","is_new","note"];
const MISS_COLS = ["chase","name","city","state","price","missing","broker","phone","email","pads","toh","poh","score","occupancy","utilities","pop3","is_new","note"];
const SAVED_COLS = ["status","name","type","city","state","price","pads","toh","poh","score","cap","occupancy","utilities","pop3","sf_terms","note"];

let DATA = { listings: [], saved: [], as_of_label: "" };
let map, markersLayer, markerById = {};
let selectedId = null;
let sorts = [];
let sortMode = "multi";
let view = "cards";
let tab = "all_qualified";
let colOrder = { main: null, miss: null };
let colWidths = {};

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
  if (q) {
    list = list.filter(x => {
      const blob = [x.name, x.city, x.state, x.note, x.sf_terms, x.broker_name, x.brokerage, x.utilities, x.property_type, x.saved_group, (x.missing_fields||[]).join(" "), x.toh, x.poh].join(" ").toLowerCase();
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
  return (key === "price" || key === "cap" || key === "occupancy" || key === "pop3" || key === "is_new" || key === "score" || key === "toh" || key === "poh") ? "desc" : "asc";
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
  return `<article class="card g-${row.group}${selectedId===row.id?" selected":""}" data-id="${row.id}">
    <div class="card-media">
      ${cardPhoto(row)}
      ${scoreBadgeHTML(row, "on-photo")}
      <div class="card-media-pills">${pills(row)}</div>
    </div>
    <div class="card-body">
      <div class="price">${money(row.price)}</div>
      <h3><a href="${esc(row.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(row.name)}</a></h3>
      <div class="meta">${esc(row.city)}, ${esc(row.state)}${row.address ? " · " + esc(row.address) : ""}</div>
      <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join("")}</div>
      ${row.sf_terms ? `<div class="sf-line"><strong>Seller financing:</strong> ${esc(row.sf_terms)}</div>` : ""}
      ${row.group === "missing_info" && miss ? `<div class="missing-line"><strong>Missing:</strong> ${miss}</div>` : ""}
      ${brokerBits.length || contact.length ? `<div class="broker"><strong>Broker:</strong> ${brokerBits.join(" — ") || "n/a"}${contact.length ? " · " + contact.join(" · ") : " · contact n/a on the public listing"}</div>` : (row.group==="missing_info" ? `<div class="broker"><strong>Broker:</strong> n/a on the public listing</div>` : "")}
      ${row.note ? `<div class="note">${esc(row.note)}</div>` : ""}
      ${flagLines}
      <div class="row-status">${row.group==="missing_info" ? statusSelect(row.id,"chase") : statusSelect(row.id,"status")}</div>
    </div>
  </article>`;
}

function tableHTML(rows) {
  const cols = currentCols();
  const head = cols.map(k => {
    const w = colWidths[k];
    const style = w ? ` style="width:${w}px"` : "";
    return `<th data-key="${k}"${style}><span class="th-label">${esc(COLS[k].label)}${headerIndicator(k)}</span><span class="col-resizer" data-resize="${k}"></span></th>`;
  }).join("");
  const body = rows.map(row => {
    const cells = cols.map(k => `<td>${cellHTML(row, k)}</td>`).join("");
    return `<tr class="tr g-${row.group}${selectedId===row.id?" selected":""}" data-id="${row.id}">${cells}</tr>`;
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
    <div class="facts"><span>${dash(row.pads)} pads</span><span>TOH ${countFmt(row.toh)}</span><span>POH ${countFmt(row.poh)}</span><span>Score ${esc(score)}</span></div>
    ${miss}
    <div style="margin-top:6px"><a href="${esc(row.url)}" target="_blank" rel="noopener">Open on Crexi</a></div>
  </div>`;
}

function bindListEvents(root) {
  root.querySelectorAll("[data-id]").forEach(el => {
    el.addEventListener("click", () => selectListing(+el.dataset.id, true));
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
      const id = +btn.dataset.scoreEdit;
      const row = DATA.listings.find(x => x.id === id);
      if (row) promptScore(row);
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
      if (ev.target.closest(".col-resizer")) return;
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
  const cols = currentCols();
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
  if (k === "pads" || k === "cap" || k === "occupancy" || k === "utilities" || k === "sf_terms" || k === "note" || k === "city" || k === "state") {
    const v = row[k];
    return v == null ? "" : v;
  }
  return row[k] == null ? "" : row[k];
}

function renderList(rows) {
  const pane = document.getElementById("list");
  if (!rows.length) {
    pane.innerHTML = `<div class="empty">No listings match these filters.</div>`;
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
    markerById[selectedId].setIcon(pinIcon((GROUPS[(DATA.listings.find(x=>x.id===selectedId)||{}).group]||{}).color || "#666", true));
  }
}

function selectListing(id, fromList) {
  selectedId = id;
  document.querySelectorAll(".card, .tr").forEach(el => el.classList.toggle("selected", +el.dataset.id === id));
  const row = DATA.listings.find(x => x.id === id);
  const m = markerById[id];
  if (row && m) {
    if (fromList) {
      map.setView([row.lat, row.lng], Math.max(map.getZoom(), 8), { animate: true });
      m.openPopup();
    }
    Object.entries(markerById).forEach(([k, mk]) => {
      const r = DATA.listings.find(x => x.id === +k);
      mk.setIcon(pinIcon((GROUPS[(r||{}).group]||{}).color || "#666", +k === id));
    });
  }
  const el = document.querySelector(`[data-id="${id}"]`);
  if (fromList === false && el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderCounts() {
  const all = DATA.listings;
  const n = g => all.filter(x => x.group === g).length;
  document.getElementById("n-all").textContent = n("seller_financing") + n("other_passes");
  document.getElementById("n-sf").textContent = n("seller_financing");
  document.getElementById("n-pass").textContent = n("other_passes");
  document.getElementById("n-miss").textContent = n("missing_info");
  const savedEl = document.getElementById("n-saved");
  if (savedEl) savedEl.textContent = (DATA.saved || []).length;
  document.getElementById("hdr-counts").innerHTML =
    `<span><i class="dot" style="background:#12875A"></i>Seller financing ${n("seller_financing")}</span>` +
    `<span><i class="dot" style="background:#2B6CB0"></i>Other passes ${n("other_passes")}</span>` +
    `<span><i class="dot" style="background:#C05621"></i>Missing info ${n("missing_info")}</span>` +
    `<span><i class="dot" style="background:#6B4C9A"></i>Crexi saved ${(DATA.saved || []).length}</span>`;
}

function renderToolbarState() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("viewCards").classList.toggle("active", view === "cards");
  document.getElementById("viewTable").classList.toggle("active", view === "table");
  document.getElementById("modeMulti").classList.toggle("active", sortMode === "multi");
  document.getElementById("modeSingle").classList.toggle("active", sortMode === "single");
  const wrap = document.getElementById("savedGroupWrap");
  if (wrap) wrap.hidden = tab !== "crexi_saved";
  const label = sorts.length
    ? sorts.map((s,i) => `${i+1}. ${COLS[s.key]?.label || s.key} ${s.dir==="asc"?"↑":"↓"}`).join(" · ")
    : "Default: price (high to low)";
  document.getElementById("sortState").textContent = (sortMode === "multi" ? "Multi-sort: " : "Single sort: ") + label;
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
}

function main() {
  sorts = loadJSON(LS.sorts, []);
  sortMode = loadJSON(LS.mode, "multi") || "multi";
  view = loadJSON(LS.view, "cards") || "cards";
  tab = loadJSON(LS.tab, "all_qualified") || "all_qualified";
  colOrder = loadJSON(LS.colOrder, { main: null, miss: null, saved: null }) || { main: null, miss: null, saved: null };
  colWidths = loadJSON(LS.colWidths, {}) || {};
  return Promise.all([
    fetch(DATA_URL).then(res => {
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.json();
    }),
    fetch(SAVED_URL).then(res => res.ok ? res.json() : { listings: [] }).catch(() => ({ listings: [] })),
  ]).then(([data, saved]) => {
      DATA = data;
      DATA.saved = saved.listings || saved.saved || [];
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
