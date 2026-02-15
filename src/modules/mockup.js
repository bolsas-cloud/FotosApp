/**
 * Módulo Mockup - Generación de mockups fotorrealistas de estampado
 * Permite posicionar un logo sobre múltiples fotos de bolsas y generar
 * mockups realistas usando IA (Gemini o OpenAI)
 *
 * Features: Zoom, múltiples bolsas, editor visual drag/resize/rotate
 */

import { APP_CONFIG } from '../config.js';
import { mostrarNotificacion, leerArchivoComoDataURL, cargarImagen, descargarArchivo, validarArchivo } from '../utils.js';

// === Estado del módulo ===

// Múltiples bolsas — cada entrada: { imagen, dataURL, nombre, diseno: {x,y,ancho,alto,escala,rotacion}, resultadoIA }
let bolsas = [];
let bolsaActualIdx = -1;

// Logo/diseño (único, compartido por todas las bolsas)
let imagenDiseno = null;
let imagenDisenoDataURL = null;
let nombreDiseno = '';

// Canvas editor
let canvasEditor = null;
let ctxEditor = null;
let canvasAncho = 0;
let canvasAlto = 0;
let escalaDisplay = 1;

// Escala inicial del diseño (calculada al posicionar)
let escalaInicialDiseno = 1;

// Zoom
let zoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

// Interacción
let arrastrando = false;
let redimensionando = false;
let handleActivo = null;
let offsetArrastre = { x: 0, y: 0 };
let distanciaInicialHandle = 0;
let escalaInicialHandle = 0;
let panning = false;
let panStart = { x: 0, y: 0 };
let panScrollStart = { x: 0, y: 0 };

// Resultado IA
let procesandoIA = false;

// Configuración
let proveedor = localStorage.getItem('fotosapp_mockup_proveedor') || 'gemini';
let apiKeyGemini = localStorage.getItem('fotosapp_gemini_key') || '';
let apiKeyOpenAI = localStorage.getItem('fotosapp_openai_key') || '';
let calidadOpenAI = localStorage.getItem('fotosapp_openai_calidad') || 'medium';
let configVisible = false;

// Prompt para la IA
const PROMPT_MOCKUP = `I have three images:
1. A photograph of a canvas/linen tote bag
2. A logo or design to be screen-printed on the bag
3. A composite mockup showing exactly where the logo should be placed on the bag

Generate a photorealistic mockup of this bag with the logo/design printed on it. The logo must:
- Follow the fabric texture, folds, and wrinkles of the bag naturally
- Match the lighting and shadows of the original photo
- Look like a real screen-printed or heat-transfer design on the fabric
- Be at the exact position and size shown in the composite image (image 3)
- Have subtle imperfections typical of real fabric printing (texture bleed through)

Return ONLY the final photorealistic bag image. Keep the same framing and background as image 1.`;

// === Helpers de estado ===

function getBolsa() {
    return bolsas[bolsaActualIdx] || null;
}

function getDiseno() {
    const b = getBolsa();
    return b ? b.diseno : null;
}

// === Funciones de renderizado del canvas ===

function renderizarEditor() {
    const bolsa = getBolsa();
    if (!canvasEditor || !bolsa) return;
    const ctx = ctxEditor;
    const d = bolsa.diseno;

    ctx.clearRect(0, 0, canvasAncho, canvasAlto);

    // Dibujar bolsa de fondo
    ctx.drawImage(bolsa.imagen, 0, 0, canvasAncho, canvasAlto);

    // Dibujar diseño si existe
    if (imagenDiseno && d) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotacion * Math.PI / 180);
        ctx.drawImage(imagenDiseno, -d.ancho / 2, -d.alto / 2, d.ancho, d.alto);
        ctx.restore();

        // Handles si no hay resultado IA en esta bolsa
        if (!bolsa.resultadoIA) {
            dibujarHandles(ctx, d);
        }
    }
}

function obtenerEsquinas(d) {
    const hw = d.ancho / 2;
    const hh = d.alto / 2;
    const rad = d.rotacion * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
        { dx: -hw, dy: -hh },
        { dx: hw, dy: -hh },
        { dx: hw, dy: hh },
        { dx: -hw, dy: hh }
    ].map(p => ({
        x: d.x + p.dx * cos - p.dy * sin,
        y: d.y + p.dx * sin + p.dy * cos
    }));
}

