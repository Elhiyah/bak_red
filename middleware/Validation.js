const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');

// =================== HELPER FUNCTIONS ===================

// Función para manejar errores de validación (versión mejorada)
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Errores de validación',
      details: errors.array().map(error => ({
        campo: error.path,
        valor: error.value,
        mensaje: error.msg
      }))
    });
  }
  next();
};

// Estados válidos para mega eventos
const ESTADOS_VALIDOS = ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado', 'pospuesto'];
const CATEGORIAS_VALIDAS = ['social', 'ambiental', 'educativo', 'salud', 'cultural', 'deportivo', 'tecnologico', 'otro'];
const TIPOS_LOCACION = ['presencial', 'virtual', 'hibrido'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

// =================== VALIDACIONES DE USUARIOS (UNIFICADAS Y MEJORADAS) ===================

// Validaciones para registro de usuario (versión completa combinada)
const validateUserRegistration = [
    body('nombre_usuario')
        .isLength({ min: 3, max: 50 })
        .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('El nombre de usuario solo puede contener letras, números, guiones y guiones bajos'),
    
    body('correo')
        .isEmail()
        .withMessage('Debe proporcionar un correo electrónico válido')
        .normalizeEmail(),
    
    body('contrasena')
        .isLength({ min: 8 })
        .withMessage('La contraseña debe tener al menos 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La contraseña debe contener al menos una letra minúscula, una mayúscula y un número'),
    
    body('tipo_usuario')
        .isIn(['Empresa', 'ONG', 'Integrante externo', 'Super admin'])
        .withMessage('Tipo de usuario no válido'),
    
    // Validaciones condicionales según el tipo de usuario (del archivo 2)
    body('nombre_empresa')
        .if(body('tipo_usuario').equals('Empresa'))
        .notEmpty()
        .withMessage('El nombre de la empresa es requerido')
        .isLength({ max: 100 })
        .withMessage('El nombre de la empresa no puede exceder 100 caracteres'),
    
    body('NIT')
        .if(body('tipo_usuario').isIn(['Empresa', 'ONG']))
        .notEmpty()
        .withMessage('El NIT es requerido para empresas y ONGs')
        .isLength({ min: 8, max: 15 })
        .withMessage('El NIT debe tener entre 8 y 15 caracteres'),
    
    body('nombre_ONG')
        .if(body('tipo_usuario').equals('ONG'))
        .notEmpty()
        .withMessage('El nombre de la ONG es requerido')
        .isLength({ max: 100 })
        .withMessage('El nombre de la ONG no puede exceder 100 caracteres'),
    
    body('nombres')
        .if(body('tipo_usuario').equals('Integrante externo'))
        .notEmpty()
        .withMessage('Los nombres son requeridos para integrantes externos')
        .isLength({ max: 50 })
        .withMessage('Los nombres no pueden exceder 50 caracteres'),
    
    body('apellidos')
        .if(body('tipo_usuario').equals('Integrante externo'))
        .notEmpty()
        .withMessage('Los apellidos son requeridos para integrantes externos')
        .isLength({ max: 50 })
        .withMessage('Los apellidos no pueden exceder 50 caracteres'),
    
    body('telefono')
        .optional()
        .isMobilePhone('any')
        .withMessage('Número de teléfono inválido'),
    
    body('sitio_web')
        .optional()
        .isURL()
        .withMessage('URL del sitio web inválida'),
    
    body('email')
        .if(body('tipo_usuario').equals('Integrante externo'))
        .optional()
        .isEmail()
        .withMessage('Correo electrónico inválido')
        .normalizeEmail(),
    
    handleValidationErrors
];

// Validaciones para login
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Debe proporcionar un correo electrónico válido')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('La contraseña es requerida'),
    
    handleValidationErrors
];

// Validaciones para cambio de contraseña
const validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('La contraseña actual es requerida'),
    
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('La nueva contraseña debe tener al menos 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La nueva contraseña debe contener al menos una letra minúscula, una mayúscula y un número'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Las contraseñas no coinciden');
            }
            return true;
        }),
    
    handleValidationErrors
];

// Validación para recuperación de contraseña
const validatePasswordReset = [
    body('email')
        .isEmail()
        .withMessage('Debe proporcionar un correo electrónico válido')
        .normalizeEmail(),
    
    handleValidationErrors
];

// Validación para restablecer contraseña
const validatePasswordResetConfirm = [
    body('token')
        .notEmpty()
        .withMessage('El token es requerido'),
    
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('La nueva contraseña debe tener al menos 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La nueva contraseña debe contener al menos una letra minúscula, una mayúscula y un número'),
    
    handleValidationErrors
];

