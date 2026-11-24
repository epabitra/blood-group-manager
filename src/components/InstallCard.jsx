import { useEffect, useState } from 'react';
import { canPromptInstall, isInstalled, isIos, promptInstall, subscribeInstall } from '../pwa';

const DISMISS_KEY = 'bgm_install_dismissed';
const DISMISS_DAYS = 30;

function wasDismissed() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

/**
 * Helps users put the app on their home screen.
 * dismissible: Home screen version — only shown when installing is actually possible.
 */
export default function InstallCard({ dismissible }) {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(() => dismissible && wasDismissed());
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => subscribeInstall(() => rerender((n) => n + 1)), []);

  if (isInstalled() || dismissed) return null;

  const canPrompt = canPromptInstall();
  const ios = isIos();
  if (dismissible && !canPrompt && !ios) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <section className="card install-card">
      <div className="install-head">
        <img src="./icon-192.png" alt="" width="44" height="44" />
        <div className="grow">
          <strong>Install the app on your phone</strong>
          <div className="muted small">Opens from the home screen like a normal app, full screen and faster.</div>
        </div>
        {dismissible && (
          <button className="icon-btn" onClick={dismiss} aria-label="Hide">
            ✕
          </button>
        )}
      </div>

      {canPrompt ? (
        <button className="btn primary block" onClick={promptInstall}>
          ⬇ Install app
        </button>
      ) : ios ? (
        showSteps || !dismissible ? (
          <ol className="install-steps">
            <li>
              Open this site in <strong>Safari</strong>.
            </li>
            <li>
              Tap the <strong>Share</strong> button <span className="share-icon">⬆︎</span> at the bottom of the screen.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong> (top-right).
            </li>
          </ol>
        ) : (
          <button className="btn primary block" onClick={() => setShowSteps(true)}>
            Show me how
          </button>
        )
      ) : (
        <ol className="install-steps">
          <li>
            Open the browser menu <strong>⋮</strong> (top-right in Chrome).
          </li>
          <li>
            Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </li>
          <li>
            Tap <strong>Install</strong> / <strong>Add</strong>.
          </li>
        </ol>
      )}
    </section>
  );
}