function dibujarHandles(ctx, d) {
    const esquinas = obtenerEsquinas(d);

    // Borde punteado
    ctx.beginPath();
    ctx.moveTo(esquinas[0].x, esquinas[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(esquinas[i].x, esquinas[i].y);
    ctx.closePath();
    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 1.5 / zoom; // Compensar zoom para grosor constante
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Handles
    const radio = 6 / zoom;
    esquinas.forEach(p => {
        ctx.fillStyle = '#7C3AED';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

// === Hit detection ===

function detectarHandle(mx, my) {
    const d = getDiseno();
    if (!d) return null;
    const esquinas = obtenerEsquinas(d);
    const nombres = ['tl', 'tr', 'br', 'bl'];
    const umbral = 14 / zoom;
    for (let i = 0; i < 4; i++) {
        if (Math.hypot(mx - esquinas[i].x, my - esquinas[i].y) < umbral) return nombres[i];
    }
    return null;
}

function puntoEnDiseno(mx, my) {
    const d = getDiseno();
    if (!d) return false;
    const rad = -d.rotacion * Math.PI / 180;
    const dx = mx - d.x;
    const dy = my - d.y;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(rx) <= d.ancho / 2 && Math.abs(ry) <= d.alto / 2;
}

function obtenerCoordsCanvas(e) {
    const rect = canvasEditor.getBoundingClientRect();
    const scaleX = canvasEditor.width / rect.width;
    const scaleY = canvasEditor.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// === Eventos del canvas ===

function onPointerDown(e) {
    const bolsa = getBolsa();
    if (!imagenDiseno || !bolsa) return;
    if (bolsa.resultadoIA) return;

    // Middle click o Ctrl+click = pan
    if (e.button === 1 || (e.ctrlKey && e.button === 0)) {
        e.preventDefault();
        panning = true;
        const container = document.getElementById('canvas-scroll-mockup');
        panStart = { x: e.clientX, y: e.clientY };
        panScrollStart = { x: container.scrollLeft, y: container.scrollTop };
        canvasEditor.style.cursor = 'move';
        return;
    }

    e.preventDefault();
    const { x: mx, y: my } = obtenerCoordsCanvas(e);
    const d = bolsa.diseno;

    // Verificar handles
    const handle = detectarHandle(mx, my);
    if (handle) {
        redimensionando = true;
        handleActivo = handle;
        distanciaInicialHandle = Math.hypot(mx - d.x, my - d.y);
        escalaInicialHandle = d.escala;
        return;
    }

    // Dentro del diseño → arrastrar
    if (puntoEnDiseno(mx, my)) {
        arrastrando = true;
        offsetArrastre = { x: mx - d.x, y: my - d.y };
        canvasEditor.style.cursor = 'grabbing';
    }
}

function onPointerMove(e) {
    if (panning) {
        const container = document.getElementById('canvas-scroll-mockup');
        container.scrollLeft = panScrollStart.x - (e.clientX - panStart.x);
        container.scrollTop = panScrollStart.y - (e.clientY - panStart.y);
        return;
    }

    const bolsa = getBolsa();
    if (!imagenDiseno || !bolsa || bolsa.resultadoIA) return;
    e.preventDefault();

    const { x: mx, y: my } = obtenerCoordsCanvas(e);
    const d = bolsa.diseno;

    if (arrastrando) {
        d.x = mx - offsetArrastre.x;
        d.y = my - offsetArrastre.y;
        renderizarEditor();
        return;
    }

    if (redimensionando) {
        const dist = Math.hypot(mx - d.x, my - d.y);
        const nuevaEscala = escalaInicialHandle * (dist / distanciaInicialHandle);
        d.escala = Math.max(0.05, Math.min(3, nuevaEscala));
        d.ancho = imagenDiseno.width * escalaInicialDiseno * d.escala;
        d.alto = imagenDiseno.height * escalaInicialDiseno * d.escala;

        const slider = document.getElementById('slider-escala-mockup');
        if (slider) slider.value = Math.round(d.escala * 100);
        const label = document.getElementById('label-escala-mockup');
        if (label) label.textContent = `${Math.round(d.escala * 100)}%`;

        renderizarEditor();
        return;
    }

    // Cursor
    if (detectarHandle(mx, my)) {
        canvasEditor.style.cursor = 'nwse-resize';
    } else if (puntoEnDiseno(mx, my)) {
        canvasEditor.style.cursor = 'grab';
    } else {
        canvasEditor.style.cursor = 'default';
    }
}

function onPointerUp() {
    arrastrando = false;
    redimensionando = false;
    handleActivo = null;
    panning = false;
    if (canvasEditor) canvasEditor.style.cursor = 'default';
}

function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nuevoZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (nuevoZoom === zoom) return;

    // Guardar posición de scroll relativa al punto del mouse
    const container = document.getElementById('canvas-scroll-mockup');
    const rect = canvasEditor.getBoundingClientRect();
    const mouseRelX = (e.clientX - rect.left) / rect.width;
    const mouseRelY = (e.clientY - rect.top) / rect.height;

    const oldZoom = zoom;
    zoom = nuevoZoom;
    aplicarZoom();

    // Ajustar scroll para mantener el punto bajo el cursor
    const newW = canvasAncho * zoom;
    const newH = canvasAlto * zoom;
    const oldW = canvasAncho * oldZoom;
    const oldH = canvasAlto * oldZoom;
    container.scrollLeft += (newW - oldW) * mouseRelX;
    container.scrollTop += (newH - oldH) * mouseRelY;
}

function aplicarZoom() {
    if (!canvasEditor) return;
    canvasEditor.style.transform = `scale(${zoom})`;
    canvasEditor.style.transformOrigin = 'top left';

    const label = document.getElementById('label-zoom-mockup');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
}

function inicializarEventosCanvas() {
    if (!canvasEditor) return;

    canvasEditor.addEventListener('mousedown', onPointerDown);
    canvasEditor.addEventListener('mousemove', onPointerMove);
    canvasEditor.addEventListener('mouseup', onPointerUp);
    canvasEditor.addEventListener('mouseleave', onPointerUp);
    canvasEditor.addEventListener('wheel', onWheel, { passive: false });

    canvasEditor.addEventListener('touchstart', onPointerDown, { passive: false });
    canvasEditor.addEventListener('touchmove', onPointerMove, { passive: false });
    canvasEditor.addEventListener('touchend', onPointerUp);

    // Prevenir menú contextual (para middle-click pan)
    canvasEditor.addEventListener('contextmenu', e => e.preventDefault());
}

// === Generación de composite ===

function generarCompositeHiRes(bolsa) {
    const b = bolsa || getBolsa();
    if (!b || !imagenDiseno) return null;

    const canvas = document.createElement('canvas');
    const maxSize = 1024;
    let w = b.imagen.naturalWidth || b.imagen.width;
    let h = b.imagen.naturalHeight || b.imagen.height;

    if (w > maxSize || h > maxSize) {
        const s = maxSize / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(b.imagen, 0, 0, w, h);

    const factor = w / canvasAncho;
    const d = b.diseno;

    ctx.save();
    ctx.translate(d.x * factor, d.y * factor);
    ctx.rotate(d.rotacion * Math.PI / 180);
    ctx.drawImage(
        imagenDiseno,
        -(d.ancho * factor) / 2,
        -(d.alto * factor) / 2,
        d.ancho * factor,
        d.alto * factor
    );
    ctx.restore();

    return canvas;
}

function obtenerBase64DeImagen(img, mimeType = 'image/jpeg', quality = 0.85) {
    const canvas = document.createElement('canvas');
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const maxSize = 1024;
    if (w > maxSize || h > maxSize) {
        const s = maxSize / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(mimeType, quality).split(',')[1];
}

function base64ABlob(base64, mimeType) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

// === Llamadas a IA ===

async function llamarGemini(bolsa) {
    const bolsaBase64 = obtenerBase64DeImagen(bolsa.imagen, 'image/jpeg', 0.85);
    const logoBase64 = obtenerBase64DeImagen(imagenDiseno, 'image/png', 1.0);
    const compositeCanvas = generarCompositeHiRes(bolsa);
    const compositeBase64 = compositeCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKeyGemini}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: PROMPT_MOCKUP },
                        { text: 'Image 1 - Original bag photo:' },
                        { inlineData: { mimeType: 'image/jpeg', data: bolsaBase64 } },
                        { text: 'Image 2 - Logo/design to print:' },
                        { inlineData: { mimeType: 'image/png', data: logoBase64 } },
                        { text: 'Image 3 - Composite showing desired placement:' },
                        { inlineData: { mimeType: 'image/jpeg', data: compositeBase64 } }
                    ]
                }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            })
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Error HTTP ${response.status}`);
    }

    const result = await response.json();
    for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) return part.inlineData.data;
    }
    throw new Error('Gemini no generó una imagen.');
}

async function llamarOpenAI(bolsa) {
    const bolsaBase64 = obtenerBase64DeImagen(bolsa.imagen, 'image/jpeg', 0.85);
    const logoBase64 = obtenerBase64DeImagen(imagenDiseno, 'image/png', 1.0);
    const compositeCanvas = generarCompositeHiRes(bolsa);
    const compositeBase64 = compositeCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', PROMPT_MOCKUP);
    formData.append('image[]', base64ABlob(bolsaBase64, 'image/jpeg'), 'bag.jpg');
    formData.append('image[]', base64ABlob(logoBase64, 'image/png'), 'logo.png');
    formData.append('image[]', base64ABlob(compositeBase64, 'image/jpeg'), 'composite.jpg');
    formData.append('size', '1024x1024');
    formData.append('quality', calidadOpenAI);

    const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKeyOpenAI}` },
        body: formData
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Error HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.data?.[0]?.b64_json) return result.data[0].b64_json;
    throw new Error('OpenAI no generó una imagen.');
}

