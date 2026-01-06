// ========================================
// CONFIGURACIÓN DE GOOGLE SHEETS
// ========================================
// NOTA: Este es un archivo template. Los valores se reemplazan durante el deployment.

const CONFIG = {
    // ID de tu Google Sheet
    SHEET_ID: '__SHEET_ID__',

    // API Key de Google Cloud
    API_KEY: '__API_KEY__',

    // URL del Google Apps Script (Web App URL)
    SCRIPT_URL: '__SCRIPT_URL__',

    // Nombres de las hojas (NO CAMBIAR - deben coincidir exactamente con el Google Sheet)
    SHEETS: {
        CLIENTES: 'Clientes',
        MARCAS: 'Marcas',
        ENTREGABLES: 'Entregables',
        VALIDACIONES: 'Validaciones',
        TIPOS_ENTREGABLE: 'Tipos_Entregable',
        HERRAMIENTAS: 'Herramientas_Catalogo',
        CATEGORIAS_HERRAMIENTAS: 'Categorias_Herramientas',
        LOGS: 'Logs_Cambios',
        USERS: 'Users'
    },

    // Base URL de Google Sheets API
    API_BASE_URL: 'https://sheets.googleapis.com/v4/spreadsheets'
};

// ========================================
// FUNCIONES DE GOOGLE SHEETS API
// ========================================

/**
 * Lee datos de una hoja específica usando Google Apps Script con JSONP (sin CORS)
 * @param {string} sheetName - Nombre de la hoja
 * @param {string} range - Rango de celdas (ej: 'A1:Z1000') - IGNORADO, siempre lee toda la hoja
 * @returns {Promise<Array>} - Array de filas
 */
async function leerHoja(sheetName, range = null, retries = 3, bustCache = false) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`📥 Cargando ${sheetName} (intento ${attempt}/${retries})...`);

            const data = await new Promise((resolve, reject) => {
                const callbackName = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).substring(2);
                // Agregar timestamp para invalidar cache cuando bustCache=true
                const cacheBuster = bustCache ? `&_t=${Date.now()}` : '';
                const url = `${CONFIG.SCRIPT_URL}?action=read&sheetName=${encodeURIComponent(sheetName)}&callback=${callbackName}${cacheBuster}`;

                // Timeout de 45 segundos
                const timeoutId = setTimeout(() => {
                    if (window[callbackName]) {
                        delete window[callbackName];
                        if (script && script.parentNode) {
                            document.body.removeChild(script);
                        }
                        reject(new Error(`Timeout - ${sheetName} tardó más de 45s`));
                    }
                }, 45000);

                window[callbackName] = function (result) {
                    clearTimeout(timeoutId);
                    delete window[callbackName];
                    if (script && script.parentNode) {
                        document.body.removeChild(script);
                    }

                    if (result.status === 'error') {
                        reject(new Error(result.message));
                    } else {
                        resolve(result.data || []);
                    }
                };

                const script = document.createElement('script');
                script.src = url;
                script.onerror = function () {
                    clearTimeout(timeoutId);
                    delete window[callbackName];
                    if (script && script.parentNode) {
                        document.body.removeChild(script);
                    }
                    reject(new Error(`Error de red al cargar ${sheetName}`));
                };

                document.body.appendChild(script);
            });

            console.log(`✅ ${sheetName} cargada: ${data.length} filas`);
            return data;

        } catch (error) {
            console.error(`❌ Error cargando ${sheetName} (intento ${attempt}):`, error.message);

            if (attempt === retries) {
                // Último intento falló - devolver array vacío en vez de error
                console.warn(`⚠️ ${sheetName} no pudo cargarse después de ${retries} intentos. Usando datos vacíos.`);
                return []; // Devolver array vacío para continuar
            }

            // Esperar antes de reintentar (backoff exponencial)
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
}

/**
 * Convierte datos de hoja a objetos
 * @param {Array} data - Datos de la hoja (primera fila son headers)
 * @returns {Array<Object>} - Array de objetos
 */
function convertirAObjetos(data) {
    if (data.length < 2) return [];

    const headers = data[0];
    return data.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] || '';
        });
        return obj;
    });
}

/**
 * Escribe datos en una hoja (requiere OAuth - solo lectura pública por ahora)
 * Para escribir datos, usa el método manual o Apps Script
 */
async function escribirHoja(sheetName, values) {
    console.warn('La escritura directa está deshabilitada. Usa el Google Sheet directamente.');
    mostrarNotificacion('Para editar datos, abre el Google Sheet', 'info');
}

// ========================================
// VALIDACIÓN DE CONFIGURACIÓN
// ========================================

function validarConfiguracion() {
    if (CONFIG.SHEET_ID === 'TU_GOOGLE_SHEET_ID_AQUI' || CONFIG.SHEET_ID === '__SHEET_ID__') {
        mostrarError('⚠️ Configuración Requerida',
            'Por favor configura tu SHEET_ID en el archivo config.js. ' +
            'Consulta WEB_APP_SETUP.md para instrucciones.');
        return false;
    }

    if (CONFIG.API_KEY === 'TU_API_KEY_AQUI' || CONFIG.API_KEY === '__API_KEY__') {
        mostrarError('⚠️ Configuración Requerida',
            'Por favor configura tu API_KEY en el archivo config.js. ' +
            'Consulta WEB_APP_SETUP.md para instrucciones.');
        return false;
    }

    return true;
}

// ========================================
// UTILIDADES
// ========================================

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Implementación simple de notificaciones
    const notification = document.createElement('div');
    notification.className = `notification notification-${tipo}`;
    notification.textContent = mensaje;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${tipo === 'error' ? '#EA4335' : tipo === 'success' ? '#34A853' : '#4285F4'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideInRight 0.3s;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function mostrarError(titulo, mensaje) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 32px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        max-width: 500px;
        z-index: 10000;
        text-align: center;
    `;

    errorDiv.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">⚙️</div>
        <h2 style="margin-bottom: 16px; color: #202124;">${titulo}</h2>
        <p style="color: #5F6368; line-height: 1.6; margin-bottom: 24px;">${mensaje}</p>
        <button onclick="this.parentElement.remove()" style="
            background: #4285F4;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        ">Entendido</button>
    `;

    document.body.appendChild(errorDiv);
}

// Nota: La validación se ejecuta automáticamente cuando se intenta usar CONFIG
// No es necesario validar en DOMContentLoaded porque puede mostrar errores falsos
// mientras se cargan los archivos de configuración
