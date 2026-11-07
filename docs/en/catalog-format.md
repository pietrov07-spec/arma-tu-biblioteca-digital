# Catalog format

> [Versión en español](../es/formato-catalogo.md)

`actualizarCatalogo` (in `apps-script/catalogo.gs`) writes a JSON file into the
Drive root folder (by default `biblioteca-catalogo.json`; see `NOMBRE_CATALOGO`
in `config.gs` and `VITE_CATALOG_FILE` in `web/.env`). The web app downloads it
with the reader's token. It is a list of **works**; field names are short to
keep the file small.

```json
[
  {
    "id": "leaves-of-grass-whitman",
    "t": "Leaves of Grass",
    "a": ["Walt Whitman"],
    "y": 1855,
    "c": ["Literature", "Literature/Poetry"],
    "p": "https://covers.openlibrary.org/b/id/123456-M.jpg",
    "tm": ["American poetry"],
    "l": ["eng"],
    "m": "alta",
    "src": "openlibrary.org/works/OL123W",
    "f": [
      { "id": "DRIVE_FILE_ID", "x": "pdf", "s": 1048576, "r": "Literature/Poetry/Leaves of Grass - Whitman.pdf" }
    ],
    "pa": "US"
  }
]
```

## Fields of each work

| Field | Type | Meaning |
|---|---|---|
| `id` | text | Stable work identifier (normalized title + author). Used by My Backpack, notes and the *Corrections* tab. |
| `t` | text | Displayed title. |
| `z` | `true` | The title looks poor (a file name, codes); worth correcting. |
| `to` | text | Another known title (the file's or Open Library's); also searchable. |
| `a` | list of text | Authors. |
| `y` | number | Year (of first publication when known). |
| `c` | list of text | Collections: top-level folder and `collection/subcollection`. |
| `p` | text | Cover: image URL, `drive:<ID>` (an image in Drive, fetched with the reader's token) or absent (generated cover). |
| `tm` | list of text | Subjects. |
| `l` | list of text | Languages (three-letter MARC codes such as `spa`, `eng`). |
| `m` | text | Open Library match: `alta` (high), `media` (medium), `sin coincidencia` (no match) or `manual` (corrected by hand). |
| `src` | text | Open Library record the data came from (without `https://`). |
| `f` | list | The work's files: `id` (Drive ID), `x` (format), `s` (size in bytes), `r` (path inside the root folder). |
| `pa`, `pa2` | text | Author's country (and second country), two-letter ISO code. |
| `pd` | `true` | Uncertain country (hollow dot on the map). |
| `h` | `true` | Hidden work (column K of *Corrections*); the web app does not show it. |
| `ed`, `lu` | text | Publisher and city for citations (columns M and N). |
| `_o` | object | Detected values that a correction replaced, to restore them if the correction is cleared. |

Empty fields are omitted.

## Testing the web app with your own catalog, without Google

Copy your catalog into `web/local/` (a folder ignored by git) with the
`VITE_CATALOG_FILE` name and start `npm run dev` without a client ID: the web
app uses it instead of the demo one. Files cannot be opened (they live in
Drive), but you can check search, filters, map and cards.

The demo catalog (`web/demo/catalogo-demo.json`) is generated with:

```bash
npm run demo
```

Its files have IDs starting with `demo-` and are served from
`web/demo/archivos/`.
