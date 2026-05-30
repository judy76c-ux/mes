/**
 * MES API 클라이언트
 * NAS MariaDB REST API 연동 레이어
 * DB(IndexedDB) 인터페이스와 동일한 메서드 제공
 */

const ApiClient = (function() {
  // API 서버 주소 결정 우선순위:
  //   1) localStorage 'MES_API_BASE' (관리/설정 > 시스템 탭에서 변경 가능)
  //   2) HTTP/HTTPS 접속 시 → 같은 호스트의 :3000 포트
  //   3) file:// 직접 열기 → localStorage 설정 필수 (없으면 경고만)
  function resolveApiBase() {
    try {
      const saved = localStorage.getItem('MES_API_BASE');
      if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
    } catch (e) {}

    if (typeof location !== 'undefined' && location.protocol && location.hostname) {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        const h = location.hostname;
        // 포트가 명시된 경우(예: :8080 서빙) — 동일 호스트 :3000 사용
        return `${location.protocol}//${h}:3000`;
      }
    }
    // file:// 등 — localStorage 미설정 시 빈 문자열(헬스체크 실패 → 오프라인 모드)
    return '';
  }

  const API_BASE = resolveApiBase();

  // 타임아웃이 있는 fetch (기본 10초)
  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(method, path, body, timeoutMs) {
    if (!API_BASE) {
      throw new Error('API 서버 주소가 설정되지 않았습니다. 관리/설정 > 시스템 탭에서 API 서버 URL을 입력하세요.');
    }
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    let res;
    try {
      res = await fetchWithTimeout(API_BASE + path, options, timeoutMs);
    } catch (e) {
      // AbortError → 타임아웃, TypeError → 네트워크 오류 (Failed to fetch)
      if (e.name === 'AbortError') {
        throw new Error(`API 서버 응답 시간 초과 (${API_BASE})`);
      }
      throw new Error(`API 서버 연결 실패 (${API_BASE}) — 서버가 실행 중이고 같은 네트워크에 있는지 확인하세요.`);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`API 오류 [${method} ${path}]: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  // 헬스체크 (init 대용) — 5초 타임아웃
  async function init() {
    const result = await request('GET', '/health', undefined, 5000);
    if (result.status !== 'ok') throw new Error('API 서버 응답 이상');
    console.log('✅ API 서버 연결 성공:', result.timestamp);
  }

  // 전체 조회
  async function getAll(storeName) {
    return request('GET', `/api/docs/${storeName}`);
  }

  // 단건 저장 (upsert)
  async function save(storeName, data) {
    if (!data.id) throw new Error('id 필드 필요');
    return request('PUT', `/api/docs/${storeName}/${data.id}`, data);
  }

  // 배치 저장
  async function saveAll(storeName, dataArray) {
    return request('POST', `/api/docs/${storeName}/bulk`, { rows: dataArray });
  }

  // 삭제
  async function remove(storeName, id) {
    return request('DELETE', `/api/docs/${storeName}/${id}`);
  }

  // 설정 조회
  async function getConfig(key) {
    return request('GET', `/api/config/${key}`);
  }

  // 설정 저장
  async function setConfig(key, value) {
    return request('PUT', `/api/config/${key}`, value);
  }

  async function getBackupConfig() {
    return request('GET', '/api/backups/config');
  }

  async function saveBackupConfig(config) {
    return request('PUT', '/api/backups/config', config);
  }

  async function listBackups() {
    return request('GET', '/api/backups');
  }

  async function createBackup() {
    return request('POST', '/api/backups');
  }

  async function cleanupBackups() {
    return request('POST', '/api/backups/cleanup');
  }

  async function deleteBackup(fileName) {
    return request('DELETE', `/api/backups/${encodeURIComponent(fileName)}`);
  }

  function backupDownloadUrl(fileName) {
    return `${API_BASE}/api/backups/${encodeURIComponent(fileName)}`;
  }

  async function restoreBackup(fileName) {
    return request('POST', `/api/backups/${encodeURIComponent(fileName)}/restore`, {}, 60000);
  }

  async function getNasConfig() {
    return request('GET', '/api/nas-config');
  }

  async function saveNasConfig(config) {
    return request('PUT', '/api/nas-config', config);
  }

  async function listNasBackups() {
    return request('GET', '/api/nas-backups');
  }

  function nasBackupDownloadUrl(fileName) {
    return `${API_BASE}/api/nas-backups/${encodeURIComponent(fileName)}`;
  }

  async function copyNasToLocal(fileName) {
    return request('POST', `/api/nas-backups/${encodeURIComponent(fileName)}/copy-to-local`, {});
  }

  async function restoreNasBackup(fileName) {
    return request('POST', `/api/nas-backups/${encodeURIComponent(fileName)}/restore`, {}, 60000);
  }

  // 시스템 상태 정보 조회
  async function getSystemInfo() {
    return request('GET', '/api/system', undefined, 8000);
  }

  // API 서버 주소 반환 (에러 메시지·UI 표시용)
  function getBase() { return API_BASE; }

  return {
    init, getAll, save, saveAll, remove, getConfig, setConfig,
    getBackupConfig, saveBackupConfig, listBackups, createBackup,
    cleanupBackups, deleteBackup, backupDownloadUrl, restoreBackup,
    getNasConfig, saveNasConfig,
    listNasBackups, nasBackupDownloadUrl, copyNasToLocal, restoreNasBackup,
    getSystemInfo,
    getBase
  };
})();
