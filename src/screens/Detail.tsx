import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { OrderModal } from '../components/OrderModal';
import { useCatalog } from '../context/CatalogContext';
import { resolveAssetUrl } from '../lib/assets';
import { isSwipeBlockedTarget } from '../lib/swipe';

export function Detail() {
  const { id } = useParams<{ id: string }>();
  const { products } = useCatalog();
  const navigate = useNavigate();
  const [orderOpen, setOrderOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoRatio, setPhotoRatio] = useState<number | null>(null);
  const [slideWidth, setSlideWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 720 : window.innerWidth
  ));

  const reduceMotion = useReducedMotion();

  // Карусель: трансформ трека и ширина слайда (нужна для dragConstraints).
  const galleryRef = useRef<HTMLElement | null>(null);
  const carouselX = useMotionValue(0);
  const carouselControls = useDragControls();
  const slideWidthRef = useRef(0);
  const activeIndex = useRef(0);
  // Натуральные пропорции фото: контейнер на ПК повторяет форму снимка.
  const ratios = useRef<Record<number, number>>({});

  // Страница целиком: свайп вправо = назад в каталог.
  const pageX = useMotionValue(0);
  const pageControls = useDragControls();
  const navigatingBack = useRef(false);
  // Отменяет отложенный «прыжок» после зацикливания, если пользователь
  // начал новый жест или контейнер изменил размер.
  const wrapToken = useRef(0);

  const product = products.find((item) => item.id === id);
  // Карусель листает весь массив images; cover — запасной вариант,
  // если админ заполнил исключительно обложку.
  const photos = product
    ? product.images.length > 0
      ? product.images
      : product.cover
        ? [product.cover]
        : []
    : [];
  const photoCount = photos.length;
  const activePhoto = photoCount > 0 ? Math.min(photoIndex, photoCount - 1) : 0;

  // Бесконечная карусель: по клону последнего и первого фото по краям.
  // Свайп через край — это обычный слайд до клона, после которого трек
  // без анимации встаёт на настоящий кадр: картинка та же, прыжка не видно.
  const hasLoop = photoCount > 1;
  const slides = hasLoop ? [photos[photoCount - 1], ...photos, photos[0]] : photos;
  const virtualActive = hasLoop ? activePhoto + 1 : 0;
  const slideIndexOf = (index: number) => (hasLoop ? index + 1 : index);

  useEffect(() => {
    activeIndex.current = activePhoto;
  }, [activePhoto]);

  // Новый товар — карусель начинается с первого фото.
  // Layout-эффект: трек встаёт на первый слайд ещё до отрисовки,
  // иначе на кадр мелькал бы клон последнего фото.
  useLayoutEffect(() => {
    setPhotoIndex(0);
    setPhotoRatio(null);
    ratios.current = {};
    activeIndex.current = 0;
    carouselX.stop();
    carouselX.set(0);
  }, [id, carouselX]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ширина слайда = ширина контейнера. При ресайзе выравниваем трек
  // по активному фото без анимации.
  useLayoutEffect(() => {
    const node = galleryRef.current;
    if (!node) return;

    const measure = () => {
      const width = node.clientWidth;
      slideWidthRef.current = width;
      setSlideWidth((prev) => (prev === width ? prev : width));
      wrapToken.current += 1;
      carouselX.stop();
      carouselX.set(-slideIndexOf(activeIndex.current) * width);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [carouselX, photoCount, id]);

  // Пропорции активного фото для десктопной рамки карусели.
  useEffect(() => {
    setPhotoRatio(ratios.current[slideIndexOf(activePhoto)] ?? null);
  }, [activePhoto, photoCount]);

  const rememberRatio = (index: number, image: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return;

    const ratio = Math.min(1.6, Math.max(0.75, naturalWidth / naturalHeight));
    ratios.current[index] = ratio;
    if (index === slideIndexOf(activeIndex.current)) setPhotoRatio(ratio);
  };

  // Фото из кэша может быть уже complete к моменту монтирования — onLoad
  // тогда не срабатывает. Запоминаем пропорции таких картинок вручную,
  // иначе на ПК рамка остаётся дефолтной 4/5.
  useEffect(() => {
    const node = galleryRef.current;
    if (!node) return;

    node.querySelectorAll('img').forEach((image, index) => {
      if (image.complete && image.naturalWidth > 0) rememberRatio(index, image);
    });
  }, [id, photoCount]);

  // Возврат в предыдущее меню (каталог / архив / поиск).
  // Если товар открыли по прямой ссылке, истории приложения нет — ведём в каталог.
  const goBack = () => {
    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === 'number' && state.idx > 0) navigate(-1);
    else navigate('/');
  };

  const snapToPhoto = (index: number, instant: boolean) => {
    const width = slideWidthRef.current;
    wrapToken.current += 1;
    carouselX.stop();
    if (!width) return;

    const target = -slideIndexOf(index) * width;
    if (instant || reduceMotion) {
      carouselX.set(target);
      return;
    }

    animate(carouselX, target, { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 });
  };

  const goToPhoto = (next: number) => {
    if (photoCount < 2) return;

    const wrapped = ((next % photoCount) + photoCount) % photoCount;
    const width = slideWidthRef.current;

    setPhotoIndex(wrapped);
    activeIndex.current = wrapped;

    if (!width) return;

    wrapToken.current += 1;
    const token = wrapToken.current;
    carouselX.stop();

    const spring = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const;

    if (reduceMotion) {
      carouselX.set(-slideIndexOf(wrapped) * width);
      return;
    }

    if (next >= photoCount) {
      // Вперёд с последнего фото: доезжаем до клона первого справа и
      // без анимации встаём на настоящий первый кадр — то же изображение.
      void animate(carouselX, -(photoCount + 1) * width, spring).then(() => {
        if (wrapToken.current !== token) return;
        carouselX.set(-width);
      });
    } else if (next < 0) {
      // Назад с первого: доезжаем до клона последнего слева, затем
      // без анимации перескакиваем на настоящий последний кадр.
      void animate(carouselX, 0, spring).then(() => {
        if (wrapToken.current !== token) return;
        carouselX.set(-photoCount * width);
      });
    } else {
      void animate(carouselX, -slideIndexOf(wrapped) * width, spring);
    }
  };

  const selectPhoto = (index: number) => {
    if (index === activeIndex.current) return;

    setPhotoIndex(index);
    activeIndex.current = index;
    snapToPhoto(index, false);
  };

  // Карусель забирает горизонтальные жесты себе и не отдаёт их
  // свайпу «назад» на уровне страницы.
  const onCarouselPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (navigatingBack.current || photoCount < 2) return;
    if (!event.isPrimary || event.button > 0) return;

    // Новый жест отменяет отложенный переход после зацикливания.
    wrapToken.current += 1;
    event.stopPropagation();
    carouselControls.start(event);
  };

  const onCarouselDragEnd = (_event: unknown, info: PanInfo) => {
    const width = slideWidthRef.current || 1;
    const threshold = Math.min(90, width * 0.16);
    const next = info.offset.x < -threshold || (info.offset.x < 0 && info.velocity.x < -420);
    const previous = info.offset.x > threshold || (info.offset.x > 0 && info.velocity.x > 420);

    if (!next && !previous) {
      snapToPhoto(activeIndex.current, false);
      return;
    }

    goToPhoto(activeIndex.current + (next ? 1 : -1));
  };

  // Свайп вправо в любом месте карточки (кроме карусели) закрывает её.
  const onDetailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (navigatingBack.current) return;
    if (event.pointerType === 'mouse') return; // на ПК есть кнопка BACK
    if (!event.isPrimary || event.button > 0) return;
    if (isSwipeBlockedTarget(event.target)) return;
    // Карусель с несколькими фото забирает горизонтальный жест себе;
    // одиночное фото не мешает свайпу «назад».
    if (photoCount > 1 && event.target instanceof Element && event.target.closest('.detail-photo')) {
      return;
    }

    pageControls.start(event);
  };

  const onDetailDragEnd = (_event: unknown, info: PanInfo) => {
    if (navigatingBack.current) return;

    const width = viewportWidth || window.innerWidth || 1;
    const threshold = Math.min(120, width * 0.2);
    const back = info.offset.x > threshold || (info.offset.x > 0 && info.velocity.x > 520);

    if (!back) {
      pageX.stop();
      if (reduceMotion) pageX.set(0);
      else animate(pageX, 0, { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 });
      return;
    }

    navigatingBack.current = true;

    if (reduceMotion) {
      pageX.set(0);
      goBack();
      return;
    }

    void animate(pageX, width, { duration: 0.22, ease: [0.32, 0.72, 0, 1] }).then(() => {
      pageX.set(0);
      goBack();
    });
  };

  if (!product) {
    return (
      <div className="screen fade-in detail-screen">
        <div className="detail-topbar">
          <button className="detail-back" type="button" onClick={goBack}>
            ← BACK
          </button>
        </div>
        <h1 className="screen-header">NOT FOUND</h1>
        <div className="help-block">
          <p>THIS ITEM IS GONE.</p>
        </div>
        <button className="order-btn" type="button" onClick={() => navigate('/')}>
          BACK TO CATALOG
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className="screen fade-in detail-screen"
      style={{ x: pageX, touchAction: 'pan-y' }}
      drag="x"
      dragListener={false}
      dragControls={pageControls}
      dragDirectionLock
      dragConstraints={{ left: 0, right: viewportWidth }}
      dragElastic={0.08}
      dragMomentum={false}
      onPointerDown={onDetailPointerDown}
      onDragEnd={onDetailDragEnd}
    >
      <div className="detail-topbar">
        <button className="detail-back" type="button" onClick={goBack}>
          ← BACK
        </button>
      </div>

      <div className="detail-layout">
        <div className="detail-heading">
          <h1 className="detail-name">{product.name}</h1>
          <div className="detail-price">{product.price}</div>
        </div>

        <div className="detail-gallery">
          {photoCount > 0 ? (
            <figure
              ref={galleryRef}
              className="detail-photo"
              aria-roledescription="carousel"
              aria-label={`${product.name}: фото ${activePhoto + 1} из ${photoCount}`}
              style={photoRatio ? ({ '--photo-ratio': photoRatio } as CSSProperties) : undefined}
            >
              <motion.div
                className="detail-carousel-track"
                style={{ x: carouselX, touchAction: 'pan-y' }}
                drag="x"
                dragListener={false}
                dragControls={carouselControls}
                dragDirectionLock
                dragConstraints={{
                  left: -(photoCount + 1 - virtualActive) * slideWidth,
                  right: virtualActive * slideWidth,
                }}
                dragElastic={0.18}
                dragMomentum={false}
                onPointerDown={onCarouselPointerDown}
                onDragEnd={onCarouselDragEnd}
              >
                {slides.map((source, index) => (
                  <div
                    className="detail-carousel-slide"
                    key={`${source}-${index}`}
                    aria-hidden={
                      hasLoop && (index === 0 || index === photoCount + 1)
                        ? true
                        : undefined
                    }
                  >
                    <img
                      src={resolveAssetUrl(source)}
                      alt={`${product.name} — фото ${index + 1}`}
                      decoding="async"
                      draggable={false}
                      onLoad={(event) => rememberRatio(index, event.currentTarget)}
                    />
                  </div>
                ))}
              </motion.div>

              {photoCount > 1 && (
                <>
                  <button
                    type="button"
                    className="detail-carousel-arrow detail-carousel-arrow-prev"
                    aria-label="PREVIOUS PHOTO"
                    onClick={() => goToPhoto(activePhoto - 1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="detail-carousel-arrow detail-carousel-arrow-next"
                    aria-label="NEXT PHOTO"
                    onClick={() => goToPhoto(activePhoto + 1)}
                  >
                    ›
                  </button>

                  <div className="detail-carousel-dots">
                    {photos.map((source, index) => (
                      <button
                        key={`dot-${source}-${index}`}
                        type="button"
                        className={
                          index === activePhoto
                            ? 'detail-carousel-dot active'
                            : 'detail-carousel-dot'
                        }
                        aria-label={`PHOTO ${index + 1}`}
                        aria-current={index === activePhoto ? 'true' : undefined}
                        onClick={() => selectPhoto(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </figure>
          ) : (
            <div className="detail-photo detail-photo-empty">NO PHOTO</div>
          )}
        </div>

        <div className="detail-body">
          {product.soldOut && <div className="detail-soldout">SOLD OUT</div>}

          <div className="detail-description">{product.description}</div>

          {product.soldOut ? (
            <button className="order-btn" type="button" disabled>
              SOLD OUT
            </button>
          ) : (
            <button className="order-btn" type="button" onClick={() => setOrderOpen(true)}>
              BUY
            </button>
          )}
        </div>
      </div>

      {orderOpen && (
        <OrderModal product={product} onClose={() => setOrderOpen(false)} />
      )}
    </motion.div>
  );
}

