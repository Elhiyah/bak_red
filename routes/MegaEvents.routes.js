const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); // importa tu middleware
// Importar controladores
const {
  getSqlMegaEvents,
  getAllMegaEventsFull,
  createMegaEvent,//
  
  getMegaEventById,
  getOngMegaEvents,
  updateMegaEvent,
  deleteMegaEvent,
  registerParticipant,
  addOrganizerOng,
  addSponsor,
  registerAttendance,
  getMegaEventParticipants,
  changeMegaEventStatus,
  searchMegaEvents,
  getUpcomingMegaEvents,
  getMegaEventsByCategory,
  getMegaEventStatistics,
  getSystemStatistics,
  deleteMegaEventImage,
  getAvailableCompanies,//
  upload
} = require('../controllers/MegaEvento.controller');

router.get('/sql-all', getSqlMegaEvents);

// RUTAS ESTÁTICAS PRIMERO
router.get('/sistema/estadisticas', getSystemStatistics);
router.get('/empresas/disponibles', getAvailableCompanies);
router.get('/filtros/proximos', getUpcomingMegaEvents);

// RUTAS BÁSICAS

router.post('/megaEvent',authenticateToken, upload.array('imagenesPromocionales', 10), createMegaEvent);


// RUTAS CON PARÁMETROS - ESPECÍFICAS PRIMERO
router.get('/buscar/:termino', searchMegaEvents);
router.get('/categoria/:categoria', getMegaEventsByCategory);
router.get('/ong/:ongId', getOngMegaEvents);

// RUTAS DE MEGA EVENTO ESPECÍFICO
router.get('/:megaEventoId/participantes', getMegaEventParticipants);
router.get('/:megaEventoId/estadisticas', getMegaEventStatistics);
router.get('/:megaEventoId', getMegaEventById);

router.put('/:megaEventoId/estado', changeMegaEventStatus);
router.put('/:megaEventoId/asistencia', registerAttendance);
router.put('/:megaEventoId', upload.array('nuevasImagenes', 10), updateMegaEvent);

router.post('/:megaEventoId/participantes', registerParticipant);
router.post('/:megaEventoId/organizadores', addOrganizerOng);
router.post('/:megaEventoId/patrocinadores', addSponsor);

router.delete('/:megaEventoId/imagenes/:imagenId', deleteMegaEventImage);
router.delete('/:megaEventoId', deleteMegaEvent);

module.exports = router;