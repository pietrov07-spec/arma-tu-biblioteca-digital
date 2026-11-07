# Guía paso a paso: arma tu biblioteca digital

> [English version](../en/guide.md)

Esta guía te lleva desde cero hasta una biblioteca privada en internet, con tus
propios archivos de Google Drive, que tú y las personas que invites pueden
consultar, leer, anotar y citar desde cualquier dispositivo. No supone que ya
sepas programar: cada paso dice dónde hacer clic y qué escribir, y todos los
comandos están completos.

Calcula entre una y dos horas la primera vez. Casi todo el tiempo se va en
Google Cloud y en esperar a que el catálogo se llene.

## Índice

0. [Cómo funciona (en un minuto)](#0-cómo-funciona-en-un-minuto)
1. [Lo que necesitas](#1-lo-que-necesitas)
2. [Prueba la demostración en tu computadora](#2-prueba-la-demostración-en-tu-computadora)
3. [Prepara tu carpeta en Drive](#3-prepara-tu-carpeta-en-drive)
4. [Crea la hoja de cálculo y pega los Apps Script](#4-crea-la-hoja-de-cálculo-y-pega-los-apps-script)
5. [Primer catálogo y actualización nocturna](#5-primer-catálogo-y-actualización-nocturna)
6. [Proyecto y cliente OAuth en Google Cloud](#6-proyecto-y-cliente-oauth-en-google-cloud)
7. [Configura la web y pruébala con tu Drive](#7-configura-la-web-y-pruébala-con-tu-drive)
8. [Publica la web en Vercel](#8-publica-la-web-en-vercel)
9. [Invita a otras personas](#9-invita-a-otras-personas)
10. [Corrige el catálogo: la pestaña Correcciones](#10-corrige-el-catálogo-la-pestaña-correcciones)
11. [Portadas](#11-portadas)
12. [Países de los autores y mapa](#12-países-de-los-autores-y-mapa)
13. [Duplicados, basura y reorganización de carpetas](#13-duplicados-basura-y-reorganización-de-carpetas)
14. [Mi Mochila y las notas](#14-mi-mochila-y-las-notas)
15. [Leer, citar y llevar a Gemini Notebook](#15-leer-citar-y-llevar-a-gemini-notebook)
16. [Mantenimiento y actualizaciones](#16-mantenimiento-y-actualizaciones)
17. [Problemas frecuentes](#17-problemas-frecuentes)

---

## 0. Cómo funciona (en un minuto)

```
Google Drive (tus archivos)          Hoja de cálculo + Apps Script
  Mi biblioteca/                       · Inventario, Correcciones, Autores…
    Literatura/…  ──── cada noche ───▶ · escribe biblioteca-catalogo.json
    Historia/…                            en la carpeta raíz
    biblioteca-catalogo.json ◀───────┘

Navegador de quien lee
  1. abre tu sitio (Vercel): solo trae la aplicación, sin títulos ni libros
  2. entra con Google (solo cuentas autorizadas)
  3. con SU token, lee el catálogo y los libros directo de Drive
```

- **Nada de tus libros pasa por el sitio publicado.** El sitio es una
  aplicación vacía; los datos llegan de Drive a cada navegador con el permiso
  de la persona que lee.
- **No hay servidor propio ni base de datos.** Google Drive es el almacén, una
  hoja de cálculo es el panel de control y Vercel solo sirve los archivos de la
  aplicación.
- **El permiso que pide la web es de solo lectura** (`drive.readonly`): no
  puede cambiar ni borrar nada en Drive. Los scripts de la hoja sí escriben,
  pero solo cuando tú los ejecutas, con tu cuenta.

## 1. Lo que necesitas

- Una **cuenta de Google** (Gmail o Google Workspace) con espacio en Drive
  para tus archivos.
- Tus **libros en formato digital**: PDF, EPUB, MOBI, AZW3, FB2 (se leen dentro
  de la app) y también DJVU, CBZ, TXT o DOCX (aparecen en el catálogo y se
  abren en el visor de Drive). Usa solo archivos que tengas derecho a guardar y
  compartir: lee la [nota de privacidad y uso responsable](../../PRIVACIDAD.md).
- Una cuenta gratuita de **GitHub** (<https://github.com/signup>) y una de
  **Vercel** (<https://vercel.com/signup>, entra con GitHub).
- En tu computadora (solo para probar en local y administrar invitaciones):
  - **Node.js 20 o más nuevo**. Descárgalo de <https://nodejs.org> (versión
    LTS) e instálalo. Para comprobarlo, abre una terminal y escribe:

    ```bash
    node --version
    ```

    Debe responder `v20…` o un número mayor.
  - **Git**. En macOS viene con las herramientas de Xcode (la terminal te
    ofrece instalarlas la primera vez que escribes `git`); en Windows,
    descárgalo de <https://git-scm.com>. Compruébalo con:

    ```bash
    git --version
    ```

> **¿Qué es «la terminal»?** En macOS: abre *Aplicaciones → Utilidades →
> Terminal*. En Windows: abre *PowerShell* desde el menú Inicio. Los bloques
> de código de esta guía se copian y pegan ahí, uno por uno, y se ejecutan con
> Enter.

## 2. Prueba la demostración en tu computadora

Antes de tocar tu Drive, comprueba que todo funciona con el catálogo de
ejemplo (obras de dominio público, sin Google).

1. **Haz tu copia del repositorio.** En GitHub, abre este repositorio y pulsa
   **Use this template → Create a new repository** (o **Fork**). Ponle el nombre
   que quieras y elige **Private**: tu copia guardará la configuración de tu
   biblioteca.
2. **Descárgala a tu computadora.** En tu repositorio nuevo pulsa **Code** y
   copia la dirección HTTPS. En la terminal (cambia la dirección por la tuya):

   ```bash
   git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   cd TU_REPOSITORIO/web
   ```

3. **Instala las dependencias** (solo la primera vez; tarda uno o dos minutos):

   ```bash
   npm install
   ```

4. **Arranca la web en modo demostración:**

   ```bash
   npm run dev
   ```

   Abre <http://127.0.0.1:5173> en el navegador. Verás «Mi biblioteca» con 22
   obras de ejemplo. Prueba la cuadrícula, el estante, el mapa, el botón
   **EN/ES** para cambiar de idioma, y abre *El ingenioso hidalgo don Quijote*
   (PDF) o *Pride and Prejudice* (EPUB) con **Leer**. Selecciona una frase para
   resaltarla o escribir una nota.

   Para detener el servidor, vuelve a la terminal y pulsa `Ctrl + C`.

El modo demostración se activa solo cuando no hay un ID de cliente de Google
configurado (lo harás en el paso 7).

## 3. Prepara tu carpeta en Drive

1. En <https://drive.google.com>, crea una carpeta para toda la biblioteca, por
   ejemplo `Mi biblioteca`. Esta es la **carpeta raíz**.
2. Dentro, crea una carpeta por **colección** y, si quieres, subcarpetas para
   **subcolecciones**. La app usa los dos primeros niveles:

   ```
   Mi biblioteca/                 ← carpeta raíz
     Literatura/                  ← colección «Literatura»
       Poesía/                    ← subcolección «Literatura › Poesía»
       Novela/
     Historia/
     Filosofía/
     Portadas/                    ← para las portadas (paso 11); no es colección
   ```

   - Un número al inicio del nombre se ignora: `01 Literatura` aparece como
     «Literatura». Sirve para ordenar las carpetas en Drive.
   - Los archivos sueltos en la raíz aparecen como «Sin clasificar».
   - Un mismo libro en varias carpetas o formatos (PDF y EPUB) se junta en una
     sola **obra** con varios archivos.

3. **Sube tus archivos.** Para que el catálogo reconozca título y autor sin
   ayuda, nómbralos con alguno de estos patrones:

   | Patrón | Ejemplo |
   |---|---|
   | `Título - Autor.ext` | `Rimas - Gustavo Adolfo Bécquer.pdf` |
   | `Título (Autor).ext` | `Rimas (Gustavo Adolfo Bécquer).epub` |
   | `Título - Autor1; Autor2.ext` | `Manifiesto - Autora Uno; Autor Dos.pdf` |
   | `Título.ext` | `Rimas.pdf` (sin autor: Open Library intentará encontrarlo) |

   Si un nombre no se entiende bien, no pasa nada: lo corriges después en la
   hoja (paso 10) sin renombrar el archivo.

4. **Crea la carpeta de portadas.** Dentro de la carpeta raíz, crea `Portadas`.
   Así, quien tenga acceso a la biblioteca también ve las portadas.

5. **Copia los IDs.** Abre la carpeta raíz y mira la barra de direcciones:

   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345
                                          └────────── este es el ID ──────────┘
   ```

   Copia el ID de la carpeta raíz y el de `Portadas` en un bloc de notas.

## 4. Crea la hoja de cálculo y pega los Apps Script

La hoja de cálculo es el panel de control: ahí se ve el inventario, se
corrigen datos y se ejecutan los scripts.

1. En <https://sheets.new> crea una hoja nueva y ponle nombre, por ejemplo
   `Biblioteca · control`. Copia su ID de la barra de direcciones:

   ```
   https://docs.google.com/spreadsheets/d/1XyZ…AbC/edit
                                          └─ ID ─┘
   ```

2. En la hoja: **Extensiones → Apps Script**. Se abre el editor en otra
   pestaña. Arriba a la izquierda, cambia el nombre del proyecto (por ejemplo
   `Biblioteca`).
3. **Muestra el archivo de manifiesto.** Ícono de engrane (**Configuración del
   proyecto**) → marca **Mostrar el archivo de manifiesto "appsscript.json" en
   el editor**. En la misma pantalla, en **Zona horaria**, elige la tuya (la
   actualización nocturna usa esa hora).
4. Vuelve al editor (ícono `< >`). Vas a tener cuatro archivos. Para cada uno
   del repositorio, en la carpeta `apps-script/`:

   | Archivo en el repositorio | Qué hacer en el editor |
   |---|---|
   | `appsscript.json` | Ábrelo en el editor, borra todo y pega el contenido del repositorio. **Cambia `"timeZone"`** por tu zona (por ejemplo `"America/Bogota"`, `"Europe/Madrid"`, `"America/Argentina/Buenos_Aires"`). |
   | `config.gs` | Junto a **Archivos** pulsa **+ → Secuencia de comandos**, llámalo `config` (el editor agrega `.gs`) y pega el contenido. |
   | `inventario.gs` | Igual: archivo nuevo `inventario` y pega. |
   | `catalogo.gs` | Igual: archivo nuevo `catalogo` y pega. |

   Borra el archivo `Código.gs` (o `Code.gs`) que trae el proyecto vacío: tres
   puntos junto al nombre → **Eliminar**.

   > Para copiar un archivo desde GitHub: ábrelo y pulsa el botón **Copy raw
   > file** (dos cuadritos) arriba a la derecha del contenido.

5. **Edita `config.gs`.** Es el único archivo que tienes que cambiar. Pega los
   tres IDs entre las comillas:

   ```js
   const ROOT_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';   // carpeta raíz
   const SHEET_ID = '1XyZ…AbC';                           // esta hoja
   const CARPETA_PORTADAS_ID = '1Por…tadas';              // carpeta Portadas
   ```

   Revisa también:

   - `NOMBRE_CATALOGO`: el nombre del archivo del catálogo. Si una misma
     persona va a tener acceso a dos bibliotecas armadas con este proyecto, dale
     a cada una un nombre distinto (por ejemplo `catalogo-familia.json`).
   - `IDIOMA`: `'es'` o `'en'` para los nombres de pestañas, encabezados y
     mensajes. Elígelo ahora; si lo cambias después se crean pestañas nuevas.
   - `HORA_NOCTURNA`: hora de la actualización diaria (0 a 23).

   Guarda con `Ctrl + S` (o `Cmd + S` en Mac).

6. **Comprueba la configuración.** Arriba, en el menú desplegable de
   funciones, elige `revisarConfiguracion` y pulsa **Ejecutar**.

   La primera vez Google pide permisos:

   1. **Revisar permisos** → elige tu cuenta.
   2. Aparece «Google no ha verificado esta aplicación». Es normal: el script es
      tuyo y solo lo usas tú. Pulsa **Configuración avanzada** → **Ir a
      Biblioteca (no seguro)**.
   3. Marca todas las casillas (ver y administrar Drive, hojas de cálculo,
      ejecutar en segundo plano y conectarse a servicios externos) y pulsa
      **Continuar**.

   Para qué sirve cada permiso:

   | Permiso | Para qué |
   |---|---|
   | Drive (completo) | Leer tus carpetas, escribir el catálogo y las portadas, y mover o mandar a la papelera solo cuando ejecutas la limpieza o la reorganización. |
   | Hojas de cálculo | Escribir el inventario, las correcciones y el estado. |
   | Activadores | Programar la actualización nocturna y continuar los trabajos largos. |
   | Servicios externos | Consultar Open Library (datos y portadas) y Wikidata (países). |

   En el **Registro de ejecución** (abajo) debes ver tres líneas con `✓`. Si
   alguna tiene `✗`, revisa ese ID.

## 5. Primer catálogo y actualización nocturna

1. **(Opcional) Inventario.** Ejecuta `iniciarInventario`. Escribe la pestaña
   *Inventario* con una fila por archivo (nombre, ruta, tamaño, fechas). Con
   miles de archivos tarda varios minutos: el script se reprograma solo cada
   minuto y la pestaña *Estado* dice `Terminado` al final. Sirve para revisar
   qué hay en Drive; el catálogo no depende de él.

2. **Primer catálogo.** Ejecuta `actualizarCatalogo`. Esto:
   - crea `biblioteca-catalogo.json` en la carpeta raíz (la primera vez);
   - agrupa los archivos en obras;
   - busca en Open Library título, autores, año, idioma, temas y portada de
     cada obra nueva (una consulta por segundo, para respetar su límite);
   - llena la pestaña *Correcciones* con una fila por obra.

   Apps Script corta cada ejecución a los 6 minutos. Con muchas obras, las que
   no alcanzaron quedan como «pendiente» y se completan en las ejecuciones
   siguientes: vuelve a ejecutar `actualizarCatalogo` hasta que la pestaña
   *Estado* (fila 2) ya no diga «sin metadatos todavía», o deja que lo haga la
   actualización nocturna.

   Al terminar se programa sola `buscarPaises` (paso 12).

3. **Actualización nocturna.** Ejecuta una vez `instalarCatalogoNocturno`.
   Desde ahora, cada noche a la hora de `HORA_NOCTURNA` el catálogo se
   actualiza con lo que agregues, quites o muevas en Drive. Puedes verlo en el
   editor, ícono del reloj (**Activadores**).

> **La pestaña *Estado*** resume cada proceso en su fila: 1 inventario,
> 2 catálogo, 3 reorganización, 4 portadas, 5 y 6 candidatas de portada,
> 7 países. La columna B dice cuándo fue la última ejecución.

## 6. Proyecto y cliente OAuth en Google Cloud

La web necesita un «ID de cliente» para que la gente pueda entrar con su
cuenta de Google. Se crea gratis en Google Cloud.

### 6.1 Crear el proyecto

1. Entra a <https://console.cloud.google.com> con tu cuenta. Si es la primera
   vez, acepta los términos.
2. Arriba, junto al logo, abre el selector de proyectos → **Proyecto nuevo**.
   Nombre: por ejemplo `mi-biblioteca`. **Crear** y, cuando termine,
   selecciónalo en el mismo selector.

### 6.2 Activar la API de Google Drive

1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca **Google Drive API**, ábrela y pulsa **Habilitar**.

### 6.3 Pantalla de consentimiento (Google Auth Platform)

1. Menú ☰ → **APIs y servicios → Pantalla de consentimiento de OAuth** (en
   algunas cuentas se llama **Google Auth Platform → Descripción general**).
   Pulsa **Comenzar**.
2. **Información de la app:** nombre (el que verá la gente al entrar, por
   ejemplo `Mi biblioteca`) y tu correo de asistencia. **Siguiente**.
3. **Público:** elige **Externo**. **Siguiente**.
4. **Información de contacto:** tu correo. **Siguiente**, acepta la política
   de datos de usuario y **Crear**.
5. **Acceso a los datos** (menú de la izquierda) → **Agregar o quitar
   permisos**. Busca y marca estos dos (si no los encuentras, pégalos en
   *Agregar permisos manualmente*):

   ```
   https://www.googleapis.com/auth/drive.readonly
   https://www.googleapis.com/auth/drive.appdata
   ```

   - `drive.readonly`: leer el catálogo y los libros. Es **obligatorio**.
   - `drive.appdata`: guardar Mi Mochila y las notas de cada persona en una
     carpeta privada de la app dentro de su propio Drive (paso 14). La app lo
     pide aparte y solo si la persona quiere sincronizar.

   **Actualizar** y luego **Guardar**.

6. **Público** (menú de la izquierda): el estado de publicación debe decir
   **Prueba**. Déjalo así. En **Usuarios de prueba → Agregar usuarios**, escribe
   tu propio correo (y, más adelante, el de cada persona invitada; paso 9).

#### Por qué el modo «Prueba» y qué significa

- `drive.readonly` es un **permiso restringido** de Google: da acceso de
  lectura a todo lo que la cuenta puede ver en Drive. Por eso Google exige una
  verificación (con revisión de seguridad) para que una app que lo usa la pueda
  abrir **cualquier** cuenta.
- **En modo Prueba no hace falta verificar nada.** A cambio:
  - Solo pueden entrar los **usuarios de prueba** que agregues: **hasta 100
    cuentas**. Para una biblioteca personal, familiar o de un grupo de estudio
    es suficiente.
  - Al entrar, Google muestra «Google no verificó esta app». Es normal: pulsa
    **Continuar**. Explícaselo a tus invitados.
- **La verificación solo hace falta si quieres abrirla a cualquier persona**
  (más de 100 o sin agregarlas una por una). Ese trámite es largo y, con
  permisos restringidos, incluye una evaluación de seguridad externa. Para el
  uso que propone este proyecto no la necesitas, y no la recomendamos.

### 6.4 Crear el ID de cliente

1. **Clientes** (menú de la izquierda) → **Crear cliente** (o **Credenciales →
   Crear credenciales → ID de cliente de OAuth**).
2. Tipo de aplicación: **Aplicación web**. Nombre: `web`.
3. **Orígenes autorizados de JavaScript** → **Agregar URI**, uno por uno:

   ```
   http://127.0.0.1:5173
   http://localhost:5173
   ```

   (Cuando publiques en Vercel, en el paso 8, volverás aquí a agregar tu
   dirección.) **No** hace falta ningún «URI de redireccionamiento».
4. **Crear**. Copia el **ID de cliente**: termina en
   `.apps.googleusercontent.com`. No es secreto (va dentro de la web pública);
   el «secreto del cliente», si aparece, **no** se usa ni se comparte.

## 7. Configura la web y pruébala con tu Drive

1. En la terminal, dentro de la carpeta `web/` de tu copia:

   ```bash
   cp .env.example .env
   ```

   (En Windows PowerShell: `Copy-Item .env.example .env`.)

2. Abre `web/.env` con cualquier editor de texto (VS Code, TextEdit en modo
   texto, Bloc de notas) y llena:

   ```ini
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   VITE_LIBRARY_NAME=Biblioteca
   VITE_LIBRARY_ACCENT=de la Casa
   VITE_DRIVE_FOLDER_NAME=Mi biblioteca
   VITE_CATALOG_FILE=biblioteca-catalogo.json
   VITE_DEFAULT_LANG=es
   VITE_INVITE_SALT=pon-aqui-un-texto-largo-al-azar
   VITE_ALLOWED=
   ```

   | Variable | Qué es |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | El ID de cliente del paso 6.4. Vacío = modo demostración. |
   | `VITE_LIBRARY_NAME` / `VITE_LIBRARY_ACCENT` | Nombre de tu biblioteca; el «destacado» se muestra en otro color. Ejemplo: «Biblioteca **de la Casa**». |
   | `VITE_DRIVE_FOLDER_NAME` | Nombre de la carpeta raíz, para el mensaje que ve quien todavía no tiene acceso. |
   | `VITE_CATALOG_FILE` | Igual que `NOMBRE_CATALOGO` en `config.gs`. |
   | `VITE_DEFAULT_LANG` | Idioma inicial (`es` o `en`). Cada quien puede cambiarlo con el botón EN/ES. |
   | `VITE_INVITE_SALT` | Texto al azar para las huellas de invitados (paso 9). Ponlo ahora y no lo cambies después. |
   | `VITE_ALLOWED` | Lista de invitados. No la edites a mano: usa `npm run permitir`. |

   Nada de esto es secreto: termina dentro del JavaScript que descarga el
   navegador. Aun así, mantén tu repositorio **privado** (ver paso 9).

3. Arranca la web:

   ```bash
   npm run dev
   ```

   Abre <http://127.0.0.1:5173>, pulsa **Entrar con Google**, elige tu cuenta,
   pulsa **Continuar** en el aviso de app no verificada y acepta el permiso de
   lectura de Drive. Debes ver tu catálogo.

## 8. Publica la web en Vercel

1. **Sube tu configuración a GitHub.** `.env` se puede versionar (no tiene
   secretos) y así Vercel la usa al publicar. En la terminal, desde la carpeta
   del repositorio:

   ```bash
   git add web/.env
   git commit -m "Configurar mi biblioteca"
   git push
   ```

   > ¿Prefieres no guardar `.env` en GitHub? Agrega `web/.env` a `.gitignore`
   > y, en Vercel, copia cada variable en **Settings → Environment Variables**.
   > Tendrás que repetir eso cada vez que cambie la lista de invitados.

2. En <https://vercel.com/new>, **Import** tu repositorio de GitHub (la primera
   vez, autoriza a Vercel a ver tus repositorios).
3. En la configuración del proyecto:
   - **Root Directory:** pulsa **Edit** y elige `web`.
   - **Framework Preset:** `Vite` (lo detecta solo).
   - Build Command `npm run build` y Output Directory `dist` (los valores por
     defecto).
4. **Deploy.** En un minuto tendrás una dirección como
   `https://mi-biblioteca.vercel.app`.
5. **Autoriza esa dirección en Google Cloud:** vuelve a **Google Auth Platform →
   Clientes → web** y, en **Orígenes autorizados de JavaScript**, agrega tu
   dirección de Vercel **sin barra al final**:

   ```
   https://mi-biblioteca.vercel.app
   ```

   Guarda. Puede tardar unos minutos en surtir efecto.
6. Abre tu dirección, entra con Google y comprueba que ves el catálogo.

Desde ahora, cada `git push` a la rama principal publica una versión nueva.

**Instalarla como app:** en iPhone, Safari → Compartir → *Agregar a pantalla de
inicio*; en Android, Chrome → menú ⋮ → *Instalar app*; en computadora, Chrome o
Edge → ícono de instalar en la barra de direcciones.

**Nombre e íconos de la app instalada:** edita `"name"` en
`web/public/manifest.webmanifest`. Para cambiar el color de los íconos, edita
`FONDO` y `TINTA` en `web/scripts/crear-iconos.mjs` y ejecuta:

```bash
node scripts/crear-iconos.mjs
```

## 9. Invita a otras personas

Para que alguien entre hacen falta **tres cosas**. Las dos primeras son la
seguridad real; la tercera solo da un mensaje claro a quien no está invitado.

1. **Usuario de prueba en Google Cloud.** *Google Auth Platform → Público →
   Usuarios de prueba → Agregar usuarios*: su correo de Google. Sin esto, Google
   no le deja iniciar sesión. Máximo 100 personas.
2. **Acceso a la carpeta en Drive.** En Drive, clic derecho en la carpeta raíz
   → **Compartir** → su correo como **Lector**. Sin esto no ve el catálogo ni
   los libros. (Si desactivas «Notificar», no le llega correo.)
3. **Lista de invitados de la app** (opcional pero recomendable). Desde la
   carpeta `web/`:

   ```bash
   npm run permitir -- agregar persona@gmail.com
   git commit -am "Invitar a una persona"
   git push
   ```

   Otras acciones:

   ```bash
   npm run permitir -- revisar persona@gmail.com
   ```

   ```bash
   npm run permitir -- quitar persona@gmail.com
   ```

   `web/.env` guarda **huellas** (SHA-256 del correo con tu `VITE_INVITE_SALT`),
   nunca los correos. Con la lista vacía entra cualquier usuario de prueba.
   Como las huellas de correos conocidos se pueden comprobar, mantén tu
   repositorio **privado**.

**Para quitar el acceso**, lo que de verdad lo corta es dejar de compartir la
carpeta en Drive (y quitarle de los usuarios de prueba).

Envía a tus invitados la dirección de Vercel y avísales que verán el aviso
«Google no verificó esta app» y que deben pulsar **Continuar**.

## 10. Corrige el catálogo: la pestaña Correcciones

Cada obra tiene una fila. Las columnas **A–F** las escribe el script (gris) y
las **G–N** son tuyas (encabezado amarillo). Lo que escribas se aplica en la
siguiente ejecución de `actualizarCatalogo` (a mano o esa noche); si borras la
celda, vuelve el valor detectado.

| Col. | Contenido | Ejemplo |
|---|---|---|
| A | ID de la obra (**no editar**) | |
| B–E | Título, autores, año y colección detectados | |
| F | Coincidencia con Open Library: `alta`, `media` (revisar), `sin coincidencia`, `manual` | |
| **G** | Título corregido | `Rimas y leyendas` |
| **H** | Autores corregidos, separados con `;` | `Gustavo Adolfo Bécquer` |
| **I** | Año corregido | `1871` |
| **J** | Portada (paso 11) | `9788437604947`, un enlace de imagen, un enlace de Drive o `ninguna` |
| **K** | Ocultar la obra: `sí` | `sí` |
| **L** | Notas tuyas (no se publican) | |
| **M** | Editorial, para citar | `Cátedra` |
| **N** | Ciudad, para citar | `Madrid` |

Consejos:

- Usa el filtro de la fila 1 para ver primero las de coincidencia `media` o
  `sin coincidencia`.
- Si no quieres esperar a la noche, ejecuta `actualizarCatalogo` y recarga la
  web.
- Las correcciones de obras que ya no están en Drive se conservan al final
  como «(ya no está en Drive)», por si el archivo vuelve.

## 11. Portadas

Cada obra muestra, en este orden: la portada que pongas en la columna **J**, la
que encontró Open Library o, si no hay, una portada tipográfica generada con
el título y el autor.

**Sacar portadas de los propios archivos.** Ejecuta `portadasDesdeArchivos`.
Para cada obra sin portada toma la primera página del PDF (con la miniatura de
Drive) o la portada que trae el EPUB, MOBI o AZW3, la guarda en tu carpeta
`Portadas` y pega su enlace en la columna J. Se reprograma sola si hay muchas y
al final actualiza el catálogo. Nunca toca una fila que ya tenga algo en J.

- `forzarPortadas` hace lo mismo pero también reemplaza las portadas de Open
  Library (que a veces son de otra edición).
- Para limitarlo a algunas colecciones, en `config.gs`:

  ```js
  const COLECCIONES_PORTADAS = ['Literatura', 'Historia'];
  ```

- Si la primera página está en blanco, la pestaña *Estado* (fila 4) lo avisa.

**Portada a mano (columna J):**

- Un **ISBN** (`9788437604947`): usa la portada de Open Library de esa edición.
- Un **enlace de imagen** que empiece con `https://`.
- Un **enlace de Drive** a una imagen (sube la imagen a `Portadas`, clic derecho
  → **Compartir → Copiar vínculo**). La web la descarga con el permiso de quien
  lee, así que debe estar dentro de la carpeta compartida.
- `ninguna`: usa la portada generada.

**Archivos muy grandes o escaneados.** Drive no da miniatura de archivos muy
pesados y Apps Script no descarga más de 50 MB. Para esos, pon en
`OBRAS_CANDIDATAS` (en `config.gs`) un título, el ID del archivo y su formato:

```js
const OBRAS_CANDIDATAS = [
  ['Mi libro escaneado', '1AbC…xyz', 'pdf'],
];
```

y ejecuta `candidatasPortadas`: guarda hasta seis imágenes de cada uno en
`Portadas/_Candidatas` para que elijas una y pegues su enlace en J. Para un PDF
cuya portada está al final, usa `OBRAS_ARCHIVO_COMPLETO` y
`candidatasArchivoCompleto` (una obra por ejecución).

> El ID de un archivo está en su enlace: `https://drive.google.com/file/d/ID/view`.

## 12. Países de los autores y mapa

La vista **Mapa** agrupa las obras por el país del primer autor.

- `buscarPaises` se programa sola después de `actualizarCatalogo` cuando hay
  autores nuevos. Consulta Wikidata y llena la pestaña *Autores*.
- Columna **Confianza**: `alta`; `revisar` (homónimos, o deducido del lugar de
  nacimiento: en el mapa sale como punto hueco); `sin dato`; `colectivo`
  (VV. AA., anónimo).
- Para corregir, escribe en **País corregido** (H) un nombre o código de dos
  letras: `España`, `ES`, `Spain`. `ninguno` quita el país. La columna I es un
  segundo país opcional.
- Si Wikidata limita las consultas, el script espera 15 minutos y sigue; si no
  avanza, lo retoma la noche siguiente.

## 13. Duplicados, basura y reorganización de carpetas

Todo esto es **opcional** y cada paso escribe primero un plan en la hoja para
que lo revises: nada se mueve ni se borra sin que ejecutes el paso siguiente.
Lo que va a la papelera se recupera desde la papelera de Drive durante 30 días.

**Archivos basura** (`.DS_Store`, `._algo`, `Thumbs.db`, `desktop.ini`, que dejan
macOS y Windows al subir carpetas):

1. Ejecuta `iniciarInventario` (si no lo hiciste) y luego `revisarBasura`:
   lista en la pestaña *Basura* lo que se mandaría a la papelera.
2. Revísalo y ejecuta `limpiarBasura`.

**Reorganizar carpetas y apartar duplicados:**

1. En `config.gs`, ajusta `MAPA_CARPETAS`: qué carpeta va a dónde. La clave es
   el nombre normalizado (sin número inicial, sin acentos, en minúsculas):

   ```js
   const MAPA_CARPETAS = {
     'novela': 'Literatura/Novela',
     'novelas': 'Literatura/Novela',
     'poesia': 'Literatura/Poesía',
   };
   ```

2. Ejecuta `planearReorganizacion`. La pestaña *Reorganización* lista cada
   archivo que cambiaría de lugar, con su destino (columna D, **editable**) y el
   motivo. Las **copias idénticas** (misma obra, mismo formato y mismo tamaño)
   van a `_Duplicados`; los archivos sueltos en la raíz, a «Por clasificar».
3. Corrige destinos en la columna D (o bórralos para no mover ese archivo) y
   ejecuta `aplicarReorganizacion`. Se reprograma sola si hay muchos.
4. Revisa la carpeta `_Duplicados` en Drive. Si todo está bien, ejecuta
   `duplicadosAPapelera`.
5. Ejecuta `limpiarCarpetasVacias` para mandar a la papelera las carpetas que
   quedaron vacías.

Mover no cambia el ID de los archivos: el catálogo, el avance de lectura, las
notas y las correcciones siguen funcionando.

## 14. Mi Mochila y las notas

**Mi Mochila** es la lista de lectura de cada persona: hasta **30 textos**, y
cada uno se guarda **30 días** (se puede renovar desde su ficha). Se agrega
desde la ficha (**+ Mi Mochila**) o con **Seleccionar** para varias obras a la
vez.

**Notas:** dentro del lector, selecciona un fragmento para **Resaltar**,
**Subrayar** o escribir una **Nota**. El botón de notas (arriba a la derecha)
abre la lista; desde ahí puedes saltar a cada marca, **Descargar (.md)** o
**Copiar todas** para llevarlas a tu documento de trabajo.

**Dónde se guardan:**

- Siempre en el navegador de esa persona.
- Si la persona pulsa **Guardar en mi cuenta de Google**, la app pide el permiso
  `drive.appdata` y guarda una copia en la **carpeta privada de la app dentro
  del Drive de esa persona**: no la ve nadie más, ni siquiera quien administra
  la biblioteca, y aparece en cualquier dispositivo donde entre. Esa carpeta no
  se ve en Drive; ocupa unos pocos KB.
- El **avance de lectura** («Seguir leyendo · 37 %») se guarda en cada
  navegador.
- Al **cerrar sesión** se borran las copias de libros guardadas en el
  dispositivo para abrir más rápido.

## 15. Leer, citar y llevar a Gemini Notebook

- **Lector PDF** (pdf.js): una página, dos páginas o ajuste manual con zoom;
  texto seleccionable; ir a una página. Solo descarga las páginas que muestra.
- **Lector EPUB, MOBI, AZW3 y FB2** (foliate-js): paginado, índice y tamaño de
  letra. Los libros abiertos se guardan en el dispositivo (hasta 40 MB por
  archivo, 300 MB en total, 30 días) para abrir más rápido la siguiente vez.
- Los demás formatos se abren en el visor de Google Drive.
- **Citar:** la ficha arma la referencia en APA 7, Chicago, MLA 9, Harvard,
  Vancouver e IEEE, con las convenciones del idioma de la interfaz. Editorial y
  ciudad vienen de las columnas M y N de *Correcciones* o se escriben en la
  ficha (solo en ese dispositivo); **Copiar para la hoja** las deja listas para
  pegar en la columna M.
- **Llevar a Gemini Notebook:** los PDF se agregan en Gemini Notebook desde
  *Agregar fuente → Google Drive* (el panel copia el título para buscarlo); los
  EPUB y demás se convierten a texto (.md) en el navegador para subirlos. Nada
  pasa por otro servidor.

## 16. Mantenimiento y actualizaciones

- **Agregar libros:** súbelos a Drive. Aparecen la noche siguiente (o ejecuta
  `actualizarCatalogo`).
- **Cambiar el nombre o el idioma inicial:** edita `web/.env`, `git commit` y
  `git push`.
- **Traer mejoras de este proyecto a tu copia:** si usaste *Fork*, en GitHub
  pulsa **Sync fork**. Si usaste *Use this template*, añade este repositorio
  como remoto y combina:

  ```bash
  git remote add original https://github.com/USUARIO_ORIGINAL/arma-tu-biblioteca-digital.git
  git fetch original
  git merge original/main
  ```

  Si cambian los Apps Script, vuelve a pegar `inventario.gs` y `catalogo.gs`
  (tu `config.gs` no cambia).
- **Agregar otro idioma a la interfaz:** copia el bloque `en` de
  `web/src/textos.jsx`, tradúcelo y agrégalo a `TEXTOS`.
- **Formato del catálogo:** ver [formato-catalogo.md](formato-catalogo.md).

## 17. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `Error 400: redirect_uri_mismatch` u `origin_mismatch` al entrar | La dirección exacta del sitio no está en **Orígenes autorizados de JavaScript** (paso 6.4 y 8.5). Sin barra final; `http` en local, `https` en Vercel. |
| `Error 403: access_denied` | Esa cuenta no está en **Usuarios de prueba** (paso 9.1). |
| «Tu cuenta todavía no tiene acceso a la carpeta…» | Falta compartir la carpeta raíz con esa cuenta (paso 9.2), o el catálogo todavía no existe: ejecuta `actualizarCatalogo`. |
| «La cuenta … no está invitada» | Falta en `VITE_ALLOWED` (paso 9.3), o cambiaste `VITE_INVITE_SALT` después de invitar. Vuelve a ejecutar `npm run permitir -- agregar …` y publica. |
| «El navegador bloqueó la ventana de Google» | Permite ventanas emergentes para tu sitio. |
| En Apps Script: «Falta configurar ROOT_ID…» | Pega los IDs en `config.gs` y guarda. |
| En Apps Script: «Se excedió el tiempo máximo de ejecución» | Normal con bibliotecas grandes: los procesos largos siguen solos o en la siguiente ejecución. |
| Una obra salió con título o autor raro | Corrígela en *Correcciones* (paso 10). |
| Portada equivocada | Pon un ISBN, un enlace o `ninguna` en la columna J. |
| La web publicada no cambia | Revisa en Vercel → *Deployments* que el último `git push` se publicó; en el celular, cierra y vuelve a abrir la app. |
| `npm: command not found` | Instala Node.js (paso 1) y abre una terminal nueva. |
