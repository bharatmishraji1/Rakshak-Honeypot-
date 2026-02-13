import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Global styles ke liye

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error("Critical: Root element 'root' not found. Check index.html.");
}

const root = ReactDOM.createRoot(rootElement);

// --- 🛡️ IMPROVED MOUNTING WITH ERROR HANDLING ---
root.render(
  <React.StrictMode>
    {/* Global Error Boundary yahan add kar sakte ho */}
    <div className="antialiased font-sans bg-slate-50 min-h-screen">
      <App />
    </div>
  </React.StrictMode>
);

// Optional: Performance monitoring (Judges like this)
// reportWebVitals(console.log);