// Validación personalizada para archivos
const validateFileUpload = (req, res, next) => {
    if (req.file) {
        // Validar tipo de archivo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                error: 'Tipo de archivo no permitido. Solo se permiten imágenes JPEG, PNG y GIF.'
            });
        }
        
        // Validar tamaño de archivo (máximo 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (req.file.size > maxSize) {
            return res.status(400).json({
                success: false,
                error: 'El archivo es demasiado grande. Máximo permitido: 5MB.'
            });
        }
    }
    next();
};

// Sanitizar entrada de texto
const sanitizeInput = (req, res, next) => {
    // Sanitizar campos de texto para prevenir XSS
    const sanitizeString = (str) => {
        if (typeof str === 'string') {
            return validator.escape(str.trim());
        }
        return str;
    };

    // Aplicar sanitización a campos específicos
    const fieldsToSanitize = [
        'nombre_usuario', 'nombre_empresa', 'nombre_ONG', 
        'nombres', 'apellidos', 'descripcion', 'direccion'
    ];

    fieldsToSanitize.forEach(field => {
        if (req.body[field]) {
            req.body[field] = sanitizeString(req.body[field]);
        }
    });

    next();
};

// =================== VALIDACIONES PARA EVENTOS REGULARES ===================

const validateEvent = [
    body('titulo')
        .notEmpty()
        .withMessage('El título es requerido')
        .isLength({ min: 3, max: 200 })
        .withMessage('El título debe tener entre 3 y 200 caracteres')
        .trim(),

    body('fechaInicio')
        .notEmpty()
        .withMessage('La fecha de inicio es requerida')
        .isISO8601()
        .withMessage('La fecha de inicio debe tener formato válido'),

    body('tipoEvento')
        .notEmpty()
        .withMessage('El tipo de evento es requerido')
        .isIn(['conferencia', 'taller', 'seminario', 'capacitacion', 'voluntariado', 'fundraising', 'cultural', 'deportivo', 'otro'])
        .withMessage('Tipo de evento no válido'),

    body('ongId')
        .notEmpty()
        .withMessage('El ID de la ONG es requerido')
        .isInt({ min: 1 })
        .withMessage('El ID de la ONG debe ser un número entero positivo'),

    body('locacion')
        .notEmpty()
        .withMessage('La ubicación es requerida'),

    body('fechaFinal')
        .optional()
        .isISO8601()
        .withMessage('La fecha final debe tener formato válido')
        .custom((value, { req }) => {
            if (value) {
                const fechaFinal = new Date(value);
                const fechaInicio = new Date(req.body.fechaInicio);
                if (fechaFinal <= fechaInicio) {
                    throw new Error('La fecha final debe ser posterior a la fecha de inicio');
                }
            }
            return true;
        }),

    body('capacidadMaxima')
        .optional()
        .isInt({ min: 1, max: 5000 })
        .withMessage('La capacidad máxima debe ser un número entre 1 y 5,000'),

    handleValidationErrors
];

const validateEventParticipant = [
    body('integranteId')
        .notEmpty()
        .withMessage('El ID del integrante es requerido')
        .isInt({ min: 1 })
        .withMessage('El ID del integrante debe ser un número entero positivo'),

    body('tipoParticipante')
        .optional()
        .isIn(['participante', 'voluntario', 'ponente', 'organizador'])
        .withMessage('Tipo de participante inválido'),

    handleValidationErrors
];

// =================== VALIDACIONES PARA MEGA EVENTOS ===================

