import { stat } from "node:fs/promises";
import { FilePathSource } from "mediabunny";
import { inspectVideo } from "./inspect-video.mjs";

for (const path of process.argv.slice(2)) {
  try {
    console.log(path, await inspectVideo(new FilePathSource(path), (await stat(path)).size));
  } catch (error) {
    console.error(path, error.message);
    process.exitCode = 1;
  }
}
