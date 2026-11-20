(() => {
  'use strict';
  const API_BASE = window.CHARGE_API_BASE;
  const AUTH_KEY = 'charge-auth-session';
  const AUTH_TTL = 24 * 60 * 60 * 1000;
  const state = {
    activeTab: 'pending', pending: [], records: [], total: 0,
    pendingCount: null, whitelistCount: null, accountVersion: 0,
    pendingLoaded: false, pendingVisible: false, pendingLoading: false,
    recordsLoaded: false, recordsLoading: false, recordsLimit: null,
    approved: new Set(), approving: new Set(),
  };
  const el = (id) => document.getElementById(id);
  let authSession = null;

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = String(text);
    return result;
  }

  function status(message, type = '') {
    el('admin-status').textContent = message;
    el('admin-status').className = 'notice admin-notice' + (type ? ' ' + type : '');
  }

  function setServerStatus(mode) {
    el('server-status').classList.remove('hidden');
    el('server-dot').className = 'status-dot ' + mode;
    el('server-text').className = 'status-text ' + mode;
    el('server-text').textContent = mode === 'online' ? '服务器正常' : (mode === 'checking' ? '正在检测...' : '服务器异常');
  }

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      return saved && saved.token && Date.now() - saved.loginTime < AUTH_TTL ? saved : null;
    } catch (_) { return null; }
  }

  function leave(clear = false) {
    if (clear) {
      try { localStorage.removeItem(AUTH_KEY); } catch (_) { /* ignore */ }
    }
    window.location.replace('index.html');
  }

  async function api(path, body) {
    const session = readSession();
    if (!session) {
      leave(true);
      throw new Error('登录已失效，请重新登录');
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API_BASE + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: 'Bearer ' + session.token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      setServerStatus(response.status >= 500 ? 'offline' : 'online');
      let data;
      try { data = await response.json(); } catch (_) {
        setServerStatus('offline');
        throw new Error('服务器响应异常，请稍后重试');
      }
      if (response.status === 401) { leave(true); throw new Error('登录已失效，请重新登录'); }
      if (response.status === 403) { leave(); throw new Error(data.message || '无管理员权限'); }
      if (!response.ok || data.ok === false) throw new Error(data.message || '操作失败，请稍后重试');
      if (path.startsWith('/api/admin/') && data.is_admin !== true) {
        leave();
        throw new Error('无管理员权限');
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        setServerStatus('offline');
        throw new Error('请求超时，请稍后重试');
      }
      if (error instanceof TypeError) {
        setServerStatus('offline');
        throw new Error('无法连接服务器，请检查网络后重试');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function copyPhone(phone, button) {
    const originalText = button.dataset.copyLabel || button.textContent;
    button.dataset.copyLabel = originalText;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(phone);
      } else {
        const input = node('textarea', '', phone);
        input.style.cssText = 'position:fixed;left:-10000px;top:0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      button.textContent = '已复制';
      window.setTimeout(() => { if (button.isConnected) button.textContent = originalText; }, 1500);
    } catch (_) { status('复制失败，请长按或选中手机号复制：' + phone, 'err'); }
  }

  function accountTitle(phone) {
    const title = node('div', 'admin-row-title');
    title.append(node('strong', 'admin-account', phone));
    const copy = node('button', 'btn-secondary admin-copy', '复制账号');
    copy.type = 'button';
    copy.setAttribute('aria-label', '复制账号 ' + phone);
    copy.addEventListener('click', () => copyPhone(phone, copy));
    title.append(copy);
    return title;
  }

  function empty(container, message) {
    container.replaceChildren(node('p', 'admin-empty', message));
  }

  function counts() {
    el('pending-count').textContent = state.pendingCount === null ? '—' : state.pendingCount;
    el('whitelist-count').textContent = state.whitelistCount === null ? '—' : state.whitelistCount;
    el('unpaid-count').textContent = state.recordsLoaded
      ? state.records.filter((record) => !record.payment_confirmed).length : '—';
  }

  async function action(button, work) {
    if (button.disabled) return;
    button.disabled = true;
    try { await work(); } catch (error) { status(error.message, 'err'); }
    finally { if (button.isConnected) button.disabled = false; }
  }

  function applyCounts(result) {
    state.pendingCount = result.pending_count;
    state.whitelistCount = result.whitelist_count;
    counts();
  }

  async function approvePhone(phone) {
    if (state.approving.has(phone)) throw new Error('该账号正在审核，请稍候');
    state.approving.add(phone);
    try {
      const result = await api('/api/admin/pending/approve', { phone });
      state.accountVersion += 1;
      state.approved.add(phone);
      state.pending = state.pending.filter((item) => item.phone !== phone);
      applyCounts(result);
      if (state.pendingLoaded) renderPending();
      status('账号 ' + phone + '：' + result.message, 'ok');
    } finally { state.approving.delete(phone); }
  }

  function renderPending() {
    const list = el('pending-list');
    list.replaceChildren();
    if (!state.pending.length) return empty(list, '暂无待审核账号');
    state.pending.forEach(({ phone }) => {
      const row = node('article', 'admin-row admin-pending-row');
      const main = node('div', 'admin-row-main');
      main.append(accountTitle(phone), node('span', 'admin-row-meta', '等待注册审核'));
      const approve = node('button', 'btn-primary', '添加到白名单');
      approve.type = 'button';
      approve.addEventListener('click', () => action(approve, () => approvePhone(phone)));
      const actions = node('div', 'admin-row-actions');
      actions.append(approve);
      row.append(main, actions);
      list.append(row);
    });
  }

  function renderRecords() {
    const filter = el('record-filter').value;
    const search = el('record-search').value.trim();
    const visible = state.records.filter((record) => record.phone.includes(search) &&
      (filter === 'all' || (filter === 'paid' ? record.payment_confirmed : !record.payment_confirmed)));
    el('record-summary').textContent = '后端共 ' + state.total + ' 条，当前加载最近 ' + state.records.length + ' 条，筛选显示 ' + visible.length + ' 条。';
    const list = el('record-list');
    list.replaceChildren();
    if (!visible.length) return empty(list, state.records.length ? '没有符合筛选条件的记录' : '暂无成功充电记录');
    visible.forEach((record) => {
      const paid = record.payment_confirmed === true;
      const row = node('article', 'admin-row' + (paid ? ' admin-record-confirmed' : ''));
      row.dataset.recordId = record.record_id;
      const main = node('div', 'admin-row-main');
      const title = accountTitle(record.phone);
      title.append(node('span', 'payment-badge ' + (paid ? 'paid' : 'unpaid'), paid ? '已确认收款' : '待确认'));
      const timestamp = String(record.timestamp || '').replace('T', ' ');
      main.append(title, node('div', 'admin-row-meta', timestamp + ' · ' + record.station_num + ' 号站 / ' + record.sid + ' 号插座'));
      if (paid && record.payment_confirmed_at) main.append(node('div', 'admin-row-meta', '确认时间：' + String(record.payment_confirmed_at).replace('T', ' ')));
      const actions = node('div', 'admin-row-actions');
      const button = node('button', (paid ? 'btn-secondary' : 'btn-primary') + ' admin-record-action', paid ? '撤销确认' : '确认收款');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (paid && !window.confirm('确定撤销这条记录的收款确认？')) return;
        action(button, async () => {
          const result = await api('/api/admin/charge-records/confirm', {
            record_id: record.record_id, payment_confirmed: !paid,
          });
          state.records = state.records.map((item) => item.record_id === record.record_id ? result.record : item);
          renderRecords();
          counts();
          status('账号 ' + record.phone + '：' + (result.record.payment_confirmed ? '已确认收款' : '已撤销确认') + '，状态已保存。', 'ok');
        });
      });
      actions.append(node('span', 'admin-amount', '¥' + Number(record.amount).toFixed(2)), button);
      row.append(main, actions);
      list.append(row);
    });
  }

  async function loadSummary() {
    const version = state.accountVersion;
    const result = await api('/api/admin/summary');
    if (version === state.accountVersion) applyCounts(result);
    return result;
  }

  async function loadPending() {
    if (state.pendingLoading) return;
    state.pendingLoading = true;
    const version = state.accountVersion;
    el('pending-toggle').disabled = true;
    el('pending-refresh').disabled = true;
    if (!state.pendingLoaded) empty(el('pending-list'), '正在加载待审核账号…');
    try {
      const result = await api('/api/admin/pending');
      state.pending = result.accounts.filter((item) => !state.approved.has(item.phone));
      state.pendingLoaded = true;
      if (version === state.accountVersion) state.pendingCount = result.count;
      renderPending();
      counts();
    } catch (error) {
      if (!state.pendingLoaded) empty(el('pending-list'), '加载失败，可点击刷新重试');
      throw error;
    } finally {
      state.pendingLoading = false;
      el('pending-toggle').disabled = false;
      el('pending-refresh').disabled = false;
    }
  }

  async function loadRecords(force = false) {
    if (state.recordsLoading) return;
    const limit = Number(el('record-limit').value);
    if (!force && state.recordsLoaded && state.recordsLimit === limit) return;
    state.recordsLoading = true;
    const refresh = document.querySelector('[data-refresh="records"]');
    refresh.disabled = true;
    el('record-limit').disabled = true;
    if (!state.recordsLoaded) empty(el('record-list'), '正在加载最近 ' + limit + ' 条记录…');
    try {
      const result = await api('/api/admin/charge-records?limit=' + limit);
      state.records = result.records;
      state.total = result.total;
      state.recordsLimit = result.limit;
      state.recordsLoaded = true;
      renderRecords();
      counts();
    } catch (error) {
      if (!state.recordsLoaded) empty(el('record-list'), '加载失败，请点击刷新记录重试');
      throw error;
    } finally {
      state.recordsLoading = false;
      refresh.disabled = false;
      el('record-limit').disabled = false;
    }
  }

  function selectTab(name) {
    state.activeTab = name;
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      const active = button.dataset.adminTab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    ['pending', 'records'].forEach((key) => el('panel-' + key).classList.toggle('hidden', key !== name));
    if (name === 'records') loadRecords().catch((error) => status(error.message, 'err'));
  }

  function applyTheme(mode) {
    document.body.classList.toggle('theme-dark', mode === 'dark');
    el('theme-toggle').setAttribute('aria-pressed', String(mode === 'dark'));
  }
  try { applyTheme(localStorage.getItem('charge-theme') || 'light'); } catch (_) { applyTheme('light'); }
  el('copy-wx-btn').addEventListener('click', () => {
    copyPhone(el('wx-id').textContent.trim(), el('copy-wx-btn'));
  });
  el('logout-btn').setAttribute('aria-label', '退出登录');
  el('logout-btn').title = '退出登录';
  el('theme-toggle').addEventListener('click', () => {
    const mode = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(mode);
    try { localStorage.setItem('charge-theme', mode); } catch (_) { /* ignore */ }
  });

  document.querySelectorAll('[data-admin-tab]').forEach((button, index, buttons) => {
    button.addEventListener('click', () => selectTab(button.dataset.adminTab));
    button.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus();
    });
  });
  el('refresh-summary').addEventListener('click', () => action(el('refresh-summary'), async () => {
    await loadSummary();
    status('账号数量已更新', 'ok');
  }));
  el('pending-form').addEventListener('submit', (event) => {
    event.preventDefault();
    action(el('approve-account'), async () => {
      await approvePhone(el('pending-phone').value.trim());
      el('pending-form').reset();
    });
  });
  el('pending-toggle').addEventListener('click', () => {
    state.pendingVisible = !state.pendingVisible;
    el('pending-list').classList.toggle('hidden', !state.pendingVisible);
    el('pending-refresh').classList.toggle('hidden', !state.pendingVisible);
    el('pending-toggle').textContent = state.pendingVisible ? '隐藏待审核列表' : '查看所有待审核';
    el('pending-toggle').setAttribute('aria-expanded', String(state.pendingVisible));
    if (state.pendingVisible && !state.pendingLoaded) {
      loadPending().catch((error) => status(error.message, 'err'));
    }
  });
  el('pending-refresh').addEventListener('click', () => action(el('pending-refresh'), async () => {
    await loadPending();
    status('待审核列表已更新', 'ok');
  }));
  el('record-search').addEventListener('input', renderRecords);
  el('record-filter').addEventListener('change', renderRecords);
  el('record-limit').addEventListener('change', () => {
    loadRecords().catch((error) => status(error.message, 'err'));
  });
  document.querySelector('[data-refresh="records"]').addEventListener('click', () => {
    loadRecords(true).then(() => status('记录已更新', 'ok')).catch((error) => status(error.message, 'err'));
  });
  el('logout-btn').addEventListener('click', () => action(el('logout-btn'), async () => {
    try { await api('/api/logout', {}); } finally { leave(true); }
  }));
  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_KEY) {
      const current = readSession();
      if (!current) leave(true);
      else if (authSession && current.token !== authSession.token) window.location.reload();
    }
  });

  async function init() {
    authSession = readSession();
    if (!authSession) return leave(true);
    setServerStatus('checking');
    try {
      // summary 本身执行完整的 Token 与管理员鉴权，首屏无需再请求 verify 或列表。
      const summary = await loadSummary();
      authSession = { ...authSession, phone: summary.phone, is_admin: true };
      try { localStorage.setItem(AUTH_KEY, JSON.stringify(authSession)); } catch (_) { /* ignore */ }
      const masked = summary.phone.length === 11 ? '***' + summary.phone.substring(7) : summary.phone;
      el('logged-user').textContent = masked + ' 管理员';
      el('logged-user').classList.remove('hidden');
      el('logout-btn').classList.remove('hidden');
      el('admin-main').classList.remove('hidden');
      status('可输入账号审核，或切换到收款核对。', 'ok');
    } catch (error) { status(error.message, 'err'); }
  }
  init();
})();
