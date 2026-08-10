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

    let _inj   = null; // 사출 창고 계산 결과
    let _paint = null; // 도료 창고 계산 결과
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

        var issueHtml = issues.length
            ? issues.map(function(iss){ return _issueCard(iss.sev, iss.icon, iss.label, iss.desc, iss.fn); }).join('')
            : '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.84rem;">' +
                '<span class="material-symbols-outlined" style="font-size:20px;color:#10b981;vertical-align:middle;margin-right:4px;">check_circle</span>' +
                '문제 없음 — 모든 자재 창고 정상' +
              '</div>';

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

                // ── 2컬럼 메인 ──────────────────────────────────────────
                '<div style="display:grid;grid-template-columns:1fr 340px;gap:16px;">' +

                    // 좌측: 창고 현황
                    '<div style="display:flex;flex-direction:column;gap:14px;">' +

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
                                    _statRow('FIFO 위반',  _inj.fifoCount + '건',  _inj.fifoCount  > 0 ? 'red'   :'ok', _inj.fifoCount  > 0, 'WarehouseOverviewModule.showInjFifo()') +
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
                                    _statRow('FIFO 위반',     _paint.fifoCount + '품목',   _paint.fifoCount     > 0 ? 'red'   :'ok', _paint.fifoCount     > 0, 'WarehouseOverviewModule.showPaintFifo()') +
                                '</tbody></table>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // 우측: 문제점·이슈
                    '<div>' +
                        '<div class="card">' +
                            '<div class="card-header">' +
                                '<h4 style="margin:0;display:flex;align-items:center;gap:6px;">' +
                                    '<span class="material-symbols-outlined" style="font-size:18px;color:#ef4444;">warning</span>' +
                                    '문제점 · 이슈' +
                                    (issues.length ? '<span style="background:#ef4444;color:#fff;border-radius:999px;font-size:0.68rem;font-weight:800;padding:2px 7px;margin-left:4px;">' + issues.length + '</span>' : '') +
                                '</h4>' +
                            '</div>' +
                            '<div class="card-body" style="display:flex;flex-direction:column;gap:7px;">' +
                                issueHtml +
                            '</div>' +
                        '</div>' +
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

            entries.forEach(({ lot, qty }) => {
                if (!itemMap[key][lot]) itemMap[key][lot] = { qty: 0, firstDate: '', hadIncoming: false };
                if (r.type === '입고') {
                    itemMap[key][lot].qty += qty;
                    itemMap[key][lot].hadIncoming = true;
                    // 입고 기록에서만 firstDate 추적 (가장 오래된 입고일)
                    if (!itemMap[key][lot].firstDate || r.date < itemMap[key][lot].firstDate)
                        itemMap[key][lot].firstDate = r.date || '';
                } else {
                    itemMap[key][lot].qty -= qty;
                }
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

            // FIFO 위반: 소비된 LOT 중 현재 활성 LOT보다 더 최근에 입고된 LOT가 있으면 위반
            // - 입고 기록이 실제로 있는 LOT만 대상 (hadIncoming=true, firstDate 유효)
            // - 출고만 있는 LOT(데이터 오류)는 제외
            // - YYMMDD 형식 LOT만 비교 (__nolot__, DEV-LOT 등 제외)
            const fifoActiveLots = activeLots.filter(([lot]) => _isYymmddLot(lot));
            const consumedLots = Object.entries(lots)
                .filter(([lot, v]) => _isYymmddLot(lot) && v.qty <= 0 && v.hadIncoming && v.firstDate);
            if (fifoActiveLots.length > 0 && consumedLots.length > 0) {
                const oldestActiveLotDate = fifoActiveLots[0][1].firstDate;
                // 소비된 LOT 중 현재 가장 오래된 활성 LOT보다 나중에 입고된 것이 있으면 위반
                const newerConsumedLots = consumedLots
                    .filter(([, v]) => v.firstDate > oldestActiveLotDate)
                    .sort(([, a], [, b]) => (a.firstDate || '').localeCompare(b.firstDate || ''));
                if (newerConsumedLots.length) {
                    fifoCount++;
                    fifoItems.push({
                        carModel,
                        partName,
                        color,
                        qty: netQty,
                        oldestDate: oldestActiveLotDate,
                        oldLots: fifoActiveLots.map(([lot, v]) => ({ lot, qty: v.qty, firstDate: v.firstDate })),
                        consumedLots: newerConsumedLots.map(([lot, v]) => ({ lot, firstDate: v.firstDate }))
                    });
                }
            }
        });

        return { itemCount, totalStock, zeroStock, longStock, fifoCount, multiLot,
                 zeroItems, longItems, fifoItems, multiLotItems };
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
                    lotNo: r.lotNo || ''
                };
            }
            const entry = matMap[mid][lot];
            if (r.prodLot && !entry.prodLot) entry.prodLot = r.prodLot;
            if (r.lotNo && !entry.lotNo) entry.lotNo = r.lotNo;
            const qty = Number(r.quantity) || 0;
            if (r.type === '출고') {
                entry.qty -= qty;
            } else {
                entry.qty += qty;
                if (!entry.firstDate || r.date < entry.firstDate)
                    entry.firstDate = r.date || '';
                if (r.expDate && (!entry.expDate || r.expDate < entry.expDate))
                    entry.expDate = r.expDate; // 가장 빠른 만료일 추적
            }
        });

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

            // FIFO 위반 체크 — YYMMDD 형식 LOT만 비교 (__nolot__, DEV-LOT, 비정상 LOT 제외)
            const fifoActiveLots = activeLots.filter(([lot]) => _isYymmddLot(lot));
            const consumedLots = Object.entries(lots)
                .filter(([lot, v]) => _isYymmddLot(lot) && v.qty <= 0);
            if (fifoActiveLots.length > 0 && consumedLots.length > 0) {
                const oldestActiveLotDate = fifoActiveLots[0][1].firstDate;
                const newerConsumedLots = consumedLots
                    .filter(([, v]) => (v.firstDate || '') > (oldestActiveLotDate || ''))
                    .sort(([, a], [, b]) => (a.firstDate || '').localeCompare(b.firstDate || ''));
                if (newerConsumedLots.length && !fifoItems.find(f => f.matName === matName)) {
                    fifoCount++;
                    fifoItems.push({
                        matName,
                        supplier,
                        qty: netQty,
                        oldestDate: oldestActiveLotDate,
                        oldLots: fifoActiveLots.map(([lot, v]) => ({ lot, qty: v.qty, firstDate: v.firstDate })),
                        consumedLots: newerConsumedLots.map(([lot, v]) => ({ lot, firstDate: v.firstDate }))
                    });
                }
            }
        });

        return { itemCount, totalStock, expiredCount, expiringCount, longStock, fifoCount,
                 expiredItems, expiringItems, longItems, fifoItems };
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

    function _fifoLotChips(lots, type) {
        const list = lots || [];
        if (!list.length) {
            return '<span style="color:var(--text-muted);font-size:0.78rem;">-</span>';
        }
        const isOld = type === 'old';
        const color = isOld ? '#2563eb' : '#ea580c';
        const bg = isOld ? 'rgba(37,99,235,0.08)' : 'rgba(234,88,12,0.08)';
        const border = isOld ? 'rgba(37,99,235,0.28)' : 'rgba(234,88,12,0.35)';
        const maxShow = 4;
        const shown = list.slice(0, maxShow);
        const rest = list.length - shown.length;
        const chips = shown.map(function(l) {
            const qtyHtml = isOld
                ? '<span style="font-weight:700;margin-left:6px;">' + UIUtils.formatNumber(l.qty || 0) + '</span>'
                : '';
            return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;' +
                'background:' + bg + ';border:1px solid ' + border + ';white-space:nowrap;font-size:0.78rem;line-height:1.3;">' +
                '<strong style="font-family:monospace;color:' + color + ';">' + _esc(_formatLotDisplay(l.lot)) + '</strong>' +
                '<span style="color:var(--text-muted);font-size:0.72rem;" title="입고일시">' + _esc(_shortDate(l.firstDate)) + '</span>' +
                qtyHtml +
                '</span>';
        }).join('');
        const more = rest > 0
            ? '<span style="font-size:0.72rem;color:var(--text-muted);padding:3px 6px;">+' + rest + '개</span>'
            : '';
        return '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:460px;">' + chips + more + '</div>';
    }

    function _fifoSummaryLine(oldLot, consumedLot) {
        return '<div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.76rem;color:#9a3412;line-height:1.35;">' +
            '<span style="font-family:monospace;font-weight:700;color:#2563eb;">' + _esc(_formatLotDisplay(oldLot.lot)) + '</span>' +
            '<span style="color:var(--text-muted);">잔량</span>' +
            '<span class="material-symbols-outlined" style="font-size:14px;color:#ea580c;">arrow_forward</span>' +
            '<span style="font-family:monospace;font-weight:700;color:#ea580c;">' + _esc(_formatLotDisplay(consumedLot.lot)) + '</span>' +
            '<span style="color:var(--text-muted);">선소진</span>' +
            '</div>';
    }

    /* 사출 — FIFO 위반 */
    function showInjFifo() {
        if (!_inj || !_inj.fifoItems.length) return;
        const rows = _inj.fifoItems.map(function(d, idx) {
            const oldLot = (d.oldLots || [])[0] || {};
            const consumedLot = (d.consumedLots || [])[0] || {};
            return `
                <tr style="background:${idx % 2 ? 'rgba(234,88,12,0.03)' : 'transparent'};vertical-align:top;">
                    <td style="white-space:nowrap;text-align:center;color:var(--text-muted);">${idx + 1}</td>
                    <td style="white-space:nowrap;">${_esc(d.carModel || '-')}</td>
                    <td style="white-space:nowrap;font-weight:600;">${_esc(d.partName || '-')}</td>
                    <td style="white-space:nowrap;">${_esc(d.color || '-')}</td>
                    <td style="white-space:nowrap;text-align:right;font-weight:700;">${UIUtils.formatNumber(d.qty)}</td>
                    <td>${_fifoLotChips(d.oldLots, 'old')}</td>
                    <td>${_fifoLotChips(d.consumedLots, 'consumed')}</td>
                    <td style="white-space:nowrap;">${_fifoSummaryLine(oldLot, consumedLot)}</td>
                </tr>`;
        }).join('');
        UIUtils.showModal('사출 자재 창고 — FIFO 위반 목록', `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
                <p style="font-size:0.83rem;color:var(--text-muted);margin:0;line-height:1.45;">
                    구 LOT 재고가 남아 있는데 신 LOT가 먼저 소진된 항목입니다.
                    <span style="color:var(--text-secondary);">※ YYMMDD(6자리) LOT만 판정</span>
                </p>
                <span style="font-size:0.78rem;font-weight:700;color:#ea580c;background:rgba(234,88,12,0.1);border:1px solid rgba(234,88,12,0.3);border-radius:999px;padding:3px 10px;white-space:nowrap;">
                    ${_inj.fifoItems.length}건
                </span>
            </div>
            <div class="data-table-wrapper" style="overflow:auto;max-height:min(70vh, 720px);">
                <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="white-space:nowrap;text-align:center;">No</th>
                            <th style="white-space:nowrap;">차종</th>
                            <th style="white-space:nowrap;">품명</th>
                            <th style="white-space:nowrap;">컬러</th>
                            <th style="white-space:nowrap;text-align:right;">재고(EA)</th>
                            <th style="white-space:nowrap;">남아 있는 구 LOT<br><span style="font-weight:400;font-size:0.7rem;color:var(--text-muted);">회색 = 입고일시</span></th>
                            <th style="white-space:nowrap;">먼저 소진된 신 LOT<br><span style="font-weight:400;font-size:0.7rem;color:var(--text-muted);">회색 = 입고일시</span></th>
                            <th style="white-space:nowrap;">요약</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xxxl'
        );
    }

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
    function showPaintFifo() {
        if (!_paint || !_paint.fifoItems.length) return;
        const rows = _paint.fifoItems.map(function(d, idx) {
            const oldLot = (d.oldLots || [])[0] || {};
            const consumedLot = (d.consumedLots || [])[0] || {};
            return `
                <tr style="background:${idx % 2 ? 'rgba(234,88,12,0.03)' : 'transparent'};vertical-align:top;">
                    <td style="white-space:nowrap;text-align:center;color:var(--text-muted);">${idx + 1}</td>
                    <td style="white-space:nowrap;font-weight:600;">${_esc(d.matName)}</td>
                    <td style="white-space:nowrap;">${_esc(d.supplier)}</td>
                    <td style="white-space:nowrap;text-align:right;font-weight:700;">${UIUtils.formatNumber(d.qty)}</td>
                    <td>${_fifoLotChips(d.oldLots, 'old')}</td>
                    <td>${_fifoLotChips(d.consumedLots, 'consumed')}</td>
                    <td style="white-space:nowrap;">${_fifoSummaryLine(oldLot, consumedLot)}</td>
                </tr>`;
        }).join('');
        UIUtils.showModal('도료 자재 창고 — FIFO 위반 목록', `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
                <p style="font-size:0.83rem;color:var(--text-muted);margin:0;line-height:1.45;">
                    구 LOT 재고가 남아 있는데 신 LOT가 먼저 소진된 원료입니다.
                    <span style="color:var(--text-secondary);">※ YYMMDD(6자리) LOT만 판정 (__nolot__, DEV-LOT 등 제외)</span>
                </p>
                <span style="font-size:0.78rem;font-weight:700;color:#ea580c;background:rgba(234,88,12,0.1);border:1px solid rgba(234,88,12,0.3);border-radius:999px;padding:3px 10px;white-space:nowrap;">
                    ${_paint.fifoItems.length}건
                </span>
            </div>
            <div class="data-table-wrapper" style="overflow:auto;max-height:min(70vh, 720px);">
                <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="white-space:nowrap;text-align:center;">No</th>
                            <th style="white-space:nowrap;">원료명</th>
                            <th style="white-space:nowrap;">공급사</th>
                            <th style="white-space:nowrap;text-align:right;">재고</th>
                            <th style="white-space:nowrap;">남아 있는 구 LOT<br><span style="font-weight:400;font-size:0.7rem;color:var(--text-muted);">회색 = 입고일시</span></th>
                            <th style="white-space:nowrap;">먼저 소진된 신 LOT<br><span style="font-weight:400;font-size:0.7rem;color:var(--text-muted);">회색 = 입고일시</span></th>
                            <th style="white-space:nowrap;">요약</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xxxl'
        );
    }

    return {
        init, render,
        showInjZero, showInjLong, showInjFifo, showInjMultiLot,
        showPaintExpired, showPaintExpiring, showPaintLong, showPaintFifo,
    };
})();
