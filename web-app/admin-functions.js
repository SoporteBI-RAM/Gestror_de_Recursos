// ========================================
// GESTIÓN DE TIPOS DE ENTREGABLE
// ========================================


// ========================================
// GESTIÓN DE HERRAMIENTAS
// ========================================

async function cargarHerramientas(bustCache = false) {
    const container = document.getElementById('herramientas-tabla-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Cargando herramientas...</div>';

        const data = await leerHoja(CONFIG.SHEETS.HERRAMIENTAS, null, 3, bustCache);
        const herramientas = convertirAObjetos(data);

        appState.herramientas = herramientas;
        renderizarTablaHerramientas();

    } catch (error) {
        console.error('Error al cargar herramientas:', error);
        container.innerHTML = '<div class="error">Error al cargar herramientas</div>';
    }
}

function renderizarTablaHerramientas() {
    const container = document.getElementById('herramientas-tabla-container');
    if (!container) return;

    const herramientas = appState.herramientas || [];

    if (herramientas.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay herramientas registradas</div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>URL</th>
                    <th style="width: 100px;">Estado</th>
                    <th style="width: 120px;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${herramientas.map(herr => `
                    <tr>
                        <td><strong>${herr.Nombre_Herramienta}</strong></td>
                        <td>${herr.Categoria || '-'}</td>
                        <td>${herr.Descripcion || '-'}</td>
                        <td>
                            ${herr.URL_Oficial ?
            `<a href="${herr.URL_Oficial}" target="_blank" class="link-external">
                                    <i class="fas fa-external-link-alt"></i> Ver sitio
                                </a>` :
            '-'
        }
                        </td>
                        <td>
                            <span class="badge badge-${herr.Estado === 'Activo' ? 'activo' :
            herr.Estado === 'Inactivo' ? 'inactivo' :
                herr.Estado === 'Pausado' ? 'pausado' : 'secondary'
        }">
                                ${herr.Estado}
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="editarHerramienta(${herr.ID_Herramienta})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarHerramienta(${herr.ID_Herramienta})" title="Eliminar">
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

async function mostrarFormularioHerramienta() {
    const modal = document.getElementById('modal-form-herramienta');
    const form = document.getElementById('form-herramienta');
    modal.classList.add('active');
    form.reset();
    delete form.dataset.dirty;
    document.querySelector('#modal-form-herramienta .modal-header h2').innerHTML = '<i class="fas fa-tools"></i> Nueva Herramienta';

    // Cargar categorías dinámicamente
    await cargarCategoriasEnSelect();
}

// Cerrar formulario de herramienta con confirmación
function cerrarFormularioHerramienta(force = false) {
    intentarCerrarModal('modal-form-herramienta', force);
}

async function guardarHerramienta(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const herrId = formData.get('id_herramienta');

    const herrData = {
        Nombre_Herramienta: formData.get('nombre_herramienta'),
        Categoria: formData.get('categoria'),
        URL_Oficial: formData.get('url_oficial'),
        Descripcion: formData.get('descripcion'),
        Estado: formData.get('estado')
    };

    try {
        const isEdit = !!herrId;

        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion(isEdit ? 'Actualizando herramienta...' : 'Creando herramienta...');

        // Actualizar localmente de inmediato (optimistic update)
        if (isEdit) {
            const index = appState.herramientas.findIndex(h => h.ID_Herramienta == herrId);
            if (index !== -1) {
                appState.herramientas[index] = { ...appState.herramientas[index], ...herrData };
                appState.herramientas[index].Ultima_Actualizacion = new Date().toISOString();
            }
        } else {
            // Crear herramienta temporal y agregarla inmediatamente
            const tempHerramienta = {
                ID_Herramienta: `temp_${Date.now()}`,
                ...herrData,
                Fecha_Creacion: new Date().toISOString(),
                Ultima_Actualizacion: new Date().toISOString()
            };
            appState.herramientas.push(tempHerramienta);
        }

        cerrarFormularioHerramienta(true);
        renderizarTablaHerramientas();

        // Enviar al servidor en segundo plano (sin await)
        enviarAlScript({
            action: isEdit ? 'update' : 'add',
            sheetName: CONFIG.SHEETS.HERRAMIENTAS,
            data: herrData,
            rowId: herrId || ''
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Herramienta guardada');
                if (!isEdit && result.data && result.data.id) {
                    // Reemplazar ID temporal con ID real
                    const index = appState.herramientas.findIndex(h => String(h.ID_Herramienta).startsWith('temp_'));
                    if (index !== -1) {
                        appState.herramientas[index].ID_Herramienta = result.data.id;
                        renderizarTablaHerramientas();
                    }
                }
                ocultarBloqueoOperacion();
                mostrarNotificacion(isEdit ? '✅ Herramienta actualizada' : '✅ Herramienta creada', 'success');
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
        console.error('Error al guardar herramienta:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

async function editarHerramienta(idHerr) {
    const herr = appState.herramientas.find(h => h.ID_Herramienta == idHerr);
    if (!herr) {
        mostrarNotificacion('Herramienta no encontrada', 'error');
        return;
    }

    // Cargar categorías primero
    await cargarCategoriasEnSelect();

    const form = document.getElementById('form-herramienta');
    form.reset();
    delete form.dataset.dirty;
    form.querySelector('[name="id_herramienta"]').value = herr.ID_Herramienta;
    form.querySelector('[name="nombre_herramienta"]').value = herr.Nombre_Herramienta || '';
    form.querySelector('[name="categoria"]').value = herr.Categoria || '';
    form.querySelector('[name="url_oficial"]').value = herr.URL_Oficial || '';
    form.querySelector('[name="descripcion"]').value = herr.Descripcion || '';
    form.querySelector('[name="estado"]').value = herr.Estado || 'Activo';

    document.querySelector('#modal-form-herramienta .modal-header h2').innerHTML = '<i class="fas fa-edit"></i> Editar Herramienta';
    document.getElementById('modal-form-herramienta').classList.add('active');
}

async function eliminarHerramienta(idHerr) {
    const herr = appState.herramientas.find(h => h.ID_Herramienta == idHerr);
    if (!herr) return;

    if (!confirm(`¿Eliminar herramienta "${herr.Nombre_Herramienta}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Eliminando herramienta...');

        // Eliminar del array local inmediatamente
        const index = appState.herramientas.findIndex(h => h.ID_Herramienta == idHerr);
        if (index !== -1) {
            appState.herramientas.splice(index, 1);
        }

        renderizarTablaHerramientas();

        // Enviar al servidor en segundo plano (sin await)
        enviarAlScript({
            action: 'delete',
            sheetName: CONFIG.SHEETS.HERRAMIENTAS,
            rowId: idHerr
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Herramienta eliminada');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Herramienta eliminada', 'success');
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
        console.error('Error al eliminar herramienta:', error);
        ocultarBloqueoOperacion();
        mostrarNotificacion('Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

// ========================================
// GESTIÓN DE ALERTAS
// ========================================

async function cargarAlertasAdmin() {
    const container = document.getElementById('alertas-admin-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Cargando alertas...</div>';

        const data = await leerHoja(CONFIG.SHEETS.ALERTAS);
        const alertas = convertirAObjetos(data);

        appState.alertas = alertas;
        renderizarTablaAlertasAdmin();

    } catch (error) {
        console.error('Error al cargar alertas:', error);
        container.innerHTML = '<div class="error">Error al cargar alertas</div>';
    }
}

function renderizarTablaAlertasAdmin() {
    const container = document.getElementById('alertas-admin-container');
    if (!container) return;

    const alertas = appState.alertas || [];

    if (alertas.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay alertas registradas</div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Proyecto</th>
                    <th>Tipo</th>
                    <th>Mensaje</th>
                    <th>Fecha Creación</th>
                    <th>Estado</th>
                    <th style="width: 120px;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${alertas.map(alerta => `
                    <tr>
                        <td><strong>${alerta.Cliente || '-'}</strong></td>
                        <td>${alerta.Proyecto || '-'}</td>
                        <td>
                            <span class="badge badge-${alerta.Tipo_Alerta === 'Crítica' ? 'danger' :
            alerta.Tipo_Alerta === 'Alta' ? 'warning' :
                'info'
        }">
                                ${alerta.Tipo_Alerta || 'Info'}
                            </span>
                        </td>
                        <td>${alerta.Mensaje || '-'}</td>
                        <td>${alerta.Fecha_Creacion ? new Date(alerta.Fecha_Creacion).toLocaleDateString('es-ES') : '-'}</td>
                        <td>
                            <span class="badge badge-${alerta.Estado === 'Activa' ? 'danger' : 'success'}">
                                ${alerta.Estado}
                            </span>
                        </td>
                        <td>
                            ${alerta.Estado === 'Activa' ? `
                                <button class="btn-icon btn-success" onclick="resolverAlerta(${alerta.ID_Alerta})" title="Resolver">
                                    <i class="fas fa-check"></i>
                                </button>
                            ` : ''}
                            <button class="btn-icon btn-danger" onclick="eliminarAlerta(${alerta.ID_Alerta})" title="Eliminar">
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

async function resolverAlerta(id) {
    const alerta = appState.alertas.find(a => a.ID_Alerta == id);
    if (!alerta) return;

    if (!confirm(`¿Marcar como resuelta la alerta de "${alerta.Cliente}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Resolviendo alerta...');

        const payload = {
            action: 'update',
            sheetName: CONFIG.SHEETS.ALERTAS,
            data: {
                Estado: 'Resuelta',
                Fecha_Resolucion: new Date().toISOString()
            },
            rowId: id
        };

        await enviarAlScript(payload).then(result => {
            if (result.status === 'success') {
                mostrarNotificacion('Alerta resuelta correctamente', 'success');

                const index = appState.alertas.findIndex(a => a.ID_Alerta == id);
                if (index !== -1) {
                    appState.alertas[index].Estado = 'Resuelta';
                    appState.alertas[index].Fecha_Resolucion = new Date().toISOString();
                }

                renderizarTablaAlertasAdmin();
            } else {
                throw new Error(result.message || 'Error desconocido');
            }
        });

    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ ' + error.message, 'error');
    } finally {
        ocultarBloqueoOperacion();
        appState.isUserOperating = false;
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
    }
}

async function eliminarAlerta(id) {
    const alerta = appState.alertas.find(a => a.ID_Alerta == id);
    if (!alerta) return;

    if (!confirm(`¿Eliminar alerta de "${alerta.Cliente}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Eliminando alerta...');

        const payload = {
            action: 'delete',
            sheetName: CONFIG.SHEETS.ALERTAS,
            rowId: id
        };

        await enviarAlScript(payload).then(result => {
            if (result.status === 'success') {
                mostrarNotificacion('Alerta eliminada correctamente', 'success');

                const index = appState.alertas.findIndex(a => a.ID_Alerta == id);
                if (index !== -1) {
                    appState.alertas.splice(index, 1);
                }

                renderizarTablaAlertasAdmin();
            } else {
                throw new Error(result.message || 'Error desconocido');
            }
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
// CARGAR CATEGORÍAS DINÁMICAMENTE
// ========================================

async function cargarCategoriasEnSelect() {
    const select = document.getElementById('select-categoria-herramienta');
    if (!select) return;

    try {
        // Mostrar estado de carga
        select.innerHTML = '<option value="">Cargando categorías...</option>';

        // Leer categorías desde Google Sheets
        const data = await leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS);
        const categorias = convertirAObjetos(data);

        // Filtrar solo categorías activas
        const categoriasActivas = categorias.filter(cat => cat.Estado === 'Activo');

        // Construir las opciones
        let options = '<option value="">Selecciona una categoría...</option>';
        categoriasActivas.forEach(cat => {
            options += `<option value="${cat.Nombre_Categoria}">${cat.Icono || '📁'} ${cat.Nombre_Categoria}</option>`;
        });

        select.innerHTML = options;

    } catch (error) {
        console.error('Error al cargar categorías:', error);
        select.innerHTML = '<option value="">Error al cargar categorías</option>';
        mostrarNotificacion('Error al cargar categorías: ' + error.message, 'error');
    }
}

// ========================================
// TIPOS DE ENTREGABLE - TABLA
// ========================================

async function cargarTiposEntregable(bustCache = false) {
    const container = document.getElementById('tipos-tabla-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Cargando tipos de entregable...</div>';

        const data = await leerHoja(CONFIG.SHEETS.TIPOS_ENTREGABLE, null, 3, bustCache);
        const tipos = convertirAObjetos(data);

        appState.tiposEntregable = tipos;
        renderizarTablaTiposEntregable();

    } catch (error) {
        console.error('Error al cargar tipos:', error);
        container.innerHTML = '<div class="error">Error al cargar tipos de entregable</div>';
    }
}

function renderizarTablaTiposEntregable() {
    const container = document.getElementById('tipos-tabla-container');
    if (!container) return;

    const tipos = appState.tiposEntregable || [];

    if (tipos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay tipos de entregable registrados</div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th style="width: 100px;">Estado</th>
                    <th style="width: 120px;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${tipos.map(tipo => `
                    <tr>
                        <td>${tipo.ID_Tipo}</td>
                        <td><strong>${tipo.Nombre_Tipo}</strong></td>
                        <td>${tipo.Descripcion || '-'}</td>
                        <td>
                            <span class="badge badge-${tipo.Estado === 'Activo' ? 'activo' :
            tipo.Estado === 'Inactivo' ? 'inactivo' :
                tipo.Estado === 'Pausado' ? 'pausado' : 'secondary'
        }">
                                ${tipo.Estado}
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="editarTipoEntregable(${tipo.ID_Tipo})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarTipoEntregable(${tipo.ID_Tipo})" title="Eliminar">
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

// ========================================
// CATEGORÍAS DE HERRAMIENTAS - TABLA
// ========================================

async function cargarCategoriasHerramientas(bustCache = false) {
    const container = document.getElementById('categorias-tabla-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Cargando categorías...</div>';

        const data = await leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS, null, 3, bustCache);
        const categorias = convertirAObjetos(data);

        appState.categoriasHerramientas = categorias;
        renderizarTablaCategoriasHerramientas();

    } catch (error) {
        console.error('Error al cargar categorías:', error);
        container.innerHTML = '<div class="error">Error al cargar categorías</div>';
    }
}

function renderizarTablaCategoriasHerramientas() {
    const container = document.getElementById('categorias-tabla-container');
    if (!container) return;

    const categorias = appState.categoriasHerramientas || [];

    if (categorias.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay categorías registradas</div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th style="width: 100px;">Estado</th>
                    <th style="width: 120px;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${categorias.map(cat => `
                    <tr>
                        <td>${cat.ID_Categoria}</td>
                        <td><strong>${cat.Nombre_Categoria}</strong></td>
                        <td>${cat.Descripcion || '-'}</td>
                        <td>
                            <span class="badge badge-${cat.Estado === 'Activo' ? 'activo' :
            cat.Estado === 'Inactivo' ? 'inactivo' :
                cat.Estado === 'Pausado' ? 'pausado' : 'secondary'
        }">
                                ${cat.Estado}
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="editarCategoriaHerramienta(${cat.ID_Categoria})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarCategoriaHerramienta(${cat.ID_Categoria})" title="Eliminar">
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

// ========================================
// TIPOS DE ENTREGABLE - CRUD
// ========================================

function mostrarFormularioTipoEntregable() {
    mostrarModal('Nuevo Tipo de Entregable', `
        <form id="form-tipo-entregable" onsubmit="guardarTipoEntregable(event)">
            <input type="hidden" name="id_tipo" value="">

            <div class="form-group">
                <label>Nombre del Tipo *</label>
                <input type="text" name="nombre_tipo" required placeholder="Ej: Power BI">
            </div>

            <div class="form-group">
                <label>Descripción</label>
                <textarea name="descripcion" rows="3" placeholder="Breve descripción del tipo de entregable"></textarea>
            </div>

            <div class="form-group">
                <label>Estado *</label>
                <select name="estado" required>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Pausado">Pausado</option>
                </select>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="intentarCerrarModal('modal-generico')">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar</button>
            </div>
        </form>
    `);
}

async function guardarTipoEntregable(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const tipoData = {
        Nombre_Tipo: formData.get('nombre_tipo'),
        Descripcion: formData.get('descripcion'),
        Estado: formData.get('estado')
    };

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Guardando tipo de entregable...');

        // Crear tipo temporal y agregarlo inmediatamente
        const tempTipo = {
            ID_Tipo: `temp_${Date.now()}`,
            ...tipoData,
            Fecha_Creacion: new Date().toISOString(),
            Ultima_Actualizacion: new Date().toISOString()
        };

        if (!appState.tiposEntregable) {
            appState.tiposEntregable = [];
        }
        appState.tiposEntregable.push(tempTipo);

        cerrarModal(true);
        renderizarTablaTiposEntregable();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'add',
            sheetName: CONFIG.SHEETS.TIPOS_ENTREGABLE,
            data: tipoData
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Tipo de entregable guardado');
                if (result.data && result.data.id) {
                    const index = appState.tiposEntregable.findIndex(t => String(t.ID_Tipo).startsWith('temp_'));
                    if (index !== -1) {
                        appState.tiposEntregable[index].ID_Tipo = result.data.id;
                        renderizarTablaTiposEntregable();
                    }
                }
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Tipo de entregable guardado', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

async function editarTipoEntregable(id) {
    const tipo = appState.tiposEntregable.find(t => t.ID_Tipo == id);
    if (!tipo) return;

    mostrarModal('Editar Tipo de Entregable', `
        <form id="form-tipo-entregable" onsubmit="actualizarTipoEntregable(event, ${id})">
            <div class="form-group">
                <label>Nombre del Tipo *</label>
                <input type="text" name="nombre_tipo" required value="${tipo.Nombre_Tipo || ''}">
            </div>

            <div class="form-group">
                <label>Descripción</label>
                <textarea name="descripcion" rows="3">${tipo.Descripcion || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Estado *</label>
                <select name="estado" required>
                    <option value="Activo" ${tipo.Estado === 'Activo' ? 'selected' : ''}>Activo</option>
                    <option value="Inactivo" ${tipo.Estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
                    <option value="Pausado" ${tipo.Estado === 'Pausado' ? 'selected' : ''}>Pausado</option>
                </select>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="intentarCerrarModal('modal-generico')">Cancelar</button>
                <button type="submit" class="btn-primary">Actualizar</button>
            </div>
        </form>
    `);
}

async function actualizarTipoEntregable(event, id) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const tipoData = {
        Nombre_Tipo: formData.get('nombre_tipo'),
        Descripcion: formData.get('descripcion'),
        Estado: formData.get('estado')
    };

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Actualizando...');

        // Actualizar localmente de inmediato
        const index = appState.tiposEntregable.findIndex(t => t.ID_Tipo == id);
        if (index !== -1) {
            appState.tiposEntregable[index] = {
                ...appState.tiposEntregable[index],
                ...tipoData,
                Ultima_Actualizacion: new Date().toISOString()
            };
        }

        cerrarModal(true);
        renderizarTablaTiposEntregable();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'update',
            sheetName: CONFIG.SHEETS.TIPOS_ENTREGABLE,
            data: tipoData,
            rowId: id
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Tipo actualizado');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Tipo actualizado', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

async function eliminarTipoEntregable(id) {
    const tipo = appState.tiposEntregable.find(t => t.ID_Tipo == id);
    if (!tipo) return;

    if (!confirm(`¿Eliminar tipo "${tipo.Nombre_Tipo}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Eliminando...');

        // Eliminar del array local inmediatamente
        const index = appState.tiposEntregable.findIndex(t => t.ID_Tipo == id);
        if (index !== -1) {
            appState.tiposEntregable.splice(index, 1);
        }

        renderizarTablaTiposEntregable();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'delete',
            sheetName: CONFIG.SHEETS.TIPOS_ENTREGABLE,
            rowId: id
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Tipo eliminado');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Tipo eliminado', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

// ========================================
// CATEGORÍAS DE HERRAMIENTAS - CRUD
// ========================================

function mostrarFormularioCategoriaHerramienta() {
    mostrarModal('Nueva Categoría de Herramienta', `
        <form id="form-categoria-herramienta" onsubmit="guardarCategoriaHerramienta(event)">
            <div class="form-group">
                <label>Nombre de la Categoría *</label>
                <input type="text" name="nombre_categoria" required placeholder="Ej: Visualización">
            </div>

            <div class="form-group">
                <label>Descripción</label>
                <textarea name="descripcion" rows="3" placeholder="Breve descripción de la categoría"></textarea>
            </div>

            <div class="form-group">
                <label>Estado *</label>
                <select name="estado" required>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Pausado">Pausado</option>
                </select>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="intentarCerrarModal('modal-generico')">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar</button>
            </div>
        </form>
    `);
}

async function guardarCategoriaHerramienta(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const categoriaData = {
        Nombre_Categoria: formData.get('nombre_categoria'),
        Descripcion: formData.get('descripcion'),
        Estado: formData.get('estado')
    };

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Guardando categoría...');

        // Crear categoría temporal y agregarla inmediatamente
        const tempCategoria = {
            ID_Categoria: `temp_${Date.now()}`,
            ...categoriaData,
            Fecha_Creacion: new Date().toISOString(),
            Ultima_Actualizacion: new Date().toISOString()
        };

        // Agregar al appState si existe
        if (!appState.categoriasHerramientas) {
            appState.categoriasHerramientas = [];
        }
        appState.categoriasHerramientas.push(tempCategoria);

        cerrarModal(true);
        renderizarTablaCategoriasHerramientas();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'add',
            sheetName: CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS,
            data: categoriaData
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Categoría guardada');
                if (result.data && result.data.id) {
                    // Reemplazar ID temporal con ID real
                    const index = appState.categoriasHerramientas.findIndex(c => String(c.ID_Categoria).startsWith('temp_'));
                    if (index !== -1) {
                        appState.categoriasHerramientas[index].ID_Categoria = result.data.id;
                        renderizarTablaCategoriasHerramientas();
                    }
                }
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Categoría creada', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

async function editarCategoriaHerramienta(id) {
    const cat = appState.categoriasHerramientas.find(c => c.ID_Categoria == id);
    if (!cat) return;

    mostrarModal('Editar Categoría', `
        <form id="form-categoria-herramienta" onsubmit="actualizarCategoriaHerramienta(event, ${id})">
            <div class="form-group">
                <label>Nombre de la Categoría *</label>
                <input type="text" name="nombre_categoria" required value="${cat.Nombre_Categoria || ''}">
            </div>

            <div class="form-group">
                <label>Descripción</label>
                <textarea name="descripcion" rows="3">${cat.Descripcion || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Estado *</label>
                <select name="estado" required>
                    <option value="Activo" ${cat.Estado === 'Activo' ? 'selected' : ''}>Activo</option>
                    <option value="Inactivo" ${cat.Estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
                    <option value="Pausado" ${cat.Estado === 'Pausado' ? 'selected' : ''}>Pausado</option>
                </select>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="intentarCerrarModal('modal-generico')">Cancelar</button>
                <button type="submit" class="btn-primary">Actualizar</button>
            </div>
        </form>
    `);
}

async function actualizarCategoriaHerramienta(event, id) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const categoriaData = {
        Nombre_Categoria: formData.get('nombre_categoria'),
        Descripcion: formData.get('descripcion'),
        Estado: formData.get('estado')
    };

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Actualizando...');

        // Actualizar localmente de inmediato
        const index = appState.categoriasHerramientas.findIndex(c => c.ID_Categoria == id);
        if (index !== -1) {
            appState.categoriasHerramientas[index] = {
                ...appState.categoriasHerramientas[index],
                ...categoriaData,
                Ultima_Actualizacion: new Date().toISOString()
            };
        }

        cerrarModal(true);
        renderizarTablaCategoriasHerramientas();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'update',
            sheetName: CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS,
            data: categoriaData,
            rowId: id
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Categoría actualizada');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Categoría actualizada', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}

async function eliminarCategoriaHerramienta(id) {
    const cat = appState.categoriasHerramientas.find(c => c.ID_Categoria == id);
    if (!cat) return;

    if (!confirm(`¿Eliminar categoría "${cat.Nombre_Categoria}"?`)) return;

    try {
        appState.isUserOperating = true;
        appState.pendingOperations++;
        mostrarBloqueoOperacion('Eliminando...');

        // Eliminar del array local inmediatamente
        const index = appState.categoriasHerramientas.findIndex(c => c.ID_Categoria == id);
        if (index !== -1) {
            appState.categoriasHerramientas.splice(index, 1);
        }

        renderizarTablaCategoriasHerramientas();

        // Enviar al servidor en segundo plano
        enviarAlScript({
            action: 'delete',
            sheetName: CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS,
            rowId: id
        }).then(result => {
            if (result.status === 'success') {
                console.log('✅ Categoría eliminada');
                ocultarBloqueoOperacion();
                mostrarNotificacion('✅ Categoría eliminada', 'success');
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
        mostrarNotificacion('❌ Error: ' + error.message, 'error');
        appState.pendingOperations = Math.max(0, appState.pendingOperations - 1);
        appState.isUserOperating = false;
    }
}
