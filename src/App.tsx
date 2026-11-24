import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
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
import { Archive } from './screens/Archive';
import { Catalog } from './screens/Catalog';
import { Detail } from './screens/Detail';
import { Help } from './screens/Help';
import { SearchScreen } from './screens/Search';

const LOGO = 'https://i.postimg.cc/0NDs9xDf/u-a-top-Photoroom.png';

const AdminPanel = lazy(() => import('./screens/AdminPanel'));

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
    const container = document.querySelector('.container');
    container?.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { entry, authenticated, grantEntry } = useAdmin();

  const containerRef = useRef<HTMLDivElement>(null);
  const taps = useRef({ count: 0, last: 0 });
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onScroll = () => setScrolled(element.scrollTop > 80);
    element.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  const onLogoTap = () => {
    const now = Date.now();
    if (now - taps.current.last > 900) taps.current.count = 0;

    taps.current.last = now;
    taps.current.count += 1;

    if (taps.current.count >= 3) {
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

  // Кнопка не только скрыта, но и вообще не рендерится в DOM,
  // пока нет доступа и пользователь не прокрутил первый экран.
  const showAdminButton = (entry || authenticated) && scrolled;

  return (
    <>
      {showAdminButton && (
        <button id="adminBtn" type="button" onClick={() => navigate('/admin')}>
          [ ADMIN ]
        </button>
      )}

      <div className="container" ref={containerRef}>
        <header className="app-header">
          <img src={LOGO} alt="LOGO" onClick={onLogoTap} />
        </header>

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

      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          type="button"
          className={nav === 'catalog' ? 'active' : ''}
          onClick={() => navigate('/')}
        >
          CATALOG
        </button>
        <button
          type="button"
          className={nav === 'archive' ? 'active' : ''}
          onClick={() => navigate('/archive')}
        >
          ARCHIVE
        </button>
        <button
          type="button"
          className={nav === 'search' ? 'active' : ''}
          onClick={() => navigate('/search')}
        >
          SEARCH
        </button>
        <button
          type="button"
          className={nav === 'help' ? 'active' : ''}
          onClick={() => navigate('/help')}
        >
          HELP
        </button>
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
