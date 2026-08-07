/* ฐานข้อมูลหนังสือของ EbookMe มี 2 แหล่ง:
   1. books.html — หนังสือที่เก็บเป็นไฟล์ใน repo (ฐานข้อมูลหลักแบบ HTML)
   2. /api/books — หนังสือที่อัปโหลดไว้บน Vercel Blob (มีเฉพาะตอน deploy บน Vercel)
   คืนค่า: [{ id, cover, title, description, cloud?, chapters: [{ path, title }] }] */

async function loadLocalBooks() {
  const res = await fetch('books.html', { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  return [...doc.querySelectorAll('section.book')]
    .map(sec => ({
      id: sec.dataset.id,
      cover: sec.dataset.cover || '📘',
      title: (sec.querySelector('h2')?.textContent || sec.dataset.id || '').trim(),
      description: (sec.querySelector('p')?.textContent || '').trim(),
      chapters: [...sec.querySelectorAll('li > a[href]')].map(a => ({
        path: a.getAttribute('href'),
        title: a.textContent.trim()
      }))
    }))
    .filter(b => b.id && b.chapters.length);
}

async function loadCloudBooks() {
  try {
    const res = await fetch('api/books', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return [];
    const data = await res.json();
    return (data.books || [])
      .map(b => ({
        id: b.id,
        cover: b.cover || '☁️',
        title: b.title || b.id,
        description: b.description || '',
        cloud: true,
        chapters: (b.chapters || []).map(c => ({
          // แนบ ?v=เวลาที่อัปเดต เพื่อ bust cache ของ CDN เฉพาะตอนไฟล์เปลี่ยนจริง
          path: c.url + (c.updated ? `?v=${c.updated}` : ''),
          title: c.title,
          file: c.file // ชื่อไฟล์ตอนอัปโหลด — reader ใช้ map ลิงก์ข้ามบท
        }))
      }))
      .filter(b => b.id && b.chapters.length);
  } catch {
    return []; // ไม่ได้รันบน Vercel (เช่น localhost) — ใช้เฉพาะหนังสือใน repo
  }
}

// หน้าแรกเรียก catalog หลายที่ (ชั้น 3D, มุมมองตาราง, ค้นหา) — ยิงเน็ตรอบเดียวพอ
let catalogPromise = null;

async function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const [local, cloud] = await Promise.all([loadLocalBooks(), loadCloudBooks()]);
    const seen = new Set(local.map(b => b.id));
    return [...local, ...cloud.filter(b => !seen.has(b.id))];
  })();
  catalogPromise.catch(() => { catalogPromise = null; }); // ล้มเหลวแล้วให้ลองใหม่ได้
  return catalogPromise;
}
