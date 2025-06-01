const jwt = require('jsonwebtoken');
const User = require('../models/user');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token de acceso requerido'
            });
        }

        // Verificar el token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Buscar el usuario en MongoDB
        const user = await User.findById(decoded.userId);
        
        if (!user || !user.activo) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido o usuario inactivo'
            });
        }

        // Verificar si la sesión está activa
        const activeSession = user.sesiones.find(session => 
            session.token.startsWith(token.substring(0, 20)) && session.activa
        );

        if (!activeSession) {
            return res.status(401).json({
                success: false,
                error: 'Sesión expirada'
            });
        }

        // Agregar información del usuario a la request
        req.user = {
            userId: user._id,
            sqlUserId: user.sqlUserId,
            email: user.correo,
            tipo_usuario: user.tipo_usuario,
            nombre_usuario: user.nombre_usuario
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expirado'
            });
        }

        console.error('Error en middleware de autenticación:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
};

// Middleware para verificar roles específicos
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!roles.includes(req.user.tipo_usuario)) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permisos para acceder a este recurso'
            });
        }

        next();
    };
};

// Middleware para verificar si es super admin
const requireSuperAdmin = requireRole(['Super admin']);

// Middleware para verificar si es empresa
const requireEmpresa = requireRole(['Empresa']);

// Middleware para verificar si es ONG
const requireONG = requireRole(['ONG']);

module.exports = {
    authenticateToken,
    requireRole,
    requireSuperAdmin,
    requireEmpresa,
    requireONG
};