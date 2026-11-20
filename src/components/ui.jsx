import { useEffect } from 'react';
import { formatDate, telLink, timeAgo, whatsappLink } from '../utils';

export function Spinner({ small }) {
  return <span className={`spinner${small ? ' small' : ''}`} aria-label="Loading" />;
}

export function BloodBadge({ group, large }) {
  return <span className={`blood-badge${large ? ' large' : ''}`}>{group || '?'}</span>;
}

export function StatusPill({ elig }) {
  return <span className={`pill pill-${elig.status}`}>{elig.label}</span>;
}

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
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Call / WhatsApp buttons. stopPropagation keeps the card from opening. */
export function ContactButtons({ phone, message }) {
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
    </div>
  );
}

export function DonorCard({ donor, onOpen, message, highlight }) {
  const place = [donor.area, donor.city].filter(Boolean).join(', ');
  return (
    <div
      className={`donor-card${highlight ? ' highlight' : ''}`}
      onClick={() => onOpen(donor.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(donor.id)}
    >
      <BloodBadge group={donor.bloodGroup} />
      <div className="donor-main">
        <div className="donor-name">{donor.name}</div>
        <div className="donor-meta">
          <span>{donor.phone}</span>
          {place && <span>📍 {place}</span>}
          <span title={formatDate(donor.lastDonated)}>Last: {timeAgo(donor.lastDonated)}</span>
        </div>
        <StatusPill elig={donor._elig} />
      </div>
      <ContactButtons phone={donor.phone} message={message} />
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty">{children}</div>;
}
