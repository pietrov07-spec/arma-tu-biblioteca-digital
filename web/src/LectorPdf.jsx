import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icono from './Iconos.jsx';
import { sonarPagina } from './sonido.js';
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist';
import trabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './capa-texto.css';
import { encabezados, urlContenido } from './google.js';
import { t } from './textos.jsx';

GlobalWorkerOptions.workerSrc = trabajador;

// Lector de PDF: páginas en columna, que se dibujan solo al acercarse a la
// pantalla. Con libros de 400 páginas, dibujar todo de golpe congela el navegador.
const SEPARACION = 16;
// Con ratón, dos páginas solo desde este ancho; en pantalla táctil, casi siempre
const ANCHO_PARA_DOS = 700;
const ANCHO_PARA_DOS_TACTIL = 300;
const PREFERENCIA = 'pdf-vista-2';
const VISTAS = [
  { id: 'una', icono: 'pagina' },
  { id: 'dos', icono: 'paginas' },
  { id: 'manual', icono: 'ajuste' },
];

function leerPreferencia() {
  // `auto`: nada elegido aún. Dos páginas con el celular en vertical; si no, una.
  try { return { modo: 'auto', zoom: 1, ...JSON.parse(localStorage.getItem(PREFERENCIA)) }; } catch { return { modo: 'auto', zoom: 1 }; }
}

