const express = require("express");
const cors = require("cors");
const routes = require("../src/routes/index");

const responseHandler = require("../src/utils/responseMiddleware.js");
const cookieParser = require("cookie-parser");
const errorHandler = require("../src/utils/errorMiddleware.js");

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

app.use("/", routes);

app.use(errorHandler);

module.exports = app;
