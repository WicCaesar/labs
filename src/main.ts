import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('app');

if (!root) {
    throw new Error('Could not find #app root element');
}

createRoot(root).render(
    createElement(StrictMode, null, createElement(App))
);