// === Canvas setup ===

function ajustarCanvas() {
    const bolsa = getBolsa();
    const contenedor = document.getElementById('canvas-container-mockup');
    if (!contenedor || !bolsa) return;

    const maxW = contenedor.clientWidth - 16;
    const maxH = contenedor.clientHeight - 16 || 500;
    const imgW = bolsa.imagen.naturalWidth || bolsa.imagen.width;
    const imgH = bolsa.imagen.naturalHeight || bolsa.imagen.height;

    escalaDisplay = Math.min(maxW / imgW, maxH / imgH, 1);
    canvasAncho = Math.round(imgW * escalaDisplay);
    canvasAlto = Math.round(imgH * escalaDisplay);

    canvasEditor.width = canvasAncho;
    canvasEditor.height = canvasAlto;
    zoom = 1;
    aplicarZoom();
}

function posicionarDisenoInicial(bolsa) {
    const b = bolsa || getBolsa();
    if (!imagenDiseno || !b) return;

    const logoW = imagenDiseno.naturalWidth || imagenDiseno.width;
    const logoH = imagenDiseno.naturalHeight || imagenDiseno.height;

    escalaInicialDiseno = (canvasAncho * 0.35) / logoW;
    b.diseno = {
        x: canvasAncho / 2,
        y: canvasAlto / 2,
        ancho: logoW * escalaInicialDiseno,
        alto: logoH * escalaInicialDiseno,
        escala: 1,
        rotacion: 0
    };
}

function sincronizarSliders() {
    const d = getDiseno();
    if (!d) return;
    const slider = document.getElementById('slider-escala-mockup');
    if (slider) slider.value = Math.round(d.escala * 100);
    const label = document.getElementById('label-escala-mockup');
    if (label) label.textContent = `${Math.round(d.escala * 100)}%`;
    const sliderRot = document.getElementById('slider-rotacion-mockup');
    if (sliderRot) sliderRot.value = d.rotacion;
    const labelRot = document.getElementById('label-rotacion-mockup');
    if (labelRot) labelRot.textContent = `${d.rotacion}°`;
}

// === Thumbnails de bolsas ===

