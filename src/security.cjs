'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const iconv = require('iconv-lite');
const crypto = require('node:crypto');
const MAX_MARKDOWN_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const IMAGE_TYPES = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp','.avif':'image/avif','.ico':'image/x-icon'};
function isMarkdownPath(file) { return typeof file === 'string' && /\.(md|markdown|mdown)$/i.test(file); }
function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function safeRelativePath(relative) {
  if (typeof relative !== 'string' || relative.includes('\0') || relative.includes('\\') || /^[a-z][\w+.-]*:/i.test(relative) || relative.startsWith('//') || path.isAbsolute(relative)) throw new Error('仅允许相对路径');
  return relative;
}
async function resolveWithin(root, relative, base = root) {
  safeRelativePath(relative);
  const canonicalRoot = await fs.realpath(root);
  if (!samePath(path.resolve(root), canonicalRoot)) throw new Error('授权目录路径已改变，请重新选择');
  const candidate = await fs.realpath(path.resolve(base, relative));
  if (!isPathInside(canonicalRoot, candidate)) throw new Error('文件在授权目录之外');
  return candidate;
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
function samePath(a, b) {
  return path.relative(a, b) === '';
}
async function readBounded(file, maxBytes, authorizedRoot) {
  // Preserve the authorization boundary from before open. Re-resolving the root
  // afterwards could accidentally authorize a replacement directory/symlink.
  const canonicalRoot = authorizedRoot ? await fs.realpath(authorizedRoot) : null;
  if (canonicalRoot && !samePath(path.resolve(authorizedRoot), canonicalRoot)) throw new Error('授权目录路径已改变，请重新选择');
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('请选择普通文件');
  if (canonicalRoot && !isPathInside(canonicalRoot, file)) throw new Error('文件在授权目录之外');
  // Windows does not expose POSIX nofollow/nonblocking open flags; the
  // canonical path and descriptor identity checks below still apply there.
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 :
    ((constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0)));
  const handle = await fs.open(file, flags);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('请选择普通文件');
    const afterPath = await fs.realpath(file);
    if (!samePath(file, afterPath) || canonicalRoot && !isPathInside(canonicalRoot, afterPath)) throw new Error('文件路径在读取前已改变');
    const after = await fs.lstat(afterPath);
    if (!after.isFile() || after.isSymbolicLink() || !sameFile(before, stat) || !sameFile(after, stat)) throw new Error('文件在读取前已改变，请重新打开');
    // Linux exposes the opened descriptor's actual target. This also catches a
    // parent-directory replacement between path checks without reading any bytes.
    if (process.platform === 'linux') {
      let openedPath;
      try { openedPath = await fs.realpath(`/proc/self/fd/${handle.fd}`); }
      catch (error) { if (!['ENOENT', 'EACCES'].includes(error.code)) throw error; }
      if (openedPath && (!samePath(file, openedPath) || canonicalRoot && !isPathInside(canonicalRoot, openedPath))) throw new Error('打开的文件不在授权路径中');
    }
    if (stat.size > maxBytes) throw new Error(`文件超过 ${maxBytes / 1024 / 1024} MB 限制`);
    // Bound allocation even if another program grows the file between stat and read.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let count = 0;
    while (count < buffer.length) {
      const {bytesRead} = await handle.read(buffer, count, buffer.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > maxBytes) throw new Error('文件过大');
    return {buffer:buffer.subarray(0,count), stat};
  } finally { await handle.close(); }
}
function hasRasterSignature(buffer, extension) {
  const starts = values => values.length <= buffer.length && values.every((byte, index) => buffer[index] === byte);
  switch (extension) {
    case '.png': return starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    case '.jpg': case '.jpeg': return starts([0xff,0xd8,0xff]);
    case '.gif': return ['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6));
    case '.webp': return buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
    case '.bmp': return buffer.length >= 14 && buffer[0] === 0x42 && buffer[1] === 0x4d;
    case '.ico': return buffer.length >= 6 && starts([0,0,1,0]) && buffer.readUInt16LE(4) > 0;
    case '.avif': {
      if (buffer.length < 16 || buffer.toString('ascii',4,8) !== 'ftyp') return false;
      const boxSize = buffer.readUInt32BE(0);
      if (boxSize < 16 || boxSize > buffer.length) return false;
      if (['avif','avis'].includes(buffer.toString('ascii',8,12))) return true;
      for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
        if (['avif','avis'].includes(buffer.toString('ascii',offset,offset + 4))) return true;
      }
      return false;
    }
    default: return false;
  }
}
async function readMarkdown(file, authorizedRoot) {
  if (!isMarkdownPath(file)) throw new Error('只支持 .md、.markdown 和 .mdown 文件');
  const canonical = await fs.realpath(file);
  const {buffer, stat} = await readBounded(canonical, MAX_MARKDOWN_BYTES, authorizedRoot);
  let text, encoding = 'UTF-8';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {text = iconv.decode(buffer, 'utf16-le'); encoding = 'UTF-16 LE';}
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) {text = iconv.decode(buffer, 'utf16-be'); encoding = 'UTF-16 BE';}
  else {
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(buffer); }
    catch { text = iconv.decode(buffer, 'gb18030'); encoding = 'GB18030'; }
  }
  if (text.includes('\0')) throw new Error('此文件似乎是二进制文件');
  const decoded=text.replace(/^\uFEFF/,'');
  const codec={'UTF-16 LE':'utf16-le','UTF-16 BE':'utf16-be','GB18030':'gb18030'}[encoding]||'utf8';
  const bomBytes=buffer.subarray(0,3).equals(Buffer.from([239,187,191]))?3:(encoding.startsWith('UTF-16')?2:0);
  const encodingLossless=iconv.encode(decoded,codec).equals(buffer.subarray(bomBytes));
  return {path:canonical,name:path.basename(canonical),text:text.replace(/^\uFEFF/,''),encoding,encodingLossless,bom:buffer.subarray(0,3).equals(Buffer.from([239,187,191]))||buffer.subarray(0,2).equals(Buffer.from([255,254]))||buffer.subarray(0,2).equals(Buffer.from([254,255])),eol:text.includes('\r\n')?'CRLF':'LF',digest:crypto.createHash('sha256').update(buffer).digest('hex'),mtime:stat.mtimeMs,size:stat.size};
}
async function resolveImage(root, relative, base = root) {
  const file = await resolveWithin(root, relative, base);
  const extension = path.extname(file).toLowerCase();
  const mime = IMAGE_TYPES[extension];
  if (!mime) throw new Error('仅允许本地光栅图片');
  const {buffer} = await readBounded(file, MAX_IMAGE_BYTES, root);
  if (!hasRasterSignature(buffer, extension)) throw new Error('图片内容与光栅格式不符');
  return {buffer, mime, file};
}
function parseCommandLine(argv, cwd = process.cwd()) {
  return argv.filter(arg => isMarkdownPath(arg) && !arg.startsWith('-')).map(arg => path.resolve(cwd,arg));
}
module.exports = {MAX_MARKDOWN_BYTES,MAX_IMAGE_BYTES,isMarkdownPath,isPathInside,resolveWithin,readMarkdown,resolveImage,parseCommandLine,safeRelativePath};
