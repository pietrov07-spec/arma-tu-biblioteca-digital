import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { imagenDrive } from './google.js';
import Icono from './Iconos.jsx';
import { guardarSonido, sonarLibro, sonidoActivo } from './sonido.js';
import { autoresTexto, tintasAlternadas } from './util.js';
import { t } from './textos.jsx';
import './estante.css';

// Estante: una sola franja de lomos. El libro señalado gira y muestra su
// portada. Con ~1,100 obras solo existen en la página los lomos cercanos a lo
// visible, y todo el movimiento son transformaciones CSS (sin librerías 3D).

const ANGULO = 74;
const COSENO = Math.cos((ANGULO * Math.PI) / 180);
const SENO = Math.sin((ANGULO * Math.PI) / 180);
const HUECO = 3;
const MARGEN = 24;
const SOBRANTE = 500; // px de lomos preparados fuera de la vista
const PROPORCION = 0.66;

// ---------- Portadas: una cola corta, para no pedir decenas a Drive de golpe ----------

const SIMULTANEAS = 4;
const portadas = new Map(); // obra.p → { url, proporcion } | null
const cola = [];
let enCurso = 0;

function descargarPortada(p) {
  const url = p.startsWith('drive:') ? imagenDrive(p.slice(6)) : Promise.resolve(p);
  return url.then((src) => new Promise((resolver) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolver(img.naturalWidth > 1 ? { url: src, proporcion: img.naturalWidth / img.naturalHeight } : null);
    img.onerror = () => resolver(null);
    img.src = src;
  }));
}

function avanzarCola() {
  while (enCurso < SIMULTANEAS && cola.length) {
    // Lo último pedido primero: es lo que se está viendo ahora
    const { p, avisar } = cola.pop();
    enCurso++;
    descargarPortada(p)
      .then((datos) => { portadas.set(p, datos); avisar(datos); })
      .catch(() => avisar(null))
      .finally(() => { enCurso--; avanzarCola(); });
  }
}

function usePortada(obra, pedir) {
  const p = obra?.p;
  const [datos, setDatos] = useState(() => (p ? portadas.get(p) ?? null : null));
  useEffect(() => {
    setDatos(p ? portadas.get(p) ?? null : null);
    if (!p || !pedir || portadas.has(p)) return;
    let vigente = true;
    cola.push({ p, avisar: (d) => vigente && setDatos(d) });
    avanzarCola();
    return () => { vigente = false; };
  }, [p, pedir]);
  return datos;
}

// ---------- Un libro ----------

const Libro = memo(function Libro({ obra, indice, x, grosor, alto, ancho, color, activo, conCara, enVista, elegida, enFoco, sinNombre }) {
  const portada = usePortada(obra, enVista || activo);
  return (
    <button
      className={`tomo ${activo ? 'tomo-activo' : ''}`}
      data-i={indice}
      tabIndex={enFoco ? 0 : -1}
      aria-label={`${obra.t}, ${autoresTexto(obra.a)}${obra.y ? `, ${obra.y}` : ''}`}
      aria-pressed={elegida}
      style={{ transform: `translateX(${x}px)`, width: grosor, height: alto, zIndex: activo ? 2 : undefined }}
    >
      <span
        className="tomo-cuerpo"
        style={activo ? { transform: `translateX(${-(grosor * (1 - COSENO))}px) perspective(1500px) rotateY(-${ANGULO}deg)` } : undefined}
      >
        <span className="tomo-lomo" style={{ '--tinta': color }}>
          <span className="tomo-arte">
            {portada && <img src={portada.url} alt="" decoding="async" referrerPolicy="no-referrer" />}
          </span>
          <span className="tomo-titulo">{obra.t}</span>
        </span>
        {conCara && (
          <span className="tomo-cara" style={{ width: ancho, viewTransitionName: activo && !sinNombre ? 'portada-libro' : undefined }}>
            {portada
              ? <img src={portada.url} alt="" referrerPolicy="no-referrer" />
              : (
                <span className="portada-generada tomo-generada" style={{ '--tinta': color }}>
                  <span className="portada-titulo">{obra.t}</span>
                  <span className="portada-autor">{autoresTexto(obra.a)}</span>
                </span>
              )}
          </span>
        )}
      </span>
      {elegida && !activo && <span className="tomo-marca" aria-hidden="true">✓</span>}
    </button>
  );
});

// ---------- La franja ----------

// Último índice cuyo inicio queda en o antes de `valor`
function buscar(inicios, valor) {
  let bajo = 0;
  let alto = inicios.length - 1;
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2);
    if (inicios[medio] <= valor) bajo = medio;
    else alto = medio - 1;
  }
  return bajo;
}

const grosorDe = (obra) => {
  const mayor = Math.max(...obra.f.map((f) => f.s || 0));
  // Grosor según el tamaño del archivo (acotado)
  return Math.round(30 + Math.min(14, Math.log10(Math.max(mayor, 1e5) / 1e5) * 9));
};

