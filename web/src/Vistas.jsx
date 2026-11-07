import { useEffect, useRef, useState } from 'react';
import Portada from './Portada.jsx';
import { autoresTexto } from './util.js';
import { t } from './textos.jsx';

const PASO = 120;

// Muestra los elementos por tandas: con más de mil obras, pintar todo de golpe
// carga cientos de portadas que nadie está viendo.
function useTandas(total, reinicio) {
  const [visibles, setVisibles] = useState(PASO);
  const centinela = useRef(null);
  useEffect(() => setVisibles(PASO), [reinicio]);
  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisibles((v) => Math.min(v + PASO, total));
    }, { rootMargin: '800px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [total, visibles]);
  return [visibles, visibles < total ? <div ref={centinela} className="centinela" aria-hidden="true" /> : null];
}

export function Cuadricula({ obras, abrir, seleccion, reinicio, aviso }) {
  const [visibles, centinela] = useTandas(obras.length, reinicio);
  return (
    <>
      <ul className="cuadricula">
        {obras.slice(0, visibles).map((o) => (
          <li key={o.id}>
            <button className="tarjeta" onClick={() => abrir(o)} aria-pressed={seleccion ? seleccion.has(o.id) : undefined}>
              <Portada obra={o} />
              <span className="tarjeta-titulo">{o.t}</span>
              <span className="tarjeta-autor">{autoresTexto(o.a)}</span>
              {aviso && <span className="tarjeta-aviso">{aviso(o)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {centinela}
    </>
  );
}

export function Lista({ obras, abrir, seleccion, reinicio }) {
  const [visibles, centinela] = useTandas(obras.length, reinicio);
  return (
    <>
      <table className="lista">
        <thead>
          <tr>
            <th scope="col">{t('orden.titulo')}</th>
            <th scope="col">{t('orden.autor')}</th>
            <th scope="col" className="num">{t('ficha.anio')}</th>
            <th scope="col">{t('ficha.coleccion')}</th>
            <th scope="col">{t('lista.formatos')}</th>
          </tr>
        </thead>
        <tbody>
          {obras.slice(0, visibles).map((o) => (
            <tr key={o.id} className={seleccion?.has(o.id) ? 'elegida' : undefined}>
              <td>
                <button className="enlace-fila" onClick={() => abrir(o)} aria-pressed={seleccion ? seleccion.has(o.id) : undefined}>{o.t}</button>
              </td>
              <td>{autoresTexto(o.a)}</td>
              <td className={`num ${o.y ? '' : 'vacia'}`}>{o.y || '—'}</td>
              <td>{o.c.join(', ')}</td>
              <td className="formatos">{[...new Set(o.f.map((f) => f.x))].join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {centinela}
    </>
  );
}
