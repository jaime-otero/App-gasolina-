'use strict';

// ---------- Datos ----------
const STORAGE_KEY = 'gasolina.v1';

const DEFAULT_DATA = {
  cars: [
    { id: 'papa', name: 'Papá', consumption: 6.5, color: 'var(--car-papa)' },
    { id: 'mama', name: 'Mamá', consumption: 6.5, color: 'var(--car-mama)' },
    { id: 'rojo', name: 'Rojo', consumption: 6.5, color: 'var(--car-rojo)' },
  ],
  routes: [], // { id, name, km, carId|null }
  trips: [],  // { id, date:'YYYY-MM-DD', carId, km, consumption, note }
  refuels: [], // { id, date:'YYYY-MM-DD', carId, liters, note }
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
const TITLES = { trip: 'Nuevo viaje', refuel: 'Repostaje', summary: 'Resumen', settings: 'Ajustes' };

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  $('#title').textContent = name === 'trip' && editingId ? 'Editar viaje' : TITLES[name];
  if (name === 'refuel') renderRefuel();
  if (name === 'summary') renderSummary();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Nuevo viaje / editar viaje ----------
let selectedCar = state.cars[0].id;
let editingId = null; // id del viaje que se está editando, o null si es nuevo

function renderCarPicker(picker = $('#car-picker'), selected = selectedCar, onSelect = selectCar) {
  picker.innerHTML = '';
  for (const car of state.cars) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = car.name;
    if (car.id === selected) {
      b.classList.add('on');
      b.style.background = car.color;
    }
    b.addEventListener('click', () => onSelect(car.id));
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
  const t = { km: num($('#trip-km').value), consumption: num($('#trip-cons').value) };
  $('#res-liters').textContent = `${fmt(litersOf(t))} L`;
}
['#trip-km', '#trip-cons'].forEach(s => $(s).addEventListener('input', updateResult));

function setEditMode(trip) {
  editingId = trip ? trip.id : null;
  $('#trip-submit').textContent = trip ? 'Guardar cambios' : 'Guardar viaje';
  $('#cancel-edit-btn').hidden = !trip;
  $('#title').textContent = trip ? 'Editar viaje' : TITLES.trip;
}

function editTrip(trip) {
  setEditMode(trip);
  if (carById(trip.carId)) selectedCar = trip.carId;
  renderCarPicker();
  $('#trip-km').value = trip.km;
  $('#trip-cons').value = trip.consumption;
  $('#trip-date').value = trip.date;
  $('#trip-note').value = trip.note || '';
  updateResult();
  showView('trip');
}

$('#cancel-edit-btn').addEventListener('click', () => {
  setEditMode(null);
  resetTripForm();
  showView('summary');
});

function resetTripForm() {
  $('#trip-km').value = '';
  $('#trip-note').value = '';
  $('#trip-date').value = todayISO();
  $('#trip-cons').value = carById(selectedCar).consumption;
  updateResult();
}

$('#trip-form').addEventListener('submit', e => {
  e.preventDefault();
  const km = num($('#trip-km').value);
  const consumption = num($('#trip-cons').value);
  if (km <= 0) return toast('Pon los kilómetros');
  if (consumption <= 0) return toast('Pon el consumo');
  const fields = {
    date: $('#trip-date').value || todayISO(),
    carId: selectedCar,
    km,
    consumption,
    note: $('#trip-note').value.trim(),
  };
  const existing = editingId && state.trips.find(t => t.id === editingId);
  if (existing) {
    Object.assign(existing, fields);
    save();
    toast(`Viaje actualizado: ${fmt(litersOf(existing))} L`);
    setEditMode(null);
    resetTripForm();
    showView('summary');
    return;
  }
  const trip = { id: uid(), ...fields };
  state.trips.push(trip);
  save();
  toast(`Guardado: ${fmt(litersOf(trip))} L`);
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

// ---------- Repostaje ----------
let refuelCar = state.cars[0].id;
let refuelEditingId = null; // id del repostaje que se está editando, o null si es nuevo

function selectRefuelCar(id) {
  refuelCar = id;
  renderCarPicker($('#refuel-car-picker'), refuelCar, selectRefuelCar);
}

function setRefuelEditMode(r) {
  refuelEditingId = r ? r.id : null;
  $('#refuel-submit').textContent = r ? 'Guardar cambios' : 'Guardar repostaje';
  $('#refuel-cancel-btn').hidden = !r;
}

function resetRefuelForm() {
  $('#refuel-liters').value = '';
  $('#refuel-note').value = '';
  $('#refuel-date').value = todayISO();
}

function editRefuel(r) {
  setRefuelEditMode(r);
  if (carById(r.carId)) refuelCar = r.carId;
  renderCarPicker($('#refuel-car-picker'), refuelCar, selectRefuelCar);
  $('#refuel-liters').value = r.liters;
  $('#refuel-date').value = r.date;
  $('#refuel-note').value = r.note || '';
  window.scrollTo(0, 0);
}

$('#refuel-cancel-btn').addEventListener('click', () => {
  setRefuelEditMode(null);
  resetRefuelForm();
});

$('#refuel-form').addEventListener('submit', e => {
  e.preventDefault();
  const liters = num($('#refuel-liters').value);
  if (liters <= 0) return toast('Pon los litros');
  const fields = {
    date: $('#refuel-date').value || todayISO(),
    carId: refuelCar,
    liters,
    note: $('#refuel-note').value.trim(),
  };
  const existing = refuelEditingId && state.refuels.find(r => r.id === refuelEditingId);
  if (existing) {
    Object.assign(existing, fields);
    toast(`Repostaje actualizado: ${fmt(liters)} L`);
  } else {
    state.refuels.push({ id: uid(), ...fields });
    toast(`Repostado: ${fmt(liters)} L`);
  }
  save();
  setRefuelEditMode(null);
  resetRefuelForm();
  renderRefuel();
});

// Gráfica de litros acumulados: gastado (viajes) frente a repuesto (repostajes)
function balanceChart(trips, refuels) {
  const events = [
    ...trips.map(t => ({ date: t.date, spent: litersOf(t), refill: 0 })),
    ...refuels.map(r => ({ date: r.date, spent: 0, refill: r.liters })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return '<p class="empty chart-empty">Sin datos todavía.</p>';

  // Un punto por día con los totales acumulados
  const days = [];
  let spent = 0, refill = 0;
  for (const ev of events) {
    spent += ev.spent; refill += ev.refill;
    const last = days[days.length - 1];
    if (last && last.date === ev.date) { last.spent = spent; last.refill = refill; }
    else days.push({ date: ev.date, spent, refill });
  }

  const DAY = 864e5;
  const t0 = parseISO(days[0].date).getTime();
  const lastDate = days[days.length - 1].date;
  const endDate = todayISO() > lastDate ? todayISO() : lastDate;
  const t1 = Math.max(parseISO(endDate).getTime(), t0 + DAY);
  const yMax = Math.max(spent, refill, 1) * 1.1;

  const W = 320, H = 150, L = 34, R = 8, T = 10, B = 22;
  const x = d => L + (parseISO(d).getTime() - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (1 - v / yMax) * (H - T - B);

  // Línea escalonada: el total se mantiene hasta el siguiente día con datos
  const path = key => {
    let d = `M${x(days[0].date).toFixed(1)},${y(0).toFixed(1)}`;
    for (const p of days) d += `H${x(p.date).toFixed(1)}V${y(p[key]).toFixed(1)}`;
    return d + `H${x(endDate).toFixed(1)}`;
  };

  const short = s => parseISO(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const grid = [0, 0.5, 1].map(f => {
    const v = yMax / 1.1 * f;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>
      <text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v, 0)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Litros gastados y repuestos">
    ${grid}
    <text x="${L}" y="${H - 6}">${short(days[0].date)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${short(endDate)}</text>
    <path d="${path('refill')}" class="line refill"/>
    <path d="${path('spent')}" class="line spent"/>
  </svg>`;
}

function balanceCard(title, color, trips, refuels) {
  const spent = trips.reduce((s, t) => s + litersOf(t), 0);
  const refill = refuels.reduce((s, r) => s + r.liters, 0);
  const diff = refill - spent;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${color ? `<span class="dot" style="background:${color}"></span>` : ''}${escapeHTML(title)}</h2>
    ${balanceChart(trips, refuels)}
    <div class="counters">
      <div class="spent"><strong>${fmt(spent, 1)}</strong><small>L gastados</small></div>
      <div class="refill"><strong>${fmt(refill, 1)}</strong><small>L repuestos</small></div>
      <div><strong>${diff > 0 ? '+' : ''}${fmt(diff, 1)}</strong><small>diferencia</small></div>
    </div>`;
  return card;
}

function renderRefuel() {
  renderCarPicker($('#refuel-car-picker'), refuelCar, selectRefuelCar);

  const charts = $('#refuel-charts');
  charts.innerHTML = '';
  charts.appendChild(balanceCard('Total', null, state.trips, state.refuels));
  for (const car of state.cars) {
    charts.appendChild(balanceCard(car.name, car.color,
      state.trips.filter(t => t.carId === car.id),
      state.refuels.filter(r => r.carId === car.id)));
  }

  const list = $('#refuel-list');
  list.innerHTML = '';
  const refuels = [...state.refuels].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if (!refuels.length) {
    list.innerHTML = '<li class="empty">Aún no hay repostajes.</li>';
    return;
  }
  for (const r of refuels) {
    const car = carById(r.carId) || { name: '?', color: 'var(--muted)' };
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="dot" style="background:${car.color}"></span>
      <div class="grow">
        <div>${escapeHTML(car.name)}</div>
        <div class="sub">${prettyDate(r.date)}${r.note ? ' · ' + escapeHTML(r.note) : ''}</div>
      </div>
      <div class="amount">${fmt(r.liters)} L</div>
      <button type="button" class="btn small" data-act="edit" aria-label="Editar">✎</button>
      <button type="button" class="btn small danger" data-act="del" aria-label="Borrar">✕</button>`;
    li.querySelector('.grow').addEventListener('click', () => editRefuel(r));
    li.querySelector('[data-act=edit]').addEventListener('click', () => editRefuel(r));
    li.querySelector('[data-act=del]').addEventListener('click', () => {
      if (!confirm('¿Borrar este repostaje?')) return;
      if (refuelEditingId === r.id) { setRefuelEditMode(null); resetRefuelForm(); }
      state.refuels = state.refuels.filter(x => x.id !== r.id);
      save();
      renderRefuel();
    });
    list.appendChild(li);
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
    acc.l += litersOf(t); acc.km += t.km; return acc;
  }, { l: 0, km: 0 });
  $('#sum-liters').textContent = fmt(total.l, 1);
  $('#sum-km').textContent = fmt(total.km, 0);

  // Por coche
  const byCar = $('#sum-by-car');
  byCar.innerHTML = '';
  for (const car of state.cars) {
    const ct = trips.filter(t => t.carId === car.id);
    const l = ct.reduce((s, t) => s + litersOf(t), 0);
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
      <div class="nums">${fmt(l, 1)} L</div>`;
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
      <div class="amount">${fmt(litersOf(t))} L<br><span class="sub">${fmt(t.consumption, 1)} L/100</span></div>
      <button type="button" class="btn small" data-act="edit" aria-label="Editar">✎</button>
      <button type="button" class="btn small danger" data-act="del" aria-label="Borrar">✕</button>`;
    li.querySelector('.grow').addEventListener('click', () => editTrip(t));
    li.querySelector('[data-act=edit]').addEventListener('click', () => editTrip(t));
    li.querySelector('[data-act=del]').addEventListener('click', () => {
      if (!confirm('¿Borrar este viaje?')) return;
      if (editingId === t.id) { setEditMode(null); resetTripForm(); }
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
    if (!confirm(`¿Importar ${data.trips.length} viajes? Se reemplazarán los datos actuales.`)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    state = load();
    save();
    selectedCar = refuelCar = state.cars[0].id;
    init();
    renderSettings();
    toast('Datos importados');
  } catch {
    toast('Archivo no válido');
  }
});

// ---------- Deslizar hacia abajo para recargar ----------
(function pullToRefresh() {
  const el = $('#ptr');
  const icon = el.querySelector('.ptr-icon');
  const THRESHOLD = 70; // px que hay que bajar para recargar
  let startY = null, dist = 0;

  function place(d, anim) {
    el.classList.toggle('anim', anim);
    el.style.transform = `translateY(${d - 60}px)`;
    el.style.opacity = Math.min(d / THRESHOLD, 1);
  }

  window.addEventListener('touchstart', e => {
    // Solo si estamos arriba del todo y no se toca un campo de texto
    if (window.scrollY > 0 || e.touches.length !== 1 || e.target.closest('input, textarea, select')) return;
    startY = e.touches[0].clientY;
    dist = 0;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { dist = 0; place(0, false); return; }
    dist = Math.min(dy * 0.5, 120); // resistencia al tirar
    if (e.cancelable) e.preventDefault(); // evita el rebote nativo mientras tiramos
    place(dist, false);
    el.classList.toggle('ready', dist >= THRESHOLD);
    icon.textContent = '↓';
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (startY === null) return;
    startY = null;
    if (dist >= THRESHOLD) {
      el.classList.remove('ready');
      el.classList.add('loading');
      icon.textContent = '↻';
      place(THRESHOLD, true);
      // Busca también una versión nueva de la app antes de recargar
      const update = navigator.serviceWorker && navigator.serviceWorker.getRegistration
        ? navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {})
        : Promise.resolve();
      Promise.race([update, new Promise(r => setTimeout(r, 1500))]).then(() => location.reload());
    } else {
      el.classList.remove('ready');
      place(0, true);
    }
    dist = 0;
  });
})();

// ---------- Inicio ----------
function init() {
  renderCarPicker();
  renderRoutes();
  resetTripForm();
  resetRefuelForm();
}
init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

// Pide al navegador que no borre los datos guardados aunque falte espacio
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
