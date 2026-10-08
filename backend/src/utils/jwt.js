const jwt = require("jsonwebtoken");

// ล็อก algorithm ไว้ตัวเดียว กันการปลอม token ด้วย algorithm อื่น (เช่น "none")
const ALGORITHM = "HS256";

function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        algorithm: ALGORITHM,
        expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    });
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
