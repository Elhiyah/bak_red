// routes/patrocinioRoutes.js
const express = require('express');
const router = express.Router();
const patrocinioCtrl = require('../controllers/patrocinio.controller');

/**
 * ENDPOINTS PATROCINADORES
 */
// Crear (agregar) patrocinador
// POST /api/patrocinadores
// Body JSON: { "eventoId": 1, "empresaId": 5 }
router.post('/patrocinadores', patrocinioCtrl.agregarPatrocinador);

// Eliminar patrocinador de un evento
// DELETE /api/patrocinadores/:eventoId/:empresaId
router.delete('/patrocinadores/:eventoId/:empresaId', patrocinioCtrl.eliminarPatrocinador);

// Obtener todos los patrocinadores de un evento
// GET /api/patrocinadores/evento/:eventoId
router.get('/patrocinadores/evento/:eventoId', patrocinioCtrl.obtenerPatrocinadoresPorEvento);

/**
 * ENDPOINTS AUSPCICIADORES
 */
// Crear (agregar) auspiciador
// POST /api/auspiciadores
// Body JSON: { "eventoId": 1, "empresaId": 7 }
router.post('/auspiciadores', patrocinioCtrl.agregarAuspiciador);

// Eliminar auspic­iador de un evento
// DELETE /api/auspiciadores/:eventoId/:empresaId
router.delete('/auspiciadores/:eventoId/:empresaId', patrocinioCtrl.eliminarAuspiciador);

// Obtener todos los auspic­iadores de un evento
// GET /api/auspiciadores/evento/:eventoId
router.get('/auspiciadores/evento/:eventoId', patrocinioCtrl.obtenerAuspiciadoresPorEvento);

module.exports = router;
