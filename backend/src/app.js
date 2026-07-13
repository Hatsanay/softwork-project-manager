const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เสิร์ฟรูปโปรไฟล์ที่อัปโหลดไว้ static ที่ /uploads/<filename> ตรงกับ user_avatar_url ที่เก็บใน DB
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
