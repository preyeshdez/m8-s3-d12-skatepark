import express from "express";
import { create } from "express-handlebars";
import fileUpload from 'express-fileupload';
import {v4 as uuid } from 'uuid';
import db from "./database/config.js";
import jwt from "jsonwebtoken";
import verifyToken from "./utils/jwtVerify.js"
import adminVerify  from "./utils/adminVerify.js"
import fs from "fs";

import * as path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const secretSignature = "secreto";

const hbs = create({
	partialsDir: [
		path.resolve(__dirname, "./views/partials/"),
	],
});


app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");
app.set("views", path.resolve(__dirname, "./views"));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
});

//MIDDLEWARES GENERALES
app.use(express.json());
app.use(express.static("public"));

let maxSizeImage = 2;
app.use(fileUpload({
    limits: { fileSize: maxSizeImage * 1024 * 1024 },
    abortOnLimit: true,
    limitHandler: (req, res) => {
        res.status(400).json({
            message: `Ha superado el tamaño establecido para las imágenes [${maxSizeImage} mbs.]`
        })
        limitHandlerRun = true;
      }
}));


//VISTAS PÚBLICAS 

//HOME
app.get(["/", "/home"], async (req, res) => {
    try {

        let {rows} = await db.query("SELECT id, email, nombre, anos_experiencia, especialidad, foto, estado FROM skaters ORDER BY id");

        let skaters = rows;

        let results = await db.query(`
                 SELECT estado, COUNT(*) cantidad FROM SKATERS
                 GROUP BY estado
                 ORDER BY estado ASC;
        `);

        let aprobados = 0;
        let enRevision = 0;

        let datos = results.rows;

        console.log(datos);

        for (const dato of datos) {
            if(dato.estado){
                aprobados = dato.cantidad
            }else{
                enRevision = dato.cantidad
            }
        }
        
        res.render("Home", {
            skaters,
            homeView: true,
            aprobados,
            enRevision
        });
    } catch (error) {
        res.render("Home", {
            error: "No se han podido cargar los datos en la vista.",
            homeView: true
        });
    }
});

//REGISTRO

app.get("/registro", async (req, res) => {
    try {
        
        res.render("Registro", {
            registroView: true
        });
    } catch (error) {
        res.render("Registro", {
            error: "Ups! ha ocurrido un error.",
            registroView: true
        });
    }
});

//LOGIN
app.get("/login", (req, res) => {
    try {
        res.render("Login", {
            loginView: true
        });
    } catch (error) {
        res.render("Login", {
            error: "Ups! ha ocurrido un error.",
            loginView: true
        });
    }
});


//VISTAS PROTEGIDAS / PRIVADAS

app.get("/perfil", verifyToken, async (req, res) => {

    try {

        let consulta = {
            text: "SELECT nombre, email, anos_experiencia, especialidad FROM skaters WHERE id = $1",
            values: [req.usuario.id]
        }
    
    
        let { rows } = await db.query(consulta);
    
        let usuario = rows[0];
    
        if(!usuario){
            return res.render("Datos", {
                error: "Usuario no encontrado",
                datosView: true
            });
        }

        res.render("Datos", {
            datosView: true,
            usuario
        });
        
    } catch (error) {
        res.render("Datos", {
            error: "Ups! ha ocurrido un error.",
            datosView: true
        });
    }
});


//RUTAS ADMINISTRADOR

app.get("/admin", verifyToken, adminVerify, async (req, res) => {
    try {

        let {rows} = await db.query("SELECT id, email, nombre, anos_experiencia, especialidad, foto, estado FROM skaters ORDER BY id");

        let skaters = rows;

        res.render("Admin", {
            skaters,
            adminView: true
        });
        
    } catch (error) {
        res.render("Admin", {
            error: "Error al cargar datos"
        });
    }
});


//RUTAS DE ENDPOINTS

app.post("/api/v1/registro", async (req, res) => {
    try {

        let { email, nombre, password, anos_experiencia, especialidad } = req.body;
        let { imagen }  = req.files;

        if(!email || !nombre || !password  || !anos_experiencia || !especialidad || !imagen){
            res.status(400).json({
                message: "Debe proporcionar todos los datos requeridos."
            });
        };

        let foto = `img-${uuid().slice(0,4)}-${imagen.name}`;

        let uploadPath = __dirname + '/public/img/' + foto;

        await db.query("BEGIN");

        let consulta = {
            text: "INSERT INTO skaters VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, DEFAULT) RETURNING id",
            values: [email, nombre, password, anos_experiencia, especialidad, foto]
        }

        let  { rows } = await db.query(consulta);

        let idUsuario = rows[0].id;


        imagen.mv(uploadPath, async function(err) {
            if (err) {

                await db.query("rollback");

                return res.status(500).json({
                    message: "Error al intentar guardar la imagen, vuelva a intentar"
                });
            }

            await db.query("commit");

            res.status(201).json({
                message: "Usuario registrado con éxito con ID: " + idUsuario
            })
        });
        
    } catch (error) {
        console.log(error);
        let message = "Error en proceso de registro, vuelva a intentar";
        let status = 500;

        if(error.code == '23505'){
            message = "Ya existe un usuario registrado con su email";
            status = 400;
        }

        await db.query("rollback");

        return res.status(status).json({
            message
        });
    }

});