function renderizarThumbnailsBolsas() {
    const container = document.getElementById('thumbs-bolsas');
    if (!container) return;

    container.innerHTML = bolsas.map((b, i) => `
        <div class="relative group cursor-pointer flex-shrink-0 ${i === bolsaActualIdx ? 'ring-2 ring-brand' : 'ring-1 ring-gray-200'} rounded overflow-hidden"
            onclick="moduloMockup.seleccionarBolsaIdx(${i})" style="width:60px;height:60px;">
            <img src="${b.dataURL}" class="w-full h-full object-cover" alt="${b.nombre}">
            ${b.resultadoIA ? '<div class="absolute bottom-0 right-0 bg-green-500 text-white text-[8px] px-1 rounded-tl"><i class="fas fa-check"></i></div>' : ''}
            <button onclick="event.stopPropagation(); moduloMockup.quitarBolsa(${i})"
                class="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[8px] rounded-bl items-center justify-center hidden group-hover:flex">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('') + `
        <div class="flex-shrink-0 w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-brand hover:bg-brand-50 transition-colors"
            onclick="document.getElementById('input-bolsa').click()">
            <i class="fas fa-plus text-gray-400"></i>
        </div>
    `;
}

// === Módulo exportado ===

export const moduloMockup = {
    render: async (contenedor) => {
        procesandoIA = false;

        contenedor.innerHTML = `
            <div class="animate-fade-in h-full flex flex-col">
                <!-- Header -->
                <div class="flex items-center justify-between mb-2 flex-shrink-0">
                    <h2 class="text-lg font-bold text-gray-900">Mockup de Estampado</h2>
                    <div class="flex items-center gap-2">
                        <button id="btn-reintentar-mockup" onclick="moduloMockup.generarMockupActual()"
                            class="hidden px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors items-center gap-1">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                        <button id="btn-descargar-mockup" onclick="moduloMockup.descargar()"
                            class="px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            disabled>
                            <i class="fas fa-download"></i>
                            <span class="hidden sm:inline">Descargar</span>
                        </button>
                    </div>
                </div>

                <!-- Controles -->
                <div id="controles-mockup" class="flex flex-wrap items-center gap-3 mb-2 flex-shrink-0 bg-gray-50 rounded-lg px-3 py-2">
                    <!-- Zoom -->
                    <div class="flex items-center gap-1">
                        <button onclick="moduloMockup.zoomOut()" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded text-xs" title="Alejar">
                            <i class="fas fa-search-minus"></i>
                        </button>
                        <span id="label-zoom-mockup" class="text-xs text-gray-500 w-8 text-center">100%</span>
                        <button onclick="moduloMockup.zoomIn()" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded text-xs" title="Acercar">
                            <i class="fas fa-search-plus"></i>
                        </button>
                        <button onclick="moduloMockup.zoomReset()" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-200 rounded text-[10px]" title="Reset zoom">
                            <i class="fas fa-compress-arrows-alt"></i>
                        </button>
                        <div class="w-px h-4 bg-gray-300 mx-1"></div>
                    </div>
                    <!-- Escala logo -->
                    <div class="flex items-center gap-2">
                        <label class="text-xs font-medium text-gray-600 whitespace-nowrap">Escala</label>
                        <input type="range" id="slider-escala-mockup" min="10" max="200" value="100"
                            oninput="moduloMockup.actualizarEscala(this.value)" class="w-20" disabled>
                        <span id="label-escala-mockup" class="text-xs text-gray-500 w-8">100%</span>
                    </div>
                    <!-- Rotación -->
                    <div class="flex items-center gap-2">
                        <label class="text-xs font-medium text-gray-600 whitespace-nowrap">Rotación</label>
                        <input type="range" id="slider-rotacion-mockup" min="-180" max="180" value="0"
                            oninput="moduloMockup.actualizarRotacion(this.value)" class="w-20" disabled>
                        <span id="label-rotacion-mockup" class="text-xs text-gray-500 w-8">0°</span>
                    </div>
                    <!-- Generar -->
                    <div class="ml-auto flex items-center gap-2">
                        <button id="btn-generar-mockup" onclick="moduloMockup.generarMockupActual()"
                            class="px-4 py-1.5 bg-gradient-to-r from-brand to-pink-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            disabled>
                            <i class="fas fa-magic"></i> Generar
                        </button>
                        <button id="btn-generar-todos" onclick="moduloMockup.generarTodos()"
                            class="px-4 py-1.5 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            disabled title="Generar mockup para todas las fotos">
                            <i class="fas fa-layer-group"></i> Generar todos
                        </button>
                        <button onclick="moduloMockup.toggleConfig()"
                            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors" title="Configuración">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>

                <!-- Panel config (oculto) -->
                <div id="panel-config-mockup" class="hidden mb-2 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 animate-fade-in">
                    <h3 class="text-sm font-semibold text-gray-900 mb-3">Configuración de IA</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                            <select id="select-proveedor-mockup" onchange="moduloMockup.cambiarProveedor(this.value)"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                <option value="gemini" ${proveedor === 'gemini' ? 'selected' : ''}>Gemini 3 Pro Image</option>
                                <option value="openai" ${proveedor === 'openai' ? 'selected' : ''}>OpenAI gpt-image</option>
                            </select>
                        </div>
                        <div id="config-calidad-openai" class="${proveedor === 'openai' ? '' : 'hidden'}">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Calidad (OpenAI)</label>
                            <select id="select-calidad-mockup" onchange="moduloMockup.cambiarCalidad(this.value)"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                <option value="medium" ${calidadOpenAI === 'medium' ? 'selected' : ''}>Medium ($0.034/img)</option>
                                <option value="high" ${calidadOpenAI === 'high' ? 'selected' : ''}>High ($0.17/img)</option>
                            </select>
                        </div>
                        <div id="config-key-gemini" class="${proveedor === 'gemini' ? '' : 'hidden'}">
                            <label class="block text-xs font-medium text-gray-600 mb-1">API Key Gemini</label>
                            <input type="password" id="input-key-gemini-mockup" value="${apiKeyGemini}"
                                onchange="moduloMockup.guardarKeyGemini(this.value)" placeholder="AIza..."
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>
                        <div id="config-key-openai" class="${proveedor === 'openai' ? '' : 'hidden'}">
                            <label class="block text-xs font-medium text-gray-600 mb-1">API Key OpenAI</label>
                            <input type="password" id="input-key-openai-mockup" value="${apiKeyOpenAI}"
                                onchange="moduloMockup.guardarKeyOpenAI(this.value)" placeholder="sk-..."
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">
                        ${proveedor === 'gemini' ? 'La API Key de Gemini se comparte con el módulo Editor.' : 'OpenAI usa una API Key independiente.'}
                    </p>
                </div>

                <!-- Contenido principal -->
                <div class="flex-1 min-h-0 flex gap-3">
                    <!-- Panel izquierdo: fotos + logo -->
                    <div class="w-48 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
                        <!-- Fotos de bolsas -->
                        <div class="flex flex-col">
                            <label class="text-xs font-medium text-gray-600 mb-1">Fotos de bolsas</label>
                            <div id="thumbs-bolsas" class="flex flex-wrap gap-1.5 mb-1">
                                <!-- Thumbnails dinámicos + botón agregar -->
                                <div class="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-brand hover:bg-brand-50 transition-colors"
                                    onclick="document.getElementById('input-bolsa').click()">
                                    <i class="fas fa-plus text-gray-400"></i>
                                </div>
                            </div>
                            <input type="file" id="input-bolsa" accept="image/jpeg,image/png,image/webp" multiple class="hidden"
                                onchange="moduloMockup.agregarBolsas(this.files)">
                            <p class="text-[10px] text-gray-400">Podés agregar varias fotos</p>
                        </div>

                        <!-- Logo -->
                        <div class="flex flex-col">
                            <label class="text-xs font-medium text-gray-600 mb-1">Logo / Diseño</label>
                            <div id="drop-diseno" class="drop-zone rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer min-h-[80px] relative"
                                onclick="document.getElementById('input-diseno').click()">
                                <div id="preview-diseno" class="hidden w-full">
                                    <img id="thumb-diseno" class="w-full rounded object-contain max-h-[100px] checkerboard" src="" alt="">
                                    <button onclick="event.stopPropagation(); moduloMockup.quitarDiseno()"
                                        class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                                <div id="placeholder-diseno" class="text-center">
                                    <i class="fas fa-palette text-gray-400 text-xl mb-1"></i>
                                    <p class="text-xs text-gray-500">Logo</p>
                                </div>
                            </div>
                            <input type="file" id="input-diseno" accept="image/jpeg,image/png,image/webp" class="hidden"
                                onchange="moduloMockup.seleccionarDiseno(this.files[0])">
                        </div>

                        <!-- Progreso batch -->
                        <div id="progreso-batch" class="hidden">
                            <div class="bg-gray-100 rounded-lg p-2">
                                <p class="text-xs font-medium text-gray-600 mb-1">Generando mockups...</p>
                                <div class="w-full bg-gray-200 rounded-full h-1.5">
                                    <div id="barra-progreso-batch" class="bg-brand h-1.5 rounded-full transition-all" style="width:0%"></div>
                                </div>
                                <p id="texto-progreso-batch" class="text-[10px] text-gray-400 mt-1">0 / 0</p>
                            </div>
                        </div>

                        <!-- Resetear -->
                        <button onclick="moduloMockup.resetear()"
                            class="mt-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            <i class="fas fa-undo mr-1"></i> Resetear todo
                        </button>
                    </div>

                    <!-- Canvas editor / Resultado -->
                    <div class="flex-1 min-h-0 flex flex-col">
                        <div id="vista-editor-mockup" class="flex-1 min-h-0 bg-gray-100 rounded-lg overflow-hidden">
                            <div id="canvas-container-mockup" class="w-full h-full relative">
                                <div id="canvas-scroll-mockup" class="w-full h-full overflow-auto">
                                    <div id="canvas-wrapper-mockup" class="inline-block p-2">
                                        <canvas id="canvas-editor-mockup" class="rounded shadow-sm" style="display:none;"></canvas>
                                    </div>
                                </div>
                                <div id="placeholder-canvas" class="absolute inset-0 flex items-center justify-center">
                                    <div class="text-center">
                                        <i class="fas fa-tshirt text-gray-300 text-5xl mb-3"></i>
                                        <p class="text-gray-400 text-sm">Agregá fotos de bolsas y un logo para comenzar</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Resultado IA -->
                        <div id="vista-resultado-mockup" class="hidden mt-2 bg-white border border-gray-200 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <h3 class="text-sm font-semibold text-gray-700">Resultado IA</h3>
                                <button onclick="moduloMockup.volverAlEditor()" class="text-xs text-brand hover:underline">
                                    <i class="fas fa-arrow-left mr-1"></i>Volver al editor
                                </button>
                            </div>
                            <div class="flex gap-3 items-start">
                                <div class="flex-1 text-center">
                                    <p class="text-xs text-gray-500 mb-1">Composite</p>
                                    <canvas id="canvas-composite-preview" class="max-w-full rounded border border-gray-200 mx-auto"></canvas>
                                </div>
                                <div class="flex-1 text-center">
                                    <p class="text-xs text-gray-500 mb-1">Mockup IA</p>
                                    <img id="img-resultado-ia" class="max-w-full rounded border border-gray-200 mx-auto" src="" alt="">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Init canvas
        canvasEditor = document.getElementById('canvas-editor-mockup');
        ctxEditor = canvasEditor.getContext('2d');
        inicializarEventosCanvas();

        // Drop en zona diseño
        const zonaDis = document.getElementById('drop-diseno');
        zonaDis.addEventListener('dragover', e => { e.preventDefault(); zonaDis.classList.add('drag-over'); });
        zonaDis.addEventListener('dragleave', () => zonaDis.classList.remove('drag-over'));
        zonaDis.addEventListener('drop', e => {
            e.preventDefault();
            zonaDis.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) moduloMockup.seleccionarDiseno(e.dataTransfer.files[0]);
        });

        // Drop en zona bolsas (todo el panel de thumbs)
        const zonaThumb = document.getElementById('thumbs-bolsas');
        zonaThumb.addEventListener('dragover', e => { e.preventDefault(); zonaThumb.style.outline = '2px dashed #7C3AED'; });
        zonaThumb.addEventListener('dragleave', () => { zonaThumb.style.outline = ''; });
        zonaThumb.addEventListener('drop', e => {
            e.preventDefault();
            zonaThumb.style.outline = '';
            if (e.dataTransfer.files.length) moduloMockup.agregarBolsas(e.dataTransfer.files);
        });

        // Restaurar estado si hay bolsas cargadas
        if (bolsas.length > 0) {
            renderizarThumbnailsBolsas();
            if (bolsaActualIdx >= 0) {
                ajustarCanvas();
                canvasEditor.style.display = 'block';
                document.getElementById('placeholder-canvas').style.display = 'none';
                sincronizarSliders();
                renderizarEditor();
            }
        }
        if (imagenDiseno) {
            document.getElementById('thumb-diseno').src = imagenDisenoDataURL;
            document.getElementById('preview-diseno').classList.remove('hidden');
            document.getElementById('placeholder-diseno').classList.add('hidden');
        }

        actualizarEstadoBotones();
    },

    // === Carga de bolsas (múltiples) ===

    agregarBolsas: async (files) => {
        for (const archivo of files) {
            const validacion = validarArchivo(archivo, APP_CONFIG);
            if (!validacion.valido) {
                mostrarNotificacion(`${archivo.name}: ${validacion.errores[0]}`, 'error');
                continue;
            }

            try {
                const dataURL = await leerArchivoComoDataURL(archivo);
                const imagen = await cargarImagen(dataURL);
                const nombre = archivo.name.replace(/\.[^/.]+$/, '');

                bolsas.push({
                    imagen,
                    dataURL,
                    nombre,
                    diseno: null,
                    resultadoIA: null
                });
            } catch (err) {
                mostrarNotificacion(`Error al cargar ${archivo.name}`, 'error');
            }
        }

        if (bolsas.length > 0 && bolsaActualIdx < 0) {
            moduloMockup.seleccionarBolsaIdx(0);
        } else {
            renderizarThumbnailsBolsas();
            // Posicionar diseño en las nuevas bolsas si ya hay logo
            if (imagenDiseno) {
                bolsas.forEach(b => {
                    if (!b.diseno) posicionarDisenoInicial(b);
                });
            }
        }
        actualizarEstadoBotones();
        // Reset file input para poder re-seleccionar mismos archivos
        const input = document.getElementById('input-bolsa');
        if (input) input.value = '';
    },

    seleccionarBolsaIdx: (idx) => {
        if (idx < 0 || idx >= bolsas.length) return;
        bolsaActualIdx = idx;

        // Ajustar canvas a esta bolsa
        ajustarCanvas();
        canvasEditor.style.display = 'block';
        document.getElementById('placeholder-canvas').style.display = 'none';

        // Posicionar diseño si no tiene posición y hay logo
        const bolsa = getBolsa();
        if (imagenDiseno && !bolsa.diseno) {
            posicionarDisenoInicial(bolsa);
        }

        sincronizarSliders();
        renderizarEditor();
        renderizarThumbnailsBolsas();
        ocultarResultado();

        // Si esta bolsa ya tiene resultado, mostrarlo
        if (bolsa.resultadoIA) {
            mostrarResultado();
        }

        actualizarEstadoBotones();
    },

    quitarBolsa: (idx) => {
        bolsas.splice(idx, 1);

        if (bolsas.length === 0) {
            bolsaActualIdx = -1;
            canvasEditor.style.display = 'none';
            document.getElementById('placeholder-canvas').style.display = '';
            ocultarResultado();
        } else {
            if (bolsaActualIdx >= bolsas.length) bolsaActualIdx = bolsas.length - 1;
            if (bolsaActualIdx === idx || bolsaActualIdx < 0) {
                moduloMockup.seleccionarBolsaIdx(Math.min(idx, bolsas.length - 1));
                return;
            }
            if (idx < bolsaActualIdx) bolsaActualIdx--;
        }

        renderizarThumbnailsBolsas();
        if (getBolsa()) {
            ajustarCanvas();
            renderizarEditor();
        }
        actualizarEstadoBotones();
    },

    // === Logo ===

    seleccionarDiseno: async (archivo) => {
        if (!archivo) return;
        const validacion = validarArchivo(archivo, APP_CONFIG);
        if (!validacion.valido) {
            mostrarNotificacion(validacion.errores[0], 'error');
            return;
        }

        try {
            imagenDisenoDataURL = await leerArchivoComoDataURL(archivo);
            imagenDiseno = await cargarImagen(imagenDisenoDataURL);
            nombreDiseno = archivo.name.replace(/\.[^/.]+$/, '');

            document.getElementById('thumb-diseno').src = imagenDisenoDataURL;
            document.getElementById('preview-diseno').classList.remove('hidden');
            document.getElementById('placeholder-diseno').classList.add('hidden');

            // Posicionar en todas las bolsas que no tienen posición
            bolsas.forEach(b => {
                if (!b.diseno) posicionarDisenoInicial(b);
                b.resultadoIA = null; // Limpiar resultados viejos
            });

            if (getBolsa()) {
                sincronizarSliders();
                renderizarEditor();
            }
            ocultarResultado();
            actualizarEstadoBotones();
        } catch (err) {
            mostrarNotificacion('Error al cargar el logo/diseño', 'error');
        }
    },

    quitarDiseno: () => {
        imagenDiseno = null;
        imagenDisenoDataURL = null;
        nombreDiseno = '';
        document.getElementById('preview-diseno').classList.add('hidden');
        document.getElementById('placeholder-diseno').classList.remove('hidden');
        bolsas.forEach(b => { b.diseno = null; b.resultadoIA = null; });
        if (getBolsa()) renderizarEditor();
        ocultarResultado();
        actualizarEstadoBotones();
    },

    // === Zoom ===

    zoomIn: () => {
        zoom = Math.min(MAX_ZOOM, zoom * 1.25);
        aplicarZoom();
    },

    zoomOut: () => {
        zoom = Math.max(MIN_ZOOM, zoom * 0.8);
        aplicarZoom();
    },

    zoomReset: () => {
        zoom = 1;
        aplicarZoom();
        const container = document.getElementById('canvas-scroll-mockup');
        if (container) { container.scrollLeft = 0; container.scrollTop = 0; }
    },

    // === Controles logo ===

    actualizarEscala: (valor) => {
        const d = getDiseno();
        if (!d || !imagenDiseno) return;
        d.escala = parseInt(valor) / 100;
        d.ancho = imagenDiseno.width * escalaInicialDiseno * d.escala;
        d.alto = imagenDiseno.height * escalaInicialDiseno * d.escala;
        document.getElementById('label-escala-mockup').textContent = `${valor}%`;
        renderizarEditor();
    },

    actualizarRotacion: (valor) => {
        const d = getDiseno();
        if (!d) return;
        d.rotacion = parseInt(valor);
        document.getElementById('label-rotacion-mockup').textContent = `${valor}°`;
        renderizarEditor();
    },

    // === Generación IA ===

    generarMockupActual: async () => {
        const bolsa = getBolsa();
        if (!bolsa || !imagenDiseno) {
            mostrarNotificacion('Subí al menos una foto de bolsa y el logo', 'warning');
            return;
        }

        const keyActual = proveedor === 'gemini' ? apiKeyGemini : apiKeyOpenAI;
        if (!keyActual) {
            mostrarNotificacion(`Configurá la API Key de ${proveedor === 'gemini' ? 'Gemini' : 'OpenAI'} en ⚙️`, 'warning');
            return;
        }

        if (procesandoIA) return;
        procesandoIA = true;

        const btn = document.getElementById('btn-generar-mockup');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        btn.disabled = true;

        try {
            const imageData = proveedor === 'gemini'
                ? await llamarGemini(bolsa)
                : await llamarOpenAI(bolsa);

            bolsa.resultadoIA = await cargarImagen(`data:image/png;base64,${imageData}`);
            mostrarResultado();
            renderizarThumbnailsBolsas();
            mostrarNotificacion('Mockup generado', 'success');
        } catch (error) {
            console.error('Error IA:', error);
            mostrarNotificacion(`Error: ${error.message}`, 'error');
        } finally {
            procesandoIA = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Generar';
            btn.disabled = false;
            actualizarEstadoBotones();
        }
    },

    generarTodos: async () => {
        if (!imagenDiseno || bolsas.length === 0) return;
        const keyActual = proveedor === 'gemini' ? apiKeyGemini : apiKeyOpenAI;
        if (!keyActual) {
            mostrarNotificacion(`Configurá la API Key de ${proveedor === 'gemini' ? 'Gemini' : 'OpenAI'} en ⚙️`, 'warning');
            return;
        }

        if (procesandoIA) return;
        procesandoIA = true;

        const sinResultado = bolsas.filter(b => !b.resultadoIA && b.diseno);
        if (sinResultado.length === 0) {
            mostrarNotificacion('Todas las bolsas ya tienen mockup generado', 'info');
            procesandoIA = false;
            return;
        }

        // Mostrar progreso
        const progreso = document.getElementById('progreso-batch');
        const barra = document.getElementById('barra-progreso-batch');
        const texto = document.getElementById('texto-progreso-batch');
        progreso.classList.remove('hidden');

        const btnTodos = document.getElementById('btn-generar-todos');
        btnTodos.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btnTodos.disabled = true;
        const btnGenerar = document.getElementById('btn-generar-mockup');
        btnGenerar.disabled = true;

        let procesados = 0;
        let errores = 0;

        for (const bolsa of sinResultado) {
            const idx = bolsas.indexOf(bolsa);
            moduloMockup.seleccionarBolsaIdx(idx);

            texto.textContent = `${procesados + 1} / ${sinResultado.length}`;
            barra.style.width = `${((procesados) / sinResultado.length) * 100}%`;

            try {
                const imageData = proveedor === 'gemini'
                    ? await llamarGemini(bolsa)
                    : await llamarOpenAI(bolsa);

                bolsa.resultadoIA = await cargarImagen(`data:image/png;base64,${imageData}`);
                renderizarThumbnailsBolsas();
            } catch (error) {
                console.error(`Error en ${bolsa.nombre}:`, error);
                errores++;
            }

            procesados++;
            barra.style.width = `${(procesados / sinResultado.length) * 100}%`;

            // Rate limit: esperar 3s entre llamadas (excepto la última)
            if (procesados < sinResultado.length) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        procesandoIA = false;
        progreso.classList.add('hidden');
        btnTodos.innerHTML = '<i class="fas fa-layer-group"></i> Generar todos';
        btnTodos.disabled = false;
        btnGenerar.disabled = false;

        if (errores > 0) {
            mostrarNotificacion(`${procesados - errores} generados, ${errores} con error`, 'warning');
        } else {
            mostrarNotificacion(`${procesados} mockups generados`, 'success');
        }

        // Mostrar resultado de la bolsa actual
        if (getBolsa()?.resultadoIA) mostrarResultado();
        actualizarEstadoBotones();
    },

    // === Descarga ===

    descargar: () => {
        const bolsa = getBolsa();
        if (!bolsa) return;
        const nombre = `mockup_${bolsa.nombre || 'bolsa'}.jpg`;

        if (bolsa.resultadoIA) {
            const canvas = document.createElement('canvas');
            canvas.width = bolsa.resultadoIA.naturalWidth || bolsa.resultadoIA.width;
            canvas.height = bolsa.resultadoIA.naturalHeight || bolsa.resultadoIA.height;
            canvas.getContext('2d').drawImage(bolsa.resultadoIA, 0, 0);
            descargarArchivo(canvas.toDataURL('image/jpeg', 0.95), nombre);
        } else {
            const canvas = generarCompositeHiRes(bolsa);
            descargarArchivo(canvas.toDataURL('image/jpeg', 0.95), nombre);
        }
        mostrarNotificacion('Mockup descargado', 'success');
    },

    // === Configuración ===

    toggleConfig: () => {
        configVisible = !configVisible;
        document.getElementById('panel-config-mockup').classList.toggle('hidden', !configVisible);
    },

    cambiarProveedor: (valor) => {
        proveedor = valor;
        localStorage.setItem('fotosapp_mockup_proveedor', valor);
        document.getElementById('config-key-gemini').classList.toggle('hidden', valor !== 'gemini');
        document.getElementById('config-key-openai').classList.toggle('hidden', valor !== 'openai');
        document.getElementById('config-calidad-openai').classList.toggle('hidden', valor !== 'openai');
        const ayuda = document.querySelector('#panel-config-mockup p.text-xs.text-gray-400');
        if (ayuda) ayuda.textContent = valor === 'gemini' ? 'La API Key de Gemini se comparte con el módulo Editor.' : 'OpenAI usa una API Key independiente.';
        actualizarEstadoBotones();
    },

    cambiarCalidad: (valor) => {
        calidadOpenAI = valor;
        localStorage.setItem('fotosapp_openai_calidad', valor);
    },

    guardarKeyGemini: (key) => {
        apiKeyGemini = key;
        localStorage.setItem('fotosapp_gemini_key', key);
        mostrarNotificacion('API Key de Gemini guardada', 'success');
        actualizarEstadoBotones();
    },

    guardarKeyOpenAI: (key) => {
        apiKeyOpenAI = key;
        localStorage.setItem('fotosapp_openai_key', key);
        mostrarNotificacion('API Key de OpenAI guardada', 'success');
        actualizarEstadoBotones();
    },

    // === Reset ===

    resetear: () => {
        bolsas = [];
        bolsaActualIdx = -1;
        imagenDiseno = null;
        imagenDisenoDataURL = null;
        nombreDiseno = '';
        zoom = 1;

        document.getElementById('preview-diseno')?.classList.add('hidden');
        document.getElementById('placeholder-diseno')?.classList.remove('hidden');
        if (canvasEditor) canvasEditor.style.display = 'none';
        document.getElementById('placeholder-canvas').style.display = '';
        aplicarZoom();
        renderizarThumbnailsBolsas();
        ocultarResultado();
        actualizarEstadoBotones();
    },

    volverAlEditor: () => {
        const bolsa = getBolsa();
        if (bolsa) bolsa.resultadoIA = null;
        ocultarResultado();
        renderizarEditor();
        renderizarThumbnailsBolsas();
        actualizarEstadoBotones();
    }
};

