import express, { Router } from 'express';
import { config } from '../config';
import {
  listEvents,
  listReports,
  listUsers,
  recentAudit,
  setDogStatus,
  setEventStatus,
  setReportStatus,
  setUserStatus,
  stats,
  verifyAdminCredentials,
  type UserStatus,
} from '../domain/moderation';
import { asyncRoute } from '../http';
import {
  clearSessionCookie,
  currentAdmin,
  requireAdminSession,
  setSessionCookie,
} from './session';
import {
  esc,
  formatDate,
  layout,
  loginPage,
  REASON_LABELS,
  statusTag,
} from './views';

/**
 * Moderasyon paneli (Öncelik 1, madde 5).
 *
 * Sunucu tarafında oluşturulan sayfalar ve form gönderimleri; JavaScript
 * gerekmez. Kullanıcı, etkinlik ve şikâyet inceleme ile pasife alma / içerik
 * kaldırma işlemleri buradan yapılır. Tüm işlemler denetim kaydına yazılır.
 */
export function createAdminPanelRouter(): Router {
  const router = Router();

  // Form gönderimleri için gövde ayrıştırma (yalnızca panel yolunda).
  router.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // --- Giriş / çıkış ---

  router.get(
    '/login',
    asyncRoute((req, res) => {
      const error = typeof req.query.error === 'string' ? 'E-posta veya şifre hatalı.' : null;
      res.type('html').send(loginPage(error));
    })
  );

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email ?? '');
      const password = String(req.body?.password ?? '');

      const admin = await verifyAdminCredentials(email, password);
      if (!admin) {
        res.redirect('/admin/login?error=1');
        return;
      }

      setSessionCookie(res, admin.id);
      res.redirect('/admin');
    })
  );

  router.post(
    '/logout',
    asyncRoute((_req, res) => {
      clearSessionCookie(res);
      res.redirect('/admin/login');
    })
  );

  // --- Buradan sonrası oturum gerektirir ---
  router.use(requireAdminSession);

  // --- Özet ---

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const s = await stats();
      const pending = await listReports('open', 8);

      const cards = [
        { n: s.openReports, l: 'Açık şikâyet', alert: s.openReports > 0 },
        { n: s.users, l: 'Aktif kullanıcı' },
        { n: s.suspended, l: 'Pasif hesap' },
        { n: s.dogs, l: 'Köpek profili' },
        { n: s.events, l: 'Aktif etkinlik' },
        { n: s.messages, l: 'Mesaj' },
        { n: s.devices, l: 'Bildirim cihazı' },
      ]
        .map(
          (card) =>
            `<div class="card${card.alert ? ' alert' : ''}">
               <div class="n">${card.n}</div><div class="l">${esc(card.l)}</div>
             </div>`
        )
        .join('');

      res.type('html').send(
        layout({
          title: 'Özet',
          activeTab: '/admin',
          adminName: admin.name || admin.email,
          body: `
<h1>Özet</h1>
<p class="lead">Topluluğun durumu ve bekleyen işler.</p>
<div class="cards">${cards}</div>

<h2>Bekleyen şikâyetler</h2>
${
  pending.length === 0
    ? `<div class="empty">Bekleyen şikâyet yok. 🎉</div>`
    : reportsTable(pending)
}`,
        })
      );
    })
  );

  // --- Şikâyetler ---

  router.get(
    '/reports',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
      const reports = await listReports(status);

      res.type('html').send(
        layout({
          title: 'Şikâyetler',
          activeTab: '/admin/reports',
          adminName: admin.name || admin.email,
          body: `
<h1>Şikâyetler</h1>
<p class="lead">Açık kayıtlar en üstte listelenir.</p>
<form class="filters" method="get">
  ${select('status', status, [
    ['', 'Tüm durumlar'],
    ['open', 'Açık'],
    ['reviewing', 'İnceleniyor'],
    ['resolved', 'Çözüldü'],
  ])}
  <button type="submit" class="secondary">Filtrele</button>
</form>
${reports.length === 0 ? `<div class="empty">Kayıt bulunamadı.</div>` : reportsTable(reports)}`,
        })
      );
    })
  );

  router.post(
    '/reports/:id/status',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const status = String(req.body?.status ?? '');
      if (['open', 'reviewing', 'resolved'].includes(status)) {
        await setReportStatus(
          admin.id,
          req.params.id,
          status as 'open' | 'reviewing' | 'resolved',
          String(req.body?.note ?? '')
        );
      }
      res.redirect(req.body?.back || '/admin/reports');
    })
  );

  // --- Kullanıcılar ---

  router.get(
    '/users',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const search = typeof req.query.q === 'string' && req.query.q ? req.query.q : null;
      const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
      const users = await listUsers(search, status);

      const rows = users
        .map(
          (user) => `
<tr>
  <td>
    <strong>${esc(user.name || '(isimsiz)')}</strong><br>
    <span class="muted">${esc(user.email)}</span><br>
    <span class="mono">${esc(user.id)}</span>
  </td>
  <td>${esc(user.district ?? '—')}</td>
  <td>${user.dog_count}</td>
  <td>${user.report_count > 0 ? `<span class="tag open">${user.report_count}</span>` : '0'}</td>
  <td>${statusTag(user.status)}</td>
  <td>${formatDate(user.created_at)}</td>
  <td>
    <div class="actions">
      ${
        user.status === 'active'
          ? statusForm('/admin/users', user.id, 'suspended', 'Pasife al', 'danger')
          : statusForm('/admin/users', user.id, 'active', 'Aktife al', 'secondary')
      }
      ${
        user.status !== 'deleted'
          ? statusForm('/admin/users', user.id, 'deleted', 'Verilerini sil', 'danger')
          : ''
      }
    </div>
  </td>
</tr>`
        )
        .join('');

      res.type('html').send(
        layout({
          title: 'Kullanıcılar',
          activeTab: '/admin/users',
          adminName: admin.name || admin.email,
          body: `
<h1>Kullanıcılar</h1>
<p class="lead">Hakkında şikâyet olanlar en üstte.</p>
<form class="filters" method="get">
  <input type="text" name="q" placeholder="Ad veya e-posta ara" value="${esc(search ?? '')}">
  ${select('status', status, [
    ['', 'Tüm durumlar'],
    ['active', 'Aktif'],
    ['suspended', 'Pasif'],
    ['deleted', 'Silinmiş'],
  ])}
  <button type="submit" class="secondary">Ara</button>
</form>
${
  users.length === 0
    ? `<div class="empty">Kullanıcı bulunamadı.</div>`
    : `<table>
<thead><tr><th>Kullanıcı</th><th>Semt</th><th>Köpek</th><th>Şikâyet</th><th>Durum</th><th>Kayıt</th><th>İşlem</th></tr></thead>
<tbody>${rows}</tbody></table>`
}`,
        })
      );
    })
  );

  router.post(
    '/users/:id/status',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const status = String(req.body?.status ?? '');
      if (['active', 'suspended', 'deleted'].includes(status)) {
        await setUserStatus(admin.id, req.params.id, status as UserStatus, String(req.body?.note ?? ''));
      }
      res.redirect(req.body?.back || '/admin/users');
    })
  );

  // --- Etkinlikler ---

  router.get(
    '/events',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const search = typeof req.query.q === 'string' && req.query.q ? req.query.q : null;
      const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
      const events = await listEvents(search, status);

      const rows = events
        .map(
          (event) => `
<tr>
  <td>
    <strong>${esc(event.title)}</strong><br>
    <span class="muted">${esc(event.district)} · ${esc(event.type)}</span><br>
    <span class="mono">${esc(event.id)}</span>
  </td>
  <td>${esc(event.owner_name)}</td>
  <td>${formatDate(event.starts_at)}</td>
  <td>${event.participant_count}</td>
  <td>${event.report_count > 0 ? `<span class="tag open">${event.report_count}</span>` : '0'}</td>
  <td>${statusTag(event.status)}</td>
  <td>
    <div class="actions">
      ${
        event.status !== 'removed'
          ? statusForm('/admin/events', event.id, 'removed', 'Kaldır', 'danger')
          : statusForm('/admin/events', event.id, 'active', 'Geri al', 'secondary')
      }
    </div>
  </td>
</tr>`
        )
        .join('');

      res.type('html').send(
        layout({
          title: 'Etkinlikler',
          activeTab: '/admin/events',
          adminName: admin.name || admin.email,
          body: `
<h1>Etkinlikler</h1>
<p class="lead">Hakkında şikâyet olanlar en üstte.</p>
<form class="filters" method="get">
  <input type="text" name="q" placeholder="Başlık ara" value="${esc(search ?? '')}">
  ${select('status', status, [
    ['', 'Tüm durumlar'],
    ['active', 'Aktif'],
    ['cancelled', 'İptal'],
    ['removed', 'Kaldırılmış'],
  ])}
  <button type="submit" class="secondary">Ara</button>
</form>
${
  events.length === 0
    ? `<div class="empty">Etkinlik bulunamadı.</div>`
    : `<table>
<thead><tr><th>Etkinlik</th><th>Düzenleyen</th><th>Tarih</th><th>Katılımcı</th><th>Şikâyet</th><th>Durum</th><th>İşlem</th></tr></thead>
<tbody>${rows}</tbody></table>`
}`,
        })
      );
    })
  );

  router.post(
    '/events/:id/status',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const status = String(req.body?.status ?? '');
      if (['active', 'cancelled', 'removed'].includes(status)) {
        await setEventStatus(
          admin.id,
          req.params.id,
          status as 'active' | 'cancelled' | 'removed',
          String(req.body?.note ?? '')
        );
      }
      res.redirect(req.body?.back || '/admin/events');
    })
  );

  router.post(
    '/dogs/:id/status',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const status = String(req.body?.status ?? '');
      if (['active', 'hidden', 'deleted'].includes(status)) {
        await setDogStatus(
          admin.id,
          req.params.id,
          status as 'active' | 'hidden' | 'deleted',
          String(req.body?.note ?? '')
        );
      }
      res.redirect(req.body?.back || '/admin/users');
    })
  );

  // --- Denetim kaydı ---

  router.get(
    '/audit',
    asyncRoute(async (req, res) => {
      const admin = currentAdmin(req);
      const entries = await recentAudit(100);

      const rows = entries
        .map(
          (entry) => `
<tr>
  <td>${formatDate(entry.created_at)}</td>
  <td>${esc(entry.admin_name)}</td>
  <td><span class="tag neutral">${esc(entry.action)}</span></td>
  <td>${esc(entry.target_type)}<br><span class="mono">${esc(entry.target_id)}</span></td>
  <td>${esc(entry.note) || '—'}</td>
</tr>`
        )
        .join('');

      res.type('html').send(
        layout({
          title: 'İşlem kaydı',
          activeTab: '/admin/audit',
          adminName: admin.name || admin.email,
          body: `
<h1>İşlem kaydı</h1>
<p class="lead">Moderasyon işlemlerinin denetim geçmişi.</p>
${
  entries.length === 0
    ? `<div class="empty">Henüz işlem yapılmamış.</div>`
    : `<table>
<thead><tr><th>Zaman</th><th>Yönetici</th><th>İşlem</th><th>Hedef</th><th>Not</th></tr></thead>
<tbody>${rows}</tbody></table>`
}`,
        })
      );
    })
  );

  return router;
}

