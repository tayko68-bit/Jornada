let intervalId = null;
let scriptUrl = '';
let usuario = '';

const enviarUbicacion = () => {
  // Pide permiso para acceder a la geolocalización
  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      const { latitude, longitude } = posicion.coords;
      console.log(`[SW] Ubicación obtenida: ${latitude}, ${longitude}`);
      
      // Usa fetch para enviar los datos en segundo plano
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors', // Esencial para peticiones simples a Apps Script desde un SW
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          accion: 'registrar_gps',
          usuario: usuario,
          lat: latitude,
          lon: longitude
        })
      }).then(() => {
        console.log('[SW] Ubicación enviada al servidor.');
      }).catch(error => {
        console.error('[SW] Error al enviar ubicación:', error);
      });
    },
    (error) => {
      console.error('[SW] Error al obtener GPS:', error.message);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
};

// Escucha las órdenes de la página principal
self.addEventListener('message', event => {
  if (event.data.action === 'startGps') {
    if (intervalId) {
      console.log('[SW] El seguimiento ya estaba activo.');
      return;
    }
    scriptUrl = event.data.url;
    usuario = event.data.usuario;
    const intervalo = event.data.intervalo;

    console.log(`[SW] Orden recibida: Iniciar GPS cada ${intervalo / 60000} minutos.`);
    enviarUbicacion(); // Enviamos una ubicación justo al iniciar
    intervalId = setInterval(enviarUbicacion, intervalo);

  } else if (event.data.action === 'stopGps') {
    if (intervalId) {
      console.log('[SW] Orden recibida: Detener GPS.');
      clearInterval(intervalId);
      intervalId = null;
    }
  }
});

// Código estándar para que el Service Worker se active rápidamente
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
