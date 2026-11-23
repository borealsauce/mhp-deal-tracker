const DATA_URL = "data/listings.json";
const LS = {
  status: "mhpDealTracker.status.v1",
  chase: "mhpDealTracker.chase.v1",
  sorts: "mhpDealTracker.sorts.v1",
  mode: "mhpDealTracker.sortMode.v1",
  view: "mhpDealTracker.view.v1",
  tab: "mhpDealTracker.tab.v1",
};

const GROUPS = {
  seller_financing: { label: "Seller financing", color: "#12875A", pill: "sf", short: "Seller financing" },
  other_passes: { label: "Other passes", color: "#2B6CB0", pill: "pass", short: "Other pass" },
  missing_info: { label: "Missing info — chase broker", color: "#C05621", pill: "miss", short: "Missing info" },
};

const MAIN_STATUS = ["", "Interested", "Contacted", "Pass"];
const CHASE_STATUS = ["Not contacted", "Asked", "Got info"];

const COLS = {
  status: { label: "Status", type: "status" },
  chase: { label: "Chase status", type: "chase" },
  name: { label: "Park", type: "text" },
  city: { label: "City", type: "text" },
  state: { label: "State", type: "text" },
  price: { label: "Price", type: "num" },
  pads: { label: "Pads", type: "pads" },
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
};

const MAIN_COLS = ["status","name","city","state","price","pads","cap","occupancy","utilities","pop3","sf_terms","is_new","note"];
const MISS_COLS = ["chase","name","city","state","price","missing","broker","phone","email","pads","occupancy","utilities","pop3","is_new","note"];

let DATA = { listings: [], as_of_label: "" };
let map, markersLayer, markerById = {};
let selectedId = null;
let sorts = [];
let sortMode = "multi";
let view = "cards";
let tab = "all_qualified";

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function statusMap() { return loadJSON(LS.status, {}); }
function chaseMap() { return loadJSON(LS.chase, {}); }
function getStatus(id) { return statusMap()[id] || ""; }
function getChase(id) { return chaseMap()[id] || "Not contacted"; }
function setStatus(id, v) { const m = statusMap(); if (v) m[id] = v; else delete m[id]; saveJSON(LS.status, m); }
function setChase(id, v) { const m = chaseMap(); m[id] = v; saveJSON(LS.chase, m); }

