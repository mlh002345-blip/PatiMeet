/**
 * Panel şablonları.
 *
 * Sunucu tarafında düz HTML üretiyoruz: moderasyon paneli için ayrı bir
 * derleme adımı, paket yönetimi ve istemci çatısı taşımaya değmez. Uygulamanın
 * tasarım dili (krem arka plan, koyu lila vurgu) burada da kullanılıyor.
 */

/** HTML'e gömülen tüm kullanıcı verisi bu fonksiyondan geçer (XSS koruması). */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
:root {
  --bg: #FBF6EF; --surface: #FFFFFF; --surface-muted: #F4EEE6;
  --primary: #5B3E8E; --primary-light: #EDE6F7; --accent: #C9803A;
  --text: #2A2430; --muted: #6E6577; --subtle: #9A93A2;
  --border: #E7DFD4; --danger: #B3261E; --danger-light: #FBE9E7;
  --success: #2E7D5B; --success-light: #E3F2EA; --warning: #9A6700;
  --warning-light: #FFF6E0;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
header {
  background: var(--surface); border-bottom: 1px solid var(--border);
  padding: 14px 24px; display: flex; align-items: center; gap: 20px;
  position: sticky; top: 0; z-index: 10;
}
header .brand { font-weight: 700; color: var(--primary); font-size: 17px; }
header nav { display: flex; gap: 16px; flex: 1; flex-wrap: wrap; }
header nav a { color: var(--muted); text-decoration: none; font-weight: 600; font-size: 14px; }
header nav a.active, header nav a:hover { color: var(--primary); }
header .who { color: var(--subtle); font-size: 13px; }
main { max-width: 1180px; margin: 0 auto; padding: 24px; }
h1 { font-size: 24px; margin: 0 0 6px; }
h2 { font-size: 17px; margin: 28px 0 12px; }
p.lead { color: var(--muted); margin: 0 0 20px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 8px; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 16px;
}
.card .n { font-size: 26px; font-weight: 700; color: var(--primary); }
.card .l { color: var(--muted); font-size: 13px; margin-top: 2px; }
.card.alert .n { color: var(--danger); }
table { width: 100%; border-collapse: collapse; background: var(--surface);
  border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
th, td { padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--border);
  vertical-align: top; font-size: 14px; }
th { background: var(--surface-muted); font-size: 12px; text-transform: uppercase;
  letter-spacing: .04em; color: var(--muted); }
tr:last-child td { border-bottom: none; }
.tag { display: inline-block; padding: 2px 9px; border-radius: 999px;
  font-size: 12px; font-weight: 600; }
.tag.open { background: var(--danger-light); color: var(--danger); }
.tag.reviewing { background: var(--warning-light); color: var(--warning); }
.tag.resolved, .tag.active { background: var(--success-light); color: var(--success); }
.tag.suspended, .tag.removed, .tag.deleted, .tag.cancelled { background: var(--danger-light); color: var(--danger); }
.tag.neutral, .tag.hidden { background: var(--surface-muted); color: var(--muted); }
form.inline { display: inline; }
button {
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  border-radius: 9px; border: 1.5px solid transparent; padding: 7px 12px;
  background: var(--primary); color: #fff;
}
button.secondary { background: var(--surface); color: var(--primary); border-color: var(--primary); }
button.danger { background: var(--danger-light); color: var(--danger); }
button.ghost { background: transparent; color: var(--muted); }
button:hover { opacity: .88; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
input[type=text], input[type=password], input[type=email], select, textarea {
  font: inherit; padding: 10px 12px; border: 1.5px solid var(--border);
  border-radius: 10px; background: var(--surface); color: var(--text); width: 100%;
}
.filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filters input[type=text] { max-width: 260px; }
.filters select { max-width: 180px; }
.login { max-width: 380px; margin: 8vh auto; }
.login .card { padding: 28px; }
.login label { display: block; font-size: 13px; font-weight: 600; color: var(--muted);
  margin: 0 0 6px; }
.login .field { margin-bottom: 16px; }
.banner { padding: 12px 14px; border-radius: 10px; margin-bottom: 18px; font-size: 14px; }
.banner.error { background: var(--danger-light); color: var(--danger); }
.banner.ok { background: var(--success-light); color: var(--success); }
.empty { padding: 40px; text-align: center; color: var(--muted);
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }
.muted { color: var(--subtle); font-size: 13px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--subtle); }
details summary { cursor: pointer; color: var(--primary); font-size: 13px; font-weight: 600; }
details p { margin: 8px 0 0; color: var(--muted); white-space: pre-wrap; }
@media (max-width: 720px) {
  table, thead, tbody, th, td, tr { display: block; }
  thead { display: none; }
  tr { border-bottom: 1px solid var(--border); padding: 8px 0; }
  td { border: none; padding: 5px 14px; }
}
`;

export interface LayoutOptions {
  title: string;
  activeTab?: string;
  adminName?: string;
  body: string;
}

const TABS = [
  ['/admin', 'Özet'],
  ['/admin/reports', 'Şikâyetler'],
  ['/admin/users', 'Kullanıcılar'],
  ['/admin/events', 'Etkinlikler'],
  ['/admin/audit', 'İşlem kaydı'],
];

export function layout({ title, activeTab, adminName, body }: LayoutOptions): string {
  const nav = TABS.map(
    ([href, label]) =>
      `<a href="${href}" class="${activeTab === href ? 'active' : ''}">${esc(label)}</a>`
  ).join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · PatiMeet Moderasyon</title>
<style>${STYLES}</style>
</head>
<body>
${
  adminName
    ? `<header>
  <span class="brand">🐾 PatiMeet</span>
  <nav>${nav}</nav>
  <span class="who">${esc(adminName)}</span>
  <form method="post" action="/admin/logout" class="inline">
    <button class="ghost" type="submit">Çıkış</button>
  </form>
</header>`
    : ''
}
<main>${body}</main>
</body>
</html>`;
}

export function loginPage(error: string | null): string {
  return layout({
    title: 'Giriş',
    body: `
<div class="login">
  <h1 style="text-align:center">🐾 PatiMeet</h1>
  <p class="lead" style="text-align:center">Moderasyon paneli</p>
  <div class="card">
    ${error ? `<div class="banner error">${esc(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <div class="field">
        <label for="email">E-posta</label>
        <input type="email" id="email" name="email" required autocomplete="username">
      </div>
      <div class="field">
        <label for="password">Şifre</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit" style="width:100%">Giriş yap</button>
    </form>
  </div>
</div>`,
  });
}

export function statusTag(status: string): string {
  const labels: Record<string, string> = {
    active: 'Aktif',
    suspended: 'Pasif',
    deleted: 'Silinmiş',
    removed: 'Kaldırılmış',
    cancelled: 'İptal',
    hidden: 'Gizli',
    open: 'Açık',
    reviewing: 'İnceleniyor',
    resolved: 'Çözüldü',
  };
  return `<span class="tag ${esc(status)}">${esc(labels[status] ?? status)}</span>`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return DATE_FORMAT.format(new Date(Number(ms)));
}

export const REASON_LABELS: Record<string, string> = {
  taciz: 'Taciz',
  uygunsuz_icerik: 'Uygunsuz içerik',
  sahte_profil: 'Sahte profil',
  hayvana_kotu_muamele: 'Hayvana kötü muamele',
  spam: 'Spam',
  diger: 'Diğer',
};
