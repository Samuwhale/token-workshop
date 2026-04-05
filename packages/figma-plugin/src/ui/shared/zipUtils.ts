export async function buildZipBlobAsync(
  files: { path: string; content: string }[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (data: Uint8Array): number => {
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const enc = new TextEncoder();
  const w16 = (v: DataView, p: number, n: number) => v.setUint16(p, n, true);
  const w32 = (v: DataView, p: number, n: number) => v.setUint32(p, n, true);
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  const CHUNK_SIZE = 20;
  const yield_ = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = enc.encode(file.path);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const sz = data.length;

    const lh = new ArrayBuffer(30 + name.length);
    const lv = new DataView(lh);
    w32(lv, 0, 0x04034b50); w16(lv, 4, 20); w16(lv, 6, 0); w16(lv, 8, 0);
    w16(lv, 10, dosTime); w16(lv, 12, dosDate);
    w32(lv, 14, crc); w32(lv, 18, sz); w32(lv, 22, sz);
    w16(lv, 26, name.length); w16(lv, 28, 0);
    new Uint8Array(lh, 30).set(name);
    const lhBytes = new Uint8Array(lh);

    const cd = new ArrayBuffer(46 + name.length);
    const cv = new DataView(cd);
    w32(cv, 0, 0x02014b50); w16(cv, 4, 20); w16(cv, 6, 20); w16(cv, 8, 0); w16(cv, 10, 0);
    w16(cv, 12, dosTime); w16(cv, 14, dosDate);
    w32(cv, 16, crc); w32(cv, 20, sz); w32(cv, 24, sz);
    w16(cv, 28, name.length); w16(cv, 30, 0); w16(cv, 32, 0);
    w16(cv, 34, 0); w16(cv, 36, 0); w32(cv, 38, 0); w32(cv, 42, offset);
    new Uint8Array(cd, 46).set(name);

    parts.push(lhBytes, data);
    centralDir.push(new Uint8Array(cd));
    offset += lhBytes.length + sz;

    if ((i + 1) % CHUNK_SIZE === 0 || i === files.length - 1) {
      onProgress?.(Math.round(((i + 1) / files.length) * 100));
      await yield_();
    }
  }

  const cdSize = centralDir.reduce((s, e) => s + e.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  w32(ev, 0, 0x06054b50); w16(ev, 4, 0); w16(ev, 6, 0);
  w16(ev, 8, files.length); w16(ev, 10, files.length);
  w32(ev, 12, cdSize); w32(ev, 16, offset); w16(ev, 20, 0);

  return new Blob([...parts, ...centralDir, new Uint8Array(eocd)], { type: 'application/zip' });
}
