/**
 * Catálogo automático · Automatic catalog
 *
 * Cada noche recorre la carpeta raíz de Drive, agrupa los archivos en obras,
 * busca en Open Library los datos de las obras nuevas y reemplaza el
 * contenido del archivo del catálogo (NOMBRE_CATALOGO en config.gs; siempre el
 * mismo archivo, así la app no nota el cambio). Las obras que ya estaban
 * conservan sus metadatos.
 *
 * Every night it walks the root Drive folder, groups files into works, looks
 * up new works in Open Library and rewrites the catalog file. Works already in
 * the catalog keep their metadata.
 *
 * Uso / usage (en el mismo proyecto que config.gs e inventario.gs):
 *   1. Ejecuta `actualizarCatalogo` una vez a mano y acepta los permisos. La
 *      primera vez crea el archivo del catálogo en la carpeta raíz.
 *   2. Ejecuta `instalarCatalogoNocturno`: programa la actualización diaria.
 *   El resultado de cada ejecución queda en la pestaña "Estado", fila 2.
 *
 * Correcciones a mano: la pestaña "Correcciones" lista todas las obras con lo
 * que se detectó (columnas A–F, las escribe el script) y columnas para
 * corregir título, autores, año, portada u ocultar la obra, y para agregar
 * editorial y ciudad que usa la ficha al citar (G–N, las escribe la persona).
 * Se aplican en cada ejecución; borrar una corrección devuelve el valor
 * detectado.
 *
 * Países de los autores: la pestaña Autores lista al autor principal de cada
 * obra con el país que propone Wikidata (`buscarPaises`) y columnas para
 * corregirlo. Lo corregido siempre tiene prioridad.
 */

const LIMITE_CATALOGO_MS = 4.5 * 60 * 1000;
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const OL_API = 'https://openlibrary.org/search.json';
const OL_CAMPOS = 'key,title,subtitle,author_name,first_publish_year,cover_i,language,subject,publisher,isbn';
const OL_PORTADA = 'https://covers.openlibrary.org/b/id/{}-M.jpg';
const OL_PAUSA_MS = 1000; // Open Library pide no pasar de ~1 consulta por segundo
const N_CORRECCIONES = 14;
function columnasCorrecciones() {
  return L([
    'ID (no editar)', 'Título detectado', 'Autores detectados', 'Año', 'Colección', 'Coincidencia',
    'Título corregido', 'Autores corregidos (separa con ;)', 'Año corregido', 'Portada: ISBN, enlace de imagen o "ninguna"', 'Ocultar (sí)', 'Notas',
    'Editorial (para citar)', 'Ciudad (para citar)',
  ], [
    'ID (do not edit)', 'Detected title', 'Detected authors', 'Year', 'Collection', 'Match',
    'Corrected title', 'Corrected authors (separate with ;)', 'Corrected year', 'Cover: ISBN, image link or "none"', 'Hide (yes)', 'Notes',
    'Publisher (for citing)', 'City (for citing)',
  ]);
}
const COLUMNAS_DETECTADAS = 6; // A–F las escribe el script; G–N son de la persona

const FORMATOS_LIBRO = ['pdf', 'epub', 'mobi', 'azw3', 'azw', 'fb2', 'djvu', 'cbz', 'txt', 'docx'];
const BASURA_EXACTA = ['.ds_store', 'thumbs.db', 'desktop.ini'];
// Sufijos que agregan algunos sitios de descarga al nombre del archivo
const SUFIJO_ZLIB = /\s*\((?:z-library[^)]*|z-lib[^)]*|1lib[^)]*)\)\s*$/i;
const ANNAS = /^anna.s archive$/i;
const RUIDO_AUTOR = /\((?:editor|editors|eds?\.?|ed|trad\.?|translator|comp\.?)\)|\bjoint author\b|\betc\.?|\(auth[^)]*\)|\bProfessor\b|\bedited by\b|\b\d{4}-(?:\d{4})?|\[[^\]]*\]/gi;

// ---------- entrada: ejecución nocturna ----------

function actualizarCatalogo() {
  idsConfigurados();
  const inicio = Date.now();
  const raiz = DriveApp.getFolderById(ROOT_ID);
  const archivo = raiz.getFilesByName(NOMBRE_CATALOGO);
  // La primera vez se crea vacío; desde entonces se reescribe siempre el mismo archivo
  const destino = archivo.hasNext() ? archivo.next() : raiz.createFile(NOMBRE_CATALOGO, '[]', 'application/json');
  const anterior = JSON.parse(destino.getBlob().getDataAsString('UTF-8') || '[]');

  const hoja = hojaCorrecciones();
  const filas = hoja.getDataRange().getValues().slice(1);
  const correcciones = leerCorrecciones(filas);

  const registros = recorrerDrive(ROOT_ID);
  const r = construirCatalogo(registros, anterior, {
    buscar: consultarOpenLibrary,
    quedaTiempo: () => Date.now() - inicio < LIMITE_CATALOGO_MS,
  });
  const corregida = r.salida.map((o) => aplicarCorreccion(o, correcciones.get(o.id)));
  const hojaPaises = hojaAutores();
  const filasPaises = filasAutores(corregida, hojaPaises.getDataRange().getValues().slice(1));
  escribirAutores(hojaPaises, filasPaises);
  const paises = leerPaises(filasPaises);
  const salida = corregida.map((o) => aplicarPais(o, paises));

  const texto = JSON.stringify(salida);
  if (texto !== JSON.stringify(anterior)) destino.setContent(texto);
  escribirCorrecciones(hoja, filasCorrecciones(salida, filas));
  const corregidas = salida.filter((o) => o._o).length;
  marcarCatalogo(salida.length + L(' obras · ', ' works · ') + r.nuevas + L(' nuevas · ', ' new · ') + r.quitadas + L(' quitadas · ', ' removed · ') +
    corregidas + L(' con correcciones', ' with corrections') +
    (r.pendientes ? ' · ' + r.pendientes + L(' sin metadatos todavía (siguen mañana)', ' without metadata yet (continue tomorrow)') : ''));
  // Autores nuevos: se busca su país aparte, para no alargar esta ejecución
  if (filasPaises.some(autorPendiente)) ScriptApp.newTrigger('buscarPaises').timeBased().after(60 * 1000).create();
}

function hojaCorrecciones() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let hoja = ss.getSheetByName(nombreHoja('correcciones'));
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja('correcciones'));
    hoja.getRange(1, 1, 1, N_CORRECCIONES).setValues([columnasCorrecciones()]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.setFrozenColumns(2);
    hoja.getRange('A:F').setFontColor('#6b655c');
    hoja.getRange('G1:N1').setBackground('#fbe9c8');
    hoja.setColumnWidth(1, 80);
    hoja.setColumnWidths(2, 2, 260);
    hoja.setColumnWidths(7, 2, 260);
  }
  return hoja;
}

// Reescribe A–F con lo detectado y conserva G–N tal como las dejó la persona.
function escribirCorrecciones(hoja, filas) {
  const filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  if (hoja.getMaxRows() > 1) hoja.getRange(2, 1, hoja.getMaxRows() - 1, N_CORRECCIONES).clearContent();
  if (filas.length) hoja.getRange(2, 1, filas.length, N_CORRECCIONES).setValues(filas);
  hoja.getRange(1, 1, filas.length + 1, N_CORRECCIONES).createFilter();
}

function instalarCatalogoNocturno() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'actualizarCatalogo')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('actualizarCatalogo').timeBased().everyDays(1).atHour(HORA_NOCTURNA).create();
  marcarCatalogo(L('Actualización nocturna programada (', 'Nightly update scheduled (') + HORA_NOCTURNA + ':00)');
}

function marcarCatalogo(texto) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  hoja.getRange('A2').setValue(L('Catálogo: ', 'Catalog: ') + texto);
  hoja.getRange('B2').setValue(new Date());
}

// Recorre las carpetas con la API de Drive (mucho más rápida que DriveApp
// con miles de archivos). Devuelve un registro por archivo, como el inventario.
function recorrerDrive(raizId) {
  const token = ScriptApp.getOAuthToken();
  const cola = [[raizId, '']];
  const registros = [];
  while (cola.length) {
    const [carpeta, ruta] = cola.shift();
    let pagina = '';
    do {
      const q = encodeURIComponent("'" + carpeta + "' in parents and trashed = false");
      const url = DRIVE_API + '?q=' + q + '&pageSize=1000&orderBy=name' +
        '&fields=nextPageToken,files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true' +
        (pagina ? '&pageToken=' + pagina : '');
      const datos = JSON.parse(UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } }).getContentText());
      datos.files.forEach((f) => {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          // Los duplicados apartados por la reorganización no son parte del catálogo,
          // ni el archivo de portadas si está dentro de la raíz
          if (!ruta && f.name === CARPETA_DUPLICADOS) return;
          if (f.id === CARPETA_PORTADAS_ID) return;
          cola.push([f.id, ruta ? ruta + '/' + f.name : f.name]);
        } else {
          registros.push({
            id: f.id, nombre: f.name, ruta: ruta, coleccion: ruta.split('/')[0] || '(raíz)',
            mime: f.mimeType, tamano: Number(f.size || 0),
          });
        }
      });
      pagina = datos.nextPageToken || '';
    } while (pagina);
  }
  return registros;
}

function consultarOpenLibrary(params) {
  const url = OL_API + '?' + codificarParametros(Object.assign({}, params, { fields: OL_CAMPOS, limit: 5 }));
  for (let intento = 0; ; intento++) {
    try {
      const r = UrlFetchApp.fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      Utilities.sleep(OL_PAUSA_MS);
      return JSON.parse(r.getContentText());
    } catch (e) {
      if (intento === 2) throw e;
      Utilities.sleep(5000 * (intento + 1));
    }
  }
}

