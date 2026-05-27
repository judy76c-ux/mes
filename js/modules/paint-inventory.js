/**
 * 도료창고(입출고/재고현황) 모듈
 * 도료의 입출고 내역을 관리하고, 선입선출(FIFO)을 위한 재고 집계 및 경고 기능을 포함합니다.
 */

const PaintInventoryModule = (function() {
    const STORE          = DB.STORES.PAINT_INVENTORY;
    const MATERIALS_STORE = DB.STORES.PAINT_MATERIALS;

    // 페이지네이션 상태
    let _page     = 1;
    let _pageSize = 50;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="Router.navigate('paint-layout')"
                            title="도료 보관 창고 배치 레이아웃을 시각적으로 편집합니다.">
                            <span class="material-symbols-outlined">map</span> 레이아웃
                        </button>
                        <button class="btn btn-primary" onclick="PaintInventoryModule.openIncomingModal()">
                            <span class="material-symbols-outlined">login</span> 도료 입고
                        </button>
                        <button class="btn btn-danger" onclick="PaintInventoryModule.openOutgoingModal()">
                            <span class="material-symbols-outlined">logout</span> 도료 출고
                        </button>
                        <button class="btn btn-outline" style="margin-left:auto;"
                            onclick="PaintInventoryModule.openBulkModal()"
                            title="관리자만 도료 창고 재고를 일괄 등록 및 전체 교체할 수 있습니다.">
                            <span class="material-symbols-outlined">admin_panel_settings</span> 일괄 등록 및 수정
                        </button>
                    </div>
                </div>

                <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-purple,#8b5cf6);">
                    <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="display:flex; align-items:center; gap:8px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-purple,#8b5cf6);">move_to_inbox</span>
                            도료 창고 입고 대기품
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(도료 수입 검사 완료품)</span>
                            <span id="paintInspStandbyBadge" style="font-size:0.78rem; background:var(--accent-orange,#f59e0b); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600; display:none;"></span>
                        </h4>
                        <button class="btn btn-sm btn-outline" onclick="PaintInventoryModule.renderPaintInspStandby()">
                            <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                        </button>
                    </div>
                    <div class="card-body" id="paintInspStandbyBody" style="padding:0;"></div>
                </div>

                <div class="stat-cards" id="paintInvStats"></div>

                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">palette</span> 공급사별 재고 현황</h4>
                        <button class="btn btn-sm btn-outline" onclick="PaintInventoryModule.renderSupplierTiles()">
                            <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                        </button>
                    </div>
                    <div class="card-body">
                        <div id="paintSupplierTiles" style="display:flex; gap:12px; align-items:flex-start;"></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>날짜</th>
                                        <th>구매처</th>
                                        <th>도료명</th>
                                        <th>포장 단위</th>
                                        <th>제조사 LOT</th>
                                        <th>제조 LOT</th>
                                        <th>수량</th>
                                        <th>제조일자</th>
                                        <th>유효기간</th>
                                        <th>잔여 유효기간</th>
                                        <th>유형</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="paintInvTableBody"></tbody>
                            </table>
                        </div>
                        <div id="paintInvPagination"></div>
                    </div>
                </div>
            </div>
        `;
        loadData();
    }

    function loadData() {
        const allData  = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        const isOutgoing = d => d.type === '출고' || d.type === '???';
        const byMaterial = {};
        allData.forEach(d => {
            const mat = materials.find(m => m.id === d.materialId);
            const key = mat ? (mat.name + (mat.color ? ' (' + mat.color + ')' : '')) : '미분류';
            if (!byMaterial[key]) byMaterial[key] = {
                qty: 0,
                packUnit: mat ? (mat.packUnit || '-') : '-'
            };
            byMaterial[key].qty += isOutgoing(d) ? -(Number(d.quantity) || 0) : (Number(d.quantity) || 0);
        });

        let totalStockValue = 0;
        allData.forEach(d => {
            const mat = materials.find(m => m.id === d.materialId);
            const price = Number(mat ? mat.purchasePrice : 0) || 0;
            const qty = Number(d.quantity) || 0;
            totalStockValue += isOutgoing(d) ? -(qty * price) : (qty * price);
        });

        const totalStock    = Object.values(byMaterial).reduce((s, v) => s + v.qty, 0);
        const materialCount = materials.length;
        const stockQtyByMaterialId = {};
        allData.forEach(d => {
            if (!d.materialId) return;
            if (!stockQtyByMaterialId[d.materialId]) stockQtyByMaterialId[d.materialId] = 0;
            const qty = Number(d.quantity) || 0;
            stockQtyByMaterialId[d.materialId] += isOutgoing(d) ? -qty : qty;
        });
        const zeroStockCount = materials.filter(m => (stockQtyByMaterialId[m.id] || 0) <= 0).length;

        document.getElementById('paintInvStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재고 합산</div>
            </div>
            <div class="stat-card green" style="border-bottom: 4px solid var(--accent-green);">
                <div class="stat-card-value" style="color:var(--accent-green);">${UIUtils.formatNumber(totalStockValue)}</div>
                <div class="stat-card-label">총 재고 금액 (원)</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${materialCount}</div>
                <div class="stat-card-label">분류 수</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value" style="color:var(--accent-red);">${UIUtils.formatNumber(zeroStockCount)}</div>
                <div class="stat-card-label">재고 없는 품목</div>
            </div>
        `;
        setTimeout(() => {
            renderPaintInspStandby();
            renderSupplierTiles();
        }, 150);

        const { data, total, page, pageSize } = Storage.getAllPaged(STORE, {
            page:     _page,
            pageSize: _pageSize,
            sort:     { field: 'date', order: 'desc' }
        });
        _page = page;

        const tbody = document.getElementById('paintInvTableBody');

        if (total === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>`;
            const pEl = document.getElementById('paintInvPagination');
            if (pEl) pEl.innerHTML = '';
            return;
        }

        if (tbody) tbody.innerHTML = data.map(d => {
            const typeBadge = isOutgoing(d) ? 'danger' : 'success';
            const mat = materials.find(m => m.id === d.materialId);
            const mName = mat ? mat.name : '-';
            const mPackUnit = mat ? (mat.packUnit ? mat.packUnit + ' KG' : '-') : '-';
            const mSupplier = mat ? (mat.supplier || '-') : '-';

            let remainHtml = '-';
            if (d.expDate) {
                const today = new Date(); today.setHours(0,0,0,0);
                const exp   = new Date(d.expDate); exp.setHours(0,0,0,0);
                const diffDays = Math.round((exp - today) / 86400000);
                if (diffDays < 0) {
                    remainHtml = `<span style="color:var(--accent-red);font-weight:700;">만료 (${Math.abs(diffDays)}일 경과)</span>`;
                } else if (diffDays === 0) {
                    remainHtml = `<span style="color:var(--accent-red);font-weight:700;">오늘 만료</span>`;
                } else if (diffDays <= 30) {
                    remainHtml = `<span style="color:var(--accent-orange,#f59e0b);font-weight:700;">${diffDays}일 남음</span>`;
                } else {
                    remainHtml = `<span style="color:var(--accent-green);">${diffDays}일 남음</span>`;
                }
            }

            return `
                <tr>
                    <td>${d.date || '-'}</td>
                    <td>${mSupplier}</td>
                    <td><strong>${mName}</strong></td>
                    <td>${mPackUnit}</td>
                    <td style="font-family:monospace;">${d.lotNo || '-'}</td>
                    <td style="font-family:monospace;color:var(--text-secondary);">${d.prodLot || '-'}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                    <td style="font-size:0.82rem;">${d.mfgDate || '-'}</td>
                    <td style="font-size:0.82rem;">${d.expDate || '-'}</td>
                    <td style="font-size:0.82rem; white-space:nowrap;">${remainHtml}</td>
                    <td>${UIUtils.badge(isOutgoing(d) ? '출고' : '입고', typeBadge)}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="PaintInventoryModule.edit('${d.id}')">수정</button>
                        <button onclick="PaintInventoryModule.remove('${d.id}')"
                            title="삭제"
                            style="margin-left:6px;padding:2px 6px;font-size:0.72rem;border:1px solid var(--border-color);border-radius:4px;background:transparent;color:var(--text-muted);opacity:0.35;cursor:pointer;transition:opacity 0.2s;"
                            onmouseenter="this.style.opacity='1';this.style.color='var(--accent-red)';this.style.borderColor='var(--accent-red)';"
                            onmouseleave="this.style.opacity='0.35';this.style.color='var(--text-muted)';this.style.borderColor='var(--border-color)';">
                            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        const paginationEl = document.getElementById('paintInvPagination');
        if (paginationEl) {
            UIUtils.renderPagination(paginationEl, {
                total,
                page,
                pageSize,
                id:        'paintInv',
                pageSizes: [20, 50, 100, 200],
                onChange:  (newPage, newPageSize) => {
                    _page     = newPage;
                    _pageSize = newPageSize;
                    loadData();
                }
            });
        }
    }

    function _buildSupplierCard(supplier, matItems) {
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const rows = matItems
            .sort((a, b) => (a.paintType || '').localeCompare(b.paintType || '') || a.name.localeCompare(b.name))
            .map(item => {
                // ?좏슚湲곌컙 寃쎄퀬 ?쒖떆
                let expHtml = '';
                if (item.minExpDate) {
                    const exp = new Date(item.minExpDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    if (diff < 0) {
                        expHtml = `<span title="?좏슚湲곌컙 留뚮즺" style="color:var(--accent-red);font-size:0.75rem;font-weight:700;margin-left:4px;">?좊쭔猷?/span>`;
                    } else if (diff <= 30) {
                        expHtml = `<span title="${diff}???⑥쓬" style="color:var(--accent-orange,#f59e0b);font-size:0.75rem;font-weight:700;margin-left:4px;">??{diff}??/span>`;
                    }
                }
                // ?좏삎 諭껋? (Primer/Color/?ъ꽍????
                const typeColors = { 'Primer': '#6366f1', 'Color': '#ec4899' };
                const typeBg = typeColors[item.paintType] || '#6b7280';
                const typeBadge = item.paintType
                    ? `<span style="font-size:0.68rem;background:${typeBg};color:#fff;border-radius:3px;padding:1px 5px;margin-right:4px;">${item.paintType}</span>`
                    : '';

                // ?쒖꽦 LOT ?몃씪??諭껋? (?꾨즺紐낃낵 媛숈? ??
                const lotBadges = item.activeLots.map(lot => {
                    const label = lot.prodLot || lot.lotNo || '-';
                    let lotColor = 'var(--text-muted)';
                    let lotBorder = 'var(--border-color)';
                    if (lot.expDate) {
                        const exp = new Date(lot.expDate); exp.setHours(0,0,0,0);
                        const diff = Math.round((exp - today) / 86400000);
                        if (diff < 30) { lotColor = 'var(--accent-red)'; lotBorder = 'var(--accent-red)'; }
                    }
                    return `<span style="font-size:0.68rem; font-family:monospace; background:var(--bg-secondary);
                                border:1px solid ${lotBorder}; border-radius:3px;
                                padding:0 4px; margin-left:4px; color:${lotColor}; white-space:nowrap;">${label}</span>`;
                }).join('');

                return `
                    <tr style="cursor:pointer; border-top:1px solid var(--border-color);"
                        onclick="PaintInventoryModule.showPaintDetail('${item.matId}')"
                        onmouseover="this.style.background='var(--bg-secondary)'"
                        onmouseout="this.style.background=''">
                        <td style="padding:5px 8px; font-size:0.82rem;">
                            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:2px;">
                                ${typeBadge}<span style="font-weight:600;">${item.name}</span>${expHtml}${lotBadges}
                            </div>
                        </td>
                        <td style="padding:5px 8px; font-size:0.82rem; color:var(--text-muted); text-align:center;">
                            ${item.packUnit ? item.packUnit + 'KG' : '-'}
                        </td>
                        <td style="padding:5px 8px; font-size:0.85rem; font-weight:700; text-align:right;
                                   color:${item.stock > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">
                            ${UIUtils.formatNumber(item.stock)}
                        </td>
                    </tr>
                `;
            }).join('');

        const totalStock = matItems.reduce((s, i) => s + i.stock, 0);
        const hasExpWarn = matItems.some(i => i.minExpDate && (() => {
            const d = Math.round((new Date(i.minExpDate) - today) / 86400000);
            return d <= 30;
        })());

        return `
            <div style="border:1px solid var(--border-color); border-radius:6px;
                        overflow:hidden; background:var(--bg-primary); margin-bottom:12px;">
                <div style="background:linear-gradient(135deg,#a78bfa,#7c3aed); padding:7px 10px;
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:0.9rem; color:#fff;">
                        ${hasExpWarn ? '??' : ''}${supplier}
                    </span>
                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.85); font-weight:600;">
                        ${matItems.length}醫?
                    </span>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--bg-secondary);">
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:left;">?꾨즺紐?/ ?쒖“LOT</th>
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:center;">?ъ옣</th>
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:right;">?ш퀬</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="padding:5px 8px; background:var(--bg-secondary);
                            border-top:2px solid var(--border-color);
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.78rem; color:var(--text-muted);">?⑷퀎</span>
                    <span style="font-size:0.88rem; font-weight:800; color:var(--accent-blue);">
                        ${UIUtils.formatNumber(totalStock)} 媛?
                    </span>
                </div>
            </div>
        `;
    }

    // ?? 怨듦툒?щ퀎 ?ш퀬 ???(Greedy bin-packing) ???????????????????????
    function renderSupplierTiles() {
        const tilesEl = document.getElementById('paintSupplierTiles');
        if (!tilesEl) return;

        const data      = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        // ?? ?щ즺蹂????ш퀬 + LOT蹂?吏묎퀎 ????????????????????????????
        const matStock = {};  // matId -> { stock, lots: {key->{prodLot,lotNo,qty,expDate}} }
        data.forEach(d => {
            if (!d.materialId) return;
            if (!matStock[d.materialId]) matStock[d.materialId] = { stock: 0, lots: {} };
            const qty = Number(d.quantity) || 0;
            // ?쒖“ LOT(prodLot) ?곗꽑, ?놁쑝硫??쒖“??LOT(lotNo) ?ㅻ줈 援щ텇
            const lotKey = (d.prodLot || d.lotNo || '__');
            if (!matStock[d.materialId].lots[lotKey]) {
                matStock[d.materialId].lots[lotKey] = {
                    prodLot: d.prodLot || '',
                    lotNo:   d.lotNo   || '',
                    qty: 0,
                    expDate: d.expDate || ''
                };
            }
            if (d.type === '異쒓퀬') {
                matStock[d.materialId].stock -= qty;
                matStock[d.materialId].lots[lotKey].qty -= qty;
            } else {
                matStock[d.materialId].stock += qty;
                matStock[d.materialId].lots[lotKey].qty += qty;
                if (d.expDate && (!matStock[d.materialId].lots[lotKey].expDate ||
                    d.expDate < matStock[d.materialId].lots[lotKey].expDate)) {
                    matStock[d.materialId].lots[lotKey].expDate = d.expDate;
                }
            }
        });

        // ?쒖꽦 LOT ?뺣젹 + 理쒖냼 ?좏슚湲곌컙
        Object.keys(matStock).forEach(mid => {
            const activeLots = Object.values(matStock[mid].lots)
                .filter(l => l.qty > 0)
                .sort((a, b) => (a.prodLot || a.lotNo).localeCompare(b.prodLot || b.lotNo));
            matStock[mid].activeLots = activeLots;
            const withExp = activeLots.filter(l => l.expDate);
            matStock[mid].minExpDate = withExp.length > 0 ? withExp.map(l => l.expDate).sort()[0] : null;
        });

        // ?? 怨듦툒?щ퀎 洹몃９??(?ш퀬 > 0) ?????????????????????????????
        const bySupplier = {};
        materials.forEach(mat => {
            const ms = matStock[mat.id] || { stock: 0, activeLots: [], minExpDate: null };
            const sup = mat.supplier || '미분류';
            if (!bySupplier[sup]) bySupplier[sup] = [];
            bySupplier[sup].push({
                matId:      mat.id,
                name:       mat.name      || '-',
                paintType:  mat.paintType || mat.type || '',
                packUnit:   mat.packUnit  || '',
                stock:      ms.stock,
                activeLots: ms.activeLots || [],
                minExpDate: ms.minExpDate
            });
        });

        const entries = Object.entries(bySupplier);
        if (entries.length === 0) {
            tilesEl.innerHTML = `<p style="color:var(--text-muted); padding:20px;">?ш퀬 ?곗씠?곌? ?놁뒿?덈떎.</p>`;
            return;
        }

        // ?덈ぉ ???대┝李⑥닚 ?뺣젹
        entries.sort(([, a], [, b]) => b.length - a.length || a[0].name.localeCompare(b[0].name));

        // 而щ읆 ??寃곗젙
        const total = entries.length;
        const COLS = total <= 2 ? total : total <= 6 ? 3 : 4;

        // Greedy bin-packing
        const cols    = Array.from({ length: COLS }, () => []);
        const heights = Array(COLS).fill(0);
        for (const [supplier, items] of entries) {
            const minIdx = heights.indexOf(Math.min(...heights));
            cols[minIdx].push([supplier, items]);
            heights[minIdx] += items.length + 1;
        }

        tilesEl.innerHTML = cols.map(colCards => `
            <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
                ${colCards.map(([supplier, items]) => _buildSupplierCard(supplier, items)).join('')}
            </div>
        `).join('');
    }

    // ?? ?꾨즺 ?덈ぉ ?곸꽭 ?앹뾽 ???????????????????????????????????????????
    function showPaintDetail(matId) {
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (!mat) { UIUtils.toast('?꾨즺 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.', 'error'); return; }

        const data = Storage.getAll(STORE);
        const records = data
            .filter(d => d.materialId === matId)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // ?꾩옱 ?ш퀬 諛?LOT蹂?吏묎퀎
        let totalStock = 0;
        const lotMap = {};
        records.forEach(d => {
            const qty = Number(d.quantity) || 0;
            const key = d.prodLot || d.lotNo || '__';
            if (!lotMap[key]) lotMap[key] = {
                prodLot: d.prodLot || '',
                lotNo:   d.lotNo   || '',
                mfgDate: d.mfgDate || '',
                expDate: d.expDate || '',
                qty: 0
            };
            if (d.type === '異쒓퀬') { lotMap[key].qty -= qty; totalStock -= qty; }
            else                   { lotMap[key].qty += qty; totalStock += qty;
                if (d.mfgDate && (!lotMap[key].mfgDate || d.mfgDate < lotMap[key].mfgDate))
                    lotMap[key].mfgDate = d.mfgDate;
                if (d.expDate && (!lotMap[key].expDate || d.expDate < lotMap[key].expDate))
                    lotMap[key].expDate = d.expDate;
            }
        });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const price = Number(mat.purchasePrice || 0);
        const stockValue = totalStock * price;

        // ?쒖꽦 LOT ??
        const activeLots = Object.values(lotMap)
            .filter(l => l.qty > 0)
            .sort((a, b) => (a.prodLot || a.lotNo).localeCompare(b.prodLot || b.lotNo));

        const lotRows = activeLots.length > 0
            ? activeLots.map(l => {
                let expHtml = '-';
                if (l.expDate) {
                    const exp = new Date(l.expDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    const color = diff < 0 ? 'var(--accent-red)' : diff <= 30 ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-green)';
                    expHtml = `<span style="color:${color};font-weight:600;">${l.expDate} (${diff < 0 ? '留뚮즺' : diff + '???⑥쓬'})</span>`;
                }
                const prodLotEsc = (l.prodLot || '').replace(/'/g, "\\'");
                const lotNoEsc   = (l.lotNo   || '').replace(/'/g, "\\'");
                return `
                    <tr style="cursor:pointer;" title="?대┃?섏뿬 異쒓퀬 ?깅줉"
                        onclick="PaintInventoryModule._openDetailOutgoing('${matId}','${prodLotEsc}','${lotNoEsc}',${l.qty})"
                        onmouseover="this.style.background='rgba(239,68,68,0.07)'"
                        onmouseout="this.style.background=''">
                        <td style="font-family:monospace;font-weight:700;">${l.prodLot || '-'}</td>
                        <td style="font-family:monospace;color:var(--text-muted);">${l.lotNo || '-'}</td>
                        <td style="text-align:center;">${l.mfgDate || '-'}</td>
                        <td>${expHtml}</td>
                        <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(l.qty)}</td>
                        <td style="text-align:center;padding:4px 8px;">
                            <span style="font-size:0.7rem;background:#fee2e2;color:#dc2626;border-radius:4px;padding:2px 6px;white-space:nowrap;">異쒓퀬</span>
                        </td>
                    </tr>`;
            }).join('')
            : `<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-muted);">?ш퀬 ?놁쓬</td></tr>`;

        // ?낆텧怨??대젰 (理쒓렐 15嫄?
        const histRows = records.slice(0, 15).map(d => {
            const qty = Number(d.quantity) || 0;
            const badge = d.type === '異쒓퀬'
                ? `<span style="background:#fee2e2;color:#dc2626;padding:1px 7px;border-radius:4px;font-size:0.75rem;font-weight:600;">異쒓퀬</span>`
                : `<span style="background:#dcfce7;color:#16a34a;padding:1px 7px;border-radius:4px;font-size:0.75rem;font-weight:600;">?낃퀬</span>`;
            return `
                <tr>
                    <td style="white-space:nowrap;">${(d.date || '-').slice(0, 10)}</td>
                    <td style="font-family:monospace;">${d.prodLot || '-'}</td>
                    <td style="font-family:monospace;color:var(--text-muted);">${d.lotNo || '-'}</td>
                    <td style="text-align:right;font-weight:600;color:${d.type === '異쒓퀬' ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${d.type === '異쒓퀬' ? '-' : '+'}${UIUtils.formatNumber(qty)}
                    </td>
                    <td>${badge}</td>
                </tr>`;
        }).join('') || `<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-muted);">?대젰 ?놁쓬</td></tr>`;

        const typeColors = { 'Primer': '#6366f1', 'Color': '#ec4899' };
        const typeBg  = typeColors[mat.paintType || mat.type || ''] || '#6b7280';
        const typeBadge = (mat.paintType || mat.type)
            ? `<span style="font-size:0.75rem;background:${typeBg};color:#fff;border-radius:4px;padding:2px 8px;margin-right:6px;">${mat.paintType || mat.type}</span>`
            : '';

        UIUtils.showModal(
            `?렓 ${mat.name}`,
            `
            <!-- 湲곕낯 ?뺣낫 -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding:12px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span>${typeBadge}<strong>${mat.name}</strong></span>
                <span style="color:var(--text-muted);">|</span>
                <span>怨듦툒?? <strong>${mat.supplier || '-'}</strong></span>
                <span style="color:var(--text-muted);">|</span>
                <span>?ъ옣: <strong>${mat.packUnit ? mat.packUnit + ' KG' : '-'}</strong></span>
                ${price > 0 ? `<span style="color:var(--text-muted);">|</span><span>?④?: <strong>${UIUtils.formatNumber(price)}??/strong></span>` : ''}
            </div>
            <!-- ?붿빟 移대뱶 -->
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(totalStock)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">?꾩옱 ?ш퀬 (媛?</div>
                </div>
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple,#7c3aed);">${activeLots.length}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">?쒖꽦 LOT ??/div>
                </div>
                ${price > 0 ? `
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(stockValue)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">?ш퀬 湲덉븸 (??</div>
                </div>` : ''}
            </div>
            <!-- ?쒖꽦 LOT ?뚯씠釉?-->
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--text-primary);">
                ?벀 ?꾩옱 蹂댁쑀 LOT
            </div>
            <div style="overflow-x:auto;margin-bottom:18px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>?쒖“ LOT</th>
                            <th>?쒖“??LOT</th>
                            <th style="text-align:center;">?쒖“?쇱옄</th>
                            <th>?좏슚湲곌컙</th>
                            <th style="text-align:right;">?ш퀬 ?섎웾</th>
                            <th style="text-align:center;">異쒓퀬</th>
                        </tr>
                    </thead>
                    <tbody>${lotRows}</tbody>
                </table>
            </div>
            <!-- ?낆텧怨??대젰 -->
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--text-primary);">
                ?뱥 ?낆텧怨??대젰 <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">(理쒓렐 15嫄?</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>?좎쭨</th>
                            <th>?쒖“ LOT</th>
                            <th>?쒖“??LOT</th>
                            <th style="text-align:right;">?섎웾</th>
                            <th style="text-align:center;">?좏삎</th>
                        </tr>
                    </thead>
                    <tbody>${histRows}</tbody>
                </table>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">?リ린</button>`,
            'lg'
        );
    }

    // ?? ?꾨즺 ?곸꽭 ?앹뾽?먯꽌 LOT ?대┃ ??利됱떆 異쒓퀬 ?깅줉 ????????????????
    async function _openDetailOutgoing(matId, prodLot, lotNo, currentQty) {
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (!mat) { UIUtils.toast('?꾨즺 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.', 'error'); return; }

        const todayStr = UIUtils.today();
        const qtyMax   = Number(currentQty) || 0;
        const lotLabel = prodLot || lotNo || '-';

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);">output</span> ?꾨즺 異쒓퀬 ?깅줉`,
            `<div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span style="font-weight:700;">${mat.name}</span>
                <span style="color:var(--text-muted);margin:0 8px;">|</span>
                <span>?쒖“ LOT: <strong style="font-family:monospace;">${lotLabel}</strong></span>
                <span style="color:var(--text-muted);margin:0 8px;">|</span>
                <span>?꾩옱 ?ш퀬: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(qtyMax)} 媛?/strong></span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">異쒓퀬 ?쇱옄 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="detailOutDate" value="${todayStr}">
                </div>
                <div class="form-group">
                    <label class="form-label">異쒓퀬 ?섎웾 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="detailOutQty" min="1" max="${qtyMax}"
                           placeholder="理쒕? ${UIUtils.formatNumber(qtyMax)}"
                           oninput="this.value=Math.min(Math.max(this.value,1),${qtyMax})">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">鍮꾧퀬 (?좏깮)</label>
                <input type="text" class="form-input" id="detailOutMemo" placeholder="異쒓퀬 ?⑸룄 ?먮뒗 硫붾え">
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">痍⑥냼</button>
             <button class="btn btn-primary" onclick="PaintInventoryModule._saveDetailOutgoing('${matId}','${prodLot}','${lotNo}')">異쒓퀬 ?깅줉</button>`
        );

        setTimeout(() => {
            const qtyInput = document.getElementById('detailOutQty');
            if (qtyInput) qtyInput.focus();
        }, 100);
    }

    async function _saveDetailOutgoing(matId, prodLot, lotNo) {
        const date  = (document.getElementById('detailOutDate') || {}).value || '';
        const qty   = Number((document.getElementById('detailOutQty') || {}).value) || 0;
        const memo  = (document.getElementById('detailOutMemo') || {}).value?.trim() || '';

        if (!date) { UIUtils.toast('異쒓퀬 ?쇱옄瑜??좏깮?섏꽭??', 'warning'); return; }
        if (qty <= 0) { UIUtils.toast('異쒓퀬 ?섎웾???낅젰?섏꽭??', 'warning'); return; }

        // ?꾩옱 ?ш퀬 ?ш?利?
        const allLogs = Storage.getAll(STORE);
        const lotLogs = allLogs.filter(l =>
            l.materialId === matId &&
            (l.prodLot || l.lotNo) === (prodLot || lotNo)
        );
        const stockIn  = lotLogs.filter(l => l.type === '?낃퀬').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const stockOut = lotLogs.filter(l => l.type === '異쒓퀬').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const available = stockIn - stockOut;

        if (qty > available) {
            UIUtils.toast(`재고 부족: 출고 가능 수량 ${UIUtils.formatNumber(available)}개`, 'error');
            return;
        }

        const data = {
            date:       date,
            type:       '異쒓퀬',
            materialId: matId,
            prodLot:    prodLot || '',
            lotNo:      lotNo   || prodLot || '',
            quantity:   qty,
            mfgDate:    '',
            expDate:    '',
            memo:       memo,
            sourceInspectionId: ''
        };

        // executeTransaction: ?⑥씪 ?ㅽ넗?댁?留??ν썑 ?곌? ?ㅽ넗??異붽?瑜??鍮꾪빐 ?듭씪
        await Storage.executeTransaction([
            { store: STORE, op: 'add', data }
        ]);
        UIUtils.toast('異쒓퀬 ?깅줉?섏뿀?듬땲??', 'success');
        // 異쒓퀬 紐⑤떖 ?リ린 ???곸쐞 ?곸꽭 ?앹뾽???リ퀬 理쒖떊 ?곹깭濡??ㅼ떆 ?닿린
        UIUtils.closeModal(); // 異쒓퀬 ?깅줉 紐⑤떖
        UIUtils.closeModal(); // ?곸꽭 ?앹뾽
        loadData();
        setTimeout(() => showPaintDetail(matId), 150);
    }

    // ?? ?꾨즺 ?섏엯 寃???꾨즺???낃퀬 ?湲??뱀뀡 ??????????????????????????
    function renderPaintInspStandby() {
        const body  = document.getElementById('paintInspStandbyBody');
        const badge = document.getElementById('paintInspStandbyBadge');
        if (!body) return;

        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.PAINT_INVENTORY)           || [];
        const materials   = Storage.getAll(DB.STORES.PAINT_MATERIALS)           || [];

        const passed = inspections
            .filter(i => {
                const verdictText = String(i.verdict || '');
                const isPassed = verdictText === '??' || verdictText.includes('?') || verdictText.includes('?');
                return isPassed && (Number(i.incomingQty) || 0) > 0;
            })
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (passed.length === 0) {
            if (badge) badge.style.display = 'none';
            body.innerHTML = '<p style="text-align:center; padding:18px; color:var(--text-muted); font-size:0.88rem;">?? ?? ?? ?? ???? ????.</p>';
            return;
        }

        function getMaterialId(paintName) {
            const mat = materials.find(m => m.name === paintName);
            return mat ? mat.id : null;
        }

        const actualProcessedInspIds = new Set(
            inventory
                .filter(row => row.sourceInspectionId && !_isCurrentStockEditRecord(row))
                .map(row => row.sourceInspectionId)
        );
        const actualLegacyStockSet = new Set(
            inventory
                .filter(row => row.type !== '??' && row.type !== '???' && !row.sourceInspectionId && !_isCurrentStockEditRecord(row))
                .map(row => `${row.materialId}||${row.lotNo}`)
        );

        const pending = passed.filter(i => {
            if (i.warehouseStatus === '입고취소') return false;
            if (i.warehouseStatus === '??????') return false;
            if (actualProcessedInspIds.has(i.id)) return false;
            const mid = getMaterialId(i.paintName);
            if (mid && actualLegacyStockSet.has(`${mid}||${i.lotNo}`)) return false;
            return true;
        });

        if (badge) {
            if (pending.length > 0) {
                badge.textContent = `대기 ${pending.length}건`;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }

        if (pending.length === 0) {
            body.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:18px;color:var(--accent-green);font-size:0.9rem;">
                    <span class="material-symbols-outlined">check_circle</span>
                    <span>입고 대기 항목이 없습니다. 모든 검사 완료품이 입고 처리되었습니다.</span>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div style="display:flex;justify-content:flex-end;padding:10px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);">
                <button class="btn btn-sm btn-outline" onclick="PaintInventoryModule.cancelAllPaintInspectionStandby()"
                    title="현재 입고 대기 목록을 모두 취소합니다. 검사 기록은 삭제하지 않습니다.">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">cancel</span> 전체 취소
                </button>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>검사일</th>
                            <th>공급처</th>
                            <th>도료명</th>
                            <th>제조사 LOT</th>
                            <th style="text-align:right;">입고수량</th>
                            <th>제조일자</th>
                            <th>유효기간</th>
                            <th style="text-align:center;">상태</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pending.map(i => `
                            <tr style="background:rgba(245,158,11,0.06);">
                                <td style="font-size:0.82rem;">${(i.date || '').slice(0, 10)}</td>
                                <td style="font-size:0.82rem;">${i.supplier || '-'}</td>
                                <td><strong>${i.paintName || '-'}</strong></td>
                                <td style="font-family:monospace;">${i.lotNo || '-'}</td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(i.incomingQty || 0)}</td>
                                <td style="font-size:0.82rem;">${i.mfgDate || '-'}</td>
                                <td style="font-size:0.82rem;">${i.expDate || '-'}</td>
                                <td style="text-align:center;">
                                    <span class="badge badge-warning" style="background:var(--accent-orange,#f59e0b);color:#fff;">입고대기</span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="PaintInventoryModule.openIncomingFromInspection('${i.id}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_circle</span> 입고 처리
                                    </button>
                                    <button class="btn btn-sm btn-outline" style="margin-left:6px;" onclick="PaintInventoryModule.cancelPaintInspectionStandby('${i.id}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">cancel</span> 취소
                                    </button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function cancelPaintInspectionStandby(id) {
        const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, id);
        if (!insp) {
            UIUtils.toast('?낃퀬 ?湲??뺣낫瑜?李얠쓣 ???놁뒿?덈떎.', 'error');
            return;
        }
        UIUtils.confirm('?좏깮???낃퀬 ?湲??덈ぉ??痍⑥냼?섏떆寃좎뒿?덇퉴? 寃??湲곕줉? ??젣?섏? ?딆뒿?덈떎.', async () => {
            await Storage.update(DB.STORES.PAINT_INCOMING_INSPECTIONS, id, {
                ...insp,
                warehouseStatus: '?낃퀬痍⑥냼',
                warehouseDate: UIUtils.today()
            });
            UIUtils.toast('?낃퀬 ?湲??덈ぉ??痍⑥냼?덉뒿?덈떎.', 'success');
            renderPaintInspStandby();
        });
    }

    function cancelAllPaintInspectionStandby() {
        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        const materials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const processedInspIds = new Set(
            inventory.filter(i => i.sourceInspectionId && !_isCurrentStockEditRecord(i)).map(i => i.sourceInspectionId)
        );
        const legacyStockSet = new Set(
            inventory
                .filter(i => i.type !== '출고' && i.type !== '異쒓퀬' && !i.sourceInspectionId && !_isCurrentStockEditRecord(i))
                .map(i => `${i.materialId}||${i.lotNo}`)
        );
        const pending = inspections.filter(i => {
            const verdictText = String(i.verdict || '');
            const isPassed = verdictText === '합격' || verdictText.includes('합') || verdictText.includes('⑷');
            if (!isPassed || i.warehouseStatus === '?낃퀬痍⑥냼' || (Number(i.incomingQty) || 0) <= 0) return false;
            if (processedInspIds.has(i.id)) return false;
            const mat = materials.find(m => m.name === i.paintName);
            if (mat && legacyStockSet.has(`${mat.id}||${i.lotNo}`)) return false;
            return true;
        });

        if (!pending.length) {
            UIUtils.toast('痍⑥냼???낃퀬 ?湲??덈ぉ???놁뒿?덈떎.', 'warning');
            return;
        }

        UIUtils.confirm(`?낃퀬 ?湲?${pending.length}嫄댁쓣 紐⑤몢 痍⑥냼?섏떆寃좎뒿?덇퉴? 寃??湲곕줉? ??젣?섏? ?딆뒿?덈떎.`, async () => {
            await Storage.executeTransaction(pending.map(i => ({
                store: DB.STORES.PAINT_INCOMING_INSPECTIONS,
                op: 'update',
                id: i.id,
                data: {
                    ...i,
                    warehouseStatus: '?낃퀬痍⑥냼',
                    warehouseDate: UIUtils.today()
                }
            })));
            UIUtils.toast(`?낃퀬 ?湲?${pending.length}嫄댁쓣 痍⑥냼?덉뒿?덈떎.`, 'success');
            renderPaintInspStandby();
        });
    }

    function validateProdLot(input) {
        const msg = document.getElementById('addPaintInvProdLotMsg');
        if (!msg) return;
        const val = input.value;
        if (val.length < 6) {
            msg.innerHTML = '';
            input.style.borderColor = '';
            return;
        }
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        const yy = val.slice(0, 2);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
            msg.innerHTML = `<span style="color:var(--accent-red);">???좏슚?섏? ?딆? ?좎쭨?낅땲??(?? ${mm}, ?? ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
        } else {
            msg.innerHTML = `<span style="color:var(--accent-green);">??20${yy}??${String(mm).padStart(2,'0')}??${String(dd).padStart(2,'0')}??/span>`;
            input.style.borderColor = 'var(--accent-green)';
        }
    }

    // ?쒖“?쇱옄(YYYY-MM-DD) ???쒖“ LOT(YYMMDD) ?먮룞 蹂??
    function autoFillProdLot(dateVal) {
        const prodLotEl = document.getElementById('addPaintInvProdLot');
        if (!prodLotEl) return;
        if (!dateVal) { prodLotEl.placeholder = '?쒖“ LOT'; return; }
        // YYYY-MM-DD ??YYMMDD
        const m = dateVal.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/);
        if (m) {
            prodLotEl.value = m[2] + m[3] + m[4]; // YY + MM + DD
        }
    }

    // ?꾨즺 寃??湲곕줉?쇰줈遺???낃퀬 紐⑤떖 ?먮룞 梨꾩?
    function openIncomingFromInspection(inspId) {
        const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('寃???뺣낫瑜?李얠쓣 ???놁뒿?덈떎.', 'error'); return; }

        // 寃??湲곕줉??supplier媛 留덉뒪?곗? ?ㅻ? ???덉쑝誘濡??ㅽ? ?? paintName ?곗꽑 留ㅼ묶
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.name === insp.paintName && m.supplier === insp.supplier)
                 || materials.find(m => m.name === insp.paintName);

        // ?ㅼ젣 ?ъ슜??supplier??留덉뒪??湲곗??쇰줈 寃곗젙
        const resolvedSupplier = mat ? (mat.supplier || insp.supplier || '') : (insp.supplier || '');

        window._sourceInspectionId = inspId;
        showRegistrationModal('?낃퀬');
        setTimeout(() => {
            const supplierSel = document.getElementById('addPaintInvSupplier');
            if (supplierSel) {
                supplierSel.value = resolvedSupplier;
                PaintInventoryModule.onSupplierChange('?낃퀬');
            }
            setTimeout(() => {
                const matSel = document.getElementById('addPaintInvMaterial');
                if (matSel && mat) {
                    matSel.value = mat.id;
                    PaintInventoryModule.onMaterialChange('?낃퀬');
                }
                setTimeout(() => {
                    const lotInput = document.getElementById('addPaintInvLot');
                    const qtyInput = document.getElementById('addPaintInvQty');
                    const mfgInput = document.getElementById('addPaintInvMfgDate');
                    const expInput = document.getElementById('addPaintInvExpDate');
                    if (lotInput) lotInput.value = insp.lotNo       || '';
                    if (qtyInput) qtyInput.value = insp.incomingQty || '';
                    if (mfgInput) mfgInput.value = insp.mfgDate     || '';
                    if (expInput) expInput.value = insp.expDate      || '';
                    autoFillProdLot(insp.mfgDate || '');
                }, 80);
            }, 80);
        }, 80);
    }

    function openIncomingModal() {
        showRegistrationModal('?낃퀬');
    }

    function openOutgoingModal() {
        showRegistrationModal('異쒓퀬');
    }

    function showRegistrationModal(type) {
        const materials = Storage.getAll(MATERIALS_STORE);

        if (materials.length === 0) {
            UIUtils.toast('?깅줉???꾨즺 ?뺣낫媛 ?놁뒿?덈떎. 愿由??ㅼ젙?먯꽌 ?꾨즺瑜?癒쇱? ?깅줉?댁＜?몄슂.', 'warning');
            return;
        }

        const suppliers = [...new Set(materials.map(m => m.supplier).filter(Boolean))].sort();
        const supplierOptions = suppliers.map(s => `<option value="${s}">${s}</option>`).join('');

        UIUtils.showModal(`?꾨즺 ${type} ?깅줉`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?좎쭨</label>
                    <input type="date" class="form-input" id="addPaintInvDate" value="${UIUtils.today()}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">援щℓ泥?<span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="addPaintInvSupplier"
                            onchange="PaintInventoryModule.onSupplierChange('${type}')">
                        <option value="">-- 援щℓ泥??좏깮 --</option>
                        ${supplierOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">?꾨즺紐?<span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="addPaintInvMaterial" 
                            onchange="PaintInventoryModule.onMaterialChange('${type}')">
                        <option value="">-- 援щℓ泥?癒쇱? ?좏깮 --</option>
                    </select>
                </div>
            </div>
            <div id="stockInfoArea" style="margin-bottom:15px; display:none;">
                <div style="background:var(--bg-primary); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:600; font-size:0.9rem;">?꾩옱怨??뺣낫</span>
                        <span id="totalStockDisplay" style="color:var(--accent-blue); font-weight:700;">-</span>
                    </div>
                    <div id="lotStockList" style="font-size:0.8rem; color:var(--text-secondary); max-height:100px; overflow-y:auto;">
                        <!-- LOT蹂??ш퀬 紐⑸줉 -->
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?ъ옣 ?⑸웾 (?먮룞)</label>
                    <input type="text" class="form-input" id="addPaintInvPackUnit" readonly style="background:var(--bg-secondary);" placeholder="?꾨즺瑜??좏깮?섏꽭??>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        ${type === '異쒓퀬'
                            ? '?쒖“ LOT <span style="color:var(--accent-red)">*</span>'
                            : '?쒖“??LOT <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:4px;">(?좏깮)</span>'}
                    </label>
                    ${type === '異쒓퀬'
                ? `<select class="form-select" id="addPaintInvLot" onchange="PaintInventoryModule.onLotSelectChange(); PaintInventoryModule.checkStockLive('add');"><option value="">-- ?꾨즺 癒쇱? ?좏깮 --</option></select>`
                : `<input type="text" class="form-input" id="addPaintInvLot" placeholder="怨듦툒??LOT 肄붾뱶 (?좏깮)">`
            }
                    <div id="addPaintInvLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
            </div>
            ${type === '?낃퀬' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">
                        ?쒖“ LOT <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:4px;">YYMMDD 쨌 ?먯궗 ?대? 愿由?LOT</span>
                    </label>
                    <input type="text" class="form-input" id="addPaintInvProdLot" placeholder="?? 260227" maxlength="6" inputmode="numeric"
                        oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6); PaintInventoryModule.validateProdLot(this);">
                    <div id="addPaintInvProdLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>` : ''}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?섎웾 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="addPaintInvQty" min="0" placeholder="0" oninput="PaintInventoryModule.checkStockLive('add')">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
            ${type === '?낃퀬' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?쒖“?쇱옄</label>
                    <input type="date" class="form-input" id="addPaintInvMfgDate"
                        onchange="PaintInventoryModule.autoFillProdLot(this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">?좏슚湲곌컙</label>
                    <input type="date" class="form-input" id="addPaintInvExpDate">
                </div>
            </div>` : ''}
            <div id="addPaintInvStockWarning" style="display:none; margin-top:10px; padding:12px; background:rgba(244, 67, 54, 0.1); border:1px solid var(--accent-red); border-radius:6px; color:var(--accent-red); font-size:0.875rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px;">error</span>
                    <strong>?ш퀬 遺議?二쇱쓽</strong>
                </div>
                <p id="addPaintInvStockMsg" style="margin:5px 0 0 28px;"></p>
            </div>
            <div id="fifoWarning" style="display:none; margin-top:10px; padding:10px; background:rgba(255, 152, 0, 0.1); border:1px solid var(--accent-orange); border-radius:6px; color:var(--accent-orange); font-size:0.85rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                    <strong>?좎엯?좎텧(FIFO) 寃쎄퀬</strong>
                </div>
                <p id="fifoWarningMsg" style="margin:5px 0 0 26px;"></p>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">痍⑥냼</button>
            <button class="btn btn-primary" onclick="PaintInventoryModule.saveNew('${type}')">?깅줉</button>
        `);
    }

    function onSupplierChange(type) {
        const supplier = document.getElementById('addPaintInvSupplier').value;
        const nameSelect = document.getElementById('addPaintInvMaterial');
        const materials = Storage.getAll(MATERIALS_STORE);

        nameSelect.innerHTML = '<option value="">-- ?꾨즺紐??좏깮 --</option>';
        if (!supplier) return;

        const filtered = materials.filter(m => m.supplier === supplier);
        nameSelect.innerHTML = '<option value="">-- ?꾨즺紐??좏깮 --</option>' +
            filtered.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        if (filtered.length === 1) {
            nameSelect.value = filtered[0].id;
            onMaterialChange(type);
        }
    }

    function onMaterialChange(type) {
        const matId = document.getElementById('addPaintInvMaterial').value;
        const stockArea = document.getElementById('stockInfoArea');
        const lotSelect = document.getElementById('addPaintInvLot');
        const packUnitInput = document.getElementById('addPaintInvPackUnit');

        if (!matId) {
            if (stockArea) stockArea.style.display = 'none';
            if (type === '異쒓퀬' && lotSelect) lotSelect.innerHTML = '<option value="">-- ?꾨즺 癒쇱? ?좏깮 --</option>';
            if (packUnitInput) packUnitInput.value = '';
            return;
        }

        // ?ъ옣?⑥쐞 ?먮룞 ?쒖떆
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (packUnitInput && mat) {
            packUnitInput.value = mat.packUnit ? (mat.packUnit + ' KG') : '-';
        }

        const data = Storage.getAll(STORE);

        // ?쒖“LOT(prodLot) 湲곗? ?ш퀬 怨꾩궛 (?놁쑝硫?lotNo ?대갚)
        const prodLotMap = {};  // key = prodLot||lotNo ??{ qty, lotNo }
        data.filter(d => d.materialId === matId).forEach(d => {
            const key = d.prodLot || d.lotNo || '__';
            if (!prodLotMap[key]) prodLotMap[key] = { qty: 0, lotNo: d.lotNo || '' };
            if (d.type === '異쒓퀬') prodLotMap[key].qty -= Number(d.quantity) || 0;
            else prodLotMap[key].qty += Number(d.quantity) || 0;
        });

        const totalStock = Object.values(prodLotMap).reduce((a, v) => a + v.qty, 0);

        if (stockArea) {
            stockArea.style.display = 'block';
            document.getElementById('totalStockDisplay').textContent = UIUtils.formatNumber(totalStock);

            const lotList = document.getElementById('lotStockList');
            lotList.innerHTML = Object.entries(prodLotMap)
                .filter(([_, v]) => v.qty !== 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([lot, v]) => `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>?쒖“LOT: ${lot}</span><span>${UIUtils.formatNumber(v.qty)}</span></div>`)
                .join('') || '<div style="text-align:center; padding:5px;">?ш퀬 ?놁쓬</div>';
        }

        if (type === '異쒓퀬' && lotSelect) {
            const activeProdLots = Object.entries(prodLotMap)
                .filter(([_, v]) => v.qty > 0)
                .map(([key, _]) => key)
                .sort();

            lotSelect.innerHTML = '<option value="">-- ?쒖“ LOT ?좏깮 --</option>' +
                activeProdLots.map(l => `<option value="${l}">${l}</option>`).join('');
        }
    }

    function onLotSelectChange() {
        const lotSelect = document.getElementById('addPaintInvLot');
        const selectedLot = lotSelect.value;
        const warningArea = document.getElementById('fifoWarning');
        const warningMsg = document.getElementById('fifoWarningMsg');

        if (!selectedLot) {
            warningArea.style.display = 'none';
            return;
        }

        // ?좎엯?좎텧 泥댄겕
        const options = Array.from(lotSelect.options)
            .map(opt => opt.value)
            .filter(val => val !== "");

        const oldestLot = options.sort()[0];

        if (selectedLot !== oldestLot) {
            warningArea.style.display = 'block';
            warningMsg.innerHTML = `?꾩옱 ?좏깮?섏떊 LOT(${selectedLot})蹂대떎 癒쇱? ?낃퀬??<strong>LOT(${oldestLot})</strong> 媛 ?덉뒿?덈떎.<br>?좎엯?좎텧???꾪빐 ?댁젏 ?좎쓽?섏떆湲?諛붾엻?덈떎.`;
        } else {
            warningArea.style.display = 'none';
        }
    }

    function onLotInput() {} // ?쒖“??LOT ?뺤떇 ?쒗븳 ?놁쓬 ??怨듦툒???먯껜 肄붾뱶

    function _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _normalizeText(value) {
        return String(value ?? '').replace(/\u00a0/g, ' ').trim();
    }

    function _parseQty(value) {
        const text = _normalizeText(value);
        if (!text || text === '-' || text === '－') return 0;
        const cleaned = text.replace(/,/g, '').replace(/[^\d.-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function _isQtyLike(value) {
        const text = _normalizeText(value);
        if (text === '' || text === '-' || text === '－') return true;
        return /^-?[\d,]+(\.\d+)?$/.test(text);
    }

    function _bulkMaterialKey(supplier, name) {
        return [_normalizeText(supplier).toUpperCase(), _normalizeText(name).toUpperCase()].join('||');
    }

    function _isCurrentStockEditRecord(record) {
        return record && (
            record.inventoryMode === 'current_stock_edit' ||
            record.source === '?꾨즺 李쎄퀬 ?꾩옱 ?ш퀬 ?섏젙' ||
            record.source === '?꾨즺 李쎄퀬 ?쇨큵 ?깅줉 諛??섏젙'
        );
    }

    function _isAdminUser() {
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return false;
        const user = AuthModule.getCurrentUser();
        return !!(user && user.role === 'admin');
    }

    function _requireBulkAdmin(onPass) {
        if (_isAdminUser()) {
            onPass();
            return;
        }
        if (typeof AuthModule !== 'undefined' && AuthModule.checkSettingsAuth) {
            AuthModule.checkSettingsAuth(function() {
                if (_isAdminUser()) onPass();
                else UIUtils.toast('?꾨즺 李쎄퀬 ?쇨큵 ?깅줉 諛??섏젙? 愿由ъ옄留?媛?ν빀?덈떎.', 'warning');
            });
            return;
        }
        UIUtils.toast('?꾨즺 李쎄퀬 ?쇨큵 ?깅줉 諛??섏젙? 愿由ъ옄留?媛?ν빀?덈떎.', 'warning');
    }

    function _parseBulkRows(text) {
        const rows = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.split('\t').map(_normalizeText))
            .filter(row => row.some(Boolean));

        return rows
            .filter(row => row.length >= 3)
            .filter(row => {
                const first = _normalizeText(row[0]);
                const second = _normalizeText(row[1]);
                const third = _normalizeText(row[2]);
                if (/납품처|공급|거래처/i.test(first) || /차종/i.test(second) || /제품명|품명|도료/i.test(third)) return false;
                return _isQtyLike(row[2]) || _isQtyLike(row[3]);
            })
            .map((row, idx) => {
                const hasCarModel = !_isQtyLike(row[2]) && _isQtyLike(row[3]);
                const supplier = row[0] || '';
                const carModel = hasCarModel ? row[1] || '' : '';
                const paintName = hasCarModel ? row[2] || '' : row[1] || '';
                const currentQty = hasCarModel ? _parseQty(row[3]) : _parseQty(row[2]);
                const lotStart = hasCarModel ? 4 : 3;
                const lots = [];
                for (let col = lotStart; col < row.length; col += 2) {
                    const lot = row[col] || '';
                    const qty = _parseQty(row[col + 1]);
                    if (!lot && qty <= 0) continue;
                    lots.push({ lot, qty });
                }
                return { rowNo: idx + 1, supplier, carModel, paintName, currentQty, lots };
            })
            .filter(r => r.supplier && r.paintName);
    }

    function _bulkDuplicateLabels(records) {
        const counts = {};
        (records || []).forEach(r => {
            const key = _bulkMaterialKey(r.supplier, r.paintName);
            counts[key] = (counts[key] || 0) + 1;
        });
        const labels = [];
        const seen = new Set();
        (records || []).forEach(r => {
            const key = _bulkMaterialKey(r.supplier, r.paintName);
            if ((counts[key] || 0) <= 1 || seen.has(key)) return;
            seen.add(key);
            labels.push(`${r.supplier} / ${r.paintName}`);
        });
        return labels;
    }

    function _bulkMismatchLabels(records) {
        return (records || [])
            .filter(r => r.lots.length > 0)
            .filter(r => r.lots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0) !== (Number(r.currentQty) || 0))
            .map(r => `${r.supplier} / ${r.paintName}`);
    }

    function _bulkFindMaterial(materials, supplier, paintName) {
        const supplierNorm = _normalizeText(supplier).toUpperCase();
        const nameNorm = _normalizeText(paintName).toUpperCase();
        return (materials || []).find(m =>
            _normalizeText(m.supplier).toUpperCase() === supplierNorm &&
            _normalizeText(m.name).toUpperCase() === nameNorm
        ) || null;
    }

    function _bulkGetMissingLabels(records, materials) {
        const seen = new Set();
        return (records || [])
            .filter(r => !_bulkFindMaterial(materials, r.supplier, r.paintName))
            .map(r => `${r.supplier} / ${r.paintName}`)
            .filter(label => {
                if (seen.has(label)) return false;
                seen.add(label);
                return true;
            });
    }

    function _bulkCurrentStockMap(materials) {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(d => {
            const mat = (materials || []).find(m => m.id === d.materialId);
            if (!mat) return;
            const key = _bulkMaterialKey(mat.supplier || '', mat.name || '');
            if (!map[key]) map[key] = 0;
            const qty = Number(d.quantity) || 0;
            map[key] += d.type === '異쒓퀬' ? -qty : qty;
        });
        return map;
    }

    function _bulkStockByMaterialId() {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(d => {
            if (!d.materialId) return;
            if (!map[d.materialId]) map[d.materialId] = { total: 0, lots: {}, carModel: '' };
            const qty = Number(d.quantity) || 0;
            const sign = (d.type === '출고' || d.type === '異쒓퀬') ? -1 : 1;
            map[d.materialId].total += sign * qty;
            if (d.carModel && !map[d.materialId].carModel) map[d.materialId].carModel = d.carModel;

            const lot = _normalizeText(d.prodLot || d.lotNo || '');
            if (!lot) return;
            if (!map[d.materialId].lots[lot]) map[d.materialId].lots[lot] = 0;
            map[d.materialId].lots[lot] += sign * qty;
        });
        return map;
    }

    function _bulkBuildMasterTemplate() {
        const materials = (Storage.getAll(MATERIALS_STORE) || [])
            .slice()
            .sort((a, b) =>
                _normalizeText(a.supplier).localeCompare(_normalizeText(b.supplier), 'ko') ||
                _normalizeText(a.name).localeCompare(_normalizeText(b.name), 'ko')
            );
        const stockMap = _bulkStockByMaterialId();
        const header = ['납품처', '제품명', '현재재고', 'LOT1', '수량', 'LOT2', '수량', 'LOT3', '수량', 'LOT4', '수량'];
        const lines = [header.join('\t')];

        materials.forEach(mat => {
            const stock = stockMap[mat.id] || { total: 0, lots: {}, carModel: '' };
            const activeLots = Object.entries(stock.lots)
                .filter(([_, qty]) => (Number(qty) || 0) > 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 4);
            const row = [
                mat.supplier || '',
                mat.name || '',
                Math.max(0, Number(stock.total) || 0)
            ];
            for (let i = 0; i < 4; i++) {
                row.push(activeLots[i] ? activeLots[i][0] : '');
                row.push(activeLots[i] ? Math.max(0, Number(activeLots[i][1]) || 0) : '');
            }
            lines.push(row.join('\t'));
        });
        return lines.join('\n');
    }

    function _bulkLoadMasterTemplate() {
        const textarea = document.getElementById('paintBulkPasteArea');
        if (!textarea) return;
        const template = _bulkBuildMasterTemplate();
        if (!template.split('\n').slice(1).some(Boolean)) {
            UIUtils.toast('愿由??ㅼ젙???꾨즺 愿由ъ뿉 ?깅줉???꾨즺媛 ?놁뒿?덈떎.', 'warning');
            return;
        }
        textarea.value = template;
        PaintInventoryModule._bulkRecords = _parseBulkRows(template);
        _bulkRenderPreview();
        UIUtils.toast('?꾨즺 愿由??꾩껜 紐⑸줉???꾩옱 ?ш퀬 ?낅젰?濡?遺덈윭?붿뒿?덈떎.', 'success');
    }

    function _bulkClearPaste() {
        const textarea = document.getElementById('paintBulkPasteArea');
        const wrap = document.getElementById('paintBulkPreviewWrap');
        const saveBtn = document.getElementById('paintBulkSaveBtn');
        if (textarea) {
            textarea.value = '';
            textarea.focus();
        }
        if (wrap) wrap.innerHTML = '';
        if (saveBtn) saveBtn.style.display = 'none';
        PaintInventoryModule._bulkRecords = [];
    }

    function openBulkModal() {
        _requireBulkAdmin(_showBulkModal);
    }

    function _showBulkModal() {
        const masterTemplate = _bulkBuildMasterTemplate();
        PaintInventoryModule._bulkRecords = _parseBulkRows(masterTemplate);
        UIUtils.showModal({
            title: '?꾨즺 李쎄퀬 ?쇨큵 ?깅줉 諛??섏젙',
            size: '1352px',
            noBackdropClose: true,
            body: `
            <div style="margin-bottom:10px;padding:10px 14px;background:rgba(59,130,246,0.07);
                        border:1px solid rgba(59,130,246,0.25);border-radius:8px;font-size:0.82rem;
                        color:var(--text-secondary);line-height:1.7;">
                <b style="color:var(--accent-blue);">遺숈뿬?ｊ린 ?뺤떇</b><br>
                ?묒??먯꽌 <b>?⑺뭹泥?/ ?쒗뭹紐?/ ?꾩옱?ш퀬 / LOT1 / ?섎웾 / LOT2 / ?섎웾 / LOT3 / ?섎웾 / LOT4 / ?섎웾</b> 踰붿쐞瑜?蹂듭궗??遺숈뿬?ｌ쑝?몄슂.<br>
                ?????湲곗〈 ?꾨즺 李쎄퀬 ?ш퀬??紐⑤몢 ??젣?섍퀬 遺숈뿬?ｌ? ?꾩옱 愿由??쒗듃 媛믪쑝濡??꾩껜 援먯껜?⑸땲??
            </div>
            <div style="margin-bottom:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;
                        font-family:Consolas,monospace;font-size:0.78rem;line-height:1.45;color:var(--text-secondary);overflow-x:auto;">
                ?⑺뭹泥?nbsp;&nbsp;&nbsp;&nbsp;?쒗뭹紐?nbsp;&nbsp;&nbsp;&nbsp;?꾩옱?ш퀬&nbsp;&nbsp;&nbsp;&nbsp;LOT1&nbsp;&nbsp;&nbsp;&nbsp;?섎웾&nbsp;&nbsp;&nbsp;&nbsp;LOT2&nbsp;&nbsp;&nbsp;&nbsp;?섎웾<br>
                ?쒓뎅移쇰씪?붿옄?멸린??二?&nbsp;&nbsp;&nbsp;&nbsp;BLACK(J71E02)&nbsp;&nbsp;&nbsp;&nbsp;5&nbsp;&nbsp;&nbsp;&nbsp;250829&nbsp;&nbsp;&nbsp;&nbsp;1&nbsp;&nbsp;&nbsp;&nbsp;260325&nbsp;&nbsp;&nbsp;&nbsp;4
            </div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label class="form-label">湲곗? ?쇱옄</label>
                    <input type="date" class="form-input" id="paintBulkInvDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;">
                        <input type="checkbox" id="paintBulkCreateMissing" onchange="PaintInventoryModule._bulkRenderPreview()">
                        紐낆묶 ?뺤씤 ???꾨즺 留덉뒪???좉퇋 ?앹꽦 ?덉슜
                    </label>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkLoadMasterTemplate()">
                        <span class="material-symbols-outlined">table_view</span> ?꾨즺 愿由?紐⑸줉 遺덈윭?ㅺ린
                    </button>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkClearPaste()">
                        <span class="material-symbols-outlined">backspace</span> ?꾩껜 吏?곌린
                    </button>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkParse()">
                        <span class="material-symbols-outlined">preview</span> 誘몃━蹂닿린
                    </button>
                </div>
            </div>
            <textarea id="paintBulkPasteArea" class="form-textarea"
                placeholder="?묒??먯꽌 蹂듭궗???꾨즺 ?ш퀬 愿由??쒗듃 ?댁슜???ш린??遺숈뿬?ｌ쑝?몄슂."
                style="height:190px;font-family:Consolas,monospace;font-size:0.78rem;resize:vertical;"
                oninput="document.getElementById('paintBulkPreviewWrap').innerHTML='';
                         var s=document.getElementById('paintBulkSaveBtn');if(s)s.style.display='none';">${_escapeHtml(masterTemplate)}</textarea>
            <div id="paintBulkPreviewWrap" style="margin-top:12px;"></div>
        `,
            footer: `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">痍⑥냼</button>
            <button class="btn btn-primary" id="paintBulkSaveBtn" style="display:none;"
                onclick="PaintInventoryModule._bulkSave()">
                <span class="material-symbols-outlined">save</span> ?꾩껜 援먯껜 ???            </button>
        `
        });
        setTimeout(_bulkRenderPreview, 0);
    }

    function _bulkParse() {
        const raw = (document.getElementById('paintBulkPasteArea') || {}).value || '';
        PaintInventoryModule._bulkRecords = _parseBulkRows(raw);
        _bulkRenderPreview();
    }

    function _bulkRenderPreview() {
        const records = PaintInventoryModule._bulkRecords || [];
        const wrap = document.getElementById('paintBulkPreviewWrap');
        const saveBtn = document.getElementById('paintBulkSaveBtn');
        if (!wrap) return;
        if (!records.length) {
            wrap.innerHTML = '<p style="color:var(--accent-red);font-size:0.83rem;">遺숈뿬?ｌ? ?댁슜?먯꽌 ?깅줉???꾨즺 ?ш퀬瑜?李얠? 紐삵뻽?듬땲??</p>';
            if (saveBtn) saveBtn.style.display = 'none';
            return;
        }

        const materials = Storage.getAll(MATERIALS_STORE) || [];
        const currentMap = _bulkCurrentStockMap(materials);
        const duplicateLabels = _bulkDuplicateLabels(records);
        const mismatchLabels = _bulkMismatchLabels(records);
        const missingLabels = _bulkGetMissingLabels(records, materials);
        const autoCreate = (document.getElementById('paintBulkCreateMissing') || {}).checked !== false;
        const hasBlockers = duplicateLabels.length > 0 || mismatchLabels.length > 0 || (!autoCreate && missingLabels.length > 0);
        const lotRecordCount = records.reduce((sum, r) => sum + Math.max(1, r.lots.length), 0);
        const currentTotal = records.reduce((sum, r) => sum + (Number(r.currentQty) || 0), 0);

        const rowsHtml = records.map((r, idx) => {
            const label = `${r.supplier} / ${r.paintName}`;
            const current = currentMap[_bulkMaterialKey(r.supplier, r.paintName)] || 0;
            const lotTotal = r.lots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
            const isDuplicate = duplicateLabels.includes(label);
            const isMismatch = r.lots.length > 0 && lotTotal !== (Number(r.currentQty) || 0);
            const isMissing = !_bulkFindMaterial(materials, r.supplier, r.paintName);
            const lotsHtml = r.lots.length
                ? r.lots.map(l => `<span style="display:inline-block;margin:2px 3px;padding:2px 6px;border-radius:4px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:0.72rem;">${_escapeHtml(l.lot || '-')} / ${UIUtils.formatNumber(l.qty)}</span>`).join('')
                : '<span style="color:var(--text-muted);font-size:0.78rem;">LOT ?놁쓬</span>';
            const status = [
                isDuplicate ? '<span style="color:var(--accent-red);font-weight:700;">以묐났</span>' : '',
                isMismatch ? '<span style="color:var(--accent-red);font-weight:700;">LOT?⑷퀎 遺덉씪移?/span>' : '',
                isMissing ? `<span style="color:${autoCreate ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-red)'};font-weight:700;">留덉뒪???놁쓬</span>` : ''
            ].filter(Boolean).join('<br>') || '<span style="color:var(--accent-green);font-weight:700;">?뺤긽</span>';

            return `
                <tr style="${isDuplicate || isMismatch || (isMissing && !autoCreate) ? 'background:rgba(239,68,68,0.06);' : ''}">
                    <td>${_escapeHtml(r.supplier)}</td>
                    <td><strong>${_escapeHtml(r.paintName)}</strong></td>
                    <td style="text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                    <td style="text-align:right;font-weight:700;">${UIUtils.formatNumber(r.currentQty)}</td>
                    <td>${lotsHtml}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(lotTotal)}</td>
                    <td>${status}</td>
                    <td style="text-align:center;"><button class="btn btn-sm btn-outline" onclick="PaintInventoryModule._bulkRemoveRow(${idx})">?쒖쇅</button></td>
                </tr>
            `;
        }).join('');

        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="color:${hasBlockers ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-green)'};font-size:18px;">${hasBlockers ? 'warning' : 'check_circle'}</span>
                <span style="font-size:0.85rem;font-weight:600;color:${hasBlockers ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-green)'};">
                    ${records.length}媛??덈ぉ / ${lotRecordCount}媛?LOT / 珥??꾩옱怨?${UIUtils.formatNumber(currentTotal)}
                </span>
            </div>
            ${duplicateLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>以묐났 ?덈ぉ ${duplicateLabels.length}媛쒓? ?덉뒿?덈떎.</strong> 媛숈? ?⑺뭹泥??쒗뭹紐낆? 1媛??됰쭔 ?④꺼????ν븷 ???덉뒿?덈떎.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 6).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 6 ? '<br>...' : ''}</div>
            </div>` : ''}
            ${mismatchLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>?꾩옱怨좎? LOT ?섎웾 ?⑷퀎媛 ?ㅻⅨ ?덈ぉ ${mismatchLabels.length}媛쒓? ?덉뒿?덈떎.</strong> 愿由??쒗듃???꾩옱怨좎? LOT ?섎웾??留욎텣 ????ν븯?몄슂.
                <div style="margin-top:3px;color:var(--text-secondary);">${mismatchLabels.slice(0, 6).map(_escapeHtml).join('<br>')}${mismatchLabels.length > 6 ? '<br>...' : ''}</div>
            </div>` : ''}
            ${missingLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(245,158,11,0.35);border-radius:6px;background:rgba(245,158,11,0.06);color:var(--text-secondary);font-size:0.8rem;line-height:1.55;">
                <strong style="color:var(--accent-orange,#f59e0b);">?꾨즺 ?뺣낫???녿뒗 ?덈ぉ ${missingLabels.length}媛?/strong>媛 ?덉뒿?덈떎.
                癒쇱? 愿由??ㅼ젙 > ?꾨즺 愿由ъ쓽 紐낆묶怨?遺숈뿬?ｌ? 紐낆묶??媛숈?吏 ?뺤씤?섏꽭??
                ${autoCreate ? '?뺤씤 ???좉퇋 ?앹꽦 ?덉슜 ?곹깭?대?濡???????꾨즺 留덉뒪?곗뿉 異붽??⑸땲??' : '紐낆묶 ?섏젙 ?먮뒗 ?좉퇋 ?앹꽦 ?덉슜 泥댄겕 ?꾩뿉????ν븷 ???놁뒿?덈떎.'}
                <div style="margin-top:3px;color:var(--text-secondary);">${missingLabels.slice(0, 8).map(_escapeHtml).join('<br>')}${missingLabels.length > 8 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:310px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table class="data-table" style="min-width:920px;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th>?⑺뭹泥?/th>
                            <th>?쒗뭹紐?/th>
                            <th style="text-align:right;">湲곗〈 ?ш퀬</th>
                            <th style="text-align:right;">援먯껜 ?ш퀬</th>
                            <th>LOT / ?섎웾</th>
                            <th style="text-align:right;">LOT ?⑷퀎</th>
                            <th>?곹깭</th>
                            <th style="text-align:center;">?묒뾽</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        if (saveBtn) saveBtn.style.display = hasBlockers ? 'none' : '';
    }

    function _bulkRemoveRow(idx) {
        if (!PaintInventoryModule._bulkRecords) return;
        PaintInventoryModule._bulkRecords.splice(idx, 1);
        _bulkRenderPreview();
    }

    async function _bulkSave() {
        if (!_isAdminUser()) {
            UIUtils.toast('?꾨즺 李쎄퀬 ?쇨큵 ?깅줉 諛??섏젙? 愿由ъ옄留?媛?ν빀?덈떎.', 'warning');
            return;
        }
        const records = PaintInventoryModule._bulkRecords || [];
        if (!records.length) {
            UIUtils.toast('??ν븷 ?꾨즺 ?ш퀬 ?곗씠?곌? ?놁뒿?덈떎.', 'warning');
            return;
        }

        let materials = Storage.getAll(MATERIALS_STORE) || [];
        const autoCreate = (document.getElementById('paintBulkCreateMissing') || {}).checked !== false;
        const duplicateLabels = _bulkDuplicateLabels(records);
        const mismatchLabels = _bulkMismatchLabels(records);
        const missingLabels = _bulkGetMissingLabels(records, materials);

        if (duplicateLabels.length || mismatchLabels.length || (!autoCreate && missingLabels.length)) {
            UIUtils.toast('??????뺤씤???꾩슂???됱씠 ?덉뒿?덈떎. 誘몃━蹂닿린?먯꽌 以묐났/遺덉씪移???ぉ???뺤씤?섏꽭??', 'warning');
            _bulkRenderPreview();
            return;
        }

        let createdMaterials = 0;
        if (autoCreate && missingLabels.length) {
            for (const r of records) {
                if (_bulkFindMaterial(materials, r.supplier, r.paintName)) continue;
                const created = await Storage.add(MATERIALS_STORE, {
                    supplier: r.supplier,
                    carModel: r.carModel || '',
                    name: r.paintName,
                    manufacturer: r.supplier,
                    paintType: '',
                    paintSpec: '',
                    packUnit: '',
                    purchasePrice: 0,
                    shelfLife: ''
                });
                materials = [...materials, created];
                createdMaterials++;
            }
        }

        const date = (document.getElementById('paintBulkInvDate') || {}).value || UIUtils.today();
        const nowIso = new Date().toISOString();
        const newItems = [];

        records.forEach(r => {
            const mat = _bulkFindMaterial(materials, r.supplier, r.paintName);
            if (!mat) return;
            const lots = r.lots.length ? r.lots : [{ lot: '', qty: Number(r.currentQty) || 0 }];
            lots.forEach(lot => {
                newItems.push({
                    id: Storage.generateId ? Storage.generateId() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
                    createdAt: nowIso,
                    date,
                    type: '?낃퀬',
                    materialId: mat.id,
                    carModel: r.carModel || '',
                    inventoryMode: 'current_stock_edit',
                    lotNo: lot.lot || '',
                    prodLot: lot.lot || '',
                    quantity: Math.max(0, Number(lot.qty) || 0),
                    source: '?꾨즺 李쎄퀬 ?꾩옱 ?ш퀬 ?섏젙'
                });
            });
        });

        await Storage.saveAll(STORE, newItems);
        PaintInventoryModule._bulkRecords = [];
        UIUtils.closeModal();
        UIUtils.toast(`湲곗〈 ?꾨즺 李쎄퀬 ?ш퀬 ??젣 ??${newItems.length}嫄??깅줉 ?꾨즺${createdMaterials ? `, ?꾨즺 留덉뒪??${createdMaterials}嫄??앹꽦` : ''}`, 'success');
        loadData();
    }

    async function saveNew(type) {
        const data = {
            date: document.getElementById('addPaintInvDate').value,
            type: type,
            materialId: document.getElementById('addPaintInvMaterial').value,
            lotNo: document.getElementById('addPaintInvLot').value.trim(),
            prodLot: (document.getElementById('addPaintInvProdLot') || {}).value?.trim() || '',
            quantity: Number(document.getElementById('addPaintInvQty').value) || 0,
            mfgDate: (document.getElementById('addPaintInvMfgDate') || {}).value || '',
            expDate: (document.getElementById('addPaintInvExpDate') || {}).value || '',
            sourceInspectionId: (type === '?낃퀬' && window._sourceInspectionId) ? window._sourceInspectionId : ''
        };
        if (type === '?낃퀬') window._sourceInspectionId = null;

        if (!data.materialId) {
            UIUtils.toast('?꾨즺瑜??좏깮?섏꽭??', 'warning');
            return;
        }
        // ?쒖“ LOT ???낃퀬 ???꾩닔 (YYMMDD 6?먮━)
        if (type === '?낃퀬') {
            if (!data.prodLot) {
                UIUtils.toast('?쒖“ LOT瑜??낅젰?섏꽭?? (YYMMDD 6?먮━)', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
            if (!/^\d{6}$/.test(data.prodLot)) {
                UIUtils.toast('?쒖“ LOT???レ옄 6?먮━(YYMMDD) ?뺤떇?댁뼱???⑸땲??', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
            const pm = parseInt(data.prodLot.slice(2, 4), 10);
            const pd = parseInt(data.prodLot.slice(4, 6), 10);
            if (pm < 1 || pm > 12 || pd < 1 || pd > 31) {
                UIUtils.toast('?쒖“ LOT??????媛믪씠 ?좏슚?섏? ?딆뒿?덈떎.', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
        }
        if (data.quantity <= 0) {
            UIUtils.toast('?섎웾???낅젰?섏꽭??', 'warning');
            return;
        }

        // 異쒓퀬 ??prodLot 湲곗? ?ш퀬 寃利?+ lotNo ??“??
        if (data.type === '異쒓퀬') {
            const allLogs = Storage.getAll(STORE);
            // select 媛믪씠 prodLot?대?濡?prodLot 湲곗? 留ㅼ묶
            const selectedProdLot = data.lotNo; // select value ??prodLot
            const lotLogs = allLogs.filter(l =>
                l.materialId === data.materialId &&
                (l.prodLot || l.lotNo) === selectedProdLot
            );
            const stockIn  = lotLogs.filter(l => l.type === '?낃퀬').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const stockOut = lotLogs.filter(l => l.type === '異쒓퀬').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const available = stockIn - stockOut;

            if (data.quantity > available) {
                checkStockLive('add');
                const qtyInput = document.getElementById('addPaintInvQty');
                if (qtyInput) qtyInput.focus();
                return;
            }

            // prodLot / lotNo 遺꾨━ ???
            data.prodLot = selectedProdLot;
            const srcRec = lotLogs.find(l => l.type === '?낃퀬' && l.lotNo);
            data.lotNo = srcRec ? srcRec.lotNo : selectedProdLot;
        }

        // ?? executeTransaction: ?묒뾽 紐⑸줉 援ъ꽦 ??????????????????????????
        const txOps = [{ store: STORE, op: 'add', data }];

        // ?섏엯寃???곕룞 ?낃퀬 ?? 寃???덉퐫?쒖뿉 李쎄퀬?낃퀬 ?꾨즺 ?곹깭 ?먯옄??湲곕줉
        // (?쒖そ留??깃났?섎뒗 遺덉씪移??곹깭 諛⑹?)
        const sourceInspId = data.sourceInspectionId;
        if (type === '?낃퀬' && sourceInspId) {
            txOps.push({
                store: DB.STORES.PAINT_INCOMING_INSPECTIONS,
                op:    'update',
                id:    sourceInspId,
                data:  { warehouseStatus: '?낃퀬?꾨즺', warehouseDate: data.date }
            });
        }

        await Storage.executeTransaction(txOps);
        UIUtils.closeModal();
        UIUtils.toast('?깅줉?섏뿀?듬땲??', 'success');
        loadData();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === d.materialId);
        const suppliers = [...new Set(materials.map(m => m.supplier).filter(Boolean))].sort();
        const supplierOptions = suppliers.map(s => `<option value="${s}" ${mat && mat.supplier === s ? 'selected' : ''}>${s}</option>`).join('');

        UIUtils.showModal(`?꾨즺 ${d.type} ?댁뿭 ?섏젙`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?좎쭨</label>
                    <input type="date" class="form-input" id="editPaintInvDate" value="${d.date}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">援щℓ泥?<span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="editPaintInvSupplier"
                            onchange="PaintInventoryModule.onSupplierChange_Edit('${d.type}')">
                        <option value="">-- 援щℓ泥??좏깮 --</option>
                        ${supplierOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">?꾨즺紐?<span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="editPaintInvMaterial" 
                            onchange="PaintInventoryModule.onMaterialChange_Edit('${d.type}')">
                        <option value="">-- 援щℓ泥?癒쇱? ?좏깮 --</option>
                    </select>
                </div>
            </div>
            <div id="editStockInfoArea" style="margin-bottom:15px; display:none;">
                <div style="background:var(--bg-primary); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:600; font-size:0.9rem;">?꾩옱怨??뺣낫</span>
                        <span id="editTotalStockDisplay" style="color:var(--accent-blue); font-weight:700;">-</span>
                    </div>
                    <div id="editLotStockList" style="font-size:0.8rem; color:var(--text-secondary); max-height:100px; overflow-y:auto;">
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?ъ옣 ?⑸웾 (?먮룞)</label>
                    <input type="text" class="form-input" id="editPaintInvPackUnit" readonly style="background:var(--bg-secondary);" value="${mat && mat.packUnit ? mat.packUnit + ' KG' : '-'}">
                </div>
                <div class="form-group">
                    <label class="form-label">
                        ${d.type === '異쒓퀬' ? '?쒖“ LOT' : '?쒖“??LOT'} <span style="color:var(--accent-red)">*</span>
                    </label>
                    ${d.type === '異쒓퀬'
                ? `<select class="form-select" id="editPaintInvLot" onchange="PaintInventoryModule.onLotSelectChange_Edit(); PaintInventoryModule.checkStockLive('edit');"><option value="">-- ?꾨즺 癒쇱? ?좏깮 --</option></select>`
                : `<input type="text" class="form-input" id="editPaintInvLot" placeholder="怨듦툒??LOT 肄붾뱶 (?좏깮)" value="${d.lotNo}">`
            }
                    <div id="editPaintInvLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">?섎웾 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="editPaintInvQty" min="0" value="${d.quantity}" oninput="PaintInventoryModule.checkStockLive('edit')">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
            <div id="editPaintInvStockWarning" style="display:none; margin-top:10px; padding:12px; background:rgba(244, 67, 54, 0.1); border:1px solid var(--accent-red); border-radius:6px; color:var(--accent-red); font-size:0.875rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px;">error</span>
                    <strong>?ш퀬 遺議?二쇱쓽</strong>
                </div>
                <p id="editPaintInvStockMsg" style="margin:5px 0 0 28px;"></p>
            </div>
            <div id="editFifoWarning" style="display:none; margin-top:10px; padding:10px; background:rgba(255, 152, 0, 0.1); border:1px solid var(--accent-orange); border-radius:6px; color:var(--accent-orange); font-size:0.85rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                    <strong>?좎엯?좎텧(FIFO) 寃쎄퀬</strong>
                </div>
                <p id="editFifoWarningMsg" style="margin:5px 0 0 26px;"></p>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">痍⑥냼</button>
            <button class="btn btn-primary" onclick="PaintInventoryModule.saveEdit('${id}', '${d.type}')">???/button>
        `);

        // 珥덇린媛??명똿 諛??꾩냽 泥섎━ (異쒓퀬 紐⑤뱶?먯꽌 targetLot = prodLot ?곗꽑)
        onSupplierChange_Edit(d.type, mat ? mat.id : null, d.type === '異쒓퀬' ? (d.prodLot || d.lotNo) : d.lotNo);
    }

    function onSupplierChange_Edit(type, targetMatId, targetLot) {
        const supplier = document.getElementById('editPaintInvSupplier').value;
        const nameSelect = document.getElementById('editPaintInvMaterial');
        const materials = Storage.getAll(MATERIALS_STORE);

        nameSelect.innerHTML = '<option value="">-- ?꾨즺紐??좏깮 --</option>';
        if (!supplier) return;

        const filtered = materials.filter(m => m.supplier === supplier);
        nameSelect.innerHTML = '<option value="">-- ?꾨즺紐??좏깮 --</option>' +
            filtered.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        if (targetMatId) {
            nameSelect.value = targetMatId;
            onMaterialChange_Edit(type, targetLot);
        } else if (filtered.length === 1) {
            nameSelect.value = filtered[0].id;
            onMaterialChange_Edit(type);
        }
    }

    function onMaterialChange_Edit(type, targetLot) {
        const matId = document.getElementById('editPaintInvMaterial').value;
        const stockArea = document.getElementById('editStockInfoArea');
        const lotSelect = document.getElementById('editPaintInvLot');
        const packUnitInput = document.getElementById('editPaintInvPackUnit');

        if (!matId) {
            if (stockArea) stockArea.style.display = 'none';
            if (type === '異쒓퀬' && lotSelect) lotSelect.innerHTML = '<option value="">-- ?꾨즺 癒쇱? ?좏깮 --</option>';
            if (packUnitInput) packUnitInput.value = '';
            return;
        }

        // ?ъ옣 ?⑸웾 ?먮룞 ?쒖떆
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (packUnitInput && mat) {
            packUnitInput.value = mat.packUnit ? (mat.packUnit + ' KG') : '-';
        }

        const data = Storage.getAll(STORE);

        // ?쒖“LOT 湲곗? 洹몃９??
        const prodLotMap = {};
        data.filter(d => d.materialId === matId).forEach(d => {
            const key = d.prodLot || d.lotNo || '__';
            if (!prodLotMap[key]) prodLotMap[key] = { qty: 0, lotNo: d.lotNo || '' };
            if (d.type === '異쒓퀬') prodLotMap[key].qty -= Number(d.quantity) || 0;
            else prodLotMap[key].qty += Number(d.quantity) || 0;
        });

        const totalStock = Object.values(prodLotMap).reduce((a, v) => a + v.qty, 0);

        if (stockArea) {
            stockArea.style.display = 'block';
            document.getElementById('editTotalStockDisplay').textContent = UIUtils.formatNumber(totalStock);
            const lotList = document.getElementById('editLotStockList');
            lotList.innerHTML = Object.entries(prodLotMap)
                .filter(([_, v]) => v.qty !== 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([lot, v]) => `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>?쒖“LOT: ${lot}</span><span>${UIUtils.formatNumber(v.qty)}</span></div>`)
                .join('') || '<div style="text-align:center; padding:5px;">?ш퀬 ?놁쓬</div>';
        }

        if (type === '異쒓퀬' && lotSelect) {
            const activeProdLots = Object.entries(prodLotMap)
                .filter(([key, v]) => v.qty > 0 || key === targetLot)
                .map(([key, _]) => key)
                .sort();

            lotSelect.innerHTML = '<option value="">-- ?쒖“ LOT ?좏깮 --</option>' +
                activeProdLots.map(l => `<option value="${l}" ${l === targetLot ? 'selected' : ''}>${l}</option>`).join('');

            if (targetLot) onLotSelectChange_Edit();
        }
    }

    function onLotSelectChange_Edit() {
        const lotSelect = document.getElementById('editPaintInvLot');
        const selectedLot = lotSelect.value;
        const warningArea = document.getElementById('editFifoWarning');
        const warningMsg = document.getElementById('editFifoWarningMsg');

        if (!selectedLot) {
            warningArea.style.display = 'none';
            return;
        }

        const options = Array.from(lotSelect.options).map(opt => opt.value).filter(val => val !== "");
        const oldestLot = options.sort()[0];

        if (selectedLot !== oldestLot) {
            warningArea.style.display = 'block';
            warningMsg.innerHTML = `?꾩옱 ?좏깮?섏떊 LOT(${selectedLot})蹂대떎 癒쇱? ?낃퀬??<strong>LOT(${oldestLot})</strong> 媛 ?덉뒿?덈떎.<br>?좎엯?좎텧???꾪빐 ?댁젏 ?좎쓽?섏떆湲?諛붾엻?덈떎.`;
        } else {
            warningArea.style.display = 'none';
        }
    }

    async function saveEdit(id, type) {
        const data = {
            date: document.getElementById('editPaintInvDate').value,
            type: type,
            materialId: document.getElementById('editPaintInvMaterial').value,
            lotNo: document.getElementById('editPaintInvLot').value.trim(),
            quantity: Number(document.getElementById('editPaintInvQty').value) || 0
        };

        if (!data.materialId) {
            UIUtils.toast('?꾨즺瑜??좏깮?섏꽭??', 'warning');
            return;
        }
        if (data.quantity <= 0) {
            UIUtils.toast('?섎웾???낅젰?섏꽭??', 'warning');
            return;
        }

        // ?섏젙 ??LOT蹂??ш퀬 寃利?(異쒓퀬 紐⑤뱶??prodLot 湲곗?)
        if (data.type === '異쒓퀬') {
            const allLogs = Storage.getAll(STORE);
            const selectedProdLot = data.lotNo; // select value = prodLot
            const otherLogs = allLogs.filter(l =>
                l.id !== id &&
                l.materialId === data.materialId &&
                (l.prodLot || l.lotNo) === selectedProdLot
            );
            const stockIn  = otherLogs.filter(l => l.type === '?낃퀬').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
            const stockOut = otherLogs.filter(l => l.type === '異쒓퀬').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
            const available = stockIn - stockOut;

            if (data.quantity > available) {
                checkStockLive('edit', id);
                const qtyInput = document.getElementById('editPaintInvQty');
                if (qtyInput) qtyInput.focus();
                return;
            }

            // prodLot / lotNo 遺꾨━ ???
            data.prodLot = selectedProdLot;
            const srcRec = allLogs.find(l => l.type === '?낃퀬' && l.materialId === data.materialId && l.lotNo);
            data.lotNo = srcRec ? srcRec.lotNo : selectedProdLot;
        }

        await Storage.executeTransaction([
            { store: STORE, op: 'update', id, data }
        ]);
        UIUtils.closeModal();
        UIUtils.toast('?섏젙?섏뿀?듬땲??', 'success');
        loadData();
    }

    function checkStockLive(scope, currentId = null) {
        const prefix = scope === 'add' ? 'add' : 'edit';
        const lotEl = document.getElementById(`${prefix}PaintInvLot`);
        const warningArea = document.getElementById(`${prefix}PaintInvStockWarning`);
        const warningMsg = document.getElementById(`${prefix}PaintInvStockMsg`);

        // ?낃퀬 紐⑤뱶(LOT ?꾨뱶媛 text input)?먯꽌???ш퀬 遺議?泥댄겕 遺덊븘??
        if (!lotEl || lotEl.tagName === 'INPUT') {
            if (warningArea) warningArea.style.display = 'none';
            return;
        }

        const matId = document.getElementById(`${prefix}PaintInvMaterial`).value;
        const lotNo = lotEl.value;
        const qty = Number(document.getElementById(`${prefix}PaintInvQty`).value) || 0;

        if (!matId || !lotNo || qty <= 0) {
            if (warningArea) warningArea.style.display = 'none';
            return;
        }

        const allLogs = Storage.getAll(STORE);
        // ?섏젙 紐⑤뱶??寃쎌슦 ?꾩옱 ??ぉ(currentId)???쒖쇅?섍퀬 怨꾩궛
        // 異쒓퀬 紐⑤뱶?먯꽌 lotNo???ㅼ젣 prodLot 媛믪쓣 ?닿퀬 ?덉쓬 ??prodLot ?곗꽑 留ㅼ묶
        const filtered = allLogs.filter(l =>
            (currentId ? l.id !== currentId : true) &&
            l.materialId === matId &&
            (l.prodLot || l.lotNo) === lotNo
        );

        const stockIn = filtered.filter(l => l.type === '?낃퀬').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
        const stockOut = filtered.filter(l => l.type === '異쒓퀬').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
        const available = stockIn - stockOut;

        if (qty > available) {
            if (warningArea) {
                warningArea.style.display = 'block';
                warningMsg.innerHTML = `?좏깮?섏떊 LOT???꾩옱 ?ш퀬??<strong>${UIUtils.formatNumber(available)}</strong> ?낅땲??<br>?낅젰?섏떊 ?섎웾(${UIUtils.formatNumber(qty)})???ш퀬瑜?珥덇낵?⑸땲??`;
            }
        } else {
            if (warningArea) warningArea.style.display = 'none';
        }
    }

    function showStockModal() {
        const data = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        // materialId 湲곗??쇰줈 ?꾩옱怨?+ LOT 吏묎퀎
        const stockMap = {};
        data.forEach(d => {
            if (!d.materialId) return;
            if (!stockMap[d.materialId]) {
                stockMap[d.materialId] = {
                    qty: 0,
                    lots: []
                };
            }
            if (d.type === '異쒓퀬') {
                stockMap[d.materialId].qty -= Number(d.quantity) || 0;
            } else {
                stockMap[d.materialId].qty += Number(d.quantity) || 0;
                if (d.lotNo && !stockMap[d.materialId].lots.includes(d.lotNo)) {
                    stockMap[d.materialId].lots.push(d.lotNo);
                }
            }
        });

        // ???곗씠??援ъ꽦 (援щℓ泥????쒗뭹紐????뺣젹)
        const rows = materials.map(mat => {
            const stock = stockMap[mat.id] || { qty: 0, lots: [] };
            const price = Number(mat ? mat.purchasePrice : 0) || 0;
            return {
                supplier: mat ? (mat.supplier || '-') : '-',
                name: mat ? mat.name : '(??젣???꾨즺)',
                unit: mat ? (mat.packUnit || '') : '',
                price: price,
                qty: stock.qty,
                value: stock.qty * price,
                lots: stock.lots
            };
        }).sort((a, b) => a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name));

        const totalValue = rows.reduce((sum, r) => sum + r.value, 0);

        const suppliers = [...new Set(rows.map(r => r.supplier).filter(s => s !== '-'))].sort();
        const supplierOptions = suppliers.map(s => `<option value="${s}">${s}</option>`).join('');

        const tableRows = rows.length === 0 ?
            `<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted);">?ш퀬 ?곗씠?곌? ?놁뒿?덈떎.</td></tr>` :
            rows.map(r => {
                const qtyColor = r.qty <= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                const lotBadges = r.lots.length > 0 ?
                    r.lots.map(l => `<span style="display:inline-block;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;padding:1px 7px;margin:2px 2px;font-size:0.78rem;color:var(--text-secondary);">${l}</span>`).join('') :
                    '<span style="color:var(--text-muted)">-</span>';
                return `
                    <tr data-supplier="${r.supplier}">
                        <td>${r.supplier}</td>
                        <td><strong>${r.name}</strong></td>
                        <td style="text-align:right;">${UIUtils.formatNumber(r.price)}</td>
                        <td style="text-align:right;font-weight:700;color:${qtyColor};">
                            ${UIUtils.formatNumber(r.qty)}<span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);margin-left:3px;">${r.unit ? r.unit + ' KG' : ''}</span>
                        </td>
                        <td style="text-align:right;font-weight:700;color:var(--text-primary);">
                            ${UIUtils.formatNumber(r.value)}
                        </td>
                        <td>${lotBadges}</td>
                    </tr>`;
            }).join('') + `
                    <tr style="background:var(--bg-secondary); font-weight:700;">
                        <td colspan="4" style="text-align:center;">?⑷퀎</td>
                        <td style="text-align:right; color:var(--accent-green); font-size:1.1rem;">
                            ${UIUtils.formatNumber(totalValue)}
                        </td>
                        <td></td>
                    </tr>
            `;

        UIUtils.showModal('?꾨즺 ?꾩옱 ?ш퀬 ?꾪솴', `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);">filter_alt</span>
                <select class="form-select" id="stockSupplierFilter" style="max-width:200px;"
                        onchange="PaintInventoryModule.filterStock()">
                    <option value="">?꾩껜 援щℓ泥?/option>
                    ${supplierOptions}
                </select>
                <span style="font-size:0.82rem;color:var(--text-muted);">珥?${rows.length}媛??덈ぉ</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>援щℓ泥?/th>
                            <th>?쒗뭹紐?/th>
                            <th style="text-align:right;">?④?</th>
                            <th style="text-align:right;">?꾩옱怨?/th>
                            <th style="text-align:right;">?ш났 湲덉븸</th>
                            <th>LOT</th>
                        </tr>
                    </thead>
                    <tbody id="stockTableBody">${tableRows}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">?リ린</button>
        `, 'lg');
    }

    function filterStock() {
        const supplier = document.getElementById('stockSupplierFilter').value;
        const rows = document.querySelectorAll('#stockTableBody tr');
        rows.forEach(row => {
            row.style.display = (!supplier || row.dataset.supplier === supplier) ? '' : 'none';
        });
    }

    function remove(id) {
        UIUtils.confirm('??젣?섏떆寃좎뒿?덇퉴?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('??젣?섏뿀?듬땲??', 'success');
            loadData();
        });
    }

    function clearAllInventory() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('??젣???ш퀬 ?곗씠?곌? ?놁뒿?덈떎.', 'warning');
            return;
        }
        UIUtils.confirm(
            `?꾨즺 李쎄퀬 ?낆텧怨??대젰 ?꾩껜(${data.length}嫄?瑜???젣?⑸땲??\n???묒뾽? ?섎룎由????놁뒿?덈떎. 怨꾩냽?섏떆寃좎뒿?덇퉴?`,
            async () => {
                const count = data.length;
                // N踰?猷⑦봽 ???saveAll([]) ?⑥씪 ?몃옖??뀡?쇰줈 ?꾩껜 ??젣
                await Storage.executeTransaction([
                    { store: STORE, op: 'saveAll', items: [] }
                ]);
                UIUtils.toast(`?꾨즺 ?ш퀬 ${count}嫄댁씠 ??젣?섏뿀?듬땲??`, 'success');
                loadData();
            }
        );
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('?곗씠?곌? ?놁뒿?덈떎.', 'warning');
            return;
        }
        const materials = Storage.getAll(MATERIALS_STORE);

        const headers = ['날짜', '구매처', '도료명', '포장 단위', 'LOT', '수량', '유형'];
        const rows = data.map(d => {
            const mat = materials.find(m => m.id === d.materialId);
            return [
                d.date,
                mat ? (mat.supplier || '') : '',
                mat ? mat.name : '',
                mat ? (mat.packUnit ? mat.packUnit + ' KG' : '') : '',
                d.lotNo || '',
                d.quantity,
                d.type
            ];
        });
        Storage.exportToCSV(headers, rows, '?꾨즺李쎄퀬_?ш퀬');
        UIUtils.toast('?대낫?닿린 ?꾨즺', 'success');
    }

    return {
        render,
        loadData,
        renderPaintInspStandby,
        cancelPaintInspectionStandby,
        cancelAllPaintInspectionStandby,
        renderSupplierTiles,
        showPaintDetail,
        _openDetailOutgoing,
        _saveDetailOutgoing,
        openIncomingModal,
        openBulkModal,
        _bulkParse,
        _bulkRenderPreview,
        _bulkLoadMasterTemplate,
        _bulkClearPaste,
        _bulkRemoveRow,
        _bulkSave,
        openIncomingFromInspection,
        autoFillProdLot,
        validateProdLot,
        openOutgoingModal,
        onLotInput,
        onSupplierChange,
        onMaterialChange,
        onLotSelectChange,
        edit,
        onSupplierChange_Edit,
        onMaterialChange_Edit,
        onLotSelectChange_Edit,
        saveEdit,
        saveNew,
        checkStockLive,
        showStockModal,
        filterStock,
        remove,
        clearAllInventory,
        exportData
    };
})();
