const { poolPromise } = require('../config/db');
const MegaEvento = require('../models/megaEvento.model');
const multer = require('multer');
const sharp = require('sharp');
const User            = require('../models/user');   

// Estados válidos del mega evento
const ESTADOS_MEGA_EVENTO = {
  PLANIFICACION: 'planificacion',
  CONVOCATORIA: 'convocatoria',
  ORGANIZACION: 'organizacion',
  EN_CURSO: 'en_curso',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado',
  POSPUESTO: 'pospuesto'
};

// Transiciones válidas entre estados
const TRANSICIONES_VALIDAS = {
  [ESTADOS_MEGA_EVENTO.PLANIFICACION]: [ESTADOS_MEGA_EVENTO.CONVOCATORIA, ESTADOS_MEGA_EVENTO.CANCELADO],
  [ESTADOS_MEGA_EVENTO.CONVOCATORIA]: [ESTADOS_MEGA_EVENTO.ORGANIZACION, ESTADOS_MEGA_EVENTO.POSPUESTO, ESTADOS_MEGA_EVENTO.CANCELADO],
  [ESTADOS_MEGA_EVENTO.ORGANIZACION]: [ESTADOS_MEGA_EVENTO.EN_CURSO, ESTADOS_MEGA_EVENTO.POSPUESTO, ESTADOS_MEGA_EVENTO.CANCELADO],
  [ESTADOS_MEGA_EVENTO.EN_CURSO]: [ESTADOS_MEGA_EVENTO.FINALIZADO, ESTADOS_MEGA_EVENTO.POSPUESTO],
  [ESTADOS_MEGA_EVENTO.POSPUESTO]: [ESTADOS_MEGA_EVENTO.CONVOCATORIA, ESTADOS_MEGA_EVENTO.CANCELADO],
  [ESTADOS_MEGA_EVENTO.FINALIZADO]: [],
  [ESTADOS_MEGA_EVENTO.CANCELADO]: []
};

