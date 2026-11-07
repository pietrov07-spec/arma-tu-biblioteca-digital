import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icono from './Iconos.jsx';
import { CLIENT_ID } from './config.js';
import { permisoPersonal } from './google.js';
import { t } from './textos.jsx';
import { activarSincronizacion, borrarNota, guardarNota } from './personal.js';

// Barra que aparece sobre el texto elegido (o sobre una marca ya hecha) y panel
// con todas las notas del archivo. Los lectores solo avisan qué se eligió y
// dónde; aquí se decide qué hacer con eso.

const ANCHO_MENU = 320;

// Coloca la barra arriba de la selección o, si no cabe (o en pantalla táctil,
// donde el sistema pone ahí su propio menú), abajo.
function lugar(rect, alto) {
  const tactil = matchMedia('(pointer: coarse)').matches;
  const margen = 8;
  const arriba = rect.top - alto - margen;
  const top = !tactil && arriba > 60 ? arriba : Math.min(rect.bottom + margen, innerHeight - alto - margen);
  const left = Math.min(Math.max(margen, rect.left + rect.width / 2 - ANCHO_MENU / 2), innerWidth - ANCHO_MENU - margen);
  return { top, left };
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); } catch {}
}

// `menu`: { rect, sel } para un texto recién elegido o { rect, nota } para una marca existente
export function MenuNotas({ menu, base, cerrar, editar }) {
  const caja = useRef(null);
  const [pos, setPos] = useState(null);
  const [editando, setEditando] = useState(menu.editar ? menu.nota : null);

  useLayoutEffect(() => {
    setPos(lugar(menu.rect, caja.current?.offsetHeight || 48));
  }, [menu.rect, editando]);

  const crear = (tipo, conNota) => {
    const { texto, ancla, fraccion, limpiar } = menu.sel;
    const nota = guardarNota({ ...base, ...ancla, tipo, texto, fraccion });
    // Con «Nota» la barra pasa a ser la de la marca nueva, con su editor abierto:
    // así no se cierra cuando la selección desaparece
    if (conNota) editar(nota);
    else cerrar();
    limpiar?.();
  };

  const nota = menu.nota;
  return (
    <div ref={caja} className="menu-notas" role="dialog" aria-label={t('notas.marcar')} style={pos || { visibility: 'hidden' }}>
      {editando ? (
        <EditorNota nota={editando} nueva={menu.nueva} cerrar={cerrar} />
      ) : menu.sel ? (
        // Sin robar el foco al tocar, para no perder la selección antes de guardarla
        <div className="menu-notas-botones" onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => crear('resaltar')}><span className="muestra muestra-resaltar" aria-hidden="true" />{t('notas.resaltar')}</button>
          <button onClick={() => crear('subrayar')}><span className="muestra muestra-subrayar" aria-hidden="true" />{t('notas.subrayar')}</button>
          <button onClick={() => crear('resaltar', true)}>{t('notas.nota')}</button>
          <button onClick={() => { copiar(menu.sel.texto); menu.sel.limpiar?.(); cerrar(); }}>{t('copiar')}</button>
        </div>
      ) : (
        <div className="menu-notas-botones">
          <button onClick={() => setEditando(nota)}>{nota.nota ? t('notas.editar') : t('notas.nota')}</button>
          <button onClick={() => { guardarNota({ id: nota.id, tipo: nota.tipo === 'subrayar' ? 'resaltar' : 'subrayar' }); cerrar(); }}>
            {nota.tipo === 'subrayar' ? t('notas.resaltar') : t('notas.subrayar')}
          </button>
          <button onClick={() => { copiar(nota.texto); cerrar(); }}>{t('copiar')}</button>
          <button onClick={() => { borrarNota(nota.id); cerrar(); }}>{t('quitar')}</button>
        </div>
      )}
      {!editando && nota?.nota && <p className="menu-notas-texto">{nota.nota}</p>}
    </div>
  );
}

