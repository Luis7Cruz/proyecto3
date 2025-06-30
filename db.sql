-- Tabla de Dimensión: DimClientes
CREATE TABLE DimClientes (
    cliente_id SERIAL PRIMARY KEY,
    nombre_cliente VARCHAR(255),
    genero VARCHAR(50),
    estado_civil VARCHAR(50),
    score_credito INTEGER -- o el tipo adecuado
    -- otros atributos del cliente
);

-- Tabla de Dimensión: DimCalendario
CREATE TABLE DimCalendario (
    fecha_id INT PRIMARY KEY, -- Usar un INT para fecha_id (YYYYMMDD) es común
    fecha DATE,
    dia_de_semana VARCHAR(20),
    nombre_mes VARCHAR(20),
    mes INTEGER,
    trimestre INTEGER,
    anio INTEGER
    -- otros atributos de calendario
);

-- Tabla de Dimensión: DimProductos
CREATE TABLE DimProductos (
    producto_id SERIAL PRIMARY KEY,
    nombre_producto VARCHAR(255),
    categoria_producto VARCHAR(100),
    precio_unitario NUMERIC(10, 2)
    -- otros atributos del producto
);

-- Tabla de Dimensión: DimTiendas
CREATE TABLE DimTiendas (
    tienda_id SERIAL PRIMARY KEY,
    nombre_tienda VARCHAR(255),
    ciudad_tienda VARCHAR(100),
    region_tienda VARCHAR(100)
    -- otros atributos de la tienda
);

-- Tabla de Hechos: FactVentas (tu tabla 'ventas' actual)
-- Asegúrate de que tus FKs referencien las PKs de las dimensiones
CREATE TABLE FactVentas (
    venta_id SERIAL PRIMARY KEY,
    fecha_id INT REFERENCES DimCalendario(fecha_id),
    cliente_id INT REFERENCES DimClientes(cliente_id),
    producto_id INT REFERENCES DimProductos(producto_id),
    tienda_id INT REFERENCES DimTiendas(tienda_id),
    cantidad_vendida INTEGER,
    precio_venta NUMERIC(10, 2),
    total_venta NUMERIC(10, 2) -- Esta sería tu columna 'ventas' actual
    -- otras métricas
);

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  rol TEXT
);