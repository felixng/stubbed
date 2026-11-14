import { copyFile, mkdir, readdir } from "node:fs/promises";

const web = new URL("../", import.meta.url);
const root = new URL("public/video-core/", web);
const wrapper = new URL("wrapper/", root);
const corePackage = new URL("node_modules/@ffmpeg/core/dist/esm/", web);
const wrapperPackage = new URL("node_modules/@ffmpeg/ffmpeg/dist/esm/", web);

await mkdir(wrapper, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(new URL(name, corePackage), new URL(name, root));
}
for (const name of await readdir(wrapperPackage)) {
  if (name.endsWith(".js")) {
    await copyFile(new URL(name, wrapperPackage), new URL(name, wrapper));
  }
}
