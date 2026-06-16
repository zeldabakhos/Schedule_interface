import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { readSchedule, writeSchedule } from "./schedule-store.mjs";

const distPath = path.resolve(process.cwd(), "dist");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml"
};

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function handleScheduleApi(request, response) {
  try {
    if (request.method === "GET") {
      sendJson(response, 200, await readSchedule());
      return;
    }

    if (request.method === "PUT") {
      const body = await readRequestBody(request);
      const data = JSON.parse(body || "{}");

      sendJson(response, 200, await writeSchedule(data.assignments));
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

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
  if (request.url.startsWith("/api/schedule")) {
    handleScheduleApi(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`Terrasse schedule server running at http://localhost:${port}`);
});
