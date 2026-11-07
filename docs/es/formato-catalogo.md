# Formato del catálogo

> [English version](../en/catalog-format.md)

`actualizarCatalogo` (en `apps-script/catalogo.gs`) escribe en la carpeta raíz de
Drive un archivo JSON (por defecto `biblioteca-catalogo.json`; ver
`NOMBRE_CATALOGO` en `config.gs` y `VITE_CATALOG_FILE` en `web/.env`). La web
lo descarga con el token de quien lee. Es una lista de **obras**; los nombres
de campo son cortos para que el archivo pese poco.

```json
[
  {
    "id": "rimas-becquer",
    "t": "Rimas",
    "a": ["Gustavo Adolfo Bécquer"],
    "y": 1871,
    "c": ["Literatura", "Literatura/Poesía"],
    "p": "https://covers.openlibrary.org/b/id/123456-M.jpg",
    "tm": ["Poesía española"],
    "l": ["spa"],
    "m": "alta",
    "src": "openlibrary.org/works/OL123W",
    "f": [
      { "id": "ID_DEL_ARCHIVO_EN_DRIVE", "x": "pdf", "s": 1048576, "r": "Literatura/Poesía/Rimas - Bécquer.pdf" }
    ],
    "pa": "ES"
  }
]
```

## Campos de cada obra

| Campo | Tipo | Significado |
|---|---|---|
| `id` | texto | Identificador estable de la obra (título + autor normalizados). Lo usan Mi Mochila, las notas y la pestaña *Correcciones*. |
| `t` | texto | Título que se muestra. |
| `z` | `true` | El título parece pobre (nombre de archivo, códigos); conviene corregirlo. |
| `to` | texto | Otro título conocido (el del archivo o el de Open Library); se busca también por él. |
| `a` | lista de textos | Autores. |
| `y` | número | Año (de primera publicación si se conoce). |
| `c` | lista de textos | Colecciones: carpeta de primer nivel y `colección/subcolección`. |
| `p` | texto | Portada: URL de imagen, `drive:<ID>` (imagen en Drive, se pide con el token de quien lee) o ausente (portada generada). |
| `tm` | lista de textos | Temas. |
| `l` | lista de textos | Idiomas (códigos MARC de tres letras, como `spa`, `eng`). |
| `m` | texto | Coincidencia con Open Library: `alta`, `media`, `sin coincidencia` o `manual` (corregida a mano). |
| `src` | texto | Ficha de Open Library de donde salieron los datos (sin `https://`). |
| `f` | lista | Archivos de la obra: `id` (ID en Drive), `x` (formato), `s` (tamaño en bytes), `r` (ruta dentro de la carpeta raíz). |
| `pa`, `pa2` | texto | País del autor (y segundo país), código ISO de dos letras. |
| `pd` | `true` | País dudoso (se muestra como punto hueco en el mapa). |
| `h` | `true` | Obra oculta (columna K de *Correcciones*); la web no la muestra. |
| `ed`, `lu` | texto | Editorial y ciudad para citar (columnas M y N). |
| `_o` | objeto | Valores detectados que una corrección reemplazó, para volver a ellos si se borra la corrección. |

Los campos vacíos se omiten.

## Probar la web con tu propio catálogo sin Google

Copia tu catálogo a `web/local/` (carpeta ignorada por git) con el mismo nombre
de `VITE_CATALOG_FILE` y arranca `npm run dev` sin ID de cliente: la web lo usa
en lugar del de demostración. Los archivos no se podrán abrir (están en Drive),
pero puedes revisar búsquedas, filtros, mapa y fichas.

El catálogo de demostración (`web/demo/catalogo-demo.json`) se genera con:

```bash
npm run demo
```

Sus archivos tienen IDs que empiezan con `demo-` y se sirven desde
`web/demo/archivos/`.