export default function LectorPdf({ archivo, posicion, guardar, alAvanzar, controles, anotar }) {
  const [doc, setDoc] = useState(null);
  const [tamanos, setTamanos] = useState([]);
  const [pagina, setPagina] = useState(posicion?.pagina || 1);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [{ modo, zoom }, setVista] = useState(leerPreferencia);
  const [tactil] = useState(() => matchMedia('(pointer: coarse)').matches);
  const contenedor = useRef(null);

  useEffect(() => {
    let tarea;
    let cancelado = false;
    (async () => {
      // Con la URL y el token, pdf.js pide por rangos lo que necesita en vez
      // de bajar el archivo completo antes de mostrar la primera página.
      tarea = getDocument({ url: urlContenido(archivo.id), httpHeaders: await encabezados(), isEvalSupported: false });
      tarea.onProgress = ({ loaded, total }) => alAvanzar(Math.min(1, loaded / (total || archivo.s || loaded)));
      const pdf = await tarea.promise;
      // Todas las páginas reservan el espacio de la primera; casi todos los
      // libros las tienen iguales, y pedir las medidas de cada una sería
      // descargar el índice completo antes de mostrar nada.
      const v = (await pdf.getPage(1)).getViewport({ scale: 1 });
      if (cancelado) return;
      setTamanos(Array(pdf.numPages).fill([v.width, v.height]));
      setDoc(pdf);
      alAvanzar(1);
    })().catch((e) => !cancelado && alAvanzar(e));
    return () => { cancelado = true; tarea?.destroy(); };
  }, [archivo.id]);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Una y Dos muestran páginas completas, una pantalla a la vez. Manual usa el zoom
  // y se desplaza libremente, con el 100 % en el tamaño de la página completa.
  const [pw, ph] = tamanos[0] || [1, 1];
  const una = Math.min(area.w / pw, area.h / ph);
  const dos = Math.min((area.w - SEPARACION) / 2 / pw, area.h / ph);
  // La orientación del dispositivo, no la del área: el teclado también la achata
  const vertical = tactil && !(screen.orientation?.type?.startsWith('landscape') ?? area.w > area.h);
  const admiteDos = area.w >= (tactil ? ANCHO_PARA_DOS_TACTIL : ANCHO_PARA_DOS) && pw < ph;
  const doble = admiteDos && (modo === 'dos' || (modo === 'auto' && vertical));
  const manual = modo === 'manual';
  const escala = manual ? una * zoom : doble ? dos : una;
  const paso = doble ? 2 : 1;
  const inicioDeFila = (n) => (doble ? n - ((n - 1) % 2) : n);

  const cambiarVista = (cambios) => {
    const nueva = { modo, zoom, ...cambios };
    setVista(nueva);
    try { localStorage.setItem(PREFERENCIA, JSON.stringify(nueva)); } catch {}
  };

  const llevarA = (n) => contenedor.current?.querySelector(`[data-pagina="${n}"]`)?.closest('.pdf-celda')?.scrollIntoView({ block: 'start', inline: 'nearest' });

  // Al abrir, y al cambiar la vista o el zoom, se conserva la página que se leía
  const paginaActual = useRef(pagina);
  paginaActual.current = pagina;
  useLayoutEffect(() => {
    if (!doc || escala <= 0) return;
    llevarA(paginaActual.current);
  }, [doc, escala > 0, zoom, doble, manual, area.w]);

  // Página actual: la que ocupa el centro de la pantalla
  useEffect(() => {
    const el = contenedor.current;
    if (!el || !doc) return;
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) if (e.isIntersecting) setPagina(inicioDeFila(Number(e.target.dataset.pagina)));
    }, { root: el, rootMargin: '-50% 0px -50% 0px' });
    el.querySelectorAll('.pdf-pagina').forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [doc, tamanos, doble, escala > 0]);

  useEffect(() => { if (doc) guardar({ pagina }, pagina / doc.numPages); }, [doc, pagina]);

  // Solo al pasar a la página o al par contiguo; los saltos no suenan
  const paginaPrevia = useRef(pagina);
  useEffect(() => {
    if (Math.abs(pagina - paginaPrevia.current) === paso) sonarPagina();
    paginaPrevia.current = pagina;
  }, [pagina]);

  const irA = (n) => llevarA(Math.min(Math.max(1, n), doc.numPages));

  // Ir a una nota desde el panel
  anotar.destino.current = (n) => llevarA(n.pagina);

  // Texto elegido sobre la capa de texto: se guarda como rectángulos relativos a
  // la página (0–1), así la marca cae en su lugar con cualquier zoom o vista.
  const avisar = useRef(anotar.alSeleccionar);
  avisar.current = anotar.alSeleccionar;
  useEffect(() => {
    let espera = 0;
    const alCambiar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => avisar.current(seleccionPdf(contenedor.current)), 250);
    };
    document.addEventListener('selectionchange', alCambiar);
    return () => { clearTimeout(espera); document.removeEventListener('selectionchange', alCambiar); };
  }, []);

  // Tocar una marca abre su barra
  const notasRef = useRef(anotar.notas);
  notasRef.current = anotar.notas;
  const alTocar = (e) => {
    if (!document.getSelection()?.isCollapsed) return;
    const pag = e.target.closest?.('.pdf-pagina');
    if (!pag) return;
    const caja = pag.getBoundingClientRect();
    const x = (e.clientX - caja.left) / caja.width;
    const y = (e.clientY - caja.top) / caja.height;
    const numero = Number(pag.dataset.pagina);
    const nota = notasRef.current.find((n) => n.pagina === numero && n.rects?.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry - 0.004 && y <= ry + rh + 0.004));
    if (nota) anotar.alTocar(nota, { left: e.clientX - 1, top: e.clientY - 10, bottom: e.clientY + 10, width: 2 });
  };

  useEffect(() => {
    if (!doc) return;
    const tecla = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); irA(pagina + paso); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); irA(pagina - paso); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [doc, pagina, paso]);

  return (
    <>
      {controles(doc && (
        <div className="lector-controles">
          <label className="lector-pagina">
            <span className="sr">{t('pdf.irA')}</span>
            <input
              key={pagina}
              type="number"
              min="1"
              max={doc.numPages}
              defaultValue={pagina}
              onKeyDown={(e) => e.key === 'Enter' && irA(Number(e.currentTarget.value))}
              onBlur={(e) => Number(e.currentTarget.value) !== pagina && irA(Number(e.currentTarget.value))}
            />
            <span>{t('pdf.de', { n: doc.numPages })}</span>
          </label>
          <div className="temas" role="group" aria-label={t('pdf.vista')}>
            {VISTAS.filter((v) => v.id !== 'dos' || admiteDos).map((v) => (
              <button
                key={v.id}
                className="tema"
                aria-pressed={(doble ? 'dos' : manual ? 'manual' : 'una') === v.id}
                aria-label={t(`pdf.${v.id}`)}
                title={t(`pdf.${v.id}`)}
                onClick={() => cambiarVista({ modo: v.id })}
              >
                <Icono nombre={v.icono} tamano={18} />
              </button>
            ))}
          </div>
          {manual && (
            <div className="lector-zoom" role="group" aria-label={t('pdf.zoom')}>
              <button className="boton-icono" onClick={() => cambiarVista({ zoom: Math.max(0.5, zoom - 0.25) })} aria-label={t('pdf.alejar')} disabled={zoom <= 0.5}>−</button>
              <button className="lector-zoom-valor" onClick={() => cambiarVista({ zoom: 1 })} aria-label={t('pdf.completa')} title={t('pdf.completa')}>{Math.round(zoom * 100)} %</button>
              <button className="boton-icono" onClick={() => cambiarVista({ zoom: Math.min(3, zoom + 0.25) })} aria-label={t('pdf.acercar')} disabled={zoom >= 3}>+</button>
            </div>
          )}
        </div>
      ))}
      <div ref={contenedor} className={`pdf-paginas ${manual ? '' : 'pdf-ajustado'}`} tabIndex={0} aria-label={t('pdf.paginas')} onClick={alTocar}>
        <div className={`pdf-rejilla ${doble ? 'pdf-doble' : ''}`} style={manual ? undefined : { '--alto-celda': `${area.h}px` }}>
          {doc && escala > 0 && tamanos.map(([w, h], i) => (
            <Pagina key={i} doc={doc} numero={i + 1} ancho={w * escala} alto={h * escala} raiz={contenedor} marcas={anotar.notas.filter((n) => n.pagina === i + 1)} />
          ))}
        </div>
      </div>
    </>
  );
}

