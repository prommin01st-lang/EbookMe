/* API ฝั่งคลาวด์ของ EbookMe (รันเป็น Vercel Serverless Function)
   - GET    /api/books                    → สารบัญหนังสือคลาวด์ (อ่านได้สาธารณะ)
   - POST   /api/books                    → อัปโหลด/แก้ไขบท (ต้องแนบ key)
   - DELETE /api/books?bookId=..[&file=..] → ลบบทหรือทั้งเล่ม (ต้องแนบ key)
   ต้องตั้ง env บน Vercel: BLOB_READ_WRITE_TOKEN (จากการเชื่อม Blob store) และ UPLOAD_KEY */

import crypto from 'node:crypto';
import { put, del, list } from '@vercel/blob';

/* สารบัญเก็บแบบ "เขียนไฟล์ใหม่ทุกครั้ง" (ebookme/catalog/<timestamp>.json)
   เพราะการเขียนทับไฟล์เดิมบน Vercel Blob ใช้เวลา propagate ได้ถึง ~60 วิ
   ทำให้อัปโหลดแล้วหนังสือไม่โผล่ทันที — ไฟล์ใหม่อ่านได้ทันทีเสมอ */
const CATALOG_PREFIX = 'ebookme/catalog/';
const LEGACY_CATALOG = 'ebookme/catalog.json';

/* หา token ของ Blob store: ปกติชื่อ BLOB_READ_WRITE_TOKEN แต่รองรับ prefix อื่น
   (เช่น UPLOAD_KEY_READ_WRITE_TOKEN) ด้วย และล้างเครื่องหมายคำพูด/ช่องว่าง
   ที่มักติดมาตอนคัดลอกจากหน้า .env ของ Vercel */
