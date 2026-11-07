import { descargar, tokenFresco } from './google.js';

// Copias de los libros ya abiertos, solo en este dispositivo: la segunda vez
// abren sin pasar por Drive. Se borran al cerrar sesión. Los PDF no pasan por
// aquí porque pdf.js ya pide a Drive solo las páginas que muestra.
const CAJA = 'biblioteca-libros';
const REGISTRO = 'copias-libros';
const LIMITE_ARCHIVO = 40e6;
const LIMITE_TOTAL = 300e6;
const VIGENCIA = 30 * 24 * 3600 * 1000;
const LIMITE_ANTICIPO = 15e6;

const url = (id) => `/copia-libro/${encodeURIComponent(id)}`;

function leerRegistro() {
  try { return JSON.parse(localStorage.getItem(REGISTRO)) || {}; } catch { return {}; }
}
function escribirRegistro(r) {
  try { localStorage.setItem(REGISTRO, JSON.stringify(r)); } catch {}
}

async function buscarCopia(archivo) {
  try {
    const registro = leerRegistro();
    // Si el archivo cambió en Drive, el tamaño ya no coincide
    if (registro[archivo.id]?.s !== archivo.s) return null;
    const r = await (await caches.open(CAJA)).match(url(archivo.id));
    if (!r) return null;
    registro[archivo.id].t = Date.now();
    escribirRegistro(registro);
    return await r.blob();
  } catch {
    return null;
  }
}

async function guardarCopia(archivo, blob) {
  if (blob.size > LIMITE_ARCHIVO) return;
  try {
    const caja = await caches.open(CAJA);
    await caja.put(url(archivo.id), new Response(blob));
    const registro = leerRegistro();
    registro[archivo.id] = { s: archivo.s, b: blob.size, t: Date.now() };
    // Fuera lo vencido y, si no cabe todo, lo que lleva más tiempo sin abrirse
    const ahora = Date.now();
    let total = 0;
    for (const [id, c] of Object.entries(registro).sort((a, b) => b[1].t - a[1].t)) {
      total += c.b;
      if (total > LIMITE_TOTAL || ahora - c.t > VIGENCIA) {
        delete registro[id];
        await caja.delete(url(id));
      }
    }
    escribirRegistro(registro);
  } catch {
    // Sin espacio o sin Cache API: se lee igual, solo que sin copia
  }
}

export async function borrarCopias() {
  try { localStorage.removeItem(REGISTRO); await caches.delete(CAJA); } catch {}
}

// Descargas en curso: si el lector se abre mientras se anticipa, se aprovecha
const enCurso = new Map();

function traer(archivo) {
  if (enCurso.has(archivo.id)) return enCurso.get(archivo.id);
  const tarea = { avance: 0, oyentes: new Set() };
  tarea.promesa = (async () => {
    const copia = await buscarCopia(archivo);
    if (copia) return copia;
    const blob = await descargar(archivo.id, {
      tamano: archivo.s,
      alAvanzar: (x) => { tarea.avance = x; tarea.oyentes.forEach((o) => o(x)); },
    });
    guardarCopia(archivo, blob);
    return blob;
  })().finally(() => enCurso.delete(archivo.id));
  enCurso.set(archivo.id, tarea);
  return tarea;
}

export async function obtenerLibro(archivo, { alAvanzar, senal } = {}) {
  // Los muy grandes no se copian y se pueden cancelar al salir del lector
  if (archivo.s > LIMITE_ARCHIVO) return descargar(archivo.id, { tamano: archivo.s, alAvanzar, senal });
  const tarea = traer(archivo);
  if (alAvanzar) {
    alAvanzar(tarea.avance);
    tarea.oyentes.add(alAvanzar);
  }
  try {
    return await tarea.promesa;
  } finally {
    tarea.oyentes.delete(alAvanzar);
  }
}

// Al ver una ficha: deja listo el libro por si se abre. Nunca con ahorro de datos
// o red lenta, ni si haría falta renovar la sesión.
export function anticiparLibro(archivo) {
  const red = navigator.connection;
  if (archivo.s > LIMITE_ANTICIPO || red?.saveData || /2g/.test(red?.effectiveType || '') || !tokenFresco()) return;
  traer(archivo).promesa.catch(() => {});
  import('./LectorLibro.jsx').catch(() => {});
  import('foliate-js/paginator.js').catch(() => {});
  import('foliate-js/epub.js').catch(() => {});
  import('foliate-js/vendor/zip.js').catch(() => {});
}
