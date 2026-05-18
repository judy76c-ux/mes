/**
 * 자재 창고 허브 (WarehouseHubModule)
 * - 사출 자재 / 도료 자재 진입 버튼
 * - 장기재고 · 유효기간 임박/만료 · FIFO 위반 · 재고 부족 알림 대시보드
 */
var WarehouseHubModule = (function () {
    const INJ_STORE    = DB.STORES.INJECTION_INVENTORY;
    const PAINT_STORE  = DB.STORES.PAINT_INVENTORY;
    const PAINT_MAT    = DB.STORES.PAINT_MATERIALS;

    const INJ_LONG_DAYS   = 30;   // 사출 장기재고 기준일 (마지막 출고 후)
    const PAINT_LONG_DAYS = 60;   // 도료 장기재고 기준일
    const EXP_WARN_DAYS   = 30;   // 유효기간 임박 기준

    // ── 유틸 ──────────────────────────────────────────────────────────
    function _today() { return UIUtils.today(); }
    function _fmt(n)  { return UIUtils.formatNumber(n); }
    function _diffDays(dateStr) {
        if (!dateStr) return 9999;
        return Math.floor((new Date() - new Date(dateStr)) / 86400000);
    }
    function _badge(text, type) {
        const map = {
            success: 'background:#dcfce7;color:#15803d;border:1px solid #86efac;',
            danger:  'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            warning: 'background:#fff7ed;color:#ea580c;border:1px solid #fdba74;',
            info:    'background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;',
            purple:  'background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd;',
            muted:   'background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border-color);',
        };
        return `<span style="${map[type]||map.muted} border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;">${text}</span>`;
    }
    function _kpi(label, value, unit, color, icon) {
        const cm = {
            blue:   { bg:'#eff6ff', val:'#2563eb', ic:'#60a5fa' },
            purple: { bg:'#f5f3ff', val:'#7c3aed', ic:'#a78bfa' },
            green:  { bg:'#f0fdf4', val:'#16a34a', ic:'#4ade80' },
            red:    { bg:'#fff1f2', val:'#dc2626', ic:'#f87171' },
            orange: { bg:'#fff7ed', val:'#ea580c', ic:'#fb923c' },
        };
        const c = cm[color] || cm.blue;
        return `<div class="stat-card" style="background:${c.bg};border:1px solid ${c.ic}40;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:16px;color:${c.ic};">${icon}</span>
                <span style="font-size:11px;color:${c.val};font-weight:600;">${label}</span>
            </div>
            <div style="font-size:24px;font-weight:800;color:${c.val};line-height:1;">${value}</div>
            <div style="font-size:11px;color:${c.ic};margin-top:2px;">${unit}</div>
        </div>`;
    }

    // ── 사출 재고 분석 ────────────────────────────────────────────────
    function _analyzeInj() {
        const txList = Storage.getAll(INJ_STORE);

        // carModel||partName||color||lotNo → { stock, lastIn, lastOut, firstIn }
        const lotMap  = {};
        // carModel||partName||color → { stock, lastIn, lastOut, lastAny }
        const itemMap = {};

        txList.forEach(d => {
            const qty  = Number(d.quantity) || 0;
            const iKey = `${d.carModel||''}||${d.partName||''}||${d.color||''}`;
            const lKey = `${iKey}||${d.lotNo||''}`;

            // lotMap
            if (!lotMap[lKey]) lotMap[lKey] = {
                carModel: d.carModel||'', partName: d.partName||'', color: d.color||'', lotNo: d.lotNo||'',
                stock: 0, lastIn: null, lastOut: null
            };
            if (d.type === '출고') {
                lotMap[lKey].stock -= qty;
                if (!lotMap[lKey].lastOut || d.date > lotMap[lKey].lastOut) lotMap[lKey].lastOut = d.date;
            } else {
                lotMap[lKey].stock += qty;
                if (!lotMap[lKey].lastIn || d.date > lotMap[lKey].lastIn) lotMap[lKey].lastIn = d.date;
            }

            // itemMap
            if (!itemMap[iKey]) itemMap[iKey] = {
                carModel: d.carModel||'', partName: d.partName||'', color: d.color||'',
                stock: 0, lastIn: null, lastOut: null, lastAny: null, firstIn: null
            };
            if (d.type === '출고') {
                itemMap[iKey].stock -= qty;
                if (!itemMap[iKey].lastOut || d.date > itemMap[iKey].lastOut) itemMap[iKey].lastOut = d.date;
            } else {
                itemMap[iKey].stock += qty;
                if (!itemMap[iKey].lastIn || d.date > itemMap[iKey].lastIn) itemMap[iKey].lastIn = d.date;
                if (!itemMap[iKey].firstIn || d.date < itemMap[iKey].firstIn) itemMap[iKey].firstIn = d.date;
            }
            if (!itemMap[iKey].lastAny || d.date > itemMap[iKey].lastAny) itemMap[iKey].lastAny = d.date;
        });

        const items = Object.values(itemMap);
        const today = _today();

        // ① 재고 있는 품목
        const inStock = items.filter(i => i.stock > 0);

        // ② 재고 부족 (stock <= 0 but had records)
        const stockout = items.filter(i => i.stock <= 0 && i.firstIn);

        // ③ 장기재고: 재고 있고 마지막 출고(또는 입고) 후 INJ_LONG_DAYS 이상 지남
        const longStock = inStock.filter(i => {
            const refDate = i.lastOut || i.lastIn || i.lastAny;
            return refDate && _diffDays(refDate) >= INJ_LONG_DAYS;
        }).map(i => ({ ...i, daysSince: _diffDays(i.lastOut || i.lastIn || i.lastAny) }))
          .sort((a, b) => b.daysSince - a.daysSince);

        // ④ FIFO 위반: 품목 내 여러 LOT 중 구 LOT이 재고에 남아 있고 신 LOT이 먼저 소진된 경우
        const fifoIssues = [];
        const lotsByItem = {};
        Object.values(lotMap).forEach(l => {
            const iKey = `${l.carModel}||${l.partName}||${l.color}`;
            if (!lotsByItem[iKey]) lotsByItem[iKey] = [];
            lotsByItem[iKey].push(l);
        });
        Object.entries(lotsByItem).forEach(([iKey, lots]) => {
            const withLot = lots.filter(l => l.lotNo);
            if (withLot.length < 2) return;
            const inStockLots = withLot.filter(l => l.stock > 0).sort((a, b) => a.lotNo.localeCompare(b.lotNo));
            const consumedLots = withLot.filter(l => l.stock <= 0 && l.lastOut).sort((a, b) => a.lotNo.localeCompare(b.lotNo));
            // 구 LOT(낮은 번호)이 재고에 남아 있으면서, 신 LOT이 완전 소진된 경우
            if (inStockLots.length > 0 && consumedLots.length > 0) {
                const oldestInStock = inStockLots[0].lotNo;
                const newestConsumed = consumedLots[consumedLots.length - 1].lotNo;
                if (newestConsumed < oldestInStock) {
                    // 소진된 LOT 번호가 재고 LOT보다 낮음 → 정상
                    return;
                }
                // 소진된 LOT 번호가 재고 LOT보다 높음 → FIFO 위반
                const base = itemMap[iKey];
                if (base) fifoIssues.push({
                    ...base,
                    inStockLots,
                    consumedLots: consumedLots.filter(l => l.lotNo > oldestInStock)
                });
            }
        });

        // ⑤ 다중 LOT 재고 (FIFO 주의 품목)
        const multiLot = [];
        Object.entries(lotsByItem).forEach(([iKey, lots]) => {
            const active = lots.filter(l => l.stock > 0 && l.lotNo);
            if (active.length >= 2) {
                const base = itemMap[iKey];
                if (base) multiLot.push({ ...base, activeLots: active.sort((a, b) => a.lotNo.localeCompare(b.lotNo)) });
            }
        });

        return { items, inStock, stockout, longStock, fifoIssues, multiLot };
    }

    // ── 도료 재고 분석 ────────────────────────────────────────────────
    function _analyzePaint() {
        const txList   = Storage.getAll(PAINT_STORE);
        const matList  = Storage.getAll(PAINT_MAT);
        const today    = _today();
        const warn30   = new Date(today); warn30.setDate(warn30.getDate() + EXP_WARN_DAYS);
        const warnStr  = warn30.toISOString().slice(0, 10);

        // matId → { stock, lots: {lotKey->{qty,expDate,mfgDate,lotNo,prodLot,lastIn,lastOut}}, lastIn, lastOut, lastAny, firstIn }
        const matMap = {};

        txList.forEach(d => {
            if (!d.materialId) return;
            const qty = Number(d.quantity) || 0;
            const mid = d.materialId;
            if (!matMap[mid]) matMap[mid] = { stock: 0, lots: {}, lastIn: null, lastOut: null, lastAny: null, firstIn: null };
            const m = matMap[mid];
            const lotKey = d.prodLot || d.lotNo || '__';
            if (!m.lots[lotKey]) m.lots[lotKey] = {
                lotKey, prodLot: d.prodLot||'', lotNo: d.lotNo||'',
                qty: 0, expDate: d.expDate||'', mfgDate: d.mfgDate||'',
                lastIn: null, lastOut: null
            };
            const l = m.lots[lotKey];
            if (d.type === '출고') {
                m.stock -= qty; l.qty -= qty;
                if (!m.lastOut || d.date > m.lastOut) m.lastOut = d.date;
                if (!l.lastOut  || d.date > l.lastOut)  l.lastOut  = d.date;
            } else {
                m.stock += qty; l.qty += qty;
                if (!m.lastIn  || d.date > m.lastIn)  m.lastIn  = d.date;
                if (!m.firstIn || d.date < m.firstIn) m.firstIn = d.date;
                if (!l.lastIn  || d.date > l.lastIn)  l.lastIn  = d.date;
                if (d.expDate && (!l.expDate || d.expDate < l.expDate)) l.expDate = d.expDate;
            }
            if (!m.lastAny || d.date > m.lastAny) m.lastAny = d.date;
        });

        // 이름 매핑
        const matById = {};
        matList.forEach(m => matById[m.id] = m);

        // ① 유효기간 만료 재고 (stock > 0 & expDate < today)
        const expired = [];
        // ② 유효기간 임박 (stock > 0 & expDate within 30 days)
        const expiring = [];
        // ③ 장기재고
        const longStock = [];
        // ④ FIFO 위반 (LOT 재고 역순)
        const fifoIssues = [];

        Object.entries(matMap).forEach(([mid, m]) => {
            const mat = matById[mid];
            const name = mat ? mat.name : '미분류';
            const supplier = mat ? (mat.supplier || '-') : '-';
            const packUnit = mat ? (mat.packUnit || '') : '';

            // LOT별 활성 재고
            const activeLots = Object.values(m.lots).filter(l => l.qty > 0);

            activeLots.forEach(l => {
                if (!l.expDate) return;
                if (l.expDate < today) {
                    expired.push({ mid, name, supplier, packUnit, stock: l.qty, expDate: l.expDate, lotNo: l.lotNo||l.prodLot||'-', daysOver: _diffDays(l.expDate) });
                } else if (l.expDate <= warnStr) {
                    const daysLeft = Math.floor((new Date(l.expDate) - new Date(today)) / 86400000);
                    expiring.push({ mid, name, supplier, packUnit, stock: l.qty, expDate: l.expDate, lotNo: l.lotNo||l.prodLot||'-', daysLeft });
                }
            });

            // 장기재고: 재고 있고 마지막 출고 이후 PAINT_LONG_DAYS 이상
            if (m.stock > 0) {
                const refDate = m.lastOut || m.lastIn || m.lastAny;
                const daysSince = _diffDays(refDate);
                if (daysSince >= PAINT_LONG_DAYS) {
                    longStock.push({ mid, name, supplier, packUnit, stock: m.stock, daysSince, lastOut: m.lastOut, lastIn: m.lastIn });
                }
            }

            // FIFO 위반: 오래된 LOT(낮은 lotKey) 재고 남아 있고 신 LOT이 먼저 소진
            const allLots = Object.values(m.lots).filter(l => l.lotKey !== '__');
            if (allLots.length >= 2) {
                const inStockLots  = allLots.filter(l => l.qty > 0).sort((a, b) => a.lotKey.localeCompare(b.lotKey));
                const consumedLots = allLots.filter(l => l.qty <= 0 && l.lastOut).sort((a, b) => a.lotKey.localeCompare(b.lotKey));
                if (inStockLots.length > 0 && consumedLots.length > 0) {
                    const oldestIn    = inStockLots[0].lotKey;
                    const newestConsumed = consumedLots[consumedLots.length - 1].lotKey;
                    if (newestConsumed > oldestIn) {
                        // 소진된 LOT이 재고 LOT보다 신 LOT → FIFO 위반
                        fifoIssues.push({ mid, name, supplier, packUnit, stock: m.stock, inStockLots, consumedLots: consumedLots.filter(l => l.lotKey > oldestIn) });
                    }
                }
            }
        });

        expired.sort((a, b) => a.expDate.localeCompare(b.expDate));
        expiring.sort((a, b) => a.expDate.localeCompare(b.expDate));
        longStock.sort((a, b) => b.daysSince - a.daysSince);

        const inStockCount = Object.values(matMap).filter(m => m.stock > 0).length;
        const totalStock   = Object.values(matMap).reduce((s, m) => s + Math.max(0, m.stock), 0);

        return { matMap, matById, inStockCount, totalStock, expired, expiring, longStock, fifoIssues };
    }

    // ── 메인 렌더링 ───────────────────────────────────────────────────
    function render(container) {
        const inj   = _analyzeInj();
        const paint = _analyzePaint();

        const alertCount =
            inj.longStock.length + inj.fifoIssues.length +
            paint.expired.length + paint.expiring.length + paint.longStock.length + paint.fifoIssues.length;

        container.innerHTML = `
        <div class="fade-in-up">
            <!-- ① 진입 버튼 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
                ${_entryCard('사출 자재', '사출 부품 입출고 및 재고 현황',
                    'precision_manufacturing', 'var(--accent-blue)', 'injection-warehouse',
                    inj.longStock.length > 0 ? `장기재고 ${inj.longStock.length}건` : '',
                    inj.fifoIssues.length > 0 ? `FIFO위반 ${inj.fifoIssues.length}건` : '')}
                ${_entryCard('도료 자재', '도료 입출고 및 재고 · 유효기간 관리',
                    'palette', '#a855f7', 'paint-inventory',
                    paint.expired.length > 0 ? `유효기간만료 ${paint.expired.length}건` : '',
                    paint.expiring.length > 0 ? `임박 ${paint.expiring.length}건` : '')}
            </div>

            <!-- ② 사출 KPI -->
            <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.04em;">사출 자재 창고</div>
            <div class="stat-cards" style="margin-bottom:20px;">
                ${_kpi('재고 품목', inj.inStock.length, '종', 'blue', 'inventory_2')}
                ${_kpi('총 재고', _fmt(inj.inStock.reduce((s,i)=>s+i.stock,0)), 'EA', 'purple', 'widgets')}
                ${_kpi('재고 없음', inj.stockout.length, '종', inj.stockout.length>0?'orange':'green', 'production_quantity_limits')}
                ${_kpi('장기재고', inj.longStock.length, '종', inj.longStock.length>0?'red':'green', 'hourglass_top')}
                ${_kpi('FIFO 위반', inj.fifoIssues.length, '건', inj.fifoIssues.length>0?'red':'green', 'swap_vert')}
                ${_kpi('다중 LOT', inj.multiLot.length, '품목', inj.multiLot.length>0?'orange':'green', 'layers')}
            </div>

            <!-- ③ 도료 KPI -->
            <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.04em;">도료 자재 창고</div>
            <div class="stat-cards" style="margin-bottom:24px;">
                ${_kpi('재고 품목', paint.inStockCount, '종', 'blue', 'inventory_2')}
                ${_kpi('총 재고', _fmt(paint.totalStock), 'L/kg', 'purple', 'widgets')}
                ${_kpi('유효기간 만료', paint.expired.length, '건', paint.expired.length>0?'red':'green', 'event_busy')}
                ${_kpi('유효기간 임박', paint.expiring.length, '건', paint.expiring.length>0?'orange':'green', 'schedule')}
                ${_kpi('장기재고', paint.longStock.length, '종', paint.longStock.length>0?'orange':'green', 'hourglass_top')}
                ${_kpi('FIFO 위반', paint.fifoIssues.length, '건', paint.fifoIssues.length>0?'red':'green', 'swap_vert')}
            </div>

            <!-- ④ 알림 섹션 -->
            ${_paintExpiredHtml(paint.expired)}
            ${_paintExpiringHtml(paint.expiring)}
            ${_injFifoHtml(inj.fifoIssues)}
            ${_paintFifoHtml(paint.fifoIssues)}
            ${_injLongStockHtml(inj.longStock)}
            ${_paintLongStockHtml(paint.longStock)}
            ${_injMultiLotHtml(inj.multiLot)}

            <!-- ⑤ 사출 차종별 재고 현황 -->
            ${_injStockTableHtml(inj.inStock, inj.stockout)}

            <!-- ⑥ 도료 품목별 재고 현황 -->
            ${_paintStockTableHtml(paint.matMap, paint.matById)}

        </div>`;
    }

    // ── 진입 카드 ─────────────────────────────────────────────────────
    function _entryCard(title, desc, icon, color, page, badge1, badge2) {
        return `
        <div onclick="Router.navigate('${page}')"
            style="cursor:pointer;border-radius:12px;border:1px solid color-mix(in srgb, ${color} 38%, var(--border-color));
                border-left:6px solid ${color};
                background:linear-gradient(90deg,
                    color-mix(in srgb, ${color} 20%, #ffffff) 0%,
                    color-mix(in srgb, ${color} 10%, #ffffff) 42%,
                    var(--bg-card) 100%);
                padding:22px 24px;display:flex;align-items:center;gap:18px;
                transition:box-shadow .15s,transform .15s,border-color .15s;
                box-shadow:0 1px 4px rgba(0,0,0,.06);"
            onmouseenter="this.style.boxShadow='0 8px 22px rgba(37,99,235,.18)';this.style.transform='translateY(-2px)'"
            onmouseleave="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform=''">
            <div style="width:54px;height:54px;border-radius:12px;
                background:color-mix(in srgb, ${color} 18%, #ffffff);
                border:1px solid color-mix(in srgb, ${color} 35%, #ffffff);
                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <span class="material-symbols-outlined" style="font-size:28px;color:${color};">${icon}</span>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:16px;font-weight:800;margin-bottom:3px;">${title}</div>
                <div style="font-size:12px;color:var(--text-muted);">${desc}</div>
                ${(badge1||badge2) ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                    ${badge1 ? _badge(badge1,'danger') : ''}
                    ${badge2 ? _badge(badge2,'warning') : ''}
                </div>` : ''}
            </div>
            <span class="material-symbols-outlined" style="color:${color};font-size:22px;flex-shrink:0;">chevron_right</span>
        </div>`;
    }

    // ── 알림 카드 공통 래퍼 ───────────────────────────────────────────
    function _alertCard(title, count, icon, borderColor, bgColor, body) {
        return `
        <div class="card" style="border:2px solid ${borderColor};margin-bottom:16px;">
            <div class="card-header" style="background:${bgColor};border-bottom:1px solid ${borderColor};
                display:flex;align-items:center;gap:8px;padding:12px 18px;">
                <span class="material-symbols-outlined" style="color:${borderColor};font-size:18px;">${icon}</span>
                <span style="font-weight:700;color:${borderColor};font-size:14px;">${title}</span>
                <span style="background:${borderColor};color:#fff;border-radius:12px;padding:1px 10px;font-size:11px;font-weight:700;">${count}건</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">${body}</div>
            </div>
        </div>`;
    }

    // ── 도료 만료 ─────────────────────────────────────────────────────
    function _paintExpiredHtml(expired) {
        if (!expired.length) return '';
        const rows = expired.map(d => `
            <tr style="background:#fff1f2;">
                <td style="font-weight:700;">${d.name}</td>
                <td>${d.supplier}</td>
                <td style="font-family:monospace;font-size:12px;">${d.lotNo}</td>
                <td style="text-align:right;">${_fmt(d.stock)} ${d.packUnit}</td>
                <td style="text-align:center;">${d.expDate}</td>
                <td style="text-align:center;">${_badge(d.daysOver+'일 경과','danger')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" style="font-size:11px;"
                        onclick="Router.navigate('paint-inventory')">창고로 이동</button>
                </td>
            </tr>`).join('');
        return _alertCard('도료 유효기간 만료 — 즉시 처리 필요', expired.length,
            'event_busy', '#dc2626', 'rgba(220,38,38,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>도료명</th><th>공급사</th><th>LOT</th><th>재고수량</th><th>만료일</th><th>경과일</th><th>처리</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 도료 임박 ─────────────────────────────────────────────────────
    function _paintExpiringHtml(expiring) {
        if (!expiring.length) return '';
        const rows = expiring.map(d => `
            <tr style="background:#fff7ed;">
                <td style="font-weight:700;">${d.name}</td>
                <td>${d.supplier}</td>
                <td style="font-family:monospace;font-size:12px;">${d.lotNo}</td>
                <td style="text-align:right;">${_fmt(d.stock)} ${d.packUnit}</td>
                <td style="text-align:center;">${d.expDate}</td>
                <td style="text-align:center;">${_badge('D-'+d.daysLeft, d.daysLeft<=7?'danger':'warning')}</td>
            </tr>`).join('');
        return _alertCard(`도료 유효기간 임박 (${EXP_WARN_DAYS}일 이내)`, expiring.length,
            'schedule', '#ea580c', 'rgba(234,88,12,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>도료명</th><th>공급사</th><th>LOT</th><th>재고수량</th><th>만료일</th><th>남은일</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 사출 FIFO 위반 ────────────────────────────────────────────────
    function _injFifoHtml(issues) {
        if (!issues.length) return '';
        const rows = issues.map(d => {
            const inLots  = d.inStockLots.map(l  => `<span style="font-family:monospace;background:#fee2e2;border:1px solid #fca5a5;border-radius:3px;padding:0 5px;font-size:11px;font-weight:700;color:#dc2626;">${l.lotNo}</span>`).join(' ');
            const outLots = d.consumedLots.map(l => `<span style="font-family:monospace;background:#dcfce7;border:1px solid #86efac;border-radius:3px;padding:0 5px;font-size:11px;color:#15803d;">${l.lotNo}</span>`).join(' ');
            return `<tr style="background:#fff7ed;">
                <td style="font-weight:700;">${d.carModel}</td>
                <td>${d.partName}</td>
                <td>${d.color||'-'}</td>
                <td style="text-align:right;">${_fmt(d.stock)} EA</td>
                <td title="재고 남아 있는 구 LOT">${inLots}</td>
                <td title="이미 소진된 신 LOT">${outLots}</td>
            </tr>`;
        }).join('');
        return _alertCard('사출 FIFO 위반 — 구 LOT 재고 잔존', issues.length,
            'swap_vert', '#ea580c', 'rgba(234,88,12,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>차종</th><th>품명</th><th>색상</th><th>현 재고</th>
                    <th>재고 잔존 LOT (구)</th><th>소진 완료 LOT (신)</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 도료 FIFO 위반 ────────────────────────────────────────────────
    function _paintFifoHtml(issues) {
        if (!issues.length) return '';
        const rows = issues.map(d => {
            const inLots  = d.inStockLots.map(l  => `<span style="font-family:monospace;background:#fee2e2;border:1px solid #fca5a5;border-radius:3px;padding:0 5px;font-size:11px;color:#dc2626;font-weight:700;">${l.lotKey}</span>`).join(' ');
            const outLots = d.consumedLots.map(l => `<span style="font-family:monospace;background:#dcfce7;border:1px solid #86efac;border-radius:3px;padding:0 5px;font-size:11px;color:#15803d;">${l.lotKey}</span>`).join(' ');
            return `<tr style="background:#f5f3ff;">
                <td style="font-weight:700;">${d.name}</td>
                <td>${d.supplier}</td>
                <td>${d.packUnit}</td>
                <td style="text-align:right;">${_fmt(d.stock)}</td>
                <td title="재고 남아 있는 구 LOT">${inLots}</td>
                <td title="이미 소진된 신 LOT">${outLots}</td>
            </tr>`;
        }).join('');
        return _alertCard('도료 FIFO 위반 — 구 LOT 재고 잔존', issues.length,
            'swap_vert', '#7c3aed', 'rgba(124,58,237,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>도료명</th><th>공급사</th><th>용량</th><th>현 재고</th>
                    <th>재고 잔존 LOT (구)</th><th>소진 완료 LOT (신)</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 사출 장기재고 ─────────────────────────────────────────────────
    function _injLongStockHtml(longStock) {
        if (!longStock.length) return '';
        const rows = longStock.map(d => `
            <tr>
                <td style="font-weight:700;">${d.carModel}</td>
                <td>${d.partName}</td>
                <td>${d.color||'-'}</td>
                <td style="text-align:right;">${_fmt(d.stock)} EA</td>
                <td style="text-align:center;">${d.lastOut || '-'}</td>
                <td style="text-align:center;">${d.lastIn  || '-'}</td>
                <td style="text-align:center;">${_badge(d.daysSince+'일', d.daysSince>=90?'danger':d.daysSince>=60?'warning':'muted')}</td>
            </tr>`).join('');
        return _alertCard(`사출 장기재고 (${INJ_LONG_DAYS}일 이상 출고 없음)`, longStock.length,
            'hourglass_top', '#f59e0b', 'rgba(245,158,11,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>차종</th><th>품명</th><th>색상</th><th>현 재고</th>
                    <th>마지막 출고</th><th>마지막 입고</th><th>경과일</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 도료 장기재고 ─────────────────────────────────────────────────
    function _paintLongStockHtml(longStock) {
        if (!longStock.length) return '';
        const rows = longStock.map(d => `
            <tr>
                <td style="font-weight:700;">${d.name}</td>
                <td>${d.supplier}</td>
                <td>${d.packUnit}</td>
                <td style="text-align:right;">${_fmt(d.stock)}</td>
                <td style="text-align:center;">${d.lastOut || '-'}</td>
                <td style="text-align:center;">${d.lastIn  || '-'}</td>
                <td style="text-align:center;">${_badge(d.daysSince+'일', d.daysSince>=180?'danger':d.daysSince>=90?'warning':'muted')}</td>
            </tr>`).join('');
        return _alertCard(`도료 장기재고 (${PAINT_LONG_DAYS}일 이상 출고 없음)`, longStock.length,
            'hourglass_top', '#f59e0b', 'rgba(245,158,11,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>도료명</th><th>공급사</th><th>용량</th><th>현 재고</th>
                    <th>마지막 출고</th><th>마지막 입고</th><th>경과일</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 사출 다중 LOT ─────────────────────────────────────────────────
    function _injMultiLotHtml(multiLot) {
        if (!multiLot.length) return '';
        const rows = multiLot.map(d => {
            const lots = d.activeLots.map(l =>
                `<span style="display:inline-flex;align-items:center;gap:3px;margin:1px;
                    font-family:monospace;background:var(--bg-secondary);border:1px solid var(--border-color);
                    border-radius:3px;padding:1px 7px;font-size:11px;font-weight:600;">
                    ${l.lotNo} <span style="color:var(--text-muted);font-weight:400;">(${_fmt(l.stock)})</span>
                </span>`
            ).join('');
            return `<tr>
                <td style="font-weight:700;">${d.carModel}</td>
                <td>${d.partName}</td>
                <td>${d.color||'-'}</td>
                <td style="text-align:right;">${_fmt(d.stock)} EA</td>
                <td>${lots}</td>
            </tr>`;
        }).join('');
        return _alertCard('사출 다중 LOT 재고 — FIFO 확인 필요', multiLot.length,
            'layers', '#2563eb', 'rgba(37,99,235,.05)',
            `<table class="data-table" style="font-size:12px;">
                <thead><tr><th>차종</th><th>품명</th><th>색상</th><th>총 재고</th><th>LOT별 재고 현황</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`);
    }

    // ── 사출 차종별 재고 요약 ─────────────────────────────────────────
    function _injStockTableHtml(inStock, stockout) {
        if (!inStock.length && !stockout.length) return '';
        const byModel = {};
        inStock.forEach(i => {
            const k = i.carModel || '(미상)';
            if (!byModel[k]) byModel[k] = { parts: 0, totalStock: 0 };
            byModel[k].parts++;
            byModel[k].totalStock += i.stock;
        });
        const rows = Object.entries(byModel)
            .sort((a, b) => b[1].totalStock - a[1].totalStock)
            .map(([cm, v]) => `
                <tr>
                    <td style="font-weight:700;">${cm}</td>
                    <td style="text-align:center;">${v.parts}</td>
                    <td style="text-align:right;">${_fmt(v.totalStock)} EA</td>
                </tr>`).join('');
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="padding:12px 18px;display:flex;align-items:center;gap:8px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);font-size:18px;">directions_car</span>
                <span style="font-weight:700;font-size:14px;">사출 — 차종별 재고 현황</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr><th>차종</th><th style="text-align:center;">품목 수</th><th style="text-align:right;">총 재고</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── 도료 품목별 재고 요약 ─────────────────────────────────────────
    function _paintStockTableHtml(matMap, matById) {
        const items = Object.entries(matMap)
            .filter(([, m]) => m.stock > 0)
            .map(([mid, m]) => {
                const mat = matById[mid];
                const expDates = Object.values(m.lots).filter(l => l.qty > 0 && l.expDate).map(l => l.expDate).sort();
                const minExp   = expDates[0] || null;
                const today    = _today();
                let expBadge   = '';
                if (minExp) {
                    if (minExp < today) expBadge = _badge('만료', 'danger');
                    else {
                        const dl = Math.floor((new Date(minExp)-new Date(today))/86400000);
                        if (dl <= EXP_WARN_DAYS) expBadge = _badge('D-'+dl, dl<=7?'danger':'warning');
                    }
                }
                return { mid, name: mat?mat.name:'미분류', supplier: mat?(mat.supplier||'-'):'-',
                         packUnit: mat?(mat.packUnit||''):'-', stock: m.stock, minExp, expBadge,
                         lotCount: Object.values(m.lots).filter(l=>l.qty>0).length };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        if (!items.length) return '';
        const rows = items.map(d => `
            <tr>
                <td style="font-weight:700;">${d.name}</td>
                <td>${d.supplier}</td>
                <td>${d.packUnit}</td>
                <td style="text-align:right;">${_fmt(d.stock)}</td>
                <td style="text-align:center;">${d.lotCount}</td>
                <td style="text-align:center;">${d.minExp||'-'}</td>
                <td style="text-align:center;">${d.expBadge}</td>
            </tr>`).join('');
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="padding:12px 18px;display:flex;align-items:center;gap:8px;">
                <span class="material-symbols-outlined" style="color:#a855f7;font-size:18px;">palette</span>
                <span style="font-weight:700;font-size:14px;">도료 — 품목별 재고 현황</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr><th>도료명</th><th>공급사</th><th>포장용량</th>
                            <th style="text-align:right;">현 재고</th><th style="text-align:center;">활성 LOT</th>
                            <th style="text-align:center;">최근 만료일</th><th style="text-align:center;">상태</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    return { init: render, render };
})();
