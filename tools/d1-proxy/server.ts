import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

dotenv.config();

const PORT = 4321;

// Accept DB path via env or CLI arg
const inputPath = process.env.DB_PATH || process.argv[2];

if (!inputPath) {
  console.error("No DB path specified. Set DB_PATH or pass as CLI arg.");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error("DB FILE NOT FOUND at", inputPath);
  process.exit(1);
}

(async () => {
  const db = await open({
    filename: inputPath,
    driver: sqlite3.Database,
  });

  const app = express();
  app.use(bodyParser.json());

  app.post("/query", async (req: Request, res: Response) => {
    const { sql, params = [] } = req.body;
    try {
      const stmt = await db.prepare(sql);
      const result = await stmt.all(params);
      await stmt.finalize();
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/query-first", async (req: Request, res: Response) => {
    const { sql, params = [] } = req.body;
    try {
      const stmt = await db.prepare(sql);
      const result = await stmt.get(params);
      await stmt.finalize();
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`D1 Proxy Server running at http://localhost:${PORT}`);
    console.log(`Connected to DB at: ${inputPath}`);
  });
})();
