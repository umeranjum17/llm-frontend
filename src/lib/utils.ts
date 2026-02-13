import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize SVG/HTML string by removing script tags, event handlers, and dangerous elements.
 */
export function sanitizeSvgHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "image/svg+xml");

  // Remove all script elements
  const scripts = doc.querySelectorAll("script");
  scripts.forEach((el) => el.remove());

  // Remove all event handler attributes and dangerous attrs
  const dangerous = /^on/i;
  const dangerousTags = ["foreignobject", "iframe", "embed", "object"];

  function walk(el: Element) {
    // Remove dangerous child elements
    if (dangerousTags.includes(el.tagName.toLowerCase())) {
      el.remove();
      return;
    }
    // Remove event handler attributes and javascript: hrefs
    for (const attr of Array.from(el.attributes)) {
      if (dangerous.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
      if (attr.name === "href" || attr.name === "xlink:href") {
        if (attr.value.trim().toLowerCase().startsWith("javascript:")) {
          el.removeAttribute(attr.name);
        }
      }
    }
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  }

  if (doc.documentElement) {
    walk(doc.documentElement);
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

/**
 * Wrap HTML for sandboxed srcDoc iframes with a storage shim.
 * Some browsers block localStorage/sessionStorage in sandboxed about:srcdoc contexts.
 */
export function wrapHtmlForSandbox(html: string): string {
  const shim = `<script id="lumina-storage-shim">(function(){var needsShim=false;try{var s=window.localStorage;var k="__lumina_storage_test__";s.setItem(k,"1");s.removeItem(k);}catch(_){needsShim=true;}if(!needsShim)return;var mk=function(){var data=Object.create(null);return{getItem:function(key){return Object.prototype.hasOwnProperty.call(data,key)?data[key]:null;},setItem:function(key,value){data[key]=String(value);},removeItem:function(key){delete data[key];},clear:function(){data=Object.create(null);},key:function(index){return Object.keys(data)[index]||null;},get length(){return Object.keys(data).length;}};};var ls=mk();var ss=mk();try{Object.defineProperty(window,"localStorage",{value:ls,configurable:true});}catch(_){try{window.localStorage=ls;}catch(__){}}try{Object.defineProperty(window,"sessionStorage",{value:ss,configurable:true});}catch(_){try{window.sessionStorage=ss;}catch(__){}}})();</script>`;

  if (!html) return shim;
  if (html.includes('id="lumina-storage-shim"')) return html;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${shim}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, `$1<head>${shim}</head>`);
  }

  return `${shim}${html}`;
}

/**
 * Map language names to proper file extensions.
 */
export function languageToExtension(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js", js: "js", jsx: "jsx",
    typescript: "ts", ts: "ts", tsx: "tsx",
    python: "py", py: "py",
    ruby: "rb", rust: "rs", golang: "go", go: "go",
    csharp: "cs", "c#": "cs", cpp: "cpp", "c++": "cpp",
    kotlin: "kt", swift: "swift", java: "java",
    html: "html", htm: "html", css: "css",
    scss: "scss", less: "less", sass: "sass",
    json: "json", yaml: "yaml", yml: "yml",
    markdown: "md", md: "md",
    bash: "sh", sh: "sh", shell: "sh",
    sql: "sql", graphql: "graphql",
    xml: "xml", svg: "svg", text: "txt",
  };
  return map[lang.toLowerCase()] || lang || "txt";
}
