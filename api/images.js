/* อัปโหลดรูปประกอบขึ้น Vercel Blob (ต้องแนบ key เหมือนการอัปโหลดบท)
   - POST /api/images  body: { filename, dataBase64 } → { ok, url }
   รูปเก็บที่ ebookme/images/<timestamp>-<ชื่อไฟล์> แบบ immutable — อ่านได้ทันที
   และไม่ผูกกับเล่มไหน (ลบหนังสือแล้วรูปยังอยู่ ให้ URL ในบทอื่นไม่พัง) */

import crypto from 'node:crypto';
import { put } from '@vercel/blob';

/* token/auth ชุดเดียวกับ api/books.js — คัดลอกมาเพราะไฟล์ใน api/ ต้อง
   self-contained (ทุกไฟล์ .js กลายเป็น serverless function แยกกัน) */
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

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
};

export default async function handler(req, res) {
  try {
    if (!BLOB_TOKEN) {
      return res.status(500).json({ error: 'ยังไม่ได้เชื่อม Blob store กับโปรเจกต์' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method not allowed' });
    }
    if (!isAuthed(req)) {
      return res.status(401).json({ error: 'key ไม่ถูกต้อง (หรือยังไม่ได้ตั้ง UPLOAD_KEY บน Vercel)' });
    }

    const { filename, dataBase64 } = req.body || {};
    const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (!/^[\w.-]+$/.test(filename || '') || filename.includes('..') || !MIME[ext])
      return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ png, jpg, gif, webp, svg, avif' });

    // ตัด data URL prefix ทิ้งถ้าติดมา (canvas.toDataURL / FileReader ให้มาแบบนั้น)
    const b64 = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
    let buf;
    try { buf = Buffer.from(b64, 'base64'); } catch { buf = null; }
    if (!buf || !buf.length) return res.status(400).json({ error: 'ไม่มีข้อมูลรูป' });
    if (buf.length > 3_000_000) return res.status(400).json({ error: 'รูปใหญ่เกิน 3MB — ย่อรูปก่อนอัปโหลด' });

    const blob = await put(`ebookme/images/${Date.now()}-${filename}`, buf, {
      access: 'public',
      contentType: MIME[ext],
      addRandomSuffix: false,
      token: BLOB_TOKEN,
    });
    return res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
