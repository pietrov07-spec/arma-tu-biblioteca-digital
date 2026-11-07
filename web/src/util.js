import { idiomaActual, t } from './textos.jsx';

export const normalizar = (s = '') =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Texto en el que busca el buscador: título, título original, autores, temas.
export const textoBusqueda = (o) =>
  normalizar([o.t, o.to, ...(o.a || []), ...(o.tm || [])].filter(Boolean).join(' '));

// Color estable por texto, para lomos y portadas generadas. Cada tinta lleva
// su familia: en el estante no quedan juntos dos tonos parecidos.
const TINTAS = [
  ['#c2412d', 'coral'], ['#0f6e63', 'turquesa'], ['#2b4c8c', 'azul'], ['#b07a12', 'ocre'], ['#5a3d8a', 'violeta'],
  ['#2f6b45', 'verde'], ['#8f2d56', 'vino'], ['#1f5a7a', 'azul'], ['#37474f', 'pizarra'], ['#a3532a', 'coral'],
];
function indiceTinta(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % TINTAS.length;
}
export const tinta = (texto) => TINTAS[indiceTinta(texto)][0];

// Para una fila de lomos: parte del color de cada título y, si su familia se
// repite con alguno de los dos anteriores, toma la siguiente que no.
export function tintasAlternadas(titulos) {
  const familias = [];
  return titulos.map((t) => {
    const i = indiceTinta(t);
    for (let k = 0; k < TINTAS.length; k++) {
      const [color, familia] = TINTAS[(i + k) % TINTAS.length];
      if (!familias.slice(-2).includes(familia)) {
        familias.push(familia);
        return color;
      }
    }
  });
}

export const tamano = (bytes) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

export const autoresTexto = (a) =>
  !a?.length ? t('autorDesconocido') : a.length > 2 ? t('autores.otros', { autor: a[0] }) : a.join(t('autores.y'));

// País del autor principal: código ISO, o SIN_PAIS para filtrar las obras sin dato.
export const SIN_PAIS = 'sin';
const regiones = {};
export function nombrePais(codigo) {
  try {
    const lengua = idiomaActual();
    regiones[lengua] ||= new Intl.DisplayNames([lengua], { type: 'region' });
    return regiones[lengua].of(codigo);
  } catch {
    return codigo;
  }
}

export const urlDrive = (id) => `https://drive.google.com/file/d/${id}/view`;

// Open Library usa códigos de tres letras (MARC); Intl necesita los de dos
const ISO = { spa: 'es', eng: 'en', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', cat: 'ca', jpn: 'ja', kor: 'ko', rus: 'ru', chi: 'zh', zho: 'zh', pol: 'pl', lat: 'la', gre: 'el', ara: 'ar', dut: 'nl', nld: 'nl' };
const lenguas = {};
export function idioma(c) {
  try {
    const lengua = idiomaActual();
    lenguas[lengua] ||= new Intl.DisplayNames([lengua], { type: 'language' });
    const nombre = lenguas[lengua].of(ISO[c] || c);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  } catch {
    return c;
  }
}

// Estado de la vista en el hash (#v=lista&c=Poesía&q=...), para enlaces directos.
export function leerHash() {
  const p = new URLSearchParams(location.hash.slice(1).normalize('NFC'));
  return {
    q: p.get('q') || '',
    c: p.get('c') || '',
    x: p.get('x') || '',
    p: p.get('p') || '',
    v: p.get('v') || 'cuadricula',
    o: p.get('o') || 'titulo',
    libro: p.get('libro') || '',
    leer: p.get('leer') || '',
    // Mi Mochila en vez de una colección
    m: p.get('m') || '',
  };
}

// `apilar`: la ficha y el lector abren una entrada propia en el historial, para
// que el botón Atrás del celular los cierre en vez de salir de la app.
export function escribirHash(estado, apilar = false) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(estado)) {
    if (v && !(k === 'v' && v === 'cuadricula') && !(k === 'o' && v === 'titulo')) p.set(k, v);
  }
  const nuevo = p.toString();
  const url = nuevo ? '#' + nuevo : location.pathname;
  if (apilar) history.pushState({ capa: true }, '', url);
  else if (nuevo !== location.hash.slice(1)) history.replaceState(history.state, '', url);
}
