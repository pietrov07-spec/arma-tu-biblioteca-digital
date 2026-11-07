// Crea el catálogo de demostración (web/demo/catalogo-demo.json) y dos archivos
// de ejemplo que se pueden abrir en el lector sin Google: un PDF y un EPUB con
// fragmentos de obras de dominio público. Todo es sintético: los ids empiezan
// con "demo-" y no apuntan a ningún Drive.
//
// Creates the demo catalog and two sample files (a PDF and an EPUB with
// public-domain excerpts) that open in the reader without Google.
//
//   npm run demo
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const carpeta = new URL('../demo/', import.meta.url);
const archivos = new URL('archivos/', carpeta);
mkdirSync(archivos, { recursive: true });

// ---------- textos (dominio público) ----------

const QUIJOTE = {
  titulo: 'El ingenioso hidalgo don Quijote de la Mancha',
  autor: 'Miguel de Cervantes',
  paginas: [
    ['Capítulo primero', 'Que trata de la condición y ejercicio del famoso hidalgo don Quijote de la Mancha.',
      'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.'],
    ['', '', 'El resto della concluían sayo de velarte, calzas de velludo para las fiestas, con sus pantuflos de lo mesmo, y los días de entresemana se honraba con su vellorí de lo más fino. Tenía en su casa una ama que pasaba de los cuarenta, y una sobrina que no llegaba a los veinte, y un mozo de campo y plaza, que así ensillaba el rocín como tomaba la podadera.'],
    ['', '', 'Frisaba la edad de nuestro hidalgo con los cincuenta años; era de complexión recia, seco de carnes, enjuto de rostro, gran madrugador y amigo de la caza. Quieren decir que tenía el sobrenombre de Quijada, o Quesada, que en esto hay alguna diferencia en los autores que deste caso escriben.'],
    ['Nota', '', 'Este PDF es un fragmento de una obra de dominio público, incluido solo para probar el lector de la biblioteca en modo demostración. Selecciona una frase para resaltarla, subrayarla o escribirle una nota.'],
  ],
};

const AUSTEN = {
  titulo: 'Pride and Prejudice',
  autor: 'Jane Austen',
  capitulos: [
    ['Chapter 1', [
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
      '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
      'Mr. Bennet replied that he had not.',
    ]],
    ['Chapter 2', [
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go.',
    ]],
    ['About this file', [
      'This EPUB contains a short excerpt of a public-domain novel, included only to try the library’s reader in demo mode. Select a sentence to highlight it, underline it or add a note.',
    ]],
  ],
};

// ---------- PDF escrito a mano ----------

// Helvetica con WinAnsiEncoding: cubre los acentos del español
function latin1(texto) {
  const mapa = { '“': 0x93, '”': 0x94, '’': 0x92, '—': 0x97 };
  return Buffer.from([...texto].map((c) => mapa[c] ?? (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63)));
}
const escapar = (b) => Buffer.from([...b].flatMap((x) => (x === 0x28 || x === 0x29 || x === 0x5c ? [0x5c, x] : [x])));

