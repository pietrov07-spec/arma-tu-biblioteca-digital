/**
 * Inventario · Inventory
 *
 * Recorre la carpeta raíz de Drive (y todas sus subcarpetas) y escribe una
 * fila por archivo en la pestaña "Inventario" de la hoja de cálculo. El
 * inventario solo lee: no mueve, renombra ni borra nada.
 *
 * Walks the root Drive folder (and all its subfolders) and writes one row per
 * file in the "Inventory" tab. It only reads: it never moves, renames or
 * deletes anything.
 *
 * Al final del archivo están `revisarBasura` y `limpiarBasura`, que mandan
 * a la papelera los archivos basura de macOS y Windows (sección "Limpieza").
 *
 * Uso / usage (los IDs van en config.gs · the IDs go in config.gs):
 *   1. Ejecuta `iniciarInventario` y acepta los permisos. Run it and accept.
 *   2. Si la biblioteca es grande, el script se reprograma solo cada minuto
 *      hasta terminar (Apps Script corta cada ejecución a los 6 minutos).
 *      Al final verás "Terminado" en la pestaña "Estado".
 */

const LIMITE_MS = 4.5 * 60 * 1000;
const N_COLUMNAS = 10;

function columnasInventario() {
  return L(
    ['id', 'nombre', 'ruta', 'coleccion', 'mime', 'extension', 'tamano_bytes', 'creado', 'modificado', 'url'],
    ['id', 'name', 'path', 'collection', 'mime', 'extension', 'size_bytes', 'created', 'modified', 'url'],
  );
}

function iniciarInventario() {
  idsConfigurados();
  const ss = libro();
  const hoja = ss.getSheetByName(nombreHoja('inventario')) || ss.insertSheet(nombreHoja('inventario'));
  hoja.clear();
  hoja.appendRow(columnasInventario());
  hoja.setFrozenRows(1);

  // Cola de carpetas pendientes: [id, ruta]
  guardarEstado({ cola: [[ROOT_ID, '']], token: null, total: 0 });
  borrarDisparadores();
  continuarInventario();
}

function continuarInventario() {
  const inicio = Date.now();
  const estado = leerEstado();
  const hoja = libro().getSheetByName(nombreHoja('inventario'));
  let filas = [];

  while (estado.cola.length) {
    const [carpetaId, ruta] = estado.cola[0];
    const carpeta = DriveApp.getFolderById(carpetaId);

    // Las subcarpetas se encolan una sola vez, al empezar la carpeta.
    if (!estado.token) {
      const subs = carpeta.getFolders();
      while (subs.hasNext()) {
        const sub = subs.next();
        estado.cola.push([sub.getId(), ruta ? ruta + '/' + sub.getName() : sub.getName()]);
      }
    }

    const archivos = estado.token
      ? DriveApp.continueFileIterator(estado.token)
      : carpeta.getFiles();

    while (archivos.hasNext()) {
      filas.push(fila(archivos.next(), ruta));
      if (Date.now() - inicio > LIMITE_MS) {
        estado.token = archivos.getContinuationToken();
        return pausar(hoja, filas, estado);
      }
    }

    estado.token = null;
    estado.cola.shift();
  }

  escribir(hoja, filas);
  estado.total += filas.length;
  guardarEstado(estado);
  borrarDisparadores();
  marcar(L('Terminado: ', 'Finished: ') + estado.total + L(' archivos', ' files'));
}

function fila(archivo, ruta) {
  const nombre = archivo.getName();
  const punto = nombre.lastIndexOf('.');
  return [
    archivo.getId(),
    nombre,
    ruta,
    ruta.split('/')[0] || '(raíz)',
    archivo.getMimeType(),
    punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '',
    archivo.getSize(),
    archivo.getDateCreated(),
    archivo.getLastUpdated(),
    archivo.getUrl(),
  ];
}

function pausar(hoja, filas, estado) {
  escribir(hoja, filas);
  estado.total += filas.length;
  guardarEstado(estado);
  borrarDisparadores();
  ScriptApp.newTrigger('continuarInventario').timeBased().after(60 * 1000).create();
  marcar(L('En curso: ', 'In progress: ') + estado.total + L(' archivos, ', ' files, ') + estado.cola.length + L(' carpetas pendientes', ' folders left'));
}

function escribir(hoja, filas) {
  if (!filas.length) return;
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, N_COLUMNAS).setValues(filas);
}

// El estado puede superar el límite de 9 KB por propiedad, así que se guarda
// en una hoja oculta en lugar de PropertiesService.
function guardarEstado(estado) {
  const ss = libro();
  const hoja = ss.getSheetByName('_estado') || ss.insertSheet('_estado').hideSheet();
  hoja.getRange('A1').setValue(JSON.stringify(estado));
}

function leerEstado() {
  return JSON.parse(libro().getSheetByName('_estado').getRange('A1').getValue());
}