// Igual que urllib.parse.urlencode de Python (espacios como "+").
function codificarParametros(params) {
  return Object.keys(params).map((k) => k + '=' + encodeURIComponent(String(params[k]))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+')).join('&');
}

// ---------- catálogo completo (sin acceso a Google: se prueba en Node) ----------

// `anterior` es el catálogo publicado: sus obras conservan metadatos y solo
// se consultan en Open Library las nuevas (o las que quedaron pendientes).
function construirCatalogo(registros, anterior, { buscar, quedaTiempo }) {
  const previas = new Map(anterior.map(sinCorreccion).filter((o) => o.m !== 'pendiente').map((o) => [o.id, o]));
  const conocidas = new Set(anterior.map((o) => o.id));
  const obras = agruparObras(registros);
  const nombres = new Map();
  let nuevas = 0;
  let pendientes = 0;
  const salida = obras.map((obra) => {
    const previa = previas.get(obra.id);
    if (previa) {
      const base = aSalida(obra, nombres); // también registra los nombres de colección
      return Object.assign({}, previa, { c: base.c, f: base.f });
    }
    if (!conocidas.has(obra.id)) nuevas++;
    if (!quedaTiempo()) {
      pendientes++;
      return Object.assign(aSalida(Object.assign({}, obra, { metadatos: {} }), nombres), { m: 'pendiente' });
    }
    let enriquecida;
    try {
      enriquecida = enriquecer(obra, buscar);
    } catch (e) { // una obra que falla no detiene el resto
      enriquecida = Object.assign({}, obra, { metadatos: { fuente: null, confianza: 'sin coincidencia' } });
    }
    return aSalida(enriquecida, nombres);
  });
  const ids = new Set(salida.map((o) => o.id));
  const quitadas = anterior.filter((o) => !ids.has(o.id)).length;
  return { salida, nuevas, quitadas, pendientes };
}

// ---------- correcciones a mano ----------

const SI = ['sí', 'si', 'x', 'true', 'ocultar', 'yes', 'y', 'hide'];

function leerCorrecciones(filas) {
  const mapa = new Map();
  filas.forEach((f) => {
    const id = String(f[0] || '').trim();
    const [t, a, y, isbn, ocultar, , ed, lu] = f.slice(COLUMNAS_DETECTADAS, N_CORRECCIONES).map((v) => String(v === true ? 'true' : v || '').trim());
    if (!id || !(t || a || y || isbn || ocultar || ed || lu)) return;
    mapa.set(id, {
      t: t || undefined,
      a: a ? a.split(';').map((x) => x.trim()).filter(Boolean) : undefined,
      y: /^\d{3,4}$/.test(y) ? Number(y) : undefined,
      p: portadaManual(isbn),
      h: SI.includes(ocultar.toLowerCase()) || undefined,
      ed: ed || undefined,
      lu: lu || undefined,
    });
  });
  return mapa;
}

// Columna J: un ISBN (portada de Open Library), "ninguna" o "none" (portada generada),
// el enlace de una imagen en Drive ("drive:<id>", la app la pide con el token
// de quien lee) o el de una imagen de internet.
function portadaManual(texto) {
  if (!texto) return undefined;
  if (['ninguna', 'none'].includes(texto.toLowerCase())) return null;
  const drive = texto.match(/(?:drive|docs)\.google\.com\/.*?(?:\/d\/|[?&]id=)([\w-]{20,})/);
  if (drive) return 'drive:' + drive[1];
  if (/^https:\/\//i.test(texto)) return texto;
  return 'https://covers.openlibrary.org/b/isbn/' + texto.replace(/[^0-9Xx]/g, '') + '-M.jpg';
}

// Guarda en `_o` los valores detectados que la corrección reemplaza, para
// poder volver a ellos si la corrección se borra.
function aplicarCorreccion(o, c) {
  if (!c) return o;
  const r = Object.assign({}, o);
  const originales = {};
  // ed y lu (editorial y ciudad, para citar) se agregan sin marcar la obra
  // como corregida: no cambian la identificación
  ['t', 'a', 'y', 'p', 'h', 'ed', 'lu'].forEach((k) => {
    if (c[k] === undefined) return;
    originales[k] = o[k] === undefined ? null : o[k];
    r[k] = c[k];
  });
  if (!Object.keys(originales).length) return o;
  if (!['t', 'a', 'y', 'p', 'h'].some((k) => k in originales)) {
    r._o = originales;
    return r;
  }
  if (c.t !== undefined) {
    originales.z = o.z === undefined ? null : o.z;
    r.z = pobre(c.t) || undefined;
    if (r.z === undefined) delete r.z;
  }
  originales.m = o.m === undefined ? null : o.m;
  r.m = 'manual';
  r._o = originales;
  return r;
}

function sinCorreccion(o) {
  if (!o._o) return o;
  const r = Object.assign({}, o);
  Object.keys(o._o).forEach((k) => {
    if (o._o[k] === null) delete r[k];
    else r[k] = o._o[k];
  });
  delete r._o;
  return r;
}

// Una fila por obra: A–F con lo detectado, G–N con lo que ya había escrito la
// persona. Las correcciones de obras que ya no están en Drive se conservan al
// final para no perder trabajo.
function filasCorrecciones(salida, filasPrevias) {
  const previas = new Map(filasPrevias.filter((f) => f[0]).map((f) => [String(f[0]), f.slice(COLUMNAS_DETECTADAS, N_CORRECCIONES)]));
  const vacias = Array(N_CORRECCIONES - COLUMNAS_DETECTADAS).fill('');
  const filas = salida.map((obra) => {
    const o = sinCorreccion(obra);
    // Un título que empieza con "=" no debe leerse como fórmula
    const fila = [o.id, /^[=+]/.test(o.t) ? "'" + o.t : o.t, (o.a || []).join('; '), o.y || '', (o.c || []).join(', '), o.m || ''];
    const resto = previas.get(o.id) || vacias;
    previas.delete(o.id);
    return fila.concat(resto);
  });
  previas.forEach((resto, id) => {
    if (resto.some((v) => String(v).trim())) filas.push([id, L('(ya no está en Drive)', '(no longer in Drive)'), '', '', '', ''].concat(resto));
  });
  return filas;
}

// ---------- países de los autores ----------
//
// `buscarPaises` llena la pestaña "Autores" con lo que propone Wikidata para el
// autor principal de cada obra: A–G las escribe el script; H–J son de la persona
// y tienen prioridad. El país se elige así: la nacionalidad en un país actual; si
// son varias, la adoptada (distinta de la de nacimiento), y la otra queda como
// segundo país; si solo hay países históricos, el país actual donde nació.
//
// La columna Confianza usa valores internos que no se traducen: "alta" (high),
// "revisar" (check), "sin dato" (no data) y "colectivo" (collective author).

const N_AUTORES = 10;
function columnasAutores() {
  return L([
    'Autor (no editar)', 'Obras', 'País detectado', 'Segundo país detectado', 'Confianza', 'Motivo', 'Wikidata',
    'País corregido', 'Segundo país corregido', 'Notas',
  ], [
    'Author (do not edit)', 'Works', 'Detected country', 'Detected second country', 'Confidence', 'Reason', 'Wikidata',
    'Corrected country', 'Corrected second country', 'Notes',
  ]);
}
const COLUMNAS_AUTORES_DETECTADAS = 7; // A–G las escribe el script; H–J son de la persona
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_PAUSA_MS = 1200;
const LIMITE_PAISES_MS = 4.5 * 60 * 1000;
const PERSONA = 'Q5';
// Escritor, autor, novelista, poeta, filósofo, investigador, periodista, historiador,
// profesor universitario, ensayista, traductor, sociólogo, crítico literario,
// guionista y dramaturgo: entre homónimos, distingue a quien escribe libros.
const OCUPACIONES_AUTOR = ['Q36180', 'Q482980', 'Q6625963', 'Q49757', 'Q4964182', 'Q1650915', 'Q1930187', 'Q201788', 'Q1622272', 'Q11774202', 'Q333634', 'Q2306091', 'Q4263842', 'Q28389', 'Q214917'];
const AUTOR_COLECTIVO = /^(vv ?aa|aa ?vv|varios( autores)?|autores varios|various( authors)?|anonimo|anonymous|unknown|desconocido)$/;
const NOMBRES_PAISES = {AC:"Isla de la Ascensión",AD:"Andorra",AE:"Emiratos Árabes Unidos",AF:"Afganistán",AG:"Antigua y Barbuda",AI:"Anguila",AL:"Albania",AM:"Armenia",AO:"Angola",AQ:"Antártida",AR:"Argentina",AS:"Samoa Americana",AT:"Austria",AU:"Australia",AW:"Aruba",AX:"Islas Aland",AZ:"Azerbaiyán",BA:"Bosnia y Herzegovina",BB:"Barbados",BD:"Bangladés",BE:"Bélgica",BF:"Burkina Faso",BG:"Bulgaria",BH:"Baréin",BI:"Burundi",BJ:"Benín",BL:"San Bartolomé",BM:"Bermudas",BN:"Brunéi",BO:"Bolivia",BQ:"Caribe neerlandés",BR:"Brasil",BS:"Bahamas",BT:"Bután",BV:"Isla Bouvet",BW:"Botsuana",BY:"Bielorrusia",BZ:"Belice",CA:"Canadá",CC:"Islas Cocos",CD:"República Democrática del Congo",CF:"República Centroafricana",CG:"Congo",CH:"Suiza",CI:"Côte d’Ivoire",CK:"Islas Cook",CL:"Chile",CM:"Camerún",CN:"China",CO:"Colombia",CP:"Isla Clipperton",CR:"Costa Rica",CU:"Cuba",CV:"Cabo Verde",CW:"Curazao",CX:"Isla de Navidad",CY:"Chipre",CZ:"Chequia",DE:"Alemania",DG:"Diego García",DJ:"Yibuti",DK:"Dinamarca",DM:"Dominica",DO:"República Dominicana",DZ:"Argelia",EC:"Ecuador",EE:"Estonia",EG:"Egipto",EH:"Sáhara Occidental",ER:"Eritrea",ES:"España",ET:"Etiopía",FI:"Finlandia",FJ:"Fiyi",FK:"Islas Malvinas",FM:"Micronesia",FO:"Islas Feroe",FR:"Francia",GA:"Gabón",GB:"Reino Unido",GD:"Granada",GE:"Georgia",GF:"Guayana Francesa",GG:"Guernesey",GH:"Ghana",GI:"Gibraltar",GL:"Groenlandia",GM:"Gambia",GN:"Guinea",GP:"Guadalupe",GQ:"Guinea Ecuatorial",GR:"Grecia",GS:"Islas Georgia del Sur y Sandwich del Sur",GT:"Guatemala",GU:"Guam",GW:"Guinea-Bisáu",GY:"Guyana",HK:"RAE de Hong Kong (China)",HM:"Islas Heard y McDonald",HN:"Honduras",HR:"Croacia",HT:"Haití",HU:"Hungría",ID:"Indonesia",IE:"Irlanda",IL:"Israel",IM:"Isla de Man",IN:"India",IO:"Territorio Británico del Océano Índico",IQ:"Irak",IR:"Irán",IS:"Islandia",IT:"Italia",JE:"Jersey",JM:"Jamaica",JO:"Jordania",JP:"Japón",KE:"Kenia",KG:"Kirguistán",KH:"Camboya",KI:"Kiribati",KM:"Comoras",KN:"San Cristóbal y Nieves",KP:"Corea del Norte",KR:"Corea del Sur",KW:"Kuwait",KY:"Islas Caimán",KZ:"Kazajistán",LA:"Laos",LB:"Líbano",LC:"Santa Lucía",LI:"Liechtenstein",LK:"Sri Lanka",LR:"Liberia",LS:"Lesoto",LT:"Lituania",LU:"Luxemburgo",LV:"Letonia",LY:"Libia",MA:"Marruecos",MC:"Mónaco",MD:"Moldavia",ME:"Montenegro",MF:"San Martín",MG:"Madagascar",MH:"Islas Marshall",MK:"Macedonia del Norte",ML:"Mali",MM:"Myanmar (Birmania)",MN:"Mongolia",MO:"RAE de Macao (China)",MP:"Islas Marianas del Norte",MQ:"Martinica",MR:"Mauritania",MS:"Montserrat",MT:"Malta",MU:"Mauricio",MV:"Maldivas",MW:"Malaui",MX:"México",MY:"Malasia",MZ:"Mozambique",NA:"Namibia",NC:"Nueva Caledonia",NE:"Níger",NF:"Isla Norfolk",NG:"Nigeria",NI:"Nicaragua",NL:"Países Bajos",NO:"Noruega",NP:"Nepal",NR:"Nauru",NU:"Niue",NZ:"Nueva Zelanda",OM:"Omán",PA:"Panamá",PE:"Perú",PF:"Polinesia Francesa",PG:"Papúa Nueva Guinea",PH:"Filipinas",PK:"Pakistán",PL:"Polonia",PM:"San Pedro y Miquelón",PN:"Islas Pitcairn",PR:"Puerto Rico",PS:"Territorios Palestinos",PT:"Portugal",PW:"Palaos",PY:"Paraguay",QA:"Catar",RE:"Reunión",RO:"Rumanía",RS:"Serbia",RU:"Rusia",RW:"Ruanda",SA:"Arabia Saudí",SB:"Islas Salomón",SC:"Seychelles",SD:"Sudán",SE:"Suecia",SG:"Singapur",SH:"Santa Elena",SI:"Eslovenia",SJ:"Svalbard y Jan Mayen",SK:"Eslovaquia",SL:"Sierra Leona",SM:"San Marino",SN:"Senegal",SO:"Somalia",SR:"Surinam",SS:"Sudán del Sur",ST:"Santo Tomé y Príncipe",SV:"El Salvador",SX:"Sint Maarten",SY:"Siria",SZ:"Esuatini",TA:"Tristán de Acuña",TC:"Islas Turcas y Caicos",TD:"Chad",TF:"Territorios Australes Franceses",TG:"Togo",TH:"Tailandia",TJ:"Tayikistán",TK:"Tokelau",TL:"Timor-Leste",TM:"Turkmenistán",TN:"Túnez",TO:"Tonga",TR:"Turquía",TT:"Trinidad y Tobago",TV:"Tuvalu",TW:"Taiwán",TZ:"Tanzania",UA:"Ucrania",UG:"Uganda",UM:"Islas menores alejadas de EE. UU.",US:"Estados Unidos",UY:"Uruguay",UZ:"Uzbekistán",VA:"Ciudad del Vaticano",VC:"San Vicente y las Granadinas",VE:"Venezuela",VG:"Islas Vírgenes Británicas",VI:"Islas Vírgenes de EE. UU.",VN:"Vietnam",VU:"Vanuatu",WF:"Wallis y Futuna",WS:"Samoa",XK:"Kosovo",YE:"Yemen",YT:"Mayotte",ZA:"Sudáfrica",ZM:"Zambia",ZW:"Zimbabue"};
const OTROS_NOMBRES_PAISES = { 'estados unidos de america': 'US', 'eeuu': 'US', 'eua': 'US', 'usa': 'US', 'united states': 'US', 'inglaterra': 'GB', 'england': 'GB', 'escocia': 'GB', 'scotland': 'GB', 'gales': 'GB', 'wales': 'GB', 'gran bretana': 'GB', 'great britain': 'GB', 'uk': 'GB', 'corea': 'KR', 'korea': 'KR', 'holanda': 'NL', 'holland': 'NL', 'republica checa': 'CZ', 'czech republic': 'CZ' };

// En español, la tabla de arriba; en inglés, los nombres de Intl si el entorno los tiene.
function nombreRegion(codigo) {
  if (IDIOMA === 'es') return NOMBRES_PAISES[codigo] || codigo;
  try {
    return new Intl.DisplayNames([IDIOMA], { type: 'region' }).of(codigo) || codigo;
  } catch (e) {
    return codigo;
  }
}
const nombrePaisCodigo = (codigo) => (codigo ? nombreRegion(codigo) + ' (' + codigo + ')' : '');
const codigoEnTexto = (texto) => (String(texto || '').match(/\(([A-Z]{2})\)\s*$/) || [])[1] || '';

// Lo escrito a mano: "España", "Spain", "ES" o "ninguno"/"none". Devuelve el código, 'ninguno' o null si no se entiende.
function paisDeTexto(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) return null;
  const clave = normalizar(limpio);
  if (['ninguno', 'ninguna', 'none'].includes(clave)) return 'ninguno';
  if (/^[A-Za-z]{2}$/.test(limpio) && NOMBRES_PAISES[limpio.toUpperCase()]) return limpio.toUpperCase();
  if (codigoEnTexto(limpio)) return codigoEnTexto(limpio);
  const codigo = Object.keys(NOMBRES_PAISES).find((k) => normalizar(NOMBRES_PAISES[k]) === clave || normalizar(nombreRegion(k)) === clave);
  return codigo || OTROS_NOMBRES_PAISES[clave] || null;
}

function nombreCoincide(nombre, candidatos) {
  const partes = normalizar(nombre).split(' ').filter((p) => p.length > 1);
  if (!partes.length) return false;
  return candidatos.some((c) => {
    const palabras = normalizar(c || '').split(' ');
    return partes.filter((p) => palabras.includes(p)).length >= Math.min(2, partes.length);
  });
}

function valoresDe(entidad, propiedad) {
  const vivas = ((entidad.claims || {})[propiedad] || []).filter((s) => s.rank !== 'deprecated' && s.mainsnak.datavalue);
  const preferidas = vivas.filter((s) => s.rank === 'preferred');
  return (preferidas.length ? preferidas : vivas).map((s) => s.mainsnak.datavalue.value.id || s.mainsnak.datavalue.value);
}

// `codigos`: QID de país → ISO, o '' si es histórico. Se guarda entre consultas.
function codigosDePaises(ids, pedir, codigos) {
  const faltan = ids.filter((id) => !(id in codigos));
  for (let i = 0; i < faltan.length; i += 40) {
    const parte = faltan.slice(i, i + 40);
    const datos = pedir({ action: 'wbgetentities', ids: parte.join('|'), props: 'claims', format: 'json' }).entities;
    parte.forEach((id) => { codigos[id] = valoresDe(datos[id] || {}, 'P297')[0] || ''; });
  }
  // La Unión Soviética y otros países desaparecidos conservan un código que ya no existe
  return ids.map((id) => codigos[id]).filter((c) => NOMBRES_PAISES[c]);
}

function paisDeNacimiento(entidad, pedir, codigos) {
  const lugar = valoresDe(entidad, 'P19')[0];
  if (!lugar) return '';
  const datos = pedir({ action: 'wbgetentities', ids: lugar, props: 'claims', format: 'json' }).entities[lugar] || {};
  return codigosDePaises(valoresDe(datos, 'P17'), pedir, codigos)[0] || '';
}

// Sin acceso a Google: `pedir` hace la consulta, y así se prueba en Node.
function buscarPaisAutor(nombre, pedir, codigos) {
  const sinDato = (motivo, qid) => ({ pais: '', segundo: '', confianza: 'sin dato', motivo: motivo, qid: qid || '' });
  const hallados = pedir({ action: 'wbsearchentities', search: nombre, language: IDIOMA, uselang: IDIOMA, type: 'item', limit: 7, format: 'json' }).search
    .filter((h) => nombreCoincide(nombre, [h.label, h.match && h.match.text].concat(h.aliases || [])));
  if (!hallados.length) return sinDato(L('No aparece en Wikidata', 'Not found in Wikidata'));
  const entidades = pedir({ action: 'wbgetentities', ids: hallados.map((h) => h.id).join('|'), props: 'claims', format: 'json' }).entities;
  const personas = hallados.map((h) => Object.assign({ id: h.id }, entidades[h.id])).filter((e) => valoresDe(e, 'P31').includes(PERSONA));
  if (!personas.length) return sinDato(L('No aparece como persona en Wikidata', 'Not found as a person in Wikidata'));
  const autores = personas.filter((e) => valoresDe(e, 'P106').some((o) => OCUPACIONES_AUTOR.includes(o)));
  const elegida = autores[0] || personas[0];
  let motivo = autores.length > 1 ? L('Homónimos: confirmar la persona', 'Namesakes: confirm the person') : autores.length ? '' : L('No consta como autor: confirmar la persona', 'Not listed as an author: confirm the person');

  const declarados = valoresDe(elegida, 'P27');
  const actuales = [...new Set(codigosDePaises(declarados, pedir, codigos))];
  let pais = actuales[0] || '';
  let segundo = '';
  if (actuales.length > 1) {
    const nacimiento = paisDeNacimiento(elegida, pedir, codigos);
    if (actuales.includes(nacimiento)) {
      pais = actuales.find((c) => c !== nacimiento);
      segundo = nacimiento;
    } else {
      segundo = actuales[1];
    }
  } else if (!actuales.length) {
    pais = paisDeNacimiento(elegida, pedir, codigos);
    if (!pais) return sinDato(L('Sin nacionalidad ni lugar de nacimiento', 'No nationality or birthplace'), elegida.id);
    motivo = motivo || L('Por lugar de nacimiento: confirmar', 'By birthplace: confirm');
  }
  return { pais: pais, segundo: segundo, confianza: motivo ? 'revisar' : 'alta', motivo: motivo, qid: elegida.id };
}

const autorPendiente = (fila) => fila[0] && !fila[4];

// Una fila por autor principal, de más a menos obras. Lo detectado y lo escrito se
// conservan; quien ya no está se va, salvo que tenga algo escrito a mano.
function filasAutores(salida, filasPrevias) {
  const cuenta = new Map();
  salida.forEach((o) => {
    const autor = o.a && o.a[0];
    if (autor) cuenta.set(autor, (cuenta.get(autor) || 0) + 1);
  });
  const previas = new Map(filasPrevias.filter((f) => f[0]).map((f) => [String(f[0]), f]));
  const filas = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], IDIOMA))
    .map(([autor, obras]) => {
      const previa = previas.get(autor);
      previas.delete(autor);
      const fila = [autor, obras].concat(previa ? previa.slice(2, N_AUTORES) : Array(N_AUTORES - 2).fill(''));
      if (!fila[4] && AUTOR_COLECTIVO.test(normalizar(autor))) fila[4] = 'colectivo';
      return fila;
    });
  previas.forEach((f, autor) => {
    if (f.slice(COLUMNAS_AUTORES_DETECTADAS, N_AUTORES).some((v) => String(v).trim())) filas.push([autor, 0].concat(f.slice(2, N_AUTORES)));
  });
  return filas;
}

