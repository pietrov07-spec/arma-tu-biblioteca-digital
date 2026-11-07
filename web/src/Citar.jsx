import { useState } from 'react';
import { ESTILOS, citar, comoHtml, comoTexto } from './citas.js';
import { t } from './textos.jsx';

const leer = (clave, defecto) => { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch { return defecto; } };
const guardar = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {} };

// Cita de la obra en el estilo elegido. El estilo se recuerda para todas las
// fichas. Editorial y ciudad vienen del catálogo (columnas M y N de
// Correcciones) y se pueden cambiar aquí, por obra y solo en este dispositivo.
export default function Citar({ obra }) {
  const [estilo, setEstilo] = useState(() => leer('cita-estilo', 'apa'));
  // Lo escrito aquí manda; si no hay nada, lo de la hoja de Correcciones (M y N)
  const [datos, setDatos] = useState(() => leer(`cita:${obra.id}`, null) || { editorial: obra.ed || '', ciudad: obra.lu || '' });
  const [copiado, setCopiado] = useState(false);
  const [paraHoja, setParaHoja] = useState(false);
  const cita = citar(estilo, obra, datos);

  const elegir = (id) => { setEstilo(id); guardar('cita-estilo', id); setCopiado(false); };
  const cambiar = (campo) => (e) => {
    const nuevos = { ...datos, [campo]: e.target.value };
    setDatos(nuevos);
    guardar(`cita:${obra.id}`, nuevos);
    setCopiado(false);
    setParaHoja(false);
  };

  // Separadas por tabulador: pegadas en la columna M, la ciudad cae en la N
  async function copiarParaHoja() {
    try {
      await navigator.clipboard.writeText(`${datos.editorial.trim()}\t${datos.ciudad.trim()}`);
      setParaHoja(true);
    } catch {}
  }

  // Con formato (cursivas) donde se pueda; si no, texto plano
  async function copiar() {
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([comoHtml(cita)], { type: 'text/html' }),
          'text/plain': new Blob([comoTexto(cita)], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(comoTexto(cita));
      }
      setCopiado(true);
    } catch {}
  }

  return (
    <div className="citar">
      <div className="citar-estilos" role="tablist" aria-label={t('cita.estilo')}>
        {ESTILOS.map((e) => (
          <button key={e.id} role="tab" aria-selected={estilo === e.id} className="chip" onClick={() => elegir(e.id)}>{e.nombre}</button>
        ))}
      </div>
      <p className="cita" aria-live="polite">
        {cita.map(([texto, cursiva], i) => (cursiva ? <i key={i}>{texto}</i> : <span key={i}>{texto}</span>))}
      </p>
      <button className="boton-secundario" onClick={copiar}>{copiado ? t('cita.copiada') : t('cita.copiar')}</button>
      <details className="citar-datos" open={Boolean(datos.editorial || datos.ciudad) || undefined}>
        <summary>{t('cita.agregar')}</summary>
        <label>
          <span className="etiqueta">{t('cita.editorial')}</span>
          <input value={datos.editorial} onChange={cambiar('editorial')} placeholder={t('cita.editorialEj')} />
        </label>
        <label>
          <span className="etiqueta">{t('cita.ciudad')}</span>
          <input value={datos.ciudad} onChange={cambiar('ciudad')} placeholder={t('cita.ciudadEj')} />
        </label>
        <p className="nota">{t('cita.local')}</p>
        <button className="boton-secundario" onClick={copiarParaHoja} disabled={!datos.editorial.trim() && !datos.ciudad.trim()}>
          {paraHoja ? t('cita.copiado') : t('cita.paraHoja')}
        </button>
        {paraHoja && (
          <p className="nota" role="status">{t('cita.instrucciones', { titulo: obra.t })}</p>
        )}
      </details>
      <p className="nota">{t('cita.revisa')}</p>
    </div>
  );
}