// ---------------------------------------------------------------------------
// Şablon yardımcıları
// ---------------------------------------------------------------------------

function select(name: string, value: string | null, options: Array<[string, string]>): string {
  const items = options
    .map(
      ([optionValue, label]) =>
        `<option value="${esc(optionValue)}"${
          (value ?? '') === optionValue ? ' selected' : ''
        }>${esc(label)}</option>`
    )
    .join('');
  return `<select name="${esc(name)}">${items}</select>`;
}

function statusForm(
  base: string,
  id: string,
  status: string,
  label: string,
  variant: string
): string {
  return `<form method="post" action="${esc(base)}/${esc(id)}/status" class="inline">
  <input type="hidden" name="status" value="${esc(status)}">
  <button type="submit" class="${esc(variant)}">${esc(label)}</button>
</form>`;
}

function reportsTable(reports: Awaited<ReturnType<typeof listReports>>): string {
  const rows = reports
    .map(
      (report) => `
<tr>
  <td>
    <strong>${esc(REASON_LABELS[report.reason] ?? report.reason)}</strong><br>
    <span class="muted">${
      report.target_type === 'user'
        ? 'Kullanıcı'
        : report.target_type === 'event'
          ? 'Etkinlik'
          : 'Bildirim'
    }: ${esc(
      report.target_label ?? '(silinmiş)'
    )}</span>
    ${report.details ? `<details><summary>Açıklama</summary><p>${esc(report.details)}</p></details>` : ''}
  </td>
  <td>${esc(report.reporter_name)}</td>
  <td>${report.target_status ? statusTag(report.target_status) : '—'}</td>
  <td>${statusTag(report.status)}</td>
  <td>${formatDate(report.created_at)}</td>
  <td>
    <div class="actions">
      ${
        report.status === 'open'
          ? statusForm('/admin/reports', report.id, 'reviewing', 'İncelemeye al', 'secondary')
          : ''
      }
      ${
        report.status !== 'resolved'
          ? statusForm('/admin/reports', report.id, 'resolved', 'Çözüldü', 'primary')
          : ''
      }
      ${
        report.target_type === 'user' && report.target_status === 'active'
          ? statusForm('/admin/users', report.target_id, 'suspended', 'Hesabı pasife al', 'danger')
          : ''
      }
      ${
        report.target_type === 'event' && report.target_status === 'active'
          ? statusForm('/admin/events', report.target_id, 'removed', 'Etkinliği kaldır', 'danger')
          : ''
      }
    </div>
  </td>
</tr>`
    )
    .join('');

  return `<table>
<thead><tr><th>Şikâyet</th><th>Bildiren</th><th>Hedef durumu</th><th>Durum</th><th>Zaman</th><th>İşlem</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}
