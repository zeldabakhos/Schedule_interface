import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { handleApiRequest } from "./api-handler.mjs";

function appApiPlugin() {
  return {
    name: "terrasse-api",
    configureServer(server) {
      server.middlewares.use("/api", async (request, response) => {
        await handleApiRequest(request, response);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), appApiPlugin()]
});
