// sw.js - Versión Simple y Confiable

let gpsTimer = null;
let scriptUrl = '';
let usuario = '';
let secuencia = 0;

console.log('[SW] Service Worker GPS Simple iniciado');

// Función para solicitar ubicación a la página
const solicitarUbicacion = () => {
    console.log('[SW] Solicitando ubicación...');
    
    self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) {
            clients[0].postMessage({ action: 'requestLocation' });
        }
    });
};

// Función para enviar ubicación al servidor
const enviarUbicacion = async (lat, lon) => {
    secuencia++;
    
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
                secuencia: secuencia,
                origen: 'service-worker'
            })
        });
        
        console.log(`[SW] Ubicación ${secuencia} enviada: ${lat}, ${lon}`);
        
        // Notificar éxito a la página
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    action: 'ubicacionEnviada',
                    secuencia: secuencia
                });
            });
        });
        
    } catch (error) {
        console.error('[SW] Error enviando ubicación:', error);
    }
};

// Listener de mensajes
self.addEventListener('message', event => {
    const { action } = event.data;
    
    switch (action) {
        case 'startGps':
            console.log('[SW] Iniciando GPS automático...');
            
            if (gpsTimer) {
                clearInterval(gpsTimer);
            }
            
            scriptUrl = event.data.url;
            usuario = event.data.usuario;
            secuencia = 0;
            
            // Primera ubicación inmediata
            setTimeout(solicitarUbicacion, 2000);
            
            // Ubicaciones cada minuto
            gpsTimer = setInterval(solicitarUbicacion, event.data.intervalo || 60000);
            break;
            
        case 'stopGps':
            console.log('[SW] Deteniendo GPS automático...');
            
            if (gpsTimer) {
                clearInterval(gpsTimer);
                gpsTimer = null;
            }
            secuencia = 0;
            break;
            
        case 'locationResponse':
            if (gpsTimer) { // Solo procesar si GPS está activo
                enviarUbicacion(event.data.lat, event.data.lon);
            }
            break;
            
        case 'ubicacionEnviada':
            // La página nos informa que envió una ubicación directamente
            secuencia = Math.max(secuencia, event.data.secuencia);
            break;
    }
});

// Instalación y activación
self.addEventListener('install', () => {
    console.log('[SW] Instalando...');
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Activando...');
    event.waitUntil(self.clients.claim());
});
