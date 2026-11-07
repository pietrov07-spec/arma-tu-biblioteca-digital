import { useState } from 'react';
import { iniciarSesion } from './google.js';
import Marca, { SelectorIdioma } from './Marca.jsx';
import { t } from './textos.jsx';

// Lo único que ve alguien sin sesión: ni títulos ni número de obras.
export default function Acceso({ entrar }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  async function pulsar() {
    setOcupado(true);
    setError(null);
    try {
      await iniciarSesion();
      entrar();
    } catch (e) {
      setError(e.message);
      setOcupado(false);
    }
  }

  return (
    <main className="acceso">
      <div className="acceso-idioma"><SelectorIdioma /></div>
      <div className="acceso-caja">
        <h1><Marca /></h1>
        <p>{t('marca.privada')}</p>
        <button className="boton-principal" onClick={pulsar} disabled={ocupado}>
          {ocupado ? t('acceso.esperando') : t('acceso.entrar')}
        </button>
        {error && <p className="acceso-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