const cleanToken = v => String(v || '').trim().replace(/^["']+|["']+$/g, '');
const BLOB_TOKEN = [
  process.env.BLOB_READ_WRITE_TOKEN,
  ...Object.entries(process.env)
    .filter(([k]) => k.endsWith('_READ_WRITE_TOKEN'))
    .map(([, v]) => v),
].map(cleanToken).find(v => v.startsWith('vercel_blob_rw_'));

function isAuthed(req) {
  const secret = process.env.UPLOAD_KEY || '';
  const h = String(req.headers['authorization'] || '');
  const provided = h.replace(/^Bearer\s+/i, '') || String(req.headers['x-api-key'] || '');
  if (!secret || !provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readCatalog() {
  const { blobs } = await list({ prefix: CATALOG_PREFIX, limit: 1000, token: BLOB_TOKEN });
  if (blobs.length) {
    const latest = blobs.reduce((a, b) => (a.pathname > b.pathname ? a : b));
    const res = await fetch(latest.url, { cache: 'no-store' });
    if (res.ok) return await res.json();
  }
  // fallback: สารบัญรุ่นเก่าแบบเขียนทับ (ก่อนย้ายมาระบบ versioned)
  const legacy = await list({ prefix: LEGACY_CATALOG, limit: 1, token: BLOB_TOKEN });
  if (legacy.blobs.length) {
    const res = await fetch(`${legacy.blobs[0].url}?v=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  }
  return { books: [] };
}

async function writeCatalog(catalog) {
  const { blobs } = await list({ prefix: CATALOG_PREFIX, limit: 1000, token: BLOB_TOKEN });
  await put(`${CATALOG_PREFIX}${Date.now()}.json`, JSON.stringify(catalog, null, 2), {
    access: 'public',
    contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false,
    token: BLOB_TOKEN,
  });
  // เก็บกวาดเวอร์ชันเก่า เหลือ 2 ชุดล่าสุดกันชนกับ read ที่กำลังเกิดพอดี
  const olds = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(2);
  await Promise.all(olds.map(b => del(b.url, { token: BLOB_TOKEN }).catch(() => {})));
}

export default async function handler(req, res) {
  try {
    if (!BLOB_TOKEN) {
      return res.status(500).json({
        error: 'ยังไม่ได้เชื่อม Blob store กับโปรเจกต์ — ไปที่ Vercel → Storage → เลือก store → Connect Project (prefix: BLOB) แล้ว Redeploy',
      });
    }
    if (req.method === 'GET') {
      const catalog = await readCatalog();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ api: 'v2', books: catalog.books || [] });
    }

    if (!isAuthed(req)) {
      return res.status(401).json({ error: 'key ไม่ถูกต้อง (หรือยังไม่ได้ตั้ง UPLOAD_KEY บน Vercel)' });
    }

    if (req.method === 'POST') {
      const { bookId, bookTitle, bookCover, bookDescription, chapterTitle, filename, content } = req.body || {};

      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(bookId || ''))
        return res.status(400).json({ error: 'bookId ต้องเป็นตัวพิมพ์เล็ก a-z, 0-9, ขีดกลาง' });
      if (!/^[\w.-]+\.(md|html)$/i.test(filename || '') || filename.includes('..'))
        return res.status(400).json({ error: 'filename ต้องลงท้ายด้วย .md หรือ .html และไม่มีตัวอักษรพิเศษ' });
      if (!chapterTitle || !String(chapterTitle).trim())
        return res.status(400).json({ error: 'ต้องมีชื่อบท' });
      if (typeof content !== 'string' || !content.trim())
        return res.status(400).json({ error: 'ไม่มีเนื้อหา' });
      if (content.length > 2_000_000)
        return res.status(400).json({ error: 'เนื้อหาใหญ่เกิน 2MB' });

      // ชื่อไฟล์จริงมี timestamp นำหน้า = ไม่มีการเขียนทับ ทุกอัปโหลดอ่านได้ทันที
      const blob = await put(`ebookme/books/${bookId}/${Date.now()}-${filename}`, content, {
        access: 'public',
        contentType: filename.toLowerCase().endsWith('.md')
          ? 'text/markdown; charset=utf-8'
          : 'text/html; charset=utf-8',
        addRandomSuffix: false,
        token: BLOB_TOKEN,
      });

      const catalog = await readCatalog();
      let book = catalog.books.find(b => b.id === bookId);
      if (!book) {
        book = {
          id: bookId,
          title: (bookTitle || '').trim() || bookId,
          description: (bookDescription || '').trim(),
          cover: (bookCover || '').trim() || '📘',
          chapters: [],
        };
        catalog.books.push(book);
      }

      const existing = book.chapters.find(c => c.file === filename);
      if (existing) {
        if (existing.url && existing.url !== blob.url) await del(existing.url, { token: BLOB_TOKEN }).catch(() => {});
        existing.title = chapterTitle.trim();
        existing.url = blob.url;
        existing.updated = Date.now();
      } else {
        book.chapters.push({ file: filename, title: chapterTitle.trim(), url: blob.url, updated: Date.now() });
      }
      // เรียงบทตามชื่อไฟล์ (ใช้ convention เลขนำหน้า 01-, 02-, …)
      book.chapters.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
      await writeCatalog(catalog);

      const ch = book.chapters.findIndex(c => c.file === filename) + 1;
      return res.status(200).json({ ok: true, book: bookId, ch, url: blob.url });
    }

    if (req.method === 'DELETE') {
      // req.query อาจไม่ถูก populate ในบาง runtime — parse จาก URL เองเป็น fallback
      const qs = new URL(req.url || '', 'http://internal').searchParams;
      const bookId = (req.query && req.query.bookId) || qs.get('bookId');
      const file = (req.query && req.query.file) || qs.get('file');
      const catalog = await readCatalog();
      const book = catalog.books.find(b => b.id === bookId);
      if (!book) return res.status(404).json({ error: 'ไม่พบหนังสือ' });

      if (file) {
        const c = book.chapters.find(c => c.file === file);
        if (!c) return res.status(404).json({ error: 'ไม่พบบทนี้' });
        await del(c.url, { token: BLOB_TOKEN }).catch(() => {});
        book.chapters = book.chapters.filter(x => x !== c);
        if (!book.chapters.length) catalog.books = catalog.books.filter(b => b !== book);
      } else {
        await Promise.all(book.chapters.map(c => del(c.url, { token: BLOB_TOKEN }).catch(() => {})));
        catalog.books = catalog.books.filter(b => b !== book);
      }
      await writeCatalog(catalog);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
