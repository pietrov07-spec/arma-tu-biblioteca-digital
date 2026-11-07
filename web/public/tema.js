// Aplica el tema antes de pintar, para evitar un destello. Marfil es el inicial;
// Claro solo si se eligió. La clave es nueva: las elecciones anteriores ya no cuentan.
// Va en un archivo aparte porque la política de seguridad no permite scripts en línea.
let tema = 'marfil';
try {
  if (localStorage.getItem('tema-elegido') === 'light') tema = 'light';
} catch {}
document.documentElement.dataset.theme = tema;
