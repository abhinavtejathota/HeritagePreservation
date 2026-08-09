import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

/**
 * Vite replaces CRA (react-scripts). Keep `build/` outDir so Express
 * (`Application/backend/server`) continues to serve the same folder.
 */
export default defineConfig({
  plugins: [
    react({
      include: "**/*.{jsx,js}",
    }),
    // CRA-style: import { ReactComponent as Icon } from "./x.svg"
    svgr({
      svgrOptions: {
        exportType: "named",
        namedExport: "ReactComponent",
      },
      include: "**/*.svg",
    }),
  ],
  envPrefix: ["VITE_", "REACT_APP_"],
  publicDir: "public",
  build: {
    outDir: "build",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 3000,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // CRA used JSX inside .js files
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
