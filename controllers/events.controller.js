const { poolPromise } = require('../config/db');
const Evento = require('../models/evento.model');
const multer = require('multer');
const sharp = require('sharp');

// Estados válidos del evento
const ESTADOS_EVENTO = {
  BORRADOR: 'borrador',
  PUBLICADO: 'publicado', 
  EN_CURSO: 'en_curso',
  FINALIZADO: 'finalizado',
  SUSPENDIDO: 'suspendido',
  CANCELADO: 'cancelado'
};

// Transiciones válidas entre estados
const TRANSICIONES_VALIDAS = {
  [ESTADOS_EVENTO.BORRADOR]: [ESTADOS_EVENTO.PUBLICADO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.PUBLICADO]: [ESTADOS_EVENTO.EN_CURSO, ESTADOS_EVENTO.SUSPENDIDO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.EN_CURSO]: [ESTADOS_EVENTO.FINALIZADO, ESTADOS_EVENTO.SUSPENDIDO],
  [ESTADOS_EVENTO.SUSPENDIDO]: [ESTADOS_EVENTO.PUBLICADO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.FINALIZADO]: [],
  [ESTADOS_EVENTO.CANCELADO]: []
};

// Configuración de Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Procesar y optimizar imágenes
const processImages = async (files) => {
  if (!files || files.length === 0) return [];

  const processedImages = [];
  
  for (const file of files) {
    try {
      const processedBuffer = await sharp(file.buffer)
        .resize(800, 600, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 80,
          progressive: true
        })
        .toBuffer();

      processedImages.push({
        nombre: file.originalname,
        descripcion: '',
        tipo: 'galeria',
        datos: processedBuffer,
        mimeType: 'image/jpeg',
        tamaño: processedBuffer.length
      });
    } catch (error) {
      console.error('Error procesando imagen:', error);
      throw new Error(`Error procesando la imagen ${file.originalname}`);
    }
  }
  
  return processedImages;
};

// Validar permisos de ONG
const validarONG = async (ongId) => {
  const pool = await poolPromise;
  const userResult = await pool.request()
    .input('id_usuario', ongId)
    .query(`
      SELECT tipo_usuario FROM usuarios
      WHERE id_usuario = @id_usuario AND activo = 1
    `);

  const user = userResult.recordset[0];
  return user && user.tipo_usuario === 'ONG';
};

// Obtener empresas disponibles
const obtenerEmpresas = async () => {
  const pool = await poolPromise;
  const empresasResult = await pool.request()
    .query(`
      SELECT e.empresaID, e.nombre_empresa, u.correo, u.nombre_usuario
      FROM empresas e
      INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
      WHERE u.activo = 1 AND u.tipo_usuario = 'Empresa'
      ORDER BY e.nombre_empresa
    `);
  
  return empresasResult.recordset;
};

// Validar cambio de estado
const validarCambioEstado = async (evento, nuevoEstado) => {
  const ahora = new Date();
  
  switch (nuevoEstado) {
    case ESTADOS_EVENTO.PUBLICADO:
      if (!evento.titulo || !evento.fechaInicio || !evento.locacion) {
        return {
          valido: false,
          error: 'El evento debe tener título, fecha de inicio y ubicación para ser publicado'
        };
      }
      
      if (evento.fechaInicio <= ahora) {
        return {
          valido: false,
          error: 'No se puede publicar un evento con fecha de inicio pasada'
        };
      }
      break;
      
    case ESTADOS_EVENTO.EN_CURSO:
      if (evento.fechaInicio > ahora) {
        return {
          valido: false,
          error: 'El evento no puede estar en curso antes de su fecha de inicio'
        };
      }
      
      if (evento.fechaFinal && evento.fechaFinal < ahora) {
        return {
          valido: false,
          error: 'El evento no puede estar en curso después de su fecha final'
        };
      }
      break;
      
    case ESTADOS_EVENTO.FINALIZADO:
      const fechaFin = evento.fechaFinal || evento.fechaInicio;
      if (fechaFin > ahora) {
        return {
          valido: false,
          error: 'No se puede finalizar un evento que aún no ha terminado'
        };
      }
      break;
      
    case ESTADOS_EVENTO.CANCELADO:
      if (evento.participantes.length > 0) {
        console.log(`⚠️ Cancelando evento con ${evento.participantes.length} participantes`);
      }
      break;
  }
  
  return { valido: true };
};

// Ejecutar acciones por estado
const ejecutarAccionesEstado = async (evento, nuevoEstado) => {
  switch (nuevoEstado) {
    case ESTADOS_EVENTO.PUBLICADO:
      evento.publico = true;
      break;
      
    case ESTADOS_EVENTO.EN_CURSO:
      evento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_EVENTO.FINALIZADO:
      evento.metricas = await calcularMetricasFinales(evento);
      evento.fechaFinalizacion = new Date();
      break;
      
    case ESTADOS_EVENTO.CANCELADO:
      evento.publico = false;
      evento.inscripcionAbierta = false;
      evento.fechaCancelacion = new Date();
      break;
      
    case ESTADOS_EVENTO.SUSPENDIDO:
      evento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_EVENTO.BORRADOR:
      evento.publico = false;
      break;
  }
};

