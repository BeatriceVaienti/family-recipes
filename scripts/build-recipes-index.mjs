#!/usr/bin/env node
/**
 * Build recipes.json from manifests/*.json
 * - Reads IIIF Presentation 3 manifests
 * - Extracts: id, label, summary, manifest, data, thumbnail
 * - Writes ./recipes.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MANIFESTS_DIR = "manifests";
const OUT_FILE = "recipes.json";

// Configure these if you ever rename the repo or use a custom domain.
const PAGES_BASE =
  process.env.PAGES_BASE ||
  "https://BeatriceVaienti.github.io/family-recipes";

function isJsonFile(name) {
  return name.toLowerCase().endsWith(".json");
}

function naturalRecipeKey(filename) {
  // recipe-001.json -> 1
  const m = filename.match(/recipe-(\d+)\.json$/i);
  return m ? Number.parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function pickLang(iiifLangMap, lang = "it") {
  if (!iiifLangMap) return "";
  if (typeof iiifLangMap === "string") return iiifLangMap;
  const v = iiifLangMap[lang] || iiifLangMap.en || iiifLangMap.it;
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

function getThumbnail(manifest) {
  // Prefer manifest-level thumbnail (Presentation 3)
  const t = manifest.thumbnail;
  if (Array.isArray(t) && t[0]) {
    if (typeof t[0] === "string") return t[0];
    if (t[0]?.id) return t[0].id;
  }

  // Fallback: first canvas painting body id
  const body =
    manifest?.items?.[0]?.items?.[0]?.items?.[0]?.body;
  if (body?.id) return body.id;

  return "";
}

function extractRecipeDataUrlFromMetadata(manifest) {
  // Look for metadata entry that contains a URL to /data/recipe-XYZ.json
  const md = manifest.metadata;
  if (!Array.isArray(md)) return "";

  const urls = [];
  for (const entry of md) {
    const value = entry?.value;
    if (!value) continue;

    // value is an IIIF lang map: { it: ["..."], en: ["..."] }
    for (const lang of Object.keys(value)) {
      const arr = value[lang];
      if (!Array.isArray(arr)) continue;
      for (const s of arr) {
        if (typeof s === "string" && s.includes("/data/") && s.endsWith(".json")) {
          urls.push(s);
        }
      }
    }
  }
  return urls[0] || "";
}

function inferIdFromManifestId(manifestId) {
  // .../manifests/recipe-001.json -> recipe-001
  if (!manifestId) return "";
  const base = manifestId.split("/").pop() || "";
  return base.replace(/\.json$/i, "");
}

function inferDataUrl(pagesBase, id) {
  // recipe-001 -> .../data/recipe-001.json
  if (!id) return "";
  return `${pagesBase}/data/${id}.json`;
}

function ensureAbsolute(pagesBase, maybeUrl) {
  // If it's already absolute, keep it. If it's relative, make it absolute.
  if (!maybeUrl) return "";
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
  return `${pagesBase.replace(/\/$/, "")}/${maybeUrl.replace(/^\//, "")}`;
}

async function main() {
  const manifestsPath = path.join(process.cwd(), MANIFESTS_DIR);
  const files = (await fs.readdir(manifestsPath))
    .filter(isJsonFile)
    .sort((a, b) => naturalRecipeKey(a) - naturalRecipeKey(b));

  const out = [];

  for (const file of files) {
    const manifestUrl = `${PAGES_BASE}/${MANIFESTS_DIR}/${file}`;
    const raw = await fs.readFile(path.join(manifestsPath, file), "utf8");
    const manifest = JSON.parse(raw);

    const id = inferIdFromManifestId(manifest.id) || file.replace(/\.json$/i, "");
    const label = manifest.label || {};
    const summary = manifest.summary || {};

    let thumbnail = getThumbnail(manifest);
    thumbnail = ensureAbsolute(PAGES_BASE, thumbnail);

    let dataUrl = extractRecipeDataUrlFromMetadata(manifest);
    if (!dataUrl) dataUrl = inferDataUrl(PAGES_BASE, id);
    dataUrl = ensureAbsolute(PAGES_BASE, dataUrl);

    out.push({
      id,
      label,
      summary,
      manifest: manifestUrl,
      data: dataUrl,
      thumbnail,
      // Optional helpers (nice to have)
      title_it: pickLang(label, "it"),
      title_en: pickLang(label, "en"),
    });
  }

  await fs.writeFile(
    path.join(process.cwd(), OUT_FILE),
    JSON.stringify(out, null, 2) + "\n",
    "utf8"
  );

  console.log(`Wrote ${OUT_FILE} with ${out.length} recipes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
