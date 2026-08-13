import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { handleApiRequest } from "./api-handler.mjs";

const distPath = path.resolve(process.cwd(), "dist");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml"
};

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const filePath = path.join(
    distPath,
    requestedPath === "/" ? "index.html" : requestedPath
  );

  try {
    await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    const fallbackPath = path.join(distPath, "index.html");
    response.writeHead(200, { "Content-Type": "text/html" });
    createReadStream(fallbackPath).pipe(response);
  }
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api")) {
    handleApiRequest(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`Terrasse schedule server running at http://${host}:${port}`);
});
