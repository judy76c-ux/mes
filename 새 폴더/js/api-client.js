/**
 * MES API 클라이언트
 * NAS MariaDB REST API 연동 레이어
 * DB(IndexedDB) 인터페이스와 동일한 메서드 제공
 */

const ApiClient = (function() {
  // NAS API 서버 주소 (같은 망이면 내부 IP, 외부는 도메인/포트포워딩)
  const API_BASE = 'http://192.168.10.15:3000';

  async function request(method, path, body) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`API 오류 [${method} ${path}]: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  // 헬스체크 (init 대용)
  async function init() {
    const result = await request('GET', '/health');
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

  return { init, getAll, save, saveAll, remove, getConfig, setConfig };
})();
