import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import FoundationApp from './redesign/FoundationApp';

const DesktopApp = new URLSearchParams(window.location.search).get('workspace') === 'redesign'
  ? FoundationApp : App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>
);

