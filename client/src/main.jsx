import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Latin subsets only: the full faces pull cyrillic, greek and vietnamese too
// (28 woff2 files, 416 KB) and this app is English + Kannada, where Kannada is
// served by the platform font stack, never a webfont (tailwind.config.js).
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App.jsx';
import { registerServiceWorker } from './lib/sw.js';
import { initI18n } from './lib/i18n.jsx';

// HashRouter: Catalyst web hosting serves the SPA at /app/index.html with no
// SPA rewrite rules, so hash routing keeps deep links + refresh working.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

registerServiceWorker();

// The locale dictionaries are code-split per language (lib/i18n.jsx): await the
// visitor's own language and the English fallback before the first paint, so
// nobody ever sees a screen of English flash into Kannada. Two small chunks
// fetched in parallel; a failure still renders, in English.
initI18n()
  .catch(() => {})
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
          </HashRouter>
        </QueryClientProvider>
      </React.StrictMode>,
    );
  });
