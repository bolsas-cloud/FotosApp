/**
 * Utilidades comunes de FotosApp
 */

/**
 * Muestra una notificación toast
 */
export function mostrarNotificacion(mensaje, tipo = 'info', duracion = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colores = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-brand'
    };

    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `${colores[tipo]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in`;
    toast.innerHTML = `
        <i class="fas ${iconos[tipo]}"></i>
        <span class="text-sm font-medium">${mensaje}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

/**
 * Formatea el tamaño de archivo
 */
export function formatearTamano(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Genera un ID único
 */
export function generarId(prefijo = 'id') {
    return `${prefijo}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Lee un archivo como Data URL (base64)
 */
export function leerArchivoComoDataURL(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(archivo);
    });
}

/**
 * Carga una imagen desde Data URL
 */
export function cargarImagen(dataURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Error al cargar imagen'));
        img.src = dataURL;
    });
}

/**
 * Descarga un archivo
 */
export function descargarArchivo(dataURL, nombreArchivo) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Descarga múltiples archivos como ZIP
 */
export async function descargarComoZip(archivos, nombreZip = 'fotos_procesadas.zip') {
    const zip = new JSZip();

    for (const archivo of archivos) {
        // Extraer base64 sin el prefijo data:image/...
        const base64Data = archivo.dataURL.split(',')[1];
        zip.file(archivo.nombre, base64Data, { base64: true });
    }

    const contenido = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(contenido);

    const link = document.createElement('a');
    link.href = url;
    link.download = nombreZip;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

/**
 * Valida si un archivo es una imagen permitida
 */
export function validarArchivo(archivo, config) {
    const errores = [];

    if (!config.formatosPermitidos.includes(archivo.type)) {
        errores.push(`Formato no permitido: ${archivo.type}`);
    }

    if (archivo.size > config.maxFileSize) {
        errores.push(`Archivo muy grande: ${formatearTamano(archivo.size)} (máx: ${formatearTamano(config.maxFileSize)})`);
    }

    return {
        valido: errores.length === 0,
        errores
    };
}

/**
 * Convierte HSL a RGB
 */
export function hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

/**
 * Convierte RGB a HSL
 */
export function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
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

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

/**
 * Confirmar acción con modal
 */
export function confirmarAccion(titulo, mensaje, tipo = 'warning') {
    return new Promise((resolve) => {
        const container = document.getElementById('modal-container');

        const colores = {
            warning: 'bg-yellow-100 text-yellow-600',
            danger: 'bg-red-100 text-red-600',
            info: 'bg-blue-100 text-blue-600'
        };

        const iconos = {
            warning: 'fa-exclamation-triangle',
            danger: 'fa-trash',
            info: 'fa-info-circle'
        };

        container.innerHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
                <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 ${colores[tipo]} rounded-full flex items-center justify-center flex-shrink-0">
                            <i class="fas ${iconos[tipo]} text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-gray-900">${titulo}</h3>
                            <p class="text-gray-600 mt-1">${mensaje}</p>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 mt-6">
                        <button id="modal-cancelar" class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button id="modal-confirmar" class="px-4 py-2 bg-brand text-white hover:bg-brand-dark rounded-lg transition-colors">
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modal-cancelar').onclick = () => {
            container.innerHTML = '';
            resolve(false);
        };

        document.getElementById('modal-confirmar').onclick = () => {
            container.innerHTML = '';
            resolve(true);
        };
    });
}
