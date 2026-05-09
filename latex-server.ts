import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
type PdfCacheEntry = {
  pdf: Buffer;
  synctex?: Buffer;
  baseMainFile: string;
};

const pdfCache = new Map<string, PdfCacheEntry>();

type CompileAsset = {
  name: string;
  mimeType?: string;
  base64: string;
};

function sanitizeRelativePath(inputPath: string): string | null {
  const normalized = path.posix.normalize(inputPath.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return null;
  }
  return normalized;
}

function assertCompiler(value: string): string {
  const allowed = new Set(["pdflatex", "xelatex", "lualatex"]);
  return allowed.has(value) ? value : "pdflatex";
}

async function writeTextFiles(tempDir: string, files: Record<string, string>) {
  for (const [filename, content] of Object.entries(files)) {
    const relativePath = sanitizeRelativePath(filename);
    if (!relativePath) throw new Error(`Invalid file path: ${filename}`);

    const filePath = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
}

async function writeAssets(tempDir: string, assets: CompileAsset[]) {
  for (const asset of assets) {
    const relativePath = sanitizeRelativePath(asset.name);
    if (!relativePath) throw new Error(`Invalid asset path: ${asset.name}`);

    const filePath = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(asset.base64, "base64"));
  }
}

async function startServer() {
  const app = express();
  const PORT = 3001;

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "100mb" }));

  app.get("/api/latex/pdf/:id", (req, res) => {
    const cacheEntry = pdfCache.get(req.params.id);
    if (!cacheEntry) {
      return res.status(404).send("PDF not found.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    res.setHeader("Cache-Control", "no-cache");
    res.send(cacheEntry.pdf);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/latex/compile", async (req, res) => {
    const {
      files,
      mainFile,
      compiler = "pdflatex",
      assets = [],
    } = req.body as {
      files?: Record<string, string>;
      mainFile?: string;
      compiler?: string;
      assets?: CompileAsset[];
    };

    if (!files || !mainFile || !Object.prototype.hasOwnProperty.call(files, mainFile)) {
      return res
        .status(400)
        .json({ success: false, logs: "Invalid payload", errors: [{ message: "Invalid payload" }] });
    }

    const safeMainFile = sanitizeRelativePath(mainFile);
    if (!safeMainFile) {
      return res
        .status(400)
        .json({ success: false, logs: "Invalid main file path", errors: [{ message: "Invalid main file path" }] });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "latex-"));

    try {
      await writeTextFiles(tempDir, files);
      await writeAssets(tempDir, assets);

      const selectedCompiler = assertCompiler(compiler);
      const baseMainFile = path.parse(safeMainFile).name;
      let stdout = "";
      let stderr = "";
      let compileSuccess = true;

      try {
        const result = await execFileAsync(
          selectedCompiler,
          ["-synctex=1", "-interaction=nonstopmode", "-halt-on-error", safeMainFile],
          { cwd: tempDir, timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
        );
        stdout = result.stdout ?? "";
        stderr = result.stderr ?? "";
      } catch (error: any) {
        compileSuccess = false;
        stdout = error.stdout || "";
        stderr = error.stderr || error.message || "";
      }

      const logContent = await fs
        .readFile(path.join(tempDir, `${baseMainFile}.log`), "utf8")
        .catch(() => [stdout, stderr].filter(Boolean).join("\n"));

      let pdfId: string | null = null;
      if (compileSuccess) {
        try {
          const pdfBuffer = await fs.readFile(path.join(tempDir, `${baseMainFile}.pdf`));
          const synctexBuffer = await fs
            .readFile(path.join(tempDir, `${baseMainFile}.synctex.gz`))
            .catch(() => undefined);
          pdfId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          pdfCache.set(pdfId, { pdf: pdfBuffer, synctex: synctexBuffer, baseMainFile });
        } catch {
          compileSuccess = false;
        }
      }

      res.json({ success: compileSuccess, logs: logContent, pdfId });
    } catch (error: any) {
      res.status(500).json({ success: false, logs: error.message });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  app.post("/api/latex/sync/:id", async (req, res) => {
    const cacheEntry = pdfCache.get(req.params.id);
    if (!cacheEntry) {
      return res.status(404).json({ success: false, message: "PDF not found" });
    }
    if (!cacheEntry.synctex) {
      return res.status(404).json({ success: false, message: "SyncTeX data not found. Recompile the document." });
    }

    const page = Number(req.body?.page);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(page) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ success: false, message: "Invalid SyncTeX coordinates" });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "latex-sync-"));
    const pdfPath = path.join(tempDir, `${cacheEntry.baseMainFile}.pdf`);
    const synctexPath = path.join(tempDir, `${cacheEntry.baseMainFile}.synctex.gz`);

    try {
      await fs.writeFile(pdfPath, cacheEntry.pdf);
      await fs.writeFile(synctexPath, cacheEntry.synctex);

      const result = await execFileAsync(
        "synctex",
        ["edit", "-o", `${Math.round(page)}:${x.toFixed(2)}:${y.toFixed(2)}:${pdfPath}`],
        { cwd: tempDir, timeout: 10000, maxBuffer: 1024 * 1024 },
      );
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const input = output.match(/^Input:(.+)$/m)?.[1]?.trim();
      const line = Number(output.match(/^Line:(\d+)$/m)?.[1]);
      const column = Number(output.match(/^Column:(\d+)$/m)?.[1]);

      if (!input || !Number.isFinite(line)) {
        return res.json({ success: false, logs: output, message: "No matching source location found" });
      }

      res.json({
        success: true,
        file: path.basename(input),
        line,
        column: Number.isFinite(column) ? column : 0,
        logs: output,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.code === "ENOENT" ? "synctex command not found" : error.message,
        logs: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n"),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  app.post("/api/latex/ai-assist", async (req, res) => {
    const { prompt, context } = req.body;
    const pythonAdapterUrl = process.env.HERMES_AGENT_URL || "http://localhost:3001/chat";

    try {
      const finalPrompt = context
        ? `Please answer using the following LaTeX context:\n${context}\n\nRequest:\n${prompt}`
        : prompt;

      const response = await fetch(pythonAdapterUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt }),
      });

      if (!response.ok) throw new Error(`Python Adapter returned ${response.status}`);
      const textResponse = await response.text();
      let aiContent = textResponse;
      try {
        const data = JSON.parse(textResponse);
        aiContent =
          data.response ||
          data.text ||
          data.message ||
          (typeof data === "string" ? data : JSON.stringify(data));
      } catch {
        // Plain text responses are fine.
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: aiContent } }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: `Agent adapter failed: ${err.message}` } }] })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (_req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
