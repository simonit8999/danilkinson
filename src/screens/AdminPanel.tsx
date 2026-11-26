import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { useCatalog } from '../context/CatalogContext';
import { pingServer } from '../lib/api';
import { resolveAssetUrl } from '../lib/assets';
import { copyText } from '../lib/clipboard';
import type { Product } from '../types';

interface FormState {
  name: string;
  price: string;
  description: string;
  images: string;
  cover: string;
  soldOut: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '',
  description: '',
  // Пусто: если фото одно, админ заполняет только «Главное фото»,
  // и оно же попадёт в галерею товара.
  images: '',
  cover: '',
  soldOut: false,
};

const SYNC_LABEL: Record<string, string> = {
  idle: 'READY',
  saving: 'SAVING…',
  saved: 'SAVED',
  offline: 'LOCAL ONLY',
  error: 'SAVE FAILED',
};

function toForm(product: Product | null): FormState {
  if (!product) return { ...EMPTY_FORM };

  return {
    name: product.name,
    price: product.price,
    description: product.description,
    images: product.images.join('\n'),
    cover: product.cover ?? '',
    soldOut: product.soldOut,
  };
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { authenticated, login, logout } = useAdmin();
  const {
    products,
    saveProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    markSoldOut,
    exportJson,
    importJson,
    resetLocal,
    loading,
    dirty,
    stale,
    sync,
    serverOnline,
    serverUpdatedAt,
    apiBase,
    applyApiBase,
    publishNow,
    reloadFromServer,
  } = useCatalog();

  // Куда клиент реально отправляет /api/*. Пусто в поле = тот же origin,
  // поэтому на GitHub Pages (без адреса туннеля) API там нет — плашка покажет OFFLINE.
  const apiOrigin = apiBase || window.location.origin;

  const [apiDraft, setApiDraft] = useState(apiBase);
  const [apiNotice, setApiNotice] = useState('');

  useEffect(() => {
    setApiDraft(apiBase);
  }, [apiBase]);

  const testApi = async () => {
    setApiNotice('ПРОВЕРЯЕМ СЕРВЕР...');
    const ok = await pingServer(apiDraft);
    setApiNotice(ok ? 'СЕРВЕР ОТВЕЧАЕТ.' : 'СЕРВЕР НЕ ОТВЕЧАЕТ ПО ЭТОМУ АДРЕСУ.');
  };

  const saveApi = async () => {
    setApiNotice('ПОДКЛЮЧАЕМСЯ...');
    const ok = await applyApiBase(apiDraft);
    setApiNotice(ok
      ? 'API СОХРАНЁН: СЕРВЕР ОТВЕЧАЕТ.'
      : 'СЕРВЕР НЕ ОТВЕЧАЕТ. ССЫЛКА NGROK МЕНЯЕТСЯ ПРИ КАЖДОМ ЗАПУСКЕ — ВОЗЬМИТЕ АКТУАЛЬНУЮ.');
  };

  const resetApi = async () => {
    setApiDraft('');
    const ok = await applyApiBase('');
    setApiNotice(ok
      ? 'АДРЕС СБРОШЕН: РАБОТАЕМ С ТЕМ ЖЕ ORIGIN, СЕРВЕР ОТВЕЧАЕТ.'
      : 'АДРЕС СБРОШЕН, НО ПО ТЕКУЩЕМУ ORIGIN СЕРВЕРА НЕТ.');
  };

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [notice, setNotice] = useState('');

  // exportJson зависит от products, поэтому JSON пересобирается только при
  // изменении каталога. Хук вызывается ДО раннего return: иначе после логина
  // рендер добавил бы лишний хук и React падал с ошибкой #310.
  const json = useMemo(() => exportJson(), [exportJson]);

  const editing = editingId && editingId !== 'new'
    ? products.find((product) => product.id === editingId) ?? null
    : null;

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    try {
      const ok = await login(loginValue, password);
      if (!ok) {
        setAuthError('НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ.');
        return;
      }
      setLoginValue('');
      setPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'ОШИБКА ВХОДА.');
    }
  };

  if (!authenticated) {
    return (
      <div className="screen fade-in">
        <h1 className="screen-header">ADMIN</h1>

        <form className="admin-form" onSubmit={submitLogin}>
          <label htmlFor="admin-login">LOGIN</label>
          <input
            id="admin-login"
            className="search-input"
            type="text"
            value={loginValue}
            onChange={(event) => setLoginValue(event.target.value)}
            autoComplete="username"
          />

          <label htmlFor="admin-password">PASSWORD</label>
          <input
            id="admin-password"
            className="search-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {authError && (
            <div className="help-block">
              <p>{authError}</p>
            </div>
          )}

          <button className="save-btn" type="submit">ВОЙТИ</button>
          <button className="back-btn" type="button" onClick={() => navigate('/')}>
            ОТМЕНА
          </button>
        </form>

        <div className="help-block">
          <p>ПРАВКИ УХОДЯТ НА СЕРВЕР И СРАЗУ ВИДНЫ ПОКУПАТЕЛЯМ. ЕСЛИ СЕРВЕР НЕДОСТУПЕН — ТОЛЬКО В ЭТОМ БРАУЗЕРЕ.</p>
        </div>
      </div>
    );
  }

  const openCreate = () => {
    setEditingId('new');
    setForm({ ...EMPTY_FORM });
    setNotice('');
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setForm(toForm(product));
    setNotice('');
  };

  const closeForm = () => setEditingId(null);

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const price = form.price.trim();

    if (!name || !price) {
      window.alert('Заполните название и цену.');
      return;
    }

    const images = form.images
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    const cover = form.cover.trim() || undefined;

    saveProduct({
      name,
      price,
      description: form.description.trim(),
      images: images.length
        ? images
        : (cover ? [cover] : ['https://picsum.photos/id/100/600/600']),
      cover,
      soldOut: form.soldOut,
      archived: editing ? editing.archived : false,
    }, editing?.id);

    setEditingId(null);
    setNotice('СОХРАНЕНО. ОТПРАВКА НА СЕРВЕР...');
  };

  const onDelete = (product: Product) => {
    if (!window.confirm(`Удалить товар "${product.name}"?`)) return;
    deleteProduct(product.id);
    setNotice('ТОВАР УДАЛЁН.');
  };

  const onArchive = (product: Product) => {
    archiveProduct(product.id);
    setNotice('ТОВАР ПЕРЕНЕСЁН В АРХИВ.');
  };

  const onRestore = (product: Product) => {
    restoreProduct(product.id);
    setNotice('ТОВАР ВОЗВРАЩЁН В КАТАЛОГ.');
  };

  const onSoldOut = (product: Product) => {
    markSoldOut(product.id);
    setNotice('ТОВАР ОТМЕЧЕН КАК SOLD OUT.');
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'products.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async () => {
    const ok = await copyText(json);
    setNotice(ok ? 'JSON СКОПИРОВАН.' : 'НЕ УДАЛОСЬ СКОПИРОВАТЬ JSON.');
  };

  const applyImport = () => {
    try {
      const count = importJson(importText);
      setImportOpen(false);
      setImportText('');
      setNotice(`ИМПОРТИРОВАНО ${count} ТОВАРОВ.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'НЕВЕРНЫЙ JSON.');
    }
  };

  const onReset = () => {
    if (!window.confirm('Сбросить локальные изменения и вернуть опубликованный каталог?')) {
      return;
    }
    resetLocal();
    setNotice('ЛОКАЛЬНЫЕ ИЗМЕНЕНИЯ СБРОШЕНЫ.');
  };

  const onLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">ADMIN · PRODUCTS</h1>

      <div className="server-status" data-online={serverOnline ? 'true' : 'false'}>
        <span>{serverOnline ? 'SERVER: ONLINE' : 'SERVER: OFFLINE'}</span>
        <span>SYNC: {SYNC_LABEL[sync] ?? sync.toUpperCase()}</span>
        <span>API: {apiOrigin}</span>
        {serverUpdatedAt && (
          <span>PUBLISHED: {new Date(serverUpdatedAt).toLocaleString()}</span>
        )}
      </div>

      <div className="admin-api">
        <label htmlFor="admin-api-base">API BASE · АДРЕС СЕРВЕРА / ТУННЕЛЯ</label>
        <input
          id="admin-api-base"
          type="text"
          value={apiDraft}
          onChange={(event) => setApiDraft(event.target.value)}
          placeholder="https://ваш-домен.ngrok-free.dev"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="admin-actions">
          <button type="button" onClick={() => void testApi()}>TEST</button>
          <button type="button" onClick={() => void saveApi()}>SAVE API</button>
          <button type="button" onClick={() => void resetApi()}>RESET API</button>
        </div>

        <p className="admin-hint">
          Пусто = тот же адрес, что у сайта (открыт с сервера или по ссылке туннеля).
          Если сайт открыт на GitHub Pages — вставьте ссылку туннеля ngrok и нажмите
          SAVE API: пересобирать сайт не нужно.
        </p>

        {apiNotice && <p className="admin-hint">{apiNotice}</p>}
      </div>

      {!loading && !serverOnline && (
        <div className="help-block">
          <p>
            СЕРВЕР НЕ ОТВЕЧАЕТ ПО АДРЕСУ {apiOrigin}. ПРАВКИ ОСТАЮТСЯ В ЭТОМ БРАУЗЕРЕ
            (LOCAL ONLY). ВСТАВЬТЕ В ПОЛЕ API BASE АКТУАЛЬНУЮ ССЫЛКУ ТУННЕЛЯ NGROK
            И НАЖМИТЕ SAVE API (ИЛИ ОТКРОЙТЕ САМ САЙТ ПО ССЫЛКЕ ТУННЕЛЯ).
          </p>
        </div>
      )}

      {!loading && serverOnline && sync === 'offline' && (
        <div className="help-block">
          <p>
            СЕРВЕР ОНЛАЙН, НО ТОКЕН НЕДЕЙСТВИТЕЛЕН (СЕРВЕР ПЕРЕЗАПУСКАЛИ).
            НАЖМИТЕ LOGOUT И ВОЙДИТЕ ЗАНОВО.
          </p>
        </div>
      )}

      {notice && (
        <div className="help-block">
          <p>{notice}</p>
        </div>
      )}

      {stale && (
        <div className="help-block">
          <p>
            КАТАЛОГ НА СЕРВЕРЕ ИЗМЕНИЛСЯ. НАЖМИТЕ RELOAD SERVER, ЧТОБЫ ВЗЯТЬ СВЕЖУЮ ВЕРСИЮ
            (ЛОКАЛЬНЫЕ ПРАВКИ ПРИ ЭТОМ ПРОПАДУТ).
          </p>
        </div>
      )}

      {dirty && !stale && (
        <div className="help-block">
          <p>
            ЕСТЬ НЕОПУБЛИКОВАННЫЕ ИЗМЕНЕНИЯ. ПОДОЖДИТЕ СЕКУНДУ (АВТОСОХРАНЕНИЕ)
            ИЛИ НАЖМИТЕ PUBLISH NOW.
          </p>
        </div>
      )}

      <div className="admin-actions" style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => void publishNow()}>PUBLISH NOW</button>
        <button type="button" onClick={() => void reloadFromServer()}>RELOAD SERVER</button>
        <button type="button" onClick={() => setExportOpen(true)}>EXPORT JSON</button>
        <button type="button" onClick={() => setImportOpen(true)}>IMPORT JSON</button>
        <button type="button" onClick={onReset}>RESET LOCAL</button>
        <button className="danger" type="button" onClick={onLogout}>LOGOUT</button>
      </div>

      {editingId === null && (
        <button className="admin-add-btn" type="button" onClick={openCreate}>
          + ДОБАВИТЬ НОВЫЙ ТОВАР
        </button>
      )}

      {editingId !== null && (
        <>
          <h2 className="admin-section-title">
            {editing ? `РЕДАКТИРОВАТЬ: ${editing.name}` : 'НОВЫЙ ТОВАР'}
          </h2>

          <form className="admin-form" onSubmit={submitForm}>
            <label htmlFor="pf-name">Название</label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="ITEM NAME"
            />

            <label htmlFor="pf-price">Цена</label>
            <input
              id="pf-price"
              type="text"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              placeholder="€ 250"
            />

            <label htmlFor="pf-desc">Описание</label>
            <textarea
              id="pf-desc"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="ITEM DESCRIPTION..."
            />

            <label htmlFor="pf-images">URL изображений</label>
            <textarea
              id="pf-images"
              value={form.images}
              onChange={(event) => setForm({ ...form, images: event.target.value })}
              placeholder={'https://...jpg\nhttps://...jpg'}
            />

            <label htmlFor="pf-cover">Главное фото для каталога (PNG без фона)</label>
            <input
              id="pf-cover"
              type="text"
              value={form.cover}
              onChange={(event) => setForm({ ...form, cover: event.target.value })}
              placeholder="./images/products/item.png"
            />
            {form.cover.trim() && (
              <img
                className="admin-cover-preview"
                src={resolveAssetUrl(form.cover.trim())}
                alt="cover preview"
              />
            )}
            <p className="admin-hint">
              Необязательно. Если пусто — в каталоге показывается первое фото из списка.
              Если заполнено только главное фото, оно же станет первым фото в галерее товара.
              Файлы кладите в public/images/products/ и пишите путь вида
              ./images/products/item.png. В каталоге фон прозрачный, в карточке товара —
              белая подложка с тонкой рамкой.
            </p>

            <div className="checkbox-row">
              <input
                id="pf-sold"
                type="checkbox"
                checked={form.soldOut}
                onChange={(event) => setForm({ ...form, soldOut: event.target.checked })}
              />
              <span>SOLD OUT</span>
            </div>

            <button className="save-btn" type="submit">СОХРАНИТЬ</button>
            <button className="back-btn" type="button" onClick={closeForm}>ОТМЕНА</button>
          </form>
        </>
      )}

      {editingId === null && (
        <div>
          {products.length === 0 ? (
            <div style={{ padding: '20px 0', fontFamily: "'Courier New', monospace" }}>
              NO PRODUCTS YET.
            </div>
          ) : products.map((product) => {
            const status = product.archived
              ? 'ARCHIVED'
              : product.soldOut
                ? 'SOLD OUT'
                : 'ACTIVE';

            return (
              <div className="admin-product-row" key={product.id}>
                <div className="admin-product-info">
                  <div className="admin-product-name">{product.name}</div>
                  <div className="admin-product-price">{product.price}</div>
                  <div className="admin-product-status">
                    {status} · {product.images.length} img
                  </div>
                </div>

                <div className="admin-actions">
                  <button type="button" onClick={() => openEdit(product)}>EDIT</button>

                  {product.archived ? (
                    <button type="button" onClick={() => onRestore(product)}>RESTORE</button>
                  ) : (
                    <button type="button" onClick={() => onArchive(product)}>ARCHIVE</button>
                  )}

                  <button className="danger" type="button" onClick={() => onDelete(product)}>
                    DELETE
                  </button>

                  {!product.archived && !product.soldOut && (
                    <button className="danger" type="button" onClick={() => onSoldOut(product)}>
                      SOLD OUT
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {exportOpen && (
        <div className="modal-overlay" onClick={() => setExportOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3>EXPORT JSON</h3>

            <textarea readOnly value={json} />

            <div className="help-block">
              <p>
                СКАЧАЙТЕ ФАЙЛ, ЗАМЕНИТЕ public/data/products.json
                И ОПУБЛИКУЙТЕ САЙТ ЗАНОВО.
              </p>
            </div>

            <div className="modal-actions">
              <button className="btn-send" type="button" onClick={download}>DOWNLOAD</button>
              <button className="btn-cancel" type="button" onClick={copy}>COPY</button>
            </div>

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-cancel" type="button" onClick={() => setExportOpen(false)}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-overlay" onClick={() => setImportOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3>IMPORT JSON</h3>

            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="[]"
            />

            <div className="modal-actions">
              <button className="btn-send" type="button" onClick={applyImport}>
                IMPORT
              </button>
              <button className="btn-cancel" type="button" onClick={() => setImportOpen(false)}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
