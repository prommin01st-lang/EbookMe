/* Service worker ของ EbookMe — เปิดอ่านบท/หน้าที่เคยเปิดแล้วได้แม้ออฟไลน์
   กลยุทธ์:
   - ไฟล์ในเว็บเรา (same-origin รวม /api/books): network-first
     ของใหม่มาก่อนเสมอ ออฟไลน์ค่อยหยิบจาก cache — deploy ใหม่ไม่มีทางค้างของเก่า
   - เนื้อหาบทบน Blob (cross-origin): cache-first
     ไฟล์พวกนี้ immutable (ชื่อมี timestamp, แก้บท = ไฟล์ใหม่ + ?v= ใหม่) โหลดซ้ำเปลืองเปล่า ๆ */

const VERSION = 'ebookme-v3';

const CORE = [
  'index.html', 'reader.html', 'upload.html', 'books.html',
  'assets/app.css', 'assets/shelf.css', 'assets/catalog.js', 'assets/shelf.js', 'assets/marked.min.js',
  'manifest.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // อัปโหลด/ลบ/แก้ไข ไปตรง network เสมอ

  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return; // chrome-extension:// ฯลฯ — cache ไม่ได้ อย่ายุ่ง
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);

    // three.js ~1MB และไม่เคยเปลี่ยนในเวอร์ชันเดิม — revalidate ทุกครั้งเปลืองเปล่า
    // อัปเกรดเวอร์ชันเมื่อไหร่ค่อยขึ้น VERSION ด้านบน cache เก่าถูกลบตอน activate อยู่แล้ว
    if (url.origin !== location.origin || url.pathname.includes('/assets/three/')) {
      // cache-first สำหรับไฟล์เนื้อหา/รูปบน Blob และไลบรารีที่ตรึงเวอร์ชันไว้
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }

    // network-first สำหรับไฟล์ของเว็บเราเอง
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      // reader.html?book=..&ch=.. เนื้อไฟล์เหมือนกันทุก query — match แบบไม่สน query ได้
      const hit = await cache.match(req, { ignoreSearch: /\.html$/.test(url.pathname) || url.pathname.endsWith('/') });
      if (hit) return hit;
      return new Response('ออฟไลน์อยู่ และหน้านี้ยังไม่เคยถูกเปิดมาก่อน', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
