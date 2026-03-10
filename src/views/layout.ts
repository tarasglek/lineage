export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cacheBustUrl(path: string) {
  return `${path}?time=${Date.now()}`;
}

export function assetUrl(path: string) {
  return cacheBustUrl(path);
}

export function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${assetUrl("/static/style.css")}">
  </head>
  <body>
    <main class="page-shell">
      ${body}
    </main>
  </body>
</html>`;
}

export function nav(currentUser?: { username: string } | null) {
  return `<header class="site-header card">
    <div>
      <a href="/" class="site-title">Lineage invite-network</a>
      <p class="muted">Invite-only passkey identity for private communities.</p>
    </div>
    <nav class="inline-actions">
      <a href="/">Home</a>
      ${currentUser ? `<a href="/account">Account</a>` : `<a href="/login">Log in</a>`}
    </nav>
  </header>`;
}

export function sectionCard(content: string) {
  return `<section class="card">${content}</section>`;
}
