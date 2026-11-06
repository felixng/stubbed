// Called directly from a click: keep clipboard.write in the user gesture,
// including on Safari. The rendered file is already PNG, with alpha intact.
export async function copyCardImage(image: Blob): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Image copying is not supported by this browser");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
}
