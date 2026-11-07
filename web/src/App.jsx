import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Acceso from './Acceso.jsx';
import Ficha from './Ficha.jsx';
import { cargarCatalogo, cerrarSesion, sesionGuardada } from './google.js';
import { CLIENT_ID, DEMO } from './config.js';
import Marca, { SelectorIdioma } from './Marca.jsx';
import { idiomaActual, t, useIdioma } from './textos.jsx';
import Icono from './Iconos.jsx';
import Lector from './Lector.jsx';
import { AvisoSincronizacion } from './Anotaciones.jsx';
import Notebook from './Notebook.jsx';
import { LIMITE_MOCHILA, agregarAMochila, diasRestantes, idsMochila, sincronizar, usePersonal } from './personal.js';
import { Cuadricula, Lista } from './Vistas.jsx';
import { SIN_PAIS, escribirHash, leerHash, nombrePais, normalizar, textoBusqueda } from './util.js';

// El Estante y sus animaciones solo se descargan si se abre esa vista
const Estante = lazy(() => import('./Estante.jsx'));
// Igual el Mapa, con el dibujo del mundo
const Mapa = lazy(() => import('./Mapa.jsx'));

// La portada viaja entre la franja y la ficha donde el navegador lo permite
function conTransicion(cambio) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return cambio();
  // Con la pestaña oculta el navegador la cancela; el cambio se aplica igual
  document.startViewTransition(() => flushSync(cambio)).ready.catch(() => {});
}

// "Literatura/Poesía" → subcolección, se muestra con sangría
const nombreCorto = (c) => c.split('/').pop();
const nombreLargo = (c) => c.replace('/', ' › ');

const VISTAS = [
  { id: 'cuadricula', icono: 'cuadricula' },
  { id: 'estante', icono: 'estante' },
  // Oculta: sin pestaña, pero la vista sigue disponible con #v=lista
  { id: 'lista', icono: 'lista', oculta: true },
  { id: 'mapa', icono: 'mapa' },
];

const TEMAS = [
  { id: 'marfil', clave: 'tema.marfil', icono: 'marfil' },
  { id: 'light', clave: 'tema.claro', icono: 'sol' },
];

// Cuántas capas hay sobre el catálogo: el país elegido en el mapa, la ficha y, encima, el lector
const nivel = ({ libro, leer, v, p }) => (leer ? 2 : libro ? 1 : 0) + (v === 'mapa' && p ? 1 : 0);

// "¿Por qué…", "«Horn Over»" y "[Article] …" se ordenan por su primera letra
const claveTitulo = (t) => t.replace(/^[^\p{L}\p{N}]+/u, '');
const porTitulo = (a, b) => (a.z ? 1 : 0) - (b.z ? 1 : 0) || claveTitulo(a.t).localeCompare(claveTitulo(b.t), idiomaActual());

const ORDENES = {
  titulo: porTitulo,
  autor: (a, b) => (a.a[0] || '~').localeCompare(b.a[0] || '~', idiomaActual()) || porTitulo(a, b),
  anio: (a, b) => (b.y || 0) - (a.y || 0) || porTitulo(a, b),
};

// Sin ID de cliente la app funciona en modo demostración, con el catálogo de
// ejemplo de web/demo/ que sirve `npm run dev`.
const CON_GOOGLE = Boolean(CLIENT_ID);

export default function App() {
  // Al cambiar el idioma se vuelve a pintar todo
  useIdioma();
  const [sesion, setSesion] = useState(() => !CON_GOOGLE || sesionGuardada());
  if (!sesion) return <Acceso entrar={() => setSesion(true)} />;
  return <Biblioteca salir={CON_GOOGLE ? () => { cerrarSesion(); setSesion(false); } : null} />;
}

