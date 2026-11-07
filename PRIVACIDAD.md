# Privacidad y uso responsable · Privacy and responsible use

**[Español](#español) · [English](#english)**

## Español

### Qué es y qué no es este proyecto

- Es **código** para que cada persona organice y lea **sus propios archivos**
  en **su propio Google Drive**.
- **No aloja, no distribuye y no enlaza libros.** El repositorio solo trae
  obras de dominio público como demostración.
- Quien publica una biblioteca con este código es responsable de lo que guarda
  en su Drive y de con quién lo comparte.

### Uso responsable

- Guarda y comparte solo archivos que tengas derecho a guardar y compartir:
  obras de dominio público, con licencias abiertas, tuyas, o copias
  personales y préstamos permitidos por la ley de tu país.
- Piensa la biblioteca como un estante privado para ti y un grupo pequeño
  de personas (el modo de prueba de Google admite hasta 100), no como un sitio
  público de descargas.
- Respeta los límites de los servicios que se consultan (Open Library y
  Wikidata): el código hace una consulta por segundo y se identifica con un
  nombre de aplicación.

### Qué datos se tratan y dónde

| Dato | Dónde vive | Quién lo ve |
|---|---|---|
| Libros, portadas y catálogo | En el Drive de quien administra la biblioteca | Las cuentas con quienes se comparte la carpeta |
| Hoja de control (inventario, correcciones) | En el Drive de quien administra | Solo esa persona, salvo que la comparta |
| Sesión de Google | Token temporal en el navegador de quien lee | Nadie más; la app nunca ve contraseñas |
| Mi Mochila, notas, avance de lectura | En el navegador de quien lee y, si lo decide, en la carpeta privada de la app en **su** Drive (`appDataFolder`) | Solo esa persona |
| Lista de invitados | Huellas SHA-256 en `web/.env` | Quien tenga acceso al repositorio |
| Sitio publicado (Vercel) | Solo los archivos de la aplicación | Público, pero sin datos de la biblioteca |

- La web **no tiene servidor propio ni analítica**: no envía datos a ningún
  sitio fuera de Google (Drive y el inicio de sesión), Open Library (portadas)
  y Wikidata (solo desde Apps Script). Las tipografías van incluidas en la app.
- Los permisos de Google que pide la web son `drive.readonly` (leer) y,
  opcionalmente, `drive.appdata` (guardar las notas propias). No puede
  modificar ni borrar archivos.
- Al cerrar sesión se borran del dispositivo las copias de libros guardadas
  para abrir más rápido.
- Mantén **privado** tu repositorio: las huellas de invitados no revelan los
  correos, pero alguien que ya conozca un correo puede comprobar si está
  invitado.

---

## English

### What this project is and is not

- It is **code** so each person can organize and read **their own files** in
  **their own Google Drive**.
- **It does not host, distribute or link to books.** The repository only ships
  public-domain works as a demo.
- Whoever publishes a library with this code is responsible for what they keep
  in their Drive and whom they share it with.

### Responsible use

- Keep and share only files you have the right to keep and share: public-domain
  works, openly licensed works, your own works, or personal copies and lending
  allowed by the law of your country.
- Think of the library as a private shelf for yourself and a small group of
  people (Google's testing mode allows up to 100), not as a public download
  site.
- Respect the limits of the services it queries (Open Library and Wikidata):
  the code makes one request per second and identifies itself with an
  application name.

### What data is handled and where

| Data | Where it lives | Who sees it |
|---|---|---|
| Books, covers and catalog | In the Drive of the library's administrator | The accounts the folder is shared with |
| Control sheet (inventory, corrections) | In the administrator's Drive | Only that person, unless they share it |
| Google session | Temporary token in the reader's browser | Nobody else; the app never sees passwords |
| My Backpack, notes, reading progress | In the reader's browser and, if they choose, in the app's private folder in **their** Drive (`appDataFolder`) | Only that person |
| Invitee list | SHA-256 fingerprints in `web/.env` | Whoever has access to the repository |
| Published site (Vercel) | Only the app's files | Public, but with no library data |

- The web app **has no server of its own and no analytics**: it sends no data
  anywhere outside Google (Drive and sign-in), Open Library (covers) and
  Wikidata (from Apps Script only). Typefaces are bundled with the app.
- The Google permissions the web app asks for are `drive.readonly` (read) and,
  optionally, `drive.appdata` (save one's own notes). It cannot modify or delete
  files.
- Signing out deletes the book copies saved on the device for faster opening.
- Keep your repository **private**: invitee fingerprints do not reveal the
  emails, but someone who already knows an email can check whether it is
  invited.
