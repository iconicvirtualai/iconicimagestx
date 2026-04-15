/**
 * Vercel Serverless Entry Point
 * Exports the Express app for use as a Vercel serverless function.
 * This file is the build entry for vite.config.vercel.ts → api/index.mjs
 */
import { createServer } from "./index";

export default createServer();
