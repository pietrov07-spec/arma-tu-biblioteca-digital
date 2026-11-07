import { borrarCopias } from './copias.js';
import { CARPETA, CLIENT_ID, DEMO, NOMBRE_CATALOGO, PERMITIDOS, SAL } from './config.js';
import { t } from './textos.jsx';
// Inicio de sesión con Google Identity Services y lectura de Drive con el
// token del usuario. No hay servidor: el token vive solo en esta pestaña.
//
// En modo demostración (sin ID de cliente) no hay Google: los archivos de
// ejemplo se piden a /demo/archivos/, que sirve `npm run dev` desde web/demo/.

const LECTURA = 'https://www.googleapis.com/auth/drive.readonly';
// La carpeta privada de la app en el Drive de cada quien: ahí se guardan Mi
// Mochila y las notas (ver personal.js). No se pide al entrar, para que el
// inicio de sesión no cambie: se pide aparte, con `activarPersonal`. Una vez
// concedido, Google lo incluye solo en los tokens siguientes.
const PERSONAL = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';
const GUARDADO = 'sesion-google';

let token = null;
let cliente = null;
let pendiente = null;

function leerGuardado() {
  try {
    const t = JSON.parse(sessionStorage.getItem(GUARDADO));
    if (t && t.vence > Date.now() + 60_000) return t;
  } catch {}
  return null;
}

function cargarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, falla) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = ok;
    s.onerror = () => falla(new Error(t('error.gis')));
    document.head.append(s);
  });
}

// Pide un token. Con `silencioso` no muestra la elección de cuenta si ya se
// aceptaron los permisos antes (Google abre y cierra una ventana breve).
// `alcance` y `conservar` son para pedir un permiso extra sin cerrar la sesión si falla.
export async function iniciarSesion({ silencioso = false, alcance = LECTURA, conservar = false } = {}) {
  await cargarGis();
  if (pendiente) return pendiente;
  pendiente = new Promise((ok, falla) => {
    cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: alcance,
      callback: (r) => {
        if (r.error) return falla(new Error(r.error_description || r.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, LECTURA)) {
          return falla(new Error(t('error.lectura')));
        }
        token = {
          valor: r.access_token,
          vence: Date.now() + r.expires_in * 1000,
          personal: window.google.accounts.oauth2.hasGrantedAllScopes(r, PERSONAL),
        };
        ok(token.valor);
      },
      error_callback: (e) =>
        falla(new Error(e.type === 'popup_closed' ? t('error.ventanaCerrada') : t('error.ventanaBloqueada'))),
    });
    cliente.requestAccessToken({ prompt: silencioso ? '' : 'select_account' });
  })
    .then(async (valor) => {
      await comprobarInvitacion();
      try { sessionStorage.setItem(GUARDADO, JSON.stringify(token)); } catch {}
      return valor;
    })
    .catch((e) => {
      if (token && !conservar) cerrarSesion();
      throw e;
    })
    .finally(() => { pendiente = null; });
  return pendiente;
}

export async function huella(correo) {
  // Debe coincidir con huella() de scripts/permitir.mjs
  const datos = new TextEncoder().encode(`${SAL}:${correo.trim().toLowerCase()}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Segunda comprobación además de la lista de usuarios de prueba de Google: el
// correo de la cuenta debe estar invitado. La seguridad real la dan Google y
// los permisos de Drive; esto solo da un mensaje claro a quien no lo está.
async function comprobarInvitacion() {
  if (!PERMITIDOS.length) return;
  const r = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${token.valor}` } });
  if (!r.ok) throw new Error(t('error.drive', { estado: r.status }));
  const correo = (await r.json()).user?.emailAddress || '';
  if (!PERMITIDOS.includes(await huella(correo))) {
    throw new Error(t('error.noInvitada', { correo }));
  }
}

export function sesionGuardada() {
  token = token || leerGuardado();
  return Boolean(token);
}

export function cerrarSesion() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.valor, () => {});
  token = null;
  try { sessionStorage.removeItem(GUARDADO); } catch {}
  borrarCopias();
}

// Sin pedir nada: ¿se puede usar Drive ahora mismo sin renovar la sesión?
export function tokenFresco() {
  if (DEMO) return true;
  token = token || leerGuardado();
  return Boolean(token && token.vence > Date.now() + 60_000);
}

// Pide permiso para la carpeta privada de la app. Si se niega o falla, la sesión sigue igual.
export async function activarPersonal() {
  await iniciarSesion({ silencioso: true, alcance: `${LECTURA} ${PERSONAL}`, conservar: true });
  return Boolean(token?.personal);
}

// ¿Se puede guardar lo personal en Drive ahora mismo, sin pedir nada?
export function permisoPersonal() {
  if (DEMO) return false;
  return tokenFresco() && Boolean(token.personal);
}

