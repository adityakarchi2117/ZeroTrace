import React, { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  currentUrl?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
}

/**
 * Client-side EXIF stripper.
 * Re-draws the image on a <canvas> to produce a clean blob
 * with zero embedded metadata (GPS, camera, timestamps).
 */
function stripExifAndCompress(
  file: File,
  maxSize = 1024,
  quality = 0.85,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to compress"));
          const cleanFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            {
              type: "image/jpeg",
            },
          );
          resolve(cleanFile);
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image"));
    };

    img.src = url;
  });
}

export default function PhotoUploader({
  currentUrl,
  onUpload,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sizeInfo, setSizeInfo] = useState<string>("");

  // Revoke blob URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const raw = e.target.files[0];

      if (!raw.type.startsWith("image/")) {
        alert("Only image files are allowed.");
        return;
      }
      if (raw.size > 10 * 1024 * 1024) {
        alert("Image must be under 10 MB.");
        return;
      }

      setUploading(true);
      try {
        const clean = await stripExifAndCompress(raw);
        setSizeInfo(
          `${(raw.size / 1024).toFixed(0)}KB → ${(clean.size / 1024).toFixed(0)}KB`,
        );
        setPreview(URL.createObjectURL(clean));
        await onUpload(clean);
      } catch (err) {
        console.error("Upload failed:", err);
        alert("Failed to process image");
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const handleRemove = useCallback(async () => {
    if (onRemove) {
      await onRemove();
      setPreview(null);
      setSizeInfo("");
    }
  }, [onRemove]);

  const displayUrl = preview || currentUrl;

  return (
    <div className="flex items-center gap-4">
      <div className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-gray-700 bg-gray-800 flex-shrink-0">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xl">
            👤
          </div>
        )}
        <div
          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <span className="text-white text-xs">Change</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30 text-sm"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading
              ? "Processing…"
              : displayUrl
                ? "Change photo"
                : "Upload photo"}
          </button>
          {displayUrl && onRemove && (
            <button
              className="px-3 py-2 rounded-lg bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 text-sm"
              onClick={handleRemove}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSelect}
        />
        <p className="text-xs text-gray-500">
          EXIF stripped · compressed locally before upload
          {sizeInfo && <span className="text-cyan-400 ml-1">({sizeInfo})</span>}
        </p>
      </div>
    </div>
  );
}
