# FotosApp - Documentación Técnica

> Editor de fotos de producto con cambio de tono de fondo e integración con IA

---

## 1. Descripción General

FotosApp es una aplicación web progresiva (PWA) diseñada para editar fotos de productos, específicamente para cambiar el color/tono del fondo manteniendo la textura y sombras originales.

### Características principales:
- **Editor individual** - Procesamiento foto por foto con vista previa en tiempo real
- **Procesamiento por lote** - Edición masiva de carpetas completas
- **Integración con IA** - Gemini API para edición inteligente de fondos
- **Imagen de referencia** - Mantiene consistencia de tono entre fotos y sesiones
- **PWA** - Instalable como aplicación de escritorio, funciona offline

---

## 2. Stack Tecnológico

| Tecnología | Uso |
|------------|-----|
| **HTML5** | Estructura base |
| **Tailwind CSS** | Estilos (via CDN) |
| **JavaScript ES6+** | Lógica de aplicación (módulos nativos) |
| **Canvas API** | Procesamiento de imágenes pixel a pixel |
| **File System Access API** | Selección de carpetas origen/destino |
| **LocalStorage** | Persistencia de configuración y referencias |
| **Gemini API** | Procesamiento de imágenes con IA |
| **JSZip** | Descarga de lotes como ZIP |
| **Service Worker** | Funcionalidad offline (PWA) |

### CDNs utilizados:
```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Font Awesome (iconos) -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- JSZip -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>

<!-- Google Fonts (Inter) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

---

## 3. Estructura de Carpetas

```
FotosApp/
├── index.html              # Punto de entrada principal
├── manifest.json           # Configuración PWA
├── service-worker.js       # Cache offline
├── .gitignore
│
├── docs/
│   └── DOCUMENTACION.md    # Este archivo
│
├── icons/
│   ├── icon-192.svg        # Icono PWA pequeño
│   └── icon-512.svg        # Icono PWA grande
│
└── src/
    ├── main.js             # Inicialización y router
    ├── router.js           # Navegación SPA
    ├── config.js           # Configuración global y presets de colores
    ├── utils.js            # Utilidades comunes
    │
    ├── lib/
    │   └── imageProcessor.js   # Motor de procesamiento de imágenes
    │
    └── modules/
        ├── editor.js       # Módulo editor individual
        └── lote.js         # Módulo procesamiento por lote
```

---

## 4. Archivos y Funciones Principales

### 4.1 `src/config.js`

Configuración global de la aplicación.

```javascript
// Configuración de la aplicación
export const APP_CONFIG = {
    maxFileSize: 20 * 1024 * 1024,  // 20MB máximo
    formatosPermitidos: ['image/jpeg', 'image/png', 'image/webp'],
    version: '1.0.0'
};

