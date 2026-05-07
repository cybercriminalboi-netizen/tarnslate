import React from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingUI } from './FloatingUI';

// Initialize the extension UI in the host page
function initExtension() {
  const container = document.createElement('div');
  container.id = 'manga-translator-root';
  
  // Use Shadow DOM to isolate styles
  const shadow = container.attachShadow({ mode: 'open' });
  const rootElement = document.createElement('div');
  shadow.appendChild(rootElement);
  
  // Inject Tailwind if needed or standard styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      z-index: 2147483647;
      bottom: 24px;
      right: 24px;
    }
  `;
  shadow.appendChild(style);

  document.body.appendChild(container);

  const root = createRoot(rootElement);
  root.render(<FloatingUI />);
}

if (document.readyState === 'complete') {
  initExtension();
} else {
  window.addEventListener('load', initExtension);
}
