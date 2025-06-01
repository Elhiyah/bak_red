const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectMongoDB = require('./config/mongodb');
const { poolPromise } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🔧 REPARANDO EL PROBLEMA ESPECÍFICO');

// Middlewares básicos
app.use(express.json());

// Cargar todas las rutas (sabemos que esto funciona)
console.log('📂 Cargando todas las rutas...');

const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);
console.log('✅ Auth');

const userRoutes = require('./routes/user.routes');
app.use('/api/users', userRoutes);
console.log('✅ User');

const profileRoutes = require('./routes/profile.routes');
app.use('/api/profile', profileRoutes);
console.log('✅ Profile');

const eventsRoutes = require('./routes/events.routes');
app.use('/api/events', eventsRoutes);
console.log('✅ Events');

const participationsRoutes = require('./routes/participations.routes');
app.use('/api/participations', participationsRoutes);
console.log('✅ Participations');

const sponsorshipsRoutes = require('./routes/sponsorships.routes');
app.use('/api/sponsorships', sponsorshipsRoutes);
console.log('✅ Sponsorships');

const impactRoutes = require('./routes/impact.routes');
app.use('/api/impact', impactRoutes);
console.log('✅ Impact');

// Middlewares adicionales (sabemos que esto funciona)
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Demasiadas solicitudes' }
});
app.use(limiter);

console.log('✅ Middlewares agregados');

// AQUÍ ES DONDE OCURRE EL PROBLEMA
// Vamos a agregar las rutas de sistema de forma más cuidadosa

console.log('🧪 Agregando ruta /health...');
try {
    app.get('/health', async (req, res) => {
        try {
            const pool = await poolPromise;
            await pool.request().query('SELECT 1');
            
            const mongoose = require('mongoose');
            const mongoStatus = mongoose.connection.readyState;
            
            res.json({
                success: true,
                message: 'Servidor funcionando',
                databases: {
                    sqlServer: 'conectado',
                    mongodb: mongoStatus === 1 ? 'conectado' : 'desconectado'
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error en el servidor'
            });
        }
    });
    console.log('✅ Ruta /health agregada');
} catch (error) {
    console.error('❌ Error en ruta /health:', error.message);
}

console.log('🧪 Agregando ruta de test...');
try {
    app.get('/api/test', (req, res) => {
        res.json({
            success: true,
            message: 'API funcionando',
            timestamp: new Date().toISOString()
        });
    });
    console.log('✅ Ruta /api/test agregada');
} catch (error) {
    console.error('❌ Error en ruta /api/test:', error.message);
}

console.log('🧪 Agregando error handler 404...');
try {
    app.use('*', (req, res) => {
        res.status(404).json({
            success: false,
            error: 'Ruta no encontrada'
        });
    });
    console.log('✅ Error handler 404 agregado');
} catch (error) {
    console.error('❌ Error en 404 handler:', error.message);
}

console.log('🧪 Agregando error handler general...');
try {
    app.use((error, req, res, next) => {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    });
    console.log('✅ Error handler general agregado');
} catch (error) {
    console.error('❌ Error en general handler:', error.message);
}

// Función de inicialización SIMPLIFICADA
const startServer = async () => {
    try {
        console.log('\n🚀 Iniciando servidor SIMPLIFICADO...');
        
        // NO conectar bases de datos aún
        console.log('⏩ Saltando conexiones de BD por ahora...');
        
        // Iniciar servidor SOLO
        app.listen(PORT, () => {
            console.log('\n🎉 ¡SERVIDOR FUNCIONANDO!');
            console.log(`📍 Puerto: ${PORT}`);
            console.log(`🧪 Prueba: http://localhost:${PORT}/api/test`);
            console.log('\n✅ Si ves este mensaje, el problema estaba en las conexiones de BD');
        });
        
    } catch (error) {
        console.error('\n❌ Error al inicializar:', error);
        console.error('🔍 El problema está en app.listen() o en el servidor mismo');
    }
};

// Inicializar INMEDIATAMENTE (sin process handlers)
startServer();

module.exports = app;