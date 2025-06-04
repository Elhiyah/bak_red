const { poolPromise } = require('../config/db');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Función auxiliar para insertar funciones específicas por tipo de usuario
const insertEmpresa = async (transaction, userId, data) => {
    const { nombre_empresa, NIT, direccion, telefono, sitio_web, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombre_empresa', nombre_empresa)
        .input('NIT', NIT)
        .input('direccion', direccion || null)
        .input('telefono', telefono || null)
        .input('sitio_web', sitio_web || null)
        .input('descripcion', descripcion || null)
        .query(`
            INSERT INTO empresas 
            (id_usuario, nombre_empresa, NIT, direccion, telefono, sitio_web, descripcion)
            VALUES (@id_usuario, @nombre_empresa, @NIT, @direccion, @telefono, @sitio_web, @descripcion)
        `);
};

const insertONG = async (transaction, userId, data) => {
    const { nombre_ong, NIT, direccion, telefono, sitio_web, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombre_ong', nombre_ong)
        .input('NIT', NIT)
        .input('direccion', direccion || null)
        .input('telefono', telefono || null)
        .input('sitio_web', sitio_web || null)
        .input('descripcion', descripcion || null)
        .query(`
            INSERT INTO ONGS 
            (id_usuario, nombre_ong, NIT, direccion, telefono, sitio_web, descripcion)
            VALUES (@id_usuario, @nombre_ong, @NIT, @direccion, @telefono, @sitio_web, @descripcion)
        `);
};

const insertIntegrante = async (transaction, userId, data) => {
    const { nombres, apellidos, fecha_nacimiento, email, PhoneNumber, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombres', nombres)
        .input('apellidos', apellidos)
        .input('fecha_nacimiento', fecha_nacimiento || null)
        .input('email', email || null)
        .input('PhoneNumber', PhoneNumber || null)
        .input('descripcion', descripcion || null)
        .query(`
            INSERT INTO integrantes_externos 
            (id_usuario, nombres, apellidos, fecha_nacimiento, email, PhoneNumber, descripcion)
            VALUES (@id_usuario, @nombres, @apellidos, @fecha_nacimiento, @email, @PhoneNumber, @descripcion)
        `);
};

const insertSuperAdmin = async (transaction, userId, data) => {
    const { nivel_acceso } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nivel_acceso', nivel_acceso || 'super_admin')
        .query(`
            INSERT INTO super_admins 
            (id_usuario, nivel_acceso)
            VALUES (@id_usuario, @nivel_acceso)
        `);
};

// Función para generar 
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = async (req, res) => {
    const { tipo_usuario, nombre_usuario, correo, contrasena, ...rest } = req.body;

    // Validación básica
    if (!tipo_usuario || !nombre_usuario || !correo || !contrasena) {
        return res.status(400).json({ 
            success: false,
            error: "Faltan campos requeridos: tipo_usuario, nombre_usuario, correo, contrasena" 
        });
    }

    // Declarar variables en el scope principal
    let newUserId = null;
    let mongoUser = null;

    try {
        // Verificar si el usuario ya existe en MongoDB
        const existingMongoUser = await User.findOne({
            $or: [{ correo }, { nombre_usuario }]
        });

        if (existingMongoUser) {
            return res.status(400).json({
                success: false,
                error: "El usuario ya existe en el sistema"
            });
        }

        const pool = await poolPromise;
        const transaction = pool.transaction();
        
        await transaction.begin();

        try {
            // Insertar en SQL Server
            const usuarioResult = await transaction.request()
                .input('nombre_usuario', nombre_usuario)
                .input('correo', correo)
                .input('contrasena', contrasena)
                .input('tipo_usuario', tipo_usuario)
                .query(`
                    INSERT INTO usuarios 
                    (nombre_usuario, correo_electronico, contrasena, tipo_usuario)
                    OUTPUT INSERTED.id_usuario
                    VALUES (@nombre_usuario, @correo, @contrasena, @tipo_usuario)
                `);

            newUserId = usuarioResult.recordset[0].id_usuario;

            // Insertar en tabla específica según tipo de usuario en SQL Server
            switch(tipo_usuario) {
                case 'Empresa':
                    await insertEmpresa(transaction, newUserId, rest);
                    break;
                case 'ONG':
                    console.log('REST recibido para ONG:', rest);
                    await insertONG(transaction, newUserId, rest);
                    break;
                case 'Integrante externo':
                    await insertIntegrante(transaction, newUserId, rest);
                    break;
                case 'Super admin':
                    await insertSuperAdmin(transaction, newUserId, rest);
                    break;
                default:
                    throw new Error('Tipo de usuario no válido');
            }

            // Crear usuario en MongoDB
            mongoUser = new User({
                sqlUserId: newUserId,
                nombre_usuario,
                correo,
                contrasena, // Se hasheará automáticamente por el middleware
                tipo_usuario
            });

            await mongoUser.save();
            await transaction.commit();
            
            // Generar token JWT
            const token = generateToken(mongoUser._id);

            res.status(201).json({
                success: true,
                message: "Usuario registrado exitosamente",
                user: mongoUser.toSafeObject(),
                token
            });

        } catch (error) {

            console.error('❌ Error original en registro:', error);
            if (error.precedingErrors && Array.isArray(error.precedingErrors)) {
                console.error('❌ Detalle SQL:', error.precedingErrors);
            }

            await transaction.rollback();
            
            // Si hay error, también eliminar de MongoDB si se creó
            if (mongoUser && mongoUser._id) {
                await User.findByIdAndDelete(mongoUser._id).catch(() => {});
            }
            
            throw error;
        }

    } catch (error) {
        console.error('Error en registro:', error);

        // Cleanup adicional en caso de error
        if (newUserId && mongoUser && mongoUser._id) {
            await User.findByIdAndDelete(mongoUser._id).catch(() => {});
        }

        // Manejar errores de SQL Server
        if (error.number === 2627) {
            const field = error.message.includes('nombre_usuario') ? 'nombre de usuario' : 
                         error.message.includes('correo_electronico') ? 'correo electrónico' :
                         error.message.includes('NIT') ? 'NIT' : 'campo único';
            
            return res.status(400).json({
                success: false,
                error: `El ${field} ya está registrado`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || "Error en el servidor"
        });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "Email y contraseña son requeridos." 
        });
    }

    try {
        // Buscar usuario en MongoDB
        const mongoUser = await User.findOne({ correo: email, activo: true });
        
        if (!mongoUser) {
            return res.status(404).json({ 
                success: false,
                error: "Usuario no encontrado." 
            });
        }

        // Verificar contraseña
        const isPasswordValid = await mongoUser.comparePassword(password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false,
                error: "Contraseña incorrecta." 
            });
        }

        // Verificar que el usuario también exista en SQL Server
        const pool = await poolPromise;
        const sqlResult = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .query('SELECT * FROM usuarios WHERE id_usuario = @id_usuario AND activo = 1');

        if (sqlResult.recordset.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Usuario no encontrado en el sistema principal." 
            });
        }

        // Actualizar último acceso
        mongoUser.ultimoAcceso = new Date();
        
        // Generar token y registrar sesión
        const token = generateToken(mongoUser._id);
        
        mongoUser.sesiones.push({
            token: token.substring(0, 20) + '...', // Solo guardamos parte del token por seguridad
            dispositivo: req.headers['user-agent'] || 'Unknown',
            ip: req.ip || req.connection.remoteAddress
        });

        await mongoUser.save();

        res.json({ 
            success: true,
            message: "Login exitoso",
            user: mongoUser.toSafeObject(),
            token
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false,
            error: "Error interno del servidor." 
        });
    }
};

const logout = async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token && req.user) {
            // Marcar sesión como inactiva en MongoDB
            await User.findByIdAndUpdate(req.user.userId, {
                $set: { 'sesiones.$[elem].activa': false }
            }, {
                arrayFilters: [{ 'elem.token': { $regex: token.substring(0, 20) } }]
            });
        }

        res.status(200).json({ 
            success: true,
            message: 'Sesión cerrada exitosamente.' 
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ 
            success: false,
            error: "Error al cerrar sesión." 
        });
    }
};

// Función para obtener perfil del usuario
const getProfile = async (req, res) => {
    try {
        const mongoUser = await User.findById(req.user.userId);
        
        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Obtener datos adicionales de SQL Server
        const pool = await poolPromise;
        const sqlResult = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .query('SELECT * FROM usuarios WHERE id_usuario = @id_usuario');

        const sqlUser = sqlResult.recordset[0];

        res.json({
            success: true,
            user: {
                ...mongoUser.toSafeObject(),
                sqlData: {
                    ...sqlUser,
                    contrasena: undefined // No enviar contraseña
                }
            }
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

module.exports = { 
    registerUser, 
    login, 
    logout, 
    getProfile 
};