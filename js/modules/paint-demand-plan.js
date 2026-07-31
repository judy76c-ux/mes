/**
 * 도료 소요 계획 (틀)
 * 영업계획(차종·품명·컬러·수량) → 도료 필요량 → 현재재고 대비 부족량/발주 후보
 * ※ 영업계획·개당 소요량 연동이 미완성이므로 현재는 화면 골격과 데이터 연결 지점만 제공한다.
 */
var PaintDemandPlanModule = (function () {
    const PLAN_STORE = DB.STORES.SALES_DELIVERY_PLAN;
    const PAINT_STORE = DB.STORES.PAINT_MATERIALS;
    const INV_STORE = DB.STORES.PAINT_INVENTORY;
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;

    let _activeTab = 'plan'; // plan | demand | order

    function _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _fmt(n) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(Number(n) || 0)
            : String(Number(n) || 0);
    }

    function _today() {
        return (typeof UIUtils !== 'undefined' && UIUtils.today) ? UIUtils.today() : new Date().toISOString().slice(0, 10);
    }

    function _addDays(dateText, days) {
        const d = new Date(String(dateText).slice(0, 10) + 'T00:00:00');
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function _num(v) {
        return Number(v) || 0;
    }

    // ─── 데이터 스텁 (향후 본계산으로 교체) ───────────────────────────

    /** 영업계획 행 집계: 차종·품명·컬러별 계획 수량 */
    function _loadSalesPlanRows(start, end, carFilter) {
        let plans = [];
        try {
            if (Storage.getByDateRange) {
                plans = Storage.getByDateRange(PLAN_STORE, start, end) || [];
            } else {
                plans = (Storage.getAll(PLAN_STORE) || []).filter(p => {
                    const dt = String(p.date || p.planDate || '').slice(0, 10);
                    return dt >= start && dt <= end;
                });
            }
        } catch (e) {
            plans = [];
        }

        const map = {};
        plans.forEach(p => {
            const carModel = p.carModel || '';
            const partName = p.partName || '';
            const color = p.color || '';
            if (carFilter && carModel !== carFilter) return;
            const qty = _num(p.planQty != null ? p.planQty : (p.quantity != null ? p.quantity : p.qty));
            if (!carModel && !partName) return;
            const key = [carModel, partName, color].join('||');
            if (!map[key]) {
                map[key] = { carModel, partName, color, planQty: 0, planCount: 0 };
            }
            map[key].planQty += qty;
            map[key].planCount += 1;
        });
        return Object.values(map).sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko') ||
            (a.color || '').localeCompare(b.color || '', 'ko')
        );
    }

    /** 제품 마스터의 도료 BOM (주제/경화제/희석제) — 소요량 g/EA 는 추후 사용량 기준 연동 */
    function _productPaintBom(carModel, partName, color) {
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const prod = products.find(p => p.carModel === carModel && p.partName === partName && (!color || !p.color || p.color === color))
            || products.find(p => p.carModel === carModel && p.partName === partName);
        if (!prod) return [];
        const rows = Array.isArray(prod.paintMaterials) ? prod.paintMaterials : [];
        const materials = [];
        rows.forEach(row => {
            [
                ['mainId', '주제', row.mainId || row.paintMaterialId],
                ['hardId', '경화제', row.hardId],
                ['thinnerId', '희석제', row.thinnerId]
            ].forEach(function (entry) {
                const role = entry[1];
                const id = entry[2];
                if (!id || id === '사용불필요') return;
                materials.push({
                    materialId: id,
                    role: role,
                    paintSpec: row.paintSpec || '',
                    // TODO: 개당 소요량(g) — PaintMix 사용량 기준 / 배합비 연동
                    usageGPerEa: null
                });
            });
        });
        return materials;
    }

    /** 도료 현재 재고(캔) — PAINT_INVENTORY 기준 */
    function _paintStockByMaterial() {
        const stock = {};
        (Storage.getAll(INV_STORE) || []).forEach(function (r) {
            const id = r.materialId;
            if (!id) return;
            const qty = _num(r.quantity);
            if (!stock[id]) stock[id] = 0;
            if (r.type === '출고') stock[id] -= qty;
            else stock[id] += qty;
        });
        return stock;
    }

    /**
     * 도료별 소요·부족 집계 (틀)
     * 현재: 영업계획 × BOM 연결만 하고, 필요량(g)/캔 환산은 미구현 → null
     */
    function _buildDemandRows(planRows) {
        const paintMap = {};
        (Storage.getAll(PAINT_STORE) || []).forEach(function (m) {
            if (m.id) paintMap[m.id] = m;
        });
        const stockMap = _paintStockByMaterial();
        const demand = {};

        planRows.forEach(function (pr) {
            const bom = _productPaintBom(pr.carModel, pr.partName, pr.color);
            bom.forEach(function (b) {
                if (!demand[b.materialId]) {
                    const mat = paintMap[b.materialId] || {};
                    demand[b.materialId] = {
                        materialId: b.materialId,
                        name: mat.name || b.materialId,
                        supplier: mat.supplier || '',
                        paintType: mat.paintType || mat.type || '',
                        itemType: mat.itemType || '',
                        packUnitKg: _num(mat.packUnit),
                        linkedPlanQty: 0,
                        needG: null,
                        needCans: null,
                        stockCans: Math.max(0, stockMap[b.materialId] || 0),
                        shortageCans: null,
                        roles: new Set(),
                        linkedProducts: new Set()
                    };
                }
                const row = demand[b.materialId];
                row.linkedPlanQty += pr.planQty;
                row.roles.add(b.role);
                row.linkedProducts.add([pr.carModel, pr.partName, pr.color].filter(Boolean).join(' / '));
                // TODO: needG += pr.planQty * usageGPerEa
                // TODO: needCans = ceil(needG / (packUnitKg * 1000))
                // TODO: shortageCans = max(0, needCans - stockCans)
            });
        });

        return Object.values(demand).map(function (r) {
            return Object.assign({}, r, {
                roles: [...r.roles].join(', '),
                linkedProducts: [...r.linkedProducts]
            });
        }).sort(function (a, b) {
            return (a.supplier || '').localeCompare(b.supplier || '', 'ko')
                || (a.name || '').localeCompare(b.name || '', 'ko');
        });
    }

    function _kpi(icon, color, label, value, sub) {
        return '<div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:' + color + '18;color:' + color + ';font-size:18px;">' + icon + '</span>' +
                '<span style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">' + label + '</span>' +
            '</div>' +
            '<div style="font-size:1.35rem;font-weight:800;color:var(--text-primary);line-height:1.2;">' + value + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">' + sub + '</div>' +
        '</div>';
    }

    function _tabBtn(id, label) {
        const active = _activeTab === id;
        return '<button type="button" class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '" ' +
            'onclick="PaintDemandPlanModule.switchTab(\'' + id + '\')">' + label + '</button>';
    }

    function _renderPlanTable(rows) {
        if (!rows.length) {
            return '<div style="padding:36px;text-align:center;color:var(--text-muted);line-height:1.6;">' +
                '조회 기간에 영업계획 데이터가 없습니다.<br>' +
                '<span style="font-size:0.82rem;">영업 관리 → 영업 계획에서 등록되면 여기에 집계됩니다. (현재 영업계획 기능은 보완 예정)</span>' +
            '</div>';
        }
        return '<div class="data-table-wrapper" style="overflow-x:auto;">' +
            '<table class="data-table data-table--content">' +
            '<thead><tr>' +
                '<th>차종</th><th>품명</th><th>컬러</th>' +
                '<th style="text-align:right;">계획수량 (EA)</th>' +
                '<th style="text-align:center;">도료 BOM</th>' +
                '<th>상태</th>' +
            '</tr></thead><tbody>' +
            rows.map(function (r) {
                const bom = _productPaintBom(r.carModel, r.partName, r.color);
                const bomOk = bom.length > 0;
                return '<tr>' +
                    '<td><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                    '<td>' + _esc(r.partName || '-') + '</td>' +
                    '<td>' + _esc(r.color || '-') + '</td>' +
                    '<td style="text-align:right;font-weight:700;">' + _fmt(r.planQty) + '</td>' +
                    '<td style="text-align:center;">' + (bomOk
                        ? '<span style="color:#059669;font-weight:700;">' + bom.length + '종</span>'
                        : '<span style="color:#dc2626;">미연결</span>') + '</td>' +
                    '<td><span style="font-size:0.72rem;color:var(--text-muted);">소요량 계산 준비중</span></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>';
    }

    function _renderDemandTable(demandRows) {
        if (!demandRows.length) {
            return '<div style="padding:36px;text-align:center;color:var(--text-muted);line-height:1.6;">' +
                '집계할 도료 소요가 없습니다.<br>' +
                '<span style="font-size:0.82rem;">영업계획 품목과 제품 마스터 도료 BOM이 연결되면 표시됩니다.</span>' +
            '</div>';
        }
        return '<div class="data-table-wrapper" style="overflow-x:auto;">' +
            '<table class="data-table data-table--content">' +
            '<thead><tr>' +
                '<th>구매처</th><th>도료명</th><th>종류</th><th>역할</th>' +
                '<th style="text-align:right;">연결 계획수량</th>' +
                '<th style="text-align:right;">필요량 (g)</th>' +
                '<th style="text-align:right;">필요 (캔)</th>' +
                '<th style="text-align:right;">현재재고 (캔)</th>' +
                '<th style="text-align:right;">부족 (캔)</th>' +
            '</tr></thead><tbody>' +
            demandRows.map(function (r) {
                return '<tr>' +
                    '<td>' + _esc(r.supplier || '-') + '</td>' +
                    '<td><strong>' + _esc(r.name) + '</strong></td>' +
                    '<td>' + _esc(r.paintType || '-') + '</td>' +
                    '<td style="font-size:0.78rem;">' + _esc(r.roles || '-') + '</td>' +
                    '<td style="text-align:right;">' + _fmt(r.linkedPlanQty) + '</td>' +
                    '<td style="text-align:right;color:var(--text-muted);">-</td>' +
                    '<td style="text-align:right;color:var(--text-muted);">-</td>' +
                    '<td style="text-align:right;font-weight:700;color:var(--accent-blue);">' + _fmt(r.stockCans) + '</td>' +
                    '<td style="text-align:right;color:var(--text-muted);">-</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +
            '<p style="margin:10px 0 0;font-size:0.78rem;color:var(--text-muted);">' +
                '※ 필요량(g)·필요 캔·부족량은 개당 도료 소요량 기준 연동 후 계산됩니다. 현재는 재고만 표시합니다.' +
            '</p>';
    }

    function _renderOrderTable(demandRows) {
        // 부족 계산 미구현 → 발주 후보 틀만
        return '<div style="padding:28px 20px;border:1px dashed var(--border-color);border-radius:12px;background:var(--bg-secondary);">' +
            '<div style="display:flex;align-items:flex-start;gap:12px;">' +
                '<span class="material-symbols-outlined" style="color:#d97706;font-size:28px;">pending</span>' +
                '<div>' +
                    '<div style="font-weight:700;margin-bottom:6px;">발주 후보 목록 (준비중)</div>' +
                    '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.55;">' +
                        '부족량(캔) = 필요 캔 − 현재재고 로 계산되면, 부족 &gt; 0 인 도료가 이 탭에 표시됩니다.<br>' +
                        '연동 예정: 영업계획 · 제품 도료 BOM · 개당 소요량(g) · 포장용량(KG) · 도료 창고 재고' +
                    '</div>' +
                    '<div style="margin-top:10px;font-size:0.78rem;color:var(--text-muted);">' +
                        '현재 연결 가능 도료 ' + _fmt(demandRows.length) + '종 · 재고 데이터 읽기 가능' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _readFilters() {
        const start = document.getElementById('pdpStart')?.value || _today();
        const end = document.getElementById('pdpEnd')?.value || _addDays(start, 30);
        const car = document.getElementById('pdpCarFilter')?.value || '';
        return { start, end, car };
    }

    function _carOptions(selected) {
        const cars = [...new Set((Storage.getAll(PRODUCTS_STORE) || []).map(p => p.carModel).filter(Boolean))];
        if (typeof UIUtils !== 'undefined' && UIUtils.sortCarModels) {
            UIUtils.sortCarModels(cars);
        } else {
            cars.sort((a, b) => a.localeCompare(b, 'ko'));
        }
        return '<option value="">전체 차종</option>' +
            cars.map(c => '<option value="' + _esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + _esc(c) + '</option>').join('');
    }

    function refresh() {
        const body = document.getElementById('pdpBody');
        if (!body) return;
        const f = _readFilters();
        const planRows = _loadSalesPlanRows(f.start, f.end, f.car);
        const demandRows = _buildDemandRows(planRows);
        const planQtySum = planRows.reduce((s, r) => s + r.planQty, 0);
        const stockLinked = demandRows.reduce((s, r) => s + r.stockCans, 0);

        const kpiHtml =
            '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px;">' +
                _kpi('event_note', '#2563eb', '영업계획 품목', _fmt(planRows.length) + '건', '기간 내 차종·품명·컬러 집계') +
                _kpi('inventory_2', '#059669', '계획 수량 합계', _fmt(planQtySum) + ' EA', '영업계획 수량 (미완성 시 0)') +
                _kpi('palette', '#7c3aed', '연결 도료', _fmt(demandRows.length) + '종', '제품 BOM 기준') +
                _kpi('warehouse', '#d97706', '연결 도료 재고', _fmt(stockLinked) + ' 캔', '부족량 계산은 준비중') +
            '</div>';

        let tableHtml = '';
        if (_activeTab === 'plan') tableHtml = _renderPlanTable(planRows);
        else if (_activeTab === 'demand') tableHtml = _renderDemandTable(demandRows);
        else tableHtml = _renderOrderTable(demandRows);

        body.innerHTML = kpiHtml +
            '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">' +
                _tabBtn('plan', '① 영업계획 기준') +
                _tabBtn('demand', '② 도료 소요·재고') +
                _tabBtn('order', '③ 발주 후보') +
            '</div>' +
            '<div class="card"><div class="card-body" style="padding:12px;">' + tableHtml + '</div></div>';
    }

    function switchTab(tab) {
        _activeTab = tab || 'plan';
        refresh();
    }

    function render(container, opts) {
        if (!container) return;
        opts = opts || {};
        const start = _today();
        const end = _addDays(start, 30);
        const embedded = !!opts.embedded;

        container.innerHTML =
            '<div class="' + (embedded ? '' : 'fade-in-up') + '">' +
                (embedded ? '' : ((typeof WarehouseNavUI !== 'undefined' && WarehouseNavUI.renderSection)
                    ? WarehouseNavUI.renderSection('paint-inventory') : '')) +
                '<div style="margin:0 0 12px;padding:12px 14px;border-radius:10px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">' +
                    '<strong style="color:var(--accent-blue);">도료 소요계획</strong> — 영업계획(차종·품명·컬러·수량)에 맞춰 도료 필요량을 산출하고, ' +
                    '현재 재고 대비 부족량·발주 후보를 보여 주는 화면입니다.<br>' +
                    '<span style="color:#d97706;font-weight:600;">현재 영업계획·개당 소요량 연동이 미완성이므로 화면 틀만 제공됩니다.</span> ' +
                    '재고 조회와 제품 BOM 연결 구조는 미리 반영해 두었습니다.' +
                '</div>' +
                '<div class="filter-bar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
                    '<div class="form-group"><label class="form-label">시작일</label>' +
                        '<input type="date" class="form-input" id="pdpStart" value="' + start + '"></div>' +
                    '<div class="form-group"><label class="form-label">종료일</label>' +
                        '<input type="date" class="form-input" id="pdpEnd" value="' + end + '"></div>' +
                    '<div class="form-group"><label class="form-label">차종</label>' +
                        '<select class="form-select" id="pdpCarFilter">' + _carOptions('') + '</select></div>' +
                    '<div class="form-group" style="align-self:flex-end;">' +
                        '<button class="btn btn-outline" onclick="PaintDemandPlanModule.refresh()">' +
                            '<span class="material-symbols-outlined">search</span> 조회</button></div>' +
                    '<div class="form-group" style="align-self:flex-end;margin-left:auto;">' +
                        '<button class="btn btn-outline" onclick="Router.navigate(\'sales-delivery-plan\')">' +
                            '<span class="material-symbols-outlined">sell</span> 영업 계획</button></div>' +
                '</div>' +
                '<div id="pdpBody"></div>' +
            '</div>';

        _activeTab = 'plan';
        refresh();
    }

    return {
        render,
        refresh,
        switchTab
    };
})();
