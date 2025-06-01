const { poolPromise } = require('../config/db');
const User = require('../models/user');
const bcrypt = require('bcryptjs');

// Obtener perfil completo del usuario
const getProfile = async (req, res) => {
    try {
        const mongoUser = await User.findById(req.user.userId).select('-contrasena -sesiones');
        
        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Obtener datos adicionales de SQL Server según el tipo de usuario
        const pool = await poolPromise;
        let sqlData = {};

        const baseQuery = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .query('SELECT * FROM usuarios WHERE id_usuario = @id_usuario');

        const baseUser = baseQuery.recordset[0];

        // Obtener datos específicos según el tipo de usuario
        switch (mongoUser.tipo_usuario) {
            case 'Empresa':
                const empresaQuery = await pool.request()
                    .input('id_usuario', mongoUser.sqlUserId)
                    .query('SELECT * FROM empresas WHERE id_usuario = @id_usuario');
                sqlData = { ...baseUser, empresa: empresaQuery.recordset[0] };
                break;
                
            case 'ONG':
                const ongQuery = await pool.request()
                    .input('id_usuario', mongoUser.sqlUserId)
                    .query('SELECT * FROM ONGS WHERE id_usuario = @id_usuario');
                sqlData = { ...baseUser, ong: ongQuery.recordset[0] };
                break;
                
            case 'Integrante externo':
                const integranteQuery = await pool.request()
                    .input('id_usuario', mongoUser.sqlUserId)
                    .query('SELECT * FROM integrantes_externos WHERE id_usuario = @id_usuario');
                sqlData = { ...baseUser, integrante: integranteQuery.recordset[0] };
                break;
                
            case 'Super admin':
                const adminQuery = await pool.request()
                    .input('id_usuario', mongoUser.sqlUserId)
                    .query('SELECT * FROM super_admins WHERE id_usuario = @id_usuario');
                sqlData = { ...baseUser, admin: adminQuery.recordset[0] };
                break;
                
            default:
                sqlData = baseUser;
        }

        // Remover contraseña de los datos SQL
        delete sqlData.contrasena;

        res.json({
            success: true,
            user: {
                ...mongoUser.toObject(),
                sqlData
            }
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Actualizar perfil del usuario
const updateProfile = async (req, res) => {
    try {
        const { avatar, preferencias, ...sqlFields } = req.body;
        
        // Actualizar datos en MongoDB
        const updateData = {};
        if (avatar) updateData.avatar = avatar;
        if (preferencias) updateData.preferencias = { ...preferencias };

        const mongoUser = await User.findByIdAndUpdate(
            req.user.userId,
            updateData,
            { new: true, runValidators: true }
        ).select('-contrasena -sesiones');

        // Actualizar datos en SQL Server si hay campos específicos
        if (Object.keys(sqlFields).length > 0) {
            const pool = await poolPromise;
            
            // Construir query dinámicamente
            const setClause = Object.keys(sqlFields)
                .map(key => `${key} = @${key}`)
                .join(', ');
            
            if (setClause) {
                const request = pool.request().input('id_usuario', mongoUser.sqlUserId);
                
                Object.entries(sqlFields).forEach(([key, value]) => {
                    request.input(key, value);
                });
                
                await request.query(`
                    UPDATE usuarios 
                    SET ${setClause}
                    WHERE id_usuario = @id_usuario
                `);
            }
        }

        res.json({
            success: true,
            message: "Perfil actualizado exitosamente",
            user: mongoUser
        });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Cambiar contraseña
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Verificar contraseña actual
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                error: "La contraseña actual es incorrecta"
            });
        }

        // Actualizar contraseña en MongoDB
        user.contrasena = newPassword;
        await user.save();

        // Actualizar contraseña en SQL Server (texto plano para mantener compatibilidad)
        const pool = await poolPromise;
        await pool.request()
            .input('id_usuario', user.sqlUserId)
            .input('nueva_contrasena', newPassword)
            .query('UPDATE usuarios SET contrasena = @nueva_contrasena WHERE id_usuario = @id_usuario');

        res.json({
            success: true,
            message: "Contraseña actualizada exitosamente"
        });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Eliminar cuenta propia
const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({
                success: false,
                error: "Se requiere confirmar la contraseña para eliminar la cuenta"
            });
        }

        const user = await User.findById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Verificar contraseña
        const isPasswordValid = await user.comparePassword(password);
        
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                error: "Contraseña incorrecta"
            });
        }

        // Marcar como inactivo en lugar de eliminar completamente
        await User.findByIdAndUpdate(req.user.userId, { activo: false });
        
        const pool = await poolPromise;
        await pool.request()
            .input('id_usuario', user.sqlUserId)
            .query('UPDATE usuarios SET activo = 0 WHERE id_usuario = @id_usuario');

        res.json({
            success: true,
            message: "Cuenta desactivada exitosamente"
        });
    } catch (error) {
        console.error('Error al eliminar cuenta:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Obtener sesiones activas del usuario
const getUserSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('sesiones');
        
        const activeSessions = user.sesiones
            .filter(session => session.activa)
            .map(session => ({
                id: session._id,
                fechaCreacion: session.fechaCreacion,
                dispositivo: session.dispositivo,
                ip: session.ip
            }));

        res.json({
            success: true,
            sessions: activeSessions
        });
    } catch (error) {
        console.error('Error al obtener sesiones:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Terminar sesión específica
const terminateSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        await User.findByIdAndUpdate(req.user.userId, {
            $set: { 'sesiones.$[elem].activa': false }
        }, {
            arrayFilters: [{ 'elem._id': sessionId }]
        });

        res.json({
            success: true,
            message: "Sesión terminada exitosamente"
        });
    } catch (error) {
        console.error('Error al terminar sesión:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Terminar todas las sesiones
const terminateAllSessions = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.userId, {
            $set: { 'sesiones.$[].activa': false }
        });

        res.json({
            success: true,
            message: "Todas las sesiones han sido terminadas"
        });
    } catch (error) {
        console.error('Error al terminar todas las sesiones:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Obtener preferencias del usuario
const getPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('preferencias');
        
        res.json({
            success: true,
            preferences: user.preferencias
        });
    } catch (error) {
        console.error('Error al obtener preferencias:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Actualizar preferencias del usuario
const updatePreferences = async (req, res) => {
    try {
        const { idioma, tema, notificaciones } = req.body;
        
        const updateData = {};
        if (idioma) updateData['preferencias.idioma'] = idioma;
        if (tema) updateData['preferencias.tema'] = tema;
        if (notificaciones) updateData['preferencias.notificaciones'] = notificaciones;

        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('preferencias');

        res.json({
            success: true,
            message: "Preferencias actualizadas exitosamente",
            preferences: user.preferencias
        });
    } catch (error) {
        console.error('Error al actualizar preferencias:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// FUNCIONES ADMINISTRATIVAS Solo Super Admin

// Obtener todos los usuarios
const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, tipo_usuario, activo } = req.query;
        
        const filter = {};
        if (tipo_usuario) filter.tipo_usuario = tipo_usuario;
        if (activo !== undefined) filter.activo = activo === 'true';

        const users = await User.find(filter)
            .select('-contrasena -sesiones -tokenVerificacion -tokenRecuperacion')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalUsers: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Obtener usuario por ID
const getUserById = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId)
            .select('-contrasena -sesiones -tokenVerificacion -tokenRecuperacion');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Actualizar estado del usuario
const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { activo } = req.body;
        
        const user = await User.findByIdAndUpdate(
            userId,
            { activo },
            { new: true }
        ).select('-contrasena -sesiones');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Actualizar también en SQL Server
        const pool = await poolPromise;
        await pool.request()
            .input('id_usuario', user.sqlUserId)
            .input('activo', activo ? 1 : 0)
            .query('UPDATE usuarios SET activo = @activo WHERE id_usuario = @id_usuario');

        res.json({
            success: true,
            message: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente`,
            user
        });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Eliminar usuario (admin)
const deleteUserAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Marcar como inactivo en lugar de eliminar
        await User.findByIdAndUpdate(userId, { activo: false });
        
        const pool = await poolPromise;
        await pool.request()
            .input('id_usuario', user.sqlUserId)
            .query('UPDATE usuarios SET activo = 0 WHERE id_usuario = @id_usuario');

        res.json({
            success: true,
            message: "Usuario eliminado exitosamente"
        });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Estadísticas de usuarios
const getUserStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ activo: true });
        const usersByType = await User.aggregate([
            {
                $group: {
                    _id: '$tipo_usuario',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeUsers,
                inactiveUsers: totalUsers - activeUsers,
                usersByType
            }
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// Actividad de usuarios
const getUserActivity = async (req, res) => {
    try {
        const recentActivity = await User.find({ 
            ultimoAcceso: { 
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Últimos 7 días
            } 
        })
        .select('nombre_usuario correo ultimoAcceso tipo_usuario')
        .sort({ ultimoAcceso: -1 })
        .limit(20);

        res.json({
            success: true,
            recentActivity
        });
    } catch (error) {
        console.error('Error al obtener actividad:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
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
};