// Starts loading the home page's first listings while the app's JavaScript
// downloads, instead of after it runs. The app picks the response up
// (src/lib/initialData.js, takeHomePrefetch); keep the URL in step with
// PlaceListings' first request. A separate file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
if (location.pathname === '/' && !location.search && window.fetch) {
  window.__homeListings = fetch('/api/places?page=1&limit=12', { headers: { Accept: 'application/json' } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; });
}
