/**
 * 사출 공정 - 작업일지 / 금형 교체 이력 / 원재료 변경 이력 / 월간 스케쥴
 */
var InjectionWorkLogModule = (function() {
    const STORE      = DB.STORES.INJECTION_WORK_LOG;
    const MOLD_STORE = DB.STORES.MOLD_CHANGE_LOG;
    const RAW_STORE  = DB.STORES.RAW_MAT_CHANGE_LOG;
    const MACHINES   = ['110-1호기', '110-2호기', '200-3호기'];

    let _activeTab  = 'worklog';
    let _schedYear  = new Date().getFullYear();
    let _schedMonth = new Date().getMonth() + 1;

    // =====================================================================
    // 진입점 (Router 호출)
    // =====================================================================
    function render(container) {
        try {
            const requestedTab = sessionStorage.getItem('injectionWorkTab');
            if (['worklog', 'mold', 'rawmat', 'schedule'].includes(requestedTab)) {
                _activeTab = requestedTab;
                sessionStorage.removeItem('injectionWorkTab');
            }
        } catch {}
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="iw-tab-bar">
                    <button id="iw-tab-worklog"  class="iw-tab-btn" onclick="InjectionWorkLogModule.switchTab('worklog')">
                        <span class="material-symbols-outlined">assignment</span> 작업일지
                    </button>
                    <button id="iw-tab-mold"     class="iw-tab-btn" onclick="InjectionWorkLogModule.switchTab('mold')">
                        <span class="material-symbols-outlined">construction</span> 금형 교체 이력
                    </button>
                    <button id="iw-tab-rawmat"   class="iw-tab-btn" onclick="InjectionWorkLogModule.switchTab('rawmat')">
                        <span class="material-symbols-outlined">inventory_2</span> 원재료 변경 이력
                    </button>
                    <button id="iw-tab-schedule" class="iw-tab-btn" onclick="InjectionWorkLogModule.switchTab('schedule')">
                        <span class="material-symbols-outlined">calendar_month</span> 월간 스케쥴
                    </button>
                </div>

                <div id="iw-tab-content"></div>
            </div>
        `;
        switchTab(_activeTab);
    }

    function switchTab(tab) {
        _activeTab = tab;
        document.querySelectorAll('.iw-tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('iw-tab-' + tab);
        if (btn) btn.classList.add('active');
        _renderTabContent();
    }

    function _renderTabContent() {
        const el = document.getElementById('iw-tab-content');
        if (!el) return;
        if      (_activeTab === 'worklog')  _renderWorklog(el);
        else if (_activeTab === 'mold')     _renderMold(el);
        else if (_activeTab === 'rawmat')   _renderRawMat(el);
        else if (_activeTab === 'schedule') _renderSchedule(el);
    }

    // =====================================================================
    // 탭 1 — 작업일지 (기존 기능 유지)
    // =====================================================================
    function _renderWorklog(container) {
        container.innerHTML = `
            <div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;">
                    <button class="btn btn-primary" onclick="InjectionWorkLogModule.openAddModal()">
                        <span class="material-symbols-outlined">add</span> 작업 등록
                    </button>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="iwFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="iwFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">사출기</label>
                        <select class="form-select" id="iwFilterMachine" style="min-width:130px;">
                            <option value="">전체</option>
                            ${MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="iwFilterCarModel" style="min-width:130px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="InjectionWorkLogModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="iwStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>No</th><th>일자</th><th>사출기</th><th>작업시간</th>
                                        <th>차종</th><th>제품명</th><th>컬러</th>
                                        <th>초기쇼트</th><th>생산수량</th><th>양품</th>
                                        <th>불량</th><th>불량률</th><th>비고</th><th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="iwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const allData = Storage.getAll(STORE) || [];
        const carModels = UIUtils.sortCarModels(allData.map(d => d.carModel));
        const carSelect = document.getElementById('iwFilterCarModel');
        if (carSelect) {
            carSelect.innerHTML = '<option value="">전체</option>' +
                carModels.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        search();
    }

    function search() {
        const start    = (document.getElementById('iwFilterStart')    || {}).value || '';
        const end      = (document.getElementById('iwFilterEnd')      || {}).value || '';
        const machine  = (document.getElementById('iwFilterMachine')  || {}).value || '';
        const carModel = (document.getElementById('iwFilterCarModel') || {}).value || '';

        let data = Storage.getByDateRange(STORE, start, end);
        if (machine)  data = data.filter(d => d.machine  === machine);
        if (carModel) data = data.filter(d => d.carModel === carModel);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''));

        _renderStats(data);
        _renderTable(data);
    }

    function _renderStats(data) {
        const totalProduction = data.reduce((s, d) => s + (Number(d.productionQty) || 0), 0);
        const totalGood       = data.reduce((s, d) => s + (Number(d.goodQty)       || 0), 0);
        const totalFail       = data.reduce((s, d) => s + (Number(d.failQty)       || 0), 0);
        const avgFailRate     = totalProduction > 0 ? (totalFail / totalProduction * 100).toFixed(1) : '0.0';

        const el = document.getElementById('iwStats');
        if (!el) return;
        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalProduction)}</div>
                <div class="stat-card-label">총 생산수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(totalGood)}</div>
                <div class="stat-card-label">총 양품수량</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${UIUtils.formatNumber(totalFail)}</div>
                <div class="stat-card-label">총 불량수량</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${avgFailRate}%</div>
                <div class="stat-card-label">평균 불량률</div>
            </div>
        `;
    }

    function _renderTable(data) {
        const tbody = document.getElementById('iwTableBody');
        if (!tbody) return;
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">작업 기록이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((d, index) => {
            const failRate  = (Number(d.failRate) || 0).toFixed(1);
            const rateColor = failRate > 5 ? 'var(--accent-red)' : (failRate > 0 ? 'var(--accent-blue)' : 'var(--text-muted)');
            return `
                <tr>
                    <td>${data.length - index}</td>
                    <td>${d.date}</td>
                    <td><span class="badge badge-info">${d.machine}</span></td>
                    <td style="font-size:0.82rem;">
                        ${d.startTime} ~ ${d.endTime}<br>
                        <span style="color:var(--accent-blue);font-weight:600;">(${d.workTime} min)</span>
                    </td>
                    <td>${d.carModel}</td>
                    <td><strong>${d.partName}</strong></td>
                    <td>${d.color}</td>
                    <td style="text-align:right;color:var(--text-muted);">${d.initShot ? UIUtils.formatNumber(d.initShot) : '-'}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.productionQty)}</td>
                    <td style="text-align:right;color:var(--accent-green);">${UIUtils.formatNumber(d.goodQty)}</td>
                    <td style="text-align:right;color:var(--accent-red);">${UIUtils.formatNumber(d.failQty)}</td>
                    <td style="text-align:center;font-weight:700;color:${rateColor};">${failRate}%</td>
                    <td>
                        <div style="font-size:0.75rem;color:var(--accent-red);">
                            ${Object.entries(d.defectDetails || {}).map(([k, v]) => `${k}(${v})`).join(', ')}
                        </div>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${d.note || '-'}</span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionWorkLogModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger"  onclick="InjectionWorkLogModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /* ── 폼 공통 빌더 ── */
    function buildFormHTML(d = {}) {
        const materials         = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const internalMaterials = materials.filter(m => m.supplier === '사내');
        const carModels         = UIUtils.sortCarModels(internalMaterials.map(m => m.carModel), internalMaterials);

        let carOptions = `<option value="">-- 차종 선택 --</option>`;
        carModels.forEach(c => {
            carOptions += `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`;
        });

        const currentCar  = d.carModel  || '';
        const currentPart = d.partName  || '';

        let partOptions = `<option value="">-- 품명 선택 --</option>`;
        if (currentCar) {
            [...new Set(internalMaterials.filter(m => m.carModel === currentCar).map(m => m.injPartName).filter(Boolean))].sort()
                .forEach(p => { partOptions += `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`; });
        }

        let colorOptions = `<option value="">-- 컬러 선택 --</option>`;
        if (currentCar && currentPart) {
            [...new Set(internalMaterials.filter(m => m.carModel === currentCar && m.injPartName === currentPart).map(m => m.injColor).filter(Boolean))].sort()
                .forEach(c => { colorOptions += `<option value="${c}" ${d.color === c ? 'selected' : ''}>${c}</option>`; });
        }

        const selInjMat = internalMaterials.find(m => m.carModel === currentCar && m.injPartName === currentPart);
        const autoCVT   = (d.cvt !== undefined && d.cvt !== '') ? d.cvt : (selInjMat ? (selInjMat.cavityCount || '') : '');

        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">작업일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="iwDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">사출기 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwMachine">
                        <option value="">-- 사출기 선택 --</option>
                        ${MACHINES.map(m => `<option value="${m}" ${d.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">시작 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="iwStartTime" value="${d.startTime || ''}" onchange="InjectionWorkLogModule.calcWorkTime()">
                </div>
                <div class="form-group">
                    <label class="form-label">완료 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="iwEndTime" value="${d.endTime || ''}" onchange="InjectionWorkLogModule.calcWorkTime()">
                </div>
                <div class="form-group">
                    <label class="form-label">작업시간(min)</label>
                    <input type="number" class="form-input" id="iwWorkTime" value="${d.workTime || ''}" readonly
                        style="background:var(--bg-secondary);font-weight:700;color:var(--accent-blue);">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwCarModel" onchange="InjectionWorkLogModule.onCarModelChange()">${carOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwPartName" onchange="InjectionWorkLogModule.onPartChange()">${partOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwColor" onchange="InjectionWorkLogModule.onColorChange()">${colorOptions}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">C/T <span style="font-size:0.75rem;color:var(--text-muted);">(초/shot)</span></label>
                    <input type="number" class="form-input" id="iwCycleTime" value="${d.cycleTime || ''}" min="0" step="0.1" placeholder="0.0" style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">CVT / 취수 <span style="font-size:0.75rem;color:var(--text-muted);">(자동)</span></label>
                    <input type="number" class="form-input" id="iwCVT" value="${autoCVT}" readonly
                        style="background:var(--bg-secondary);color:var(--accent-blue);font-weight:700;text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">초기 쇼트 수량</label>
                    <input type="number" class="form-input" id="iwInitShot" value="${d.initShot || ''}" min="0" placeholder="0" style="text-align:right;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">투입원재료</label>
                    <input type="text" class="form-input" id="iwRawMaterial" placeholder="자동 입력" value="${d.rawMaterial || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">원재료 컬러</label>
                    <input type="text" class="form-input" id="iwRawColor" placeholder="자동 입력" value="${d.rawColor || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">원재료 LOT</label>
                    <input type="text" class="form-input" id="iwRawLot" placeholder="원재료 LOT 번호" value="${d.rawLot || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">생산수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="iwProductionQty" value="${d.productionQty || ''}"
                        oninput="InjectionWorkLogModule.calcResults()" style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">양품 수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="iwGoodQty" value="${d.goodQty || ''}"
                        oninput="InjectionWorkLogModule.calcResults()" style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">불량 수량 <span style="font-size:0.75rem;color:var(--text-muted);">(자동)</span></label>
                    <input type="number" class="form-input" id="iwFailQty" value="${d.failQty || ''}" readonly
                        style="background:var(--bg-secondary);color:var(--accent-red);font-weight:700;text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">불량률(%)</label>
                    <input type="text" class="form-input" id="iwFailRate" value="${d.failRate || ''}" readonly
                        style="background:var(--bg-secondary);font-weight:700;color:var(--accent-red);text-align:right;">
                </div>
            </div>
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span> 사출 불량 상세
            </div>
            <div id="iwDefectBreakdown" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;"></div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="iwNote" placeholder="특이사항 입력" style="height:60px;">${d.note || ''}</textarea>
            </div>
        `;
    }

    function setupDefects(details = {}) {
        setTimeout(() => {
            const defects   = (Storage.getAll(DB.STORES.DEFECT_TYPES) || []).filter(df => df && (df.type === 'injection' || !df.type));
            const container = document.getElementById('iwDefectBreakdown');
            if (!container) return;
            if (defects.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">사출 불량 유형이 없습니다.</div>';
            } else {
                container.innerHTML = defects.map(df => `
                    <div style="background:var(--bg-secondary);padding:6px 10px;border-radius:6px;border:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;">
                        <label style="font-size:0.75rem;color:var(--text-secondary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${df.name}">${df.name}</label>
                        <input type="number" class="form-input iw-defect-input" data-defect-name="${df.name}" min="0" placeholder="0"
                            value="${details[df.name] || ''}" style="padding:4px 6px;width:60px;font-size:0.85rem;"
                            oninput="InjectionWorkLogModule.calcFailFromDefects()">
                    </div>
                `).join('');
            }
        }, 100);
    }

    function calcWorkTime() {
        const start  = (document.getElementById('iwStartTime') || {}).value || '';
        const end    = (document.getElementById('iwEndTime')   || {}).value || '';
        const target =  document.getElementById('iwWorkTime');
        if (!start || !end || !target) return;
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff < 0) diff += 1440;
        target.value = diff;
    }

    function _sumDefects() {
        let total = 0;
        document.querySelectorAll('.iw-defect-input').forEach(inp => { total += Number(inp.value) || 0; });
        return total;
    }

    function calcResults() {
        const prod    = Number((document.getElementById('iwProductionQty') || {}).value) || 0;
        const failEl  = document.getElementById('iwFailQty');
        const rateEl  = document.getElementById('iwFailRate');
        const goodEl  = document.getElementById('iwGoodQty');
        const fail    = _sumDefects();
        if (failEl) failEl.value = fail;
        if (goodEl) goodEl.value = Math.max(0, prod - fail);
        if (rateEl) rateEl.value = prod > 0 ? (fail / prod * 100).toFixed(1) : '0.0';
    }

    function calcFailFromDefects() { calcResults(); }

    function _clearRawMatFields() {
        ['iwRawMaterial', 'iwRawColor', 'iwCVT'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    function _autoFillCVT(car, part) {
        const cvtEl = document.getElementById('iwCVT');
        if (!cvtEl) return;
        const injMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const mat = injMats.find(m => m.supplier === '사내' && m.carModel === car && m.injPartName === part);
        cvtEl.value = (mat && mat.cavityCount) ? mat.cavityCount : '';
    }

    function onCarModelChange() {
        const car       = (document.getElementById('iwCarModel') || {}).value || '';
        const partSel   =  document.getElementById('iwPartName');
        const colorSel  =  document.getElementById('iwColor');
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const internalMats = materials.filter(m => m.supplier === '사내');

        if (partSel)  partSel.innerHTML  = '<option value="">-- 품명 선택 --</option>';
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        _clearRawMatFields();
        if (!car) return;

        const parts = [...new Set(internalMats.filter(m => m.carModel === car).map(m => m.injPartName).filter(Boolean))].sort();
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function onPartChange() {
        const car      = (document.getElementById('iwCarModel') || {}).value || '';
        const part     = (document.getElementById('iwPartName') || {}).value || '';
        const colorSel =  document.getElementById('iwColor');
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const internalMats = materials.filter(m => m.supplier === '사내');

        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        _clearRawMatFields();
        if (!car || !part) return;

        const colors = [...new Set(internalMats.filter(m => m.carModel === car && m.injPartName === part).map(m => m.injColor).filter(Boolean))].sort();
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');

        _autoFillCVT(car, part);
        if (colors.length === 1) {
            colorSel.value = colors[0];
            _autoFillRawMaterial(car, part, colors[0]);
        }
    }

    function _autoFillRawMaterial(car, part, color) {
        const rawMatEl   = document.getElementById('iwRawMaterial');
        const rawColorEl = document.getElementById('iwRawColor');
        const injMats    = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const rawMats    = Storage.getAll(DB.STORES.RAW_MATERIALS)       || [];

        const injMat = injMats.find(function(m) {
            const colorOk = !color || !m.injColor ||
                m.injColor.toLowerCase().split(/[,，\/]/).map(s => s.trim())
                    .some(c => c && (color.toLowerCase().includes(c) || c.includes(color.toLowerCase())));
            return m.carModel === car && m.injPartName === part && colorOk;
        });
        if (!injMat) return;

        let matName = '', matColor = '';
        if (injMat.rawMatId) {
            const rm = rawMats.find(r => r.id === injMat.rawMatId);
            if (rm) { matName = rm.matName; matColor = rm.color; }
        }
        if (!matName && injMat.rawMatName) { matName = injMat.rawMatName; matColor = matColor || injMat.rawMatColor; }
        if (!matName) {
            const rm = rawMats.find(r => {
                const partOk = r.usedFor && r.usedFor.split(/[,，]/).map(s => s.trim()).includes(part);
                const colOk  = !color || !r.color ||
                    r.color.toLowerCase().split(/[,，\/]/).map(s => s.trim())
                        .some(c => c && (color.toLowerCase().includes(c) || c.includes(color.toLowerCase())));
                return partOk && colOk;
            }) || rawMats.find(r => r.usedFor && r.usedFor.split(/[,，]/).map(s => s.trim()).includes(part));
            if (rm) { matName = rm.matName; matColor = rm.color; }
        }
        if (matName  && rawMatEl)   rawMatEl.value   = matName;
        if (matColor && rawColorEl) rawColorEl.value = matColor;
    }

    function onColorChange() {
        const car   = (document.getElementById('iwCarModel') || {}).value || '';
        const part  = (document.getElementById('iwPartName') || {}).value || '';
        const color = (document.getElementById('iwColor')    || {}).value || '';
        _autoFillRawMaterial(car, part, color);
    }

    function _collectData() {
        const defectDetails = {};
        document.querySelectorAll('.iw-defect-input').forEach(inp => {
            const val = Number(inp.value) || 0;
            if (val > 0) defectDetails[inp.dataset.defectName] = val;
        });
        return {
            date:          (document.getElementById('iwDate')          || {}).value  || '',
            machine:       (document.getElementById('iwMachine')       || {}).value  || '',
            startTime:     (document.getElementById('iwStartTime')     || {}).value  || '',
            endTime:       (document.getElementById('iwEndTime')       || {}).value  || '',
            workTime:      Number((document.getElementById('iwWorkTime')      || {}).value) || 0,
            carModel:      (document.getElementById('iwCarModel')      || {}).value  || '',
            partName:      (document.getElementById('iwPartName')      || {}).value  || '',
            color:         (document.getElementById('iwColor')         || {}).value  || '',
            cycleTime:     Number((document.getElementById('iwCycleTime')     || {}).value) || 0,
            cvt:           Number((document.getElementById('iwCVT')           || {}).value) || 0,
            rawMaterial:   ((document.getElementById('iwRawMaterial')  || {}).value  || '').trim(),
            rawColor:      ((document.getElementById('iwRawColor')     || {}).value  || '').trim(),
            rawLot:        ((document.getElementById('iwRawLot')       || {}).value  || '').trim(),
            initShot:      Number((document.getElementById('iwInitShot')      || {}).value) || 0,
            productionQty: Number((document.getElementById('iwProductionQty') || {}).value) || 0,
            goodQty:       Number((document.getElementById('iwGoodQty')       || {}).value) || 0,
            failQty:       Number((document.getElementById('iwFailQty')       || {}).value) || 0,
            failRate:      Number((document.getElementById('iwFailRate')       || {}).value) || 0,
            defectDetails,
            note:          ((document.getElementById('iwNote')         || {}).value  || '').trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('사출 작업 등록', buildFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveNew()">등록</button>
        `, 'lg');
        setupDefects();
    }

    async function saveNew() {
        const data = _collectData();
        if (!data.date || !data.machine || !data.carModel || !data.partName) {
            UIUtils.toast('필수 항목을 모두 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('사출 작업 기록이 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        UIUtils.showModal('사출 작업 수정', buildFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveEdit('${id}')">저장</button>
        `, 'lg');
        setupDefects(d.defectDetails || {});
    }

    async function saveEdit(id) {
        const data = _collectData();
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('해당 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = ['일자','사출기','시작시간','완료시간','작업시간(min)','차종','제품명','컬러','투입원재료','원재료LOT','생산수량','양품','불량','불량률(%)','비고'];
        const rows = data.map(d => [d.date,d.machine,d.startTime,d.endTime,d.workTime,d.carModel,d.partName,d.color,d.rawMaterial,d.rawLot,d.productionQty,d.goodQty,d.failQty,d.failRate,d.note]);
        Storage.exportToCSV(headers, rows, '사출_작업일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // =====================================================================
    // 탭 2 — 금형 교체 이력
    // =====================================================================
    function _renderMold(container) {
        container.innerHTML = `
            <div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;">
                    <button class="btn btn-primary" onclick="InjectionWorkLogModule.openMoldAddModal()">
                        <span class="material-symbols-outlined">add</span> 교체 등록
                    </button>
                </div>
                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="moldFStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="moldFEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">사출기</label>
                        <select class="form-select" id="moldFMachine" style="min-width:130px;">
                            <option value="">전체</option>
                            ${MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="InjectionWorkLogModule.searchMold()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div id="moldAlerts"></div>
                <div class="stat-cards" id="moldStats"></div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>교체일자</th><th>사출기</th><th>차종</th><th>제품명</th>
                                        <th>구 금형번호</th><th>신 금형번호</th><th>교체사유</th>
                                        <th>누적쇼트</th><th>차기교체예정일</th><th>예정쇼트</th>
                                        <th>작업자</th><th>비고</th><th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="moldTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        searchMold();
    }

    function searchMold() {
        const start   = (document.getElementById('moldFStart')   || {}).value || '';
        const end     = (document.getElementById('moldFEnd')     || {}).value || '';
        const machine = (document.getElementById('moldFMachine') || {}).value || '';

        let data = Storage.getAll(MOLD_STORE) || [];
        if (start && end) data = data.filter(d => d.date >= start && d.date <= end);
        if (machine)      data = data.filter(d => d.machine === machine);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        _renderMoldAlerts();
        _renderMoldStats(data);
        _renderMoldTable(data);
    }

    function _renderMoldAlerts() {
        const el = document.getElementById('moldAlerts');
        if (!el) return;
        const today    = UIUtils.today();
        const upcoming = (Storage.getAll(MOLD_STORE) || [])
            .filter(d => d.plannedDate && d.plannedDate >= today)
            .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
            .slice(0, 5);
        if (!upcoming.length) { el.innerHTML = ''; return; }

        el.innerHTML = `
            <div style="background:rgba(59,130,246,0.06);border:1px solid var(--accent-blue);border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <div style="font-weight:600;color:var(--accent-blue);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">schedule</span> 금형 교체 예정 알림
                </div>
                ${upcoming.map(d => {
                    const dl = Math.ceil((new Date(d.plannedDate) - new Date(today)) / 86400000);
                    return `<div style="font-size:0.85rem;margin-bottom:4px;display:flex;gap:10px;align-items:center;">
                        <span style="color:var(--text-muted);">${d.plannedDate}</span>
                        <span style="color:var(--text-muted);">|</span>
                        <span>${d.machine || '-'}</span>
                        <span style="color:var(--text-muted);">|</span>
                        <strong>${d.partName || '-'}</strong>
                        <span style="color:var(--text-muted);">|</span>
                        <span style="${dl <= 7 ? 'color:var(--accent-red);font-weight:700;' : 'color:var(--accent-blue);'}">D-${dl}</span>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    function _renderMoldStats(data) {
        const el = document.getElementById('moldStats');
        if (!el) return;
        const today = UIUtils.today();
        const plan30 = (Storage.getAll(MOLD_STORE) || []).filter(d => d.plannedDate && d.plannedDate >= today && d.plannedDate <= _addDays(today, 30)).length;
        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">교체 건수</div>
            </div>
            <div class="stat-card" style="background:rgba(249,115,22,0.08);border-left:4px solid var(--accent-orange);">
                <div class="stat-card-value" style="color:var(--accent-orange);">${plan30}</div>
                <div class="stat-card-label">30일 내 교체 예정</div>
            </div>
        `;
    }

    function _renderMoldTable(data) {
        const tbody = document.getElementById('moldTableBody');
        if (!tbody) return;
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-muted);">금형 교체 이력이 없습니다.</td></tr>`;
            return;
        }
        const today = UIUtils.today();
        tbody.innerHTML = data.map(d => {
            const dl  = d.plannedDate ? Math.ceil((new Date(d.plannedDate) - new Date(today)) / 86400000) : null;
            const dls = dl !== null ? (dl <= 7 ? 'color:var(--accent-red);font-weight:700;' : 'color:var(--text-secondary);') : '';
            return `
                <tr>
                    <td>${d.date}</td>
                    <td><span class="badge badge-info">${d.machine || '-'}</span></td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td style="font-family:monospace;color:var(--text-muted);">${d.oldMoldNo || '-'}</td>
                    <td style="font-family:monospace;color:var(--accent-blue);font-weight:600;">${d.newMoldNo || '-'}</td>
                    <td><span class="badge badge-warning">${d.reason || '-'}</span></td>
                    <td style="text-align:right;">${d.shotCount ? UIUtils.formatNumber(d.shotCount) : '-'}</td>
                    <td style="${dls}">${d.plannedDate || '-'}${dl !== null ? ` <small>(D-${dl})</small>` : ''}</td>
                    <td style="text-align:right;">${d.plannedShot ? UIUtils.formatNumber(d.plannedShot) : '-'}</td>
                    <td>${d.worker || '-'}</td>
                    <td style="font-size:0.82rem;color:var(--text-muted);">${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionWorkLogModule.editMold('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger"  onclick="InjectionWorkLogModule.removeMold('${d.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function _moldFormHTML(d = {}) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const carModels = UIUtils.sortCarModels(materials.map(m => m.carModel), materials);
        const parts     = d.carModel ? [...new Set(materials.filter(m => m.carModel === d.carModel).map(m => m.injPartName).filter(Boolean))].sort() : [];
        const REASONS   = ['정기교체', '손상/마모', '신규도입', '품질불량', '설계변경', '기타'];
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">교체일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="moldDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">사출기 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="moldMachine">
                        <option value="">-- 선택 --</option>
                        ${MACHINES.map(m => `<option value="${m}" ${d.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="moldCarModel" onchange="InjectionWorkLogModule.onMoldCarModelChange()">
                        <option value="">-- 선택 --</option>
                        ${carModels.map(c => `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품명</label>
                    <select class="form-select" id="moldPartName">
                        <option value="">-- 선택 --</option>
                        ${parts.map(p => `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구 금형번호</label>
                    <input type="text" class="form-input" id="moldOldNo" placeholder="예) M-2024-001" value="${d.oldMoldNo || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">신 금형번호 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="moldNewNo" placeholder="예) M-2025-001" value="${d.newMoldNo || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">교체사유 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="moldReason">
                        <option value="">-- 선택 --</option>
                        ${REASONS.map(r => `<option value="${r}" ${d.reason === r ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">교체 시 누적쇼트</label>
                    <input type="number" class="form-input" id="moldShotCount" min="0" placeholder="0" value="${d.shotCount || ''}" style="text-align:right;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차기 교체 예정일</label>
                    <input type="date" class="form-input" id="moldPlannedDate" value="${d.plannedDate || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">차기 예정쇼트</label>
                    <input type="number" class="form-input" id="moldPlannedShot" min="0" placeholder="0" value="${d.plannedShot || ''}" style="text-align:right;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">작업자</label>
                    <input type="text" class="form-input" id="moldWorker" placeholder="작업자명" value="${d.worker || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="moldNote" placeholder="특이사항" value="${d.note || ''}">
                </div>
            </div>
        `;
    }

    function openMoldAddModal() {
        UIUtils.showModal('금형 교체 등록', _moldFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveMoldNew()">등록</button>
        `);
    }

    function onMoldCarModelChange() {
        const car  = (document.getElementById('moldCarModel') || {}).value || '';
        const pSel =  document.getElementById('moldPartName');
        if (!pSel) return;
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const parts = [...new Set(materials.filter(m => m.carModel === car).map(m => m.injPartName).filter(Boolean))].sort();
        pSel.innerHTML = '<option value="">-- 선택 --</option>' + parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function _collectMoldData() {
        return {
            date:         (document.getElementById('moldDate')        || {}).value || '',
            machine:      (document.getElementById('moldMachine')     || {}).value || '',
            carModel:     (document.getElementById('moldCarModel')    || {}).value || '',
            partName:     (document.getElementById('moldPartName')    || {}).value || '',
            oldMoldNo:   ((document.getElementById('moldOldNo')       || {}).value || '').trim(),
            newMoldNo:   ((document.getElementById('moldNewNo')       || {}).value || '').trim(),
            reason:       (document.getElementById('moldReason')      || {}).value || '',
            shotCount:   Number((document.getElementById('moldShotCount')    || {}).value) || 0,
            plannedDate:  (document.getElementById('moldPlannedDate') || {}).value || '',
            plannedShot: Number((document.getElementById('moldPlannedShot')  || {}).value) || 0,
            worker:      ((document.getElementById('moldWorker')      || {}).value || '').trim(),
            note:        ((document.getElementById('moldNote')        || {}).value || '').trim()
        };
    }

    async function saveMoldNew() {
        const data = _collectMoldData();
        if (!data.date || !data.machine || !data.newMoldNo || !data.reason) {
            UIUtils.toast('필수 항목(일자, 사출기, 신 금형번호, 교체사유)을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(MOLD_STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('금형 교체 이력이 등록되었습니다.', 'success');
        _renderMold(document.getElementById('iw-tab-content'));
    }

    function editMold(id) {
        const d = Storage.getById(MOLD_STORE, id);
        if (!d) return;
        UIUtils.showModal('금형 교체 수정', _moldFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveMoldEdit('${id}')">저장</button>
        `);
    }

    async function saveMoldEdit(id) {
        const data = _collectMoldData();
        await Storage.update(MOLD_STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        _renderMold(document.getElementById('iw-tab-content'));
    }

    function removeMold(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(MOLD_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderMold(document.getElementById('iw-tab-content'));
        });
    }

    // =====================================================================
    // 탭 3 — 원재료 변경 이력
    // =====================================================================
    function _renderRawMat(container) {
        container.innerHTML = `
            <div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;">
                    <button class="btn btn-primary" onclick="InjectionWorkLogModule.openRawMatAddModal()">
                        <span class="material-symbols-outlined">add</span> 변경 등록
                    </button>
                </div>
                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="rawFStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="rawFEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">사출기</label>
                        <select class="form-select" id="rawFMachine" style="min-width:130px;">
                            <option value="">전체</option>
                            ${MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="InjectionWorkLogModule.searchRawMat()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div id="rawMatAlerts"></div>
                <div class="stat-cards" id="rawMatStats"></div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>변경일자</th><th>사출기</th><th>차종</th><th>제품명</th>
                                        <th>기존 원재료</th><th>변경 원재료</th>
                                        <th>기존 LOT</th><th>변경 LOT</th>
                                        <th>변경사유</th><th>예정일</th>
                                        <th>작업자</th><th>승인자</th><th>비고</th><th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="rawMatTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        searchRawMat();
    }

    function searchRawMat() {
        const start   = (document.getElementById('rawFStart')   || {}).value || '';
        const end     = (document.getElementById('rawFEnd')     || {}).value || '';
        const machine = (document.getElementById('rawFMachine') || {}).value || '';

        let data = Storage.getAll(RAW_STORE) || [];
        if (start && end) data = data.filter(d => d.date >= start && d.date <= end);
        if (machine)      data = data.filter(d => d.machine === machine);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        _renderRawMatAlerts();
        _renderRawMatStats(data);
        _renderRawMatTable(data);
    }

    function _renderRawMatAlerts() {
        const el = document.getElementById('rawMatAlerts');
        if (!el) return;
        const today    = UIUtils.today();
        const upcoming = (Storage.getAll(RAW_STORE) || [])
            .filter(d => d.plannedDate && d.plannedDate >= today)
            .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
            .slice(0, 5);
        if (!upcoming.length) { el.innerHTML = ''; return; }

        el.innerHTML = `
            <div style="background:rgba(249,115,22,0.06);border:1px solid var(--accent-orange);border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <div style="font-weight:600;color:var(--accent-orange);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">schedule</span> 원재료 변경 예정 알림
                </div>
                ${upcoming.map(d => {
                    const dl = Math.ceil((new Date(d.plannedDate) - new Date(today)) / 86400000);
                    return `<div style="font-size:0.85rem;margin-bottom:4px;display:flex;gap:10px;align-items:center;">
                        <span style="color:var(--text-muted);">${d.plannedDate}</span>
                        <span style="color:var(--text-muted);">|</span>
                        <span>${d.machine || '-'}</span>
                        <span style="color:var(--text-muted);">|</span>
                        <strong>${d.partName || '-'}</strong>
                        <span style="color:var(--text-muted);">|</span>
                        <span style="color:var(--accent-blue);font-size:0.8rem;">${d.newMaterial || '-'}</span>
                        <span style="color:var(--text-muted);">|</span>
                        <span style="${dl <= 7 ? 'color:var(--accent-red);font-weight:700;' : 'color:var(--accent-orange);'}">D-${dl}</span>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    function _renderRawMatStats(data) {
        const el = document.getElementById('rawMatStats');
        if (!el) return;
        const today  = UIUtils.today();
        const plan30 = (Storage.getAll(RAW_STORE) || []).filter(d => d.plannedDate && d.plannedDate >= today && d.plannedDate <= _addDays(today, 30)).length;
        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">변경 건수</div>
            </div>
            <div class="stat-card" style="background:rgba(249,115,22,0.08);border-left:4px solid var(--accent-orange);">
                <div class="stat-card-value" style="color:var(--accent-orange);">${plan30}</div>
                <div class="stat-card-label">30일 내 변경 예정</div>
            </div>
        `;
    }

    function _renderRawMatTable(data) {
        const tbody = document.getElementById('rawMatTableBody');
        if (!tbody) return;
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">원재료 변경 이력이 없습니다.</td></tr>`;
            return;
        }
        const today = UIUtils.today();
        tbody.innerHTML = data.map(d => {
            const dl  = d.plannedDate ? Math.ceil((new Date(d.plannedDate) - new Date(today)) / 86400000) : null;
            const dls = dl !== null ? (dl <= 7 ? 'color:var(--accent-red);font-weight:700;' : 'color:var(--text-secondary);') : '';
            return `
                <tr>
                    <td>${d.date}</td>
                    <td><span class="badge badge-info">${d.machine || '-'}</span></td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td style="color:var(--text-muted);">${d.oldMaterial || '-'}</td>
                    <td style="font-weight:600;color:var(--accent-blue);">${d.newMaterial || '-'}</td>
                    <td style="font-family:monospace;font-size:0.82rem;color:var(--text-muted);">${d.oldLot || '-'}</td>
                    <td style="font-family:monospace;font-size:0.82rem;color:var(--accent-blue);">${d.newLot || '-'}</td>
                    <td>${d.reason || '-'}</td>
                    <td style="${dls}">${d.plannedDate || '-'}${dl !== null ? ` <small>(D-${dl})</small>` : ''}</td>
                    <td>${d.worker || '-'}</td>
                    <td>${d.approver || '-'}</td>
                    <td style="font-size:0.82rem;color:var(--text-muted);">${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionWorkLogModule.editRawMat('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger"  onclick="InjectionWorkLogModule.removeRawMat('${d.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function _rawMatFormHTML(d = {}) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const carModels = UIUtils.sortCarModels(materials.map(m => m.carModel), materials);
        const parts     = d.carModel ? [...new Set(materials.filter(m => m.carModel === d.carModel).map(m => m.injPartName).filter(Boolean))].sort() : [];
        const REASONS   = ['공급사 변경', '품질 개선', '원가 절감', '재고 소진', '설계 변경', '긴급 대체', '기타'];
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">변경일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="rawDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">사출기 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="rawMachine">
                        <option value="">-- 선택 --</option>
                        ${MACHINES.map(m => `<option value="${m}" ${d.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="rawCarModel" onchange="InjectionWorkLogModule.onRawCarModelChange()">
                        <option value="">-- 선택 --</option>
                        ${carModels.map(c => `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품명</label>
                    <select class="form-select" id="rawPartName">
                        <option value="">-- 선택 --</option>
                        ${parts.map(p => `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="font-weight:600;color:var(--text-secondary);margin:14px 0 10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">기존 원재료</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">기존 원재료명</label>
                    <input type="text" class="form-input" id="rawOldMaterial" placeholder="기존 원재료명" value="${d.oldMaterial || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">기존 LOT</label>
                    <input type="text" class="form-input" id="rawOldLot" placeholder="기존 LOT번호" value="${d.oldLot || ''}">
                </div>
            </div>
            <div style="font-weight:600;color:var(--accent-blue);margin:14px 0 10px;padding-bottom:6px;border-bottom:1.5px solid var(--accent-blue);">변경 원재료</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">변경 원재료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="rawNewMaterial" placeholder="변경할 원재료명" value="${d.newMaterial || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">변경 LOT</label>
                    <input type="text" class="form-input" id="rawNewLot" placeholder="변경 LOT번호" value="${d.newLot || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">변경사유 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="rawReason">
                        <option value="">-- 선택 --</option>
                        ${REASONS.map(r => `<option value="${r}" ${d.reason === r ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">변경 예정일 (계획)</label>
                    <input type="date" class="form-input" id="rawPlannedDate" value="${d.plannedDate || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">작업자</label>
                    <input type="text" class="form-input" id="rawWorker" placeholder="작업자명" value="${d.worker || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">승인자</label>
                    <input type="text" class="form-input" id="rawApprover" placeholder="승인자명" value="${d.approver || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="rawNote" placeholder="특이사항" style="height:50px;">${d.note || ''}</textarea>
            </div>
        `;
    }

    function openRawMatAddModal() {
        UIUtils.showModal('원재료 변경 등록', _rawMatFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveRawMatNew()">등록</button>
        `);
    }

    function onRawCarModelChange() {
        const car  = (document.getElementById('rawCarModel') || {}).value || '';
        const pSel =  document.getElementById('rawPartName');
        if (!pSel) return;
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const parts = [...new Set(materials.filter(m => m.carModel === car).map(m => m.injPartName).filter(Boolean))].sort();
        pSel.innerHTML = '<option value="">-- 선택 --</option>' + parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function _collectRawMatData() {
        return {
            date:        (document.getElementById('rawDate')        || {}).value || '',
            machine:     (document.getElementById('rawMachine')     || {}).value || '',
            carModel:    (document.getElementById('rawCarModel')    || {}).value || '',
            partName:    (document.getElementById('rawPartName')    || {}).value || '',
            oldMaterial:((document.getElementById('rawOldMaterial') || {}).value || '').trim(),
            newMaterial:((document.getElementById('rawNewMaterial') || {}).value || '').trim(),
            oldLot:     ((document.getElementById('rawOldLot')      || {}).value || '').trim(),
            newLot:     ((document.getElementById('rawNewLot')      || {}).value || '').trim(),
            reason:      (document.getElementById('rawReason')      || {}).value || '',
            plannedDate: (document.getElementById('rawPlannedDate') || {}).value || '',
            worker:     ((document.getElementById('rawWorker')      || {}).value || '').trim(),
            approver:   ((document.getElementById('rawApprover')    || {}).value || '').trim(),
            note:       ((document.getElementById('rawNote')        || {}).value || '').trim()
        };
    }

    async function saveRawMatNew() {
        const data = _collectRawMatData();
        if (!data.date || !data.machine || !data.newMaterial || !data.reason) {
            UIUtils.toast('필수 항목(일자, 사출기, 변경원재료명, 변경사유)을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(RAW_STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('원재료 변경 이력이 등록되었습니다.', 'success');
        _renderRawMat(document.getElementById('iw-tab-content'));
    }

    function editRawMat(id) {
        const d = Storage.getById(RAW_STORE, id);
        if (!d) return;
        UIUtils.showModal('원재료 변경 수정', _rawMatFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="InjectionWorkLogModule.saveRawMatEdit('${id}')">저장</button>
        `);
    }

    async function saveRawMatEdit(id) {
        const data = _collectRawMatData();
        await Storage.update(RAW_STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        _renderRawMat(document.getElementById('iw-tab-content'));
    }

    function removeRawMat(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(RAW_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderRawMat(document.getElementById('iw-tab-content'));
        });
    }

    // =====================================================================
    // 탭 4 — 월간 스케쥴
    // =====================================================================
    function _renderSchedule(container) {
        container.innerHTML = `
            <div>
                <!-- 네비게이션 -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button class="btn btn-outline" onclick="InjectionWorkLogModule.prevMonth()">
                            <span class="material-symbols-outlined">chevron_left</span>
                        </button>
                        <h4 style="margin:0;font-size:1.2rem;min-width:130px;text-align:center;" id="schedTitle"></h4>
                        <button class="btn btn-outline" onclick="InjectionWorkLogModule.nextMonth()">
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                        <button class="btn btn-secondary" onclick="InjectionWorkLogModule.goToday()">오늘</button>
                    </div>
                    <!-- 범례 -->
                    <div style="display:flex;gap:14px;font-size:0.78rem;color:var(--text-secondary);flex-wrap:wrap;">
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span style="width:12px;height:12px;border-radius:2px;background:var(--accent-blue);display:inline-block;"></span> 금형교체 완료
                        </span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span style="width:12px;height:12px;border-radius:2px;border:2px dashed var(--accent-blue);display:inline-block;"></span> 금형교체 예정
                        </span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span style="width:12px;height:12px;border-radius:2px;background:var(--accent-orange);display:inline-block;"></span> 원재료변경 완료
                        </span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span style="width:12px;height:12px;border-radius:2px;border:2px dashed var(--accent-orange);display:inline-block;"></span> 원재료변경 예정
                        </span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span style="width:12px;height:12px;border-radius:2px;background:var(--accent-green);display:inline-block;"></span> 생산실적
                        </span>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div id="schedCalendar" style="overflow-x:auto;"></div>
                    </div>
                </div>
                <div id="schedDetail" style="margin-top:16px;"></div>
            </div>
        `;
        _drawCalendar();
    }

    function _drawCalendar() {
        const year  = _schedYear;
        const month = _schedMonth;

        const titleEl = document.getElementById('schedTitle');
        if (titleEl) titleEl.textContent = `${year}년 ${month}월`;

        const pad      = n => String(n).padStart(2, '0');
        const mStart   = `${year}-${pad(month)}-01`;
        const lastDay  = new Date(year, month, 0).getDate();
        const mEnd     = `${year}-${pad(month)}-${pad(lastDay)}`;
        const today    = UIUtils.today();

        const moldAll = Storage.getAll(MOLD_STORE) || [];
        const rawAll  = Storage.getAll(RAW_STORE)  || [];
        const workAll = Storage.getAll(STORE)       || [];

        function byDate(arr, key) {
            const map = {};
            arr.forEach(d => {
                const k = (d[key] || '').split(' ')[0];
                if (!k) return;
                if (!map[k]) map[k] = [];
                map[k].push(d);
            });
            return map;
        }

        const moldDone = byDate(moldAll.filter(d => d.date >= mStart && d.date <= mEnd),         'date');
        const moldPlan = byDate(moldAll.filter(d => d.plannedDate >= mStart && d.plannedDate <= mEnd), 'plannedDate');
        const rawDone  = byDate(rawAll.filter(d => d.date >= mStart && d.date <= mEnd),           'date');
        const rawPlan  = byDate(rawAll.filter(d => d.plannedDate >= mStart && d.plannedDate <= mEnd),  'plannedDate');
        const workMap  = byDate(workAll.filter(d => d.date >= mStart && d.date <= mEnd),          'date');

        const firstDow = new Date(year, month - 1, 1).getDay(); // 0=일
        const DAY_KO   = ['일', '월', '화', '수', '목', '금', '토'];

        let html = `
            <table style="width:100%;border-collapse:collapse;min-width:700px;">
                <thead><tr>
                    ${DAY_KO.map((d, i) => `
                        <th style="padding:10px 4px;text-align:center;font-size:0.85rem;font-weight:600;
                            color:${i===0?'var(--accent-red)':i===6?'var(--accent-blue)':'var(--text-secondary)'};
                            border-bottom:2px solid #e2e8f0;">${d}</th>
                    `).join('')}
                </tr></thead>
                <tbody>
        `;

        let day = 1;
        const totalRows = Math.ceil((firstDow + lastDay) / 7);

        for (let row = 0; row < totalRows; row++) {
            html += '<tr style="vertical-align:top;">';
            for (let col = 0; col < 7; col++) {
                const isBlank = (row === 0 && col < firstDow) || day > lastDay;
                if (isBlank) {
                    html += `<td style="padding:4px;background:#f8fafc;border:1px solid #e2e8f0;height:95px;"></td>`;
                } else {
                    const ds      = `${year}-${pad(month)}-${pad(day)}`;
                    const isToday = ds === today;
                    const isSun   = col === 0;
                    const isSat   = col === 6;

                    const events = [];

                    (moldDone[ds] || []).forEach(e => {
                        events.push(`<div class="sched-event sched-mold-done" title="금형교체: ${e.partName||''} → ${e.newMoldNo||''}">
                            🔧 ${e.partName || '금형교체'}</div>`);
                    });
                    (moldPlan[ds] || []).forEach(e => {
                        events.push(`<div class="sched-event sched-mold-plan" title="금형교체 예정: ${e.partName||''}">
                            🔧 예정: ${e.partName || ''}</div>`);
                    });
                    (rawDone[ds] || []).forEach(e => {
                        events.push(`<div class="sched-event sched-raw-done" title="원재료변경: ${e.partName||''} → ${e.newMaterial||''}">
                            📦 ${e.newMaterial || '원재료변경'}</div>`);
                    });
                    (rawPlan[ds] || []).forEach(e => {
                        events.push(`<div class="sched-event sched-raw-plan" title="원재료변경 예정: ${e.partName||''} ${e.newMaterial||''}">
                            📦 예정: ${e.newMaterial || ''}</div>`);
                    });
                    if (workMap[ds] && workMap[ds].length) {
                        const totalProd = workMap[ds].reduce((s, w) => s + (Number(w.productionQty) || 0), 0);
                        if (totalProd > 0) {
                            events.push(`<div class="sched-event sched-work" title="생산실적: ${UIUtils.formatNumber(totalProd)}개">
                                ▶ ${UIUtils.formatNumber(totalProd)}개</div>`);
                        }
                    }

                    const dayNumHtml = isToday
                        ? `<span style="background:var(--accent-blue);color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:0.8rem;">${day}</span>`
                        : `<span style="color:${isSun?'var(--accent-red)':isSat?'var(--accent-blue)':'var(--text-primary)'};">${day}</span>`;

                    html += `
                        <td onclick="InjectionWorkLogModule.selectDay('${ds}')"
                            style="padding:5px;border:1px solid #e2e8f0;height:95px;cursor:pointer;vertical-align:top;
                                background:${isToday?'rgba(59,130,246,0.05)':'#fff'};
                                ${isToday?'box-shadow:inset 0 0 0 2px var(--accent-blue);':''}"
                            onmouseover="this.style.background='#f1f5f9'"
                            onmouseout="this.style.background='${isToday?'rgba(59,130,246,0.05)':'#fff'}'">
                            <div style="font-size:0.85rem;font-weight:${isToday?'700':'500'};margin-bottom:3px;">${dayNumHtml}</div>
                            <div style="overflow:hidden;">${events.join('')}</div>
                        </td>
                    `;
                    day++;
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        const calEl = document.getElementById('schedCalendar');
        if (calEl) calEl.innerHTML = html;
    }

    function selectDay(ds) {
        const detailEl = document.getElementById('schedDetail');
        if (!detailEl) return;

        const moldAll = Storage.getAll(MOLD_STORE) || [];
        const rawAll  = Storage.getAll(RAW_STORE)  || [];
        const workAll = Storage.getAll(STORE)       || [];

        const moldDone = moldAll.filter(d => (d.date || '').split(' ')[0] === ds);
        const moldPlan = moldAll.filter(d => d.plannedDate === ds);
        const rawDone  = rawAll.filter(d  => (d.date || '').split(' ')[0] === ds);
        const rawPlan  = rawAll.filter(d  => d.plannedDate === ds);
        const workDone = workAll.filter(d => (d.date || '').split(' ')[0] === ds);

        if (!moldDone.length && !moldPlan.length && !rawDone.length && !rawPlan.length && !workDone.length) {
            detailEl.innerHTML = '';
            return;
        }

        let html = `
            <div class="card">
                <div class="card-header" style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue);">event</span>
                    <strong>${ds} 일정 상세</strong>
                </div>
                <div class="card-body" style="padding:14px 16px;">
        `;

        if (moldDone.length) {
            html += `<div style="margin-bottom:14px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);margin-bottom:6px;">🔧 금형 교체 완료 (${moldDone.length}건)</div>`;
            moldDone.forEach(d => {
                html += `<div style="font-size:0.83rem;padding:6px 10px;background:rgba(59,130,246,0.06);border-radius:6px;margin-bottom:4px;">
                    <strong>${d.machine||'-'}</strong> | ${d.partName||'-'} |
                    <span style="color:var(--text-muted);">${d.oldMoldNo||'-'}</span> →
                    <strong style="color:var(--accent-blue);">${d.newMoldNo||'-'}</strong> |
                    ${d.reason||'-'}${d.shotCount?` | 쇼트:${UIUtils.formatNumber(d.shotCount)}`:''}
                </div>`;
            });
            html += `</div>`;
        }
        if (moldPlan.length) {
            html += `<div style="margin-bottom:14px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);margin-bottom:6px;">🔧 금형 교체 예정 (${moldPlan.length}건)</div>`;
            moldPlan.forEach(d => {
                html += `<div style="font-size:0.83rem;padding:6px 10px;border:1.5px dashed var(--accent-blue);border-radius:6px;margin-bottom:4px;">
                    <strong>${d.machine||'-'}</strong> | ${d.partName||'-'} | 예정쇼트: ${d.plannedShot?UIUtils.formatNumber(d.plannedShot):'-'}
                </div>`;
            });
            html += `</div>`;
        }
        if (rawDone.length) {
            html += `<div style="margin-bottom:14px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-orange);margin-bottom:6px;">📦 원재료 변경 완료 (${rawDone.length}건)</div>`;
            rawDone.forEach(d => {
                html += `<div style="font-size:0.83rem;padding:6px 10px;background:rgba(249,115,22,0.06);border-radius:6px;margin-bottom:4px;">
                    <strong>${d.machine||'-'}</strong> | ${d.partName||'-'} |
                    <span style="color:var(--text-muted);">${d.oldMaterial||'-'}</span> →
                    <strong style="color:var(--accent-orange);">${d.newMaterial||'-'}</strong>
                    ${d.newLot?`| LOT: ${d.newLot}`:''}
                </div>`;
            });
            html += `</div>`;
        }
        if (rawPlan.length) {
            html += `<div style="margin-bottom:14px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-orange);margin-bottom:6px;">📦 원재료 변경 예정 (${rawPlan.length}건)</div>`;
            rawPlan.forEach(d => {
                html += `<div style="font-size:0.83rem;padding:6px 10px;border:1.5px dashed var(--accent-orange);border-radius:6px;margin-bottom:4px;">
                    <strong>${d.machine||'-'}</strong> | ${d.partName||'-'} | ${d.newMaterial||'-'} | ${d.reason||'-'}
                </div>`;
            });
            html += `</div>`;
        }
        if (workDone.length) {
            const tProd = workDone.reduce((s, w) => s + (Number(w.productionQty)||0), 0);
            const tGood = workDone.reduce((s, w) => s + (Number(w.goodQty)||0), 0);
            const tFail = workDone.reduce((s, w) => s + (Number(w.failQty)||0), 0);
            html += `<div style="margin-bottom:14px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-green);margin-bottom:6px;">▶ 생산 실적 (${workDone.length}건 · 총 ${UIUtils.formatNumber(tProd)}개)</div>`;
            workDone.forEach(d => {
                html += `<div style="font-size:0.83rem;padding:6px 10px;background:rgba(16,185,129,0.06);border-radius:6px;margin-bottom:4px;">
                    <strong>${d.machine||'-'}</strong> | ${d.partName||'-'} ${d.color?`(${d.color})`:''} |
                    생산: <strong>${UIUtils.formatNumber(d.productionQty)}</strong>
                    양품: <span style="color:var(--accent-green);">${UIUtils.formatNumber(d.goodQty)}</span>
                    불량: <span style="color:var(--accent-red);">${UIUtils.formatNumber(d.failQty)}</span>
                </div>`;
            });
            html += `</div>`;
        }

        html += `</div></div>`;
        detailEl.innerHTML = html;
        detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function prevMonth() {
        _schedMonth--;
        if (_schedMonth < 1) { _schedMonth = 12; _schedYear--; }
        _drawCalendar();
        const el = document.getElementById('schedDetail');
        if (el) el.innerHTML = '';
    }

    function nextMonth() {
        _schedMonth++;
        if (_schedMonth > 12) { _schedMonth = 1; _schedYear++; }
        _drawCalendar();
        const el = document.getElementById('schedDetail');
        if (el) el.innerHTML = '';
    }

    function goToday() {
        const now = new Date();
        _schedYear  = now.getFullYear();
        _schedMonth = now.getMonth() + 1;
        _drawCalendar();
        const el = document.getElementById('schedDetail');
        if (el) el.innerHTML = '';
    }

    // ── 유틸 ──────────────────────────────────────────────────────────
    function _addDays(dateStr, n) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + n);
        return d.toISOString().split('T')[0];
    }

    // =====================================================================
    // Public API
    // =====================================================================
    return {
        render,
        switchTab,
        // 작업일지
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData,
        onCarModelChange,
        onPartChange,
        onColorChange,
        calcWorkTime,
        calcResults,
        calcFailFromDefects,
        // 금형 교체
        searchMold,
        openMoldAddModal,
        onMoldCarModelChange,
        saveMoldNew,
        editMold,
        saveMoldEdit,
        removeMold,
        // 원재료 변경
        searchRawMat,
        openRawMatAddModal,
        onRawCarModelChange,
        saveRawMatNew,
        editRawMat,
        saveRawMatEdit,
        removeRawMat,
        // 스케쥴
        prevMonth,
        nextMonth,
        goToday,
        selectDay
    };
})();
