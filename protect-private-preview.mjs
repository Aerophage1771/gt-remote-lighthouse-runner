#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT = path.resolve("release-artifacts");
const encodedKey = process.env.GT_PRIVATE_PREVIEW_KEY || "";
const key = Buffer.from(encodedKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encodedKey.length % 4) % 4), "base64");
if (key.length !== 32) throw new Error("GT_PRIVATE_PREVIEW_KEY must decode to 32 bytes.");

const files = (await fs.readdir(OUTPUT)).filter(name => name.endsWith(".png")).sort();
if (files.length === 0) {
  console.log("[private-preview] No PNGs found; leaving existing diagnostic output intact.");
  process.exit(0);
}

for (const file of files) {
  const plain = await fs.readFile(path.join(OUTPUT, file));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  await fs.writeFile(path.join(OUTPUT, `${file}.enc`), Buffer.concat([iv, ciphertext, tag]));
  await fs.rm(path.join(OUTPUT, file));
}

const cards = files.map(file => {
  const label = file.replace(/\.png$/, "").replaceAll("-", " ");
  return `<figure><div class="frame"><img data-enc="${file}.enc" alt="${label}"></div><figcaption>${label}</figcaption></figure>`;
}).join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Past Sessions Preview</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#eef2f5;color:#152235}main{max-width:1500px;margin:auto;padding:28px}h1{margin:0 0 8px}.notice,.status{padding:12px 14px;background:white;border:1px solid #ccd5de;border-radius:8px;margin:16px 0 24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}figure{margin:0;background:white;border:1px solid #ccd5de;border-radius:9px;padding:12px}.frame{min-height:160px;background:#dde4ea;display:flex;align-items:center;justify-content:center}img{width:100%;height:auto;display:block}figcaption{font-size:13px;margin-top:8px;text-transform:capitalize;color:#586778}@media(max-width:800px){main{padding:14px}.grid{grid-template-columns:1fr}}</style></head>
<body><main><h1>Private Past Sessions long-document preview</h1><div class="notice">Current GermaineTutoring frontend shell with API responses mocked in the browser. Screenshots are AES-256-GCM encrypted at rest. The decryption key is read only from this page’s URL fragment and is never sent to Netlify.</div><div class="status" id="status">Waiting for decryption key…</div><div class="grid">${cards}</div></main>
<script type="module">
const status = document.getElementById('status');
const raw = new URLSearchParams(location.hash.slice(1)).get('k');
function decodeKey(value){const b64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);const s=atob(b64);return Uint8Array.from(s,c=>c.charCodeAt(0));}
async function decryptImage(img,key){const response=await fetch(img.dataset.enc,{cache:'no-store'});if(!response.ok)throw new Error('Encrypted image fetch failed: '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());const iv=bytes.slice(0,12);const encrypted=bytes.slice(12);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,encrypted);img.src=URL.createObjectURL(new Blob([plain],{type:'image/png'}));}
if(!raw){status.textContent='This preview requires the private #k=… fragment.';}else{try{const bytes=decodeKey(raw);if(bytes.length!==32)throw new Error('Invalid key length');const key=await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['decrypt']);await Promise.all([...document.querySelectorAll('img[data-enc]')].map(img=>decryptImage(img,key)));status.textContent='Decrypted locally in this browser. The key was not sent to the server.';}catch(error){status.textContent='Could not decrypt preview: '+error.message;}}
</script></body></html>`;

await fs.writeFile(path.join(OUTPUT, "index.html"), html);
console.log(`[private-preview] Encrypted ${files.length} screenshots and removed all plaintext PNGs.`);
