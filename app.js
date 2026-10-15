'use strict';

// ---------- Datos ----------
const STORAGE_KEY = 'gasolina.v1';

const DEFAULT_DATA = {
  cars: [
    { id: 'papa', name: 'Papá', consumption: 6.5, color: 'var(--car-papa)' },
    { id: 'mama', name: 'Mamá', consumption: 6.5, color: 'var(--car-mama)' },
    { id: 'rojo', name: 'Rojo', consumption: 6.5, color: 'var(--car-rojo)' },
  ],
  routes: [], // { id, name, km, carId|null, from, to, roundTrip }
  trips: [],  // { id, date:'YYYY-MM-DD', carId, km, consumption, note, from, to, roundTrip }
  refuels: [], // { id, date:'YYYY-MM-DD', carId, liters, note }
  places: [], // lugares favoritos: { id, name, label, place: {placeId} | {lat, lon} | null }
  mapsApp: /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'apple' : 'google',
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
// km a mano: ya no son los del mapa
$('#trip-km').addEventListener('input', () => { legs = null; hideRouteMap(); });

// Ida / ida y vuelta. Los km del formulario son siempre el total del viaje.
// Si se calcularon con el mapa, la vuelta es su propia ruta (puede no medir lo mismo);
// si se pusieron a mano, al cambiar de modo se duplican o se dividen entre dos.
let roundTrip = false;
function setRoundTrip(on, adjustKm = false) {
  on = !!on;
  const changed = on !== roundTrip;
  roundTrip = on;
  document.querySelectorAll('#trip-kind button').forEach(b => b.classList.toggle('on', (b.dataset.round === '1') === on));
  if (adjustKm && changed) {
    if (legs && (!on || legs.back)) {
      showLegs();
    } else {
      const km = num($('#trip-km').value);
      if (km > 0) $('#trip-km').value = Math.round((on ? km * 2 : km / 2) * 10) / 10;
      // Falta la vuelta: de momento ×2, y se cambia por la de verdad si se puede calcular
      if (legs) calcKm();
    }
  }
  updateResult();
}
document.querySelectorAll('#trip-kind button').forEach(b =>
  b.addEventListener('click', () => setRoundTrip(b.dataset.round === '1', true)));

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
  setRouteFields(trip.from, trip.to);
  setRoundTrip(trip.roundTrip);
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
  setRouteFields('', '');
  setRoundTrip(false);
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
    from: $('#trip-from').value.trim(),
    to: $('#trip-to').value.trim(),
    roundTrip,
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
  const from = $('#trip-from').value.trim();
  const to = $('#trip-to').value.trim();
  const suggested = $('#trip-note').value.trim() || routeText({ from, to });
  const name = prompt('Nombre del viaje común (ej: Casa → Trabajo)', suggested);
  if (!name || !name.trim()) return;
  state.routes.push({ id: uid(), name: name.trim(), km, carId: selectedCar, from, to, roundTrip });
  save();
  renderRoutes();
  toast('Viaje común guardado');
});

function applyRoute(route) {
  if (route.carId && carById(route.carId)) selectCar(route.carId);
  $('#trip-km').value = route.km;
  $('#trip-note').value = route.name;
  setRouteFields(route.from, route.to);
  setRoundTrip(route.roundTrip);
  toast(`${route.name}: ${fmt(route.km, 1)} km${route.roundTrip ? ' (ida y vuelta)' : ''}`);
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
    b.innerHTML = `${escapeHTML(r.name)}<small>${r.roundTrip ? '🔁 ' : ''}${fmt(r.km, 1)} km</small>`;
    b.addEventListener('click', () => applyRoute(r));
    list.appendChild(b);
  }
}

