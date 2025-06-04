const express = require('express');
const router = express.Router();

const multer   = require('multer');
const storage  = multer.memoryStorage();           // o diskStorage
const upload   = multer({ storage });

const {
    getProfile,//
    updateProfile,//
    changePassword,
    deleteAccount,
    getUserSessions,
    terminateSession,
    terminateAllSessions,
    getPreferences,
    updatePreferences,
    getAllUsers,
    getUserById,
    updateUserStatus,
    deleteUserAdmin,
    getUserStats,
    getUserActivity
} = require('../controllers/user.controller');

const { 
    authenticateToken, 
    requireSuperAdmin 
} = require('../middleware/auth');

// RUTAS DE PERFIL PERSONAL
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, upload.single('avatar'),  updateProfile);
router.post('/change-password', authenticateToken, changePassword);
router.delete('/account', authenticateToken, deleteAccount);

// GESTIÓN DE SESIONES
router.get('/sessions', authenticateToken, getUserSessions);
router.delete('/sessions/:sessionId', authenticateToken, terminateSession);
router.delete('/sessions', authenticateToken, terminateAllSessions);

// PREFERENCIAS
router.get('/preferences', authenticateToken, getPreferences);
router.put('/preferences', authenticateToken, updatePreferences);

// RUTAS ADMINISTRATIVAS (Solo Super Admin)
router.get('/', authenticateToken, requireSuperAdmin, getAllUsers);
router.get('/stats', authenticateToken, requireSuperAdmin, getUserStats);
router.get('/activity', authenticateToken, requireSuperAdmin, getUserActivity);
router.get('/:userId', authenticateToken, requireSuperAdmin, getUserById);
router.put('/:userId/status', authenticateToken, requireSuperAdmin, updateUserStatus);
router.delete('/:userId', authenticateToken, requireSuperAdmin, deleteUserAdmin);

module.exports = router;