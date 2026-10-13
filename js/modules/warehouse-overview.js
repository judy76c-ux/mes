/**
 * 자재창고 공통 네비게이션
 */
var WarehouseNavUI = (function () {
    const MENUS = [
        { id: 'warehouse-overview',  label: '자재 현황',  icon: 'warehouse',               subtitle: '통합 현황·문제점', accent: '#2563eb' },
        { id: 'injection-warehouse', label: '사출 자재',  icon: 'precision_manufacturing', subtitle: '사출 자재 관리',   accent: '#0891b2' },
        { id: 'paint-inventory',     label: '도료 자재',  icon: 'palette',                 subtitle: '도료 재고 관리',   accent: '#8b5cf6' }
    ];
    function renderSection(activePage, actionsHtml) {
        var items = MENUS.map(function (m) {
            return { label: m.label, icon: m.icon, subtitle: m.subtitle, accent: m.accent,
                     active: m.id === activePage, onClick: "Router.navigate('" + m.id + "')" };
        });
        return '<div class="mes-apple-menu-hero"' + (actionsHtml ? ' style="margin-bottom:8px;"' : '') + '>' +
            ProdAppleMenu.strip(items) +
        '</div>' +
        (actionsHtml ? '<div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px;">' + actionsHtml + '</div>' : '');
    }
    return { renderSection };
})();

/**
 * 자재창고 허브 (사출 자재 + 도료 자재 통합 현황)
 */
