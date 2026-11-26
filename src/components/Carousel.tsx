import { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../lib/assets';

interface CarouselProps {
  images: string[];
  name: string;
}

export function Carousel({ images, name }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const signature = images.join('|');

  useEffect(() => {
    setSlide(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [signature]);

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!element.clientWidth) return;
        setSlide(Math.round(element.scrollLeft / element.clientWidth));
      });
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = (index: number) => {
    const element = trackRef.current;
    if (!element) return;
    element.scrollTo({ left: element.clientWidth * index, behavior: 'smooth' });
  };

  return (
    <>
      <div className="detail-carousel-wrapper">
        <div className="detail-carousel" ref={trackRef}>
          {images.map((src, index) => (
            <div className="detail-carousel-slide" key={`${src}-${index}`}>
              <img src={resolveAssetUrl(src)} alt={name} />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              className="carousel-arrow left"
              type="button"
              aria-label="Previous image"
              onClick={() => goTo(Math.max(0, slide - 1))}
            >
              ‹
            </button>
            <button
              className="carousel-arrow right"
              type="button"
              aria-label="Next image"
              onClick={() => goTo(Math.min(images.length - 1, slide + 1))}
            >
              ›
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="carousel-dots">
          {images.map((_, index) => (
            <button
              key={index}
              className={`carousel-dot${index === slide ? ' active' : ''}`}
              type="button"
              aria-label={`Image ${index + 1}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}
    </>
  );
}
