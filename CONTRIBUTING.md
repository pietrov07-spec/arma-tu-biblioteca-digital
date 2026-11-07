# Cómo contribuir · How to contribute

**[Español](#español) · [English](#english)**

## Español

¡Gracias por tu interés! Toda ayuda cuenta: reportar un error, mejorar la guía,
traducir la interfaz a otro idioma o proponer una función.

### Antes de empezar

- Busca en los [issues](../../issues) si alguien ya reportó o propuso lo mismo.
- Para preguntas o ideas abiertas, usa [Discussions](../../discussions).
- **Nunca subas libros, catálogos reales, IDs de Drive, correos ni tu `web/.env`**
  en issues ni en pull requests. Para mostrar un problema, usa el modo
  demostración o datos inventados.

### Preparar tu entorno

```bash
git clone https://github.com/pietrov07-spec/arma-tu-biblioteca-digital.git
cd arma-tu-biblioteca-digital/web
npm install
npm run dev
```

Sin `VITE_GOOGLE_CLIENT_ID` la app arranca en modo demostración, sin Google.
Antes de abrir un pull request, comprueba que compila:

```bash
npm run build
```

### Convenciones

- El código y los comentarios están en español; los nombres de variables y
  funciones también. Mantén ese estilo.
- Todo texto visible va en `web/src/textos.jsx`, en **los dos idiomas** (`es` y
  `en`). No escribas textos directamente en los componentes.
- Lo que cambia de una biblioteca a otra va en configuración (`web/.env` o
  `apps-script/config.gs`), nunca en el código.
- Si cambias cómo se usa algo, actualiza la guía en `docs/es/guia.md` **y**
  `docs/en/guide.md`.
- Pull requests pequeños y con una sola idea se revisan más rápido.

### Agregar un idioma a la interfaz

Copia el bloque `en` de `web/src/textos.jsx`, tradúcelo, agrégalo a `TEXTOS` y
abre un pull request. ¡Es una gran primera contribución!

---

## English

Thanks for your interest! Every bit helps: reporting a bug, improving the
guide, translating the interface into another language or proposing a feature.

### Before you start

- Search the [issues](../../issues) in case someone already reported or proposed it.
- For questions or open-ended ideas, use [Discussions](../../discussions).
- **Never upload books, real catalogs, Drive IDs, emails or your `web/.env`**
  to issues or pull requests. To show a problem, use demo mode or made-up data.

### Set up your environment

```bash
git clone https://github.com/pietrov07-spec/arma-tu-biblioteca-digital.git
cd arma-tu-biblioteca-digital/web
npm install
npm run dev
```

Without `VITE_GOOGLE_CLIENT_ID` the app starts in demo mode, with no Google.
Before opening a pull request, check that it builds:

```bash
npm run build
```

### Conventions

- Code and comments are in Spanish, and so are variable and function names.
  Please keep that style.
- Every visible string lives in `web/src/textos.jsx`, in **both languages**
  (`es` and `en`). Do not hard-code text in components.
- Anything that changes from one library to another goes into configuration
  (`web/.env` or `apps-script/config.gs`), never into the code.
- If you change how something is used, update the guide in `docs/es/guia.md`
  **and** `docs/en/guide.md`.
- Small pull requests with a single idea get reviewed faster.

### Add an interface language

Copy the `en` block in `web/src/textos.jsx`, translate it, add it to `TEXTOS`
and open a pull request. It is a great first contribution!
