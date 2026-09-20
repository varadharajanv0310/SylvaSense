/**
 * Rebase a built static export onto a GitHub Pages project subpath.
 *
 * A project site lives at https://<user>.github.io/<repo>/, but this app's
 * toolchain cannot take Next's basePath: vinext passes it straight into
 * rolldown's assetFileNames, where a leading slash is rejected as an absolute
 * pattern. So the rebasing happens here instead, after the build, on the
 * emitted files.
 *
 * Only prefixes this app actually owns are rewritten - /_next, /media, the
 * report JSON and the handful of real routes. Anything else that happens to
 * start with a slash is left alone, because a blind s#/#/repo/# would corrupt
 * the data file and every unrelated string in the bundles.
 *
 *   node scripts/pages-rewrite.mjs dist/client /SylvaSense
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const [, , rootArg, baseArg] = process.argv;
const root = rootArg ?? "dist/client";
const base = (baseArg ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/pages-rewrite.mjs <dir> /<repo>");
  process.exit(1);
}

// the app's own routes, longest first so /study does not shadow /studies
const ROUTES = [
  "/record",
  "/console",
  "/studies",
  "/concepts",
  "/study/",
  "/concept-",
];

const TEXT = new Set([".html", ".js", ".css", ".rsc", ".json", ".txt", ".map"]);

/** Every quoting style the bundles use for a path. */
function rebase(text) {
  let out = text;

  // assets: unambiguous, they only ever appear as real paths
  out = out.replaceAll('"/_next/', `"${base}/_next/`);
  out = out.replaceAll("'/_next/", `'${base}/_next/`);
  out = out.replaceAll("(/_next/", `(${base}/_next/`);
  out = out.replaceAll('"/media/', `"${base}/media/`);
  out = out.replaceAll("'/media/", `'${base}/media/`);
  out = out.replaceAll("url(/media/", `url(${base}/media/`);
  out = out.replaceAll('url("/media/', `url("${base}/media/`);
  out = out.replaceAll('"/sylvasense-report.json', `"${base}/sylvasense-report.json`);
  out = out.replaceAll('"/favicon.svg', `"${base}/favicon.svg`);

  // routes: only in attribute or string position, never bare
  for (const r of ROUTES) {
    out = out.replaceAll(`href="${r}`, `href="${base}${r}`);
    out = out.replaceAll(`"${r}"`, `"${base}${r}"`);
    out = out.replaceAll(`'${r}'`, `'${base}${r}'`);
  }
  // the root route, which has to be matched exactly or it eats everything
  out = out.replaceAll('href="/"', `href="${base}/"`);

  return out;
}

let files = 0;
let changed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!TEXT.has(extname(p))) continue;
    files += 1;
    const before = readFileSync(p, "utf8");
    // the data file is content, not code: rebasing strings inside it would
    // corrupt method descriptions that legitimately contain slashes
    const after = p.endsWith("sylvasense-report.json") ? before : rebase(before);
    if (after !== before) {
      writeFileSync(p, after);
      changed += 1;
    }
  }
}

walk(root);

// Pages runs Jekyll by default, which drops any directory beginning with an
// underscore - including _next, which is most of the build
writeFileSync(join(root, ".nojekyll"), "");

console.log(`rebased ${changed} of ${files} text files onto ${base}`);
console.log("wrote .nojekyll so Pages does not strip /_next");
