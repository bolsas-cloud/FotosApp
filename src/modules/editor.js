/**
 * Módulo Editor - Edición individual de fotos
 * Con pincel de limpieza, vistas múltiples y UI responsive
 */

import { APP_CONFIG, COLOR_PRESETS } from '../config.js';
import { mostrarNotificacion, leerArchivoComoDataURL, cargarImagen, descargarArchivo, validarArchivo, hslToRgb } from '../utils.js';
import { imageProcessor } from '../lib/imageProcessor.js';

// Estado del módulo
let imagenOriginal = null;
let imagenDataURL = null;
let nombreArchivo = null;
let canvasPreview = null;
let canvasProcesado = null;
let canvasOriginalData = null;
let previewTimeout = null;

// Estado del pincel
let pincelActivo = false;
let pincelModo = 'restaurar';
let pincelTamano = 20;
let pintando = false;

// Vista actual: 'dividida', 'original', 'procesada'
let vistaActual = 'dividida';

// Proveedor de IA y API Keys
let proveedorIA = localStorage.getItem('fotosapp_editor_proveedor') || 'gemini';
let apiKeyGemini = localStorage.getItem('fotosapp_gemini_key') || '';
let apiKeyOpenAI = localStorage.getItem('fotosapp_openai_key') || '';
let calidadOpenAI = localStorage.getItem('fotosapp_openai_calidad') || 'medium';
let procesandoIA = false;

// Helper: base64 a Blob (para OpenAI FormData)
function base64ABlob(base64, mimeType) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

// Colores guardados por el usuario
let misColores = JSON.parse(localStorage.getItem('fotosapp_mis_colores') || '[]');

// Canvas con resultado de IA para permitir ajustes posteriores
let canvasResultadoIA = null;

// Imagen resultado de IA para usar como base editable
let imagenBaseIA = null;

// Cargar último color usado desde localStorage
const ultimoColorGuardado = JSON.parse(localStorage.getItem('fotosapp_ultimo_color') || 'null');

// Configuración actual (con último color usado si existe)
let configActual = {
    modo: 'tono',
    hue: ultimoColorGuardado?.hue ?? 80,
    saturacion: ultimoColorGuardado?.saturacion ?? 35,
    colorHex: ultimoColorGuardado?.colorHex ?? '#6B8E23',
    toleranciaSaturacion: 30,
    luminosidadMin: 10,
    luminosidadMax: 90,
    brillo: 0,
    contraste: 0
};

// Función para guardar último color usado
const guardarUltimoColor = () => {
    localStorage.setItem('fotosapp_ultimo_color', JSON.stringify({
        hue: configActual.hue,
        saturacion: configActual.saturacion,
        colorHex: configActual.colorHex
    }));
};

