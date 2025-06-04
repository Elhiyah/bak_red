// controllers/MegaEvento.controller.js
const { poolPromise } = require('../config/db');

const getSqlMegaEvents = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        MegaEventoID,
        titulo,
        descripcion,
        fecha_inicio    AS fechaInicio,
        fecha_fin       AS fechaFin,
        ubicacion,
        presupuesto_estimado AS presupuesto,
        fecha_creacion  AS fechaCreacion,
        fecha_actualizacion AS fechaActualizacion,
        activo
      FROM [UNI2].[dbo].[mega_eventos]
      WHERE activo = 1
      ORDER BY fecha_inicio ASC
    `);

    return res.json({
      success: true,
      megaEventos: result.recordset
    });
  } catch (error) {
    console.error('Error obteniendo MegaEventos SQL:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener MegaEventos desde SQL Server'
    });
  }
};

module.exports = {
  // ... otras exportaciones ...
  getSqlMegaEvents
};