// Autor → { pa, pa2, pd }. Lo corregido a mano manda y deja de estar «por confirmar».
function leerPaises(filas) {
  const mapa = new Map();
  filas.forEach((f) => {
    const corregido = paisDeTexto(f[7]);
    const segundo = paisDeTexto(f[8]);
    const pa = corregido || codigoEnTexto(f[2]);
    if (!pa || pa === 'ninguno') return;
    const pa2 = (segundo && segundo !== 'ninguno' && segundo) || (corregido || segundo ? '' : codigoEnTexto(f[3]));
    mapa.set(String(f[0]), { pa: pa, pa2: pa2 && pa2 !== pa ? pa2 : undefined, pd: !corregido && f[4] === 'revisar' ? true : undefined });
  });
  return mapa;
}

function aplicarPais(o, paises) {
  const r = Object.assign({}, o);
  delete r.pa;
  delete r.pa2;
  delete r.pd;
  const dato = o.a && o.a[0] && paises.get(o.a[0]);
  if (!dato) return r;
  r.pa = dato.pa;
  if (dato.pa2) r.pa2 = dato.pa2;
  if (dato.pd) r.pd = true;
  return r;
}

function hojaAutores() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let hoja = ss.getSheetByName(nombreHoja('autores'));
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja('autores'));
    hoja.getRange(1, 1, 1, N_AUTORES).setValues([columnasAutores()]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.setFrozenColumns(1);
    hoja.getRange('A:G').setFontColor('#6b655c');
    hoja.getRange('H1:J1').setBackground('#fbe9c8');
    hoja.setColumnWidth(1, 240);
    hoja.setColumnWidths(3, 2, 170);
    hoja.setColumnWidth(6, 260);
    hoja.setColumnWidths(8, 2, 170);
  }
  return hoja;
}

