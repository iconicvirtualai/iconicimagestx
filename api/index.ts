/**
 * Vercel Serverless Function — API Entry Point
 * Routes all /api/* requests to the Express app.
 */
import { createServer } from "../server/index";

const app = createServer();

export default app;
