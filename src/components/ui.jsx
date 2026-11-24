import { useEffect } from 'react';
import { formatDate, telLink, timeAgo, whatsappLink } from '../utils';

export function Spinner({ small }) {
  return <span className={`spinner${small ? ' small' : ''}`} aria-label="Loading" />;
}

// Short labels that fit inside the round badge.
const BADGE_LABEL = { 'Bombay (Oh)': 'Oh', Unknown: '?' };

export function BloodBadge({ group, large }) {
  return (
    <span className={`blood-badge${large ? ' large' : ''}`} title={group}>
      {BADGE_LABEL[group] || group || '?'}
    </span>
  );
}

export function StatusPill({ elig }) {
  return <span className={`pill pill-${elig.status}`}>{elig.label}</span>;
}

/** Full-screen sheet on phones, centred dialog on larger screens. */
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ←
          </button>
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus }) {
  return (
    <div className="search-input">
      <span className="search-icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {value && (
        <button className="clear-btn" onClick={() => onChange('')} aria-label="Clear search" type="button">
          ✕
        </button>
      )}
    </div>
  );
}

/** Call / WhatsApp buttons. stopPropagation keeps the card from opening. */
export function ContactButtons({ phone, message, onRecord }) {
  const tel = telLink(phone);
  const wa = whatsappLink(phone, message);
  return (
    <div className="contact-btns" onClick={(e) => e.stopPropagation()}>
      {tel && (
        <a className="btn small call" href={tel}>
          📞 Call
        </a>
      )}
      {wa && (
        <a className="btn small whatsapp" href={wa} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
      )}
      {onRecord && (
        <button className="btn small donate" onClick={onRecord}>
          ＋ Donation
        </button>
      )}
    </div>
  );
}

export function DonorCard({ donor, onOpen, message, highlight, onRecord }) {
  const place = [donor.area, donor.city].filter(Boolean).join(', ');
  return (
    <div
      className={`donor-card${highlight ? ' highlight' : ''}`}
      onClick={() => onOpen(donor.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(donor.id)}
    >
      <div className="donor-top">
        <BloodBadge group={donor.bloodGroup} />
        <div className="donor-main">
          <div className="donor-name">{donor.name}</div>
          <div className="donor-meta">
            <span>{donor.phone}</span>
            {place && <span>📍 {place}</span>}
          </div>
          <div className="donor-status">
            <StatusPill elig={donor._elig} />
            <span className="muted small" title={formatDate(donor.lastDonated)}>
              Last: {timeAgo(donor.lastDonated)}
            </span>
          </div>
        </div>
      </div>
      <ContactButtons
        phone={donor.phone}
        message={message}
        onRecord={onRecord ? () => onRecord(donor.id) : undefined}
      />
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty">{children}</div>;
}
