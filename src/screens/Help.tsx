import { CONFIG } from '../config';

export function Help() {
  const telegram = `https://t.me/${CONFIG.telegramUsername}`;
  const channel = `https://t.me/${CONFIG.channel}`;
  const reviews = `https://t.me/${CONFIG.reviews}`;

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">HELP</h1>

      <div className="help-block">
        <p>
          <strong>TELEGRAM:</strong>{' '}
          <a href={telegram} target="_blank" rel="noopener noreferrer">
            @{CONFIG.telegramUsername}
          </a>
        </p>
        <p>
          <strong>CHANNEL:</strong>{' '}
          <a href={channel} target="_blank" rel="noopener noreferrer">
            t.me/{CONFIG.channel}
          </a>
        </p>
        <p>
          <strong>REVIEWS:</strong>{' '}
          <a href={reviews} target="_blank" rel="noopener noreferrer">
            t.me/{CONFIG.reviews}
          </a>
        </p>
      </div>

      <div className="help-block">
        <p>FOR SUPPORT AND INQUIRIES CONTACT US ON TELEGRAM.</p>
        <p>ALL ITEMS ARE ARCHIVE / LIMITED.</p>
      </div>
    </div>
  );
}
