// ========================================
// DATA INFRASTRUCTURE WEB APP
// Aplicación principal
// ========================================

// Estado global de la aplicación
window.appState = {
    clientes: [],
    marcas: [],
    entregables: [],
    herramientas: [],
    categoriasHerramientas: [],
    tiposEntregable: [],
    validaciones: [],
    recursos: [],
    origenes: [],
    alertas: [],
    users: [],
    currentView: 'dashboard',
    currentCliente: null,
    expandedClientes: new Set(),
    isUserOperating: false,
    pendingOperations: 0,
    pendingOperations: 0,
    currentUser: 'Admin',
    lastWriteTime: 0 // Timestamp de la última escritura para controlar el cooldown de sync
};

const appState = window.appState;

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Data Infrastructure App...');

    // Nota: Validación de configuración removida porque causaba errores falsos
    // Las credenciales se cargan correctamente desde GitHub Secrets en producción
    // y desde config.local.js en desarrollo local

    // Setup event listeners
    setupEventListeners();

    // Cargar datos iniciales
    await cargarTodosDatos();

    // Renderizar vista inicial
    refrescarVistaActual();

    // Auto-refresh cada 60 segundos para trabajo colaborativo
    // 60s = 10,000 llamadas/día para 20 usuarios (dentro del límite de Apps Script: 20,000/día)
    // Ahora usa Apps Script en lugar de API
    setInterval(async () => {
        // NO sincronizar si el usuario está operando
        if (appState.isUserOperating || appState.pendingOperations > 0) {
            console.log('⏸️ Sincronización pausada - Usuario operando');
            return;
        }
        console.log('🔄 Sincronización automática (sin bloqueo)...');
        await sincronizarDatosInteligente();
    }, 60000); // 60 segundos (1 minuto)

    console.log('✅ Aplicación iniciada correctamente');
});

// ========================================
// CARGA DE DATOS
// ========================================

async function cargarTodosDatos() {
    try {
        mostrarCargando(true);
        console.log('🔄 Iniciando carga de datos...');

        // Deshabilitar botones de navegación mientras carga
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'wait';
        });

        console.log('📥 Cargando hojas:', Object.values(CONFIG.SHEETS));

        // Cargar todas las hojas en paralelo
        const [clientesData, marcasData, entregablesData, validacionesData, herramientasData, categoriasData, tiposEntregableData, usersData] = await Promise.all([
            leerHoja(CONFIG.SHEETS.CLIENTES).then(data => {
                console.log('✅ Clientes cargados:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.MARCAS).then(data => {
                console.log('✅ Marcas cargadas:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.ENTREGABLES).then(data => {
                console.log('✅ Entregables cargados:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.VALIDACIONES).then(data => {
                console.log('✅ Validaciones cargadas:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.HERRAMIENTAS).then(data => {
                console.log('✅ Herramientas cargadas:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS).then(data => {
                console.log('✅ Categorías cargadas:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.TIPOS_ENTREGABLE).then(data => {
                console.log('✅ Tipos cargados:', data.length);
                return data;
            }),
            leerHoja(CONFIG.SHEETS.USERS).then(data => {
                console.log('✅ Users cargados:', data.length);
                return data;
            })
        ]);

        // Convertir a objetos
        appState.clientes = convertirAObjetos(clientesData);
        appState.marcas = convertirAObjetos(marcasData);
        appState.entregables = convertirAObjetos(entregablesData);
        appState.validaciones = convertirAObjetos(validacionesData);
        appState.herramientas = convertirAObjetos(herramientasData);
        appState.categoriasHerramientas = convertirAObjetos(categoriasData);
        appState.tiposEntregable = convertirAObjetos(tiposEntregableData);
        appState.users = convertirAObjetos(usersData);

        console.log('📊 Datos cargados:', {
            clientes: appState.clientes.length,
            marcas: appState.marcas.length,
            entregables: appState.entregables.length,
            validaciones: appState.validaciones.length,
            herramientas: appState.herramientas.length,
            tiposEntregable: appState.tiposEntregable.length,
            users: appState.users.length
        });

        // Habilitar botones de navegación
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });

        mostrarCargando(false);
    } catch (error) {
        console.error('Error al cargar datos:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');

        // Habilitar botones incluso si hay error
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });

        mostrarCargando(false);
    }
}

// ========================================
// SINCRONIZACIÓN INTELIGENTE
// ========================================

async function sincronizarDatosInteligente() {
    try {
        // COOLDOWN CHECK: Si hubo una escritura reciente (últimos 15s), saltar sincronización
        // Esto evita que datos viejos del servidor sobrescriban cambios locales recientes (flickering)
        const SYNC_COOLDOWN_MS = 15000;
        if (Date.now() - appState.lastWriteTime < SYNC_COOLDOWN_MS) {
            console.log('⏳ Sincronización pospuesta - En periodo de cooldown tras escritura');
            return;
        }

        // NO bloquear UI - cargar en background solo hojas necesarias
        const [clientesData, marcasData, entregablesData, validacionesData, herramientasData, categoriasData, tiposData, usersData] = await Promise.all([
            leerHoja(CONFIG.SHEETS.CLIENTES),
            leerHoja(CONFIG.SHEETS.MARCAS),
            leerHoja(CONFIG.SHEETS.ENTREGABLES),
            leerHoja(CONFIG.SHEETS.VALIDACIONES),
            leerHoja(CONFIG.SHEETS.HERRAMIENTAS),
            leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS),
            leerHoja(CONFIG.SHEETS.TIPOS_ENTREGABLE),
            leerHoja(CONFIG.SHEETS.USERS)
        ]);

        // Convertir a objetos
        const newClientes = convertirAObjetos(clientesData);
        const newMarcas = convertirAObjetos(marcasData);
        const newEntregables = convertirAObjetos(entregablesData);
        const newValidaciones = convertirAObjetos(validacionesData);
        const newHerramientas = convertirAObjetos(herramientasData);
        const newCategorias = convertirAObjetos(categoriasData);
        const newTipos = convertirAObjetos(tiposData);
        const newUsers = convertirAObjetos(usersData);

        // Solo actualizar si hay cambios
        let hasChanges = false;

        if (JSON.stringify(appState.clientes) !== JSON.stringify(newClientes)) {
            appState.clientes = newClientes;
            localStorage.setItem('clientes', JSON.stringify(newClientes));
            hasChanges = true;
        }

        if (JSON.stringify(appState.marcas) !== JSON.stringify(newMarcas)) {
            appState.marcas = newMarcas;
            localStorage.setItem('marcas', JSON.stringify(newMarcas));
            hasChanges = true;
        }

        if (JSON.stringify(appState.entregables) !== JSON.stringify(newEntregables)) {
            appState.entregables = newEntregables;
            localStorage.setItem('entregables', JSON.stringify(newEntregables));
            hasChanges = true;
        }

        if (JSON.stringify(appState.validaciones) !== JSON.stringify(newValidaciones)) {
            appState.validaciones = newValidaciones;
            hasChanges = true;
        }

        if (JSON.stringify(appState.herramientas) !== JSON.stringify(newHerramientas)) {
            appState.herramientas = newHerramientas;
            hasChanges = true;
        }

        if (JSON.stringify(appState.categoriasHerramientas) !== JSON.stringify(newCategorias)) {
            appState.categoriasHerramientas = newCategorias;
            hasChanges = true;
        }

        if (JSON.stringify(appState.tiposEntregable) !== JSON.stringify(newTipos)) {
            appState.tiposEntregable = newTipos;
            hasChanges = true;
        }

        if (JSON.stringify(appState.users) !== JSON.stringify(newUsers)) {
            appState.users = newUsers;
            hasChanges = true;
        }

        // Solo refrescar UI si hubo cambios
        if (hasChanges) {
            console.log('✅ Cambios detectados - actualizando vista');
            refrescarVistaActual();
        } else {
            console.log('⏭️ Sin cambios - manteniendo vista actual');
        }
    } catch (error) {
        console.error('Error en sincronización:', error);
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Navegación principal
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Evitar conflictos con onclick del HTML si existe
            const view = btn.dataset.view;
            if (view) {
                cambiarVista(view);
            }
        });
    });

    // Búsqueda global
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            buscarGlobal(e.target.value);
        }, 300));
    }

    // Cerrar modales con ESC (con confirmación si hay datos)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                intentarCerrarModal(activeModal.id);
            }
        }
    });

    // Escuchar cambios en formularios dentro de modales (Dirty Check)
    document.addEventListener('input', (e) => {
        const modalForm = e.target.closest('.modal form');
        if (modalForm) {
            modalForm.dataset.dirty = 'true';
        }
    });

    document.addEventListener('change', (e) => {
        const modalForm = e.target.closest('.modal form');
        if (modalForm) {
            modalForm.dataset.dirty = 'true';
        }
    });

    // Cerrar modales haciendo click fuera CON CONFIRMACIÓN
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                intentarCerrarModal(modal.id);
            }
        });
    });
}

/**
 * Verifica si un formulario tiene datos editados por el usuario
 */
function formularioTieneDatos(form) {
    if (!form) return false;
    return form.dataset.dirty === 'true';
}

/**
 * Intenta cerrar un modal pidiendo confirmación si hay datos
 * @param {string} modalId - El ID del modal a cerrar
 * @param {boolean} force - Si es true, cierra sin pedir confirmación
 */
function intentarCerrarModal(modalId, force = false) {
    const modal = document.getElementById(modalId);
    if (!modal || !modal.classList.contains('active')) return;

    // Modales que NUNCA deben pedir confirmación (solo vistas o gestión)
    const modalesExcluidos = ['modal-cliente', 'modal-gestion-categorias'];
    if (modalesExcluidos.includes(modalId)) {
        modal.classList.remove('active');
        return;
    }

    const form = modal.querySelector('form');
    let hasData = false;

    if (form && !force) {
        hasData = formularioTieneDatos(form);
    }

    if (hasData && !force) {
        if (confirm('¿Deseas abandonar el formulario? Los cambios no guardados se perderán.')) {
            modal.classList.remove('active');
            if (form) {
                form.reset();
                delete form.dataset.dirty;
            }
        }
    } else {
        modal.classList.remove('active');
        // No resetear aquí si es el modal de cliente (detalle), pero sí si es formulario
        if (form && !modalId.includes('detalle')) {
            form.reset();
            delete form.dataset.dirty;
        }
    }
}

// ========================================
// NAVEGACIÓN
// ========================================

function cambiarVista(viewName) {
    // Actualizar botones de navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Mostrar vista seleccionada
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active');
        appState.currentView = viewName;

        // Renderizar contenido según vista
        refrescarVistaActual();
    }
}

function refrescarVistaActual(force = false) {
    // No refrescar si hay operaciones pendientes del usuario, a menos que se fuerce
    if (!force && (appState.isUserOperating || appState.pendingOperations > 0)) {
        console.log('⏸️ Operación en curso - pausando refresco automático');
        return;
    }

    switch (appState.currentView) {
        case 'dashboard':
            renderizarDashboard();
            break;
        case 'clientes':
            renderizarTablaClientes();
            break;
        case 'historial-validaciones':
            cargarHistorialValidaciones();
            break;
        case 'alertas':
            renderizarTablaAlertas();
            break;
        case 'busqueda':
            // La búsqueda se activa con el input
            break;
        case 'administracion':
            renderizarAdministracion();
            break;
    }
}