// Configuración de Multer para mega eventos (mayor capacidad)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB por imagen
    files: 10 // Hasta 10 imágenes
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Procesar y optimizar imágenes para mega eventos
const processImages = async (files) => {
  if (!files || files.length === 0) return [];

  const processedImages = [];
  
  for (const file of files) {
    try {
      const processedBuffer = await sharp(file.buffer)
        .resize(1200, 800, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 85,
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
const validarCambioEstado = async (megaEvento, nuevoEstado) => {
  const ahora = new Date();
  
  switch (nuevoEstado) {
    case ESTADOS_MEGA_EVENTO.CONVOCATORIA:
      if (!megaEvento.titulo || !megaEvento.fechaInicio || !megaEvento.ubicacion) {
        return {
          valido: false,
          error: 'El mega evento debe tener título, fecha de inicio y ubicación para abrir convocatoria'
        };
      }
      
      if (megaEvento.fechaInicio <= ahora) {
        return {
          valido: false,
          error: 'No se puede abrir convocatoria para un mega evento con fecha de inicio pasada'
        };
      }

      if (megaEvento.ongsOrganizadoras.length === 0) {
        return {
          valido: false,
          error: 'Debe haber al menos una ONG organizadora antes de abrir convocatoria'
        };
      }
      break;
      
    case ESTADOS_MEGA_EVENTO.ORGANIZACION:
      if (megaEvento.participantesExternos.length === 0) {
        return {
          valido: false,
          error: 'Debe haber participantes registrados antes de pasar a organización'
        };
      }
      break;
      
    case ESTADOS_MEGA_EVENTO.EN_CURSO:
      if (megaEvento.fechaInicio > ahora) {
        return {
          valido: false,
          error: 'El mega evento no puede estar en curso antes de su fecha de inicio'
        };
      }
      
      if (megaEvento.fechaFin && megaEvento.fechaFin < ahora) {
        return {
          valido: false,
          error: 'El mega evento no puede estar en curso después de su fecha final'
        };
      }
      break;
      
    case ESTADOS_MEGA_EVENTO.FINALIZADO:
      if (megaEvento.fechaFin > ahora) {
        return {
          valido: false,
          error: 'No se puede finalizar un mega evento que aún no ha terminado'
        };
      }
      break;
      
    case ESTADOS_MEGA_EVENTO.CANCELADO:
      if (megaEvento.participantesExternos.length > 0) {
        console.log(`⚠️ Cancelando mega evento con ${megaEvento.participantesExternos.length} participantes`);
      }
      break;
  }
  
  return { valido: true };
};

// Ejecutar acciones por estado
const ejecutarAccionesEstado = async (megaEvento, nuevoEstado) => {
  switch (nuevoEstado) {
    case ESTADOS_MEGA_EVENTO.CONVOCATORIA:
      megaEvento.esPublico = true;
      megaEvento.inscripcionAbierta = true;
      break;
      
    case ESTADOS_MEGA_EVENTO.ORGANIZACION:
      megaEvento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_MEGA_EVENTO.EN_CURSO:
      megaEvento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_MEGA_EVENTO.FINALIZADO:
      await megaEvento.actualizarMetricas();
      break;
      
    case ESTADOS_MEGA_EVENTO.CANCELADO:
      megaEvento.esPublico = false;
      megaEvento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_MEGA_EVENTO.POSPUESTO:
      megaEvento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_MEGA_EVENTO.PLANIFICACION:
      megaEvento.esPublico = false;
      megaEvento.inscripcionAbierta = false;
      break;
  }
};

// ================== FUNCIONES PRINCIPALES ==================

// CREATE - Crear mega evento
const createMegaEvent = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      fechaInicio,
      fechaFin,
      ubicacion,
      categoria,
      ongOrganizadoraPrincipal, // esta viene como string o número de la petición
      capacidadMaxima,
      requiereAprobacion,
      patrocinadores,
      tags,
      prioridad,
      estado = ESTADOS_MEGA_EVENTO.PLANIFICACION
    } = req.body;

    // …validaciones básicas…

    // 1) Validar ONG organizadora principal en SQL (ya lo hacías)
    const esONG = await validarONG(ongOrganizadoraPrincipal);
    if (!esONG) {
      return res.status(403).json({ 
        success: false,
        error: 'Solo las ONGs pueden crear mega eventos' 
      });
    }

    // 2) Obtener usuario Mongo para extraer sqlUserId (número)
    //    (authenticateToken ya puso req.user.userId = ObjectId Mongo)
    const mongoUser = await User.findById(req.user.userId).select('sqlUserId');
    if (!mongoUser) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    const creadorSqlId = mongoUser.sqlUserId; // ==> número

    // 3) Validar fechas y transformar
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate   = new Date(fechaFin);
    if (fechaFinDate <= fechaInicioDate) {
      return res.status(400).json({
        success: false,
        error: 'La fecha final debe ser posterior a la fecha de inicio'
      });
    }

    // 4) Procesar lista de patrocinadores si viene
    let patrocinadoresList = [];
    if (patrocinadores) {
      patrocinadoresList = Array.isArray(patrocinadores)
        ? patrocinadores
        : JSON.parse(patrocinadores);
    }

    // 5) Iniciar transacción en SQL Server
    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // 6) Insertar en mega_eventos (SQL)
      const sqlResult = await transaction.request()
        .input('titulo',        titulo)
        .input('descripcion',   descripcion || null)
        .input('fecha_inicio',  fechaInicioDate)
        .input('fecha_fin',     fechaFinDate)
        .input('ubicacion',     ubicacion)
        .input('fecha_creacion', new Date())
        .input('fecha_actualizacion', new Date())
        .query(`
          INSERT INTO mega_eventos
            (titulo, descripcion, fecha_inicio, fecha_fin, ubicacion, fecha_creacion, fecha_actualizacion)
          OUTPUT INSERTED.MegaEventoID
          VALUES (@titulo, @descripcion, @fecha_inicio, @fecha_fin, @ubicacion, @fecha_creacion, @fecha_actualizacion)
        `);

      const sqlMegaEventoId = sqlResult.recordset[0].MegaEventoID;

      // 7) Registrar ONG organizadora principal en SQL
      await transaction.request()
        .input('mega_evento_id', sqlMegaEventoId)
        .input('ong_id',         parseInt(ongOrganizadoraPrincipal, 10))
        .input('rol_organizacion','coordinador_principal')
        .input('fecha_union',     new Date())
        .input('activo',          true)
        .query(`
          INSERT INTO mega_evento_ongs_organizadoras 
            (mega_evento_id, ong_id, rol_organizacion, fecha_union, activo)
          VALUES (@mega_evento_id, @ong_id, @rol_organizacion, @fecha_union, @activo)
        `);

      // 8) Registrar patrocinadores en SQL
      for (const patrocinador of patrocinadoresList) {
        await transaction.request()
          .input('mega_evento_id',       sqlMegaEventoId)
          .input('empresa_id',           parseInt(patrocinador.empresaId, 10))
          .input('tipo_patrocinio',      patrocinador.tipoPatrocinio || 'colaborador')
          .input('monto_contribucion',   patrocinador.montoContribucion || null)
          .input('descripcion_contribucion', patrocinador.descripcionContribucion || null)
          .input('fecha_compromiso',      new Date())
          .input('estado_compromiso',     'comprometido')
          .query(`
            INSERT INTO mega_evento_patrocinadores 
              (mega_evento_id, empresa_id, tipo_patrocinio, monto_contribucion, descripcion_contribucion, fecha_compromiso, estado_compromiso)
            VALUES (@mega_evento_id, @empresa_id, @tipo_patrocinio, @monto_contribucion, @descripcion_contribucion, @fecha_compromiso, @estado_compromiso)
          `);
      }

      // 9) Procesar imágenes (si las enviaste)
      let imagenesPromocionales = [];
      if (req.files && req.files.length > 0) {
        imagenesPromocionales = await processImages(req.files);
      }

      // 10) Armar el documento Mongo para MegaEvento
      const megaEventoData = {
        sqlMegaEventoId,
        titulo,
        descripcion: descripcion || '',
        fechaInicio:   fechaInicioDate,
        fechaFin:      fechaFinDate,
        ubicacion:     { direccion: ubicacion, ciudad: 'Sin ciudad', tipoLocacion: 'presencial' },
        categoria:     categoria || 'social',
        createdAt:     new Date(),
        actualizadoAt: new Date(),
        // → AQUÍ: usar el sqlUserId numérico como creadoPor
        creadoPor:     creadorSqlId,
        // la ONG organizadora principal también es número
        ongOrganizadoraPrincipal: parseInt(ongOrganizadoraPrincipal, 10),
        ongsOrganizadoras: [{
          ongId:           parseInt(ongOrganizadoraPrincipal, 10),
          rolOrganizacion: 'coordinador_principal',
          fechaUnion:      new Date(),
          activo:          true
        }],
        patrocinadores: patrocinadoresList.map(p => ({
          empresaId:            parseInt(p.empresaId, 10),
          tipoPatrocinio:       p.tipoPatrocinio || 'colaborador',
          montoContribucion:    p.montoContribucion,
          descripcionContribucion: p.descripcionContribucion,
          fechaCompromiso:      new Date(),
          estadoCompromiso:     'comprometido'
        })),
        capacidadMaxima:     capacidadMaxima ? parseInt(capacidadMaxima, 10) : null,
        requiereAprobacion:  !!requiereAprobacion,
        imagenesPromocionales,
        estado,
        esPublico:           false, // puedes ajustar según estado
        inscripcionAbierta:  false,
        activo:              true,
        tags:                Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
        prioridad:           prioridad || 'media',
        metricas: {
          totalInscritos:       0,
          totalAsistentes:      0,
          totalOngsParticipantes: 1,
          totalPatrocinadores:  patrocinadoresList.length,
          porcentajeAsistencia: 0
        },
        participantesExternos: [],
        historialEstados: [{
          estadoAnterior:   null,
          estadoNuevo:      estado,
          fecha:            new Date(),
          motivo:           'Creación del mega evento',
          usuarioId:        creadorSqlId
        }]
      };

      // 11) Guardar en Mongo
      const nuevoMegaEvento = new MegaEvento(megaEventoData);
      await nuevoMegaEvento.save();

      // 12) Commit de la transacción SQL Server
      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Mega evento creado exitosamente',
        megaEvento: {
          id: nuevoMegaEvento._id,
          sqlMegaEventoId,
          titulo: nuevoMegaEvento.titulo,
          estado: nuevoMegaEvento.estado
        }
      });
    } catch (err) {
      // Si algo falla en SQL, rollback
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error('💥 Error creando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al crear mega evento'
    });
  }
};