// ---------- Mapas: calcular km y abrir la ruta ----------
// Con clave de Google (Ajustes), sugerencias con Places y km con Routes, como en Google Maps.
// Sin clave, o si Google falla, direcciones con OpenStreetMap (Nominatim) y distancia con OSRM,
// gratuitos y sin clave. Todo necesita conexión.
const routeText = r => [r.from, r.to].filter(Boolean).join(' → ');

// Sitio exacto de «📍 Mi ubicación» o de una sugerencia elegida: { lat, lon } o, si viene
// de Google, { placeId }. Vale mientras no se cambie el texto del campo.
let fromPlace = null;
let toPlace = null;
// Rutas calculadas para los campos actuales: { go, back|null }. Se olvidan al cambiar
// Desde, Hasta o los km a mano.
let legs = null;

function setRouteFields(from, to) {
  $('#trip-from').value = from || '';
  $('#trip-to').value = to || '';
  fromPlace = toPlace = null;
  legs = null;
  hideRouteMap();
  updateFavButtons();
}
$('#trip-from').addEventListener('input', () => { fromPlace = null; legs = null; hideRouteMap(); });
$('#trip-to').addEventListener('input', () => { toPlace = null; legs = null; hideRouteMap(); });

// ---------- Google (opcional) ----------
// La clave va aparte de los datos para que no salga en las copias exportadas.
const GOOGLE_KEY = 'gasolina.googleKey';
const GOOGLE_COUNT = 'gasolina.googleCount';
// Tope propio por día, por debajo de lo gratis al mes (5.000 rutas y 10.000 sugerencias)
const GOOGLE_LIMITS = { routes: 50, places: 200 };

function googleKey() {
  try { return localStorage.getItem(GOOGLE_KEY) || ''; } catch { return ''; }
}

function googleCount() {
  try {
    const c = JSON.parse(localStorage.getItem(GOOGLE_COUNT));
    if (c && c.date === todayISO()) return c;
  } catch { /* contador ilegible: empieza de cero */ }
  return { date: todayISO(), routes: 0, places: 0 };
}

// Apunta una llamada a Google si hay clave y no se ha llegado al tope de hoy
function useGoogle(kind) {
  if (!googleKey()) return false;
  const c = googleCount();
  if (c[kind] >= GOOGLE_LIMITS[kind]) return false;
  c[kind]++;
  try { localStorage.setItem(GOOGLE_COUNT, JSON.stringify(c)); } catch { return false; } // sin contador no se arriesga
  return true;
}

async function googlePost(url, body, fieldMask, signal) {
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey() };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  const res = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(body), signal,
    // Manda la URL completa de la app, para que valga la restricción de la clave a esta web
    referrerPolicy: 'no-referrer-when-downgrade',
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  return res.json();
}

// Escribir y elegir una sugerencia es una sesión; se renueva al elegir
let placesSession = null;
async function googleSuggest(text, signal) {
  placesSession ||= crypto.randomUUID ? crypto.randomUUID() : uid();
  const body = { input: text, sessionToken: placesSession, languageCode: 'es', regionCode: 'es' };
  if (fromPlace?.lat != null) {
    body.locationBias = { circle: { center: { latitude: fromPlace.lat, longitude: fromPlace.lon }, radius: 50000 } };
  }
  const { suggestions = [] } = await googlePost('https://places.googleapis.com/v1/places:autocomplete', body, null, signal);
  return suggestions.map(s => s.placePrediction).filter(Boolean).map(p => {
    const main = p.structuredFormat?.mainText?.text || p.text?.text || '';
    const detail = (p.structuredFormat?.secondaryText?.text || '').replace(/, España$/, '');
    return { main, detail, label: [main, detail].filter(Boolean).join(', '), point: { placeId: p.placeId }, google: true };
  }).filter(s => s.main && s.point.placeId);
}

