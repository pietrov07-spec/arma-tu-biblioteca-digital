import { useMemo, useState } from 'react';
import mundo from './datos/mundo.json';
import coordenadas from './datos/paises.json';
import { SIN_PAIS, nombrePais } from './util.js';
import { idiomaActual, t } from './textos.jsx';
import './mapa.css';

// Encuadres en coordenadas x = lon + 180, y = 90 - lat
const ENCUADRES = [
  { id: 'mundo', x: 0, y: 6, w: 360, h: 142 },
  { id: 'norte', x: 30, y: 28, w: 106, h: 42 },
  { id: 'latina', x: 55, y: 52, w: 105, h: 94 },
  { id: 'europa', x: 155, y: 26, w: 72, h: 30 },
];

export default function Mapa({ obras, pais, elegir }) {
  const [encuadreId, setEncuadreId] = useState('mundo');
  const encuadre = ENCUADRES.find((e) => e.id === encuadreId);
  const [enCelular] = useState(() => matchMedia('(max-width: 640px)').matches);

  const { lugares, sinPais } = useMemo(() => {
    const cuenta = new Map();
    let sin = 0;
    obras.forEach((o) => {
      if (!o.pa) { sin++; return; }
      const lugar = cuenta.get(o.pa) || { codigo: o.pa, n: 0, dudosas: 0 };
      lugar.n++;
      if (o.pd) lugar.dudosas++;
      cuenta.set(o.pa, lugar);
    });
    const orden = [...cuenta.values()].map((l) => ({ ...l, nombre: nombrePais(l.codigo) }));
    orden.sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, idiomaActual()));
    return { lugares: orden, sinPais: sin };
  }, [obras, idiomaActual()]);

  if (!lugares.length) {
    return (
      <div className="vacio">
        <p>{obras.length ? t('mapa.sinPaises') : t('mapa.sinObras')}</p>
        {obras.length > 0 && <p>{t('mapa.aparecen')}</p>}
      </div>
    );
  }

  // Los puntos conservan su tamaño en pantalla al acercar
  const k = (encuadre.w / 360) * (enCelular ? 2 : 1);
  const alternar = (codigo) => elegir(pais === codigo ? '' : codigo);
  const enMapa = lugares.filter((l) => coordenadas[l.codigo]);

  return (
    <section className="mapa" aria-label={t('mapa.etiqueta')}>
      <div className="mapa-encuadres" role="group" aria-label={t('mapa.zona')}>
        {ENCUADRES.map((e) => (
          <button key={e.id} className="chip" aria-pressed={encuadreId === e.id} onClick={() => setEncuadreId(e.id)}>{t(`mapa.${e.id}`)}</button>
        ))}
      </div>

      <svg className="mapa-svg" style={{ aspectRatio: encuadre.w / encuadre.h }} viewBox={`${encuadre.x} ${encuadre.y} ${encuadre.w} ${encuadre.h}`} role="group" aria-label={t('mapa.svg')}>
        <path className="mapa-tierra" d={mundo.d} />
        {/* Los más grandes primero, para que no tapen a los pequeños */}
        {enMapa.map(({ codigo, nombre, n, dudosas }) => {
          const [lon, lat] = coordenadas[codigo];
          const r = (1.9 + Math.sqrt(n) * 0.28) * k;
          return (
            <g
              key={codigo}
              className={`mapa-punto ${pais === codigo ? 'elegido' : ''} ${dudosas === n ? 'por-confirmar' : ''}`}
              transform={`translate(${lon + 180} ${90 - lat})`}
              role="button"
              tabIndex={0}
              aria-pressed={pais === codigo}
              aria-label={t('mapa.punto', { nombre, n })}
              onClick={() => alternar(codigo)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(codigo); } }}
            >
              <title>{`${nombre}: ${n}`}</title>
              <circle className="mapa-punto-toque" r={Math.max(r, 5 * k)} />
              <circle className="mapa-punto-disco" r={r} strokeWidth={0.45 * k} />
              {n > 1 && <text fontSize={Math.min(r * 1.05, 3.2 * k)} dy=".35em">{n}</text>}
            </g>
          );
        })}
      </svg>

      <p className="mapa-nota">
        <span className="mapa-nota-punto" aria-hidden="true" />
        {t('mapa.nota')}
      </p>

      {pais ? (
        <p className="mapa-elegido">
          <strong>{pais === SIN_PAIS ? t('mapa.sinPais') : nombrePais(pais)}</strong>
          {' · '}
          <button className="enlace" onClick={() => elegir('')}>{t('mapa.todos')}</button>
        </p>
      ) : (
        <ul className="mapa-paises">
          {lugares.map(({ codigo, nombre, n, dudosas }) => (
            <li key={codigo}>
              <button onClick={() => elegir(codigo)}>
                <span className="mapa-pais-nombre">{nombre}</span>
                {dudosas > 0 && <span className="mapa-pais-duda">{t('mapa.porConfirmar', { n: dudosas })}</span>}
                <span className="mapa-pais-n">{n}</span>
              </button>
            </li>
          ))}
          {sinPais > 0 && (
            <li>
              <button className="mapa-sin-pais" onClick={() => elegir(SIN_PAIS)}>
                <span className="mapa-pais-nombre">{t('mapa.sinPais')}</span>
                <span className="mapa-pais-n">{sinPais}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
