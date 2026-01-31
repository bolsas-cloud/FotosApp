/**
 * Motor de procesamiento de imágenes
 * Maneja cambio de tono HSL conservando textura
 */

import { rgbToHsl, hslToRgb } from '../utils.js';

export const imageProcessor = {
    /**
     * Detecta si un píxel es parte del fondo (gris/neutro)
     * @param {number} r - Rojo (0-255)
     * @param {number} g - Verde (0-255)
     * @param {number} b - Azul (0-255)
     * @param {object} config - Configuración de detección
     * @returns {boolean}
     */
    esFondo: (r, g, b, config = {}) => {
        const {
            toleranciaSaturacion = 30,  // Máxima saturación para considerar "gris"
            luminosidadMin = 15,         // Mínima luminosidad (evitar negro)
            luminosidadMax = 95          // Máxima luminosidad (evitar blanco puro)
        } = config;

        const hsl = rgbToHsl(r, g, b);

        // Un píxel es fondo si:
        // 1. Tiene baja saturación (es grisáceo)
        // 2. No es negro ni blanco puro
        return hsl.s <= toleranciaSaturacion &&
               hsl.l >= luminosidadMin &&
               hsl.l <= luminosidadMax;
    },

    /**
     * Cambia el tono del fondo conservando la textura (luminosidad)
     * Incluye ajustes de brillo y contraste
     * @param {HTMLCanvasElement} canvas - Canvas con la imagen
     * @param {object} opciones - Opciones de procesamiento
     * @returns {HTMLCanvasElement} - Canvas procesado
     */
    cambiarTonoFondo: (canvas, opciones = {}) => {
        const {
            hueDestino = 80,           // Tono destino (0-360)
            saturacionDestino = 35,     // Saturación destino (0-100)
            toleranciaSaturacion = 30,  // Para detección de fondo
            luminosidadMin = 15,
            luminosidadMax = 95,
            preservarLuminosidad = true, // Mantener variaciones de luz
            brillo = 0,                 // -100 a 100
            contraste = 0              // -100 a 100
        } = opciones;

        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Factor de contraste: convertir de -100..100 a factor multiplicativo
        const contrasteFactor = (100 + contraste) / 100;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Alpha en data[i + 3]

            // Verificar si es fondo
            if (imageProcessor.esFondo(r, g, b, {
                toleranciaSaturacion,
                luminosidadMin,
                luminosidadMax
            })) {
                const hslOriginal = rgbToHsl(r, g, b);

                // Aplicar brillo a la luminosidad original
                let luminosidadAjustada = hslOriginal.l + brillo;

                // Aplicar contraste (expandir/contraer respecto al punto medio 50)
                luminosidadAjustada = 50 + (luminosidadAjustada - 50) * contrasteFactor;

                // Clamp entre 0 y 100
                luminosidadAjustada = Math.max(0, Math.min(100, luminosidadAjustada));

                // Calcular nuevo color
                const nuevoHsl = {
                    h: hueDestino,
                    s: saturacionDestino,
                    l: preservarLuminosidad ? luminosidadAjustada : 50
                };

                const nuevoRgb = hslToRgb(nuevoHsl.h, nuevoHsl.s, nuevoHsl.l);

                data[i] = nuevoRgb.r;
                data[i + 1] = nuevoRgb.g;
                data[i + 2] = nuevoRgb.b;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    },

    /**
     * Reemplaza el fondo por un color sólido (sin textura)
     * @param {HTMLCanvasElement} canvas - Canvas con la imagen
     * @param {string} colorHex - Color hexadecimal (#RRGGBB)
     * @param {object} opciones - Opciones de detección
     * @returns {HTMLCanvasElement}
     */
    reemplazarFondoSolido: (canvas, colorHex, opciones = {}) => {
        const {
            toleranciaSaturacion = 30,
            luminosidadMin = 15,
            luminosidadMax = 95
        } = opciones;

        // Parsear color hex
        const hex = colorHex.replace('#', '');
        const colorR = parseInt(hex.substring(0, 2), 16);
        const colorG = parseInt(hex.substring(2, 4), 16);
        const colorB = parseInt(hex.substring(4, 6), 16);

        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (imageProcessor.esFondo(r, g, b, {
                toleranciaSaturacion,
                luminosidadMin,
                luminosidadMax
            })) {
                data[i] = colorR;
                data[i + 1] = colorG;
                data[i + 2] = colorB;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    },

    /**
     * Elimina el fondo (lo hace transparente)
     * @param {HTMLCanvasElement} canvas - Canvas con la imagen
     * @param {object} opciones - Opciones de detección
     * @returns {HTMLCanvasElement}
     */
    eliminarFondo: (canvas, opciones = {}) => {
        const {
            toleranciaSaturacion = 30,
            luminosidadMin = 15,
            luminosidadMax = 95
        } = opciones;

        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (imageProcessor.esFondo(r, g, b, {
                toleranciaSaturacion,
                luminosidadMin,
                luminosidadMax
            })) {
                // Hacer transparente
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    },

    /**
     * Carga una imagen en un canvas
     * @param {HTMLImageElement} img - Imagen a cargar
     * @returns {HTMLCanvasElement}
     */
    imagenACanvas: (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas;
    },

    /**
     * Convierte canvas a Data URL
     * @param {HTMLCanvasElement} canvas
     * @param {string} formato - 'image/jpeg' o 'image/png'
     * @param {number} calidad - 0-1 para JPEG
     * @returns {string}
     */
    canvasADataURL: (canvas, formato = 'image/jpeg', calidad = 0.92) => {
        return canvas.toDataURL(formato, calidad);
    },

    /**
     * Procesa una imagen completa
     * @param {HTMLImageElement} img - Imagen a procesar
     * @param {object} opciones - Opciones de procesamiento
     * @returns {object} - { canvas, dataURL }
     */
    procesar: (img, opciones = {}) => {
        const {
            modo = 'tono', // 'tono', 'solido', 'transparente'
            hue = 80,
            saturacion = 35,
            colorHex = '#6B8E23',
            toleranciaSaturacion = 30,
            luminosidadMin = 15,
            luminosidadMax = 95,
            brillo = 0,
            contraste = 0,
            formato = 'image/jpeg',
            calidad = 0.92
        } = opciones;

        // Crear canvas desde imagen
        let canvas = imageProcessor.imagenACanvas(img);

        // Aplicar procesamiento según modo
        const configDeteccion = {
            toleranciaSaturacion,
            luminosidadMin,
            luminosidadMax
        };

        switch (modo) {
            case 'tono':
                canvas = imageProcessor.cambiarTonoFondo(canvas, {
                    hueDestino: hue,
                    saturacionDestino: saturacion,
                    brillo,
                    contraste,
                    ...configDeteccion
                });
                break;

            case 'solido':
                canvas = imageProcessor.reemplazarFondoSolido(canvas, colorHex, configDeteccion);
                break;

            case 'transparente':
                canvas = imageProcessor.eliminarFondo(canvas, configDeteccion);
                // Forzar PNG para transparencia
                formato = 'image/png';
                break;
        }

        // Generar Data URL
        const dataURL = imageProcessor.canvasADataURL(
            canvas,
            modo === 'transparente' ? 'image/png' : formato,
            calidad
        );

        return { canvas, dataURL };
    },

    /**
     * Genera preview rápido (escala reducida)
     * @param {HTMLImageElement} img
     * @param {object} opciones
     * @param {number} maxSize - Tamaño máximo para preview
     * @returns {object}
     */
    generarPreview: (img, opciones = {}, maxSize = 800) => {
        // Calcular escala
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));

        // Crear canvas escalado
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Procesar
        const { modo = 'tono', hue = 80, saturacion = 35, colorHex = '#6B8E23',
                toleranciaSaturacion = 30, luminosidadMin = 15, luminosidadMax = 95,
                brillo = 0, contraste = 0 } = opciones;

        const configDeteccion = { toleranciaSaturacion, luminosidadMin, luminosidadMax };

        switch (modo) {
            case 'tono':
                imageProcessor.cambiarTonoFondo(canvas, {
                    hueDestino: hue,
                    saturacionDestino: saturacion,
                    brillo,
                    contraste,
                    ...configDeteccion
                });
                break;
            case 'solido':
                imageProcessor.reemplazarFondoSolido(canvas, colorHex, configDeteccion);
                break;
            case 'transparente':
                imageProcessor.eliminarFondo(canvas, configDeteccion);
                break;
        }

        return {
            canvas,
            dataURL: canvas.toDataURL(modo === 'transparente' ? 'image/png' : 'image/jpeg', 0.8)
        };
    }
};

// Exponer globalmente para debugging
window.imageProcessor = imageProcessor;
