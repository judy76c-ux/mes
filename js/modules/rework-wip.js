/**
 * 리워크 재공품 현황
 * - 도장 외관검사에서 입력한 리워크수가 입고로 적립됨
 * - 차종/부품별 재고 + 입출고 이력 관리
 * - LOT은 사출LOT · 수입검사일 · 도장LOT 로 구분해 저장·표시한다
 *   (구 데이터의 단일 lotNo 는 사출LOT 폴백으로만 쓴다)
 */
var ReworkWipModule = (function () {
    const WIP_STORE = DB.STORES.REWORK_WIP;

    // 리워크 종류 — 원인별로 재발 방지 조치가 다르므로(도장 누락→도장 공정 점검,
    // 사출재작업→사출 성형 조건, 세척누락→전처리 공정) 원인을 구분해 남긴다.
    const REWORK_TYPES = ['도장 누락', '사출재작업', '세척누락', '기타'];

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

    /** 도장작업일(YYYY-MM-DD) → 도장LOT(YYMMDD) — 레이저·도장 공정과 동일 규칙 */
    function _paintLotFromDate(dateStr) {
        var d = String(dateStr || '').replace(/-/g, '').trim();
        return d.length >= 8 ? d.slice(2, 8) : '';
    }

    /**
     * 레코드에서 사출LOT·수입검사일·도장LOT를 꺼낸다.
     * 1순위: trace(승계 계보) · 2순위: 구 lotNo(사출LOT로만 해석)
     */
    function _lotFieldsOf(r) {
        var t = (typeof Trace !== 'undefined') ? Trace.of(r) : ((r && r.trace) || {});
        var inj = (t && t.inj) || {};
        var paint = (t && t.paint) || {};
        var injLot = String(inj.lot || '').trim();
        var inspDate = inj.inspDate ? String(inj.inspDate).slice(0, 10) : '';
        var paintLot = String(paint.lot || '').trim();
        var legacy = String((r && r.lotNo) || '').trim();
        // 구 데이터: 단일 lotNo만 있고 계보가 비어 있으면 사출LOT로 본다
        // (RST* 자동생성분은 사출 LOT이 아니므로 폴백하지 않음)
        if (!injLot && !inspDate && !paintLot && legacy && !/^RST/i.test(legacy)) {
            injLot = legacy;
        }
        return { injLot: injLot, inspDate: inspDate, paintLot: paintLot };
    }

    function _lotCell(v) {
        if (!v) return '<span style="color:var(--text-muted);">-</span>';
        return '<span style="font-family:monospace;white-space:nowrap;">' + _esc(v) + '</span>';
    }

    /** 표 헤더 — 사출LOT / 수입검사일 / 도장LOT */
    function _lotThHtml(pad) {
        pad = pad || '8px 12px';
        return '' +
            '<th style="padding:' + pad + ';font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>' +
            '<th style="padding:' + pad + ';font-weight:600;color:var(--text-secondary);white-space:nowrap;">수입검사일</th>' +
            '<th style="padding:' + pad + ';font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장LOT</th>';
    }

    function _lotTdHtml(r, pad) {
        pad = pad || '8px 12px';
        var f = _lotFieldsOf(r);
        return '' +
            '<td style="padding:' + pad + ';white-space:nowrap;">' + _lotCell(f.injLot) + '</td>' +
            '<td style="padding:' + pad + ';white-space:nowrap;">' + _lotCell(f.inspDate) + '</td>' +
            '<td style="padding:' + pad + ';white-space:nowrap;">' + _lotCell(f.paintLot) + '</td>';
    }

    /**
     * 폼/저장용 — 세 LOT 필드를 trace에 반영하고, 하위 호환용 lotNo(사출LOT)도 맞춘다.
     * 수정 시에도 사용자가 입력한 값으로 덮어쓴다(merge는 빈칸만 채우므로 직접 대입).
     */
    function _applyLotFieldsToRec(rec, fields, existingTrace) {
        var injLot = String((fields && fields.injLot) || '').trim();
        var inspDate = String((fields && fields.inspDate) || '').trim().slice(0, 10);
        var paintLot = String((fields && fields.paintLot) || '').trim();
        rec.lotNo = injLot;
        var base = {};
        try {
            if (typeof Trace !== 'undefined') base = Trace.clone(existingTrace || {});
            else if (existingTrace && typeof existingTrace === 'object') {
                base = JSON.parse(JSON.stringify(existingTrace));
            }
        } catch (e) { base = {}; }
        if (!base.inj || typeof base.inj !== 'object') base.inj = {};
        if (!base.paint || typeof base.paint !== 'object') base.paint = {};
        base.inj.lot = injLot;
        base.inj.inspDate = inspDate;
        if (inspDate && !base.inj.capturedAt) base.inj.capturedAt = new Date().toISOString();
        base.paint.lot = paintLot;
        if (paintLot && !base.paint.capturedAt) base.paint.capturedAt = new Date().toISOString();
        base.updatedAt = new Date().toISOString();
        rec.trace = base;
        return rec;
    }

    function _readLotFieldsFromForm(prefix) {
        prefix = prefix || 'rw';
        return {
            injLot: ((document.getElementById(prefix + 'InjLot') || {}).value || '').trim(),
            inspDate: ((document.getElementById(prefix + 'InspDate') || {}).value || '').trim(),
            paintLot: ((document.getElementById(prefix + 'PaintLot') || {}).value || '').trim()
        };
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

    // REWORK_WIP은 초기 로딩 우선순위 스토어(storage.js DEFAULT_PRIORITY_STORES)에 없어
    // 부트스트랩 직후엔 캐시가 비어 있다가 백그라운드로 나중에 채워진다. F5로 이 페이지에
    // 곧장 들어오면(=렌더가 먼저 실행됨) 빈 캐시를 그대로 그려버리고, 이후 데이터가 도착해도
    // 다시 그려주는 코드가 없어 계속 빈 화면으로 남는다(같은 세션에서 메뉴로 이동해 들어오면
    // 그때는 이미 백그라운드 로딩이 끝나 있어 정상으로 보이는 것과 대비된다).
    // 대시보드가 쓰는 것과 같은 방식으로, 이 스토어가 늦게 채워지면 한 번 다시 그린다.
    let _cacheWarmUnsub = null;
    let _cacheWarmRefreshTimer = null;
    function _bindCacheWarmRefreshOnce() {
        if (typeof Storage === 'undefined' || typeof Storage.onCacheWarm !== 'function') return;
        if (_cacheWarmUnsub) return;
        _cacheWarmUnsub = Storage.onCacheWarm(function (storeName) {
            if (!document.querySelector('[data-rework-wip-page]')) return;
            if (storeName !== '*' && storeName !== WIP_STORE) return;
            if (_cacheWarmRefreshTimer) return;
            _cacheWarmRefreshTimer = setTimeout(function () {
                _cacheWarmRefreshTimer = null;
                const c = document.getElementById('contentArea');
                if (c && document.querySelector('[data-rework-wip-page]')) { try { render(c); } catch (e) {} }
            }, 250);
        });
    }

    function render(container) {
        _bindCacheWarmRefreshOnce();
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
        <div class="fade-in-up" data-rework-wip-page="1">
            ${typeof PaintingNavUI !== 'undefined' ? PaintingNavUI.render('painting-rework-wip') : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0;font-size:1.1rem;font-weight:800;">리워크 재공품</h3>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">도장 외관검사 리워크수 → 재공 입고 · 수동 출고로 재고 관리 · LOT은 사출·수입검사일·도장으로 구분</div>
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
                : `<table class="data-table data-table--content" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;font-size:.9rem;">
                    <thead>
                      <tr style="background:var(--bg-secondary);text-align:left;">
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">부품명</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">색상</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap;">재공수량(EA)</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${stock.map(function (s) {
                        return `<tr style="border-top:1px solid var(--border-color);">
                          <td style="padding:9px 12px;white-space:nowrap;">${_esc(s.carModel || '-')}</td>
                          <td style="padding:9px 12px;font-weight:600;white-space:nowrap;">${_esc(s.partName)}</td>
                          <td style="padding:9px 12px;white-space:nowrap;">${_esc(s.color || '-')}</td>
                          <td style="padding:9px 12px;text-align:right;font-weight:700;color:${s.qty > 0 ? '#ea580c' : s.qty < 0 ? '#dc2626' : 'var(--text-muted)'};">${_fmt(s.qty)}</td>
                          <td style="padding:9px 12px;white-space:nowrap;">
                            <span style="padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:600;
                                background:${s.qty > 0 ? '#ffedd5' : s.qty === 0 ? '#f1f5f9' : '#fee2e2'};
                                color:${s.qty > 0 ? '#c2410c' : s.qty === 0 ? '#64748b' : '#dc2626'};">
                              ${s.qty > 0 ? '재고있음' : s.qty === 0 ? '재고없음' : '마이너스'}
                            </span>
                          </td>
                          <td style="padding:9px 12px;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline" style="padding:3px 10px;font-size:.78rem;"
                                onclick="ReworkWipModule.openStockDetailModal('${_esc(s.carModel || '')}','${_esc(s.partName || '')}','${_esc(s.color || '')}')">
                                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-3px;">visibility</span> 보기
                            </button>
                            ${s.qty > 0
                              ? `<button class="btn btn-sm btn-primary" style="padding:3px 10px;font-size:.78rem;margin-left:4px;"
                                    onclick="ReworkWipModule.openDispatchModal('${_esc(s.carModel || '')}','${_esc(s.partName || '')}','${_esc(s.color || '')}',${s.qty})">
                                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-3px;">output</span> 출고 등록
                                 </button>`
                              : ''}
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
                : `<table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:.88rem;">
                    <thead>
                      <tr style="background:var(--bg-secondary);text-align:left;">
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">날짜</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">구분</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">부품명</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">색상</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap;">수량(EA)</th>
                        ${_lotThHtml('8px 12px')}
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">리워크 종류</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">출처</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);">비고</th>
                        <th style="padding:8px 12px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${records.map(function (r) {
                        const src = r.source === 'painting_inspection' ? '외관검사'
                            : (r.source === 'dispatch_to_line' ? '현장출고' : (r.source || '-'));
                        return `<tr style="border-top:1px solid var(--border-color);">
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.date)}</td>
                          <td style="padding:8px 12px;white-space:nowrap;">
                            <span style="padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:700;
                                background:${r.type === '입고' ? '#dcfce7' : '#fee2e2'};
                                color:${r.type === '입고' ? '#16a34a' : '#dc2626'};">${_esc(r.type)}</span>
                          </td>
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.carModel || '-')}</td>
                          <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${_esc(r.partName)}</td>
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.color || '-')}</td>
                          <td style="padding:8px 12px;text-align:right;font-weight:700;white-space:nowrap;">${_fmt(r.qty)}</td>
                          ${_lotTdHtml(r, '8px 12px')}
                          <td style="padding:8px 12px;white-space:nowrap;">${_reworkTypeBadge(r.reworkType)}</td>
                          <td style="padding:8px 12px;font-size:.8rem;color:var(--text-muted);white-space:nowrap;">${_esc(src)}</td>
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
        var lots = _lotFieldsOf(r);
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
          <div style="grid-column:1/-1;padding:10px 12px;border-radius:8px;border:1px solid rgba(37,99,235,.25);
                      background:rgba(37,99,235,.04);">
            <div style="font-size:0.78rem;font-weight:700;color:var(--accent-blue);margin-bottom:8px;">
              LOT 계보 (사출 · 수입검사일 · 도장)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
              <div>
                <label class="form-label">사출LOT</label>
                <input id="rwInjLot" type="text" class="form-input" style="width:auto;min-width:8em;font-family:monospace;"
                    value="${_esc(lots.injLot)}" placeholder="예: 260626">
              </div>
              <div>
                <label class="form-label">수입검사일</label>
                <input id="rwInspDate" type="date" class="form-input" value="${_esc(lots.inspDate)}">
              </div>
              <div>
                <label class="form-label">도장LOT</label>
                <input id="rwPaintLot" type="text" class="form-input" style="width:auto;min-width:8em;font-family:monospace;"
                    value="${_esc(lots.paintLot)}" placeholder="예: 260728 (도장작업일 YYMMDD)">
              </div>
            </div>
          </div>
          <div>
            <label class="form-label">보관위치</label>
            <input id="rwLocation" type="text" class="form-input" value="${_esc(r.location || '')}">
          </div>
          <div>
            <label class="form-label">리워크 종류</label>
            <select id="rwReworkType" class="form-input">
              <option value="">-- 선택 --</option>
              ${REWORK_TYPES.map(function (t) {
                return `<option value="${_esc(t)}" ${r.reworkType === t ? 'selected' : ''}>${_esc(t)}</option>`;
              }).join('')}
            </select>
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

    // 「보기」 상세 모달에서 수정을 마친 뒤 그 상세 모달을 새 데이터로 다시 열기 위한 예약값.
    // 일반 경로(입출고 이력 표)로 수정할 땐 재오픈이 필요 없으므로 매번 openEditModal에서 비운다.
    let _reopenDetailAfterSave = null;

    function openEditModal(id) {
        _reopenDetailAfterSave = null;
        const rec = _getAll().find(function (r) { return r.id === id; });
        if (!rec) return;
        UIUtils.showModal('리워크 재공 수정', _formHtml(rec), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord('${id}')">저장</button>
        `);
    }

    /** 재공현황 「보기」 상세 모달 안에서 여는 수정 — 저장 후 그 상세 모달을 새로고침해 재오픈한다. */
    function openEditFromDetail(id, carModel, partName, color) {
        _reopenDetailAfterSave = { carModel: carModel, partName: partName, color: color };
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
        const location = ((document.getElementById('rwLocation') || {}).value || '').trim();
        const note = ((document.getElementById('rwNote') || {}).value || '').trim();
        const reworkType = ((document.getElementById('rwReworkType') || {}).value || '').trim();
        const lotFields = _readLotFieldsFromForm('rw');

        if (!date || !type || !partName || !carModel || isNaN(qty) || qty < 1) {
            UIUtils.toast('날짜, 구분, 차종, 부품명, 수량은 필수입니다.', 'error');
            return;
        }

        const existing = id ? _getAll().find(function (r) { return r.id === id; }) : null;
        const rec = {
            date, type, carModel, partName, color, qty, location, note, reworkType,
            updatedAt: new Date().toISOString()
        };
        _applyLotFieldsToRec(rec, lotFields, existing && existing.trace);

        try {
            if (id) {
                // 출처(source)·외관검사 연동 ID는 건드리지 않는다 — 외관검사 자동 적립 건을
                // 수정해도 "외관검사" 배지가 사라지지 않게.
                await Storage.update(WIP_STORE, id, rec);
            } else {
                rec.source = 'manual';
                rec.createdAt = new Date().toISOString();
                await Storage.add(WIP_STORE, rec);
            }
            UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
            const el = document.getElementById('contentArea');
            if (el) render(el);

            if (_reopenDetailAfterSave) {
                const d = _reopenDetailAfterSave;
                _reopenDetailAfterSave = null;
                UIUtils.closeModal();
                UIUtils.closeModal();
                setTimeout(function () { openStockDetailModal(d.carModel, d.partName, d.color); }, 80);
            } else {
                UIUtils.closeModal();
            }
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

    // ── 리워크 재공품 → 도장현장 출고 ──────────────────────────────
    // 사출 자재와 동일하게, 리워크 재공품도 도장현장(라인)으로 출고하면 그 라인의
    // "도장 자재"(PAINTING_INPUT_INVENTORY) 현장 입고로 잡혀 도장 작업 투입에 쓸 수 있게 한다.
    // 재공품 재고(WIP_STORE)에서는 출고로 차감하고, 동시에 현장 입고 기록을 만드는 2단계 처리다.
    function _normDispatchLine(v) {
        const s = String(v || '').trim();
        if (/-?b$/i.test(s) || s === '도장(B)') return '도장-B';
        return '도장-A';
    }

    /** 이 품목 입고분에서 계보를 찾아 출고 폼 기본값으로 쓴다 (FIFO: 가장 오래된 입고) */
    function _defaultLotsForStock(carModel, partName, color) {
        try {
            const src = _getAll()
                .filter(function (rec) {
                    return rec.type === '입고' &&
                        (rec.carModel || '') === carModel && rec.partName === partName && (rec.color || '') === color;
                })
                .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
            if (!src.length) return { injLot: '', inspDate: '', paintLot: '', trace: undefined };
            const f = _lotFieldsOf(src[0]);
            return { injLot: f.injLot, inspDate: f.inspDate, paintLot: f.paintLot, trace: src[0].trace };
        } catch (e) {
            return { injLot: '', inspDate: '', paintLot: '', trace: undefined };
        }
    }

    function openDispatchModal(carModel, partName, color, availableQty) {
        const max = Math.max(0, Number(availableQty) || 0);
        if (max <= 0) { UIUtils.toast('출고할 재공 재고가 없습니다.', 'warning'); return; }
        const defs = _defaultLotsForStock(carModel, partName, color);
        UIUtils.showModal('리워크 재공품 → 도장현장 출고',
            `<div style="padding:4px 0;">
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.6;">
                    <div><strong>${_esc(carModel || '-')} · ${_esc(partName)}</strong>${color ? ' · ' + _esc(color) : ''}</div>
                    <div style="color:var(--text-muted);">현재 재공 재고 <strong>${_fmt(max)} EA</strong></div>
                </div>
                <div style="margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid rgba(37,99,235,.3);
                            background:rgba(37,99,235,.06);font-size:0.81rem;line-height:1.55;">
                    출고하면 재공 재고에서 즉시 빠지고, 선택한 라인의 <strong>「도장 자재」 현장 입고</strong>로 바로 잡힙니다
                    (사출 자재 생산출고와 동일한 방식). 별도 확인 절차 없이 즉시 투입 가능합니다.
                </div>
                <div class="form-group" style="margin-top:12px;">
                    <label class="form-label">도착 라인 <span style="color:var(--accent-red)">*</span></label>
                    <select id="rwDispLine" class="form-input">
                        <option value="도장-A">도장-A</option>
                        <option value="도장-B">도장-B</option>
                    </select>
                </div>
                <div class="form-group" style="margin-top:10px;">
                    <label class="form-label">출고 수량 (EA) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="rwDispQty" value="${max}" min="1" max="${max}"
                        style="max-width:180px;text-align:right;font-weight:700;">
                    <div style="margin-top:4px;font-size:0.76rem;color:var(--text-muted);">최대 ${_fmt(max)} EA</div>
                </div>
                <div style="margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-secondary);">
                    <div style="font-size:0.78rem;font-weight:700;margin-bottom:8px;color:var(--text-secondary);">
                        LOT 계보 (사출 · 수입검사일 · 도장)
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                        <div>
                            <label class="form-label">사출LOT</label>
                            <input type="text" class="form-input" id="rwDispInjLot" style="width:auto;min-width:7em;font-family:monospace;"
                                value="${_esc(defs.injLot)}" placeholder="비우면 자동(RST)">
                        </div>
                        <div>
                            <label class="form-label">수입검사일</label>
                            <input type="date" class="form-input" id="rwDispInspDate" value="${_esc(defs.inspDate)}">
                        </div>
                        <div>
                            <label class="form-label">도장LOT</label>
                            <input type="text" class="form-input" id="rwDispPaintLot" style="width:auto;min-width:7em;font-family:monospace;"
                                value="${_esc(defs.paintLot)}" placeholder="예: 260728">
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin-top:10px;">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="rwDispNote" placeholder="예: 리워크 완료품 도장현장 재투입">
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary"
                onclick="ReworkWipModule.submitDispatch('${_esc(carModel || '')}','${_esc(partName)}','${_esc(color || '')}',${max})">
                출고 처리</button>`,
            '640px');
    }

    async function submitDispatch(carModel, partName, color, availableQty) {
        const max = Math.max(0, Number(availableQty) || 0);
        const lineEl = document.getElementById('rwDispLine');
        const qtyEl = document.getElementById('rwDispQty');
        const noteEl = document.getElementById('rwDispNote');

        const line = _normDispatchLine(lineEl ? lineEl.value : '도장-A');
        const qty = Math.floor(Number(qtyEl && qtyEl.value) || 0);
        if (!(qty > 0)) { UIUtils.toast('출고 수량을 입력하세요.', 'warning'); qtyEl && qtyEl.focus(); return; }
        if (qty > max) { UIUtils.toast(`재공 재고(${_fmt(max)} EA)를 초과할 수 없습니다.`, 'warning'); qtyEl && qtyEl.focus(); return; }

        const lotFields = _readLotFieldsFromForm('rwDisp');
        let injLot = lotFields.injLot;
        if (!injLot) {
            // 사출 LOT 형식(YYMMDD)과 겹치지 않도록 RST 접두어로 자동 생성 — 사출창고 화면의
            // LOT 형식 검증(_isValidLotFormat)이 RST+숫자도 정상 LOT으로 인정한다.
            injLot = 'RST' + Date.now().toString().slice(-8);
            lotFields.injLot = injLot;
        }
        const note = String((noteEl && noteEl.value) || '').trim() || '리워크 재공품 도장현장 출고';

        const actor = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? (AuthModule.getCurrentUser() || {}).displayName || '' : '';
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

        // 계보 승계 — 입고 원본 trace + 폼에서 고친 LOT를 합친다
        const defs = _defaultLotsForStock(carModel, partName, color);
        const outRec = {
            date: _today(),
            type: '출고',
            carModel, partName, color,
            qty,
            note: note + ' (' + line + ')',
            source: 'dispatch_to_line',
            createdAt: new Date().toISOString()
        };
        _applyLotFieldsToRec(outRec, lotFields, defs.trace);

        try {
            // ① 재공 재고 차감
            await Storage.add(WIP_STORE, outRec);

            // ② 도장현장 입고 — 사출 자재와 동일하게 PAINTING_INPUT_INVENTORY에 반영
            //    lots[].lotNo 는 사출LOT(현장 투입 선택 키). 계보(trace)에 수입검사일·도장LOT 유지.
            if (typeof DB !== 'undefined' && DB.STORES && DB.STORES.PAINTING_INPUT_INVENTORY) {
                await Storage.add(DB.STORES.PAINTING_INPUT_INVENTORY, {
                    date: now,
                    type: '입고',
                    line, paintLine: line,
                    carModel, partName, color,
                    lots: [{ lotNo: injLot, qty }],
                    lotNo: injLot, quantity: qty, unit: 'EA',
                    source: '리워크 재공품 출고',
                    siteReceived: true,
                    receivedBy: actor,
                    receivedAt: now,
                    trace: outRec.trace,
                    note
                });
            }

            UIUtils.closeModal();
            UIUtils.toast(`${_fmt(qty)} EA를 ${line} 현장으로 출고 처리했습니다.`, 'success');
            const el = document.getElementById('contentArea');
            if (el) render(el);
        } catch (e) {
            UIUtils.toast('출고 처리 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    function _reworkTypeBadge(t) {
        if (!t) return '<span style="color:var(--text-muted);">-</span>';
        return `<span style="padding:1px 8px;border-radius:20px;font-size:.72rem;font-weight:700;
                    background:#ede9fe;color:#6d28d9;">${_esc(t)}</span>`;
    }

    /**
     * 재공현황 「보기」 — 이 품목(차종·부품명·색상)의 재공수량을 이루는 개별 입고 건마다
     * 사출LOT·수입검사일·도장LOT와 리워크 종류를 나열한다.
     */
    function openStockDetailModal(carModel, partName, color) {
        const all = _getAll().filter(function (r) {
            return (r.carModel || '') === carModel && r.partName === partName && (r.color || '') === color;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        const totalQty = all.reduce(function (s, r) {
            return s + (r.type === '입고' ? (Number(r.qty) || 0) : -(Number(r.qty) || 0));
        }, 0);
        const inboundRows = all.filter(function (r) { return r.type === '입고'; });

        const rowsHtml = inboundRows.length
            ? `<div style="overflow-x:auto;"><table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:.86rem;">
                <thead>
                  <tr style="background:var(--bg-secondary);text-align:left;">
                    <th style="padding:7px 10px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">입고일</th>
                    <th style="padding:7px 10px;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap;">수량</th>
                    ${_lotThHtml('7px 10px')}
                    <th style="padding:7px 10px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">리워크 종류</th>
                    <th style="padding:7px 10px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">출처</th>
                    <th style="padding:7px 10px;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${inboundRows.map(function (r) {
                    const src = r.source === 'painting_inspection' ? '외관검사' : (r.source || '-');
                    return `<tr style="border-top:1px solid var(--border-color);">
                      <td style="padding:7px 10px;white-space:nowrap;">${_esc(r.date)}</td>
                      <td style="padding:7px 10px;text-align:right;font-weight:700;white-space:nowrap;">${_fmt(r.qty)}</td>
                      ${_lotTdHtml(r, '7px 10px')}
                      <td style="padding:7px 10px;white-space:nowrap;">${_reworkTypeBadge(r.reworkType)}</td>
                      <td style="padding:7px 10px;font-size:.8rem;color:var(--text-muted);white-space:nowrap;">${_esc(src)}</td>
                      <td style="padding:7px 10px;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 8px;"
                            onclick="ReworkWipModule.openEditFromDetail('${_esc(r.id)}','${_esc(carModel || '')}','${_esc(partName)}','${_esc(color || '')}')">수정</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>`
            : '<p style="color:var(--text-muted);text-align:center;padding:20px 0;">입고 이력이 없습니다.</p>';

        UIUtils.showModal(`${carModel || '-'} · ${partName}${color ? ' · ' + color : ''}`,
            `<div style="padding:4px 0;">
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.86rem;margin-bottom:12px;">
                    현재 재공수량 <strong style="color:${totalQty > 0 ? '#ea580c' : 'var(--text-muted)'};">${_fmt(totalQty)} EA</strong>
                    · 입고 이력 ${inboundRows.length}건
                </div>
                ${rowsHtml}
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            '960px');
    }

    /** 도장 검사 저장 시 리워크 입고 적립 */
    async function addFromPaintingInspection(payload) {
        const qty = Math.max(0, Number(payload && payload.qty) || 0);
        if (qty <= 0) return null;

        // 계보 정리 — work.trace 승계 + 도장LOT(없으면 도장작업일 YYMMDD) 보강
        var parentTrace = (payload.trace && typeof payload.trace === 'object') ? payload.trace : undefined;
        var injLot = '';
        var inspDate = '';
        var paintLot = '';
        try {
            var t = (typeof Trace !== 'undefined') ? Trace.of({ trace: parentTrace }) : (parentTrace || {});
            injLot = String((t.inj && t.inj.lot) || '').trim();
            inspDate = (t.inj && t.inj.inspDate) ? String(t.inj.inspDate).slice(0, 10) : '';
            paintLot = String((t.paint && t.paint.lot) || '').trim();
        } catch (e) { /* ignore */ }
        if (!injLot) injLot = String(payload.lotNo || '').trim();
        if (!paintLot) paintLot = _paintLotFromDate(payload.paintingDate || payload.date);

        const rec = {
            date: payload.date || _today(),
            type: '입고',
            carModel: payload.carModel || '',
            partName: payload.partName || '',
            color: payload.color || '',
            qty: qty,
            location: payload.location || '',
            note: payload.note || '도장 외관검사 리워크',
            source: 'painting_inspection',
            paintingWorkId: payload.paintingWorkId || '',
            inspectionId: payload.inspectionId || '',
            createdAt: new Date().toISOString()
        };
        _applyLotFieldsToRec(rec, { injLot: injLot, inspDate: inspDate, paintLot: paintLot }, parentTrace);
        return Storage.add(WIP_STORE, rec);
    }

    return {
        render,
        init: render,
        openAddModal,
        openEditModal,
        openEditFromDetail,
        saveRecord,
        deleteRecord,
        openDispatchModal,
        submitDispatch,
        openStockDetailModal,
        addFromPaintingInspection
    };
})();
