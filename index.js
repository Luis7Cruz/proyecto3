// index.js (para tu NUEVO PROYECTO de backend del Data Warehouse)

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // Para crear y verificar JWTs
const bcrypt = require('bcryptjs'); // Para hashear y comparar contraseñas
const { Pool } = require('pg'); // Para interactuar con PostgreSQL

const app = express();
const port = 3001; // Puerto donde correrá este backend
const SECRET_KEY = 'cadena_larga_unica_12345678_segura'; // ¡CAMBIA ESTO POR UNA CADENA LARGA Y ALEATORIA Y ÚNICA!

// ----------------------------------------------------
// Configuración de la Conexión a la Base de Datos
// Este Pool se conectará a tu base de datos 'almacen'
// donde se espera que estén las tablas de usuarios y de tu modelo dimensional.
// ----------------------------------------------------
const dwPool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'almacen',
    password: '1234', // <-- ¡AJUSTA ESTO A LA CONTRASEÑA DE TU USUARIO POSTGRES!
    port: 5432,
});

// Middlewares de Express
app.use(cors()); // Permite solicitudes desde otros orígenes (ej. tu frontend en 3000/5173)
app.use(express.json()); // Habilita Express para parsear cuerpos de solicitud JSON

// ----------------------------------------------------
// Rutas de Autenticación
// ----------------------------------------------------

