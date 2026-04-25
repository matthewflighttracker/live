const API_BASE = "https://sheetdb.io/api/v1/9fnmgmxtdst8m";

function buildLiveApiUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("_ts", Date.now().toString());
  return url.toString();
}

function liveFetch(url, options = {}) {
  return fetch(buildLiveApiUrl(url), {
    cache: "no-store",
    ...options,
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      ...(options.headers || {})
    }
  });
}

let allFlights = [];
let searchTerm = "";
let editingId = null;
let activeFilters = {
  year: "all",
  airline: "all",
  who: "all",
  from_airport: "all",
  to_airport: "all",
  airplane: "all",
  flight_code: "all",
};

let openFilterKey = null;

const FILTER_CONFIG = [
  { key: "year", label: "Year", getOptions: rows => uniqueYears(rows) },
  { key: "airline", label: "Airline", getOptions: rows => uniqueValues(rows.map(row => row.airline)) },
  { key: "who", label: "Who", getOptions: rows => uniquePeople(rows) },
  { key: "from_airport", label: "From", getOptions: rows => uniqueValues(rows.map(row => row.from_airport)) },
  { key: "to_airport", label: "To", getOptions: rows => uniqueValues(rows.map(row => row.to_airport)) },
  { key: "airplane", label: "Airplane", getOptions: rows => uniqueValues(rows.map(row => row.airplane)) },
  { key: "flight_code", label: "Flight", getOptions: rows => uniqueValues(rows.map(row => row.flight_code)) },
];

