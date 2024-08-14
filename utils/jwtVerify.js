import jwt from "jsonwebtoken";

const secretSignature = "secreto";

const verifyToken = (req, res, next) => {
    try {
        let token;

        if (req.query?.token) {
            token = req.query.token;
        } else if (req.headers?.authorization) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            let message =
                "Recurso protegido, debe contar con credenciales válidas.";
            if (req.url.includes("/api")) {
                return res.status(401).json({
                    message,
                });
            } else {
                return res.render("error", {
                    message,
                });
            }
        }

        console.log(token);

        let decoded = jwt.verify(token, secretSignature);

        console.log(decoded);
        req.usuario = decoded;

        next();
    } catch (error) {
        let estado = 500;
        let message =
            "Ups! ha ocurrido un error, intente iniciar sesión nuevamente.";

        console.log(error);
        if (error.message == "invalid signature") {
            message = "Token inválido o caducado, vuelva a uniciar sesión";
            estado = 401;
        } else if (error.message == "jwt expired") {
            message = "Su sesión ha expirado, vuelva a iniciar sesión.";
            estado = 401;
        }

        if(req.url.includes("/api")){
            return res.status(estado).json({
                message
            })
        }else {
            return res.render("error", {
                message,
            });
        }
    
    }
};

export default verifyToken;
