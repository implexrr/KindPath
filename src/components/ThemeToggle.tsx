import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const theme = light ? 'light' : 'dark';
    if (root.dataset.theme === theme) return;

    root.dataset.themeSwitching = '';
    root.dataset.theme = theme;
    // Let the new palette paint before restoring hover and press transitions.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { delete root.dataset.themeSwitching; });
    });
    return () => {
      cancelAnimationFrame(frame);
      delete root.dataset.themeSwitching;
    };
  }, [light]);

  function toggleTheme() {
    const update = () => setLight(value => !value);
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
      return;
    }

    // Capture the old and new palettes as complete frames so controls stay readable.
    const transition = document.startViewTransition(() => flushSync(update));
    void transition.ready.catch(() => {}); // An overlapping switch can skip the previous transition.
  }

  return <button type="button" className="secondary theme-toggle" onClick={toggleTheme}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {light ? <path d="M20.9 13.4A9 9 0 0 1 10.6 3.1a9 9 0 1 0 10.3 10.3Z"/> : <>
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/>
      </>}
    </svg>
    {light ? 'Dark mode' : 'Light mode'}
  </button>;
}