async function googleRoute(a, b) {
  const waypoint = p => p.placeId ? { placeId: p.placeId }
    : p.lat != null ? { location: { latLng: { latitude: p.lat, longitude: p.lon } } }
    : { address: p.address };
  const data = await googlePost('https://routes.googleapis.com/directions/v2:computeRoutes', {
    origin: waypoint(a), destination: waypoint(b),
    travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
    polylineEncoding: 'GEO_JSON_LINESTRING', languageCode: 'es-ES', units: 'METRIC',
  }, 'routes.distanceMeters,routes.polyline.geoJsonLinestring');
  const r = data.routes?.[0];
  if (!r?.distanceMeters) return null;
  return { km: r.distanceMeters / 1000, coords: r.polyline?.geoJsonLinestring?.coordinates || [], source: 'Google' };
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const geocodeCache = new Map();
async function geocode(text) {
  const key = text.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  // viewbox de España con bounded=0: prefiere resultados de aquí sin excluir el resto
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es'
    + '&viewbox=-9.6,44.0,4.6,35.8&bounded=0&q=' + encodeURIComponent(text);
  const [hit] = await getJSON(url);
  if (!hit) return null;
  const point = { lat: +hit.lat, lon: +hit.lon };
  geocodeCache.set(key, point);
  return point;
}

async function reverseGeocode({ lat, lon }) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${lat}&lon=${lon}`;
  const { address: a = {}, display_name } = await getJSON(url);
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const town = a.city || a.town || a.village || a.municipality;
  return [street, town].filter(Boolean).join(', ') || display_name;
}

// Distancia por carretera y el trazado de la ruta ([lon, lat] por punto) para el mapa
async function drivingRoute(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  const data = await getJSON(url);
  if (data.code !== 'Ok' || !data.routes.length) return null;
  const [r] = data.routes;
  return { km: r.distance / 1000, coords: r.geometry.coordinates, source: 'OpenStreetMap' };
}

// Sugerencias mientras se escribe: Google si hay clave, si no Photon (OpenStreetMap)
async function suggestPlaces(text, signal) {
  if (useGoogle('places')) {
    try {
      return await googleSuggest(text, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      /* falla Google: sigue con Photon */
    }
  }
  return photonSuggest(text, signal);
}

// Photon (OpenStreetMap): gratis y sin clave
async function photonSuggest(text, signal) {
  // Prioriza lo cercano al origen ya elegido, o si no, el centro de España
  const near = fromPlace?.lat != null ? fromPlace : { lat: 40.4, lon: -3.7 };
  const url = `https://photon.komoot.io/api/?limit=5&lat=${near.lat}&lon=${near.lon}&q=` + encodeURIComponent(text);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { features = [] } = await res.json();
  const seen = new Set();
  return features.map(({ geometry, properties: p }) => {
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const main = p.name || street || p.city;
    const town = p.city || p.town || p.village || p.county;
    const detail = [p.name && street, town !== main && town, p.state].filter(Boolean).join(', ');
    const label = [main, town !== main && town].filter(Boolean).join(', ');
    const [lon, lat] = geometry.coordinates;
    return { main, detail, label, point: { lat, lon } };
  }).filter(s => s.main && !seen.has(s.label + s.detail) && seen.add(s.label + s.detail));
}

