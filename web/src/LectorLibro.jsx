import { useEffect, useRef, useState } from 'react';
import { sonarPagina } from './sonido.js';
import 'foliate-js/view.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import { obtenerLibro } from './copias.js';
import { t } from './textos.jsx';

// Estilos que se inyectan dentro del libro (cada capítulo es un iframe aparte)
const estilos = (letra, marfil) => `
  html { color-scheme: light; }
  html, body { background: transparent !important; color: #16201C !important; }
  body { font-family: Charter, 'Bitstream Charter', 'Iowan Old Style', 'Palatino Linotype', Palatino, serif; font-size: ${letra}% !important; line-height: 1.6; hyphens: auto; }
  p { text-align: justify; }
  a { color: ${marfil ? '#16201C' : '#0D5F50'} !important; }
  img, svg { max-width: 100%; height: auto; }
`;

// Lector de EPUB, MOBI, AZW3 y FB2 con foliate-js, paginado como un libro.
export default function LectorLibro({ archivo, posicion, guardar, alAvanzar, controles, marfil, anotar }) {
  const caja = useRef(null);
  const vista = useRef(null);
  const [listo, setListo] = useState(false);
  const [indice, setIndice] = useState([]);
  const [capitulo, setCapitulo] = useState('');
  const [avance, setAvance] = useState(0);
  const [letra, setLetra] = useState(() => Number(localStorage.getItem('lector-letra')) || 110);
  // Lo que cambia mientras el libro está abierto, para los oyentes que se ponen una sola vez
  const vivo = useRef({});
  vivo.current = { anotar, avance };

  useEffect(() => {
    const control = new AbortController();
    const v = document.createElement('foliate-view');
    vista.current = v;
    (async () => {
      const blob = await obtenerLibro(archivo, { alAvanzar, senal: control.signal });
      // foliate reconoce FB2 por la extensión
      await v.open(new File([blob], `libro.${archivo.x}`));
      if (control.signal.aborted) return;
      caja.current.append(v);
      v.renderer.setAttribute('margin', '48px');
      v.renderer.setAttribute('gap', '6%');
      v.renderer.setAttribute('max-inline-size', '680px');
      // Las marcas se dibujan con el Overlayer de foliate, ancladas por CFI
      v.addEventListener('create-overlay', () => {
        for (const n of vivo.current.anotar.notas) v.addAnnotation({ value: n.cfi, tipo: n.tipo });
      });
      v.addEventListener('draw-annotation', ({ detail: { draw, annotation } }) => {
        if (annotation.tipo === 'subrayar') draw(Overlayer.underline, { color: '#d9482b', width: 2, padding: 2 });
        else draw(Overlayer.highlight, { color: '#7fe0bb' });
      });
      v.addEventListener('show-annotation', ({ detail: { value, range } }) => {
        const nota = vivo.current.anotar.notas.find((n) => n.cfi === value);
        if (nota) vivo.current.anotar.alTocar(nota, enPantalla(range));
      });
      v.addEventListener('relocate', ({ detail }) => {
        setAvance(detail.fraction || 0);
        setCapitulo(detail.tocItem?.href || '');
        if (detail.cfi) guardar({ cfi: detail.cfi }, detail.fraction);
      });
      // Las flechas también funcionan con el foco dentro del texto del libro
      v.addEventListener('load', ({ detail: { doc, index } }) => {
        doc.addEventListener('keydown', teclas);
        // Texto elegido dentro del capítulo
        let espera = 0;
        doc.addEventListener('selectionchange', () => {
          clearTimeout(espera);
          espera = setTimeout(() => {
            const sel = doc.getSelection();
            const texto = sel?.toString().replace(/\s+/g, ' ').trim();
            if (!sel || sel.isCollapsed || !sel.rangeCount || !texto) return vivo.current.anotar.alSeleccionar(null);
            const rango = sel.getRangeAt(0);
            vivo.current.anotar.alSeleccionar({
              texto,
              rect: enPantalla(rango),
              ancla: { cfi: v.getCFI(index, rango) },
              fraccion: vivo.current.avance,
              limpiar: () => sel.removeAllRanges(),
            });
          }, 250);
        });
      });
      // Solo cuando quien lee pasa la página; saltar de capítulo o cambiar la letra no suena
      v.renderer.addEventListener('relocate', ({ detail }) => {
        if (detail.reason === 'page' || detail.reason === 'snap') sonarPagina();
      });
      setIndice(aplanar(v.book.toc || []));
      await v.init({ lastLocation: posicion?.cfi, showTextStart: !posicion?.cfi });
      setListo(true);
      alAvanzar(1);
    })().catch((e) => !control.signal.aborted && alAvanzar(e));
    return () => { control.abort(); v.close?.(); v.remove(); };
  }, [archivo.id]);

  // Al crear, cambiar o borrar una nota se redibuja solo esa marca
  const dibujadas = useRef(new Map());
  useEffect(() => {
    if (!listo) return;
    const v = vista.current;
    const actuales = new Map(anotar.notas.map((n) => [n.cfi, n.tipo]));
    for (const [cfi, tipo] of actuales) if (dibujadas.current.get(cfi) !== tipo) v.addAnnotation({ value: cfi, tipo }).catch(() => {});
    for (const cfi of dibujadas.current.keys()) if (!actuales.has(cfi)) v.deleteAnnotation({ value: cfi }).catch(() => {});
    dibujadas.current = actuales;
  }, [listo, anotar.notas]);
  anotar.destino.current = (n) => vista.current?.goTo(n.cfi);

  useEffect(() => {
    if (!listo) return;
    vista.current.renderer.setStyles?.(estilos(letra, marfil));
    try { localStorage.setItem('lector-letra', letra); } catch {}
  }, [listo, letra, marfil]);

  function teclas(e) {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') vista.current?.goLeft();
    if (e.key === 'ArrowRight') vista.current?.goRight();
  }
  useEffect(() => {
    document.addEventListener('keydown', teclas);
    return () => document.removeEventListener('keydown', teclas);
  }, []);

  return (
    <>
      {controles(listo && (
        <div className="lector-controles">
          {indice.length > 0 && (
            <label className="lector-indice">
              <span className="sr">{t('lector.capitulo')}</span>
              <select value={indice.some((i) => i.href === capitulo) ? capitulo : ''} onChange={(e) => vista.current.goTo(e.target.value)}>
                <option value="" disabled>{t('lector.indice')}</option>
                {indice.map((i) => <option key={i.href + i.label} value={i.href}>{' '.repeat(i.nivel) + i.label}</option>)}
              </select>
            </label>
          )}
          <div className="lector-zoom" role="group" aria-label={t('lector.letra')}>
            <button className="boton-icono" onClick={() => setLetra((l) => Math.max(80, l - 10))} aria-label={t('lector.letraMenos')} disabled={letra <= 80}>A−</button>
            <button className="boton-icono" onClick={() => setLetra((l) => Math.min(180, l + 10))} aria-label={t('lector.letraMas')} disabled={letra >= 180}>A+</button>
          </div>
          <span className="lector-avance">{Math.round(avance * 100)} %</span>
        </div>
      ))}
      <div className="libro">
        <button className="libro-paso" onClick={() => vista.current?.goLeft()} aria-label={t('lector.anterior')} disabled={!listo}>‹</button>
        <div ref={caja} className="libro-texto" />
        <button className="libro-paso" onClick={() => vista.current?.goRight()} aria-label={t('lector.siguiente')} disabled={!listo}>›</button>
      </div>
    </>
  );
}

function aplanar(items, nivel = 0) {
  return items.flatMap((i) => [{ href: i.href, label: i.label?.trim() || '—', nivel }, ...aplanar(i.subitems || [], nivel + 1)]);
}

// Un rango de dentro del libro (otro documento, en un iframe) en coordenadas de la pantalla
function enPantalla(rango) {
  const r = rango.getBoundingClientRect();
  const marco = rango.startContainer.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();
  const dx = marco?.left || 0;
  const dy = marco?.top || 0;
  return { left: r.left + dx, top: r.top + dy, bottom: r.bottom + dy, width: r.width };
}
