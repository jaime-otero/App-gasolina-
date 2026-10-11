'use strict';

// ---------- Datos ----------
const STORAGE_KEY = 'gasolina.v1';

const DEFAULT_DATA = {
  cars: [
    { id: 'papa', name: 'Papá', consumption: 6.5, color: 'var(--car-papa)' },
    { id: 'mama', name: 'Mamá', consumption: 6.5, color: 'var(--car-mama)' },
    { id: 'rojo', name: 'Rojo', consumption: 6.5, color: 'var(--car-rojo)' },
  ],
  defaultPrice: 1.55,
  routes: [], // { id, name, km, carId|null }
  trips: [],  // { id, date:'YYYY-MM-DD', carId, km, consumption, price, note }
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const data = JSON.parse(raw);
    // Asegura que existen los 3 coches aunque los datos sean antiguos
    for (const car of DEFAULT_DATA.cars) {
      if (!data.cars.find(c => c.id === car.id)) data.cars.push({ ...car });
    }
    return { ...structuredClone(DEFAULT_DATA), ...data };
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('No se pudo guardar en el móvil');
  }
}

let state = load();

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const carById = id => state.cars.find(c => c.id === id);
const litersOf = t => t.km * t.consumption / 100;
const eurosOf = t => litersOf(t) * (t.price || 0);

function todayISO() {
  const d = new Date();
  return toISO(d);
}
function toISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function prettyDate(s) {
  return parseISO(s).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ---------- Navegación ----------
const TITLES = { trip: 'Nuevo viaje', summary: 'Resumen', settings: 'Ajustes' };

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  $('#title').textContent = TITLES[name];
  if (name === 'summary') renderSummary();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Nuevo viaje ----------
let selectedCar = state.cars[0].id;

function renderCarPicker() {
  const picker = $('#car-picker');
  picker.innerHTML = '';
  for (const car of state.cars) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = car.name;
    if (car.id === selectedCar) {
      b.classList.add('on');
      b.style.background = car.color;
    }
    b.addEventListener('click', () => selectCar(car.id));
    picker.appendChild(b);
  }
}

function selectCar(id) {
  selectedCar = id;
  $('#trip-cons').value = carById(id).consumption;
  renderCarPicker();
  updateResult();
}

function updateResult() {
  const t = { km: num($('#trip-km').value), consumption: num($('#trip-cons').value), price: num($('#trip-price').value) };
  $('#res-liters').textContent = `${fmt(litersOf(t))} L`;
  $('#res-euros').textContent = `${fmt(eurosOf(t))} €`;
}
['#trip-km', '#trip-cons', '#trip-price'].forEach(s => $(s).addEventListener('input', updateResult));

function resetTripForm() {
  $('#trip-km').value = '';
  $('#trip-note').value = '';
  $('#trip-date').value = todayISO();
  $('#trip-price').value = state.defaultPrice;
  $('#trip-cons').value = carById(selectedCar).consumption;
  updateResult();
}

$('#trip-form').addEventListener('submit', e => {
  e.preventDefault();
  const km = num($('#trip-km').value);
  const consumption = num($('#trip-cons').value);
  if (km <= 0) return toast('Pon los kilómetros');
  if (consumption <= 0) return toast('Pon el consumo');
  const trip = {
    id: uid(),
    date: $('#trip-date').value || todayISO(),
    carId: selectedCar,
    km,
    consumption,
    price: num($('#trip-price').value),
    note: $('#trip-note').value.trim(),
  };
  state.trips.push(trip);
  save();
  toast(`Guardado: ${fmt(litersOf(trip))} L · ${fmt(eurosOf(trip))} €`);
  resetTripForm();
});

// ---------- Viajes comunes ----------
$('#save-route-btn').addEventListener('click', () => {
  const km = num($('#trip-km').value);
  if (km <= 0) return toast('Primero pon los kilómetros');
  const suggested = $('#trip-note').value.trim();
  const name = prompt('Nombre del viaje común (ej: Casa → Trabajo)', suggested);
  if (!name || !name.trim()) return;
  state.routes.push({ id: uid(), name: name.trim(), km, carId: selectedCar });
  save();
  renderRoutes();
  toast('Viaje común guardado');
});

