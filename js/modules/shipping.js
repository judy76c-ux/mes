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
    let _sstdCurrentKey = '';   // 현재 편집 중인 제품 key

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
            .ss-wait-table .col-src{min-width:3.8em;white-space:nowrap;}
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
                    <div class="card-header">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-orange);">pending_actions</span>
                            검사 대기
                        </h4>
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

        const waitingBody = document.getElementById('ssWaitingBody');
        if (!waitingBody) return;

        if (!waiting.length) {
            waitingBody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">
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
            return `
            <tr>
                <td class="col-date">${d.date || '-'}</td>
                <td class="col-src"><span style="font-size:0.78rem;font-weight:600;color:${srcColor(d.source)};">${srcLabel(d.source)}</span></td>
                <td class="col-car">${_esc(d.carModel || '-')}</td>
                <td class="col-part"><strong>${_esc(d.partName || '-')}</strong></td>
                <td class="col-color">${_esc(d.color || '-')}</td>
                <td class="col-lot">${_esc(d.paintingDate || '-')}</td>
                <td class="col-lot">${_esc(d.lotNo || '-')}</td>
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
            <tr style="cursor:pointer;" onclick="ShippingStandbyModule._showDetail('${d.id}', event)">
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
                <td></td>
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
        const confirmMsg = isPaintingSource
            ? '삭제하면 도장 검사 일지가 외관 검사 대기 상태로 복원됩니다. 삭제하시겠습니까?'
            : '대기 항목을 삭제하시겠습니까?';

        UIUtils.confirm(confirmMsg, async () => {
            if (isPaintingSource) {
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
        const headers = ['검사일', '납품처', '차종', '제품명', '컬러', '도장LOT', '사출LOT',
            'LOT수량', '샘플수', '불량수', '판정', '검사자', '비고'];
        const rows = data.map(d => [
            d.date, d.customer||'', d.carModel||'', d.partName||'', d.color||'',
            d.paintingDate||'', d.lotNo||'',
            d.lotSize||0, d.sampleQty||0, d.defectQty||0,
            d.result||'', d.inspector||'', d.note||''
        ]);
        Storage.exportToCSV(headers, rows, '출하검사이력');
        UIUtils.toast('내보내기 완료', 'success');
    }

    const SHIP_STD_CONFIG_KEY = 'shipping_inspection_standards_v1';

    function _stdProductKey(product) {
        return product.id || `${product.carModel || ''}||${product.partName || ''}||${product.color || ''}`;
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

    // 문서형 기준서 기본 검사항목 — 외관 / 신뢰성 구분
    const _SSTD_DEFAULT_APPEARANCE = [
        { group: 'appearance', item: '외관',        standard: 'BURR, SINK MARK 및 유해한 흠이 없을 것.', method: '육안', sample: '10EA/LOT', management: '출하검사성적서' },
        { group: 'appearance', item: '외관(PAINT)', standard: '표면에 스크래치, 흑점, 이물질이 없을 것.',    method: '육안', sample: '10EA/LOT', management: '출하검사성적서' },
        { group: 'appearance', item: '', standard: '', method: '', sample: '', management: '' }
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
        return _sstdPointsForGroup(std.checkPoints || [], want).map(p => ({
            group: want,
            item: p.item || '',
            standard: p.standard || '',
            method: p.method || '',
            sample: p.sample || '',
            management: p.management || '',
            resultValue: '',
            judge: ''
        }));
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

    // 이미지 정규화 (string 또는 {src,h,label})
    function _sstdNormImg(v) {
        if (typeof v === 'string') return { src: v, h: 100, label: '' };
        return { src: (v && v.src) || '', h: (v && v.h) || 100, label: (v && v.label) || '' };
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
            d.checkPoints = d.checkPoints.map(p => Object.assign({}, p || {}, { group: _sstdGuessGroup(p) }));
        }
        return d;
    }

    async function openShippingStandardList() {
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || [])
            .slice()
            .sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
                (a.partName || '').localeCompare(b.partName || '', 'ko') ||
                (a.color || '').localeCompare(b.color || '', 'ko'));
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
            .sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
                (a.partName || '').localeCompare(b.partName || '', 'ko') ||
                (a.color || '').localeCompare(b.color || '', 'ko'));
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
    const _SSTD_HDL  = 'position:absolute;width:10px;height:10px;background:#2563eb;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:10;';

    function _sstdCheckRowHtml(pt, idx) {
        pt = pt || {};
        const group = _sstdGuessGroup(pt);
        const muted = group === 'hidden' ? 'opacity:0.55;' : '';
        return `<tr class="sstd-pt-row" data-group="${group}" style="${muted}">
            <td class="sstd-pt-no" style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;white-space:nowrap;">${idx == null ? '-' : idx + 1}</td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-item" type="text" value="${_esc(pt.item || '')}"
                style="border:none;background:transparent;font-size:10px;padding:2px;width:auto;min-width:5em;white-space:nowrap;"></td>
            <td style="padding:4px 2px;border:1px solid #bbb;"><div class="sstd-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;min-height:1.5em;">${_esc(pt.standard || '')}</div></td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-method" type="text" value="${_esc(pt.method || '')}"
                style="border:none;background:transparent;font-size:10px;padding:2px;text-align:center;width:auto;min-width:3em;"></td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-sample" type="text" value="${_esc(pt.sample || '')}"
                style="border:none;background:transparent;font-size:8px;padding:2px;text-align:center;width:auto;min-width:4em;"></td>
            <td style="padding:2px;border:1px solid #bbb;white-space:nowrap;"><input class="sstd-pt-mgmt" type="text" value="${_esc(pt.management || '')}"
                style="border:none;background:transparent;font-size:8px;padding:2px;width:auto;min-width:6em;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <select class="sstd-pt-group-sel" title="구분 변경"
                    onchange="ShippingStandbyModule._sstdChangeCheckGroup(this)"
                    style="font-size:9px;border:1px solid #ccc;border-radius:3px;padding:1px 2px;vertical-align:middle;max-width:4.8em;background:#fff;">
                    <option value="appearance"${group === 'appearance' ? ' selected' : ''}>외관</option>
                    <option value="reliability"${group === 'reliability' ? ' selected' : ''}>신뢰성</option>
                    <option value="hidden"${group === 'hidden' ? ' selected' : ''}>숨김</option>
                </select>
                <button type="button" onclick="ShippingStandbyModule._sstdInsertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;vertical-align:middle;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove();ShippingStandbyModule._sstdRefreshCheckLayout()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;vertical-align:middle;" title="행 삭제">−</button>
            </td></tr>`;
    }

    function _sstdBuildCheckBodyHtml(checkPoints) {
        const { appearance, reliability, hidden } = _sstdSplitCheckPoints(checkPoints);
        let n = 0;
        const app = appearance.length ? appearance : [{ group: 'appearance' }];
        const reli = reliability.length ? reliability : [{ group: 'reliability' }];
        const hid = hidden; // 숨김은 비어 있으면 섹션 생략 (행 추가는 구분 메뉴로)
        return app.map(pt => _sstdCheckRowHtml(Object.assign({ group: 'appearance' }, pt), n++)).join('')
            + reli.map(pt => _sstdCheckRowHtml(Object.assign({ group: 'reliability' }, pt), n++)).join('')
            + hid.map(pt => _sstdCheckRowHtml(Object.assign({ group: 'hidden' }, pt), n++)).join('');
    }

    function _sstdGroupedStaticRowsHtml(checkPoints, forPrint) {
        const { appearance, reliability } = _sstdSplitCheckPoints(checkPoints);
        let n = 0;
        const cellPad = forPrint ? '' : 'padding:3px;border:1px solid #bbb;font-size:10px;';
        const block = (list, label, tone) => {
            const items = list.length ? list : [{ item: '', standard: '항목 없음', method: '', sample: '', management: '' }];
            return items.map((pt, idx) => {
                n += 1;
                const groupTd = idx === 0
                    ? `<td rowspan="${items.length}" style="${cellPad}width:auto;max-width:1.4em;background:${tone};font-weight:700;text-align:center;vertical-align:middle;writing-mode:vertical-rl;letter-spacing:2px;white-space:nowrap;">${label}</td>`
                    : '';
                return `<tr>
                    ${groupTd}
                    <td style="${cellPad}text-align:center;white-space:nowrap;">${n}</td>
                    <td style="${cellPad}white-space:nowrap;">${_esc(pt.item || '')}</td>
                    <td style="${cellPad}white-space:pre-wrap;">${_esc(pt.standard || '')}</td>
                    <td style="${cellPad}text-align:center;white-space:nowrap;">${_esc(pt.method || '')}</td>
                    <td style="${cellPad}text-align:center;white-space:nowrap;font-size:8px;">${_esc(pt.sample || '')}</td>
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

    function _sstdRevRowHtml(r) {
        r = r || {};
        const hasCf = !!String(r.confirmer || '').trim();
        return `<tr style="height:32px;">
            <td style="padding:2px;border:1px solid #bbb;"><input class="sstd-rev-no" type="text" value="${_esc(r.no || '')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="sstd-rev-date" type="text" value="${_esc(r.date || '')}"
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
            <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:150px;color:#bbb;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:32px;">content_paste</span>
                <span style="font-size:.75rem;">클릭 후 Ctrl+V 또는 파일 선택</span>
            </div>`;
        return images.map((img, i) => {
            const o = _sstdNormImg(img);
            return `
            <div class="sstd-img-card" data-idx="${i}" draggable="true"
                ondragstart="ShippingStandbyModule._sstdDragStart(event,${i})"
                ondragover="ShippingStandbyModule._sstdDragOver(event)"
                ondrop="ShippingStandbyModule._sstdDragDrop(event,${i})"
                ondragend="ShippingStandbyModule._sstdDragEnd(event)"
                style="position:relative;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;user-select:none;cursor:grab;">
                <div style="padding:2px 22px 2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;">
                    <input type="text" value="${_esc(o.label)}" placeholder="라벨 (예: 외관)"
                        onchange="ShippingStandbyModule._sstdUpdateImgLabel(${i},this.value)"
                        onclick="event.stopPropagation()"
                        style="width:100%;border:none;background:transparent;font-size:10px;outline:none;"></div>
                <div class="sstd-img-wrap" style="position:relative;overflow:visible;">
                    <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
                    <div style="${_SSTD_HDL}top:-5px;left:-5px;cursor:nw-resize;" onmousedown="event.stopPropagation();ShippingStandbyModule._sstdStartResize(event,${i},'nw')"></div>
                    <div style="${_SSTD_HDL}top:-5px;right:-5px;cursor:ne-resize;" onmousedown="event.stopPropagation();ShippingStandbyModule._sstdStartResize(event,${i},'ne')"></div>
                    <div style="${_SSTD_HDL}bottom:-5px;left:-5px;cursor:sw-resize;" onmousedown="event.stopPropagation();ShippingStandbyModule._sstdStartResize(event,${i},'sw')"></div>
                    <div style="${_SSTD_HDL}bottom:-5px;right:-5px;cursor:se-resize;" onmousedown="event.stopPropagation();ShippingStandbyModule._sstdStartResize(event,${i},'se')"></div>
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
        const _rawRevs = (data.revisions || []).filter(r => !!(r.no || r.reason));
        const revs = _rawRevs.length ? _rawRevs : [{ no: '00', date: data.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revs.map(_sstdRevRowHtml).join('');

        const carModel = product.carModel || data.carModel || '';
        const sameCarProducts = products.filter(p => String(p.carModel || '').trim() === String(carModel || '').trim());
        const sameCarOthers = sameCarProducts
            .filter(p => _stdProductKey(p) !== key)
            .slice()
            .sort((a, b) => (a.partName || '').localeCompare(b.partName || '', 'ko') ||
                (a.color || '').localeCompare(b.color || '', 'ko'));
        const applyPickHtml = sameCarOthers.length ? `
            <div id="sstdApplyPickPanel" style="width:100%;margin-top:2px;padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;">
                    <span style="font-size:0.78rem;font-weight:700;color:#334155;">동일 차종 다른 품목에도 적용
                        <span style="font-weight:400;color:#64748b;">(${_esc(carModel)} · 선택 <span id="sstdApplyPickCount">0</span> / ${sameCarOthers.length})</span>
                    </span>
                    <span style="margin-left:auto;display:inline-flex;gap:4px;">
                        <button type="button" class="btn btn-sm btn-outline" style="height:26px;padding:0 8px;font-size:0.72rem;"
                            onclick="ShippingStandbyModule._sstdApplyPickAll(true)">전체 선택</button>
                        <button type="button" class="btn btn-sm btn-outline" style="height:26px;padding:0 8px;font-size:0.72rem;"
                            onclick="ShippingStandbyModule._sstdApplyPickAll(false)">선택 해제</button>
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 10px;max-height:132px;overflow:auto;">
                    ${sameCarOthers.map(p => {
                        const pk = _stdProductKey(p);
                        const label = [p.partName, p.color].filter(Boolean).join(' · ') || pk;
                        return `<label style="display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_esc(label)}">
                            <input type="checkbox" class="sstd-apply-target" value="${_esc(pk)}"
                                onchange="ShippingStandbyModule._sstdUpdateApplyPickCount()">
                            <span style="overflow:hidden;text-overflow:ellipsis;">${_esc(label)}</span>
                        </label>`;
                    }).join('')}
                </div>
            </div>` : '';
        const loadOpts = products
            .filter(p => {
                const k = _stdProductKey(p);
                return k !== key && !!standards[k];
            })
            .map(p => {
                const k = _stdProductKey(p);
                const label = [p.carModel, p.partName, p.color].filter(Boolean).join(' | ');
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
            #sstdDoc .sstd-split-left { width:360px; max-width:360px; }
            #sstdDoc .sstd-pt-table { width:max-content; min-width:100%; table-layout:auto; }
            #sstdDoc .sstd-pt-table .doc-th { white-space:nowrap; }
            #sstdDoc .sstd-pt-table .sstd-pt-std { white-space:pre-wrap; min-width:10em; }
            </style>`;

        UIUtils.showModal(`출하검사 기준서 ${isEdit ? '수정' : '등록'} — ${_stdProductLabel(product)}`, `
        ${docStyle}
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <span style="font-size:0.8rem;font-weight:700;white-space:nowrap;">기존 기준서 불러오기</span>
            <select id="sstdLoadFrom" class="form-select" style="flex:1;min-width:220px;height:34px;font-size:0.82rem;">
                <option value="">— 차종 | 품명 | 컬러 선택 —</option>
                ${loadOpts || '<option value="" disabled>등록된 다른 기준서 없음</option>'}
            </select>
            <button type="button" class="btn btn-sm btn-outline" onclick="ShippingStandbyModule._sstdLoadFromRegistered()">
                <span class="material-symbols-outlined" style="font-size:14px;">download</span> 불러오기
            </button>
            ${applyPickHtml}
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
        <table class="sstd-split" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col style="width:360px"><col></colgroup>
            <tr>
                <td class="sstd-split-left" style="width:360px;border:1px solid #888;padding:0;height:1px;vertical-align:top;">
                    <div class="doc-sec" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;">
                        <span>외관 / 치수포인트</span>
                        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:.72rem;font-weight:400;color:#2563eb;white-space:nowrap;">
                            <span class="material-symbols-outlined" style="font-size:14px;">add_photo_alternate</span>
                            <input type="file" accept="image/*" multiple style="display:none;" onchange="ShippingStandbyModule._sstdAddImages(this)">
                        </label>
                    </div>
                    <div id="sstdImgPasteZone" tabindex="0"
                        onpaste="ShippingStandbyModule._sstdOnPaste(event)"
                        onfocus="this.style.outline='2px dashed #2563eb';this.style.outlineOffset='-3px'"
                        onblur="this.style.outline='none'" onclick="this.focus()"
                        style="outline:none;padding:6px;cursor:pointer;display:flex;flex-direction:column;height:calc(100% - 28px);">
                        <div id="sstdImgGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;flex:1;align-content:start;">
                            ${_sstdRenderImgGrid(_sstdImages)}
                        </div>
                    </div>
                </td>
                <td class="sstd-split-right" style="vertical-align:top;border:1px solid #888;padding:0;height:100%;">
                    <div class="doc-sec">주요검사 Point <span style="font-weight:400;font-size:10px;color:#555;">(외관 / 신뢰성 · 행마다 구분 선택)</span></div>
                    <div style="overflow:auto;">
                    <table class="sstd-pt-table" style="font-size:10px;width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                        <thead><tr>
                            <td class="doc-th" style="white-space:nowrap;">구분</td>
                            <td class="doc-th" style="white-space:nowrap;">No</td>
                            <td class="doc-th" style="white-space:nowrap;">항 목</td>
                            <td class="doc-th" style="min-width:10em;">기 준</td>
                            <td class="doc-th" style="white-space:nowrap;">확인방법</td>
                            <td class="doc-th" style="white-space:nowrap;font-size:8px;">시 료</td>
                            <td class="doc-th" style="white-space:nowrap;font-size:8px;">관리방안</td>
                            <td class="doc-th" style="white-space:nowrap;">구분/±</td>
                        </tr></thead>
                        <tbody id="sstdCheckBody">${ptRows}</tbody>
                    </table>
                    </div>
                </td>
            </tr>
        </table>
        <table class="sstd-bottom" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col style="width:48%"><col style="width:52%"></colgroup>
            <tr>
                <td style="vertical-align:top;border:1px solid #888;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;">
                        <textarea id="sstdProcedure"
                            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                            style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;">${_esc(data.procedure || '')}</textarea>
                    </div>
                </td>
                <td style="vertical-align:top;border:1px solid #888;padding:0;height:1px;">
                    <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;table-layout:auto;">
                        <colgroup><col style="width:1%"><col style="width:1%"><col style="width:1%"><col><col style="width:1%"><col style="width:1%"></colgroup>
                        <tbody>
                        <tr>
                            <td colspan="6" style="padding:0;border:none;">
                                <div class="doc-sec" style="border:none;border-bottom:1px solid #888;">조 치 사 항</div>
                                <div style="padding:6px;">
                                    <textarea id="sstdCorrective"
                                        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                                        style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;">${_esc(data.corrective || '')}</textarea>
                                </div>
                            </td>
                        </tr>
                        </tbody>
                        <tbody id="sstdRevBody">
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                            <td class="doc-th">NO</td>
                            <td class="doc-th">개정일자</td>
                            <td class="doc-th">개정사유</td>
                            <td class="doc-th">확 인</td>
                            <td class="doc-th" style="text-align:right;">
                                <button type="button" onclick="ShippingStandbyModule._sstdAddRevRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr>
                        ${revRows}
                        </tbody>
                    </table>
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
            <button class="btn btn-primary" onclick="ShippingStandbyModule.saveShippingStandard('${encodeURIComponent(key)}')">저장</button>
        `, 'xl');

        setTimeout(() => {
            ['sstdProcedure', 'sstdCorrective'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
            });
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
        UIUtils.toast('기존 기준서 내용을 불러왔습니다. (품목 정보는 유지)', 'success');
        await openShippingStandardEditor(encodeURIComponent(curKey), src);
    }

    function _sstdCloneForProduct(base, product) {
        const copy = JSON.parse(JSON.stringify(base || {}));
        copy.carModel = product.carModel || '';
        copy.partName = product.partName || '';
        copy.color = product.color || '';
        copy.itemType = product.itemType || copy.itemType || '';
        copy.updatedAt = new Date().toISOString();
        return copy;
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

    async function saveShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const g = id => (document.getElementById(id) || {}).value || '';
        const partName = g('sstdPartName').trim();
        if (!partName) { UIUtils.toast('품명을 입력하세요.', 'warning'); return; }

        const checkPoints = [];
        document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row').forEach(tr => {
            const item = (tr.querySelector('.sstd-pt-item') || {}).value || '';
            const stdEl = tr.querySelector('.sstd-pt-std');
            const standard = stdEl ? (stdEl.value !== undefined ? stdEl.value : (stdEl.innerText || stdEl.textContent || '')) : '';
            const method = (tr.querySelector('.sstd-pt-method') || {}).value || '';
            const sample = (tr.querySelector('.sstd-pt-sample') || {}).value || '';
            const management = (tr.querySelector('.sstd-pt-mgmt') || {}).value || '';
            const group = _sstdNormGroup(tr.getAttribute('data-group'));
            if (item || standard) checkPoints.push({ item, standard, method, sample, management, group });
        });

        const revisions = [];
        document.querySelectorAll('#sstdRevBody tr').forEach(tr => {
            const no = (tr.querySelector('.sstd-rev-no') || {}).value || '';
            const date = (tr.querySelector('.sstd-rev-date') || {}).value || '';
            const reason = (tr.querySelector('.sstd-rev-reason') || {}).value || '';
            const confirmer = (tr.querySelector('.sstd-rev-confirmer') || {}).value || '';
            if (no || reason) revisions.push({ no, date, reason, confirmer });
        });

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
            updatedAt:   new Date().toISOString()
        };

        const applyKeys = Array.from(document.querySelectorAll('.sstd-apply-target:checked'))
            .map(el => String(el.value || '').trim())
            .filter(Boolean);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const applyTargets = applyKeys.length
            ? products.filter(p => applyKeys.includes(_stdProductKey(p)))
            : [];

        const doSave = async () => {
            const standards = await _loadShipStandards();
            standards[key] = payload;
            let applied = 0;
            applyTargets.forEach(p => {
                const pk = _stdProductKey(p);
                if (pk === key) return;
                standards[pk] = _sstdCloneForProduct(payload, p);
                applied++;
            });
            const missingSeal = [
                payload.author && !payload.authorSeal ? payload.author : '',
                payload.reviewer && !payload.reviewerSeal ? payload.reviewer : '',
                payload.approver && !payload.approverSeal ? payload.approver : ''
            ].filter(Boolean);
            await _saveShipStandards(standards);
            if (applied > 0) {
                UIUtils.toast(`저장됨. 선택 ${applied + 1}개 품목에 적용되었습니다.`, 'success');
            } else if (missingSeal.length) {
                UIUtils.toast(`저장됨. 날인 미등록: ${missingSeal.join(', ')} (설정>사용자에서 날인 등록)`, 'warning');
            } else {
                UIUtils.toast('출하검사 기준서가 저장되었습니다.', 'success');
            }
            _sstdCloseModal();
            _sstdRefreshListAfterSave();
        };

        if (applyTargets.length > 0) {
            const names = applyTargets
                .map(p => [p.partName, p.color].filter(Boolean).join(' · '))
                .filter(Boolean)
                .slice(0, 8);
            const more = applyTargets.length > names.length ? ` 외 ${applyTargets.length - names.length}건` : '';
            UIUtils.confirm(
                `선택한 ${applyTargets.length}개 품목에도 이 기준서를 적용합니다.\n(${names.join(', ')}${more})\n기존 등록분은 덮어씁니다. 계속할까요?`,
                () => { doSave(); }
            );
            return;
        }
        await doSave();
    }

    function _sstdUpdateApplyPickCount() {
        const all = document.querySelectorAll('.sstd-apply-target');
        const checked = document.querySelectorAll('.sstd-apply-target:checked');
        const el = document.getElementById('sstdApplyPickCount');
        if (el) el.textContent = String(checked.length);
        void all;
    }

    function _sstdApplyPickAll(on) {
        document.querySelectorAll('.sstd-apply-target').forEach(el => { el.checked = !!on; });
        _sstdUpdateApplyPickCount();
    }

    async function viewShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const standards = await _loadShipStandards();
        const data = _sstdNormalize(standards[key], product);

        const ptRows = _sstdViewCheckRowsHtml(data.checkPoints || []);

        const _rawRevs = (data.revisions || []).filter(r => !!(r.no || r.reason));
        const revs = _rawRevs.length ? _rawRevs : [{ no: '00', date: data.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revs.map(r => {
            const cf = r.confirmer || '';
            return `<tr style="height:32px;">
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.no || '')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.date || '')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.reason || '')}</td>
            <td style="padding:${cf ? '2px' : '0'};border:1px solid #bbb;text-align:center;vertical-align:middle;${cf ? '' : 'background:' + _SSTD_DIAG}">${cf ? _sstdConfirmerViewHtml(cf) : ''}</td>
        </tr>`;}).join('');

        const imgs = (data.images || []).map(_sstdNormImg);
        const imgHtml = imgs.length ? imgs.map(o => `
            <div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;">
                ${o.label ? `<div style="padding:2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;font-size:10px;font-weight:700;">${_esc(o.label)}</div>` : ''}
                <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
            </div>`).join('')
            : `<div style="display:flex;align-items:center;justify-content:center;min-height:120px;color:#bbb;font-size:.8rem;">이미지 없음</div>`;

        UIUtils.showModal('출하검사 기준서 보기', `
        <style>
            #sstdViewDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #sstdViewDoc table { border-collapse:collapse; width:100%; }
            #sstdViewDoc td, #sstdViewDoc th { border:1px solid #888; padding:3px 6px; vertical-align:middle; }
            #sstdViewDoc .dth { background:#d0e4f7; font-weight:700; text-align:center; }
            #sstdViewDoc .dlb { background:#f0f0f0; font-weight:700; text-align:center; white-space:nowrap; }
            #sstdViewDoc .dsec { background:#d0e4f7; font-weight:700; text-align:center; padding:5px; font-size:12px; border:none !important; border-bottom:1px solid #888 !important; }
            #sstdViewDoc > table + table { margin-top:-1px; }
            #sstdViewDoc td > table { border-collapse:collapse; width:100%; }
            #sstdViewDoc td > table > tbody > tr:first-child > td { border-top:none; }
        </style>
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
                <colgroup><col style="width:360px"><col></colgroup>
                <tr>
                    <td class="sstd-split-left" style="width:360px;vertical-align:top;padding:0;">
                        <div class="dsec">외관 / 치수포인트</div>
                        <div style="padding:6px;display:grid;grid-template-columns:${imgs.length > 1 ? '1fr 1fr' : '1fr'};gap:4px;">${imgHtml}</div>
                    </td>
                    <td class="sstd-split-right" style="vertical-align:top;padding:0;">
                        <div class="dsec">주요검사 Point <span style="font-weight:400;font-size:10px;">(외관 / 신뢰성)</span></div>
                        <div style="overflow:auto;">
                        <table class="sstd-pt-table" style="font-size:10px;width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
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
                <colgroup><col style="width:48%"><col style="width:52%"></colgroup>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">검 사 순 서</div>
                        <div style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(data.procedure || '')}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;height:1px;">
                        <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;table-layout:auto;">
                            <colgroup><col style="width:1%"><col style="width:1%"><col style="width:1%"><col><col style="width:1%"></colgroup>
                            <tr><td colspan="5" class="dsec">조 치 사 항</td></tr>
                            <tr><td colspan="5" style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;vertical-align:top;">${_esc(data.corrective || '')}</td></tr>
                            <tr style="height:24px;">
                                <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                <td class="dth">NO</td><td class="dth">개정일자</td><td class="dth">개정사유</td><td class="dth">확 인</td>
                            </tr>
                            ${revRows}
                        </table>
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
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-outline" onclick="UIUtils.closeModal();ShippingStandbyModule._sstdPrint('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">print</span> 출력</button>
            <button class="btn btn-primary" onclick="UIUtils.closeModal();ShippingStandbyModule.openShippingStandardEditor('${encodeURIComponent(key)}')"><span class="material-symbols-outlined">edit</span> 편집</button>
        `, 'xl');
    }

    async function _sstdPrint(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const standards = await _loadShipStandards();
        if (!standards[key]) { UIUtils.toast('저장 후 출력할 수 있습니다.', 'info'); return; }
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const std = _sstdNormalize(standards[key], product);
        const px2mm = px => (Number(px) * 0.2646).toFixed(1);

        const ptRows = _sstdPrintCheckRowsHtml(std.checkPoints || []);

        const imgHtml = (std.images || []).map(_sstdNormImg).map(o => `<div style="border:1px solid #ccc;padding:2px;">
                ${o.label ? `<div style="font-size:9px;font-weight:700;text-align:center;padding:2px 0;background:#e8edf2;">${_esc(o.label)}</div>` : ''}
                <img src="${o.src}" style="height:${px2mm(o.h)}mm;max-width:100%;"></div>`).join('');

        const _rawRevs = (std.revisions || []).filter(r => !!(r.no || r.reason));
        const revsP = _rawRevs.length ? _rawRevs : [{ no: '00', date: std.createdDate || UIUtils.today(), reason: '최초 작성', confirmer: '' }];
        const revRows = revsP.map(r => {
            const cf = r.confirmer || '';
            const diagBg = cf ? '' : 'background:linear-gradient(to top right,transparent calc(50% - 0.5px),#999 calc(50% - 0.5px),#999 calc(50% + 0.5px),transparent calc(50% + 0.5px));';
            return `<tr style="height:30px;"><td style="text-align:center;">${_esc(r.no || '')}</td>
            <td style="text-align:center;">${_esc(r.date || '')}</td><td style="text-align:center;">${_esc(r.reason || '')}</td>
            <td style="padding:${cf ? '2px' : '0'};text-align:center;vertical-align:middle;${diagBg}">${cf ? _sstdConfirmerViewHtml(cf) : ''}</td></tr>`;}).join('');

        const win = window.open('', '_blank', 'width=960,height=720');
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
            @media print{html,body{width:281mm;}}
        </style></head><body>
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
            <colgroup><col style="width:360px"><col></colgroup>
            <tr>
                <td class="sstd-split-left" style="width:360px;vertical-align:top;padding:0;">
                    <div class="doc-sec">외관 / 치수포인트</div>
                    <div style="padding:4px;display:grid;grid-template-columns:${(std.images || []).length > 1 ? '1fr 1fr' : '1fr'};gap:4px;align-items:start;">${imgHtml || '<div style="text-align:center;padding:20px;color:#aaa;">이미지 없음</div>'}</div>
                </td>
                <td class="sstd-split-right" style="vertical-align:top;padding:0;">
                    <div class="doc-sec">주요검사 Point (외관 / 신뢰성)</div>
                    <table class="sstd-pt-table" style="font-size:10px;width:max-content;min-width:100%;table-layout:auto;">
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
            <colgroup><col style="width:48%"><col style="width:52%"></colgroup>
            <tr>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.procedure || '')}</div>
                </td>
                <td style="vertical-align:top;padding:0;height:1px;">
                    <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;table-layout:auto;">
                        <colgroup><col style="width:1%"><col style="width:1%"><col style="width:1%"><col><col style="width:1%"></colgroup>
                        <tr><td colspan="5" class="doc-sec">조 치 사 항</td></tr>
                        <tr><td colspan="5" style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;vertical-align:top;">${_esc(std.corrective || '')}</td></tr>
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;">개정내용</td>
                            <th class="doc-th">NO</th><th class="doc-th">개정일자</th><th class="doc-th">개정사유</th><th class="doc-th">확 인</th>
                        </tr>
                        ${revRows}
                    </table>
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
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
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
    function _sstdDragStart(e, idx) { _sstdDragIdx = idx; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.5'; }
    function _sstdDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    function _sstdDragEnd(e) { e.currentTarget.style.opacity = ''; _sstdDragIdx = -1; }
    function _sstdDragDrop(e, toIdx) {
        e.preventDefault();
        if (_sstdDragIdx < 0 || _sstdDragIdx === toIdx) return;
        const imgs = _sstdImages.map(_sstdNormImg);
        const moved = imgs.splice(_sstdDragIdx, 1)[0];
        imgs.splice(toIdx, 0, moved);
        _sstdImages = imgs;
        const g = document.getElementById('sstdImgGrid');
        if (g) g.innerHTML = _sstdRenderImgGrid(_sstdImages);
    }
    function _sstdStartResize(e, idx, dir) {
        e.preventDefault();
        _sstdImages = _sstdImages.map(_sstdNormImg);
        const startY = e.clientY;
        const startH = _sstdImages[idx].h;
        const card = document.querySelectorAll('.sstd-img-card')[idx];
        const imgEl = card ? card.querySelector('img') : null;
        if (card) card.draggable = false;
        function onMove(ev) {
            const dy = dir.includes('s') ? ev.clientY - startY : startY - ev.clientY;
            const newH = Math.max(50, Math.min(400, startH + dy));
            _sstdImages[idx].h = newH;
            if (imgEl) imgEl.style.height = newH + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (card) card.draggable = true;
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /* ── 검사 Point / 개정 행 ── */
    function _sstdRenumberCheckRows() {
        let n = 0;
        document.querySelectorAll('#sstdCheckBody tr.sstd-pt-row .sstd-pt-no').forEach(td => {
            n += 1;
            td.textContent = String(n);
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
        _sstdRefreshCheckLayout();
    }

    function _sstdAddCheckRow(group) {
        group = _sstdNormGroup(group);
        const spot = _sstdFindSectionInsertPoint(group);
        if (!spot || !spot.parent) return;
        const wrap = document.createElement('tbody');
        wrap.innerHTML = _sstdCheckRowHtml({ group }, null);
        const newTr = wrap.firstElementChild;
        if (!newTr) return;
        if (spot.before) {
            spot.parent.insertBefore(newTr, spot.before);
        } else if (spot.after && spot.after.nextSibling) {
            spot.parent.insertBefore(newTr, spot.after.nextSibling);
        } else if (spot.after) {
            spot.parent.appendChild(newTr);
        } else {
            spot.parent.appendChild(newTr);
        }
        _sstdRefreshCheckLayout();
    }

    function _sstdInsertCheckRowAfter(btn) {
        let el = btn; while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el || !el.parentNode) return;
        const group = _sstdRowGroup(el);
        const wrap = document.createElement('tbody');
        wrap.innerHTML = _sstdCheckRowHtml({ group }, null);
        const tr = wrap.firstElementChild;
        if (!tr) return;
        let next = el.nextElementSibling;
        if (next) el.parentNode.insertBefore(tr, next); else el.parentNode.appendChild(tr);
        _sstdRefreshCheckLayout();
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

    return {
        render, loadData, loadHistory,
        onHistoryCarChange,
        _showDetail,
        removeStandby, removeHistory, exportHistory,
        openShippingStandardList, openShippingStandardEditor,
        saveShippingStandard, viewShippingStandard, renderStandardListInto,
        findShipStandard, getCheckPointsForProduct,
        loadShipStandards: _loadShipStandards,
        summarizeCheckPoints: _stdPointsSummary,
        // 출하검사 기준서 문서형 편집기 핸들러
        _sstdPrint, _sstdCloseModal,
        _sstdAddImages, _sstdOnPaste, _sstdRemoveImage, _sstdUpdateImgLabel,
        _sstdDragStart, _sstdDragOver, _sstdDragEnd, _sstdDragDrop, _sstdStartResize,
        _sstdAddCheckRow, _sstdInsertCheckRowAfter, _sstdRenumberCheckRows, _sstdRefreshCheckLayout,
        _sstdChangeCheckGroup,
        _sstdAddRevRow, _sstdInsertRevRowAfter, _sstdOnCfInput,
        _sstdLoadFromRegistered,
        _sstdFilterList,
        _sstdApplyPickAll, _sstdUpdateApplyPickCount,
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
    function _siItemRowHtml(it) {
        it = it || {};
        const opt = (v) => `<option value="${v}" ${it.judge === v ? 'selected' : ''}>${v || '—'}</option>`;
        return `<tr>
            <td style="padding:3px;white-space:nowrap;"><input class="si-item form-input" value="${_esc(it.item || '')}" style="font-size:0.82rem;padding:4px 6px;min-width:5em;"></td>
            <td style="padding:3px;"><input class="si-std form-input" value="${_esc(it.standard || '')}" style="font-size:0.82rem;padding:4px 6px;width:100%;"></td>
            <td style="padding:3px;white-space:nowrap;"><input class="si-method form-input" value="${_esc(it.method || '')}" style="font-size:0.82rem;padding:4px 6px;min-width:3em;"></td>
            <td style="padding:3px;white-space:nowrap;"><input class="si-sample form-input" value="${_esc(it.sample || '')}" style="font-size:0.82rem;padding:4px 6px;min-width:4em;"></td>
            <td style="padding:3px;"><input class="si-result form-input" value="${_esc(it.resultValue || '')}" placeholder="결과" style="font-size:0.82rem;padding:4px 6px;"></td>
            <td style="padding:3px;text-align:center;">
                <select class="si-judge form-select" style="font-size:0.82rem;padding:4px 6px;width:88px;">
                    ${opt('')}${opt('합격')}${opt('불합격')}${opt('N/A')}
                </select>
            </td>
            <td style="padding:3px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="this.closest('tr').remove()">×</button>
            </td>
        </tr>`;
    }

    function _buildForm(sb, checkItems, stdHint) {
        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];
        const inspectorOptions = inspectors.map(i =>
            `<option value="${i.name || ''}">${i.name || ''}</option>`).join('');
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
                        ${stdHint ? `<span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">${_esc(stdHint)}</span>` : ''}
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
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <table class="data-table" style="margin:0;width:100%;table-layout:auto;border-collapse:collapse;">
                        <thead><tr>
                            <th style="white-space:nowrap;">항목</th><th>기준</th><th style="white-space:nowrap;">확인방법</th>
                            <th style="white-space:nowrap;">시료</th><th style="white-space:nowrap;">결과</th>
                            <th style="text-align:center;white-space:nowrap;">판정</th><th style="width:40px;"></th>
                        </tr></thead>
                        <tbody id="siItemsBody">${items.length ? items.map(_siItemRowHtml).join('') : _siItemRowHtml({})}</tbody>
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
                            value="0" min="0">
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
        const tr = document.createElement('tr');
        tr.innerHTML = _siItemRowHtml({});
        tb.appendChild(tr);
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
        tb.innerHTML = fromStd.map(_siItemRowHtml).join('');
        UIUtils.toast(`기준서 외관 항목 ${fromStd.length}건을 불러왔습니다.`, 'success');
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

        const items = [];
        document.querySelectorAll('#siItemsBody tr').forEach(tr => {
            const item = (tr.querySelector('.si-item') || {}).value || '';
            const standard = (tr.querySelector('.si-std') || {}).value || '';
            const method = (tr.querySelector('.si-method') || {}).value || '';
            const sample = (tr.querySelector('.si-sample') || {}).value || '';
            const resultValue = (tr.querySelector('.si-result') || {}).value || '';
            const judge = (tr.querySelector('.si-judge') || {}).value || '';
            if (item || standard || resultValue || judge) {
                items.push({ item, standard, method, sample, resultValue, judge, group: 'appearance' });
            }
        });

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
                source   : '출하검사 합격'
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

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
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
        reloadFromStandard,
        _closeModal,
        _save,
        remove,
        exportData
    };
})();


// ===================================================================
// 제품 창고 (재고관리)
// ===================================================================
const ProductWarehouseModule = (function() {
    const STORE = DB.STORES.PRODUCT_INVENTORY;

    function render(container) {
        const actionCards = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">
                ${ProdAppleMenu.card({ label: '보관창고 레이아웃', subtitle: '완제품·소재 배치도', icon: 'map', accent: '#06b6d4', onClick: 'ProductWarehouseModule.openLayout()' })}
                ${ProdAppleMenu.card({ label: '수동 입고', subtitle: '완제품 창고 입고', icon: 'move_to_inbox', accent: '#10b981', onClick: 'ProductWarehouseModule.openManualInModal()' })}
                ${ProdAppleMenu.card({ label: '수동 출고', subtitle: '완제품 창고 출고', icon: 'outbox', accent: '#f59e0b', onClick: 'ProductWarehouseModule.openManualOutModal()' })}
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
        const data = (Storage.getAll(STORE) || [])
            .filter(d => d.type !== '출고')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const rows = data.length ? data.map(d => `
            <tr>
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td style="text-align:right;font-weight:700;color:var(--accent-green);">+${UIUtils.formatNumber(d.quantity || 0)}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.lotNo || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.paintingDate || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-secondary);">${d.source || '-'}</td>
            </tr>`).join('')
            : `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">입고 이력이 없습니다.</td></tr>`;

        el.innerHTML = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>날짜</th><th>차종</th><th>품명</th><th>컬러</th>
                                <th style="text-align:right;">수량</th>
                                <th>사출 LOT</th><th>도장 LOT</th><th>출처</th>
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
                itemMap[key] = { car, part, color, inQty: 0, outQty: 0, lastDate: '' };
            }
            const qty = Number(d.quantity) || 0;
            if (d.type === '출고') itemMap[key].outQty += qty;
            else                   itemMap[key].inQty  += qty;
            if (d.date > itemMap[key].lastDate) itemMap[key].lastDate = d.date;
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
        const byCarModel = {};
        items.forEach(i => {
            const car = i.car || '차종 미지정';
            if (!byCarModel[car]) byCarModel[car] = [];
            byCarModel[car].push(i);
        });

        const isAsItem = i => {
            const text = `${i.car || ''} ${i.part || ''} ${i.color || ''}`;
            return /(^|[^A-Z0-9])A\/?S([^A-Z0-9]|$)/i.test(text) || /애프터|서비스/.test(text);
        };

        // 양산 / A/S 차종 분리
        const sortBySize = cars => cars.sort((a, b) =>
            (byCarModel[b].length - byCarModel[a].length) || a.localeCompare(b, 'ko'));
        const massanCars = sortBySize(Object.keys(byCarModel).filter(car => !byCarModel[car].every(isAsItem)));
        const asCars     = sortBySize(Object.keys(byCarModel).filter(car =>  byCarModel[car].every(isAsItem)));

        function renderCarBlock(car, isAs) {
            const headerColor = isAs ? '#475569' : '#2563eb';
            const group = byCarModel[car].sort((a, b) => {
                const aAs = isAsItem(a) ? 1 : 0;
                const bAs = isAsItem(b) ? 1 : 0;
                return aAs - bAs ||
                    (a.part || '').localeCompare(b.part, 'ko') ||
                    (a.color || '').localeCompare(b.color, 'ko');
            });
            const groupTotal = group.reduce((s, i) => s + (i.inQty - i.outQty), 0);

            const rows = group.map(i => {
                const stock = i.inQty - i.outQty;
                const stockColor = stock <= 0
                    ? 'var(--accent-red)'
                    : stock < 50
                    ? 'var(--accent-orange)'
                    : 'var(--accent-green)';
                const keyEnc = encodeURIComponent(`${i.car}||${i.part}||${i.color}`);
                const asTag = isAsItem(i)
                    ? '<span style="font-size:0.58rem;background:#e2e8f0;color:#64748b;border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:middle;">A/S</span>'
                    : '';
                return `
                <tr onclick="ProductWarehouseModule._showHistory('${keyEnc}', event)"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;border-bottom:1px solid var(--border-color);line-height:1.28;white-space:normal;word-break:break-word;min-width:150px;max-width:220px;">
                        <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_escapeHtml(i.part)}">${i.part}</span>${asTag}
                    </td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">${i.color || ''}</td>
                    <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                        <span style="font-size:0.9rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                        <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                    </td>
                    <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;">${i.lastDate || ''}</td>
                </tr>`;
            }).join('');

            return `<div style="break-inside:avoid;margin-bottom:10px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="background:${headerColor};color:#fff;padding:7px 10px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                        ${car}
                        <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${group.length}종</span>
                    </span>
                    <div style="font-size:0.75rem;">재고 <strong>${UIUtils.formatNumber(groupTotal)}</strong> EA</div>
                </div>
                <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                    <thead><tr style="background:var(--bg-secondary);">
                        <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                        <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                        <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                        <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근일자</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        function sectionDivider(text, count, color) {
            return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
                <span class="material-symbols-outlined" style="font-size:15px;color:${color};">directions_car</span>
                <span style="font-size:0.76rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:0.5px;">${text}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);font-weight:600;">${count}개 차종</span>
                <div style="flex:1;height:1px;background:#e2e8f0;"></div>
            </div>`;
        }

        let html = '';

        if (massanCars.length) {
            html += sectionDivider('양산품', massanCars.length, '#2563eb');
            html += '<div style="columns:280px;column-gap:10px;">';
            html += massanCars.map(car => renderCarBlock(car, false)).join('');
            html += '</div>';
        }

        if (asCars.length) {
            html += `<div style="margin-top:${massanCars.length ? '20px' : '0'};">`;
            html += sectionDivider('A/S 품목', asCars.length, '#64748b');
            html += '<div style="columns:280px;column-gap:10px;">';
            html += asCars.map(car => renderCarBlock(car, true)).join('');
            html += '</div></div>';
        }

        blocksEl.innerHTML = html;
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

    function _buildDailyInspSection(dailyAll) {
        const rows = dailyAll.length ? dailyAll.map(d => `
            <tr>
                <td style="white-space:nowrap;">${(d.date || '-').slice(0, 10)}</td>
                <td style="font-family:monospace;font-size:0.82rem;">${_escapeHtml(d.lotNo || d.injectionLot || '-')}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(Number(d.lotSize) || 0)}</td>
                <td style="text-align:center;">${UIUtils.formatNumber(Number(d.sampleQty) || 0)}</td>
                <td style="text-align:center;">${UIUtils.formatNumber(Number(d.defectQty) || 0)}</td>
                <td style="text-align:center;">${_shippingResultBadge(d.result)}</td>
                <td>${_escapeHtml(d.inspector || '-')}</td>
            </tr>`).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">출하검사(외관) 이력이 없습니다.</td></tr>`;
        return `
            <div style="margin-top:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-purple,#7c3aed);">verified</span>
                <strong style="font-size:0.86rem;">출하검사(외관) 이력</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">${dailyAll.length}건</span>
            </div>
            <div style="overflow-x:auto;margin-bottom:4px;">
                <table class="data-table">
                    <thead><tr>
                        <th>검사일</th><th>LOT</th>
                        <th style="text-align:right;">LOT수량</th>
                        <th style="text-align:center;">샘플</th>
                        <th style="text-align:center;">불량</th>
                        <th style="text-align:center;">판정</th>
                        <th>검사자</th>
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

    // ── 품목 상세 모달 (사출 창고 패턴) ─────────────────────────────────
    async function _showHistory(keyEnc, event) {
        if (event) event.stopPropagation();

        const key   = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');

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

        const lotRows = currentLots.map(l => {
            const lotNoAttr = _escapeHtml(l.lotNo || '').replace(/'/g, "\\'");
            const dateAttr = _escapeHtml(l.date || '').replace(/'/g, "\\'");
            const adjustBtn = _isAdminUser()
                ? `<button type="button" class="btn btn-sm btn-outline"
                        style="margin-left:8px;font-size:0.72rem;padding:2px 8px;vertical-align:middle;"
                        onclick="event.stopPropagation();ProductWarehouseModule._openLotAdjust('${keyEnc}','${lotNoAttr}','${dateAttr}',${Number(l.qty) || 0})">수량 보정</button>`
                : '';
            return `
            <tr>
                <td style="white-space:nowrap;">${l.date || '-'}</td>
                <td style="font-family:monospace;">${l.lotNo || '-'}</td>
                <td style="text-align:right;white-space:nowrap;">
                    <span style="font-weight:600;color:var(--accent-green);">${UIUtils.formatNumber(l.qty)}</span>
                    ${adjustBtn}
                </td>
            </tr>`;
        }).join('');

        const lotSection = StockDetailUI.buildLotTableSection({
            headers: ['입고일', 'LOT번호', '현재 수량'],
            colSpan: 3,
            rowsHtml: lotRows
        });

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
        exportData
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
