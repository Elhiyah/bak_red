const sql = require('mssql');
require('dotenv').config();

// Debug: verificar que las variables se cargan
console.log('🔍 Variables de entorno SQL Server:');
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_SERVER:', process.env.DB_SERVER);
console.log('DB_DATABASE:', process.env.DB_DATABASE);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[CONFIGURADA]' : '[NO CONFIGURADA]');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, // true para Azure SQL Database
        trustServerCertificate: true, // Para desarrollo local
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Verificar configuración antes de conectar
console.log('🔧 Configuración SQL Server:', {
    user: config.user,
    server: config.server,
    database: config.database,
    password: config.password ? '[CONFIGURADA]' : '[NO CONFIGURADA]'
});

// Validar que todas las propiedades requeridas estén presentes
if (!config.server) {
    throw new Error('❌ DB_SERVER no está definido en las variables de entorno');
}
if (!config.user) {
    throw new Error('❌ DB_USER no está definido en las variables de entorno');
}
if (!config.password) {
    throw new Error('❌ DB_PASSWORD no está definido en las variables de entorno');
}
if (!config.database) {
    throw new Error('❌ DB_DATABASE no está definido en las variables de entorno');
}

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Conectado a SQL Server exitosamente');
        return pool;
    })
    .catch(err => {
        console.error('❌ Error de conexión a SQL Server:', err);
        throw err;
    });

module.exports = {
    sql,
    poolPromise
};