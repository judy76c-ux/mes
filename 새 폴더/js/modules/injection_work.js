/**
 * 사출 공정 - 사출 작업일지 모듈
 */
var InjectionWorkLogModule = (function() {
    const STORE = DB.STORES.INJECTION_WORK_LOG;
    const MACHINES = ['110-1호기', '110-2호기', '200-3호기'];

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>사출 작업일지</h3>
                        <p>사출 성형 공정의 생산 및 불량 실적을 기록합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="InjectionWorkLogModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 작업 등록
                        </button>
                        <button class="btn btn-secondary" onclick="InjectionWorkLogModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
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
                                        <th>No</th>
                                        <th>일자</th>
                                        <th>사출기</th>
                                        <th>작업시간</th>
                                        <th>차종</th>
                                        <th>제품명</th>
                                        <th>컬러</th>
                                        <th>초기쇼트</th>
                                        <th>생산수량</th>
                                        <th>양품</th>
                                        <th>불량</th>
                                        <th>불량률</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="iwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 필터 드롭다운 초기화
        const allData = Storage.getAll(STORE) || [];
        const carModels = [...new Set(allData.map(d => d.carModel).filter(Boolean))].sort();
        const carSelect = document.getElementById('iwFilterCarModel');
        if (carSelect) {
            carSelect.innerHTML = '<option value="">전체</option>' +
                carModels.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        search();
    }

    function search() {
        const start = document.getElementById('iwFilterStart').value;
        const end = document.getElementById('iwFilterEnd').value;
        const machine = document.getElementById('iwFilterMachine').value;
        const carModel = document.getElementById('iwFilterCarModel').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (machine) data = data.filter(d => d.machine === machine);
        if (carModel) data = data.filter(d => d.carModel === carModel);

        data.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''));

        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const totalProduction = data.reduce((s, d) => s + (Number(d.productionQty) || 0), 0);
        const totalGood = data.reduce((s, d) => s + (Number(d.goodQty) || 0), 0);
        const totalFail = data.reduce((s, d) => s + (Number(d.failQty) || 0), 0);
        const avgFailRate = totalProduction > 0 ? (totalFail / totalProduction * 100).toFixed(1) : '0.0';

        document.getElementById('iwStats').innerHTML = `
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

    function renderTable(data) {
        const tbody = document.getElementById('iwTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">작업 기록이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((d, index) => {
            const failRate = (Number(d.failRate) || 0).toFixed(1);
            const rateColor = failRate > 5 ? 'var(--accent-red)' : (failRate > 0 ? 'var(--accent-blue)' : 'var(--text-muted)');

            return `
                <tr>
                    <td>${data.length - index}</td>
                    <td>${d.date}</td>
                    <td><span class="badge badge-info">${d.machine}</span></td>
                    <td style="font-size:0.82rem;">
                        ${d.startTime} ~ ${d.endTime}<br>
                        <span style="color:var(--accent-blue); font-weight:600;">(${d.workTime} min)</span>
                    </td>
                    <td>${d.carModel}</td>
                    <td><strong>${d.partName}</strong></td>
                    <td>${d.color}</td>
                    <td style="text-align:right; color:var(--text-muted);">${d.initShot ? UIUtils.formatNumber(d.initShot) : '-'}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(d.productionQty)}</td>
                    <td style="text-align:right; color:var(--accent-green);">${UIUtils.formatNumber(d.goodQty)}</td>
                    <td style="text-align:right; color:var(--accent-red);">${UIUtils.formatNumber(d.failQty)}</td>
                    <td style="text-align:center; font-weight:700; color:${rateColor};">${failRate}%</td>
                    <td>
                        <div style="font-size:0.75rem; color:var(--accent-red);">
                            ${Object.entries(d.defectDetails || {}).map(([k, v]) => `
            $ {
                k
            }($ {
                v
            })
            `).join(', ')}
                        </div>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${d.note || '-'}</span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionWorkLogModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="InjectionWorkLogModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function buildFormHTML(d = {}) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        // 사내 공급처 제품만 필터링
        const internalMaterials = materials.filter(function(m) { return m.supplier === '사내'; });
        const carModels = [...new Set(internalMaterials.map(m => m.carModel).filter(Boolean))].sort();

        let carOptions = `<option value="">-- 차종 선택 --</option>`;
        carModels.forEach(c => {
            carOptions += `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`;
        });

        const currentCar = d.carModel || '';
        let partOptions = `<option value="">-- 품명 선택 --</option>`;
        if (currentCar) {
            const parts = [...new Set(internalMaterials.filter(function(m) { return m.carModel === currentCar; }).map(m => m.injPartName).filter(Boolean))].sort();
            parts.forEach(p => {
                partOptions += `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`;
            });
        }

        const currentPart = d.partName || '';
        let colorOptions = `<option value="">-- 컬러 선택 --</option>`;
        if (currentCar && currentPart) {
            const colors = [...new Set(internalMaterials.filter(function(m) { return m.carModel === currentCar && m.injPartName === currentPart; }).map(m => m.injColor).filter(Boolean))].sort();
            colors.forEach(c => {
                colorOptions += `<option value="${c}" ${d.color === c ? 'selected' : ''}>${c}</option>`;
            });
        }

        // 사출자재에서 선택된 제품의 CVT(취수) 자동 조회
        const selInjMat = internalMaterials.find(function(m) {
            return m.carModel === currentCar && m.injPartName === currentPart;
        });
        const autoCVT = (d.cvt !== undefined && d.cvt !== '') ? d.cvt : (selInjMat ? (selInjMat.cavityCount || '') : '');

        return `
            <!-- ① 작업일자 / 사출기 -->
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

            <!-- ② 시작/완료 시간 / 작업시간 -->
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

            <!-- ③ 차종 / 제품명 / 컬러 -->
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwCarModel" onchange="InjectionWorkLogModule.onCarModelChange()">
                        ${carOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwPartName" onchange="InjectionWorkLogModule.onPartChange()">
                        ${partOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="iwColor" onchange="InjectionWorkLogModule.onColorChange()">
                        ${colorOptions}
                    </select>
                </div>
            </div>

            <!-- ④ C/T / CVT(자동) / 초기 쇼트 수량 -->
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
                    <label class="form-label">초기 쇼트 수량 <span style="font-size:0.75rem;color:var(--text-muted);">(워밍업)</span></label>
                    <input type="number" class="form-input" id="iwInitShot" value="${d.initShot || ''}" min="0" placeholder="0" style="text-align:right;">
                </div>
            </div>

            <!-- ⑤ 투입원재료 / 원재료 컬러 / 원재료 LOT -->
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

            <!-- ⑥ 생산수량 / 양품 / 불량(자동) / 불량률 -->
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

            <!-- 사출 불량 상세 -->
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span> 사출 불량 상세
            </div>
            <div id="iwDefectBreakdown" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:12px;">
            </div>

            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="iwNote" placeholder="특이사항 입력" style="height:60px;">${d.note || ''}</textarea>
            </div>
        `;
    }

    function setupDefects(details = {}) {
        setTimeout(() => {
            const allDefs = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
            const defects = allDefs.filter(df => df && (df.type === 'injection' || !df.type));
            const container = document.getElementById('iwDefectBreakdown');
            if (!container) return;

            if (defects.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">사출 불량 유형이 없습니다.</div>';
            } else {
                container.innerHTML = defects.map(df => {
                    const val = details[df.name] || '';
                    return `
                        <div style="background:var(--bg-secondary);padding:6px 10px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;gap:8px;">
                            <label style="font-size:0.75rem;color:var(--text-secondary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${df.name}">${df.name}</label>
                            <input type="number" class="form-input iw-defect-input" data-defect-name="${df.name}" min="0" placeholder="0" value="${val}" style="padding:4px 6px;width:60px;font-size:0.85rem;" oninput="InjectionWorkLogModule.calcFailFromDefects()">
                        </div>
                    `;
                }).join('');
            }
        }, 100);
    }

    function calcWorkTime() {
        const start = document.getElementById('iwStartTime').value;
        const end = document.getElementById('iwEndTime').value;
        const target = document.getElementById('iwWorkTime');
        if (!start || !end) return;

        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);

        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff < 0) diff += 1440; // 자정 넘김 처리

        target.value = diff;
    }

    // 불량 상세 합계 반환
    function _sumDefects() {
        let total = 0;
        document.querySelectorAll('.iw-defect-input').forEach(function(inp) {
            total += Number(inp.value) || 0;
        });
        return total;
    }

    function calcResults() {
        const prod = Number(document.getElementById('iwProductionQty').value) || 0;
        const failEl = document.getElementById('iwFailQty');
        const rateEl = document.getElementById('iwFailRate');
        const goodEl = document.getElementById('iwGoodQty');

        // 불량(자동) = 불량 상세 합계
        const fail = _sumDefects();
        if (failEl) failEl.value = fail;
        if (goodEl) goodEl.value = Math.max(0, prod - fail);
        if (rateEl) rateEl.value = prod > 0 ? (fail / prod * 100).toFixed(1) : '0.0';
    }

    function calcFailFromDefects() {
        calcResults(); // 불량 상세 변경 → 동일 로직으로 갱신
    }

    // 원재료 + CVT 필드 초기화 헬퍼
    function _clearRawMatFields() {
        const rawMatEl   = document.getElementById('iwRawMaterial');
        const rawColorEl = document.getElementById('iwRawColor');
        const cvtEl      = document.getElementById('iwCVT');
        if (rawMatEl)   rawMatEl.value   = '';
        if (rawColorEl) rawColorEl.value = '';
        if (cvtEl)      cvtEl.value      = '';
    }

    // CVT(취수) 자동 입력
    function _autoFillCVT(car, part) {
        const cvtEl = document.getElementById('iwCVT');
        if (!cvtEl) return;
        const injMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const mat = injMats.find(function(m) {
            return m.supplier === '사내' && m.carModel === car && m.injPartName === part;
        });
        cvtEl.value = (mat && mat.cavityCount) ? mat.cavityCount : '';
    }

    function onCarModelChange() {
        const car = document.getElementById('iwCarModel').value;
        const partSelect  = document.getElementById('iwPartName');
        const colorSelect = document.getElementById('iwColor');
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const internalMaterials = materials.filter(function(m) { return m.supplier === '사내'; });

        // 하위 드롭다운 + 원재료 필드 초기화
        partSelect.innerHTML  = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        _clearRawMatFields();

        if (!car) return;
        const parts = [...new Set(internalMaterials.filter(function(m) { return m.carModel === car; }).map(m => m.injPartName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' + parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function onPartChange() {
        const car  = document.getElementById('iwCarModel').value;
        const part = document.getElementById('iwPartName').value;
        const colorSelect = document.getElementById('iwColor');
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const internalMaterials = materials.filter(function(m) { return m.supplier === '사내'; });

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        _clearRawMatFields();

        if (!car || !part) return;
        const colors = [...new Set(internalMaterials.filter(function(m) { return m.carModel === car && m.injPartName === part; }).map(m => m.injColor).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // CVT 자동 입력
        _autoFillCVT(car, part);

        // 컬러 1개면 자동 선택 후 원재료 자동 입력
        if (colors.length === 1) {
            colorSelect.value = colors[0];
            _autoFillRawMaterial(car, part, colors[0]);
        }
    }

    // 사출자재 → 원재료 매칭으로 투입원재료명 + 컬러 자동 입력
    function _autoFillRawMaterial(car, part, color) {
        const rawMatEl   = document.getElementById('iwRawMaterial');
        const rawColorEl = document.getElementById('iwRawColor');

        const injMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const rawMats = Storage.getAll(DB.STORES.RAW_MATERIALS) || [];

        // 차종 + 사출품명 + 컬러 매칭 (컬러는 부분 포함 비교)
        const injMat = injMats.find(function(m) {
            const colorOk = !color || !m.injColor ||
                m.injColor.toLowerCase().split(/[,，\/]/).map(function(s) { return s.trim(); })
                    .some(function(c) { return c && (color.toLowerCase().includes(c) || c.includes(color.toLowerCase())); });
            return m.carModel === car && m.injPartName === part && colorOk;
        });

        if (!injMat) return;

        // rawMatId → RAW_MATERIALS 조회
        var matName = '', matColor = '';
        if (injMat.rawMatId) {
            const rm = rawMats.find(function(r) { return r.id === injMat.rawMatId; });
            if (rm) { matName = rm.matName; matColor = rm.color; }
        }
        // rawMatId 없으면 저장된 rawMatName / rawMatColor 직접 사용
        if (!matName && injMat.rawMatName) { matName = injMat.rawMatName; matColor = matColor || injMat.rawMatColor; }
        // 그것도 없으면 usedFor 역방향 조회 (injPartName + 컬러 매칭)
        if (!matName) {
            const rm = rawMats.find(function(r) {
                const partOk = r.usedFor && r.usedFor.split(/[,，]/).map(function(s) { return s.trim(); }).includes(part);
                const colOk  = !color || !r.color ||
                    r.color.toLowerCase().split(/[,，\/]/).map(function(s) { return s.trim(); })
                        .some(function(c) { return c && (color.toLowerCase().includes(c) || c.includes(color.toLowerCase())); });
                return partOk && colOk;
            }) || rawMats.find(function(r) {
                return r.usedFor && r.usedFor.split(/[,，]/).map(function(s) { return s.trim(); }).includes(part);
            });
            if (rm) { matName = rm.matName; matColor = rm.color; }
        }

        if (matName  && rawMatEl)   rawMatEl.value   = matName;
        if (matColor && rawColorEl) rawColorEl.value = matColor;
    }

    function onColorChange() {
        const car  = document.getElementById('iwCarModel').value;
        const part = document.getElementById('iwPartName').value;
        const color = document.getElementById('iwColor').value;
        _autoFillRawMaterial(car, part, color);
    }

    function collectData() {
        const defectDetails = {};
        document.querySelectorAll('.iw-defect-input').forEach(input => {
            const val = Number(input.value) || 0;
            if (val > 0) defectDetails[input.dataset.defectName] = val;
        });

        return {
            date: document.getElementById('iwDate').value,
            machine: document.getElementById('iwMachine').value,
            startTime: document.getElementById('iwStartTime').value,
            endTime: document.getElementById('iwEndTime').value,
            workTime: Number(document.getElementById('iwWorkTime').value) || 0,
            carModel: document.getElementById('iwCarModel').value,
            partName: document.getElementById('iwPartName').value,
            color: document.getElementById('iwColor').value,
            cycleTime: Number(document.getElementById('iwCycleTime')?.value) || 0,
            cvt: Number(document.getElementById('iwCVT')?.value) || 0,
            rawMaterial: document.getElementById('iwRawMaterial').value.trim(),
            rawColor: document.getElementById('iwRawColor')?.value.trim() || '',
            rawLot: document.getElementById('iwRawLot').value.trim(),
            initShot: Number(document.getElementById('iwInitShot').value) || 0,
            productionQty: Number(document.getElementById('iwProductionQty').value) || 0,
            goodQty: Number(document.getElementById('iwGoodQty').value) || 0,
            failQty: Number(document.getElementById('iwFailQty').value) || 0,
            failRate: Number(document.getElementById('iwFailRate').value) || 0,
            defectDetails,
            note: document.getElementById('iwNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('사출 작업 등록', buildFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionWorkLogModule.saveNew()">등록</button>
        `, 'lg');
        setupDefects();
    }

    async function saveNew() {
        const data = collectData();
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
            <button class="btn btn-primary" onclick="InjectionWorkLogModule.saveEdit('${id}')">저장</button>
        `, 'lg');
        setupDefects(d.defectDetails || {});
    }

    async function saveEdit(id) {
        const data = collectData();
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
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['일자', '사출기', '시작시간', '완료시간', '작업시간(min)', '차종', '제품명', '컬러', '투입원재료', '원재료LOT', '생산수량', '양품', '불량', '불량률(%)', '비고'];
        const rows = data.map(d => [
            d.date, d.machine, d.startTime, d.endTime, d.workTime,
            d.carModel, d.partName, d.color, d.rawMaterial, d.rawLot,
            d.productionQty, d.goodQty, d.failQty, d.failRate, d.note
        ]);
        Storage.exportToCSV(headers, rows, '사출_작업일지');
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
        exportData,
        onCarModelChange,
        onPartChange,
        onColorChange,
        calcWorkTime,
        calcResults,
        calcFailFromDefects
    };
})();