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

    function _parseShelfLifeMonths(value) {
        if (!value) return null;
        const s = String(value).trim();
        const year = s.match(/(\d+)\s*년/);
        const month = s.match(/(\d+)\s*개월/);
        const number = s.match(/^(\d+)$/);
        if (year) return parseInt(year[1], 10) * 12;
        if (month) return parseInt(month[1], 10);
        if (number) return parseInt(number[1], 10);
        return null;
    }

    function _dateFromProdLot(value) {
        const lot = String(value || '').trim();
        if (!/^\d{6}$/.test(lot)) return '';
        const yy = parseInt(lot.slice(0, 2), 10);
        const mm = parseInt(lot.slice(2, 4), 10);
        const dd = parseInt(lot.slice(4, 6), 10);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';

        const date = new Date(2000 + yy, mm - 1, dd);
        if (date.getFullYear() !== 2000 + yy || date.getMonth() !== mm - 1 || date.getDate() !== dd) return '';
        return `${date.getFullYear()}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }

    function _addMonths(dateStr, months) {
        if (!dateStr || !months) return '';
        const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return '';
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        date.setMonth(date.getMonth() + months);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function _resolveLotDates(record, material) {
        const mfgDate = record.mfgDate || _dateFromProdLot(record.prodLot || record.lotNo);
        const expDate = record.expDate || _addMonths(mfgDate, _parseShelfLifeMonths(material && material.shelfLife));
        return { mfgDate, expDate };
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions" style="display:flex;align-items:center;gap:8px;width:100%;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-primary" onclick="PaintInventoryModule.openIncomingModal()">
                                <span class="material-symbols-outlined">login</span> 도료 입고
                            </button>
                            <button class="btn btn-danger" onclick="PaintInventoryModule.openOutgoingModal()">
                                <span class="material-symbols-outlined">logout</span> 도료 출고
                            </button>
                            <button class="btn btn-outline"
                                onclick="PaintInventoryModule.openBulkModal()"
                                title="관리자만 도료 창고 재고를 일괄 등록 및 전체 교체할 수 있습니다.">
                                <span class="material-symbols-outlined">admin_panel_settings</span> 일괄 등록 및 수정
                            </button>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;">
                            <button class="btn btn-outline" onclick="PaintInventoryModule.openTemperatureStandard()"
                                title="도료 보관창고 온도관리 기준서를 확인합니다.">
                                <span class="material-symbols-outlined">device_thermostat</span> 온도관리 기준서
                            </button>
                            <button class="btn btn-outline" onclick="Router.navigate('paint-layout')"
                                title="도료 보관 창고 배치 레이아웃을 시각적으로 편집합니다.">
                                <span class="material-symbols-outlined">map</span> 레이아웃
                            </button>
                        </div>
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
                                        <th>입고 일자</th>
                                        <th>수입검사일</th>
                                        <th>구매처</th>
                                        <th>도료명</th>
                                        <th>포장 단위</th>
                                        <th>수량</th>
                                        <th>제조 LOT</th>
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
            const key = mat ? (mat.name + ' (' + (mat.color || '-') + ')') : '미분류';
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
            const lotDates = _resolveLotDates(d, mat);

            // 남은 유효기한 계산
            let remainHtml = '-';
            if (lotDates.expDate) {
                const today = new Date(); today.setHours(0,0,0,0);
                const exp   = new Date(lotDates.expDate); exp.setHours(0,0,0,0);
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

            function _fmtDateCell(raw) {
                const sp = (raw || '').split(' ');
                const pp = (sp[0] || '').split('-');
                const tt = sp[1] ? sp[1].slice(0,5) : '';
                if (pp.length !== 3) return raw || '-';
                return '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + pp[0] + '</span>' +
                       '<span style="font-weight:600;white-space:nowrap;">' + pp[1] + '-' + pp[2] + '</span>' +
                       (tt ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + tt + '</span>' : '');
            }
            return `
                <tr>
                    <td style="line-height:1.3;">${_fmtDateCell(d.date)}</td>
                    <td style="line-height:1.3;">${_fmtDateCell(d.inspDate ? d.inspDate.slice(0,10) : '')}</td>
                    <td>${mSupplier}</td>
                    <td><strong>${mName}</strong></td>
                    <td>${mPackUnit}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                    <td style="font-family:monospace;color:var(--text-secondary);">${d.prodLot || '-'}</td>
                    <td style="font-size:0.82rem;">${lotDates.mfgDate || '-'}</td>
                    <td style="font-size:0.82rem;">${lotDates.expDate || '-'}</td>
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
                // 유효기한 경고 표시
                let expHtml = '';
                if (item.minExpDate) {
                    const exp = new Date(item.minExpDate); exp.setHours(0, 0, 0, 0);
                    const diff = Math.round((exp - today) / 86400000);
                    if (diff < 0) {
                        expHtml = `<span title="유효기한 만료" style="color:var(--accent-red);font-size:0.75rem;font-weight:700;margin-left:4px;">⚠만료</span>`;
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
            const mat = materials.find(m => m.id === d.materialId);
            const lotDates = _resolveLotDates(d, mat);
            if (!matStock[d.materialId]) matStock[d.materialId] = { stock: 0, lots: {} };
            const qty = Number(d.quantity) || 0;
            // 제조 LOT(prodLot) 우선, 없으면 제조사 표기 LOT(lotNo) 키로 구분
            const lotKey = (d.prodLot || d.lotNo || '__');
            if (!matStock[d.materialId].lots[lotKey]) {
                matStock[d.materialId].lots[lotKey] = {
                    prodLot: d.prodLot || '',
                    lotNo:   d.lotNo   || '',
                    qty: 0,
                    expDate: lotDates.expDate || ''
                };
            }
            if (d.type === '출고') {
                matStock[d.materialId].stock -= qty;
                matStock[d.materialId].lots[lotKey].qty -= qty;
            } else {
                matStock[d.materialId].stock += qty;
                matStock[d.materialId].lots[lotKey].qty += qty;
                if (lotDates.expDate && (!matStock[d.materialId].lots[lotKey].expDate ||
                    lotDates.expDate < matStock[d.materialId].lots[lotKey].expDate)) {
                    matStock[d.materialId].lots[lotKey].expDate = lotDates.expDate;
                }
            }
        });

        // 활성 LOT 정렬 + 최소 유효기한
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
            const lotDates = _resolveLotDates(d, mat);
            if (!lotMap[key]) lotMap[key] = {
                prodLot: d.prodLot || '',
                lotNo:   d.lotNo   || '',
                mfgDate: lotDates.mfgDate || '',
                expDate: lotDates.expDate || '',
                qty: 0
            };
            if (d.type === '출고') { lotMap[key].qty -= qty; totalStock -= qty; }
            else                   { lotMap[key].qty += qty; totalStock += qty;
                if (lotDates.mfgDate && (!lotMap[key].mfgDate || lotDates.mfgDate < lotMap[key].mfgDate))
                    lotMap[key].mfgDate = lotDates.mfgDate;
                if (lotDates.expDate && (!lotMap[key].expDate || lotDates.expDate < lotMap[key].expDate))
                    lotMap[key].expDate = lotDates.expDate;
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
                            <th>제조사 표기 LOT</th>
                            <th style="text-align:center;">제조일자</th>
                            <th>유효기한</th>
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
                            <th>제조사 표기 LOT</th>
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
        // 일괄 등록(bulk)으로 입력된 현재고 설정 레코드는 실제 검사 처리로 간주하지 않음
        const processedInspIds = new Set(
            inventory.filter(i => i.sourceInspectionId && !_isCurrentStockEditRecord(i)).map(i => i.sourceInspectionId)
        );
        const legacyStockSet = new Set(
            inventory
                .filter(i => i.type !== '출고' && !i.sourceInspectionId && !_isCurrentStockEditRecord(i))
                .map(i => `${i.materialId}||${i.lotNo}`)
        );

        // paintName → materialId 매핑 헬퍼
        function getMaterialId(paintName) {
            const mat = materials.find(m => m.name === paintName);
            return mat ? mat.id : null;
        }

        // 일괄 등록(bulk)으로 재고가 설정된 자재 ID 집합 — 해당 자재의 검사 건은 대기품으로 표시 안 함
        const bulkHandledMaterialIds = new Set(
            inventory.filter(i => _isCurrentStockEditRecord(i)).map(i => i.materialId)
        );

        const pending = passed.filter(i => {
            if (isPaintInspectionStandbyCanceled(i)) return false;
            if (processedInspIds.has(i.id)) return false;
            const mid = getMaterialId(i.paintName);
            if (mid && legacyStockSet.has(`${mid}||${i.lotNo}`)) return false;
            // 일괄 업로드로 해당 자재 재고가 설정된 경우 → 대기품 제외
            if (mid && bulkHandledMaterialIds.has(mid)) return false;
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
                            <th>제조사 표기 LOT</th>
                            <th style="text-align:right;">입고수량</th>
                            <th>제조일자</th>
                            <th>유효기한</th>
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

        const inspSupplier = _normalizeText(insp.supplier || insp.supplierName || '');
        const inspPaintName = _normalizeText(insp.paintName || insp.name || '');
        const norm = v => _normalizeText(v).toUpperCase();

        // 검사 기록의 supplier가 마스터와 다를 수 있으므로 paintName 정규화 매칭 우선
        const materials = Storage.getAll(MATERIALS_STORE);
        const mat = materials.find(m => norm(m.name) === norm(inspPaintName) && norm(m.supplier) === norm(inspSupplier))
                 || materials.find(m => norm(m.name) === norm(inspPaintName));

        // 실제 사용할 supplier는 마스터 기준으로 결정
        const resolvedSupplier = mat ? (mat.supplier || inspSupplier || '') : inspSupplier;

        window._sourceInspectionId = inspId;
        showRegistrationModal('입고');
        setTimeout(() => {
            const supplierSel = document.getElementById('addPaintInvSupplier');
            if (supplierSel) {
                if (resolvedSupplier && ![...supplierSel.options].some(opt => opt.value === resolvedSupplier)) {
                    supplierSel.insertAdjacentHTML('beforeend', `<option value="${_escapeHtml(resolvedSupplier)}">${_escapeHtml(resolvedSupplier)}</option>`);
                }
                supplierSel.value = resolvedSupplier;
                PaintInventoryModule.onSupplierChange('입고');
            }
            setTimeout(() => {
                const matSel = document.getElementById('addPaintInvMaterial');
                if (matSel && mat) {
                    if (![...matSel.options].some(opt => opt.value === mat.id)) {
                        matSel.insertAdjacentHTML('beforeend', `<option value="${_escapeHtml(mat.id)}">${_escapeHtml(mat.name || inspPaintName)}</option>`);
                    }
                    matSel.value = mat.id;
                    PaintInventoryModule.onMaterialChange('입고');
                } else if (matSel && inspPaintName) {
                    matSel.innerHTML = `<option value="">마스터 미등록: ${_escapeHtml(inspPaintName)}</option>`;
                    UIUtils.toast(`도료 마스터에서 "${inspPaintName}"을 찾을 수 없습니다. 관리/설정에서 도료를 먼저 등록해주세요.`, 'warning');
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
                    const inspDateInput = document.getElementById('addPaintInvInspDate');
                    if (inspDateInput) inspDateInput.value = (insp.date || '').slice(0, 10);
                }, 80);
            }, 80);
        }, 80);
    }

    function openIncomingModal() {
        window._sourceInspectionId = null;
        showRegistrationModal('입고');
    }

    function openOutgoingModal() {
        window._sourceInspectionId = null;
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
                ${type === '입고' ? `
                <div class="form-group">
                    <label class="form-label">수입검사일 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(검사 연동 시 자동)</span></label>
                    <input type="date" class="form-input" id="addPaintInvInspDate">
                </div>` : '<div class="form-group" style="visibility:hidden;"></div>'}
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
                            : '제조사 표기 LOT <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:4px;">(선택)</span>'}
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
                    <label class="form-label">유효기한</label>
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

    function onLotInput() {} // 제조사 표기 LOT 형식 제한 없음 — 공급사 자체 코드

    // ── 입고 대기 취소 (단건) ──────────────────────────────────────────
    function isPaintInspectionStandbyCanceled(insp) {
        return (insp && insp.warehouseStatus) === '입고취소';
    }

    function cancelPaintInspectionStandby(id) {
        const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, id);
        if (!insp) {
            UIUtils.toast('입고 대기 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        UIUtils.confirm('선택한 입고 대기 항목을 취소하시겠습니까? 검사 기록은 삭제하지 않습니다.', async () => {
            await Storage.update(DB.STORES.PAINT_INCOMING_INSPECTIONS, id, {
                ...insp,
                warehouseStatus: '입고취소',
                warehouseDate: UIUtils.today()
            });
            UIUtils.toast('입고 대기 항목이 취소되었습니다.', 'success');
            renderPaintInspStandby();
        });
    }

    // ── 입고 대기 취소 (전체) ──────────────────────────────────────────
    function cancelAllPaintInspectionStandby() {
        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        const materials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const processedInspIds = new Set(
            inventory.filter(i => i.sourceInspectionId && !_isCurrentStockEditRecord(i)).map(i => i.sourceInspectionId)
        );
        const legacyStockSet = new Set(
            inventory
                .filter(i => i.type !== '출고' && !i.sourceInspectionId && !_isCurrentStockEditRecord(i))
                .map(i => `${i.materialId}||${i.lotNo}`)
        );
        const pending = inspections.filter(i => {
            if (i.verdict !== '합격' || isPaintInspectionStandbyCanceled(i) || (Number(i.incomingQty) || 0) <= 0) return false;
            if (processedInspIds.has(i.id)) return false;
            const mat = materials.find(m => m.name === i.paintName);
            if (mat && legacyStockSet.has(`${mat.id}||${i.lotNo}`)) return false;
            return true;
        });

        if (!pending.length) {
            UIUtils.toast('취소할 입고 대기 항목이 없습니다.', 'warning');
            return;
        }

        UIUtils.confirm(`입고 대기 ${pending.length}건을 모두 취소하시겠습니까? 검사 기록은 삭제하지 않습니다.`, async () => {
            await Storage.executeTransaction(pending.map(i => ({
                store: DB.STORES.PAINT_INCOMING_INSPECTIONS,
                op: 'update',
                id: i.id,
                data: {
                    ...i,
                    warehouseStatus: '입고취소',
                    warehouseDate: UIUtils.today()
                }
            })));
            UIUtils.toast(`입고 대기 ${pending.length}건을 취소했습니다.`, 'success');
            renderPaintInspStandby();
        });
    }

    // ── 일괄 등록 유틸리티 함수들 ─────────────────────────────────────
    function _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _normalizeText(value) {
        return String(value ?? '').replace(/ /g, ' ').trim();
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
            record.source === '도료 창고 현재 재고 설정' ||
            record.source === '도료 창고 일괄 등록 및 설정'
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
                else UIUtils.toast('도료 창고 일괄 등록 및 설정은 관리자만 가능합니다.', 'warning');
            });
            return;
        }
        UIUtils.toast('도료 창고 일괄 등록 및 설정은 관리자만 가능합니다.', 'warning');
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
            map[key] += d.type === '출고' ? -qty : qty;
        });
        return map;
    }

    function _bulkStockByMaterialId() {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(d => {
            if (!d.materialId) return;
            if (!map[d.materialId]) map[d.materialId] = { total: 0, lots: {}, carModel: '' };
            const qty = Number(d.quantity) || 0;
            const sign = d.type === '출고' ? -1 : 1;
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
            UIUtils.toast('관리/설정의 도료 관리에 등록된 도료가 없습니다.', 'warning');
            return;
        }
        textarea.value = template;
        PaintInventoryModule._bulkRecords = _parseBulkRows(template);
        _bulkRenderPreview();
        UIUtils.toast('도료 마스터 전체 목록을 현재 재고 입력으로 불러왔습니다.', 'success');
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
            title: '도료 창고 일괄 등록 및 설정',
            size: '1352px',
            noBackdropClose: true,
            body: `
            <div style="margin-bottom:10px;padding:10px 14px;background:rgba(59,130,246,0.07);
                        border:1px solid rgba(59,130,246,0.25);border-radius:8px;font-size:0.82rem;
                        color:var(--text-secondary);line-height:1.7;">
                <b style="color:var(--accent-blue);">붙여넣기 형식</b><br>
                엑셀에서 <b>납품처 / 제품명 / 현재재고 / LOT1 / 수량 / LOT2 / 수량 / LOT3 / 수량 / LOT4 / 수량</b> 열을 복사하여 붙여넣으세요.<br>
                저장 시 현재 도료 창고 재고를 모두 삭제하고 붙여넣기 현재 시트 내용으로 전체 교체합니다.
            </div>
            <div style="margin-bottom:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;
                        font-family:Consolas,monospace;font-size:0.78rem;line-height:1.45;color:var(--text-secondary);overflow-x:auto;">
                납품처&nbsp;&nbsp;&nbsp;&nbsp;제품명&nbsp;&nbsp;&nbsp;&nbsp;현재재고&nbsp;&nbsp;&nbsp;&nbsp;LOT1&nbsp;&nbsp;&nbsp;&nbsp;수량&nbsp;&nbsp;&nbsp;&nbsp;LOT2&nbsp;&nbsp;&nbsp;&nbsp;수량<br>
                납품처명&nbsp;&nbsp;&nbsp;&nbsp;BLACK(J71E02)&nbsp;&nbsp;&nbsp;&nbsp;5&nbsp;&nbsp;&nbsp;&nbsp;250829&nbsp;&nbsp;&nbsp;&nbsp;1&nbsp;&nbsp;&nbsp;&nbsp;260325&nbsp;&nbsp;&nbsp;&nbsp;4
            </div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label class="form-label">기준 일자</label>
                    <input type="date" class="form-input" id="paintBulkInvDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;">
                        <input type="checkbox" id="paintBulkCreateMissing" onchange="PaintInventoryModule._bulkRenderPreview()">
                        마스터 없는 도료 마스터를 자동 생성 적용
                    </label>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkLoadMasterTemplate()">
                        <span class="material-symbols-outlined">table_view</span> 도료 마스터 목록 불러오기
                    </button>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkClearPaste()">
                        <span class="material-symbols-outlined">backspace</span> 전체 지우기
                    </button>
                    <button class="btn btn-outline" onclick="PaintInventoryModule._bulkParse()">
                        <span class="material-symbols-outlined">preview</span> 미리보기
                    </button>
                </div>
            </div>
            <textarea id="paintBulkPasteArea" class="form-textarea"
                placeholder="엑셀에서 복사한 도료 재고 마스터 시트 내용을 여기에 붙여넣으세요."
                style="height:190px;font-family:Consolas,monospace;font-size:0.78rem;resize:vertical;"
                oninput="document.getElementById('paintBulkPreviewWrap').innerHTML='';
                         var s=document.getElementById('paintBulkSaveBtn');if(s)s.style.display='none';">${_escapeHtml(masterTemplate)}</textarea>
            <div id="paintBulkPreviewWrap" style="margin-top:12px;"></div>
        `,
            footer: `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="paintBulkSaveBtn" style="display:none;"
                onclick="PaintInventoryModule._bulkSave()">
                <span class="material-symbols-outlined">save</span> 전체 교체 저장
            </button>
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
            wrap.innerHTML = '<p style="color:var(--accent-red);font-size:0.83rem;">붙여넣기 입력에서 등록할 도료 재고를 찾을 수 없습니다.</p>';
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
                : '<span style="color:var(--text-muted);font-size:0.78rem;">LOT 없음</span>';
            const status = [
                isDuplicate ? '<span style="color:var(--accent-red);font-weight:700;">중복</span>' : '',
                isMismatch ? '<span style="color:var(--accent-red);font-weight:700;">LOT합계 불일치</span>' : '',
                isMissing ? `<span style="color:${autoCreate ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-red)'};font-weight:700;">마스터 없음</span>` : ''
            ].filter(Boolean).join('<br>') || '<span style="color:var(--accent-green);font-weight:700;">정상</span>';

            return `
                <tr style="${isDuplicate || isMismatch || (isMissing && !autoCreate) ? 'background:rgba(239,68,68,0.06);' : ''}">
                    <td>${_escapeHtml(r.supplier)}</td>
                    <td><strong>${_escapeHtml(r.paintName)}</strong></td>
                    <td style="text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                    <td style="text-align:right;font-weight:700;">${UIUtils.formatNumber(r.currentQty)}</td>
                    <td>${lotsHtml}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(lotTotal)}</td>
                    <td>${status}</td>
                    <td style="text-align:center;"><button class="btn btn-sm btn-outline" onclick="PaintInventoryModule._bulkRemoveRow(${idx})">제거</button></td>
                </tr>
            `;
        }).join('');

        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="color:${hasBlockers ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-green)'};font-size:18px;">${hasBlockers ? 'warning' : 'check_circle'}</span>
                <span style="font-size:0.85rem;font-weight:600;color:${hasBlockers ? 'var(--accent-orange,#f59e0b)' : 'var(--accent-green)'};">
                    ${records.length}개 항목 / ${lotRecordCount}개 LOT / 합계 현재재고 ${UIUtils.formatNumber(currentTotal)}
                </span>
            </div>
            ${duplicateLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>중복 항목 ${duplicateLabels.length}개가 있습니다.</strong> 같은 납품처/제품명은 1개만 있어야 저장할 수 있습니다.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 6).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 6 ? '<br>...' : ''}</div>
            </div>` : ''}
            ${mismatchLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>현재재고와 LOT 수량 합계가 다른 항목 ${mismatchLabels.length}개가 있습니다.</strong> 마스터 시트의 현재재고와 LOT 수량을 일치시켜 주세요.
                <div style="margin-top:3px;color:var(--text-secondary);">${mismatchLabels.slice(0, 6).map(_escapeHtml).join('<br>')}${mismatchLabels.length > 6 ? '<br>...' : ''}</div>
            </div>` : ''}
            ${missingLabels.length ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(245,158,11,0.35);border-radius:6px;background:rgba(245,158,11,0.06);color:var(--text-secondary);font-size:0.8rem;line-height:1.55;">
                <strong style="color:var(--accent-orange,#f59e0b);">도료 정보가 없는 항목 ${missingLabels.length}개</strong>가 있습니다.
                먼저 관리/설정 > 도료 관리의 마스터와 붙여넣기 마스터를 동일하게 확인하세요.
                ${autoCreate ? '자동 생성 적용 상태이므로 저장 시 도료 마스터에 자동 추가합니다.' : '마스터 없음 항목은 자동 생성 적용 체크 전에는 저장할 수 없습니다.'}
                <div style="margin-top:3px;color:var(--text-secondary);">${missingLabels.slice(0, 8).map(_escapeHtml).join('<br>')}${missingLabels.length > 8 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:310px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table class="data-table" style="min-width:920px;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th>납품처</th>
                            <th>제품명</th>
                            <th style="text-align:right;">현재 재고</th>
                            <th style="text-align:right;">교체 재고</th>
                            <th>LOT / 수량</th>
                            <th style="text-align:right;">LOT 합계</th>
                            <th>상태</th>
                            <th style="text-align:center;">작업</th>
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
            UIUtils.toast('도료 창고 일괄 등록 및 설정은 관리자만 가능합니다.', 'warning');
            return;
        }
        const records = PaintInventoryModule._bulkRecords || [];
        if (!records.length) {
            UIUtils.toast('저장할 도료 재고 데이터가 없습니다.', 'warning');
            return;
        }

        let materials = Storage.getAll(MATERIALS_STORE) || [];
        const autoCreate = (document.getElementById('paintBulkCreateMissing') || {}).checked !== false;
        const duplicateLabels = _bulkDuplicateLabels(records);
        const mismatchLabels = _bulkMismatchLabels(records);
        const missingLabels = _bulkGetMissingLabels(records, materials);

        if (duplicateLabels.length || mismatchLabels.length || (!autoCreate && missingLabels.length)) {
            UIUtils.toast('저장 전 확인이 필요한 항목이 있습니다. 미리보기에서 중복/불일치 항목을 확인하세요.', 'warning');
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
                    type: '입고',
                    materialId: mat.id,
                    carModel: r.carModel || '',
                    inventoryMode: 'current_stock_edit',
                    lotNo: lot.lot || '',
                    prodLot: lot.lot || '',
                    quantity: Math.max(0, Number(lot.qty) || 0),
                    source: '도료 창고 현재 재고 설정'
                });
            });
        });

        await Storage.saveAll(STORE, newItems);
        PaintInventoryModule._bulkRecords = [];
        UIUtils.closeModal();
        UIUtils.toast(`기존 도료 창고 재고 삭제 후 ${newItems.length}건 등록 완료${createdMaterials ? `, 도료 마스터 ${createdMaterials}건 생성` : ''}`, 'success');
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
            inspDate: (document.getElementById('addPaintInvInspDate') || {}).value || '',
            sourceInspectionId: (type === '입고' && window._sourceInspectionId) ? window._sourceInspectionId : ''
        };

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
        if (type === '입고') window._sourceInspectionId = null;
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
                        ${d.type === '출고' ? '제조 LOT' : '제조사 표기 LOT'} <span style="color:var(--accent-red)">*</span>
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
            if (!mat) return null;
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
        }).filter(Boolean)
          .sort((a, b) => a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name));

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

    const TEMP_STANDARD_CONFIG_KEY = 'paint_temperature_standard';

    function _defaultTemperatureStandard() {
        return {
            deptName: '도장사업부',
            processName: '도료보관창고',
            makerRange: '도료MAKER 보관 권장 범위 ▶ 5℃~35℃',
            kcRange: 'KC케미칼 보관 관리 범위 ▶ 10℃~30℃',
            springRange: '3월~5월<br>5.0 ~ 17℃',
            summerRange: '6월~8월<br>21.0 ~ 30℃',
            autumnRange: '9월~11월<br>28.0 ~ 5℃',
            winterRange: '11월~2월<br>0 ~ -20℃',
            coolRule: '28℃ 이상시<br>냉방',
            heatRule: '10℃ 이하 시<br>난방',
            recordBox: '25.8℃',
            sheetLabel: '월별 온도 일일 CHECK SHEET',
            recordNote: '온도계 체크<br>시트에 기록',
            settingTemp: '셋팅온도',
            heatButton: '난방 가동<br>운전/정지',
            coolButton: '냉방 가동<br>운전/정지',
            step1: '온도계 온도를 확인한다.',
            step2Heat: '온도가 10℃ 미만 일 시 왼쪽의 난방 운전 버튼을 눌러 가동.',
            step2Cool: '온도가 28℃ 이상 일시는 오른쪽의 냉방 운전 버튼을 눌러 가동',
            step3: '셋팅 온도는 난방 16℃~20℃, 냉방 22℃~26℃로 한다.<br><span style="margin-left:20px;">(창고 내부 온도 상황에 맞게 조절한다.)</span>',
            stepNo1: '1.',
            stepNo2: '2.',
            stepNo3: '3.',
            revisionNo: '1',
            revisionDate: '23.08.01',
            revisionReason: '최초 작성',
            revisionWriter: '',
            revisionReviewer: '',
            revisionApprover: '',
            revisionNo2: '2',
            revisionDate2: '',
            revisionReason2: '',
            revisionWriter2: '',
            revisionReviewer2: '',
            revisionApprover2: '',
            revisionNo3: '3',
            revisionDate3: '',
            revisionReason3: '',
            revisionWriter3: '',
            revisionReviewer3: '',
            revisionApprover3: '',
            approvals: window.ApprovalUtils ? ApprovalUtils.normalize() : {},
            images: {},
            objects: {
                settingTemp: { slot: 'controller', x: 77, y: 17, w: 22, h: 13, bg: '#9bbb59', color: '#fff', text: '셋팅온도' },
                heatButton:  { slot: 'controller', x: 10, y: 78, w: 22, h: 18, bg: '#b0443e', color: '#fff', text: '난방 가동<br>운전/정지' },
                coolButton:  { slot: 'controller', x: 80, y: 78, w: 24, h: 18, bg: '#3f6fa6', color: '#fff', text: '냉방 가동<br>운전/정지' },
                recordNote:  { slot: 'recordMethod', x: 72, y: 13, w: 26, h: 55, bg: '#9bbb59', color: '#fff', text: '온도계 체크<br>시트에 기록' }
            },
            boxes: {}
        };
    }

    function _editableField(key, data, extraStyle = '') {
        return `<span data-pts-field="${key}" contenteditable="false" style="${extraStyle}">${data[key] || ''}</span>`;
    }

    function _photoData(data, key) {
        const value = data.images && data.images[key];
        if (!value) return null;
        if (typeof value === 'string') return { src: value, x: 50, y: 50, scale: 100 };
        return {
            src: value.src || '',
            x: Number(value.x ?? 50),
            y: Number(value.y ?? 50),
            scale: Number(value.scale ?? 100)
        };
    }

    function _boxData(data, key) {
        if (!Object.prototype.hasOwnProperty.call(TEMP_STANDARD_BOX_DEFAULTS, key)) {
            return { x: 0, y: 0, w: 0, h: 0, deleted: false };
        }
        const defaults = TEMP_STANDARD_BOX_DEFAULTS[key];
        const value = data.boxes && data.boxes[key];
        const raw = {
            x: Number(value?.x ?? defaults.x ?? 0),
            y: Number(value?.y ?? defaults.y ?? 0),
            w: Number(value?.w ?? defaults.w ?? 0),
            h: Number(value?.h ?? defaults.h ?? 0)
        };
        const invalid = [raw.x, raw.y, raw.w, raw.h].some(v => !Number.isFinite(v))
            || raw.w > 140 || raw.h > 700 || raw.w < 0 || raw.h < 0
            || raw.x < -50 || raw.x > 150 || raw.y < -50 || raw.y > 250;
        return {
            x: invalid ? Number(defaults.x ?? 0) : raw.x,
            y: invalid ? Number(defaults.y ?? 0) : raw.y,
            w: invalid ? Number(defaults.w ?? 0) : raw.w,
            h: invalid ? Number(defaults.h ?? 0) : raw.h,
            deleted: !!value?.deleted
        };
    }

    function _photoImgHtml(photo) {
        return `<img src="${photo.src}" alt="" draggable="false"
                    style="position:absolute;left:${photo.x}%;top:${photo.y}%;width:${photo.scale}%;height:auto;max-width:none;max-height:none;transform:translate(-50%,-50%);display:block;user-select:none;">`;
    }

    const TEMP_STANDARD_IMAGE_FALLBACKS = {};
    const TEMP_STANDARD_BOX_DEFAULTS = {
        makerRangeBox: { x: 0, y: 0, w: 100, h: 43 },
        operationTitle: { x: 0, y: 0, w: 56, h: 28 },
        recordTitle: { x: 0, y: 0, w: 30, h: 28 },
        kcRangeBox: { x: 0, y: 0, w: 100, h: 43 },
        controllerTitle: { x: 0, y: 0, w: 42, h: 28 },
        operationTable: { x: 0, y: 0, w: 100, h: 164 },
        controller: { x: 0, y: 0, w: 100, h: 278 },
        recordBackground: { x: 0, y: 0, w: 69, h: 185 },
        thermometer: { x: 3, y: 7, w: 32, h: 72 },
        checkSheet: { x: 42, y: 42, w: 52, h: 110 }
    };

    function _objectData(data, key) {
        const base = _defaultTemperatureStandard().objects[key] || {};
        return { ...base, ...((data.objects && data.objects[key]) || {}) };
    }

    function _standardObjectHtml(key, data) {
        const o = _objectData(data, key);
        if (o.deleted) return '';
        const bg = o.bg ?? 'transparent';
        const color = o.color ?? '#111827';
        const z = Number(o.z ?? 4);
        const kind = o.kind || 'box';
        const isLine = kind === 'line' || kind === 'arrow';
        const rot = Number(o.rot || 0);
        const textHtml = isLine
            ? `<span style="display:block;width:100%;height:0;border-top:3px solid ${color};position:relative;">
                    ${kind === 'arrow' ? `<span style="position:absolute;right:-2px;top:-7px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:10px solid ${color};"></span>` : ''}
               </span>`
            : `<span data-pts-object-text="${key}" contenteditable="false"
                    ondblclick="PaintInventoryModule.editTemperatureStandardObjectText(event, '${key}')"
                    style="display:block;width:100%;padding:2px 4px;box-sizing:border-box;">${o.text || ''}</span>`;
        return `<div class="pts-object" data-pts-object="${key}" data-slot="${o.slot || ''}" data-kind="${o.kind || 'box'}" data-bg="${bg}" data-color="${color}" data-z="${z}" data-x="${o.x}" data-y="${o.y}" data-w="${o.w}" data-h="${o.h}" data-rot="${rot}"
                    onmousedown="PaintInventoryModule.startTemperatureStandardObjectDrag(event, '${key}')"
                    onclick="PaintInventoryModule.selectTemperatureStandardObject('${key}');event.stopPropagation();"
                    style="position:absolute;left:${o.x}%;top:${o.y}%;width:${o.w}%;height:${o.h}%;background:${bg};color:${color};font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;line-height:1.25;border:${isLine ? '1px dashed rgba(37,99,235,.35)' : '2px solid rgba(15,23,42,.35)'};z-index:${z};user-select:none;transform:rotate(${rot}deg);transform-origin:${isLine ? 'left center' : 'center center'};">
                    ${textHtml}
                    <span class="pts-object-resize" onmousedown="PaintInventoryModule.startTemperatureStandardObjectResize(event, '${key}')"></span>
                </div>`;
    }

    function _standardObjectsHtml(slot, data, keys = []) {
        const rendered = new Set(keys);
        let html = keys.map(key => _standardObjectHtml(key, data)).join('');
        Object.entries(data.objects || {}).forEach(([key, object]) => {
            if (rendered.has(key) || object.slot !== slot) return;
            html += _standardObjectHtml(key, data);
        });
        return html;
    }

    function _photoSlot(key, data, fallbackHtml, style = '', overlayHtml = '') {
        TEMP_STANDARD_IMAGE_FALLBACKS[key] = fallbackHtml;
        const photo = _photoData(data, key);
        const box = _boxData(data, key);
        if (box.deleted) return '';
        const boxStyle = `${box.x || box.y ? `left:${box.x}%;top:${box.y}%;` : ''}${box.w ? `width:${box.w}%;` : ''}${box.h ? `height:${box.h}px;` : ''}`;
        const position = (box.x || box.y || box.w || box.h) ? 'absolute' : 'relative';
        return `<div class="pts-photo-slot" data-pts-image="${key}" tabindex="0"
                    data-x="${photo ? photo.x : 50}" data-y="${photo ? photo.y : 50}" data-scale="${photo ? photo.scale : 100}"
                    data-box-x="${box.x}" data-box-y="${box.y}" data-box-w="${box.w}" data-box-h="${box.h}" data-box-key="${Object.prototype.hasOwnProperty.call(TEMP_STANDARD_BOX_DEFAULTS, key) ? 'true' : 'false'}"
                    onclick="PaintInventoryModule.selectTemperatureStandardImage('${key}', event)"
                    onmousedown="PaintInventoryModule.startTemperatureStandardImageDrag(event, '${key}')"
                    onpaste="PaintInventoryModule.pasteTemperatureStandardImage(event, '${key}')"
                    style="${style};${boxStyle};position:${position};outline:none;overflow:hidden;">
                    ${photo
                        ? _photoImgHtml(photo)
                        : `<div class="pts-photo-fallback" style="width:100%;height:100%;">${fallbackHtml}</div>`}
                    ${overlayHtml}
                    <span class="pts-resize-handle pts-resize-nw" data-pts-resize="nw" title="크기 조절"></span>
                    <span class="pts-resize-handle pts-resize-ne" data-pts-resize="ne" title="크기 조절"></span>
                    <span class="pts-resize-handle pts-resize-sw" data-pts-resize="sw" title="크기 조절"></span>
                    <span class="pts-resize-handle pts-resize-se" data-pts-resize="se" title="크기 조절"></span>
                </div>`;
    }

    function _prepareTemperatureStandardLayout(data) {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        const table = doc.querySelector('table');
        if (!table || table.closest('[data-pts-image="operationTable"]')) return;

        const box = _boxData(data, 'operationTable');
        if (box.deleted) {
            table.remove();
            return;
        }

        const surface = document.createElement('div');
        surface.dataset.ptsSurface = 'operationCriteria';
        surface.style.cssText = `position:relative;min-height:${Math.max(180, box.h + 18)}px;margin-top:6px;`;

        const wrapper = document.createElement('div');
        wrapper.className = 'pts-photo-slot';
        wrapper.tabIndex = 0;
        wrapper.dataset.ptsImage = 'operationTable';
        wrapper.dataset.x = '50';
        wrapper.dataset.y = '50';
        wrapper.dataset.scale = '100';
        wrapper.dataset.boxX = String(box.x);
        wrapper.dataset.boxY = String(box.y);
        wrapper.dataset.boxW = String(box.w);
        wrapper.dataset.boxH = String(box.h);
        wrapper.dataset.boxKey = 'true';
        wrapper.setAttribute('onclick', "PaintInventoryModule.selectTemperatureStandardImage('operationTable', event)");
        wrapper.setAttribute('onmousedown', "PaintInventoryModule.startTemperatureStandardImageDrag(event, 'operationTable')");
        wrapper.setAttribute('onpaste', "PaintInventoryModule.pasteTemperatureStandardImage(event, 'operationTable')");
        wrapper.style.cssText = `position:absolute;left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}px;background:#fff;z-index:2;outline:none;overflow:hidden;`;

        table.parentNode.insertBefore(surface, table);
        surface.appendChild(wrapper);
        wrapper.appendChild(table);
        table.style.marginTop = '0';
        wrapper.insertAdjacentHTML('beforeend', `${_standardObjectsHtml('operationTable', data)}
            <span class="pts-resize-handle pts-resize-nw" data-pts-resize="nw" title="크기 조절"></span>
            <span class="pts-resize-handle pts-resize-ne" data-pts-resize="ne" title="크기 조절"></span>
            <span class="pts-resize-handle pts-resize-sw" data-pts-resize="sw" title="크기 조절"></span>
            <span class="pts-resize-handle pts-resize-se" data-pts-resize="se" title="크기 조절"></span>`);
    }

    function _temperatureStandardState() {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return null;
        return {
            html: doc.innerHTML,
            deletedBoxes: doc.dataset.deletedBoxes || '',
            deletedObjects: doc.dataset.deletedObjects || ''
        };
    }

    function _restoreTemperatureStandardState(state) {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc || !state) return;
        window._paintTempStandardRestoring = true;
        doc.innerHTML = state.html;
        doc.dataset.deletedBoxes = state.deletedBoxes || '';
        doc.dataset.deletedObjects = state.deletedObjects || '';
        doc.querySelectorAll('[data-pts-field]').forEach(el => {
            el.contentEditable = doc.dataset.editing === 'true' ? 'true' : 'false';
        });
        doc.querySelectorAll('[data-pts-object-text]').forEach(el => {
            el.contentEditable = 'false';
        });
        const selectedObject = doc.querySelector('[data-pts-object].pts-selected');
        const selectedImage = doc.querySelector('[data-pts-image].pts-selected');
        window._paintTempStandardSelectedObject = selectedObject ? selectedObject.dataset.ptsObject : '';
        window._paintTempStandardSelectedImage = selectedImage ? selectedImage.dataset.ptsImage : '';
        window._paintTempStandardSelectedType = selectedObject ? 'object' : (selectedImage ? 'image' : '');
        window._paintTempStandardRestoring = false;
    }

    function _initTemperatureStandardHistory() {
        const state = _temperatureStandardState();
        window._paintTempStandardHistory = state ? [state] : [];
        window._paintTempStandardHistoryIndex = state ? 0 : -1;
    }

    function _commitTemperatureStandardHistory() {
        if (window._paintTempStandardRestoring) return;
        const state = _temperatureStandardState();
        if (!state) return;
        const stack = window._paintTempStandardHistory || [];
        let index = Number(window._paintTempStandardHistoryIndex ?? -1);
        const prev = stack[index];
        if (prev && prev.html === state.html && prev.deletedBoxes === state.deletedBoxes && prev.deletedObjects === state.deletedObjects) return;
        const nextStack = stack.slice(0, index + 1);
        nextStack.push(state);
        while (nextStack.length > 60) nextStack.shift();
        window._paintTempStandardHistory = nextStack;
        window._paintTempStandardHistoryIndex = nextStack.length - 1;
    }

    function undoTemperatureStandardEdit() {
        const stack = window._paintTempStandardHistory || [];
        let index = Number(window._paintTempStandardHistoryIndex ?? -1);
        if (index <= 0) return;
        index -= 1;
        window._paintTempStandardHistoryIndex = index;
        _restoreTemperatureStandardState(stack[index]);
    }

    function redoTemperatureStandardEdit() {
        const stack = window._paintTempStandardHistory || [];
        let index = Number(window._paintTempStandardHistoryIndex ?? -1);
        if (index < 0 || index >= stack.length - 1) return;
        index += 1;
        window._paintTempStandardHistoryIndex = index;
        _restoreTemperatureStandardState(stack[index]);
    }

    async function _loadTemperatureStandard() {
        try {
            const defaults = _defaultTemperatureStandard();
            const saved = (await Storage.getConfigValue(TEMP_STANDARD_CONFIG_KEY)) || {};
            return {
                ...defaults,
                ...saved,
                approvals: window.ApprovalUtils ? ApprovalUtils.normalize(saved.approvals || defaults.approvals) : (saved.approvals || defaults.approvals || {})
            };
        } catch (err) {
            console.warn('[PaintInventory] 온도관리 기준서 설정 로드 실패', err);
            return _defaultTemperatureStandard();
        }
    }

    async function openTemperatureStandard() {
        const data = await _loadTemperatureStandard();
        window._paintTempStandardApprovals = window.ApprovalUtils ? ApprovalUtils.normalize(data.approvals) : (data.approvals || {});
        const deletedBoxes = Object.keys(TEMP_STANDARD_BOX_DEFAULTS)
            .filter(key => data.boxes && data.boxes[key] && data.boxes[key].deleted)
            .join(',');
        const deletedObjects = Object.keys(_defaultTemperatureStandard().objects)
            .filter(key => data.objects && data.objects[key] && data.objects[key].deleted)
            .join(',');
        UIUtils.showModal('도료 보관창고 온도관리 기준서', `
            <style>
                #paintTempStandardDoc [contenteditable="true"] {
                    outline: 2px dashed #2563eb;
                    outline-offset: 2px;
                    background: rgba(219,234,254,.45);
                    border-radius: 3px;
                }
                #paintTempStandardDoc .pts-photo-slot.pts-editing {
                    box-shadow: inset 0 0 0 3px #2563eb;
                    cursor: copy;
                }
                #paintTempStandardDoc .pts-photo-slot.pts-selected {
                    box-shadow: inset 0 0 0 3px #ef4444;
                }
                #paintTempStandardDoc .pts-photo-slot.pts-editing::after {
                    content: "클릭 후 Ctrl+V";
                    position: absolute;
                    left: 8px;
                    bottom: 8px;
                    background: rgba(15,23,42,.78);
                    color: #fff;
                    font-size: 12px;
                    padding: 4px 7px;
                    border-radius: 4px;
                    pointer-events: none;
                }
                #paintTempStandardDoc .pts-resize-handle {
                    display: none;
                    position: absolute;
                    z-index: 6;
                    width: 12px;
                    height: 12px;
                    border: 2px solid #fff;
                    background: #ef4444;
                    box-shadow: 0 1px 4px rgba(15,23,42,.35);
                    border-radius: 50%;
                }
                #paintTempStandardDoc .pts-photo-slot.pts-editing.pts-selected .pts-resize-handle {
                    display: block;
                }
                #paintTempStandardDoc .pts-resize-nw { left: 6px; top: 6px; cursor: nwse-resize; }
                #paintTempStandardDoc .pts-resize-ne { right: 6px; top: 6px; cursor: nesw-resize; }
                #paintTempStandardDoc .pts-resize-sw { left: 6px; bottom: 6px; cursor: nesw-resize; }
                #paintTempStandardDoc .pts-resize-se { right: 6px; bottom: 6px; cursor: nwse-resize; }
                #paintTempStandardDoc .pts-object.pts-selected {
                    outline: 3px solid #ef4444;
                    outline-offset: 2px;
                }
                #paintTempStandardDoc .pts-object {
                    cursor: move;
                }
                #paintTempStandardDoc .pts-object [contenteditable="true"] {
                    cursor: text;
                    user-select: text;
                }
                #paintTempStandardDoc .pts-object-resize {
                    display: none;
                    position: absolute;
                    right: -7px;
                    bottom: -7px;
                    width: 13px;
                    height: 13px;
                    border-radius: 50%;
                    background: #ef4444;
                    border: 2px solid #fff;
                    cursor: nwse-resize;
                    box-shadow: 0 1px 4px rgba(15,23,42,.35);
                }
                #paintTempStandardDoc .pts-object.pts-selected .pts-object-resize {
                    display: block;
                }
                #paintTempApprovalBox {
                    margin: 0 0 10px;
                }
                #paintTempApprovalBox .approval-widget {
                    margin: 0;
                }
            </style>
            <div id="paintTempApprovalBox">
                ${window.ApprovalUtils ? ApprovalUtils.render(data.approvals, {
                    prefix: 'paintTempApproval',
                    editable: true,
                    signHandler: 'PaintInventoryModule.signTemperatureStandardApproval',
                    clearHandler: 'PaintInventoryModule.clearTemperatureStandardApproval'
                }) : ''}
            </div>
            <div style="border:2px solid #1d4ed8;background:#fff;color:#111827;font-family:Inter,'Malgun Gothic',sans-serif;">
                <div id="paintTempStandardDoc" data-deleted-boxes="${deletedBoxes}" data-deleted-objects="${deletedObjects}" style="background:#fff;">
                <div style="display:grid;grid-template-columns:220px 1fr 450px;border-bottom:1px solid #111827;">
                    <div style="border-right:1px solid #111827;display:flex;align-items:center;justify-content:center;padding:5px 10px;min-height:92px;">
                        <img src="assets/viscosity-std/image3.png" alt="KC 케미칼 주식회사"
                            style="width:190px;height:auto;max-height:82px;object-fit:contain;display:block;">
                    </div>
                    <div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;">작업기준서</div>
                    <div style="border-left:1px solid #111827;display:flex;align-items:flex-end;">
                        <div style="display:grid;grid-template-columns:48px 90px 1fr 52px 52px 52px;width:100%;font-size:13px;text-align:center;line-height:1.2;">
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionNo3', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionDate3', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReason3', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionWriter3', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReviewer3', data)}</div>
                            <div style="border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionApprover3', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionNo2', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionDate2', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReason2', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionWriter2', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReviewer2', data)}</div>
                            <div style="border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionApprover2', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionNo', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionDate', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReason', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionWriter', data)}</div>
                            <div style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionReviewer', data)}</div>
                            <div style="border-bottom:1px solid #111827;padding:3px 4px;">${_editableField('revisionApprover', data)}</div>
                            <div style="border-right:1px solid #111827;padding:3px 4px;font-weight:800;">NO</div>
                            <div style="border-right:1px solid #111827;padding:3px 4px;font-weight:800;">작성일자</div>
                            <div style="border-right:1px solid #111827;padding:3px 4px;font-weight:800;">개정사유</div>
                            <div style="border-right:1px solid #111827;padding:3px 4px;font-weight:800;">작성</div>
                            <div style="border-right:1px solid #111827;padding:3px 4px;font-weight:800;">검토</div>
                            <div style="padding:3px 4px;font-weight:800;">승인</div>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;">
                    <section style="border-right:1px dotted #6b7280;padding:8px 10px 16px;">
                        <div data-pts-surface="makerRangeSurface" style="position:relative;min-height:52px;">
                            ${_photoSlot('makerRangeBox', data, `
                                <div style="background:#d9d9d9;padding:7px 8px;font-size:20px;color:#111827;box-sizing:border-box;height:100%;display:flex;align-items:center;">
                                    <span style="color:#000;font-weight:900;">■</span>
                                    ${_editableField('makerRange', data, 'margin-left:8px;')}
                                </div>
                            `, 'z-index:2;')}
                        </div>
                        <div data-pts-surface="operationTitleSurface" style="position:relative;min-height:36px;margin-top:20px;">
                            ${_photoSlot('operationTitle', data, `<div style="font-weight:800;height:100%;display:flex;align-items:center;">■ 냉난방기 가동 기준</div>`, 'z-index:2;')}
                        </div>
                        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:14px;text-align:center;">
                            <thead>
                                <tr style="background:#c4d79b;">
                                    <th style="border:1px solid #111827;padding:4px;">계절별</th>
                                    <th style="border:1px solid #111827;padding:4px;">외부평균온도</th>
                                    <th style="border:1px solid #111827;padding:4px;">가동구분</th>
                                    <th style="border:1px solid #111827;padding:4px;">온도별</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="border:1px solid #111827;padding:4px;background:#e5e7eb;">봄</td>
                                    <td style="border:1px solid #111827;padding:4px;">${_editableField('springRange', data)}</td>
                                    <td style="border:1px solid #111827;padding:4px;">비가동</td>
                                    <td rowspan="2" style="border:1px solid #111827;padding:4px;background:#5b9bd5;color:#001f3f;font-weight:800;">${_editableField('coolRule', data)}</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #111827;padding:4px;background:#5b9bd5;color:#fff;">여름</td>
                                    <td style="border:1px solid #111827;padding:4px;background:#5b9bd5;color:#fff;">${_editableField('summerRange', data)}</td>
                                    <td style="border:1px solid #111827;padding:4px;background:#5b9bd5;color:#fff;">냉방</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #111827;padding:4px;background:#e5e7eb;">가을</td>
                                    <td style="border:1px solid #111827;padding:4px;">${_editableField('autumnRange', data)}</td>
                                    <td style="border:1px solid #111827;padding:4px;">비가동</td>
                                    <td rowspan="2" style="border:1px solid #111827;padding:4px;background:#ff0000;color:#fff;font-weight:800;">${_editableField('heatRule', data)}</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #111827;padding:4px;background:#ff0000;color:#fff;">겨울</td>
                                    <td style="border:1px solid #111827;padding:4px;background:#ff0000;color:#fff;">${_editableField('winterRange', data)}</td>
                                    <td style="border:1px solid #111827;padding:4px;background:#ff0000;color:#fff;">난방</td>
                                </tr>
                            </tbody>
                        </table>
                        <div data-pts-surface="recordTitleSurface" style="position:relative;min-height:36px;margin-top:20px;">
                            ${_photoSlot('recordTitle', data, `<div style="font-weight:800;height:100%;display:flex;align-items:center;">■ 기록 방법</div>`, 'z-index:2;')}
                        </div>
                        <div data-pts-surface="recordMethod" class="pts-object-surface"
                            style="position:relative;min-height:220px;margin-top:10px;border:1px solid transparent;">
                            ${_photoSlot('recordBackground', data, '', 'background:#f8fafc;border:1px solid #d1d5db;box-sizing:border-box;z-index:1;')}
                            ${_photoSlot('thermometer', data, `<div style="display:inline-block;border:3px dashed #facc15;border-radius:10px;padding:10px 18px;font-size:28px;font-weight:800;color:#64748b;background:#fff;">${data.recordBox}</div>`, 'z-index:2;')}
                            ${_photoSlot('checkSheet', data, `<div style="border:1px solid #111827;background:#fff;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#475569;box-sizing:border-box;">${data.sheetLabel}</div>`, 'z-index:2;')}
                            ${_standardObjectsHtml('recordMethod', data, ['recordNote'])}
                        </div>
                    </section>

                    <section style="padding:8px 10px 16px;">
                        <div data-pts-surface="kcRangeSurface" style="position:relative;min-height:52px;">
                            ${_photoSlot('kcRangeBox', data, `
                                <div style="background:#d9d9d9;padding:7px 8px;font-size:20px;color:#ff0000;box-sizing:border-box;height:100%;display:flex;align-items:center;">
                                    <span style="font-weight:900;">■</span>
                                    ${_editableField('kcRange', data, 'margin-left:8px;')}
                                </div>
                            `, 'z-index:2;')}
                        </div>
                        <div data-pts-surface="controllerTitleSurface" style="position:relative;min-height:36px;margin-top:20px;">
                            ${_photoSlot('controllerTitle', data, `<div style="font-weight:800;height:100%;display:flex;align-items:center;">■ 냉난방기 작동 방법</div>`, 'z-index:2;')}
                        </div>
                        <div data-pts-surface="controllerSurface" style="position:relative;min-height:300px;margin-top:12px;">
                            ${_photoSlot('controller', data, `
                            <div style="position:relative;background:#e5e7eb;border:1px solid #cbd5e1;height:100%;overflow:hidden;box-sizing:border-box;">
                                <div style="position:absolute;left:72px;right:130px;top:36px;height:72px;background:#1f2937;border-radius:45px 45px 16px 16px;box-shadow:inset 0 0 0 10px #64748b;"></div>
                                <div style="position:absolute;left:205px;top:55px;background:#0f172a;color:#7cff00;font-size:34px;font-family:monospace;padding:8px 30px;border-radius:4px;">16</div>
                                <div style="position:absolute;left:160px;right:160px;top:130px;height:52px;background:#cbd5e1;border-radius:26px;"></div>
                                <div style="position:absolute;left:230px;top:143px;width:34px;height:22px;background:#94a3b8;border-radius:50%;"></div>
                                <div style="position:absolute;left:278px;top:143px;width:50px;height:22px;background:#94a3b8;border-radius:50%;"></div>
                            </div>`, 'z-index:1;',
                            `${_standardObjectsHtml('controller', data, ['settingTemp', 'heatButton', 'coolButton'])}`)}
                        </div>
                        <div style="display:grid;grid-template-columns:28px 1fr;column-gap:6px;row-gap:6px;margin:28px 0 0 0;font-size:16px;line-height:1.65;">
                            <div style="text-align:right;">${_editableField('stepNo1', data)}</div>
                            <div>${_editableField('step1', data)}</div>
                            <div style="text-align:right;">${_editableField('stepNo2', data)}</div>
                            <div><span style="color:#c2410c;">${_editableField('step2Heat', data)}</span><br>
                                <span style="color:#2563eb;">${_editableField('step2Cool', data)}</span></div>
                            <div style="text-align:right;">${_editableField('stepNo3', data)}</div>
                            <div>${_editableField('step3', data)}</div>
                        </div>
                    </section>
                </div>
                </div>
            </div>
        `, `<div id="paintTempStandardFooter">${_temperatureStandardFooter(false)}</div>`, 'xl');
        _prepareTemperatureStandardLayout(data);
        _initTemperatureStandardHistory();
        _renderTemperatureStandardFooter(false);
    }

    function _temperatureStandardFooter(editing) {
        if (!editing) {
            return `
                <button class="btn btn-outline" onclick="PaintInventoryModule.setTemperatureStandardEdit(true)">편집</button>
                <button class="btn btn-secondary" onclick="PaintInventoryModule.printTemperatureStandard()">인쇄</button>
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`;
        }
        return `
            <button class="btn btn-outline" onclick="PaintInventoryModule.addTemperatureStandardObject('text')">텍스트</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.addTemperatureStandardObject('box')">사각형</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.startTemperatureStandardLineTool('arrow')">화살표</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.startTemperatureStandardLineTool('line')">선</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.undoTemperatureStandardEdit()">되돌리기</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.redoTemperatureStandardEdit()">다시실행</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.duplicateTemperatureStandardObject()">복제</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.rotateTemperatureStandardObject(-15)">왼쪽 회전</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.rotateTemperatureStandardObject(15)">오른쪽 회전</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.arrangeTemperatureStandardObject('front')">앞으로</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.arrangeTemperatureStandardObject('back')">뒤로</button>
            <button class="btn btn-outline" onclick="PaintInventoryModule.resetTemperatureStandard()">기본값(전 저장 정보)</button>
            <button class="btn btn-primary" onclick="PaintInventoryModule.saveTemperatureStandard()">저장</button>`;
    }

    function _renderTemperatureStandardFooter(editing) {
        const footer = document.getElementById('paintTempStandardFooter');
        if (footer) footer.innerHTML = _temperatureStandardFooter(!!editing);
    }

    function _renderTemperatureStandardApprovals() {
        const box = document.getElementById('paintTempApprovalBox');
        if (!box || !window.ApprovalUtils) return;
        window._paintTempStandardApprovals = ApprovalUtils.collect('paintTempApproval', window._paintTempStandardApprovals || {});
        box.innerHTML = ApprovalUtils.render(window._paintTempStandardApprovals, {
            prefix: 'paintTempApproval',
            editable: true,
            signHandler: 'PaintInventoryModule.signTemperatureStandardApproval',
            clearHandler: 'PaintInventoryModule.clearTemperatureStandardApproval'
        });
    }

    async function _persistTemperatureStandardApprovals() {
        try {
            await Storage.setConfigValue(TEMP_STANDARD_CONFIG_KEY, _collectTemperatureStandard());
        } catch (err) {
            console.error('[PaintInventory] approval save failed', err);
            UIUtils.toast('서명 저장에 실패했습니다. 서버 연결 상태를 확인하세요.', 'error');
        }
    }

    async function signTemperatureStandardApproval(roleKey) {
        if (!window.ApprovalUtils) return;
        window._paintTempStandardApprovals = ApprovalUtils.collect('paintTempApproval', window._paintTempStandardApprovals || {});
        window._paintTempStandardApprovals = ApprovalUtils.sign(window._paintTempStandardApprovals, roleKey);
        _renderTemperatureStandardApprovals();
        await _persistTemperatureStandardApprovals();
    }

    async function clearTemperatureStandardApproval(roleKey) {
        if (!window.ApprovalUtils) return;
        window._paintTempStandardApprovals = ApprovalUtils.collect('paintTempApproval', window._paintTempStandardApprovals || {});
        window._paintTempStandardApprovals = ApprovalUtils.clear(window._paintTempStandardApprovals, roleKey);
        _renderTemperatureStandardApprovals();
        await _persistTemperatureStandardApprovals();
    }

    function setTemperatureStandardEdit(enabled) {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        doc.querySelectorAll('[data-pts-field]').forEach(el => {
            el.contentEditable = enabled ? 'true' : 'false';
        });
        doc.querySelectorAll('[data-pts-image]').forEach(el => {
            el.classList.toggle('pts-editing', !!enabled);
        });
        doc.dataset.editing = enabled ? 'true' : 'false';
        if (window._paintTempStandardPasteHandler) {
            document.removeEventListener('paste', window._paintTempStandardPasteHandler, true);
            window._paintTempStandardPasteHandler = null;
        }
        if (window._paintTempStandardKeyHandler) {
            document.removeEventListener('keydown', window._paintTempStandardKeyHandler, true);
            window._paintTempStandardKeyHandler = null;
        }
        if (window._paintTempStandardPointerHandler) {
            doc.removeEventListener('mousedown', window._paintTempStandardPointerHandler, true);
            window._paintTempStandardPointerHandler = null;
        }
        if (window._paintTempStandardClickHandler) {
            doc.removeEventListener('click', window._paintTempStandardClickHandler, true);
            window._paintTempStandardClickHandler = null;
        }
        if (window._paintTempStandardToolHandler) {
            doc.removeEventListener('click', window._paintTempStandardToolHandler, true);
            window._paintTempStandardToolHandler = null;
        }
        if (enabled) {
            _renderTemperatureStandardFooter(true);
            doc.querySelectorAll('[data-pts-object-text]').forEach(el => {
                el.contentEditable = 'false';
            });
            window._paintTempStandardPasteHandler = (event) => pasteTemperatureStandardImage(event);
            document.addEventListener('paste', window._paintTempStandardPasteHandler, true);
            window._paintTempStandardKeyHandler = (event) => {
                const key = event.key.toLowerCase();
                const active = document.activeElement;
                if ((event.ctrlKey || event.metaKey) && !active?.isContentEditable) {
                    if (key === 'z') {
                        event.preventDefault();
                        if (event.shiftKey) redoTemperatureStandardEdit();
                        else undoTemperatureStandardEdit();
                        return;
                    }
                    if (key === 'y') {
                        event.preventDefault();
                        redoTemperatureStandardEdit();
                        return;
                    }
                    if (key === 'v') {
                        event.preventDefault();
                        pasteTemperatureStandardImage(event);
                        return;
                    }
                }
                if (!['Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                if (active && active.isContentEditable) return;
                event.preventDefault();
                if (event.key === 'Delete') deleteSelectedTemperatureStandardObject();
                else nudgeSelectedTemperatureStandardObject(event.key, event.ctrlKey, event.altKey);
            };
            document.addEventListener('keydown', window._paintTempStandardKeyHandler, true);
            window._paintTempStandardPointerHandler = (event) => {
                if (_handleTemperatureStandardDrawStart(event)) return;
                const editable = event.target.closest('[contenteditable="true"]');
                if (editable) return;

                const objectEl = event.target.closest('[data-pts-object]');
                if (objectEl) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.target.closest('.pts-object-resize')) {
                        startTemperatureStandardObjectResize(event, objectEl.dataset.ptsObject);
                    } else {
                        startTemperatureStandardObjectDrag(event, objectEl.dataset.ptsObject);
                    }
                    return;
                }

                const imageEl = event.target.closest('[data-pts-image]');
                if (imageEl) {
                    event.preventDefault();
                    event.stopPropagation();
                    startTemperatureStandardImageDrag(event, imageEl.dataset.ptsImage);
                }
            };
            doc.addEventListener('mousedown', window._paintTempStandardPointerHandler, true);
            window._paintTempStandardClickHandler = (event) => {
                const editable = event.target.closest('[contenteditable="true"]');
                if (editable) return;

                const objectEl = event.target.closest('[data-pts-object]');
                if (objectEl) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectTemperatureStandardObject(objectEl.dataset.ptsObject);
                    return;
                }

                const imageEl = event.target.closest('[data-pts-image]');
                if (imageEl) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectTemperatureStandardImage(imageEl.dataset.ptsImage);
                }
            };
            doc.addEventListener('click', window._paintTempStandardClickHandler, true);
            const firstSlot = doc.querySelector('[data-pts-image]');
            if (firstSlot && !doc.querySelector('.pts-photo-slot.pts-selected')) {
                selectTemperatureStandardImage(firstSlot.dataset.ptsImage);
            }
            _initTemperatureStandardHistory();
        } else {
            _renderTemperatureStandardFooter(false);
            doc.querySelectorAll('[data-pts-object-text]').forEach(el => {
                el.contentEditable = 'false';
            });
            doc.querySelectorAll('.pts-selected').forEach(el => el.classList.remove('pts-selected'));
            window._paintTempStandardSelectedImage = '';
            window._paintTempStandardSelectedObject = '';
        }
        UIUtils.toast(enabled ? '편집 모드입니다. 사각 객체는 클릭으로 선택하고 더블클릭으로 글자를 수정합니다. Delete는 선택 객체 삭제, Ctrl/Alt+방향키는 이동/크기 조절입니다.' : '편집 모드를 종료했습니다.', 'info');
    }

    function _collectTemperatureStandard() {
        const doc = document.getElementById('paintTempStandardDoc');
        const data = _defaultTemperatureStandard();
        if (!doc) return data;
        data.approvals = window.ApprovalUtils
            ? ApprovalUtils.collect('paintTempApproval', window._paintTempStandardApprovals || data.approvals)
            : (window._paintTempStandardApprovals || data.approvals || {});
        window._paintTempStandardApprovals = data.approvals;
        doc.querySelectorAll('[data-pts-field]').forEach(el => {
            data[el.dataset.ptsField] = el.innerHTML.trim();
        });
        data.images = {};
        doc.querySelectorAll('[data-pts-image]').forEach(el => {
            const img = el.querySelector('img');
            if (img && img.src) {
                data.images[el.dataset.ptsImage] = {
                    src: img.src,
                    x: Number(el.dataset.x || 50),
                    y: Number(el.dataset.y || 50),
                    scale: Number(el.dataset.scale || 100)
                };
            }
        });
        data.boxes = {};
        const deletedBoxes = new Set((doc.dataset.deletedBoxes || '').split(',').filter(Boolean));
        Object.keys(TEMP_STANDARD_BOX_DEFAULTS).forEach(key => {
            if (deletedBoxes.has(key)) {
                data.boxes[key] = { ..._boxData(data, key), deleted: true };
                return;
            }
            const el = doc.querySelector(`[data-pts-image="${key}"]`);
            if (!el) return;
            data.boxes[key] = {
                x: Number(el.dataset.boxX || 0),
                y: Number(el.dataset.boxY || 0),
                w: Number(el.dataset.boxW || 0),
                h: Number(el.dataset.boxH || 0),
                deleted: false
            };
        });
        data.objects = {};
        const deletedObjects = (doc.dataset.deletedObjects || '').split(',').filter(Boolean);
        deletedObjects.forEach(key => {
            data.objects[key] = { ..._objectData(data, key), deleted: true };
        });
        doc.querySelectorAll('[data-pts-object]').forEach(el => {
            const key = el.dataset.ptsObject;
            const base = _objectData(data, key);
            data.objects[key] = {
                ...base,
                slot: el.dataset.slot || base.slot || '',
                kind: el.dataset.kind || base.kind || 'box',
                bg: el.dataset.bg || base.bg || 'transparent',
                color: el.dataset.color || base.color || '#111827',
                z: Number(el.dataset.z || base.z || 4),
                x: Number(el.dataset.x || base.x || 50),
                y: Number(el.dataset.y || base.y || 50),
                w: Number(el.dataset.w || base.w || 20),
                h: Number(el.dataset.h || base.h || 12),
                rot: Number(el.dataset.rot || base.rot || 0),
                text: (el.querySelector('[data-pts-object-text]') || el).innerHTML.trim()
            };
        });
        return data;
    }

    async function saveTemperatureStandard() {
        try {
            await Storage.setConfigValue(TEMP_STANDARD_CONFIG_KEY, _collectTemperatureStandard());
            setTemperatureStandardEdit(false);
            UIUtils.toast('온도관리 기준서가 저장되었습니다.', 'success');
        } catch (err) {
            console.error('[PaintInventory] 온도관리 기준서 저장 실패', err);
            UIUtils.toast('저장에 실패했습니다. 서버 연결 상태를 확인하세요.', 'error');
        }
    }

    async function resetTemperatureStandard() {
        UIUtils.confirm('온도관리 기준서를 기본값으로 복원하시겠습니까?', async () => {
            try {
                await Storage.setConfigValue(TEMP_STANDARD_CONFIG_KEY, _defaultTemperatureStandard());
                UIUtils.toast('기본값으로 복원되었습니다.', 'success');
                openTemperatureStandard();
            } catch (err) {
                console.error('[PaintInventory] 온도관리 기준서 복원 실패', err);
                UIUtils.toast('복원에 실패했습니다. 서버 연결 상태를 확인하세요.', 'error');
            }
        });
    }

    function selectTemperatureStandardImage(slotKey, event = null) {
        if (event && event.target.closest('[data-pts-object]')) {
            event.stopPropagation();
            return;
        }
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        doc.querySelectorAll('.pts-selected').forEach(el => el.classList.remove('pts-selected'));
        const target = doc.querySelector(`[data-pts-image="${slotKey}"]`);
        if (!target) return;
        target.classList.add('pts-selected');
        target.focus();
        window._paintTempStandardSelectedImage = slotKey;
        window._paintTempStandardSelectedObject = '';
        window._paintTempStandardSelectedType = 'image';
    }

    function selectTemperatureStandardObject(objectKey) {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        doc.querySelectorAll('[data-pts-object-text][contenteditable="true"]').forEach(el => {
            el.contentEditable = 'false';
        });
        doc.querySelectorAll('.pts-selected').forEach(el => el.classList.remove('pts-selected'));
        const target = doc.querySelector(`[data-pts-object="${objectKey}"]`);
        if (!target) return;
        target.classList.add('pts-selected');
        const slot = target.closest('[data-pts-image]');
        window._paintTempStandardSelectedImage = slot ? slot.dataset.ptsImage : '';
        window._paintTempStandardSelectedObject = objectKey;
        window._paintTempStandardSelectedType = 'object';
    }

    function editTemperatureStandardObjectText(event, objectKey) {
        event.preventDefault();
        event.stopPropagation();
        selectTemperatureStandardObject(objectKey);
        const textEl = document.querySelector(`[data-pts-object-text="${objectKey}"]`);
        if (!textEl) return;
        textEl.contentEditable = 'true';
        textEl.focus();
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        textEl.addEventListener('blur', () => {
            textEl.contentEditable = 'false';
            _commitTemperatureStandardHistory();
        }, { once: true });
    }

    function _setObjectGeometry(target, x, y, w, h) {
        target.dataset.x = String(x);
        target.dataset.y = String(y);
        target.dataset.w = String(w);
        target.dataset.h = String(h);
        target.style.left = `${x}%`;
        target.style.top = `${y}%`;
        target.style.width = `${w}%`;
        target.style.height = `${h}%`;
    }

    function _setBoxGeometry(target, x, y, w, h) {
        target.dataset.boxX = String(x);
        target.dataset.boxY = String(y);
        target.dataset.boxW = String(w);
        target.dataset.boxH = String(h);
        target.style.left = `${x}%`;
        target.style.top = `${y}%`;
        if (w > 0) target.style.width = `${w}%`;
        if (h > 0) target.style.height = `${h}px`;
    }

    function nudgeSelectedTemperatureStandardObject(key, ctrlKey, altKey) {
        const step = ctrlKey ? 1 : 3;
        const resize = !!altKey;
        const dir = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step]
        }[key];
        if (!dir) return;

        const objectKey = window._paintTempStandardSelectedObject;
        if (objectKey) {
            const target = document.querySelector(`[data-pts-object="${objectKey}"]`);
            if (!target) return;
            const x = Number(target.dataset.x || 50);
            const y = Number(target.dataset.y || 50);
            const w = Number(target.dataset.w || 20);
            const h = Number(target.dataset.h || 12);
            if (resize) _setObjectGeometry(target, x, y, Math.max(6, w + dir[0]), Math.max(5, h + dir[1]));
            else _setObjectGeometry(target, x + dir[0], y + dir[1], w, h);
            _commitTemperatureStandardHistory();
            return;
        }

        const imageKey = window._paintTempStandardSelectedImage;
        const target = imageKey ? document.querySelector(`[data-pts-image="${imageKey}"]`) : null;
        if (!target) return;
        const isBoxSlot = target.dataset.boxKey === 'true';
        const img = target.querySelector('img');
        if (img && !isBoxSlot) {
            let x = Number(target.dataset.x || 50);
            let y = Number(target.dataset.y || 50);
            let scale = Number(target.dataset.scale || 100);
            if (resize) scale = Math.max(20, Math.min(260, scale + dir[0] + dir[1]));
            else { x += dir[0]; y += dir[1]; }
            target.dataset.x = String(x);
            target.dataset.y = String(y);
            target.dataset.scale = String(scale);
            img.style.left = `${x}%`;
            img.style.top = `${y}%`;
            img.style.width = `${scale}%`;
            _commitTemperatureStandardHistory();
            return;
        }
        if (!isBoxSlot) return;
        const bx = Number(target.dataset.boxX || 0);
        const by = Number(target.dataset.boxY || 0);
        const bw = Number(target.dataset.boxW || 0) || Math.round((target.offsetWidth / Math.max(1, target.parentElement.offsetWidth)) * 100);
        const bh = Number(target.dataset.boxH || 0) || target.offsetHeight;
        if (resize) _setBoxGeometry(target, bx, by, Math.max(8, bw + dir[0]), Math.max(24, bh + dir[1] * 3));
        else _setBoxGeometry(target, bx + dir[0], by + dir[1], bw, bh);
        _commitTemperatureStandardHistory();
    }

    function startTemperatureStandardObjectDrag(event, objectKey) {
        const target = document.querySelector(`[data-pts-object="${objectKey}"]`);
        const surface = target && (target.closest('[data-pts-image]') || target.closest('[data-pts-surface]'));
        const doc = document.getElementById('paintTempStandardDoc');
        if (!target || !surface || doc?.dataset.editing !== 'true') return;
        if (event.target.closest('.pts-object-resize')) return;
        event.preventDefault();
        event.stopPropagation();
        selectTemperatureStandardObject(objectKey);
        const rect = surface.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = Number(target.dataset.x || 50);
        const originY = Number(target.dataset.y || 50);
        const w = Number(target.dataset.w || 20);
        const h = Number(target.dataset.h || 12);
        const onMove = (moveEvent) => {
            const x = originX + ((moveEvent.clientX - startX) / rect.width) * 100;
            const y = originY + ((moveEvent.clientY - startY) / rect.height) * 100;
            _setObjectGeometry(target, x, y, w, h);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _commitTemperatureStandardHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startTemperatureStandardObjectResize(event, objectKey) {
        const target = document.querySelector(`[data-pts-object="${objectKey}"]`);
        const surface = target && (target.closest('[data-pts-image]') || target.closest('[data-pts-surface]'));
        const doc = document.getElementById('paintTempStandardDoc');
        if (!target || !surface || doc?.dataset.editing !== 'true') return;
        event.preventDefault();
        event.stopPropagation();
        selectTemperatureStandardObject(objectKey);
        const rect = surface.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const x = Number(target.dataset.x || 50);
        const y = Number(target.dataset.y || 50);
        const originW = Number(target.dataset.w || 20);
        const originH = Number(target.dataset.h || 12);
        const onMove = (moveEvent) => {
            const w = Math.max(6, Math.min(60, originW + ((moveEvent.clientX - startX) / rect.width) * 100));
            const h = Math.max(5, Math.min(40, originH + ((moveEvent.clientY - startY) / rect.height) * 100));
            _setObjectGeometry(target, x, y, w, h);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _commitTemperatureStandardHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function _selectedTemperatureStandardContainer() {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return null;
        const selectedObject = doc.querySelector('[data-pts-object].pts-selected');
        if (selectedObject) return selectedObject.closest('[data-pts-image]') || selectedObject.closest('[data-pts-surface]');
        const selectedImage = doc.querySelector('[data-pts-image].pts-selected');
        if (selectedImage) return selectedImage;
        return doc.querySelector('[data-pts-image="controller"]') || doc.querySelector('[data-pts-image]');
    }

    function _appendTemperatureStandardObject(container, object) {
        const data = { objects: { [object.key]: object } };
        const firstHandle = container.querySelector('.pts-resize-handle');
        if (firstHandle) firstHandle.insertAdjacentHTML('beforebegin', _standardObjectHtml(object.key, data));
        else container.insertAdjacentHTML('beforeend', _standardObjectHtml(object.key, data));
        selectTemperatureStandardObject(object.key);
        _commitTemperatureStandardHistory();
    }

    function startTemperatureStandardLineTool(type = 'line') {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        if (doc.dataset.editing !== 'true') setTemperatureStandardEdit(true);
        doc.dataset.drawTool = type === 'arrow' ? 'arrow' : 'line';
        UIUtils.toast('그릴 영역에서 마우스로 드래그해 선을 그리세요.', 'info');
    }

    function _handleTemperatureStandardDrawStart(event) {
        const doc = document.getElementById('paintTempStandardDoc');
        const tool = doc?.dataset.drawTool;
        if (!tool || doc.dataset.editing !== 'true') return false;
        const surface = event.target.closest('[data-pts-image], [data-pts-surface]');
        if (!surface || event.target.closest('[data-pts-object]')) return false;
        event.preventDefault();
        event.stopPropagation();

        const rect = surface.getBoundingClientRect();
        const startXPct = ((event.clientX - rect.left) / rect.width) * 100;
        const startYPct = ((event.clientY - rect.top) / rect.height) * 100;
        const key = `custom_${Date.now()}`;
        const slot = surface.dataset.ptsImage || surface.dataset.ptsSurface || 'controller';
        const object = {
            key,
            slot,
            kind: tool,
            x: startXPct,
            y: startYPct,
            w: 2,
            h: 5,
            rot: 0,
            z: 9,
            bg: 'rgba(255,255,255,0)',
            color: '#111827',
            text: tool === 'arrow' ? '화살표' : '선'
        };
        _appendTemperatureStandardObject(surface, object);
        const target = surface.querySelector(`[data-pts-object="${key}"]`);

        const onMove = (moveEvent) => {
            if (!target) return;
            const endXPct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            const endYPct = ((moveEvent.clientY - rect.top) / rect.height) * 100;
            const dx = endXPct - startXPct;
            const dy = endYPct - startYPct;
            const length = Math.max(3, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            _setObjectGeometry(target, startXPct, startYPct, length, 5);
            target.dataset.rot = String(angle);
            target.style.transform = `rotate(${angle}deg)`;
            target.style.transformOrigin = 'left center';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            delete doc.dataset.drawTool;
            _commitTemperatureStandardHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return true;
    }

    function rotateTemperatureStandardObject(delta) {
        const target = document.querySelector('[data-pts-object].pts-selected');
        if (!target) return;
        const kind = target.dataset.kind || 'box';
        const current = Number(target.dataset.rot || 0);
        const next = current + Number(delta || 0);
        target.dataset.rot = String(next);
        target.style.transform = `rotate(${next}deg)`;
        target.style.transformOrigin = (kind === 'line' || kind === 'arrow') ? 'left center' : 'center center';
        _commitTemperatureStandardHistory();
    }

    function addTemperatureStandardObject(type = 'text') {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        if (doc.dataset.editing !== 'true') setTemperatureStandardEdit(true);
        const container = _selectedTemperatureStandardContainer();
        if (!container) return;
        const key = `custom_${Date.now()}`;
        const slot = container.dataset.ptsImage || container.dataset.ptsSurface || 'controller';
        const isText = type === 'text';
        const isLine = type === 'line' || type === 'arrow';
        _appendTemperatureStandardObject(container, {
            key,
            slot,
            kind: isLine ? type : (isText ? 'text' : 'box'),
            x: 12,
            y: 12,
            w: isLine ? 28 : (isText ? 24 : 22),
            h: isLine ? 6 : (isText ? 12 : 18),
            rot: 0,
            z: isText ? 50 : 8,
            bg: isText || isLine ? 'rgba(255,255,255,0)' : '#2563eb',
            color: isLine ? '#111827' : (isText ? '#111827' : '#ffffff'),
            text: isText ? '텍스트' : (type === 'arrow' ? '화살표' : (type === 'line' ? '선' : '사각형'))
        });
    }

    function duplicateTemperatureStandardObject() {
        const source = document.querySelector('[data-pts-object].pts-selected');
        const container = source && (source.closest('[data-pts-image]') || source.closest('[data-pts-surface]'));
        if (!source || !container) return;
        const key = `custom_${Date.now()}`;
        _appendTemperatureStandardObject(container, {
            key,
            slot: source.dataset.slot || container.dataset.ptsImage || container.dataset.ptsSurface || '',
            kind: source.dataset.kind || 'box',
            x: Number(source.dataset.x || 10) + 3,
            y: Number(source.dataset.y || 10) + 3,
            w: Number(source.dataset.w || 20),
            h: Number(source.dataset.h || 12),
            rot: Number(source.dataset.rot || 0),
            z: Number(source.dataset.z || 4) + 1,
            bg: source.dataset.bg || 'transparent',
            color: source.dataset.color || '#111827',
            text: (source.querySelector('[data-pts-object-text]') || source).innerHTML.trim()
        });
    }

    function arrangeTemperatureStandardObject(direction) {
        const target = document.querySelector('[data-pts-object].pts-selected');
        if (!target) return;
        const current = Number(target.dataset.z || target.style.zIndex || 4);
        const next = direction === 'back' ? Math.max(1, current - 1) : current + 1;
        target.dataset.z = String(next);
        target.style.zIndex = String(next);
        _commitTemperatureStandardHistory();
    }

    function deleteSelectedTemperatureStandardObject() {
        const objectKey = window._paintTempStandardSelectedObject;
        if (objectKey) {
            const doc = document.getElementById('paintTempStandardDoc');
            if (doc) {
                const deleted = new Set((doc.dataset.deletedObjects || '').split(',').filter(Boolean));
                deleted.add(objectKey);
                doc.dataset.deletedObjects = Array.from(deleted).join(',');
            }
            document.querySelector(`[data-pts-object="${objectKey}"]`)?.remove();
            window._paintTempStandardSelectedObject = '';
            _commitTemperatureStandardHistory();
            return;
        }
        const imageKey = window._paintTempStandardSelectedImage;
        if (!imageKey) return;
        if (Object.prototype.hasOwnProperty.call(TEMP_STANDARD_BOX_DEFAULTS, imageKey)) {
            const doc = document.getElementById('paintTempStandardDoc');
            if (doc) {
                const deleted = new Set((doc.dataset.deletedBoxes || '').split(',').filter(Boolean));
                deleted.add(imageKey);
                doc.dataset.deletedBoxes = Array.from(deleted).join(',');
            }
            document.querySelector(`[data-pts-image="${imageKey}"]`)?.remove();
            window._paintTempStandardSelectedImage = '';
            _commitTemperatureStandardHistory();
            return;
        }
        adjustTemperatureStandardImage(imageKey, 'delete');
        _commitTemperatureStandardHistory();
    }

    function _renderTemperatureImage(target, src, meta = {}) {
        const x = Number(meta.x ?? target.dataset.x ?? 50);
        const y = Number(meta.y ?? target.dataset.y ?? 50);
        const scale = Number(meta.scale ?? target.dataset.scale ?? 100);
        target.dataset.x = String(x);
        target.dataset.y = String(y);
        target.dataset.scale = String(scale);
        const handles = Array.from(target.querySelectorAll('.pts-resize-handle')).map(el => el.outerHTML).join('');
        const objects = Array.from(target.querySelectorAll('.pts-object')).map(el => el.outerHTML).join('');
        target.innerHTML = _photoImgHtml({ src, x, y, scale }) + objects + handles;
    }

    function adjustTemperatureStandardImage(slotKey, action) {
        const target = document.querySelector(`[data-pts-image="${slotKey}"]`);
        if (!target) return;
        selectTemperatureStandardImage(slotKey);
        const img = target.querySelector('img');
        if (action === 'delete') {
            img?.remove();
            target.dataset.x = '50';
            target.dataset.y = '50';
            target.dataset.scale = '100';
            const handles = Array.from(target.querySelectorAll('.pts-resize-handle')).map(el => el.outerHTML).join('');
            const objects = Array.from(target.querySelectorAll('.pts-object')).map(el => el.outerHTML).join('');
            target.innerHTML = `<div class="pts-photo-fallback" style="width:100%;height:100%;">${TEMP_STANDARD_IMAGE_FALLBACKS[slotKey] || ''}</div>${objects}${handles}`;
            target.classList.add('pts-selected');
            _commitTemperatureStandardHistory();
            return;
        }
        if (!img) return;
        let x = Number(target.dataset.x || 50);
        let y = Number(target.dataset.y || 50);
        let scale = Number(target.dataset.scale || 100);
        if (action === 'left') x -= 3;
        if (action === 'right') x += 3;
        if (action === 'up') y -= 3;
        if (action === 'down') y += 3;
        if (action === 'smaller') scale = Math.max(20, scale - 10);
        if (action === 'larger') scale = Math.min(260, scale + 10);
        if (action === 'fit') { x = 50; y = 50; scale = 100; }
        target.dataset.x = String(x);
        target.dataset.y = String(y);
        target.dataset.scale = String(scale);
        img.style.left = `${x}%`;
        img.style.top = `${y}%`;
        img.style.width = `${scale}%`;
        _commitTemperatureStandardHistory();
    }

    function startTemperatureStandardImageDrag(event, slotKey) {
        const target = document.querySelector(`[data-pts-image="${slotKey}"]`);
        if (!target || !target.classList.contains('pts-editing')) return;
        if (event.target.closest('.pts-object')) return;
        event.preventDefault();
        selectTemperatureStandardImage(slotKey);
        const rect = target.getBoundingClientRect();
        const parentRect = target.parentElement.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = Number(target.dataset.x || 50);
        const originY = Number(target.dataset.y || 50);
        const originScale = Number(target.dataset.scale || 100);
        const originBoxX = Number(target.dataset.boxX || 0);
        const originBoxY = Number(target.dataset.boxY || 0);
        const originBoxW = Number(target.dataset.boxW || 0) || Math.round((target.offsetWidth / Math.max(1, parentRect.width)) * 100);
        const originBoxH = Number(target.dataset.boxH || 0) || target.offsetHeight;
        const resizeHandle = event.target.closest('[data-pts-resize]');
        const isBoxSlot = target.dataset.boxKey === 'true';
        const onMove = (moveEvent) => {
            const img = target.querySelector('img');
            if (resizeHandle) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (img && !isBoxSlot) {
                    const dir = resizeHandle.dataset.ptsResize || 'se';
                    const horizontal = (dir.includes('e') ? dx : -dx) / rect.width * 100;
                    const vertical = (dir.includes('s') ? dy : -dy) / rect.height * 100;
                    const scale = Math.max(20, Math.min(260, originScale + horizontal + vertical));
                    target.dataset.scale = String(scale);
                    img.style.width = `${scale}%`;
                } else if (isBoxSlot) {
                    const w = Math.max(8, originBoxW + (dx / Math.max(1, parentRect.width)) * 100);
                    const h = Math.max(24, originBoxH + dy);
                    _setBoxGeometry(target, originBoxX, originBoxY, w, h);
                }
                return;
            }
            if (!img || isBoxSlot) {
                if (!isBoxSlot) return;
                const x = originBoxX + ((moveEvent.clientX - startX) / Math.max(1, parentRect.width)) * 100;
                const y = originBoxY + ((moveEvent.clientY - startY) / Math.max(1, parentRect.height)) * 100;
                _setBoxGeometry(target, x, y, originBoxW, originBoxH);
                return;
            }
            const x = originX + ((moveEvent.clientX - startX) / rect.width) * 100;
            const y = originY + ((moveEvent.clientY - startY) / rect.height) * 100;
            target.dataset.x = String(x);
            target.dataset.y = String(y);
            img.style.left = `${x}%`;
            img.style.top = `${y}%`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _commitTemperatureStandardHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function _temperaturePasteTarget(slotKey = '') {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc || doc.dataset.editing !== 'true') return null;
        const selectedKey = slotKey
            || window._paintTempStandardSelectedImage
            || doc.querySelector('[data-pts-image].pts-selected')?.dataset.ptsImage
            || doc.querySelector('[data-pts-object].pts-selected')?.closest('[data-pts-image]')?.dataset.ptsImage
            || 'controller';
        const target = selectedKey ? doc.querySelector(`[data-pts-image="${selectedKey}"]`) : null;
        if (target && target.classList.contains('pts-editing')) return target;
        return doc.querySelector('[data-pts-image].pts-editing');
    }

    function _fileFromTemperaturePasteEvent(event) {
        const data = event?.clipboardData;
        if (!data) return null;
        const item = Array.from(data.items || []).find(entry => entry.type && entry.type.startsWith('image/'));
        if (item) return item.getAsFile();
        return Array.from(data.files || []).find(file => file.type && file.type.startsWith('image/')) || null;
    }

    function _readTemperatureImageFile(target, file) {
        if (!target || !file) return false;
        const reader = new FileReader();
        reader.onload = () => {
            selectTemperatureStandardImage(target.dataset.ptsImage);
            _renderTemperatureImage(target, reader.result, { x: 50, y: 50, scale: 100 });
            _commitTemperatureStandardHistory();
            UIUtils.toast('스크린샷을 붙여넣었습니다. 저장을 눌러 반영하세요.', 'success');
        };
        reader.readAsDataURL(file);
        return true;
    }

    async function _pasteTemperatureImageFromClipboard(target) {
        if (!target || !navigator.clipboard || !navigator.clipboard.read) return false;
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find(t => t.startsWith('image/'));
                if (!type) continue;
                const blob = await item.getType(type);
                return _readTemperatureImageFile(target, blob);
            }
        } catch (err) {
            console.warn('[PaintInventory] clipboard image read failed', err);
        }
        return false;
    }

    function pasteTemperatureStandardImage(event, slotKey) {
        if (event?._paintTempStandardHandled) return;
        const target = _temperaturePasteTarget(slotKey);
        if (!target) return;
        const file = _fileFromTemperaturePasteEvent(event);
        if (!file) {
            _pasteTemperatureImageFromClipboard(target).then(ok => {
                if (!ok && event?.type === 'keydown') {
                    UIUtils.toast('클립보드에서 이미지 파일을 찾지 못했습니다. 캡처 후 Ctrl+V를 다시 눌러주세요.', 'warning');
                }
            });
            return;
        }
        event._paintTempStandardHandled = true;
        event?.preventDefault?.();
        _readTemperatureImageFile(target, file);
        return;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
            selectTemperatureStandardImage(target.dataset.ptsImage);
            _renderTemperatureImage(target, reader.result, { x: 50, y: 50, scale: 100 });
            _commitTemperatureStandardHistory();
            UIUtils.toast('스크린샷이 붙여넣기 되었습니다. 저장을 눌러 반영하세요.', 'success');
        };
        reader.readAsDataURL(file);
    }

    function printTemperatureStandard() {
        const doc = document.getElementById('paintTempStandardDoc');
        if (!doc) return;
        if (window.ApprovalUtils) {
            window._paintTempStandardApprovals = ApprovalUtils.collect('paintTempApproval', window._paintTempStandardApprovals || {});
            _renderTemperatureStandardApprovals();
        }
        const approvalBox = document.getElementById('paintTempApprovalBox');
        const win = window.open('', '_blank');
        if (!win) {
            UIUtils.toast('인쇄 창을 열 수 없습니다. 팝업 차단 설정을 확인하세요.', 'warning');
            return;
        }
        win.document.write(`
            <!doctype html>
            <html><head><meta charset="utf-8"><title>도료 보관창고 온도관리 기준서</title>
            <style>
                @page { size: A4 landscape; margin: 8mm; }
                body { margin:0; font-family: Inter, 'Malgun Gothic', sans-serif; }
                [contenteditable] { outline: none !important; background: transparent !important; }
                .pts-photo-slot::after { display:none !important; }
                .pts-selected { box-shadow:none !important; }
            </style></head><body>${approvalBox ? approvalBox.outerHTML : ''}${doc.outerHTML}</body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 250);
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
        exportData,
        openTemperatureStandard,
        signTemperatureStandardApproval,
        clearTemperatureStandardApproval,
        setTemperatureStandardEdit,
        saveTemperatureStandard,
        resetTemperatureStandard,
        pasteTemperatureStandardImage,
        printTemperatureStandard,
        selectTemperatureStandardImage,
        selectTemperatureStandardObject,
        editTemperatureStandardObjectText,
        adjustTemperatureStandardImage,
        startTemperatureStandardImageDrag,
        startTemperatureStandardObjectDrag,
        startTemperatureStandardObjectResize,
        deleteSelectedTemperatureStandardObject,
        nudgeSelectedTemperatureStandardObject,
        addTemperatureStandardObject,
        startTemperatureStandardLineTool,
        rotateTemperatureStandardObject,
        duplicateTemperatureStandardObject,
        arrangeTemperatureStandardObject,
        undoTemperatureStandardEdit,
        redoTemperatureStandardEdit
    };
})();
