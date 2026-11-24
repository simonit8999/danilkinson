import { useEffect, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { composeOrderMessage, sendOrder } from '../lib/order';
import type { Product } from '../types';

interface OrderModalProps {
  product: Product;
  onClose: () => void;
}

export function OrderModal({ product, onClose }: OrderModalProps) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const send = async () => {
    if (busy) return;
    setBusy(true);

    const result = await sendOrder(product, comment);
    setBusy(false);

    if (result === 'opened') {
      onClose();
      window.alert('TELEGRAM ОТКРЫТ. ОТПРАВЬТЕ СООБЩЕНИЕ.');
      return;
    }

    if (result === 'copied') {
      onClose();
      window.alert('ЗАКАЗ СКОПИРОВАН — ВСТАВЬТЕ В ЧАТ TELEGRAM.');
      return;
    }

    window.prompt(
      'НЕ УДАЛОСЬ ОТКРЫТЬ TELEGRAM. СКОПИРУЙТЕ ЗАКАЗ:',
      composeOrderMessage(product, comment),
    );
  };

  const copy = async () => {
    const ok = await copyText(composeOrderMessage(product, comment));
    if (ok) {
      onClose();
      window.alert('ЗАКАЗ СКОПИРОВАН — ВСТАВЬТЕ В ЧАТ TELEGRAM.');
      return;
    }
    window.alert('НЕ УДАЛОСЬ СКОПИРОВАТЬ ЗАКАЗ.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <h3>ОФОРМИТЬ ЗАКАЗ</h3>

        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Комментарий к заказу..."
        />

        <div className="modal-actions">
          <button className="btn-send" type="button" onClick={send} disabled={busy}>
            ОТПРАВИТЬ
          </button>
          <button className="btn-cancel" type="button" onClick={copy}>
            КОПИРОВАТЬ
          </button>
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="btn-cancel" type="button" onClick={onClose}>
            ОТМЕНА
          </button>
        </div>
      </div>
    </div>
  );
}
