// Administra la lista de correos invitados (VITE_ALLOWED en web/.env).
// Se guardan huellas SHA-256, no los correos: el JavaScript publicado es
// visible para cualquiera y no debe exponer a quién se invitó.
//
// Manages the list of invited emails (VITE_ALLOWED in web/.env). Only SHA-256
// fingerprints are stored, never the emails themselves.
//
//   npm run permitir -- agregar persona@gmail.com    (add)
//   npm run permitir -- quitar persona@gmail.com     (remove)
//   npm run permitir -- revisar persona@gmail.com    (check)
//
// Después / then: git commit + git push para que Vercel publique la lista nueva
// (o copia el valor de VITE_ALLOWED a las variables de entorno de Vercel).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ARCHIVO = new URL('../.env', import.meta.url);
const CLAVE = 'VITE_ALLOWED';

const lineas = existsSync(ARCHIVO) ? readFileSync(ARCHIVO, 'utf8').split('\n').filter(Boolean) : [];
const valor = (clave) => lineas.find((l) => l.startsWith(`${clave}=`))?.slice(clave.length + 1).trim() || '';

// Debe coincidir con huella() de src/google.js y con VITE_INVITE_SALT
const SAL = valor('VITE_INVITE_SALT') || 'arma-tu-biblioteca';
const huella = (correo) => createHash('sha256').update(`${SAL}:${correo.trim().toLowerCase()}`).digest('hex');

const ACCIONES = { agregar: 'agregar', add: 'agregar', quitar: 'quitar', remove: 'quitar', revisar: 'revisar', check: 'revisar' };
const [pedida, correo] = process.argv.slice(2);
const accion = ACCIONES[pedida];
if (!accion || !correo?.includes('@')) {
  console.error('Uso / usage: npm run permitir -- agregar|quitar|revisar persona@gmail.com');
  process.exit(1);
}

const lista = new Set(valor(CLAVE).split(',').filter(Boolean));
const h = huella(correo);

if (accion === 'revisar') {
  console.log(lista.has(h) ? `${correo}: invitado / invited.` : `${correo}: no invitado / not invited.`);
  process.exit(0);
}

if (accion === 'agregar') lista.add(h);
else lista.delete(h);

const nueva = `${CLAVE}=${[...lista].join(',')}`;
const resto = lineas.filter((l) => !l.startsWith(`${CLAVE}=`));
writeFileSync(ARCHIVO, [...resto, nueva].join('\n') + '\n');
console.log(`${accion === 'agregar' ? 'Agregado / added' : 'Quitado / removed'}: ${correo}. Invitados / invited: ${lista.size}.`);
if (!lista.size) console.log('Lista vacía: entra cualquier usuario de prueba de Google Cloud. / Empty list: any Google Cloud test user can sign in.');
