import { createRoot } from 'react-dom/client';
import App from './App';
import { useApp } from './store/useApp';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

(window as unknown as { __solidgeoStore?: typeof useApp }).__solidgeoStore = useApp;

createRoot(container).render(<App />);

// A lightweight presentation mode used by documentation screenshots.
if (new URLSearchParams(window.location.search).get('demo') === '1') {
  window.setTimeout(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('载入示例场景'),
    );
    button?.click();
  }, 700);
}