// READ - Obtener todos los mega eventos
const getAllMegaEventsFull = async (req, res) => {
  try {
    // 1) Primero, obtengo TODOS los mega_eventos desde SQL Server
    const pool = await poolPromise;
    const sqlResult = await pool.request().query(`
      SELECT
        MegaEventoID,
        titulo,
        descripcion,
        fecha_inicio    AS fechaInicio,
        fecha_fin       AS fechaFin,
        ubicacion,
        presupuesto_estimado AS presupuestoEstimado,
        fecha_creacion  AS fechaCreacion,
        fecha_actualizacion AS fechaActualizacion,
        activo
      FROM mega_eventos
    `);

    const sqlRows = sqlResult.recordset; // array de registros SQL

    // 2) Luego, consulto en MongoDB todos los documentos en la colección "MegaEvento"
    //    que tengan sqlMegaEventoId igual a alguno de los IDs que sacamos de SQL.
    const todosIdsSQL = sqlRows.map(r => r.MegaEventoID);
    const mongoDocs = await MegaEvento
      .find({ sqlMegaEventoId: { $in: todosIdsSQL } })
      .lean();

    // 3) Indexo los documentos de Mongo por sqlMegaEventoId para acceder rápido
    const mapaMongo = {};
    mongoDocs.forEach(doc => {
      mapaMongo[doc.sqlMegaEventoId] = doc;
    });

    // 4) Construyo el array combinado: por cada fila SQL, agrego su contraparte de Mongo (si existe).
    const combinados = sqlRows.map(sqlRow => {
      const mongoDoc = mapaMongo[sqlRow.MegaEventoID] || null;
      return {
        sql: {
          MegaEventoID:         sqlRow.MegaEventoID,
          titulo:               sqlRow.titulo,
          descripcion:          sqlRow.descripcion,
          fechaInicio:          sqlRow.fechaInicio,
          fechaFin:             sqlRow.fechaFin,
          ubicacion:            sqlRow.ubicacion,
          presupuestoEstimado:  sqlRow.presupuestoEstimado,
          fechaCreacion:        sqlRow.fechaCreacion,
          fechaActualizacion:   sqlRow.fechaActualizacion,
          activo:               sqlRow.activo
        },
        mongo: mongoDoc // o null si no existe
      };
    });

    return res.json({
      success: true,
      total: combinados.length,
      megaEventos: combinados
    });
  } catch (error) {
    console.error('Error en getAllMegaEventsFull:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener todos los mega‐eventos'
    });
  }
};

