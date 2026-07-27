/**
 * 스토리지 모듈 (MES API → MariaDB)
 * 운영 데이터는 MariaDB만 사용. IndexedDB 폴백/백업 없음.
 * NAS는 사진·백업 파일 저장소 역할만 (api-server 경유).
 */

const Storage = (function() {
  /** false: IndexedDB 읽기/쓰기/백업 전부 비활성 (MariaDB API 필수) */
  const USE_INDEXEDDB = false;

  let cache = {};
  let initialized = false;
  let offlineMode = false;   // 세션 중 API 쓰기 실패 시 true (조회만 가능)

  // ── 스토어 준비 상태 추적 ────────────────────────────────────────────
  // 어떤 스토어가 API(원격)로부터 최소 1회 로드되었는지 기록
  //   - 원격 성공(데이터 유무 무관) → ready
  //   - 예외/네트워크 실패로 데이터를 못 받고 캐시도 비어있음 → NOT ready
  const _readyStores = new Set();
  function _markStoreReady(storeName) {
    if (storeName) _readyStores.add(storeName);
  }
  function isStoreReady(storeName) {
    return _readyStores.has(storeName);
  }
  function areStoresReady(storeNames) {
    return (Array.isArray(storeNames) ? storeNames : [storeNames])
      .filter(Boolean)
      .every(s => _readyStores.has(s));
  }

  // ── 불량 유형(defect_types) 쓰기 가드 ─────────────────────────────
  // 관리/설정(SettingsModule)에서만 변경 허용. 그 외 경로는 Storage 레벨에서 차단.
  let _defectTypesWriteDepth = 0;

  function _isDefectTypesStore(storeName) {
    return storeName === STORES.DEFECT_TYPES;
  }

  function _assertDefectTypesWritable(storeName) {
    if (_isDefectTypesStore(storeName) && _defectTypesWriteDepth <= 0) {
      const err = new Error('불량 유형은 관리/설정 > 불량 유형에서만 등록·수정·삭제할 수 있습니다.');
      console.error('[Storage] defect_types 쓰기 차단', err);
      throw err;
    }
  }

  async function runWithDefectTypesWrite(fn) {
    _defectTypesWriteDepth += 1;
    try {
      return await fn();
    } finally {
      _defectTypesWriteDepth -= 1;
    }
  }

  // DB.STORES 참조 (모든 스토어 이름 공유)
  const STORES = DB.STORES;

  // ── 캐시 워밍 이벤트 (대시보드/페이지 재렌더 트리거용) ────────────────
  const _cacheWarmListeners = new Set();
  function _emitCacheWarm(storeName, meta) {
    try {
      _cacheWarmListeners.forEach(fn => {
        try { fn(storeName, meta || {}); } catch (e) {}
      });
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('storage:cacheWarm', {
          detail: { storeName, ...(meta || {}) }
        }));
      }
    } catch (e) {}
  }

  function onCacheWarm(listener) {
    if (typeof listener !== 'function') return () => {};
    _cacheWarmListeners.add(listener);
    return () => _cacheWarmListeners.delete(listener);
  }

  // ── idle 스케줄러 (requestIdleCallback 없으면 setTimeout) ────────────
  function _scheduleIdle(fn, timeoutMs) {
    const t = Number(timeoutMs) || 1500;
    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        return window.requestIdleCallback(fn, { timeout: t });
      }
    } catch (e) {}
    return setTimeout(() => fn({ timeRemaining: () => 0, didTimeout: true }), 0);
  }

  // 모든 스토어에 대해 cache[store]=[] 기본값 보장
  function _ensureCacheDefaults() {
    const storeList = Object.values(STORES).filter(s => s !== 'config');
    storeList.forEach(name => { if (!Array.isArray(cache[name])) cache[name] = []; });
  }

  // 대시보드 첫 화면 우선 로드 스토어 (필요 최소)
  // - v19 마이그레이션을 위해 PRODUCTS/INJECTION_MATERIALS/INJECTION_INVENTORY/PRODUCTION_PLANS 포함
  const DEFAULT_PRIORITY_STORES = [
    STORES.PRODUCTS,
    STORES.PRODUCTION_PLANS,
    STORES.INJECTION_MATERIALS,
    STORES.INJECTION_INVENTORY,
    STORES.INJECTION_INSPECTIONS,
    STORES.PAINTING_INCOMING,
    STORES.PAINTING_INPUT_INVENTORY,
    STORES.PAINTING_WORK,
    STORES.LASER_WORK_LOG,   // 레이저 대기품 재고(도장입고−레이저출고) 계산에 필수
    STORES.PAINTING_INSPECTIONS,
    STORES.SHIPPING_STANDBY,
    STORES.PRODUCT_INVENTORY,
    STORES.PRODUCT_OUTGOING,
  ].filter(Boolean);

  function _uniqueStores(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(s => s && !seen.has(s) && (seen.add(s), true));
  }

  // 초기화: MES API(MariaDB) 연결 필수 — file://·http 모두 동일 경로
  async function init() {
    _ensureCacheDefaults();

    try {
      await ApiClient.init();
      offlineMode = false;
      await loadPriorityToCache(DEFAULT_PRIORITY_STORES, { useRemote: true });
      await _runSchemaMigration();
      initialized = true;
      warmRemainingStoresAsync(_getRemainingStores(DEFAULT_PRIORITY_STORES), { useRemote: true });
      console.log('✅ 스토리지 초기화 완료 (MariaDB API)');
    } catch (apiError) {
      console.error('❌ MES API 서버 연결 실패:', apiError.message);
      const err = new Error(apiError.message);
      err.isApiError = true;
      err.isNasError = true; // app.js 호환
      err.apiError = apiError;
      throw err;
    }
  }

  function _getAllStoreList() {
    return Object.values(STORES).filter(s => s !== 'config');
  }

  function _getRemainingStores(priorityStores) {
    const all = _getAllStoreList();
    const pri = new Set(_uniqueStores(priorityStores));
    return all.filter(s => !pri.has(s));
  }

  // ── NAS 연결 불가 전용 상단 배너 ─────────────────────────────────
  // 일반 에러/토스트와 다른 색상·위치로 NAS 문제임을 명확히 표시
  function _showNasDisconnectedBanner(detailMsg) {
    // 이미 배너 있으면 스킵
    if (document.getElementById('nasDisconnectBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'nasDisconnectBanner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: linear-gradient(90deg, #ff6b35 0%, #f7931e 100%);
      color: #fff; padding: 10px 20px;
      font-size: 0.9rem; font-weight: 500;
      display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: 'Inter', sans-serif;
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <span class="material-symbols-outlined" style="font-size:22px;">cloud_off</span>
        <div style="display:flex;flex-direction:column;line-height:1.3;min-width:0;">
          <strong style="font-size:0.95rem;">MES API 서버 연결 불가</strong>
          <span style="font-size:0.78rem;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            MariaDB에 연결할 수 없습니다 · 저장 불가 · 서버 복구 후 새로고침하세요
          </span>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <button id="nasReconnectBtn" style="
          background: rgba(255,255,255,0.25); color:#fff; border:1px solid rgba(255,255,255,0.4);
          padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:500;
          display:flex;align-items:center;gap:4px;font-size:0.85rem;
        ">
          <span class="material-symbols-outlined" style="font-size:18px;">refresh</span>
          재연결 시도
        </button>
        <button id="nasBannerCloseBtn" style="
          background:transparent;color:#fff;border:none;cursor:pointer;
          padding:4px 8px;display:flex;align-items:center;
        " title="배너 숨기기">
          <span class="material-symbols-outlined" style="font-size:20px;">close</span>
        </button>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);

    // 메인 영역을 배너 높이만큼 밀어내기
    const bannerH = banner.offsetHeight;
    document.body.style.paddingTop = bannerH + 'px';

    // 재연결 버튼 → 페이지 새로고침 (가장 안전한 재연결 방법)
    document.getElementById('nasReconnectBtn').onclick = () => location.reload();

    // 닫기 버튼 → 배너만 숨김 (오프라인 모드 유지)
    document.getElementById('nasBannerCloseBtn').onclick = () => {
      banner.remove();
      document.body.style.paddingTop = '';
    };

    console.warn('[NAS Disconnect] 상단 배너 표시:', detailMsg);
  }

  async function _loadOneStoreToCache(storeName, { useRemote }) {
    try {
      if (!storeName) return [];
      if (!Array.isArray(cache[storeName])) cache[storeName] = [];

      if (!useRemote) {
        _markStoreReady(storeName);
        return cache[storeName];
      }

      const remoteItems = await ApiClient.getAll(storeName);
      if (Array.isArray(remoteItems) && remoteItems.length > 0) {
        cache[storeName] = remoteItems;
        _markStoreReady(storeName);
        return remoteItems;
      }

      // ── 방어 가드: "의심스러운 빈 응답" ─────────────────────────────
      // 원격이 빈 배열([])을 돌려주지만 메모리 캐시에 이미 데이터가 있는 경우
      // → 서버/쿼리 일시 오류일 가능성이 높다. 캐시를 []로 덮어쓰지 않는다.
      if (Array.isArray(cache[storeName]) && cache[storeName].length > 0) {
        console.warn(
          `[Storage][anomaly] 원격이 비어있으나 캐시에 ${cache[storeName].length}건 존재 → ` +
          `기존 데이터 유지(의심스러운 빈 응답 방어): ${storeName}`
        );
        _markStoreReady(storeName);
        _emitCacheWarm(storeName, { phase: 'suspiciousEmptyGuarded', kept: cache[storeName].length });
        return cache[storeName];
      }

      cache[storeName] = [];
      _markStoreReady(storeName);
      return cache[storeName];
    } catch (e) {
      // 예외(네트워크/서버 오류)로 데이터를 받지 못함.
      // 기존 캐시가 있으면 그대로 유지(절대 비우지 않음). 없으면 [] 기본값만 둔다.
      // 캐시가 비어있는 상태로 실패한 경우 ready로 표시하지 않아, UI가 "0"이 아닌
      // "로딩/오류" 상태를 보여줄 수 있게 한다.
      console.warn(`[Storage] ${_loadOneStoreToCache.name} failed for ${storeName}:`, e);
      if (!Array.isArray(cache[storeName])) cache[storeName] = [];
      if (cache[storeName].length > 0) _markStoreReady(storeName);
      return cache[storeName];
    }
  }

  // 우선 스토어 캐시 로드 (init에서 await)
  async function loadPriorityToCache(priorityStores, { useRemote } = {}) {
    const list = _uniqueStores(priorityStores);
    if (!list.length) return;
    console.debug('[Storage] priority preload:', list.length);
    await Promise.allSettled(list.map(storeName => _loadOneStoreToCache(storeName, { useRemote })));
    list.forEach(storeName => _emitCacheWarm(storeName, { phase: 'priority' }));
  }

  // 나머지 스토어 백그라운드 워밍 (init에서 non-await)
  function warmRemainingStoresAsync(remainingStores, { useRemote } = {}) {
    const list = _uniqueStores(remainingStores);
    if (!list.length) return;

    console.debug('[Storage] background warm scheduled:', list.length);

    let idx = 0;
    const total = list.length;

    const pump = async (deadline) => {
      const hasBudget = () => {
        try { return deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() > 6; }
        catch (e) { return false; }
      };

      // requestIdleCallback budget 내에서 여러 개 처리, 없으면 1개씩 쪼개기
      let processed = 0;
      while (idx < total && (hasBudget() || processed === 0)) {
        const storeName = list[idx++];
        await _loadOneStoreToCache(storeName, { useRemote });
        _emitCacheWarm(storeName, { phase: 'background', index: idx, total });
        processed++;
      }

      if (idx < total) {
        _scheduleIdle(pump, 1500);
      } else {
        console.debug('[Storage] background warm done');
        _emitCacheWarm('*', { phase: 'done', total });
      }
    };

    _scheduleIdle(pump, 1500);
  }

  // 모든 스토어 캐시 로드 (API) — refresh(full) 용 (await)
  async function loadAllToCache({ useRemote } = {}) {
    const storeList = _getAllStoreList();
    await Promise.allSettled(storeList.map(storeName => _loadOneStoreToCache(storeName, { useRemote })));
    storeList.forEach(storeName => _emitCacheWarm(storeName, { phase: 'full' }));
  }

  function _setOfflineAfterWriteFailure(err) {
    offlineMode = true;
    if (typeof document !== 'undefined' && document.body) {
      setTimeout(() => _showNasDisconnectedBanner(err.message || String(err)), 0);
    }
  }

  function _isRemoteWriteFailure(err) {
    return /API|NAS|fetch|Failed to fetch|서버|연결|timeout|Network|AbortError/i.test(err && err.message ? err.message : String(err));
  }

  function _offlineWriteError() {
    return new Error('MES API 서버가 연결되지 않아 저장할 수 없습니다. 서버 연결 후 새로고침하고 다시 저장하세요.');
  }

  function _assertWritable() {
    if (!offlineMode) return;
    const err = _offlineWriteError();
    if (typeof UIUtils !== 'undefined' && UIUtils.toast) {
      UIUtils.toast(err.message, 'warning');
    }
    throw err;
  }

  // ── v19 스키마 마이그레이션 ────────────────────────────────────────────
  // 기존 텍스트 기반 매칭 데이터에 ID 기반 참조 필드를 자동으로 채움 (1회 실행)
  //   injection_materials  → productIds[]   (mfgProductName/2 텍스트 → products.id 배열)
  //   injection_inventory  → injMaterialId  (partName 텍스트 → injection_materials.id)
  //   production_plans     → productId      (partName+carModel 텍스트 → products.id)
  async function _runSchemaMigration() {
    // ★ 1회 플래그 제거 — 매 시작 시 미처리 레코드만 선별해서 실행
    //   (mat.productIds 비어있음, inv.injMaterialId 없음, plan.productId 없음 → 처리 대상)
    try {
      const products = cache[STORES.PRODUCTS]            || [];
      const injMats  = cache[STORES.INJECTION_MATERIALS] || [];
      const injInv   = cache[STORES.INJECTION_INVENTORY] || [];
      const plans    = cache[STORES.PRODUCTION_PLANS]    || [];

      // 미처리 레코드 수 확인 (없으면 스킵)
      // ★ productIds=undefined/null 인 것만 처리 (=[] 는 이미 시도 완료 → 재처리 방지)
      const needMats  = injMats.filter(m => m.productIds === undefined || m.productIds === null);
      const needInv   = injInv.filter(i => !i.injMaterialId);
      const needPlans = plans.filter(p => !p.productId);
      if (needMats.length === 0 && needInv.length === 0 && needPlans.length === 0) return;

      console.log(`[Migration v19] 시작 — 사출자재 ${needMats.length}건, 창고 ${needInv.length}건, 계획 ${needPlans.length}건 처리`);

      // ① injection_materials: mfgProductName/2 텍스트 → productIds[]
      //    carModel 일치 우선, 없으면 carModel 무관으로 Fallback
      //    ★ "[XX]" 접미 차종 코드 제거 후 재시도 (예: "ABC [BB]" → "ABC", carModel="BB")
      for (const mat of needMats) {
        const _matchProd = (name) => {
          if (!name || !name.trim()) return null;
          const t = name.trim();
          // ① 정확 일치 (carModel 포함 → 없으면 무관)
          let hit = products.find(p => p.partName && p.partName.trim() === t && p.carModel === mat.carModel)
                 || products.find(p => p.partName && p.partName.trim() === t);
          if (hit) return hit;
          // ② 말미 [XX] 차종 코드 제거 후 재시도 (예: "파트명[BB]" → "파트명")
          const stripped = t.replace(/\s*\[[^\]]{1,6}\]\s*$/, '').trim();
          if (stripped && stripped !== t) {
            const mCode = (t.match(/\[([^\]]{1,6})\]\s*$/) || [])[1] || '';
            hit = (mCode && products.find(p => p.partName && p.partName.trim() === stripped && p.carModel === mCode))
               || products.find(p => p.partName && p.partName.trim() === stripped && p.carModel === mat.carModel)
               || products.find(p => p.partName && p.partName.trim() === stripped);
          }
          return hit || null;
        };
        const ids = [];
        const p1 = _matchProd(mat.mfgProductName);
        const p2 = _matchProd(mat.mfgProductName2);
        if (p1) ids.push(p1.id);
        if (p2 && !ids.includes(p2.id)) ids.push(p2.id);
        // 매칭 성공 여부와 무관하게 productIds 저장
        //   ids=[]  → "시도 완료, 매칭 없음" 표시 → 다음 시작 시 재처리 안 함
        //   ids=[…] → 정상 연결
        await update(STORES.INJECTION_MATERIALS, mat.id, { productIds: ids });
      }

      // ② injection_inventory: partName(=injPartName) → injMaterialId
      //    ★ 캐시 최신화 후 참조 (① 에서 update했으므로)
      const freshMats = cache[STORES.INJECTION_MATERIALS] || [];
      for (const inv of needInv) {
        const mat = freshMats.find(m =>
          (m.injPartName || '').trim() === (inv.partName || '').trim() &&
          m.carModel === inv.carModel
        ) || freshMats.find(m =>
          (m.injPartName || '').trim() === (inv.partName || '').trim()
        );
        if (mat) {
          await update(STORES.INJECTION_INVENTORY, inv.id, { injMaterialId: mat.id });
        }
      }

      // ③ production_plans: partName+carModel → productId
      for (const plan of needPlans) {
        const t = (plan.partName || '').trim();
        const prod =
          products.find(p => p.partName && p.partName.trim() === t &&
            p.carModel === plan.carModel && p.color === plan.color) ||
          products.find(p => p.partName && p.partName.trim() === t &&
            p.carModel === plan.carModel) ||
          products.find(p => p.partName && p.partName.trim() === t);
        if (prod) {
          await update(STORES.PRODUCTION_PLANS, plan.id, { productId: prod.id });
        }
      }

      const done = needMats.length + needInv.length + needPlans.length;
      console.log(`[Migration v19] 완료 ✅ (${done}건 처리)`);
    } catch (e) {
      console.error('[Migration v19] 실패 (무시하고 계속):', e);
    }
  }

  // 오프라인 모드 여부 (세션 중 API 쓰기 실패 시 true — init 실패와 별개)
  function isOffline() {
    return offlineMode;
  }

  // 전체 조회 (캐시에서 즉시 반환)
  function getAll(storeName) {
    return cache[storeName] || [];
  }

  // ID로 조회
  function getById(storeName, id) {
    return (cache[storeName] || []).find(item => item.id === id) || null;
  }

  // 추가
  async function add(storeName, data) {
    _assertWritable();
    _assertDefectTypesWritable(storeName);

    const newItem = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      ...data
    };

    try {
      await ApiClient.save(storeName, newItem);
    } catch (err) {
      console.error(`[${storeName}] 저장 실패:`, err);
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }

    if (!cache[storeName]) cache[storeName] = [];
    cache[storeName].push(newItem);
    return newItem;
  }

  // 수정
  async function update(storeName, id, data) {
    _assertWritable();
    _assertDefectTypesWritable(storeName);

    const items = cache[storeName] || [];
    const index = items.findIndex(item => item.id === id);

    if (index === -1) throw new Error('데이터를 찾을 수 없습니다.');

    const updated = {
      ...items[index],
      ...data,
      updatedAt: new Date().toISOString()
    };

    try {
      await ApiClient.save(storeName, updated);
    } catch (err) {
      console.error(`[${storeName}] 수정 실패:`, err);
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }

    items[index] = updated;
    return updated;
  }

  // 업서트 — 동일 id 레코드가 있으면 덮어쓰기, 없으면 추가
  async function put(storeName, data) {
    if (!data || !data.id) throw new Error('[Storage.put] id 필드가 필요합니다.');
    _assertDefectTypesWritable(storeName);
    const exists = (cache[storeName] || []).some(r => r.id === data.id);
    if (exists) {
      return update(storeName, data.id, data);
    }
    const { id, ...rest } = data;
    return add(storeName, { id, ...rest });
  }

  // 삭제
  async function remove(storeName, id) {
    _assertWritable();
    _assertDefectTypesWritable(storeName);

    try {
      await ApiClient.remove(storeName, id);
    } catch (err) {
      console.error(`[${storeName}] 삭제 실패:`, err);
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }

    if (cache[storeName]) {
      cache[storeName] = cache[storeName].filter(item => item.id !== id);
    }
  }

  // 배치 저장 (await 가능 — 호출측에서 await 사용 권장)
  async function saveAll(storeName, dataArray) {
    _assertWritable();
    _assertDefectTypesWritable(storeName);

    try {
      await ApiClient.saveAll(storeName, dataArray);
    } catch (err) {
      console.error(`[${storeName}] 배치 저장 실패:`, err);
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }
    cache[storeName] = dataArray;
  }

  // 날짜 범위 필터
  function getByDateRange(storeName, startDate, endDate, dateField = 'date') {
    const items = cache[storeName] || [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= start && d <= end;
    });
  }

  // 조건 필터
  function filter(storeName, predicate) {
    return (cache[storeName] || []).filter(predicate);
  }

  // 고유 ID 생성
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  // CSV 내보내기
  function exportToCSV(headers, rows, filename) {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // JSON 내보내기 (백업)
  function exportJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 오늘 날짜 (로컬 기준 — UTC toISOString는 새벽 KST에서 하루 전으로 어긋남)
  function today() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 초기화 여부
  function isInitialized() {
    return initialized;
  }

  // 설정 조회
  async function getConfig() {
    return (await ApiClient.getConfig('app_config')) || {};
  }

  // 설정 저장
  async function saveConfig(config) {
    await ApiClient.setConfig('app_config', config);
  }

  // 특정 설정값 가져오기
  async function getConfigValue(key) {
    const config = await getConfig();
    return config[key];
  }

  // 특정 설정값 저장
  async function setConfigValue(key, value) {
    const config = await getConfig();
    config[key] = value;
    await saveConfig(config);
  }

  /**
   * 여러 스토어를 원자적으로 처리 (Storage 레이어 버전)
   *
   * 동작 순서:
   *   1. 캐시 스냅샷 저장 (롤백용)
   *   2. 캐시 즉시 반영 (UI 반응성 유지)
   *   3. API 순차 실행
   *   4. 실패 시 캐시 스냅샷으로 롤백 + 오류 throw
   *
   * operations 배열 항목 형식:
   *   { store: string, op: 'add',    data:   object }  ← 신규 추가
   *   { store: string, op: 'update', id:     string, data: object }  ← 수정
   *   { store: string, op: 'remove', id:     string }  ← 삭제
   *   { store: string, op: 'saveAll', items: Array  }  ← 전체 교체
   *
   * @param  {Array<{store:string, op:string, id?:string, data?:object, items?:Array}>} operations
   * @returns {Promise<Array>}  각 작업 결과 배열
   *
   * @example
   *   const results = await Storage.executeTransaction([
   *     { store: DB.STORES.INJECTION_INVENTORY,  op: 'update', id: item.id, data: updatedItem },
   *     { store: DB.STORES.PRODUCTION_PLANS,     op: 'update', id: plan.id, data: updatedPlan },
   *   ]);
   */
  async function executeTransaction(operations) {
    if (!Array.isArray(operations) || operations.length === 0) return [];
    _assertWritable();

    // ── 1. 영향받는 스토어의 캐시 스냅샷 (deep copy) ─────────────
    const affectedStores = [...new Set(operations.map(op => op.store))];
    const snapshot = {};
    for (const storeName of affectedStores) {
      snapshot[storeName] = JSON.parse(JSON.stringify(cache[storeName] || []));
    }

    const results = [];

    try {
      // ── 2. 캐시 즉시 반영 + API 호출 목록 구성 ───────────────────
      const apiCalls = [];

      for (let i = 0; i < operations.length; i++) {
        const { store: storeName, op, id, data, items } = operations[i];
        _assertDefectTypesWritable(storeName);

        if (!cache[storeName]) cache[storeName] = [];

        switch (op) {
          case 'add': {
            if (!data || typeof data !== 'object') {
              throw new Error(`[executeTransaction] 'add' 작업 #${i}에 data 객체 필요 (store: ${storeName})`);
            }
            const newItem = {
              id: generateId(),
              createdAt: new Date().toISOString(),
              ...data
            };
            cache[storeName].push(newItem);
            results.push(newItem);
            apiCalls.push(() => ApiClient.save(storeName, newItem));
            break;
          }

          case 'update': {
            if (id === undefined || id === null) {
              throw new Error(`[executeTransaction] 'update' 작업 #${i}에 id 필요 (store: ${storeName})`);
            }
            if (!data || typeof data !== 'object') {
              throw new Error(`[executeTransaction] 'update' 작업 #${i}에 data 객체 필요 (store: ${storeName})`);
            }
            const idx = cache[storeName].findIndex(item => item.id === id);
            if (idx === -1) {
              throw new Error(`[executeTransaction] 'update' 작업 #${i}: id="${id}" 없음 (store: ${storeName})`);
            }
            cache[storeName][idx] = {
              ...cache[storeName][idx],
              ...data,
              updatedAt: new Date().toISOString()
            };
            const updated = cache[storeName][idx];
            results.push(updated);
            apiCalls.push(() => ApiClient.save(storeName, updated));
            break;
          }

          case 'remove': {
            if (id === undefined || id === null) {
              throw new Error(`[executeTransaction] 'remove' 작업 #${i}에 id 필요 (store: ${storeName})`);
            }
            cache[storeName] = cache[storeName].filter(item => item.id !== id);
            results.push(undefined);
            apiCalls.push(() => ApiClient.remove(storeName, id));
            break;
          }

          case 'saveAll': {
            if (!Array.isArray(items)) {
              throw new Error(`[executeTransaction] 'saveAll' 작업 #${i}에 items 배열 필요 (store: ${storeName})`);
            }
            cache[storeName] = items;
            results.push(items);
            apiCalls.push(() => ApiClient.saveAll(storeName, items));
            break;
          }

          default:
            throw new Error(
              `[executeTransaction] 지원하지 않는 op: "${op}" (작업 #${i})\n` +
              `지원 op: 'add' | 'update' | 'remove' | 'saveAll'`
            );
        }
      }

      // ── 3. API 순차 실행 (순서 보장) ─────────────────────────────
      for (const call of apiCalls) {
        await call();
      }

      return results;

    } catch (err) {
      // ── 4. 실패 시 캐시 롤백 ──────────────────────────────────────
      console.error('[executeTransaction] 오류 발생, 캐시 롤백:', err.message);
      for (const storeName of affectedStores) {
        cache[storeName] = snapshot[storeName];
      }
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }
  }

  /**
   * 페이징된 데이터 조회 (캐시 레이어, 동기)
   *
   * 통계·차트처럼 전체 데이터가 필요한 곳은 getAll() 유지.
   * UI 테이블처럼 한 페이지 분량만 렌더링할 때 이 함수를 사용합니다.
   *
   * @param {string} storeName
   * @param {object} [options]
   * @param {number}  [options.page=1]        조회 페이지 (1-based)
   * @param {number}  [options.pageSize=50]   페이지당 최대 항목 수
   * @param {object}  [options.sort]          정렬 옵션
   * @param {string}   options.sort.field     정렬 기준 필드명
   * @param {'asc'|'desc'} [options.sort.order='asc'] 정렬 방향
   * @returns {{ data:Array, total:number, page:number, pageSize:number, totalPages:number }}
   *
   * @example
   *   const { data, total, page, totalPages } = Storage.getAllPaged(
   *     DB.STORES.PAINT_INVENTORY,
   *     { page: _page, pageSize: _pageSize, sort: { field: 'date', order: 'desc' } }
   *   );
   */
  function getAllPaged(storeName, { page = 1, pageSize = 50, sort = null } = {}) {
    let arr = cache[storeName] || [];

    // 정렬 적용 (원본 캐시 배열 변경 없이 복사본 사용)
    if (sort) {
      arr = [...arr].sort((a, b) => {
        const av = a[sort.field] ?? '';
        const bv = b[sort.field] ?? '';
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sort.order === 'desc' ? -cmp : cmp;
      });
    }

    const total      = arr.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage   = Math.min(Math.max(1, page), totalPages); // 범위 초과 시 clamp
    const start      = (safePage - 1) * pageSize;

    return {
      data:       arr.slice(start, start + pageSize),
      total,
      page:       safePage,
      pageSize,
      totalPages
    };
  }

  // 캐시 강제 새로고침 (실시간 동기화)
  async function refresh(storeName) {
    try {
      if (storeName) {
        if (!Array.isArray(cache[storeName])) cache[storeName] = [];
        const useRemote = !offlineMode;
        await _loadOneStoreToCache(storeName, { useRemote });
        _emitCacheWarm(storeName, { phase: 'refresh' });
      } else {
        const useRemote = !offlineMode;
        await loadAllToCache({ useRemote });
      }
    } catch (err) {
      console.error('캐시 새로고침 실패:', err);
    }
  }

  return {
    USE_INDEXEDDB,
    STORES,
    init,
    getAll,
    getById,
    add,
    update,
    put,
    remove,
    saveAll,
    getByDateRange,
    filter,
    generateId,
    exportToCSV,
    exportJSON,
    today,
    isInitialized,
    isStoreReady,           // 특정 스토어가 권위 있는 소스에서 1회 이상 로드됐는지
    areStoresReady,         // 여러 스토어가 모두 준비됐는지
    isOffline,              // 세션 중 API 쓰기 실패 시 true
    getConfig,
    saveConfig,
    getConfigValue,
    setConfigValue,
    refresh,
    runWithDefectTypesWrite,
    executeTransaction,
    getAllPaged,            // 페이징 조회 (동기, 캐시 기반)
    onCacheWarm             // 캐시 워밍 이벤트 구독
  };
})();
