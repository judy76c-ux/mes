/**
 * 도장 공정 모듈
 * - 도장 입고
 * - 도장 작업일지 (생산 투입)
 * - 도장 검사 (불량 집계) - 생산계획 연동
 * - 도장품 출고
 */

// ===================================================================
// 도장 입고
// ===================================================================
const PaintingIncomingModule = (function() {
    const STORE = DB.STORES.PAINTING_INCOMING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingIncomingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 입고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="piStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="piEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingIncomingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>입고일</th>
                                        <th>품명</th>
                                        <th>LOT번호</th>
                                        <th>수량</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="piTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('piStart').value;
        const end = document.getElementById('piEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('piTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.lotNo || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.note || '-'}</td>
                <td></td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장 입고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고일</label>
                    <input type="date" class="form-input" id="addPiDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">LOT번호</label>
                    <input type="text" class="form-input" id="addPiLot" placeholder="LOT번호">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPiPart" placeholder="품명">
                </div>
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPiQty" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPiNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingIncomingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPiDate').value,
            lotNo: document.getElementById('addPiLot').value.trim(),
            partName: document.getElementById('addPiPart').value.trim(),
            quantity: Number(document.getElementById('addPiQty').value) || 0,
            note: document.getElementById('addPiNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 사출 창고에서 출고 처리
        await Storage.add(DB.STORES.INJECTION_INVENTORY, {
            date: data.date,
            lotNo: data.lotNo,
            partName: data.partName,
            quantity: data.quantity,
            type: '출고',
            source: '도장 입고'
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장 입고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();


// ===================================================================
// 도장 작업일지
// ===================================================================
const PaintingWorkModule = (function() {
    const STORE = DB.STORES.PAINTING_WORK;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const INJ_INV_STORE = DB.STORES.INJECTION_INVENTORY;
    const INJECTMAT_STORE = DB.STORES.INJECTION_MATERIALS;

    // 현재 선택된 날짜/라인 (모듈 내 상태)
    let _currentDate = '';
    let _currentLine = '도장-A';

    function render(container) {
        _currentDate = UIUtils.today();
        _currentLine = '도장-A';

        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 상단 헤더: 날짜/라인 선택 + 액션 버튼 -->
                <div class="page-header" style="flex-wrap:wrap; gap:0.5rem;">
                    <div class="page-actions" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <label class="form-label" style="margin:0; white-space:nowrap;">작업일</label>
                            <input type="date" class="form-input" id="pwDate" value="${_currentDate}"
                                onchange="PaintingWorkModule.onDateChange()" style="width:145px;">
                        </div>
                        <button class="btn btn-primary" onclick="PaintingWorkModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 작업 등록
                        </button>
                    </div>
                </div>

                <!-- 섹션 1: 생산계획 현황 (A/B 라인 동시 표시) -->
                <div class="card" style="margin-bottom:1rem;">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">assignment</span>
                            생산계획 현황
                            <span id="pwPlanDateLabel" style="color:var(--text-muted);font-size:0.88rem;margin-left:8px;font-weight:400;"></span>
                        </h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">계획 행의 [실적입력]을 클릭하면 해당 계획이 자동 반영됩니다.</span>
                    </div>
                    <div class="card-body" style="padding:12px; display:flex; gap:16px; flex-wrap:wrap;">
                        <!-- 도장-A 계획 -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-blue); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-blue);">도장-A</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px;">
                                <table class="data-table compact">
                                    <thead>
                                        <tr>
                                            <th style="width:100px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:70px;">계획</th>
                                            <th style="text-align:right;width:70px;">실적</th>
                                            <th style="width:90px;">달성률</th>
                                            <th style="width:85px;">입력</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwPlanBodyA"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- 도장-B 계획 -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-orange); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-orange);">도장-B</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px;">
                                <table class="data-table compact">
                                    <thead>
                                        <tr>
                                            <th style="width:100px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:70px;">계획</th>
                                            <th style="text-align:right;width:70px;">실적</th>
                                            <th style="width:90px;">달성률</th>
                                            <th style="width:85px;">입력</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwPlanBodyB"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 섹션 2: 실적 미입력 계획 (2열 분리) -->
                <div id="pwUnenteredSection" class="card" style="margin-bottom:1rem; border-top:3px solid var(--accent-orange); display:none;">
                    <div class="card-header" style="padding:8px 16px; background:rgba(255,152,0,0.05);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0; color:#e65100;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">warning</span>
                            실적 미입력 계획 (전일~7일)
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">계획은 있으나 실적이 등록되지 않은 항목입니다.</span>
                    </div>
                    <div class="card-body" style="padding:12px; display:flex; gap:0; flex-wrap:wrap;">
                        <!-- 도장-A -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-blue); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-blue);">도장-A</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow-y:auto;">
                                <table class="data-table compact">
                                    <thead style="position:sticky; top:0; z-index:1;">
                                        <tr>
                                            <th style="width:90px;">날짜</th>
                                            <th style="width:95px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:65px;">계획</th>
                                            <th style="width:150px;">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwUnenteredBodyA"></tbody>
                                </table>
                            </div>
                        </div>
                        <!-- 구분선 -->
                        <div style="width:1px; background:var(--border-color); margin:0 12px; align-self:stretch;"></div>
                        <!-- 도장-B -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-orange); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-orange);">도장-B</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow-y:auto;">
                                <table class="data-table compact">
                                    <thead style="position:sticky; top:0; z-index:1;">
                                        <tr>
                                            <th style="width:90px;">날짜</th>
                                            <th style="width:95px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:65px;">계획</th>
                                            <th style="width:150px;">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwUnenteredBodyB"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 섹션 3: 작업 실적 통계 + 목록 -->
                <div class="stat-cards" id="pwStats"></div>

                <div class="card">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">format_paint</span>
                            작업 실적 목록
                        </h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                            <label class="form-label" style="margin:0; font-size:0.82rem; white-space:nowrap;">기간</label>
                            <input type="date" class="form-input" id="pwStart" value="${_currentDate}" style="width:130px;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="pwEnd" value="${_currentDate}" style="width:130px;">
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">차종</label>
                            <select class="form-select" id="pwFilterCarModel" style="width:120px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">품명</label>
                            <select class="form-select" id="pwFilterPartName" style="width:150px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.renderWorkList()">
                                <span class="material-symbols-outlined" style="font-size:15px;">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>작업일</th>
                                        <th>라인</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th style="text-align:center;">품목구분</th>
                                        <th>사출 LOT</th>
                                        <th style="text-align:right;">투입수량</th>
                                        <th style="text-align:right;">완료수량</th>
                                        <th style="text-align:right;">양품</th>
                                        <th style="text-align:right;">불량</th>
                                        <th style="text-align:center;">인원</th>
                                        <th>작업시간</th>
                                        <th style="text-align:right;">평균CT</th>
                                        <th style="text-align:center;">CVT</th>
                                        <th style="text-align:right;">SPINDLE 수</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        loadAll();
    }

    // 라인 탭 전환
    function setLine(line) {
        _currentLine = line;
        loadAll();
    }

    function onDateChange() {
        const el = document.getElementById('pwDate');
        if (el) _currentDate = el.value;
        loadAll();
    }

    function loadAll() {
        renderPlanSummary();
        renderUnenteredPlans();
        renderWorkList();
    }

    // ──────────────────────────────────────────────
    // 실적 미입력 계획 렌더링
    // ──────────────────────────────────────────────
    function renderUnenteredPlans() {
        const section = document.getElementById('pwUnenteredSection');
        const bodyA = document.getElementById('pwUnenteredBodyA');
        const bodyB = document.getElementById('pwUnenteredBodyB');
        if (!section || !bodyA || !bodyB) return;

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];

        // 전일부터 7일 전까지 (당일 제외) 실적 누락 항목 필터링
        const sevenDaysAgo = UIUtils.daysAgo(7);
        const today = UIUtils.today();

        const unentered = allPlans.filter(p => {
            if (!p.date || p.date < sevenDaysAgo || p.date >= today) return false;  // 오늘 제외
            if (!(p.carModel || p.partName)) return false;
            return !allWorks.some(w => w.planId === p.id);
        }).sort((a, b) => b.date.localeCompare(a.date) || (a.startTime || '').localeCompare(b.startTime || ''));

        if (unentered.length === 0) {
            section.style.display = 'none';
            return;
        }

        // A라인 / B라인 분리 (line 값에 'b' 또는 'B' 포함이면 B라인)
        const isLineB = p => /b/i.test(p.line || '');
        const listA = unentered.filter(p => !isLineB(p));
        const listB = unentered.filter(p =>  isLineB(p));

        const makeRow = p => {
            const timeStr = p.startTime ? `${p.startTime}~${p.endTime || ''}` : (p.slot || '-');
            const infoStr = `<strong>${p.carModel || ''}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${p.partName || ''}</span>`;
            return `
                <tr>
                    <td style="font-size:0.82rem;">${p.date}</td>
                    <td style="font-size:0.82rem;">${timeStr}</td>
                    <td style="line-height:1.2;">${infoStr}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(p.planQty)}</td>
                    <td style="display:flex; gap:4px; align-items:center;">
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.82rem; background:var(--accent-blue); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px rgba(66,133,244,0.15); white-space:nowrap; height:32px; min-width:90px; justify-content:center; line-height:1;"
                            onclick="PaintingWorkModule.openAddModalFromPlan('${p.id}')"
                            onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';"
                            onmouseout="this.style.filter='none';this.style.transform='none';">
                            <span class="material-symbols-outlined" style="font-size:16px;">edit_note</span>
                            <span>입력</span>
                        </button>
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.82rem; background:var(--accent-red); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px rgba(244,67,54,0.15); white-space:nowrap; height:32px; min-width:90px; justify-content:center; line-height:1;"
                            onclick="PaintingWorkModule.deletePlan('${p.id}', '${p.date}', '${p.line}', '${p.startTime || p.slot}')"
                            onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';"
                            onmouseout="this.style.filter='none';this.style.transform='none';">
                            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                            <span>삭제</span>
                        </button>
                    </td>
                </tr>`;
        };

        const emptyRow = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.82rem;">미입력 계획 없음</td></tr>';

        section.style.display = 'block';
        bodyA.innerHTML = listA.length ? listA.map(makeRow).join('') : emptyRow;
        bodyB.innerHTML = listB.length ? listB.map(makeRow).join('') : emptyRow;
    }

    // ──────────────────────────────────────────────
    // 생산계획 현황 렌더링
    // ──────────────────────────────────────────────
    function renderPlanSummary() {
        const bodyA = document.getElementById('pwPlanBodyA');
        const bodyB = document.getElementById('pwPlanBodyB');
        const label = document.getElementById('pwPlanDateLabel');
        if (!bodyA || !bodyB) return;

        const todayDate = UIUtils.today();  // 생산계획 현황은 항상 당일 고정
        if (label) label.textContent = `(${todayDate})`;

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];

        // 라인별 렌더링 수행 (당일 고정)
        bodyA.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-A', todayDate);
        bodyB.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-B', todayDate);
    }

    // 라인별 계획 데이터 HTML 생성 헬퍼
    function _renderLinePlanData(allPlans, allWorks, line, targetDate) {
        if (!targetDate) targetDate = UIUtils.today();
        const plans = allPlans.filter(p =>
            p.date === targetDate &&
            p.line === line &&
            (p.carModel || p.partName)
        ).sort((a, b) =>
            (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || '')
        );

        const dayWorks = allWorks.filter(w =>
            w.date === targetDate && w.line === line
        );

        if (plans.length === 0) {
            return `
                <tr>
                    <td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">
                        등록된 계획 없음
                    </td>
                </tr>`;
        }

        return plans.map(plan => {
            const planQty = Number(plan.planQty) || 0;
            const achieved = dayWorks.filter(w =>
                w.carModel === plan.carModel &&
                w.partName === plan.partName &&
                w.color === plan.color
            ).reduce((s, w) => s + (Number(w.productionQty) || 0), 0);

            const rate = planQty > 0 ? Math.min(100, Math.round(achieved / planQty * 100)) : 0;
            const rateColor = rate >= 100 ? 'var(--accent-green)' : (rate >= 70 ? 'var(--accent-blue)' : (rate > 0 ? 'var(--accent-orange)' : 'var(--text-muted)'));

            const timeStr = plan.startTime ? `${plan.startTime}~${plan.endTime || ''}` : (plan.slot || '-');
            const infoStr = `<strong>${plan.carModel || ''}</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">${plan.partName || ''} (${plan.color || '-'})</span>`;

            const isCompleted = dayWorks.some(w => w.planId === plan.id);
            const btnText = isCompleted ? '입력 완료' : '실적입력';
            const btnIcon = isCompleted ? 'check_circle' : 'edit_note';
            const btnBg = isCompleted ? 'var(--accent-green)' : 'var(--accent-blue)';
            const btnShadow = isCompleted ? 'rgba(76,175,80,0.2)' : 'rgba(66,133,244,0.2)';
            const btnOpacity = isCompleted ? '0.85' : '1';

            return `
                <tr>
                    <td style="font-size:0.82rem; white-space:nowrap;">${timeStr}</td>
                    <td style="line-height:1.2;">${infoStr}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(planQty)}</td>
                    <td style="text-align:right; font-weight:600; color:${rateColor};">${UIUtils.formatNumber(achieved)}</td>
                    <td>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                                <div style="width:${rate}%;height:100%;background:${rateColor};"></div>
                            </div>
                            <span style="font-size:0.75rem;min-width:28px;text-align:right;">${rate}%</span>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-xs" 
                            style="padding:6px 12px; font-size:0.8rem; background:${btnBg}; color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px ${btnShadow}; white-space:nowrap; width:max-content; opacity:${btnOpacity}; cursor:${isCompleted ? 'default' : 'pointer'};"
                            onclick="${isCompleted ? 'UIUtils.toast(\'이미 실적이 등록된 계획입니다.\', \'info\')' : `PaintingWorkModule.openAddModalFromPlan('${plan.id}')`}"
                            ${!isCompleted ? `onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';" onmouseout="this.style.filter='none';this.style.transform='none';"` : ''}>
                            <span class="material-symbols-outlined" style="font-size:16px;">${btnIcon}</span>
                            ${btnText}
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 작업 실적 목록 렌더링
    // ──────────────────────────────────────────────
    function renderWorkList() {
        const startEl = document.getElementById('pwStart');
        const endEl = document.getElementById('pwEnd');
        const start = startEl ? startEl.value : _currentDate;
        const end = endEl ? endEl.value : _currentDate;

        // 기간 범위 데이터 조회 (날짜 + 시간으로 정렬, 최신순)
        let data = Storage.getByDateRange(STORE, start, end)
            .sort((a, b) => {
                // 날짜로 먼저 정렬 (최신순)
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;

                // 같은 날짜면 시간으로 정렬 (최신순)
                const aTime = a.startTime || '00:00';
                const bTime = b.startTime || '00:00';
                return bTime.localeCompare(aTime);
            });

        // 차종·품명 드롭다운 초기화 (unique 값 수집)
        const uniqueCarModels = [...new Set(data.map(d => d.carModel).filter(Boolean))].sort();
        const uniquePartNames = [...new Set(data.map(d => d.partName).filter(Boolean))].sort();

        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');

        if (carModelSel) {
            const currentCarModel = carModelSel.value;
            carModelSel.innerHTML = '<option value="">전체</option>' +
                uniqueCarModels.map(m => `<option value="${m}" ${currentCarModel === m ? 'selected' : ''}>${m}</option>`).join('');
        }

        if (partNameSel) {
            const currentPartName = partNameSel.value;
            partNameSel.innerHTML = '<option value="">전체</option>' +
                uniquePartNames.map(p => `<option value="${p}" ${currentPartName === p ? 'selected' : ''}>${p}</option>`).join('');
        }

        // 필터 값 읽기
        const filterCarModel = carModelSel ? carModelSel.value : '';
        const filterPartName = partNameSel ? partNameSel.value : '';

        // 필터 적용
        if (filterCarModel) {
            data = data.filter(d => d.carModel === filterCarModel);
        }
        if (filterPartName) {
            data = data.filter(d => d.partName === filterPartName);
        }

        const totalInput = data.reduce((s, d) => s + (Number(d.inputQty) || 0), 0);
        const totalProd = data.reduce((s, d) => s + (Number(d.productionQty) || 0), 0);
        const totalGood = data.reduce((s, d) => s + (Number(d.goodQty) || 0), 0);
        const totalBad = data.reduce((s, d) => s + (Number(d.defectQty) || 0), 0);

        const statsEl = document.getElementById('pwStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalInput)}</div>
                    <div class="stat-card-label">투입 수량</div>
                </div>
                <div class="stat-card cyan">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalProd)}</div>
                    <div class="stat-card-label">생산 수량</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalGood)}</div>
                    <div class="stat-card-label">양품 수량</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalBad)}</div>
                    <div class="stat-card-label">불량 수량</div>
                </div>`;
        }

        const tbody = document.getElementById('pwTableBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:36px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            // LOT 표시: lots 배열 우선, 없으면 단일 lotNo
            const lotDisplay = (() => {
                if (d.lots && d.lots.length > 0) {
                    return d.lots.map(l =>
                        '<span style="background:var(--bg-secondary);border:1px solid var(--border);' +
                        'border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;' +
                        'display:inline-block;margin:1px 2px 1px 0;">' + l.lotNo +
                        (l.qty ? '<span style="color:var(--text-muted);margin-left:3px;">(' + UIUtils.formatNumber(l.qty) + ')</span>' : '') +
                        '</span>'
                    ).join('');
                }
                return d.lotNo ?
                    '<span style="background:var(--bg-secondary);border:1px solid var(--border);' +
                    'border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;">' + d.lotNo + '</span>' :
                    '-';
            })();

            const timeStr = d.startTime ?
                d.startTime + (d.endTime ? '~' + d.endTime : '') :
                '-';
            const ctStr = d.avgCT > 0 ?
                '<span style="color:var(--accent-blue);font-size:0.82rem;">' + d.avgCT.toFixed(1) + '초</span>' :
                '-';

            // CVT: 제품 마스터에서 도장 공정 슬롯의 cvt 값 조회
            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p => p.carModel === d.carModel && p.partName === d.partName);
            let _cvt = 0;
            if (_prod) {
                for (let i = 1; i <= 4; i++) {
                    const proc = (_prod['process' + i] || '').toLowerCase();
                    if (proc.includes('도장')) {
                        _cvt = Number(_prod['cvt' + i]) || 0;
                        break;
                    }
                }
                if (!_cvt) _cvt = Number(_prod.cvt1) || 0; // 폴백: 첫번째 슬롯
            }
            const _inputQty  = Number(d.inputQty) || 0;
            const _spindle   = (_cvt > 0 && _inputQty > 0) ? Math.ceil(_inputQty / _cvt) : 0;
            const cvtStr     = _cvt > 0
                ? '<span style="font-weight:700;color:var(--accent-blue);">' + _cvt + '</span>'
                : '<span style="color:var(--text-muted);">-</span>';
            const spindleStr = _spindle > 0
                ? '<span style="font-weight:700;color:var(--accent-green);">' + UIUtils.formatNumber(_spindle) + '</span>' +
                  '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' +
                  UIUtils.formatNumber(_inputQty) + '÷' + _cvt + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            // 검사 완료 여부 확인
            const isInspectionCompleted = d.inspectionStatus === 'completed';
            const statusBadge = isInspectionCompleted ?
                '<span style="display:inline-block; background:var(--accent-green); color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; margin-right:4px;">✓ 검사완료</span>' :
                '';

            // 계획수량 초과 배지
            const overPlanBadge = d.overPlanQty
                ? '<span style="display:inline-block;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="계획수량 초과 등록됨">⚠ 초과</span>'
                : '';

            // 시간 변동 / 관리자 통보 배지
            const timeChangeBadge = d.timeReason
                ? '<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="시간변동: ' + (d.timeReason || '') + (d.timeReasonDetail ? ' / ' + d.timeReasonDetail : '') + '">⏱ 시간변동</span>'
                : '';

            // 검사 완료된 항목은 수정 버튼 비활성화 (삭제 버튼 없음)
            const actionButtons = isInspectionCompleted ?
                '<span style="color:var(--text-muted); font-size:0.85rem;">검사 완료됨</span>' :
                '<button class="btn btn-sm btn-outline" onclick="PaintingWorkModule.edit(\'' + d.id + '\')">수정</button>';

            return '<tr style="' + (isInspectionCompleted ? 'background:rgba(22,163,74,0.05);' : '') + '">' +
                '<td>' + d.date + '</td>' +
                '<td>' + (d.line || '-') + '</td>' +
                '<td>' + (d.carModel || '-') + '</td>' +
                '<td>' + (d.partName || '-') + '</td>' +
                '<td>' + (d.color || '-') + '</td>' +
                '<td style="text-align:center;">' + UIUtils.itemTypeBadge(d.carModel, d.partName, d.color) + '</td>' +
                '<td>' + lotDisplay + '</td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(d.inputQty) + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + UIUtils.formatNumber(d.productionQty) + '</td>' +
                '<td style="text-align:right;color:var(--accent-green);">' + UIUtils.formatNumber(d.goodQty) + '</td>' +
                '<td style="text-align:right;color:var(--accent-red);">' + UIUtils.formatNumber(d.defectQty) + '</td>' +
                '<td style="text-align:center;">' + (d.workers > 0 ? d.workers + '명' : '-') + '</td>' +
                '<td style="font-size:0.82rem;white-space:nowrap;">' + timeStr + '</td>' +
                '<td style="text-align:right;">' + ctStr + '</td>' +
                '<td style="text-align:center;">' + cvtStr + '</td>' +
                '<td style="text-align:right;">' + spindleStr + '</td>' +
                '<td style="white-space:nowrap;">' + overPlanBadge + timeChangeBadge + statusBadge + actionButtons + '</td></tr>';
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 사출 LOT 목록 (잔량 계산)
    // ──────────────────────────────────────────────
    function getInjectionLots(carModel, partName) {
        const all = Storage.getAll(INJ_INV_STORE) || [];
        const lotMap = {};
        all.forEach(item => {
            if (!item.lotNo) return;
            const matchModel = !carModel || item.carModel === carModel;
            const matchPart = !partName || item.partName === partName;
            // ★ AND 조건: carModel과 partName 모두 일치해야 함 (OR 조건으로 인한 다른 제품 로트 혼입 방지)
            if (!matchModel || !matchPart) return;
            const key = item.lotNo;
            if (!lotMap[key]) {
                lotMap[key] = {
                    lotNo: item.lotNo,
                    carModel: item.carModel || '',
                    partName: item.partName || '',
                    supplier: item.supplier || '',
                    balance: 0
                };
            }
            if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
            else lotMap[key].balance += Number(item.quantity) || 0;
        });
        return Object.values(lotMap).filter(l => l.balance > 0)
            .sort((a, b) => a.lotNo.localeCompare(b.lotNo)); // 선입선출: 오래된 LOT 먼저
    }

    function buildLotOptionsHtml(carModel, partName) {
        const lots = getInjectionLots(carModel, partName);
        if (lots.length === 0) return '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>';
        return lots.map((l, i) =>
            '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') + ' data-balance="' + l.balance + '">' +
            l.lotNo + ' │ ' + (l.partName || l.carModel) +
            ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>'
        ).join('');
    }

    // ──────────────────────────────────────────────
    // 사출 컬러 매칭 헬퍼 (대소문자 무시, 복합색 지원)
    // matColor: 자재의 injColor ("BLACK" / "BLACK,GRAY" 등)
    // planColor: 생산계획의 color ("BLACK" / "6PS" 등)
    // ──────────────────────────────────────────────
    function _injColorMatches(matColor, planColor) {
        if (!matColor || !planColor) return true; // 한쪽이라도 없으면 허용
        var mc = matColor.trim().toLowerCase().replace(/\s+/g, '');
        var pc = planColor.trim().toLowerCase().replace(/\s+/g, '');
        if (mc === pc) return true;
        return mc.split(/[,，\/]/).map(function(c) { return c.trim(); })
            .some(function(c) { return c === pc; });
    }

    // ──────────────────────────────────────────────
    // 사출자재 마스터 기반 사출명 조회 헬퍼
    // ──────────────────────────────────────────────
    // 생산계획 품명(planPartName) + 차종 + 컬러 → 사출자재 제작품명1/2 매칭 → injPartName 목록 반환
    function getInjPartNamesForProduct(planPartName, carModel, planColor) {
        if (!planPartName) return [];
        var materials = Storage.getAll(INJECTMAT_STORE) || [];
        var seen = {};
        return materials.filter(function(m) {
            var nameMatch  = m.mfgProductName === planPartName || m.mfgProductName2 === planPartName;
            var modelMatch = !carModel   || m.carModel === carModel;
            var colorMatch = _injColorMatches(m.injColor, planColor || '');
            return nameMatch && modelMatch && colorMatch && m.injPartName
                && !seen[m.injPartName] && (seen[m.injPartName] = true);
        });
    }

    // 사출자재 마스터 미등록 시 사출 창고 partName에서 직접 후보 탐색
    // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 필터 없이 품명 포함만 검색
    function getInjPartNamesFromInventory(planPartName) {
        if (!planPartName) return [];
        var lower = planPartName.toLowerCase();
        var all = Storage.getAll(INJ_INV_STORE) || [];
        var seen = {};
        return all.filter(function(item) {
            if (!item.partName) return false;
            var nameMatch = item.partName.toLowerCase().indexOf(lower) !== -1
                         || item.partName.toLowerCase() === lower;
            return nameMatch && !seen[item.partName] && (seen[item.partName] = true);
        }).map(function(item) {
            return { injPartName: item.partName };
        });
    }

    // 사출명 <option> HTML 빌드 (단일 매칭 시 자동 selected)
    function buildInjPartOptionsHtml(planPartName, carModel, planColor) {
        // ① 컬러 + 차종 일치 우선
        var parts = getInjPartNamesForProduct(planPartName, carModel, planColor);
        // ② 차종 무관 (컬러 유지)
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', planColor);
        }
        // ③ 도장 컬러 ≠ 사출 소재 컬러인 경우를 위한 폴백 — 컬러 필터 없이 품명+차종만 매칭
        //    예: 도장 DYS → 사출 소재 GRAY (컬러가 달라도 품명 연결로 매칭)
        if (parts.length === 0) {
            parts = getInjPartNamesForProduct(planPartName, carModel, '');
        }
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', '');
        }
        // ④ 사출자재 마스터 미등록 시 사출 창고에서 직접 탐색
        if (parts.length === 0) {
            parts = getInjPartNamesFromInventory(planPartName);
        }
        if (parts.length === 0) {
            return '<option value="">-- 사출자재 미등록 (전체 LOT 표시) --</option>';
        }
        var autoSelect = parts.length === 1;
        var opts = parts.map(function(m) {
            return '<option value="' + m.injPartName + '"' + (autoSelect ? ' selected' : '') + '>' +
                m.injPartName + '</option>';
        }).join('');
        return (parts.length > 1 ? '<option value="">-- 사출명 선택 --</option>' : '') + opts;
    }

    // injPartName으로 사출 창고 LOT를 조회
    // planColor: 사출 소재 컬러와 일치하는 LOT 우선 — 불일치 시 전체 반환 (폴백)
    // 도장 컬러(DYS 등)와 사출 소재 컬러(GRAY 등)가 다를 수 있으므로
    // 컬러 필터 후 결과가 없으면 해당 injPartName의 전체 LOT를 반환
    function getInjectionLotsByInjPart(injPartName, planColor) {
        var all = Storage.getAll(INJ_INV_STORE) || [];
        var lotMap = {};
        all.forEach(function(item) {
            if (!item.lotNo) return;
            if (injPartName && item.partName !== injPartName) return;
            var key = item.lotNo;
            if (!lotMap[key]) {
                lotMap[key] = {
                    lotNo:     item.lotNo,
                    partName:  item.partName  || '',
                    carModel:  item.carModel  || '',
                    color:     item.color     || '',
                    balance:   0
                };
            }
            if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
            else                      lotMap[key].balance += Number(item.quantity) || 0;
        });
        var allLots = Object.values(lotMap).filter(function(l) {
            return l.balance > 0;
        }).sort(function(a, b) {
            return a.lotNo.localeCompare(b.lotNo); // 선입선출
        });
        // 컬러 필터: 도장 컬러와 사출 소재 컬러가 일치하면 해당 LOT만 반환
        // 불일치(DYS vs GRAY 등)이면 전체 반환 — 소재 컬러는 도장 컬러와 다를 수 있음
        if (planColor) {
            var filtered = allLots.filter(function(l) {
                if (!l.color) return true;
                return _injColorMatches(l.color, planColor);
            });
            if (filtered.length > 0) return filtered;
        }
        return allLots;
    }

    // injPartName 기반 LOT <option> HTML 빌드 (컬러 필터 + 컬러 표시)
    function buildLotOptionsHtmlByInjPart(injPartName, planColor) {
        var lots = getInjectionLotsByInjPart(injPartName, planColor);
        if (lots.length === 0) return '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>';
        return lots.map(function(l, i) {
            var colorTag = l.color ? ' │ ' + l.color : '';
            return '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') + ' data-balance="' + l.balance + '">' +
                l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
        }).join('');
    }

    // 사출명 드롭다운 변경 → 모든 LOT 행 드롭다운 갱신 + LOT 추가 버튼 활성화 제어
    function onInjPartSelect(sel) {
        var injPartName = sel ? sel.value : '';
        var planColor   = (document.getElementById('addPwColorHidden') || {}).value || '';
        var lotsHtml;
        var lotCount;
        if (injPartName) {
            var lots = getInjectionLotsByInjPart(injPartName, planColor);
            lotCount = lots.length;
            lotsHtml = lotCount === 0 ?
                '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>' :
                '<option value="" data-balance="">-- LOT 선택 --</option>' + lots.map(function(l) {
                    var colorTag = l.color ? ' │ ' + l.color : '';
                    return '<option value="' + l.lotNo + '" data-balance="' + l.balance + '">' +
                        l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                        ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
                }).join('');
        } else {
            var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
            // pn은 제품명(생산계획)이므로 사출 창고 partName과 다름 → carModel 전체 조회
            lotCount = getInjectionLots(cm, '').length;
            lotsHtml = buildLotOptionsHtml(cm, '');
        }
        document.querySelectorAll('#pwLotRows .pw-lot-sel').forEach(function(s) {
            s.innerHTML = lotsHtml;
            // 선입선출: 드롭다운 변경 시 텍스트 입력도 선택된 LOT로 동기화
            if (s.value) {
                var row = s.closest('.pw-lot-row');
                if (row) {
                    var inp = row.querySelector('.pw-lot-no');
                    if (inp) inp.value = s.value;
                }
            }
        });
        // LOT 추가 버튼 활성화 여부 갱신
        var btn = document.getElementById('pwAddLotBtn');
        if (btn) {
            btn.disabled = lotCount <= 1;
            btn.title = lotCount <= 1 ? '사출 창고 LOT가 1개 이하여서 추가할 수 없습니다' : '';
        }
    }

    // ──────────────────────────────────────────────
    // LOT 다중 행 헬퍼
    // ──────────────────────────────────────────────

    // 현재 선택된 LOT 번호 목록 (excludeRow 제외)
    function _getSelectedLotNos(excludeRow) {
        var selected = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (excludeRow && row === excludeRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (sel && sel.value) selected.push(sel.value);
        });
        return selected;
    }

    // 선택 제외 목록을 반영한 LOT 옵션 HTML 생성 (데이터-balance 포함, 컬러 필터)
    function _buildFilteredLotOptions(injPartName, carModel, partName, excludeLotNos) {
        var planColor = (document.getElementById('addPwColorHidden') || {}).value || '';
        var lots = injPartName
            ? getInjectionLotsByInjPart(injPartName, planColor)
            : getInjectionLots(carModel || '', ''); // partName은 제품명이므로 사출 창고 조회 시 carModel만 사용
        var filtered = (excludeLotNos && excludeLotNos.length > 0)
            ? lots.filter(function(l) { return excludeLotNos.indexOf(l.lotNo) < 0; })
            : lots;
        if (filtered.length === 0)
            return '<option value="">-- 선택 가능한 LOT 없음 --</option>';
        return '<option value="" data-balance="">-- LOT 선택 --</option>' +
            filtered.map(function(l) {
                var colorTag = l.color ? ' │ ' + l.color : '';
                return '<option value="' + l.lotNo + '" data-balance="' + l.balance + '">' +
                    l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                    ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
            }).join('');
    }

    // 선택된 LOT의 재고 잔량을 qty 입력의 max로 설정
    function _updateLotQtyMax(row, lotNo) {
        if (!row) return;
        var qtyInp = row.querySelector('.pw-lot-qty');
        if (!qtyInp) return;
        if (!lotNo) { qtyInp.removeAttribute('max'); return; }
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var planColor   = (document.getElementById('addPwColorHidden') || {}).value || '';
        var lots = injPartName ? getInjectionLotsByInjPart(injPartName, planColor) : getInjectionLots(cm, '');
        var lot = lots.find(function(l) { return l.lotNo === lotNo; });
        if (lot) {
            qtyInp.max = lot.balance;
            qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(lot.balance);
        }
    }

    // 다른 LOT 행 드롭다운 갱신 (currentRow 제외)
    function _refreshOtherLotDropdowns(currentRow) {
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (row === currentRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (!sel) return;
            var curVal = sel.value;
            var excludeLots = _getSelectedLotNos(row);
            sel.innerHTML = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
            if (curVal && sel.querySelector('option[value="' + curVal + '"]'))
                sel.value = curVal;
        });
    }

    // LOT 수량 재고 초과 방지 — 입력 즉시 차단
    function _validateLotQty(input) {
        var max = parseInt(input.max);
        if (isNaN(max) || max < 0) return;
        var val = Number(input.value);
        if (val > max) {
            input.value = max;
            // 입력 커서가 끝으로 가게 강제
            input.dispatchEvent(new Event('input', { bubbles: false }));
            // 인라인 경고 표시 (토스트 대신 필드 옆에 표시)
            var row = input.closest('.pw-lot-row');
            if (row) {
                var warn = row.querySelector('.pw-qty-warn');
                if (!warn) {
                    warn = document.createElement('div');
                    warn.className = 'pw-qty-warn';
                    warn.style.cssText = 'font-size:0.72rem;color:#dc2626;margin-top:2px;';
                    input.parentNode.appendChild(warn);
                }
                warn.textContent = '최대 ' + UIUtils.formatNumber(max) + ' EA (재고 초과)';
                clearTimeout(input._warnTimer);
                input._warnTimer = setTimeout(function() { warn.textContent = ''; }, 2500);
            }
        }
    }

    function _buildLotRow(lotsHtml, lotNo, qty) {
        // 선입선출: lotNo 미지정 시 selected 옵션 값(가장 오래된 LOT)을 자동 사용
        var autoLotNo = lotNo;
        if (!autoLotNo) {
            var m = lotsHtml.match(/<option value="([^"]+)"[^>]*selected/);
            if (!m) m = lotsHtml.match(/<option value="([^"]+)">/);
            if (m && m[1]) autoLotNo = m[1];
        }
        // 자동 선택 LOT의 잔량을 max로 설정
        var autoBalance = NaN;
        if (autoLotNo) {
            var bm = lotsHtml.match(new RegExp('value="' + autoLotNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*data-balance="(\\d+)"'));
            if (bm) autoBalance = parseInt(bm[1]);
        }
        const noVal = autoLotNo ? ' value="' + autoLotNo + '"' : '';
        const qtyVal = qty ? ' value="' + qty + '"' : '';
        const maxAttr = (!isNaN(autoBalance) && autoBalance >= 0) ? ' max="' + autoBalance + '" placeholder="최대 ' + UIUtils.formatNumber(autoBalance) + '"' : ' placeholder="수량"';
        return '<div class="pw-lot-row" style="margin-bottom:6px;">' +
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;align-items:center;">' +
            '<select class="form-select pw-lot-sel" style="font-size:0.84rem;"' +
            ' onchange="PaintingWorkModule.onLotRowSelect(this)">' +
            lotsHtml + '</select>' +
            '<input type="text" class="form-input pw-lot-no"' + noVal +
            ' placeholder="LOT번호 직접입력 (YYMMDD)" style="font-size:0.84rem;" maxlength="6"' +
            ' oninput="PaintingWorkModule._validateLotFormat(this)" onblur="PaintingWorkModule._checkLotFormat(this)">' +
            '<input type="number" class="form-input pw-lot-qty"' + qtyVal + maxAttr +
            ' min="0" style="font-size:0.84rem;text-align:right;"' +
            ' oninput="PaintingWorkModule._validateLotQty(this)">' +
            '<button class="btn btn-sm" title="삭제" onclick="PaintingWorkModule.removeLotRow(this)"' +
            ' style="background:transparent;color:var(--text-muted);border:1px solid var(--border);' +
            'border-radius:6px;padding:4px 6px;min-width:34px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;display:block;">remove</span>' +
            '</button></div>' +
            '<div class="pw-fifo-warn" style="display:none;margin-top:5px;padding:7px 10px;' +
            'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.5);border-radius:6px;">' +
            '<div style="display:flex;align-items:center;gap:4px;color:#b45309;font-weight:600;margin-bottom:6px;font-size:0.76rem;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;">warning</span>' +
            '<span class="pw-fifo-warn-msg"></span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<label style="font-size:0.76rem;color:#b45309;white-space:nowrap;font-weight:600;">' +
            '선입선출 미준수 사유&nbsp;<span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select pw-fifo-reason" style="font-size:0.8rem;flex:1;border-color:rgba(245,158,11,0.6);">' +
            '<option value="">-- 사유 선택 (필수) --</option>' +
            '<option value="자재 불량">자재 불량</option>' +
            '<option value="자재수량 부족">자재수량 부족</option>' +
            '</select></div>' +
            '</div>' +
            '</div>';
    }

    // LOT 행 추가 버튼
    function addLotRow() {
        var container = document.getElementById('pwLotRows');
        if (!container) return;
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var excludeLots = _getSelectedLotNos(null);
        var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
        container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, '', ''));
    }

    // LOT 행 제거
    function removeLotRow(btn) {
        const row = btn.closest('.pw-lot-row');
        const container = document.getElementById('pwLotRows');
        if (!row || !container) return;
        if (container.querySelectorAll('.pw-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
    }

    // LOT 드롭다운 → 직접입력 자동 채우기 + 선입선출 경고 체크
    function onLotRowSelect(sel) {
        if (!sel) return;
        const row = sel.closest('.pw-lot-row');
        if (!row) return;
        const inp = row.querySelector('.pw-lot-no');
        if (inp && sel.value) inp.value = sel.value;
        checkFifoWarning(row, sel);

        // data-balance에서 직접 max 설정 (DB 조회 불필요)
        const qtyInp = row.querySelector('.pw-lot-qty');
        if (qtyInp) {
            const selectedOpt = sel.options[sel.selectedIndex];
            const balance = selectedOpt ? parseInt(selectedOpt.getAttribute('data-balance')) : NaN;
            if (!isNaN(balance) && balance >= 0) {
                qtyInp.max = balance;
                qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(balance);
                // 현재 입력값이 max 초과면 즉시 차단
                if (Number(qtyInp.value) > balance) {
                    qtyInp.value = balance;
                }
            } else {
                qtyInp.removeAttribute('max');
                qtyInp.placeholder = '수량';
            }
        }

        _refreshOtherLotDropdowns(row);      // 다른 행 드롭다운 갱신
    }

    // 선입선출 경고 표시/숨김
    function checkFifoWarning(row, sel) {
        const warnEl = row.querySelector('.pw-fifo-warn');
        const msgEl  = row.querySelector('.pw-fifo-warn-msg');
        if (!warnEl || !msgEl) return;

        // 선택된 값이 없거나 첫 번째(가장 오래된) 옵션이면 정상
        const firstOpt = sel.options[0];
        if (!sel.value || !firstOpt || !firstOpt.value || sel.selectedIndex === 0) {
            warnEl.style.display = 'none';
            return;
        }

        // 첫 번째 옵션보다 최신 LOT를 선택 → 선입선출 위반
        msgEl.textContent = '선입선출 위반 — ' + firstOpt.value + ' 재고가 먼저 소진되어야 합니다.';
        warnEl.style.display = 'flex';
    }

    // LOT 행 데이터 수집
    function _collectLots() {
        const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
        const lots = [];
        rows.forEach(function(row) {
            const lotNo = (row.querySelector('.pw-lot-no') ? row.querySelector('.pw-lot-no').value : '').trim();
            const qty = Number(row.querySelector('.pw-lot-qty') ? row.querySelector('.pw-lot-qty').value : 0) || 0;
            const warnEl = row.querySelector('.pw-fifo-warn');
            const isFifoViolated = warnEl && warnEl.style.display !== 'none';
            const fifoReason = isFifoViolated
                ? ((row.querySelector('.pw-fifo-reason') || {}).value || '')
                : '';
            if (lotNo) lots.push({ lotNo, qty, fifoReason });
        });
        return lots;
    }

    // 평균 CT 계산·표시
    function calcCT() {
        const startEl = document.getElementById('addPwStartTime');
        const endEl = document.getElementById('addPwEndTime');
        const prodEl = document.getElementById('addPwProdQty');
        const ctEl = document.getElementById('pwCtInfo');
        if (!ctEl) return;
        const start = startEl ? startEl.value : '';
        const end = endEl ? endEl.value : '';
        const qty = Number(prodEl ? prodEl.value : 0) || 0;
        if (start && end && qty > 0) {
            const sh = parseInt(start.split(':')[0]),
                sm = parseInt(start.split(':')[1]);
            const eh = parseInt(end.split(':')[0]),
                em = parseInt(end.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin <= 0) {
                ctEl.innerHTML = '<span style="color:var(--accent-red);font-size:0.82rem;">시간 오류 확인</span>';
                return;
            }
            const ctSec = (totalMin * 60 / qty).toFixed(1);
            ctEl.innerHTML =
                '<span style="color:var(--accent-blue);font-weight:700;font-size:1.05rem;">' + ctSec + '초/EA</span>' +
                '<span style="color:var(--text-muted);font-size:0.76rem;margin-left:6px;">' +
                '(총 ' + totalMin + '분 / ' + UIUtils.formatNumber(qty) + ' EA)</span>';
        } else {
            ctEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">완료수량·시간 입력 시 자동계산</span>';
        }
    }

    // 계획 시간 변경 감지 → 사유 섹션 표시/숨김 (10분 이내 차이는 무시)
    function _timeToMin(t) {
        if (!t) return NaN;
        var parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    function onTimeChange() {
        var section = document.getElementById('pwTimeReasonSection');
        if (!section) return;
        var planStart = section.getAttribute('data-plan-start') || '';
        var planEnd = section.getAttribute('data-plan-end') || '';
        if (!planStart && !planEnd) return;
        var actualStart = (document.getElementById('addPwStartTime') || {}).value || '';
        var actualEnd = (document.getElementById('addPwEndTime') || {}).value || '';
        var diffStart = (planStart && actualStart) ? Math.abs(_timeToMin(actualStart) - _timeToMin(planStart)) : 0;
        var diffEnd   = (planEnd   && actualEnd)   ? Math.abs(_timeToMin(actualEnd)   - _timeToMin(planEnd))   : 0;
        var differs = diffStart > 10 || diffEnd > 10;
        section.style.display = differs ? 'block' : 'none';
    }

    // IN/OUT 수량 1% 초과 차이 감지 → 경고 표시 / 비고 필수 표시
    function checkQtyDiff() {
        var inQty  = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        var outQty = Number((document.getElementById('addPwProdQty')  || {}).value) || 0;
        var warn   = document.getElementById('qtyDiffWarning');
        var req    = document.getElementById('addPwNoteRequired');
        if (!warn) return;
        var exceed = inQty > 0 && Math.abs(inQty - outQty) / inQty > 0.01;
        warn.style.display = exceed ? 'block' : 'none';
        if (req) req.style.display = exceed ? 'inline' : 'none';
    }

    // 투입수량이 계획수량 대비 -5% 초과 미달일 때만 사유 섹션 표시
    function checkPlanQtyDiff() {
        var section = document.getElementById('pwPlanQtyReasonSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQty = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        // 투입수량이 계획수량의 95% 미만일 때만 표시 (5% 초과 미달)
        var threshold = planQty * 0.95;
        section.style.display = (inputQty > 0 && inputQty < threshold) ? 'block' : 'none';
    }

    // 초과 수량 비례로 작업 완료시간 재계산 (계획 CT 기준)
    function _recalcEndTimeForOverQty(actualQty, planQty) {
        var timeSection = document.getElementById('pwTimeReasonSection');
        if (!timeSection) return;
        var planStart = timeSection.getAttribute('data-plan-start') || '';
        var planEnd   = timeSection.getAttribute('data-plan-end')   || '';
        if (!planStart || !planEnd) return;

        var planStartMin = _timeToMin(planStart);
        var planEndMin   = _timeToMin(planEnd);
        var planDuration = planEndMin - planStartMin;  // 계획 총 작업시간(분)
        if (planDuration <= 0 || planQty <= 0) return;

        // 계획 CT(초) = 총시간(초) / 계획수량
        var planCT = (planDuration * 60) / planQty;
        // 예상 소요시간(분) = CT × 실제수량 / 60
        var newDuration = Math.round(planCT * actualQty / 60);

        // 실제 시작 시간 (사용자가 변경했을 수 있으므로 폼에서 읽음)
        var startEl  = document.getElementById('addPwStartTime');
        var startMin = startEl && startEl.value ? _timeToMin(startEl.value) : planStartMin;
        if (isNaN(startMin)) return;

        var newEndMin    = startMin + newDuration;
        var newEndHour   = Math.floor(newEndMin / 60) % 24;
        var newEndMinute = newEndMin % 60;
        var newEndTime   = String(newEndHour).padStart(2, '0') + ':' + String(newEndMinute).padStart(2, '0');

        var endEl = document.getElementById('addPwEndTime');
        if (endEl && endEl.value !== newEndTime) {
            endEl.value = newEndTime;
            // CT 재계산 + 시간변동 섹션 갱신
            calcCT();
            onTimeChange();
        }
    }

    // 투입/산출 수량이 계획수량 초과 시 경고 섹션 표시 + 완료시간 자동 재계산
    function checkOverPlanQty() {
        var section = document.getElementById('pwOverPlanSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQty = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        var outQty   = Number((document.getElementById('addPwProdQty')  || {}).value) || 0;
        var maxQty   = Math.max(inputQty, outQty);
        var overAmt  = maxQty - planQty;
        var show     = maxQty > planQty;
        section.style.display = show ? 'block' : 'none';
        if (show) {
            var msgEl = document.getElementById('pwOverPlanMsg');
            if (msgEl) {
                var which = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                            (inputQty > planQty ? '투입수량' : '산출수량');

                // 재계산된 완료시간 표시용
                var endEl = document.getElementById('addPwEndTime');
                var recalcNote = '';
                if (endEl) {
                    var timeSection = document.getElementById('pwTimeReasonSection');
                    var planEnd = timeSection ? timeSection.getAttribute('data-plan-end') : '';
                    if (planEnd && endEl.value && endEl.value !== planEnd) {
                        recalcNote = '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                            '<strong>' + endEl.value + '</strong>으로 자동 재계산되었습니다.' +
                            ' (계획 CT 기준, 계획 완료: ' + planEnd + ')</span>';
                    }
                }
                msgEl.innerHTML =
                    which + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote;
            }
            // 완료시간 자동 재계산
            _recalcEndTimeForOverQty(maxQty, planQty);
            // 재계산 후 msg 업데이트 (endEl.value가 바뀐 뒤)
            if (msgEl) {
                var endEl2 = document.getElementById('addPwEndTime');
                var ts2 = document.getElementById('pwTimeReasonSection');
                var planEnd2 = ts2 ? ts2.getAttribute('data-plan-end') : '';
                var which2 = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                             (inputQty > planQty ? '투입수량' : '산출수량');
                var recalcNote2 = (endEl2 && planEnd2 && endEl2.value !== planEnd2)
                    ? '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                      '<strong>' + endEl2.value + '</strong>으로 자동 재계산되었습니다.' +
                      ' (계획 CT 기준, 계획 완료: ' + planEnd2 + ')</span>'
                    : '';
                msgEl.innerHTML =
                    which2 + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote2;
            }
            // 체크 초기화
            var ck = document.getElementById('addPwOverPlanConfirm');
            if (ck) ck.checked = false;
        }
    }

    // ──────────────────────────────────────────────
    // 작업 등록 모달 (lg 크기, 계획 연동)
    // ──────────────────────────────────────────────
    function openAddModal(prefill) {
        var p = prefill || {};
        var carModel = p.carModel || '';
        var partName = p.partName || '';
        var color = p.color || '';
        var planQty = Number(p.planQty) || 0;
        var planId = p.planId || '';
        var planStartTime = p.planStartTime || '';
        var planEndTime = p.planEndTime || '';
        var achievedQty = Number(p.achievedQty) || 0;

        // 사출자재 마스터에서 제작품명1/2 + 컬러 매칭 → 사출명 자동 결정
        // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 무관 폴백 포함
        var injParts = partName ? getInjPartNamesForProduct(partName, carModel, color) : [];
        if (injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', color);
        if (injParts.length === 0 && partName) injParts = getInjPartNamesForProduct(partName, carModel, '');
        if (injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', '');
        var autoInjPartName = injParts.length === 1 ? injParts[0].injPartName : '';
        var injPartOptsHtml = buildInjPartOptionsHtml(partName, carModel, color);
        // autoInjPartName 없을 때: partName은 제품명이므로 사출 창고 조회 불가 → carModel 전체 조회
        var lotsHtml = autoInjPartName ?
            buildLotOptionsHtmlByInjPart(autoInjPartName, color) :
            buildLotOptionsHtml(carModel, '');
        var initialLotRow = _buildLotRow(lotsHtml, '', '');
        // LOT 추가 버튼 활성화 여부: 사출 창고에 LOT가 2개 이상일 때만 가능
        var initialLotCount = autoInjPartName ?
            getInjectionLotsByInjPart(autoInjPartName, color).length :
            getInjectionLots(carModel, '').length;

        var planQtyFmt = UIUtils.formatNumber(planQty);
        var achFmt = UIUtils.formatNumber(achievedQty);
        var achRate = planQty > 0 ? Math.min(100, Math.round(achievedQty / planQty * 100)) : 0;
        var achColor = achRate >= 100 ? 'var(--accent-green)' :
            achRate >= 70 ? 'var(--accent-blue)' :
            achRate > 0 ? 'var(--accent-orange)' :
            'var(--text-muted)';
        var planTimeLabel = planStartTime ?
            planStartTime + (planEndTime ? ' ~ ' + planEndTime : '') :
            '';

        var effectiveLine = p.line || _currentLine;

        // ① 배너: 차종/품명(2.2fr) | 컬러(0.7fr) | 계획·달성(1.1fr)
        var bannerHtml =
            '<div style="background:linear-gradient(135deg,rgba(66,133,244,0.09) 0%,rgba(66,133,244,0.03) 100%);' +
            'border:1px solid rgba(66,133,244,0.22);border-radius:10px;padding:14px 18px;margin-bottom:16px;">' +
            '<div style="display:grid;grid-template-columns:2.2fr 0.7fr 1.1fr;gap:16px;margin-bottom:9px;align-items:start;">' +

            // 차종/품명 (넓게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">차종 / 품명</div>' +
            '<div style="font-weight:700;font-size:1.02rem;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (carModel || '-') + ' <span style="color:var(--text-muted);font-weight:400;">/</span> ' + (partName || '-') + '</div></div>' +

            // 컬러 (좁게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">컬러</div>' +
            '<div style="font-weight:600;font-size:0.92rem;">' + (color || '-') + '</div></div>' +

            // 계획수량 + 달성현황
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">계획수량 / 달성현황</div>' +
            '<div style="font-weight:700;font-size:1.15rem;color:var(--accent-blue);line-height:1.2;">' + planQtyFmt + ' <span style="font-size:0.75rem;font-weight:400;">EA</span></div>' +
            (planId ?
                '<div style="margin-top:5px;">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + achRate + '%;height:100%;background:' + achColor + ';border-radius:3px;"></div></div>' +
                '<span style="color:' + achColor + ';font-weight:700;font-size:0.82rem;min-width:36px;text-align:right;">' + achRate + '%</span></div>' +
                '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">달성: ' + achFmt + ' EA</div>' +
                '</div>' :
                '') +
            '</div>' +

            '</div>' +
            '<div style="font-size:0.79rem;color:var(--text-secondary);border-top:1px solid rgba(66,133,244,0.15);padding-top:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">event</span>' +
            _currentDate + ' &nbsp;·&nbsp; ' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">factory</span>' +
            effectiveLine +
            (planTimeLabel ? ' &nbsp;·&nbsp; <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">schedule</span>계획: ' + planTimeLabel : '') +
            (planId ? ' &nbsp;<span style="background:rgba(66,133,244,0.12);color:var(--accent-blue);border-radius:4px;padding:1px 7px;font-size:0.73rem;margin-left:4px;">계획 연동</span>' : '') +
            '</div></div>';

        // ② 수량 행
        var qtyRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입수량 (IN PUT) <span style="color:var(--accent-red)">*</span>' +
            '<span style="color:var(--text-muted);font-size:0.75rem;"> 계획: ' + planQtyFmt + '</span></label>' +
            '<input type="number" class="form-input" id="addPwInputQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkPlanQtyDiff(); PaintingWorkModule.checkOverPlanQty();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">산출 수량 (OUT PUT) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwProdQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.calcCT(); PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkOverPlanQty();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입인원 (명) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwWorkers" min="0" placeholder="0"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '</div>';

        // ③ 시간 행 — 계획시간 자동 반영, 힌트 표시
        var timeRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:12px;margin-bottom:10px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">play_arrow</span> ' +
            '작업 시작시간</label>' +
            '<input type="time" class="form-input" id="addPwStartTime"' +
            ' value="' + planStartTime + '"' +
            ' oninput="PaintingWorkModule.calcCT(); PaintingWorkModule.onTimeChange();">' +
            (planStartTime ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planStartTime + '</div>' : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">stop</span> ' +
            '작업 완료시간</label>' +
            '<input type="time" class="form-input" id="addPwEndTime"' +
            ' value="' + planEndTime + '"' +
            ' oninput="PaintingWorkModule.calcCT(); PaintingWorkModule.onTimeChange();">' +
            (planEndTime ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planEndTime + '</div>' : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">timer</span> ' +
            '평균 CT (자동계산)</label>' +
            '<div id="pwCtInfo" style="height:36px;display:flex;align-items:center;">' +
            '<span style="color:var(--text-muted);font-size:0.8rem;">완료수량·시간 입력 시 자동계산</span></div>' +
            (planStartTime && planEndTime ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">시간 변경 시 사유 입력 필요</div>' : '') +
            '</div>' +

            '</div>';

        // ④ 계획 시간 변경 사유 섹션 (초기 hidden, 시간 변경 시 표시)
        var reasonHtml =
            '<div id="pwTimeReasonSection"' +
            ' data-plan-start="' + planStartTime + '"' +
            ' data-plan-end="' + planEndTime + '"' +
            ' style="display:none;margin-bottom:14px;' +
            'background:rgba(255,152,0,0.07);border:1px solid rgba(255,152,0,0.35);' +
            'border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#e65100;font-weight:600;margin-bottom:10px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">warning</span>' +
            '계획 시간과 다릅니다' +
            (planTimeLabel ? ' &nbsp;<span style="font-weight:400;color:#b26a00;">(계획: ' + planTimeLabel + ')</span>' : '') +
            ' — 변경 사유를 선택해 주세요' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">변경 사유 <span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select" id="addPwTimeReason" style="font-size:0.85rem;">' +
            '<option value="">선택</option>' +
            '<option value="ITEM 교체">ITEM 교체</option>' +
            '<option value="설비 속도 저하">설비 속도 저하</option>' +
            '<option value="순간정지(공정문제)">순간정지(공정문제)</option>' +
            '<option value="품질 문제">품질 문제</option>' +
            '<option value="설비고장">설비고장</option>' +
            '</select></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">상세 내용</label>' +
            '<input type="text" class="form-input" id="addPwTimeReasonDetail"' +
            ' placeholder="구체적인 내용 (예: 컬러교체 청소, 아이템 교체, 자재 부족)"' +
            ' style="font-size:0.85rem;"></div>' +
            '</div>' +
            '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
            '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
            '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 생산 시간 변동 내용을 작업 관리자에게 즉시 보고해 주세요.' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
            '<input type="checkbox" id="addPwManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;">' +
            '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
            '</label>' +
            '</div>' +
            '</div>';

        // ⑤ LOT 섹션
        var lotSectionHtml =
            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label" style="font-size:0.84rem;display:flex;align-items:center;gap:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">inventory_2</span>' +
            '사출 LOT' +
            '<span style="background:var(--accent-blue);color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:10px;font-weight:600;">선입선출</span>' +
            '<span style="color:var(--text-muted);font-size:0.74rem;">(사출 창고 잔량 기준 조회 · 복수 LOT 입력 가능)</span></label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            // 사출명 선택 행
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:9px;' +
            'border-bottom:1px solid var(--border);">' +
            '<label style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;font-weight:600;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">conveyor_belt</span>' +
            '사출명</label>' +
            '<select id="pwInjPartSelect" class="form-select" style="font-size:0.84rem;flex:1;"' +
            ' onchange="PaintingWorkModule.onInjPartSelect(this)">' +
            injPartOptsHtml + '</select>' +
            '</div>' +
            // LOT 행 헤더
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div>사출 창고 LOT 선택</div><div>LOT번호 (직접입력 가능)</div>' +
            '<div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRow + '</div>' +
            '<button id="pwAddLotBtn" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;"' +
            (initialLotCount <= 1 ? ' disabled title="사출 창고 LOT가 1개 이하여서 추가할 수 없습니다"' : '') + '>' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>';

        // ⑥-A 계획수량 초과 경고 섹션 (투입/산출 > 계획수량 시 표시)
        var overPlanHtml = planQty > 0
            ? '<div id="pwOverPlanSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.55);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.84rem;color:#b45309;font-weight:700;margin-bottom:8px;">' +
              '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">warning</span>' +
              '⚠ 계획수량 초과 경고' +
              '</div>' +
              '<div id="pwOverPlanMsg" style="font-size:0.83rem;color:#92400e;margin-bottom:12px;line-height:1.55;"></div>' +
              '<div style="background:rgba(245,158,11,0.13);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<input type="checkbox" id="addPwOverPlanConfirm" style="width:18px;height:18px;accent-color:#d97706;flex-shrink:0;">' +
              '<label for="addPwOverPlanConfirm" style="font-size:0.83rem;color:#92400e;cursor:pointer;font-weight:600;line-height:1.4;">' +
              '계획수량 초과 내용을 확인하였으며, 담당 관리자에게 보고하였습니다' +
              '</label>' +
              '</div>' +
              '</div>'
            : '';

        // ⑥ 계획 미달 사유 섹션 (산출수량 < 계획수량일 때 표시)
        var planQtyReasonHtml = planQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">trending_down</span>' +
              '투입수량이 계획수량(<strong>' + planQtyFmt + ' EA</strong>) 대비 5% 이상 미달 — 사유를 입력해 주세요' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
              '<select class="form-select" id="addPwPlanReason" style="font-size:0.85rem;">' +
              '<option value="">-- 선택 --</option>' +
              '<option value="계획변경">계획변경</option>' +
              '<option value="순간정지(공정문제)">순간정지(공정문제)</option>' +
              '<option value="설비 속도저하">설비 속도저하</option>' +
              '<option value="설비고장">설비고장</option>' +
              '<option value="품질문제">품질문제</option>' +
              '<option value="자재결품">자재결품</option>' +
              '</select></div>' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
              '<input type="text" class="form-input" id="addPwPlanReasonDetail"' +
              ' placeholder="구체적인 내용을 입력하세요"' +
              ' style="font-size:0.85rem;"></div>' +
              '</div></div>'
            : '';

        // ⑦ 비고
        var noteHtml =
            '<div id="qtyDiffWarning" style="display:none;background:rgba(239,68,68,0.08);border:1px solid var(--accent-red);border-radius:6px;padding:7px 12px;margin-bottom:8px;font-size:0.82rem;color:var(--accent-red);font-weight:600;">' +
            '⚠ 투입수량과 산출수량 다시 확인 — 비고란에 사유를 입력해 주세요.</div>' +
            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">비고 <span id="addPwNoteRequired" style="display:none;color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="addPwNote" placeholder="특이사항 / 변동 사항"></div>';

        // ⑦ 숨김 필드
        var hiddenHtml =
            '<input type="hidden" id="addPwCarModelHidden" value="' + carModel + '">' +
            '<input type="hidden" id="addPwPartNameHidden" value="' + partName + '">' +
            '<input type="hidden" id="addPwColorHidden"    value="' + color + '">' +
            '<input type="hidden" id="addPwDateHidden"     value="' + _currentDate + '">' +
            '<input type="hidden" id="addPwLineHidden"     value="' + effectiveLine + '">' +
            '<input type="hidden" id="addPwPlanId"         value="' + planId + '">';

        UIUtils.showModal('도장 작업 실적 등록',
            bannerHtml + hiddenHtml + qtyRowHtml + timeRowHtml + reasonHtml + lotSectionHtml + overPlanHtml + planQtyReasonHtml + noteHtml,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveNew()">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 등록</button>',
            'lg');

        // 계획 CT 자동계산 (계획 시간이 이미 채워진 경우)
        if (planStartTime && planEndTime) {
            setTimeout(function() {
                PaintingWorkModule.calcCT();
            }, 60);
        }
    }

    // 계획에서 실적 등록 모달 열기
    function openAddModalFromPlan(planId) {
        var plan = Storage.getById(PLAN_STORE, planId);
        if (!plan) {
            UIUtils.toast('계획 정보를 찾을 수 없습니다.', 'warning');
            return;
        }

        // ⚠️ 이미 이 계획에 실적이 있는지 확인 (중복 등록 방지)
        var existingWorks = (Storage.getAll(STORE) || []).filter(function(w) {
            return w.planId === planId;
        });
        if (existingWorks.length > 0) {
            UIUtils.toast('이 계획에는 이미 실적이 등록되어 있습니다.', 'warning');
            return;
        }

        // 이미 달성된 수량 계산 (같은 날짜·라인·품목)
        var allWorks = Storage.getAll(STORE) || [];
        var achievedQty = allWorks.filter(function(w) {
            return w.date === plan.date && w.line === plan.line &&
                w.carModel === plan.carModel && w.partName === plan.partName &&
                w.color === plan.color;
        }).reduce(function(s, w) {
            return s + (Number(w.productionQty) || 0);
        }, 0);

        openAddModal({
            line: plan.line || '',
            carModel: plan.carModel || '',
            partName: plan.partName || '',
            color: plan.color || '',
            planQty: plan.planQty || 0,
            planId: plan.id,
            planStartTime: plan.startTime || '',
            planEndTime: plan.endTime || '',
            achievedQty: achievedQty
        });
    }

    // 신규 저장
    async function saveNew() {
        // 투입수량 / 산출수량 / 투입인원 필수 검증
        var _inputQtyEl  = document.getElementById('addPwInputQty');
        var _prodQtyEl   = document.getElementById('addPwProdQty');
        var _workersEl   = document.getElementById('addPwWorkers');
        var _inputQtyV   = Number((_inputQtyEl  || {}).value) || 0;
        var _prodQtyV    = Number((_prodQtyEl   || {}).value) || 0;
        var _workersV    = Number((_workersEl   || {}).value) || 0;
        if (!_inputQtyV) {
            UIUtils.toast('투입수량(IN PUT)을 입력해 주세요.', 'warning');
            if (_inputQtyEl) _inputQtyEl.focus();
            return;
        }
        if (!_prodQtyV) {
            UIUtils.toast('산출수량(OUT PUT)을 입력해 주세요.', 'warning');
            if (_prodQtyEl) _prodQtyEl.focus();
            return;
        }
        if (!_workersV) {
            UIUtils.toast('투입인원(명)을 입력해 주세요.', 'warning');
            if (_workersEl) _workersEl.focus();
            return;
        }

        var lots = _collectLots();

        // 사출 LOT 필수 검증
        if (lots.length === 0) {
            UIUtils.toast('사출 LOT를 선택하거나 직접 입력해 주세요.', 'warning');
            var firstLotNo = document.querySelector('#pwLotRows .pw-lot-no');
            if (firstLotNo) firstLotNo.focus();
            return;
        }
        var hasInvalidLot = lots.some(function(l) { return !l.qty || l.qty <= 0; });
        if (hasInvalidLot) {
            UIUtils.toast('사출 LOT 수량을 입력해 주세요.', 'warning');
            var firstLotQty = document.querySelector('#pwLotRows .pw-lot-qty');
            if (firstLotQty) firstLotQty.focus();
            return;
        }

        // 선입선출 위반 시 사유 필수 검증
        var fifoViolatedRows = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            var warnEl = row.querySelector('.pw-fifo-warn');
            if (warnEl && warnEl.style.display !== 'none') {
                var reasonSel = row.querySelector('.pw-fifo-reason');
                if (!reasonSel || !reasonSel.value) fifoViolatedRows.push(reasonSel);
            }
        });
        if (fifoViolatedRows.length > 0) {
            UIUtils.toast('선입선출 미준수 사유를 선택해 주세요.', 'warning');
            if (fifoViolatedRows[0]) fifoViolatedRows[0].focus();
            return;
        }

        var lotNo = lots[0].lotNo;
        var startTime = (document.getElementById('addPwStartTime') || {}).value || '';
        var endTime = (document.getElementById('addPwEndTime') || {}).value || '';
        var prodQty = Number((document.getElementById('addPwProdQty') || {}).value) || 0;

        var avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            var sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            var eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            var totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        // 사유 섹션 표시 중인지 확인 (표시 중이면 사유 필수)
        var reasonSection = document.getElementById('pwTimeReasonSection');
        var reasonVisible = reasonSection && reasonSection.style.display !== 'none';
        var timeReason = ((document.getElementById('addPwTimeReason') || {}).value || '').trim();
        var timeReasonDetail = ((document.getElementById('addPwTimeReasonDetail') || {}).value || '').trim();
        if (reasonVisible && !timeReason) {
            UIUtils.toast('계획 시간 변경 사유를 선택해 주세요.', 'warning');
            return;
        }
        // 시간 변동 → 관리자 통보 완료 체크 필수
        if (reasonVisible) {
            var managerNotifiedChk = document.getElementById('addPwManagerNotified');
            if (!managerNotifiedChk || !managerNotifiedChk.checked) {
                UIUtils.toast('시간 변동 내용을 관리자에게 통보 후 "통보 완료"를 체크해 주세요.', 'warning');
                if (managerNotifiedChk) managerNotifiedChk.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // 계획수량 초과 → 확인 체크 필수
        var overPlanSection = document.getElementById('pwOverPlanSection');
        var overPlanVisible = overPlanSection && overPlanSection.style.display !== 'none';
        if (overPlanVisible) {
            var overPlanConfirm = document.getElementById('addPwOverPlanConfirm');
            if (!overPlanConfirm || !overPlanConfirm.checked) {
                UIUtils.toast('계획수량 초과 내용을 확인하고 관리자 보고 체크박스를 선택해 주세요.', 'warning');
                if (overPlanConfirm) overPlanConfirm.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // IN/OUT 1% 초과 차이 → 비고 필수
        var inputQtyVal  = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        var noteVal = ((document.getElementById('addPwNote') || {}).value || '').trim();
        if (inputQtyVal > 0 && Math.abs(inputQtyVal - prodQty) / inputQtyVal > 0.01 && !noteVal) {
            UIUtils.toast('투입/산출 수량 차이가 1% 초과입니다. 비고란에 사유를 입력해 주세요.', 'warning');
            var noteEl = document.getElementById('addPwNote');
            if (noteEl) noteEl.focus();
            return;
        }

        // 계획 미달 사유 필수 검증
        var planReasonSection = document.getElementById('pwPlanQtyReasonSection');
        var planReasonVisible = planReasonSection && planReasonSection.style.display !== 'none';
        var planReason = ((document.getElementById('addPwPlanReason') || {}).value || '').trim();
        var planReasonDetail = ((document.getElementById('addPwPlanReasonDetail') || {}).value || '').trim();
        if (planReasonVisible && !planReason) {
            UIUtils.toast('계획 미달 사유구분을 선택해 주세요.', 'warning');
            var prEl = document.getElementById('addPwPlanReason');
            if (prEl) prEl.focus();
            return;
        }
        if (planReasonVisible && !planReasonDetail) {
            UIUtils.toast('계획 미달 세부 사유를 입력해 주세요.', 'warning');
            var prdEl = document.getElementById('addPwPlanReasonDetail');
            if (prdEl) prdEl.focus();
            return;
        }

        var data = {
            date: (document.getElementById('addPwDateHidden') || {}).value || _currentDate,
            line: (document.getElementById('addPwLineHidden') || {}).value || _currentLine,
            carModel: (document.getElementById('addPwCarModelHidden') || {}).value || '',
            partName: (document.getElementById('addPwPartNameHidden') || {}).value || '',
            color: (document.getElementById('addPwColorHidden') || {}).value || '',
            planId: (document.getElementById('addPwPlanId') || {}).value || '',
            lotNo: lotNo,
            lots: lots,
            inputQty: Number((document.getElementById('addPwInputQty') || {}).value) || 0,
            productionQty: prodQty,
            goodQty: 0,
            defectQty: 0,
            workers: Number((document.getElementById('addPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            timeReason: timeReason,
            timeReasonDetail: timeReasonDetail,
            managerNotified: reasonVisible ? true : false,
            overPlanQty: overPlanVisible ? true : false,
            planReason: planReasonVisible ? planReason : '',
            planReasonDetail: planReasonVisible ? planReasonDetail : '',
            note: ((document.getElementById('addPwNote') || {}).value || '').trim()
        };

        if (!data.date) {
            UIUtils.toast('날짜 정보가 없습니다.', 'warning');
            return;
        }

        // 사출 재고 초과 여부 최종 검증
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = data.carModel, pn = data.partName;

        // injPartName 미선택 시 사출자재 마스터에서 자동 탐색
        // 컬러 일치 우선, 없으면 컬러 무관 폴백 (도장 컬러 ≠ 사출 소재 컬러 대응)
        var _saveColor = data.color || '';
        if (!injPartName) {
            var _mats = Storage.getAll(INJECTMAT_STORE) || [];
            var _found = _mats.find(function(m) {
                var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                var modelMatch = !cm || m.carModel === cm;
                var colorMatch = _injColorMatches(m.injColor, _saveColor);
                return nameMatch && modelMatch && colorMatch && m.injPartName;
            });
            // 폴백: 컬러 불일치 시 품명+차종만으로 매칭 (DYS→GRAY 등)
            if (!_found) {
                _found = _mats.find(function(m) {
                    var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                    var modelMatch = !cm || m.carModel === cm;
                    return nameMatch && modelMatch && m.injPartName;
                });
            }
            if (_found) {
                injPartName = _found.injPartName;
            }
        }

        var allLots = injPartName ? getInjectionLotsByInjPart(injPartName, _saveColor) : getInjectionLots(cm, pn);

        for (var vi = 0; vi < data.lots.length; vi++) {
            var vl = data.lots[vi];
            if (!vl.lotNo || !vl.qty) continue;
            var vLotInfo = allLots.find(function(l) { return l.lotNo === vl.lotNo; });
            if (vLotInfo && vl.qty > vLotInfo.balance) {
                vl.qty = vLotInfo.balance; // 초과분 조용히 잔량으로 대체
            }
        }

        var savedWork = await Storage.add(STORE, data);
        var workId = savedWork ? savedWork.id : null;

        // 사출 창고 재고 차감 (LOT별 출고 처리, workId 연결)
        // ★ Fix: 출고 기록에 color 저장 — 입고 기록의 color와 동일한 LOT 키로 합산되도록
        //   LOT의 원래 입고 기록에서 color 조회 (없으면 작업의 product color 사용)
        var _injInvAll = Storage.getAll(INJ_INV_STORE) || [];
        for (var di = 0; di < data.lots.length; di++) {
            var dl = data.lots[di];
            if (!dl.lotNo || !dl.qty) continue;
            var dlInfo = allLots.find(function(l) { return l.lotNo === dl.lotNo; });
            var effectivePartName = (dlInfo && dlInfo.partName) || injPartName || data.partName;

            // LOT 원래 입고 기록에서 color 조회
            var _origRec = _injInvAll.find(function(r) {
                return r.lotNo === dl.lotNo
                    && r.partName === effectivePartName
                    && r.type !== '출고';
            });
            var dlColor = (_origRec && _origRec.color) ? _origRec.color : (data.color || '');

            await Storage.add(INJ_INV_STORE, {
                date: data.date,
                lotNo: dl.lotNo,
                partName: effectivePartName,
                color: dlColor,
                carModel: data.carModel,
                quantity: dl.qty,
                type: '출고',
                source: '도장 작업 출고',
                refWorkId: workId
            });
        }

        UIUtils.closeModal();

        // ⚠️ 계획 상태를 '완료'로 변경 (중복 실적 입력 방지)
        if (data.planId) {
            var plan = Storage.getById(PLAN_STORE, data.planId);
            if (plan) {
                plan.status = '완료';
                await Storage.update(PLAN_STORE, data.planId, plan);
            }
        }

        // JIG 사용 자동 기록
        if (typeof JigModule !== 'undefined' && JigModule.addUsageFromWork) {
            JigModule.addUsageFromWork(savedWork);
        }

        UIUtils.toast('작업 실적이 등록되었습니다.', 'success');
        loadAll();
    }

    // ──────────────────────────────────────────────
    // 수정 모달 (lg)
    // ──────────────────────────────────────────────
    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const lotsHtml = buildLotOptionsHtml(d.carModel, d.partName);
        const existLots = (d.lots && d.lots.length > 0) ?
            d.lots :
            (d.lotNo ? [{
                lotNo: d.lotNo,
                qty: 0
            }] : [{
                lotNo: '',
                qty: 0
            }]);
        const initialLotRows = existLots.map(function(l) {
            return _buildLotRow(lotsHtml, l.lotNo, l.qty);
        }).join('');

        UIUtils.showModal('도장 작업 수정',
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">차종</label>' +
            '<input type="text" class="form-input" id="editPwCarModel" value="' + (d.carModel || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">품명</label>' +
            '<input type="text" class="form-input" id="editPwPartName" value="' + (d.partName || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">컬러</label>' +
            '<input type="text" class="form-input" id="editPwColor" value="' + (d.color || '') + '"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입수량 (IN PUT)</label>' +
            '<input type="number" class="form-input" id="editPwInputQty" value="' + (d.inputQty || 0) + '" style="text-align:right;font-weight:600;"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">산출 수량 (OUT PUT)</label>' +
            '<input type="number" class="form-input" id="editPwProdQty" value="' + (d.productionQty || 0) + '" style="text-align:right;font-weight:600;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입인원 (명)</label>' +
            '<input type="number" class="form-input" id="editPwWorkers" value="' + (d.workers || 0) + '" style="text-align:right;font-weight:600;"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 시작시간</label>' +
            '<input type="time" class="form-input" id="editPwStartTime" value="' + (d.startTime || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 완료시간</label>' +
            '<input type="time" class="form-input" id="editPwEndTime" value="' + (d.endTime || '') + '"></div></div>' +

            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label" style="font-size:0.84rem;">사출 LOT</label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div>사출 창고 LOT 선택</div><div>LOT번호</div><div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRows + '</div>' +
            '<button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>' +

            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.83rem;">비고</label>' +
            '<input type="text" class="form-input" id="editPwNote" value="' + (d.note || '') + '"></div>',

            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveEdit(\'' + id + '\')">저장</button>',
            'lg');

        // 기존 LOT 드롭다운 매칭
        setTimeout(function() {
            const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
            existLots.forEach(function(l, i) {
                if (!l.lotNo || !rows[i]) return;
                const sel = rows[i].querySelector('.pw-lot-sel');
                if (!sel) return;
                for (var j = 0; j < sel.options.length; j++) {
                    if (sel.options[j].value === l.lotNo) {
                        sel.value = l.lotNo;
                        break;
                    }
                }
            });
        }, 60);
    }

    async function saveEdit(id) {
        const lots = _collectLots();
        const lotNo = lots.length > 0 ? lots[0].lotNo : '';
        const startTime = (document.getElementById('editPwStartTime') || {}).value || '';
        const endTime = (document.getElementById('editPwEndTime') || {}).value || '';
        const prodQty = Number((document.getElementById('editPwProdQty') || {}).value) || 0;

        let avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            const sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            const eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        await Storage.update(STORE, id, {
            carModel: ((document.getElementById('editPwCarModel') || {}).value || '').trim(),
            partName: ((document.getElementById('editPwPartName') || {}).value || '').trim(),
            color: ((document.getElementById('editPwColor') || {}).value || '').trim(),
            lotNo: lotNo,
            lots: lots,
            inputQty: Number((document.getElementById('editPwInputQty') || {}).value) || 0,
            productionQty: prodQty,
            workers: Number((document.getElementById('editPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            note: ((document.getElementById('editPwNote') || {}).value || '').trim()
        });
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadAll();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            var work = Storage.getById(STORE, id);
            await Storage.remove(STORE, id);

            // 사출 창고 재고 복원: refWorkId로 연결된 출고 기록을 찾아 입고 역처리
            if (work) {
                var invAll = Storage.getAll(INJ_INV_STORE) || [];
                var deductions = invAll.filter(function(r) {
                    return r.source === '도장 작업 출고' && r.refWorkId === id;
                });
                // refWorkId 기록이 없으면 lots 기반으로 복원 (구버전 호환)
                if (deductions.length === 0 && work.lots && work.lots.length > 0) {
                    deductions = work.lots.filter(function(l) { return l.lotNo && l.qty; })
                        .map(function(l) { return { lotNo: l.lotNo, quantity: l.qty, partName: work.partName, carModel: work.carModel }; });
                }
                for (var ri = 0; ri < deductions.length; ri++) {
                    var d = deductions[ri];
                    if (!d.lotNo || !d.quantity) continue;
                    await Storage.add(INJ_INV_STORE, {
                        date: work.date,
                        lotNo: d.lotNo,
                        partName: d.partName || work.partName,
                        carModel: d.carModel || work.carModel,
                        quantity: d.quantity,
                        type: '입고',
                        source: '도장 작업 삭제 복원',
                        refWorkId: id
                    });
                }
            }

            // ⚠️ 삭제된 실적의 계획 상태를 '대기'로 되돌림
            if (work && work.planId) {
                var plan = Storage.getById(PLAN_STORE, work.planId);
                if (plan) {
                    plan.status = '대기';
                    await Storage.update(PLAN_STORE, work.planId, plan);
                }
            }

            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function search() {
        loadAll();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['작업일', '라인', '차종', '품명', '컬러', '사출LOT', '투입수량', '완료수량', '양품수량', '불량수량', '투입인원', '시작시간', '완료시간', '평균CT(초)', '비고'];
        const rows = data.map(d => {
            const lotStr = (d.lots && d.lots.length > 0) ?
                d.lots.map(l => l.lotNo + (l.qty ? '(' + l.qty + ')' : '')).join(' / ') :
                (d.lotNo || '');
            return [d.date, d.line, d.carModel, d.partName, d.color, lotStr,
                d.inputQty, d.productionQty, d.goodQty, d.defectQty,
                d.workers || 0, d.startTime || '', d.endTime || '', d.avgCT || 0, d.note || ''
            ];
        });
        Storage.exportToCSV(headers, rows, '도장작업일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // LOT 번호 형식 검증 (입력 시)
    function _validateLotFormat(input) {
        // 숫자만 남기기
        input.value = input.value.replace(/[^0-9]/g, '');
        // 최대 6글자
        if (input.value.length > 6) {
            input.value = input.value.substring(0, 6);
        }
    }

    // LOT 번호 형식 검증 (포커스 아웃 시)
    function _checkLotFormat(input) {
        const value = input.value.trim();
        if (!value) return; // 빈 값은 허용

        if (value.length !== 6) {
            UIUtils.toast('LOT번호는 YYMMDD 형식으로 6자리여야 합니다', 'warning');
            input.focus();
            return;
        }

        const yy = parseInt(value.substring(0, 2));
        const mm = parseInt(value.substring(2, 4));
        const dd = parseInt(value.substring(4, 6));

        // 월 범위 검증 (01~12)
        if (mm < 1 || mm > 12) {
            UIUtils.toast('월(MM)은 01~12 범위여야 합니다', 'warning');
            input.focus();
            return;
        }

        // 일 범위 검증 (01~31)
        if (dd < 1 || dd > 31) {
            UIUtils.toast('일(DD)은 01~31 범위여야 합니다', 'warning');
            input.focus();
            return;
        }
    }

    // 계획 삭제 함수 (사유 입력)
    function deletePlan(planId, date, line, time) {
        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);margin-right:4px;">delete_outline</span> 계획 삭제',
            `
                <div style="margin-bottom:16px;">
                    <p style="margin:0 0 8px 0; color:var(--text-secondary);">
                        <strong>${date}</strong> ${line} <strong>${time}</strong> 의 계획을 삭제하시겠습니까?
                    </p>
                    <p style="color:var(--accent-red); font-size:0.85rem; margin:0;">
                        ⚠️ 이 작업은 되돌릴 수 없습니다.
                    </p>
                </div>
                <div class="form-group">
                    <label class="form-label">삭제 사유</label>
                    <textarea class="form-input" id="deletePlanReason" placeholder="삭제 사유를 입력하세요 (예: 중복 등록, 계획 변경, 오입력 등)" style="resize:vertical; min-height:80px;"></textarea>
                </div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-danger" onclick="PaintingWorkModule.confirmDeletePlan('${planId}', '${date}', '${line}')">
                    <span class="material-symbols-outlined" style="vertical-align:middle;">delete</span> 삭제
                </button>
            `
        );

        // 포커스 설정
        setTimeout(() => {
            const reasonInput = document.getElementById('deletePlanReason');
            if (reasonInput) reasonInput.focus();
        }, 100);
    }

    // 계획 삭제 확인
    async function confirmDeletePlan(planId, date, line) {
        const reasonInput = document.getElementById('deletePlanReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!reason) {
            UIUtils.toast('삭제 사유를 입력해주세요.', 'warning');
            if (reasonInput) reasonInput.focus();
            return;
        }

        try {
            // 계획 삭제
            await Storage.remove(PLAN_STORE, planId);

            // 삭제 이력 기록 (로그)
            const logData = {
                date: UIUtils.today(),
                time: new Date().toLocaleTimeString('ko-KR'),
                type: '계획삭제',
                planDate: date,
                line: line,
                planId: planId,
                reason: reason
            };
            console.log('계획 삭제 이력:', logData);

            UIUtils.closeModal();
            UIUtils.toast('계획이 삭제되었습니다.', 'success');
            loadAll();
        } catch (error) {
            UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            console.error('계획 삭제 오류:', error);
        }
    }

    return {
        render,
        search,
        setLine,
        onDateChange,
        loadAll,
        renderPlanSummary,
        renderUnenteredPlans,
        renderWorkList,
        openAddModal,
        openAddModalFromPlan,
        addLotRow,
        removeLotRow,
        onLotRowSelect,
        checkFifoWarning,
        onInjPartSelect,
        calcCT,
        onTimeChange,
        checkQtyDiff,
        checkPlanQtyDiff,
        checkOverPlanQty,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData,
        deletePlan,
        confirmDeletePlan,
        _validateLotFormat,
        _checkLotFormat,
        _validateLotQty
    };
})();


// ===================================================================
// 도장 검사 (불량 집계) - 생산 계획 지시서 연동
// ===================================================================
const PaintingInspectionModule = (function() {
    const STORE = DB.STORES.PAINTING_INSPECTIONS;
    const DEFECT_STORE = DB.STORES.DEFECT_TYPES;
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;
    const PAINTING_WORK_STORE = DB.STORES.PAINTING_WORK;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;

    // 현재 카운팅 상태
    let state = {
        selectedProduct: null,
        selectedPlan: null,
        selectedWork: null, // 도장 작업 완료에서 선택한 작업
        counts: {},
        currentTab: 'inspection' // 'inspection' | 'completion' | 'statistics'
    };

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-secondary" onclick="PaintingInspectionModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <!-- 탭 네비게이션 -->
                <div style="display:flex; gap:12px; margin-bottom:20px; border-bottom:2px solid var(--border); flex-wrap:wrap;">
                    <button class="tab-button ${state.currentTab === 'inspection' ? 'active' : ''}"
                        onclick="PaintingInspectionModule._switchTab('inspection')"
                        style="padding:12px 16px; border:none; background:none; cursor:pointer; font-size:1rem; font-weight:500; color:${state.currentTab === 'inspection' ? 'var(--accent-blue)' : 'var(--text-muted)'}; border-bottom:3px solid ${state.currentTab === 'inspection' ? 'var(--accent-blue)' : 'transparent'};">
                        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px;">done_all</span> 검사 진행
                    </button>
                    <button class="tab-button ${state.currentTab === 'completion' ? 'active' : ''}"
                        onclick="PaintingInspectionModule._switchTab('completion')"
                        style="padding:12px 16px; border:none; background:none; cursor:pointer; font-size:1rem; font-weight:500; color:${state.currentTab === 'completion' ? 'var(--accent-blue)' : 'var(--text-muted)'}; border-bottom:3px solid ${state.currentTab === 'completion' ? 'var(--accent-blue)' : 'transparent'};">
                        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px;">task_alt</span> 검사 완료 실적
                    </button>
                    <button class="tab-button ${state.currentTab === 'statistics' ? 'active' : ''}"
                        onclick="PaintingInspectionModule._switchTab('statistics')"
                        style="padding:12px 16px; border:none; background:none; cursor:pointer; font-size:1rem; font-weight:500; color:${state.currentTab === 'statistics' ? 'var(--accent-blue)' : 'var(--text-muted)'}; border-bottom:3px solid ${state.currentTab === 'statistics' ? 'var(--accent-blue)' : 'transparent'};">
                        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px;">analytics</span> 통계 대시보드
                    </button>
                </div>

                <!-- 탭 컨텐츠 -->
                <div id="tabContent"></div>
            </div>
        `;

        // 탭 컨텐츠 렌더링
        setTimeout(() => {
            _renderTabContent();
        }, 50);
    }

    // 탭 전환
    function _switchTab(tabName) {
        state.currentTab = tabName;
        const container = document.querySelector('.fade-in-up');
        if (container) {
            render(container);
        }
    }

    // 탭 컨텐츠 렌더링
    function _renderTabContent() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        if (state.currentTab === 'inspection') {
            // 검사 진행 탭
            tabContent.innerHTML = `
                <!-- 검사대기품 (도장 작업 완료 목록) -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">done_all</span> 검사대기품</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">도장 작업 완료된 제품의 검사를 진행합니다</span>
                    </div>
                    <div class="card-body" id="inspectionWaitingList"></div>
                </div>

                <!-- 선택 정보 -->
                <div id="selectedInfo"></div>

                <!-- 불량 유형 선택 -->
                <div id="defectCounter"></div>

                <!-- 현재 집계 & 저장 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">summarize</span> 현재 집계</h4>
                    </div>
                    <div class="card-body" id="currentSummary"></div>
                    <div class="card-footer" style="display:flex;gap:10px;justify-content:center;">
                        <button class="btn btn-primary" onclick="PaintingInspectionModule.save()">
                            <span class="material-symbols-outlined">save</span> 저장
                        </button>
                        <button class="btn btn-secondary" onclick="PaintingInspectionModule.reset()">
                            <span class="material-symbols-outlined">restart_alt</span> 초기화
                        </button>
                    </div>
                </div>
            `;
            renderInspectionWaitingList();
            renderDefectCounter();
            renderSummary();
        } else if (state.currentTab === 'completion') {
            // 검사 완료 실적 탭
            showCompletionResults();
        } else if (state.currentTab === 'statistics') {
            // 통계 대시보드 탭
            showStatisticsDashboard();
        }
    }

    // 검사대기품 목록 표시 (도장 완료되었으나 검사 실적이 없는 목록)
    function renderInspectionWaitingList() {
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const inspections = Storage.getAll(STORE) || []; // 검사 실적 저장소
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const el = document.getElementById('inspectionWaitingList');

        // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
        function findProduct(w) {
            return products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
                || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
        }

        // 검사 실적이 이미 있는 도장 작업 ID 세트 만들기
        const inspectedWorkIds = new Set(inspections.map(i => i.workId || i.id).filter(Boolean));

        // 검사 미완료 작업 (inspectionStatus !== 'completed')만 필터링
        const inspectionWorks = paintingWorks.filter(w => {
            // 검사 완료된 작업은 제외
            if (w.inspectionStatus === 'completed') return false;

            // 제품이 없으면 제외
            const product = findProduct(w);
            if (!product) return false;

            // process2 또는 process4가 '외관 검사'를 포함하면 표시
            // (product 미설정인 경우도 포함 - 모든 도장 완료 작업 표시)
            const p2 = (product.process2 || '').trim();
            const p4 = (product.process4 || '').trim();
            const hasInspectionProcess = p2.includes('검사') || p4.includes('검사')
                || p2 === '외관 검사' || p2 === '외관검사'
                || p4 === '외관 검사' || p4 === '외관검사';

            // process 미설정이거나 검사 공정이 있으면 표시
            return !p2 && !p4 || hasInspectionProcess;
        });

        if (inspectionWorks.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">외관 검사 공정 제품의 도장 작업 완료 데이터가 없습니다.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>도장작업일</th>
                            <th>라인</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th style="text-align:center;">품목구분</th>
                            <th>사출 LOT</th>
                            <th style="text-align:right;">도장 완료(검사대기) 수량</th>
                            <th style="width:100px;">검사 진행</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inspectionWorks.map(w => {
            const lotDisplay = (w.lots && w.lots.length > 0) ?
                w.lots.map(l => l.lotNo).join(', ') : (w.lotNo || '-');

            return `
                                <tr>
                                    <td>${w.date || '-'}</td>
                                    <td><span class="badge badge-info">${w.line || '-'}</span></td>
                                    <td>${w.carModel || '-'}</td>
                                    <td><strong>${w.partName || '-'}</strong></td>
                                    <td>${w.color || '-'}</td>
                                    <td style="text-align:center;">${UIUtils.itemTypeBadge(w.carModel, w.partName, w.color)}</td>
                                    <td style="font-family:monospace;font-size:0.85rem;">${lotDisplay}</td>
                                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(w.productionQty || 0)}</td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm btn-primary" onclick="PaintingInspectionModule.openInspectionModal('${w.id}')">
                                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">edit</span>검사
                                        </button>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 생산 계획 지시서 목록 표시
    function renderPlanSelector() {
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS);
        // 오늘 또는 진행 중인 계획만 표시
        const activePlans = plans.filter(p => p.status === '진행' || p.status === '대기');

        const el = document.getElementById('planSelector');

        if (activePlans.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">활성화된 생산 계획이 없습니다. 생산 계획 지시서에서 등록하세요.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>선택</th>
                            <th>지시번호</th>
                            <th>날짜</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th>계획수량</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activePlans.map(p => `
                            <tr style="cursor:pointer;${state.selectedPlan?.id === p.id ? 'background:#eff6ff;' : ''}" onclick="PaintingInspectionModule.selectPlan('${p.id}')">
                                <td><input type="radio" name="planSelect" ${state.selectedPlan?.id === p.id ? 'checked' : ''}></td>
                                <td><strong>${p.orderNo || '-'}</strong></td>
                                <td>${p.date}</td>
                                <td>${p.carModel || '-'}</td>
                                <td>${p.partName || '-'}</td>
                                <td>${p.color || '-'}</td>
                                <td>${UIUtils.formatNumber(p.planQty)}</td>
                                <td>${UIUtils.badge(p.status, p.status === '진행' ? 'info' : 'warning')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function selectPlan(id) {
        const plan = Storage.getById(DB.STORES.PRODUCTION_PLANS, id);
        state.selectedPlan = plan;
        state.selectedWork = null; // 도장 작업 선택 해제
        renderInspectionWaitingList();
        renderSelectedInfo();
    }

    // 도장 작업 완료에서 직접 검사 시작 (통합 입력 모달)
    function openInspectionModal(workId) {
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) {
            UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
            return;
        }

        const allDefects = Storage.getAll(DEFECT_STORE) || [];
        const injectionDefects = allDefects.filter(d => d && (d.type === 'injection' || !d.type));
        const paintingDefects = allDefects.filter(d => d && d.type === 'painting');
        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];

        const lotDisplay = work.lots && work.lots.length > 0 ?
            work.lots.map(l => l.lotNo).join(', ') :
            (work.lotNo || '-');

        // 모달 HTML 작성
        let modalContent = `
            <div style="display:grid; gap:16px;">
                <!-- 기본 정보 섹션 (자동 채우기) -->
                <div class="card">
                    <div class="card-body">
                        <h4 style="margin:0 0 10px 0; color:var(--text-primary);">도장 정보</h4>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px 16px; background:var(--bg-secondary); border-radius:8px; padding:14px;">
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">도장작업일</div>
                                <div style="font-weight:600; font-size:0.9rem;">${work.date || '-'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">작업 시간</div>
                                <div style="font-size:0.9rem;">${work.startTime ? (work.startTime + (work.endTime ? ' ~ ' + work.endTime : '')) : '-'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">차종</div>
                                <div style="font-weight:600; font-size:0.9rem;">${work.carModel || '-'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">품명</div>
                                <div style="font-weight:600; font-size:0.9rem;">${work.partName || '-'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">컬러</div>
                                <div style="font-size:0.9rem;">${work.color || '-'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">사출 LOT</div>
                                <div style="font-size:0.82rem; font-family:monospace;">${lotDisplay}</div>
                            </div>
                            <div>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">도장 작업 수량</div>
                                <div style="font-weight:700; font-size:1rem; color:var(--accent-blue);">
                                    ${UIUtils.formatNumber(work.productionQty || 0)} EA
                                    <input type="hidden" id="inpInspectionQty" value="${work.productionQty || 0}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 검사 정보 입력 섹션 -->
                <div class="card">
                    <div class="card-body">
                        <h4 style="margin:0 0 12px 0; color:var(--text-primary);">검사 정보</h4>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
                            <div class="form-group">
                                <label class="form-label">검사일자</label>
                                <input type="date" class="form-input" id="inpInspectionDate" value="${UIUtils.today()}" style="font-weight:600;">
                            </div>
                            <div class="form-group">
                                <label class="form-label">검사 시작시간</label>
                                <input type="time" class="form-input" id="inpInspectionStartTime" style="font-weight:600;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">검사 완료시간</label>
                                <input type="time" class="form-input" id="inpInspectionEndTime" style="font-weight:600;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">소요시간</label>
                                <input type="text" class="form-input" id="inpInspectionDuration" placeholder="자동계산" readonly style="background:var(--bg-secondary); font-weight:600;">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 불량 유형 섹션 (사출/도장 분리) -->
                <div class="card">
                    <div class="card-body">
                        <h4 style="margin:0 0 12px 0; color:var(--text-primary);">불량 유형 입력</h4>

                        ${injectionDefects.length > 0 ? `
                        <div style="margin-bottom:20px;">
                            <h5 style="margin:0 0 10px 0;color:#ea580c;border-bottom:2px solid #ea580c;padding-bottom:5px;">
                                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">precision_manufacturing</span> 사출 불량
                            </h5>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                                ${injectionDefects.map(d => `
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <label style="font-size:0.9rem; font-weight:600; margin:0;">${d.name}</label>
                                        <input type="text" inputmode="numeric" id="inj-${d.id}" value="0" min="0" style="padding:8px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:600; font-size:0.95rem; cursor:pointer; background:white;" onfocus="if(this.value==='0') this.value=''" onclick="PaintingInspectionModule._showNumericPad(this)" onkeydown="if(!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(event.key)){event.preventDefault();}" oninput="PaintingInspectionModule._updateDefectTotal()">
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}

                        ${paintingDefects.length > 0 ? `
                        <div>
                            <h5 style="margin:0 0 10px 0;color:#16a34a;border-bottom:2px solid #16a34a;padding-bottom:5px;">
                                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">format_paint</span> 도장 불량
                            </h5>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                                ${paintingDefects.map(d => `
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <label style="font-size:0.9rem; font-weight:600; margin:0;">${d.name}</label>
                                        <input type="text" inputmode="numeric" id="paint-${d.id}" value="0" min="0" style="padding:8px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:600; font-size:0.95rem; cursor:pointer; background:white;" onfocus="if(this.value==='0') this.value=''" onclick="PaintingInspectionModule._showNumericPad(this)" onkeydown="if(!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(event.key)){event.preventDefault();}" oninput="PaintingInspectionModule._updateDefectTotal()">
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- 검사 정보 입력 섹션 -->
                <div class="card">
                    <div class="card-body">
                        <h4 style="margin:0 0 12px 0; color:var(--text-primary);">검사 정보</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">양품수</label>
                                <input type="number" class="form-input" id="inpGoodQty" value="${work.productionQty || 0}" min="0" style="text-align:right; font-weight:600;"
                                    onchange="PaintingInspectionModule._updateDefectQty()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">불량수</label>
                                <input type="number" class="form-input" id="inpDefectQty" value="0" min="0" style="text-align:right; font-weight:600;"
                                    onchange="PaintingInspectionModule._updateGoodQty()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">합계 (자동)</label>
                                <input type="text" class="form-input" id="inpTotalQty" value="${UIUtils.formatNumber(work.productionQty || 0)}" readonly style="background:var(--bg-secondary); text-align:right; font-weight:600;">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 검사자 선택 섹션 -->
                <div class="card">
                    <div class="card-body">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h4 style="margin:0; color:var(--text-primary);">검사자</h4>
                            <button class="btn btn-sm btn-primary" onclick="PaintingInspectionModule._addInspectorField()" id="addInspectorBtn" style="gap:4px;">
                                <span class="material-symbols-outlined" style="font-size:16px;">add</span> 추가
                            </button>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px;" id="inspectorContainer">
                            <!-- 동적으로 생성됨 -->
                        </div>
                    </div>
                </div>

                <!-- 버튼 섹션 -->
                <div style="display:flex; gap:8px; padding-top:16px; border-top:1px solid var(--border);">
                    <button class="btn btn-primary" onclick="PaintingInspectionModule._saveInspection('${workId}')">
                        <span class="material-symbols-outlined">save</span> 저장
                    </button>
                    <button class="btn btn-secondary" onclick="window.print()">
                        <span class="material-symbols-outlined">print</span> 인쇄
                    </button>
                    <button class="btn btn-outline" onclick="PaintingInspectionModule._closeInspectionModal()">
                        <span class="material-symbols-outlined">close</span> 취소
                    </button>
                </div>
            </div>
        `;

        // 커스텀 모달 생성
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.style.display = 'block';
        modalEl.innerHTML = `
            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; border-radius: 0 !important; }
                    .modal h2 { margin: 0 0 20px 0 !important; }
                    .modal > div > button { display: none !important; }
                    .btn { display: none !important; }
                    .card { page-break-inside: avoid; border: 1px solid #ccc !important; }
                    .form-input { border: 1px solid #ccc !important; }
                    .form-select { border: 1px solid #ccc !important; }
                }
            </style>
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; border-radius:12px; max-width:63vw; max-height:90vh; width:63vw; overflow:auto; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h2 style="margin:0; font-size:1.25rem;">도장 검사 입력</h2>
                        <button onclick="PaintingInspectionModule._closeInspectionModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl.querySelector('div:first-child')) {
                PaintingInspectionModule._closeInspectionModal();
            }
        });

        // 모달에 데이터 저장 (나중에 접근하기 위해)
        modalEl.inspectionWorkId = workId;
        modalEl.injectionDefects = injectionDefects;
        modalEl.paintingDefects = paintingDefects;
        // 부모 페이지 컨테이너 저장 (닫을 때 복귀하기 위해)
        modalEl.parentPageContainer = document.querySelector('[data-page="painting-inspection"]');

        // 검사자 필드 초기화 (검사자1만 표시)
        setTimeout(() => {
            const container = document.getElementById('inspectorContainer');
            if (container) {
                container.innerHTML = '';
                container.inspectorCount = 0;
                // 검사자1 추가
                PaintingInspectionModule._addInspectorField(true);
            }
        }, 100);
    }

    // 검사자 필드 동적 추가
    function _addInspectorField(isFirst = false) {
        const container = document.getElementById('inspectorContainer');
        if (!container) return;

        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];

        // 현재 개수 확인
        if (!container.inspectorCount) {
            container.inspectorCount = container.querySelectorAll('[id^="inspector"]').length;
        }

        // 최대 5명까지만 추가
        if (!isFirst && container.inspectorCount >= 5) {
            UIUtils.toast('검사자는 최대 5명까지 추가할 수 있습니다.', 'warning');
            return;
        }

        container.inspectorCount++;
        const idx = container.inspectorCount;

        const fieldHTML = `
            <div class="form-group" id="inspectorGroup${idx}">
                <label class="form-label">검사자${idx}</label>
                <select id="inspector${idx}" class="form-select" style="padding:6px; border:1px solid var(--border);">
                    <option value="">선택 안함</option>
                    ${inspectors.map(insp => `<option value="${insp.id}">${insp.name || insp.id}</option>`).join('')}
                </select>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', fieldHTML);

        // + 버튼 상태 업데이트
        const addBtn = document.getElementById('addInspectorBtn');
        if (addBtn) {
            addBtn.disabled = container.inspectorCount >= 5;
        }
    }

    // 검사 모달 닫기 및 도장 검사 페이지로 복귀
    function _closeInspectionModal() {
        // 모달 제거
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();

        // Router를 통해 도장 검사 페이지로 이동
        Router.navigate('painting-inspection');
    }

    // 숫자 키패드 표시
    function _showNumericPad(inputEl) {
        // 기존 키패드 정리 (이벤트 리스너 포함)
        _closeNumericPad();

        // 현재 값 표시용
        let currentVal = inputEl.value || '0';

        const pad = document.createElement('div');
        pad.id = 'numericPad';
        pad.style.cssText = `
            position:fixed; z-index:99999;
            background:white; border-radius:16px;
            padding:16px; box-shadow:0 8px 32px rgba(0,0,0,0.25);
            width:220px;
        `;

        pad.innerHTML = `
            <div style="text-align:center; margin-bottom:10px; font-size:0.85rem; color:var(--text-muted); font-weight:600;">${inputEl.previousElementSibling ? inputEl.previousElementSibling.textContent : '입력'}</div>
            <div id="numpadDisplay" style="text-align:center; font-size:2rem; font-weight:700; color:var(--accent-blue); background:var(--bg-secondary); border-radius:8px; padding:10px; margin-bottom:12px; min-height:56px;">${currentVal}</div>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
                ${[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => `
                    <button onclick="PaintingInspectionModule._numpadInput('${n}')" style="padding:14px; font-size:1.2rem; font-weight:600; border:1px solid var(--border); border-radius:8px; background:white; cursor:pointer;">${n}</button>
                `).join('')}
                <button onclick="PaintingInspectionModule._numpadDelete()" style="padding:14px; font-size:1.2rem; border:1px solid var(--border); border-radius:8px; background:#fff3f3; cursor:pointer;">⌫</button>
                <button onclick="PaintingInspectionModule._numpadInput('0')" style="padding:14px; font-size:1.2rem; font-weight:600; border:1px solid var(--border); border-radius:8px; background:white; cursor:pointer;">0</button>
                <button onclick="PaintingInspectionModule._numpadConfirm()" style="padding:14px; font-size:1rem; font-weight:700; border:none; border-radius:8px; background:var(--accent-blue); color:white; cursor:pointer;">완료</button>
            </div>
        `;

        // 위치: 입력 필드 기준
        const rect = inputEl.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = rect.left;

        // 화면 밖으로 나가지 않도록 조정
        if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
        if (top + 340 > window.innerHeight) top = rect.top - 348;

        pad.style.top = top + 'px';
        pad.style.left = left + 'px';

        document.body.appendChild(pad);

        // 타겟 input 저장
        pad._targetInput = inputEl;

        // 키보드 입력 시: 숫자만 허용 + 키패드 디스플레이 동기화
        inputEl._numpadInputHandler = function() {
            // 숫자 외 문자 제거
            let raw = inputEl.value.replace(/[^0-9]/g, '');
            if (raw.length > 5) raw = raw.substring(0, 5);
            if (inputEl.value !== raw) inputEl.value = raw;
            const display = document.getElementById('numpadDisplay');
            if (display) display.textContent = raw || '0';
            _updateDefectTotal();
        };
        inputEl.addEventListener('input', inputEl._numpadInputHandler);

        // 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', _numpadOutsideClick);
        }, 100);
    }

    function _numpadOutsideClick(e) {
        const pad = document.getElementById('numericPad');
        if (!pad) {
            document.removeEventListener('click', _numpadOutsideClick);
            return;
        }
        // 키패드 내부 클릭이면 무시
        if (pad.contains(e.target)) return;
        // 다른 불량 input 클릭이면: 키패드 닫고 새 키패드는 _showNumericPad가 열어줌
        _closeNumericPad();
    }

    function _closeNumericPad() {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        if (pad._targetInput && pad._targetInput._numpadInputHandler) {
            pad._targetInput.removeEventListener('input', pad._targetInput._numpadInputHandler);
            delete pad._targetInput._numpadInputHandler;
        }
        pad.remove();
        document.removeEventListener('click', _numpadOutsideClick);
    }

    function _numpadInput(digit) {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        const display = document.getElementById('numpadDisplay');
        let val = display.textContent === '0' ? digit : display.textContent + digit;
        if (val.length > 5) return; // 최대 5자리
        display.textContent = val;
    }

    function _numpadDelete() {
        const display = document.getElementById('numpadDisplay');
        if (!display) return;
        const val = display.textContent;
        display.textContent = val.length <= 1 ? '0' : val.slice(0, -1);
    }

    function _numpadConfirm() {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        const display = document.getElementById('numpadDisplay');
        const val = display.textContent || '0';

        if (pad._targetInput) {
            pad._targetInput.value = parseInt(val) || 0;
            _updateDefectTotal();
        }

        _closeNumericPad();
    }

    // 제품 선택 목록
    function renderProductSelector() {
        const products = Storage.getAll(PRODUCTS_STORE);
        const el = document.getElementById('productSelector');

        if (products.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">제품이 없습니다. 관리/설정에서 제품을 등록하세요.</p>`;
            return;
        }

        // 차종별 그룹핑
        const grouped = {};
        products.forEach(p => {
            const model = p.carModel || '미분류';
            if (!grouped[model]) grouped[model] = [];
            grouped[model].push(p);
        });

        let html = '';
        Object.entries(grouped).forEach(([model, items]) => {
            html += `<div class="product-group">`;
            html += `<div class="product-group-header">${model}</div>`;
            html += `<div class="product-group-items">`;
            items.forEach(p => {
                const display = p.displayName || `${p.carModel} ${p.partName} ${p.color}`.trim();
                const isSelected = state.selectedProduct && state.selectedProduct.id === p.id;
                html += `<button class="product-select-btn ${isSelected ? 'selected' : ''}" 
                            onclick="PaintingInspectionModule.selectProduct('${p.id}')">${p.color || display}</button>`;
            });
            html += `</div></div>`;
        });

        el.innerHTML = html;
    }

    function selectProduct(id) {
        const product = Storage.getById(PRODUCTS_STORE, id);
        state.selectedProduct = product;
        state.counts = {};
        renderProductSelector();
        renderDefectCounter();
        renderSelectedInfo();
        renderSummary();
    }

    function renderSelectedInfo() {
        const el = document.getElementById('selectedInfo');
        if (!state.selectedProduct && !state.selectedPlan && !state.selectedWork) {
            el.innerHTML = '';
            return;
        }

        let html = '';
        if (state.selectedPlan) {
            html += `<div class="selected-info" style="margin-bottom:10px;">
                <span class="material-symbols-outlined">assignment</span>
                <span>지시서: <strong>${state.selectedPlan.orderNo || '-'}</strong> |
                ${state.selectedPlan.carModel} ${state.selectedPlan.partName} ${state.selectedPlan.color} |
                계획: ${UIUtils.formatNumber(state.selectedPlan.planQty)}EA</span>
            </div>`;
        }
        if (state.selectedWork) {
            const lotDisplay = state.selectedWork.lots && state.selectedWork.lots.length > 0 ?
                state.selectedWork.lots.map(l => l.lotNo).join(', ') :
                (state.selectedWork.lotNo || '-');
            html += `<div class="selected-info" style="margin-bottom:10px;background:rgba(76,175,80,0.1);border-left:4px solid var(--accent-green);padding:8px;border-radius:4px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);">done_all</span>
                <span>도장 작업: <strong>${state.selectedWork.date}</strong> |
                ${state.selectedWork.carModel} ${state.selectedWork.partName} ${state.selectedWork.color} |
                LOT: ${lotDisplay} |
                완료수량: <strong>${UIUtils.formatNumber(state.selectedWork.productionQty || 0)}EA</strong></span>
            </div>`;
        }
        if (state.selectedProduct) {
            const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;
            html += `<div class="selected-info" style="margin-bottom:20px;">
                <span class="material-symbols-outlined">category</span>
                <span>제품: <strong>${display}</strong></span>
            </div>`;
        }
        el.innerHTML = html;
    }

    function renderDefectCounter() {
        const el = document.getElementById('defectCounterGrid');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어

        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id); // 유효한 항목만

        if (defects.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);padding:10px 0;">불량 유형이 없습니다. <strong>관리/설정 &gt; 불량 유형</strong>에서 사출/도장 불량을 등록하세요.</p>`;
            el.style.display = 'block';
            el.style.gridTemplateColumns = 'none';
            return;
        }

        const injDefects = defects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = defects.filter(d => d.type === 'painting');

        let html = '';

        if (injDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-blue);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">precision_manufacturing</span> 사출 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:20px;">`;
            html += injDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${state.counts[d.id] || 0}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        if (paintDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-orange);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">format_paint</span> 도장 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:10px;">`;
            html += paintDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${state.counts[d.id] || 0}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        el.innerHTML = html;
        el.style.display = 'block';
        el.style.gridTemplateColumns = 'none';
    }

    function increment(defectId, defectName) {
        if (!state.selectedProduct) {
            UIUtils.toast('먼저 제품을 선택하세요.', 'warning');
            return;
        }
        state.counts[defectId] = (state.counts[defectId] || 0) + 1;
        updateCountDisplay(defectId);
        renderSummary();
    }

    function decrement(defectId) {
        if (state.counts[defectId] && state.counts[defectId] > 0) {
            state.counts[defectId]--;
            updateCountDisplay(defectId);
            renderSummary();
        }
    }

    function updateCountDisplay(defectId) {
        const btn = document.getElementById(`defect-btn-${defectId}`);
        if (btn) {
            btn.querySelector('.defect-count').textContent = state.counts[defectId] || 0;
        }
    }

    // 현재 집계 표시
    function renderSummary() {
        const el = document.getElementById('currentSummary');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어
        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id);
        const active = defects.filter(d => (state.counts[d.id] || 0) > 0);

        let html = '';

        // 상단: 현재 카운팅 중인 불량
        if (active.length > 0) {
            const total = active.reduce((s, d) => s + state.counts[d.id], 0);

            // 사출, 도장 구분하여 표시
            const injActive = active.filter(d => d.type === 'injection' || !d.type);
            const paintActive = active.filter(d => d.type === 'painting');

            html += `<h6 style="margin:0 0 8px 0; color:var(--accent-blue); font-weight:600;">▶ 현재 카운팅</h6>`;

            if (injActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">사출 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${injActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(59, 130, 246, 0.1);border:1px solid rgba(59, 130, 246, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-blue);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            if (paintActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">도장 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${paintActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(245, 158, 11, 0.1);border:1px solid rgba(245, 158, 11, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-orange);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            html += `
                <div style="text-align:right;padding:8px 12px;background:rgba(239,68,68,0.1);border-radius:6px;font-weight:700;margin-bottom:16px;">
                    소계: <span style="color:var(--accent-red)">${UIUtils.formatNumber(total)}</span>
                </div>
            `;
        }

        // 하단: 검사 완료된 실적 목록
        const allInspections = Storage.getAll(STORE) || [];
        const todayInspections = allInspections.filter(i => i.date === UIUtils.today()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (todayInspections.length > 0) {
            html += `<h6 style="margin:16px 0 8px 0; color:var(--accent-green); font-weight:600; border-top:1px dashed var(--border); padding-top:12px;">▶ 검사 완료 실적 (오늘)</h6>`;
            html += `
                <div class="data-table-wrapper" style="margin-top:8px;">
                    <table class="data-table" style="font-size:0.9rem;">
                        <thead>
                            <tr>
                                <th>검사일자</th>
                                <th>차종</th>
                                <th>품명</th>
                                <th>컬러</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">양품</th>
                                <th style="text-align:right;">불량</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${todayInspections.map(i => {
                                const insp = Number(i.inspectionQty) || 0;
                                const defect = Number(i.defectQty) || 0;
                                const rate = insp > 0 ? (defect / insp * 100).toFixed(1) : '0.0';
                                return `
                                <tr>
                                    <td style="font-size:0.82rem;">${i.date || '-'}</td>
                                    <td>${i.carModel || '-'}</td>
                                    <td><strong>${i.partName || '-'}</strong></td>
                                    <td>${i.color || '-'}</td>
                                    <td style="text-align:right;">${UIUtils.formatNumber(insp)}</td>
                                    <td style="text-align:right;color:var(--accent-green);font-weight:600;">${UIUtils.formatNumber(Number(i.goodQty) || 0)}</td>
                                    <td style="text-align:right;color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(defect)}</td>
                                    <td style="text-align:right;font-weight:600;color:${defect > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${rate}%</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (active.length === 0) {
            html = `<p style="color:var(--text-muted);text-align:center;padding:20px;">오늘 등록된 검사 실적이 없습니다.</p>`;
        }

        el.innerHTML = html;
    }

    // 저장
    async function save() {
        if (!state.selectedProduct) {
            UIUtils.toast('제품을 선택하세요.', 'warning');
            return;
        }

        const defects = Storage.getAll(DEFECT_STORE);
        const activeDefects = defects.filter(d => state.counts[d.id] > 0);

        if (activeDefects.length === 0) {
            UIUtils.toast('저장할 불량 데이터가 없습니다.', 'warning');
            return;
        }

        const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;

        // 불량별로 각각 기록
        for (const d of activeDefects) {
            await Storage.add(STORE, {
                date: UIUtils.today(),
                productId: state.selectedProduct.id,
                productName: display,
                carModel: state.selectedProduct.carModel || null, // 차종 저장
                partName: state.selectedProduct.partName || null, // 품명 저장
                color: state.selectedProduct.color || null, // 컬러 저장
                defectId: d.id,
                defectName: d.name,
                defectCount: state.counts[d.id],
                planId: state.selectedPlan ? state.selectedPlan.id : null,
                planOrderNo: state.selectedPlan ? state.selectedPlan.orderNo : null
            });
        }

        UIUtils.toast(`${activeDefects.length}건의 불량 기록이 저장되었습니다.`, 'success');
        reset();
    }

    function reset() {
        state.counts = {};
        renderDefectCounter();
        renderSummary();
    }

    // 검사 모달 내부 헬퍼 함수들
    function _incInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _incPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _updateDefectQty() {
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);
        const goodQty = parseInt(document.getElementById('inpGoodQty').value || 0);
        const defectQty = inspectionQty - goodQty;
        document.getElementById('inpDefectQty').value = Math.max(0, defectQty);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = inspectionQty;
    }

    function _updateGoodQty() {
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);
        const defectQtyEl = document.getElementById('inpDefectQty');
        let defectQty = parseInt(defectQtyEl.value || 0);
        if (defectQty > inspectionQty) {
            defectQty = inspectionQty;
            defectQtyEl.value = inspectionQty;
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(inspectionQty)} EA`, 'warning');
        }
        const goodQty = inspectionQty - defectQty;
        document.getElementById('inpGoodQty').value = Math.max(0, goodQty);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = Math.max(0, goodQty) + defectQty;
    }

    function _calculateInspectionTime() {
        // 신규 등록 or 편집 모달 — 둘 중 현재 열려 있는 것 사용
        const startTimeEl = document.getElementById('inpInspectionStartTime')
                         || document.getElementById('editInspectionStartTime');
        const endTimeEl   = document.getElementById('inpInspectionEndTime')
                         || document.getElementById('editInspectionEndTime');
        const durationEl  = document.getElementById('inpInspectionDuration')
                         || document.getElementById('editInspectionDuration');

        if (!startTimeEl || !endTimeEl || !durationEl) return;

        const startTime = startTimeEl.value;
        const endTime   = endTimeEl.value;

        if (!startTime || !endTime) {
            durationEl.value = '';
            return;
        }

        const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let duration = toMin(endTime) - toMin(startTime);
        if (duration < 0) duration += 24 * 60; // 자정 넘어가는 경우

        // 분 단위로 표시
        durationEl.value = `${duration}분`;
    }

    function _updateDefectTotal() {
        // 모든 불량 유형 입력값 합산 (inj-*, paint-*)
        let defectSum = 0;
        const defectInputs = document.querySelectorAll('[id^="inj-"], [id^="paint-"]');
        defectInputs.forEach(el => {
            defectSum += parseInt(el.value || 0);
        });
        const inspectionQtyEl = document.getElementById('inpInspectionQty');
        const maxDefectQty = parseInt(inspectionQtyEl ? inspectionQtyEl.value.replace(/,/g, '') || 0 : 0);
        if (maxDefectQty > 0 && defectSum > maxDefectQty) {
            const activeEl = document.activeElement;
            if (activeEl && Array.from(defectInputs).includes(activeEl)) {
                const overflow = defectSum - maxDefectQty;
                const current = parseInt(activeEl.value || 0);
                activeEl.value = Math.max(0, current - overflow);
                defectSum = maxDefectQty;
            } else {
                defectSum = maxDefectQty;
            }
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(maxDefectQty)} EA`, 'warning');
        }

        // 불량수 자동 입력
        const defectQtyEl = document.getElementById('inpDefectQty');
        if (defectQtyEl) defectQtyEl.value = defectSum;

        // 양품수 = 검사수량 - 불량수
        const goodQtyEl = document.getElementById('inpGoodQty');
        if (inspectionQtyEl && goodQtyEl) {
            const inspQty = parseInt(inspectionQtyEl.value.replace(/,/g, '') || 0);
            goodQtyEl.value = Math.max(0, inspQty - defectSum);
        }

        // 합계 = 양품수 + 불량수
        const goodQty = parseInt(goodQtyEl ? goodQtyEl.value || 0 : 0);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = goodQty + defectSum;
    }

    function _getPaintingWorkQty(work) {
        if (!work) return 0;
        return Number(work.productionQty || work.inputQty || work.quantity || work.goodQty || 0) || 0;
    }

    function _validateDefectQtyWithinWorkQty(defectQty, workQty) {
        const defect = Number(defectQty) || 0;
        const work = Number(workQty) || 0;
        if (work > 0 && defect > work) {
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 작업 ${UIUtils.formatNumber(work)} EA / 불량 ${UIUtils.formatNumber(defect)} EA`, 'warning');
            return false;
        }
        return true;
    }

    // 검사 데이터 저장 함수
    async function _saveInspection(workId) {
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) {
            UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty      = parseInt(document.getElementById('inpGoodQty').value || 0);
        const defectQty    = parseInt(document.getElementById('inpDefectQty').value || 0);
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);

        // 검사 수량 검증 (검사수량이 0이면 양품수 기준으로 허용)
        const effectiveInspQty = inspectionQty > 0 ? inspectionQty : goodQty;
        if (effectiveInspQty === 0) {
            UIUtils.toast('검사수량이 0입니다. 양품수를 입력해주세요.', 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(defectQty, _getPaintingWorkQty(work) || effectiveInspQty)) {
            const defectQtyEl = document.getElementById('inpDefectQty');
            if (defectQtyEl) defectQtyEl.focus();
            return;
        }
        if (goodQty + defectQty !== effectiveInspQty) {
            UIUtils.toast('양품수 + 불량수가 검사수량과 맞지 않습니다.', 'warning');
            return;
        }

        // 검사자 정보 수집 (하단 검사자 섹션에서 inspector1~5)
        const inspectors = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`inspector${i}`);
            if (el && el.value) {
                // select 요소일 경우 선택된 option의 text를 가져옴
                if (el.tagName === 'SELECT') {
                    const selectedOption = el.options[el.selectedIndex];
                    if (selectedOption && selectedOption.text && selectedOption.text !== '선택 안함') {
                        inspectors.push(selectedOption.text);
                    }
                } else if (el.value) {
                    inspectors.push(el.value);
                }
            }
        }

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('inpInspectionDate');
        const inspectionStartTimeEl = document.getElementById('inpInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('inpInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : UIUtils.today();
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : '';
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : '';

        const productDisplay = `${work.carModel} ${work.partName} ${work.color}`;
        const baseData = {
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime,
            workId,
            productId: workId,
            productName: productDisplay,
            carModel: work.carModel,
            partName: work.partName,
            color: work.color,
            paintingDate: work.date,
            paintingTime: work.startTime ? (work.startTime + (work.endTime ? '~' + work.endTime : '')) : '',
            lotNo: work.lots && work.lots.length > 0 ? work.lots.map(l => l.lotNo).join(', ') : (work.lotNo || ''),
            inspectionQty: effectiveInspQty,
            goodQty,
            defectQty,
            inspectors,
            planId: null,
            planOrderNo: null
        };

        // 불량 유형별 수집
        const allDefects = Storage.getAll(DEFECT_STORE) || [];
        const defectDetails = [];

        for (const defect of allDefects) {
            let count = 0;
            const injInput   = document.getElementById(`inj-${defect.id}`);
            const paintInput = document.getElementById(`paint-${defect.id}`);
            if (injInput)   count = parseInt(injInput.value   || 0);
            if (paintInput) count = parseInt(paintInput.value || 0);

            if (count > 0) {
                defectDetails.push({
                    defectId:    defect.id,
                    defectName:  defect.name,
                    defectType:  defect.type || 'injection',
                    defectCount: count
                });
            }
        }
        const detailDefectTotal = defectDetails.reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, _getPaintingWorkQty(work) || effectiveInspQty)) {
            return;
        }

        // 검사 결과 1건만 저장
        await Storage.add(STORE, {
            ...baseData,
            defects: defectDetails,
            inspectionStatus: 'completed',
            createdAt: new Date().toISOString()
        });

        // 해당 작업의 상태를 "검사 완료"로 변경
        await Storage.update(PAINTING_WORK_STORE, workId, {
            inspectionStatus: 'completed',
            inspectionDate: inspectionDate,
            inspectionStartTime: inspectionStartTime,
            inspectionEndTime: inspectionEndTime,
            inspectors: inspectors,
            updatedAt: new Date().toISOString()
        });

        // ── 출하검사 대기 자동 등록 (레이져 공정 없는 제품만) ──────────
        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _prod = _products.find(p => p.carModel === work.carModel && p.partName === work.partName && p.color === work.color)
                   || _products.find(p => p.carModel === work.carModel && p.partName === work.partName);
        const _isLaser = _prod && ((_prod.process2 || '') + (_prod.process3 || '') + (_prod.process4 || '')).includes('레이저');
        if (!_isLaser) {
            await Storage.add(DB.STORES.SHIPPING_STANDBY, {
                date         : inspectionDate,
                source       : 'painting_inspection',
                carModel     : work.carModel     || '',
                partName     : work.partName     || '',
                color        : work.color        || '',
                paintingDate : work.date         || '',
                lotNo        : work.lots && work.lots.length > 0
                                ? work.lots.map(l => l.lotNo).join(', ')
                                : (work.lotNo || ''),
                inspectionQty: effectiveInspQty,
                customer     : _prod ? (_prod.customer || '') : '',
                status       : '대기'
            });
        }

        UIUtils.toast('검사 데이터가 저장되었습니다.', 'success');

        // 모달 제거 후 도장 검사 페이지로 복귀
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();
        Router.navigate('painting-inspection');
    }

    // 검사 이력 보기 (필터 기능 포함)
    function showHistory() {
        const allData = Storage.getAll(STORE) || [];
        allData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 고유 차종/품명 추출
        const uniqueCarModels = [...new Set(allData.map(d => d.carModel).filter(Boolean))].sort();
        const uniquePartNames = [...new Set(allData.map(d => d.partName).filter(Boolean))].sort();

        // 초기값
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        let modalContent = `
            <div style="margin-bottom:16px;">
                <!-- 필터 바 -->
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                    <input type="date" id="histStart" value="${startDate}" style="width:130px;" class="form-input">
                    <span style="color:var(--text-muted);">~</span>
                    <input type="date" id="histEnd" value="${endDate}" style="width:130px;" class="form-input">

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                    <select id="histCarModel" style="width:120px;" class="form-select">
                        <option value="">전체</option>
                        ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                    <select id="histPartName" style="width:150px;" class="form-select">
                        <option value="">전체</option>
                        ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>

                    <button class="btn btn-outline btn-sm" onclick="(() => {
                        const start = document.getElementById('histStart').value;
                        const end = document.getElementById('histEnd').value;
                        const carModel = document.getElementById('histCarModel').value;
                        const partName = document.getElementById('histPartName').value;
                        PaintingInspectionModule._filterHistoryTable(start, end, carModel, partName);
                    })()" style="margin-left:8px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">search</span> 조회
                    </button>

                    <button class="btn btn-secondary btn-sm" onclick="window.print()" style="margin-left:12px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                    </button>
                </div>

                <!-- 결과 컨테이너 (가로 스크롤) -->
                <div style="overflow-x:auto; overflow-y:auto; max-height:600px; border:1px solid var(--border); border-radius:8px;" id="historyTableContainer"></div>
            </div>

            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; }
                    .modal h2 { display: none !important; }
                    .modal button { display: none !important; }
                    div[style*="display:flex"][style*="align-items:center"][style*="gap:8px"] { display: none !important; }
                    #histStart, #histEnd, #histCarModel, #histPartName, .form-input, .form-select { display: none !important; }
                    .data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    .data-table thead th { background: #f5f5f5 !important; border: 1px solid #ccc !important; padding: 8px !important; text-align: left; font-weight: bold; }
                    .data-table tbody td { border: 1px solid #ccc !important; padding: 6px !important; }
                    .data-table tbody tr:nth-child(odd) { background: #fafafa !important; }
                }
            </style>
        `;

        // 커스텀 모달 (크기를 2배로 확대)
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.style.display = 'block';
        modalEl.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; border-radius:12px; max-width:90vw; max-height:90vh; width:90vw; overflow:auto; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h2 style="margin:0; font-size:1.25rem;">도장 검사 이력 조회</h2>
                        <button onclick="this.closest('.modal').parentElement.remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl.querySelector('div:first-child')) {
                modalEl.remove();
            }
        });

        // 초기 테이블 렌더링
        _filterHistoryTable(startDate, endDate, '', '');
    }

    // 이력 테이블 필터링 및 렌더링 (검사 단위로 그룹화, 불량 유형별 분리)
    function _filterHistoryTable(startDate, endDate, filterCarModel, filterPartName) {
        const allData = Storage.getAll(STORE) || [];
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (id -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // 공용 필터 적용
        let filtered = _applyCommonFilters(allData, startDate, endDate, filterCarModel, filterPartName);

        // 검사 기록 정규화 (새 구조: defects 배열 / 기존 구조: 개별 레코드)
        const grouped = {};
        filtered.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            // 새 구조: defects 배열이 있으면 그걸 사용
            if (d.defects && Array.isArray(d.defects)) {
                d.defects.forEach(def => {
                    grouped[key].defects.push({
                        name: def.defectName,
                        count: def.defectCount
                    });
                    grouped[key].totalDefects += (def.defectCount || 0);
                });
            } else {
                // 기존 구조: 개별 레코드
                grouped[key].defects.push({
                    name: d.defectName,
                    count: d.defectCount
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });

        // 그룹 데이터를 배열로 변환 및 정렬
        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const container = document.getElementById('historyTableContainer');
        if (!container) return;

        if (groupedArray.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-muted);">조회된 이력이 없습니다.</p>`;
            return;
        }

        // 각 검사 세션의 도장 작업 정보 조회 및 테이블 생성
        const tableRows = groupedArray.map(group => {
            // 새 데이터 구조에서는 paintingDate, lotNo, inspectionQty가 직접 저장됨
            // 기존 데이터와의 호환성을 위해 paintingWorks에서도 조회
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '-');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '-')) :
                '-');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리 (사출 불량 / 도장 불량)
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            // 사출 불량 표시
            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:8px;"><strong style="color:#ea580c;">사출 불량:</strong><br/>${injectionDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#ea580c;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            // 도장 불량 표시
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장 불량:</strong><br/>${paintingDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#16a34a;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            const defectDisplay = injectionDisplay + paintingDisplay;

            return `
                <tr>
                    <td style="white-space:nowrap;font-weight:500;">${group.date || '-'}</td>
                    <td style="white-space:nowrap;font-weight:500;">${paintingDate || '-'}</td>
                    <td>${group.carModel || '-'}</td>
                    <td><strong>${group.partName || '-'}</strong></td>
                    <td>${group.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.85rem;">${lotDisplay}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(inspectionQty)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(group.totalDefects)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:700;">${defectRate}%</td>
                    <td style="font-size:0.85rem;vertical-align:top;">${defectDisplay || '-'}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table" style="margin:0; table-layout:auto;">
                <thead>
                    <tr>
                        <th style="min-width:100px;">검사일</th>
                        <th style="min-width:100px;">도장작업일</th>
                        <th style="min-width:80px;">차종</th>
                        <th style="min-width:100px;">품명</th>
                        <th style="min-width:80px;">컬러</th>
                        <th style="min-width:120px;">사출 LOT</th>
                        <th style="text-align:right;min-width:80px;">검사수량</th>
                        <th style="text-align:right;min-width:80px;">불량수량</th>
                        <th style="text-align:right;min-width:80px;">불량률(%)</th>
                        <th style="min-width:450px;">불량 유형</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    function exportData() {
        const allData = Storage.getAll(STORE);
        if (!allData.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }

        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (name -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // productId + date로 그룹화
        const grouped = {};
        allData.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    // 새로운 필드들
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            grouped[key].defects.push({
                name: d.defectName,
                count: d.defectCount
            });
            grouped[key].totalDefects += (d.defectCount || 0);
        });

        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const headers = ['검사일', '도장작업일', '차종', '품명', '컬러', '사출 LOT', '검사수량', '양품수', '불량수량', '불량률(%)', '사출 불량', '도장 불량'];
        const rows = groupedArray.map(group => {
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '')) :
                '');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            const injectionDefectNames = injectionDefects.map(d => `${d.name}(${d.count})`).join(', ');
            const paintingDefectNames = paintingDefects.map(d => `${d.name}(${d.count})`).join(', ');

            return [
                group.date || '',
                paintingDate || '',
                group.carModel || '',
                group.partName || '',
                group.color || '',
                lotDisplay,
                inspectionQty,
                goodQty,
                defectQty,
                defectRate,
                injectionDefectNames,
                paintingDefectNames
            ];
        });

        Storage.exportToCSV(headers, rows, '도장검사_불량집계');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // ===================================================================
    // Phase 2: 검사 완료 실적 기능
    // ===================================================================

    // 검사 완료 실적 화면 렌더링
    function showCompletionResults() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="completionStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="completionEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="completionCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateCompletionPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="completionPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._filterCompletionResults()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div style="overflow-x:auto; border:1px solid var(--border); border-radius:8px;" id="completionTableContainer"></div>
        `;

        // 초기 조회
        _filterCompletionResults();
    }

    // 차종 선택 시 검사 완료 실적 품명 필터 업데이트
    function _updateCompletionPartFilter() {
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('completionPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 차종 선택 시 통계 대시보드 품명 필터 업데이트
    function _updateStatsPartFilter() {
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('statsPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 검사 완료 실적 필터링 및 테이블 렌더링
    function _filterCompletionResults() {
        const startDate = document.getElementById('completionStart')?.value || '';
        const endDate = document.getElementById('completionEnd')?.value || '';
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const partName = document.getElementById('completionPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        const container = document.getElementById('completionTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-muted);">검사 완료 실적이 없습니다.</p>`;
            return;
        }

        // 정렬 (최신순)
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const tableRows = filtered.map(d => {
            const injectionDefects = [];
            const paintingDefects = [];

            (d.defects || []).forEach(def => {
                const type = defectTypeMap[def.defectName] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(def);
                } else {
                    injectionDefects.push(def);
                }
            });

            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:4px;"><strong style="color:#ea580c;">사출:</strong> ${injectionDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장:</strong> ${paintingDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';

            const defectRate = d.inspectionQty > 0 ?
                ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

            return `
                <tr style="cursor:pointer;" onclick="PaintingInspectionModule._showCompletionDetail('${d.id}', event)">
                    <td style="white-space:nowrap;">${d.date || ''}</td>
                    <td style="white-space:nowrap;">${d.carModel || ''}</td>
                    <td><strong>${d.partName || ''}</strong></td>
                    <td>${d.color || ''}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(d.inspectionQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-green); font-weight:600;">${UIUtils.formatNumber(d.goodQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(d.defectQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:700;">${defectRate}%</td>
                    <td style="font-size:0.85rem;">${injectionDisplay}${paintingDisplay}</td>
                    <td style="text-align:center; white-space:nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-primary" onclick="PaintingInspectionModule.openEditInspectionModal('${d.id}')" style="padding:4px 8px; font-size:0.8rem;">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="PaintingInspectionModule._deleteInspection('${d.id}')" style="padding:4px 8px; font-size:0.8rem; margin-left:4px;">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>검사일</th>
                        <th>차종</th>
                        <th>품명</th>
                        <th>컬러</th>
                        <th>검사수</th>
                        <th>양품</th>
                        <th>불량</th>
                        <th>불량률</th>
                        <th>불량 유형</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    // 검사 완료 실적 상세 조회 팝업
    function _showCompletionDetail(id, event) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap = {};
        defectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        const defectRate = d.inspectionQty > 0
            ? ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

        // 불량 유형 분리
        const injDefects = [];
        const paintDefects = [];
        (d.defects || []).forEach(def => {
            if (def.defectCount > 0) {
                (defectTypeMap[def.defectName] === 'painting' ? paintDefects : injDefects).push(def);
            }
        });

        const defectRowsHtml = (group, label, color) => group.length === 0 ? '' : `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.78rem; font-weight:600; color:${color}; margin-bottom:4px;">${label}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${group.map(def => `
                        <span style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; padding:3px 10px; font-size:0.82rem;">
                            <span style="color:var(--text-muted);">${def.defectName}</span>
                            <strong style="margin-left:4px; color:var(--accent-red);">${UIUtils.formatNumber(def.defectCount)}</strong>
                        </span>
                    `).join('')}
                </div>
            </div>`;

        const popupId = 'completionDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:20px 22px; min-width:320px; max-width:420px;
            font-size:0.88rem;
        `;

        // 팝업 위치: 클릭 위치 기준
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = event.clientX + 12;
        let top  = event.clientY - 10;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';

        popup.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem; color:var(--accent-blue);">info</span>
                    <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">도장 검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:1.2rem; line-height:1; padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary); border-radius:8px; padding:12px 14px; margin-bottom:12px;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 12px; font-size:0.82rem;">
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.paintingDate || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">사출 LOT</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.lotNo || '-'}</div>
                </div>
            </div>

            <!-- 검사 수량 요약 -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px; text-align:center;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600; font-size:0.78rem; margin-top:2px;">${d.date || '-'}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사수량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-blue); margin-top:2px;">${UIUtils.formatNumber(d.inspectionQty || 0)}</div>
                </div>
                <div style="background:rgba(52,211,153,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">양품</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-green); margin-top:2px;">${UIUtils.formatNumber(d.goodQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">불량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-red); margin-top:2px;">${UIUtils.formatNumber(d.defectQty || 0)}</div>
                </div>
            </div>
            <div style="text-align:right; margin-bottom:12px;">
                <span style="font-size:0.8rem; color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700; font-size:1rem; color:${parseFloat(defectRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${defectRate}%</span>
            </div>

            <!-- 불량 상세 -->
            ${(injDefects.length > 0 || paintDefects.length > 0) ? `
            <div style="border-top:1px solid var(--border); padding-top:10px;">
                ${defectRowsHtml(injDefects,  '사출 불량', '#ea580c')}
                ${defectRowsHtml(paintDefects,'도장 불량', '#16a34a')}
            </div>` : `<div style="color:var(--text-muted); font-size:0.82rem; text-align:center; padding:4px 0;">불량 내역 없음</div>`}

            ${d.inspectors && d.inspectors.length > 0 ? `
            <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:10px; font-size:0.8rem; color:var(--text-muted);">
                검사자: <strong style="color:var(--text-primary);">${d.inspectors.join(', ')}</strong>
            </div>` : ''}
        `;

        document.body.appendChild(popup);

        // 화면 밖으로 넘어가지 않도록 위치 보정
        requestAnimationFrame(() => {
            const rect = popup.getBoundingClientRect();
            if (rect.right > vw - 8)  popup.style.left = (vw - rect.width - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 팝업 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', function _close(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _close);
                }
            });
        }, 50);
    }

    // 검사 실적 수정 모달 열기
    function openEditInspectionModal(inspectionId) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defects 배열을 ID로 매핑
        const defectMap = {};
        (inspection.defects || []).forEach(d => {
            defectMap[d.defectId] = d.defectCount || 0;
        });

        const modalContent = `
            <div style="max-width:600px;">
                <h3 style="margin-top:0;">검사 실적 수정</h3>

                <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; margin-bottom:16px;">
                    <p style="margin:0;"><strong>${inspection.carModel} ${inspection.partName}</strong> ${inspection.color ? '(' + inspection.color + ')' : ''}</p>
                    <p style="margin:4px 0 0 0; color:var(--text-muted); font-size:0.85rem;">검사일: ${inspection.date}</p>
                </div>

                <!-- 검사 정보 섹션 -->
                <div class="card" style="margin-bottom:16px;">
                    <div class="card-body">
                        <h4 style="margin:0 0 12px 0; color:var(--text-primary);">검사 정보</h4>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
                            <div class="form-group">
                                <label class="form-label">검사일자</label>
                                <input type="date" id="editInspectionDate" value="${inspection.date || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label class="form-label">검사 시작시간</label>
                                <input type="time" id="editInspectionStartTime" value="${inspection.inspectionStartTime || ''}" class="form-input" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">검사 완료시간</label>
                                <input type="time" id="editInspectionEndTime" value="${inspection.inspectionEndTime || ''}" class="form-input" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                            </div>
                            <div class="form-group">
                                <label class="form-label">소요시간</label>
                                <input type="text" id="editInspectionDuration" value="" class="form-input" readonly style="background:var(--bg-secondary);">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 검사 수량 섹션 -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div class="form-group">
                        <label class="form-label">검사수량</label>
                        <input type="number" id="editInspQty" value="${inspection.inspectionQty || 0}" class="form-input" readonly style="background:var(--bg-secondary);">
                    </div>
                    <div class="form-group">
                        <label class="form-label">양품수</label>
                        <input type="number" id="editGoodQty" value="${inspection.goodQty || 0}" class="form-input" onchange="this.dispatchEvent(new Event('change'))">
                    </div>
                    <div class="form-group">
                        <label class="form-label">불량수</label>
                        <input type="number" id="editDefectQty" value="${inspection.defectQty || 0}" class="form-input" onchange="this.dispatchEvent(new Event('change'))">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:16px; display:none;">
                    <label class="form-label">추가 검사자 (최대 5명)</label>
                    <div id="inspectorsList"></div>
                </div>

                <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:16px;">
                    <label class="form-label" style="margin-bottom:8px;">불량 유형별 개수</label>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                        ${defectTypes.map(dt => `
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.85rem;">${dt.name}</label>
                                <input type="number" class="defect-count-input" data-defect-id="${dt.id}" value="${defectMap[dt.id] || 0}" class="form-input" min="0">
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="display:flex; gap:8px; margin-top:20px; border-top:1px solid var(--border); padding-top:16px;">
                    <button class="btn btn-primary" onclick="PaintingInspectionModule._submitEditInspection('${inspectionId}')">저장</button>
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                </div>
            </div>
        `;

        UIUtils.showModal('검사 실적 수정', modalContent);

        // 검사자 목록 렌더링
        _renderInspectorsForEdit(inspection.inspectors || []);
    }

    // 검사자 목록 렌더링 (수정 모달용)
    function _renderInspectorsForEdit(inspectors) {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        container.innerHTML = inspectors.map((inspector, idx) => `
            <div style="display:flex; gap:6px; margin-bottom:6px;">
                <input type="text" value="${inspector}" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
                <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
            </div>
        `).join('') + `
            <button class="btn btn-sm btn-secondary" onclick="PaintingInspectionModule._addInspectorFieldToModal()" style="margin-top:6px;">
                + 검사자 추가
            </button>
        `;
    }

    // 검사자 추가 버튼 (수정 모달용)
    function _addInspectorFieldToModal() {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        const count = container.querySelectorAll('.inspector-input').length;
        if (count >= 5) {
            UIUtils.toast('최대 5명까지 추가 가능합니다.', 'warning');
            return;
        }

        const newField = document.createElement('div');
        newField.style.cssText = 'display:flex; gap:6px; margin-bottom:6px;';
        newField.innerHTML = `
            <input type="text" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
            <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
        `;
        container.appendChild(newField);
    }

    // 검사 실적 수정 저장 (모달에서)
    async function _submitEditInspection(inspectionId) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty = parseInt(document.getElementById('editGoodQty')?.value || 0);
        const defectQty = parseInt(document.getElementById('editDefectQty')?.value || 0);
        const inspectionQty = parseInt(document.getElementById('editInspQty')?.value || 0);

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('editInspectionDate');
        const inspectionStartTimeEl = document.getElementById('editInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('editInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : inspection.date;
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : inspection.inspectionStartTime;
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : inspection.inspectionEndTime;

        // 검사자 수집 (하단 검사자 섹션)
        const inspectorInputs = document.querySelectorAll('.inspector-input');
        const inspectors = [];
        inspectorInputs.forEach(input => {
            if (input.value.trim()) {
                inspectors.push(input.value.trim());
            }
        });

        // 불량 유형별 개수 수집
        const defects = [];
        document.querySelectorAll('.defect-count-input').forEach(input => {
            const defectId = input.getAttribute('data-defect-id');
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const defectType = Storage.getAll(DB.STORES.DEFECT_TYPES).find(dt => dt.id === defectId);
                defects.push({
                    defectId,
                    defectName: defectType?.name || '',
                    defectType: defectType?.type || 'injection',
                    defectCount: count
                });
            }
        });

        // 저장
        const success = await _saveInspectionUpdate(inspectionId, {
            goodQty,
            defectQty,
            inspectionQty,
            inspectors,
            defects,
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime
        });

        if (success) {
            // 해당 작업의 상태를 "검사 완료"로 유지
            const workId = inspection.workId || inspection.productId;
            if (workId) {
                await Storage.update(PAINTING_WORK_STORE, workId, {
                    inspectionStatus: 'completed',
                    inspectionDate: inspectionDate,
                    inspectionStartTime: inspectionStartTime,
                    inspectionEndTime: inspectionEndTime,
                    inspectors: inspectors,
                    updatedAt: new Date().toISOString()
                });
            }
            UIUtils.closeModal();
            _filterCompletionResults();
        }
    }

    // ===================================================================
    // Phase 3: 통계 대시보드
    // ===================================================================

    // 통계 대시보드 화면 렌더링
    function showStatisticsDashboard() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="statsStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="statsEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="statsCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateStatsPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="statsPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._renderStatisticsDashboard()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div id="statisticsContent"></div>
        `;

        // 초기 렌더링
        _renderStatisticsDashboard();
    }

    // 통계 대시보드 렌더링
    function _renderStatisticsDashboard() {
        const startDate = document.getElementById('statsStart')?.value || '';
        const endDate = document.getElementById('statsEnd')?.value || '';
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const partName = document.getElementById('statsPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);

        const stats = _calculateStatistics(filtered);
        const container = document.getElementById('statisticsContent');
        if (!container) return;

        // 요약 정보
        const totalInspections = filtered.length;
        const totalDefects = filtered.reduce((sum, d) => sum + (d.defectQty || 0), 0);
        const totalInspectionQty = filtered.reduce((sum, d) => sum + (d.inspectionQty || 0), 0);
        const defectRate = totalInspectionQty > 0 ? ((totalDefects / totalInspectionQty) * 100).toFixed(1) : 0;

        container.innerHTML = `
            <!-- 요약 카드 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px;">
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">검사 실적</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${totalInspections}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">건</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 검사수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(totalInspectionQty)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 불량수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${UIUtils.formatNumber(totalDefects)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">불량률</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${defectRate}%</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">평균</div>
                </div>
            </div>

            <!-- 차트 영역 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:12px; margin-bottom:16px;">
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">불량 유형별 집계</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="defectTypeChart" height="100"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">차종별 불량률</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="carModelChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- 상세 테이블 -->
            <div class="card">
                <div class="card-header">
                    <h4>불량 유형별 상세 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>불량 유형</th>
                                <th style="text-align:right;">발생 건수</th>
                                <th style="text-align:right;">발생률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byDefectType)
                                .sort((a, b) => b[1].count - a[1].count)
                                .map(([name, data]) => {
                                    const rate = totalDefects > 0 ? ((data.count / totalDefects) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right; font-weight:600;">${data.count}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>차종별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>차종</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byCarModel)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>품명별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>품명</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byPartName)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 차트 그리기
        setTimeout(() => {
            _renderStatisticsCharts(stats);
        }, 100);
    }

    // 통계 집계 (차종/품명/불량유형별)
    function _calculateStatistics(data) {
        const stats = {
            byCarModel: {},
            byPartName: {},
            byDefectType: {}
        };

        data.forEach(d => {
            // 차종별
            if (!stats.byCarModel[d.carModel]) {
                stats.byCarModel[d.carModel] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byCarModel[d.carModel].inspectionQty += d.inspectionQty || 0;
            stats.byCarModel[d.carModel].defectQty += d.defectQty || 0;

            // 부품별
            if (!stats.byPartName[d.partName]) {
                stats.byPartName[d.partName] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byPartName[d.partName].inspectionQty += d.inspectionQty || 0;
            stats.byPartName[d.partName].defectQty += d.defectQty || 0;

            // 불량유형별
            (d.defects || []).forEach(def => {
                if (!stats.byDefectType[def.defectName]) {
                    stats.byDefectType[def.defectName] = { count: 0 };
                }
                stats.byDefectType[def.defectName].count += def.defectCount || 0;
            });
        });

        return stats;
    }

    // 통계 차트 그리기
    function _renderStatisticsCharts(stats) {
        // 불량 유형별 막대 차트
        const defectTypeCtx = document.getElementById('defectTypeChart');
        if (defectTypeCtx && window.Chart) {
            const defectLabels = Object.keys(stats.byDefectType).sort((a, b) =>
                stats.byDefectType[b].count - stats.byDefectType[a].count
            );
            const defectData = defectLabels.map(name => stats.byDefectType[name].count);

            new Chart(defectTypeCtx, {
                type: 'bar',
                data: {
                    labels: defectLabels,
                    datasets: [{
                        label: '불량 발생수',
                        data: defectData,
                        backgroundColor: '#ea580c',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }

        // 차종별 원형 차트
        const carModelCtx = document.getElementById('carModelChart');
        if (carModelCtx && window.Chart) {
            const carModelLabels = Object.keys(stats.byCarModel);
            const carModelData = carModelLabels.map(name => {
                const data = stats.byCarModel[name];
                return data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
            });

            new Chart(carModelCtx, {
                type: 'doughnut',
                data: {
                    labels: carModelLabels,
                    datasets: [{
                        data: carModelData,
                        backgroundColor: ['#ea580c', '#16a34a', '#0066ff', '#ffaa00', '#ee00ee', '#00dddd']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } }
                    }
                }
            });
        }
    }

    // ===================================================================
    // Phase 1: 기초 인프라 함수
    // ===================================================================

    // 공용 필터: 기간, 차종, 품명
    function _applyCommonFilters(data, startDate, endDate, carModel, partName) {
        return data.filter(d => {
            const dateMatch = (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate);
            const carModelMatch = !carModel || d.carModel === carModel;
            const partNameMatch = !partName || d.partName === partName;
            return dateMatch && carModelMatch && partNameMatch;
        });
    }

    // 고유 차종 추출
    function _getUniqueCarModels(data) {
        return [...new Set(data.map(d => d.carModel).filter(Boolean))].sort();
    }

    // 고유 품명 추출
    function _getUniquePartNames(data) {
        return [...new Set(data.map(d => d.partName).filter(Boolean))].sort();
    }

    // 불량별 개별 레코드 → 검사 단위 그룹화 (호환성 유지)
    function _normalizeInspectionData(rawRecords) {
        const grouped = {};
        rawRecords.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    id: d.id || `insp-${Date.now()}-${Math.random()}`,
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || [],
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt
                };
            }
            if (d.defectName) {
                grouped[key].defects.push({
                    defectId: d.defectId,
                    defectName: d.defectName,
                    defectType: d.defectType,
                    defectCount: d.defectCount || 0
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });
        return Object.values(grouped);
    }

    // 검사 실적 수정 저장
    async function _saveInspectionUpdate(inspectionId, data) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        // 검증: 양품수 + 불량수 = 검사수량
        const goodQty = parseInt(data.goodQty || 0);
        const defectQty = parseInt(data.defectQty || 0);
        const inspectionQty = parseInt(data.inspectionQty || inspection.inspectionQty || 0);
        const workId = inspection.workId || inspection.productId;
        const work = workId ? Storage.getById(PAINTING_WORK_STORE, workId) : null;
        const workQty = _getPaintingWorkQty(work) || inspectionQty;

        if (!_validateDefectQtyWithinWorkQty(defectQty, workQty)) {
            return false;
        }
        if (goodQty + defectQty !== inspectionQty) {
            UIUtils.toast(`양품수(${goodQty}) + 불량수(${defectQty}) = 검사수량(${inspectionQty})이어야 합니다.`, 'warning');
            return false;
        }
        const detailDefectTotal = (data.defects || inspection.defects || [])
            .reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return false;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, workQty)) {
            return false;
        }

        // 업데이트
        const updated = {
            ...inspection,
            date: data.date || inspection.date,
            inspectionStartTime: data.inspectionStartTime || inspection.inspectionStartTime,
            inspectionEndTime: data.inspectionEndTime || inspection.inspectionEndTime,
            goodQty,
            defectQty,
            defects: data.defects || inspection.defects || [],
            inspectors: data.inspectors || inspection.inspectors || [],
            updatedAt: new Date().toISOString()
        };

        await Storage.update(STORE, inspectionId, updated);
        UIUtils.toast('검사 실적이 수정되었습니다.', 'success');
        return true;
    }

    // 검사 실적 삭제
    async function _deleteInspection(inspectionId) {
        if (!confirm('이 검사 실적을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) {
            return false;
        }

        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        await Storage.remove(STORE, inspectionId);

        // 해당 작업의 상태를 초기화 (검사 미완료로)
        const workId = inspection.workId || inspection.productId;
        if (workId) {
            await Storage.update(PAINTING_WORK_STORE, workId, {
                inspectionStatus: 'pending',
                inspectionDate: null,
                updatedAt: new Date().toISOString()
            });
        }

        UIUtils.toast('검사 실적이 삭제되었습니다.', 'success');

        // 검사 완료 실적 목록도 새로고침
        if (state.currentTab === 'completion') {
            _filterCompletionResults();
        }

        return true;
    }

    return {
        render,
        selectPlan,
        openInspectionModal,
        selectProduct,
        increment,
        decrement,
        save,
        reset,
        showHistory,
        _filterHistoryTable,
        exportData,
        // Phase 3: 통계 대시보드
        showStatisticsDashboard,
        _renderStatisticsDashboard,
        _calculateStatistics,
        _renderStatisticsCharts,
        // Phase 2: 검사 완료 실적
        showCompletionResults,
        _filterCompletionResults,
        _showCompletionDetail,
        _updateCompletionPartFilter,
        _updateStatsPartFilter,
        openEditInspectionModal,
        _submitEditInspection,
        _addInspectorFieldToModal,
        _switchTab,
        _renderTabContent,
        // Phase 1: 기초 인프라
        _applyCommonFilters,
        _getUniqueCarModels,
        _getUniquePartNames,
        _normalizeInspectionData,
        _saveInspectionUpdate,
        _deleteInspection,
        // 검사 모달 헬퍼 함수들
        _incInjDefect,
        _decInjDefect,
        _incPaintDefect,
        _decPaintDefect,
        _updateDefectQty,
        _updateGoodQty,
        _updateDefectTotal,
        _calculateInspectionTime,
        _saveInspection,
        _addInspectorField,
        _closeInspectionModal,
        _showNumericPad,
        _numpadInput,
        _numpadDelete,
        _numpadConfirm
    };
})();


// ===================================================================
// 도장품 출고
// ===================================================================
const PaintingOutgoingModule = (function() {
    const STORE = DB.STORES.PAINTING_OUTGOING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingOutgoingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 출고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="poStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="poEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingOutgoingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>출고일</th>
                                        <th>품명</th>
                                        <th>수량</th>
                                        <th>행선지</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="poTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('poStart').value;
        const end = document.getElementById('poEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('poTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.destination || '-'}</td>
                <td>${d.note || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="PaintingOutgoingModule.remove('${d.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장품 출고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="addPoDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPoPart" placeholder="품명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPoQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">행선지</label>
                    <input type="text" class="form-input" id="addPoDest" placeholder="예: 출하검사">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPoNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingOutgoingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPoDate').value,
            partName: document.getElementById('addPoPart').value.trim(),
            quantity: Number(document.getElementById('addPoQty').value) || 0,
            destination: document.getElementById('addPoDest').value.trim(),
            note: document.getElementById('addPoNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 출하검사 대기에도 자동 등록
        await Storage.add(DB.STORES.SHIPPING_STANDBY, {
            date: data.date,
            partName: data.partName,
            quantity: data.quantity,
            status: '대기',
            source: '도장품 출고'
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장품 출고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();
