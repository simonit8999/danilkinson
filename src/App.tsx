import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react';
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
import { getSwipeDirection, isSwipeBlockedTarget } from './lib/swipe';
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
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Свайпы между вкладками: Каталог -> Архив -> Поиск -> Помощь.
  // На детальной странице и в админке navIndex === -1 — жесты не перехватываем,
  // там работает собственный свайп «назад» в Detail.
  const onSwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    if (navIndex < 0 || event.touches.length !== 1 || isSwipeBlockedTarget(event.target)) {
      swipeStart.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onSwipeMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);

    // Обычный вертикальный скролл отменяет жест.
    if (dy > 12 && dy > dx) swipeStart.current = null;
  };

  const onSwipeEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || navIndex < 0) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const direction = getSwipeDirection(start, { x: touch.clientX, y: touch.clientY });
    if (!direction) return;

    const targetIndex = direction === 'left'
      ? Math.min(NAV_ITEMS.length - 1, navIndex + 1)
      : Math.max(0, navIndex - 1);

    if (targetIndex !== navIndex) navigate(NAV_ITEMS[targetIndex].path);
  };

  const onSwipeCancel = () => {
    swipeStart.current = null;
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

        <div
          className="container"
          onTouchStart={onSwipeStart}
          onTouchMove={onSwipeMove}
          onTouchEnd={onSwipeEnd}
          onTouchCancel={onSwipeCancel}
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
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        <div
          className="bottom-nav-track"
          style={{
            '--nav-index': Math.max(0, navIndex),
            '--nav-count': NAV_ITEMS.length,
          } as CSSProperties}
        >
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

          {navIndex >= 0 && <span className="nav-indicator" aria-hidden="true" />}
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
