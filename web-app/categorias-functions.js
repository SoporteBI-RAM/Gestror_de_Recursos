// ========================================
// GESTIÓN DE CATEGORÍAS DE HERRAMIENTAS
// ========================================

// Mostrar modal de gestión de categorías
function mostrarGestionCategorias() {
    document.getElementById('modal-gestion-categorias').classList.add('active');
    cargarCategorias();
}

// Cerrar modal de gestión
function cerrarGestionCategorias() {
    document.getElementById('modal-gestion-categorias').classList.remove('active');
}

// Mostrar formulario de nueva categoría
function mostrarFormularioCategoria() {
    const modal = document.getElementById('modal-form-categoria');
    const form = document.getElementById('form-categoria');
    modal.classList.add('active');
    form.reset();
    delete form.dataset.dirty;

    // Limpiar ID explícitamente porque form.reset() no limpia campos hidden
    if (form.querySelector('[name="id_categoria"]')) {
        form.querySelector('[name="id_categoria"]').value = '';
    }

    document.querySelector('#modal-form-categoria .modal-header h2').innerHTML = '<i class="fas fa-tag"></i> Nueva Categoría';
}

// Cerrar formulario de categoría con confirmación
function cerrarFormularioCategoria() {
    intentarCerrarModal('modal-form-categoria');
}

// Cargar lista de categorías
async function cargarCategorias() {
    const container = document.getElementById('categorias-modal-container');

    try {
        container.innerHTML = '<div class="loading">Cargando categorías...</div>';

        const data = await leerHoja(CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS);
        const categorias = convertirAObjetos(data);

        // Guardar en memoria global si necesitas
        if (!window.appState) window.appState = {};
        window.appState.categoriasHerramientas = categorias;

        renderizarTablaCategorias(categorias);
    } catch (error) {
        console.error('Error al cargar categorías:', error);
        container.innerHTML = '<div class="error">Error al cargar categorías</div>';
    }
}

// Renderizar tabla de categorías
function renderizarTablaCategorias(categorias) {
    const container = document.getElementById('categorias-modal-container');

    if (!categorias || categorias.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay categorías registradas</div>';
        return;
    }

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 60px;">Icono</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th style="width: 100px;">Estado</th>
                    <th style="width: 120px;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${categorias.map(cat => `
                    <tr>
                        <td style="text-align: center; font-size: 24px;">${cat.Icono || '📁'}</td>
                        <td><strong>${cat.Nombre_Categoria}</strong></td>
                        <td>${cat.Descripcion || '-'}</td>
                        <td>
                            <span class="badge badge-${cat.Estado === 'Activo' ? 'success' : 'secondary'}">
                                ${cat.Estado}
                            </span>
                        </td>
                        <td>
                            <button class="btn-icon" onclick="editarCategoria(${cat.ID_Categoria})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-danger" onclick="eliminarCategoria(${cat.ID_Categoria})" title="Eliminar">
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

// Guardar categoría
async function guardarCategoria(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const categoriaId = formData.get('id_categoria');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;

    const categoriaData = {
        Nombre_Categoria: (formData.get('nombre_categoria') || '').trim().toUpperCase(),
        Descripcion: formData.get('descripcion'),
        Icono: formData.get('icono') || '📁',
        Estado: formData.get('estado')
    };

    try {
        const isEdit = !!categoriaId;

        // Deshabilitar botón y mostrar estado de carga
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const payload = {
            action: isEdit ? 'update' : 'add',
            sheetName: CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS,
            data: categoriaData,
            rowId: categoriaId || ''
        };

        const result = await enviarAlScript(payload);

        if (result.status === 'success') {
            mostrarNotificacion(
                isEdit ? 'Categoría actualizada correctamente' : 'Categoría creada correctamente',
                'success'
            );

            cerrarFormularioCategoria(true);
            cargarCategorias();
        } else {
            throw new Error(result.message || 'Error desconocido');
        }

    } catch (error) {
        console.error('Error al guardar categoría:', error);
        mostrarNotificacion('Error al guardar la categoría: ' + error.message, 'error');

        // Restaurar botón en caso de error
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Editar categoría
function editarCategoria(id) {
    const categorias = window.appState?.categoriasHerramientas || [];
    const categoria = categorias.find(c => c.ID_Categoria == id);

    if (!categoria) {
        mostrarNotificacion('Categoría no encontrada', 'error');
        return;
    }

    const form = document.getElementById('form-categoria');
    form.querySelector('[name="id_categoria"]').value = categoria.ID_Categoria;
    form.querySelector('[name="nombre_categoria"]').value = categoria.Nombre_Categoria || '';
    form.querySelector('[name="descripcion"]').value = categoria.Descripcion || '';
    form.querySelector('[name="icono"]').value = categoria.Icono || '';
    form.querySelector('[name="estado"]').value = categoria.Estado || 'Activo';

    document.querySelector('#modal-form-categoria .modal-header h2').innerHTML = '<i class="fas fa-edit"></i> Editar Categoría';
    document.getElementById('modal-form-categoria').classList.add('active');
}

// Eliminar categoría
async function eliminarCategoria(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta categoría?\n\nEsto puede afectar las herramientas que usan esta categoría.')) {
        return;
    }

    try {
        // Mostrar notificación de progreso
        mostrarNotificacion('Eliminando categoría...', 'info');

        const payload = {
            action: 'delete',
            sheetName: CONFIG.SHEETS.CATEGORIAS_HERRAMIENTAS,
            rowId: id
        };

        const result = await enviarAlScript(payload);

        if (result.status === 'success') {
            mostrarNotificacion('Categoría eliminada correctamente', 'success');
            cargarCategorias();
        } else {
            throw new Error(result.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error al eliminar categoría:', error);
        mostrarNotificacion('Error al eliminar la categoría: ' + error.message, 'error');
    }
}