// Calcular métricas finales
const calcularMetricasFinales = async (evento) => {
  const totalInscritos = evento.participantes.length;
  const totalAsistentes = evento.participantes.filter(p => p.asistencia === true).length;
  const porcentajeAsistencia = totalInscritos > 0 ? 
    Math.round((totalAsistentes / totalInscritos) * 100) : 0;

  return {
    totalInscritos,
    totalAsistentes,
    porcentajeAsistencia,
    fechaCalculoFinal: new Date(),
    capacidadUtilizada: evento.capacidadMaxima ? 
      Math.round((totalInscritos / evento.capacidadMaxima) * 100) : null
  };
};

// ================== FUNCIONES PRINCIPALES ==================

// CREATE - Crear evento
const createEvent = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      fechaInicio,
      fechaFinal,
      locacion,
      tipoEvento,
      ongId,
      capacidadMaxima,
      inscripcionAbierta,
      fechaLimiteInscripcion,
      patrocinadores,
      auspiciadores,
      estado = ESTADOS_EVENTO.BORRADOR
    } = req.body;

    console.log('📝 Creando evento:', { titulo, ongId, estado });

    // Validaciones básicas
    if (!titulo || !fechaInicio || !tipoEvento || !ongId || !locacion) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos requeridos: titulo, fechaInicio, tipoEvento, ongId, locacion' 
      });
    }

    // Validar estado
    if (!Object.values(ESTADOS_EVENTO).includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    // Validar ONG
    const esONG = await validarONG(ongId);
    if (!esONG) {
      return res.status(403).json({ 
        success: false,
        error: 'Solo las ONGs pueden crear eventos' 
      });
    }

    // Validar fechas
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinalDate = fechaFinal ? new Date(fechaFinal) : null;
    
    if (fechaFinalDate && fechaFinalDate <= fechaInicioDate) {
      return res.status(400).json({
        success: false,
        error: 'La fecha final debe ser posterior a la fecha de inicio'
      });
    }

    // Procesar empresas participantes
    let patrocinadoresList = [];
    let auspiciadoresList = [];
    
    if (patrocinadores) {
      patrocinadoresList = Array.isArray(patrocinadores) ? 
        patrocinadores : JSON.parse(patrocinadores || '[]');
    }
    
    if (auspiciadores) {
      auspiciadoresList = Array.isArray(auspiciadores) ? 
        auspiciadores : JSON.parse(auspiciadores || '[]');
    }

    // Transacción SQL Server
    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Crear evento en SQL Server
      const sqlResult = await transaction.request()
        .input('Tittulo', titulo)
        .input('Descripcion', descripcion || null)
        .input('F_Inicio', fechaInicioDate)
        .input('F_final', fechaFinalDate)
        .input('Locacion', typeof locacion === 'string' ? locacion : locacion.direccion)
        .input('ong_id', parseInt(ongId))
        .input('Tipo_evento', tipoEvento)
        .query(`
          INSERT INTO Eventos (Tittulo, Descripcion, F_Inicio, F_final, Locacion, ong_id, Tipo_evento)
          OUTPUT INSERTED.EventoID
          VALUES (@Tittulo, @Descripcion, @F_Inicio, @F_final, @Locacion, @ong_id, @Tipo_evento)
        `);

      const sqlEventoId = sqlResult.recordset[0].EventoID;

      // Registrar patrocinadores
      for (const empresaId of patrocinadoresList) {
        await transaction.request()
          .input('EventoID', sqlEventoId)
          .input('EmpresaID', parseInt(empresaId))
          .query(`INSERT INTO evento_patrocinadores (EventoID, EmpresaID) VALUES (@EventoID, @EmpresaID)`);
      }

      // Registrar auspiciadores
      for (const empresaId of auspiciadoresList) {
        await transaction.request()
          .input('EventoID', sqlEventoId)
          .input('EmpresaID', parseInt(empresaId))
          .query(`INSERT INTO evento_Auspiciadores (EventoID, EmpresaID) VALUES (@EventoID, @EmpresaID)`);
      }

      // Procesar imágenes
      let imagenesPromocionales = [];
      if (req.files && req.files.length > 0) {
        imagenesPromocionales = await processImages(req.files);
      }

      // Crear en MongoDB
      const eventoData = {
        sqlEventoId,
        titulo,
        descripcion: descripcion || '',
        fechaInicio: fechaInicioDate,
        fechaFinal: fechaFinalDate,
        locacion: typeof locacion === 'string' 
          ? { direccion: locacion, ciudad: 'Santa Cruz', tipoLocacion: 'presencial' }
          : locacion,
        tipoEvento,
        ongId: parseInt(ongId),
        capacidadMaxima: capacidadMaxima ? parseInt(capacidadMaxima) : null,
        inscripcionAbierta: inscripcionAbierta !== false,
        fechaLimiteInscripcion: fechaLimiteInscripcion ? new Date(fechaLimiteInscripcion) : null,
        imagenesPromocionales,
        estado,
        publico: estado === ESTADOS_EVENTO.PUBLICADO,
        activo: true,
        creadoPor: parseInt(ongId),
        empresasPatrocinadoras: patrocinadoresList.map(id => parseInt(id)),
        empresasAuspiciadoras: auspiciadoresList.map(id => parseInt(id)),
        metricas: {
          totalInscritos: 0,
          totalAsistentes: 0,
          porcentajeAsistencia: 0
        },
        participantes: [],
        historialEstados: [{
          estadoAnterior: null,
          estadoNuevo: estado,
          fecha: new Date(),
          motivo: 'Creación del evento',
          usuarioId: parseInt(ongId)
        }]
      };

      const nuevoEvento = new Evento(eventoData);
      await nuevoEvento.save();

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Evento creado exitosamente',
        evento: {
          id: nuevoEvento._id,
          sqlEventoId,
          titulo: nuevoEvento.titulo,
          estado: nuevoEvento.estado,
          fechaInicio: nuevoEvento.fechaInicio,
          totalImagenes: nuevoEvento.imagenesPromocionales.length,
          totalPatrocinadores: patrocinadoresList.length,
          totalAuspiciadores: auspiciadoresList.length
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('💥 Error creando evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al crear evento'
    });
  }
};

