/** Сжатие data URL фото товара перед отправкой в API (браузер). */

export function compressFlowPhotoDataUrl(dataUrl: string, maxWidth = 960): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(dataUrl);
  if (!dataUrl.startsWith("data:image")) return Promise.resolve(dataUrl);
  if (dataUrl.length <= 280_000) return Promise.resolve(dataUrl);

  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}
