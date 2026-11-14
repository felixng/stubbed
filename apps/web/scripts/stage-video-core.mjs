import { access, copyFile, mkdir, readdir } from "node:fs/promises";

const web = new URL("../", import.meta.url);
const root = new URL("public/video-core/", web);
const wrapper = new URL("wrapper/", root);
const corePackage = new URL("node_modules/@ffmpeg/core/dist/esm/", web);
const wrapperPackage = new URL("node_modules/@ffmpeg/ffmpeg/dist/esm/", web);

if (process.argv.includes("--build")) {
  if (!process.env.NEXT_PUBLIC_VIDEO_SOFTWARE_CORE) process.exit(0);
  if (process.env.NEXT_PUBLIC_VIDEO_SOFTWARE_CORE !== "/video-core/") {
    throw new Error("Set NEXT_PUBLIC_VIDEO_SOFTWARE_CORE to /video-core/ for this build.");
  }
  for (const name of ["source/ffmpeg-core.tar.gz", "source/mediabunny-aac.tar.gz"]) {
    await access(new URL(name, root)).catch(() => {
      throw new Error(`Stage the corresponding source archive at public/video-core/${name} before building.`);
    });
  }
}

await mkdir(wrapper, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(new URL(name, corePackage), new URL(name, root));
}
for (const name of await readdir(wrapperPackage)) {
  if (name.endsWith(".js")) {
    await copyFile(new URL(name, wrapperPackage), new URL(name, wrapper));
  }
}


const aacPackage = new URL("node_modules/@mediabunny/aac-encoder/", web);
const notices = new URL("notices/", root);
await mkdir(notices, { recursive: true });
for (const [source, target] of [
  ["README.md", "aac-build.md"],
  ["LICENSE", "aac-MPL-2.0.txt"],
  ["licenses/ffmpeg/COPYING.LGPLv2.1", "aac-FFmpeg-LGPL-2.1.txt"],
  ["licenses/ffmpeg/LICENSE.md", "aac-FFmpeg-license.md"],
]) {
  await copyFile(new URL(source, aacPackage), new URL(target, notices));
}