// READ - Obtener todos los eventos
const getAllEvents = async (req, res) => {
  try {
    const { tipo, ciudad, estado = 'publicado', pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      estado, 
      publico: true, 
      activo: true,
      fechaInicio: { $gte: new Date() }
    };
    
    if (tipo) filtros.tipoEvento = tipo;
    if (ciudad) filtros['locacion.ciudad'] = ciudad;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: 1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    // Obtener información de empresas
    const pool = await poolPromise;
    const eventosConEmpresas = await Promise.all(eventos.map(async (evento) => {
      const patrocinadores = await pool.request()
        .input('EventoID', evento.sqlEventoId)
        .query(`
          SELECT e.empresaID, e.nombre_empresa, u.nombre_usuario
          FROM evento_patrocinadores ep
          INNER JOIN empresas e ON ep.EmpresaID = e.empresaID
          INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
          WHERE ep.EventoID = @EventoID
        `);

      const auspiciadores = await pool.request()
        .input('EventoID', evento.sqlEventoId)
        .query(`
          SELECT e.empresaID, e.nombre_empresa, u.nombre_usuario
          FROM evento_Auspiciadores ea
          INNER JOIN empresas e ON ea.EmpresaID = e.empresaID
          INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
          WHERE ea.EventoID = @EventoID
        `);

      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = evento.imagenesPromocionales[0];
        evento.imagenPrincipal = {
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      
      delete evento.imagenesPromocionales;

      return {
        ...evento,
        empresasPatrocinadoras: patrocinadores.recordset,
        empresasAuspiciadoras: auspiciadores.recordset
      };
    }));

    res.json({
      success: true,
      eventos: eventosConEmpresas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos'
    });
  }
};

// READ - Obtener evento por ID
const getEventById = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const evento = await Evento.findById(eventoId);

    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    // Obtener empresas participantes
    const pool = await poolPromise;
    
    const patrocinadores = await pool.request()
      .input('EventoID', evento.sqlEventoId)
      .query(`
        SELECT e.empresaID, e.nombre_empresa, u.nombre_usuario, u.correo
        FROM evento_patrocinadores ep
        INNER JOIN empresas e ON ep.EmpresaID = e.empresaID
        INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
        WHERE ep.EventoID = @EventoID
      `);

    const auspiciadores = await pool.request()
      .input('EventoID', evento.sqlEventoId)
      .query(`
        SELECT e.empresaID, e.nombre_empresa, u.nombre_usuario, u.correo
        FROM evento_Auspiciadores ea
        INNER JOIN empresas e ON ea.EmpresaID = e.empresaID
        INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
        WHERE ea.EventoID = @EventoID
      `);

    const eventoCompleto = evento.toSafeObject();
    eventoCompleto.empresasPatrocinadoras = patrocinadores.recordset;
    eventoCompleto.empresasAuspiciadoras = auspiciadores.recordset;

    res.json({
      success: true,
      evento: eventoCompleto
    });

  } catch (error) {
    console.error('Error obteniendo evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener evento'
    });
  }
};

// READ - Obtener eventos de una ONG
const getOngEvents = async (req, res) => {
  try {
    const { ongId } = req.params;
    const { estado, tipo, pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      ongId: parseInt(ongId),
      activo: true 
    };
    
    if (estado) filtros.estado = estado;
    if (tipo) filtros.tipoEvento = tipo;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = evento.imagenesPromocionales[0];
        evento.imagenPrincipal = {
          _id: imagenPrincipal._id,
          nombre: imagenPrincipal.nombre,
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });

    res.json({
      success: true,
      eventos: eventosConMiniaturas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos de ONG:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos'
    });
  }
};

