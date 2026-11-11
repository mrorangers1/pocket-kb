'use strict';
/* 随身知识库 service worker - 自动生成，请勿手改 */
const CACHE = 'pocket-kb-20261111221534';
const PRECACHE = ["./app.js", "./data/auto_questions.json", "./data/bank_questions.json", "./data/lesson_questions.json", "./data/lessons.json", "./data/nodes.json", "./data/questions.json", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./index.html", "./manifest.webmanifest", "./styles.css", "./vendor/katex/auto-render.min.js", "./vendor/katex/fonts/KaTeX_AMS-Regular.ttf", "./vendor/katex/fonts/KaTeX_AMS-Regular.woff", "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2", "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.ttf", "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff", "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2", "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.ttf", "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff", "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2", "./vendor/katex/fonts/KaTeX_Fraktur-Bold.ttf", "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff", "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2", "./vendor/katex/fonts/KaTeX_Fraktur-Regular.ttf", "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff", "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2", "./vendor/katex/fonts/KaTeX_Main-Bold.ttf", "./vendor/katex/fonts/KaTeX_Main-Bold.woff", "./vendor/katex/fonts/KaTeX_Main-Bold.woff2", "./vendor/katex/fonts/KaTeX_Main-BoldItalic.ttf", "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff", "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2", "./vendor/katex/fonts/KaTeX_Main-Italic.ttf", "./vendor/katex/fonts/KaTeX_Main-Italic.woff", "./vendor/katex/fonts/KaTeX_Main-Italic.woff2", "./vendor/katex/fonts/KaTeX_Main-Regular.ttf", "./vendor/katex/fonts/KaTeX_Main-Regular.woff", "./vendor/katex/fonts/KaTeX_Main-Regular.woff2", "./vendor/katex/fonts/KaTeX_Math-BoldItalic.ttf", "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff", "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2", "./vendor/katex/fonts/KaTeX_Math-Italic.ttf", "./vendor/katex/fonts/KaTeX_Math-Italic.woff", "./vendor/katex/fonts/KaTeX_Math-Italic.woff2", "./vendor/katex/fonts/KaTeX_SansSerif-Bold.ttf", "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff", "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2", "./vendor/katex/fonts/KaTeX_SansSerif-Italic.ttf", "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff", "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2", "./vendor/katex/fonts/KaTeX_SansSerif-Regular.ttf", "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff", "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2", "./vendor/katex/fonts/KaTeX_Script-Regular.ttf", "./vendor/katex/fonts/KaTeX_Script-Regular.woff", "./vendor/katex/fonts/KaTeX_Script-Regular.woff2", "./vendor/katex/fonts/KaTeX_Size1-Regular.ttf", "./vendor/katex/fonts/KaTeX_Size1-Regular.woff", "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2", "./vendor/katex/fonts/KaTeX_Size2-Regular.ttf", "./vendor/katex/fonts/KaTeX_Size2-Regular.woff", "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2", "./vendor/katex/fonts/KaTeX_Size3-Regular.ttf", "./vendor/katex/fonts/KaTeX_Size3-Regular.woff", "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2", "./vendor/katex/fonts/KaTeX_Size4-Regular.ttf", "./vendor/katex/fonts/KaTeX_Size4-Regular.woff", "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2", "./vendor/katex/fonts/KaTeX_Typewriter-Regular.ttf", "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff", "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2", "./vendor/katex/katex.min.css", "./vendor/katex/katex.min.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf('pocket-kb-') === 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 导航请求：缓存优先，回退 index.html（离线也能开 APP）
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  // 其余 GET：缓存优先，后台更新（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
