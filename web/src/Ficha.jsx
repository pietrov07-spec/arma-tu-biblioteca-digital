import { useEffect, useRef } from 'react';
import Citar from './Citar.jsx';
import { anticiparLibro } from './copias.js';
import Icono from './Iconos.jsx';
import Portada from './Portada.jsx';
import { LEIBLES, leerPosicion } from './Lector.jsx';
import { libroDe } from './notebook.js';
import { LIMITE_MOCHILA, agregarAMochila, cuentaNotas, diasRestantes, enMochila, idsMochila, quitarDeMochila, renovarEnMochila, usePersonal } from './personal.js';
import { idioma, nombrePais, tamano, urlDrive } from './util.js';
import { DEMO, esDemo, leibleEnDemo } from './config.js';
import { t } from './textos.jsx';

// En modo demostración solo se leen aquí los archivos de ejemplo
const puedeLeer = (f) => LEIBLES.includes(f.x) && (!DEMO || leibleEnDemo(f.id));

export default function Ficha({ obra, cerrar, filtrarColeccion, leer, notebook }) {
  const panel = useRef(null);
  const personal = usePersonal();
  const guardada = enMochila(personal, obra.id);
  const llena = !guardada && idsMochila(personal).length >= LIMITE_MOCHILA;

  useEffect(() => {
    const anterior = document.activeElement;
    panel.current?.querySelector('.ficha-cerrar')?.focus();
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar();
      if (e.key !== 'Tab' || !panel.current) return;
      // Mantiene el foco dentro del panel
      const foco = panel.current.querySelectorAll('a, button');
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', tecla);
    document.body.classList.add('sin-scroll');
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('sin-scroll');
      anterior?.focus?.();
    };
  }, [obra, cerrar]);

  // Con unos MB el libro queda listo antes de pulsar «Leer»
  useEffect(() => {
    const libro = leer && libroDe(obra);
    if (libro && LEIBLES.includes(libro.x)) anticiparLibro(libro);
  }, [obra.id]);

  const formatos = [...obra.f].sort((a, b) => (a.x === 'epub' ? -1 : b.x === 'epub' ? 1 : 0));

  return (
    <div className="ficha-fondo" onClick={cerrar}>
      <aside
        ref={panel}
        className="ficha"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ficha-cerrar boton-icono" onClick={cerrar} aria-label={t('ficha.cerrar')}>
          <Icono nombre="cerrar" />
        </button>

        <div className="ficha-portada"><Portada obra={obra} grande /></div>

        <h2 id="ficha-titulo" className="ficha-titulo">{obra.t}</h2>
        {obra.to && <p className="ficha-original">{t('ficha.tambien')} <i>{obra.to}</i></p>}
        <p className="ficha-autores">{obra.a?.length ? obra.a.join(', ') : t('autorDesconocido')}</p>

        <dl className="ficha-datos">
          {obra.y && <><dt>{t('ficha.anio')}</dt><dd>{obra.y}</dd></>}
          {obra.pa && (
            <>
              <dt>{t('ficha.pais')}</dt>
              <dd>
                {nombrePais(obra.pa)}
                {obra.pa2 && t('ficha.tambienPais', { pais: nombrePais(obra.pa2) })}
                {obra.pd && t('ficha.porConfirmar')}
              </dd>
            </>
          )}
          {obra.l && <><dt>{t('ficha.idiomas')}</dt><dd>{obra.l.slice(0, 4).map(idioma).join(', ')}</dd></>}
          <dt>{t('ficha.coleccion')}</dt>
          <dd>
            {obra.c.map((c, i) => (
              <span key={c}>
                {i > 0 && ', '}
                <button className="enlace" onClick={() => filtrarColeccion(c)}>{c}</button>
              </span>
            ))}
          </dd>
        </dl>

        {obra.tm && (
          <ul className="temas" aria-label={t('ficha.temas')}>
            {obra.tm.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}

        <h3 className="ficha-seccion">{t('ficha.abrir')}</h3>
        <ul className="archivos">
          {formatos.map((f) => {
            const avance = leer && leerPosicion(f.id)?.fraccion;
            const marcas = cuentaNotas(personal, f.id);
            return (
              <li key={f.id} className="archivo">
                {leer && puedeLeer(f) ? (
                  <button className="archivo-leer" onClick={() => leer(f)}>
                    <Icono nombre="libro" tamano={16} />
                    {avance ? t('ficha.seguir', { pct: Math.round(avance * 100) }) : t('ficha.leer')}
                  </button>
                ) : null}
                <span className="archivo-formato">{f.x}</span>
                {marcas > 0 && <span className="archivo-notas">{t('ficha.notas', { n: marcas })}</span>}
                <span className="archivo-ruta">{f.r || t('ficha.raiz')} · {tamano(f.s)}</span>
                {!esDemo(f.id) && (
                  <a href={urlDrive(f.id)} target="_blank" rel="noopener noreferrer" className="boton-icono archivo-drive" aria-label={t('ficha.abrirEnDrive', { formato: f.x })} title={t('ficha.abrirDrive')}>
                    <Icono nombre="externo" tamano={16} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        <p className="nota">
          {obra.f.length > 1 && !DEMO && t('ficha.copias', { n: obra.f.length })}
          {DEMO ? t('ficha.demo') : t('ficha.iconoDrive')}
        </p>

        <h3 className="ficha-seccion">{t('ficha.estudiar')}</h3>
        <div className="ficha-estudiar">
          {guardada ? (
            <div className="mochila-estado">
              <p><Icono nombre="mochila" tamano={16} /> {t('ficha.enMochila', { dias: t('diasMinus', { n: diasRestantes(personal, obra.id) }) })}</p>
              <button className="enlace" onClick={() => renovarEnMochila(obra.id)}>{t('ficha.renovar')}</button>
              <button className="enlace" onClick={() => quitarDeMochila(obra.id)}>{t('quitar')}</button>
            </div>
          ) : (
            <button className="archivo-leer boton-mochila" onClick={() => agregarAMochila([obra.id])} disabled={llena}>
              <Icono nombre="mochila" tamano={16} /> {t('masMochila')}
            </button>
          )}
          {notebook && (
            <button className="archivo-leer" onClick={notebook}>
              <Icono nombre="cuaderno" tamano={16} /> {t('llevarNotebook')}
            </button>
          )}
        </div>
        {llena && <p className="nota">{t('ficha.llena', { limite: LIMITE_MOCHILA })}</p>}

        <h3 className="ficha-seccion">{t('ficha.citar')}</h3>
        <Citar key={obra.id} obra={obra} />

        {obra.src && (
          <p className="nota">
            {t('ficha.datosDe')}{' '}
            <a href={`https://${obra.src}`} target="_blank" rel="noopener noreferrer">Open Library</a>
            {obra.m === 'media' && t('ficha.probable')}
          </p>
        )}
      </aside>
    </div>
  );
}
