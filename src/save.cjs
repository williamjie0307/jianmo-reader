'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const iconv=require('iconv-lite');
const {MAX_MARKDOWN_BYTES,readMarkdown,isMarkdownPath}=require('./security.cjs');
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function encodeDocument(text,doc={}) {
  if(doc.encodingLossless===false)throw new Error('原文件编码存在无法无损转换的字节。为保护原文件，请另存为 UTF-8 并检查内容');
  if(typeof text!=='string'||text.includes('\0'))throw new Error('无效的文档内容');
  // Textarea normalizes line endings. Preserve the source convention on disk.
  const normalized=text.replace(/\r\n?/g,'\n');
  const source=doc.eol==='CRLF'?normalized.replace(/\n/g,'\r\n'):normalized;
  const encoding={'UTF-16 LE':'utf16-le','UTF-16 BE':'utf16-be','GB18030':'gb18030'}[doc.encoding]||'utf8';
  let buffer=iconv.encode(source,encoding);
  if(iconv.decode(buffer,encoding)!==source)throw new Error('此编码无法无损保存文字，请另存为 UTF-8 文档');
  if(doc.bom){const bom=encoding==='utf16-le'?Buffer.from([255,254]):encoding==='utf16-be'?Buffer.from([254,255]):encoding==='utf8'?Buffer.from([239,187,191]):null;if(bom)buffer=Buffer.concat([bom,buffer]);}
  if(buffer.length>MAX_MARKDOWN_BYTES)throw new Error('文档超过 20 MB 保存限制');
  return buffer;
}
async function snapshot(file){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('请选择普通文件，不可覆盖符号链接');if(stat.size>MAX_MARKDOWN_BYTES)throw new Error('磁盘文件超过 20 MB，未覆盖');return {digest:digest(await fs.readFile(file)),mode:stat.mode};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function safeSave(file,text,doc,{expectedDigest=doc.digest,allowCreate=false}={}) {
  if(!isMarkdownPath(file))throw new Error('请保存为 .md、.markdown 或 .mdown 文件');
  const parent=await fs.realpath(path.dirname(file));
  if(path.resolve(path.dirname(file))!==parent)throw new Error('保存目录路径已改变，请重新选择');
  const before=await snapshot(file);
  if(before?.digest!==expectedDigest && !(allowCreate&&!before&&expectedDigest==null))throw new Error('磁盘文件已被其他程序修改或删除，未覆盖。请另存为保留你的修改，或重新载入后合并');
  const buffer=encodeDocument(text,doc);
  const temp=path.join(parent,`.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try{
    const handle=await fs.open(temp,'wx',before?.mode||0o600);
    try{await handle.writeFile(buffer);await handle.sync();}finally{await handle.close();}
    if(await fs.realpath(path.dirname(file))!==parent)throw new Error('保存目录已改变');
    const current=await snapshot(file);
    if(current?.digest!==before?.digest)throw new Error('保存期间磁盘文件发生变化，未覆盖，请另存为');
    await fs.rename(temp,file);
    return await readMarkdown(file,parent);
  }finally{await fs.unlink(temp).catch(()=>{});}
}
module.exports={digest,encodeDocument,safeSave,snapshot};
