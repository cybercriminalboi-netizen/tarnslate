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
  
  // Inject basic styles for the container and ensure icons work
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      position: fixed !important;
      z-index: 2147483647 !important;
      bottom: 32px !important;
      right: 32px !important;
      width: 56px !important;
      height: 56px !important;
      display: block !important;
      pointer-events: auto !important;
    }
    svg {
      display: block;
      vertical-align: middle;
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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