function setupSuggest(input, list, onPick) {
  let items = [];
  let active = -1;
  let timer = 0;
  let ctrl = null;
  const close = () => { list.hidden = true; items = []; active = -1; };
  const highlight = i => {
    active = i;
    [...list.children].forEach((li, j) => li.classList.toggle('on', j === i));
  };
  const pick = s => {
    input.value = s.label;
    onPick(s.point || null);
    placesSession = null;
    close();
    updateFavButtons();
  };
  const show = next => {
    items = next;
    if (document.activeElement !== input || !items.length) return close();
    list.innerHTML = items.map(s =>
      `<li role="option"${s.fav ? ' class="fav"' : ''}>${escapeHTML(s.main)}${s.detail ? `<small>${escapeHTML(s.detail)}</small>` : ''}</li>`).join('');
    [...list.children].forEach((li, i) => {
      // pointerdown + preventDefault para que el campo no pierda el foco antes del toque
      li.addEventListener('pointerdown', e => { e.preventDefault(); pick(items[i]); });
    });
    if (items.some(s => s.google)) list.insertAdjacentHTML('beforeend', '<li class="suggest-by" aria-hidden="true">con Google</li>');
    active = -1;
    list.hidden = false;
  };
  // Favoritos que encajan con lo escrito (todos si el campo está vacío)
  const favItems = text => {
    const t = text.toLowerCase();
    return state.places
      .filter(f => !t || f.name.toLowerCase().includes(t) || f.label.toLowerCase().includes(t))
      .map(f => ({ main: `⭐ ${f.name}`, detail: f.label !== f.name ? f.label : '', label: f.label, point: f.place, fav: true }));
  };
  const refresh = () => {
    clearTimeout(timer);
    ctrl?.abort();
    const text = input.value.trim();
    const favs = favItems(text);
    if (text.length < 3 || !navigator.onLine) return show(favs);
    show(favs);
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      let found;
      try {
        found = await suggestPlaces(text, ctrl.signal);
      } catch { return; /* sin conexión o cancelada: se quedan los favoritos */ }
      const seen = new Set(favs.map(f => f.label));
      show([...favs, ...found.filter(s => !seen.has(s.label))]);
    }, 300);
  };
  input.addEventListener('input', refresh);
  input.addEventListener('focus', () => { if (!input.value.trim()) refresh(); });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      highlight(e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n);
    } else if (e.key === 'Enter' && active >= 0) {
      pick(items[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => { clearTimeout(timer); ctrl?.abort(); close(); });
}
setupSuggest($('#trip-from'), $('#trip-from-suggest'), p => { fromPlace = p; legs = null; hideRouteMap(); });
setupSuggest($('#trip-to'), $('#trip-to-suggest'), p => { toPlace = p; legs = null; hideRouteMap(); });

// ---------- Lugares favoritos ----------
// Se guarda el texto del campo y, si lo hay, el sitio exacto (de Google solo su id,
// que se puede guardar sin límite; de OpenStreetMap o de «📍», las coordenadas).
const favOf = label => state.places.find(f => f.label.toLowerCase() === label.trim().toLowerCase());

function updateFavButtons() {
  for (const [btn, input] of [[$('#fav-from-btn'), $('#trip-from')], [$('#fav-to-btn'), $('#trip-to')]]) {
    const on = !!(input.value.trim() && favOf(input.value));
    btn.textContent = on ? '★' : '☆';
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-label', on ? 'Ya está en favoritos' : 'Guardar en favoritos');
  }
}

function saveFavorite(input, place) {
  const label = input.value.trim();
  if (!label) return toast('Escribe o elige un sitio primero');
  const existing = favOf(label);
  if (existing) return toast(`Ya está en favoritos como «${existing.name}»`);
  const name = prompt('Nombre del favorito (ej: Casa, Uni)', label.split(',')[0]);
  if (!name || !name.trim()) return;
  state.places.push({ id: uid(), name: name.trim(), label, place: place || null });
  save();
  updateFavButtons();
  toast(`⭐ ${name.trim()} guardado`);
}
$('#fav-from-btn').addEventListener('click', () => saveFavorite($('#trip-from'), fromPlace));
$('#fav-to-btn').addEventListener('click', () => saveFavorite($('#trip-to'), toPlace));
['#trip-from', '#trip-to'].forEach(s => $(s).addEventListener('input', updateFavButtons));

function busy(btn, label) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  return () => { btn.disabled = false; btn.textContent = old; };
}