function EditorNota({ nota, nueva, cerrar }) {
  const [texto, setTexto] = useState(nota.nota || '');
  const campo = useRef(null);
  // Al venir de una selección dentro del libro (otro documento), el foco tarda en volver
  useEffect(() => {
    campo.current?.focus();
    const t = setTimeout(() => document.activeElement !== campo.current && campo.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  const guardar = () => { guardarNota({ id: nota.id, nota: texto.trim() }); cerrar(); };
  // «Nota» crea la marca al abrir el editor; si se cancela sin escribir, no queda
  const cancelar = () => { if (nueva && !nota.nota) borrarNota(nota.id); cerrar(); };
  return (
    <div className="editor-nota">
      <label className="sr" htmlFor="editor-nota-campo">{t('notas.tuNota')}</label>
      <textarea
        id="editor-nota-campo"
        ref={campo}
        value={texto}
        rows={4}
        placeholder={t('notas.escribe')}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar();
          if (e.key === 'Escape') { e.stopPropagation(); cancelar(); }
        }}
      />
      <div className="editor-nota-acciones">
        <button className="enlace" onClick={cancelar}>{t('cancelar')}</button>
        <button className="boton-primario" onClick={guardar}>{t('guardar')}</button>
      </div>
    </div>
  );
}

export const ubicacion = (n) => (n.pagina ? t('notas.pagina', { n: n.pagina }) : n.fraccion !== undefined ? `${Math.round(n.fraccion * 100)} %` : '');

// Las notas como texto, para llevarlas a un documento de trabajo
export function notasComoTexto(obra, notas) {
  const cabecera = [t('notas.titulo', { titulo: obra.t }), obra.a?.length ? obra.a.join(', ') : '', obra.y ? String(obra.y) : ''].filter(Boolean).join('\n\n');
  const cuerpo = notas.map((n) => {
    const cita = `> ${(n.texto || '').replace(/\s+/g, ' ').trim()}${ubicacion(n) ? ` (${ubicacion(n)})` : ''}`;
    return n.nota ? `${cita}\n\n${n.nota}` : cita;
  });
  return `${cabecera}\n\n${cuerpo.join('\n\n---\n\n')}\n`;
}

function descargar(obra, texto) {
  const nombre = `${obra.t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110)} (${t('notas.archivo')}).md`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Dónde se guarda lo personal y, si aún no se sincroniza, el botón para hacerlo
export function AvisoSincronizacion({ que }) {
  const [estado, setEstado] = useState('');
  if (!CLIENT_ID) return <p className="nota">{t(`sinc.local.${que}`)}</p>;
  if (permisoPersonal()) return <p className="nota">{t(`sinc.cuenta.${que}`)}</p>;
  async function activar() {
    setEstado('pidiendo');
    try {
      setEstado((await activarSincronizacion()) ? '' : 'negado');
    } catch (e) {
      setEstado(e.message);
    }
  }
  return (
    <div className="aviso-sincronizar">
      <p className="nota">{t(`sinc.pedir.${que}`)}</p>
      <button className="boton-secundario" onClick={activar} disabled={estado === 'pidiendo'}>
        {estado === 'pidiendo' ? t('acceso.esperando') : t('sinc.boton')}
      </button>
      {estado === 'negado' && <p className="nota">{t('sinc.negado')}</p>}
      {estado && estado !== 'pidiendo' && estado !== 'negado' && <p className="nota">{estado}</p>}
    </div>
  );
}

export function PanelNotas({ obra, notas, irA, cerrar }) {
  const [copiado, setCopiado] = useState(false);
  const panel = useRef(null);
  useEffect(() => { panel.current?.querySelector('.panel-notas-cerrar')?.focus(); }, []);

  return (
    <aside ref={panel} className="panel-notas" aria-label={t('lector.tusNotas')}>
      <header className="panel-notas-cabecera">
        <h2>{t('lector.tusNotas')} <span>{notas.length}</span></h2>
        <button className="boton-icono panel-notas-cerrar" onClick={cerrar} aria-label={t('notas.cerrar')}>
          <Icono nombre="cerrar" />
        </button>
      </header>

      {notas.length === 0 ? (
        <p className="nota">{t('notas.vacio')}</p>
      ) : (
        <ol className="panel-notas-lista">
          {notas.map((n) => (
            <li key={n.id}>
              <button className={`panel-nota-cita marca-${n.tipo}`} onClick={() => irA(n)}>
                <span className="panel-nota-texto">{n.texto}</span>
                {ubicacion(n) && <span className="panel-nota-lugar">{ubicacion(n)}</span>}
              </button>
              {n.nota && <p className="panel-nota-comentario">{n.nota}</p>}
              <button className="enlace panel-nota-quitar" onClick={() => borrarNota(n.id)} aria-label={t('notas.quitarMarca', { texto: n.texto.slice(0, 40) })}>{t('quitar')}</button>
            </li>
          ))}
        </ol>
      )}

      {notas.length > 0 && (
        <div className="panel-notas-acciones">
          <button className="boton-secundario" onClick={() => descargar(obra, notasComoTexto(obra, notas))}>{t('notas.descargar')}</button>
          <button
            className="boton-secundario"
            onClick={async () => { await copiar(notasComoTexto(obra, notas)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
          >
            {copiado ? t('notas.copiadas') : t('notas.copiarTodas')}
          </button>
        </div>
      )}
      <AvisoSincronizacion que="notas" />
    </aside>
  );
}