module.exports = {
  // … otros controladores …
  getAllMegaEventsFull
};
// READ - Obtener mega evento por ID
const getMegaEventById = async (req, res) => {
  try {
    const { megaEventoId } = req.params;

    const megaEvento = await MegaEvento.findById(megaEventoId);

    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Obtener información adicional de SQL Server
    const pool = await poolPromise;
    
    const ongsOrganizadoras = await pool.request()
      .input('MegaEventoID', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT o.id_usuario, o.nombre_ong, u.nombre_usuario, u.correo, 
               meoo.rol_organizacion, meoo.fecha_union
        FROM mega_evento_ongs_organizadoras meoo
        INNER JOIN ongs o ON meoo.ong_id = o.id_usuario
        INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
        WHERE meoo.mega_evento_id = @MegaEventoID AND meoo.activo = 1
      `);

    const patrocinadores = await pool.request()
      .input('MegaEventoID', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT e.empresaID, e.nombre_empresa, u.nombre_usuario, u.correo,
               mep.tipo_patrocinio, mep.monto_contribucion, mep.descripcion_contribucion,
               mep.estado_compromiso, mep.fecha_compromiso
        FROM mega_evento_patrocinadores mep
        INNER JOIN empresas e ON mep.empresa_id = e.empresaID
        INNER JOIN usuarios u ON e.usuarioID = u.id_usuario
        WHERE mep.mega_evento_id = @MegaEventoID
      `);

    const megaEventoCompleto = megaEvento.toSafeObject();
    megaEventoCompleto.ongsOrganizadoras = ongsOrganizadoras.recordset;
    megaEventoCompleto.patrocinadoresDetalle = patrocinadores.recordset;

    res.json({
      success: true,
      megaEvento: megaEventoCompleto
    });

  } catch (error) {
    console.error('Error obteniendo mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega evento'
    });
  }
};

// READ - Obtener mega eventos de una ONG
const getOngMegaEvents = async (req, res) => {
  try {
    const { ongId } = req.params;
    const { estado, categoria, pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      'ongsOrganizadoras.ongId': parseInt(ongId),
      'ongsOrganizadoras.activo': true,
      activo: true 
    };
    
    if (estado) filtros.estado = estado;
    if (categoria) filtros.categoria = categoria;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const megaEventos = await MegaEvento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await MegaEvento.countDocuments(filtros);

    const megaEventosConMiniaturas = megaEventos.map(megaEvento => {
      if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = megaEvento.imagenesPromocionales[0];
        megaEvento.imagenPrincipal = {
          _id: imagenPrincipal._id,
          nombre: imagenPrincipal.nombre,
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete megaEvento.imagenesPromocionales;
      return megaEvento;
    });

    res.json({
      success: true,
      megaEventos: megaEventosConMiniaturas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo mega eventos de ONG:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega eventos'
    });
  }
};

// UPDATE - Actualizar mega evento
const updateMegaEvent = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );

    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para editar este mega evento'
      });
    }

    // Actualizar campos permitidos
    const camposPermitidos = [
      'titulo', 'descripcion', 'fechaInicio', 'fechaFin', 
      'ubicacion', 'categoria', 'capacidadMaxima', 
      'requiereAprobacion', 'tags', 'prioridad'
    ];

    let huboCambios = false;

    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        if (campo === 'fechaInicio' || campo === 'fechaFin') {
          megaEvento[campo] = new Date(req.body[campo]);
        } else if (campo === 'ubicacion') {
          if (typeof req.body[campo] === 'string') {
            megaEvento.ubicacion.direccion = req.body[campo];
          } else {
            megaEvento.ubicacion = { ...megaEvento.ubicacion, ...req.body[campo] };
          }
        } else if (campo === 'tags') {
          megaEvento[campo] = Array.isArray(req.body[campo]) ? 
            req.body[campo] : req.body[campo].split(',').map(t => t.trim());
        } else {
          megaEvento[campo] = req.body[campo];
        }
        huboCambios = true;
      }
    });

    // Procesar nuevas imágenes
    if (req.files && req.files.length > 0) {
      if (megaEvento.imagenesPromocionales.length + req.files.length > 20) {
        return res.status(400).json({
          success: false,
          error: 'Máximo 20 imágenes por mega evento'
        });
      }

      const nuevasImagenes = await processImages(req.files);
      megaEvento.imagenesPromocionales.push(...nuevasImagenes);
      huboCambios = true;
    }

    if (!huboCambios) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron cambios para actualizar'
      });
    }

    await megaEvento.save();

    // Sincronizar con SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .input('titulo', megaEvento.titulo)
          .input('descripcion', megaEvento.descripcion)
          .input('fecha_inicio', megaEvento.fechaInicio)
          .input('fecha_fin', megaEvento.fechaFin)
          .input('ubicacion', megaEvento.ubicacion.direccion)
          .input('fecha_actualizacion', new Date())
          .query(`
            UPDATE mega_eventos 
            SET titulo = @titulo, descripcion = @descripcion, 
                fecha_inicio = @fecha_inicio, fecha_fin = @fecha_fin, 
                ubicacion = @ubicacion, fecha_actualizacion = @fecha_actualizacion
            WHERE MegaEventoID = @MegaEventoID
          `);
      } catch (sqlError) {
        console.error('Error sincronizando con SQL Server:', sqlError);
      }
    }

          res.json({
      success: true,
      message: 'Mega evento actualizado exitosamente',
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        estado: megaEvento.estado,
        totalImagenes: megaEvento.imagenesPromocionales.length
      }
    });

  } catch (error) {
    console.error('Error actualizando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar mega evento'
    });
  }
};

