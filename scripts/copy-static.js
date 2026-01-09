import fs from "fs";
import path from "path";

const outDir = path.resolve("out");
const nextStatic = path.resolve(".next/static");
const publicDir = path.resolve("public");

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.cpSync(nextStatic, path.join(outDir, "static"), { recursive: true });
fs.cpSync(publicDir, outDir, { recursive: true });

console.log("✅ Built static version in 'out' folder");