import { defineConfig, type IndexHtmlTransformContext, type HtmlTagDescriptor } from "vite";
import react from "@vitejs/plugin-react";

function classicEntryFallback() {
  return {
    name: "redom-classic-entry-fallback",
    transformIndexHtml: {
      order: "post",
      handler(html: string, ctx: IndexHtmlTransformContext) {
        if (!ctx.bundle) return html;
        const entry = Object.values(ctx.bundle).find(
          (item): item is any => item.type === "chunk" && item.isEntry,
        );
        if (!entry?.fileName) return html;
        const tag: HtmlTagDescriptor = {
          tag: "script",
          attrs: { src: "/" + entry.fileName, defer: true },
          injectTo: "body",
        };
        return { html, tags: [tag] };
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), classicEntryFallback()],
});
