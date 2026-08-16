// Dev helper: derive tile/bridge goals from lib/board-data.ts and emit SQL VALUES.
// Not part of the app runtime.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../lib/board-data.ts", import.meta.url), "utf8");
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const goal = (o) => {
  const m = /(\d+)\s*x/i.exec(o || "");
  return m ? parseInt(m[1], 10) : 1;
};

const rows = [];
const tRe = /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
let m;
while ((m = tRe.exec(src))) {
  rows.push([slug(m[1].replace(/\\"/g, '"')), goal(m[2].replace(/\\"/g, '"'))]);
}
const bRe = /id:\s*"(bridge_[a-z_]+)"[\s\S]*?o:\s*"((?:[^"\\]|\\.)*)"/g;
while ((m = bRe.exec(src))) {
  rows.push([m[1], goal(m[2].replace(/\\"/g, '"'))]);
}

const vals = rows.map(([id, g]) => `  ('${id}', ${g})`).join(",\n");
fs.writeFileSync(new URL("./goals.values.sql", import.meta.url), vals);
process.stderr.write(`count ${rows.length}\n`);
process.stderr.write("goal>1: " + rows.filter((r) => r[1] > 1).map((r) => r.join("=")).join(", ") + "\n");
