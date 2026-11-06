import assert from "node:assert/strict";
import { test } from "node:test";
import { copyCardImage } from "@/lib/share-clipboard";

test("image copy writes the original PNG and propagates unavailable or denied clipboard access", async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const itemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  const image = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const written: unknown[][] = [];
  class Item {
    readonly data: Record<string, Blob>;
    constructor(data: Record<string, Blob>) { this.data = data; }
  }
  try {
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: Item });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      clipboard: { write: async (items: unknown[]) => { written.push(items); } },
    } });
    await copyCardImage(image);
    assert.equal(written.length, 1);
    assert.equal(written[0].length, 1);
    assert.equal((written[0][0] as Item).data["image/png"], image);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await assert.rejects(copyCardImage(image), /not supported/);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      clipboard: { write: async () => { throw new Error("Permission denied"); } },
    } });
    await assert.rejects(copyCardImage(image), /Permission denied/);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (itemDescriptor) Object.defineProperty(globalThis, "ClipboardItem", itemDescriptor);
    else Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
});
