/**
 * 도료창고(입출고/재고현황) 모듈
 * 도료의 입출고 내역을 관리하고, 선입선출(FIFO)을 위한 재고 집계 및 경고 기능을 포함합니다.
 */

const PaintInventoryModule = (function() {
    const STORE          = DB.STORES.PAINT_INVENTORY;
    const MATERIALS_STORE = DB.STORES.PAINT_MATERIALS;

    // ── 페이지네이션 상태 ──────────────────────────────────────────
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
                        <button class="btn btn-outline" onclick="PaintInventoryModule.showStockModal()">
                            <span class="material-symbols-outlined">inventory_2</span> 현재 재고 보기
                        </button>
                        <button class="btn btn-danger" onclick="PaintInventoryModule.clearAllInventory()"
                            style="opacity:0.75;" title="도료 입출고 이력 전체 삭제">
                            <span class="material-symbols-outlined">delete_sweep</span> 재고 초기화
                        </button>
                    </div>
                </div>

                <!-- 도료 창고 입고 대기품 섹션 -->
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

                <!-- 공급사별 재고 현황 타일 -->
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
                                        <th>포장 용량</th>
                                        <th>제조사 LOT</th>
                                        <th>제조 LOT</th>
                                        <th>수량</th>
                                        <th>제조일자</th>
                                        <th>유효기간</th>
                                        <th>남은 유효기간</th>
                                        <th>유형</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="paintInvTableBody"></tbody>
                            </table>
                        </div>
                        <!-- 페이지네이션 영역 -->
                        <div id="paintInvPagination"></div>
                    </div>
                </div>
            </div>
        `;
        loadData();
    }

    function loadData() {
        // ── 전체 데이터 (통계·재고 카드 계산용) ─────────────────────────
        const allData  = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        // 품목별 재고 합산 (전체 기준)
        const byMaterial = {};
        allData.forEach(d => {
            const mat = materials.find(m => m.id === d.materialId);
            const key = mat ? (mat.name + (mat.color ? ' (' + mat.color + ')' : '')) : '미분류';
            if (!byMaterial[key]) byMaterial[key] = {
                qty: 0,
                packUnit: mat ? (mat.packUnit || '-') : '-'
            };
            if (d.type === '출고') {
                byMaterial[key].qty -= Number(d.quantity) || 0;
            } else {
                byMaterial[key].qty += Number(d.quantity) || 0;
            }
        });

        let totalStockValue = 0;
        allData.forEach(d => {
            const mat = materials.find(m => m.id === d.materialId);
            const price = Number(mat ? mat.purchasePrice : 0) || 0;
            const qty = Number(d.quantity) || 0;
            const value = qty * price;

            if (d.type === '출고') {
                totalStockValue -= value;
            } else {
                totalStockValue += value;
            }
        });

        const totalStock    = Object.values(byMaterial).reduce((s, v) => s + v.qty, 0);
        const materialCount = Object.keys(byMaterial).length;

        document.getElementById('paintInvStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재고 합산</div>
            </div>
            <div class="stat-card green" style="border-bottom: 4px solid var(--accent-green);">
                <div class="stat-card-value" style="color:var(--accent-green);">${UIUtils.formatNumber(totalStockValue)}</div>
                <div class="stat-card-label">총 재공 금액 (₩)</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${materialCount}</div>
                <div class="stat-card-label">분류 수</div>
            </div>
        `;

        // ★ 입고 대기 섹션 + 공급사 타일은 항상 렌더링
        setTimeout(() => {
            renderPaintInspStandby();
            renderSupplierTiles();
        }, 150);

        // ── 페이징된 테이블 렌더링 ───────────────────────────────────────
        const { data, total, page, pageSize } = Storage.getAllPaged(STORE, {
            page:     _page,
            pageSize: _pageSize,
            sort:     { field: 'date', order: 'desc' }
        });
        _page = page; // 범위 초과 시 clamp 결과 반영

        const tbody = document.getElementById('paintInvTableBody');

        if (total === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>`;
            const pEl = document.getElementById('paintInvPagination');
            if (pEl) pEl.innerHTML = '';
            return;
        }

        if (tbody) tbody.innerHTML = data.map(d => {
            const typeBadge = d.type === '출고' ? 'danger' : 'success';
            const mat = materials.find(m => m.id === d.materialId);
            const mName = mat ? mat.name : '-';
            const mPackUnit = mat ? (mat.packUnit ? mat.packUnit + ' KG' : '-') : '-';

            const mSupplier = mat ? (mat.supplier || '-') : '-';

            // 남은 유효기간 계산
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
                    <td>${UIUtils.badge(d.type || '입고', typeBadge)}</td>
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

        // ── 페이지네이션 UI 렌더링 ───────────────────────────────────────
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

    // ── 공급사별 재고 카드 HTML ────────────────────────────────────────
    function _buildSupplierCard(supplier, matItems) {
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const rows = matItems
            .sort((a, b) => (a.paintType || '').localeCompare(b.paintType || '') || a.name.localeCompare(b.name))
            .map(item => {
                // 유효기간 경고 표시
                let expHtml = '';
                if (item.minExpDate) {
                    const exp = new Date(item.minExpDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    if (diff < 0) {
                        expHtml = `<span title="유효기간 만료" style="color:var(--accent-red);font-size:0.75rem;font-weight:700;margin-left:4px;">⚠만료</span>`;
                    } else if (diff <= 30) {
                        expHtml = `<span title="${diff}일 남음" style="color:var(--accent-orange,#f59e0b);font-size:0.75rem;font-weight:700;margin-left:4px;">⚠${diff}일</span>`;
                    }
                }
                // 유형 뱃지 (Primer/Color/희석제 등)
                const typeColors = { 'Primer': '#6366f1', 'Color': '#ec4899', '희석제': '#0ea5e9', '경화제': '#f59e0b' };
                const typeBg = typeColors[item.paintType] || '#6b7280';
                const typeBadge = item.paintType
                    ? `<span style="font-size:0.68rem;background:${typeBg};color:#fff;border-radius:3px;padding:1px 5px;margin-right:4px;">${item.paintType}</span>`
                    : '';

                // 활성 LOT 인라인 뱃지 (도료명과 같은 행)
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
                        ${hasExpWarn ? '⚠ ' : ''}${supplier}
                    </span>
                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.85); font-weight:600;">
                        ${matItems.length}종
                    </span>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--bg-secondary);">
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:left;">도료명 / 제조LOT</th>
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:center;">포장</th>
                            <th style="padding:4px 8px; font-size:0.72rem; color:var(--text-muted); font-weight:500; text-align:right;">재고</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="padding:5px 8px; background:var(--bg-secondary);
                            border-top:2px solid var(--border-color);
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.78rem; color:var(--text-muted);">합계</span>
                    <span style="font-size:0.88rem; font-weight:800; color:var(--accent-blue);">
                        ${UIUtils.formatNumber(totalStock)} 개
                    </span>
                </div>
            </div>
        `;
    }

    // ── 공급사별 재고 타일 (Greedy bin-packing) ───────────────────────
    function renderSupplierTiles() {
        const tilesEl = document.getElementById('paintSupplierTiles');
        if (!tilesEl) return;

        const data      = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        // ── 재료별 순 재고 + LOT별 집계 ────────────────────────────
        const matStock = {};  // matId -> { stock, lots: {key->{prodLot,lotNo,qty,expDate}} }
        data.forEach(d => {
            if (!d.materialId) return;
            if (!matStock[d.materialId]) matStock[d.materialId] = { stock: 0, lots: {} };
            const qty = Number(d.quantity) || 0;
            // 제조 LOT(prodLot) 우선, 없으면 제조사 LOT(lotNo) 키로 구분
            const lotKey = (d.prodLot || d.lotNo || '__');
            if (!matStock[d.materialId].lots[lotKey]) {
                matStock[d.materialId].lots[lotKey] = {
                    prodLot: d.prodLot || '',
                    lotNo:   d.lotNo   || '',
                    qty: 0,
                    expDate: d.expDate || ''
                };
            }
            if (d.type === '출고') {
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

        // 활성 LOT 정렬 + 최소 유효기간
        Object.keys(matStock).forEach(mid => {
            const activeLots = Object.values(matStock[mid].lots)
                .filter(l => l.qty > 0)
                .sort((a, b) => (a.prodLot || a.lotNo).localeCompare(b.prodLot || b.lotNo));
            matStock[mid].activeLots = activeLots;
            const withExp = activeLots.filter(l => l.expDate);
            matStock[mid].minExpDate = withExp.length > 0 ? withExp.map(l => l.expDate).sort()[0] : null;
        });

        // ── 공급사별 그룹핑 (재고 > 0) ─────────────────────────────
        const bySupplier = {};
        materials.forEach(mat => {
            const ms = matStock[mat.id];
            if (!ms || ms.stock <= 0) return;
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
            tilesEl.innerHTML = `<p style="color:var(--text-muted); padding:20px;">재고 데이터가 없습니다.</p>`;
            return;
        }

        // 품목 수 내림차순 정렬
        entries.sort(([, a], [, b]) => b.length - a.length || a[0].name.localeCompare(b[0].name));

        // 컬럼 수 결정
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

    // ── 도료 품목 상세 팝업 ───────────────────────────────────────────
    function showPaintDetail(matId) {
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (!mat) { UIUtils.toast('도료 정보를 찾을 수 없습니다.', 'error'); return; }

        const data = Storage.getAll(STORE);
        const records = data
            .filter(d => d.materialId === matId)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 현재 재고 및 LOT별 집계
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
            if (d.type === '출고') { lotMap[key].qty -= qty; totalStock -= qty; }
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

        // 활성 LOT 행
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
                    expHtml = `<span style="color:${color};font-weight:600;">${l.expDate} (${diff < 0 ? '만료' : diff + '일 남음'})</span>`;
                }
                const prodLotEsc = (l.prodLot || '').replace(/'/g, "\\'");
                const lotNoEsc   = (l.lotNo   || '').replace(/'/g, "\\'");
                return `
                    <tr style="cursor:pointer;" title="클릭하여 출고 등록"
                        onclick="PaintInventoryModule._openDetailOutgoing('${matId}','${prodLotEsc}','${lotNoEsc}',${l.qty})"
                        onmouseover="this.style.background='rgba(239,68,68,0.07)'"
                        onmouseout="this.style.background=''">
                        <td style="font-family:monospace;font-weight:700;">${l.prodLot || '-'}</td>
                        <td style="font-family:monospace;color:var(--text-muted);">${l.lotNo || '-'}</td>
                        <td style="text-align:center;">${l.mfgDate || '-'}</td>
                        <td>${expHtml}</td>
                        <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(l.qty)}</td>
                        <td style="text-align:center;padding:4px 8px;">
                            <span style="font-size:0.7rem;background:#fee2e2;color:#dc2626;border-radius:4px;padding:2px 6px;white-space:nowrap;">출고</span>
                        </td>
                    </tr>`;
            }).join('')
            : `<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-muted);">재고 없음</td></tr>`;

        // 입출고 이력 (최근 15건)
        const histRows = records.slice(0, 15).map(d => {
            const qty = Number(d.quantity) || 0;
            const badge = d.type === '출고'
                ? `<span style="background:#fee2e2;color:#dc2626;padding:1px 7px;border-radius:4px;font-size:0.75rem;font-weight:600;">출고</span>`
                : `<span style="background:#dcfce7;color:#16a34a;padding:1px 7px;border-radius:4px;font-size:0.75rem;font-weight:600;">입고</span>`;
            return `
                <tr>
                    <td style="white-space:nowrap;">${(d.date || '-').slice(0, 10)}</td>
                    <td style="font-family:monospace;">${d.prodLot || '-'}</td>
                    <td style="font-family:monospace;color:var(--text-muted);">${d.lotNo || '-'}</td>
                    <td style="text-align:right;font-weight:600;color:${d.type === '출고' ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${d.type === '출고' ? '-' : '+'}${UIUtils.formatNumber(qty)}
                    </td>
                    <td>${badge}</td>
                </tr>`;
        }).join('') || `<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-muted);">이력 없음</td></tr>`;

        const typeColors = { 'Primer': '#6366f1', 'Color': '#ec4899', '희석제': '#0ea5e9', '경화제': '#f59e0b' };
        const typeBg  = typeColors[mat.paintType || mat.type || ''] || '#6b7280';
        const typeBadge = (mat.paintType || mat.type)
            ? `<span style="font-size:0.75rem;background:${typeBg};color:#fff;border-radius:4px;padding:2px 8px;margin-right:6px;">${mat.paintType || mat.type}</span>`
            : '';

        UIUtils.showModal(
            `🎨 ${mat.name}`,
            `
            <!-- 기본 정보 -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding:12px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span>${typeBadge}<strong>${mat.name}</strong></span>
                <span style="color:var(--text-muted);">|</span>
                <span>공급사: <strong>${mat.supplier || '-'}</strong></span>
                <span style="color:var(--text-muted);">|</span>
                <span>포장: <strong>${mat.packUnit ? mat.packUnit + ' KG' : '-'}</strong></span>
                ${price > 0 ? `<span style="color:var(--text-muted);">|</span><span>단가: <strong>${UIUtils.formatNumber(price)}원</strong></span>` : ''}
            </div>
            <!-- 요약 카드 -->
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(totalStock)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">현재 재고 (개)</div>
                </div>
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple,#7c3aed);">${activeLots.length}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">활성 LOT 수</div>
                </div>
                ${price > 0 ? `
                <div style="flex:1;min-width:110px;background:var(--bg-secondary);border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(stockValue)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">재고 금액 (₩)</div>
                </div>` : ''}
            </div>
            <!-- 활성 LOT 테이블 -->
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--text-primary);">
                📦 현재 보유 LOT
            </div>
            <div style="overflow-x:auto;margin-bottom:18px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>제조 LOT</th>
                            <th>제조사 LOT</th>
                            <th style="text-align:center;">제조일자</th>
                            <th>유효기간</th>
                            <th style="text-align:right;">재고 수량</th>
                            <th style="text-align:center;">출고</th>
                        </tr>
                    </thead>
                    <tbody>${lotRows}</tbody>
                </table>
            </div>
            <!-- 입출고 이력 -->
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--text-primary);">
                📋 입출고 이력 <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">(최근 15건)</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>제조 LOT</th>
                            <th>제조사 LOT</th>
                            <th style="text-align:right;">수량</th>
                            <th style="text-align:center;">유형</th>
                        </tr>
                    </thead>
                    <tbody>${histRows}</tbody>
                </table>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'lg'
        );
    }

    // ── 도료 상세 팝업에서 LOT 클릭 → 즉시 출고 등록 ────────────────
    async function _openDetailOutgoing(matId, prodLot, lotNo, currentQty) {
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (!mat) { UIUtils.toast('도료 정보를 찾을 수 없습니다.', 'error'); return; }

        const todayStr = UIUtils.today();
        const qtyMax   = Number(currentQty) || 0;
        const lotLabel = prodLot || lotNo || '-';

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);">output</span> 도료 출고 등록`,
            `<div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span style="font-weight:700;">${mat.name}</span>
                <span style="color:var(--text-muted);margin:0 8px;">|</span>
                <span>제조 LOT: <strong style="font-family:monospace;">${lotLabel}</strong></span>
                <span style="color:var(--text-muted);margin:0 8px;">|</span>
                <span>현재 재고: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(qtyMax)} 개</strong></span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="detailOutDate" value="${todayStr}">
                </div>
                <div class="form-group">
                    <label class="form-label">출고 수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="detailOutQty" min="1" max="${qtyMax}"
                           placeholder="최대 ${UIUtils.formatNumber(qtyMax)}"
                           oninput="this.value=Math.min(Math.max(this.value,1),${qtyMax})">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고 (선택)</label>
                <input type="text" class="form-input" id="detailOutMemo" placeholder="출고 용도 또는 메모">
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="PaintInventoryModule._saveDetailOutgoing('${matId}','${prodLot}','${lotNo}')">출고 등록</button>`
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

        if (!date) { UIUtils.toast('출고 일자를 선택하세요.', 'warning'); return; }
        if (qty <= 0) { UIUtils.toast('출고 수량을 입력하세요.', 'warning'); return; }

        // 현재 재고 재검증
        const allLogs = Storage.getAll(STORE);
        const lotLogs = allLogs.filter(l =>
            l.materialId === matId &&
            (l.prodLot || l.lotNo) === (prodLot || lotNo)
        );
        const stockIn  = lotLogs.filter(l => l.type === '입고').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const stockOut = lotLogs.filter(l => l.type === '출고').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const available = stockIn - stockOut;

        if (qty > available) {
            UIUtils.toast(`재고 부족 — 출고 가능 수량: ${UIUtils.formatNumber(available)} 개`, 'error');
            return;
        }

        const data = {
            date:       date,
            type:       '출고',
            materialId: matId,
            prodLot:    prodLot || '',
            lotNo:      lotNo   || prodLot || '',
            quantity:   qty,
            mfgDate:    '',
            expDate:    '',
            memo:       memo,
            sourceInspectionId: ''
        };

        // executeTransaction: 단일 스토어지만 향후 연관 스토어 추가를 대비해 통일
        await Storage.executeTransaction([
            { store: STORE, op: 'add', data }
        ]);
        UIUtils.toast('출고 등록되었습니다.', 'success');
        // 출고 모달 닫기 → 상위 상세 팝업도 닫고 최신 상태로 다시 열기
        UIUtils.closeModal(); // 출고 등록 모달
        UIUtils.closeModal(); // 상세 팝업
        loadData();
        setTimeout(() => showPaintDetail(matId), 150);
    }

    // ── 도료 수입 검사 완료품 입고 대기 섹션 ──────────────────────────
    function renderPaintInspStandby() {
        const body  = document.getElementById('paintInspStandbyBody');
        const badge = document.getElementById('paintInspStandbyBadge');
        if (!body) return;

        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.PAINT_INVENTORY)           || [];
        const materials   = Storage.getAll(DB.STORES.PAINT_MATERIALS)           || [];

        // 합격 검사 목록
        const passed = inspections
            .filter(i => i.verdict === '합격' && (Number(i.incomingQty) || 0) > 0)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (passed.length === 0) {
            if (badge) badge.style.display = 'none';
            body.innerHTML = `<p style="text-align:center; padding:18px; color:var(--text-muted); font-size:0.88rem;">도료 수입 검사 완료 데이터가 없습니다.</p>`;
            return;
        }

        // 창고 입고 기록: sourceInspectionId 기준 Set (없으면 materialId+lotNo 폴백)
        const processedInspIds = new Set(
            inventory.filter(i => i.type === '입고' && i.sourceInspectionId).map(i => i.sourceInspectionId)
        );
        const legacyStockSet = new Set(
            inventory.filter(i => i.type === '입고' && !i.sourceInspectionId).map(i => `${i.materialId}||${i.lotNo}`)
        );

        // paintName → materialId 매핑 헬퍼
        function getMaterialId(paintName) {
            const mat = materials.find(m => m.name === paintName);
            return mat ? mat.id : null;
        }

        const pending = passed.filter(i => {
            if (processedInspIds.has(i.id)) return false;
            const mid = getMaterialId(i.paintName);
            if (mid && legacyStockSet.has(`${mid}||${i.lotNo}`)) return false;
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

        // 대기 품목이 없으면 완료 메시지 표시
        if (pending.length === 0) {
            body.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:18px;color:var(--accent-green);font-size:0.9rem;">
                    <span class="material-symbols-outlined">check_circle</span>
                    <span>입고 대기 품목이 없습니다. 모든 검사 완료품이 입고 처리되었습니다.</span>
                </div>`;
            return;
        }

        // 입고 대기 항목만 렌더링 (입고 완료된 항목 제외)
        body.innerHTML = `
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
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // 제조 LOT 실시간 유효성 표시
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
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 유효하지 않은 날짜입니다 (월: ${mm}, 일: ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
        } else {
            msg.innerHTML = `<span style="color:var(--accent-green);">✓ 20${yy}년 ${String(mm).padStart(2,'0')}월 ${String(dd).padStart(2,'0')}일</span>`;
            input.style.borderColor = 'var(--accent-green)';
        }
    }

    // 제조일자(YYYY-MM-DD) → 제조 LOT(YYMMDD) 자동 변환
    function autoFillProdLot(dateVal) {
        const prodLotEl = document.getElementById('addPaintInvProdLot');
        if (!prodLotEl) return;
        if (!dateVal) { prodLotEl.placeholder = '제조 LOT'; return; }
        // YYYY-MM-DD → YYMMDD
        const m = dateVal.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/);
        if (m) {
            prodLotEl.value = m[2] + m[3] + m[4]; // YY + MM + DD
        }
    }

    // 도료 검사 기록으로부터 입고 모달 자동 채움
    function openIncomingFromInspection(inspId) {
        const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('검사 정보를 찾을 수 없습니다.', 'error'); return; }

        // 검사 기록의 supplier가 마스터와 다를 수 있으므로(오타 등) paintName 우선 매칭
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.name === insp.paintName && m.supplier === insp.supplier)
                 || materials.find(m => m.name === insp.paintName);

        // 실제 사용할 supplier는 마스터 기준으로 결정
        const resolvedSupplier = mat ? (mat.supplier || insp.supplier || '') : (insp.supplier || '');

        window._sourceInspectionId = inspId;
        showRegistrationModal('입고');
        setTimeout(() => {
            const supplierSel = document.getElementById('addPaintInvSupplier');
            if (supplierSel) {
                supplierSel.value = resolvedSupplier;
                PaintInventoryModule.onSupplierChange('입고');
            }
            setTimeout(() => {
                const matSel = document.getElementById('addPaintInvMaterial');
                if (matSel && mat) {
                    matSel.value = mat.id;
                    PaintInventoryModule.onMaterialChange('입고');
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
        showRegistrationModal('입고');
    }

    function openOutgoingModal() {
        showRegistrationModal('출고');
    }

    function showRegistrationModal(type) {
        const materials = Storage.getAll(MATERIALS_STORE);

        if (materials.length === 0) {
            UIUtils.toast('등록된 도료 정보가 없습니다. 관리/설정에서 도료를 먼저 등록해주세요.', 'warning');
            return;
        }

        const suppliers = [...new Set(materials.map(m => m.supplier).filter(Boolean))].sort();
        const supplierOptions = suppliers.map(s => `<option value="${s}">${s}</option>`).join('');

        UIUtils.showModal(`도료 ${type} 등록`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="addPaintInvDate" value="${UIUtils.today()}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="addPaintInvSupplier"
                            onchange="PaintInventoryModule.onSupplierChange('${type}')">
                        <option value="">-- 구매처 선택 --</option>
                        ${supplierOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="addPaintInvMaterial" 
                            onchange="PaintInventoryModule.onMaterialChange('${type}')">
                        <option value="">-- 구매처 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div id="stockInfoArea" style="margin-bottom:15px; display:none;">
                <div style="background:var(--bg-primary); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:600; font-size:0.9rem;">현재고 정보</span>
                        <span id="totalStockDisplay" style="color:var(--accent-blue); font-weight:700;">-</span>
                    </div>
                    <div id="lotStockList" style="font-size:0.8rem; color:var(--text-secondary); max-height:100px; overflow-y:auto;">
                        <!-- LOT별 재고 목록 -->
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">포장 용량 (자동)</label>
                    <input type="text" class="form-input" id="addPaintInvPackUnit" readonly style="background:var(--bg-secondary);" placeholder="도료를 선택하세요">
                </div>
                <div class="form-group">
                    <label class="form-label">
                        ${type === '출고'
                            ? '제조 LOT <span style="color:var(--accent-red)">*</span>'
                            : '제조사 LOT <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:4px;">(선택)</span>'}
                    </label>
                    ${type === '출고'
                ? `<select class="form-select" id="addPaintInvLot" onchange="PaintInventoryModule.onLotSelectChange(); PaintInventoryModule.checkStockLive('add');"><option value="">-- 도료 먼저 선택 --</option></select>`
                : `<input type="text" class="form-input" id="addPaintInvLot" placeholder="공급사 LOT 코드 (선택)">`
            }
                    <div id="addPaintInvLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
            </div>
            ${type === '입고' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">
                        제조 LOT <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:4px;">YYMMDD · 자사 내부 관리 LOT</span>
                    </label>
                    <input type="text" class="form-input" id="addPaintInvProdLot" placeholder="예: 260227" maxlength="6" inputmode="numeric"
                        oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6); PaintInventoryModule.validateProdLot(this);">
                    <div id="addPaintInvProdLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>` : ''}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="addPaintInvQty" min="0" placeholder="0" oninput="PaintInventoryModule.checkStockLive('add')">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
            ${type === '입고' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조일자</label>
                    <input type="date" class="form-input" id="addPaintInvMfgDate"
                        onchange="PaintInventoryModule.autoFillProdLot(this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">유효기간</label>
                    <input type="date" class="form-input" id="addPaintInvExpDate">
                </div>
            </div>` : ''}
            <div id="addPaintInvStockWarning" style="display:none; margin-top:10px; padding:12px; background:rgba(244, 67, 54, 0.1); border:1px solid var(--accent-red); border-radius:6px; color:var(--accent-red); font-size:0.875rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px;">error</span>
                    <strong>재고 부족 주의</strong>
                </div>
                <p id="addPaintInvStockMsg" style="margin:5px 0 0 28px;"></p>
            </div>
            <div id="fifoWarning" style="display:none; margin-top:10px; padding:10px; background:rgba(255, 152, 0, 0.1); border:1px solid var(--accent-orange); border-radius:6px; color:var(--accent-orange); font-size:0.85rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                    <strong>선입선출(FIFO) 경고</strong>
                </div>
                <p id="fifoWarningMsg" style="margin:5px 0 0 26px;"></p>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintInventoryModule.saveNew('${type}')">등록</button>
        `);
    }

    function onSupplierChange(type) {
        const supplier = document.getElementById('addPaintInvSupplier').value;
        const nameSelect = document.getElementById('addPaintInvMaterial');
        const materials = Storage.getAll(MATERIALS_STORE);

        nameSelect.innerHTML = '<option value="">-- 도료명 선택 --</option>';
        if (!supplier) return;

        const filtered = materials.filter(m => m.supplier === supplier);
        nameSelect.innerHTML = '<option value="">-- 도료명 선택 --</option>' +
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
            if (type === '출고' && lotSelect) lotSelect.innerHTML = '<option value="">-- 도료 먼저 선택 --</option>';
            if (packUnitInput) packUnitInput.value = '';
            return;
        }

        // 포장단위 자동 표시
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (packUnitInput && mat) {
            packUnitInput.value = mat.packUnit ? (mat.packUnit + ' KG') : '-';
        }

        const data = Storage.getAll(STORE);

        // 제조LOT(prodLot) 기준 재고 계산 (없으면 lotNo 폴백)
        const prodLotMap = {};  // key = prodLot||lotNo → { qty, lotNo }
        data.filter(d => d.materialId === matId).forEach(d => {
            const key = d.prodLot || d.lotNo || '__';
            if (!prodLotMap[key]) prodLotMap[key] = { qty: 0, lotNo: d.lotNo || '' };
            if (d.type === '출고') prodLotMap[key].qty -= Number(d.quantity) || 0;
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
                .map(([lot, v]) => `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>제조LOT: ${lot}</span><span>${UIUtils.formatNumber(v.qty)}</span></div>`)
                .join('') || '<div style="text-align:center; padding:5px;">재고 없음</div>';
        }

        if (type === '출고' && lotSelect) {
            const activeProdLots = Object.entries(prodLotMap)
                .filter(([_, v]) => v.qty > 0)
                .map(([key, _]) => key)
                .sort();

            lotSelect.innerHTML = '<option value="">-- 제조 LOT 선택 --</option>' +
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

        // 선입선출 체크
        const options = Array.from(lotSelect.options)
            .map(opt => opt.value)
            .filter(val => val !== "");

        const oldestLot = options.sort()[0];

        if (selectedLot !== oldestLot) {
            warningArea.style.display = 'block';
            warningMsg.innerHTML = `현재 선택하신 LOT(${selectedLot})보다 먼저 입고된 <strong>LOT(${oldestLot})</strong> 가 있습니다.<br>선입선출을 위해 이점 유의하시기 바랍니다.`;
        } else {
            warningArea.style.display = 'none';
        }
    }

    function onLotInput() {} // 제조사 LOT 형식 제한 없음 — 공급사 자체 코드

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
            sourceInspectionId: (type === '입고' && window._sourceInspectionId) ? window._sourceInspectionId : ''
        };
        if (type === '입고') window._sourceInspectionId = null;

        if (!data.materialId) {
            UIUtils.toast('도료를 선택하세요.', 'warning');
            return;
        }
        // 제조 LOT — 입고 시 필수 (YYMMDD 6자리)
        if (type === '입고') {
            if (!data.prodLot) {
                UIUtils.toast('제조 LOT를 입력하세요. (YYMMDD 6자리)', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
            if (!/^\d{6}$/.test(data.prodLot)) {
                UIUtils.toast('제조 LOT는 숫자 6자리(YYMMDD) 형식이어야 합니다.', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
            const pm = parseInt(data.prodLot.slice(2, 4), 10);
            const pd = parseInt(data.prodLot.slice(4, 6), 10);
            if (pm < 1 || pm > 12 || pd < 1 || pd > 31) {
                UIUtils.toast('제조 LOT의 월/일 값이 유효하지 않습니다.', 'warning');
                const prodLotInput = document.getElementById('addPaintInvProdLot');
                if (prodLotInput) prodLotInput.focus();
                return;
            }
        }
        if (data.quantity <= 0) {
            UIUtils.toast('수량을 입력하세요.', 'warning');
            return;
        }

        // 출고 시 prodLot 기준 재고 검증 + lotNo 역조회
        if (data.type === '출고') {
            const allLogs = Storage.getAll(STORE);
            // select 값이 prodLot이므로 prodLot 기준 매칭
            const selectedProdLot = data.lotNo; // select value → prodLot
            const lotLogs = allLogs.filter(l =>
                l.materialId === data.materialId &&
                (l.prodLot || l.lotNo) === selectedProdLot
            );
            const stockIn  = lotLogs.filter(l => l.type === '입고').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const stockOut = lotLogs.filter(l => l.type === '출고').reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const available = stockIn - stockOut;

            if (data.quantity > available) {
                checkStockLive('add');
                const qtyInput = document.getElementById('addPaintInvQty');
                if (qtyInput) qtyInput.focus();
                return;
            }

            // prodLot / lotNo 분리 저장
            data.prodLot = selectedProdLot;
            const srcRec = lotLogs.find(l => l.type === '입고' && l.lotNo);
            data.lotNo = srcRec ? srcRec.lotNo : selectedProdLot;
        }

        // ── executeTransaction: 작업 목록 구성 ──────────────────────────
        const txOps = [{ store: STORE, op: 'add', data }];

        // 수입검사 연동 입고 시: 검사 레코드에 창고입고 완료 상태 원자적 기록
        // (한쪽만 성공하는 불일치 상태 방지)
        const sourceInspId = data.sourceInspectionId;
        if (type === '입고' && sourceInspId) {
            txOps.push({
                store: DB.STORES.PAINT_INCOMING_INSPECTIONS,
                op:    'update',
                id:    sourceInspId,
                data:  { warehouseStatus: '입고완료', warehouseDate: data.date }
            });
        }

        await Storage.executeTransaction(txOps);
        UIUtils.closeModal();
        UIUtils.toast('등록되었습니다.', 'success');
        loadData();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === d.materialId);
        const suppliers = [...new Set(materials.map(m => m.supplier).filter(Boolean))].sort();
        const supplierOptions = suppliers.map(s => `<option value="${s}" ${mat && mat.supplier === s ? 'selected' : ''}>${s}</option>`).join('');

        UIUtils.showModal(`도료 ${d.type} 내역 수정`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="editPaintInvDate" value="${d.date}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="editPaintInvSupplier"
                            onchange="PaintInventoryModule.onSupplierChange_Edit('${d.type}')">
                        <option value="">-- 구매처 선택 --</option>
                        ${supplierOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="editPaintInvMaterial" 
                            onchange="PaintInventoryModule.onMaterialChange_Edit('${d.type}')">
                        <option value="">-- 구매처 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div id="editStockInfoArea" style="margin-bottom:15px; display:none;">
                <div style="background:var(--bg-primary); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:600; font-size:0.9rem;">현재고 정보</span>
                        <span id="editTotalStockDisplay" style="color:var(--accent-blue); font-weight:700;">-</span>
                    </div>
                    <div id="editLotStockList" style="font-size:0.8rem; color:var(--text-secondary); max-height:100px; overflow-y:auto;">
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">포장 용량 (자동)</label>
                    <input type="text" class="form-input" id="editPaintInvPackUnit" readonly style="background:var(--bg-secondary);" value="${mat && mat.packUnit ? mat.packUnit + ' KG' : '-'}">
                </div>
                <div class="form-group">
                    <label class="form-label">
                        ${d.type === '출고' ? '제조 LOT' : '제조사 LOT'} <span style="color:var(--accent-red)">*</span>
                    </label>
                    ${d.type === '출고'
                ? `<select class="form-select" id="editPaintInvLot" onchange="PaintInventoryModule.onLotSelectChange_Edit(); PaintInventoryModule.checkStockLive('edit');"><option value="">-- 도료 먼저 선택 --</option></select>`
                : `<input type="text" class="form-input" id="editPaintInvLot" placeholder="공급사 LOT 코드 (선택)" value="${d.lotNo}">`
            }
                    <div id="editPaintInvLotMsg" style="font-size:0.75rem;margin-top:5px;min-height:16px;"></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="editPaintInvQty" min="0" value="${d.quantity}" oninput="PaintInventoryModule.checkStockLive('edit')">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
            <div id="editPaintInvStockWarning" style="display:none; margin-top:10px; padding:12px; background:rgba(244, 67, 54, 0.1); border:1px solid var(--accent-red); border-radius:6px; color:var(--accent-red); font-size:0.875rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px;">error</span>
                    <strong>재고 부족 주의</strong>
                </div>
                <p id="editPaintInvStockMsg" style="margin:5px 0 0 28px;"></p>
            </div>
            <div id="editFifoWarning" style="display:none; margin-top:10px; padding:10px; background:rgba(255, 152, 0, 0.1); border:1px solid var(--accent-orange); border-radius:6px; color:var(--accent-orange); font-size:0.85rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                    <strong>선입선출(FIFO) 경고</strong>
                </div>
                <p id="editFifoWarningMsg" style="margin:5px 0 0 26px;"></p>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintInventoryModule.saveEdit('${id}', '${d.type}')">저장</button>
        `);

        // 초기값 세팅 및 후속 처리 (출고 모드에서 targetLot = prodLot 우선)
        onSupplierChange_Edit(d.type, mat ? mat.id : null, d.type === '출고' ? (d.prodLot || d.lotNo) : d.lotNo);
    }

    function onSupplierChange_Edit(type, targetMatId, targetLot) {
        const supplier = document.getElementById('editPaintInvSupplier').value;
        const nameSelect = document.getElementById('editPaintInvMaterial');
        const materials = Storage.getAll(MATERIALS_STORE);

        nameSelect.innerHTML = '<option value="">-- 도료명 선택 --</option>';
        if (!supplier) return;

        const filtered = materials.filter(m => m.supplier === supplier);
        nameSelect.innerHTML = '<option value="">-- 도료명 선택 --</option>' +
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
            if (type === '출고' && lotSelect) lotSelect.innerHTML = '<option value="">-- 도료 먼저 선택 --</option>';
            if (packUnitInput) packUnitInput.value = '';
            return;
        }

        // 포장 용량 자동 표시
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => m.id === matId);
        if (packUnitInput && mat) {
            packUnitInput.value = mat.packUnit ? (mat.packUnit + ' KG') : '-';
        }

        const data = Storage.getAll(STORE);

        // 제조LOT 기준 그룹핑
        const prodLotMap = {};
        data.filter(d => d.materialId === matId).forEach(d => {
            const key = d.prodLot || d.lotNo || '__';
            if (!prodLotMap[key]) prodLotMap[key] = { qty: 0, lotNo: d.lotNo || '' };
            if (d.type === '출고') prodLotMap[key].qty -= Number(d.quantity) || 0;
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
                .map(([lot, v]) => `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>제조LOT: ${lot}</span><span>${UIUtils.formatNumber(v.qty)}</span></div>`)
                .join('') || '<div style="text-align:center; padding:5px;">재고 없음</div>';
        }

        if (type === '출고' && lotSelect) {
            const activeProdLots = Object.entries(prodLotMap)
                .filter(([key, v]) => v.qty > 0 || key === targetLot)
                .map(([key, _]) => key)
                .sort();

            lotSelect.innerHTML = '<option value="">-- 제조 LOT 선택 --</option>' +
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
            warningMsg.innerHTML = `현재 선택하신 LOT(${selectedLot})보다 먼저 입고된 <strong>LOT(${oldestLot})</strong> 가 있습니다.<br>선입선출을 위해 이점 유의하시기 바랍니다.`;
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
            UIUtils.toast('도료를 선택하세요.', 'warning');
            return;
        }
        if (data.quantity <= 0) {
            UIUtils.toast('수량을 입력하세요.', 'warning');
            return;
        }

        // 수정 시 LOT별 재고 검증 (출고 모드는 prodLot 기준)
        if (data.type === '출고') {
            const allLogs = Storage.getAll(STORE);
            const selectedProdLot = data.lotNo; // select value = prodLot
            const otherLogs = allLogs.filter(l =>
                l.id !== id &&
                l.materialId === data.materialId &&
                (l.prodLot || l.lotNo) === selectedProdLot
            );
            const stockIn  = otherLogs.filter(l => l.type === '입고').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
            const stockOut = otherLogs.filter(l => l.type === '출고').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
            const available = stockIn - stockOut;

            if (data.quantity > available) {
                checkStockLive('edit', id);
                const qtyInput = document.getElementById('editPaintInvQty');
                if (qtyInput) qtyInput.focus();
                return;
            }

            // prodLot / lotNo 분리 저장
            data.prodLot = selectedProdLot;
            const srcRec = allLogs.find(l => l.type === '입고' && l.materialId === data.materialId && l.lotNo);
            data.lotNo = srcRec ? srcRec.lotNo : selectedProdLot;
        }

        await Storage.executeTransaction([
            { store: STORE, op: 'update', id, data }
        ]);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadData();
    }

    function checkStockLive(scope, currentId = null) {
        const prefix = scope === 'add' ? 'add' : 'edit';
        const lotEl = document.getElementById(`${prefix}PaintInvLot`);
        const warningArea = document.getElementById(`${prefix}PaintInvStockWarning`);
        const warningMsg = document.getElementById(`${prefix}PaintInvStockMsg`);

        // 입고 모드(LOT 필드가 text input)에서는 재고 부족 체크 불필요
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
        // 수정 모드일 경우 현재 항목(currentId)을 제외하고 계산
        // 출고 모드에서 lotNo는 실제 prodLot 값을 담고 있음 — prodLot 우선 매칭
        const filtered = allLogs.filter(l =>
            (currentId ? l.id !== currentId : true) &&
            l.materialId === matId &&
            (l.prodLot || l.lotNo) === lotNo
        );

        const stockIn = filtered.filter(l => l.type === '입고').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
        const stockOut = filtered.filter(l => l.type === '출고').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
        const available = stockIn - stockOut;

        if (qty > available) {
            if (warningArea) {
                warningArea.style.display = 'block';
                warningMsg.innerHTML = `선택하신 LOT의 현재 재고는 <strong>${UIUtils.formatNumber(available)}</strong> 입니다.<br>입력하신 수량(${UIUtils.formatNumber(qty)})이 재고를 초과합니다.`;
            }
        } else {
            if (warningArea) warningArea.style.display = 'none';
        }
    }

    function showStockModal() {
        const data = Storage.getAll(STORE);
        const materials = Storage.getAll(MATERIALS_STORE);

        // materialId 기준으로 현재고 + LOT 집계
        const stockMap = {};
        data.forEach(d => {
            if (!d.materialId) return;
            if (!stockMap[d.materialId]) {
                stockMap[d.materialId] = {
                    qty: 0,
                    lots: []
                };
            }
            if (d.type === '출고') {
                stockMap[d.materialId].qty -= Number(d.quantity) || 0;
            } else {
                stockMap[d.materialId].qty += Number(d.quantity) || 0;
                if (d.lotNo && !stockMap[d.materialId].lots.includes(d.lotNo)) {
                    stockMap[d.materialId].lots.push(d.lotNo);
                }
            }
        });

        // 행 데이터 구성 (구매처 → 제품명 순 정렬)
        const rows = Object.entries(stockMap).map(([matId, stock]) => {
            const mat = materials.find(m => m.id === matId);
            const price = Number(mat ? mat.purchasePrice : 0) || 0;
            return {
                supplier: mat ? (mat.supplier || '-') : '-',
                name: mat ? mat.name : '(삭제된 도료)',
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
            `<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>` :
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
                        <td colspan="4" style="text-align:center;">합계</td>
                        <td style="text-align:right; color:var(--accent-green); font-size:1.1rem;">
                            ${UIUtils.formatNumber(totalValue)}
                        </td>
                        <td></td>
                    </tr>
            `;

        UIUtils.showModal('도료 현재 재고 현황', `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);">filter_alt</span>
                <select class="form-select" id="stockSupplierFilter" style="max-width:200px;"
                        onchange="PaintInventoryModule.filterStock()">
                    <option value="">전체 구매처</option>
                    ${supplierOptions}
                </select>
                <span style="font-size:0.82rem;color:var(--text-muted);">총 ${rows.length}개 품목</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>구매처</th>
                            <th>제품명</th>
                            <th style="text-align:right;">단가</th>
                            <th style="text-align:right;">현재고</th>
                            <th style="text-align:right;">재공 금액</th>
                            <th>LOT</th>
                        </tr>
                    </thead>
                    <tbody id="stockTableBody">${tableRows}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
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
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
        });
    }

    function clearAllInventory() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('삭제할 재고 데이터가 없습니다.', 'warning');
            return;
        }
        UIUtils.confirm(
            `도료 창고 입출고 이력 전체(${data.length}건)를 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`,
            async () => {
                const count = data.length;
                // N번 루프 대신 saveAll([]) 단일 트랜잭션으로 전체 삭제
                await Storage.executeTransaction([
                    { store: STORE, op: 'saveAll', items: [] }
                ]);
                UIUtils.toast(`도료 재고 ${count}건이 삭제되었습니다.`, 'success');
                loadData();
            }
        );
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const materials = Storage.getAll(MATERIALS_STORE);

        const headers = ['날짜', '구매처', '도료명', '포장 용량', 'LOT', '수량', '유형'];
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
        Storage.exportToCSV(headers, rows, '도료창고_재고');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        loadData,
        renderPaintInspStandby,
        renderSupplierTiles,
        showPaintDetail,
        _openDetailOutgoing,
        _saveDetailOutgoing,
        openIncomingModal,
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
