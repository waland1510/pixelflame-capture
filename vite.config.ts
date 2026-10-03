import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Server routes read AI_* from process.env; in dev this also picks up .env.[mode] (e.g. .env.spiria).
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });

  return {
    server: { host: "::", port: 8080 },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // src/server.ts wraps the bundled server entry with the SSR error page.
      tanstackStart({ server: { entry: "server" } }),
      command === "build" && nitro({ preset: process.env["VERCEL"] ? "vercel" : "node-server" }),
      viteReact(),
    ],
  };
});
