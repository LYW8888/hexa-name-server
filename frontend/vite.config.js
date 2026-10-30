import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const frontendDir = dirname(fileURLToPath(import.meta.url));

function offlineWorker() {
  return {
    name: "xuming-offline-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter(
          (name) =>
            name.startsWith("assets/") && !name.startsWith("assets/admin-"),
        )
        .map((name) => "/" + name);
      const assets = [
        "/",
        "/manifest.webmanifest",
        "/favicon.svg",
        "/data/product.json",
        ...files,
      ];
      const version = createHash("sha256")
        .update(JSON.stringify(assets))
        .update(readFileSync(resolve(frontendDir, "index.html")))
        .update(
          readFileSync(resolve(frontendDir, "public/manifest.webmanifest")),
        )
        .update(readFileSync(resolve(frontendDir, "public/favicon.svg")))
        .update(readFileSync(resolve(frontendDir, "../data/product.json")))
        .digest("hex")
        .slice(0, 12);
      const script = `const CACHE='xuming-react-${version}';\nconst ASSETS=${JSON.stringify(assets)};\nconst PATHS=new Set(ASSETS.map(path=>new URL(path,self.location.origin).pathname));\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('xuming-mvp-')||key.startsWith('xuming-react-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!PATHS.has(url.pathname))return;event.respondWith(caches.open(CACHE).then(async cache=>{if(request.mode==='navigate'){try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response}catch(error){return(await cache.match(request))||(await cache.match('/'))||Response.error()}}const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response}))});`;
      this.emitFile({
        type: "asset",
        fileName: "service-worker.js",
        source: script,
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), offlineWorker()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(frontendDir, "index.html"),
        admin: resolve(frontendDir, "admin.html"),
      },
    },
  },
  server: {
    fs: { allow: [resolve(frontendDir, "..")] },
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/data": "http://127.0.0.1:4173",
    },
  },
});
