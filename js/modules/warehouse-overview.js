/**
 * 자재창고 허브 (사출 자재 + 도료 자재 통합 현황)
 */
var WarehouseOverviewModule = (function () {

    const LONG_STOCK_DAYS = 90; // 장기재고 기준일

    let _inj   = null; // 사출 창고 계산 결과
    let _paint = null; // 도료 창고 계산 결과

    function init() {}

    function render(container) {
        _inj   = _calcInjStats();
        _paint = _calcPaintStats();

        const injBadges   = _buildInjBadges(_inj);
        const paintBadges = _buildPaintBadges(_paint);

        container.innerHTML = `
            <div class="fade-in-up">

                <!-- ── 섹션 카드 ── -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
                    ${_sectionCard('사출 자재', '사출 부품 입출고 및 재고 현황',
                        'warehouse', 'var(--accent-blue)', 'rgba(59,130,246,0.12)',
                        'injection-warehouse', injBadges)}
                    ${_sectionCard('도료 자재', '도료 입출고 및 재고 · 유효기간 관리',
                        'palette', '#8b5cf6', 'rgba(139,92,246,0.12)',
                        'paint-inventory', paintBadges)}
                </div>

                <!-- ── 사출 자재 창고 ── -->
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);
                            text-transform:uppercase;letter-spacing:0.5px;
                            margin-bottom:10px;padding-left:2px;">
                    사출 자재 창고
                </div>
                <div class="stat-cards" style="margin-bottom:28px;">
                    ${_sc('재고 품목',  _inj.itemCount, '종',   'blue',   false, '')}
                    ${_sc('총 재고',   UIUtils.formatNumber(_inj.totalStock), 'EA', 'purple', false, '')}
                    ${_sc('재고 없음', _inj.zeroStock,  '종',
                        _inj.zeroStock   > 0 ? 'orange' : '', _inj.zeroStock   > 0,
                        'WarehouseOverviewModule.showInjZero()')}
                    ${_sc('장기재고',  _inj.longStock,  '종',
                        _inj.longStock   > 0 ? 'red'    : '', _inj.longStock   > 0,
                        'WarehouseOverviewModule.showInjLong()')}
                    ${_sc('FIFO 위반', _inj.fifoCount,  '건',
                        _inj.fifoCount   > 0 ? 'red'    : '', _inj.fifoCount   > 0,
                        'WarehouseOverviewModule.showInjFifo()')}
                    ${_sc('다층 LOT',  _inj.multiLot,  '품목',
                        _inj.multiLot    > 0 ? 'orange' : '', _inj.multiLot    > 0,
                        'WarehouseOverviewModule.showInjMultiLot()')}
                </div>

                <!-- ── 도료 자재 창고 ── -->
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);
                            text-transform:uppercase;letter-spacing:0.5px;
                            margin-bottom:10px;padding-left:2px;">
                    도료 자재 창고
                </div>
                <div class="stat-cards">
                    ${_sc('재고 품목',  _paint.itemCount, '종',    'blue',   false, '')}
                    ${_sc('총 재고',   UIUtils.formatNumber(_paint.totalStock), 'L/kg', 'purple', false, '')}
                    ${_sc('유효기간 만료', _paint.expiredCount, '건',
                        _paint.expiredCount  > 0 ? 'red'    : '', _paint.expiredCount  > 0,
                        'WarehouseOverviewModule.showPaintExpired()')}
                    ${_sc('유효기간 임박', _paint.expiringCount,'건',
                        _paint.expiringCount > 0 ? 'orange' : '', _paint.expiringCount > 0,
                        'WarehouseOverviewModule.showPaintExpiring()')}
                    ${_sc('장기재고',  _paint.longStock,  '건',
                        _paint.longStock     > 0 ? 'red'    : '', _paint.longStock     > 0,
                        'WarehouseOverviewModule.showPaintLong()')}
                    ${_sc('FIFO 위반', _paint.fifoCount,  '품목',
                        _paint.fifoCount     > 0 ? 'red'    : '', _paint.fifoCount     > 0,
                        'WarehouseOverviewModule.showPaintFifo()')}
                </div>

            </div>
        `;
    }

    /* ── 섹션 카드 ── */
    function _sectionCard(title, sub, icon, accentColor, iconBg, page, badges) {
        const badgesHtml = badges.length
            ? badges.map(b => `<span style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;
                border-radius:12px;padding:2px 10px;font-size:0.78rem;font-weight:700;">${b}</span>`).join('')
            : '<span style="background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:12px;padding:2px 10px;font-size:0.78rem;font-weight:700;">정상</span>';

        return `
            <div onclick="Router.navigate('${page}')"
                 onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.10)';this.style.transform='translateY(-2px)'"
                 onmouseleave="this.style.boxShadow='';this.style.transform=''"
                 style="background:var(--bg-card);border:1px solid var(--border-color);
                        border-left:4px solid ${accentColor};border-radius:12px;
                        padding:20px 24px;cursor:pointer;transition:box-shadow 0.2s,transform 0.2s;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                    <div style="width:44px;height:44px;border-radius:10px;background:${iconBg};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="color:${accentColor};font-size:24px;">${icon}</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:1rem;font-weight:700;color:var(--text-primary);">${title}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${sub}</div>
                    </div>
                    <span class="material-symbols-outlined" style="color:var(--text-muted);flex-shrink:0;">chevron_right</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">${badgesHtml}</div>
            </div>
        `;
    }

    /* ── 클릭 가능 stat 카드 ── */
    function _sc(label, value, unit, colorClass, clickable, onclickFn) {
        const attrs = clickable
            ? `onclick="${onclickFn}" style="cursor:pointer;position:relative;"
               onmouseenter="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='1')"
               onmouseleave="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='0')"`
            : 'style="position:relative;"';

        const hint = clickable
            ? `<div class="hint" style="opacity:0;transition:opacity 0.2s;position:absolute;
                    bottom:8px;right:10px;font-size:0.68rem;color:var(--text-muted);
                    display:flex;align-items:center;gap:2px;">
                   <span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span>상세보기
               </div>` : '';

        return `
            <div class="stat-card ${colorClass}" ${attrs}>
                ${hint}
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${unit ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${unit}</div>` : ''}
            </div>`;
    }

    /* ── 뱃지 ── */
    function _buildInjBadges(s) {
        const b = [];
        if (s.longStock > 0) b.push('장기재고 ' + s.longStock + '건');
        if (s.fifoCount > 0) b.push('FIFO위반 ' + s.fifoCount + '건');
        if (s.zeroStock > 0) b.push('재고없음 ' + s.zeroStock + '종');
        return b;
    }

    function _buildPaintBadges(s) {
        const b = [];
        if (s.expiredCount  > 0) b.push('유효기간만료 ' + s.expiredCount + '건');
        if (s.fifoCount     > 0) b.push('FIFO위반 ' + s.fifoCount + '건');
        if (s.longStock     > 0) b.push('장기재고 ' + s.longStock + '건');
        return b;
    }

    /* ==============================================================
       사출 창고 통계 계산
       - 품목별 LOT 단위 재고 추적
    ============================================================== */
    function _calcInjStats() {
        const all   = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // 품목(carModel||partName||color) × LOT 별 재고 계산
        const itemMap = {}; // key → { [lot]: { qty, firstDate } }
        all.forEach(r => {
            const key = (r.carModel || '') + '||' + (r.partName || '') + '||' + (r.color || '');
            const lot = r.lotNo || '__nolot__';
            if (!itemMap[key]) itemMap[key] = {};
            if (!itemMap[key][lot]) itemMap[key][lot] = { qty: 0, firstDate: r.date || '' };
            const qty = Number(r.quantity) || 0;
            if (r.type === '입고') {
                itemMap[key][lot].qty += qty;
                // 가장 오래된 입고일 추적
                if (!itemMap[key][lot].firstDate || r.date < itemMap[key][lot].firstDate)
                    itemMap[key][lot].firstDate = r.date || '';
            } else {
                itemMap[key][lot].qty -= qty;
            }
        });

        let itemCount = 0, totalStock = 0, zeroStock = 0, longStock = 0, fifoCount = 0, multiLot = 0;
        const zeroItems = [], longItems = [], fifoItems = [], multiLotItems = [];

        Object.entries(itemMap).forEach(([key, lots]) => {
            const [carModel, partName, color] = key.split('||');
            const netQty = Object.values(lots).reduce((s, v) => s + v.qty, 0);

            if (netQty <= 0) {
                // 이력은 있지만 재고 0
                const hadStock = Object.values(lots).some(v => v.qty !== 0 || true); // 항상 이력 있음
                zeroStock++;
                zeroItems.push({ carModel, partName, color });
                return;
            }

            itemCount++;
            totalStock += netQty;

            const activeLots = Object.entries(lots)
                .filter(([, v]) => v.qty > 0)
                .sort(([, a], [, b]) => (a.firstDate || '').localeCompare(b.firstDate || ''));

            // 다층 LOT: 활성 LOT 2개 이상
            if (activeLots.length > 1) {
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

            // FIFO 위반: 소비된 LOT 중 현재 활성 LOT보다 더 최근 입고된 LOT가 있으면 위반
            const consumedLots = Object.entries(lots).filter(([, v]) => v.qty <= 0);
            if (activeLots.length > 0 && consumedLots.length > 0) {
                const oldestActiveLotDate = activeLots[0][1].firstDate;
                const hasNewerConsumed = consumedLots.some(([, v]) => (v.firstDate || '') > (oldestActiveLotDate || ''));
                if (hasNewerConsumed) {
                    fifoCount++;
                    fifoItems.push({ carModel, partName, color, qty: netQty, oldestDate: oldestActiveLotDate });
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

        // 재료별 LOT 단위 재고 계산
        const matMap = {}; // materialId → { [lot]: { qty, firstDate, expDate, mfgDate } }
        all.forEach(r => {
            const mid = r.materialId || '__noid__';
            const lot = r.lotNo || '__nolot__';
            if (!matMap[mid]) matMap[mid] = {};
            if (!matMap[mid][lot]) matMap[mid][lot] = { qty: 0, firstDate: r.date || '', expDate: r.expDate || '', mfgDate: r.mfgDate || '' };
            const qty = Number(r.quantity) || 0;
            if (r.type === '출고') {
                matMap[mid][lot].qty -= qty;
            } else {
                matMap[mid][lot].qty += qty;
                if (!matMap[mid][lot].firstDate || r.date < matMap[mid][lot].firstDate)
                    matMap[mid][lot].firstDate = r.date || '';
                if (r.expDate && (!matMap[mid][lot].expDate || r.expDate < matMap[mid][lot].expDate))
                    matMap[mid][lot].expDate = r.expDate; // 가장 빠른 만료일 추적
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
                // 유효기간 체크
                if (v.expDate) {
                    const exp  = new Date(v.expDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    if (diff < 0) {
                        expiredCount++;
                        expiredItems.push({ matName, supplier, lot, qty: v.qty, expDate: v.expDate,
                            daysPast: Math.abs(diff) });
                    } else if (diff <= 30) {
                        expiringCount++;
                        expiringItems.push({ matName, supplier, lot, qty: v.qty, expDate: v.expDate,
                            daysLeft: diff });
                    }
                }
                // 장기재고 체크
                if (v.firstDate) {
                    const diff = Math.round((today - new Date(v.firstDate)) / 86400000);
                    if (diff >= LONG_STOCK_DAYS) {
                        longStock++;
                        longItems.push({ matName, supplier, lot, qty: v.qty, firstDate: v.firstDate, days: diff });
                    }
                }
            });

            // FIFO 위반 체크
            const consumedLots = Object.entries(lots).filter(([, v]) => v.qty <= 0);
            if (activeLots.length > 0 && consumedLots.length > 0) {
                const oldestActiveLotDate = activeLots[0][1].firstDate;
                const hasNewerConsumed = consumedLots.some(([, v]) => (v.firstDate || '') > (oldestActiveLotDate || ''));
                if (hasNewerConsumed && !fifoItems.find(f => f.matName === matName)) {
                    fifoCount++;
                    fifoItems.push({ matName, supplier, qty: netQty });
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

    /* 사출 — FIFO 위반 */
    function showInjFifo() {
        if (!_inj || !_inj.fifoItems.length) return;
        const rows = _inj.fifoItems.map(d => `
            <tr style="background:rgba(234,88,12,0.04);">
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.color || '-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.qty)} EA</td>
                <td style="color:#ea580c;font-weight:700;">${d.oldestDate || '-'}</td>
            </tr>`).join('');
        UIUtils.showModal('사출 자재 창고 — FIFO 위반 목록', `
            <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
                더 최근에 입고된 LOT가 먼저 소비되고 있어 선입선출 원칙에 위배되는 항목입니다.
            </p>
            <table class="data-table">
                <thead><tr><th>차종</th><th>품명</th><th>컬러</th><th>현재 재고</th><th>잔존 LOT 최초 입고일</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
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
                2개 이상의 LOT가 동시에 창고에 보관 중인 항목입니다.
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
                    <td style="font-family:monospace;">${d.lot}</td>
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
                    <td style="font-family:monospace;">${d.lot}</td>
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
                    <td style="font-family:monospace;">${d.lot}</td>
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
        const rows = _paint.fifoItems.map(d => `
            <tr style="background:rgba(234,88,12,0.04);">
                <td><strong>${d.matName}</strong></td>
                <td>${d.supplier}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                <td style="color:#ea580c;font-weight:700;">FIFO 위반</td>
            </tr>`).join('');
        UIUtils.showModal('도료 자재 창고 — FIFO 위반 목록', `
            <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
                더 최근에 입고된 LOT가 먼저 소비되고 있어 선입선출 원칙에 위배되는 원료입니다.
            </p>
            <table class="data-table">
                <thead><tr><th>원료명</th><th>공급사</th><th>현재 재고</th><th>상태</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    return {
        init, render,
        showInjZero, showInjLong, showInjFifo, showInjMultiLot,
        showPaintExpired, showPaintExpiring, showPaintLong, showPaintFifo,
    };
})();