function libro() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function marcar(texto) {
  const ss = libro();
  const hoja = ss.getSheetByName(nombreHoja('estado')) || ss.insertSheet(nombreHoja('estado'));
  hoja.getRange('A1').setValue(texto);
  hoja.getRange('B1').setValue(new Date());
}

function borrarDisparadores() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'continuarInventario')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

// ---------- Limpieza ----------
//
// 1. `revisarBasura`: lee la hoja "Inventario" y escribe en la hoja "Basura"
//    los archivos que se mandarían a la papelera. No toca Drive.
// 2. Revisa esa hoja.
// 3. `limpiarBasura`: manda a la papelera cada archivo de "Basura" (se puede
//    recuperar desde la papelera de Drive durante 30 días). Antes de cada uno
//    vuelve a comprobar en Drive su nombre y tamaño. Si se corta por tiempo,
//    ejecútala otra vez: continúa con los pendientes.

const NOMBRES_BASURA = ['.DS_Store', 'Thumbs.db', 'desktop.ini'];
// Los archivos ._ pesan 4 KB; ningún libro real pesa menos de 100 KB.
const TAMANO_MAX_BASURA = 100 * 1024;

function esBasura(nombre, tamano) {
  return (nombre.startsWith('._') || NOMBRES_BASURA.includes(nombre))
    && tamano < TAMANO_MAX_BASURA;
}

function revisarBasura() {
  const filas = libro().getSheetByName(nombreHoja('inventario')).getDataRange().getValues().slice(1);
  const basura = filas
    .filter((f) => esBasura(String(f[1]), Number(f[6])))
    .map((f) => [f[0], f[1], f[2] || '(raíz)', f[6], 'pendiente']);

  const hoja = libro().getSheetByName(nombreHoja('basura')) || libro().insertSheet(nombreHoja('basura'));
  hoja.clear();
  hoja.appendRow(L(['id', 'nombre', 'ruta', 'tamano_bytes', 'estado'], ['id', 'name', 'path', 'size_bytes', 'status']));
  hoja.setFrozenRows(1);
  if (basura.length) hoja.getRange(2, 1, basura.length, 5).setValues(basura);
  marcar(L('Basura por revisar: ', 'Junk to review: ') + basura.length + L(' archivos (pestaña "Basura")', ' files ("Junk" tab)'));
}

function limpiarBasura() {
  // Con el consentimiento por casillas de Google, el permiso de escritura en
  // Drive puede quedar sin otorgar. Esto detiene la ejecución y vuelve a
  // mostrar la pantalla de permisos si falta alguno.
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const inicio = Date.now();
  const hoja = libro().getSheetByName(nombreHoja('basura'));
  if (!hoja) throw new Error(L('Primero ejecuta revisarBasura', 'Run revisarBasura first'));
  const filas = hoja.getDataRange().getValues();
  let enviados = 0;

  for (let i = 1; i < filas.length; i++) {
    const [id, nombre, , , estado] = filas[i];
    // Los errores de una ejecución anterior se reintentan.
    if (estado !== 'pendiente' && !String(estado).startsWith('error')) continue;
    if (Date.now() - inicio > LIMITE_MS) {
      marcar(L('Limpieza en pausa: ', 'Cleanup paused: ') + enviados + L(' enviados en esta ejecución. Ejecuta limpiarBasura otra vez.', ' trashed in this run. Run limpiarBasura again.'));
      return;
    }

    let resultado;
    try {
      const archivo = DriveApp.getFileById(id);
      if (archivo.getName() !== nombre || !esBasura(archivo.getName(), archivo.getSize())) {
        resultado = L('omitido: cambió en Drive', 'skipped: changed in Drive');
      } else if (archivo.isTrashed()) {
        resultado = L('ya estaba en la papelera', 'already in the trash');
      } else {
        archivo.setTrashed(true);
        resultado = L('en la papelera', 'in the trash');
        enviados++;
      }
    } catch (e) {
      // Sin permiso de escritura en Drive fallarían todos: mejor parar ya.
      if (/permiso|permission/i.test(e.message)) {
        marcar(L('Limpieza detenida: falta el permiso para modificar Drive. Vuelve a autorizar el script.', 'Cleanup stopped: permission to modify Drive is missing. Authorize the script again.'));
        throw e;
      }
      resultado = 'error: ' + e.message;
    }
    hoja.getRange(i + 1, 5).setValue(resultado);
  }

  const pendientes = hoja.getDataRange().getValues()
    .filter((f) => f[4] === 'pendiente' || String(f[4]).startsWith('error')).length;
  marcar(L('Limpieza terminada: ', 'Cleanup finished: ') + enviados + L(' enviados en esta ejecución, ', ' trashed in this run, ') + pendientes + L(' pendientes', ' left'));
}