const altoDe = () => {
  const movil = innerWidth <= 640;
  return Math.round(Math.max(220, Math.min(innerHeight * (movil ? 0.36 : 0.52), movil ? 300 : 460)));
};

export default function Estante({ obras, abrir, seleccion, fichaAbierta }) {
  const franja = useRef(null);
  const [conSonido, setConSonido] = useState(sonidoActivo);
  const circulo = useRef(null);
  const puntero = useRef({ tipo: '', x: null, y: null });
  const [alto, setAlto] = useState(altoDe);
  const [vista, setVista] = useState({ izquierda: 0, ancho: innerWidth });
  const [enReposo, setEnReposo] = useState({ izquierda: 0, ancho: innerWidth });
  const [{ activo, anterior }, setGiro] = useState({ activo: 0, anterior: null });

  const { grosores, inicios, colores } = useMemo(() => {
    const grosores = obras.map(grosorDe);
    const inicios = [];
    let x = MARGEN;
    for (const g of grosores) { inicios.push(x); x += g + HUECO; }
    return { grosores, inicios, colores: tintasAlternadas(obras.map((o) => o.t)) };
  }, [obras]);

  const portadaActiva = usePortada(obras[activo], true);
  const proporcion = Math.min(0.86, Math.max(0.58, portadaActiva?.proporcion ?? PROPORCION));
  const ancho = Math.round(alto * proporcion);
  // Lugar que ocupa el libro girado y lo que empuja a los de su derecha
  const hueco = Math.round(ancho * SENO + grosores[activo] * COSENO) + 10;
  const empuje = hueco - grosores[activo];
  const total = inicios[inicios.length - 1] + grosores[grosores.length - 1] + empuje + MARGEN;

  const activar = useCallback((i) => {
    setGiro((g) => (g.activo === i ? g : { activo: i, anterior: g.activo }));
  }, []);

  // Qué libro hay en una coordenada: los de la derecha están corridos por el empuje
  const indiceEn = useCallback((xPagina) => {
    const el = franja.current;
    const x = xPagina - el.getBoundingClientRect().left + el.scrollLeft;
    const inicio = inicios[activo];
    if (x < inicio) return buscar(inicios, x);
    if (x < inicio + hueco) return activo;
    return buscar(inicios, x - empuje);
  }, [inicios, activo, hueco, empuje]);

  // El círculo «Abrir» sigue al cursor sin pasar por React
  const moverCirculo = useCallback((x, y) => {
    if (circulo.current) circulo.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }, []);

  const moverPuntero = (e) => {
    puntero.current = { tipo: e.pointerType, x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') return;
    activar(indiceEn(e.clientX));
    moverCirculo(e.clientX, e.clientY);
    circulo.current?.classList.add('visible');
  };

  const salirPuntero = () => {
    puntero.current = { ...puntero.current, x: null };
    circulo.current?.classList.remove('visible');
  };

  const centrar = useCallback((i) => {
    const el = franja.current;
    el.scrollTo({ left: inicios[i] + hueco / 2 - el.clientWidth / 2, behavior: 'smooth' });
  }, [inicios, hueco]);

  const alTocar = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const i = Number(b.dataset.i);
    // En pantalla táctil el primer toque saca el libro; el segundo abre su ficha
    if (puntero.current.tipo === 'touch' && !seleccion && i !== activo) {
      activar(i);
      centrar(i);
      return;
    }
    activar(i);
    if (!seleccion && conSonido) sonarLibro();
    abrir(obras[i]);
  };

  const alTeclear = (e) => {
    const destinos = {
      ArrowRight: activo + 1, ArrowLeft: activo - 1,
      PageDown: activo + 10, PageUp: activo - 10,
      Home: 0, End: obras.length - 1,
    };
    if (!(e.key in destinos)) return;
    e.preventDefault();
    const i = Math.min(obras.length - 1, Math.max(0, destinos[e.key]));
    activar(i);
    centrar(i);
  };

  // El foco acompaña al libro activo cuando se recorre con el teclado
  const conTeclado = useRef(false);
  useEffect(() => {
    if (conTeclado.current) franja.current.querySelector(`[data-i="${activo}"]`)?.focus({ preventScroll: true });
  }, [activo]);

  // Desplazamiento: la ventana de lomos se recalcula a lo sumo una vez por cuadro,
  // y las portadas se piden solo cuando se detiene
  useEffect(() => {
    const el = franja.current;
    let cuadro = 0;
    let espera = 0;
    const medir = () => ({ izquierda: el.scrollLeft, ancho: el.clientWidth });
    const alDesplazar = () => {
      if (!cuadro) {
        cuadro = requestAnimationFrame(() => {
          cuadro = 0;
          setVista(medir());
        });
      }
      clearTimeout(espera);
      espera = setTimeout(() => setEnReposo(medir()), 180);
    };
    const alRedimensionar = () => { setAlto(altoDe()); setVista(medir()); setEnReposo(medir()); };
    const rueda = (e) => {
      // La rueda vertical recorre la franja, salvo en sus extremos
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const tope = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= tope)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    alRedimensionar();
    el.addEventListener('scroll', alDesplazar, { passive: true });
    el.addEventListener('wheel', rueda, { passive: false });
    addEventListener('resize', alRedimensionar);
    return () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(espera);
      el.removeEventListener('scroll', alDesplazar);
      el.removeEventListener('wheel', rueda);
      removeEventListener('resize', alRedimensionar);
    };
  }, []);

  // Si la franja se mueve bajo un cursor quieto, el libro señalado cambia
  useLayoutEffect(() => {
    const { tipo, x } = puntero.current;
    if (tipo === 'mouse' && x !== null) activar(indiceEn(x));
  }, [vista.izquierda]); // eslint-disable-line react-hooks/exhaustive-deps

  const desde = buscar(inicios, Math.max(0, vista.izquierda - SOBRANTE - empuje));
  const hasta = buscar(inicios, vista.izquierda + vista.ancho + SOBRANTE);
  const reposoDesde = buscar(inicios, Math.max(0, enReposo.izquierda - empuje));
  const reposoHasta = buscar(inicios, enReposo.izquierda + enReposo.ancho);

  const indices = [];
  if (activo < desde) indices.push(activo);
  if (anterior !== null && anterior < desde && anterior !== activo) indices.push(anterior);
  for (let i = desde; i <= hasta; i++) indices.push(i);
  if (anterior !== null && anterior > hasta && anterior !== activo) indices.push(anterior);
  if (activo > hasta) indices.push(activo);

  const obra = obras[activo];
  const centro = inicios[activo] + hueco / 2 - vista.izquierda;
  const medioDato = Math.min(150, vista.ancho / 2 - 8);
  // Sin encimarse con las flechas del pie
  const orilla = medioDato + (vista.ancho > 640 ? 120 : 8);
  const xDato = Math.min(vista.ancho - orilla, Math.max(orilla, centro));

  const paso = (signo) => {
    const el = franja.current;
    el.scrollBy({ left: signo * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="estante" aria-label={t('vista.estante')}>
      <div
        ref={franja}
        className="estante-franja"
        role="group"
        aria-label={t('estante.franja')}
        style={{ height: alto + 34 }}
        onPointerDown={(e) => { puntero.current.tipo = e.pointerType; conTeclado.current = false; }}
        onPointerMove={moverPuntero}
        onPointerLeave={salirPuntero}
        onClick={alTocar}
        onKeyDown={(e) => { conTeclado.current = true; puntero.current.x = null; alTeclear(e); }}
      >
        <div className="estante-pista" style={{ width: total, height: alto }}>
          {indices.map((i) => {
            const elegida = seleccion ? seleccion.has(obras[i].id) : undefined;
            return (
              <Libro
                key={obras[i].id}
                obra={obras[i]}
                indice={i}
                x={inicios[i] + (i > activo ? empuje : 0)}
                grosor={grosores[i]}
                alto={alto}
                ancho={i === activo ? ancho : Math.round(alto * PROPORCION)}
                color={colores[i]}
                activo={i === activo}
                conCara={i === activo || i === anterior}
                enVista={i >= reposoDesde && i <= reposoHasta}
                elegida={elegida}
                enFoco={i === activo}
                sinNombre={fichaAbierta}
              />
            );
          })}
        </div>
      </div>
      {!seleccion && <span ref={circulo} className="estante-abrir" aria-hidden="true">{t('estante.abrir')}</span>}

      <div className="estante-pie">
        <div className="estante-pie-grupo">
          <button className="boton-icono estante-paso" onClick={() => paso(-1)} aria-label={t('estante.anteriores')}>
            <Icono nombre="volver" tamano={18} />
          </button>
          <button
            className="boton-icono estante-sonido"
            aria-pressed={conSonido}
            aria-label={t('estante.sonido')}
            title={conSonido ? t('estante.silenciar') : t('estante.activar')}
            onClick={() => { guardarSonido(!conSonido); setConSonido(!conSonido); }}
          >
            <Icono nombre={conSonido ? 'sonido' : 'silencio'} tamano={18} />
          </button>
        </div>
        <div className="estante-dato-zona">
          <div className="estante-dato" style={{ transform: `translateX(${xDato}px) translateX(-50%)`, width: medioDato * 2 }}>
            <p className="estante-dato-titulo">{obra.t}</p>
            <p className="estante-dato-autor">{autoresTexto(obra.a)}{obra.y ? ` · ${obra.y}` : ''}</p>
          </div>
        </div>
        <button className="boton-icono estante-paso" onClick={() => paso(1)} aria-label={t('estante.siguientes')}>
          <Icono nombre="siguiente" tamano={18} />
        </button>
      </div>
    </section>
  );
}
