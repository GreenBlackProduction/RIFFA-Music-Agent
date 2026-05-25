import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./ImageViewer.css";

interface ImageViewerProps {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

export function ImageViewer({ imageUrl, title, onClose }: ImageViewerProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div className="image-viewer-backdrop" onClick={onClose}>
      <div className="image-viewer-container" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="image-viewer-close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          ×
        </button>
        {title && <div className="image-viewer-title">{title}</div>}
        <img src={imageUrl} alt={title || t("sharePage.cover")} className="image-viewer-img" />
      </div>
    </div>,
    document.body,
  );
}
