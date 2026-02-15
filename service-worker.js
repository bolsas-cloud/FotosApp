/**
 * Service Worker para FotosApp
 * Maneja cache y funcionamiento offline básico
 */

const CACHE_NAME = 'fotos-app-v1';

// Archivos a cachear
const CACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './src/main.js',
    './src/config.js',
    './src/router.js',
    './src/utils.js',
    './src/lib/imageProcessor.js',
    './src/modules/editor.js',
    './src/modules/lote.js',
    './src/modules/mockup.js'
];

// Instalación: cachear assets
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cacheando assets');
                return cache.addAll(CACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Eliminando cache viejo:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: estrategia Network First con fallback a cache
self.addEventListener('fetch', (event) => {
    // Solo cachear requests GET
    if (event.request.method !== 'GET') return;

    // No cachear CDNs externos (siempre buscar online)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es válida, guardar en cache
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, buscar en cache
                return caches.match(event.request);
            })
    );
});