// === Helpers internos ===

function actualizarEstadoBotones() {
    const bolsa = getBolsa();
    const hayBolsaYDiseno = bolsa && imagenDiseno && bolsa.diseno;
    const keyOk = proveedor === 'gemini' ? !!apiKeyGemini : !!apiKeyOpenAI;
    const hayVarias = bolsas.length > 1;

    const sliderEscala = document.getElementById('slider-escala-mockup');
    const sliderRotacion = document.getElementById('slider-rotacion-mockup');
    if (sliderEscala) sliderEscala.disabled = !hayBolsaYDiseno;
    if (sliderRotacion) sliderRotacion.disabled = !hayBolsaYDiseno;

    const btnGenerar = document.getElementById('btn-generar-mockup');
    if (btnGenerar) btnGenerar.disabled = !hayBolsaYDiseno || !keyOk || procesandoIA;

    const btnTodos = document.getElementById('btn-generar-todos');
    if (btnTodos) {
        btnTodos.disabled = !hayBolsaYDiseno || !keyOk || !hayVarias || procesandoIA;
        btnTodos.style.display = hayVarias ? 'flex' : 'none';
    }

    const btnDescargar = document.getElementById('btn-descargar-mockup');
    if (btnDescargar) btnDescargar.disabled = !hayBolsaYDiseno;

    const btnReintentar = document.getElementById('btn-reintentar-mockup');
    if (btnReintentar) btnReintentar.style.display = bolsa?.resultadoIA ? 'flex' : 'none';
}