function escribirAutores(hoja, filas) {
  const filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  if (hoja.getMaxRows() > 1) hoja.getRange(2, 1, hoja.getMaxRows() - 1, N_AUTORES).clearContent();
  if (filas.length) hoja.getRange(2, 1, filas.length, N_AUTORES).setValues(filas);
  hoja.getRange(1, 1, filas.length + 1, N_AUTORES).createFilter();
}

function consultarWikidata(params) {
  const r = UrlFetchApp.fetch(WIKIDATA_API + '?' + codificarParametros(params), {
    muteHttpExceptions: true,
    headers: { 'User-Agent': USER_AGENT },
  });
  Utilities.sleep(WIKIDATA_PAUSA_MS);
  if (r.getResponseCode() === 429 || r.getResponseCode() >= 500) throw new Error('LIMITE');
  // Wikidata también avisa de sus límites con un 200: ese autor se reintenta después
  let datos;
  try { datos = JSON.parse(r.getContentText()); } catch (e) { throw new Error('LIMITE'); }
  if (datos.error) throw new Error('LIMITE');
  return datos;
}

// Avanza hasta el límite de tiempo y se reprograma; lo ya buscado no se repite.
// Si Wikidata limita las consultas, espera 15 minutos; si una vuelta no avanza
// nada, lo deja para la actualización de la noche siguiente.
function buscarPaises() {
  const inicio = Date.now();
  ScriptApp.getProjectTriggers()
    .filter((t) => ['buscarPaises', 'catalogoTrasPortadas'].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  const catalogo = JSON.parse(DriveApp.getFolderById(ROOT_ID).getFilesByName(NOMBRE_CATALOGO).next().getBlob().getDataAsString('UTF-8'));
  const hoja = hojaAutores();
  const filas = filasAutores(catalogo, hoja.getDataRange().getValues().slice(1));
  escribirAutores(hoja, filas);
  const propiedades = PropertiesService.getScriptProperties();
  const codigos = JSON.parse(propiedades.getProperty('codigosPaises') || '{}');
  let hechos = 0;
  let limitado = false;
  for (let i = 0; i < filas.length; i++) {
    if (!autorPendiente(filas[i])) continue;
    if (Date.now() - inicio > LIMITE_PAISES_MS) break;
    let r;
    try {
      r = buscarPaisAutor(filas[i][0], consultarWikidata, codigos);
    } catch (error) {
      if (error.message === 'LIMITE') { limitado = true; break; }
      r = { pais: '', segundo: '', confianza: 'sin dato', motivo: 'Error: ' + error.message, qid: '' };
    }
    filas[i].splice(2, 5, nombrePaisCodigo(r.pais), nombrePaisCodigo(r.segundo), r.confianza, r.motivo, r.qid);
    hoja.getRange(i + 2, 3, 1, 5).setValues([filas[i].slice(2, COLUMNAS_AUTORES_DETECTADAS)]);
    hechos++;
  }
  propiedades.setProperty('codigosPaises', JSON.stringify(codigos));
  const faltan = filas.filter(autorPendiente).length;
  const conPais = filas.filter((f) => codigoEnTexto(f[2])).length;
  marcarPaises(conPais + L(' de ', ' of ') + filas.length + L(' autores con país · ', ' authors with a country · ') + (faltan ? L('faltan ', 'left: ') + faltan : L('terminado', 'finished')));
  if (!faltan) ScriptApp.newTrigger('catalogoTrasPortadas').timeBased().after(60 * 1000).create();
  else if (hechos) ScriptApp.newTrigger('buscarPaises').timeBased().after((limitado ? 15 * 60 : 60) * 1000).create();
  else marcarPaises(conPais + L(' de ', ' of ') + filas.length + L(' autores con país · Wikidata no respondió; sigue la próxima noche', ' authors with a country · Wikidata did not answer; continues next night'));
}

function marcarPaises(texto) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  hoja.getRange('A7').setValue(L('Países: ', 'Countries: ') + texto);
  hoja.getRange('B7').setValue(new Date());
}

// ---------- nombres de archivo → obras · file names → works ----------

function normalizar(texto) {
  return texto.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// "\b" de JavaScript solo conoce letras ASCII; esta versión respeta acentos.
const LIMITE_PALABRA_FIN = '(?![\\p{L}\\p{N}_])';

function limpiarTitulo(t) {
  t = t.replace(/_ /g, ': ');
  t = t.trim().replace(/_$/, '.');
  t = t.replace(/_/g, ' ');
  t = t.replace(/\s*\([^)]*$/, ''); // paréntesis truncado por Anna's Archive
  t = t.replace(/\s*\((?:\d+\s*[aª]\s*ed[^)]*|spanish edition|ebook)\)/gi, '');
  t = t.replace(new RegExp('\\s+(?:edici[oó]n ilustrada|a novel|una novela)' + LIMITE_PALABRA_FIN + '[\\s\\S]*$', 'iu'), '');
  return quitarBordes(t.replace(/\s{2,}/g, ' '), ' -:');
}

function quitarBordes(t, chars) {
  let i = 0;
  let j = t.length;
  while (i < j && chars.includes(t[i])) i++;
  while (j > i && chars.includes(t[j - 1])) j--;
  return t.slice(i, j);
}

function separarAutores(texto, annas) {
  if (!texto || ['none', 'unknown'].includes(texto.toLowerCase())) return [];
  if (normalizar(texto) === 'aa vv') return ['VV. AA.'];
  texto = texto.replace(RUIDO_AUTOR, '');
  texto = texto.replace(/\b([A-Z])_/g, '$1.').replace(/_/g, ';');
  let autores = [];
  texto.split(/;|\s{2,}/).forEach((grupo) => {
    let piezas = grupo.split(',').map((p) => quitarBordes(p, ' ,'));
    piezas = piezas.filter((p) => quitarBordes(p, '.').length > 1);
    const nombresPila = piezas.filter((_, i) => i % 2 === 1);
    if (piezas.length && piezas.length % 2 === 0 && (annas || !piezas[0].includes(' ')) &&
        nombresPila.every((n) => palabras(n).length === 1 || quitarBordes(palabras(n).slice(-1)[0], '.').length === 1)) {
      piezas.filter((_, i) => i % 2 === 0).forEach((a, i) => autores.push(nombresPila[i] + ' ' + a));
    } else {
      autores = autores.concat(piezas);
    }
  });
  autores = autores.map((a) => a.replace(/^Edited by\s+/i, ''));
  const vistos = new Set();
  return autores.filter((a) => !vistos.has(normalizar(a)) && vistos.add(normalizar(a)));
}

const palabras = (s) => s.split(/\s+/).filter(Boolean);

function ultimoParentesis(texto) {
  if (!texto.endsWith(')')) return [texto, null];
  let nivel = 0;
  for (let i = texto.length - 1; i >= 0; i--) {
    nivel += texto[i] === ')' ? 1 : texto[i] === '(' ? -1 : 0;
    if (nivel === 0) return [texto.slice(0, i).trim(), texto.slice(i + 1, -1)];
  }
  return [texto, null];
}

function interpretar(nombre) {
  const punto = nombre.lastIndexOf('.');
  let base = punto >= 0 ? nombre.slice(0, punto) : nombre;
  if (!base) base = nombre;
  const datos = { titulo: null, autores: [], anio: null, isbn: null, patron: 'sin interpretar' };

  base = base.replace(/\s*\(\d{1,2}\)$/, '');
  if (!base.includes(' ') && base.includes('+')) {
    try { base = decodeURIComponent(base.replace(/\+/g, ' ')); } catch (e) { base = base.replace(/\+/g, ' '); }
  }
  base = base.replace(/^\d{6,}[-_ ]+/, '');
  if (!base.includes(' ') && (base.match(/-/g) || []).length >= 2) base = base.replace(/-/g, ' ');

  const partes = base.split(' -- ').map((p) => p.trim());
  if (partes.length >= 3 && ANNAS.test(partes[partes.length - 1])) {
    datos.patron = 'annas-archive';
    datos.titulo = limpiarTitulo(partes[0]);
    datos.autores = separarAutores(partes[1], true);
    const medio = partes.slice(2, -1).join(' -- ');
    let m = medio.match(/isbn13 (\d{13})/);
    if (m) datos.isbn = m[1];
    m = medio.match(/\b(1[5-9]\d\d|20[0-3]\d)\b/);
    if (m) datos.anio = Number(m[1]);
    return datos;
  }

  const sinZlib = base.replace(SUFIJO_ZLIB, '');
  if (sinZlib !== base) {
    const [titulo, autores] = ultimoParentesis(sinZlib);
    datos.patron = 'z-library';
    datos.titulo = limpiarTitulo(titulo);
    datos.autores = separarAutores(autores || '');
    return datos;
  }

  if (base.includes(' - ')) {
    const i = base.lastIndexOf(' - ');
    datos.patron = 'titulo-autor';
    datos.titulo = limpiarTitulo(base.slice(0, i));
    datos.autores = separarAutores(base.slice(i + 3));
    return datos;
  }

  const [titulo, autores] = ultimoParentesis(base);
  if (autores && titulo && !/\d|edici|edition|vol/i.test(autores)) {
    datos.patron = 'titulo-(autor)';
    datos.titulo = limpiarTitulo(titulo);
    datos.autores = separarAutores(autores);
    return datos;
  }

  datos.titulo = limpiarTitulo(base);
  return datos;
}

function descartable(r) {
  const n = r.nombre.toLowerCase();
  return n.startsWith('._') || BASURA_EXACTA.includes(n) || r.tamano === 0;
}

function agruparObras(registros) {
  const obras = new Map();
  registros.forEach((r) => {
    const ext = r.nombre.includes('.') ? r.nombre.slice(r.nombre.lastIndexOf('.') + 1).toLowerCase() : '';
    if (descartable(r) || !FORMATOS_LIBRO.includes(ext)) return;
    const d = interpretar(r.nombre);
    // La palabra más larga del primer autor: igual para "Austen Jane" y "Jane Austen"
    const pals = d.autores.length
      ? normalizar(d.autores[0]).split(' ').filter(Boolean).sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
      : [];
    const clave = normalizar(d.titulo || r.nombre) + '|' + (pals[0] || '');
    if (!obras.has(clave)) obras.set(clave, Object.assign({}, d, { colecciones: new Set(), archivos: [] }));
    const obra = obras.get(clave);
    obra.anio = obra.anio || d.anio;
    obra.isbn = obra.isbn || d.isbn;
    if (d.autores.length > obra.autores.length) obra.autores = d.autores;
    obra.colecciones.add(r.coleccion);
    // La subcarpeta de primer nivel también es colección ("Literatura/Poesía")
    const sub = (r.ruta || '').split('/')[1];
    if (sub) obra.colecciones.add(r.coleccion + '/' + sub);
    obra.archivos.push({ drive_id: r.id, formato: ext, tamano: r.tamano, ruta: r.ruta, nombre_original: r.nombre });
  });
  return [...obras.keys()].sort(compararCodigo).map((clave) => {
    const o = obras.get(clave);
    return {
      id: clave, titulo: o.titulo, autores: o.autores, anio: o.anio, isbn: o.isbn,
      colecciones: [...o.colecciones].sort(compararCodigo), patron_nombre: o.patron, archivos: o.archivos,
    };
  });
}

// Orden por puntos de código, como sorted() de Python
function compararCodigo(a, b) {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i].codePointAt(0) - y[i].codePointAt(0);
  }
  return x.length - y.length;
}

// ---------- datos de Open Library · Open Library metadata ----------