export const moduloEditor = {
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="animate-fade-in h-full flex flex-col">
                <!-- Header compacto - altura fija -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 flex-shrink-0">
                    <div>
                        <h2 class="text-lg font-bold text-gray-900">Editor de Fotos</h2>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <!-- Selector de vista -->
                        <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
                            <button onclick="moduloEditor.cambiarVista('dividida')" id="btn-vista-dividida"
                                class="vista-btn px-2 py-1 text-xs rounded-md transition-all bg-white shadow text-gray-900">
                                <i class="fas fa-columns mr-1"></i>Dividida
                            </button>
                            <button onclick="moduloEditor.cambiarVista('original')" id="btn-vista-original"
                                class="vista-btn px-2 py-1 text-xs rounded-md transition-all text-gray-500 hover:text-gray-700">
                                <i class="fas fa-image mr-1"></i>Original
                            </button>
                            <button onclick="moduloEditor.cambiarVista('procesada')" id="btn-vista-procesada"
                                class="vista-btn px-2 py-1 text-xs rounded-md transition-all text-gray-500 hover:text-gray-700">
                                <i class="fas fa-magic mr-1"></i>Procesada
                            </button>
                        </div>
                        <button id="btn-descargar" onclick="moduloEditor.descargar()"
                            class="px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            disabled>
                            <i class="fas fa-download"></i>
                            <span class="hidden sm:inline">Descargar</span>
                        </button>
                    </div>
                </div>

                <!-- Controles compactos - altura fija -->
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 mb-2 flex-shrink-0">
                    <div class="flex flex-wrap items-center gap-3 text-xs">
                        <!-- Color Picker con Presets -->
                        <div class="relative">
                            <button id="btn-color-picker" onclick="moduloEditor.toggleColorPicker()"
                                class="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors">
                                <span id="color-preview" class="w-4 h-4 rounded border border-gray-300" style="background-color: ${configActual.colorHex}"></span>
                                <span id="color-hex-display" class="font-mono text-gray-700">${configActual.colorHex}</span>
                                <i class="fas fa-chevron-down text-gray-400 text-[10px]"></i>
                            </button>
                            <!-- Dropdown de colores mejorado -->
                            <div id="color-picker-dropdown" class="hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-30 w-[320px]">
                                <div class="flex gap-4">
                                    <!-- Preview en vivo -->
                                    <div class="flex-shrink-0">
                                        <p class="text-xs font-medium text-gray-500 mb-2">Preview</p>
                                        <div class="w-24 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                                            <canvas id="color-preview-canvas" class="w-full h-full object-cover"></canvas>
                                        </div>
                                    </div>
                                    <!-- Controles -->
                                    <div class="flex-1">
                                        <p class="text-xs font-medium text-gray-500 mb-2">Mis Colores</p>
                                        <div id="mis-colores-container" class="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                                            <!-- Colores guardados se renderizan aquí -->
                                        </div>
                                        <p class="text-xs font-medium text-gray-500 mb-2">Presets</p>
                                        <div class="flex flex-wrap gap-1.5 mb-3">
                                            ${COLOR_PRESETS.map(preset => `
                                                <button onclick="moduloEditor.aplicarPreset(${preset.hue}, ${preset.saturacion}, '${preset.color}')"
                                                    class="w-6 h-6 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                                                    style="background-color: ${preset.color}"
                                                    title="${preset.nombre}">
                                                </button>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                                <div class="border-t border-gray-100 pt-3 mt-3">
                                    <div class="flex items-center gap-2">
                                        <input type="color" id="input-color-picker" value="${configActual.colorHex}"
                                            oninput="moduloEditor.previsualizarColor(this.value)"
                                            onchange="moduloEditor.aplicarColorHex(this.value)"
                                            class="w-10 h-10 rounded cursor-pointer border-0 p-0">
                                        <input type="text" id="input-hex" value="${configActual.colorHex}"
                                            oninput="moduloEditor.previsualizarColor(this.value)"
                                            onchange="moduloEditor.aplicarColorHex(this.value)"
                                            class="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm font-mono">
                                        <button onclick="moduloEditor.guardarColorActual()"
                                            class="px-2 py-1.5 bg-brand text-white rounded text-xs hover:bg-brand-dark transition-colors"
                                            title="Guardar color">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="h-4 w-px bg-gray-200"></div>

                        <!-- Tono y Saturación -->
                        <div class="flex items-center gap-1">
                            <span class="text-gray-500 w-7">Tono</span>
                            <input type="range" id="slider-hue" min="0" max="360" value="${configActual.hue}"
                                oninput="moduloEditor.actualizarHue(this.value)"
                                class="w-20"
                                style="background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);">
                            <span id="valor-hue" class="font-mono text-gray-600 w-7 text-right">${configActual.hue}°</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-gray-500 w-5">Sat</span>
                            <input type="range" id="slider-saturacion" min="0" max="100" value="${configActual.saturacion}"
                                oninput="moduloEditor.actualizarSaturacion(this.value)"
                                class="w-16">
                            <span id="valor-saturacion" class="font-mono text-gray-600 w-7 text-right">${configActual.saturacion}%</span>
                        </div>

                        <div class="h-4 w-px bg-gray-200"></div>

                        <!-- Tolerancia, Brillo, Contraste -->
                        <div class="flex items-center gap-1">
                            <span class="text-gray-500 w-5">Tol</span>
                            <input type="range" id="slider-tolerancia" min="5" max="60" value="30"
                                oninput="moduloEditor.actualizarTolerancia(this.value)"
                                class="w-14">
                            <span id="valor-tolerancia" class="font-mono text-gray-600 w-5 text-right">30</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-gray-500 w-5">Bri</span>
                            <input type="range" id="slider-brillo" min="-50" max="50" value="0"
                                oninput="moduloEditor.actualizarBrillo(this.value)"
                                class="w-14">
                            <span id="valor-brillo" class="font-mono text-gray-600 w-5 text-right">0</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-gray-500 w-6">Con</span>
                            <input type="range" id="slider-contraste" min="-50" max="50" value="0"
                                oninput="moduloEditor.actualizarContraste(this.value)"
                                class="w-14">
                            <span id="valor-contraste" class="font-mono text-gray-600 w-5 text-right">0</span>
                        </div>

                        <div class="h-4 w-px bg-gray-200"></div>

                        <!-- Pincel -->
                        <button id="btn-pincel-toggle" onclick="moduloEditor.togglePincel()"
                            class="px-2 py-1 rounded text-xs font-medium transition-all bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                            disabled title="Pincel de retoque">
                            <i class="fas fa-paint-brush"></i>
                        </button>
                        <div id="pincel-opciones" class="flex items-center gap-2 hidden">
                            <select id="select-pincel-modo" onchange="moduloEditor.cambiarModoPincel(this.value)"
                                class="text-xs border border-gray-200 rounded px-1 py-0.5">
                                <option value="restaurar">Restaurar</option>
                                <option value="aplicar">Aplicar</option>
                            </select>
                            <input type="range" id="slider-pincel" min="5" max="80" value="20"
                                oninput="moduloEditor.cambiarTamanoPincel(this.value)"
                                class="w-14" title="Tamaño">
                            <button onclick="moduloEditor.resetearPinceladas()"
                                class="text-gray-500 hover:text-gray-700" title="Limpiar pinceladas">
                                <i class="fas fa-eraser"></i>
                            </button>
                        </div>

                        <div class="h-4 w-px bg-gray-200"></div>

                        <!-- IA -->
                        <button id="btn-ia" onclick="moduloEditor.procesarConIA()"
                            class="px-2 py-1 rounded text-xs font-medium transition-all bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled title="Procesar con IA (Gemini 3 Pro Image)">
                            <i class="fas fa-magic mr-1"></i>IA
                        </button>

                        <!-- Config -->
                        <details class="relative ml-auto">
                            <summary class="text-gray-500 cursor-pointer hover:text-gray-700 p-1">
                                <i class="fas fa-cog"></i>
                            </summary>
                            <div class="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 min-w-[180px]">
                                <p class="text-xs font-medium text-gray-700 mb-2">Rango Luminosidad</p>
                                <div class="flex items-center gap-2 mb-3">
                                    <input type="number" id="input-lum-min" value="10" min="0" max="50"
                                        onchange="moduloEditor.actualizarLuminosidad()"
                                        class="w-12 px-2 py-1 border border-gray-200 rounded text-xs text-center">
                                    <span class="text-gray-400">—</span>
                                    <input type="number" id="input-lum-max" value="90" min="50" max="100"
                                        onchange="moduloEditor.actualizarLuminosidad()"
                                        class="w-12 px-2 py-1 border border-gray-200 rounded text-xs text-center">
                                </div>
                                <p class="text-xs font-medium text-gray-700 mb-1">Proveedor IA</p>
                                <div class="flex gap-1 mb-2">
                                    <button onclick="moduloEditor.cambiarProveedor('gemini')" id="btn-prov-gemini-ed"
                                        class="flex-1 px-2 py-1 text-xs rounded transition-all ${proveedorIA === 'gemini' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                                        Gemini
                                    </button>
                                    <button onclick="moduloEditor.cambiarProveedor('openai')" id="btn-prov-openai-ed"
                                        class="flex-1 px-2 py-1 text-xs rounded transition-all ${proveedorIA === 'openai' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                                        OpenAI
                                    </button>
                                </div>
                                <div id="config-gemini-ed" class="${proveedorIA === 'gemini' ? '' : 'hidden'}">
                                    <p class="text-xs text-gray-500 mb-1">API Key Gemini</p>
                                    <input type="password" id="input-api-key" placeholder="AIza..."
                                        onchange="moduloEditor.guardarApiKeyGemini(this.value)"
                                        class="w-full px-2 py-1 border border-gray-200 rounded text-xs mb-2">
                                </div>
                                <div id="config-openai-ed" class="${proveedorIA === 'openai' ? '' : 'hidden'}">
                                    <p class="text-xs text-gray-500 mb-1">API Key OpenAI</p>
                                    <input type="password" id="input-api-key-openai" placeholder="sk-..."
                                        onchange="moduloEditor.guardarApiKeyOpenAI(this.value)"
                                        class="w-full px-2 py-1 border border-gray-200 rounded text-xs mb-2">
                                    <p class="text-xs text-gray-500 mb-1">Calidad</p>
                                    <select id="select-calidad-openai-ed" onchange="moduloEditor.cambiarCalidadOpenAI(this.value)"
                                        class="w-full px-2 py-1 border border-gray-200 rounded text-xs mb-2">
                                        <option value="low" ${calidadOpenAI === 'low' ? 'selected' : ''}>Baja</option>
                                        <option value="medium" ${calidadOpenAI === 'medium' ? 'selected' : ''}>Media</option>
                                        <option value="high" ${calidadOpenAI === 'high' ? 'selected' : ''}>Alta</option>
                                    </select>
                                </div>
                                <button onclick="moduloEditor.resetearAjustes()" class="text-xs text-brand hover:underline">
                                    <i class="fas fa-undo mr-1"></i>Resetear ajustes
                                </button>
                            </div>
                        </details>
                    </div>
                </div>

                <!-- Zona de imágenes - ocupa el resto del espacio -->
                <div id="zona-imagen" class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-0">
                    <!-- Drop zone -->
                    <div id="drop-zone" class="drop-zone h-full text-center cursor-pointer flex flex-col items-center justify-center p-4">
                        <div class="w-16 h-16 bg-brand-light rounded-full flex items-center justify-center mb-4">
                            <i class="fas fa-cloud-upload-alt text-brand text-2xl"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-gray-900">Arrastra una imagen aquí</h3>
                        <p class="text-gray-500 mt-1 text-sm">o haz clic para seleccionar</p>
                        <p class="text-xs text-gray-400 mt-2">JPG, PNG, WebP • Máx: 10MB</p>
                        <input type="file" id="input-archivo" class="hidden" accept="image/jpeg,image/png,image/webp">
                    </div>

                    <!-- Preview -->
                    <div id="preview-container" class="hidden h-full flex flex-col">
                        <div class="px-2 py-1 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-image text-gray-400 text-xs"></i>
                                <span id="nombre-archivo" class="text-xs font-medium text-gray-700 truncate max-w-[200px]">imagen.jpg</span>
                                <span id="pincel-indicator" class="hidden text-xs text-amber-600">
                                    <i class="fas fa-paint-brush"></i> Pincel
                                </span>
                            </div>
                            <button onclick="moduloEditor.quitarImagen()" class="text-gray-400 hover:text-red-500 transition-colors text-xs">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <!-- Contenedor de vistas - flex-1 para ocupar espacio restante -->
                        <div id="vistas-container" class="flex-1 min-h-0 p-1 bg-gray-100">
                            <!-- Vista dividida -->
                            <div id="vista-dividida" class="h-full grid grid-cols-2 gap-1">
                                <div class="bg-white rounded overflow-hidden flex flex-col">
                                    <p class="text-xs font-medium text-gray-500 py-1 text-center bg-gray-50 border-b flex-shrink-0">ORIGINAL</p>
                                    <div class="checkerboard flex-1 flex items-center justify-center p-1 min-h-0">
                                        <img id="img-original" class="max-w-full max-h-full object-contain">
                                    </div>
                                </div>
                                <div class="bg-white rounded overflow-hidden flex flex-col">
                                    <p class="text-xs font-medium text-gray-500 py-1 text-center bg-gray-50 border-b flex-shrink-0">PROCESADA</p>
                                    <div id="canvas-wrapper" class="checkerboard flex-1 flex items-center justify-center p-1 min-h-0 relative">
                                        <canvas id="canvas-preview" class="max-w-full max-h-full object-contain"></canvas>
                                        <div id="pincel-cursor" class="hidden absolute pointer-events-none border-2 border-amber-500 rounded-full opacity-70"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Vista solo original -->
                            <div id="vista-original" class="h-full hidden">
                                <div class="bg-white rounded overflow-hidden h-full flex flex-col">
                                    <p class="text-xs font-medium text-gray-500 py-1 text-center bg-gray-50 border-b flex-shrink-0">ORIGINAL</p>
                                    <div class="checkerboard flex-1 flex items-center justify-center p-2 min-h-0">
                                        <img id="img-original-full" class="max-w-full max-h-full object-contain">
                                    </div>
                                </div>
                            </div>

                            <!-- Vista solo procesada -->
                            <div id="vista-procesada" class="h-full hidden">
                                <div class="bg-white rounded overflow-hidden h-full flex flex-col">
                                    <p class="text-xs font-medium text-gray-500 py-1 text-center bg-gray-50 border-b flex-shrink-0">PROCESADA</p>
                                    <div id="canvas-wrapper-full" class="checkerboard flex-1 flex items-center justify-center p-2 min-h-0 relative">
                                        <canvas id="canvas-preview-full" class="max-w-full max-h-full object-contain"></canvas>
                                        <div id="pincel-cursor-full" class="hidden absolute pointer-events-none border-2 border-amber-500 rounded-full opacity-70"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        moduloEditor.inicializarEventos();
    },

    cambiarVista: (vista) => {
        vistaActual = vista;

        // Actualizar botones
        document.querySelectorAll('.vista-btn').forEach(btn => {
            btn.classList.remove('bg-white', 'shadow', 'text-gray-900');
            btn.classList.add('text-gray-500', 'hover:text-gray-700');
        });
        const btnActivo = document.getElementById(`btn-vista-${vista}`);
        if (btnActivo) {
            btnActivo.classList.add('bg-white', 'shadow', 'text-gray-900');
            btnActivo.classList.remove('text-gray-500', 'hover:text-gray-700');
        }

        // Mostrar vista correspondiente
        document.getElementById('vista-dividida').classList.add('hidden');
        document.getElementById('vista-original').classList.add('hidden');
        document.getElementById('vista-procesada').classList.add('hidden');
        document.getElementById(`vista-${vista}`).classList.remove('hidden');

        // Sincronizar imágenes en las vistas
        if (imagenOriginal) {
            const imgOrigFull = document.getElementById('img-original-full');
            if (imgOrigFull) imgOrigFull.src = imagenDataURL;

            // Sincronizar canvas procesado
            moduloEditor.sincronizarCanvasFull();
        }
    },

    sincronizarCanvasFull: () => {
        if (!canvasPreview) return;

        const canvasFull = document.getElementById('canvas-preview-full');
        if (!canvasFull) return;

        canvasFull.width = canvasPreview.width;
        canvasFull.height = canvasPreview.height;
        const ctx = canvasFull.getContext('2d');
        ctx.drawImage(canvasPreview, 0, 0);
    },

    inicializarEventos: () => {
        const dropZone = document.getElementById('drop-zone');
        const inputArchivo = document.getElementById('input-archivo');

        if (!dropZone || !inputArchivo) return;

        dropZone.addEventListener('click', () => inputArchivo.click());

        inputArchivo.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                moduloEditor.cargarArchivo(e.target.files[0]);
            }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                moduloEditor.cargarArchivo(e.dataTransfer.files[0]);
            }
        });

        // Cerrar dropdown al hacer click afuera
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('color-picker-dropdown');
            const btn = document.getElementById('btn-color-picker');
            if (dropdown && !dropdown.contains(e.target) && !btn?.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Cargar API keys guardadas
        const inputApiKey = document.getElementById('input-api-key');
        if (inputApiKey && apiKeyGemini) inputApiKey.value = apiKeyGemini;
        const inputApiKeyOA = document.getElementById('input-api-key-openai');
        if (inputApiKeyOA && apiKeyOpenAI) inputApiKeyOA.value = apiKeyOpenAI;
    },

    inicializarEventosPincel: () => {
        // Eventos para canvas en vista dividida
        moduloEditor.agregarEventosPincelACanvas('canvas-preview', 'canvas-wrapper', 'pincel-cursor');
        // Eventos para canvas en vista completa
        moduloEditor.agregarEventosPincelACanvas('canvas-preview-full', 'canvas-wrapper-full', 'pincel-cursor-full');
    },

    agregarEventosPincelACanvas: (canvasId, wrapperId, cursorId) => {
        const canvas = document.getElementById(canvasId);
        const cursor = document.getElementById(cursorId);

        if (!canvas) return;

        canvas.addEventListener('mousedown', (e) => {
            if (!pincelActivo) return;
            pintando = true;
            moduloEditor.pintar(e, canvasId);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!pincelActivo) return;
            moduloEditor.moverCursor(e, wrapperId, cursorId);
            if (pintando) {
                moduloEditor.pintar(e, canvasId);
            }
        });

        canvas.addEventListener('mouseup', () => pintando = false);
        canvas.addEventListener('mouseleave', () => {
            pintando = false;
            if (cursor) cursor.classList.add('hidden');
        });

        canvas.addEventListener('mouseenter', () => {
            if (pincelActivo && cursor) cursor.classList.remove('hidden');
        });

        canvas.addEventListener('touchstart', (e) => {
            if (!pincelActivo) return;
            e.preventDefault();
            pintando = true;
            moduloEditor.pintar(e.touches[0], canvasId);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (!pincelActivo || !pintando) return;
            e.preventDefault();
            moduloEditor.pintar(e.touches[0], canvasId);
        }, { passive: false });

        canvas.addEventListener('touchend', () => pintando = false);
    },

    moverCursor: (e, wrapperId, cursorId) => {
        const cursor = document.getElementById(cursorId);
        const wrapper = document.getElementById(wrapperId);
        if (!cursor || !wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        cursor.style.width = `${pincelTamano}px`;
        cursor.style.height = `${pincelTamano}px`;
        cursor.style.left = `${x - pincelTamano/2}px`;
        cursor.style.top = `${y - pincelTamano/2}px`;
    },

    pintar: (e, canvasId) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !canvasProcesado || !canvasOriginalData) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const ctx = canvas.getContext('2d');
        const radius = (pincelTamano / 2) * scaleX;

        let sourceData;
        if (pincelModo === 'restaurar') {
            sourceData = canvasOriginalData;
        } else {
            const ctxProc = canvasProcesado.getContext('2d');
            sourceData = ctxProc.getImageData(0, 0, canvasProcesado.width, canvasProcesado.height);
        }

        const destData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        for (let py = Math.max(0, Math.floor(y - radius)); py < Math.min(canvas.height, Math.ceil(y + radius)); py++) {
            for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(canvas.width, Math.ceil(x + radius)); px++) {
                const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
                if (dist <= radius) {
                    const idx = (py * canvas.width + px) * 4;
                    const alpha = dist > radius * 0.7 ? (radius - dist) / (radius * 0.3) : 1;

                    destData.data[idx] = destData.data[idx] * (1 - alpha) + sourceData.data[idx] * alpha;
                    destData.data[idx + 1] = destData.data[idx + 1] * (1 - alpha) + sourceData.data[idx + 1] * alpha;
                    destData.data[idx + 2] = destData.data[idx + 2] * (1 - alpha) + sourceData.data[idx + 2] * alpha;
                }
            }
        }

        ctx.putImageData(destData, 0, 0);

        // Sincronizar con el otro canvas
        moduloEditor.sincronizarCanvas(canvasId);
    },

    sincronizarCanvas: (sourceCanvasId) => {
        const sourceCanvas = document.getElementById(sourceCanvasId);
        const targetCanvasId = sourceCanvasId === 'canvas-preview' ? 'canvas-preview-full' : 'canvas-preview';
        const targetCanvas = document.getElementById(targetCanvasId);

        if (sourceCanvas && targetCanvas) {
            targetCanvas.width = sourceCanvas.width;
            targetCanvas.height = sourceCanvas.height;
            const ctx = targetCanvas.getContext('2d');
            ctx.drawImage(sourceCanvas, 0, 0);
        }
    },

    togglePincel: () => {
        pincelActivo = !pincelActivo;
        const btn = document.getElementById('btn-pincel-toggle');
        const opciones = document.getElementById('pincel-opciones');
        const indicator = document.getElementById('pincel-indicator');
        const cursors = document.querySelectorAll('#pincel-cursor, #pincel-cursor-full');
        const canvases = document.querySelectorAll('#canvas-preview, #canvas-preview-full');

        if (pincelActivo) {
            btn.classList.remove('bg-gray-100', 'text-gray-600');
            btn.classList.add('bg-amber-500', 'text-white');
            opciones.classList.remove('hidden');
            if (indicator) indicator.classList.remove('hidden');
            canvases.forEach(c => c.style.cursor = 'none');
        } else {
            btn.classList.add('bg-gray-100', 'text-gray-600');
            btn.classList.remove('bg-amber-500', 'text-white');
            opciones.classList.add('hidden');
            if (indicator) indicator.classList.add('hidden');
            cursors.forEach(c => c.classList.add('hidden'));
            canvases.forEach(c => c.style.cursor = 'crosshair');
        }
    },

    cambiarModoPincel: (modo) => {
        pincelModo = modo;
    },

    cambiarTamanoPincel: (valor) => {
        pincelTamano = parseInt(valor);
    },

    resetearPinceladas: () => {
        if (!canvasProcesado) return;

        // Restaurar ambos canvas
        ['canvas-preview', 'canvas-preview-full'].forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.drawImage(canvasProcesado, 0, 0);
            }
        });
        mostrarNotificacion('Pinceladas eliminadas', 'info');
    },

    cargarArchivo: async (archivo) => {
        const validacion = validarArchivo(archivo, APP_CONFIG);
        if (!validacion.valido) {
            mostrarNotificacion(validacion.errores[0], 'error');
            return;
        }

        try {
            imagenDataURL = await leerArchivoComoDataURL(archivo);
            imagenOriginal = await cargarImagen(imagenDataURL);
            nombreArchivo = archivo.name;

            document.getElementById('drop-zone').classList.add('hidden');
            document.getElementById('preview-container').classList.remove('hidden');
            document.getElementById('nombre-archivo').textContent = nombreArchivo;

            // Setear imágenes originales
            document.getElementById('img-original').src = imagenDataURL;
            document.getElementById('img-original-full').src = imagenDataURL;

            canvasPreview = document.getElementById('canvas-preview');
            canvasProcesado = document.createElement('canvas');

            document.getElementById('btn-descargar').disabled = false;
            document.getElementById('btn-pincel-toggle').disabled = false;
            document.getElementById('btn-ia').disabled = false;

            moduloEditor.inicializarEventosPincel();
            moduloEditor.actualizarPreview();

            mostrarNotificacion('Imagen cargada', 'success');
        } catch (error) {
            console.error('Error al cargar imagen:', error);
            mostrarNotificacion('Error al cargar la imagen', 'error');
        }
    },

    quitarImagen: () => {
        imagenOriginal = null;
        imagenDataURL = null;
        nombreArchivo = null;
        canvasProcesado = null;
        canvasOriginalData = null;
        canvasResultadoIA = null;
        imagenBaseIA = null;
        pincelActivo = false;

        document.getElementById('drop-zone').classList.remove('hidden');
        document.getElementById('preview-container').classList.add('hidden');
        document.getElementById('btn-descargar').disabled = true;
        document.getElementById('btn-pincel-toggle').disabled = true;
        document.getElementById('btn-ia').disabled = true;
        document.getElementById('input-archivo').value = '';

        // Ocultar indicador IA
        moduloEditor.mostrarIndicadorIA(false);

        // Reset pincel
        const btn = document.getElementById('btn-pincel-toggle');
        const opciones = document.getElementById('pincel-opciones');
        if (btn) {
            btn.classList.add('bg-gray-100', 'text-gray-600');
            btn.classList.remove('bg-amber-500', 'text-white');
        }
        if (opciones) opciones.classList.add('hidden');
    },

    aplicarColorHex: (hex) => {
        const hexClean = hex.replace('#', '');
        if (!/^[0-9A-Fa-f]{6}$/.test(hexClean)) {
            mostrarNotificacion('Formato hex inválido', 'warning');
            return;
        }

        const r = parseInt(hexClean.substring(0, 2), 16);
        const g = parseInt(hexClean.substring(2, 4), 16);
        const b = parseInt(hexClean.substring(4, 6), 16);
        const hsl = rgbToHsl(r, g, b);

        configActual.hue = hsl.h;
        configActual.saturacion = hsl.s;
        configActual.colorHex = `#${hexClean}`;

        document.getElementById('slider-hue').value = hsl.h;
        document.getElementById('slider-saturacion').value = hsl.s;
        document.getElementById('valor-hue').textContent = `${hsl.h}°`;
        document.getElementById('valor-saturacion').textContent = `${hsl.s}%`;
        document.getElementById('input-color-picker').value = `#${hexClean}`;
        document.getElementById('input-hex').value = `#${hexClean}`;
        moduloEditor.actualizarColorDisplay(`#${hexClean}`);

        guardarUltimoColor();
        moduloEditor.actualizarPreview();
    },

    aplicarPreset: (hue, saturacion, colorHex) => {
        configActual.hue = hue;
        configActual.saturacion = saturacion;
        configActual.colorHex = colorHex;

        document.getElementById('slider-hue').value = hue;
        document.getElementById('slider-saturacion').value = saturacion;
        document.getElementById('valor-hue').textContent = `${hue}°`;
        document.getElementById('valor-saturacion').textContent = `${saturacion}%`;
        document.getElementById('input-color-picker').value = colorHex;
        document.getElementById('input-hex').value = colorHex;
        moduloEditor.actualizarColorDisplay(colorHex);

        guardarUltimoColor();

        // Cerrar dropdown
        document.getElementById('color-picker-dropdown')?.classList.add('hidden');

        moduloEditor.actualizarPreview();
    },

    actualizarHue: (valor) => {
        configActual.hue = parseInt(valor);
        document.getElementById('valor-hue').textContent = `${valor}°`;
        moduloEditor.actualizarHexDesdeHSL();
        guardarUltimoColor();
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarSaturacion: (valor) => {
        configActual.saturacion = parseInt(valor);
        document.getElementById('valor-saturacion').textContent = `${valor}%`;
        moduloEditor.actualizarHexDesdeHSL();
        guardarUltimoColor();
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarHexDesdeHSL: () => {
        const rgb = hslToRgb(configActual.hue, configActual.saturacion, 50);
        const hex = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
        configActual.colorHex = hex;
        document.getElementById('input-color-picker').value = hex;
        document.getElementById('input-hex').value = hex;
        moduloEditor.actualizarColorDisplay(hex);
    },

    actualizarTolerancia: (valor) => {
        configActual.toleranciaSaturacion = parseInt(valor);
        document.getElementById('valor-tolerancia').textContent = valor;
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarLuminosidad: () => {
        configActual.luminosidadMin = parseInt(document.getElementById('input-lum-min').value) || 10;
        configActual.luminosidadMax = parseInt(document.getElementById('input-lum-max').value) || 90;
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarBrillo: (valor) => {
        configActual.brillo = parseInt(valor);
        document.getElementById('valor-brillo').textContent = valor;
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarContraste: (valor) => {
        configActual.contraste = parseInt(valor);
        document.getElementById('valor-contraste').textContent = valor;
        moduloEditor.actualizarPreviewDebounced();
    },

    actualizarPreviewDebounced: () => {
        if (previewTimeout) clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => {
            moduloEditor.actualizarPreview();
        }, 80);
    },

    actualizarPreview: () => {
        if (!imagenOriginal || !canvasPreview) return;

        // Usar imagen de IA como base si existe, sino la original
        const imagenBase = imagenBaseIA || imagenOriginal;

        const resultado = imageProcessor.generarPreview(imagenBase, configActual, 800);

        // Guardar en canvas procesado
        canvasProcesado.width = resultado.canvas.width;
        canvasProcesado.height = resultado.canvas.height;
        const ctxProc = canvasProcesado.getContext('2d');
        ctxProc.drawImage(resultado.canvas, 0, 0);

        // Guardar datos originales
        const canvasOrig = document.createElement('canvas');
        canvasOrig.width = resultado.canvas.width;
        canvasOrig.height = resultado.canvas.height;
        const ctxOrig = canvasOrig.getContext('2d');
        ctxOrig.drawImage(imagenOriginal, 0, 0, resultado.canvas.width, resultado.canvas.height);
        canvasOriginalData = ctxOrig.getImageData(0, 0, canvasOrig.width, canvasOrig.height);

        // Actualizar ambos canvas
        ['canvas-preview', 'canvas-preview-full'].forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                canvas.width = resultado.canvas.width;
                canvas.height = resultado.canvas.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(resultado.canvas, 0, 0);
            }
        });
    },

    descargar: () => {
        if (!imagenOriginal) return;

        let dataURL;
        const nombreBase = nombreArchivo.replace(/\.[^/.]+$/, '');

        if (canvasResultadoIA) {
            // Descargar el resultado de IA directamente sin re-procesar
            dataURL = canvasResultadoIA.toDataURL('image/jpeg', 0.95);
        } else {
            // Procesar en alta calidad con la configuración actual
            const resultado = imageProcessor.procesar(imagenOriginal, {
                ...configActual,
                formato: 'image/jpeg',
                calidad: 0.95
            });
            dataURL = resultado.canvas.toDataURL('image/jpeg', 0.95);
        }

        const sufijo = canvasResultadoIA ? '_ia_editada' : '_procesada';
        const nuevoNombre = `${nombreBase}${sufijo}.jpg`;
        descargarArchivo(dataURL, nuevoNombre);
        mostrarNotificacion('Imagen descargada', 'success');
    },

    resetearAjustes: () => {
        configActual = {
            modo: 'tono',
            hue: 80,
            saturacion: 35,
            colorHex: '#6B8E23',
            toleranciaSaturacion: 30,
            luminosidadMin: 10,
            luminosidadMax: 90,
            brillo: 0,
            contraste: 0
        };

        document.getElementById('slider-hue').value = 80;
        document.getElementById('slider-saturacion').value = 35;
        document.getElementById('slider-tolerancia').value = 30;
        document.getElementById('slider-brillo').value = 0;
        document.getElementById('slider-contraste').value = 0;
        document.getElementById('valor-hue').textContent = '80°';
        document.getElementById('valor-saturacion').textContent = '35%';
        document.getElementById('valor-tolerancia').textContent = '30';
        document.getElementById('valor-brillo').textContent = '0';
        document.getElementById('valor-contraste').textContent = '0';
        document.getElementById('input-lum-min').value = 10;
        document.getElementById('input-lum-max').value = 90;
        document.getElementById('input-color-picker').value = '#6B8E23';
        document.getElementById('input-hex').value = '#6B8E23';
        moduloEditor.actualizarColorDisplay('#6B8E23');

        moduloEditor.actualizarPreview();
        mostrarNotificacion('Ajustes reseteados', 'info');
    },

    toggleColorPicker: () => {
        const dropdown = document.getElementById('color-picker-dropdown');
        if (dropdown) {
            const wasHidden = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden');
            if (wasHidden) {
                moduloEditor.onColorPickerOpen();
            }
        }
    },

    actualizarColorDisplay: (hex) => {
        const preview = document.getElementById('color-preview');
        const display = document.getElementById('color-hex-display');
        if (preview) preview.style.backgroundColor = hex;
        if (display) display.textContent = hex;
    },

    cambiarProveedor: (prov) => {
        proveedorIA = prov;
        localStorage.setItem('fotosapp_editor_proveedor', prov);
        document.getElementById('btn-prov-gemini-ed')?.classList.toggle('bg-brand', prov === 'gemini');
        document.getElementById('btn-prov-gemini-ed')?.classList.toggle('text-white', prov === 'gemini');
        document.getElementById('btn-prov-gemini-ed')?.classList.toggle('bg-gray-100', prov !== 'gemini');
        document.getElementById('btn-prov-gemini-ed')?.classList.toggle('text-gray-600', prov !== 'gemini');
        document.getElementById('btn-prov-openai-ed')?.classList.toggle('bg-brand', prov === 'openai');
        document.getElementById('btn-prov-openai-ed')?.classList.toggle('text-white', prov === 'openai');
        document.getElementById('btn-prov-openai-ed')?.classList.toggle('bg-gray-100', prov !== 'openai');
        document.getElementById('btn-prov-openai-ed')?.classList.toggle('text-gray-600', prov !== 'openai');
        document.getElementById('config-gemini-ed')?.classList.toggle('hidden', prov !== 'gemini');
        document.getElementById('config-openai-ed')?.classList.toggle('hidden', prov !== 'openai');
        mostrarNotificacion(`Proveedor: ${prov === 'gemini' ? 'Gemini' : 'OpenAI'}`, 'info');
    },

    guardarApiKeyGemini: (key) => {
        apiKeyGemini = key;
        localStorage.setItem('fotosapp_gemini_key', key);
        mostrarNotificacion('API Key Gemini guardada', 'success');
    },

    guardarApiKeyOpenAI: (key) => {
        apiKeyOpenAI = key;
        localStorage.setItem('fotosapp_openai_key', key);
        mostrarNotificacion('API Key OpenAI guardada', 'success');
    },

    cambiarCalidadOpenAI: (valor) => {
        calidadOpenAI = valor;
        localStorage.setItem('fotosapp_openai_calidad', valor);
    },

    procesarConIA: async () => {
        if (!imagenOriginal) {
            mostrarNotificacion('Primero carga una imagen', 'warning');
            return;
        }

        // Validar API key según proveedor
        const apiKeyActiva = proveedorIA === 'openai' ? apiKeyOpenAI : apiKeyGemini;
        if (!apiKeyActiva) {
            mostrarNotificacion(`Configura tu API Key de ${proveedorIA === 'openai' ? 'OpenAI' : 'Gemini'} en ⚙️`, 'warning');
            return;
        }

        if (procesandoIA) return;

        procesandoIA = true;
        const btnIA = document.getElementById('btn-ia');
        btnIA.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>IA';
        btnIA.disabled = true;

        try {
            // Convertir imagen a base64
            const canvas = document.createElement('canvas');
            canvas.width = imagenOriginal.naturalWidth || imagenOriginal.width;
            canvas.height = imagenOriginal.naturalHeight || imagenOriginal.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imagenOriginal, 0, 0);

            // Reducir tamaño si es muy grande
            const maxSize = 1024;
            let width = canvas.width;
            let height = canvas.height;
            if (width > maxSize || height > maxSize) {
                const scale = maxSize / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = width;
                tempCanvas.height = height;
                tempCanvas.getContext('2d').drawImage(canvas, 0, 0, width, height);
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(tempCanvas, 0, 0);
            }

            const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            const colorDescripcion = configActual.colorHex;

            const promptIA = `You are a product photo background color changer. Your ONLY job is to change the background tone/color.

TASK: Change the background color of this product photo to ${colorDescripcion}.

ABSOLUTE RULES — ZERO EXCEPTIONS:
- The product/object must remain PIXEL-PERFECT IDENTICAL to the original
- Do NOT alter the product's colors, shadows, reflections, texture, shape, edges, or ANY detail
- Do NOT relight, enhance, smooth, sharpen, or "improve" the product in any way
- Do NOT change the product's shadow on the background
- ONLY recolor the flat background areas (the neutral/gray studio backdrop) to ${colorDescripcion}
- Keep the original background's natural lighting gradients and subtle texture variations, just shift the hue/tone to the target color
- Output must have the exact same framing, resolution, and composition`;

            let imageData;

            if (proveedorIA === 'openai') {
                // === OpenAI gpt-image ===
                const formData = new FormData();
                formData.append('model', 'gpt-image-1');
                formData.append('prompt', promptIA);
                formData.append('image[]', base64ABlob(base64, 'image/jpeg'), 'product.jpg');
                formData.append('size', 'auto');
                formData.append('quality', calidadOpenAI);

                const response = await fetch('https://api.openai.com/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKeyOpenAI}` },
                    body: formData
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `Error HTTP ${response.status}`);
                }

                const result = await response.json();
                if (!result.data?.[0]?.b64_json) {
                    throw new Error('OpenAI no generó una imagen. Intenta de nuevo.');
                }
                imageData = result.data[0].b64_json;

            } else {
                // === Gemini 3 Pro Image ===
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKeyGemini}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: promptIA },
                                { inlineData: { mimeType: 'image/jpeg', data: base64 } }
                            ]
                        }],
                        generationConfig: {
                            responseModalities: ['IMAGE', 'TEXT']
                        }
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || 'Error de API');
                }

                const result = await response.json();
                imageData = null;
                for (const part of result.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageData = part.inlineData.data;
                        break;
                    }
                }

                if (!imageData) {
                    throw new Error('Gemini no generó una imagen. Intenta con otra foto.');
                }
            }

            // Cargar imagen generada
            const imgGenerada = new Image();
            imgGenerada.onload = () => {
                // Actualizar canvas preview
                ['canvas-preview', 'canvas-preview-full'].forEach(id => {
                    const c = document.getElementById(id);
                    if (c) {
                        c.width = imgGenerada.width;
                        c.height = imgGenerada.height;
                        c.getContext('2d').drawImage(imgGenerada, 0, 0);
                    }
                });

                // Guardar para descarga
                canvasProcesado.width = imgGenerada.width;
                canvasProcesado.height = imgGenerada.height;
                canvasProcesado.getContext('2d').drawImage(imgGenerada, 0, 0);

                // Guardar resultado de IA para ajustes posteriores
                canvasResultadoIA = document.createElement('canvas');
                canvasResultadoIA.width = imgGenerada.width;
                canvasResultadoIA.height = imgGenerada.height;
                canvasResultadoIA.getContext('2d').drawImage(imgGenerada, 0, 0);

                // Guardar como imagen base editable (permite ajustar tono/brillo después)
                imagenBaseIA = imgGenerada;

                // Mostrar indicador de que estamos editando resultado de IA
                moduloEditor.mostrarIndicadorIA(true);

                mostrarNotificacion('Imagen procesada con IA - Ahora puedes ajustar tono y brillo', 'success');
            };
            imgGenerada.src = `data:image/png;base64,${imageData}`;

        } catch (error) {
            console.error('Error IA:', error);
            mostrarNotificacion(`Error: ${error.message}`, 'error');
        } finally {
            procesandoIA = false;
            btnIA.innerHTML = '<i class="fas fa-magic mr-1"></i>IA';
            btnIA.disabled = false;
        }
    },

    // === Funciones de Color Picker mejorado ===

    previsualizarColor: (hex) => {
        const hexClean = hex.replace('#', '');
        if (!/^[0-9A-Fa-f]{6}$/.test(hexClean)) return;

        // Actualizar inputs
        document.getElementById('input-color-picker').value = `#${hexClean}`;
        document.getElementById('input-hex').value = `#${hexClean}`;

        // Actualizar preview en mini canvas
        moduloEditor.actualizarPreviewColor(`#${hexClean}`);
    },

    actualizarPreviewColor: (hex) => {
        const previewCanvas = document.getElementById('color-preview-canvas');
        if (!previewCanvas || !imagenOriginal) return;

        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        const hsl = rgbToHsl(r, g, b);

        // Crear mini preview (100x100)
        const size = 100;
        previewCanvas.width = size;
        previewCanvas.height = size;
        const ctx = previewCanvas.getContext('2d');

        // Dibujar imagen escalada
        const scale = Math.min(size / imagenOriginal.width, size / imagenOriginal.height);
        const w = imagenOriginal.width * scale;
        const h = imagenOriginal.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(imagenOriginal, x, y, w, h);

        // Aplicar cambio de color al preview
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const pr = data[i], pg = data[i + 1], pb = data[i + 2];
            const pixelHsl = rgbToHsl(pr, pg, pb);

            if (pixelHsl.s <= configActual.toleranciaSaturacion &&
                pixelHsl.l >= configActual.luminosidadMin &&
                pixelHsl.l <= configActual.luminosidadMax) {
                const newRgb = hslToRgb(hsl.h, hsl.s, pixelHsl.l);
                data[i] = newRgb.r;
                data[i + 1] = newRgb.g;
                data[i + 2] = newRgb.b;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    },

    guardarColorActual: () => {
        const hex = configActual.colorHex;
        if (!misColores.includes(hex)) {
            misColores.unshift(hex);
            if (misColores.length > 8) misColores.pop(); // Máximo 8 colores
            localStorage.setItem('fotosapp_mis_colores', JSON.stringify(misColores));
            moduloEditor.renderizarMisColores();
            mostrarNotificacion('Color guardado', 'success');
        } else {
            mostrarNotificacion('Color ya guardado', 'info');
        }
    },

    renderizarMisColores: () => {
        const container = document.getElementById('mis-colores-container');
        if (!container) return;

        if (misColores.length === 0) {
            container.innerHTML = '<span class="text-gray-400 text-xs">Sin colores guardados</span>';
            return;
        }

        container.innerHTML = misColores.map((color, idx) => `
            <div class="relative group">
                <button onclick="moduloEditor.aplicarColorHex('${color}')"
                    class="w-6 h-6 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                    style="background-color: ${color}"
                    title="${color}">
                </button>
                <button onclick="moduloEditor.eliminarColorGuardado(${idx})"
                    class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white rounded-full text-[8px] hidden group-hover:flex items-center justify-center"
                    title="Eliminar">×</button>
            </div>
        `).join('');
    },

    eliminarColorGuardado: (idx) => {
        misColores.splice(idx, 1);
        localStorage.setItem('fotosapp_mis_colores', JSON.stringify(misColores));
        moduloEditor.renderizarMisColores();
        mostrarNotificacion('Color eliminado', 'info');
    },

    // Inicializar preview cuando se abre el color picker
    onColorPickerOpen: () => {
        moduloEditor.renderizarMisColores();
        if (imagenOriginal) {
            moduloEditor.actualizarPreviewColor(configActual.colorHex);
        }
    },

    // Mostrar/ocultar indicador de que estamos editando resultado de IA
    mostrarIndicadorIA: (mostrar) => {
        let indicador = document.getElementById('indicador-ia');

        if (mostrar) {
            if (!indicador) {
                // Crear indicador si no existe
                const container = document.querySelector('#preview-container .px-2.py-1');
                if (container) {
                    const indicadorHTML = `
                        <span id="indicador-ia" class="ml-2 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] rounded-full flex items-center gap-1">
                            <i class="fas fa-magic"></i>
                            <span>IA</span>
                            <button onclick="moduloEditor.resetearAOriginal()" class="ml-1 hover:text-yellow-200" title="Volver a imagen original">
                                <i class="fas fa-undo"></i>
                            </button>
                        </span>
                    `;
                    container.querySelector('.flex.items-center.gap-2').insertAdjacentHTML('beforeend', indicadorHTML);
                }
            }
        } else {
            if (indicador) {
                indicador.remove();
            }
        }
    },

    // Resetear a la imagen original (descartar resultado de IA)
    resetearAOriginal: () => {
        imagenBaseIA = null;
        canvasResultadoIA = null;
        moduloEditor.mostrarIndicadorIA(false);
        moduloEditor.actualizarPreview();
        mostrarNotificacion('Volviendo a imagen original', 'info');
    }
};

function rgbToHsl(r, g, b) {
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
}

window.moduloEditor = moduloEditor;