// DELETE - Eliminar mega evento
const deleteMegaEvent = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Solo el coordinador principal puede eliminar
    const coordinadorPrincipal = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.rolOrganizacion === 'coordinador_principal' && o.activo
    );

    if (!coordinadorPrincipal) {
      return res.status(403).json({
        success: false,
        error: 'Solo el coordinador principal puede eliminar el mega evento'
      });
    }

    // Verificar participantes
    if (megaEvento.participantesExternos.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar un mega evento con participantes registrados',
        sugerencia: 'Use el estado "cancelado" para cancelar el mega evento'
      });
    }

    // Eliminar de SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        const transaction = pool.transaction();
        await transaction.begin();

        await transaction.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .query('DELETE FROM mega_evento_patrocinadores WHERE mega_evento_id = @MegaEventoID');

        await transaction.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .query('DELETE FROM mega_evento_ongs_organizadoras WHERE mega_evento_id = @MegaEventoID');

        await transaction.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .query('DELETE FROM mega_evento_participantes_externos WHERE mega_evento_id = @MegaEventoID');

        await transaction.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .query('DELETE FROM mega_eventos WHERE MegaEventoID = @MegaEventoID');

        await transaction.commit();
      } catch (sqlError) {
        console.error('Error eliminando de SQL Server:', sqlError);
      }
    }

    // Soft delete en MongoDB
    megaEvento.activo = false;
    megaEvento.estado = 'cancelado';
    await megaEvento.save();

    res.json({
      success: true,
      message: 'Mega evento eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar mega evento'
    });
  }
};

// Registrar participante externo
const registerParticipant = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { 
      integranteId, 
      tipoParticipacion = 'participante',
      habilidadesOfrecidas,
      disponibilidad,
      comentarios
    } = req.body;

    if (!integranteId) {
      return res.status(400).json({
        success: false,
        error: 'El ID del integrante es requerido'
      });
    }

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
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
      tipoParticipacion,
      habilidadesOfrecidas: Array.isArray(habilidadesOfrecidas) ? 
        habilidadesOfrecidas : (habilidadesOfrecidas ? [habilidadesOfrecidas] : []),
      disponibilidad: disponibilidad || 'completa',
      comentarios: comentarios || '',
      estadoParticipacion: megaEvento.requiereAprobacion ? 'en_espera' : 'confirmado'
    };

    await megaEvento.agregarParticipanteExterno(participanteData);

    // Sincronizar con SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        await pool.request()
          .input('mega_evento_id', megaEvento.sqlMegaEventoId)
          .input('integrante_externo_id', integranteId)
          .input('tipo_participacion', tipoParticipacion)
          .input('habilidades_ofrecidas', habilidadesOfrecidas ? habilidadesOfrecidas.join(',') : null)
          .input('disponibilidad', disponibilidad || 'completa')
          .input('estado_participacion', participanteData.estadoParticipacion)
          .input('fecha_registro', new Date())
          .input('comentarios', comentarios || null)
          .query(`
            INSERT INTO mega_evento_participantes_externos 
            (mega_evento_id, integrante_externo_id, tipo_participacion, habilidades_ofrecidas, 
             disponibilidad, estado_participacion, fecha_registro, comentarios)
            VALUES (@mega_evento_id, @integrante_externo_id, @tipo_participacion, @habilidades_ofrecidas,
                    @disponibilidad, @estado_participacion, @fecha_registro, @comentarios)
          `);
      } catch (sqlError) {
        console.error('Error sincronizando participante:', sqlError);
      }
    }

    res.json({
      success: true,
      message: megaEvento.requiereAprobacion ? 
        'Participación registrada, pendiente de aprobación' : 
        'Participante registrado exitosamente',
      totalParticipantes: megaEvento.participantesExternos.length,
      estadoParticipacion: participanteData.estadoParticipacion
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

// Agregar ONG organizadora
const addOrganizerOng = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId, nuevaOngId, rolOrganizacion = 'colaborador' } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser coordinador principal o co_organizador
    const organizadorAutorizado = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && 
           ['coordinador_principal', 'co_organizador'].includes(o.rolOrganizacion) && 
           o.activo
    );

    if (!organizadorAutorizado) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para agregar ONGs organizadoras'
      });
    }

    // Validar nueva ONG
    const esONG = await validarONG(nuevaOngId);
    if (!esONG) {
      return res.status(400).json({
        success: false,
        error: 'La nueva organización debe ser una ONG válida'
      });
    }

    const ongData = {
      ongId: parseInt(nuevaOngId),
      rolOrganizacion,
      fechaUnion: new Date(),
      activo: true
    };

    await megaEvento.agregarOngOrganizadora(ongData);

    // Sincronizar con SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('mega_evento_id', megaEvento.sqlMegaEventoId)
          .input('ong_id', nuevaOngId)
          .input('rol_organizacion', rolOrganizacion)
          .input('fecha_union', new Date())
          .input('activo', true)
          .query(`
            INSERT INTO mega_evento_ongs_organizadoras 
            (mega_evento_id, ong_id, rol_organizacion, fecha_union, activo)
            VALUES (@mega_evento_id, @ong_id, @rol_organizacion, @fecha_union, @activo)
          `);
      } catch (sqlError) {
        console.error('Error sincronizando ONG organizadora:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'ONG organizadora agregada exitosamente',
      totalOngsOrganizadoras: megaEvento.ongsOrganizadoras.filter(o => o.activo).length
    });

  } catch (error) {
    console.error('Error agregando ONG organizadora:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al agregar ONG organizadora'
    });
  }
};

