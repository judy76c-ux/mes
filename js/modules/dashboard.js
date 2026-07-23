/**
 * 대시보드 모듈 — 타일 형식 리디자인
 * 생산현황 + 점검/관리 현황을 컴팩트 타일로 표시
 */

const DashboardModule = (function() {
    const STORE = DB.STORES;

    // background cache warm → 대시보드 1회 재렌더 (토스트/과도한 반복 방지)
    let _cacheWarmUnsub = null;
    let _cacheWarmRefreshTimer = null;
    function _bindCacheWarmRefreshOnce() {
        if (typeof Storage === 'undefined' || typeof Storage.onCacheWarm !== 'function') return;
        if (_cacheWarmUnsub) return;

        const watch = new Set([
            STORE.PRODUCTION_PLANS,
            STORE.INJECTION_INVENTORY,
            STORE.INJECTION_INSPECTIONS,
            STORE.PAINTING_INCOMING,
            STORE.PAINTING_WORK,
            STORE.PAINTING_INSPECTIONS,
            STORE.SHIPPING_STANDBY,
            STORE.PRODUCT_INVENTORY,
            STORE.PRODUCT_OUTGOING
        ].filter(Boolean));

        _cacheWarmUnsub = Storage.onCacheWarm(function(storeName, meta) {
            // 현재 화면이 대시보드일 때만 (컨테이너 존재로 판단)
            if (!document.getElementById('dashProdTiles')) return;
            if (storeName !== '*' && !watch.has(storeName)) return;

            // 과도한 리렌더 방지: 1회만, 약간 지연
            if (_cacheWarmRefreshTimer) return;
            _cacheWarmRefreshTimer = setTimeout(function() {
                _cacheWarmRefreshTimer = null;
                try { DashboardModule.refresh(true); } catch (e) {}
            }, 250);
        });
    }

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

            <!-- 초중종물(품질체크) 기준 발행 누락 -->
            <div id="dashQualityStdWarnings"></div>

            <!-- 출하검사 대기 목록 -->
            <div id="dashShippingStandby"></div>

            <!-- 도료 입고 대기 (물류담당자 전용) -->
            <div id="dashPaintPending"></div>

            <!-- 사출 입고 대기 / 실적 미입력 / 도료 사용 미등록 / 사출 LOT 형식 오류 (경보 섹션) -->
            <div id="dashAlertRow" style="display:none;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;"></div>

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
        renderQualityStdWarnings();
        renderShippingStandby();
        renderPaintPending();
        renderAlertRow();
        _scheduleIdleWork(renderMonitorTiles);   // async + config fetch
        renderImprovementTiles();
        renderBoardSection();
        _scheduleIdleWork(renderCharts);
        _bindCacheWarmRefreshOnce();
    }

    function _scheduleIdleWork(fn, timeoutMs) {
        const t = Number(timeoutMs) || 1200;
        try {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => {
                    try { fn(); } catch (e) { console.warn('[Dashboard idle work]', e); }
                }, { timeout: t });
                return;
            }
        } catch (_) {}
        setTimeout(() => {
            try { fn(); } catch (e) { console.warn('[Dashboard deferred work]', e); }
        }, 0);
    }

    /* ══════════════════════════════════════════════════════════
       도료 입고 대기 (물류담당자/관리자 전용)
    ══════════════════════════════════════════════════════════ */
    function renderPaintPending() {
        const el = document.getElementById('dashPaintPending');
        if (!el) return;

        // 담당자 권한 확인: paint-inventory 페이지 쓰기 권한 또는 admin/prod_manager/logistics_worker
        function _canSeePaint() {
            if (typeof AuthModule === 'undefined') return true;
            const user = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
            if (!user) return false;
            const roles = (user.roles || [user.role]).map(String).filter(Boolean);
            if (roles.some(r => ['admin', 'prod_manager', 'logistics_worker'].includes(r))) return true;
            if (typeof AuthModule.canWritePage === 'function' && AuthModule.canWritePage('paint-inventory')) return true;
            return false;
        }

        if (!_canSeePaint()) { el.style.display = 'none'; return; }

        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        const materials   = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];

        function _isBulkRecord(r) {
            return r && (r.inventoryMode === 'current_stock_edit' ||
                r.source === '도료 창고 현재 재고 설정' ||
                r.source === '도료 창고 일괄 등록 및 설정');
        }

        const processedIds = new Set(
            inventory.filter(i => i.sourceInspectionId && !_isBulkRecord(i)).map(i => i.sourceInspectionId)
        );
        const legacySet = new Set(
            inventory.filter(i => i.type !== '출고' && !i.sourceInspectionId && !_isBulkRecord(i))
                .map(i => `${i.materialId}||${i.lotNo}`)
        );
        const bulkMatIds = new Set(
            inventory.filter(i => _isBulkRecord(i)).map(i => i.materialId)
        );
        function getMid(name) {
            const m = materials.find(function(m) { return m.name === name; });
            return m ? m.id : null;
        }

        const pending = inspections
            .filter(function(i) {
                if (i.verdict !== '합격' || (Number(i.incomingQty) || 0) <= 0) return false;
                if (i.warehouseStatus === '입고취소') return false;
                if (processedIds.has(i.id)) return false;
                const mid = getMid(i.paintName);
                if (mid && legacySet.has(`${mid}||${i.lotNo}`)) return false;
                if (mid && bulkMatIds.has(mid)) return false;
                return true;
            })
            .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

        if (!pending.length) { el.innerHTML = ''; return; }

        el.innerHTML = `
        <div style="border:1px solid var(--border-color);border-top:3px solid #0891b2;border-radius:8px;overflow:hidden;background:var(--bg-primary);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#0891b20d;">
                <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:#0891b2;letter-spacing:.04em;text-transform:uppercase;">
                    <span class="material-symbols-outlined" style="font-size:14px;">inventory</span>
                    도료 입고 대기
                    <span style="background:#0891b2;color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;">${pending.length}건</span>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="DashboardModule.openNotifyModal('paint_pending',${pending.length})"
                        style="border:1px solid #0891b2;background:none;cursor:pointer;font-size:.72rem;color:#0891b2;font-weight:600;padding:2px 8px;border-radius:5px;display:flex;align-items:center;gap:3px;">
                        <span class="material-symbols-outlined" style="font-size:13px;">notifications</span>알림 발송
                    </button>
                    <button onclick="Router.navigate('paint-inventory')" style="border:none;background:none;cursor:pointer;font-size:.72rem;color:#0891b2;font-weight:600;padding:2px 6px;">도료창고 →</button>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">검사일</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">도료명</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">LOT No.</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">색상</th>
                        <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-muted);font-size:.7rem;">수량</th>
                        <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">공급사</th>
                    </tr>
                </thead>
                <tbody>
                    ${pending.slice(0, 15).map(function(r) {
                        return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                            <td style="padding:5px 10px;white-space:nowrap;color:var(--text-muted);">${r.date || '-'}</td>
                            <td style="padding:5px 8px;font-weight:600;">${r.paintName || '-'}</td>
                            <td style="padding:5px 8px;font-size:.72rem;color:var(--text-muted);">${r.lotNo || '-'}</td>
                            <td style="padding:5px 8px;font-size:.72rem;">${r.color || ''}</td>
                            <td style="padding:5px 10px;text-align:right;font-weight:700;color:#0891b2;">${UIUtils.formatNumber(r.incomingQty || 0)}</td>
                            <td style="padding:5px 10px;font-size:.72rem;color:var(--text-muted);">${r.supplier || ''}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            ${pending.length > 15 ? `<div style="padding:5px 12px;font-size:.72rem;color:var(--text-muted);border-top:1px solid var(--border-color);">외 ${pending.length - 15}건 더 있음</div>` : ''}
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       경보 3열 (사출 입고 대기 / 실적 미입력 / 도료 사용 미등록)
    ══════════════════════════════════════════════════════════ */
    function renderAlertRow() {
        const el = document.getElementById('dashAlertRow');
        if (!el) return;
        const today = UIUtils.today();

        /* ① 사출 입고 대기 */
        const injInsp = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const injInv  = Storage.getAll(DB.STORES.INJECTION_INVENTORY)   || [];
        const inStockSet = new Set();
        injInv.filter(i => i.type === '입고').forEach(i => {
            if (i.lots && i.lots.length) {
                i.lots.forEach(l => { if ((Number(l.qty)||0) > 0) inStockSet.add(`${i.partName}||${l.lotNo}`); });
            } else if (i.lotNo && (Number(i.quantity)||0) > 0) {
                inStockSet.add(`${i.partName}||${i.lotNo}`);
            }
        });
        const injPending = [];
        injInsp.sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(insp => {
            const lots = (insp.lots && insp.lots.length) ? insp.lots : [{ lotNo: insp.lotNo, qty: insp.passQty || 0 }];
            lots.forEach(l => {
                if ((Number(l.qty)||0) <= 0) return;
                const k = `${insp.partName}||${l.lotNo}`;
                if (!inStockSet.has(k)) injPending.push({ date: insp.date, carModel: insp.carModel, partName: insp.partName, color: insp.color, lotNo: l.lotNo, qty: l.qty });
            });
        });

        /* ② 실적 미입력 (전일 이전 계획 중 작업일지 없음) */
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];
        const works = Storage.getAll(DB.STORES.PAINTING_WORK)    || [];
        const workedPlanIds = new Set(works.map(w => w.planId).filter(Boolean));
        const unenteredPlans = plans
            .filter(p => p.date && p.date < today && (p.carModel || p.partName) && !workedPlanIds.has(p.id))
            .sort((a, b) => b.date.localeCompare(a.date));

        /* ③ 도료 사용 미등록 (전일 이전 작업일지 중 도료 배합 기록 없음)
           - 도료사용등록 대상에서 '제외'한 작업은 알림에서도 빼 둔다 */
        const mixes = (Storage.getAll(DB.STORES.PROD_CONDITIONS) || []).filter(d => d._docKind === 'paint_mix');
        const mixedWorkIds = new Set(mixes.map(m => m.workId).filter(Boolean));
        let paintMissing = works
            .filter(w => w.date && w.date < today && !mixedWorkIds.has(w.id))
            .sort((a, b) => (b.date||'').localeCompare(a.date||''));

        /* ④ 사출 LOT 번호 형식 오류 (설정 화면 스캔 로직과 동일 소스) */
        let lotErrors = [];
        try {
            if (typeof SettingsModule !== 'undefined' && SettingsModule.scanInjLotErrorsData) {
                lotErrors = SettingsModule.scanInjLotErrorsData();
            }
        } catch (e) { console.warn('[Dashboard] LOT 오류 스캔 실패:', e); }

        function _alertCard(icon, iconColor, title, count, rows, nav, emptyMsg, onClickJs) {
            if (!count) return `<div style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;background:var(--bg-secondary);display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:0.82rem;">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-green);">check_circle</span>${emptyMsg}</div>`;
            return `<div style="border:1px solid var(--border-color);border-top:3px solid ${iconColor};border-radius:8px;overflow:hidden;background:var(--bg-primary);">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${iconColor}0d;">
                    <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:${iconColor};letter-spacing:.04em;text-transform:uppercase;">
                        <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>${title}
                        <span style="background:${iconColor};color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;">${count}건</span>
                    </div>
                    <button onclick="${onClickJs || `Router.navigate('${nav}')`}" style="border:none;background:none;cursor:pointer;font-size:.72rem;color:${iconColor};font-weight:600;padding:2px 6px;">바로가기 →</button>
                </div>
                <div style="max-height:160px;overflow-y:auto;">${rows}</div>
            </div>`;
        }

        function _paintRowsHtml(list) {
            if (!list.length) return '';
            return `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                list.slice(0, 20).map(w => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${(w.date||'-').split(' ')[0]}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#0891b2;font-weight:600;">${w.line||''}</td>
                    <td style="padding:4px 8px;font-weight:600;">${w.carModel||''}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${w.partName||''}</td>
                </tr>`).join('') + `</table>`;
        }

        function _paintHtml(list) {
            const injRows = injPending.length ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                injPending.slice(0, 20).map(r => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${r.date||'-'}</td>
                    <td style="padding:4px 8px;font-weight:600;">${r.partName||'-'}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${r.carModel||''} ${r.color||''}</td>
                    <td style="padding:4px 10px;text-align:right;font-weight:700;color:#8b5cf6;">${UIUtils.formatNumber(r.qty||0)}</td>
                </tr>`).join('') + `</table>` : '';

            const unenteredRows = unenteredPlans.length ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                unenteredPlans.slice(0, 20).map(p => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${p.date||'-'}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#0891b2;font-weight:600;">${p.line||''}</td>
                    <td style="padding:4px 8px;font-weight:600;">${p.carModel||''}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${p.partName||''}</td>
                    <td style="padding:4px 10px;text-align:right;font-weight:700;color:#f59e0b;">${UIUtils.formatNumber(p.planQty||0)}</td>
                </tr>`).join('') + `</table>` : '';

            const lotErrorRows = lotErrors.length ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                lotErrors.slice(0, 20).map(e => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${_esc((e.date||'-').split(' ')[0])}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#dc2626;font-weight:600;">${_esc(e.src||'')}</td>
                    <td style="padding:4px 8px;font-weight:600;">${_esc(e.partName||'')}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;font-family:monospace;color:var(--text-muted);">${_esc(e.original||'')}</td>
                </tr>`).join('') + `</table>` : '';

            const total = (injPending.length > 0 ? 1 : 0) + (unenteredPlans.length > 0 ? 1 : 0)
                + (list.length > 0 ? 1 : 0) + (lotErrors.length > 0 ? 1 : 0);
            if (!total) { el.style.display = 'none'; el.innerHTML = ''; return; }
            el.style.display = 'grid';
            el.innerHTML =
                _alertCard('precision_manufacturing', '#8b5cf6', '사출 입고 대기', injPending.length, injRows, 'warehouse-overview', '사출 입고 대기 없음') +
                _alertCard('edit_note',               '#f59e0b', '실적 미입력',    unenteredPlans.length, unenteredRows, 'painting-work-a', '미입력 계획 없음') +
                _alertCard('barcode_scanner',         '#dc2626', '사출 LOT 형식 오류', lotErrors.length, lotErrorRows, null, 'LOT 형식 오류 없음', 'App.goToLotRepairTab()') +
                _alertCard('science',                 '#ef4444', '도료 사용 미등록', list.length, _paintRowsHtml(list), 'paint-mix', '도료 사용 모두 등록됨');
        }

        _paintHtml(paintMissing);

        Storage.getConfigValue('paint_mix_hidden_works_v1').then(function(list) {
            const hidden = new Set((Array.isArray(list) ? list : []).map(String));
            if (!hidden.size) return;
            const filtered = paintMissing.filter(w => !hidden.has(String(w.id)));
            if (filtered.length === paintMissing.length) return;
            _paintHtml(filtered);
        }).catch(function() {});
    }

    /* ══════════════════════════════════════════════════════════
       출하검사 대기 섹션
    ══════════════════════════════════════════════════════════ */
    function renderShippingStandby() {
        const el = document.getElementById('dashShippingStandby');
        if (!el) return;
        const waiting = (Storage.getAll(STORE.SHIPPING_STANDBY) || [])
            .filter(d => d.status === '대기')
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (!waiting.length) { el.innerHTML = ''; return; }

        const srcLabel = s => s === 'laser_inspection' ? '레이져' : '도장';
        const srcColor = s => s === 'laser_inspection' ? '#a855f7' : '#3b82f6';

        const rows = waiting.map(d => `
            <tr style="cursor:pointer;" onclick="Router.navigate('shipping-standby')"
                onmouseover="this.style.background='var(--bg-secondary)'"
                onmouseout="this.style.background=''">
                <td style="padding:5px 8px;white-space:nowrap;font-size:0.8rem;">${d.date || '-'}</td>
                <td style="padding:5px 8px;">
                    <span style="font-size:0.72rem;font-weight:600;color:${srcColor(d.source)};
                        border:1px solid ${srcColor(d.source)}44;border-radius:3px;padding:1px 5px;">
                        ${srcLabel(d.source)}
                    </span>
                </td>
                <td style="padding:5px 8px;font-size:0.82rem;">${d.carModel || '-'}</td>
                <td style="padding:5px 8px;font-size:0.82rem;font-weight:600;">${d.partName || '-'}</td>
                <td style="padding:5px 8px;font-size:0.78rem;color:var(--text-muted);">${d.color || '-'}</td>
                <td style="padding:5px 8px;text-align:right;font-weight:700;color:var(--accent-blue);">
                    ${UIUtils.formatNumber(d.goodQty || d.inspectionQty || 0)}
                </td>
                <td style="padding:5px 8px;font-size:0.78rem;color:var(--text-secondary);">${d.customer || '-'}</td>
            </tr>`).join('');

        el.innerHTML = `
            <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
                    <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                                letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:13px;color:#f59e0b;">pending_actions</span>
                        출하검사 대기
                        <span style="background:#f59e0b;color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;font-weight:800;">
                            ${waiting.length}건
                        </span>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="Router.navigate('shipping-standby')"
                        style="font-size:0.75rem;padding:3px 10px;">
                        검사 등록 →
                    </button>
                </div>
                <div class="data-table-wrapper" style="max-height:200px;overflow-y:auto;">
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead>
                            <tr>
                                <th style="padding:4px 8px;">등록일</th>
                                <th style="padding:4px 8px;">공정</th>
                                <th style="padding:4px 8px;">차종</th>
                                <th style="padding:4px 8px;">품명</th>
                                <th style="padding:4px 8px;">컬러</th>
                                <th style="padding:4px 8px;text-align:right;">수량</th>
                                <th style="padding:4px 8px;">납품처</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
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
       초중종물(품질체크) 기준 발행 누락 경고 섹션
       - 대상: PROD_QUALITY_CHECK의 quality_template가 존재하는 도장 작업(초중종물 대상)
       - 미발행: quality_issue(workId=work.id) 레코드가 없거나 printedAt 없음
    ══════════════════════════════════════════════════════════ */
    function renderQualityStdWarnings() {
        const el = document.getElementById('dashQualityStdWarnings');
        if (!el) return;

        const WORK_STORE = DB.STORES.PAINTING_WORK;
        const Q_STORE    = DB.STORES.PROD_QUALITY_CHECK;
        if (!WORK_STORE || !Q_STORE) { el.innerHTML = ''; return; }

        const works = Storage.getAll(WORK_STORE) || [];
        const qAll  = Storage.getAll(Q_STORE)    || [];

        const ISSUE_KIND    = 'quality_issue';
        const TEMPLATE_KIND = 'quality_template';

        function _normText(v) { return String(v || '').trim(); }
        function _templates() { return qAll.filter(d => d && d._docKind === TEMPLATE_KIND); }
        function _issues()    { return qAll.filter(d => d && (d._docKind || ISSUE_KIND) === ISSUE_KIND); }

        function _templateFor(carModel, color) {
            const car = _normText(carModel);
            const clr = _normText(color);
            const rows = _templates().filter(t => _normText(t.carModel) === car);
            if (clr) {
                const exact = rows.find(t => _normText(t.color) === clr);
                if (exact) return exact;
            }
            return rows.find(t => !_normText(t.color)) || rows[0] || null;
        }

        const issueMap = new Map(_issues().filter(i => i.workId).map(i => [i.workId, i]));
        const today = UIUtils.today();

        const missing = works
            .filter(function(w) {
                if (!w || !w.id) return false;
                const tmpl = _templateFor(w.carModel, w.color);
                if (!tmpl) return false;
                const issue = issueMap.get(w.id);
                if (!issue) return true;
                return !issue.printedAt;
            })
            .sort(function(a, b) {
                return (b.date || '').localeCompare(a.date || '') ||
                       String(b.registeredAt || b.createdAt || '').localeCompare(String(a.registeredAt || a.createdAt || ''));
            });

        if (!missing.length) { el.innerHTML = ''; return; }

        const show = missing.slice(0, 20);

        function _badge(text, color, bg, icon) {
            return `<span style="display:inline-flex;align-items:center;gap:4px;
                        border:1px solid ${color}44;background:${bg};color:${color};
                        border-radius:999px;padding:2px 8px;font-size:0.72rem;font-weight:800;white-space:nowrap;">
                        <span class="material-symbols-outlined" style="font-size:13px;">${icon}</span>${_esc(text)}</span>`;
        }

        const rows = show.map(function(w) {
            const issue = issueMap.get(w.id);
            const statusText = issue ? (issue.printedAt ? '발행완료' : '발행대기') : '미발행';
            const overdue = w.date && w.date < today;
            const warnBadge = overdue
                ? _badge('전일 이전 미발행', '#dc2626', 'rgba(239,68,68,.08)', 'error')
                : _badge('기준 발행 필요', '#f59e0b', 'rgba(245,158,11,.10)', 'warning');

            return `
                <tr style="cursor:pointer;"
                    onclick="DashboardModule.openQualityIssueFromWork('${_esc(w.id)}')"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:6px 10px;white-space:nowrap;color:var(--text-muted);font-size:0.8rem;">${_esc(w.date || '-')}</td>
                    <td style="padding:6px 8px;white-space:nowrap;font-size:0.78rem;color:#0891b2;font-weight:700;">${_esc(w.line || '-')}</td>
                    <td style="padding:6px 8px;font-weight:700;">${_esc(w.carModel || '-')}</td>
                    <td style="padding:6px 8px;font-weight:600;">${_esc(w.partName || '-')}</td>
                    <td style="padding:6px 8px;font-size:0.78rem;color:var(--text-muted);">${_esc(w.color || '-')}</td>
                    <td style="padding:6px 8px;">${warnBadge}</td>
                    <td style="padding:6px 10px;white-space:nowrap;font-size:0.78rem;color:var(--text-secondary);">${_esc(statusText)}</td>
                </tr>`;
        }).join('');

        el.innerHTML = `
            <div class="card" style="margin-bottom:0;border-left:3px solid #f59e0b;">
                <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:#f59e0b;">checklist</span>
                        <span style="font-weight:700;font-size:0.88rem;color:#b45309;">초중종물 기준 발행 누락</span>
                        <span style="background:#f59e0b;color:#fff;border-radius:10px;padding:0 7px;font-size:0.73rem;font-weight:800;">${missing.length}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);">초중종물(품질체크) 기준 양식 미발행/미완료 · 클릭하여 발행 화면 열기</span>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:6px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">작업일</th>
                                <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">라인</th>
                                <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">차종</th>
                                <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">품명</th>
                                <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">컬러</th>
                                <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">경고</th>
                                <th style="padding:6px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
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
        const paintTodayRows = paintWork.filter(p => p.date === todayStr);
        const paintTodayA = paintTodayRows.filter(p => !/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(String(p.line || '').trim())).length;
        const paintTodayB = paintTodayRows.filter(p => /도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(String(p.line || '').trim())).length;
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
            <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;">
                ${_tile({ icon:'assignment',     title:'생산 계획 지시서', value: todayPlans,
                          valueColor:'#3b82f6',  sub:'오늘 계획 건수',    size:'sm',
                          onClick:"Router.navigate('production-plan')" })}
                ${_tile({ icon:'warehouse',      title:'사출 창고 재고',   value: UIUtils.formatNumber(injTotal),
                          valueColor:'#8b5cf6',  sub:'전체 재고 (EA)',    size:'sm',
                          onClick:"Router.navigate('warehouse-overview')" })}
                ${_tile({ icon:'format_paint',   title:'도장-A 작업',     value: paintTodayA,
                          valueColor:'#0891b2',  sub:'오늘 도장-A',       size:'sm',
                          onClick:"Router.navigate('painting-work-a')" })}
                ${_tile({ icon:'format_paint',   title:'도장-B 작업',     value: paintTodayB,
                          valueColor:'#f59e0b',  sub:'오늘 도장-B',       size:'sm',
                          onClick:"Router.navigate('painting-work-b')" })}
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

    // 대시보드 → 초중종물(기준 발행) 화면 오픈
    function openQualityIssueFromWork(workId) {
        try {
            // 도장 작업 실적 상세가 있으면 먼저 열기 (사용자 컨텍스트 유지)
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.openWorkViewPage === 'function') {
                try { PaintingWorkModule.openWorkViewPage(workId); } catch (e) {}
            }

            // prod-quality 페이지로 이동 후 해당 workId로 발행 모달 열기
            try { sessionStorage.setItem('dash_prodQuality_workId', String(workId || '')); } catch (e) {}
            Router.navigate('prod-quality');

            let retry = 0;
            const timer = setInterval(function() {
                retry += 1;
                let id = '';
                try { id = sessionStorage.getItem('dash_prodQuality_workId') || ''; } catch (e) {}
                if (!id) { clearInterval(timer); return; }

                if (window.ProdQualityModule && typeof window.ProdQualityModule.openWriteFromWork === 'function') {
                    try {
                        window.ProdQualityModule.openWriteFromWork(id);
                        try { sessionStorage.removeItem('dash_prodQuality_workId'); } catch (e) {}
                        clearInterval(timer);
                        return;
                    } catch (e) {}
                }
                if (retry >= 20) clearInterval(timer);
            }, 120);
        } catch (e) {
            Router.navigate('prod-quality');
        }
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

    function refresh(silent) {
        const container = document.getElementById('contentArea');
        render(container);
        if (!silent) UIUtils.toast('대시보드를 새로고침했습니다.', 'success');
    }

    /* ══════════════════════════════════════════════════════════
       텔레그램 알림 발송 모달
    ══════════════════════════════════════════════════════════ */
    function openNotifyModal(templateKey, count) {
        const LABELS = {
            paint_pending:     '도료 입고 대기',
            inj_pending:       '사출 입고 대기',
            work_missing:      '실적 미입력',
            paint_mix_missing: '도료 사용 미등록'
        };
        const label = LABELS[templateKey] || templateKey;

        // Chat ID가 있는 사용자만 표시
        const allUsers = (typeof AuthModule !== 'undefined' && AuthModule.getUsers)
            ? AuthModule.getUsers().filter(function(u) { return u.active !== false && u.chatId; }) : [];
        const noChatUsers = (typeof AuthModule !== 'undefined' && AuthModule.getUsers)
            ? AuthModule.getUsers().filter(function(u) { return u.active !== false && !u.chatId; }).length : 0;

        const userRows = allUsers.map(function(u) {
            return `<label style="display:flex;align-items:center;gap:8px;padding:7px 0;cursor:pointer;border-bottom:1px solid var(--border-color);">
                <input type="checkbox" class="notify-recipient" value="${u.id}" checked style="width:15px;height:15px;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;color:#229ED9;">send</span>
                <span style="font-weight:600;min-width:80px;">${u.displayName || u.username}</span>
                <span style="font-size:.78rem;color:var(--text-muted);">Chat ID: ${u.chatId}</span>
                <span style="font-size:.72rem;color:var(--text-muted);margin-left:auto;">${(u.roles||[u.role||'']).join(', ')}</span>
            </label>`;
        }).join('');

        UIUtils.showModal(`텔레그램 알림 발송 — ${label}`,
            `<div style="min-width:360px;max-width:500px;">
                <div style="background:#229ED915;border:1px solid #229ED940;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:#229ED9;">send</span>
                    <div><strong>${label}</strong> ${count}건 발생 알림을<br>텔레그램으로 전송합니다.</div>
                </div>
                <div style="font-size:.8rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">수신자 선택</div>
                ${allUsers.length
                    ? `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:0 10px;">${userRows}</div>`
                    : `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:.85rem;border:1px solid var(--border-color);border-radius:6px;">
                        텔레그램 Chat ID가 등록된 사용자가 없습니다.<br>
                        <span style="font-size:.78rem;">설정 → 사용자 관리에서 Chat ID를 등록하세요.</span>
                    </div>`}
                ${noChatUsers > 0 ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">※ Chat ID 미등록 사용자 ${noChatUsers}명은 목록에 표시되지 않습니다.</div>` : ''}
                <div id="notifyStatusMsg" style="margin-top:10px;min-height:20px;font-size:.82rem;"></div>
            </div>`,
            allUsers.length
                ? `<button class="btn btn-primary" onclick="DashboardModule._doSendNotify('${templateKey}',${count})">
                        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">send</span> 발송
                    </button>
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>`
                : `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`
        );
    }

    async function _doSendNotify(templateKey, count) {
        const statusEl = document.getElementById('notifyStatusMsg');
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">발송 중…</span>';

        const checked = Array.from(document.querySelectorAll('.notify-recipient:checked'));
        if (!checked.length) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">수신자를 선택하세요.</span>';
            return;
        }
        const allUsers = AuthModule.getUsers ? AuthModule.getUsers() : [];
        const recipients = checked.map(function(cb) {
            const u = allUsers.find(function(u) { return u.id === cb.value; });
            return u ? { chatId: u.chatId, name: u.displayName || u.username } : null;
        }).filter(Boolean);

        try {
            await ApiClient.sendNotify(null, recipients, { templateKey, count: String(count) });
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ 텔레그램 알림이 발송되었습니다.</span>';
            setTimeout(function() { UIUtils.closeModal(); }, 1500);
        } catch(e) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">발송 실패: ' + e.message + '</span>';
        }
    }

    return {
        render,
        refresh,
        openIlluminationCheck,
        openFProof,
        openEquipMode,
        openQualityIssueFromWork,
        openProductAdjustLogs,
        openNotifyModal,
        _doSendNotify
    };
})();
