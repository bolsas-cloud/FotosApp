/**
 * Módulo Lote - Procesamiento masivo de fotos con IA
 * Soporta File System Access API para selección de carpetas
 */

import { APP_CONFIG, COLOR_PRESETS } from '../config.js';
import { mostrarNotificacion, leerArchivoComoDataURL, cargarImagen, descargarArchivo, descargarComoZip, validarArchivo, formatearTamano, generarId, hslToRgb } from '../utils.js';
import { imageProcessor } from '../lib/imageProcessor.js';

// Estado del módulo
let archivosEnCola = [];
let archivoActualIndex = 0;
let procesando = false;
let cancelado = false;
let iaDisponible = true; // Se pone en false si falla la primera llamada a IA
let iaFallbackNotificado = false; // Para mostrar notificación una sola vez

// Handles de File System Access API
let carpetaOrigenHandle = null;
let carpetaDestinoHandle = null;

// Estadísticas
let estadisticas = {
    procesadas: 0,
    descartadas: 0,
    errores: 0
};

// Imagen de referencia para consistencia de tono (persistente en localStorage)
let imagenReferenciaBase64 = localStorage.getItem('fotosapp_imagen_referencia') || null;
let usarImagenReferencia = imagenReferenciaBase64 !== null;

// Configuración de lote
let configLote = {
    modoLote: 'automatico', // 'automatico' o 'asistido'
    usarIA: true,
    hue: 80,
    saturacion: 35,
    colorHex: '#6B8E23',
    toleranciaSaturacion: 30,
    luminosidadMin: 10,
    luminosidadMax: 90,
    calidad: 0.95,
    delayEntreImagenes: 3000 // 3 segundos entre llamadas a IA para evitar rate limiting
};

// Cargar último color usado
const ultimoColor = JSON.parse(localStorage.getItem('fotosapp_ultimo_color') || 'null');
if (ultimoColor) {
    configLote.hue = ultimoColor.hue;
    configLote.saturacion = ultimoColor.saturacion;
    configLote.colorHex = ultimoColor.colorHex;
}

// API Key de Gemini
let apiKeyGemini = localStorage.getItem('fotosapp_gemini_key') || '';