// difflib.SequenceMatcher(None, a, b).ratio() (sin "autojunk": los títulos son cortos)
function similitud(a, b) {
  if (!a.length && !b.length) return 1;
  function coincidencias(alo, ahi, blo, bhi) {
    let mejor = 0;
    let bi = alo;
    let bj = blo;
    let previo = new Map();
    for (let i = alo; i < ahi; i++) {
      const actual = new Map();
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue;
        const k = (previo.get(j - 1) || 0) + 1;
        actual.set(j, k);
        if (k > mejor) { mejor = k; bi = i - k + 1; bj = j - k + 1; }
      }
      previo = actual;
    }
    if (!mejor) return 0;
    return mejor + coincidencias(alo, bi, blo, bj) + coincidencias(bi + mejor, ahi, bj + mejor, bhi);
  }
  return (2 * coincidencias(0, a.length, 0, b.length)) / (a.length + b.length);
}

function parecido(a, b, prefijoCorto) {
  if (prefijoCorto === undefined) prefijoCorto = true;
  a = normalizar(a || '');
  b = normalizar(b || '');
  if (!a || !b) return 0;
  const corto = a.length <= b.length ? a : b;
  if ((a.startsWith(b) || b.startsWith(a)) && (prefijoCorto || palabras(corto).length >= 2)) {
    return Math.max(0.9, similitud(a, b));
  }
  return similitud(a, b);
}

function apellidos(autores) {
  const s = new Set();
  autores.forEach((a) => normalizar(a).split(' ').forEach((p) => { if (p.length > 2) s.add(p); }));
  return s;
}

function interseccion(a, b) {
  return [...a].filter((x) => b.has(x)).length;
}

function sinRepetidosOl(nombres) {
  const vistos = new Set();
  return nombres.filter((n) => {
    const clave = [...new Set(normalizar(n).split(' ').filter(Boolean))].sort().join(' ');
    return !vistos.has(clave) && vistos.add(clave);
  });
}

function evaluar(obra, doc, esPrimero) {
  let tituloOl = doc.title || '';
  if (doc.subtitle) tituloOl += ': ' + doc.subtitle;
  const suyos = apellidos(doc.author_name || []);
  const primero = apellidos(obra.autores.slice(0, 1));
  const autorOk = primero.size > 0 && interseccion(primero, suyos) >= Math.min(2, primero.size);
  const sim = Math.max(parecido(obra.titulo, tituloOl, autorOk), parecido(obra.titulo, doc.title, autorOk));

  if (autorOk && sim >= 0.75) return ['alta', sim + 1];
  if (autorOk && esPrimero) return ['media', sim + 0.5];
  if (!primero.size) {
    const pals = normalizar(obra.titulo).split(' ').filter(Boolean);
    if (suyos.size && interseccion(suyos, new Set(pals)) >= 2) {
      const resto = pals.filter((p) => !suyos.has(p)).join(' ');
      if (parecido(resto, doc.title) >= 0.8) return ['media', 0.9];
    }
    if (sim >= 0.9 && pals.length >= 3) return ['media', sim];
  }
  return [null, 0];
}

function buscarObra(obra, buscar) {
  const candidatos = [];
  if (obra.isbn) {
    (buscar({ isbn: obra.isbn }).docs || []).forEach((doc) => {
      if (parecido(obra.titulo, doc.title) >= 0.6) candidatos.push(['alta', 3, doc]);
    });
  }
  let autor = '';
  if (obra.autores.length) {
    const ps = normalizar(obra.autores[0]).split(' ').filter(Boolean);
    autor = ' ' + ps.reduce((m, p) => (p.length > m.length ? p : m), ps[0]);
  }
  const titulo = obra.titulo;
  const sinSub = titulo.split(':')[0];
  const intentos = [titulo, sinSub, palabras(sinSub).slice(0, 4).join(' ')].map((t) => t.trim()).filter(Boolean);
  for (const texto of [...new Set(intentos)]) {
    if (candidatos.length) break;
    (buscar({ q: texto + autor }).docs || []).forEach((doc, i) => {
      const [confianza, puntaje] = evaluar(obra, doc, i === 0);
      if (confianza) candidatos.push([confianza, puntaje, doc]);
    });
  }
  if (!candidatos.length) return [null, null];
  const mejor = candidatos.reduce((m, c) => (c[1] > m[1] ? c : m));
  return [mejor[0], mejor[2]];
}

function enriquecer(obra, buscar) {
  const [confianza, doc] = buscarObra(obra, buscar);
  const r = Object.assign({}, obra, { metadatos: { fuente: null, confianza: 'sin coincidencia' } });
  if (!doc) return r;
  const autoresOl = sinRepetidosOl(doc.author_name || []);
  return Object.assign(r, {
    titulo_ol: doc.title,
    autores: obra.autores.length && confianza !== 'alta' ? obra.autores : (autoresOl.slice(0, 4).length ? autoresOl.slice(0, 4) : obra.autores),
    anio_primera_publicacion: doc.first_publish_year,
    idiomas: (doc.language || []).slice(0, 6),
    temas: (doc.subject || []).filter((t) => t.length < 40).slice(0, 8),
    portada: doc.cover_i ? OL_PORTADA.replace('{}', doc.cover_i) : null,
    metadatos: { fuente: 'openlibrary.org' + doc.key, confianza: confianza },
  });
}

// ---------- formato del catálogo · catalog format (docs/es/formato-catalogo.md) ----------

const sinAcentos = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

function nombreColeccion(nombre, nombres) {
  if (nombre.includes('/')) {
    const [padre, hija] = nombre.split('/');
    return nombreColeccion(padre, nombres) + '/' + hija.replace(/^\d+\s+/, '').trim();
  }
  if (nombre === '(raíz)') return sinClasificar();
  const limpio = nombre.replace(/^\d+\s+/, '').trim();
  const clave = sinAcentos(limpio).toLowerCase();
  if (!nombres.has(clave)) nombres.set(clave, limpio);
  return nombres.get(clave);
}

function sinClasificar() {
  return L('Sin clasificar', 'Unsorted');
}

function pobre(t) {
  const pals = t.match(/\p{L}{3,}/gu) || [];
  return pals.length === 0 || /\d{5,}/.test(t) || (pals.length === 1 && t === t.toLowerCase());
}

const capitalizar = (n) =>
  n === n.toUpperCase() && /\p{Lu}{3}/u.test(n)
    ? n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m) => m.toUpperCase())
    : n;

function sinRepetidos(nombres) {
  const vistos = new Set();
  return (nombres || []).map(capitalizar).filter((n) => {
    const clave = sinAcentos(n).toLowerCase().split(/\s+/).sort().join(' ');
    return !vistos.has(clave) && vistos.add(clave);
  });
}

// Los nombres subidos desde macOS llegan con acentos descompuestos (NFD).
const nfc = (v) => (typeof v === 'string' ? v.normalize('NFC') : Array.isArray(v) ? v.map(nfc) : v);

function aSalida(o, nombres) {
  const colecciones = [...new Set(o.colecciones.map((c) => nombreColeccion(c.normalize('NFC'), nombres)))];
  const c = colecciones.length > 1 ? colecciones.filter((x) => x !== sinClasificar()) : colecciones;
  const titulo = nfc(o.titulo);
  const tituloOl = nfc(o.titulo_ol);
  const usarOl = tituloOl && pobre(titulo) && !pobre(tituloOl);
  const t = usarOl ? tituloOl : titulo;
  const otro = usarOl ? titulo : tituloOl;
  const salida = {
    id: o.id,
    t: t,
    z: pobre(t) || undefined,
    to: otro && otro !== t ? otro : undefined,
    a: sinRepetidos(nfc(o.autores)),
    y: o.anio_primera_publicacion || o.anio || undefined,
    c: c,
    p: o.portada || undefined,
    tm: o.temas && o.temas.length ? nfc(o.temas) : undefined,
    l: o.idiomas && o.idiomas.length ? o.idiomas : undefined,
    m: o.metadatos && o.metadatos.confianza,
    src: (o.metadatos && o.metadatos.fuente) || undefined,
    f: o.archivos.map((a) => ({ id: a.drive_id, x: a.formato, s: a.tamano, r: a.ruta.normalize('NFC') })),
  };
  return JSON.parse(JSON.stringify(salida)); // quita los campos undefined, como JSON.stringify en Node
}

// ---------- reorganización de carpetas ----------
//
// 1. `planearReorganizacion` escribe la pestaña "Reorganización": una fila por
//    archivo que cambiaría de carpeta, con el destino propuesto (columna D,
//    editable). No mueve nada.
// 2. Revisa y corrige destinos en la hoja.
// 3. `aplicarReorganizacion` mueve cada archivo a su destino (crea las
//    carpetas que falten). Las copias idénticas van a "_Duplicados" para
//    revisarlas antes de mandarlas a la papelera. Si se corta por tiempo, se
//    reprograma sola cada minuto hasta terminar.
// Mover no cambia el ID de los archivos: la biblioteca, el avance de lectura y
// las correcciones siguen funcionando. El mapa de carpetas (MAPA_CARPETAS),
// CARPETA_DUPLICADOS y POR_CLASIFICAR están en config.gs.

const N_REORGANIZACION = 7;
function columnasReorganizacion() {
  return L(['ID (no editar)', 'Archivo', 'Carpeta actual', 'Destino (editable)', 'Motivo', 'Obra', 'Estado'],
    ['ID (do not edit)', 'File', 'Current folder', 'Destination (editable)', 'Reason', 'Work', 'Status']);
}

function claveCarpeta(nombre) {
  // "02 Poesía" → "poesia"
  return nombre.replace(/^\d+\s+/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// El segmento conocido más profundo decide el destino; lo que cuelga de él se conserva.
function destinoDe(ruta) {
  const segs = ruta ? ruta.normalize('NFC').split('/') : [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const destino = MAPA_CARPETAS[claveCarpeta(segs[i])];
    if (destino) return [destino].concat(segs.slice(i + 1)).join('/');
  }
  return segs.length ? segs.join('/') : POR_CLASIFICAR;
}

// 0: carpeta temática, 1: carpeta numerada, 2: suelto en la raíz
function rangoRuta(ruta) {
  if (!ruta) return 2;
  return /^\d+\s/.test(ruta) ? 1 : 0;
}

// Una fila por archivo que cambia de lugar: [id, archivo, actual, destino, motivo, obra]
function planReorganizacion(registros) {
  const filas = [];
  agruparObras(registros).forEach((obra) => {
    const archivos = obra.archivos.slice().sort((a, b) =>
      rangoRuta(a.ruta) - rangoRuta(b.ruta) || compararCodigo(a.ruta, b.ruta));
    const destino = destinoDe(archivos[0].ruta);
    const vistos = new Set();
    archivos.forEach((a) => {
      const clave = a.formato + '|' + a.tamano;
      const duplicado = vistos.has(clave);
      vistos.add(clave);
      const final = duplicado ? CARPETA_DUPLICADOS : destino;
      const actual = (a.ruta || '').normalize('NFC');
      if (final === actual) return;
      const motivo = duplicado ? L('copia idéntica (mismo formato y tamaño)', 'identical copy (same format and size)')
        : !a.ruta ? (destino === POR_CLASIFICAR ? L('suelto en la raíz: elige carpeta', 'loose in the root: choose a folder') : L('suelto en la raíz', 'loose in the root'))
        : L('unificar carpetas', 'unify folders');
      filas.push([a.drive_id, a.nombre_original.normalize('NFC'), actual || '(raíz)', final, motivo, (obra.titulo || '').normalize('NFC')]);
    });
  });
  return filas.sort((a, b) => compararCodigo(a[3], b[3]) || compararCodigo(a[5], b[5]));
}

function planearReorganizacion() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('reorganizacion')) || ss.insertSheet(nombreHoja('reorganizacion'));
  hoja.clear();
  const filas = planReorganizacion(recorrerDrive(ROOT_ID)).map((f) => f.concat(['']));
  hoja.getRange(1, 1, 1, N_REORGANIZACION).setValues([columnasReorganizacion()]).setFontWeight('bold');
  if (filas.length) hoja.getRange(2, 1, filas.length, N_REORGANIZACION).setValues(filas);
  hoja.setFrozenRows(1);
  hoja.getRange('D1').setBackground('#fbe9c8');
  hoja.getRange(1, 1, filas.length + 1, N_REORGANIZACION).createFilter();
  const duplicados = filas.filter((f) => f[3] === CARPETA_DUPLICADOS).length;
  const sinCarpeta = filas.filter((f) => f[3] === POR_CLASIFICAR).length;
  marcarReorganizacion(L('plan listo: ', 'plan ready: ') + filas.length + L(' archivos por mover · ', ' files to move · ') + duplicados + L(' a ', ' to ') + CARPETA_DUPLICADOS +
    ' · ' + sinCarpeta + L(' por clasificar', ' to sort'));
}

