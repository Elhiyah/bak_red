const mongoose = require('mongoose');

// Esquema para invitados
const invitadoSchema = new mongoose.Schema({
  // ID del evento (referencia al EventoID de SQL Server)
  evento_id: {
    type: Number,
    required: true,
    ref: 'Evento'
  },
  
  // Información básica del invitado
  nombre: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  
  numero: {
    type: String,
    required: true,
    trim: true,
    match: [/^[0-9+\-\s()]+$/, 'Número de teléfono inválido']
  },
  
  gmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  
  carnet: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    minlength: 6,
    maxlength: 15
  },
  
  // Estado y participación
  asistencia: {
    type: Boolean,
    default: null // null = no confirmado, true = asistió, false = no asistió
  },
  
  tipo_invitado: {
    type: String,
    enum: ['vip', 'general', 'prensa', 'organizador', 'ponente', 'patrocinador'],
    default: 'general'
  },
  
  activo: {
    type: Boolean,
    default: true
  },
  
  // Metadatos
  fecha_invitacion: {
    type: Date,
    default: Date.now
  },
  
  fecha_confirmacion: {
    type: Date
  },
  
  fecha_asistencia: {
    type: Date
  },
  
  notas: {
    type: String,
    maxlength: 500
  },
  
  // Control de acceso
  codigo_acceso: {
    type: String,
    unique: true,
    sparse: true
  },
  
  check_in: {
    type: Date
  },
  
  check_out: {
    type: Date
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
invitadoSchema.index({ evento_id: 1 });
invitadoSchema.index({ carnet: 1 });
invitadoSchema.index({ gmail: 1 });
invitadoSchema.index({ tipo_invitado: 1 });
invitadoSchema.index({ activo: 1 });
invitadoSchema.index({ nombre: 'text', gmail: 'text' });

// Middleware pre-save para generar código de acceso
invitadoSchema.pre('save', function(next) {
  if (this.isNew && !this.codigo_acceso) {
    // Generar código único: primeras 3 letras del nombre + últimos 4 dígitos del carnet + número aleatorio
    const nombrePart = this.nombre.replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const carnetPart = this.carnet.slice(-4);
    const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.codigo_acceso = `${nombrePart}${carnetPart}${randomPart}`;
  }
  next();
});

// Métodos de instancia
invitadoSchema.methods.confirmarAsistencia = function() {
  this.asistencia = true;
  this.fecha_confirmacion = new Date();
  return this.save();
};

invitadoSchema.methods.registrarCheckIn = function() {
  this.check_in = new Date();
  if (this.asistencia === null) {
    this.asistencia = true;
    this.fecha_asistencia = new Date();
  }
  return this.save();
};

invitadoSchema.methods.registrarCheckOut = function() {
  this.check_out = new Date();
  return this.save();
};

invitadoSchema.methods.toSafeObject = function() {
  const invitado = this.toObject();
  return {
    ...invitado,
    tiempo_evento: this.check_in && this.check_out ? 
      Math.round((this.check_out - this.check_in) / (1000 * 60)) : null // minutos
  };
};

// Métodos estáticos
invitadoSchema.statics.buscarPorEvento = function(eventoId, filtros = {}) {
  const query = { evento_id: eventoId, activo: true };
  
  if (filtros.tipo_invitado) query.tipo_invitado = filtros.tipo_invitado;
  if (filtros.asistencia !== undefined) query.asistencia = filtros.asistencia;
  
  return this.find(query).sort({ nombre: 1 });
};

invitadoSchema.statics.estadisticasEvento = function(eventoId) {
  return this.aggregate([
    { $match: { evento_id: eventoId, activo: true } },
    {
      $group: {
        _id: null,
        totalInvitados: { $sum: 1 },
        confirmados: { $sum: { $cond: [{ $eq: ['$asistencia', true] }, 1, 0] } },
        noConfirmados: { $sum: { $cond: [{ $eq: ['$asistencia', null] }, 1, 0] } },
        noAsistieron: { $sum: { $cond: [{ $eq: ['$asistencia', false] }, 1, 0] } },
        conCheckIn: { $sum: { $cond: [{ $ne: ['$check_in', null] }, 1, 0] } },
        tiposInvitados: {
          $push: '$tipo_invitado'
        }
      }
    },
    {
      $addFields: {
        porcentajeAsistencia: {
          $round: [
            { $multiply: [{ $divide: ['$confirmados', '$totalInvitados'] }, 100] },
            2
          ]
        }
      }
    }
  ]);
};

// Middleware post-save para logging
invitadoSchema.post('save', function(doc, next) {
  console.log(`✅ Invitado "${doc.nombre}" procesado para evento ${doc.evento_id}`);
  next();
});

const Invitado = mongoose.model('Invitado', invitadoSchema);

module.exports = Invitado;