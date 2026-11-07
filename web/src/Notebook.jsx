import { useEffect, useRef, useState } from 'react';
import Icono from './Iconos.jsx';
import { t } from './textos.jsx';
import { GEMINI_NOTEBOOK, guardarTexto, libroComoTexto, libroDe, pdfComoTexto, pdfDe } from './notebook.js';

// Panel para llevar una o varias obras a Gemini Notebook: los PDF se agregan desde
// Drive buscando el título; el resto se descarga como .md para subirlo.
export default function Notebook({ obras, cerrar }) {
  const panel = useRef(null);
  const [estados, setEstados] = useState({});
  const [copiado, setCopiado] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const desdeDrive = obras.filter((o) => pdfDe(o));
  const paraSubir = obras.filter((o) => !pdfDe(o) && libroDe(o));
  const sinRuta = obras.filter((o) => !pdfDe(o) && !libroDe(o));

  useEffect(() => {
    const anterior = document.activeElement;
    panel.current?.querySelector('.ficha-cerrar')?.focus();
    const tecla = (e) => e.key === 'Escape' && !trabajando && cerrar();
    document.addEventListener('keydown', tecla);
    document.body.classList.add('sin-scroll');
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('sin-scroll');
      anterior?.focus?.();
    };
  }, [cerrar, trabajando]);

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      setTimeout(() => setCopiado((c) => (c === texto ? '' : c)), 2000);
    } catch {}
  }

  // Descarga el archivo, lo convierte en memoria y guarda el .md
  async function convertir(o, comoPdf) {
    const poner = (v) => setEstados((e) => ({ ...e, [o.id]: v }));
    try {
      const texto = comoPdf ? await pdfComoTexto(o, pdfDe(o), poner) : await libroComoTexto(o, libroDe(o), poner);
      guardarTexto(o, texto);
      poner('listo');
    } catch (e) {
      poner(new Error(e.message));
    }
  }

  // Uno por uno, para no cargar varios libros en memoria a la vez
  async function preparar(lista, comoPdf) {
    setTrabajando(true);
    for (const o of lista) if (estados[o.id] !== 'listo') await convertir(o, comoPdf);
    setTrabajando(false);
  }

  const estadoTexto = (v) =>
    v === undefined ? '' : v === 'listo' ? t('nb.descargado') : v instanceof Error ? t('nb.error', { error: v.message }) : `${Math.round(v * 100)} %`;

  return (
    <div className="ficha-fondo" onClick={() => !trabajando && cerrar()}>
      <aside ref={panel} className="ficha notebook" role="dialog" aria-modal="true" aria-labelledby="notebook-titulo" onClick={(e) => e.stopPropagation()}>
        <button className="ficha-cerrar boton-icono" onClick={cerrar} aria-label={t('nb.cerrar')} disabled={trabajando}>
          <Icono nombre="cerrar" />
        </button>

        <h2 id="notebook-titulo" className="ficha-titulo">{t('llevarNotebook')}</h2>
        <p className="ficha-autores">{obras.length === 1 ? obras[0].t : t('nb.obras', { n: obras.length })}</p>

        <ol className="pasos">
          <li>
            <p>{t('nb.paso1')}</p>
            <a className="boton-primario" href={GEMINI_NOTEBOOK} target="_blank" rel="noopener noreferrer">
              {t('nb.abrir')} <Icono nombre="externo" tamano={16} />
            </a>
          </li>

          {desdeDrive.length > 0 && (
            <li>
              <p>{t('nb.drive', { n: desdeDrive.length })}</p>
              <ul className="notebook-obras">
                {desdeDrive.map((o) => (
                  <li key={o.id}>
                    <span>{o.t}</span>
                    {estados[o.id] !== undefined ? (
                      <span className={`notebook-estado ${estados[o.id] instanceof Error ? 'error' : ''}`} aria-live="polite">{estadoTexto(estados[o.id])}</span>
                    ) : (
                      <button className="chip" onClick={() => copiar(o.t)}>{copiado === o.t ? t('nb.copiado') : t('nb.copiarTitulo')}</button>
                    )}
                  </li>
                ))}
              </ul>
              <details className="notebook-alterno">
                <summary>{t('nb.alterno')}</summary>
                <p className="nota">{t('nb.alternoNota')}</p>
                <button className="boton-secundario" onClick={() => preparar(desdeDrive, true)} disabled={trabajando}>
                  {trabajando ? t('nb.preparando') : t('nb.pdfTexto', { n: desdeDrive.length })}
                </button>
              </details>
            </li>
          )}

          {paraSubir.length > 0 && (
            <li>
              <p>{t('nb.subir', { formatos: paraSubir.map((o) => libroDe(o).x.toUpperCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ') })}</p>
              <ul className="notebook-obras">
                {paraSubir.map((o) => (
                  <li key={o.id}>
                    <span>{o.t}</span>
                    <span className={`notebook-estado ${estados[o.id] instanceof Error ? 'error' : ''}`} aria-live="polite">{estadoTexto(estados[o.id])}</span>
                  </li>
                ))}
              </ul>
              <button className="boton-primario" onClick={() => preparar(paraSubir, false)} disabled={trabajando}>
                {trabajando ? t('nb.preparando') : t('nb.textos', { n: paraSubir.length })}
              </button>
              {paraSubir.length > 1 && <p className="nota">{t('nb.varias')}</p>}
            </li>
          )}

          {sinRuta.length > 0 && (
            <li>
              <p><b>{t('nb.sinFormato')}</b> {sinRuta.map((o) => o.t).join(', ')}.</p>
            </li>
          )}
        </ol>

        <p className="nota">{t('nb.privado')}</p>
      </aside>
    </div>
  );
}