function aplicarReorganizacion() {
  const inicio = Date.now();
  const hoja = SpreadsheetApp.openById(SHEET_ID).getSheetByName(nombreHoja('reorganizacion'));
  if (!hoja) throw new Error(L('Primero ejecuta planearReorganizacion.', 'Run planearReorganizacion first.'));
  const datos = hoja.getRange(2, 1, Math.max(hoja.getLastRow() - 1, 1), N_REORGANIZACION).getValues();
  const raiz = DriveApp.getFolderById(ROOT_ID);
  const carpetas = new Map();
  const carpeta = (ruta) => {
    if (!carpetas.has(ruta)) {
      let actual = raiz;
      ruta.split('/').forEach((nombre) => {
        // La búsqueda por nombre no distingue mayúsculas: "Poesía Mexicana" y
        // "Poesía mexicana" son carpetas distintas, así que se compara exacto.
        const it = actual.getFoldersByName(nombre);
        let encontrada = null;
        while (!encontrada && it.hasNext()) {
          const c = it.next();
          if (c.getName().normalize('NFC') === nombre.normalize('NFC')) encontrada = c;
        }
        actual = encontrada || actual.createFolder(nombre);
      });
      carpetas.set(ruta, actual);
    }
    return carpetas.get(ruta);
  };
  const estados = datos.map((f) => [f[6]]);
  let movidos = 0;
  let pendientes = 0;
  datos.forEach((f, i) => {
    const [id, , , destino, , , estado] = f;
    if (!id || estado === 'movido' || !String(destino).trim()) return;
    if (Date.now() - inicio > LIMITE_CATALOGO_MS) { pendientes++; return; }
    try {
      DriveApp.getFileById(String(id)).moveTo(carpeta(String(destino).trim()));
      estados[i][0] = 'movido';
      movidos++;
    } catch (e) {
      estados[i][0] = 'error: ' + e.message;
    }
  });
  hoja.getRange(2, 7, estados.length, 1).setValues(estados);
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'aplicarReorganizacion')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  if (pendientes) {
    ScriptApp.newTrigger('aplicarReorganizacion').timeBased().after(60 * 1000).create();
    marcarReorganizacion(L('en curso: ', 'in progress: ') + movidos + L(' movidos en esta vuelta, ', ' moved in this round, ') + pendientes + L(' pendientes (sigue sola en un minuto)', ' left (continues by itself in a minute)'));
  } else {
    const errores = estados.filter((e) => String(e[0]).startsWith('error')).length;
    marcarReorganizacion(L('terminada', 'finished') + (errores ? ' · ' + errores + L(' con error (ver columna Estado)', ' with errors (see Status column)') : ''));
  }
}

function marcarReorganizacion(texto) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  hoja.getRange('A3').setValue(L('Reorganización: ', 'Reorganization: ') + texto);
  hoja.getRange('B3').setValue(new Date());
}

// ---------- limpieza después de la reorganización ----------

// Manda a la papelera las carpetas que quedaron vacías (sin archivos ni
// subcarpetas con contenido). Se recuperan desde la papelera durante 30 días.
function limpiarCarpetasVacias() {
  let quitadas = 0;
  const errores = [];
  // Devuelve si la carpeta quedó vacía después de limpiar sus subcarpetas
  const limpiar = (carpeta, esRaiz) => {
    let vacia = !carpeta.getFiles().hasNext();
    const subs = carpeta.getFolders();
    while (subs.hasNext()) {
      if (!limpiar(subs.next(), false)) vacia = false;
    }
    if (!vacia || esRaiz) return vacia;
    try {
      carpeta.setTrashed(true);
      quitadas++;
      return true;
    } catch (e) {
      errores.push(carpeta.getName());
      return false;
    }
  };
  limpiar(DriveApp.getFolderById(ROOT_ID), true);
  marcarReorganizacion(L('carpetas vacías a la papelera: ', 'empty folders to trash: ') + quitadas + (errores.length ? L(' · no se pudieron quitar: ', ' · could not remove: ') + errores.join(', ') : ''));
}

// Manda a la papelera todo lo que hay en _Duplicados. Ejecutar solo después
// de revisar esa carpeta. Se recupera desde la papelera durante 30 días.
function duplicadosAPapelera() {
  const it = DriveApp.getFolderById(ROOT_ID).getFoldersByName(CARPETA_DUPLICADOS);
  if (!it.hasNext()) throw new Error(L('No existe la carpeta ', 'Folder not found: ') + CARPETA_DUPLICADOS + '.');
  const carpeta = it.next();
  let n = 0;
  let ajenos = 0;
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    // Solo quien es dueño de un archivo puede mandarlo a la papelera
    try { archivos.next().setTrashed(true); n++; } catch (e) { ajenos++; }
  }
  if (!ajenos) carpeta.setTrashed(true);
  marcarReorganizacion(n + L(' duplicados a la papelera (se recuperan durante 30 días)', ' duplicates to trash (recoverable for 30 days)') +
    (ajenos ? ' · ' + ajenos + L(' son de otra cuenta y solo quien es dueño puede borrarlos', ' belong to another account and only their owner can delete them') : ''));
}

// ---------- portadas sacadas de los propios archivos ----------
//
// `portadasDesdeArchivos` busca las obras sin portada de todas las categorías, saca
// la imagen del archivo (la primera página de un PDF, con la miniatura que genera
// Drive; la portada que trae dentro un EPUB), la guarda en la carpeta Portadas y
// pega su vínculo en la columna J. La imagen conserva sus proporciones. Nunca toca
// una fila que ya tenga algo en J: "ninguna" se respeta y borrar la celda deshace
// el cambio. El resultado queda en la hoja "Estado", fila 4. Si se acaba el tiempo
// se reprograma sola cada minuto y al final actualiza el catálogo: basta con
// ejecutarla una vez.
//
// `forzarPortadas` hace lo mismo pero también reemplaza las portadas que el
// catálogo encontró solo (Open Library). Sigue sin tocar una fila con algo en J,
// y si el archivo no da imagen la obra conserva la que tenía.
//
// Para limitar el barrido a unas colecciones, usa COLECCIONES_PORTADAS y
// COLECCIONES_FORZADAS en config.gs. CARPETA_PORTADAS_ID también está ahí.

const COLUMNA_PORTADA = 10; // J
const LADO_PORTADA = 800; // píxeles del lado mayor
const MINIMO_PORTADA = 3000; // bytes: menos que esto no es una portada de verdad
const MINIMO_PAGINA = 15000; // bytes: una página de 800 px que pesa menos está casi en blanco
const MAXIMO_DESCARGA = 50 * 1000 * 1000; // límite de UrlFetchApp
const LIMITE_PORTADAS_MS = 4 * 60 * 1000;

// Lista de { obra, fila } por resolver; `fila` es el número de fila en la hoja.
// Con `forzar`, cuenta también las que solo tienen la portada automática.
function obrasSinPortada(catalogo, filas, colecciones, forzar) {
  const filaDe = new Map();
  filas.forEach((f, i) => filaDe.set(String(f[0]), { numero: i + 2, portada: String(f[COLUMNA_PORTADA - 1] || '').trim() }));
  const pendientes = [];
  catalogo.forEach((obra) => {
    if ((obra.p && !forzar) || obra.h || !obra.f || !obra.f.length) return;
    if (colecciones && !(obra.c || []).some((c) => colecciones.includes(c.split('/')[0]))) return;
    const fila = filaDe.get(obra.id);
    if (fila && !fila.portada) pendientes.push({ obra: obra, fila: fila.numero });
  });
  return pendientes;
}

const atributos = (etiqueta) => {
  const r = {};
  etiqueta.replace(/([\w:-]+)\s*=\s*["']([^"']*)["']/g, (_, k, v) => { r[k] = v; return ''; });
  return r;
};

// Ruta dentro del EPUB de su imagen de portada, o null. Sigue el orden del
// estándar: EPUB 3 (properties), EPUB 2 (meta cover) y, si no, el nombre.
function rutaPortadaEpub(opf, rutaOpf) {
  const items = (opf.match(/<(?:\w+:)?item\b[^>]*>/g) || []).map(atributos);
  const esImagen = (i) => /^image\//.test(i['media-type'] || '');
  const meta = (opf.match(/<(?:\w+:)?meta\b[^>]*>/g) || []).map(atributos).find((m) => m.name === 'cover');
  const item = items.find((i) => esImagen(i) && /\bcover-image\b/.test(i.properties || '')) ||
    (meta && items.find((i) => i.id === meta.content && esImagen(i))) ||
    items.find((i) => esImagen(i) && /cover|portada/i.test((i.href || '') + ' ' + (i.id || '')));
  if (!item || !item.href) return null;
  const base = rutaOpf.includes('/') ? rutaOpf.slice(0, rutaOpf.lastIndexOf('/') + 1) : '';
  const partes = [];
  (base + decodeURI(item.href)).split('/').forEach((p) => {
    if (p === '..') partes.pop();
    else if (p && p !== '.') partes.push(p);
  });
  return partes.join('/');
}

