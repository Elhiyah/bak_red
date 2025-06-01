const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const connectMongoDB = require('./config/mongodb');
const { poolPromise } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Iniciando servidor UNI2...');

// MIDDLEWARES
app.use(helmet());
app.use(cors({
    origin: [
        process.env.CLIENT_URL || 'http://localhost:5173',
        'http://127.0.0.1:5502',
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'http://localhost:5173',
        'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
    }
});
app.use(limiter);

// Middleware para IP real del cliente
app.use((req, res, next) => {
    req.ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null);
    next();
});

console.log('✅ Middlewares configurados');

// RUTAS
console.log('📂 Cargando rutas...');

// Rutas principales
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);
console.log('✅ Auth routes');

const userRoutes = require('./routes/user.routes');
app.use('/api/users', userRoutes);
console.log('✅ User routes');

const eventsRoutes = require('./routes/events.routes');
app.use('/api/events', eventsRoutes);
console.log('✅ Events routes');

// === INICIO DE INTEGRACIÓN DE RUTAS DE INVITADOS ===
const invitadoRoutes = require('./routes/invitado.route'); // Asegúrate de que esta ruta sea correcta
app.use('/api', invitadoRoutes); // Montamos las rutas de invitado.route.js
console.log('✅ Invitado routes');
// === FIN DE INTEGRACIÓN DE RUTAS DE INVITADOS ===

// Si tienes las rutas de mega eventos, descomenta:
// const megaEventsRoutes = require('./routes/MegaEvents.routes');
// app.use('/api/mega-events', megaEventsRoutes);
// console.log('✅ Mega Events routes');

console.log('🎯 Todas las rutas cargadas exitosamente');

// RUTAS DE SISTEMA
// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor UNI2 funcionando correctamente',
        timestamp: new Date().toISOString(),
        routes: ['auth', 'users', 'events', 'invitados'], // Añadido 'invitados'
        version: '2.0'
    });
});

// Test route
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API UNI2 funcionando correctamente',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            events: '/api/events',
            invitados: '/api/invitados' // Añadido 'invitados'
        },
        timestamp: new Date().toISOString()
    });
});

// ERROR HANDLERS
// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada',
        requestedPath: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            'GET /health',
            'GET /api/test',
            'POST /api/auth/login',
            'POST /api/auth/register',
            'GET /api/events',
            'POST /api/events',
            // Añadidos los endpoints de invitados para la lista de disponibles
            'POST /api/invitados',
            'GET /api/eventos/:evento_id/invitados',
            'GET /api/invitados/:id',
            'PUT /api/invitados/:id',
            'DELETE /api/invitados/:id',
            'PUT /api/invitados/:id/confirmar',
            'PUT /api/invitados/:id/checkin',
            'PUT /api/invitados/:id/checkout',
            'GET /api/eventos/:evento_id/estadisticas'
        ]
    });
});

// Error handler general
app.use((error, req, res, next) => {
    console.error('💥 Error:', error.message);
    
    // Errores específicos de multer (subida de archivos)
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'Archivo demasiado grande. Tamaño máximo: 5MB'
        });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            error: 'Demasiados archivos. Máximo 5 imágenes por evento'
        });
    }
    
    res.status(error.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
            ? 'Error interno del servidor' 
            : error.message
    });
});

// INICIALIZACIÓN DEL SERVIDOR
app.listen(PORT, () => {
    console.log('\n🎉 ========================================');
    console.log('🚀 SERVIDOR UNI2 INICIADO');
    console.log('🎉 ========================================');
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n📊 ENDPOINTS PRINCIPALES:');
    console.log(`    💊 Health: http://localhost:${PORT}/health`);
    console.log(`    🧪 Test: http://localhost:${PORT}/api/test`);
    console.log(`    🔐 Auth: http://localhost:${PORT}/api/auth/test`);
    console.log(`    👥 Users: http://localhost:${PORT}/api/users`);
    console.log(`    🎪 Events: http://localhost:${PORT}/api/events`);
    console.log(`    🎟️ Invitados: http://localhost:${PORT}/api/invitados`); // Añadido 'Invitados'
    console.log('\n✅ ¡Servidor completamente funcional!');
    
    // Conectar bases de datos en segundo plano
    console.log('\n🔌 Conectando bases de datos...');
    connectDatabases();
});

// Función para conectar bases de datos
const connectDatabases = async () => {
    try {
        // MongoDB
        await connectMongoDB();
        console.log('✅ MongoDB conectado');
        
        // SQL Server
        const pool = await poolPromise;
        await pool.request().query('SELECT 1');
        console.log('✅ SQL Server conectado');
        
        console.log('🎯 Todas las conexiones establecidas');
        
    } catch (error) {
        console.warn('⚠️ Error conectando bases de datos:', error.message);
        console.log('🔄 El servidor sigue funcionando sin algunas conexiones BD');
    }
};

// Manejo de cierre graceful
process.on('SIGTERM', () => {
    console.log('SIGTERM recibido. Cerrando servidor UNI2...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT recibido. Cerrando servidor UNI2...');
    process.exit(0);
});

module.exports = app;