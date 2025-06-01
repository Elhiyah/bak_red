const mongoose = require('mongoose');

const connectMongoDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uni2';
        
        const conn = await mongoose.connect(mongoURI);
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB Error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB desconectado');
        });
        
    } catch (error) {
        console.error('❌ Error al conectar con MongoDB:', error.message);
        console.warn('⚠️ Continuando sin MongoDB...');
        throw error;
    }
};

module.exports = connectMongoDB;