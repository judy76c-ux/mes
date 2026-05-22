/**
 * 사출 재공품 현황
 * - 사출 생산 완료 후 다음 공정 투입 전까지의 재공품 수량 관리
 * - 차종/부품별 재고 현황 + 입출고 이력
 */
var InjectionWipModule = (function () {
    const WIP_STORE = DB.STORES.INJECTION_WIP;

    /* ══════════════════════════════════════
       유틸
    ══════════════════════════════════════ */
    function _today() {
        return new Date().toISOString().slice(0, 10);
    }

    function _fmt(n) {
        return (n || 0).toLocaleString();
    }

    function _getAll() {
        try { return Storage.getAll(WIP_STORE) || []; } catch { return []; }
    }

    function _getProducts() {
        try { return Storage.getAll(DB.STORES.PRODUCTS) || []; } catch { return []; }
    }

    /* ══════════════════════════════════════
       재공 현황 집계 (부품별 잔량)
    ══════════════════════════════════════ */
    function _calcStock(records) {
        const map = {};
        records.forEach(r => {
            const key = `${r.carModel}||${r.partName}||${r.color}`;
            if (!map[key]) map[key] = { carModel: r.carModel, partName: r.partName, color: r.color, qty: 0 };
            if (r.type === '입고') map[key].qty += (r.qty || 0);
            else                    map[key].qty -= (r.qty || 0);
        });
        return Object.values(map);
    }

    /* ══════════════════════════════════════
       렌더
    ══════════════════════════════════════ */
    function render(container) {
        const records  = _getAll().sort((a, b) => b.date.localeCompare(a.date));
        const stock    = _calcStock(records);
        const totalIn  = records.filter(r => r.type === '입고').reduce((s, r) => s + (r.qty || 0), 0);
        const totalOut = records.filter(r => r.type === '출고').reduce((s, r) => s + (r.qty || 0), 0);
        const totalWip = stock.reduce((s, r) => s + Math.max(0, r.qty), 0);

        container.innerHTML = `
        <div class="fade-in-up">

          <!-- 헤더 -->
          <div style="display:flex;align-items:center;justify-content:space-between;
                      flex-wrap:wrap;gap:12px;margin-bottom:20px;">
            <div>
              <h2 style="margin:0 0 4px;font-size:1.25rem;">사출 재공품 현황</h2>
              <p style="margin:0;color:var(--text-muted);font-size:.88rem;">
                사출 완료 후 도장 투입 전까지의 재공품 수량을 관리합니다.
              </p>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" onclick="InjectionWipModule.openAddModal()">
                <span class="material-symbols-outlined">add</span> 재공품 등록
              </button>
            </div>
          </div>

          <!-- 요약 카드 -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px;">
            ${_summaryCard('현재 재공수량', _fmt(totalWip) + ' EA', 'layers', '#2563eb')}
            ${_summaryCard('총 입고', _fmt(totalIn) + ' EA', 'input', '#16a34a')}
            ${_summaryCard('총 출고', _fmt(totalOut) + ' EA', 'output', '#dc2626')}
          </div>

          <!-- 부품별 재공 현황 -->
          <div class="section-card" style="margin-bottom:20px;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);
                        font-weight:700;font-size:.97rem;">
              부품별 재공 현황
            </div>
            <div style="padding:16px 20px;">
              ${stock.length === 0
                ? '<p style="color:var(--text-muted);text-align:center;padding:24px 0;">등록된 재공품이 없습니다.</p>'
                : `<table style="width:100%;border-collapse:collapse;font-size:.9rem;">
                    <thead>
                      <tr style="background:var(--bg-secondary);text-align:left;">
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">차종</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">부품명</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">색상</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);text-align:right;">재공수량(EA)</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${stock.map(s => `
                        <tr style="border-top:1px solid var(--border);">
                          <td style="padding:9px 12px;">${s.carModel || '-'}</td>
                          <td style="padding:9px 12px;font-weight:600;">${s.partName}</td>
                          <td style="padding:9px 12px;">${s.color || '-'}</td>
                          <td style="padding:9px 12px;text-align:right;font-weight:700;
                              color:${s.qty > 0 ? '#2563eb' : s.qty < 0 ? '#dc2626' : 'var(--text-muted)'};">
                            ${_fmt(s.qty)}
                          </td>
                          <td style="padding:9px 12px;">
                            <span style="padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:600;
                                background:${s.qty > 0 ? '#dbeafe' : s.qty === 0 ? '#f1f5f9' : '#fee2e2'};
                                color:${s.qty > 0 ? '#1d4ed8' : s.qty === 0 ? '#64748b' : '#dc2626'};">
                              ${s.qty > 0 ? '재고있음' : s.qty === 0 ? '재고없음' : '마이너스'}
                            </span>
                          </td>
                        </tr>`).join('')}
                    </tbody>
                  </table>`}
            </div>
          </div>

          <!-- 이력 테이블 -->
          <div class="section-card">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);
                        display:flex;align-items:center;justify-content:space-between;">
              <span style="font-weight:700;font-size:.97rem;">입출고 이력</span>
              <span style="font-size:.82rem;color:var(--text-muted);">총 ${records.length}건</span>
            </div>
            <div style="overflow-x:auto;">
              ${records.length === 0
                ? '<p style="color:var(--text-muted);text-align:center;padding:32px 0;">이력이 없습니다.</p>'
                : `<table style="width:100%;border-collapse:collapse;font-size:.88rem;">
                    <thead>
                      <tr style="background:var(--bg-secondary);text-align:left;">
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">날짜</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">구분</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">차종</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">부품명</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">색상</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);text-align:right;">수량(EA)</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">LOT No.</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">보관위치</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">비고</th>
                        <th style="padding:8px 12px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${records.map(r => `
                        <tr style="border-top:1px solid var(--border);">
                          <td style="padding:8px 12px;white-space:nowrap;">${r.date}</td>
                          <td style="padding:8px 12px;">
                            <span style="padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:700;
                                background:${r.type === '입고' ? '#dcfce7' : '#fee2e2'};
                                color:${r.type === '입고' ? '#16a34a' : '#dc2626'};">
                              ${r.type}
                            </span>
                          </td>
                          <td style="padding:8px 12px;">${r.carModel || '-'}</td>
                          <td style="padding:8px 12px;font-weight:600;">${r.partName}</td>
                          <td style="padding:8px 12px;">${r.color || '-'}</td>
                          <td style="padding:8px 12px;text-align:right;font-weight:700;">${_fmt(r.qty)}</td>
                          <td style="padding:8px 12px;font-family:monospace;">${r.lotNo || '-'}</td>
                          <td style="padding:8px 12px;">${r.location || '-'}</td>
                          <td style="padding:8px 12px;color:var(--text-muted);max-width:160px;
                              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.note || ''}</td>
                          <td style="padding:8px 12px;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline" style="padding:2px 8px;"
                                onclick="InjectionWipModule.openEditModal('${r.id}')">수정</button>
                            <button class="btn btn-sm" style="padding:2px 8px;color:#dc2626;border:1px solid #dc2626;background:transparent;margin-left:4px;"
                                onclick="InjectionWipModule.deleteRecord('${r.id}')">삭제</button>
                          </td>
                        </tr>`).join('')}
                    </tbody>
                  </table>`}
            </div>
          </div>

        </div>`;
    }

    function _summaryCard(title, value, icon, color) {
        return `
        <div style="background:#ffffff;border:1px solid var(--border);border-radius:12px;
                    padding:18px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span class="material-symbols-outlined"
                style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;
                       background:#ffffff;border:1px solid var(--border);color:${color};font-size:20px;">${icon}</span>
            <span style="font-size:.85rem;color:var(--text-muted);">${title}</span>
          </div>
          <div style="font-size:1.5rem;font-weight:800;color:var(--text-primary);">${value}</div>
        </div>`;
    }

    /* ══════════════════════════════════════
       모달 – 등록/수정
    ══════════════════════════════════════ */
    function _formHtml(r) {
        r = r || {};
        const products = _getProducts();
        const partOpts = products.map(p =>
            `<option value="${p.partName}" data-model="${p.carModel || ''}" data-color="${p.color || ''}"
             ${r.partName === p.partName ? 'selected' : ''}>${p.carModel ? p.carModel + ' ' : ''}${p.partName}${p.color ? ' ' + p.color : ''}</option>`
        ).join('');

        return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label class="form-label">날짜 *</label>
            <input id="wipDate" type="date" class="form-control" value="${r.date || _today()}">
          </div>
          <div>
            <label class="form-label">구분 *</label>
            <select id="wipType" class="form-control">
              <option value="입고" ${(r.type || '입고') === '입고' ? 'selected' : ''}>입고 (사출 완료)</option>
              <option value="출고" ${r.type === '출고' ? 'selected' : ''}>출고 (도장 투입)</option>
            </select>
          </div>
          <div>
            <label class="form-label">차종 *</label>
            <input id="wipCarModel" type="text" class="form-control" placeholder="예: HMG-A"
                   value="${r.carModel || ''}">
          </div>
          <div>
            <label class="form-label">부품명 *</label>
            <input id="wipPartName" type="text" class="form-control" placeholder="예: 프론트 범퍼"
                   value="${r.partName || ''}">
          </div>
          <div>
            <label class="form-label">색상</label>
            <input id="wipColor" type="text" class="form-control" placeholder="예: 화이트"
                   value="${r.color || ''}">
          </div>
          <div>
            <label class="form-label">수량 (EA) *</label>
            <input id="wipQty" type="number" class="form-control" min="1" placeholder="0"
                   value="${r.qty || ''}">
          </div>
          <div>
            <label class="form-label">LOT No.</label>
            <input id="wipLotNo" type="text" class="form-control" placeholder="예: 250522"
                   value="${r.lotNo || ''}">
          </div>
          <div>
            <label class="form-label">보관위치</label>
            <input id="wipLocation" type="text" class="form-control" placeholder="예: A-01 팔레트"
                   value="${r.location || ''}">
          </div>
          <div style="grid-column:1/-1;">
            <label class="form-label">비고</label>
            <input id="wipNote" type="text" class="form-control" value="${r.note || ''}">
          </div>
        </div>`;
    }

    function openAddModal() {
        UIUtils.showModal('재공품 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionWipModule.saveRecord(null)">저장</button>
        `);
    }

    function openEditModal(id) {
        const rec = _getAll().find(r => r.id === id);
        if (!rec) return;
        UIUtils.showModal('재공품 수정', _formHtml(rec), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionWipModule.saveRecord('${id}')">저장</button>
        `);
    }

    async function saveRecord(id) {
        const date     = document.getElementById('wipDate')?.value?.trim();
        const type     = document.getElementById('wipType')?.value;
        const carModel = document.getElementById('wipCarModel')?.value?.trim();
        const partName = document.getElementById('wipPartName')?.value?.trim();
        const color    = document.getElementById('wipColor')?.value?.trim();
        const qty      = parseInt(document.getElementById('wipQty')?.value, 10);
        const lotNo    = document.getElementById('wipLotNo')?.value?.trim();
        const location = document.getElementById('wipLocation')?.value?.trim();
        const note     = document.getElementById('wipNote')?.value?.trim();

        if (!date || !type || !partName || isNaN(qty) || qty < 1) {
            UIUtils.toast('날짜, 구분, 부품명, 수량은 필수입니다.', 'error');
            return;
        }

        const rec = { date, type, carModel, partName, color, qty, lotNo, location, note };
        if (id) rec.id = id;

        try {
            await Storage.add(WIP_STORE, rec);
            UIUtils.closeModal();
            UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
            render(document.getElementById('contentArea'));
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    async function deleteRecord(id) {
        if (!confirm('이 이력을 삭제하시겠습니까?')) return;
        try {
            await Storage.remove(WIP_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            render(document.getElementById('contentArea'));
        } catch (e) {
            UIUtils.toast('삭제 실패: ' + e.message, 'error');
        }
    }

    return {
        render,
        init: render,
        openAddModal,
        openEditModal,
        saveRecord,
        deleteRecord
    };
})();
