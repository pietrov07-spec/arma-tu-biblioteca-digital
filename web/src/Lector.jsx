import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuNotas, PanelNotas } from './Anotaciones.jsx';
import Icono from './Iconos.jsx';
import { notasDe, usePersonal } from './personal.js';
import { guardarSonido, sonidoActivo } from './sonido.js';
import { tamano, urlDrive } from './util.js';
import { DEMO } from './config.js';
import { t } from './textos.jsx';

// Cada lector se carga solo cuando hace falta: pdf.js pesa más que el resto de la app.
const LectorPdf = lazy(() => import('./LectorPdf.jsx'));
const LectorLibro = lazy(() => import('./LectorLibro.jsx'));

export const LEIBLES = ['pdf', 'epub', 'mobi', 'azw3', 'fb2'];

const clave = (id) => `lectura:${id}`;
export function leerPosicion(id) {
  try { return JSON.parse(localStorage.getItem(clave(id))); } catch { return null; }
}

// Con el tema Marfil la barra se aparta sola para dejar solo el texto. Vuelve al
// llevar el cursor arriba, con el botón de la esquina o al navegar con teclado.
const PAUSA_BARRA = 2500;

export default function Lector({ obra, archivo, cerrar, marfil }) {
  const [carga, setCarga] = useState(0);
  const [error, setError] = useState(null);
  const [ranura, setRanura] = useState(null);
  const [conSonido, setConSonido] = useState(sonidoActivo);
  const volver = useRef(null);
  const cabecera = useRef(null);
  const espera = useRef(0);
  const [barra, setBarra] = useState(true);
  const posicion = useRef(leerPosicion(archivo.id)).current;

  // Marcas y notas: los lectores avisan qué texto se eligió o qué marca se tocó
  const personal = usePersonal();
  const notas = useMemo(() => notasDe(personal, archivo.id), [personal, archivo.id]);
  const [menu, setMenu] = useState(null);
  const [panel, setPanel] = useState(false);
  const destino = useRef(null);
  const abiertos = useRef({});
  abiertos.current = { menu, panel };
  const anotar = useMemo(() => ({
    notas,
    destino,
    // Una selección vacía solo cierra la barra de una selección, no la de una marca
    alSeleccionar: (sel) => setMenu((m) => (sel ? { rect: sel.rect, sel } : m?.sel ? null : m)),
    alTocar: (nota, rect) => setMenu({ rect, nota }),
  }), [notas]);
  // Si la marca que estaba abierta se borró, su barra se cierra
  useEffect(() => {
    if (menu?.nota && !notas.some((n) => n.id === menu.nota.id)) setMenu(null);
  }, [notas]);
  const irA = useCallback((n) => {
    destino.current?.(n);
    if (matchMedia('(max-width: 640px)').matches) setPanel(false);
  }, []);

  useEffect(() => {
    volver.current?.focus();
    document.body.classList.add('sin-scroll');
    const tecla = (e) => {
      if (e.key !== 'Escape' || e.target.closest?.('input, select, textarea')) return;
      // Escape cierra primero la barra o el panel de notas, y luego el lector
      if (abiertos.current.menu) return setMenu(null);
      if (abiertos.current.panel) return setPanel(false);
      cerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.body.classList.remove('sin-scroll');
      document.removeEventListener('keydown', tecla);
    };
  }, [cerrar]);

  const programarOcultar = useCallback(() => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      const foco = document.activeElement;
      // No se aparta mientras se escribe la página o se elige un capítulo
      if (cabecera.current?.contains(foco)) {
        if (foco.matches('input, select')) return programarOcultar();
        foco.blur();
      }
      setBarra(false);
    }, PAUSA_BARRA);
  }, []);
  const mostrarBarra = useCallback(() => { setBarra(true); programarOcultar(); }, [programarOcultar]);

  // No se aparta hasta que el libro esté listo o si hubo un error
  useEffect(() => {
    if (!marfil || carga < 1 || error) { clearTimeout(espera.current); setBarra(true); return undefined; }
    programarOcultar();
    return () => clearTimeout(espera.current);
  }, [marfil, carga, error, programarOcultar]);

  // Los lectores avisan el avance de la descarga (0–1) o un error por aquí
  const alAvanzar = useCallback((x) => (x instanceof Error ? setError(x.message) : setCarga(x)), []);

  const guardar = useCallback((pos, fraccion) => {
    try { localStorage.setItem(clave(archivo.id), JSON.stringify({ ...pos, fraccion, fecha: Date.now() })); } catch {}
  }, [archivo.id]);

  const controles = (jsx) => (ranura && jsx ? createPortal(jsx, ranura) : null);
  const props = { archivo, posicion, guardar, alAvanzar, controles, marfil, anotar };

  return (
    <div className={`lector ${marfil ? 'lector-marfil' : ''} ${barra ? '' : 'barra-oculta'}`} role="dialog" aria-modal="true" aria-label={t('lector.leyendo', { titulo: obra.t })}>
      {marfil && (
        <>
          <div className="lector-zona-barra" aria-hidden="true" onPointerEnter={(e) => e.pointerType === 'mouse' && mostrarBarra()} />
          <button className="boton-icono lector-mostrar" onClick={mostrarBarra} aria-label={t('lector.mostrar')}>
            <Icono nombre="mas" tamano={18} />
          </button>
        </>
      )}
      <header
        ref={cabecera}
        className="lector-cabecera"
        onPointerEnter={() => marfil && clearTimeout(espera.current)}
        onPointerLeave={() => marfil && carga >= 1 && !error && programarOcultar()}
        onFocus={(e) => marfil && e.target.matches(':focus-visible') && mostrarBarra()}
      >
        <button ref={volver} className="boton-icono" onClick={cerrar} aria-label={t('lector.volver')}>
          <Icono nombre="volver" />
        </button>
        <div className="lector-titulo">
          <p>{obra.t}</p>
          <p>{obra.a?.join(', ')}</p>
        </div>
        <div ref={setRanura} className="lector-ranura" />
        <button
          className="boton-icono lector-boton-notas"
          aria-pressed={panel}
          aria-label={t('lector.tusNotasN', { n: notas.length })}
          title={t('lector.tusNotas')}
          onClick={() => setPanel(!panel)}
        >
          <Icono nombre="notas" tamano={18} />
          {notas.length > 0 && <span className="contador" aria-hidden="true">{notas.length}</span>}
        </button>
        <button
          className="boton-icono"
          aria-pressed={conSonido}
          aria-label={t('lector.sonido')}
          title={conSonido ? t('lector.silenciar') : t('lector.activar')}
          onClick={() => { guardarSonido(!conSonido); setConSonido(!conSonido); }}
        >
          <Icono nombre={conSonido ? 'sonido' : 'silencio'} tamano={18} />
        </button>
      </header>

      {carga < 1 && !error && (
        <div className="lector-carga" role="status">
          <p className="lector-carga-titulo">{DEMO ? t('lector.abriendoDemo') : t('lector.abriendo')}</p>
          <div className="barra-avance"><span style={{ transform: `scaleX(${carga})` }} /></div>
          {archivo.s > 0 && <p className="lector-carga-detalle">{t('lector.avance', { pct: Math.round(carga * 100), total: tamano(archivo.s) })}</p>}
        </div>
      )}
      {error && (
        <div className="lector-carga" role="alert">
          <p>{t('lector.error', { error })}</p>
          {!DEMO && <p><a href={urlDrive(archivo.id)} target="_blank" rel="noopener noreferrer">{t('lector.abrirDrive')}</a></p>}
        </div>
      )}

      <div className="lector-cuerpo" hidden={Boolean(error)}>
        <Suspense fallback={null}>
          {archivo.x === 'pdf' ? <LectorPdf {...props} /> : <LectorLibro {...props} />}
        </Suspense>
        {panel && <PanelNotas obra={obra} notas={notas} irA={irA} cerrar={() => setPanel(false)} />}
      </div>
      {menu && (
        <MenuNotas
          key={menu.nota?.id || menu.sel?.texto}
          menu={menu}
          base={{ f: archivo.id, o: obra.id }}
          cerrar={() => setMenu(null)}
          editar={(nota) => setMenu((m) => ({ rect: m.rect, nota, editar: true, nueva: true }))}
        />
      )}
    </div>
  );
}
