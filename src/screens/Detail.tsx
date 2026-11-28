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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { OrderModal } from '../components/OrderModal';
import { useCatalog } from '../context/CatalogContext';
import { resolveAssetUrl } from '../lib/assets';
import { isSwipeBlockedTarget } from '../lib/swipe';

/** Экраны-меню: из них открывают карточку и туда же возвращает BACK/свайп. */
const MENU_PATHS = new Set(['/', '/archive', '/search', '/help']);

export function Detail() {
  const { id } = useParams<{ id: string }>();
  const { products } = useCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const [orderOpen, setOrderOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoRatio, setPhotoRatio] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 720 : window.innerWidth
  ));

  const reduceMotion = useReducedMotion();

  // Карусель: горизонтальная прокрутка со scroll-snap (жест считает браузер).
  const galleryRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slideWidthRef = useRef(0);
  const layoutKeyRef = useRef('');
  const activeIndex = useRef(0);
  const settleTimer = useRef(0);
  // Натуральные пропорции фото: контейнер повторяет форму снимка.
  const ratios = useRef<Record<number, number>>({});

  // Страница целиком: свайп вправо = назад в каталог.
  const pageX = useMotionValue(0);
  const pageControls = useDragControls();
  const navigatingBack = useRef(false);

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
  // Свайп через край — это обычный слайд до клона, после которого лента
  // без анимации встаёт на настоящий кадр: картинка та же, прыжка не видно.
  const hasLoop = photoCount > 1;
  const slides = hasLoop ? [photos[photoCount - 1], ...photos, photos[0]] : photos;
  const slideIndexOf = (index: number) => (hasLoop ? index + 1 : index);

  useEffect(() => {
    activeIndex.current = activePhoto;
  }, [activePhoto]);

  // Новый товар — карусель начинается с первого фото.
  useLayoutEffect(() => {
    setPhotoIndex(0);
    setPhotoRatio(null);
    ratios.current = {};
    activeIndex.current = 0;
    window.clearTimeout(settleTimer.current);
  }, [id]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Отложенный «прыжок» с клона не должен пережить размонтирование.
  useEffect(() => () => {
    window.clearTimeout(settleTimer.current);
  }, []);

  // Ширина слайда = ширина карусели. При ресайзе (только изменение ширины)
  // и при смене товара лента без анимации встаёт на нужный кадр.
  useLayoutEffect(() => {
    const figure = galleryRef.current;
    const node = scrollRef.current;
    if (!figure || !node) return;

    const measure = () => {
      const width = node.clientWidth;
      if (!width) return;

      // Смена товара/числа фото должна вернуть ленту на первый кадр,
      // даже если ширина контейнера не изменилась.
      const layoutKey = `${id ?? ''}:${photoCount}`;
      const resized = width !== slideWidthRef.current;
      const relayout = layoutKey !== layoutKeyRef.current;
      if (!resized && !relayout) return;

      slideWidthRef.current = width;
      layoutKeyRef.current = layoutKey;
      node.scrollTo({
        left: (hasLoop ? activeIndex.current + 1 : activeIndex.current) * width,
        behavior: 'auto',
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(figure);
    return () => observer.disconnect();
  }, [hasLoop, photoCount, id]);

  // Пропорции активного фото применяем, когда прокрутка остановилась:
  // смена высоты во время анимации может оборвать плавный скролл.
  const applyActiveRatio = () => {
    setPhotoRatio(ratios.current[slideIndexOf(activeIndex.current)] ?? null);
  };

  const rememberRatio = (index: number, image: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return;

    const ratio = Math.min(1.6, Math.max(0.75, naturalWidth / naturalHeight));
    ratios.current[index] = ratio;
    if (index === slideIndexOf(activeIndex.current)) setPhotoRatio(ratio);
  };

  // Фото из кэша может быть уже complete к моменту монтирования — onLoad
  // тогда не срабатывает. Запоминаем пропорции таких картинок вручную,
  // иначе высота карусели остаётся дефолтной.
  useEffect(() => {
    const node = galleryRef.current;
    if (!node) return;

    node.querySelectorAll('img').forEach((image, index) => {
      if (image.complete && image.naturalWidth > 0) rememberRatio(index, image);
    });
  }, [id, photoCount]);

  // Возврат в предыдущее меню (каталог / архив / поиск / помощь).
  // ProductGrid кладёт путь меню в location.state — возвращаемся именно туда.
  // replace делает жест идемпотентным: если браузер параллельно выполнит
  // свой нативный «свайп назад», мы всё равно останемся в нужном меню,
  // а не уедем на две записи истории.
  // Прямая ссылка на товар: истории приложения нет — ведём в каталог.
  const goBack = () => {
    const from = (location.state as { from?: unknown } | null)?.from;

    if (typeof from === 'string' && MENU_PATHS.has(from)) {
      navigate(from, { replace: true });
      return;
    }

    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === 'number' && state.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const scrollToVirtual = (virtual: number, smooth: boolean) => {
    const width = slideWidthRef.current;
    const node = scrollRef.current;
    if (!width || !node) return;

    node.scrollTo({
      left: virtual * width,
      behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
    });
  };

  // Активный кадр по позиции прокрутки (виртуальный индекс → номер фото).
  const applyScrollIndex = (virtual: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, virtual));
    const index = hasLoop ? ((clamped - 1 + photoCount) % photoCount) : clamped;

    if (index === activeIndex.current) return;

    activeIndex.current = index;
    setPhotoIndex(index);
  };

  // Клон по краю заменяем настоящим кадром, когда прокрутка остановилась:
  // изображение то же, поэтому перестановка не видна.
  const settleLoop = () => {
    const node = scrollRef.current;
    const width = slideWidthRef.current;
    if (!node || !width || !hasLoop) return;

    const virtual = Math.round(node.scrollLeft / width);
    if (virtual <= 0) node.scrollTo({ left: photoCount * width, behavior: 'auto' });
    else if (virtual >= photoCount + 1) node.scrollTo({ left: width, behavior: 'auto' });
  };

  // Браузер сам двигает ленту пальцем/колесом; здесь только синхронизируем
  // индексы, пропорции и точку привязки. Обработчик лёгкий — прокрутка и так
  // приходит не чаще кадра, поэтому rAF не нужен (в фоновой вкладке он спит).
  const onCarouselScroll = () => {
    const node = scrollRef.current;
    const width = slideWidthRef.current;
    if (!node || !width) return;

    applyScrollIndex(Math.round(node.scrollLeft / width));

    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleLoop();
      applyActiveRatio();
    }, 140);
  };

  const snapToPhoto = (index: number) => {
    const width = slideWidthRef.current;
    const node = scrollRef.current;
    if (!width || !node) return;

    node.scrollTo({
      left: slideIndexOf(index) * width,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const goToPhoto = (next: number) => {
    if (photoCount < 2) return;

    const wrapped = ((next % photoCount) + photoCount) % photoCount;

    setPhotoIndex(wrapped);
    activeIndex.current = wrapped;

    // С края едем на клон соседнего кадра: после остановки settleLoop
    // переставляет ленту на настоящий слайд — картинка та же, скачка нет.
    if (hasLoop && next >= photoCount) {
      scrollToVirtual(photoCount + 1, true);
      return;
    }

    if (hasLoop && next < 0) {
      scrollToVirtual(0, true);
      return;
    }

    snapToPhoto(wrapped);
  };

  const selectPhoto = (index: number) => {
    if (index === activeIndex.current) return;

    setPhotoIndex(index);
    activeIndex.current = index;
    snapToPhoto(index);
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
              <div
                className="detail-carousel-viewport"
                ref={scrollRef}
                onScroll={onCarouselScroll}
              >
                <div className="detail-carousel-track">
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
                </div>
              </div>

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

