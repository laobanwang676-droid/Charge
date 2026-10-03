const API_BASE = 'https://13tf0xc173771.vicp.fun';

/* 后端不在线（网络失败 / 超时未响应 / 返回非 JSON）时的统一提示，避免暴露 "Failed to fetch" 等浏览器原始报错 */
const SERVICE_BUSY_MESSAGE = '服务器繁忙，请使用群聊机器人充电';

    const verifyBtn = document.getElementById('verify-btn');
    const resetBtn = document.getElementById('reset-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const chargeBtn = document.getElementById('charge-btn');
    const powerBtn = document.getElementById('power-btn');
    const orderBtn = document.getElementById('order-btn');
    const workbench = document.getElementById('workbench');
    const verifyStatus = document.getElementById('verify-status');
    const chargeStatus = document.getElementById('charge-status');
    const powerStatus = document.getElementById('power-status');
    const orderStatus = document.getElementById('order-status');
    const orderResultList = document.getElementById('order-result-list');
    const powerChartOverlay = document.getElementById('power-chart-overlay');
    const powerChartStatus = document.getElementById('power-chart-status');
    const powerChartCanvas = document.getElementById('power-chart-canvas');
    const powerChartNote = document.getElementById('power-chart-note');
    const powerChartClose = document.getElementById('power-chart-close');
    const verifyBadge = document.getElementById('verify-badge');
    const serverStatus = document.getElementById('server-status');
    const serverDot = document.getElementById('server-dot');
    const serverText = document.getElementById('server-text');
    const registerCheckOverlay = document.getElementById('register-check-overlay');
    const registerCheckCopy = document.getElementById('register-check-copy');
    const mapModePanel = document.getElementById('map-mode-panel');
    const mapModeOpenBtn = document.getElementById('map-mode-open-btn');
    const mapModeTabs = Array.from(document.querySelectorAll('[data-map-mode]'));
    const idleQueryBtn = document.getElementById('idle-query-btn');
    const idleMapBtn = document.getElementById('idle-map-btn');
    const idleResultList = document.getElementById('idle-result-list');
    const idleButtons = Array.from(document.querySelectorAll('[data-idle-building]'));

    const idleMapFiles = {
      '20栋': 'map20.html',
      '19栋': 'map19.html',
      '图书馆': 'mapLibrary.html',
      '南门': 'mapSouth.html',
    };

    const mapModeFiles = {
      '20栋': 'map20.html',
      '19栋': 'map19.html',
      '图书馆': 'mapLibrary.html',
      '南门': 'mapSouth.html',
    };

    let themeMode = 'light';
    let verifyCooldownUntil = 0;
    let verifyInFlight = false;
    let chargeCooldownUntil = 0;
    let chargeInFlight = false;
    let powerInFlight = false;
    let orderInFlight = false;
    let powerChartInFlight = false;
    let orderBlocks = [];
    const powerChartCache = {};
    let chargeWarningOpen = false;
    let authMode = 'login';
    let idleSelectedBuilding = '20栋';
    let mapModeSelectedBuilding = '20栋';
    const IDLE_QUERY_COOLDOWNS_KEY = 'charge-idle-query-cooldowns';
    let idleQueryCooldowns = loadIdleQueryCooldowns();
    let idleQueryInFlight = false;
    let idleQueryStatusTimer = null;
    let idleExpandedSites = new Set();
    const workbenchTabs = Array.from(document.querySelectorAll('.tabs [data-tab]'));
    const workbenchTabsRoot = document.querySelector('.tabs');

    /* 空闲插座：楼栋静态站点数据区域 */
    const idleBuildingData = {
      '20栋': [1, 2, 4, 5, 6, 7, 8, 12, 13, 15, 20, 21, 22, 27, 28, 31, 33],
      '图书馆': [3, 9, 10, 11, 14, 16, 17, 18, 19, 23, 24, 25, 26, 29, 30, 32, 34, 35],
      '南门': [36, 37, 38, 39, 74, 75, 76, 77, 78, 79],
      '19栋': [40, 41, 42, 43, 44, 45, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]
    };

    /* 部分站点实际未安装满 10 个插座：后端仍会按 10 个上报。
       这里限制有效插座数量，23 号与 30 号充电桩实际只有 1-7 号共 7 个插座。 */
    const idleStationSocketLimitMap = {
      23: 7,
      30: 7,
    };

    function getIdleStationSocketLimit(siteNumber) {
      const limit = idleStationSocketLimitMap[Number(siteNumber)];
      return Number.isFinite(limit) ? limit : null;
    }

    function limitIdleSockets(siteNumber, sockets) {
      const limit = getIdleStationSocketLimit(siteNumber);
      if (limit === null || !Array.isArray(sockets)) return sockets;
      return sockets.filter((socket) => Number(socket.socketNumber) <= limit);
    }

    const idleAreaResponseCache = {
      '20栋': { siteMap: {}, siteNumbers: [] },
      '19栋': { siteMap: {}, siteNumbers: [] },
      '图书馆': { siteMap: {}, siteNumbers: [] },
      '南门': { siteMap: {}, siteNumbers: [] }
    };

    function normalizeIdleSocketState(value) {
      const state = String(value || '').trim();
      if (!state) return '';
      if (state === '无状态' || state.toLowerCase() === 'unknown' || state.toLowerCase() === 'none') return '无状态';
      if (state === '空闲' || state.toLowerCase() === 'idle' || state.toLowerCase() === 'free') return '空闲';
      if (state === '充电中' || state.toLowerCase() === 'charging') return '充电中';
      if (state === '故障' || state.toLowerCase() === 'fault') return '故障';
      return state;
    }

    function normalizeIdleSocketDisplayState(rawState) {
      const state = normalizeIdleSocketState(rawState);
      if (!state) return '无状态';
      if (state === '无状态' || state.toLowerCase() === 'unknown' || state.toLowerCase() === 'none') return '无状态';
      if (state === '1' || state === 1 || state === '充电中') return '充电中';
      if (state === '0' || state === 0 || state === '空闲') return '空闲';
      return '故障';
    }

    function normalizeIdleProductList(productList) {
      if (!Array.isArray(productList)) return [];
      return productList
        .map((product, index) => {
          const socketNumber = Number(product?.sid ?? product?.socketNo ?? product?.socket_num ?? index + 1);
          if (!Number.isFinite(socketNumber)) return null;
          const rawState = product?.state ?? product?.status ?? product?.socketState;
          return {
            socketNumber,
            state: normalizeIdleSocketDisplayState(rawState === 1 || rawState === '1' ? '充电中' : rawState === 0 || rawState === '0' ? '空闲' : rawState),
            remainingSeconds: parseIdleSocketRemainingSeconds(product),
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.socketNumber - right.socketNumber);
    }

    function parseIdleDurationText(value) {
      const text = String(value || '').trim();
      if (!text) return null;
      const colonMatch = text.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
      if (colonMatch) {
        const hours = Number(colonMatch[1] || 0);
        const minutes = Number(colonMatch[2] || 0);
        const seconds = Number(colonMatch[3] || 0);
        if ([hours, minutes, seconds].every((part) => Number.isFinite(part))) {
          return Math.max(0, Math.ceil(hours * 3600 + minutes * 60 + seconds));
        }
      }
      const durationMatch = text.match(/^(?:(\d+)\s*小时)?(?:(\d+)\s*分钟)?(?:(\d+)\s*秒)?$/);
      if (!durationMatch) return null;
      const hours = Number(durationMatch[1] || 0);
      const minutes = Number(durationMatch[2] || 0);
      const seconds = Number(durationMatch[3] || 0);
      return Math.max(0, Math.ceil(hours * 3600 + minutes * 60 + seconds));
    }

    function buildIdleSocketsFromStationSummary(station) {
      const freeCount = Number(station?.free_count ?? station?.freeCount);
      const busyCount = Number(station?.busy_count ?? station?.busyCount);
      const faultCount = Number(station?.fault_count ?? station?.faultCount);
      const totalCount = Number.isFinite(freeCount) && Number.isFinite(busyCount) && Number.isFinite(faultCount) && (freeCount + busyCount + faultCount > 0)
        ? freeCount + busyCount + faultCount
        : 0;

      if (!Number.isFinite(totalCount) || totalCount <= 0) return [];

      return Array.from({ length: totalCount }, (_, index) => {
        const socketNumber = index + 1;
        return {
          socketNumber,
          state: '无状态',
          remainingSeconds: null,
        };
      });
    }

    function normalizeIdleStationList(stationList) {
      if (!Array.isArray(stationList)) return [];

      return stationList
        .map((station, index) => {
          const stationNumber = Number(station?.station_num ?? station?.stationNo ?? station?.siteNo ?? station?.station_num ?? index + 1);
          if (!Number.isFinite(stationNumber)) return null;
          if (stationNumber === 46) return null;

          const productList = Array.isArray(station?.products)
            ? station.products
            : (Array.isArray(station?.sockets) ? station.sockets : (Array.isArray(station?.ports) ? station.ports : []));
          let sockets = productList.length > 0 ? normalizeIdleProductList(productList) : buildIdleSocketsFromStationSummary(station);
          sockets = limitIdleSockets(stationNumber, sockets);

          const availableCountRaw = station?.free_count ?? station?.freeCount;
          let availableCount = null;
          if (Number.isFinite(availableCountRaw)) {
            availableCount = availableCountRaw;
          } else if (typeof availableCountRaw === 'string' && availableCountRaw.trim() !== '') {
            const parsedCount = Number(availableCountRaw);
            if (Number.isFinite(parsedCount)) availableCount = parsedCount;
          }

          const socketLimit = getIdleStationSocketLimit(stationNumber);
          if (socketLimit !== null && productList.length > 0) {
            /* 有逐插座明细：未安装插座不算，空闲数改为按有效插座重算 */
            availableCount = sockets.filter((socket) => socket.state === '空闲').length;
          } else if (availableCount === null && sockets.length > 0) {
            availableCount = sockets.filter((socket) => socket.state === '空闲').length;
          }
          if (socketLimit !== null && availableCount !== null) {
            availableCount = Math.min(availableCount, socketLimit);
          }

          const offline = Boolean(station?.offline);
          const hasChargingSocket = productList.length > 0 && sockets.some((socket) => socket.state === '充电中');
          const hasExplicitIdleSocket = productList.length > 0 && sockets.some((socket) => socket.state === '空闲');

          return {
            siteNumber: stationNumber,
            state: offline ? '离线' : (hasChargingSocket ? '充电中' : (hasExplicitIdleSocket ? '空闲' : '无状态')),
            availableCount,
            sockets,
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.siteNumber - right.siteNumber);
    }

    function normalizeIdleAreaResponse(payload) {
      const data = payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
      const stationList = Array.isArray(data?.stations) ? data.stations : null;
      if (stationList && stationList.length > 0) {
        const normalizedStations = normalizeIdleStationList(stationList);
        const siteMap = {};
        const siteNumbers = [];

        normalizedStations.forEach((station) => {
          siteNumbers.push(station.siteNumber);
          siteMap[station.siteNumber] = {
            state: station.state,
            availableCount: station.availableCount,
            sockets: station.sockets,
          };
        });

        return {
          siteMap,
          siteNumbers,
          isValid: siteNumbers.length > 0,
        };
      }
      return {
        siteMap: {},
        siteNumbers: [],
        isValid: false,
      };
    }

    function getIdleAreaData(building) {
      return idleAreaResponseCache[building] || { siteMap: {}, siteNumbers: [] };
    }

    function setIdleAreaData(building, payload) {
      idleAreaResponseCache[building] = normalizeIdleAreaResponse(payload);
    }

    function isIdleAreaResponseValid(payload) {
      return Boolean(payload && payload.isValid && Array.isArray(payload.siteNumbers) && payload.siteNumbers.length > 0);
    }

    function getIdleSiteNumbers(building) {
      const areaData = getIdleAreaData(building);
      if (areaData.siteNumbers.length > 0) return areaData.siteNumbers;
      return idleBuildingData[building] || [];
    }

    function getIdleSitePayload(building, siteNumber) {
      const areaData = getIdleAreaData(building);
      return areaData.siteMap[siteNumber] || areaData.siteMap[String(siteNumber)] || {};
    }

    function getIdleSiteKey(building, siteNumber) {
      return `${building}:${siteNumber}`;
    }

    function getIdleSiteState(building, siteNumber) {
      const sitePayload = getIdleSitePayload(building, siteNumber);
      if (typeof sitePayload.state === 'string' && sitePayload.state) return sitePayload.state;
      if (Array.isArray(sitePayload.sockets) && sitePayload.sockets.length > 0) {
        if (sitePayload.sockets.some((socket) => socket.state === '离线')) return '离线';
        if (sitePayload.sockets.some((socket) => socket.state === '故障')) return '故障';
        if (sitePayload.sockets.some((socket) => socket.state === '充电中')) return '充电中';
        if (sitePayload.sockets.every((socket) => socket.state === '无状态')) return '无状态';
      }
      return '无状态';
    }

    function getIdleSiteCount(building, siteNumber) {
      const sitePayload = getIdleSitePayload(building, siteNumber);
      if (Array.isArray(sitePayload.sockets) && sitePayload.sockets.length > 0) {
        const idleCount = sitePayload.sockets.filter((socket) => socket.state === '空闲').length;
        if (idleCount > 0) return idleCount;
        if (sitePayload.sockets.every((socket) => socket.state === '无状态')) return null;
        return idleCount;
      }
      if (Number.isFinite(sitePayload.availableCount)) return sitePayload.availableCount;
      if (typeof sitePayload.availableCount === 'string' && sitePayload.availableCount.trim() !== '') {
        const parsedCount = Number(sitePayload.availableCount);
        if (Number.isFinite(parsedCount)) return parsedCount;
      }
      return null;
    }

    function getIdleSiteSockets(building, siteNumber) {
      const sitePayload = getIdleSitePayload(building, siteNumber);
      if (Array.isArray(sitePayload.sockets) && sitePayload.sockets.length > 0) {
        return sitePayload.sockets;
      }

      const socketLimit = getIdleStationSocketLimit(siteNumber);
      const defaultSocketCount = socketLimit === null ? 10 : socketLimit;
      return Array.from({ length: defaultSocketCount }, (_, index) => {
        const socketNumber = index + 1;
        return {
          socketNumber,
          state: '无状态',
          remainingSeconds: null,
        };
      });
    }

    function updateIdleCountdownView(building = idleSelectedBuilding) {
      if (!idleResultList) return;
      const cards = idleResultList.querySelectorAll('.idle-site-card[data-idle-site]');
      cards.forEach((card) => {
        const siteNumber = Number(card.getAttribute('data-idle-site'));
        if (!Number.isFinite(siteNumber)) return;
        const state = getIdleSiteState(building, siteNumber);
        card.classList.toggle('offline', state === '离线');
        card.classList.toggle('charging', state === '充电中');
        card.classList.toggle('idle', state !== '离线' && state !== '充电中');

        const countNode = card.querySelector('.idle-site-count');
        if (countNode) {
          const availableCount = getIdleSiteCount(building, siteNumber);
          countNode.innerHTML = state === '离线'
            ? '本站点离线'
            : `空闲插座：<span class="idle-site-count-value">${availableCount === null ? '-' : availableCount}</span> 个`;
        }

        const sockets = getIdleSiteSockets(building, siteNumber);
        const socketButtons = card.querySelectorAll('.idle-socket-btn');
        socketButtons.forEach((button, index) => {
          const socket = sockets[index];
          if (!socket) return;

          const displayState = getIdleSocketDisplayState(socket);
          const socketState = displayState.state === '离线'
            ? 'offline'
            : (displayState.state === '故障' ? 'fault'
            : (displayState.state === '充电中' ? 'charging' : 'idle'));
          const stateNode = button.querySelector('.idle-socket-state');

          button.className = `idle-socket-btn ${socketState}`;
          if (stateNode) {
            stateNode.textContent = displayState.state === '离线'
              ? '离线'
              : (displayState.state === '故障'
              ? '故障'
              : (displayState.state === '充电中'
              ? (displayState.remainingSeconds !== null ? formatDuration(displayState.remainingSeconds) : '00:00:00')
              : '空闲'));
          }
        });
      });
    }

    function scheduleIdleResultRefresh() {
      if (window.idleResultRefreshTimer) {
        window.clearTimeout(window.idleResultRefreshTimer);
        window.idleResultRefreshTimer = null;
      }

      const hasCountdown = Object.values(getIdleAreaData(idleSelectedBuilding).siteMap || {}).some((sitePayload) => {
        return Array.isArray(sitePayload.sockets) && sitePayload.sockets.some((socket) => {
          const displayState = getIdleSocketDisplayState(socket);
          return displayState.state === '充电中' && Number.isFinite(displayState.remainingSeconds) && displayState.remainingSeconds > 0;
        });
      });

      if (!hasCountdown) return;

      window.idleResultRefreshTimer = window.setTimeout(() => {
        Object.values(getIdleAreaData(idleSelectedBuilding).siteMap || {}).forEach((sitePayload) => {
          if (!Array.isArray(sitePayload.sockets)) return;
          sitePayload.sockets.forEach((socket) => {
            const displayState = getIdleSocketDisplayState(socket);
            if (displayState.state !== '充电中' || !Number.isFinite(displayState.remainingSeconds)) return;
            if (displayState.remainingSeconds <= 1) {
              socket.state = '空闲';
              socket.status = '空闲';
              socket.socketState = '空闲';
              socket.remainingSeconds = 0;
              socket.remaining_second = 0;
              socket.remainingTime = 0;
              socket.remaining_time = 0;
              socket.countdown = 0;
              socket.countdownSeconds = 0;
              socket.countdown_seconds = 0;
              socket.endTime = 0;
              socket.end_time = 0;
              return;
            }
            const nextSeconds = displayState.remainingSeconds - 1;
            socket.remainingSeconds = nextSeconds;
            socket.remaining_second = nextSeconds;
            socket.remainingTime = nextSeconds;
            socket.remaining_time = nextSeconds;
            socket.countdown = nextSeconds;
            socket.countdownSeconds = nextSeconds;
            socket.countdown_seconds = nextSeconds;
            socket.endTime = nextSeconds * 1000;
            socket.end_time = nextSeconds * 1000;
          });
        });
        updateIdleCountdownView(idleSelectedBuilding);
        scheduleIdleResultRefresh();
      }, 1000);
    }

    const fieldGroups = {
      phone: { input: document.getElementById('phone'), error: document.getElementById('phone-error') },
      password: { input: document.getElementById('password'), error: document.getElementById('password-error') },
      confirmPassword: { input: document.getElementById('confirm-password'), error: document.getElementById('confirm-password-error') },
      chargeStation: { input: document.getElementById('charge-station'), error: document.getElementById('charge-station-error') },
      chargeSid: { input: document.getElementById('charge-sid'), error: document.getElementById('charge-sid-error') },
      chargeAmount: { input: document.getElementById('charge-amount'), error: document.getElementById('charge-amount-error') },
      powerStation: { input: document.getElementById('power-station'), error: document.getElementById('power-station-error') },
      powerSid: { input: document.getElementById('power-sid'), error: document.getElementById('power-sid-error') },
      orderStation: { input: document.getElementById('order-station'), error: document.getElementById('order-station-error') },
      orderSid: { input: document.getElementById('order-sid'), error: document.getElementById('order-sid-error') },
    };

    function setStatus(node, text, kind = '') {
      node.className = 'notice' + (kind ? ' ' + kind : '');
      node.textContent = text;
    }

    function setVerifyStatus(text) {
      verifyStatus.className = '';
      verifyStatus.textContent = text;
    }

    function setFieldError(group, message) {
      group.input.classList.toggle('invalid', Boolean(message));
      group.error.textContent = message || '';
    }

    function setButtonLocked(button, locked) {
      if (!button) return;
      button.disabled = locked;
    }

    /* 弹窗打开时锁定页面滚动，避免背景跟随滑动导致画面撕裂 */
    let pageScrollLockCount = 0;
    let pageScrollLockY = 0;

    function lockPageScroll() {
      pageScrollLockCount += 1;
      if (pageScrollLockCount > 1) return;
      pageScrollLockY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const body = document.body;
      body.style.position = 'fixed';
      body.style.top = `-${pageScrollLockY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    function unlockPageScroll() {
      if (pageScrollLockCount === 0) return;
      pageScrollLockCount -= 1;
      if (pageScrollLockCount > 0) return;
      const body = document.body;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.scrollTo(0, pageScrollLockY);
    }

    /* 点击弹窗外的遮罩或弹窗内任意位置都能关闭；按住拖动（滑动）时不误关 */
    function bindTapToClose(overlay, closeFn) {
      if (!overlay) return;
      let startX = 0;
      let startY = 0;
      let pending = false;
      overlay.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        pending = true;
        startX = event.clientX;
        startY = event.clientY;
      });
      overlay.addEventListener('pointercancel', function () {
        pending = false;
      });
      overlay.addEventListener('click', function (event) {
        const isBackdrop = event.target === overlay;
        const hadPointer = pending;
        const moved = hadPointer && (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8);
        pending = false;
        /* 点遮罩（弹窗外）一定关闭 */
        if (isBackdrop) {
          closeFn(event);
          return;
        }
        /* 点弹窗内：需要是轻点而非拖动 */
        if (!hadPointer || moved) return;
        closeFn(event);
      });
    }

    function isWorkbenchRequestInFlight() {
      return Boolean(chargeInFlight || powerInFlight || orderInFlight || idleQueryInFlight || powerChartInFlight);
    }

    function getActiveWorkbenchRequestLabel() {
      if (chargeInFlight) return '充电请求';
      if (powerInFlight) return '功率查询';
      if (orderInFlight) return '订单查询';
      if (powerChartInFlight) return '功率图查询';
      if (idleQueryInFlight) return '空闲插座查询';
      return '当前请求';
    }

    function updateWorkbenchRequestLock() {
      const locked = isWorkbenchRequestInFlight();
      if (workbenchTabsRoot) {
        workbenchTabsRoot.classList.toggle('request-locked', locked);
      }
      workbenchTabs.forEach((tab) => {
        const isActive = tab.classList.contains('active');
        tab.disabled = locked && !isActive;
        tab.setAttribute('aria-disabled', String(locked && !isActive));
        tab.title = locked && !isActive
          ? `${getActiveWorkbenchRequestLabel()}进行中，请稍候再切换`
          : '';
      });

      updateChargeButtonState();
      updatePowerButtonState();
      updateOrderButtonState();
      updateIdleQueryButtonState();
      updateOrderChartButtons();
    }

    function applyTheme(mode) {
      themeMode = mode === 'dark' ? 'dark' : 'light';
      document.body.classList.toggle('theme-dark', themeMode === 'dark');
      themeToggle.setAttribute('aria-pressed', String(themeMode === 'dark'));
    }

    function toggleTheme() {
      applyTheme(themeMode === 'dark' ? 'light' : 'dark');
      try {
        window.localStorage.setItem('charge-theme', themeMode);
      } catch (_) {
        return;
      }
    }

    function formatSeconds(seconds) {
      return Math.max(0, Math.ceil(seconds));
    }

    function formatDuration(seconds) {
      const totalSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const restSeconds = totalSeconds % 60;
      return [hours, minutes, restSeconds]
        .map((part) => String(part).padStart(2, '0'))
        .join(':');
    }

    function parseIdleSocketRemainingSeconds(socket) {
      const rawRemaining = socket?.remainingSeconds ?? socket?.remaining_second ?? socket?.remainingTime ?? socket?.remaining_time ?? socket?.countdown ?? socket?.countdownSeconds ?? socket?.countdown_seconds;
      if (Number.isFinite(rawRemaining)) return Math.max(0, Math.ceil(rawRemaining));
      if (typeof rawRemaining === 'string' && rawRemaining.trim() !== '') {
        const parsedRemaining = Number(rawRemaining);
        if (Number.isFinite(parsedRemaining)) return Math.max(0, Math.ceil(parsedRemaining));
      }

      const rawEndTime = socket?.endTime ?? socket?.end_time ?? socket?.expireAt ?? socket?.expiresAt ?? socket?.deadline;
      if (!rawEndTime) return null;

      if (typeof rawEndTime === 'string' && /^\d+$/.test(rawEndTime.trim())) {
        return Math.max(0, Math.ceil(Number(rawEndTime.trim()) / 1000));
      }

      if (typeof rawEndTime === 'number' && Number.isFinite(rawEndTime)) {
        return Math.max(0, Math.ceil(rawEndTime / 1000));
      }

      const durationSeconds = parseIdleDurationText(rawEndTime);
      if (Number.isFinite(durationSeconds)) return durationSeconds;

      return null;
    }

    function getIdleSocketDisplayState(socket) {
      const state = normalizeIdleSocketState(socket?.state ?? socket?.status ?? socket?.socketState);
      if (state === '离线') {
        return { state: '离线', remainingSeconds: null };
      }
      const normalizedState = normalizeIdleSocketDisplayState(state);
      if (normalizedState === '无状态') {
        return { state: '无状态', remainingSeconds: null };
      }
      const remainingSeconds = parseIdleSocketRemainingSeconds(socket);
      if (normalizedState === '充电中') {
        if (Number.isFinite(remainingSeconds) && remainingSeconds <= 0) {
          return { state: '空闲', remainingSeconds: null };
        }
        return { state: '充电中', remainingSeconds };
      }
      if (normalizedState === '故障') {
        return { state: '故障', remainingSeconds: null };
      }
      return { state: '空闲', remainingSeconds: null };
    }

    function loadIdleQueryCooldowns() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(IDLE_QUERY_COOLDOWNS_KEY) || '{}');
        const now = Date.now();
        return Object.fromEntries(
          Object.entries(saved).filter(([, deadline]) => Number(deadline) > now)
        );
      } catch (_) {
        return {};
      }
    }

    function saveIdleQueryCooldowns() {
      try {
        sessionStorage.setItem(IDLE_QUERY_COOLDOWNS_KEY, JSON.stringify(idleQueryCooldowns));
      } catch (_) { /* ignore */ }
    }

    function getIdleQueryCooldownUntil(building = idleSelectedBuilding) {
      return Number(idleQueryCooldowns[building]) || 0;
    }

    function beginIdleQueryCooldown(building, seconds = 15) {
      idleQueryCooldowns[building] = Date.now() + seconds * 1000;
      saveIdleQueryCooldowns();
      updateIdleQueryButtonState();

      const tick = () => {
        const remaining = Math.ceil((getIdleQueryCooldownUntil(building) - Date.now()) / 1000);
        if (remaining <= 0) {
          delete idleQueryCooldowns[building];
          saveIdleQueryCooldowns();
          updateIdleQueryButtonState();
          return;
        }
        updateIdleQueryButtonState();
        window.setTimeout(tick, 250);
      };

      tick();
    }

    function updateIdleQueryButtonState() {
      const requestLocked = isWorkbenchRequestInFlight() && !idleQueryInFlight;
      idleButtons.forEach((button) => {
        button.disabled = idleQueryInFlight || requestLocked;
      });
      if (idleMapBtn) {
        idleMapBtn.disabled = idleQueryInFlight || requestLocked || !idleMapFiles[idleSelectedBuilding];
      }

      if (!idleQueryBtn) return;
      if (idleQueryInFlight) {
        idleQueryBtn.disabled = true;
        idleQueryBtn.textContent = '查询中...';
        return;
      }

      if (requestLocked) {
        idleQueryBtn.disabled = true;
        idleQueryBtn.textContent = `查询${idleSelectedBuilding}空闲插座`;
        return;
      }

      const cooldownUntil = getIdleQueryCooldownUntil();
      if (cooldownUntil && Date.now() < cooldownUntil) {
        const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
        idleQueryBtn.disabled = true;
        idleQueryBtn.textContent = `请等待 ${remaining}s`;
        return;
      }

      if (cooldownUntil) {
        delete idleQueryCooldowns[idleSelectedBuilding];
        saveIdleQueryCooldowns();
      }

      idleQueryBtn.disabled = false;
      idleQueryBtn.textContent = `查询${idleSelectedBuilding}空闲插座`;
    }

    function setIdleQueryNotice(text, kind = '') {
      if (!idleResultList) return;
      if (!text) return;
      const notice = document.createElement('div');
      notice.className = `notice${kind ? ` ${kind}` : ''} idle-query-notice`;
      notice.textContent = text;
      idleResultList.replaceChildren(notice);
    }

    function clearIdleQueryStatusTimer() {
      if (idleQueryStatusTimer) {
        window.clearTimeout(idleQueryStatusTimer);
        idleQueryStatusTimer = null;
      }
    }

    function beginVerifyCooldown(seconds = 5) {
      verifyCooldownUntil = Date.now() + seconds * 1000;
      setButtonLocked(verifyBtn, true);

      const tick = () => {
        const remaining = Math.ceil((verifyCooldownUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          verifyCooldownUntil = 0;
          if (!verifyInFlight) {
            setButtonLocked(verifyBtn, false);
            verifyBtn.textContent = authMode === 'login' ? '登录' : '注册';
          }
          return;
        }
        verifyBtn.textContent = `请等待 ${remaining}s`;
        window.setTimeout(tick, 250);
      };

      tick();
    }

    function updateVerifyButtonState() {
      if (verifyInFlight) {
        setButtonLocked(verifyBtn, true);
        verifyBtn.textContent = '提交中...';
        return;
      }
      if (verifyCooldownUntil && Date.now() < verifyCooldownUntil) {
        setButtonLocked(verifyBtn, true);
        const remaining = Math.ceil((verifyCooldownUntil - Date.now()) / 1000);
        verifyBtn.textContent = `请等待 ${remaining}s`;
        return;
      }
      setButtonLocked(verifyBtn, false);
      verifyBtn.textContent = authMode === 'login' ? '登录' : '注册';
    }

    function beginChargeCooldown(seconds = 5) {
      chargeCooldownUntil = Date.now() + seconds * 1000;
      setButtonLocked(chargeBtn, true);

      const tick = () => {
        const remaining = Math.ceil((chargeCooldownUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          chargeCooldownUntil = 0;
          if (!chargeInFlight) {
            setButtonLocked(chargeBtn, false);
            chargeBtn.textContent = '开始充电';
          }
          return;
        }
        chargeBtn.textContent = `请等待 ${remaining}s`;
        window.setTimeout(tick, 250);
      };

      tick();
    }

    function updateChargeButtonState() {
      if (chargeInFlight) {
        setButtonLocked(chargeBtn, true);
        chargeBtn.textContent = '提交中...';
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setButtonLocked(chargeBtn, true);
        chargeBtn.textContent = '开始充电';
        return;
      }
      if (chargeCooldownUntil && Date.now() < chargeCooldownUntil) {
        setButtonLocked(chargeBtn, true);
        const remaining = Math.ceil((chargeCooldownUntil - Date.now()) / 1000);
        chargeBtn.textContent = `请等待 ${remaining}s`;
        return;
      }
      setButtonLocked(chargeBtn, false);
      chargeBtn.textContent = '开始充电';
    }

    function updatePowerButtonState() {
      if (!powerBtn) return;
      if (powerInFlight) {
        setButtonLocked(powerBtn, true);
        powerBtn.textContent = '查询中...';
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setButtonLocked(powerBtn, true);
        powerBtn.textContent = '查询功率';
        return;
      }
      setButtonLocked(powerBtn, false);
      powerBtn.textContent = '查询功率';
    }

    function updateOrderButtonState() {
      if (!orderBtn) return;
      if (orderInFlight) {
        setButtonLocked(orderBtn, true);
        orderBtn.textContent = '查询中...';
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setButtonLocked(orderBtn, true);
        orderBtn.textContent = '查询订单';
        return;
      }
      setButtonLocked(orderBtn, false);
      orderBtn.textContent = '查询订单';
    }

    function updateOrderChartButtons() {
      if (!orderResultList) return;
      const locked = orderInFlight || powerChartInFlight || isWorkbenchRequestInFlight();
      orderResultList.querySelectorAll('.order-chart-button').forEach((button) => {
        const index = Number(button.dataset.index);
        const loadingThis = powerChartInFlight && Number(powerChartOverlay?.dataset.index) === index;
        button.disabled = locked;
        button.classList.toggle('locked', locked);
        button.textContent = loadingThis ? '查询中...' : '查看充电功率图';
      });
      if (powerChartClose) {
        powerChartClose.disabled = powerChartInFlight;
      }
    }

    function clearFieldErrors() {
      Object.values(fieldGroups).forEach((group) => setFieldError(group, ''));
    }

    function isDigits(value) {
      return /^\d+$/.test(String(value).trim());
    }

    function validateDigitsField(group, label, { minLength = 1, maxLength = Infinity, exactLength = null } = {}) {
      const value = group.input.value.trim();
      if (!value) {
        setFieldError(group, `${label}不能为空`);
        return false;
      }
      if (!isDigits(value)) {
        setFieldError(group, `${label}必须是纯数字`);
        return false;
      }
      if (exactLength !== null && value.length !== exactLength) {
        setFieldError(group, `${label}必须是 ${exactLength} 位数字`);
        return false;
      }
      if (value.length < minLength || value.length > maxLength) {
        setFieldError(group, `${label}长度不正确`);
        return false;
      }
      setFieldError(group, '');
      return true;
    }

    function validatePhone() {
      return validateDigitsField(fieldGroups.phone, '手机号', { exactLength: 11 });
    }

    function validateChargeForm() {
      const okStation = validateDigitsField(fieldGroups.chargeStation, '站点号');
      const okSid = validateDigitsField(fieldGroups.chargeSid, '插座号');
      const okAmount = validateDigitsField(fieldGroups.chargeAmount, '金额');
      if (okAmount) {
        const amount = Number(fieldGroups.chargeAmount.input.value.trim());
        if (!Number.isInteger(amount) || amount < 1 || amount > 4) {
          setFieldError(fieldGroups.chargeAmount, '金额只能是 1 到 4 的整数');
          return false;
        }
      }
      return okStation && okSid && okAmount;
    }

    function validateQueryForm(kind) {
      const stationGroup = kind === 'power' ? fieldGroups.powerStation : fieldGroups.orderStation;
      const sidGroup = kind === 'power' ? fieldGroups.powerSid : fieldGroups.orderSid;
      return validateDigitsField(stationGroup, '站点号') && validateDigitsField(sidGroup, '插座号');
    }

    async function api(path, data) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const session = loadAuthSession();
        if (session && session.token) {
          headers.Authorization = `Bearer ${session.token}`;
        }
      } catch (_) { /* ignore */ }
      let response;
      try {
        response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        });
      } catch (_) {
        throw new Error(SERVICE_BUSY_MESSAGE);
      }
      let payload = {};
      try {
        payload = await response.json();
      } catch (_) {
        payload = {};
      }

      if (response.status === 401 && path !== '/api/auth') {
        /* 登录失效：退回登录页、回填账号密码，并在登录区显示文字提示 */
        handleSessionExpired();
        const error = new Error(SESSION_EXPIRED_MESSAGE);
        error.sessionExpired = true;
        throw error;
      }

      if (!response.ok) {
        throw new Error(payload.message || SERVICE_BUSY_MESSAGE);
      }
      return payload;
    }

    function openWorkbench() {
      workbench.classList.remove('hidden');
      document.getElementById('logout-btn').classList.remove('hidden');
    }

    function closeWorkbench() {
      workbench.classList.add('hidden');
      document.getElementById('logout-btn').classList.add('hidden');
    }

    /* ===== 24小时登录持久化 ===== */
    const AUTH_STORAGE_KEY = 'charge-auth-session';
    const LOGIN_CREDENTIALS_KEY = 'charge-login-credentials';
    const AUTH_VALIDITY_MS = 24 * 60 * 60 * 1000;

    function saveAuthSession(phone, token) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phone: phone, token: token || '', loginTime: Date.now() }));
      } catch (_) { /* ignore */ }
    }

    function loadAuthSession() {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session.phone || !session.loginTime) return null;
        if (Date.now() - session.loginTime > AUTH_VALIDITY_MS) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return null;
        }
        return session;
      } catch (_) { return null; }
    }

    function clearAuthSession() {
      try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (_) { /* ignore */ }
    }

    function saveLoginCredentials(phone, password) {
      try {
        localStorage.setItem(LOGIN_CREDENTIALS_KEY, JSON.stringify({ phone: phone, password: password }));
      } catch (_) { /* ignore */ }
    }

    function loadLoginCredentials() {
      try {
        const raw = localStorage.getItem(LOGIN_CREDENTIALS_KEY);
        if (!raw) return null;
        const credentials = JSON.parse(raw);
        if (!credentials.phone || !credentials.password) return null;
        return credentials;
      } catch (_) {
        return null;
      }
    }

    function fillLoginCredentials() {
      const credentials = loadLoginCredentials();
      if (!credentials) return;
      fieldGroups.phone.input.value = credentials.phone || '';
      fieldGroups.password.input.value = credentials.password || '';
    }

    /* ===== Token 有效性校验（每次刷新页面时调用） ===== */
    async function validateToken() {
      try {
        const session = loadAuthSession();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const headers = { 'Content-Type': 'application/json' };
        if (session && session.token) {
          headers.Authorization = `Bearer ${session.token}`;
        }
        const response = await fetch(`${API_BASE}/api/auth`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'verify' }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        let payload = {};
        try { payload = await response.json(); } catch (_) { payload = {}; }

        // 后端期望返回 { code: 0, valid: true, message: "..." }
        // session有效：HTTP 200 且 payload.valid === true
        // session无效/过期：HTTP 401 或 payload.valid === false
        if (response.ok && payload.valid === true) {
          return payload.phone || null;
        }
        return null;
      } catch (_) {
        // 网络异常等情况，保守处理为token无效
        return null;
      }
    }

    function setLoggedInUI(phone) {
      const masked = phone.length === 11 ? '***' + phone.substring(7) : phone;
      const loggedUser = document.getElementById('logged-user');
      loggedUser.textContent = masked + ' 已登录';
      loggedUser.classList.remove('hidden');
      document.querySelector('.verify-card').classList.add('hidden');
      document.getElementById('sidebar-notes').classList.remove('hidden');
      openWorkbench();
    }

    function setMapMode(building) {
      mapModeSelectedBuilding = building;
      mapModeTabs.forEach(function (tab) {
        tab.classList.toggle('active', tab.dataset.mapMode === building);
      });
      if (mapModeOpenBtn) {
        mapModeOpenBtn.textContent = `查看${building}地图`;
      }
    }

    function showMapMode() {
      authMode = 'map';
      document.querySelectorAll('.mode-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.mode === 'map');
      });
      verifyBtn.textContent = '返回登录';
      verifyStatus.className = '';
      verifyStatus.textContent = '';
      verifyStatus.classList.add('hidden');
      document.querySelector('.form-grid').classList.add('hidden');
      document.querySelector('.actions').classList.add('hidden');
      document.getElementById('map-mode-panel').classList.remove('hidden');
      toggleConfirmPasswordField(false);
      clearFieldErrors();
      setMapMode(mapModeSelectedBuilding || '20栋');
    }

    function hideMapMode(restoreCredentials = true) {
      verifyStatus.classList.remove('hidden');
      document.querySelector('.form-grid').classList.remove('hidden');
      document.querySelector('.actions').classList.remove('hidden');
      document.getElementById('map-mode-panel').classList.add('hidden');
      if (restoreCredentials) fillLoginCredentials();
    }

    /* ===== 登录失效：退回登录页，回填账号密码并给出文字提示 ===== */
    const SESSION_EXPIRED_MESSAGE = '登录已过期，请重新登录';

    function handleSessionExpired() {
      resetAll();
      /* resetAll 默认不清空后不回填，这里显式回填上次登录的账号密码 */
      fillLoginCredentials();
      setStatus(verifyStatus, SESSION_EXPIRED_MESSAGE, 'err');
    }

    function resetAll() {
      verifyCooldownUntil = 0;
      verifyInFlight = false;
      chargeInFlight = false;
      powerInFlight = false;
      orderInFlight = false;
      powerChartInFlight = false;
      idleQueryInFlight = false;
      clearAuthSession();
      serverStatus.classList.add('hidden');
      authMode = 'login';
      document.querySelectorAll('.mode-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.mode === 'login');
      });
      verifyBtn.textContent = '登录';
      document.getElementById('phone').value = '';
      document.getElementById('password').value = '';
      Object.values(fieldGroups).forEach((group) => {
        group.input.value = '';
        setFieldError(group, '');
      });
      toggleConfirmPasswordField(false);
      hideMapMode(false);
      const loggedUser = document.getElementById('logged-user');
      loggedUser.textContent = '';
      loggedUser.classList.add('hidden');
      closeWorkbench();
      document.querySelector('.verify-card').classList.remove('hidden');
      document.getElementById('sidebar-notes').classList.add('hidden');
      setVerifyStatus('未注册请先注册并联系管理员审核通过。');
      setStatus(chargeStatus, '请确保插头插好再点击开始充电。');
      setStatus(powerStatus, '可查询当前功率。');
      setStatus(orderStatus, '可查询最近订单。');
      clearOrderBlocks();
      closePowerChart(true);
      updateVerifyButtonState();
      switchTab('charge', { force: true });
      updateWorkbenchRequestLock();
    }

    function switchTab(name, options = {}) {
      const force = Boolean(options.force);
      const activeTab = document.querySelector('.tab.active');
      const currentName = activeTab ? activeTab.dataset.tab : '';
      if (!force && name !== currentName && isWorkbenchRequestInFlight()) {
        const message = `${getActiveWorkbenchRequestLabel()}进行中，请稍候再切换页面。`;
        if (currentName === 'power') {
          setStatus(powerStatus, message, 'err');
        } else if (currentName === 'order') {
          setStatus(orderStatus, message, 'err');
        } else if (currentName === 'charge') {
          setStatus(chargeStatus, message, 'err');
        }
        return false;
      }

      document.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === name);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${name}`);
      });
      updateWorkbenchRequestLock();
      return true;
    }

    function switchIdleBuilding(building) {
      if (building !== idleSelectedBuilding && isWorkbenchRequestInFlight()) {
        return false;
      }
      idleSelectedBuilding = building;
      idleButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.idleBuilding === building);
      });
      updateIdleQueryButtonState();
      updateIdleMapButtonState();
      renderIdleResult(building);
      return true;
    }

    function updateIdleMapButtonState() {
      if (!idleMapBtn) return;
      idleMapBtn.textContent = `查看${idleSelectedBuilding}地图`;
      idleMapBtn.disabled = !idleMapFiles[idleSelectedBuilding];
    }

    function openIdleMapPage() {
      if (isWorkbenchRequestInFlight()) {
        setIdleQueryNotice(`${getActiveWorkbenchRequestLabel()}进行中，请稍候再查看地图。`, 'err');
        return;
      }
      const mapFile = idleMapFiles[idleSelectedBuilding];
      if (!mapFile) return;
      const areaData = getIdleAreaData(idleSelectedBuilding);
      const stationStates = {};
      Object.keys(areaData.siteMap || {}).forEach((siteNumber) => {
        const sitePayload = areaData.siteMap[siteNumber] || {};
        const freeSocketNumbers = Array.isArray(sitePayload.sockets)
          ? sitePayload.sockets
              .filter((socket) => socket && socket.state === '空闲')
              .map((socket) => socket.socketNumber)
          : [];
        stationStates[siteNumber] = {
          state: sitePayload.state || '',
          availableCount: sitePayload.availableCount,
          freeSocketNumbers,
          hasStatus: (typeof sitePayload.state === 'string' && sitePayload.state.trim() !== '') || Number.isFinite(sitePayload.availableCount),
        };
      });
      try {
        sessionStorage.setItem('charge-map-return', JSON.stringify({ tab: 'idle', building: idleSelectedBuilding }));
        sessionStorage.setItem('charge-map-scroll-y', String(window.scrollY || 0));
      } catch (_) { /* ignore */ }
      const mapQuery = Object.keys(stationStates).length > 0
        ? `?states=${encodeURIComponent(JSON.stringify(stationStates))}`
        : '';
      window.location.href = mapFile + mapQuery;
    }

    function openPublicMapPage() {
      const mapFile = mapModeFiles[mapModeSelectedBuilding];
      if (!mapFile) return;
      try {
        sessionStorage.setItem('charge-map-return', JSON.stringify({ tab: 'map', building: mapModeSelectedBuilding }));
        sessionStorage.setItem('charge-map-scroll-y', String(window.scrollY || 0));
      } catch (_) { /* ignore */ }
      window.location.href = mapFile;
    }

    /* 空闲插座：查询按钮点击区域 */
    async function queryIdleSockets() {
      if (idleQueryInFlight) return;
      if (isWorkbenchRequestInFlight()) {
        setIdleQueryNotice(`${getActiveWorkbenchRequestLabel()}进行中，请稍候再查询。`, 'err');
        return;
      }
      const cooldownUntil = getIdleQueryCooldownUntil();
      if (cooldownUntil && Date.now() < cooldownUntil) {
        updateIdleQueryButtonState();
        return;
      }

      const queriedBuilding = idleSelectedBuilding;
      const requestPayload = { area: queriedBuilding };
      idleQueryInFlight = true;
      updateWorkbenchRequestLock();
      clearIdleQueryStatusTimer();
      setIdleQueryNotice('正在查询空闲插座，查询耗时随网络情况波动，请稍候...', '');

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const headers = { 'Content-Type': 'application/json' };
      try {
        const session = loadAuthSession();
        if (session && session.token) {
          headers.Authorization = `Bearer ${session.token}`;
        }
      } catch (_) { /* ignore */ }

      try {
        const response = await fetch(`${API_BASE}/api/idle/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        let result = null;
        try {
          result = await response.json();
        } catch (_) {
          /* 响应不是合法 JSON（后端不在线时常见：网关页/静态兜底页），按后端不可达处理 */
          result = null;
        }

        if (!response.ok) {
          /* 后端有响应但不正常：优先展示后端返回的 message，没有则统一提示 */
          const serverMessage = result && result.message;
          const serverError = new Error(serverMessage || SERVICE_BUSY_MESSAGE);
          if (serverMessage) serverError.fromServer = true;
          throw serverError;
        }

        if (!result || typeof result !== 'object') {
          throw new Error(SERVICE_BUSY_MESSAGE);
        }

        if (result && Number(result.normal) === -10) {
          idleAreaResponseCache[idleSelectedBuilding] = {
            siteMap: {},
            siteNumbers: idleBuildingData[idleSelectedBuilding] || [],
            isValid: false,
          };
          renderIdleResult(idleSelectedBuilding);
          clearIdleQueryStatusTimer();
          setIdleQueryNotice(result.msg || '设备离线，请更换其他设备', 'err');
          return;
        }

        setIdleAreaData(idleSelectedBuilding, result);
        const cachedResult = getIdleAreaData(idleSelectedBuilding);
        if (!isIdleAreaResponseValid(cachedResult)) {
          idleAreaResponseCache[idleSelectedBuilding] = {
            siteMap: {},
            siteNumbers: idleBuildingData[idleSelectedBuilding] || [],
            isValid: false,
          };
          renderIdleResult(idleSelectedBuilding);
          clearIdleQueryStatusTimer();
          setIdleQueryNotice('数据格式解析出错', 'err');
          return;
        }

        renderIdleResult(idleSelectedBuilding);
        clearIdleQueryStatusTimer();
      } catch (error) {
        /* 只有后端明确返回的 message 才原样展示；网络失败/超时/非 JSON 一律统一提示，
           避免把 "Failed to fetch" 这类浏览器原始报错暴露给用户 */
        const rawMessage = error && error.message ? String(error.message) : '';
        const message = (error && error.fromServer && rawMessage)
          ? rawMessage
          : SERVICE_BUSY_MESSAGE;
        if (!(error && error.fromServer)) {
          console.warn('[idle-query] 查询未获得后端正常响应，已使用统一提示', error);
        }
        clearIdleQueryStatusTimer();
        const emptyResult = { siteMap: {}, siteNumbers: idleBuildingData[idleSelectedBuilding] || [], isValid: false };
        idleAreaResponseCache[idleSelectedBuilding] = emptyResult;
        renderIdleResult(idleSelectedBuilding);
        setIdleQueryNotice(message, 'err');
      } finally {
        window.clearTimeout(timeoutId);
        idleQueryInFlight = false;
        beginIdleQueryCooldown(queriedBuilding, 15);
        updateWorkbenchRequestLock();
      }
    }

    /* 空闲插座：结果列表渲染区域 */
    function renderIdleResult(building) {
      if (!idleResultList) return;
      const siteNumbers = getIdleSiteNumbers(building);
      if (siteNumbers.length === 0) {
        idleResultList.innerHTML = '';
        if (window.idleResultRefreshTimer) {
          window.clearTimeout(window.idleResultRefreshTimer);
          window.idleResultRefreshTimer = null;
        }
        return;
      }

      idleResultList.innerHTML = siteNumbers.map((siteNumber) => {
        const siteKey = getIdleSiteKey(building, siteNumber);
        const isExpanded = idleExpandedSites.has(siteKey);
        const state = getIdleSiteState(building, siteNumber);
        const availableCount = getIdleSiteCount(building, siteNumber);
        const cardClass = state === '离线' ? 'offline' : (state === '充电中' ? 'charging' : 'idle');
        const summaryText = state === '离线'
          ? '本站点离线'
          : `空闲插座：<span class="idle-site-count-value">${availableCount === null ? '-' : availableCount}</span> 个`;
        const socketButtons = getIdleSiteSockets(building, siteNumber).map((socket) => {
          const displayState = getIdleSocketDisplayState(socket);
          const socketState = displayState.state === '离线'
            ? 'offline'
            : (displayState.state === '故障' ? 'fault'
            : (displayState.state === '充电中' ? 'charging' : (displayState.state === '无状态' ? 'pending' : 'idle')));
          const stateText = displayState.state === '离线'
            ? '离线'
            : (displayState.state === '故障'
            ? '故障'
            : (displayState.state === '充电中'
            ? (displayState.remainingSeconds !== null ? formatDuration(displayState.remainingSeconds) : '00:00:00')
            : (displayState.state === '无状态' ? '无状态' : '空闲')));
          return `
            <button class="idle-socket-btn ${socketState}" type="button">
              <span class="idle-socket-number">${socket.socketNumber}号</span>
              <span class="idle-socket-state">${stateText}</span>
            </button>
          `;
        }).join('');

        return `
          <div class="idle-site-card ${cardClass}${isExpanded ? ' open' : ''}" data-idle-site="${siteNumber}">
            <button class="idle-site-summary" type="button" aria-expanded="${isExpanded ? 'true' : 'false'}">
              <span class="idle-site-name">${building}充电区-${siteNumber}号站点</span>
              <span class="idle-site-count">${summaryText}</span>
            </button>
            <div class="idle-socket-grid">
              ${socketButtons}
            </div>
          </div>
        `;
      }).join('');

      scheduleIdleResultRefresh();
    }

    /* 空闲插座：站点展开收起区域 */
    function toggleIdleSite(card) {
      const isOpen = card.classList.toggle('open');
      const summary = card.querySelector('.idle-site-summary');
      if (summary) summary.setAttribute('aria-expanded', String(isOpen));
      const siteNumber = card.getAttribute('data-idle-site');
      if (!siteNumber) return;
      const siteKey = getIdleSiteKey(idleSelectedBuilding, siteNumber);
      if (isOpen) {
        idleExpandedSites.add(siteKey);
      } else {
        idleExpandedSites.delete(siteKey);
      }
    }

    function validatePassword() {
      const value = fieldGroups.password.input.value.trim();
      if (!value) {
        setFieldError(fieldGroups.password, '密码不能为空');
        return false;
      }
      if (value.length < 6) {
        setFieldError(fieldGroups.password, '密码长度不能少于6位');
        return false;
      }
      setFieldError(fieldGroups.password, '');
      return true;
    }

    function validateConfirmPassword() {
      const pwd = fieldGroups.password.input.value.trim();
      const confirm = fieldGroups.confirmPassword.input.value.trim();
      if (!confirm) {
        setFieldError(fieldGroups.confirmPassword, '请再次输入密码');
        return false;
      }
      if (pwd !== confirm) {
        setFieldError(fieldGroups.confirmPassword, '两次输入的密码不一致');
        return false;
      }
      setFieldError(fieldGroups.confirmPassword, '');
      return true;
    }

    async function handleAuth() {
      clearFieldErrors();
      if (!validatePhone()) {
        setStatus(verifyStatus, '手机号输入有误，请检查后再提交。', 'err');
        return;
      }
      if (!validatePassword()) {
        setStatus(verifyStatus, '密码输入有误，请检查后再提交。', 'err');
        return;
      }
      if (authMode === 'register' && !validateConfirmPassword()) {
        setStatus(verifyStatus, '两次输入的密码不一致，请检查后再提交。', 'err');
        return;
      }

      if (verifyInFlight) {
        setStatus(verifyStatus, '请求正在处理中，请不要重复点击。', 'err');
        return;
      }
      if (verifyCooldownUntil && Date.now() < verifyCooldownUntil) {
        const remaining = formatSeconds((verifyCooldownUntil - Date.now()) / 1000);
        setStatus(verifyStatus, `操作太快，请 ${remaining} 秒后再试。`, 'err');
        updateVerifyButtonState();
        return;
      }

      const phone = fieldGroups.phone.input.value.trim();
      const password = fieldGroups.password.input.value.trim();
      verifyInFlight = true;
      updateVerifyButtonState();

      if (authMode === 'register') {
        setStatus(verifyStatus, '正在提交注册申请...');
        try {
          const result = await api('/api/auth', { phone, password, action: 'register' });
          setStatus(verifyStatus, result.message || '账号申请成功，审核提示已弹窗显示。', 'ok');
          showRegisterCheck();
          beginVerifyCooldown(5);
        } catch (error) {
          if (error.message.includes('操作太快') || error.message.includes('请求过于频繁')) {
            const match = error.message.match(/(\d+)\s*秒/);
            if (match) {
              verifyCooldownUntil = Date.now() + Number(match[1]) * 1000;
              updateVerifyButtonState();
            }
          }
          setStatus(verifyStatus, error.message, 'err');
        } finally {
          verifyInFlight = false;
          updateVerifyButtonState();
        }
      } else {
        setStatus(verifyStatus, '正在登录...');
        try {
          const result = await api('/api/auth', { phone, password, action: 'login' });
          saveAuthSession(phone, result.token || '');
          saveLoginCredentials(phone, password);
          setLoggedInUI(phone);
          serverStatus.classList.remove('hidden');
          checkServerHealth();
          setStatus(verifyStatus, `${result.message || '登录成功'}\n手机号：${phone}`, 'ok');
          beginVerifyCooldown(5);
        } catch (error) {
          if (error.message.includes('操作太快') || error.message.includes('请求过于频繁')) {
            const match = error.message.match(/(\d+)\s*秒/);
            if (match) {
              verifyCooldownUntil = Date.now() + Number(match[1]) * 1000;
              updateVerifyButtonState();
            }
          }
          closeWorkbench();
          setStatus(verifyStatus, error.message, 'err');
        } finally {
          verifyInFlight = false;
          updateVerifyButtonState();
        }
      }
    }

    async function startCharge() {
      clearFieldErrors();
      if (chargeWarningOpen) return;
      if (chargeInFlight) {
        setStatus(chargeStatus, '充电请求正在处理中，请不要重复点击。', 'err');
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setStatus(chargeStatus, `${getActiveWorkbenchRequestLabel()}进行中，请稍候再操作。`, 'err');
        return;
      }
      if (chargeCooldownUntil && Date.now() < chargeCooldownUntil) {
        const remaining = formatSeconds((chargeCooldownUntil - Date.now()) / 1000);
        setStatus(chargeStatus, `操作太快，请 ${remaining} 秒后再试。`, 'err');
        updateChargeButtonState();
        return;
      }
      if (!validateChargeForm()) {
        setStatus(chargeStatus, '请先修正充电信息中的数字格式。', 'err');
        return;
      }

      const station_num = fieldGroups.chargeStation.input.value.trim();
      const sid = fieldGroups.chargeSid.input.value.trim();
      const amount = fieldGroups.chargeAmount.input.value.trim();

      const chargeWarningMessage = getChargeWarningMessage(station_num, sid);
      if (chargeWarningMessage && !(await confirmChargeWarning(chargeWarningMessage))) {
        return;
      }

      /* 功能2：无论充电请求成功与否，都记住站点号和插座号 */
      saveChargeMemory(station_num, sid);

      setStatus(chargeStatus, '正在提交充电请求...');
      chargeInFlight = true;
      updateWorkbenchRequestLock();
      try {
        const result = await api('/api/charge', { station_num, sid, amount });
        setStatus(chargeStatus, result.message, 'ok');
        beginChargeCooldown(5);
        /* 功能1：充电成功后弹窗提醒付款 */
        showPayReminder(station_num, sid, amount);
      } catch (error) {
        /* 登录失效已在登录区提示，避免把过期文案写进工作台通知 */
        if (error.sessionExpired) return;
        if (error.message.includes('操作太快') || error.message.includes('请求过于频繁')) {
          const match = error.message.match(/(\d+)\s*秒/);
          if (match) {
            chargeCooldownUntil = Date.now() + Number(match[1]) * 1000;
            updateChargeButtonState();
          }
        }
        setStatus(chargeStatus, error.message, 'err');
      }
      finally {
        chargeInFlight = false;
        updateWorkbenchRequestLock();
      }
    }

    async function queryPowerAction() {
      clearFieldErrors();
      if (powerInFlight) {
        setStatus(powerStatus, '功率查询正在处理中，请不要重复点击。', 'err');
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setStatus(powerStatus, `${getActiveWorkbenchRequestLabel()}进行中，请稍候再查询。`, 'err');
        return;
      }
      if (!validateQueryForm('power')) {
        setStatus(powerStatus, '请先修正查询信息中的数字格式。', 'err');
        return;
      }

      const station_num = fieldGroups.powerStation.input.value.trim();
      const sid = fieldGroups.powerSid.input.value.trim();

      /* 功能2：无论查询成功与否，都记住功率查询的站点号和插座号 */
      savePowerMemory(station_num, sid);

      setStatus(powerStatus, '正在查询功率...');
      powerInFlight = true;
      updateWorkbenchRequestLock();
      try {
        const result = await api('/api/power', { station_num, sid });
        setStatus(powerStatus, result.message, 'ok');
      } catch (error) {
        if (error.sessionExpired) return;
        setStatus(powerStatus, error.message, 'err');
      } finally {
        powerInFlight = false;
        updateWorkbenchRequestLock();
      }
    }

    function parseOrderBlocks(message) {
      if (typeof message !== 'string' || !message.trim()) return [];
      const text = message.replace(/\r/g, '').trim();
      const marker = /\n(?=\s*(?:第\s*\d+\s*笔|订单\s*\d+|【\s*订单\s*\d+|已完成：))/g;
      const indexes = [0];
      let match;
      while ((match = marker.exec(text))) indexes.push(match.index + 1);
      indexes.push(text.length);
      const blocks = [];
      for (let index = 0; index < indexes.length - 1; index += 1) {
        const block = text.slice(indexes[index], indexes[index + 1]).trim();
        if (block) blocks.push(block);
      }
      const timePattern = /开始时间\s*[：:]/g;
      if (blocks.length <= 1 && (text.match(timePattern) || []).length > 1) {
        return text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
      }
      return blocks.length ? blocks : [text];
    }

    function parseOrderContext(block, fallback) {
      if (typeof block !== 'string') return null;
      const socketMatch = block.match(/插座\s*[：:]\s*(\d+)\s*[-－]\s*(\d+)/);
      const startMatch = block.match(/开始时间\s*[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
      const endMatch = block.match(/结束时间\s*[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
      const station = socketMatch ? socketMatch[1] : (fallback && fallback.station) || '';
      const sid = socketMatch ? socketMatch[2] : (fallback && fallback.sid) || '';
      if (!station || !sid || !startMatch || !endMatch) return null;
      const startTime = startMatch[1].replace(/\s+/g, ' ');
      const endTime = endMatch[1].replace(/\s+/g, ' ');
      const start = new Date(startTime.replace(/-/g, '/')).getTime();
      const end = new Date(endTime.replace(/-/g, '/')).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return {
        station,
        sid,
        startTime,
        endTime,
        durationMinutes: Math.floor((end - start) / 60000),
      };
    }

    function buildOrderBlocks(message, fallback) {
      return parseOrderBlocks(message).map((text) => ({
        text,
        context: parseOrderContext(text, fallback),
      })).filter((item) => item.context).map((item, index) => Object.assign({ index }, item));
    }

    function clearOrderBlocks() {
      orderBlocks = [];
      if (orderResultList) orderResultList.innerHTML = '';
    }

    function renderOrderBlocks(blocks) {
      orderBlocks = Array.isArray(blocks) ? blocks : [];
      if (!orderResultList) return;
      orderResultList.innerHTML = '';
      orderBlocks.forEach((item) => {
        const block = document.createElement('div');
        block.className = 'order-block';

        const notice = document.createElement('div');
        notice.className = 'notice ok';
        notice.textContent = item.text;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'order-chart-button';
        button.dataset.index = String(item.index);
        button.textContent = '查看充电功率图';
        button.addEventListener('click', () => viewPowerChart(item.index));

        block.appendChild(notice);
        block.appendChild(button);
        orderResultList.appendChild(block);
      });
      updateOrderChartButtons();
    }

    function powerChartCacheKey(context) {
      return [context.station, context.sid, context.startTime, context.endTime, 'v2'].join('|');
    }

    function setPowerChartStatus(status, type) {
      if (!powerChartStatus) return;
      powerChartStatus.textContent = status || '';
      powerChartStatus.className = 'power-chart-status' + (type ? ` ${type}` : '');
      if (powerChartCanvas) powerChartCanvas.classList.remove('show');
      if (powerChartNote) powerChartNote.classList.remove('show');
    }

    function openPowerChart(index) {
      if (!powerChartOverlay) return;
      powerChartOverlay.dataset.index = String(index);
      const wasHidden = !powerChartOverlay.classList.contains('show');
      powerChartOverlay.classList.add('show');
      if (wasHidden) lockPageScroll();
    }

    function closePowerChart(force) {
      if (powerChartInFlight && !force) return;
      if (!powerChartOverlay) return;
      const wasVisible = powerChartOverlay.classList.contains('show');
      powerChartOverlay.classList.remove('show');
      powerChartOverlay.dataset.index = '';
      setPowerChartStatus('', '');
      if (wasVisible) unlockPageScroll();
    }

    function parseChartTime(value) {
      const text = String(value).trim().replace('T', ' ').replace(/-/g, '/');
      const time = new Date(text).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function formatChartTime(value) {
      const text = String(value).replace('T', ' ');
      return text.length >= 16 ? text.slice(11, 16) : text;
    }

    function samplePowerPoints(points, minutes) {
      if (points.length <= 2) return points;
      const interval = minutes * 60000;
      const sampled = [points[0]];
      let lastTime = parseChartTime(points[0].time);
      points.slice(1, -1).forEach((point) => {
        const time = parseChartTime(point.time);
        if (!lastTime || !time || time - lastTime >= interval) {
          sampled.push(point);
          lastTime = time || lastTime;
        }
      });
      sampled.push(points[points.length - 1]);
      return sampled;
    }

    function parsePowerPoints(payload) {
      let source = payload;
      if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch (_) { return []; }
      }
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        source = source.list || source.data || source.rows || source.result || source;
      }
      const points = [];
      const timeKeys = ['date', 'time', 'timestamp', 'dataTime', 'collectTime', 'createTime', 'recordTime', 'dateTime'];
      const powerKeys = ['power', 'value', 'watt', 'watts', 'powerValue', 'electricPower', 'P'];
      const visit = (value) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== 'object') return;
        const timeKey = timeKeys.find((key) => value[key] !== undefined && value[key] !== null && value[key] !== '');
        const powerKey = powerKeys.find((key) => value[key] !== undefined && value[key] !== null && value[key] !== '');
        let time = timeKey ? String(value[timeKey]).trim() : '';
        let power = powerKey ? Number(value[powerKey]) : NaN;
        if (value.chargeInfoString) {
          let chargeInfo = value.chargeInfoString;
          if (typeof chargeInfo === 'string') {
            try { chargeInfo = JSON.parse(chargeInfo); } catch (_) { chargeInfo = null; }
          }
          if (chargeInfo && typeof chargeInfo === 'object' && chargeInfo.P !== undefined && chargeInfo.P !== null && chargeInfo.P !== '') {
            power = Number(chargeInfo.P);
          }
        }
        if (time && Number.isFinite(power)) points.push({ time, power });
        Object.keys(value).forEach((key) => {
          if (key === 'chargeInfoString') return;
          if (value[key] && typeof value[key] === 'object') visit(value[key]);
        });
      };
      visit(source);
      const unique = {};
      const sorted = points.filter((point) => {
        const key = point.time + '|' + point.power;
        if (unique[key]) return false;
        unique[key] = true;
        return true;
      }).sort((left, right) => parseChartTime(left.time) - parseChartTime(right.time));
      return samplePowerPoints(sorted, 20);
    }

    function drawPowerChart(points) {
      if (!powerChartCanvas) return false;
      const context = powerChartCanvas.getContext('2d');
      if (!context) return false;
      const ratio = window.devicePixelRatio || 1;
      const cssWidth = Math.max(280, Math.floor(powerChartCanvas.clientWidth || 480));
      const cssHeight = Math.max(210, Math.round(cssWidth * 0.62));
      powerChartCanvas.width = Math.round(cssWidth * ratio);
      powerChartCanvas.height = Math.round(cssHeight * ratio);
      powerChartCanvas.style.height = cssHeight + 'px';
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);

      const padding = { left: 58, right: 16, top: 16, bottom: 30 };
      const plotWidth = cssWidth - padding.left - padding.right;
      const plotHeight = cssHeight - padding.top - padding.bottom;
      const maxPower = Math.max(100, ...points.map((point) => point.power));
      const x = (index) => padding.left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
      const y = (power) => padding.top + plotHeight - power / maxPower * plotHeight;

      context.font = '12px sans-serif';
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.strokeStyle = '#e1e7ee';
      context.fillStyle = '#526176';
      context.lineWidth = 1;
      for (let index = 0; index <= 4; index += 1) {
        const value = maxPower * index / 4;
        const lineY = y(value);
        context.beginPath();
        context.moveTo(padding.left, lineY);
        context.lineTo(cssWidth - padding.right, lineY);
        context.stroke();
        context.fillText(Math.round(value) + 'W', padding.left - 8, lineY);
      }

      context.textBaseline = 'top';
      const labelIndexes = points.length > 6
        ? [0, Math.floor((points.length - 1) / 2), points.length - 1]
        : points.map((_, index) => index);
      labelIndexes.forEach((index) => {
        if (points.length === 1 || (index > 0 && index < points.length - 1)) context.textAlign = 'center';
        else context.textAlign = index === 0 ? 'left' : 'right';
        context.fillText(formatChartTime(points[index].time), x(index), cssHeight - padding.bottom + 8);
      });

      context.strokeStyle = '#2869aa';
      context.lineWidth = 2;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.beginPath();
      points.forEach((point, index) => {
        if (index) context.lineTo(x(index), y(point.power));
        else context.moveTo(x(index), y(point.power));
      });
      context.stroke();
      context.fillStyle = '#2869aa';
      points.forEach((point, index) => {
        context.beginPath();
        context.arc(x(index), y(point.power), 3, 0, Math.PI * 2);
        context.fill();
      });

      powerChartCanvas.classList.add('show');
      if (powerChartNote) powerChartNote.classList.add('show');
      if (powerChartStatus) {
        powerChartStatus.textContent = '';
        powerChartStatus.className = 'power-chart-status';
      }
      return true;
    }

    async function viewPowerChart(index) {
      if (orderInFlight || powerChartInFlight) return;
      const selected = orderBlocks[index];
      const context = selected && selected.context;
      openPowerChart(index);
      if (!context) {
        setPowerChartStatus('这笔订单缺少有效的开始时间或结束时间，暂时无法生成功率图', 'error');
        return;
      }
      if (context.durationMinutes <= 20) {
        setPowerChartStatus('这笔订单持续时间不足 20 分钟，暂无可用的功率数据图', 'error');
        return;
      }

      const cacheKey = powerChartCacheKey(context);
      if (powerChartCache[cacheKey]) {
        setPowerChartStatus('', '');
        drawPowerChart(powerChartCache[cacheKey]);
        return;
      }

      setPowerChartStatus('正在获取功率数据...', 'loading');
      powerChartInFlight = true;
      updateWorkbenchRequestLock();
      try {
        const payload = await api('/api/order/power-chart', {
          station_num: context.station,
          sid: context.sid,
          startTime: context.startTime,
          endTime: context.endTime,
        });
        const points = parsePowerPoints(payload && (payload.data !== undefined ? payload.data : payload));
        if (!points.length) {
          setPowerChartStatus('当前时间段没有可用的功率数据', 'error');
          return;
        }
        powerChartCache[cacheKey] = points;
        if (!drawPowerChart(points)) {
          setPowerChartStatus('功率图生成失败，请稍后重试', 'error');
        }
      } catch (error) {
        if (error.sessionExpired) {
          closePowerChart(true);
          return;
        }
        setPowerChartStatus(error.message || '功率数据请求失败，请稍后重试', 'error');
      } finally {
        powerChartInFlight = false;
        updateWorkbenchRequestLock();
      }
    }

    async function queryOrderAction() {
      clearFieldErrors();
      if (orderInFlight) {
        setStatus(orderStatus, '订单查询正在处理中，请不要重复点击。', 'err');
        return;
      }
      if (isWorkbenchRequestInFlight()) {
        setStatus(orderStatus, `${getActiveWorkbenchRequestLabel()}进行中，请稍候再查询。`, 'err');
        return;
      }
      if (!validateQueryForm('order')) {
        setStatus(orderStatus, '请先修正查询信息中的数字格式。', 'err');
        return;
      }

      const station_num = fieldGroups.orderStation.input.value.trim();
      const sid = fieldGroups.orderSid.input.value.trim();

      /* 功能2：无论查询成功与否，都记住订单查询的站点号和插座号 */
      saveOrderMemory(station_num, sid);

      clearOrderBlocks();
      closePowerChart();
      setStatus(orderStatus, '正在查询订单...');
      orderInFlight = true;
      updateWorkbenchRequestLock();
      try {
        const result = await api('/api/order', { station_num, sid });
        const blocks = buildOrderBlocks(result.message || '', { station: station_num, sid });
        if (blocks.length) {
          orderStatus.className = 'notice hidden';
          orderStatus.textContent = '';
          renderOrderBlocks(blocks);
        } else {
          setStatus(orderStatus, result.message || '暂无订单数据', 'ok');
        }
      } catch (error) {
        if (error.sessionExpired) return;
        clearOrderBlocks();
        setStatus(orderStatus, error.message, 'err');
      } finally {
        orderInFlight = false;
        updateWorkbenchRequestLock();
      }
    }

    /* ===== 功能1：充电付款提醒弹窗 ===== */
    const payOverlay = document.getElementById('pay-reminder-overlay');
    const payModalSid = document.getElementById('pay-modal-sid');
    const payModalAmount = document.getElementById('pay-modal-amount');
    const payModalClose = document.getElementById('pay-modal-close');
    const chargeWarningOverlay = document.getElementById('charge-warning-overlay');
    const chargeWarningMessage = document.getElementById('charge-warning-message');
    const chargeWarningCancel = document.getElementById('charge-warning-cancel');
    const chargeWarningContinue = document.getElementById('charge-warning-continue');
    let chargeWarningResolve = null;
    let payModalCooldownTimer = null;
    let payModalCountdownInterval = null;

    const payModalDefaultText = '已付款，已备注插座号';

    function setPayModalButtonState(disabled, text) {
      payModalClose.disabled = disabled;
      payModalClose.textContent = text;
    }

    function clearPayModalCooldown() {
      if (payModalCooldownTimer) {
        clearTimeout(payModalCooldownTimer);
        payModalCooldownTimer = null;
      }
      if (payModalCountdownInterval) {
        clearInterval(payModalCountdownInterval);
        payModalCountdownInterval = null;
      }
    }

    function showPayReminder(station, sid, amount) {
      clearPayModalCooldown();
      payModalSid.textContent = station + '-' + sid;
      payModalAmount.textContent = (Number(amount) + 0.4).toFixed(1);
      setPayModalButtonState(true, payModalDefaultText + '（3s）');
      const wasHidden = !payOverlay.classList.contains('show');
      payOverlay.classList.add('show');
      if (wasHidden) lockPageScroll();

      let remainingSeconds = 3;
      payModalCountdownInterval = window.setInterval(function () {
        remainingSeconds -= 1;
        if (remainingSeconds > 0) {
          setPayModalButtonState(true, payModalDefaultText + '（' + remainingSeconds + 's）');
          return;
        }
        clearPayModalCooldown();
        setPayModalButtonState(false, payModalDefaultText);
      }, 1000);

      payModalCooldownTimer = window.setTimeout(function () {
        clearPayModalCooldown();
        setPayModalButtonState(false, payModalDefaultText);
      }, 3000);
    }

    function closePayReminder() {
      clearPayModalCooldown();
      setPayModalButtonState(false, payModalDefaultText);
      if (!payOverlay.classList.contains('show')) return;
      payOverlay.classList.remove('show');
      unlockPageScroll();
    }

    payModalClose.addEventListener('click', closePayReminder);
    bindTapToClose(payOverlay, closePayReminder);

    function getChargeWarningMessage(station, sid) {
      if (station === '11' && (sid === '7' || sid === '4')) {
        return '11-7和11-4插座是反的，并且大概率都坏了，不知道是否修复，输入4不行就换成7，都不行再换。但不建议充这两个插座。是否继续？';
      }
      if (station === '18' && (sid === '5' || sid === '6')) {
        return '18-5和18-6插座是反的，不知道是否修复，输入5不行就换成6，都不行再换。但不建议充这两个插座。是否继续？';
      }
      if (station === '3' && (sid === '1' || sid === '10')) {
        return '3-1和3-10插座是反的，不知道是否修复，输入1不行就换成10，都不行再换。但不建议充这两个插座。是否继续？';
      }
      if ((station === '5' && sid === '8') || (station === '31' && sid === '3')) {
        return '这个插座99%是坏的，是否继续？';
      }
      return '';
    }

    function confirmChargeWarning(message) {
      if (!chargeWarningOverlay || !chargeWarningMessage) {
        return Promise.resolve(window.confirm(message));
      }
      chargeWarningOpen = true;
      chargeWarningMessage.textContent = message;
      chargeWarningOverlay.classList.add('show');
      return new Promise((resolve) => {
        chargeWarningResolve = resolve;
      });
    }

    function closeChargeWarning(shouldContinue) {
      if (chargeWarningOverlay) {
        chargeWarningOverlay.classList.remove('show');
      }
      chargeWarningOpen = false;
      if (chargeWarningResolve) {
        chargeWarningResolve(shouldContinue);
        chargeWarningResolve = null;
      }
    }

    if (chargeWarningCancel) {
      chargeWarningCancel.addEventListener('click', () => closeChargeWarning(false));
    }
    if (chargeWarningContinue) {
      chargeWarningContinue.addEventListener('click', () => closeChargeWarning(true));
    }
    if (chargeWarningOverlay) {
      chargeWarningOverlay.addEventListener('click', function (e) {
        if (e.target === chargeWarningOverlay) closeChargeWarning(false);
      });
    }

    function showRegisterCheck() {
      if (!registerCheckOverlay) return;
      registerCheckOverlay.classList.add('show');
    }

    function closeRegisterCheck() {
      if (!registerCheckOverlay) return;
      registerCheckOverlay.classList.remove('show');
    }

    const registerCheckClose = document.getElementById('register-check-close');
    if (registerCheckClose) {
      registerCheckClose.addEventListener('click', closeRegisterCheck);
    }
    if (registerCheckOverlay) {
      registerCheckOverlay.addEventListener('click', function (e) {
        if (e.target === registerCheckOverlay) closeRegisterCheck();
      });
    }
    if (registerCheckCopy) {
      registerCheckCopy.addEventListener('click', function() {
        navigator.clipboard.writeText('1944505795').then(function() {
          registerCheckCopy.textContent = '已复制';
          setTimeout(function() { registerCheckCopy.textContent = '复制'; }, 1500);
        });
      });
    }

    /* ===== 充电教学图片预览 ===== */
    const teachPreviewOverlay = document.getElementById('teach-preview-overlay');
    const teachPreviewImage = document.getElementById('teach-preview-image');
    const teachPreviewClose = document.getElementById('teach-preview-close');

    function showTeachPreview(src) {
      if (!teachPreviewOverlay || !teachPreviewImage || !src) return;
      teachPreviewImage.src = src;
      teachPreviewOverlay.classList.add('show');
    }

    function closeTeachPreview() {
      if (!teachPreviewOverlay || !teachPreviewImage) return;
      teachPreviewOverlay.classList.remove('show');
      teachPreviewImage.removeAttribute('src');
    }

    document.querySelectorAll('[data-teach-image]').forEach((button) => {
      button.addEventListener('click', function () {
        showTeachPreview(button.dataset.teachImage);
      });
    });
    if (teachPreviewClose) {
      teachPreviewClose.addEventListener('click', closeTeachPreview);
    }
    if (teachPreviewOverlay) {
      teachPreviewOverlay.addEventListener('click', function (e) {
        if (e.target === teachPreviewOverlay) closeTeachPreview();
      });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (teachPreviewOverlay && teachPreviewOverlay.classList.contains('show')) {
        closeTeachPreview();
      }
    });

    /* ===== 功能2：站点号/插座号 三表独立记忆与复用 ===== */
    var CHARGE_MEMORY_KEY = 'charge-last-sid';
    var POWER_MEMORY_KEY = 'power-last-sid';
    var ORDER_MEMORY_KEY = 'order-last-sid';

    function saveMemory(key, station, sid) {
      try {
        localStorage.setItem(key, JSON.stringify({ station: station, sid: sid }));
      } catch (_) { /* ignore */ }
    }

    function restoreMemory(key) {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (_) { return null; }
    }

    /* 充电记忆优先级最高：充电提交时（无论成败）同步覆盖功率和订单的记忆。
       功率/订单随后可单独修改、单独记忆，直到下一次充电提交将其覆盖。 */
    function saveChargeMemory(station, sid) {
      saveMemory(CHARGE_MEMORY_KEY, station, sid);
      saveMemory(POWER_MEMORY_KEY, station, sid);
      saveMemory(ORDER_MEMORY_KEY, station, sid);
    }
    function savePowerMemory(station, sid) { saveMemory(POWER_MEMORY_KEY, station, sid); }
    function saveOrderMemory(station, sid) { saveMemory(ORDER_MEMORY_KEY, station, sid); }

    /* 回填：仅当表单为空时回填，避免覆盖用户正在输入的内容 */
    function fillFromMemory(key, stationField, sidField) {
      var mem = restoreMemory(key);
      if (!mem) return;
      if (!stationField.value.trim() && !sidField.value.trim()) {
        stationField.value = mem.station || '';
        sidField.value = mem.sid || '';
      }
    }

    function fillChargeFromMemory() {
      fillFromMemory(CHARGE_MEMORY_KEY, fieldGroups.chargeStation.input, fieldGroups.chargeSid.input);
    }

    function fillPowerFromMemory() {
      fillFromMemory(POWER_MEMORY_KEY, fieldGroups.powerStation.input, fieldGroups.powerSid.input);
    }

    function fillOrderFromMemory() {
      fillFromMemory(ORDER_MEMORY_KEY, fieldGroups.orderStation.input, fieldGroups.orderSid.input);
    }

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', function () {
        if (tab.disabled) return;
        const switched = switchTab(tab.dataset.tab);
        if (!switched) return;
        if (tab.dataset.tab === 'charge') fillChargeFromMemory();
        if (tab.dataset.tab === 'power') fillPowerFromMemory();
        if (tab.dataset.tab === 'order') fillOrderFromMemory();
      });
    });

    idleButtons.forEach((button) => {
      button.addEventListener('click', function () {
        if (button.disabled) return;
        switchIdleBuilding(button.dataset.idleBuilding);
      });
    });

    if (idleQueryBtn) {
      idleQueryBtn.addEventListener('click', queryIdleSockets);
    }

    if (idleMapBtn) {
      idleMapBtn.addEventListener('click', openIdleMapPage);
    }

    if (mapModeOpenBtn) {
      mapModeOpenBtn.addEventListener('click', openPublicMapPage);
    }

    if (idleResultList) {
      idleResultList.addEventListener('click', function (event) {
        const summary = event.target.closest('.idle-site-summary');
        if (!summary) return;
        const card = summary.closest('.idle-site-card');
        if (card) toggleIdleSite(card);
      });
    }

    verifyBtn.addEventListener('click', handleAuth);
    resetBtn.addEventListener('click', function () {
      try { localStorage.removeItem(CHARGE_MEMORY_KEY); } catch (_) { /* ignore */ }
      try { localStorage.removeItem(POWER_MEMORY_KEY); } catch (_) { /* ignore */ }
      try { localStorage.removeItem(ORDER_MEMORY_KEY); } catch (_) { /* ignore */ }
      resetAll();
    });
    themeToggle.addEventListener('click', toggleTheme);
    chargeBtn.addEventListener('click', startCharge);
    powerBtn.addEventListener('click', queryPowerAction);
    orderBtn.addEventListener('click', queryOrderAction);

    if (powerChartClose) {
      powerChartClose.addEventListener('click', closePowerChart);
    }
    bindTapToClose(powerChartOverlay, () => closePowerChart());

    fieldGroups.phone.input.addEventListener('input', () => setFieldError(fieldGroups.phone, ''));
    fieldGroups.password.input.addEventListener('input', () => setFieldError(fieldGroups.password, ''));
    fieldGroups.confirmPassword.input.addEventListener('input', () => setFieldError(fieldGroups.confirmPassword, ''));
    Object.values(fieldGroups).forEach((group) => {
      group.input.addEventListener('blur', () => {
        if (group === fieldGroups.phone) {
          validatePhone();
          return;
        }
        if (group === fieldGroups.password) {
          if (group.input.value.trim()) validatePassword();
          return;
        }
        if (group === fieldGroups.confirmPassword) {
          if (group.input.value.trim()) validateConfirmPassword();
          return;
        }
        if (group === fieldGroups.chargeAmount) {
          validateDigitsField(group, '金额');
          const amount = Number(group.input.value.trim());
          if (group.input.value.trim() && isDigits(group.input.value.trim()) && (!Number.isInteger(amount) || amount < 1 || amount > 4)) {
            setFieldError(group, '金额只能是 1 到 4 的整数');
          }
          return;
        }
        if (group.input.value.trim()) {
          validateDigitsField(group, group === fieldGroups.phone ? '手机号' : (group === fieldGroups.chargeAmount ? '金额' : '输入项'));
        }
      });
    });

    document.getElementById('phone').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleAuth();
    });

    document.getElementById('password').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleAuth();
    });

    document.getElementById('confirm-password').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleAuth();
    });

    /* ===== 密码显示/隐藏切换 ===== */
    const eyeShowSVG = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>';
    const eyeHideSVG = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/>';
    document.getElementById('toggle-pwd').addEventListener('click', function() {
      const pwdInput = document.getElementById('password');
      const eyeIcon = document.getElementById('eye-icon');
      const isHidden = pwdInput.type === 'password';
      pwdInput.type = isHidden ? 'text' : 'password';
      eyeIcon.innerHTML = isHidden ? eyeHideSVG : eyeShowSVG;
      this.title = isHidden ? '隐藏密码' : '显示密码';
    });
    document.getElementById('toggle-pwd2').addEventListener('click', function() {
      const pwdInput = document.getElementById('confirm-password');
      const eyeIcon = document.getElementById('eye-icon2');
      const isHidden = pwdInput.type === 'password';
      pwdInput.type = isHidden ? 'text' : 'password';
      eyeIcon.innerHTML = isHidden ? eyeHideSVG : eyeShowSVG;
      this.title = isHidden ? '隐藏密码' : '显示密码';
    });

    window.setInterval(updateChargeButtonState, 250);
    window.setInterval(updateVerifyButtonState, 250);
    window.setInterval(updateIdleQueryButtonState, 250);

    try {
      const savedTheme = window.localStorage.getItem('charge-theme');
      applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
    } catch (_) {
      applyTheme('light');
    }

    /* 从地图页返回：恢复进入地图前的页面状态（空闲插座 tab + 楼栋） */
    let restoredReturnState = null;
    try {
      const savedReturn = sessionStorage.getItem('charge-map-return');
      if (savedReturn) {
        sessionStorage.removeItem('charge-map-return');
        restoredReturnState = JSON.parse(savedReturn);
      }
    } catch (_) { /* ignore */ }

    const initialIdleBuilding = restoredReturnState && restoredReturnState.tab === 'idle' && restoredReturnState.building
      ? restoredReturnState.building
      : '20栋';
    const initialMapModeBuilding = restoredReturnState && restoredReturnState.tab === 'map' && restoredReturnState.building
      ? restoredReturnState.building
      : '20栋';

    switchIdleBuilding(initialIdleBuilding);
    setMapMode(initialMapModeBuilding);

    if (restoredReturnState && restoredReturnState.tab === 'idle') {
      switchTab('idle', { force: true });
      if (restoredReturnState.building) switchIdleBuilding(restoredReturnState.building);
      try {
        const savedScrollY = Number(sessionStorage.getItem('charge-map-scroll-y'));
        if (Number.isFinite(savedScrollY) && savedScrollY >= 0) {
          window.requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
        }
      } catch (_) { /* ignore */ }
    }

    if (restoredReturnState && restoredReturnState.tab === 'map') {
      authMode = 'map';
      showMapMode();
      try {
        const savedScrollY = Number(sessionStorage.getItem('charge-map-scroll-y'));
        if (Number.isFinite(savedScrollY) && savedScrollY >= 0) {
          window.requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
        }
      } catch (_) { /* ignore */ }
    }

    /* ===== 功能3：服务器健康检测 ===== */
    async function checkServerHealth() {
      serverDot.className = 'status-dot checking';
      serverText.className = 'status-text checking';
      serverText.textContent = '正在检测...';

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${API_BASE}/api/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          serverDot.className = 'status-dot online';
          serverText.className = 'status-text online';
          serverText.textContent = '服务器正常';
        } else {
          serverDot.className = 'status-dot offline';
          serverText.className = 'status-text offline';
          serverText.textContent = '服务器异常';
        }
      } catch (_) {
        serverDot.className = 'status-dot offline';
        serverText.className = 'status-text offline';
        serverText.textContent = '服务器异常';
      }
    }

    /* ===== 登录/注册模式切换 ===== */
    function toggleConfirmPasswordField(show) {
      document.getElementById('confirm-password-field').classList.toggle('hidden', !show);
    }

    document.querySelectorAll('.mode-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        authMode = tab.dataset.mode;
        document.querySelectorAll('.mode-tab').forEach(function(t) {
          t.classList.toggle('active', t.dataset.mode === authMode);
        });
        if (authMode === 'map') {
          showMapMode();
          return;
        }
        hideMapMode();
        verifyBtn.textContent = authMode === 'login' ? '登录' : '注册';
        setVerifyStatus(authMode === 'login' ? '未注册请先注册并联系管理员审核通过。' : '请输入手机号和密码注册。');
        toggleConfirmPasswordField(authMode === 'register');
        clearFieldErrors();
      });
    });

    mapModeTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        setMapMode(tab.dataset.mapMode);
      });
    });

    /* ===== 自动登录 ===== */
    async function tryAutoLogin() {
      setStatus(verifyStatus, '正在校验登录状态...');
      const phone = await validateToken();
      if (!phone) {
        clearAuthSession();
        return false;
      }

      // token有效，进入工作台。自动登录（如刷新页面）不清除记忆，保留站点号/插座号以便回填。
      setLoggedInUI(phone);
      setStatus(verifyStatus, `欢迎回来，${phone} 账号已自动登录。`, 'ok');
      return true;
    }

    (async function init() {
      try {
        if (restoredReturnState && restoredReturnState.tab === 'map') {
          fillLoginCredentials();
          return;
        }

        if (restoredReturnState && restoredReturnState.tab === 'idle') {
          const session = loadAuthSession();
          if (session && session.phone) {
            setLoggedInUI(session.phone);
            serverStatus.classList.remove('hidden');
            checkServerHealth();
            fillChargeFromMemory();
          } else {
            resetAll();
            fillLoginCredentials();
          }
          return;
        }

        const session = loadAuthSession();
        if (!session) {
          resetAll();
          fillLoginCredentials();
          return;
        }

        const loggedIn = await tryAutoLogin();
        if (!loggedIn) {
          resetAll();
          fillLoginCredentials();
        } else {
          serverStatus.classList.remove('hidden');
          checkServerHealth();
          // 自动登录不清除记忆，回填上次的站点号/插座号，无需重新输入
          fillChargeFromMemory();
        }
      } finally {
        document.documentElement.classList.remove('restoring-map-return');
      }
    })();

    /* ===== 返回登录按钮 ===== */
    document.getElementById('logout-btn').addEventListener('click', async function() {
      var logoutBtn = this;
      logoutBtn.disabled = true;
      try {
        await api('/api/logout', {});
      } catch (_) {
        /* 即使后端请求失败，前端也继续登出 */
      }
      resetAll();
      fillLoginCredentials();
      logoutBtn.disabled = false;
    });

    document.getElementById('copy-wx-btn').addEventListener('click', function() {
      const text = document.getElementById('wx-id').textContent;
      navigator.clipboard.writeText(text).then(function() {
        const btn = document.getElementById('copy-wx-btn');
        btn.textContent = '已复制';
        setTimeout(function() { btn.textContent = '复制'; }, 1500);
      });
    });
