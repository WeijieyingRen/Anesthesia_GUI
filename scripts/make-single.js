// scripts/make-single-all.js
// Usage: node scripts/make-single-all.js <outDir> <outSingleHtml>
// Example: node scripts/make-single-all.js out out/single.html

const fs = require("fs");
const path = require("path");

if (process.argv.length < 4) {
  console.error("Usage: node scripts/make-single-all.js <outDir> <outSingleHtml>");
  process.exit(1);
}
const outDir = process.argv[2];
const outSingle = process.argv[3];
const indexPath = path.join(outDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("index.html not found at", indexPath);
  process.exit(1);
}
let html = fs.readFileSync(indexPath, "utf8");

// helper: read file if exists
function readIfExists(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

// 1) Inline CSS files referenced by <link rel="stylesheet" href="...">
html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, (match) => {
  const m = match.match(/href=["']([^"']+)["']/i);
  if (!m) return match;
  let href = m[1];
  if (href.startsWith("/")) href = href.slice(1); // remove leading slash
  const file = path.join(outDir, href);
  const txt = readIfExists(file);
  if (!txt) { console.warn("missing css:", file); return match; }
  return `<style>\n${txt.toString("utf8")}\n</style>`;
});

// 2) Collect all JS files under out/_next/static and inline them in HEAD (ensure chunks available)
function walkDir(dir) {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) res = res.concat(walkDir(full));
    else res.push(full);
  }
  return res;
}
const jsRoot = path.join(outDir, "_next");
const jsFiles = walkDir(jsRoot).filter(f => f.endsWith(".js"));
let allJsContent = "";
for (const f of jsFiles) {
  const b = readIfExists(f);
  if (!b) continue;
  // wrap each chunk in an IIFE to avoid accidental re-run ordering issues
  allJsContent += `\n// ---- inlined chunk: ${path.relative(outDir, f)} ----\n` + b.toString("utf8") + "\n";
}

// 3) Inline any <script src="..."> referenced in index.html (local ones)
html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src) => {
  if (/^https?:\/\//i.test(src)) return m; // leave external
  let rel = src.replace(/^\//, "");
  const f = path.join(outDir, rel);
  const txt = readIfExists(f);
  if (txt) return `<script>\n${txt.toString("utf8")}\n</script>`;
  // otherwise leave and rely on global inlined chunks
  return "";
});

// 4) Inject the big combined chunk script at end of <head> (so runtime has everything)
const injectScript = `<script>\n${allJsContent}\n</script>\n`;

// put injectScript before </head>
html = html.replace(/<\/head>/i, injectScript + "</head>");

// 5) Inline images/fonts referenced directly in index.html (convert to data URI)
html = html.replace(/(src|href)=["'](\/?_next\/[^"']+|\/[^"'][^"']*\.(png|jpg|jpeg|svg|woff2|woff|ttf))["']/gi, (m, attr, urlpath) => {
  // skip external urls
  if (/^https?:\/\//i.test(urlpath)) return m;
  let p = urlpath.replace(/^\//, "");
  const full = path.join(outDir, p);
  const b = readIfExists(full);
  if (!b) { console.warn("missing asset", full); return m; }
  const ext = path.extname(full).slice(1).toLowerCase();
  let mime = "application/octet-stream";
  if (ext === "png") mime = "image/png";
  else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
  else if (ext === "svg") mime = "image/svg+xml";
  else if (ext === "woff2") mime = "font/woff2";
  else if (ext === "woff") mime = "font/woff";
  else if (ext === "ttf") mime = "font/ttf";
  const data = `data:${mime};base64,${b.toString("base64")}`;
  return `${attr}="${data}"`;
});

// 6) Rewrite absolute-root links so clicks don't go to file:// root — add data-route and class
// Replace href="/something" or href="/something/..." to href="#" and store original in data-route
html = html.replace(/<a\s+([^>]*?)href=["'](\/[^"']*)["']([^>]*)>/gi, (m, before, href, after) => {
  // keep anchors with protocols unchanged
  if (/^\/#?/.test(href) === false) return m;
  return `<a ${before}href="#" data-route="${href}" ${after}>`;
});

// 7) Inject navigation interception + popstate trigger for Next router
const navScript = `
<script>
(function(){
  // Intercept clicks on anchors with data-route and use history API + popstate.
  function handleNavClick(e){
    const a = e.target.closest && e.target.closest('a[data-route]');
    if(!a) return;
    const route = a.getAttribute('data-route');
    if(!route) return;
    e.preventDefault();
    try {
      // pushState to the route (relative path)
      history.pushState({}, '', route);
      // dispatch popstate so app routing picks it up
      window.dispatchEvent(new PopStateEvent('popstate',{state:{}}));
    } catch(err){
      // fallback: navigate directly to relative html file (e.g., /dashboard -> dashboard/index.html)
      const simple = route.replace(/^\\//,'');
      const fallback = simple.endsWith('/') ? simple + 'index.html' : (simple + (simple.includes('.') ? '' : '/index.html'));
      window.location.href = fallback;
    }
  }
  document.addEventListener('click', handleNavClick);

  // Also handle initial load when opened via file:// with a trailing hash or path
  // If location.pathname === '/' and location.hash like #/dashboard, convert to pushState
  if(location.hash && location.hash.startsWith('#/')) {
    const route = location.hash.slice(1);
    history.replaceState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate',{state:{}}));
  }
})();
</script>
`;

// append navScript before </body>
html = html.replace(/<\/body>/i, navScript + "</body>");

// 8) Final write
fs.mkdirSync(path.dirname(outSingle), { recursive: true });
fs.writeFileSync(outSingle, html, "utf8");
console.log("Wrote single file:", outSingle);
