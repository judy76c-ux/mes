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
       size: 'sm' = 생산현황(소), 'xs' = 점검/관리(초소형)
       valueColor 컬러에 따라 배경/테두리 자동 결정
    ══════════════════════════════════════════════════════════ */
    function _tile({ icon, title, value, valueColor, sub, onClick, badge = '', size = 'xs' }) {
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
        const sm = size === 'sm';
        const pad     = sm ? '10px 14px 8px'  : '8px 10px 6px';
        const minH    = sm ? '82px'            : '66px';
        const iconSz  = sm ? '20px'            : '16px';
        const valSz   = sm ? '1.55rem'         : '1.2rem';
        const subSz   = sm ? '.72rem'          : '.63rem';
        const titleSz = sm ? '.65rem'          : '.6rem';
        const badgeSz = sm ? '.58rem'          : '.55rem';
        const badgePad= sm ? '2px 6px'         : '1px 5px';
        const radius  = '9px';
        const leftBdr = '4px';

        return `
        <div onclick="${onClick}"
             style="padding:${pad};border-radius:${radius};
                    border:1px solid ${pal.border};border-left:${leftBdr} solid ${C};
                    background:${pal.bg};cursor:pointer;
                    min-height:${minH};display:flex;flex-direction:column;justify-content:space-between;
                    transition:box-shadow .18s,transform .12s;"
             onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,0.09)';this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='none';this.style.transform='none'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                <span class="material-symbols-outlined" style="font-size:${iconSz};color:${C};opacity:.85;">${icon}</span>
                ${badge
                    ? `<span style="font-size:${badgeSz};padding:${badgePad};background:${C};color:#fff;
                                   border-radius:4px;font-weight:700;white-space:nowrap;">${badge}</span>`
                    : ''}
            </div>
            <div>
                <div style="font-size:${valSz};font-weight:900;color:${C};line-height:1;margin-bottom:2px;">
                    ${value}
                </div>
                <div style="font-size:${subSz};font-weight:700;color:${C};margin-bottom:2px;opacity:.9;">${sub}</div>
                <div style="font-size:${titleSz};color:var(--text-muted);font-weight:500;">${title}</div>
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       메인 렌더
    ══════════════════════════════════════════════════════════ */
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up" style="display:flex;flex-direction:column;gap:10px;">
            <!-- 생산 현황 타일 (6-col 1행) -->
            <div id="dashProdTiles"></div>

            <!-- 관리자 보고 누락 -->
            <div id="dashManagerAlerts"></div>

            <!-- 외관 검사 지연 -->
            <div id="dashInspectionOverdueAlerts"></div>

            <!-- 점검/관리 타일 -->
            <div id="dashMonitorTiles"></div>

            <!-- 운영 게시판 -->
            <div id="dashBoardSection"></div>

            <!-- 하단: 개선활동(좌) + 차트 2×2(우) -->
            <div style="display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2.4fr);gap:10px;min-height:0;">
                <div id="dashImprovementTiles"></div>
                <div class="card" style="margin-bottom:0;padding:10px 14px;">
                    <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);letter-spacing:.07em;
                                text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:8px;">
                        <span class="material-symbols-outlined" style="font-size:13px;">analytics</span>
                        차트 (최근 30일)
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                            <div style="font-size:.63rem;font-weight:700;color:var(--text-secondary);
                                        display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                                <span class="material-symbols-outlined" style="font-size:12px;">bar_chart</span>공정별 처리 현황
                            </div>
                            <canvas id="processChart" style="max-height:140px;"></canvas>
                        </div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                            <div style="font-size:.63rem;font-weight:700;color:var(--text-secondary);
                                        display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                                <span class="material-symbols-outlined" style="font-size:12px;">trending_up</span>일별 생산 추이
                            </div>
                            <canvas id="trendChart" style="max-height:140px;"></canvas>
                        </div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                            <div style="font-size:.63rem;font-weight:700;color:var(--text-secondary);
                                        display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                                <span class="material-symbols-outlined" style="font-size:12px;">pie_chart</span>불량 유형별 분포
                            </div>
                            <canvas id="defectPieChart" style="max-height:140px;"></canvas>
                        </div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                            <div style="font-size:.63rem;font-weight:700;color:var(--text-secondary);
                                        display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                                <span class="material-symbols-outlined" style="font-size:12px;">analytics</span>불량률 추이
                            </div>
                            <canvas id="defectRateChart" style="max-height:140px;"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        renderProductionTiles();
        renderManagerAlerts();
        renderInspectionOverdueAlerts();
        renderMonitorTiles();   // async
        renderImprovementTiles();
        renderBoardSection();
        renderCharts();
    }

    /* ══════════════════════════════════════════════════════════
       관리자 보고 누락 섹션
    ══════════════════════════════════════════════════════════ */
    function renderManagerAlerts() {
        const el = document.getElementById('dashManagerAlerts');
        if (!el) return;

        const WORK_STORE = DB.STORES.PAINTING_WORK;
        const works = Storage.getAll(WORK_STORE) || [];

        // 관리자 미통보 항목 수집
        const items = [];
        works.forEach(function(d) {
            const types = [];
            if (d.timeReason && !d.timeManagerNotified)
                types.push({ label: '시간 변동', detail: d.timeReason + (d.timeReasonDetail ? ' — ' + d.timeReasonDetail : ''), color: '#ef4444', icon: 'schedule' });
            if (d.qtyDiffReason && !d.qtyDiffManagerNotified)
                types.push({ label: '투입/산출 차이', detail: d.qtyDiffReason + (d.qtyDiffDetail ? ' — ' + d.qtyDiffDetail : ''), color: '#ca8a04', icon: 'swap_vert' });
            if (d.planReason && !d.planManagerNotified)
                types.push({ label: '계획수량 미달', detail: d.planReason + (d.planReasonDetail ? ' — ' + d.planReasonDetail : ''), color: '#dc2626', icon: 'trending_down' });
            if (types.length) items.push({ d, types });
        });

        if (!items.length) { el.innerHTML = ''; return; }

        // 등록일 최신순 정렬, 최대 20건
        items.sort(function(a, b) {
            return (b.d.registeredAt || b.d.date || '').localeCompare(a.d.registeredAt || a.d.date || '');
        });
        const show = items.slice(0, 20);

        var rows = show.map(function(item) {
            const d = item.d;
            const wp = (d.date || '').split('-');
            const dateStr = wp.length === 3 ? wp[1] + '-' + wp[2] : (d.date || '-');
            const badges = item.types.map(function(t) {
                return '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,.04);' +
                    'border:1px solid ' + t.color + '33;border-radius:4px;padding:1px 7px;font-size:0.75rem;color:' + t.color + ';font-weight:600;margin-right:4px;">' +
                    '<span class="material-symbols-outlined" style="font-size:12px;">' + t.icon + '</span>' + t.label + '</span>';
            }).join('');
            const detail = item.types.map(function(t){ return t.detail; }).join(' / ');
            return '<tr style="cursor:pointer;" onclick="PaintingWorkModule&&PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">' +
                '<td style="white-space:nowrap;font-size:0.82rem;color:var(--text-muted);">' + dateStr + '</td>' +
                '<td style="font-size:0.83rem;font-weight:600;">' + (d.carModel || '-') + '</td>' +
                '<td style="font-size:0.83rem;">' + (d.partName || '-') + '</td>' +
                '<td>' + badges + '</td>' +
                '<td style="font-size:0.78rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(detail) + '</td>' +
                '</tr>';
        }).join('');

        el.innerHTML =
            '<div class="card" style="margin-bottom:0;border-left:3px solid #ef4444;">' +
            '<div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:#ef4444;">notification_important</span>' +
            '<span style="font-weight:700;font-size:0.88rem;color:#dc2626;">관리자 보고 누락</span>' +
            '<span style="background:#ef4444;color:#fff;border-radius:10px;padding:0 7px;font-size:0.73rem;font-weight:700;">' + items.length + '</span>' +
            '</div>' +
            '<span style="font-size:0.75rem;color:var(--text-muted);">도장 작업 실적 중 관리자 미통보 항목 · 클릭하여 이동</span>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">' +
            '<thead><tr style="background:var(--bg-secondary);">' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">작업일</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">차종</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">품명</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">누락 항목</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">사유</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table></div></div>';
    }

    /* ══════════════════════════════════════════════════════════
       외관 검사 지연 (도장작업일 +2일 이상 미검사)
    ══════════════════════════════════════════════════════════ */
    function renderInspectionOverdueAlerts() {
        const el = document.getElementById('dashInspectionOverdueAlerts');
        if (!el) return;
        if (typeof PaintingInspectionModule === 'undefined' ||
            typeof PaintingInspectionModule.getOverdueUninspectedWorks !== 'function') {
            el.innerHTML = '';
            return;
        }
        const items = PaintingInspectionModule.getOverdueUninspectedWorks() || [];
        if (typeof PaintingInspectionModule.syncOverdueInspectionAlerts === 'function') {
            PaintingInspectionModule.syncOverdueInspectionAlerts();
        }
        if (!items.length) { el.innerHTML = ''; return; }

        const rows = items.slice(0, 20).map(function(d) {
            const wp = (d.date || '').split('-');
            const dateStr = wp.length === 3 ? wp[1] + '-' + wp[2] : (d.date || '-');
            const painted = new Date((d.date || '') + 'T00:00:00');
            const days = isNaN(painted.getTime())
                ? 2
                : Math.max(2, Math.floor((_startOfLocalDay(new Date()) - _startOfLocalDay(painted)) / 86400000));
            return '<tr style="cursor:pointer;" onclick="Router.navigate(\'painting-inspection\')">' +
                '<td style="white-space:nowrap;font-size:0.82rem;color:var(--text-muted);">' + dateStr + '</td>' +
                '<td style="font-size:0.83rem;font-weight:600;">' + _esc(d.carModel || '-') + '</td>' +
                '<td style="font-size:0.83rem;">' + _esc(d.partName || '-') + '</td>' +
                '<td style="font-size:0.82rem;">' + _esc(d.color || '-') + '</td>' +
                '<td style="font-size:0.82rem;">' + _esc(d.line || '-') + '</td>' +
                '<td style="font-size:0.78rem;font-weight:700;color:#c2410c;">지연 ' + days + '일</td>' +
                '</tr>';
        }).join('');

        el.innerHTML =
            '<div class="card" style="margin-bottom:0;border-left:3px solid #ea580c;">' +
            '<div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:#ea580c;">notifications_active</span>' +
            '<span style="font-weight:700;font-size:0.88rem;color:#c2410c;">외관 검사 지연</span>' +
            '<span style="background:#ea580c;color:#fff;border-radius:10px;padding:0 7px;font-size:0.73rem;font-weight:700;">' + items.length + '</span>' +
            '</div>' +
            '<span style="font-size:0.75rem;color:var(--text-muted);">초중종물 발행 완료 · 도장작업일 +2일 이상 미검사 · 클릭하여 이동</span>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">' +
            '<thead><tr style="background:var(--bg-secondary);">' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">작업일</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">차종</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">품명</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">컬러</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">라인</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">상태</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table></div></div>';
    }

    function _startOfLocalDay(date) {
        const d = date instanceof Date ? new Date(date.getTime()) : new Date();
        d.setHours(0, 0, 0, 0);
        return d;
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
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:7px;">
                <span class="material-symbols-outlined" style="font-size:13px;">factory</span>
                생산 현황
            </div>
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;">
                ${_tile({ icon:'assignment',     title:'생산 계획 지시서', value: todayPlans,
                          valueColor:'#3b82f6',  sub:'오늘 계획 건수',    size:'sm',
                          onClick:"Router.navigate('production-plan')" })}
                ${_tile({ icon:'warehouse',      title:'사출 창고 재고',   value: UIUtils.formatNumber(injTotal),
                          valueColor:'#8b5cf6',  sub:'전체 재고 (EA)',    size:'sm',
                          onClick:"Router.navigate('warehouse-overview')" })}
                ${_tile({ icon:'format_paint',   title:'도장 작업일지',    value: paintToday,
                          valueColor:'#0891b2',  sub:'오늘 도장 작업',    size:'sm',
                          onClick:"Router.navigate('painting-work')" })}
                ${_tile({ icon:'report_problem', title:'도장 불량 현황',   value: defectToday,
                          valueColor: defectToday > 0 ? '#ef4444' : '#22c55e',
                          sub:'오늘 불량 수',    size:'sm',
                          onClick:"Router.navigate('painting-inspection')",
                          badge: defectToday > 0 ? '발생' : '' })}
                ${_tile({ icon:'inventory_2',    title:'제품 창고 재고',   value: UIUtils.formatNumber(prodTotal),
                          valueColor:'#10b981',  sub:'전체 재고 (EA)',    size:'sm',
                          onClick:"Router.navigate('product-warehouse')" })}
                ${_tile({ icon:'local_shipping', title:'출하검사 대기',    value: sbCount,
                          valueColor: sbCount > 0 ? '#f59e0b' : '#22c55e',
                          sub:'출하 대기 건',    size:'sm',
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
            icon:'task_alt', title:'F/PROOF 일일점검', size:'xs',
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
            icon:'lightbulb', title:'조도관리 (월간)', size:'xs',
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
            icon:'cleaning_services', title:'3정5S 관리', size:'xs',
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
            return _tile({ icon, title, value: val, valueColor: C, sub, size:'xs',
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
                icon:'handyman', title:'정비/청소', size:'xs',
                value: es.maintenance.items.length + '건',
                valueColor:'#3b82f6',
                sub:'이번달 예정',
                onClick:"DashboardModule.openEquipMode('maintenance')"
            }));
        }

        const prodAdjustLogs = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        const monthAdjustLogs = prodAdjustLogs.filter(r => String(r.date || r.at || '').slice(0, 7) === thisMonth);
        const latestAdjust = prodAdjustLogs[0];
        tiles.push(_tile({
            icon:'manage_history',
            title:'제품 현재고 보정 이력',
            value: monthAdjustLogs.length + '건',
            valueColor: monthAdjustLogs.length > 0 ? '#f59e0b' : '#64748b',
            sub: latestAdjust ? `${latestAdjust.item?.partName || '-'} / ${latestAdjust.reason || '-'}` : '보정 이력 없음',
            size:'xs',
            onClick:"DashboardModule.openProductAdjustLogs()",
            badge: monthAdjustLogs.length > 0 ? '보정' : ''
        }));

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:7px;">
                <span class="material-symbols-outlined" style="font-size:13px;">monitor_heart</span>
                점검 / 관리 현황 (${year}년 ${month}월)
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;">
                ${tiles.join('')}
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       3정5S 예정일 계산 (대시보드용 간소화)
    ══════════════════════════════════════════════════════════ */
    function renderImprovementTiles() {
        const el = document.getElementById('dashImprovementTiles');
        if (!el) return;

        const storeName = DB.STORES.PROD_IMPROVEMENT_ACTIVITIES;
        const rows = storeName ? (Storage.getAll(storeName) || []) : [];
        const month = UIUtils.today().slice(0, 7);
        const monthRows = rows.filter(r => String(r.date || r.createdAt || '').slice(0, 7) === month);

        const rankMap = {};
        monthRows.forEach(r => {
            const name = r.proposer || '미지정';
            if (!rankMap[name]) rankMap[name] = { proposed: 0, approved: 0, closed: 0, score: 0 };
            rankMap[name].proposed += 1;
            if (r.approval === 'approved') rankMap[name].approved += 1;
            if (r.status === 'closed') rankMap[name].closed += 1;
            rankMap[name].score += 1 + (r.approval === 'approved' ? 2 : 0) + (r.status === 'closed' ? 3 : 0);
        });
        const top = Object.entries(rankMap)
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.score - a.score || b.proposed - a.proposed)[0];

        const pending = rows.filter(r => !r.approval || r.approval === 'pending' || r.status === 'reviewing' || r.status === 'draft').length;
        const approved = rows.filter(r => r.approval === 'approved').length;
        const running = rows.filter(r => ['planning', 'running', 'checking', 'maintaining'].includes(r.status)).length;
        const closed = rows.filter(r => r.status === 'closed').length;
        const recent = rows.slice()
            .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
            .slice(0, 3);

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;">
                <span class="material-symbols-outlined" style="font-size:13px;">emoji_events</span>
                개선활동 / 우수 사원
            </div>

            <!-- 우수 사원 -->
            <div onclick="Router.navigate('improvement-activity')"
                 style="border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:9px;background:#eff6ff;
                        padding:8px 10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div>
                    <div style="font-size:.6rem;color:#1d4ed8;font-weight:800;">이달의 우수 사원 후보</div>
                    <div style="font-size:1.15rem;font-weight:900;color:#0f172a;line-height:1.1;margin-top:2px;">${_esc(top?.name || '-')}</div>
                    <div style="display:flex;gap:8px;font-size:.62rem;color:#475569;font-weight:700;margin-top:3px;">
                        <span>점수 ${top ? top.score : 0}</span>
                        <span>제안 ${top ? top.proposed : 0}</span>
                        <span>승인 ${top ? top.approved : 0}</span>
                        <span>완료 ${top ? top.closed : 0}</span>
                    </div>
                </div>
                <span class="material-symbols-outlined" style="font-size:26px;color:#f59e0b;flex-shrink:0;">workspace_premium</span>
            </div>

            <!-- 개선 제안 현황 -->
            <div onclick="Router.navigate('improvement-activity')"
                 style="border:1px solid #bbf7d0;border-left:4px solid #10b981;border-radius:9px;background:#f0fdf4;
                        padding:8px 10px;cursor:pointer;flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                    <div style="font-size:.63rem;color:#047857;font-weight:800;">개선 제안 현황</div>
                    <span class="material-symbols-outlined" style="font-size:16px;color:#10b981;">tips_and_updates</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:7px;">
                    ${_improveMini('검토대기', pending, '#f59e0b')}
                    ${_improveMini('승인', approved, '#10b981')}
                    ${_improveMini('진행', running, '#3b82f6')}
                    ${_improveMini('완료', closed, '#6366f1')}
                </div>
                <div style="display:grid;gap:3px;font-size:.63rem;color:#334155;">
                    ${recent.length ? recent.map(r => `
                        <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px dashed #bbf7d0;padding-top:3px;">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;">${_esc(r.title || r.problem || '제목 없음')}</span>
                            <span style="white-space:nowrap;color:#64748b;">${_esc(r.proposer || '-')}</span>
                        </div>`).join('') : '<div style="color:#64748b;font-size:.63rem;">등록된 개선 제안이 없습니다.</div>'}
                </div>
            </div>
        </div>`;
    }

    function _improveMini(label, value, color) {
        return `<div style="border:1px solid ${color}33;background:#fff;border-radius:6px;padding:5px 4px;text-align:center;">
            <div style="font-size:.95rem;font-weight:900;color:${color};line-height:1;">${UIUtils.formatNumber(value)}</div>
            <div style="font-size:.58rem;color:#64748b;font-weight:800;margin-top:2px;">${label}</div>
        </div>`;
    }

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
       운영 게시판 섹션
    ══════════════════════════════════════════════════════════ */
    function renderBoardSection() {
        const el = document.getElementById('dashBoardSection');
        if (!el) return;

        const CAT_COLOR = {
            '오류 보고': { bg:'#fee2e2', text:'#dc2626' },
            '개선 요청': { bg:'#fef3c7', text:'#d97706' },
            '문의':      { bg:'#dbeafe', text:'#2563eb' },
            '기타':      { bg:'#f1f5f9', text:'#64748b' }
        };

        const posts = (Storage.getAll(DB.STORES.BOARD_POSTS) || [])
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .slice(0, 5);

        const replies = Storage.getAll(DB.STORES.BOARD_REPLIES) || [];

        function relDate(iso) {
            if (!iso) return '';
            const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
            if (diff === 0) return '오늘';
            if (diff === 1) return '어제';
            if (diff < 7)  return `${diff}일 전`;
            return iso.slice(0, 10);
        }

        const rows = posts.length ? posts.map(p => {
            const cc  = CAT_COLOR[p.category] || CAT_COLOR['기타'];
            const cnt = (replies).filter(r => r.postId === p.id).length;
            return `
            <div onclick="Router.navigate('board')"
                 style="display:flex;align-items:center;gap:10px;padding:7px 12px;
                        border-bottom:1px solid var(--border-color);cursor:pointer;
                        transition:background .15s;"
                 onmouseover="this.style.background='var(--bg-secondary)'"
                 onmouseout="this.style.background=''">
                <span style="flex-shrink:0;font-size:.72rem;font-weight:700;padding:2px 7px;
                             border-radius:10px;background:${cc.bg};color:${cc.text};
                             white-space:nowrap;">${_esc(p.category || '기타')}</span>
                <span style="flex:1;font-size:.85rem;color:var(--text-primary);
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${_esc(p.title || '(제목 없음)')}
                    ${cnt ? `<span style="font-size:.72rem;color:var(--accent-blue);margin-left:4px;">[${cnt}]</span>` : ''}
                </span>
                <span style="flex-shrink:0;font-size:.75rem;color:var(--text-muted);white-space:nowrap;">${_esc(p.author || '')}</span>
                <span style="flex-shrink:0;font-size:.72rem;color:var(--text-muted);white-space:nowrap;min-width:42px;text-align:right;">${relDate(p.createdAt)}</span>
            </div>`;
        }).join('') : `<div style="text-align:center;padding:20px;font-size:.85rem;color:var(--text-muted);">
            등록된 게시글이 없습니다.
        </div>`;

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;">
            <div class="card-header" style="padding:8px 12px;">
                <h4 style="font-size:.8rem;display:flex;align-items:center;gap:5px;margin:0;">
                    <span class="material-symbols-outlined" style="font-size:15px;color:var(--accent-blue);">forum</span>
                    운영 게시판
                    ${posts.length ? `<span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:2px;">최근 ${posts.length}건</span>` : ''}
                </h4>
                <button onclick="Router.navigate('board')" class="btn btn-sm btn-outline"
                    style="font-size:.75rem;padding:2px 10px;height:24px;">
                    전체보기
                </button>
            </div>
            <div style="overflow:hidden;">${rows}</div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       차트
    ══════════════════════════════════════════════════════════ */
    var _charts = { process: null, trend: null, defectPie: null, defectRate: null };

    function _destroyCharts() {
        Object.keys(_charts).forEach(k => {
            if (_charts[k]) { try { _charts[k].destroy(); } catch (e) {} _charts[k] = null; }
        });
    }

    function renderCharts() {
        if (typeof Chart === 'undefined') return;
        _destroyCharts();
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
        _charts.process = new Chart(ctx, {
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
        _charts.trend = new Chart(ctx, {
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
        _charts.defectPie = new Chart(ctx, {
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
        _charts.defectRate = new Chart(ctx, {
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

    async function openProductAdjustLogs() {
        const logs = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        const rows = logs.slice(0, 50).map(log => `
            <tr>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);white-space:nowrap;">${_esc((log.at || log.date || '').slice(0, 10))}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.item?.carModel || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);font-weight:700;">${_esc(log.item?.partName || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.item?.color || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);font-family:monospace;">${_esc(log.before?.lotNo || '-')} → ${_esc(log.after?.lotNo || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);text-align:right;">${UIUtils.formatNumber(log.before?.quantity || 0)} → ${UIUtils.formatNumber(log.after?.quantity || 0)}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.reason || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.user || '-')}</td>
            </tr>
        `).join('');
        UIUtils.showModal('제품 현재고 보정 이력', `
            <div style="max-height:520px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:8px;text-align:left;">일자</th>
                            <th style="padding:8px;text-align:left;">차종</th>
                            <th style="padding:8px;text-align:left;">품명</th>
                            <th style="padding:8px;text-align:left;">컬러</th>
                            <th style="padding:8px;text-align:left;">LOT 변경</th>
                            <th style="padding:8px;text-align:right;">수량 변경</th>
                            <th style="padding:8px;text-align:left;">수정 사유</th>
                            <th style="padding:8px;text-align:left;">작업자</th>
                        </tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-muted);">보정 이력이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
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
        openEquipMode,
        openProductAdjustLogs
    };
})();