export const moduloLote = {
    render: async (contenedor) => {
        const soportaFSAPI = 'showDirectoryPicker' in window;

        contenedor.innerHTML = `
            <div class="animate-fade-in h-full flex flex-col">
                <!-- Header compacto -->
                <div class="flex items-center justify-between gap-4 mb-3 flex-shrink-0">
                    <div>
                        <h2 class="text-lg font-bold text-gray-900">Procesamiento por Lote</h2>
                    </div>
                    <div class="flex items-center gap-2">
                        <!-- Selector de modo -->
                        <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
                            <button onclick="moduloLote.cambiarModoLote('automatico')" id="btn-modo-auto"
                                class="modo-btn px-3 py-1 text-xs rounded-md transition-all ${configLote.modoLote === 'automatico' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}">
                                <i class="fas fa-robot mr-1"></i>Automático
                            </button>
                            <button onclick="moduloLote.cambiarModoLote('asistido')" id="btn-modo-asistido"
                                class="modo-btn px-3 py-1 text-xs rounded-md transition-all ${configLote.modoLote === 'asistido' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}">
                                <i class="fas fa-user mr-1"></i>Asistido
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Configuración de carpetas y color -->
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3 flex-shrink-0">
                    <div class="flex flex-wrap items-center gap-4">
                        <!-- Carpeta origen -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500 w-14">Origen:</span>
                            ${soportaFSAPI ? `
                                <button onclick="moduloLote.seleccionarCarpetaOrigen()"
                                    class="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-folder-open text-amber-500"></i>
                                    <span id="nombre-carpeta-origen" class="max-w-[150px] truncate">Seleccionar...</span>
                                </button>
                            ` : `
                                <input type="file" id="input-archivos-lote" class="hidden" accept="image/jpeg,image/png,image/webp" multiple webkitdirectory>
                                <button onclick="document.getElementById('input-archivos-lote').click()"
                                    class="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">
                                    <i class="fas fa-folder-open text-amber-500"></i>
                                    <span>Seleccionar carpeta</span>
                                </button>
                            `}
                            <span id="contador-origen" class="text-xs text-gray-400"></span>
                        </div>

                        <!-- Carpeta destino -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500 w-14">Destino:</span>
                            ${soportaFSAPI ? `
                                <button onclick="moduloLote.seleccionarCarpetaDestino()"
                                    class="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-folder text-green-500"></i>
                                    <span id="nombre-carpeta-destino" class="max-w-[150px] truncate">Igual a origen</span>
                                </button>
                            ` : `
                                <span class="text-xs text-gray-400">Descarga como ZIP</span>
                            `}
                        </div>

                        <div class="h-6 w-px bg-gray-200"></div>

                        <!-- Color -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500">Color:</span>
                            <div class="relative">
                                <button onclick="moduloLote.toggleColorPicker()"
                                    class="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-200 hover:border-gray-300">
                                    <span id="color-preview-lote" class="w-4 h-4 rounded border border-gray-300" style="background-color: ${configLote.colorHex}"></span>
                                    <span id="color-hex-lote" class="font-mono text-xs text-gray-700">${configLote.colorHex}</span>
                                </button>
                                <!-- Dropdown de colores -->
                                <div id="color-picker-lote" class="hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-30 w-[200px]">
                                    <div class="flex flex-wrap gap-1.5 mb-3">
                                        ${COLOR_PRESETS.map(preset => `
                                            <button onclick="moduloLote.aplicarPreset(${preset.hue}, ${preset.saturacion}, '${preset.color}')"
                                                class="w-6 h-6 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                                                style="background-color: ${preset.color}"
                                                title="${preset.nombre}">
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <input type="color" id="input-color-lote" value="${configLote.colorHex}"
                                            onchange="moduloLote.aplicarColorHex(this.value)"
                                            class="w-8 h-8 rounded cursor-pointer border-0 p-0">
                                        <input type="text" id="input-hex-lote" value="${configLote.colorHex}"
                                            onchange="moduloLote.aplicarColorHex(this.value)"
                                            class="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="h-6 w-px bg-gray-200"></div>

                        <!-- Toggle IA -->
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="toggle-ia" ${configLote.usarIA ? 'checked' : ''}
                                onchange="moduloLote.toggleUsarIA(this.checked)"
                                class="w-4 h-4 text-brand rounded">
                            <span class="text-xs text-gray-600">Usar IA</span>
                        </label>

                        <!-- Imagen de referencia para consistencia -->
                        <div class="flex items-center gap-2">
                            <label class="flex items-center gap-1 cursor-pointer" title="Usar imagen de referencia para igualar tono">
                                <input type="checkbox" id="toggle-referencia"
                                    onchange="moduloLote.toggleUsarReferencia(this.checked)"
                                    ${usarImagenReferencia ? 'checked' : ''}
                                    class="w-4 h-4 text-brand rounded">
                                <span class="text-xs text-gray-600">Ref. tono</span>
                            </label>
                            <!-- Input oculto para cargar imagen -->
                            <input type="file" id="input-referencia" class="hidden" accept="image/jpeg,image/png,image/webp">
                            <button onclick="document.getElementById('input-referencia').click()"
                                class="text-xs text-brand hover:text-brand-dark" title="Cargar imagen de referencia">
                                <i class="fas fa-upload"></i>
                            </button>
                            <div id="preview-referencia" class="${imagenReferenciaBase64 ? '' : 'hidden'} w-6 h-6 rounded border border-gray-300 overflow-hidden cursor-pointer"
                                onclick="moduloLote.verReferenciaCompleta()" title="Click para ver en grande">
                                <img id="img-referencia" class="w-full h-full object-cover"
                                    src="${imagenReferenciaBase64 ? `data:image/jpeg;base64,${imagenReferenciaBase64}` : ''}">
                            </div>
                            <button id="btn-limpiar-ref" onclick="moduloLote.limpiarReferencia()"
                                class="${imagenReferenciaBase64 ? '' : 'hidden'} text-xs text-red-500 hover:text-red-700" title="Limpiar referencia">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <!-- Config -->
                        <details class="relative ml-auto">
                            <summary class="text-gray-500 cursor-pointer hover:text-gray-700 p-1">
                                <i class="fas fa-cog text-sm"></i>
                            </summary>
                            <div class="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 w-[220px]">
                                <p class="text-xs font-medium text-gray-700 mb-2">Tolerancia detección: <span id="valor-tolerancia">${configLote.toleranciaSaturacion}</span></p>
                                <input type="range" id="slider-tol-lote" min="5" max="60" value="${configLote.toleranciaSaturacion}"
                                    oninput="moduloLote.actualizarTolerancia(this.value)"
                                    class="w-full mb-3">
                                <p class="text-xs font-medium text-gray-700 mb-2">Calidad JPEG: <span id="valor-calidad">${Math.round(configLote.calidad * 100)}%</span></p>
                                <input type="range" id="slider-cal-lote" min="70" max="100" value="${configLote.calidad * 100}"
                                    oninput="moduloLote.actualizarCalidad(this.value)"
                                    class="w-full mb-3">
                                <p class="text-xs font-medium text-gray-700 mb-2">Delay IA (seg): <span id="valor-delay">${configLote.delayEntreImagenes / 1000}</span></p>
                                <input type="range" id="slider-delay-lote" min="1" max="10" value="${configLote.delayEntreImagenes / 1000}"
                                    oninput="moduloLote.actualizarDelay(this.value)"
                                    class="w-full mb-3">
                                <p class="text-xs font-medium text-gray-700 mb-2">API Key Gemini</p>
                                <input type="password" id="input-api-lote" value="${apiKeyGemini}"
                                    onchange="moduloLote.guardarApiKey(this.value)"
                                    placeholder="AIza..."
                                    class="w-full px-2 py-1 border border-gray-200 rounded text-xs">
                            </div>
                        </details>

                        <!-- Botón iniciar -->
                        <button id="btn-iniciar-lote" onclick="moduloLote.iniciarProcesamiento()"
                            class="px-4 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
                            disabled>
                            <i class="fas fa-play mr-1"></i>Iniciar
                        </button>
                    </div>
                </div>

                <!-- Área principal -->
                <div class="flex-1 min-h-0 flex gap-3">
                    <!-- Cola de imágenes (thumbnails) -->
                    <div class="w-48 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-shrink-0">
                        <div class="p-2 border-b border-gray-200 flex items-center justify-between">
                            <span class="text-xs font-medium text-gray-700">Cola</span>
                            <span id="contador-cola" class="text-xs text-gray-400">0 fotos</span>
                        </div>
                        <div id="lista-cola" class="flex-1 overflow-y-auto p-2 space-y-2">
                            <!-- Thumbnails de cola -->
                        </div>
                    </div>

                    <!-- Área de preview -->
                    <div class="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0">
                        <!-- Barra de progreso -->
                        <div id="barra-progreso" class="hidden p-2 border-b border-gray-200">
                            <div class="flex items-center justify-between mb-1">
                                <span id="progreso-texto" class="text-xs text-gray-600">Procesando...</span>
                                <span id="progreso-contador" class="text-xs text-gray-500">0/0</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div id="progreso-barra" class="bg-brand h-2 rounded-full transition-all" style="width: 0%"></div>
                            </div>
                        </div>

                        <!-- Preview de imagen actual -->
                        <div id="preview-lote" class="flex-1 min-h-0 flex items-center justify-center p-4 checkerboard">
                            <div id="estado-inicial" class="text-center">
                                <i class="fas fa-images text-gray-300 text-5xl mb-3"></i>
                                <p class="text-gray-500">Selecciona una carpeta origen para comenzar</p>
                            </div>
                            <img id="preview-img-lote" class="hidden max-w-full max-h-full object-contain">
                        </div>

                        <!-- Info de imagen actual -->
                        <div id="info-actual" class="hidden p-2 border-t border-gray-200 flex items-center justify-between">
                            <span id="nombre-actual" class="text-xs text-gray-600 truncate"></span>
                            <span id="estado-actual" class="text-xs text-gray-400"></span>
                        </div>
                    </div>

                    <!-- Panel de estadísticas -->
                    <div class="w-48 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-shrink-0">
                        <div class="p-2 border-b border-gray-200">
                            <span class="text-xs font-medium text-gray-700">Estadísticas</span>
                        </div>
                        <div class="p-3 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500">Procesadas</span>
                                <span id="stat-procesadas" class="text-sm font-medium text-green-600">0</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500">Descartadas</span>
                                <span id="stat-descartadas" class="text-sm font-medium text-amber-600">0</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500">Errores</span>
                                <span id="stat-errores" class="text-sm font-medium text-red-600">0</span>
                            </div>
                            <div class="flex items-center justify-between pt-2 border-t border-gray-200">
                                <span class="text-xs text-gray-500">Pendientes</span>
                                <span id="stat-pendientes" class="text-sm font-medium text-gray-600">0</span>
                            </div>
                        </div>

                        <!-- Botones de acción (solo en asistido) -->
                        <div id="acciones-asistido" class="hidden p-2 border-t border-gray-200 space-y-2">
                            <button onclick="moduloLote.accionAsistido('rehacer')"
                                class="w-full py-2 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200">
                                <i class="fas fa-redo mr-1"></i>Rehacer
                            </button>
                            <button onclick="moduloLote.accionAsistido('ajustar')"
                                class="w-full py-2 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200">
                                <i class="fas fa-sliders-h mr-1"></i>Ajustar
                            </button>
                            <button onclick="moduloLote.accionAsistido('siguiente')"
                                class="w-full py-2 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600">
                                <i class="fas fa-check mr-1"></i>Guardar y Siguiente
                            </button>
                            <button onclick="moduloLote.accionAsistido('descartar')"
                                class="w-full py-2 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200">
                                <i class="fas fa-times mr-1"></i>Descartar
                            </button>
                        </div>

                        <!-- Botones de acción -->
                        <div class="mt-auto p-2 border-t border-gray-200 space-y-2">
                            <button id="btn-cancelar" onclick="moduloLote.cancelar()"
                                class="hidden w-full py-2 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                                <i class="fas fa-stop mr-1"></i>Cancelar
                            </button>
                            <button id="btn-descargar-zip" onclick="moduloLote.descargarZip()"
                                class="hidden w-full py-2 bg-brand text-white rounded text-xs font-medium hover:bg-brand-dark">
                                <i class="fas fa-download mr-1"></i>Descargar ZIP
                            </button>
                            <button id="btn-nuevo-lote" onclick="moduloLote.nuevoLote()"
                                class="hidden w-full py-2 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200">
                                <i class="fas fa-plus mr-1"></i>Nuevo lote
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        moduloLote.inicializarEventos();
    },

    inicializarEventos: () => {
        // Cerrar color picker al hacer click afuera
        document.addEventListener('click', (e) => {
            const picker = document.getElementById('color-picker-lote');
            const btn = e.target.closest('[onclick*="toggleColorPicker"]');
            if (picker && !picker.contains(e.target) && !btn) {
                picker.classList.add('hidden');
            }
        });

        // Input de archivos (fallback)
        const inputArchivos = document.getElementById('input-archivos-lote');
        if (inputArchivos) {
            inputArchivos.addEventListener('change', (e) => {
                moduloLote.cargarArchivos(Array.from(e.target.files));
            });
        }

        // Input para cargar imagen de referencia
        const inputReferencia = document.getElementById('input-referencia');
        if (inputReferencia) {
            inputReferencia.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const dataURL = await leerArchivoComoDataURL(file);
                        moduloLote.guardarReferencia(dataURL);
                        // Activar checkbox automáticamente
                        usarImagenReferencia = true;
                        document.getElementById('toggle-referencia').checked = true;
                    } catch (error) {
                        mostrarNotificacion('Error al cargar imagen de referencia', 'error');
                    }
                }
                inputReferencia.value = '';
            });
        }
    },

    cambiarModoLote: (modo) => {
        configLote.modoLote = modo;
        document.querySelectorAll('.modo-btn').forEach(btn => {
            btn.classList.remove('bg-white', 'shadow', 'text-gray-900');
            btn.classList.add('text-gray-500');
        });
        const btnActivo = document.getElementById(`btn-modo-${modo === 'automatico' ? 'auto' : 'asistido'}`);
        if (btnActivo) {
            btnActivo.classList.add('bg-white', 'shadow', 'text-gray-900');
            btnActivo.classList.remove('text-gray-500');
        }
    },

    toggleColorPicker: () => {
        const picker = document.getElementById('color-picker-lote');
        picker?.classList.toggle('hidden');
    },

    aplicarPreset: (hue, saturacion, colorHex) => {
        configLote.hue = hue;
        configLote.saturacion = saturacion;
        configLote.colorHex = colorHex;
        moduloLote.actualizarDisplayColor();
        document.getElementById('color-picker-lote')?.classList.add('hidden');
    },

    aplicarColorHex: (hex) => {
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
        configLote.colorHex = hex;
        // Calcular HSL desde hex
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const hsl = moduloLote.rgbToHsl(r, g, b);
        configLote.hue = hsl.h;
        configLote.saturacion = hsl.s;
        moduloLote.actualizarDisplayColor();
    },

    rgbToHsl: (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    },

    actualizarDisplayColor: () => {
        document.getElementById('color-preview-lote').style.backgroundColor = configLote.colorHex;
        document.getElementById('color-hex-lote').textContent = configLote.colorHex;
        document.getElementById('input-color-lote').value = configLote.colorHex;
        document.getElementById('input-hex-lote').value = configLote.colorHex;
    },

    guardarApiKey: (key) => {
        apiKeyGemini = key;
        localStorage.setItem('fotosapp_gemini_key', key);
        mostrarNotificacion('API Key guardada', 'success');
    },

    actualizarDelay: (valor) => {
        configLote.delayEntreImagenes = parseInt(valor) * 1000;
        document.getElementById('valor-delay').textContent = valor;
    },

    actualizarTolerancia: (valor) => {
        configLote.toleranciaSaturacion = parseInt(valor);
        document.getElementById('valor-tolerancia').textContent = valor;
    },

    actualizarCalidad: (valor) => {
        configLote.calidad = parseInt(valor) / 100;
        document.getElementById('valor-calidad').textContent = `${valor}%`;
    },

    toggleUsarIA: (checked) => {
        configLote.usarIA = checked;
    },

    toggleUsarReferencia: (checked) => {
        usarImagenReferencia = checked;
        // No limpiar referencia al desactivar, solo dejar de usarla
        // Así el usuario puede activar/desactivar sin perder la imagen guardada
    },

    limpiarReferencia: () => {
        imagenReferenciaBase64 = null;
        localStorage.removeItem('fotosapp_imagen_referencia');
        document.getElementById('preview-referencia')?.classList.add('hidden');
        document.getElementById('btn-limpiar-ref')?.classList.add('hidden');
        mostrarNotificacion('Referencia eliminada', 'info');
    },

    guardarReferencia: (dataURL) => {
        // Guardar referencia en memoria y localStorage
        imagenReferenciaBase64 = dataURL.split(',')[1]; // Solo el base64

        // Persistir en localStorage (comprimir si es muy grande)
        try {
            localStorage.setItem('fotosapp_imagen_referencia', imagenReferenciaBase64);
        } catch (e) {
            // Si es muy grande, crear versión más pequeña
            console.warn('Imagen muy grande, comprimiendo para localStorage...');
            moduloLote.comprimirYGuardarReferencia(dataURL);
            return;
        }

        const previewRef = document.getElementById('preview-referencia');
        const imgRef = document.getElementById('img-referencia');
        const btnLimpiar = document.getElementById('btn-limpiar-ref');

        if (previewRef && imgRef) {
            imgRef.src = dataURL;
            previewRef.classList.remove('hidden');
            btnLimpiar?.classList.remove('hidden');
        }
        mostrarNotificacion('Referencia guardada (persistente)', 'success');
    },

    comprimirYGuardarReferencia: async (dataURL) => {
        // Reducir tamaño para caber en localStorage
        const img = await cargarImagen(dataURL);
        const canvas = document.createElement('canvas');
        const maxSize = 400; // Tamaño pequeño para referencia
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        const comprimida = canvas.toDataURL('image/jpeg', 0.7);
        imagenReferenciaBase64 = comprimida.split(',')[1];

        try {
            localStorage.setItem('fotosapp_imagen_referencia', imagenReferenciaBase64);
        } catch (e) {
            mostrarNotificacion('Imagen demasiado grande para guardar', 'warning');
            return;
        }

        const previewRef = document.getElementById('preview-referencia');
        const imgRef = document.getElementById('img-referencia');
        const btnLimpiar = document.getElementById('btn-limpiar-ref');

        if (previewRef && imgRef) {
            imgRef.src = comprimida;
            previewRef.classList.remove('hidden');
            btnLimpiar?.classList.remove('hidden');
        }
        mostrarNotificacion('Referencia guardada (comprimida)', 'success');
    },

    verReferenciaCompleta: () => {
        if (!imagenReferenciaBase64) return;

        const container = document.getElementById('modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onclick="this.remove()">
                <div class="bg-white rounded-xl shadow-xl max-w-2xl max-h-[80vh] mx-4 overflow-hidden" onclick="event.stopPropagation()">
                    <div class="p-3 border-b border-gray-200 flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-700">Imagen de Referencia</span>
                        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-4 checkerboard">
                        <img src="data:image/jpeg;base64,${imagenReferenciaBase64}"
                            class="max-w-full max-h-[60vh] object-contain rounded">
                    </div>
                    <div class="p-3 border-t border-gray-200 flex justify-end gap-2">
                        <button onclick="moduloLote.limpiarReferencia(); this.closest('.fixed').remove();"
                            class="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">
                            <i class="fas fa-trash mr-1"></i>Eliminar
                        </button>
                        <button onclick="this.closest('.fixed').remove()"
                            class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // === File System Access API ===

    seleccionarCarpetaOrigen: async () => {
        try {
            carpetaOrigenHandle = await window.showDirectoryPicker({ mode: 'read' });
            document.getElementById('nombre-carpeta-origen').textContent = carpetaOrigenHandle.name;

            // Cargar archivos de la carpeta
            await moduloLote.cargarArchivosDeCarpeta(carpetaOrigenHandle);

            // Si no hay carpeta destino, usar la misma
            if (!carpetaDestinoHandle) {
                carpetaDestinoHandle = carpetaOrigenHandle;
                document.getElementById('nombre-carpeta-destino').textContent = 'Igual a origen';
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                mostrarNotificacion('Error al seleccionar carpeta', 'error');
            }
        }
    },

    seleccionarCarpetaDestino: async () => {
        try {
            carpetaDestinoHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            document.getElementById('nombre-carpeta-destino').textContent = carpetaDestinoHandle.name;
        } catch (error) {
            if (error.name !== 'AbortError') {
                mostrarNotificacion('Error al seleccionar carpeta', 'error');
            }
        }
    },

    cargarArchivosDeCarpeta: async (directoryHandle) => {
        archivosEnCola = [];
        const formatosValidos = ['image/jpeg', 'image/png', 'image/webp'];
        const nombresVistos = new Set(); // Evitar duplicados

        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                // Validar formato y que no esté duplicado
                if (formatosValidos.includes(file.type) && !nombresVistos.has(file.name)) {
                    nombresVistos.add(file.name);
                    archivosEnCola.push({
                        id: generarId('file'),
                        handle: entry,
                        file: file,
                        nombre: file.name,
                        estado: 'pendiente',
                        dataURL: null,
                        thumbnailURL: null,
                        procesadaDataURL: null
                    });
                }
            }
        }

        // Ordenar por nombre para consistencia
        archivosEnCola.sort((a, b) => a.nombre.localeCompare(b.nombre));

        moduloLote.actualizarCola();
        document.getElementById('contador-origen').textContent = `(${archivosEnCola.length} fotos)`;
        document.getElementById('btn-iniciar-lote').disabled = archivosEnCola.length === 0;

        if (archivosEnCola.length === 0) {
            mostrarNotificacion('No se encontraron imágenes en la carpeta', 'warning');
        } else {
            mostrarNotificacion(`${archivosEnCola.length} imágenes encontradas`, 'success');
            // Generar thumbnails en background
            moduloLote.generarThumbnails();
        }
    },

    generarThumbnails: async () => {
        for (const item of archivosEnCola) {
            if (!item.thumbnailURL && item.file) {
                try {
                    const dataURL = await leerArchivoComoDataURL(item.file);
                    // Crear thumbnail para la cola (mejor calidad)
                    const img = await cargarImagen(dataURL);
                    const canvas = document.createElement('canvas');
                    const maxSize = 150; // Más grande para mejor calidad
                    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    item.thumbnailURL = canvas.toDataURL('image/jpeg', 0.8); // Mejor calidad
                    moduloLote.actualizarCola();
                } catch (e) {
                    console.warn('Error generando thumbnail:', item.nombre);
                }
            }
        }
    },

    cargarArchivos: (files) => {
        archivosEnCola = [];
        const formatosValidos = ['image/jpeg', 'image/png', 'image/webp'];
        const nombresVistos = new Set();

        for (const file of files) {
            if (formatosValidos.includes(file.type) && !nombresVistos.has(file.name)) {
                nombresVistos.add(file.name);
                archivosEnCola.push({
                    id: generarId('file'),
                    file: file,
                    nombre: file.name,
                    estado: 'pendiente',
                    dataURL: null,
                    thumbnailURL: null,
                    procesadaDataURL: null
                });
            }
        }

        // Ordenar por nombre
        archivosEnCola.sort((a, b) => a.nombre.localeCompare(b.nombre));

        moduloLote.actualizarCola();
        document.getElementById('btn-iniciar-lote').disabled = archivosEnCola.length === 0;
        mostrarNotificacion(`${archivosEnCola.length} imágenes cargadas`, 'success');

        // Generar thumbnails en background
        if (archivosEnCola.length > 0) {
            moduloLote.generarThumbnails();
        }
    },

    actualizarCola: () => {
        const lista = document.getElementById('lista-cola');
        const contador = document.getElementById('contador-cola');

        contador.textContent = `${archivosEnCola.length} fotos`;

        lista.innerHTML = archivosEnCola.map((item, idx) => {
            // Usar thumbnail, dataURL o placeholder
            const imgSrc = item.thumbnailURL || item.dataURL;
            return `
            <div class="relative rounded overflow-hidden border ${item.estado === 'procesando' ? 'border-brand' : item.estado === 'completado' ? 'border-green-500' : item.estado === 'error' ? 'border-red-500' : 'border-gray-200'}" data-id="${item.id}">
                <div class="aspect-square bg-gray-100 flex items-center justify-center">
                    ${imgSrc
                        ? `<img src="${imgSrc}" class="w-full h-full object-cover">`
                        : `<i class="fas fa-image text-gray-300"></i>`}
                </div>
                ${item.estado === 'procesando' ? `
                    <div class="absolute inset-0 bg-brand/20 flex items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-brand"></i>
                    </div>
                ` : ''}
                ${item.estado === 'completado' ? `
                    <div class="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <i class="fas fa-check text-white text-[8px]"></i>
                    </div>
                ` : ''}
                <p class="text-[9px] text-gray-500 p-1 truncate">${item.nombre}</p>
            </div>
        `}).join('');

        // Actualizar estadísticas
        document.getElementById('stat-pendientes').textContent = archivosEnCola.filter(a => a.estado === 'pendiente').length;
    },

    actualizarEstadisticas: () => {
        document.getElementById('stat-procesadas').textContent = estadisticas.procesadas;
        document.getElementById('stat-descartadas').textContent = estadisticas.descartadas;
        document.getElementById('stat-errores').textContent = estadisticas.errores;
        document.getElementById('stat-pendientes').textContent = archivosEnCola.filter(a => a.estado === 'pendiente').length;
    },

    // === Procesamiento ===

    iniciarProcesamiento: async () => {
        if (procesando || archivosEnCola.length === 0) return;

        procesando = true;
        cancelado = false;
        archivoActualIndex = 0;
        estadisticas = { procesadas: 0, descartadas: 0, errores: 0 };
        iaDisponible = true;
        iaFallbackNotificado = false;

        document.getElementById('btn-iniciar-lote').disabled = true;
        document.getElementById('btn-cancelar').classList.remove('hidden');
        document.getElementById('barra-progreso').classList.remove('hidden');
        document.getElementById('estado-inicial').classList.add('hidden');
        document.getElementById('preview-img-lote').classList.remove('hidden');
        document.getElementById('info-actual').classList.remove('hidden');

        if (configLote.modoLote === 'asistido') {
            document.getElementById('acciones-asistido').classList.remove('hidden');
        }

        moduloLote.actualizarEstadisticas();

        if (configLote.modoLote === 'automatico') {
            await moduloLote.procesarAutomatico();
        } else {
            await moduloLote.procesarAsistido();
        }
    },

    procesarAutomatico: async () => {
        const total = archivosEnCola.length;
        let ultimaLlamadaIA = 0;

        for (let i = 0; i < total && !cancelado; i++) {
            archivoActualIndex = i;
            const item = archivosEnCola[i];
            item.estado = 'procesando';
            moduloLote.actualizarCola();
            moduloLote.actualizarProgreso(i + 1, total, item.nombre);

            try {
                // Cargar imagen
                const dataURL = await leerArchivoComoDataURL(item.file);
                item.dataURL = dataURL;
                moduloLote.actualizarCola();
                moduloLote.mostrarPreview(dataURL);

                // Rate limiting para IA: esperar si pasó poco tiempo desde la última llamada
                if (configLote.usarIA && apiKeyGemini && iaDisponible) {
                    const tiempoTranscurrido = Date.now() - ultimaLlamadaIA;
                    const tiempoEspera = configLote.delayEntreImagenes - tiempoTranscurrido;

                    if (tiempoEspera > 0 && i > 0) {
                        document.getElementById('estado-actual').textContent = `Esperando ${Math.ceil(tiempoEspera / 1000)}s (rate limit)...`;
                        await new Promise(r => setTimeout(r, tiempoEspera));
                    }

                    ultimaLlamadaIA = Date.now();
                }

                // Procesar
                const resultado = await moduloLote.procesarImagen(item);
                item.procesadaDataURL = resultado;
                moduloLote.mostrarPreview(resultado);

                // Guardar
                await moduloLote.guardarImagen(item, resultado);

                item.estado = 'completado';
                estadisticas.procesadas++;
            } catch (error) {
                console.error('Error procesando:', item.nombre, error);
                item.estado = 'error';
                estadisticas.errores++;
            }

            moduloLote.actualizarCola();
            moduloLote.actualizarEstadisticas();

            // Pausa para UI
            await new Promise(r => setTimeout(r, 100));
        }

        moduloLote.finalizarProcesamiento();
    },

    procesarAsistido: async () => {
        await moduloLote.procesarSiguienteAsistido();
    },

    procesarSiguienteAsistido: async () => {
        if (archivoActualIndex >= archivosEnCola.length || cancelado) {
            moduloLote.finalizarProcesamiento();
            return;
        }

        const item = archivosEnCola[archivoActualIndex];
        item.estado = 'procesando';
        moduloLote.actualizarCola();
        moduloLote.actualizarProgreso(archivoActualIndex + 1, archivosEnCola.length, item.nombre);

        try {
            // Cargar imagen
            const dataURL = await leerArchivoComoDataURL(item.file);
            item.dataURL = dataURL;
            moduloLote.actualizarCola();

            // Procesar
            const resultado = await moduloLote.procesarImagen(item);
            item.procesadaDataURL = resultado;
            moduloLote.mostrarPreview(resultado);

            document.getElementById('estado-actual').textContent = 'Listo para revisar';
        } catch (error) {
            console.error('Error procesando:', item.nombre, error);
            item.estado = 'error';
            estadisticas.errores++;
            moduloLote.actualizarEstadisticas();
            archivoActualIndex++;
            await moduloLote.procesarSiguienteAsistido();
        }
    },

    accionAsistido: async (accion) => {
        const item = archivosEnCola[archivoActualIndex];

        switch (accion) {
            case 'rehacer':
                document.getElementById('estado-actual').textContent = 'Reprocesando...';
                const resultado = await moduloLote.procesarImagen(item);
                item.procesadaDataURL = resultado;
                moduloLote.mostrarPreview(resultado);
                document.getElementById('estado-actual').textContent = 'Listo para revisar';
                break;

            case 'ajustar':
                mostrarNotificacion('Ajusta el color y presiona Rehacer', 'info');
                break;

            case 'siguiente':
                await moduloLote.guardarImagen(item, item.procesadaDataURL);
                item.estado = 'completado';
                estadisticas.procesadas++;
                moduloLote.actualizarCola();
                moduloLote.actualizarEstadisticas();
                archivoActualIndex++;
                await moduloLote.procesarSiguienteAsistido();
                break;

            case 'descartar':
                item.estado = 'descartado';
                estadisticas.descartadas++;
                moduloLote.actualizarCola();
                moduloLote.actualizarEstadisticas();
                archivoActualIndex++;
                await moduloLote.procesarSiguienteAsistido();
                break;
        }
    },

    procesarImagen: async (item) => {
        const img = await cargarImagen(item.dataURL);

        // Usar IA solo si está habilitada, hay API key, y no falló previamente
        if (configLote.usarIA && apiKeyGemini && iaDisponible) {
            return await moduloLote.procesarConIA(img, item);
        } else {
            return moduloLote.procesarLocal(img);
        }
    },

    procesarLocal: (img) => {
        const resultado = imageProcessor.procesar(img, {
            modo: 'tono',
            hue: configLote.hue,
            saturacion: configLote.saturacion,
            toleranciaSaturacion: configLote.toleranciaSaturacion,
            luminosidadMin: configLote.luminosidadMin,
            luminosidadMax: configLote.luminosidadMax,
            formato: 'image/jpeg',
            calidad: configLote.calidad
        });
        return resultado.dataURL;
    },

    procesarConIA: async (img, item) => {
        document.getElementById('estado-actual').textContent = 'Procesando con IA...';

        try {
            const canvas = document.createElement('canvas');
            const maxSize = 1024;
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > maxSize || height > maxSize) {
                const scale = maxSize / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

            // Construir parts del mensaje
            const parts = [];

            // Si tenemos imagen de referencia, incluirla en el prompt
            if (usarImagenReferencia && imagenReferenciaBase64) {
                parts.push({
                    text: `I have a reference image showing the exact background tone I want. Edit the second product photo to match the background color and tone of the reference image EXACTLY. Keep the product the same, only change the background to match the reference. Preserve lighting and texture variations.`
                });
                parts.push({
                    inlineData: {
                        mimeType: 'image/png',
                        data: imagenReferenciaBase64
                    }
                });
                parts.push({
                    text: `Now edit this photo to match the reference background:`
                });
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64
                    }
                });
            } else {
                // Sin referencia, usar el color hex
                parts.push({
                    text: `Edit this product photo: change ONLY the background color to ${configLote.colorHex}. Keep the product exactly the same, only change the neutral/gray background to the specified color. Preserve all lighting and texture variations of the original background.`
                });
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64
                    }
                });
            }

            // Usar mismo endpoint que el editor (gemini-3-pro-image-preview)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKeyGemini}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT']
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.warn('API Gemini error:', errorData.error?.message || response.status);
                document.getElementById('estado-actual').textContent = 'IA no disponible, procesando local...';
                return moduloLote.procesarLocal(img);
            }

            const result = await response.json();
            let imageData = null;

            for (const part of result.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    imageData = part.inlineData.data;
                    break;
                }
            }

            if (!imageData) {
                // Fallback a procesamiento local
                console.warn('Sin imagen en respuesta IA, usando procesamiento local');
                return moduloLote.procesarLocal(img);
            }

            const resultDataURL = `data:image/png;base64,${imageData}`;

            // Si usarImagenReferencia está activo y no tenemos referencia aún, guardar esta
            if (usarImagenReferencia && !imagenReferenciaBase64) {
                moduloLote.guardarReferencia(resultDataURL);
            }

            return resultDataURL;
        } catch (error) {
            // CORS u otro error de red - fallback silencioso a procesamiento local
            console.warn('Error IA (CORS/red), usando procesamiento local:', error.message);

            // Marcar IA como no disponible y notificar una sola vez
            iaDisponible = false;
            if (!iaFallbackNotificado) {
                iaFallbackNotificado = true;
                mostrarNotificacion('IA no disponible (CORS). Usando procesamiento local.', 'warning');
            }

            document.getElementById('estado-actual').textContent = 'Procesando localmente...';
            return moduloLote.procesarLocal(img);
        }
    },

    guardarImagen: async (item, dataURL) => {
        const colorSufijo = configLote.colorHex.replace('#', '');
        const nombreBase = item.nombre.replace(/\.[^/.]+$/, '');
        const nuevoNombre = `${nombreBase}_procesada_${colorSufijo}.jpg`;

        if (carpetaDestinoHandle && 'showDirectoryPicker' in window) {
            try {
                const fileHandle = await carpetaDestinoHandle.getFileHandle(nuevoNombre, { create: true });
                const writable = await fileHandle.createWritable();
                const response = await fetch(dataURL);
                const blob = await response.blob();
                await writable.write(blob);
                await writable.close();
            } catch (error) {
                console.error('Error guardando archivo:', error);
                throw error;
            }
        } else {
            // Fallback: guardar en memoria para ZIP
            item.nombreFinal = nuevoNombre;
        }
    },

    mostrarPreview: (dataURL) => {
        const img = document.getElementById('preview-img-lote');
        img.src = dataURL;
        img.classList.remove('hidden');
    },

    actualizarProgreso: (actual, total, nombre) => {
        document.getElementById('progreso-contador').textContent = `${actual}/${total}`;
        document.getElementById('progreso-barra').style.width = `${(actual / total) * 100}%`;
        document.getElementById('nombre-actual').textContent = nombre;
    },

    cancelar: () => {
        cancelado = true;
        mostrarNotificacion('Procesamiento cancelado', 'warning');
    },

    finalizarProcesamiento: () => {
        procesando = false;
        document.getElementById('btn-iniciar-lote').disabled = false;
        document.getElementById('btn-cancelar').classList.add('hidden');
        document.getElementById('acciones-asistido').classList.add('hidden');

        // Mostrar botón de nuevo lote
        document.getElementById('btn-nuevo-lote').classList.remove('hidden');

        // Si no hay File System API, mostrar botón de ZIP
        if (!('showDirectoryPicker' in window) || !carpetaDestinoHandle) {
            document.getElementById('btn-descargar-zip').classList.remove('hidden');
        }

        mostrarNotificacion(`Completado: ${estadisticas.procesadas} procesadas, ${estadisticas.descartadas} descartadas, ${estadisticas.errores} errores`, 'success');
    },

    nuevoLote: () => {
        // Limpiar estado
        archivosEnCola = [];
        archivoActualIndex = 0;
        estadisticas = { procesadas: 0, descartadas: 0, errores: 0 };
        iaDisponible = true;
        iaFallbackNotificado = false;

        // NO limpiar imagen de referencia - se mantiene entre lotes para consistencia

        // Limpiar handles de carpetas
        carpetaOrigenHandle = null;
        carpetaDestinoHandle = null;

        // Actualizar UI
        document.getElementById('nombre-carpeta-origen').textContent = 'Seleccionar...';
        document.getElementById('nombre-carpeta-destino').textContent = 'Igual a origen';
        document.getElementById('contador-origen').textContent = '';
        document.getElementById('contador-cola').textContent = '0 fotos';
        document.getElementById('lista-cola').innerHTML = '';

        // Reset preview
        document.getElementById('preview-img-lote').classList.add('hidden');
        document.getElementById('preview-img-lote').src = '';
        document.getElementById('estado-inicial').classList.remove('hidden');
        document.getElementById('info-actual').classList.add('hidden');

        // Reset barra progreso
        document.getElementById('barra-progreso').classList.add('hidden');
        document.getElementById('progreso-barra').style.width = '0%';

        // Reset estadísticas
        document.getElementById('stat-procesadas').textContent = '0';
        document.getElementById('stat-descartadas').textContent = '0';
        document.getElementById('stat-errores').textContent = '0';
        document.getElementById('stat-pendientes').textContent = '0';

        // Ocultar botones de fin
        document.getElementById('btn-descargar-zip').classList.add('hidden');
        document.getElementById('btn-nuevo-lote').classList.add('hidden');

        // Deshabilitar botón iniciar
        document.getElementById('btn-iniciar-lote').disabled = true;

        mostrarNotificacion('Listo para nuevo lote', 'info');
    },

    descargarZip: async () => {
        const archivosParaZip = archivosEnCola
            .filter(a => a.estado === 'completado' && a.procesadaDataURL)
            .map(a => ({
                nombre: a.nombreFinal || `${a.nombre.replace(/\.[^/.]+$/, '')}_procesada_${configLote.colorHex.replace('#', '')}.jpg`,
                dataURL: a.procesadaDataURL
            }));

        if (archivosParaZip.length === 0) {
            mostrarNotificacion('No hay archivos para descargar', 'warning');
            return;
        }

        try {
            await descargarComoZip(archivosParaZip, `fotos_procesadas_${configLote.colorHex.replace('#', '')}.zip`);
            mostrarNotificacion('ZIP descargado', 'success');
        } catch (error) {
            mostrarNotificacion('Error al generar ZIP', 'error');
        }
    }
};

window.moduloLote = moduloLote;
