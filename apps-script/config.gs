/**
 * CONFIGURACIÓN DE TU BIBLIOTECA · YOUR LIBRARY'S CONFIGURATION
 *
 * Este es el único archivo que necesitas editar. Pega aquí los IDs de tu
 * carpeta de Drive, tu hoja de cálculo y tu carpeta de portadas, y guarda.
 * Luego ejecuta `revisarConfiguracion` para comprobar que todo está bien.
 * Guía paso a paso: docs/es/guia.md
 *
 * This is the only file you need to edit. Paste the IDs of your Drive folder,
 * your spreadsheet and your covers folder, and save. Then run
 * `revisarConfiguracion` to check that everything is fine.
 * Step-by-step guide: docs/en/guide.md
 *
 * Cómo encontrar un ID · How to find an ID:
 *   Carpeta / folder:  https://drive.google.com/drive/folders/ESTE_ES_EL_ID
 *   Hoja / sheet:      https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
 */

// Carpeta raíz de Drive con todos tus libros (y sus subcarpetas).
// Root Drive folder holding all your books (and their subfolders).
const ROOT_ID = 'PEGA_AQUI_EL_ID_DE_LA_CARPETA_RAIZ';

// Hoja de cálculo donde vive este script (inventario, correcciones, estado…).
// Spreadsheet where this script lives (inventory, corrections, status…).
const SHEET_ID = 'PEGA_AQUI_EL_ID_DE_LA_HOJA';

// Carpeta donde se guardan las portadas que se sacan de los propios archivos.
// Puede estar dentro de la carpeta raíz o fuera; no entra al catálogo.
// Folder where covers taken from the files themselves are saved.
const CARPETA_PORTADAS_ID = 'PEGA_AQUI_EL_ID_DE_LA_CARPETA_DE_PORTADAS';

// Nombre del archivo del catálogo en la carpeta raíz. Debe coincidir con
// VITE_CATALOG_FILE de web/.env. Catalog file name; must match VITE_CATALOG_FILE.
const NOMBRE_CATALOGO = 'biblioteca-catalogo.json';

// Idioma de las pestañas, encabezados y mensajes de la hoja: 'es' o 'en'.
// Elígelo antes de la primera ejecución: las pestañas se buscan por su nombre.
// Language of the sheet's tabs, headers and messages: 'es' or 'en'. Choose it
// before the first run: tabs are looked up by name.
const IDIOMA = 'es';

// Hora de la actualización nocturna (0–23), en la zona horaria del proyecto
// (Configuración del proyecto → Zona horaria). Nightly update hour.
const HORA_NOCTURNA = 3;

// Identificación ante Open Library y Wikidata (piden un nombre de aplicación).
// Identification for Open Library and Wikidata (they ask for an app name).
const USER_AGENT = 'arma-tu-biblioteca-digital/1.0 (biblioteca personal / personal library)';

// ---------- reorganización de carpetas (opcional) · folder reorganization (optional) ----------
//
// `planearReorganizacion` propone mover archivos para unificar carpetas. Este
// mapa dice a dónde va cada carpeta: la clave es el nombre de la carpeta
// normalizado (sin número inicial, sin acentos y en minúsculas) y el valor es
// la ruta de destino. Las carpetas que no estén aquí se quedan donde están.
// Ejemplo: "02 Poesía", "poesia" y "Poesía " acaban todas en "Literatura/Poesía".
//
// `planearReorganizacion` proposes moves to unify folders. Key: normalized
// folder name (no leading number, no accents, lowercase). Value: destination path.
const MAPA_CARPETAS = {
  'novela': 'Literatura/Novela',
  'novelas': 'Literatura/Novela',
  'poesia': 'Literatura/Poesía',
  'cuentos': 'Literatura/Cuentos',
  'filosofia': 'Filosofía',
  'historia': 'Historia',
};

// Carpeta (dentro de la raíz) donde la reorganización aparta las copias idénticas.
// Folder (inside the root) where the reorganization sets identical copies aside.
const CARPETA_DUPLICADOS = '_Duplicados';