// Agregar patrocinador
const addSponsor = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { 
      ongId, 
      empresaId, 
      tipoPatrocinio, 
      montoContribucion, 
      descripcionContribucion 
    } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );

    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'Solo las ONGs organizadoras pueden agregar patrocinadores'
      });
    }

    const patrocinadorData = {
      empresaId: parseInt(empresaId),
      tipoPatrocinio,
      montoContribucion,
      descripcionContribucion,
      fechaCompromiso: new Date(),
      estadoCompromiso: 'comprometido'
    };

    await megaEvento.agregarPatrocinador(patrocinadorData);

    // Sincronizar con SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('mega_evento_id', megaEvento.sqlMegaEventoId)
          .input('empresa_id', empresaId)
          .input('tipo_patrocinio', tipoPatrocinio)
          .input('monto_contribucion', montoContribucion || null)
          .input('descripcion_contribucion', descripcionContribucion || null)
          .input('fecha_compromiso', new Date())
          .input('estado_compromiso', 'comprometido')
          .query(`
            INSERT INTO mega_evento_patrocinadores 
            (mega_evento_id, empresa_id, tipo_patrocinio, monto_contribucion, 
             descripcion_contribucion, fecha_compromiso, estado_compromiso)
            VALUES (@mega_evento_id, @empresa_id, @tipo_patrocinio, @monto_contribucion,
                    @descripcion_contribucion, @fecha_compromiso, @estado_compromiso)
          `);
      } catch (sqlError) {
        console.error('Error sincronizando patrocinador:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Patrocinador agregado exitosamente',
      totalPatrocinadores: megaEvento.patrocinadores.length
    });

  } catch (error) {
    console.error('Error agregando patrocinador:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al agregar patrocinador'
    });
  }
};

// Registrar asistencia
const registerAttendance = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { integranteId, asistencia, ongId } = req.body;

    if (typeof asistencia !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'El campo asistencia debe ser true o false'
      });
    }

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );

    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para registrar asistencia en este mega evento'
      });
    }

    await megaEvento.registrarAsistencia(integranteId, asistencia);

    // Sincronizar con SQL Server
    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('mega_evento_id', megaEvento.sqlMegaEventoId)
          .input('integrante_externo_id', integranteId)
          .input('asistencia', asistencia ? 1 : 0)
          .query(`
            UPDATE mega_evento_participantes_externos 
            SET asistencia = @asistencia
            WHERE mega_evento_id = @mega_evento_id AND integrante_externo_id = @integrante_externo_id
          `);
      } catch (sqlError) {
        console.error('Error sincronizando asistencia:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      metricas: {
        totalAsistentes: megaEvento.metricas.totalAsistentes,
        porcentajeAsistencia: megaEvento.metricas.porcentajeAsistencia
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

// Cambiar estado del mega evento
const changeMegaEventStatus = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { nuevoEstado, ongId, motivo } = req.body;

    if (!Object.values(ESTADOS_MEGA_EVENTO).includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_MEGA_EVENTO)
      });
    }

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser coordinador principal o co_organizador
    const organizadorAutorizado = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && 
           ['coordinador_principal', 'co_organizador'].includes(o.rolOrganizacion) && 
           o.activo
    );

    if (!organizadorAutorizado) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para cambiar el estado de este mega evento'
      });
    }

    // Validar transición
    const estadoActual = megaEvento.estado;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    
    if (!transicionesPermitidas.includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: `No se puede cambiar de "${estadoActual}" a "${nuevoEstado}"`,
        transicionesPermitidas
      });
    }

    // Validaciones específicas
    const validacionesEspecificas = await validarCambioEstado(megaEvento, nuevoEstado);
    if (!validacionesEspecificas.valido) {
      return res.status(400).json({
        success: false,
        error: validacionesEspecificas.error
      });
    }

    // Actualizar estado
    const estadoAnterior = megaEvento.estado;
    megaEvento.estado = nuevoEstado;
    
    if (!megaEvento.historialEstados) {
      megaEvento.historialEstados = [];
    }
    
    megaEvento.historialEstados.push({
      estadoAnterior,
      estadoNuevo: nuevoEstado,
      fecha: new Date(),
      motivo: motivo || `Cambio de ${estadoAnterior} a ${nuevoEstado}`,
      usuarioId: parseInt(ongId)
    });

    await ejecutarAccionesEstado(megaEvento, nuevoEstado);
    await megaEvento.save();

    res.json({
      success: true,
      message: `Estado cambiado exitosamente de "${estadoAnterior}" a "${nuevoEstado}"`,
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        estadoAnterior,
        estadoActual: nuevoEstado,
        fecha: new Date(),
        esPublico: megaEvento.esPublico,
        inscripcionAbierta: megaEvento.inscripcionAbierta
      }
    });

  } catch (error) {
    console.error('Error cambiando estado del mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar estado del mega evento'
    });
  }
};

