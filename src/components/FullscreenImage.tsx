import { useEffect } from 'react';

interface FullscreenImageProps {
  src: string;
  onClose: () => void;
}

export function FullscreenImage({ src, onClose }: FullscreenImageProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fullscreen-overlay" onClick={onClose}>
      <img src={src} alt="archive full" onClick={(event) => event.stopPropagation()} />
      <button
        className="fullscreen-close"
        type="button"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