$('#locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Este móvil no da la ubicación');
  const done = busy($('#locate-btn'), '⏳');
  navigator.geolocation.getCurrentPosition(async pos => {
    const point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    let label = 'Mi ubicación';
    try { label = await reverseGeocode(point); } catch { /* sin conexión: basta con las coordenadas */ }
    $('#trip-from').value = label;
    fromPlace = point;
    legs = null;
    hideRouteMap();
    updateFavButtons();
    done();
    $('#trip-to').focus();
  }, () => {
    done();
    toast('No se pudo obtener la ubicación');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});

// Error con un mensaje que se puede enseñar tal cual
const routeError = msg => Object.assign(new Error(msg), { shown: true });

// Ruta en coche de a hasta b ({ text, place }): con Google si se puede, si no con OSRM
async function findRoute(a, b) {
  if (useGoogle('routes')) {
    try {
      const route = await googleRoute(a.place || { address: a.text }, b.place || { address: b.text });
      if (route) return route;
    } catch { /* falla Google: se calcula con OpenStreetMap */ }
  }
  const pa = a.place?.lat != null ? a.place : await geocode(a.text);
  if (!pa) throw routeError(`No encuentro «${a.text}»`);
  const pb = b.place?.lat != null ? b.place : await geocode(b.text);
  if (!pb) throw routeError(`No encuentro «${b.text}»`);
  const route = await drivingRoute(pa, pb);
  if (!route) throw routeError('No hay ruta en coche entre esos sitios');
  return route;
}

// Pone en el formulario y en el mapa los km de las rutas calculadas; devuelve el total
function showLegs() {
  const back = roundTrip ? legs.back : null;
  const total = legs.go.km + (back ? back.km : 0);
  $('#trip-km').value = Math.round(total * 10) / 10;
  updateResult();
  showRouteMap(legs.go, back);
  return total;
}

async function calcKm() {
  const btn = $('#calc-km-btn');
  if (btn.disabled) return; // ya se está calculando
  const from = $('#trip-from').value.trim();
  const to = $('#trip-to').value.trim();
  if (!from || !to) return toast('Pon desde dónde y hasta dónde');
  if (!navigator.onLine) return toast('Sin conexión: pon los km a mano');
  const done = busy(btn, '⏳ Calculando…');
  try {
    const a = { text: from, place: fromPlace };
    const b = { text: to, place: toPlace };
    // Si la ida ya está calculada para estos mismos campos, no se vuelve a pedir
    // Cada trayecto a una décima, para que ida + vuelta cuadre con lo que se ve
    const leg = route => ({ ...route, km: Math.round(route.km * 10) / 10 });
    const go = legs?.go || leg(await findRoute(a, b));
    const back = roundTrip ? legs?.back || leg(await findRoute(b, a)) : legs?.back || null;
    legs = { go, back };
    const total = showLegs();
    toast(roundTrip
      ? `Ida ${fmt(go.km, 1)} + vuelta ${fmt(back.km, 1)} = ${fmt(total, 1)} km`
      : `${fmt(go.km, 1)} km por carretera`);
  } catch (e) {
    toast(e.shown ? e.message : 'No se pudo calcular: pon los km a mano');
  } finally {
    done();
  }
}
$('#calc-km-btn').addEventListener('click', calcKm);

// Intro en «Desde» pasa a «Hasta»; en «Hasta» calcula en vez de guardar el viaje
$('#trip-from').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('#trip-to').focus(); }
});
$('#trip-to').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); calcKm(); }
});

function openMaps(from, to) {
  if (!to) return toast('Pon al menos el destino');
  const q = encodeURIComponent;
  const url = state.mapsApp === 'apple'
    ? `https://maps.apple.com/?${from ? `saddr=${q(from)}&` : ''}daddr=${q(to)}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1${from ? `&origin=${q(from)}` : ''}&destination=${q(to)}&travelmode=driving`;
  window.open(url, '_blank');
}
function openFormInMaps() {
  // Con «📍» se manda la posición exacta en vez del texto aproximado
  const from = fromPlace?.lat != null ? `${fromPlace.lat},${fromPlace.lon}` : $('#trip-from').value.trim();
  openMaps(from, $('#trip-to').value.trim());
}
$('#open-maps-btn').addEventListener('click', openFormInMaps);

