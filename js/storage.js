/**
 * 스토리지 모듈 (API 서버 연동)
 * IndexedDB 대신 NAS MariaDB REST API 사용
 * 모듈 인터페이스는 동일하게 유지
 */

const Storage = (function() {
  let cache = {};
  let initialized = false;
  let offlineMode = false;   // API 서버 연결 실패 시 true (읽기 전용 캐시 모드)

  // DB.STORES 참조 (모든 스토어 이름 공유)
  const STORES = DB.STORES;

  // ── 로컬 전용 스토어 (NAS API 연동 제외, IndexedDB에만 저장) ──────────
  // base64 이미지 등 대용량 데이터는 NAS MariaDB 대신 IndexedDB에 직접 저장
  const LOCAL_ONLY_STORES = new Set([
    STORES.INJ_INSP_STANDARDS,        // 수입검사 기준 사진 (base64 이미지)
    STORES.INJECT_COLOR_STD,          // 사출컬러 기준서 파일 (Blob — NAS 전송 불가)
    STORES.INJECT_COLOR_STD_DATA,     // 사출컬러 기준서 편집 데이터 (base64 사진 포함)
    STORES.PAJI_STD_DATA,             // 파지 기준서 편집 데이터 (base64 사진 포함)
    STORES.WASH_CONSUMABLE_DATA,      // 세척 소모품 기준서 편집 데이터 (base64 사진 포함)
    STORES.AGIT_STD_DATA,             // 교반시간 기준서 편집 데이터 (base64 사진 포함)
    STORES.REMAIN_PAINT_DATA,         // 잔여도료 기준서 편집 데이터 (base64 사진 포함)
  ]);

  // 초기화: API 서버에서 모든 데이터 로드
  // API 서버 실패 시 → IndexedDB 백업 캐시로 폴백 (오프라인 모드)
  async function init() {
    try {
      await ApiClient.init();
      await DB.init().catch(() => {});
      await loadAllToCache();
      initialized = true;
      offlineMode = false;
      await _runSchemaMigration(); // v19 데이터 마이그레이션
      console.log('✅ 스토리지 초기화 완료 (API 서버 연동)');
    } catch (apiError) {
      console.warn('⚠️ NAS 서버 연결 실패 → IndexedDB 백업 캐시로 폴백 시도:', apiError.message);

      // ── 폴백: IndexedDB 로컬 캐시 사용 (오프라인 모드) ──
      try {
        await DB.init();
        await loadAllFromIndexedDB();
        initialized = true;
        offlineMode = true;
        await _runSchemaMigration(); // v19 데이터 마이그레이션
        console.log('✅ 오프라인 모드로 시작 (IndexedDB 백업 캐시)');

        // 사용자에게 NAS 연결 불가 전용 배너 표시 (UI 준비 후)
        setTimeout(() => _showNasDisconnectedBanner(apiError.message), 800);
      } catch (dbError) {
        // IndexedDB 폴백도 실패 → 최종 실패 (NAS 전용 에러 표시는 app.js에서 처리)
        console.error('❌ 스토리지 초기화 실패 (NAS 및 IndexedDB 모두 실패):', dbError);
        const combined = new Error(
          `${apiError.message}\n(IndexedDB 폴백도 실패: ${dbError.message})`
        );
        combined.isNasError = true;     // app.js에서 분기 처리용 플래그
        combined.apiError = apiError;
        combined.dbError = dbError;
        throw combined;
      }
    }
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
          <strong style="font-size:0.95rem;">NAS 서버 연결 불가 — 오프라인 모드</strong>
          <span style="font-size:0.78rem;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            마지막으로 저장된 로컬 데이터로 조회만 가능 · 변경사항은 NAS에 동기화되지 않습니다
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
        " title="배너 숨기기 (오프라인 모드는 유지)">
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

  // 모든 스토어 캐시 로드 (API 서버에서)
  // 추가 효과: 성공한 데이터를 IndexedDB에 백업하여 다음 오프라인 시점에 사용
  async function loadAllToCache() {
    const storeList = Object.values(STORES).filter(s => s !== 'config');
    await Promise.allSettled(
      storeList.map(async (storeName) => {
        try {
          // ── 로컬 전용 스토어: NAS API 호출 없이 IndexedDB에서만 로드 ──
          if (LOCAL_ONLY_STORES.has(storeName)) {
            cache[storeName] = await _loadIndexedBackupStore(storeName);
            return;
          }

          const remoteItems = await ApiClient.getAll(storeName);
          if (Array.isArray(remoteItems) && remoteItems.length > 0) {
            cache[storeName] = remoteItems;
            _backupToIndexedDB(storeName, remoteItems);
            return;
          }

          const localItems = await _loadIndexedBackupStore(storeName);
          if (localItems.length > 0) {
            cache[storeName] = localItems;
            _restoreEmptyRemoteStore(storeName, localItems);
            return;
          }

          cache[storeName] = [];
          // IndexedDB 백업 (비동기, 실패 무시)
          _backupToIndexedDB(storeName, cache[storeName]);
        } catch (e) {
          cache[storeName] = [];
        }
      })
    );
  }

  // IndexedDB에서 모든 스토어 로드 (오프라인 폴백)
  async function _loadIndexedBackupStore(storeName) {
    try {
      if (typeof DB === 'undefined' || !DB.getAll) return [];
      const rows = await DB.getAll(storeName);
      return Array.isArray(rows) ? rows.filter(r => r && r.id) : [];
    } catch (e) {
      return [];
    }
  }

  function _restoreEmptyRemoteStore(storeName, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    setTimeout(async () => {
      try {
        await ApiClient.saveAll(storeName, items);
        console.warn(`[MES restore] Empty API store restored from IndexedDB backup: ${storeName} (${items.length})`);
      } catch (e) {
        console.warn(`[MES restore] Failed to restore API store from IndexedDB backup: ${storeName}`, e);
      }
    }, 0);
  }

  async function loadAllFromIndexedDB() {
    const storeList = Object.values(STORES).filter(s => s !== 'config');
    await Promise.allSettled(
      storeList.map(async (storeName) => {
        try {
          cache[storeName] = await DB.getAll(storeName);
        } catch (e) {
          cache[storeName] = [];
        }
      })
    );
  }

  // IndexedDB 백업 (비동기, 실패 무시) — 다음 오프라인 시점에 사용
  function _backupToIndexedDB(storeName, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    if (typeof DB === 'undefined' || !DB.saveAll) return;
    // 비동기 — UI 차단 방지
    setTimeout(async () => {
      try {
        // DB.saveAll이 있다면 사용, 없으면 개별 save
        if (DB.saveAll) {
          await DB.saveAll(storeName, items);
        } else if (DB.save) {
          for (const item of items) await DB.save(storeName, item);
        }
      } catch (e) {
        // 백업 실패는 조용히 무시 (스토어가 IndexedDB에 없을 수도 있음)
      }
    }, 0);
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
    return new Error('NAS 서버가 연결되지 않아 저장할 수 없습니다. 오프라인 모드는 조회 전용입니다. 서버 연결 후 새로고침하고 다시 저장하세요.');
  }

  function _assertWritable() {
    if (!offlineMode) return;
    const err = _offlineWriteError();
    if (typeof UIUtils !== 'undefined' && UIUtils.toast) {
      UIUtils.toast(err.message, 'warning');
    }
    throw err;
  }

  function _persistOneToIndexedDB(storeName, item) {
    if (typeof DB === 'undefined' || !DB.save || !item) return;
    setTimeout(() => DB.save(storeName, item).catch(() => {}), 0);
  }

  function _removeOneFromIndexedDB(storeName, id) {
    if (typeof DB === 'undefined' || !DB.remove) return;
    setTimeout(() => DB.remove(storeName, id).catch(() => {}), 0);
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

  // 오프라인 모드 여부 (UI/모듈에서 쓰기 차단용)
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
    // ── 로컬 전용 스토어: IndexedDB에만 저장 (NAS API 호출 없음) ──
    if (LOCAL_ONLY_STORES.has(storeName)) {
      const newItem = { id: generateId(), createdAt: new Date().toISOString(), ...data };
      await DB.save(storeName, newItem);
      if (!cache[storeName]) cache[storeName] = [];
      cache[storeName].push(newItem);
      return newItem;
    }

    _assertWritable();

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
    _persistOneToIndexedDB(storeName, newItem);
    return newItem;
  }

  // 수정
  async function update(storeName, id, data) {
    _assertWritable();

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
    _persistOneToIndexedDB(storeName, updated);
    return updated;
  }

  // 삭제
  async function remove(storeName, id) {
    // ── 로컬 전용 스토어: IndexedDB에서만 삭제 (NAS API 호출 없음) ──
    if (LOCAL_ONLY_STORES.has(storeName)) {
      await DB.remove(storeName, id);
      if (cache[storeName]) {
        cache[storeName] = cache[storeName].filter(item => item.id !== id);
      }
      return;
    }

    _assertWritable();

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
    _removeOneFromIndexedDB(storeName, id);
  }

  // 배치 저장 (await 가능 — 호출측에서 await 사용 권장)
  async function saveAll(storeName, dataArray) {
    _assertWritable();

    try {
      await ApiClient.saveAll(storeName, dataArray);
    } catch (err) {
      console.error(`[${storeName}] 배치 저장 실패:`, err);
      if (_isRemoteWriteFailure(err)) _setOfflineAfterWriteFailure(err);
      throw err;
    }
    cache[storeName] = dataArray;
    _backupToIndexedDB(storeName, dataArray);
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

  // 오늘 날짜
  function today() {
    return new Date().toISOString().split('T')[0];
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

      affectedStores.forEach(storeName => _backupToIndexedDB(storeName, cache[storeName] || []));
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
        cache[storeName] = await ApiClient.getAll(storeName);
      } else {
        await loadAllToCache();
      }
    } catch (err) {
      console.error('캐시 새로고침 실패:', err);
    }
  }

  return {
    STORES,
    init,
    getAll,
    getById,
    add,
    update,
    remove,
    saveAll,
    getByDateRange,
    filter,
    generateId,
    exportToCSV,
    exportJSON,
    today,
    isInitialized,
    isOffline,              // 오프라인 모드 여부 (API 서버 연결 실패 시 true)
    getConfig,
    saveConfig,
    getConfigValue,
    setConfigValue,
    refresh,
    executeTransaction,
    getAllPaged             // 페이징 조회 (동기, 캐시 기반)
  };
})();