// UPDATE - Actualizar evento
const updateEvent = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para editar este evento'
      });
    }

    // Actualizar campos permitidos
    const camposPermitidos = [
      'titulo', 'descripcion', 'fechaInicio', 'fechaFinal', 
      'locacion', 'tipoEvento', 'capacidadMaxima', 
      'inscripcionAbierta', 'fechaLimiteInscripcion', 'estado'
    ];

    let huboCambios = false;

    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        if (campo === 'fechaInicio' || campo === 'fechaFinal' || campo === 'fechaLimiteInscripcion') {
          evento[campo] = req.body[campo] ? new Date(req.body[campo]) : null;
        } else if (campo === 'locacion') {
          if (typeof req.body[campo] === 'string') {
            evento.locacion.direccion = req.body[campo];
          } else {
            evento.locacion = { ...evento.locacion, ...req.body[campo] };
          }
        } else {
          evento[campo] = req.body[campo];
        }
        huboCambios = true;
      }
    });

    // Procesar nuevas imágenes
    if (req.files && req.files.length > 0) {
      if (evento.imagenesPromocionales.length + req.files.length > 10) {
        return res.status(400).json({
          success: false,
          error: 'Máximo 10 imágenes por evento'
        });
      }

      const nuevasImagenes = await processImages(req.files);
      evento.imagenesPromocionales.push(...nuevasImagenes);
      huboCambios = true;
    }

    if (!huboCambios) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron cambios para actualizar'
      });
    }

    await evento.save();

    // Sincronizar con SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('EventoID', evento.sqlEventoId)
          .input('Tittulo', evento.titulo)
          .input('Descripcion', evento.descripcion)
          .input('F_Inicio', evento.fechaInicio)
          .input('F_final', evento.fechaFinal)
          .input('Locacion', evento.locacion.direccion)
          .input('Tipo_evento', evento.tipoEvento)
          .query(`
            UPDATE Eventos 
            SET Tittulo = @Tittulo, Descripcion = @Descripcion, 
                F_Inicio = @F_Inicio, F_final = @F_final, 
                Locacion = @Locacion, Tipo_evento = @Tipo_evento
            WHERE EventoID = @EventoID
          `);
      } catch (sqlError) {
        console.error('Error sincronizando con SQL Server:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Evento actualizado exitosamente',
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estado: evento.estado,
        totalImagenes: evento.imagenesPromocionales.length
      }
    });

  } catch (error) {
    console.error('Error actualizando evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar evento'
    });
  }
};

// DELETE - Eliminar evento
const deleteEvent = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar este evento'
      });
    }

    // Verificar participantes
    if (evento.participantes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar un evento con participantes registrados',
        sugerencia: 'Use el estado "cancelado" para cancelar el evento'
      });
    }

    // Eliminar de SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        const transaction = pool.transaction();
        await transaction.begin();

        await transaction.request()
          .input('EventoID', evento.sqlEventoId)
          .query('DELETE FROM evento_patrocinadores WHERE EventoID = @EventoID');

        await transaction.request()
          .input('EventoID', evento.sqlEventoId)
          .query('DELETE FROM evento_Auspiciadores WHERE EventoID = @EventoID');

        await transaction.request()
          .input('EventoID', evento.sqlEventoId)
          .query('DELETE FROM Eventos WHERE EventoID = @EventoID');

        await transaction.commit();
      } catch (sqlError) {
        console.error('Error eliminando de SQL Server:', sqlError);
      }
    }

    // Soft delete en MongoDB
    evento.activo = false;
    evento.estado = 'cancelado';
    await evento.save();

    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar evento'
    });
  }
};

// Registrar participante
const registerParticipant = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { integranteId, tipoParticipante = 'participante' } = req.body;

    if (!integranteId) {
      return res.status(400).json({
        success: false,
        error: 'El ID del integrante es requerido'
      });
    }

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    // Verificar integrante
    const pool = await poolPromise;
    const integranteCheck = await pool.request()
      .input('integrante_id', integranteId)
      .query('SELECT 1 FROM integrantes_externos WHERE id_usuario = @integrante_id');

    if (integranteCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integrante no encontrado'
      });
    }

    const participanteData = {
      integranteId: parseInt(integranteId),
      tipoParticipante
    };

    await evento.agregarParticipante(participanteData);

    // Sincronizar con SQL Server
    if (evento.sqlEventoId) {
      try {
        await pool.request()
          .input('evento_id', evento.sqlEventoId)
          .input('integrante_id', integranteId)
          .input('tipo_participante', tipoParticipante)
          .query(`
            INSERT INTO evento_integrantes_externos 
            (evento_id, integrante_externo_id, asistencia, tipo_participante)
            VALUES (@evento_id, @integrante_id, 0, @tipo_participante)
          `);
      } catch (sqlError) {
        console.error('Error sincronizando participante:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Participante registrado exitosamente',
      totalParticipantes: evento.participantes.length
    });

  } catch (error) {
    console.error('Error registrando participante:', error);
    
    if (error.message.includes('ya está registrado') || 
        error.message.includes('capacidad máxima') ||
        error.message.includes('inscripciones están cerradas')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error al registrar participante'
    });
  }
};