function applyRoute(route) {
  if (route.carId && carById(route.carId)) selectCar(route.carId);
  $('#trip-km').value = route.km;
  $('#trip-note').value = route.name;
  updateResult();
  toast(`${route.name}: ${fmt(route.km, 1)} km`);
}

function renderRoutes() {
  const list = $('#routes-list');
  list.innerHTML = '';
  if (!state.routes.length) {
    list.innerHTML = '<p class="empty">Aún no tienes viajes comunes. Rellena los km y pulsa «Guardar como viaje común».</p>';
    return;
  }
  for (const r of state.routes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.innerHTML = `${escapeHTML(r.name)}<small>${fmt(r.km, 1)} km</small>`;
    b.addEventListener('click', () => applyRoute(r));
    list.appendChild(b);
  }
}

// ---------- Resumen ----------
let period = 'week';
let periodOffset = 0;

function periodRange() {
  const now = new Date();
  let start, end, label;
  if (period === 'week') {
    const dow = (now.getDay() + 6) % 7; // lunes = 0
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + periodOffset * 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const f = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    label = `${f(start)} – ${f(end)}`;
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  } else if (period === 'year') {
    start = new Date(now.getFullYear() + periodOffset, 0, 1);
    end = new Date(start.getFullYear(), 11, 31);
    label = String(start.getFullYear());
  } else {
    return { from: '0000-00-00', to: '9999-99-99', label: 'Todos los viajes' };
  }
  return { from: toISO(start), to: toISO(end), label };
}

document.querySelectorAll('#period-picker button').forEach(b => b.addEventListener('click', () => {
  period = b.dataset.period;
  periodOffset = 0;
  document.querySelectorAll('#period-picker button').forEach(x => x.classList.toggle('on', x === b));
  renderSummary();
}));
$('#period-prev').addEventListener('click', () => { periodOffset--; renderSummary(); });
$('#period-next').addEventListener('click', () => { periodOffset++; renderSummary(); });