// Cargar tipos de entregable (utilidad para formularios)
async function cargarTiposEntregable() {
    try {
        const select = document.getElementById('select-tipo-entregable');
        if (!select) return;

        // PRIORIDAD LOCAL: Si ya tenemos datos, úsalos. La sincronización de fondo (60s) se encarga de actualizar.
        // Solo cargamos del servidor si la lista está vacía.
        if (!appState.tiposEntregable || appState.tiposEntregable.length === 0) {
            console.log('🔄 Cargando tipos de entregable (lista vacía/inicial)...');
            const data = await leerHoja(CONFIG.SHEETS.TIPOS_ENTREGABLE);
            appState.tiposEntregable = convertirAObjetos(data);
        } else {
            console.log('⚡ Usando tipos de entregable en memoria local');
        }

        let options = '<option value="">Selecciona tipo de entregable...</option>';
        appState.tiposEntregable.forEach(tipo => {
            if (tipo.Estado === 'Activo') {
                const icono = tipo.Icono || '📋';
                options += `<option value="${tipo.Nombre_Tipo}">${icono} ${tipo.Nombre_Tipo}</option>`;
            }
        });

        select.innerHTML = options;
    } catch (error) {
        console.error('Error al cargar tipos para select:', error);
    }
}

// ========================================
// RENDERIZADO - DASHBOARD
// ========================================

// ========================================
// RENDERIZADO - DASHBOARD (VALIDACIONES)
// ========================================

function renderizarDashboard() {
    console.log('📊 Renderizando dashboard de validaciones...');
    const container = document.getElementById('dashboard-validacion-container');
    if (!container) return;

    // Usar la función de validaciones-functions.js pero sin recargar todo si ya tenemos datos
    if (appState.entregables.length > 0) {
        const hoy = new Date();
        const entregablesHoy = filtrarEntregablesDelDia(appState.entregables, hoy);
        renderizarDashboardValidacion(entregablesHoy, appState.validaciones, appState.clientes, appState.marcas, hoy);
    } else {
        cargarDashboardValidacion();
    }
}

// ========================================
// RENDERIZADO - ALERTAS (OBSOLETO)
// ========================================

function renderizarAlertas() {
    // Función obsoleta - ahora usamos el dashboard de validaciones
    return;
}

// ========================================
// RENDERIZADO - HERRAMIENTAS POPULARES
// ========================================

