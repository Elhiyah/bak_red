const express = require('express');
const router = express.Router();
const invitadoController = require('../controllers/invitadoController'); // Ajusta la ruta

// Rutas para invitados
router.post('/invitados', invitadoController.crearInvitado);
router.get('/eventos/:evento_id/invitados', invitadoController.obtenerInvitados);
router.get('/invitados/:id', invitadoController.obtenerInvitadoPorId);
router.put('/invitados/:id', invitadoController.actualizarInvitado);
router.delete('/invitados/:id', invitadoController.eliminarInvitado);

// Rutas para acciones específicas
router.put('/invitados/:id/confirmar', invitadoController.confirmarAsistencia);
router.put('/invitados/:id/checkin', invitadoController.registrarCheckIn);
router.put('/invitados/:id/checkout', invitadoController.registrarCheckOut);

// Ruta para estadísticas
router.get('/eventos/:evento_id/estadisticas', invitadoController.obtenerEstadisticasEvento);

module.exports = router;