// Ventanita con el mapa de la ruta tras «Calcular km». Usa Leaflet con mapas de
// OpenStreetMap: gratis y sin clave. Se carga solo la primera vez que hace falta.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletLoading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET + 'leaflet.min.css';
    css.integrity = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
    css.crossOrigin = 'anonymous';
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.min.js';
    js.integrity = 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==';
    js.crossOrigin = 'anonymous';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletLoading = null; js.remove(); reject(new Error('leaflet')); };
    document.head.append(css, js);
  });
}

let routeMap = null;
let routeLayer = null;
let routeMapToken = 0; // descarta un mapa que llega tarde si la ruta ya cambió

function hideRouteMap() {
  routeMapToken++;
  $('#route-map-box').hidden = true;
}

// Ida en línea continua y, si la hay, vuelta en discontinua de otro color
async function showRouteMap(go, back = null) {
  const token = ++routeMapToken;
  if (go.coords.length < 2) return hideRouteMap();
  let L;
  try { L = await loadLeaflet(); } catch { return; /* sin mapa: los km ya están */ }
  if (token !== routeMapToken) return;
  const box = $('#route-map-box');
  box.hidden = false;
  $('#route-map-km').textContent = `${fmt(go.km + (back ? back.km : 0), 1)} km`;
  const sources = [...new Set([go.source, back?.source].filter(Boolean))].join(' y ');
  $('#route-map-src').textContent = back
    ? `ida ${fmt(go.km, 1)} · vuelta ${fmt(back.km, 1)} · ${sources}`
    : `Ruta: ${sources}`;
  if (!routeMap) {
    // Solo para mirar: así no se engancha al hacer scroll. Al tocarlo se abre en Mapas.
    routeMap = L.map('route-map', {
      zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false,
    });
    routeMap.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(routeMap);
  }
  routeLayer?.remove();
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#0f766e';
  const toLatLngs = coords => coords.map(([lon, lat]) => [lat, lon]);
  const latlngs = toLatLngs(go.coords);
  const lines = [L.polyline(latlngs, { color: accent, weight: 5, opacity: .9 })];
  if (back?.coords.length > 1) {
    const color = css.getPropertyValue('--spent').trim() || '#ea580c';
    lines.push(L.polyline(toLatLngs(back.coords), { color, weight: 4, opacity: .9, dashArray: '8 8' }));
  }
  const dot = (p, fill) => L.circleMarker(p, { radius: 7, color: '#fff', weight: 3, fillColor: fill, fillOpacity: 1 });
  routeLayer = L.layerGroup([...lines, dot(latlngs[0], accent), dot(latlngs[latlngs.length - 1], css.getPropertyValue('--danger').trim() || '#b91c1c')]).addTo(routeMap);
  routeMap.invalidateSize();
  routeMap.fitBounds(L.featureGroup(lines).getBounds(), { padding: [24, 24] });
}

$('#route-map-box').addEventListener('click', openFormInMaps);
$('#route-map-close').addEventListener('click', e => { e.stopPropagation(); hideRouteMap(); });