// Presets de colores predefinidos
export const COLOR_PRESETS = [
    { nombre: 'Oliva', hue: 80, saturacion: 35, color: '#6B8E23' },
    { nombre: 'Arena', hue: 35, saturacion: 30, color: '#C4A77D' },
    { nombre: 'Gris Cálido', hue: 30, saturacion: 10, color: '#A69F98' },
    // ... más colores
];
```

### 4.2 `src/utils.js`

Utilidades comunes reutilizables.

| Función | Descripción |
|---------|-------------|
| `mostrarNotificacion(mensaje, tipo, duracion)` | Toast notifications |
| `formatearTamano(bytes)` | Formatea bytes a KB/MB/GB |
| `generarId(prefijo)` | Genera IDs únicos |
| `leerArchivoComoDataURL(archivo)` | Lee archivo como base64 |
| `cargarImagen(dataURL)` | Carga imagen en elemento Image |
| `descargarArchivo(dataURL, nombre)` | Descarga archivo individual |
| `descargarComoZip(archivos, nombreZip)` | Descarga múltiples archivos como ZIP |
| `validarArchivo(archivo, config)` | Valida formato y tamaño |
| `hslToRgb(h, s, l)` | Convierte HSL a RGB |
| `rgbToHsl(r, g, b)` | Convierte RGB a HSL |
| `confirmarAccion(titulo, mensaje, tipo)` | Modal de confirmación |

### 4.3 `src/lib/imageProcessor.js`

Motor de procesamiento de imágenes basado en Canvas.

```javascript
export const imageProcessor = {
    // Genera preview en tiempo real (escalado para performance)
    generarPreview(imagen, config, maxSize),

    // Procesa imagen en alta calidad para descarga
    procesar(imagen, config),

    // Procesa pixel a pixel aplicando transformación HSL
    procesarPixeles(imageData, config)
};
```

**Algoritmo de detección de fondo:**
1. Convierte cada pixel de RGB a HSL
2. Detecta si es "fondo" basándose en:
   - Saturación baja (< toleranciaSaturacion)
   - Luminosidad dentro del rango (luminosidadMin - luminosidadMax)
3. Aplica nuevo tono (hue) y saturación manteniendo luminosidad original
4. Convierte de vuelta a RGB

### 4.4 `src/modules/editor.js`

Módulo de edición individual de fotos.

**Estado interno:**
```javascript
let imagenOriginal = null;      // Imagen cargada
let imagenDataURL = null;       // DataURL de la imagen
let nombreArchivo = null;       // Nombre original
let canvasPreview = null;       // Canvas de vista previa
let canvasProcesado = null;     // Canvas con imagen procesada
let imagenBaseIA = null;        // Resultado de IA para post-edición
let configActual = { ... };     // Configuración de procesamiento
```

**Funciones principales:**

| Función | Descripción |
|---------|-------------|
| `render(contenedor)` | Renderiza la UI del editor |
| `cargarImagen(file)` | Carga imagen desde archivo |
| `actualizarPreview()` | Actualiza vista previa en tiempo real |
| `procesarConIA()` | Envía imagen a Gemini API |
| `descargar()` | Descarga imagen procesada |
| `togglePincel()` | Activa/desactiva modo pincel manual |
| `resetearAjustes()` | Restaura configuración por defecto |

**Flujo de trabajo con IA:**
1. Usuario carga imagen
2. Click en botón "IA"
3. Envía imagen + prompt a Gemini API
4. Recibe imagen editada
5. Guarda como `imagenBaseIA` para permitir ajustes posteriores
6. Usuario puede ajustar tono/brillo sobre resultado de IA
7. Descarga versión final

### 4.5 `src/modules/lote.js`

Módulo de procesamiento por lote.

**Estado interno:**
```javascript
let archivosEnCola = [];           // Lista de archivos a procesar
let archivoActualIndex = 0;        // Índice actual
let procesando = false;            // Flag de procesamiento activo
let cancelado = false;             // Flag de cancelación
let iaDisponible = true;           // Si la IA está funcionando
let imagenReferenciaBase64 = null; // Imagen de referencia (persistente)
let usarImagenReferencia = false;  // Si usar referencia
let carpetaOrigenHandle = null;    // Handle File System API
let carpetaDestinoHandle = null;   // Handle destino

let configLote = {
    modoLote: 'automatico',        // 'automatico' | 'asistido'
    usarIA: true,
    delayEntreImagenes: 3000,      // Rate limiting para API
    // ... más config
};
```

**Modos de procesamiento:**

| Modo | Descripción |
|------|-------------|
| **Automático** | Procesa todas las imágenes sin intervención |
| **Asistido** | Pausa en cada imagen para revisión manual |

**Funciones principales:**

| Función | Descripción |
|---------|-------------|
| `render(contenedor)` | Renderiza UI del módulo lote |
| `seleccionarCarpetaOrigen()` | Abre picker de carpeta origen |
| `seleccionarCarpetaDestino()` | Abre picker de carpeta destino |
| `cargarArchivosDeCarpeta(handle)` | Carga archivos de carpeta |
| `iniciarProcesamiento()` | Inicia procesamiento del lote |
| `procesarAutomatico()` | Procesa en modo automático |
| `procesarAsistido()` | Procesa en modo asistido |
| `procesarImagen(item)` | Procesa una imagen individual |
| `procesarConIA(img, item)` | Procesa con Gemini API |
| `procesarLocal(img)` | Procesa localmente sin IA |
| `guardarImagen(item, dataURL)` | Guarda imagen en carpeta destino |
| `guardarReferencia(dataURL)` | Guarda imagen como referencia |
| `limpiarReferencia()` | Elimina imagen de referencia |
| `nuevoLote()` | Limpia estado para nuevo lote |
| `descargarZip()` | Descarga todas las procesadas como ZIP |

**Imagen de referencia:**
- Se guarda en localStorage para persistir entre sesiones
- Se comprime automáticamente si es muy grande (max 400px)
- Se puede cargar manualmente o usar primera imagen procesada
- Permite consistencia de tono entre lotes y días

---

## 5. Integración con Gemini API

### Endpoint utilizado:
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```

