// sw.js - Service Worker con debugging mejorado

let intervalId = null;
let scriptUrl = '';
let usuario = '';
let esperandoUbicacion = false;
let ultimoHeartbeat = Date.now();
let pageHidden = false;
let ubicacionesEnviadas = 0;
let comunicacionActiva = true;

// Configuración
const BASE_PATH = '/Jornada/';
const SYNC_TAG = 'gps-sync';

console.log('[SW] Service Worker iniciado');

// Función para registrar debug
const logDebug = (mensaje) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[SW ${timestamp}] ${mensaje}`);
};

// Función robusta para verificar comunicación con la página
const verificarComunicacion = () => {
    return new Promise((resolve) => {
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            if (clients.length === 0) {
                logDebug("❌ No hay clientes disponibles");
                comunicacionActiva = false;
                resolve(false);
                return;
            }
            
            // Enviar ping a todos los clientes
            let respuestasRecibidas = 0;
            const totalClientes = clients.length;
            
            const timeoutId = setTimeout(() => {
                if (respuestasRecibidas === 0) {
                    logDebug("❌ Timeout verificando comunicación");
                    comunicacionActiva = false;
                    resolve(false);
                }
            }, 5000);
            
            clients.forEach(client => {
                client.postMessage({
                    action: 'ping',
                    timestamp: Date.now()
                });
            });
            
            // La respuesta se maneja en el listener de mensajes
            resolve(true);
        });
    });
};

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
        cache.put(`pending-${Date.now()}`, new Response(JSON.stringify(data)));
        logDebug(`📦 Ubicación almacenada para reintento`);
    }).catch(err => {
        logDebug(`❌ Error almacenando ubicación: ${err.message}`);
    });
};

// Función para procesar ubicaciones pendientes
const procesarUbicacionesPendientes = async () => {
    try {
        const cache = await caches.open('gps-cache-v1');
        const keys = await cache.keys();
        const pendingKeys = keys.filter(key => key.url.includes('pending-'));
        
        logDebug(`📤 Procesando ${pendingKeys.length} ubicaciones pendientes`);
        
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
                logDebug(`✅ Ubicación pendiente enviada`);
            } catch (error) {
                logDebug(`❌ Error procesando ubicación pendiente: ${error.message}`);
            }
        }
    } catch (error) {
        logDebug(`❌ Error accediendo a cache: ${error.message}`);
    }
};

// Función principal para solicitar ubicación
const solicitarUbicacion = async () => {
    if (esperandoUbicacion) {
        logDebug("⏳ Ya esperando ubicación...");
        return;
    }
    
    logDebug("📍 Solicitando nueva ubicación...");
    esperandoUbicacion = true;
    
    // Verificar comunicación primero
    const comunicacionOk = await verificarComunicacion();
    if (!comunicacionOk) {
        logDebug("❌ Comunicación perdida con la página");
        esperandoUbicacion = false;
        return;
    }
    
    // Timeout para la solicitud
    const timeoutId = setTimeout(() => {
        logDebug("⏰ Timeout esperando ubicación");
        esperandoUbicacion = false;
    }, 25000);
    
    try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        
        if (clients.length > 0) {
            clients.forEach(client => {
                client.postMessage({
                    action: 'requestLocation',
                    timeoutId: timeoutId,
                    timestamp: Date.now()
                });
            });
            logDebug(`📤 Solicitud enviada a ${clients.length} clientes`);
        } else {
            clearTimeout(timeoutId);
            esperandoUbicacion = false;
            logDebug("❌ No hay clientes para solicitar ubicación");
        }
    } catch (error) {
        clearTimeout(timeoutId);
        esperandoUbicacion = false;
        logDebug(`❌ Error solicitando ubicación: ${error.message}`);
    }
};

// Función para enviar ubicación al servidor
const enviarUbicacionAlServidor = async (lat, lon) => {
    logDebug(`🌍 Enviando ubicación: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    
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
                pageHidden: pageHidden,
                secuencia: ++ubicacionesEnviadas
            })
        });
        
        logDebug(`✅ Ubicación #${ubicacionesEnviadas} enviada exitosamente`);
        esperandoUbicacion = false;
        
        // Notificar éxito a los clientes
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                action: 'gpsStatus',
                active: true,
                lastSent: Date.now(),
                secuencia: ubicacionesEnviadas
            });
        });
        
    } catch (error) {
        logDebug(`❌ Error enviando ubicación: ${error.message}`);
        // Almacenar para reintento
        await almacenarUbicacionPendiente(lat, lon);
        esperandoUbicacion = false;
    }
};

