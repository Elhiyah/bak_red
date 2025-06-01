const Invitado = require('../models/Invitado'); // Asegúrate de que la ruta sea correcta

// Función auxiliar para manejar errores de manera consistente
const handleErrors = (res, error, message = "Error interno del servidor") => {
  console.error(error);
  return res.status(500).json({ success: false, error: error.message || message });
};

const invitadoController = {
  // Crear un nuevo invitado
  crearInvitado: async (req, res) => {
    try {
      const nuevoInvitado = new Invitado(req.body);
      const invitadoGuardado = await nuevoInvitado.save();
      res.status(201).json({ success: true, data: invitadoGuardado, message: "Invitado creado exitosamente" });
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error (e.g., carnet o gmail)
        const field = error.keyPattern.carnet ? 'Carnet' : error.keyPattern.gmail ? 'Gmail' : 'Campo';
        return res.status(400).json({ success: false, error: `${field} ya está registrado` });
      }
      handleErrors(res, error, "Error al crear invitado");
    }
  },

  // Obtener todos los invitados (o filtrados por evento)
  obtenerInvitados: async (req, res) => {
    try {
      const { evento_id } = req.params;
      const filtros = req.query; // Para filtros adicionales (tipo_invitado, asistencia)

      const invitados = await Invitado.buscarPorEvento(Number(evento_id), filtros); // Asegúrate de convertir evento_id a número
      res.json({ success: true, data: invitados });
    } catch (error) {
      handleErrors(res, error, "Error al obtener invitados");
    }
  },

  // Obtener un invitado por ID
  obtenerInvitadoPorId: async (req, res) => {
    try {
      const { id } = req.params;
      const invitado = await Invitado.findById(id);
      if (!invitado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      res.json({ success: true, data: invitado });
    } catch (error) {
      handleErrors(res, error, "Error al obtener invitado");
    }
  },

  // Actualizar un invitado
  actualizarInvitado: async (req, res) => {
    try {
      const { id } = req.params;
      const invitadoActualizado = await Invitado.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
      if (!invitadoActualizado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      res.json({ success: true, data: invitadoActualizado, message: "Invitado actualizado exitosamente" });
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
          const field = error.keyPattern.carnet ? 'Carnet' : error.keyPattern.gmail ? 'Gmail' : 'Campo';
          return res.status(400).json({ success: false, error: `${field} ya está registrado` });
        }
      handleErrors(res, error, "Error al actualizar invitado");
    }
  },

  // Eliminar un invitado (marcar como inactivo)
  eliminarInvitado: async (req, res) => {
    try {
      const { id } = req.params;
      const invitadoEliminado = await Invitado.findByIdAndUpdate(id, { activo: false }, { new: true });
      if (!invitadoEliminado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      res.json({ success: true, message: "Invitado eliminado (inactivado) exitosamente" });
    } catch (error) {
      handleErrors(res, error, "Error al eliminar invitado");
    }
  },

  // Confirmar asistencia de un invitado
  confirmarAsistencia: async (req, res) => {
    try {
      const { id } = req.params;
      const invitado = await Invitado.findById(id);
      if (!invitado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      await invitado.confirmarAsistencia();
      res.json({ success: true, message: "Asistencia confirmada" });
    } catch (error) {
      handleErrors(res, error, "Error al confirmar asistencia");
    }
  },

  // Registrar check-in
  registrarCheckIn: async (req, res) => {
    try {
      const { id } = req.params;
      const invitado = await Invitado.findById(id);
      if (!invitado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      await invitado.registrarCheckIn();
      res.json({ success: true, message: "Check-in registrado" });
    } catch (error) {
      handleErrors(res, error, "Error al registrar check-in");
    }
  },

  // Registrar check-out
  registrarCheckOut: async (req, res) => {
    try {
      const { id } = req.params;
      const invitado = await Invitado.findById(id);
      if (!invitado) {
        return res.status(404).json({ success: false, error: "Invitado no encontrado" });
      }
      await invitado.registrarCheckOut();
      res.json({ success: true, message: "Check-out registrado" });
    } catch (error) {
      handleErrors(res, error, "Error al registrar check-out");
    }
  },

  // Obtener estadísticas del evento
  obtenerEstadisticasEvento: async (req, res) => {
    try {
      const { evento_id } = req.params;
      const estadisticas = await Invitado.estadisticasEvento(Number(evento_id)); // Asegúrate de convertir evento_id a número
      res.json({ success: true, data: estadisticas.length > 0 ? estadisticas[0] : {} }); // Devuelve un objeto vacío si no hay estadísticas
    } catch (error) {
      handleErrors(res, error, "Error al obtener estadísticas del evento");
    }
  }

};

module.exports = invitadoController;