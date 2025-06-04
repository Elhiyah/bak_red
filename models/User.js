const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Referencia al ID del usuario en SQL Server
    sqlUserId: {
        type: Number,
        required: true,
        unique: true
    },
    nombre_usuario: {
        type: String,
        required: true,
        unique: true
    },
    correo: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    contrasena: {
        type: String,
        required: true
    },
    tipo_usuario: {
        type: String,
        required: true,
        enum: ['Empresa', 'ONG', 'Integrante externo', 'Super admin']
    },
    // Campos adicionales para MongoDB
    avatar: {
        type: Buffer,
        default: null
    },
    preferencias: {
        idioma: {
            type: String,
            default: 'es'
        },
        tema: {
            type: String,
            default: 'light'
        },
        notificaciones: {
            email: {
                type: Boolean,
                default: true
            },
            push: {
                type: Boolean,
                default: true
            }
        }
    },
    sesiones: [{
        token: String,
        fechaCreacion: {
            type: Date,
            default: Date.now
        },
        dispositivo: String,
        ip: String,
        activa: {
            type: Boolean,
            default: true
        }
    }],
    ultimoAcceso: {
        type: Date,
        default: Date.now
    },
    activo: {
        type: Boolean,
        default: true
    },
    verificadoEmail: {
        type: Boolean,
        default: false
    },
    tokenVerificacion: String,
    tokenRecuperacion: String,
    fechaTokenRecuperacion: Date
}, {
    timestamps: true
});

// Middleware para hashear contraseña antes de guardar
userSchema.pre('save', async function(next) {
    if (!this.isModified('contrasena')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.contrasena = await bcrypt.hash(this.contrasena, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.contrasena);
};

// Método para obtener datos del usuario sin contraseña
userSchema.methods.toSafeObject = function() {
    const userObject = this.toObject();
    delete userObject.contrasena;
    delete userObject.tokenVerificacion;
    delete userObject.tokenRecuperacion;
    delete userObject.fechaTokenRecuperacion;
    return userObject;
};

module.exports = mongoose.model('User', userSchema);