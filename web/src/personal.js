import { useSyncExternalStore } from 'react';
import { NOMBRE_PERSONAL } from './config.js';
import { activarPersonal, encabezados, permisoPersonal } from './google.js';

// Lo personal de quien lee: Mi Mochila y las notas sobre los textos. Se guarda
// en este navegador y, si la cuenta dio permiso, en la carpeta privada de la app
// en su propio Drive (appDataFolder): nadie más la ve, ni siquiera quien
// administra la biblioteca, y así lo mismo aparece en el celular y en la
// computadora. Cada registro lleva la fecha de su último cambio (`m`); al juntar
// dos versiones gana el más reciente, y lo borrado queda marcado (`b`) un
// tiempo para que no reaparezca desde el otro dispositivo.

export const LIMITE_MOCHILA = 30;
const DIA = 24 * 3600 * 1000;
export const VIGENCIA_MOCHILA = 30 * DIA;
const OLVIDO = 90 * DIA;
const LOCAL = 'personal-v1';
const ARCHIVO = NOMBRE_PERSONAL;
const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3';

const vacio = () => ({ mochila: {}, notas: {} });

function leerLocal() {
  try { return { ...vacio(), ...JSON.parse(localStorage.getItem(LOCAL)) }; } catch { return vacio(); }
}

let datos = limpiar(leerLocal());
const oyentes = new Set();

function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export const usePersonal = () => useSyncExternalStore(suscribir, () => datos);

function poner(nuevos, { subir = true } = {}) {
  datos = nuevos;
  try { localStorage.setItem(LOCAL, JSON.stringify(datos)); } catch {}
  oyentes.forEach((o) => o());
  if (subir) programarSubida();
}

// Quita lo vencido o borrado hace mucho; lo demás se queda tal cual
function limpiar(d) {
  const ahora = Date.now();
  const filtrar = (seccion, vivo) => Object.fromEntries(Object.entries(seccion || {}).filter(([, r]) => vivo(r, ahora)));
  return {
    mochila: filtrar(d.mochila, (r, t) => (r.b ? t - r.b < OLVIDO : t - r.a < VIGENCIA_MOCHILA + OLVIDO)),
    notas: filtrar(d.notas, (r, t) => !r.b || t - r.b < OLVIDO),
  };
}

function mezclar(a, b) {
  const unir = (x = {}, y = {}) => {
    const r = { ...x };
    for (const [k, v] of Object.entries(y)) if (!r[k] || (v.m || 0) > (r[k].m || 0)) r[k] = v;
    return r;
  };
  return limpiar({ mochila: unir(a.mochila, b.mochila), notas: unir(a.notas, b.notas) });
}

// ---------- Mi Mochila ----------

const vigente = (r, ahora = Date.now()) => Boolean(r && !r.b && ahora - r.a < VIGENCIA_MOCHILA);

export const enMochila = (d, id) => vigente(d.mochila[id]);
export const diasRestantes = (d, id) => Math.max(1, Math.ceil((d.mochila[id].a + VIGENCIA_MOCHILA - Date.now()) / DIA));

// Los ids de la mochila, del más reciente al más antiguo
export function idsMochila(d) {
  const ahora = Date.now();
  return Object.entries(d.mochila).filter(([, r]) => vigente(r, ahora)).sort((x, y) => y[1].a - x[1].a).map(([id]) => id);
}

// Agrega hasta llenar el límite; devuelve cuántas entraron y cuántas no cupieron
export function agregarAMochila(ids) {
  const ahora = Date.now();
  const mochila = { ...datos.mochila };
  let libres = LIMITE_MOCHILA - idsMochila(datos).length;
  let agregadas = 0;
  let sinLugar = 0;
  for (const id of ids) {
    if (vigente(mochila[id], ahora)) continue;
    if (libres <= 0) { sinLugar++; continue; }
    mochila[id] = { a: ahora, m: ahora };
    libres--;
    agregadas++;
  }
  if (agregadas) poner({ ...datos, mochila });
  return { agregadas, sinLugar };
}

export function quitarDeMochila(id) {
  const ahora = Date.now();
  poner({ ...datos, mochila: { ...datos.mochila, [id]: { ...datos.mochila[id], b: ahora, m: ahora } } });
}

// Vuelve a contar los 30 días desde hoy
export function renovarEnMochila(id) {
  const ahora = Date.now();
  poner({ ...datos, mochila: { ...datos.mochila, [id]: { a: ahora, m: ahora } } });
}

// ---------- notas ----------

