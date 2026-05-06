const express = require("express");
const router = express.Router();
const userRoutes = require("../v1/routes/userRoutes");
const emailRoutes = require("../v1/routes/emailRoutes");
const { triggerEvent } = require("../controller/eventController");
const { triggerEmailer } = require("../controller/emailerController");

console.log("Registering EMAILER trigger route: /email_scheduler/api/trigger");

router.use("/v1", userRoutes);
router.post("/trigger", triggerEmailer);
router.post(
  "/email_scheduler/api/trigger",
  (req, res, next) => {
    console.log("EMAILER ROUTE HIT!");
    next();
  },
  triggerEmailer,
);

module.exports = router;
