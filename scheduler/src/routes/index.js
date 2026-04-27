const express = require("express");
const router = express.Router();
const userRoutes = require("../v1/routes/userRoutes");
const emailRoutes = require("../v1/routes/emailRoutes");
const { triggerEvent } = require("../controller/eventController");

router.use("/v1", userRoutes);
router.post("/trigger", triggerEvent);
module.exports = router;
