// sw.js - Versión Corregida

let intervalId = null;
let scriptUrl = '';
let usuario = '';
let esperandoUbicacion = false;

// Función que solicita ubicación a la página principal
const solicitarUbicacion = () => {
  if (esperandoUbicacion) {
    console.log('[SW] Ya estamos esperando una ubicación...');
    return;
  }
  
  console.log('[SW] Solicitando ubicación a la página principal...');
  esperandoUbicacion = true;
  
  // Enviar mensaje a la página pidiendo ubicación
  self.clients.matchAll().then(clients => {
    if (clients.length > 0) {
      clients[0].postMessage({
        action: 'requestLocation'
      });
    } else {
      console.error('[SW] No hay clientes disponibles para solicitar ubicación');
      esperandoUbicacion = false;
    }
  });
};

// Función para enviar ubicación al servidor
const enviarUbicacionAlServidor = (lat, lon) => {
  console.log(`[SW] Enviando ubicación al servidor: ${lat}, ${lon}`);
  
  fetch(scriptUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      accion: 'registrar_gps',
      usuario: usuario,
      lat: lat,
      lon: lon
    })
  }).then(() => {
    console.log('[SW] Ubicación enviada al servidor exitosamente.');
    esperandoUbicacion = false;
  }).catch(error => {
    console.error('[SW] Error al enviar ubicación:', error);
    esperandoUbicacion = false;
  });
};

// Listener para recibir órdenes desde la página principal
self.addEventListener('message', event => {
  console.log('[SW] Mensaje recibido:', event.data.action);
  
  if (event.data.action === 'startGps') {
    if (intervalId) {
      console.log('[SW] El seguimiento ya estaba activo. Reiniciando...');
      clearInterval(intervalId);
    }
    
    scriptUrl = event.data.url;
    usuario = event.data.usuario;
    const intervalo = event.data.intervalo || 600000; // 10 mins por defecto

    console.log(`[SW] Iniciando GPS para '${usuario}' cada ${intervalo / 60000} minutos.`);
    
    // Solicitar ubicación inmediatamente
    solicitarUbicacion();
    
    // Configurar intervalo para solicitar ubicación periódicamente
    intervalId = setInterval(solicitarUbicacion, intervalo);

  } else if (event.data.action === 'stopGps') {
    if (intervalId) {
      console.log('[SW] Deteniendo seguimiento GPS.');
      clearInterval(intervalId);
      intervalId = null;
      esperandoUbicacion = false;
    }
    
  } else if (event.data.action === 'locationResponse') {
    // Recibimos la ubicación desde la página principal
    if (esperandoUbicacion) {
      console.log(`[SW] Ubicación recibida: ${event.data.lat}, ${event.data.lon}`);
      enviarUbicacionAlServidor(event.data.lat, event.data.lon);
    }
    
  } else if (event.data.action === 'locationError') {
    console.error('[SW] Error al obtener ubicación:', event.data.error);
    esperandoUbicacion = false;
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