function renderizarHerramientasPopulares() {
    const container = document.getElementById('herramientas-populares');

    // Contar uso de cada herramienta
    const herramientasCount = {};
    appState.recursos.forEach(recurso => {
        const nombreHerramienta = recurso.Nombre_Herramienta || '';
        herramientasCount[nombreHerramienta] = (herramientasCount[nombreHerramienta] || 0) + 1;
    });

    // Ordenar por uso
    const herramientasOrdenadas = Object.entries(herramientasCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (herramientasOrdenadas.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay herramientas registradas</p>';
        return;
    }

    container.innerHTML = herramientasOrdenadas.map(([nombre, count]) => {
        const herramienta = appState.herramientas.find(h => h.Nombre_Herramienta === nombre);
        const icono = herramienta ? herramienta.Icono : '🔧';

        return `
            <div class="herramienta-chip" onclick="filtrarPorHerramienta('${nombre}')">
                <span>${icono}</span>
                <span>${nombre}</span>
                <span class="count">${count}</span>
            </div>
        `;
    }).join('');
}

// ========================================
// RENDERIZADO - LISTA CLIENTES
// ========================================

function renderizarListaClientes() {
    const container = document.getElementById('clientes-lista');
    const clientesActivos = appState.clientes.filter(c => c.Estado === 'Activo');

    if (clientesActivos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No hay clientes activos</p>
                <button class="btn-primary" onclick="mostrarFormularioCliente()">
                    <i class="fas fa-plus"></i> Agregar Primer Cliente
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = clientesActivos.map(cliente => {
        const entregablesCliente = appState.entregables.filter(e => e.ID_Cliente == cliente.ID_Cliente);
        const recursosCliente = appState.recursos.filter(r => {
            return entregablesCliente.some(e => e.ID_Entregable == r.ID_Entregable);
        });

        return `
            <div class="cliente-card" onclick="verDetalleCliente('${cliente.ID_Cliente}')">
                <div class="cliente-card-header">
                    <div class="cliente-card-icon">
                        <i class="fas fa-folder"></i>
                    </div>
                    <div class="cliente-card-title">
                        <h3>${cliente.Nombre_Cliente}</h3>
                        <p>${cliente.Marca || 'Sin marca'}</p>
                    </div>
                </div>
                <div class="cliente-card-stats">
                    <div class="cliente-stat">
                        <i class="fas fa-chart-line"></i>
                        <span>${entregablesCliente.length} Entregables</span>
                    </div>
                    <div class="cliente-stat">
                        <i class="fas fa-link"></i>
                        <span>${recursosCliente.length} Recursos</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// RENDERIZADO - TABLA CLIENTES
// ========================================

function renderizarTablaClientes() {
    const container = document.getElementById('clientes-tabla-container');

    if (appState.clientes.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No hay clientes registrados</p></div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 30px;"></th>
                    <th>Cliente</th>
                    <th>Marcas</th>
                    <th>Estado</th>
                    <th>Entregables</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${appState.clientes.map(cliente => {
        const marcasCliente = appState.marcas.filter(m => m.ID_Cliente == cliente.ID_Cliente);
        const entregables = appState.entregables.filter(e => {
            // Contar entregables de todas las marcas del cliente
            return marcasCliente.some(m => m.ID_Marca == e.ID_Marca);
        }).length;

        // Determinar color del estado
        const estado = cliente.Estado || 'Activo';
        let estadoBadge = '';
        if (estado === 'Activo') {
            estadoBadge = 'badge-activo';
        } else if (estado === 'Inactivo') {
            estadoBadge = 'badge-inactivo';
        } else if (estado === 'Pausado') {
            estadoBadge = 'badge-pausado';
        } else {
            estadoBadge = 'badge-activo';
        }

        // Fila principal del cliente
        let filas = `
                        <tr class="cliente-row" data-cliente-id="${cliente.ID_Cliente}">
                            <td>
                                ${marcasCliente.length > 0 ? `
                                    <button class="btn-expand" onclick="toggleMarcas('${cliente.ID_Cliente}')" title="Ver marcas">
                                        <i class="fas fa-chevron-right" id="expand-icon-${cliente.ID_Cliente}"></i>
                                    </button>
                                ` : ''}
                            </td>
                            <td><strong>${cliente.Nombre_Cliente}</strong></td>
                            <td>
                                <span class="marcas-count">${marcasCliente.length} ${marcasCliente.length === 1 ? 'marca' : 'marcas'}</span>
                            </td>
                            <td><span class="badge ${estadoBadge}">${estado}</span></td>
                            <td>${entregables}</td>
                            <td>
                                <button class="btn-icon" onclick="verDetalleCliente('${cliente.ID_Cliente}')" title="Ver detalles completos">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-icon" onclick="mostrarFormularioMarca('${cliente.ID_Cliente}')" title="Agregar marca">
                                    <i class="fas fa-plus"></i>
                                </button>
                                <button class="btn-icon" onclick="editarCliente('${cliente.ID_Cliente}')" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon btn-danger" onclick="eliminarCliente('${cliente.ID_Cliente}')" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;

        // Fila expandible con la lista de marcas
        if (marcasCliente.length > 0) {
            filas += `
                            <tr class="marcas-expandible" id="marcas-${cliente.ID_Cliente}" style="display: none;">
                                <td></td>
                                <td colspan="5">
                                    <div class="marcas-lista-container">
                                        <h4 style="margin: 0 0 12px 0; color: #5F6368; font-size: 14px;">
                                            <i class="fas fa-tags"></i> Marcas de ${cliente.Nombre_Cliente}
                                        </h4>
                                        <div class="marcas-lista">
                                            ${marcasCliente.map(marca => {
                const entregablesMarca = appState.entregables.filter(e => e.ID_Marca == marca.ID_Marca);
                return `
                                                <div class="marca-item-container">
                                                    <div class="marca-item">
                                                        <div class="marca-info">
                                                            ${entregablesMarca.length > 0 ? `
                                                                <button class="btn-expand-small" onclick="toggleEntregables('${marca.ID_Marca}')" title="Ver entregables">
                                                                    <i class="fas fa-chevron-right" id="expand-entregables-icon-${marca.ID_Marca}"></i>
                                                                </button>
                                                            ` : '<span style="width: 20px; display: inline-block;"></span>'}
                                                            <i class="fas fa-tag"></i>
                                                            <strong>${marca.Nombre_Marca}</strong>
                                                            <span class="badge badge-${(marca.Estado || 'Activo').toLowerCase()}">${marca.Estado || 'Activo'}</span>
                                                            <span class="entregables-count">${entregablesMarca.length} ${entregablesMarca.length === 1 ? 'entregable' : 'entregables'}</span>
                                                        </div>
                                                        <div class="marca-acciones">
                                                            <button class="btn-icon-small" onclick="mostrarFormularioEntregable('${marca.ID_Marca}')" title="Agregar entregable">
                                                                <i class="fas fa-plus-circle"></i>
                                                            </button>
                                                            <button class="btn-icon-small" onclick="editarMarca('${marca.ID_Marca}')" title="Editar marca">
                                                                <i class="fas fa-edit"></i>
                                                            </button>
                                                            <button class="btn-icon-small btn-danger" onclick="eliminarMarca('${marca.ID_Marca}')" title="Eliminar marca">
                                                                <i class="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    ${entregablesMarca.length > 0 ? `
                                                        <div class="entregables-expandible" id="entregables-${marca.ID_Marca}" style="display: none;">
                                                            <div class="entregables-lista">
                                                                <h5 style="margin: 8px 0; color: #5F6368; font-size: 13px;">
                                                                    <i class="fas fa-file-alt"></i> Entregables de ${marca.Nombre_Marca}
                                                                </h5>
                                                                ${entregablesMarca.map(entregable => `
                                                                    <div class="entregable-item">
                                                                        <div class="entregable-info">
                                                                            <i class="fas fa-file-alt"></i>
                                                                            <strong>${entregable.Nombre_Entregable}</strong>
                                                                            <span class="badge badge-secondary">${entregable.Tipo_Entregable || 'Sin tipo'}</span>
                                                                            <span class="badge badge-${(entregable.Estado || 'Activo').toLowerCase()}">${entregable.Estado || 'Activo'}</span>
                                                                            <span class="entregable-frecuencia">${entregable.Frecuencia_Validacion || '-'}</span>
                                                                            ${entregable.url_entregable ? `
                                                                                <a href="${entregable.url_entregable}" target="_blank" class="link-entregable" title="Ver Entregable">
                                                                                    <i class="fas fa-external-link-alt"></i> Link
                                                                                </a>
                                                                            ` : ''}
                                                                        </div>
                                                                        <div class="entregable-acciones">
                                                                            <button class="btn-icon-small" onclick="verDetalleEntregable('${entregable.ID_Entregable}')" title="Ver detalle">
                                                                                <i class="fas fa-eye"></i>
                                                                            </button>
                                                                            <button class="btn-icon-small" onclick="editarEntregable('${entregable.ID_Entregable}')" title="Editar">
                                                                                <i class="fas fa-edit"></i>
                                                                            </button>
                                                                            <button class="btn-icon-small btn-danger" onclick="eliminarEntregable('${entregable.ID_Entregable}')" title="Eliminar">
                                                                                <i class="fas fa-trash"></i>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `;
            }).join('')}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;
        }

        return filas;
    }).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;

    // Restaurar estado de filas expandidas (clientes)
    appState.expandedClientes.forEach(idCliente => {
        const filaExpandible = document.getElementById(`marcas-${idCliente}`);
        const icono = document.getElementById(`expand-icon-${idCliente}`);
        if (filaExpandible && icono) {
            filaExpandible.style.display = 'table-row';
            icono.classList.remove('fa-chevron-right');
            icono.classList.add('fa-chevron-down');
        }
    });

    // Restaurar estado de entregables expandidos (marcas)
    if (appState.expandedMarcas) {
        appState.expandedMarcas.forEach(idMarca => {
            const divExpandible = document.getElementById(`entregables-${idMarca}`);
            const icono = document.getElementById(`expand-entregables-icon-${idMarca}`);
            if (divExpandible && icono) {
                divExpandible.style.display = 'block';
                icono.classList.remove('fa-chevron-right');
                icono.classList.add('fa-chevron-down');
            }
        });
    }
}

// ========================================
// RENDERIZADO - TABLA ALERTAS
// ========================================

function renderizarTablaAlertas(filtro = 'todas') {
    // Función obsoleta - ahora usamos el sistema de validaciones
    const container = document.getElementById('alertas-tabla-container');
    if (container) {
        container.innerHTML = '<div class="empty-state"><p>Esta función ha sido reemplazada por el sistema de Validaciones</p></div>';
    }
}

// ========================================
// DETALLE DE CLIENTE (MODAL)
// ========================================

function verDetalleCliente(idCliente) {
    const cliente = appState.clientes.find(c => c.ID_Cliente == idCliente);
    if (!cliente) {
        mostrarNotificacion('Cliente no encontrado', 'error');
        return;
    }

    appState.currentCliente = cliente;

    // Mostrar modal
    const modal = document.getElementById('modal-cliente');
    document.getElementById('modal-cliente-nombre').textContent = cliente.Nombre_Cliente;

    // Obtener marcas del cliente
    const marcas = appState.marcas.filter(m => m.ID_Cliente == idCliente);
    console.log(`🔍 Marcas encontradas para cliente ${idCliente}:`, marcas.length);
    console.log('📋 Detalles de marcas:', marcas.map(m => `${m.Nombre_Marca} (ID: ${m.ID_Marca})`));

    // Construir árbol de dependencias
    const estado = cliente.Estado || 'Activo';
    let estadoBadge = '';
    if (estado === 'Activo') {
        estadoBadge = 'badge-activo';
    } else if (estado === 'Inactivo') {
        estadoBadge = 'badge-inactivo';
    } else if (estado === 'Pausado') {
        estadoBadge = 'badge-pausado';
    } else {
        estadoBadge = 'badge-activo';
    }

    let html = `
        <div class="cliente-info-grid">
            <div class="info-item">
                <strong>Estado:</strong> <span class="badge ${estadoBadge}">${estado}</span>
            </div>
            <div class="info-item">
                <strong>Fecha Inicio:</strong> ${formatearFecha(cliente.Fecha_Inicio)}
            </div>
            <div class="info-item">
                <strong>Marcas:</strong> ${marcas.length}
            </div>
            <div class="info-item">
                <strong>Notas:</strong> ${cliente.Notas || '-'}
            </div>
        </div>

        <h3 style="margin-top: 24px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
            <span><i class="fas fa-tags"></i> Marcas del Cliente</span>
            <button class="btn-primary" onclick="mostrarFormularioMarca('${idCliente}')" style="font-size: 14px; padding: 8px 16px;">
                <i class="fas fa-plus"></i> Nueva Marca
            </button>
        </h3>
    `;

    if (marcas.length === 0) {
        html += '<div class="empty-state"><p>No hay marcas registradas para este cliente. Haz clic en "Nueva Marca" para agregar una.</p></div>';
    } else {
        marcas.forEach(marca => {
            // Obtener entregables de esta marca
            const entregablesMarca = appState.entregables.filter(e => e.ID_Marca == marca.ID_Marca);

            html += `
                <div class="marca-card" style="margin-bottom: 24px; padding: 16px; border: 2px solid #E8EAED; border-radius: 12px; background: #F8F9FA;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0; font-size: 18px; color: #202124;">
                                <i class="fas fa-tag"></i> ${marca.Nombre_Marca}
                            </h4>
                            ${marca.Notas ? `<p style="margin: 4px 0 0 0; color: #5F6368; font-size: 13px;">${marca.Notas}</p>` : ''}
                        </div>
                        <div>
                            <button class="btn-icon" onclick="mostrarFormularioEntregable('${marca.ID_Marca}')" title="Agregar entregable">
                                <i class="fas fa-plus-circle"></i>
                            </button>
                            <button class="btn-icon" onclick="editarMarca('${marca.ID_Marca}')" title="Editar marca">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarMarca('${marca.ID_Marca}')" title="Eliminar marca">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
            `;

            if (entregablesMarca.length === 0) {
                html += `
                    <div style="text-align: center; padding: 16px; background: white; border-radius: 8px; border: 2px dashed #E8EAED;">
                        <p style="color: #5F6368; font-size: 13px; margin: 0 0 8px 0;">Sin entregables asociados</p>
                        <button class="btn-primary" onclick="mostrarFormularioEntregable('${marca.ID_Marca}')" style="font-size: 12px; padding: 6px 12px;">
                            <i class="fas fa-plus"></i> Agregar Primer Entregable
                        </button>
                    </div>
                `;
            } else {
                html += `<div style="margin-top: 12px;">`;
                entregablesMarca.forEach(entregable => {
                    const recursos = appState.recursos.filter(r => r.ID_Entregable == entregable.ID_Entregable);

                    html += `
                        <div class="arbol-entregable" style="margin-bottom: 12px;">
                            <div class="arbol-header" style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                                    <i class="fas fa-chart-line"></i>
                                    <strong>${entregable.Nombre_Entregable}</strong>
                                    ${entregable.URL_Visualizacion ? `
                                        <button class="btn-icon" onclick="copiarURL('${entregable.URL_Visualizacion}')" title="Copiar URL">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                        <a href="${entregable.URL_Visualizacion}" target="_blank" class="btn-icon" title="Abrir">
                                            <i class="fas fa-external-link-alt"></i>
                                        </a>
                                    ` : ''}
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <button class="btn-icon-small" onclick="editarEntregable('${entregable.ID_Entregable}')" title="Editar entregable">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-icon-small btn-danger" onclick="eliminarEntregable('${entregable.ID_Entregable}')" title="Eliminar entregable">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="arbol-meta">
                                <span><i class="fas fa-sync-alt"></i> ${entregable.Frecuencia_Actualizacion || '-'}</span>
                                <span><i class="fas fa-user"></i> Interno: ${entregable.Responsable_Interno || '-'}</span>
                                ${entregable.Contacto_Cliente ? `<span><i class="fas fa-user-tie"></i> Cliente: ${entregable.Contacto_Cliente}${entregable.Email_Cliente ? ` (${entregable.Email_Cliente})` : ''}</span>` : ''}
                            </div>
                    `;

                    if (recursos.length > 0) {
                        html += '<div class="arbol-recursos">';
                        recursos.forEach(recurso => {
                            const estadoClass = (recurso.Ultimo_Estado || 'desconocido').toLowerCase();
                            const estadoIcon = estadoClass === 'ok' ? 'check-circle' : estadoClass === 'error' ? 'times-circle' : 'exclamation-circle';

                            html += `
                                <div class="arbol-recurso">
                                    <div class="recurso-header">
                                        <span class="recurso-icon">${recurso.Nombre_Herramienta ? getHerramientaIcon(recurso.Nombre_Herramienta) : '🔗'}</span>
                                        <strong>${recurso.Nombre_Recurso}</strong>
                                        <span class="badge badge-${estadoClass}">
                                            <i class="fas fa-${estadoIcon}"></i> ${recurso.Ultimo_Estado || 'Desconocido'}
                                        </span>
                                    </div>
                                    ${recurso.URL_Configuracion ? `
                                        <div class="recurso-url">
                                            <i class="fas fa-link"></i>
                                            <code>${truncarURL(recurso.URL_Configuracion, 60)}</code>
                                            <button class="btn-icon" onclick="copiarURL('${recurso.URL_Configuracion}')" title="Copiar URL">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                            <a href="${recurso.URL_Configuracion}" target="_blank" class="btn-icon" title="Abrir">
                                                <i class="fas fa-external-link-alt"></i>
                                            </a>
                                        </div>
                                    ` : ''}
                                    <div class="recurso-meta">
                                        <span><i class="fas fa-clock"></i> ${recurso.Frecuencia_Ejecucion || '-'}</span>
                                        ${recurso.Fecha_Ultima_Ejecucion ? `<span><i class="fas fa-calendar"></i> ${formatearFecha(recurso.Fecha_Ultima_Ejecucion)}</span>` : ''}
                                    </div>
                                </div>
                            `;
                        });
                        html += '</div>';
                    }

                    html += '</div>';
                });
                html += '</div>';
            }

            html += '</div>'; // Close marca-card
        });
    }

    document.getElementById('cliente-detalles').innerHTML = html;
    modal.classList.add('active');
}

// Cerrar modal de detalle de cliente
function cerrarModalCliente() {
    intentarCerrarModal('modal-cliente', true); // Detalle no necesita confirmación
    appState.currentCliente = null;
}

// ========================================
// FORMULARIO CLIENTE
// ========================================

function mostrarFormularioCliente() {
    const modal = document.getElementById('modal-form-cliente');
    const form = document.getElementById('form-cliente');
    modal.classList.add('active');
    form.reset();
    delete form.dataset.dirty;
}

// Cerrar formulario de cliente
function cerrarFormularioCliente(force = false) {
    intentarCerrarModal('modal-form-cliente', force);
    // Restaurar título original
    document.querySelector('#modal-form-cliente .modal-header h2').innerHTML = '<i class="fas fa-plus"></i> Nuevo Cliente';
}

async function guardarCliente(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const clienteId = formData.get('id_cliente');

    const clienteData = {
        Nombre_Cliente: formData.get('nombre_cliente'),
        Fecha_Inicio: formData.get('fecha_inicio'),
        Estado: formData.get('estado'),
        Notas: formData.get('notas')
    };

    try {
        // Validar nombre
        let nombreCliente = (clienteData.Nombre_Cliente || '').trim();
        if (!nombreCliente) {
            throw new Error('El nombre del cliente es requerido');
        }

        // Convertir a mayúsculas
        nombreCliente = nombreCliente.toUpperCase();

        // Validar duplicados
        const nombreNormalizado = nombreCliente.toLowerCase();
        const duplicado = appState.clientes.find(c => {
            if (clienteId && c.ID_Cliente == clienteId) return false;
            const nombreExistente = (c.Nombre_Cliente || '').trim().toLowerCase();
            return nombreExistente === nombreNormalizado;
        });

        if (duplicado) {
            throw new Error(`Ya existe un cliente con el nombre "${duplicado.Nombre_Cliente}".`);
        }

        clienteData.Nombre_Cliente = nombreCliente;
        const isEdit = !!clienteId;

        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion(isEdit ? 'Actualizando cliente...' : 'Creando cliente...');

        // ACTUALIZACIÓN OPTIMISTA: Actualizar UI INMEDIATAMENTE
        if (isEdit) {
            // Actualizar cliente existente
            const index = appState.clientes.findIndex(c => c.ID_Cliente == clienteId);
            if (index !== -1) {
                appState.clientes[index] = {
                    ...appState.clientes[index],
                    ...clienteData
                };
            }
        } else {
            // Agregar nuevo cliente con ID temporal
            const tempCliente = {
                ID_Cliente: `temp_${Date.now()}`,
                ...clienteData,
                Fecha_Creacion: new Date().toISOString(),
                Ultima_Actualizacion: new Date().toISOString()
            };
            appState.clientes.push(tempCliente);
        }

        // Guardar en localStorage
        localStorage.setItem('clientes', JSON.stringify(appState.clientes));

        // Actualizar UI INMEDIATAMENTE
        cerrarFormularioCliente(true);
        refrescarVistaActual(true);

        // Guardar en Google Sheets en background
        enviarAlScript({
            action: isEdit ? 'update' : 'add',
            sheetName: 'Clientes',
            data: clienteData,
            rowId: clienteId
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Cliente guardado en Sheets');

                // Si es creación, actualizar ID temporal con ID real
                if (!isEdit && result.data && result.data.id) {
                    const index = appState.clientes.findIndex(c => String(c.ID_Cliente).startsWith('temp_'));
                    if (index !== -1) {
                        appState.clientes[index].ID_Cliente = result.data.id;
                        localStorage.setItem('clientes', JSON.stringify(appState.clientes));
                        refrescarVistaActual(true);
                    }
                }

                ocultarBloqueoOperacion();
                mostrarNotificacion(isEdit ? '✅ Cliente editado correctamente' : '✅ Cliente creado correctamente', 'success');
            } else {
                ocultarBloqueoOperacion();
                throw new Error(result.message);
            }
        }).catch(error => {
            console.error('Error guardando en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

function editarCliente(idCliente) {
    const cliente = appState.clientes.find(c => c.ID_Cliente == idCliente);
    if (!cliente) {
        mostrarNotificacion('Cliente no encontrado', 'error');
        return;
    }

    // Llenar el formulario con los datos del cliente
    const form = document.getElementById('form-cliente');
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_cliente"]').value = cliente.ID_Cliente;
    form.querySelector('[name="nombre_cliente"]').value = cliente.Nombre_Cliente || '';
    form.querySelector('[name="fecha_inicio"]').value = cliente.Fecha_Inicio || '';
    form.querySelector('[name="estado"]').value = cliente.Estado || 'Activo';
    form.querySelector('[name="notas"]').value = cliente.Notas || '';

    // Cambiar el título del modal
    document.querySelector('#modal-form-cliente .modal-header h2').innerHTML = '<i class="fas fa-edit"></i> Editar Cliente';

    // Mostrar el modal
    document.getElementById('modal-form-cliente').classList.add('active');
}

async function eliminarCliente(idCliente) {
    const cliente = appState.clientes.find(c => c.ID_Cliente == idCliente);
    if (!cliente) {
        mostrarNotificacion('Cliente no encontrado', 'error');
        return;
    }

    // Confirmar eliminación
    if (!confirm(`¿Estás seguro de eliminar el cliente "${cliente.Nombre_Cliente}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion('Eliminando cliente...');

        // ACTUALIZACIÓN OPTIMISTA: Eliminar de UI INMEDIATAMENTE
        const index = appState.clientes.findIndex(c => c.ID_Cliente == idCliente);
        if (index !== -1) {
            appState.clientes.splice(index, 1);
        }
        localStorage.setItem('clientes', JSON.stringify(appState.clientes));

        // Actualizar UI INMEDIATAMENTE
        refrescarVistaActual(true);

        // Eliminar en background (sin await)
        enviarAlScript({
            action: 'delete',
            sheetName: 'Clientes',
            rowId: idCliente
        }).then(async result => {
            if (result.status === 'success') {
                console.log('✅ Cliente eliminado en Sheets');

                // Sincronizar inmediatamente para confirmar eliminación
                await sincronizarDatosInteligente();

                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Cliente eliminado correctamente', 'success');
            } else {
                throw new Error(result.message || 'Error al eliminar cliente');
            }
        }).catch(error => {
            console.error('Error al eliminar cliente en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
            // Revertir el cambio optimista
            appState.clientes.splice(index, 0, cliente);
            localStorage.setItem('clientes', JSON.stringify(appState.clientes));
            refrescarVistaActual(true);
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ Error al eliminar: ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

// ========================================
// TOGGLE MARCAS (EXPANDIR/COLAPSAR)
// ========================================

function toggleMarcas(idCliente) {
    const filaExpandible = document.getElementById(`marcas-${idCliente}`);
    const icono = document.getElementById(`expand-icon-${idCliente}`);

    if (filaExpandible.style.display === 'none') {
        // Expandir
        filaExpandible.style.display = 'table-row';
        icono.classList.remove('fa-chevron-right');
        icono.classList.add('fa-chevron-down');
        appState.expandedClientes.add(idCliente); // Guardar estado
    } else {
        // Colapsar
        filaExpandible.style.display = 'none';
        icono.classList.remove('fa-chevron-down');
        icono.classList.add('fa-chevron-right');
        appState.expandedClientes.delete(idCliente); // Remover estado
    }
}

function toggleEntregables(idMarca) {
    const divExpandible = document.getElementById(`entregables-${idMarca}`);
    const icono = document.getElementById(`expand-entregables-icon-${idMarca}`);

    if (!divExpandible || !icono) return;

    if (divExpandible.style.display === 'none') {
        // Expandir
        divExpandible.style.display = 'block';
        icono.classList.remove('fa-chevron-right');
        icono.classList.add('fa-chevron-down');
        // Guardar estado expandido
        if (!appState.expandedMarcas) appState.expandedMarcas = new Set();
        appState.expandedMarcas.add(idMarca);
    } else {
        // Colapsar
        divExpandible.style.display = 'none';
        icono.classList.remove('fa-chevron-down');
        icono.classList.add('fa-chevron-right');
        // Remover estado
        if (appState.expandedMarcas) appState.expandedMarcas.delete(idMarca);
    }
}

// ========================================
// UTILIDADES
// ========================================

function copiarURL(url) {
    navigator.clipboard.writeText(url).then(() => {
        mostrarNotificacion('✅ URL copiada al portapapeles', 'success');
    }).catch(() => {
        mostrarNotificacion('Error al copiar URL', 'error');
    });
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return fecha;
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

function calcularTiempoTranscurrido(fecha) {
    if (!fecha) return '';
    const ahora = new Date();
    const entonces = new Date(fecha);
    const diff = ahora - entonces;
    const horas = Math.floor(diff / (1000 * 60 * 60));
    if (horas < 24) return `Hace ${horas}h`;
    const dias = Math.floor(horas / 24);
    return `Hace ${dias}d`;
}

function truncarURL(url, maxLength) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
}



function mostrarCargando(mostrar) {
    // Implementación simple
    if (mostrar) {
        console.log('⏳ Cargando datos...');
    } else {
        console.log('✅ Datos cargados');
    }
}

function mostrarBloqueoOperacion(mensaje = 'Procesando...') {
    // Crear overlay si no existe
    let overlay = document.getElementById('operation-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'operation-overlay';
        overlay.innerHTML = `
            <div class="operation-spinner">
                <div class="spinner"></div>
                <p id="operation-message">Procesando...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    document.getElementById('operation-message').textContent = mensaje;
    overlay.style.display = 'flex';
}

function ocultarBloqueoOperacion() {
    const overlay = document.getElementById('operation-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========================================
// COMUNICACIÓN CON GOOGLE APPS SCRIPT
// ========================================

/**
 * Envía datos al Google Apps Script para realizar operaciones CRUD
 * NOTA: Requiere que Apps Script tenga CORS habilitado (ver docs/FIX-APPS-SCRIPT-CORS.md)
 */
async function enviarAlScript(payload) {
    if (!CONFIG.SCRIPT_URL) {
        throw new Error('SCRIPT_URL no configurado en config.js');
    }

    // Agregar usuario al payload si no existe
    if (!payload.user) {
        payload.user = 'Web App User';
    }

    console.log('📤 Enviando al servidor:', JSON.stringify(payload, null, 2));

    // ACTIVAR COOLDOWN: Marcar tiempo de escritura para pausar sincronización automática
    if (appState) {
        appState.lastWriteTime = Date.now();
        console.log('🕒 Cooldown activado por escritura local');
    }

    try {
        const response = await fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(payload)
        });

        console.log('📡 Respuesta HTTP status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('📥 Respuesta del servidor:', result);

        // EXTENDER COOLDOWN: Actualizar timestamp al confirmar éxito para dar tiempo a propagación
        if (appState) {
            appState.lastWriteTime = Date.now();
        }

        return result;

    } catch (error) {
        console.error('❌ Error al comunicarse con Apps Script:', error);
        console.error('Stack trace:', error.stack);
        throw new Error('Error de conexión con el servidor: ' + error.message);
    }
}

/**
 * Versión alternativa usando Google Apps Script Web App
 * (Funciona mejor con CORS habilitado)
 */
async function enviarAlScriptCORS(action, data) {
    if (!CONFIG.SCRIPT_URL) {
        throw new Error('SCRIPT_URL no configurado en config.js');
    }

    const payload = {
        action: action,
        data: data,
        user: 'Web App User'
    };

    try {
        const response = await fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain' // Evita preflight
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        return result;

    } catch (error) {
        console.error('Error al comunicarse con Apps Script:', error);
        throw error;
    }
}

// ========================================
// FORMULARIO MARCA
// ========================================

function mostrarFormularioMarca(idCliente) {
    const modal = document.getElementById('modal-form-marca');
    const form = document.getElementById('form-marca');
    modal.classList.add('active');
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_cliente"]').value = idCliente;
    form.querySelector('[name="id_marca"]').value = '';

    document.querySelector('#modal-form-marca .modal-header h2').innerHTML = '<i class="fas fa-plus"></i> Nueva Marca';
}

// Cerrar formulario de marca
function cerrarFormularioMarca(force = false) {
    intentarCerrarModal('modal-form-marca', force);
}

async function guardarMarca(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const marcaId = formData.get('id_marca');
    const idCliente = formData.get('id_cliente');

    // Obtener nombre del cliente
    const cliente = appState.clientes.find(c => c.ID_Cliente == idCliente);
    const nombreCliente = cliente ? cliente.Nombre_Cliente : '';

    try {
        // Validar nombre INMEDIATAMENTE (sin recargar)
        let nombreMarca = (formData.get('nombre_marca') || '').trim();
        if (!nombreMarca) {
            throw new Error('El nombre de la marca es requerido');
        }

        // Convertir a mayúsculas
        nombreMarca = nombreMarca.toUpperCase();

        // Validar duplicados (case-insensitive) dentro del mismo cliente
        const nombreNormalizado = nombreMarca.toLowerCase();
        const duplicado = appState.marcas.find(m => {
            // Solo comparar con marcas del mismo cliente
            if (m.ID_Cliente != idCliente) return false;
            // Si estamos editando, ignorar la marca actual
            if (marcaId && m.ID_Marca == marcaId) return false;
            // Comparar nombres normalizados
            const nombreExistente = (m.Nombre_Marca || '').trim().toLowerCase();
            return nombreExistente === nombreNormalizado;
        });

        if (duplicado) {
            throw new Error(`Ya existe una marca con el nombre "${duplicado.Nombre_Marca}" para este cliente.`);
        }

        const marcaData = {
            ID_Cliente: idCliente,
            Nombre_Cliente: nombreCliente,
            Nombre_Marca: nombreMarca,
            Estado: formData.get('estado'),
            Notas: formData.get('notas')
        };

        const isEdit = !!marcaId;

        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion(isEdit ? 'Actualizando marca...' : 'Creando marca...');

        // ACTUALIZACIÓN OPTIMISTA: Actualizar UI INMEDIATAMENTE
        if (isEdit) {
            const index = appState.marcas.findIndex(m => m.ID_Marca == marcaId);
            if (index !== -1) {
                appState.marcas[index] = { ...appState.marcas[index], ...marcaData };
            }
        } else {
            const tempMarca = {
                ID_Marca: `temp_${Date.now()}`,
                ...marcaData,
                Fecha_Creacion: new Date().toISOString()
            };
            appState.marcas.push(tempMarca);
        }

        localStorage.setItem('marcas', JSON.stringify(appState.marcas));

        // Actualizar UI INMEDIATAMENTE
        cerrarFormularioMarca(true);
        refrescarVistaActual(true);
        if (appState.currentCliente && appState.currentCliente.ID_Cliente == idCliente) {
            verDetalleCliente(idCliente);
        }

        // Preparar payload para el nuevo formato genérico
        const payload = {
            action: isEdit ? 'update' : 'add',
            sheetName: 'Marcas',
            data: marcaData
        };

        if (isEdit) {
            payload.rowId = marcaId;
        }

        // Guardar en background (sin await)
        enviarAlScript(payload).then(result => {
            if (result.status === 'success') {
                console.log('✅ Marca guardada en Sheets');

                // Si es creación, actualizar ID temporal con ID real
                if (!isEdit && result.data && result.data.id) {
                    const index = appState.marcas.findIndex(m => String(m.ID_Marca).startsWith('temp_'));
                    if (index !== -1) {
                        appState.marcas[index].ID_Marca = result.data.id;
                        localStorage.setItem('marcas', JSON.stringify(appState.marcas));
                        refrescarVistaActual(true);
                        if (appState.currentCliente && appState.currentCliente.ID_Cliente == appState.marcas[index].ID_Cliente) {
                            verDetalleCliente(appState.marcas[index].ID_Cliente);
                        }
                    }
                }

                ocultarBloqueoOperacion();
                mostrarNotificacion(isEdit ? '✅ Marca editada correctamente' : '✅ Marca creada correctamente', 'success');
            } else {
                ocultarBloqueoOperacion();
                throw new Error(result.message || 'Error al guardar marca');
            }
        }).catch(error => {
            console.error('Error al guardar marca en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        console.error('Error al guardar marca:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ Error al guardar: ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

function editarMarca(idMarca) {
    const marca = appState.marcas.find(m => m.ID_Marca == idMarca);
    if (!marca) {
        mostrarNotificacion('Marca no encontrada', 'error');
        return;
    }

    const form = document.getElementById('form-marca');
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_marca"]').value = marca.ID_Marca;
    form.querySelector('[name="id_cliente"]').value = marca.ID_Cliente;
    form.querySelector('[name="nombre_marca"]').value = marca.Nombre_Marca || '';
    form.querySelector('[name="estado"]').value = marca.Estado || 'Activo';
    form.querySelector('[name="notas"]').value = marca.Notas || '';

    document.querySelector('#modal-form-marca .modal-header h2').innerHTML = '<i class="fas fa-edit"></i> Editar Marca';
    document.getElementById('modal-form-marca').classList.add('active');
}

async function eliminarMarca(idMarca) {
    const marca = appState.marcas.find(m => m.ID_Marca == idMarca);
    if (!marca) {
        mostrarNotificacion('Marca no encontrada', 'error');
        return;
    }

    if (!confirm(`¿Estás seguro de eliminar la marca "${marca.Nombre_Marca}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion('Eliminando marca...');

        // ACTUALIZACIÓN OPTIMISTA: Eliminar de UI INMEDIATAMENTE
        const index = appState.marcas.findIndex(m => m.ID_Marca == idMarca);
        if (index !== -1) {
            appState.marcas.splice(index, 1);
        }
        localStorage.setItem('marcas', JSON.stringify(appState.marcas));

        // Actualizar UI INMEDIATAMENTE
        refrescarVistaActual(true);
        if (appState.currentCliente && appState.currentCliente.ID_Cliente == marca.ID_Cliente) {
            verDetalleCliente(marca.ID_Cliente);
        }

        // Eliminar en background (sin await)
        enviarAlScript({
            action: 'delete',
            sheetName: 'Marcas',
            rowId: idMarca
        }).then(async result => {
            if (result.status === 'success') {
                console.log('✅ Marca eliminada en Sheets');

                // Sincronizar inmediatamente para confirmar eliminación
                await sincronizarDatosInteligente();

                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Marca eliminada correctamente', 'success');
            } else {
                throw new Error(result.message || 'Error al eliminar marca');
            }
        }).catch(error => {
            console.error('Error al eliminar marca en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
            // Revertir el cambio optimista
            appState.marcas.splice(index, 0, marca);
            localStorage.setItem('marcas', JSON.stringify(appState.marcas));
            refrescarVistaActual(true);
            if (appState.currentCliente && appState.currentCliente.ID_Cliente == marca.ID_Cliente) {
                verDetalleCliente(marca.ID_Cliente);
            }
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        console.error('Error al eliminar marca:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ Error al eliminar: ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

// ========================================
// GESTIÓN DE ENTREGABLES
// ========================================

function mostrarFormularioEntregable(idMarca) {
    const marca = appState.marcas.find(m => m.ID_Marca == idMarca);
    if (!marca) {
        mostrarNotificacion('Marca no encontrada', 'error');
        return;
    }

    const modal = document.getElementById('modal-form-entregable');
    const form = document.getElementById('form-entregable');

    // Limpiar formulario
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_entregable"]').value = '';
    form.querySelector('[name="id_cliente"]').value = marca.ID_Cliente;
    form.querySelector('[name="id_marca"]').value = idMarca;

    // Cargar opciones dinámicas
    cargarClientesEnFormulario();
    cargarTiposEntregable();

    // Inicializar tabla de herramientas con una fila vacía
    limpiarHerramientas();
    agregarFilaHerramienta();

    // Limpiar campo automatizado
    const checkboxAutomatizado = document.getElementById('checkbox-automatizado');
    const campoAutomatizacion = document.getElementById('campo-proceso-automatizacion');
    if (checkboxAutomatizado) checkboxAutomatizado.checked = false;
    if (campoAutomatizacion) campoAutomatizacion.style.display = 'none';

    // Pre-seleccionar cliente y marca
    setTimeout(() => {
        const selectCliente = document.getElementById('select-cliente-entregable');
        if (selectCliente) {
            selectCliente.value = marca.ID_Cliente;
            cargarMarcasDeCliente(marca.ID_Cliente);

            setTimeout(() => {
                const selectMarca = document.getElementById('select-marca-entregable');
                if (selectMarca) {
                    selectMarca.value = idMarca;
                }
            }, 100);
        }
    }, 100);

    // Cambiar título del modal
    modal.querySelector('.modal-header h2').innerHTML = `<i class="fas fa-plus"></i> Nuevo Entregable para ${marca.Nombre_Marca}`;

    // Mostrar modal
    modal.classList.add('active');
}

// Cerrar formulario de entregable
function cerrarFormularioEntregable(force = false) {
    intentarCerrarModal('modal-form-entregable', force);
}

// Cargar clientes en el formulario de entregables
async function cargarClientesEnFormulario() {
    const select = document.getElementById('select-cliente-entregable');
    if (!select) return;

    try {
        const clientes = appState.clientes || [];
        const clientesActivos = clientes.filter(c => c.Estado === 'Activo');

        let options = '<option value="">Selecciona un cliente...</option>';
        clientesActivos.forEach(cliente => {
            options += `<option value="${cliente.ID_Cliente}">${cliente.Nombre_Cliente}</option>`;
        });

        select.innerHTML = options;
    } catch (error) {
        console.error('Error al cargar clientes:', error);
        select.innerHTML = '<option value="">Error al cargar clientes</option>';
    }
}

// Cargar marcas de un cliente específico
async function cargarMarcasDeCliente(idCliente) {
    const select = document.getElementById('select-marca-entregable');
    if (!select) return;

    try {
        if (!idCliente) {
            select.innerHTML = '<option value="">Primero selecciona un cliente...</option>';
            return;
        }

        const marcas = appState.marcas || [];
        const marcasDelCliente = marcas.filter(m => m.ID_Cliente == idCliente && m.Estado === 'Activo');

        if (marcasDelCliente.length === 0) {
            select.innerHTML = '<option value="">No hay marcas para este cliente</option>';
            return;
        }

        let options = '<option value="">Selecciona una marca...</option>';
        marcasDelCliente.forEach(marca => {
            options += `<option value="${marca.ID_Marca}">${marca.Nombre_Marca}</option>`;
        });

        select.innerHTML = options;
    } catch (error) {
        console.error('Error al cargar marcas:', error);
        select.innerHTML = '<option value="">Error al cargar marcas</option>';
    }
}

// ========================================
// HERRAMIENTAS DINÁMICAS - Tabla de URLs
// ========================================

let contadorHerramientas = 0;

function agregarFilaHerramienta(herramienta = '', url = '') {
    const tbody = document.getElementById('herramientas-list');
    if (!tbody) return;

    const id = ++contadorHerramientas;
    const herramientas = appState.herramientas || [];

    const row = document.createElement('tr');
    row.id = `herramienta-row-${id}`;
    row.innerHTML = `
        <td>
            <select class="herramienta-select" data-id="${id}" required>
                <option value="">Selecciona herramienta...</option>
                ${herramientas.map(h => `
                    <option value="${h.Nombre_Herramienta}" ${h.Nombre_Herramienta === herramienta ? 'selected' : ''}>
                        ${h.Nombre_Herramienta}
                    </option>
                `).join('')}
            </select>
        </td>
        <td>
            <input type="text" class="herramienta-url" data-id="${id}"
                   placeholder="URL o descripción (ej: Dashboard en carpeta X)"
                   value="${url}" required>
        </td>
        <td style="text-align: center;">
            <button type="button" class="btn-icon btn-danger" onclick="eliminarFilaHerramienta(${id})" title="Eliminar">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    tbody.appendChild(row);
    actualizarHerramientasHidden();
}

function eliminarFilaHerramienta(id) {
    const row = document.getElementById(`herramienta-row-${id}`);
    if (row) {
        row.remove();
        actualizarHerramientasHidden();
    }
}

// Función para obtener icono de herramienta de forma segura
function getHerramientaIcon(nombreHerramienta) {
    if (!appState.herramientas) return '🔧';
    const herramienta = appState.herramientas.find(h => h.Nombre_Herramienta === nombreHerramienta);
    return (herramienta && herramienta.Icono) ? herramienta.Icono : '🔧';
}

function actualizarHerramientasHidden() {
    const herramientas = [];
    const tbody = document.getElementById('herramientas-list');

    // Iterar sobre las filas de la tabla para asegurar la relación 1:1
    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const select = row.querySelector('.herramienta-select');
            const input = row.querySelector('.herramienta-url');

            if (select && input) {
                const herramienta = select.value;
                const url = input.value || ''; // Permitir vacío si es necesario, o validar

                // Solo guardar si al menos se seleccionó una herramienta
                if (herramienta) {
                    herramientas.push({ herramienta, url });
                }
            }
        });
    }

    const hidden = document.getElementById('hidden-herramientas');
    if (hidden) {
        hidden.value = JSON.stringify(herramientas);
        console.log('📦 Herramientas actualizadas:', herramientas);
    }
}

function limpiarHerramientas() {
    const tbody = document.getElementById('herramientas-list');
    if (tbody) {
        tbody.innerHTML = '';
        contadorHerramientas = 0;
    }
}

function cargarHerramientasDesdeJSON(jsonString) {
    limpiarHerramientas();

    if (!jsonString || jsonString === '[]' || jsonString === '') {
        // Agregar una fila vacía por defecto
        agregarFilaHerramienta();
        return;
    }

    try {
        const herramientas = JSON.parse(jsonString);
        if (Array.isArray(herramientas) && herramientas.length > 0) {
            herramientas.forEach(h => {
                agregarFilaHerramienta(h.herramienta, h.url);
            });
        } else {
            agregarFilaHerramienta();
        }
    } catch (error) {
        console.error('Error al parsear herramientas:', error);
        agregarFilaHerramienta();
    }
}

// Toggle campo de automatización
function toggleAutomatizadoField() {
    const checkbox = document.getElementById('checkbox-automatizado');
    const campo = document.getElementById('campo-proceso-automatizacion');
    const textarea = document.getElementById('textarea-proceso-automatizacion');

    if (checkbox && campo) {
        if (checkbox.checked) {
            campo.style.display = 'block';
            textarea.required = true;
        } else {
            campo.style.display = 'none';
            textarea.required = false;
            textarea.value = '';
        }
    }
}

// Actualizar opciones de día de validación según frecuencia
function actualizarCampoDiaValidacion(frecuencia) {
    const container = document.getElementById('container-dia-validacion');
    if (!container) return;

    let html = '';

    switch (frecuencia) {
        case 'Diario':
            html = `
                <select name="dia_validacion" id="select-dia-validacion" required>
                    <option value="Todos">Todos los días</option>
                </select>
            `;
            break;

        case 'Semanal':
            // Mostrar checkboxes para selección múltiple
            const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            html = '<div class="checkbox-group">';
            dias.forEach(dia => {
                html += `
                    <label class="checkbox-label">
                        <input type="checkbox" name="dias_semana" value="${dia}" class="checkbox-dia">
                        <span>${dia}</span>
                    </label>
                `;
            });
            html += '</div>';
            html += '<input type="hidden" name="dia_validacion" id="hidden-dia-validacion" required>';
            break;

        case 'Quincenal':
            html = `
                <select name="dia_validacion" id="select-dia-validacion" required>
                    <option value="">Selecciona día del mes...</option>
                    <option value="1">Día 1 y 15</option>
                </select>
            `;
            break;

        case 'Mensual':
            html = '<select name="dia_validacion" id="select-dia-validacion" required>';
            html += '<option value="">Selecciona día del mes...</option>';
            for (let i = 1; i <= 31; i++) {
                html += `<option value="${i}">Día ${i}</option>`;
            }
            html += '</select>';
            break;

        default:
            html = `
                <select name="dia_validacion" id="select-dia-validacion" required>
                    <option value="Todos">Todos los días</option>
                </select>
            `;
    }

    container.innerHTML = html;

    // Si es Semanal, agregar listener para actualizar el campo hidden
    if (frecuencia === 'Semanal') {
        const checkboxes = container.querySelectorAll('.checkbox-dia');
        const hiddenInput = document.getElementById('hidden-dia-validacion');

        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const selected = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                hiddenInput.value = selected.join(', ');
            });
        });
    }
}

function editarEntregable(idEntregable) {
    const entregable = appState.entregables.find(e => e.ID_Entregable == idEntregable);
    if (!entregable) {
        mostrarNotificacion('Entregable no encontrado', 'error');
        return;
    }

    const marca = appState.marcas.find(m => m.ID_Marca == entregable.ID_Marca);
    if (!marca) {
        mostrarNotificacion('Marca no encontrada', 'error');
        return;
    }

    const modal = document.getElementById('modal-form-entregable');
    const form = document.getElementById('form-entregable');

    // Limpiar y resetear estado sucio
    form.reset();
    delete form.dataset.dirty;

    // Cargar opciones dinámicas primero
    cargarClientesEnFormulario();
    cargarTiposEntregable();

    // Llenar formulario con datos del entregable
    form.querySelector('[name="id_entregable"]').value = entregable.ID_Entregable;
    form.querySelector('[name="id_cliente"]').value = entregable.ID_Cliente || marca.ID_Cliente;
    form.querySelector('[name="id_marca"]').value = entregable.ID_Marca;
    form.querySelector('[name="nombre_entregable"]').value = entregable.Nombre_Entregable || '';
    form.querySelector('[name="tipo_entregable"]').value = entregable.Tipo_Entregable || '';
    form.querySelector('[name="url_entregable"]').value = entregable.url_entregable || ''; // Cargar valor
    form.querySelector('[name="instrucciones_tecnicas"]').value = entregable.Instrucciones_Tecnicas || '';
    form.querySelector('[name="notas_troubleshooting"]').value = entregable.Notas_Troubleshooting || '';
    form.querySelector('[name="estado"]').value = entregable.Estado || 'Activo';

    // Cargar herramientas desde JSON
    cargarHerramientasDesdeJSON(entregable.URLs_Fuentes || '');

    // Cargar campo automatizado
    const checkboxAutomatizado = document.getElementById('checkbox-automatizado');
    const campoAutomatizacion = document.getElementById('campo-proceso-automatizacion');
    const textareaAutomatizacion = document.getElementById('textarea-proceso-automatizacion');

    if (entregable.Automatizado === 'Sí' || entregable.Automatizado === true) {
        if (checkboxAutomatizado) checkboxAutomatizado.checked = true;
        if (campoAutomatizacion) campoAutomatizacion.style.display = 'block';
        if (textareaAutomatizacion) {
            textareaAutomatizacion.value = entregable.Proceso_Automatizacion || '';
            textareaAutomatizacion.required = true;
        }
    } else {
        if (checkboxAutomatizado) checkboxAutomatizado.checked = false;
        if (campoAutomatizacion) campoAutomatizacion.style.display = 'none';
        if (textareaAutomatizacion) {
            textareaAutomatizacion.value = '';
            textareaAutomatizacion.required = false;
        }
    }

    // Seleccionar cliente y cargar sus marcas
    setTimeout(() => {
        const selectCliente = document.getElementById('select-cliente-entregable');
        if (selectCliente) {
            selectCliente.value = entregable.ID_Cliente || marca.ID_Cliente;
            cargarMarcasDeCliente(entregable.ID_Cliente || marca.ID_Cliente);

            setTimeout(() => {
                const selectMarca = document.getElementById('select-marca-entregable');
                if (selectMarca) {
                    selectMarca.value = entregable.ID_Marca;
                }
            }, 100);
        }

        // Configurar frecuencia y día de validación
        const selectFrecuencia = document.getElementById('select-frecuencia-validacion');
        if (selectFrecuencia && entregable.Frecuencia_Validacion) {
            selectFrecuencia.value = entregable.Frecuencia_Validacion;
            actualizarCampoDiaValidacion(entregable.Frecuencia_Validacion);

            setTimeout(() => {
                if (entregable.Frecuencia_Validacion === 'Semanal') {
                    // Si es semanal, marcar los checkboxes correspondientes
                    const diasSeleccionados = entregable.Dia_Validacion ?
                        entregable.Dia_Validacion.split(',').map(d => d.trim()) : [];

                    const checkboxes = document.querySelectorAll('.checkbox-dia');
                    checkboxes.forEach(checkbox => {
                        if (diasSeleccionados.includes(checkbox.value)) {
                            checkbox.checked = true;
                        }
                    });

                    // Actualizar el campo hidden
                    const hiddenInput = document.getElementById('hidden-dia-validacion');
                    if (hiddenInput) {
                        hiddenInput.value = diasSeleccionados.join(', ');
                    }
                } else {
                    // Para otros tipos de frecuencia, usar el select normal
                    const selectDia = document.getElementById('select-dia-validacion');
                    if (selectDia && entregable.Dia_Validacion) {
                        selectDia.value = entregable.Dia_Validacion;
                    }
                }
            }, 100);
        }
    }, 100);

    // Cambiar título del modal
    modal.querySelector('.modal-header h2').innerHTML = `<i class="fas fa-edit"></i> Editar Entregable: ${entregable.Nombre_Entregable}`;

    // Mostrar modal
    modal.classList.add('active');
}

// ========================================
// VER DETALLE ENTREGABLE
// ========================================

function verDetalleEntregable(idEntregable) {
    const entregable = appState.entregables.find(e => e.ID_Entregable == idEntregable);
    if (!entregable) {
        mostrarNotificacion('Entregable no encontrado', 'error');
        return;
    }

    const modal = document.getElementById('modal-ver-entregable');
    const container = document.getElementById('ver-entregable-content');

    // Datos relacionados
    const cliente = appState.clientes.find(c => c.ID_Cliente == entregable.ID_Cliente);
    const marca = appState.marcas.find(m => m.ID_Marca == entregable.ID_Marca);

    // Parsear herramientas URLs si existen
    let herramientasHtml = '<p class="text-muted">No hay herramientas registradas</p>';
    if (entregable.URLs_Fuentes) {
        try {
            const herramientas = JSON.parse(entregable.URLs_Fuentes);
            if (herramientas.length > 0) {
                herramientasHtml = `
                    <table class="herramientas-table" style="margin-top: 10px;">
                        <thead>
                            <tr>
                                <th>Herramienta</th>
                                <th>URL / Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${herramientas.map(h => `
                                <tr>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            ${h.herramienta ? getHerramientaIcon(h.herramienta) : '🔧'}
                                            ${h.herramienta || 'N/A'}
                                        </div>
                                    </td>
                                    <td>
                                        ${h.url && h.url.startsWith('http')
                        ? `<a href="${h.url}" target="_blank" class="text-link"><i class="fas fa-link"></i> ${truncarURL(h.url, 40)}</a>`
                        : (h.url || '-')}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
        } catch (e) {
            herramientasHtml = `<p class="text-error">Error al cargar herramientas: ${e.message}</p>`;
        }
    }

    const html = `
        <div class="detalle-header">
            <div class="detalle-titulo">
                <h3>${entregable.Nombre_Entregable}</h3>
                <span class="badge badge-${(entregable.Estado || 'Activo').toLowerCase()}">${entregable.Estado || 'Activo'}</span>
            </div>
            <div class="detalle-meta">
                <span><i class="fas fa-user-tie"></i> <strong>Cliente:</strong> ${cliente ? cliente.Nombre_Cliente : 'N/A'}</span>
                <span><i class="fas fa-tag"></i> <strong>Marca:</strong> ${marca ? marca.Nombre_Marca : 'N/A'}</span>
                <span><i class="fas fa-layer-group"></i> <strong>Tipo:</strong> ${entregable.Tipo_Entregable || 'N/A'}</span>
            </div>
        </div>

        ${entregable.url_entregable ? `
            <div class="detalle-section highlight-section">
                <h4><i class="fas fa-external-link-alt"></i> Link Final</h4>
                <a href="${entregable.url_entregable}" target="_blank" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
                    Abrir Entregable <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        ` : ''}

        <div class="detalle-grid">
            <div class="detalle-card">
                <h4><i class="fas fa-calendar-check"></i> Validación</h4>
                <p><strong>Frecuencia:</strong> ${entregable.Frecuencia_Validacion || '-'}</p>
                <p><strong>Día(s):</strong> ${entregable.Dia_Validacion || '-'}</p>
            </div>
            
            ${entregable.Automatizado === 'Sí' ? `
                <div class="detalle-card">
                    <h4><i class="fas fa-robot"></i> Automatización</h4>
                    <span class="badge badge-success">Automatizado</span>
                    ${entregable.Proceso_Automatizacion ? `<p style="margin-top: 10px; white-space: pre-wrap;">${entregable.Proceso_Automatizacion}</p>` : ''}
                </div>
            ` : ''}
        </div>

        <div class="detalle-section">
            <h4><i class="fas fa-tools"></i> Herramientas y Fuentes</h4>
            ${herramientasHtml}
        </div>

        ${entregable.Instrucciones_Tecnicas ? `
            <div class="detalle-section">
                <h4><i class="fas fa-cogs"></i> Instrucciones Técnicas</h4>
                <div class="info-box">
                    ${entregable.Instrucciones_Tecnicas.replace(/\n/g, '<br>')}
                </div>
            </div>
        ` : ''}

        ${entregable.Notas_Troubleshooting ? `
            <div class="detalle-section">
                <h4><i class="fas fa-life-ring"></i> Troubleshooting (Solución de Problemas)</h4>
                <div class="info-box warning-box">
                    ${entregable.Notas_Troubleshooting.replace(/\n/g, '<br>')}
                </div>
            </div>
        ` : ''}
    `;

    container.innerHTML = html;
    modal.classList.add('active');
}

function cerrarVerEntregable() {
    const modal = document.getElementById('modal-ver-entregable');
    modal.classList.remove('active');
}

// ========================================
// GUARDAR ENTREGABLE (CREAR/EDITAR)
// ========================================

async function guardarEntregable(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const entregableId = formData.get('id_entregable');
    const idCliente = formData.get('cliente') || formData.get('id_cliente');
    const idMarca = formData.get('marca') || formData.get('id_marca');

    if (!idCliente || !idMarca) {
        mostrarNotificacion('Debes seleccionar un cliente y una marca', 'error');
        return;
    }

    const marca = appState.marcas.find(m => m.ID_Marca == idMarca);
    if (!marca) {
        mostrarNotificacion('Marca no encontrada', 'error');
        return;
    }

    try {
        // Validar nombre INMEDIATAMENTE
        let nombreEntregable = (formData.get('nombre_entregable') || '').trim();
        if (!nombreEntregable) {
            throw new Error('El nombre del entregable es requerido');
        }

        // Validar duplicados (case-insensitive) dentro de la misma marca
        const nombreNormalizado = nombreEntregable.toLowerCase();
        const duplicado = appState.entregables.find(e => {
            if (e.ID_Marca != idMarca) return false;
            if (entregableId && e.ID_Entregable == entregableId) return false;
            const nombreExistente = (e.Nombre_Entregable || '').trim().toLowerCase();
            return nombreExistente === nombreNormalizado;
        });

        if (duplicado) {
            throw new Error(`Ya existe un entregable con el nombre "${duplicado.Nombre_Entregable}" para esta marca.`);
        }

        // Actualizar campo hidden de herramientas antes de leer
        actualizarHerramientasHidden();
        const urlsFuentesJson = document.getElementById('hidden-herramientas').value;

        const entregableData = {
            ID_Cliente: idCliente,
            ID_Marca: idMarca,
            Nombre_Entregable: nombreEntregable,
            Tipo_Entregable: formData.get('tipo_entregable') || '',
            url_entregable: formData.get('url_entregable') || '', // Columna exacta en Sheets
            Frecuencia_Validacion: formData.get('frecuencia_validacion') || '',
            Dia_Validacion: formData.get('dia_validacion') || '',
            URLs_Fuentes: urlsFuentesJson || '',
            Automatizado: formData.get('automatizado') ? 'Sí' : 'No',
            Proceso_Automatizacion: formData.get('proceso_automatizacion') || '',
            Instrucciones_Tecnicas: formData.get('instrucciones_tecnicas') || '',
            Notas_Troubleshooting: formData.get('notas_troubleshooting') || '',
            Estado: formData.get('estado') || 'Activo'
        };

        const isEdit = !!entregableId;

        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion(isEdit ? 'Actualizando entregable...' : 'Creando entregable...');

        // ACTUALIZACIÓN OPTIMISTA: Actualizar UI INMEDIATAMENTE
        if (isEdit) {
            const index = appState.entregables.findIndex(e => e.ID_Entregable == entregableId);
            if (index !== -1) {
                appState.entregables[index] = { ...appState.entregables[index], ...entregableData };
            }
        } else {
            const tempEntregable = {
                ID_Entregable: `temp_${Date.now()}`,
                ...entregableData,
                Fecha_Creacion: new Date().toISOString()
            };
            appState.entregables.push(tempEntregable);
        }

        localStorage.setItem('entregables', JSON.stringify(appState.entregables));

        // Actualizar UI INMEDIATAMENTE
        cerrarFormularioEntregable(true);
        refrescarVistaActual(true);
        if (appState.currentCliente && appState.currentCliente.ID_Cliente == idCliente) {
            verDetalleCliente(idCliente);
        }

        // Preparar payload
        const payload = {
            action: isEdit ? 'update' : 'add',
            sheetName: 'Entregables',
            data: entregableData
        };

        if (isEdit) {
            payload.rowId = entregableId;
        }

        // Guardar en background (sin await)
        enviarAlScript(payload).then(result => {
            if (result.status === 'success') {
                console.log('✅ Entregable guardado en Sheets');

                // Si es creación, actualizar ID temporal con ID real
                if (!isEdit && result.data && result.data.id) {
                    const index = appState.entregables.findIndex(e => String(e.ID_Entregable).startsWith('temp_'));
                    if (index !== -1) {
                        appState.entregables[index].ID_Entregable = result.data.id;
                        localStorage.setItem('entregables', JSON.stringify(appState.entregables));
                        // Renderizar directamente en lugar de usar refrescarVistaActual()
                        if (appState.currentView === 'clientes') {
                            renderizarTablaClientes();
                        }
                        if (appState.currentCliente && appState.currentCliente.ID_Cliente == idCliente) {
                            verDetalleCliente(idCliente);
                        }
                    }
                }

                ocultarBloqueoOperacion();
                mostrarNotificacion(isEdit ? '✅ Entregable editado correctamente' : '✅ Entregable creado correctamente', 'success');
            } else {
                ocultarBloqueoOperacion();
                throw new Error(result.message || 'Error al guardar entregable');
            }
        }).catch(error => {
            console.error('Error al guardar entregable en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        console.error('Error al guardar entregable:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ Error al guardar: ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

async function eliminarEntregable(idEntregable) {
    const entregable = appState.entregables.find(e => e.ID_Entregable == idEntregable);
    if (!entregable) {
        mostrarNotificacion('Entregable no encontrado', 'error');
        return;
    }

    if (!confirm(`¿Estás seguro de eliminar el entregable "${entregable.Nombre_Entregable}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        // MARCAR QUE USUARIO ESTÁ OPERANDO
        appState.isUserOperating = true;
        appState.pendingOperations++;

        // MOSTRAR BLOQUEO CON SPINNER
        mostrarBloqueoOperacion('Eliminando entregable...');

        // ACTUALIZACIÓN OPTIMISTA: Eliminar de UI INMEDIATAMENTE
        const index = appState.entregables.findIndex(e => e.ID_Entregable == idEntregable);
        if (index !== -1) {
            appState.entregables.splice(index, 1);
        }
        localStorage.setItem('entregables', JSON.stringify(appState.entregables));

        // Actualizar UI INMEDIATAMENTE
        refrescarVistaActual(true);
        if (appState.currentCliente && appState.currentCliente.ID_Cliente == entregable.ID_Cliente) {
            verDetalleCliente(entregable.ID_Cliente);
        }

        // Eliminar en background (sin await)
        enviarAlScript({
            action: 'delete',
            sheetName: 'Entregables',
            rowId: idEntregable
        }).then(async result => {
            if (result.status === 'success') {
                console.log('✅ Entregable eliminado en Sheets');

                // Sincronizar inmediatamente para confirmar eliminación
                await sincronizarDatosInteligente();

                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Entregable eliminado correctamente', 'success');
            } else {
                throw new Error(result.message || 'Error al eliminar entregable');
            }
        }).catch(error => {
            console.error('Error al eliminar entregable en Sheets:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar - Se reintentará automáticamente', 'warning');
            // Revertir el cambio optimista
            appState.entregables.splice(index, 0, entregable);
            localStorage.setItem('entregables', JSON.stringify(appState.entregables));
            refrescarVistaActual(true);
            if (appState.currentCliente && appState.currentCliente.ID_Cliente == entregable.ID_Cliente) {
                verDetalleCliente(entregable.ID_Cliente);
            }
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) {
                appState.isUserOperating = false;
            }
        });

    } catch (error) {
        console.error('Error al eliminar entregable:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ Error al eliminar: ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

// ========================================
// ESTILOS ADICIONALES
// ========================================

const additionalStyles = `
<style>
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border-color); }
.data-table th { background: var(--light-color); font-weight: 600; }
.data-table tr:hover { background: var(--light-color); }
.badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.badge-activo, .badge-ok { background: #34A853; color: white; }
.badge-inactivo, .badge-error { background: #EA4335; color: white; }
.badge-pausado { background: #FF9800; color: white; }
.badge-warning { background: #FFF2CC; color: #B85C00; }
.badge-critica { background: #CC0000; color: white; }
.badge-alta { background: #EA4335; color: white; }
.badge-media { background: #FBBC04; color: #000; }
.badge-baja { background: #D9EAD3; color: #137333; }
.btn-icon { background: none; border: none; cursor: pointer; padding: 4px 8px; color: var(--primary-color); }
.btn-icon:hover { background: var(--light-color); border-radius: 4px; }
.btn-expand { background: none; border: none; cursor: pointer; padding: 4px; color: #5F6368; font-size: 14px; }
.btn-expand:hover { color: var(--primary-color); }
.btn-icon-small { background: none; border: none; cursor: pointer; padding: 2px 6px; color: var(--primary-color); font-size: 12px; }
.btn-icon-small:hover { background: var(--light-color); border-radius: 4px; }
.marcas-count { color: #5F6368; font-size: 13px; }
.marcas-expandible { background: #F8F9FA; }
.marcas-lista-container { padding: 16px; background: white; border-radius: 8px; margin: 8px 0; }
.marcas-lista { display: grid; gap: 8px; }
.marca-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #F8F9FA; border-radius: 6px; border-left: 3px solid var(--primary-color); }
.marca-info { display: flex; align-items: center; gap: 12px; flex: 1; }
.marca-info i { color: var(--primary-color); }
.marca-acciones { display: flex; gap: 4px; }
.cliente-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 16px; }
.info-item { padding: 12px; background: var(--light-color); border-radius: 6px; }
.arbol-entregable { margin-bottom: 24px; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; }
.arbol-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 16px; }
.arbol-meta { display: flex; gap: 16px; margin-bottom: 12px; font-size: 13px; color: var(--text-secondary); }
.arbol-recursos { margin-left: 20px; }
.arbol-recurso { margin-bottom: 12px; padding: 12px; background: var(--light-color); border-radius: 6px; }
.recurso-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.recurso-icon { font-size: 20px; }
.recurso-url { display: flex; align-items: center; gap: 8px; margin: 8px 0; padding: 8px; background: white; border-radius: 4px; }
.recurso-url code { flex: 1; font-size: 12px; color: var(--text-secondary); }
.recurso-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-top: 8px; }

/* OVERLAY DE BLOQUEO DURANTE OPERACIONES */
#operation-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    justify-content: center;
    align-items: center;
}

.operation-spinner {
    background: white;
    padding: 32px 48px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    text-align: center;
}

.spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #4285F4;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px auto;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

#operation-message {
    margin: 0;
    color: #202124;
    font-size: 16px;
    font-weight: 500;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', additionalStyles);

// ========================================
// ADMINISTRACIÓN - TAB SWITCHING
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Event listeners para tabs de administración
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.adminTab;
            cambiarTabAdmin(tabName);
        });
    });
});

function cambiarTabAdmin(tabName) {
    // Actualizar botones
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.adminTab === tabName);
    });

    // Actualizar contenido
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const targetTab = document.getElementById(`admin-tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active');

        // Renderizar contenido del tab
        renderizarTabAdmin(tabName);
    }
}

function renderizarTabAdmin(tabName) {
    switch (tabName) {
        case 'users':
            renderizarTablaUsers();
            break;
        case 'tipos':
            renderizarTablaTiposEntregable();
            break;
        case 'herramientas':
            renderizarTablaHerramientas();
            break;
        case 'categorias':
            renderizarTablaCategoriasHerramientas();
            break;
    }
}

// ========================================
// ADMINISTRACIÓN - MAIN RENDER
// ========================================

function renderizarAdministracion() {
    // Solo renderizar si ya hay datos, no cargar
    if (appState.users && appState.users.length > 0) {
        const activeTabBtn = document.querySelector('.admin-tab-btn.active');
        const tabName = activeTabBtn ? activeTabBtn.dataset.adminTab : 'users';
        renderizarTabAdmin(tabName);
    } else {
        // Primera vez, cargar datos
        cargarTodosDatosAdmin();
    }
}

async function cargarTodosDatosAdmin() {
    try {
        console.log('🔄 Cargando todos los catálogos para administración...');
        mostrarBloqueoOperacion('Cargando catálogos...');

        // Cargar datos si no están en appState
        if (!appState.users || appState.users.length === 0 || !appState.tiposEntregable || appState.tiposEntregable.length === 0) {
            await Promise.all([
                leerHoja(CONFIG.SHEETS.USERS).then(data => appState.users = convertirAObjetos(data)),
                leerHoja(CONFIG.SHEETS.TIPOS_ENTREGABLE).then(data => appState.tiposEntregable = convertirAObjetos(data)),
                leerHoja(CONFIG.SHEETS.HERRAMIENTAS).then(data => appState.herramientas = convertirAObjetos(data)),
                leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS).then(data => appState.categoriasHerramientas = convertirAObjetos(data))
            ]);
        }

        ocultarBloqueoOperacion();
        // Renderizar el tab activo (por defecto 'users' según el HTML)
        const activeTabBtn = document.querySelector('.admin-tab-btn.active');
        const tabName = activeTabBtn ? activeTabBtn.dataset.adminTab : 'users';
        renderizarTabAdmin(tabName);

    } catch (error) {
        console.error('Error al cargar datos de administración:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('Error al cargar datos de administración', 'error');
    }
}

// ========================================
// ADMINISTRACIÓN - USERS TABLE
// ========================================

function renderizarTablaUsers() {
    const container = document.getElementById('users-tabla-container');

    if (!appState.users || appState.users.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No hay usuarios registrados</p></div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${appState.users.map(user => `
                    <tr>
                        <td><strong>${user.Nombre_Usuario || ''}</strong></td>
                        <td>${user.Email || ''}</td>
                        <td><span class="badge">${user.Rol || 'Viewer'}</span></td>
                        <td><span class="badge badge-${user.Estado === 'Activo' ? 'activo' :
            user.Estado === 'Inactivo' ? 'inactivo' :
                user.Estado === 'Pausado' ? 'pausado' : 'activo'
        }">${user.Estado || 'Activo'}</span></td>
                        <td>
                            <button class="btn-icon" onclick="editarUser('${user.ID_User}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarUser('${user.ID_User}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function mostrarFormularioUser() {
    const modal = document.getElementById('modal-form-user');
    const form = document.getElementById('form-user');
    modal.classList.add('active');
    form.reset();
    delete form.dataset.dirty;
    document.querySelector('#modal-form-user .modal-header h2').innerHTML = '<i class="fas fa-user-plus"></i> Nuevo Usuario';
}

function cerrarFormularioUser(force = false) {
    intentarCerrarModal('modal-form-user', force);
}

async function guardarUser(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const userId = formData.get('id_user');

    const userData = {
        Nombre_Usuario: formData.get('nombre'),
        Email: formData.get('email'),
        Rol: formData.get('tipo_usuario'),
        Estado: formData.get('estado')
    };

    try {
        const isEdit = !!userId;

        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion(isEdit ? 'Actualizando usuario...' : 'Creando usuario...');

        if (isEdit) {
            const index = appState.users.findIndex(u => u.ID_User == userId);
            if (index !== -1) {
                appState.users[index] = { ...appState.users[index], ...userData };
            }
        } else {
            const tempUser = {
                ID_User: `temp_${Date.now()}`,
                ...userData,
                Fecha_Creacion: new Date().toISOString()
            };
            appState.users.push(tempUser);
        }

        cerrarFormularioUser(true);
        renderizarTablaUsers();

        enviarAlScript({
            action: isEdit ? 'update' : 'add',
            sheetName: 'Users',
            data: userData,
            rowId: userId
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Usuario guardado');
                if (!isEdit && result.data && result.data.id) {
                    const index = appState.users.findIndex(u => String(u.ID_User).startsWith('temp_'));
                    if (index !== -1) {
                        appState.users[index].ID_User = result.data.id;
                        renderizarTablaUsers();
                    }
                }
                ocultarBloqueoOperacion();
                mostrarNotificacion(isEdit ? '✅ Usuario editado' : '✅ Usuario creado', 'success');
            } else {
                throw new Error(result.message);
            }
        }).catch(error => {
            console.error('Error:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar', 'warning');
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) appState.isUserOperating = false;
        });

    } catch (error) {
        console.error('Error:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

function editarUser(idUser) {
    const user = appState.users.find(u => u.ID_User == idUser);
    if (!user) {
        mostrarNotificacion('Usuario no encontrado', 'error');
        return;
    }

    const form = document.getElementById('form-user');
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_user"]').value = user.ID_User;
    form.querySelector('[name="nombre"]').value = user.Nombre_Usuario || '';
    form.querySelector('[name="email"]').value = user.Email || '';
    form.querySelector('[name="tipo_usuario"]').value = user.Rol || 'Viewer';
    form.querySelector('[name="estado"]').value = user.Estado || 'Activo';

    document.querySelector('#modal-form-user .modal-header h2').innerHTML = '<i class="fas fa-edit"></i> Editar Usuario';
    document.getElementById('modal-form-user').classList.add('active');
}

async function eliminarUser(idUser) {
    const user = appState.users.find(u => u.ID_User == idUser);
    if (!user) return;

    if (!confirm(`¿Eliminar usuario "${user.Nombre_Usuario}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Eliminando usuario...');

        const index = appState.users.findIndex(u => u.ID_User == idUser);
        if (index !== -1) {
            appState.users.splice(index, 1);
        }

        renderizarTablaUsers();

        enviarAlScript({
            action: 'delete',
            sheetName: 'Users',
            rowId: idUser
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Usuario eliminado');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Usuario eliminado', 'success');
            } else {
                throw new Error(result.message);
            }
        }).catch(error => {
            console.error('Error:', error);
            ocultarBloqueoOperacion();
            mostrarNotificacion('⚠️ Error al sincronizar', 'warning');
            appState.users.splice(index, 0, user);
            renderizarTablaUsers();
        }).finally(() => {
            appState.pendingOperations--;
            if (appState.pendingOperations === 0) appState.isUserOperating = false;
        });

    } catch (error) {
        console.error('Error:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('❌ ' + error.message, 'error');
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}



// ========================================
// MODAL GENÉRICO
// ========================================

function mostrarModal(titulo, content) {
    // Crear modal si no existe
    let modal = document.getElementById('modal-generico');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-generico';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${titulo}</h2>
                    <button class="close-modal" onclick="cerrarModal()">&times;</button>
                </div>
                <div class="modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Cerrar al hacer click fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) intentarCerrarModal('modal-generico');
        });
    } else {
        modal.querySelector('.modal-header h2').textContent = titulo;
    }

    modal.querySelector('.modal-body').innerHTML = content;
    modal.classList.add('active');

    // Resetear el estado de "sucio" del formulario si se carga uno nuevo
    const form = modal.querySelector('form');
    if (form) delete form.dataset.dirty;
}

/**
 * Cierra el modal genérico con confirmación
 * @param {boolean} force - Si es true, cierra sin pedir confirmación
 */
function cerrarModal(force = false) {
    intentarCerrarModal('modal-generico', force);
}
