const logger = require("./logger");

const errorHandler = (err, req, res, next) => {
  logger.error("API Error", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  console.error("\n\n API ERROR");
  console.error("URL:", req.originalUrl);
  console.error("Method:", req.method);
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message: message,
    data: null,
    status: statusCode,
  });
};

module.exports = errorHandler;
