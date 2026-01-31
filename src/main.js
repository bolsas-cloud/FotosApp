/**
 * Punto de entrada de FotosApp
 */

import { router } from './router.js';
import { APP_CONFIG } from './config.js';

// Inicialización de la app
document.addEventListener('DOMContentLoaded', async () => {
    console.log(`🚀 ${APP_CONFIG.nombre} v${APP_CONFIG.version} iniciando...`);

    try {
        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./service-worker.js');
                console.log('✅ Service Worker registrado');
            } catch (error) {
                console.warn('⚠️ Service Worker no pudo registrarse:', error);
            }
        }

        // Navegar a la ruta inicial
        router.navegar('editor');

        console.log(`✅ ${APP_CONFIG.nombre} iniciado correctamente`);
    } catch (error) {
        console.error('❌ Error al iniciar la app:', error);
        document.getElementById('app-content').innerHTML = `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                </div>
                <h2 class="text-xl font-semibold text-gray-900">Error al iniciar</h2>
                <p class="text-gray-500 mt-2">${error.message}</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark">
                    Reintentar
                </button>
            </div>
        `;
    }
});

// Exponer versión en consola
window.FOTOS_APP_VERSION = APP_CONFIG.version;
