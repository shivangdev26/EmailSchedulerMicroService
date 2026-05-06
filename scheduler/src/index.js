const express = require("express");
const cors = require("cors");
const routes = require("./routes/index");

const responseHandler = require("./utils/responseMiddleware.js");
const cookieParser = require("cookie-parser");
const errorHandler = require("./utils/errorMiddleware.js");

const app = express();

app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      console.log(` Request size: ${buf.length} bytes`);
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);
app.use(cookieParser());
// app.use(
//   cors({
//     origin: [],
//     credentials: true,
//   }),
// );

app.use(responseHandler);

app.use("/api", routes);

app.use(errorHandler);

module.exports = app;
