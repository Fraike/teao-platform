import { useState, useEffect } from "react";

export function useBase64Image(path: string) {
  const [src, setSrc] = useState(path);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    };
    img.onerror = () => setSrc("");
    img.src = path;
  }, [path]);
  return src;
}
