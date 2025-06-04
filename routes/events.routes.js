const express = require('express');
const router = express.Router();

// Importar controladores
const {
  createEvent,//
  getAllEvents,//
  getEventById,//
  getOngEvents,//
  updateEvent,//
  deleteEvent,//
  registerParticipant,
  registerAttendance,
  getEventParticipants,
  deleteEventImage,
  getEventStatistics,//
  getSystemStatistics,
  getAvailableCompanies,
  searchEvents,
  getUpcomingEvents,
  getEventsByType,
  changeEventStatus,
  getEventsByStatus,
  getStatusStatistics,
  getAvailableTransitions,
  getEventStatusHistory,
  getOngStatusDashboard,
  getCompanyEvents,//
  getUserParticipationEvents,
  registrarPatrocinador,
  registrarAuspiciador,
  upload
} = require('../controllers/events.controller');

const { authenticateToken, onlyEmpresa } = require('../middleware/auth');
// RUTAS ESTÁTICAS PRIMERO
router.get('/sistema/estadisticas', getSystemStatistics);
router.get('/empresas/disponibles', getAvailableCompanies);
router.get('/filtros/proximos', getUpcomingEvents);
router.get('/estados/estadisticas', getStatusStatistics);


router.post('/:id/patrocinar', registrarPatrocinador);
router.post('/:id/auspiciar',  registrarAuspiciador);

// RUTAS BÁSICAS
router.post('/', upload.array('imagenesPromocionales', 5), createEvent);
router.get('/', getAllEvents);

// RUTAS CON PARÁMETROS - ESPECÍFICAS PRIMERO
router.get('/buscar/:termino', searchEvents);
router.get('/tipo/:tipoEvento', getEventsByType);
router.get('/estado/:estado', getEventsByStatus);
router.get('/ong/:ongId/dashboard', getOngStatusDashboard);
router.get('/ong/:ongId', getOngEvents);
router.get('/empresas/:empresaId/eventos', getCompanyEvents);
router.get('/integrantes/:integranteId/participaciones', getUserParticipationEvents);//

// RUTAS DE EVENTO ESPECÍFICO
router.get('/:eventoId/participantes', getEventParticipants);//
router.get('/:eventoId/estadisticas', getEventStatistics);//
router.get('/:eventoId/transiciones', getAvailableTransitions);
router.get('/:eventoId/historial-estados', getEventStatusHistory);
router.get('/:eventoId', getEventById);

router.put('/:eventoId/estado', changeEventStatus);
router.put('/:eventoId/asistencia', registerAttendance);
router.put('/:eventoId', upload.array('nuevasImagenes', 10), updateEvent);

router.post('/:eventoId/participantes', registerParticipant);

router.delete('/:eventoId/imagenes/:imagenId', deleteEventImage);
router.delete('/:eventoId', deleteEvent);

module.exports = router;