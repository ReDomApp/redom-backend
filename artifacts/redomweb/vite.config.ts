import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: "assets/redom-web.js",
        chunkFileNames: "assets/redom-web-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "iife",
      },
    },
  },
});
