-- 1. Crear la base de datos para el portafolio
CREATE DATABASE SIPA_Portfolio;
GO

USE SIPA_Portfolio;
GO

-- 2. Crear la tabla de aterrizaje (Staging)
CREATE TABLE stg_reportes_bacheo (
    id_folio VARCHAR(20) PRIMARY KEY,
    fecha_solicitud DATE,
    estatus VARCHAR(50),
    fecha_concluido DATE,
    alcaldia VARCHAR(100),
    colonia_datos VARCHAR(150),
    latitud DECIMAL(10, 6),
    longitud DECIMAL(10, 6),
    celda_geo VARCHAR(50)
);
GO


