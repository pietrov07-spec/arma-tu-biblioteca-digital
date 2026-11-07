import { descargar } from './google.js';
import { t } from './textos.jsx';

// Gemini Notebook no tiene API para cuentas personales. Los PDF los toma directo
// de Drive; los EPUB, MOBI, AZW3 y FB2 no, así que aquí se convierten en el
// navegador a un .md que se sube a mano. Los PDF también se pueden convertir,
// con marcas de página, para archivos muy pesados o para usar el texto fuera.
// Nada sale del dispositivo. foliate y pdf.js se cargan solo al convertir.
export const GEMINI_NOTEBOOK = 'https://notebook.google.com/';

export const pdfDe = (obra) => obra.f.filter((f) => f.x === 'pdf').sort((a, b) => b.s - a.s)[0];
export const libroDe = (obra) => obra.f.filter((f) => f.x !== 'pdf').sort((a, b) => (a.x === 'epub' ? -1 : b.x === 'epub' ? 1 : 0))[0];

const BLOQUES = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, dt, dd, td, th, figcaption';
const espacios = (s) => s.replace(/\s+/g, ' ').trim();

// Texto de un capítulo: un párrafo por bloque y los títulos como encabezados.
function textoDeDocumento(doc) {
  const cuerpo = doc.body || doc.documentElement;
  cuerpo.querySelectorAll('script, style, nav').forEach((n) => n.remove());
  const bloques = [...cuerpo.querySelectorAll(BLOQUES)].filter((b) => !b.parentElement?.closest(BLOQUES));
  if (!bloques.length) return espacios(cuerpo.textContent || '');
  return bloques
    .map((b) => {
      const t = espacios(b.textContent || '');
      if (!t) return '';
      const nivel = /^h([1-6])$/i.exec(b.tagName)?.[1];
      return nivel ? `${'#'.repeat(Math.min(6, Number(nivel) + 1))} ${t}` : t;
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function libroComoTexto(obra, archivo, alAvanzar) {
  const blob = await descargar(archivo.id, { tamano: archivo.s, alAvanzar: (x) => alAvanzar?.(x * 0.6) });
  // foliate reconoce FB2 por la extensión
  return textoDeArchivo(obra, new File([blob], `libro.${archivo.x}`), alAvanzar);
}

export async function textoDeArchivo(obra, archivo, alAvanzar) {
  const { makeBook } = await import('foliate-js/view.js');
  const libro = await makeBook(archivo);
  const partes = [];
  const secciones = libro.sections.filter((s) => s.linear !== 'no');
  for (const [i, s] of secciones.entries()) {
    try {
      const texto = textoDeDocumento(await s.createDocument());
      if (texto) partes.push(texto);
    } catch {
      // Un capítulo dañado no detiene el resto
    }
    alAvanzar?.(0.6 + (0.4 * (i + 1)) / secciones.length);
  }
  if (!partes.length) throw new Error(t('nb.sinTexto'));
  return `${cabecera(obra)}\n\n${partes.join('\n\n')}\n`;
}

const cabecera = (obra) =>
  [`# ${obra.t}`, obra.a?.length ? obra.a.join(', ') : '', obra.y ? String(obra.y) : ''].filter(Boolean).join('\n\n');

// Une las líneas de una página en párrafos y pega las palabras partidas con
// guion al final de línea.
function parrafos(lineas) {
  const salida = [];
  let actual = '';
  const largo = Math.max(...lineas.map((l) => l.length));
  for (const l of lineas) {
    actual = !actual ? l : /[\p{L}]-$/u.test(actual) ? actual.slice(0, -1) + l : `${actual} ${l}`;
    // Punto final en línea incompleta, o línea muy corta (títulos)
    if ((/[.!?:»”"]$/.test(l) && l.length < largo * 0.85) || l.length < largo * 0.5) { salida.push(actual); actual = ''; }
  }
  if (actual) salida.push(actual);
  return salida.join('\n\n');
}

export async function pdfComoTexto(obra, archivo, alAvanzar) {
  const blob = await descargar(archivo.id, { tamano: archivo.s, alAvanzar: (x) => alAvanzar?.(x * 0.4) });
  return textoDePdf(obra, await blob.arrayBuffer(), alAvanzar);
}

export async function textoDePdf(obra, datos, alAvanzar) {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
  const { default: trabajador } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = trabajador;
  const tarea = getDocument({ data: datos, isEvalSupported: false });
  const paginas = [];
  let etiquetas;
  try {
    const pdf = await tarea.promise;
    etiquetas = await pdf.getPageLabels().catch(() => null);
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const { items } = await pagina.getTextContent();
      let linea = '';
      const lineas = [];
      for (const i of items) {
        linea += i.str;
        if (i.hasEOL) { lineas.push(espacios(linea)); linea = ''; }
      }
      lineas.push(espacios(linea));
      paginas.push(lineas.filter(Boolean));
      pagina.cleanup();
      alAvanzar?.(0.4 + (0.6 * n) / pdf.numPages);
    }
  } finally {
    tarea.destroy();
  }

  const caracteres = paginas.reduce((t, p) => t + p.join('').length, 0);
  if (caracteres < paginas.length * 40) {
    throw new Error(t('nb.escaneado'));
  }

  // Encabezados y pies que se repiten (sin contar números) se quitan
  const clave = (l) => l.replace(/\d+/g, '#').toLowerCase();
  const veces = new Map();
  for (const p of paginas) {
    for (const l of new Set([...p.slice(0, 2), ...p.slice(-2)].map(clave))) veces.set(l, (veces.get(l) || 0) + 1);
  }
  const repetida = (l) => paginas.length >= 6 && (veces.get(clave(l)) || 0) >= paginas.length * 0.3;
  const numeroSuelto = (l) => /^[\divxlcm\s.\-–]+$/i.test(l);

  const cuerpo = paginas.map((p, i) => {
    const limpias = p.filter((l, j) => !((j < 2 || j >= p.length - 2) && (repetida(l) || numeroSuelto(l))));
    const marca = `[p. ${etiquetas?.[i] || i + 1}]`;
    return limpias.length ? `${marca}\n\n${parrafos(limpias)}` : marca;
  });
  return `${cabecera(obra)}\n\n${t('nb.marcas')}\n\n${cuerpo.join('\n\n')}\n`;
}

const nombreArchivo = (obra) => `${obra.t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}.md`;

export function guardarTexto(obra, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo(obra) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