const els = {
  grid: document.getElementById("flightGrid"),
  regSearch: document.getElementById("regSearch"),
  clearBtn: document.getElementById("clearBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  copyRegsBtn: document.getElementById("copyRegsBtn"),
  addFlightBtn: document.getElementById("addFlightBtn"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  flightForm: document.getElementById("flightForm"),
  modalTitle: document.getElementById("modalTitle"),
  deleteBtn: document.getElementById("deleteBtn"),
  saveBtn: document.getElementById("saveBtn"),
  formStatus: document.getElementById("formStatus"),
  formId: document.getElementById("formId"),
  formDate: document.getElementById("formDate"),
  formReg: document.getElementById("formReg"),
  formFrom: document.getElementById("formFrom"),
  formTo: document.getElementById("formTo"),
  formFlight: document.getElementById("formFlight"),
  formAirline: document.getElementById("formAirline"),
  formAircraft: document.getElementById("formAircraft"),
  formWho: document.getElementById("formWho"),
  resultsText: document.getElementById("resultsText"),
  lastUpdated: document.getElementById("lastUpdated"),
  statFlights: document.getElementById("statFlights"),
  statRegs: document.getElementById("statRegs"),
  statRoutes: document.getElementById("statRoutes"),
  statYears: document.getElementById("statYears"),
  filterStrip: document.getElementById("filterStrip"),
  filterPopover: document.getElementById("filterPopover"),
  filterPopoverKicker: document.getElementById("filterPopoverKicker"),
  filterPopoverTitle: document.getElementById("filterPopoverTitle"),
  filterPopoverList: document.getElementById("filterPopoverList"),
  closeFilterPopoverBtn: document.getElementById("closeFilterPopoverBtn"),
};

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toInputDate(value) {
  const d = parseDate(value);
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function niceDate(value) {
  const d = parseDate(value);
  if (!d) return escapeHtml(value || "");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}

function yearFromRow(row) {
  const d = parseDate(row.date);
  return d ? String(d.getFullYear()) : "";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeWho(value) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map(name => name.trim())
    .filter(Boolean)
    .join(", ");
}

function splitPeople(value) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map(name => name.trim())
    .filter(Boolean);
}

function normalizeRegistration(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeRegistrationSearch(value) {
  return normalizeRegistration(value);
}

function normalizeFilterValue(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeRow(row = {}) {
  return {
    id: normalizeText(row.id),
    date: normalizeText(row.date),
    from_airport: normalizeText(row.from_airport),
    to_airport: normalizeText(row.to_airport),
    flight_code: normalizeText(row.flight_code),
    airline: normalizeText(row.airline),
    airplane: normalizeText(row.airplane),
    registration: normalizeText(row.registration),
    who: normalizeWho(row.who),
  };
}

function getDisplayRows() {
  return allFlights.map(normalizeRow);
}

function getSortedRows(rows = getDisplayRows()) {
  return [...rows].sort((a, b) => {
    const da = parseDate(a.date)?.getTime() || 0;
    const db = parseDate(b.date)?.getTime() || 0;
    return db - da;
  });
}

function getNextNumericId(rows = allFlights) {
  const used = new Set(
    rows
      .map(row => Number.parseInt(String(row.id).trim(), 10))
      .filter(num => Number.isInteger(num) && num > 0)
  );

  let next = 1;
  while (used.has(next)) next += 1;
  return String(next);
}

function uniqueValues(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function uniqueYears(rows) {
  return [...new Set(rows.map(yearFromRow).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
}

function uniquePeople(rows) {
  const people = [];
  for (const row of rows) {
    people.push(...splitPeople(row.who));
  }
  return uniqueValues(people);
}

function getOptionsForFilter(key, rows = getDisplayRows()) {
  const config = FILTER_CONFIG.find(item => item.key === key);
  return config ? config.getOptions(rows) : [];
}

function getFilterLabelValue(key) {
  const value = activeFilters[key];
  if (!value || value === "all") return "All";
  return value;
}

function renderFilterButtons() {
  const rows = getDisplayRows();
  els.filterStrip.innerHTML = FILTER_CONFIG.map(config => {
    const value = getFilterLabelValue(config.key);
    const selected = value !== "All";
    return `
      <button
        class="filter-btn${selected ? " active" : ""}"
        type="button"
        data-filter="${escapeHtml(config.key)}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        <span>${escapeHtml(config.label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </button>
    `;
  }).join("");

  els.filterStrip.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => toggleFilterPopover(button.dataset.filter));
  });

  for (const key of Object.keys(activeFilters)) {
    const options = getOptionsForFilter(key, rows);
    if (activeFilters[key] !== "all" && !options.includes(activeFilters[key])) {
      activeFilters[key] = "all";
    }
  }
}

function closeFilterPopover() {
  openFilterKey = null;
  els.filterPopover.hidden = true;
  els.filterPopoverList.innerHTML = "";
}

function openFilterPopover(key) {
  const config = FILTER_CONFIG.find(item => item.key === key);
  if (!config) return;

  const rows = getDisplayRows();
  const options = getOptionsForFilter(key, rows);

  openFilterKey = key;
  els.filterPopover.hidden = false;
  els.filterPopoverKicker.textContent = config.label;
  els.filterPopoverTitle.textContent = activeFilters[key] === "all" ? `Choose ${config.label.toLowerCase()}` : `Change ${config.label.toLowerCase()}`;
  els.filterPopoverList.innerHTML = [
    `<button class="filter-option${activeFilters[key] === "all" ? " active" : ""}" type="button" data-value="all">All ${escapeHtml(config.label.toLowerCase())}</button>`,
    ...options.map(option => `
      <button class="filter-option${activeFilters[key] === option ? " active" : ""}" type="button" data-value="${escapeHtml(option)}">
        ${escapeHtml(option)}
      </button>
    `)
  ].join("");

  els.filterPopoverList.querySelectorAll("[data-value]").forEach(button => {
    button.addEventListener("click", () => {
      activeFilters[key] = button.dataset.value;
      closeFilterPopover();
      render();
      renderFilterButtons();
    });
  });
}

function toggleFilterPopover(key) {
  if (openFilterKey === key && !els.filterPopover.hidden) {
    closeFilterPopover();
    return;
  }
  openFilterPopover(key);
}

function normalizeFilterSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function currentFilteredFlights() {
  const q = normalizeFilterSearch(searchTerm);
  const rows = getSortedRows();

  return rows.filter(row => {
    const rowYear = yearFromRow(row);

    const yearOk = activeFilters.year === "all" || rowYear === activeFilters.year;
    const airlineOk = activeFilters.airline === "all" || normalizeFilterValue(row.airline) === normalizeFilterValue(activeFilters.airline);
    const whoOk = activeFilters.who === "all" || splitPeople(row.who).some(person => normalizeFilterValue(person) === normalizeFilterValue(activeFilters.who));
    const fromOk = activeFilters.from_airport === "all" || normalizeFilterValue(row.from_airport) === normalizeFilterValue(activeFilters.from_airport);
    const toOk = activeFilters.to_airport === "all" || normalizeFilterValue(row.to_airport) === normalizeFilterValue(activeFilters.to_airport);
    const airplaneOk = activeFilters.airplane === "all" || normalizeFilterValue(row.airplane) === normalizeFilterValue(activeFilters.airplane);
    const flightOk = activeFilters.flight_code === "all" || normalizeFilterValue(row.flight_code) === normalizeFilterValue(activeFilters.flight_code);

    const reg = normalizeRegistration(row.registration);
    const searchOk = !q || reg.includes(normalizeRegistrationSearch(q));

    return yearOk && airlineOk && whoOk && fromOk && toOk && airplaneOk && flightOk && searchOk;
  });
}

function updateStats(rows = currentFilteredFlights()) {
  const flights = rows.length;
  const regs = new Set(rows.map(r => normalizeText(r.registration)).filter(Boolean)).size;
  const routes = new Set(
    rows
      .map(r => `${normalizeText(r.from_airport)}→${normalizeText(r.to_airport)}`)
      .filter(pair => pair !== "→")
  ).size;
  const years = new Set(rows.map(yearFromRow).filter(Boolean)).size;

  els.statFlights.textContent = flights;
  els.statRegs.textContent = regs;
  els.statRoutes.textContent = routes;
  els.statYears.textContent = years;
}

function render() {
  const rows = currentFilteredFlights();
  updateStats(rows);

  els.resultsText.textContent = `${rows.length} flight${rows.length === 1 ? "" : "s"} shown`;
  els.lastUpdated.textContent = allFlights.length ? "Live from Google Sheets" : "";

  if (!rows.length) {
    els.grid.innerHTML = `
      <div class="flight-card">
        <div class="route">No flights found</div>
        <p class="people">Try a different registration or filter, or add a new flight.</p>
      </div>
    `;
    return;
  }

  els.grid.innerHTML = rows.map(row => {
    const date = niceDate(row.date);
    const year = escapeHtml(yearFromRow(row));

    return `
      <article class="flight-card">
        <div class="flight-head">
          <div>
            <div class="pill">${date} · ${year || "—"}</div>
            <div class="route">${escapeHtml(row.from_airport || "")} → ${escapeHtml(row.to_airport || "")}</div>
          </div>
          <div class="pill reg">${escapeHtml(row.registration || "No reg")}</div>
        </div>

        <div class="meta">
          <div class="pill">Flight: <strong>${escapeHtml(row.flight_code || "—")}</strong></div>
          <div class="pill">Airline: <strong>${escapeHtml(row.airline || "—")}</strong></div>
          <div class="pill">Airplane: <strong>${escapeHtml(row.airplane || "—")}</strong></div>
        </div>

        <p class="people">${row.who ? `<strong>Who:</strong> ${escapeHtml(row.who)}` : ""}</p>

        <div class="card-actions">
          <button class="btn" type="button" onclick="openEdit('${String(row.id).replaceAll("'", "\\'")}')">Edit</button>
          <button class="btn btn-danger" type="button" onclick="removeFlight('${String(row.id).replaceAll("'", "\\'")}')">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function closeModal() {
  editingId = null;
  els.modalBackdrop.classList.remove("show");
  els.modalBackdrop.setAttribute("aria-hidden", "true");
  els.formStatus.textContent = "";
}

function showModal(mode = "add", row = null) {
  editingId = row?.id || null;
  els.modalTitle.textContent = mode === "edit" ? "Edit flight" : "Add flight";
  els.deleteBtn.style.display = row ? "inline-flex" : "none";
  els.formStatus.textContent = "";
  els.flightForm.reset();

  els.formId.value = row?.id || "";
  els.formDate.value = row?.date ? toInputDate(row.date) : "";

  if (row) {
    els.formReg.value = row.registration || "";
    els.formFrom.value = row.from_airport || "";
    els.formTo.value = row.to_airport || "";
    els.formFlight.value = row.flight_code || "";
    els.formAirline.value = row.airline || "";
    els.formAircraft.value = row.airplane || "";
    els.formWho.value = row.who || "";
  }

  els.modalBackdrop.classList.add("show");
  els.modalBackdrop.setAttribute("aria-hidden", "false");
}

async function fetchRows() {
  const res = await liveFetch(API_BASE);
  if (!res.ok) throw new Error(`Failed to load flights (${res.status})`);

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function loadFlights() {
  els.resultsText.textContent = "Loading flights…";
  els.grid.innerHTML = `<div class="loading">Loading your flights…</div>`;

  const data = await fetchRows();
  allFlights = Array.isArray(data) ? data : [];
  renderFilterButtons();
  closeFilterPopover();
  render();
}

function fillFormFromRow(row) {
  showModal("edit", row);
}

async function saveFlight(e) {
  e.preventDefault();
  els.saveBtn.disabled = true;
  els.formStatus.textContent = "Saving…";

  const date = els.formDate.value;
  const basePayload = {
    date,
    from_airport: normalizeUpper(els.formFrom.value),
    to_airport: normalizeUpper(els.formTo.value),
    flight_code: normalizeUpper(els.formFlight.value),
    airline: normalizeText(els.formAirline.value),
    airplane: normalizeText(els.formAircraft.value),
    registration: normalizeUpper(els.formReg.value),
    who: normalizeWho(els.formWho.value)
  };

  try {
    if (editingId) {
      const payload = { id: String(editingId), ...basePayload };
      const res = await liveFetch(`${API_BASE}/id/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload })
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      els.formStatus.textContent = "Updated.";
    } else {
      const latestRows = await fetchRows();
      allFlights = Array.isArray(latestRows) ? latestRows : [];
      const nextId = getNextNumericId(allFlights);
      const payload = { id: nextId, ...basePayload };
      const res = await liveFetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [payload] })
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      els.formStatus.textContent = "Saved.";
    }

    closeModal();
    await loadFlights();
  } catch (err) {
    els.formStatus.textContent = err.message || "Something went wrong.";
  } finally {
    els.saveBtn.disabled = false;
  }
}

