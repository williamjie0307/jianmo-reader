import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import texmath from 'markdown-it-texmath';
import DOMPurify from 'dompurify';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Only raster data URLs with matching file signatures may reach an image element. */
export function isRasterDataURL(url) {
  if (url.length > 12 * 1024 * 1024) return false;
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z\d+/]+={0,2})$/i.exec(url);
  if (!match) return false;
  try {
    const bytes = atob(match[2].slice(0, 48));
    switch (match[1].toLowerCase()) {
      case 'png': return bytes.startsWith('\x89PNG\r\n\x1a\n');
      case 'jpg': case 'jpeg': return bytes.startsWith('\xff\xd8\xff');
      case 'gif': return bytes.startsWith('GIF87a') || bytes.startsWith('GIF89a');
      case 'webp': return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
      default: return false;
    }
  } catch { return false; }
}

export function imageSource(source, documentId) {
  let path = String(source || '').trim();
  if (path.startsWith('data:')) return isRasterDataURL(path) ? path : null;
  try { path = decodeURIComponent(path); } catch { return null; }
  // Disallow network, absolute paths, SVG, and embedded control characters.
  if (!path || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(path) || /[\x00-\x1f\x7f]/.test(path) || /\.svg(?:[?#]|$)/i.test(path)) return null;
  return `mdasset://${encodeURIComponent(documentId)}/${encodeURIComponent(path)}`;
}

export function countText(text) {
  const source = String(text).replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');
  const chinese = source.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
  const words = source.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  return chinese.length + words.length;
}

export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code, language) {
      if (code.length <= 100_000 && language && hljs.getLanguage(language)) {
        try { return hljs.highlight(code, { language, ignoreIllegals: true }).value; } catch { /* Escape below. */ }
      }
      return escape(code);
    },
  });
  // Accept only the editor's two inline styles. General raw HTML stays disabled.
  md.inline.ruler.before('html_inline', 'safe_editor_span', (state, silent) => {
    const tail = state.src.slice(state.pos);
    const match = /^<span style="((?:color: #[0-9a-fA-F]{6}|font-size: (?:1[2-9]|[2-4][0-9]|[5-6][0-9]|7[0-2])px)(?:; (?:color: #[0-9a-fA-F]{6}|font-size: (?:1[2-9]|[2-4][0-9]|[5-6][0-9]|7[0-2])px))?)">([^\n]*?)<\/span>/.exec(tail);
    if (!match) return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      // Content is escaped first by the editor; render it as literal text rather
      // than interpreting arbitrary nested HTML or CSS supplied by a document.
      token.content = `<span style="${match[1]}">${escape(md.utils.unescapeAll(match[2]))}</span>`;
    }
    state.pos += match[0].length; return true;
  });
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: { throwOnError: false, strict: 'ignore', trust: false, maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml' },
  });

  md.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    const original = token.attrGet('src') || '';
    const alt = md.renderer.renderInlineAsText(token.children || [], options, env);
    const source = imageSource(original, env.documentId);
    if (!source) {
      const remote = /^(?:https?:)?\/\//i.test(original);
      return `<span class="image-blocked" role="note"><span class="image-blocked-symbol" aria-hidden="true">▧</span><span>${escape(alt || '图片')}<small>${remote ? '远程图片已拦截 · 保护离线阅读与隐私' : '不支持此图片路径或格式'}</small></span></span>`;
    }
    return `<img src="${escape(source)}" alt="${escape(alt)}"${token.attrGet('title') ? ` title="${escape(token.attrGet('title'))}"` : ''} loading="lazy" decoding="async">`;
  };

  const normalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const language = tokens[index].info.trim().split(/\s+/)[0];
    const code = normalFence(tokens, index, options, env, self);
    return `<div class="code-block"><div class="code-label">${escape(language || '纯文本')}</div>${code}</div>`;
  };
  const normalTableOpen = md.renderer.rules.table_open || (() => '<table>');
  const normalTableClose = md.renderer.rules.table_close || (() => '</table>');
  md.renderer.rules.table_open = (...args) => `<div class="table-scroll" tabindex="0">${normalTableOpen(...args)}`;
  md.renderer.rules.table_close = (...args) => `${normalTableClose(...args)}</div>`;

  md.core.ruler.push('reader_structure', (state) => {
    const headings = [];
    const used = new Map();
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type === 'heading_open') {
        const inline = state.tokens[i + 1];
        const title = (inline.children || []).filter((part) => ['text', 'code_inline', 'image', 'math_inline'].includes(part.type)).map((part) => part.content).join('').trim() || inline.content;
        const slug = title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
        const count = used.get(slug) || 0;
        used.set(slug, count + 1);
        const anchor = `${slug}${count ? `-${count}` : ''}`;
        const id = `md-h-${anchor}`;
        token.attrSet('id', id);
        headings.push({ id, anchor, text: title, level: Number(token.tag.slice(1)) });
      }
      if (token.type === 'inline' && token.children?.[0]?.type === 'text' && /^\[[ xX]\]\s/.test(token.children[0].content) && state.tokens[i - 2]?.type === 'list_item_open') {
        const checked = /^\[[xX]\]/.test(token.children[0].content);
        token.children[0].content = token.children[0].content.slice(4);
        const checkbox = new state.Token('html_inline', '', 0);
        checkbox.content = `<input class="task-checkbox" type="checkbox" disabled${checked ? ' checked' : ''} aria-label="${checked ? '已完成' : '未完成'}">`;
        token.children.unshift(checkbox);
        state.tokens[i - 2].attrJoin('class', 'task-list-item');
      }
    }
    state.env.headings = headings;
  });

  return (source, documentId) => {
    const env = { documentId, headings: [] };
    const unsafe = md.render(String(source), env);
    const html = DOMPurify.sanitize(unsafe, {
      ADD_TAGS: ['eq', 'eqn'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'video', 'audio', 'source', 'foreignObject'],
      FORBID_ATTR: ['srcset', 'formaction', 'action', 'xlink:href'],
      // Relative Markdown links and the narrowly generated asset scheme are needed.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|mdasset):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      RETURN_TRUSTED_TYPE: false,
    });
    return { html, headings: env.headings, wordCount: countText(source) };
  };
}
