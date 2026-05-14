/**
 * 레이져 공정 모듈 (작업일지 및 검사일지)
 */

var LaserWorkModule = (function() {
    const STORE = DB.STORES.LASER_WORK_LOG;
    const MACHINES = ['1호기', '2호기', '3호기'];
    let _standbyItems = []; // 레이저 대기품 캐시 (모달 열 때 갱신)
    let _selectedLots = []; // 다중 도장LOT (내부 저장용, 대기품 선택 시 자동 채움)
    let _selectedCarModel = '';
    let _selectedPartName = '';
    let _selectedColor = '';

    // 재공재고 > 0인 레이저 대기품의 도장작업 레코드 목록 반환
    function getLaserStandbyItems() {
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks    = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products      = Storage.getAll(DB.STORES.PRODUCTS) || [];

        const laserPaintWorks = paintingWorks.filter(w => {
            const prod = products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
                      || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
            return prod && (prod.process2 || '').trim() === '레이저';
        });

        // 차종+품명+컬러별 레이저 처리 출고 합계
        const outMap = {};
        laserWorks.forEach(w => {
            const key = `${w.carModel}||${w.partName}||${w.color || ''}`;
            outMap[key] = (outMap[key] || 0) + (Number(w.quantity) || 0);
        });

        // 차종+품명+컬러별 입고 합계
        const inMap = {};
        laserPaintWorks.forEach(w => {
            const key = `${w.carModel}||${w.partName}||${w.color || ''}`;
            inMap[key] = (inMap[key] || 0) + (Number(w.productionQty) || 0);
        });

        // 재고 > 0인 key만 포함
        const activeKeys = new Set(
            Object.keys(inMap).filter(k => (inMap[k] - (outMap[k] || 0)) > 0)
        );

        return laserPaintWorks
            .filter(w => activeKeys.has(`${w.carModel}||${w.partName}||${w.color || ''}`))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>레이져 작업일지</h3>
                        <p>레이져 각인 작업 실적과 품질 항목을 기록합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserWorkModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 작업 등록
                        </button>
                        <button class="btn btn-secondary" onclick="LaserWorkModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="lwFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="lwFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">장비</label>
                        <select class="form-select" id="lwFilterMachine">
                            <option value="">전체</option>
                            ${MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="LaserWorkModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="lwStats"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 레이져 작업 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>No</th>
                                        <th>일자</th>
                                        <th>장비</th>
                                        <th>시간</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>프로그램</th>
                                        <th>수량</th>
                                        <th>도장작업일</th>
                                        <th>사출LOT</th>
                                        <th>품질확인</th>
                                        <th>작업자</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="lwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('lwFilterStart').value;
        const end = document.getElementById('lwFilterEnd').value;
        const machine = document.getElementById('lwFilterMachine').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (machine) data = data.filter(d => d.machine === machine);
        data.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const total = data.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
        const machines = MACHINES.map(m => ({
            name: m,
            qty: data.filter(d => d.machine === m).reduce((s, d) => s + (Number(d.quantity) || 0), 0)
        }));

        document.getElementById('lwStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(total)}</div>
                <div class="stat-card-label">총 작업수량</div>
            </div>
            ${machines.map(m => `
                <div class="stat-card">
                    <div class="stat-card-value">${UIUtils.formatNumber(m.qty)}</div>
                    <div class="stat-card-label">${m.name} 실적</div>
                </div>
            `).join('')}
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('lwTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">기록이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((d, i) => `
            <tr>
                <td>${data.length - i}</td>
                <td>${d.date}</td>
                <td><span class="badge badge-info">${d.machine}</span></td>
                <td style="font-size:0.8rem;">${d.startTime} ~ ${d.endTime}</td>
                <td style="font-weight:600;">${d.carModel || '-'}</td>
                <td>
                    <div style="font-weight:600;">${d.partName || '-'}</div>
                    <div style="margin-top:3px;">${UIUtils.itemTypeBadge(d.carModel, d.partName, d.color)}</div>
                </td>
                <td>${d.color || '-'}</td>
                <td style="font-size:0.8rem; color:var(--accent-blue);">${d.programName || '-'}</td>
                <td style="text-align:right; font-weight:700;">${UIUtils.formatNumber(d.quantity)}</td>
                <td style="font-size:0.8rem;">${d.paintDate || '-'}</td>
                <td style="font-size:0.8rem; font-family:monospace;">${d.paintLot || '-'}</td>
                <td>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${d.qcFirst ? '<span class="badge badge-success">초</span>' : ''}
                        ${d.qcMiddle ? '<span class="badge badge-success">중</span>' : ''}
                        ${d.qcLast ? '<span class="badge badge-success">종</span>' : ''}
                        <span class="badge badge-outline" title="렌즈높이">${d.lensHeight || '-'}</span>
                    </div>
                </td>
                <td style="font-size:0.8rem;">${[d.worker1, d.worker2, d.worker3].filter(Boolean).join(', ')}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="LaserWorkModule.edit('${d.id}')">수정</button>
                </td>
            </tr>
        `).join('');
    }

    function buildFormHTML(d = {}) {
        // 레이저 대기품 목록 갱신
        _standbyItems = getLaserStandbyItems();
        // 대기품 목록에 있는 차종만 필터 옵션으로 사용
        const sbCarModels = [...new Set(_standbyItems.map(w => w.carModel).filter(Boolean))].sort();

        // 수정 모드: 기존 차종/품명/컬러/LOT 읽기 전용 표시
        const isEditMode = !!(d.carModel || d.partName || d.date);
        // 도장 작업일 (paintDate) 과 사출 LOT (lotNo) 분리
        const paintDateSummary = _selectedLots.length > 0
            ? [...new Set(_selectedLots.map(l => l.paintDate).filter(Boolean))].join(', ')
            : (d.paintDate || (d.paintLots && d.paintLots[0] ? d.paintLots[0].paintDate : '') || '-');
        const injLotSummary = _selectedLots.length > 0
            ? _selectedLots.map(l => l.lotNo).filter(Boolean).join(', ')
            : (d.paintLot || (d.paintLots ? d.paintLots.map(l => l.lotNo).join(', ') : '') || '-');

        return `
            ${isEditMode ? `
            <!-- 수정 모드: 저장된 정보 표시 -->
            <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:12px 14px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                    <span class="material-symbols-outlined" style="font-size:1rem; color:var(--accent-blue);">info</span>
                    <span style="font-weight:600; font-size:0.9rem;">도장 제품 정보</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; font-size:0.85rem;">
                    <div><span style="color:var(--text-muted);">차종</span><div style="font-weight:600; margin-top:2px;">${d.carModel || '-'}</div></div>
                    <div><span style="color:var(--text-muted);">품명</span><div style="font-weight:600; margin-top:2px;">${d.partName || '-'}</div></div>
                    <div><span style="color:var(--text-muted);">컬러</span><div style="font-weight:600; margin-top:2px;">${d.color || '-'}</div></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; font-size:0.85rem;">
                    <div>
                        <span style="color:var(--text-muted);">도장 LOT (도장 작업일)</span>
                        <div style="font-weight:600; margin-top:2px; font-family:monospace; font-size:0.82rem;">${paintDateSummary}</div>
                    </div>
                    <div>
                        <span style="color:var(--text-muted);">사출 LOT</span>
                        <div style="font-weight:600; margin-top:2px; font-family:monospace; font-size:0.82rem;">${injLotSummary}</div>
                    </div>
                </div>
            </div>
            ` : `
            <!-- 등록 모드: 레이저 대기품 불러오기 -->
            <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:12px 14px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem; color:var(--accent-blue);">list_alt</span>
                    <span class="form-label" style="margin:0; font-weight:600;">레이저 대기품에서 불러오기</span>
                    ${_standbyItems.length === 0 ? `<span style="font-size:0.78rem; color:var(--accent-red);">대기 중인 품목 없음</span>` : `<span style="font-size:0.78rem; color:var(--text-muted);">(차종/품명 선택 후 항목을 클릭하세요)</span>`}
                </div>
                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <select class="form-select" id="lwSbCar" onchange="LaserWorkModule.onSbCarChange()" style="flex:1;" ${_standbyItems.length === 0 ? 'disabled' : ''}>
                        <option value="">-- 차종 --</option>
                        ${sbCarModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <select class="form-select" id="lwSbPart" onchange="LaserWorkModule.onSbPartChange()" style="flex:2;" disabled>
                        <option value="">-- 품명 --</option>
                    </select>
                </div>
                <div id="lwStandbyResults" style="font-size:0.82rem; color:var(--text-muted); min-height:28px;">
                    ${_standbyItems.length > 0 ? '차종을 선택하세요.' : ''}
                </div>
            </div>
            `}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">작업일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="lwDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">레이져 장비 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwMachine">
                        <option value="">-- 장비 선택 --</option>
                        ${MACHINES.map(m => `<option value="${m}" ${d.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">시작 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="lwStartTime" value="${d.startTime || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">완료 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="lwEndTime" value="${d.endTime || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="lwQuantity" value="${d.quantity || ''}" placeholder="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">각인 시간 (sec)</label>
                    <input type="number" class="form-input" id="lwEngravingTime" value="${d.engravingTime || ''}" placeholder="0.0">
                </div>
                <div class="form-group">
                    <label class="form-label">Program File Name</label>
                    <input type="text" class="form-input" id="lwProgramName" value="${d.programName || ''}" placeholder="프로그램 파일명">
                </div>
                <div class="form-group">
                    <label class="form-label">렌즈 높이</label>
                    <input type="text" class="form-input" id="lwLensHeight" value="${d.lensHeight || ''}" placeholder="예: 120mm">
                </div>
            </div>
            <div style="background:var(--bg-secondary); padding:15px; border-radius:8px; margin-bottom:20px; display:flex; gap:30px; justify-content:center;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="lwQcFirst" ${d.qcFirst ? 'checked' : ''}> <span style="font-weight:600;">초품 확인</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="lwQcMiddle" ${d.qcMiddle ? 'checked' : ''}> <span style="font-weight:600;">중품 확인</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="lwQcLast" ${d.qcLast ? 'checked' : ''}> <span style="font-weight:600;">종품 확인</span>
                </label>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">작업자 1</label>
                    <input type="text" class="form-input" id="lwWorker1" value="${d.worker1 || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">작업자 2</label>
                    <input type="text" class="form-input" id="lwWorker2" value="${d.worker2 || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">작업자 3</label>
                    <input type="text" class="form-input" id="lwWorker3" value="${d.worker3 || ''}">
                </div>
            </div>
        `;
    }

    // ── 도장 LOT 다중 선택 관리 ───────────────────────────────────────
    function addLotRow(paintDate, lotNo) {
        _selectedLots.push({ paintDate: paintDate || '', lotNo: lotNo || '' });
        renderLotRows();
    }

    function removeLotRow(idx) {
        _selectedLots.splice(idx, 1);
        renderLotRows();
    }

    function updateLot(idx, field, value) {
        if (_selectedLots[idx]) _selectedLots[idx][field] = value;
    }

    function renderLotRows() {
        const container = document.getElementById('lwLotContainer');
        if (!container) return;
        if (_selectedLots.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:4px 0;">대기품 선택 또는 + 버튼으로 도장 LOT를 추가하세요.</div>';
            return;
        }
        container.innerHTML = _selectedLots.map((l, i) => `
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.75rem; color:var(--text-muted); min-width:18px; text-align:center; font-weight:600;">${i + 1}</span>
                <input type="date" class="form-input" value="${l.paintDate}"
                       style="flex:0 0 140px;"
                       onchange="LaserWorkModule.updateLot(${i}, 'paintDate', this.value)">
                <input type="text" class="form-input" value="${l.lotNo}"
                       placeholder="사출 LOT 번호"
                       style="flex:1;"
                       oninput="LaserWorkModule.updateLot(${i}, 'lotNo', this.value)">
                <button type="button" class="btn btn-sm btn-danger" onclick="LaserWorkModule.removeLotRow(${i})"
                        style="padding:4px 8px; flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">close</span>
                </button>
            </div>
        `).join('');
    }

    // ── 레이저 대기품 필터 ─────────────────────────────────────────────
    // 차종 변경 → 품명 드롭다운 갱신
    function onSbCarChange() {
        const car     = (document.getElementById('lwSbCar')  || {}).value || '';
        const partSel = document.getElementById('lwSbPart');
        if (!partSel) return;

        const parts = [...new Set(
            _standbyItems.filter(w => !car || w.carModel === car).map(w => w.partName).filter(Boolean)
        )].sort();

        partSel.innerHTML = '<option value="">-- 품명 --</option>' +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
        partSel.disabled = parts.length === 0;

        const resEl = document.getElementById('lwStandbyResults');
        if (resEl) resEl.innerHTML = '<span style="color:var(--text-muted)">품명을 선택하세요.</span>';
    }

    // 품명 변경 → 결과 테이블 렌더링
    function onSbPartChange() {
        const car  = (document.getElementById('lwSbCar')  || {}).value || '';
        const part = (document.getElementById('lwSbPart') || {}).value || '';
        renderStandbyResults(car, part);
    }

    // 필터 결과 테이블 렌더링 (선입선출: 도장작업일 오름차순)
    function renderStandbyResults(car, part) {
        const el = document.getElementById('lwStandbyResults');
        if (!el) return;
        if (!part) {
            el.innerHTML = '<span style="color:var(--text-muted)">품명을 선택하세요.</span>';
            return;
        }

        // 오름차순 정렬: 오래된 항목이 맨 위 (선입선출)
        const filtered = _standbyItems
            .filter(w => (!car || w.carModel === car) && w.partName === part)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        if (filtered.length === 0) {
            el.innerHTML = '<span style="color:var(--text-muted)">해당 품목의 대기품이 없습니다.</span>';
            return;
        }

        const oldestDate = filtered[0].date || '';

        el.innerHTML = `
            <div style="font-size:0.75rem; color:var(--accent-green); font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:0.9rem;">swap_vert</span>
                선입선출(FIFO) 순서 — 도장작업일 오래된 순으로 정렬됨
            </div>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--bg-primary);">
                        <th style="padding:5px 8px; text-align:center; font-size:0.78rem; border-bottom:1px solid var(--border-color);">순서</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">차종</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">품명</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">컬러</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">도장작업일</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">수량</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">사출LOT</th>
                        <th style="padding:5px 8px; border-bottom:1px solid var(--border-color);"></th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((w, i) => {
                        const globalIdx = _standbyItems.indexOf(w);
                        const isFirst = i === 0;
                        const lotDisplay = (w.lots && w.lots.length > 0)
                            ? w.lots.map(l => l.lotNo).join(', ') : (w.lotNo || '-');
                        const rowBg = isFirst ? 'background:rgba(52,211,153,0.07);' : '';
                        const orderBadge = isFirst
                            ? `<span style="color:var(--accent-green);font-weight:700;font-size:0.8rem;">① 선출</span>`
                            : `<span style="color:#f59e0b;font-size:0.75rem;">⚠ 후순위</span>`;
                        return `
                            <tr style="${rowBg}" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${rowBg}'">
                                <td style="padding:5px 8px; text-align:center;">${orderBadge}</td>
                                <td style="padding:5px 8px;">${w.carModel || '-'}</td>
                                <td style="padding:5px 8px; font-weight:600;">${w.partName || '-'}</td>
                                <td style="padding:5px 8px;">${w.color || '-'}</td>
                                <td style="padding:5px 8px; font-weight:${isFirst ? '700' : '400'}; color:${isFirst ? 'var(--accent-green)' : 'inherit'};">${w.date || '-'}</td>
                                <td style="padding:5px 8px; text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(w.productionQty || 0)}</td>
                                <td style="padding:5px 8px; font-family:monospace; font-size:0.8rem;">${lotDisplay}</td>
                                <td style="padding:5px 8px;">
                                    <button class="btn btn-sm btn-primary" onclick="LaserWorkModule.selectStandbyItem(${globalIdx})">선택</button>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    // 대기품 항목 선택 → 폼 자동 채움 + 선입선출 경고
    function selectStandbyItem(idx) {
        const w = _standbyItems[idx];
        if (!w) return;

        // 선입선출(FIFO) 체크: 같은 차종/품명 중 가장 오래된 항목인지 확인
        const sameItems = _standbyItems
            .filter(s => s.carModel === w.carModel && s.partName === w.partName)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const oldestDate = sameItems.length > 0 ? (sameItems[0].date || '') : '';
        if (w.date > oldestDate) {
            UIUtils.toast(
                `⚠ 선입선출 원칙 위반: 더 오래된 재고가 있습니다 (도장일: ${oldestDate})`,
                'warning'
            );
        }

        // 차종/품명/컬러 모듈 변수에 저장 (처음 선택 시)
        if (!_selectedCarModel) {
            _selectedCarModel = w.carModel || '';
            _selectedPartName = w.partName || '';
            _selectedColor    = w.color    || '';
        }

        // 도장 LOT 내부 배열에 추가
        const lotDisplay = (w.lots && w.lots.length > 0)
            ? w.lots.map(l => l.lotNo).join(', ') : (w.lotNo || '');
        _selectedLots.push({ paintDate: w.date || '', lotNo: lotDisplay });

        // 수량 (처음 선택할 때만 자동 입력)
        const qtyEl = document.getElementById('lwQuantity');
        if (qtyEl && !qtyEl.value) qtyEl.value = w.productionQty || '';

        UIUtils.toast(`${w.carModel} / ${w.partName} (${w.date}) 선택되었습니다.`, 'success');
    }

    function onCarModelChange(prevPart = '', prevColor = '') {
        const car = document.getElementById('lwCarModel').value;
        const partSelect = document.getElementById('lwPartName');
        const colorSelect = document.getElementById('lwColor');
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];

        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';

        if (!car) return;
        const parts = [...new Set(products.filter(p => p.carModel === car).map(p => p.partName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            parts.map(p => `<option value="${p}" ${p === prevPart ? 'selected' : ''}>${p}</option>`).join('');

        if (prevPart) onPartChange(prevPart, prevColor);
    }

    function onPartChange(selectedPart = '', prevColor = '') {
        const car = document.getElementById('lwCarModel').value;
        const part = selectedPart || document.getElementById('lwPartName').value;
        const colorSelect = document.getElementById('lwColor');
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        if (!car || !part) return;

        const colors = [...new Set(products.filter(p => p.carModel === car && p.partName === part).map(p => p.color).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}" ${c === prevColor ? 'selected' : ''}>${c}</option>`).join('');
    }

    function collectData() {
        return {
            date: document.getElementById('lwDate').value,
            machine: document.getElementById('lwMachine').value,
            startTime: document.getElementById('lwStartTime').value,
            endTime: document.getElementById('lwEndTime').value,
            carModel: _selectedCarModel,
            partName: _selectedPartName,
            color: _selectedColor,
            paintDate: _selectedLots.length > 0 ? (_selectedLots[0].paintDate || '') : '',
            paintLots: _selectedLots.map(l => ({ paintDate: l.paintDate, lotNo: l.lotNo })),
            engravingTime: Number(document.getElementById('lwEngravingTime').value) || 0,
            quantity: Number(document.getElementById('lwQuantity').value) || 0,
            paintLot: _selectedLots.map(l => l.lotNo).filter(Boolean).join(', '),
            programName: document.getElementById('lwProgramName').value.trim(),
            lensHeight: document.getElementById('lwLensHeight').value.trim(),
            qcFirst: document.getElementById('lwQcFirst').checked,
            qcMiddle: document.getElementById('lwQcMiddle').checked,
            qcLast: document.getElementById('lwQcLast').checked,
            worker1: document.getElementById('lwWorker1').value.trim(),
            worker2: document.getElementById('lwWorker2').value.trim(),
            worker3: document.getElementById('lwWorker3').value.trim()
        };
    }

    function openAddModal() {
        _selectedLots = [];
        _selectedCarModel = '';
        _selectedPartName = '';
        _selectedColor = '';
        UIUtils.showModal('레이져 작업 등록', buildFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWorkModule.saveNew()">등록</button>
        `, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.machine || !data.quantity) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        // 모듈 변수 복원
        _selectedCarModel = d.carModel || '';
        _selectedPartName = d.partName || '';
        _selectedColor    = d.color    || '';
        // _selectedLots 초기화: 기존 데이터에서 복원
        if (d.paintLots && d.paintLots.length > 0) {
            _selectedLots = d.paintLots.map(l => ({ paintDate: l.paintDate || '', lotNo: l.lotNo || '' }));
        } else if (d.paintDate || d.paintLot) {
            _selectedLots = [{ paintDate: d.paintDate || '', lotNo: d.paintLot || '' }];
        } else {
            _selectedLots = [];
        }
        UIUtils.showModal('레이져 작업 수정', buildFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWorkModule.saveEdit('${id}')">저장</button>
        `, 'lg');
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
        const headers = ['일자', '장비', '시작', '종료', '차종', '품명', '컬러', '도장작업일', '각인시간', '수량', '사출LOT', '프로그램', '렌즈높이', '초품', '중품', '종품', '작업자1', '작업자2', '작업자3'];
        const rows = data.map(d => [
            d.date, d.machine, d.startTime, d.endTime, d.carModel, d.partName, d.color, d.paintDate || '',
            d.engravingTime, d.quantity, d.paintLot, d.programName, d.lensHeight,
            d.qcFirst ? 'O' : 'X', d.qcMiddle ? 'O' : 'X', d.qcLast ? 'O' : 'X', d.worker1, d.worker2, d.worker3
        ]);
        Storage.exportToCSV(headers, rows, '레이져_작업일지');
    }

    return {
        render,
        openAddModal,
        search,
        onCarModelChange,
        onPartChange,
        onSbCarChange,
        onSbPartChange,
        selectStandbyItem,
        addLotRow,
        removeLotRow,
        updateLot,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();


/**
 * 레이져 검사일지 모듈
 */
var LaserInspectionModule = (function() {
    const STORE = DB.STORES.LASER_INSPECTIONS;

    // 검사 완료된 작업일지 ID Set 반환
    function getInspectedWorkIds() {
        const inspections = Storage.getAll(STORE) || [];
        return new Set(inspections.map(i => i.workLogId).filter(Boolean));
    }

    // 미검사 작업일지 목록 반환
    function getUninspectedWorks() {
        const works = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const inspectedIds = getInspectedWorkIds();
        return works
            .filter(w => w.id && !inspectedIds.has(w.id))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>레이져 검사일지</h3>
                        <p>레이져 각인 후 검사 결과 및 불량을 집계합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserInspectionModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 검사 등록
                        </button>
                    </div>
                </div>

                <!-- 검사 대기 섹션 -->
                <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-orange, #f59e0b);">
                    <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="display:flex; align-items:center; gap:8px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-orange, #f59e0b);">pending_actions</span>
                            검사 대기 목록
                            <span id="liStandbyBadge" style="font-size:0.78rem; background:var(--accent-orange,#f59e0b); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600;"></span>
                        </h4>
                        <button class="btn btn-sm btn-outline" onclick="LaserInspectionModule.renderStandby()">
                            <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                        </button>
                    </div>
                    <div class="card-body" id="liStandbyBody" style="padding:0;"></div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="liFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="liFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="LaserInspectionModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="liStats"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 검사 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일</th>
                                        <th>차종/품명</th>
                                        <th>검사수량</th>
                                        <th>양품</th>
                                        <th>불량<br><small style="font-weight:400;">(계)</small></th>
                                        <th>불량률</th>
                                        <th style="text-align:center;">사출불량</th>
                                        <th style="text-align:center;">도장불량</th>
                                        <th style="text-align:center;">레이져불량</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="liTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        renderStandby();
        search();
    }

    // ── 검사 대기 섹션 렌더링 ─────────────────────────────────────────
    function renderStandby() {
        const body  = document.getElementById('liStandbyBody');
        const badge = document.getElementById('liStandbyBadge');
        if (!body) return;

        const works = getUninspectedWorks();
        if (badge) badge.textContent = works.length > 0 ? `${works.length}건` : '';

        if (works.length === 0) {
            body.innerHTML = `
                <p style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.88rem;">
                    <span class="material-symbols-outlined" style="vertical-align:middle; font-size:1.1rem;">check_circle</span>
                    검사 대기 중인 작업이 없습니다.
                </p>`;
            return;
        }

        body.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>작업일</th>
                            <th>장비</th>
                            <th>차종/품명</th>
                            <th>컬러</th>
                            <th style="text-align:right;">작업수량</th>
                            <th>도장작업일</th>
                            <th>사출LOT</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${works.map(w => `
                            <tr>
                                <td>${w.date || '-'}</td>
                                <td><span class="badge badge-info">${w.machine || '-'}</span></td>
                                <td>
                                    <div style="font-weight:600;">${w.partName || '-'}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${w.carModel || '-'}</div>
                                    <div style="margin-top:3px;">${UIUtils.itemTypeBadge(w.carModel, w.partName, w.color)}</div>
                                </td>
                                <td>${w.color || '-'}</td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(w.quantity || 0)}</td>
                                <td style="font-size:0.82rem;">${w.paintDate || '-'}</td>
                                <td style="font-size:0.8rem; font-family:monospace;">${w.paintLot || '-'}</td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="LaserInspectionModule.openInspFromWork('${w.id}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_task</span> 검사 등록
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function search() {
        const start = document.getElementById('liFilterStart').value;
        const end   = document.getElementById('liFilterEnd').value;
        let data = Storage.getByDateRange(STORE, start, end);
        data.sort((a, b) => b.date.localeCompare(a.date));
        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const total = data.reduce((s, d) => s + (Number(d.inspQty) || 0), 0);
        const bad   = data.reduce((s, d) => s + (Number(d.failQty) || 0), 0);
        const rate  = total > 0 ? (bad / total * 100).toFixed(1) : '0.0';
        const injBad   = data.reduce((s, d) => s + (Number((d.defectDetails || {}).사출불량) || 0), 0);
        const paintBad = data.reduce((s, d) => s + (Number((d.defectDetails || {}).도장불량) || 0), 0);
        const laserBad = data.reduce((s, d) => s + (Number((d.defectDetails || {}).레이져불량) || 0), 0);

        document.getElementById('liStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(total)}</div>
                <div class="stat-card-label">총 검사수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(total - bad)}</div>
                <div class="stat-card-label">총 양품</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${UIUtils.formatNumber(bad)}</div>
                <div class="stat-card-label">총 불량</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${rate}%</div>
                <div class="stat-card-label">평균 불량률</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value" style="font-size:0.9rem;">${UIUtils.formatNumber(injBad)} / ${UIUtils.formatNumber(paintBad)} / ${UIUtils.formatNumber(laserBad)}</div>
                <div class="stat-card-label">사출 / 도장 / 레이져 불량</div>
            </div>
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('liTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--text-muted);">검사 기록이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map(d => {
            const dd = d.defectDetails || {};
            // 불량 합계: defectDetails 전체 값 합산
            const totalDefect = Object.values(dd).reduce((s, v) => s + (Number(v) || 0), 0);
            // 사출/도장/레이져 분류
            const allDefectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
            const defectTypeMap  = {};
            allDefectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });
            let injBad = 0, paintBad = 0, laserBad = 0;
            Object.entries(dd).forEach(([name, cnt]) => {
                const t = defectTypeMap[name] || 'injection';
                if (t === 'painting') paintBad += Number(cnt) || 0;
                else if (t === 'laser') laserBad += Number(cnt) || 0;
                else injBad += Number(cnt) || 0;
            });
            return `
                <tr style="cursor:pointer;" onclick="LaserInspectionModule._showDetail('${d.id}', event)">
                    <td>${d.date}</td>
                    <td>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${d.carModel || '-'}</div>
                        <div style="margin-top:3px;">${UIUtils.itemTypeBadge(d.carModel, d.partName, d.color)}</div>
                    </td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.inspQty)}</td>
                    <td style="text-align:right; color:var(--accent-green); font-weight:600;">${UIUtils.formatNumber(d.goodQty)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
                    <td style="text-align:center; font-weight:700;">${(Number(d.failRate) || 0).toFixed(1)}%</td>
                    <td style="text-align:center;">${injBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(injBad)}</span>` : '-'}</td>
                    <td style="text-align:center;">${paintBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(paintBad)}</span>` : '-'}</td>
                    <td style="text-align:center;">${laserBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(laserBad)}</span>` : '-'}</td>
                    <td style="font-size:0.8rem;">${d.note || '-'}</td>
                    <td style="white-space:nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-outline" onclick="LaserInspectionModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserInspectionModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    // ── 검사 이력 상세 조회 팝업 ─────────────────────────────────────
    function _showDetail(id, event) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        // 작업 기록 참조 (도장 LOT / 사출 LOT)
        const workRef = d.workLogId
            ? Storage.getById(DB.STORES.LASER_WORK_LOG, d.workLogId) : null;
        const paintingDate = workRef
            ? (workRef.paintDate || workRef.date || '-')
            : (d.date || '-');
        const injLotNo = workRef && workRef.paintLots && workRef.paintLots.length > 0
            ? workRef.paintLots.map(l => l.lotNo).filter(Boolean).join(', ')
            : (workRef ? (workRef.paintLot || '-') : '-');

        // 불량 유형 분류
        const allDefectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap  = {};
        allDefectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        const dd = d.defectDetails || {};
        const injDefects   = [];
        const paintDefects = [];
        const laserDefects = [];
        Object.entries(dd).forEach(([name, cnt]) => {
            if (!cnt || Number(cnt) === 0) return;
            const t = defectTypeMap[name] || 'injection';
            const item = { name, cnt: Number(cnt) };
            if (t === 'painting') paintDefects.push(item);
            else if (t === 'laser') laserDefects.push(item);
            else injDefects.push(item);
        });

        const failRate = (Number(d.failRate) || 0).toFixed(1);

        const defectGroupHtml = (label, color, items) => {
            if (!items.length) return '';
            return `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.72rem;font-weight:600;color:${color};margin-bottom:4px;">${label}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${items.map(it => `
                        <span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:0.8rem;">
                            <span style="color:var(--text-muted);">${it.name}</span>
                            <strong style="margin-left:4px;color:var(--accent-red);">${UIUtils.formatNumber(it.cnt)}</strong>
                        </span>`).join('')}
                </div>
            </div>`;
        };

        const hasDefect = injDefects.length || paintDefects.length || laserDefects.length;

        const popupId = 'liDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:18px 20px; min-width:300px; max-width:400px;
            font-size:0.88rem;
        `;

        const vw = window.innerWidth, vh = window.innerHeight;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        popup.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-blue);">crisis_alert</span>
                    <span style="font-weight:700;font-size:0.95rem;">레이져 검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;line-height:1;padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px;font-size:0.82rem;">
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${paintingDate}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${injLotNo}</div>
                </div>
            </div>

            <!-- 검사 수량 카드 -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;text-align:center;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600;font-size:0.75rem;margin-top:2px;">${d.date || '-'}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">검사수량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-blue);margin-top:2px;">${UIUtils.formatNumber(d.inspQty || 0)}</div>
                </div>
                <div style="background:rgba(52,211,153,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">양품</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-green);margin-top:2px;">${UIUtils.formatNumber(d.goodQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">불량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-red);margin-top:2px;">${UIUtils.formatNumber(d.failQty || 0)}</div>
                </div>
            </div>
            <div style="text-align:right;margin-bottom:${hasDefect ? '10px' : '0'};">
                <span style="font-size:0.78rem;color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700;font-size:0.98rem;color:${parseFloat(failRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${failRate}%</span>
            </div>

            <!-- 불량 상세 -->
            ${hasDefect ? `
            <div style="border-top:1px solid var(--border);padding-top:10px;">
                ${defectGroupHtml('사출 불량', '#ea580c', injDefects)}
                ${defectGroupHtml('도장 불량', '#16a34a', paintDefects)}
                ${defectGroupHtml('레이져 불량', '#ef4444', laserDefects)}
            </div>` : `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:2px 0;border-top:1px solid var(--border);padding-top:8px;">불량 내역 없음</div>`}

            ${d.note ? `
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:0.78rem;color:var(--text-muted);">
                비고: <span style="color:var(--text-primary);">${d.note}</span>
            </div>` : ''}
        `;

        document.body.appendChild(popup);

        // 화면 밖 보정
        requestAnimationFrame(() => {
            const rect = popup.getBoundingClientRect();
            if (rect.right  > vw - 8) popup.style.left = (vw - rect.width - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', function _close(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _close);
                }
            });
        }, 50);
    }

    // ── 검사 등록 폼 (도장 검사와 동일 구조) ────────────────────────────
    let _liCarModel = '';
    let _liPartName = '';
    let _liColor    = '';
    let _liWorkId   = null;

    function _openModal(title, content) {
        _closeModal();
        const modalEl = document.createElement('div');
        modalEl.id = 'liCustomModal';
        modalEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
        modalEl.innerHTML = `
            <style>
                @media print {
                    body { margin:0!important;padding:0!important;background:white!important; }
                    #liCustomModal { position:static!important;background:white!important; }
                    #liCustomModalInner { position:static!important;max-width:100%!important;max-height:none!important;overflow:visible!important;border-radius:0!important;box-shadow:none!important;padding:20px!important; }
                    .btn { display:none!important; }
                    .card { page-break-inside:avoid;border:1px solid #ccc!important; }
                    .form-input { border:1px solid #ccc!important; }
                }
            </style>
            <div id="liCustomModalInner" style="background:white;border-radius:12px;max-width:63vw;width:63vw;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="margin:0;font-size:1.25rem;">${title}</h2>
                    <button onclick="LaserInspectionModule._closeModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-muted);">✕</button>
                </div>
                <div style="display:grid;gap:16px;">${content}</div>
            </div>`;
        document.body.appendChild(modalEl);
    }

    function _closeModal() {
        const el = document.getElementById('liCustomModal');
        if (el) el.remove();
        _closeNumericPad();
    }

    function _buildWorkInfoCard(work) {
        const lotDisplay = work.paintLots && work.paintLots.length > 0
            ? work.paintLots.map(l => l.lotNo).join(', ')
            : (work.paintLot || '-');
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 10px 0;color:var(--text-primary);">레이져 정보</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px 16px;background:var(--bg-secondary);border-radius:8px;padding:14px;">
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">작업일</div>
                    <div style="font-weight:600;font-size:0.9rem;">${work.date||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">장비</div>
                    <div style="font-size:0.9rem;">${work.machine||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">차종</div>
                    <div style="font-weight:600;font-size:0.9rem;">${work.carModel||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">품명</div>
                    <div style="font-weight:600;font-size:0.9rem;">${work.partName||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">컬러</div>
                    <div style="font-size:0.9rem;">${work.color||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">도장 LOT</div>
                    <div style="font-size:0.82rem;font-family:monospace;">${lotDisplay}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">레이져 작업 수량</div>
                    <div style="font-weight:700;font-size:1rem;color:var(--accent-blue);">
                        ${UIUtils.formatNumber(work.quantity||0)} EA
                        <input type="hidden" id="liInspQty" value="${work.quantity||0}">
                    </div>
                </div>
            </div>
        </div></div>`;
    }

    function _buildSelectCard(d = {}) {
        const products  = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 대상</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
                <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="liCarModel" onchange="LaserInspectionModule.onCarModelChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(c=>`<option value="${c}" ${d.carModel===c?'selected':''}>${c}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="liPartName"><option value="">-- 품명 선택 --</option></select></div>
                <div class="form-group"><label class="form-label">검사수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="liInspQty" value="${d.inspQty||''}"
                        onchange="LaserInspectionModule._updateDefectTotal()" placeholder="0"></div>
            </div>
        </div></div>`;
    }

    function _buildInspInfoCard(d = {}, workRef = null) {
        const defaultStart = d.inspectionStartTime || (workRef ? workRef.startTime || '' : '');
        const defaultEnd   = d.inspectionEndTime   || (workRef ? workRef.endTime   || '' : '');
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 정보</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
                <div class="form-group"><label class="form-label">검사일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="liDate" value="${d.date||UIUtils.today()}" style="font-weight:600;"></div>
                <div class="form-group"><label class="form-label">검사 시작시간</label>
                    <input type="time" class="form-input" id="liStartTime" value="${defaultStart}" style="font-weight:600;"
                        oninput="LaserInspectionModule._calculateInspectionTime()"
                        onchange="LaserInspectionModule._calculateInspectionTime()"></div>
                <div class="form-group"><label class="form-label">검사 완료시간</label>
                    <input type="time" class="form-input" id="liEndTime" value="${defaultEnd}" style="font-weight:600;"
                        oninput="LaserInspectionModule._calculateInspectionTime()"
                        onchange="LaserInspectionModule._calculateInspectionTime()"></div>
                <div class="form-group"><label class="form-label">소요시간</label>
                    <input type="text" class="form-input" id="liDuration" placeholder="자동계산" readonly style="background:var(--bg-secondary);font-weight:600;"></div>
            </div>
        </div></div>`;
    }

    function _buildDefectCard(dd = {}) {
        const allDefects   = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const injDefects   = allDefects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = allDefects.filter(d => d.type === 'painting');
        const laserDefects = allDefects.filter(d => d.type === 'laser');

        const section = (label, color, icon, prefix, defects) => {
            if (!defects.length) return '';
            return `
            <div style="margin-bottom:16px;">
                <h5 style="margin:0 0 10px 0;color:${color};border-bottom:2px solid ${color};padding-bottom:5px;font-size:0.9rem;">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">${icon}</span> ${label}
                </h5>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;">
                    ${defects.map(d => `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <label style="font-size:0.9rem;font-weight:600;margin:0;">${d.name}</label>
                            <input type="text" inputmode="numeric" id="${prefix}${d.id}" data-defect-name="${d.name}"
                                value="${dd[d.name]||0}" min="0"
                                style="padding:8px;border:1px solid var(--border-color);border-radius:4px;text-align:center;font-weight:600;font-size:0.95rem;cursor:pointer;background:white;"
                                onfocus="if(this.value==='0')this.value=''"
                                onclick="LaserInspectionModule._showNumericPad(this)"
                                onkeydown="if(!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(event.key)){event.preventDefault();}"
                                oninput="LaserInspectionModule._updateDefectTotal()">
                        </div>`).join('')}
                </div>
            </div>`;
        };

        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">불량 유형 입력</h4>
            ${section('사출 불량','#ea580c','precision_manufacturing','linj-',injDefects)}
            ${section('도장 불량','#16a34a','format_paint','lpaint-',paintDefects)}
            ${section('레이져 불량','#ef4444','crisis_alert','llaser-',laserDefects)}
        </div></div>`;
    }

    function _buildResultCard(d = {}, autoInspQty = 0) {
        const failQty = d.failQty || 0;
        const goodQty = d.goodQty !== undefined ? d.goodQty : Math.max(0, autoInspQty - failQty);
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 결과</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">양품수</label>
                    <input type="number" class="form-input" id="liGoodQty" value="${goodQty}" min="0"
                        style="text-align:right;font-weight:600;" onchange="LaserInspectionModule._updateDefectQty()"></div>
                <div class="form-group"><label class="form-label">불량수</label>
                    <input type="number" class="form-input" id="liDefectQty" value="${failQty}" min="0"
                        style="text-align:right;font-weight:600;" onchange="LaserInspectionModule._updateGoodQty()"></div>
                <div class="form-group"><label class="form-label">합계 (자동)</label>
                    <input type="text" class="form-input" id="liTotalQty" value="${goodQty+failQty}" readonly
                        style="background:var(--bg-secondary);text-align:right;font-weight:600;"></div>
            </div>
            <div class="form-group" style="margin-top:12px;"><label class="form-label">비고</label>
                <textarea class="form-textarea" id="liNote" style="height:50px;">${d.note||''}</textarea>
            </div>
        </div></div>`;
    }

    function _btnSection(saveAction) {
        return `
        <div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid var(--border-color);">
            <button class="btn btn-primary" onclick="${saveAction}">
                <span class="material-symbols-outlined">save</span> 저장</button>
            <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()">
                <span class="material-symbols-outlined">close</span> 취소</button>
        </div>`;
    }

    // (buildFormHTML은 하위호환용으로 _buildSelectCard 위임)
    function buildFormHTML(d = {}) { return _buildSelectCard(d) + _buildInspInfoCard(d) + _buildDefectCard(d.defectDetails||{}) + _buildResultCard(d); }

    // ─ 모달 열기 ─────────────────────────────────────────────────────
    function openAddModal() {
        _liCarModel = ''; _liPartName = ''; _liColor = ''; _liWorkId = null;
        _openModal('레이져 검사 등록',
            _buildSelectCard() + _buildInspInfoCard() + _buildDefectCard() + _buildResultCard() +
            _btnSection('LaserInspectionModule._saveInspection()'));
    }

    function openInspFromWork(workId) {
        const w = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!w) { UIUtils.toast('작업 정보를 찾을 수 없습니다.', 'error'); return; }
        _liCarModel = w.carModel || ''; _liPartName = w.partName || '';
        _liColor    = w.color    || ''; _liWorkId   = w.id;
        _openModal(`레이져 검사 등록 — ${w.partName || ''}`,
            _buildWorkInfoCard(w) + _buildInspInfoCard({}, w) + _buildDefectCard() +
            _buildResultCard({}, w.quantity || 0) +
            _btnSection('LaserInspectionModule._saveInspection()'));
        setTimeout(_calculateInspectionTime, 0);
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        _liCarModel = d.carModel || ''; _liPartName = d.partName || '';
        _liColor    = d.color    || ''; _liWorkId   = d.workLogId || null;
        const workRef = d.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, d.workLogId) : null;
        _openModal('레이져 검사 수정',
            (workRef ? _buildWorkInfoCard(workRef) : _buildSelectCard(d)) +
            _buildInspInfoCard(d) + _buildDefectCard(d.defectDetails || {}) + _buildResultCard(d) +
            _btnSection(`LaserInspectionModule._saveInspection('${id}')`));
        if (!workRef) setTimeout(() => onCarModelChange(d.partName), 50);
    }

    // ─ 저장 ──────────────────────────────────────────────────────────
    async function _saveInspection(existingId) {
        const data = collectData();
        if (!data.inspQty || !data.partName) {
            UIUtils.toast('필수 항목(품명, 검사수량)을 입력하세요.', 'warning');
            return;
        }
        if (existingId) {
            await Storage.update(STORE, existingId, data);
            UIUtils.toast('수정되었습니다.', 'success');
        } else {
            await Storage.add(STORE, data);
            UIUtils.toast('검사 등록되었습니다.', 'success');

            // ── 출하검사 대기 자동 등록 ────────────────────────────────
            const _workRef = data.workLogId
                ? Storage.getById(DB.STORES.LASER_WORK_LOG, data.workLogId) : null;
            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p =>
                p.carModel === data.carModel && p.partName === data.partName && p.color === data.color)
                || _products.find(p => p.carModel === data.carModel && p.partName === data.partName);

            const _paintingDate = _workRef
                ? (_workRef.paintDate || _workRef.date || '')
                : (data.date || '');
            const _lotNo = _workRef && _workRef.paintLots && _workRef.paintLots.length > 0
                ? _workRef.paintLots.map(l => l.lotNo).join(', ')
                : (_workRef ? (_workRef.paintLot || '') : '');

            await Storage.add(DB.STORES.SHIPPING_STANDBY, {
                date         : data.date || UIUtils.today(),
                source       : 'laser_inspection',
                carModel     : data.carModel     || '',
                partName     : data.partName     || '',
                color        : data.color        || '',
                paintingDate : _paintingDate,
                lotNo        : _lotNo,
                inspectionQty: data.inspQty      || 0,
                customer     : _prod ? (_prod.customer || '') : '',
                status       : '대기'
            });
        }
        _closeModal();
        renderStandby();
        search();
    }

    // ─ 데이터 수집 ───────────────────────────────────────────────────
    function collectData() {
        const inspQtyEl = document.getElementById('liInspQty');
        const inspQty   = parseInt((inspQtyEl?.value || '').toString().replace(/,/g, '') || 0);
        const goodQty   = parseInt(document.getElementById('liGoodQty')?.value || 0);
        const failQty   = parseInt(document.getElementById('liDefectQty')?.value || 0);

        const defectDetails = {};
        document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]').forEach(el => {
            const val = parseInt(el.value || 0);
            if (val > 0) defectDetails[el.dataset.defectName] = val;
        });

        const carModelEl = document.getElementById('liCarModel');
        const partNameEl = document.getElementById('liPartName');
        return {
            date               : document.getElementById('liDate')?.value || UIUtils.today(),
            carModel           : carModelEl ? carModelEl.value : _liCarModel,
            partName           : partNameEl ? partNameEl.value : _liPartName,
            color              : _liColor,
            workLogId          : _liWorkId || '',
            inspectionStartTime: document.getElementById('liStartTime')?.value || '',
            inspectionEndTime  : document.getElementById('liEndTime')?.value   || '',
            inspQty, goodQty, failQty,
            failRate           : inspQty > 0 ? (failQty / inspQty * 100) : 0,
            defectDetails,
            note               : document.getElementById('liNote')?.value?.trim() || ''
        };
    }

    function onCarModelChange(prevPart = '') {
        const carEl = document.getElementById('liCarModel');
        if (!carEl) return;
        const partSelect = document.getElementById('liPartName');
        if (!partSelect) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            [...new Set(products.filter(p => p.carModel === carEl.value).map(p => p.partName))].sort()
            .map(p => `<option value="${p}" ${p === prevPart ? 'selected' : ''}>${p}</option>`).join('');
    }

    // ─ 계산 헬퍼 ─────────────────────────────────────────────────────
    function _updateDefectTotal() {
        let sum = 0;
        document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]').forEach(el => { sum += parseInt(el.value||0); });
        const dEl = document.getElementById('liDefectQty');
        if (dEl) dEl.value = sum;
        const iEl = document.getElementById('liInspQty');
        const gEl = document.getElementById('liGoodQty');
        const tEl = document.getElementById('liTotalQty');
        if (iEl && gEl) gEl.value = Math.max(0, parseInt(iEl.value?.toString().replace(/,/g,'')||0) - sum);
        if (tEl) tEl.value = parseInt(gEl?.value||0) + sum;
    }

    function _updateDefectQty() {
        const i = parseInt((document.getElementById('liInspQty')?.value||'').replace(/,/g,'')||0);
        const g = parseInt(document.getElementById('liGoodQty')?.value||0);
        const dEl = document.getElementById('liDefectQty');
        if (dEl) dEl.value = Math.max(0, i - g);
        _updateDefectTotal();
    }

    function _updateGoodQty() {
        const i = parseInt((document.getElementById('liInspQty')?.value||'').replace(/,/g,'')||0);
        const f = parseInt(document.getElementById('liDefectQty')?.value||0);
        const gEl = document.getElementById('liGoodQty');
        if (gEl) gEl.value = Math.max(0, i - f);
        _updateDefectTotal();
    }

    function _calculateInspectionTime() {
        const s = document.getElementById('liStartTime');
        const e = document.getElementById('liEndTime');
        const d = document.getElementById('liDuration');
        if (!s||!e||!d) return;
        if (!s.value||!e.value) { d.value=''; return; }
        const toMin = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
        let dur = toMin(e.value) - toMin(s.value);
        if (dur < 0) dur += 1440;
        d.value = `${dur}분`;
    }

    // ─ 숫자 키패드 ───────────────────────────────────────────────────
    function _showNumericPad(inputEl) {
        _closeNumericPad();
        const pad = document.createElement('div');
        pad.id = 'liNumericPad';
        pad.style.cssText = 'position:fixed;z-index:99999;background:white;border-radius:16px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25);width:220px;';
        pad.innerHTML = `
            <div style="text-align:center;margin-bottom:10px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">
                ${inputEl.previousElementSibling?.textContent||'입력'}
            </div>
            <div id="liNumpadDisplay" style="text-align:center;font-size:2rem;font-weight:700;color:var(--accent-blue);background:var(--bg-secondary);border-radius:8px;padding:10px;margin-bottom:12px;min-height:56px;">${inputEl.value||'0'}</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${[7,8,9,4,5,6,1,2,3].map(n=>`<button onclick="LaserInspectionModule._numpadInput('${n}')" style="padding:14px;font-size:1.2rem;font-weight:600;border:1px solid var(--border-color);border-radius:8px;background:white;cursor:pointer;">${n}</button>`).join('')}
                <button onclick="LaserInspectionModule._numpadDelete()" style="padding:14px;font-size:1.2rem;border:1px solid var(--border-color);border-radius:8px;background:#fff3f3;cursor:pointer;">⌫</button>
                <button onclick="LaserInspectionModule._numpadInput('0')" style="padding:14px;font-size:1.2rem;font-weight:600;border:1px solid var(--border-color);border-radius:8px;background:white;cursor:pointer;">0</button>
                <button onclick="LaserInspectionModule._numpadConfirm()" style="padding:14px;font-size:1rem;font-weight:700;border:none;border-radius:8px;background:var(--accent-blue);color:white;cursor:pointer;">완료</button>
            </div>`;
        const rect = inputEl.getBoundingClientRect();
        let top = rect.bottom + 8, left = rect.left;
        if (left + 220 > window.innerWidth)  left = window.innerWidth - 228;
        if (top  + 340 > window.innerHeight) top  = rect.top - 348;
        pad.style.top = top + 'px'; pad.style.left = left + 'px';
        document.body.appendChild(pad);
        pad._targetInput = inputEl;
        inputEl._liPadHandler = () => {
            let raw = inputEl.value.replace(/[^0-9]/g,'').substring(0,5);
            if (inputEl.value !== raw) inputEl.value = raw;
            const dp = document.getElementById('liNumpadDisplay');
            if (dp) dp.textContent = raw||'0';
            _updateDefectTotal();
        };
        inputEl.addEventListener('input', inputEl._liPadHandler);
        setTimeout(() => document.addEventListener('click', _numpadOutsideClick), 100);
    }

    function _numpadOutsideClick(e) {
        const pad = document.getElementById('liNumericPad');
        if (!pad) { document.removeEventListener('click',_numpadOutsideClick); return; }
        if (pad.contains(e.target)) return;
        _closeNumericPad();
    }

    function _closeNumericPad() {
        const pad = document.getElementById('liNumericPad');
        if (!pad) return;
        if (pad._targetInput?._liPadHandler) {
            pad._targetInput.removeEventListener('input', pad._targetInput._liPadHandler);
            delete pad._targetInput._liPadHandler;
        }
        pad.remove();
        document.removeEventListener('click', _numpadOutsideClick);
    }

    function _numpadInput(d) {
        const dp = document.getElementById('liNumpadDisplay');
        if (!dp) return;
        let v = dp.textContent === '0' ? d : dp.textContent + d;
        if (v.length <= 5) dp.textContent = v;
    }

    function _numpadDelete() {
        const dp = document.getElementById('liNumpadDisplay');
        if (dp) dp.textContent = dp.textContent.length <= 1 ? '0' : dp.textContent.slice(0,-1);
    }

    function _numpadConfirm() {
        const pad = document.getElementById('liNumericPad');
        if (!pad) return;
        const val = document.getElementById('liNumpadDisplay')?.textContent || '0';
        if (pad._targetInput) { pad._targetInput.value = parseInt(val)||0; _updateDefectTotal(); }
        _closeNumericPad();
    }

    function remove(id) {
        UIUtils.confirm('해당 검사 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderStandby();
            search();
        });
    }

    return {
        render, openAddModal, openInspFromWork, search, renderStandby, onCarModelChange, edit, remove,
        _closeModal, _saveInspection, _showDetail,
        _updateDefectTotal, _updateDefectQty, _updateGoodQty, _calculateInspectionTime,
        _showNumericPad, _numpadInput, _numpadDelete, _numpadConfirm
    };
})();


// ===================================================================
// 레이져 대기품 — 차종별 재공 재고 관리
// 입고: 도장 작업 완료 (제조공정-2: 레이저 제품)
// 출고: 레이져 작업 처리 완료
// 재공재고: 입고 합계 - 출고 합계
// ===================================================================
var LaserStandbyModule = (function() {

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>레이져 대기품</h3>
                        <p>도장 완료 후 레이져 공정 대기 중인 제품의 차종별 재공 재고를 관리합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="LaserStandbyModule.refresh()">
                            <span class="material-symbols-outlined">refresh</span> 새로고침
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="lsbStats"></div>

                <!-- 차종별 재공 재고 현황 (블록) -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">입고(도장완료) − 출고(레이져처리) = 재공재고</span>
                    </div>
                    <div class="card-body" id="lsbInventory" style="padding:16px; display:flex; flex-direction:column; gap:14px;"></div>
                </div>

                <!-- 분출 현황 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">table_rows</span> 분출 현황</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">입고(도장작업) · 출고(레이져처리) 내역</span>
                    </div>
                    <div class="card-body" id="lsbDetail" style="padding:0;"></div>
                </div>

            </div>
        `;
        renderAll();
    }

    // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
    function findProduct(products, w) {
        return products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
            || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
    }

    function renderAll() {
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks    = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products      = Storage.getAll(DB.STORES.PRODUCTS) || [];

        // 제조공정-2가 '레이저'인 도장 작업만 필터링
        const laserPaintWorks = paintingWorks.filter(w => {
            const prod = findProduct(products, w);
            if (!prod) return false;
            return (prod.process2 || '').trim() === '레이저';
        });

        // 차종+품명+컬러별 재고 집계 + 개별 레코드 보관
        const inventoryMap = {};

        laserPaintWorks.forEach(w => {
            const key = `${w.carModel}||${w.partName}||${w.color || ''}`;
            const prod = findProduct(products, w);
            if (!inventoryMap[key]) {
                inventoryMap[key] = {
                    carModel   : w.carModel || '-',
                    partName   : w.partName || '-',
                    color      : w.color    || '-',
                    itemType   : prod ? (prod.process2 || '-') : '-',
                    inQty      : 0,
                    outQty     : 0,
                    inRecords  : [],
                    outRecords : []
                };
            }
            const qty = Number(w.productionQty) || 0;
            inventoryMap[key].inQty += qty;
            inventoryMap[key].inRecords.push({
                date  : w.date || '',
                qty,
                lotNo : w.lotNo || (w.lots && w.lots.length > 0 ? w.lots.map(l => l.lotNo).join(', ') : '')
            });
        });

        laserWorks.forEach(w => {
            const key = `${w.carModel}||${w.partName}||${w.color || ''}`;
            if (inventoryMap[key]) {
                const qty = Number(w.quantity) || 0;
                inventoryMap[key].outQty += qty;
                inventoryMap[key].outRecords.push({
                    date    : w.date    || '',
                    qty,
                    machine : w.machine || ''
                });
            }
        });

        // 전체 항목 (분출 현황용) vs 재고 > 0 항목 (재공 재고용)
        const allItems = Object.values(inventoryMap)
            .sort((a, b) => a.carModel.localeCompare(b.carModel) || a.partName.localeCompare(b.partName));
        const stockItems = allItems.filter(i => (i.inQty - i.outQty) > 0);

        renderStats(stockItems, allItems);
        renderInventoryBlocks(stockItems);
        renderDetailTable(allItems);
    }

    function renderStats(stockItems, allItems) {
        const el = document.getElementById('lsbStats');
        if (!el) return;
        const totalStock = stockItems.reduce((s, i) => s + (i.inQty - i.outQty), 0);
        const totalIn    = allItems.reduce((s, i) => s + i.inQty,  0);
        const totalOut   = allItems.reduce((s, i) => s + i.outQty, 0);

        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${stockItems.length}</div>
                <div class="stat-card-label">재공 품목 수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재공 재고 (EA)</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${UIUtils.formatNumber(totalIn)}</div>
                <div class="stat-card-label">총 입고 (도장완료)</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${UIUtils.formatNumber(totalOut)}</div>
                <div class="stat-card-label">총 출고 (레이져처리)</div>
            </div>
        `;
    }

    function renderInventoryBlocks(items) {
        const el = document.getElementById('lsbInventory');
        if (!el) return;

        if (items.length === 0) {
            el.innerHTML = `
                <div style="text-align:center;padding:40px;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                    현재 레이져 공정 대기 재공품이 없습니다.
                </div>`;
            return;
        }

        // 차종별 그룹핑
        const carGroups = {};
        items.forEach(item => {
            const car = item.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(item);
        });

        const cards = Object.entries(carGroups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([carModel, carItems]) => {
                const totalStock = carItems.reduce((s, i) => s + (i.inQty - i.outQty), 0);
                const totalIn    = carItems.reduce((s, i) => s + i.inQty,  0);
                const totalOut   = carItems.reduce((s, i) => s + i.outQty, 0);

                const rows = carItems
                    .sort((a, b) => a.partName.localeCompare(b.partName, 'ko') || a.color.localeCompare(b.color))
                    .map(item => {
                        const stock = item.inQty - item.outQty;
                        const stockColor = stock >= 100 ? 'var(--accent-blue)'
                                         : stock >= 30  ? 'var(--accent-green)'
                                         : 'var(--accent-orange)';
                        const lastIn = item.inRecords.length > 0
                            ? [...item.inRecords].sort((a,b)=>b.date.localeCompare(a.date))[0].date : '';

                        return `
                        <tr onclick="LaserStandbyModule._showItemDetail('${encodeURIComponent(item.carModel+'||'+item.partName+'||'+item.color)}', event)"
                            style="cursor:pointer;"
                            onmouseover="this.style.background='var(--bg-secondary)'"
                            onmouseout="this.style.background=''">
                            <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;border-bottom:1px solid var(--border-color);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                ${item.partName}
                            </td>
                            <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">
                                ${item.color && item.color !== '-' ? item.color : ''}
                            </td>
                            <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                                <span style="font-size:0.9rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;">
                                ${lastIn}
                            </td>
                        </tr>`;
                    }).join('');

                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-blue);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${carModel}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${carItems.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">
                            재공 <strong>${UIUtils.formatNumber(totalStock)}</strong> EA
                        </div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근입고</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            });

        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${cards.join('')}</div>`;
    }

    function renderDetailTable(items) {
        const el = document.getElementById('lsbDetail');
        if (!el) return;

        // 모든 입고/출고 레코드를 평탄화
        const rows = [];
        items.forEach(item => {
            item.inRecords.forEach(r => {
                rows.push({ kind: 'in', carModel: item.carModel, partName: item.partName, color: item.color, itemType: item.itemType, date: r.date, qty: r.qty, lotNo: r.lotNo });
            });
            item.outRecords.forEach(r => {
                rows.push({ kind: 'out', carModel: item.carModel, partName: item.partName, color: item.color, itemType: item.itemType, date: r.date, qty: r.qty, machine: r.machine });
            });
        });

        rows.sort((a, b) => b.date.localeCompare(a.date));

        if (rows.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;padding:20px;">내역이 없습니다.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>구분</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th style="text-align:center;">품목구분</th>
                            <th>입고일<br><small style="font-weight:400;">(도장작업일)</small></th>
                            <th style="text-align:right;">입고수량</th>
                            <th>출고일<br><small style="font-weight:400;">(레이져작업일)</small></th>
                            <th style="text-align:right;">출고수량</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => {
                            const isIn = r.kind === 'in';
                            const kindBadge = isIn
                                ? `<span class="badge badge-success">입고</span>`
                                : `<span class="badge badge-info">출고</span>`;
                            return `
                            <tr style="border-left:3px solid ${isIn ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                                <td>${kindBadge}</td>
                                <td><strong>${r.carModel}</strong></td>
                                <td>${r.partName}</td>
                                <td>${r.color}</td>
                                <td style="text-align:center;">${UIUtils.itemTypeBadge(r.carModel, r.partName, r.color)}</td>
                                <td>${isIn ? r.date : '-'}</td>
                                <td style="text-align:right; color:var(--accent-green); font-weight:600;">${isIn ? UIUtils.formatNumber(r.qty) : '-'}</td>
                                <td>${isIn ? '-' : r.date}</td>
                                <td style="text-align:right; color:var(--accent-blue); font-weight:600;">${isIn ? '-' : UIUtils.formatNumber(r.qty)}</td>
                                <td style="font-size:0.78rem; color:var(--text-muted);">${isIn ? (r.lotNo || '') : (r.machine || '')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }


    async function _showItemDetail(keyEnc, event) {
        event.stopPropagation();

        const key = decodeURIComponent(keyEnc);
        const [carModel, partName, color] = key.split('||');

        // 팝업 위치 계산
        const rect = event.currentTarget.getBoundingClientRect();
        const existingPop = document.getElementById('lsbDetailPopup');
        if (existingPop) existingPop.remove();

        // 데이터 수집
        const laserWork = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const shippingStandby = Storage.getAll(DB.STORES.SHIPPING_STANDBY) || [];
        const laserInspections = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];

        const inRecords = [];
        const outRecords = [];

        // 입고: 도장 완료 → 레이져 대기 (레이져 작업일지 기반)
        laserWork.forEach(w => {
            if (w.carModel === carModel && w.partName === partName && w.color === color) {
                const qty = Number(w.inQty || w.inspectionQty || w.qty || 0);
                if (qty > 0) {
                    inRecords.push({ date: w.paintDate || w.date || '', qty, lotNo: w.paintLots ? w.paintLots.map(l=>l.lotNo).join(', ') : (w.paintLot || '') });
                }
            }
        });

        // 출고: 레이져 검사 완료 → 출하 대기
        laserInspections.forEach(ins => {
            if (ins.carModel === carModel && ins.partName === partName && ins.color === color) {
                const qty = Number(ins.inspectionQty || ins.qty || 0);
                if (qty > 0) {
                    outRecords.push({ date: ins.date || '', qty, note: ins.result || '' });
                }
            }
        });

        const totalIn = inRecords.reduce((s, r) => s + r.qty, 0);
        const totalOut = outRecords.reduce((s, r) => s + r.qty, 0);
        const stock = totalIn - totalOut;
        const stockColor = stock >= 100 ? 'var(--accent-blue)' : stock >= 30 ? 'var(--accent-green)' : 'var(--accent-orange)';

        // 모든 기록 합쳐 날짜순 정렬
        const allRows = [
            ...inRecords.map(r => ({ kind: 'in', ...r })),
            ...outRecords.map(r => ({ kind: 'out', ...r }))
        ].sort((a, b) => b.date.localeCompare(a.date));

        const rowsHtml = allRows.length === 0
            ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px;font-size:0.82rem;">내역이 없습니다.</td></tr>`
            : allRows.map(r => `
                <tr style="border-left:3px solid ${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                    <td style="padding:5px 8px;font-size:0.8rem;">
                        ${r.kind === 'in'
                            ? `<span style="background:var(--accent-green);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">입고</span>`
                            : `<span style="background:var(--accent-blue);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">출고</span>`}
                    </td>
                    <td style="padding:5px 8px;font-size:0.8rem;white-space:nowrap;">${r.date || '-'}</td>
                    <td style="padding:5px 8px;text-align:right;font-size:0.85rem;font-weight:700;
                               color:${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                        ${r.kind === 'in' ? '+' : '-'}${UIUtils.formatNumber(r.qty)}
                    </td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.kind === 'in' ? (r.lotNo || '') : (r.note || '')}</td>
                </tr>`).join('');

        const popup = document.createElement('div');
        popup.id = 'lsbDetailPopup';
        popup.style.cssText = `
            position:fixed; z-index:9999; background:var(--bg-primary);
            border:1px solid var(--border-color); border-radius:10px;
            box-shadow:0 8px 32px rgba(0,0,0,0.18); min-width:320px; max-width:440px;
            max-height:70vh; overflow:hidden; display:flex; flex-direction:column;
        `;

        // 위치 조정
        const popW = 440, popH = 400;
        let top = rect.bottom + 6;
        let left = rect.left;
        if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
        if (top + popH > window.innerHeight - 10) top = rect.top - popH - 6;
        popup.style.top = top + 'px';
        popup.style.left = left + 'px';

        popup.innerHTML = `
            <div style="background:var(--accent-blue);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0;">
                <div>
                    <div style="font-size:0.72rem;opacity:0.8;">${carModel}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${partName} <span style="font-size:0.8rem;font-weight:400;">${color && color !== '-' ? '/ ' + color : ''}</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;opacity:0.8;">현재 재공 재고</div>
                    <div style="font-size:1.3rem;font-weight:800;color:${stock >= 30 ? '#fff' : '#ffd966'};">${UIUtils.formatNumber(stock)} <span style="font-size:0.75rem;font-weight:400;">EA</span></div>
                </div>
            </div>
            <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;gap:20px;font-size:0.78rem;">
                <span>총 입고: <strong style="color:var(--accent-green);">${UIUtils.formatNumber(totalIn)} EA</strong></span>
                <span>총 출고: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(totalOut)} EA</strong></span>
                <span>내역 ${allRows.length}건</span>
            </div>
            <div style="overflow-y:auto;flex:1;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">구분</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">날짜</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">비고</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        document.body.appendChild(popup);

        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 0);
    }

    function refresh() {
        renderAll();
        UIUtils.toast('재고 현황을 새로고침했습니다.', 'info');
    }

    return {
        init   : render,
        render,
        refresh,
        _showItemDetail
    };
})();