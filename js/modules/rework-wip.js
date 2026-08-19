/**
 * 재사용 자재 현황
 * - 도장 외관검사에서 입력한 리워크수가 입고로 적립됨
 * - 차종/부품별 재고 + 입출고 이력 관리
 * - LOT은 사출LOT · 수입검사일 · 도장LOT 로 구분해 저장·표시한다
 *   (구 데이터의 단일 lotNo 는 사출LOT 폴백으로만 쓴다)
 */
var ReworkWipModule = (function () {
    const WIP_STORE = DB.STORES.REWORK_WIP;

    // 리워크 종류 — 원인별로 재발 방지 조치가 다르므로(도장 누락→도장 공정 점검,
    // 사출재작업→사출 성형 조건, 세척누락→전처리 공정) 원인을 구분해 남긴다.
    const REWORK_TYPES = ['도장 누락', '사출재작업', '세척누락', '소량 잔량'];

    // 보관위치 — 자재창고 / 도장현장만 선택
    const LOCATIONS = ['자재창고', '도장현장'];

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

    /** 사출자재 마스터 — 리워크 품명은 제작품명(T1XX KNOB LOWER)이 아니라 사출명(KNOB LOWER)을 쓴다. */
    function _injMats() {
        try {
            return (DB.STORES && DB.STORES.INJECTION_MATERIALS)
                ? (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [])
                : [];
        } catch (e) { return []; }
    }
    function _namesLooselyRelated(a, b) {
        var na = String(a || '').toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '');
        var nb = String(b || '').toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '');
        if (!na || !nb) return false;
        if (na === nb) return true;
        if (na.length >= 3 && nb.length >= 3 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) return true;
        return false;
    }
    /** 제작품명 → 사출명. 이미 사출명이면 그대로. 매칭 실패 시 원문. */
    function _toInjPartName(carModel, partName) {
        var p = String(partName || '').trim();
        if (!p) return '';
        var car = String(carModel || '').trim();
        var mats = _injMats();
        var asInj = mats.find(function (m) {
            return String(m.injPartName || '').trim() === p && (!car || !m.carModel || m.carModel === car);
        });
        if (asInj) return String(asInj.injPartName).trim();
        var fromMfg = mats.find(function (m) {
            if (!m || !String(m.injPartName || '').trim()) return false;
            if (car && m.carModel && m.carModel !== car) return false;
            return String(m.mfgProductName || '').trim() === p || String(m.mfgProductName2 || '').trim() === p;
        });
        if (fromMfg) return String(fromMfg.injPartName).trim();
        var loose = mats.filter(function (m) {
            if (!m || !String(m.injPartName || '').trim()) return false;
            if (car && m.carModel && m.carModel !== car) return false;
            return _namesLooselyRelated(p, m.injPartName)
                || _namesLooselyRelated(p, m.mfgProductName)
                || _namesLooselyRelated(p, m.mfgProductName2);
        });
        if (loose.length === 1) return String(loose[0].injPartName).trim();
        return p;
    }
    function _partsMatch(a, b, carModel) {
        var x = String(a || '').trim();
        var y = String(b || '').trim();
        if (!y) return true;
        if (!x) return false;
        if (x === y) return true;
        var ix = _toInjPartName(carModel, x);
        var iy = _toInjPartName(carModel, y);
        if (ix && iy && ix === iy) return true;
        return _namesLooselyRelated(x, y);
    }
    function _displayPartName(carModel, partName) {
        return _toInjPartName(carModel, partName) || String(partName || '').trim();
    }

    function _calcStock(records) {
        const map = {};
        records.forEach(function (r) {
            const injPart = _displayPartName(r.carModel, r.partName);
            const key = (r.carModel || '') + '||' + injPart + '||' + (r.color || '');
            if (!map[key]) {
                map[key] = { carModel: r.carModel, partName: injPart, color: r.color, qty: 0 };
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

    function _colorAlias(c) {
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.normalizeColorAlias === 'function') {
            return UIUtils.normalizeColorAlias(c);
        }
        return String(c || '').trim().toLowerCase();
    }

    function _colorsEqual(a, b) {
        const x = String(a || '').trim();
        const y = String(b || '').trim();
        if (!x || !y) return !x && !y;
        return _colorAlias(x) === _colorAlias(y);
    }

    /**
     * 차종·사출명·컬러 기준 리워크 재공 재고.
     * 사출창고 「현장 입고 부족」에서 IL 등 리워크 투입품의 현재고로 쓴다.
     * 재공 쪽 품명이 "IL BLACK"처럼 합쳐진 경우도 매칭한다.
     */
    function getStockQty(carModel, partName, color) {
        const wantCar = String(carModel || '').trim();
        const wantPart = String(partName || '').trim();
        const wantColor = String(color || '').trim();
        const combined = (wantPart + (wantColor ? ' ' + wantColor : '')).trim();
        let total = 0;
        _getAll().forEach(function (r) {
            const rCar = String(r.carModel || '').trim();
            const rPart = String(r.partName || '').trim();
            const rColor = String(r.color || '').trim();
            if (wantCar && rCar && rCar !== wantCar) return;
            let partOk = _partsMatch(rPart, wantPart, wantCar);
            if (!partOk && combined && rPart.replace(/\s+/g, ' ').toUpperCase() === combined.replace(/\s+/g, ' ').toUpperCase()) {
                partOk = true;
            }
            if (!partOk) return;
            // 합쳐진 품명으로 이미 컬러를 포함한 경우 컬러 추가 비교는 생략
            const partIncludesColor = combined && rPart.replace(/\s+/g, ' ').toUpperCase() === combined.replace(/\s+/g, ' ').toUpperCase();
            if (!partIncludesColor && wantColor && rColor && !_colorsEqual(wantColor, rColor)) return;
            if (r.type === '입고') total += Number(r.qty) || 0;
            else total -= Number(r.qty) || 0;
        });
        return Math.max(0, total);
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
                <h3 style="margin:0;font-size:1.1rem;font-weight:800;">재사용 자재</h3>
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
              사출명별 재사용 자재 현황
            </div>
            <div style="padding:16px 20px;">
              ${stock.length === 0
                ? '<p style="color:var(--text-muted);text-align:center;padding:24px 0;">등록된 재사용 자재가 없습니다.</p>'
                : `<table class="data-table data-table--content" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;font-size:.9rem;">
                    <thead>
                      <tr style="background:var(--bg-secondary);text-align:left;">
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출명</th>
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
                        <th style="padding:8px 12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출명</th>
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
                            : (r.source === 'dispatch_to_line' ? '현장출고'
                            : (r.source === 'site_return' ? '현장반납' : (r.source || '-')));
                        return `<tr style="border-top:1px solid var(--border-color);">
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.date)}</td>
                          <td style="padding:8px 12px;white-space:nowrap;">
                            <span style="padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:700;
                                background:${r.type === '입고' ? '#dcfce7' : '#fee2e2'};
                                color:${r.type === '입고' ? '#16a34a' : '#dc2626'};">${_esc(r.type)}</span>
                          </td>
                          <td style="padding:8px 12px;white-space:nowrap;">${_esc(r.carModel || '-')}</td>
                          <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${_esc(_displayPartName(r.carModel, r.partName))}</td>
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

    function _productRows() {
        try { return Storage.getAll(DB.STORES.PRODUCTS) || []; } catch (e) { return []; }
    }

    function _uniqueSorted(values) {
        return [...new Set((values || []).map(function (v) { return String(v || '').trim(); }).filter(Boolean))]
            .sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    }

    /** 제품 마스터 + 기존 재공이력에서 차종 목록 */
    function _carModels() {
        const products = _productRows();
        const fromMaster = products.map(function (p) { return p.carModel; });
        const fromWip = _getAll().map(function (r) { return r.carModel; });
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.sortCarModels === 'function') {
            return UIUtils.sortCarModels(fromMaster.concat(fromWip), products);
        }
        return _uniqueSorted(fromMaster.concat(fromWip));
    }

    function _partNames(carModel) {
        const car = String(carModel || '').trim();
        if (!car) return [];
        const fromMats = _injMats()
            .filter(function (m) { return !car || !m.carModel || m.carModel === car; })
            .map(function (m) { return String(m.injPartName || '').trim(); });
        const fromWip = _getAll()
            .filter(function (r) { return String(r.carModel || '').trim() === car; })
            .map(function (r) { return _displayPartName(r.carModel, r.partName); });
        return _uniqueSorted(fromMats.concat(fromWip).filter(Boolean));
    }

    function _colors(carModel, partName) {
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        if (!car || !part) return [];
        const fromMats = _injMats()
            .filter(function (m) {
                if (car && m.carModel && m.carModel !== car) return false;
                return _partsMatch(m.injPartName, part, car)
                    || _partsMatch(m.mfgProductName, part, car)
                    || _partsMatch(m.mfgProductName2, part, car);
            })
            .map(function (m) { return m.injColor || m.color; });
        const fromWip = _getAll()
            .filter(function (r) { return String(r.carModel || '').trim() === car && _partsMatch(r.partName, part, car); })
            .map(function (r) { return r.color; });
        const fromProd = _productRows()
            .filter(function (p) { return p.carModel === car && _partsMatch(p.partName, part, car); })
            .map(function (p) { return p.color; });
        return _uniqueSorted(fromMats.concat(fromWip).concat(fromProd).filter(Boolean));
    }

    function _selectOpts(list, selected, emptyLabel) {
        const sel = String(selected || '').trim();
        const items = (list || []).slice();
        let extra = '';
        if (sel && items.indexOf(sel) < 0) {
            extra = `<option value="${_esc(sel)}" selected>${_esc(sel)} (기존)</option>`;
        }
        return `<option value="">${emptyLabel}</option>` + extra +
            items.map(function (v) {
                return `<option value="${_esc(v)}" ${v === sel ? 'selected' : ''}>${_esc(v)}</option>`;
            }).join('');
    }

    function _partSelectHtml(carModel, selected) {
        const car = String(carModel || '').trim();
        if (!car) return '<option value="">-- 차종 먼저 선택 --</option>';
        return _selectOpts(_partNames(car), selected, '-- 사출명 선택 --');
    }

    function _colorSelectHtml(carModel, partName, selected) {
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        if (!car || !part) return '<option value="">-- 사출명 먼저 선택 --</option>';
        return _selectOpts(_colors(car, part), selected, '-- 선택 --');
    }

    function onCarModelChange() {
        const car = ((document.getElementById('rwCarModel') || {}).value || '').trim();
        const partEl = document.getElementById('rwPartName');
        const colorEl = document.getElementById('rwColor');
        const parts = _partNames(car);
        if (partEl) {
            partEl.innerHTML = _partSelectHtml(car, parts.length === 1 ? parts[0] : '');
        }
        const part = partEl ? String(partEl.value || '').trim() : '';
        if (colorEl) {
            if (car && part) {
                const colors = _colors(car, part);
                colorEl.innerHTML = _colorSelectHtml(car, part, colors.length === 1 ? colors[0] : '');
            } else {
                colorEl.innerHTML = '<option value="">-- 사출명 먼저 선택 --</option>';
            }
        }
    }

    function onPartNameChange() {
        const car = ((document.getElementById('rwCarModel') || {}).value || '').trim();
        const part = ((document.getElementById('rwPartName') || {}).value || '').trim();
        const colorEl = document.getElementById('rwColor');
        if (!colorEl) return;
        if (car && part) {
            const colors = _colors(car, part);
            colorEl.innerHTML = _colorSelectHtml(car, part, colors.length === 1 ? colors[0] : '');
        } else {
            colorEl.innerHTML = '<option value="">-- 사출명 먼저 선택 --</option>';
        }
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
            <select id="rwCarModel" class="form-input" onchange="ReworkWipModule.onCarModelChange()">
              ${_selectOpts(_carModels(), r.carModel || '', '-- 차종 선택 --')}
            </select>
          </div>
          <div>
            <label class="form-label">사출명 *</label>
            <select id="rwPartName" class="form-input" onchange="ReworkWipModule.onPartNameChange()">
              ${_partSelectHtml(r.carModel || '', _displayPartName(r.carModel, r.partName) || r.partName || '')}
            </select>
          </div>
          <div>
            <label class="form-label">색상</label>
            <select id="rwColor" class="form-input">
              ${_colorSelectHtml(r.carModel || '', _displayPartName(r.carModel, r.partName) || r.partName || '', r.color || '')}
            </select>
          </div>
          <div>
            <label class="form-label">수량 (EA) *</label>
            <input id="rwQty" type="number" class="form-input" min="1" value="${r.qty != null ? r.qty : ''}">
          </div>
          <div style="grid-column:1/-1;padding:10px 12px;border-radius:8px;border:1px solid rgba(37,99,235,.25);
                      background:rgba(37,99,235,.04);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-size:0.78rem;font-weight:700;color:var(--accent-blue);">
                LOT 계보 (사출 · 수입검사일 · 도장)
              </div>
              <button type="button" class="btn btn-sm btn-outline" onclick="ReworkWipModule.openInjLotLookup()"
                  title="사출 수입검사 이력에서 LOT·검사일을 찾아 채웁니다">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">manage_search</span>
                사출 이력에서 찾기
              </button>
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
            <select id="rwLocation" class="form-input">
              <option value="">-- 선택 --</option>
              ${LOCATIONS.map(function (loc) {
                return `<option value="${_esc(loc)}" ${r.location === loc ? 'selected' : ''}>${_esc(loc)}</option>`;
              }).join('')}
              ${r.location && LOCATIONS.indexOf(r.location) < 0
                ? `<option value="${_esc(r.location)}" selected>${_esc(r.location)} (기존)</option>`
                : ''}
            </select>
          </div>
          <div>
            <label class="form-label">리워크 종류</label>
            <select id="rwReworkType" class="form-input">
              <option value="">-- 선택 --</option>
              ${REWORK_TYPES.map(function (t) {
                return `<option value="${_esc(t)}" ${r.reworkType === t ? 'selected' : ''}>${_esc(t)}</option>`;
              }).join('')}
              ${r.reworkType && REWORK_TYPES.indexOf(r.reworkType) < 0
                ? `<option value="${_esc(r.reworkType)}" selected>${_esc(r.reworkType)} (기존)</option>`
                : ''}
            </select>
          </div>
          <div style="grid-column:1/-1;">
            <label class="form-label">비고</label>
            <input id="rwNote" type="text" class="form-input" value="${_esc(r.note || '')}">
          </div>
        </div>`;
    }

    function openAddModal() {
        UIUtils.showModal('재사용 자재 입출고 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord(null)">저장</button>
        `);
    }

    /** 사출LOT·수입검사일을 손으로 옮겨 적다 생기는 오타를 막기 위해, 폼에 선택된
     *  차종·부품명(+색상)과 일치하는 사출 수입검사 이력을 찾아 골라 채울 수 있게 한다. */
    function openInjLotLookup() {
        const carModel = ((document.getElementById('rwCarModel') || {}).value || '').trim();
        const partName = ((document.getElementById('rwPartName') || {}).value || '').trim();
        const color = ((document.getElementById('rwColor') || {}).value || '').trim();
        if (!carModel || !partName) {
            UIUtils.toast('차종·사출명을 먼저 선택하세요.', 'warning');
            return;
        }
        const inspections = (Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [])
            .filter(function (i) {
                return String(i.carModel || '').trim() === carModel && _partsMatch(i.partName, partName, carModel);
            })
            .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

        // 색상까지 일치하는 이력을 우선 보여주되, 없으면 색상 무시하고 전체를 보여준다
        // (LOT 오타 예방이 목적이므로, 후보를 좁혀서 아예 못 찾는 것보다 넓게 보여주는 편이 안전).
        const byColor = color ? inspections.filter(function (i) { return !i.color || String(i.color).trim() === color; }) : inspections;
        const filtered = byColor.length ? byColor : inspections;

        if (!filtered.length) {
            UIUtils.toast('일치하는 사출 수입검사 이력이 없습니다.', 'info');
            return;
        }

        const rowsHtml = filtered.slice(0, 30).flatMap(function (insp) {
            const lots = (insp.lots && insp.lots.length) ? insp.lots : (insp.lotNo ? [{ lotNo: insp.lotNo, qty: insp.passQty }] : []);
            const dateOnly = String(insp.date || '').slice(0, 10);
            return lots.map(function (l) {
                const lotNo = String(l.lotNo || '').trim();
                if (!lotNo) return '';
                return `<tr style="cursor:pointer;border-top:1px solid var(--border-color);"
                        onmouseover="this.style.background='rgba(37,99,235,0.06)'" onmouseout="this.style.background=''"
                        onclick="ReworkWipModule._pickInjLot('${_esc(lotNo)}','${_esc(dateOnly)}')">
                    <td style="padding:6px 10px;font-family:monospace;font-weight:700;">${_esc(lotNo)}</td>
                    <td style="padding:6px 10px;">${_esc(dateOnly)}</td>
                    <td style="padding:6px 10px;color:var(--text-muted);font-size:0.82rem;">${_esc(insp.color || '-')}</td>
                    <td style="padding:6px 10px;color:var(--text-muted);font-size:0.82rem;">${_esc(insp.supplierName || '-')}</td>
                    <td style="padding:6px 10px;text-align:right;">${_fmt(Number(l.qty) || 0)} EA</td>
                </tr>`;
            });
        }).filter(Boolean).join('');

        UIUtils.showModal('사출 수입검사 이력에서 LOT 선택',
            `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">
                ${_esc(carModel)} / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''} — 행을 클릭하면 사출LOT·수입검사일이 자동 입력됩니다.
            </div>
            <div style="max-height:360px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead><tr style="text-align:left;color:var(--text-secondary);font-size:0.78rem;">
                    <th style="padding:6px 10px;">LOT</th><th style="padding:6px 10px;">검사일</th>
                    <th style="padding:6px 10px;">색상</th><th style="padding:6px 10px;">생산처</th>
                    <th style="padding:6px 10px;text-align:right;">합격수량</th>
                </tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            '640px'
        );
    }

    /** 위 조회창에서 행 클릭 시 호출 — 폼의 사출LOT·수입검사일 입력칸을 채운다 */
    function _pickInjLot(lotNo, dateOnly) {
        const lotEl = document.getElementById('rwInjLot');
        const dateEl = document.getElementById('rwInspDate');
        if (lotEl) lotEl.value = lotNo;
        if (dateEl) dateEl.value = dateOnly;
        UIUtils.closeModal();
        UIUtils.toast('사출LOT · 수입검사일을 채웠습니다.', 'success');
    }

    // 「보기」 상세 모달에서 수정을 마친 뒤 그 상세 모달을 새 데이터로 다시 열기 위한 예약값.
    // 일반 경로(입출고 이력 표)로 수정할 땐 재오픈이 필요 없으므로 매번 openEditModal에서 비운다.
    let _reopenDetailAfterSave = null;

    function openEditModal(id) {
        _reopenDetailAfterSave = null;
        const rec = _getAll().find(function (r) { return r.id === id; });
        if (!rec) return;
        UIUtils.showModal('재사용 자재 수정', _formHtml(rec), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord('${id}')">저장</button>
        `);
    }

    /** 재공현황 「보기」 상세 모달 안에서 여는 수정 — 저장 후 그 상세 모달을 새로고침해 재오픈한다. */
    function openEditFromDetail(id, carModel, partName, color) {
        _reopenDetailAfterSave = { carModel: carModel, partName: partName, color: color };
        const rec = _getAll().find(function (r) { return r.id === id; });
        if (!rec) return;
        UIUtils.showModal('재사용 자재 수정', _formHtml(rec), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ReworkWipModule.saveRecord('${id}')">저장</button>
        `);
    }

    /** 리워크 재공 입출고 등록(신규 건) 시 생산관리자에게 통보 — 재사용 자재 흐름을
     *  생산관리자가 화면을 직접 열어보지 않아도 실시간으로 파악할 수 있게 한다. */
    function _notifyProdManagerOfRework(rec) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        try {
            const lots = _lotFieldsOf(rec);
            AuthModule.sendInternalMessage({
                targetType: 'role',
                targetIds: ['prod_manager'],
                title: '재사용 자재 ' + rec.type + ' 등록 — ' + rec.partName,
                body: [
                    '재사용 자재가 ' + rec.type + ' 등록되었습니다.',
                    '',
                    '일자: ' + (rec.date || '-'),
                    '차종: ' + (rec.carModel || '-'),
                    '사출명: ' + (rec.partName || '-') + (rec.color ? ' (' + rec.color + ')' : ''),
                    '수량: ' + _fmt(rec.qty) + ' EA',
                    rec.reworkType ? ('리워크 종류: ' + rec.reworkType) : '',
                    rec.location ? ('보관위치: ' + rec.location) : '',
                    lots.injLot ? ('사출LOT: ' + lots.injLot) : '',
                    lots.inspDate ? ('수입검사일: ' + lots.inspDate) : '',
                    lots.paintLot ? ('도장LOT: ' + lots.paintLot) : '',
                    rec.note ? ('비고: ' + rec.note) : ''
                ].filter(Boolean).join('\n'),
                category: 'rework-wip',
                priority: 'normal'
            });
        } catch (e) {
            console.warn('[ReworkWipModule] 생산관리자 통보 실패:', e);
        }
    }

    async function saveRecord(id) {
        const date = (document.getElementById('rwDate') || {}).value || '';
        const type = (document.getElementById('rwType') || {}).value || '';
        const carModel = ((document.getElementById('rwCarModel') || {}).value || '').trim();
        const partName = _toInjPartName(carModel, ((document.getElementById('rwPartName') || {}).value || '').trim());
        const color = ((document.getElementById('rwColor') || {}).value || '').trim();
        const qty = parseInt((document.getElementById('rwQty') || {}).value, 10);
        const location = ((document.getElementById('rwLocation') || {}).value || '').trim();
        const note = ((document.getElementById('rwNote') || {}).value || '').trim();
        const reworkType = ((document.getElementById('rwReworkType') || {}).value || '').trim();
        const lotFields = _readLotFieldsFromForm('rw');

        if (!date || !type || !partName || !carModel || isNaN(qty) || qty < 1) {
            UIUtils.toast('날짜, 구분, 차종, 사출명, 수량은 필수입니다.', 'error');
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
                _notifyProdManagerOfRework(rec);
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

    // ── 재사용 자재 → 도장현장 출고 ──────────────────────────────
    // 재공품 재고(WIP_STORE)에서 출고로 차감한다.
    // 도장현장 입고는 자동 확정하지 않는다 — 해당 라인 「현장 사출 입고」에서
    // 입고 처리를 해야 투입 LOT으로 쓸 수 있다(사출 창고 생산출고와 동일).
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
                        (rec.carModel || '') === carModel && _partsMatch(rec.partName, partName, carModel) && (rec.color || '') === color;
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
        UIUtils.showModal('재사용 자재 → 도장현장 출고',
            `<div style="padding:4px 0;">
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.6;">
                    <div><strong>${_esc(carModel || '-')} · ${_esc(partName)}</strong>${color ? ' · ' + _esc(color) : ''}</div>
                    <div style="color:var(--text-muted);">현재 재공 재고 <strong>${_fmt(max)} EA</strong></div>
                </div>
                <div style="margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid rgba(234,88,12,.35);
                            background:rgba(234,88,12,.06);font-size:0.81rem;line-height:1.55;">
                    출고하면 재공 재고에서 빠지고, 선택한 라인의 <strong>「현장 사출 입고」</strong>에
                    <strong style="color:#ea580c;">미입고</strong>로 표시됩니다.
                    도장 현장에서 <strong>입고 처리</strong>를 해야 실적 투입에 사용할 수 있습니다.
                    (사출 창고 생산출고와 동일한 확인 절차)
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
        const note = String((noteEl && noteEl.value) || '').trim() || '재사용 자재 도장현장 출고';

        // 계보 승계 — 입고 원본 trace + 폼에서 고친 LOT를 합친다
        const defs = _defaultLotsForStock(carModel, partName, color);
        const outRec = {
            date: _today(),
            type: '출고',
            carModel, partName, color,
            qty,
            line: line,
            paintLine: line,
            note: note + ' (' + line + ')',
            source: 'dispatch_to_line',
            createdAt: new Date().toISOString()
        };
        _applyLotFieldsToRec(outRec, lotFields, defs.trace);

        try {
            // ① 재공 재고 차감만 수행.
            // ② 도장현장 입고는 자동 확정하지 않는다 — 해당 라인 「현장 사출 입고」에서
            //    입고 처리해야 투입 LOT으로 쓸 수 있다(사출 생산출고와 동일).
            await Storage.add(WIP_STORE, outRec);

            UIUtils.closeModal();
            UIUtils.toast(`${_fmt(qty)} EA를 ${line}으로 출고했습니다. 현장에서 입고 처리해 주세요.`, 'success');
            const el = document.getElementById('contentArea');
            if (el) render(el);
        } catch (e) {
            UIUtils.toast('출고 처리 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    /** 도장 실적 입력에서 넘어온 컬러(도장 컬러, 예: BLACK)를 재공 재고에 실제 쌓여 있는
     *  컬러 표기(사출 소재 컬러, 예: BK+CLEAR)로 되돌린다. 그대로 쓰면 재고 조회(getStockQty)는
     *  느슨한 컬러 비교라 맞게 나오지만, 이 출고 기록 자체는 다른 컬러 문자열로 남아 부품별
     *  현황 표(_calcStock, 정확 일치)에 엉뚱한 마이너스 행을 새로 만들고 _defaultLotsForStock
     *  (정확 일치)도 기존 입고분의 LOT 계보를 못 찾아 매번 새 RST LOT을 만들게 된다. */
    function _resolveStockColor(carModel, partName, color) {
        const want = String(color || '').trim();
        if (!want) return want;
        const match = _getAll().find(function (r) {
            return r.type === '입고' && (r.carModel || '') === carModel && _partsMatch(r.partName, partName, carModel)
                && _colorsEqual(r.color, want);
        });
        return match ? String(match.color || '').trim() : want;
    }

    /** 도장 작업 실적 입력 화면에서 "재사용 자재 사용"을 적용했을 때 호출 — 별도 출고 모달
     *  없이 즉시 재공 재고를 차감한다. 재공 재고가 모자라도 막지 않는다(부품별 리워크 재공
     *  현황 표에 음수/마이너스로 표시되어 리워크 담당자에게 출고가 밀렸다는 신호가 된다 —
     *  기존 표시 로직 그대로 재사용). 도장현장 입고 확정(현장 입고 처리)은 호출한 쪽에서
     *  PaintingInputModule.receiveFromWarehouseOut로 이어서 처리한다(사출 창고 생산출고
     *  확인과 동일한 구조를 재사용). */
    async function dispatchFromPaintingWork(opts) {
        opts = opts || {};
        const carModel = String(opts.carModel || '').trim();
        const partName = _toInjPartName(carModel, opts.partName) || String(opts.partName || '').trim();
        const color = _resolveStockColor(carModel, partName, String(opts.color || '').trim());
        const qty = Math.max(0, Math.floor(Number(opts.qty) || 0));
        if (!partName || qty <= 0) return null;
        const line = _normDispatchLine(opts.line || '도장-A');

        const defs = _defaultLotsForStock(carModel, partName, color);
        const lotFields = {
            injLot: String(opts.injLot || defs.injLot || '').trim(),
            inspDate: String(opts.inspDate || defs.inspDate || '').trim(),
            paintLot: String(opts.paintLot || defs.paintLot || '').trim()
        };
        if (!lotFields.injLot) {
            // submitDispatch와 동일한 RST 접두어 규칙 — 사출 LOT 형식(YYMMDD)과 겹치지 않게.
            lotFields.injLot = 'RST' + Date.now().toString().slice(-8);
        }
        const note = String(opts.note || '').trim() || '도장 실적 입력 — 재사용 자재 사용';
        const outRec = {
            date: _today(),
            type: '출고',
            carModel, partName, color,
            qty,
            line: line,
            paintLine: line,
            note: note + ' (' + line + ')',
            source: 'dispatch_to_line',
            createdAt: new Date().toISOString()
        };
        _applyLotFieldsToRec(outRec, lotFields, defs.trace);

        const rec = await Storage.add(WIP_STORE, outRec);
        const el = document.getElementById('contentArea');
        if (el && document.querySelector('[data-rework-wip-page]')) { try { render(el); } catch (e) {} }
        return rec;
    }

    /** 도장현장 반납(사출 창고 물류담당자의 「입고 처리」)에서 호출 — 리워크 재공 재고를
     *  다시 늘린다. IL 등 리워크 투입품은 애초에 사출 창고 재고가 아니므로, 반납분을 사출
     *  창고(INJECTION_INVENTORY)로 입고시키면 엉뚱한 품목이 그 창고에 쌓이고 리워크 재공
     *  재고는 영영 복구되지 않는다(이 실적에서 도장현장 출고로 빠진 만큼 재공 재고가
     *  줄어든 채 그대로 남는 버그) — 반드시 이 재공 재고로 돌아와야 한다.
     *  opts.lots가 있으면 LOT별로(원래 계보 재사용) 각각 입고 기록을 만들고,
     *  없으면 opts.quantity 전체를 단일 건으로 처리한다. */
    async function receiveSiteReturn(opts) {
        opts = opts || {};
        const carModel = String(opts.carModel || '').trim();
        const partName = _toInjPartName(carModel, opts.partName) || String(opts.partName || '').trim();
        const color = _resolveStockColor(carModel, partName, String(opts.color || '').trim());
        const lotsIn = (Array.isArray(opts.lots) ? opts.lots : [])
            .map(function (l) {
                return { lotNo: String((l && l.lotNo) || '').trim(), qty: Math.max(0, Math.floor(Number(l && l.qty) || 0)) };
            })
            .filter(function (l) { return l.qty > 0; });
        const totalQty = Math.max(0, Math.floor(Number(opts.quantity != null ? opts.quantity : opts.qty) || 0));
        const list = lotsIn.length ? lotsIn : (totalQty > 0 ? [{ lotNo: '', qty: totalQty }] : []);
        if (!partName || !list.length) return null;

        const note = String(opts.note || '').trim() || '도장현장 반납 입고';
        const created = [];
        for (let i = 0; i < list.length; i++) {
            const l = list[i];
            let injLot = l.lotNo;
            let inspDate = '';
            let paintLot = '';
            let trace;
            if (injLot) {
                // 반납분은 원래 출고됐던 것과 같은 물리적 자재이므로, 같은 사출LOT을 쓴 기존
                // 입고분에서 계보(수입검사일·도장LOT)를 그대로 이어받는다.
                const src = _getAll().find(function (rec) {
                    return rec.type === '입고' && _partsMatch(rec.partName, partName, rec.carModel) && _lotFieldsOf(rec).injLot === injLot;
                });
                if (src) {
                    const f = _lotFieldsOf(src);
                    inspDate = f.inspDate;
                    paintLot = f.paintLot;
                    trace = src.trace;
                }
            }
            if (!injLot) {
                const defs = _defaultLotsForStock(carModel, partName, color);
                injLot = defs.injLot;
                inspDate = defs.inspDate;
                paintLot = defs.paintLot;
                trace = defs.trace;
            }
            const rec = {
                date: _today(),
                type: '입고',
                carModel, partName, color,
                qty: l.qty,
                location: '도장현장',
                note: note,
                source: 'site_return',
                createdAt: new Date().toISOString()
            };
            _applyLotFieldsToRec(rec, { injLot: injLot, inspDate: inspDate, paintLot: paintLot }, trace);
            created.push(await Storage.add(WIP_STORE, rec));
        }
        const el = document.getElementById('contentArea');
        if (el && document.querySelector('[data-rework-wip-page]')) { try { render(el); } catch (e) {} }
        return created;
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
            return (r.carModel || '') === carModel && _partsMatch(r.partName, partName, carModel) && (r.color || '') === color;
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
                    const src = r.source === 'painting_inspection' ? '외관검사'
                        : (r.source === 'site_return' ? '현장반납' : (r.source || '-'));
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
            partName: _toInjPartName(payload.carModel, payload.partName) || payload.partName || '',
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
        openInjLotLookup,
        _pickInjLot,
        onCarModelChange,
        onPartNameChange,
        saveRecord,
        deleteRecord,
        openDispatchModal,
        submitDispatch,
        dispatchFromPaintingWork,
        receiveSiteReturn,
        openStockDetailModal,
        addFromPaintingInspection,
        getStockQty,
        toInjPartName: _toInjPartName,
        partsMatch: _partsMatch
    };
})();
