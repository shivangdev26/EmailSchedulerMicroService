const responseHandler = (req, res, next) => {
  res.success = (message, data) => {
    return res.json({
      success: true,
      data: data,
      message: message || "Success",
      status: res.statusCode || 200,
    });
  };

  res.error = (message, statusCode = 400) => {
    return res.status(statusCode).json({
      success: false,
      data: null,
      message: message || "Error",
      status: statusCode,
    });
  };

  next();
};

module.exports = responseHandler;
