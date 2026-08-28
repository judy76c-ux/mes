/**
 * 사출 공정 모듈
 * - 사출 입고 (수입검사일지)
 * - 사출 창고 (자재 재고관리)
 */

// ===================================================================
// 사출 입고 (수입검사일지)
// ===================================================================
var InjectionIncomingModule = (function() {
    const STORE = DB.STORES.INJECTION_INSPECTIONS;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${IncomingUI.renderSection('injection-incoming')}
                <div class="page-header">
                    <div class="page-actions">
                        ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                            ? AuthModule.incomingInspNotifyAdminButtonHtml('injection') : ''}
                        <button class="btn btn-primary" onclick="InjectionIncomingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 검사 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="injInspStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="injInspEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="injInspCarModel" onchange="InjectionIncomingModule.onFilterCarModelChange()" style="min-width:130px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">품목</label>
                        <select class="form-select" id="injInspPartName" style="min-width:150px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="InjectionIncomingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                        <button class="btn btn-secondary" onclick="InjectionIncomingModule.resetFilter()" style="margin-left:6px;">
                            <span class="material-symbols-outlined">refresh</span> 초기화
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="injInspStats"></div>

                <div id="injCertPendingSection"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일자</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>입고수량</th>
                                        <th>사출 LOT</th>
                                        <th>성적서 접수 LOT</th>
                                        <th>사출처</th>
                                        <th>시료코드</th>
                                        <th>검사수량</th>
                                        <th>AC/RE</th>
                                        <th>합격</th>
                                        <th>불합격</th>
                                        <th>판정</th>
                                        <th>검사자</th>
                                        <th>비고</th>
                                        <th>조치 사항</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="injInspTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function _populateCarModelDropdown(allData) {
        const el = document.getElementById('injInspCarModel');
        if (!el) return;
        const prev = el.value;
        const carModels = UIUtils.sortCarModels(allData.map(d => d.carModel));
        el.innerHTML = '<option value="">전체</option>' +
            carModels.map(m => `<option value="${m}" ${m === prev ? 'selected' : ''}>${m}</option>`).join('');
    }

    function onFilterCarModelChange() {
        const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
        const allData = Storage.getAll(STORE);
        const partEl = document.getElementById('injInspPartName');
        if (!partEl) return;
        const prev = partEl.value;
        const parts = [...new Set(
            allData.filter(d => !carModel || d.carModel === carModel)
            .map(d => d.partName).filter(Boolean)
        )].sort();
        partEl.innerHTML = '<option value="">전체</option>' +
            parts.map(p => `<option value="${p}" ${p === prev ? 'selected' : ''}>${p}</option>`).join('');
    }

    function resetFilter() {
        const startEl = document.getElementById('injInspStart');
        const endEl = document.getElementById('injInspEnd');
        const carEl = document.getElementById('injInspCarModel');
        const partEl = document.getElementById('injInspPartName');
        if (startEl) startEl.value = UIUtils.monthAgo();
        if (endEl) endEl.value = UIUtils.today();
        if (carEl) carEl.value = '';
        if (partEl) partEl.innerHTML = '<option value="">전체</option>';
        search();
    }

    function search() {
        const start = document.getElementById('injInspStart').value;
        const end = document.getElementById('injInspEnd').value;
        const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
        const partName = (document.getElementById('injInspPartName') || {}).value || '';

        let data = Storage.getByDateRange(STORE, start, end);
        if (carModel) data = data.filter(d => d.carModel === carModel);
        if (partName) data = data.filter(d => d.partName === partName);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 날짜 범위 전체 기준으로 드롭다운 갱신
        const allInRange = Storage.getByDateRange(STORE, start, end);
        _populateCarModelDropdown(allInRange);
        onFilterCarModelChange();
        // 선택값 복원
        if (carModel) {
            const el = document.getElementById('injInspCarModel');
            if (el) el.value = carModel;
        }
        if (partName) {
            const el = document.getElementById('injInspPartName');
            if (el) el.value = partName;
        }

        renderStats(data);
        renderCertPendingSection();
        renderTable(data);
    }

    function renderStats(data) {
        const totalQty = data.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0);
        const passQty = data.reduce((s, d) => s + (Number(d.passQty) || 0), 0);
        const failQty = data.reduce((s, d) => s + (Number(d.failQty) || 0), 0);

        document.getElementById('injInspStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">검사 건수</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">입고 수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(passQty)}</div>
                <div class="stat-card-label">합격 수량</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${UIUtils.formatNumber(failQty)}</div>
                <div class="stat-card-label">불합격 수량</div>
            </div>
        `;
    }

    function renderCertPendingSection() {
        const el = document.getElementById('injCertPendingSection');
        if (!el) return;

        // 전체 레코드에서 성적서 미접수 항목 추출
        const allRecords = Storage.getAll(STORE);
        const pending = allRecords.filter(d => {
            const lots = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            return lots.length > 0 && !lots.some(l => l.certReceived);
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (pending.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = `
            <div class="card" style="border:2px solid #fca5a5;margin-bottom:16px;">
                <div class="card-header" style="background:rgba(220,38,38,0.06);border-bottom:1px solid #fca5a5;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="color:#dc2626;">pending_actions</span>
                        <span style="font-weight:700;color:#dc2626;font-size:1rem;">성적서 미접수 관리</span>
                        <span style="background:#dc2626;color:#fff;border-radius:12px;padding:1px 10px;font-size:0.82rem;font-weight:700;">${pending.length}건</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--text-muted);">접수 완료 처리 후 목록에서 제거됩니다</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>검사일자</th>
                                <th>미접수 LOT</th>
                                <th>차종</th>
                                <th>품명</th>
                                <th>입고수량</th>
                                <th>사출처</th>
                                <th style="text-align:center;">접수 처리</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pending.map(d => {
                                const lots = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false, qty: d.incomingQty }] : []);
                                const lotBadges = lots.map(l =>
                                    `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;padding:1px 7px;font-size:0.8rem;font-family:monospace;color:#dc2626;font-weight:600;">
                                        <span class="material-symbols-outlined" style="font-size:0.85rem;">cancel</span>${l.lotNo || '-'}
                                    </span>`
                                ).join('');
                                const _dp0 = (d.date || '').split(' ');
                                const _dp0p = (_dp0[0] || '').split('-');
                                const _dp0h = _dp0[1] ? _dp0[1].slice(0,5) : '';
                                const _dateFmt0 = _dp0p.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _dp0p[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _dp0p[1] + '-' + _dp0p[2] + '</span>' +
                                      (_dp0h ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _dp0h + '</span>' : '')
                                    : (d.date || '-');
                                return `
                                    <tr style="background:rgba(220,38,38,0.03);">
                                        <td style="line-height:1.3;">${_dateFmt0}</td>
                                        <td>${lotBadges}</td>
                                        <td>${d.carModel || '-'}</td>
                                        <td>${d.partName || '-'}</td>
                                        <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                                        <td>${d.supplierName || '-'}</td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-primary"
                                                onclick="InjectionIncomingModule.markCertReceived('${d.id}')"
                                                style="font-size:0.78rem;">
                                                <span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>
                                                접수 완료
                                            </button>
                                        </td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function markCertReceived(id) {
        const record = Storage.getById(STORE, id);
        if (!record) return;
        UIUtils.showModal('성적서 접수 완료', `
            <div style="padding:8px 0;">
                <p style="margin-bottom:16px;color:var(--text-secondary);">
                    <strong>${record.carModel || ''} ${record.partName || ''}</strong> 의 성적서 접수일을 입력하세요.
                </p>
                <div class="form-group">
                    <label class="form-label">접수일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="certReceivedDate" value="${Storage.today()}" max="${Storage.today()}">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.confirmCertReceived('${id}')">
                <span class="material-symbols-outlined">check_circle</span> 접수 완료
            </button>
        `, '1050px');
    }

    async function confirmCertReceived(id) {
        const dateVal = (document.getElementById('certReceivedDate') || {}).value;
        if (!dateVal) { UIUtils.toast('접수일을 입력하세요.', 'warning'); return; }
        const record = Storage.getById(STORE, id);
        if (!record) return;
        const representativeLotNo = record.certRepresentativeLotNo || (record.lots && record.lots[0] && record.lots[0].lotNo) || record.lotNo || '';
        const lots = (record.lots && record.lots.length > 0)
            ? record.lots.map((l, idx) => ({ ...l, certReceived: true, certReceivedDate: dateVal, certRepresentative: (l.lotNo === representativeLotNo) || (!representativeLotNo && idx === 0) }))
            : [];
        if (lots.length > 0) {
            await Storage.update(STORE, id, { lots, certReceivedDate: dateVal, certRepresentativeLotNo: representativeLotNo });
            await propagateCertReceived(lots);
        } else {
            await Storage.update(STORE, id, { certReceived: true, certReceivedDate: dateVal, certRepresentativeLotNo: representativeLotNo });
        }
        UIUtils.closeModal();
        UIUtils.toast('성적서 접수 완료 처리되었습니다.', 'success');
        search();
    }

    function renderTable(data) {
        const tbody = document.getElementById('injInspTableBody');

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        // FIFO 위반 사전 계산: 차종+품명별 등록순 기준 최대 LOT 추적
        const fifoViolations = new Set(); // record id → 위반
        const fifoViolationLots = {};
        const sorted = [...data].sort((a, b) => a.date < b.date ? -1 : 1);
        const maxLotByPart = {}; // 'carModel|partName' → maxLotNo
        sorted.forEach(r => {
            const key = `${r.carModel}|${r.partName}`;
            const lots = (r.lots && r.lots.length > 0) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const lotNos = lots.map(l => l.lotNo || '').filter(Boolean);
            const minLot = lotNos.slice().sort()[0];
            const maxLot = lotNos.slice().sort().pop();
            const badLots = maxLotByPart[key] ? lotNos.filter(lotNo => lotNo < maxLotByPart[key]) : [];
            if (badLots.length > 0) {
                fifoViolations.add(r.id);
                fifoViolationLots[r.id] = new Set(badLots);
            }
            if (maxLot && (!maxLotByPart[key] || maxLot > maxLotByPart[key])) {
                maxLotByPart[key] = maxLot;
            }
        });

        tbody.innerHTML = data.map(d => {
            const verdictText = d.verdict || '';
            const verdict = verdictText === '합격' ? 'success' : 'danger';
            const lotList = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            const certLot = lotList.find(l => l.certRepresentative) || lotList.find(l => l.certReceived);
            const certMissing = lotList.length > 0 && !certLot;
            const isFifoViolation = fifoViolations.has(d.id);
            const badLotSet = fifoViolationLots[d.id] || new Set();
            const injLotDisplay = lotList.map(l => {
                const lotNo = l.lotNo || '-';
                let lotQty = Number(l.qty);
                if (!(lotQty > 0) && lotList.length === 1) {
                    lotQty = Number(d.incomingQty || d.passQty) || 0;
                }
                const qtyText = ' (' + UIUtils.formatNumber(lotQty > 0 ? lotQty : 0) + ')';
                const bad = badLotSet.has(lotNo);
                const style = bad
                    ? 'display:inline-block;background:#fff7ed;border:1px solid #fb923c;border-radius:4px;padding:1px 6px;font-size:0.8rem;margin:1px;font-family:monospace;font-weight:800;color:#ea580c;white-space:nowrap;'
                    : 'display:inline-block;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.8rem;margin:1px;font-family:monospace;font-weight:600;white-space:nowrap;';
                return `<span style="${style}" ${bad ? 'title="FIFO 위반 LOT"' : ''}>${lotNo}${qtyText}</span>`;
            }).join('') + (isFifoViolation
                ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:1px 6px;font-size:0.75rem;margin:1px;color:#ea580c;font-weight:700;" title="선입선출 위반: 이전에 등록된 최신 LOT보다 오래된 재고입니다"><span class="material-symbols-outlined" style="font-size:0.85rem;">warning</span>FIFO</span>`
                : '');
            const certDisplay = certLot
                ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#dcfce7;border:1px solid #86efac;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#16a34a;font-weight:600;"><span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>${certLot.lotNo || '-'}</span>`
                : `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#dc2626;font-weight:600;" title="??? ???"><span class="material-symbols-outlined" style="font-size:0.9rem;">cancel</span>???</span>`;
            const rowStyle = isFifoViolation
                ? ' style="background:rgba(234,88,12,0.05);"'
                : certMissing ? ' style="background:rgba(220,38,38,0.05);"' : '';
            const _ds = (d.date || '').split(' ');
            const _dp = (_ds[0] || '').split('-');
            const _dt = _ds[1] ? _ds[1].slice(0,5) : '';
            const _dateFmt = _dp.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _dp[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + _dp[1] + '-' + _dp[2] + '</span>' +
                  (_dt ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _dt + '</span>' : '')
                : (d.date || '-');
            return `
                <tr${rowStyle}>
                    <td style="line-height:1.3;">${_dateFmt}</td>
                    <td>${d.carModel || '-'}</td>
                    <td>${d.partName || '-'}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.incomingQty)}</td>
                    <td>${injLotDisplay}</td>
                    <td>${certDisplay}</td>
                    <td>${d.supplierName || '-'}</td>
                    <td style="text-align:center;font-weight:600;color:var(--accent-blue)">${d.sampleCode || '-'}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.inspectionQty)}</td>
                    <td style="text-align:center;font-size:0.82rem;color:var(--text-secondary)">${d.acCriteria != null ? d.acCriteria + '/' + d.reCriteria : '-'}</td>
                    <td style="text-align:right;color:var(--accent-green)">${UIUtils.formatNumber(d.passQty)}</td>
                    <td style="text-align:right;color:var(--accent-red)">${UIUtils.formatNumber(d.failQty)}</td>
                    <td>${verdictText ? UIUtils.badge(verdictText, verdict) : '-'}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted);">${d.inspector || '-'}</td>
                    <td>
                        <div style="font-size:0.8rem;color:var(--accent-red);margin-bottom:2px;">
                            ${Object.entries(d.defectDetails || {}).map(([k, v]) => `${k}(${v})`).join(', ')}
                        </div>
                        ${d.note || '-'}

                    </td>
                    ${isFifoViolation ? `
                    <td>
                        <input type="text" class="form-input" value="${(d.fifoMeasure || '').replace(/"/g, '&quot;')}"
                               placeholder="조치 사항 입력" style="font-size:0.78rem;padding:4px 6px;min-width:140px;"
                               onchange="InjectionIncomingModule.saveFifoMeasure('${d.id}', this.value)">
                    </td>
                    ` : '<td>-</td>'}
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionIncomingModule.view('${d.id}')">
                            <span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px;">visibility</span> 보기
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // FIFO 위반 조치 사항 저장
    async function saveFifoMeasure(id, measure) {
        const record = Storage.getById(STORE, id);
        if (!record) {
            UIUtils.toast('기록을 찾을 수 없습니다.', 'error');
            return;
        }
        try {
            await Storage.update(STORE, id, { fifoMeasure: measure.trim() });
            UIUtils.toast('조치 사항이 저장되었습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    /** prefill: { carModel, partName, color, lots:[{lotNo,qty}], note } — 창고에 이미 직접
     *  입고된(수입검사 미실시) 건을 나중에 검사 등록할 때, 사출 창고 쪽에서 값을 채워 넘긴다. */
    function openAddModal(prefill) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        // 외부공급처 제품이 있는 차종만 필터링 (사내만 있는 차종 제외)
        const externalMaterialsForCars = materials.filter(m => m.supplier !== '사내');
        const carModelsWithExternal = UIUtils.sortCarModels(
            externalMaterialsForCars.map(m => m.carModel),
            externalMaterialsForCars
        );
        const carModelOptions = carModelsWithExternal.map(c => `<option value="${c}">${c}</option>`).join('');

        const inspectors = (Storage.getAll(DB.STORES.INSPECTORS) || [])
            .filter(i => (i.processes || []).includes('incoming'));
        const inspectorOptions = inspectors.map(i => `<option value="${i.name}">${i.name}</option>`).join('');

        UIUtils.showModal({
            title: '수입검사 등록',
            size: '1050px',
            tall: true,
            body: `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일자</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="addInjDate" value="${UIUtils.today()}">
                        <input type="time" class="form-input" id="addInjTime" value="${new Date().toTimeString().slice(0, 5)}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">검사자 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjInspector">
                        <option value="">-- 검사자 선택 --</option>
                        ${inspectorOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjCarModel" onchange="InjectionIncomingModule.onCarModelSelect()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjPart" onchange="InjectionIncomingModule.onPartNameSelect()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjColor" onchange="InjectionIncomingModule.onColorSelect()">
                        <option value="">-- 품명 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <input type="text" class="form-input" id="addInjSupplier" placeholder="자동 입력" readonly style="background:var(--bg-secondary);">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">조치 사항</label>
                    <select class="form-select" id="addInjMeasure">
                        <option value="">-- 조치 사항 선택 --</option>
                        <option value="사출처 통보">사출처 통보</option>
                        <option value="반품">반품</option>
                        <option value="부분 반품">부분 반품</option>
                        <option value="조정">조정</option>
                        <option value="폐기">폐기</option>
                    </select>
                </div>
            </div>
            <!-- 수입검사 기준서 버튼 -->
            <div id="injStdLinkArea" style="display:none;margin-bottom:8px;"></div>
            <!-- 수입검사 기준 사진 미리보기 -->
            <div id="injStdPhotoPreview" style="display:none;background:rgba(59,130,246,0.05);
                border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                <div style="font-size:0.78rem;font-weight:600;color:var(--accent-blue);margin-bottom:8px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:3px;">photo_library</span>
                    수입검사 기준 사진
                </div>
                <div id="injStdPhotoGrid" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <label class="form-label" style="margin:0; font-weight:600;">
                        LOT 목록 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-left:6px;">☑ 성적서 접수된 LOT 체크</span>
                    </label>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjectionIncomingModule.addInjLotRow()" style="display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;">add</span> LOT 추가
                    </button>
                </div>
                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div style="display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; font-size:0.78rem; color:var(--text-muted); padding-bottom:6px; border-bottom:1px solid var(--border); margin-bottom:6px;">
                        <span style="text-align:center; font-size:1rem;">✓</span>
                        <span>LOT번호 (YYMMDD)</span>
                        <span style="text-align:right;">수량 (EA)</span>
                        <span></span>
                    </div>
                    <div id="injLotRows"></div>
                </div>
                <div id="fifoWarning" style="display:none; align-items:center; gap:8px; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:8px 14px; margin-bottom:6px;">
                    <span class="material-symbols-outlined" style="color:#ea580c; font-size:1.2rem;">warning</span>
                    <span id="fifoWarningMsg" style="font-size:0.85rem; color:#c2410c; font-weight:600;"></span>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 입고수량</span>
                    <span id="injLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="addInjInQty" value="0">
            </div>
            <div id="injCertPhotoRow" style="display:none;margin-bottom:16px;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:12px 16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
                    <label class="form-label" style="margin:0;font-weight:600;">
                        성적서 접수 사진
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">체크 시 사진 촬영/등록 가능</span>
                    </label>
                    <span id="injCertPhotoName" style="font-size:0.78rem;color:var(--text-muted);"></span>
                </div>
                <input type="file" class="form-input" id="injCertPhotoFile" accept="image/*" capture="environment" onchange="InjectionIncomingModule.onInjCertPhotoChange(this)">
                <input type="hidden" id="injCertPhotoUrl" value="">
                <div id="injCertPhotoPreview" style="display:none;margin-top:10px;"></div>
            </div>
            <div id="injSamplingInfo" style="display:none;margin-bottom:16px;background:var(--bg-primary);border:1.5px solid var(--accent-blue);border-radius:var(--border-radius);padding:12px 16px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--accent-blue);margin-bottom:10px;">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">science</span>
                    샘플링 검사 기준 (KS Q ISO 2859-1 · 보통검사 · G-II · AQL 0.65)
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;">
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">시료코드</div>
                        <div id="injSampleCode" style="font-size:1.2rem;font-weight:700;color:var(--accent-blue);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">검사수량(n)</div>
                        <div id="injSampleSize" style="font-size:1.2rem;font-weight:700;color:var(--text-primary);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">합격판정수(Ac)</div>
                        <div id="injSampleAc" style="font-size:1.2rem;font-weight:700;color:var(--accent-green);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">불합격판정수(Re)</div>
                        <div id="injSampleRe" style="font-size:1.2rem;font-weight:700;color:var(--accent-red);"></div>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사수량 <span style="font-size:0.75rem;color:var(--accent-blue);font-weight:400;">(샘플링 자동)</span></label>
                    <input type="number" class="form-input" id="addInjInspQty" min="0" placeholder="자동입력"
                           readonly style="background:var(--bg-secondary);border-color:var(--accent-blue);color:var(--accent-blue);font-weight:600;">
                </div>
            </div>

            <!-- 불량 상세 입력 별도 (사출 불량 목록 호출) -->
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span>
                불량 상세 (사출 불량)
            </div>
            <div id="addInjDefectBreakdown" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px;">
                <!-- JavaScript 통해서 동적 렌더링됨 -->
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">총 불합격수량 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(자동합산)</span></label>
                    <input type="number" class="form-input" id="addInjFailQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="addInjNote" placeholder="검사 상세 내용" style="height:38px;resize:none;"></textarea>
                </div>
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label class="form-label">합격 판정 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-input" id="addInjVerdict" onchange="InjectionIncomingModule.onAddVerdictChange()">
                    <option value="">-- 선택 --</option>
                    <option value="합격">합격</option>
                    <option value="불합격">불합격</option>
                </select>
                <input type="hidden" id="addInjPassQty" value="0">
            </div>
            `,
            footer: `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.saveNew()">등록</button>
        `
        });

                setTimeout(() => {
            addInjLotRow(); // 첫 LOT 행 초기화
            _syncInjCertPhotoSection();
            if (prefill) {
                const carSel = document.getElementById('addInjCarModel');
                if (carSel && prefill.carModel) {
                    carSel.value = prefill.carModel;
                    onCarModelSelect();
                }
                setTimeout(() => {
                    const partSel = document.getElementById('addInjPart');
                    if (partSel && prefill.partName) {
                        partSel.value = prefill.partName;
                        onPartNameSelect();
                    }
                    setTimeout(() => {
                        const colorSel = document.getElementById('addInjColor');
                        if (colorSel && prefill.color) {
                            colorSel.value = prefill.color;
                            onColorSelect();
                        }
                        const lotContainer = document.getElementById('injLotRows');
                        if (lotContainer && prefill.lots && prefill.lots.length) {
                            lotContainer.innerHTML = '';
                            prefill.lots.forEach(() => addInjLotRow());
                            const rows = lotContainer.querySelectorAll('.inj-lot-row');
                            rows.forEach((row, i) => {
                                const l = prefill.lots[i];
                                if (!l) return;
                                const noEl = row.querySelector('.inj-lot-no');
                                const qtyEl = row.querySelector('.inj-lot-qty');
                                if (noEl) noEl.value = l.lotNo || '';
                                if (qtyEl) qtyEl.value = l.qty || '';
                            });
                            calcInjLotTotal();
                        }
                        if (prefill.note) {
                            const noteEl = document.getElementById('addInjNote');
                            if (noteEl) noteEl.value = prefill.note;
                        }
                    }, 80);
                }, 80);
            }
            try {
                const allDefs = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
                const defects = allDefs.filter(d => d && (d.type === 'injection' || !d.type));
                const container = document.getElementById('addInjDefectBreakdown');
                if (!container) return; // 모달이 이미 닫혔을 경우 방어
                if (defects.length === 0) {
                    container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다. <a style="color:var(--accent-blue);cursor:pointer;" onclick="Router.navigate(\'settings\');UIUtils.closeModal();">관리/설정에서 등록하세요.</a></div>';
                } else {
                    container.innerHTML = defects.map(d => `
                        <div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">
                            <label style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;min-width:0;">
                                <button type="button" title="불량유형 보기"
                                    onclick="LaserInspectionModule.showDefectTypeView('${d.id}')"
                                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                </button>
                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name || ''}</span>
                            </label>
                            <input type="number" class="form-input defect-input-new" data-defect-id="${d.id}" data-defect-name="${(d.name || '').replace(/"/g, '&quot;')}" min="0" placeholder="0" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalAddFailQty()">
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error('[사출 불량 렌더] 추가폼 오류:', e);
            }
        }, 100);
    }

    function calcTotalAddFailQty() {
        const inputs = document.querySelectorAll('.defect-input-new');
        let total = 0;
        inputs.forEach(input => {
            total += (Number(input.value) || 0);
        });
        document.getElementById('addInjFailQty').value = total || '';
        onAddVerdictChange();
    }

    function addInjLotRow() {
        const editMode = !!document.getElementById('editInjLotRows');
        const container = document.getElementById(editMode ? 'editInjLotRows' : 'injLotRows');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'inj-lot-row';
        div.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
        div.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
            + '<input type="checkbox" class="inj-lot-cert" onchange="InjectionIncomingModule.selectInjCertLot(this)" style="width:16px;height:16px;cursor:pointer;">'
            + '</label>'
            + '<input type="text" class="form-input inj-lot-no" placeholder="YYMMDD" maxlength="6"'
            + ' style="font-family:monospace; letter-spacing:1px;"'
            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); if(this.value.length===6) InjectionIncomingModule.onLotInput(this, null);"'
            + ' onblur="InjectionIncomingModule.onLotInput(this, null)">'
            + '<input type="number" class="form-input inj-lot-qty" min="0" placeholder="0"'
            + ' style="text-align:right;"'
            + ' oninput="InjectionIncomingModule.' + (editMode ? 'calcInjLotTotalEdit' : 'calcInjLotTotal') + '()">'
            + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
            + '</button>';
        container.appendChild(div);
        if (editMode) calcInjLotTotalEdit();
        else calcInjLotTotal();
    }

    function selectInjCertLot(checkbox) {
        const container = checkbox.closest('#editInjLotRows, #injLotRows');
        if (!container) return;
        if (checkbox && checkbox.checked) {
            container.querySelectorAll('.inj-lot-cert').forEach(cb => {
                if (cb !== checkbox) cb.checked = false;
            });
        }
        _syncInjCertPhotoSection();
    }

    function _syncInjCertPhotoSection() {
        const row = document.getElementById('injCertPhotoRow');
        if (!row) return;
        const checked = document.querySelector('#injLotRows .inj-lot-cert:checked, #editInjLotRows .inj-lot-cert:checked');
        row.style.display = checked ? 'block' : 'none';
    }

    function _renderInjCertPhotoPreview(url, name) {
        const preview = document.getElementById('injCertPhotoPreview');
        const hidden = document.getElementById('injCertPhotoUrl');
        const nameEl = document.getElementById('injCertPhotoName');
        const isDataUrl = String(url || '').startsWith('data:');
        if (hidden) hidden.value = isDataUrl ? '' : (url || '');
        if (nameEl) nameEl.textContent = name || (url ? '저장된 사진' : '');
        if (!preview) return;
        if (!url) {
            preview.innerHTML = '';
            preview.style.display = 'none';
            return;
        }
        const absUrl = isDataUrl ? url : ApiClient.photoUrl(url);
        preview.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
                <img src="${absUrl}" alt="성적서 사진" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;"
                    onclick="window.open(${JSON.stringify(absUrl)}, '_blank')">
                <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                    <a href="${absUrl}" target="_blank" rel="noopener" style="color:var(--accent-blue);font-size:0.9rem;font-weight:600;text-decoration:none;">저장된 사진 보기</a>
                    <span style="font-size:0.78rem;color:var(--text-muted);word-break:break-all;">${name || url}</span>
                </div>
            </div>
        `;
        preview.style.display = 'block';
    }

    function onInjCertPhotoChange(input) {
        const file = input && input.files && input.files[0];
        if (!file) {
            _renderInjCertPhotoPreview('', '');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => _renderInjCertPhotoPreview(e.target.result, file.name || 'photo');
        reader.readAsDataURL(file);
    }

    async function _uploadInjCertPhoto(file) {
        if (!file) return '';
        return ApiClient.uploadPhoto(file, 'inj-inspections');
    }

    function removeInjLotRow(btn) {
        const row = btn.closest('.inj-lot-row');
        if (!row) return;
        const container = row.closest('#editInjLotRows, #injLotRows');
        if (container && container.querySelectorAll('.inj-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
        if (container && container.id === 'editInjLotRows') calcInjLotTotalEdit();
        else calcInjLotTotal();
    }

    function calcInjLotTotal() {
        const qtyInputs = document.querySelectorAll('#injLotRows .inj-lot-qty');
        let total = 0;
        qtyInputs.forEach(inp => { total += (Number(inp.value) || 0); });
        const totalEl = document.getElementById('injLotTotalQty');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
        const hiddenEl = document.getElementById('addInjInQty');
        if (hiddenEl) hiddenEl.value = total;
        onAddVerdictChange();
        onIncomingQtyInput();
    }

    function onAddVerdictChange() {
        const verdictEl = document.getElementById('addInjVerdict');
        const passEl = document.getElementById('addInjPassQty');
        if (!verdictEl || !passEl) return;
        if (verdictEl.value === '합격') {
            const inQty = Number(document.getElementById('addInjInQty')?.value || 0);
            const failQty = Number(document.getElementById('addInjFailQty')?.value || 0);
            passEl.value = Math.max(0, inQty - failQty);
        } else {
            passEl.value = 0;
        }
    }

    function calcInjLotTotalEdit() {
        const qtyInputs = document.querySelectorAll('#editInjLotRows .inj-lot-qty');
        let total = 0;
        qtyInputs.forEach(inp => { total += (Number(inp.value) || 0); });
        const totalEl = document.getElementById('editInjLotTotalQty');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
        const hiddenEl = document.getElementById('editInjInQty');
        if (hiddenEl) hiddenEl.value = total;
        onEditVerdictChange();
    }

    function onEditVerdictChange() {
        const verdictEl = document.getElementById('editInjVerdict');
        const passEl = document.getElementById('editInjPassQty');
        if (!verdictEl || !passEl) return;
        if (verdictEl.value === '합격') {
            const inQty = Number(document.getElementById('editInjInQty')?.value || 0);
            const failQty = Number(document.getElementById('editInjFailQty')?.value || 0);
            passEl.value = Math.max(0, inQty - failQty);
        } else {
            passEl.value = 0;
        }
    }

    function onCarModelSelect() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('addInjCarModel').value;
        const partSelect = document.getElementById('addInjPart');
        const colorSelect = document.getElementById('addInjColor');

        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('addInjSupplier').value = '';
        const _laC = document.getElementById('injStdLinkArea');
        if (_laC) { _laC.style.display = 'none'; _laC.innerHTML = ''; }

        if (!carModel) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && (m.supplier !== '사내');
        });
        const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(p => `<option value="${p}">${p}</option>`).join('');

        if (partNames.length === 1) {
            partSelect.value = partNames[0];
            onPartNameSelect();
        }
    }

    function onPartNameSelect() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('addInjCarModel').value;
        const partName = document.getElementById('addInjPart').value;
        const colorSelect = document.getElementById('addInjColor');

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('addInjSupplier').value = '';
        const _laP = document.getElementById('injStdLinkArea');
        if (_laP) { _laP.style.display = 'none'; _laP.innerHTML = ''; }

        _refreshStdPreview(carModel, partName);

        if (!partName) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && m.injPartName === partName && (m.supplier !== '사내');
        });
        const colors = [...new Set(filtered.map(m => m.injColor).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        if (colors.length === 1) {
            colorSelect.value = colors[0];
            onColorSelect();
        }
    }

    function onColorSelect() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('addInjCarModel').value;
        const partName = document.getElementById('addInjPart').value;
        const color = document.getElementById('addInjColor').value;
        const linkArea = document.getElementById('injStdLinkArea');

        if (!color) {
            document.getElementById('addInjSupplier').value = '';
            if (linkArea) { linkArea.style.display = 'none'; linkArea.innerHTML = ''; }
            return;
        }
        // 공급처가 "사내"가 아닌 제품만 검색
        const material = materials.find(function(m) {
            return m.carModel === carModel && m.injPartName === partName && m.injColor === color && (m.supplier !== '사내');
        });
        document.getElementById('addInjSupplier').value = material ? (material.supplier || '') : '';

        // 수입검사 기준서 버튼
        if (linkArea) {
            if (material) {
                const stds = Storage.getAll(DB.STORES.INJ_INCOMING_STD) || [];
                const std = stds.find(function(s) { return s.productId === material.id; });
                if (std) {
                    linkArea.innerHTML = `<button type="button" class="btn btn-outline btn-sm"
                        style="color:var(--accent-blue);border-color:var(--accent-blue);display:inline-flex;align-items:center;gap:4px;"
                        onclick="InjIncomingStdModule.openViewFormOverlay('${std.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">description</span>
                        수입검사 기준서
                    </button>`;
                    linkArea.style.display = 'block';
                } else {
                    linkArea.style.display = 'none'; linkArea.innerHTML = '';
                }
            } else {
                linkArea.style.display = 'none'; linkArea.innerHTML = '';
            }
        }
    }

    // Edit 모달용 cascading selector 함수
    function onCarModelSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partSelect = document.getElementById('editInjPart');
        const colorSelect = document.getElementById('editInjColor');

        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('editInjSupplier').value = '';

        if (!carModel) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && (m.supplier !== '사내');
        });
        const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(p => `<option value="${p}">${p}</option>`).join('');

        if (partNames.length === 1) {
            partSelect.value = partNames[0];
            onPartNameSelectEdit();
        }
    }

    function onPartNameSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partName = document.getElementById('editInjPart').value;
        const colorSelect = document.getElementById('editInjColor');

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('editInjSupplier').value = '';

        if (!partName) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && m.injPartName === partName && (m.supplier !== '사내');
        });
        const colors = [...new Set(filtered.map(m => m.injColor).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        if (colors.length === 1) {
            colorSelect.value = colors[0];
            onColorSelectEdit();
        }
    }

    function onColorSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partName = document.getElementById('editInjPart').value;
        const color = document.getElementById('editInjColor').value;

        if (!color) {
            document.getElementById('editInjSupplier').value = '';
            return;
        }
        // 공급처가 "사내"가 아닌 제품만 검색
        const material = materials.find(function(m) {
            return m.carModel === carModel && m.injPartName === partName && m.injColor === color && (m.supplier !== '사내');
        });
        document.getElementById('editInjSupplier').value = material ? (material.supplier || '') : '';
    }

    function onIncomingQtyInput() {
        const qty = Number(document.getElementById('addInjInQty').value);
        const infoBox = document.getElementById('injSamplingInfo');
        const inspEl = document.getElementById('addInjInspQty');

        if (!infoBox || !inspEl) return; // 요소가 없으면 무시 (수정 모달에서 샘플링 미사용)

        if (!qty || qty <= 0) {
            infoBox.style.display = 'none';
            inspEl.value = '';
            return;
        }

        const info = SamplingTable.getSamplingInfo(qty);
        if (!info) {
            infoBox.style.display = 'none';
            inspEl.value = '';
            return;
        }

        document.getElementById('injSampleCode').textContent = info.sampleCode;
        document.getElementById('injSampleSize').textContent = info.sampleSize;
        document.getElementById('injSampleAc').textContent = info.ac;
        document.getElementById('injSampleRe').textContent = info.re;
        infoBox.style.display = 'block';

        inspEl.value = Math.min(info.sampleSize, qty);
    }

    // 기존 레코드에서 성적서 접수된 LOT 번호 Set 반환
    function getCertifiedLotNos() {
        const allRecords = Storage.getAll(STORE);
        const certified = new Set();
        for (const record of allRecords) {
            const lotList = (record.lots && record.lots.length > 0)
                ? record.lots
                : (record.lotNo ? [{ lotNo: record.lotNo, certReceived: record.certReceived || false }] : []);
            lotList.forEach(l => { if (l.certReceived && l.lotNo) certified.add(l.lotNo); });
        }
        return certified;
    }

    // 성적서 접수된 LOT 번호를 전체 레코드에 전파
    async function propagateCertReceived(savedLots) {
        if (!savedLots || savedLots.length === 0) return;
        // 성적서 접수된 LOT 번호만 추출
        const certifiedLotNos = new Set(
            savedLots.filter(l => l.certReceived && l.lotNo).map(l => l.lotNo)
        );
        if (certifiedLotNos.size === 0) return;

        const allRecords = Storage.getAll(STORE);
        for (const record of allRecords) {
            if (!record.lots || record.lots.length === 0) continue;
            let changed = false;
            const updatedLots = record.lots.map(l => {
                if (!l.certReceived && certifiedLotNos.has(l.lotNo)) {
                    changed = true;
                    return { ...l, certReceived: true };
                }
                return l;
            });
            if (changed) {
                await Storage.update(STORE, record.id, { lots: updatedLots });
            }
        }
    }

    function normalizeCertLots(lots) {
        const list = Array.isArray(lots) ? lots : [];
        const representative = list.find(l => l.certReceived && l.lotNo);
        if (!representative) {
            return { lots: list, representativeLotNo: '' };
        }
        return {
            representativeLotNo: representative.lotNo,
            lots: list.map(l => ({
                ...l,
                certReceived: true,
                certRepresentative: l.lotNo === representative.lotNo
            }))
        };
    }

    async function saveNew() {
        const dateVal = document.getElementById('addInjDate').value;
        const timeVal = document.getElementById('addInjTime').value;
        const certPhotoInput = document.getElementById('injCertPhotoFile');
        let certPhotoUrl = document.getElementById('injCertPhotoUrl')?.value || '';
        if (certPhotoInput && certPhotoInput.files && certPhotoInput.files[0]) {
            certPhotoUrl = await _uploadInjCertPhoto(certPhotoInput.files[0]);
        }

        // LOT 목록 수집
        const lotRows = document.querySelectorAll('#injLotRows .inj-lot-row');
        const lots = [];
        let _missingLotNo = false;  // 수량은 있는데 LOT 번호가 빈 행
        lotRows.forEach(function(row) {
            const lotNo = ((row.querySelector('.inj-lot-no') || {}).value || '').trim();
            const qty = Number((row.querySelector('.inj-lot-qty') || {}).value) || 0;
            const certReceived = ((row.querySelector('.inj-lot-cert') || {}).checked) || false;
            // LOT 번호 없이 수량만 입력하면 빈 LOT이 저장돼 창고까지 전파된다(추적 불가). 저장 차단.
            if (qty > 0 && !lotNo) { _missingLotNo = true; return; }
            if (lotNo || qty > 0) {
                lots.push({ lotNo: lotNo, qty: qty, certReceived: certReceived });
            }
        });

        if (_missingLotNo) {
            UIUtils.toast('LOT 번호 없이 수량만 입력된 행이 있습니다. LOT 번호를 입력하세요.', 'warning');
            return;
        }
        if (lots.length === 0) {
            UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
            return;
        }

        // 기존에 성적서 접수된 LOT이면 자동으로 접수 처리
        const certifiedLotNos = getCertifiedLotNos();
        lots.forEach(l => {
            if (!l.certReceived && certifiedLotNos.has(l.lotNo)) l.certReceived = true;
        });
        const certState = normalizeCertLots(lots);

        const incomingQty = certState.lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const data = {
            date: `${dateVal} ${timeVal}`,
            inspector: document.getElementById('addInjInspector') ? document.getElementById('addInjInspector').value.trim() : '',
            carModel: document.getElementById('addInjCarModel').value.trim(),
            partName: document.getElementById('addInjPart').value.trim(),
            color: document.getElementById('addInjColor').value.trim(),
            incomingQty: incomingQty,
            lots: certState.lots,
            lotNo: certState.representativeLotNo || (certState.lots.length > 0 ? certState.lots[0].lotNo : ''),
            certRepresentativeLotNo: certState.representativeLotNo,
            sampleCode: document.getElementById('injSampleCode') ?.textContent.trim() || '',
            acCriteria: document.getElementById('injSampleAc') ?.textContent.trim() !== '' ?
                Number(document.getElementById('injSampleAc').textContent.trim()) : null,
            reCriteria: document.getElementById('injSampleRe') ?.textContent.trim() !== '' ?
                Number(document.getElementById('injSampleRe').textContent.trim()) : null,
            inspectionQty: Number(document.getElementById('addInjInspQty').value) || 0,
            passQty: Number(document.getElementById('addInjPassQty').value) || 0,
            verdict: document.getElementById('addInjVerdict')?.value || '',
            failQty: Number(document.getElementById('addInjFailQty').value) || 0,
            defectDetails: {},
            supplierName: document.getElementById('addInjSupplier').value.trim(),
            note: document.getElementById('addInjNote').value.trim(),
            certPhotoUrl: certPhotoUrl,
            measure: document.getElementById('addInjMeasure')?.value || '사출처 통보'
        };

        const defectInputs = document.querySelectorAll('.defect-input-new');
        defectInputs.forEach(function(input) {
            const qty = Number(input.value) || 0;
            if (qty > 0) {
                const name = input.getAttribute('data-defect-name');
                data.defectDetails[name] = qty;
            }
        });

        if (!data.date || !data.partName) {
            UIUtils.toast('날짜와 품명은 필수입니다.', 'warning');
            return;
        }
        if (!data.carModel) {
            UIUtils.toast('차종을 선택하세요.', 'warning');
            return;
        }
        if (!data.color) {
            UIUtils.toast('컬러를 선택하세요.', 'warning');
            return;
        }
        if (!data.inspector) {
            UIUtils.toast('검사자를 선택하세요.', 'warning');
            return;
        }
        if (!data.verdict) {
            UIUtils.toast('합격 판정을 선택하세요.', 'warning');
            return;
        }

        await Storage.add(STORE, data);
        await propagateCertReceived(data.lots);
        // 자동 창고 입고 없음 → 사출 창고 "입고 대기품" 섹션에서 LOT별 수동 처리
        _notifyIncomingInspectionRegistered(data);

        UIUtils.closeModal();
        UIUtils.toast('수입검사가 등록되었습니다.', 'success');
        search();
    }

    function _notifyIncomingInspectionRegistered(data) {
        if (typeof AuthModule === 'undefined') return;
        try {
            const lotText = Array.isArray(data.lots) && data.lots.length
                ? data.lots.map(function (l) {
                    return (l.lotNo || '-') + ' ' + UIUtils.formatNumber(l.qty) + ' EA';
                }).join(', ')
                : ((data.lotNo || '-') + (data.incomingQty != null ? (' ' + UIUtils.formatNumber(data.incomingQty) + ' EA') : ''));
            const defects = Object.entries(data.defectDetails || {})
                .filter(function (row) { return Number(row[1]) > 0; })
                .map(function (row) { return row[0] + '(' + row[1] + ')'; })
                .join(', ');
            const body = [
                '사출 수입검사가 등록되었습니다.',
                '',
                '검사일: ' + (data.date || '-'),
                '차종: ' + (data.carModel || '-'),
                '품명: ' + (data.partName || '-'),
                '컬러: ' + (data.color || '-'),
                '사출처: ' + (data.supplierName || '-'),
                'LOT: ' + (lotText || '-'),
                '입고수량: ' + UIUtils.formatNumber(data.incomingQty),
                '검사수량: ' + UIUtils.formatNumber(data.inspectionQty),
                '합격: ' + UIUtils.formatNumber(data.passQty) + ' / 불합격: ' + UIUtils.formatNumber(data.failQty),
                '판정: ' + (data.verdict || '-'),
                defects ? ('불량: ' + defects) : '',
                '검사자: ' + (data.inspector || '-'),
                data.note ? ('비고: ' + data.note) : ''
            ].filter(Boolean).join('\n');
            if (typeof AuthModule.sendKindNotify === 'function') {
                AuthModule.sendKindNotify('injection', [data], {
                    logLabel: '사출 수입검사',
                    title: '사출 수입검사 등록',
                    priority: data.verdict === '불합격' ? 'high' : 'normal',
                    buildBody: function () { return body; }
                });
                return;
            }
            const recipients = AuthModule.getIncomingInspNotifyRecipientIds
                ? AuthModule.getIncomingInspNotifyRecipientIds('injection')
                : [];
            if (!recipients.length) return;
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: '사출 수입검사 등록',
                body: body,
                category: 'injection_incoming_insp',
                priority: data.verdict === '불합격' ? 'high' : 'normal'
            });
        } catch (e) {
            console.warn('[InjectionIncomingModule] 수입검사 등록 통보 실패:', e);
        }
    }

    function remove(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const label = `${(d.date || '').slice(0, 10)} ${d.partName || ''} (LOT: ${d.lotNo || (d.lots && d.lots.map(l => l.lotNo).join(', ')) || '-'})`;
        UIUtils.confirm(`수입검사 기록을 삭제하시겠습니까?\n\n${label}`, async function() {
            await Storage.remove(STORE, id);
            UIUtils.toast('수입검사 기록이 삭제되었습니다.', 'success');
            loadData();
        });
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const fullDate = d.date || '';
        const [datePart, timePart] = fullDate.split(' ');

        const inspectors = (Storage.getAll(DB.STORES.INSPECTORS) || [])
            .filter(i => (i.processes || []).includes('incoming'));
        const inspectorOptions = inspectors.map(i => `<option value="${i.name}" ${d.inspector === i.name ? 'selected' : ''}>${i.name}</option>`).join('');

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        // 외부공급처만 필터링
        const externalMaterials = materials.filter(m => m.supplier !== '사내');
        const carModels = UIUtils.sortCarModels(externalMaterials.map(m => m.carModel), externalMaterials);
        const carModelOptions = carModels.map(c => `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`).join('');

        UIUtils.showModal({
            title: '수입검사 수정',
            size: '1050px',
            tall: true,
            body: `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일자</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="editInjDate" value="${datePart || UIUtils.today()}">
                        <input type="time" class="form-input" id="editInjTime" value="${timePart || '00:00'}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">검사자</label>
                    <select class="form-input" id="editInjInspector">
                        <option value="">-- 검사자 선택 --</option>
                        ${inspectorOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjCarModel" onchange="InjectionIncomingModule.onCarModelSelectEdit()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjPart" onchange="InjectionIncomingModule.onPartNameSelectEdit()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjColor" onchange="InjectionIncomingModule.onColorSelectEdit()">
                        <option value="">-- 품명 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <input type="text" class="form-input" id="editInjSupplier" placeholder="자동 입력" readonly style="background:var(--bg-secondary);">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">조치 사항</label>
                    <select class="form-input" id="editInjMeasure">
                        <option value="사출처 통보" ${d.measure === '사출처 통보' ? 'selected' : ''}>사출처 통보</option>
                        <option value="반품" ${d.measure === '반품' ? 'selected' : ''}>반품</option>
                        <option value="부분 반품" ${d.measure === '부분 반품' ? 'selected' : ''}>부분 반품</option>
                        <option value="조정" ${d.measure === '조정' ? 'selected' : ''}>조정</option>
                        <option value="폐기" ${d.measure === '폐기' ? 'selected' : ''}>폐기</option>
                    </select>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <label class="form-label" style="margin:0; font-weight:600;">
                        LOT 목록 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-left:6px;">☑ 성적서 접수된 LOT 체크</span>
                    </label>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjectionIncomingModule.addInjLotRow()" style="display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;">add</span> LOT 추가
                    </button>
                </div>
                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div style="display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; font-size:0.78rem; color:var(--text-muted); padding-bottom:6px; border-bottom:1px solid var(--border); margin-bottom:6px;">
                        <span style="text-align:center; font-size:1rem;">✓</span>
                        <span>LOT번호 (YYMMDD)</span>
                        <span style="text-align:right;">수량 (EA)</span>
                        <span></span>
                    </div>
                    <div id="editInjLotRows"></div>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 입고수량</span>
                    <span id="editInjLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="editInjInQty" value="0">
            </div>
            <div id="injCertPhotoRow" style="display:none;margin-bottom:16px;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:12px 16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
                    <label class="form-label" style="margin:0;font-weight:600;">
                        성적서 접수 사진
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">체크 시 사진 촬영/등록 가능</span>
                    </label>
                    <span id="injCertPhotoName" style="font-size:0.78rem;color:var(--text-muted);"></span>
                </div>
                <input type="file" class="form-input" id="injCertPhotoFile" accept="image/*" capture="environment" onchange="InjectionIncomingModule.onInjCertPhotoChange(this)">
                <input type="hidden" id="injCertPhotoUrl" value="${d.certPhotoUrl || ''}">
                <div id="injCertPhotoPreview" style="display:none;margin-top:10px;"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사수량</label>
                    <input type="number" class="form-input" id="editInjInspQty" value="${d.inspectionQty || 0}">
                </div>
            </div>

            <!-- 불량 상세 입력 별도 (사출 불량 목록 호출) -->
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span>
                불량 상세 (사출 불량)
            </div>
            <div id="editInjDefectBreakdown" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px;">
                <!-- JavaScript 통해서 동적 렌더링됨 -->
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">총 불합격수량</label>
                    <input type="number" class="form-input" id="editInjFailQty" value="${d.failQty || 0}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="editInjNote">${d.note || ''}</textarea>
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label class="form-label">합격 판정 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-input" id="editInjVerdict" onchange="InjectionIncomingModule.onEditVerdictChange()">
                    <option value="" ${!d.verdict ? 'selected' : ''}>-- 선택 --</option>
                    <option value="합격" ${d.verdict === '합격' ? 'selected' : ''}>합격</option>
                    <option value="불합격" ${d.verdict === '불합격' ? 'selected' : ''}>불합격</option>
                </select>
                <input type="hidden" id="editInjPassQty" value="${d.passQty || 0}">
            </div>
            `,
            footer: `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.saveEdit('${id}')">저장</button>
        `
        });

        setTimeout(() => {
            // 1. 차종/품명/컬러 cascading selector 초기화
            const carModelSel = document.getElementById('editInjCarModel');
            const partSel = document.getElementById('editInjPart');
            const colorSel = document.getElementById('editInjColor');
            const supplierField = document.getElementById('editInjSupplier');

            if (carModelSel && partSel && colorSel && supplierField) {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

                // 선택된 차종 가져오기
                const selectedCarModel = carModelSel.value;

                if (selectedCarModel) {
                    // 차종에 해당하는 품명 목록 구성
                    const filtered = materials.filter(function(m) {
                        return m.carModel === selectedCarModel && (m.supplier !== '사내');
                    });
                    const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
                    partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                        partNames.map(p => `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`).join('');

                    // 선택된 품명 가져오기
                    const selectedPartName = partSel.value;

                    if (selectedPartName) {
                        // 품명에 해당하는 컬러 목록 구성
                        const filteredByPart = materials.filter(function(m) {
                            return m.carModel === selectedCarModel && m.injPartName === selectedPartName && (m.supplier !== '사내');
                        });
                        const colors = [...new Set(filteredByPart.map(m => m.injColor).filter(Boolean))].sort();
                        colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
                            colors.map(c => `<option value="${c}" ${d.color === c ? 'selected' : ''}>${c}</option>`).join('');

                        // 선택된 컬러에 해당하는 공급처 채우기
                        const selectedColor = colorSel.value;
                        if (selectedColor) {
                            const material = materials.find(function(m) {
                                return m.carModel === selectedCarModel && m.injPartName === selectedPartName && m.injColor === selectedColor && (m.supplier !== '사내');
                            });
                            supplierField.value = material ? (material.supplier || '') : '';
                        } else {
                            supplierField.value = d.supplierName || '';
                        }
                    } else {
                        colorSel.innerHTML = '<option value="">-- 품명 먼저 선택 --</option>';
                        supplierField.value = d.supplierName || '';
                    }
                } else {
                    partSel.innerHTML = '<option value="">-- 차종 먼저 선택 --</option>';
                    colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
                    supplierField.value = '';
                }
            }

            // 2. LOT 행 초기화 (수정 데이터에서)
            const lotContainer = document.getElementById('editInjLotRows');
            if (lotContainer) {
                lotContainer.innerHTML = '';
                if (d.lots && d.lots.length > 0) {
                    d.lots.forEach(function(lot) {
                        const row = document.createElement('div');
                        row.className = 'inj-lot-row';
                        row.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
                        row.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
                            + '<input type="checkbox" class="inj-lot-cert" onchange="InjectionIncomingModule.selectInjCertLot(this)" style="width:16px;height:16px;cursor:pointer;" ' + ((lot.certRepresentative || (!d.certRepresentativeLotNo && lot.certReceived)) ? 'checked' : '') + '>'
                            + '</label>'
                            + '<input type="text" class="form-input inj-lot-no" value="' + (lot.lotNo || '') + '" maxlength="6" placeholder="YYMMDD"'
                            + ' style="font-family:monospace; letter-spacing:1px;"'
                            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                            + '<input type="number" class="form-input inj-lot-qty" value="' + (lot.qty || 0) + '" min="0" placeholder="0"'
                            + ' style="text-align:right;"'
                            + ' oninput="InjectionIncomingModule.calcInjLotTotalEdit()">'
                            + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
                            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                            + '</button>';
                        lotContainer.appendChild(row);
                    });
                } else {
                    var row = document.createElement('div');
                    row.className = 'inj-lot-row';
                    row.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
                    row.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
                        + '<input type="checkbox" class="inj-lot-cert" onchange="InjectionIncomingModule.selectInjCertLot(this)" style="width:16px;height:16px;cursor:pointer;">'
                        + '</label>'
                        + '<input type="text" class="form-input inj-lot-no" value="' + (d.lotNo || '') + '" maxlength="6" placeholder="YYMMDD"'
                        + ' style="font-family:monospace; letter-spacing:1px;"'
                        + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                        + '<input type="number" class="form-input inj-lot-qty" value="0" min="0" placeholder="0"'
                        + ' style="text-align:right;"'
                        + ' oninput="InjectionIncomingModule.calcInjLotTotalEdit()">'
                        + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
                        + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                        + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                        + '</button>';
                    lotContainer.appendChild(row);
                }
                InjectionIncomingModule.calcInjLotTotalEdit();
                _syncInjCertPhotoSection();
                _renderInjCertPhotoPreview(d.certPhotoUrl || '', d.certPhotoUrl ? '저장된 사진' : '');
            }

            // 3. 불량 상세 입력 초기화
            try {
                const allDefs = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
                const defects = allDefs.filter(df => df && (df.type === 'injection' || !df.type));
                const container = document.getElementById('editInjDefectBreakdown');
                if (!container) return; // 모달이 이미 닫혔을 경우 방어
                const details = d.defectDetails || {};

                if (defects.length === 0) {
                    container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다.</div>';
                } else {
                    container.innerHTML = defects.map(df => {
                        const val = details[df.name] || '';
                        const safeName = (df.name || '').replace(/"/g, '&quot;');
                        return `
                        <div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">
                            <label style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:4px;margin-bottom:4px;min-width:0;">
                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${safeName}">${df.name || ''}</span>
                                <button type="button" title="불량유형 보기"
                                    onclick="LaserInspectionModule.showDefectTypeView('${df.id}')"
                                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex-shrink:0;padding:0;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                </button>
                            </label>
                            <input type="number" class="form-input defect-input-edit" data-defect-id="${df.id}" data-defect-name="${safeName}" min="0" placeholder="0" value="${val}" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalEditFailQty()">
                        </div>
                    `;
                    }).join('');
                }
            } catch (e) {
                console.error('[사출 불량 렌더] 수정폼 오류:', e);
            }
        }, 100);
    }

    function calcTotalEditFailQty() {
        const inputs = document.querySelectorAll('.defect-input-edit');
        let total = 0;
        inputs.forEach(input => {
            total += (Number(input.value) || 0);
        });
        document.getElementById('editInjFailQty').value = total || 0;
        onEditVerdictChange();
    }

    function _inspLotsSnapshot(d) {
        if (d && Array.isArray(d.lots) && d.lots.length) {
            return d.lots.map(function (l) {
                return { lotNo: String((l && l.lotNo) || '').trim(), qty: Number(l && l.qty) || 0 };
            }).filter(function (l) { return l.lotNo || l.qty > 0; });
        }
        if (d && d.lotNo) {
            return [{ lotNo: String(d.lotNo).trim(), qty: Number(d.incomingQty || d.passQty) || 0 }];
        }
        return [];
    }

    function _inspQtyOf(d) {
        const fromLots = _inspLotsSnapshot(d).reduce(function (s, l) { return s + l.qty; }, 0);
        if (fromLots > 0) return fromLots;
        return Number(d && (d.passQty || d.incomingQty)) || 0;
    }

    function _lotsEqual(a, b) {
        const key = function (d) {
            return _inspLotsSnapshot(d).map(function (l) { return l.lotNo + ':' + l.qty; }).sort().join('|');
        };
        return key(a) === key(b);
    }

    function _qtyFieldsChanged(prev, next) {
        if (!_lotsEqual(prev, next)) return true;
        if (Number(prev.incomingQty || 0) !== Number(next.incomingQty || 0)) return true;
        if (Number(prev.passQty || 0) !== Number(next.passQty || 0)) return true;
        if (Number(prev.failQty || 0) !== Number(next.failQty || 0)) return true;
        if (String(prev.verdict || '') !== String(next.verdict || '')) return true;
        return false;
    }

    function _formatLotSummary(lots) {
        const list = Array.isArray(lots) ? lots : [];
        if (!list.length) return '-';
        return list.map(function (l) {
            return String((l && l.lotNo) || '-') + '(' + UIUtils.formatNumber(Number(l && l.qty) || 0) + ')';
        }).join(', ');
    }

    function _escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _inspectionChangeLogs(inspId) {
        return (Storage.getAll(DB.STORES.INSPECTION_DELETE_LOGS) || [])
            .filter(function (l) {
                return String(l.originalId || '') === String(inspId)
                    && (l.action === 'edit' || l.type === 'injection_edit');
            })
            .sort(function (a, b) {
                return String(b.deletedAt || b.changedAt || '').localeCompare(String(a.deletedAt || a.changedAt || ''));
            });
    }

    function _inspectionChangeLogsHtml(inspId) {
        const logs = _inspectionChangeLogs(inspId);
        const whAdj = (typeof InjectionWarehouseModule !== 'undefined'
            && typeof InjectionWarehouseModule.listInspectionEditAdjustments === 'function')
            ? InjectionWarehouseModule.listInspectionEditAdjustments(inspId)
            : [];
        if (!logs.length && !whAdj.length) {
            return `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--bg-secondary);font-size:0.82rem;color:var(--text-muted);">
                수량 변경 이력이 없습니다. 수입검사 수정 후 창고 반영을 선택하면 여기에 남습니다.
            </div>`;
        }
        const logRows = logs.map(function (l) {
            const when = String(l.deletedAt || l.changedAt || '').replace('T', ' ').slice(0, 19);
            const before = l.originalData || {};
            const after = l.afterData || {};
            const sync = l.warehouseSync || {};
            const syncText = sync.applied
                ? ('창고 ' + (sync.type || '반영') + ' ' + UIUtils.formatNumber(sync.qty || 0) + ' EA')
                : (sync.requested ? '창고 미반영(검사만 수정)' : '창고 연동 없음');
            return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
                <div style="font-weight:700;color:#c2410c;">${_escHtml(when || '-')} · ${_escHtml(l.deletedBy || '-')}</div>
                <div style="margin-top:4px;color:var(--text-secondary);">
                    ${_escHtml(_formatLotSummary(_inspLotsSnapshot(before)))}
                    → ${_escHtml(_formatLotSummary(_inspLotsSnapshot(after)))}
                    (${UIUtils.formatNumber(_inspQtyOf(before))} → ${UIUtils.formatNumber(_inspQtyOf(after))} EA)
                </div>
                <div style="margin-top:2px;color:var(--text-muted);">사유: ${_escHtml(l.reason || '-')} · ${_escHtml(syncText)}</div>
            </div>`;
        }).join('');
        const whRows = whAdj.map(function (r) {
            const q = Number(r.quantity) || 0;
            return `<div style="padding:6px 0;color:var(--text-secondary);">
                ${_escHtml(String(r.date || '').replace('T', ' ').slice(0, 16))}
                · ${r.type === '출고' ? '차감' : '입고'} ${UIUtils.formatNumber(q)} EA
                · ${_escHtml(r.note || r.source || '')}
            </div>`;
        }).join('');
        return `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(194,65,12,.25);background:rgba(194,65,12,.05);font-size:0.82rem;line-height:1.55;">
            <strong style="color:#c2410c;">수량 변경 이력</strong>
            ${logRows || ''}
            ${whRows ? '<div style="margin-top:8px;font-weight:700;color:#c2410c;">창고 반영</div>' + whRows : ''}
        </div>`;
    }

    let _pendingEditCtx = null;

    async function saveEdit(id) {
        const dateVal = document.getElementById('editInjDate').value;
        const timeVal = document.getElementById('editInjTime').value;
        const certPhotoInput = document.getElementById('injCertPhotoFile');
        let certPhotoUrl = document.getElementById('injCertPhotoUrl')?.value || '';
        if (certPhotoInput && certPhotoInput.files && certPhotoInput.files[0]) {
            certPhotoUrl = await _uploadInjCertPhoto(certPhotoInput.files[0]);
        }

        // LOT 목록 수집
        const lotRows = document.querySelectorAll('#editInjLotRows .inj-lot-row');
        const lots = [];
        let _missingLotNo = false;  // 수량은 있는데 LOT 번호가 빈 행
        lotRows.forEach(function(row) {
            const lotNo = ((row.querySelector('.inj-lot-no') || {}).value || '').trim();
            const qty = Number((row.querySelector('.inj-lot-qty') || {}).value) || 0;
            const certReceived = ((row.querySelector('.inj-lot-cert') || {}).checked) || false;
            // LOT 번호 없이 수량만 입력하면 빈 LOT이 저장돼 창고까지 전파된다(추적 불가). 저장 차단.
            if (qty > 0 && !lotNo) { _missingLotNo = true; return; }
            if (lotNo || qty > 0) {
                lots.push({ lotNo: lotNo, qty: qty, certReceived: certReceived });
            }
        });

        if (_missingLotNo) {
            UIUtils.toast('LOT 번호 없이 수량만 입력된 행이 있습니다. LOT 번호를 입력하세요.', 'warning');
            return;
        }
        if (lots.length === 0) {
            UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
            return;
        }

        const certifiedLotNos = getCertifiedLotNos();
        lots.forEach(l => {
            if (!l.certReceived && certifiedLotNos.has(l.lotNo)) l.certReceived = true;
        });
        const certState = normalizeCertLots(lots);
        const incomingQty = certState.lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const updateData = {
            date: `${dateVal} ${timeVal}`,
            inspector: document.getElementById('editInjInspector').value.trim(),
            carModel: document.getElementById('editInjCarModel').value.trim(),
            partName: document.getElementById('editInjPart').value.trim(),
            color: document.getElementById('editInjColor').value.trim(),
            lots: certState.lots,
            lotNo: certState.lots.length > 0 ? certState.lots[0].lotNo : '',
            certRepresentativeLotNo: certState.representativeLotNo,
            incomingQty: incomingQty,
            inspectionQty: Number(document.getElementById('editInjInspQty').value) || 0,
            passQty: Number(document.getElementById('editInjPassQty').value) || 0,
            verdict: document.getElementById('editInjVerdict')?.value || '',
            failQty: Number(document.getElementById('editInjFailQty').value) || 0,
            defectDetails: {},
            supplierName: document.getElementById('editInjSupplier').value.trim(),
            note: document.getElementById('editInjNote').value.trim(),
            measure: document.getElementById('editInjMeasure')?.value || '사출처 통보',
            certPhotoUrl: certPhotoUrl
        };

        const defectInputs = document.querySelectorAll('.defect-input-edit');
        defectInputs.forEach(function(input) {
            const qty = Number(input.value) || 0;
            if (qty > 0) {
                const name = input.getAttribute('data-defect-name');
                updateData.defectDetails[name] = qty;
            }
        });

        if (!updateData.partName) {
            UIUtils.toast('품명을 선택하세요.', 'warning');
            return;
        }
        if (!updateData.carModel) {
            UIUtils.toast('차종을 선택하세요.', 'warning');
            return;
        }
        if (!updateData.color) {
            UIUtils.toast('컬러를 선택하세요.', 'warning');
            return;
        }
        if (!updateData.inspector) {
            UIUtils.toast('검사자를 선택하세요.', 'warning');
            return;
        }
        if (!updateData.verdict) {
            UIUtils.toast('합격 판정을 선택하세요.', 'warning');
            return;
        }

        const prev = Storage.getById(STORE, id);
        if (!prev) {
            UIUtils.toast('레코드를 찾을 수 없습니다.', 'error');
            return;
        }

        if (!_qtyFieldsChanged(prev, updateData)) {
            await Storage.update(STORE, id, updateData);
            await propagateCertReceived(updateData.lots);
            UIUtils.closeModal();
            UIUtils.toast('수정되었습니다.', 'success');
            search();
            return;
        }

        const afterPreview = Object.assign({}, prev, updateData, { id: prev.id });
        const preview = (typeof InjectionWarehouseModule !== 'undefined'
            && typeof InjectionWarehouseModule.previewInspectionWarehouseSync === 'function')
            ? InjectionWarehouseModule.previewInspectionWarehouseSync(prev, afterPreview)
            : {
                skipWarehouse: true,
                inboundCount: 0,
                beforeQty: _inspQtyOf(prev),
                afterQty: _inspQtyOf(updateData),
                delta: 0
            };

        _pendingEditCtx = { id: id, prev: prev, updateData: updateData, preview: preview };

        if (!preview.inboundCount) {
            await _finalizeSaveEdit(false);
            return;
        }

        UIUtils.closeModal();
        _showLinkedInventoryEditChoice();
    }

    function _showLinkedInventoryEditChoice() {
        const ctx = _pendingEditCtx;
        if (!ctx) return;
        const p = ctx.preview || {};
        const beforeLots = _formatLotSummary(_inspLotsSnapshot(ctx.prev));
        const afterLots = _formatLotSummary(_inspLotsSnapshot(ctx.updateData));
        const blocked = !!p.blocked;
        const skipWh = !!p.skipWarehouse && !blocked;
        const delta = Number(p.delta) || 0;
        const deltaLabel = delta === 0
            ? '창고 수량 변동 없음'
            : (delta < 0
                ? '창고에서 ' + UIUtils.formatNumber(-delta) + ' EA 차감 이력을 남김'
                : '창고에 ' + UIUtils.formatNumber(delta) + ' EA 추가입고 이력을 남김');
        const lotLines = (p.lots || []).map(function (l) {
            return _escHtml(l.lotNo) + ' · ' + UIUtils.formatNumber(l.qty) + ' EA';
        }).join('<br>');

        UIUtils.showModal('수입검사 수량 수정 — 창고 반영',
            `<div style="padding:8px 0;">
                <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:14px;font-size:0.85rem;line-height:1.7;">
                    이 수입검사는 이미 사출 창고에 입고되어 있습니다.<br>
                    합격수량 <strong>${UIUtils.formatNumber(p.beforeQty)}</strong> EA →
                    <strong style="color:#c2410c;">${UIUtils.formatNumber(p.afterQty)}</strong> EA<br>
                    <div style="margin-top:6px;font-family:monospace;font-size:0.8rem;color:var(--text-secondary);">
                        변경 전 LOT: ${_escHtml(beforeLots)}<br>
                        변경 후 LOT: ${_escHtml(afterLots)}
                    </div>
                </div>
                ${blocked
                    ? `<div style="padding:10px 12px;border-radius:8px;border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.06);font-size:0.85rem;line-height:1.55;margin-bottom:12px;">
                            <strong style="color:var(--accent-red);">창고 반영 불가</strong> — ${_escHtml(p.blockReason || '이미 출고된 수량이 있습니다.')}<br>
                            검사 기록만 수정할 수 있습니다. 창고 수량은 직접 출고/보정해야 합니다.
                       </div>`
                    : (skipWh
                        ? `<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
                                창고 입고 합계는 이미 수정 후 합격수량과 같습니다. 검사 변경 이력만 남깁니다.
                           </div>`
                        : `<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
                                원 입고 기록은 그대로 두고, <strong>${_escHtml(deltaLabel)}</strong> 합니다.
                                ${lotLines ? '<div style="margin-top:6px;font-family:monospace;">' + lotLines + '</div>' : ''}
                                이 보정은 사출 창고 입출고 이력과 이력변경 관리에서 추적할 수 있습니다.
                           </div>`)}
                <div class="form-group">
                    <label class="form-label">수정 사유 ${(!blocked && !skipWh) ? '<span style="color:var(--accent-red)">*</span>' : ''}</label>
                    <input type="text" class="form-input" id="inspEditReasonInput" placeholder="예: 1박스 불량으로 합격수량 360 EA 감소">
                </div>
            </div>`,
            blocked
                ? `<button class="btn btn-secondary" onclick="UIUtils.closeModal();InjectionIncomingModule._cancelPendingEdit()">취소</button>
                   <button class="btn" style="background:#dc2626;color:#fff;" onclick="InjectionIncomingModule._finalizeSaveEdit(false)">검사 기록만 수정</button>`
                : (skipWh
                    ? `<button class="btn btn-secondary" onclick="UIUtils.closeModal();InjectionIncomingModule._cancelPendingEdit()">취소</button>
                       <button class="btn btn-primary" onclick="InjectionIncomingModule._finalizeSaveEdit(false)">변경 이력 남기고 저장</button>`
                    : `<button class="btn btn-secondary" onclick="UIUtils.closeModal();InjectionIncomingModule._cancelPendingEdit()">취소</button>
                       <button class="btn btn-outline" onclick="InjectionIncomingModule._finalizeSaveEdit(false)">검사 기록만 수정</button>
                       <button class="btn btn-primary" onclick="InjectionIncomingModule._finalizeSaveEdit(true)">검사 수정 + 창고 반영</button>`),
            '560px'
        );
    }

    function _cancelPendingEdit() {
        _pendingEditCtx = null;
    }

    async function _finalizeSaveEdit(syncWarehouse) {
        const ctx = _pendingEditCtx;
        if (!ctx) {
            UIUtils.toast('수정 요청이 만료되었습니다. 다시 시도하세요.', 'error');
            return;
        }
        const reasonEl = document.getElementById('inspEditReasonInput');
        const reason = reasonEl ? String(reasonEl.value || '').trim() : '';
        if (syncWarehouse && !reason) {
            UIUtils.toast('창고 반영 사유를 입력하세요.', 'warning');
            return;
        }

        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        const who = user ? (user.displayName || user.name || user.username) : '알 수 없음';
        const logEntry = {
            id: Storage.generateId(),
            type: 'injection_edit',
            typeLabel: '사출 수입검사 수정',
            action: 'edit',
            deletedAt: new Date().toISOString(),
            changedAt: new Date().toISOString(),
            deletedBy: who,
            reason: reason || '수입검사 수량 수정',
            originalId: ctx.id,
            originalData: Object.assign({}, ctx.prev),
            afterData: Object.assign({}, ctx.updateData),
            summary: (ctx.prev.date || '') + ' / ' + (ctx.prev.carModel || '') + ' ' + (ctx.prev.partName || '')
                + ' / ' + UIUtils.formatNumber(_inspQtyOf(ctx.prev)) + '→' + UIUtils.formatNumber(_inspQtyOf(ctx.updateData)) + 'EA',
            warehouseSync: { requested: !!syncWarehouse }
        };

        if (syncWarehouse && typeof InjectionWarehouseModule !== 'undefined'
            && typeof InjectionWarehouseModule.applyInspectionWarehouseSync === 'function') {
            const synced = await InjectionWarehouseModule.applyInspectionWarehouseSync(
                ctx.prev,
                Object.assign({}, ctx.prev, ctx.updateData, { id: ctx.id }),
                { logId: logEntry.id, reason: reason }
            );
            if (synced.needLogin) {
                UIUtils.toast('로그인 후 창고 반영을 진행하세요.', 'warning');
                return;
            }
            if (synced.blocked) {
                UIUtils.toast((synced.preview && synced.preview.blockReason)
                    ? synced.preview.blockReason
                    : '창고 잔량이 부족하여 반영할 수 없습니다.', 'error');
                return;
            }
            logEntry.warehouseSync = {
                requested: true,
                applied: !!synced.applied,
                skipped: !!synced.skipped,
                type: synced.type || '',
                qty: synced.qty || 0,
                lots: synced.lots || []
            };
        }

        await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, logEntry);
        await Storage.update(STORE, ctx.id, ctx.updateData);
        await propagateCertReceived(ctx.updateData.lots);
        UIUtils.closeModal();
        _pendingEditCtx = null;
        let syncMsg = '';
        if (logEntry.warehouseSync && logEntry.warehouseSync.applied) {
            syncMsg = logEntry.warehouseSync.type === '출고'
                ? ' 창고에서 ' + UIUtils.formatNumber(logEntry.warehouseSync.qty) + ' EA 차감 이력을 남겼습니다.'
                : ' 창고에 ' + UIUtils.formatNumber(logEntry.warehouseSync.qty) + ' EA 추가입고 이력을 남겼습니다.';
        } else if (syncWarehouse === false && ctx.preview && ctx.preview.inboundCount) {
            syncMsg = ' 창고 수량은 그대로 두었습니다.';
        }
        UIUtils.toast('수정되었습니다.' + syncMsg, 'success');
        search();
        try { if (typeof InjectionWarehouseModule !== 'undefined') InjectionWarehouseModule.renderInspStandby(); } catch (e) {}
        try {
            if (typeof InjectionWarehouseModule !== 'undefined' && InjectionWarehouseModule.loadData) {
                InjectionWarehouseModule.loadData();
            }
        } catch (e) {}
    }

    function view(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const verdictText = d.verdict || '-';
        const verdictColor = d.verdict === '합격' ? 'var(--accent-green)' : d.verdict === '불합격' ? 'var(--accent-red)' : 'var(--text-muted)';
        const lotList = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false, qty: d.incomingQty }] : []);
        // certRepresentative=true 인 lot만 성적서 표기 (normalizeCertLots이 모든 lot에 certReceived:true를 설정하기 때문)
        const certRepLot = lotList.find(l => l.certRepresentative) || null;
        const lotDisplay = lotList.map(l => {
            const isCert = l.certRepresentative === true;
            const qtyText = l.qty != null ? ` - ${UIUtils.formatNumber(l.qty)}EA` : '';
            const certBadge = isCert
                ? ` <span style="color:var(--accent-green);font-size:0.75rem;font-weight:600;">✓성적서</span>`
                : '';
            return `<span style="display:inline-flex;align-items:center;gap:2px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:3px 10px;font-family:monospace;font-size:0.85rem;margin:2px 2px 4px;">
                <span style="font-weight:600;">${l.lotNo || '-'}</span><span style="color:var(--text-muted);">${qtyText}</span>${certBadge}
            </span>`;
        }).join('');
        const certStatusDisplay = certRepLot
            ? `<span style="color:var(--accent-green);font-weight:600;">${certRepLot.lotNo} ✓ 접수완료</span>`
            : `<span style="color:var(--accent-red);">미접수</span>`;
        const defectStr = Object.entries(d.defectDetails || {}).map(([k, v]) => `${k}(${v})`).join(', ') || '-';
        const certPhotoUrl = d.certPhotoUrl || '';
        const certPhotoAbs = certPhotoUrl ? ApiClient.photoUrl(certPhotoUrl) : '';
        const certPhotoDisplay = certPhotoAbs
            ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <a href="${certPhotoAbs}" target="_blank" rel="noopener" style="color:var(--accent-blue);font-weight:600;text-decoration:none;">저장된 사진 보기</a>
                    <img src="${certPhotoAbs}" alt="성적서 사진" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open(${JSON.stringify(certPhotoAbs)}, '_blank')">
                </div>`
            : '-';

        const row = (label, value) =>
            `<div style="display:flex;gap:0;border-bottom:1px solid var(--border);">
                <div style="width:130px;flex-shrink:0;padding:8px 12px;background:var(--bg-secondary);font-size:0.82rem;font-weight:600;color:var(--text-muted);">${label}</div>
                <div style="flex:1;padding:8px 14px;font-size:0.9rem;">${value}</div>
            </div>`;

        UIUtils.showModal(`사출 수입검사 상세`, `
            <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:16px;">
                ${row('검사일자', d.date || '-')}
                ${row('검사자', d.inspector || '-')}
                ${row('차종', d.carModel || '-')}
                ${row('품명', d.partName || '-')}
                ${row('컬러', d.color || '-')}
                ${row('사출처', d.supplierName || '-')}
                ${row('입고수량', UIUtils.formatNumber(d.incomingQty) + ' EA')}
                ${row('사출 LOT', lotDisplay || '-')}
                ${row('성적서 접수', certStatusDisplay)}
                ${row('시료코드', d.sampleCode || '-')}
                ${row('검사수량', UIUtils.formatNumber(d.inspectionQty))}
                ${row('AC/RE', (d.acCriteria != null ? d.acCriteria + ' / ' + d.reCriteria : '-'))}
                ${row('합격수량', `<span style="color:var(--accent-green);font-weight:600;">${UIUtils.formatNumber(d.passQty)}</span>`)}
                ${row('불합격수량', `<span style="color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(d.failQty)}</span>`)}
                ${row('불량내역', defectStr)}
                ${row('비고', d.note || '-')}

                ${row('성적서 사진', certPhotoDisplay)}
                ${row('합격 판정', `<strong style="color:${verdictColor};font-size:1rem;">${verdictText}</strong>`)}
            </div>
            ${_inspectionChangeLogsHtml(id)}
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-outline" onclick="UIUtils.closeModal();InjectionIncomingModule.edit('${id}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">edit</span> 수정
            </button>
            <button class="btn" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
                onclick="InjectionIncomingModule.confirmDelete('${id}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">delete</span> 삭제
            </button>
        `, '700px');
    }

    function confirmDelete(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const label = `${d.date || ''} / ${d.carModel || ''} ${d.partName || ''}`;
        UIUtils.showModal('삭제 확인 — 관리자 인증 필요',
            `<div style="padding:8px 0;">
                <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:16px;">
                    <span class="material-symbols-outlined" style="color:#ea580c;font-size:28px;">warning</span>
                    <div>
                        <div style="font-weight:700;color:#c2410c;margin-bottom:4px;">삭제 후 복구가 불가능합니다</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);">${label}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">삭제 사유 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="deleteReasonInput" placeholder="삭제 사유를 입력하세요">
                </div>
                <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">info</span>
                    삭제 시 관리자 인증이 필요하며, 삭제 이력이 기록됩니다.
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn" style="background:#dc2626;color:#fff;" onclick="InjectionIncomingModule._doDelete('${id}')">
                 <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">lock</span> 관리자 인증 후 삭제
             </button>`,
            '520px'
        );
    }

    // 삭제 확인창(관리자 인증) 이후 → 창고 반영 여부 확인 전까지 보관하는 임시 컨텍스트
    let _pendingDeleteCtx = null;

    async function _doDelete(id) {
        const reason = (document.getElementById('deleteReasonInput') || {}).value || '';
        if (!reason.trim()) { UIUtils.toast('삭제 사유를 입력하세요.', 'warning'); return; }
        const d = Storage.getById(STORE, id);
        if (!d) { UIUtils.toast('레코드를 찾을 수 없습니다.', 'error'); return; }
        UIUtils.closeModal();
        AuthModule.requireAdminAuth(async function() {
            const linked = (typeof InjectionWarehouseModule !== 'undefined' && InjectionWarehouseModule.getLinkedInventoryForInspection)
                ? InjectionWarehouseModule.getLinkedInventoryForInspection(d)
                : [];
            _pendingDeleteCtx = { id, reason, d, linked };

            if (linked.length === 0) {
                await _finalizeDeleteInspection(id, false);
            } else {
                _showLinkedInventoryDeleteChoice();
            }
        });
    }

    // 삭제하려는 검사건이 이미 사출 창고에 입고 처리돼 있을 때 — 창고 기록도 함께 지울지 확인
    function _showLinkedInventoryDeleteChoice() {
        const ctx = _pendingDeleteCtx;
        if (!ctx) return;
        const anyConsumed = ctx.linked.some(l => l.consumed);
        const lines = ctx.linked.map(l =>
            `${l.lotNo} · ${UIUtils.formatNumber(l.qty)} EA${l.consumed ? ' <span style="color:var(--accent-red);font-weight:600;">— 이미 출고(사용)됨</span>' : ''}`
        ).join('<br>');

        UIUtils.showModal('이미 창고에 입고된 검사건입니다',
            `<div style="padding:8px 0;">
                <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:14px;font-size:0.85rem;line-height:1.7;">
                    이 수입검사 건은 이미 사출 창고(자재 입고)에 반영되어 있습니다:<br>
                    <div style="margin-top:6px;font-family:monospace;">${lines}</div>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">
                    ${anyConsumed
                        ? '일부 LOT은 이미 다른 공정에 출고되어 사용 중이므로, 재고 불일치를 막기 위해 창고 기록은 남겨두고 검사 기록만 삭제합니다.'
                        : '검사 기록만 삭제하면 창고 재고는 그대로 남아 실제 검사 이력과 어긋나게 됩니다. 창고 기록도 함께 삭제할지 선택하세요.'}
                </div>
            </div>`,
            anyConsumed
                ? `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                   <button class="btn" style="background:#dc2626;color:#fff;" onclick="InjectionIncomingModule._finalizeDeleteInspection('${ctx.id}', false)">검사 기록만 삭제</button>`
                : `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                   <button class="btn btn-outline" onclick="InjectionIncomingModule._finalizeDeleteInspection('${ctx.id}', false)">검사 기록만 삭제</button>
                   <button class="btn" style="background:#dc2626;color:#fff;" onclick="InjectionIncomingModule._finalizeDeleteInspection('${ctx.id}', true)">검사+창고 기록 함께 삭제</button>`,
            '560px'
        );
    }

    async function _finalizeDeleteInspection(id, alsoDeleteInventory) {
        const ctx = _pendingDeleteCtx;
        if (!ctx || ctx.id !== id) { UIUtils.toast('삭제 요청이 만료되었습니다. 다시 시도하세요.', 'error'); return; }

        const user = AuthModule.getCurrentUser();
        const logEntry = {
            id: Storage.generateId(),
            type: 'injection',
            typeLabel: '사출 수입검사',
            deletedAt: new Date().toISOString(),
            deletedBy: user ? user.displayName : '알 수 없음',
            reason: ctx.reason,
            originalId: id,
            originalData: Object.assign({}, ctx.d),
            summary: `${ctx.d.date || ''} / ${ctx.d.carModel || ''} ${ctx.d.partName || ''} / 입고${UIUtils.formatNumber(ctx.d.incomingQty)}EA`,
            linkedInventoryDeleted: !!alsoDeleteInventory
        };
        await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, logEntry);
        await Storage.remove(STORE, id);
        if (ctx.linked.length > 0 && typeof InjectionWarehouseModule !== 'undefined') {
            if (alsoDeleteInventory) {
                await InjectionWarehouseModule.removeLinkedInventoryRecords(ctx.linked.map(l => l.invId));
            } else if (typeof InjectionWarehouseModule.markLinkedInventoryInspDeleted === 'function') {
                // 창고 기록을 남기는 경우 — 검사 이력 없는 입고로 보이지 않도록 삭제 사유·삭제자를 남긴다
                await InjectionWarehouseModule.markLinkedInventoryInspDeleted(
                    ctx.linked.map(l => l.invId),
                    { deletedAt: logEntry.deletedAt, deletedBy: logEntry.deletedBy, reason: ctx.reason }
                );
            }
        }
        UIUtils.closeModal();
        _pendingDeleteCtx = null;
        UIUtils.toast(alsoDeleteInventory ? '검사 기록과 창고 입고 기록이 함께 삭제되었습니다.' : '삭제 완료. 이력이 기록되었습니다.', 'success');
        search();
        try { if (typeof InjectionWarehouseModule !== 'undefined') InjectionWarehouseModule.renderInspStandby(); } catch (e) {}
    }

    function remove(id) {
        confirmDelete(id);
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['검사일자', '성적서 접수 LOT번호', '품명', '업체명', '입고수량', '시료코드', '검사수량', '합격판정수(Ac)', '불합격판정수(Re)', '합격', '불합격', '비고'];
        const rows = data.map(d => [d.date, d.lotNo, d.partName, d.supplierName, d.incomingQty, d.sampleCode || '', d.inspectionQty, d.acCriteria ?? '', d.reCriteria ?? '', d.passQty, d.failQty, d.note || '']);
        Storage.exportToCSV(headers, rows, '수입검사일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    function onLotInput(input, msgId) {
        // 숫자만 허용
        const val = input.value.replace(/\D/g, '').slice(0, 6);
        input.value = val;

        const msg = document.getElementById(msgId);

        if (val.length === 0) {
            if (msg) { msg.innerHTML = ''; }
            input.style.borderColor = '';
            checkFifoWarning();
            return;
        }

        if (val.length < 6) {
            if (msg) { msg.innerHTML = `<span style="color:var(--accent-red);">⚠ ${6 - val.length}자리 더 입력하세요 (현재 ${val.length}/6)</span>`; }
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
            return;
        }

        // 6자리 도달 — 날짜 유효성 확인 (YYMMDD)
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        const yyStr = val.slice(0, 2);
        const yyNum = parseInt(yyStr, 10);

        const fullYear = yyNum >= 50 ? 1900 + yyNum : 2000 + yyNum;
        const inputDate = new Date(fullYear, mm - 1, dd);

        if (inputDate.getFullYear() !== fullYear || inputDate.getMonth() !== mm - 1 || inputDate.getDate() !== dd) {
            if (msg) msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 유효하지 않은 날짜입니다 (월: ${mm}, 일: ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
            return;
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (inputDate > today) {
            if (msg) msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 오늘 이후(미래)의 날짜입니다</span>`;
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
            return;
        }

        if (msg) msg.innerHTML = `<span style="color:var(--accent-green);">✓ ${fullYear}년 ${String(mm).padStart(2, '0')}월 ${String(dd).padStart(2, '0')}일</span>`;
        input.style.borderColor = 'var(--accent-green)';

        // 선입선출(FIFO) 경고 체크
        checkFifoWarning();
    }

    function checkFifoWarning() {
        const warningEl = document.getElementById('fifoWarning');
        const warningMsg = document.getElementById('fifoWarningMsg');
        if (!warningEl || !warningMsg) return;

        const carModel = (document.getElementById('addInjCarModel') || {}).value || '';
        const partName = (document.getElementById('addInjPart') || {}).value || '';
        if (!carModel || !partName) { warningEl.style.display = 'none'; return; }

        // 입력 중인 LOT 번호들 수집
        const inputLots = Array.from(document.querySelectorAll('#injLotRows .inj-lot-no'))
            .map(el => el.value.trim())
            .filter(v => v.length === 6);
        if (inputLots.length === 0) { warningEl.style.display = 'none'; return; }

        // 기존 등록된 최대(최신) LOT 번호 조회 (같은 차종+품명)
        const allRecords = Storage.getAll(STORE);
        let maxExistingLot = '';
        allRecords.forEach(r => {
            if (r.carModel !== carModel || r.partName !== partName) return;
            const lotList = (r.lots && r.lots.length > 0) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            lotList.forEach(l => {
                if (l.lotNo && l.lotNo > maxExistingLot) maxExistingLot = l.lotNo;
            });
        });

        if (!maxExistingLot) { warningEl.style.display = 'none'; return; }

        // 입력 LOT 중 기존 최신 LOT보다 오래된 것이 있으면 경고
        const oldLots = inputLots.filter(lotNo => lotNo < maxExistingLot);
        if (oldLots.length > 0) {
            warningMsg.textContent = `선입선출 위반: LOT ${oldLots.join(', ')} 은(는) 기존 최신 LOT(${maxExistingLot})보다 오래된 재고입니다.`;
            warningEl.style.display = 'flex';
        } else {
            warningEl.style.display = 'none';
        }
    }

    /* ══════════════════════════════════════════════════════════
       수입검사 표준 (기준 사진 관리) — 로컬 전용 (IndexedDB)
    ══════════════════════════════════════════════════════════ */
    const STD_STORE = DB.STORES.INJ_INSP_STANDARDS;
    const PHOTO_TYPE_LABELS = { product:'제품', box:'박스/용기', other:'기타' };

    /* 검사 등록 모달 내 기준 사진 미리보기 갱신 */
    function _refreshStdPreview(carModel, partName) {
        const wrap = document.getElementById('injStdPhotoPreview');
        const grid = document.getElementById('injStdPhotoGrid');
        if (!wrap || !grid) return;

        if (!carModel || !partName) { wrap.style.display = 'none'; return; }

        const stds = (Storage.getAll(STD_STORE) || [])
            .filter(s => s.carModel === carModel && s.partName === partName);

        if (stds.length === 0) { wrap.style.display = 'none'; return; }

        wrap.style.display = 'block';
        grid.innerHTML = stds.map(s => `
            <div style="text-align:center;cursor:pointer;" onclick="InjectionIncomingModule._enlargePhoto('${s.imageData}','${PHOTO_TYPE_LABELS[s.photoType]||s.photoType}')">
                <img src="${s.imageData}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:2px solid var(--border-color);">
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${PHOTO_TYPE_LABELS[s.photoType]||s.photoType}</div>
            </div>`).join('');
    }

    /* 기준 사진 전체화면 확대 */
    function _enlargePhoto(src, label) {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
        ov.onclick = () => ov.remove();
        ov.innerHTML = `
            <div style="font-size:0.85rem;color:#fff;margin-bottom:10px;opacity:.8;">${label} — 클릭하여 닫기</div>
            <img src="${src}" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px;">`;
        document.body.appendChild(ov);
    }

    /* 수입검사 표준 관리 오버레이 열기 */
    function openStdModal() {
        const old = document.getElementById('injStdOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'injStdOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;' +
            'display:flex;flex-direction:column;overflow:auto;padding:16px;';
        overlay.innerHTML = `
            <div style="max-width:1000px;margin:0 auto;width:100%;background:var(--bg-primary);
                        border-radius:10px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3);">
                <div style="background:var(--bg-tertiary);padding:12px 16px;
                            display:flex;align-items:center;justify-content:space-between;
                            border-bottom:1px solid var(--border-color);">
                    <span style="font-weight:700;font-size:1rem;">
                        <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;margin-right:4px;">photo_library</span>
                        수입검사 기준 사진 관리
                    </span>
                    <button class="btn btn-secondary btn-sm"
                        onclick="document.getElementById('injStdOverlay').remove()">✕ 닫기</button>
                </div>
                <div style="padding:12px 16px;background:var(--bg-secondary);
                            display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
                            border-bottom:1px solid var(--border-color);">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.78rem;">차종</label>
                        <select class="form-select" id="stdFilterCar" style="min-width:110px;"
                            onchange="InjectionIncomingModule._stdFilterPartUpdate()">
                            <option value="">전체</option>
                            ${[...new Set((Storage.getAll(DB.STORES.INJECTION_MATERIALS)||[])
                                .map(m=>m.carModel).filter(Boolean))].sort()
                                .map(c=>`<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.78rem;">품명</label>
                        <select class="form-select" id="stdFilterPart" style="min-width:130px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <button class="btn btn-outline btn-sm"
                        onclick="InjectionIncomingModule._renderStdList()">
                        <span class="material-symbols-outlined" style="font-size:14px;">search</span> 조회
                    </button>
                    <button class="btn btn-primary btn-sm" style="margin-left:auto;"
                        onclick="InjectionIncomingModule._openStdAddForm()">
                        <span class="material-symbols-outlined" style="font-size:14px;">add_photo_alternate</span>
                        사진 등록
                    </button>
                </div>
                <!-- 등록 폼 (숨김) -->
                <div id="stdAddFormWrap" style="display:none;padding:14px 16px;
                    background:#f8fafd;border-bottom:2px solid var(--accent-blue);">
                    <div style="font-weight:600;margin-bottom:10px;color:var(--accent-blue);font-size:0.9rem;">새 기준 사진 등록</div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.78rem;">차종 *</label>
                            <select class="form-select" id="stdNewCar"
                                onchange="InjectionIncomingModule._stdNewCarChange()">
                                <option value="">-- 선택 --</option>
                                ${[...new Set((Storage.getAll(DB.STORES.INJECTION_MATERIALS)||[])
                                    .map(m=>m.carModel).filter(Boolean))].sort()
                                    .map(c=>`<option value="${c}">${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.78rem;">품명 *</label>
                            <select class="form-select" id="stdNewPart">
                                <option value="">-- 차종 먼저 선택 --</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.78rem;">사진 유형 *</label>
                            <select class="form-select" id="stdNewType">
                                <option value="product">제품</option>
                                <option value="box">박스/용기</option>
                                <option value="other">기타</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.78rem;">비고</label>
                            <input class="form-input" id="stdNewNote" placeholder="(선택)" style="font-size:0.82rem;">
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                        <input type="file" id="stdNewFile" accept="image/*" style="flex:1;"
                            onchange="InjectionIncomingModule._stdPreviewNew(this)">
                        <div id="stdNewThumb" style="width:80px;height:60px;border:1px dashed var(--border-color);
                            border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                            <span class="material-symbols-outlined" style="color:var(--text-muted);">image</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm"
                            onclick="InjectionIncomingModule._saveStd()">저장</button>
                        <button class="btn btn-secondary btn-sm"
                            onclick="document.getElementById('stdAddFormWrap').style.display='none'">취소</button>
                    </div>
                </div>
                <!-- 목록 -->
                <div id="stdListWrap" style="padding:14px 16px;min-height:150px;"></div>
            </div>`;
        document.body.appendChild(overlay);
        _renderStdList();
    }

    function _stdFilterPartUpdate() {
        const car  = document.getElementById('stdFilterCar')?.value || '';
        const sel  = document.getElementById('stdFilterPart');
        if (!sel) return;
        const parts = [...new Set(
            (Storage.getAll(DB.STORES.INJECTION_MATERIALS)||[])
            .filter(m => !car || m.carModel === car)
            .map(m => m.injPartName).filter(Boolean)
        )].sort();
        sel.innerHTML = '<option value="">전체</option>' +
            parts.map(p=>`<option value="${p}">${p}</option>`).join('');
    }

    function _stdNewCarChange() {
        const car = document.getElementById('stdNewCar')?.value || '';
        const sel = document.getElementById('stdNewPart');
        if (!sel) return;
        const parts = [...new Set(
            (Storage.getAll(DB.STORES.INJECTION_MATERIALS)||[])
            .filter(m => m.carModel === car)
            .map(m => m.injPartName).filter(Boolean)
        )].sort();
        sel.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            parts.map(p=>`<option value="${p}">${p}</option>`).join('');
    }

    function _stdPreviewNew(input) {
        const thumb = document.getElementById('stdNewThumb');
        if (!thumb || !input.files || !input.files[0]) return;
        const reader = new FileReader();
        reader.onload = e => {
            thumb.innerHTML = `<img src="${e.target.result}"
                style="width:100%;height:100%;object-fit:cover;border-radius:5px;">`;
        };
        reader.readAsDataURL(input.files[0]);
    }

    function _openStdAddForm() {
        const wrap = document.getElementById('stdAddFormWrap');
        if (wrap) wrap.style.display = 'block';
    }

    async function _saveStd() {
        const car   = document.getElementById('stdNewCar')?.value?.trim();
        const part  = document.getElementById('stdNewPart')?.value?.trim();
        const type  = document.getElementById('stdNewType')?.value || 'product';
        const note  = document.getElementById('stdNewNote')?.value?.trim() || '';
        const file  = document.getElementById('stdNewFile')?.files?.[0];

        if (!car)  { UIUtils.toast('차종을 선택하세요', 'warning'); return; }
        if (!part) { UIUtils.toast('품명을 선택하세요', 'warning'); return; }
        if (!file) { UIUtils.toast('사진 파일을 선택하세요', 'warning'); return; }

        const imageData = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload  = e => res(e.target.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
        });

        try {
            await Storage.add(STD_STORE, {
                carModel:  car,
                partName:  part,
                photoType: type,
                imageData,
                note,
                updatedAt: new Date().toISOString()
            });
            UIUtils.toast('기준 사진이 등록되었습니다', 'success');
            ['stdNewCar','stdNewNote','stdNewFile'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const partSel = document.getElementById('stdNewPart');
            if (partSel) partSel.innerHTML = '<option value="">-- 차종 먼저 선택 --</option>';
            const thumb = document.getElementById('stdNewThumb');
            if (thumb) thumb.innerHTML =
                '<span class="material-symbols-outlined" style="color:var(--text-muted);">image</span>';
            document.getElementById('stdAddFormWrap').style.display = 'none';
            _renderStdList();
        } catch(e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function _renderStdList() {
        const wrap = document.getElementById('stdListWrap');
        if (!wrap) return;

        const car  = document.getElementById('stdFilterCar')?.value  || '';
        const part = document.getElementById('stdFilterPart')?.value || '';

        const items = (Storage.getAll(STD_STORE) || [])
            .filter(s => !car  || s.carModel === car)
            .filter(s => !part || s.partName === part);

        if (items.length === 0) {
            wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">등록된 기준 사진이 없습니다.</div>';
            return;
        }

        // 차종+품명으로 그룹핑
        const groups = {};
        items.forEach(s => {
            const key = `${s.carModel}||${s.partName}`;
            if (!groups[key]) groups[key] = { carModel: s.carModel, partName: s.partName, photos: [] };
            groups[key].photos.push(s);
        });

        wrap.innerHTML = Object.values(groups).map(g => `
            <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="background:var(--bg-tertiary);padding:8px 14px;font-size:0.85rem;font-weight:600;">
                    ${g.carModel} / ${g.partName}
                    <span style="color:var(--text-muted);font-weight:400;font-size:0.78rem;margin-left:8px;">(${g.photos.length}장)</span>
                </div>
                <div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px;">
                    ${g.photos.map(s => `
                    <div style="position:relative;text-align:center;">
                        <img src="${s.imageData}"
                            style="width:140px;height:105px;object-fit:cover;border-radius:6px;
                                   border:2px solid var(--border-color);cursor:pointer;"
                            onclick="InjectionIncomingModule._enlargePhoto('${s.imageData}','${PHOTO_TYPE_LABELS[s.photoType]||s.photoType}')">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${PHOTO_TYPE_LABELS[s.photoType]||s.photoType}${s.note ? ' · '+s.note : ''}</div>
                        <button class="btn btn-danger btn-sm"
                            style="position:absolute;top:2px;right:2px;padding:1px 5px;font-size:0.7rem;opacity:.8;"
                            onclick="InjectionIncomingModule._removeStd('${s.id}')">×</button>
                    </div>`).join('')}
                </div>
            </div>`).join('');
    }

    async function _removeStd(id) {
        if (!confirm('이 기준 사진을 삭제하시겠습니까?')) return;
        try {
            await Storage.remove(STD_STORE, id);
            UIUtils.toast('삭제되었습니다', 'success');
            _renderStdList();
        } catch(e) {
            UIUtils.toast('삭제 실패: ' + e.message, 'error');
        }
    }

    return {
        render,
        search,
        resetFilter,
        onFilterCarModelChange,
        openAddModal,
        onCarModelSelect,
        onPartNameSelect,
        onColorSelect,
        onCarModelSelectEdit,
        onPartNameSelectEdit,
        onColorSelectEdit,
        onIncomingQtyInput,
        addInjLotRow,
        selectInjCertLot,
        removeInjLotRow,
        calcInjLotTotal,
        calcInjLotTotalEdit,
        onAddVerdictChange,
        onEditVerdictChange,
        calcTotalAddFailQty,
        calcTotalEditFailQty,
        saveNew,
        view,
        edit,
        saveEdit,
        _finalizeSaveEdit,
        _cancelPendingEdit,
        remove,
        confirmDelete,
        _doDelete,
        _finalizeDeleteInspection,
        exportData,
        onLotInput,
        checkFifoWarning,
        saveFifoMeasure,
        markCertReceived,
        confirmCertReceived,
        /* 수입검사 표준 */
        openStdModal,
        _stdFilterPartUpdate,
        _stdNewCarChange,
        _stdPreviewNew,
        _openStdAddForm,
        _saveStd,
        _renderStdList,
        _removeStd,
        _refreshStdPreview,
        _enlargePhoto,
    };
})();
