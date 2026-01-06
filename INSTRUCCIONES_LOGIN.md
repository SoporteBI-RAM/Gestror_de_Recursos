# Instrucciones para Configurar el Sistema de Login

## 📋 Configuración de Google Sheets

Para que el sistema de login funcione correctamente, necesitas agregar una columna de **Contraseña** en la hoja **Users**.

### Paso 1: Abrir tu Google Sheet

Abre tu hoja de Google Sheets con ID: `1uTMjJ_4_uXfZ2u0P9CTMy4pzMBY60e0tzWkM6xnglTk`

### Paso 2: Ir a la hoja "Users"

Busca la pestaña llamada **Users** en la parte inferior de tu Google Sheet.

### Paso 3: Agregar columna "Contraseña"

La estructura actual de la hoja Users debería ser:

| Nombre | Email | ... |
|--------|-------|-----|

**Agrega una nueva columna después de "Email" llamada "Contraseña":**

| Nombre | Email | Contraseña | Rol |
|--------|-------|------------|-----|
| Juan Pérez | juan@rangle.ec | 123456 | admin |
| María García | maria@rangle.ec | 654321 | usuario |

### Paso 4: Agregar contraseñas

Para cada usuario existente, agrega una contraseña en la columna correspondiente.

**⚠️ IMPORTANTE:**
- Las contraseñas se almacenan en texto plano (sin encriptación)
- Este es un sistema básico de autenticación
- Para producción, considera usar un sistema de autenticación más robusto

### Paso 5: Verificar estructura final

La hoja **Users** debe tener esta estructura:

```
Columna A: Nombre
Columna B: Email
Columna C: Contraseña
Columna D: Rol (opcional: "admin" o "usuario")
```

## 🔐 Cómo Funciona el Login

1. **Página de Login:** Los usuarios acceden primero a `login.html`
2. **Validación:** El sistema valida email y contraseña contra la hoja Users
3. **Sesión:** Si es válido, se crea una sesión en localStorage
4. **Redirección:** El usuario es redirigido a `index.html`
5. **Protección:** Si intentan acceder directamente a `index.html` sin sesión, son redirigidos al login

## 🌐 URLs del Sistema

- **Login:** https://soportebi-ram.github.io/Gestror_de_Recursos/login.html
- **Dashboard:** https://soportebi-ram.github.io/Gestror_de_Recursos/index.html

## 👤 Cerrar Sesión

En la esquina superior derecha del header, hay un botón de **cerrar sesión** (icono de salida) que elimina la sesión y redirige al login.

## 🧪 Probar el Sistema

1. Abre https://soportebi-ram.github.io/Gestror_de_Recursos/login.html
2. Ingresa un email y contraseña de la hoja Users
3. Haz clic en "Iniciar Sesión"
4. Deberías ser redirigido al dashboard con tu nombre en el header

## ⚙️ Características

- ✅ Autenticación con email y contraseña
- ✅ Validación contra Google Sheets
- ✅ Sesión persistente (localStorage)
- ✅ Redirección automática según estado de sesión
- ✅ Botón de cerrar sesión
- ✅ Diseño moderno con logo RAM
- ✅ Mensajes de error claros
- ✅ Loading spinner durante autenticación

## 🔧 Solución de Problemas

**Problema:** "Error al conectar con el servidor"
- Verifica que el SHEET_ID en los secrets de GitHub sea correcto
- Verifica que la hoja "Users" exista
- Verifica que el API_KEY sea válido

**Problema:** "Correo o contraseña incorrectos"
- Verifica que el email sea exactamente igual al de la hoja
- Verifica que la contraseña coincida (case-sensitive)
- Revisa que la columna "Contraseña" esté en la posición correcta (columna C)

**Problema:** Redirección infinita entre login e index
- Limpia el localStorage del navegador
- Verifica que auth.js esté cargándose correctamente
- Abre la consola del navegador para ver errores

## 📝 Ejemplo de Datos en Users

```
Nombre          | Email                | Contraseña | Rol
----------------|---------------------|------------|--------
Admin Sistema   | admin@rangle.ec     | admin123   | admin
Juan Pérez      | juan@rangle.ec      | juan2024   | usuario
María García    | maria@rangle.ec     | maria2024  | usuario
```

## 🚀 Próximos Pasos

Para mejorar la seguridad:
1. Considerar usar hash de contraseñas
2. Implementar tokens de sesión con expiración
3. Agregar autenticación de dos factores
4. Usar OAuth2 o similar para autenticación profesional
