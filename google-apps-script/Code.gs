// ========================================
// GOOGLE APPS SCRIPT - SIN CORS (USA REDIRECT)
// Version Reconciliada con Reordenamiento
// ========================================

const SHEET_ID = '1uTMjJ_4_uXfZ2u0P9CTMy4pzMBY60e0tzWkM6xnglTk';

function doGet(e) {
  const callback = e.parameter.callback;
  const action = e.parameter.action;
  const sheetName = e.parameter.sheetName;

  try {
    let result;

    if (action === 'read' && sheetName) {
      const startTime = new Date().getTime();

      // Usar cache de 60 segundos para acelerar
      const cache = CacheService.getScriptCache();
      const cacheKey = 'sheet_' + sheetName;
      const cached = cache.get(cacheKey);

      if (cached) {
        result = JSON.parse(cached);
        result.fromCache = true;
      } else {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(sheetName);

        if (!sheet) {
          result = {
            status: 'error',
            message: 'Hoja no encontrada: ' + sheetName
          };
        } else {
          // Optimización: Solo leer hasta la última fila con datos
          const lastRow = sheet.getLastRow();
          const lastCol = sheet.getLastColumn();

          let data;
          if (lastRow === 0 || lastCol === 0) {
            data = [];
          } else {
            data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
          }

          result = {
            status: 'success',
            data: data,
            rows: lastRow,
            cols: lastCol
          };

          // Cachear por 60 segundos
          cache.put(cacheKey, JSON.stringify(result), 60);
        }
      }

      const endTime = new Date().getTime();
      result.loadTime = endTime - startTime;

    } else {
      result = {
        status: 'success',
        message: 'API funcionando',
        timestamp: new Date().toISOString()
      };
    }

    // Si hay callback, devolver JSONP
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // Sino, devolver JSON normal
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    const errorResult = {
      status: 'error',
      message: error.toString()
    };

    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(errorResult) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const { action, sheetName, data, rowId, user, orderData } = request;

    let result;

    switch(action) {
      case 'add':
        result = addRow(sheetName, data, user || 'Web App');
        break;
      case 'update':
        result = updateRow(sheetName, rowId, data, user || 'Web App');
        break;
      case 'delete':
        result = deleteRow(sheetName, rowId, user || 'Web App');
        break;
      case 'bulkUpdateOrder':
        // Compatible con el payload que envía app.js {action, sheetName, orderData, user}
        result = bulkUpdateOrder(sheetName, orderData || data, user || 'Web App');
        break;
      default:
        throw new Error('Acción no válida');
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        data: result
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// OPERACIONES GENÉRICAS
// ========================================

function addRow(sheetName, data, user) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

  const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = rawHeaders.map(h => String(h).trim()); // CRITICAL: Limpiar espacios
  const lastRow = sheet.getLastRow();
  const newId = lastRow > 1 ? parseInt(sheet.getRange(lastRow, 1).getValue()) + 1 : 1;
  const now = new Date().toISOString();

  // DEBUG: Ver qué datos llegan
  Logger.log('=== ADD ROW DEBUG ===');
  Logger.log('Headers originales: ' + JSON.stringify(rawHeaders));
  Logger.log('Headers limpios: ' + JSON.stringify(headers));
  Logger.log('Data recibida: ' + JSON.stringify(data));
  Logger.log('User: ' + user);

  const primaryIdColumn = headers[0];

  const newRow = headers.map(header => {
    if (header === primaryIdColumn) return newId;
    if (header.startsWith('ID_') && data[header] !== undefined) return data[header];
    if (header === 'Fecha_Creacion' || header === 'Ultima_Actualizacion') return now;
    if (header === 'Actualizado_Por') return user;

    const value = data[header] || '';
    Logger.log('Header "' + header + '" = "' + value + '"');
    return value;
  });

  Logger.log('NewRow a insertar: ' + JSON.stringify(newRow));
  sheet.appendRow(newRow);
  logChange(sheetName, 'INSERT', `ID: ${newId}`, user);

  return { id: newId };
}

function updateRow(sheetName, rowId, data, user) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

  const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = rawHeaders.map(h => String(h).trim()); // CRITICAL: Limpiar espacios
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == rowId) {
      const now = new Date().toISOString();

      headers.forEach((header, colIndex) => {
        if (header === 'Ultima_Actualizacion') {
          sheet.getRange(i + 1, colIndex + 1).setValue(now);
        } else if (header === 'Actualizado_Por') {
          sheet.getRange(i + 1, colIndex + 1).setValue(user);
        } else if (data[header] !== undefined && !header.startsWith('ID_') && header !== 'Fecha_Creacion') {
          sheet.getRange(i + 1, colIndex + 1).setValue(data[header]);
        }
      });

      logChange(sheetName, 'UPDATE', `ID: ${rowId}`, user);
      return { message: 'Actualizado' };
    }
  }

  throw new Error('Registro no encontrado');
}

function deleteRow(sheetName, rowId, user) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == rowId) {
      sheet.deleteRow(i + 1);
      logChange(sheetName, 'DELETE', `ID: ${rowId}`, user);
      return { message: 'Eliminado' };
    }
  }

  throw new Error('Registro no encontrado');
}

/**
 * Actualiza el orden de múltiples registros de una vez
 */
function bulkUpdateOrder(sheetName, orderData, user) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

  const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = rawHeaders.map(h => String(h).trim());
  const orderColIndex = headers.indexOf('Orden');

  if (orderColIndex === -1) {
    // Si no existe la columna Orden, la creamos al final
    sheet.getRange(1, headers.length + 1).setValue('Orden');
    headers.push('Orden');
  }

  const finalOrderColIndex = headers.indexOf('Orden') + 1;
  const dataValues = sheet.getDataRange().getValues();

  // Crear un mapa de ID -> Fila (index + 1) para acceso rápido
  const idRowMap = {};
  for (let i = 1; i < dataValues.length; i++) {
    idRowMap[dataValues[i][0]] = i + 1;
  }

  // Realizar actualizaciones
  orderData.forEach(item => {
    const rowIndex = idRowMap[item.id];
    if (rowIndex) {
      sheet.getRange(rowIndex, finalOrderColIndex).setValue(item.order);
    }
  });

  logChange(sheetName, 'REORDER', `Reordenados ${orderData.length} items`, user);
  return { message: 'Orden actualizado correctamente' };
}

function logChange(tabla, operacion, descripcion, usuario) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('Logs_Cambios');
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const newId = lastRow > 1 ? parseInt(sheet.getRange(lastRow, 1).getValue()) + 1 : 1;

    sheet.appendRow([
      newId,
      new Date().toISOString(),
      tabla,
      operacion,
      descripcion,
      usuario
    ]);
  } catch (error) {
    console.error('Error log:', error);
  }
}