function renderSummary() {
  const { from, to, label } = periodRange();
  $('#period-label').textContent = label;
  const showNav = period !== 'all';
  $('#period-prev').style.visibility = showNav ? 'visible' : 'hidden';
  $('#period-next').style.visibility = showNav ? 'visible' : 'hidden';

  const trips = state.trips
    .filter(t => t.date >= from && t.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const total = trips.reduce((acc, t) => {
    acc.l += litersOf(t); acc.e += eurosOf(t); acc.km += t.km; return acc;
  }, { l: 0, e: 0, km: 0 });
  $('#sum-liters').textContent = fmt(total.l, 1);
  $('#sum-euros').textContent = fmt(total.e);
  $('#sum-km').textContent = fmt(total.km, 0);

  // Por coche
  const byCar = $('#sum-by-car');
  byCar.innerHTML = '';
  for (const car of state.cars) {
    const ct = trips.filter(t => t.carId === car.id);
    const l = ct.reduce((s, t) => s + litersOf(t), 0);
    const e = ct.reduce((s, t) => s + eurosOf(t), 0);
    const km = ct.reduce((s, t) => s + t.km, 0);
    const pct = total.l > 0 ? (l / total.l) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'car-row';
    row.innerHTML = `
      <span class="dot" style="background:${car.color}"></span>
      <div class="bar-wrap">
        <div><strong>${escapeHTML(car.name)}</strong> <span class="sub">· ${fmt(km, 0)} km</span></div>
        <div class="bar"><div style="width:${pct}%;background:${car.color}"></div></div>
      </div>
      <div class="nums">${fmt(l, 1)} L<br><span class="sub">${fmt(e)} €</span></div>`;
    byCar.appendChild(row);
  }

  // Lista de viajes
  const list = $('#sum-trips');
  list.innerHTML = '';
  if (!trips.length) {
    list.innerHTML = '<li class="empty">No hay viajes en este periodo.</li>';
    return;
  }
  for (const t of trips) {
    const car = carById(t.carId) || { name: '?', color: 'var(--muted)' };
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="dot" style="background:${car.color}"></span>
      <div class="grow">
        <div>${escapeHTML(car.name)} · ${fmt(t.km, 1)} km</div>
        <div class="sub">${prettyDate(t.date)}${t.note ? ' · ' + escapeHTML(t.note) : ''}</div>
      </div>
      <div class="amount">${fmt(litersOf(t))} L<br><span class="sub">${fmt(eurosOf(t))} €</span></div>
      <button type="button" class="btn small danger" aria-label="Borrar">✕</button>`;
    li.querySelector('button').addEventListener('click', () => {
      if (!confirm('¿Borrar este viaje?')) return;
      state.trips = state.trips.filter(x => x.id !== t.id);
      save();
      renderSummary();
    });
    list.appendChild(li);
  }
}

// ---------- Ajustes ----------
function renderSettings() {
  const cars = $('#cars-settings');
  cars.innerHTML = '';
  for (const car of state.cars) {
    const row = document.createElement('div');
    row.className = 'car-setting';
    row.innerHTML = `
      <span class="dot" style="background:${car.color}"></span>
      <span class="name">${escapeHTML(car.name)}</span>
      <input type="number" inputmode="decimal" step="0.1" min="0" value="${car.consumption}" aria-label="Consumo ${escapeHTML(car.name)}">`;
    row.querySelector('input').addEventListener('change', e => {
      const v = num(e.target.value);
      if (v <= 0) { e.target.value = car.consumption; return toast('Consumo no válido'); }
      car.consumption = v;
      save();
      if (car.id === selectedCar) $('#trip-cons').value = v;
      updateResult();
      toast(`${car.name}: ${fmt(v, 1)} L/100 km`);
    });
    cars.appendChild(row);
  }

  $('#default-price').value = state.defaultPrice;

  const routes = $('#routes-settings');
  routes.innerHTML = '';
  if (!state.routes.length) {
    routes.innerHTML = '<li class="empty">No hay viajes comunes guardados.</li>';
  }
  for (const r of state.routes) {
    const car = r.carId ? carById(r.carId) : null;
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="grow">
        <div>${escapeHTML(r.name)}</div>
        <div class="sub">${fmt(r.km, 1)} km${car ? ' · ' + escapeHTML(car.name) : ''}</div>
      </div>
      <button type="button" class="btn small" data-act="edit">Editar</button>
      <button type="button" class="btn small danger" data-act="del" aria-label="Borrar">✕</button>`;
    li.querySelector('[data-act=edit]').addEventListener('click', () => {
      const name = prompt('Nombre', r.name);
      if (name === null) return;
      const km = num(prompt('Kilómetros', r.km));
      if (name.trim()) r.name = name.trim();
      if (km > 0) r.km = km;
      save(); renderSettings(); renderRoutes();
    });
    li.querySelector('[data-act=del]').addEventListener('click', () => {
      if (!confirm(`¿Borrar «${r.name}»?`)) return;
      state.routes = state.routes.filter(x => x.id !== r.id);
      save(); renderSettings(); renderRoutes();
    });
    routes.appendChild(li);
  }
}

$('#default-price').addEventListener('change', e => {
  const v = num(e.target.value);
  if (v <= 0) { e.target.value = state.defaultPrice; return toast('Precio no válido'); }
  state.defaultPrice = v;
  save();
  $('#trip-price').value = v;
  updateResult();
  toast(`Precio: ${fmt(v, 3)} €/L`);
});

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gasolina-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.trips) || !Array.isArray(data.cars)) throw new Error('formato');
    if (!confirm(`Importar ${data.trips.length} viajes? Se reemplazarán los datos actuales.`)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    state = load();
    save();
    selectedCar = state.cars[0].id;
    init();
    renderSettings();
    toast('Datos importados');
  } catch {
    toast('Archivo no válido');
  }
});

// ---------- Inicio ----------
function init() {
  renderCarPicker();
  renderRoutes();
  resetTripForm();
}
init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