async function tokenVigente() {
  token = token || leerGuardado();
  if (token && token.vence > Date.now() + 60_000) return token.valor;
  return iniciarSesion({ silencioso: true });
}

export async function encabezados() {
  if (DEMO) return {};
  return { Authorization: `Bearer ${await tokenVigente()}` };
}

// fetch a la API de Drive; si el token caducó, pide otro una vez y reintenta.
async function pedir(ruta, opciones = {}) {
  if (DEMO) return pedirDemo(ruta, opciones);
  let r = await fetch(API + ruta, { ...opciones, headers: { ...opciones.headers, ...(await encabezados()) } });
  if (r.status === 401) {
    token = null;
    try { sessionStorage.removeItem(GUARDADO); } catch {}
    r = await fetch(API + ruta, { ...opciones, headers: { ...opciones.headers, ...(await encabezados()) } });
  }
  if (r.status === 404) throw Object.assign(new Error(t('error.noExiste')), { estado: 404 });
  if (!r.ok) throw Object.assign(new Error(t('error.drive', { estado: r.status })), { estado: r.status });
  return r;
}

// "/files/demo-x?alt=media…" → "/demo/archivos/demo-x"
async function pedirDemo(ruta, opciones) {
  const id = ruta.match(/^\/files\/([^?]+)/)?.[1];
  const r = await fetch(`/demo/archivos/${id}`, { signal: opciones.signal });
  if (!r.ok) throw Object.assign(new Error(t('error.noExiste')), { estado: 404 });
  return r;
}

// Portadas subidas a Drive ("drive:<id>" en el catálogo): se piden con el
// token del usuario, así siguen siendo privadas. Una sola descarga por imagen.
// Una colección con un centenar de portadas de Drive las pediría todas a la
// vez y Drive rechaza parte con 403/429: se piden de a pocas y, si Drive pide
// esperar, se reintenta.
const imagenes = new Map();
const MAXIMO_SIMULTANEAS = 4;
let enCurso = 0;
const enEspera = [];

function turno() {
  if (enCurso < MAXIMO_SIMULTANEAS) { enCurso++; return Promise.resolve(); }
  return new Promise((listo) => enEspera.push(listo));
}

// El turno pasa directo a la siguiente en espera, sin bajar el contador
function liberar() {
  const siguiente = enEspera.shift();
  if (siguiente) siguiente();
  else enCurso--;
}

async function bajarImagen(id) {
  for (let intento = 0; ; intento++) {
    await turno();
    try {
      const r = await pedir(`/files/${id}?alt=media&supportsAllDrives=true`);
      return URL.createObjectURL(await r.blob());
    } catch (e) {
      const pasajero = e.estado === undefined || e.estado === 403 || e.estado === 429 || e.estado >= 500;
      if (!pasajero || intento === 3) throw e;
    } finally {
      liberar();
    }
    await new Promise((listo) => setTimeout(listo, 800 * 2 ** intento + Math.random() * 400));
  }
}

export function imagenDrive(id) {
  if (!imagenes.has(id)) {
    imagenes.set(id, bajarImagen(id).catch((e) => { imagenes.delete(id); throw e; }));
  }
  return imagenes.get(id);
}

export const urlContenido = (id) => (DEMO ? `/demo/archivos/${id}` : `${API}/files/${id}?alt=media&supportsAllDrives=true`);

export async function cargarCatalogo() {
  const q = encodeURIComponent(`name = '${NOMBRE_CATALOGO}' and trashed = false`);
  const lista = await (await pedir(`/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
  const id = lista.files?.[0]?.id;
  if (!id) throw new Error(t('error.sinCarpeta', { carpeta: CARPETA }));
  return (await pedir(`/files/${id}?alt=media&supportsAllDrives=true`)).json();
}

// Descarga un archivo informando el avance (0–1); `tamano` viene del catálogo
// porque Drive no siempre manda Content-Length.
export async function descargar(id, opciones = {}) {
  for (let intento = 0; ; intento++) {
    try {
      return await descargarUnaVez(id, opciones);
    } catch (e) {
      // Un corte de red o un fallo pasajero de Drive no deben dejar sin libro
      const pasajero = e.name !== 'AbortError' && (e.estado === undefined || e.estado === 429 || e.estado >= 500);
      if (!pasajero || intento === 2) throw e;
      await new Promise((listo) => setTimeout(listo, 600 * 3 ** intento));
    }
  }
}

async function descargarUnaVez(id, { tamano, alAvanzar, senal } = {}) {
  const r = await pedir(`/files/${id}?alt=media&supportsAllDrives=true`, { signal: senal });
  const total = Number(r.headers.get('Content-Length')) || tamano || 0;
  if (!r.body || !total || !alAvanzar) return r.blob();
  const lector = r.body.getReader();
  const partes = [];
  let recibido = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    recibido += value.length;
    alAvanzar(Math.min(1, recibido / total));
  }
  return new Blob(partes);
}
