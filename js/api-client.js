/**
 * MES API 클라이언트
 * NAS MariaDB REST API 연동 레이어
 * DB(IndexedDB) 인터페이스와 동일한 메서드 제공
 */

const ApiClient = (function() {
  // API 서버 주소 결정 우선순위:
  //   1) window.__MES_API_BASE__ override
  //   2) HTTP/HTTPS 접속 시 → 같은 호스트의 :3000 포트
  //   3) file:// 직접 열기 → IndexedDB 설정 필요
  function resolveApiBase() {
    try {
      const saved = window.__MES_API_BASE__;
      if (saved && String(saved).trim()) return String(saved).trim().replace(/\/$/, '');
    } catch (e) {}

    if (typeof location !== 'undefined' && location.protocol && location.hostname) {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        const h = location.hostname;
        // 포트가 명시된 경우(예: :8080 서빙) — 동일 호스트 :3000 사용
        return `${location.protocol}//${h}:3000`;
      }
    }
    // file:// 등 — override 미설정 시 빈 문자열(헬스체크 실패 → 오프라인 모드)
    return '';
  }

  function getApiBase() {
    return resolveApiBase();
  }

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
    const API_BASE = getApiBase();
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
    return `${getApiBase()}/api/backups/${encodeURIComponent(fileName)}`;
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
    return `${getApiBase()}/api/nas-backups/${encodeURIComponent(fileName)}`;
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

  // 사진 업로드: base64 data URL → NAS 서버 저장, URL 반환
  function dataUrlToFile(dataUrl, filename) {
    const parts = String(dataUrl || '').split(',');
    const meta = parts[0] || '';
    const base64 = parts[1] || '';
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime, lastModified: Date.now() });
  }

  function compressImageFile(file, options = {}) {
    const maxSize = options.maxSize || 1280;
    const quality = options.quality || 0.72;
    if (!file || !String(file.type || '').startsWith('image/')) return Promise.resolve(file);
    if (/image\/gif/i.test(file.type || '')) return Promise.resolve(file);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          try {
            const ratio = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
            const w = Math.max(1, Math.round((img.width || 1) * ratio));
            const h = Math.max(1, Math.round((img.height || 1) * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const baseName = String(file.name || 'photo').replace(/\.[^.]+$/, '');
            const compressed = dataUrlToFile(dataUrl, `${baseName}_compressed.jpg`);
            resolve(compressed.size < file.size ? compressed : file);
          } catch (err) {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  async function uploadPhoto(file, subdir) {
    const uploadFile = await compressImageFile(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          const dataUrl = e.target.result; // "data:image/jpeg;base64,..."
          const commaIdx = dataUrl.indexOf(',');
          const base64 = dataUrl.slice(commaIdx + 1);
          const contentType = dataUrl.slice(5, commaIdx).split(';')[0];
          const ext = String(uploadFile.name || file.name || 'jpg').split('.').pop().toLowerCase();
          const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
          const fullSubdir = `${subdir || 'misc'}/${ym}`;
          const result = await request('POST', '/api/photos', {
            subdir: fullSubdir,
            filename: safeName,
            data: base64,
            contentType
          }, 30000);
          resolve(result.url);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsDataURL(uploadFile);
    });
  }

  function photoUrl(relUrl) {
    if (!relUrl) return '';
    if (relUrl.startsWith('http')) return relUrl;
    return (getApiBase() || '') + relUrl;
  }

  async function mkdirPhotos(subdirs) {
    return request('POST', '/api/photos/mkdirs', { subdirs });
  }

  // API 서버 주소 반환 (에러 메시지·UI 표시용)
  function getBase() { return getApiBase(); }

  return {
    init, getAll, save, saveAll, remove, getConfig, setConfig,
    getBackupConfig, saveBackupConfig, listBackups, createBackup,
    cleanupBackups, deleteBackup, backupDownloadUrl, restoreBackup,
    getNasConfig, saveNasConfig,
    listNasBackups, nasBackupDownloadUrl, copyNasToLocal, restoreNasBackup,
    getSystemInfo,
    uploadPhoto, photoUrl, mkdirPhotos,
    getBase
  };
})();