// Registrar asistencia
const registerAttendance = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { integranteId, asistencia, ongId } = req.body;

    if (typeof asistencia !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'El campo asistencia debe ser true o false'
      });
    }

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para registrar asistencia en este evento'
      });
    }

    await evento.registrarAsistencia(integranteId, asistencia);

    // Sincronizar con SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('evento_id', evento.sqlEventoId)
          .input('integrante_id', integranteId)
          .input('asistencia', asistencia ? 1 : 0)
          .query(`
            UPDATE evento_integrantes_externos 
            SET asistencia = @asistencia
            WHERE evento_id = @evento_id AND integrante_externo_id = @integrante_id
          `);
      } catch (sqlError) {
        console.error('Error sincronizando asistencia:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      metricas: {
        totalAsistentes: evento.metricas.totalAsistentes,
        porcentajeAsistencia: evento.metricas.porcentajeAsistencia
      }
    });

  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al registrar asistencia'
    });
  }
};

// Eliminar imagen del evento
const deleteEventImage = async (req, res) => {
  try {
    const { eventoId, imagenId } = req.params;
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar imágenes de este evento'
      });
    }

    const imagenIndex = evento.imagenesPromocionales.findIndex(
      img => img._id.toString() === imagenId
    );

    if (imagenIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Imagen no encontrada'
      });
    }

    evento.imagenesPromocionales.splice(imagenIndex, 1);
    await evento.save();

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      totalImagenes: evento.imagenesPromocionales.length
    });

  } catch (error) {
    console.error('Error eliminando imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar imagen'
    });
  }
};

// Estadísticas del evento
const getEventStatistics = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver estadísticas de este evento'
      });
    }

    const participantesPorTipo = evento.participantes.reduce((acc, p) => {
      acc[p.tipoParticipante] = (acc[p.tipoParticipante] || 0) + 1;
      return acc;
    }, {});

    const estadisticas = {
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        fechaInicio: evento.fechaInicio,
        estado: evento.estado
      },
      participacion: {
        totalInscritos: evento.metricas.totalInscritos,
        totalAsistentes: evento.metricas.totalAsistentes,
        porcentajeAsistencia: evento.metricas.porcentajeAsistencia,
        participantesPorTipo,
        capacidadMaxima: evento.capacidadMaxima,
        espaciosDisponibles: evento.capacidadMaxima ? 
          evento.capacidadMaxima - evento.metricas.totalInscritos : null
      },
      contenido: {
        totalImagenes: evento.imagenesPromocionales.length,
        tiposImagenes: evento.imagenesPromocionales.reduce((acc, img) => {
          acc[img.tipo] = (acc[img.tipo] || 0) + 1;
          return acc;
        }, {})
      },
      empresas: {
        totalPatrocinadoras: evento.empresasPatrocinadoras.length,
        totalAuspiciadoras: evento.empresasAuspiciadoras.length
      }
    };

    res.json({
      success: true,
      estadisticas
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
};

// Obtener empresas disponibles
const getAvailableCompanies = async (req, res) => {
  try {
    const empresas = await obtenerEmpresas();
    
    res.json({
      success: true,
      empresas: empresas.map(empresa => ({
        id: empresa.empresaID,
        nombre: empresa.nombre_empresa,
        correo: empresa.correo,
        nombreUsuario: empresa.nombre_usuario
      }))
    });
  } catch (error) {
    console.error('Error obteniendo empresas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empresas'
    });
  }
};

// Buscar eventos por texto
const searchEvents = async (req, res) => {
  try {
    const { termino } = req.params;
    const { tipo, ciudad, fechaDesde, fechaHasta, limite = 20 } = req.query;
    
    console.log(`🔍 Búsqueda de eventos: "${termino}"`);
    
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
    
    if (tipo) query.tipoEvento = tipo;
    if (ciudad) query['locacion.ciudad'] = ciudad;
    if (fechaDesde || fechaHasta) {
      query.fechaInicio = {};
      if (fechaDesde) query.fechaInicio.$gte = new Date(fechaDesde);
      if (fechaHasta) query.fechaInicio.$lte = new Date(fechaHasta);
    }
    
    const eventos = await Evento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();
    
    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });
    
    res.json({
      success: true,
      termino,
      eventos: eventosConMiniaturas,
      total: eventosConMiniaturas.length,
      filtrosAplicados: { tipo, ciudad, fechaDesde, fechaHasta }
    });
  } catch (error) {
    console.error('Error buscando eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error en la búsqueda de eventos'
    });
  }
};

