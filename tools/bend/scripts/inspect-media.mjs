import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("output/evidence/phase7-0");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(mp4|webm|png|bendpkg)$/i.test(entry.name)) files.push(absolute);
  }
}
walk(root);
const ffprobe = "ffprobe";
const entries = [];
for (const file of files) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const bytes = fs.readFileSync(file);
  const entry = {
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    signature: bytes.subarray(0, 12).toString("hex"),
  };
  if (/\.mp4$|\.webm$/i.test(file)) {
    try {
      const json = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,size,format_name", "-show_entries", "stream=index,codec_name,codec_type,width,height,avg_frame_rate,sample_rate,channels,start_time,duration,nb_frames", "-of", "json", file], { encoding: "utf8" }));
      entry.format = json.format;
      entry.streams = json.streams;
    } catch (error) {
      entry.probeError = String(error).slice(0, 500);
    }
  }
  if (/\.png$/i.test(file) && bytes.subarray(1, 4).toString("ascii") === "PNG") {
    entry.png = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  entries.push(entry);
}
fs.writeFileSync(path.join(root, "media-inspection.json"), JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
for (const entry of entries) {
  if (!entry.path.includes("local-")) {
    const streams = (entry.streams ?? []).map((stream) => `${stream.codec_type}:${stream.codec_name}${stream.width ? ` ${stream.width}x${stream.height}@${stream.avg_frame_rate}` : ""}${stream.sample_rate ? ` ${stream.channels}ch/${stream.sample_rate}Hz` : ""}`).join(" ");
    console.log(`${entry.path}\t${entry.bytes}\t${entry.format?.duration ?? entry.png ? `${entry.png?.width}x${entry.png?.height}` : ""}\t${streams}`);
  }
}
