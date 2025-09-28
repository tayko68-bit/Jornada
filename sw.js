// sw.js - Service Worker para GitHub Pages /Jornada/

let intervalId = null;
let scriptUrl = '';
let usuario = '';
let esperandoUbicacion = false;
let ultimoHeartbeat = Date.now();
let pageHidden = false;

// Configuración para GitHub Pages
const BASE_PATH = '/Jornada/';
const SYNC_TAG = 'gps-sync';
const STORAGE_KEY = 'pending-locations';

// Función para almacenar ubicaciones pendientes
const almacenarUbicacionPendiente = (lat, lon) => {
  return caches.open('gps-cache-v1').then(cache => {
    const data = {
      accion: 'registrar_gps',
      usuario: usuario,
      lat: lat,
      lon: lon,
      timestamp: Date.now()
    };
    return cache.put(`pending-${Date.now()}`, new Response(JSON.stringify(data)));
  });
};

// Función para procesar ubicaciones pendientes
const procesarUbicacionesPendientes = async () => {
  try {
    const cache = await caches.open('gps-cache-v1');
    const keys = await cache.keys();
    const pendingKeys = keys.filter(key => key.url.includes('pending-'));
    
    for (const key of pendingKeys) {
      try {
        const response = await cache.match(key);
        const data = await response.json();
        
        await fetch(scriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(data)
        });
        
        await cache.delete(key);
        console.log('[SW] Ubicación pendiente enviada y eliminada');
      } catch (error) {
        console.error('[SW] Error procesando ubicación pendiente:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Error accediendo a cache:', error);
  }
};

// Función robusta para solicitar ubicación
const solicitarUbicacion = () => {
  if (esperandoUbicacion) {
    console.log('[SW] Ya estamos esperando una ubicación...');
    return;
  }
  
  console.log('[SW] Solicitando ubicación...');
  esperandoUbicacion = true;
  
  // Timeout para la solicitud de ubicación
  const timeoutId = setTimeout(() => {
    console.warn('[SW] Timeout esperando ubicación de la página');
    esperandoUbicacion = false;
  }, 30000);
  
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
    if (clients.length > 0) {
      clients.forEach(client => {
        client.postMessage({
          action: 'requestLocation',
          timeoutId: timeoutId
        });
      });
    } else {
      console.error('[SW] No hay clientes disponibles');
      clearTimeout(timeoutId);
      esperandoUbicacion = false;
    }
  });
};

// Función mejorada para enviar ubicación
const enviarUbicacionAlServidor = async (lat, lon) => {
  console.log(`[SW] Enviando ubicación: ${lat}, ${lon}`);
  
  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        accion: 'registrar_gps',
        usuario: usuario,
        lat: lat,
        lon: lon,
        timestamp: Date.now(),
        pageHidden: pageHidden
      })
    });
    
    console.log('[SW] Ubicación enviada exitosamente');
    esperandoUbicacion = false;
    
    // Notificar estado a clientes
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          action: 'gpsStatus',
          active: true,
          lastSent: Date.now()
        });
      });
    });
    
  } catch (error) {
    console.error('[SW] Error enviando ubicación:', error);
    // Almacenar para reintento posterior
    await almacenarUbicacionPendiente(lat, lon);
    esperandoUbicacion = false;
  }
};

// Función de mantenimiento para verificar el estado
const verificarEstado = () => {
  const tiempoSinHeartbeat = Date.now() - ultimoHeartbeat;
  
  if (tiempoSinHeartbeat > 120000) { // 2 minutos sin heartbeat
    console.warn('[SW] Página posiblemente inactiva, pero continuando GPS...');
  }
  
  // Procesar ubicaciones pendientes si hay conectividad
  procesarUbicacionesPendientes();
};

// Listener principal para mensajes
self.addEventListener('message', event => {
  console.log('[SW] Mensaje recibido:', event.data.action);
  
  switch (event.data.action) {
    case 'startGps':
      if (intervalId) {
        console.log('[SW] Reiniciando GPS...');
        clearInterval(intervalId);
      }
      
      scriptUrl = event.data.url;
      usuario = event.data.usuario;
      const intervalo = event.data.intervalo || 60000;
      ultimoHeartbeat = Date.now();

      console.log(`[SW] GPS iniciado para '${usuario}' cada ${intervalo/60000} min`);
      
      // Primera ubicación inmediata
      solicitarUbicacion();
      
      // Intervalo principal
      intervalId = setInterval(solicitarUbicacion, intervalo);
      
      // Intervalo de mantenimiento cada 2 minutos
      setInterval(verificarEstado, 120000);
      break;

    case 'stopGps':
      if (intervalId) {
        console.log('[SW] Deteniendo GPS...');
        clearInterval(intervalId);
        intervalId = null;
        esperandoUbicacion = false;
        
        // Notificar a clientes
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              action: 'gpsStatus',
              active: false
            });
          });
        });
      }
      break;

    case 'locationResponse':
      if (esperandoUbicacion) {
        console.log(`[SW] Ubicación recibida: ${event.data.lat}, ${event.data.lon}`);
        enviarUbicacionAlServidor(event.data.lat, event.data.lon);
      }
      break;

    case 'locationError':
      console.error('[SW] Error de ubicación:', event.data.error);
      esperandoUbicacion = false;
      break;

    case 'heartbeat':
      ultimoHeartbeat = event.data.timestamp;
      console.log('[SW] Heartbeat recibido');
      break;

    case 'pageHidden':
      pageHidden = true;
      console.log('[SW] Página oculta - Modo segundo plano activado');
      break;

    case 'pageVisible':
      pageHidden = false;
      console.log('[SW] Página visible - Modo normal activado');
      break;
  }
});

// Background Sync para recuperación
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background Sync activado');
    event.waitUntil(procesarUbicacionesPendientes());
  }
});

// Push notifications (opcional, para futuras mejoras)
self.addEventListener('push', event => {
  console.log('[SW] Push recibido:', event.data?.text());
});

// Fetch interceptor para manejar requests offline
self.addEventListener('fetch', event => {
  // Solo interceptar requests a la API
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(error => {
        console.error('[SW] Request falló, almacenando para más tarde');
        return new Response('{"status":"queued"}', {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  }
  
  // Manejar requests a archivos del PWA
  if (event.request.url.includes(BASE_PATH)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});

// Instalación y activación
self.addEventListener('install', () => {
  console.log('[SW] Instalando Service Worker...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Registrar para background sync
      self.registration.sync.register(SYNC_TAG).catch(err => {
        console.log('[SW] Background Sync no disponible:', err);
      }),
      // Limpiar caches antiguos si es necesario
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.includes('old-cache')) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});
