export type SquareCrop = { x: number; y: number; side: number };
export type CropRectangle = [number, number, number, number];

export function squareCrop(
  width: number,
  height: number,
  centerX = width / 2,
  centerY = height / 2,
  side = Math.min(width, height),
): SquareCrop {
  const boundedSide = Math.min(width, height, Math.max(1, Math.round(side)));
  return {
    x: Math.max(0, Math.min(width - boundedSide, Math.round(centerX - boundedSide / 2))),
    y: Math.max(0, Math.min(height - boundedSide, Math.round(centerY - boundedSide / 2))),
    side: boundedSide,
  };
}

export function normalizedCrop(crop: SquareCrop, width: number, height: number): CropRectangle {
  return [crop.x / width, crop.y / height, crop.side / width, crop.side / height];
}

export async function renderPhotoCrop(source: Blob, crop: SquareCrop) {
  const bitmap = await createImageBitmap(source);
  try {
    const rectangle = normalizedCrop(crop, bitmap.width, bitmap.height);
    const render = async (limit: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(limit, crop.side);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Could not encode the crop"));
        }, "image/jpeg", 0.85);
      });
    };
    const [display, thumbnail] = await Promise.all([render(1600), render(400)]);
    return { source, display, thumbnail, rectangle };
  } finally {
    bitmap.close();
  }
}
