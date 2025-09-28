// sw.js - Versión Robusta

let intervalId = null;
let scriptUrl = '';
let usuario = '';

// Función que se ejecuta periódicamente para obtener y enviar la ubicación
const enviarUbicacion = () => {
  console.log('[SW] Intentando obtener ubicación...');
  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      const { latitude, longitude } = posicion.coords;
      console.log(`[SW] Ubicación obtenida: ${latitude}, ${longitude}`);
      
      // Usa fetch para enviar los datos en segundo plano
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
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
      console.error('[SW] Error crítico al obtener GPS:', error.message);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
};

// Listener para recibir órdenes desde la página principal
self.addEventListener('message', event => {
  console.log('[SW] Mensaje recibido desde la página:', event.data.action);
  if (event.data.action === 'startGps') {
    if (intervalId) {
      console.log('[SW] El seguimiento ya estaba activo. Reiniciando por si acaso.');
      clearInterval(intervalId);
    }
    scriptUrl = event.data.url;
    usuario = event.data.usuario;
    const intervalo = event.data.intervalo || 600000; // 10 mins por defecto

    console.log(`[SW] Orden recibida: Iniciar GPS para '${usuario}' cada ${intervalo / 60000} minutos.`);
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
  console.log('[SW] Instalando...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(self.clients.claim());
});
