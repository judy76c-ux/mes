/**
 * 대시보드 모듈
 * 전체 공정 현황을 한눈에 보여주는 대시보드
 */

const DashboardModule = (function() {
    const STORE = DB.STORES;
    const FPROOF_ITEMS = [
        { key:'fp01', name:'도장 부스 온습도 및 건조로(IR) 모니터링' },
        { key:'fp02', name:'세척용 카운터' },
        { key:'fp03', name:'텐렉 카운터' },
        { key:'fp04', name:'도료 배합 시간' },
        { key:'fp05', name:'도료 배합 비율' },
        { key:'fp06', name:'도료 가사시간 확인 - 모니터링 PC A,B' },
        { key:'fp07', name:'도료 가사시간 확인 - A-2부스 왼쪽' },
        { key:'fp08', name:'도료 가사시간 확인 - A-4부스 오른쪽' },
        { key:'fp09', name:'도료 가사시간 확인 - B-2부스 왼쪽' },
        { key:'fp10', name:'도료 가사시간 확인 - B-3부스 왼쪽' },
        { key:'fp11', name:'도료 저수위 감지 - A-1부스 오른쪽' },
        { key:'fp12', name:'도료 저수위 감지 - A-2부스 왼쪽' },
        { key:'fp13', name:'도료 저수위 감지 - A-4부스 오른쪽' },
        { key:'fp14', name:'도료 저수위 감지 - B-2부스 왼쪽' },
        { key:'fp15', name:'도료 저수위 감지 - B-3부스 왼쪽' }
    ];
    const ILLUMINATION_POINTS = [
        { pointNo:1, posNo:1, location:'배합실', standard:500 },
        { pointNo:2, posNo:1, location:'A라인 로딩', standard:500 },
        { pointNo:2, posNo:2, location:'A라인 언로딩', standard:500 },
        { pointNo:3, posNo:1, location:'B라인 로딩', standard:500 },
        { pointNo:3, posNo:2, location:'B라인 언로딩', standard:500 },
        { pointNo:4, posNo:1, location:'B라인 검사대', standard:2000 },
        { pointNo:5, posNo:1, location:'레이저 #1', standard:2000 },
        { pointNo:5, posNo:2, location:'레이저 #2', standard:2000 },
        { pointNo:5, posNo:3, location:'레이저 #3', standard:2000 }
    ];

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 공정 흐름도 -->
                <div class="card" style="margin-bottom:24px;display:none;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">timeline</span> 생산 공정 흐름</h4>
                    </div>
                    <div class="card-body">
                        <div class="process-flow" id="processFlow"></div>
                    </div>
                </div>

                <!-- 통계 카드 -->
                <div class="stat-cards" id="statCards"></div>

                <!-- 날짜 필터 -->
                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="dashStartDate" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="dashEndDate" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-primary" onclick="DashboardModule.refresh()">
                            <span class="material-symbols-outlined">refresh</span> 새로고침
                        </button>
                    </div>
                </div>

                <!-- 3정5S 현황 패널 -->
                <div id="dashFiveSPanel" style="margin-bottom:24px;"></div>

                <div id="dashIlluminationPanel" style="margin-bottom:24px;"></div>

                <div id="dashDailyWorkPanel" style="margin-bottom:24px;"></div>

                <!-- 차트 -->
                <div class="dashboard-grid" id="dashboardCharts">
                    <div class="chart-card">
                        <h4><span class="material-symbols-outlined">bar_chart</span> 공정별 처리 현황</h4>
                        <canvas id="processChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h4><span class="material-symbols-outlined">trending_up</span> 일별 생산 추이</h4>
                        <canvas id="trendChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h4><span class="material-symbols-outlined">pie_chart</span> 불량 유형별 분포</h4>
                        <canvas id="defectPieChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h4><span class="material-symbols-outlined">analytics</span> 불량률 추이</h4>
                        <canvas id="defectRateChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        renderStats();
        renderFiveSPanel();   // 3정5S 현황 (비동기)
        renderIlluminationPanel();
        renderDailyWorkPanel();
        renderCharts();
    }

    // 공정 흐름도 렌더링
    function renderProcessFlow() {
        const steps = [{
                label: '생산계획',
                page: 'production-plan',
                color: '#3b82f6',
                icon: '📋'
            },
            {
                label: '사출입고',
                page: 'injection-incoming',
                color: '#8b5cf6',
                icon: '📦'
            },
            {
                label: '사출창고',
                page: 'injection-warehouse',
                color: '#6d28d9',
                icon: '🏭'
            },
            {
                label: '도장입고',
                page: 'painting-incoming',
                color: '#06b6d4',
                icon: '🎨'
            },
            {
                label: '도장작업',
                page: 'painting-work',
                color: '#0891b2',
                icon: '⚙️'
            },
            {
                label: '도장검사',
                page: 'painting-inspection',
                color: '#f97316',
                icon: '🔍'
            },
            {
                label: '도장출고',
                page: 'painting-outgoing',
                color: '#ea580c',
                icon: '📤'
            },
            {
                label: '출하대기',
                page: 'shipping-standby',
                color: '#f59e0b',
                icon: '⏳'
            },
            {
                label: '출하검사',
                page: 'shipping-inspection',
                color: '#eab308',
                icon: '✅'
            },
            {
                label: '제품창고',
                page: 'product-warehouse',
                color: '#10b981',
                icon: '🏪'
            },
            {
                label: '제품출고',
                page: 'product-outgoing',
                color: '#059669',
                icon: '🚚'
            }
        ];

        const el = document.getElementById('processFlow');
        el.innerHTML = steps.map((step, i) => `
            <div class="process-step" onclick="Router.navigate('${step.page}')">
                <div class="process-step-icon" style="background:${step.color}">
                    ${step.icon}
                </div>
                <span class="process-step-label">${step.label}</span>
            </div>
            ${i < steps.length - 1 ? '<span class="process-arrow material-symbols-outlined">arrow_forward</span>' : ''}
        `).join('');
    }

    // 통계 카드 렌더링
    function renderStats() {
        const plans = Storage.getAll(STORE.PRODUCTION_PLANS);
        const injInsp = Storage.getAll(STORE.INJECTION_INSPECTIONS);
        const injInv = Storage.getAll(STORE.INJECTION_INVENTORY);
        const paintWork = Storage.getAll(STORE.PAINTING_WORK);
        const paintInsp = Storage.getAll(STORE.PAINTING_INSPECTIONS);
        const prodInv = Storage.getAll(STORE.PRODUCT_INVENTORY);

        // 오늘 날짜
        const todayStr = UIUtils.today();
        const todayPlans = plans.filter(p => p.date === todayStr);
        const todayPaintWork = paintWork.filter(p => p.date === todayStr);

        // 재고 총합
        const injTotal = injInv.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
        const prodTotal = prodInv.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

        // 오늘 불량 수
        const todayDefects = paintInsp.filter(p => p.date === todayStr);
        const totalDefectCount = todayDefects.reduce((s, d) => s + (Number(d.defectCount) || 0), 0);

        const el = document.getElementById('statCards');
        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-icon blue"><span class="material-symbols-outlined">assignment</span></div>
                <div class="stat-card-value">${todayPlans.length}</div>
                <div class="stat-card-label">오늘 생산 계획</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-icon purple"><span class="material-symbols-outlined">warehouse</span></div>
                <div class="stat-card-value">${UIUtils.formatNumber(injTotal)}</div>
                <div class="stat-card-label">사출 재고 (EA)</div>
            </div>
            <div class="stat-card cyan">
                <div class="stat-card-icon cyan"><span class="material-symbols-outlined">format_paint</span></div>
                <div class="stat-card-value">${todayPaintWork.length}</div>
                <div class="stat-card-label">오늘 도장 작업</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-icon red"><span class="material-symbols-outlined">report_problem</span></div>
                <div class="stat-card-value">${UIUtils.formatNumber(totalDefectCount)}</div>
                <div class="stat-card-label">오늘 불량 수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-icon green"><span class="material-symbols-outlined">inventory_2</span></div>
                <div class="stat-card-value">${UIUtils.formatNumber(prodTotal)}</div>
                <div class="stat-card-label">제품 재고 (EA)</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-icon orange"><span class="material-symbols-outlined">local_shipping</span></div>
                <div class="stat-card-value">${Storage.getAll(STORE.SHIPPING_STANDBY).filter(s => s.status === '대기').length}</div>
                <div class="stat-card-label">출하 대기 건</div>
            </div>
        `;
    }

    // 차트 렌더링
    function renderCharts() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js가 로드되지 않았습니다. 차트를 렌더링할 수 없습니다.');
            return;
        }
        const el1 = document.getElementById('dashStartDate');
        const el2 = document.getElementById('dashEndDate');
        const startDate = el1 ? el1.value : UIUtils.monthAgo();
        const endDate = el2 ? el2.value : UIUtils.today();

        renderProcessChart(startDate, endDate);
        renderTrendChart(startDate, endDate);
        renderDefectPieChart(startDate, endDate);
        renderDefectRateChart(startDate, endDate);
    }

    // 공정별 처리 현황 (막대)
    function renderProcessChart(start, end) {
        const ctx = document.getElementById('processChart');
        if (!ctx) return;

        const data = [{
                label: '생산계획',
                count: Storage.getByDateRange(STORE.PRODUCTION_PLANS, start, end).length,
                color: '#3b82f6'
            },
            {
                label: '사출검사',
                count: Storage.getByDateRange(STORE.INJECTION_INSPECTIONS, start, end).length,
                color: '#8b5cf6'
            },
            {
                label: '도장입고',
                count: Storage.getByDateRange(STORE.PAINTING_INCOMING, start, end).length,
                color: '#06b6d4'
            },
            {
                label: '도장작업',
                count: Storage.getByDateRange(STORE.PAINTING_WORK, start, end).length,
                color: '#0891b2'
            },
            {
                label: '도장검사',
                count: Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end).length,
                color: '#f97316'
            },
            {
                label: '출하검사',
                count: Storage.getByDateRange(STORE.SHIPPING_INSPECTIONS, start, end).length,
                color: '#f59e0b'
            },
            {
                label: '제품출고',
                count: Storage.getByDateRange(STORE.PRODUCT_OUTGOING, start, end).length,
                color: '#10b981'
            }
        ];

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: '처리 건수',
                    data: data.map(d => d.count),
                    backgroundColor: data.map(d => d.color),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    // 일별 생산 추이 (라인)
    function renderTrendChart(start, end) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        const workData = Storage.getByDateRange(STORE.PAINTING_WORK, start, end);

        // 날짜별 그룹핑
        const byDate = {};
        workData.forEach(w => {
            const d = w.date;
            if (!byDate[d]) byDate[d] = 0;
            byDate[d] += Number(w.productionQty) || 0;
        });

        const sortedDates = Object.keys(byDate).sort();

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: '생산량',
                    data: sortedDates.map(d => byDate[d]),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 불량 유형별 파이
    function renderDefectPieChart(start, end) {
        const ctx = document.getElementById('defectPieChart');
        if (!ctx) return;

        const inspData = Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end);
        const byType = {};
        inspData.forEach(d => {
            const name = d.defectName || '기타';
            if (!byType[name]) byType[name] = 0;
            byType[name] += Number(d.defectCount) || 0;
        });

        const labels = Object.keys(byType);
        const values = Object.values(byType);
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

        if (labels.length === 0) {
            ctx.parentElement.innerHTML += '<div class="empty-state"><p>데이터가 없습니다.</p></div>';
            ctx.style.display = 'none';
            return;
        }

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12
                        }
                    }
                }
            }
        });
    }

    // 불량률 추이
    function renderDefectRateChart(start, end) {
        const ctx = document.getElementById('defectRateChart');
        if (!ctx) return;

        const workData = Storage.getByDateRange(STORE.PAINTING_WORK, start, end);
        const inspData = Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end);

        // 날짜별 생산량과 불량수
        const prodByDate = {};
        const defByDate = {};

        workData.forEach(w => {
            if (!prodByDate[w.date]) prodByDate[w.date] = 0;
            prodByDate[w.date] += Number(w.productionQty) || 0;
        });
        inspData.forEach(d => {
            if (!defByDate[d.date]) defByDate[d.date] = 0;
            defByDate[d.date] += Number(d.defectCount) || 0;
        });

        const allDates = [...new Set([...Object.keys(prodByDate), ...Object.keys(defByDate)])].sort();
        const rates = allDates.map(d => {
            const prod = prodByDate[d] || 1;
            const def = defByDate[d] || 0;
            return ((def / prod) * 100).toFixed(1);
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: [{
                    label: '불량률 (%)',
                    data: rates,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '불량률 (%)'
                        }
                    }
                }
            }
        });
    }

    /* ══════════════════════════════════════════════════════════
       3정5S 현황 패널
    ══════════════════════════════════════════════════════════ */
    async function renderFiveSPanel() {
        const el = document.getElementById('dashFiveSPanel');
        if (!el) return;

        // S5 스토어 존재 여부 확인 (DB 버전 업그레이드 전일 수 있음)
        const s5Store     = DB.STORES.S5_INSPECTIONS;
        const s5IssStore  = DB.STORES.S5_ISSUES;
        if (!s5Store || !s5IssStore) { el.style.display = 'none'; return; }

        const today       = UIUtils.today();
        const thisMonth   = today.slice(0, 7);
        const inspections = Storage.getAll(s5Store)     || [];
        const issues      = Storage.getAll(s5IssStore)  || [];

        // ── 요약 수치 ─────────────────────────────────────────────
        const monthInsp   = inspections.filter(r => (r.date || '').startsWith(thisMonth));
        const openIssues  = issues.filter(r => r.status !== '완료');
        const overdue     = issues.filter(r => r.status !== '완료' && r.dueDate && r.dueDate < today);

        // ── 최근 점검 이력 (최대 5건) ─────────────────────────────
        const recentInsp = [...inspections]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .slice(0, 5);

        const issueCountMap = {};
        issues.forEach(i => {
            if (i.inspectionId) issueCountMap[i.inspectionId] = (issueCountMap[i.inspectionId] || 0) + 1;
        });

        function gradeInfo(score) {
            if (score >= 95) return { g: 'S', c: '#6366f1', bg: 'rgba(99,102,241,0.12)' };
            if (score >= 85) return { g: 'A', c: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
            if (score >= 75) return { g: 'B', c: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
            return { g: 'C', c: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
        }

        const inspRows = recentInsp.length
            ? recentInsp.map(r => {
                const g  = gradeInfo(r.totalScore || 0);
                const ic = issueCountMap[r.id] || 0;
                const daysAgo = Math.floor((new Date(today) - new Date(r.date)) / 86400000);
                return `<tr>
                    <td style="font-weight:600;">${r.date || '-'}</td>
                    <td>${r.area || '-'}</td>
                    <td>${r.inspector || '-'}</td>
                    <td style="text-align:center;font-weight:700;">${r.totalScore || 0}점</td>
                    <td style="text-align:center;">
                        <span style="background:${g.bg};color:${g.c};font-weight:700;
                                     padding:1px 8px;border-radius:4px;">${g.g}</span>
                    </td>
                    <td style="text-align:center;">
                        ${ic ? `<span style="color:var(--accent-orange);font-weight:700;">${ic}건</span>` : '-'}
                    </td>
                    <td style="text-align:center;font-size:0.78rem;color:var(--text-muted);">
                        ${daysAgo === 0 ? '오늘' : `${daysAgo}일 전`}
                    </td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted);">
                점검 이력이 없습니다.
               </td></tr>`;

        // ── 차기 점검 예정 (config 비동기 로드) ──────────────────
        const planData    = await Storage.getConfigValue('s5_plan').catch(() => null);
        const assignments = planData?.assignments || [];
        const upcoming    = _calcUpcomingForDash(assignments, today);

        // 미실시 건수 (예정일 <= 오늘, 실제 점검 없음)
        const missed = upcoming.filter(n => {
            if (n.date > today) return false;
            return !inspections.some(i => i.date === n.date && i.area === n.area);
        });

        // 차기 미점검 일정 (오늘 이후 + 아직 안 한 것 포함, 최대 5건)
        const nextPlanned = upcoming
            .filter(n => n.date >= today && !inspections.some(i => i.date === n.date && i.area === n.area))
            .slice(0, 5);

        const planRows = nextPlanned.length
            ? nextPlanned.map(n => {
                const ddays = Math.floor((new Date(n.date) - new Date(today)) / 86400000);
                const ddLabel = ddays === 0 ? '<span style="color:var(--accent-red);font-weight:700;">D-day</span>'
                              : `<span style="color:${ddays <= 3 ? 'var(--accent-orange)' : 'var(--text-muted)'};">D-${ddays}</span>`;
                return `<tr>
                    <td style="font-weight:600;">${n.date}</td>
                    <td>${n.area}</td>
                    <td>${n.assignee || '-'}</td>
                    <td style="text-align:center;">${ddLabel}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">
                ${assignments.length ? '예정된 점검 일정이 없습니다.' : '점검 계획이 설정되지 않았습니다.'}
               </td></tr>`;

        // 상단 배지 색상
        const summaryColor = overdue.length ? '#ef4444' : openIssues.length ? '#f59e0b' : '#22c55e';
        const missedBadge  = missed.length
            ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
                            background:rgba(239,68,68,0.12);color:#ef4444;border-radius:12px;
                            font-size:0.78rem;font-weight:700;">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">warning</span>
                미실시 ${missed.length}건
               </span>`
            : '';

        el.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue);">cleaning_services</span>
                    3정5S 관리 현황
                </h4>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <!-- 요약 배지 -->
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
                                 background:rgba(59,130,246,0.1);color:var(--accent-blue);border-radius:12px;
                                 font-size:0.78rem;font-weight:700;">
                        이번달 점검 ${monthInsp.length}회
                    </span>
                    ${openIssues.length
                        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
                                        background:${summaryColor}1a;color:${summaryColor};border-radius:12px;
                                        font-size:0.78rem;font-weight:700;">
                            미결 ${openIssues.length}건${overdue.length ? ` (기한초과 ${overdue.length})` : ''}
                           </span>`
                        : '<span style="padding:3px 10px;background:rgba(34,197,94,0.12);color:#22c55e;border-radius:12px;font-size:0.78rem;font-weight:700;">지적사항 없음</span>'}
                    ${missedBadge}
                    <button class="btn btn-sm btn-outline"
                        onclick="Router.navigate('five-s')"
                        style="font-size:0.78rem;padding:3px 10px;">
                        <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">open_in_new</span>
                        3정5S 관리
                    </button>
                </div>
            </div>
            <div class="card-body" style="padding-top:8px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                    <!-- 최근 점검 이력 -->
                    <div>
                        <div style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);
                                    margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">history</span>
                            최근 점검 이력
                        </div>
                        <div class="data-table-wrapper" style="max-height:220px;overflow-y:auto;">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead><tr>
                                <th>날짜</th><th>구역</th><th>점검자</th>
                                <th>점수</th><th>등급</th><th>지적</th><th>경과</th>
                            </tr></thead>
                            <tbody>${inspRows}</tbody>
                        </table>
                        </div>
                    </div>
                    <!-- 차기 점검 예정 -->
                    <div>
                        <div style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);
                                    margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">event_upcoming</span>
                            차기 점검 예정일
                            ${missed.length
                                ? `<span style="margin-left:4px;font-size:0.72rem;padding:1px 6px;
                                               background:rgba(239,68,68,0.12);color:#ef4444;border-radius:4px;">
                                    ⚠ 미실시 ${missed.length}건
                                   </span>`
                                : ''}
                        </div>
                        <div class="data-table-wrapper" style="max-height:220px;overflow-y:auto;">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead><tr>
                                <th>예정일</th><th>구역</th><th>담당자</th><th>D-day</th>
                            </tr></thead>
                            <tbody>${planRows}</tbody>
                        </table>
                        </div>
                        ${missed.length ? `
                        <div style="margin-top:8px;padding:6px 10px;background:rgba(239,68,68,0.07);
                                    border-radius:6px;font-size:0.78rem;color:#ef4444;">
                            ⚠ 미실시 항목이 있습니다 —
                            <a href="#" onclick="Router.navigate('five-s');return false;"
                               style="color:#ef4444;font-weight:700;text-decoration:underline;">
                                지금 점검 일지 작성
                            </a>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    /* 향후 점검 예정일 계산 (대시보드용 간소화) */
    function _calcUpcomingForDash(assignments, today) {
        const results  = [];
        const ms1day   = 24 * 3600 * 1000;
        const dayMap   = { '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5 };
        const base     = new Date(today);

        assignments.forEach(a => {
            if (!a.assignee) return;
            const targetDay = dayMap[a.day] ?? 1;

            for (let w = -1; w <= 5; w++) {
                if (a.cycle === '격주' && ((w + 10) % 2 !== 0)) continue;
                if (a.cycle === '월간' && w !== 0) continue;

                const pivot = new Date(base.getTime() + w * 7 * ms1day);
                const diff  = (targetDay - pivot.getDay() + 7) % 7;
                const date  = new Date(pivot.getTime() + diff * ms1day);
                const dateStr = date.toISOString().split('T')[0];
                if (!results.find(r => r.date === dateStr && r.area === a.area)) {
                    results.push({ date: dateStr, area: a.area, assignee: a.assignee });
                }
            }
        });

        const fromDate  = new Date(base.getTime() - 7  * ms1day).toISOString().split('T')[0];
        const untilDate = new Date(base.getTime() + 35 * ms1day).toISOString().split('T')[0];

        return results
            .filter(r => r.date >= fromDate && r.date <= untilDate)
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    function renderIlluminationPanel() {
        const el = document.getElementById('dashIlluminationPanel');
        if (!el) return;
        const store = DB.STORES.EQUIP_ILLUMINATION_LOG;
        if (!store) { el.style.display = 'none'; return; }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const records = (Storage.getAll(store) || [])
            .filter(r => Number(r.year) === year && Number(r.month) === month);
        const byKey = {};
        records.forEach(r => { byKey[r.pointKey] = r; });

        const done = ILLUMINATION_POINTS.filter(p => byKey[_illumKey(p)]);
        const missing = ILLUMINATION_POINTS.filter(p => !byKey[_illumKey(p)]);
        const failed = done.filter(p => Number(byKey[_illumKey(p)].lux) < Number(p.standard));
        const rate = Math.round((done.length / Math.max(ILLUMINATION_POINTS.length, 1)) * 100);
        const dueEnd = new Date(year, month - 1, 7, 23, 59, 59);
        const overdue = now > dueEnd && missing.length > 0;
        const statusColor = missing.length === 0 && failed.length === 0 ? '#22c55e' : overdue ? '#ef4444' : '#f59e0b';
        const statusText = missing.length === 0 ? (failed.length ? '기준 미달 조치 필요' : '월간 점검 완료') : overdue ? '점검 누락 발생' : '점검 예정/진행';

        el.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="color:#f59e0b;">lightbulb</span>
                    조도관리 월간 점검 누락 방지
                </h4>
                <button class="btn btn-sm btn-outline" onclick="DashboardModule.openIlluminationCheck()"
                    style="font-size:0.78rem;padding:3px 10px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">open_in_new</span>
                    조도 점검 이동
                </button>
            </div>
            <div class="card-body" style="padding-top:8px;">
                <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:stretch;">
                    <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:700;">${year}년 ${month}월</div>
                        <div style="margin-top:5px;font-size:1.05rem;font-weight:900;color:${statusColor};">${statusText}</div>
                        <div style="margin-top:10px;display:flex;align-items:center;gap:14px;">
                            <div style="width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                                        background:conic-gradient(${statusColor} ${rate}%, #e5e7eb 0);">
                                <div style="width:56px;height:56px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;
                                            font-weight:900;color:var(--text-primary);">${rate}%</div>
                            </div>
                            <div style="font-size:.78rem;color:var(--text-muted);line-height:1.75;">
                                대상 <b style="color:var(--text-primary);">${ILLUMINATION_POINTS.length}</b>곳<br>
                                완료 <b style="color:#22c55e;">${done.length}</b>건<br>
                                미등록 <b style="color:${missing.length ? '#ef4444' : 'var(--text-primary)'};">${missing.length}</b>건<br>
                                기준미달 <b style="color:${failed.length ? '#f97316' : 'var(--text-primary)'};">${failed.length}</b>건
                            </div>
                        </div>
                        <div style="margin-top:10px;font-size:.72rem;color:var(--text-muted);">권장 점검기간: 매월 첫 주 09:00~10:00</div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                            <div style="font-weight:850;margin-bottom:8px;color:var(--text-primary);">미등록 위치</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:118px;overflow:auto;">
                                ${missing.length ? missing.map(p => `
                                    <button type="button" class="btn btn-outline" style="padding:5px 8px;font-size:.75rem;"
                                        onclick="DashboardModule.openIlluminationCheck('${_illumKey(p)}')">
                                        <span class="material-symbols-outlined" style="font-size:14px;color:#f59e0b;">pending_actions</span>
                                        ${p.pointNo}-${p.posNo} ${_esc(p.location)}
                                    </button>`).join('') : `
                                    <div style="width:100%;padding:24px;text-align:center;color:#22c55e;font-weight:800;background:#f0fdf4;border-radius:8px;">
                                        이번 달 조도 점검이 모두 등록되었습니다.
                                    </div>`}
                            </div>
                        </div>
                        <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                            <div style="font-weight:850;margin-bottom:8px;color:var(--text-primary);">기준 미달</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:118px;overflow:auto;">
                                ${failed.length ? failed.map(p => {
                                    const r = byKey[_illumKey(p)];
                                    return `<button type="button" class="btn btn-outline" style="padding:5px 8px;font-size:.75rem;border-color:#fed7aa;color:#c2410c;"
                                        onclick="DashboardModule.openIlluminationCheck('${_illumKey(p)}')">
                                        ${p.pointNo}-${p.posNo} ${_esc(p.location)} ${r.lux}Lux
                                    </button>`;
                                }).join('') : `
                                    <div style="width:100%;padding:24px;text-align:center;color:var(--text-muted);background:#f8fafc;border-radius:8px;">
                                        기준 미달 항목이 없습니다.
                                    </div>`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _illumKey(p) {
        return `${p.pointNo}_${p.posNo}`;
    }

    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function openIlluminationCheck(pointKey) {
        try {
            sessionStorage.setItem('prodEquipmentMode', 'illumination');
            if (pointKey) {
                const m = new Date().getMonth() + 1;
                sessionStorage.setItem('prodEquipmentIlluminationPoint', JSON.stringify({ pointKey, month: m }));
            }
        } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function renderDailyWorkPanel() {
        const el = document.getElementById('dashDailyWorkPanel');
        if (!el) return;
        const store = DB.STORES.EQUIP_FPROOF_LOG;
        if (!store) { el.style.display = 'none'; return; }
        const today = UIUtils.today();
        const checked = new Set((Storage.getAll(store) || []).filter(r => r.date === today).map(r => r.itemKey));
        const missing = FPROOF_ITEMS.filter(i => !checked.has(i.key));
        const done = FPROOF_ITEMS.length - missing.length;
        const rate = Math.round(done / Math.max(FPROOF_ITEMS.length, 1) * 100);
        const color = missing.length ? '#ef4444' : '#22c55e';
        el.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="color:${color};">task_alt</span>
                    일일 업무 기록점검
                </h4>
                <button class="btn btn-sm btn-outline" onclick="DashboardModule.openFProof()"
                    style="font-size:0.78rem;padding:3px 10px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">open_in_new</span>
                    F/PROOF 이동
                </button>
            </div>
            <div class="card-body" style="padding-top:8px;">
                <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;">
                    <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:700;">${today}</div>
                        <div style="margin-top:5px;font-size:1.05rem;font-weight:900;color:${color};">${missing.length ? 'F/PROOF 미점검' : 'F/PROOF 완료'}</div>
                        <div style="margin-top:10px;font-size:.82rem;color:var(--text-secondary);line-height:1.7;">
                            완료 <b style="color:#22c55e;">${done}</b> / 대상 <b>${FPROOF_ITEMS.length}</b><br>
                            진행률 <b>${rate}%</b>
                        </div>
                    </div>
                    <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                        <div style="font-weight:850;margin-bottom:8px;color:var(--text-primary);">미점검 항목</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:118px;overflow:auto;">
                            ${missing.length ? missing.map(i => `
                                <button type="button" class="btn btn-outline" style="padding:5px 8px;font-size:.75rem;"
                                    onclick="DashboardModule.openFProof()">
                                    <span class="material-symbols-outlined" style="font-size:14px;color:#ef4444;">pending_actions</span>${_esc(i.name)}
                                </button>`).join('') : `
                                <div style="width:100%;padding:24px;text-align:center;color:#22c55e;font-weight:800;background:#f0fdf4;border-radius:8px;">
                                    오늘 F/PROOF C/SHEET 기록이 모두 완료되었습니다.
                                </div>`}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function openFProof() {
        try { sessionStorage.setItem('prodEquipmentMode', 'fproof'); } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function refresh() {
        const container = document.getElementById('contentArea');
        render(container);
        UIUtils.toast('대시보드를 새로고침했습니다.', 'success');
    }

    return {
        render,
        refresh,
        openIlluminationCheck,
        openFProof
    };
})();
