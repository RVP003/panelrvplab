// HT-RVP-09 Panel de Documentación LAB – service worker (versión 02)
// Guarda solo los archivos del panel para abrirlo rápido e instalarlo.
// Los datos NO se guardan aquí: siempre se leen del servidor (Firestore).
const VERSION = 'panel-lab-v02-2026-10-20';
const ARCHIVOS = ['./', './index.html', './config.js', './js/app.js', './js/datos-1619.js', './js/backend-firebase.js',
    './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
});
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'actualizar') self.skipWaiting(); });
// Primero la red (siempre la versión publicada); si no hay conexión, la copia guardada.
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
    e.respondWith(fetch(e.request).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
        return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