// Destino propuesto para los archivos sueltos en la raíz.
// Proposed destination for loose files in the root folder.
const POR_CLASIFICAR = IDIOMA === 'en' ? 'To sort' : 'Por clasificar';

// ---------- portadas · covers ----------
//
// Para limitar `portadasDesdeArchivos` (y `forzarPortadas`) a unas colecciones,
// pon aquí los nombres de las carpetas de primer nivel, p. ej. ['Poesía', 'Historia'].
// null = todas, incluidas las nuevas. null = all collections.
const COLECCIONES_PORTADAS = null;
const COLECCIONES_FORZADAS = null;

// Archivos grandes de los que `candidatasPortadas` saca imágenes para elegir a
// mano: [título para nombrar las imágenes, ID del archivo en Drive, formato].
// Large files from which `candidatasPortadas` extracts images to pick by hand.
// Ejemplo / example: ['Mi libro escaneado', '1AbCdEf…', 'pdf'],
const OBRAS_CANDIDATAS = [
];

// PDF que `candidatasArchivoCompleto` revisa completos (también el final).
// PDFs that `candidatasArchivoCompleto` scans completely (end included).
// Ejemplo / example: ['Mi libro escaneado', '1AbCdEf…'],
const OBRAS_ARCHIVO_COMPLETO = [
];

// ---------- no hace falta editar de aquí para abajo · no need to edit below ----------

// Texto en el idioma elegido: L('Hola', 'Hello')
function L(es, en) {
  return IDIOMA === 'en' ? en : es;
}

const NOMBRES_HOJAS = {
  inventario: ['Inventario', 'Inventory'],
  estado: ['Estado', 'Status'],
  basura: ['Basura', 'Junk'],
  correcciones: ['Correcciones', 'Corrections'],
  autores: ['Autores', 'Authors'],
  reorganizacion: ['Reorganización', 'Reorganization'],
};

function nombreHoja(clave) {
  return L(NOMBRES_HOJAS[clave][0], NOMBRES_HOJAS[clave][1]);
}

// Comprueba que los IDs están puestos y que esta cuenta puede abrirlos.
// Checks that the IDs are filled in and that this account can open them.
function revisarConfiguracion() {
  const revisar = (nombre, id, abrir) => {
    if (!id || /^PEGA_AQUI/.test(id)) return '✗ ' + nombre + ': ' + L('falta pegar el ID en config.gs', 'the ID is missing in config.gs');
    try {
      return '✓ ' + nombre + ': ' + abrir(id);
    } catch (e) {
      return '✗ ' + nombre + ': ' + L('no se pudo abrir (¿ID correcto? ¿tienes acceso?) ', 'could not be opened (right ID? do you have access?) ') + e.message;
    }
  };
  const lineas = [
    revisar(L('Carpeta raíz', 'Root folder'), ROOT_ID, (id) => DriveApp.getFolderById(id).getName()),
    revisar(L('Hoja de cálculo', 'Spreadsheet'), SHEET_ID, (id) => SpreadsheetApp.openById(id).getName()),
    revisar(L('Carpeta de portadas', 'Covers folder'), CARPETA_PORTADAS_ID, (id) => DriveApp.getFolderById(id).getName()),
  ];
  try {
    const catalogo = DriveApp.getFolderById(ROOT_ID).getFilesByName(NOMBRE_CATALOGO).hasNext();
    lineas.push((catalogo ? '✓ ' : '· ') + NOMBRE_CATALOGO + ': ' + (catalogo ? L('existe', 'exists') : L('todavía no existe; lo crea actualizarCatalogo', 'does not exist yet; actualizarCatalogo creates it')));
  } catch (e) { /* la carpeta raíz ya se reportó arriba */ }
  console.log(lineas.join('\n'));
  return lineas.join('\n');
}

function idsConfigurados() {
  [['ROOT_ID', ROOT_ID], ['SHEET_ID', SHEET_ID]].forEach(([nombre, id]) => {
    if (!id || /^PEGA_AQUI/.test(id)) {
      throw new Error(L('Falta configurar ' + nombre + ' en config.gs (ver docs/es/guia.md).', nombre + ' is not set in config.gs (see docs/en/guide.md).'));
    }
  });
}
