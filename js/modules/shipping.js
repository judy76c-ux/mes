/**
 * 출하/제품 공정 모듈
 * - 출하검사 대기 (도장/레이져 검사 완료품 자동 유입)
 * - 출하검사 일지 (샘플링 검사)
 * - 제품 창고 (재고관리)
 * - 제품 출고
 */

// ===================================================================
// 출하검사 통합 페이지 (대기 + 검사 일지)
// ===================================================================
const ShippingStandbyModule = (function() {
    const SB_STORE = DB.STORES.SHIPPING_STANDBY;
    const SI_STORE = DB.STORES.SHIPPING_INSPECTIONS;
    let _historyRows = [];

    // 출하검사 기준서(문서형 편집기) 상태
    let _sstdImages    = [];    // 편집 중 이미지 [{src,h,label}]
    let _sstdKbHandler = null;  // 편집 모달 키보드 핸들러
    let _sstdDragIdx   = -1;    // 이미지 드래그 인덱스
    let _sstdResizeOn  = false; // 이미지 모서리 크기 조절 중
    let _sstdPtRowDragFrom = -1; // 주요검사 Point 행 드래그 인덱스
    let _sstdCurrentKey = '';   // 현재 편집 중인 제품 key
    let _sstdViewWin    = null; // 보기 전용 팝업 (인쇄 아님)
    let _sstdViewFitHandler = null;

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const _SS_WAIT_TABLE_STYLE = `
        <style>
            .ss-wait-wrap{width:100%;max-width:100%;overflow-x:auto !important;-webkit-overflow-scrolling:touch;}
            .ss-wait-table{width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;font-size:clamp(0.72rem,0.65rem + 0.35vw,0.88rem);}
            .ss-wait-table th,.ss-wait-table td{padding:clamp(6px,0.55vw,10px) clamp(6px,0.7vw,12px);vertical-align:middle;}
            .ss-wait-table th{white-space:nowrap;line-height:1.25;}
            .ss-wait-table .col-date{min-width:5.5em;white-space:nowrap;}
            .ss-wait-table .col-src{min-width:5.5em;white-space:nowrap;}
            .ss-wait-table .col-car{min-width:4.5em;white-space:nowrap;}
            .ss-wait-table .col-part{min-width:10em;white-space:nowrap;}
            .ss-wait-table .col-color{min-width:4em;white-space:nowrap;}
            .ss-wait-table .col-lot{min-width:6.5em;white-space:nowrap;font-family:monospace;font-size:0.8rem;}
            .ss-wait-table .col-num{min-width:4.2em;text-align:right;white-space:nowrap;}
            .ss-wait-table .col-box{min-width:5em;text-align:center;white-space:nowrap;}
            .ss-wait-table .col-cust{min-width:5.5em;white-space:nowrap;}
            .ss-wait-table .col-std{min-width:4.2em;text-align:center;white-space:nowrap;}
            .ss-wait-table .col-act{min-width:9em;white-space:nowrap;}
            @media (max-width:1400px){
                .ss-wait-table{min-width:1080px;font-size:clamp(0.7rem,0.62rem + 0.3vw,0.82rem);}
            }
            @media (max-width:1100px){
                .ss-wait-table{min-width:980px;}
                .ss-wait-table .col-part{min-width:8em;}
            }
        </style>`;

    function _inspectionDateCell(dateValue, timeValue) {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return '<span style="color:var(--text-muted);">-</span>';
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) return _esc([rawDate, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' '));
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.08;min-width:56px;">
                <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${dateMatch[1]}</span>
                <strong style="font-size:0.92rem;color:var(--text-primary);">${dateMatch[2]}-${dateMatch[3]}</strong>
                ${timeMatch ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${timeMatch[1]}</span>` : ''}
            </div>`;
    }

    function _uniqText(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))].join(', ');
    }

    function _lotFields(row) {
        return {
            paintLot: _uniqText(row.paintLot || row.paintingDate || ''),
            injectionLot: _uniqText(row.injectionLot || row.lotNo || ''),
            laserLot: _uniqText(row.laserLot || row.laserWorkDate || '')
        };
    }

    function _lotCell(value) {
        const text = _uniqText(value);
        return text ? `<span style="font-family:monospace;font-size:0.78rem;">${_esc(text)}</span>` : '<span style="color:var(--text-muted);">-</span>';
    }

    // ── 페이지 렌더 ───────────────────────────────────────────────────
    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${typeof ShippingUI !== 'undefined' ? ShippingUI.renderSection('shipping-standby') : ''}
                <div class="page-header">
                    <div class="page-actions" style="display:flex;align-items:center;gap:8px;width:100%;">
                        <button class="btn btn-outline" onclick="Router.navigate('shipping-standard')">
                            <span class="material-symbols-outlined">fact_check</span> 출하검사 기준서
                        </button>
                    </div>
                </div>

                <!-- 통계 -->
                <div class="stat-cards" id="ssStats"></div>

                <!-- ① 검사 대기 섹션 -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-orange);">pending_actions</span>
                            검사 대기
                        </h4>
                        <button class="btn btn-sm btn-outline" onclick="ShippingStandbyModule.auditLaser()"
                            style="margin-left:auto;padding:4px 10px;font-size:0.8rem;">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">rule</span>
                            레이져 대조
                        </button>
                    </div>
                    <div class="card-body" style="padding:0;min-width:0;">
                        ${_SS_WAIT_TABLE_STYLE}
                        <div class="data-table-wrapper ss-wait-wrap">
                            <table class="data-table ss-wait-table">
                                <thead>
                                    <tr>
                                        <th class="col-date">등록일</th>
                                        <th class="col-src">공정</th>
                                        <th class="col-car">차종</th>
                                        <th class="col-part">품명</th>
                                        <th class="col-color">컬러</th>
                                        <th class="col-lot">도장 LOT</th>
                                        <th class="col-lot">사출 LOT</th>
                                        <th class="col-lot">레이져 LOT</th>
                                        <th class="col-num">수량</th>
                                        <th class="col-box">박스수</th>
                                        <th class="col-cust">납품처</th>
                                        <th class="col-std">외관항목</th>
                                        <th class="col-act">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="ssWaitingBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- ② 검사 이력 섹션 -->
                <div class="card">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-green);">task_alt</span>
                            검사 이력
                        </h4>
                        <!-- 기간 필터 -->
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                            <input type="date" class="form-input" id="ssHistStart"
                                value="${UIUtils.monthAgo()}" style="width:130px;font-size:0.82rem;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="ssHistEnd"
                                value="${UIUtils.today()}" style="width:130px;font-size:0.82rem;">
                            <select class="form-select" id="ssHistCar" onchange="ShippingStandbyModule.onHistoryCarChange()"
                                style="width:140px;font-size:0.82rem;">
                                <option value="">전체 차종</option>
                            </select>
                            <select class="form-select" id="ssHistPart" style="width:220px;font-size:0.82rem;">
                                <option value="">전체 품명</option>
                            </select>
                            <button class="btn btn-primary btn-sm"
                                onclick="ShippingStandbyModule.loadHistory()"
                                style="padding:6px 12px;font-size:0.82rem;">
                                <span class="material-symbols-outlined" style="font-size:14px;">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일</th>
                                        <th>납품처</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>도장LOT</th>
                                        <th>사출LOT</th>
                                        <th>레이져 LOT</th>
                                        <th style="text-align:right">LOT 수량</th>
                                        <th style="text-align:center">샘플/코드</th>
                                        <th style="text-align:center">불량</th>
                                        <th style="text-align:center">판정</th>
                                        <th>검사자</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="ssHistoryBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        loadData();
        _renderHistoryFilterOptions();
        loadHistory();
    }

    // ── 대기 목록 ────────────────────────────────────────────────────
    async function loadData() {
        const sbData  = Storage.getAll(SB_STORE);
        sbData.sort((a, b) => (b.laserWorkDate || '').localeCompare(a.laserWorkDate || ''));
        const waiting = sbData.filter(d => d.status === '대기');

        // 이력에서 통계
        const siData = Storage.getAll(SI_STORE);
        const pass   = siData.filter(d => d.result === '합격').length;
        const fail   = siData.filter(d => d.result === '불합격').length;

        const statsEl = document.getElementById('ssStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card orange">
                    <div class="stat-card-value">${waiting.length}</div>
                    <div class="stat-card-label">검사 대기</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${siData.length}</div>
                    <div class="stat-card-label">총 검사 건수</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${pass}</div>
                    <div class="stat-card-label">합격</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-card-value">${fail}</div>
                    <div class="stat-card-label">불합격</div>
                </div>
            `;
        }

        const srcLabel = s => s === 'laser_inspection' ? '레이져' : '도장';
        const srcColor = s => s === 'laser_inspection'
            ? 'var(--accent-purple,#a855f7)' : 'var(--accent-blue)';
        const laserMissing = d => {
            if (!d) return false;
            if (d.laserMatchMissing) return true;
            if (d.laserInspectionId && !Storage.getById(DB.STORES.LASER_INSPECTIONS, d.laserInspectionId)) return true;
            if (d.laserWorkId && !Storage.getById(DB.STORES.LASER_WORK_LOG, d.laserWorkId)
                && !d.laserInspectionId) return true;
            return false;
        };
        waiting.sort((a, b) => Number(laserMissing(b)) - Number(laserMissing(a))
            || String(b.laserWorkDate || b.date || '').localeCompare(String(a.laserWorkDate || a.date || '')));

        const waitingBody = document.getElementById('ssWaitingBody');
        if (!waitingBody) return;

        if (!waiting.length) {
            waitingBody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.3;">check_circle</span>
                현재 검사 대기 품목이 없습니다.</td></tr>`;
            return;
        }

        const standards = await _loadShipStandards();
        waitingBody.innerHTML = waiting.map(d => {
            const sum = _stdPointsSummary(standards, d.carModel, d.partName, d.color, 'appearance');
            const tip = sum.found
                ? (sum.names.length ? sum.names.join(', ') : `외관 ${sum.count}건`)
                : '기준서 미등록';
            const cntHtml = sum.found
                ? `<span title="${_esc(tip)}" style="display:inline-block;min-width:2.2em;padding:2px 8px;border-radius:999px;font-size:0.78rem;font-weight:800;background:${sum.count ? '#dbeafe' : '#fef3c7'};color:${sum.count ? '#1d4ed8' : '#b45309'};">${sum.count}</span>`
                : `<span title="기준서 미등록" style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;background:#fee2e2;color:#b91c1c;">없음</span>`;
            const missing = laserMissing(d);
            const srcHtml = missing
                ? `<span style="font-size:0.78rem;font-weight:600;color:var(--accent-purple,#a855f7);">레이져</span>
                   <span title="연결된 레이져 작업/검사 실적이 없습니다" style="display:inline-block;margin-top:3px;padding:1px 6px;border-radius:999px;font-size:0.68rem;font-weight:800;background:#fee2e2;color:#b91c1c;white-space:nowrap;">실적 없음</span>`
                : `<span style="font-size:0.78rem;font-weight:600;color:${srcColor(d.source)};">${srcLabel(d.source)}</span>`;
            return `
            <tr${missing ? ' style="background:#fff7ed;"' : ''}>
                <td class="col-date">${d.date || '-'}</td>
                <td class="col-src">${srcHtml}</td>
                <td class="col-car">${_esc(d.carModel || '-')}</td>
                <td class="col-part"><strong>${_esc(d.partName || '-')}</strong></td>
                <td class="col-color">${_esc(d.color || '-')}</td>
                <td class="col-lot">${_esc(d.paintingDate || '-')}</td>
                <td class="col-lot">${_esc(d.lotNo || '-')}</td>
                <td class="col-lot">${_esc(d.laserLot || d.laserWorkDate || '-')}</td>
                <td class="col-num" style="font-weight:600;">${UIUtils.formatNumber(d.goodQty || d.inspectionQty || 0)}</td>
                <td class="col-box" style="font-weight:700;color:var(--accent-blue);">${d.boxCount > 0 ? UIUtils.formatNumber(d.boxCount) + ' BOX' : '-'}</td>
                <td class="col-cust" style="font-size:0.85rem;">${_esc(d.customer || '-')}</td>
                <td class="col-std">${cntHtml}</td>
                <td class="col-act" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary"
                        onclick="ShippingInspectionModule.openFromStandby('${d.id}')"
                        style="padding:4px 10px;font-size:0.8rem;">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">fact_check</span>
                        검사 등록
                    </button>
                    <button class="btn btn-sm btn-danger"
                        onclick="ShippingStandbyModule.removeStandby('${d.id}')"
                        style="padding:4px 8px;font-size:0.8rem;margin-left:4px;">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── 이력 목록 ────────────────────────────────────────────────────
    function _getHistoryBaseData() {
        return (Storage.getAll(SI_STORE) || [])
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function _renderHistoryFilterOptions() {
        const carSel = document.getElementById('ssHistCar');
        const partSel = document.getElementById('ssHistPart');
        if (!carSel || !partSel) return;

        const currentCar = carSel.value || '';
        const currentPart = partSel.value || '';
        const data = _getHistoryBaseData();
        const cars = UIUtils.sortCarModels(data.map(d => d.carModel));
        const partsBase = currentCar ? data.filter(d => (d.carModel || '') === currentCar) : data;
        const parts = [...new Set(partsBase.map(d => d.partName).filter(Boolean))].sort();

        carSel.innerHTML = `<option value="">전체 차종</option>` +
            cars.map(car => `<option value="${car}" ${car === currentCar ? 'selected' : ''}>${car}</option>`).join('');

        partSel.innerHTML = `<option value="">전체 품명</option>` +
            parts.map(part => `<option value="${part}" ${part === currentPart ? 'selected' : ''}>${part}</option>`).join('');

        if (currentPart && !parts.includes(currentPart)) partSel.value = '';
    }

    function onHistoryCarChange() {
        _renderHistoryFilterOptions();
    }

    function loadHistory() {
        const start = document.getElementById('ssHistStart')?.value || '';
        const end   = document.getElementById('ssHistEnd')?.value   || '';
        const car   = document.getElementById('ssHistCar')?.value || '';
        const part  = document.getElementById('ssHistPart')?.value || '';
        _renderHistoryFilterOptions();
        const data  = Storage.getByDateRange(SI_STORE, start, end)
            .filter(d => !car || (d.carModel || '') === car)
            .filter(d => !part || (d.partName || '') === part)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        _historyRows = data;

        const tbody = document.getElementById('ssHistoryBody');
        const exportBtn = document.getElementById('ssExportBtn');
        if (!tbody) return;
        if (exportBtn) exportBtn.style.display = data.length ? 'inline-flex' : 'none';

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text-muted);">해당 기간의 검사 이력이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            const lots = _lotFields(d);
            return `
            <tr style="cursor:pointer;" onclick="ShippingInspectionModule.openHistoryView('${d.id}')">
                <td style="white-space:nowrap;">${_inspectionDateCell(d.date, d.startTime || d.endTime || '')}</td>
                <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td>${_lotCell(lots.paintLot)}</td>
                <td>${_lotCell(lots.injectionLot)}</td>
                <td>${_lotCell(lots.laserLot)}</td>
                <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.lotSize || 0)}</td>
                <td style="text-align:center;font-size:0.82rem;">
                    ${UIUtils.formatNumber(d.sampleQty || 0)}
                </td>
                <td style="text-align:center;font-weight:${d.defectQty > 0 ? '700' : '400'};
                    color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
                    ${d.defectQty || 0}
                </td>
                <td style="text-align:center;">${UIUtils.badge(d.result || '-', badge)}</td>
                <td style="font-size:0.85rem;">${d.inspector || '-'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-outline" onclick="ShippingInspectionModule.openHistoryView('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">visibility</span> 보기
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── 이력 행 클릭 → 상세 팝업 ─────────────────────────────────────
    function _showDetail(id, event) {
        const d = Storage.getById(SI_STORE, id);
        if (!d) return;

        const failRate = d.lotSize > 0
            ? ((d.defectQty / d.lotSize) * 100).toFixed(1) : '0.0';

        const resultColor = d.result === '합격'
            ? 'var(--accent-green)' : d.result === '불합격'
            ? 'var(--accent-red)' : 'var(--accent-orange)';

        const popupId = 'ssDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:18px 20px; min-width:320px; max-width:440px;
            font-size:0.88rem;
        `;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        popup.innerHTML = `
            <!-- 헤더 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-blue);">verified</span>
                    <span style="font-weight:700;font-size:0.95rem;">출하검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;line-height:1;padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px;font-size:0.82rem;margin-bottom:6px;">
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">제품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);">
                    ${d.customer || '납품처 미지정'}
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${d.paintingDate || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${d.lotNo || '-'}</div>
                </div>
            </div>

            <!-- 검사 일시 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;font-size:0.8rem;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600;">${d.date || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">시작 시간</div>
                    <div style="font-weight:600;">${d.startTime || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">완료 시간</div>
                    <div style="font-weight:600;">${d.endTime || '-'}</div>
                </div>
            </div>

            <!-- 수량 카드 -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;text-align:center;">
                <div style="background:rgba(59,130,246,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">LOT 수량</div>
                    <div style="font-weight:700;font-size:0.95rem;color:var(--accent-blue);margin-top:2px;">${UIUtils.formatNumber(d.lotSize || 0)}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">샘플 수</div>
                    <div style="font-weight:700;font-size:0.95rem;margin-top:2px;">${UIUtils.formatNumber(d.sampleQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">불량</div>
                    <div style="font-weight:700;font-size:0.95rem;color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};margin-top:2px;">${d.defectQty || 0}</div>
                </div>
                <div style="background:${d.result === '합격' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)'};border-radius:8px;padding:7px 4px;border:1px solid ${resultColor}20;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">판정</div>
                    <div style="font-weight:800;font-size:0.95rem;color:${resultColor};margin-top:2px;">${d.result || '-'}</div>
                </div>
            </div>

            ${d.inspector ? `
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:${d.note ? '6px' : '0'};">
                검사자: <strong style="color:var(--text-primary);">${d.inspector}</strong>
            </div>` : ''}

            ${d.note ? `
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;font-size:0.78rem;color:var(--text-muted);">
                비고: <span style="color:var(--text-primary);">${d.note}</span>
            </div>` : ''}
        `;

        document.body.appendChild(popup);

        // 화면 밖 보정
        requestAnimationFrame(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const rect = popup.getBoundingClientRect();
            if (rect.right  > vw - 8) popup.style.left = (vw - rect.width  - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 외부 클릭 닫기
        setTimeout(() => {
            document.addEventListener('click', function _c(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _c);
                }
            });
        }, 50);
    }

    // ── 삭제 ─────────────────────────────────────────────────────────
    function removeStandby(id) {
        const item = Storage.getById(SB_STORE, id);
        const isPaintingSource = item && item.source === 'painting_inspection' && item.paintingWorkId;
        const isUnmatchedLaser = !!(item && item.laserMatchMissing);
        const confirmMsg = isPaintingSource
            ? '삭제하면 도장 검사 일지가 외관 검사 대기 상태로 복원됩니다. 삭제하시겠습니까?'
            : isUnmatchedLaser
                ? '레이져 실적이 없는 대기 항목입니다. 삭제하시겠습니까?'
                : '대기 항목을 삭제하시겠습니까?';

        UIUtils.confirm(confirmMsg, async () => {
            if (isPaintingSource && !isUnmatchedLaser) {
                // 도장 작업 inspectionStatus 초기화 → 외관 검사 대기로 복원
                await Storage.update(DB.STORES.PAINTING_WORK, item.paintingWorkId, {
                    inspectionStatus: null,
                    inspectionDate: null,
                    inspectionStartTime: null,
                    inspectionEndTime: null,
                    inspectors: null,
                    updatedAt: new Date().toISOString()
                });
                // 해당 작업의 도장 검사 실적 삭제
                const inspections = Storage.getAll(DB.STORES.PAINTING_INSPECTIONS) || [];
                const linked = inspections.filter(i => i.workId === item.paintingWorkId);
                for (const insp of linked) {
                    await Storage.remove(DB.STORES.PAINTING_INSPECTIONS, insp.id);
                }
            }

            await Storage.remove(SB_STORE, id);
            UIUtils.toast(
                isPaintingSource
                    ? '삭제되었습니다. 도장 검사 외관 검사 대기로 복원되었습니다.'
                    : '삭제되었습니다.',
                'success'
            );
            loadData();
        });
    }

    function removeHistory(id) {
        if (typeof ShippingInspectionModule !== 'undefined' && ShippingInspectionModule.deleteHistory) {
            ShippingInspectionModule.deleteHistory(id);
            return;
        }
        UIUtils.confirm('검사 이력을 삭제하시겠습니까?', async () => {
            await Storage.remove(SI_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
            loadHistory();
        });
    }

    // ── 내보내기 ─────────────────────────────────────────────────────
    function exportHistory() {
        const data = _historyRows && _historyRows.length ? _historyRows : [];
        if (!data.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = ['검사일', '납품처', '차종', '제품명', '컬러', '도장LOT', '사출LOT', '레이져LOT',
            'LOT수량', '샘플수', '불량수', '판정', '검사자', '비고'];
        const rows = data.map(d => [
            d.date, d.customer||'', d.carModel||'', d.partName||'', d.color||'',
            d.paintingDate||'', d.lotNo||'', d.laserLot||d.laserWorkDate||'',
            d.lotSize||0, d.sampleQty||0, d.defectQty||0,
            d.result||'', d.inspector||'', d.note||''
        ]);
        Storage.exportToCSV(headers, rows, '출하검사이력');
        UIUtils.toast('내보내기 완료', 'success');
    }

    const SHIP_STD_CONFIG_KEY = 'shipping_inspection_standards_v1';

    // 편집 표(8열, 구분/± 포함)에 저장된 열 폭 비율에서 앞 7개(보기/출력용, 관리 열 제외)만
    // 뽑아 합이 100%가 되도록 다시 스케일한다. 저장값이 없으면 기본 비율을 쓴다.
    function _sstdScale7ColWidths(saved8) {
        const fallback = ['6%', '6%', '13%', '44%', '11%', '9%', '11%'];
        if (!Array.isArray(saved8) || saved8.length < 7) return fallback;
        const nums = saved8.slice(0, 7).map(w => parseFloat(w) || 0);
        const sum = nums.reduce((a, b) => a + b, 0);
        if (sum <= 0) return fallback;
        return nums.map(n => (n / sum * 100).toFixed(2) + '%');
    }

    function _stdProductKey(product) {
        return product.id || `${product.carModel || ''}||${product.partName || ''}||${product.color || ''}`;
    }

    // 출하검사 기준서 목록 정렬용 — 양산품 위, A/S 아래(개발품은 맨 아래)
    function _sstdItemTypeRank(itemType) {
        const t = String(itemType || '').replace(/품$/, '').trim();
        if (t === '양산') return 0;
        if (t === 'A/S' || /A\/?S/i.test(t)) return 1;
        if (t === '개발') return 2;
        return 0;
    }
    function _sstdProductSort(a, b) {
        return _sstdItemTypeRank(a.itemType) - _sstdItemTypeRank(b.itemType) ||
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko') ||
            (a.color || '').localeCompare(b.color || '', 'ko');
    }

    function _stdProductLabel(product) {
        return [product.carModel, product.partName, product.color].filter(Boolean).join(' / ') || '품목 미지정';
    }

    async function _loadShipStandards() {
        return (await Storage.getConfigValue(SHIP_STD_CONFIG_KEY).catch(() => ({}))) || {};
    }

    async function _saveShipStandards(data) {
        await Storage.setConfigValue(SHIP_STD_CONFIG_KEY, data || {});
    }

    function _sstdCanWrite() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.canWritePage !== 'function') return true;
        return AuthModule.canWritePage('shipping-standard');
    }

    function _sstdCanDelete() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser()) {
            return true;
        }
        return _sstdCanWrite();
    }

    // 문서형 기준서 기본 검사항목 — 외관 / 신뢰성 구분
    const _SSTD_DEFAULT_APPEARANCE = [
        { group: 'appearance', item: '외관',        standard: 'BURR, SINK MARK 및 유해한 흠이 없을 것.', method: '육안', sample: '10EA/LOT', management: '출하검사성적서', mergePrev: false },
        { group: 'appearance', item: '외관(PAINT)', standard: '표면에 스크래치, 흑점, 이물질이 없을 것.',    method: '육안', sample: '10EA/LOT', management: '출하검사성적서', mergePrev: true },
        { group: 'appearance', item: '', standard: '', method: '육안', sample: '10EA/LOT', management: '', mergePrev: true }
    ];
    const _SSTD_DEFAULT_RELIABILITY = [
        { group: 'reliability', item: 'COLOR(색차)', standard: '승인 한도 내 색차 기준을 만족할 것.', method: '색차계', sample: '2EA/LOT', management: '출하검사성적서' },
        { group: 'reliability', item: '부착성',     standard: '박리 이상 없을 것.', method: 'Cross cutter / Tesa band', sample: '1EA/LOT', management: '출하검사성적서' },
        { group: 'reliability', item: '도막두께',   standard: '20㎛ ~ 40㎛', method: '도막두께계', sample: '1EA/LOT', management: '출하검사성적서' },
        { group: 'reliability', item: '연필경도',   standard: 'B 연필, 9.8N, 50mm 왕복 후 이상 없을 것.', method: '연필경도시험기', sample: '1EA/LOT', management: '출하검사성적서' }
    ];
    const _SSTD_DEFAULT_POINTS = _SSTD_DEFAULT_APPEARANCE.concat(_SSTD_DEFAULT_RELIABILITY);
    const _SSTD_RELI_ITEM_RE = /색차|COLOR|광택|GLOSS|부착|도막|두께|경도|연필|신뢰|내스크|내약|내크림|재질|접착|CREAM|SCRATCH/i;
    const _SSTD_DEFAULT_PROC = '1. 제품의 표면상태를 검사한다.\n2. 중요치수를 측정한다.\n3. 불량은 해당 부위 마킹 후 별도의 불량 박스에 보관한다.\n4. 명세표 대비 수량을 확인한다.';
    const _SSTD_DEFAULT_CORR = '1. 부적합 발생시 해당 제품 격리 후 부적합 식별을 실시한다.\n2. 부적합 사항은 보고서를 작성하여 담당자 및 조반장에게 통지한다.';

    function _sstdGuessGroup(pt) {
        const g = String((pt && pt.group) || '').toLowerCase().trim();
        if (g === 'hidden' || g === 'hide' || g === '숨김' || g === 'inactive') return 'hidden';
        if (g === 'reliability' || g === 'reli' || g === '신뢰성') return 'reliability';
        if (g === 'appearance' || g === '외관') return 'appearance';
        if (_SSTD_RELI_ITEM_RE.test((pt && pt.item) || '')) return 'reliability';
        return 'appearance';
    }

    function _sstdNormGroup(v) {
        const g = String(v || '').toLowerCase().trim();
        if (g === 'hidden' || g === 'hide' || g === '숨김') return 'hidden';
        if (g === 'reliability' || g === 'reli' || g === '신뢰성') return 'reliability';
        return 'appearance';
    }

    function _sstdSplitCheckPoints(checkPoints) {
        const appearance = [];
        const reliability = [];
        const hidden = [];
        (checkPoints || []).forEach(pt => {
            const row = Object.assign({}, pt || {}, { group: _sstdGuessGroup(pt) });
            if (row.group === 'hidden') hidden.push(row);
            else if (row.group === 'reliability') reliability.push(row);
            else appearance.push(row);
        });
        return { appearance, reliability, hidden };
    }

    /** 목록용 주요검사 Point — 외관/신뢰성 각각 */
    function _sstdGroupItemsText(std, group) {
        if (!std) return '';
        const pts = Array.isArray(std.checkPoints) ? std.checkPoints : [];
        const list = _sstdPointsForGroup(pts, group === 'reliability' ? 'reliability' : 'appearance');
        return list.map(p => String(p.item || '').trim()).filter(Boolean).join(', ');
    }

    function _sstdCheckPointsListHtml(std) {
        if (!std) return '<span style="color:var(--text-muted);">-</span>';
        const pts = Array.isArray(std.checkPoints) ? std.checkPoints : [];
        if (!pts.length) return '<span style="color:var(--text-muted);">-</span>';
        const appearance = _sstdPointsForGroup(pts, 'appearance');
        const reliability = _sstdPointsForGroup(pts, 'reliability');
        const chip = (label, bg, items) => {
            if (!items.length) return '';
            const names = items.map(p => String(p.item || '').trim()).filter(Boolean);
            if (!names.length) return '';
            return `<span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;margin-right:6px;">
                <span style="font-size:0.68rem;font-weight:800;padding:1px 5px;border-radius:3px;background:${bg};color:#334155;white-space:nowrap;">${label}</span>
                <span style="font-size:0.8rem;color:var(--text-primary);">${names.map(_esc).join(', ')}</span>
            </span>`;
        };
        const html = [chip('외관', '#d0e4f7', appearance), chip('신뢰성', '#fde8d0', reliability)].filter(Boolean).join('');
        return html || '<span style="color:var(--text-muted);">-</span>';
    }

    function _sstdListCellPoints(std, group) {
        const text = _sstdGroupItemsText(std, group);
        if (!text) return '<span style="color:var(--text-muted);">-</span>';
        const bg = group === 'reliability' ? '#fde8d0' : '#d0e4f7';
        const label = group === 'reliability' ? '신뢰성' : '외관';
        return `<span style="display:inline-flex;align-items:flex-start;gap:4px;flex-wrap:wrap;">
            <span style="font-size:0.68rem;font-weight:800;padding:1px 5px;border-radius:3px;background:${bg};color:#334155;white-space:nowrap;">${label}</span>
            <span style="font-size:0.8rem;">${_esc(text)}</span>
        </span>`;
    }

    function _sstdListRowHtml(product, standards) {
        const key = _stdProductKey(product);
        const std = standards[key];
        const car = String(product.carModel || '').trim();
        const part = String(product.partName || '').trim();
        const color = String(product.color || '').trim();
        const q = [car, part, color].join(' ').toLowerCase();
        return `
            <tr class="sstd-list-row" data-sstd-car="${_esc(car)}" data-sstd-q="${_esc(q)}">
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;">${_esc(car || '-')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);font-weight:700;white-space:nowrap;">${_esc(part || '-')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;">${_esc(color || '-')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);">${_sstdListCellPoints(std, 'appearance')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);">${_sstdListCellPoints(std, 'reliability')}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;white-space:nowrap;">
                    ${std ? UIUtils.badge('등록', 'success') : UIUtils.badge('미등록', 'warning')}
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;white-space:nowrap;">
                    ${std
                        ? `<button class="btn btn-sm btn-primary" onclick="ShippingStandbyModule.viewShippingStandard('${encodeURIComponent(key)}')">보기</button>
                    <button class="btn btn-sm btn-outline" onclick="ShippingStandbyModule._sstdPrint('${encodeURIComponent(key)}')" style="margin-left:4px;" title="출력"><span class="material-symbols-outlined" style="font-size:0.9rem;">print</span></button>`
                        : `<button class="btn btn-sm btn-outline" onclick="ShippingStandbyModule.openShippingStandardEditor('${encodeURIComponent(key)}')">등록</button>`}
                </td>
            </tr>`;
    }

    function _sstdCarOptionsHtml(products, selected) {
        const cars = [...new Set((products || []).map(p => String(p.carModel || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return `<option value="">전체 차종</option>` + cars.map(c =>
            `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`
        ).join('');
    }

    /** 목록 필터 유지 (편집·저장 후에도 차종/검색어 복원) */
    let _sstdListFilter = { car: '', q: '' };

    function _sstdCaptureListFilter() {
        for (const prefix of ['sstdPage', 'sstdModal']) {
            const carEl = document.getElementById(prefix + 'Car');
            const qEl = document.getElementById(prefix + 'Q');
            if (!carEl && !qEl) continue;
            _sstdListFilter = {
                car: String((carEl && carEl.value) || '').trim(),
                q: String((qEl && qEl.value) || '').trim()
            };
            return;
        }
    }

    function _sstdFilterBarHtml(products, prefix) {
        const idCar = prefix + 'Car';
        const idQ = prefix + 'Q';
        const idCnt = prefix + 'Count';
        const selCar = _sstdListFilter.car || '';
        const selQ = _sstdListFilter.q || '';
        return `
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
                <select id="${idCar}" class="form-select" style="width:150px;height:34px;font-size:0.82rem;"
                    onchange="ShippingStandbyModule._sstdFilterList('${prefix}')">
                    ${_sstdCarOptionsHtml(products, selCar)}
                </select>
                <input id="${idQ}" class="form-input" type="search" placeholder="품명·컬러 검색"
                    value="${_esc(selQ)}"
                    style="width:220px;height:34px;font-size:0.82rem;"
                    oninput="ShippingStandbyModule._sstdFilterList('${prefix}')">
                <span id="${idCnt}" style="font-size:0.8rem;color:var(--text-muted);margin-left:4px;"></span>
            </div>`;
    }

    function _sstdFilterList(prefix) {
        const root = prefix === 'sstdModal'
            ? document.getElementById('sstdModalListWrap')
            : document.getElementById('sstdPageListWrap');
        if (!root) return;
        const car = String((document.getElementById(prefix + 'Car') || {}).value || '').trim();
        const qRaw = String((document.getElementById(prefix + 'Q') || {}).value || '').trim();
        const q = qRaw.toLowerCase().replace(/\s+/g, ' ');
        _sstdListFilter = { car, q: qRaw };
        const rows = root.querySelectorAll('tr.sstd-list-row');
        let shown = 0;
        rows.forEach(tr => {
            const rowCar = tr.getAttribute('data-sstd-car') || '';
            const rowQ = tr.getAttribute('data-sstd-q') || '';
            const okCar = !car || rowCar === car;
            const okQ = !q || rowQ.includes(q);
            const show = okCar && okQ;
            tr.style.display = show ? '' : 'none';
            if (show) shown++;
        });
        const cnt = document.getElementById(prefix + 'Count');
        if (cnt) cnt.textContent = `표시 ${shown} / ${rows.length}종`;
        const empty = root.querySelector('.sstd-filter-empty');
        if (empty) empty.style.display = shown ? 'none' : '';
    }

    /** 차종·품명·컬러로 기준서 찾기 (동기, standards 맵 전달) */
    function _findShipStandardIn(standards, carModel, partName, color) {
        const cm = String(carModel || '').trim();
        const pn = String(partName || '').trim();
        const cl = String(color || '').trim();
        if (!cm && !pn) return null;
        standards = standards || {};

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const matchProd = (exactColor) => products.find(p =>
            String(p.carModel || '').trim() === cm &&
            String(p.partName || '').trim() === pn &&
            (!exactColor || String(p.color || '').trim() === cl)
        );
        let product = cl ? matchProd(true) : null;
        if (!product) product = matchProd(false);
        if (product) {
            const key = _stdProductKey(product);
            if (standards[key]) return _sstdNormalize(standards[key], product);
        }

        const vals = Object.keys(standards).map(k => ({ key: k, std: standards[k] }));
        let hit = vals.find(({ std }) => std &&
            String(std.carModel || '').trim() === cm &&
            String(std.partName || '').trim() === pn &&
            String(std.color || '').trim() === cl);
        if (!hit) {
            hit = vals.find(({ std }) => std &&
                String(std.carModel || '').trim() === cm &&
                String(std.partName || '').trim() === pn);
        }
        return hit ? _sstdNormalize(hit.std, product || { carModel: cm, partName: pn, color: cl }) : null;
    }

    /** 기준서 checkPoints에서 외관/신뢰성 목록 추출 (신뢰성 비어 있으면 항목명으로 보완) */
    function _sstdPointsForGroup(checkPoints, group) {
        const split = _sstdSplitCheckPoints(checkPoints);
        const nonEmpty = p => String(p.item || '').trim() || String(p.standard || '').trim();
        if (group === 'reliability') {
            let list = split.reliability.slice();
            if (!list.length) {
                // 구분을 외관으로 둔 채 등록된 신뢰성 항목(부착성·색차 등)도 불러오기
                list = (checkPoints || []).filter(pt => {
                    if (_sstdGuessGroup(pt) === 'hidden') return false;
                    return _SSTD_RELI_ITEM_RE.test(String((pt && pt.item) || ''));
                });
            }
            return list.filter(nonEmpty);
        }
        let list = split.appearance.slice();
        // 신뢰성 구분이 비어 항목명으로 보완하는 경우, 해당 항목은 외관 목록에서 제외
        if (!split.reliability.length) {
            list = list.filter(pt => !_SSTD_RELI_ITEM_RE.test(String((pt && pt.item) || '')));
        }
        return list.filter(nonEmpty);
    }

    /** 기준서 주요검사 Point 개수·항목명 (목록 표시용) */
    function _stdPointsSummary(standards, carModel, partName, color, group) {
        const std = _findShipStandardIn(standards, carModel, partName, color);
        if (!std) return { count: 0, names: [], found: false };
        const list = _sstdPointsForGroup(std.checkPoints || [], group === 'reliability' ? 'reliability' : 'appearance');
        return {
            count: list.length,
            names: list.map(p => String(p.item || '').trim()).filter(Boolean),
            found: true
        };
    }

    /** 차종·품명·컬러로 기준서 찾기 (product.id 키 우선, 컬러 생략 폴백) */
    async function findShipStandard(carModel, partName, color) {
        const standards = await _loadShipStandards();
        return _findShipStandardIn(standards, carModel, partName, color);
    }

    /**
     * 기준서 주요검사 Point 불러오기
     * @param {'appearance'|'reliability'} group
     */
    async function getCheckPointsForProduct(carModel, partName, color, group) {
        const std = await findShipStandard(carModel, partName, color);
        if (!std) return [];
        const want = group === 'reliability' ? 'reliability' : 'appearance';
        return _sstdResolveMergePrev(_sstdPointsForGroup(std.checkPoints || [], want).map(p => ({
            group: want,
            item: p.item || '',
            standard: p.standard || '',
            method: p.method || '',
            sample: p.sample || '',
            management: p.management || '',
            mergePrev: p.mergePrev,
            resultValue: '',
            judge: ''
        })));
    }

    function _defaultShipStandard(product = {}) {
        return {
            processNo: '100',
            processName: '출하검사',
            docNo: 'KC-OS-021-1',
            revNo: '00',
            createdDate: UIUtils.today(),
            revisedDate: '',
            carModel: product.carModel || '',
            partName: product.partName || '',
            color: product.color || '',
            itemType: product.itemType || '',
            author: '', reviewer: '', approver: '',
            authorSeal: '', reviewerSeal: '', approverSeal: '',
            images: [],
            checkPoints: _SSTD_DEFAULT_POINTS.map(p => ({ ...p })),
            procedure: _SSTD_DEFAULT_PROC,
            corrective: _SSTD_DEFAULT_CORR,
            revisions: []
        };
    }

    // 이미지 정규화 (string 또는 {src,h,label,span})
    // span: 0=자동(홀수 마지막은 한 줄 전체), 1=반칸, 2=한 줄 전체
    function _sstdNormImg(v) {
        if (typeof v === 'string') return { src: v, h: 100, label: '', span: 0, rowSpan: 1 };
        const span = Number(v && v.span);
        return {
            src: (v && v.src) || '',
            h: (v && v.h) || 100,
            label: (v && v.label) || '',
            span: (span === 1 || span === 2) ? span : 0,
            rowSpan: Number(v && v.rowSpan) === 2 ? 2 : 1,
            free: !!(v && v.free),
            x: Number.isFinite(Number(v && v.x)) ? Number(v.x) : null,
            y: Number.isFinite(Number(v && v.y)) ? Number(v.y) : null,
            w: Number.isFinite(Number(v && v.w)) ? Number(v.w) : null
        };
    }

    // 자유 배치의 좌표는 편집 화면의 이미지 영역 폭을 기준으로 저장된다.
    // A4 보기/출력에서는 좌측 열이 더 좁아질 수 있으므로, 카드가 검사표 위로
    // 넘어가지 않도록 좌표·카드 크기를 같은 비율로 축소해 렌더링한다.
    function _sstdFitFreeImagesToDocument(images, splitWidth, sourceWidth, padding) {
        const list = (images || []).map(_sstdNormImg);
        const isFree = list.some(o => o.free && o.x !== null && o.y !== null);
        if (!isFree) return { images: list, isFree: false, height: 0 };

        const widthValue = String(splitWidth || '360px');
        const widthNumber = parseFloat(widthValue) || 360;
        const documentWidth = 281 * 96 / 25.4; // A4 가로 281mm의 CSS px 기준
        const leftWidth = widthValue.indexOf('%') >= 0
            ? documentWidth * widthNumber / 100
            : widthNumber;
        const contentWidth = list.reduce((max, o) => {
            if (!(o.free && o.x !== null && o.y !== null)) return max;
            return Math.max(max, (o.x || 0) + Math.max(120, o.w || 220));
        }, 0);
        const baseWidth = Math.max(Number(sourceWidth) || 0, contentWidth, 1);
        const availableWidth = Math.max(120, leftWidth - (Number(padding) || 12));
        const scale = Math.min(1, availableWidth / baseWidth);
        const scaled = list.map(o => {
            if (!(o.free && o.x !== null && o.y !== null)) return o;
            return Object.assign({}, o, {
                x: Math.round(o.x * scale),
                y: Math.round(o.y * scale),
                w: Math.max(80, Math.round((o.w || 220) * scale)),
                h: Math.max(40, Math.round((o.h || 100) * scale))
            });
        });
        const height = Math.max(180, scaled.reduce((max, o) => {
            if (!(o.free && o.x !== null && o.y !== null)) return max;
            return Math.max(max, (o.y || 0) + (o.h || 100) + 28);
        }, 0));
        return { images: scaled, isFree: true, height };
    }
    function _sstdImgColSpan(o, i, total, imgs) {
        if (!o) return 1;
        if (o.span === 2) return 2;
        if (o.span === 1) return 1;
        // 세로 2칸 사진이 있으면 옆 열을 위아래로 채우는 배치 — 홀수 마지막 자동 넓힘을 하지 않는다
        const hasRowSpan = Array.isArray(imgs) && imgs.some(function (m) { return _sstdNormImg(m).rowSpan === 2; });
        if (!hasRowSpan && total > 1 && total % 2 === 1 && i === total - 1) return 2;
        return 1;
    }
    /** 세로 2칸(왼쪽 큰 사진 + 오른쪽 열 위/아래 배치) — 한 줄 전체로 넓힌 사진에는 적용 안 함 */
    function _sstdImgRowSpan(o, i, total, imgs) {
        if (!o || o.rowSpan !== 2) return 1;
        return _sstdImgColSpan(o, i, total, imgs) === 2 ? 1 : 2;
    }

    // 저장된 데이터를 문서형 포맷으로 정규화 (구 단순폼 데이터 하위호환)
    function _sstdNormalize(data, product = {}) {
        const d = { ..._defaultShipStandard(product), ...(data || {}) };
        // 구 포맷: points[{item,standard,method,sample,action}] → checkPoints
        if ((!data || !data.checkPoints) && data && Array.isArray(data.points)) {
            d.checkPoints = data.points.map(p => ({
                item: p.item || '', standard: p.standard || '', method: p.method || '',
                sample: p.sample || '', management: p.management || p.action || '',
                group: _sstdGuessGroup(p)
            }));
        }
        // 구 포맷: actionNote → corrective, model → carModel
        if ((!data || !data.corrective) && data && data.actionNote) d.corrective = data.actionNote;
        if ((!data || !data.carModel) && data && data.model) d.carModel = data.model;
        if ((!data || !data.createdDate) && data && data.issueDate) d.createdDate = data.issueDate;
        d.images = (d.images || []).map(_sstdNormImg);
        if (!Array.isArray(d.checkPoints) || d.checkPoints.length === 0) {
            d.checkPoints = _SSTD_DEFAULT_POINTS.map(p => ({ ...p }));
        } else {
            d.checkPoints = _sstdResolveMergePrev(
                d.checkPoints.map(p => Object.assign({}, p || {}, { group: _sstdGuessGroup(p) }))
            );
        }
        return d;
    }

    async function openShippingStandardList() {
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || [])
            .slice()
            .sort(_sstdProductSort);
        const standards = await _loadShipStandards();
        const regCount = products.filter(p => standards[_stdProductKey(p)]).length;
        const rows = products.map(p => _sstdListRowHtml(p, standards)).join('');
        UIUtils.showModal('출하검사 기준서', `
            <div style="margin-bottom:8px;font-size:0.84rem;color:var(--text-secondary);">
                제품 마스터에 등록된 품목별 출하검사 기준서를 등록합니다. 등록 ${regCount} / 전체 ${products.length}종
            </div>
            ${_sstdFilterBarHtml(products, 'sstdModal')}
            <div id="sstdModalListWrap" style="max-height:560px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:max-content;min-width:100%;border-collapse:collapse;table-layout:auto;font-size:0.86rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:9px 10px;text-align:left;white-space:nowrap;">차종</th>
                            <th style="padding:9px 10px;text-align:left;white-space:nowrap;">품명</th>
                            <th style="padding:9px 10px;text-align:left;white-space:nowrap;">컬러</th>
                            <th style="padding:9px 10px;text-align:left;">주요검사 Point (외관)</th>
                            <th style="padding:9px 10px;text-align:left;">주요검사 Point (신뢰성)</th>
                            <th style="padding:9px 10px;text-align:center;white-space:nowrap;">상태</th>
                            <th style="padding:9px 10px;text-align:center;white-space:nowrap;">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="7" style="padding:36px;text-align:center;color:var(--text-muted);">제품 마스터에 등록된 품목이 없습니다.</td></tr>`}
                        <tr class="sstd-filter-empty" style="display:none;"><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted);">검색 결과가 없습니다.</td></tr>
                    </tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
        setTimeout(() => _sstdFilterList('sstdModal'), 0);
    }

    // 출하검사 기준서 목록을 페이지 컨테이너에 인라인 렌더 (허브 하위 페이지용)
    async function renderStandardListInto(container) {
        if (!container) return;
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || [])
            .slice()
            .sort(_sstdProductSort);
        const standards = await _loadShipStandards();
        const regCount = products.filter(p => standards[_stdProductKey(p)]).length;
        const rows = products.map(p => _sstdListRowHtml(p, standards)).join('');
        container.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-purple,#8b5cf6);">fact_check</span>
                        출하검사 기준서
                    </h4>
                    <span style="font-size:0.82rem;color:var(--text-muted);">등록 ${regCount} / 전체 ${products.length}종 — 품목별 기준서를 등록·편집·출력합니다.</span>
                </div>
                <div class="card-body" style="padding:12px 12px 0;">
                    ${_sstdFilterBarHtml(products, 'sstdPage')}
                </div>
                <div class="card-body" style="padding:0;" id="sstdPageListWrap">
                    <div class="data-table-wrapper" style="overflow:auto;">
                        <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;">
                            <thead>
                                <tr>
                                    <th style="white-space:nowrap;">차종</th>
                                    <th style="white-space:nowrap;">품명</th>
                                    <th style="white-space:nowrap;">컬러</th>
                                    <th>주요검사 Point (외관)</th>
                                    <th>주요검사 Point (신뢰성)</th>
                                    <th style="text-align:center;white-space:nowrap;">상태</th>
                                    <th style="text-align:center;white-space:nowrap;">작업</th>
                                </tr>
                            </thead>
                            <tbody>${rows || `<tr><td colspan="7" style="padding:36px;text-align:center;color:var(--text-muted);">제품 마스터에 등록된 품목이 없습니다.</td></tr>`}
                                <tr class="sstd-filter-empty" style="display:none;"><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted);">검색 결과가 없습니다.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        setTimeout(() => _sstdFilterList('sstdPage'), 0);
    }

    /* ═══ 출하검사 기준서 — 수입검사와 동일한 문서형 편집기 ═══════════════ */
    const _SSTD_DIAG = 'linear-gradient(to top right,transparent calc(50% - 0.5px),#bbb calc(50% - 0.5px),#bbb calc(50% + 0.5px),transparent calc(50% + 0.5px))';
    const _SSTD_HDL  = 'position:absolute;width:12px;height:12px;background:#2563eb;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:20;pointer-events:auto;touch-action:none;';

    /** 확인방법·시료 셀 합치기: 이전 행과 같은 구분이면 한 칸으로 표시 */
    function _sstdResolveMergePrev(pts) {
        return (pts || []).map((p, i, arr) => {
            const group = _sstdNormGroup((p && p.group) || _sstdGuessGroup(p));
            const prev = i > 0 ? arr[i - 1] : null;
            const prevGroup = prev ? _sstdNormGroup(prev.group || _sstdGuessGroup(prev)) : '';
            let mergePrev = p && p.mergePrev;
            if (mergePrev !== true && mergePrev !== false) {
                mergePrev = i > 0 && group === 'appearance' && prevGroup === 'appearance';
            }
            if (i === 0 || group !== prevGroup) mergePrev = false;
            return Object.assign({}, p || {}, { group, mergePrev: !!mergePrev });
        });
    }

    function _sstdMsSpans(list) {
        const flags = (list || []).map((pt, i) => i > 0 && !!(pt && pt.mergePrev));
        const span = new Array(flags.length).fill(1);
        const skip = new Array(flags.length).fill(false);
        for (let i = 0; i < flags.length; i++) {
            if (skip[i]) continue;
            let len = 1;
            while (i + len < flags.length && flags[i + len]) len += 1;
            span[i] = len;
            for (let k = 1; k < len; k++) skip[i + k] = true;
        }
        return { span, skip };
    }

    function _sstdCheckRowHtml(pt, idx, opt) {
        pt = pt || {};
        opt = opt || {};
        const group = _sstdGuessGroup(pt);
        const mergePrev = !!pt.mergePrev;
        const muted = group === 'hidden' ? 'opacity:0.55;' : '';
        const msSpan = opt.msSpan || 1;
        const skipMs = !!opt.skipMs;
        const methodSampleTds = skipMs ? '' : `
            <td rowspan="${msSpan}" style="padding:2px;border:1px solid #bbb;text-align:center;vertical-align:middle;white-space:nowrap;position:relative;">
                <input class="sstd-pt-method" type="text" value="${_esc(pt.method || '')}"
                    title="확인방법 — 합친 칸은 전 항목 공통"
                    style="border:none;background:transparent;font-size:10px;padding:2px;text-align:center;width:auto;min-width:3em;">
                ${msSpan > 1 ? '<div style="font-size:7px;color:#64748b;margin-top:1px;line-height:1.2;">전 항목 공통</div>' : ''}
            </td>
            <td rowspan="${msSpan}" style="padding:2px;border:1px solid #bbb;text-align:center;vertical-align:middle;white-space:nowrap;position:relative;">
                <input class="sstd-pt-sample" type="text" value="${_esc(pt.sample || '')}"
                    title="시료 — 합친 칸은 전 항목을 이 수량으로 검사"
                    style="border:none;background:transparent;font-size:8px;padding:2px;text-align:center;width:auto;min-width:4em;">
                ${msSpan > 1 ? '<div style="font-size:7px;color:#64748b;margin-top:1px;line-height:1.2;">전 항목 공통</div>' : ''}
            </td>`;
        const mergeBtn = opt.showMergeToggle
            ? (mergePrev
                ? `<button type="button" onclick="ShippingStandbyModule._sstdToggleMergePrev(this)"
                    title="확인방법·시료 선 복원 (셀 나누기)"
                    style="font-size:8px;padding:1px 4px;border:1px solid #94a3b8;border-radius:3px;background:#f8fafc;color:#334155;cursor:pointer;vertical-align:middle;white-space:nowrap;">선복원</button>`
                : `<button type="button" onclick="ShippingStandbyModule._sstdToggleMergePrev(this)"
                    title="확인방법·시료 선 삭제 (셀 합치기)"
                    style="font-size:8px;padding:1px 4px;border:1px solid #2563eb;border-radius:3px;background:#eff6ff;color:#1d4ed8;cursor:pointer;vertical-align:middle;white-space:nowrap;">선삭제</button>`)
            : '';
        return `<tr class="sstd-pt-row" data-group="${group}" data-merge-prev="${mergePrev ? '1' : '0'}" style="${muted}">
            <td class="sstd-pt-no" style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;white-space:nowrap;">
                <span class="sstd-pt-drag" title="드래그하여 순서 변경" draggable="true"
                    style="display:inline-flex;align-items:center;cursor:grab;color:#94a3b8;vertical-align:middle;user-select:none;">
                    <span class="material-symbols-outlined" style="font-size:14px;line-height:1;">drag_indicator</span>
                </span>
                <span class="sstd-pt-no-num">${idx == null ? '-' : idx + 1}</span>
            </td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-item" type="text" value="${_esc(pt.item || '')}"
                style="border:none;background:transparent;font-size:10px;padding:2px;width:auto;min-width:5em;white-space:nowrap;"></td>
            <td style="padding:4px 2px;border:1px solid #bbb;"><div class="sstd-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;min-height:1.5em;">${_esc(pt.standard || '')}</div></td>
            ${methodSampleTds}
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-mgmt" type="text" value="${_esc(pt.management || '')}"
                style="border:none;background:transparent;font-size:8px;padding:2px;width:auto;min-width:6em;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                ${mergeBtn}
                <select class="sstd-pt-group-sel" title="구분 변경"
                    onchange="ShippingStandbyModule._sstdChangeCheckGroup(this)"
                    style="font-size:9px;border:1px solid #ccc;border-radius:3px;padding:1px 2px;vertical-align:middle;max-width:4.8em;background:#fff;">
                    <option value="appearance"${group === 'appearance' ? ' selected' : ''}>외관</option>
                    <option value="reliability"${group === 'reliability' ? ' selected' : ''}>신뢰성</option>
                    <option value="hidden"${group === 'hidden' ? ' selected' : ''}>숨김</option>
                </select>
                <button type="button" onclick="ShippingStandbyModule._sstdInsertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;vertical-align:middle;" title="아래 행 추가">+</button>
                <button type="button" onclick="ShippingStandbyModule._sstdRemoveCheckRow(this)"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;vertical-align:middle;" title="행 삭제">−</button>
            </td></tr>`;
    }

    function _sstdBuildListHtml(list) {
        const resolved = _sstdResolveMergePrev(list);
        const { span, skip } = _sstdMsSpans(resolved);
        let html = '';
        resolved.forEach((pt, i) => {
            html += _sstdCheckRowHtml(pt, null, {
                msSpan: span[i],
                skipMs: skip[i],
                showMergeToggle: i > 0
            });
        });
        return html;
    }

    function _sstdBuildCheckBodyHtml(checkPoints) {
        const { appearance, reliability, hidden } = _sstdSplitCheckPoints(checkPoints);
        const app = appearance.length ? appearance : [{ group: 'appearance' }];
        const reli = reliability.length ? reliability : [{ group: 'reliability' }];
        return _sstdBuildListHtml(app)
            + _sstdBuildListHtml(reli)
            + (hidden.length ? _sstdBuildListHtml(hidden) : '');
    }

    function _sstdGroupedStaticRowsHtml(checkPoints, forPrint) {
        const { appearance, reliability } = _sstdSplitCheckPoints(checkPoints);
        let n = 0;
        const cellPad = forPrint ? '' : 'padding:3px;border:1px solid #bbb;font-size:10px;';
        const block = (list, label, tone) => {
            const items = list.length ? list : [{ item: '', standard: '항목 없음', method: '', sample: '', management: '' }];
            const resolved = _sstdResolveMergePrev(items.map(pt => Object.assign({ group: items[0] && items[0].group }, pt)));
            const { span, skip } = _sstdMsSpans(resolved);
            return resolved.map((pt, idx) => {
                n += 1;
                const groupTd = idx === 0
                    ? `<td rowspan="${items.length}" style="${cellPad}width:auto;max-width:1.4em;background:${tone};font-weight:700;text-align:center;vertical-align:middle;writing-mode:vertical-rl;letter-spacing:2px;white-space:nowrap;">${label}</td>`
                    : '';
                const msTd = skip[idx] ? '' : (() => {
                    const run = resolved.slice(idx, idx + span[idx]);
                    const method = ((run.find(r => String(r.method || '').trim()) || run[0]).method || '');
                    const sample = ((run.find(r => String(r.sample || '').trim()) || run[0]).sample || '');
                    const rs = span[idx];
                    return `<td rowspan="${rs}" style="${cellPad}text-align:center;vertical-align:middle;white-space:nowrap;">${_esc(method)}</td>
                    <td rowspan="${rs}" style="${cellPad}text-align:center;vertical-align:middle;white-space:nowrap;font-size:8px;">${_esc(sample)}</td>`;
                })();
                return `<tr>
                    ${groupTd}
                    <td style="${cellPad}text-align:center;white-space:nowrap;">${n}</td>
                    <td style="${cellPad}white-space:nowrap;">${_esc(pt.item || '')}</td>
                    <td style="${cellPad}white-space:pre-wrap;">${_esc(pt.standard || '')}</td>
                    ${msTd}
                    <td style="${cellPad}white-space:nowrap;font-size:8px;">${_esc(pt.management || '')}</td>
                </tr>`;
            }).join('');
        };
        return block(appearance, '외관', '#d0e4f7') + block(reliability, '신뢰성', '#fde8d0');
    }

    function _sstdViewCheckRowsHtml(checkPoints) {
        return _sstdGroupedStaticRowsHtml(checkPoints, false);
    }

    function _sstdPrintCheckRowsHtml(checkPoints) {
        return _sstdGroupedStaticRowsHtml(checkPoints, true);
    }

    const _SSTD_REV_DATE_W = '88px';

    function _sstdRevColgroupHtml(dateWidth, forEdit) {
        const dw = dateWidth || _SSTD_REV_DATE_W;
        return `<colgroup>
            <col style="width:20px">
            <col style="width:28px">
            <col${forEdit ? ' id="sstdRevDateCol"' : ''} style="width:${_esc(dw)}">
            <col>
            <col style="width:72px">
            ${forEdit ? '<col style="width:44px">' : ''}
        </colgroup>`;
    }

    /** 조치사항(남은 높이 채움) + 개정내용 표를 편집/보기/출력에서 같은 비율로 쌓는다 */
    function _sstdRightStackHtml(headerClass, correctiveInner, revTableHtml) {
        return `<div class="sstd-corrective-stack" style="display:flex;flex-direction:column;height:100%;">
            <div style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;">
                <div class="${headerClass}" style="flex:0 0 auto;border:none;border-bottom:1px solid #888;">조 치 사 항</div>
                <div class="sstd-corrective-body" style="flex:1 1 auto;padding:6px;min-height:0;font-size:11px;line-height:1.8;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">${correctiveInner}</div>
            </div>
            ${revTableHtml}
        </div>`;
    }

    function _sstdRevRowHtml(r) {
        r = r || {};
        const hasCf = !!String(r.confirmer || '').trim();
        return `<tr style="height:32px;">
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-rev-no" type="text" value="${_esc(r.no || '')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-rev-date" type="text" value="${_esc(r.date || '')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="sstd-rev-reason" type="text" value="${_esc(r.reason || '')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;"></td>
            <td style="padding:0;border:1px solid #bbb;background:${hasCf ? 'none' : _SSTD_DIAG};">
                <input class="sstd-rev-confirmer" type="text" list="sstdUserDatalist" value="${_esc(r.confirmer || '')}"
                    style="width:100%;height:32px;border:none;background:transparent;font-size:10px;text-align:center;display:block;"
                    oninput="ShippingStandbyModule._sstdOnCfInput(this)"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <button type="button" onclick="ShippingStandbyModule._sstdInsertRevRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>`;
    }

    function _sstdRenderImgGrid(images) {
        if (!images || !images.length) return `
            <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:0;color:#bbb;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:32px;">content_paste</span>
                <span style="font-size:.75rem;">클릭 후 Ctrl+V 또는 파일 선택</span>
            </div>`;
        return images.map((img, i) => {
            const o = _sstdNormImg(img);
            const last = i === images.length - 1;
            const colSpan = _sstdImgColSpan(o, i, images.length, images);
            const wide = colSpan === 2;
            const tall = _sstdImgRowSpan(o, i, images.length, images) === 2;
            const free = o.free && o.x !== null && o.y !== null;
            const freeStyle = free
                ? `position:absolute;left:${Math.max(0, o.x)}px;top:${Math.max(0, o.y)}px;width:${Math.max(120, o.w || 220)}px;`
                : '';
            return `
            <div class="sstd-img-card" data-idx="${i}" draggable="${free ? 'false' : 'true'}"
                ondragover="ShippingStandbyModule._sstdDragOver(event)"
                ondrop="ShippingStandbyModule._sstdDragDrop(event,${i})"
                ondragstart="ShippingStandbyModule._sstdDragStart(event,${i})"
                ondragend="ShippingStandbyModule._sstdDragEnd(event)"
                onmousedown="${free ? `ShippingStandbyModule._sstdStartFreeDrag(event,${i})` : ''}"
                style="position:relative;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;user-select:none;${freeStyle}${free ? '' : (wide ? 'grid-column:1/-1;' : '')}${free ? '' : (tall ? 'grid-row:span 2;' : '')}">
                <div class="sstd-img-dragbar" title="드래그하여 위치 변경"
                    style="flex:0 0 auto;padding:2px 48px 2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:4px;cursor:grab;">
                    <span class="material-symbols-outlined" style="font-size:14px;color:#64748b;flex:0 0 auto;">drag_indicator</span>
                    <input type="text" value="${_esc(o.label)}" placeholder="라벨 (예: 외관)"
                        onchange="ShippingStandbyModule._sstdUpdateImgLabel(${i},this.value)"
                        onclick="event.stopPropagation()"
                        onmousedown="event.stopPropagation()"
                        style="flex:1;min-width:0;border:none;background:transparent;font-size:10px;outline:none;cursor:text;">
                    <button type="button" title="${wide ? '반칸으로 줄이기' : '한 줄 전체로 넓히기'}"
                        onclick="event.stopPropagation();ShippingStandbyModule._sstdToggleImgSpan(${i})"
                        style="flex:0 0 auto;border:1px solid #cbd5e1;background:${wide ? '#dbeafe' : '#fff'};border-radius:3px;height:16px;font-size:9px;line-height:1;cursor:pointer;padding:0 4px;color:#1d4ed8;font-weight:700;">${wide ? '좁힘' : '넓힘'}</button>
                    ${wide ? '' : `<button type="button" title="${tall ? '세로 1칸으로 줄이기' : '세로 2칸 차지 — 옆 열에 사진 2장을 위/아래로 배치'}"
                        onclick="event.stopPropagation();ShippingStandbyModule._sstdToggleImgRowSpan(${i})"
                        style="flex:0 0 auto;border:1px solid #cbd5e1;background:${tall ? '#dbeafe' : '#fff'};border-radius:3px;height:16px;font-size:9px;line-height:1;cursor:pointer;padding:0 4px;color:#1d4ed8;font-weight:700;">${tall ? '세로↑' : '세로'}</button>`}
                    <button type="button" title="한 칸 앞으로 (오른쪽 위로)"
                        onclick="event.stopPropagation();ShippingStandbyModule._sstdMoveImage(${i},-1)"
                        ${i === 0 ? 'disabled' : ''}
                        style="flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;border-radius:3px;width:18px;height:16px;font-size:10px;line-height:1;cursor:pointer;padding:0;color:#334155;">◀</button>
                    <button type="button" title="한 칸 뒤로"
                        onclick="event.stopPropagation();ShippingStandbyModule._sstdMoveImage(${i},1)"
                        ${last ? 'disabled' : ''}
                        style="flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;border-radius:3px;width:18px;height:16px;font-size:10px;line-height:1;cursor:pointer;padding:0;color:#334155;">▶</button>
                </div>
                <div class="sstd-img-wrap" style="height:${o.h}px;">
                    <img src="${o.src}" draggable="false" alt="">
                    <div class="sstd-img-hdl" style="${_SSTD_HDL}top:0;left:0;cursor:nw-resize;" onmousedown="ShippingStandbyModule._sstdStartResize(event,${i},'nw')"></div>
                    <div class="sstd-img-hdl" style="${_SSTD_HDL}top:0;right:0;cursor:ne-resize;" onmousedown="ShippingStandbyModule._sstdStartResize(event,${i},'ne')"></div>
                    <div class="sstd-img-hdl" style="${_SSTD_HDL}bottom:0;left:0;cursor:sw-resize;" onmousedown="ShippingStandbyModule._sstdStartResize(event,${i},'sw')"></div>
                    <div class="sstd-img-hdl" style="${_SSTD_HDL}bottom:0;right:0;cursor:se-resize;" onmousedown="ShippingStandbyModule._sstdStartResize(event,${i},'se')"></div>
                </div>
                <button type="button" onclick="event.stopPropagation();ShippingStandbyModule._sstdRemoveImage(${i})"
                    style="position:absolute;top:22px;right:2px;background:rgba(220,38,38,.8);border:none;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;z-index:11;">✕</button>
            </div>`;
        }).join('');
    }

    function _sstdUserDatalistHtml() {
        const users = (typeof ApprovalUtils !== 'undefined' && ApprovalUtils.getUsers)
            ? ApprovalUtils.getUsers()
            : ((typeof AuthModule !== 'undefined' && AuthModule.getUsers) ? (AuthModule.getUsers() || []).filter(u => u && u.active !== false) : []);
        return `<datalist id="sstdUserDatalist">${users.map(u =>
            `<option value="${_esc(u.displayName || u.name || u.username || '')}"></option>`
        ).join('')}</datalist>`;
    }

    /** 편집: 이름만 입력 */
    function _sstdSignCellEditHtml(role, name) {
        const ids = { author: 'sstdAuthor', reviewer: 'sstdReviewer', approver: 'sstdApprover' };
        const id = ids[role] || ('sstd_' + role);
        return `<td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;padding:4px;min-width:80px;">
            <input class="doc-input" id="${id}" list="sstdUserDatalist"
                value="${_esc(name || '')}" placeholder="이름"
                style="text-align:center;font-weight:700;width:100%;">
        </td>`;
    }

    /** 보기/출력: 날인 표시 (없으면 이름으로 사용자 마스터에서 조회) */
    function _sstdSealForName(name, existingSeal) {
        if (existingSeal && String(existingSeal).trim()) return existingSeal;
        if (!name) return '';
        if (typeof ApprovalUtils !== 'undefined' && ApprovalUtils.resolveSeal) {
            return ApprovalUtils.resolveSeal(name, '') || '';
        }
        return '';
    }

    function _sstdSignCellViewHtml(name, seal) {
        const resolved = _sstdSealForName(name, seal);
        if (resolved) {
            // data URL은 속성 따옴표만 이스케이프 (전체 _esc 시 깨질 수 있음)
            const src = String(resolved).replace(/"/g, '&quot;');
            return `<div style="display:flex;align-items:center;justify-content:center;min-height:56px;padding:2px;">
                <img src="${src}" alt="${_esc(name || '날인')}" style="max-width:64px;max-height:64px;object-fit:contain;" title="${_esc(name || '')}">
            </div>`;
        }
        return `<span style="font-weight:700;">${_esc(name || '')}</span>`;
    }

    /** 개정내용 확인란: 결재 날인의 절반 크기 */
    function _sstdConfirmerViewHtml(name) {
        const resolved = _sstdSealForName(name, '');
        if (resolved) {
            const src = String(resolved).replace(/"/g, '&quot;');
            return `<img src="${src}" alt="${_esc(name || '날인')}" style="max-width:22px;max-height:22px;object-fit:contain;vertical-align:middle;" title="${_esc(name || '')}">`;
        }
        return name ? `<span style="font-weight:700;">${_esc(name)}</span>` : '';
    }

    async function openShippingStandardEditor(encodedKey, sourceOverride) {
        _sstdCaptureListFilter();
        const key = decodeURIComponent(encodedKey);
        _sstdCurrentKey = key;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const standards = await _loadShipStandards();
        const isEdit = !!standards[key];
        const data = _sstdNormalize(sourceOverride || standards[key], product);
        // 다른 기준서에서 불러온 경우에도 현재 품목 식별은 유지
        if (sourceOverride) {
            data.carModel = product.carModel || data.carModel || '';
            data.partName = product.partName || data.partName || '';
            data.color = product.color || data.color || '';
            data.itemType = product.itemType || data.itemType || '';
        }

        _sstdImages = (data.images || []).map(_sstdNormImg);

        const ptRows = _sstdBuildCheckBodyHtml(data.checkPoints || []);
        // 마우스로 조절했던 표 레이아웃(좌우 폭·블록 높이·주요검사Point 열 폭)을 저장값에서 복원
        const _layout = data.layout || {};
        // 퍼센트 합 100 — table-layout:fixed + width:100%와 함께 써야 스크롤 없이 표 폭 안에서만
        // 조절된다(픽셀 고정폭을 쓰면 전체 폭이 늘어나 가로 스크롤이 생긴다).
        const _ptColDefaults = ['5%', '5%', '11%', '38%', '10%', '8%', '9%', '14%'];
        const _ptColWidths = _ptColDefaults.map((def, i) => (_layout.ptColWidths && _layout.ptColWidths[i]) || def);
        const _splitLeftWidth = _layout.splitLeftWidth || '360px';
        const _splitHeightStyle = _layout.splitHeight ? `height:${_esc(_layout.splitHeight)};` : '';
        const _bottomLeftWidth = _layout.bottomLeftWidth || '48%';
        const _revDateWidth = _layout.revDateWidth || _SSTD_REV_DATE_W;
        const _rawRevs = (data.revisions || []).filter(r => !!(r.no || r.reason));
        const revs = _rawRevs.length ? _rawRevs : [{ no: '00', date: data.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revs.map(_sstdRevRowHtml).join('');

        const carModel = product.carModel || data.carModel || '';
        const sameCar = String(carModel || '').trim();
        const loadOpts = products
            .filter(p => {
                const k = _stdProductKey(p);
                if (k === key || !standards[k]) return false;
                return String(p.carModel || '').trim() === sameCar;
            })
            .map(p => {
                const k = _stdProductKey(p);
                const label = [p.partName, p.color].filter(Boolean).join(' | ') || k;
                return `<option value="${_esc(k)}">${_esc(label)}</option>`;
            })
            .join('');

        const docStyle = `
            <style>
            #sstdDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #sstdDoc table { border-collapse:collapse; width:100%; }
            #sstdDoc td, #sstdDoc th { vertical-align:middle; }
            #sstdDoc .doc-th { background:#d0e4f7; font-weight:700; text-align:center; border:1px solid #888; padding:4px 6px; }
            #sstdDoc .doc-sec { background:#d0e4f7; font-weight:700; text-align:center; border:none; border-bottom:1px solid #888; padding:5px; font-size:12px; }
            #sstdDoc .doc-cell { border:1px solid #888; padding:3px 6px; vertical-align:middle; text-align:left; }
            #sstdDoc .doc-label { background:#f0f0f0; font-weight:700; text-align:center; border:1px solid #888; padding:3px 6px; white-space:nowrap; vertical-align:middle; }
            #sstdDoc .doc-input { border:none; background:transparent; width:100%; font-family:inherit; font-size:inherit; color:#111; padding:0; outline:none; vertical-align:middle; text-align:left; }
            #sstdDoc .doc-input:focus { background:#fffbeb; border-radius:2px; }
            #sstdDoc > table + table { margin-top:-1px; }
            #sstdDoc .sstd-split-left { overflow:hidden; }
            #sstdDoc .sstd-img-pane { display:flex;flex-direction:column;min-height:100%;overflow:hidden; }
            #sstdDoc #sstdImgPasteZone { flex:0 0 auto;overflow:hidden;padding:6px;box-sizing:border-box; }
            #sstdDoc #sstdImgGrid { display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start;align-items:start; }
            #sstdDoc .sstd-img-card { min-width:0;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box; }
            #sstdDoc .sstd-img-wrap { position:relative;flex:0 0 auto;overflow:hidden;background:#fff; }
            #sstdDoc .sstd-img-wrap img { width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;display:block;background:#fff;pointer-events:none; }
            #sstdDoc .sstd-split-handle:hover { background:rgba(37,99,235,0.35); }
            #sstdDoc .sstd-split-vresize:hover { background:rgba(37,99,235,0.35); }
            /* 조절 가능한 경계임을 항상 옅게 표시하고, 마우스를 올리면 진하게 */
            #sstdDoc .sstd-pt-col-handle { background:rgba(37,99,235,0.14); }
            #sstdDoc .sstd-pt-col-handle:hover { background:rgba(37,99,235,0.55); }
            #sstdDoc .sstd-split-handle { background:rgba(37,99,235,0.14); }
            #sstdDoc .sstd-split-vresize { background:rgba(37,99,235,0.10); }
            /* 열 폭을 colgroup(%)으로만 정한다 — max-content/min-width가 남아 있으면 열을 줄여도
               내용이 셀을 밀어내 폭이 안 줄고 가로 스크롤이 생긴다. */
            #sstdDoc .sstd-pt-table { width:100%; table-layout:fixed; }
            #sstdDoc .sstd-pt-table .doc-th { white-space:nowrap; overflow:hidden; }
            #sstdDoc .sstd-pt-table td { overflow:hidden; }
            #sstdDoc .sstd-pt-table .sstd-pt-std { white-space:pre-wrap; word-break:break-all; }
            #sstdDoc .sstd-pt-table input { width:100% !important; min-width:0 !important; }
            #sstdDoc #sstdRevTable { width:100%; table-layout:fixed; }
            #sstdDoc #sstdRevTable .sstd-rev-date { width:100%; min-width:0; }
            #sstdDoc .sstd-corrective-stack { height:100%; }
            #sstdDoc .sstd-corrective-body textarea { width:100%; height:100%; box-sizing:border-box; }
            </style>`;

        UIUtils.showModal(`출하검사 기준서 ${isEdit ? '수정' : '등록'} — ${_stdProductLabel(product)}`, `
        ${docStyle}
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <span style="font-size:0.8rem;font-weight:700;white-space:nowrap;">기존 기준서 불러오기</span>
            <span style="font-size:0.72rem;color:#64748b;white-space:nowrap;">(${_esc(sameCar || '차종')} · 동일 차종만)</span>
            <select id="sstdLoadFrom" class="form-select" style="flex:1;min-width:220px;height:34px;font-size:0.82rem;">
                <option value="">— 품명 | 컬러 선택 —</option>
                ${loadOpts || '<option value="" disabled>동일 차종에 등록된 다른 기준서 없음</option>'}
            </select>
            <button type="button" class="btn btn-sm btn-outline" onclick="ShippingStandbyModule._sstdLoadFromRegistered()">
                <span class="material-symbols-outlined" style="font-size:14px;">download</span> 불러오기
            </button>
        </div>
        <input type="hidden" id="sstdProcessNo"   value="${_esc(data.processNo || '100')}">
        <input type="hidden" id="sstdRevNo"       value="${_esc(data.revNo || '00')}">
        <input type="hidden" id="sstdCreatedDate" value="${_esc(data.createdDate || UIUtils.today())}">
        <input type="hidden" id="sstdRevisedDate" value="${_esc(data.revisedDate || '')}">
        <input type="hidden" id="sstdItemType"    value="${_esc(data.itemType || product.itemType || '')}">
        <input type="hidden" id="sstdColor"       value="${_esc(data.color || product.color || '')}">
        <input type="hidden" id="sstdEquipment"   value="${_esc(data.equipmentName || '')}">
        ${_sstdUserDatalistHtml()}
        <div id="sstdDoc">
        <table style="margin-bottom:0;">
            <colgroup><col style="width:58px"><col style="width:260px"><col style="width:auto"><col style="width:26px"><col style="width:88px"><col style="width:88px"><col style="width:88px"></colgroup>
            <tr style="height:20px;">
                <td class="doc-label">공정NO</td>
                <td class="doc-cell" style="text-align:center;font-weight:700;font-size:12px;">${_esc(data.processNo || '100')}</td>
                <td rowspan="4" class="doc-cell" style="text-align:center;font-size:20px;font-weight:900;letter-spacing:3px;">출하검사 기준서</td>
                <td class="doc-th" style="border-bottom:none;"></td>
                <td class="doc-th">작 성</td><td class="doc-th">검 토</td><td class="doc-th">승 인</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">공정명</td>
                <td class="doc-cell" style="text-align:center;"><input class="doc-input" id="sstdProcessName" value="${_esc(data.processName || '출하검사')}" style="text-align:center;font-weight:700;"></td>
                <td class="doc-th" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:4px 2px;font-size:11px;letter-spacing:3px;border-top:none;">결 재</td>
                ${_sstdSignCellEditHtml('author', data.author)}
                ${_sstdSignCellEditHtml('reviewer', data.reviewer)}
                ${_sstdSignCellEditHtml('approver', data.approver)}
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">차 종</td>
                <td class="doc-cell" style="text-align:center;font-weight:700;"><input class="doc-input" id="sstdCarModel" value="${_esc(data.carModel || product.carModel || '')}" style="text-align:center;font-weight:700;"></td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">품 명</td>
                <td class="doc-cell" style="font-weight:700;color:#1d4ed8;text-align:center;min-width:260px;">
                    <input class="doc-input" id="sstdPartName" value="${_esc(data.partName || product.partName || '')}"
                        style="font-weight:700;color:#1d4ed8;text-align:center;white-space:nowrap;min-width:240px;">
                </td>
            </tr>
        </table>
        <table class="sstd-split" id="sstdSplitTable" style="margin-top:0;table-layout:fixed;width:100%;${_splitHeightStyle}">
            <colgroup><col id="sstdSplitLeftCol" style="width:${_esc(_splitLeftWidth)}"><col></colgroup>
            <tr>
                <td class="sstd-split-left" style="width:${_esc(_splitLeftWidth)};border:1px solid #888;padding:0;vertical-align:top;position:relative;overflow:hidden;">
                    <div class="sstd-split-handle" title="드래그해서 표 간격 조절"
                        onmousedown="ShippingStandbyModule._sstdStartSplitResize(event)"
                        style="position:absolute;top:0;bottom:0;right:-4px;width:8px;cursor:col-resize;z-index:5;"></div>
                    <div class="sstd-img-pane">
                    <div class="doc-sec" style="flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:5px 8px;">
                        <span>외관 / 치수포인트</span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <button type="button" title="블록을 왼쪽 영역 안에서 자유롭게 이동"
                                onclick="ShippingStandbyModule._sstdEnableFreeLayout()"
                                style="border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;border-radius:3px;height:18px;font-size:9px;cursor:pointer;padding:0 5px;">자유 배치</button>
                            <button type="button" title="첫 이미지를 왼쪽 세로 블록으로, 광택·색차를 오른쪽 위·아래로 배치"
                                onclick="ShippingStandbyModule._sstdApplyImageLayout('left-tall')"
                                style="border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:3px;height:18px;font-size:9px;cursor:pointer;padding:0 5px;">좌측 크게 배치</button>
                            <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:.72rem;font-weight:400;color:#2563eb;white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:14px;">add_photo_alternate</span>
                                <input type="file" accept="image/*" multiple style="display:none;" onchange="ShippingStandbyModule._sstdAddImages(this)">
                            </label>
                        </span>
                    </div>
                    <div id="sstdImgPasteZone" tabindex="0"
                        onpaste="ShippingStandbyModule._sstdOnPaste(event)"
                        onfocus="this.style.outline='2px dashed #2563eb';this.style.outlineOffset='-3px'"
                        onblur="this.style.outline='none'" onclick="this.focus()"
                        style="outline:none;cursor:pointer;">
                        <div id="sstdImgGrid" style="${_sstdImages.some(img => _sstdNormImg(img).free) ? `position:relative;display:block;min-height:${Math.max(260, _sstdImages.reduce((max, img) => { const o = _sstdNormImg(img); return Math.max(max, (o.y || 0) + (o.h || 100) + 44); }, 0))}px;` : ''}">
                            ${_sstdRenderImgGrid(_sstdImages)}
                        </div>
                    </div>
                    </div>
                </td>
                <td class="sstd-split-right" style="vertical-align:top;border:1px solid #888;padding:0;height:100%;">
                    <div class="doc-sec">주요검사 Point <span style="font-weight:400;font-size:10px;color:#555;">(⋮⋮ 드래그로 순서 변경 · 확인방법·시료는 선삭제로 합치기)</span></div>
                    <div>
                    <table class="sstd-pt-table" id="sstdPtTable" style="font-size:10px;width:100%;table-layout:fixed;border-collapse:collapse;">
                        <colgroup>
                            ${_ptColWidths.map((w, i) => `<col id="sstdPtCol${i}" style="width:${_esc(w)}">`).join('')}
                        </colgroup>
                        <thead><tr>
                            ${['구분','No','항 목','기 준','확인방법','시 료','관리방안','구분/±'].map((label, ci) => `
                            <td class="doc-th" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;${ci >= 4 && ci <= 5 ? 'font-size:8px;' : ''}">
                                ${label}
                                ${ci < 7 ? `<div class="sstd-pt-col-handle" title="드래그해서 열 폭 조절"
                                    onmousedown="ShippingStandbyModule._sstdStartPtColResize(event,${ci})"
                                    style="position:absolute;top:0;bottom:0;right:0;width:7px;cursor:col-resize;z-index:5;"></div>` : ''}
                            </td>`).join('')}
                        </tr></thead>
                        <tbody id="sstdCheckBody">${ptRows}</tbody>
                    </table>
                    </div>
                </td>
            </tr>
        </table>
        <div class="sstd-split-vresize" title="드래그해서 표 높이 조절"
            onmousedown="ShippingStandbyModule._sstdStartSplitVResize(event)"
            style="height:7px;margin:-1px 0;cursor:row-resize;position:relative;z-index:4;"></div>
        <table class="sstd-bottom" id="sstdBottomTable" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col id="sstdBottomLeftCol" style="width:${_esc(_bottomLeftWidth)}"><col></colgroup>
            <tr>
                <td style="vertical-align:top;border:1px solid #888;padding:0;position:relative;">
                    <div class="sstd-split-handle" title="드래그해서 표 간격 조절"
                        onmousedown="ShippingStandbyModule._sstdStartBottomResize(event)"
                        style="position:absolute;top:0;bottom:0;right:-4px;width:8px;cursor:col-resize;z-index:5;"></div>
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;">
                        <textarea id="sstdProcedure"
                            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                            style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;">${_esc(data.procedure || '')}</textarea>
                    </div>
                </td>
                <td style="vertical-align:top;border:1px solid #888;padding:0;height:1px;">
                    ${_sstdRightStackHtml('doc-sec', `
                                    <textarea id="sstdCorrective"
                                        style="width:100%;height:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:auto;outline:none;display:block;box-sizing:border-box;">${_esc(data.corrective || '')}</textarea>
                    `, `
                    <table id="sstdRevTable" style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                        ${_sstdRevColgroupHtml(_revDateWidth, true)}
                        <tbody id="sstdRevBody">
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                            <td class="doc-th" style="white-space:nowrap;">NO</td>
                            <td class="doc-th" style="white-space:nowrap;position:relative;">개정일자
                                <div class="sstd-pt-col-handle" title="드래그해서 열 폭 조절"
                                    onmousedown="ShippingStandbyModule._sstdStartRevDateResize(event)"
                                    style="position:absolute;top:0;bottom:0;right:0;width:7px;cursor:col-resize;z-index:5;"></div>
                            </td>
                            <td class="doc-th">개정사유</td>
                            <td class="doc-th" style="white-space:nowrap;">확 인</td>
                            <td class="doc-th" style="text-align:right;">
                                <button type="button" onclick="ShippingStandbyModule._sstdAddRevRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr>
                        ${revRows}
                        </tbody>
                    </table>`)}
                </td>
            </tr>
            <tr>
                <td colspan="2" style="border:none;padding:3px 0 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:9px;color:#555;">문서번호 : <input class="doc-input" id="sstdDocNo" value="${_esc(data.docNo || '')}" placeholder="KC-OS-000" style="font-size:9px;font-weight:700;width:90px;display:inline-block;"></div>
                        <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
                    </div>
                </td>
            </tr>
        </table>
        </div>
        `, `
            <button class="btn btn-secondary" onclick="ShippingStandbyModule._sstdCloseModal()">취소</button>
            <button class="btn btn-outline" onclick="ShippingStandbyModule._sstdPrint('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">print</span> 출력</button>
            ${isEdit && _sstdCanDelete() ? `<button class="btn btn-danger" onclick="ShippingStandbyModule.deleteShippingStandard('${encodeURIComponent(key)}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ShippingStandbyModule.saveShippingStandard('${encodeURIComponent(key)}')">저장</button>
        `, 'xl');

        setTimeout(() => {
            const proc = document.getElementById('sstdProcedure');
            if (proc) { proc.style.height = 'auto'; proc.style.height = proc.scrollHeight + 'px'; }
            document.querySelectorAll('.sstd-rev-confirmer').forEach(inp => _sstdOnCfInput(inp));
            _sstdRefreshCheckLayout();
        }, 50);

        if (_sstdKbHandler) document.removeEventListener('keydown', _sstdKbHandler);
        _sstdKbHandler = function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                const tag = (document.activeElement || {}).tagName;
                const ce = (document.activeElement || {}).contentEditable;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || ce === 'true') return;
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', _sstdKbHandler);
    }

    async function _sstdLoadFromRegistered() {
        const srcKey = (document.getElementById('sstdLoadFrom') || {}).value || '';
        if (!srcKey) {
            UIUtils.toast('불러올 기준서(차종|품명)를 선택하세요.', 'warning');
            return;
        }
        const standards = await _loadShipStandards();
        const src = standards[srcKey];
        if (!src) {
            UIUtils.toast('선택한 기준서를 찾을 수 없습니다.', 'error');
            return;
        }
        const curKey = _sstdCurrentKey || '';
        if (!curKey) {
            UIUtils.toast('현재 편집 품목을 확인할 수 없습니다.', 'error');
            return;
        }
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const curProduct = products.find(p => _stdProductKey(p) === curKey) || {};
        const srcProduct = products.find(p => _stdProductKey(p) === srcKey) || {};
        const curCar = String((document.getElementById('sstdCarModel') || {}).value || curProduct.carModel || '').trim();
        const srcCar = String(srcProduct.carModel || src.carModel || '').trim();
        if (curCar && srcCar && curCar !== srcCar) {
            UIUtils.toast('동일 차종의 기준서만 불러올 수 있습니다.', 'warning');
            return;
        }
        UIUtils.toast('기존 기준서 내용을 불러왔습니다. (품목 정보는 유지)', 'success');
        await openShippingStandardEditor(encodeURIComponent(curKey), src);
    }

    function _sstdRefreshListAfterSave() {
        _sstdCaptureListFilter();
        const pageBody = document.getElementById('shipStdPageBody');
        if (pageBody) {
            renderStandardListInto(pageBody);
            return;
        }
        openShippingStandardList();
    }

    async function deleteShippingStandard(encodedKey) {
        if (!_sstdCanDelete()) {
            UIUtils.toast('기준서를 삭제할 권한이 없습니다.', 'warning');
            return;
        }
        const key = decodeURIComponent(encodedKey);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const label = _stdProductLabel(product);
        UIUtils.confirm(
            `'${label}' 출하검사 기준서를 삭제하시겠습니까? 삭제하면 미등록 상태가 됩니다.`,
            async () => {
                const standards = await _loadShipStandards();
                if (!standards[key]) {
                    UIUtils.toast('이미 삭제되었거나 등록된 기준서가 없습니다.', 'info');
                    _sstdRefreshListAfterSave();
                    return;
                }
                delete standards[key];
                await _saveShipStandards(standards);
                if (_sstdKbHandler) {
                    document.removeEventListener('keydown', _sstdKbHandler);
                    _sstdKbHandler = null;
                }
                UIUtils.closeModal();
                try { if (_sstdViewWin && !_sstdViewWin.closed) _sstdViewWin.close(); } catch (e) {}
                _sstdViewWin = null;
                UIUtils.toast('기준서가 삭제되었습니다.', 'success');
                _sstdRefreshListAfterSave();
            }
        );
    }

    async function saveShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const g = id => (document.getElementById(id) || {}).value || '';
        const partName = g('sstdPartName').trim();
        if (!partName) { UIUtils.toast('품명을 입력하세요.', 'warning'); return; }

        const checkPoints = [];
        let lastMethod = '';
        let lastSample = '';
        document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row').forEach(tr => {
            const item = (tr.querySelector('.sstd-pt-item') || {}).value || '';
            const stdEl = tr.querySelector('.sstd-pt-std');
            const standard = stdEl ? (stdEl.value !== undefined ? stdEl.value : (stdEl.innerText || stdEl.textContent || '')) : '';
            const methodInp = tr.querySelector('.sstd-pt-method');
            const sampleInp = tr.querySelector('.sstd-pt-sample');
            if (methodInp) lastMethod = methodInp.value || '';
            if (sampleInp) lastSample = sampleInp.value || '';
            const management = (tr.querySelector('.sstd-pt-mgmt') || {}).value || '';
            const group = _sstdNormGroup(tr.getAttribute('data-group'));
            const mergePrev = tr.getAttribute('data-merge-prev') === '1';
            if (item || standard) {
                checkPoints.push({
                    item, standard,
                    method: lastMethod,
                    sample: lastSample,
                    management, group, mergePrev
                });
            }
        });

        const revisions = [];
        document.querySelectorAll('#sstdRevBody tr').forEach(tr => {
            const no = (tr.querySelector('.sstd-rev-no') || {}).value || '';
            const date = (tr.querySelector('.sstd-rev-date') || {}).value || '';
            const reason = (tr.querySelector('.sstd-rev-reason') || {}).value || '';
            const confirmer = (tr.querySelector('.sstd-rev-confirmer') || {}).value || '';
            if (no || reason) revisions.push({ no, date, reason, confirmer });
        });

        // 마우스로 조절한 표 레이아웃(좌우 폭·블록 높이·주요검사Point 열 폭)도 그대로 저장 —
        // 안 그러면 편집 화면을 다시 열거나 보기/출력할 때 매번 기본값으로 되돌아가 버린다.
        const splitTable = document.getElementById('sstdSplitTable');
        const splitCol = document.getElementById('sstdSplitLeftCol');
        const splitTableWidth = splitTable ? splitTable.getBoundingClientRect().width : 0;
        const splitColWidth = splitCol ? splitCol.getBoundingClientRect().width : 0;
        const splitLeftWidth = splitTableWidth && splitColWidth
            ? (splitColWidth / splitTableWidth * 100).toFixed(3) + '%'
            : (splitCol || {}).style.width || '';
        const layout = {
            // A4 보기/출력 화면은 전체 문서를 확대/축소하므로 좌측 폭을 px가 아닌 비율로 저장한다.
            splitLeftWidth,
            splitHeight: (document.getElementById('sstdSplitTable') || {}).style.height || '',
            freeImageCanvasWidth: (document.getElementById('sstdImgGrid') || {}).clientWidth || 0,
            ptColWidths: [0, 1, 2, 3, 4, 5, 6, 7].map(i => (document.getElementById('sstdPtCol' + i) || {}).style.width || ''),
            bottomLeftWidth: (document.getElementById('sstdBottomLeftCol') || {}).style.width || '',
            revDateWidth: (document.getElementById('sstdRevDateCol') || {}).style.width || ''
        };

        const payload = {
            processNo:   g('sstdProcessNo').trim() || '100',
            processName: g('sstdProcessName').trim() || '출하검사',
            equipmentName: g('sstdEquipment').trim(),
            docNo:       g('sstdDocNo').trim(),
            revNo:       g('sstdRevNo').trim() || '00',
            createdDate: g('sstdCreatedDate'),
            revisedDate: g('sstdRevisedDate'),
            carModel:    g('sstdCarModel').trim(),
            partName,
            color:       g('sstdColor').trim(),
            itemType:    g('sstdItemType').trim(),
            author:      g('sstdAuthor').trim(),
            reviewer:    g('sstdReviewer').trim(),
            approver:    g('sstdApprover').trim(),
            authorSeal:  _sstdSealForName(g('sstdAuthor').trim(), ''),
            reviewerSeal:_sstdSealForName(g('sstdReviewer').trim(), ''),
            approverSeal:_sstdSealForName(g('sstdApprover').trim(), ''),
            images:      _sstdImages.map(_sstdNormImg),
            checkPoints,
            procedure:   g('sstdProcedure'),
            corrective:  g('sstdCorrective'),
            revisions,
            layout,
            updatedAt:   new Date().toISOString()
        };

        const doSave = async () => {
            try {
            const standards = await _loadShipStandards();
            standards[key] = payload;
            const missingSeal = [
                payload.author && !payload.authorSeal ? payload.author : '',
                payload.reviewer && !payload.reviewerSeal ? payload.reviewer : '',
                payload.approver && !payload.approverSeal ? payload.approver : ''
            ].filter(Boolean);
            await _saveShipStandards(standards);
            if (missingSeal.length) {
                UIUtils.toast(`저장됨. 날인 미등록: ${missingSeal.join(', ')} (설정>사용자에서 날인 등록)`, 'warning');
            } else {
                UIUtils.toast('출하검사 기준서가 저장되었습니다.', 'success');
            }
            _sstdCloseModal();
            _sstdRefreshListAfterSave();
            } catch (err) {
                UIUtils.toast('저장에 실패했습니다. ' + (err && err.message ? err.message : '다시 시도하세요.'), 'error');
            }
        };

        await doSave();
    }

    async function viewShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const standards = await _loadShipStandards();
        const data = _sstdNormalize(standards[key], product);

        const ptRows = _sstdViewCheckRowsHtml(data.checkPoints || []);

        // 편집 화면에서 마우스로 조절해 저장한 표 레이아웃을 보기 화면에도 그대로 적용.
        // 편집 표는 "구분/±" 열(관리용, 8번째)까지 포함해 저장되지만 보기 표엔 그 열이 없으므로
        // 앞 7개 비율만 뽑아 합이 100%가 되도록 다시 스케일한다.
        const _layout = data.layout || {};
        const _ptColWidths = _sstdScale7ColWidths(_layout.ptColWidths);
        const _splitLeftWidth = _layout.splitLeftWidth || '360px';
        const _bottomLeftWidth = _layout.bottomLeftWidth || '48%';
        const _revDateWidth = _layout.revDateWidth || _SSTD_REV_DATE_W;

        const _rawRevs = (data.revisions || []).filter(r => !!(r.no || r.reason));
        const revs = _rawRevs.length ? _rawRevs : [{ no: '00', date: data.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revs.map(r => {
            const cf = r.confirmer || '';
            return `<tr style="height:32px;">
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;white-space:nowrap;">${_esc(r.no || '')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;white-space:nowrap;">${_esc(r.date || '')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.reason || '')}</td>
            <td style="padding:${cf ? '2px' : '0'};border:1px solid #bbb;text-align:center;vertical-align:middle;${cf ? '' : 'background:' + _SSTD_DIAG}">${cf ? _sstdConfirmerViewHtml(cf) : ''}</td>
        </tr>`;}).join('');

        // 보기 화면은 편집 화면에서 저장한 좌표·카드 크기를 그대로 사용한다.
        // A4 맞춤 축소는 인쇄 화면에서만 적용한다.
        const imgs = (data.images || []).map(_sstdNormImg);
        const freeImgLayout = imgs.some(o => o.free && o.x !== null && o.y !== null);
        const freeImgHeight = Math.max(260, imgs.reduce((max, o) =>
            Math.max(max, (o.y || 0) + (o.h || 100) + 44), 0));
        const imgHtml = imgs.length ? imgs.map(function(o, i) {
            const wide = _sstdImgColSpan(o, i, imgs.length, imgs) === 2;
            const tall = _sstdImgRowSpan(o, i, imgs.length, imgs) === 2;
            const free = o.free && o.x !== null && o.y !== null;
            return `<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;${free ? `position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w || 220}px;` : ''}${free ? '' : (wide ? 'grid-column:1/-1;' : '')}${free ? '' : (tall ? 'grid-row:span 2;' : '')}">
                ${o.label ? `<div style="padding:1px 4px;background:#e8edf2;border-bottom:1px solid #ddd;font-size:10px;font-weight:700;">${_esc(o.label)}</div>` : ''}
                <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
            </div>`;
        }).join('')
            : `<div style="display:flex;align-items:center;justify-content:center;min-height:80px;color:#bbb;font-size:.8rem;">이미지 없음</div>`;

        UIUtils.showModal('출하검사 기준서 보기', `
        <style>
            .modal-container:has(#sstdViewFit){height:96vh;max-height:96vh;width:min(96vw,1600px)!important;max-width:none!important;}
            .modal-body:has(#sstdViewFit){overflow:auto!important;padding:6px 10px 2px!important;display:flex;flex-direction:column;min-height:0;}
            .modal-footer:has(+ *){ }
            .modal-container:has(#sstdViewFit) .modal-header{padding:10px 16px;}
            .modal-container:has(#sstdViewFit) .modal-footer{padding:8px 16px 12px;}
            #sstdViewFit{flex:1 1 auto;min-height:0;width:100%;overflow:visible;display:block;}
            #sstdViewDoc { width:100%; min-height:0; box-sizing:border-box; margin:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #sstdViewDoc table { border-collapse:collapse; width:100%; }
            #sstdViewDoc td, #sstdViewDoc th { border:1px solid #888; padding:2px 5px; vertical-align:middle; }
            #sstdViewDoc .dth { background:#d0e4f7; font-weight:700; text-align:center; }
            #sstdViewDoc .dlb { background:#f0f0f0; font-weight:700; text-align:center; white-space:nowrap; }
            #sstdViewDoc .dsec { background:#d0e4f7; font-weight:700; text-align:center; padding:3px; font-size:12px; border:none !important; border-bottom:1px solid #888 !important; }
            #sstdViewDoc > table + table { margin-top:-1px; }
            #sstdViewDoc td > table { border-collapse:collapse; width:100%; }
            #sstdViewDoc td > table > tbody > tr:first-child > td { border-top:none; }
            #sstdViewDoc .sstd-split-left { overflow:hidden; }
            #sstdViewDoc .sstd-corrective-stack { height:100%; }
            #sstdViewDoc .sstd-corrective-body { white-space:pre-wrap; }
        </style>
        <div id="sstdViewFit">
        <div id="sstdViewDoc">
            <table>
                <colgroup><col style="width:58px"><col style="width:260px"><col style="width:auto"><col style="width:26px"><col style="width:88px"><col style="width:88px"><col style="width:88px"></colgroup>
                <tr style="height:20px;">
                    <td class="dlb">공정NO</td><td style="text-align:center;font-weight:700;">${_esc(data.processNo || '100')}</td>
                    <td rowspan="4" style="text-align:center;font-size:20px;font-weight:900;letter-spacing:3px;">출하검사 기준서</td>
                    <td class="dth" style="border-bottom:none;"></td>
                    <td class="dth">작 성</td><td class="dth">검 토</td><td class="dth">승 인</td>
                </tr>
                <tr style="height:20px;">
                    <td class="dlb">공정명</td><td style="text-align:center;font-weight:700;">${_esc(data.processName || '출하검사')}</td>
                    <td class="dth" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;border-top:none;font-size:11px;letter-spacing:3px;">결 재</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(data.author, data.authorSeal)}</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(data.reviewer, data.reviewerSeal)}</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(data.approver, data.approverSeal)}</td>
                </tr>
                <tr style="height:20px;"><td class="dlb">차 종</td><td style="text-align:center;font-weight:700;">${_esc(data.carModel || '')}</td></tr>
                <tr style="height:20px;"><td class="dlb">품 명</td><td style="text-align:center;font-weight:700;color:#1d4ed8;min-width:260px;white-space:nowrap;">${_esc(data.partName || '')}${data.color ? ' / ' + _esc(data.color) : ''}</td></tr>
            </table>
            <table class="sstd-split" style="margin-top:0;table-layout:fixed;width:100%;">
                <colgroup><col style="width:${_esc(_splitLeftWidth)}"><col></colgroup>
                <tr>
                    <td class="sstd-split-left" style="width:${_esc(_splitLeftWidth)};vertical-align:top;padding:0;">
                        <div class="dsec">외관 / 치수포인트</div>
                        <div style="padding:6px;display:${freeImgLayout ? 'block' : 'grid'};position:relative;min-height:${freeImgLayout ? freeImgHeight + 'px' : '0'};grid-template-columns:${imgs.length > 1 ? '1fr 1fr' : '1fr'};gap:4px;">${imgHtml}</div>
                    </td>
                    <td class="sstd-split-right" style="vertical-align:top;padding:0;">
                        <div class="dsec">주요검사 Point <span style="font-weight:400;font-size:10px;">(외관 / 신뢰성)</span></div>
                        <div>
                        <table class="sstd-pt-table" style="font-size:10px;width:100%;table-layout:fixed;border-collapse:collapse;">
                            <colgroup>${_ptColWidths.map(w => `<col style="width:${_esc(w)}">`).join('')}</colgroup>
                            <thead><tr>
                                <td class="dth" style="white-space:nowrap;">구분</td>
                                <td class="dth" style="white-space:nowrap;">No</td>
                                <td class="dth" style="white-space:nowrap;">항 목</td>
                                <td class="dth" style="min-width:10em;">기 준</td>
                                <td class="dth" style="white-space:nowrap;">확인방법</td>
                                <td class="dth" style="white-space:nowrap;font-size:8px;">시 료</td>
                                <td class="dth" style="white-space:nowrap;font-size:8px;">관리방안</td>
                            </tr></thead>
                            <tbody>${ptRows}</tbody>
                        </table>
                        </div>
                    </td>
                </tr>
            </table>
            <table class="sstd-bottom" style="margin-top:0;table-layout:fixed;width:100%;">
                <colgroup><col style="width:${_esc(_bottomLeftWidth)}"><col></colgroup>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">검 사 순 서</div>
                        <div style="padding:6px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(data.procedure || '')}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;height:1px;">
                        ${_sstdRightStackHtml('dsec', _esc(data.corrective || ''), `
                        <table style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                            ${_sstdRevColgroupHtml(_revDateWidth, false)}
                            <tr style="height:24px;">
                                <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                <td class="dth" style="white-space:nowrap;">NO</td>
                                <td class="dth" style="white-space:nowrap;">개정일자</td>
                                <td class="dth">개정사유</td>
                                <td class="dth" style="white-space:nowrap;">확 인</td>
                            </tr>
                            ${revRows}
                        </table>`)}
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="border:none;padding:3px 0 0 0;">
                        <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;">
                            <span style="color:#555;">문서번호 : <strong>${_esc(data.docNo || '')}</strong></span>
                            <span>(주)케이씨케미칼&nbsp;&nbsp;A4(297×210)</span>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
        </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-outline" onclick="UIUtils.closeModal();ShippingStandbyModule._sstdPrint('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">print</span> 출력</button>
            ${_sstdCanWrite() ? `<button class="btn btn-primary" onclick="UIUtils.closeModal();ShippingStandbyModule.openShippingStandardEditor('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">edit</span> 편집</button>` : ''}
            ${_sstdCanDelete() ? `<button class="btn btn-danger" onclick="ShippingStandbyModule.deleteShippingStandard('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">delete</span> 삭제</button>` : ''}
        `, 'xl');
        _sstdBindViewFit();
    }

    function _sstdFitViewInModal() {
        const wrap = document.getElementById('sstdViewFit');
        const doc = document.getElementById('sstdViewDoc');
        if (!wrap || !doc) {
            if (_sstdViewFitHandler) {
                window.removeEventListener('resize', _sstdViewFitHandler);
                _sstdViewFitHandler = null;
            }
            return;
        }
        // 보기는 편집 캔버스와 동일한 폭으로 표시한다. 변환(scale)을 적용하면
        // 자유 배치 카드의 좌표가 편집 화면과 달라진다.
        doc.style.transform = 'none';
        doc.style.marginBottom = '0';
    }

    function _sstdBindViewFit() {
        const run = function() { _sstdFitViewInModal(); };
        if (_sstdViewFitHandler) window.removeEventListener('resize', _sstdViewFitHandler);
        _sstdViewFitHandler = run;
        window.addEventListener('resize', _sstdViewFitHandler);
        setTimeout(run, 40);
        setTimeout(run, 220);
        document.querySelectorAll('#sstdViewDoc img').forEach(function(img) {
            img.addEventListener('load', run);
        });
    }

    async function _sstdOpenViewWindow(encodedKey) {
        return _sstdOpenDocWindow(encodedKey, false);
    }

    async function _sstdPrint(encodedKey) {
        return _sstdOpenDocWindow(encodedKey, true);
    }

    async function _sstdOpenDocWindow(encodedKey, autoPrint) {
        const key = decodeURIComponent(encodedKey);
        const standards = await _loadShipStandards();
        if (!standards[key]) {
            UIUtils.toast(autoPrint ? '저장 후 출력할 수 있습니다.' : '등록된 기준서가 없습니다.', autoPrint ? 'info' : 'warning');
            return false;
        }
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const std = _sstdNormalize(standards[key], product);
        const px2mm = px => (Number(px) * 0.2646).toFixed(1);

        const ptRows = _sstdPrintCheckRowsHtml(std.checkPoints || []);

        // 편집 화면에서 마우스로 조절해 저장한 표 레이아웃을 출력에도 그대로 적용
        const _pLayout = std.layout || {};
        const _pPtColWidths = _sstdScale7ColWidths(_pLayout.ptColWidths);
        const _pSplitLeftWidth = _pLayout.splitLeftWidth || '360px';
        const _pBottomLeftWidth = _pLayout.bottomLeftWidth || '48%';
        const _pRevDateWidth = _pLayout.revDateWidth || _SSTD_REV_DATE_W;

        const pImgLayout = _sstdFitFreeImagesToDocument(
            std.images || [], _pSplitLeftWidth, _pLayout.freeImageCanvasWidth, 8
        );
        const pImgs = pImgLayout.images;
        const pFreeImgLayout = pImgLayout.isFree;
        const pFreeImgHeight = pImgLayout.height;
        const imgHtml = pImgs.map(function(o, i) {
            const wide = _sstdImgColSpan(o, i, pImgs.length, pImgs) === 2;
            const tall = _sstdImgRowSpan(o, i, pImgs.length, pImgs) === 2;
            const free = o.free && o.x !== null && o.y !== null;
            return `<div style="border:1px solid #ccc;padding:2px;${free ? `position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w || 220}px;` : ''}${free ? '' : (wide ? 'grid-column:1/-1;' : '')}${free ? '' : (tall ? 'grid-row:span 2;' : '')}">
                ${o.label ? `<div style="font-size:9px;font-weight:700;text-align:center;padding:2px 0;background:#e8edf2;">${_esc(o.label)}</div>` : ''}
                <img src="${o.src}" style="height:${px2mm(o.h)}mm;max-width:100%;"></div>`;
        }).join('');

        const _rawRevs = (std.revisions || []).filter(r => !!(r.no || r.reason));
        const revsP = _rawRevs.length ? _rawRevs : [{ no: '00', date: std.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revsP.map(r => {
            const cf = r.confirmer || '';
            const diagBg = cf ? '' : 'background:linear-gradient(to top right,transparent calc(50% - 0.5px),#999 calc(50% - 0.5px),#999 calc(50% + 0.5px),transparent calc(50% + 0.5px));';
            return `<tr style="height:30px;"><td style="text-align:center;white-space:nowrap;">${_esc(r.no || '')}</td>
            <td style="text-align:center;white-space:nowrap;overflow:visible;">${_esc(r.date || '')}</td><td style="text-align:center;">${_esc(r.reason || '')}</td>
            <td style="padding:${cf ? '2px' : '0'};text-align:center;vertical-align:middle;${diagBg}">${cf ? _sstdConfirmerViewHtml(cf) : ''}</td></tr>`;}).join('');

        const feat = autoPrint
            ? 'width=960,height=720,scrollbars=yes,resizable=yes'
            : 'width=1280,height=900,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
        const winName = autoPrint ? '_blank' : ('sstdView_' + String(key).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 48));
        const win = window.open('', winName, feat);
        if (!win) {
            UIUtils.toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'warning');
            return false;
        }
        const jsKey = JSON.stringify(encodeURIComponent(key));
        const canW = _sstdCanWrite();
        const canD = _sstdCanDelete();
        const viewCss = autoPrint ? '' : `
            html,body{width:auto !important;height:100%;overflow:hidden;background:#dbe4ee;}
            #sstdViewBar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;background:#1e3a5f;color:#fff;font-family:'Malgun Gothic','맑은 고딕',sans-serif;}
            #sstdViewBar button{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:#fff;color:#1e3a5f;cursor:pointer;font-weight:700;}
            #sstdViewBar button.danger{background:#dc2626;color:#fff;border-color:#dc2626;}
            #sstdFit{height:calc(100vh - 48px);overflow:hidden;display:flex;justify-content:center;align-items:flex-start;}
            #sstdPage{width:281mm;min-height:194mm;background:#fff;padding:0;box-sizing:border-box;transform-origin:top center;box-shadow:0 4px 18px rgba(0,0,0,.18);}
            @media print{
                html,body{background:#fff;overflow:visible;width:281mm !important;height:auto;}
                #sstdViewBar{display:none !important;}
                #sstdFit{display:block;height:auto;overflow:visible;}
                #sstdPage{transform:none !important;box-shadow:none;padding:0;}
            }`;
        const bar = autoPrint ? '' : `
        <div id="sstdViewBar">
            <strong style="font-size:13px;">출하검사 기준서 보기</strong>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" onclick="window.print()">출력</button>
                ${canW ? `<button type="button" onclick="try{var o=window.opener;if(o&&o.ShippingStandbyModule)o.ShippingStandbyModule.openShippingStandardEditor(${jsKey});}catch(e){}window.close();">편집</button>` : ''}
                ${canD ? `<button type="button" class="danger" onclick="try{var o=window.opener;if(o&&o.ShippingStandbyModule)o.ShippingStandbyModule.deleteShippingStandard(${jsKey});}catch(e){}">삭제</button>` : ''}
                <button type="button" onclick="window.close()">닫기</button>
            </div>
        </div>
        <div id="sstdFit"><div id="sstdPage">`;
        const _endScript = '</' + 'script>';
        const barEnd = autoPrint
            ? `<script>window.onload=function(){window.print();}` + _endScript
            : `</div></div><script>
                function fitSstd(){
                    var page=document.getElementById('sstdPage');
                    var fit=document.getElementById('sstdFit');
                    if(!page||!fit)return;
                    page.style.transform='none';
                    var availW=Math.max(120, fit.clientWidth-8);
                    var availH=Math.max(120, fit.clientHeight-8);
                    var w=page.scrollWidth||page.offsetWidth;
                    var h=page.scrollHeight||page.offsetHeight;
                    var s=Math.min(availW/w, availH/h);
                    if(!isFinite(s)||s<=0)s=1;
                    page.style.transform='scale('+s+')';
                }
                window.onload=fitSstd;
                window.onresize=fitSstd;
            ` + _endScript;

        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <title>출하검사 기준서 — ${_esc(std.partName || '')}</title>
        <style>
            @page{size:A4 landscape;margin:8mm;}
            *{box-sizing:border-box;margin:0;padding:0;}
            html,body{width:281mm;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10px;color:#111;}
            table{border-collapse:collapse;width:100%;table-layout:fixed;}
            th,td{border:1px solid #555;padding:3px 5px;vertical-align:middle;overflow:hidden;}
            .doc-th{background:#d0e4f7;font-weight:700;text-align:center;}
            .doc-sec{background:#d0e4f7;font-weight:700;text-align:center;font-size:11px;padding:4px;border:none;border-bottom:1px solid #555;}
            .doc-label{background:#f0f0f0;font-weight:700;text-align:center;white-space:nowrap;}
            img{display:block;width:100%;object-fit:contain;background:#fff;}
            body > table + table{margin-top:-1px;}
            td > table{border-collapse:collapse;width:100%;}
            td > table > tbody > tr:first-child > td{border-top:none;}
            .sstd-split-left{overflow:hidden;}
            .sstd-corrective-stack{height:100%;}
            .sstd-corrective-body{white-space:pre-wrap;}
            @media print{html,body{width:281mm;}#sstdPage{min-height:194mm;}}
            ${viewCss}
        </style></head><body>${bar}
        <table>
            <colgroup><col style="width:56px"><col style="width:256px"><col style="width:auto"><col style="width:24px"><col style="width:88px"><col style="width:88px"><col style="width:88px"></colgroup>
            <tr style="height:20px;">
                <td class="doc-label">공정NO</td><td style="text-align:center;font-weight:700;font-size:12px;">${_esc(std.processNo || '100')}</td>
                <td rowspan="4" style="font-size:20px;font-weight:900;text-align:center;letter-spacing:3px;">출하검사 기준서</td>
                <td class="doc-th" style="border-bottom:none;"></td>
                <td class="doc-th">작 성</td><td class="doc-th">검 토</td><td class="doc-th">승 인</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">공정명</td><td style="text-align:center;font-weight:700;">${_esc(std.processName || '출하검사')}</td>
                <td class="doc-th" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:4px 2px;font-size:11px;letter-spacing:3px;border-top:none;">결 재</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(std.author, std.authorSeal)}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(std.reviewer, std.reviewerSeal)}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_sstdSignCellViewHtml(std.approver, std.approverSeal)}</td>
            </tr>
            <tr style="height:20px;"><td class="doc-label">차 종</td><td style="text-align:center;font-weight:700;">${_esc(std.carModel || '')}</td></tr>
            <tr style="height:20px;"><td class="doc-label">품 명</td><td style="text-align:center;font-weight:700;color:#1d4ed8;white-space:nowrap;">${_esc(std.partName || '')}${std.color ? ' / ' + _esc(std.color) : ''}</td></tr>
        </table>
        <table class="sstd-split" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col style="width:${_esc(_pSplitLeftWidth)}"><col></colgroup>
            <tr>
                <td class="sstd-split-left" style="width:${_esc(_pSplitLeftWidth)};vertical-align:top;padding:0;">
                    <div class="doc-sec">외관 / 치수포인트</div>
                    <div style="padding:4px;display:${pFreeImgLayout ? 'block' : 'grid'};position:relative;min-height:${pFreeImgLayout ? pFreeImgHeight + 'px' : '0'};grid-template-columns:${(std.images || []).length > 1 ? '1fr 1fr' : '1fr'};gap:4px;align-items:start;">${imgHtml || '<div style="text-align:center;padding:20px;color:#aaa;">이미지 없음</div>'}</div>
                </td>
                <td class="sstd-split-right" style="vertical-align:top;padding:0;">
                    <div class="doc-sec">주요검사 Point (외관 / 신뢰성)</div>
                    <table class="sstd-pt-table" style="font-size:10px;width:100%;table-layout:fixed;">
                        <colgroup>${_pPtColWidths.map(w => `<col style="width:${_esc(w)}">`).join('')}</colgroup>
                        <thead><tr>
                            <th class="doc-th" style="white-space:nowrap;">구분</th>
                            <th class="doc-th" style="white-space:nowrap;">No</th>
                            <th class="doc-th" style="white-space:nowrap;">항 목</th>
                            <th class="doc-th" style="min-width:10em;">기 준</th>
                            <th class="doc-th" style="white-space:nowrap;">확인방법</th>
                            <th class="doc-th" style="white-space:nowrap;font-size:8px;">시 료</th>
                            <th class="doc-th" style="white-space:nowrap;font-size:8px;">관리방안</th>
                        </tr></thead>
                        <tbody>${ptRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>
        <table class="sstd-bottom" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col style="width:${_esc(_pBottomLeftWidth)}"><col></colgroup>
            <tr>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.procedure || '')}</div>
                </td>
                <td style="vertical-align:top;padding:0;height:1px;">
                    ${_sstdRightStackHtml('doc-sec', _esc(std.corrective || ''), `
                    <table style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                        ${_sstdRevColgroupHtml(_pRevDateWidth, false)}
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;">개정내용</td>
                            <th class="doc-th" style="white-space:nowrap;">NO</th>
                            <th class="doc-th" style="white-space:nowrap;">개정일자</th>
                            <th class="doc-th">개정사유</th>
                            <th class="doc-th" style="white-space:nowrap;">확 인</th>
                        </tr>
                        ${revRows}
                    </table>`)}
                </td>
            </tr>
            <tr>
                <td colspan="2" style="border:none;padding:3px 0 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:9px;color:#555;">문서번호 : <strong>${_esc(std.docNo || '')}</strong></div>
                        <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
                    </div>
                </td>
            </tr>
        </table>
        ${barEnd}
        </body></html>`);
        win.document.close();
        try { win.focus(); } catch (e) {}
        if (!autoPrint) _sstdViewWin = win;
        return true;
    }

    /* ── 이미지 핸들러 ── */
    function _sstdAddImages(input) {
        Array.from(input.files).forEach(file => {
            const r = new FileReader();
            r.onload = e => {
                _sstdImages = _sstdImages.map(_sstdNormImg);
                _sstdImages.push({ src: e.target.result, h: 100, label: '' });
                const g = document.getElementById('sstdImgGrid');
                if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
            };
            r.readAsDataURL(file);
        });
        input.value = '';
    }
    function _sstdOnPaste(e) {
        e.preventDefault();
        const items = ((e.clipboardData || {}).items) || [];
        Array.from(items).forEach(item => {
            if (!item.type.startsWith('image/')) return;
            const file = item.getAsFile();
            if (!file) return;
            const r = new FileReader();
            r.onload = ev => {
                _sstdImages = _sstdImages.map(_sstdNormImg);
                _sstdImages.push({ src: ev.target.result, h: 100, label: '' });
                const g = document.getElementById('sstdImgGrid');
                if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
            };
            r.readAsDataURL(file);
        });
    }
    function _sstdRemoveImage(idx) {
        _sstdImages = _sstdImages.map(_sstdNormImg);
        _sstdImages.splice(idx, 1);
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
    }
    function _sstdUpdateImgLabel(idx, label) {
        _sstdImages = _sstdImages.map(_sstdNormImg);
        if (_sstdImages[idx]) _sstdImages[idx].label = label;
    }
    function _sstdToggleImgSpan(idx) {
        _sstdImages = _sstdImages.map(_sstdNormImg);
        const o = _sstdImages[idx];
        if (!o) return;
        const cur = _sstdImgColSpan(o, idx, _sstdImages.length, _sstdImages);
        o.span = cur === 2 ? 1 : 2;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
    }
    function _sstdToggleImgRowSpan(idx) {
        _sstdImages = _sstdImages.map(_sstdNormImg);
        const o = _sstdImages[idx];
        if (!o) return;
        o.rowSpan = o.rowSpan === 2 ? 1 : 2;
        // 세로 2칸을 켜면 자동 넓힘(홀수 마지막)이 풀리므로, 넓힘 상태를 명시값으로 고정해 둔 사진만 유지된다
        if (o.rowSpan === 2 && o.span === 2) o.span = 1;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
    }
    function _sstdMoveImage(idx, dir) {
        _sstdImages = _sstdImages.map(_sstdNormImg);
        const from = Number(idx);
        const to = from + Number(dir);
        if (from < 0 || to < 0 || from >= _sstdImages.length || to >= _sstdImages.length) return;
        const imgs = _sstdImages.slice();
        const moved = imgs.splice(from, 1)[0];
        imgs.splice(to, 0, moved);
        _sstdImages = imgs;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
    }

    function _sstdEnableFreeLayout() {
        const grid = document.getElementById('sstdImgGrid');
        if (!grid || !_sstdImages.length) {
            UIUtils.toast('먼저 이미지를 등록하세요.', 'info');
            return;
        }
        const gridRect = grid.getBoundingClientRect();
        const cards = Array.from(grid.querySelectorAll('.sstd-img-card'));
        _sstdImages = _sstdImages.map(_sstdNormImg);
        const placements = cards.map((card, index) => {
            const o = _sstdImages[index];
            const rect = card.getBoundingClientRect();
            if (!o) return null;
            o.free = true;
            o.x = Math.max(0, Math.round(rect.left - gridRect.left));
            o.y = Math.max(0, Math.round(rect.top - gridRect.top));
            o.w = Math.max(120, Math.round(rect.width));
            return { card, index, x: o.x, y: o.y, w: o.w };
        });
        const height = Math.max(260, Math.round(gridRect.height), _sstdImages.reduce((max, img) =>
            Math.max(max, (img.y || 0) + (img.h || 100) + 44), 0));
        grid.style.position = 'relative';
        grid.style.display = 'block';
        grid.style.minHeight = height + 'px';
        // 기존 DOM을 다시 만들지 않고, 화면에 보이던 정확한 좌표와 폭을 유지한 채
        // 절대 배치로 전환한다. 재렌더링하면 grid → block 전환 시 카드 폭이 달라진다.
        placements.filter(Boolean).forEach(({ card, index, x, y, w }) => {
            card.setAttribute('draggable', 'false');
            card.style.position = 'absolute';
            card.style.left = x + 'px';
            card.style.top = y + 'px';
            card.style.width = w + 'px';
            card.style.maxWidth = 'none';
            card.style.gridColumn = '';
            card.style.gridRow = '';
            card.onmousedown = function (event) { _sstdStartFreeDrag(event, index); };
        });
        UIUtils.toast('자유 배치 모드입니다. 블록을 원하는 위치로 끌어 놓으세요.', 'info');
    }

    function _sstdStartFreeDrag(e, idx) {
        if (!_sstdImages[idx] || !_sstdImages[idx].free) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.sstd-img-hdl'))) return;
        e.preventDefault();
        e.stopPropagation();
        const grid = document.getElementById('sstdImgGrid');
        const card = e.currentTarget;
        if (!grid || !card) return;
        const gridRect = grid.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = Number(_sstdImages[idx].x) || 0;
        const startTop = Number(_sstdImages[idx].y) || 0;
        const prevUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        card.style.zIndex = '20';
        card.style.boxShadow = '0 4px 14px rgba(37,99,235,.25)';
        function onMove(ev) {
            const maxX = Math.max(0, grid.clientWidth - card.offsetWidth);
            const maxY = Math.max(0, grid.clientHeight - card.offsetHeight);
            const x = Math.max(0, Math.min(maxX, startLeft + ev.clientX - startX));
            const y = Math.max(0, Math.min(maxY, startTop + ev.clientY - startY));
            _sstdImages[idx].x = Math.round(x);
            _sstdImages[idx].y = Math.round(y);
            card.style.left = _sstdImages[idx].x + 'px';
            card.style.top = _sstdImages[idx].y + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = prevUserSelect || '';
            card.style.zIndex = '';
            card.style.boxShadow = '';
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function _sstdApplyImageLayout(mode) {
        if (mode !== 'left-tall') return;
        const imgs = _sstdImages.map(_sstdNormImg);
        if (imgs.length < 2) {
            UIUtils.toast('이미지를 2개 이상 등록한 뒤 배치하세요.', 'info');
            return;
        }
        const labelOf = img => String(img.label || '').toLowerCase();
        const findBy = re => imgs.find(img => re.test(labelOf(img)));
        const dimension = findBy(/치수|dimension|라벨|외관/) || imgs[0];
        const gloss = findBy(/광택|gloss/) && findBy(/광택|gloss/) !== dimension
            ? findBy(/광택|gloss/) : null;
        const color = findBy(/색차|color|colour/) && findBy(/색차|color|colour/) !== dimension
            ? findBy(/색차|color|colour/) : null;
        const rest = imgs.filter(img => img !== dimension && img !== gloss && img !== color);
        const ordered = [dimension, gloss, color, ...rest].filter(Boolean);
        ordered.forEach((img, index) => {
            img.span = 1;
            img.rowSpan = index === 0 ? 2 : 1;
            img.free = false;
            img.x = null;
            img.y = null;
            img.w = null;
        });
        _sstdImages = ordered;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
        UIUtils.toast('왼쪽 큰 블록 + 오른쪽 2단 배치로 정렬했습니다. 저장하면 위치가 유지됩니다.', 'success');
    }
    function _sstdDragStart(e, idx) {
        if (_sstdResizeOn) { e.preventDefault(); return; }
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) {
            e.preventDefault();
            return;
        }
        _sstdDragIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch (err) {}
        const card = (e.currentTarget && e.currentTarget.closest) ? e.currentTarget.closest('.sstd-img-card') : e.currentTarget;
        if (card) card.style.opacity = '0.5';
    }
    function _sstdDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const card = e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('sstd-img-card')
            ? e.currentTarget
            : (e.target.closest ? e.target.closest('.sstd-img-card') : null);
        document.querySelectorAll('.sstd-img-card').forEach(function(el) {
            el.style.outline = '';
        });
        if (card) card.style.outline = '2px solid #2563eb';
    }
    function _sstdDragEnd(e) {
        document.querySelectorAll('.sstd-img-card').forEach(function(el) {
            el.style.opacity = '';
            el.style.outline = '';
        });
        _sstdDragIdx = -1;
    }
    function _sstdDragDrop(e, toIdx) {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.sstd-img-card').forEach(function(el) { el.style.outline = ''; });
        if (_sstdDragIdx < 0 || _sstdDragIdx === toIdx) return;
        const imgs = _sstdImages.map(_sstdNormImg);
        if (toIdx < 0 || toIdx >= imgs.length) return;
        const target = e.currentTarget && e.currentTarget.getBoundingClientRect
            ? e.currentTarget.getBoundingClientRect() : null;
        const dropAfter = target ? e.clientY >= target.top + target.height / 2 : false;
        const moved = imgs.splice(_sstdDragIdx, 1)[0];
        let insertAt = toIdx + (dropAfter ? 1 : 0);
        if (_sstdDragIdx < insertAt) insertAt -= 1;
        insertAt = Math.max(0, Math.min(imgs.length, insertAt));
        imgs.splice(insertAt, 0, moved);
        _sstdImages = imgs;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
        _sstdDragIdx = -1;
    }
    function _sstdGrowSplitToGrid() {
        const table = document.getElementById('sstdSplitTable');
        const grid = document.getElementById('sstdImgGrid');
        if (!table || !grid) return;
        const pane = grid.closest('.sstd-img-pane');
        const header = pane && pane.querySelector('.doc-sec');
        const need = (header ? header.offsetHeight : 28) + grid.offsetHeight + 16;
        const cur = table.getBoundingClientRect().height;
        if (need > cur) table.style.height = Math.min(1400, need) + 'px';
    }
    function _sstdStartResize(e, idx, dir) {
        e.preventDefault();
        e.stopPropagation();
        _sstdResizeOn = true;
        _sstdImages = _sstdImages.map(_sstdNormImg);
        if (!_sstdImages[idx]) { _sstdResizeOn = false; return; }
        const startY = e.clientY;
        const startX = e.clientX;
        const startH = Number(_sstdImages[idx].h) || 100;
        const card = document.querySelector('#sstdImgGrid .sstd-img-card[data-idx="' + idx + '"]');
        const wrap = card ? card.querySelector('.sstd-img-wrap') : null;
        const startW = card ? card.getBoundingClientRect().width : 220;
        const prevSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        function onMove(ev) {
            ev.preventDefault();
            const dy = dir.indexOf('s') >= 0 ? ev.clientY - startY : startY - ev.clientY;
            const newH = Math.max(50, Math.min(720, startH + dy));
            _sstdImages[idx].h = newH;
            if (wrap) wrap.style.height = newH + 'px';
            if (dir.indexOf('e') >= 0 || dir.indexOf('w') >= 0) {
                const dx = dir.indexOf('e') >= 0 ? ev.clientX - startX : startX - ev.clientX;
                const newW = Math.max(120, Math.min(900, startW + dx));
                _sstdImages[idx].w = newW;
                if (card) {
                    card.style.width = newW + 'px';
                    card.style.maxWidth = '100%';
                }
            }
            _sstdGrowSplitToGrid();
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = prevSelect || '';
            _sstdResizeOn = false;
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // 외관/치수포인트(좌) ↔ 주요검사 Point(우) 표 사이 간격을 마우스 드래그로 조절
    function _sstdStartSplitResize(e) {
        e.preventDefault();
        const col = document.getElementById('sstdSplitLeftCol');
        const td = document.querySelector('#sstdDoc .sstd-split-left');
        const table = document.getElementById('sstdSplitTable');
        if (!col || !table) return;
        const startX = e.clientX;
        const tableWidth = table.getBoundingClientRect().width || 1;
        let startW = parseFloat(col.style.width) || 360;
        if (String(col.style.width).indexOf('%') >= 0) startW = (startW / 100) * tableWidth;
        function onMove(ev) {
            const dx = ev.clientX - startX;
            const newW = Math.max(200, Math.min(760, startW + dx));
            const pct = (newW / tableWidth) * 100;
            col.style.width = pct + '%';
            if (td) td.style.width = pct + '%';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // 외관/치수포인트·주요검사 Point 표 블록 전체의 높이를 아래로 드래그해 조절
    function _sstdStartSplitVResize(e) {
        e.preventDefault();
        const table = document.getElementById('sstdSplitTable');
        if (!table) return;
        const startY = e.clientY;
        const startH = table.getBoundingClientRect().height;
        function onMove(ev) {
            const dy = ev.clientY - startY;
            const newH = Math.max(120, Math.min(1200, startH + dy));
            // <table>에는 min-height가 안 먹는다(브라우저가 무시). table의 height는 "최소 높이"로
            // 동작해 내용이 더 크면 알아서 늘어나므로 height를 쓰는 게 맞다.
            table.style.height = newH + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // 검사순서 ↔ 조치사항/개정이력 표 사이 경계를 마우스로 조절
    function _sstdStartBottomResize(e) {
        e.preventDefault();
        const col = document.getElementById('sstdBottomLeftCol');
        const table = document.getElementById('sstdBottomTable');
        if (!col || !table) return;
        const startX = e.clientX;
        const tableWidth = table.getBoundingClientRect().width || 1;
        let startW = parseFloat(col.style.width) || 48;
        if (String(col.style.width).indexOf('%') >= 0) startW = (startW / 100) * tableWidth;
        function onMove(ev) {
            const dx = ev.clientX - startX;
            const newW = Math.max(80, Math.min(tableWidth - 80, startW + dx));
            col.style.width = newW + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // 주요검사 Point 표(구분/No/항목/기준/확인방법/시료/관리방안/구분±) 열 경계를 마우스로 조절.
    // 이 열(colIndex)만 늘리면 표 전체 폭이 넓어져 가로 스크롤이 생긴다 — 옆 열(colIndex+1)에서
    // 같은 만큼 빼와서 표 전체 폭(=100%)은 그대로 유지한다(엑셀 열 크기 조절과 같은 방식).
    function _sstdStartPtColResize(e, colIndex) {
        e.preventDefault();
        const col = document.getElementById('sstdPtCol' + colIndex);
        const nextCol = document.getElementById('sstdPtCol' + (colIndex + 1));
        const table = document.getElementById('sstdPtTable');
        if (!col || !nextCol || !table) return;
        const tableWidth = table.getBoundingClientRect().width || 1;
        const startX = e.clientX;
        const startColPct = parseFloat(col.style.width) || 10;
        const startNextPct = parseFloat(nextCol.style.width) || 10;
        const minPct = 3;
        function onMove(ev) {
            let dPct = ((ev.clientX - startX) / tableWidth) * 100;
            dPct = Math.max(minPct - startColPct, Math.min(startNextPct - minPct, dPct));
            col.style.width = (startColPct + dPct) + '%';
            nextCol.style.width = (startNextPct - dPct) + '%';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // 개정내용 표의 개정일자 열 폭을 마우스로 조절 (개정사유 열이 나머지를 차지)
    function _sstdStartRevDateResize(e) {
        e.preventDefault();
        e.stopPropagation();
        const col = document.getElementById('sstdRevDateCol');
        if (!col) return;
        const startX = e.clientX;
        const startW = parseInt(col.style.width, 10) || parseInt(_SSTD_REV_DATE_W, 10) || 88;
        function onMove(ev) {
            const dx = ev.clientX - startX;
            const newW = Math.max(72, Math.min(180, startW + dx));
            col.style.width = newW + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /* ── 검사 Point / 개정 행 ── */
    function _sstdReadCheckPointsFromDom(keepEmpty) {
        const rows = Array.from(document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row'));
        let lastMethod = '';
        let lastSample = '';
        const pts = [];
        rows.forEach(tr => {
            const item = (tr.querySelector('.sstd-pt-item') || {}).value || '';
            const stdEl = tr.querySelector('.sstd-pt-std');
            const standard = stdEl ? (stdEl.value !== undefined ? stdEl.value : (stdEl.innerText || stdEl.textContent || '')) : '';
            const methodInp = tr.querySelector('.sstd-pt-method');
            const sampleInp = tr.querySelector('.sstd-pt-sample');
            if (methodInp) lastMethod = methodInp.value || '';
            if (sampleInp) lastSample = sampleInp.value || '';
            const management = (tr.querySelector('.sstd-pt-mgmt') || {}).value || '';
            const group = _sstdRowGroup(tr);
            const mergePrev = tr.getAttribute('data-merge-prev') === '1';
            if (keepEmpty || item || standard) {
                pts.push({
                    item, standard,
                    method: lastMethod,
                    sample: lastSample,
                    management, group, mergePrev
                });
            }
        });
        return pts;
    }

    function _sstdWriteCheckBody(pts) {
        const tb = document.getElementById('sstdCheckBody');
        if (!tb) return;
        tb.innerHTML = _sstdBuildCheckBodyHtml(_sstdResolveMergePrev(pts || []));
        _sstdRefreshCheckLayout();
    }

    function _sstdToggleMergePrev(btn) {
        const tr = btn && btn.closest ? btn.closest('tr.sstd-pt-row') : null;
        if (!tr) return;
        const rows = Array.from(document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row'));
        const idx = rows.indexOf(tr);
        const pts = _sstdReadCheckPointsFromDom(true);
        if (idx <= 0 || idx >= pts.length) return;
        if (_sstdNormGroup(pts[idx].group) !== _sstdNormGroup(pts[idx - 1].group)) {
            UIUtils.toast('같은 구분(외관/신뢰성)끼리만 확인방법·시료를 합칠 수 있습니다.', 'info');
            return;
        }
        pts[idx].mergePrev = !pts[idx].mergePrev;
        _sstdWriteCheckBody(pts);
    }

    function _sstdRemoveCheckRow(btn) {
        const tr = btn && btn.closest ? btn.closest('tr.sstd-pt-row') : null;
        if (!tr) return;
        const rows = Array.from(document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row'));
        const idx = rows.indexOf(tr);
        const pts = _sstdReadCheckPointsFromDom(true);
        if (idx < 0) return;
        pts.splice(idx, 1);
        if (pts[idx]) pts[idx].mergePrev = idx > 0 && _sstdNormGroup(pts[idx].group) === _sstdNormGroup(pts[idx - 1].group)
            ? pts[idx].mergePrev
            : false;
        if (!pts.length) pts.push({ group: 'appearance', mergePrev: false });
        _sstdWriteCheckBody(pts);
    }

    function _sstdRenumberCheckRows() {
        let n = 0;
        document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row .sstd-pt-no-num').forEach(el => {
            n += 1;
            el.textContent = String(n);
        });
    }

    function _sstdRowGroup(tr) {
        return _sstdNormGroup(tr && tr.getAttribute('data-group'));
    }

    function _sstdApplyGroupRowspans() {
        const tb = document.getElementById('sstdCheckBody');
        if (!tb) return;
        tb.querySelectorAll('.sstd-pt-group').forEach(el => el.remove());
        const rows = Array.from(tb.querySelectorAll('tr.sstd-pt-row'));
        let i = 0;
        while (i < rows.length) {
            const group = _sstdRowGroup(rows[i]);
            let j = i + 1;
            while (j < rows.length && _sstdRowGroup(rows[j]) === group) j += 1;
            const span = j - i;
            const meta = group === 'reliability'
                ? { label: '신뢰성', tone: '#fde8d0' }
                : group === 'hidden'
                    ? { label: '숨김', tone: '#e5e7eb' }
                    : { label: '외관', tone: '#d0e4f7' };
            const td = document.createElement('td');
            td.className = 'sstd-pt-group';
            td.rowSpan = span;
            td.style.cssText = 'width:auto;max-width:1.4em;background:' + meta.tone + ';font-weight:700;text-align:center;vertical-align:middle;border:1px solid #888;padding:4px 1px;writing-mode:vertical-rl;letter-spacing:2px;font-size:11px;white-space:nowrap;';
            td.innerHTML = meta.label
                + '<button type="button" onclick="ShippingStandbyModule._sstdAddCheckRow(\'' + group + '\')" '
                + 'style="display:block;margin:6px auto 0;background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;writing-mode:horizontal-tb;letter-spacing:0;" '
                + 'title="' + meta.label + ' 행 추가">+</button>';
            rows[i].insertBefore(td, rows[i].firstChild);
            i = j;
        }
    }

    function _sstdRefreshCheckLayout() {
        _sstdApplyGroupRowspans();
        _sstdRenumberCheckRows();
        _sstdBindCheckRowDrag();
    }

    function _sstdEnsurePtDragStyle() {
        if (document.getElementById('sstd-pt-drag-style')) return;
        const st = document.createElement('style');
        st.id = 'sstd-pt-drag-style';
        st.textContent = [
            '.sstd-pt-drag{cursor:grab;color:#94a3b8;}',
            '.sstd-pt-drag:active{cursor:grabbing;}',
            'tr.sstd-pt-row.sstd-pt-drop-before td{box-shadow:inset 0 2px 0 #2563eb;}',
            'tr.sstd-pt-row.sstd-pt-drop-after td{box-shadow:inset 0 -2px 0 #2563eb;}'
        ].join('');
        document.head.appendChild(st);
    }

    function _sstdClearPtDropMarks(tb) {
        if (!tb) return;
        tb.querySelectorAll('tr.sstd-pt-row').forEach(function(r) {
            r.classList.remove('sstd-pt-drop-before', 'sstd-pt-drop-after');
        });
    }

    function _sstdReorderCheckRow(fromIdx, destIdx, group) {
        const pts = _sstdReadCheckPointsFromDom(true);
        if (fromIdx < 0 || fromIdx >= pts.length) return;
        if (destIdx < 0) destIdx = 0;
        if (destIdx > pts.length) destIdx = pts.length;
        const moved = pts.splice(fromIdx, 1)[0];
        if (!moved) return;
        if (group) moved.group = _sstdNormGroup(group);
        let insertAt = destIdx;
        if (fromIdx < destIdx) insertAt -= 1;
        if (insertAt < 0) insertAt = 0;
        if (insertAt > pts.length) insertAt = pts.length;
        pts.splice(insertAt, 0, moved);
        pts.forEach(function(p, i) {
            if (i === 0) {
                p.mergePrev = false;
                return;
            }
            if (_sstdNormGroup(p.group) !== _sstdNormGroup(pts[i - 1].group)) p.mergePrev = false;
        });
        _sstdWriteCheckBody(pts);
    }

    function _sstdBindCheckRowDrag() {
        const tb = document.getElementById('sstdCheckBody');
        if (!tb) return;
        _sstdEnsurePtDragStyle();

        tb.querySelectorAll('tr.sstd-pt-row .sstd-pt-drag').forEach(function(handle) {
            if (handle.dataset.bound === '1') return;
            handle.dataset.bound = '1';
            handle.setAttribute('draggable', 'true');
            handle.addEventListener('dragstart', function(e) {
                const tr = handle.closest('tr.sstd-pt-row');
                const rows = Array.from(tb.querySelectorAll('tr.sstd-pt-row'));
                _sstdPtRowDragFrom = rows.indexOf(tr);
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(_sstdPtRowDragFrom)); } catch (err) {}
                if (tr) {
                    tr.style.opacity = '0.4';
                    tr.classList.add('sstd-pt-dragging');
                }
            });
            handle.addEventListener('dragend', function() {
                _sstdClearPtDropMarks(tb);
                tb.querySelectorAll('tr.sstd-pt-row').forEach(function(r) {
                    r.classList.remove('sstd-pt-dragging');
                    r.style.opacity = r.getAttribute('data-group') === 'hidden' ? '0.55' : '';
                });
                _sstdPtRowDragFrom = -1;
            });
        });

        if (tb.dataset.ptDragTbody === '1') return;
        tb.dataset.ptDragTbody = '1';
        tb.addEventListener('dragover', function(e) {
            if (_sstdPtRowDragFrom < 0) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const over = e.target.closest ? e.target.closest('tr.sstd-pt-row') : null;
            _sstdClearPtDropMarks(tb);
            if (!over) return;
            const rect = over.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            over.classList.add(after ? 'sstd-pt-drop-after' : 'sstd-pt-drop-before');
        });
        tb.addEventListener('drop', function(e) {
            if (_sstdPtRowDragFrom < 0) return;
            e.preventDefault();
            e.stopPropagation();
            const rows = Array.from(tb.querySelectorAll('tr.sstd-pt-row'));
            const fromIdx = _sstdPtRowDragFrom;
            const over = e.target.closest ? e.target.closest('tr.sstd-pt-row') : null;
            let destIdx = rows.length;
            let group = '';
            if (over && rows.indexOf(over) >= 0) {
                const rect = over.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                destIdx = rows.indexOf(over) + (after ? 1 : 0);
                group = _sstdRowGroup(over);
            } else if (rows.length) {
                group = _sstdRowGroup(rows[rows.length - 1]);
            }
            _sstdClearPtDropMarks(tb);
            _sstdReorderCheckRow(fromIdx, destIdx, group);
            _sstdPtRowDragFrom = -1;
        });
    }

    function _sstdFindSectionInsertPoint(group) {
        group = _sstdNormGroup(group);
        const tb = document.getElementById('sstdCheckBody');
        if (!tb) return null;
        const rows = Array.from(tb.querySelectorAll('tr.sstd-pt-row'));
        const ofGroup = rows.filter(tr => _sstdRowGroup(tr) === group);
        if (ofGroup.length) return { parent: tb, after: ofGroup[ofGroup.length - 1] };

        // 그룹이 비어 있으면: 외관 → 맨 앞, 신뢰성 → 외관 뒤(숨김 앞), 숨김 → 맨 뒤
        if (group === 'appearance') return { parent: tb, after: null, before: rows[0] || null };
        if (group === 'reliability') {
            const app = rows.filter(tr => _sstdRowGroup(tr) === 'appearance');
            if (app.length) return { parent: tb, after: app[app.length - 1] };
            const hid = rows.find(tr => _sstdRowGroup(tr) === 'hidden');
            if (hid) return { parent: tb, after: null, before: hid };
            return { parent: tb, after: rows[rows.length - 1] || null };
        }
        return { parent: tb, after: rows[rows.length - 1] || null };
    }

    function _sstdMoveRowToGroup(tr, group) {
        group = _sstdNormGroup(group);
        if (!tr || !tr.parentNode) return;
        tr.setAttribute('data-group', group);
        tr.style.opacity = group === 'hidden' ? '0.55' : '';
        const sel = tr.querySelector('.sstd-pt-group-sel');
        if (sel) sel.value = group;
        const tb = tr.parentNode;
        // 임시로 빼 둔 뒤 목표 섹션 끝에 삽입
        tb.removeChild(tr);
        const spot = _sstdFindSectionInsertPoint(group);
        if (spot && spot.before) {
            spot.parent.insertBefore(tr, spot.before);
        } else if (spot && spot.after && spot.after.nextSibling) {
            spot.parent.insertBefore(tr, spot.after.nextSibling);
        } else if (spot && spot.after) {
            spot.parent.appendChild(tr);
        } else {
            tb.appendChild(tr);
        }
    }

    function _sstdChangeCheckGroup(sel) {
        const tr = sel && sel.closest ? sel.closest('tr.sstd-pt-row') : null;
        if (!tr) return;
        _sstdMoveRowToGroup(tr, sel.value);
        tr.setAttribute('data-merge-prev', sel.value === 'appearance' ? '1' : '0');
        _sstdWriteCheckBody(_sstdReadCheckPointsFromDom(true));
    }

    function _sstdAddCheckRow(group) {
        group = _sstdNormGroup(group);
        const pts = _sstdReadCheckPointsFromDom(true);
        const lastSame = [...pts].reverse().find(p => _sstdNormGroup(p.group) === group);
        const neu = {
            group,
            item: '', standard: '',
            method: lastSame ? lastSame.method : (group === 'appearance' ? '육안' : ''),
            sample: lastSame ? lastSame.sample : (group === 'appearance' ? '10EA/LOT' : ''),
            management: lastSame ? lastSame.management : '',
            mergePrev: !!lastSame
        };
        const order = { appearance: 0, reliability: 1, hidden: 2 };
        const lastIdx = pts.reduce((acc, p, i) => _sstdNormGroup(p.group) === group ? i : acc, -1);
        if (lastIdx >= 0) pts.splice(lastIdx + 1, 0, neu);
        else {
            pts.push(neu);
            pts.sort((a, b) => (order[_sstdNormGroup(a.group)] || 9) - (order[_sstdNormGroup(b.group)] || 9));
        }
        _sstdWriteCheckBody(pts);
    }

    function _sstdInsertCheckRowAfter(btn) {
        let el = btn; while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el || !el.parentNode) return;
        const rows = Array.from(document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row'));
        const idx = rows.indexOf(el);
        const pts = _sstdReadCheckPointsFromDom(true);
        const group = _sstdRowGroup(el);
        const src = pts[idx] || { group };
        pts.splice(idx + 1, 0, {
            group,
            item: '', standard: '',
            method: src.method || (group === 'appearance' ? '육안' : ''),
            sample: src.sample || (group === 'appearance' ? '10EA/LOT' : ''),
            management: src.management || '',
            mergePrev: true
        });
        _sstdWriteCheckBody(pts);
    }
    function _sstdOnCfInput(inp) {
        const td = inp.closest('td');
        if (td) td.style.background = inp.value.trim() ? 'none' : _SSTD_DIAG;
    }
    function _sstdAddRevRow() {
        const tb = document.getElementById('sstdRevBody');
        if (!tb) return;
        const no = String(Math.max(0, tb.rows.length - 1)).padStart(2, '0');
        const tr = document.createElement('tr');
        tr.innerHTML = _sstdRevRowHtml({ no });
        tr.style.height = '32px';
        tb.appendChild(tr);
    }
    function _sstdInsertRevRowAfter(btn) {
        let el = btn; while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el || !el.parentNode) return;
        const tr = document.createElement('tr');
        tr.innerHTML = _sstdRevRowHtml({});
        tr.style.height = '32px';
        const next = el.nextElementSibling;
        if (next) el.parentNode.insertBefore(tr, next); else el.parentNode.appendChild(tr);
    }

    function _sstdCloseModal() {
        if (_sstdKbHandler) { document.removeEventListener('keydown', _sstdKbHandler); _sstdKbHandler = null; }
        UIUtils.closeModal();
    }

    // 입력/수정 가능 여부는 관리자가 「역할별 접근 권한」에서 이 페이지(shipping-standby)에
    // 부여한 입력 권한을 그대로 따른다 — 코드에 특정 역할을 하드코딩하지 않는다.
    // ShippingInspectionModule의 보기/수정 모달에서도 그대로 참조한다.
    function canEditHistory() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.canWritePage !== 'function') return true;
        return AuthModule.canWritePage('shipping-standby');
    }

    /* ══════════════════════════════════════════════════════════
       레이져 외관검사 ↔ 출하검사 대조 (누락 / 중복 점검)
       레이져 검사(포장수량>0) → 출하검사 대기 → 출하검사 체인을 검증한다.
    ══════════════════════════════════════════════════════════ */
    const _AUDIT_DAYS = 120;

    function _auditIsWip(carModel, partName) {
        return typeof LaserWipModule !== 'undefined'
            && typeof LaserWipModule.isAfterLaserDrainProduct === 'function'
            && LaserWipModule.isAfterLaserDrainProduct(carModel || '', partName || '');
    }

    function _auditDayDiff(a, b) {
        const da = Date.parse(String(a || '').slice(0, 10));
        const db = Date.parse(String(b || '').slice(0, 10));
        if (isNaN(da) || isNaN(db)) return 999;
        return Math.abs(da - db) / 86400000;
    }

    // 대기 기록이 지워졌어도 출하검사 이력에 같은 건이 남아 있는지 확인한다.
    // 차종·품명 일치 + 검사수량 일치 + 검사일 ±10일(출하검사는 며칠 뒤 진행될 수 있음).
    function _findShippedInspection(pool, insp, packQty) {
        const car = String(insp.carModel || '').trim();
        const part = String(insp.partName || '').trim();
        let best = null, bestDiff = 999;
        pool.forEach(function(c) {
            if (c.used) return;
            const si = c.si;
            if (String(si.carModel || '').trim() !== car) return;
            if (String(si.partName || '').trim() !== part) return;
            if (Number(si.lotSize || 0) !== Number(packQty)) return;
            const diff = Math.min(
                _auditDayDiff(si.date, insp.date),
                _auditDayDiff(si.laserLot, insp.date)
            );
            if (diff > 10) return;
            if (diff < bestDiff) { best = c; bestDiff = diff; }
        });
        return best;
    }

    // 링크가 끊긴 대기 기록 중 이 레이져 검사와 같은 건으로 볼 수 있는 항목을 찾는다.
    // 차종·품명 일치 + 수량 일치 + 등록일 ±3일 이내를 동일 건으로 본다.
    function _findUnlinkedStandby(pool, insp, packQty) {
        const car = String(insp.carModel || '').trim();
        const part = String(insp.partName || '').trim();
        const color = String(insp.color || '').trim();
        let best = null, bestDiff = 999;
        pool.forEach(function(c) {
            if (c.used) return;
            const sb = c.sb;
            if (String(sb.carModel || '').trim() !== car) return;
            if (String(sb.partName || '').trim() !== part) return;
            const sbColor = String(sb.color || '').trim();
            if (color && sbColor && color !== sbColor) return;
            if (Number(sb.goodQty || sb.inspectionQty || 0) !== Number(packQty)) return;
            const diff = _auditDayDiff(sb.date, insp.date);
            if (diff > 3) return;
            if (diff < bestDiff) { best = c; bestDiff = diff; }
        });
        return best;
    }

    function _laserAuditData() {
        const insps = (Storage.getAll(DB.STORES.LASER_INSPECTIONS) || []).slice();
        const sbAll = Storage.getAll(SB_STORE) || [];
        const siAll = Storage.getAll(SI_STORE) || [];
        const from = new Date(Date.now() - _AUDIT_DAYS * 86400000).toISOString().slice(0, 10);

        const sbByInsp = {};
        sbAll.forEach(function(sb) {
            const key = String(sb.laserInspectionId || '');
            if (!key) return;
            (sbByInsp[key] = sbByInsp[key] || []).push(sb);
        });
        const siByStandby = {};
        siAll.forEach(function(si) {
            const key = String(si.standbyId || '');
            if (!key) return;
            (siByStandby[key] = siByStandby[key] || []).push(si);
        });

        const issues = [];
        const stats = { total: 0, ok: 0, waiting: 0, missing: 0, dup: 0, skipped: 0, orphan: 0, link: 0, shipped: 0 };

        // 대기 레코드가 삭제된 뒤에도 남아 있는 출하검사 이력 풀
        const shippedPool = siAll
            .filter(function(si) {
                if (si.laserInspectionId) {
                    return !Storage.getById(DB.STORES.LASER_INSPECTIONS, si.laserInspectionId);
                }
                return !si.standbyId || !Storage.getById(SB_STORE, si.standbyId);
            })
            .map(function(si) { return { si: si, used: false }; });

        // laserInspectionId 링크가 없는(또는 끊긴) 레이져 출처 대기 기록 풀 — 날짜 무관하게 전체를 본다.
        const unlinkedPool = sbAll
            .filter(function(sb) {
                if (String(sb.source || '') !== 'laser_inspection') return false;
                if (!sb.laserInspectionId) return true;
                return !Storage.getById(DB.STORES.LASER_INSPECTIONS, sb.laserInspectionId);
            })
            .map(function(sb) { return { sb: sb, used: false }; });

        insps.filter(function(i) { return String(i.date || '') >= from; })
             .sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })
             .forEach(function(insp) {
            stats.total++;
            const packQty = Number(insp.packQty) || 0;
            const base = {
                inspId: insp.id, date: insp.date || '', carModel: insp.carModel || '',
                partName: insp.partName || '', color: insp.color || '', packQty: packQty
            };
            if (packQty <= 0) { stats.skipped++; return; }
            if (_auditIsWip(insp.carModel, insp.partName)) { stats.skipped++; return; }

            const sbs = sbByInsp[String(insp.id)] || [];
            if (!sbs.length) {
                // laserInspectionId 링크만 끊긴 과거 데이터일 수 있으므로 실제 대기/출하검사 기록을 먼저 찾는다.
                const cand = _findUnlinkedStandby(unlinkedPool, insp, packQty);
                if (cand) {
                    cand.used = true;
                    stats.link++;
                    issues.push(Object.assign({
                        kind: 'link', desc: '대기 기록 연결 끊김(복구 가능)', standbyId: cand.sb.id
                    }, base));
                    return;
                }
                const shipped = _findShippedInspection(shippedPool, insp, packQty);
                if (shipped) {
                    shipped.used = true;
                    stats.shipped++;
                    issues.push(Object.assign({
                        kind: 'shipped', desc: '출하검사 완료(대기 기록만 삭제됨)',
                        inspectionId: shipped.si.id
                    }, base));
                    return;
                }
                stats.missing++;
                issues.push(Object.assign({ kind: 'missing', desc: '출하검사 대기 미등록' }, base));
                return;
            }
            if (sbs.length > 1) {
                stats.dup++;
                issues.push(Object.assign({
                    kind: 'dup',
                    desc: '출하검사 대기 ' + sbs.length + '건 중복',
                    dupIds: sbs.slice(1).map(function(r) { return r.id; })
                }, base));
            }
            const done = sbs.some(function(sb) {
                return (siByStandby[String(sb.id)] || []).length > 0 || sb.status === '완료';
            });
            if (done) stats.ok++; else stats.waiting++;
        });

        // 레이져 실적이 연결되지 않은 대기 건(역방향 점검) — 연결 복구로 짝이 지어진 건은 제외
        unlinkedPool.forEach(function(c) {
            if (c.used) return;
            const sb = c.sb;
            if (String(sb.date || '') < from) return;
            stats.orphan++;
            issues.push({
                kind: 'orphan', desc: '연결된 레이져 외관검사 없음',
                standbyId: sb.id, date: sb.date || '', carModel: sb.carModel || '',
                partName: sb.partName || '', color: sb.color || '', packQty: Number(sb.goodQty || 0)
            });
        });

        return { issues: issues, stats: stats, from: from };
    }

    function auditLaser() {
        const result = _laserAuditData();
        const issues = result.issues, stats = result.stats, from = result.from;
        const chip = function(label, value, color) {
            return '<div style="flex:1 1 110px;border:1px solid var(--border-color);border-left:3px solid ' + color + ';'
                + 'border-radius:8px;padding:8px 10px;background:var(--bg-primary);">'
                + '<div style="font-size:1.05rem;font-weight:900;color:' + color + ';">' + value + '</div>'
                + '<div style="font-size:0.7rem;color:var(--text-muted);">' + label + '</div></div>';
        };
        const rows = issues.map(function(it) {
            const tone = it.kind === 'missing' ? '#b91c1c'
                : (it.kind === 'dup' ? '#b45309'
                : (it.kind === 'shipped' ? '#0d9488'
                : (it.kind === 'link' ? '#0891b2' : '#7c3aed')));
            let act;
            if (it.kind === 'missing') {
                act = '<button class="btn btn-sm btn-primary" style="padding:3px 9px;font-size:0.76rem;"'
                    + ' onclick="ShippingStandbyModule.auditRegister(\'' + it.inspId + '\')">대기 등록</button>';
            } else if (it.kind === 'dup') {
                act = '<button class="btn btn-sm btn-danger" style="padding:3px 9px;font-size:0.76rem;"'
                    + ' onclick="ShippingStandbyModule.auditRemoveDup(\'' + (it.dupIds || []).join(',') + '\')">중복 삭제</button>';
            } else if (it.kind === 'shipped') {
                act = '<button class="btn btn-sm btn-primary" style="padding:3px 9px;font-size:0.76rem;"'
                    + ' onclick="ShippingStandbyModule.auditLinkShipped(\'' + it.inspId + '\',\'' + it.inspectionId + '\')">이력 연결</button>';
            } else if (it.kind === 'link') {
                act = '<button class="btn btn-sm btn-primary" style="padding:3px 9px;font-size:0.76rem;"'
                    + ' onclick="ShippingStandbyModule.auditLink(\'' + it.inspId + '\',\'' + it.standbyId + '\')">연결 복구</button>';
            } else {
                act = '<span style="color:var(--text-muted);font-size:0.76rem;">확인 필요</span>';
            }
            return '<tr>'
                + '<td style="white-space:nowrap;">' + _esc(it.date || '-') + '</td>'
                + '<td><span style="font-weight:800;color:' + tone + ';font-size:0.76rem;">' + _esc(it.desc) + '</span></td>'
                + '<td>' + _esc(it.carModel || '-') + '</td>'
                + '<td><strong>' + _esc(it.partName || '-') + '</strong></td>'
                + '<td>' + _esc(it.color || '-') + '</td>'
                + '<td style="text-align:right;font-weight:700;">' + UIUtils.formatNumber(it.packQty || 0) + '</td>'
                + '<td style="text-align:center;">' + act + '</td>'
                + '</tr>';
        }).join('');

        const body = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">'
            + chip('레이져 외관검사', stats.total, '#334155')
            + chip('출하검사 완료', stats.ok, '#16a34a')
            + chip('검사 대기중', stats.waiting, '#2563eb')
            + chip('연결 복구 대상', stats.link, '#0891b2')
            + chip('출하 완료(대기 삭제)', stats.shipped, '#0d9488')
            + chip('대기 누락', stats.missing, '#b91c1c')
            + chip('대기 중복', stats.dup, '#b45309')
            + chip('레이져 실적 없음', stats.orphan, '#7c3aed')
            + chip('대상 제외', stats.skipped, '#94a3b8')
            + '</div>'
            + '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:10px;line-height:1.55;">'
            + '기준일 ' + _esc(from) + ' 이후 · 포장수량이 0인 검사(잔량만 발생)와 레이져 후 도장 공정 제품(재공품 유지)은 '
            + '설계상 출하검사로 넘어오지 않으므로 <b>대상 제외</b>로 집계됩니다.<br>'
            + '<b>연결 복구</b>는 대기/출하검사 기록은 이미 있는데 레이져 검사와의 연결 정보만 끊긴 건으로, '
            + '새로 등록하면 이중 출하가 되므로 연결만 이어 붙입니다. '
            + '<b>출하 완료(대기 삭제)</b>는 출하검사까지 끝났지만 대기 기록이 지워진 건으로, 역시 재등록 대상이 아닙니다.</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
            + (stats.link > 0
                ? '<button class="btn btn-sm btn-primary" style="padding:5px 12px;font-size:0.78rem;"'
                  + ' onclick="ShippingStandbyModule.auditLinkAll()">연결 복구 ' + stats.link + '건 일괄 처리</button>'
                : '')
            + (stats.shipped > 0
                ? '<button class="btn btn-sm btn-primary" style="padding:5px 12px;font-size:0.78rem;"'
                  + ' onclick="ShippingStandbyModule.auditLinkShippedAll()">출하 완료 이력 연결 ' + stats.shipped + '건</button>'
                : '')
            + (stats.missing > 0
                ? '<button class="btn btn-sm btn-danger" style="padding:5px 12px;font-size:0.78rem;"'
                  + ' onclick="ShippingStandbyModule.auditRegisterAll()">누락 ' + stats.missing + '건 일괄 대기 등록</button>'
                : '')
            + '</div>'
            + (issues.length
                ? '<div class="data-table-wrapper" style="max-height:52vh;overflow:auto;"><table class="data-table">'
                  + '<thead><tr><th>검사일</th><th>구분</th><th>차종</th><th>품명</th><th>컬러</th>'
                  + '<th style="text-align:right;">포장수량</th><th style="text-align:center;">조치</th></tr></thead>'
                  + '<tbody>' + rows + '</tbody></table></div>'
                : '<div style="padding:24px;text-align:center;color:var(--text-muted);">불일치 항목이 없습니다.</div>');

        UIUtils.showModal('레이져 ↔ 출하검사 대조', body);
    }

    async function auditRegister(inspId) {
        const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('레이져 검사 기록을 찾을 수 없습니다.', 'error'); return; }
        if (typeof ShippingInspectionModule === 'undefined'
            || !ShippingInspectionModule.buildStandbyPayloadFromLaser) {
            UIUtils.toast('대기 등록 기능을 사용할 수 없습니다.', 'error'); return;
        }
        const dup = (Storage.getAll(SB_STORE) || [])
            .some(function(r) { return String(r.laserInspectionId || '') === String(inspId); });
        if (dup) { UIUtils.toast('이미 대기에 등록되어 있습니다.', 'warning'); auditLaser(); return; }
        await Storage.add(SB_STORE, ShippingInspectionModule.buildStandbyPayloadFromLaser(insp, {}));
        UIUtils.toast('출하검사 대기에 등록했습니다.', 'success');
        loadData();
        auditLaser();
    }

    async function auditLink(inspId, standbyId) {
        const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, inspId);
        const sb = Storage.getById(SB_STORE, standbyId);
        if (!insp || !sb) { UIUtils.toast('대상 기록을 찾을 수 없습니다.', 'error'); return; }
        await Storage.update(SB_STORE, standbyId, {
            laserInspectionId: insp.id,
            laserWorkId: insp.workLogId || sb.laserWorkId || '',
            laserLot: sb.laserLot || sb.laserWorkDate || insp.date || '',
            laserWorkDate: sb.laserWorkDate || insp.date || ''
        });
        UIUtils.toast('레이져 검사와 연결했습니다.', 'success');
        loadData();
        auditLaser();
    }

    function auditLinkAll() {
        const targets = _laserAuditData().issues.filter(function(i) { return i.kind === 'link'; });
        if (!targets.length) { UIUtils.toast('연결 복구 대상이 없습니다.', 'warning'); return; }
        UIUtils.confirm('연결 복구 ' + targets.length + '건을 일괄 처리하시겠습니까? (새 대기 등록 없이 연결 정보만 채웁니다)',
            async function() {
                let done = 0;
                for (const t of targets) {
                    const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, t.inspId);
                    const sb = Storage.getById(SB_STORE, t.standbyId);
                    if (!insp || !sb) continue;
                    await Storage.update(SB_STORE, t.standbyId, {
                        laserInspectionId: insp.id,
                        laserWorkId: insp.workLogId || sb.laserWorkId || '',
                        laserLot: sb.laserLot || sb.laserWorkDate || insp.date || '',
                        laserWorkDate: sb.laserWorkDate || insp.date || ''
                    });
                    done++;
                }
                UIUtils.toast(done + '건 연결 복구 완료', 'success');
                loadData();
                auditLaser();
            });
    }

    function auditRegisterAll() {
        const targets = _laserAuditData().issues.filter(function(i) { return i.kind === 'missing'; });
        if (!targets.length) { UIUtils.toast('누락 건이 없습니다.', 'warning'); return; }
        if (typeof ShippingInspectionModule === 'undefined'
            || !ShippingInspectionModule.buildStandbyPayloadFromLaser) {
            UIUtils.toast('대기 등록 기능을 사용할 수 없습니다.', 'error'); return;
        }
        UIUtils.confirm('누락 ' + targets.length + '건을 출하검사 대기로 일괄 등록하시겠습니까? '
            + '이미 출하 처리된 건이 섞여 있으면 이중 등록이 되므로 먼저 연결 복구를 처리하세요.',
            async function() {
                let done = 0;
                for (const t of targets) {
                    const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, t.inspId);
                    if (!insp) continue;
                    const dup = (Storage.getAll(SB_STORE) || [])
                        .some(function(r) { return String(r.laserInspectionId || '') === String(insp.id); });
                    if (dup) continue;
                    await Storage.add(SB_STORE, ShippingInspectionModule.buildStandbyPayloadFromLaser(insp, {}));
                    done++;
                }
                UIUtils.toast(done + '건 출하검사 대기 등록 완료', 'success');
                loadData();
                auditLaser();
            });
    }

    async function auditLinkShipped(inspId, inspectionId) {
        const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, inspId);
        const si = Storage.getById(SI_STORE, inspectionId);
        if (!insp || !si) { UIUtils.toast('대상 기록을 찾을 수 없습니다.', 'error'); return; }
        await Storage.update(SI_STORE, inspectionId, {
            laserInspectionId: insp.id,
            laserLot: si.laserLot || insp.date || ''
        });
        UIUtils.toast('출하검사 이력과 연결했습니다.', 'success');
        auditLaser();
    }

    function auditLinkShippedAll() {
        const targets = _laserAuditData().issues.filter(function(i) { return i.kind === 'shipped'; });
        if (!targets.length) { UIUtils.toast('연결할 이력이 없습니다.', 'warning'); return; }
        UIUtils.confirm('출하검사 완료 이력 ' + targets.length + '건을 레이져 검사와 연결하시겠습니까? (수량·이력 변경 없음)',
            async function() {
                let done = 0;
                for (const t of targets) {
                    const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, t.inspId);
                    const si = Storage.getById(SI_STORE, t.inspectionId);
                    if (!insp || !si) continue;
                    await Storage.update(SI_STORE, t.inspectionId, {
                        laserInspectionId: insp.id,
                        laserLot: si.laserLot || insp.date || ''
                    });
                    done++;
                }
                UIUtils.toast(done + '건 이력 연결 완료', 'success');
                loadHistory();
                auditLaser();
            });
    }

    function auditRemoveDup(ids) {
        const list = String(ids || '').split(',').filter(Boolean);
        if (!list.length) return;
        UIUtils.confirm('중복 대기 ' + list.length + '건을 삭제하시겠습니까?', async function() {
            for (const id of list) await Storage.remove(SB_STORE, id);
            UIUtils.toast('중복 대기를 삭제했습니다.', 'success');
            loadData();
            auditLaser();
        });
    }

    return {
        render, loadData, loadHistory,
        auditLaser, auditRegister, auditRemoveDup, auditLink, auditLinkAll, auditRegisterAll,
        auditLinkShipped, auditLinkShippedAll,
        getLaserAuditSummary: function() { return _laserAuditData().stats; },
        onHistoryCarChange,
        _showDetail, canEditHistory,
        removeStandby, removeHistory, exportHistory,
        openShippingStandardList, openShippingStandardEditor,
        saveShippingStandard, deleteShippingStandard, viewShippingStandard, renderStandardListInto,
        findShipStandard, getCheckPointsForProduct,
        loadShipStandards: _loadShipStandards,
        summarizeCheckPoints: _stdPointsSummary,
        // 출하검사 기준서 문서형 편집기 핸들러
        _sstdPrint, _sstdOpenViewWindow, _sstdCloseModal,
        stdProductKey: _stdProductKey,
        _sstdAddImages, _sstdOnPaste, _sstdRemoveImage, _sstdUpdateImgLabel,
        _sstdStartSplitResize, _sstdStartSplitVResize, _sstdStartPtColResize, _sstdStartBottomResize,
        _sstdStartRevDateResize,
        _sstdDragStart, _sstdDragOver, _sstdDragEnd, _sstdDragDrop, _sstdStartResize, _sstdApplyImageLayout,
        _sstdEnableFreeLayout, _sstdStartFreeDrag,
        _sstdMoveImage,
        _sstdToggleImgSpan,
        _sstdToggleImgRowSpan,
        _sstdAddCheckRow, _sstdInsertCheckRowAfter, _sstdRenumberCheckRows, _sstdRefreshCheckLayout,
        _sstdChangeCheckGroup, _sstdToggleMergePrev, _sstdRemoveCheckRow,
        _sstdAddRevRow, _sstdInsertRevRowAfter, _sstdOnCfInput,
        _sstdLoadFromRegistered,
        _sstdFilterList,
        // 하위호환 (구 코드 참조용)
        remove: removeStandby
    };
})();



// ===================================================================
// 출하검사 일지
// ===================================================================
const ShippingInspectionModule = (function() {
    const STORE    = DB.STORES.SHIPPING_INSPECTIONS;
    const SB_STORE = DB.STORES.SHIPPING_STANDBY;

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _inspectionDateCell(dateValue, timeValue) {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return '<span style="color:var(--text-muted);">-</span>';
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) return _esc([rawDate, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' '));
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.08;min-width:56px;">
                <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${dateMatch[1]}</span>
                <strong style="font-size:0.92rem;color:var(--text-primary);">${dateMatch[2]}-${dateMatch[3]}</strong>
                ${timeMatch ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${timeMatch[1]}</span>` : ''}
            </div>`;
    }

    function _uniqText(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))].join(', ');
    }

    function _lotFields(row) {
        return {
            paintLot: _uniqText(row.paintLot || row.paintingDate || ''),
            injectionLot: _uniqText(row.injectionLot || row.lotNo || ''),
            laserLot: _uniqText(row.laserLot || row.laserWorkDate || '')
        };
    }

    function _lotCell(value) {
        const text = _uniqText(value);
        return text ? `<span style="font-family:monospace;font-size:0.78rem;">${_esc(text)}</span>` : '<span style="color:var(--text-muted);">-</span>';
    }

    // ── 모달 헬퍼 ─────────────────────────────────────────────────────
    function _openModal(title, content) {
        const existing = document.getElementById('siModal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'siModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div style="background:var(--bg-primary);border-radius:12px;width:100%;max-width:min(1200px, calc(100vw - 32px));max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg-primary);z-index:1;">
                    <h3 style="margin:0;font-size:1.1rem;">${title}</h3>
                    <button onclick="ShippingInspectionModule._closeModal()"
                        style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.4rem;line-height:1;">✕</button>
                </div>
                <div style="padding:20px 24px;" id="siModalBody">${content}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function _closeModal() {
        const el = document.getElementById('siModal');
        if (el) el.remove();
    }

    // ── 검사 등록 폼 빌드 ─────────────────────────────────────────────
    function _siParseSampleQty(sampleStr) {
        const m = String(sampleStr || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    }

    function _siSharedField(items, key, fallback) {
        const found = (items || []).find(it => String((it && it[key]) || '').trim());
        return (found && found[key]) || fallback;
    }

    function _siItemsBodyHtml(items) {
        const list = (items && items.length) ? items : [{}];
        const method = _siSharedField(list, 'method', '육안');
        const sample = _siSharedField(list, 'sample', '10EA/LOT');
        return list.map((it, idx) => {
            const opt = (v) => `<option value="${v}" ${it.judge === v ? 'selected' : ''}>${v || '—'}</option>`;
            const msTds = idx === 0
                ? `<td rowspan="${list.length}" style="padding:3px;text-align:center;vertical-align:middle;white-space:nowrap;">
                    <input class="si-method form-input" value="${_esc(method)}" title="외관 전 항목 공통"
                        style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:3.5em;text-align:center;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px;line-height:1.2;">전 항목 공통</div>
                   </td>
                   <td data-si-sample="1" rowspan="${list.length}" style="padding:3px;text-align:center;vertical-align:middle;white-space:nowrap;">
                    <input class="si-sample form-input" value="${_esc(sample)}" title="이 수량으로 외관 모든 항목을 검사합니다"
                        style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:6em;text-align:center;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px;line-height:1.2;max-width:7.5em;white-space:normal;">전 항목 공통</div>
                   </td>`
                : '';
            return `<tr>
            <td style="padding:3px;white-space:nowrap;"><input class="si-item form-input" value="${_esc(it.item || '')}" style="font-size:0.82rem;padding:4px 6px;min-width:5em;"></td>
            <td style="padding:3px;"><input class="si-std form-input" value="${_esc(it.standard || '')}" style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:12em;"></td>
            ${msTds}
            <td style="padding:3px;text-align:center;">
                <select class="si-judge form-select" style="font-size:0.82rem;padding:4px 6px;width:88px;">
                    ${opt('')}${opt('합격')}${opt('불합격')}
                </select>
            </td>
            <td style="padding:3px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="ShippingInspectionModule.removeItemRow(this)">×</button>
            </td>
        </tr>`;
        }).join('');
    }

    function _siReadItems() {
        const method = (document.querySelector('#siItemsBody .si-method') || {}).value || '';
        const sample = (document.querySelector('#siItemsBody .si-sample') || {}).value || '10EA/LOT';
        const items = [];
        document.querySelectorAll('#siItemsBody tr').forEach(tr => {
            items.push({
                item: (tr.querySelector('.si-item') || {}).value || '',
                standard: (tr.querySelector('.si-std') || {}).value || '',
                method,
                sample,
                judge: (tr.querySelector('.si-judge') || {}).value || '',
                group: 'appearance'
            });
        });
        return items;
    }

    function _siItemRowHtml(it) {
        return _siItemsBodyHtml([it || {}]);
    }

    /** 검사자 선택 목록 — 품질 검사자를 먼저 배치하고, 자주검사자는 그 아래에 둔다. */
    function _qualityInspectorOptions(selectedName) {
        if (typeof AuthModule === 'undefined' || !AuthModule.getUsers) return '';
        const roles = (AuthModule.getRoles ? AuthModule.getRoles() : []) || [];
        const qualityKeys = new Set(
            roles.filter(r => r && /품질/.test(r.label || '')).map(r => r.key)
        );
        const selfKeys = new Set(
            roles.filter(r => r && /자주검사/.test(r.label || '')).map(r => r.key)
        );

        const quality = [], self = [];
        (AuthModule.getUsers() || []).forEach(u => {
            if (!u || u.active === false) return;
            const name = u.displayName || u.username;
            if (!name) return;
            const keys = [u.role, ...(Array.isArray(u.roles) ? u.roles : [])].filter(Boolean);
            if (keys.some(k => qualityKeys.has(k))) quality.push(name);
            else if (keys.some(k => selfKeys.has(k))) self.push(name);
        });

        const uniqSort = list => [...new Set(list)].sort((a, b) => a.localeCompare(b, 'ko'));
        const qNames = uniqSort(quality);
        const sNames = uniqSort(self).filter(n => qNames.indexOf(n) === -1);

        const opt = n => `<option value="${_esc(n)}" ${n === selectedName ? 'selected' : ''}>${_esc(n)}</option>`;
        let html = '';
        if (qNames.length) {
            html += `<optgroup label="품질 검사자">${qNames.map(opt).join('')}</optgroup>`;
        }
        if (sNames.length) {
            html += `<optgroup label="자주검사자">${sNames.map(opt).join('')}</optgroup>`;
        }
        return html;
    }

    function _buildForm(sb, checkItems, stdHint) {
        const inspectorOptions = _qualityInspectorOptions('');
        const items = Array.isArray(checkItems) ? checkItems : [];

        return `
        <div style="display:grid;gap:14px;">

            <!-- 제품 정보 (읽기전용) -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 10px 0;color:var(--text-primary);">제품 정보</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px 14px;background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">납품처</div>
                        <div style="font-weight:700;font-size:0.9rem;color:var(--accent-blue);">${_esc(sb.customer || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">차종</div>
                        <div style="font-weight:600;font-size:0.9rem;">${_esc(sb.carModel || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">제품명</div>
                        <div style="font-weight:600;font-size:0.9rem;">${_esc(sb.partName || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">컬러</div>
                        <div style="font-size:0.9rem;">${_esc(sb.color || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(sb.paintLot || sb.paintingDate || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(sb.injectionLot || sb.lotNo || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">레이져 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(sb.laserLot || sb.laserWorkDate || '-')}</div>
                    </div>
                </div>
                <input type="hidden" id="siStandbyId"  value="${_esc(sb.id    || '')}">
                <input type="hidden" id="siCarModel"   value="${_esc(sb.carModel   || '')}">
                <input type="hidden" id="siPartName"   value="${_esc(sb.partName   || '')}">
                <input type="hidden" id="siColor"      value="${_esc(sb.color      || '')}">
                <input type="hidden" id="siPaintingDate" value="${_esc(sb.paintingDate || '')}">
                <input type="hidden" id="siLotNoHidden"  value="${_esc(sb.lotNo    || '')}">
                <input type="hidden" id="siPaintLotHidden" value="${_esc(sb.paintLot || sb.paintingDate || '')}">
                <input type="hidden" id="siInjectionLotHidden" value="${_esc(sb.injectionLot || sb.lotNo || '')}">
                <input type="hidden" id="siLaserLotHidden" value="${_esc(sb.laserLot || sb.laserWorkDate || '')}">
                <input type="hidden" id="siSourceHidden" value="${_esc(sb.source || '')}">
                <input type="hidden" id="siCustomer"   value="${_esc(sb.customer   || '')}">
            </div></div>

            <!-- 검사 정보 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 정보</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사일자 <span style="color:var(--accent-red);">*</span></label>
                        <input type="date" class="form-input" id="siDate" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">시작 시간</label>
                        <input type="time" class="form-input" id="siStartTime">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">완료 시간</label>
                        <input type="time" class="form-input" id="siEndTime">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사자</label>
                        <select class="form-select" id="siInspector">
                            <option value="">-- 검사자 선택 --</option>
                            ${inspectorOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사 수량 <span style="color:var(--accent-red);">*</span></label>
                        <input type="number" class="form-input" id="siLotSize" value="${sb.goodQty || sb.inspectionQty || 0}"
                            min="1">
                    </div>
                </div>
            </div></div>

            <!-- 외관 검사 항목 (기준서) -->
            <div class="card"><div class="card-body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                    <h4 style="margin:0;color:var(--text-primary);">외관 검사 항목
                        <span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">확인방법·시료는 전 항목 공통(이 수량으로 모든 항목 검사)${stdHint ? ' · ' + _esc(stdHint) : ''}</span>
                    </h4>
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="btn btn-sm btn-outline" onclick="ShippingInspectionModule.reloadFromStandard()">
                            <span class="material-symbols-outlined" style="font-size:14px;">fact_check</span> 기준서 불러오기
                        </button>
                        <button type="button" class="btn btn-sm btn-outline" onclick="ShippingInspectionModule.addItemRow()">
                            <span class="material-symbols-outlined" style="font-size:14px;">add</span> 항목 추가
                        </button>
                    </div>
                </div>
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow-x:auto;">
                    <table class="data-table" style="margin:0;width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                        <thead><tr>
                            <th style="white-space:nowrap;">항목</th><th>기준</th><th style="white-space:nowrap;">확인방법</th>
                            <th style="white-space:nowrap;">시료</th>
                            <th style="text-align:center;white-space:nowrap;">판정</th><th style="width:40px;"></th>
                        </tr></thead>
                        <tbody id="siItemsBody">${_siItemsBodyHtml(items)}</tbody>
                    </table>
                </div>
            </div></div>

            <!-- 샘플 검사 결과 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">샘플 검사 결과</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">샘플 검사 수량</label>
                        <input type="number" class="form-input" id="siSampleQty"
                            value="${items.length ? (_siParseSampleQty(_siSharedField(items, 'sample', '10EA/LOT')) || 0) : 0}" min="0">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">불량 발견 수량</label>
                        <input type="number" class="form-input" id="siDefectQty" value="0" min="0">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">판정</label>
                        <select class="form-select" id="siResult" style="font-weight:700;color:var(--accent-green);">
                            <option value="합격"  style="color:var(--accent-green);">합격</option>
                            <option value="불합격" style="color:var(--accent-red);">불합격</option>
                            <option value="보류">보류</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="siNote" placeholder="특이사항 입력" style="height:60px;"></textarea>
                </div>
            </div></div>

            <!-- 버튼 -->
            <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:4px;">
                <button class="btn btn-secondary" onclick="ShippingInspectionModule._closeModal()">취소</button>
                <button class="btn btn-primary" onclick="ShippingInspectionModule._save()">
                    <span class="material-symbols-outlined">save</span> 검사 등록
                </button>
            </div>
        </div>`;
    }

    // ── 대기 항목에서 검사 등록 열기 ─────────────────────────────────
    async function openFromStandby(standbyId) {
        const sb = Storage.getById(SB_STORE, standbyId);
        if (!sb) { UIUtils.toast('대기 항목을 찾을 수 없습니다.', 'error'); return; }
        let items = [];
        let stdHint = '';
        if (typeof ShippingStandbyModule !== 'undefined' && ShippingStandbyModule.getCheckPointsForProduct) {
            items = await ShippingStandbyModule.getCheckPointsForProduct(sb.carModel, sb.partName, sb.color, 'appearance');
        }
        if (items.length) stdHint = '기준서(외관) 항목을 불러왔습니다.';
        else if (sb.carModel || sb.partName) stdHint = '해당 품목 기준서(외관)가 없습니다. 항목을 직접 추가하세요.';
        _openModal(`출하검사(외관) 등록 — ${sb.partName || ''}`, _buildForm(sb, items, stdHint));
    }

    function addItemRow() {
        const tb = document.getElementById('siItemsBody');
        if (!tb) return;
        const items = _siReadItems();
        items.push({ group: 'appearance' });
        tb.innerHTML = _siItemsBodyHtml(items);
    }

    function removeItemRow(btn) {
        const tb = document.getElementById('siItemsBody');
        if (!tb) return;
        const items = _siReadItems();
        const rows = Array.from(tb.querySelectorAll('tr'));
        const idx = rows.indexOf(btn && btn.closest ? btn.closest('tr') : null);
        if (idx < 0) return;
        items.splice(idx, 1);
        tb.innerHTML = _siItemsBodyHtml(items);
    }

    async function reloadFromStandard() {
        const carModel = (document.getElementById('siCarModel') || {}).value || '';
        const partName = (document.getElementById('siPartName') || {}).value || '';
        const color = (document.getElementById('siColor') || {}).value || '';
        if (!carModel && !partName) {
            UIUtils.toast('품목 정보가 없습니다.', 'warning');
            return;
        }
        const fromStd = (typeof ShippingStandbyModule !== 'undefined' && ShippingStandbyModule.getCheckPointsForProduct)
            ? await ShippingStandbyModule.getCheckPointsForProduct(carModel, partName, color, 'appearance')
            : [];
        const tb = document.getElementById('siItemsBody');
        if (!tb) return;
        if (!fromStd.length) {
            UIUtils.toast('해당 품목의 기준서(외관) 항목이 없습니다.', 'warning');
            return;
        }
        tb.innerHTML = _siItemsBodyHtml(fromStd);
        const qtyEl = document.getElementById('siSampleQty');
        const n = _siParseSampleQty(_siSharedField(fromStd, 'sample', '10EA/LOT'));
        if (qtyEl && n > 0) qtyEl.value = n;
        UIUtils.toast(`기준서 외관 항목 ${fromStd.length}건을 불러왔습니다.`, 'success');

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const matchProduct = products.find(p =>
            String(p.carModel || '').trim() === String(carModel || '').trim() &&
            String(p.partName || '').trim() === String(partName || '').trim() &&
            String(p.color || '').trim() === String(color || '').trim()
        ) || products.find(p =>
            String(p.carModel || '').trim() === String(carModel || '').trim() &&
            String(p.partName || '').trim() === String(partName || '').trim()
        );
        if (matchProduct && typeof ShippingStandbyModule !== 'undefined' && ShippingStandbyModule._sstdOpenViewWindow) {
            const key = ShippingStandbyModule.stdProductKey
                ? ShippingStandbyModule.stdProductKey(matchProduct)
                : (matchProduct.id || `${matchProduct.carModel || ''}||${matchProduct.partName || ''}||${matchProduct.color || ''}`);
            ShippingStandbyModule._sstdOpenViewWindow(encodeURIComponent(key));
        }
    }

    // ── 저장 ─────────────────────────────────────────────────────────
    async function _save() {
        const lotSize   = parseInt(document.getElementById('siLotSize')?.value  || 0);
        const sampleQty = parseInt(document.getElementById('siSampleQty')?.value || 0);
        const defectQty = parseInt(document.getElementById('siDefectQty')?.value || 0);
        const result    = document.getElementById('siResult')?.value || '합격';
        const date      = document.getElementById('siDate')?.value || UIUtils.today();
        const standbyId = document.getElementById('siStandbyId')?.value || '';
        const partName  = document.getElementById('siPartName')?.value || '';

        if (!lotSize) { UIUtils.toast('검사 수량을 입력하세요.', 'warning'); return; }
        if (!partName) { UIUtils.toast('품목 정보가 없습니다.', 'error'); return; }

        const items = _siReadItems().filter(it => it.item || it.standard || it.judge).map(it => ({
            item: it.item,
            standard: it.standard,
            method: it.method,
            sample: it.sample,
            resultValue: '',
            judge: it.judge,
            group: 'appearance'
        }));

        const record = {
            date,
            startTime        : document.getElementById('siStartTime')?.value || '',
            endTime          : document.getElementById('siEndTime')?.value   || '',
            inspector        : document.getElementById('siInspector')?.value || '',
            customer         : document.getElementById('siCustomer')?.value  || '',
            carModel         : document.getElementById('siCarModel')?.value  || '',
            partName,
            color            : document.getElementById('siColor')?.value     || '',
            paintingDate     : document.getElementById('siPaintingDate')?.value || '',
            lotNo            : document.getElementById('siLotNoHidden')?.value  || '',
            paintLot         : document.getElementById('siPaintLotHidden')?.value || document.getElementById('siPaintingDate')?.value || '',
            injectionLot     : document.getElementById('siInjectionLotHidden')?.value || document.getElementById('siLotNoHidden')?.value || '',
            laserLot         : document.getElementById('siLaserLotHidden')?.value || '',
            source           : document.getElementById('siSourceHidden')?.value || '',
            lotSize,
            sampleQty,
            defectQty,
            result,
            items,
            standbyId,
            laserInspectionId: (standbyId ? (Storage.getById(SB_STORE, standbyId) || {}).laserInspectionId : '') || '',
            note             : document.getElementById('siNote')?.value?.trim() || ''
        };

        await Storage.add(STORE, record);

        // 대기 상태 → 완료
        if (standbyId) {
            await Storage.update(SB_STORE, standbyId, { status: '완료', inspectionDate: date });
        }

        // 합격 시 제품 창고 입고
        if (result === '합격' && lotSize > 0) {
            await Storage.add(DB.STORES.PRODUCT_INVENTORY, {
                date,
                carModel : record.carModel,
                partName,
                color    : record.color,
                paintingDate: record.paintingDate,
                lotNo    : record.lotNo,
                quantity : lotSize,
                type     : '입고',
                source   : '출하검사 합격',
                // 도장작업 이력(사출 LOT 수입검사일·사용 도료 LOT) 역추적용 — 제품 창고 상세 모달에서 사용
                standbyId: standbyId || ''
            });
        }

        _closeModal();
        UIUtils.toast(`출하검사 등록 완료 — ${result}`, result === '합격' ? 'success' : 'error');

        // 통합 페이지 갱신
        if (document.getElementById('ssWaitingBody')) {
            ShippingStandbyModule.loadData();
            ShippingStandbyModule.loadHistory();
        }
    }

    // ── 화면 렌더 (shipping-standby 통합 페이지로 리다이렉트) ──────────
    function render(container) {
        Router.navigate('shipping-standby');
    }

    // ── 구버전 호환용 더미 render (사용 안 함) ─────────────────────────
    function _renderLegacy(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                    <label style="font-size:0.82rem;font-weight:600;white-space:nowrap;">기간</label>
                    <input type="date" class="form-input" id="siStart" value="${UIUtils.monthAgo()}" style="width:130px;">
                    <span style="color:var(--text-muted);">~</span>
                    <input type="date" class="form-input" id="siEnd" value="${UIUtils.today()}" style="width:130px;">
                    <button class="btn btn-primary" onclick="ShippingInspectionModule.search()" style="margin-left:auto;">
                        <span class="material-symbols-outlined">search</span> 조회
                    </button>
                </div>

                <div class="stat-cards" id="siStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일</th>
                                        <th>납품처</th>
                                        <th>차종</th>
                                        <th>제품명</th>
                                        <th>컬러</th>
                                        <th>도장LOT</th>
                                        <th>사출LOT</th>
                                        <th>레이져 LOT</th>
                                        <th style="text-align:right">LOT 수량</th>
                                        <th style="text-align:center">샘플</th>
                                        <th style="text-align:center">불량</th>
                                        <th style="text-align:center">판정</th>
                                        <th>검사자</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="siTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('siStart')?.value || '';
        const end   = document.getElementById('siEnd')?.value   || '';
        const data  = Storage.getByDateRange(STORE, start, end)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const pass  = data.filter(d => d.result === '합격').length;
        const fail  = data.filter(d => d.result === '불합격').length;
        const hold  = data.filter(d => d.result === '보류').length;

        document.getElementById('siStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">검사 건수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${pass}</div>
                <div class="stat-card-label">합격</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${fail}</div>
                <div class="stat-card-label">불합격</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${hold}</div>
                <div class="stat-card-label">보류</div>
            </div>
        `;

        const tbody = document.getElementById('siTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">검사 실적이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            const lots = _lotFields(d);
            return `
                <tr>
                    <td style="white-space:nowrap;">${_inspectionDateCell(d.date, d.startTime || d.endTime || '')}</td>
                    <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td>${d.color || '-'}</td>
                    <td>${_lotCell(lots.paintLot)}</td>
                    <td>${_lotCell(lots.injectionLot)}</td>
                    <td>${_lotCell(lots.laserLot)}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.lotSize || d.quantity || 0)}</td>
                    <td style="text-align:center;font-size:0.85rem;">${UIUtils.formatNumber(d.sampleQty || 0)}</td>
                    <td style="text-align:center;color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};font-weight:${d.defectQty > 0 ? '700' : '400'};">${d.defectQty || 0}</td>
                    <td style="text-align:center;">${UIUtils.badge(d.result || '-', badge)}</td>
                    <td style="font-size:0.85rem;">${d.inspector || '-'}</td>
                    <td></td>
                </tr>
            `;
        }).join('');
    }

    // ── 검사 이력 보기 / 수정 — 최초 등록 화면(_buildForm)과 동일한 레이아웃을 재사용 ──
    function _canEditHistoryPerm() {
        if (typeof ShippingStandbyModule !== 'undefined' && ShippingStandbyModule.canEditHistory) {
            return ShippingStandbyModule.canEditHistory();
        }
        if (typeof AuthModule === 'undefined' || typeof AuthModule.canWritePage !== 'function') return true;
        return AuthModule.canWritePage('shipping-standby');
    }

    function _isHistoryAdmin() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function') {
            return AuthModule.isAdminUser();
        }
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return true;
        const user = AuthModule.getCurrentUser();
        if (!user) return false;
        const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role].filter(Boolean).map(String);
        return roles.includes('admin');
    }

    // 삭제는 관리자, 또는 이 화면 입력 권한이 있는 사용자
    function _canDeleteHistoryPerm() {
        return _isHistoryAdmin() || _canEditHistoryPerm();
    }

    function _sameText(a, b) {
        return String(a || '').trim() === String(b || '').trim();
    }

    function _linkedInbound(rec) {
        if (!rec) return [];
        const inv = Storage.getAll(DB.STORES.PRODUCT_INVENTORY) || [];
        const byStandby = rec.standbyId
            ? inv.filter(d => (d.type || '입고') === '입고'
                && String(d.source || '') === '출하검사 합격'
                && String(d.standbyId || '') === String(rec.standbyId))
            : [];
        if (byStandby.length) return byStandby;
        return inv.filter(d => (d.type || '입고') === '입고'
            && String(d.source || '') === '출하검사 합격'
            && _sameText(d.date, rec.date)
            && _sameText(d.carModel, rec.carModel)
            && _sameText(d.partName, rec.partName)
            && _sameText(d.color, rec.color)
            && _sameText(d.lotNo, rec.lotNo)
            && Number(d.quantity || 0) === Number(rec.lotSize || rec.quantity || 0));
    }

    function _historyItemsBodyHtml(items, readOnly) {
        const list = (items && items.length) ? items : [{}];
        const method = _siSharedField(list, 'method', '육안');
        const sample = _siSharedField(list, 'sample', '10EA/LOT');
        const dis = readOnly ? ' disabled' : '';
        return list.map((it, idx) => {
            const opt = (v) => `<option value="${v}" ${it.judge === v ? 'selected' : ''}>${v || '—'}</option>`;
            const msTds = idx === 0
                ? `<td rowspan="${list.length}" style="padding:3px;text-align:center;vertical-align:middle;white-space:nowrap;">
                    <input class="si-method form-input" value="${_esc(method)}" title="외관 전 항목 공통"${dis}
                        style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:3.5em;text-align:center;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px;line-height:1.2;">전 항목 공통</div>
                   </td>
                   <td rowspan="${list.length}" style="padding:3px;text-align:center;vertical-align:middle;white-space:nowrap;">
                    <input class="si-sample form-input" value="${_esc(sample)}" title="이 수량으로 외관 모든 항목을 검사합니다"${dis}
                        style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:6em;text-align:center;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px;line-height:1.2;max-width:7.5em;white-space:normal;">전 항목 공통</div>
                   </td>`
                : '';
            return `<tr>
            <td style="padding:3px;white-space:nowrap;"><input class="si-item form-input" value="${_esc(it.item || '')}"${dis} style="font-size:0.82rem;padding:4px 6px;min-width:5em;"></td>
            <td style="padding:3px;"><input class="si-std form-input" value="${_esc(it.standard || '')}"${dis} style="font-size:0.82rem;padding:4px 6px;width:auto;min-width:12em;"></td>
            ${msTds}
            <td style="padding:3px;text-align:center;">
                <select class="si-judge form-select"${dis} style="font-size:0.82rem;padding:4px 6px;width:88px;">
                    ${opt('')}${opt('합격')}${opt('불합격')}
                </select>
            </td>
            ${readOnly ? '' : `<td style="padding:3px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="ShippingInspectionModule.removeHistoryItemRow(this)">×</button>
            </td>`}
        </tr>`;
        }).join('');
    }

    function _siReadHistoryItems() {
        const method = (document.querySelector('#siHistItemsBody .si-method') || {}).value || '';
        const sample = (document.querySelector('#siHistItemsBody .si-sample') || {}).value || '10EA/LOT';
        const items = [];
        document.querySelectorAll('#siHistItemsBody tr').forEach(tr => {
            items.push({
                item: (tr.querySelector('.si-item') || {}).value || '',
                standard: (tr.querySelector('.si-std') || {}).value || '',
                method,
                sample,
                judge: (tr.querySelector('.si-judge') || {}).value || '',
                group: 'appearance'
            });
        });
        return items;
    }

    function addHistoryItemRow() {
        const tb = document.getElementById('siHistItemsBody');
        if (!tb) return;
        const items = _siReadHistoryItems();
        items.push({ group: 'appearance' });
        tb.innerHTML = _historyItemsBodyHtml(items, false);
    }

    function removeHistoryItemRow(btn) {
        const tb = document.getElementById('siHistItemsBody');
        if (!tb) return;
        const items = _siReadHistoryItems();
        const rows = Array.from(tb.querySelectorAll('tr'));
        const idx = rows.indexOf(btn && btn.closest ? btn.closest('tr') : null);
        if (idx < 0) return;
        items.splice(idx, 1);
        tb.innerHTML = _historyItemsBodyHtml(items, false);
    }

    function _buildHistoryForm(rec, readOnly) {
        const inspectorOptions = _qualityInspectorOptions(rec.inspector || '');
        const items = Array.isArray(rec.items) ? rec.items : [];
        const dis = readOnly ? ' disabled' : '';
        const lots = _lotFields(rec);

        return `
        <div style="display:grid;gap:14px;">

            <!-- 제품 정보 (읽기전용) -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 10px 0;color:var(--text-primary);">제품 정보</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px 14px;background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">납품처</div>
                        <div style="font-weight:700;font-size:0.9rem;color:var(--accent-blue);">${_esc(rec.customer || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">차종</div>
                        <div style="font-weight:600;font-size:0.9rem;">${_esc(rec.carModel || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">제품명</div>
                        <div style="font-weight:600;font-size:0.9rem;">${_esc(rec.partName || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">컬러</div>
                        <div style="font-size:0.9rem;">${_esc(rec.color || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(lots.paintLot || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(lots.injectionLot || '-')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">레이져 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${_esc(lots.laserLot || '-')}</div>
                    </div>
                </div>
            </div></div>

            ${readOnly && !_canEditHistoryPerm() ? `
            <div style="padding:8px 12px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.25);border-radius:8px;font-size:0.8rem;color:var(--accent-red);">
                이 화면의 입력 권한이 없어 조회만 가능합니다. 수정이 필요하면 관리자에게 요청하세요.
            </div>` : ''}

            <!-- 검사 정보 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 정보</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사일자</label>
                        <input type="date" class="form-input" id="siHistDate" value="${_esc(rec.date || '')}"${dis}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">시작 시간</label>
                        <input type="time" class="form-input" id="siHistStart" value="${_esc(rec.startTime || '')}"${dis}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">완료 시간</label>
                        <input type="time" class="form-input" id="siHistEnd" value="${_esc(rec.endTime || '')}"${dis}>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사자</label>
                        <select class="form-select" id="siHistInspector"${dis}>
                            <option value="">-- 검사자 선택 --</option>
                            ${inspectorOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사 수량</label>
                        <input type="number" class="form-input" id="siHistLotSize" value="${Number(rec.lotSize) || 0}" min="1"${dis}>
                    </div>
                </div>
            </div></div>

            <!-- 외관 검사 항목 -->
            <div class="card"><div class="card-body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                    <h4 style="margin:0;color:var(--text-primary);">외관 검사 항목
                        <span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">확인방법·시료는 전 항목 공통(이 수량으로 모든 항목 검사)</span>
                    </h4>
                    ${readOnly ? '' : `<button type="button" class="btn btn-sm btn-outline" onclick="ShippingInspectionModule.addHistoryItemRow()">
                        <span class="material-symbols-outlined" style="font-size:14px;">add</span> 항목 추가
                    </button>`}
                </div>
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow-x:auto;">
                    <table class="data-table" style="margin:0;width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                        <thead><tr>
                            <th style="white-space:nowrap;">항목</th><th>기준</th><th style="white-space:nowrap;">확인방법</th>
                            <th style="white-space:nowrap;">시료</th>
                            <th style="text-align:center;white-space:nowrap;">판정</th>${readOnly ? '' : '<th style="width:40px;"></th>'}
                        </tr></thead>
                        <tbody id="siHistItemsBody">${_historyItemsBodyHtml(items, readOnly)}</tbody>
                    </table>
                </div>
            </div></div>

            <!-- 샘플 검사 결과 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">샘플 검사 결과</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">샘플 검사 수량</label>
                        <input type="number" class="form-input" id="siHistSampleQty" value="${Number(rec.sampleQty) || 0}" min="0"${dis}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">불량 발견 수량</label>
                        <input type="number" class="form-input" id="siHistDefectQty" value="${Number(rec.defectQty) || 0}" min="0"${dis}>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">판정</label>
                        <select class="form-select" id="siHistResult" style="font-weight:700;"${dis}>
                            <option value="합격" ${rec.result === '합격' ? 'selected' : ''}>합격</option>
                            <option value="불합격" ${rec.result === '불합격' ? 'selected' : ''}>불합격</option>
                            <option value="보류" ${rec.result === '보류' ? 'selected' : ''}>보류</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="siHistNote" placeholder="특이사항 입력" style="height:60px;"${dis}>${_esc(rec.note || '')}</textarea>
                </div>
            </div></div>

            <!-- 버튼 -->
            <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;padding-top:4px;flex-wrap:wrap;">
                ${_canDeleteHistoryPerm()
                    ? `<button class="btn btn-danger" style="margin-right:auto;" onclick="ShippingInspectionModule.deleteHistory('${rec.id}')">
                        <span class="material-symbols-outlined">delete</span> 삭제</button>`
                    : ''}
                ${readOnly
                    ? (`<button class="btn btn-secondary" onclick="ShippingInspectionModule._closeModal()">닫기</button>`
                        + (_canEditHistoryPerm()
                            ? `<button class="btn btn-primary" onclick="ShippingInspectionModule.openHistoryEdit('${rec.id}')">
                                <span class="material-symbols-outlined">edit</span> 수정</button>`
                            : ''))
                    : (`<button class="btn btn-secondary" onclick="ShippingInspectionModule.openHistoryView('${rec.id}')">취소</button>`
                        + `<button class="btn btn-primary" onclick="ShippingInspectionModule.saveHistoryEdit('${rec.id}')">
                                <span class="material-symbols-outlined">save</span> 저장</button>`)}
            </div>
        </div>`;
    }

    function openHistoryView(id) {
        const rec = Storage.getById(STORE, id);
        if (!rec) { UIUtils.toast('검사 이력을 찾을 수 없습니다.', 'error'); return; }
        _openModal(`출하검사(외관) 보기 — ${rec.partName || ''}`, _buildHistoryForm(rec, true));
    }

    function openHistoryEdit(id) {
        if (!_canEditHistoryPerm()) { UIUtils.toast('입력 권한이 없습니다.', 'warning'); return; }
        const rec = Storage.getById(STORE, id);
        if (!rec) { UIUtils.toast('검사 이력을 찾을 수 없습니다.', 'error'); return; }
        _openModal(`출하검사(외관) 수정 — ${rec.partName || ''}`, _buildHistoryForm(rec, false));
    }

    async function saveHistoryEdit(id) {
        if (!_canEditHistoryPerm()) { UIUtils.toast('입력 권한이 없습니다.', 'warning'); return; }
        const rec = Storage.getById(STORE, id);
        if (!rec) { UIUtils.toast('검사 이력을 찾을 수 없습니다.', 'error'); return; }

        const lotSize = parseInt(document.getElementById('siHistLotSize')?.value || 0, 10) || 0;
        if (!lotSize) { UIUtils.toast('검사 수량을 입력하세요.', 'warning'); return; }

        const items = _siReadHistoryItems().filter(it => it.item || it.standard || it.judge);

        await Storage.update(STORE, id, {
            date: document.getElementById('siHistDate')?.value || rec.date,
            startTime: document.getElementById('siHistStart')?.value || '',
            endTime: document.getElementById('siHistEnd')?.value || '',
            inspector: document.getElementById('siHistInspector')?.value || '',
            lotSize,
            sampleQty: parseInt(document.getElementById('siHistSampleQty')?.value || 0, 10) || 0,
            defectQty: parseInt(document.getElementById('siHistDefectQty')?.value || 0, 10) || 0,
            result: document.getElementById('siHistResult')?.value || rec.result,
            items,
            note: (document.getElementById('siHistNote')?.value || '').trim(),
            updatedAt: new Date().toISOString()
        });

        UIUtils.toast('수정되었습니다.', 'success');
        _closeModal();
        if (typeof ShippingStandbyModule !== 'undefined') {
            ShippingStandbyModule.loadData();
            ShippingStandbyModule.loadHistory();
        }
        search();
    }

    function _tokenSet(value) {
        return new Set(String(value == null ? '' : value)
            .split(/[,/|]/)
            .map(s => String(s || '').trim())
            .filter(Boolean));
    }

    function _tokensOverlap(a, b) {
        const sa = a instanceof Set ? a : _tokenSet(a);
        const sb = b instanceof Set ? b : _tokenSet(b);
        if (!sa.size || !sb.size) return false;
        for (const x of sa) {
            for (const y of sb) {
                if (x === y) return true;
                if (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x))) return true;
            }
        }
        return false;
    }

    function _normDate(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/(\d{4})(\d{2})(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
        if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
        return s.slice(0, 10);
    }

    function _normTime(v) {
        const s = String(v || '').trim();
        const m = s.match(/(\d{1,2}):(\d{2})/);
        if (!m) return '';
        return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
    }

    function _timeDiffMin(a, b) {
        const ta = _normTime(a);
        const tb = _normTime(b);
        if (!ta || !tb) return null;
        const toMin = t => {
            const p = t.split(':').map(Number);
            return p[0] * 60 + p[1];
        };
        return Math.abs(toMin(ta) - toMin(tb));
    }

    function _uniqNormDates(values) {
        return [...new Set((values || []).map(_normDate).filter(Boolean))];
    }

    function _uniqNormTimes(values) {
        return [...new Set((values || []).map(_normTime).filter(Boolean))];
    }

    function _bestTimeDiff(times, values) {
        let best = null;
        (values || []).forEach(v => {
            (times || []).forEach(t => {
                const diff = _timeDiffMin(t, v);
                if (diff == null) return;
                if (best == null || diff < best) best = diff;
            });
        });
        return best;
    }

    function _laserLotInfoFromInsp(insp) {
        const work = insp && insp.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, insp.workLogId) : null;
        const source = work || insp || {};
        const paintLots = Array.isArray(source.paintLots) ? source.paintLots : [];
        const paintDates = paintLots.length
            ? [...new Set(paintLots.map(lot => lot && (lot.paintDate || lot.paintLot)).filter(Boolean))]
            : [source.paintDate || source.paintingDate || insp.paintDate || insp.paintingDate].filter(Boolean);
        const injectionLots = paintLots.length
            ? [...new Set(paintLots.map(lot => lot && lot.lotNo).filter(Boolean))]
            : [source.paintLot || source.lotNo || insp.lotNo || insp.injectionLot].filter(Boolean);
        return {
            work,
            laserDate: source.date || insp.date || '',
            laserTime: source.startTime || source.inspectionStartTime || insp.inspectionStartTime || insp.startTime || '',
            paintDates,
            injectionLots
        };
    }

    function _shouldRematchLaser(rec, sb) {
        const src = String((sb && sb.source) || rec.source || '').trim();
        if (src === 'laser_inspection') return true;
        if (src === 'painting_inspection' || src === '도장품 출고') return false;
        if (typeof LaserWipModule !== 'undefined' && typeof LaserWipModule.isAfterLaserDrainProduct === 'function'
            && LaserWipModule.isAfterLaserDrainProduct(rec.carModel || '', rec.partName || '')) {
            return false;
        }
        return true;
    }

    function _findMatchingLaserRecord(rec, existingSb) {
        const recCar = String(rec.carModel || '').trim();
        const recPart = String(rec.partName || '').trim();
        const recColor = String(rec.color || '').trim();
        const recInj = _tokenSet(rec.injectionLot || rec.lotNo);
        const recPaint = _tokenSet(rec.paintLot || rec.paintingDate);
        const recQty = Number(rec.lotSize || rec.quantity || rec.goodQty || 0);
        const candDates = _uniqNormDates([
            rec.laserWorkDate, rec.laserLot, rec.date,
            existingSb && existingSb.laserWorkDate, existingSb && existingSb.laserLot, existingSb && existingSb.date
        ]);
        const candTimes = _uniqNormTimes([
            rec.startTime, rec.endTime,
            existingSb && existingSb.laserStartTime, existingSb && existingSb.laserEndTime,
            existingSb && existingSb.startTime, existingSb && existingSb.endTime
        ]);

        const linkedInspId = (existingSb && existingSb.laserInspectionId) || rec.laserInspectionId || '';
        if (linkedInspId) {
            const byId = Storage.getById(DB.STORES.LASER_INSPECTIONS, linkedInspId);
            if (byId) {
                const work = byId.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, byId.workLogId) : null;
                return { inspection: byId, work: work || null, score: 100 };
            }
        }
        const linkedWorkId = (existingSb && existingSb.laserWorkId) || rec.laserWorkId || rec.workLogId || '';
        if (linkedWorkId) {
            const work = Storage.getById(DB.STORES.LASER_WORK_LOG, linkedWorkId);
            if (work) {
                const insp = (Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [])
                    .find(i => String(i.workLogId || '') === String(work.id));
                return { inspection: insp || null, work, score: 90 };
            }
        }

        function scoreRow(row, kind) {
            if (!row) return null;
            if (String(row.carModel || '').trim() !== recCar) return null;
            if (String(row.partName || '').trim() !== recPart) return null;
            const rowColor = String(row.color || '').trim();
            if (recColor && rowColor && recColor !== rowColor) return null;

            const work = kind === 'work'
                ? row
                : (row.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, row.workLogId) : null);
            const lot = _laserLotInfoFromInsp(kind === 'work' ? Object.assign({}, row, { workLogId: row.id }) : row);
            const rowDates = _uniqNormDates([row.date, work && work.date, lot.laserDate]);
            const rowTimes = _uniqNormTimes([
                row.inspectionStartTime, row.inspectionEndTime, row.startTime, row.endTime,
                work && work.startTime, work && work.endTime, lot.laserTime
            ]);
            const dateHit = rowDates.some(d => candDates.includes(d));
            const timeDiff = _bestTimeDiff(candTimes, rowTimes);
            const timeHit = timeDiff != null && timeDiff <= 30;

            let score = 10;
            if (rowColor && recColor && rowColor === recColor) score += 3;
            if (dateHit) score += 15;
            if (timeDiff === 0) score += 12;
            else if (timeHit) score += 8;
            if (_tokensOverlap(recInj, lot.injectionLots.join(','))) score += 6;
            if (_tokensOverlap(recPaint, lot.paintDates.join(','))) score += 4;
            const qty = kind === 'work'
                ? (Number(row.shippingEligibleQty) || Number(row.quantity) || 0)
                : Number(row.packQty || 0);
            if (kind === 'inspection' && !(qty > 0)) return null;
            if (recQty && qty && recQty === qty) score += 4;
            else if (recQty && qty && Math.abs(recQty - qty) <= Math.max(1, recQty * 0.02)) score += 2;

            // 차종·품명 + (날짜 또는 시간)이 있어야 매칭으로 인정
            if (!dateHit && !timeHit) return null;
            return { score, dateHit, timeHit, work: work || (kind === 'work' ? row : null) };
        }

        let best = null;
        (Storage.getAll(DB.STORES.LASER_INSPECTIONS) || []).forEach(insp => {
            const scored = scoreRow(insp, 'inspection');
            if (!scored) return;
            if (!best || scored.score > best.score) {
                best = { inspection: insp, work: scored.work, score: scored.score };
            }
        });
        (Storage.getAll(DB.STORES.LASER_WORK_LOG) || []).forEach(work => {
            const scored = scoreRow(work, 'work');
            if (!scored) return;
            if (best && best.work && String(best.work.id) === String(work.id) && scored.score <= best.score) return;
            if (!best || scored.score > best.score) {
                const insp = (Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [])
                    .find(i => String(i.workLogId || '') === String(work.id));
                best = { inspection: insp || null, work, score: scored.score };
            }
        });
        return best;
    }

    function _customerOf(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const prod = products.find(p =>
            String(p.carModel || '') === String(carModel || '') &&
            String(p.partName || '') === String(partName || '') &&
            String(p.color || '') === String(color || ''))
            || products.find(p =>
                String(p.carModel || '') === String(carModel || '') &&
                String(p.partName || '') === String(partName || ''));
        return prod ? (prod.customer || '') : '';
    }

    function _standbyPayloadFromLaser(insp, rec) {
        const lot = _laserLotInfoFromInsp(insp);
        const paintingDate = lot.paintDates.join(', ');
        const lotNo = lot.injectionLots.join(', ');
        const laserLot = lot.laserDate || insp.date || rec.laserLot || '';
        const packQty = Number(insp.packQty) || Number(rec.lotSize) || 0;
        const packUnit = Number(insp.packUnit) || 0;
        const boxCount = Number(insp.packBoxCount) || (packUnit > 0 ? Math.floor(packQty / packUnit) : 0);
        return {
            date: insp.date || rec.date || (typeof UIUtils !== 'undefined' ? UIUtils.today() : ''),
            source: 'laser_inspection',
            laserInspectionId: insp.id || '',
            laserWorkId: insp.workLogId || '',
            laserStartTime: insp.inspectionStartTime || (lot.work && lot.work.startTime) || '',
            laserEndTime: insp.inspectionEndTime || (lot.work && lot.work.endTime) || '',
            laserMatchMissing: false,
            carModel: insp.carModel || rec.carModel || '',
            partName: insp.partName || rec.partName || '',
            color: insp.color || rec.color || '',
            paintingDate,
            paintLot: paintingDate,
            lotNo,
            injectionLot: lotNo,
            laserLot,
            laserWorkDate: lot.laserDate || '',
            inspectionQty: packQty,
            goodQty: packQty,
            packUnit,
            boxCount,
            laserResidualQty: Number(insp.residualQty) || 0,
            customer: _customerOf(insp.carModel || rec.carModel, insp.partName || rec.partName, insp.color || rec.color),
            status: '대기',
            inspectionDate: null
        };
    }

    function _standbyPayloadFromWork(work, rec) {
        const lot = _laserLotInfoFromInsp(Object.assign({}, work, { workLogId: work.id }));
        const paintingDate = lot.paintDates.join(', ');
        const lotNo = lot.injectionLots.join(', ');
        const laserLot = lot.laserDate || work.date || rec.laserLot || '';
        const packQty = Number(work.shippingEligibleQty) || Number(work.quantity) || Number(rec.lotSize) || 0;
        const packUnit = Number(rec.packUnit) || 0;
        const boxCount = Number(rec.boxCount) || (packUnit > 0 ? Math.floor(packQty / packUnit) : 0);
        return {
            date: work.date || rec.date || (typeof UIUtils !== 'undefined' ? UIUtils.today() : ''),
            source: 'laser_inspection',
            laserInspectionId: '',
            laserWorkId: work.id || '',
            laserStartTime: work.startTime || '',
            laserEndTime: work.endTime || '',
            laserMatchMissing: false,
            carModel: work.carModel || rec.carModel || '',
            partName: work.partName || rec.partName || '',
            color: work.color || rec.color || '',
            paintingDate,
            paintLot: paintingDate,
            lotNo,
            injectionLot: lotNo,
            laserLot,
            laserWorkDate: lot.laserDate || work.date || '',
            inspectionQty: packQty,
            goodQty: packQty,
            packUnit,
            boxCount,
            laserResidualQty: 0,
            customer: _customerOf(work.carModel || rec.carModel, work.partName || rec.partName, work.color || rec.color),
            status: '대기',
            inspectionDate: null
        };
    }

    function _standbyPayloadFromRec(rec) {
        const lots = _lotFields(rec);
        const qty = Number(rec.lotSize || rec.quantity || rec.goodQty || 0);
        return {
            date: rec.date || (typeof UIUtils !== 'undefined' ? UIUtils.today() : ''),
            source: rec.source || '',
            carModel: rec.carModel || '',
            partName: rec.partName || '',
            color: rec.color || '',
            paintingDate: lots.paintLot,
            paintLot: lots.paintLot,
            lotNo: lots.injectionLot,
            injectionLot: lots.injectionLot,
            laserLot: lots.laserLot,
            laserWorkDate: rec.laserWorkDate || lots.laserLot,
            inspectionQty: qty,
            goodQty: qty,
            customer: rec.customer || _customerOf(rec.carModel, rec.partName, rec.color),
            laserMatchMissing: true,
            status: '대기',
            inspectionDate: null
        };
    }

    function _findExistingStandbyForLaser(insp, excludeId) {
        if (!insp) return null;
        const rows = Storage.getAll(SB_STORE) || [];
        const lot = _laserLotInfoFromInsp(insp);
        const packQty = Number(insp.packQty) || 0;
        return rows.find(sb => {
            if (excludeId && sb.id === excludeId) return false;
            if (sb.laserInspectionId && insp.id && String(sb.laserInspectionId) === String(insp.id)) return true;
            if (String(sb.source || '') !== 'laser_inspection') return false;
            if (String(sb.carModel || '').trim() !== String(insp.carModel || '').trim()) return false;
            if (String(sb.partName || '').trim() !== String(insp.partName || '').trim()) return false;
            const sbColor = String(sb.color || '').trim();
            const inspColor = String(insp.color || '').trim();
            if (sbColor && inspColor && sbColor !== inspColor) return false;
            const sameLot = _tokensOverlap(sb.lotNo || sb.injectionLot, lot.injectionLots.join(','))
                || _tokensOverlap(sb.laserLot || sb.laserWorkDate, lot.laserDate);
            const sameQty = packQty > 0 && Number(sb.goodQty || sb.inspectionQty || 0) === packQty;
            return sameLot && sameQty;
        }) || null;
    }

    async function _restoreStandbyAfterDelete(rec) {
        const existing = rec.standbyId ? Storage.getById(SB_STORE, rec.standbyId) : null;
        const tryLaser = _shouldRematchLaser(rec, existing);
        const matched = tryLaser ? _findMatchingLaserRecord(rec, existing) : null;
        const now = new Date().toISOString();

        if (matched && (matched.inspection || matched.work)) {
            const payload = Object.assign(
                matched.inspection
                    ? _standbyPayloadFromLaser(matched.inspection, rec)
                    : _standbyPayloadFromWork(matched.work, rec),
                { updatedAt: now, laserMatchMissing: false }
            );
            if (existing) {
                await Storage.update(SB_STORE, existing.id, payload);
                return { id: existing.id, rematched: true, missing: false };
            }
            const dup = matched.inspection ? _findExistingStandbyForLaser(matched.inspection, null) : null;
            if (dup) {
                await Storage.update(SB_STORE, dup.id, payload);
                return { id: dup.id, rematched: true, missing: false };
            }
            const added = await Storage.add(SB_STORE, payload);
            return { id: added && added.id, rematched: true, missing: false };
        }

        if (tryLaser) {
            const payload = Object.assign(_standbyPayloadFromRec(rec), {
                updatedAt: now,
                laserMatchMissing: true,
                source: (existing && existing.source) || rec.source || 'laser_inspection'
            });
            if (existing) {
                await Storage.update(SB_STORE, existing.id, payload);
                return { id: existing.id, rematched: false, missing: true };
            }
            const added = await Storage.add(SB_STORE, payload);
            return { id: added && added.id, rematched: false, missing: true };
        }

        if (existing) {
            await Storage.update(SB_STORE, existing.id, {
                status: '대기',
                inspectionDate: null,
                laserMatchMissing: false,
                updatedAt: now
            });
            return { id: existing.id, rematched: false, missing: false };
        }

        const added = await Storage.add(SB_STORE, Object.assign(_standbyPayloadFromRec(rec), {
            updatedAt: now,
            laserMatchMissing: false
        }));
        return { id: added && added.id, rematched: false, missing: false };
    }

    async function deleteHistory(id) {
        if (!_canDeleteHistoryPerm()) {
            UIUtils.toast('삭제 권한이 없습니다.', 'warning');
            return;
        }
        const rec = Storage.getById(STORE, id);
        if (!rec) { UIUtils.toast('검사 이력을 찾을 수 없습니다.', 'error'); return; }

        const inbound = _linkedInbound(rec);
        let reliCnt = 0;
        try {
            const reli = (await Storage.getConfigValue('shipping_reliability_records_v1').catch(() => [])) || [];
            reliCnt = (Array.isArray(reli) ? reli : []).filter(r => String(r.inspectionId || '') === String(id)).length;
        } catch (e) { /* ignore */ }

        const previewSb = rec.standbyId ? Storage.getById(SB_STORE, rec.standbyId) : null;
        const tryLaser = _shouldRematchLaser(rec, previewSb);
        const previewMatch = tryLaser ? _findMatchingLaserRecord(rec, previewSb) : null;
        const parts = ['이 출하검사(외관) 이력을 삭제하시겠습니까?', '해당 품목은 출하검사 대기로 복원됩니다.'];
        if (inbound.length) parts.push(`제품 창고 입고 ${inbound.length}건이 함께 취소됩니다.`);
        if (reliCnt) parts.push(`연결된 신뢰성 검사 ${reliCnt}건은 그대로 남습니다.`);
        if (tryLaser && !(previewMatch && (previewMatch.inspection || previewMatch.work))) {
            parts.push('연결된 레이져 실적(작업/검사)이 없습니다. 검사 대기에 「레이져 실적 없음」으로 표시되며, 대기에서 삭제할 수 있습니다.');
        } else if (tryLaser) {
            parts.push('레이져 실적을 차종·품명·날짜·시간으로 다시 맞춰 검사 대기로 복원합니다.');
        }

        UIUtils.confirm(parts.join(' '), async () => {
            let restore = { rematched: false };
            try {
                restore = await _restoreStandbyAfterDelete(rec) || restore;
            } catch (e) {
                console.error('[ShippingInspection] standby restore failed:', e);
                UIUtils.toast('출하검사 대기 복원에 실패했습니다. 이력을 삭제하지 않았습니다.', 'error');
                return;
            }
            for (const row of inbound) {
                if (row && row.id) await Storage.remove(DB.STORES.PRODUCT_INVENTORY, row.id);
            }
            await Storage.remove(STORE, id);
            _closeModal();
            UIUtils.toast(
                restore && restore.rematched
                    ? '삭제되었습니다. 레이져 실적(차종·품명·날짜·시간)과 매칭하여 출하검사 대기로 복원되었습니다.'
                    : restore && restore.missing
                        ? '삭제되었습니다. 레이져 실적이 없어 대기에 「실적 없음」으로 표시했습니다. 대기 목록에서 삭제할 수 있습니다.'
                        : '삭제되었습니다. 출하검사 대기로 복원되었습니다.',
                restore && restore.missing ? 'warning' : 'success'
            );
            if (typeof ShippingStandbyModule !== 'undefined') {
                ShippingStandbyModule.loadData();
                ShippingStandbyModule.loadHistory();
            }
            if (document.getElementById('siStats') && document.getElementById('siTableBody')) search();
        });
    }

    function remove(id) {
        deleteHistory(id);
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = ['검사일', '납품처', '차종', '제품명', '컬러', '도장LOT', '사출LOT', 'LOT수량', '샘플수', '불량수', '판정', '검사자', '비고'];
        const rows = data.map(d => [
            d.date, d.customer||'', d.carModel||'', d.partName||'', d.color||'',
            d.paintingDate||'', d.lotNo||'',
            d.lotSize||0, d.sampleQty||0, d.defectQty||0,
            d.result||'', d.inspector||'', d.note||''
        ]);
        Storage.exportToCSV(headers, rows, '출하검사일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        search,
        openFromStandby,
        addItemRow,
        removeItemRow,
        reloadFromStandard,
        _closeModal,
        _save,
        remove,
        exportData,
        openHistoryView, openHistoryEdit, saveHistoryEdit, deleteHistory,
        addHistoryItemRow, removeHistoryItemRow,
        // 레이져 ↔ 출하검사 대조(감사)에서 재사용
        buildStandbyPayloadFromLaser: _standbyPayloadFromLaser
    };
})();


// ===================================================================
// 제품 창고 (재고관리)
// ===================================================================
const ProductWarehouseModule = (function() {
    const STORE = DB.STORES.PRODUCT_INVENTORY;
    const PW_STOCK_ORDER_KEY = 'pw_stock_car_order_v1';
    const PW_STOCK_SNAP_PX = 56;
    let _pwStockFitBound = false;
    let _pwStockFitRaf = 0;
    let _pwStockOrder = _readPwStockOrder();
    let _pwDrag = null;
    let _pwPaintInspCache = Object.create(null);

    function _emptyPwStockOrder() {
        return { mass: { cols: [] }, as: { cols: [] }, dev: { cols: [] } };
    }

    function _readPwStockOrder() {
        try {
            const raw = localStorage.getItem(PW_STOCK_ORDER_KEY);
            if (!raw) return _emptyPwStockOrder();
            const parsed = JSON.parse(raw);
            return Object.assign(_emptyPwStockOrder(), parsed);
        } catch (e) {
            return _emptyPwStockOrder();
        }
    }

    function _savePwStockOrder() {
        try { localStorage.setItem(PW_STOCK_ORDER_KEY, JSON.stringify(_pwStockOrder)); } catch (e) {}
        try {
            if (typeof Storage !== 'undefined' && typeof Storage.setConfigValue === 'function') {
                Storage.setConfigValue(PW_STOCK_ORDER_KEY, _pwStockOrder);
            }
        } catch (e) {}
    }

    function render(container) {
        const actionCards = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">
                ${ProdAppleMenu.card({ label: '보관창고 레이아웃', subtitle: '완제품·소재 배치도', icon: 'map', accent: '#06b6d4', onClick: 'ProductWarehouseModule.openLayout()' })}
                ${ProdAppleMenu.card({ label: '수동 입고', subtitle: '완제품 창고 입고', icon: 'move_to_inbox', accent: '#10b981', onClick: 'ProductWarehouseModule.openManualInModal()' })}
                ${ProdAppleMenu.card({ label: '수동 출고', subtitle: '완제품 창고 출고', icon: 'outbox', accent: '#f59e0b', onClick: 'ProductWarehouseModule.openManualOutModal()' })}
                ${ProdAppleMenu.card({ label: '재고 실사 반영', subtitle: '엑셀 붙여넣기로 재고 맞춤', icon: 'fact_check', accent: '#8b5cf6', onClick: 'ProductWarehouseModule.openAuditModal()' })}
            </div>`;

        container.innerHTML = `
            <div class="fade-in-up">
                <div id="pwNavStrip" class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    ${[
                        { tab:'stock',    icon:'inventory_2',  title:'재고 현황', sub:'현재 보유 제품 재고', active:true  },
                        { tab:'incoming', icon:'move_to_inbox',title:'입고 이력', sub:'제품 입고 기록',     active:false },
                        { tab:'outgoing', icon:'outbox',       title:'출고 이력', sub:'제품 출고 기록',     active:false }
                    ].map(m => `
                        <button type="button" class="pw-tab-btn${m.active?' pw-tab-active':''}" data-tab="${m.tab}"
                            onclick="ProductWarehouseModule._switchTab('${m.tab}')"
                            style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                                   border:${m.active?'2px solid var(--accent-blue)':'1.5px solid var(--border-color)'};
                                   background:var(--bg-primary);color:var(--text-primary);
                                   cursor:pointer;min-width:160px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                            <span style="display:inline-flex;align-items:center;justify-content:center;
                                         width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                         background:${m.active?'var(--accent-blue)':'var(--bg-secondary)'};">
                                <span class="material-symbols-outlined" style="font-size:24px;color:${m.active?'#fff':'var(--text-muted)'};">${m.icon}</span>
                            </span>
                            <span style="display:flex;flex-direction:column;gap:2px;">
                                <span style="font-size:0.92rem;font-weight:700;">${m.title}</span>
                                <span style="font-size:0.73rem;color:var(--text-muted);">${m.sub}</span>
                            </span>
                        </button>`).join('')}
                    </div>
                    ${actionCards}
                </div>

            <div id="pwTabStock">
                <div class="stat-cards" id="pwStats"></div>
                <div id="pwBlocks"></div>
            </div>
            <div id="pwTabIncoming" style="display:none;"></div>
            <div id="pwTabOutgoing" style="display:none;"></div>
        </div>
        `;
        loadData();
    }

    function openLayout() {
        try { sessionStorage.setItem('mes_layout_back', 'product-warehouse'); } catch (e) {}
        Router.navigate('injection-layout');
    }

    function _switchTab(tab) {
        ['stock', 'incoming', 'outgoing'].forEach(t => {
            const panelEl = document.getElementById(`pwTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (panelEl) panelEl.style.display = t === tab ? '' : 'none';
        });
        document.querySelectorAll('.pw-tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tab;
            btn.style.border = isActive ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)';
            const iconBox = btn.querySelector('span[style*="border-radius:10px"]');
            const icon    = btn.querySelector('.material-symbols-outlined');
            if (iconBox) iconBox.style.background = isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)';
            if (icon)    icon.style.color          = isActive ? '#fff' : 'var(--text-muted)';
        });
        if (tab === 'incoming') _loadIncoming();
        if (tab === 'outgoing') _loadOutgoing();
    }

    function _switchTabOutside(tab) {
        const container = document.getElementById('contentArea');
        if (!container) return;
        ProductWarehouseModule.render(container);
        setTimeout(function () { _switchTab(tab); }, 50);
    }

    function _loadIncoming() {
        const el = document.getElementById('pwTabIncoming');
        if (!el) return;
        _pwPaintInspCache = Object.create(null);
        const data = (Storage.getAll(STORE) || [])
            .filter(d => d.type !== '출고')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const geneRows = data.map(function(d) { return { d: d, g: _pwGenealogy(d) }; });
        const showLaser = geneRows.some(function(row) { return row.g.isLaser || row.g.laserDate; });
        const colCount = showLaser ? 12 : 11;

        const rows = geneRows.length ? geneRows.map(function(row) {
            const d = row.d;
            const g = row.g;
            const laserCell = showLaser
                ? `<td style="white-space:nowrap;">${_pwLaserLotLink(g)}</td>`
                : '';
            return `
            <tr>
                <td style="white-space:nowrap;">${_escapeHtml(d.date || '-')}</td>
                <td style="white-space:nowrap;">${_escapeHtml(d.carModel || '-')}</td>
                <td style="white-space:nowrap;"><strong>${_escapeHtml(d.partName || '-')}</strong></td>
                <td style="white-space:nowrap;">${_escapeHtml(d.color || '-')}</td>
                <td style="text-align:right;white-space:nowrap;font-weight:700;color:var(--accent-green);">+${UIUtils.formatNumber(d.quantity || 0)}</td>
                <td style="white-space:nowrap;">${_pwPaintWorkLink(g)}</td>
                <td style="white-space:nowrap;">${_pwInjLotWithInspCell(g, d.carModel)}</td>
                <td style="white-space:nowrap;">${_pwPaintLotWithInspBySpecCell(g, true)}</td>
                <td style="white-space:nowrap;">${_pwPaintLotWithInspBySpecCell(g, false)}</td>
                <td style="white-space:nowrap;">${_pwPaintUsageCell(g)}</td>
                ${laserCell}
                <td style="white-space:nowrap;font-size:0.82rem;color:var(--text-secondary);">${_escapeHtml(d.source || '-')}</td>
            </tr>`;
        }).join('')
            : `<tr><td colspan="${colCount}" style="text-align:center;padding:40px;color:var(--text-muted);">입고 이력이 없습니다.</td></tr>`;

        el.innerHTML = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">
                            <thead><tr>
                                <th style="white-space:nowrap;">날짜</th>
                                <th style="white-space:nowrap;">차종</th>
                                <th style="white-space:nowrap;">품명</th>
                                <th style="white-space:nowrap;">컬러</th>
                                <th style="text-align:right;white-space:nowrap;">수량</th>
                                <th style="white-space:nowrap;">도장 LOT</th>
                                <th style="white-space:nowrap;">사출 LOT / 수입검사일</th>
                                <th style="white-space:nowrap;">P 도료 LOT / 수입검사일</th>
                                <th style="white-space:nowrap;">C 도료 LOT / 수입검사일</th>
                                <th style="white-space:nowrap;">P/C 사용량</th>
                                ${showLaser ? '<th style="white-space:nowrap;">레이져Lot</th>' : ''}
                                <th style="white-space:nowrap;">출처</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function _loadOutgoing() {
        const el = document.getElementById('pwTabOutgoing');
        if (!el) return;
        const invOut = (Storage.getAll(STORE) || [])
            .filter(d => d.type === '출고')
            .map(d => ({
                date: d.date,
                partName: d.partName,
                carModel: d.carModel,
                color: d.color,
                quantity: d.quantity,
                customer: d.customer || '',
                deliveryTo: d.source || '',
                vehicleNo: d.lotNo || '',
                note: d.source || ''
            }));
        const legacyOut = (Storage.getAll(DB.STORES.PRODUCT_OUTGOING) || [])
            .map(d => ({
                date: d.date,
                partName: d.partName,
                carModel: d.carModel || '',
                color: d.color || '',
                quantity: d.quantity,
                customer: d.customer || '',
                deliveryTo: d.deliveryTo || '',
                vehicleNo: d.vehicleNo || '',
                note: d.note || ''
            }));
        const data = [...invOut, ...legacyOut]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const rows = data.length ? data.map(d => `
            <tr>
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td>${d.carModel ? `${d.carModel} / ` : ''}<strong>${d.partName || '-'}</strong>${d.color ? ` <span style="color:var(--text-muted);font-size:0.78rem;">(${d.color})</span>` : ''}</td>
                <td style="text-align:right;font-weight:700;color:var(--accent-red);">-${UIUtils.formatNumber(d.quantity || 0)}</td>
                <td>${d.customer || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-secondary);">${d.deliveryTo || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.vehicleNo || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-secondary);">${d.note || '-'}</td>
            </tr>`).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">출고 이력이 없습니다.</td></tr>`;

        el.innerHTML = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>출고일</th><th>품명</th>
                                <th style="text-align:right;">수량</th>
                                <th>거래처</th><th>납품처</th><th>차량번호</th><th>비고</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function loadData() {
        const data = Storage.getAll(STORE);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 차종+품명+컬러 기준 재고 집계
        const itemMap = {};  // key: carModel||partName||color
        data.forEach(d => {
            const car   = d.carModel || '';
            const part  = d.partName || '미분류';
            const color = d.color    || '';
            const key   = `${car}||${part}||${color}`;
            if (!itemMap[key]) {
                itemMap[key] = { car, part, color, inQty: 0, outQty: 0, lastDate: '', traceable: false };
            }
            const qty = Number(d.quantity) || 0;
            if (d.type === '출고') itemMap[key].outQty += qty;
            else                   itemMap[key].inQty  += qty;
            if (d.date > itemMap[key].lastDate) itemMap[key].lastDate = d.date;

            // 역추적(도장작업→사출 수입검사일·사용 도료 LOT) 가능 여부 — 확인용 * 표시
            if (!itemMap[key].traceable && d.type !== '출고' && d.standbyId) {
                const work = _findPaintingWorkForInv(d);
                if (work) {
                    const injPartName = work.injPartName || work.partName || part;
                    const inspDates = _injectionInspDatesForLot(injPartName, car, d.lotNo);
                    const paintLots = _paintLotsForPaintingWork(work.id);
                    if (inspDates.length && paintLots.length) itemMap[key].traceable = true;
                }
            }
        });

        const items   = Object.values(itemMap);
        const totalIn  = items.reduce((s, i) => s + i.inQty,  0);
        const totalOut = items.reduce((s, i) => s + i.outQty, 0);
        const totalStock = totalIn - totalOut;
        const zeroCount  = items.filter(i => (i.inQty - i.outQty) <= 0).length;

        // 통계 카드
        const statsEl = document.getElementById('pwStats');
        if (statsEl) statsEl.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${items.length}</div>
                <div class="stat-card-label">품목 수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재고 (EA)</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${UIUtils.formatNumber(totalIn)}</div>
                <div class="stat-card-label">총 입고</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${zeroCount}</div>
                <div class="stat-card-label">재고 없음</div>
            </div>
        `;

        const blocksEl = document.getElementById('pwBlocks');
        if (!blocksEl) return;

        if (!items.length) {
            blocksEl.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">inventory_2</span>
                재고 데이터가 없습니다.</div>`;
            return;
        }

        // 차종별 그룹핑
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const byCarModel = {};
        items.forEach(i => {
            const car = i.car || '차종 미지정';
            if (!byCarModel[car]) byCarModel[car] = [];
            byCarModel[car].push(i);
        });

        const _normItemType = raw => {
            const t = String(raw || '').trim();
            if (!t) return '';
            if (t === '양산품' || t === '양산') return '양산품';
            if (t === 'A/S품' || t === 'A/S') return 'A/S';
            if (t === '개발품' || t === '개발') return '개발품';
            if (/A\/?S/i.test(t)) return 'A/S';
            if (/개발/.test(t)) return '개발품';
            if (/양산/.test(t)) return '양산품';
            return t;
        };
        const _itemTypeRank = t => {
            if (t === '양산품') return 0;
            if (t === 'A/S') return 1;
            if (t === '개발품') return 2;
            return 3;
        };
        // 공백/줄바꿈 표기 차이로 제품마스터 매칭이 실패해 품목구분(양산/A-S/개발) 판정이
        // 틀어지는 사례가 있어 정규화 비교 + 컬러 불일치 시 차종·품명만으로 재시도한다.
        const _normKey = s => String(s || '').trim().replace(/\s+/g, ' ');
        const _findProduct = i => {
            const car = _normKey(i.car), part = _normKey(i.part), color = _normKey(i.color);
            const exact = products.find(p =>
                _normKey(p.carModel) === car && _normKey(p.partName) === part && _normKey(p.color) === color
            );
            if (exact) return exact;
            // 컬러 표기가 다르거나 비어 있어도 차종+품명이 일치하면 그 품목의 구분을 그대로 사용
            return products.find(p => _normKey(p.carModel) === car && _normKey(p.partName) === part);
        };
        const resolveItemType = i => {
            const prod = _findProduct(i);
            if (prod && prod.itemType) return _normItemType(prod.itemType);
            const text = `${i.car || ''} ${i.part || ''} ${i.color || ''}`;
            if (/(^|[^A-Z0-9])A\/?S([^A-Z0-9]|$)/i.test(text) || /애프터|서비스/.test(text)) return 'A/S';
            return '양산품';
        };
        items.forEach(i => { i.itemType = resolveItemType(i); });

        const getCarSection = car => {
            const types = (byCarModel[car] || []).map(i => i.itemType);
            if (types.length && types.every(t => t === 'A/S')) return 'as';
            if (types.length && types.every(t => t === '개발품')) return 'dev';
            return 'mass';
        };

        // 양산품 → A/S → 개발품 차종 분리
        const sortBySize = cars => cars.sort((a, b) =>
            (byCarModel[b].length - byCarModel[a].length) || a.localeCompare(b, 'ko'));
        const allCars = Object.keys(byCarModel);
        const massanCars = sortBySize(allCars.filter(car => getCarSection(car) === 'mass'));
        const asCars     = sortBySize(allCars.filter(car => getCarSection(car) === 'as'));
        const devCars    = sortBySize(allCars.filter(car => getCarSection(car) === 'dev'));

        const _sectionStyle = section => {
            if (section === 'as') return { header: '#475569', label: 'A/S 품목' };
            if (section === 'dev') return { header: '#7c3aed', label: '개발품' };
            return { header: '#2563eb', label: '양산품' };
        };

        function renderCarBlock(car, section) {
            const style = _sectionStyle(section);
            const headerColor = style.header;
            const group = byCarModel[car].sort((a, b) =>
                _itemTypeRank(a.itemType) - _itemTypeRank(b.itemType) ||
                (a.part || '').localeCompare(b.part, 'ko') ||
                (a.color || '').localeCompare(b.color, 'ko')
            );
            const groupTotal = group.reduce((s, i) => s + (i.inQty - i.outQty), 0);

            const rows = group.map(i => {
                const stock = i.inQty - i.outQty;
                const stockColor = stock <= 0
                    ? 'var(--accent-red)'
                    : stock < 50
                    ? 'var(--accent-orange)'
                    : 'var(--accent-green)';
                const keyEnc = encodeURIComponent(`${i.car}||${i.part}||${i.color}`);
                const typeTag = i.itemType === 'A/S'
                    ? '<span style="font-size:0.72em;background:#e2e8f0;color:#64748b;border-radius:3px;padding:0 0.25em;margin-left:0.25em;vertical-align:middle;">A/S</span>'
                    : i.itemType === '개발품'
                    ? '<span style="font-size:0.72em;background:#ede9fe;color:#7c3aed;border-radius:3px;padding:0 0.25em;margin-left:0.25em;vertical-align:middle;">개발</span>'
                    : '';
                // 임시 확인용 표시 — 도장작업→사출 수입검사일·사용 도료 LOT 역추적 체인이 정상 동작하는 품목
                const traceMark = i.traceable
                    ? '<span title="역추적 가능: 상세 모달에서 사출 LOT 수입검사일 · 사용 도료 LOT 확인됨" style="color:var(--accent-blue);font-weight:800;margin-left:2px;cursor:help;">*</span>'
                    : '';
                return `
                <tr onclick="ProductWarehouseModule._showHistory('${keyEnc}', event)"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td class="pw-col-part">
                        <span class="pw-part-name-text" title="${_escapeHtml(i.part)}">${_escapeHtml(i.part)}${traceMark}${typeTag}</span>
                    </td>
                    <td class="pw-col-short pw-col-color">${_escapeHtml(i.color || '')}</td>
                    <td class="pw-col-short pw-col-stock">
                        <span class="pw-stock-qty" style="color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                        <span class="pw-stock-ea">EA</span>
                    </td>
                    <td class="pw-col-short pw-col-date">${i.lastDate || ''}</td>
                </tr>`;
            }).join('');

            return `<div class="pw-stock-card" data-car="${encodeURIComponent(car)}" data-section="${section}">
                <div class="pw-stock-head" style="background:${headerColor};">
                    <span class="pw-stock-head-left">
                        <span class="material-symbols-outlined pw-stock-drag-handle" title="드래그하여 위치 이동">drag_indicator</span>
                        <span class="material-symbols-outlined">directions_car</span>
                        ${_escapeHtml(car)}
                        <span class="pw-stock-head-meta">${group.length}종</span>
                    </span>
                    <div class="pw-stock-head-stock">재고 ${UIUtils.formatNumber(groupTotal)} EA</div>
                </div>
                <table class="pw-stock-table">
                    <thead><tr>
                        <th class="pw-col-part" style="text-align:left;">품명</th>
                        <th class="pw-col-short" style="text-align:left;">컬러</th>
                        <th class="pw-col-short" style="text-align:right;">재고</th>
                        <th class="pw-col-short">최근일자</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        function sectionDivider(text, count, color) {
            return `<div class="pw-section-head">
                <span class="material-symbols-outlined" style="font-size:1.15em;color:${color};">directions_car</span>
                <span style="font-size:0.95em;font-weight:400;color:${color};letter-spacing:0.5px;">${text}</span>
                <span style="font-size:0.88em;color:var(--text-muted);font-weight:400;">${count}개 차종</span>
                <div style="flex:1;height:1px;background:#e2e8f0;"></div>
            </div>`;
        }

        // 화면 너비에 맞춰 열 수를 정하고, 열 폭을 균등 분배(flex:1)한다.
        // 예전 columns:280px 는 남는 폭을 비워 두어 오른쪽이 휑했다.
        function _stockColCount(itemCount) {
            return _pwStockColCount(itemCount, blocksEl);
        }

        function _layoutCols(cars, section, colCount) {
            const savedCols = (_pwStockOrder[section] && Array.isArray(_pwStockOrder[section].cols))
                ? _pwStockOrder[section].cols : [];
            const carSet = new Set(cars);
            if (savedCols.length === colCount) {
                const cols = savedCols.map(function(list) {
                    return (list || []).filter(function(c) { return carSet.has(c); });
                });
                while (cols.length < colCount) cols.push([]);
                const used = new Set();
                cols.forEach(function(list) { list.forEach(function(c) { used.add(c); }); });
                cars.forEach(function(car) {
                    if (used.has(car)) return;
                    const heights = cols.map(function(list) {
                        return list.reduce(function(s, name) {
                            return s + ((byCarModel[name] || []).length || 1);
                        }, 0);
                    });
                    const minIdx = heights.indexOf(Math.min.apply(null, heights));
                    cols[minIdx].push(car);
                });
                return cols;
            }
            const ordered = [];
            savedCols.forEach(function(list) {
                (list || []).forEach(function(c) {
                    if (carSet.has(c) && ordered.indexOf(c) < 0) ordered.push(c);
                });
            });
            cars.forEach(function(c) { if (ordered.indexOf(c) < 0) ordered.push(c); });
            const cols = Array.from({ length: colCount }, function() { return []; });
            const heights = Array(colCount).fill(0);
            ordered.forEach(function(car) {
                const size = (byCarModel[car] || []).length || 1;
                const minIdx = heights.indexOf(Math.min.apply(null, heights));
                cols[minIdx].push(car);
                heights[minIdx] += size + 1;
            });
            return cols;
        }

        function _packCarBlocks(cars, section) {
            const colCount = _stockColCount(cars.length);
            const cols = _layoutCols(cars, section, colCount);
            return `<div class="pw-stock-board" data-section="${section}" data-cols="${colCount}">
                ${cols.map(function(colCars, idx) {
                    return `<div class="pw-stock-col" data-col="${idx}">${
                        colCars.map(function(car) { return renderCarBlock(car, section); }).join('')
                    }</div>`;
                }).join('')}
            </div>`;
        }

        let html = '';
        let prevSection = false;

        function appendSection(section, cars) {
            if (!cars.length) return;
            const style = _sectionStyle(section);
            if (prevSection) html += '<div style="margin-top:20px;">';
            html += sectionDivider(style.label, cars.length, style.header);
            html += _packCarBlocks(cars, section);
            if (prevSection) html += '</div>';
            prevSection = true;
        }

        appendSection('mass', massanCars);
        appendSection('as', asCars);
        appendSection('dev', devCars);

        blocksEl.innerHTML = html;
        _bindPwStockFit();
        _bindPwStockDrag(blocksEl);
        blocksEl.querySelectorAll('.pw-stock-board').forEach(function(board) {
            const want = Number(board.dataset.cols) || 0;
            const section = board.getAttribute('data-section') || 'mass';
            const saved = (_pwStockOrder[section] && _pwStockOrder[section].cols) || [];
            if (saved.length !== want) _pwCaptureBoardLayout(board);
        });
        _scheduleFitPwStockPartNames();
    }

    function _fitFontToWidth(el, avail, basePx) {
        const base = basePx || parseFloat(window.getComputedStyle(el).fontSize) || 13;
        el.style.fontSize = base + 'px';
        if (el.scrollWidth <= avail + 0.5) return;
        let lo = 8;
        let hi = base;
        let best = 8;
        for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            el.style.fontSize = mid + 'px';
            if (el.scrollWidth <= avail + 0.5) {
                best = mid;
                lo = mid;
            } else {
                hi = mid;
            }
        }
        el.style.fontSize = best + 'px';
    }

    function _fitOnePwStockCard(card) {
        const table = card.querySelector('.pw-stock-table');
        if (!table) return;
        const oldGroup = table.querySelector('colgroup');
        if (oldGroup) oldGroup.remove();
        card.style.fontSize = '';
        table.style.tableLayout = 'auto';
        table.style.width = 'max-content';

        const avail = card.clientWidth;
        const base = parseFloat(window.getComputedStyle(card).fontSize) || 13;
        if (table.scrollWidth > avail + 0.5) {
            let lo = 8;
            let hi = base;
            let best = 8;
            for (let i = 0; i < 12; i++) {
                const mid = (lo + hi) / 2;
                card.style.fontSize = mid + 'px';
                if (table.scrollWidth <= avail + 0.5) {
                    best = mid;
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            card.style.fontSize = best + 'px';
        }
        table.style.width = '100%';
        const head = card.querySelector('.pw-stock-head');
        if (head) _fitFontToWidth(head, avail);
    }

    function _fitPwStockPartNames() {
        const root = document.getElementById('pwBlocks');
        if (!root) return;
        root.querySelectorAll('.pw-stock-card').forEach(_fitOnePwStockCard);
        root.querySelectorAll('.pw-section-head').forEach(function (el) {
            const parent = el.parentElement || root;
            _fitFontToWidth(el, parent.clientWidth);
        });
    }

    function _scheduleFitPwStockPartNames() {
        if (_pwStockFitRaf) cancelAnimationFrame(_pwStockFitRaf);
        _pwStockFitRaf = requestAnimationFrame(function () {
            _pwStockFitRaf = 0;
            _fitPwStockPartNames();
        });
    }

    function _bindPwStockFit() {
        if (_pwStockFitBound) return;
        _pwStockFitBound = true;
        window.addEventListener('resize', function() {
            _pwMaybeReflowBoards();
            _scheduleFitPwStockPartNames();
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                _pwMaybeReflowBoards();
                _scheduleFitPwStockPartNames();
            });
        }
    }

    function _pwStockColCount(itemCount, host) {
        const n = Math.max(1, itemCount || 1);
        const el = host || document.getElementById('pwBlocks');
        const box = (el && (el.parentElement || el)) || document.body;
        const avail = Math.max(280, (box.clientWidth || window.innerWidth || 1200) - 24);
        const byWidth = Math.max(1, Math.floor(avail / 260));
        return Math.max(1, Math.min(n, byWidth, 6));
    }

    function _pwMaybeReflowBoards() {
        if (_pwDrag) return;
        const root = document.getElementById('pwBlocks');
        if (!root) return;
        let changed = false;
        root.querySelectorAll('.pw-stock-board').forEach(function(board) {
            const n = board.querySelectorAll('.pw-stock-card').length;
            const want = _pwStockColCount(n, root);
            const have = Number(board.dataset.cols) || 0;
            if (want !== have) changed = true;
        });
        if (changed) loadData();
    }

    function _pwCarName(card) {
        try { return decodeURIComponent(card.getAttribute('data-car') || ''); }
        catch (e) { return card.getAttribute('data-car') || ''; }
    }

    function _pwCaptureBoardLayout(board) {
        if (!board) return;
        const section = board.getAttribute('data-section') || 'mass';
        const cols = Array.prototype.map.call(board.querySelectorAll('.pw-stock-col'), function(col) {
            return Array.prototype.map.call(col.querySelectorAll('.pw-stock-card'), function(card) {
                return _pwCarName(card);
            }).filter(Boolean);
        });
        _pwStockOrder[section] = { cols: cols };
        _savePwStockOrder();
    }

    function _pwMagnetTarget(board, x, y, draggingCard) {
        const cols = Array.prototype.slice.call(board.querySelectorAll('.pw-stock-col'));
        if (!cols.length) return null;
        let bestCol = cols[0];
        let bestDx = Infinity;
        cols.forEach(function(col) {
            const r = col.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const dx = Math.abs(x - cx);
            if (dx < bestDx) {
                bestDx = dx;
                bestCol = col;
            }
        });
        const cards = Array.prototype.filter.call(bestCol.querySelectorAll('.pw-stock-card'), function(c) {
            return c !== draggingCard && !c.classList.contains('pw-stock-ghost');
        });
        let before = null;
        for (let i = 0; i < cards.length; i++) {
            const r = cards[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) {
                before = cards[i];
                break;
            }
        }
        return { col: bestCol, before: before };
    }

    function _pwPlacePlaceholder(placeholder, target) {
        if (!target || !placeholder) return;
        if (target.before && target.before.parentNode === target.col) {
            if (target.before.previousSibling === placeholder) return;
            target.col.insertBefore(placeholder, target.before);
        } else if (placeholder.parentNode !== target.col || placeholder.nextSibling) {
            target.col.appendChild(placeholder);
        }
    }

    function _endPwStockDrag(commit) {
        const drag = _pwDrag;
        _pwDrag = null;
        if (!drag) return;
        document.body.classList.remove('pw-stock-is-dragging');
        window.removeEventListener('pointermove', _onPwStockDragMove);
        window.removeEventListener('pointerup', _onPwStockDragUp);
        window.removeEventListener('pointercancel', _onPwStockDragUp);
        window.removeEventListener('keydown', _onPwStockDragKey);

        const card = drag.card;
        const ghost = drag.ghost;
        const placeholder = drag.placeholder;
        if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
        card.classList.remove('is-dragging');
        card.style.width = '';
        if (commit && placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(card, placeholder);
            _pwCaptureBoardLayout(drag.board);
            _pwSuppressNextClick();
        }
        if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
        _scheduleFitPwStockPartNames();
    }

    function _pwSuppressNextClick() {
        const stop = function(e) {
            e.stopPropagation();
            e.preventDefault();
            document.removeEventListener('click', stop, true);
        };
        document.addEventListener('click', stop, true);
        setTimeout(function() {
            document.removeEventListener('click', stop, true);
        }, 400);
    }

    function _onPwStockDragMove(event) {
        const drag = _pwDrag;
        if (!drag) return;
        if (!drag.started) {
            const dist = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (dist < 6) return;
            drag.started = true;
            const card = drag.card;
            const rect = card.getBoundingClientRect();
            drag.offsetX = event.clientX - rect.left;
            drag.offsetY = event.clientY - rect.top;
            drag.width = rect.width;
            drag.height = rect.height;
            const placeholder = document.createElement('div');
            placeholder.className = 'pw-stock-placeholder';
            placeholder.style.height = rect.height + 'px';
            card.parentNode.insertBefore(placeholder, card);
            drag.placeholder = placeholder;
            const ghost = card.cloneNode(true);
            ghost.classList.add('pw-stock-ghost');
            ghost.style.width = rect.width + 'px';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = rect.top + 'px';
            document.body.appendChild(ghost);
            drag.ghost = ghost;
            card.classList.add('is-dragging');
            document.body.classList.add('pw-stock-is-dragging');
        }

        const target = _pwMagnetTarget(drag.board, event.clientX, event.clientY, drag.card);
        _pwPlacePlaceholder(drag.placeholder, target);

        const followX = event.clientX - drag.offsetX;
        const followY = event.clientY - drag.offsetY;
        const ph = drag.placeholder.getBoundingClientRect();
        const gx = followX + drag.width / 2;
        const gy = followY + drag.height / 2;
        const px = ph.left + ph.width / 2;
        const py = ph.top + ph.height / 2;
        const snapped = Math.hypot(gx - px, gy - py) <= PW_STOCK_SNAP_PX;
        const ghost = drag.ghost;
        if (snapped) {
            ghost.style.left = ph.left + 'px';
            ghost.style.top = ph.top + 'px';
            ghost.style.width = ph.width + 'px';
            ghost.classList.add('is-snapped');
        } else {
            ghost.style.left = followX + 'px';
            ghost.style.top = followY + 'px';
            ghost.style.width = drag.width + 'px';
            ghost.classList.remove('is-snapped');
        }
    }

    function _onPwStockDragUp(event) {
        if (event) event.preventDefault();
        _endPwStockDrag(!!(_pwDrag && _pwDrag.started));
    }

    function _onPwStockDragKey(event) {
        if (event.key === 'Escape') _endPwStockDrag(false);
    }

    function _bindPwStockDrag(root) {
        if (!root) return;
        root.querySelectorAll('.pw-stock-card .pw-stock-head').forEach(function(head) {
            if (head.dataset.pwDragBound === '1') return;
            head.dataset.pwDragBound = '1';
            head.addEventListener('pointerdown', function(event) {
                if (event.button != null && event.button !== 0) return;
                const card = head.closest('.pw-stock-card');
                const board = head.closest('.pw-stock-board');
                if (!card || !board) return;
                event.preventDefault();
                try { head.setPointerCapture(event.pointerId); } catch (e) {}
                _pwDrag = {
                    card: card,
                    board: board,
                    startX: event.clientX,
                    startY: event.clientY,
                    started: false,
                    ghost: null,
                    placeholder: null,
                    offsetX: 0,
                    offsetY: 0,
                    width: 0,
                    height: 0
                };
                window.addEventListener('pointermove', _onPwStockDragMove);
                window.addEventListener('pointerup', _onPwStockDragUp);
                window.addEventListener('pointercancel', _onPwStockDragUp);
                window.addEventListener('keydown', _onPwStockDragKey);
            });
        });
    }

    function _productInvRoute(d) {
        const src = String((d && d.source) || '').trim();
        if (d && d.type === '출고') {
            if (/수동 출고/.test(src)) return { label: '수동출고', color: '#dc2626', detail: src || '수동 출고' };
            return { label: '출고', color: '#dc2626', detail: src || '제품 출고' };
        }
        if (/출하검사|검사 합격/.test(src)) {
            return { label: '출하검사', color: '#7c3aed', detail: src || '검사 합격 입고' };
        }
        if (/수동 입고/.test(src)) {
            return { label: '수동입고', color: '#0891b2', detail: src || '수동 입고' };
        }
        if (/수량 보정/.test(src)) {
            return { label: '보정', color: '#0891b2', detail: src || '수량 보정' };
        }
        if (/일괄|보정|수정/.test(src)) {
            return { label: '보정', color: '#0891b2', detail: src || '재고 보정' };
        }
        return { label: '입고', color: '#16a34a', detail: src || '제품 입고' };
    }

    function _shippingNorm(v) { return String(v || '').trim(); }

    function _shippingProductMatch(rec, car, part, color) {
        if (_shippingNorm(rec.carModel) !== _shippingNorm(car)) return false;
        if (_shippingNorm(rec.partName) !== _shippingNorm(part)) return false;
        const rc = _shippingNorm(rec.color);
        const tc = _shippingNorm(color);
        if (tc && rc && rc !== tc) return false;
        return true;
    }

    async function _loadReliRecords() {
        const rows = (await Storage.getConfigValue('shipping_reliability_records_v1').catch(() => ([]))) || [];
        return Array.isArray(rows) ? rows : [];
    }

    function _buildShippingStatus(car, part, color, reliRecords) {
        const dailyAll = (Storage.getAll(DB.STORES.SHIPPING_INSPECTIONS) || [])
            .filter(d => _shippingProductMatch(d, car, part, color))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const reliAll = (reliRecords || [])
            .filter(d => _shippingProductMatch(d, car, part, color))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const dailyPass = dailyAll.find(d => (d.result || '') === '합격') || null;
        const reliPass = reliAll.find(d => (d.verdict || '') === '합격') || null;
        return { dailyAll, reliAll, dailyPass, reliPass, eligible: !!(dailyPass && reliPass) };
    }

    async function getShippingReadiness(car, part, color) {
        const reliRecords = await _loadReliRecords();
        return _buildShippingStatus(car, part, color, reliRecords);
    }

    function _shippingResultBadge(result) {
        const tone = result === '합격' ? 'badge-success' : result === '불합격' ? 'badge-danger' : result === '보류' ? 'badge-warning' : 'badge-secondary';
        return `<span class="badge ${tone}">${_escapeHtml(result || '-')}</span>`;
    }

    function _shippingVerdictBadge(verdict) {
        const tone = verdict === '합격' ? 'badge-success' : verdict === '불합격' ? 'badge-danger' : verdict === '진행중' ? 'badge-warning' : 'badge-secondary';
        return `<span class="badge ${tone}">${_escapeHtml(verdict || '진행중')}</span>`;
    }

    function _buildShippingStatusSection(status) {
        const eligible = status.eligible;
        const bg = eligible ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)';
        const border = eligible ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)';
        const dailyOk = !!status.dailyPass;
        const reliOk = !!status.reliPass;
        const miss = [];
        if (!dailyOk) miss.push('출하검사(외관)');
        if (!reliOk) miss.push('출하검사(신뢰성)');
        return `
            <div style="margin-bottom:16px;padding:12px 16px;border-radius:10px;border:1px solid ${border};background:${bg};">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:${eligible ? 'var(--accent-green)' : 'var(--accent-orange)'};">local_shipping</span>
                        <strong style="font-size:0.92rem;">출하 가능 여부</strong>
                    </div>
                    <span class="badge ${eligible ? 'badge-success' : 'badge-warning'}" style="font-size:0.82rem;">${eligible ? '출하 가능' : '출하 불가'}</span>
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.65;">
                    <strong>출하검사(외관)</strong>: ${dailyOk
                        ? `합격 완료 <span style="color:var(--text-muted);">(${(status.dailyPass.date || '').slice(0, 10)})</span>`
                        : '<span style="color:var(--accent-orange);font-weight:600;">미완료</span>'}
                    &nbsp;|&nbsp;
                    <strong>출하검사(신뢰성)</strong>: ${reliOk
                        ? `합격 완료 <span style="color:var(--text-muted);">(${(status.reliPass.date || '').slice(0, 10)})</span>`
                        : '<span style="color:var(--accent-orange);font-weight:600;">미완료</span>'}
                </div>
                ${!eligible ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--accent-orange);">${miss.join(' · ')} 합격 완료 후 출하할 수 있습니다.</div>` : ''}
            </div>`;
    }

    function _pwQtyOrDash(n) {
        const v = Number(n) || 0;
        return v ? UIUtils.formatNumber(v) : '-';
    }

    function _pwInspPaintLot(d) {
        return String((d && (d.paintLot || d.paintingDate)) || '').trim();
    }

    function _buildDailyInspSection(dailyAll) {
        const rows = dailyAll.length ? dailyAll.map(function(d) {
            const paintLot = _pwInspPaintLot(d) || '-';
            const click = d.id
                ? `onclick="ProductWarehouseModule.openInspTracePopup('${_jsAttr(d.id)}')"`
                : '';
            return `
            <tr ${click} style="cursor:${d.id ? 'pointer' : 'default'};"
                onmouseover="this.style.background='var(--bg-secondary)'"
                onmouseout="this.style.background=''">
                <td style="white-space:nowrap;">${(d.date || '-').slice(0, 10)}</td>
                <td style="white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.82rem;">${_escapeHtml(paintLot)}</td>
                <td style="text-align:right;white-space:nowrap;">${UIUtils.formatNumber(Number(d.lotSize) || 0)}</td>
                <td style="text-align:center;white-space:nowrap;">${_pwQtyOrDash(d.sampleQty)}</td>
                <td style="text-align:center;white-space:nowrap;">${_pwQtyOrDash(d.defectQty)}</td>
                <td style="text-align:center;white-space:nowrap;">${_shippingResultBadge(d.result)}</td>
                <td style="white-space:nowrap;">${_escapeHtml(d.inspector || '-')}</td>
            </tr>`;
        }).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">출하검사(외관) 이력이 없습니다.</td></tr>`;
        return `
            <div style="margin-top:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-purple,#7c3aed);">verified</span>
                <strong style="font-size:0.86rem;">출하검사(외관) 이력</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">${dailyAll.length}건</span>
            </div>
            <div style="overflow-x:auto;margin-bottom:4px;">
                <table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">
                    <thead><tr>
                        <th style="white-space:nowrap;">출하검사일</th>
                        <th style="white-space:nowrap;">도장 LOT</th>
                        <th style="text-align:right;white-space:nowrap;">LOT 수량</th>
                        <th style="text-align:center;white-space:nowrap;">샘플</th>
                        <th style="text-align:center;white-space:nowrap;">불량</th>
                        <th style="text-align:center;white-space:nowrap;">판정</th>
                        <th style="white-space:nowrap;">검사자</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    function _buildReliSection(reliAll) {
        const rows = reliAll.length ? reliAll.map(r => `
            <tr>
                <td style="white-space:nowrap;">${(r.date || '-').slice(0, 10)}</td>
                <td style="font-family:monospace;font-size:0.82rem;">${_escapeHtml(r.lotNo || '-')}</td>
                <td style="text-align:center;">${_shippingVerdictBadge(r.verdict)}</td>
                <td>${_escapeHtml(r.inspector || '-')}</td>
                <td style="color:var(--text-muted);font-size:0.82rem;">${_escapeHtml(r.note || '')}</td>
            </tr>`).join('')
            : `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">출하검사(신뢰성) 이력이 없습니다.</td></tr>`;
        return `
            <div style="margin-top:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-green);">science</span>
                <strong style="font-size:0.86rem;">출하검사(신뢰성) 이력</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">${reliAll.length}건</span>
            </div>
            <div style="overflow-x:auto;margin-bottom:4px;">
                <table class="data-table">
                    <thead><tr>
                        <th>시험일</th><th>LOT</th>
                        <th style="text-align:center;">종합판정</th>
                        <th>검사자</th><th>비고</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    // ── LOT 역추적: 제품창고 LOT(사출 LOT) → 도장작업 → 사출 수입검사일 / 사용 도료 LOT ──
    // 제품창고 입고 기록의 standbyId(출하검사대기 id) → paintingWorkId(도장 작업 id)를 거쳐
    // 도장 작업이 실제 사용한 사출 LOT(injPartName)과 배합실 대장(paint_mix, workId로 연결)을 찾는다.
    function _findPaintingWorkForInv(rec) {
        if (!rec || !rec.standbyId) return null;
        const sb = Storage.getById(DB.STORES.SHIPPING_STANDBY, rec.standbyId);
        if (!sb || !sb.paintingWorkId) return null;
        return Storage.getById(DB.STORES.PAINTING_WORK, sb.paintingWorkId) || null;
    }

    // 사출 LOT(lotNo) + 사출품명(injPartName) + 차종으로 사출 수입검사 이력에서 검사일을 찾는다.
    function _injectionInspDatesForLot(injPartName, carModel, lotNo) {
        if (!lotNo) return [];
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const dates = new Set();
        inspections.forEach(d => {
            if (injPartName && d.partName !== injPartName) return;
            if (carModel && d.carModel && d.carModel !== carModel) return;
            const lotList = (Array.isArray(d.lots) && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo }] : []);
            if (lotList.some(l => String(l.lotNo || '') === String(lotNo))) dates.add(d.date || '');
        });
        return [...dates].filter(Boolean).sort();
    }

    // 도장 작업(workId)에 연결된 배합실 대장(paint_mix)에서 실제 사용한 도료명+제조LOT 목록을 찾는다.
    function _paintLotsForPaintingWork(workId) {
        if (!workId) return [];
        const mixes = (Storage.getAll(DB.STORES.PROD_CONDITIONS) || [])
            .filter(m => m._docKind === 'paint_mix' && m.workId === workId);
        const out = [];
        mixes.forEach(m => (m.usages || []).forEach(u => {
            const lot = u.prodLot || u.lotNo || '';
            if (!lot) return;
            const label = u.paintName ? `${u.paintName}(${lot})` : lot;
            if (!out.includes(label)) out.push(label);
        }));
        return out;
    }

    function _pwSplitLots(value) {
        return String(value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    function _jsAttr(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function _pwMutedDash() {
        return '<span style="color:var(--text-muted);">-</span>';
    }

    function _pwClickLink(label, onclick, title) {
        const text = String(label || '').trim();
        if (!text || text === '-') return _pwMutedDash();
        const html = _escapeHtml(text);
        if (!onclick) {
            return `<span>${html}</span>`;
        }
        return `<a href="javascript:void(0)" class="pw-trace-link"
            onclick="event.preventDefault();event.stopPropagation();${onclick}"
            title="${_escapeHtml(title || '새창에서 해당 실적 보기')}">${html}</a>`;
    }

    function _pwJoinLinks(parts) {
        const list = (parts || []).filter(Boolean);
        return list.length ? list.join(', ') : _pwMutedDash();
    }

    function _pwIsLaserProcessName(value) {
        return /레이[저져]|laser/i.test(String(value || ''));
    }

    function _pwIsLaserProduct(car, part, color) {
        if (_pwIsLaserProcessName(part)) return true;
        const carN = String(car || '').trim();
        const partN = String(part || '').trim();
        const colorN = String(color || '').trim();
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.some(function(p) {
            if (String(p.carModel || '').trim() !== carN) return false;
            if (String(p.partName || '').trim() !== partN) return false;
            if (colorN && p.color && String(p.color || '').trim() !== colorN) return false;
            return [p.process1, p.process2, p.process3, p.process4].some(_pwIsLaserProcessName);
        });
    }

    function _pwLotEquals(a, b) {
        const na = String(a || '').replace(/\s+/g, '');
        const nb = String(b || '').replace(/\s+/g, '');
        if (!na || !nb) return false;
        if (na === nb) return true;
        const da = na.replace(/\D/g, '');
        const db = nb.replace(/\D/g, '');
        return !!(da && db && da.length >= 4 && da === db);
    }

    function _pwNormPaintName(value) {
        return String(value || '').replace(/\s+/g, '').toLowerCase();
    }

    function _pwInspLotList(d) {
        if (Array.isArray(d.lots) && d.lots.length) {
            return d.lots.map(function(l) { return String(l.lotNo || '').trim(); }).filter(Boolean);
        }
        if (d.lotNo) return _pwSplitLots(d.lotNo);
        return [];
    }

    function _injectionInspHitsForLot(injPartName, carModel, lotNo) {
        if (!lotNo) return [];
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const hits = [];
        inspections.forEach(function(d) {
            const lotList = _pwInspLotList(d);
            if (!lotList.some(function(l) { return _pwLotEquals(l, lotNo); })) return;
            let score = 10;
            if (carModel && String(d.carModel || '').trim() === String(carModel).trim()) score += 6;
            if (injPartName && String(d.partName || '').trim() === String(injPartName).trim()) score += 4;
            hits.push({ id: d.id, date: d.date || '', score: score, rec: d });
        });
        hits.sort(function(a, b) { return b.score - a.score || String(b.date).localeCompare(String(a.date)); });
        const tight = hits.filter(function(h) { return h.score >= 16; });
        return (tight.length ? tight : hits).map(function(h) { return { id: h.id, date: h.date }; });
    }

    function _pwLookupPaintIncoming(name, prodLot, materialId) {
        const lot = String(prodLot || '').trim();
        const res = { inspId: '', inspDate: '' };
        if (!lot) return res;
        const cacheKey = String(materialId || '') + '|' + _pwNormPaintName(name) + '|' + lot;
        if (_pwPaintInspCache[cacheKey]) return _pwPaintInspCache[cacheKey];
        if (_pwPaintInspCache[lot] && _pwPaintInspCache[lot].inspId) {
            const cached = _pwPaintInspCache[lot];
            _pwPaintInspCache[cacheKey] = cached;
            return cached;
        }

        if (materialId && typeof Trace !== 'undefined' && Trace.resolvePaintInspection) {
            const insp = Trace.resolvePaintInspection(materialId, lot);
            if (insp && (insp.inspId || insp.inspDate)) {
                res.inspId = String(insp.inspId || '').trim();
                res.inspDate = String(insp.inspDate || '').slice(0, 10);
            }
        }

        if (!res.inspId) {
            const inbounds = (Storage.getAll(DB.STORES.PAINT_INVENTORY) || []).filter(function(r) {
                if (!r || r.type === '출고') return false;
                const rk = String(r.prodLot || '').trim();
                const rLot = String(r.lotNo || '').trim();
                if (!_pwLotEquals(rk, lot) && !_pwLotEquals(rLot, lot)) return false;
                if (materialId && r.materialId && String(r.materialId) !== String(materialId)) return false;
                return !!(r.sourceInspectionId || r.inspDate);
            }).sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            if (inbounds[0]) {
                res.inspDate = res.inspDate || String(inbounds[0].inspDate || '').slice(0, 10);
                res.inspId = String(inbounds[0].sourceInspectionId || '').trim();
                if (res.inspId && !res.inspDate) {
                    const linked = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, res.inspId);
                    if (linked) res.inspDate = String(linked.date || '').slice(0, 10);
                }
            }
        }

        if (!res.inspId) {
            const nameN = _pwNormPaintName(name);
            const inspections = (Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || []).filter(function(insp) {
                const inspLot = String(insp.lotNo || insp.prodLot || '').trim();
                if (!_pwLotEquals(inspLot, lot)) return false;
                if (!nameN) return true;
                const inspName = _pwNormPaintName(insp.paintName);
                if (!inspName) return true;
                return inspName === nameN || inspName.indexOf(nameN) >= 0 || nameN.indexOf(inspName) >= 0;
            }).sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            if (inspections[0]) {
                res.inspId = String(inspections[0].id || '').trim();
                res.inspDate = String(inspections[0].date || '').slice(0, 10);
            }
        }

        _pwPaintInspCache[cacheKey] = res;
        if (res.inspId) _pwPaintInspCache[lot] = res;
        return res;
    }

    function _findPaintingWorkByLot(rec) {
        if (!rec) return null;
        const day = String(rec.paintingDate || rec.paintLot || '').slice(0, 10);
        const car = String(rec.carModel || '').trim();
        const color = String(rec.color || '').trim();
        const lots = _pwSplitLots(rec.lotNo || rec.injectionLot);
        const works = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const cands = works.filter(function(w) {
            if (car && String(w.carModel || '').trim() && String(w.carModel || '').trim() !== car) return false;
            if (day && String(w.date || '').slice(0, 10) !== day) return false;
            if (color && String(w.color || '').trim() && String(w.color || '').trim() !== color) return false;
            if (lots.length && Array.isArray(w.lots) && w.lots.length) {
                return w.lots.some(function(l) { return lots.indexOf(String(l.lotNo || '').trim()) >= 0; });
            }
            return !!day;
        });
        if (!cands.length) return null;
        cands.sort(function(a, b) {
            return String(b.registeredAt || b.date || '').localeCompare(String(a.registeredAt || a.date || ''));
        });
        return cands[0];
    }

    function _pwResolvePaintSpec(name, materialId, hint) {
        const h = String(hint || '').trim();
        if (h === 'Primer' || h === 'Color' || h === 'Clear') return h;
        if (materialId && typeof Storage !== 'undefined') {
            const mat = Storage.getById(DB.STORES.PAINT_MATERIALS, materialId);
            const spec = String((mat && (mat.paintSpec || mat.spec)) || '').trim();
            if (spec === 'Primer' || spec === 'Color' || spec === 'Clear') return spec;
        }
        const n = String(name || '').toLowerCase();
        if (/primer|프라이머|하도/.test(n)) return 'Primer';
        if (/clear|클리어|상도/.test(n)) return 'Clear';
        return 'Color';
    }

    function _paintLotDetailsForWork(work) {
        const out = [];
        const seen = {};
        function push(name, prodLot, inspDate, inspId, materialId, extra) {
            extra = extra || {};
            const lot = String(prodLot || '').trim();
            if (!lot) return;
            const key = String(name || '') + '|' + lot;
            if (seen[key]) {
                const prev = out.find(function(m) { return (m.name || '') + '|' + m.prodLot === key; });
                if (prev) {
                    if (!prev.inspId && inspId) {
                        prev.inspId = String(inspId || '').trim();
                        prev.inspDate = prev.inspDate || String(inspDate || '').slice(0, 10);
                    }
                    if (!prev.materialId && materialId) prev.materialId = String(materialId || '').trim();
                    if (!prev.paintSpec && extra.paintSpec) prev.paintSpec = extra.paintSpec;
                    if (!prev.mixDate && extra.mixDate) prev.mixDate = String(extra.mixDate || '').slice(0, 10);
                    if (!prev.mixId && extra.mixId) prev.mixId = String(extra.mixId || '').trim();
                    if (!prev.role && extra.role) prev.role = extra.role;
                    if (extra.usageG) prev.usageG = (Number(prev.usageG) || 0) + (Number(extra.usageG) || 0);
                }
                return;
            }
            seen[key] = true;
            out.push({
                name: String(name || '').trim(),
                prodLot: lot,
                inspDate: String(inspDate || '').slice(0, 10),
                inspId: String(inspId || '').trim(),
                materialId: String(materialId || '').trim(),
                paintSpec: extra.paintSpec || '',
                mixDate: String(extra.mixDate || '').slice(0, 10),
                mixId: String(extra.mixId || '').trim(),
                role: extra.role || '',
                usageG: Number(extra.usageG) || 0
            });
        }
        const t = (typeof Trace !== 'undefined') ? Trace.of(work) : {};
        const mats = (t.paint && Array.isArray(t.paint.materials)) ? t.paint.materials : [];
        mats.forEach(function(m) {
            push(m.name, m.prodLot, m.inspDate, m.inspId, m.materialId, {
                paintSpec: m.paintSpec,
                mixId: t.paint && t.paint.mixId,
                role: m.role
            });
        });
        const workId = work && work.id;
        if (workId) {
            const mixes = (Storage.getAll(DB.STORES.PROD_CONDITIONS) || [])
                .filter(function(m) { return m._docKind === 'paint_mix' && m.workId === workId; });
            mixes.forEach(function(m) {
                const mixDate = String(m.date || m.registeredAt || '').slice(0, 10);
                (m.usages || []).forEach(function(u) {
                    const lot = u.prodLot || u.lotNo || '';
                    let inspDate = '';
                    let inspId = String(u.sourceInspectionId || '').trim();
                    if (typeof Trace !== 'undefined' && Trace.resolvePaintInspection) {
                        const insp = Trace.resolvePaintInspection(u.materialId, lot);
                        inspDate = insp.inspDate || '';
                        inspId = insp.inspId || inspId;
                    }
                    push(u.paintName, lot, inspDate, inspId, u.materialId, {
                        paintSpec: u.paintSpec,
                        mixDate: mixDate,
                        mixId: m.id,
                        role: u.role,
                        usageG: Number(u.usageG) || Number(u.residualUseG) || 0
                    });
                });
            });
        }
        out.forEach(function(m) {
            m.paintSpec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            if (m.inspId && m.inspDate) return;
            const found = _pwLookupPaintIncoming(m.name, m.prodLot, m.materialId);
            if (found.inspId) m.inspId = m.inspId || found.inspId;
            if (found.inspDate) m.inspDate = m.inspDate || found.inspDate;
        });
        return out;
    }

    function _findLaserWorkForInv(rec, sb) {
        const linkedWorkId = (sb && sb.laserWorkId) || rec.laserWorkId || rec.workLogId || '';
        if (linkedWorkId) {
            const byId = Storage.getById(DB.STORES.LASER_WORK_LOG, linkedWorkId);
            if (byId) return byId;
        }
        const linkedInspId = (sb && sb.laserInspectionId) || rec.laserInspectionId || '';
        if (linkedInspId) {
            const insp = Storage.getById(DB.STORES.LASER_INSPECTIONS, linkedInspId);
            if (insp && insp.workLogId) {
                const byInsp = Storage.getById(DB.STORES.LASER_WORK_LOG, insp.workLogId);
                if (byInsp) return byInsp;
            }
        }
        const car = String(rec.carModel || '').trim();
        const part = String(rec.partName || '').trim();
        const color = String(rec.color || '').trim();
        const lots = _pwSplitLots(rec.lotNo || rec.injectionLot);
        const works = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const cands = works.filter(function(w) {
            if (car && String(w.carModel || '').trim() !== car) return false;
            if (part && String(w.partName || '').trim() !== part) return false;
            if (color && String(w.color || '').trim() && String(w.color || '').trim() !== color) return false;
            if (!lots.length) return true;
            const wLots = _pwSplitLots(w.paintLot || w.lotNo || w.injectionLot);
            if (!wLots.length) return true;
            return lots.some(function(lot) { return wLots.indexOf(lot) >= 0; });
        });
        if (!cands.length) return null;
        cands.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        return cands[0];
    }

    function _pwGenealogy(rec) {
        const car = rec.carModel || '';
        const part = rec.partName || '';
        const color = rec.color || '';
        const injLotsRaw = _pwSplitLots(rec.lotNo || rec.injectionLot);
        const paintingDate = String(rec.paintingDate || rec.paintLot || '').trim();
        const sb = rec.standbyId ? Storage.getById(DB.STORES.SHIPPING_STANDBY, rec.standbyId) : null;
        const work = _findPaintingWorkForInv(rec) || _findPaintingWorkByLot(rec);
        const injPartName = work ? (work.injPartName || work.partName || part) : part;
        const t = (typeof Trace !== 'undefined') ? Trace.of(work || rec) : {};

        const injLots = injLotsRaw.map(function(lot) {
            let inspId = '';
            let inspDate = '';
            if (Array.isArray(t.injLots)) {
                const hit = t.injLots.find(function(r) { return String(r.lot || '') === lot; });
                if (hit) {
                    inspId = hit.inspId || '';
                    inspDate = hit.inspDate || '';
                }
            }
            if (!inspDate && t.inj && t.inj.lot === lot) {
                inspId = t.inj.inspId || inspId;
                inspDate = t.inj.inspDate || inspDate;
            }
            if (!inspId || !inspDate) {
                const hits = _injectionInspHitsForLot(injPartName, car, lot);
                if (hits[0]) {
                    inspId = inspId || hits[0].id;
                    inspDate = inspDate || hits[0].date;
                }
            }
            return { lot: lot, inspId: inspId, inspDate: String(inspDate || '').slice(0, 10) };
        });

        const paintMats = _paintLotDetailsForWork(work);
        const isLaser = _pwIsLaserProduct(car, part, color)
            || !!(sb && (sb.laserWorkId || sb.laserLot || sb.laserWorkDate));
        const laserWork = isLaser ? _findLaserWorkForInv(rec, sb || {}) : null;
        const laserDate = String(
            (laserWork && laserWork.date)
            || (sb && (sb.laserWorkDate || sb.laserLot))
            || rec.laserWorkDate
            || rec.laserLot
            || ''
        ).slice(0, 10);

        return {
            injPartName: injPartName,
            injLots: injLots,
            paintingDate: paintingDate,
            paintWorkId: work && work.id ? work.id : '',
            paintMats: paintMats,
            isLaser: isLaser,
            laserDate: laserDate,
            laserWorkId: laserWork && laserWork.id ? laserWork.id : ''
        };
    }

    function _pwInjLotLinks(g) {
        return _pwJoinLinks((g.injLots || []).map(function(row) {
            const onclick = row.inspId
                ? `ProductWarehouseModule.openInjIncoming('${_jsAttr(row.inspId)}')`
                : '';
            return _pwClickLink(row.lot, onclick, '사출 수입검사 보기');
        }));
    }

    function _pwInjInspDateLinks(g) {
        const seen = {};
        return _pwJoinLinks((g.injLots || []).map(function(row) {
            if (!row.inspDate || seen[row.inspId || row.inspDate]) return '';
            seen[row.inspId || row.inspDate] = true;
            const onclick = row.inspId
                ? `ProductWarehouseModule.openInjIncoming('${_jsAttr(row.inspId)}')`
                : '';
            return _pwClickLink(row.inspDate, onclick, '사출 수입검사 보기');
        }));
    }

    function _pwPaintWorkLink(g) {
        if (!g.paintingDate) return _pwMutedDash();
        const onclick = g.paintWorkId
            ? `ProductWarehouseModule.openPaintWork('${_jsAttr(g.paintWorkId)}')`
            : '';
        return _pwJoinLinks(_pwSplitLots(g.paintingDate).map(function(day) {
            return _pwClickLink(day, onclick, '도장 작업 실적 보기');
        }));
    }

    function _pwPaintLotLinks(g) {
        return _pwStackCell((g.paintMats || []).map(function(m) {
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            const tag = spec === 'Primer' ? 'P ' : spec === 'Color' ? 'C ' : spec === 'Clear' ? 'Cl ' : '';
            const label = tag + (m.name ? (m.name + '(' + m.prodLot + ')') : m.prodLot);
            const onclick = m.inspId
                ? `ProductWarehouseModule.openPaintIncoming('${_jsAttr(m.inspId)}')`
                : '';
            return _pwClickLink(label, onclick, '도료 수입검사 보기');
        }));
    }

    function _pwPaintInspDateLinks(g) {
        const seen = {};
        return _pwJoinLinks((g.paintMats || []).map(function(m) {
            if (!m.inspDate || seen[m.inspId || m.inspDate]) return '';
            seen[m.inspId || m.inspDate] = true;
            const onclick = m.inspId
                ? `ProductWarehouseModule.openPaintIncoming('${_jsAttr(m.inspId)}')`
                : '';
            return _pwClickLink(m.inspDate, onclick, '도료 수입검사 보기');
        }));
    }

    function _pwLaserLotLink(g) {
        if (!g.isLaser && !g.laserDate) return _pwMutedDash();
        if (!g.laserDate) return _pwMutedDash();
        const onclick = g.laserWorkId
            ? `ProductWarehouseModule.openLaserWork('${_jsAttr(g.laserWorkId)}')`
            : '';
        return _pwClickLink(g.laserDate, onclick, '레이져 작업 실적 보기');
    }

    function _pwTraceBtn(kind, car, part, lots) {
        const carEnc = encodeURIComponent(car || '');
        const partEnc = encodeURIComponent(part || '');
        const lotsEnc = encodeURIComponent(lots || '');
        return ` <button type="button" class="btn btn-sm btn-outline"
            style="margin-left:4px;font-size:0.7rem;padding:1px 7px;line-height:1.35;vertical-align:middle;"
            onclick="event.preventDefault();event.stopPropagation();ProductWarehouseModule.traceIncoming('${kind}','${carEnc}','${partEnc}','${lotsEnc}')">추적</button>`;
    }

    function _pwStackCell(parts) {
        const list = (parts || []).filter(Boolean);
        if (!list.length) return _pwMutedDash();
        if (list.length === 1) return list[0];
        return '<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">'
            + list.map(function(p) {
                return '<div style="white-space:nowrap;">' + p + '</div>';
            }).join('')
            + '</div>';
    }

    function _pwInjLotWithInspCell(g, car) {
        const rows = (g.injLots || []).map(function(row) {
            if (!row.lot) return '';
            const onclick = row.inspId
                ? `ProductWarehouseModule.openInjIncoming('${_jsAttr(row.inspId)}')`
                : '';
            const lotLink = _pwClickLink(row.lot, onclick, '사출 수입검사 보기');
            const datePart = row.inspDate
                ? _pwClickLink(row.inspDate, onclick, '사출 수입검사 보기')
                : '<span style="color:var(--text-muted);font-size:0.75rem;">검사일 없음</span>';
            return lotLink + ' <span style="color:var(--text-muted);">/</span> ' + datePart;
        }).filter(Boolean);
        let html = _pwStackCell(rows);
        const missing = (g.injLots || []).filter(function(r) {
            return r.lot && r.lot !== '무표기' && r.lot !== '(미차감 출고)' && !r.inspId;
        });
        if (missing.length) {
            html += _pwTraceBtn('inj', car || '', g.injPartName || '', missing.map(function(r) { return r.lot; }).join(','));
        }
        return html;
    }

    function _pwPaintWorkWithMixDatesCell(g) {
        const workLine = g.paintingDate ? _pwPaintWorkLink(g) : '';
        const bySpec = {};
        (g.paintMats || []).forEach(function(m) {
            if (!m.mixDate) return;
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            if (!bySpec[spec]) bySpec[spec] = m;
        });
        const extra = [];
        [['Primer', 'P'], ['Color', 'C'], ['Clear', 'Cl']].forEach(function(pair) {
            const m = bySpec[pair[0]];
            if (!m) return;
            const onclick = m.mixId
                ? `ProductWarehouseModule.openPaintMix('${_jsAttr(m.mixId)}')`
                : (g.paintWorkId ? `ProductWarehouseModule.openPaintWork('${_jsAttr(g.paintWorkId)}')` : '');
            extra.push(_pwClickLink(pair[1] + ' 사용 ' + m.mixDate, onclick, '도료사용 등록 보기'));
        });
        return _pwStackCell([workLine].concat(extra));
    }

    function _pwPaintInspDateBySpecCell(g, primerOnly) {
        const mats = (g.paintMats || []).filter(function(m) {
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            return primerOnly ? spec === 'Primer' : spec !== 'Primer';
        });
        const seen = {};
        const parts = mats.map(function(m) {
            if (!m.inspDate) return '';
            const key = m.inspId || (m.name + '|' + m.inspDate);
            if (seen[key]) return '';
            seen[key] = true;
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            const prefix = spec === 'Clear' ? 'Cl ' : '';
            const onclick = m.inspId
                ? `ProductWarehouseModule.openPaintIncoming('${_jsAttr(m.inspId)}')`
                : '';
            return _pwClickLink(prefix + m.inspDate, onclick, primerOnly ? '프라이머 수입검사 보기' : '컬러 수입검사 보기');
        }).filter(Boolean);
        return _pwStackCell(parts);
    }

    function _pwPaintMatsForSpec(g, primerOnly) {
        return (g.paintMats || []).filter(function(m) {
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            return primerOnly ? spec === 'Primer' : spec !== 'Primer';
        });
    }

    function _pwPaintLotWithInspBySpecCell(g, primerOnly) {
        const mats = _pwPaintMatsForSpec(g, primerOnly);
        const tag = primerOnly ? 'P' : 'C';
        const title = primerOnly ? '프라이머 수입검사 보기' : '컬러 수입검사 보기';
        const rows = mats.map(function(m) {
            if (!m.prodLot && !m.name) return '';
            const lotLabel = m.name ? (m.name + '(' + m.prodLot + ')') : m.prodLot;
            const onclick = m.inspId
                ? `ProductWarehouseModule.openPaintIncoming('${_jsAttr(m.inspId)}')`
                : '';
            const lotLink = _pwClickLink(tag + ' ' + lotLabel, onclick, title);
            const datePart = m.inspDate
                ? _pwClickLink(m.inspDate, onclick, title)
                : '<span style="color:var(--text-muted);font-size:0.75rem;">검사일 없음</span>';
            return lotLink + ' <span style="color:var(--text-muted);">/</span> ' + datePart;
        }).filter(Boolean);
        let html = _pwStackCell(rows);
        const missing = mats.filter(function(m) { return m.prodLot && !m.inspId; });
        if (missing.length) {
            html += _pwTraceBtn('paint', '', '', missing.map(function(m) {
                return (m.name || '') + '|' + m.prodLot;
            }).join(';;'));
        }
        return html;
    }

    function _pwPaintUsageCell(g) {
        const pQty = _pwPaintMatsForSpec(g, true).reduce(function(s, m) { return s + (Number(m.usageG) || 0); }, 0);
        const cQty = _pwPaintMatsForSpec(g, false).reduce(function(s, m) { return s + (Number(m.usageG) || 0); }, 0);
        if (!pQty && !cQty) return _pwMutedDash();
        const mixId = ((g.paintMats || []).find(function(m) { return m.mixId; }) || {}).mixId || '';
        const onclick = mixId
            ? `ProductWarehouseModule.openPaintMix('${_jsAttr(mixId)}')`
            : (g.paintWorkId ? `ProductWarehouseModule.openPaintWork('${_jsAttr(g.paintWorkId)}')` : '');
        const lines = [];
        if (pQty) lines.push(_pwClickLink('P ' + UIUtils.formatNumber(pQty) + ' g', onclick, '도료사용 등록 보기'));
        if (cQty) lines.push(_pwClickLink('C ' + UIUtils.formatNumber(cQty) + ' g', onclick, '도료사용 등록 보기'));
        return _pwStackCell(lines);
    }

    function _pwInjLotCell(g, car) {
        const html = _pwInjLotLinks(g);
        const missing = (g.injLots || []).filter(function(r) {
            return r.lot && r.lot !== '무표기' && r.lot !== '(미차감 출고)' && !r.inspId;
        });
        if (!missing.length) return html;
        return html + _pwTraceBtn('inj', car || '', g.injPartName || '', missing.map(function(r) { return r.lot; }).join(','));
    }

    function _pwPaintLotCell(g) {
        const html = _pwPaintLotLinks(g);
        const missing = (g.paintMats || []).filter(function(m) { return m.prodLot && !m.inspId; });
        if (!missing.length) return html;
        const payload = missing.map(function(m) {
            return (m.name || '') + '|' + m.prodLot;
        }).join(';;');
        return html + _pwTraceBtn('paint', '', '', payload);
    }

    function _pwOpenNewWindow(pageId, openKind, recordId) {
        let href = '';
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('page', pageId);
            if (openKind) url.searchParams.set('open', openKind);
            else url.searchParams.delete('open');
            if (recordId) url.searchParams.set('id', recordId);
            else url.searchParams.delete('id');
            href = url.toString();
        } catch (e) {
            const base = String(window.location.href).split('#')[0].split('?')[0];
            href = base + '?page=' + encodeURIComponent(pageId)
                + (openKind ? '&open=' + encodeURIComponent(openKind) : '')
                + (recordId ? '&id=' + encodeURIComponent(recordId) : '');
        }
        const name = ('mes_' + String(openKind || pageId) + '_' + String(recordId || ''))
            .replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
        const win = window.open(href, name, 'popup=yes,width=1280,height=860,scrollbars=yes,resizable=yes');
        if (!win) {
            UIUtils.toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'warning');
            return null;
        }
        try { win.focus(); } catch (e) {}
        return win;
    }

    function _pwSearchInjIncoming(lots, car, part) {
        const wanted = (lots || []).map(function(s) { return String(s || '').trim(); })
            .filter(function(l) { return l && l !== '무표기' && l !== '(미차감 출고)'; });
        if (!wanted.length) return [];
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const hits = [];
        inspections.forEach(function(d) {
            const inspLots = _pwInspLotList(d);
            const matched = wanted.filter(function(w) {
                return inspLots.some(function(il) { return _pwLotEquals(w, il); });
            });
            if (!matched.length) return;
            let score = 10;
            if (car && String(d.carModel || '').trim() === String(car).trim()) score += 6;
            if (part && String(d.partName || '').trim() === String(part).trim()) score += 4;
            hits.push({
                id: d.id,
                date: String(d.date || '').slice(0, 10),
                carModel: d.carModel || '',
                partName: d.partName || '',
                color: d.color || '',
                lots: inspLots.join(', '),
                matched: matched.join(', '),
                verdict: d.verdict || '',
                score: score
            });
        });
        hits.sort(function(a, b) { return b.score - a.score || String(b.date).localeCompare(String(a.date)); });
        return hits;
    }

    function _pwSearchPaintIncoming(items) {
        const hits = [];
        const seen = {};
        (items || []).forEach(function(item) {
            const name = item.name || '';
            const lot = item.lot || '';
            if (!lot) return;
            const found = _pwLookupPaintIncoming(name, lot, item.materialId || '');
            if (!found.inspId) {
                const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
                inspections.filter(function(insp) {
                    return _pwLotEquals(insp.lotNo || insp.prodLot, lot);
                }).forEach(function(insp) {
                    if (seen[insp.id]) return;
                    seen[insp.id] = true;
                    hits.push({
                        id: insp.id,
                        date: String(insp.date || '').slice(0, 10),
                        name: insp.paintName || name,
                        lot: String(insp.lotNo || insp.prodLot || lot),
                        matched: lot,
                        supplier: insp.supplier || ''
                    });
                });
                return;
            }
            if (seen[found.inspId]) return;
            seen[found.inspId] = true;
            const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, found.inspId) || {};
            hits.push({
                id: found.inspId,
                date: found.inspDate || String(insp.date || '').slice(0, 10),
                name: insp.paintName || name,
                lot: lot,
                matched: lot,
                supplier: insp.supplier || ''
            });
        });
        return hits;
    }

    function _pwShowTraceHits(kind, queryLabel, hits) {
        const isInj = kind === 'inj';
        const openFn = isInj ? 'openInjIncoming' : 'openPaintIncoming';
        const rows = hits.length ? hits.map(function(h) {
            return `<tr>
                <td style="white-space:nowrap;">${_escapeHtml(h.date || '-')}</td>
                <td style="white-space:nowrap;">${_escapeHtml(isInj ? (h.carModel || '-') : (h.name || '-'))}</td>
                <td style="white-space:nowrap;">${_escapeHtml(isInj ? (h.partName || '-') : (h.supplier || '-'))}</td>
                <td style="white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace;">${_escapeHtml(isInj ? (h.lots || h.matched) : (h.lot || h.matched))}</td>
                <td style="white-space:nowrap;">${isInj ? _escapeHtml(h.verdict || '-') : _escapeHtml(h.matched || '-')}</td>
                <td style="white-space:nowrap;">
                    <button type="button" class="btn btn-sm btn-primary" style="font-size:0.75rem;padding:2px 8px;"
                        onclick="ProductWarehouseModule.${openFn}('${_jsAttr(h.id)}')">새창</button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">수입검사에서 해당 LOT를 찾지 못했습니다.</td></tr>`;
        const headers = isInj
            ? ['검사일', '차종', '품명', '사출 LOT', '판정', '열기']
            : ['검사일', '도료명', '도료사', '도료 LOT', '검색 LOT', '열기'];
        const opener = (typeof UIUtils.openChildModal === 'function') ? UIUtils.openChildModal.bind(UIUtils) : UIUtils.showModal;
        opener({
            title: (isInj ? '사출 수입검사 추적' : '도료 수입검사 추적') + ' — ' + queryLabel,
            size: 'lg',
            body: `<div style="overflow-x:auto;">
                <table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">
                    <thead><tr>${headers.map(function(h) { return '<th style="white-space:nowrap;">' + h + '</th>'; }).join('')}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`,
            footer: '<button type="button" class="btn btn-secondary" onclick="UIUtils.closeChildModal ? UIUtils.closeChildModal() : UIUtils.closeModal()">닫기</button>'
        });
    }

    function traceIncoming(kind, carEnc, partEnc, lotsEnc) {
        const car = decodeURIComponent(carEnc || '');
        const part = decodeURIComponent(partEnc || '');
        const raw = decodeURIComponent(lotsEnc || '');
        if (kind === 'paint') {
            const items = raw.split(';;').map(function(s) {
                const idx = s.lastIndexOf('|');
                if (idx < 0) return { name: '', lot: s };
                return { name: s.slice(0, idx), lot: s.slice(idx + 1) };
            }).filter(function(it) { return it.lot; });
            const hits = _pwSearchPaintIncoming(items);
            if (hits.length === 1) {
                openPaintIncoming(hits[0].id);
                return;
            }
            _pwShowTraceHits('paint', items.map(function(it) { return it.lot; }).join(', '), hits);
            return;
        }
        const lots = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (!lots.length) {
            UIUtils.toast('추적할 사출 LOT가 없습니다.', 'warning');
            return;
        }
        const hits = _pwSearchInjIncoming(lots, car, part);
        if (hits.length === 1) {
            openInjIncoming(hits[0].id);
            return;
        }
        _pwShowTraceHits('inj', lots.join(', '), hits);
    }

    function openInspTracePopup(inspId) {
        const rec = Storage.getById(DB.STORES.SHIPPING_INSPECTIONS, String(inspId || '').trim());
        if (!rec) {
            UIUtils.toast('출하검사 이력을 찾을 수 없습니다.', 'warning');
            return;
        }
        const g = _pwGenealogy({
            carModel: rec.carModel || '',
            partName: rec.partName || '',
            color: rec.color || '',
            lotNo: rec.injectionLot || rec.lotNo || '',
            injectionLot: rec.injectionLot || rec.lotNo || '',
            paintingDate: _pwInspPaintLot(rec),
            paintLot: _pwInspPaintLot(rec),
            standbyId: rec.standbyId,
            laserWorkId: rec.laserWorkId,
            laserLot: rec.laserLot,
            laserWorkDate: rec.laserWorkDate
        });
        const injLots = (g.injLots || []).map(function(r) { return r.lot; }).filter(Boolean).join(', ') || '-';
        const injDates = [];
        const seenD = {};
        (g.injLots || []).forEach(function(r) {
            if (!r.inspDate || seenD[r.inspDate]) return;
            seenD[r.inspDate] = true;
            injDates.push(r.inspDate);
        });
        const paintLots = (g.paintMats || []).map(function(m) {
            return m.name ? (m.name + '(' + m.prodLot + ')') : m.prodLot;
        }).filter(Boolean).join(', ') || '-';
        const primerDates = [];
        const colorDates = [];
        const mixDates = [];
        const seenP = {};
        const seenC = {};
        const seenM = {};
        (g.paintMats || []).forEach(function(m) {
            const spec = _pwResolvePaintSpec(m.name, m.materialId, m.paintSpec);
            if (m.inspDate) {
                const bucket = spec === 'Primer' ? primerDates : colorDates;
                const seen = spec === 'Primer' ? seenP : seenC;
                if (!seen[m.inspDate]) {
                    seen[m.inspDate] = true;
                    bucket.push(m.inspDate);
                }
            }
            if (m.mixDate && !seenM[spec + m.mixDate]) {
                seenM[spec + m.mixDate] = true;
                const tag = spec === 'Primer' ? 'P' : spec === 'Color' ? 'C' : spec === 'Clear' ? 'Cl' : '';
                mixDates.push((tag ? tag + ' ' : '') + m.mixDate);
            }
        });
        const paintLot = _pwInspPaintLot(rec) || rec.lotNo || '-';
        const win = window.open('', 'pwInspTrace_' + String(rec.id || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40),
            'width=920,height=560,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
        if (!win) {
            UIUtils.toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 'warning');
            return;
        }
        const row = function(label, value) {
            return `<tr>
                <th style="white-space:nowrap;text-align:left;padding:8px 12px;background:#f1f5f9;color:#64748b;font-weight:600;">${label}</th>
                <td style="white-space:nowrap;padding:8px 12px;">${_escapeHtml(value)}</td>
            </tr>`;
        };
        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>출하검사 LOT 추적</title>
            <style>
                body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#f1f5f9;color:#0f172a;}
                .bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:#1e3a5f;color:#fff;}
                .bar button{font-size:13px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:#fff;color:#1e3a5f;cursor:pointer;font-weight:700;}
                .wrap{padding:16px;}
                table{width:max-content;max-width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;}
                td,th{border-bottom:1px solid #e2e8f0;font-size:13px;}
            </style></head><body>
            <div class="bar"><strong>출하검사 LOT 추적</strong><button type="button" onclick="window.close()">닫기</button></div>
            <div class="wrap">
                <table>
                    ${row('출하검사일', String(rec.date || '-').slice(0, 10))}
                    ${row('차종', rec.carModel || '-')}
                    ${row('품명', rec.partName || '-')}
                    ${row('컬러', rec.color || '-')}
                    ${row('도장 LOT', paintLot)}
                    ${row('도료사용 등록일', mixDates.join(', ') || '-')}
                    ${row('사출 LOT', injLots)}
                    ${row('사출수입검사일', injDates.join(', ') || '-')}
                    ${row('도료 LOT', paintLots)}
                    ${row('프라이머 수입검사일', primerDates.join(', ') || '-')}
                    ${row('컬러 수입검사일', colorDates.join(', ') || '-')}
                    ${row('레이져 LOT', g.laserDate || '-')}
                </table>
            </div>
            </body></html>`);
        win.document.close();
        try { win.focus(); } catch (e) {}
    }

    function openPaintMix(mixId) {
        const id = String(mixId || '').trim();
        if (!id) { UIUtils.toast('연결된 도료사용 등록이 없습니다.', 'warning'); return; }
        const mix = Storage.getById(DB.STORES.PROD_CONDITIONS, id);
        if (!mix || mix._docKind !== 'paint_mix') {
            UIUtils.toast('도료사용 등록 기록을 찾을 수 없습니다.', 'warning');
            return;
        }
        const usages = (mix.usages || []).filter(function(u) {
            return u.paintName || u.prodLot || u.lotNo || u.residualProdLot;
        });
        const bodyRows = usages.length ? usages.map(function(u) {
            const spec = _pwResolvePaintSpec(u.paintName, u.materialId, u.paintSpec);
            const specLabel = spec === 'Primer' ? '프라이머' : spec === 'Color' ? '컬러' : spec === 'Clear' ? '클리어' : (spec || '-');
            const lot = u.prodLot || u.lotNo || u.residualProdLot || '-';
            const qty = Number(u.usageG) || Number(u.residualUseG) || 0;
            return `<tr>
                <td style="white-space:nowrap;">${_escapeHtml(specLabel)}</td>
                <td style="white-space:nowrap;">${_escapeHtml(u.paintName || '-')}</td>
                <td style="white-space:nowrap;font-family:monospace;">${_escapeHtml(lot)}</td>
                <td style="text-align:right;white-space:nowrap;">${UIUtils.formatNumber(qty)} g</td>
            </tr>`;
        }).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">사용 도료가 없습니다.</td></tr>`;
        const workBtn = mix.workId
            ? `<button class="btn btn-outline" onclick="UIUtils.closeModal();ProductWarehouseModule.openPaintWork('${_jsAttr(mix.workId)}')">도장 실적 보기</button>`
            : '';
        UIUtils.showModal('도료사용 등록', `
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">
                <span><strong>등록일:</strong> ${_escapeHtml(String(mix.date || '-').slice(0, 10))}</span>
                <span><strong>라인:</strong> ${_escapeHtml(mix.line || '-')}</span>
                <span><strong>차종:</strong> ${_escapeHtml(mix.carModel || '-')}</span>
                <span><strong>품명:</strong> ${_escapeHtml(mix.partName || '-')}</span>
                <span><strong>컬러:</strong> ${_escapeHtml(mix.color || '-')}</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">
                    <thead><tr>
                        <th style="white-space:nowrap;">구분</th>
                        <th style="white-space:nowrap;">도료명</th>
                        <th style="white-space:nowrap;">제조 LOT</th>
                        <th style="white-space:nowrap;text-align:right;">사용량</th>
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>${workBtn}`, 'md');
    }

    function openInjIncoming(inspId) {
        const id = String(inspId || '').trim();
        if (!id) { UIUtils.toast('연결된 사출 수입검사가 없습니다.', 'warning'); return; }
        if (!Storage.getById(DB.STORES.INJECTION_INSPECTIONS, id)) {
            UIUtils.toast('사출 수입검사 기록을 찾을 수 없습니다.', 'warning');
            return;
        }
        _pwOpenNewWindow('injection-incoming', 'injIncoming', id);
    }

    function openPaintIncoming(inspId) {
        const id = String(inspId || '').trim();
        if (!id) { UIUtils.toast('연결된 도료 수입검사가 없습니다.', 'warning'); return; }
        if (!Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, id)) {
            UIUtils.toast('도료 수입검사 기록을 찾을 수 없습니다.', 'warning');
            return;
        }
        _pwOpenNewWindow('paint-incoming-inspection', 'paintIncoming', id);
    }

    function openPaintWork(workId) {
        const id = String(workId || '').trim();
        if (!id) { UIUtils.toast('연결된 도장 작업 실적이 없습니다.', 'warning'); return; }
        const work = Storage.getById(DB.STORES.PAINTING_WORK, id);
        if (!work) { UIUtils.toast('도장 작업 실적을 찾을 수 없습니다.', 'warning'); return; }
        const line = String(work.line || '');
        const pageId = /도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(line) ? 'painting-work-b' : 'painting-work-a';
        _pwOpenNewWindow(pageId, 'paintWork', id);
    }

    function openLaserWork(workId) {
        const id = String(workId || '').trim();
        if (!id) { UIUtils.toast('연결된 레이져 작업 실적이 없습니다.', 'warning'); return; }
        if (!Storage.getById(DB.STORES.LASER_WORK_LOG, id)) {
            UIUtils.toast('레이져 작업 실적을 찾을 수 없습니다.', 'warning');
            return;
        }
        _pwOpenNewWindow('laser-work', 'laserWork', id);
    }

    // ── 품목 상세 모달 (사출 창고 패턴) ─────────────────────────────────
    async function _showHistory(keyEnc, event) {
        if (event) event.stopPropagation();

        const key   = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');
        _pwPaintInspCache = Object.create(null);

        const records = (Storage.getAll(STORE) || [])
            .filter(d => {
                const dCar   = d.carModel || '';
                const dPart  = d.partName || '미분류';
                const dColor = d.color    || '';
                return dCar === car && dPart === part && dColor === color;
            });

        const balance = StockDetailUI.lotBalancesFromRecords(records);
        const stock = balance.balance.total;
        const inQty  = records.filter(r => r.type !== '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const outQty = records.filter(r => r.type === '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const currentLots = balance.lots;

        // LOT(사출 LOT) → 도장 LOT(paintingDate)/standbyId 를 알아내기 위한 대표 입고 기록 매핑
        const incomingByLot = {};
        records.filter(r => r.type !== '출고').forEach(r => {
            const lot = r.lotNo || '';
            if (!lot) return;
            if (!incomingByLot[lot] || String(r.date || '') > String(incomingByLot[lot].date || '')) incomingByLot[lot] = r;
        });

        const lotGene = {};
        currentLots.forEach(function(l) {
            const srcRec = incomingByLot[l.lotNo] || {
                carModel: car, partName: part, color: color, lotNo: l.lotNo, paintingDate: ''
            };
            lotGene[l.lotNo] = _pwGenealogy(srcRec);
        });
        const showLaserCol = _pwIsLaserProduct(car, part, color)
            || Object.keys(lotGene).some(function(k) { return lotGene[k].isLaser || lotGene[k].laserDate; });

        const lotRows = currentLots.map(l => {
            const lotNoAttr = _escapeHtml(l.lotNo || '').replace(/'/g, "\\'");
            const dateAttr = _escapeHtml(l.date || '').replace(/'/g, "\\'");
            const adjustBtn = _isAdminUser()
                ? `<button type="button" class="btn btn-sm btn-outline"
                        style="margin-left:8px;font-size:0.72rem;padding:2px 8px;vertical-align:middle;"
                        onclick="event.stopPropagation();ProductWarehouseModule._openLotAdjust('${keyEnc}','${lotNoAttr}','${dateAttr}',${Number(l.qty) || 0})">수량 보정</button>`
                : '';

            const g = lotGene[l.lotNo] || _pwGenealogy({ carModel: car, partName: part, color: color, lotNo: l.lotNo });
            const laserCell = showLaserCol
                ? `<td style="white-space:nowrap;">${_pwLaserLotLink(g)}</td>`
                : '';

            return `
            <tr>
                <td style="white-space:nowrap;">${l.date || '-'}</td>
                <td style="white-space:nowrap;">${_pwPaintWorkLink(g)}</td>
                <td style="white-space:nowrap;">${_pwInjLotWithInspCell(g, car)}</td>
                <td style="white-space:nowrap;">${_pwPaintLotWithInspBySpecCell(g, true)}</td>
                <td style="white-space:nowrap;">${_pwPaintLotWithInspBySpecCell(g, false)}</td>
                <td style="white-space:nowrap;">${_pwPaintUsageCell(g)}</td>
                ${laserCell}
                <td style="text-align:right;white-space:nowrap;">
                    <span style="font-weight:600;color:var(--accent-green);">${UIUtils.formatNumber(l.qty)}</span>
                    ${adjustBtn}
                </td>
            </tr>`;
        }).join('');

        const lotHeaders = ['입고일', '도장 LOT', '사출 LOT / 수입검사일', 'P 도료 LOT / 수입검사일', 'C 도료 LOT / 수입검사일', 'P/C 사용량']
            .concat(showLaserCol ? ['레이져Lot'] : [])
            .concat(['현재 수량']);

        const lotSection = StockDetailUI.buildLotTableSection({
            headers: lotHeaders,
            colSpan: lotHeaders.length,
            rowsHtml: lotRows
        });
        const lotHint = `<div style="font-size:0.75rem;color:var(--text-muted);margin:-4px 0 14px;line-height:1.45;">
            도장 LOT를 기준으로 사출 LOT/수입검사, P·C 도료 LOT/수입검사일, 사용량, 레이져 LOT를 조회합니다. 항목을 클릭하면 해당 이력이 열립니다.
        </div>`;

        const historySection = StockDetailUI.buildInvHistorySection(records, {
            routeFn: _productInvRoute,
            lotFn: function(d) {
                const parts = [];
                if (d.lotNo) parts.push(d.lotNo);
                if (d.paintingDate) parts.push(d.paintingDate);
                return parts.length ? parts.join(' / ') : '무표기';
            },
            whoFn: function(d) { return d.source || '-'; }
        });

        const reliRecords = await _loadReliRecords();
        const shipStatus = _buildShippingStatus(car, part, color, reliRecords);
        const shippingStatusSection = _buildShippingStatusSection(shipStatus);
        const dailyInspSection = _buildDailyInspSection(shipStatus.dailyAll);
        const reliSection = _buildReliSection(shipStatus.reliAll);

        UIUtils.showModal(
            `📦 ${part}${color ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${_escapeHtml(car || '차종 미지정')}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${_escapeHtml(part)}</strong></span>
                ${color ? `<span style="color:var(--text-muted);">·</span><span>${_escapeHtml(color)}</span>` : ''}
            </div>
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:${stock <= 0 ? 'var(--accent-red)' : 'var(--accent-blue)'};">${UIUtils.formatNumber(stock)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">현재 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(inQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">입고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-red);">${UIUtils.formatNumber(outQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${currentLots.filter(l => l.qty > 0).length}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">보유 LOT 수</div>
                </div>
            </div>
            ${shippingStatusSection}
            ${lotSection}
            ${lotHint}
            ${dailyInspSection}
            ${reliSection}
            ${historySection}
            `,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xl'
        );
    }

    function _escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function _normalizeText(value) {
        return String(value ?? '').replace(/\u00a0/g, ' ').trim();
    }

    function _parseQty(value) {
        const text = _normalizeText(value);
        if (!text || text === '-' || text === '－') return 0;
        const cleaned = text.replace(/,/g, '').replace(/[^\d.-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function _isQtyLike(value) {
        const text = _normalizeText(value);
        if (text === '-' || text === '－') return true;
        return /^-?[\d,]+(\.\d+)?$/.test(text);
    }

    function _isAdminUser() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function') {
            return AuthModule.isAdminUser();
        }
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return false;
        const user = AuthModule.getCurrentUser();
        if (!user) return false;
        const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role].filter(Boolean).map(String);
        return roles.includes('admin');
    }

    function _requireProductAdmin(onPass, message) {
        _requireProductWrite(onPass, message || '제품 창고 입력 권한이 없습니다.');
    }

    function _requireBulkAdmin(onPass) {
        _requireProductWrite(onPass, '제품 창고 입력 권한이 있는 사용자만 일괄 등록·수정할 수 있습니다.');
    }

    function _canWriteProductWarehouse() {
        if (_isAdminUser()) return true;
        return typeof AuthModule !== 'undefined' &&
            typeof AuthModule.canWritePage === 'function' &&
            AuthModule.canWritePage('product-warehouse');
    }

    function _requireProductWrite(onPass, message) {
        const user = typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        if (!user) {
            if (typeof AuthModule !== 'undefined' && AuthModule.showLoginModal) {
                AuthModule.showLoginModal(function() { _requireProductWrite(onPass, message); });
                return;
            }
            UIUtils.toast('로그인이 필요합니다.', 'warning');
            return;
        }
        if (_isAdminUser() || _canWriteProductWarehouse()) {
            onPass();
            return;
        }
        UIUtils.toast(message || '제품 창고 입력 권한이 없습니다.', 'warning');
    }

    function _products() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => p.carModel || p.partName);
    }

    function _productCars() {
        return [...new Set(_products().map(p => p.carModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _productParts(car) {
        return [...new Set(_products().filter(p => p.carModel === car).map(p => p.partName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _productColors(car, part) {
        return [...new Set(_products().filter(p => p.carModel === car && p.partName === part).map(p => p.color).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _selectOpts(values, selected, placeholder) {
        return `<option value="">${placeholder}</option>` +
            values.map(v => `<option value="${_escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${_escapeHtml(v)}</option>`).join('');
    }

    function _stockLotKey(lot) {
        return `${lot.paintingDate || '미표기'}||${lot.color || ''}||${lot.lotNo || ''}`;
    }

    function _getStockLots(carModel, partName, color, ignoreShipmentId) {
        const inv = Storage.getAll(STORE) || [];
        const lotMap = {};
        inv.filter(r => (!carModel || r.carModel === carModel) && (!partName || r.partName === partName) && (!color || (r.color || '') === color))
            .forEach(r => {
                if (ignoreShipmentId && r.todayShipmentId === ignoreShipmentId) return;
                const paintingDate = r.paintingDate || r.date || '미표기';
                const lotColor = r.color || '';
                const lotNo = r.lotNo || '';
                const key = `${paintingDate}||${lotColor}||${lotNo}`;
                if (!lotMap[key]) {
                    lotMap[key] = { paintingDate, color: lotColor, lotNo, balance: 0, carModel: r.carModel, partName: r.partName };
                }
                if (r.type === '출고') lotMap[key].balance -= Number(r.quantity) || 0;
                else lotMap[key].balance += Number(r.quantity) || 0;
            });
        return Object.values(lotMap)
            .filter(l => l.balance > 0)
            .sort((a, b) => (a.paintingDate || '').localeCompare(b.paintingDate || '') || (a.lotNo || '').localeCompare(b.lotNo || ''));
    }

    function _carsFromStock() {
        const inv = Storage.getAll(STORE) || [];
        const balanceMap = {};
        inv.forEach(r => {
            const key = `${r.carModel || ''}||${r.partName || ''}`;
            if (!balanceMap[key]) balanceMap[key] = { carModel: r.carModel, balance: 0 };
            if (r.type === '출고') balanceMap[key].balance -= Number(r.quantity) || 0;
            else balanceMap[key].balance += Number(r.quantity) || 0;
        });
        return [...new Set(Object.values(balanceMap).filter(x => x.balance > 0 && x.carModel).map(x => x.carModel))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _partsFromStock(car) {
        const inv = Storage.getAll(STORE) || [];
        const balanceMap = {};
        inv.filter(r => r.carModel === car).forEach(r => {
            const key = `${r.partName || ''}||${r.color || ''}`;
            if (!key.replace(/\|/g, '')) return;
            if (!balanceMap[key]) balanceMap[key] = { partName: r.partName, color: r.color || '', balance: 0 };
            if (r.type === '출고') balanceMap[key].balance -= Number(r.quantity) || 0;
            else balanceMap[key].balance += Number(r.quantity) || 0;
        });
        return Object.values(balanceMap).filter(x => x.balance > 0)
            .sort((a, b) => `${a.partName} ${a.color}`.localeCompare(`${b.partName} ${b.color}`, 'ko'));
    }

    function _stockLotOpts(lots, selectedKey, placeholder) {
        return `<option value="">${placeholder}</option>` +
            lots.map(l => {
                const key = _stockLotKey(l);
                const label = `${l.paintingDate || '미표기'}${l.lotNo ? ' / ' + l.lotNo : ''}${l.color ? ' / ' + l.color : ''} — ${UIUtils.formatNumber(l.balance)} EA`;
                return `<option value="${_escapeHtml(key)}" ${key === selectedKey ? 'selected' : ''}>${_escapeHtml(label)}</option>`;
            }).join('');
    }

    function openManualInModal() {
        _requireProductWrite(() => _showManualInModal(), '제품 창고 수동 입고 권한이 없습니다.');
    }

    function _showManualInModal() {
        const carOpts = _selectOpts(_productCars(), '', '-- 차종 선택 --');
        UIUtils.showModal('수동 입고', `
            <div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(16,185,129,0.25);border-radius:8px;background:rgba(16,185,129,0.06);font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                완제품 창고에 제품을 <strong>수동 입고</strong> 등록합니다.
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">입고일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="pwManInDate" value="${UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pwManInCar" onchange="ProductWarehouseModule._onManualInCarChange()">${carOpts}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pwManInPart" onchange="ProductWarehouseModule._onManualInPartChange()"><option value="">← 차종 먼저 선택</option></select></div>
                <div class="form-group"><label class="form-label">컬러</label>
                    <select class="form-select" id="pwManInColor"><option value="">← 품명 먼저 선택</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">LOT번호</label>
                    <input class="form-input" id="pwManInLotNo" placeholder="사출 LOT"></div>
                <div class="form-group"><label class="form-label">도장일자</label>
                    <input type="date" class="form-input" id="pwManInPaintDate"></div>
                <div class="form-group"><label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="pwManInQty" min="1" placeholder="입고 수량"></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label>
                <input class="form-input" id="pwManInNote" placeholder="특이사항"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductWarehouseModule.saveManualIn()">입고 등록</button>
        `, 'lg');
    }

    function _onManualInCarChange() {
        const car = (document.getElementById('pwManInCar') || {}).value || '';
        const partEl = document.getElementById('pwManInPart');
        const colorEl = document.getElementById('pwManInColor');
        if (partEl) partEl.innerHTML = car ? _selectOpts(_productParts(car), '', '-- 품명 선택 --') : '<option value="">← 차종 먼저 선택</option>';
        if (colorEl) colorEl.innerHTML = '<option value="">← 품명 먼저 선택</option>';
    }

    function _onManualInPartChange() {
        const car = (document.getElementById('pwManInCar') || {}).value || '';
        const part = (document.getElementById('pwManInPart') || {}).value || '';
        const colorEl = document.getElementById('pwManInColor');
        if (colorEl) colorEl.innerHTML = (car && part) ? _selectOpts(_productColors(car, part), '', '-- 컬러 선택 --') : '<option value="">← 품명 먼저 선택</option>';
    }

    async function saveManualIn() {
        const g = id => ((document.getElementById(id) || {}).value || '').trim();
        const date = g('pwManInDate');
        const carModel = g('pwManInCar');
        const partName = g('pwManInPart');
        const qty = parseInt(g('pwManInQty') || '0', 10);
        if (!date) { UIUtils.toast('입고일자를 입력하세요.', 'warning'); return; }
        if (!carModel || !partName) { UIUtils.toast('차종과 품명을 선택하세요.', 'warning'); return; }
        if (!qty || qty <= 0) { UIUtils.toast('수량을 입력하세요.', 'warning'); return; }

        const note = g('pwManInNote');
        await Storage.add(STORE, {
            date,
            carModel,
            partName,
            color: g('pwManInColor'),
            lotNo: g('pwManInLotNo'),
            paintingDate: g('pwManInPaintDate'),
            quantity: qty,
            type: '입고',
            source: note ? `수동 입고 (${note})` : '수동 입고'
        });
        UIUtils.closeModal();
        UIUtils.toast('수동 입고가 등록되었습니다.', 'success');
        loadData();
    }

    function openManualOutModal() {
        _requireProductWrite(() => _showManualOutModal(), '제품 창고 수동 출고 권한이 없습니다.');
    }

    function _showManualOutModal() {
        const carOpts = _selectOpts(_carsFromStock(), '', '-- 차종 선택 --');
        UIUtils.showModal('수동 출고', `
            <div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(245,158,11,0.25);border-radius:8px;background:rgba(245,158,11,0.06);font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                완제품 창고 재고를 선택하여 <strong>수동 출고</strong> 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">출고일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="pwManOutDate" value="${UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pwManOutCar" onchange="ProductWarehouseModule._onManualOutCarChange()">${carOpts}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pwManOutPart" onchange="ProductWarehouseModule._onManualOutPartChange()"><option value="">← 차종 먼저 선택</option></select></div>
                <div class="form-group"><label class="form-label">LOT <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pwManOutLot" onchange="ProductWarehouseModule._onManualOutLotChange()"><option value="">← 품명 먼저 선택</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">컬러</label>
                    <input class="form-input" id="pwManOutColor" readonly style="background:var(--bg-secondary);"></div>
                <div class="form-group"><label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="pwManOutQty" min="1" placeholder="출고 수량"></div>
                <div class="form-group" style="flex:2;"><label class="form-label">비고</label>
                    <input class="form-input" id="pwManOutNote" placeholder="특이사항"></div>
            </div>
            <div id="pwManOutHint" style="font-size:0.75rem;color:var(--text-muted);">LOT를 선택하면 가용 재고가 표시됩니다.</div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductWarehouseModule.saveManualOut()">출고 등록</button>
        `, 'lg');
    }

    function _onManualOutCarChange() {
        const car = (document.getElementById('pwManOutCar') || {}).value || '';
        const partEl = document.getElementById('pwManOutPart');
        const lotEl = document.getElementById('pwManOutLot');
        const colorEl = document.getElementById('pwManOutColor');
        const qtyEl = document.getElementById('pwManOutQty');
        if (partEl) {
            const parts = _partsFromStock(car);
            partEl.innerHTML = car
                ? `<option value="">-- 품명 선택 --</option>${parts.map(p => `<option value="${_escapeHtml(p.partName)}||${_escapeHtml(p.color)}">${_escapeHtml(p.partName)} / ${_escapeHtml(p.color || '-')}</option>`).join('')}`
                : '<option value="">← 차종 먼저 선택</option>';
        }
        if (lotEl) lotEl.innerHTML = '<option value="">← 품명 먼저 선택</option>';
        if (colorEl) colorEl.value = '';
        if (qtyEl) qtyEl.value = '';
    }

    function _onManualOutPartChange() {
        const car = (document.getElementById('pwManOutCar') || {}).value || '';
        const partVal = (document.getElementById('pwManOutPart') || {}).value || '';
        const lotEl = document.getElementById('pwManOutLot');
        const colorEl = document.getElementById('pwManOutColor');
        const qtyEl = document.getElementById('pwManOutQty');
        const hintEl = document.getElementById('pwManOutHint');
        if (!partVal) {
            if (lotEl) lotEl.innerHTML = '<option value="">← 품명 먼저 선택</option>';
            if (colorEl) colorEl.value = '';
            return;
        }
        const [partName, color] = partVal.split('||');
        if (colorEl) colorEl.value = color || '';
        const lots = _getStockLots(car, partName, color);
        if (lotEl) lotEl.innerHTML = _stockLotOpts(lots, '', '-- LOT 선택 --');
        if (qtyEl) qtyEl.value = '';
        if (hintEl) hintEl.textContent = lots.length ? 'LOT를 선택하세요.' : '가용 재고가 없습니다.';
    }

    function _onManualOutLotChange() {
        const car = (document.getElementById('pwManOutCar') || {}).value || '';
        const partVal = (document.getElementById('pwManOutPart') || {}).value || '';
        const lotKey = (document.getElementById('pwManOutLot') || {}).value || '';
        const qtyEl = document.getElementById('pwManOutQty');
        const hintEl = document.getElementById('pwManOutHint');
        if (!partVal || !lotKey) return;
        const [partName, color] = partVal.split('||');
        const lot = _getStockLots(car, partName, color).find(l => _stockLotKey(l) === lotKey);
        if (lot && qtyEl) {
            qtyEl.max = lot.balance;
            qtyEl.value = lot.balance;
        }
        if (hintEl && lot) hintEl.textContent = `가용 재고: ${UIUtils.formatNumber(lot.balance)} EA`;
    }

    async function saveManualOut() {
        const g = id => ((document.getElementById(id) || {}).value || '').trim();
        const date = g('pwManOutDate');
        const carModel = g('pwManOutCar');
        const partVal = g('pwManOutPart');
        const lotKey = g('pwManOutLot');
        const qty = parseInt(g('pwManOutQty') || '0', 10);
        if (!date) { UIUtils.toast('출고일자를 입력하세요.', 'warning'); return; }
        if (!carModel || !partVal || !lotKey) { UIUtils.toast('차종, 품명, LOT를 선택하세요.', 'warning'); return; }
        if (!qty || qty <= 0) { UIUtils.toast('수량을 입력하세요.', 'warning'); return; }

        const [partName, color] = partVal.split('||');
        const lot = _getStockLots(carModel, partName, color).find(l => _stockLotKey(l) === lotKey);
        if (!lot) { UIUtils.toast('선택한 LOT 재고를 찾을 수 없습니다.', 'warning'); return; }
        if (qty > lot.balance) {
            UIUtils.toast(`재고가 부족합니다. (가용: ${UIUtils.formatNumber(lot.balance)} EA)`, 'warning');
            return;
        }

        const shipStatus = await getShippingReadiness(carModel, partName, lot.color || color || '');
        if (!shipStatus.eligible) {
            UIUtils.toast('출하검사(외관)·신뢰성 검사가 모두 합격인 품목만 출고할 수 있습니다.', 'warning');
            return;
        }

        const note = g('pwManOutNote');
        await Storage.add(STORE, {
            date,
            carModel,
            partName,
            color: lot.color || color || '',
            lotNo: lot.lotNo || '',
            paintingDate: lot.paintingDate === '미표기' ? '' : (lot.paintingDate || ''),
            quantity: qty,
            type: '출고',
            source: note ? `수동 출고 (${note})` : '수동 출고'
        });
        UIUtils.closeModal();
        UIUtils.toast('수동 출고가 등록되었습니다.', 'success');
        loadData();
    }

    function _openLotAdjust(keyEnc, lotNo, inDate, currentQty) {
        if (!_canWriteProductWarehouse()) {
            UIUtils.toast('제품 창고 입력 권한이 있는 사용자만 수량을 보정할 수 있습니다.', 'warning');
            return;
        }
        const key = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');
        const lotLabel = lotNo || '무표기';
        UIUtils.showModal('LOT 수량 보정', `
            <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.6;">
                <div><strong>${_escapeHtml(car || '차종 미지정')}</strong> · <strong>${_escapeHtml(part)}</strong>${color ? ` · ${_escapeHtml(color)}` : ''}</div>
                <div style="margin-top:4px;">LOT: <strong style="font-family:monospace;">${_escapeHtml(lotLabel)}</strong>
                    &nbsp;|&nbsp; 현재 수량: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(currentQty)} EA</strong></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">보정일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="pwLotAdjDate" value="${UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">보정 후 수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="pwLotAdjQty" min="0" value="${Number(currentQty) || 0}"></div>
            </div>
            <div class="form-group"><label class="form-label">보정 사유</label>
                <input class="form-input" id="pwLotAdjReason" placeholder="예: 실사 보정, 파손 폐기 등"></div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
                현재 수량과의 차이만큼 입고/출고 보정 기록이 자동 생성됩니다.
            </div>
            <input type="hidden" id="pwLotAdjKeyEnc" value="${_escapeHtml(keyEnc)}">
            <input type="hidden" id="pwLotAdjLotNo" value="${_escapeHtml(lotNo)}">
            <input type="hidden" id="pwLotAdjInDate" value="${_escapeHtml(inDate)}">
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal();ProductWarehouseModule._showHistory('${keyEnc}')">취소</button>
            <button class="btn btn-primary" onclick="ProductWarehouseModule._saveLotAdjust()">보정 저장</button>
        `, 'md');
    }

    async function _saveLotAdjust() {
        if (!_canWriteProductWarehouse()) {
            UIUtils.toast('제품 창고 입력 권한이 있는 사용자만 수량을 보정할 수 있습니다.', 'warning');
            return;
        }
        const keyEnc = (document.getElementById('pwLotAdjKeyEnc') || {}).value || '';
        const lotNo = (document.getElementById('pwLotAdjLotNo') || {}).value || '';
        const inDate = (document.getElementById('pwLotAdjInDate') || {}).value || '';
        const date = ((document.getElementById('pwLotAdjDate') || {}).value || '').trim();
        const newQty = Number((document.getElementById('pwLotAdjQty') || {}).value);
        const reason = _normalizeText((document.getElementById('pwLotAdjReason') || {}).value);
        if (!date) { UIUtils.toast('보정일자를 입력하세요.', 'warning'); return; }
        if (!Number.isFinite(newQty) || newQty < 0) { UIUtils.toast('보정 후 수량을 올바르게 입력하세요.', 'warning'); return; }

        const key = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');
        const records = (Storage.getAll(STORE) || []).filter(d => {
            const dCar = d.carModel || '';
            const dPart = d.partName || '미분류';
            const dColor = d.color || '';
            return dCar === car && dPart === part && dColor === color;
        });
        const balance = StockDetailUI.lotBalancesFromRecords(records);
        const lot = balance.lots.find(l => String(l.lotNo || '') === String(lotNo) && String(l.date || '') === String(inDate))
            || balance.lots.find(l => String(l.lotNo || '') === String(lotNo));
        const currentQty = lot ? (Number(lot.qty) || 0) : 0;
        const diff = newQty - currentQty;
        if (diff === 0) { UIUtils.toast('변경된 수량이 없습니다.', 'info'); return; }

        const ref = records.find(r => r.type !== '출고' && String(r.lotNo || '') === String(lotNo)) || {};
        const source = reason ? `수량 보정 (${reason})` : '수량 보정';
        await Storage.add(STORE, {
            date,
            carModel: car,
            partName: part,
            color: color || ref.color || '',
            lotNo: lotNo === InvCalc.UNMATCHED ? '' : lotNo,
            paintingDate: ref.paintingDate || inDate || '',
            quantity: Math.abs(diff),
            type: diff > 0 ? '입고' : '출고',
            source
        });
        UIUtils.closeModal();
        UIUtils.toast('LOT 수량 보정이 완료되었습니다.', 'success');
        loadData();
        _showHistory(keyEnc);
    }

    function _getCurrentStockMap() {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(d => {
            const key = `${d.carModel || ''}||${d.partName || '미분류'}||${d.color || ''}`;
            if (!map[key]) map[key] = 0;
            const qty = Number(d.quantity) || 0;
            map[key] += d.type === '출고' ? -qty : qty;
        });
        return map;
    }

    function _parseBulkRows(text) {
        const rows = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.split('\t').map(_normalizeText))
            .filter(row => row.some(Boolean));

        return rows
            .filter(row => row.length >= 3)
            .filter(row => _isQtyLike(row.length >= 4 ? row[3] : row[2]))
            .map(row => ({
                carModel: row[0] || '',
                partName: row[1] || '',
                color: row.length >= 4 ? row[2] || '' : '',
                quantity: row.length >= 4 ? _parseQty(row[3]) : _parseQty(row[2])
            }))
            .filter(r => r.carModel && r.partName);
    }

    function _bulkKey(row) {
        return [
            _normalizeText(row.carModel).toUpperCase(),
            _normalizeText(row.partName).toUpperCase(),
            _normalizeText(row.color).toUpperCase()
        ].join('||');
    }

    function _bulkDuplicateCounts(records) {
        const counts = {};
        (records || []).forEach(row => {
            const key = _bulkKey(row);
            if (!key.replace(/\|/g, '')) return;
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }

    function _bulkDuplicateLabels(records, counts) {
        const seen = new Set();
        const labels = [];
        (records || []).forEach(row => {
            const key = _bulkKey(row);
            if ((counts[key] || 0) <= 1 || seen.has(key)) return;
            seen.add(key);
            labels.push(`${row.carModel} / ${row.partName}${row.color ? ' / ' + row.color : ''}`);
        });
        return labels;
    }

    // ── 일괄 등록 (엑셀 복사·붙여넣기) ──────────────────────────────
    function openBulkModal() {
        _requireBulkAdmin(_showBulkModal);
    }

    function _showBulkModal() {
        ProductWarehouseModule._bulkRecords = [];
        const container = document.getElementById('contentArea');
        if (!container) return;
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="mes-apple-menu-hero">
                    ${ProdAppleMenu.strip([
                        { label: '재고 현황',    icon: 'inventory_2',         subtitle: '현재 재고 조회',   accent: '#2563eb', active: false, onClick: "ProductWarehouseModule.render(document.getElementById('contentArea'))" },
                        { label: '입고 기록',    icon: 'login',               subtitle: '입고 이력 조회',   accent: '#10b981', active: false, onClick: "ProductWarehouseModule._switchTabOutside('incoming')" },
                        { label: '출고 기록',    icon: 'logout',              subtitle: '출고 이력 조회',   accent: '#f59e0b', active: false, onClick: "ProductWarehouseModule._switchTabOutside('outgoing')" },
                        { label: '일괄 등록/수정', icon: 'admin_panel_settings', subtitle: '관리자 재고 보정', accent: '#ef4444', active: true,  onClick: 'ProductWarehouseModule.openBulkModal()' }
                    ])}
                </div>
                <div class="card" style="margin-top:16px;">
                    <div class="card-body">
                        <div style="margin-bottom:10px;padding:10px 14px;background:rgba(59,130,246,0.07);
                                    border:1px solid rgba(59,130,246,0.25);border-radius:8px;font-size:0.82rem;
                                    color:var(--text-secondary);line-height:1.7;">
                            <b style="color:var(--accent-blue);">붙여넣기 방법</b><br>
                            엑셀에서 <b>차종 / 품명 / 컬러 / 재고</b> 4열을 복사(Ctrl+C) →
                            아래 입력창에 붙여넣기(Ctrl+V) → <b>미리보기</b> 클릭<br>
                            <span style="font-size:0.78rem;color:var(--text-muted);">
                            • 헤더가 있어도 됩니다: <b>차종 / 품명 / 컬러 / 재고</b><br>
                            • 컬러가 없는 예전 3열 양식(<b>차종 / 품명 / 재고</b>)도 계속 인식합니다<br>
                            • <b>-</b>는 목표 재고 0으로 인식합니다<br>
                            • 같은 <b>차종+품명+컬러</b>가 중복되면 저장할 수 없습니다<br>
                            • 저장 시 기존 제품창고 재고를 모두 삭제하고, 붙여넣은 목록으로 새로 등록합니다
                            </span>
                        </div>
                        <div style="margin-bottom:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;
                                    font-family:Consolas,monospace;font-size:0.78rem;line-height:1.45;color:var(--text-secondary);">
                            차종&nbsp;&nbsp;&nbsp;&nbsp;품명&nbsp;&nbsp;&nbsp;&nbsp;컬러&nbsp;&nbsp;&nbsp;&nbsp;재고<br>
                            GOLF-7&nbsp;&nbsp;&nbsp;&nbsp;KNOB- DOOR [DYS (LASER)]&nbsp;&nbsp;&nbsp;&nbsp;DYS&nbsp;&nbsp;&nbsp;&nbsp;1,500<br>
                            A3&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;KNOB [DOOR LOW] 6PS 레이저인쇄&nbsp;&nbsp;&nbsp;&nbsp;6PS&nbsp;&nbsp;&nbsp;&nbsp;1,000<br>
                            T1XX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PARK&nbsp;&nbsp;&nbsp;&nbsp;BK&nbsp;&nbsp;&nbsp;&nbsp;-
                        </div>
                        <div class="form-row" style="margin-bottom:12px;">
                            <div class="form-group">
                                <label class="form-label">기준일자</label>
                                <input type="date" class="form-input" id="bulkInvDate" value="${UIUtils.today()}">
                            </div>
                            <div class="form-group" style="align-self:flex-end;">
                                <button class="btn btn-outline" onclick="ProductWarehouseModule._bulkParse()">
                                    <span class="material-symbols-outlined">preview</span> 미리보기
                                </button>
                            </div>
                        </div>
                        <textarea id="bulkPasteArea" class="form-textarea"
                            placeholder="엑셀에서 복사한 내용을 여기에 붙여넣으세요 (Ctrl+V)"
                            style="height:180px;font-family:monospace;font-size:0.78rem;resize:vertical;"
                            oninput="document.getElementById('bulkPreviewWrap').innerHTML='';
                                     var s=document.getElementById('bulkSaveBtn');if(s)s.disabled=true;"></textarea>
                        <div id="bulkPreviewWrap" style="margin-top:12px;"></div>
                        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                            <button class="btn btn-secondary"
                                onclick="ProductWarehouseModule.render(document.getElementById('contentArea'))">
                                취소
                            </button>
                            <button class="btn btn-primary" id="bulkSaveBtn" disabled
                                title="미리보기로 데이터를 확인하면 등록할 수 있습니다."
                                onclick="ProductWarehouseModule._bulkSave()">
                                <span class="material-symbols-outlined">save</span> 등록 실행
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // 엑셀 텍스트 파싱
    function _bulkParse() {
        const raw = (document.getElementById('bulkPasteArea') || {}).value || '';
        const wrap = document.getElementById('bulkPreviewWrap');
        const saveBtn = document.getElementById('bulkSaveBtn');
        if (!wrap) return;

        const records = _parseBulkRows(raw);
        if (!records.length) {
            wrap.innerHTML = '<p style="color:var(--accent-red);font-size:0.83rem;">붙여넣은 내용이 없습니다.</p>';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        // 미리보기 테이블
        const currentMap = _getCurrentStockMap();
        const duplicateCounts = _bulkDuplicateCounts(records);
        const duplicateLabels = _bulkDuplicateLabels(records, duplicateCounts);
        const hasDuplicates = duplicateLabels.length > 0;
        let changed = 0;
        const rowsHtml = records.map((r, idx) => {
            const key = `${r.carModel}||${r.partName}||${r.color || ''}`;
            const current = currentMap[key] || 0;
            const diff = r.quantity - current;
            if (diff !== 0) changed++;
            const isDup = (duplicateCounts[_bulkKey(r)] || 0) > 1;
            const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = diff > 0 ? `+${UIUtils.formatNumber(diff)}` : UIUtils.formatNumber(diff);
            return `
            <tr style="${isDup ? 'background:rgba(239,68,68,0.06);' : ''}">
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.carModel)}" data-idx="${idx}" data-field="carModel"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.partName)}" data-idx="${idx}" data-field="partName"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.color)}" data-idx="${idx}" data-field="color"></td>
                <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                <td><input type="number" min="0" class="form-input pw-bulk-cell" value="${r.quantity}" data-idx="${idx}" data-field="quantity" style="text-align:right;"></td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                <td style="padding:4px 8px;text-align:center;">
                    ${isDup ? '<span style="display:inline-block;margin-right:4px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.12);color:var(--accent-red);font-size:0.7rem;font-weight:700;">중복</span>' : ''}
                    <button class="btn btn-sm btn-outline" onclick="ProductWarehouseModule._bulkRemoveRow(${idx})">제외</button>
                </td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);font-size:18px;">check_circle</span>
                <span style="font-size:0.85rem;font-weight:600;color:var(--accent-green);">
                    ${records.length}건 인식됨 / 기존 재고와 차이 ${changed}건
                </span>
            </div>
            ${hasDuplicates ? `
            <div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>중복 품목 ${duplicateLabels.length}개가 있습니다.</strong>
                같은 차종+품명+컬러는 1개만 남기거나 값을 수정해야 저장할 수 있습니다.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 5).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 5 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차종</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">품명</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">컬러</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">현재고</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">목표수량</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차이</th>
                            <th style="padding:5px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;

        ProductWarehouseModule._bulkRecords = records;
        wrap.querySelectorAll('.pw-bulk-cell').forEach(input => {
            input.addEventListener('input', function() {
                const idx = Number(this.dataset.idx);
                const field = this.dataset.field;
                if (!ProductWarehouseModule._bulkRecords || !ProductWarehouseModule._bulkRecords[idx]) return;
                ProductWarehouseModule._bulkRecords[idx][field] = field === 'quantity'
                    ? Math.max(0, Math.round(Number(this.value) || 0))
                    : _normalizeText(this.value);
            });
            input.addEventListener('change', _bulkRenderPreview);
        });
        if (saveBtn) {
            saveBtn.disabled = hasDuplicates;
            saveBtn.title = hasDuplicates
                ? '중복 항목을 수정하거나 제외한 뒤 등록할 수 있습니다.'
                : '미리보기 내용으로 제품창고 재고를 등록합니다.';
        }
    }

    function _bulkRenderPreview() {
        const textArea = document.getElementById('bulkPasteArea');
        if (textArea) textArea.value = '';
        const records = ProductWarehouseModule._bulkRecords || [];
        const wrap = document.getElementById('bulkPreviewWrap');
        const saveBtn = document.getElementById('bulkSaveBtn');
        if (!wrap) return;
        if (!records.length) {
            wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.83rem;">미리보기 데이터가 없습니다.</p>';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }
        const currentMap = _getCurrentStockMap();
        const duplicateCounts = _bulkDuplicateCounts(records);
        const duplicateLabels = _bulkDuplicateLabels(records, duplicateCounts);
        const hasDuplicates = duplicateLabels.length > 0;
        let changed = 0;
        const rowsHtml = records.map((r, idx) => {
            const key = `${r.carModel}||${r.partName}||${r.color || ''}`;
            const current = currentMap[key] || 0;
            const diff = (Number(r.quantity) || 0) - current;
            if (diff !== 0) changed++;
            const isDup = (duplicateCounts[_bulkKey(r)] || 0) > 1;
            const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = diff > 0 ? `+${UIUtils.formatNumber(diff)}` : UIUtils.formatNumber(diff);
            return `
            <tr style="${isDup ? 'background:rgba(239,68,68,0.06);' : ''}">
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.carModel)}" data-idx="${idx}" data-field="carModel"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.partName)}" data-idx="${idx}" data-field="partName"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.color)}" data-idx="${idx}" data-field="color"></td>
                <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                <td><input type="number" min="0" class="form-input pw-bulk-cell" value="${r.quantity}" data-idx="${idx}" data-field="quantity" style="text-align:right;"></td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                <td style="padding:4px 8px;text-align:center;">
                    ${isDup ? '<span style="display:inline-block;margin-right:4px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.12);color:var(--accent-red);font-size:0.7rem;font-weight:700;">중복</span>' : ''}
                    <button class="btn btn-sm btn-outline" onclick="ProductWarehouseModule._bulkRemoveRow(${idx})">제외</button>
                </td>
            </tr>`;
        }).join('');
        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);font-size:18px;">check_circle</span>
                <span style="font-size:0.85rem;font-weight:600;color:var(--accent-green);">
                    ${records.length}건 인식됨 / 기존 재고와 차이 ${changed}건
                </span>
            </div>
            ${hasDuplicates ? `
            <div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>중복 품목 ${duplicateLabels.length}개가 있습니다.</strong>
                같은 차종+품명+컬러는 1개만 남기거나 값을 수정해야 저장할 수 있습니다.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 5).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 5 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차종</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">품명</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">컬러</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">현재고</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">목표수량</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차이</th>
                            <th style="padding:5px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        wrap.querySelectorAll('.pw-bulk-cell').forEach(input => {
            input.addEventListener('input', function() {
                const idx = Number(this.dataset.idx);
                const field = this.dataset.field;
                if (!ProductWarehouseModule._bulkRecords || !ProductWarehouseModule._bulkRecords[idx]) return;
                ProductWarehouseModule._bulkRecords[idx][field] = field === 'quantity'
                    ? Math.max(0, Math.round(Number(this.value) || 0))
                    : _normalizeText(this.value);
            });
            input.addEventListener('change', _bulkRenderPreview);
        });
        if (saveBtn) {
            saveBtn.disabled = hasDuplicates;
            saveBtn.title = hasDuplicates
                ? '중복 항목을 수정하거나 제외한 뒤 등록할 수 있습니다.'
                : '미리보기 내용으로 제품창고 재고를 등록합니다.';
        }
    }

    function _bulkRemoveRow(idx) {
        if (!ProductWarehouseModule._bulkRecords) return;
        ProductWarehouseModule._bulkRecords.splice(idx, 1);
        _bulkRenderPreview();
    }

    function _showBulkSaveResult(rows, date) {
        const increased = rows.filter(row => row.diff > 0).length;
        const decreased = rows.filter(row => row.diff < 0).length;
        const unchanged = rows.filter(row => row.diff === 0).length;
        const totalQty = rows.reduce((sum, row) => sum + row.targetQty, 0);
        const rowsHtml = rows.map(row => {
            const diffColor = row.diff > 0
                ? 'var(--accent-green)'
                : row.diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = row.diff > 0
                ? `+${UIUtils.formatNumber(row.diff)}`
                : UIUtils.formatNumber(row.diff);
            return `
                <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:7px 9px;">${_escapeHtml(row.carModel)}</td>
                    <td style="padding:7px 9px;">${_escapeHtml(row.partName)}</td>
                    <td style="padding:7px 9px;">${_escapeHtml(row.color || '-')}</td>
                    <td style="padding:7px 9px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(row.currentQty)}</td>
                    <td style="padding:7px 9px;text-align:right;font-weight:700;">${UIUtils.formatNumber(row.targetQty)}</td>
                    <td style="padding:7px 9px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                </tr>`;
        }).join('');

        UIUtils.showModal('제품창고 일괄 등록 결과', `
            <div style="padding:12px 14px;margin-bottom:14px;border:1px solid rgba(34,197,94,0.3);
                        border-radius:8px;background:rgba(34,197,94,0.07);display:flex;align-items:center;gap:9px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);">check_circle</span>
                <div>
                    <div style="font-weight:700;color:var(--accent-green);">등록이 완료되었습니다.</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">기준일자 ${_escapeHtml(date)}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px;">
                ${[
                    ['등록 품목', `${rows.length}건`, 'var(--accent-blue)'],
                    ['총 재고', `${UIUtils.formatNumber(totalQty)}개`, 'var(--text-primary)'],
                    ['증가', `${increased}건`, 'var(--accent-green)'],
                    ['감소', `${decreased}건`, 'var(--accent-red)'],
                    ['동일', `${unchanged}건`, 'var(--text-muted)']
                ].map(item => `
                    <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;text-align:center;background:var(--bg-secondary);">
                        <div style="font-size:0.72rem;color:var(--text-muted);">${item[0]}</div>
                        <div style="margin-top:3px;font-size:1rem;font-weight:800;color:${item[2]};">${item[1]}</div>
                    </div>`).join('')}
            </div>
            <div style="max-height:320px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:7px 9px;text-align:left;">차종</th>
                            <th style="padding:7px 9px;text-align:left;">품명</th>
                            <th style="padding:7px 9px;text-align:left;">컬러</th>
                            <th style="padding:7px 9px;text-align:right;">기존 재고</th>
                            <th style="padding:7px 9px;text-align:right;">등록 재고</th>
                            <th style="padding:7px 9px;text-align:right;">변경</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary"
                onclick="UIUtils.closeModal();ProductWarehouseModule.render(document.getElementById('contentArea'))">
                재고 현황 보기
            </button>
        `, 'lg');
    }

    async function _bulkSave() {
        if (!_canWriteProductWarehouse()) {
            UIUtils.toast('제품 창고 입력 권한이 있는 사용자만 일괄 등록·수정할 수 있습니다.', 'warning');
            return;
        }
        const records = ProductWarehouseModule._bulkRecords;
        if (!records || !records.length) {
            UIUtils.toast('저장할 데이터가 없습니다.', 'warning');
            return;
        }
        const duplicateLabels = _bulkDuplicateLabels(records, _bulkDuplicateCounts(records));
        if (duplicateLabels.length) {
            UIUtils.toast('중복 품목이 있어 저장할 수 없습니다. 중복 행을 제외하거나 수정하세요.', 'warning');
            _bulkRenderPreview();
            return;
        }
        const date = (document.getElementById('bulkInvDate') || {}).value || UIUtils.today();
        const nowIso = new Date().toISOString();
        const currentMap = _getCurrentStockMap();
        const newItems = [];
        const resultRows = [];

        for (const r of records) {
            const carModel = _normalizeText(r.carModel);
            const partName = _normalizeText(r.partName);
            const color = _normalizeText(r.color);
            const targetQty = Math.max(0, Math.round(Number(r.quantity) || 0));
            if (!carModel || !partName) continue;
            const currentQty = currentMap[`${carModel}||${partName}||${color}`] || 0;

            newItems.push({
                id: Storage.generateId ? Storage.generateId() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
                createdAt: nowIso,
                date,
                type: '입고',
                carModel,
                partName,
                color,
                quantity: targetQty,
                source: '일괄 등록 및 수정'
            });
            resultRows.push({
                carModel,
                partName,
                color,
                currentQty,
                targetQty,
                diff: targetQty - currentQty
            });
        }

        if (!newItems.length) {
            UIUtils.toast('등록할 유효한 데이터가 없습니다.', 'warning');
            return;
        }

        await Storage.saveAll(STORE, newItems);
        ProductWarehouseModule._bulkRecords = [];
        UIUtils.toast(`기존 제품창고 재고 삭제 후 ${newItems.length}건 등록 완료`, 'success');
        _showBulkSaveResult(resultRows, date);
    }

    // ── 재고 실사 반영 (엑셀 복사·붙여넣기) ─────────────────────────────
    // 실사 재고를 붙여넣으면, 시스템 재고와의 차이를 기록으로 맞춘다.
    //  · 시스템 > 실사: 차이만큼 「출고」 — 도장일자가 오래된 LOT부터 빼서 최근 LOT이 남는다.
    //  · 시스템 < 실사: (선택) 「입고」 보정.
    // 기존 「일괄 등록/수정」과 달리 기존 기록·LOT을 지우지 않고 차이만 추가 기록한다(되돌리기 가능).
    const AUDIT_SRC_OUT = '재고실사 조정(미출고분 출고 처리)';
    const AUDIT_SRC_IN = '재고실사 조정(입고 보정)';
    let _auditPlan = [];

    function _auditNorm(v) {
        return _normalizeText(v).replace(/\s+/g, '').toUpperCase();
    }

    function _auditKeyOf(r) {
        return [_auditNorm(r.carModel), _auditNorm(r.partName), _auditNorm(r.color)].join('||');
    }

    function _auditGroups() {
        const groups = {};
        (Storage.getAll(STORE) || []).forEach(r => {
            const key = _auditKeyOf(r);
            if (!key.replace(/\|/g, '')) return;
            if (!groups[key]) {
                groups[key] = { key, carModel: r.carModel || '', partName: r.partName || '', color: r.color || '', records: [], balance: 0 };
            }
            const qty = Number(r.quantity) || 0;
            groups[key].records.push(r);
            groups[key].balance += r.type === '출고' ? -qty : qty;
        });
        return groups;
    }

    // 도장일자 오름차순(오래된 LOT 먼저) LOT별 잔량
    function _auditLots(records) {
        const map = {};
        records.forEach(r => {
            const paintingDate = r.paintingDate || r.date || '';
            const color = r.color || '';
            const lotNo = r.lotNo || '';
            const k = `${paintingDate}||${color}||${lotNo}`;
            if (!map[k]) map[k] = { paintingDate: r.paintingDate || '', sortDate: paintingDate, color, lotNo, balance: 0 };
            const qty = Number(r.quantity) || 0;
            map[k].balance += r.type === '출고' ? -qty : qty;
        });
        return Object.values(map)
            .filter(l => l.balance > 0)
            .sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)) || String(a.lotNo).localeCompare(String(b.lotNo)));
    }

    function _auditBatches() {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(r => {
            if (!r.auditBatchId) return;
            const b = map[r.auditBatchId] || (map[r.auditBatchId] = { id: r.auditBatchId, date: r.date || '', count: 0, outQty: 0, inQty: 0, createdAt: r.createdAt || '' });
            b.count += 1;
            const q = Number(r.quantity) || 0;
            if (r.type === '출고') b.outQty += q; else b.inQty += q;
        });
        return Object.values(map).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    }

    function _auditHistoryHtml() {
        const batches = _auditBatches();
        if (!batches.length) return '';
        return `
            <div style="margin-top:18px;padding-top:12px;border-top:1px solid var(--border-color);">
                <div style="font-weight:700;font-size:0.85rem;margin-bottom:6px;">실사 반영 이력</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                    <thead><tr style="color:var(--text-muted);text-align:left;">
                        <th style="padding:4px 8px;">기준일</th><th style="padding:4px 8px;text-align:right;">기록 건수</th>
                        <th style="padding:4px 8px;text-align:right;">출고 합계</th><th style="padding:4px 8px;text-align:right;">입고 합계</th><th></th>
                    </tr></thead>
                    <tbody>${batches.map(b => `
                        <tr style="border-top:1px solid var(--border-color);">
                            <td style="padding:5px 8px;">${_escapeHtml(b.date)}</td>
                            <td style="padding:5px 8px;text-align:right;">${UIUtils.formatNumber(b.count)}</td>
                            <td style="padding:5px 8px;text-align:right;color:var(--accent-red);">${UIUtils.formatNumber(b.outQty)}</td>
                            <td style="padding:5px 8px;text-align:right;color:var(--accent-green);">${UIUtils.formatNumber(b.inQty)}</td>
                            <td style="padding:5px 8px;text-align:right;"><button class="btn btn-sm btn-outline" onclick="ProductWarehouseModule._auditRevert('${_escapeHtml(b.id)}')">되돌리기</button></td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>`;
    }

    function openAuditModal() {
        _requireBulkAdmin(() => {
            _auditPlan = [];
            UIUtils.showModal('재고 실사 반영', `
                <div style="margin-bottom:10px;padding:10px 14px;background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.25);
                            border-radius:8px;font-size:0.82rem;color:var(--text-secondary);line-height:1.7;">
                    <b style="color:var(--accent-blue);">사용 방법</b><br>
                    엑셀에서 <b>차종 / 품명 / 컬러 / 재고</b> 4열을 복사(Ctrl+C) → 아래에 붙여넣기(Ctrl+V) → <b>미리보기</b> → <b>실사 반영</b><br>
                    <span style="font-size:0.78rem;color:var(--text-muted);">
                    • 실사 재고보다 시스템 재고가 많으면 그 차이를 <b>출고 처리</b>합니다. <b>도장일자가 오래된 LOT부터</b> 빼서 최근 LOT이 남습니다.<br>
                    • <b>-</b> 또는 빈 재고는 0(전량 출고)으로 봅니다. 기존 기록은 지우지 않고 차이만 추가 기록하며, 아래 이력에서 <b>되돌리기</b>할 수 있습니다.<br>
                    • 추후 실사 때도 같은 방법으로 다시 등록하면 됩니다.
                    </span>
                </div>
                <div class="form-row" style="margin-bottom:10px;">
                    <div class="form-group">
                        <label class="form-label">기준일자</label>
                        <input type="date" class="form-input" id="auditDate" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <label style="font-size:0.82rem;display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="checkbox" id="auditAllowIn" checked> 실사가 더 많으면 입고로 보정
                        </label>
                        <label style="font-size:0.82rem;display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px;">
                            <input type="checkbox" id="auditZeroMissing"> 붙여넣은 목록에 없는 품목은 0으로(전량 출고)
                        </label>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="ProductWarehouseModule._auditParse()">
                            <span class="material-symbols-outlined">preview</span> 미리보기
                        </button>
                    </div>
                </div>
                <textarea id="auditPasteArea" class="form-textarea" placeholder="엑셀에서 복사한 내용을 여기에 붙여넣으세요 (Ctrl+V)"
                    style="height:150px;font-family:monospace;font-size:0.78rem;resize:vertical;"
                    oninput="document.getElementById('auditPreviewWrap').innerHTML='';var b=document.getElementById('auditApplyBtn');if(b)b.disabled=true;"></textarea>
                <div id="auditPreviewWrap" style="margin-top:12px;"></div>
                <div id="auditHistoryWrap">${_auditHistoryHtml()}</div>
            `, `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
                <button class="btn btn-primary" id="auditApplyBtn" disabled onclick="ProductWarehouseModule._auditApply()">
                    <span class="material-symbols-outlined">fact_check</span> 실사 반영
                </button>
            `, 'xl');
        });
    }

    function _auditParse() {
        const raw = (document.getElementById('auditPasteArea') || {}).value || '';
        const wrap = document.getElementById('auditPreviewWrap');
        const applyBtn = document.getElementById('auditApplyBtn');
        if (!wrap) return;
        const allowIn = !!(document.getElementById('auditAllowIn') || {}).checked;
        const zeroMissing = !!(document.getElementById('auditZeroMissing') || {}).checked;
        const parsed = _parseBulkRows(raw);
        _auditPlan = [];
        if (applyBtn) applyBtn.disabled = true;
        if (!parsed.length) {
            wrap.innerHTML = '<p style="color:var(--accent-red);font-size:0.83rem;">인식된 행이 없습니다. 차종/품명/컬러/재고 4열을 붙여넣었는지 확인하세요.</p>';
            return;
        }
        const dupCounts = _bulkDuplicateCounts(parsed);
        const dupLabels = _bulkDuplicateLabels(parsed, dupCounts);
        const groups = _auditGroups();
        const used = new Set();
        parsed.forEach(r => {
            const key = _auditKeyOf(r);
            used.add(key);
            const g = groups[key];
            const current = g ? g.balance : 0;
            _auditPlan.push({
                key,
                carModel: g ? g.carModel : r.carModel,
                partName: g ? g.partName : r.partName,
                color: g ? g.color : r.color,
                current,
                target: Math.max(0, Math.round(Number(r.quantity) || 0)),
                group: g || null,
                fromList: true
            });
        });
        if (zeroMissing) {
            Object.values(groups).forEach(g => {
                if (used.has(g.key) || g.balance <= 0) return;
                _auditPlan.push({ key: g.key, carModel: g.carModel, partName: g.partName, color: g.color, current: g.balance, target: 0, group: g, fromList: false });
            });
        }
        const missing = Object.values(groups).filter(g => !used.has(g.key) && g.balance > 0);

        let outItems = 0, outQty = 0, inItems = 0, inQty = 0, same = 0, unmatched = 0;
        const rowsHtml = _auditPlan.map(p => {
            const diff = p.target - p.current;
            let action, color;
            if (diff < 0) { action = `출고 ${UIUtils.formatNumber(-diff)}`; color = 'var(--accent-red)'; outItems++; outQty += -diff; }
            else if (diff > 0) {
                if (allowIn) { action = `입고 +${UIUtils.formatNumber(diff)}`; color = 'var(--accent-green)'; inItems++; inQty += diff; }
                else { action = `실사가 많음 (+${UIUtils.formatNumber(diff)}) · 미반영`; color = '#d97706'; }
            } else { action = '일치'; color = 'var(--text-muted)'; same++; }
            if (!p.group) unmatched++;
            return `<tr style="border-top:1px solid var(--border-color);${p.group ? '' : 'background:rgba(245,158,11,0.08);'}">
                <td style="padding:5px 8px;">${_escapeHtml(p.carModel)}</td>
                <td style="padding:5px 8px;">${_escapeHtml(p.partName)}${p.group ? '' : ' <span style="font-size:0.68rem;color:#d97706;">(시스템에 없음)</span>'}</td>
                <td style="padding:5px 8px;">${_escapeHtml(p.color || '-')}</td>
                <td style="padding:5px 8px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(p.current)}</td>
                <td style="padding:5px 8px;text-align:right;font-weight:700;">${UIUtils.formatNumber(p.target)}</td>
                <td style="padding:5px 8px;text-align:right;font-weight:700;color:${color};">${action}</td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;font-size:0.84rem;">
                <span><b>${parsed.length}</b>건 인식</span>
                <span style="color:var(--accent-red);">출고 <b>${outItems}</b>건 / ${UIUtils.formatNumber(outQty)} EA</span>
                <span style="color:var(--accent-green);">입고 보정 <b>${inItems}</b>건 / ${UIUtils.formatNumber(inQty)} EA</span>
                <span style="color:var(--text-muted);">일치 ${same}건</span>
                ${unmatched ? `<span style="color:#d97706;">시스템에 없는 품목 ${unmatched}건</span>` : ''}
            </div>
            ${dupLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;">
                <b>중복 품목 ${dupLabels.length}개</b> — 같은 차종+품명+컬러가 여러 번 있습니다. 엑셀에서 정리한 뒤 다시 붙여넣으세요.
                <div style="color:var(--text-secondary);">${dupLabels.slice(0, 5).map(_escapeHtml).join('<br>')}</div></div>` : ''}
            ${(!zeroMissing && missing.length) ? `<div style="margin-bottom:8px;font-size:0.78rem;color:var(--text-muted);">※ 붙여넣은 목록에 없는 재고 품목 ${missing.length}개는 변경하지 않습니다.</div>` : ''}
            <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;"><tr style="text-align:left;color:var(--text-muted);">
                        <th style="padding:5px 8px;">차종</th><th style="padding:5px 8px;">품명</th><th style="padding:5px 8px;">컬러</th>
                        <th style="padding:5px 8px;text-align:right;">시스템 재고</th><th style="padding:5px 8px;text-align:right;">실사 재고</th>
                        <th style="padding:5px 8px;text-align:right;">조치</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        if (applyBtn) applyBtn.disabled = !!dupLabels.length || (outItems + inItems === 0);
    }

    async function _auditApply() {
        if (!_canWriteProductWarehouse()) { UIUtils.toast('제품 창고 입력 권한이 없습니다.', 'warning'); return; }
        if (!_auditPlan.length) { UIUtils.toast('먼저 미리보기를 해 주세요.', 'warning'); return; }
        const date = (document.getElementById('auditDate') || {}).value || UIUtils.today();
        const allowIn = !!(document.getElementById('auditAllowIn') || {}).checked;
        const todo = _auditPlan.filter(p => (p.target - p.current) < 0 || ((p.target - p.current) > 0 && allowIn));
        if (!todo.length) { UIUtils.toast('반영할 차이가 없습니다.', 'info'); return; }
        const outTotal = todo.reduce((s, p) => s + Math.max(0, p.current - p.target), 0);
        const inTotal = todo.reduce((s, p) => s + Math.max(0, p.target - p.current), 0);
        if (!confirm(`기준일 ${date}\n출고 처리 ${UIUtils.formatNumber(outTotal)} EA / 입고 보정 ${UIUtils.formatNumber(inTotal)} EA\n\n실사 재고에 맞춰 반영합니다. (이력에서 되돌릴 수 있습니다)\n계속하시겠습니까?`)) return;

        const batchId = 'AUD' + Date.now().toString(36);
        const nowIso = new Date().toISOString();
        const applyBtn = document.getElementById('auditApplyBtn');
        if (applyBtn) applyBtn.disabled = true;
        let outCount = 0, inCount = 0;
        try {
            for (const p of todo) {
                const diff = p.target - p.current;
                if (diff < 0) {
                    let remaining = -diff;
                    const lots = _auditLots(p.group ? p.group.records : []);
                    for (const lot of lots) {
                        if (remaining <= 0) break;
                        const take = Math.min(lot.balance, remaining);
                        if (take <= 0) continue;
                        await Storage.add(STORE, {
                            date, type: '출고', carModel: p.carModel, partName: p.partName, color: lot.color || p.color || '',
                            paintingDate: lot.paintingDate || '', lotNo: lot.lotNo || '', quantity: take,
                            source: AUDIT_SRC_OUT, auditBatchId: batchId, createdAt: nowIso
                        });
                        remaining -= take;
                        outCount++;
                    }
                } else {
                    await Storage.add(STORE, {
                        date, type: '입고', carModel: p.carModel, partName: p.partName, color: p.color || '',
                        paintingDate: '', lotNo: '', quantity: diff,
                        source: AUDIT_SRC_IN, auditBatchId: batchId, createdAt: nowIso
                    });
                    inCount++;
                }
            }
        } catch (e) {
            console.error('[ProductWarehouse] 재고 실사 반영 실패:', e);
            UIUtils.toast('실사 반영 중 오류가 발생했습니다. 일부만 반영됐을 수 있으니 이력에서 확인/되돌리기 하세요.', 'error');
            const hw = document.getElementById('auditHistoryWrap');
            if (hw) hw.innerHTML = _auditHistoryHtml();
            return;
        }
        _auditPlan = [];
        // 실제로 저장됐는지 저장소에서 다시 세어 확인한 뒤 메시지를 보이고 창을 닫는다.
        const saved = (Storage.getAll(STORE) || []).filter(r => r.auditBatchId === batchId);
        const savedOut = saved.filter(r => r.type === '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const savedIn = saved.filter(r => r.type !== '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        if (!saved.length) {
            UIUtils.toast('실사 반영 결과를 확인하지 못했습니다. 재고 현황을 확인해 주세요.', 'warning');
            return;
        }
        UIUtils.toast(`실사 반영 완료 — 출고 ${UIUtils.formatNumber(savedOut)} EA (${outCount}건), 입고 보정 ${UIUtils.formatNumber(savedIn)} EA (${inCount}건) 저장되었습니다.`, 'success');
        UIUtils.closeModal();
        try { loadData(); } catch (e) { /* 화면 갱신 실패는 무시 */ }
    }

    async function _auditRevert(batchId) {
        if (!_canWriteProductWarehouse()) { UIUtils.toast('제품 창고 입력 권한이 없습니다.', 'warning'); return; }
        const rows = (Storage.getAll(STORE) || []).filter(r => r.auditBatchId === batchId);
        if (!rows.length) { UIUtils.toast('되돌릴 기록이 없습니다.', 'info'); return; }
        if (!confirm(`이 실사 반영 기록 ${rows.length}건을 삭제해 재고를 이전 상태로 되돌립니다.\n계속하시겠습니까?`)) return;
        for (const r of rows) await Storage.remove(STORE, r.id);
        UIUtils.toast(`${rows.length}건을 되돌렸습니다.`, 'success');
        const hw = document.getElementById('auditHistoryWrap');
        if (hw) hw.innerHTML = _auditHistoryHtml();
        try { loadData(); } catch (e) { /* 화면 갱신 실패는 무시 */ }
    }

    function openAddModal() {
        _requireProductAdmin(() => {
            UIUtils.showModal('현재고 등록과 수정', _stockAdjustHtml(), `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="ProductWarehouseModule.saveStockAdjustment()">보정 저장</button>
            `);
        });
    }

    function _itemKeyOf(r) {
        return `${r.carModel || ''}||${r.partName || ''}||${r.color || ''}`;
    }

    function _stockAdjustHtml() {
        const records = Storage.getAll(STORE) || [];
        const itemMap = {};
        records.forEach(r => {
            const key = _itemKeyOf(r);
            if (!itemMap[key]) itemMap[key] = { carModel: r.carModel || '', partName: r.partName || '', color: r.color || '', qty: 0 };
            itemMap[key].qty += (r.type === '출고' ? -1 : 1) * (Number(r.quantity) || 0);
        });
        const carOptions = [...new Set(Object.values(itemMap).map(item => item.carModel || ''))]
            .sort((a, b) => a.localeCompare(b, 'ko'))
            .map(car => `<option value="${_escapeHtml(car)}">${_escapeHtml(car || '차종 미지정')}</option>`)
            .join('');
        return `
            <div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(59,130,246,0.25);border-radius:8px;background:rgba(59,130,246,0.06);font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                현장 실재고와 시스템 현재고가 맞지 않을 때 사용하는 관리자 보정 기능입니다. 입고/출고 처리가 아니라 선택한 제품 LOT의 수량과 LOT 정보를 직접 보정하며, 수정 사유는 필수입니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 선택</label>
                    <select class="form-select" id="pwAdjustCar" onchange="ProductWarehouseModule.renderAdjustPartOptions()">
                        <option value="">-- 차종 선택 --</option>
                        ${carOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 선택</label>
                    <select class="form-select" id="pwAdjustItem" onchange="ProductWarehouseModule.renderAdjustRows()" disabled>
                        <option value="">-- 차종을 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 사유 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="pwAdjustReason" placeholder="예: 현장 실사 재고 보정">
                </div>
            </div>
            <div id="pwAdjustRows" style="margin-top:12px;"></div>
        `;
    }

    function _currentProductStockItems() {
        const itemMap = {};
        (Storage.getAll(STORE) || []).forEach(r => {
            const key = _itemKeyOf(r);
            if (!itemMap[key]) itemMap[key] = { carModel: r.carModel || '', partName: r.partName || '', color: r.color || '', qty: 0 };
            itemMap[key].qty += (r.type === '출고' ? -1 : 1) * (Number(r.quantity) || 0);
        });
        return itemMap;
    }

    function renderAdjustPartOptions() {
        const car = (document.getElementById('pwAdjustCar') || {}).value || '';
        const partSelect = document.getElementById('pwAdjustItem');
        const wrap = document.getElementById('pwAdjustRows');
        if (wrap) wrap.innerHTML = '';
        if (!partSelect) return;
        if (!car) {
            partSelect.disabled = true;
            partSelect.innerHTML = '<option value="">-- 차종을 먼저 선택 --</option>';
            return;
        }
        const options = Object.entries(_currentProductStockItems())
            .filter(([, item]) => (item.carModel || '') === car)
            .sort((a, b) => `${a[1].partName} ${a[1].color}`.localeCompare(`${b[1].partName} ${b[1].color}`, 'ko'))
            .map(([key, item]) => `<option value="${_escapeHtml(key)}">${_escapeHtml(item.partName || '-')} / ${_escapeHtml(item.color || '-')} (${UIUtils.formatNumber(item.qty)} EA)</option>`)
            .join('');
        partSelect.disabled = false;
        partSelect.innerHTML = `<option value="">-- 품명 / 컬러 선택 --</option>${options}`;
    }

    function renderAdjustRows() {
        const key = (document.getElementById('pwAdjustItem') || {}).value || '';
        const wrap = document.getElementById('pwAdjustRows');
        if (!wrap) return;
        if (!key) {
            wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">제품을 선택하면 LOT별 현재고가 표시됩니다.</div>';
            return;
        }
        const rows = (Storage.getAll(STORE) || []).filter(r => _itemKeyOf(r) === key);
        const html = rows.map(r => `
            <tr>
                <td style="padding:6px 8px;">${_escapeHtml(r.date || '-')}</td>
                <td style="padding:6px 8px;">${_escapeHtml(r.type || '입고')}</td>
                <td style="padding:6px 8px;"><input class="form-input pw-adjust-row" data-id="${r.id}" data-field="lotNo" value="${_escapeHtml(r.lotNo || '')}" placeholder="LOT"></td>
                <td style="padding:6px 8px;"><input class="form-input pw-adjust-row" data-id="${r.id}" data-field="paintingDate" value="${_escapeHtml(r.paintingDate || '')}" placeholder="도장 LOT"></td>
                <td style="padding:6px 8px;"><input type="number" min="0" class="form-input pw-adjust-row" data-id="${r.id}" data-field="quantity" value="${Number(r.quantity) || 0}" style="text-align:right;"></td>
                <td style="padding:6px 8px;color:var(--text-muted);font-size:0.78rem;">${_escapeHtml(r.source || '-')}</td>
            </tr>
        `).join('');
        wrap.innerHTML = `
            <div style="max-height:340px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:7px 8px;text-align:left;">날짜</th>
                            <th style="padding:7px 8px;text-align:left;">유형</th>
                            <th style="padding:7px 8px;text-align:left;">LOT</th>
                            <th style="padding:7px 8px;text-align:left;">도장 LOT</th>
                            <th style="padding:7px 8px;text-align:right;">수량</th>
                            <th style="padding:7px 8px;text-align:left;">출처</th>
                        </tr>
                    </thead>
                    <tbody>${html || `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted);">대상 재고 기록이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `;
    }

    async function saveStockAdjustment() {
        if (!_canWriteProductWarehouse()) {
            UIUtils.toast('제품 창고 입력 권한이 있는 사용자만 현재고를 보정할 수 있습니다.', 'warning');
            return;
        }
        const reason = _normalizeText((document.getElementById('pwAdjustReason') || {}).value);
        if (!reason) {
            UIUtils.toast('수정 사유를 입력하세요.', 'warning');
            return;
        }
        const inputs = Array.from(document.querySelectorAll('.pw-adjust-row'));
        if (!inputs.length) {
            UIUtils.toast('보정할 제품을 선택하세요.', 'warning');
            return;
        }
        const byId = {};
        inputs.forEach(input => {
            const id = input.dataset.id;
            const field = input.dataset.field;
            if (!byId[id]) byId[id] = {};
            byId[id][field] = field === 'quantity'
                ? Math.max(0, Math.round(Number(input.value) || 0))
                : _normalizeText(input.value);
        });

        const all = Storage.getAll(STORE) || [];
        const user = typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        const logs = [];
        for (const [id, changes] of Object.entries(byId)) {
            const old = all.find(r => r.id === id);
            if (!old) continue;
            const changed = ['lotNo', 'paintingDate', 'quantity'].some(field => String(old[field] ?? '') !== String(changes[field] ?? ''));
            if (!changed) continue;
            await Storage.update(STORE, id, changes);
            logs.push({
                id: Storage.generateId ? Storage.generateId() : `${Date.now()}_${Math.random()}`,
                date: UIUtils.today(),
                at: new Date().toISOString(),
                user: user ? (user.name || user.username || user.id || '') : '',
                reason,
                item: { carModel: old.carModel || '', partName: old.partName || '', color: old.color || '' },
                before: { lotNo: old.lotNo || '', paintingDate: old.paintingDate || '', quantity: Number(old.quantity) || 0 },
                after: { lotNo: changes.lotNo || '', paintingDate: changes.paintingDate || '', quantity: Number(changes.quantity) || 0 }
            });
        }
        if (!logs.length) {
            UIUtils.toast('변경된 내용이 없습니다.', 'info');
            return;
        }
        const prev = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        await Storage.setConfigValue('product_inventory_adjust_logs', [...logs, ...prev].slice(0, 200));
        UIUtils.closeModal();
        UIUtils.toast(`현재고 보정 ${logs.length}건이 저장되었습니다.`, 'success');
        loadData();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['날짜', '차종', '품명', '컬러', '수량', '유형', '출처'];
        const rows = data.map(d => [d.date, d.carModel||'', d.partName, d.color||'', d.quantity, d.type, d.source || '']);
        Storage.exportToCSV(headers, rows, '제품창고_재고');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        loadData,
        _switchTab,
        _switchTabOutside,
        _loadIncoming,
        _loadOutgoing,
        _showHistory,
        openLayout,
        openManualInModal,
        openManualOutModal,
        openAuditModal,
        _auditParse,
        _auditApply,
        _auditRevert,
        _onManualInCarChange,
        _onManualInPartChange,
        saveManualIn,
        _onManualOutCarChange,
        _onManualOutPartChange,
        _onManualOutLotChange,
        saveManualOut,
        _openLotAdjust,
        _saveLotAdjust,
        getShippingReadiness,
        openAddModal,
        renderAdjustPartOptions,
        renderAdjustRows,
        saveStockAdjustment,
        exportData,
        openInjIncoming,
        openPaintIncoming,
        openPaintWork,
        openPaintMix,
        openLaserWork,
        openInspTracePopup,
        traceIncoming
    };
})();


// ===================================================================
// 제품 출고
// ===================================================================
const ProductOutgoingModule = (function() {
    const STORE = DB.STORES.PRODUCT_OUTGOING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="ProductOutgoingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 출고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="prodOutStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="prodOutEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="ProductOutgoingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="prodOutStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>출고일</th>
                                        <th>품명</th>
                                        <th>수량</th>
                                        <th>거래처</th>
                                        <th>납품처</th>
                                        <th>차량번호</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="prodOutTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('prodOutStart').value;
        const end = document.getElementById('prodOutEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const totalQty = data.reduce((s, d) => s + (Number(d.quantity) || 0), 0);

        document.getElementById('prodOutStats').innerHTML = `
            <div class="stat-card green">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">출고 건수</div>
            </div>
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">총 출고량 (EA)</div>
            </div>
        `;

        const tbody = document.getElementById('prodOutTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.customer || '-'}</td>
                <td>${d.deliveryTo || '-'}</td>
                <td>${d.vehicleNo || '-'}</td>
                <td>${d.note || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="ProductOutgoingModule.edit('${d.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="ProductOutgoingModule.remove('${d.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('제품 출고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="addProdOutDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addProdOutPart" placeholder="품명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addProdOutQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">거래처</label>
                    <input type="text" class="form-input" id="addProdOutCustomer" placeholder="거래처명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="addProdOutDelivery" placeholder="납품처">
                </div>
                <div class="form-group">
                    <label class="form-label">차량번호</label>
                    <input type="text" class="form-input" id="addProdOutVehicle" placeholder="차량번호">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="addProdOutNote" placeholder="비고"></textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductOutgoingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addProdOutDate').value,
            partName: document.getElementById('addProdOutPart').value.trim(),
            quantity: Number(document.getElementById('addProdOutQty').value) || 0,
            customer: document.getElementById('addProdOutCustomer').value.trim(),
            deliveryTo: document.getElementById('addProdOutDelivery').value.trim(),
            vehicleNo: document.getElementById('addProdOutVehicle').value.trim(),
            note: document.getElementById('addProdOutNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 제품 창고에서 출고 처리
        await Storage.add(DB.STORES.PRODUCT_INVENTORY, {
            date: data.date,
            partName: data.partName,
            quantity: data.quantity,
            type: '출고',
            source: `${data.customer || ''} 납품`
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('제품 출고가 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        UIUtils.showModal('제품 출고 수정', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="editProdOutDate" value="${d.date}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="editProdOutPart" value="${d.partName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="editProdOutQty" value="${d.quantity || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">거래처</label>
                    <input type="text" class="form-input" id="editProdOutCustomer" value="${d.customer || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="editProdOutDelivery" value="${d.deliveryTo || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">차량번호</label>
                    <input type="text" class="form-input" id="editProdOutVehicle" value="${d.vehicleNo || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="editProdOutNote">${d.note || ''}</textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductOutgoingModule.saveEdit('${id}')">저장</button>
        `);
    }

    async function saveEdit(id) {
        await Storage.update(STORE, id, {
            date: document.getElementById('editProdOutDate').value,
            partName: document.getElementById('editProdOutPart').value.trim(),
            quantity: Number(document.getElementById('editProdOutQty').value) || 0,
            customer: document.getElementById('editProdOutCustomer').value.trim(),
            deliveryTo: document.getElementById('editProdOutDelivery').value.trim(),
            vehicleNo: document.getElementById('editProdOutVehicle').value.trim(),
            note: document.getElementById('editProdOutNote').value.trim()
        });
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['출고일', '품명', '수량', '거래처', '납품처', '차량번호', '비고'];
        const rows = data.map(d => [d.date, d.partName, d.quantity, d.customer || '', d.deliveryTo || '', d.vehicleNo || '', d.note || '']);
        Storage.exportToCSV(headers, rows, '제품출고');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();
