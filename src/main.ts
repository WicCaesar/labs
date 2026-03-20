import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

if (!window.location.hash.toLowerCase().includes('dungeon')) {
	window.location.hash = '#dungeon';
}

const root = document.getElementById('app');

if (!root) {
    throw new Error('Could not find #app root element');
}

createRoot(root).render(
    // Keep React mounting explicit (without JSX transform) to match current setup.
    createElement(StrictMode, null, createElement(App))
);