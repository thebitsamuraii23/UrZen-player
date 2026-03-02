(() => {
  const TOKEN_KEY = 'urzen_admin_token';
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    adminUsername: '',
    users: []
  };

  const els = {
    loginView: document.getElementById('loginView'),
    dashboardView: document.getElementById('dashboardView'),
    loginForm: document.getElementById('adminLoginForm'),
    loginError: document.getElementById('loginError'),
    dashboardError: document.getElementById('dashboardError'),
    adminIdentity: document.getElementById('adminIdentity'),
    refreshDashboard: document.getElementById('refreshDashboard'),
    logoutAdmin: document.getElementById('logoutAdmin'),
    usersTableBody: document.getElementById('usersTableBody'),
    localActivityBody: document.getElementById('localActivityBody'),
    metricUsers: document.getElementById('metricUsers'),
    metricPlaylists: document.getElementById('metricPlaylists'),
    metricTracks: document.getElementById('metricTracks'),
    metricLocalUploads: document.getElementById('metricLocalUploads'),
    metricLocalInPlaylists: document.getElementById('metricLocalInPlaylists'),
    userTracksPanel: document.getElementById('userTracksPanel'),
    userTracksTitle: document.getElementById('userTracksTitle'),
    userTracksBody: document.getElementById('userTracksBody'),
    closeUserTracks: document.getElementById('closeUserTracks')
  };

  function showLogin(errorText = '') {
    els.loginView.classList.remove('hidden');
    els.dashboardView.classList.add('hidden');
    els.loginError.textContent = errorText;
    els.dashboardError.textContent = '';
    hideUserTracks();
  }

  function showDashboard() {
    els.loginView.classList.add('hidden');
    els.dashboardView.classList.remove('hidden');
    els.loginError.textContent = '';
  }

  function formatDate(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  }

  function setDashboardError(message) {
    els.dashboardError.textContent = message || '';
  }

  async function apiRequest(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      const message = payload && typeof payload === 'object' ? payload.error || response.statusText : response.statusText;
      const err = new Error(message || 'Request failed');
      err.status = response.status;
      throw err;
    }

    return payload;
  }

  function saveToken(token) {
    state.token = token || '';
    if (state.token) {
      localStorage.setItem(TOKEN_KEY, state.token);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
  }

  function renderOverview(metrics) {
    els.metricUsers.textContent = String(metrics.users_count || 0);
    els.metricPlaylists.textContent = String(metrics.playlists_count || 0);
    els.metricTracks.textContent = String(metrics.playlist_tracks_count || 0);
    els.metricLocalUploads.textContent = String(metrics.local_uploads_count || 0);
    els.metricLocalInPlaylists.textContent = String(metrics.local_tracks_in_playlists_count || 0);
  }

  function renderUsers(users) {
    state.users = Array.isArray(users) ? users : [];
    if (!state.users.length) {
      els.usersTableBody.innerHTML = '<tr><td colspan="8">Пользователей пока нет</td></tr>';
      return;
    }

    const html = state.users.map((user) => {
      return `
        <tr data-user-id="${user.id}">
          <td>${user.id}</td>
          <td>${escapeHtml(user.username)}</td>
          <td>${escapeHtml(formatDate(user.created_at))}</td>
          <td>${escapeHtml(formatDate(user.last_active_at))}</td>
          <td>${Number(user.playlists_count || 0)}</td>
          <td>${Number(user.playlist_tracks_count || 0)}</td>
          <td>${Number(user.local_uploads_count || 0)}</td>
          <td>
            <span class="actions-cell">
              <button class="btn btn-ghost" data-action="local" data-user-id="${user.id}">Local</button>
              <button class="btn btn-ghost" data-action="reset" data-user-id="${user.id}">Reset pass</button>
              <button class="btn btn-danger" data-action="delete" data-user-id="${user.id}">Delete</button>
            </span>
          </td>
        </tr>
      `;
    }).join('');

    els.usersTableBody.innerHTML = html;
  }

  function renderLocalActivity(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      els.localActivityBody.innerHTML = '<tr><td colspan="6">Локальные треки еще не добавлялись</td></tr>';
      return;
    }

    const html = list.map((row) => {
      const uploadedBy = row.uploaded_by_username || 'Unknown';
      return `
        <tr>
          <td>#${row.playlist_id} ${escapeHtml(row.playlist_name || '')}</td>
          <td>${escapeHtml(row.playlist_owner_username || '')}</td>
          <td>${escapeHtml(row.track_title || '')}${row.track_artist ? ` - ${escapeHtml(row.track_artist)}` : ''}</td>
          <td>${escapeHtml(uploadedBy)}</td>
          <td>${escapeHtml(formatDate(row.uploaded_at))}</td>
          <td>${escapeHtml(formatDate(row.added_to_playlist_at))}</td>
        </tr>
      `;
    }).join('');
    els.localActivityBody.innerHTML = html;
  }

  function renderUserTracksPanel(payload) {
    const user = payload?.user || {};
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    els.userTracksTitle.textContent = `Local tracks :: ${user.username || 'Unknown'}`;

    if (!tracks.length) {
      els.userTracksBody.innerHTML = '<tr><td colspan="6">Локальных треков нет</td></tr>';
    } else {
      els.userTracksBody.innerHTML = tracks.map((track) => `
        <tr>
          <td>${track.local_track_id}</td>
          <td>${escapeHtml(track.title || '')}</td>
          <td>${escapeHtml(track.artist || '')}</td>
          <td>${escapeHtml(track.album || '')}</td>
          <td>${Number(track.usage_count || 0)}</td>
          <td>${escapeHtml(formatDate(track.updated_at))}</td>
        </tr>
      `).join('');
    }

    els.userTracksPanel.classList.remove('hidden');
  }

  function hideUserTracks() {
    els.userTracksPanel.classList.add('hidden');
    els.userTracksBody.innerHTML = '';
  }

  async function loadDashboard() {
    setDashboardError('');
    try {
      const [overview, users, localActivity] = await Promise.all([
        apiRequest('/api/admin/overview'),
        apiRequest('/api/admin/users'),
        apiRequest('/api/admin/local-activity?limit=250')
      ]);
      renderOverview(overview || {});
      renderUsers(users || []);
      renderLocalActivity(localActivity || []);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        saveToken('');
        showLogin('Сессия админа истекла. Войдите снова.');
        return;
      }
      setDashboardError(error.message || 'Не удалось загрузить данные');
    }
  }

  async function tryRestoreSession() {
    if (!state.token) {
      showLogin();
      return;
    }

    try {
      const me = await apiRequest('/api/admin/me');
      state.adminUsername = me?.username || 'admin';
      els.adminIdentity.textContent = `Logged in as ${state.adminUsername}`;
      showDashboard();
      await loadDashboard();
    } catch (error) {
      saveToken('');
      showLogin();
    }
  }

  async function onSubmitLogin(event) {
    event.preventDefault();
    els.loginError.textContent = '';

    const username = String(document.getElementById('adminUsername').value || '').trim();
    const password = String(document.getElementById('adminPassword').value || '');

    try {
      const payload = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      saveToken(payload?.token || '');
      state.adminUsername = payload?.username || username;
      els.adminIdentity.textContent = `Logged in as ${state.adminUsername}`;
      showDashboard();
      await loadDashboard();
      els.loginForm.reset();
    } catch (error) {
      els.loginError.textContent = error.message || 'Не удалось войти';
    }
  }

  async function onUsersTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const action = target.dataset.action;
    const userId = Number(target.dataset.userId);
    if (!action || !Number.isFinite(userId)) return;

    const user = state.users.find((item) => Number(item.id) === userId);
    if (!user) return;

    if (action === 'reset') {
      const password = window.prompt(`Новый пароль для ${user.username}:`);
      if (!password) return;
      try {
        await apiRequest(`/api/admin/users/${userId}/password`, {
          method: 'PATCH',
          body: JSON.stringify({ password })
        });
        setDashboardError(`Пароль пользователя ${user.username} обновлен.`);
      } catch (error) {
        setDashboardError(error.message || 'Ошибка обновления пароля');
      }
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Удалить пользователя ${user.username} полностью? Будут удалены плейлисты, песни и локальные файлы.`
      );
      if (!confirmed) return;
      try {
        await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
        setDashboardError(`Пользователь ${user.username} удален.`);
        hideUserTracks();
        await loadDashboard();
      } catch (error) {
        setDashboardError(error.message || 'Ошибка удаления пользователя');
      }
      return;
    }

    if (action === 'local') {
      try {
        const payload = await apiRequest(`/api/admin/users/${userId}/local-tracks`);
        renderUserTracksPanel(payload);
      } catch (error) {
        setDashboardError(error.message || 'Ошибка загрузки локальных треков');
      }
    }
  }

  function onLogout() {
    saveToken('');
    state.adminUsername = '';
    els.adminIdentity.textContent = '';
    showLogin();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  els.loginForm.addEventListener('submit', onSubmitLogin);
  els.refreshDashboard.addEventListener('click', () => {
    loadDashboard();
  });
  els.logoutAdmin.addEventListener('click', onLogout);
  els.usersTableBody.addEventListener('click', onUsersTableClick);
  els.closeUserTracks.addEventListener('click', hideUserTracks);

  tryRestoreSession();
})();
