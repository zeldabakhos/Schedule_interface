import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readSchedule, writeSchedule } from "./schedule-store.mjs";

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
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function scheduleApiPlugin() {
  return {
    name: "schedule-api",
    configureServer(server) {
      server.middlewares.use("/api/schedule", async (request, response) => {
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
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), scheduleApiPlugin()]
});
