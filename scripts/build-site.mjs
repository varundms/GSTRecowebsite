import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "out");

/** Apply vercel.json build.env when vars are not set (local builds without .env). */
function applyVercelBuildEnv() {
  try {
    const vercelPath = path.join(root, "vercel.json");
    const { build } = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    const env = build?.env;
    if (!env || typeof env !== "object") return;
    for (const [key, value] of Object.entries(env)) {
      if (!process.env[key]?.trim() && value != null) {
        process.env[key] = String(value);
      }
    }
  } catch {
    /* vercel.json optional */
  }
}

applyVercelBuildEnv();

function resolveMediaBase() {
  const explicit = process.env.PUBLIC_SITE_MEDIA_BASE?.trim();
  if (explicit) {
    return explicit.endsWith("/") ? explicit : `${explicit}/`;
  }
  const mediaUrl = (process.env.SUPABASE_MEDIA_URL || process.env.SUPABASE_URL || "")
    .replace(/\/$/, "");
  const bucket = process.env.STORAGE_PUBLIC_BUCKET?.trim();
  if (mediaUrl && bucket) {
    return `${mediaUrl}/storage/v1/object/public/${bucket}/`;
  }
  return null;
}

/** Bare root-level media filename (matches what we upload to Storage). */
const ROOT_MEDIA_FILE = /^[-A-Za-z0-9_.]+\.(?:png|jpe?g|webp|gif|svg|ico|mp4|webm)$/i;

function isRootMediaRef(value) {
  const v = String(value).trim();
  if (!v || v.includes("/") || v.includes("\\")) return false;
  if (/^(https?:|data:|mailto:|#|javascript:)/i.test(v)) return false;
  return ROOT_MEDIA_FILE.test(v);
}

/**
 * Rewrite src= / href= pointing at root media files to the Storage CDN.
 * Does not rely on media files being present on disk (Vercel applies .vercelignore).
 */
function rewriteHtml(html, base) {
  function rewriteAttr(h, attr) {
    const re = new RegExp(`\\b${attr}=(["'])([^"']*)\\1`, "g");
    return h.replace(re, (full, quote, val) => {
      if (!isRootMediaRef(val)) return full;
      return `${attr}=${quote}${base}${val}${quote}`;
    });
  }
  let out = rewriteAttr(html, "src");
  out = rewriteAttr(out, "href");
  return out;
}

const base = resolveMediaBase();
const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_MEDIA_URL ||
  ""
).replace(/\/$/, "");
const supabaseAnon = process.env.SUPABASE_ANON_KEY?.trim() || "";

if (!base) {
  console.error(
    "Missing media CDN base. Set SUPABASE_MEDIA_URL + STORAGE_PUBLIC_BUCKET (see vercel.json build.env), or PUBLIC_SITE_MEDIA_BASE."
  );
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const htmlFiles = fs
  .readdirSync(root)
  .filter((f) => f.endsWith(".html") && fs.statSync(path.join(root, f)).isFile());

const supabaseHtmlFiles = htmlFiles.filter((f) =>
  fs.readFileSync(path.join(root, f), "utf8").includes("__SUPABASE")
);

if (supabaseHtmlFiles.length && (!supabaseUrl || !supabaseAnon)) {
  console.error(
    "Missing SUPABASE_URL (or SUPABASE_MEDIA_URL) and/or SUPABASE_ANON_KEY for blog/cms pages:",
    supabaseHtmlFiles.join(", ")
  );
  console.error("Local: copy .env.example to .env and set keys. Vercel: Project → Environment variables.");
  process.exit(1);
}

for (const file of htmlFiles) {
  const srcPath = path.join(root, file);
  let html = rewriteHtml(fs.readFileSync(srcPath, "utf8"), base);
  html = html.replaceAll("__SUPABASE_URL__", supabaseUrl);
  html = html.replaceAll("__SUPABASE_ANON_KEY__", supabaseAnon);
  if (html.includes("__SUPABASE_URL__") || html.includes("__SUPABASE_ANON_KEY__")) {
    console.error(`Unresolved Supabase placeholders in ${file}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, file), html, "utf8");
  console.log(`Wrote out/${file}`);
}

const jsDir = path.join(root, "js");
if (fs.existsSync(jsDir)) {
  const outJs = path.join(outDir, "js");
  fs.mkdirSync(outJs, { recursive: true });
  for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))) {
    fs.copyFileSync(path.join(jsDir, file), path.join(outJs, file));
    console.log(`Wrote out/js/${file}`);
  }
}
// Copy root-level JSON data files (e.g. hsn-data.json)
for (const file of fs.readdirSync(root).filter(
  (f) => f.endsWith('.json') && fs.statSync(path.join(root, f)).isFile()
       && !['package.json','vercel.json'].includes(f)
)) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  console.log(`Wrote out/${file}`);
}
console.log(`Build complete (${htmlFiles.length} HTML). Media from ${base}`);