// Buscar mega eventos
const searchMegaEvents = async (req, res) => {
  try {
    const { termino } = req.params;
    const { categoria, ciudad, fechaDesde, fechaHasta, limite = 20 } = req.query;
    
    console.log(`🔍 Búsqueda de mega eventos: "${termino}"`);
    
    const filtros = { categoria, ciudad, fechaDesde, fechaHasta };
    const megaEventos = await MegaEvento.buscar(termino, filtros);
    
    const megaEventosLimitados = megaEventos.slice(0, parseInt(limite));
    
    const megaEventosConMiniaturas = megaEventosLimitados.map(megaEvento => {
      const eventoObj = megaEvento.toObject();
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
      termino,
      megaEventos: megaEventosConMiniaturas,
      total: megaEventosConMiniaturas.length,
      filtrosAplicados: filtros
    });
  } catch (error) {
    console.error('Error buscando mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error en la búsqueda de mega eventos'
    });
  }
};

// Obtener mega eventos próximos
const getUpcomingMegaEvents = async (req, res) => {
  try {
    const { dias = 60 } = req.query; // Más días por defecto para mega eventos
    
    console.log(`📅 Obteniendo mega eventos próximos (${dias} días)`);
    
    const megaEventos = await MegaEvento.megaEventosProximos(parseInt(dias));
    
    const megaEventosConMiniaturas = megaEventos.map(megaEvento => {
      const eventoObj = megaEvento.toObject();
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
      megaEventos: megaEventosConMiniaturas,
      diasConsiderados: parseInt(dias),
      total: megaEventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo mega eventos próximos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega eventos próximos'
    });
  }
};

