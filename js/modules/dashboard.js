/**
 * 대시보드 모듈 — 타일 형식 리디자인
 * 생산현황 + 점검/관리 현황을 컴팩트 타일로 표시
 */

const DashboardModule = (function() {
    const STORE = DB.STORES;

    const FPROOF_ITEMS = [
        { key:'fp01', name:'부스 온습도/IR 모니터링' },
        { key:'fp02', name:'세척용 카운터' },
        { key:'fp03', name:'텐렉 카운터' },
        { key:'fp04', name:'도료 배합 시간' },
        { key:'fp05', name:'도료 배합 비율' },
        { key:'fp06', name:'가사시간 - PC A,B' },
        { key:'fp07', name:'가사시간 - A-2부스' },
        { key:'fp08', name:'가사시간 - A-4부스' },
        { key:'fp09', name:'가사시간 - B-2부스' },
        { key:'fp10', name:'가사시간 - B-3부스' },
        { key:'fp11', name:'저수위 - A-1부스' },
        { key:'fp12', name:'저수위 - A-2부스' },
        { key:'fp13', name:'저수위 - A-4부스' },
        { key:'fp14', name:'저수위 - B-2부스' },
        { key:'fp15', name:'저수위 - B-3부스' }
    ];
    const ILLUMINATION_POINTS = [
        { pointNo:1, posNo:1, location:'배합실',       standard:500 },
        { pointNo:2, posNo:1, location:'A라인 로딩',   standard:500 },
        { pointNo:2, posNo:2, location:'A라인 언로딩', standard:500 },
        { pointNo:3, posNo:1, location:'B라인 로딩',   standard:500 },
        { pointNo:3, posNo:2, location:'B라인 언로딩', standard:500 },
        { pointNo:4, posNo:1, location:'B라인 검사대', standard:2000 },
        { pointNo:5, posNo:1, location:'레이저 #1',    standard:2000 },
        { pointNo:5, posNo:2, location:'레이저 #2',    standard:2000 },
        { pointNo:5, posNo:3, location:'레이저 #3',    standard:2000 }
    ];

    /* ══════════════════════════════════════════════════════════
       공통 유틸
    ══════════════════════════════════════════════════════════ */
    function _illumKey(p) { return `${p.pointNo}_${p.posNo}`; }
    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ══════════════════════════════════════════════════════════
       타일 HTML 빌더
       size: 'lg' = 생산현황(크게), 'md' = 점검/관리(중간)
       valueColor 컬러에 따라 배경/테두리 자동 결정
    ══════════════════════════════════════════════════════════ */
    function _tile({ icon, title, value, valueColor, sub, onClick, badge = '', size = 'md' }) {
        const C = valueColor || '#64748b';
        const palettes = {
            '#ef4444': { bg:'#fff5f5', border:'#fca5a5' },
            '#f59e0b': { bg:'#fffbeb', border:'#fde68a' },
            '#22c55e': { bg:'#f0fdf4', border:'#bbf7d0' },
            '#3b82f6': { bg:'#eff6ff', border:'#bfdbfe' },
            '#8b5cf6': { bg:'#f5f3ff', border:'#ddd6fe' },
            '#0891b2': { bg:'#ecfeff', border:'#a5f3fc' },
            '#10b981': { bg:'#ecfdf5', border:'#a7f3d0' },
            '#64748b': { bg:'#f8fafc', border:'#e2e8f0' },
            '#94a3b8': { bg:'#f8fafc', border:'#e2e8f0' }
        };
        const pal = palettes[C] || { bg:'#f8fafc', border:'#e2e8f0' };

        // 사이즈별 수치 정의
        const lg = size === 'lg';
        const pad     = lg ? '20px 22px 16px' : '14px 16px 12px';
        const minH    = lg ? '148px'           : '116px';
        const iconSz  = lg ? '26px'            : '20px';
        const valSz   = lg ? '2.4rem'          : '1.75rem';
        const subSz   = lg ? '.8rem'           : '.71rem';
        const titleSz = lg ? '.72rem'          : '.65rem';
        const badgeSz = lg ? '.62rem'          : '.58rem';
        const badgePad= lg ? '2px 7px'         : '1px 5px';
        const radius  = lg ? '12px'            : '10px';
        const leftBdr = lg ? '5px'             : '4px';

        return `
        <div onclick="${onClick}"
             style="padding:${pad};border-radius:${radius};
                    border:1px solid ${pal.border};border-left:${leftBdr} solid ${C};
                    background:${pal.bg};cursor:pointer;
                    min-height:${minH};display:flex;flex-direction:column;justify-content:space-between;
                    transition:box-shadow .18s,transform .12s;"
             onmouseover="this.style.boxShadow='0 6px 20px rgba(0,0,0,0.10)';this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='none';this.style.transform='none'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="font-size:${iconSz};color:${C};opacity:.85;">${icon}</span>
                ${badge
                    ? `<span style="font-size:${badgeSz};padding:${badgePad};background:${C};color:#fff;
                                   border-radius:4px;font-weight:700;white-space:nowrap;">${badge}</span>`
                    : ''}
            </div>
            <div>
                <div style="font-size:${valSz};font-weight:900;color:${C};line-height:1;margin-bottom:4px;">
                    ${value}
                </div>
                <div style="font-size:${subSz};font-weight:700;color:${C};margin-bottom:3px;opacity:.9;">${sub}</div>
                <div style="font-size:${titleSz};color:var(--text-muted);font-weight:500;">${title}</div>
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       메인 렌더
    ══════════════════════════════════════════════════════════ */
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <!-- 생산 현황 타일 -->
            <div id="dashProdTiles" style="margin-bottom:16px;"></div>

            <!-- 점검/관리 타일 -->
            <div id="dashMonitorTiles" style="margin-bottom:24px;"></div>

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
        </div>`;

        renderProductionTiles();
        renderMonitorTiles();   // async
        renderCharts();
    }

    /* ══════════════════════════════════════════════════════════
       생산 현황 타일 행
    ══════════════════════════════════════════════════════════ */
    function renderProductionTiles() {
        const el = document.getElementById('dashProdTiles');
        if (!el) return;

        const todayStr  = UIUtils.today();
        const plans     = Storage.getAll(STORE.PRODUCTION_PLANS);
        const injInv    = Storage.getAll(STORE.INJECTION_INVENTORY);
        const paintWork = Storage.getAll(STORE.PAINTING_WORK);
        const paintInsp = Storage.getAll(STORE.PAINTING_INSPECTIONS);
        const prodInv   = Storage.getAll(STORE.PRODUCT_INVENTORY);
        const standby   = Storage.getAll(STORE.SHIPPING_STANDBY);

        const todayPlans  = plans.filter(p => p.date === todayStr).length;
        const injTotal    = injInv.reduce((s,i)  => s + (Number(i.quantity) || 0), 0);
        const paintToday  = paintWork.filter(p => p.date === todayStr).length;
        const defectToday = paintInsp.filter(p => p.date === todayStr)
                                     .reduce((s,d) => s + (Number(d.defectCount) || 0), 0);
        const prodTotal   = prodInv.reduce((s,i) => s + (Number(i.quantity) || 0), 0);
        const sbCount     = standby.filter(s => s.status === '대기').length;

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;">
            <div style="padding:14px 18px 0;font-size:.72rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:15px;">factory</span>
                생산 현황
            </div>
            <div style="padding:12px 18px 18px;
                        display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
                ${_tile({ icon:'assignment',     title:'생산 계획 지시서', value: todayPlans,
                          valueColor:'#3b82f6',  sub:'오늘 계획 건수',    size:'lg',
                          onClick:"Router.navigate('production-plan')" })}
                ${_tile({ icon:'warehouse',      title:'사출 창고 재고',   value: UIUtils.formatNumber(injTotal),
                          valueColor:'#8b5cf6',  sub:'전체 재고 (EA)',    size:'lg',
                          onClick:"Router.navigate('warehouse-overview')" })}
                ${_tile({ icon:'format_paint',   title:'도장 작업일지',    value: paintToday,
                          valueColor:'#0891b2',  sub:'오늘 도장 작업',    size:'lg',
                          onClick:"Router.navigate('painting-work')" })}
                ${_tile({ icon:'report_problem', title:'도장 불량 현황',   value: defectToday,
                          valueColor: defectToday > 0 ? '#ef4444' : '#22c55e',
                          sub:'오늘 불량 수',    size:'lg',
                          onClick:"Router.navigate('painting-inspection')",
                          badge: defectToday > 0 ? '발생' : '' })}
                ${_tile({ icon:'inventory_2',    title:'제품 창고 재고',   value: UIUtils.formatNumber(prodTotal),
                          valueColor:'#10b981',  sub:'전체 재고 (EA)',    size:'lg',
                          onClick:"Router.navigate('product-warehouse')" })}
                ${_tile({ icon:'local_shipping', title:'출하검사 대기',    value: sbCount,
                          valueColor: sbCount > 0 ? '#f59e0b' : '#22c55e',
                          sub:'출하 대기 건',    size:'lg',
                          onClick:"Router.navigate('shipping-standby')",
                          badge: sbCount > 0 ? '대기' : '' })}
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       점검/관리 타일 행 (async — 3정5S 계획 비동기 로드)
    ══════════════════════════════════════════════════════════ */
    async function renderMonitorTiles() {
        const el = document.getElementById('dashMonitorTiles');
        if (!el) return;

        const today     = UIUtils.today();
        const now       = new Date();
        const year      = now.getFullYear();
        const month     = now.getMonth() + 1;
        const thisMonth = today.slice(0, 7);

        // ── F/PROOF ───────────────────────────────────────────
        let fpMissing = FPROOF_ITEMS.length, fpDone = 0;
        const fpStore = DB.STORES.EQUIP_FPROOF_LOG;
        if (fpStore) {
            const chk = new Set(
                (Storage.getAll(fpStore) || []).filter(r => r.date === today).map(r => r.itemKey)
            );
            fpDone    = FPROOF_ITEMS.filter(i => chk.has(i.key)).length;
            fpMissing = FPROOF_ITEMS.length - fpDone;
        }

        // ── 조도관리 ──────────────────────────────────────────
        let illumMissing = ILLUMINATION_POINTS.length, illumFailed = 0;
        const luxStore = DB.STORES.EQUIP_ILLUMINATION_LOG;
        if (luxStore) {
            const recs = (Storage.getAll(luxStore) || [])
                .filter(r => Number(r.year) === year && Number(r.month) === month);
            const byKey = {};
            recs.forEach(r => { byKey[r.pointKey] = r; });
            const doneList = ILLUMINATION_POINTS.filter(p => byKey[_illumKey(p)]);
            illumMissing = ILLUMINATION_POINTS.length - doneList.length;
            illumFailed  = doneList.filter(p => Number(byKey[_illumKey(p)].lux) < p.standard).length;
        }

        // ── 3정5S ─────────────────────────────────────────────
        let s5Monthly = 0, s5Open = 0, s5Overdue = 0, s5Missed = 0;
        const s5Store    = DB.STORES.S5_INSPECTIONS;
        const s5IssStore = DB.STORES.S5_ISSUES;
        if (s5Store && s5IssStore) {
            const insps  = Storage.getAll(s5Store)    || [];
            const issues = Storage.getAll(s5IssStore) || [];
            s5Monthly = insps.filter(r => (r.date || '').startsWith(thisMonth)).length;
            s5Open    = issues.filter(r => r.status !== '완료').length;
            s5Overdue = issues.filter(r => r.status !== '완료' && r.dueDate && r.dueDate < today).length;
            try {
                const planData    = await Storage.getConfigValue('s5_plan').catch(() => null);
                const assignments = planData?.assignments || [];
                const upcoming    = _calcUpcomingForDash(assignments, today);
                s5Missed = upcoming.filter(n =>
                    n.date <= today && !insps.some(i => i.date === n.date && i.area === n.area)
                ).length;
            } catch (e) {}
        }

        // ── 설비 일정 ─────────────────────────────────────────
        let es = null;
        if (typeof ProdEquipmentModule !== 'undefined' && ProdEquipmentModule.getScheduleSummary) {
            try { es = ProdEquipmentModule.getScheduleSummary(); } catch (e) {}
        }

        /* ── 타일 조립 ───────────────────────────────────── */
        const tiles = [];

        // F/PROOF
        const fpC = fpMissing > 0 ? '#ef4444' : '#22c55e';
        tiles.push(_tile({
            icon:'task_alt', title:'F/PROOF 일일점검', size:'md',
            value: fpMissing > 0 ? fpMissing + '건' : '완료',
            valueColor: fpC,
            sub: fpMissing > 0 ? '오늘 미점검' : `${fpDone}/${FPROOF_ITEMS.length} 완료`,
            onClick:"DashboardModule.openFProof()",
            badge: fpMissing > 0 ? '미점검' : ''
        }));

        // 조도관리
        const illumC = (illumMissing + illumFailed) === 0 ? '#22c55e'
                     : illumFailed > 0 ? '#ef4444' : '#f59e0b';
        tiles.push(_tile({
            icon:'lightbulb', title:'조도관리 (월간)', size:'md',
            value: illumMissing > 0 ? illumMissing + '곳' : illumFailed > 0 ? illumFailed + '건' : '완료',
            valueColor: illumC,
            sub: illumMissing > 0 ? '미등록 위치'
               : illumFailed  > 0 ? '기준 미달'
               : `${ILLUMINATION_POINTS.length}곳 완료`,
            onClick:"DashboardModule.openIlluminationCheck()",
            badge: illumFailed > 0 ? '기준미달' : illumMissing > 0 ? '미등록' : ''
        }));

        // 3정5S
        const s5C = s5Missed > 0 || s5Overdue > 0 ? '#ef4444'
                  : s5Open > 0 ? '#f59e0b' : '#22c55e';
        tiles.push(_tile({
            icon:'cleaning_services', title:'3정5S 관리', size:'md',
            value: s5Missed > 0   ? s5Missed + '건'
                 : s5Open   > 0   ? s5Open   + '건'
                 : s5Monthly + '회',
            valueColor: s5C,
            sub: s5Missed  > 0 ? '점검 미실시'
               : s5Overdue > 0 ? `기한초과 ${s5Overdue}건`
               : s5Open    > 0 ? '미결 이슈'
               : '이번달 점검',
            onClick:"Router.navigate('five-s')",
            badge: s5Missed > 0 ? '미실시' : s5Overdue > 0 ? '기한초과' : ''
        }));

        // 설비 타일 헬퍼
        function _equipTile(icon, title, mode, planned, missing) {
            const noplan = planned.length === 0;
            const mc     = missing.length;
            const C      = noplan ? '#94a3b8' : mc > 0 ? '#ef4444' : '#22c55e';
            const val    = noplan ? '—' : mc > 0 ? mc + '건' : '완료';
            const sub    = noplan ? '이번달 계획없음'
                         : mc > 0 ? `${planned.length - mc}/${planned.length} 완료`
                         : '모두 완료';
            return _tile({ icon, title, value: val, valueColor: C, sub, size:'md',
                onClick: `DashboardModule.openEquipMode('${mode}')`,
                badge: mc > 0 ? '미완료' : '' });
        }

        if (es) {
            tiles.push(_equipTile('device_thermostat', '온도 프로파일',
                'temperature',  es.tempProfile.planned,  es.tempProfile.missing));
            tiles.push(_equipTile('filter_alt',        '압축에어 필터',
                'airfilter',    es.airFilter.planned,    es.airFilter.missing));
            tiles.push(_equipTile('air',               '급기 필터',
                'supplyfilter', es.supplyFilter.planned, es.supplyFilter.missing));
            tiles.push(_equipTile('local_fire_department', '건조로 청소',
                'dryerclean',   es.dryerClean.planned,   es.dryerClean.missing));
            tiles.push(_tile({
                icon:'handyman', title:'정비/청소', size:'md',
                value: es.maintenance.items.length + '건',
                valueColor:'#3b82f6',
                sub:'이번달 예정',
                onClick:"DashboardModule.openEquipMode('maintenance')"
            }));
        }

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;">
            <div style="padding:14px 18px 0;font-size:.72rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:15px;">monitor_heart</span>
                점검 / 관리 현황 (${year}년 ${month}월)
            </div>
            <div style="padding:12px 18px 18px;
                        display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                ${tiles.join('')}
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       3정5S 예정일 계산 (대시보드용 간소화)
    ══════════════════════════════════════════════════════════ */
    function _calcUpcomingForDash(assignments, today) {
        const results = [];
        const ms1day  = 24 * 3600 * 1000;
        const dayMap  = { '월요일':1, '화요일':2, '수요일':3, '목요일':4, '금요일':5 };
        const base    = new Date(today);

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
                if (!results.find(r => r.date === dateStr && r.area === a.area))
                    results.push({ date: dateStr, area: a.area, assignee: a.assignee });
            }
        });

        const from  = new Date(base.getTime() -  7 * ms1day).toISOString().split('T')[0];
        const until = new Date(base.getTime() + 35 * ms1day).toISOString().split('T')[0];
        return results.filter(r => r.date >= from && r.date <= until)
                      .sort((a, b) => a.date.localeCompare(b.date));
    }

    /* ══════════════════════════════════════════════════════════
       차트
    ══════════════════════════════════════════════════════════ */
    function renderCharts() {
        if (typeof Chart === 'undefined') return;
        const s = UIUtils.monthAgo();
        const e = UIUtils.today();
        renderProcessChart(s, e);
        renderTrendChart(s, e);
        renderDefectPieChart(s, e);
        renderDefectRateChart(s, e);
    }

    function renderProcessChart(start, end) {
        const ctx = document.getElementById('processChart');
        if (!ctx) return;
        const data = [
            { label:'생산계획', count: Storage.getByDateRange(STORE.PRODUCTION_PLANS, start, end).length,    color:'#3b82f6' },
            { label:'사출검사', count: Storage.getByDateRange(STORE.INJECTION_INSPECTIONS, start, end).length, color:'#8b5cf6' },
            { label:'도장입고', count: Storage.getByDateRange(STORE.PAINTING_INCOMING, start, end).length,    color:'#06b6d4' },
            { label:'도장작업', count: Storage.getByDateRange(STORE.PAINTING_WORK, start, end).length,        color:'#0891b2' },
            { label:'도장검사', count: Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end).length, color:'#f97316' },
            { label:'출하검사', count: Storage.getByDateRange(STORE.SHIPPING_INSPECTIONS, start, end).length, color:'#f59e0b' },
            { label:'제품출고', count: Storage.getByDateRange(STORE.PRODUCT_OUTGOING, start, end).length,     color:'#10b981' }
        ];
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{ label:'처리 건수', data: data.map(d => d.count),
                    backgroundColor: data.map(d => d.color), borderRadius: 6, borderSkipped: false }]
            },
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false } },
                scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
        });
    }

    function renderTrendChart(start, end) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;
        const byDate = {};
        Storage.getByDateRange(STORE.PAINTING_WORK, start, end).forEach(w => {
            if (!byDate[w.date]) byDate[w.date] = 0;
            byDate[w.date] += Number(w.productionQty) || 0;
        });
        const dates = Object.keys(byDate).sort();
        new Chart(ctx, {
            type: 'line',
            data: { labels: dates, datasets: [{
                label:'생산량', data: dates.map(d => byDate[d]),
                borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.1)',
                fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6
            }] },
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false } },
                scales:{ y:{ beginAtZero:true } } }
        });
    }

    function renderDefectPieChart(start, end) {
        const ctx = document.getElementById('defectPieChart');
        if (!ctx) return;
        const byType = {};
        Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end).forEach(d => {
            const n = d.defectName || '기타';
            if (!byType[n]) byType[n] = 0;
            byType[n] += Number(d.defectCount) || 0;
        });
        const labels = Object.keys(byType);
        const values = Object.values(byType);
        const colors = ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#6366f1'];
        if (!labels.length) {
            ctx.parentElement.innerHTML += '<div class="empty-state"><p>데이터가 없습니다.</p></div>';
            ctx.style.display = 'none'; return;
        }
        new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{
                data: values, backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2, borderColor: '#fff'
            }] },
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'right', labels:{ boxWidth:12 } } } }
        });
    }

    function renderDefectRateChart(start, end) {
        const ctx = document.getElementById('defectRateChart');
        if (!ctx) return;
        const prodByDate = {}, defByDate = {};
        Storage.getByDateRange(STORE.PAINTING_WORK, start, end).forEach(w => {
            if (!prodByDate[w.date]) prodByDate[w.date] = 0;
            prodByDate[w.date] += Number(w.productionQty) || 0;
        });
        Storage.getByDateRange(STORE.PAINTING_INSPECTIONS, start, end).forEach(d => {
            if (!defByDate[d.date]) defByDate[d.date] = 0;
            defByDate[d.date] += Number(d.defectCount) || 0;
        });
        const dates = [...new Set([...Object.keys(prodByDate), ...Object.keys(defByDate)])].sort();
        const rates = dates.map(d => ((defByDate[d] || 0) / Math.max(prodByDate[d] || 1, 1) * 100).toFixed(1));
        new Chart(ctx, {
            type: 'line',
            data: { labels: dates, datasets: [{
                label:'불량률 (%)', data: rates,
                borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.1)',
                fill:true, tension:0.4, pointRadius:4
            }] },
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false } },
                scales:{ y:{ beginAtZero:true, title:{ display:true, text:'불량률 (%)' } } } }
        });
    }

    /* ══════════════════════════════════════════════════════════
       네비게이션 헬퍼
    ══════════════════════════════════════════════════════════ */
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

    function openFProof() {
        try { sessionStorage.setItem('prodEquipmentMode', 'fproof'); } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function openEquipMode(mode) {
        try { sessionStorage.setItem('prodEquipmentMode', mode); } catch (e) {}
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
        openFProof,
        openEquipMode
    };
})();
