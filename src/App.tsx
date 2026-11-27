import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
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
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { CatalogProvider } from './context/CatalogContext';
import { bindBackgroundScroll } from './lib/backgroundScroll';
import { isSwipeBlockedTarget } from './lib/swipe';
import { Archive } from './screens/Archive';
import { Catalog } from './screens/Catalog';
import { Detail } from './screens/Detail';
import { Help } from './screens/Help';
import { SearchScreen } from './screens/Search';

const FALLBACK_LOGO = 'https://i.postimg.cc/0NDs9xDf/u-a-top-Photoroom.png';

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
// Только логотип: прозрачный PNG без орнамента (scripts/make-header.ps1).
// Широкая плашка с вензелями больше не используется — её заменяет стекло.
const HEADER_LOGO = asset('images/site/header-mobile.png');
// Бесшовный по вертикали тайл ткани (scripts/build-bg.ps1): 704x3776.
const BACKGROUND_IMAGE = asset('images/site/site-bg-tile.webp');

const NAV_ITEMS = [
  { key: 'catalog', path: '/', label: 'CATALOG' },
  { key: 'archive', path: '/archive', label: 'ARCHIVE' },
  { key: 'search', path: '/search', label: 'SEARCH' },
  { key: 'help', path: '/help', label: 'HELP' },
] as const;

const AdminPanel = lazy(() => import('./screens/AdminPanel'));

// Вход в кабинет: три нажатия по верхней плашке подряд (интервал между нажатиями).
const ADMIN_TAP_COUNT = 3;
const ADMIN_TAP_INTERVAL_MS = 900;

