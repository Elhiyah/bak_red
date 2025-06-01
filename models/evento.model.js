const mongoose = require('mongoose');

// Esquema para imágenes promocionales
const imagenSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  tipo: {
    type: String,
    enum: ['galeria', 'portada', 'promocional'],
    default: 'galeria'
  },
  datos: {
    type: Buffer,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  tamaño: {
    type: Number,
    required: true
  },
  fechaSubida: {
    type: Date,
    default: Date.now
  }
});

// Esquema para participantes
const participanteSchema = new mongoose.Schema({
  integranteId: {
    type: Number,
    required: true
  },
  tipoParticipante: {
    type: String,
    enum: ['participante', 'voluntario'],
    default: 'participante'
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  asistencia: {
    type: Boolean,
    default: null
  },
  comentarios: {
    type: String,
    maxlength: 500
  }
});

// Esquema para ubicación
const ubicacionSchema = new mongoose.Schema({
  direccion: {
    type: String,
    required: true
  },
  ciudad: {
    type: String,
    default: 'Santa Cruz'
  },
  tipoLocacion: {
    type: String,
    enum: ['presencial', 'virtual', 'hibrido'],
    default: 'presencial'
  },
  coordenadas: {
    latitud: Number,
    longitud: Number
  },
  enlaceVirtual: String
});

// Esquema para métricas
const metricasSchema = new mongoose.Schema({
  totalInscritos: {
    type: Number,
    default: 0
  },
  totalAsistentes: {
    type: Number,
    default: 0
  },
  porcentajeAsistencia: {
    type: Number,
    default: 0
  },
  fechaCalculoFinal: Date,
  capacidadUtilizada: Number
});

// Esquema para historial de estados
const historialEstadoSchema = new mongoose.Schema({
  estadoAnterior: {
    type: String,
    enum: ['borrador', 'publicado', 'en_curso', 'finalizado', 'suspendido', 'cancelado']
  },
  estadoNuevo: {
    type: String,
    enum: ['borrador', 'publicado', 'en_curso', 'finalizado', 'suspendido', 'cancelado'],
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  motivo: {
    type: String,
    maxlength: 500
  },
  usuarioId: {
    type: Number,
    required: true
  }
});

// Esquema principal del evento
const eventoSchema = new mongoose.Schema({
  // Referencia a SQL Server - ÚNICO ÍNDICE AQUÍ
  sqlEventoId: {
    type: Number,
    required: true,
    unique: true // Solo aquí, no en schema.index()
  },

  // Información básica
  titulo: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 200
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: 5000
  },

  // Fechas
  fechaInicio: {
    type: Date,
    required: true
  },
  fechaFinal: {
    type: Date
  },
  fechaLimiteInscripcion: {
    type: Date
  },
  fechaFinalizacion: Date,
  fechaCancelacion: Date,

  // Ubicación
  locacion: {
    type: ubicacionSchema,
    required: true
  },

  // Categorización
  tipoEvento: {
    type: String,
    required: true,
    enum: ['conferencia', 'taller', 'seminario', 'capacitacion', 'voluntariado', 'fundraising', 'cultural', 'deportivo', 'otro']
  },
  categoria: {
    type: String,
    enum: ['social', 'ambiental', 'educativo', 'salud', 'cultural', 'deportivo', 'tecnologico', 'otro'],
    default: 'social'
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Organización
  ongId: {
    type: Number,
    required: true
  },
  creadoPor: {
    type: Number,
    required: true
  },

  // Capacidad y configuración
  capacidadMaxima: {
    type: Number,
    min: 1,
    max: 5000
  },
  inscripcionAbierta: {
    type: Boolean,
    default: true
  },
  requiereAprobacion: {
    type: Boolean,
    default: false
  },

  // Estado y visibilidad
  estado: {
    type: String,
    enum: ['borrador', 'publicado', 'en_curso', 'finalizado', 'suspendido', 'cancelado'],
    default: 'borrador'
  },
  publico: {
    type: Boolean,
    default: false
  },
  activo: {
    type: Boolean,
    default: true
  },

  // Empresas participantes
  empresasPatrocinadoras: [{
    type: Number
  }],
  empresasAuspiciadoras: [{
    type: Number
  }],

  // Participantes y multimedia
  participantes: [participanteSchema],
  imagenesPromocionales: [imagenSchema],

  // Métricas y historial
  metricas: {
    type: metricasSchema,
    default: () => ({})
  },
  historialEstados: [historialEstadoSchema]
}, {
  timestamps: true
});

// Índices para optimizar consultas - SIN DUPLICAR sqlEventoId
eventoSchema.index({ ongId: 1 });
eventoSchema.index({ estado: 1 });
eventoSchema.index({ fechaInicio: 1 });
eventoSchema.index({ tipoEvento: 1 });
eventoSchema.index({ categoria: 1 });
eventoSchema.index({ 'locacion.ciudad': 1 });
eventoSchema.index({ publico: 1, activo: 1 });
eventoSchema.index({ titulo: 'text', descripcion: 'text', tags: 'text' });

// Métodos de instancia
eventoSchema.methods.toSafeObject = function() {
  const evento = this.toObject();
  
  // Convertir imágenes a URLs base64
  if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
    evento.imagenesPromocionales = evento.imagenesPromocionales.map(imagen => ({
      _id: imagen._id,
      nombre: imagen.nombre,
      descripcion: imagen.descripcion,
      tipo: imagen.tipo,
      tamaño: imagen.tamaño,
      fechaSubida: imagen.fechaSubida,
      url: `data:${imagen.mimeType};base64,${imagen.datos.toString('base64')}`
    }));
  }
  
  return evento;
};

eventoSchema.methods.agregarParticipante = function(participanteData) {
  // Verificar si ya está registrado
  const yaRegistrado = this.participantes.some(p => p.integranteId === participanteData.integranteId);
  if (yaRegistrado) {
    throw new Error('El participante ya está registrado en este evento');
  }

  // Verificar capacidad máxima
  if (this.capacidadMaxima && this.participantes.length >= this.capacidadMaxima) {
    throw new Error('Se ha alcanzado la capacidad máxima del evento');
  }

  // Verificar si las inscripciones están abiertas
  if (!this.inscripcionAbierta) {
    throw new Error('Las inscripciones están cerradas para este evento');
  }

  // Verificar fecha límite de inscripción
  if (this.fechaLimiteInscripcion && new Date() > this.fechaLimiteInscripcion) {
    throw new Error('Se ha vencido la fecha límite de inscripción');
  }

  this.participantes.push(participanteData);
  this.metricas.totalInscritos = this.participantes.length;
  
  return this.save();
};

eventoSchema.methods.registrarAsistencia = function(integranteId, asistencia) {
  const participante = this.participantes.find(p => p.integranteId === parseInt(integranteId));
  
  if (!participante) {
    throw new Error('Participante no encontrado en este evento');
  }

  participante.asistencia = asistencia;
  
  // Recalcular métricas
  const totalAsistentes = this.participantes.filter(p => p.asistencia === true).length;
  this.metricas.totalAsistentes = totalAsistentes;
  this.metricas.porcentajeAsistencia = this.participantes.length > 0 ? 
    Math.round((totalAsistentes / this.participantes.length) * 100) : 0;
  
  return this.save();
};

// Métodos estáticos
eventoSchema.statics.buscar = function(termino, filtros = {}) {
  const query = {
    activo: true,
    publico: true,
    estado: 'publicado',
    $or: [
      { titulo: { $regex: termino, $options: 'i' } },
      { descripcion: { $regex: termino, $options: 'i' } },
      { tags: { $in: [new RegExp(termino, 'i')] } }
    ]
  };

  if (filtros.categoria) query.categoria = filtros.categoria;
  if (filtros.ciudad) query['locacion.ciudad'] = filtros.ciudad;
  if (filtros.fechaDesde || filtros.fechaHasta) {
    query.fechaInicio = {};
    if (filtros.fechaDesde) query.fechaInicio.$gte = new Date(filtros.fechaDesde);
    if (filtros.fechaHasta) query.fechaInicio.$lte = new Date(filtros.fechaHasta);
  }

  return this.find(query).sort({ fechaInicio: 1 });
};

eventoSchema.statics.eventosProximos = function(dias = 30) {
  const ahora = new Date();
  const fechaLimite = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);

  return this.find({
    activo: true,
    publico: true,
    estado: 'publicado',
    fechaInicio: {
      $gte: ahora,
      $lte: fechaLimite
    }
  }).sort({ fechaInicio: 1 });
};

// Middleware pre-save
eventoSchema.pre('save', function(next) {
  // Actualizar métricas automáticamente
  if (this.isModified('participantes')) {
    this.metricas.totalInscritos = this.participantes.length;
    
    const asistentes = this.participantes.filter(p => p.asistencia === true).length;
    this.metricas.totalAsistentes = asistentes;
    this.metricas.porcentajeAsistencia = this.participantes.length > 0 ? 
      Math.round((asistentes / this.participantes.length) * 100) : 0;
  }

  // Validar fechas
  if (this.fechaFinal && this.fechaInicio && this.fechaFinal <= this.fechaInicio) {
    return next(new Error('La fecha final debe ser posterior a la fecha de inicio'));
  }

  if (this.fechaLimiteInscripcion && this.fechaInicio && this.fechaLimiteInscripcion > this.fechaInicio) {
    return next(new Error('La fecha límite de inscripción debe ser anterior a la fecha de inicio'));
  }

  next();
});

// Middleware post-save
eventoSchema.post('save', function(doc, next) {
  console.log(`✅ Evento "${doc.titulo}" guardado exitosamente`);
  next();
});

const Evento = mongoose.model('Evento', eventoSchema);

module.exports = Evento;