// 🔐 Ruta para iniciar sesión
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[AUTH] Intentando login con usuario: ${username}`);

    try {
        // Consulta la tabla 'usuarios' en la base de datos 'almacen'
        const user = await dwPool.query('SELECT * FROM usuarios WHERE username=$1', [username]);

        if (user.rows.length === 0) {
            console.log(`[AUTH] Usuario '${username}' no encontrado.`);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Compara la contraseña proporcionada con el hash almacenado
        const match = await bcrypt.compare(password, user.rows[0].password);
        if (!match) {
            console.log(`[AUTH] Contraseña incorrecta para usuario: ${username}`);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Si las credenciales son correctas, genera un JSON Web Token
        const token = jwt.sign({ id: user.rows[0].id, rol: user.rows[0].rol }, SECRET_KEY, { expiresIn: '1h' }); // Token expira en 1 hora
        console.log(`[AUTH] Login exitoso para usuario: ${username}. Token generado.`);
        res.json({ token });

    } catch (err) {
        console.error(`[AUTH] Error en login del nuevo DW backend:`, err);
        res.status(500).json({ message: "Error del servidor al intentar iniciar sesión" });
    }
});

// ✅ Ruta opcional para crear un usuario inicial con contraseña encriptada
app.post('/crear-usuario', async (req, res) => {
    const { username, password, rol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Encripta la contraseña
        await dwPool.query( // Inserta el nuevo usuario en la tabla 'usuarios'
            'INSERT INTO usuarios (username, password, rol) VALUES ($1, $2, $3)',
            [username, hashedPassword, rol]
        );
        console.log(`[AUTH] Usuario '${username}' creado exitosamente.`);
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error("[AUTH] Error al crear usuario:", error);
        if (error.code === '23505') { // Código de error para unique_violation (si el username ya existe)
            return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
        }
        res.status(500).json({ message: 'Error del servidor al crear usuario.' });
    }
});

// ----------------------------------------------------
// Middleware de Autenticación
// Se usa para proteger las rutas que requieren que el usuario esté logueado.
// ----------------------------------------------------
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extrae el token del formato "Bearer TOKEN"

    if (!token) {
        console.log("[AUTH] Acceso denegado: No se proporcionó token.");
        return res.status(403).json({ message: 'Acceso denegado: No se proporcionó token.' });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            console.error("[AUTH] Token inválido o expirado:", err.message);
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }
        req.user = decoded; // Adjunta la información del usuario decodificada a la solicitud
        next(); // Continúa a la siguiente función de middleware o ruta
    });
}

// ----------------------------------------------------
// Rutas de Datos del Data Warehouse (Protegidas)
// ¡Esta sección ha sido ACTUALIZADA para usar tu MODELO DIMENSIONAL!
// ----------------------------------------------------

// 🚀 Ruta para obtener datos dinámicos (agrupación y filtrado)
// Utiliza FactVentas y las tablas de Dimensión
app.get('/dashboard/dynamic-data', verifyToken, async (req, res) => {
    try {
        // La métrica por defecto ahora apunta a la columna 'total_venta' en FactVentas
        const { groupBy, filters, startDate, endDate, metric = 'SUM(fv.total_venta)' } = req.query; // CAMBIADO: monto_venta a total_venta

        // --- Campos permitidos para agrupación y filtrado en el modelo dimensional ---
        // AJUSTA ESTOS CAMPOS exactamente a los nombres de COLUMNAS en tus tablas de dimensión
        // y usa alias (ej. dc.genero, dp.categoria_producto)
        const allowedGroupByFields = [
            'dc.genero', 'dc.estado_civil', 'dc.score_credito', // De DimClientes (eliminado 'dc.edad' que no existe)
            'dcal.fecha', 'dcal.dia_de_semana', 'dcal.nombre_mes', 'dcal.mes', 'dcal.trimestre', 'dcal.anio', // De DimCalendario (cambiado 'dcal.fecha_completa' a 'dcal.fecha')
            'dp.nombre_producto', 'dp.categoria_producto', // De DimProductos (cambiado 'dp.categoria' a 'dp.categoria_producto')
            'dt.nombre_tienda', 'dt.ciudad_tienda', 'dt.region_tienda' // De DimTiendas (cambiado 'dt.region' a 'dt.region_tienda')
        ];
        const allowedFilterFields = allowedGroupByFields; // Para simplificar, los mismos campos para filtrar

        let selectFields = [metric + ' AS total_metrica'];
        let groupByClause = '';
        let fromClause = `FROM FactVentas fv`; // Tu tabla de hechos principal

        // --- JOINs a las tablas de dimensión ---
        // Estos JOINs son ABSOLUTAMENTE CRUCIALES para que la consulta funcione
        // Asegúrate que los nombres de las tablas y las columnas de JOIN sean exactos a tu DB
        let joinClauses = `
            JOIN DimClientes dc ON fv.cliente_id = dc.cliente_id     -- ¡CORREGIDO!
            JOIN DimCalendario dcal ON fv.fecha_id = dcal.fecha_id   -- ¡CORREGIDO!
            JOIN DimProductos dp ON fv.producto_id = dp.producto_id -- ¡CORREGIDO!
            JOIN DimTiendas dt ON fv.tienda_id = dt.tienda_id       -- ¡CORREGIDO!
        `;

        if (groupBy) {
            const groupFields = groupBy.split(',').map(field => field.trim());
            const validatedGroupFields = groupFields.filter(field => allowedGroupByFields.includes(field));

            if (validatedGroupFields.length === 0 && groupFields.length > 0) {
                return res.status(400).json({ message: 'Campos de agrupación no válidos.' });
            }
            selectFields = validatedGroupFields.concat(selectFields); // Añade campos de agrupación al SELECT
            groupByClause = `GROUP BY ${validatedGroupFields.join(', ')}`;
        }

        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        // Filtro por rango de fechas (obligatorio) usando DimCalendario
        if (startDate && endDate) {
            // Asume que DimCalendario tiene una columna 'fecha' de tipo DATE
            whereConditions.push(`dcal.fecha BETWEEN $${paramIndex++} AND $${paramIndex++}`); // CAMBIADO: fecha_completa a fecha
            queryParams.push(startDate, endDate);
        } else {
            return res.status(400).json({ message: 'Se requieren los parámetros startDate y endDate.' });
        }

        // Manejar filtros dinámicos (si el frontend los envía)
        if (filters) {
            let parsedFilters;
            try {
                parsedFilters = JSON.parse(filters);
            } catch (e) {
                console.error("[DW_DATA] Error al parsear filtros JSON:", e);
                return res.status(400).json({ message: 'Formato de filtros inválido.' });
            }

            const allowedOperators = ['=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE'];

            for (const filter of parsedFilters) {
                const { field, operator, value } = filter;
                // Asegúrate de que el campo del filtro sea uno de los permitidos del modelo dimensional
                if (allowedFilterFields.includes(field) && allowedOperators.includes(operator)) {
                    whereConditions.push(`${field} ${operator} $${paramIndex++}`);
                    queryParams.push(operator.includes('LIKE') || operator.includes('ILIKE') ? `%${value}%` : value);
                } else {
                    return res.status(400).json({ message: `Filtro inválido o campo no permitido: ${field} ${operator}` });
                }
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // --- Construcción de la Consulta SQL Final (con JOINs al modelo dimensional) ---
        const queryString = `
            SELECT
                ${selectFields.join(', ')}
            ${fromClause}
            ${joinClauses}
            ${whereClause}
            ${groupByClause}
            ORDER BY total_metrica DESC;
        `;

        console.log("[DW_DATA] SQL Query (Dimensional):", queryString); // Para depuración
        console.log("[DW_DATA] Query Params (Dimensional):", queryParams); // Para depuración

        const result = await dwPool.query(queryString, queryParams);
        res.json(result.rows);

    } catch (error) {
        console.error("[DW_DATA] Error al obtener datos dinámicos del dashboard (Dimensional):", error);
        // Devuelve el mensaje de error de PostgreSQL si es posible para una mejor depuración
        res.status(500).json({ error: 'Error interno del servidor al obtener datos dinámicos.', details: error.message });
    }
});

// ----------------------------------------------------
// Inicio del Servidor
// ----------------------------------------------------
app.listen(port, () => {
    console.log(`✅ Nuevo API del Data Warehouse corriendo en http://localhost:${port}`);
});