// Obtener mega eventos por categoría
const getMegaEventsByCategory = async (req, res) => {
  try {
    const { categoria } = req.params;
    const { ciudad, limite = 10 } = req.query;
    
    console.log(`🏷️ Obteniendo mega eventos de categoría: ${categoria}`);
    
    const query = {
      categoria,
      activo: true,
      esPublico: true,
      estado: { $in: ['convocatoria', 'organizacion'] },
      fechaInicio: { $gte: new Date() }
    };
    
    if (ciudad) query['ubicacion.ciudad'] = ciudad;
    
    const megaEventos = await MegaEvento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();
    
    const megaEventosConMiniaturas = megaEventos.map(megaEvento => {
      if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
        megaEvento.imagenPrincipal = {
          url: `data:${megaEvento.imagenesPromocionales[0].mimeType};base64,${megaEvento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete megaEvento.imagenesPromocionales;
      return megaEvento;
    });
    
    res.json({
      success: true,
      categoria,
      megaEventos: megaEventosConMiniaturas,
      total: megaEventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo mega eventos por categoría:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega eventos por categoría'
    });
  }
};

// Obtener participantes del mega evento
const getMegaEventParticipants = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.query;
    
    const megaEvento = await MegaEvento.findById(megaEventoId);
    
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }
    
    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );
    
    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver participantes de este mega evento'
      });
    }
    
    res.json({
      success: true,
      participantesExternos: megaEvento.participantesExternos,
      ongsOrganizadoras: megaEvento.ongsOrganizadoras,
      patrocinadores: megaEvento.patrocinadores,
      totalParticipantes: megaEvento.participantesExternos.length,
      totalOngsOrganizadoras: megaEvento.ongsOrganizadoras.filter(o => o.activo).length,
      totalPatrocinadores: megaEvento.patrocinadores.length,
      metricas: megaEvento.metricas
    });
  } catch (error) {
    console.error('Error obteniendo participantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener participantes'
    });
  }
};

// Estadísticas del mega evento
const getMegaEventStatistics = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.query;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );

    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver estadísticas de este mega evento'
      });
    }

    const participantesPorTipo = megaEvento.participantesExternos.reduce((acc, p) => {
      acc[p.tipoParticipacion] = (acc[p.tipoParticipacion] || 0) + 1;
      return acc;
    }, {});

    const patrocinadorePorTipo = megaEvento.patrocinadores.reduce((acc, p) => {
      acc[p.tipoPatrocinio] = (acc[p.tipoPatrocinio] || 0) + 1;
      return acc;
    }, {});

    const estadisticas = {
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        fechaInicio: megaEvento.fechaInicio,
        fechaFin: megaEvento.fechaFin,
        estado: megaEvento.estado,
        categoria: megaEvento.categoria
      },
      participacion: {
        totalInscritos: megaEvento.metricas.totalInscritos,
        totalAsistentes: megaEvento.metricas.totalAsistentes,
        porcentajeAsistencia: megaEvento.metricas.porcentajeAsistencia,
        participantesPorTipo,
        capacidadMaxima: megaEvento.capacidadMaxima,
        espaciosDisponibles: megaEvento.capacidadMaxima ? 
          megaEvento.capacidadMaxima - megaEvento.metricas.totalInscritos : null
      },
      organizacion: {
        totalOngsOrganizadoras: megaEvento.metricas.totalOngsParticipantes,
        totalPatrocinadores: megaEvento.metricas.totalPatrocinadores,
        patrocinadorePorTipo
      },
      contenido: {
        totalImagenes: megaEvento.imagenesPromocionales.length,
        tiposImagenes: megaEvento.imagenesPromocionales.reduce((acc, img) => {
          acc[img.tipo] = (acc[img.tipo] || 0) + 1;
          return acc;
        }, {}),
        totalTags: megaEvento.tags.length
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

// Eliminar imagen del mega evento
const deleteMegaEventImage = async (req, res) => {
  try {
    const { megaEventoId, imagenId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    // Verificar permisos - debe ser una ONG organizadora
    const esOrganizadora = megaEvento.ongsOrganizadoras.find(
      o => o.ongId === parseInt(ongId) && o.activo
    );

    if (!esOrganizadora) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar imágenes de este mega evento'
      });
    }

    const imagenIndex = megaEvento.imagenesPromocionales.findIndex(
      img => img._id.toString() === imagenId
    );

    if (imagenIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Imagen no encontrada'
      });
    }

    megaEvento.imagenesPromocionales.splice(imagenIndex, 1);
    await megaEvento.save();

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      totalImagenes: megaEvento.imagenesPromocionales.length
    });

  } catch (error) {
    console.error('Error eliminando imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar imagen'
    });
  }
};

// Estadísticas generales del sistema
const getSystemStatistics = async (req, res) => {
  try {
    const stats = await MegaEvento.aggregate([
      {
        $group: {
          _id: null,
          totalMegaEventos: { $sum: 1 },
          megaEventosActivos: {
            $sum: { $cond: [{ $in: ['$estado', ['convocatoria', 'organizacion']] }, 1, 0] }
          },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalOngsParticipantes: { $sum: '$metricas.totalOngsParticipantes' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' },
          totalImagenes: { $sum: { $size: '$imagenesPromocionales' } }
        }
      }
    ]);
    
    const megaEventosPorCategoria = await MegaEvento.aggregate([
      { $match: { activo: true, esPublico: true } },
      { $group: { _id: '$categoria', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const megaEventosPorEstado = await MegaEvento.aggregate([
      { $match: { activo: true } },
      { $group: { _id: '$estado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      estadisticas: stats[0] || {
        totalMegaEventos: 0,
        megaEventosActivos: 0,
        totalParticipantes: 0,
        totalOngsParticipantes: 0,
        totalPatrocinadores: 0,
        totalImagenes: 0
      },
      megaEventosPorCategoria,
      megaEventosPorEstado,
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

// Obtener empresas disponibles
const getAvailableCompanies = async (req, res) => {
  try {
    const empresas = await obtenerEmpresas();
    
    res.json({
      success: true,
      empresas,
      total: empresas.length
    });
  } catch (error) {
    console.error('Error obteniendo empresas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empresas disponibles'
    });
  }
};

// ================ EXPORTS ================

const getSqlMegaEvents = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        MegaEventoID,
        titulo,
        descripcion,
        fecha_inicio    AS fechaInicio,
        fecha_fin       AS fechaFin,
        ubicacion,
        presupuesto_estimado AS presupuesto,
        fecha_creacion  AS fechaCreacion,
        fecha_actualizacion AS fechaActualizacion,
        activo
      FROM [UNI2].[dbo].[mega_eventos]
      WHERE activo = 1
      ORDER BY fecha_inicio ASC
    `);

    return res.json({
      success: true,
      megaEventos: result.recordset
    });
  } catch (error) {
    console.error('Error obteniendo MegaEventos SQL:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener MegaEventos desde SQL Server'
    });
  }
};

module.exports = {
  // CRUD básico
  getSqlMegaEvents,
  getAllMegaEventsFull,
  createMegaEvent,
  getMegaEventById,
  getOngMegaEvents,
  updateMegaEvent,
  deleteMegaEvent,
  
  // Participantes y organizadores
  registerParticipant,
  addOrganizerOng,
  addSponsor,
  registerAttendance,
  getMegaEventParticipants,
  
  // Gestión de estados
  changeMegaEventStatus,
  
  // Búsqueda y filtros
  searchMegaEvents,
  getUpcomingMegaEvents,
  getMegaEventsByCategory,
  
  // Estadísticas
  getMegaEventStatistics,
  getSystemStatistics,
  
  // Multimedia
  deleteMegaEventImage,
  
  // Empresas
  getAvailableCompanies,
  
  // Configuración
  upload,
  ESTADOS_MEGA_EVENTO,
  TRANSICIONES_VALIDAS
};