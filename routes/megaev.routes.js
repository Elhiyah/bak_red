// routes/megaEvents.routes.js
const express = require('express');
const router  = express.Router();
const { getSqlMegaEvents } = require('../controllers/MegaEvento.controller');

// GET /api/mega-events/sql-all
router.get('/sql-all', getSqlMegaEvents);

module.exports = router;
