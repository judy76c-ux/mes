/**
 * 리워크 재공품 현황
 * - 도장 외관검사에서 입력한 리워크수가 입고로 적립됨
 * - 차종/부품별 재고 + 입출고 이력 관리
 */
var ReworkWipModule = (function () {
    const WIP_STORE = DB.STORES.REWORK_WIP;

    function _today() {
        return new Date().toISOString().slice(0, 10);
    }

    function _fmt(n) {
        return (n || 0).toLocaleString();
    }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _getAll() {
        try { return Storage.getAll(WIP_STORE) || []; } catch (e) { return []; }
    }

    function _calcStock(records) {
        const map = {};
        records.forEach(function (r) {
            const key = (r.carModel || '') + '||' + (r.partName || '') + '||' + (r.color || '');
            if (!map[key]) {
                map[key] = { carModel: r.carModel, partName: r.partName, color: r.color, qty: 0 };
            }
            if (r.type === '입고') map[key].qty += (Number(r.qty) || 0);
            else map[key].qty -= (Number(r.qty) || 0);
        });
        return Object.values(map).filter(function (s) { return s.qty !== 0; })
            .sort(function (a, b) {
                return String(a.carModel).localeCompare(String(b.carModel)) ||
                    String(a.partName).localeCompare(String(b.partName)) ||
                    String(a.color).localeCompare(String(b.color));
            });
    }

    function _summaryCard(title, value, icon, color) {
        return `
        <div style="background:#ffffff;border:1px solid var(--border-color);border-radius:12px;
                    padding:18px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span class="material-symbols-outlined"
                style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;
                       background:#ffffff;border:1px solid var(--border-color);color:${color};font-size:20px;">${icon}</span>
            <span style="font-size:.85rem;color:var(--text-muted);">${title}</span>
          </div>
          <div style="font-size:1.5rem;font-weight:800;color:var(--text-primary);">${value}</div>
        </div>`;
    }

    function render(container) {
        const records = _getAll().sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || '')) ||
                String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
        const stock = _calcStock(records);
        const totalIn = records.filter(function (r) { return r.type === '입고'; })
            .reduce(function (s, r) { return s + (Number(r.qty) || 0); }, 0);
        const totalOut = records.filter(function (r) { return r.type === '출고'; })
            .reduce(function (s, r) { return s + (Number(r.qty) || 0); }, 0);
        const totalWip = stock.reduce(function (s, r) { return s + Math.max(0, r.qty); }, 0);

        container.innerHTML = `
        <div class="fade-in-up">
            ${typeof PaintingNavUI !== 'undefined' ? PaintingNavUI.render('painting-rework-wip') : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0;font-size:1.1rem;font-weight:800;">리워크 재공품</h3>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">도장 외관검사 리워크수 → 재공 입고 · 수동 출고로 재고 관리</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="ReworkWipModule.openAddModal()">
                <span class="material-symbols-outlined" style="font-size:16px;">add</span> 입출고 등록
              </button>
            </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px;">
            ${_summaryCard('현재 재공수량', _fmt(totalWip) + ' EA', 'autorenew', '#ea580c')}
            ${_summaryCard('총 입고', _fmt(totalIn) + ' EA', 'input', '#16a34a')}
            ${_summaryCard('총 출고', _fmt(totalOut) + ' EA', 'output', '#dc2626')}
          </div>

          <div class="section-card" style="margin-bottom:20px;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);font-weight:700;font-size:.97rem;">
              부품별 리워크 재공 현황
            </div>
            <div style="padding:16px 20px;">
              ${stock.length === 0
                ? '<p style="color:var(--text-muted);text-align:center;padding:24px 0;">등록된 리워크 재공품이 없습니다.</p>'
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
                      ${stock.map(function (s) {
                        return `<tr style="border-top:1px solid var(--border-color);">
                          <td style="padding:9px 12px;">${_esc(s.carModel || '-')}</td>
                          <td style="padding:9px 12px;font-weight:600;">${_esc(s.partName)}</td>
                          <td style="padding:9px 12px;">${_esc(s.color || '-')}</td>
                          <td style="padding:9px 12px;text-align:right;font-weight:700;color:${s.qty > 0 ? '#ea580c' : s.qty < 0 ? '#dc2626' : 'var(--text-muted)'};">${_fmt(s.qty)}</td>
                          <td style="padding:9px 12px;">
                            <span style="padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:600;
                                background:${s.qty > 0 ? '#ffedd5' : s.qty === 0 ? '#f1f5f9' : '#fee2e2'};
                                color:${s.qty > 0 ? '#c2410c' : s.qty === 0 ? '#64748b' : '#dc2626'};">
                              ${s.qty > 0 ? '재고있음' : s.qty === 0 ? '재고없음' : '마이너스'}
                            </span>
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>`}
            </div>
          </div>

          <div class="section-card">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);
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
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">출처</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">비고</th>
                        <th style="padding:8px 12px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${records.map(function (r) {
                        const src = r.source === 'painting_inspection' ? '외관검사' : (r.source || '-');
                        return `<tr style="border-top:1px solid var(--border-color);">
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.date)}</td>
                          <td style="padding:8px 12px;">
                            <span style="padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:700;
                                background:${r.type === '입고' ? '#dcfce7' : '#fee2e2'};
                                color:${r.type === '입고' ? '#16a34a' : '#dc2626'};">${_esc(r.type)}</span>
                          </td>
                          <td style="padding:8px 12px;">${_esc(r.carModel || '-')}</td>
                          <td style="padding:8px 12px;font-weight:600;">${_esc(r.partName)}</td>
                          <td style="padding:8px 12px;">${_esc(r.color || '-')}</td>
                          <td style="padding:8px 12px;text-align:right;font-weight:700;">${_fmt(r.qty)}</td>
                          <td style="padding:8px 12px;font-family:monospace;">${_esc(r.lotNo || '-')}</td>
                          <td style="padding:8px 12px;font-size:.8rem;color:var(--text-muted);">${_esc(src)}</td>
                          <td style="padding:8px 12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(r.note || '')}</td>
                          <td style="padding:8px 12px;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline" style="padding:2px 8px;"
                                onclick="ReworkWipModule.openEditModal('${_esc(r.id)}')">수정</button>
                            <button class="btn btn-sm" style="padding:2px 8px;color:#dc2626;border:1px solid #dc2626;background:transparent;margin-left:4px;"
                                onclick="ReworkWipModule.deleteRecord('${_esc(r.id)}')">삭제</button>
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>`}
            </div>
          </div>
        </div>`;
    }

    function _formHtml(r) {
        r = r || {};
        return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label class="form-label">날짜 *</label>
            <input id="rwDate" type="date" class="form-input" value="${_esc(r.date || _today())}">
          </div>
          <div>
            <label class="form-label">구분 *</label>
            <select id="rwType" class="form-input">
              <option value="입고" ${(r.type || '입고') === '입고' ? 'selected' : ''}>입고</option>
              <option value="출고" ${r.type === '출고' ? 'selected' : ''}>출고</option>
            </select>
          </div>
          <div>
            <label class="form-label">차종 *</label>
            <input id="rwCarModel" type="text" class="form-input" value="${_esc(r.carModel || '')}">
          </div>
          <div>
            <label class="form-label">부품명 *</label>
            <input id="rwPartName" type="text" class="form-input" value="${_esc(r.partName || '')}">
          </div>
          <div>
            <label class="form-label">색상</label>
            <input id="rwColor" type="text" class="form-input" value="${_esc(r.color || '')}">
          </div>
          <div>
            <label class="form-label">수량 (EA) *</label>
            <input id="rwQty" type="number" class="form-input" min="1" value="${r.qty != null ? r.qty : ''}">
          </div>
          <div>
            <label class="form-label">LOT No.</label>
            <input id="rwLotNo" type="text" class="form-input" value="${_esc(r.lotNo || '')}">
          </div>
          <div>
            <label class="form-label">보관위치</label>
            <input id="rwLocation" type="text" class="form-input" value="${_esc(r.location || '')}">
          </div>
          <div style="grid-column:1/-1;">
            <label class="form-label">비고</label>
            <input id="rwNote" type="text" class="form-input" value="${_esc(r.note || '')}">
          </div>
        </div>`;
    }

    function openAddModal() {
        UIUtils.showModal('리워크 재공 입출고 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord(null)">저장</button>
        `);
    }

    function openEditModal(id) {
        const rec = _getAll().find(function (r) { return r.id === id; });
        if (!rec) return;
        UIUtils.showModal('리워크 재공 수정', _formHtml(rec), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord('${id}')">저장</button>
        `);
    }

    async function saveRecord(id) {
        const date = (document.getElementById('rwDate') || {}).value || '';
        const type = (document.getElementById('rwType') || {}).value || '';
        const carModel = ((document.getElementById('rwCarModel') || {}).value || '').trim();
        const partName = ((document.getElementById('rwPartName') || {}).value || '').trim();
        const color = ((document.getElementById('rwColor') || {}).value || '').trim();
        const qty = parseInt((document.getElementById('rwQty') || {}).value, 10);
        const lotNo = ((document.getElementById('rwLotNo') || {}).value || '').trim();
        const location = ((document.getElementById('rwLocation') || {}).value || '').trim();
        const note = ((document.getElementById('rwNote') || {}).value || '').trim();

        if (!date || !type || !partName || !carModel || isNaN(qty) || qty < 1) {
            UIUtils.toast('날짜, 구분, 차종, 부품명, 수량은 필수입니다.', 'error');
            return;
        }

        const rec = {
            date, type, carModel, partName, color, qty, lotNo, location, note,
            source: 'manual',
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await Storage.update(WIP_STORE, id, rec);
            } else {
                rec.createdAt = new Date().toISOString();
                await Storage.add(WIP_STORE, rec);
            }
            UIUtils.closeModal();
            UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
            const el = document.getElementById('contentArea');
            if (el) render(el);
        } catch (e) {
            UIUtils.toast('저장 실패: ' + (e.message || e), 'error');
        }
    }

    async function deleteRecord(id) {
        if (!confirm('이 이력을 삭제하시겠습니까?')) return;
        try {
            await Storage.remove(WIP_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            const el = document.getElementById('contentArea');
            if (el) render(el);
        } catch (e) {
            UIUtils.toast('삭제 실패: ' + (e.message || e), 'error');
        }
    }

    /** 도장 검사 저장 시 리워크 입고 적립 */
    async function addFromPaintingInspection(payload) {
        const qty = Math.max(0, Number(payload && payload.qty) || 0);
        if (qty <= 0) return null;
        return Storage.add(WIP_STORE, {
            date: payload.date || _today(),
            type: '입고',
            carModel: payload.carModel || '',
            partName: payload.partName || '',
            color: payload.color || '',
            qty: qty,
            lotNo: payload.lotNo || '',
            location: payload.location || '',
            note: payload.note || '도장 외관검사 리워크',
            source: 'painting_inspection',
            paintingWorkId: payload.paintingWorkId || '',
            inspectionId: payload.inspectionId || '',
            createdAt: new Date().toISOString()
        });
    }

    return {
        render,
        init: render,
        openAddModal,
        openEditModal,
        saveRecord,
        deleteRecord,
        addFromPaintingInspection
    };
})();
