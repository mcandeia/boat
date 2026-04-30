// Pre-deploy guard: verify the inline <script> body inside INDEX_HTML
// actually parses as JavaScript.
//
// Why this exists: ui.ts wraps the entire SPA in a single template
// literal. Template-literal escape rules strip a leading backslash from
// any character that isn't a recognised escape sequence, so a regex
// literal like /^\/m\/(\d+)$/ in the source is served as /^/m/(d+)$/
// — invalid JS. tsc is happy because the template is just a string;
// the browser is the first thing to notice and it crashes the app.
//
// This check ships the served JS through `new Function(...)` to fail
// the build the same way the browser would, so we never deploy a
// broken page again.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/ui.ts");

const src = fs.readFileSync(SRC, "utf8");

// Extract the INDEX_HTML template literal. We anchor on the unique
// `INDEX_HTML = /* html */ \`` prefix and scan to the matching closing
// backtick. ui.ts has no nested template literals or `${}` inside this
// blob (verified by `grep -c '${' ui.ts`), so a simple "first ` after
// the prefix" scan is correct.
const PREFIX = "INDEX_HTML = /* html */ `";
const start = src.indexOf(PREFIX);
if (start < 0) {
  console.error("check-ui: INDEX_HTML opener not found in", SRC);
  process.exit(1);
}
const bodyStart = start + PREFIX.length;
const bodyEnd = src.indexOf("`;", bodyStart);
if (bodyEnd < 0) {
  console.error("check-ui: INDEX_HTML closing backtick not found");
  process.exit(1);
}
const raw = src.slice(bodyStart, bodyEnd);

// Apply template-literal escape processing — that's what the browser
// will see. eval-ing the literal in isolation gives us the exact string.
let html;
try {
  // No interpolations in INDEX_HTML (asserted above); safe to eval.
  // eslint-disable-next-line no-eval
  html = (0, eval)("`" + raw + "`");
} catch (e) {
  console.error("check-ui: template-literal eval failed:", e.message);
  process.exit(1);
}

// Pull out every inline <script>…</script> and parse each one.
const scripts = [];
const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = scriptRe.exec(html)) !== null) {
  // Skip empty bodies (no inline JS) and external src= scripts.
  if (m[1].trim().length > 0) scripts.push(m[1]);
}
if (scripts.length === 0) {
  console.error("check-ui: no inline <script> body found in INDEX_HTML");
  process.exit(1);
}

let failed = 0;
for (const [i, body] of scripts.entries()) {
  try {
    // Use vm.Script — same parser as new Function but the SyntaxError
    // it throws includes line/column in the stack (new Function omits them
    // on Node).
    new vm.Script(body, { filename: `inline-script-${i + 1}.js` });
    console.log(`check-ui: <script>#${i + 1} (${body.length} chars) — OK`);
  } catch (e) {
    failed++;
    console.error(`check-ui: <script>#${i + 1} parse error: ${e.message}`);
    // vm.Script puts the bad line right at the top of the stack.
    const stackTop = (e.stack ?? "").split("\n").slice(0, 8).join("\n");
    const lineMatch = stackTop.match(/inline-script-\d+\.js:(\d+)/);
    const lineNum = lineMatch ? Number(lineMatch[1]) : null;
    if (lineNum) {
      const lines = body.split("\n");
      const start = Math.max(0, lineNum - 3);
      const end = Math.min(lines.length, lineNum + 2);
      for (let j = start; j < end; j++) {
        const marker = j + 1 === lineNum ? ">> " : "   ";
        console.error(`${marker}${j + 1}: ${lines[j]}`);
      }
    } else {
      console.error("(no line info — stack top: " + stackTop.replace(/\n/g, " | ") + ")");
    }
  }
}

if (failed > 0) {
  console.error(`\ncheck-ui: ${failed} script(s) failed to parse`);
  process.exit(1);
}
console.log(`check-ui: all ${scripts.length} inline script(s) parse cleanly`);