function portadaDeEpub(id, token) {
  const r = UrlFetchApp.fetch(DRIVE_API + '/' + id + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
  const entradas = new Map();
  Utilities.unzip(r.getBlob().setContentType('application/zip')).forEach((b) => entradas.set(b.getName(), b));
  const contenedor = entradas.get('META-INF/container.xml');
  if (!contenedor) return null;
  const rutaOpf = (contenedor.getDataAsString('UTF-8').match(/full-path\s*=\s*["']([^"']+)["']/) || [])[1];
  if (!rutaOpf || !entradas.has(rutaOpf)) return null;
  const ruta = rutaPortadaEpub(entradas.get(rutaOpf).getDataAsString('UTF-8'), rutaOpf);
  return (ruta && entradas.get(ruta)) || null;
}

// Drive genera la miniatura de los PDF; se pide más grande que la de 220 px que da por defecto.
function miniaturaDeDrive(id, token) {
  const encabezado = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  const datos = JSON.parse(UrlFetchApp.fetch(DRIVE_API + '/' + id + '?fields=thumbnailLink&supportsAllDrives=true', encabezado).getContentText());
  if (!datos.thumbnailLink) return null;
  const r = UrlFetchApp.fetch(datos.thumbnailLink.replace(/=s\d+$/, '') + '=s' + LADO_PORTADA, encabezado);
  return r.getResponseCode() === 200 ? r.getBlob() : null;
}

// De un MOBI o AZW3, la primera foto vertical: las ilustraciones suelen ser apaisadas
function portadaDeMobi(id, tamano, token) {
  const r = UrlFetchApp.fetch(DRIVE_API + '/' + id + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
  const bytes = r.getContent();
  const j = jpegsEn(bytes, 0).hallados.find((x) => x.alto > x.ancho && x.ancho >= LADO_MINIMO);
  return j ? Utilities.newBlob(Array.from(bytes.slice(j.inicio, j.fin)), 'image/jpeg') : null;
}

// El PDF primero (Drive da su primera página); si no hay, lo que traiga el libro.
// Devuelve { imagen } o { motivo }. Drive solo da la miniatura de la primera
// página: si está en blanco se avisa en vez de usarla.
function imagenDeObra(obra, token) {
  const rango = (a) => (a.x === 'pdf' ? 0 : a.x === 'epub' ? 1 : 2);
  const orden = obra.f.slice().sort((a, b) => rango(a) - rango(b));
  let motivo = 'sin imagen';
  for (const archivo of orden) {
    if (archivo.x === 'epub' && archivo.s <= MAXIMO_DESCARGA) {
      try {
        const interna = portadaDeEpub(archivo.id, token);
        if (interna && interna.getBytes().length >= MINIMO_PORTADA) return { imagen: interna };
      } catch (e) { // un EPUB dañado todavía puede tener miniatura
        motivo = 'sin imagen';
      }
    }
    if (['mobi', 'azw3', 'azw'].includes(archivo.x) && archivo.s <= MAXIMO_DESCARGA) {
      try {
        const interna = portadaDeMobi(archivo.id, archivo.s, token);
        if (interna) return { imagen: interna };
      } catch (e) {
        motivo = 'sin imagen';
      }
    }
    const miniatura = miniaturaDeDrive(archivo.id, token);
    if (miniatura && miniatura.getBytes().length >= MINIMO_PAGINA) return { imagen: miniatura };
    if (miniatura) motivo = 'en blanco';
  }
  return { motivo: motivo };
}

function forzarPortadas() {
  portadasDesdeArchivos(undefined, true);
}

// `e` solo existe cuando la ejecuta el reprogramado: una ejecución a mano empieza de cero.
function portadasDesdeArchivos(e, forzar) {
  const inicio = Date.now();
  ScriptApp.getProjectTriggers()
    .filter((t) => ['portadasDesdeArchivos', 'catalogoTrasPortadas'].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const estado = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  // Lo ya intentado se guarda en Estado!C4 para no repetirlo en cada vuelta
  const previo = e ? JSON.parse(estado.getRange('C4').getValue() || '{}') : {};
  const avance = { listas: previo.listas || 0, enBlanco: previo.enBlanco || {}, sinImagen: previo.sinImagen || {}, forzar: e ? previo.forzar : forzar };
  const hoja = hojaCorrecciones();
  const filas = hoja.getDataRange().getValues().slice(1);
  const catalogo = JSON.parse(DriveApp.getFolderById(ROOT_ID).getFilesByName(NOMBRE_CATALOGO).next().getBlob().getDataAsString('UTF-8'));
  const pendientes = obrasSinPortada(catalogo, filas, avance.forzar ? COLECCIONES_FORZADAS : COLECCIONES_PORTADAS, avance.forzar)
    .filter(({ obra }) => !avance.enBlanco[obra.id] && !avance.sinImagen[obra.id]);
  const carpeta = DriveApp.getFolderById(CARPETA_PORTADAS_ID);
  const token = ScriptApp.getOAuthToken();
  let faltan = 0;
  pendientes.forEach(({ obra, fila }) => {
    if (Date.now() - inicio > LIMITE_PORTADAS_MS) { faltan++; return; }
    try {
      const { imagen, motivo } = imagenDeObra(obra, token);
      if (!imagen) { (motivo === 'en blanco' ? avance.enBlanco : avance.sinImagen)[obra.id] = obra.t; return; }
      const extension = (imagen.getContentType().split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const archivo = carpeta.createFile(imagen.setName(obra.t.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 100) + '.' + extension));
      hoja.getRange(fila, COLUMNA_PORTADA).setValue('https://drive.google.com/file/d/' + archivo.getId() + '/view');
      avance.listas++;
    } catch (error) {
      avance.sinImagen[obra.id] = obra.t + ' (' + error.message + ')';
    }
  });
  estado.getRange('C4').setValue(JSON.stringify(avance));
  const lista = (m) => Object.keys(m).map((id) => m[id]).join(', ');
  marcarPortadas(avance.listas + L(' listas', ' ready') +
    (faltan ? L(' · faltan ', ' · left: ') + faltan + L(' (sigue sola en un minuto)', ' (continues by itself in a minute)') : L(' · terminado', ' · finished')) +
    (Object.keys(avance.enBlanco).length ? L(' · primera página en blanco: ', ' · blank first page: ') + lista(avance.enBlanco) : '') +
    (Object.keys(avance.sinImagen).length ? L(' · sin imagen: ', ' · no image: ') + lista(avance.sinImagen) : ''));
  ScriptApp.newTrigger(faltan ? 'portadasDesdeArchivos' : 'catalogoTrasPortadas').timeBased().after(60 * 1000).create();
}

function catalogoTrasPortadas() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'catalogoTrasPortadas')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  actualizarCatalogo();
}

function marcarPortadas(texto) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  hoja.getRange('A4').setValue(L('Portadas: ', 'Covers: ') + texto);
  hoja.getRange('B4').setValue(new Date());
}

// ---------- candidatas de portada para archivos grandes ----------
//
// Drive no da miniatura de los archivos muy grandes ni de los MOBI, y Apps
// Script no puede descargar más de 50 MB de golpe. `candidatasPortadas` lee por
// rangos: de un EPUB, solo el índice del zip y las imágenes del inicio; de un PDF
// o MOBI, los primeros megabytes, de donde saca las fotos JPEG. Las guarda en
// Portadas/_Candidatas para elegir a mano. No toca la hoja ni el catálogo. Si se
// acaba el tiempo se reprograma sola y salta lo que ya está. El resultado queda en
// "Estado", fila 5. La lista de archivos (OBRAS_CANDIDATAS) está en config.gs.

const CARPETA_CANDIDATAS = '_Candidatas';
const CANDIDATAS_POR_OBRA = 6;
const TROZO_BYTES = 12 * 1000 * 1000;
const TROZOS_MAXIMOS = 4; // las primeras páginas están en los primeros ~48 MB
const LADO_MINIMO = 400; // píxeles: lo más chico son adornos, no portadas
const PESO_MINIMO = 30000;
const PESO_MINIMO_EPUB = 8000; // en un EPUB ligero la portada también lo es

// JPEG completos en `bytes` desde `desde`: [{ inicio, fin, ancho, alto }], y dónde
// continuar en el siguiente trozo si el último quedó cortado.
function jpegsEn(bytes, desde) {
  const b = (i) => bytes[i] & 0xff;
  const hallados = [];
  let i = desde || 0;
  const n = bytes.length;
  while (i + 3 < n) {
    if (b(i) !== 0xff || b(i + 1) !== 0xd8 || b(i + 2) !== 0xff) { i++; continue; }
    let j = i + 2;
    let ancho = 0;
    let alto = 0;
    let componentes = 0;
    let fin = -1;
    let valido = true;
    while (j + 3 < n) {
      if (b(j) !== 0xff) { valido = false; break; }
      const marca = b(j + 1);
      if (marca === 0xff) { j++; continue; }
      if (marca === 0x01 || (marca >= 0xd0 && marca <= 0xd9)) { j += 2; continue; }
      const largo = (b(j + 2) << 8) | b(j + 3);
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca) && j + 8 < n) {
        alto = (b(j + 5) << 8) | b(j + 6);
        ancho = (b(j + 7) << 8) | b(j + 8);
        componentes = b(j + 9);
      }
      j += 2 + largo;
      if (marca === 0xda) {
        for (let k = j; k + 1 < n; k++) {
          if (b(k) === 0xff && b(k + 1) === 0xd9) { fin = k + 2; break; }
        }
        break;
      }
    }
    if (!valido) { i++; continue; }
    if (fin < 0) return { hallados: hallados, seguir: i }; // cortado: sigue en el próximo trozo
    hallados.push({ inicio: i, fin: fin, ancho: ancho, alto: alto, componentes: componentes });
    i = fin;
  }
  return { hallados: hallados, seguir: n };
}

const entero = (bytes, i, largo) => {
  let v = 0;
  for (let k = largo - 1; k >= 0; k--) v = v * 256 + (bytes[i + k] & 0xff);
  return v;
};

