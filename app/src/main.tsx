import '@fontsource/oranienbaum/cyrillic.css';
import '@fontsource/oranienbaum/latin.css';
import '@fontsource-variable/commissioner';
import '@fontsource/anonymous-pro/cyrillic-400.css';
import '@fontsource/anonymous-pro/latin-400.css';
import '@fontsource/anonymous-pro/cyrillic-700.css';
import '@fontsource/anonymous-pro/latin-700.css';
import '@fontsource/bad-script/cyrillic.css';
import '@fontsource/bad-script/latin.css';
import '@fontsource/rubik-dirt/cyrillic.css';
import '@fontsource/rubik-dirt/latin.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { applyTextures } from './lib/assets';
import { initSound } from './lib/sound';
import { CrashGuard } from './components/CrashGuard';
import { installCrashHandlers, reportCrash } from './lib/crashRecovery';

installCrashHandlers();
try {
  applyTextures();
  initSound();
  registerSW({ immediate: true, onRegisterError: () => { /* An unavailable service worker must not stop local play. */ } });
} catch (error) { reportCrash(error, 'startup'); }

const root = document.getElementById('root');
if (root) {
  createRoot(root, { onCaughtError: (error) => reportCrash(error, 'react'), onUncaughtError: (error) => reportCrash(error, 'react') }).render(
    <StrictMode>
      <CrashGuard><App /></CrashGuard>
    </StrictMode>,
  );
}
