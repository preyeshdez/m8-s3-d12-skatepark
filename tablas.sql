CREATE TABLE skaters(
	id SERIAL PRIMARY KEY,
	email VARCHAR(125) UNIQUE NOT NULL,
	nombre VARCHAR(25) NOT NULL,
	password VARCHAR(25) NOT NULL,
	anos_experiencia INT NOT NULL,
	especialidad VARCHAR(50) NOT NULL,
	foto VARCHAR(225) NOT NUll
)

CREATE TABLE administradores(
	id SERIAL PRIMARY KEY,
	estado BOOLEAN NOT NULL DEFAULT true,
	id_skater INT NOT NULL REFERENCES SKATERS(id)
);


INSERT INTO administradores values
(default, default, 3);



SELECT * FROM SKATERS s
INNER JOIN administradores a
ON s.id = a.id_skater;