//endpoint login

app.post("/api/v1/login", async (req, res) => {
    try {
        let {email, password} = req.body;

        if(!email || !password){
            return res.status(400).json({message: "Debe proporcionar todos los datos."})
        }

        let consulta = {
            text: `SELECT S.id, S.nombre, S.email, A.ESTADO AS admin FROM SKATERS S
                    LEFT JOIN ADMINISTRADORES A
                    ON S.ID = A.ID_SKATER
                    WHERE email = $1 AND password = $2`,
            values: [email, password]
        }

        let { rows, rowCount } = await db.query(consulta);

        if(rowCount == 0){
            return res.status(400).json({message: "Credenciales inválidas."})
        }

        let usuario = rows[0];

        let token = jwt.sign(usuario, secretSignature, { expiresIn: '15m' });

        res.json({
            message: "Login realizado con éxito",
            token,
            usuario
        });


    } catch (error) {
        res.status(500).json({
            message: "Error en proceso de login."
        })
    }
});


app.put("/api/v1/skaters", verifyToken, async  (req, res) => {
    try {
        
        let { email, nombre, password, anos_experiencia, especialidad } = req.body;

        console.log(email, nombre, password, anos_experiencia, especialidad);

        let {rows} = await db.query("SELECT id, email, nombre, password, anos_experiencia, especialidad FROM skaters WHERE id = $1", [req.usuario.id]);

        let usuario = rows[0];

        usuario.email = email;
        usuario.nombre = nombre;
        
        if(password){
            usuario.password =  password;
        }
        usuario.anos_experiencia = anos_experiencia;
        usuario.especialidad = especialidad;

        await db.query("UPDATE SKATERS SET email = $1, nombre = $2, password = $3, anos_experiencia = $4, especialidad = $5 WHERE id = $6", [usuario.email, usuario.nombre, usuario.password, usuario.anos_experiencia, usuario.especialidad, usuario.id]);

        
        res.status(201).json({
            message: "Usuario actualizado con éxito."
        })
        
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar actualizar los datos del usuario."
        })
    }
})


app.post("/api/v1/login", async (req, res) => {
    try {
        let {email, password} = req.body;

        if(!email || !password){
            return res.status(400).json({message: "Debe proporcionar todos los datos."})
        }

        let consulta = {
            text: "SELECT id, nombre, email FROM skaters WHERE email = $1 AND password = $2",
            values: [email, password]
        }

        let { rows, rowCount } = await db.query(consulta);

        if(rowCount == 0){
            return res.status(400).json({message: "Credenciales inválidas."})
        }

        let usuario = rows[0];

        let token = jwt.sign(usuario, secretSignature, { expiresIn: '15m' });

        res.json({
            message: "Login realizado con éxito",
            token,
            usuario
        });


    } catch (error) {
        res.status(500).json({
            message: "Error en proceso de login."
        })
    }
});



app.delete("/api/v1/skaters", verifyToken, async  (req, res) => {
    try {

        let { password }  = req.body;
        console.log(password);

        if(!password){
            return res.status(400).json({
                message: "Password no proporcionado para corroborar eliminación de cuenta."
            })
        }

        let consulta = {
            text: "DELETE FROM skaters WHERE id = $1 AND password = $2 RETURNING foto",
            values: [req.usuario.id, password]
        }

        await db.query("BEGIN");
        let {rowCount, rows} = await db.query(consulta);

        
        if(rowCount == 0){
            await db.query("ROLLBACK");
            return res.status(400).json({
                message: "usuario no existe / contraseña no corroboración no válida."
            })
        }

        let foto = rows[0].foto;
        fs.unlinkSync(path.resolve(__dirname, "./public/img", foto));


        await db.query("COMMIT");
        res.json({
            message: "Usuario eliminado correctamente."
        })
        
    } catch (error) {
        await db.query("ROLLBACK");
        res.status(500).json({
            message: "Error al intentar eliminar al usuario."
        })
    }
});


//endpint para cambiar estado de usuarios

app.put("/api/v1/skaters/estado", verifyToken, adminVerify, async (req, res) => {
    try {
        
        let  { id }  = req.query;

        if(!id){
            return res.status(400).json({
                message: "Debe proporcionar el id del usuario al que desea cambiarle el estado."
            })
        }

        let { rows } = await db.query("SELECT id, nombre, estado FROM skaters WHERE ID = $1", [id]);

        let usuario = rows[0];

        if(!usuario){
            return res.status(404).json({
                message: "el usuario que desea modificar no fue encontrado /  asegurese de refrescar la página."
            })
        }

        let estado = !usuario.estado 

        await db.query("UPDATE SKATERS SET ESTADO = $1 WHERE id = $2", [estado, id]);

        res.status(201).json({
            message: "Usuario modificado con éxito."
        })
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar actualizar el estado del usuario, vuelva a intentar."
        })
    }
});

//PÁGINA NOT FOUND


app.get("*", (req, res) => {
    res.render("Notfound", {
        titulo: "Página no encontrada."
    });
});