/**
 * 대시보드 모듈
 * 전체 공정 현황을 한눈에 보여주는 대시보드
 */

const DashboardModule = (function() {
    const STORE = DB.STORES;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 공정 흐름도 -->
                <div class="card" style="margin-bottom:24px;">
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

        renderProcessFlow();
        renderStats();
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

    function refresh() {
        const container = document.getElementById('contentArea');
        render(container);
        UIUtils.toast('대시보드를 새로고침했습니다.', 'success');
    }

    return {
        render,
        refresh
    };
})();