// Función de mantenimiento
const verificarEstado = () => {
    const tiempoSinHeartbeat = Date.now() - ultimoHeartbeat;
    
    if (tiempoSinHeartbeat > 60000) { // 1 minuto sin heartbeat
        logDebug(`⚠️ Sin heartbeat por ${Math.round(tiempoSinHeartbeat/1000)}s`);
    }
    
    // Procesar ubicaciones pendientes
    procesarUbicacionesPendientes();
    
    // Verificar comunicación si hace mucho que no hay heartbeat
    if (tiempoSinHeartbeat > 120000) { // 2 minutos
        verificarComunicacion();
    }
};

// Listener principal para mensajes
self.addEventListener('message', event => {
    const { action, ...data } = event.data;
    logDebug(`📨 Mensaje recibido: ${action}`);
    
    switch (action) {
        case 'startGps':
            if (intervalId) {
                logDebug("🔄 Reiniciando GPS...");
                clearInterval(intervalId);
            }
            
            scriptUrl = data.url;
            usuario = data.usuario;
            const intervalo = data.intervalo || 60000;
            ultimoHeartbeat = Date.now();
            ubicacionesEnviadas = 0;
            comunicacionActiva = true;

            logDebug(`🚀 GPS iniciado para '${usuario}' cada ${intervalo/1000}s`);
            
            // Primera ubicación inmediata
            setTimeout(() => solicitarUbicacion(), 1000);
            
            // Intervalo principal
            intervalId = setInterval(solicitarUbicacion, intervalo);
            
            // Intervalo de mantenimiento cada minuto
            setInterval(verificarEstado, 60000);
            break;

        case 'stopGps':
            if (intervalId) {
                logDebug("🛑 Deteniendo GPS...");
                clearInterval(intervalId);
                intervalId = null;
                esperandoUbicacion = false;
                ubicacionesEnviadas = 0;
                
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
                logDebug(`📍 Ubicación recibida: ${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`);
                enviarUbicacionAlServidor(data.lat, data.lon);
            } else {
                logDebug("⚠️ Ubicación recibida pero no esperada");
            }
            break;

        case 'locationError':
            logDebug(`❌ Error de ubicación: ${data.error}`);
            esperandoUbicacion = false;
            break;

        case 'heartbeat':
            ultimoHeartbeat = data.timestamp;
            logDebug("💓 Heartbeat recibido");
            comunicacionActiva = true;
            break;

        case 'pageHidden':
            pageHidden = true;
            logDebug("🙈 Página oculta");
            break;

        case 'pageVisible':
            pageHidden = false;
            logDebug("👁️ Página visible");
            break;

        case 'pong':
            logDebug("🏓 Pong recibido - Comunicación OK");
            comunicacionActiva = true;
            break;

        case 'test':
            logDebug("🧪 Test de comunicación OK");
            break;

        default:
            logDebug(`❓ Acción desconocida: ${action}`);
    }
});

// Background Sync
self.addEventListener('sync', event => {
    if (event.tag === SYNC_TAG) {
        logDebug("🔄 Background Sync activado");
        event.waitUntil(procesarUbicacionesPendientes());
    }
});

// Fetch interceptor
self.addEventListener('fetch', event => {
    if (event.request.url.includes('script.google.com')) {
        event.respondWith(
            fetch(event.request).catch(error => {
                logDebug(`❌ Request falló: ${error.message}`);
                return new Response('{"status":"queued"}', {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
    }
});

// Instalación y activación
self.addEventListener('install', () => {
    logDebug("📦 Instalando Service Worker...");
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    logDebug("⚡ Activando Service Worker...");
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            self.registration.sync.register(SYNC_TAG).catch(err => {
                logDebug(`❌ Background Sync no disponible: ${err.message}`);
            })
        ])
    );
});
