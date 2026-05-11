import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const url = process.env.SUPABASE_MEDIA_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const mediaAnonKey = process.env.SUPABASE_MEDIA_ANON_KEY?.trim();
const fallbackAnon = process.env.SUPABASE_ANON_KEY?.trim();
const bucket = process.env.STORAGE_PUBLIC_BUCKET?.trim() || "gst-reco-site-images";

const apiKey = serviceKey || mediaAnonKey || fallbackAnon;
if (!url || !apiKey) {
  console.error(
    "Set SUPABASE_MEDIA_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_MEDIA_ANON_KEY / SUPABASE_ANON_KEY in .env."
  );
  process.exit(1);
}

if (!serviceKey && mediaAnonKey) {
  console.warn("Using SUPABASE_MEDIA_ANON_KEY for uploads (bucket policies must allow anon writes). Prefer service role.");
}
if (!serviceKey && !mediaAnonKey && fallbackAnon) {
  console.warn("Using SUPABASE_ANON_KEY for uploads; ensure that key belongs to the same project as SUPABASE_MEDIA_URL.");
}

const extMime = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".JPG": "image/jpeg",
  ".PNG": "image/png",
  ".JPEG": "image/jpeg",
};

function guessMime(filePath) {
  return extMime[path.extname(filePath)] || "application/octet-stream";
}

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|svg|ico|mp4|webm)$/i;

const supabase = createClient(url, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tasks = [];
for (const name of fs.readdirSync(root)) {
  const abs = path.join(root, name);
  if (!fs.statSync(abs).isFile()) continue;
  if (!MEDIA_EXT.test(name)) continue;
  tasks.push({ abs, rel: name });
}

let ok = 0;
let fail = 0;

for (const { abs, rel } of tasks) {
  const body = fs.readFileSync(abs);
  const contentType = guessMime(abs);
  const { error } = await supabase.storage.from(bucket).upload(rel, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error(`FAIL ${rel}:`, error.message);
    fail++;
  } else {
    console.log(`OK   ${rel}`);
    ok++;
  }
}

console.log(`\nDone. ${ok} uploaded, ${fail} failed.`);
console.log(`${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`);