// Las notas de un archivo, en el orden en que aparecen en el texto
export function notasDe(d, archivoId) {
  return Object.values(d.notas)
    .filter((n) => !n.b && n.f === archivoId)
    .sort((a, b) => (a.pagina || 0) - (b.pagina || 0) || (a.rects?.[0]?.[1] || 0) - (b.rects?.[0]?.[1] || 0) || (a.fraccion || 0) - (b.fraccion || 0) || a.c - b.c);
}

export const cuentaNotas = (d, archivoId) => Object.values(d.notas).filter((n) => !n.b && n.f === archivoId).length;

// Crea la nota si no tiene id; si lo tiene, cambia solo lo que se pasa
export function guardarNota(cambios) {
  const ahora = Date.now();
  const id = cambios.id || (crypto.randomUUID?.() || `${ahora}-${Math.random().toString(36).slice(2)}`);
  const previa = datos.notas[id];
  const nota = { ...previa, ...cambios, id, c: previa?.c || ahora, m: ahora };
  poner({ ...datos, notas: { ...datos.notas, [id]: nota } });
  return nota;
}

export function borrarNota(id) {
  const ahora = Date.now();
  const n = datos.notas[id];
  if (!n) return;
  // Del registro borrado solo queda lo necesario para que no reaparezca
  poner({ ...datos, notas: { ...datos.notas, [id]: { id, f: n.f, b: ahora, m: ahora } } });
}

// ---------- copia en Drive ----------

let archivoId = null;
let enCurso = null;
let espera = 0;
let otraVez = false;

function programarSubida() {
  clearTimeout(espera);
  espera = setTimeout(sincronizar, 1500);
}

// Trae la copia de Drive, la junta con la local y sube el resultado. Solo con
// una sesión vigente: renovarla abriría una ventana de Google sin que nadie la pida.
export function sincronizar() {
  if (!permisoPersonal()) return Promise.resolve(false);
  if (enCurso) { otraVez = true; return enCurso; }
  enCurso = (async () => {
    const h = await encabezados();
    if (!archivoId) {
      const q = encodeURIComponent(`name = '${ARCHIVO}'`);
      const r = await fetch(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`, { headers: h });
      if (!r.ok) throw new Error(`Drive respondió ${r.status}.`);
      archivoId = (await r.json()).files?.[0]?.id || null;
    }
    if (archivoId) {
      const r = await fetch(`${API}/files/${archivoId}?alt=media`, { headers: h });
      if (r.ok) poner(mezclar(datos, await r.json()), { subir: false });
      else if (r.status === 404) archivoId = null;
    }
    const cuerpo = JSON.stringify(datos);
    if (archivoId) {
      const r = await fetch(`${SUBIDA}/files/${archivoId}?uploadType=media`, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: cuerpo,
      });
      if (!r.ok) throw new Error(`Drive respondió ${r.status}.`);
    } else {
      const limite = `biblioteca${Date.now()}`;
      const partes = [
        `--${limite}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name: ARCHIVO, parents: ['appDataFolder'] }),
        `--${limite}`, 'Content-Type: application/json', '', cuerpo, `--${limite}--`,
      ].join('\r\n');
      const r = await fetch(`${SUBIDA}/files?uploadType=multipart&fields=id`, {
        method: 'POST', headers: { ...h, 'Content-Type': `multipart/related; boundary=${limite}` }, body: partes,
      });
      if (!r.ok) throw new Error(`Drive respondió ${r.status}.`);
      archivoId = (await r.json()).id;
    }
    return true;
  })()
    .catch(() => false) // sin red o sin permiso: lo local sigue valiendo y se reintenta después
    .finally(() => {
      enCurso = null;
      if (otraVez) { otraVez = false; programarSubida(); }
    });
  return enCurso;
}

// Pide el permiso de la carpeta privada (abre una ventana de Google) y, si se
// concede, junta lo de este navegador con lo que ya hubiera en la cuenta.
export async function activarSincronizacion() {
  const concedido = await activarPersonal();
  if (concedido) await sincronizar();
  // El permiso cambió aunque los datos no: se avisa para que la vista lo note
  datos = { ...datos };
  oyentes.forEach((o) => o());
  return concedido;
}

// Al volver a la pestaña se traen los cambios hechos en otro dispositivo
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sincronizar());
  // Otra pestaña de este navegador cambió algo
  addEventListener('storage', (e) => {
    if (e.key === LOCAL) { datos = limpiar(leerLocal()); oyentes.forEach((o) => o()); }
  });
}