var WarehouseOverviewModule = (function () {

    const LONG_STOCK_DAYS = 90; // 장기재고 기준일

    // FIFO 위반 "확인 처리" — 확인된 건은 이슈/대시보드에서 빠지고, 품질·생산 관리자에게 쪽지로 통보된다.
    const FIFO_ACK_DOC = 'fifo_violation_ack';
    const FIFO_NOTIFY_ROLES = ['quality_manager', 'prod_manager'];
    const FIFO_ACK_REASONS = {
        inj: ['실물 확인 완료 — 구 LOT부터 사용 조치', '실물 없음 — 재고 실사로 정리', '사출처 납품 순서 역전 — 사출처 시정 요청', '긴급 생산 등 불가피한 사유', '기타'],
        paint: ['실물 확인 완료 — 구 LOT부터 사용 조치', '실물 없음 — 재고 실사로 정리', '도료사 납품 순서 역전 — 도료사 시정 요청', '긴급 생산 등 불가피한 사유', '기타']
    };

    let _inj   = null; // 사출 창고 계산 결과
    let _paint = null; // 도료 창고 계산 결과
    let _container = null; // 마지막 렌더 컨테이너 (확인 처리 후 재렌더용)
    let _ackDraft = null;  // 확인 처리 중인 위반 { kind, key }
    const _esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /** FIFO 판정용 — LOT는 YYMMDD(6자리 유효 날짜)만 인정. __nolot__, DEV-LOT 등은 제외 */
    function _isYymmddLot(lotNo) {
        const s = String(lotNo || '').trim();
        if (!/^\d{6}$/.test(s)) return false;
        const yy = parseInt(s.slice(0, 2), 10);
        const mm = parseInt(s.slice(2, 4), 10);
        const dd = parseInt(s.slice(4, 6), 10);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
        const year = 2000 + yy;
        const d = new Date(year, mm - 1, dd);
        return d.getFullYear() === year && d.getMonth() === mm - 1 && d.getDate() === dd;
    }

    /** 도료 LOT 집계 키 — 제조 LOT(prodLot) 우선, 없으면 제조사 표기 LOT(lotNo) */
    function _paintLotKey(r) {
        return String((r && (r.prodLot || r.lotNo)) || '').trim() || '__nolot__';
    }

    /** 화면 표시용 LOT — 내부 센티널(__nolot__ 등)은 무표기로 */
    function _formatLotDisplay(lot) {
        const s = String(lot || '').trim();
        if (!s || s === '__nolot__' || s === '__') return '무표기';
        return s;
    }

    function _findProductForItem(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.find(p => p.carModel === carModel && p.partName === partName && (!color || !p.color || p.color === color))
            || products.find(p => p.carModel === carModel && p.partName === partName);
    }

    function _normItemType(raw) {
        if (!raw) return '';
        return String(raw).replace(/품$/, '').trim();
    }

    /** 도금 품 — 재고 없음 집계에서 제외 */
    function _isPlatingItem(carModel, partName, color) {
        const colorText = String(color || '').trim();
        if (/(crom|chrom|chrome|도금)/i.test(colorText)) return true;
        const prod = _findProductForItem(carModel, partName, color);
        if (!prod) return false;
        for (let i = 1; i <= 4; i++) {
            if (/도금/i.test(String(prod['process' + i] || ''))) return true;
        }
        return /(crom|chrom|chrome|도금)/i.test(String(prod.color || '').trim());
    }

    /** A/S 품 — 재고 없음 집계에서 제외 */
    function _isAsItem(carModel, partName, color) {
        const prod = _findProductForItem(carModel, partName, color);
        if (!prod) return false;
        const t = _normItemType(prod.itemType);
        return t === 'A/S' || /^A\/?S/i.test(t);
    }

    function _isExcludedFromZeroStock(carModel, partName, color) {
        return _isPlatingItem(carModel, partName, color) || _isAsItem(carModel, partName, color);
    }

    function init() {}

    // ── 대시보드 헬퍼 ────────────────────────────────────────────────────
    function _kpi(icon, color, bgColor, label, value, sub) {
        return '<div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
                '<span class="material-symbols-outlined" style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:' + bgColor + ';color:' + color + ';font-size:19px;">' + icon + '</span>' +
                '<span style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">' + label + '</span>' +
            '</div>' +
            '<div style="font-size:1.5rem;font-weight:800;color:var(--text-primary);line-height:1.2;">' + value + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">' + sub + '</div>' +
        '</div>';
    }

    function _statRow(label, value, tone, clickable, fn) {
        var colorMap = { blue:'#2563eb', purple:'#8b5cf6', red:'#ef4444', orange:'#f59e0b', ok:'#10b981' };
        var valColor = colorMap[tone] || 'var(--text-primary)';
        var rowAttr = clickable
            ? 'onclick="' + fn + '" style="cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'"'
            : '';
        return '<tr ' + rowAttr + '>' +
            '<td style="padding:9px 14px;font-size:0.83rem;color:var(--text-secondary);border-bottom:1px solid #f1f5f9;">' + label + '</td>' +
            '<td style="padding:9px 14px;text-align:right;font-size:0.9rem;font-weight:800;color:' + valColor + ';border-bottom:1px solid #f1f5f9;white-space:nowrap;">' +
                value + (clickable ? '<span class="material-symbols-outlined" style="font-size:13px;margin-left:3px;vertical-align:middle;">chevron_right</span>' : '') +
            '</td>' +
        '</tr>';
    }

    function _issueCard(sev, icon, label, desc, fn) {
        var C = sev === 'critical'
            ? { bg:'#fef2f2', border:'#ef4444', ic:'#ef4444', txt:'#b91c1c' }
            : { bg:'#fffbeb', border:'#f59e0b', ic:'#d97706', txt:'#92400e' };
        return '<div onclick="' + fn + '" ' +
            'onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'" ' +
            'style="padding:9px 12px;border-radius:10px;background:' + C.bg + ';border-left:3px solid ' + C.border + ';' +
                   'display:flex;align-items:center;gap:10px;cursor:pointer;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:' + C.ic + ';flex-shrink:0;">' + icon + '</span>' +
            '<div style="flex:1;">' +
                '<div style="font-size:0.82rem;font-weight:800;color:' + C.txt + ';">' + label + '</div>' +
                '<div style="font-size:0.73rem;color:var(--text-muted);">' + desc + '</div>' +
            '</div>' +
            '<span class="material-symbols-outlined" style="font-size:15px;color:' + C.ic + ';">chevron_right</span>' +
        '</div>';
    }

    function render(container) {
        _container = container;
        _inj   = _calcInjStats();
        _paint = _calcPaintStats();

        // ── 문제점 이슈 목록 수집 ─────────────────────────────────────────
        var issues = [];
        if (_paint.expiredCount  > 0) issues.push({ sev:'critical', icon:'event_busy',    label:'도료 유효기간 만료', desc: _paint.expiredCount + '건 즉시 조치 필요',    fn:'WarehouseOverviewModule.showPaintExpired()' });
        if (_inj.fifoCount       > 0) issues.push({ sev:'critical', icon:'swap_vert',     label:'사출 FIFO 위반',    desc: _inj.fifoCount + '건 선입선출 위반',           fn:'WarehouseOverviewModule.showInjFifo()' });
        if (_paint.fifoCount     > 0) issues.push({ sev:'critical', icon:'swap_vert',     label:'도료 FIFO 위반',    desc: _paint.fifoCount + '건 선입선출 위반',          fn:'WarehouseOverviewModule.showPaintFifo()' });
        if (_inj.longStock       > 0) issues.push({ sev:'critical', icon:'schedule',      label:'사출 장기재고',      desc: _inj.longStock + '건 ' + LONG_STOCK_DAYS + '일 이상 보관', fn:'WarehouseOverviewModule.showInjLong()' });
        if (_inj.zeroStock       > 0) issues.push({ sev:'warning',  icon:'inventory',     label:'사출 재고 없음',     desc: _inj.zeroStock + '종 재고 부족',               fn:'WarehouseOverviewModule.showInjZero()' });
        if (_inj.multiLot        > 0) issues.push({ sev:'warning',  icon:'layers',        label:'사출 다층 LOT',      desc: _inj.multiLot + '품목 (LOT 4개 이상)',          fn:'WarehouseOverviewModule.showInjMultiLot()' });
        if (_paint.longStock     > 0) issues.push({ sev:'warning',  icon:'schedule',      label:'도료 장기재고',      desc: _paint.longStock + '건 ' + LONG_STOCK_DAYS + '일 이상',  fn:'WarehouseOverviewModule.showPaintLong()' });
        if (_paint.expiringCount > 0) issues.push({ sev:'warning',  icon:'event_available',label:'도료 유효기간 임박', desc: _paint.expiringCount + '건 30일 이내 만료',    fn:'WarehouseOverviewModule.showPaintExpiring()' });

        var criticalCount = issues.filter(function(i){ return i.sev === 'critical'; }).length;
        var warningCount  = issues.filter(function(i){ return i.sev === 'warning';  }).length;

        var _okBox = function(text) {
            return '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.82rem;">' +
                '<span class="material-symbols-outlined" style="font-size:20px;color:#10b981;vertical-align:middle;margin-right:4px;">check_circle</span>' +
                text + '</div>';
        };
        var _issueListHtml = function(sev, emptyText) {
            var list = issues.filter(function(i){ return i.sev === sev; });
            return list.length
                ? list.map(function(iss){ return _issueCard(iss.sev, iss.icon, iss.label, iss.desc, iss.fn); }).join('')
                : _okBox(emptyText);
        };
        var criticalHtml = _issueListHtml('critical', '긴급 이슈 없음');
        var warningHtml  = _issueListHtml('warning',  '주의 이슈 없음');
        var _issuePanel = function(title, icon, color, count, bodyHtml) {
            return '<div class="card" style="height:100%;">' +
                '<div class="card-header">' +
                    '<h4 style="margin:0;display:flex;align-items:center;gap:6px;font-size:0.92rem;">' +
                        '<span class="material-symbols-outlined" style="font-size:18px;color:' + color + ';">' + icon + '</span>' +
                        title +
                        (count ? '<span style="background:' + color + ';color:#fff;border-radius:999px;font-size:0.68rem;font-weight:800;padding:2px 7px;margin-left:4px;">' + count + '</span>' : '') +
                    '</h4>' +
                '</div>' +
                '<div class="card-body" style="display:flex;flex-direction:column;gap:7px;">' + bodyHtml + '</div>' +
            '</div>';
        };

        container.innerHTML =
            '<div class="fade-in-up">' +
                WarehouseNavUI.renderSection('warehouse-overview') +

                // ── KPI ──────────────────────────────────────────────────
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">' +
                    _kpi('precision_manufacturing','#2563eb','#eff6ff','사출 재고 품목', _inj.itemCount + '종', '총 ' + UIUtils.formatNumber(_inj.totalStock) + ' EA') +
                    _kpi('palette','#8b5cf6','#f5f3ff','도료 재고 품목', _paint.itemCount + '종', '총 ' + UIUtils.formatNumber(_paint.totalStock)) +
                    _kpi('warning',
                        criticalCount > 0 ? '#ef4444' : '#10b981',
                        criticalCount > 0 ? '#fef2f2' : '#f0fdf4',
                        '긴급 이슈', criticalCount + '건', '즉시 조치 필요') +
                    _kpi('report_problem',
                        warningCount > 0 ? '#f59e0b' : '#10b981',
                        warningCount > 0 ? '#fffbeb' : '#f0fdf4',
                        '주의 이슈', warningCount + '건', '모니터링 필요') +
                '</div>' +

                // ── 메인: KPI와 같은 4열 격자 (이슈는 해당 KPI 카드 바로 아래) ──
                '<div class="wh-overview-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:start;">' +

                    // 1~2열: 창고 현황
                    '<div style="grid-column:span 2;display:flex;flex-direction:column;gap:14px;min-width:0;">' +

                        // 사출 창고
                        '<div class="card">' +
                            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
                                '<h4 style="margin:0;display:flex;align-items:center;gap:6px;">' +
                                    '<span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;">precision_manufacturing</span>사출 자재 창고' +
                                '</h4>' +
                                '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'injection-warehouse\')">자세히 보기</button>' +
                            '</div>' +
                            '<div class="card-body" style="padding:0;">' +
                                '<table style="width:100%;border-collapse:collapse;"><tbody>' +
                                    _statRow('재고 품목',  _inj.itemCount + '종',                        'blue',   false) +
                                    _statRow('총 재고량',  UIUtils.formatNumber(_inj.totalStock) + ' EA','blue',   false) +
                                    _statRow('재고 없음',  _inj.zeroStock + '종',  _inj.zeroStock  > 0 ? 'orange':'ok', _inj.zeroStock  > 0, 'WarehouseOverviewModule.showInjZero()') +
                                    _statRow('장기재고',   _inj.longStock + '종',  _inj.longStock  > 0 ? 'red'   :'ok', _inj.longStock  > 0, 'WarehouseOverviewModule.showInjLong()') +
                                    _statRow('FIFO 위반' + _fifoAckedLabel(_inj),  _inj.fifoCount + '건',  _inj.fifoCount  > 0 ? 'red'   :'ok', _inj.fifoCount > 0 || _inj.fifoHistory.length > 0, 'WarehouseOverviewModule.showInjFifo()') +
                                    _statRow('다층 LOT',   _inj.multiLot + '품목', _inj.multiLot   > 0 ? 'orange':'ok', _inj.multiLot   > 0, 'WarehouseOverviewModule.showInjMultiLot()') +
                                '</tbody></table>' +
                            '</div>' +
                        '</div>' +

                        // 도료 창고
                        '<div class="card">' +
                            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
                                '<h4 style="margin:0;display:flex;align-items:center;gap:6px;">' +
                                    '<span class="material-symbols-outlined" style="font-size:18px;color:#8b5cf6;">palette</span>도료 자재 창고' +
                                '</h4>' +
                                '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'paint-inventory\')">자세히 보기</button>' +
                            '</div>' +
                            '<div class="card-body" style="padding:0;">' +
                                '<table style="width:100%;border-collapse:collapse;"><tbody>' +
                                    _statRow('재고 품목',     _paint.itemCount + '종',                            'purple', false) +
                                    _statRow('총 재고량',     UIUtils.formatNumber(_paint.totalStock) + ' L/kg',  'purple', false) +
                                    _statRow('유효기간 만료', _paint.expiredCount  + '건', _paint.expiredCount  > 0 ? 'red'   :'ok', _paint.expiredCount  > 0, 'WarehouseOverviewModule.showPaintExpired()') +
                                    _statRow('유효기간 임박', _paint.expiringCount + '건', _paint.expiringCount > 0 ? 'orange':'ok', _paint.expiringCount > 0, 'WarehouseOverviewModule.showPaintExpiring()') +
                                    _statRow('장기재고',      _paint.longStock + '건',     _paint.longStock     > 0 ? 'red'   :'ok', _paint.longStock     > 0, 'WarehouseOverviewModule.showPaintLong()') +
                                    _statRow('FIFO 위반' + _fifoAckedLabel(_paint),     _paint.fifoCount + '품목',   _paint.fifoCount     > 0 ? 'red'   :'ok', _paint.fifoCount > 0 || _paint.fifoHistory.length > 0, 'WarehouseOverviewModule.showPaintFifo()') +
                                '</tbody></table>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // 3열: 긴급 이슈 (FIFO 위반 · 유효기간 만료 · 장기재고)
                    '<div style="min-width:0;">' +
                        _issuePanel('긴급 이슈', 'warning', '#ef4444', criticalCount, criticalHtml) +
                    '</div>' +

                    // 4열: 주의 이슈 (재고 없음 · 다층 LOT 등)
                    '<div style="min-width:0;">' +
                        _issuePanel('주의 이슈', 'report_problem', '#f59e0b', warningCount, warningHtml) +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    /* ==============================================================
       사출 창고 통계 계산
       - 품목별 LOT 단위 재고 추적
    ============================================================== */
    function _calcInjStats() {
        const all   = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // 품목(carModel||partName||color) × LOT 별 재고 계산
        // ※ 레코드에 lots[] 배열이 있으면 LOT별로 분리 처리 (단일 레코드 다중 LOT 지원)
        const itemMap = {}; // key → { [lot]: { qty, firstDate, hadIncoming } }
        all.forEach(r => {
            const key = (r.carModel || '') + '||' + (r.partName || '') + '||' + (r.color || '');
            if (!itemMap[key]) itemMap[key] = {};

            // lots 배열이 있으면 LOT별로 분리, 없으면 단일 lotNo + quantity 폴백
            const entries = (r.lots && r.lots.length > 0)
                ? r.lots.map(l => ({ lot: l.lotNo || '__nolot__', qty: Number(l.qty) || 0 }))
                : [{ lot: r.lotNo || '__nolot__', qty: Number(r.quantity) || 0 }];

            // 현재고 확정(기준재고)·미차감 처리 기록은 입출고 이력이 아니므로 LOT 이력 집계에서 제외
            // (잔량은 아래에서 InvCalc 원장 재생 결과로 덮어쓴다)
            if (InvCalc.isStockBaseline(r) || r.unmatchedAction === 'clear' || r.unmatchedAction === 'absorb') return;

            entries.forEach(({ lot, qty }) => {
                if (!itemMap[key][lot]) {
                    itemMap[key][lot] = { qty: 0, firstDate: '', hadIncoming: false,
                                          inQty: 0, outQty: 0, firstOutDate: '', lastOutDate: '',
                                          outs: [], supplier: '' };
                }
                const e = itemMap[key][lot];
                const d = r.date || '';
                if (r.type === '입고') {
                    e.qty += qty;
                    e.inQty += qty;
                    e.hadIncoming = true;
                    // 입고 기록에서만 firstDate 추적 (가장 오래된 입고일)
                    if (d && (!e.firstDate || d < e.firstDate)) e.firstDate = d;
                    const sup = String(r.supplier || '').trim();
                    if (sup && sup !== '-' && !e.supplier) e.supplier = sup;
                } else {
                    e.qty -= qty;
                    e.outQty += qty;
                    if (d) e.outs.push({ d: d, qty: qty });
                    if (d && (!e.firstOutDate || d < e.firstOutDate)) e.firstOutDate = d;
                    if (d && (!e.lastOutDate || d > e.lastOutDate)) e.lastOutDate = d;
                }
            });
        });

        // LOT 잔량은 사출 창고 상세("현재 보관 LOT")와 같은 원장 엔진(InvCalc)으로 덮어쓴다.
        // 단순 입고−출고 합산은 LOT 번호가 맞지 않는 출고(미매칭 → 오래된 LOT부터 FIFO 차감)를
        // 반영하지 못해, 이미 소진된 구 LOT이 남아 있는 것으로 보여 FIFO 위반이 허위로 잡혔다.
        const recsByKey = {};
        all.forEach(r => {
            const key = (r.carModel || '') + '||' + (r.partName || '') + '||' + (r.color || '');
            (recsByKey[key] = recsByKey[key] || []).push(r);
        });
        Object.keys(itemMap).forEach(key => {
            const bal = InvCalc.lotBalances(_recordsAfterBaseline(recsByKey[key] || []));
            const byLot = {};
            bal.lots.forEach(l => { byLot[l.lotNo === '무표기' ? '__nolot__' : l.lotNo] = l; });
            Object.keys(itemMap[key]).forEach(lot => {
                itemMap[key][lot].qty = byLot[lot] ? byLot[lot].qty : 0;
                itemMap[key][lot].balDate = byLot[lot] ? String(byLot[lot].date || '') : '';
            });
            Object.keys(byLot).forEach(lot => {
                if (itemMap[key][lot]) return;
                itemMap[key][lot] = { qty: byLot[lot].qty, balDate: String(byLot[lot].date || ''), firstDate: '', hadIncoming: false,
                                      inQty: 0, outQty: 0, firstOutDate: '', lastOutDate: '', outs: [], supplier: '' };
            });
        });

        let itemCount = 0, totalStock = 0, zeroStock = 0, longStock = 0, fifoCount = 0, multiLot = 0;
        const zeroItems = [], longItems = [], fifoItems = [], multiLotItems = [];

        Object.entries(itemMap).forEach(([key, lots]) => {
            const [carModel, partName, color] = key.split('||');
            const netQty = Object.values(lots).reduce((s, v) => s + v.qty, 0);

            if (netQty <= 0) {
                // 도금·A/S 품은 사출 재고 없음 집계에서 제외
                if (_isExcludedFromZeroStock(carModel, partName, color)) return;
                zeroStock++;
                zeroItems.push({ carModel, partName, color });
                return;
            }

            itemCount++;
            totalStock += netQty;

            const activeLots = Object.entries(lots)
                .filter(([, v]) => v.qty > 0)
                .sort(([, a], [, b]) => (a.firstDate || '').localeCompare(b.firstDate || ''));

            // 다층 LOT: 활성 LOT 4개 이상
            if (activeLots.length >= 4) {
                multiLot++;
                multiLotItems.push({ carModel, partName, color, lotCount: activeLots.length, qty: netQty });
            }

            // 장기재고: 가장 오래된 활성 LOT 입고일이 LONG_STOCK_DAYS 초과
            if (activeLots.length > 0) {
                const oldestDate = activeLots[0][1].firstDate;
                if (oldestDate) {
                    const diffDays = Math.round((today - new Date(oldestDate)) / 86400000);
                    if (diffDays >= LONG_STOCK_DAYS) {
                        longStock++;
                        longItems.push({ carModel, partName, color, days: diffDays, qty: netQty, firstDate: oldestDate });
                    }
                }
            }

            // FIFO 위반 (사출 LOT 일자 기준 — LOT 번호 YYMMDD = 사출 생산일)
            // 원장을 시간순으로 재생해, "생산 출고 시점에 그보다 사출일이 빠른 LOT이 창고에 남아 있었는지"로 판정한다.
            // - 재고 수정 보정/재고실사 보정 출고는 사용 실적이 아니므로 제외
            // - 반납·재입고로 구 LOT이 다시 들어온 경우, 들어오기 전 출고는 위반이 아님 (시점 기준)
            // - 최신 현재고 확정(실사) 이후 기록만 대상 — 실사로 정리된 과거 위반은 제외
            // - 지금도 창고에 남아 있는 구 LOT이 있는 위반만 표시 (이미 소진됐으면 해소된 것)
            const viol = _injFifoViolations(recsByKey[key] || []);
            const activeSet = {};
            activeLots.forEach(([lot]) => { activeSet[lot] = true; });
            const violNew = Object.keys(viol.found).filter(bLot => Object.keys(viol.found[bLot].olds).some(aLot => activeSet[aLot]));
            if (violNew.length) {
                const oldSet = {};
                violNew.forEach(bLot => Object.keys(viol.found[bLot].olds).forEach(aLot => { if (activeSet[aLot]) oldSet[aLot] = true; }));
                const oldList = Object.keys(oldSet).sort();
                const oldestV = lots[oldList[0]];
                fifoCount++;
                fifoItems.push({
                    carModel,
                    partName,
                    color,
                    qty: netQty,
                    oldestDate: oldestV.firstDate || oldestV.balDate || '',
                    oldLots: oldList.map(lot => {
                        const v = lots[lot];
                        return { lot, qty: v.qty, firstDate: v.firstDate || v.balDate || '', inQty: v.inQty,
                                 outQty: v.outQty, lastOutDate: v.lastOutDate };
                    }),
                    consumedLots: violNew.filter(bLot => !oldSet[bLot]).sort().map(bLot => {
                        const v = lots[bLot] || {};
                        const f = viol.found[bLot];
                        const blame = _fifoBlameFor(oldestV.firstDate || oldestV.balDate || '', Object.assign({}, v, { outs: [] }));
                        return Object.assign({ lot: bLot, firstDate: v.firstDate || v.balDate || '', inQty: v.inQty || 0,
                                               outQty: v.outQty || 0, firstOutDate: v.firstOutDate || '', lastOutDate: v.lastOutDate || '',
                                               supplier: v.supplier || '' },
                                             blame, { afterQty: f.afterQty, beforeQty: f.beforeQty || 0 });
                    }),
                    oldSupplier: oldestV.supplier || ''
                });
                fifoItems[fifoItems.length - 1].blame = _fifoBlameSummary(fifoItems[fifoItems.length - 1]);
            }
        });

        const fifo = _splitFifoAcks('inj', fifoItems);
        return { itemCount, totalStock, zeroStock, longStock, fifoCount: fifo.pending.length, multiLot,
                 zeroItems, longItems, fifoItems: fifo.pending, fifoAcked: fifo.acked, fifoHistory: fifo.history, multiLotItems };
    }

    /** 재고 수정 보정·재고실사 보정 출고 — 사용 실적이 아니라 수량 정정이므로 FIFO 판정에서 제외 */
    function _isAdjustmentOut(r) {
        return !!(r && (r.isStockCountAdjustment || /보정|실사/.test(String(r.source || ''))));
    }

    /**
     * 사출 FIFO 위반 판정 (원장 시간순 재생)
     * 생산 출고로 LOT B가 차감된 시점에, B보다 사출일(LOT YYMMDD)이 빠른 LOT A가 아직 남아 있으면 위반.
     * 반환: { found: { B: { afterQty, beforeQty, olds: {A: true} } } }
     */
    function _injFifoViolations(records) {
        const recs = _recordsAfterBaseline(records);
        const steps = InvCalc.replaySteps(recs);
        const found = {}, clean = {};
        steps.forEach((st, i) => {
            const r = st.rec;
            if (!r || r.type !== '출고' || !st.deductions || InvCalc.isStockBaseline(r) || r.unmatchedAction || _isAdjustmentOut(r)) return;
            const drained = st.deductions.filter(x => x.lotNo !== InvCalc.UNMATCHED && _isYymmddLot(x.lotNo) && x.qty > 0);
            if (!drained.length) return;
            const after = InvCalc.lotBalances(steps.slice(0, i + 1).map(x => x.rec)).lots;
            drained.forEach(dx => {
                const olds = after.filter(l => l.qty > 0 && _isYymmddLot(l.lotNo) && l.lotNo < dx.lotNo);
                if (!olds.length) { clean[dx.lotNo] = (clean[dx.lotNo] || 0) + dx.qty; return; }
                const f = found[dx.lotNo] = found[dx.lotNo] || { afterQty: 0, beforeQty: 0, olds: {} };
                f.afterQty += dx.qty;
                olds.forEach(o => { f.olds[o.lotNo] = true; });
            });
        });
        Object.keys(found).forEach(k => { found[k].beforeQty = clean[k] || 0; });
        return { found: found };
    }

    /** 최신 현재고 확정(기준재고) 이후 기록만 — 사출 창고 상세(_recordsForStockCalc)와 같은 기준 */
    function _recordsAfterBaseline(records) {
        const all = records || [];
        let baseline = null;
        all.forEach(r => {
            if (!InvCalc.isStockBaseline(r)) return;
            if (!baseline) { baseline = r; return; }
            const a = InvCalc.recordStamp(r), b = InvCalc.recordStamp(baseline);
            if (a > b || (a === b && String(r.createdAt || '') >= String(baseline.createdAt || ''))) baseline = r;
        });
        if (!baseline) return all.slice();
        const cut = InvCalc.recordStamp(baseline);
        const cutCreated = String(baseline.createdAt || '');
        const cutId = String(baseline.id || '');
        const after = all.filter(r => {
            if (!r || r === baseline || InvCalc.isStockBaseline(r)) return false;
            const st = InvCalc.recordStamp(r);
            if (st > cut) return true;
            if (st < cut) return false;
            const c = String(r.createdAt || '');
            if (cutCreated && c) { if (c > cutCreated) return true; if (c < cutCreated) return false; }
            return !!(cutId && r.id && String(r.id) > cutId);
        });
        return [baseline].concat(after);
    }

    /* ==============================================================
       FIFO 위반 확인 처리 — 저장소: PROD_CONDITIONS (_docKind = fifo_violation_ack)
       위반 식별키 = 구분 + 품목 + 남은 구 LOT 목록 + 먼저 소진된 신 LOT 목록.
       확인 후 새 LOT이 추가로 소진되면 키가 달라져 다시 위반으로 표시된다.
    ============================================================== */
    function _fifoKey(kind, d) {
        const id = kind === 'inj'
            ? [d.carModel, d.partName, d.color].join('||')
            : (d.materialId || d.matName || '');
        const olds = (d.oldLots || []).map(o => o.lot).sort().join(',');
        const news = (d.consumedLots || []).map(c => c.lot).sort().join(',');
        return kind + '::' + id + '::' + olds + '::' + news;
    }

    /** 확인 이력 전체(취소된 건 포함). activeOnly=true 면 유효한 확인만 */
    function _fifoAckRecords(activeOnly) {
        return (Storage.getAll(DB.STORES.PROD_CONDITIONS) || [])
            .filter(d => d && d._docKind === FIFO_ACK_DOC && (!activeOnly || !d.revokedAt));
    }

    function _splitFifoAcks(kind, items) {
        const byKey = {};
        _fifoAckRecords(true).forEach(a => {
            if (!byKey[a.key] || String(a.ackAt || '') > String(byKey[a.key].ackAt || '')) byKey[a.key] = a;
        });
        const pending = [], acked = [];
        items.forEach(d => {
            d.fifoKind = kind;
            d.fifoKey = _fifoKey(kind, d);
            const a = byKey[d.fifoKey];
            if (a) { d.ack = a; acked.push(d); } else { pending.push(d); }
        });
        const history = _fifoAckRecords().filter(a => a.kind === kind)
            .sort((a, b) => String(b.ackAt || '').localeCompare(String(a.ackAt || '')));
        return { pending: pending, acked: acked, history: history };
    }

    function _fifoAckedLabel(stats) {
        const n = (stats && stats.fifoHistory || []).length;
        return n ? ' <span style="font-size:0.68rem;color:#15803d;font-weight:700;">(확인 이력 ' + n + ')</span>' : '';
    }

    /* ==============================================================
       도료 창고 통계 계산
    ============================================================== */
    function _calcPaintStats() {
        const all       = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        const materials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const today     = new Date(); today.setHours(0, 0, 0, 0);

        // 재료별 LOT 단위 재고 계산 (키 = prodLot || lotNo, paint-inventory/warehouse-hub와 동일)
        const matMap = {}; // materialId → { [lot]: { qty, firstDate, expDate, mfgDate, prodLot, lotNo } }
        all.forEach(r => {
            const mid = r.materialId || '__noid__';
            const lot = _paintLotKey(r);
            if (!matMap[mid]) matMap[mid] = {};
            if (!matMap[mid][lot]) {
                matMap[mid][lot] = {
                    qty: 0,
                    firstDate: r.date || '',
                    expDate: r.expDate || '',
                    mfgDate: r.mfgDate || '',
                    prodLot: r.prodLot || '',
                    lotNo: r.lotNo || '',
                    firstInDate: '', hadIncoming: false,
                    inQty: 0, outQty: 0, firstOutDate: '', lastOutDate: '', outs: []
                };
            }
            const entry = matMap[mid][lot];
            if (r.prodLot && !entry.prodLot) entry.prodLot = r.prodLot;
            if (r.lotNo && !entry.lotNo) entry.lotNo = r.lotNo;
            if (r.mfgDate && (!entry.mfgDate || r.mfgDate < entry.mfgDate)) entry.mfgDate = r.mfgDate;
            const qty = Number(r.quantity) || 0;
            const d = r.date || '';
            if (r.type === '출고') {
                entry.qty -= qty;
                entry.outQty += qty;
                if (d) entry.outs.push({ d: d, qty: qty });
                if (d && (!entry.firstOutDate || d < entry.firstOutDate)) entry.firstOutDate = d;
                if (d && (!entry.lastOutDate || d > entry.lastOutDate)) entry.lastOutDate = d;
            } else {
                entry.qty += qty;
                entry.inQty += qty;
                entry.hadIncoming = true;
                if (!entry.firstDate || r.date < entry.firstDate)
                    entry.firstDate = r.date || '';
                if (d && (!entry.firstInDate || d < entry.firstInDate)) entry.firstInDate = d;
                if (r.expDate && (!entry.expDate || r.expDate < entry.expDate))
                    entry.expDate = r.expDate; // 가장 빠른 만료일 추적
            }
        });

        // LOT 수량은 도료 창고 상세와 같은 원장(InvCalc) 기준으로 덮어쓴다
        // (단순 입고−출고 합산은 보유분을 넘긴 출고까지 빼서 상세 화면과 어긋남)
        const paintBal = InvCalc.paintBalances(all);
        Object.keys(matMap).forEach(mid => {
            const bal = paintBal[mid];
            if (!bal) return;
            Object.keys(matMap[mid]).forEach(lot => {
                const key = lot === '__nolot__' ? '무표기' : lot;
                matMap[mid][lot].qty = bal.lots[key] || 0;
            });
        });

        // 도료 사용일 — 배합실 도료 사용 등록(paint_mix)의 LOT별 첫/최근 사용일
        const useMap = {}; // materialId → { prodLot: { first, last } }
        (Storage.getAll(DB.STORES.PROD_CONDITIONS) || []).forEach(m => {
            if (!m || m._docKind !== 'paint_mix') return;
            const day = String(m.date || '').slice(0, 10);
            if (!day) return;
            (m.usages || []).forEach(u => {
                if (!u || !u.materialId) return;
                const lot = String(u.prodLot || u.residualProdLot || u.warehouseProdLot || u.lotNo || '').trim();
                if (!lot) return;
                const byLot = useMap[u.materialId] = useMap[u.materialId] || {};
                const e = byLot[lot] = byLot[lot] || { first: '', last: '' };
                if (!e.first || day < e.first) e.first = day;
                if (!e.last || day > e.last) e.last = day;
            });
        });
        const _useOf = (mid, lot, v) => {
            const byLot = useMap[mid] || {};
            return byLot[v.prodLot || lot] || byLot[lot] || byLot[v.lotNo] || { first: '', last: '' };
        };

        let itemCount = 0, totalStock = 0, expiredCount = 0, expiringCount = 0, longStock = 0, fifoCount = 0;
        const expiredItems = [], expiringItems = [], longItems = [], fifoItems = [];

        Object.entries(matMap).forEach(([mid, lots]) => {
            const mat      = materials.find(m => m.id === mid);
            const matName  = mat ? (mat.name || '-') : '-';
            const supplier = mat ? (mat.supplier || '-') : '-';
            const netQty   = Object.values(lots).reduce((s, v) => s + v.qty, 0);

            if (netQty <= 0) return; // 재고 없는 자재는 제외

            itemCount++;
            totalStock += netQty;

            const activeLots = Object.entries(lots)
                .filter(([, v]) => v.qty > 0)
                .sort(([, a], [, b]) => (a.firstDate || '').localeCompare(b.firstDate || ''));

            activeLots.forEach(([lot, v]) => {
                const lotLabel = v.prodLot || v.lotNo || lot;
                // 유효기간 체크
                if (v.expDate) {
                    const exp  = new Date(v.expDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    if (diff < 0) {
                        expiredCount++;
                        expiredItems.push({ matName, supplier, lot: lotLabel, qty: v.qty, expDate: v.expDate,
                            daysPast: Math.abs(diff) });
                    } else if (diff <= 30) {
                        expiringCount++;
                        expiringItems.push({ matName, supplier, lot: lotLabel, qty: v.qty, expDate: v.expDate,
                            daysLeft: diff });
                    }
                }
                // 장기재고 체크
                if (v.firstDate) {
                    const diff = Math.round((today - new Date(v.firstDate)) / 86400000);
                    if (diff >= LONG_STOCK_DAYS) {
                        longStock++;
                        longItems.push({ matName, supplier, lot: lotLabel, qty: v.qty, firstDate: v.firstDate, days: diff });
                    }
                }
            });

            // FIFO 위반 (도료 제조일 기준 — 입고 순서가 아니라 제조일)
            // 제조일이 빠른 LOT의 재고가 남아 있는데, 제조일이 늦은 LOT이 먼저 모두 출고된 경우.
            // - 제조일: 입고 기록의 제조일, 없으면 제조 LOT(YYMMDD)에서 계산. 제조일을 모르는 LOT은 비교 제외
            // - 구 LOT이 창고에 입고된 뒤에 신 LOT이 출고됐을 때만 위반 (그 전엔 꺼낼 수 없었음)
            const _mfgOf = (lot, v) => String(v.mfgDate || '').slice(0, 10) || _lotProdDate(v.prodLot || lot);
            const fifoActiveLots = activeLots
                .map(([lot, v]) => [lot, v, _mfgOf(lot, v)])
                .filter(([, v, mfg]) => mfg && v.firstInDate)
                .sort((a, b) => a[2].localeCompare(b[2]));
            const consumedLots = Object.entries(lots)
                .map(([lot, v]) => [lot, v, _mfgOf(lot, v)])
                .filter(([, v, mfg]) => mfg && v.qty <= 0 && v.hadIncoming && v.firstInDate && v.lastOutDate);
            if (fifoActiveLots.length > 0 && consumedLots.length > 0) {
                const [, oldestV, oldestMfg] = fifoActiveLots[0];
                const newerConsumedLots = consumedLots
                    .filter(([, v, mfg]) => mfg > oldestMfg && v.lastOutDate >= oldestV.firstInDate)
                    .sort((a, b) => a[2].localeCompare(b[2]));
                if (newerConsumedLots.length && !fifoItems.find(f => f.matName === matName)) {
                    const maxMfg = newerConsumedLots[newerConsumedLots.length - 1][2];
                    const label = (lot, v) => v.prodLot || v.lotNo || lot;
                    fifoCount++;
                    fifoItems.push({
                        materialId: mid,
                        matName,
                        supplier,
                        qty: netQty,
                        oldestDate: oldestV.firstInDate,
                        // 위반 기준 구 LOT: 소진된 신 LOT보다 제조일이 빠른데 아직 남아 있는 LOT
                        oldLots: fifoActiveLots
                            .filter(([, , mfg]) => mfg < maxMfg)
                            .map(([lot, v, mfg]) => ({ lot: label(lot, v), prodDate: mfg, qty: v.qty, firstDate: v.firstInDate,
                                                       inQty: v.inQty, outQty: v.outQty, lastOutDate: v.lastOutDate,
                                                       useFirst: _useOf(mid, lot, v).first, useLast: _useOf(mid, lot, v).last })),
                        consumedLots: newerConsumedLots.map(([lot, v, mfg]) => Object.assign({ lot: label(lot, v), prodDate: mfg, firstDate: v.firstInDate,
                                                       inQty: v.inQty, outQty: v.outQty, firstOutDate: v.firstOutDate, lastOutDate: v.lastOutDate,
                                                       useFirst: _useOf(mid, lot, v).first, useLast: _useOf(mid, lot, v).last, supplier: supplier },
                                                       _fifoBlameFor(oldestV.firstInDate, v))),
                        oldSupplier: supplier
                    });
                    fifoItems[fifoItems.length - 1].blame = _fifoBlameSummary(fifoItems[fifoItems.length - 1]);
                }
            }
        });

        const fifo = _splitFifoAcks('paint', fifoItems);
        return { itemCount, totalStock, expiredCount, expiringCount, longStock, fifoCount: fifo.pending.length,
                 expiredItems, expiringItems, longItems, fifoItems: fifo.pending, fifoAcked: fifo.acked, fifoHistory: fifo.history };
    }

    /* ==============================================================
       세부 정보 모달
    ============================================================== */

    /* 사출 — 재고 없음 */
    function showInjZero() {
        if (!_inj || !_inj.zeroItems.length) return;
        const rows = _inj.zeroItems.map(d => `
            <tr>
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.color || '-'}</td>
                <td style="color:var(--accent-red);font-weight:700;">재고 없음</td>
            </tr>`).join('');
        UIUtils.showModal('사출 자재 창고 — 재고 없음 목록 (' + _inj.zeroItems.length + '종)', `
            <table class="data-table">
                <thead><tr><th>차종</th><th>품명</th><th>컬러</th><th>상태</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 사출 — 장기재고 */
    function showInjLong() {
        if (!_inj || !_inj.longItems.length) return;
        const rows = _inj.longItems
            .sort((a, b) => b.days - a.days)
            .map(d => `
                <tr style="background:rgba(220,38,38,0.03);">
                    <td>${d.carModel || '-'}</td>
                    <td>${d.partName || '-'}</td>
                    <td>${d.color || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)} EA</td>
                    <td>${d.firstDate || '-'}</td>
                    <td style="color:var(--accent-red);font-weight:700;">${d.days}일</td>
                </tr>`).join('');
        UIUtils.showModal('사출 자재 창고 — 장기재고 목록 (기준: ' + LONG_STOCK_DAYS + '일 이상)', `
            <table class="data-table">
                <thead><tr><th>차종</th><th>품명</th><th>컬러</th><th>재고</th><th>최초 입고일</th><th>보관 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    function _shortDate(v) {
        const s = String(v || '').trim();
        if (!s) return '-';
        // YYYY-MM-DD HH:mm → MM-DD HH:mm
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const d = s.slice(5, 10);
            const t = s.length >= 16 ? s.slice(11, 16) : '';
            return t ? (d + ' ' + t) : d;
        }
        return s;
    }

    /* ── FIFO 귀책(원인) 판정 ─────────────────────────────────────
     * 구 LOT(제조일/사출일 빠름) A가 남아 있는데 신 LOT B가 먼저 소진된 경우,
     *  - A가 창고에 입고되기 전에 나간 B 수량  → 불가피 (A가 아직 없었음)
     *  - A가 입고된 뒤에 나간 B 수량          → 당사 선입선출 미준수
     *  - B가 A보다 먼저 납품(입고)됨           → 공급처(사출처/도료사) 납품 순서 역전
     *    (제조일이 늦은 LOT을 먼저 보내 현장이 FIFO를 지킬 수 없는 상황을 만든 것)
     */
    function _fifoBlameFor(oldInDate, v) {
        const aIn = String(oldInDate || '');
        let beforeQty = 0, afterQty = 0;
        (v.outs || []).forEach(function(o) {
            if (aIn && o.d < aIn) beforeQty += Number(o.qty) || 0;
            else afterQty += Number(o.qty) || 0;
        });
        const bIn = String(v.firstDate || v.firstInDate || '');
        const aDay = aIn.slice(0, 10), bDay = bIn.slice(0, 10);
        const inverted = !!(aDay && bDay && bDay < aDay);     // 신 LOT이 먼저 납품됨
        const sameDelivery = !!(aDay && bDay && bDay === aDay); // 같은 날 함께 납품
        return { beforeQty: beforeQty, afterQty: afterQty, inverted: inverted, sameDelivery: sameDelivery, oldInDate: aIn };
    }

    function _fifoBlameSummary(item) {
        const cons = item.consumedLots || [];
        const oursQty = cons.reduce(function(s, c) { return s + (c.afterQty || 0); }, 0);
        const unavoidableQty = cons.reduce(function(s, c) { return s + (c.beforeQty || 0); }, 0);
        const supplierLots = cons.filter(function(c) { return c.inverted; });
        const suppliers = [];
        supplierLots.forEach(function(c) { const n = c.supplier || item.oldSupplier || ''; if (n && suppliers.indexOf(n) < 0) suppliers.push(n); });
        return { ours: oursQty > 0, oursQty: oursQty, unavoidableQty: unavoidableQty,
                 supplier: supplierLots.length > 0, supplierLotCount: supplierLots.length, suppliers: suppliers };
    }

    function _fifoBlameBadges(item, partyLabel) {
        const b = item.blame || {};
        const badge = function(text, fg, bg, bd) {
            return '<span style="font-size:0.72rem;font-weight:800;color:' + fg + ';background:' + bg + ';border:1px solid ' + bd + ';border-radius:999px;padding:2px 8px;white-space:nowrap;">' + text + '</span>';
        };
        const out = [];
        if (b.supplier) out.push(badge(partyLabel + ' 귀책' + (b.suppliers && b.suppliers.length ? ' (' + _esc(b.suppliers.join(', ')) + ')' : ''), '#7c3aed', 'rgba(124,58,237,0.1)', 'rgba(124,58,237,0.35)'));
        if (b.ours) out.push(badge('당사 귀책', '#dc2626', 'rgba(220,38,38,0.08)', 'rgba(220,38,38,0.35)'));
        if (!out.length) out.push(badge('불가피 (구 LOT 미입고)', '#64748b', 'rgba(100,116,139,0.1)', 'rgba(100,116,139,0.35)'));
        return out.join(' ');
    }

    function _fifoCauseCell(c, un, partyLabel) {
        const parts = [];
        if (c.inverted) {
            parts.push('<span style="color:#7c3aed;font-weight:700;">' + partyLabel + ' 납품 역전</span>');
        } else if (c.sameDelivery) {
            parts.push('<span style="color:#b45309;font-weight:700;">동시 납품</span>');
        }
        if (c.beforeQty) parts.push('<span style="color:#64748b;">불가피 ' + UIUtils.formatNumber(c.beforeQty) + un + '</span>');
        if (c.afterQty) parts.push('<span style="color:#dc2626;font-weight:700;">당사 미준수 ' + UIUtils.formatNumber(c.afterQty) + un + '</span>');
        return parts.join('<br>') || '-';
    }

    /** 원인 규명 문장 — 신 LOT별로 언제 들어와 언제 나갔고, 그때 구 LOT이 창고에 있었는지 */
    function _fifoCauseText(item, dateLabel, unit, partyLabel) {
        const dl = dateLabel || '사출일';
        const un = unit || 'EA';
        const old = (item.oldLots || [])[0] || {};
        const oldIn = String(old.firstDate || '').slice(0, 10);
        const lines = (item.consumedLots || []).map(function(c) {
            const lot = '<strong style="font-family:monospace;color:#ea580c;">' + _esc(_formatLotDisplay(c.lot)) + '</strong>';
            const bIn = String(c.firstDate || '').slice(0, 10);
            let t = lot + ' (' + dl + ' ' + _esc(c.prodDate || _lotProdDate(c.lot)) + ', 입고 ' + _esc(bIn) + '): ';
            if (c.inverted) {
                t += '<span style="color:#7c3aed;font-weight:700;">' + partyLabel + (c.supplier ? '(' + _esc(c.supplier) + ')' : '') +
                     '가 ' + dl + '이 늦은 이 LOT을 구 LOT(' + _esc(oldIn) + ' 입고)보다 먼저 납품</span>. ';
            } else if (c.sameDelivery) {
                t += '구 LOT과 같은 날 함께 납품 — 창고에서 ' + dl + '을 확인해 구 LOT부터 냈어야 함. ';
            } else {
                t += '구 LOT이 먼저(' + _esc(oldIn) + ') 입고돼 있었음. ';
            }
            if (c.beforeQty) t += '구 LOT 입고 전 출고 <strong>' + UIUtils.formatNumber(c.beforeQty) + un + '</strong>는 당시 구 LOT이 없어 <strong>불가피</strong>. ';
            if (c.afterQty) t += '<span style="color:#dc2626;">구 LOT이 창고에 있는데 출고한 <strong>' + UIUtils.formatNumber(c.afterQty) + un + '</strong>는 <strong>당사 선입선출 미준수</strong></span>.';
            return '<li style="margin:2px 0;">' + t + '</li>';
        }).join('');
        return '<ul style="margin:4px 0 0 18px;padding:0;">' + lines + '</ul>';
    }

    /* 사출 — FIFO 위반 */
    /** 사출 LOT(YYMMDD) → 사출일 YYYY-MM-DD */
    function _lotProdDate(lot) {
        const m = String(lot || '').trim().match(/^(\d{2})(\d{2})(\d{2})$/);
        return m ? ('20' + m[1] + '-' + m[2] + '-' + m[3]) : '';
    }

    function _fifoDate(v) {
        const t = String(v || '').trim();
        return t ? _esc(t.slice(0, 16)) : '<span style="color:var(--text-muted);">-</span>';
    }

    function _fifoUseRange(l) {
        const a = l.useFirst || '', b = l.useLast || '';
        if (!a && !b) return '<span style="color:var(--text-muted);">사용 기록 없음</span>';
        return a === b ? _esc(a) : (_esc(a) + ' ~ ' + _esc(b));
    }

    function _fifoLotTable(lots, type, dateLabel, showUse, causeOpts) {
        const isOld = type === 'old';
        const color = isOld ? '#2563eb' : '#ea580c';
        const dl = dateLabel || '사출일';
        const useHead = showUse ? '<th>사용일(첫~최근)</th>' : '';
        const head = isOld
            ? '<th>LOT</th><th>' + dl + '</th><th>창고 입고일</th><th style="text-align:right;">입고수량</th><th style="text-align:right;">출고수량</th><th>최근 출고일</th>' + useHead + '<th style="text-align:right;">잔량</th>'
            : '<th>LOT</th><th>' + dl + '</th><th>창고 입고일</th><th style="text-align:right;">입고수량</th><th>첫 출고일</th><th>소진일(마지막 출고)</th>' + useHead +
              (causeOpts ? '<th>원인</th>' : '');
        const body = (lots || []).map(function(l) {
            const lotCell = '<td style="font-family:monospace;font-weight:700;color:' + color + ';">' + _esc(_formatLotDisplay(l.lot)) + '</td>' +
                '<td style="font-weight:700;">' + _fifoDate(l.prodDate || _lotProdDate(l.lot)) + '</td>';
            if (isOld) {
                return '<tr>' + lotCell +
                    '<td>' + _fifoDate(l.firstDate) + '</td>' +
                    '<td style="text-align:right;">' + UIUtils.formatNumber(l.inQty || 0) + '</td>' +
                    '<td style="text-align:right;">' + UIUtils.formatNumber(l.outQty || 0) + '</td>' +
                    '<td>' + _fifoDate(l.lastOutDate) + '</td>' +
                    (showUse ? '<td style="white-space:nowrap;">' + _fifoUseRange(l) + '</td>' : '') +
                    '<td style="text-align:right;font-weight:700;color:#2563eb;">' + UIUtils.formatNumber(l.qty || 0) + '</td></tr>';
            }
            return '<tr>' + lotCell +
                '<td>' + _fifoDate(l.firstDate) + '</td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(l.inQty || 0) + '</td>' +
                '<td>' + _fifoDate(l.firstOutDate) + '</td>' +
                '<td style="font-weight:700;color:#ea580c;">' + _fifoDate(l.lastOutDate) + '</td>' +
                (showUse ? '<td style="white-space:nowrap;">' + _fifoUseRange(l) + '</td>' : '') +
                (causeOpts ? '<td style="white-space:nowrap;font-size:0.74rem;line-height:1.35;">' + _fifoCauseCell(l, causeOpts.unit, causeOpts.party) + '</td>' : '') + '</tr>';
        }).join('');
        return '<table class="data-table compact" style="width:100%;font-size:0.78rem;border-collapse:collapse;">' +
            '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
    }

    /** 위반 내용 문장 — 가장 오래 남은 구 LOT과, 그보다 늦게 들어와 먼저 소진된 신 LOT을 비교 */
    function _fifoViolationText(d, dateLabel, unit) {
        const dl = dateLabel || '사출일';
        const un = unit || 'EA';
        const old = (d.oldLots || [])[0];
        const cons = d.consumedLots || [];
        if (!old || !cons.length) return '';
        const first = cons[0];
        const lastOut = cons.map(function(c) { return c.lastOutDate || ''; }).sort().pop();
        return dl + ' <strong>' + _esc(old.prodDate || _lotProdDate(old.lot)) + '</strong>인 ' +
            '<strong style="color:#2563eb;font-family:monospace;">' + _esc(_formatLotDisplay(old.lot)) + '</strong>' +
            ' LOT이 <strong>' + UIUtils.formatNumber(old.qty) + ' ' + un + '</strong> 남아 있는데, ' + dl + '이 더 늦은 ' +
            '<strong style="color:#ea580c;font-family:monospace;">' + _esc(_formatLotDisplay(first.lot)) + '</strong>' +
            (cons.length > 1 ? ' 등 <strong>' + cons.length + '개 LOT</strong>이' : ' LOT이') +
            ' 먼저 모두 출고됐습니다' + (lastOut ? ' (마지막 소진 ' + _esc(lastOut.slice(0, 10)) + ')' : '') + '. ' +
            '<span style="color:var(--text-muted);">→ ' + dl + '이 빠른 LOT부터 출고하거나, 실물이 없으면 재고 실사로 정리가 필요합니다.</span>';
    }

    function showInjFifo() { _showFifoList('inj'); }

    /* 사출 — 다층 LOT */
    function showInjMultiLot() {
        if (!_inj || !_inj.multiLotItems.length) return;
        const rows = _inj.multiLotItems.map(d => `
            <tr style="background:rgba(245,158,11,0.04);">
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.color || '-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.qty)} EA</td>
                <td style="color:var(--accent-orange,#f59e0b);font-weight:700;">${d.lotCount}개 LOT</td>
            </tr>`).join('');
        UIUtils.showModal('사출 자재 창고 — 다층 LOT 목록', `
            <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
                4개 이상의 LOT가 동시에 창고에 보관 중인 항목입니다.
            </p>
            <table class="data-table">
                <thead><tr><th>차종</th><th>품명</th><th>컬러</th><th>현재 재고</th><th>LOT 수</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 유효기간 만료 */
    function showPaintExpired() {
        if (!_paint || !_paint.expiredItems.length) return;
        const rows = _paint.expiredItems
            .sort((a, b) => (a.expDate || '').localeCompare(b.expDate || ''))
            .map(d => `
                <tr style="background:rgba(220,38,38,0.04);">
                    <td><strong>${d.matName}</strong></td>
                    <td>${d.supplier}</td>
                    <td style="font-family:monospace;">${_esc(_formatLotDisplay(d.lot))}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td>${d.expDate}</td>
                    <td style="color:var(--accent-red);font-weight:700;">${d.daysPast}일 경과</td>
                </tr>`).join('');
        UIUtils.showModal('도료 자재 창고 — 유효기간 만료 목록', `
            <table class="data-table">
                <thead><tr><th>원료명</th><th>공급사</th><th>LOT</th><th>재고량</th><th>만료일</th><th>경과 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 유효기간 임박 */
    function showPaintExpiring() {
        if (!_paint || !_paint.expiringItems.length) return;
        const rows = _paint.expiringItems
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .map(d => `
                <tr style="background:rgba(245,158,11,0.04);">
                    <td><strong>${d.matName}</strong></td>
                    <td>${d.supplier}</td>
                    <td style="font-family:monospace;">${_esc(_formatLotDisplay(d.lot))}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td>${d.expDate}</td>
                    <td style="color:var(--accent-orange,#f59e0b);font-weight:700;">${d.daysLeft}일 남음</td>
                </tr>`).join('');
        UIUtils.showModal('도료 자재 창고 — 유효기간 임박 목록', `
            <table class="data-table">
                <thead><tr><th>원료명</th><th>공급사</th><th>LOT</th><th>재고량</th><th>만료일</th><th>남은 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 장기재고 */
    function showPaintLong() {
        if (!_paint || !_paint.longItems.length) return;
        const rows = _paint.longItems
            .sort((a, b) => b.days - a.days)
            .map(d => `
                <tr style="background:rgba(220,38,38,0.03);">
                    <td><strong>${d.matName}</strong></td>
                    <td>${d.supplier}</td>
                    <td style="font-family:monospace;">${_esc(_formatLotDisplay(d.lot))}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td>${d.firstDate}</td>
                    <td style="color:var(--accent-red);font-weight:700;">${d.days}일</td>
                </tr>`).join('');
        UIUtils.showModal('도료 자재 창고 — 장기재고 목록 (기준: ' + LONG_STOCK_DAYS + '일 이상)', `
            <table class="data-table">
                <thead><tr><th>원료명</th><th>공급사</th><th>LOT</th><th>재고량</th><th>최초 입고일</th><th>보관 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — FIFO 위반 */
    function showPaintFifo() { _showFifoList('paint'); }

    /* ==============================================================
       FIFO 위반 목록 + 확인 처리 (사출/도료 공통)
    ============================================================== */
    function _fifoPlainText(d, dateLabel, unit) {
        const old = (d.oldLots || [])[0], cons = d.consumedLots || [];
        if (!old || !cons.length) return '';
        return dateLabel + ' ' + (old.prodDate || _lotProdDate(old.lot)) + '인 ' + _formatLotDisplay(old.lot) +
            ' LOT이 ' + UIUtils.formatNumber(old.qty) + unit + ' 남아 있는데, ' + dateLabel + '이 더 늦은 ' +
            cons.map(c => _formatLotDisplay(c.lot)).join(', ') + ' LOT이 먼저 출고됨';
    }

    function _fifoCardHtml(kind, d, idx, acked) {
        const isInj = kind === 'inj';
        const dl = isInj ? '사출일' : '제조일';
        const party = isInj ? '사출처' : '도료사';
        const head = isInj
            ? '<strong>' + _esc(d.carModel || '-') + '</strong><span style="font-weight:700;">' + _esc(d.partName || '-') + '</span><span style="color:var(--text-muted);">' + _esc(d.color || '-') + '</span>'
            : '<strong>' + _esc(d.matName || '-') + '</strong><span style="color:var(--text-muted);">' + _esc(d.supplier || '-') + '</span>';
        const a = d.ack;
        const ackBox = acked && a
            ? '<div style="padding:8px 12px;font-size:0.8rem;background:rgba(21,128,61,0.07);border-bottom:1px dashed var(--border-color);">' +
                  '<span style="font-weight:800;color:#15803d;">확인 완료</span> ' + _esc(a.ackAt || '') + ' · ' + _esc(a.ackBy || '-') +
                  '<div style="margin-top:2px;">사유: <strong>' + _esc(a.reason || '-') + '</strong>' + (a.note ? ' — ' + _esc(a.note) : '') + '</div>' +
                  '<div style="color:var(--text-muted);">통보: 품질 관리자 · 생산관리자</div>' +
              '</div>'
            : '';
        const actionBtn = acked
            ? (_isAdmin() ? '<button class="btn btn-sm btn-outline" onclick="WarehouseOverviewModule.revokeFifoAck(\'' + kind + '\',' + idx + ')">확인 취소</button>' : '')
            : '<button class="btn btn-sm btn-primary" onclick="WarehouseOverviewModule.openFifoAck(\'' + kind + '\',' + idx + ')"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">task_alt</span> 확인 처리</button>';
        const border = acked ? 'rgba(21,128,61,0.35)' : 'rgba(234,88,12,0.3)';
        const headBg = acked ? 'rgba(21,128,61,0.06)' : 'rgba(234,88,12,0.06)';
        return '<div style="border:1px solid ' + border + ';border-radius:10px;margin-bottom:12px;overflow:hidden;' + (acked ? 'opacity:0.85;' : '') + '">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;background:' + headBg + ';">' +
                '<span style="font-weight:800;color:' + (acked ? '#15803d' : '#ea580c') + ';">' + (idx + 1) + '</span>' + head +
                '<span style="display:inline-flex;gap:4px;flex-wrap:wrap;">' + _fifoBlameBadges(d, party) + '</span>' +
                '<span style="margin-left:auto;font-size:0.8rem;">현재 재고 <strong>' + UIUtils.formatNumber(d.qty) + '</strong>' + (isInj ? ' EA' : ' 개') + '</span>' +
                actionBtn +
            '</div>' + ackBox +
            '<div style="padding:8px 12px;font-size:0.82rem;line-height:1.55;border-bottom:1px dashed var(--border-color);">' +
                '<span style="font-weight:800;color:#dc2626;">위반 내용</span> ' + (isInj ? _fifoViolationText(d) : _fifoViolationText(d, '제조일', '개')) +
                '<div style="margin-top:6px;"><span style="font-weight:800;color:#7c3aed;">원인 규명</span>' + _fifoCauseText(d, dl, isInj ? ' EA' : '개', party) + '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 12px;">' +
                '<div><div style="font-size:0.78rem;font-weight:800;color:#2563eb;margin-bottom:4px;">남아 있는 구 LOT (' + dl + ' 빠름)</div>' +
                    (isInj ? _fifoLotTable(d.oldLots, 'old') : _fifoLotTable(d.oldLots, 'old', '제조일', true)) + '</div>' +
                '<div><div style="font-size:0.78rem;font-weight:800;color:#ea580c;margin-bottom:4px;">먼저 소진된 신 LOT (' + dl + ' 늦음)</div>' +
                    (isInj ? _fifoLotTable(d.consumedLots, 'consumed', '사출일', false, { unit: ' EA', party: '사출처' })
                           : _fifoLotTable(d.consumedLots, 'consumed', '제조일', true, { unit: '개', party: '도료사' })) + '</div>' +
            '</div></div>';
    }

    /** 확인 이력표 — 취소된 건도 삭제하지 않고 상태만 표시 */
    function _fifoHistoryHtml(history) {
        if (!history || !history.length) return '';
        const rows = history.map(a => {
            const revoked = !!a.revokedAt;
            const status = revoked
                ? '<span style="color:#64748b;font-weight:700;">취소 (' + _esc(a.revokedAt) + ' · ' + _esc(a.revokedBy || '-') + ')</span>'
                : '<span style="color:#15803d;font-weight:700;">확인</span>';
            return '<tr' + (revoked ? ' style="opacity:0.6;"' : '') + '>' +
                '<td style="white-space:nowrap;">' + _esc(a.ackAt || '-') + '</td>' +
                '<td style="white-space:nowrap;">' + _esc(a.ackBy || '-') + '</td>' +
                '<td style="font-weight:700;">' + _esc(a.itemLabel || '-') + '</td>' +
                '<td style="font-family:monospace;">' + _esc((a.oldLots || []).map(_formatLotDisplay).join(', ')) + '</td>' +
                '<td style="font-family:monospace;">' + _esc((a.consumedLots || []).map(_formatLotDisplay).join(', ')) + '</td>' +
                '<td style="white-space:nowrap;">' + _esc(a.blame || '-') + '</td>' +
                '<td>' + _esc(a.reason || '-') + '</td>' +
                '<td>' + _esc(a.note || '-') + '</td>' +
                '<td>' + status + '</td></tr>';
        }).join('');
        return '<div style="font-size:0.85rem;font-weight:800;color:#0369a1;margin:16px 0 6px;">확인 이력 ' + history.length + '건 <span style="font-weight:500;color:var(--text-muted);">(삭제되지 않고 보존됩니다)</span></div>' +
            '<table class="data-table compact" style="width:100%;font-size:0.78rem;border-collapse:collapse;"><thead><tr>' +
            '<th>확인일시</th><th>확인자</th><th>품목</th><th>남은 구 LOT</th><th>소진된 신 LOT</th><th>귀책</th><th>확인 사유</th><th>조치 내용</th><th>상태</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function _showFifoList(kind) {
        const st = kind === 'inj' ? _inj : _paint;
        if (!st || (!st.fifoItems.length && !st.fifoHistory.length)) return;
        const isInj = kind === 'inj';
        const dl = isInj ? '사출일' : '제조일';
        const pending = st.fifoItems.map((d, i) => _fifoCardHtml(kind, d, i, false)).join('');
        const done = st.fifoAcked.map((d, i) => _fifoCardHtml(kind, d, i, true)).join('');
        const desc = isInj
            ? '선입선출(FIFO) 위반: <strong>사출일이 빠른 LOT의 재고가 남아 있는데, 사출일이 늦은 LOT이 먼저 모두 출고</strong>된 품목입니다.<br>' +
              '판정 기준은 <strong>사출 LOT 일자(YYMMDD = 사출일)</strong>이며, 구 LOT이 창고에 입고된 뒤에 신 LOT이 출고된 경우만 위반으로 봅니다.<br>' +
              '귀책: <strong style="color:#7c3aed;">사출처</strong> = 사출일이 늦은 LOT을 먼저 납품 · <strong style="color:#dc2626;">당사</strong> = 구 LOT이 창고에 있는데 신 LOT 출고 · <strong style="color:#64748b;">불가피</strong> = 구 LOT 입고 전 출고'
            : '선입선출(FIFO) 위반: <strong>제조일이 빠른 LOT의 재고가 남아 있는데, 제조일이 늦은 LOT이 먼저 모두 출고</strong>된 도료입니다.<br>' +
              '판정 기준은 <strong>도료 제조일</strong>(입고 기록의 제조일, 없으면 제조 LOT YYMMDD)이며, 구 LOT이 입고된 뒤에 신 LOT이 출고된 경우만 위반으로 봅니다.<br>' +
              '귀책: <strong style="color:#7c3aed;">도료사</strong> = 제조일이 늦은 LOT을 먼저 납품 · <strong style="color:#dc2626;">당사</strong> = 구 LOT이 창고에 있는데 신 LOT 출고 · <strong style="color:#64748b;">불가피</strong> = 구 LOT 입고 전 출고';
        const note = '<div style="font-size:0.78rem;color:var(--text-muted);margin:0 0 10px;">※ 위반 건은 <strong>확인 처리</strong>로 이슈 목록에서 제거합니다. 확인 시 <strong>품질 관리자 · 생산관리자</strong>에게 쪽지로 통보되며 확인 이력은 계속 남습니다. 이후 같은 품목에서 ' + dl + '이 늦은 LOT이 추가로 소진되면 다시 위반으로 표시됩니다.</div>';
        UIUtils.showModal((isInj ? '사출' : '도료') + ' 자재 창고 — FIFO 위반 목록',
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
                '<p style="font-size:0.83rem;color:var(--text-muted);margin:0;line-height:1.5;">' + desc + '</p>' +
                '<span style="font-size:0.78rem;font-weight:700;color:#ea580c;background:rgba(234,88,12,0.1);border:1px solid rgba(234,88,12,0.3);border-radius:999px;padding:3px 10px;white-space:nowrap;">' +
                    '미확인 ' + st.fifoItems.length + '건' + (st.fifoAcked.length ? ' · 확인 ' + st.fifoAcked.length + '건' : '') + '</span>' +
            '</div>' + note +
            '<div style="overflow:auto;max-height:min(72vh, 760px);">' +
                (pending || '<div style="padding:18px;text-align:center;color:#15803d;font-weight:700;">미확인 FIFO 위반이 없습니다.</div>') +
                (done ? '<div style="font-size:0.85rem;font-weight:800;color:#15803d;margin:14px 0 8px;">확인 완료 ' + st.fifoAcked.length + '건 (현재도 위반 상태, 이슈에서 제외)</div>' + done : '') +
                _fifoHistoryHtml(st.fifoHistory) +
            '</div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xxxl'
        );
    }

    function _isAdmin() {
        return typeof AuthModule !== 'undefined' && AuthModule.isAdminUser && AuthModule.isAdminUser();
    }

    function openFifoAck(kind, idx) {
        const st = kind === 'inj' ? _inj : _paint;
        const d = st && st.fifoItems[idx];
        if (!d) return;
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
        if (!user) { UIUtils.toast('로그인 후 확인 처리할 수 있습니다.', 'warning'); return; }
        _ackDraft = { kind: kind, key: d.fifoKey };
        const title = kind === 'inj'
            ? [d.carModel, d.partName, d.color].filter(Boolean).join(' · ')
            : [d.matName, d.supplier].filter(Boolean).join(' · ');
        const opts = FIFO_ACK_REASONS[kind].map(r => '<option value="' + _esc(r) + '">' + _esc(r) + '</option>').join('');
        UIUtils.showModal('FIFO 위반 확인 처리',
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
                '<div style="font-size:0.86rem;"><strong>' + _esc(title) + '</strong><div style="color:var(--text-muted);margin-top:4px;line-height:1.5;">' +
                    _esc(_fifoPlainText(d, kind === 'inj' ? '사출일' : '제조일', kind === 'inj' ? 'EA' : '개')) + '</div></div>' +
                '<div><label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:4px;">확인 사유 <span style="color:#dc2626;">*</span></label>' +
                    '<select id="fifoAckReason" class="form-control" style="width:100%;">' + opts + '</select></div>' +
                '<div><label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:4px;">조치 내용 <span style="color:#dc2626;">*</span></label>' +
                    '<textarea id="fifoAckNote" class="form-control" rows="3" style="width:100%;" placeholder="실물 확인 결과 및 조치 내용을 입력하세요."></textarea></div>' +
                '<div style="font-size:0.78rem;color:#b45309;background:rgba(245,158,11,0.1);border-radius:8px;padding:8px 10px;">' +
                    '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">notifications</span> ' +
                    '확인 처리하면 이슈 목록에서 제거되고, <strong>품질 관리자 · 생산관리자</strong>에게 쪽지로 통보됩니다. 확인 이력은 삭제되지 않고 보존됩니다.</div>' +
            '</div>',
            '<button class="btn btn-outline" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="UIUtils.guardClick(\'fifo-ack\', () => WarehouseOverviewModule.saveFifoAck(), this)">확인 처리</button>',
            'sm');
    }

    async function saveFifoAck() {
        const draft = _ackDraft;
        if (!draft) return;
        const reason = String((document.getElementById('fifoAckReason') || {}).value || '').trim();
        const note = String((document.getElementById('fifoAckNote') || {}).value || '').trim();
        if (!reason) { UIUtils.toast('확인 사유를 선택하세요.', 'warning'); return; }
        if (note.length < 2) { UIUtils.toast('조치 내용을 입력하세요.', 'warning'); return; }
        const kind = draft.kind;
        const st = kind === 'inj' ? _inj : _paint;
        const d = st && st.fifoItems.find(x => x.fifoKey === draft.key);
        if (!d) { UIUtils.toast('이미 처리되었거나 위반 내용이 변경되었습니다.', 'warning'); UIUtils.closeAllModals(); return; }
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
        const ackBy = user ? (user.name || user.displayName || user.username || '') : '';
        const ackAt = UIUtils.now();
        const isInj = kind === 'inj';
        const itemLabel = isInj
            ? [d.carModel, d.partName, d.color].filter(Boolean).join(' · ')
            : [d.matName, d.supplier].filter(Boolean).join(' · ');
        const blame = d.blame || {};
        const blameText = [blame.ours ? '당사 귀책' : '', blame.supplier ? (isInj ? '사출처 귀책' : '도료사 귀책') : '']
            .filter(Boolean).join(' · ') || '불가피 (구 LOT 미입고)';
        await Storage.add(DB.STORES.PROD_CONDITIONS, {
            _docKind: FIFO_ACK_DOC,
            kind: kind,
            key: d.fifoKey,
            itemLabel: itemLabel,
            oldLots: (d.oldLots || []).map(o => o.lot),
            consumedLots: (d.consumedLots || []).map(c => c.lot),
            blame: blameText,
            reason: reason,
            note: note,
            ackBy: ackBy,
            ackById: user ? (user.id || '') : '',
            ackAt: ackAt,
            date: UIUtils.today()
        });
        _notifyFifoAck({
            title: 'FIFO 위반 확인 처리 — ' + (isInj ? '사출' : '도료') + ' ' + itemLabel,
            body: '[' + (isInj ? '사출 자재 창고' : '도료 자재 창고') + ' FIFO 위반 확인]\n' +
                itemLabel + '\n' +
                '위반: ' + _fifoPlainText(d, isInj ? '사출일' : '제조일', isInj ? 'EA' : '개') + '\n' +
                '귀책: ' + blameText + '\n' +
                '확인 사유: ' + reason + '\n' +
                '조치 내용: ' + note + '\n' +
                '확인자: ' + (ackBy || '-') + ' · ' + ackAt,
            category: 'fifo_ack',
            priority: 'high'
        });
        UIUtils.toast('확인 처리되었습니다. 품질·생산 관리자에게 통보했습니다.', 'success');
        _ackDraft = null;
        UIUtils.closeAllModals();
        _refreshAfterFifoAck(kind);
    }

    function _notifyFifoAck(msg) {
        try {
            if (typeof AuthModule === 'undefined' || typeof AuthModule.sendSystemMessage !== 'function') return;
            FIFO_NOTIFY_ROLES.forEach(role =>
                AuthModule.sendSystemMessage(Object.assign({}, msg, { targetType: 'role', targetId: role })));
        } catch (e) {
            console.warn('[WarehouseOverview] FIFO 확인 통보 실패:', e);
        }
    }

    function _refreshAfterFifoAck(kind) {
        _inj = _calcInjStats();
        _paint = _calcPaintStats();
        if (_container && document.body.contains(_container)) render(_container);
        const st = kind === 'inj' ? _inj : _paint;
        if (st && (st.fifoItems.length || st.fifoHistory.length)) _showFifoList(kind);
    }

    /** 확인 취소 — 레코드는 삭제하지 않고 취소 일시·취소자만 기록해 이력을 보존한다 */
    async function revokeFifoAck(kind, idx) {
        if (!_isAdmin()) { UIUtils.toast('관리자만 확인을 취소할 수 있습니다.', 'warning'); return; }
        const st = kind === 'inj' ? _inj : _paint;
        const d = st && st.fifoAcked[idx];
        if (!d || !d.ack) return;
        if (!confirm('이 FIFO 위반의 확인 처리를 취소하고 다시 이슈로 되돌릴까요? (확인 이력은 보존됩니다)')) return;
        const user = AuthModule.getCurrentUser() || {};
        const by = user.name || user.displayName || user.username || '';
        const at = UIUtils.now();
        const recs = _fifoAckRecords(true).filter(a => a.key === d.fifoKey);
        for (const a of recs) {
            await Storage.update(DB.STORES.PROD_CONDITIONS, a.id, { revokedAt: at, revokedBy: by });
        }
        _notifyFifoAck({
            title: 'FIFO 위반 확인 취소 — ' + (d.ack.itemLabel || ''),
            body: (d.ack.itemLabel || '') + '\n확인 처리가 취소되어 FIFO 위반 이슈로 복원되었습니다.\n취소자: ' + (by || '-') + ' · ' + at,
            category: 'fifo_ack', priority: 'normal'
        });
        UIUtils.closeAllModals();
        _refreshAfterFifoAck(kind);
    }

    return {
        init, render,
        showInjZero, showInjLong, showInjFifo, showInjMultiLot,
        showPaintExpired, showPaintExpiring, showPaintLong, showPaintFifo,
        openFifoAck, saveFifoAck, revokeFifoAck,
        // 대시보드/현황 모니터 표시용 — 창고 FIFO(선입선출) 위반
        getFifoViolations: function() {
            let inj = [], paint = [];
            try { inj = (_calcInjStats() || {}).fifoItems || []; } catch (e) {}
            try { paint = (_calcPaintStats() || {}).fifoItems || []; } catch (e) {}
            return { injection: inj, paint: paint, total: inj.length + paint.length };
        },
    };
})();
