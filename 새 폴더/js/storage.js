/**
 * 스토리지 모듈 (API 서버 연동)
 * IndexedDB 대신 NAS MariaDB REST API 사용
 * 모듈 인터페이스는 동일하게 유지
 */

const Storage = (function() {
  let cache = {};
  let initialized = false;

  // DB.STORES 호환 (모듈들이 DB.STORES 참조 시 사용)
/** NEW: * JIG 라이프사이클 관리 API * 주석: JIG 등록 시 장비 고유 ID 생성 및 초기 상태 정의 * @param {object} data - JIG 마스터 정보 및 초기 상태 데이터 * @param {string} processStoreName - JIG가 주로 사용되는 공정 (예: PAINTING_WORK) * @param {object} [initialHistory] - JIG 등록 시 기록할 초기 사용 이력 데이터 (선택적) * @returns {Promise<object>} 신규 등록된 JIG 마스터 객체
const STORES = {
// ... 기존 스토어 생략
    ,        JIG_MASTER: 'jig_master',      // 💡 장비 마스터 정보 (예: 모델명, 최초 도입일, 수명 주기 정보)
    ,        JIG_LOG: 'jig_log'            // 💡 장비별 사용/이력 로깅 (날짜, 작업 공정, 사용된 부품)
};

  // 초기화: API 서버에서 모든 데이터 로드
  async function init() {
    try {
      await ApiClient.init();
      await loadAllToCache();
      initialized = true;
      console.log('✅ 스토리지 초기화 완료 (API 서버 연동)');
    } catch (error) {
      console.error('❌ 스토리지 초기화 실패:', error);
      throw error;
    }
  }

  // 모든 스토어 캐시 로드
  async function loadAllToCache() {
    const storeList = Object.values(STORES).filter(s => s !== 'config');
    await Promise.allSettled(
      storeList.map(async (storeName) => {
        try {
          cache[storeName] = await ApiClient.getAll(storeName);
        } catch (e) {
          cache[storeName] = [];
        }
      })
    );
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
    const newItem = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      ...data
    };

    if (!cache[storeName]) cache[storeName] = [];
    cache[storeName].push(newItem);

    // 비동기 API 저장
    ApiClient.save(storeName, newItem).catch(err => {
      console.error(`[${storeName}] 저장 실패:`, err);
    });

    return newItem;
  }

  // 수정
  async function update(storeName, id, data) {
    const items = cache[storeName] || [];
    const index = items.findIndex(item => item.id === id);

    if (index === -1) throw new Error('데이터를 찾을 수 없습니다.');

    items[index] = {
      ...items[index],
      ...data,
      updatedAt: new Date().toISOString()
    };

    ApiClient.save(storeName, items[index]).catch(err => {
      console.error(`[${storeName}] 수정 실패:`, err);
    });

    return items[index];
  }

  // 삭제
  async function remove(storeName, id) {
    if (cache[storeName]) {
      cache[storeName] = cache[storeName].filter(item => item.id !== id);
    }

    ApiClient.remove(storeName, id).catch(err => {
      console.error(`[${storeName}] 삭제 실패:`, err);
    });
  }

  // 배치 저장 (await 가능 — 호출측에서 await 사용 권장)
  async function saveAll(storeName, dataArray) {
    cache[storeName] = dataArray;
    try {
      await ApiClient.saveAll(storeName, dataArray);
    } catch (err) {
      console.error(`[${storeName}] 배치 저장 실패:`, err);
      throw err;
    }
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

      return results;

    } catch (err) {
      // ── 4. 실패 시 캐시 롤백 ──────────────────────────────────────
      console.error('[executeTransaction] 오류 발생, 캐시 롤백:', err.message);
      for (const storeName of affectedStores) {
        cache[storeName] = snapshot[storeName];
      }
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
    getConfig,
    saveConfig,
    getConfigValue,
    setConfigValue,
    refresh,
    executeTransaction,
    getAllPaged             // 페이징 조회 (동기, 캐시 기반)
  };
})();