function Pagina({ doc, numero, ancho, alto, raiz, marcas }) {
  const caja = useRef(null);
  const [visible, setVisible] = useState(false);
  // Capa de las marcas, encima del texto; la dibuja React aunque la página se pinte a mano
  const [capaMarcas] = useState(() => Object.assign(document.createElement('div'), { className: 'pdf-marcas' }));

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { root: raiz.current, rootMargin: '150% 0px' });
    obs.observe(caja.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    // Lejos de la pantalla se libera el dibujo: cada página es un lienzo de varios MB
    if (!visible) { caja.current.replaceChildren(); return; }
    let render;
    let texto;
    let cancelado = false;
    (async () => {
      const pagina = await doc.getPage(numero);
      if (cancelado) return;
      // Cada página entra completa en su lugar, aunque no mida lo mismo que la primera
      const propia = pagina.getViewport({ scale: 1 });
      const escala = Math.min(ancho / propia.width, alto / propia.height);
      const vista = pagina.getViewport({ scale: escala });
      const dpr = window.devicePixelRatio || 1;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.floor(vista.width * dpr);
      lienzo.height = Math.floor(vista.height * dpr);
      render = pagina.render({ canvas: lienzo, viewport: vista, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await render.promise;
      if (cancelado) return;
      const capa = document.createElement('div');
      capa.className = 'textLayer';
      caja.current.style.width = `${vista.width}px`;
      caja.current.style.height = `${vista.height}px`;
      caja.current.replaceChildren(lienzo, capa, capaMarcas);
      // Capa de texto invisible encima del dibujo, para poder seleccionar y copiar
      caja.current.style.setProperty('--total-scale-factor', escala);
      texto = new TextLayer({ textContentSource: pagina.streamTextContent(), container: capa, viewport: vista });
      await texto.render();
    })().catch(() => {});
    return () => { cancelado = true; render?.cancel(); texto?.cancel(); };
  }, [visible, ancho, alto]);

  return (
    <div className="pdf-celda">
      {marcas.length > 0 && createPortal(marcas.map((n) => <Marca key={n.id} nota={n} />), capaMarcas)}
      <div
        ref={caja}
        className="pdf-pagina"
        data-pagina={numero}
        style={{ width: ancho, height: alto }}
        aria-label={t('pdf.pagina', { n: numero })}
      />
    </div>
  );
}

function Marca({ nota }) {
  const ultimo = nota.rects.length - 1;
  return nota.rects.map(([x, y, w, h], i) => (
    <span
      key={i}
      className={`pdf-marca marca-${nota.tipo} ${nota.nota && i === ultimo ? 'con-nota' : ''}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
    />
  ));
}

// La selección dentro de una página del PDF, o null. Solo cuenta la página donde
// empieza: una marca que cruza de página quedaría partida.
function seleccionPdf(contenedor) {
  const sel = document.getSelection();
  if (!contenedor || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  const rango = sel.getRangeAt(0);
  const inicio = rango.startContainer.nodeType === 1 ? rango.startContainer : rango.startContainer.parentElement;
  const pagina = inicio?.closest('.pdf-pagina');
  if (!pagina || !contenedor.contains(pagina)) return null;
  const texto = sel.toString().replace(/\s+/g, ' ').trim();
  if (!texto) return null;
  const caja = pagina.getBoundingClientRect();
  const crudos = [...rango.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1 && r.bottom > caja.top && r.top < caja.bottom && r.right > caja.left && r.left < caja.right)
    .map((r) => {
      const izq = Math.max(r.left, caja.left);
      const der = Math.min(r.right, caja.right);
      return [(izq - caja.left) / caja.width, (r.top - caja.top) / caja.height, (der - izq) / caja.width, r.height / caja.height];
    })
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  // Los pedazos de una misma línea se juntan en un solo rectángulo
  const rects = [];
  for (const r of crudos) {
    const previo = rects[rects.length - 1];
    if (previo && Math.abs(previo[1] - r[1]) < Math.min(previo[3], r[3]) * 0.6 && r[0] <= previo[0] + previo[2] + 0.03) {
      const fin = Math.max(previo[0] + previo[2], r[0] + r[2]);
      const arriba = Math.min(previo[1], r[1]);
      const abajo = Math.max(previo[1] + previo[3], r[1] + r[3]);
      previo[0] = Math.min(previo[0], r[0]);
      previo[2] = fin - previo[0];
      previo[1] = arriba;
      previo[3] = abajo - arriba;
    } else rects.push([...r]);
  }
  if (!rects.length) return null;
  const redondear = (v) => Math.round(v * 10000) / 10000;
  const b = rango.getBoundingClientRect();
  return {
    texto,
    rect: { left: b.left, top: b.top, bottom: b.bottom, width: b.width },
    ancla: { pagina: Number(pagina.dataset.pagina), rects: rects.map((r) => r.map(redondear)) },
    limpiar: () => sel.removeAllRanges(),
  };
}
