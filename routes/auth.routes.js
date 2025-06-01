const express = require('express');
const router = express.Router();
const { login, registerUser, logout, getProfile } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

// Rutas públicas (sin autenticación)
router.post('/login', login);
router.post('/register', registerUser);

// Rutas protegidas (requieren autenticación)
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);

// Ruta para verificar si el token es válido
router.get('/verify-token', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token válido',
        user: {
            userId: req.user.userId,
            email: req.user.email,
            tipo_usuario: req.user.tipo_usuario,
            nombre_usuario: req.user.nombre_usuario
        }
    });
});

// Ruta de prueba
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Auth routes funcionando correctamente',
        availableEndpoints: [
            'POST /api/auth/login',
            'POST /api/auth/register',
            'POST /api/auth/logout',
            'GET /api/auth/profile',
            'GET /api/auth/verify-token',
            'GET /api/auth/test'
        ]
    });
});

module.exports = router;