import { useEffect } from 'react';
import { DESTACADO, NOMBRE } from './config.js';
import { IDIOMAS, cambiarIdioma, idiomaActual, t } from './textos.jsx';

// Nombre de la biblioteca (VITE_LIBRARY_NAME y VITE_LIBRARY_ACCENT). Sin nombre
// configurado se usa «Mi biblioteca» / «My library», según el idioma.
export const nombreBiblioteca = () => [NOMBRE || t('marca.nombre'), DESTACADO].filter(Boolean).join(' ');

export default function Marca() {
  const nombre = NOMBRE || t('marca.nombre');
  useEffect(() => { document.title = nombreBiblioteca(); });
  return <>{nombre}{DESTACADO && <> <span>{DESTACADO}</span></>}</>;
}

// Botón que pasa al otro idioma. Con más de dos idiomas, recorre la lista.
export function SelectorIdioma() {
  const siguiente = IDIOMAS[(IDIOMAS.indexOf(idiomaActual()) + 1) % IDIOMAS.length];
  return (
    <button
      className="boton-icono selector-idioma"
      onClick={() => cambiarIdioma(siguiente)}
      aria-label={t('idioma.cambiar')}
      title={t('idioma.cambiar')}
      lang={siguiente}
    >
      {t('idioma.corto')}
    </button>
  );
}