const validateMegaEvent = [
  body('titulo')
    .notEmpty()
    .withMessage('El título es requerido')
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres')
    .trim(),

  body('descripcion')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('La descripción no puede exceder 5000 caracteres')
    .trim(),

  body('fechaInicio')
    .notEmpty()
    .withMessage('La fecha de inicio es requerida')
    .isISO8601()
    .withMessage('La fecha de inicio debe tener formato válido (ISO 8601)')
    .custom((value) => {
      const fecha = new Date(value);
      const ahora = new Date();
      const unDiaAtras = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      
      if (fecha < unDiaAtras) {
        throw new Error('La fecha de inicio no puede ser más de 1 día en el pasado');
      }
      return true;
    }),

  body('fechaFin')
    .notEmpty()
    .withMessage('La fecha de fin es requerida')
    .isISO8601()
    .withMessage('La fecha de fin debe tener formato válido (ISO 8601)')
    .custom((value, { req }) => {
      const fechaFin = new Date(value);
      const fechaInicio = new Date(req.body.fechaInicio);
      
      if (fechaFin <= fechaInicio) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
      
      const diferenciaDias = (fechaFin - fechaInicio) / (1000 * 60 * 60 * 24);
      if (diferenciaDias > 30) {
        throw new Error('La duración del mega evento no puede exceder 30 días');
      }
      
      return true;
    }),

  body('ubicacion')
    .notEmpty()
    .withMessage('La ubicación es requerida'),

  body('categoria')
    .optional()
    .isIn(CATEGORIAS_VALIDAS)
    .withMessage(`La categoría debe ser una de: ${CATEGORIAS_VALIDAS.join(', ')}`),

  body('ongOrganizadoraPrincipal')
    .notEmpty()
    .withMessage('La ONG organizadora principal es requerida')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG organizadora debe ser un número entero positivo'),

  body('capacidadMaxima')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('La capacidad máxima debe ser un número entre 1 y 10,000'),

  body('estado')
    .optional()
    .isIn(ESTADOS_VALIDOS)
    .withMessage(`El estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`),

  body('prioridad')
    .optional()
    .isIn(PRIORIDADES)
    .withMessage(`La prioridad debe ser una de: ${PRIORIDADES.join(', ')}`),

  body('requiereAprobacion')
    .optional()
    .isBoolean()
    .withMessage('RequiereAprobacion debe ser true o false'),

  body('esPublico')
    .optional()
    .isBoolean()
    .withMessage('EsPublico debe ser true o false'),

  handleValidationErrors
];

const validateParticipant = [
  body('integranteId')
    .notEmpty()
    .withMessage('El ID del integrante es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID del integrante debe ser un número entero positivo'),

  body('tipoParticipacion')
    .optional()
    .isIn(['participante', 'voluntario', 'ponente', 'facilitador', 'invitado_especial'])
    .withMessage('Tipo de participación inválido'),

  body('disponibilidad')
    .optional()
    .isIn(['completa', 'parcial', 'horarios_especificos'])
    .withMessage('La disponibilidad debe ser: completa, parcial o horarios_especificos'),

  body('comentarios')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Los comentarios no pueden exceder 1000 caracteres')
    .trim(),

  handleValidationErrors
];

// =================== VALIDACIONES COMPARTIDAS ===================

const validateStatusChange = [
  body('nuevoEstado')
    .notEmpty()
    .withMessage('El nuevo estado es requerido'),

  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo'),

  body('motivo')
    .optional()
    .isLength({ max: 500 })
    .withMessage('El motivo no puede exceder 500 caracteres')
    .trim(),

  handleValidationErrors
];

const validateAttendance = [
  body('integranteId')
    .notEmpty()
    .withMessage('El ID del integrante es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID del integrante debe ser un número entero positivo'),

  body('asistencia')
    .notEmpty()
    .withMessage('El campo asistencia es requerido')
    .isBoolean()
    .withMessage('La asistencia debe ser true o false'),

  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo'),

  handleValidationErrors
];

const validateSponsor = [
  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo'),

  body('empresaId')
    .notEmpty()
    .withMessage('El ID de la empresa es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la empresa debe ser un número entero positivo'),

  body('tipoPatrocinio')
    .notEmpty()
    .withMessage('El tipo de patrocinio es requerido')
    .isIn(['principal', 'oro', 'plata', 'bronce', 'colaborador', 'auspiciador'])
    .withMessage('Tipo de patrocinio inválido'),

  body('montoContribucion')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El monto de contribución debe ser un número positivo'),

  body('descripcionContribucion')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres')
    .trim(),

  handleValidationErrors
];

const validateOrganizer = [
  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG actual es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo'),

  body('nuevaOngId')
    .notEmpty()
    .withMessage('El ID de la nueva ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la nueva ONG debe ser un número entero positivo'),

  body('rolOrganizacion')
    .optional()
    .isIn(['coordinador_principal', 'co_organizador', 'colaborador', 'apoyo'])
    .withMessage('Rol de organización inválido'),

  handleValidationErrors
];

const validateDelete = [
  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo'),

  handleValidationErrors
];

// =================== EXPORTS ===================

module.exports = {
    // Validaciones de usuarios (completas y unificadas)
    validateUserRegistration,
    validateLogin,
    validatePasswordChange,
    validatePasswordReset,
    validatePasswordResetConfirm,
    validateFileUpload,
    sanitizeInput,
    handleValidationErrors,
    
    // Validaciones para eventos regulares
    validateEvent,
    validateEventParticipant,
    
    // Validaciones para mega eventos
    validateMegaEvent,
    validateParticipant,
    
    // Validaciones compartidas
    validateStatusChange,
    validateAttendance,
    validateSponsor,
    validateOrganizer,
    validateDelete,
    
    // Constantes
    ESTADOS_VALIDOS,
    CATEGORIAS_VALIDAS,
    TIPOS_LOCACION,
    PRIORIDADES
};