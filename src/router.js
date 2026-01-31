/**
 * Router SPA simple para FotosApp
 */

import { moduloEditor } from './modules/editor.js';
import { moduloLote } from './modules/lote.js';

export const router = {
    rutaActual: null,

    /**
     * Navega a una ruta específica
     */
    navegar: async (ruta) => {
        const contenedor = document.getElementById('app-content');
        if (!contenedor) {
            console.error('Contenedor app-content no encontrado');
            return;
        }

        // Limpiar contenedor
        contenedor.innerHTML = '';

        // Actualizar navegación activa
        router.actualizarNavActiva(ruta);

        // Guardar ruta actual
        router.rutaActual = ruta;

        // Renderizar módulo correspondiente
        try {
            switch (ruta) {
                case 'editor':
                    await moduloEditor.render(contenedor);
                    break;
                case 'lote':
                    await moduloLote.render(contenedor);
                    break;
                default:
                    await moduloEditor.render(contenedor);
            }
        } catch (error) {
            console.error('Error al navegar:', error);
            contenedor.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                    </div>
                    <h2 class="text-xl font-semibold text-gray-900">Error al cargar</h2>
                    <p class="text-gray-500 mt-2">${error.message}</p>
                    <button onclick="router.navegar('editor')" class="mt-4 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark">
                        Volver al Editor
                    </button>
                </div>
            `;
        }
    },

    /**
     * Actualiza el estado visual de la navegación
     */
    actualizarNavActiva: (ruta) => {
        // Remover clase activa de todos
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('bg-brand', 'text-white');
            btn.classList.add('text-gray-600', 'hover:bg-gray-100');
        });

        // Agregar clase activa al botón correspondiente
        const btnActivo = document.getElementById(`nav-${ruta}`);
        if (btnActivo) {
            btnActivo.classList.remove('text-gray-600', 'hover:bg-gray-100');
            btnActivo.classList.add('bg-brand', 'text-white');
        }
    }
};

// Exponer globalmente para uso en HTML
window.router = router;
