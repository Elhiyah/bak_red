// controllers/patrocinioController.js
const { sql, poolPromise } = require('../config/db');

/**
 * Agrega una empresa como patrocinador a un evento.
 * Inserta en la tabla evento_patrocinadores (evento_id, empresa_id).
 */
async function agregarPatrocinador(req, res) {
  const { eventoId, empresaId } = req.body;
  if (!eventoId || !empresaId) {
    return res.status(400).json({ mensaje: 'Faltan parámetros: eventoId y empresaId son obligatorios.' });
  }

  try {
    const pool = await poolPromise;

    // 1) Verificar que el evento existe:
    const checkEvento = await pool
      .request()
      .input('eventoId', sql.Int, eventoId)
      .query('SELECT 1 FROM Eventos WHERE EventoID = @eventoId');

    if (checkEvento.recordset.length === 0) {
      return res.status(404).json({ mensaje: `No existe ningún evento con ID = ${eventoId}` });
    }

    // 2) Verificar que la empresa existe:
    const checkEmpresa = await pool
      .request()
      .input('empresaId', sql.Int, empresaId)
      .query('SELECT 1 FROM empresas WHERE id_usuario = @empresaId');

    if (checkEmpresa.recordset.length === 0) {
      return res.status(404).json({ mensaje: `No existe ninguna empresa con ID = ${empresaId}` });
    }

    // 3) Verificar que no esté ya registrado:
    const checkQuery = `
      SELECT 1 
      FROM evento_patrocinadores 
      WHERE evento_id = @eventoId AND empresa_id = @empresaId
    `;
    const checkResult = await pool
      .request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(checkQuery);

    if (checkResult.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'La empresa ya está como patrocinador de este evento.' });
    }

    // 4) Insertar ahora que todo existe
    const insertQuery = `
      INSERT INTO evento_patrocinadores (evento_id, empresa_id)
      VALUES (@eventoId, @empresaId)
    `;
    await pool
      .request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(insertQuery);

    return res.status(201).json({ mensaje: 'Patrocinador agregado exitosamente.' });
  } catch (err) {
    console.error('Error en agregarPatrocinador:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

/**
 * Elimina un patrocinador (empresa) de un evento.
 */
async function eliminarPatrocinador(req, res) {
  const { eventoId, empresaId } = req.params;

  if (!eventoId || !empresaId) {
    return res.status(400).json({ mensaje: 'Faltan parámetros en la URL.' });
  }

  try {
    const pool = await poolPromise;
    const deleteQuery = `
      DELETE FROM evento_patrocinadores 
      WHERE evento_id = @eventoId AND empresa_id = @empresaId
    `;
    const result = await pool
      .request()
      .input('eventoId', sql.Int, parseInt(eventoId))
      .input('empresaId', sql.Int, parseInt(empresaId))
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ mensaje: 'No se encontró ese patrocinador para el evento dado.' });
    }

    return res.json({ mensaje: 'Patrocinador eliminado exitosamente.' });
  } catch (err) {
    console.error('Error en eliminarPatrocinador:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

/**
 * Obtiene todos los patrocinadores (empresas) de un evento.
 */
async function obtenerPatrocinadoresPorEvento(req, res) {
  const { eventoId } = req.params;

  if (!eventoId) {
    return res.status(400).json({ mensaje: 'Falta parámetro eventoId en la URL.' });
  }

  try {
    const pool = await poolPromise;
    const selectQuery = `
      SELECT e.id_usuario AS empresaId,
             e.nombre_empresa,
             e.NIT,
             e.direccion,
             e.telefono,
             e.sitio_web,
             e.descripcion
      FROM evento_patrocinadores ep
      JOIN empresas e ON ep.empresa_id = e.id_usuario
      WHERE ep.evento_id = @eventoId
    `;
    const result = await pool
      .request()
      .input('eventoId', sql.Int, parseInt(eventoId))
      .query(selectQuery);

    return res.json({ patrocinadores: result.recordset });
  } catch (err) {
    console.error('Error en obtenerPatrocinadoresPorEvento:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

/**
 * Agrega una empresa como auspiciante a un evento.
 * Inserta en la tabla evento_Auspisiadores (evento_id, empresa_id).
 */
async function agregarAuspiciador(req, res) {
  const { eventoId, empresaId } = req.body;

  if (!eventoId || !empresaId) {
    return res.status(400).json({ mensaje: 'Faltan parámetros: eventoId y empresaId son obligatorios.' });
  }

  try {
    const pool = await poolPromise;
    // Verificar si ya existe
    const checkQuery = `
      SELECT * 
      FROM evento_Auspisiadores 
      WHERE evento_id = @eventoId AND empresa_id = @empresaId
    `;
    const checkResult = await pool
      .request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(checkQuery);

    if (checkResult.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'La empresa ya está como auspiciante de este evento.' });
    }

    // Insertar nuevo auspicio
    const insertQuery = `
      INSERT INTO evento_Auspisiadores (evento_id, empresa_id)
      VALUES (@eventoId, @empresaId)
    `;
    await pool
      .request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(insertQuery);

    return res.status(201).json({ mensaje: 'Auspiciante agregado exitosamente.' });
  } catch (err) {
    console.error('Error en agregarAuspiciador:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

/**
 * Elimina un auspiciante (empresa) de un evento.
 */
async function eliminarAuspiciador(req, res) {
  const { eventoId, empresaId } = req.params;

  if (!eventoId || !empresaId) {
    return res.status(400).json({ mensaje: 'Faltan parámetros en la URL.' });
  }

  try {
    const pool = await poolPromise;
    const deleteQuery = `
      DELETE FROM evento_Auspisiadores 
      WHERE evento_id = @eventoId AND empresa_id = @empresaId
    `;
    const result = await pool
      .request()
      .input('eventoId', sql.Int, parseInt(eventoId))
      .input('empresaId', sql.Int, parseInt(empresaId))
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ mensaje: 'No se encontró ese auspiciante para el evento dado.' });
    }

    return res.json({ mensaje: 'Auspiciante eliminado exitosamente.' });
  } catch (err) {
    console.error('Error en eliminarAuspiciador:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

/**
 * Obtiene todos los auspic­iadores (empresas) de un evento.
 */
async function obtenerAuspiciadoresPorEvento(req, res) {
  const { eventoId } = req.params;

  if (!eventoId) {
    return res.status(400).json({ mensaje: 'Falta parámetro eventoId en la URL.' });
  }

  try {
    const pool = await poolPromise;
    const selectQuery = `
      SELECT e.id_usuario AS empresaId,
             e.nombre_empresa,
             e.NIT,
             e.direccion,
             e.telefono,
             e.sitio_web,
             e.descripcion
      FROM evento_Auspisiadores ea
      JOIN empresas e ON ea.empresa_id = e.id_usuario
      WHERE ea.evento_id = @eventoId
    `;
    const result = await pool
      .request()
      .input('eventoId', sql.Int, parseInt(eventoId))
      .query(selectQuery);

    return res.json({ auspiciadores: result.recordset });
  } catch (err) {
    console.error('Error en obtenerAuspiciadoresPorEvento:', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
}

module.exports = {
  agregarPatrocinador,
  eliminarPatrocinador,
  obtenerPatrocinadoresPorEvento,
  agregarAuspiciador,
  eliminarAuspiciador,
  obtenerAuspiciadoresPorEvento,
};
