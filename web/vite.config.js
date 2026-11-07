import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const ruta = (p) => fileURLToPath(new URL(p, import.meta.url));

// En local (`npm run dev`) el catálogo se sirve sin pasar por public/, para que
// nunca acabe dentro de dist/ ni del sitio publicado:
//   1. web/local/<VITE_CATALOG_FILE>, si copiaste ahí tu propio catálogo;
//   2. si no, el catálogo de demostración de web/demo/.
// Los archivos de ejemplo (dominio público) se sirven en /demo/archivos/.
const datosLocales = (env) => ({
  name: 'datos-locales',
  apply: 'serve',
  configureServer(server) {
    const propio = ruta(`local/${env.VITE_CATALOG_FILE || 'biblioteca-catalogo.json'}`);
    const demo = ruta('demo/catalogo-demo.json');
    server.middlewares.use('/catalogo.json', (_, res) => {
      const archivo = existsSync(propio) ? propio : demo;
      if (!existsSync(archivo)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      res.end(readFileSync(archivo));
    });
    server.middlewares.use('/demo/archivos/', (req, res) => {
      // basename: nada de "../" para salir de la carpeta
      const archivo = ruta(`demo/archivos/${basename(decodeURIComponent(req.url.split('?')[0]))}`);
      if (!existsSync(archivo)) { res.statusCode = 404; return res.end(); }
      res.end(readFileSync(archivo));
    });
  },
});

// Demo publicada: si se construye sin ID de cliente (modo demostración), el
// catálogo y los archivos de ejemplo de web/demo/ (dominio público) se copian
// a dist/ para que la demo funcione en Vercel. Nunca copia web/local/: tu
// catálogo propio no sale de tu computadora. Con ID de cliente no copia nada.
const demoPublicada = (env) => ({
  name: 'demo-publicada',
  apply: 'build',
  generateBundle() {
    if ((env.VITE_GOOGLE_CLIENT_ID || '').trim()) return;
    const catalogo = ruta('demo/catalogo-demo.json');
    if (!existsSync(catalogo)) return;
    this.emitFile({ type: 'asset', fileName: 'catalogo.json', source: readFileSync(catalogo) });
    for (const nombre of readdirSync(ruta('demo/archivos'))) {
      this.emitFile({ type: 'asset', fileName: `demo/archivos/${nombre}`, source: readFileSync(ruta(`demo/archivos/${nombre}`)) });
    }
  },
});

// Los libros EPUB pueden traer JavaScript; foliate-js pide bloquear todo script
// que no sea de la propia app. En desarrollo no se aplica porque Vite
// inyecta scripts en línea.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self' data: blob:",
  // Portadas a mano: cualquier imagen https (las de Drive llegan como blob:)
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/",
  "frame-src 'self' blob: https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const politica = {
  name: 'politica-seguridad',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// El título de la pestaña antes de que cargue la app
const titulo = (env) => ({
  name: 'titulo',
  transformIndexHtml: (html) => {
    const nombre = [env.VITE_LIBRARY_NAME, env.VITE_LIBRARY_ACCENT].filter(Boolean).join(' ').trim() || 'Biblioteca';
    const seguro = nombre.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return html.replace('<title>Biblioteca</title>', `<title>${seguro}</title>`);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ruta('.'));
  return {
    plugins: [react(), datosLocales(env), demoPublicada(env), politica, titulo(env)],
    server: { port: 5173, strictPort: true },
  };
});
