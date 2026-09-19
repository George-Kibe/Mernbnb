// Applies the saved light/dark theme before first paint (see src/lib/theme.js).
// A separate file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  var theme = localStorage.getItem('theme');
  var dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {
  // Storage or matchMedia unavailable: keep the default (light) theme.
}