document.querySelectorAll('#maps-picker button').forEach(b => b.addEventListener('click', () => {
  state.mapsApp = b.dataset.maps;
  save();
  renderSettings();
}));

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
function balanceChart(trips, refuels, range) {
  const events = [
    ...trips.map(t => ({ date: t.date, spent: litersOf(t), refill: 0 })),
    ...refuels.map(r => ({ date: r.date, spent: 0, refill: r.liters })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return `<p class="empty chart-empty">${range ? 'Sin datos en este periodo.' : 'Sin datos todavía.'}</p>`;

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
  // Con periodo, el eje va del inicio del periodo hasta hoy (o su final si ya pasó)
  const startDate = range ? range.from : days[0].date;
  const t0 = parseISO(startDate).getTime();
  const lastDate = days[days.length - 1].date;
  let endDate = todayISO() > lastDate ? todayISO() : lastDate;
  if (range && endDate > range.to) endDate = range.to;
  const t1 = Math.max(parseISO(endDate).getTime(), t0 + DAY);
  const yMax = Math.max(spent, refill, 1) * 1.1;

  const W = 320, H = 150, L = 34, R = 8, T = 10, B = 22;
  const x = d => L + (parseISO(d).getTime() - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (1 - v / yMax) * (H - T - B);

  // Línea escalonada: el total se mantiene hasta el siguiente día con datos
  const path = key => {
    let d = `M${x(startDate).toFixed(1)},${y(0).toFixed(1)}`;
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
    <text x="${L}" y="${H - 6}">${short(startDate)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${short(endDate)}</text>
    <path d="${path('refill')}" class="line refill"/>
    <path d="${path('spent')}" class="line spent"/>
  </svg>`;
}

function balanceCard(title, color, trips, refuels, range) {
  const spent = trips.reduce((s, t) => s + litersOf(t), 0);
  const refill = refuels.reduce((s, r) => s + r.liters, 0);
  const diff = refill - spent;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${color ? `<span class="dot" style="background:${color}"></span>` : ''}${escapeHTML(title)}</h2>
    ${balanceChart(trips, refuels, range)}
    <div class="counters">
      <div class="spent"><strong>${fmt(spent, 1)}</strong><small>L gastados</small></div>
      <div class="refill"><strong>${fmt(refill, 1)}</strong><small>L repuestos</small></div>
      <div><strong>${diff > 0 ? '+' : ''}${fmt(diff, 1)}</strong><small>diferencia</small></div>
    </div>`;
  return card;
}

// Gráfica que se ve: 'all' (total) o el id de un coche
let chartCar = 'all';

function renderChartPicker() {
  const picker = $('#chart-picker');
  picker.innerHTML = '';
  const options = [{ id: 'all', name: 'Total', color: 'var(--accent)' }, ...state.cars];
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.name;
    if (opt.id === chartCar) {
      b.classList.add('on');
      b.style.background = opt.color;
    }
    b.addEventListener('click', () => { chartCar = opt.id; renderCharts(); });
    picker.appendChild(b);
  }
}

// Periodo de la gráfica: 'month', 'year' o 'all', con desplazamiento como en el Resumen
let chartPeriod = 'month';
let chartOffset = 0;

document.querySelectorAll('#chart-period button').forEach(b => b.addEventListener('click', () => {
  chartPeriod = b.dataset.period;
  chartOffset = 0;
  renderCharts();
}));
$('#chart-prev').addEventListener('click', () => { chartOffset--; renderCharts(); });
$('#chart-next').addEventListener('click', () => { chartOffset++; renderCharts(); });

function renderCharts() {
  if (chartCar !== 'all' && !carById(chartCar)) chartCar = 'all';
  renderChartPicker();

  document.querySelectorAll('#chart-period button').forEach(b => b.classList.toggle('on', b.dataset.period === chartPeriod));
  const { from, to, label } = periodRange(chartPeriod, chartOffset);
  const showNav = chartPeriod !== 'all';
  $('#chart-period-label').textContent = showNav ? label : 'Desde el principio';
  $('#chart-prev').style.visibility = showNav ? 'visible' : 'hidden';
  $('#chart-next').style.visibility = showNav ? 'visible' : 'hidden';
  const range = showNav ? { from, to } : null;
  const inRange = x => x.date >= from && x.date <= to;

  const car = carById(chartCar);
  const trips = state.trips.filter(t => inRange(t) && (!car || t.carId === car.id));
  const refuels = state.refuels.filter(r => inRange(r) && (!car || r.carId === car.id));
  const charts = $('#refuel-charts');
  charts.innerHTML = '';
  charts.appendChild(car
    ? balanceCard(car.name, car.color, trips, refuels, range)
    : balanceCard('Total', null, trips, refuels, range));
}

function renderRefuel() {
  renderCarPicker($('#refuel-car-picker'), refuelCar, selectRefuelCar);
  renderCharts();

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

function periodRange(period, periodOffset) {
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
  const { from, to, label } = periodRange(period, periodOffset);
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
        <div>${escapeHTML(car.name)} · ${fmt(t.km, 1)} km${t.roundTrip ? ' · 🔁' : ''}</div>
        <div class="sub">${prettyDate(t.date)}${t.note || t.from ? ' · ' + escapeHTML(t.note || routeText(t)) : ''}</div>
      </div>
      <div class="amount">${fmt(litersOf(t))} L<br><span class="sub">${fmt(t.consumption, 1)} L/100</span></div>
      ${t.from && t.to ? '<button type="button" class="btn small" data-act="map" aria-label="Ver en Mapas">🗺️</button>' : ''}
      <button type="button" class="btn small" data-act="edit" aria-label="Editar">✎</button>
      <button type="button" class="btn small danger" data-act="del" aria-label="Borrar">✕</button>`;
    li.querySelector('.grow').addEventListener('click', () => editTrip(t));
    li.querySelector('[data-act=edit]').addEventListener('click', () => editTrip(t));
    li.querySelector('[data-act=map]')?.addEventListener('click', () => openMaps(t.from, t.to));
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


  document.querySelectorAll('#maps-picker button').forEach(b => b.classList.toggle('on', b.dataset.maps === state.mapsApp));

  $('#google-key').value = googleKey();
  const gc = googleCount();
  $('#google-usage').textContent = googleKey()
    ? `Hoy: ${gc.routes}/${GOOGLE_LIMITS.routes} rutas y ${gc.places}/${GOOGLE_LIMITS.places} búsquedas. Al llegar al tope se usa OpenStreetMap hasta mañana.`
    : 'Sin clave: se usa OpenStreetMap.';

  const favs = $('#places-settings');
  favs.innerHTML = '';
  if (!state.places.length) {
    favs.innerHTML = '<li class="empty">Aún no hay favoritos. Guárdalos con ☆ junto a «Desde» o «Hasta».</li>';
  }
  for (const f of state.places) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="grow">
        <div>⭐ ${escapeHTML(f.name)}</div>
        <div class="sub">${escapeHTML(f.label)}</div>
      </div>
      <button type="button" class="btn small" data-act="edit">Renombrar</button>
      <button type="button" class="btn small danger" data-act="del" aria-label="Borrar">✕</button>`;
    li.querySelector('[data-act=edit]').addEventListener('click', () => {
      const name = prompt('Nombre', f.name);
      if (!name || !name.trim()) return;
      f.name = name.trim();
      save(); renderSettings();
    });
    li.querySelector('[data-act=del]').addEventListener('click', () => {
      if (!confirm(`¿Borrar el favorito «${f.name}»?`)) return;
      state.places = state.places.filter(x => x.id !== f.id);
      save(); renderSettings(); updateFavButtons();
    });
    favs.appendChild(li);
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
        <div class="sub">${fmt(r.km, 1)} km${r.roundTrip ? ' (ida y vuelta)' : ''}${car ? ' · ' + escapeHTML(car.name) : ''}${r.from ? ' · ' + escapeHTML(routeText(r)) : ''}</div>
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

$('#google-key').addEventListener('change', e => {
  const key = e.target.value.trim();
  try {
    if (key) localStorage.setItem(GOOGLE_KEY, key);
    else localStorage.removeItem(GOOGLE_KEY);
  } catch { return toast('No se pudo guardar la clave'); }
  renderSettings();
  toast(key ? 'Clave de Google guardada' : 'Clave de Google borrada');
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
