import { idiomaActual, t as tr } from './textos.jsx';

// Referencias bibliográficas de libros en seis estilos, con las convenciones
// del idioma de la interfaz (español: «y», «s. f.»; inglés: «and», «&»,
// «n.d.»). Cada cita es una lista de partes [texto, cursiva]
// para poder copiarla con formato o como texto plano.
// El catálogo no trae editorial ni ciudad: se agregan a mano en la ficha.

export const ESTILOS = [
  { id: 'apa', nombre: 'APA 7' },
  { id: 'chicago', nombre: 'Chicago' },
  { id: 'mla', nombre: 'MLA 9' },
  { id: 'harvard', nombre: 'Harvard' },
  { id: 'vancouver', nombre: 'Vancouver' },
  { id: 'ieee', nombre: 'IEEE' },
];

// "Ludwig van Beethoven" → apellido "van Beethoven". Los apellidos dobles
// sin guion ("Solla Sobral") no se pueden distinguir del segundo nombre.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'der', 'den', 'da', 'das', 'di', 'do', 'dos', 'du', 'le']);
function partes(nombre) {
  const p = nombre.trim().split(/\s+/);
  if (p.length === 1) return { apellido: p[0], nombres: [] };
  let i = p.length - 1;
  while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i--;
  return { apellido: p.slice(i).join(' '), nombres: p.slice(0, i) };
}

// "Jean-Paul" → "J.-P."; "A." se queda igual
const inicial = (n) => n.split('-').map((x) => x.replace(/[^\p{L}]/gu, '').charAt(0).toUpperCase() + '.').join('-');
const iniciales = (nombres, sep = ' ') => nombres.map(inicial).join(sep);

const lista = (items, final = tr('autores.y')) =>
  items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + final + items[items.length - 1];

// En inglés APA une con «, &» («Smith, J., & Doe, A.»)
const finalApa = () => (idiomaActual() === 'en' ? ', & ' : tr('autores.y'));

const punto = (s) => (/[.?!]$/.test(s) ? s : s + '.');

function autoresApa(a) {
  const f = a.map((n) => { const { apellido, nombres } = partes(n); return nombres.length ? `${apellido}, ${iniciales(nombres)}` : apellido; });
  if (f.length > 20) return `${f.slice(0, 19).join(', ')}, . . . ${f[f.length - 1]}`;
  return lista(f, finalApa());
}

function autoresChicago(a, maximo) {
  const invertido = (n) => { const { apellido, nombres } = partes(n); return nombres.length ? `${apellido}, ${nombres.join(' ')}` : apellido; };
  if (a.length > maximo) return `${invertido(a[0])}, et al.`;
  return lista([invertido(a[0]), ...a.slice(1)]);
}

function autoresHarvard(a) {
  const f = a.map((n) => { const { apellido, nombres } = partes(n); return nombres.length ? `${apellido}, ${iniciales(nombres, '')}` : apellido; });
  return f.length > 3 ? `${f[0]} et al.` : lista(f);
}

function autoresVancouver(a) {
  const f = a.map((n) => { const { apellido, nombres } = partes(n); return `${apellido} ${nombres.map((x) => inicial(x).replace(/[.-]/g, '')).join('')}`.trim(); });
  return f.length > 6 ? `${f.slice(0, 6).join(', ')}, et al` : f.join(', ');
}

function autoresIeee(a) {
  const f = a.map((n) => { const { apellido, nombres } = partes(n); return `${iniciales(nombres)} ${apellido}`.trim(); });
  return f.length > 6 ? `${f[0]} et al.` : lista(f);
}

// Devuelve [[texto, cursiva], ...]
export function citar(estilo, obra, { editorial = '', ciudad = '' } = {}) {
  const a = (obra.a || []).filter(Boolean);
  const t = obra.t.trim();
  const y = obra.y ? String(obra.y) : '';
  const ed = editorial.trim();
  const lugar = ciudad.trim();
  const c = (texto, cursiva = false) => [texto, cursiva];
  const sf = tr('cita.sinFecha');

  switch (estilo) {
    case 'apa': {
      const fecha = `(${y || sf}).`;
      const cola = ed ? ` ${punto(ed)}` : '';
      return a.length
        ? [c(`${punto(autoresApa(a))} ${fecha} `), c(punto(t), true), c(cola)]
        : [c(punto(t), true), c(` ${fecha}${cola}`)];
    }
    case 'chicago': {
      const pub = [lugar && ed ? `${lugar}: ${ed}` : ed || lugar, y || sf].filter(Boolean).join(', ');
      return [c(a.length ? `${punto(autoresChicago(a, 10))} ` : ''), c(punto(t), true), c(` ${punto(pub)}`)];
    }
    case 'mla': {
      const pub = [ed, y].filter(Boolean).join(', ');
      return [c(a.length ? `${punto(autoresChicago(a, 2))} ` : ''), c(punto(t), true), c(pub ? ` ${pub}.` : '')];
    }
    case 'harvard': {
      const pub = lugar && ed ? `${lugar}: ${ed}` : ed || lugar;
      const fecha = `(${y || sf})`;
      return a.length
        ? [c(`${autoresHarvard(a)} ${fecha} `), c(punto(t), true), c(pub ? ` ${punto(pub)}` : '')]
        : [c(t, true), c(` ${fecha}.${pub ? ` ${punto(pub)}` : ''}`)];
    }
    case 'vancouver': {
      const pub = [lugar && ed ? `${lugar}: ${ed}` : ed || lugar, y].filter(Boolean).join('; ');
      return [c(a.length ? `${punto(autoresVancouver(a))} ` : ''), c(punto(t)), c(pub ? ` ${pub}.` : '')];
    }
    case 'ieee': {
      const pub = [lugar && ed ? `${lugar}: ${ed}` : ed || lugar, y].filter(Boolean).join(', ');
      return [c(a.length ? `${autoresIeee(a)}, ` : ''), c(pub ? `${t}. ` : punto(t), true), c(pub ? `${pub}.` : '')];
    }
    default:
      return [c(t)];
  }
}

const escapar = (s) => s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]);
export const comoTexto = (cita) => cita.map(([s]) => s).join('');
export const comoHtml = (cita) => cita.map(([s, i]) => (i ? `<i>${escapar(s)}</i>` : escapar(s))).join('');
