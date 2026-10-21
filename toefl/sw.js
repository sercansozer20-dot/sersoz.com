/* TOEFL Kart — Service Worker (çevrimdışı destek) */
const CACHE = "toefl-kart-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/hesap.js",
  "./js/data/batch-01-academic-verbs.js",
  "./js/data/batch-02-academic-nouns.js",
  "./js/data/batch-03-academic-adjectives.js",
  "./js/data/batch-04-science-nature.js",
  "./js/data/batch-05-society-culture.js",
  "./js/data/batch-06-business-economy.js",
  "./js/data/batch-07-environment.js",
  "./js/data/batch-08-health-medicine.js",
  "./js/data/batch-09-technology.js",
  "./js/data/batch-10-connectors.js",
  "./js/data/batch-11-b1-core.js",
  "./js/data/batch-12-b1-campus.js",
  "./js/data/batch-13-academic-verbs-2.js",
  "./js/data/batch-14-academic-nouns-2.js",
  "./js/data/batch-15-academic-adjectives-2.js",
  "./js/data/batch-16-arts-literature.js",
  "./js/data/batch-17-astronomy-earth.js",
  "./js/data/batch-18-biology-zoology.js",
  "./js/data/batch-19-anthropology-archaeology.js",
  "./js/data/batch-20-education-research.js",
  "./js/data/batch-21-law-politics.js",
  "./js/data/batch-22-us-history.js",
  "./js/data/batch-23-phrasal-verbs.js",
  "./js/data/batch-24-idioms-collocations.js",
  "./js/data/batch-25-media-communication.js",
  "./fonts/inter-var-latin.woff2",
  "./fonts/inter-var-latin-ext.woff2",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate: önbellekten hemen sun, arka planda güncelle.
   Böylece uygulama çevrimdışı çalışır ama güncellemeler de bir sonraki
   açılışta kendiliğinden gelir. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fresh = fetch(e.request)
          .then((res) => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
