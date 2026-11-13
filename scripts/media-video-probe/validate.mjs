import { readFile, stat } from "node:fs/promises";
import { inspectVideo } from "./inspect-video.mjs";

for (const path of process.argv.slice(2)) {
  try {
    if ((await stat(path)).size > 15 * 1024 * 1024) throw new Error("MEDIA_VIDEO_SIZE");
    console.log(path, await inspectVideo(await readFile(path)));
  } catch (error) {
    console.error(path, error.message);
    process.exitCode = 1;
  }
}