// Obtener eventos próximos
const getUpcomingEvents = async (req, res) => {
  try {
    const { dias = 30 } = req.query;
    
    console.log(`📅 Obteniendo eventos próximos (${dias} días)`);
    
    const eventos = await Evento.eventosProximos(parseInt(dias));
    
    const eventosConMiniaturas = eventos.map(evento => {
      const eventoObj = evento.toObject();
      if (eventoObj.imagenesPromocionales && eventoObj.imagenesPromocionales.length > 0) {
        eventoObj.imagenPrincipal = {
          url: `data:${eventoObj.imagenesPromocionales[0].mimeType};base64,${eventoObj.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoObj.imagenesPromocionales;
      return eventoObj;
    });
    
    res.json({
      success: true,
      eventos: eventosConMiniaturas,
      diasConsiderados: parseInt(dias),
      total: eventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo eventos próximos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos próximos'
    });
  }
};

// Obtener eventos por tipo
const getEventsByType = async (req, res) => {
  try {
    const { tipoEvento } = req.params;
    const { ciudad, limite = 10 } = req.query;
    
    console.log(`🏷️ Obteniendo eventos de tipo: ${tipoEvento}`);
    
    const query = {
      tipoEvento,
      activo: true,
      publico: true,
      estado: 'publicado',
      fechaInicio: { $gte: new Date() }
    };
    
    if (ciudad) query['locacion.ciudad'] = ciudad;
    
    const eventos = await Evento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();
    
    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });
    
    res.json({
      success: true,
      tipoEvento,
      eventos: eventosConMiniaturas,
      total: eventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo eventos por tipo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos por tipo'
    });
  }
};

// Obtener participantes del evento
const getEventParticipants = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;
    
    const evento = await Evento.findById(eventoId);
    
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }
    
    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver participantes de este evento'
      });
    }
    
    res.json({
      success: true,
      participantes: evento.participantes,
      totalParticipantes: evento.participantes.length,
      metricas: evento.metricas
    });
  } catch (error) {
    console.error('Error obteniendo participantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener participantes'
    });
  }
};

// Estadísticas generales del sistema
const getSystemStatistics = async (req, res) => {
  try {
    const stats = await Evento.aggregate([
      {
        $group: {
          _id: null,
          totalEventos: { $sum: 1 },
          eventosActivos: {
            $sum: { $cond: [{ $eq: ['$estado', 'publicado'] }, 1, 0] }
          },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalImagenes: { $sum: { $size: '$imagenesPromocionales' } }
        }
      }
    ]);
    
    const eventosPorTipo = await Evento.aggregate([
      { $match: { activo: true, estado: 'publicado' } },
      { $group: { _id: '$tipoEvento', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      estadisticas: stats[0] || {
        totalEventos: 0,
        eventosActivos: 0,
        totalParticipantes: 0,
        totalImagenes: 0
      },
      eventosPorTipo,
      fecha: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas del sistema'
    });
  }
};

// ================ NUEVAS FUNCIONES ================

// Cambiar estado del evento
const changeEventStatus = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { nuevoEstado, ongId, motivo } = req.body;

    if (!Object.values(ESTADOS_EVENTO).includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para cambiar el estado de este evento'
      });
    }

    // Validar transición
    const estadoActual = evento.estado;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    
    if (!transicionesPermitidas.includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: `No se puede cambiar de "${estadoActual}" a "${nuevoEstado}"`,
        transicionesPermitidas
      });
    }

    // Validaciones específicas
    const validacionesEspecificas = await validarCambioEstado(evento, nuevoEstado);
    if (!validacionesEspecificas.valido) {
      return res.status(400).json({
        success: false,
        error: validacionesEspecificas.error
      });
    }

    // Actualizar estado
    const estadoAnterior = evento.estado;
    evento.estado = nuevoEstado;
    
    if (!evento.historialEstados) {
      evento.historialEstados = [];
    }
    
    evento.historialEstados.push({
      estadoAnterior,
      estadoNuevo: nuevoEstado,
      fecha: new Date(),
      motivo: motivo || `Cambio de ${estadoAnterior} a ${nuevoEstado}`,
      usuarioId: parseInt(ongId)
    });

    await ejecutarAccionesEstado(evento, nuevoEstado);
    await evento.save();

    res.json({
      success: true,
      message: `Estado cambiado exitosamente de "${estadoAnterior}" a "${nuevoEstado}"`,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoAnterior,
        estadoActual: nuevoEstado,
        fecha: new Date(),
        publico: evento.publico,
        inscripcionAbierta: evento.inscripcionAbierta
      }
    });

  } catch (error) {
    console.error('Error cambiando estado del evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar estado del evento'
    });
  }
};

// Obtener eventos por estado
const getEventsByStatus = async (req, res) => {
  try {
    const { estado } = req.params;
    const { ongId, pagina = 1, limite = 10 } = req.query;

    if (!Object.values(ESTADOS_EVENTO).includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    const filtros = { 
      estado,
      activo: true 
    };
    
    if (ongId) {
      filtros.ongId = parseInt(ongId);
    }

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });

    res.json({
      success: true,
      estado,
      eventos: eventosConMiniaturas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos por estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos por estado'
    });
  }
};

// Estadísticas de estados
const getStatusStatistics = async (req, res) => {
  try {
    const { ongId } = req.query;

    const filtros = { activo: true };
    if (ongId) {
      filtros.ongId = parseInt(ongId);
    }

    const estadisticas = await Evento.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 },
          ultimaActualizacion: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const resultados = {};
    Object.values(ESTADOS_EVENTO).forEach(estado => {
      resultados[estado] = 0;
    });

    estadisticas.forEach(stat => {
      resultados[stat._id] = stat.count;
    });

    res.json({
      success: true,
      estadisticas: resultados,
      total: Object.values(resultados).reduce((sum, count) => sum + count, 0),
      fecha: new Date()
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de estados'
    });
  }
};

// Eventos de una empresa
const getCompanyEvents = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { tipo = 'todos', estado, limite = 10 } = req.query;

    const pool = await poolPromise;
    let eventos = [];

    if (tipo === 'patrocinador' || tipo === 'todos') {
      const patrocinados = await pool.request()
        .input('empresaId', empresaId)
        .query(`
          SELECT e.EventoID, e.Tittulo, e.F_Inicio, e.Locacion, 'patrocinador' as tipoParticipacion
          FROM evento_patrocinadores ep
          INNER JOIN Eventos e ON ep.EventoID = e.EventoID
          WHERE ep.EmpresaID = @empresaId
        `);
      eventos.push(...patrocinados.recordset);
    }

    if (tipo === 'auspiciador' || tipo === 'todos') {
      const auspiciados = await pool.request()
        .input('empresaId', empresaId)
        .query(`
          SELECT e.EventoID, e.Tittulo, e.F_Inicio, e.Locacion, 'auspiciador' as tipoParticipacion
          FROM evento_Auspiciadores ea
          INNER JOIN Eventos e ON ea.EventoID = e.EventoID
          WHERE ea.EmpresaID = @empresaId
        `);
      eventos.push(...auspiciados.recordset);
    }

    const sqlEventoIds = eventos.map(e => e.EventoID);
    let filtrosMongo = { 
      sqlEventoId: { $in: sqlEventoIds },
      activo: true 
    };
    
    if (estado) {
      filtrosMongo.estado = estado;
    }

    const eventosCompletos = await Evento.find(filtrosMongo)
      .limit(parseInt(limite))
      .lean();

    const eventosCombinados = eventosCompletos.map(eventoMongo => {
      const eventoSQL = eventos.find(e => e.EventoID === eventoMongo.sqlEventoId);
      
      if (eventoMongo.imagenesPromocionales && eventoMongo.imagenesPromocionales.length > 0) {
        eventoMongo.imagenPrincipal = {
          url: `data:${eventoMongo.imagenesPromocionales[0].mimeType};base64,${eventoMongo.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoMongo.imagenesPromocionales;
      
      return {
        ...eventoMongo,
        tipoParticipacion: eventoSQL.tipoParticipacion
      };
    });

    res.json({
      success: true,
      empresaId: parseInt(empresaId),
      tipoConsultado: tipo,
      eventos: eventosCombinados,
      total: eventosCombinados.length
    });

  } catch (error) {
    console.error('Error obteniendo eventos de empresa:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos de la empresa'
    });
  }
};

// Eventos de participación de un integrante
const getUserParticipationEvents = async (req, res) => {
  try {
    const { integranteId } = req.params;
    const { estado, conAsistencia, limite = 10 } = req.query;

    const pool = await poolPromise;
    let query = `
      SELECT e.EventoID, e.Tittulo, e.F_Inicio, e.Locacion, 
             eie.asistencia, eie.tipo_participante, eie.fecha_registro
      FROM evento_integrantes_externos eie
      INNER JOIN Eventos e ON eie.evento_id = e.EventoID
      WHERE eie.integrante_externo_id = @integranteId
    `;

    if (conAsistencia === 'true') {
      query += ' AND eie.asistencia = 1';
    } else if (conAsistencia === 'false') {
      query += ' AND eie.asistencia = 0';
    }

    query += ' ORDER BY e.F_Inicio DESC';

    const result = await pool.request()
      .input('integranteId', integranteId)
      .query(query);

    const sqlEventoIds = result.recordset.map(e => e.EventoID);
    let filtrosMongo = { 
      sqlEventoId: { $in: sqlEventoIds },
      activo: true 
    };
    
    if (estado) {
      filtrosMongo.estado = estado;
    }

    const eventosCompletos = await Evento.find(filtrosMongo)
      .limit(parseInt(limite))
      .lean();

    const eventosCombinados = eventosCompletos.map(eventoMongo => {
      const eventoSQL = result.recordset.find(e => e.EventoID === eventoMongo.sqlEventoId);
      
      if (eventoMongo.imagenesPromocionales && eventoMongo.imagenesPromocionales.length > 0) {
        eventoMongo.imagenPrincipal = {
          url: `data:${eventoMongo.imagenesPromocionales[0].mimeType};base64,${eventoMongo.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoMongo.imagenesPromocionales;
      
      return {
        ...eventoMongo,
        participacion: {
          asistencia: eventoSQL.asistencia,
          tipoParticipante: eventoSQL.tipo_participante,
          fechaRegistro: eventoSQL.fecha_registro
        }
      };
    });

    res.json({
      success: true,
      integranteId: parseInt(integranteId),
      eventos: eventosCombinados,
      total: eventosCombinados.length,
      filtros: { estado, conAsistencia }
    });

  } catch (error) {
    console.error('Error obteniendo eventos del integrante:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos del integrante'
    });
  }
};

// Obtener transiciones disponibles
const getAvailableTransitions = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver transiciones de este evento'
      });
    }

    const estadoActual = evento.estado;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    
    const transicionesValidas = [];
    for (const estado of transicionesPermitidas) {
      const validacion = await validarCambioEstado(evento, estado);
      transicionesValidas.push({
        estado,
        valido: validacion.valido,
        razon: validacion.error || 'Transición válida'
      });
    }

    res.json({
      success: true,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoActual
      },
      transiciones: transicionesValidas,
      historial: evento.historialEstados || []
    });

  } catch (error) {
    console.error('Error obteniendo transiciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener transiciones disponibles'
    });
  }
};

// Historial de estados del evento
const getEventStatusHistory = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver historial de este evento'
      });
    }

    const historial = evento.historialEstados || [];
    
    const pool = await poolPromise;
    const historialEnriquecido = await Promise.all(historial.map(async (cambio) => {
      if (cambio.usuarioId) {
        try {
          const usuario = await pool.request()
            .input('usuarioId', cambio.usuarioId)
            .query('SELECT nombre_usuario FROM usuarios WHERE id_usuario = @usuarioId');
          
          return {
            ...cambio.toObject ? cambio.toObject() : cambio,
            nombreUsuario: usuario.recordset[0]?.nombre_usuario || 'Usuario desconocido'
          };
        } catch (error) {
          return {
            ...cambio.toObject ? cambio.toObject() : cambio,
            nombreUsuario: 'Usuario desconocido'
          };
        }
      }
      return cambio.toObject ? cambio.toObject() : cambio;
    }));

    res.json({
      success: true,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoActual: evento.estado
      },
      historial: historialEnriquecido.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    });

  } catch (error) {
    console.error('Error obteniendo historial de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial de estados'
    });
  }
};

// Dashboard de estados para ONG
const getOngStatusDashboard = async (req, res) => {
  try {
    const { ongId } = req.params;

    const esONG = await validarONG(ongId);
    if (!esONG) {
      return res.status(403).json({
        success: false,
        error: 'Solo las ONGs pueden acceder a este dashboard'
      });
    }

    const filtros = { 
      ongId: parseInt(ongId),
      activo: true 
    };

    // Estadísticas por estado
    const estadisticasPorEstado = await Evento.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 },
          ultimoEvento: { $max: '$fechaInicio' },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      }
    ]);

    // Eventos próximos a cambiar de estado
    const ahora = new Date();
    const proximosACambiar = await Evento.find({
      ...filtros,
      $or: [
        { estado: 'publicado', fechaInicio: { $lte: new Date(ahora.getTime() + 24 * 60 * 60 * 1000) } },
        { estado: 'en_curso', fechaFinal: { $lte: new Date(ahora.getTime() + 24 * 60 * 60 * 1000) } }
      ]
    }).select('titulo fechaInicio fechaFinal estado').lean();

    // Eventos que necesitan atención
    const necesitanAtencion = await Evento.find({
      ...filtros,
      $or: [
        { estado: 'borrador', fechaInicio: { $lte: new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000) } },
        { estado: 'suspendido' },
        { estado: 'en_curso', fechaFinal: { $lt: ahora } }
      ]
    }).select('titulo fechaInicio estado').lean();

    // Formatear estadísticas
    const estadisticasFormateadas = {};
    Object.values(ESTADOS_EVENTO).forEach(estado => {
      estadisticasFormateadas[estado] = {
        count: 0,
        ultimoEvento: null,
        totalParticipantes: 0
      };
    });

    estadisticasPorEstado.forEach(stat => {
      estadisticasFormateadas[stat._id] = {
        count: stat.count,
        ultimoEvento: stat.ultimoEvento,
        totalParticipantes: stat.totalParticipantes
      };
    });

    res.json({
      success: true,
      ongId: parseInt(ongId),
      resumen: {
        totalEventos: Object.values(estadisticasFormateadas).reduce((sum, stat) => sum + stat.count, 0),
        eventosActivos: estadisticasFormateadas[ESTADOS_EVENTO.PUBLICADO].count + estadisticasFormateadas[ESTADOS_EVENTO.EN_CURSO].count,
        eventosSuspendidos: estadisticasFormateadas[ESTADOS_EVENTO.SUSPENDIDO].count,
        eventosFinalizados: estadisticasFormateadas[ESTADOS_EVENTO.FINALIZADO].count
      },
      estadisticasPorEstado: estadisticasFormateadas,
      alertas: {
        proximosACambiar,
        necesitanAtencion
      },
      fecha: new Date()
    });

  } catch (error) {
    console.error('Error obteniendo dashboard de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener dashboard de estados'
    });
  }
};

// ================ EXPORTS ================

module.exports = {
  // CRUD básico
  createEvent,
  getAllEvents,
  getEventById,
  getOngEvents,
  updateEvent,
  deleteEvent,
  
  // Participantes
  registerParticipant,
  registerAttendance,
  getEventParticipants,
  
  // Imágenes
  deleteEventImage,
  
  // Estadísticas
  getEventStatistics,
  getSystemStatistics,
  
  // Empresas
  getAvailableCompanies,
  
  // Búsqueda y filtros
  searchEvents,
  getUpcomingEvents,
  getEventsByType,
  
  // Gestión de estados
  changeEventStatus,
  getEventsByStatus,
  getStatusStatistics,
  getAvailableTransitions,
  getEventStatusHistory,
  getOngStatusDashboard,
  
  // Consultas específicas
  getCompanyEvents,
  getUserParticipationEvents,
  
  // Configuración
  upload,
  ESTADOS_EVENTO,
  TRANSICIONES_VALIDAS
};