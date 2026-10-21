const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const serviceRoutes = require("./routes/services");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/services", serviceRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: "Not found." });
  });

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ message: "Request body must be valid JSON." });
    }
    console.error(err);
    return res.status(500).json({ message: "Something went wrong." });
  });

  return app;
}

module.exports = createApp;