### Estructura de request:

```javascript
// Sin imagen de referencia
{
    contents: [{
        parts: [
            { text: "Edit this product photo: change ONLY the background color to #6B8E23..." },
            { inlineData: { mimeType: 'image/jpeg', data: base64 } }
        ]
    }],
    generationConfig: {
        responseModalities: ['IMAGE', 'TEXT']
    }
}

// Con imagen de referencia
{
    contents: [{
        parts: [
            { text: "I have a reference image showing the exact background tone I want..." },
            { inlineData: { mimeType: 'image/png', data: referenciaBase64 } },
            { text: "Now edit this photo to match the reference background:" },
            { inlineData: { mimeType: 'image/jpeg', data: imagenBase64 } }
        ]
    }],
    generationConfig: {
        responseModalities: ['IMAGE', 'TEXT']
    }
}
```

### Manejo de errores:
- Si la API falla, se hace fallback a procesamiento local
- Rate limiting configurable (default: 3 segundos entre llamadas)
- Notificación única cuando IA no está disponible

---

## 6. Persistencia (LocalStorage)

| Key | Descripción |
|-----|-------------|
| `fotosapp_gemini_key` | API Key de Gemini |
| `fotosapp_ultimo_color` | Último color usado `{hue, saturacion, colorHex}` |
| `fotosapp_mis_colores` | Array de colores guardados por usuario |
| `fotosapp_imagen_referencia` | Imagen de referencia en base64 |

---

## 7. File System Access API

Permite seleccionar carpetas de origen y destino para procesamiento por lote.

```javascript
// Seleccionar carpeta de lectura
const handle = await window.showDirectoryPicker({ mode: 'read' });

// Seleccionar carpeta de escritura
const handle = await window.showDirectoryPicker({ mode: 'readwrite' });

// Leer archivos de carpeta
for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
        const file = await entry.getFile();
        // procesar archivo
    }
}

// Escribir archivo en carpeta
const fileHandle = await carpetaHandle.getFileHandle(nombre, { create: true });
const writable = await fileHandle.createWritable();
await writable.write(blob);
await writable.close();
```

**Fallback:** Si el navegador no soporta File System Access API, se usa input tradicional y descarga como ZIP.

---

## 8. PWA - Progressive Web App

### manifest.json
```json
{
    "name": "FotosApp - Editor de Fotos de Producto",
    "short_name": "FotosApp",
    "display": "standalone",
    "theme_color": "#7C3AED",
    "background_color": "#F5F3FF",
    "start_url": "./index.html"
}
```

### service-worker.js
- Cachea assets estáticos para funcionamiento offline
- Estrategia: Cache First con Network Fallback

---

## 9. Flujo de Trabajo Típico

### Editor Individual:
```
1. Cargar imagen (drag & drop o click)
2. Ajustar color con sliders o presets
3. (Opcional) Click "IA" para procesamiento inteligente
4. Ajustar resultado si es necesario
5. Descargar imagen procesada
```

### Procesamiento por Lote:
```
1. Seleccionar carpeta origen
2. (Opcional) Seleccionar carpeta destino diferente
3. Elegir color de fondo
4. (Opcional) Cargar imagen de referencia
5. Configurar IA y delay
6. Click "Iniciar"
7. Esperar procesamiento
8. (Si no hay destino) Descargar ZIP
```

---

## 10. Desarrollo Futuro

### Posibles mejoras:
- [ ] Soporte para máscaras manuales
- [ ] Historial de ediciones (undo/redo)
- [ ] Previsualización A/B (antes/después)
- [ ] Exportación a diferentes formatos (PNG, WebP)
- [ ] Integración con servicios de almacenamiento (Google Drive, Dropbox)
- [ ] Procesamiento en Web Workers para no bloquear UI
- [ ] Soporte para videos (extracción de frames)

### Notas técnicas:
- El procesamiento local funciona bien para fondos grises/neutros
- La IA da mejores resultados pero es más lenta y costosa
- El rate limiting de 3 segundos evita errores 429 de la API
- La compresión de referencia a 400px es suficiente para matching de tono

---

## 11. Repositorio y Deploy

- **GitHub:** https://github.com/bolsas-cloud/FotosApp
- **Deploy:** Vercel (automático desde main/master)
- **URL:** [Tu URL de Vercel]

---

*Última actualización: Enero 2025*