function AdminRoute() {
  const { entry, authenticated } = useAdmin();

  if (!entry && !authenticated) return <Navigate to="/" replace />;

  return (
    <Suspense
      fallback={(
        <div className="screen fade-in">
          <div className="help-block">
            <p>LOADING...</p>
          </div>
        </div>
      )}
    >
      <AdminPanel />
    </Suspense>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const area = document.querySelector('.scroll-area');
    area?.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { grantEntry } = useAdmin();

  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const taps = useRef({ count: 0, last: 0 });
  const [headerHidden, setHeaderHidden] = useState(false);

  // Фон тянется за прокруткой любого экрана: тайл бесшовный и повторяется
  // по вертикали, поэтому каталог можно листать бесконечно.
  useEffect(() => {
    const area = containerRef.current;
    const layer = bgRef.current;
    if (!area || !layer) return;

    return bindBackgroundScroll(area, layer);
  }, []);

  // Логотип закреплён сверху и прячется при прокрутке вниз, чтобы не
  // перекрывать товары. Прокрутка вверх или возврат к началу — снова виден.
  useEffect(() => {
    const area = containerRef.current;
    if (!area) return;

    let frame = 0;
    let lastTop = area.scrollTop;

    const update = () => {
      frame = 0;
      const top = area.scrollTop;
      const delta = top - lastTop;

      if (top <= 8) setHeaderHidden(false);
      else if (delta > 6) setHeaderHidden(true);
      else if (delta < -6) setHeaderHidden(false);

      lastTop = top;
    };

    const request = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    area.addEventListener('scroll', request, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      area.removeEventListener('scroll', request);
    };
  }, []);

  // Единственный вход в кабинет: три нажатия подряд по верхней плашке.
  // Плавающей кнопки [ ADMIN ] нет вообще — ни до входа, ни после.
  const onLogoTap = () => {
    const now = Date.now();
    if (now - taps.current.last > ADMIN_TAP_INTERVAL_MS) taps.current.count = 0;

    taps.current.last = now;
    taps.current.count += 1;

    if (taps.current.count >= ADMIN_TAP_COUNT) {
      taps.current.count = 0;
      grantEntry();
      navigate('/admin');
    }
  };

  const path = location.pathname;
  const nav = path === '/'
    ? 'catalog'
    : path.startsWith('/archive')
      ? 'archive'
      : path.startsWith('/search')
        ? 'search'
        : path.startsWith('/help')
          ? 'help'
          : '';

  const navIndex = NAV_ITEMS.findIndex((item) => item.key === nav);

  // ----- Свайпы между вкладками (framer-motion) -----
  // Контент едет за пальцем через drag="x", как страница в iOS: на отпускании
  // либо мягко возвращается, либо доезжает до соседней вкладки и въезжает
  // новая. Ручные onTouchStart/Move/End больше не нужны.
  const swipeX = useMotionValue(0);
  const swipeControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const navigating = useRef(false);
  const [swipeLimit, setSwipeLimit] = useState(() => (
    typeof window === 'undefined' ? 720 : window.innerWidth
  ));

  useEffect(() => {
    const onResize = () => setSwipeLimit(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Обычный переход (таб или кнопка) — сдвиг сбрасываем без анимации.
  useEffect(() => {
    if (!navigating.current) swipeX.set(0);
  }, [location.pathname, swipeX]);

  const springBack = () => {
    swipeX.stop();
    if (reduceMotion) {
      swipeX.set(0);
      return;
    }
    animate(swipeX, 0, { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 });
  };

  const onSwipePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // На детальной странице и в админке navIndex === -1: у них свой жест.
    if (navIndex < 0 || navigating.current) return;
    // Свайп — мобильный жест; на ПК вкладки переключаются кнопками,
    // чтобы перетаскивание мышью не мешало кликам по карточкам.
    if (event.pointerType === 'mouse') return;
    if (!event.isPrimary || event.button > 0) return;
    if (isSwipeBlockedTarget(event.target)) return;

    swipeControls.start(event);
  };

  const onSwipeDragEnd = (_event: unknown, info: PanInfo) => {
    if (navIndex < 0 || navigating.current) {
      springBack();
      return;
    }

    const width = window.innerWidth || swipeLimit;
    const threshold = Math.min(140, width * 0.22);
    const forward = info.offset.x < -threshold || (info.offset.x < 0 && info.velocity.x < -520);
    const backward = info.offset.x > threshold || (info.offset.x > 0 && info.velocity.x > 520);

    if (!forward && !backward) {
      springBack();
      return;
    }

    const targetIndex = forward ? navIndex + 1 : navIndex - 1;
    if (targetIndex < 0 || targetIndex >= NAV_ITEMS.length) {
      // Крайняя вкладка — двигаться некуда, мягко возвращаем на место.
      springBack();
      return;
    }

    const exitX = forward ? -width : width;
    const enterX = -exitX;

    navigating.current = true;

    if (reduceMotion) {
      swipeX.set(0);
      navigate(NAV_ITEMS[targetIndex].path);
      navigating.current = false;
      return;
    }

    void animate(swipeX, exitX, { duration: 0.2, ease: [0.32, 0.72, 0, 1] }).then(() => {
      // Новая вкладка стартует с противоположного края и плавно въезжает.
      swipeX.set(enterX);
      navigate(NAV_ITEMS[targetIndex].path);

      void animate(swipeX, 0, { duration: 0.28, ease: [0.22, 1, 0.36, 1] }).then(() => {
        navigating.current = false;
      });
    });
  };

  // Плавающая кнопка [ ADMIN ] удалена: в кабинет входят только тройным
  // нажатием по верхней плашке.
  return (
    <>
      <div className="app-bg" aria-hidden="true">
        <div
          className="app-bg-texture"
          ref={bgRef}
          style={{ backgroundImage: `url("${BACKGROUND_IMAGE}")` }}
        />
        <div className="app-bg-grain" />
      </div>

      <div
        className={headerHidden ? 'scroll-area header-hidden' : 'scroll-area'}
        ref={containerRef}
      >
        <header
          className={headerHidden ? 'app-header is-hidden' : 'app-header'}
          onFocus={() => setHeaderHidden(false)}
        >
          <img
            className="app-header-logo"
            src={HEADER_LOGO}
            alt="(undefined) archangel"
            draggable={false}
            onClick={onLogoTap}
            onError={(event) => {
              const img = event.currentTarget;
              // Логотип не загрузился — один раз подставляем запасной,
              // чтобы не уйти в бесконечный цикл onError.
              if (img.dataset.fallback === '1') return;
              img.dataset.fallback = '1';
              img.src = FALLBACK_LOGO;
            }}
          />
        </header>

        <motion.div
          className="container"
          style={{ x: swipeX, touchAction: 'pan-y' }}
          drag="x"
          dragListener={false}
          dragControls={swipeControls}
          dragDirectionLock
          dragConstraints={{
            left: navIndex >= 0 && navIndex < NAV_ITEMS.length - 1 ? -swipeLimit : 0,
            right: navIndex > 0 ? swipeLimit : 0,
          }}
          dragElastic={0.35}
          dragMomentum={false}
          onPointerDown={onSwipePointerDown}
          onDragEnd={onSwipeDragEnd}
        >
          <ScrollToTop />

          <Routes>
            <Route path="/" element={<Catalog />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/item/:id" element={<Detail />} />
            <Route path="/help" element={<Help />} />
            <Route path="/admin" element={<AdminRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </div>

      {/* Панель полностью прозрачная: каждая вкладка — своя стеклянная
          таблетка, поэтому товары видны и прокручиваются сквозь неё. */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-track">
          {NAV_ITEMS.map((item) => {
            const active = nav === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <CatalogProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </CatalogProvider>
    </AdminProvider>
  );
}
