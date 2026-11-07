import { useEffect, useState } from 'react';
import { imagenDrive } from './google.js';
import { autoresTexto, tinta } from './util.js';
import { t } from './textos.jsx';

// Portada de Open Library, de internet o de Drive ("drive:<id>"); si no hay
// (o falla la carga), una portada tipográfica con el título y el autor.
export default function Portada({ obra, grande = false }) {
  const [fallo, setFallo] = useState(false);
  const deDrive = obra.p?.startsWith('drive:');
  const [src, setSrc] = useState(deDrive ? null : obra.p);

  useEffect(() => {
    setFallo(false);
    if (!obra.p?.startsWith('drive:')) { setSrc(obra.p); return; }
    let vigente = true;
    setSrc(null);
    imagenDrive(obra.p.slice(6)).then((url) => vigente && setSrc(url), () => vigente && setFallo(true));
    return () => { vigente = false; };
  }, [obra.p]);

  if (src && !fallo) {
    return (
      <img
        className="portada"
        src={grande ? src.replace('-M.jpg', '-L.jpg') : src}
        // La versión grande tarda: mientras llega se ve la que ya está descargada
        style={grande ? { background: `center / cover url("${src}")` } : undefined}
        alt={t('portada.de', { titulo: obra.t })}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFallo(true)}
        // Open Library responde con una imagen de 1 píxel cuando no tiene la portada
        onLoad={(e) => e.currentTarget.naturalWidth <= 1 && setFallo(true)}
      />
    );
  }

  return (
    <div className="portada portada-generada" style={{ '--tinta': tinta(obra.t) }} role="img" aria-label={t('portada.de', { titulo: obra.t })}>
      <span className="portada-titulo">{obra.t}</span>
      <span className="portada-autor">{autoresTexto(obra.a)}</span>
    </div>
  );
}