function envolver(texto, ancho) {
  const lineas = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    if ((actual + ' ' + palabra).trim().length > ancho) { lineas.push(actual); actual = palabra; } else actual = (actual + ' ' + palabra).trim();
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function crearPdf({ titulo, autor, paginas }) {
  const objetos = [];
  const agregar = (cuerpo) => { objetos.push(cuerpo); return objetos.length; };
  const catalogo = agregar(null);
  const arbol = agregar(null);
  const fuente = agregar(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  const negrita = agregar(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const hojas = [];
  paginas.forEach(([encabezado, subtitulo, parrafo], i) => {
    const partes = [];
    let y = 760;
    const linea = (texto, tam, f) => { partes.push(Buffer.from(`BT /${f} ${tam} Tf 72 ${y} Td (`), escapar(latin1(texto)), Buffer.from(') Tj ET\n')); y -= tam * 1.5; };
    if (i === 0) { linea(titulo, 18, 'F2'); linea(autor, 12, 'F1'); y -= 20; }
    if (encabezado) linea(encabezado, 14, 'F2');
    if (subtitulo) envolver(subtitulo, 80).forEach((l) => linea(l, 11, 'F1'));
    y -= 8;
    envolver(parrafo, 80).forEach((l) => linea(l, 12, 'F1'));
    y = 40;
    linea(String(i + 1), 10, 'F1');
    const contenido = Buffer.concat(partes);
    const flujo = agregar(Buffer.concat([Buffer.from(`<< /Length ${contenido.length} >>\nstream\n`), contenido, Buffer.from('\nendstream')]));
    hojas.push(agregar(Buffer.from(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 612 792] /Contents ${flujo} 0 R /Resources << /Font << /F1 ${fuente} 0 R /F2 ${negrita} 0 R >> >> >>`)));
  });
  objetos[catalogo - 1] = Buffer.from(`<< /Type /Catalog /Pages ${arbol} 0 R >>`);
  objetos[arbol - 1] = Buffer.from(`<< /Type /Pages /Kids [${hojas.map((h) => `${h} 0 R`).join(' ')}] /Count ${hojas.length} >>`);
  const info = agregar(Buffer.concat([Buffer.from('<< /Title ('), escapar(latin1(titulo)), Buffer.from(') /Author ('), escapar(latin1(autor)), Buffer.from(') >>')]));

  const trozos = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let posicion = trozos[0].length;
  const desplazamientos = objetos.map((cuerpo, i) => {
    const bloque = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), cuerpo, Buffer.from('\nendobj\n')]);
    trozos.push(bloque);
    const inicio = posicion;
    posicion += bloque.length;
    return inicio;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...desplazamientos.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`)].join('');
  trozos.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${posicion}\n%%EOF\n`));
  return Buffer.concat(trozos);
}

// ---------- EPUB (un zip) ----------

const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entradas) {
  const locales = [];
  const centrales = [];
  let posicion = 0;
  for (const [nombre, texto] of entradas) {
    const datos = Buffer.from(texto, 'utf8');
    // El EPUB exige que "mimetype" vaya primero y sin comprimir
    const guardado = nombre === 'mimetype';
    const cuerpo = guardado ? datos : deflateRawSync(datos);
    const n = Buffer.from(nombre);
    const comun = Buffer.alloc(26);
    comun.writeUInt16LE(20, 0); comun.writeUInt16LE(0, 2); comun.writeUInt16LE(guardado ? 0 : 8, 4);
    comun.writeUInt32LE(0, 6); comun.writeUInt32LE(crc32(datos), 10);
    comun.writeUInt32LE(cuerpo.length, 14); comun.writeUInt32LE(datos.length, 18);
    comun.writeUInt16LE(n.length, 22); comun.writeUInt16LE(0, 24);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), comun, n, cuerpo]);
    const extra = Buffer.alloc(14); extra.writeUInt32LE(posicion, 10); // comentario, disco, atributos y desplazamiento
    centrales.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2]), Buffer.from([20, 0]), comun, extra, n]));
    locales.push(local);
    posicion += local.length;
  }
  const central = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(posicion, 16);
  return Buffer.concat([...locales, central, fin]);
}

const xml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function crearEpub({ titulo, autor, capitulos }) {
  const xhtml = (cuerpo, t) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><title>${xml(t)}</title></head>
<body>${cuerpo}</body>
</html>`;
  const caps = capitulos.map(([t, parrafos], i) => [`OEBPS/cap${i + 1}.xhtml`, xhtml(`<h2>${xml(t)}</h2>${parrafos.map((p) => `<p>${xml(p)}</p>`).join('')}`, t)]);
  const nav = xhtml(`<nav epub:type="toc"><h1>Contents</h1><ol>${capitulos.map(([t], i) => `<li><a href="cap${i + 1}.xhtml">${xml(t)}</a></li>`).join('')}</ol></nav>`, 'Contents');
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>${xml(titulo)}</dc:title>
    <dc:creator>${xml(autor)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${capitulos.map((_, i) => `<item id="cap${i + 1}" href="cap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${capitulos.map((_, i) => `<itemref idref="cap${i + 1}"/>`).join('\n    ')}
  </spine>
</package>`;
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', opf],
    ['OEBPS/nav.xhtml', nav],
    ...caps,
  ]);
}

const pdf = crearPdf(QUIJOTE);
const epub = crearEpub(AUSTEN);
writeFileSync(new URL('demo-quijote', archivos), pdf);
writeFileSync(new URL('demo-austen', archivos), epub);

// ---------- catálogo ----------
// Mismo formato que el que escribe apps-script/catalogo.gs (ver docs/es/formato-catalogo.md).
// Los archivos sin lector de ejemplo tienen ids "demo-sin-archivo-…": la ficha los
// muestra, pero no se pueden abrir.

const obra = (id, t, a, y, c, pa, tm, l, f) => ({ id, t, a, y, c, pa, tm, l, m: 'alta', f });
const sinArchivo = (id, x = 'pdf', s = 1_200_000, r = '') => [{ id: `demo-sin-archivo-${id}`, x, s, r }];

const catalogo = [
  obra('quijote', QUIJOTE.titulo, [QUIJOTE.autor], 1605, ['Novela', 'Novela/Clásicos'], 'ES', ['Caballería', 'Sátira'], ['spa'],
    [{ id: 'demo-quijote', x: 'pdf', s: pdf.length, r: 'Novela/Clásicos' }]),
  obra('austen', AUSTEN.titulo, [AUSTEN.autor], 1813, ['Novela', 'Novela/Clásicos'], 'GB', ['Courtship', 'Social classes'], ['eng'],
    [{ id: 'demo-austen', x: 'epub', s: epub.length, r: 'Novela/Clásicos' }]),
  obra('frankenstein', 'Frankenstein; or, The Modern Prometheus', ['Mary Shelley'], 1818, ['Novela'], 'GB', ['Science fiction', 'Gothic fiction'], ['eng'], sinArchivo('frankenstein', 'epub', 480_000, 'Novela')),
  obra('moby', 'Moby-Dick; or, The Whale', ['Herman Melville'], 1851, ['Novela'], 'US', ['Whaling', 'Sea stories'], ['eng'], sinArchivo('moby', 'epub', 820_000, 'Novela')),
  obra('karenina', 'Ana Karenina', ['León Tolstói'], 1878, ['Novela'], 'RU', ['Familia', 'Sociedad rusa'], ['spa'], sinArchivo('karenina', 'pdf', 3_400_000, 'Novela')),
  obra('regenta', 'La Regenta', ['Leopoldo Alas «Clarín»'], 1884, ['Novela', 'Novela/Clásicos'], 'ES', ['Realismo'], ['spa'], sinArchivo('regenta', 'pdf', 2_900_000, 'Novela/Clásicos')),
  obra('maria', 'María', ['Jorge Isaacs'], 1867, ['Novela'], 'CO', ['Romanticismo'], ['spa'], sinArchivo('maria', 'epub', 350_000, 'Novela')),
  obra('azul', 'Azul…', ['Rubén Darío'], 1888, ['Poesía'], 'NI', ['Modernismo'], ['spa'], sinArchivo('azul', 'pdf', 900_000, 'Poesía')),
  obra('hojas', 'Leaves of Grass', ['Walt Whitman'], 1855, ['Poesía'], 'US', ['American poetry'], ['eng'], sinArchivo('hojas', 'epub', 610_000, 'Poesía')),
  obra('rimas', 'Rimas', ['Gustavo Adolfo Bécquer'], 1871, ['Poesía'], 'ES', ['Romanticismo'], ['spa'], sinArchivo('rimas', 'pdf', 700_000, 'Poesía')),
  obra('sorjuana', 'Inundación castálida', ['Sor Juana Inés de la Cruz'], 1689, ['Poesía'], 'MX', ['Barroco'], ['spa'], sinArchivo('sorjuana', 'pdf', 5_100_000, 'Poesía')),
  obra('hamlet', 'Hamlet', ['William Shakespeare'], 1603, ['Teatro'], 'GB', ['Tragedy'], ['eng'], sinArchivo('hamlet', 'epub', 290_000, 'Teatro')),
  obra('vida', 'La vida es sueño', ['Pedro Calderón de la Barca'], 1635, ['Teatro'], 'ES', ['Barroco', 'Libre albedrío'], ['spa'], sinArchivo('vida', 'pdf', 1_100_000, 'Teatro')),
  obra('casa', 'Casa de muñecas', ['Henrik Ibsen'], 1879, ['Teatro'], 'NO', ['Drama'], ['spa'], sinArchivo('casa', 'pdf', 800_000, 'Teatro')),
  obra('meditaciones', 'Meditaciones', ['Marco Aurelio'], 180, ['Filosofía'], 'IT', ['Estoicismo'], ['spa'], sinArchivo('meditaciones', 'epub', 400_000, 'Filosofía')),
  obra('metodo', 'Discurso del método', ['René Descartes'], 1637, ['Filosofía'], 'FR', ['Racionalismo'], ['spa'], sinArchivo('metodo', 'pdf', 650_000, 'Filosofía')),
  obra('zaratustra', 'Así habló Zaratustra', ['Friedrich Nietzsche'], 1883, ['Filosofía'], 'DE', ['Filosofía alemana'], ['spa'], sinArchivo('zaratustra', 'epub', 520_000, 'Filosofía')),
  obra('vindicacion', 'A Vindication of the Rights of Woman', ['Mary Wollstonecraft'], 1792, ['Filosofía'], 'GB', ['Feminism', 'Education'], ['eng'], sinArchivo('vindicacion', 'epub', 450_000, 'Filosofía')),
  obra('origen', 'On the Origin of Species', ['Charles Darwin'], 1859, ['Ciencia'], 'GB', ['Evolution', 'Natural selection'], ['eng'], sinArchivo('origen', 'pdf', 6_300_000, 'Ciencia')),
  obra('dialogo', 'Diálogo sobre los dos máximos sistemas del mundo', ['Galileo Galilei'], 1632, ['Ciencia'], 'IT', ['Astronomía'], ['spa'], sinArchivo('dialogo', 'pdf', 9_800_000, 'Ciencia')),
  obra('elementos', 'Elementos', ['Euclides'], -300, ['Ciencia'], undefined, ['Geometría'], ['spa'], sinArchivo('elementos', 'pdf', 12_000_000, 'Ciencia')),
  obra('cuentos', 'Cuentos de amor de locura y de muerte', ['Horacio Quiroga'], 1917, ['Novela'], 'UY', ['Cuento'], ['spa'], sinArchivo('cuentos', 'epub', 380_000, 'Novela')),
].map((o) => {
  const r = JSON.parse(JSON.stringify(o)); // quita los campos vacíos
  if (r.y < 0) delete r.y; // sin año negativo en la ficha
  return r;
});

writeFileSync(new URL('catalogo-demo.json', carpeta), JSON.stringify(catalogo, null, 1) + '\n');
console.log(`Demostración: ${catalogo.length} obras, ${pdf.length} bytes de PDF, ${epub.length} bytes de EPUB → web/demo/`);