function Biblioteca({ salir }) {
  const [obras, setObras] = useState(null);
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState(leerHash);
  const [texto, setTexto] = useState(estado.q);
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || 'marfil');
  const personal = usePersonal();
  const mochila = useMemo(() => idsMochila(personal), [personal]);
  const enMochila = estado.m === '1';

  // Trae Mi Mochila y las notas guardadas desde otro dispositivo
  useEffect(() => { sincronizar(); }, []);

  useEffect(() => {
    const pedir = CON_GOOGLE
      ? cargarCatalogo()
      : fetch('catalogo.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(t('demo.sinCatalogo')))));
    pedir
      // `h`: obra ocultada desde la pestaña Correcciones de la hoja
      .then((datos) => setObras(datos.filter((o) => !o.h).map((o) => ({ ...o, _q: textoBusqueda(o) }))))
      .catch((e) => setError(e.message));
  }, []);

  const actualizar = useCallback((cambios) => setEstado((e) => ({ ...e, ...cambios })), []);
  const nivelPrevio = useRef(nivel(estado));
  useEffect(() => {
    const n = nivel(estado);
    escribirHash(estado, n > nivelPrevio.current);
    nivelPrevio.current = n;
  }, [estado]);

  // Búsqueda en vivo con una pequeña espera para no filtrar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => actualizar({ q: texto }), 160);
    return () => clearTimeout(t);
  }, [texto, actualizar]);

  const colecciones = useMemo(() => {
    const cuenta = new Map();
    obras?.forEach((o) => o.c.forEach((c) => cuenta.set(c, (cuenta.get(c) || 0) + 1)));
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], idiomaActual()));
  }, [obras, idiomaActual()]);

  // El librito se desliza hasta la colección abierta; la lista y la fila de botones
  // se recorren solas si esa colección quedó fuera de la vista.
  const listaColecciones = useRef(null);
  const librito = useRef(null);
  const fijado = useRef(false);
  useLayoutEffect(() => {
    const lista = listaColecciones.current;
    const activa = lista?.querySelector('.coleccion.activa');
    if (activa?.offsetHeight && librito.current) {
      librito.current.style.transition = fijado.current ? '' : 'none';
      librito.current.style.transform = `translateY(${activa.offsetTop + (activa.offsetHeight - 22) / 2}px)`;
      librito.current.style.opacity = 1;
      fijado.current = true;
      const lateral = lista.parentElement;
      const caja = lateral.getBoundingClientRect();
      const r = activa.getBoundingClientRect();
      if (r.top < caja.top || r.bottom > caja.bottom) lateral.scrollTop += r.top - caja.top - caja.height / 2;
    }
    document.querySelectorAll('.carrusel').forEach((fila) => {
      const chip = fila.querySelector('.chip[aria-pressed="true"]');
      if (!chip) return;
      const caja = fila.getBoundingClientRect();
      const r = chip.getBoundingClientRect();
      if (r.left < caja.left || r.right > caja.right) fila.scrollLeft += r.left - caja.left - 16;
    });
  }, [estado.c, estado.m, estado.v, colecciones]);

  // En móvil: colecciones principales en una fila y, debajo, las de la elegida
  const raiz = estado.c.split('/')[0];
  const principales = colecciones.filter(([c]) => !c.includes('/'));
  const hijas = colecciones.filter(([c]) => raiz && c.startsWith(raiz + '/'));

  const formatos = useMemo(() => {
    const cuenta = new Map();
    obras?.forEach((o) => new Set(o.f.map((f) => f.x)).forEach((x) => cuenta.set(x, (cuenta.get(x) || 0) + 1)));
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [obras]);

  const sinFiltroPais = useMemo(() => {
    if (!obras) return [];
    const palabras = normalizar(estado.q).split(/\s+/).filter(Boolean);
    // Mi Mochila: lo último que se agregó va primero
    const orden = new Map(mochila.map((id, i) => [id, i]));
    return obras
      .filter((o) => (enMochila ? orden.has(o.id) : !estado.c || o.c.includes(estado.c)))
      .filter((o) => !estado.x || o.f.some((f) => f.x === estado.x))
      .filter((o) => palabras.every((p) => o._q.includes(p)))
      .sort(enMochila ? (a, b) => orden.get(a.id) - orden.get(b.id) : ORDENES[estado.o] || ORDENES.titulo);
  }, [obras, estado.q, estado.c, estado.x, estado.o, enMochila, mochila]);
  const resultado = useMemo(() => {
    if (!estado.p) return sinFiltroPais;
    return sinFiltroPais.filter((o) => (estado.p === SIN_PAIS ? !o.pa : o.pa === estado.p));
  }, [sinFiltroPais, estado.p]);

  const abierta = obras?.find((o) => o.id === estado.libro);
  const enEstante = estado.v === 'estante';
  const enMapa = estado.v === 'mapa';
  // Atrás, del sistema o de la app: solo cambia las capas; búsqueda y filtros se quedan
  useEffect(() => {
    const alVolver = () => {
      const destino = leerHash();
      const { libro, leer, p } = destino;
      nivelPrevio.current = nivel(destino);
      const cambio = () => setEstado((e) => ({ ...e, libro, leer, p }));
      enEstante ? conTransicion(cambio) : cambio();
    };
    addEventListener('popstate', alVolver);
    return () => removeEventListener('popstate', alVolver);
  }, [enEstante]);

  // Cerrar desde la app consume la entrada del historial; sin ella (un enlace
  // directo) solo se quita la capa.
  const cerrar = useCallback(() => {
    if (history.state?.capa) return history.back();
    const cambio = () => actualizar({ libro: '' });
    enEstante ? conTransicion(cambio) : cambio();
  }, [actualizar, enEstante]);
  const abrir = useCallback((o) => {
    const cambio = () => actualizar({ libro: o.id });
    enEstante ? conTransicion(cambio) : cambio();
  }, [actualizar, enEstante]);

  // Modo Seleccionar: tocar una obra la marca en vez de abrir su ficha
  const [seleccion, setSeleccion] = useState(null);
  const [paraNotebook, setParaNotebook] = useState(null);
  const elegir = useCallback((o) => setSeleccion((s) => {
    const nueva = new Set(s);
    nueva.has(o.id) ? nueva.delete(o.id) : nueva.add(o.id);
    return nueva;
  }), []);
  const alTocar = seleccion ? elegir : abrir;
  const elegidas = seleccion && obras ? obras.filter((o) => seleccion.has(o.id)) : [];
  const [avisoBandeja, setAvisoBandeja] = useState('');
  function llevarAMochila() {
    const { agregadas, sinLugar } = agregarAMochila(elegidas.map((o) => o.id));
    setAvisoBandeja(
      sinLugar
        ? t('bandeja.sinLugar', { agregadas, sinLugar, limite: LIMITE_MOCHILA })
        : agregadas ? t('bandeja.agregadas', { n: agregadas }) : t('bandeja.yaEstaban'),
    );
    setTimeout(() => setAvisoBandeja(''), 4000);
  }

  const leyendo = useMemo(() => {
    if (!estado.leer || !obras) return null;
    for (const obra of obras) {
      const archivo = obra.f.find((f) => f.id === estado.leer);
      if (archivo) return { obra, archivo };
    }
    return null;
  }, [obras, estado.leer]);
  // Elegir un país abre una entrada en el historial: Atrás regresa al mapa completo
  const elegirPais = useCallback((p) => {
    if (!p && history.state?.capa) history.back();
    else actualizar({ p });
  }, [actualizar]);
  const dejarDeLeer = useCallback(() => {
    if (history.state?.capa) history.back();
    else actualizar({ leer: '' });
  }, [actualizar]);

  function cambiarTema(nuevo) {
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('tema-elegido', nuevo); } catch {}
    setTema(nuevo);
  }

  const hayFiltros = estado.q || estado.c || estado.x || estado.p || enMochila;
  const limpiar = () => { setTexto(''); actualizar({ q: '', c: '', x: '', p: '', m: '' }); };
  // El nombre lleva al inicio: sin búsqueda, filtros, ficha ni lector; la vista y el orden se quedan
  const inicio = () => { setTexto(''); actualizar({ q: '', c: '', x: '', p: '', m: '', libro: '', leer: '' }); window.scrollTo(0, 0); };
  const reinicio = `${estado.q}|${estado.c}|${estado.x}|${estado.p}|${estado.o}|${estado.m}`;
  const verColeccion = (c) => actualizar({ c, m: '' });
  const verMochila = () => actualizar({ m: enMochila ? '' : '1', c: '' });

  return (
    <div className={`app ${enEstante ? 'con-estante' : ''}`}>
      <a className="saltar" href="#contenido">{t('saltar')}</a>

      <header className="cabecera">
        <div className="marca">
          <h1>
            <button className="marca-inicio" onClick={inicio} title={t('inicio')}>
              <Marca />
            </button>
          </h1>
          {obras && <p className="marca-cuenta">{t('cuenta.obras', { n: obras.length.toLocaleString(idiomaActual()) })}</p>}
        </div>

        <label className="buscador">
          <span className="sr">{t('buscar.etiqueta')}</span>
          <Icono nombre="buscar" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('buscar.placeholder')}
            autoComplete="off"
          />
        </label>

        <div className="cabecera-acciones">
          <SelectorIdioma />
          <div className="temas" role="group" aria-label={t('tema.etiqueta')}>
            {TEMAS.map((x) => (
              <button key={x.id} className="tema" aria-pressed={tema === x.id} onClick={() => cambiarTema(x.id)} aria-label={t('tema.nombre', { nombre: t(x.clave) })} title={t(x.clave)}>
                <Icono nombre={x.icono} tamano={18} />
              </button>
            ))}
          </div>
          {salir && (
            <button className="boton-icono" onClick={salir} aria-label={t('salir')} title={t('salir')}>
              <Icono nombre="salir" />
            </button>
          )}
        </div>
      </header>

      <div className="cuerpo">
        <nav className="lateral" aria-label={t('colecciones')}>
          <h2 className="etiqueta">{t('colecciones')}</h2>
          <ul ref={listaColecciones}>
            <span ref={librito} className="librito" aria-hidden="true"><Icono nombre="librito" tamano={22} /></span>
            <li className="coleccion-mochila">
              <button className={`coleccion ${enMochila ? 'activa' : ''}`} aria-current={enMochila || undefined} onClick={verMochila}>
                <span className="coleccion-nombre"><Icono nombre="mochila" tamano={16} /> {t('mochila')}</span> <span>{mochila.length}</span>
              </button>
            </li>
            <li>
              <button className={`coleccion ${!estado.c && !enMochila ? 'activa' : ''}`} aria-current={(!estado.c && !enMochila) || undefined} onClick={() => verColeccion('')}>
                {t('todas')} <span>{obras?.length}</span>
              </button>
            </li>
            {colecciones.map(([c, n]) => (
              <li key={c}>
                <button className={`coleccion ${c.includes('/') ? 'subcoleccion' : ''} ${!enMochila && estado.c === c ? 'activa' : ''}`} aria-current={(!enMochila && estado.c === c) || undefined} onClick={() => verColeccion(c)}>
                  {nombreCorto(c)} <span>{n}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main id="contenido" className="principal">
          <div className="barra">
            <div className="vistas" role="tablist" aria-label={t('vista.etiqueta')}>
              {VISTAS.filter((v) => !v.oculta).map((v) => (
                <button key={v.id} role="tab" aria-selected={estado.v === v.id} className="vista" onClick={() => actualizar({ v: v.id })}>
                  <Icono nombre={v.icono} tamano={16} /> {t(`vista.${v.id}`)}
                </button>
              ))}
            </div>

            <div className="colecciones-movil">
              <div className="carrusel" role="group" aria-label={t('colecciones')}>
                <button className="chip" aria-pressed={enMochila} onClick={verMochila}>{t('mochila')} <span>{mochila.length}</span></button>
                <button className="chip" aria-pressed={!estado.c && !enMochila} onClick={() => verColeccion('')}>{t('todas')}</button>
                {principales.map(([c, n]) => (
                  <button key={c} className="chip" aria-pressed={!enMochila && raiz === c} onClick={() => verColeccion(estado.c === c ? '' : c)}>
                    {c} <span>{n}</span>
                  </button>
                ))}
              </div>
              {hijas.length > 0 && !enMochila && (
                <div className="carrusel subcarrusel" role="group" aria-label={t('dentroDe', { nombre: raiz })}>
                  <button className="chip" aria-pressed={estado.c === raiz} onClick={() => verColeccion(raiz)}>{t('todo')}</button>
                  {hijas.map(([c, n]) => (
                    <button key={c} className="chip" aria-pressed={estado.c === c} onClick={() => verColeccion(c)}>
                      {nombreCorto(c)} <span>{n}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="filtros">
              <button className={`boton-seleccionar ${seleccion ? 'activo' : ''}`} aria-pressed={Boolean(seleccion)} onClick={() => setSeleccion(seleccion ? null : new Set())}>
                <Icono nombre="marcar" tamano={16} /> {seleccion ? t('terminar') : t('seleccionar')}
              </button>
              <label className="orden">
                <span className="etiqueta">{t('formato')}</span>
                <select value={estado.x} onChange={(e) => actualizar({ x: e.target.value })}>
                  <option value="">{t('todos')}</option>
                  {formatos.map(([x, n]) => <option key={x} value={x}>{x} ({n})</option>)}
                </select>
              </label>
              <label className="orden">
                <span className="etiqueta">{t('ordenar')}</span>
                <select value={estado.o} onChange={(e) => actualizar({ o: e.target.value })}>
                  <option value="titulo">{t('orden.titulo')}</option>
                  <option value="autor">{t('orden.autor')}</option>
                  <option value="anio">{t('orden.anio')}</option>
                </select>
              </label>
            </div>
          </div>

          <p className="resumen" aria-live="polite">
            {obras && !enMochila && t('cuenta.obras', { n: resultado.length.toLocaleString(idiomaActual()) })}
            {obras && enMochila && t('resumen.enMochila', { n: mochila.length, limite: LIMITE_MOCHILA })}
            {!enMochila && estado.c && t('resumen.en', { nombre: nombreLargo(estado.c) })}
            {estado.p && (estado.p === SIN_PAIS ? t('resumen.sinPais') : t('resumen.pais', { pais: nombrePais(estado.p) }))}
            {hayFiltros && <> · <button className="enlace" onClick={limpiar}>{t('quitarFiltros')}</button></>}
          </p>

          {DEMO && <p className="nota aviso-demo">{t('demo.aviso')}</p>}

          {enMochila && obras && <AvisoSincronizacion que="mochila" />}
          {error && <p className="aviso">{error}</p>}
          {!obras && !error && <p className="aviso" aria-busy="true">{t('cargando')}</p>}

          {enMapa && obras && (
            <Suspense fallback={<p className="aviso" aria-busy="true">{t('preparandoMapa')}</p>}>
              <Mapa obras={sinFiltroPais} pais={estado.p} elegir={elegirPais} />
            </Suspense>
          )}

          {obras && enMochila && mochila.length === 0 && (
            <div className="vacio">
              <p>{t('mochila.vacia')}</p>
              <p>{t('mochila.ayuda', { limite: LIMITE_MOCHILA })}</p>
            </div>
          )}
          {obras && resultado.length === 0 && !(enMapa && !estado.p) && !(enMochila && mochila.length === 0) && (
            <div className="vacio">
              <p>{t('sinResultados', { que: estado.q || estado.c || estado.x || (estado.p === SIN_PAIS ? t('sinResultados.sinPais') : estado.p && nombrePais(estado.p)) })}</p>
              <p>{t('sinResultados.ayuda', <button className="enlace" onClick={limpiar}>{t('sinResultados.quitar')}</button>)}</p>
            </div>
          )}

          {resultado.length > 0 && enEstante && (
            <Suspense fallback={<p className="aviso" aria-busy="true">{t('preparandoEstante')}</p>}>
              <Estante key={reinicio} obras={resultado} abrir={alTocar} seleccion={seleccion} fichaAbierta={Boolean(abierta)} />
            </Suspense>
          )}
          {resultado.length > 0 && (estado.v === 'cuadricula' || (enMapa && estado.p)) && <Cuadricula obras={resultado} abrir={alTocar} seleccion={seleccion} reinicio={reinicio} aviso={enMochila ? (o) => t('dias', { n: diasRestantes(personal, o.id) }) : null} />}
          {resultado.length > 0 && estado.v === 'lista' && <Lista obras={resultado} abrir={alTocar} seleccion={seleccion} reinicio={reinicio} />}
        </main>
      </div>

      {seleccion && (
        <div className="bandeja" role="region" aria-label={t('bandeja.etiqueta')}>
          <p aria-live="polite">
            {avisoBandeja || (elegidas.length ? t('bandeja.elegidas', { n: elegidas.length }) : t('bandeja.toca'))}
          </p>
          <button className="enlace" onClick={() => setSeleccion(null)}>{t('cancelar')}</button>
          <button className="boton-secundario bandeja-mochila" disabled={!elegidas.length} onClick={llevarAMochila}>
            <Icono nombre="mochila" tamano={16} /> {t('masMochila')}
          </button>
          <button className="boton-primario" disabled={!elegidas.length} onClick={() => setParaNotebook(elegidas)}>{t('llevarNotebook')}</button>
        </div>
      )}
      {paraNotebook && <Notebook obras={paraNotebook} cerrar={() => setParaNotebook(null)} />}

      {abierta && !leyendo && !paraNotebook && (
        <Ficha
          obra={abierta}
          cerrar={cerrar}
          filtrarColeccion={(c) => {
            if (history.state?.capa) { actualizar({ c, m: '' }); history.back(); } else actualizar({ c, m: '', libro: '' });
          }}
          leer={(f) => actualizar({ leer: f.id })}
          notebook={() => setParaNotebook([abierta])}
        />
      )}
      {leyendo && <Lector {...leyendo} cerrar={dejarDeLeer} marfil={tema === 'marfil'} />}
    </div>
  );
}
