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
            STORE.PAINT_INCOMING_INSPECTIONS,
            STORE.SHIPPING_STANDBY,
            STORE.PRODUCT_INVENTORY,
            STORE.PRODUCT_OUTGOING,
            STORE.PROD_QUALITY_CHECK,
            STORE.PROD_CONDITIONS
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

    function _countTile({ icon, title, count, warnSub, okSub, onClick, warnColor, badge }) {
        const n = Number(count) || 0;
        const C = n > 0 ? (warnColor || '#f59e0b') : '#22c55e';
        return _tile({
            icon: icon,
            title: title,
            value: n,
            valueColor: C,
            sub: n > 0 ? (warnSub || '확인 필요') : (okSub || '없음'),
            onClick: onClick,
            badge: n > 0 ? (badge || (n + '건')) : '',
            size: 'sm'
        });
    }

    /* ══════════════════════════════════════════════════════════
       메인 렌더
    ══════════════════════════════════════════════════════════ */
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up" style="display:flex;flex-direction:column;gap:10px;">
            <!-- 생산 현황 타일 -->
            <div id="dashProdTiles"></div>

            <!-- 대기/누락 건수 타일 (리스트 없음) -->
            <div id="dashAttentionTiles"></div>

            <!-- 점검/관리 타일 -->
            <div id="dashMonitorTiles"></div>
        </div>`;

        renderProductionTiles();
        renderAttentionTiles().catch(e => console.warn('[Dashboard] 대기/누락 타일 렌더 실패:', e));
        _scheduleIdleWork(renderMonitorTiles);   // async + config fetch
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
       도료 입고 대기 건수 (물류담당자/관리자 전용)
    ══════════════════════════════════════════════════════════ */
    function _canSeePaintPending() {
        if (typeof AuthModule === 'undefined') return true;
        const user = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        if (!user) return false;
        const roles = (user.roles || [user.role]).map(String).filter(Boolean);
        if (roles.some(r => ['admin', 'prod_manager', 'logistics_worker'].includes(r))) return true;
        if (typeof AuthModule.canWritePage === 'function' && AuthModule.canWritePage('paint-inventory')) return true;
        return false;
    }

    function getPaintPendingCount() {
        if (!_canSeePaintPending()) return { visible: false, count: 0 };

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

        return { visible: true, count: pending.length };
    }

    /* ══════════════════════════════════════════════════════════
       경보 건수 (사출 입고 대기 / 실적 미입력 / 도료 사용 미등록 / LOT)
    ══════════════════════════════════════════════════════════ */
    async function getAlertCounts() {
        const today = UIUtils.today();

        /* ① 사출 입고 대기 */
        // 검사 후 며칠째 창고 입고가 안 된 건지 — 대기가 길수록 그 사이 출고가 "입고 없이 나간
        // 출고"가 되어 미차감(과다출고)으로 잡힌다. 오래된 건을 눈에 띄게 하려고 경과일을 붙인다.
        function _waitDaysSince(dateLike) {
            const day = String(dateLike || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
            const from = new Date(day + 'T00:00:00');
            const to = new Date(String(today).slice(0, 10) + 'T00:00:00');
            if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
            return Math.max(0, Math.round((to - from) / 86400000));
        }
        // 대기 목록은 사출 창고 모듈의 판정을 그대로 쓴다 — 여기서 따로 계산하면
        // 숨김 처리·컷오버·검사건(inspId) 매칭이 빠져 창고 화면과 건수가 어긋난다
        // (창고에서는 사라진 항목이 대시보드에는 계속 남아 있는 문제).
        let injPending = [];
        if (typeof InjectionWarehouseModule !== 'undefined'
            && typeof InjectionWarehouseModule.getPendingInboundRows === 'function') {
            try {
                injPending = (await InjectionWarehouseModule.getPendingInboundRows()).map(r => ({
                    date: r.date, carModel: r.carModel, partName: r.partName, color: r.color,
                    lotNo: r.lotNo, qty: r.qty,
                    waitDays: r.waitDays != null ? r.waitDays : _waitDaysSince(r.date)
                }));
            } catch (e) {
                console.warn('[Dashboard] 입고 대기 조회 실패:', e);
            }
        }

        /* ② 실적 미입력 (하루 이상 지난 계획 — 수량 있는 작업실적 없음)
           - status '완료'는 종료시각 자동갱신일 수 있음
           - planId 연동 + 수량>0 인 실적만 "입력됨"으로 본다
           - 당일 미입력은 아직 입력 가능 구간이므로 경보에서 제외 */
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];
        const works = Storage.getAll(DB.STORES.PAINTING_WORK)    || [];
        function _dashPlanDay(p) { return String(p.date || '').trim().slice(0, 10); }
        function _dashWorkFulfills(w, planId) {
            if (!w || planId == null || planId === '') return false;
            if (String(w.planId) !== String(planId)) return false;
            const input = Number(w.inputQty) || 0;
            const prod = Number(w.productionQty) || 0;
            const lotSum = Array.isArray(w.lots)
                ? w.lots.reduce(function (s, l) { return s + (Number(l && l.qty) || 0); }, 0) : 0;
            return (input + prod + lotSum) > 0;
        }
        // 생산계획 수정 시 구 문서가 남는 구조 — 일자+라인+시작시각 최신 1건만 남겨야
        // 수정 전 계획이 '실적 미입력'으로 계속 잡히지 않는다 (도장 작업현황과 동일 규칙)
        const _dashLivePlans = (function () {
            const byKey = {};
            const noKey = [];
            plans.forEach(function (p) {
                if (!p) return;
                const slot = String(p.startTime || p.slot || '').trim();
                if (!slot) { noKey.push(p); return; }
                const key = _dashPlanDay(p) + '||' + String(p.line || '').replace(/\s/g, '') + '||' + slot;
                const prev = byKey[key];
                if (!prev) { byKey[key] = p; return; }
                const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                    || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
                if (newer) byKey[key] = p;
            });
            return Object.values(byKey).concat(noKey);
        })();

        const unenteredPlans = _dashLivePlans
            .filter(function (p) {
                const day = _dashPlanDay(p);
                if (!day || day >= today) return false;
                if (!(p.carModel || p.partName)) return false;
                if (!(Number(p.planQty) > 0)) return false;
                if (!p.id) return false;
                return !works.some(function (w) { return _dashWorkFulfills(w, p.id); });
            })
            .sort(function (a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });

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

        const injOverdue = injPending.filter(r => (r.waitDays || 0) >= 3);
        const injMaxWait = injOverdue.length
            ? Math.max.apply(null, injOverdue.map(r => r.waitDays || 0))
            : 0;

        let paintMissingCount = paintMissing.length;
        try {
            const hiddenList = await Storage.getConfigValue('paint_mix_hidden_works_v1');
            const hidden = new Set((Array.isArray(hiddenList) ? hiddenList : []).map(String));
            if (hidden.size) {
                paintMissingCount = paintMissing.filter(w => !hidden.has(String(w.id))).length;
            }
        } catch (e) {}

        return {
            injPending: injPending.length,
            injOverdue: injOverdue.length,
            injMaxWait: injMaxWait,
            unentered: unenteredPlans.length,
            lotErrors: lotErrors.length,
            lotClick: lotErrors.length === 1
                ? `App.goToLotErrorSource('${_esc(lotErrors[0].src || '')}','${_esc(lotErrors[0].id || '')}')`
                : 'App.goToLotRepairTab()',
            paintMissing: paintMissingCount
        };
    }

    /* ══════════════════════════════════════════════════════════
       관리자 보고 누락 건수
    ══════════════════════════════════════════════════════════ */
    function getManagerAlertCount() {
        const works = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        let count = 0;
        works.forEach(function(d) {
            if (!d) return;
            if ((d.timeReason && !d.timeManagerNotified)
                || (d.qtyDiffReason && !d.qtyDiffManagerNotified)
                || (d.planReason && !d.planManagerNotified)) {
                count += 1;
            }
        });
        return count;
    }

    /* ══════════════════════════════════════════════════════════
       초중종물(품질체크) 기준 발행 누락 건수
       - 대상: 계획 시작 5분 후 생성된 quality_issue 또는 도장 작업(초중종물 대상)
       - 미발행: 발행완료(printedAt/상태) 이력이 없는 도장 작업만 집계
       - 자동 생성 발행대기보다 같은 작업의 발행완료 이력을 우선한다
    ══════════════════════════════════════════════════════════ */
    function getQualityStdWarningCounts() {
        const WORK_STORE = DB.STORES.PAINTING_WORK;
        const Q_STORE    = DB.STORES.PROD_QUALITY_CHECK;
        if (!WORK_STORE || !Q_STORE) return { total: 0, overdue: 0 };

        const works = Storage.getAll(WORK_STORE) || [];
        const qAll  = Storage.getAll(Q_STORE)    || [];

        const ISSUE_KIND    = 'quality_issue';
        const TEMPLATE_KIND = 'quality_template';

        function _normText(v) { return String(v || '').trim(); }
        function _dateKey(v) {
            const s = String(v || '').trim().replace('T', ' ');
            return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        }
        function _normKey(v) {
            return String(v || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[()[\]\-_/.,]/g, '');
        }
        function _normPart(car, part) {
            let p = _normKey(part);
            const c = _normKey(car);
            if (c && p.indexOf(c) === 0) p = p.slice(c.length);
            return p;
        }
        function _templates() { return qAll.filter(d => d && d._docKind === TEMPLATE_KIND); }
        function _issues()    { return qAll.filter(d => d && (d._docKind || ISSUE_KIND) === ISSUE_KIND); }

        function _isPrinted(issue) {
            if (!issue) return false;
            const status = String(issue.status || '').replace(/\s/g, '');
            return !!issue.printedAt || status === '발행완료' || status.indexOf('발행완료') !== -1;
        }

        function _issueStamp(issue) {
            return String((issue && (issue.updatedAt || issue.createdAt || issue.printedAt || issue.id)) || '');
        }

        function _prefer(prev, next) {
            if (!prev) return next || null;
            if (!next) return prev;
            const p = _isPrinted(prev) ? 1 : 0;
            const n = _isPrinted(next) ? 1 : 0;
            if (n !== p) return n > p ? next : prev;
            return _issueStamp(next) > _issueStamp(prev) ? next : prev;
        }

        function _fieldsMatch(a, b) {
            if (_normKey(a.carModel) !== _normKey(b.carModel)) return false;
            const p1 = _normPart(a.carModel, a.partName);
            const p2 = _normPart(b.carModel, b.partName);
            if (!p1 || !p2) return false;
            if (p1 !== p2 && p1.indexOf(p2) === -1 && p2.indexOf(p1) === -1) return false;
            const c1 = _normKey(a.color);
            const c2 = _normKey(b.color);
            if (!c1 || !c2) return true;
            return c1 === c2 || c1.indexOf(c2) !== -1 || c2.indexOf(c1) !== -1;
        }

        function _issueDates(issue) {
            const keys = [];
            [_dateKey(issue.date), _dateKey(issue.printedAt)].forEach(function(d) {
                if (d && keys.indexOf(d) === -1) keys.push(d);
            });
            return keys;
        }

        function _issueMatchesWork(issue, w) {
            if (!issue || !w) return false;
            if (issue.workId && String(issue.workId) === String(w.id)) return true;
            if (issue.planId && w.planId && String(issue.planId) === String(w.planId)) return true;
            if (!_fieldsMatch(issue, w)) return false;
            const wdate = _dateKey(w.date);
            const idates = _issueDates(issue);
            if (wdate && idates.indexOf(wdate) !== -1) return true;
            const ilot = String(issue.lotNo || '').replace(/\s+/g, '').toUpperCase();
            const wlot = String(w.lotNo || '').replace(/\s+/g, '').toUpperCase();
            if (ilot && wlot && (ilot === wlot || ilot.indexOf(wlot) !== -1 || wlot.indexOf(ilot) !== -1)) return true;
            return !!( _isPrinted(issue) && wdate && !idates.length );
        }

        function _issueForWork(w, issues) {
            let found = null;
            issues.forEach(function(issue) {
                if (_issueMatchesWork(issue, w)) found = _prefer(found, issue);
            });
            return found;
        }

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

        const issues = _issues();
        const today = UIUtils.today();
        const seen = new Set();
        const missing = [];

        works.forEach(function(w) {
            if (!w || !w.id) return;
            const tmpl = _templateFor(w.carModel, w.color);
            if (!tmpl) return;
            const issue = _issueForWork(w, issues);
            if (_isPrinted(issue)) return;
            seen.add(w.id);
            if (w.planId) seen.add('plan:' + w.planId);
            missing.push({
                id: w.id,
                date: w.date,
                line: w.line,
                carModel: w.carModel,
                partName: w.partName,
                color: w.color,
                issue: issue,
                sortKey: String(w.registeredAt || w.createdAt || w.date || '')
            });
        });

        issues.forEach(function(issue) {
            if (_isPrinted(issue)) return;
            const alreadyIssued = issues.some(function(other) {
                if (other === issue || !_isPrinted(other)) return false;
                if (issue.workId && other.workId && String(issue.workId) === String(other.workId)) return true;
                if (issue.planId && other.planId && String(issue.planId) === String(other.planId)) return true;
                return _fieldsMatch(issue, other) && (
                    _dateKey(issue.date) === _dateKey(other.date)
                    || _issueDates(issue).some(function(d) { return _issueDates(other).indexOf(d) !== -1; })
                );
            });
            if (alreadyIssued) return;
            const key = issue.workId || (issue.planId ? 'plan:' + issue.planId : issue.id);
            if (seen.has(key) || (issue.workId && seen.has(issue.workId)) || (issue.planId && seen.has('plan:' + issue.planId))) return;
            if (!_templateFor(issue.carModel, issue.color) && !(issue.items || []).length) return;
            seen.add(key);
            missing.push({
                id: issue.workId || (issue.planId ? 'plan:' + issue.planId : issue.id),
                date: issue.date,
                line: issue.line,
                carModel: issue.carModel,
                partName: issue.partName,
                color: issue.color,
                issue: issue,
                sortKey: String(issue.createdAt || issue.updatedAt || issue.id || issue.date || '')
            });
        });

        missing.sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '') || String(b.sortKey).localeCompare(String(a.sortKey));
        });

        const overdue = missing.filter(function(w) { return w.date && w.date < today; }).length;
        return { total: missing.length, overdue: overdue };
    }

    /* ══════════════════════════════════════════════════════════
       대기 / 누락 건수 타일 (리스트 없음)
    ══════════════════════════════════════════════════════════ */
    async function renderAttentionTiles() {
        const el = document.getElementById('dashAttentionTiles');
        if (!el) return;

        const quality = getQualityStdWarningCounts();
        const paintPending = getPaintPendingCount();
        const managerCount = getManagerAlertCount();
        const alerts = await getAlertCounts();

        const injSub = alerts.injPending > 0
            ? (alerts.injOverdue > 0
                ? ('3일 이상 ' + alerts.injOverdue + '건 · 최장 ' + alerts.injMaxWait + '일')
                : '창고 미입고')
            : '대기 없음';
        const qualitySub = quality.total > 0
            ? (quality.overdue > 0
                ? ('전일 이전 ' + quality.overdue + '건')
                : '발행완료 품목 제외')
            : '누락 없음';

        const tiles = [];
        tiles.push(_countTile({
            icon: 'checklist',
            title: '초중종물 미발행',
            count: quality.total,
            warnSub: qualitySub,
            okSub: '누락 없음',
            onClick: "Router.navigate('prod-quality')",
            warnColor: quality.overdue > 0 ? '#ef4444' : '#f59e0b',
            badge: '누락'
        }));
        tiles.push(_countTile({
            icon: 'precision_manufacturing',
            title: '사출 입고 대기',
            count: alerts.injPending,
            warnSub: injSub,
            okSub: '대기 없음',
            onClick: "Router.navigate('warehouse-overview')",
            warnColor: alerts.injOverdue > 0 ? '#ef4444' : '#8b5cf6',
            badge: '대기'
        }));
        tiles.push(_countTile({
            icon: 'inventory',
            title: '도료 입고 대기',
            count: paintPending.count,
            warnSub: '창고 미입고',
            okSub: '대기 없음',
            onClick: "Router.navigate('paint-inventory')",
            warnColor: '#0891b2',
            badge: '대기'
        }));
        tiles.push(_countTile({
            icon: 'edit_note',
            title: '실적 미입력',
            count: alerts.unentered,
            warnSub: '전일 이전 계획',
            okSub: '미입력 없음',
            onClick: "Router.navigate('painting-work-a')",
            warnColor: '#f59e0b',
            badge: '미입력'
        }));
        tiles.push(_countTile({
            icon: 'science',
            title: '도료 사용 미등록',
            count: alerts.paintMissing,
            warnSub: '전일 이전 작업',
            okSub: '모두 등록됨',
            onClick: "Router.navigate('paint-mix')",
            warnColor: '#ef4444',
            badge: '미등록'
        }));
        tiles.push(_countTile({
            icon: 'notification_important',
            title: '관리자 보고 누락',
            count: managerCount,
            warnSub: '도장 실적 미통보',
            okSub: '누락 없음',
            onClick: "Router.navigate('painting-work-a')",
            warnColor: '#ef4444',
            badge: '누락'
        }));
        tiles.push(_countTile({
            icon: 'barcode_scanner',
            title: '사출 LOT 형식 오류',
            count: alerts.lotErrors,
            warnSub: '형식 확인 필요',
            okSub: '오류 없음',
            onClick: alerts.lotErrors > 0 ? alerts.lotClick : "Router.navigate('warehouse-overview')",
            warnColor: '#ef4444',
            badge: '오류'
        }));

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:7px;">
                <span class="material-symbols-outlined" style="font-size:13px;">warning</span>
                대기 / 누락
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
                ${tiles.join('')}
            </div>
        </div>`;
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
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
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
            const sourceId = String(workId || '');
            if (sourceId.indexOf('plan:') !== 0) {
                if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.openWorkViewPage === 'function') {
                    try { PaintingWorkModule.openWorkViewPage(workId); } catch (e) {}
                }
            }

            try { sessionStorage.setItem('dash_prodQuality_workId', sourceId); } catch (e) {}
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
       쪽지 + Slack 채널 알림 발송 모달
    ══════════════════════════════════════════════════════════ */
    async function openNotifyModal(templateKey, count) {
        const LABELS = {
            paint_pending:     '도료 입고 대기',
            inj_pending:       '사출 입고 대기',
            work_missing:      '실적 미입력',
            paint_mix_missing: '도료 사용 미등록'
        };
        const label = LABELS[templateKey] || templateKey;

        const allUsers = (typeof AuthModule !== 'undefined' && AuthModule.getUsers)
            ? AuthModule.getUsers().filter(function(u) { return u.active !== false; }) : [];

        let slackReady = false;
        let telegramReady = false;
        try {
            const cfg = (typeof ApiClient !== 'undefined' && ApiClient.checkNotifyConfig)
                ? await ApiClient.checkNotifyConfig() : null;
            slackReady = !!(cfg && cfg.slackWebhookSet);
            telegramReady = !!(cfg && (cfg.botTokenSet || cfg.configured));
        } catch (e) {}

        const DEFAULT_NOTIFY_ROLES = ['admin', 'prod_manager', 'quality_manager', 'logistics_worker'];
        const userRows = allUsers.map(function(u) {
            const keys = [].concat(u.roles || [], u.role ? [u.role] : []);
            const precheck = keys.some(function(k) { return DEFAULT_NOTIFY_ROLES.indexOf(String(k)) >= 0; });
            return `<label style="display:flex;align-items:center;gap:8px;padding:7px 0;cursor:pointer;border-bottom:1px solid var(--border-color);">
                <input type="checkbox" class="notify-recipient" value="${u.id}"${precheck ? ' checked' : ''} style="width:15px;height:15px;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;color:#4A154B;">mail</span>
                <span style="font-weight:600;min-width:80px;">${u.displayName || u.username}</span>
                <span style="font-size:.72rem;color:var(--text-muted);margin-left:auto;">${(u.roles||[u.role||'']).join(', ')}</span>
            </label>`;
        }).join('');

        UIUtils.showModal(`알림 발송 — ${label}`,
            `<div style="min-width:360px;max-width:500px;">
                <div style="background:#4A154B12;border:1px solid #4A154B40;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:#4A154B;">campaign</span>
                    <div><strong>${label}</strong> ${count}건 알림을<br>MES 쪽지, Slack 채널, 텔레그램(Chat ID 있는 수신자)에 함께 보냅니다.</div>
                </div>
                <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:10px;line-height:1.55;">
                    <div style="color:${slackReady ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${slackReady
                            ? 'Slack Webhook 연결됨 — 채널에도 1건 전달됩니다.'
                            : 'Slack Webhook 미설정 — 채널 전달은 건너뜁니다.'}
                    </div>
                    <div style="color:${telegramReady ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${telegramReady
                            ? '텔레그램 Bot 연결됨 — Chat ID가 있는 수신자 개인 대화로 전달됩니다.'
                            : '텔레그램 Bot 미설정 — 개인 텔레그램은 건너뜁니다. 설정 → 시스템에서 Token을 저장하세요.'}
                    </div>
                </div>
                <div style="font-size:.8rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">쪽지 수신자</div>
                ${allUsers.length
                    ? `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:0 10px;">${userRows}</div>`
                    : `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:.85rem;border:1px solid var(--border-color);border-radius:6px;">
                        활성 사용자가 없습니다.
                    </div>`}
                <div id="notifyStatusMsg" style="margin-top:10px;min-height:20px;font-size:.82rem;"></div>
            </div>`,
            allUsers.length
                ? `<button class="btn btn-primary" onclick="DashboardModule._doSendNotify('${templateKey}',${count})">
                        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">send</span> 쪽지+채널 발송
                    </button>
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>`
                : `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`
        );
    }

    async function _doSendNotify(templateKey, count) {
        const statusEl = document.getElementById('notifyStatusMsg');
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">발송 중…</span>';

        const LABELS = {
            paint_pending:     '도료 입고 대기',
            inj_pending:       '사출 입고 대기',
            work_missing:      '실적 미입력',
            paint_mix_missing: '도료 사용 미등록'
        };
        const label = LABELS[templateKey] || templateKey;
        const title = '[MES 알림] ' + label;
        const body = count + '건이 처리 대기 중입니다.';

        const checked = Array.from(document.querySelectorAll('.notify-recipient:checked'));
        if (!checked.length) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 수신자를 선택하세요.</span>';
            return;
        }
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 기능을 사용할 수 없습니다.</span>';
            return;
        }

        let noteOk = 0;
        checked.forEach(function(cb) {
            const ok = AuthModule.sendInternalMessage({
                targetType: 'user',
                targetId: cb.value,
                title: title,
                body: body,
                category: 'dashboard-notify',
                priority: 'high'
            });
            if (ok) noteOk += 1;
        });

        if (!noteOk) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 발송에 실패했습니다. 로그인 상태를 확인하세요.</span>';
            return;
        }
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ 쪽지 ' + noteOk +
                '건 저장. Chat ID가 있는 수신자 텔레그램과 Slack 채널에도 전달됩니다.</span>';
        }
        setTimeout(function() { UIUtils.closeModal(); }, 1600);
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
