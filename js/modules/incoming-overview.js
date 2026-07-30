/**
 * 수입검사 허브 (공유 UI + 메인 허브)
 */

/* ══════════════════════════════════════════════════════════════
   공유 소메뉴 UI (LaserProcessUI 패턴)
══════════════════════════════════════════════════════════════ */
var IncomingUI = (function () {
    const MENUS = [
        { id: 'incoming-overview',         label: '수입검사 현황',    icon: 'dashboard',       desc: '사출·도료 입고검사 등록, 기준서, 표준서를 한 화면에서 관리합니다.' },
        { id: 'injection-incoming',        label: '사출 입고',        icon: 'fact_check',      desc: '사출 자재 수입검사 등록 및 LOT·성적서·FIFO 관리' },
        { id: 'paint-incoming-inspection', label: '도료 입고',        icon: 'colorize',        desc: '도료 수입검사 등록 및 유효기간·성적서 관리' },
        { id: 'inj-incoming-std',          label: '사출 수입검사 기준서', icon: 'description',     desc: '사출 수입검사 기준서 등록·편집·출력' },
        { id: 'paint-incoming-std',        label: '도료 수입검사 기준서', icon: 'picture_as_pdf',  desc: '입고 도료에 대한 수입검사 기준서 목록' },
        { id: 'inj-insp-std-photo',        label: '수입검사 표준서',  icon: 'photo_library',   desc: '차종·품명별 수입검사 기준 사진 및 표준서 관리' },
        { id: 'incoming-delete-log',       label: '이력변경 관리',    icon: 'manage_history',  desc: '수입검사 삭제 이력 및 변경 감사 로그' },
    ];
    const MAIN_MENU_IDS = ['incoming-overview', 'injection-incoming', 'paint-incoming-inspection', 'incoming-delete-log'];
    const DOC_MENU_IDS = ['inj-incoming-std', 'paint-incoming-std', 'inj-insp-std-photo'];

    function _menuButton(menu, activePage) {
        const active = menu.id === activePage;
        return `<button type="button" onclick="Router.navigate('${menu.id}')"
            style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                   border:${active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)'};
                   background:var(--bg-primary);color:var(--text-primary);
                   cursor:pointer;min-width:140px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <span style="display:inline-flex;align-items:center;justify-content:center;
                         width:42px;height:42px;border-radius:10px;flex-shrink:0;
                         background:${active ? 'var(--accent-blue)' : 'var(--bg-secondary)'};">
                <span class="material-symbols-outlined" style="font-size:24px;color:${active ? '#fff' : 'var(--text-muted)'};">${menu.icon}</span>
            </span>
            <span style="display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">${menu.label}</span>
            </span>
        </button>`;
    }

    function renderSection(activePage) {
        const mainMenus = MENUS.filter(m => MAIN_MENU_IDS.includes(m.id));
        const docMenus = MENUS.filter(m => DOC_MENU_IDS.includes(m.id));
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    ${mainMenus.map(m => _menuButton(m, activePage)).join('')}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">
                    ${docMenus.map(m => _menuButton(m, activePage)).join('')}
                </div>
            </div>`;
    }
    return { renderSection };
})();

/* ══════════════════════════════════════════════════════════════
   수입검사 허브 메인
══════════════════════════════════════════════════════════════ */
var IncomingOverviewModule = (function () {

    let _inj   = null;
    let _paint = null;

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _isAdminUser() {
        return typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function'
            && AuthModule.isAdminUser();
    }

    function _cutoverDay(v) {
        return String(v == null ? '' : v).trim().slice(0, 10);
    }

    // MES 도입 초기 보정·오류 이력 — 직접입고(미검사) 목록에서 제외할 컷오버 시점
    const VIOLATION_CUTOVER_KEY = 'incoming_direct_inbound_violation_cutover_v1';
    let _violationCutover = '';
    let _violationCutoverMeta = null;
    let _violationCutoverLoaded = false;

    function _parseCutoverConfig(v) {
        if (!v) return { day: '', meta: null };
        if (typeof v === 'string') return { day: _cutoverDay(v), meta: null };
        if (typeof v === 'object') {
            return { day: _cutoverDay(v.cutoverDate || v.date || ''), meta: v };
        }
        return { day: '', meta: null };
    }

    async function _ensureViolationCutoverLoaded(forceReload) {
        if (_violationCutoverLoaded && !forceReload) return _violationCutover;
        try {
            const raw = await Storage.getConfigValue(VIOLATION_CUTOVER_KEY);
            const parsed = _parseCutoverConfig(raw);
            _violationCutover = parsed.day;
            _violationCutoverMeta = parsed.meta;
        } catch (e) {
            _violationCutover = '';
            _violationCutoverMeta = null;
        }
        _violationCutoverLoaded = true;
        return _violationCutover;
    }

    function _isBeforeViolationCutover(recordDate) {
        const cutover = _getEffectiveViolationCutover();
        const d = _cutoverDay(recordDate);
        if (!d) return false;
        return d < cutover;
    }

    function _todayCutover() {
        return UIUtils.today ? UIUtils.today() : new Date().toISOString().slice(0, 10);
    }

    /** 과거 직접입고 이력은 경고 대상 아님 — 당일(또는 관리자 지정일)부터만 모니터 */
    function _getEffectiveViolationCutover() {
        return _violationCutover || _todayCutover();
    }

    function init() {}

    function render(container) {
        const now = new Date();
        const monthStr   = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const monthLabel = now.getFullYear() + '년 ' + String(now.getMonth() + 1).padStart(2, '0') + '월';

        _inj   = _calcInjStats(monthStr);
        _paint = _calcPaintStats(monthStr);

        // 기준서 등록 현황 (사출 자재 마스터 기준)
        const allProds = (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []).filter(p => p.carModel && p.injPartName);
        const allStds  = Storage.getAll(DB.STORES.INJ_INCOMING_STD) || [];
        const stdCount = allStds.length;
        const unregCount = Math.max(0, allProds.length - stdCount);

        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('incoming-overview')}

            <div class="section-card" style="padding:0;overflow:hidden;">
                <div style="padding:24px;">

                    <!-- ── 이달 실적 지표 ── -->
                    <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);
                                text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
                        ${monthLabel} 수입검사 실적
                    </div>
                    <div id="incomingHubStats" class="stat-cards" style="margin-bottom:24px;"></div>

                    <!-- ── 바로가기 카드 ── -->
                    <div id="incomingHubCards" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;"></div>

                    <!-- ── 프로세스 경고 (메뉴 아래, 축소) ── -->
                    <div id="incomingHubProcessWarning" style="margin-top:16px;"></div>
                </div>
            </div>
        </div>`;

        /* stat cards */
        const statsEl = document.getElementById('incomingHubStats');
        if (statsEl) {
            statsEl.innerHTML = [
                _metricCard('blue',   _inj.count,                          '사출 검사건수',   `${UIUtils.formatNumber(_inj.totalQty)} EA`),
                _metricCard('green',  _inj.passCount,                      '사출 합격',       `불합격 ${_inj.failCount}건`),
                _metricCard(_inj.certPending > 0 ? 'red' : '',
                                      _inj.certPending,                    '성적서 미접수',   '사출'),
                _clickMetricCard(_inj.fifoCount > 0 ? 'orange' : 'green',
                                      _inj.fifoCount,                      '선입선출 위반',   _inj.fifoCount > 0 ? '클릭하여 목록 보기' : '이달 위반 없음',
                                      _inj.fifoCount > 0, 'IncomingOverviewModule.showInjFifo()'),
                _metricCard('purple', _paint.count,                        '도료 검사건수',   `${UIUtils.formatNumber(_paint.totalQty)} L/kg`),
                _metricCard(_paint.expiredCount > 0 ? 'red' : 'orange',
                                      _paint.expiredCount + _paint.expiringCount, '도료 유효기간 이슈', `만료 ${_paint.expiredCount} / 임박 ${_paint.expiringCount}`),
                _metricCard(unregCount > 0 ? 'orange' : 'green',
                                      unregCount,                          '기준서 미등록',   `등록 ${stdCount}종`)
            ].join('');
        }

        /* nav cards */
        const cardsEl = document.getElementById('incomingHubCards');
        if (cardsEl) {
            const injFifoHint = _inj.fifoCount > 0 ? ` · FIFO ${_inj.fifoCount}건` : '';
            cardsEl.innerHTML = [
                _homeCard('사출 입고',
                    '사출 자재 수입검사 등록 및 LOT·성적서·FIFO 관리',
                    'fact_check', `${_inj.count}건${injFifoHint}`, "Router.navigate('injection-incoming')", _inj.fifoCount > 0 ? 'orange' : 'blue'),
                _homeCard('도료 입고',
                    '도료 수입검사 등록 및 유효기간·성적서 관리',
                    'colorize', `${_paint.count}건`, "Router.navigate('paint-incoming-inspection')", 'purple'),
                _homeCard('사출 수입검사 기준서',
                    '사출 수입검사 기준서 등록·편집·출력',
                    'description', `${stdCount}종 등록${unregCount > 0 ? ' / ' + unregCount + '종 미등록' : ''}`,
                    "Router.navigate('inj-incoming-std')", unregCount > 0 ? 'orange' : 'green'),
                _homeCard('도료 수입검사 기준서',
                    '도료 수입검사 기준서 목록',
                    'picture_as_pdf', '-', "Router.navigate('paint-incoming-std')", 'purple'),
                _homeCard('수입검사 표준서',
                    '차종·품명별 수입검사 기준 사진 및 표준서 관리',
                    'photo_library', '-', "Router.navigate('inj-insp-std-photo')", 'blue'),
            ].join('');
        }

        _ensureViolationCutoverLoaded().then(renderProcessViolationWarning).catch(renderProcessViolationWarning);
    }

    function _collectProcessViolationsRaw() {
        const ctx = _buildInspLinkContext();
        return (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [])
            .filter(function (d) { return _isDirectInboundWithoutInsp(d, ctx); })
            .sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    }

    function _collectProcessViolations() {
        return _collectProcessViolationsRaw().filter(function (d) {
            return !_isBeforeViolationCutover(d.date);
        });
    }
    function _isStockErrorResetRecord(d) {
        return !!(d && (d.isStockErrorReset || d.resetAction === 'stock_error_reset'
            || /재고 오류 초기화/.test(String(d.source || ''))));
    }

    /** 사출자재 마스터·입고 기록 기준 수입검사 대상 여부 (injection_part1: 외부 공급처만) */
    function _isIncomingInspectionTarget(d, ctx) {
        if (!d) return false;
        const recordSupplier = String(d.supplier || '').trim();
        if (recordSupplier === '사내') return false;

        const car = String(d.carModel || '').trim();
        const part = String(d.partName || '').trim();
        const color = String(d.color || '').trim();
        if (!car || !part) return true;

        const materials = (ctx && ctx.materials) || Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        let candidates = materials.filter(function (m) {
            return String(m.carModel || '').trim() === car
                && String(m.injPartName || m.partName || '').trim() === part;
        });
        if (color) {
            const byColor = candidates.filter(function (m) {
                const mc = String(m.injColor || m.color || '').trim();
                return !mc || mc === color;
            });
            if (byColor.length) candidates = byColor;
        }
        if (!candidates.length) {
            return recordSupplier !== '' && recordSupplier !== '사내';
        }
        return candidates.some(function (m) {
            return String(m.supplier || '').trim() !== '사내';
        });
    }

    /** 사출 창고 입고 ↔ 수입검사 연동 여부 (창고 상세·수입검사일 표시와 동일 기준) */
    function _buildInspLinkContext() {
        const inspDateMap = {};
        (Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || []).forEach(function (insp) {
            const lots = (insp.lots && insp.lots.length)
                ? insp.lots
                : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
            lots.forEach(function (lot) {
                const lotNo = String(lot.lotNo || '').trim();
                const part = String(insp.partName || '').trim();
                if (!lotNo || !part) return;
                const k = part + '||' + lotNo;
                if (!inspDateMap[k]) inspDateMap[k] = insp.date || '';
            });
        });
        const inboundInspMap = {};
        (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).forEach(function (r) {
            if (r.type === '출고' || !r.partName || !r.lotNo) return;
            const k = String(r.partName) + '||' + String(r.lotNo);
            if (inboundInspMap[k]) return;
            const src = String(r.source || '');
            inboundInspMap[k] = {
                inspDate: r.inspDate || '',
                fromInsp: /수입검사/.test(src) || !!r.inspDate
            };
        });
        return {
            inspDateMap: inspDateMap,
            inboundInspMap: inboundInspMap,
            materials: Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []
        };
    }

    function _hasLinkedIncomingInspection(d, ctx) {
        if (!d) return false;
        if (d.inspId) return true;
        if (d.inspDate) return true;
        if (/수입검사/.test(String(d.source || ''))) return true;
        const part = String(d.partName || '').trim();
        const lotNo = String(d.lotNo || '').trim();
        if (!part || !lotNo) return false;
        const key = part + '||' + lotNo;
        if (ctx.inspDateMap[key]) return true;
        const inbound = ctx.inboundInspMap[key];
        return !!(inbound && (inbound.fromInsp || inbound.inspDate));
    }

    /** 수입검사 없이 창고 직접 입고된 건 = 프로세스 위반 */
    function _isDirectInboundWithoutInsp(d, ctx) {
        // 수입검사 누락으로 잡아내려는 대상은 "실제 외부/공급자 입고"입니다.
        // 재고 정합을 위한 "보정/리셋/실사 반영" 기록까지 포함되면 누락 탐지가 오탐이 됩니다.
        if (!d || d.type !== '입고') return false;
        if (_isStockErrorResetRecord(d)) return false;
        const src = String(d.source || '');
        // 재고 정합/실사 보정/일괄 보정 계열은 "수입검사 누락"이 아니라 "정정 이력"이므로 제외
        if (/재고 수정 보정|일괄 현재고 보정/.test(src)) return false;
        if (/실사 보정/.test(src)) return false;
        if (!_isIncomingInspectionTarget(d, ctx)) return false;
        if (_hasLinkedIncomingInspection(d, ctx)) return false;
        return true;
    }

    /** 재고 오류 초기화 기록은 프로세스 위반 집계에서 제외 */
    // (재고 쪽 오류는 자재 창고 화면 몫이라 여기서는 src가 '수입검사'로 시작하는 것만 다룬다)
    function _injLotFormatErrors() {
        try {
            if (typeof SettingsModule === 'undefined' || !SettingsModule.scanInjLotErrorsData) return [];
            return SettingsModule.scanInjLotErrorsData().filter(function(e) {
                return String(e.src || '').indexOf('수입검사') === 0;
            });
        } catch (e) { return []; }
    }

    function _lotErrorBannerHtml() {
        const errors = _injLotFormatErrors();
        if (!errors.length) return '';
        const preview = errors.slice(0, 5);
        return `
            <div style="border:1px solid #ef4444;border-radius:8px;background:rgba(239,68,68,0.05);margin-bottom:10px;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                    <span class="material-symbols-outlined" style="color:#dc2626;font-size:16px;flex-shrink:0;">barcode_scanner</span>
                    <span style="font-weight:700;color:#dc2626;font-size:0.78rem;">사출 LOT 번호 형식 오류</span>
                    <span style="background:#dc2626;color:#fff;border-radius:10px;padding:0 7px;font-size:0.68rem;font-weight:700;">${errors.length}건</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">LOT이 비어 있거나 형식이 잘못된 채로 등록된 수입검사 기록입니다.</span>
                </div>
                <table class="data-table" style="font-size:0.75rem;margin:0;">
                    <tbody>
                        ${preview.map(function(e) {
                            return `<tr>
                                <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${(e.date || '-').split(' ')[0]}</td>
                                <td style="padding:4px 8px;font-weight:600;">${e.partName || '-'}</td>
                                <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${e.src || ''}</td>
                                <td style="padding:4px 8px;font-family:monospace;color:#dc2626;">${e.original || '(없음)'}</td>
                                <td style="padding:4px 8px;text-align:center;">
                                    <button type="button" class="btn btn-sm btn-outline"
                                        onclick="App.goToLotErrorSource('${String(e.src || '').replace(/'/g, "\\'")}','${String(e.id || '').replace(/'/g, "\\'")}')"
                                        style="font-size:0.68rem;padding:1px 8px;border-color:#ef4444;color:#dc2626;">수정</button>
                                </td>
                            </tr>`;
                        }).join('')}
                        ${errors.length > preview.length ? `
                        <tr><td colspan="5" style="text-align:center;padding:5px;font-size:0.7rem;color:var(--text-muted);">외 ${errors.length - preview.length}건</td></tr>` : ''}
                    </tbody>
                </table>
            </div>`;
    }

    function renderProcessViolationWarning() {
        const el = document.getElementById('incomingHubProcessWarning');
        if (!el) return;

        const lotErrorBanner = _lotErrorBannerHtml();
        const violations = _collectProcessViolations();
        const totalQty = violations.reduce(function(s, d) { return s + (Number(d.quantity) || 0); }, 0);
        const preview = violations.slice(0, 5);
        const fifoCount = (_inj && _inj.fifoCount) || 0;
        const monitorFrom = _getEffectiveViolationCutover();
        const cutoverNote = `<span style="color:var(--text-muted);font-weight:600;"> · ${ _esc(monitorFrom) } 이전 직접입고 이력 미표시</span>`;
        const adminBtns = _isAdminUser()
            ? `<button type="button" class="btn btn-sm btn-outline"
                    onclick="IncomingOverviewModule.openViolationCutoverModal()"
                    style="font-size:0.7rem;padding:2px 8px;border-color:#94a3b8;color:#475569;white-space:nowrap;"
                    title="MES 도입 초기 이력 제외 시점 설정">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">history_toggle_off</span>
                    이력 초기화
               </button>`
            : '';

        const standingNotice = `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;
                border-radius:${violations.length ? '8px 8px 0 0' : '8px'};
                border:1px solid #f59e0b;background:rgba(245,158,11,0.06);">
                <span class="material-symbols-outlined" style="color:#d97706;font-size:16px;flex-shrink:0;margin-top:1px;">gavel</span>
                <div style="min-width:0;line-height:1.35;flex:1;">
                    <div style="font-weight:700;color:#b45309;font-size:0.78rem;">프로세스 규칙 — 수입검사 필수</div>
                    <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">
                        수입검사 없는 직접 입고는 <strong style="color:#dc2626;">프로세스 위반</strong>입니다.
                        <span style="color:var(--text-muted);">(사내 사출품·과거 이력 제외, 당일부터 모니터)</span>
                        ${violations.length ? `<span style="color:#dc2626;font-weight:700;"> · 직접 입고(미검사) ${violations.length}건</span>` : ''}
                        ${fifoCount > 0 ? `<span style="color:#ea580c;font-weight:600;"> · 선입선출 위반 ${fifoCount}건</span>` : ''}
                        ${cutoverNote}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                ${adminBtns}
                ${fifoCount > 0 ? `<button type="button" class="btn btn-sm btn-outline"
                    onclick="IncomingOverviewModule.showInjFifo()"
                    style="font-size:0.7rem;padding:2px 8px;border-color:#fb923c;color:#ea580c;white-space:nowrap;">FIFO 목록</button>` : ''}
                </div>
            </div>`;

        if (!violations.length) {
            el.innerHTML = lotErrorBanner + standingNotice;
            return;
        }

        function fmtDate(raw) {
            const sp = String(raw || '').split(' ');
            const pp = (sp[0] || '').split('-');
            const tt = sp[1] ? sp[1].slice(0, 5) : '';
            if (pp.length !== 3) return raw ? String(raw) : '-';
            return '<span style="font-size:0.62rem;color:var(--text-muted);display:block;line-height:1;">' + pp[0] + '</span>' +
                '<span style="font-weight:600;font-size:0.75rem;white-space:nowrap;">' + pp[1] + '-' + pp[2] + '</span>' +
                (tt ? '<span style="font-size:0.62rem;color:var(--text-muted);display:block;line-height:1.3;">' + tt + '</span>' : '');
        }

        el.innerHTML = lotErrorBanner + `
            <div style="border:1px solid #f59e0b;border-radius:8px;overflow:hidden;background:#fff;">
                ${standingNotice}
                <div style="background:rgba(220,38,38,0.04);border-top:1px solid #fde68a;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:6px;font-size:0.74rem;">
                        <span class="material-symbols-outlined" style="color:#dc2626;font-size:15px;">warning</span>
                        <span style="font-weight:700;color:#dc2626;">직접 입고(미검사)</span>
                        <span style="background:#dc2626;color:#fff;border-radius:10px;padding:0 7px;font-size:0.68rem;font-weight:700;">${violations.length}건</span>
                        <span style="color:var(--text-muted);font-size:0.7rem;">${UIUtils.formatNumber(totalQty)} EA</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm btn-outline"
                        onclick="IncomingOverviewModule.goWarehouseIncomingHistory()"
                        style="font-size:0.7rem;padding:2px 8px;border-color:#f59e0b;color:#b45309;">
                        입고이력
                    </button>
                    ${adminBtns}
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" style="font-size:0.75rem;margin:0;">
                        <thead>
                            <tr>
                                <th style="padding:5px 8px;font-size:0.7rem;">입고일</th>
                                <th style="padding:5px 8px;font-size:0.7rem;">차종</th>
                                <th style="padding:5px 8px;font-size:0.7rem;">품명</th>
                                <th style="padding:5px 8px;font-size:0.7rem;">LOT</th>
                                <th style="padding:5px 8px;font-size:0.7rem;text-align:right;">수량</th>
                                <th style="padding:5px 8px;font-size:0.7rem;text-align:center;">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${preview.map(function(d) {
                                return `<tr style="background:rgba(245,158,11,0.03);">
                                    <td style="padding:4px 8px;line-height:1.25;white-space:nowrap;">${fmtDate(d.date)}</td>
                                    <td style="padding:4px 8px;">${d.carModel || '-'}</td>
                                    <td style="padding:4px 8px;"><strong>${d.partName || '-'}</strong></td>
                                    <td style="padding:4px 8px;font-family:monospace;font-weight:700;">${d.lotNo || '-'}</td>
                                    <td style="padding:4px 8px;text-align:right;font-weight:700;color:#dc2626;">${UIUtils.formatNumber(d.quantity)}</td>
                                    <td style="padding:4px 8px;text-align:center;">
                                        <button type="button" class="btn btn-sm btn-outline"
                                            onclick="InjectionWarehouseModule.openIncomingTxView('${d.id}')"
                                            style="font-size:0.68rem;padding:1px 6px;">보기</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                            ${violations.length > preview.length ? `
                            <tr>
                                <td colspan="6" style="text-align:center;padding:6px;font-size:0.7rem;color:var(--text-muted);">
                                    외 ${violations.length - preview.length}건 — 입고이력에서 확인
                                </td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function goWarehouseIncomingHistory() {
        Router.navigate('injection-warehouse');
        setTimeout(function() {
            if (typeof InjectionWarehouseModule !== 'undefined' && InjectionWarehouseModule._switchTab) {
                InjectionWarehouseModule._switchTab('incoming');
            }
        }, 120);
    }

    /* ── 홈 카드 ── */
    function _homeCard(title, desc, icon, countText, onClick, tone) {
        const COLORS = {
            blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6',
            orange: '#f97316', red: '#ef4444', cyan: '#06b6d4'
        };
        const border = COLORS[tone] || '#3b82f6';
        return `
            <button type="button" onclick="${onClick}"
                onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(15,23,42,.10)'"
                onmouseleave="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(15,23,42,.06)'"
                style="text-align:left;border:1px solid var(--border-color);border-top:3px solid ${border};
                       background:#fff;border-radius:14px;padding:20px;
                       box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer;transition:all .15s;
                       display:flex;flex-direction:column;gap:14px;min-height:140px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <span class="material-symbols-outlined"
                        style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;
                               background:${border}18;color:${border};font-size:22px;">${icon}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:700;">${countText}</span>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${title}</div>
                    <div style="font-size:.84rem;line-height:1.5;color:var(--text-muted);">${desc}</div>
                </div>
            </button>`;
    }

    /* ── 지표 카드 ── */
    function _metricCard(tone, value, label, subLabel) {
        return `
            <div class="stat-card ${tone}">
                <div class="stat-card-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>`;
    }

    function _clickMetricCard(tone, value, label, subLabel, clickable, onclickFn) {
        if (!clickable) return _metricCard(tone, value, label, subLabel);
        return `
            <div class="stat-card ${tone}" onclick="${onclickFn}" style="cursor:pointer;"
                title="클릭하여 상세 보기"
                onmouseenter="this.style.filter='brightness(0.97)'"
                onmouseleave="this.style.filter=''">
                <div class="stat-card-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>`;
    }

    /* ── 클릭 가능 stat ── */
    function _sc(label, value, unit, colorClass, clickable, onclickFn) {
        const attrs = clickable
            ? `onclick="${onclickFn}" style="cursor:pointer;position:relative;"
               onmouseenter="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='1')"
               onmouseleave="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='0')"`
            : 'style="position:relative;"';
        const hint = clickable ? `<div class="hint" style="opacity:0;transition:opacity 0.2s;position:absolute;
                bottom:8px;right:10px;font-size:0.68rem;color:var(--text-muted);display:flex;align-items:center;gap:2px;">
                <span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span>상세보기</div>` : '';
        return `<div class="stat-card ${colorClass}" ${attrs}>${hint}
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${unit ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${unit}</div>` : ''}
            </div>`;
    }

    /* ── 뱃지 ── */
    function _buildBadges(s) {
        const b = [];
        if (s.certPending > 0) b.push(`성적서 미접수 ${s.certPending}건`);
        if (s.fifoCount   > 0) b.push(`FIFO위반 ${s.fifoCount}건`);
        if (s.failCount   > 0) b.push(`불합격 ${s.failCount}건`);
        return b;
    }
    function _buildPaintBadges(s) {
        const b = [];
        if (s.certPending   > 0) b.push(`성적서 미접수 ${s.certPending}건`);
        if (s.expiredCount  > 0) b.push(`유효기간 만료 ${s.expiredCount}건`);
        if (s.expiringCount > 0) b.push(`유효기간 임박 ${s.expiringCount}건`);
        if (s.failCount     > 0) b.push(`불합격 ${s.failCount}건`);
        return b;
    }

    /* ── 사출 FIFO 위반 분석 (사출 입고 화면과 동일 기준) ── */
    function _analyzeInjFifoViolations(data) {
        const fifoViolations = new Set();
        const fifoViolationLots = {};
        const fifoPriorMaxLot = {};
        const sorted = (data || []).slice().sort(function (a, b) {
            return String(a.date || '').localeCompare(String(b.date || ''));
        });
        const maxLotByPart = {};
        sorted.forEach(function (r) {
            const key = (r.carModel || '') + '|' + (r.partName || '');
            const lots = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const lotNos = lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean);
            const badLots = maxLotByPart[key]
                ? lotNos.filter(function (ln) { return ln < maxLotByPart[key]; })
                : [];
            if (badLots.length) {
                fifoViolations.add(r.id);
                fifoViolationLots[r.id] = badLots;
                fifoPriorMaxLot[r.id] = maxLotByPart[key];
            }
            const maxLot = lotNos.slice().sort().pop();
            if (maxLot && (!maxLotByPart[key] || maxLot > maxLotByPart[key])) {
                maxLotByPart[key] = maxLot;
            }
        });
        return { fifoViolations: fifoViolations, fifoViolationLots: fifoViolationLots, fifoPriorMaxLot: fifoPriorMaxLot };
    }

    function _fifoReasonHtml(badLots, priorMax) {
        if (!badLots || !badLots.length) {
            return '<span style="color:var(--text-muted);">-</span>';
        }
        const prior = _esc(priorMax || '-');
        const lots = badLots.map(function (ln) { return _esc(ln); }).join(', ');
        return '<span style="font-size:0.76rem;line-height:1.45;color:#9a3412;">' +
            '이전 검사 기준 최대 LOT <strong style="color:#ea580c;">' + prior + '</strong>보다 ' +
            '이른 LOT <strong style="color:#ea580c;">' + lots + '</strong>를 나중에 검사함' +
            '</span>';
    }

    /* ── 사출 통계 ── */
    function _calcInjStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const data = all.filter(d => (d.date || '').startsWith(monthStr));
        const fifoAnalysis = _analyzeInjFifoViolations(data);
        const fifoViolations = fifoAnalysis.fifoViolations;
        const certPending = data.filter(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived||false }] : []);
            return lots.length > 0 && !lots.some(l => l.certReceived);
        });
        const failItems = data.filter(d => (Number(d.failQty)||0) > 0);
        const fifoItems = data.filter(d => fifoViolations.has(d.id));
        return {
            count: data.length,
            totalQty: data.reduce((s,d) => s+(Number(d.incomingQty)||0), 0),
            passCount: data.filter(d => (Number(d.failQty)||0) === 0).length,
            failCount: failItems.length,
            certPending: certPending.length,
            fifoCount: fifoItems.length,
            data, failItems, certPendingItems: certPending, fifoItems, fifoAnalysis,
        };
    }

    /* ── 도료 통계 ── */
    function _calcPaintStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const data = all.filter(d => (d.date||'').startsWith(monthStr));
        const today = new Date(); today.setHours(0,0,0,0);
        const expiredItems = [], expiringItems = [];
        data.forEach(d => {
            if (!d.expDate) return;
            const exp  = new Date(d.expDate); exp.setHours(0,0,0,0);
            const diff = Math.round((exp - today) / 86400000);
            if (diff < 0)        expiredItems.push(d);
            else if (diff <= 30) expiringItems.push({ ...d, _daysLeft: diff });
        });
        const failItems   = data.filter(d => d.verdict === '불합격');
        const certPending = data.filter(d => {
            if (typeof PaintIncomingInspectionModule !== 'undefined' && PaintIncomingInspectionModule.isCertPendingRecord) {
                return PaintIncomingInspectionModule.isCertPendingRecord(d);
            }
            return d.certCheck !== '접수완료' && d.certCheck !== '대상외';
        });
        return {
            count: data.length,
            totalQty: data.reduce((s,d) => s+(Number(d.incomingQty)||0), 0),
            failCount: failItems.length,
            certPending: certPending.length,
            expiredCount: expiredItems.length,
            expiringCount: expiringItems.length,
            failItems, certPendingItems: certPending, expiredItems, expiringItems,
        };
    }

    /* ── 상세 모달 ── */
    function showInjFail() {
        if (!_inj || !_inj.failItems.length) return;
        const rows = _inj.failItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.carModel||'-'}</td><td>${d.partName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
            <td style="text-align:right;color:var(--accent-red);font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
            <td>${d.supplierName||'-'}</td></tr>`).join('');
        UIUtils.showModal('사출 수입검사 — 불합격 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>불합격수량</th><th>사출처</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showInjCert() {
        if (!_inj || !_inj.certPendingItems.length) return;
        const rows = _inj.certPendingItems.map(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived||false }] : []);
            const pendingLots = lots.map(l => l.lotNo||'-').join(', ');
            return `<tr><td>${d.date||'-'}</td><td>${d.carModel||'-'}</td><td>${d.partName||'-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                <td style="font-family:monospace;color:#dc2626;font-weight:700;">${pendingLots}</td>
                <td>${d.supplierName||'-'}</td></tr>`;
        }).join('');
        UIUtils.showModal('사출 수입검사 — 성적서 미접수 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>미접수 LOT</th><th>사출처</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showInjFifo() {
        if (!_inj || !_inj.fifoItems.length) return;
        const analysis = _inj.fifoAnalysis || _analyzeInjFifoViolations(_inj.data);
        const rows = _inj.fifoItems.map(function (d) {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo }] : []);
            const badLots = analysis.fifoViolationLots[d.id] || [];
            const badSet = {};
            badLots.forEach(function (ln) { badSet[ln] = true; });
            const lotHtml = lots.map(function (l) {
                const ln = l.lotNo || '-';
                if (badSet[ln]) {
                    return '<span style="font-family:monospace;color:#ea580c;font-weight:800;background:#fff7ed;' +
                        'border:1px solid #fdba74;border-radius:4px;padding:0 4px;margin:0 2px 2px 0;">' +
                        _esc(ln) + '</span>';
                }
                return '<span style="font-family:monospace;margin:0 2px 2px 0;">' + _esc(ln) + '</span>';
            }).join('');
            const reasonHtml = _fifoReasonHtml(badLots, analysis.fifoPriorMaxLot[d.id]);
            const idEsc = _esc(d.id);
            return '<tr style="background:rgba(234,88,12,0.03);">' +
                '<td style="white-space:nowrap;font-size:0.8rem;">' + _esc(d.date || '-') + '</td>' +
                '<td>' + _esc(d.carModel || '-') + '</td>' +
                '<td><strong>' + _esc(d.partName || '-') + '</strong></td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(d.incomingQty) + '</td>' +
                '<td style="min-width:120px;">' + (lotHtml || '-') + '</td>' +
                '<td style="min-width:220px;max-width:300px;">' + reasonHtml + '</td>' +
                '<td style="min-width:180px;">' +
                    '<input type="text" class="form-input" value="' + _esc(d.fifoMeasure || '') + '"' +
                    ' placeholder="조치 내용 입력 (예: 긴급 출하 승인)"' +
                    ' style="font-size:0.76rem;padding:4px 6px;width:100%;"' +
                    ' onchange="IncomingOverviewModule.saveFifoMeasure(\'' + idEsc + '\', this.value)">' +
                '</td>' +
                '<td style="white-space:nowrap;text-align:center;">' +
                    '<button type="button" class="btn btn-sm btn-outline"' +
                    ' onclick="InjectionIncomingModule.view(\'' + idEsc + '\')">보기</button>' +
                '</td>' +
                '</tr>';
        }).join('');
        UIUtils.showModal('사출 수입검사 — FIFO 위반 목록',
            '<div style="padding:10px 12px;margin-bottom:10px;background:#fff7ed;border:1px solid #fdba74;' +
                'border-radius:8px;font-size:0.78rem;line-height:1.5;color:#9a3412;">' +
                '<strong>선입선출(FIFO) 위반 기준</strong><br>' +
                '같은 차종·품명에서 이미 더 큰(최신) LOT를 검사한 뒤, ' +
                '그보다 이른 LOT를 나중에 검사하면 위반입니다. ' +
                '주황색 LOT가 위반 LOT입니다.' +
            '</div>' +
            '<div class="data-table-wrapper" style="max-height:480px;overflow:auto;">' +
            '<table class="data-table" style="font-size:0.8rem;">' +
            '<thead><tr>' +
                '<th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th>' +
                '<th>LOT</th><th>위반 사유</th><th>조치 내용</th><th>작업</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'min(1100px, calc(100vw - 32px))');
    }

    async function saveFifoMeasure(id, measure) {
        const trimmed = String(measure || '').trim();
        if (typeof InjectionIncomingModule !== 'undefined' && InjectionIncomingModule.saveFifoMeasure) {
            await InjectionIncomingModule.saveFifoMeasure(id, trimmed);
        } else {
            const record = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, id);
            if (!record) {
                UIUtils.toast('기록을 찾을 수 없습니다.', 'error');
                return;
            }
            try {
                await Storage.update(DB.STORES.INJECTION_INSPECTIONS, id, { fifoMeasure: trimmed });
                UIUtils.toast('조치 내용이 저장되었습니다.', 'success');
            } catch (e) {
                UIUtils.toast('저장 실패: ' + e.message, 'error');
                return;
            }
        }
        if (_inj) {
            (_inj.fifoItems || []).forEach(function (item) {
                if (item.id === id) item.fifoMeasure = trimmed;
            });
            (_inj.data || []).forEach(function (item) {
                if (item.id === id) item.fifoMeasure = trimmed;
            });
        }
    }
    function showPaintFail() {
        if (!_paint || !_paint.failItems.length) return;
        const rows = _paint.failItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.lotNo||'-'}</td><td style="color:var(--accent-red);font-weight:700;">불합격</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 불합격 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>LOT</th><th>판정</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintCert() {
        if (!_paint || !_paint.certPendingItems.length) return;
        const rows = _paint.certPendingItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.lotNo||'-'}</td><td style="color:#dc2626;font-weight:700;">${d.certCheck||'접수대기'}</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 성적서 미접수 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>LOT</th><th>접수상태</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintExpiring() {
        if (!_paint || !_paint.expiringItems.length) return;
        const rows = _paint.expiringItems.sort((a,b)=>(a.expDate||'').localeCompare(b.expDate||'')).map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.expDate||'-'}</td><td style="color:var(--accent-orange,#f59e0b);font-weight:700;">${d._daysLeft}일 남음</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 임박', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>남은 기간</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintExpired() {
        if (!_paint || !_paint.expiredItems.length) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const rows = _paint.expiredItems.sort((a,b)=>(a.expDate||'').localeCompare(b.expDate||'')).map(d => {
            const diff = Math.abs(Math.round((new Date(d.expDate)-today)/86400000));
            return `<tr><td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                <td>${d.expDate||'-'}</td><td style="color:var(--accent-red);font-weight:700;">${diff}일 경과</td></tr>`;
        }).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 만료', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>경과</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    function openViolationCutoverModal() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 이력 초기화를 설정할 수 있습니다.', 'warning');
            return;
        }
        const all = _collectProcessViolationsRaw();
        const current = _violationCutover || '';
        const defaultDate = current || _todayCutover();
        const meta = _violationCutoverMeta || {};
        const appliedBy = meta.resetBy ? _esc(meta.resetBy) : '';
        const appliedAt = meta.resetAt ? _esc(String(meta.resetAt).slice(0, 16).replace('T', ' ')) : '';

        UIUtils.showModal(
            '직접 입고(미검사) 이력 초기화',
            '<div style="padding:10px 12px;margin-bottom:12px;background:rgba(59,130,246,0.06);' +
                'border:1px solid rgba(59,130,246,0.25);border-radius:8px;font-size:0.8rem;line-height:1.55;">' +
                'MES 도입 초기의 보정·오류 수정 등 <strong>과거 직접 입고 이력</strong>을 목록에서 제외합니다.<br>' +
                '<strong>창고 입고 원본 데이터는 삭제·변경되지 않습니다.</strong><br>' +
                '<span style="color:var(--text-muted);">기본값: 당일 이전 이력은 표시하지 않습니다.</span>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:10px;">' +
                '<label class="form-label">초기화 시점 <span style="color:var(--accent-red);">*</span></label>' +
                '<input type="date" class="form-input" id="ioViolationCutoverDate" value="' + _esc(defaultDate) + '"' +
                ' onchange="IncomingOverviewModule._previewViolationCutover()">' +
                '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">' +
                    '이 날짜 <strong>이전</strong> 입고 건은 직접 입고(미검사) 목록에서 숨깁니다.' +
                '</div>' +
            '</div>' +
            '<div id="ioViolationCutoverPreview" style="font-size:0.78rem;padding:8px 10px;background:var(--bg-secondary);' +
                'border-radius:6px;color:var(--text-secondary);"></div>' +
            (current
                ? '<div style="margin-top:10px;font-size:0.76rem;color:var(--text-muted);">' +
                    '현재 적용: <strong>' + _esc(current) + '</strong> 이전 제외' +
                    (appliedBy ? ' · ' + appliedBy : '') +
                    (appliedAt ? ' (' + appliedAt + ')' : '') +
                  '</div>'
                : '<div style="margin-top:10px;font-size:0.76rem;color:var(--text-muted);">' +
                    '현재: 기본 정책(<strong>' + _esc(_todayCutover()) + '</strong> 이전 미표시)' +
                  '</div>'),
            '<button type="button" class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            (current
                ? '<button type="button" class="btn btn-outline" style="color:#dc2626;border-color:#fca5a5;"' +
                    ' onclick="IncomingOverviewModule.clearViolationCutover()">기본값 복원</button>'
                : '') +
            '<button type="button" class="btn btn-primary" onclick="IncomingOverviewModule.saveViolationCutover()">적용</button>',
            '520px'
        );
        _previewViolationCutover(all.length);
    }

    function _previewViolationCutover(totalRaw) {
        const el = document.getElementById('ioViolationCutoverDate');
        const preview = document.getElementById('ioViolationCutoverPreview');
        if (!preview) return;
        const day = _cutoverDay(el && el.value);
        const raw = _collectProcessViolationsRaw();
        const total = typeof totalRaw === 'number' ? totalRaw : raw.length;
        if (!day) {
            preview.textContent = '날짜를 선택하면 제외 건수를 미리 볼 수 있습니다.';
            return;
        }
        const excluded = raw.filter(function (d) { return _cutoverDay(d.date) < day; }).length;
        const remain = raw.filter(function (d) { return _cutoverDay(d.date) >= day; }).length;
        preview.innerHTML = '<strong>' + _esc(day) + '</strong> 이전 <strong style="color:#dc2626;">' +
            excluded.toLocaleString('ko-KR') + '건</strong> 제외 · 이후 표시 <strong style="color:#2563eb;">' +
            remain.toLocaleString('ko-KR') + '건</strong> (전체 ' + total.toLocaleString('ko-KR') + '건)';
    }

    async function saveViolationCutover() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 이력 초기화를 설정할 수 있습니다.', 'warning');
            return;
        }
        const el = document.getElementById('ioViolationCutoverDate');
        const day = _cutoverDay(el && el.value);
        if (!day) {
            UIUtils.toast('초기화 시점 날짜를 선택하세요.', 'warning');
            return;
        }
        const raw = _collectProcessViolationsRaw();
        const excluded = raw.filter(function (d) { return _cutoverDay(d.date) < day; }).length;
        const remain = raw.length - excluded;

        UIUtils.confirm(
            day + ' 이전 직접 입고(미검사) ' + excluded.toLocaleString('ko-KR') + '건을 목록에서 제외합니다.\n' +
            '이후 표시: ' + remain.toLocaleString('ko-KR') + '건\n\n' +
            '창고 입고 원본 데이터는 변경되지 않습니다. 적용하시겠습니까?',
            async function () {
                const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
                    ? AuthModule.getCurrentUser() : null;
                const payload = {
                    cutoverDate: day,
                    resetAt: new Date().toISOString(),
                    resetBy: (user && (user.displayName || user.username)) || ''
                };
                try {
                    await Storage.setConfigValue(VIOLATION_CUTOVER_KEY, payload);
                    _violationCutover = day;
                    _violationCutoverMeta = payload;
                    _violationCutoverLoaded = true;
                    UIUtils.closeModal();
                    UIUtils.toast('초기화 시점 ' + day + ' 적용 완료', 'success');
                    renderProcessViolationWarning();
                } catch (e) {
                    UIUtils.toast('저장 실패: ' + (e && e.message ? e.message : e), 'error');
                }
            }
        );
    }

    async function clearViolationCutover() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 초기화를 해제할 수 있습니다.', 'warning');
            return;
        }
        UIUtils.confirm(
            '직접 입고(미검사) 모니터 시작일을 기본값(당일)으로 되돌리시겠습니까?\n과거 입고 이력은 계속 표시하지 않습니다.',
            async function () {
                try {
                    await Storage.setConfigValue(VIOLATION_CUTOVER_KEY, null);
                    _violationCutover = '';
                    _violationCutoverMeta = null;
                    _violationCutoverLoaded = true;
                    UIUtils.closeModal();
                    UIUtils.toast('모니터 시작일이 기본값(당일)으로 복원되었습니다.', 'success');
                    renderProcessViolationWarning();
                } catch (e) {
                    UIUtils.toast('해제 실패: ' + (e && e.message ? e.message : e), 'error');
                }
            }
        );
    }

    return {
        init, render,
        showInjFail, showInjCert, showInjFifo, saveFifoMeasure,
        showPaintFail, showPaintCert, showPaintExpiring, showPaintExpired,
        goWarehouseIncomingHistory,
        openViolationCutoverModal, saveViolationCutover, clearViolationCutover,
        _previewViolationCutover,
    };
})();