function mostrarResultado() {
    const bolsa = getBolsa();
    if (!bolsa || !bolsa.resultadoIA) return;

    const compositeCanvas = generarCompositeHiRes(bolsa);
    const previewComposite = document.getElementById('canvas-composite-preview');
    if (previewComposite && compositeCanvas) {
        previewComposite.width = compositeCanvas.width;
        previewComposite.height = compositeCanvas.height;
        previewComposite.getContext('2d').drawImage(compositeCanvas, 0, 0);
    }

    const imgResultado = document.getElementById('img-resultado-ia');
    if (imgResultado) {
        const canvas = document.createElement('canvas');
        canvas.width = bolsa.resultadoIA.naturalWidth || bolsa.resultadoIA.width;
        canvas.height = bolsa.resultadoIA.naturalHeight || bolsa.resultadoIA.height;
        canvas.getContext('2d').drawImage(bolsa.resultadoIA, 0, 0);
        imgResultado.src = canvas.toDataURL('image/png');
    }

    document.getElementById('vista-resultado-mockup').classList.remove('hidden');
    actualizarEstadoBotones();
}

function ocultarResultado() {
    const vista = document.getElementById('vista-resultado-mockup');
    if (vista) vista.classList.add('hidden');
}

// Exponer globalmente
window.moduloMockup = moduloMockup;
