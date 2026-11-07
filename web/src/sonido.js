// Sonidos de la biblioteca: se sintetizan en el navegador, sin archivos de audio
// que descargar. Un golpe suave al tomar un libro y una página que pasa.

const CLAVE = 'estante-sonido';

export function sonidoActivo() {
  try { return localStorage.getItem(CLAVE) !== 'no'; } catch { return true; }
}

export function guardarSonido(activo) {
  try { localStorage.setItem(CLAVE, activo ? 'si' : 'no'); } catch {}
}

function ruido(ctx, segundos) {
  const datos = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * segundos), ctx.sampleRate);
  const canal = datos.getChannelData(0);
  for (let i = 0; i < canal.length; i++) canal[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource();
  fuente.buffer = datos;
  return fuente;
}

// Separado de la reproducción para poder medirlo sin altavoces
export function sintetizar(ctx, destino, t = 0) {
  // Tomar el libro: un golpe grave y breve, con algo de roce
  const golpe = ctx.createOscillator();
  const golpeNivel = ctx.createGain();
  golpe.frequency.setValueAtTime(150, t);
  golpe.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  golpeNivel.gain.setValueAtTime(0.0001, t);
  golpeNivel.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
  golpeNivel.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  golpe.connect(golpeNivel).connect(destino);
  golpe.start(t);
  golpe.stop(t + 0.11);

  const roce = ruido(ctx, 0.1);
  const roceFiltro = ctx.createBiquadFilter();
  const roceNivel = ctx.createGain();
  roceFiltro.type = 'bandpass';
  roceFiltro.frequency.value = 900;
  roceFiltro.Q.value = 0.8;
  roceNivel.gain.setValueAtTime(0.05, t);
  roceNivel.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  roce.connect(roceFiltro).connect(roceNivel).connect(destino);
  roce.start(t);

  pasarPagina(ctx, destino, t + 0.12);
}

// Ruido que sube y baja de tono, con un aleteo al final. `nivel` y `tono`
// permiten que las páginas del lector no suenen todas idénticas.
export function pasarPagina(ctx, destino, p = 0, nivel = 1, tono = 1) {
  const pagina = ruido(ctx, 0.36);
  const paginaFiltro = ctx.createBiquadFilter();
  const paginaNivel = ctx.createGain();
  paginaFiltro.type = 'bandpass';
  paginaFiltro.Q.value = 0.7;
  paginaFiltro.frequency.setValueAtTime(1500 * tono, p);
  paginaFiltro.frequency.exponentialRampToValueAtTime(4200 * tono, p + 0.16);
  paginaFiltro.frequency.exponentialRampToValueAtTime(1800 * tono, p + 0.34);
  paginaNivel.gain.setValueAtTime(0.0001, p);
  paginaNivel.gain.exponentialRampToValueAtTime(0.07 * nivel, p + 0.1);
  paginaNivel.gain.linearRampToValueAtTime(0.035 * nivel, p + 0.2);
  paginaNivel.gain.linearRampToValueAtTime(0.055 * nivel, p + 0.25);
  paginaNivel.gain.exponentialRampToValueAtTime(0.0001, p + 0.35);
  pagina.connect(paginaFiltro).connect(paginaNivel).connect(destino);
  pagina.start(p);
}

let contexto = null;

// Sin audio la app sigue igual. Los navegadores solo permiten sonar después de
// un gesto; al leer ya hubo uno, el clic en «Leer».
function sonar(dibujar) {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') contexto.resume();
    dibujar(contexto, contexto.currentTime + 0.01);
  } catch {}
}

export function sonarLibro() {
  sonar((ctx, t) => sintetizar(ctx, ctx.destination, t));
}

// Más bajo que al abrir un libro, porque se repite mientras se lee
const NIVEL_PAGINA = 0.55;
const PAUSA_PAGINAS = 600; // ms; al pasar páginas muy rápido no suena cada una
let ultimaPagina = -Infinity;

export function sonarPagina() {
  const ahora = performance.now();
  if (!sonidoActivo() || ahora - ultimaPagina < PAUSA_PAGINAS) return false;
  ultimaPagina = ahora;
  sonar((ctx, t) => pasarPagina(ctx, ctx.destination, t, NIVEL_PAGINA, 0.9 + Math.random() * 0.2));
  return true;
}
