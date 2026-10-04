import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ReDom Web uses Vite's single module entry. Do not inject the entry chunk again.
export default defineConfig({
  plugins: [react()],
});
