// Service Worker برنامه ترازمشاور
// - نصب: پوسته برنامه و فایل‌های js/css ساخته‌شده (با خواندن index.html) کش می‌شوند تا بعد از اولین باز شدن، آفلاین هم کار کند.
// - صفحه اصلی (index.html): ابتدا شبکه؛ در صورت موفقیت، فایل‌های جدید کش و فایل‌های نسخه قبلی پاک می‌شوند،
//   پس نسخه قدیمی برنامه در دستگاه باقی نمی‌ماند. بدون اینترنت از کش خوانده می‌شود.
// - فایل محتوا (content/content.json): ابتدا شبکه (تا محتوای جدید برسد)؛ فایل‌های بارگذاری‌شده‌ای که دیگر در محتوا نیستند از کش پاک می‌شوند.
// - سایر فایل‌ها: ابتدا کش، سپس شبکه.
const CACHE_NAME = 'tarazmoshaver-v7';
const APP_SHELL = ['./', './content/content.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
const CACHEABLE_EXTERNAL = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const ASSETS_PREFIX = () => self.registration.scope + 'assets/';

function assetUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']([^"']*assets\/[^"']+)["']/g)) {
    urls.add(new URL(m[1], self.registration.scope).href);
  }
  return urls;
}

// کش را با index.html تازه هماهنگ می‌کند: فایل‌های جدید اضافه، فایل‌های نسخه قبلی حذف
async function syncWithIndex(indexResponse) {
  const html = await indexResponse.clone().text();
  const wanted = assetUrls(html);
  const cache = await caches.open(CACHE_NAME);
  const missing = [];
  for (const url of wanted) if (!(await cache.match(url))) missing.push(url);
  if (missing.length) await cache.addAll(missing);
  await cache.put('./index.html', indexResponse);
  for (const req of await cache.keys()) {
    if (req.url.startsWith(ASSETS_PREFIX()) && !wanted.has(req.url)) await cache.delete(req);
  }
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  const res = await fetch('./index.html', { cache: 'reload' });
  if (!res.ok) throw new Error('index.html unavailable');
  await syncWithIndex(res);
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ذخیره content.json تازه در کش و پاک کردن فایل‌های بی‌استفاده (مثلاً فایل قدیمی که با فایل جدید جایگزین شده)
async function storeContent(response) {
  const text = await response.clone().text();
  const cache = await caches.open(CACHE_NAME);
  let referenced = null;
  try {
    JSON.parse(text);
    referenced = new Set();
    for (const m of text.matchAll(/"src"\s*:\s*"(files\/[^"]+)"/g)) referenced.add(new URL('content/' + m[1], self.registration.scope).href);
  } catch { /* JSON نامعتبر: فقط ذخیره نکن */ return; }
  await cache.put('./content/content.json', response);
  const filesPrefix = self.registration.scope + 'content/files/';
  for (const req of await cache.keys()) {
    if (req.url.startsWith(filesPrefix) && !referenced.has(req.url)) await cache.delete(req);
  }
}

async function handleContent(event) {
  const cached = await caches.match('./content/content.json');
  try {
    const controller = new AbortController();
    const timer = cached ? setTimeout(() => controller.abort(), 5000) : null;
    const response = await fetch(event.request, { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (response.ok) event.waitUntil(storeContent(response.clone()).catch(() => {}));
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function handleIndex(event) {
  const request = event.request;
  const cached = await caches.match('./index.html');
  try {
    const controller = new AbortController();
    // اگر نسخه کش‌شده داریم و شبکه کند است، بعد از ۵ ثانیه از کش استفاده شود
    const timer = cached ? setTimeout(() => controller.abort(), 5000) : null;
    const response = await fetch(request, { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (response.ok) event.waitUntil(syncWithIndex(response.clone()).catch(() => {}));
    return response;
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_EXTERNAL.includes(url.hostname)) return;

  if (request.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('/index.html'))) {
    event.respondWith(handleIndex(event));
    return;
  }

  if (sameOrigin && url.pathname.endsWith('/content/content.json')) {
    event.respondWith(handleContent(event));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok || response.type === 'opaque') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
