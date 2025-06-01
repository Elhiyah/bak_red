const mongoose = require('mongoose');

// Esquema para imágenes promocionales (más capacidad para mega eventos)
const imagenMegaSchema = new mongoose.Schema({
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
    enum: ['galeria', 'portada', 'promocional', 'banner', 'logo'],
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

// Esquema para participantes externos en mega eventos
const participanteMegaSchema = new mongoose.Schema({
  integranteId: {
    type: Number,
    required: true
  },
  tipoParticipacion: {
    type: String,
    enum: ['participante', 'voluntario', 'ponente', 'facilitador', 'invitado_especial'],
    default: 'participante'
  },
  habilidadesOfrecidas: [{
    type: String,
    trim: true
  }],
  disponibilidad: {
    type: String,
    enum: ['completa', 'parcial', 'horarios_especificos'],
    default: 'completa'
  },
  estadoParticipacion: {
    type: String,
    enum: ['en_espera', 'confirmado', 'rechazado', 'cancelado'],
    default: 'confirmado'
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
    maxlength: 1000
  }
});

// Esquema para ONGs organizadoras
const ongOrganizadoraSchema = new mongoose.Schema({
  ongId: {
    type: Number,
    required: true
  },
  rolOrganizacion: {
    type: String,
    enum: ['coordinador_principal', 'co_organizador', 'colaborador', 'apoyo'],
    default: 'colaborador'
  },
  fechaUnion: {
    type: Date,
    default: Date.now
  },
  responsabilidades: [{
    type: String,
    trim: true
  }],
  activo: {
    type: Boolean,
    default: true
  }
});

// Esquema para patrocinadores
const patrocinadorSchema = new mongoose.Schema({
  empresaId: {
    type: Number,
    required: true
  },
  tipoPatrocinio: {
    type: String,
    enum: ['principal', 'oro', 'plata', 'bronce', 'colaborador', 'auspiciador'],
    required: true
  },
  montoContribucion: {
    type: Number,
    min: 0
  },
  descripcionContribucion: {
    type: String,
    maxlength: 1000
  },
  fechaCompromiso: {
    type: Date,
    default: Date.now
  },
  estadoCompromiso: {
    type: String,
    enum: ['comprometido', 'confirmado', 'pagado', 'cancelado'],
    default: 'comprometido'
  }
});

// Esquema para ubicación (más completo para mega eventos)
const ubicacionMegaSchema = new mongoose.Schema({
  direccion: {
    type: String,
    required: true
  },
  ciudad: {
    type: String,
    default: 'Santa Cruz'
  },
  departamento: {
    type: String,
    default: 'Santa Cruz'
  },
  pais: {
    type: String,
    default: 'Bolivia'
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
  enlaceVirtual: String,
  capacidadVenue: Number,
  facilidades: [{
    type: String,
    trim: true
  }]
});

// Esquema para métricas del mega evento
const metricasMegaSchema = new mongoose.Schema({
  totalInscritos: {
    type: Number,
    default: 0
  },
  totalAsistentes: {
    type: Number,
    default: 0
  },
  totalOngsParticipantes: {
    type: Number,
    default: 0
  },
  totalPatrocinadores: {
    type: Number,
    default: 0
  },
  porcentajeAsistencia: {
    type: Number,
    default: 0
  },
  impactoEstimado: {
    personasAlcanzadas: Number,
    mediaCoverage: Number,
    socialMediaReach: Number
  },
  presupuesto: {
    totalRecaudado: Number,
    totalGastado: Number,
    balanceFinal: Number
  },
  fechaCalculoFinal: Date
});

// Esquema para historial de estados
const historialEstadoMegaSchema = new mongoose.Schema({
  estadoAnterior: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado', 'pospuesto']
  },
  estadoNuevo: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'],
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
  },
  observaciones: {
    type: String,
    maxlength: 1000
  }
});

// Esquema principal del mega evento
const megaEventoSchema = new mongoose.Schema({
  // Referencia a SQL Server - ÚNICO ÍNDICE AQUÍ
  sqlMegaEventoId: {
    type: Number,
    required: true,
    unique: true // Solo aquí, no en schema.index()
  },

  // Información básica
  titulo: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
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
  fechaFin: {
    type: Date,
    required: true
  },
  fechaLimiteInscripcion: {
    type: Date
  },
  fechaFinalizacion: Date,
  fechaCancelacion: Date,

  // Ubicación y logística
  ubicacion: {
    type: ubicacionMegaSchema,
    required: true
  },

  // Categorización y clasificación
  categoria: {
    type: String,
    enum: ['social', 'ambiental', 'educativo', 'salud', 'cultural', 'deportivo', 'tecnologico', 'otro'],
    default: 'social'
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Organización y coordinación
  ongOrganizadoraPrincipal: {
    type: Number,
    required: true
  },
  ongsOrganizadoras: [ongOrganizadoraSchema],
  
  // Patrocinadores y financiamiento
  patrocinadores: [patrocinadorSchema],

  // Capacidad y configuración
  capacidadMaxima: {
    type: Number,
    min: 1,
    max: 10000
  },
  requiereAprobacion: {
    type: Boolean,
    default: false
  },
  inscripcionAbierta: {
    type: Boolean,
    default: false
  },

  // Estado y visibilidad
  estado: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'],
    default: 'planificacion'
  },
  prioridad: {
    type: String,
    enum: ['baja', 'media', 'alta', 'critica'],
    default: 'media'
  },
  esPublico: {
    type: Boolean,
    default: false
  },
  activo: {
    type: Boolean,
    default: true
  },

  // Participantes y multimedia
  participantesExternos: [participanteMegaSchema],
  imagenesPromocionales: [imagenMegaSchema],

  // Métricas y seguimiento
  metricas: {
    type: metricasMegaSchema,
    default: () => ({})
  },

  // Historial y auditoria
  historialEstados: [historialEstadoMegaSchema],
  creadoPor: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas - SIN DUPLICAR sqlMegaEventoId
megaEventoSchema.index({ ongOrganizadoraPrincipal: 1 });
megaEventoSchema.index({ 'ongsOrganizadoras.ongId': 1 });
megaEventoSchema.index({ estado: 1 });
megaEventoSchema.index({ fechaInicio: 1 });
megaEventoSchema.index({ fechaFin: 1 });
megaEventoSchema.index({ categoria: 1 });
megaEventoSchema.index({ prioridad: 1 });
megaEventoSchema.index({ 'ubicacion.ciudad': 1 });
megaEventoSchema.index({ esPublico: 1, activo: 1 });
megaEventoSchema.index({ titulo: 'text', descripcion: 'text', tags: 'text' });

// Métodos de instancia
megaEventoSchema.methods.toSafeObject = function() {
  const megaEvento = this.toObject();
  
  // Convertir imágenes a URLs base64
  if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
    megaEvento.imagenesPromocionales = megaEvento.imagenesPromocionales.map(imagen => ({
      _id: imagen._id,
      nombre: imagen.nombre,
      descripcion: imagen.descripcion,
      tipo: imagen.tipo,
      tamaño: imagen.tamaño,
      fechaSubida: imagen.fechaSubida,
      url: `data:${imagen.mimeType};base64,${imagen.datos.toString('base64')}`
    }));
  }
  
  return megaEvento;
};

megaEventoSchema.methods.agregarParticipanteExterno = function(participanteData) {
  // Verificar si ya está registrado
  const yaRegistrado = this.participantesExternos.some(p => p.integranteId === participanteData.integranteId);
  if (yaRegistrado) {
    throw new Error('El participante ya está registrado en este mega evento');
  }

  // Verificar capacidad máxima
  if (this.capacidadMaxima && this.participantesExternos.length >= this.capacidadMaxima) {
    throw new Error('Se ha alcanzado la capacidad máxima del mega evento');
  }

  // Verificar si las inscripciones están abiertas
  if (!this.inscripcionAbierta) {
    throw new Error('Las inscripciones están cerradas para este mega evento');
  }

  this.participantesExternos.push(participanteData);
  this.metricas.totalInscritos = this.participantesExternos.length;
  
  return this.save();
};

megaEventoSchema.methods.agregarOngOrganizadora = function(ongData) {
  // Verificar si la ONG ya está registrada
  const yaRegistrada = this.ongsOrganizadoras.some(o => o.ongId === ongData.ongId && o.activo);
  if (yaRegistrada) {
    throw new Error('La ONG ya está registrada como organizadora');
  }

  this.ongsOrganizadoras.push(ongData);
  this.metricas.totalOngsParticipantes = this.ongsOrganizadoras.filter(o => o.activo).length;
  
  return this.save();
};

megaEventoSchema.methods.agregarPatrocinador = function(patrocinadorData) {
  // Verificar si la empresa ya es patrocinadora
  const yaPatrocinador = this.patrocinadores.some(p => p.empresaId === patrocinadorData.empresaId);
  if (yaPatrocinador) {
    throw new Error('La empresa ya es patrocinadora de este mega evento');
  }

  this.patrocinadores.push(patrocinadorData);
  this.metricas.totalPatrocinadores = this.patrocinadores.length;
  
  return this.save();
};

megaEventoSchema.methods.registrarAsistencia = function(integranteId, asistencia) {
  const participante = this.participantesExternos.find(p => p.integranteId === parseInt(integranteId));
  
  if (!participante) {
    throw new Error('Participante no encontrado en este mega evento');
  }

  participante.asistencia = asistencia;
  
  // Recalcular métricas
  const totalAsistentes = this.participantesExternos.filter(p => p.asistencia === true).length;
  this.metricas.totalAsistentes = totalAsistentes;
  this.metricas.porcentajeAsistencia = this.participantesExternos.length > 0 ? 
    Math.round((totalAsistentes / this.participantesExternos.length) * 100) : 0;
  
  return this.save();
};

megaEventoSchema.methods.actualizarMetricas = function() {
  // Actualizar todas las métricas
  this.metricas.totalInscritos = this.participantesExternos.length;
  this.metricas.totalAsistentes = this.participantesExternos.filter(p => p.asistencia === true).length;
  this.metricas.totalOngsParticipantes = this.ongsOrganizadoras.filter(o => o.activo).length;
  this.metricas.totalPatrocinadores = this.patrocinadores.length;
  this.metricas.porcentajeAsistencia = this.participantesExternos.length > 0 ? 
    Math.round((this.metricas.totalAsistentes / this.participantesExternos.length) * 100) : 0;
  
  // Calcular presupuesto si existe información
  if (this.patrocinadores.length > 0) {
    const totalRecaudado = this.patrocinadores
      .filter(p => p.montoContribucion && p.estadoCompromiso === 'confirmado')
      .reduce((sum, p) => sum + p.montoContribucion, 0);
    
    if (!this.metricas.presupuesto) {
      this.metricas.presupuesto = {};
    }
    this.metricas.presupuesto.totalRecaudado = totalRecaudado;
  }
  
  this.metricas.fechaCalculoFinal = new Date();
  
  return this.save();
};

// Métodos estáticos
megaEventoSchema.statics.buscar = function(termino, filtros = {}) {
  const query = {
    activo: true,
    esPublico: true,
    estado: { $in: ['convocatoria', 'organizacion'] },
    $or: [
      { titulo: { $regex: termino, $options: 'i' } },
      { descripcion: { $regex: termino, $options: 'i' } },
      { tags: { $in: [new RegExp(termino, 'i')] } }
    ]
  };

  if (filtros.categoria) query.categoria = filtros.categoria;
  if (filtros.ciudad) query['ubicacion.ciudad'] = filtros.ciudad;
  if (filtros.fechaDesde || filtros.fechaHasta) {
    query.fechaInicio = {};
    if (filtros.fechaDesde) query.fechaInicio.$gte = new Date(filtros.fechaDesde);
    if (filtros.fechaHasta) query.fechaInicio.$lte = new Date(filtros.fechaHasta);
  }

  return this.find(query).sort({ fechaInicio: 1 });
};

megaEventoSchema.statics.megaEventosProximos = function(dias = 60) {
  const ahora = new Date();
  const fechaLimite = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);

  return this.find({
    activo: true,
    esPublico: true,
    estado: { $in: ['convocatoria', 'organizacion'] },
    fechaInicio: {
      $gte: ahora,
      $lte: fechaLimite
    }
  }).sort({ fechaInicio: 1 });
};

// Middleware pre-save
megaEventoSchema.pre('save', function(next) {
  // Validar fechas
  if (this.fechaFin && this.fechaInicio && this.fechaFin <= this.fechaInicio) {
    return next(new Error('La fecha de fin debe ser posterior a la fecha de inicio'));
  }

  // Validar duración máxima
  if (this.fechaFin && this.fechaInicio) {
    const diferenciaDias = (this.fechaFin - this.fechaInicio) / (1000 * 60 * 60 * 24);
    if (diferenciaDias > 30) {
      return next(new Error('La duración del mega evento no puede exceder 30 días'));
    }
  }

  // Actualizar métricas automáticamente
  if (this.isModified('participantesExternos')) {
    this.metricas.totalInscritos = this.participantesExternos.filter(
      p => p.estadoParticipacion === 'confirmado'
    ).length;
    
    const asistentes = this.participantesExternos.filter(p => p.asistencia === true).length;
    this.metricas.totalAsistentes = asistentes;
    this.metricas.porcentajeAsistencia = this.metricas.totalInscritos > 0 ? 
      Math.round((asistentes / this.metricas.totalInscritos) * 100) : 0;
  }

  if (this.isModified('ongsOrganizadoras')) {
    this.metricas.totalOngsParticipantes = this.ongsOrganizadoras.filter(o => o.activo).length;
  }

  if (this.isModified('patrocinadores')) {
    this.metricas.totalPatrocinadores = this.patrocinadores.length;
  }

  next();
});

// Middleware post-save
megaEventoSchema.post('save', function(doc, next) {
  console.log(`✅ Mega evento "${doc.titulo}" guardado exitosamente`);
  next();
});

const MegaEvento = mongoose.model('MegaEvento', megaEventoSchema);

module.exports = MegaEvento;
    