function money(p) {
  if (p == null || p === "") return "Unpriced";
  return "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function popFmt(n) { return n == null ? "n/a" : Number(n).toLocaleString("en-US"); }
function dash(s) { return s && String(s).trim() && String(s).toLowerCase() !== "n/a" ? s : "n/a"; }
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

function currentCols() {
  return tab === "missing_info" ? MISS_COLS : MAIN_COLS;
}

function tabListings(list) {
  if (tab === "seller_financing") return list.filter(x => x.group === "seller_financing");
  if (tab === "other_passes") return list.filter(x => x.group === "other_passes");
  if (tab === "missing_info") return list.filter(x => x.group === "missing_info");
  return list.filter(x => x.group !== "missing_info");
}

function filtered() {
  const q = (document.getElementById("q").value || "").trim().toLowerCase();
  const st = document.getElementById("state").value;
  const pmin = firstNum(document.getElementById("pmin").value);
  const pmax = firstNum(document.getElementById("pmax").value);
  const onlyNew = document.getElementById("onlyNew").checked;
  let list = DATA.listings.slice();
  list = tabListings(list);
  if (st) list = list.filter(x => x.state === st);
  if (onlyNew) list = list.filter(x => x.is_new);
  if (pmin != null) list = list.filter(x => x.price != null && x.price >= pmin);
  if (pmax != null) list = list.filter(x => x.price != null && x.price <= pmax);
  if (q) {
    list = list.filter(x => {
      const blob = [x.name, x.city, x.state, x.note, x.sf_terms, x.broker_name, x.brokerage, x.utilities, (x.missing_fields||[]).join(" ")].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  return sortList(list);
}

function sortValue(row, key) {
  if (key === "status") return getStatus(row.id) || "";
  if (key === "chase") return getChase(row.id) || "";
  if (key === "missing") return (row.missing_fields || []).length;
  if (key === "broker") return (row.broker_name || row.brokerage || "").toLowerCase();
  if (key === "phone") return row.broker_phone || "";
  if (key === "email") return row.broker_email || "";
  if (key === "is_new") return row.is_new ? 1 : 0;
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
  return (key === "price" || key === "cap" || key === "occupancy" || key === "pop3" || key === "is_new") ? "desc" : "asc";
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
  const g = GROUPS[row.group];
  let h = `<span class="pill ${row.is_new ? "new" : "seen"}">${row.is_new ? "New" : "Previously seen"}</span>`;
  if (g) h += `<span class="pill ${g.pill}">${esc(g.short)}</span>`;
  return h;
}

function cardHTML(row) {
  const miss = (row.missing_fields || []).map(esc).join(", ");
  const brokerBits = [];
  if (row.broker_name) brokerBits.push(esc(row.broker_name));
  if (row.brokerage) brokerBits.push(esc(row.brokerage));
  const contact = [];
  if (row.broker_phone) contact.push(esc(row.broker_phone));
  if (row.broker_email) contact.push(`<a href="mailto:${esc(row.broker_email)}" onclick="event.stopPropagation()">${esc(row.broker_email)}</a>`);
  return `<article class="card g-${row.group}${selectedId===row.id?" selected":""}" data-id="${row.id}">
    <div class="pills">${pills(row)}</div>
    <div class="price">${money(row.price)}</div>
    <h3><a href="${esc(row.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(row.name)}</a></h3>
    <div class="meta">${esc(row.city)}, ${esc(row.state)}${row.address ? " · " + esc(row.address) : ""}</div>
    <div class="facts">
      <span>${dash(row.pads)} pads</span>
      <span>${dash(row.occupancy)} occ</span>
      <span>${dash(row.cap)} cap</span>
      <span>${dash(row.utilities)}</span>
      <span>${popFmt(row.pop3)} within 3 mi</span>
    </div>
    ${row.sf_terms ? `<div class="sf-line"><strong>Seller financing:</strong> ${esc(row.sf_terms)}</div>` : ""}
    ${row.group === "missing_info" && miss ? `<div class="missing-line"><strong>Missing:</strong> ${miss}</div>` : ""}
    ${brokerBits.length || contact.length ? `<div class="broker"><strong>Broker:</strong> ${brokerBits.join(" — ") || "n/a"}${contact.length ? " · " + contact.join(" · ") : " · contact n/a on the public listing"}</div>` : (row.group==="missing_info" ? `<div class="broker"><strong>Broker:</strong> n/a on the public listing</div>` : "")}
    ${row.note ? `<div class="note">${esc(row.note)}</div>` : ""}
    <div class="row-status">${row.group==="missing_info" ? statusSelect(row.id,"chase") : statusSelect(row.id,"status")}</div>
  </article>`;
}

function tableHTML(rows) {
  const cols = currentCols();
  const head = cols.map(k => `<th data-key="${k}">${esc(COLS[k].label)}${headerIndicator(k)}</th>`).join("");
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
  if (k === "cap") return esc(dash(row.cap));
  if (k === "occupancy") return esc(dash(row.occupancy));
  if (k === "utilities") return esc(dash(row.utilities));
  if (k === "sf_terms") return esc(row.sf_terms || "n/a");
  if (k === "note") return esc(row.note || "");
  if (k === "city") return esc(row.city || "");
  if (k === "state") return esc(row.state || "");
  return esc(row[k] ?? "");
}

function popupHTML(row) {
  const miss = (row.missing_fields || []).length ? `<div class="missing-line"><strong>Missing:</strong> ${esc(row.missing_fields.join(", "))}</div>` : "";
  return `<div class="popup">
    <div class="p">${money(row.price)}</div>
    <div class="n">${esc(row.name)}</div>
    <div class="meta">${esc(row.city)}, ${esc(row.state)}</div>
    <div class="facts"><span>${dash(row.pads)} pads</span><span>${dash(row.occupancy)} occ</span></div>
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
  root.querySelectorAll("th[data-key]").forEach(th => {
    th.addEventListener("click", () => onHeaderClick(th.dataset.key));
  });
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
  const html = `<svg xmlns="http://www.w3.org/2000/svg" width="${r*2+8}" height="${r*2+8}" viewBox="0 0 ${r*2+8} ${r*2+8}">
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
  document.getElementById("hdr-counts").innerHTML =
    `<span><i class="dot" style="background:#12875A"></i>Seller financing ${n("seller_financing")}</span>` +
    `<span><i class="dot" style="background:#2B6CB0"></i>Other passes ${n("other_passes")}</span>` +
    `<span><i class="dot" style="background:#C05621"></i>Missing info ${n("missing_info")}</span>`;
}

function renderToolbarState() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("viewCards").classList.toggle("active", view === "cards");
  document.getElementById("viewTable").classList.toggle("active", view === "table");
  document.getElementById("modeMulti").classList.toggle("active", sortMode === "multi");
  document.getElementById("modeSingle").classList.toggle("active", sortMode === "single");
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
  const states = [...new Set(DATA.listings.map(x => x.state).filter(Boolean))].sort();
  states.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; sel.appendChild(o);
  });
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
    tab = t.dataset.tab; saveJSON(LS.tab, tab); selectedId = null; render();
  }));
  ["q","state","pmin","pmax","onlyNew"].forEach(id => {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  });
  document.getElementById("viewCards").addEventListener("click", () => { view = "cards"; saveJSON(LS.view, view); render(); });
  document.getElementById("viewTable").addEventListener("click", () => { view = "table"; saveJSON(LS.view, view); render(); });
  document.getElementById("modeMulti").addEventListener("click", () => setSortMode("multi"));
  document.getElementById("modeSingle").addEventListener("click", () => setSortMode("single"));
  document.getElementById("clearSorts").addEventListener("click", clearSorts);
}

async function main() {
  sorts = loadJSON(LS.sorts, []);
  sortMode = loadJSON(LS.mode, "multi") || "multi";
  view = loadJSON(LS.view, "cards") || "cards";
  tab = loadJSON(LS.tab, "all_qualified") || "all_qualified";
  const res = await fetch(DATA_URL);
  DATA = await res.json();
  document.getElementById("asof").textContent = "As of " + (DATA.as_of_label || DATA.as_of || "");
  fillStates();
  renderCounts();
  initMap();
  bindChrome();
  render();
  setTimeout(() => map.invalidateSize(), 100);
}

main().catch(err => {
  document.getElementById("list").innerHTML = `<div class="empty">Could not load listings.json. ${esc(err.message)}</div>`;
  console.error(err);
});
