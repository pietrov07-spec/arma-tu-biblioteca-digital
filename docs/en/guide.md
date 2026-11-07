# Step-by-step guide: build your digital library

> [Versión en español](../es/guia.md)

This guide takes you from zero to a private library on the web, built from
your own Google Drive files. You and the people you invite can browse it, read,
annotate and cite from any device. It does not assume you know how to code:
every step says where to click and what to type, and every command is complete.

Plan for one or two hours the first time. Most of that goes into Google Cloud
and waiting for the catalog to fill up.

> **About the interface language.** The web app is fully bilingual (EN/ES
> button). The Apps Script code is commented in Spanish, but its tabs, headers
> and messages switch to English with `IDIOMA = 'en'` in `config.gs`. Function
> names (the ones you pick in the editor) stay in Spanish; this guide gives each
> one with a short description.

## Contents

0. [How it works (in one minute)](#0-how-it-works-in-one-minute)
1. [What you need](#1-what-you-need)
2. [Try the demo on your computer](#2-try-the-demo-on-your-computer)
3. [Prepare your Drive folder](#3-prepare-your-drive-folder)
4. [Create the spreadsheet and paste the Apps Script code](#4-create-the-spreadsheet-and-paste-the-apps-script-code)
5. [First catalog and nightly update](#5-first-catalog-and-nightly-update)
6. [Google Cloud project and OAuth client](#6-google-cloud-project-and-oauth-client)
7. [Configure the web app and test it with your Drive](#7-configure-the-web-app-and-test-it-with-your-drive)
8. [Deploy the web app on Vercel](#8-deploy-the-web-app-on-vercel)
9. [Invite other people](#9-invite-other-people)
10. [Fix the catalog: the Corrections tab](#10-fix-the-catalog-the-corrections-tab)
11. [Covers](#11-covers)
12. [Authors' countries and the map](#12-authors-countries-and-the-map)
13. [Duplicates, junk and folder reorganization](#13-duplicates-junk-and-folder-reorganization)
14. [My Backpack and notes](#14-my-backpack-and-notes)
15. [Reading, citing and Gemini Notebook](#15-reading-citing-and-gemini-notebook)
16. [Maintenance and updates](#16-maintenance-and-updates)
17. [Troubleshooting](#17-troubleshooting)

---

## 0. How it works (in one minute)

```
Google Drive (your files)            Spreadsheet + Apps Script
  My library/                          · Inventory, Corrections, Authors…
    Literature/…  ──── every night ──▶ · writes biblioteca-catalogo.json
    History/…                             into the root folder
    biblioteca-catalogo.json ◀───────┘

The reader's browser
  1. opens your site (Vercel): it only loads the app, no titles, no books
  2. signs in with Google (authorized accounts only)
  3. with THEIR token, reads the catalog and the books straight from Drive
```

- **None of your books go through the published site.** The site is an empty
  app; the data travels from Drive to each browser with the reader's own
  permission.
- **There is no server or database of your own.** Google Drive is the storage,
  a spreadsheet is the control panel and Vercel only serves the app's files.
- **The web app asks for read-only access** (`drive.readonly`): it cannot change
  or delete anything in Drive. The spreadsheet scripts do write, but only when
  you run them, with your account.

## 1. What you need

- A **Google account** (Gmail or Google Workspace) with Drive space for your
  files.
- Your **books in digital form**: PDF, EPUB, MOBI, AZW3, FB2 (read inside the
  app), plus DJVU, CBZ, TXT or DOCX (listed in the catalog and opened in the
  Drive viewer). Only use files you have the right to keep and share: read the
  [privacy and responsible-use note](../../PRIVACIDAD.md).
- A free **GitHub** account (<https://github.com/signup>) and a **Vercel**
  account (<https://vercel.com/signup>, sign in with GitHub).
- On your computer (only to test locally and manage invitations):
  - **Node.js 20 or newer.** Download it from <https://nodejs.org> (LTS
    version) and install it. To check, open a terminal and type:

    ```bash
    node --version
    ```

    It should answer `v20…` or a higher number.
  - **Git.** On macOS it comes with the Xcode tools (the terminal offers to
    install them the first time you type `git`); on Windows, download it from
    <https://git-scm.com>. Check with:

    ```bash
    git --version
    ```

> **What is "the terminal"?** On macOS: open *Applications → Utilities →
> Terminal*. On Windows: open *PowerShell* from the Start menu. Copy the code
> blocks in this guide there, one at a time, and run each with Enter.

## 2. Try the demo on your computer

Before touching your Drive, check that everything works with the sample catalog
(public-domain works, no Google involved). If you only want to look at it, open
the [live demo](https://arma-tu-biblioteca-digital.vercel.app).

1. **Make your copy of the repository.** On GitHub, open this repository and
   click **Use this template → Create a new repository** (or **Fork**). Name it
   whatever you like and choose **Private**: your copy will hold your library's
   configuration.
2. **Download it to your computer.** In your new repository click **Code** and
   copy the HTTPS address. In the terminal (replace the address with yours):

   ```bash
   git clone https://github.com/YOUR_USER/YOUR_REPOSITORY.git
   cd YOUR_REPOSITORY/web
   ```

3. **Install the dependencies** (first time only; takes a minute or two):

   ```bash
   npm install
   ```

4. **Start the web app in demo mode:**

   ```bash
   npm run dev
   ```

   Open <http://127.0.0.1:5173> in your browser. You will see "My library" with
   22 sample works. Try the grid, the shelf, the map, the **EN/ES** button to
   switch languages, and open *Pride and Prejudice* (EPUB) or *El ingenioso
   hidalgo don Quijote* (PDF) with **Read**. Select a sentence to highlight it or
   write a note.

   To stop the server, go back to the terminal and press `Ctrl + C`.

Demo mode turns on by itself when no Google client ID is configured (you will
set one in step 7).

## 3. Prepare your Drive folder

1. In <https://drive.google.com>, create one folder for the whole library, for
   example `My library`. This is the **root folder**.
2. Inside it, create one folder per **collection** and, if you like, subfolders
   for **subcollections**. The app uses the first two levels:

   ```
   My library/                    ← root folder
     Literature/                  ← collection "Literature"
       Poetry/                    ← subcollection "Literature › Poetry"
       Novels/
     History/
     Philosophy/
     Covers/                      ← for covers (step 11); not a collection
   ```

   - A leading number in a name is ignored: `01 Literature` shows up as
     "Literature". Use it to sort the folders in Drive.
   - Loose files in the root show up as "Unsorted".
   - The same book in several folders or formats (PDF and EPUB) is merged into
     a single **work** with several files.

3. **Upload your files.** For the catalog to recognize title and author on its
   own, name them with one of these patterns:

   | Pattern | Example |
   |---|---|
   | `Title - Author.ext` | `Leaves of Grass - Walt Whitman.pdf` |
   | `Title (Author).ext` | `Leaves of Grass (Walt Whitman).epub` |
   | `Title - Author1; Author2.ext` | `Manifesto - Author One; Author Two.pdf` |
   | `Title.ext` | `Leaves of Grass.pdf` (no author: Open Library will try to find it) |

   If a name is not understood well, no problem: you fix it later in the sheet
   (step 10) without renaming the file.

4. **Create the covers folder.** Inside the root folder, create `Covers`. That
   way anyone with access to the library also sees the covers.

5. **Copy the IDs.** Open the root folder and look at the address bar:

   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345
                                          └────────── this is the ID ─────────┘
   ```

   Copy the ID of the root folder and of `Covers` into a notepad.

## 4. Create the spreadsheet and paste the Apps Script code

The spreadsheet is the control panel: it shows the inventory, lets you fix data
and runs the scripts.

1. Go to <https://sheets.new> to create a new sheet and name it, for example
   `Library · control`. Copy its ID from the address bar:

   ```
   https://docs.google.com/spreadsheets/d/1XyZ…AbC/edit
                                          └─ ID ─┘
   ```

2. In the sheet: **Extensions → Apps Script**. The editor opens in another tab.
   At the top left, rename the project (for example `Library`).
3. **Show the manifest file.** Gear icon (**Project Settings**) → tick **Show
   "appsscript.json" manifest file in editor**. On the same screen, under
   **Time zone**, choose yours (the nightly update uses that time).
4. Go back to the editor (`< >` icon). You will end up with four files. For
   each one in the repository's `apps-script/` folder:

   | File in the repository | What to do in the editor |
   |---|---|
   | `appsscript.json` | Open it in the editor, delete everything and paste the repository's content. **Change `"timeZone"`** to yours (for example `"America/New_York"`, `"Europe/London"`, `"Asia/Tokyo"`). |
   | `config.gs` | Next to **Files** click **+ → Script**, name it `config` (the editor adds `.gs`) and paste the content. |
   | `inventario.gs` | Same: new file `inventario`, paste. |
   | `catalogo.gs` | Same: new file `catalogo`, paste. |

   Delete the `Code.gs` file that the empty project comes with: three dots next
   to its name → **Delete**.

   > To copy a file from GitHub: open it and click the **Copy raw file** button
   > (two squares) at the top right of the content.

5. **Edit `config.gs`.** It is the only file you need to change. Paste the
   three IDs between the quotes:

   ```js
   const ROOT_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';   // root folder
   const SHEET_ID = '1XyZ…AbC';                           // this sheet
   const CARPETA_PORTADAS_ID = '1Cov…ers';                // Covers folder
   ```

   Also check:

   - `NOMBRE_CATALOGO`: the catalog file name. If one person will have access to
     two libraries built with this project, give each one a different name (for
     example `family-catalog.json`).
   - `IDIOMA`: `'es'` or `'en'` for tab names, headers and messages. Set it to
     `'en'` now if you want English; changing it later creates new tabs.
   - `HORA_NOCTURNA`: hour of the daily update (0 to 23).

   Save with `Ctrl + S` (or `Cmd + S` on a Mac).

6. **Check the configuration.** At the top, in the function drop-down, choose
   `revisarConfiguracion` ("check configuration") and click **Run**.

   The first time, Google asks for permissions:

   1. **Review permissions** → choose your account.
   2. You see "Google hasn't verified this app". That is expected: the script
      is yours and only you use it. Click **Advanced** → **Go to Library
      (unsafe)**.
   3. Tick every box (see and manage Drive, spreadsheets, run in the background
      and connect to external services) and click **Continue**.

   What each permission is for:

   | Permission | What for |
   |---|---|
   | Drive (full) | Read your folders, write the catalog and covers, and move or trash files only when you run the clean-up or reorganization. |
   | Spreadsheets | Write the inventory, corrections and status. |
   | Triggers | Schedule the nightly update and continue long jobs. |
   | External services | Query Open Library (data and covers) and Wikidata (countries). |

   In the **Execution log** (bottom) you should see three lines with `✓`. If
   any shows `✗`, check that ID.

## 5. First catalog and nightly update

1. **(Optional) Inventory.** Run `iniciarInventario` ("start inventory"). It
   writes the *Inventory* tab with one row per file (name, path, size, dates).
   With thousands of files it takes several minutes: the script reschedules
   itself every minute and the *Status* tab says `Finished` at the end. It helps
   you review what is in Drive; the catalog does not depend on it.

2. **First catalog.** Run `actualizarCatalogo` ("update catalog"). This:
   - creates `biblioteca-catalogo.json` in the root folder (the first time);
   - groups the files into works;
   - looks up title, authors, year, language, subjects and cover for each new
     work in Open Library (one request per second, to respect its limit);
   - fills the *Corrections* tab with one row per work.

   Apps Script stops each run after 6 minutes. With many works, the ones that
   did not fit stay "pending" and are completed in later runs: run
   `actualizarCatalogo` again until the *Status* tab (row 2) no longer says
   "no metadata yet", or let the nightly update do it.

   When it finishes, `buscarPaises` (step 12) schedules itself.

3. **Nightly update.** Run `instalarCatalogoNocturno` ("install nightly
   catalog") once. From now on, every night at `HORA_NOCTURNA` the catalog picks
   up whatever you add, remove or move in Drive. You can see it in the editor,
   clock icon (**Triggers**).

> **The *Status* tab** summarizes each process in its own row: 1 inventory,
> 2 catalog, 3 reorganization, 4 covers, 5 and 6 cover candidates, 7 countries.
> Column B says when it last ran.

## 6. Google Cloud project and OAuth client

The web app needs a "client ID" so people can sign in with their Google
account. You create it for free in Google Cloud.

### 6.1 Create the project

1. Go to <https://console.cloud.google.com> with your account. If it is your
   first time, accept the terms.
2. At the top, next to the logo, open the project picker → **New project**.
   Name: for example `my-library`. **Create** and, when it is done, select it in
   the same picker.

### 6.2 Enable the Google Drive API

1. Menu ☰ → **APIs & Services → Library**.
2. Search for **Google Drive API**, open it and click **Enable**.

### 6.3 Consent screen (Google Auth Platform)

1. Menu ☰ → **APIs & Services → OAuth consent screen** (on some accounts it is
   called **Google Auth Platform → Overview**). Click **Get started**.
2. **App information:** name (what people see when signing in, for example
   `My library`) and your support email. **Next**.
3. **Audience:** choose **External**. **Next**.
4. **Contact information:** your email. **Next**, accept the user data policy
   and **Create**.
5. **Data access** (left menu) → **Add or remove scopes**. Find and tick these
   two (if you cannot find them, paste them under *Manually add scopes*):

   ```
   https://www.googleapis.com/auth/drive.readonly
   https://www.googleapis.com/auth/drive.appdata
   ```

   - `drive.readonly`: read the catalog and the books. **Required.**
   - `drive.appdata`: save each person's Backpack and notes in a private app
     folder inside their own Drive (step 14). The app asks for it separately,
     and only if the person wants to sync.

   **Update** and then **Save**.

6. **Audience** (left menu): the publishing status should say **Testing**.
   Leave it that way. Under **Test users → Add users**, type your own email (and,
   later, each invited person's; step 9).

#### Why "Testing" mode, and what it means

- `drive.readonly` is a Google **restricted scope**: it grants read access to
  everything the account can see in Drive. That is why Google requires
  verification (with a security review) before an app using it can be opened by
  **any** account.
- **In Testing mode nothing needs to be verified.** In exchange:
  - Only the **test users** you add can sign in: **up to 100 accounts**. For a
    personal, family or study-group library that is enough.
  - When signing in, Google shows "Google hasn't verified this app". That is
    expected: click **Continue**. Explain it to your guests.
- **Verification is only needed if you want to open the app to anyone** (more
  than 100 people, or without adding them one by one). That process is long
  and, for restricted scopes, includes an external security assessment. For the
  use this project is meant for you do not need it, and we do not recommend it.

### 6.4 Create the client ID

1. **Clients** (left menu) → **Create client** (or **Credentials → Create
   credentials → OAuth client ID**).
2. Application type: **Web application**. Name: `web`.
3. **Authorized JavaScript origins** → **Add URI**, one at a time:

   ```
   http://127.0.0.1:5173
   http://localhost:5173
   ```

   (When you deploy to Vercel in step 8 you will come back here to add your
   address.) You do **not** need any "redirect URI".
4. **Create**. Copy the **Client ID**: it ends in `.apps.googleusercontent.com`.
   It is not a secret (it ships inside the public web app); the "client
   secret", if shown, is **not** used and must not be shared.

## 7. Configure the web app and test it with your Drive

1. In the terminal, inside your copy's `web/` folder:

   ```bash
   cp .env.example .env
   ```

   (In Windows PowerShell: `Copy-Item .env.example .env`.)

2. Open `web/.env` with any text editor (VS Code, TextEdit in plain-text mode,
   Notepad) and fill in:

   ```ini
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   VITE_LIBRARY_NAME=Library
   VITE_LIBRARY_ACCENT=of the House
   VITE_DRIVE_FOLDER_NAME=My library
   VITE_CATALOG_FILE=biblioteca-catalogo.json
   VITE_DEFAULT_LANG=en
   VITE_INVITE_SALT=put-a-long-random-text-here
   VITE_ALLOWED=
   ```

   | Variable | What it is |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | The client ID from step 6.4. Empty = demo mode. |
   | `VITE_LIBRARY_NAME` / `VITE_LIBRARY_ACCENT` | Your library's name; the "accent" is shown in another color. Example: "Library **of the House**". |
   | `VITE_DRIVE_FOLDER_NAME` | Name of the root folder, for the message shown to people who do not have access yet. |
   | `VITE_CATALOG_FILE` | Same as `NOMBRE_CATALOGO` in `config.gs`. |
   | `VITE_DEFAULT_LANG` | Initial language (`es` or `en`). Everyone can switch it with the EN/ES button. |
   | `VITE_INVITE_SALT` | Random text for the invitee fingerprints (step 9). Set it now and do not change it later. |
   | `VITE_ALLOWED` | Invitee list. Do not edit it by hand: use `npm run permitir`. |

   None of this is secret: it ends up inside the JavaScript the browser
   downloads. Even so, keep your repository **private** (see step 9).

3. Start the web app:

   ```bash
   npm run dev
   ```

   Open <http://127.0.0.1:5173>, click **Sign in with Google**, choose your
   account, click **Continue** on the unverified-app warning and accept the
   Drive read permission. You should see your catalog.

## 8. Deploy the web app on Vercel

1. **Push your configuration to GitHub.** `.env` can be committed (it has no
   secrets), and that way Vercel uses it when building. In the terminal, from
   the repository folder:

   ```bash
   git add web/.env
   git commit -m "Configure my library"
   git push
   ```

   > Rather not keep `.env` on GitHub? Add `web/.env` to `.gitignore` and, in
   > Vercel, copy each variable into **Settings → Environment Variables**. You
   > will have to repeat that every time the invitee list changes.

2. At <https://vercel.com/new>, **Import** your GitHub repository (the first
   time, allow Vercel to see your repositories).
3. In the project settings:
   - **Root Directory:** click **Edit** and choose `web`.
   - **Framework Preset:** `Vite` (detected automatically).
   - Build Command `npm run build` and Output Directory `dist` (the defaults).
4. **Deploy.** In a minute you will have an address like
   `https://my-library.vercel.app`.
5. **Authorize that address in Google Cloud:** go back to **Google Auth
   Platform → Clients → web** and, under **Authorized JavaScript origins**, add
   your Vercel address **without a trailing slash**:

   ```
   https://my-library.vercel.app
   ```

   Save. It may take a few minutes to take effect.
6. Open your address, sign in with Google and check that you see the catalog.

From now on, every `git push` to the main branch publishes a new version.

**Install it as an app:** on iPhone, Safari → Share → *Add to Home Screen*; on
Android, Chrome → ⋮ menu → *Install app*; on a computer, Chrome or Edge →
install icon in the address bar.

**Installed app name and icons:** edit `"name"` in
`web/public/manifest.webmanifest`. To change the icon colors, edit `FONDO`
(background) and `TINTA` (ink) in `web/scripts/crear-iconos.mjs` and run:

```bash
node scripts/crear-iconos.mjs
```

## 9. Invite other people

For someone to get in, **three things** are needed. The first two are the real
security; the third only gives a clear message to people who were not invited.

1. **Test user in Google Cloud.** *Google Auth Platform → Audience → Test users
   → Add users*: their Google email. Without this, Google will not let them sign
   in. 100 people at most.
2. **Access to the Drive folder.** In Drive, right-click the root folder →
   **Share** → their email as **Viewer**. Without this they see neither the
   catalog nor the books. (If you untick "Notify people", no email is sent.)
3. **The app's invitee list** (optional but recommended). From the `web/`
   folder:

   ```bash
   npm run permitir -- add person@gmail.com
   git commit -am "Invite someone"
   git push
   ```

   Other actions:

   ```bash
   npm run permitir -- check person@gmail.com
   ```

   ```bash
   npm run permitir -- remove person@gmail.com
   ```

   (The Spanish verbs `agregar`, `revisar` and `quitar` also work.)

   `web/.env` stores **fingerprints** (SHA-256 of the email with your
   `VITE_INVITE_SALT`), never the emails. With an empty list, any test user can
   get in. Because fingerprints of known emails can be checked, keep your
   repository **private**.

**To revoke access**, what really cuts it off is unsharing the Drive folder
(and removing them from the test users).

Send your guests the Vercel address and warn them that they will see "Google
hasn't verified this app" and should click **Continue**.

## 10. Fix the catalog: the Corrections tab

Each work has one row. Columns **A–F** are written by the script (gray) and
**G–N** are yours (yellow header). Whatever you write is applied on the next
`actualizarCatalogo` run (by hand or that night); if you clear a cell, the
detected value comes back.

| Col. | Content | Example |
|---|---|---|
| A | Work ID (**do not edit**) | |
| B–E | Detected title, authors, year and collection | |
| F | Open Library match: `alta` (high), `media` (medium: check it), `sin coincidencia` (no match), `manual` | |
| **G** | Corrected title | `Leaves of Grass` |
| **H** | Corrected authors, separated by `;` | `Walt Whitman` |
| **I** | Corrected year | `1855` |
| **J** | Cover (step 11) | `9780140421996`, an image link, a Drive link or `none` |
| **K** | Hide the work: `yes` | `yes` |
| **L** | Your notes (not published) | |
| **M** | Publisher, for citations | `Penguin` |
| **N** | City, for citations | `London` |

Tips:

- Use the filter on row 1 to see `media` or `sin coincidencia` works first.
- If you do not want to wait for the night, run `actualizarCatalogo` and reload
  the web app.
- Corrections for works no longer in Drive are kept at the bottom as "(no
  longer in Drive)", in case the file comes back.

## 11. Covers

Each work shows, in this order: the cover you put in column **J**, the one Open
Library found or, if there is none, a typographic cover generated from the
title and author.

**Take covers from the files themselves.** Run `portadasDesdeArchivos`
("covers from files"). For each work without a cover it takes the first page of
the PDF (via the Drive thumbnail) or the cover embedded in the EPUB, MOBI or
AZW3, saves it in your `Covers` folder and pastes its link in column J. It
reschedules itself when there are many and updates the catalog at the end. It
never touches a row that already has something in J.

- `forzarPortadas` ("force covers") does the same but also replaces Open
  Library covers (which are sometimes from another edition).
- To limit it to some collections, in `config.gs`:

  ```js
  const COLECCIONES_PORTADAS = ['Literature', 'History'];
  ```

- If the first page is blank, the *Status* tab (row 4) tells you.

**Cover by hand (column J):**

- An **ISBN** (`9780140421996`): uses Open Library's cover for that edition.
- An **image link** starting with `https://`.
- A **Drive link** to an image (upload the image to `Covers`, right-click →
  **Share → Copy link**). The web app downloads it with the reader's
  permission, so it must be inside the shared folder.
- `none`: use the generated cover.

**Very large or scanned files.** Drive gives no thumbnail for very heavy files
and Apps Script does not download more than 50 MB. For those, put a title, the
file ID and its format in `OBRAS_CANDIDATAS` (in `config.gs`):

```js
const OBRAS_CANDIDATAS = [
  ['My scanned book', '1AbC…xyz', 'pdf'],
];
```

and run `candidatasPortadas` ("cover candidates"): it saves up to six images of
each in `Covers/_Candidatas` so you can pick one and paste its link in J. For a
PDF whose cover is at the end, use `OBRAS_ARCHIVO_COMPLETO` and
`candidatasArchivoCompleto` (one work per run).

> A file's ID is in its link: `https://drive.google.com/file/d/ID/view`.

## 12. Authors' countries and the map

The **Map** view groups works by the first author's country.

- `buscarPaises` ("find countries") schedules itself after `actualizarCatalogo`
  when there are new authors. It queries Wikidata and fills the *Authors* tab.
- **Confidence** column (internal values, kept in Spanish): `alta` (high);
  `revisar` (check: namesakes, or inferred from the birthplace; shown as a
  hollow dot on the map); `sin dato` (no data); `colectivo` (collective:
  various authors, anonymous).
- To correct it, write a name or two-letter code in **Corrected country** (H):
  `Spain`, `ES`, `España`. `none` removes the country. Column I is an optional
  second country.
- If Wikidata rate-limits the queries, the script waits 15 minutes and goes on;
  if it does not progress, the next night picks it up.

## 13. Duplicates, junk and folder reorganization

All of this is **optional**, and every step first writes a plan to the sheet
for you to review: nothing is moved or deleted until you run the next step.
Anything sent to the trash can be recovered from the Drive trash for 30 days.

**Junk files** (`.DS_Store`, `._something`, `Thumbs.db`, `desktop.ini`, left by
macOS and Windows when uploading folders):

1. Run `iniciarInventario` (if you have not) and then `revisarBasura` ("review
   junk"): it lists in the *Junk* tab what would be sent to the trash.
2. Check it and run `limpiarBasura` ("clean junk").

**Reorganize folders and set duplicates aside:**

1. In `config.gs`, adjust `MAPA_CARPETAS`: which folder goes where. The key is
   the normalized name (no leading number, no accents, lowercase):

   ```js
   const MAPA_CARPETAS = {
     'novel': 'Literature/Novels',
     'novels': 'Literature/Novels',
     'poetry': 'Literature/Poetry',
   };
   ```

2. Run `planearReorganizacion` ("plan reorganization"). The *Reorganization*
   tab lists each file that would move, with its destination (column D,
   **editable**) and the reason. **Identical copies** (same work, same format,
   same size) go to `_Duplicados`; loose files in the root go to "To sort".
3. Fix destinations in column D (or clear them to leave that file alone) and
   run `aplicarReorganizacion` ("apply reorganization"). It reschedules itself
   when there are many.
4. Check the `_Duplicados` folder in Drive. If everything looks right, run
   `duplicadosAPapelera` ("duplicates to trash").
5. Run `limpiarCarpetasVacias` ("clean empty folders") to send folders left
   empty to the trash.

Moving does not change file IDs: the catalog, reading progress, notes and
corrections keep working.

## 14. My Backpack and notes

**My Backpack** is each person's reading list: up to **30 texts**, each kept
for **30 days** (renewable from its card). Add from the card (**+ My
Backpack**) or with **Select** for several works at once.

**Notes:** inside the reader, select a passage to **Highlight**, **Underline**
or write a **Note**. The notes button (top right) opens the list; from there you
can jump to each mark, **Download (.md)** or **Copy all** to take them to your
working document.

**Where they are stored:**

- Always in that person's browser.
- If the person clicks **Save to my Google account**, the app asks for the
  `drive.appdata` permission and saves a copy in the **app's private folder
  inside that person's Drive**: nobody else sees it, not even the library's
  administrator, and it shows up on any device they sign in from. That folder is
  not visible in Drive; it takes a few KB.
- **Reading progress** ("Keep reading · 37 %") is stored in each browser.
- **Signing out** deletes the book copies saved on the device for faster
  opening.

## 15. Reading, citing and Gemini Notebook

- **PDF reader** (pdf.js): single page, two pages or manual fit with zoom;
  selectable text; go to a page. It only downloads the pages it shows.
- **EPUB, MOBI, AZW3 and FB2 reader** (foliate-js): paginated, table of
  contents and font size. Opened books are saved on the device (up to 40 MB per
  file, 300 MB in total, 30 days) to open faster next time.
- Other formats open in the Google Drive viewer.
- **Cite:** the card builds the reference in APA 7, Chicago, MLA 9, Harvard,
  Vancouver and IEEE, following the interface language's conventions. Publisher
  and city come from columns M and N of *Corrections* or are typed on the card
  (on that device only); **Copy for the sheet** gets them ready to paste into
  column M.
- **Take to Gemini Notebook:** PDFs are added in Gemini Notebook via *Add source
  → Google Drive* (the panel copies the title so you can search for it); EPUBs
  and others are converted to text (.md) in the browser so you can upload them.
  Nothing goes through another server.

## 16. Maintenance and updates

- **Add books:** upload them to Drive. They show up the next night (or run
  `actualizarCatalogo`).
- **Change the name or initial language:** edit `web/.env`, `git commit` and
  `git push`.
- **Bring this project's improvements into your copy:** if you used *Fork*,
  click **Sync fork** on GitHub. If you used *Use this template*, add this
  repository as a remote and merge:

  ```bash
  git remote add original https://github.com/ORIGINAL_USER/arma-tu-biblioteca-digital.git
  git fetch original
  git merge original/main
  ```

  If the Apps Script files changed, paste `inventario.gs` and `catalogo.gs`
  again (your `config.gs` stays the same).
- **Add another interface language:** copy the `en` block in
  `web/src/textos.jsx`, translate it and add it to `TEXTOS`.
- **Catalog format:** see [catalog-format.md](catalog-format.md).

## 17. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Error 400: redirect_uri_mismatch` or `origin_mismatch` when signing in | The site's exact address is not in **Authorized JavaScript origins** (steps 6.4 and 8.5). No trailing slash; `http` locally, `https` on Vercel. |
| `Error 403: access_denied` | That account is not in **Test users** (step 9.1). |
| "Your account doesn't have access to the folder yet…" | The root folder is not shared with that account (step 9.2), or the catalog does not exist yet: run `actualizarCatalogo`. |
| "The account … is not invited" | Missing from `VITE_ALLOWED` (step 9.3), or you changed `VITE_INVITE_SALT` after inviting. Run `npm run permitir -- add …` again and publish. |
| "The browser blocked the Google window" | Allow pop-ups for your site. |
| In Apps Script: "ROOT_ID is not set…" | Paste the IDs in `config.gs` and save. |
| In Apps Script: "Exceeded maximum execution time" | Normal with large libraries: long processes continue on their own or on the next run. |
| A work has an odd title or author | Fix it in *Corrections* (step 10). |
| Wrong cover | Put an ISBN, a link or `none` in column J. |
| The published site does not change | Check in Vercel → *Deployments* that the last `git push` was published; on a phone, close and reopen the app. |
| `npm: command not found` | Install Node.js (step 1) and open a new terminal. |