// Índice de un zip: `leer(desde, hasta)` devuelve esos bytes del archivo.
function indiceZip(leer, tamano) {
  const inicioCola = Math.max(0, tamano - 70000);
  const cola = leer(inicioCola, tamano - 1);
  let eocd = -1;
  for (let i = cola.length - 22; i >= 0; i--) {
    if (entero(cola, i, 4) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no es un zip legible');
  const largo = entero(cola, eocd + 12, 4);
  const inicio = entero(cola, eocd + 16, 4);
  const datos = inicio >= inicioCola ? cola.slice(inicio - inicioCola, inicio - inicioCola + largo) : leer(inicio, inicio + largo - 1);
  const entradas = new Map();
  let p = 0;
  while (p + 46 <= datos.length && entero(datos, p, 4) === 0x02014b50) {
    const nl = entero(datos, p + 28, 2);
    const nombre = Utilities.newBlob(datos.slice(p + 46, p + 46 + nl).map(conSigno)).getDataAsString('UTF-8');
    entradas.set(nombre, {
      nombre: nombre, metodo: entero(datos, p + 10, 2), crc: datos.slice(p + 16, p + 20),
      comprimido: entero(datos, p + 20, 4), original: entero(datos, p + 24, 4), local: entero(datos, p + 42, 4),
    });
    p += 46 + nl + entero(datos, p + 30, 2) + entero(datos, p + 32, 2);
  }
  return entradas;
}

const conSigno = (v) => { const x = v & 0xff; return x > 127 ? x - 256 : x; };
const numero = (v, largo) => {
  const r = [];
  for (let k = 0; k < largo; k++) r.push(Math.floor(v / Math.pow(256, k)) % 256);
  return r;
};

// Un zip con una sola entrada, para que Utilities.unzip descomprima los datos
function zipDeUna(e, datos) {
  const nombre = [...Array.from(Utilities.newBlob(e.nombre).getBytes())];
  const comun = [].concat(numero(20, 2), numero(0, 2), numero(e.metodo, 2), numero(0, 4), Array.from(e.crc),
    numero(e.comprimido, 4), numero(e.original, 4), numero(nombre.length, 2), numero(0, 2));
  const local = [].concat(numero(0x04034b50, 4), comun, nombre);
  const central = [].concat(numero(0x02014b50, 4), numero(20, 2), comun, numero(0, 2), numero(0, 2), numero(0, 2),
    numero(0, 4), numero(0, 4), nombre);
  const fin = [].concat(numero(0x06054b50, 4), numero(0, 4), numero(1, 2), numero(1, 2),
    numero(central.length, 4), numero(local.length + datos.length, 4), numero(0, 2));
  return local.concat(Array.from(datos), central, fin).map(conSigno);
}

function leerEntrada(leer, e) {
  const cabeza = leer(e.local, e.local + 29);
  const inicio = e.local + 30 + entero(cabeza, 26, 2) + entero(cabeza, 28, 2);
  const datos = e.comprimido ? leer(inicio, inicio + e.comprimido - 1) : [];
  if (e.metodo === 0) return Utilities.newBlob(Array.from(datos).map(conSigno));
  return Utilities.unzip(Utilities.newBlob(zipDeUna(e, datos), 'application/zip'))[0];
}

// Rutas de imagen del EPUB: la portada declarada y luego las del inicio del libro
function imagenesDeEpub(opf, rutaOpf) {
  const items = (opf.match(/<(?:\w+:)?item\b[^>]*>/g) || []).map(atributos);
  const base = rutaOpf.includes('/') ? rutaOpf.slice(0, rutaOpf.lastIndexOf('/') + 1) : '';
  const ruta = (href) => {
    const partes = [];
    (base + decodeURI(href)).split('/').forEach((p) => {
      if (p === '..') partes.pop();
      else if (p && p !== '.') partes.push(p);
    });
    return partes.join('/');
  };
  const portada = rutaPortadaEpub(opf, rutaOpf);
  const resto = items.filter((i) => /^image\/(jpeg|png)/.test(i['media-type'] || '') && i.href).map((i) => ruta(i.href));
  return [...new Set((portada ? [portada] : []).concat(resto))];
}

function candidatasDeEpub(id, tamano, leer) {
  const indice = indiceZip(leer, tamano);
  const contenedor = indice.get('META-INF/container.xml');
  if (!contenedor) return [];
  const texto = (e) => leerEntrada(leer, e).getDataAsString('UTF-8');
  const rutaOpf = (texto(contenedor).match(/full-path\s*=\s*["']([^"']+)["']/) || [])[1];
  if (!rutaOpf || !indice.has(rutaOpf)) return [];
  const imagenes = [];
  for (const ruta of imagenesDeEpub(texto(indice.get(rutaOpf)), rutaOpf)) {
    if (imagenes.length >= CANDIDATAS_POR_OBRA) break;
    const e = indice.get(ruta);
    if (!e || e.original < PESO_MINIMO_EPUB || e.comprimido > MAXIMO_DESCARGA) continue;
    imagenes.push(leerEntrada(leer, e).setContentType(/\.png$/i.test(ruta) ? 'image/png' : 'image/jpeg'));
  }
  return imagenes;
}

// La portada de un FB2 va en base64 dentro del XML: <coverpage> dice cuál imagen usar
function imagenesDeFb2(texto) {
  const binarios = [];
  texto.replace(/<binary\b([^>]*)>([\s\S]*?)<\/binary>/g, (_, attrs, datos) => {
    const a = atributos(attrs);
    if (/^image\/(jpeg|png)/.test(a['content-type'] || '')) binarios.push({ id: a.id, tipo: a['content-type'], base64: datos.replace(/\s+/g, '') });
    return '';
  });
  const portada = ((texto.match(/<coverpage>[\s\S]*?href\s*=\s*["']#([^"']+)["']/) || [])[1]);
  return binarios.sort((x, y) => (x.id === portada ? -1 : y.id === portada ? 1 : 0)).slice(0, CANDIDATAS_POR_OBRA);
}

function candidatasDeBytes(tamano, leer) {
  const imagenes = [];
  let desde = 0;
  for (let t = 0; t < TROZOS_MAXIMOS && desde < tamano && imagenes.length < CANDIDATAS_POR_OBRA; t++) {
    const bytes = leer(desde, Math.min(desde + TROZO_BYTES, tamano) - 1);
    const { hallados, seguir } = jpegsEn(bytes, 0);
    hallados.forEach((j) => {
      if (imagenes.length >= CANDIDATAS_POR_OBRA) return;
      if (Math.min(j.ancho, j.alto) < LADO_MINIMO || j.fin - j.inicio < PESO_MINIMO) return;
      imagenes.push(Utilities.newBlob(Array.from(bytes.slice(j.inicio, j.fin)), 'image/jpeg'));
    });
    if (seguir === 0) break; // una sola imagen más grande que el trozo
    desde += seguir;
  }
  return imagenes;
}

// `e` solo existe cuando la ejecuta el reprogramado: a mano empieza de cero.
function candidatasPortadas(e) {
  const inicio = Date.now();
  const token = ScriptApp.getOAuthToken();
  const portadas = DriveApp.getFolderById(CARPETA_PORTADAS_ID);
  const it = portadas.getFoldersByName(CARPETA_CANDIDATAS);
  const carpeta = it.hasNext() ? it.next() : portadas.createFolder(CARPETA_CANDIDATAS);
  const encabezado = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'candidatasPortadas')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  // Lo ya intentado queda en Estado!C5: una obra sin imágenes no se repite
  const hechas = e ? JSON.parse(hoja.getRange('C5').getValue() || '{}') : {};
  let pendientes = 0;
  OBRAS_CANDIDATAS.forEach(([titulo, id, formato]) => {
    if (hechas[titulo] !== undefined) return;
    if (carpeta.getFilesByName(titulo + ' 1.jpg').hasNext() || carpeta.getFilesByName(titulo + ' 1.png').hasNext()) {
      hechas[titulo] = 'ya estaba';
      return;
    }
    if (Date.now() - inicio > LIMITE_CATALOGO_MS) { pendientes++; return; }
    try {
      const datos = JSON.parse(UrlFetchApp.fetch(DRIVE_API + '/' + id + '?fields=size&supportsAllDrives=true', encabezado).getContentText());
      const tamano = Number(datos.size);
      const leer = (desde, hasta) => {
        const r = UrlFetchApp.fetch(DRIVE_API + '/' + id + '?alt=media&supportsAllDrives=true', {
          headers: { Authorization: 'Bearer ' + token, Range: 'bytes=' + desde + '-' + hasta }, muteHttpExceptions: true,
        });
        if (r.getResponseCode() >= 300) throw new Error(L('Drive respondió ', 'Drive answered ') + r.getResponseCode());
        return r.getContent();
      };
      let imagenes = formato === 'epub' ? candidatasDeEpub(id, tamano, leer)
        : formato === 'fb2' ? imagenesDeFb2(Utilities.newBlob(leer(0, tamano - 1)).getDataAsString('UTF-8'))
          .map((b) => Utilities.newBlob(Utilities.base64Decode(b.base64), b.tipo))
        : candidatasDeBytes(tamano, leer);
      if (!imagenes.length) {
        const miniatura = miniaturaDeDrive(id, token);
        if (miniatura) imagenes = [miniatura];
      }
      imagenes.forEach((imagen, i) => {
        const extension = imagen.getContentType() === 'image/png' ? 'png' : 'jpg';
        carpeta.createFile(imagen.setName(titulo + ' ' + (i + 1) + '.' + extension));
      });
      hechas[titulo] = imagenes.length;
    } catch (error) {
      hechas[titulo] = 'error ' + error.message;
    }
    hoja.getRange('C5').setValue(JSON.stringify(hechas));
  });
  hoja.getRange('C5').setValue(JSON.stringify(hechas));
  if (pendientes) ScriptApp.newTrigger('candidatasPortadas').timeBased().after(60 * 1000).create();
  hoja.getRange('A5').setValue(L('Candidatas: ', 'Candidates: ') + Object.keys(hechas).map((t) => t + ': ' + hechas[t]).join(' · ') + (pendientes ? L(' · faltan ', ' · left: ') + pendientes + L(' (sigue sola en un minuto)', ' (continues by itself in a minute)') : L(' · terminado', ' · finished')));
  hoja.getRange('B5').setValue(new Date());
}

// Revisa el archivo completo, también el final, donde algunos PDF guardan la
// portada. Prefiere las imágenes a color (en un libro escaneado en grises suelen
// ser las tapas) y, de las grises, guarda las últimas. Devuelve hasta dónde llegó.
function candidatasDeTodoElArchivo(tamano, leer, quedaTiempo) {
  const color = [];
  let grises = [];
  let desde = 0;
  while (desde < tamano && quedaTiempo()) {
    const bytes = leer(desde, Math.min(desde + TROZO_BYTES, tamano) - 1);
    const { hallados, seguir } = jpegsEn(bytes, 0);
    hallados.forEach((j) => {
      if (Math.min(j.ancho, j.alto) < LADO_MINIMO || j.fin - j.inicio < PESO_MINIMO) return;
      if (j.componentes === 1) {
        grises = grises.concat([bytes.slice(j.inicio, j.fin)]).slice(-3);
      } else if (color.length < CANDIDATAS_POR_OBRA) {
        color.push(bytes.slice(j.inicio, j.fin));
      }
    });
    desde += seguir || bytes.length; // una imagen más grande que el trozo se salta
  }
  return { color: color, grises: grises, revisado: Math.min(desde, tamano) };
}

// Ejecuta una vez por obra para no pasar del límite de tiempo: la que ya tiene
// resultado en "Estado", fila 6, se salta. Las imágenes van a Portadas/_Candidatas.
// La lista (OBRAS_ARCHIVO_COMPLETO) está en config.gs.
function candidatasArchivoCompleto() {
  const inicio = Date.now();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const estado = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  const previo = String(estado.getRange('A6').getValue() || '');
  const pendiente = OBRAS_ARCHIVO_COMPLETO.find(([titulo]) => !previo.includes(titulo + ':'));
  if (!pendiente) return;
  const [titulo, id] = pendiente;
  const token = ScriptApp.getOAuthToken();
  const portadas = DriveApp.getFolderById(CARPETA_PORTADAS_ID);
  const it = portadas.getFoldersByName(CARPETA_CANDIDATAS);
  const carpeta = it.hasNext() ? it.next() : portadas.createFolder(CARPETA_CANDIDATAS);
  const encabezado = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  let texto;
  try {
    const tamano = Number(JSON.parse(UrlFetchApp.fetch(DRIVE_API + '/' + id + '?fields=size&supportsAllDrives=true', encabezado).getContentText()).size);
    const leer = (desde, hasta) => {
      const r = UrlFetchApp.fetch(DRIVE_API + '/' + id + '?alt=media&supportsAllDrives=true', {
        headers: { Authorization: 'Bearer ' + token, Range: 'bytes=' + desde + '-' + hasta }, muteHttpExceptions: true,
      });
      if (r.getResponseCode() >= 300) throw new Error(L('Drive respondió ', 'Drive answered ') + r.getResponseCode());
      return r.getContent();
    };
    const r = candidatasDeTodoElArchivo(tamano, leer, () => Date.now() - inicio < LIMITE_CATALOGO_MS);
    const guardar = (lista, sufijo) => lista.forEach((bytes, i) => {
      carpeta.createFile(Utilities.newBlob(Array.from(bytes), 'image/jpeg').setName(titulo + ' ' + sufijo + ' ' + (i + 1) + '.jpg'));
    });
    guardar(r.color, 'color');
    guardar(r.grises, 'final');
    texto = titulo + ': ' + r.color.length + L(' a color, ', ' in color, ') + r.grises.length + L(' finales en grises, revisado ', ' final grayscale, scanned ') + Math.round((100 * r.revisado) / tamano) + ' %';
  } catch (e) {
    texto = titulo + ': error ' + e.message;
  }
  estado.getRange('A6').setValue((previo ? previo + ' · ' : L('Archivo completo: ', 'Full file: ')) + texto);
  estado.getRange('B6').setValue(new Date());
}
