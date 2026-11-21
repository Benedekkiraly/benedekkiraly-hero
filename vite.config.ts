import { defineConfig } from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

// base "./" keeps asset links relative, so the site works at
// https://<user>.github.io/<repo>/ and on a custom domain alike.
// The build goes to docs/, which GitHub Pages can serve straight from the repo.
export default defineConfig({
  base: "./",
  plugins: [wgslVitePlugin()],
  build: { outDir: "docs", emptyOutDir: true },
});
