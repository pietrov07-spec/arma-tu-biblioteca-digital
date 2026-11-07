// Dibuja los íconos de la app (un libro abierto sobre fondo marfil) sin
// dependencias: escribe PNG a mano. Cambia los colores y vuelve a ejecutar:
//   node scripts/crear-iconos.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FONDO = [13, 95, 80];
const TINTA = [242, 245, 241];

const crc = (() => {
  const tabla = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = tabla[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([largo, td, c]);
}

// ¿El punto (x, y), en coordenadas 0–1, cae sobre el dibujo? Dos páginas
// ligeramente curvas que se juntan en el lomo.
function tinta(x, y) {
  const centro = 0.5;
  const ancho = 0.28;
  const arriba = 0.32 + 0.05 * Math.abs(x - centro) / ancho;
  const abajo = 0.70 + 0.05 * Math.abs(x - centro) / ancho;
  const dentro = Math.abs(x - centro) <= ancho && y >= arriba && y <= abajo;
  const borde = 0.022;
  const hueco = Math.abs(x - centro) <= ancho - borde && y >= arriba + borde && y <= abajo - borde && Math.abs(x - centro) > borde / 2;
  return dentro && !hueco;
}

function png(lado) {
  const filas = [];
  const sub = 4; // suavizado
  for (let py = 0; py < lado; py++) {
    const fila = Buffer.alloc(1 + lado * 3);
    for (let px = 0; px < lado; px++) {
      let n = 0;
      for (let i = 0; i < sub; i++) for (let j = 0; j < sub; j++) n += tinta((px + (i + 0.5) / sub) / lado, (py + (j + 0.5) / sub) / lado);
      const a = n / (sub * sub);
      for (let k = 0; k < 3; k++) fila[1 + px * 3 + k] = Math.round(FONDO[k] * (1 - a) + TINTA[k] * a);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', deflateSync(Buffer.concat(filas))), bloque('IEND', Buffer.alloc(0))]);
}

const destino = new URL('../public/iconos/', import.meta.url);
mkdirSync(destino, { recursive: true });
for (const [nombre, lado] of [['icono-32', 32], ['icono-48', 48], ['icono-apple', 180], ['icono-192', 192], ['icono-512', 512]]) {
  writeFileSync(new URL(`${nombre}.png`, destino), png(lado));
}
console.log('Íconos escritos en web/public/iconos/');