async function removeFlight(id, confirmDelete = true) {
  if (confirmDelete && !confirm("Delete this flight?")) return false;

  try {
    const res = await liveFetch(`${API_BASE}/id/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    await loadFlights();
    return true;
  } catch (err) {
    alert(err.message || "Delete failed.");
    return false;
  }
}

function openEdit(id) {
  const row = getDisplayRows().find(r => String(r.id) === String(id));
  if (!row) return;
  fillFormFromRow(row);
}

function clearAllFilters() {
  searchTerm = "";
  activeFilters = {
    year: "all",
    airline: "all",
    who: "all",
    from_airport: "all",
    to_airport: "all",
    airplane: "all",
    flight_code: "all",
  };
  els.regSearch.value = "";
  closeFilterPopover();
  renderFilterButtons();
  render();
}

async function copyVisibleRegistrations() {
  const regs = [...new Set(
    currentFilteredFlights()
      .map(row => normalizeText(row.registration))
      .filter(Boolean)
  )];
  const text = regs.join(", ");

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

window.openEdit = openEdit;
window.removeFlight = removeFlight;

els.addFlightBtn.addEventListener("click", () => showModal("add"));
els.refreshBtn.addEventListener("click", loadFlights);
els.copyRegsBtn.addEventListener("click", copyVisibleRegistrations);
els.closeModalBtn.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});

els.regSearch.addEventListener("input", (e) => {
  searchTerm = e.target.value || "";
  render();
});

els.clearBtn.addEventListener("click", clearAllFilters);
els.flightForm.addEventListener("submit", saveFlight);
els.deleteBtn.addEventListener("click", async () => {
  const id = els.formId.value;
  if (!id) return;
  const deleted = await removeFlight(id, true);
  if (deleted) closeModal();
});

els.closeFilterPopoverBtn.addEventListener("click", closeFilterPopover);

document.addEventListener("click", (e) => {
  const target = e.target;
  const insideFilters = target instanceof Node && (els.filterStrip.contains(target) || els.filterPopover.contains(target));
  if (!insideFilters && els.filterPopover && !els.filterPopover.hidden) {
    closeFilterPopover();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFilterPopover();
  }
});

loadFlights().catch(err => {
  els.grid.innerHTML = `
    <div class="flight-card">
      <div class="route">Could not load flights</div>
      <p class="people">${escapeHtml(err.message || "Check your SheetDB API URL.")}</p>
    </div>
  `;
  els.resultsText.textContent = "Error";
});