/* ══════════════════════════════════════════════════════════════
   수입검사 이력변경 관리 (삭제 감사 로그)
══════════════════════════════════════════════════════════════ */
var IncomingDeleteLogModule = (function () {
    const LOG_STORE = DB.STORES.INSPECTION_DELETE_LOGS;

    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('incoming-delete-log')}
            <div class="card">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-red);">manage_history</span>
                        <strong>수입검사 이력변경 관리</strong>
                        <span style="font-size:0.8rem;color:var(--text-muted);">삭제된 검사 기록의 감사 로그입니다.</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <select class="form-select" id="delLogTypeFilter" style="min-width:120px;">
                            <option value="">전체 유형</option>
                            <option value="injection">사출 수입검사</option>
                            <option value="paint">도료 수입검사</option>
                            <option value="laser_work">레이저 작업(검사대기)</option>
                        </select>
                        <button class="btn btn-outline" onclick="IncomingDeleteLogModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>삭제 일시</th>
                                    <th>유형</th>
                                    <th>원본 요약</th>
                                    <th>삭제자</th>
                                    <th>삭제 사유</th>
                                    <th>원본 보기</th>
                                </tr>
                            </thead>
                            <tbody id="delLogTableBody">
                                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">로딩 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        search();
    }

    function search() {
        const typeFilter = (document.getElementById('delLogTypeFilter') || {}).value || '';
        let logs = (Storage.getAll(LOG_STORE) || [])
            .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
        if (typeFilter) logs = logs.filter(l => l.type === typeFilter);

        const tbody = document.getElementById('delLogTableBody');
        if (!tbody) return;
        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">삭제 이력이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = logs.map(l => {
            const deletedAt = l.deletedAt ? l.deletedAt.replace('T', ' ').slice(0, 19) : '-';
            const typeLabel = l.typeLabel || (l.type === 'injection' ? '사출 수입검사' : l.type === 'laser_work' ? '레이저 작업(검사대기)' : '도료 수입검사');
            const typeBadge = l.type === 'injection'
                ? `<span style="background:#dbeafe;color:#2563eb;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:700;">사출</span>`
                : l.type === 'laser_work'
                ? `<span style="background:#fee2e2;color:#dc2626;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:700;">레이저</span>`
                : `<span style="background:#ede9fe;color:#7c3aed;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:700;">도료</span>`;
            return `<tr>
                <td style="font-size:0.82rem;color:var(--text-muted);">${deletedAt}</td>
                <td>${typeBadge}</td>
                <td style="font-size:0.85rem;">${l.summary || '-'}</td>
                <td style="font-size:0.85rem;">${l.deletedBy || '-'}</td>
                <td style="font-size:0.85rem;color:var(--accent-red);">${l.reason || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="IncomingDeleteLogModule.viewOriginal('${l.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">open_in_new</span> 원본
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function viewOriginal(logId) {
        const log = Storage.getById(LOG_STORE, logId);
        if (!log) return;
        const d = log.originalData || {};
        const typeLabel = log.typeLabel || (log.type === 'injection' ? '사출 수입검사' : log.type === 'laser_work' ? '레이저 작업(검사대기)' : '도료 수입검사');
        const deletedAt = log.deletedAt ? log.deletedAt.replace('T', ' ').slice(0, 19) : '-';

        const row = (label, value) =>
            `<div style="display:flex;gap:0;border-bottom:1px solid var(--border);">
                <div style="width:140px;flex-shrink:0;padding:7px 12px;background:var(--bg-secondary);font-size:0.8rem;font-weight:600;color:var(--text-muted);">${label}</div>
                <div style="flex:1;padding:7px 14px;font-size:0.85rem;">${value !== undefined && value !== null && value !== '' ? value : '-'}</div>
            </div>`;

        const fields = log.type === 'injection' ? [
            row('검사일자', d.date), row('검사자', d.inspector), row('차종', d.carModel),
            row('품명', d.partName), row('컬러', d.color), row('사출처', d.supplierName),
            row('입고수량', UIUtils.formatNumber(d.incomingQty) + ' EA'),
            row('검사수량', UIUtils.formatNumber(d.inspectionQty)),
            row('합격수량', UIUtils.formatNumber(d.passQty)),
            row('불합격수량', UIUtils.formatNumber(d.failQty)),
            row('합격 판정', d.verdict), row('비고', d.note),
        ] : log.type === 'laser_work' ? [
            row('작업일자', d.date), row('시작시간', d.startTime), row('종료시간', d.endTime),
            row('장비', d.machine),
            row('작업자', [d.worker1, d.worker2, d.worker3].filter(Boolean).join(', ')),
            row('차종', d.carModel), row('품명', d.partName), row('컬러', d.color),
            row('작업수량', UIUtils.formatNumber(d.quantity) + ' EA'),
            row('도장/사출 LOT', d.paintLot), row('비고', d.note),
        ] : [
            row('검사일자', d.date), row('검사자', d.inspector), row('구매처', d.supplier),
            row('도료품명', d.paintName), row('제조사 표기 LOT', d.lotNo),
            row('제조일자', d.mfgDate), row('유효기간', d.expDate),
            row('입고수량', UIUtils.formatNumber(d.incomingQty)),
            row('용기 상태', d.containerStatus), row('유효기간 확인', d.expDateCheck),
            row('성적서 접수', d.certCheck), row('최종 판정', d.verdict), row('비고', d.note),
        ];

        UIUtils.showModal(`원본 데이터 — ${typeLabel}`, `
            <div style="padding:4px 0 12px;display:flex;gap:16px;font-size:0.82rem;color:var(--text-muted);">
                <span><strong>삭제 일시:</strong> ${deletedAt}</span>
                <span><strong>삭제자:</strong> ${log.deletedBy || '-'}</span>
                <span><strong>사유:</strong> <span style="color:var(--accent-red);">${log.reason || '-'}</span></span>
            </div>
            <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                ${fields.join('')}
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            '600px'
        );
    }

    return { init, render, search, viewOriginal };
})();
