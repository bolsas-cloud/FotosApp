/**
 * Configuración de FotosApp
 * Por ahora sin Supabase - solo procesamiento local
 */

// Configuración de la app
export const APP_CONFIG = {
    version: '1.0.0',
    nombre: 'FotosApp',
    maxFileSize: 10 * 1024 * 1024, // 10MB por archivo
    formatosPermitidos: ['image/jpeg', 'image/png', 'image/webp'],
    extensionesPermitidas: ['.jpg', '.jpeg', '.png', '.webp']
};

// Presets de colores predefinidos
export const COLOR_PRESETS = [
    { nombre: 'Verde Oliva', hue: 80, saturacion: 35, color: '#6B8E23' },
    { nombre: 'Verde Menta', hue: 150, saturacion: 40, color: '#98FF98' },
    { nombre: 'Azul Cielo', hue: 200, saturacion: 50, color: '#87CEEB' },
    { nombre: 'Rosa Pastel', hue: 330, saturacion: 30, color: '#FFB6C1' },
    { nombre: 'Beige', hue: 40, saturacion: 25, color: '#F5DEB3' },
    { nombre: 'Gris Neutro', hue: 0, saturacion: 0, color: '#808080' }
];

// Configuración futura para Gemini API (cuando se implemente)
export const GEMINI_CONFIG = {
    enabled: false,
    apiKey: '', // Se configura en ajustes
    model: 'gemini-pro-vision',
    maxTokens: 1024
};

// Configuración futura para Supabase (cuando se implemente vinculación)
export const SUPABASE_CONFIG = {
    enabled: false,
    url: '',
    anonKey: ''
};
