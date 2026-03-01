import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { handleDemo } from "./routes/demo";

const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes for Site Settings
  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (e) {
      // Return default empty or error if file doesn't exist
      res.status(404).json({ error: "Settings not found" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      // Mock booking success
      console.log("New Booking Received:", req.body);
      res.json({ success: true, message: "Booking confirmed" });
    } catch (e) {
      res.status(500).json({ error: "Failed to process booking" });
    }
  });

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  return app;
}
