/**
 * 영업 관리 모듈 (납품관리, 매입관리, 외주처관리)
 */

// 공통 유틸리티: 컬럼 정의 및 테이블 렌더링
const SalesUtils = {
    renderMain(container, title, desc, onAdd, onExport, filterHTML, tableID, headers, addLabel = '등록') {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>${title}</h3>
                        <p>${desc}</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="${onAdd}">
                            <span class="material-symbols-outlined">add</span> ${addLabel}
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    ${filterHTML}
                </div>

                <div class="stat-cards" id="${tableID}Stats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        ${headers.map(h => `<th>${h}</th>`).join('')}
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="${tableID}Body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

// 영업 관리 공통 상단 네비게이션 (수입검사/자재창고 허브 카드 스타일)
var SalesProcessUI = (function () {
    const MENUS = [
        { id: 'sales-delivery-plan', label: '영업 계획', desc: '납품 스케쥴·계획·미납 현황', icon: 'event_note', accent: 'var(--accent-blue)' },
        { id: 'sales-planning-materials', label: '생산계획 자료', desc: '사출·도장·레이져 필요량 산출', icon: 'factory', accent: '#0ea5e9' },
        { id: 'sales-today-shipment', label: '납품 출하(금일)', desc: '금일 출하 계획품 관리', icon: 'outbox', accent: '#f97316' },
        { id: 'sales-delivery', label: '출고 이력', desc: '납품처별 출고 이력 조회', icon: 'history', accent: '#8b5cf6' },
        { id: 'sales-analytics', label: '영업관리', desc: '연간·월간·주간 매출 분석', icon: 'analytics', accent: '#10b981' },
        { id: 'sales-outsourcing', label: '외주처 관리', desc: '외주처 등록 · 외주처 출고 목록', icon: 'handshake', accent: '#0d9488' }
    ];
    function renderSection(activePage) {
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">
                ${MENUS.map(function (menu) {
                    const active = menu.id === activePage;
                    return `
                        <button type="button" onclick="Router.navigate('${menu.id}')"
                            style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                                   border:${active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)'};
                                   background:var(--bg-primary);color:var(--text-primary);
                                   cursor:pointer;min-width:160px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                            <span style="display:inline-flex;align-items:center;justify-content:center;
                                         width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                         background:${active ? 'var(--accent-blue)' : 'var(--bg-secondary)'};">
                                <span class="material-symbols-outlined" style="font-size:24px;color:${active ? '#fff' : 'var(--text-muted)'};">${menu.icon}</span>
                            </span>
                            <span style="display:flex;flex-direction:column;gap:2px;">
                                <span style="font-size:0.92rem;font-weight:700;">${menu.label}</span>
                                <span style="font-size:0.73rem;color:var(--text-muted);">${menu.desc}</span>
                            </span>
                        </button>`;
                }).join('')}
            </div>`;
    }
    return { renderSection: renderSection };
})();

/**
 * 1) 출고 이력 — 납품처별 출고 이력 조회
 */
var SalesDeliveryModule = (function() {
    const STORE = DB.STORES.SALES_DELIVERY;
    const INVENTORY_STORE = DB.STORES.PRODUCT_INVENTORY;

    function _esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function _uniqueSorted(values) {
        return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _filterCustomers() {
        const deliveries = Storage.getAll(STORE) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return _uniqueSorted([
            ...deliveries.map(d => d.customer),
            ...products.map(p => p.customer || p.deliveryCustomer || p.client)
        ]);
    }

    function _filterCars(customer = '') {
        const deliveries = Storage.getAll(STORE) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return UIUtils.sortCarModels([
            ...deliveries
                .filter(d => !customer || d.customer === customer)
                .map(d => d.carModel),
            ...products
                .filter(p => !customer || (p.customer || p.deliveryCustomer || p.client) === customer)
                .map(p => p.carModel)
        ], products);
    }

    function _filterOptions(values, selected, label) {
        return `<option value="">${label}</option>` +
            values.map(v => `<option value="${_esc(v)}" ${v === selected ? 'selected' : ''}>${_esc(v)}</option>`).join('');
    }

    function onFilterCustomerChange() {
        const customer = document.getElementById('sdFilterCustomer')?.value || '';
        const carEl = document.getElementById('sdFilterCarModel');
        if (carEl) {
            carEl.innerHTML = _filterOptions(_filterCars(customer), '', '전체 차종');
        }
    }

    function render(container) {
        const customerOptions = _filterOptions(_filterCustomers(), '', '전체 납품처');
        const carOptions = _filterOptions(_filterCars(''), '', '전체 차종');
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="sdFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="sdFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">납품처</label>
                <select class="form-select" id="sdFilterCustomer" onchange="SalesDeliveryModule.onFilterCustomerChange()">
                    ${customerOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">차종</label>
                <select class="form-select" id="sdFilterCarModel">
                    ${carOptions}
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="SalesDeliveryModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '출고일', '납품처', '차종', '품명', '수량', '단가', '금액', '비고'];
        container.innerHTML = `
            <div class="fade-in-up">
                ${SalesProcessUI.renderSection('sales-delivery')}
                <div class="filter-bar" style="flex-wrap:wrap; gap:10px; align-items:flex-end;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="sdFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="sdFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">납품처</label>
                        <select class="form-select" id="sdFilterCustomer" onchange="SalesDeliveryModule.onFilterCustomerChange()">
                            ${customerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="sdFilterCarModel">
                            ${carOptions}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="SalesDeliveryModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                    ${_canEditDelivery() ? `<div class="form-group" style="align-self:flex-end; margin-left:auto;">
                        <button class="btn btn-outline" onclick="SalesDeliveryModule.openAddModal()">
                            <span class="material-symbols-outlined">playlist_add</span> 누락출고분 입력
                        </button>
                    </div>` : ''}
                </div>
                <div class="stat-cards" id="sdTableStats"></div>

                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">storefront</span> 납품처별 출고 이력</h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">조회 기간 내 납품처별 출고 집계</span>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>납품처</th>
                                        <th style="text-align:right;">출고 건수</th>
                                        <th style="text-align:right;">총 수량</th>
                                        <th style="text-align:right;">총 매출</th>
                                        <th>주요 차종</th>
                                    </tr>
                                </thead>
                                <tbody id="sdCustomerSummaryBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">list_alt</span> 출고 이력 목록</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>작업</th></tr>
                                </thead>
                                <tbody id="sdTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        search();
    }

    function search() {
        const start = document.getElementById('sdFilterStart').value;
        const end = document.getElementById('sdFilterEnd').value;
        const customer = document.getElementById('sdFilterCustomer')?.value || '';
        const carModel = document.getElementById('sdFilterCarModel')?.value || '';

        let data = Storage.getByDateRange(STORE, start, end);
        if (customer) data = data.filter(d => d.customer === customer);
        if (carModel) data = data.filter(d => d.carModel === carModel);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderStats(data);
        renderCustomerSummary(data);
        renderTable(data);
    }

    function renderCustomerSummary(data) {
        const tbody = document.getElementById('sdCustomerSummaryBody');
        if (!tbody) return;
        const map = {};
        data.forEach(d => {
            const key = d.customer || '(미지정)';
            if (!map[key]) map[key] = { count: 0, qty: 0, amount: 0, cars: {} };
            map[key].count += 1;
            map[key].qty += Number(d.qty) || 0;
            map[key].amount += Number(d.amount) || 0;
            const car = d.carModel || '-';
            map[key].cars[car] = (map[key].cars[car] || 0) + (Number(d.qty) || 0);
        });
        const rows = Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">집계할 출고 내역이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(([cust, v]) => {
            const topCars = Object.entries(v.cars).sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(c => `<span style="display:inline-block;padding:1px 7px;margin:1px;border-radius:999px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:0.72rem;">${_esc(c[0])}</span>`).join(' ');
            return `
                <tr>
                    <td><strong>${_esc(cust)}</strong></td>
                    <td style="text-align:right;">${UIUtils.formatNumber(v.count)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(v.qty)}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">₩${UIUtils.formatNumber(v.amount)}</td>
                    <td>${topCars}</td>
                </tr>`;
        }).join('');
    }

    function renderStats(data) {
        const totalQty = data.reduce((s, d) => s + (Number(d.qty) || 0), 0);
        const totalAmount = data.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        document.getElementById('sdTableStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">총 출고수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">₩${UIUtils.formatNumber(totalAmount)}</div>
                <div class="stat-card-label">총 매출금액</div>
            </div>
        `;
    }

    function _canEditDelivery() {
        return typeof AuthModule !== 'undefined'
            && typeof AuthModule.canWritePage === 'function'
            && AuthModule.canWritePage('sales-delivery');
    }

    function renderTable(data) {
        const tbody = document.getElementById('sdTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><strong>${_esc(d.customer)}</strong></td>
                    <td>${_esc(d.carModel)}</td>
                    <td>${_esc(d.partName)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td style="text-align:right;">${d.unitPrice != null && d.unitPrice !== '' ? UIUtils.formatNumber(d.unitPrice) : '-'}</td>
                    <td style="text-align:right; font-weight:700; color:var(--accent-blue);">₩${d.amount != null && d.amount !== '' ? UIUtils.formatNumber(d.amount) : '-'}</td>
                    <td>${_esc(d.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="SalesDeliveryModule.view('${d.id}')">보기</button>
                    </td>
                </tr>
            `).join('');
    }

    function _sdCarModelOptions(selected) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const cars = UIUtils.sortCarModels(products.map(p => p.carModel), products);
        return `<option value="">-- 차종 선택 --</option>` +
            cars.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
    }

    function _sdPartNameOptions(carModel, selected) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const parts = [...new Set(
            products.filter(p => !carModel || p.carModel === carModel).map(p => p.partName).filter(Boolean)
        )].sort();
        if (!parts.length) return `<option value="">-- 차종 먼저 선택 --</option>`;
        return `<option value="">-- 품명 선택 --</option>` +
            parts.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
    }

    function onSdCarModelChange() {
        const car  = document.getElementById('sdCarModel')?.value || '';
        const sel  = document.getElementById('sdPartName');
        if (sel) sel.innerHTML = _sdPartNameOptions(car, '');
        onSdPartNameChange();
    }

    function onSdPartNameChange() {
        const car      = document.getElementById('sdCarModel')?.value || '';
        const partName = document.getElementById('sdPartName')?.value || '';

        // 납품처 자동 입력
        const custEl = document.getElementById('sdCustomer');
        // 단가 자동 입력
        const priceEl = document.getElementById('sdUnitPrice');
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const prod = products.find(p => (!car || p.carModel === car) && p.partName === partName);
        if (prod) {
            if (custEl) { custEl.value = prod.customer || ''; }
            if (priceEl && prod.salePrice) {
                priceEl.value = prod.salePrice;
                calcAmount();
            }
        } else {
            if (custEl) custEl.value = '';
        }

        // 도장 LOT 목록 갱신
        _renderPaintLotList(car, partName);
    }

    // ── 제품 창고 도장 LOT별 잔량 계산 (선입선출: 도장일자 오름차순) ──
    function _getPaintLots(carModel, partName, ignoreDeliveryId = '') {
        const inv = Storage.getAll(INVENTORY_STORE) || [];
        const lotMap = {};
        inv.filter(r => (!carModel || r.carModel === carModel) && (!partName || r.partName === partName))
            .forEach(r => {
                if (ignoreDeliveryId && r.salesDeliveryId === ignoreDeliveryId) return;
                const paintingDate = r.paintingDate || r.date || '미표기';
                const color = r.color || '';
                const lotNo = r.lotNo || '';
                const key = `${paintingDate}||${color}||${lotNo}`;
                if (!lotMap[key]) lotMap[key] = { paintingDate, color, lotNo, balance: 0 };
                if (r.type === '출고') lotMap[key].balance -= Number(r.quantity) || 0;
                else                   lotMap[key].balance += Number(r.quantity) || 0;
            });
        return Object.values(lotMap)
            .filter(l => l.balance > 0)
            .sort((a, b) =>
                (a.paintingDate || '').localeCompare(b.paintingDate || '') ||
                (a.lotNo || '').localeCompare(b.lotNo || '')
            ); // 선입선출: 오래된 LOT 먼저
    }

    function _renderPaintLotList(carModel, partName) {
        const el = document.getElementById('sdPaintLotList');
        if (!el) return;
        if (!carModel || !partName) {
            el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px;text-align:center;">차종과 품명을 선택하면 도장 LOT가 표시됩니다.</div>`;
            return;
        }
        const lots = _getPaintLots(carModel, partName);
        if (!lots.length) {
            el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px;text-align:center;">제품 창고에 재고가 없습니다.</div>`;
            return;
        }
        const total = lots.reduce((s, l) => s + l.balance, 0);
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
                <span style="font-size:0.8rem;color:var(--text-muted);">총 가용 재고</span>
                <span style="font-size:1rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(total)} EA</span>
            </div>
            ${lots.map((l, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;
                        background:${i === 0 ? 'rgba(59,130,246,0.06)' : 'transparent'};
                        border-radius:6px;margin-bottom:3px;border:1px solid ${i === 0 ? 'rgba(59,130,246,0.2)' : 'transparent'};">
                ${i === 0 ? `<span style="background:var(--accent-orange);color:#fff;font-size:0.65rem;padding:1px 5px;border-radius:3px;white-space:nowrap;">선입</span>` : `<span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">${i + 1}</span>`}
                <span style="font-family:monospace;font-weight:600;font-size:0.85rem;flex:1;">${l.paintingDate}</span>
                ${l.lotNo ? `<span style="font-size:0.75rem;color:var(--text-muted);">${l.lotNo}</span>` : ''}
                ${l.color ? `<span style="font-size:0.75rem;color:var(--text-muted);">${l.color}</span>` : ''}
                <span style="font-weight:700;color:var(--accent-blue);font-size:0.88rem;">${UIUtils.formatNumber(l.balance)} EA</span>
            </div>`).join('')}`;
    }

    function fillForm(d = {}) {
        const carModel = d.carModel || '';
        const partName = d.partName || '';
        const lots = (carModel && partName) ? _getPaintLots(carModel, partName) : [];
        const total = lots.reduce((s, l) => s + l.balance, 0);
        const lotHtml = lots.length
            ? `<div style="display:flex;justify-content:space-between;align-items:center;
                           margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
                   <span style="font-size:0.8rem;color:var(--text-muted);">총 가용 재고</span>
                   <span style="font-size:1rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(total)} EA</span>
               </div>
               ${lots.map((l, i) => `
               <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;
                           background:${i===0?'rgba(59,130,246,0.06)':'transparent'};
                           border-radius:6px;margin-bottom:3px;border:1px solid ${i===0?'rgba(59,130,246,0.2)':'transparent'};">
                   ${i===0?`<span style="background:var(--accent-orange);color:#fff;font-size:0.65rem;padding:1px 5px;border-radius:3px;white-space:nowrap;">선입</span>`:`<span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">${i+1}</span>`}
                   <span style="font-family:monospace;font-weight:600;font-size:0.85rem;flex:1;">${l.paintingDate}</span>
                   ${l.lotNo?`<span style="font-size:0.75rem;color:var(--text-muted);">${l.lotNo}</span>`:''}
                   ${l.color?`<span style="font-size:0.75rem;color:var(--text-muted);">${l.color}</span>`:''}
                   <span style="font-weight:700;color:var(--accent-blue);font-size:0.88rem;">${UIUtils.formatNumber(l.balance)} EA</span>
               </div>`).join('')}`
            : `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px;text-align:center;">
                   ${(carModel && partName) ? '제품 창고에 재고가 없습니다.' : '차종과 품명을 선택하면 도장 LOT가 표시됩니다.'}
               </div>`;

        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="sdDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="sdCustomer" value="${d.customer || ''}"
                        placeholder="품명 선택 시 자동 입력" readonly
                        style="background:var(--bg-secondary);color:var(--text-primary);">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="sdCarModel" onchange="SalesDeliveryModule.onSdCarModelChange()">
                        ${_sdCarModelOptions(carModel)}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="sdPartName" onchange="SalesDeliveryModule.onSdPartNameChange()">
                        ${_sdPartNameOptions(carModel, partName)}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="sdQty" value="${d.qty || ''}"
                        placeholder="0" oninput="SalesDeliveryModule.calcAmount()">
                </div>
                <div class="form-group">
                    <label class="form-label">단가 <span style="font-size:0.75rem;color:var(--text-muted);">(자동)</span></label>
                    <input type="number" class="form-input" id="sdUnitPrice" value="${d.unitPrice || ''}"
                        placeholder="0" oninput="SalesDeliveryModule.calcAmount()">
                </div>
                <div class="form-group">
                    <label class="form-label">금액 <span style="font-size:0.75rem;color:var(--text-muted);">(자동계산)</span></label>
                    <input type="number" class="form-input" id="sdAmount" value="${d.amount || ''}"
                        readonly style="background:var(--bg-secondary);font-weight:700;color:var(--accent-blue);">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="sdNote" style="height:54px;">${d.note || ''}</textarea>
            </div>

            <!-- 도장 LOT 목록 (선입선출) -->
            <div style="margin-top:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                <div style="background:var(--accent-blue);color:#fff;padding:8px 14px;
                            display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:0.95rem;">local_shipping</span>
                    도장 LOT 재고 현황
                    <span style="font-weight:400;opacity:0.85;font-size:0.75rem;">(도장일자 기준 선입선출)</span>
                </div>
                <div id="sdPaintLotList" style="padding:10px 12px;background:var(--bg-primary);max-height:200px;overflow-y:auto;">
                    ${lotHtml}
                </div>
            </div>
        `;
    }

    function calcAmount() {
        const q = Number(document.getElementById('sdQty').value) || 0;
        const p = Number(document.getElementById('sdUnitPrice').value) || 0;
        document.getElementById('sdAmount').value = q * p;
    }

    function collectData() {
        return {
            date: document.getElementById('sdDate').value,
            customer: document.getElementById('sdCustomer').value.trim(),
            carModel: document.getElementById('sdCarModel').value.trim(),
            partName: document.getElementById('sdPartName').value.trim(),
            qty: Number(document.getElementById('sdQty').value) || 0,
            unitPrice: Number(document.getElementById('sdUnitPrice').value) || 0,
            amount: Number(document.getElementById('sdAmount').value) || 0,
            note: document.getElementById('sdNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('누락출고분 입력', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveNew()">입력</button>`, 'lg');
    }

    function _buildFifoAllocations(data, ignoreDeliveryId = '') {
        const lots = _getPaintLots(data.carModel, data.partName, ignoreDeliveryId);
        const totalStock = lots.reduce((s, l) => s + (Number(l.balance) || 0), 0);
        if (totalStock < data.qty) return null;

        let remaining = data.qty;
        const allocations = [];
        for (const lot of lots) {
            if (remaining <= 0) break;
            const takeQty = Math.min(Number(lot.balance) || 0, remaining);
            if (takeQty <= 0) continue;
            allocations.push({
                paintingDate: lot.paintingDate === '미표기' ? '' : lot.paintingDate,
                lotNo: lot.lotNo || '',
                color: lot.color || '',
                quantity: takeQty
            });
            remaining -= takeQty;
        }
        return allocations;
    }

    async function _addInventoryOutRecords(deliveryId, data, allocations) {
        for (const lot of allocations) {
            await Storage.add(INVENTORY_STORE, {
                date: data.date,
                type: '출고',
                carModel: data.carModel,
                partName: data.partName,
                color: lot.color || '',
                paintingDate: lot.paintingDate || '',
                lotNo: lot.lotNo || '',
                quantity: lot.quantity,
                source: `${data.customer || '납품처 미지정'} 출고`,
                salesDeliveryId: deliveryId
            });
        }
    }

    async function _removeInventoryOutRecords(deliveryId) {
        const records = (Storage.getAll(INVENTORY_STORE) || [])
            .filter(r => r.salesDeliveryId === deliveryId && r.type === '출고');
        for (const record of records) {
            await Storage.remove(INVENTORY_STORE, record.id);
        }
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date) { UIUtils.toast('납품일자를 입력하세요.', 'warning'); return; }
        if (!data.carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return; }
        if (!data.partName) { UIUtils.toast('품명을 선택하세요.', 'warning'); return; }
        if (!data.qty)   { UIUtils.toast('수량을 입력하세요.', 'warning'); return; }
        const allocations = _buildFifoAllocations(data);
        if (!allocations) {
            UIUtils.toast('제품 창고 재고가 부족하여 출고할 수 없습니다.', 'warning');
            return;
        }

        if (typeof ProductWarehouseModule !== 'undefined' && ProductWarehouseModule.getShippingReadiness) {
            const shipColor = (allocations[0] && allocations[0].color) || '';
            const shipStatus = await ProductWarehouseModule.getShippingReadiness(data.carModel, data.partName, shipColor);
            if (!shipStatus.eligible) {
                UIUtils.toast('출하검사(외관)·신뢰성 검사가 모두 합격인 품목만 출고할 수 있습니다.', 'warning');
                return;
            }
        }

        const delivery = await Storage.add(STORE, { ...data, lotAllocations: allocations });
        try {
            await _addInventoryOutRecords(delivery.id, data, allocations);
        } catch (err) {
            await Storage.remove(STORE, delivery.id).catch(() => {});
            throw err;
        }
        UIUtils.closeModal();
        UIUtils.toast('누락 출고분이 등록되었습니다.', 'success');
        search();
    }

    function _viewField(label, value, valueStyle = '') {
        const style = valueStyle ? ` style="${valueStyle}"` : '';
        return `<div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="margin-bottom:2px;">${label}</label>
            <div${style}>${value}</div>
        </div>`;
    }

    function view(id) {
        const d = Storage.getById(STORE, id);
        if (!d) {
            UIUtils.toast('출고 내역을 찾을 수 없습니다.', 'warning');
            return;
        }
        const lots = Array.isArray(d.lotAllocations) ? d.lotAllocations : [];
        const lotHtml = lots.length
            ? `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead><tr style="background:var(--bg-secondary);">
                    <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border-color);">도장일자</th>
                    <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border-color);">LOT</th>
                    <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border-color);">컬러</th>
                    <th style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                </tr></thead>
                <tbody>${lots.map(l => `
                    <tr>
                        <td style="padding:6px 8px;">${_esc(l.paintingDate || '-')}</td>
                        <td style="padding:6px 8px;font-family:monospace;">${_esc(l.lotNo || '-')}</td>
                        <td style="padding:6px 8px;">${_esc(l.color || '-')}</td>
                        <td style="padding:6px 8px;text-align:right;font-weight:600;">${UIUtils.formatNumber(l.quantity)} EA</td>
                    </tr>`).join('')}
                </tbody></table>`
            : `<div style="color:var(--text-muted);font-size:0.82rem;">LOT 배분 정보가 없습니다.</div>`;

        const body = `
            <div class="form-row">
                ${_viewField('출고일', _esc(d.date || '-'))}
                ${_viewField('납품처', `<strong>${_esc(d.customer || '-')}</strong>`)}
            </div>
            <div class="form-row">
                ${_viewField('차종', _esc(d.carModel || '-'))}
                ${_viewField('품명', _esc(d.partName || '-'))}
            </div>
            <div class="form-row">
                ${_viewField('수량', `${UIUtils.formatNumber(d.qty)} EA`, 'font-weight:700;')}
                ${_viewField('단가', d.unitPrice != null && d.unitPrice !== '' ? UIUtils.formatNumber(d.unitPrice) : '-')}
                ${_viewField('금액', `₩${d.amount != null && d.amount !== '' ? UIUtils.formatNumber(d.amount) : '-'}`, 'font-weight:700;color:var(--accent-blue);')}
            </div>
            ${_viewField('비고', _esc(d.note || '-'))}
            <div style="margin-top:8px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="background:var(--accent-blue);color:#fff;padding:8px 14px;font-size:0.82rem;font-weight:600;">
                    도장 LOT 배분
                </div>
                <div style="padding:10px 12px;">${lotHtml}</div>
            </div>`;

        const canEdit = _canEditDelivery();
        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            ${canEdit ? `<button class="btn btn-outline" onclick="SalesDeliveryModule.edit('${id}')">수정</button>
            <button class="btn btn-danger" onclick="SalesDeliveryModule.remove('${id}')">삭제</button>` : ''}`;

        UIUtils.showModal('출고 상세', body, footer, 'lg');
    }

    function edit(id) {
        if (!_canEditDelivery()) {
            UIUtils.toast('출고 수정 권한이 없습니다.', 'warning');
            return;
        }
        const d = Storage.getById(STORE, id);
        if (!d) {
            UIUtils.toast('출고 내역을 찾을 수 없습니다.', 'warning');
            return;
        }
        UIUtils.showModal('출고 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveEdit('${id}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
        if (!_canEditDelivery()) {
            UIUtils.toast('출고 수정 권한이 없습니다.', 'warning');
            return;
        }
        const data = collectData();
        if (!data.date) { UIUtils.toast('출고일자를 입력하세요.', 'warning'); return; }
        if (!data.carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return; }
        if (!data.partName) { UIUtils.toast('품명을 선택하세요.', 'warning'); return; }
        if (!data.qty) { UIUtils.toast('수량을 입력하세요.', 'warning'); return; }

        const allocations = _buildFifoAllocations(data, id);
        if (!allocations) {
            UIUtils.toast('제품 창고 재고가 부족하여 출고할 수 없습니다.', 'warning');
            return;
        }

        if (typeof ProductWarehouseModule !== 'undefined' && ProductWarehouseModule.getShippingReadiness) {
            const shipColor = (allocations[0] && allocations[0].color) || '';
            const shipStatus = await ProductWarehouseModule.getShippingReadiness(data.carModel, data.partName, shipColor);
            if (!shipStatus.eligible) {
                UIUtils.toast('출하검사(외관)·신뢰성 검사가 모두 합격인 품목만 출고할 수 있습니다.', 'warning');
                return;
            }
        }

        await _removeInventoryOutRecords(id);
        await Storage.update(STORE, id, { ...data, lotAllocations: allocations });
        await _addInventoryOutRecords(id, data, allocations);
        UIUtils.closeModal();
        UIUtils.toast('제품 출고가 수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        if (!_canEditDelivery()) {
            UIUtils.toast('출고 삭제 권한이 없습니다.', 'warning');
            return;
        }
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await _removeInventoryOutRecords(id);
            await Storage.remove(STORE, id);
            UIUtils.closeModal();
            UIUtils.toast('제품 출고가 삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        const headers = ['출고일', '납품처', '차종', '품명', '수량', '단가', '금액', '비고'];
        const rows = data.map(d => [d.date, d.customer, d.carModel, d.partName, d.qty, d.unitPrice, d.amount, d.note]);
        Storage.exportToCSV(headers, rows, '납품관리');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        view,
        edit,
        saveEdit,
        remove,
        calcAmount,
        exportData,
        onSdCarModelChange,
        onSdPartNameChange,
        onFilterCustomerChange,
        _renderPaintLotList
    };
})();

/**
 * 엑셀 업로드 파싱 이력 + 파싱 순서 저장소 (SalesDeliveryPlanModule 전용).
 *  - history: 언제 파싱했는지, 어느 날짜까지 파싱했는지 기록
 *  - order  : 차종·품명이 파싱에서 처음 등장한 순서(누적) — 사용자가 직접 지정한 순번
 *             (product.deliverySortOrder)이 없을 때만 정렬 기준으로 쓰는 보조 수단.
 */
var SalesParseLog = (function () {
    const KEY = 'salesDeliveryParseLog';
    let _cache = null;

    function _blank() { return { history: [], order: [] }; }

    function _norm(data) {
        if (!data || typeof data !== 'object') return _blank();
        if (!Array.isArray(data.history)) data.history = [];
        if (!Array.isArray(data.order)) data.order = [];
        return data;
    }

    async function load(force) {
        if (_cache && !force) return _cache;
        try {
            _cache = _norm(await Storage.getConfigValue(KEY));
        } catch (e) {
            _cache = _blank();
        }
        return _cache;
    }

    function _key(carModel, partName) {
        return `${String(carModel || '').trim() || '-'}||${String(partName || '').trim()}`;
    }

    // rows: [{ carModel, partName, date }] — 파싱 직후 원본(파싱) 순서
    async function record(rows, source) {
        const data = await load();
        const list = (rows || []).filter(r => r && (r.partName || r.carModel));
        if (!list.length) return data;

        const dates = list.map(r => r.date).filter(Boolean).sort();
        data.history.unshift({
            at: new Date().toISOString(),
            from: dates[0] || '',
            to: dates[dates.length - 1] || '',
            rows: list.length,
            items: new Set(list.map(r => _key(r.carModel, r.partName))).size,
            source: source || ''
        });
        data.history = data.history.slice(0, 50);

        const seen = new Set(data.order);
        list.forEach(r => {
            const k = _key(r.carModel, r.partName);
            if (!seen.has(k)) { seen.add(k); data.order.push(k); }
        });

        try { await Storage.setConfigValue(KEY, data); } catch (e) { /* 무시 */ }
        return data;
    }

    // 차종·품명 → 파싱 순서 인덱스 (미등장 시 매우 큰 값 → 목록 뒤로)
    function orderIndex(carModel, partName) {
        if (!_cache) return Number.MAX_SAFE_INTEGER;
        const i = _cache.order.indexOf(_key(carModel, partName));
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    }

    function history() { return _cache ? _cache.history.slice() : []; }

    return { load, record, orderIndex, history, KEY };
})();

/**
 * 2) 납품 계획 (Delivery Plan)
 */
var SalesDeliveryPlanModule = (function() {
    const STORE = DB.STORES.SALES_DELIVERY_PLAN;

    let _lastRows = [];
    let _lastDays = [];
    let _gridRows = [];
    let _gridDays = [];
    let _dragPlan = null;
    let _dragSuppressClickUntil = 0;
    let _dateHeaderDrag = null;

    function _esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function _js(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r?\n/g, ' ');
    }

    function _num(value) {
        return Number(value) || 0;
    }

    function _fmt(value) {
        return UIUtils.formatNumber(_num(value));
    }

    function _norm(value) {
        return String(value || '').trim().toLowerCase();
    }

    function _carKey(value) {
        return _norm(value).replace(/\s+/g, '');
    }

    function _sameCarModel(a, b) {
        const ak = _carKey(a);
        const bk = _carKey(b);
        return !!ak && !!bk && ak === bk;
    }

    function _compatibleCarModel(a, b) {
        const ak = _carKey(a);
        const bk = _carKey(b);
        if (!ak || !bk) return true;
        return ak === bk || (ak.length > bk.length && ak.endsWith(bk));
    }

    function _compactPart(value) {
        return _norm(value).replace(/[\[\]()（）\s]/g, '');
    }

    function _productPartMatches(product, item) {
        const productPart = _compactPart(product?.partName || '');
        const itemPart = _compactPart(item?.partName || '');
        if (!productPart || !itemPart) return false;
        return productPart === itemPart || itemPart.endsWith(productPart);
    }

    function _addDays(dateText, days) {
        const date = new Date(`${dateText}T00:00:00`);
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    }

    function _days(start, end) {
        const result = [];
        const cur = new Date(`${start}T00:00:00`);
        const last = new Date(`${end}T00:00:00`);
        while (cur <= last && result.length < 75) {
            result.push(cur.toISOString().slice(0, 10));
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    }

    function _dateInRange(date, start, end) {
        const d = String(date || '').slice(0, 10);
        return !!d && (!start || d >= start) && (!end || d <= end);
    }

    const DELIVERY_WEEKDAYS = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];
    const DELIVERY_FIXED_HOLIDAYS = new Set([
        '01-01',
        '03-01',
        '05-05',
        '06-06',
        '08-15',
        '10-03',
        '10-09',
        '12-25'
    ]);

    function _extraHolidaySet() {
        const holidays = [];
        if (Array.isArray(window.MES_HOLIDAYS)) holidays.push(...window.MES_HOLIDAYS);
        try {
            const saved = JSON.parse(localStorage.getItem('mes_holidays') || '[]');
            if (Array.isArray(saved)) holidays.push(...saved);
        } catch (error) {
            // Invalid local holiday settings should not block the delivery grid.
        }
        return new Set(holidays.map(date => String(date).slice(0, 10)));
    }

    function _dayColumnInfo(day) {
        const date = new Date(`${day}T00:00:00`);
        const week = date.getDay();
        const isHoliday = DELIVERY_FIXED_HOLIDAYS.has(day.slice(5)) || _extraHolidaySet().has(day);
        const isToday = day === UIUtils.today();
        const baseClass = (week === 0 || isHoliday) ? 'sdp-red-col' : (week === 6 ? 'sdp-sat-col' : '');
        const className = `${baseClass}${isToday ? ' sdp-today-col' : ''}`.trim();
        return {
            dateLabel: day.slice(5).replace('-', '/'),
            monthLabel: `${Number(day.slice(5, 7))}월`,
            dayLabel: `${Number(day.slice(8))}`,
            weekday: DELIVERY_WEEKDAYS[week] || '',
            className
        };
    }

    function _isWeekendDay(day) {
        const week = new Date(`${day}T00:00:00`).getDay();
        return week === 0 || week === 6;
    }

    function _dayColumnWidth(day) {
        return _isWeekendDay(day) ? 36 : 72;
    }

    function _matches(row, item) {
        if (row.productId && item.productId && row.productId !== item.productId) return false;
        if (_norm(row.partName) !== _norm(item.partName)) return false;
        if (item.carModel && row.carModel && !_sameCarModel(row.carModel, item.carModel)) return false;
        if (item.color && row.color && _norm(row.color) !== _norm(item.color)) return false;
        if (item.customer && row.customer && _norm(row.customer) !== _norm(item.customer)) return false;
        return true;
    }

    function _products() {
        return Storage.getAll(DB.STORES.PRODUCTS) || [];
    }

    function _customerOf(item) {
        return item?.customer || item?.deliveryCustomer || item?.client || item?.buyer || item?.shipTo || item?.destination || '';
    }

    function _productKey(item) {
        return [
            item?.productId || '',
            item?.carModel || '',
            item?.partName || item?.name || '',
            item?.color || item?.paintColor || ''
        ].map(v => _norm(v)).join('||');
    }

    function _findProduct(item) {
        const products = _products();
        if (item?.productId) {
            const byId = products.find(p => p.id === item.productId);
            if (byId) return byId;
        }
        return products.find(p =>
            _norm(p.partName) === _norm(item.partName) &&
            (!item.carModel || _sameCarModel(p.carModel, item.carModel)) &&
            (!item.color || !p.color || _norm(p.color) === _norm(item.color))
        ) || products.find(p =>
            _norm(p.partName) === _norm(item.partName) &&
            (!item.carModel || _sameCarModel(p.carModel, item.carModel))
        ) || products.find(p =>
            _productPartMatches(p, item) &&
            _compatibleCarModel(p.carModel, item.carModel) &&
            (!item.color || !p.color || _norm(p.color) === _norm(item.color))
        ) || products.find(p =>
            _productPartMatches(p, item) &&
            _compatibleCarModel(p.carModel, item.carModel)
        ) || (() => {
            const sameName = products.filter(p => _norm(p.partName) === _norm(item.partName));
            return sameName.length === 1 ? sameName[0] : null;
        })();
    }

    function _packUnitFromProduct(product, fallback) {
        return fallback || product?.packUnit || product?.packageUnit || product?.packQty || product?.packageQty || product?.deliveryPackQty || '';
    }

    function _endProcess(product) {
        const text = [
            product?.process1, product?.process2, product?.process3, product?.process4,
            product?.process5, product?.process6, product?.processFlow, product?.route
        ].filter(Boolean).join(' ');
        if (/레이저|레이져|laser/i.test(text)) return '레이져 END';
        if (/도장|paint/i.test(text)) return '도장 END';
        return '공정 확인';
    }

    function _stockSummary(storeName, item) {
        const rows = (Storage.getAll(storeName) || []).filter(r => _matches(r, item));
        const balance = rows.reduce((sum, r) => {
            const qty = _num(r.quantity ?? r.qty ?? r.lotSize ?? r.passQty);
            const type = String(r.type || '입고');
            return sum + (type.includes('출고') ? -qty : qty);
        }, 0);
        return { balance, hasData: rows.length > 0 };
    }

    function _shippingStandbyQty(item) {
        return (Storage.getAll(DB.STORES.SHIPPING_STANDBY) || [])
            .filter(r => _matches(r, item))
            .filter(r => !['출하완료', '완료'].includes(r.status || ''))
            .reduce((sum, r) => sum + _num(r.quantity ?? r.lotSize ?? r.passQty), 0);
    }

    function _laserStandbyQty(item) {
        const inQty = (Storage.getAll(DB.STORES.PAINTING_WORK) || [])
            .filter(r => _matches(r, item))
            .reduce((sum, r) => sum + _num(r.productionQty ?? r.goodQty ?? r.quantity), 0);
        const outQty = (Storage.getAll(DB.STORES.LASER_WORK_LOG) || [])
            .filter(r => _matches(r, item))
            .reduce((sum, r) => sum + _num(r.quantity), 0);
        return Math.max(0, inQty - outQty);
    }

    function _routeText(row) {
        const product = row?.product || row || {};
        return [
            row?.processEnd,
            product.process1, product.process2, product.process3, product.process4,
            product.process5, product.process6, product.processFlow, product.route
        ].filter(Boolean).join(' ');
    }

    function _isPaintEnd(row) {
        return /도장|paint/i.test(_routeText(row));
    }

    function _isLaserEnd(row) {
        return /레이저|레이져|laser/i.test(_routeText(row));
    }

    function _optionList(values) {
        return [...new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'))
            .map(v => `<option value="${_esc(v)}"></option>`)
            .join('');
    }

    function _buildDatalists() {
        const products = _products();
        const customers = products.map(_customerOf); // 제품 마스터만 — 오염된 계획/납품 값 제외
        return `
            <datalist id="sdpCarList">${UIUtils.sortCarModels(products.map(p => p.carModel), products).map(v => `<option value="${_esc(v)}"></option>`).join('')}</datalist>
            <datalist id="sdpPartList">${_optionList(products.map(p => p.partName))}</datalist>
            <datalist id="sdpColorList">${_optionList(products.map(p => p.color))}</datalist>
            <datalist id="sdpCustomerList">${_optionList(customers)}</datalist>
        `;
    }

    function _unique(values) {
        return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _selectOptions(values, selected, allText = '전체') {
        return `<option value="">${allText}</option>` + _unique(values)
            .map(v => `<option value="${_esc(v)}" ${v === selected ? 'selected' : ''}>${_esc(v)}</option>`)
            .join('');
    }

    // 납품처 목록은 제품 마스터(기초정보)만 신뢰한다. 예전에는 납품계획·납품실적 원장의
    // customer 값도 그대로 끌어와, 오염된 값("6/30" 등 날짜 문자열이 납품처로 잘못 들어간
    // 계획 804건)까지 드롭다운에 그대로 노출됐다. 제품 마스터에 실제로 등록된 납품처만 보여준다.
    function _deliveryCustomers() {
        return _products().map(_customerOf);
    }

    function _deliveryCars(customer = '') {
        const customerKey = _norm(customer);
        const products = _products();
        const linkedProductKeys = new Set();
        const planCars = (Storage.getAll(STORE) || [])
            .filter(r => !customerKey || _norm(_customerOf(r)) === customerKey)
            .flatMap(r => {
                const product = _findProduct(r);
                if (product) linkedProductKeys.add(_productKey(product));
                return [r.carModel, product?.carModel];
            });
        const deliveryCars = (Storage.getAll(DB.STORES.SALES_DELIVERY) || [])
            .filter(r => !customerKey || _norm(_customerOf(r)) === customerKey)
            .flatMap(r => {
                const product = _findProduct(r);
                if (product) linkedProductKeys.add(_productKey(product));
                return [r.carModel, product?.carModel];
            });
        // 납품처 미선택 시에만 제품 마스터 포함, 선택 시엔 실제 계획/납품 기록만 사용
        const productCars = products
            .filter(p => !customerKey || _norm(_customerOf(p)) === customerKey || linkedProductKeys.has(_productKey(p)))
            .map(p => p.carModel);
        return UIUtils.sortCarModels([...productCars, ...planCars, ...deliveryCars], products);
    }

    function onMainCustomerChange() {
        const customer = document.getElementById('sdpCustomerFilter')?.value || '';
        const carEl = document.getElementById('sdpCarFilter');
        if (!carEl) return;
        const current = carEl.value || '';
        const cars = _deliveryCars(customer);
        const keepCurrent = !current || _unique(cars).some(c => _norm(c) === _norm(current));
        carEl.innerHTML = _selectOptions(cars, keepCurrent ? current : '', '전체 차종');
        if (!keepCurrent) carEl.value = '';
    }

    function _productsByCustomer(customer) {
        const customerKey = _norm(customer);
        const products = _products();
        if (!customerKey) return products;

        const linkedKeys = new Set([
            ...(Storage.getAll(STORE) || []),
            ...(Storage.getAll(DB.STORES.SALES_DELIVERY) || [])
        ]
            .filter(r => _norm(_customerOf(r)) === customerKey)
            .map(_productKey));

        const direct = products.filter(p => _norm(_customerOf(p)) === customerKey);
        const linked = products.filter(p => linkedKeys.has(_productKey(p)));
        return direct.length || linked.length
            ? [...new Map([...direct, ...linked].map(p => [_productKey(p), p])).values()]
            : products;
    }

    function _refreshGridCarOptions() {
        const customer = document.getElementById('sdpGridCustomer')?.value || '';
        const carEl = document.getElementById('sdpGridCar');
        if (!carEl) return;

        // 등록 화면은 양산품 대상 — A/S 전용 차종은 목록에 올리지 않는다.
        const cars = _massProductionCars(_deliveryCars(customer));
        const current = carEl.value || '';
        const keepCurrent = !current || _unique(cars).some(c => _norm(c) === _norm(current));
        carEl.innerHTML = _selectOptions(cars, keepCurrent ? current : '', '-- 차종 선택 --');
        if (!keepCurrent) carEl.value = '';
    }

    function onGridCustomerChange() {
        _refreshGridCarOptions();
        requestGridReload();
    }

    function _productBase(product, selectedCustomer = '') {
        return {
            productId: product.id || '',
            customer: selectedCustomer || _customerOf(product),
            carModel: product.carModel || '',
            partName: product.partName || product.name || '',
            color: product.color || product.paintColor || '',
            packUnit: _packUnitFromProduct(product, ''),
            product,
            processEnd: _endProcess(product)
        };
    }

    function _recordsForCell(base, date) {
        const targetDate = String(date || '').slice(0, 10);
        const allPlans = Storage.getAll(STORE) || [];
        const ids = base?.planIdsByDate?.[targetDate];
        if (Array.isArray(ids) && ids.length) {
            const idSet = new Set(ids.map(String));
            return allPlans.filter(plan => idSet.has(String(plan.id)));
        }
        return allPlans.filter(plan =>
            String(plan.date || '').slice(0, 10) === targetDate &&
            _matches(plan, base) &&
            (!base.packUnit || !plan.packUnit || _norm(plan.packUnit) === _norm(base.packUnit))
        );
    }

    function _planQtyForCell(base, date) {
        return _recordsForCell(base, date).reduce((sum, plan) => sum + _num(plan.planQty), 0);
    }

    async function _upsertPlanCell(base, date, qty, note = '') {
        const product = base.product || _findProduct(base);
        const records = _recordsForCell(base, date);
        const data = {
            date,
            productId: product?.id || base.productId || '',
            customer: base.customer || _customerOf(product) || '',
            carModel: product?.carModel || base.carModel || '',
            partName: product?.partName || base.partName || '',
            color: base.color || product?.color || '',
            packUnit: _packUnitFromProduct(product, base.packUnit),
            planQty: qty,
            note
        };

        if (qty > 0) {
            if (records[0]) {
                await Storage.update(STORE, records[0].id, { ...records[0], ...data });
                for (const extra of records.slice(1)) {
                    await Storage.remove(STORE, extra.id);
                }
            } else {
                await Storage.add(STORE, data);
            }
            return;
        }

        for (const record of records) {
            await Storage.remove(STORE, record.id);
        }
    }

    function render(container) {
        const start = UIUtils.today();
        const end = _addDays(start, 30);
        const customerOptions = _selectOptions(_deliveryCustomers(), '', '전체 납품처');
        const carOptions = _selectOptions(_deliveryCars(''), '', '전체 차종');

        container.innerHTML = `
            <div class="fade-in-up sdp-page">
                ${SalesProcessUI.renderSection('sales-delivery-plan')}

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px; align-items:flex-end;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="sdpStart" value="${start}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="sdpEnd" value="${end}">
                    </div>
                    <div class="form-group sdp-date-nav-group" style="align-self:flex-end;">
                        <label class="form-label">기간 이동</label>
                        <div class="sdp-date-nav">
                            <button type="button" class="btn btn-outline btn-sm" onclick="SalesDeliveryPlanModule.shiftMainDateRange(-7)" title="기간을 7일 이전으로 이동">◀ 7일</button>
                            <button type="button" class="btn btn-outline btn-sm" onclick="SalesDeliveryPlanModule.jumpMainDateToday()" title="오늘 날짜로 이동">오늘</button>
                            <button type="button" class="btn btn-outline btn-sm" onclick="SalesDeliveryPlanModule.shiftMainDateRange(7)" title="기간을 7일 이후로 이동">7일 ▶</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">납품처</label>
                        <select class="form-select" id="sdpCustomerFilter" onchange="SalesDeliveryPlanModule.onMainCustomerChange()">
                            ${customerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="sdpCarFilter">
                            ${carOptions}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap;">
                            <input type="checkbox" id="sdpHideNoPlan" onchange="SalesDeliveryPlanModule.toggleHideNoPlan()">
                            계획 없는 품목 숨기기
                        </label>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <label class="form-label">표시 밀도</label>
                        <select class="form-select" id="sdpDensity" onchange="SalesDeliveryPlanModule.setTableDensity(this.value)" style="width:100px;">
                            <option value="standard">표준</option>
                            <option value="compact">압축</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;margin-left:auto;display:flex;gap:8px;">
                        <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.openAddModal()">
                            <span class="material-symbols-outlined">grid_on</span> 차종별 등록
                        </button>
                        <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.openExcelUploadModal()">
                            <span class="material-symbols-outlined">upload_file</span> 납품등록 (엑셀)
                        </button>
                    </div>
                </div>

                <div id="sdpOrphanBanner"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">event_note</span> 영업 계획/부족 현황</h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">
                            날짜 초록: 완제품 재고 납품 가능 구간 · 노랑: 후공정 대기 · 파랑: 도장 필요 · 빨강: 사출 소재 부족
                        </span>
                    </div>
                    <div class="card-body sdp-table-card-body">
                        <div id="sdpTableWrap" class="data-table-wrapper sdp-table-scroll"></div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    async function search() {
        // 표 렌더링 중 오류가 나도 정리 배너는 보이도록 먼저 그린다.
        try { _renderOrphanBanner(); } catch (e) { console.warn('[SalesDeliveryPlan] 정리 배너 표시 실패:', e); }
        await SalesParseLog.load(); // orderIndex(정렬 순서 보조)는 계속 쓰므로 로드는 유지
        const start = document.getElementById('sdpStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpEnd')?.value || _addDays(start, 30);
        const customer = _norm(document.getElementById('sdpCustomerFilter')?.value);
        const car = _norm(document.getElementById('sdpCarFilter')?.value);
        const days = _days(start, end);

        let plans = Storage.getByDateRange(STORE, start, end)
            .filter(p => _dateInRange(p.date, start, end));
        if (customer) plans = plans.filter(p => _norm(_customerOf(p)) === customer);
        if (car) plans = plans.filter(p => {
            const product = _findProduct(p);
            return _carKey(p.carModel) === car.replace(/\s+/g, '') || _carKey(product?.carModel) === car.replace(/\s+/g, '');
        });

        // 계획이 하나도 없는 양산품도 목록에 나오도록, 제품 마스터의 양산품 전체를 먼저 행으로
        // 깔아둔다. 계획이 있으면 그 위에 그대로 합쳐진다(_buildRows의 key 매칭).
        const seedProducts = _productionProducts(customer, car);

        const rows = _buildRows(plans, days, start, end, seedProducts);
        _lastRows = rows;
        _lastDays = days;
        _renderTable(_visibleRows(rows), days);
        setTableDensity(localStorage.getItem('sdp_table_density') || 'standard');
        _renderOrphanBanner();
    }

    /* ── 제품 기초정보에 없는 납품계획 정리 ──────────────────────────────
     * 과거 엑셀 파서가 엑셀의 차종 칸을 그대로 넣던 시절의 잔재(차종 "PA", "417",
     * "7\"" 등)가 남아 있다. 제품 마스터에 없는 품목의 계획은 쓰레기 데이터이므로
     * 영업 계획 화면에서 바로 확인·삭제한다.
     * 판정: productId가 제품 마스터에 있으면 정상. 없으면 차종+품명(공백·대소문자 무시)이
     * 모두 일치하는 제품이 있어야 정상. 둘 다 아니면 삭제 대상.
     */
    function _orphanPlanGroups() {
        const products = _products();
        const idSet = new Set(products.map(p => p.id).filter(Boolean));
        const itemSet = new Set(products.map(p => _carKey(p.carModel) + '||' + _carKey(p.partName)));
        const map = {};
        (Storage.getAll(STORE) || []).forEach(pl => {
            if (pl.productId && idSet.has(pl.productId)) return;
            if (itemSet.has(_carKey(pl.carModel) + '||' + _carKey(pl.partName))) return;
            const key = (pl.carModel || '') + '||' + (pl.partName || '');
            if (!map[key]) map[key] = { key, carModel: pl.carModel || '', partName: pl.partName || '', plans: [], qty: 0 };
            map[key].plans.push(pl);
            map[key].qty += _num(pl.planQty);
        });
        return Object.values(map).sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko'));
    }

    function _renderOrphanBanner() {
        const el = document.getElementById('sdpOrphanBanner');
        if (!el) return;
        const groups = _orphanPlanGroups();
        if (!groups.length) { el.innerHTML = ''; return; }
        const count = groups.reduce((acc, g) => acc + g.plans.length, 0);
        el.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
                        margin-bottom:12px;padding:10px 14px;border-radius:8px;
                        background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.25);">
                <span style="font-size:0.85rem;color:var(--text-primary);">
                    <span class="material-symbols-outlined" style="font-size:17px;vertical-align:-3px;color:var(--accent-red);">warning</span>
                    제품 기초정보에 없는 납품계획 <strong style="color:var(--accent-red);">${groups.length}품목 · ${_fmt(count)}건</strong>
                    <span style="color:var(--text-muted);font-size:0.78rem;">(과거 엑셀 파싱 잔재)</span>
                </span>
                <button class="btn btn-sm btn-outline" onclick="SalesDeliveryPlanModule.openOrphanPlanModal()">
                    <span class="material-symbols-outlined" style="font-size:16px;">cleaning_services</span> 확인·정리
                </button>
            </div>`;
    }

    function openOrphanPlanModal() {
        const groups = _orphanPlanGroups();
        if (!groups.length) { UIUtils.toast('정리할 납품계획이 없습니다.', 'info'); _renderOrphanBanner(); return; }
        const count = groups.reduce((acc, g) => acc + g.plans.length, 0);
        const rows = groups.map(g => `
            <tr>
                <td style="color:var(--accent-red);font-weight:700;white-space:nowrap;">${_esc(g.carModel || '-')}</td>
                <td>${_esc(g.partName || '-')}</td>
                <td style="text-align:right;white-space:nowrap;">${_fmt(g.plans.length)}</td>
                <td style="text-align:right;white-space:nowrap;">${_fmt(g.qty)}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-danger" onclick="SalesDeliveryPlanModule.deleteOrphanPlanGroup('${_js(encodeURIComponent(g.key))}')">삭제</button>
                </td>
            </tr>`).join('');
        UIUtils.showModal('제품 기초정보에 없는 납품계획', `
            <div style="padding:10px 14px;background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.2);border-radius:8px;margin-bottom:12px;font-size:0.84rem;line-height:1.55;">
                제품 마스터(차종+품명)에 없는 계획입니다. 과거 엑셀 파싱 때 차종명이 잘못 들어간 데이터로, 삭제해도 정상 계획에는 영향이 없습니다.
            </div>
            <div class="data-table-wrapper" style="max-height:420px;overflow-y:auto;">
                <table class="data-table">
                    <thead><tr><th>차종</th><th>품명</th><th style="text-align:right;">계획 건수</th><th style="text-align:right;">수량(EA)</th><th style="text-align:center;width:80px;">작업</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-danger" onclick="SalesDeliveryPlanModule.deleteOrphanPlans()">전체 삭제 (${groups.length}품목 · ${_fmt(count)}건)</button>
        `, 'lg');
    }

    async function _removeOrphanPlans(groups) {
        let removed = 0, failed = 0;
        for (const g of groups) {
            for (const pl of g.plans) {
                try {
                    await Storage.remove(STORE, pl.id);
                    removed++;
                } catch (e) {
                    failed++;
                    console.error('[SalesDeliveryPlan] 고아 계획 삭제 실패:', pl.id, e);
                }
            }
        }
        UIUtils.toast(
            `납품계획 정리 완료: ${_fmt(removed)}건 삭제${failed ? ` · ${failed}건 실패(권한 확인)` : ''}`,
            failed ? 'warning' : (removed > 0 ? 'success' : 'info'));
        await search();
        if (_orphanPlanGroups().length) openOrphanPlanModal();
    }

    function deleteOrphanPlans() {
        const groups = _orphanPlanGroups();
        if (!groups.length) { UIUtils.toast('삭제할 납품계획이 없습니다.', 'info'); return; }
        const count = groups.reduce((acc, g) => acc + g.plans.length, 0);
        UIUtils.confirm(
            `제품 기초정보에 없는 납품계획 ${groups.length}품목 · ${count}건을 모두 삭제합니다. 되돌릴 수 없습니다.`,
            () => _removeOrphanPlans(groups)
        );
    }

    function deleteOrphanPlanGroup(encodedKey) {
        const key = decodeURIComponent(encodedKey || '');
        const g = _orphanPlanGroups().find(x => x.key === key);
        if (!g) { UIUtils.toast('해당 계획을 찾지 못했습니다.', 'warning'); return; }
        UIUtils.confirm(
            `"${g.carModel} / ${g.partName}" 납품계획 ${g.plans.length}건(${_fmt(g.qty)} EA)을 삭제합니다.`,
            () => _removeOrphanPlans([g])
        );
    }

    function shiftMainDateRange(offset) {
        const startEl = document.getElementById('sdpStart');
        const endEl = document.getElementById('sdpEnd');
        if (!startEl || !endEl) return;
        startEl.value = _addDays(startEl.value || UIUtils.today(), offset);
        endEl.value = _addDays(endEl.value || startEl.value, offset);
        search();
    }

    function jumpMainDateToday() {
        const startEl = document.getElementById('sdpStart');
        const endEl = document.getElementById('sdpEnd');
        if (!startEl || !endEl) return;
        const start = startEl.value || UIUtils.today();
        const end = endEl.value || _addDays(start, 30);
        const span = Math.max(0, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000));
        startEl.value = UIUtils.today();
        endEl.value = _addDays(startEl.value, span);
        search();
    }

    function setTableDensity(value) {
        const density = value === 'compact' ? 'compact' : 'standard';
        const wrap = document.getElementById('sdpTableWrap');
        const select = document.getElementById('sdpDensity');
        if (wrap) wrap.classList.toggle('sdp-density-compact', density === 'compact');
        if (select && select.value !== density) select.value = density;
        localStorage.setItem('sdp_table_density', density);
    }

    /** 계획·납품 실적이 전혀 없는(=totalPlan, delivered 모두 0) 행 — 숨기기 체크 시 제외 대상 */
    function _visibleRows(rows) {
        const hideNoPlan = !!document.getElementById('sdpHideNoPlan')?.checked;
        if (!hideNoPlan) return rows;
        return rows.filter(r => r.totalPlan > 0 || r.delivered > 0);
    }

    /** "계획 없는 품목 숨기기" 체크 토글 — 이미 불러온 _lastRows를 다시 조회하지 않고 필터만 다시 적용 */
    function toggleHideNoPlan() {
        _renderTable(_visibleRows(_lastRows), _lastDays);
    }

    /**
     * 양산품이 하나라도 등록된 차종만 남긴다.
     *
     * 납품계획 등록은 양산품 대상 업무라, A/S 전용 차종까지 차종 목록에 올라오면
     * 고를 일 없는 항목만 늘어난다(사용자 요청: "양산 품목만 나오면 됨").
     * 판정 기준은 제품 마스터의 itemType — 이 화면의 다른 곳들과 같은 기준을 쓴다.
     */
    function _massProductionCars(cars) {
        const allow = new Set();
        _products().forEach(p => {
            if ((p.itemType || '') !== '양산품') return;
            const car = String(p.carModel || '').trim();
            if (car) allow.add(_carKey(car));
        });
        if (!allow.size) return cars;   // 마스터에 양산품 표시가 없으면 거르지 않는다
        return (cars || []).filter(c => allow.has(_carKey(c)));
    }

    /** 제품 마스터의 "양산품" 전체 — 계획 유무와 무관하게 목록에 항상 나올 후보. */
    function _productionProducts(customer, car) {
        return _products().filter(p => {
            if ((p.itemType || '') !== '양산품') return false;
            if (!(p.partName || p.name)) return false;
            if (customer && _norm(_customerOf(p)) !== customer) return false;
            if (car && _carKey(p.carModel) !== car.replace(/\s+/g, '')) return false;
            return true;
        });
    }

    async function getPlanningMaterialRows(start, end) {
        await SalesParseLog.load();
        const rangeStart = start || UIUtils.today();
        const rangeEnd = end || _addDays(rangeStart, 30);
        const plans = Storage.getByDateRange(STORE, rangeStart, rangeEnd)
            .filter(p => _dateInRange(p.date, rangeStart, rangeEnd));
        return _buildRows(plans, _days(rangeStart, rangeEnd), rangeStart, rangeEnd);
    }

    function _buildRows(plans, days, start, end, seedProducts) {
        plans = (plans || []).filter(plan => _dateInRange(plan.date, start, end));
        const deliveries = Storage.getByDateRange(DB.STORES.SALES_DELIVERY, start, end)
            .filter(d => _dateInRange(d.date, start, end));
        const map = {};

        // 계획이 없어도 목록에 보여야 하는 양산품을 먼저 빈 행으로 깔아둔다.
        // 아래 plans.forEach가 같은 key로 만나면 이 빈 행 위에 계획이 그대로 합쳐진다.
        (seedProducts || []).forEach(product => {
            const rowCustomer = _customerOf(product) || '';
            const rowCarModel = product.carModel || '';
            const rowPartName = product.partName || product.name || '';
            const rowColor = product.color || product.paintColor || '';
            const rowPackUnit = _packUnitFromProduct(product, '');
            const key = [product.id || '', rowCustomer, rowCarModel, rowPartName, rowColor, rowPackUnit].join('||');
            if (map[key]) return;
            map[key] = {
                key,
                ids: [],
                productId: product.id || '',
                customer: rowCustomer,
                carModel: rowCarModel,
                partName: rowPartName,
                color: rowColor,
                packUnit: rowPackUnit,
                product,
                processEnd: _endProcess(product),
                planByDate: {},
                planIdsByDate: {},
                deliveryByDate: {},
                totalPlan: 0,
                delivered: 0
            };
        });

        plans.forEach(plan => {
            const product = _findProduct(plan);
            // 제품이 정상적으로 매칭되면 마스터의 납품처를 우선한다. plan.customer는 신뢰할 수
            // 없는 경우가 실제로 있었다(예: "6/30"·"8/28" 같은 날짜 문자열이 그대로 들어간 계획
            // 804건/2610건 — 아마 엑셀 업로드 시 날짜 열을 납품처 열로 잘못 매핑한 것으로 보임).
            // plan.customer를 우선하면 같은 제품이 오염된 값마다 별도 행으로 쪼개져 "중복"으로
            // 보였다. 제품이 안 잡히는(고아) 계획일 때만 plan.customer로 폴백한다.
            const rowCustomer = (product && _customerOf(product)) || plan.customer || '';
            const rowCarModel = product?.carModel || plan.carModel || '';
            const rowPartName = product?.partName || plan.partName || '';
            const rowColor = plan.color || product?.color || '';
            const rowPackUnit = _packUnitFromProduct(product, plan.packUnit);
            const key = [
                product?.id || plan.productId || '',
                rowCustomer,
                rowCarModel,
                rowPartName,
                rowColor,
                rowPackUnit
            ].join('||');
            if (!map[key]) {
                map[key] = {
                    key,
                    ids: [],
                    productId: product?.id || plan.productId || '',
                    customer: rowCustomer,
                    carModel: rowCarModel,
                    partName: rowPartName,
                    color: rowColor,
                    packUnit: rowPackUnit,
                    product,
                    processEnd: _endProcess(product),
                    planByDate: {},
                    planIdsByDate: {},
                    deliveryByDate: {},
                    totalPlan: 0,
                    delivered: 0
                };
            }
            const row = map[key];
            row.ids.push(plan.id);
            row.totalPlan += _num(plan.planQty);
            const planDate = String(plan.date || '').slice(0, 10);
            row.planByDate[planDate] = (row.planByDate[planDate] || 0) + _num(plan.planQty);
            if (!row.planIdsByDate[planDate]) row.planIdsByDate[planDate] = [];
            row.planIdsByDate[planDate].push(plan.id);
        });

        Object.values(map).forEach(row => {
            deliveries.filter(d => _matches(d, row)).forEach(d => {
                const qty = _num(d.qty ?? d.quantity);
                row.delivered += qty;
                const deliveryDate = String(d.date || '').slice(0, 10);
                row.deliveryByDate[deliveryDate] = (row.deliveryByDate[deliveryDate] || 0) + qty;
            });

            row.remaining = Math.max(0, row.totalPlan - row.delivered);
            const injection = _stockSummary(DB.STORES.INJECTION_INVENTORY, row);
            const finished = _stockSummary(DB.STORES.PRODUCT_INVENTORY, row);
            row.injectionStock = injection.balance;
            row.injectionHasData = injection.hasData;
            row.finishedStock = finished.balance;
            row.finishedHasData = finished.hasData;
            row.shippingStandby = _shippingStandbyQty(row);
            row.laserStandby = _isLaserEnd(row) ? _laserStandbyQty(row) : 0;

            const finishedAvailable = row.finishedStock + row.shippingStandby;
            row.injectionShortage = row.injectionHasData ? Math.max(0, row.remaining - row.injectionStock) : 0;
            row.paintShortage = _isPaintEnd(row) ? Math.max(0, row.remaining - finishedAvailable) : 0;
            row.laserShortage = _isLaserEnd(row)
                ? Math.max(0, row.remaining - finishedAvailable - row.laserStandby)
                : 0;
            row.hasShortage = (row.injectionShortage + row.paintShortage + row.laserShortage) > 0;
        });

        const rows = Object.values(map);
        // 계획만 있고 제품이 안 잡힌 행도 productId로 마스터를 찾아 순번을 쓰게 한다 —
        // 안 그러면 등록 화면에서 정한 순서와 달리 맨 뒤로 밀린다.
        rows.forEach(row => {
            if (!row.product && row.productId) {
                row.product = _products().find(p => p.id === row.productId) || null;
            }
        });
        const carOrder = new Map();
        rows.forEach(row => {
            const carKey = _carKey(row.carModel);
            if (!carKey) return;
            const order = Math.min(_deliverySortOrderOf(row.product), SalesParseLog.orderIndex(row.carModel, row.partName));
            if (order === Number.MAX_SAFE_INTEGER) return;
            carOrder.set(carKey, Math.min(carOrder.get(carKey) ?? Number.MAX_SAFE_INTEGER, order));
        });

        // 차종 묶음 순서를 먼저 적용해 같은 차종 품목이 흩어지지 않게 한다. 같은 차종 안에서는
        // 사용자가 직접 지정한 순번(product.deliverySortOrder)을 우선하고, 없으면 예전 엑셀 파싱
        // 순서, 그래도 없으면 가나다 순으로 정렬한다.
        return rows.sort((a, b) => {
            const ca = carOrder.get(_carKey(a.carModel)) ?? Number.MAX_SAFE_INTEGER;
            const cb = carOrder.get(_carKey(b.carModel)) ?? Number.MAX_SAFE_INTEGER;
            if (ca !== cb) return ca - cb;
            if (a.carModel !== b.carModel) return a.carModel.localeCompare(b.carModel, 'ko');
            const da = _deliverySortOrderOf(a.product);
            const db = _deliverySortOrderOf(b.product);
            if (da !== db) return da - db;
            const oa = SalesParseLog.orderIndex(a.carModel, a.partName);
            const ob = SalesParseLog.orderIndex(b.carModel, b.partName);
            if (oa !== ob) return oa - ob;
            return a.partName.localeCompare(b.partName, 'ko') ||
                a.customer.localeCompare(b.customer, 'ko');
        });
    }

    /** 사용자가 직접 지정한 납품계획 정렬 순번(product.deliverySortOrder) — 없으면 맨 뒤로 민다. */
    function _deliverySortOrderOf(product) {
        if (!product || product.deliverySortOrder == null || product.deliverySortOrder === '') return Number.MAX_SAFE_INTEGER;
        const n = Number(product.deliverySortOrder);
        return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    }

    function _renderStats(rows) {
        const totalPlan = rows.reduce((s, r) => s + r.totalPlan, 0);
        const delivered = rows.reduce((s, r) => s + r.delivered, 0);
        const remaining = rows.reduce((s, r) => s + r.remaining, 0);
        const shortageCount = rows.filter(r => r.hasShortage).length;
        document.getElementById('sdpStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${_fmt(totalPlan)}</div>
                <div class="stat-card-label">계획 수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${_fmt(delivered)}</div>
                <div class="stat-card-label">납품 수량</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${_fmt(remaining)}</div>
                <div class="stat-card-label">미납 수량</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${_fmt(shortageCount)}</div>
                <div class="stat-card-label">부족 품목</div>
            </div>
        `;
    }

    function _shortageCell(value, showDash = false) {
        if (showDash) return '<span style="color:var(--text-muted);">-</span>';
        const color = value > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        return `<span style="font-weight:800;color:${color};">${value > 0 ? '-' : ''}${_fmt(value)}</span>`;
    }

    function _stockNeedCell(current, need, showDash = false) {
        if (showDash) return '<span style="color:var(--text-muted);">-</span>';
        const needColor = need > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        const needText = need > 0 ? `-${_fmt(need)}` : _fmt(need);
        return `
            <div class="sdp-stock-need-cell">
                <span class="sdp-stock-current">${_fmt(current)}</span>
                <span class="sdp-stock-separator">/</span>
                <span class="sdp-stock-need" style="color:${needColor};">${needText}</span>
            </div>
        `;
    }

    function _shortageQty(row) {
        return _num(row?.injectionShortage) + _num(row?.paintShortage) + _num(row?.laserShortage);
    }

    function _statusInfo(row) {
        if (!row || row.remaining <= 0) return { key: 'complete', label: '완료' };
        if (row.injectionShortage > 0) return { key: 'injection-short', label: '사출 소재 부족' };
        if (row.finishedStock >= row.remaining && row.finishedStock > 0) return { key: 'available', label: '출고 가능' };
        if (row.laserStandby > 0 || row.shippingStandby > 0) return { key: 'postprocess', label: '후공정 대기' };
        if (_isPaintEnd(row)) return { key: 'paint-needed', label: '도장 필요' };
        return { key: 'waiting', label: '생산 대기' };
    }

    function _coverageInfo(row, days) {
        if (!row?.finishedHasData) return { text: '재고 없음', key: 'none', until: '' };
        let available = Math.max(0, _num(row.finishedStock));
        if (available <= 0) return { text: '재고 없음', key: 'none', until: '' };

        let lastCoveredDate = '';
        let hasPlan = false;
        for (const day of days) {
            const required = Math.max(0, _num(row.planByDate?.[day]) - _num(row.deliveryByDate?.[day]));
            if (required <= 0) continue;
            hasPlan = true;
            if (available < required) {
                return lastCoveredDate
                    ? { text: `${lastCoveredDate.slice(5).replace('-', '/')}까지`, key: 'partial', until: lastCoveredDate }
                    : { text: '당일 부족', key: 'short', until: '' };
            }
            available -= required;
            lastCoveredDate = day;
        }
        if (!hasPlan) return { text: '계획 없음', key: 'none', until: '' };
        return { text: `${lastCoveredDate.slice(5).replace('-', '/')}까지`, key: 'full', until: lastCoveredDate };
    }

    function _finishedStockCell(row, days) {
        if (!row.finishedHasData) return '<td class="sdp-finished-stock"><div>-</div><div class="sdp-coverage sdp-coverage-none">재고 없음</div></td>';
        const coverage = _coverageInfo(row, days);
        const title = `현재 완제품 재고 ${_fmt(row.finishedStock)}개 기준 납품 가능일`;
        return `<td class="sdp-finished-stock" title="${title}">
            <div class="sdp-finished-qty">${_fmt(row.finishedStock)}</div>
            <div class="sdp-coverage sdp-coverage-${coverage.key}">${coverage.text}</div>
        </td>`;
    }

    function _dayCell(row, day, isMonthStart = false) {
        const plan = row.planByDate[day] || 0;
        const delivered = row.deliveryByDate[day] || 0;
        const info = _dayColumnInfo(day);
        const colW = `${_dayColumnWidth(day)}px`;
        const borderStyle = isMonthStart ? 'border-left:2px solid #64748b;' : '';
        const coveredUntil = row.finishedCoverage?.until || '';
        const isStockCovered = !!coveredUntil && day >= UIUtils.today() && day <= coveredUntil;
        const coverageClass = isStockCovered ? 'sdp-stock-covered' : '';
        const isDone = plan > 0 && delivered >= plan;   // 계획 수량을 모두 납품
        const doneClass = isDone ? 'sdp-plan-done' : '';
        return `
            <td onclick="SalesDeliveryPlanModule.handleDayCellClick(event,'${_js(row.key)}','${day}')"
                draggable="${plan > 0 ? 'true' : 'false'}"
                ondragstart="SalesDeliveryPlanModule.startPlanDrag(event,'${_js(row.key)}','${day}')"
                ondragover="SalesDeliveryPlanModule.overPlanDrop(event,'${_js(row.key)}','${day}')"
                ondragleave="SalesDeliveryPlanModule.leavePlanDrop(event)"
                ondrop="SalesDeliveryPlanModule.dropPlan(event,'${_js(row.key)}','${day}')"
                ondragend="SalesDeliveryPlanModule.endPlanDrag(event)"
                title="${isStockCovered ? '현재 완제품 재고로 납품 가능한 구간' : '클릭해서 납품 계획 수량 입력 / 드래그해서 같은 품목 날짜로 이동'}"
                class="${info.className} sdp-plan-day-cell ${coverageClass} ${doneClass} ${plan > 0 ? 'sdp-plan-draggable' : ''}"
                style="min-width:${colW};max-width:${colW};text-align:center;font-size:10px;cursor:pointer;padding:3px 1px;${borderStyle}">
                ${plan ? `<div style="font-weight:${isDone ? 600 : 400};">${_fmt(plan)}</div>` : ''}
                ${isDone
                    ? `<div class="sdp-done-badge"><span class="material-symbols-outlined">check_circle</span>납품완료</div>`
                    : (delivered
                        ? `<div style="color:var(--accent-green);font-weight:600;">납 ${_fmt(delivered)}</div>` +
                          (plan > 0 ? `<div class="sdp-progress" title="납품 ${_fmt(delivered)} / 계획 ${_fmt(plan)}"><span style="width:${Math.min(100, Math.round(delivered / plan * 100))}%;"></span></div>` : '')
                        : '')}
            </td>
        `;
    }

    function handleDayCellClick(event, rowKey, date) {
        if (Date.now() < _dragSuppressClickUntil) {
            event?.preventDefault();
            event?.stopPropagation();
            return;
        }
        openCellModal(rowKey, date);
    }

    function startPlanDrag(event, rowKey, date) {
        const row = _lastRows.find(r => r.key === rowKey);
        const qty = row ? _planQtyForCell(row, date) : 0;
        if (!row || qty <= 0) {
            event.preventDefault();
            return;
        }
        _dragPlan = { rowKey, date, qty };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', JSON.stringify(_dragPlan));
        event.currentTarget.classList.add('sdp-plan-dragging');
    }

    function overPlanDrop(event, rowKey, date) {
        if (!_dragPlan || _dragPlan.rowKey !== rowKey || _dragPlan.date === date) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.classList.add('sdp-plan-drop-target');
    }

    function leavePlanDrop(event) {
        event.currentTarget.classList.remove('sdp-plan-drop-target');
    }

    async function dropPlan(event, rowKey, targetDate) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('sdp-plan-drop-target');
        _dragSuppressClickUntil = Date.now() + 500;

        const drag = _dragPlan || (() => {
            try { return JSON.parse(event.dataTransfer.getData('text/plain') || '{}'); }
            catch (error) { return null; }
        })();

        if (!drag || drag.rowKey !== rowKey || drag.date === targetDate) {
            _dragPlan = null;
            return;
        }

        const row = _lastRows.find(r => r.key === rowKey);
        if (!row) {
            _dragPlan = null;
            return;
        }

        const sourceQty = _planQtyForCell(row, drag.date);
        if (sourceQty <= 0) {
            _dragPlan = null;
            return;
        }

        const targetQty = _planQtyForCell(row, targetDate);
        await _upsertPlanCell(row, targetDate, targetQty + sourceQty);
        await _upsertPlanCell(row, drag.date, 0);
        _dragPlan = null;
        UIUtils.toast('납품 계획 수량을 이동했습니다.', 'success');
        search();
    }

    function endPlanDrag(event) {
        event?.currentTarget?.classList.remove('sdp-plan-dragging');
        document.querySelectorAll('.sdp-plan-drop-target').forEach(el => el.classList.remove('sdp-plan-drop-target'));
        _dragSuppressClickUntil = Date.now() + 300;
        _dragPlan = null;
    }

    function _monthHeaderCells(days) {
        const groups = [];
        days.forEach(day => {
            const month = `${Number(day.slice(5, 7))}월`;
            const last = groups[groups.length - 1];
            if (last && last.month === month) last.count += 1;
            else groups.push({ month, count: 1, startDate: day });
        });
        return groups.map(g => `<th colspan="${g.count}" class="sdp-month-header" onmousedown="SalesDeliveryPlanModule.startDateHeaderScroll(event)" style="text-align:center;cursor:grab;">${g.month}</th>`).join('');
    }

    function _renderTable(rows, days) {
        const wrap = document.getElementById('sdpTableWrap');
        if (!rows.length) {
            wrap.innerHTML = `<div style="padding:46px;text-align:center;color:var(--text-muted);">등록된 납품 계획이 없습니다.</div>`;
            return;
        }
        const dayColumnsWidth = days.reduce((sum, day) => sum + _dayColumnWidth(day), 0);
        rows.forEach(row => { row.finishedCoverage = _coverageInfo(row, days); });
        const colgroup = `
            <colgroup>
                <col style="width:48px;">
                <col style="width:180px;">
                <col style="width:44px;">
                <col style="width:36px;">
                <col style="width:88px;">
                <col style="width:54px;">
                ${days.map(day => `<col style="width:${_dayColumnWidth(day)}px;">`).join('')}
            </colgroup>
        `;

        wrap.innerHTML = `
            <style>.sdp-status-table th,.sdp-status-table td{padding:3px 5px!important;}</style>
            <table class="data-table sdp-status-table" style="min-width:${450 + dayColumnsWidth}px;font-size:10px;">
                ${colgroup}
                <thead>
                    <tr>
                        <th colspan="6" style="padding:2px 4px!important;"></th>
                        ${_monthHeaderCells(days)}
                    </tr>
                    <tr>
                        <th>차종</th>
                        <th>품명</th>
                        <th>컬러</th>
                        <th>포장</th>
                        <th>계획<br><span style="font-size:9px;font-weight:600;">(납품/미납)</span></th>
                        <th>완제품<br>재고·가능</th>
                        ${days.map((d, i) => {
                            const info = _dayColumnInfo(d);
                            const colW = `${_dayColumnWidth(d)}px`;
                            const isMonthStart = i > 0 && d.slice(0, 7) !== days[i - 1].slice(0, 7);
                            const borderStyle = isMonthStart ? 'border-left:2px solid #64748b;' : '';
                            return `<th data-sdp-date="${d}" class="${info.className}" onmousedown="SalesDeliveryPlanModule.startDateHeaderScroll(event)" style="min-width:${colW};max-width:${colW};text-align:center;padding:4px 1px;${borderStyle}">
                                <button type="button" class="sdp-date-jump" onclick="SalesDeliveryPlanModule.scrollToDate(event,'${d}')" aria-label="${d} 날짜로 이동" title="이 날짜로 가로 이동">
                                    <div>${Number(d.slice(8))}</div><div class="sdp-date-weekday">${info.weekday}</div>
                                </button>
                            </th>`;
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, index) => {
                        const prev = rows[index - 1];
                        const startsCarGroup = index > 0 && _carKey(prev?.carModel) !== _carKey(row.carModel);
                        const status = _statusInfo(row);
                        return `
                        <tr class="${startsCarGroup ? 'sdp-car-group-start ' : ''}sdp-state-${status.key}">
                            <td>${_esc(row.carModel || '-')}</td>
                            <td style="font-weight:800;">
                                ${_esc(row.partName || '-')}
                                ${status.key === 'available' ? '' : `<span class="sdp-status-badge sdp-status-${status.key}" title="${_esc(status.label)}">${_esc(status.label)}</span>`}
                            </td>
                            <td>${_esc(row.color || '-')}</td>
                            <td>${_esc(row.packUnit || '-')}</td>
                            <td class="sdp-plan-summary">
                                <div class="sdp-plan-main">${_fmt(row.totalPlan)}</div>
                                <div class="sdp-plan-sub">
                                    <span class="sdp-plan-delivered">${_fmt(row.delivered)}</span>
                                    <span style="color:var(--text-muted);"> / </span>
                                    <span class="sdp-plan-remaining ${row.remaining > 0 ? 'sdp-unpaid' : 'sdp-paid'}">${_fmt(row.remaining)}</span>
                                </div>
                                ${row.hasShortage ? `<div class="sdp-plan-shortage">부족 ${_fmt(_shortageQty(row))}</div>` : ''}
                            </td>
                            ${_finishedStockCell(row, days)}
                            ${days.map((d, i) => _dayCell(row, d, i > 0 && d.slice(0, 7) !== days[i - 1].slice(0, 7))).join('')}
                        </tr>
                    `; }).join('')}
                </tbody>
            </table>
        `;
    }

    // 날짜/월 헤더를 왼쪽 버튼으로 누른 채 움직이면 표의 가로 스크롤을 직접 조작한다.
    function startDateHeaderScroll(event) {
        if (!event || event.button !== 0) return;
        const wrap = document.getElementById('sdpTableWrap');
        if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return;

        _dateHeaderDrag = {
            wrap,
            startX: event.clientX,
            startScrollLeft: wrap.scrollLeft,
            moved: false
        };
        document.body.classList.add('sdp-date-header-dragging');

        const move = e => {
            if (!_dateHeaderDrag) return;
            const distance = e.clientX - _dateHeaderDrag.startX;
            if (!distance) return;
            if (Math.abs(distance) > 3) _dateHeaderDrag.moved = true;
            _dateHeaderDrag.wrap.scrollLeft = _dateHeaderDrag.startScrollLeft - distance;
            if (_dateHeaderDrag.moved) e.preventDefault();
        };
        const end = () => {
            if (!_dateHeaderDrag) return;
            if (_dateHeaderDrag.moved) _dragSuppressClickUntil = Date.now() + 350;
            _dateHeaderDrag = null;
            document.body.classList.remove('sdp-date-header-dragging');
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
    }

    // 날짜 헤더를 누르면 고정 품목 영역 바로 오른쪽에 해당 날짜가 오도록 이동한다.
    // 날짜 열이 긴 경우에도 브라우저 기본 scrollIntoView가 세로 위치를 바꾸지 않도록
    // 표 wrapper의 가로 스크롤만 직접 조정한다.
    function scrollToDate(event, date) {
        event?.preventDefault();
        event?.stopPropagation();
        if (Date.now() < _dragSuppressClickUntil) return;
        const wrap = document.getElementById('sdpTableWrap');
        const head = wrap?.querySelector(`th[data-sdp-date="${date}"]`);
        if (!wrap || !head) return;

        const fixedColumnsWidth = 450;
        const targetLeft = Math.max(0, head.offsetLeft - fixedColumnsWidth + 4);
        wrap.scrollTo({ left: targetLeft, behavior: 'smooth' });

        wrap.querySelectorAll('.sdp-date-jump-active').forEach(el => el.classList.remove('sdp-date-jump-active'));
        head.classList.add('sdp-date-jump-active');
        window.clearTimeout(wrap._sdpDateJumpTimer);
        wrap._sdpDateJumpTimer = window.setTimeout(() => head.classList.remove('sdp-date-jump-active'), 900);
    }

    function _formHtml(data = {}) {
        return `
            ${_buildDatalists()}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품계획일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="sdpDate" value="${_esc(data.date || UIUtils.today())}">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input class="form-input" id="sdpCustomer" list="sdpCustomerList" value="${_esc(data.customer || '')}" placeholder="납품처">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input class="form-input" id="sdpCarModel" list="sdpCarList" value="${_esc(data.carModel || '')}" placeholder="차종" oninput="SalesDeliveryPlanModule.fillFromProduct()">
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="sdpPartName" list="sdpPartList" value="${_esc(data.partName || '')}" placeholder="품명" oninput="SalesDeliveryPlanModule.fillFromProduct()">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input class="form-input" id="sdpColor" list="sdpColorList" value="${_esc(data.color || '')}" placeholder="컬러">
                </div>
                <div class="form-group">
                    <label class="form-label">포장단위</label>
                    <input class="form-input" id="sdpPackUnit" value="${_esc(data.packUnit || '')}" placeholder="예: 1,000">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">계획수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="sdpPlanQty" min="1" value="${_esc(data.planQty || '')}" placeholder="">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input class="form-input" id="sdpNote" value="${_esc(data.note || '')}" placeholder="특이사항">
                </div>
            </div>
        `;
    }

    function fillFromProduct() {
        const item = {
            carModel: document.getElementById('sdpCarModel')?.value || '',
            partName: document.getElementById('sdpPartName')?.value || '',
            color: document.getElementById('sdpColor')?.value || ''
        };
        const product = _findProduct(item);
        if (!product) return;
        const customerEl = document.getElementById('sdpCustomer');
        const colorEl = document.getElementById('sdpColor');
        const packEl = document.getElementById('sdpPackUnit');
        if (customerEl && !customerEl.value) customerEl.value = _customerOf(product);
        if (colorEl && !colorEl.value) colorEl.value = product.color || '';
        if (packEl && !packEl.value) packEl.value = _packUnitFromProduct(product, '');
    }

    function _readForm() {
        const data = {
            date: document.getElementById('sdpDate')?.value || '',
            customer: document.getElementById('sdpCustomer')?.value.trim() || '',
            carModel: document.getElementById('sdpCarModel')?.value.trim() || '',
            partName: document.getElementById('sdpPartName')?.value.trim() || '',
            color: document.getElementById('sdpColor')?.value.trim() || '',
            packUnit: document.getElementById('sdpPackUnit')?.value.trim() || '',
            planQty: _num(document.getElementById('sdpPlanQty')?.value),
            note: document.getElementById('sdpNote')?.value.trim() || ''
        };
        const product = _findProduct(data);
        if (!product) return data;
        return {
            ...data,
            productId: product.id || '',
            customer: data.customer || _customerOf(product),
            carModel: product.carModel || data.carModel,
            partName: product.partName || data.partName,
            color: data.color || product.color || '',
            packUnit: _packUnitFromProduct(product, data.packUnit)
        };
    }

    function _validate(data) {
        if (!data.date) return '납품계획일을 입력하세요.';
        if (!data.partName) return '품명을 입력하세요.';
        if (data.planQty <= 0) return '계획수량을 입력하세요.';
        return '';
    }

    function _gridEditorHtml() {
        const products = _products();
        const customers = products.map(_customerOf); // 제품 마스터만 — 오염된 계획/납품 값 제외
        const start = document.getElementById('sdpStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpEnd')?.value || _addDays(start, 30);

        return `
            <div style="padding:6px 8px;border:1px solid var(--border-color);background:#fff;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">
                납품처와 차종을 선택한 뒤, 날짜 칸을 클릭해서 수량을 입력하세요. 기존 계획이 있는 칸은 수량이 표시되며, 빈칸으로 저장하면 해당 계획은 삭제됩니다.<br>
                <strong style="color:var(--accent-red);">저장하면 이 차종·이 기간의 계획은 아래 표 내용으로 덮어쓰기됩니다</strong> — 표에 없거나 비운 칸은 0이 됩니다.<br>
                엑셀에서 셀(행/열 여러 개도 가능)을 복사한 뒤 시작할 칸을 클릭하고 붙여넣기(Ctrl+V)하면, 그 칸부터 행·열 그대로 채워집니다.
                맨 왼쪽 위 칸(순번 칸 포함)에 붙여넣으면 첫 행·첫 날짜부터 채워집니다.<br>
                품명 왼쪽의 <strong>⠿</strong> 손잡이를 끌면 품명 순서를 바꿀 수 있고, 놓는 즉시 순번이 저장됩니다.
                순번 칸에 숫자를 적고 <strong>Enter</strong>를 누르면 그 행이 바로 그 위치로 옮겨지고 저장됩니다.
            </div>
            <div class="filter-bar" style="flex-wrap:wrap;gap:6px;margin-bottom:8px;padding:8px;font-size:11px;">
                <div class="form-group">
                    <label class="form-label">시작일</label>
                    <input type="date" class="form-input" id="sdpGridStart" value="${_esc(start)}" onchange="SalesDeliveryPlanModule.requestGridReload()">
                </div>
                <div class="form-group">
                    <label class="form-label">종료일</label>
                    <input type="date" class="form-input" id="sdpGridEnd" value="${_esc(end)}" onchange="SalesDeliveryPlanModule.requestGridReload()">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <select class="form-select" id="sdpGridCustomer" onchange="SalesDeliveryPlanModule.onGridCustomerChange()">
                        ${_selectOptions(customers, '', '-- 납품처 선택 --')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="sdpGridCar" onchange="SalesDeliveryPlanModule.requestGridReload()">
                        ${_selectOptions(_massProductionCars(UIUtils.sortCarModels(products.map(p => p.carModel), products)), '', '-- 차종 선택 --')}
                    </select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.saveGridOrder()" title="맨 왼쪽 '순번' 칸에 입력한 숫자를 저장하고, 그 순서대로 다시 정렬합니다.">
                        <span class="material-symbols-outlined">low_priority</span> 순서 저장
                    </button>
                </div>
            </div>
            <div id="sdpGridEditorBody" class="data-table-wrapper" style="max-height:calc(100vh - 210px);overflow:auto;border:1px solid #94a3b8;border-radius:0;"></div>
        `;
    }

    function _gridInputStyle(qty) {
        return [
            'width:100%',
            'height:19px',
            'border:0',
            'border-radius:0',
            'text-align:right',
            'font-weight:800',
            'font-size:12px',
            'line-height:19px',
            'padding:0 2px',
            'background:transparent;color:var(--text-primary)'
        ].join(';');
    }

    /**
     * 지금 표에 보이는 순서대로 1..N 순번을 매기고, 바뀐 것만 제품 마스터에 저장한다.
     * 화면(_gridRows)의 순서가 곧 순번이라, 드래그로 행을 옮긴 뒤에도 그대로 쓴다.
     * 저장은 비동기지만 화면 숫자는 즉시 맞춘다(_gridRows에 먼저 반영).
     */
    function _assignGridOrderNumbers() {
        const dirty = [];
        _gridRows.forEach((row, index) => {
            const product = row && row.product;
            if (!product || !product.id) return;
            const next = index + 1;
            const prev = product.deliverySortOrder == null || product.deliverySortOrder === ''
                ? null : Number(product.deliverySortOrder);
            if (prev === next) return;
            product.deliverySortOrder = next;
            dirty.push({ id: product.id, order: next });
        });
        if (!dirty.length) return Promise.resolve(0);
        return (async () => {
            for (const d of dirty) {
                try { await Storage.update(DB.STORES.PRODUCTS, d.id, { deliverySortOrder: d.order }); }
                catch (e) { console.warn('[SalesDeliveryPlan] 순번 저장 실패:', e); }
            }
            // 영업 계획 표도 같은 순번(deliverySortOrder)으로 정렬하므로, 저장 직후 뒤에 깔린
            // 표를 다시 그려 등록 화면과 같은 순서로 맞춘다(모달을 그냥 닫아도 반영되게).
            if (document.getElementById('sdpTableWrap')) {
                try { await search(); } catch (e) { console.warn('[SalesDeliveryPlan] 영업 계획 표 갱신 실패:', e); }
            }
            return dirty.length;
        })();
    }

    /** 행 드래그 재정렬 — 드래그 중인 행의 화면 인덱스 */
    let _gridRowDragIndex = null;
    /** 순번 자동 부여·드래그 재정렬이 가능한 상태인지(납품처 전체일 때만) */
    let _gridOrderEditable = true;

    function startGridRowDrag(event, index) {
        if (!_gridOrderEditable) {
            event.preventDefault();
            UIUtils.toast('순서 변경은 납품처를 「전체」로 두고 하세요 — 일부만 보고 옮기면 나머지 순번이 어긋납니다.', 'warning');
            return;
        }
        _gridRowDragIndex = Number(index);
        const tr = event.currentTarget.closest('tr');
        if (tr) tr.classList.add('sdp-row-dragging');
        try {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
            if (tr) event.dataTransfer.setDragImage(tr, 12, 10);
        } catch (e) { /* 일부 브라우저는 setDragImage 미지원 */ }
    }

    function overGridRowDrop(event) {
        if (_gridRowDragIndex == null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const tr = event.currentTarget.closest('tr');
        if (!tr || tr.classList.contains('sdp-row-dragging')) return;
        // 위/아래 어느 쪽에 놓일지 선으로 보여준다 — 안 그러면 어디로 갈지 모른 채 놓게 된다.
        const rect = tr.getBoundingClientRect();
        const below = (event.clientY - rect.top) > rect.height / 2;
        _clearGridRowDropMarks(tr.parentElement);
        tr.classList.add(below ? 'sdp-row-drop-below' : 'sdp-row-drop-above');
    }

    function _clearGridRowDropMarks(tbody) {
        if (!tbody) return;
        tbody.querySelectorAll('.sdp-row-drop-above, .sdp-row-drop-below').forEach(el => {
            el.classList.remove('sdp-row-drop-above', 'sdp-row-drop-below');
        });
    }

    /**
     * 행을 놓은 자리로 옮긴다.
     *
     * 표를 다시 그리지 않고 `<tr>` 요소만 옮긴다 — 아직 저장 안 한 수량 입력값이
     * 날아가면 안 되기 때문이다. 셀의 data-row는 _gridRows의 인덱스를 가리키므로
     * 요소를 옮겨도 매핑은 그대로 유효하다. _gridRows 자체도 같은 순서로 맞춰
     * 순번(1..N)과 다음 렌더링 순서가 화면과 어긋나지 않게 한다.
     */
    async function dropGridRow(event) {
        if (_gridRowDragIndex == null) return;
        event.preventDefault();
        const tr = event.currentTarget.closest('tr');
        const tbody = tr && tr.parentElement;
        if (!tr || !tbody) { endGridRowDrag(event); return; }

        const rect = tr.getBoundingClientRect();
        const below = (event.clientY - rect.top) > rect.height / 2;
        _clearGridRowDropMarks(tbody);

        const dragTr = tbody.querySelector('.sdp-row-dragging');
        if (!dragTr || dragTr === tr) { endGridRowDrag(event); return; }

        // 저장된 순번은 실수로 바뀌면 안 된다 — 놓기 전에 반드시 물어본다.
        const all = Array.from(tbody.children);
        const from = all.indexOf(dragTr);
        let to = all.indexOf(tr) + (below ? 1 : 0);
        if (from < to) to -= 1;
        if (from === to) { endGridRowDrag(event); return; }
        const name = [dragTr.children[2]?.textContent, dragTr.children[3]?.textContent, dragTr.children[4]?.textContent]
            .map(s => String(s || '').trim()).filter(s => s && s !== '-').join(' ');
        if (!confirm(`「${name}」의 순번을 ${from + 1}번 → ${to + 1}번으로 변경할까요?`)) {
            endGridRowDrag(event);
            return;
        }

        tbody.insertBefore(dragTr, below ? tr.nextSibling : tr);

        // 화면(DOM) 순서를 정답으로 삼아 _gridRows를 다시 세운다.
        const trs = Array.from(tbody.children);
        const ordered = trs
            .map(el => {
                const cell = el.querySelector('.sdp-grid-cell, .sdp-order-cell');
                return cell ? _gridRows[Number(cell.dataset.row)] : null;
            })
            .filter(Boolean);

        if (ordered.length === trs.length && ordered.length === _gridRows.length) {
            _gridRows = ordered;
            // ★ data-row는 _gridRows의 "인덱스"다. 위에서 배열을 새로 세웠으므로 같은 숫자가
            //   다른 품목을 가리키게 된다 — 여기서 다시 적어주지 않으면 저장할 때 수량이
            //   엉뚱한 품목에 붙는다(행을 옮긴 뒤 LENS 수량이 COVER 행에 들어가던 사고).
            trs.forEach((el, i) => {
                el.querySelectorAll('.sdp-grid-cell, .sdp-order-cell')
                    .forEach(cell => { cell.dataset.row = String(i); });
            });
        } else {
            // 매핑을 확신할 수 없으면 순서를 건드리지 않는다 — 잘못 저장하느니 안 옮기는 게 낫다.
            console.warn('[SalesDeliveryPlan] 행 순서 재계산 실패 — 순번 저장을 건너뜁니다.');
            endGridRowDrag(event);
            renderGridEditorRows();
            return;
        }

        endGridRowDrag(event);
        _syncGridOrderInputs(tbody);
        const saved = await _assignGridOrderNumbers();
        if (saved) UIUtils.toast('순번을 저장했습니다.', 'success');
    }

    function endGridRowDrag(event) {
        const tbody = event && event.currentTarget && event.currentTarget.closest('tbody');
        _clearGridRowDropMarks(tbody || document.getElementById('sdpGridEditorBody'));
        document.querySelectorAll('.sdp-row-dragging').forEach(el => el.classList.remove('sdp-row-dragging'));
        _gridRowDragIndex = null;
    }

    /** 순번 입력칸을 현재 화면 순서(1..N)로 다시 적는다. */
    function _syncGridOrderInputs(tbody) {
        const body = tbody || document.querySelector('#sdpGridEditorBody tbody');
        if (!body) return;
        Array.from(body.children).forEach((tr, i) => {
            const input = tr.querySelector('.sdp-order-cell');
            if (input) input.value = String(i + 1);
        });
    }

    function renderGridEditorRows() {
        const start = document.getElementById('sdpGridStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpGridEnd')?.value || _addDays(start, 30);
        const customer = document.getElementById('sdpGridCustomer')?.value || '';
        const car = document.getElementById('sdpGridCar')?.value || '';
        const days = _days(start, end);
        const dayInfos = days.map(_dayColumnInfo);
        _gridDays = days;

        const wrap = document.getElementById('sdpGridEditorBody');
        if (!wrap) return;

        // 차종을 고르기 전에는 전체 차종·전체 품목이 한꺼번에 쏟아져 나와 표가 너무 길어진다.
        // 차종별로 등록하는 워크플로우라 차종을 먼저 고르게 하고, 고르기 전엔 빈 목록으로 둔다.
        if (!car) {
            _gridRows = [];
            wrap.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-muted);">차종을 선택하면 목록이 표시됩니다.</div>`;
            return;
        }

        const products = _productsByCustomer(customer)
            .filter(p => p.partName || p.name)
            .filter(p => !car || _norm(p.carModel) === _norm(car))
            // 순번(deliverySortOrder)이 1순위다. 예전에는 납품처·차종이 앞에 있어서, 순번을
            // 바꿔도 다시 그리면 납품처 순으로 되돌아갔다(드래그로 옮겨놓고 '순서 저장'을
            // 누르면 원위치되던 문제). 순번은 사용자가 직접 정한 값이라 무엇보다 우선한다.
            // 순번이 아직 없는 품목만 뒤에서 납품처·품명 순으로 줄을 세운다.
            .sort((a, b) =>
                (_deliverySortOrderOf(a) - _deliverySortOrderOf(b)) ||
                String(a.customer || '').localeCompare(String(b.customer || ''), 'ko') ||
                String(a.carModel || '').localeCompare(String(b.carModel || ''), 'ko') ||
                String(a.partName || a.name || '').localeCompare(String(b.partName || b.name || ''), 'ko')
            );

        _gridRows = products.map(p => _productBase(p, customer));

        // 차종을 고르면 그 차종 안에서 1..N 순번을 바로 매겨 저장한다. 순번이 비어 있으면
        // 매번 가나다 순으로 밀려 사용자가 쓰는 엑셀 시트의 행 순서와 어긋나는데, 화면에
        // '-'만 보이니 왜 어긋나는지도 알 수 없었다. 번호를 눈에 보이게 고정해 둔다.
        //
        // 단, 납품처를 골라 일부만 보고 있을 때는 매기지 않는다. 그 부분집합으로 1..N을
        // 다시 쓰면 화면에 없는 다른 납품처 품목들의 순번까지 뭉개진다.
        _gridOrderEditable = !customer;
        if (_gridOrderEditable) _assignGridOrderNumbers();

        if (!_gridRows.length) {
            wrap.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-muted);">선택 조건에 맞는 제품이 없습니다.</div>`;
            return;
        }

        wrap.innerHTML = `
            <table class="data-table sdp-grid-entry-table" style="min-width:${368 + dayInfos.length * 34}px;font-size:12px;">
                <thead>
                    <tr>
                        <th style="width:36px;" title="차종 안에서의 표시 순서 — 숫자를 입력하고 '순서 저장'을 누르면 저장·재정렬됩니다.">순번</th>
                        <th class="sdp-customer-col" style="width:44px;">납품처</th>
                        <th style="width:48px;">차종</th>
                        <th style="width:132px;">품명</th>
                        <th style="width:48px;">컬러</th>
                        <th style="width:42px;">포장</th>
                        ${dayInfos.map(info => `
                            <th class="${info.className} sdp-grid-date-head" style="width:34px;min-width:34px;max-width:34px;">
                                <span class="sdp-date-month">${info.monthLabel}</span>
                                <span class="sdp-date-day">${info.dayLabel}</span>
                                <span class="sdp-weekday-label">${info.weekday}</span>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${_gridRows.map((row, index) => `
                        <tr class="${index > 0 && _carKey(_gridRows[index - 1]?.carModel) !== _carKey(row.carModel) ? 'sdp-car-group-start' : ''}"
                            ondragover="SalesDeliveryPlanModule.overGridRowDrop(event)"
                            ondrop="SalesDeliveryPlanModule.dropGridRow(event)">
                            <td class="sdp-fixed-col" style="padding:0 1px;">
                                <div style="display:flex;align-items:center;gap:1px;">
                                    <span class="sdp-row-handle" draggable="${_gridOrderEditable ? 'true' : 'false'}"
                                        ondragstart="SalesDeliveryPlanModule.startGridRowDrag(event,${index})"
                                        ondragend="SalesDeliveryPlanModule.endGridRowDrag(event)"
                                        title="${_gridOrderEditable
                                            ? '끌어서 품명 순서를 바꿉니다. 놓으면 순번이 저장됩니다.'
                                            : '순서 변경은 납품처를 「전체」로 두고 하세요.'}"
                                        style="cursor:${_gridOrderEditable ? 'grab' : 'not-allowed'};color:var(--text-muted);font-size:11px;line-height:1;user-select:none;padding:0 1px;">⠿</span>
                                    <input type="number" class="sdp-order-cell" data-row="${index}"
                                        value="${row.product && row.product.deliverySortOrder != null ? _esc(row.product.deliverySortOrder) : ''}"
                                        placeholder="-" onclick="this.select()" onfocus="this.select()"
                                        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                                        onchange="SalesDeliveryPlanModule.moveGridRowToOrder(this)"
                                        onpaste="SalesDeliveryPlanModule.onGridCellPaste(event,this)"
                                        style="width:100%;height:19px;border:0;text-align:center;font-size:12px;background:transparent;">
                                </div>
                            </td>
                            <td class="sdp-fixed-col sdp-customer-col" title="${_esc(row.customer || '-')}">${_esc(row.customer || '-')}</td>
                            <td class="sdp-fixed-col">${_esc(row.carModel || '-')}</td>
                            <td class="sdp-fixed-col">${_esc(row.partName || '-')}</td>
                            <td class="sdp-fixed-col">${_esc(row.color || '-')}</td>
                            <td class="sdp-fixed-col" style="text-align:right;">${_esc(row.packUnit || '-')}</td>
                            ${days.map((day, dayIndex) => {
                                const qty = _planQtyForCell(row, day);
                                const info = dayInfos[dayIndex];
                                return `
                                    <td class="${info.className}" style="text-align:center;width:34px;min-width:34px;max-width:34px;padding:0 1px;">
                                        <input type="number" min="0" class="sdp-grid-cell"
                                            data-row="${index}" data-date="${day}" value="${qty || ''}"
                                            placeholder="" onclick="this.select()" onfocus="this.select()"
                                            onpaste="SalesDeliveryPlanModule.onGridCellPaste(event,this)"
                                            style="${_gridInputStyle(qty)}">
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        _bindGridRangeSelection(wrap);
    }

    // ── 엑셀식 범위 선택 ────────────────────────────────────────────────
    // 수량 칸을 드래그해 사각형 영역을 잡고, Delete(또는 Backspace)로 한 번에 비운다.
    // 계획을 통째로 지울 때 칸을 하나씩 지우는 건 너무 느리다.
    /** {r1,c1,r2,c2} — 앵커와 현재 지점(정규화 전). 선택이 없으면 null */
    let _gridSel = null;
    let _gridSelDragging = false;

    /** 이 칸의 좌표 = (tbody 안 행 위치, 그 행의 수량 칸 중 몇 번째) */
    function _gridCellPos(cell) {
        const tr = cell && cell.closest('tr');
        const tbody = tr && tr.parentElement;
        if (!tr || !tbody) return null;
        const r = Array.prototype.indexOf.call(tbody.children, tr);
        const c = Array.prototype.indexOf.call(tr.querySelectorAll('.sdp-grid-cell'), cell);
        return (r < 0 || c < 0) ? null : { r, c };
    }

    function _gridSelBounds() {
        if (!_gridSel) return null;
        return {
            r1: Math.min(_gridSel.r1, _gridSel.r2), r2: Math.max(_gridSel.r1, _gridSel.r2),
            c1: Math.min(_gridSel.c1, _gridSel.c2), c2: Math.max(_gridSel.c1, _gridSel.c2)
        };
    }

    /** 선택 영역 안의 수량 칸들 */
    function _gridSelCells(wrap) {
        const b = _gridSelBounds();
        const tbody = (wrap || document).querySelector('#sdpGridEditorBody tbody')
            || document.querySelector('#sdpGridEditorBody tbody');
        if (!b || !tbody) return [];
        const out = [];
        for (let r = b.r1; r <= b.r2; r++) {
            const tr = tbody.children[r];
            if (!tr) continue;
            const cells = tr.querySelectorAll('.sdp-grid-cell');
            for (let c = b.c1; c <= b.c2; c++) {
                if (cells[c]) out.push(cells[c]);
            }
        }
        return out;
    }

    function _paintGridSelection(tbody) {
        tbody.querySelectorAll('td.sdp-cell-selected')
            .forEach(td => td.classList.remove('sdp-cell-selected'));
        if (!_gridSel) return;
        _gridSelCells().forEach(cell => {
            const td = cell.closest('td');
            if (td) td.classList.add('sdp-cell-selected');
        });
    }

    function clearGridSelection() {
        _gridSel = null;
        const tbody = document.querySelector('#sdpGridEditorBody tbody');
        if (tbody) _paintGridSelection(tbody);
    }

    /** 선택 영역을 비운다. 화면 값만 바꾸므로 실제 삭제는 「저장」을 눌러야 반영된다. */
    function _clearGridSelectedCells() {
        const cells = _gridSelCells();
        if (!cells.length) return 0;
        cells.forEach(cell => {
            cell.value = '';
            cell.style.cssText = _gridInputStyle(0);
        });
        return cells.length;
    }

    function _bindGridRangeSelection(wrap) {
        const tbody = wrap.querySelector('tbody');
        if (!tbody) return;

        tbody.addEventListener('mousedown', e => {
            const cell = e.target.closest('.sdp-grid-cell');
            if (!cell) { clearGridSelection(); return; }
            const pos = _gridCellPos(cell);
            if (!pos) return;
            // 한 칸만 누른 상태에서는 평소처럼 입력 커서가 들어가야 하므로 preventDefault 안 함.
            _gridSel = { r1: pos.r, c1: pos.c, r2: pos.r, c2: pos.c };
            _gridSelDragging = true;
            _paintGridSelection(tbody);
        });

        tbody.addEventListener('mouseover', e => {
            if (!_gridSelDragging || !_gridSel) return;
            const cell = e.target.closest('.sdp-grid-cell');
            if (!cell) return;
            const pos = _gridCellPos(cell);
            if (!pos) return;
            if (pos.r === _gridSel.r2 && pos.c === _gridSel.c2) return;
            _gridSel.r2 = pos.r;
            _gridSel.c2 = pos.c;
            _paintGridSelection(tbody);
            // 여러 칸을 잡는 중에는 입력 커서가 남아 있으면 헷갈린다 — 포커스를 뗀다.
            if (document.activeElement && document.activeElement.classList.contains('sdp-grid-cell')) {
                document.activeElement.blur();
            }
            if (window.getSelection) { try { window.getSelection().removeAllRanges(); } catch (err) {} }
        });

        _bindGridSelectionGlobals();
    }

    /**
     * mouseup·keydown은 문서 단위로 한 번만 건다.
     *
     * 표를 다시 그릴 때마다 걸면 리스너가 쌓여 Delete 한 번에 여러 번 처리된다.
     * keydown을 tbody에 걸 수도 없다 — 여러 칸을 잡는 순간 입력칸 포커스를 떼기 때문에
     * 그 뒤의 키 입력은 tbody로 오지 않는다(선택해놓고 Del을 눌러도 반응 없음).
     */
    let _gridSelGlobalsBound = false;
    function _bindGridSelectionGlobals() {
        if (_gridSelGlobalsBound) return;
        _gridSelGlobalsBound = true;

        document.addEventListener('mouseup', () => { _gridSelDragging = false; });

        document.addEventListener('keydown', e => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (!document.getElementById('sdpGridEditorBody')) return;
            const b = _gridSelBounds();
            if (!b) return;
            const multi = (b.r2 - b.r1) > 0 || (b.c2 - b.c1) > 0;
            // 한 칸만 선택된 상태면 입력칸 기본 동작(글자 지우기)에 맡긴다.
            if (!multi) return;
            e.preventDefault();
            const n = _clearGridSelectedCells();
            if (n) UIUtils.toast(`${n}칸을 비웠습니다. 「저장」을 눌러야 실제로 삭제됩니다.`, 'info');
        });

        // 표 밖을 클릭하면 선택 해제 — 선택 표시만 남아 헷갈리는 것을 막는다.
        document.addEventListener('mousedown', e => {
            if (!_gridSel) return;
            if (e.target.closest && e.target.closest('#sdpGridEditorBody')) return;
            clearGridSelection();
        });
    }

    /** '순번' 칸에 입력한 값을 제품 마스터(product.deliverySortOrder)에 저장하고,
     *  그 순서대로 다시 그린다. 이 값을 정해두면 이후 화면·엑셀 붙여넣기 모두
     *  사용자가 실제 쓰는 엑셀 시트의 행 순서와 맞춰 정렬된다. */
    /** 표의 수량 칸 중 저장 안 된 편집이 있는지 (지운 칸도 편집이다) */
    function _gridHasUnsavedEdits() {
        const cells = Array.from(document.querySelectorAll('#sdpGridEditorBody .sdp-grid-cell'));
        return cells.some(cell => {
            const row = _gridRows[Number(cell.dataset.row)];
            const date = cell.dataset.date;
            if (!row || !date) return false;
            return _num(cell.value) !== _planQtyForCell(row, date);
        });
    }

    /** 조건(기간·납품처·차종)이 바뀌어 표를 새로 받을 때 — 입력 중이던 값을 말없이 버리지 않는다. */
    function requestGridReload() {
        if (_gridHasUnsavedEdits()
            && !confirm('저장하지 않은 수량 입력이 있습니다. 표를 새로 불러오면 그 입력은 사라집니다. 계속할까요?')) {
            return;
        }
        renderGridEditorRows();
    }

    /**
     * 순번 칸에 숫자를 적고 Enter(또는 칸을 벗어나면) 그 행을 바로 그 위치로 옮긴다.
     * 정렬이 아니라 "끼워넣기"다 — 39번 행에 1을 적으면 맨 위로 가고 기존 1..38은 한 칸씩 밀린다.
     * 드래그와 똑같이 `<tr>`만 옮겨 입력 중인 수량은 보존한다.
     */
    async function moveGridRowToOrder(input) {
        const tr = input && input.closest('tr');
        const tbody = tr && tr.parentElement;
        if (!tr || !tbody) return;
        const trs = Array.from(tbody.children);
        const cur = trs.indexOf(tr);
        const raw = String(input.value).trim();
        if (!_gridOrderEditable) {
            input.value = String(cur + 1);
            UIUtils.toast('순서 변경은 납품처를 「전체」로 두고 하세요 — 일부만 보고 옮기면 나머지 순번이 어긋납니다.', 'warning');
            return;
        }
        const n = Math.round(Number(raw));
        if (raw === '' || isNaN(n)) { input.value = String(cur + 1); return; }
        const target = Math.min(Math.max(n, 1), trs.length) - 1;
        if (target === cur) { input.value = String(cur + 1); return; }

        // 저장된 순번은 실수로 바뀌면 안 된다 — 옮기기 전에 반드시 물어본다.
        const name = [tr.children[2]?.textContent, tr.children[3]?.textContent, tr.children[4]?.textContent]
            .map(s => String(s || '').trim()).filter(s => s && s !== '-').join(' ');
        if (!confirm(`「${name}」의 순번을 ${cur + 1}번 → ${target + 1}번으로 변경할까요?`)) {
            input.value = String(cur + 1);
            return;
        }

        const rows = trs.map(el => {
            const cell = el.querySelector('.sdp-grid-cell, .sdp-order-cell');
            return cell ? _gridRows[Number(cell.dataset.row)] : null;
        });
        if (rows.some(r => !r) || rows.length !== _gridRows.length) {
            console.warn('[SalesDeliveryPlan] 행 매핑을 찾지 못해 순번 이동을 중단합니다.');
            input.value = String(cur + 1);
            return;
        }

        trs.splice(cur, 1);
        trs.splice(target, 0, tr);
        const [movedRow] = rows.splice(cur, 1);
        rows.splice(target, 0, movedRow);
        trs.forEach(el => tbody.appendChild(el));

        _gridRows = rows;
        trs.forEach((el, i) => {
            el.querySelectorAll('.sdp-grid-cell, .sdp-order-cell')
                .forEach(cell => { cell.dataset.row = String(i); });
        });
        _syncGridOrderInputs(tbody);

        tr.scrollIntoView({ block: 'nearest' });
        tr.classList.add('sdp-row-drop-above');
        setTimeout(() => tr.classList.remove('sdp-row-drop-above'), 900);

        const saved = await _assignGridOrderNumbers();
        if (saved) UIUtils.toast(`${target + 1}번으로 옮기고 순번을 저장했습니다.`, 'success');
    }

    async function saveGridOrder() {
        const wrap = document.getElementById('sdpGridEditorBody');
        const tbody = wrap && wrap.querySelector('tbody');
        if (!tbody || !tbody.children.length) return;
        if (!_gridOrderEditable) {
            UIUtils.toast('순서 저장은 납품처를 「전체」로 두고 하세요 — 일부만 보고 저장하면 나머지 순번이 어긋납니다.', 'warning');
            return;
        }

        // 표를 다시 그리지 않고 `<tr>`만 재배치한다.
        //
        // 예전에는 마지막에 renderGridEditorRows()로 표를 통째로 새로 그렸는데, 그러면
        // 아직 저장 안 한 수량 입력이 DB 값으로 되돌아간다 — 사용자가 지운 칸의 수량이
        // 순서 저장만 눌렀는데 되살아나던 문제. 수량은 「저장」 버튼의 몫이므로
        // 순서 저장은 순번에만 손대고 입력 중인 값은 그대로 둔다.
        const items = Array.from(tbody.children).map((tr, i) => {
            const anyCell = tr.querySelector('.sdp-grid-cell, .sdp-order-cell');
            const orderInput = tr.querySelector('.sdp-order-cell');
            const raw = orderInput ? String(orderInput.value).trim() : '';
            const n = raw === '' ? Number.MAX_SAFE_INTEGER : Number(raw);
            return {
                tr,
                cur: i,
                order: isNaN(n) ? Number.MAX_SAFE_INTEGER : n,
                row: anyCell ? _gridRows[Number(anyCell.dataset.row)] : null
            };
        });
        if (items.some(it => !it.row)) {
            console.warn('[SalesDeliveryPlan] 행 매핑을 찾지 못해 순서 저장을 중단합니다.');
            UIUtils.toast('행 정보를 읽지 못했습니다. 표를 다시 불러온 뒤 시도하세요.', 'error');
            return;
        }

        // 같은 숫자를 적었으면 지금 화면 순서를 유지한다(안정 정렬).
        items.sort((a, b) => (a.order - b.order) || (a.cur - b.cur));
        const moved = items.filter((it, i) => it.cur !== i).length;
        if (!moved) { _syncGridOrderInputs(tbody); UIUtils.toast('변경된 순번이 없습니다.', 'info'); return; }
        if (!confirm(`${moved}개 품목의 순번이 바뀝니다. 변경할까요?`)) {
            _syncGridOrderInputs(tbody);
            return;
        }
        items.forEach(it => tbody.appendChild(it.tr));

        // 배열을 새 순서로 세우고 data-row를 다시 적는다 — 이걸 빼먹으면 수량이 엉뚱한
        // 품목에 저장된다(드래그에서 이미 겪은 사고).
        _gridRows = items.map(it => it.row);
        Array.from(tbody.children).forEach((tr, i) => {
            tr.querySelectorAll('.sdp-grid-cell, .sdp-order-cell')
                .forEach(cell => { cell.dataset.row = String(i); });
        });

        _syncGridOrderInputs(tbody);
        const changed = await _assignGridOrderNumbers();
        UIUtils.toast(changed ? `순번 ${changed}건 저장했습니다.` : '변경된 순번이 없습니다.', changed ? 'success' : 'info');
    }

    /** 엑셀에서 복사한 셀(행/열 여러 개 가능)을 붙여넣은 칸부터 이어서 채운다.
     *  엑셀 복사는 클립보드에 행은 개행, 열은 탭(\t)으로 구분된 텍스트로 담긴다
     *  (개행은 \r\n·\r·\n 중 하나 — OS·엑셀 버전에 따라 다를 수 있어 전부 처리한다).
     *  값이 하나뿐(탭·개행이 전혀 없음)이면 브라우저 기본 붙여넣기 동작에 맡긴다.
     *
     *  날짜 문자열로 목표 칸을 다시 찾지 않고(속성 선택자 재조회는 이스케이프·불일치에
     *  취약해 일부 열에서만 채워지는 사고가 있었다), 붙여넣은 칸의 실제 위치(같은 행의
     *  몇 번째 칸인지)를 기준으로 오른쪽·아래쪽 형제 요소를 그대로 따라가며 채운다 —
     *  DOM 순서가 화면에 보이는 열 순서와 항상 일치하므로 훨씬 확실하다. */
    function onGridCellPaste(e, el) {
        const cd = e.clipboardData || window.clipboardData;
        const text = cd ? (cd.getData('text/plain') || cd.getData('text')) : '';
        if (!text || !/[\t\r\n]/.test(text)) return; // 단일 값 — 기본 붙여넣기 동작 유지

        e.preventDefault();

        const grid = text
            .split(/\r\n|\r|\n/)
            .filter((line, idx, arr) => !(idx === arr.length - 1 && line === '')) // 끝의 빈 줄 제거
            .map(line => line.split('\t').map(v => v.trim()));
        if (!grid.length) return;

        const startTr = el.closest('tr');
        if (!startTr) return;
        const startCells = Array.from(startTr.querySelectorAll('.sdp-grid-cell'));
        // 순번 칸에 붙여넣으면 그 행의 첫 날짜 칸부터 채운다 — "왼쪽 맨 위에서 붙여넣어도
        // 행·열이 맞아야 한다"는 요구를 만족시키려면 시작점이 날짜 영역의 0번이어야 한다.
        const startCellIdx = el.classList.contains('sdp-order-cell') ? 0 : startCells.indexOf(el);
        if (startCellIdx < 0 || !startCells.length) return;

        let tr = startTr;
        for (let r = 0; r < grid.length && tr; r++, tr = tr.nextElementSibling) {
            const cells = tr.querySelectorAll('.sdp-grid-cell');
            const rowVals = grid[r];
            for (let c = 0; c < rowVals.length; c++) {
                const cell = cells[startCellIdx + c];
                if (!cell) break; // 오른쪽에 더 채울 칸이 없으면 이 행은 종료
                // 엑셀은 1,000 이상 숫자를 천단위 콤마와 함께 복사한다("1,260").
                // _num()은 Number()를 그대로 쓰므로 콤마가 있으면 NaN→0으로 죽어
                // 1,000 미만 값만 채워진 것처럼 보이는 사고가 났다 — 콤마를 먼저 제거한다.
                const num = _num(String(rowVals[c]).replace(/,/g, ''));
                cell.value = num > 0 ? String(num) : '';
                cell.style.cssText = _gridInputStyle(num);
            }
        }
    }

    function openGridModal() {
        UIUtils.showModal('납품 계획 등록', _gridEditorHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveGridPlans()">저장</button>
        `, '1800px');
        setTimeout(renderGridEditorRows, 0);
    }

    function openAddModal() {
        openGridModal();
    }

    function openSingleModal() {
        UIUtils.showModal('납품 계획 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveNew()">등록</button>
        `, 'lg');
    }

    async function saveGridPlans() {
        const cells = Array.from(document.querySelectorAll('#sdpGridEditorBody .sdp-grid-cell'));
        let changed = 0;

        for (const cell of cells) {
            const row = _gridRows[Number(cell.dataset.row)];
            const date = cell.dataset.date;
            if (!row || !date) continue;

            const qty = _num(cell.value);
            const existing = _recordsForCell(row, date);
            if (qty > 0 || existing.length > 0) {
                await _upsertPlanCell(row, date, qty);
                changed += 1;
            }
        }

        const swept = await _sweepStalePlansForGrid();

        UIUtils.closeModal();
        UIUtils.toast(
            `${changed}개 납품 계획 셀이 저장되었습니다.` +
            (swept ? ` 화면에 없던 기존 계획 ${swept}건은 정리했습니다.` : ''),
            'success');
        search();
    }

    /**
     * 등록 화면은 「업데이트」다 — 저장하면 그 차종·그 기간의 계획은 화면 내용이 곧 정답이어야
     * 하고, 빈칸은 0(=계획 없음)이어야 한다.
     *
     * 그런데 _upsertPlanCell이 지우는 건 `_matches`로 같은 품목이라고 인정되는 계획뿐이다.
     * 차종이 'q2'로 잘못 적혔거나 납품처에 날짜가 들어간 옛 계획은 같은 품목으로 인정되지
     * 않아 살아남고, 정작 영업계획 화면은 품명으로 제품을 되찾아(_findProduct) 그 계획들을
     * 같은 행에 합산한다. 그래서 "등록했는데 영업계획 수량이 안 바뀐다"가 된다.
     *
     * 여기서는 **영업계획 화면이 이 행으로 해석하는 계획**을 같은 기준(_findProduct)으로 찾아,
     * 방금 저장한 것 말고는 지운다. 화면에서 비운 칸이 실제로 0이 된다.
     *
     * 범위는 이번에 연 등록 화면의 **기간 × 표에 나온 제품**으로 한정한다.
     */
    async function _sweepStalePlansForGrid() {
        if (!_gridRows.length || !_gridDays.length) return 0;
        const start = _gridDays[0];
        const end = _gridDays[_gridDays.length - 1];

        const gridProductIds = new Set(
            _gridRows.map(r => r.product && r.product.id).filter(Boolean)
        );
        if (!gridProductIds.size) return 0;

        // 방금 저장해 남긴 레코드는 건드리면 안 된다.
        const keepIds = new Set();
        _gridRows.forEach(row => {
            _gridDays.forEach(day => {
                _recordsForCell(row, day).forEach(r => keepIds.add(String(r.id)));
            });
        });

        const stale = (Storage.getAll(STORE) || []).filter(plan => {
            if (!plan || keepIds.has(String(plan.id))) return false;
            if (!_dateInRange(plan.date, start, end)) return false;
            const product = _findProduct(plan);
            return !!(product && gridProductIds.has(product.id));
        });

        if (stale.length) {
            // 무엇을 지웠는지 남긴다 — 덮어쓰기는 되돌리기 어려우므로 추적 근거가 있어야 한다.
            console.info('[SalesDeliveryPlan] 덮어쓰기로 정리한 기존 계획', stale.map(p => ({
                id: p.id, date: p.date, carModel: p.carModel, partName: p.partName,
                color: p.color, customer: p.customer, planQty: p.planQty
            })));
        }
        for (const plan of stale) {
            await Storage.remove(STORE, plan.id);
        }
        return stale.length;
    }

    function openCellModal(rowKey, date) {
        const row = _lastRows.find(r => r.key === rowKey);
        if (!row) return;
        const planQty = _planQtyForCell(row, date);
        const deliveredQty = row.deliveryByDate[date] || 0;
        // 납품 실적 기존 레코드 찾기
        const existingDelivery = (Storage.getAll(DB.STORES.SALES_DELIVERY) || []).find(d =>
            d.date === date && _matches(row, d)
        );
        // 납품수량 기본값: 기존 실적 > 계획수량
        const defaultDelivQty = existingDelivery ? _num(existingDelivery.qty ?? existingDelivery.quantity) : planQty;

        UIUtils.showModal({
            title: '납품 계획 / 실적 입력',
            size: 'sm',
            noBackdropClose: true,
            body: `
                <div style="display:grid;grid-template-columns:80px 1fr;gap:6px 12px;font-size:0.88rem;margin-bottom:16px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;">
                    <div style="color:var(--text-muted);">납품일</div><div style="font-weight:700;">${_esc(date)}</div>
                    <div style="color:var(--text-muted);">납품처</div><div>${_esc(row.customer || '-')}</div>
                    <div style="color:var(--text-muted);">차종</div><div>${_esc(row.carModel || '-')}</div>
                    <div style="color:var(--text-muted);">품명</div><div style="font-weight:700;">${_esc(row.partName || '-')}${row.color ? ' / ' + _esc(row.color) : ''}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-blue);">event_note</span>
                            납품 계획 수량
                        </label>
                        <input type="number" min="0" class="form-input" id="sdpCellPlanQty"
                            value="${planQty || ''}" placeholder="0"
                            style="text-align:right;font-weight:700;font-size:1rem;">
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">0 또는 빈칸으로 저장하면 해당 날짜 계획이 삭제됩니다.</div>
                    </div>
                    <hr style="border:none;border-top:1px dashed var(--border-color);margin:0;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-green);">local_shipping</span>
                            납품 실적 수량
                        </label>
                        <input type="number" min="0" class="form-input" id="sdpCellDelivQty"
                            value="${defaultDelivQty || ''}" placeholder="0"
                            style="text-align:right;font-weight:700;font-size:1rem;${defaultDelivQty !== planQty ? 'border-color:var(--accent-orange);' : ''}">
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">기본값은 계획 수량이며, 실제 납품 수량으로 조정 가능합니다. 0이면 실적 삭제.</div>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveCellPlan('${_js(rowKey)}','${date}')">저장</button>
            `
        });
        setTimeout(() => document.getElementById('sdpCellPlanQty')?.select(), 0);
    }

    async function saveCellPlan(rowKey, date) {
        const row = _lastRows.find(r => r.key === rowKey);
        if (!row) return;

        const planQty  = _num(document.getElementById('sdpCellPlanQty')?.value);
        const delivQty = _num(document.getElementById('sdpCellDelivQty')?.value);

        // 1) 납품 실적 입력 시 제품 창고 재고 확인
        if (delivQty > 0) {
            const allDeliveries = Storage.getAll(DB.STORES.SALES_DELIVERY) || [];
            const existingDelivery = allDeliveries.find(d => d.date === date && _matches(row, d));
            const prevDelivQty = existingDelivery ? _num(existingDelivery.qty ?? existingDelivery.quantity) : 0;
            const netNewQty = delivQty - prevDelivQty; // 기존 실적 대비 추가 출고량

            if (netNewQty > 0) {
                // 제품 창고 현재고 계산 (입고 - 출고)
                const invRows = (Storage.getAll(DB.STORES.PRODUCT_INVENTORY) || []).filter(r => _matches(row, r));
                const currentStock = invRows.reduce((sum, r) => {
                    const qty = _num(r.quantity ?? r.qty ?? r.lotSize ?? r.passQty);
                    return sum + (String(r.type || '').includes('출고') ? -qty : qty);
                }, 0);

                if (currentStock <= 0) {
                    UIUtils.toast(`제품 창고 재고가 없습니다. (현재고: 0)  납품 실적을 등록할 수 없습니다.`, 'error');
                    return;
                }
                if (netNewQty > currentStock) {
                    UIUtils.toast(`재고 부족! 현재고 ${UIUtils.formatNumber(currentStock)}개, 출고 요청 ${UIUtils.formatNumber(delivQty)}개 — 재고를 초과할 수 없습니다.`, 'error');
                    return;
                }
            }
        }

        // 2) 계획 저장
        await _upsertPlanCell(row, date, planQty);

        // 3) 납품 실적 저장 → SALES_DELIVERY 스토어 upsert
        const allDeliveries = Storage.getAll(DB.STORES.SALES_DELIVERY) || [];
        const existingDelivery = allDeliveries.find(d => d.date === date && _matches(row, d));

        // 제품 마스터에서 단가 조회 → 금액 자동 계산
        const product = (Storage.getAll(DB.STORES.PRODUCTS) || []).find(p => _matches(row, p));
        const unitPrice = _num(product?.salePrice || product?.unitPrice || existingDelivery?.unitPrice || 0);
        const amount    = unitPrice * delivQty;

        const delivData = {
            date,
            productId: row.productId || row.product?.id || '',
            customer: row.customer || '',
            carModel: row.carModel || '',
            partName: row.partName || '',
            color:    row.color    || '',
            packUnit: row.packUnit || '',
            qty:      delivQty,
            unitPrice,
            amount,
            note:     '납품계획 자동 등록'
        };

        if (delivQty > 0) {
            if (existingDelivery) {
                await Storage.update(DB.STORES.SALES_DELIVERY, existingDelivery.id, { ...existingDelivery, ...delivData });
            } else {
                await Storage.add(DB.STORES.SALES_DELIVERY, delivData);
            }
        } else if (existingDelivery) {
            await Storage.remove(DB.STORES.SALES_DELIVERY, existingDelivery.id);
        }

        UIUtils.closeModal();
        UIUtils.toast(delivQty > 0 ? `납품 실적 ${UIUtils.formatNumber(delivQty)}개 저장되었습니다.` : '계획이 저장되었습니다.', 'success');
        search();
    }

    async function saveNew() {
        const data = _readForm();
        const message = _validate(data);
        if (message) { UIUtils.toast(message, 'warning'); return; }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('납품 계획이 등록되었습니다.', 'success');
        search();
    }

    function editGroup(key) {
        const row = _lastRows.find(r => r.key === key);
        if (!row || !row.ids.length) return;
        const first = Storage.getById(STORE, row.ids[0]);
        if (!first) return;
        edit(first.id);
    }

    function edit(id) {
        const data = Storage.getById(STORE, id);
        if (!data) return;
        UIUtils.showModal('납품 계획 수정', _formHtml(data), `
            <button class="btn btn-danger" onclick="SalesDeliveryPlanModule.remove('${_js(id)}')">삭제</button>
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveEdit('${_js(id)}')">저장</button>
        `, 'lg');
    }

    async function saveEdit(id) {
        const data = _readForm();
        const message = _validate(data);
        if (message) { UIUtils.toast(message, 'warning'); return; }
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('납품 계획이 수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('납품 계획을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.closeModal();
            UIUtils.toast('납품 계획이 삭제되었습니다.', 'success');
            search();
        });
    }

    // ── Excel 업로드 파싱 + 고객사별 프리셋 ──────────────────────────
    const _XLSX_PRESET_KEY = 'mes_excel_delivery_presets';
    let _xlsxParsedData = null;
    let _xlsxLastBuffer = null;        // 재파싱용 원본 버퍼
    let _xlsxCurrentPresetKey = '';    // 현재 로드된 프리셋 키

    // ── 프리셋 저장/로드 ──
    function _getXlsxPresets() {
        try { return JSON.parse(localStorage.getItem(_XLSX_PRESET_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    // key = 프리셋 이름(고유), cfg 안에 customer·presetName 포함
    function _saveXlsxPreset(key, cfg) {
        if (!key) return;
        const presets = _getXlsxPresets();
        presets[key] = { ...cfg, savedAt: new Date().toISOString() };
        localStorage.setItem(_XLSX_PRESET_KEY, JSON.stringify(presets));
    }
    function _deleteXlsxPreset(key) {
        const presets = _getXlsxPresets();
        delete presets[key];
        localStorage.setItem(_XLSX_PRESET_KEY, JSON.stringify(presets));
    }
    // 특정 납품처에 속한 프리셋 [[key, preset], ...] (최신순)
    function _presetsForCustomer(customer) {
        if (!customer) return [];
        const all = _getXlsxPresets();
        return Object.entries(all)
            .filter(([k, p]) => (p.customer || k) === customer)
            .sort((a, b) => (b[1].savedAt || '') > (a[1].savedAt || '') ? 1 : -1);
    }

    // ── 컬럼 문자↔인덱스 변환 ──
    function _colLetterToIdx(letter) {
        const s = String(letter || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (!s) return -1;
        let idx = 0;
        for (let i = 0; i < s.length; i++) idx = idx * 26 + (s.charCodeAt(i) - 64);
        return idx - 1;
    }
    function _idxToColLetter(idx) {
        if (idx < 0) return '';
        let letter = '', n = idx + 1;
        while (n > 0) { const r = (n - 1) % 26; letter = String.fromCharCode(65 + r) + letter; n = Math.floor((n - 1) / 26); }
        return letter;
    }

    // ── 기본 설정 ──
    function _defaultXlsxConfig() {
        return { sheetKeyword: '납품일정', headerRow: '4', companyCol: 'B', companyFilter: '', partNameCol: 'G', categoryCol: 'J', categoryKeyword: '입고 요청량', dateStartCol: 'K' };
    }
    function _readXlsxConfig() {
        const g = id => document.getElementById(id)?.value?.trim() || '';
        return {
            sheetKeyword: g('xlsxSheetKeyword') || '납품일정',
            headerRow: g('xlsxHeaderRow') || '4',
            companyCol: g('xlsxCompanyCol').toUpperCase() || 'B',
            companyFilter: g('xlsxCompanyFilter'),
            partNameCol: g('xlsxPartNameCol').toUpperCase() || 'G',
            categoryCol: g('xlsxCategoryCol').toUpperCase() || 'J',
            categoryKeyword: g('xlsxCategoryKeyword') || '입고 요청량',
            dateStartCol: g('xlsxDateStartCol').toUpperCase() || 'K'
        };
    }
    function _applyXlsxConfig(cfg) {
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
        s('xlsxSheetKeyword', cfg.sheetKeyword);
        s('xlsxHeaderRow', cfg.headerRow);
        s('xlsxCompanyCol', cfg.companyCol);
        s('xlsxCompanyFilter', cfg.companyFilter);
        s('xlsxPartNameCol', cfg.partNameCol);
        s('xlsxCategoryCol', cfg.categoryCol);
        s('xlsxCategoryKeyword', cfg.categoryKeyword);
        s('xlsxDateStartCol', cfg.dateStartCol);
        s('xlsxPresetName', cfg.presetName || '');
    }

    // ── 납품처 변경 → 프리셋 셀렉터 갱신 ──
    function onXlsxCustomerChange() {
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        const badge = document.getElementById('xlsxPresetBadge');
        const delBtn = document.getElementById('xlsxPresetDelBtn');
        const selEl = document.getElementById('xlsxPresetSel');
        const cPresets = _presetsForCustomer(customer);
        if (selEl) {
            if (cPresets.length) {
                selEl.innerHTML = `<option value="">-- 프리셋 선택 --</option>` +
                    cPresets.map(([k, p]) =>
                        `<option value="${_esc(k)}">${_esc(p.presetName || k)}</option>`
                    ).join('');
                selEl.style.color = '';
                if (cPresets.length === 1) {
                    selEl.value = cPresets[0][0];
                    _loadPresetByKey(cPresets[0][0]);
                    return;
                }
            } else {
                selEl.innerHTML = `<option value="">저장된 프리셋 없음</option>`;
                selEl.style.color = 'var(--text-muted)';
            }
        }
        if (badge) badge.style.display = 'none';
        if (delBtn) delBtn.style.display = 'none';
        const def = _defaultXlsxConfig();
        def.companyFilter = customer;
        _applyXlsxConfig(def);
        _xlsxCurrentPresetKey = '';
        if (_xlsxLastBuffer) { try { _parseDeliveryExcel(_xlsxLastBuffer); } catch (e) {} }
    }

    // ── 프리셋 셀렉터 변경 → 설정 로드 ──
    function onXlsxPresetChange() {
        const key = document.getElementById('xlsxPresetSel')?.value || '';
        if (!key) return;
        _loadPresetByKey(key);
    }

    function _loadPresetByKey(key) {
        if (!key) return;
        const preset = _getXlsxPresets()[key];
        const badge = document.getElementById('xlsxPresetBadge');
        const delBtn = document.getElementById('xlsxPresetDelBtn');
        if (preset) {
            _applyXlsxConfig(preset);
            _xlsxCurrentPresetKey = key;
            if (badge) { badge.style.display = ''; badge.textContent = `⭐ "${preset.presetName || key}" 적용됨`; }
            if (delBtn) delBtn.style.display = '';
        } else {
            _xlsxCurrentPresetKey = '';
            if (badge) badge.style.display = 'none';
            if (delBtn) delBtn.style.display = 'none';
        }
        if (_xlsxLastBuffer) { try { _parseDeliveryExcel(_xlsxLastBuffer); } catch (e) {} }
    }

    function _presetListHtml() {
        const presets = _getXlsxPresets();
        const keys = Object.keys(presets);
        if (!keys.length) {
            return `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.85rem;">
                <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;">bookmark_border</span>
                저장된 프리셋이 없습니다.<br>
                <span style="font-size:0.78rem;">파싱 설정 아래 "프리셋 이름"을 입력하고 저장하세요.</span>
            </div>`;
        }
        const grouped = {};
        keys.forEach(k => { const c = presets[k].customer || k; if (!grouped[c]) grouped[c] = []; grouped[c].push(k); });
        const sortedKeys = Object.keys(grouped).sort().flatMap(c => grouped[c]);
        return `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead>
                <tr style="background:var(--bg-secondary);">
                    <th style="text-align:left;padding:7px 10px;font-size:0.78rem;">납품처</th>
                    <th style="text-align:left;padding:7px 10px;font-size:0.78rem;color:var(--accent-blue);">프리셋 이름</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">시트</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">헤더행</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">업체명컬럼</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">부품명컬럼</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">구분컬럼</th>
                    <th style="text-align:center;padding:7px 8px;font-size:0.78rem;">날짜시작</th>
                    <th style="text-align:left;padding:7px 8px;font-size:0.78rem;">필터 키워드</th>
                    <th style="text-align:right;padding:7px 8px;font-size:0.78rem;">저장일시</th>
                    <th style="padding:7px 6px;"></th>
                </tr>
            </thead>
            <tbody>
                ${sortedKeys.map((k, i) => {
                    const p = presets[k];
                    const customer = p.customer || k;
                    const pName = p.presetName || k;
                    const prevC = i > 0 ? (presets[sortedKeys[i-1]].customer || sortedKeys[i-1]) : null;
                    const isNew = customer !== prevC;
                    const savedAt = p.savedAt ? new Date(p.savedAt).toLocaleDateString('ko', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
                    return `<tr style="border-bottom:1px solid var(--border);${isNew && i>0 ? 'border-top:2px solid var(--border);' : ''}">
                        <td style="padding:7px 10px;font-size:0.78rem;">${isNew ? `<b style="color:var(--text-secondary);">${_esc(customer)}</b>` : ''}</td>
                        <td style="padding:7px 10px;font-weight:700;color:var(--accent-blue);">${_esc(pName)}</td>
                        <td style="text-align:center;padding:7px 8px;font-size:0.78rem;color:var(--text-secondary);">${_esc(p.sheetKeyword||'-')}</td>
                        <td style="text-align:center;padding:7px 8px;">${_esc(p.headerRow||'-')}</td>
                        <td style="text-align:center;padding:7px 8px;font-family:monospace;font-weight:700;color:var(--accent-blue);">${_esc(p.companyCol||'-')}</td>
                        <td style="text-align:center;padding:7px 8px;font-family:monospace;font-weight:700;color:var(--accent-blue);">${_esc(p.partNameCol||'-')}</td>
                        <td style="text-align:center;padding:7px 8px;font-family:monospace;font-weight:700;color:var(--accent-blue);">${_esc(p.categoryCol||'-')}</td>
                        <td style="text-align:center;padding:7px 8px;font-family:monospace;font-weight:700;color:var(--accent-blue);">${_esc(p.dateStartCol||'-')}</td>
                        <td style="padding:7px 8px;font-size:0.75rem;color:var(--text-secondary);">${_esc(p.companyFilter||'')}<br><span style="color:var(--text-muted);">${_esc(p.categoryKeyword||'')}</span></td>
                        <td style="text-align:right;padding:7px 8px;font-size:0.73rem;color:var(--text-muted);white-space:nowrap;">${savedAt}</td>
                        <td style="padding:7px 6px;"><button class="btn btn-sm" style="color:var(--accent-red);border:1px solid currentColor;padding:2px 7px;font-size:0.73rem;"
                            onclick="SalesDeliveryPlanModule._deletePresetByKey('${_js(k)}')">삭제</button></td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    }

    function _deletePresetByKey(key) {
        UIUtils.confirm(`"${key}" 프리셋을 삭제하시겠습니까?`, () => {
            _deleteXlsxPreset(key);
            UIUtils.toast(`"${key}" 프리셋이 삭제되었습니다.`, 'success');
            const listEl = document.getElementById('xlsxPresetListBody');
            if (listEl) listEl.innerHTML = _presetListHtml();
        });
    }

    function openExcelUploadModal(activeTab = 'upload') {
        _xlsxParsedData = null;
        _xlsxLastBuffer = null;
        _xlsxCurrentPresetKey = '';
        const presets = _getXlsxPresets();
        const presetKeys = Object.keys(presets);
        const allCustomers = _unique([
            ..._products().map(p => _customerOf(p)),
            ...(Storage.getAll(STORE) || []).map(r => _customerOf(r)),
            ...Object.values(presets).map(p => p.customer || '').filter(Boolean)
        ]);
        const def = _defaultXlsxConfig();

        const customerWithPreset = new Set([
            ...Object.values(presets).map(p => p.customer).filter(Boolean),
            ...presetKeys
        ]);
        const customerOptions = allCustomers.map(c =>
            `<option value="${_esc(c)}">${customerWithPreset.has(c) ? '⭐ ' : ''}${_esc(c)}</option>`
        ).join('');

        const tabStyle = (tab) => `padding:7px 16px;font-size:0.83rem;font-weight:600;cursor:pointer;border:none;border-bottom:2px solid ${activeTab===tab?'var(--accent-blue)':'transparent'};background:transparent;color:${activeTab===tab?'var(--accent-blue)':'var(--text-muted)'};`;

        const html = `
            <!-- 탭 헤더 -->
            <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px;">
                <button style="${tabStyle('upload')}" onclick="SalesDeliveryPlanModule._switchXlsxTab('upload',this)">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">upload_file</span> 엑셀 업로드
                </button>
                <button style="${tabStyle('presets')}" onclick="SalesDeliveryPlanModule._switchXlsxTab('presets',this)">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">bookmark</span>
                    저장된 프리셋 <span style="background:var(--accent-blue);color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:10px;margin-left:3px;">${presetKeys.length}</span>
                </button>
            </div>

            <!-- 업로드 탭 -->
            <div id="xlsxTabUpload" style="display:${activeTab==='upload'?'':'none'};">
                <!-- ① 납품처 + 프리셋 불러오기 -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label">납품처 <span style="font-size:0.72rem;color:var(--text-muted);">⭐ = 프리셋 있음</span></label>
                        <select class="form-select" id="xlsxCustomerSel" onchange="SalesDeliveryPlanModule.onXlsxCustomerChange()">
                            <option value="">-- 납품처 선택 --</option>
                            ${customerOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label">프리셋 불러오기</label>
                        <select class="form-select" id="xlsxPresetSel" onchange="SalesDeliveryPlanModule.onXlsxPresetChange()" style="color:var(--text-muted);">
                            <option value="">납품처를 먼저 선택하세요</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;min-height:26px;">
                    <span id="xlsxPresetBadge" style="display:none;background:rgba(16,185,129,0.15);color:var(--accent-green);font-size:0.75rem;padding:3px 10px;border-radius:20px;white-space:nowrap;border:1px solid rgba(16,185,129,0.3);">⭐ 프리셋 적용됨</span>
                    <button id="xlsxPresetDelBtn" class="btn btn-sm" style="display:none;color:var(--accent-red);border:1px solid var(--accent-red);" onclick="SalesDeliveryPlanModule._deleteCurrentPreset()">
                        <span class="material-symbols-outlined" style="font-size:0.85rem;">delete</span> 프리셋 삭제
                    </button>
                </div>

                <div class="form-group" style="margin-bottom:12px;">
                    <label class="form-label">엑셀 파일 선택 <span style="color:var(--accent-red)">*</span></label>
                    <input type="file" class="form-input" id="xlsxFileInput" accept=".xlsx,.xls"
                        onchange="SalesDeliveryPlanModule._handleExcelFile(this)">
                </div>

                <details id="xlsxConfigDetails" open style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px;">
                    <summary style="padding:9px 14px;font-size:0.83rem;font-weight:600;cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;list-style:none;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;color:var(--text-muted);">tune</span>
                        파싱 설정
                        <span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:2px;">컬럼 위치가 다를 때 직접 지정</span>
                    </summary>
                    <div style="padding:12px 14px;border-top:1px solid var(--border);background:var(--bg-secondary);border-radius:0 0 8px 8px;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:10px;">
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">시트명 검색어</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;" id="xlsxSheetKeyword" value="${def.sheetKeyword}" placeholder="납품일정">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">날짜 헤더 행 번호</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;" id="xlsxHeaderRow" value="${def.headerRow}" placeholder="4" type="number" min="1" max="50">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">업체명 컬럼</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;text-transform:uppercase;" id="xlsxCompanyCol" value="${def.companyCol}" placeholder="B" maxlength="3">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">업체명 필터 키워드 <span style="color:var(--accent-orange);font-weight:700;">★</span></label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;border-color:var(--accent-orange);" id="xlsxCompanyFilter" value="${def.companyFilter}" placeholder="예: KC 케미칼">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">부품명 컬럼</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;text-transform:uppercase;" id="xlsxPartNameCol" value="${def.partNameCol}" placeholder="G" maxlength="3">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">구분 컬럼</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;text-transform:uppercase;" id="xlsxCategoryCol" value="${def.categoryCol}" placeholder="J" maxlength="3">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">구분 필터 키워드</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;" id="xlsxCategoryKeyword" value="${def.categoryKeyword}" placeholder="입고 요청량">
                            </div>
                            <div class="form-group">
                                <label class="form-label" style="font-size:0.74rem;">날짜 시작 컬럼</label>
                                <input class="form-input" style="padding:5px 8px;font-size:0.82rem;text-transform:uppercase;" id="xlsxDateStartCol" value="${def.dateStartCol}" placeholder="K" maxlength="3">
                            </div>
                        </div>
                        <!-- 프리셋 이름 -->
                        <div class="form-group" style="margin-bottom:10px;">
                            <label class="form-label" style="font-size:0.74rem;">
                                프리셋 이름
                                <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted);margin-left:4px;">같은 납품처라도 차종·발주서별로 구분 저장 가능</span>
                            </label>
                            <input class="form-input" style="padding:5px 8px;font-size:0.83rem;" id="xlsxPresetName"
                                placeholder="예: KC케미칼_아반떼  /  일홍_6월  (비워두면 납품처명으로 저장)">
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;">
                                <input type="checkbox" id="xlsxSavePreset" checked> 등록 시 프리셋 저장
                            </label>
                            <button class="btn btn-sm btn-outline" style="font-size:0.78rem;" onclick="SalesDeliveryPlanModule._savePresetNow()">
                                <span class="material-symbols-outlined" style="font-size:0.85rem;">bookmark_add</span> 지금 프리셋 저장
                            </button>
                            <button class="btn btn-sm btn-outline" style="font-size:0.78rem;" onclick="SalesDeliveryPlanModule._reparse()">
                                <span class="material-symbols-outlined" style="font-size:0.85rem;">refresh</span> 재파싱
                            </button>
                        </div>
                    </div>
                </details>

                <div id="xlsxStatus" style="font-size:0.82rem;margin-top:4px;min-height:18px;"></div>
                <div id="xlsxPreviewArea" style="display:none;">
                    <div style="border-top:1px solid var(--border);margin:12px 0 0;padding-top:10px;">
                        <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-green);">check_circle</span>
                            파싱 결과 미리보기
                            <span id="xlsxPreviewNote" style="font-size:0.75rem;font-weight:400;color:var(--text-muted);"></span>
                        </div>
                        <div id="xlsxPreviewTable" style="overflow-x:auto;max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;"></div>
                    </div>
                </div>
            </div>

            <!-- 프리셋 목록 탭 -->
            <div id="xlsxTabPresets" style="display:${activeTab==='presets'?'':'none'};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="font-size:0.83rem;color:var(--text-muted);">납품처별 파싱 설정이 자동 저장됩니다. 다음 업로드 시 납품처 선택만 하면 적용됩니다.</span>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('xlsxPresetListBody').innerHTML=SalesDeliveryPlanModule._presetListHtml()">
                        <span class="material-symbols-outlined" style="font-size:0.85rem;">refresh</span>
                    </button>
                </div>
                <div id="xlsxPresetListBody" style="overflow-x:auto;border:1px solid var(--border);border-radius:6px;">
                    ${_presetListHtml()}
                </div>
            </div>
        `;
        UIUtils.showModal('엑셀 업로드 — 납품계획 자동입력', html,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-primary" id="xlsxConfirmBtn" style="display:none;" onclick="SalesDeliveryPlanModule._confirmExcelImport()">
                 <span class="material-symbols-outlined">playlist_add</span> 납품계획 등록
             </button>`, 'xl');
    }

    function _switchXlsxTab(tab, btn) {
        ['upload', 'presets'].forEach(t => {
            const el = document.getElementById(`xlsxTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
            if (el) el.style.display = t === tab ? '' : 'none';
        });
        document.querySelectorAll('[onclick*="_switchXlsxTab"]').forEach(b => {
            b.style.borderBottomColor = 'transparent';
            b.style.color = 'var(--text-muted)';
        });
        if (btn) {
            btn.style.borderBottomColor = 'var(--accent-blue)';
            btn.style.color = 'var(--accent-blue)';
        }
        // 프리셋 탭 전환 시 확인 버튼 숨김
        const confirmBtn = document.getElementById('xlsxConfirmBtn');
        if (confirmBtn) confirmBtn.style.display = (tab === 'upload' && _xlsxParsedData?.length) ? '' : 'none';
        // 프리셋 탭이면 목록 새로고침
        if (tab === 'presets') {
            const listEl = document.getElementById('xlsxPresetListBody');
            if (listEl) listEl.innerHTML = _presetListHtml();
        }
    }

    function _deleteCurrentPreset() {
        const key = _xlsxCurrentPresetKey || document.getElementById('xlsxCustomerSel')?.value || '';
        if (!key) return;
        UIUtils.confirm(`"${key}" 프리셋을 삭제하시겠습니까?`, () => {
            _deleteXlsxPreset(key);
            _xlsxCurrentPresetKey = '';
            UIUtils.toast(`"${key}" 프리셋이 삭제되었습니다.`, 'success');
            const badge = document.getElementById('xlsxPresetBadge');
            const delBtn = document.getElementById('xlsxPresetDelBtn');
            if (badge) badge.style.display = 'none';
            if (delBtn) delBtn.style.display = 'none';
            const pSel = document.getElementById('xlsxPresetSel');
            if (pSel) {
                const opt = pSel.querySelector(`option[value="${_esc(key)}"]`);
                if (opt) opt.remove();
                pSel.value = '';
            }
        });
    }

    function _reparse() {
        if (!_xlsxLastBuffer) { UIUtils.toast('먼저 파일을 선택하세요.', 'warning'); return; }
        try { _parseDeliveryExcel(_xlsxLastBuffer); }
        catch (e) { UIUtils.toast(`파싱 오류: ${e.message}`, 'error'); }
    }

    function _savePresetNow() {
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        const presetNameInput = document.getElementById('xlsxPresetName')?.value?.trim() || '';
        const cfg = _readXlsxConfig();
        const key = presetNameInput || customer || cfg.companyFilter || '';
        if (!key) {
            UIUtils.toast('프리셋 이름 또는 납품처를 입력하세요.', 'warning');
            document.getElementById('xlsxPresetName')?.focus();
            return;
        }
        _saveXlsxPreset(key, { ...cfg, customer, presetName: key });
        _xlsxCurrentPresetKey = key;
        UIUtils.toast(`프리셋 저장 완료: "${key}"`, 'success');
        if (customer) {
            const cSel = document.getElementById('xlsxCustomerSel');
            const cOpt = cSel?.querySelector(`option[value="${_esc(customer)}"]`);
            if (cOpt && !cOpt.textContent.startsWith('⭐')) cOpt.textContent = '⭐ ' + cOpt.textContent;
        }
        const pSel = document.getElementById('xlsxPresetSel');
        if (pSel) {
            let opt = pSel.querySelector(`option[value="${_esc(key)}"]`);
            if (!opt) { opt = document.createElement('option'); opt.value = key; pSel.appendChild(opt); }
            opt.textContent = key;
            pSel.value = key;
            pSel.style.color = '';
        }
        const badge = document.getElementById('xlsxPresetBadge');
        const delBtn = document.getElementById('xlsxPresetDelBtn');
        if (badge) { badge.style.display = ''; badge.textContent = `⭐ "${key}" 적용됨`; }
        if (delBtn) delBtn.style.display = '';
    }

    function _handleExcelFile(inputEl) {
        const file = inputEl.files[0];
        if (!file) return;
        const statusEl = document.getElementById('xlsxStatus');
        const previewArea = document.getElementById('xlsxPreviewArea');
        const confirmBtn = document.getElementById('xlsxConfirmBtn');
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-blue);">파일 읽는 중...</span>';
        if (previewArea) previewArea.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
        _xlsxParsedData = null;
        _xlsxLastBuffer = null;

        const reader = new FileReader();
        reader.onload = function(e) {
            _xlsxLastBuffer = e.target.result;
            try { _parseDeliveryExcel(_xlsxLastBuffer); }
            catch (err) {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent-red);">파싱 오류: ${err.message}</span>`;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _excelSerialToDate(serial) {
        if (typeof serial !== 'number' || serial < 40000 || serial > 70000) return null;
        const ms = Math.round((serial - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }

    function _parseDeliveryExcel(arrayBuffer) {
        const statusEl = document.getElementById('xlsxStatus');
        const previewArea = document.getElementById('xlsxPreviewArea');
        const confirmBtn = document.getElementById('xlsxConfirmBtn');
        if (previewArea) previewArea.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';

        if (!window.XLSX) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">XLSX 라이브러리가 로드되지 않았습니다.</span>';
            return;
        }

        const cfg = _readXlsxConfig();
        const headerRowTarget = Math.max(1, parseInt(cfg.headerRow) || 4) - 1; // 0-based
        const companyColIdx = _colLetterToIdx(cfg.companyCol);
        const partNameColIdx = _colLetterToIdx(cfg.partNameCol);
        const categoryColIdx = _colLetterToIdx(cfg.categoryCol);
        const dateStartColIdx = _colLetterToIdx(cfg.dateStartCol);
        const companyFilter = _norm(cfg.companyFilter);
        const categoryKeyword = _norm(cfg.categoryKeyword);

        const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });

        // 시트 찾기
        const sheetName = wb.SheetNames.find(n => cfg.sheetKeyword && n.includes(cfg.sheetKeyword)) ||
                          wb.SheetNames.find(n => n.includes('납품일정')) ||
                          wb.SheetNames.find(n => n.includes('실적')) ||
                          wb.SheetNames[wb.SheetNames.length - 1];
        const ws = wb.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

        // 날짜 컬럼 수집 (지정된 헤더 행 기준)
        const dateCols = [];
        if (headerRowTarget < rawData.length) {
            const hrow = rawData[headerRowTarget];
            for (let ci = dateStartColIdx >= 0 ? dateStartColIdx : 0; ci < hrow.length; ci++) {
                // 엑셀 날짜 시리얼 또는 날짜 문자열(MM/DD, YYYY-MM-DD 등) 처리
                const v = hrow[ci];
                let dateStr = null;
                if (typeof v === 'number' && v > 40000 && v < 70000) {
                    dateStr = _excelSerialToDate(v);
                } else if (typeof v === 'string') {
                    // 날짜 문자열 패턴 인식 (M/D, MM/DD, YYYY-MM-DD)
                    const m = v.match(/^(\d{1,4})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,4}))?$/);
                    if (m) {
                        const n1 = parseInt(m[1]), n2 = parseInt(m[2]), n3 = m[3] ? parseInt(m[3]) : null;
                        if (n1 > 31 && n2 >= 1 && n2 <= 12 && n3) { // YYYY-MM-DD
                            dateStr = `${n1}-${String(n2).padStart(2,'0')}-${String(n3).padStart(2,'0')}`;
                        } else if (n1 >= 1 && n1 <= 12 && n2 >= 1 && n2 <= 31) { // MM/DD → 현재 연도
                            const yr = new Date().getFullYear();
                            dateStr = `${yr}-${String(n1).padStart(2,'0')}-${String(n2).padStart(2,'0')}`;
                        }
                    }
                }
                if (dateStr) dateCols.push({ colIdx: ci, dateStr });
            }
        }

        // 날짜 컬럼이 없으면 자동 탐색 (헤더 행 힌트 무시하고 전체 스캔)
        if (!dateCols.length) {
            for (let ri = 0; ri < Math.min(rawData.length, 15); ri++) {
                const row = rawData[ri];
                let cnt = 0, firstC = -1;
                for (let ci = 0; ci < row.length; ci++) {
                    if (typeof row[ci] === 'number' && row[ci] > 40000 && row[ci] < 70000) {
                        if (firstC === -1) firstC = ci;
                        cnt++;
                    }
                }
                if (cnt >= 5) {
                    for (let ci = firstC; ci < row.length; ci++) {
                        const ds = _excelSerialToDate(row[ci]);
                        if (ds) dateCols.push({ colIdx: ci, dateStr: ds });
                    }
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent-orange);">⚠ 날짜 헤더를 ${ri+1}행에서 자동 탐색했습니다. "날짜 헤더 행 번호"를 ${ri+1}로 수정하고 재파싱하세요.</span>`;
                    break;
                }
            }
        }

        if (!dateCols.length) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">날짜 컬럼을 찾지 못했습니다. 파싱 설정의 "날짜 헤더 행"과 "날짜 시작 컬럼"을 확인하세요.</span>';
            return;
        }

        // 데이터 행 파싱
        const products = _products();
        const parsedRows = [];

        // 병합 셀 대비: 앞 행 값 이어받기(forward-fill)
        let ffCompany  = '';
        let ffPartName = '';

        for (let ri = headerRowTarget + 1; ri < rawData.length; ri++) {
            const row = rawData[ri];

            // 완전히 빈 행 → 구분 구간으로 간주 → forward-fill 초기화
            const isBlankRow = row.every(v => v === '' || v === null || v === undefined);
            if (isBlankRow) { ffCompany = ''; ffPartName = ''; continue; }

            const rawCompany = companyColIdx >= 0 ? _norm(String(row[companyColIdx] || '')) : '';
            if (rawCompany) ffCompany = rawCompany;
            const companyCell = ffCompany;

            const rawPartName = partNameColIdx >= 0 ? String(row[partNameColIdx] || '').trim() : '';
            if (rawPartName) ffPartName = rawPartName;
            const partNameExcel = ffPartName;

            const categoryCell  = categoryColIdx >= 0 ? _norm(String(row[categoryColIdx] || '')) : '';

            if (companyFilter && !companyCell.includes(companyFilter)) continue;
            if (categoryKeyword && !categoryCell.includes(categoryKeyword.replace(/\s/g, '')) &&
                !categoryCell.replace(/\s/g,'').includes(categoryKeyword.replace(/\s/g,''))) continue;
            if (!partNameExcel) continue;

            // 제품 매칭
            const normExcel = _norm(partNameExcel).replace(/[\[\]()（）\s]/g, '');
            const matchedProduct = products.find(p => {
                const pn = _norm(p.partName || '').replace(/[\[\]()（）\s]/g, '');
                return pn && (pn === normExcel || pn.includes(normExcel) || normExcel.includes(pn));
            }) || null;

            // 날짜별 수량
            const dateQtys = [];
            for (const { colIdx, dateStr } of dateCols) {
                const strVal = String(row[colIdx] ?? '').trim();
                if (!strVal || strVal === '-') continue;
                const qty = Number(strVal.replace(/,/g, ''));
                if (!isNaN(qty) && qty > 0) dateQtys.push({ dateStr, qty });
            }
            if (!dateQtys.length) continue;

            parsedRows.push({
                partNameExcel,
                matchedProduct,
                matchedPartName: matchedProduct?.partName || partNameExcel,
                matchedCarModel: matchedProduct?.carModel || '',
                matchedCustomer: matchedProduct ? _customerOf(matchedProduct) : '',
                matchedColor: matchedProduct?.color || '',
                matchedPackUnit: matchedProduct ? _packUnitFromProduct(matchedProduct, '') : '',
                dateQtys
            });
        }

        if (!parsedRows.length) {
            // 디버그: 각 필터별로 몇 행이 걸렸는지 카운트 (forward-fill 동일 적용)
            let cntTotal = 0, cntCompany = 0, cntCategory = 0, cntPartName = 0, cntDate = 0;
            let ffC2 = '', ffP2 = '';
            for (let ri = headerRowTarget + 1; ri < rawData.length; ri++) {
                const row = rawData[ri];
                const isBlank2 = row.every(v => v === '' || v === null || v === undefined);
                if (isBlank2) { ffC2 = ''; ffP2 = ''; continue; }
                const rC2 = companyColIdx >= 0 ? _norm(String(row[companyColIdx] || '')) : '';
                if (rC2) ffC2 = rC2;
                const companyCell2 = ffC2;
                const rP2 = partNameColIdx >= 0 ? String(row[partNameColIdx] || '').trim() : '';
                if (rP2) ffP2 = rP2;
                const partName2     = ffP2;
                const categoryCell2 = categoryColIdx >= 0 ? _norm(String(row[categoryColIdx] || '')) : '';
                if (!companyCell2 && !partName2 && !categoryCell2) continue; // 완전 빈 행 무시
                cntTotal++;
                const passCompany = !companyFilter || companyCell2.includes(companyFilter);
                const passCategory = !categoryKeyword ||
                    categoryCell2.includes(categoryKeyword.replace(/\s/g,'')) ||
                    categoryCell2.replace(/\s/g,'').includes(categoryKeyword.replace(/\s/g,''));
                if (!passCompany) { cntCompany++; continue; }
                if (!passCategory) { cntCategory++; continue; }
                if (!partName2) { cntPartName++; continue; }
                cntDate++;
            }
            const hint = cntCompany > 0
                ? `<br><span style="color:var(--accent-red);font-size:0.78rem;">⚑ 업체명 필터 불일치: ${cntCompany}행 제외됨 → 위 "업체명 필터 키워드" 확인 (엑셀 실제값과 일치해야 함)</span>`
                : cntCategory > 0
                    ? `<br><span style="color:var(--accent-orange);font-size:0.78rem;">⚑ 구분 키워드 불일치: ${cntCategory}행 제외됨 → "구분 필터 키워드" 확인</span>`
                    : '';
            if (statusEl) statusEl.innerHTML =
                `<span style="color:var(--accent-orange);">⚠ 조건에 맞는 행이 없습니다. (데이터 행 ${cntTotal}개 스캔)</span>` +
                `<br><span style="color:var(--text-muted);font-size:0.78rem;">시트: <b>${sheetName}</b> / 업체명 필터: "<b>${cfg.companyFilter || '(없음)'}</b>" / 구분 키워드: "<b>${cfg.categoryKeyword}</b>"</span>` +
                hint;
            return;
        }

        _xlsxParsedData = parsedRows;
        _renderExcelPreview(parsedRows, dateCols);

        const unmatch = parsedRows.filter(r => !r.matchedProduct).length;
        if (statusEl) statusEl.innerHTML =
            `<span style="color:var(--accent-green);">✓ ${parsedRows.length}개 품목 파싱 완료 (시트: ${sheetName})</span>` +
            (unmatch ? `<span style="color:var(--accent-orange);margin-left:8px;">⚠ 미매칭 ${unmatch}건</span>` : '');
        if (previewArea) previewArea.style.display = '';
        if (confirmBtn) confirmBtn.style.display = '';
    }

    function _renderExcelPreview(parsedRows, dateCols) {
        const tableEl = document.getElementById('xlsxPreviewTable');
        if (!tableEl) return;

        const activeDates = dateCols.filter(({ dateStr }) =>
            parsedRows.some(r => r.dateQtys.some(dq => dq.dateStr === dateStr))
        );
        const totalQtys = {};
        parsedRows.forEach(r => r.dateQtys.forEach(({ dateStr, qty }) => {
            totalQtys[dateStr] = (totalQtys[dateStr] || 0) + qty;
        }));

        const dateHeaders = activeDates.map(({ dateStr }) => {
            const d = new Date(`${dateStr}T00:00:00`);
            const w = ['일','월','화','수','목','금','토'][d.getDay()];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return `<th style="text-align:center;padding:5px 4px;font-size:0.72rem;min-width:50px;${isWeekend ? 'color:var(--accent-red);' : ''}">${d.getMonth()+1}/${d.getDate()}<br><span style="font-size:0.63rem;font-weight:400;">${w}</span></th>`;
        }).join('');

        const dataRows = parsedRows.map(r => {
            const badge = r.matchedProduct
                ? `<span style="background:rgba(16,185,129,0.15);color:var(--accent-green);font-size:0.68rem;padding:1px 5px;border-radius:3px;">매칭</span>`
                : `<span style="background:rgba(239,68,68,0.12);color:var(--accent-red);font-size:0.68rem;padding:1px 5px;border-radius:3px;">미매칭</span>`;
            const dateCells = activeDates.map(({ dateStr }) => {
                const found = r.dateQtys.find(dq => dq.dateStr === dateStr);
                const qty = found ? found.qty : 0;
                return `<td style="text-align:center;font-size:0.78rem;padding:4px 5px;${qty > 0 ? 'font-weight:700;color:var(--accent-blue);' : 'color:var(--text-muted);'}">${qty > 0 ? qty.toLocaleString() : '-'}</td>`;
            }).join('');
            return `<tr>
                <td style="white-space:nowrap;font-size:0.78rem;padding:5px 8px;">${_esc(r.partNameExcel)} ${badge}</td>
                <td style="white-space:nowrap;font-size:0.78rem;padding:5px 8px;color:var(--text-secondary);">${_esc(r.matchedPartName)}</td>
                <td style="font-size:0.78rem;padding:5px 8px;white-space:nowrap;">${_esc(r.matchedCarModel || '-')}</td>
                ${dateCells}
            </tr>`;
        }).join('');

        const totalCells = activeDates.map(({ dateStr }) => {
            const t = totalQtys[dateStr] || 0;
            return `<td style="text-align:center;font-size:0.78rem;padding:4px 5px;font-weight:800;color:var(--accent-blue);">${t > 0 ? t.toLocaleString() : '-'}</td>`;
        }).join('');

        tableEl.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);position:sticky;top:0;z-index:1;">
                        <th style="text-align:left;padding:6px 8px;font-size:0.78rem;white-space:nowrap;">엑셀 부품명</th>
                        <th style="text-align:left;padding:6px 8px;font-size:0.78rem;white-space:nowrap;">매칭 품명</th>
                        <th style="text-align:left;padding:6px 8px;font-size:0.78rem;white-space:nowrap;">차종</th>
                        ${dateHeaders}
                    </tr>
                </thead>
                <tbody>
                    ${dataRows}
                    <tr style="background:rgba(59,130,246,0.07);border-top:2px solid var(--border);">
                        <td colspan="3" style="font-size:0.78rem;font-weight:700;padding:5px 8px;text-align:right;color:var(--text-secondary);">합계</td>
                        ${totalCells}
                    </tr>
                </tbody>
            </table>
        `;
        const note = document.getElementById('xlsxPreviewNote');
        if (note) note.textContent = `(${parsedRows.length}개 품목, ${activeDates.length}일)`;
    }

    async function _confirmExcelImport() {
        if (!_xlsxParsedData || !_xlsxParsedData.length) {
            UIUtils.toast('파싱된 데이터가 없습니다.', 'warning');
            return;
        }

        // 등록할 날짜 범위 미리 수집 (나중에 뷰 날짜 범위 확장에 사용)
        const allDates = _xlsxParsedData.flatMap(r => r.dateQtys.map(dq => dq.dateStr)).sort();
        const minDate = allDates[0] || '';
        const maxDate = allDates[allDates.length - 1] || '';

        // 프리셋 저장 여부 확인
        const savePreset = document.getElementById('xlsxSavePreset')?.checked;
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        const presetNameInput = document.getElementById('xlsxPresetName')?.value?.trim() || '';
        const cfgForPreset = _readXlsxConfig();
        const presetKey = presetNameInput || customer || cfgForPreset.companyFilter || '';
        if (savePreset) {
            if (presetKey) {
                _saveXlsxPreset(presetKey, { ...cfgForPreset, customer, presetName: presetKey });
            } else {
                UIUtils.toast('프리셋 저장 생략: 프리셋 이름 또는 납품처를 입력하세요.', 'warning');
            }
        }

        const confirmBtn = document.getElementById('xlsxConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> 등록 중...';
        }

        let insertCount = 0;
        let errMsg = '';
        const parsedForLog = [];
        try {
            for (const row of _xlsxParsedData) {
                const base = {
                    productId: row.matchedProduct?.id || '',
                    customer: row.matchedCustomer || '',
                    carModel: row.matchedCarModel || '',
                    partName: row.matchedPartName,
                    color: row.matchedColor || '',
                    packUnit: row.matchedPackUnit || ''
                };
                for (const { dateStr, qty } of row.dateQtys) {
                    if (qty <= 0) continue;
                    const existing = _recordsForCell(base, dateStr);
                    const existingQty = existing.reduce((s, r) => s + _num(r.planQty), 0);
                    await _upsertPlanCell(base, dateStr, existingQty + qty);
                    parsedForLog.push({ carModel: base.carModel, partName: base.partName, date: dateStr });
                    insertCount++;
                }
            }
        } catch (err) {
            errMsg = err.message || String(err);
        }

        if (parsedForLog.length) {
            try { await SalesParseLog.record(parsedForLog, '납품등록 (엑셀)'); } catch (e) { /* 무시 */ }
        }

        _xlsxParsedData = null;
        _xlsxLastBuffer = null;
        UIUtils.closeModal();

        if (errMsg) {
            UIUtils.toast(`등록 중 오류: ${errMsg}`, 'error');
            return;
        }

        // 등록된 날짜가 현재 뷰 범위를 벗어나면 날짜 범위 자동 확장
        const startEl = document.getElementById('sdpStart');
        const endEl   = document.getElementById('sdpEnd');
        if (startEl && endEl && minDate && maxDate) {
            if (minDate < startEl.value) startEl.value = minDate;
            if (maxDate > endEl.value)   endEl.value   = maxDate;
        }

        UIUtils.toast(`납품계획 ${insertCount}건 등록 완료!` + (savePreset && presetKey ? ` (프리셋 저장: ${presetKey})` : ''), 'success');
        search();
    }

    function exportData() {
        const headers = ['차종', '품명', '컬러', '포장단위', '계획', '납품', '미납', '사출 현재고/필요량', '도장 현재고/필요량', '레이져 현재고/필요량', '완제품수량', ..._lastDays];
        const rows = _lastRows.map(r => [
            r.carModel, r.partName, r.color, r.packUnit,
            r.totalPlan, r.delivered, r.remaining,
            `${r.injectionStock}/${r.injectionShortage}`,
            _isPaintEnd(r) ? `${r.finishedStock + r.shippingStandby}/${r.paintShortage}` : '-',
            _isLaserEnd(r) ? `${r.finishedStock + r.shippingStandby + r.laserStandby}/${r.laserShortage}` : '-',
            r.finishedStock,
            ..._lastDays.map(d => r.planByDate[d] || '')
        ]);
        Storage.exportToCSV(headers, rows, '납품계획');
    }

    return {
        render,
        search,
        openOrphanPlanModal,
        deleteOrphanPlans,
        deleteOrphanPlanGroup,
        shiftMainDateRange,
        jumpMainDateToday,
        setTableDensity,
        openAddModal,
        openGridModal,
        openSingleModal,
        onGridCustomerChange,
        onMainCustomerChange,
        renderGridEditorRows,
        requestGridReload,
        clearGridSelection,
        onGridCellPaste,
        saveGridOrder,
        moveGridRowToOrder,
        toggleHideNoPlan,
        saveGridPlans,
        openCellModal,
        saveCellPlan,
        handleDayCellClick,
        scrollToDate,
        startDateHeaderScroll,
        startGridRowDrag,
        overGridRowDrop,
        dropGridRow,
        endGridRowDrag,
        startPlanDrag,
        overPlanDrop,
        leavePlanDrop,
        dropPlan,
        endPlanDrag,
        saveNew,
        edit,
        editGroup,
        saveEdit,
        remove,
        fillFromProduct,
        exportData,
        getPlanningMaterialRows,
        openExcelUploadModal,
        onXlsxCustomerChange,
        onXlsxPresetChange,
        _switchXlsxTab,
        _presetListHtml,
        _deletePresetByKey,
        _handleExcelFile,
        _parseDeliveryExcel,
        _reparse,
        _savePresetNow,
        _deleteCurrentPreset,
        _confirmExcelImport
    };
})();

/**
 * 2-1) 생산계획 자료 — 납품계획 기반 사출/도장/레이져 필요량 산출
 */
var SalesPlanningMaterialsModule = (function() {
    let _rows = [];

    function _esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function _num(value) {
        return Number(value) || 0;
    }

    function _fmt(value) {
        return UIUtils.formatNumber(_num(value));
    }

    function _norm(value) {
        return String(value || '').trim().toLowerCase();
    }

    function _carKey(value) {
        return _norm(value).replace(/\s+/g, '');
    }

    function _sameCarModel(a, b) {
        const ak = _carKey(a);
        const bk = _carKey(b);
        return !!ak && !!bk && ak === bk;
    }

    function _addDays(dateText, days) {
        const date = new Date(`${dateText}T00:00:00`);
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    }

    function _today() {
        return UIUtils.today ? UIUtils.today() : new Date().toISOString().slice(0, 10);
    }

    function _productOf(row) {
        if (row.product) return row.product;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        if (row.productId) {
            const byId = products.find(p => p.id === row.productId);
            if (byId) return byId;
        }
        return products.find(p =>
            p.partName === row.partName &&
            _sameCarModel(p.carModel, row.carModel) &&
            (!row.color || !p.color || p.color === row.color)
        ) || products.find(p =>
            p.partName === row.partName &&
            _sameCarModel(p.carModel, row.carModel)
        ) || null;
    }

    function _linkedInjectionMaterials(row) {
        const product = _productOf(row);
        const productId = row.productId || product?.id || '';
        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        return mats.filter(m => {
            if (productId && Array.isArray(m.productIds) && m.productIds.includes(productId)) return true;
            if (!_sameCarModel(m.carModel, row.carModel)) return false;
            const names = [m.mfgProductName, m.mfgProductName2].map(v => String(v || '').trim()).filter(Boolean);
            return names.includes(row.partName);
        });
    }

    function _materialName(mat) {
        return mat?.injPartName || mat?.name || mat?.materialName || '-';
    }

    function _paintMaterialName(id, paintMap) {
        if (!id || id === '사용불필요') return id || '-';
        const mat = paintMap[id];
        return mat ? (mat.name || mat.materialName || id) : id;
    }

    let _paintMapCache = null;
    function _paintSpecText(row) {
        if (row && row._paintSpecCache != null) return row._paintSpecCache;
        const text = _paintSpecTextRaw(row);
        if (row) row._paintSpecCache = text;
        return text;
    }

    function _paintSpecTextRaw(row) {
        const product = _productOf(row);
        if (!_paintMapCache) {
            _paintMapCache = {};
            (Storage.getAll(DB.STORES.PAINT_MATERIALS) || []).forEach(m => { if (m.id) _paintMapCache[m.id] = m; });
        }
        const paintMap = _paintMapCache;
        const paints = Array.isArray(product?.paintMaterials) ? product.paintMaterials : [];
        if (!paints.length) return '-';
        return paints.map(p => {
            const main = _paintMaterialName(p.mainId || p.paintMaterialId, paintMap);
            const hard = _paintMaterialName(p.hardId, paintMap);
            const thin = _paintMaterialName(p.thinnerId, paintMap);
            const tag = p.processTag || p.paintProcess || p.process || '';
            const spec = p.paintSpec || p.typeFilter || '';
            return [tag, spec, [main, hard, thin].filter(v => v && v !== '-').join(' / ')].filter(Boolean).join(' · ');
        }).join('<br>');
    }

    function _stockNeed(current, need) {
        const needText = need > 0 ? `-${_fmt(need)}` : _fmt(need);
        const needColor = need > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        return `<span style="font-weight:700;">${_fmt(current)}</span><span style="color:var(--text-muted);"> / </span><span style="font-weight:800;color:${needColor};">${needText}</span>`;
    }

    function _summaryCards(rows) {
        const inj = rows.reduce((s, r) => s + _num(r.injectionShortage), 0);
        const paint = rows.reduce((s, r) => s + _num(r.paintShortage), 0);
        const laser = rows.reduce((s, r) => s + _num(r.laserShortage), 0);
        const remain = rows.reduce((s, r) => s + _num(r.remaining), 0);
        return `
            <div class="stat-cards" style="margin-bottom:14px;">
                <div class="stat-card blue"><div class="stat-card-value">${_fmt(remain)}</div><div class="stat-card-label">기간 미납 수량</div></div>
                <div class="stat-card red"><div class="stat-card-value">${_fmt(inj)}</div><div class="stat-card-label">사출 필요량</div></div>
                <div class="stat-card orange"><div class="stat-card-value">${_fmt(paint)}</div><div class="stat-card-label">도장/도료 필요량</div></div>
                <div class="stat-card green"><div class="stat-card-value">${_fmt(laser)}</div><div class="stat-card-label">레이져 필요량</div></div>
            </div>`;
    }

    function _baseCols(row) {
        return `
            <td style="white-space:nowrap;">${_esc(row.carModel || '-')}</td>
            <td style="font-weight:800;min-width:190px;">${_esc(row.partName || '-')}</td>
            <td style="white-space:nowrap;">${_esc(row.color || '-')}</td>
            <td style="text-align:right;">${_fmt(row.remaining)}</td>`;
    }

    function _table(title, icon, headers, rows, rowHtml, emptyText) {
        return `
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">${icon}</span> ${title}</h4></div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper" style="max-height:360px;overflow:auto;">
                        <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;font-size:0.78rem;">
                            <thead><tr>${headers.map(h => `<th style="white-space:nowrap;">${h}</th>`).join('')}</tr></thead>
                            <tbody>${rows.length ? rows.map(rowHtml).join('') : `<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;color:var(--text-muted);">${emptyText}</td></tr>`}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       발주 대비 수급 현황 — 한 표로 보는 요약
       발주 / 납품 / 미납 / 재공품(완제품·레이져 대기·포장 잔량·레이져 후 재공) /
       도장 부족분 / 레이져 부족품 / 사출 재고 / 사출 부족분
    ══════════════════════════════════════════════════════════ */
    // 레이져 재공 계산은 전체 이력을 훑는 무거운 연산이라 조회 1회당 한 번만 계산해 둔다.
    let _wipSnapshot = null;
    function _takeWipSnapshot() {
        _wipSnapshot = { wip: null, residual: null };
        if (typeof LaserWipModule === 'undefined') return;
        try { if (LaserWipModule._calcWip) _wipSnapshot.wip = LaserWipModule._calcWip(); } catch (e) {}
        try { if (LaserWipModule._calcLaserResidualWip) _wipSnapshot.residual = LaserWipModule._calcLaserResidualWip(); } catch (e) {}
    }

    function _laserResidualQty(row) {
        try {
            if (typeof LaserWipModule !== 'undefined' && LaserWipModule.getResidualQty) {
                return _num(LaserWipModule.getResidualQty(row.carModel, row.partName, row.color,
                    _wipSnapshot && _wipSnapshot.residual));
            }
        } catch (e) {}
        return 0;
    }

    function _afterLaserWipQty(row) {
        try {
            if (typeof LaserWipModule !== 'undefined' && LaserWipModule.getWipStock) {
                return _num(LaserWipModule.getWipStock(row.carModel, row.partName, row.color,
                    _wipSnapshot && _wipSnapshot.wip));
            }
        } catch (e) {}
        return 0;
    }

    function _supplyRow(row) {
        const order = _num(row.totalPlan);
        const delivered = _num(row.delivered);
        const remaining = _num(row.remaining);
        const finished = _num(row.finishedStock) + _num(row.shippingStandby);
        const laserStandby = _num(row.laserStandby);
        const residual = _laserResidualQty(row);
        const afterLaser = _afterLaserWipQty(row);
        const wipTotal = finished + laserStandby + residual + afterLaser;
        const paintShort = remaining - wipTotal;              // 도장 부족분
        const laserBalance = finished - remaining;            // 레이져 부족품 (창고재고 - 미납)
        const injStock = _num(row.injectionStock);
        const injShort = paintShort - injStock;               // 사출 부족분
        return { order, delivered, remaining, finished, laserStandby, residual, afterLaser,
                 wipTotal, paintShort, laserBalance, injStock, injShort };
    }

    // 부족(양수)은 빨강, 여유는 회색/초록
    function _shortCell(value, invert) {
        const short = invert ? value < 0 : value > 0;
        const text = short
            ? (invert ? '-' + _fmt(Math.abs(value)) : _fmt(value))
            : (invert ? '+' + _fmt(Math.abs(value)) : _fmt(Math.max(0, value)));
        const color = short ? 'var(--accent-red)' : 'var(--accent-green)';
        return `<td style="text-align:right;font-weight:800;color:${color};">${text}</td>`;
    }

    function _supplyTable(rows) {
        const list = rows.filter(r => _num(r.totalPlan) > 0 || _num(r.remaining) > 0);
        _takeWipSnapshot();
        const calcs = list.map(_supplyRow);
        _wipSnapshot = null;
        const tot = calcs.reduce((acc, c) => {
            Object.keys(c).forEach(k => { acc[k] = (acc[k] || 0) + c[k]; });
            return acc;
        }, {});
        const body = list.length ? list.map((row, idx) => {
            const c = calcs[idx];
            return `<tr>
                <td style="white-space:nowrap;">${_esc(row.carModel || '-')}</td>
                <td style="font-weight:800;min-width:180px;">${_esc(row.partName || '-')}</td>
                <td style="white-space:nowrap;">${_esc(row.color || '-')}</td>
                <td style="text-align:right;font-weight:700;">${_fmt(c.order)}</td>
                <td style="text-align:right;color:var(--accent-green);font-weight:700;">${_fmt(c.delivered)}</td>
                <td style="text-align:right;font-weight:800;color:${c.remaining > 0 ? 'var(--accent-orange,#ea580c)' : 'var(--text-muted)'};">${_fmt(c.remaining)}</td>
                <td style="text-align:right;">${_fmt(c.finished)}</td>
                <td style="text-align:right;">${_fmt(c.laserStandby)}</td>
                <td style="text-align:right;">${_fmt(c.residual)}</td>
                <td style="text-align:right;">${_fmt(c.afterLaser)}</td>
                <td style="text-align:right;font-weight:800;background:#f8fafc;">${_fmt(c.wipTotal)}</td>
                ${_shortCell(c.paintShort)}
                ${_shortCell(c.laserBalance, true)}
                <td style="text-align:right;">${_fmt(c.injStock)}</td>
                ${_shortCell(c.injShort)}
            </tr>`;
        }).join('') : `<tr><td colspan="15" style="text-align:center;padding:24px;color:var(--text-muted);">기간 내 발주(영업 계획) 품목이 없습니다.</td></tr>`;

        const footer = list.length ? `<tfoot><tr style="background:#f1f5f9;font-weight:900;">
            <td colspan="3" style="text-align:right;">합계</td>
            <td style="text-align:right;">${_fmt(tot.order)}</td>
            <td style="text-align:right;">${_fmt(tot.delivered)}</td>
            <td style="text-align:right;">${_fmt(tot.remaining)}</td>
            <td style="text-align:right;">${_fmt(tot.finished)}</td>
            <td style="text-align:right;">${_fmt(tot.laserStandby)}</td>
            <td style="text-align:right;">${_fmt(tot.residual)}</td>
            <td style="text-align:right;">${_fmt(tot.afterLaser)}</td>
            <td style="text-align:right;">${_fmt(tot.wipTotal)}</td>
            <td style="text-align:right;color:var(--accent-red);">${_fmt(Math.max(0, tot.paintShort))}</td>
            <td style="text-align:right;">${_fmt(tot.laserBalance)}</td>
            <td style="text-align:right;">${_fmt(tot.injStock)}</td>
            <td style="text-align:right;color:var(--accent-red);">${_fmt(Math.max(0, tot.injShort))}</td>
        </tr></tfoot>` : '';

        return `
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <h4><span class="material-symbols-outlined">table_view</span> 발주 대비 수급 현황</h4>
                    <span style="font-size:0.72rem;color:var(--text-muted);">
                        재공품 = 완제품 + 레이져 대기품 + 포장 잔량 + 레이져 후 재공품 ·
                        도장 부족분 = 미납 − 재공품 · 레이져 = 창고재고 − 미납 · 사출 부족분 = 도장 부족분 − 사출재고
                    </span>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper" style="overflow-x:auto;overflow-y:visible;">
                        <table class="data-table spm-supply-table" style="width:max-content;min-width:100%;font-size:0.78rem;">
                            <thead>
                                <tr>
                                    <th rowspan="2">차종</th>
                                    <th rowspan="2">품명</th>
                                    <th rowspan="2">컬러</th>
                                    <th rowspan="2" style="text-align:right;">발주수량</th>
                                    <th rowspan="2" style="text-align:right;">납품수량</th>
                                    <th rowspan="2" style="text-align:right;">미납수량</th>
                                    <th colspan="5" style="text-align:center;background:#f8fafc;">재공품</th>
                                    <th rowspan="2" style="text-align:right;">도장 부족분</th>
                                    <th rowspan="2" style="text-align:right;">레이져 부족품</th>
                                    <th rowspan="2" style="text-align:right;">사출 재고</th>
                                    <th rowspan="2" style="text-align:right;">사출 부족분</th>
                                </tr>
                                <tr>
                                    <th style="text-align:right;background:#f8fafc;">완제품 재고</th>
                                    <th style="text-align:right;background:#f8fafc;">레이져 대기품</th>
                                    <th style="text-align:right;background:#f8fafc;">포장 잔량</th>
                                    <th style="text-align:right;background:#f8fafc;">레이져 후 재공품</th>
                                    <th style="text-align:right;background:#f1f5f9;">합계</th>
                                </tr>
                            </thead>
                            <tbody>${body}</tbody>
                            ${footer}
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function _renderRows() {
        return _supplyTable(_rows);
    }

    async function search() {
        const start = document.getElementById('spmStart')?.value || _today();
        const end = document.getElementById('spmEnd')?.value || _addDays(start, 30);
        const body = document.getElementById('spmBody');
        if (body) body.innerHTML = `<div style="padding:24px;color:var(--text-muted);">계산 중...</div>`;
        _paintMapCache = null;   // 조회마다 도료 마스터 최신값 사용
        _rows = await SalesDeliveryPlanModule.getPlanningMaterialRows(start, end);
        if (body) body.innerHTML = _renderRows();
    }

    function render(container) {
        const start = _today();
        const end = _addDays(start, 30);
        container.innerHTML = `
            <div class="fade-in-up">
                ${SalesProcessUI.renderSection('sales-planning-materials')}
                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="spmStart" value="${_esc(start)}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="spmEnd" value="${_esc(end)}">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="SalesPlanningMaterialsModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div id="spmBody"></div>
            </div>`;
        search();
    }

    return { render, search };
})();

/**
 * 1-2) 영업관리 (매출 분석) — 연간/월간/주간 + 납품처별/차종별
 */
var SalesAnalyticsModule = (function () {
    const STORE = DB.STORES.SALES_DELIVERY;
    const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];
    let _charts = {};

    function _esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
    function _fmt(v) { return UIUtils.formatNumber(Number(v) || 0); }
    function _won(v) { return '₩' + _fmt(v); }
    function _num(v) { return Number(v) || 0; }

    function _destroyCharts() {
        Object.values(_charts).forEach(c => { try { c && c.destroy(); } catch (e) {} });
        _charts = {};
    }

    function _allYears(rows) {
        const ys = new Set(rows.map(r => String(r.date || '').slice(0, 4)).filter(Boolean));
        ys.add(String(new Date().getFullYear()));
        return Array.from(ys).filter(Boolean).sort((a, b) => b.localeCompare(a));
    }

    function _weekStart(dateStr) {
        const d = new Date(`${dateStr}T00:00:00`);
        if (isNaN(d.getTime())) return null;
        const day = (d.getDay() + 6) % 7; // 월요일=0
        d.setDate(d.getDate() - day);
        return d.toISOString().slice(0, 10);
    }
    function _mmdd(dateStr) { return dateStr ? dateStr.slice(5).replace('-', '/') : ''; }

    // 주간 조회 기본값: 최근 8주
    function _defaultWeekRange() {
        const end = UIUtils.today();
        const d = new Date(`${end}T00:00:00`);
        d.setDate(d.getDate() - 56);
        return { start: d.toISOString().slice(0, 10), end: end };
    }

    function render(container) {
        const rows = Storage.getAll(STORE) || [];
        const years = _allYears(rows);
        const curYear = years[0] || String(new Date().getFullYear());
        const wRange = _defaultWeekRange();

        container.innerHTML = `
            <div class="fade-in-up">
                ${SalesProcessUI.renderSection('sales-analytics')}
                <div class="filter-bar" style="gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;">
                    <div class="form-group">
                        <label class="form-label">분석 연도</label>
                        <select class="form-select" id="saYear" onchange="SalesAnalyticsModule.onYearChange()">
                            ${years.map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}년</option>`).join('')}
                        </select>
                    </div>
                    <div style="width:1px;height:32px;background:var(--border-color);align-self:center;margin:0 4px;"></div>
                    <div class="form-group">
                        <label class="form-label">주간 조회 시작</label>
                        <input type="date" class="form-input" id="saWeekStart" value="${wRange.start}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료</label>
                        <input type="date" class="form-input" id="saWeekEnd" value="${wRange.end}">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="SalesAnalyticsModule.onYearChange()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div id="saContent"></div>
            </div>`;
        _renderAnalytics(curYear);
    }

    function onYearChange() {
        const year = document.getElementById('saYear')?.value || String(new Date().getFullYear());
        _renderAnalytics(year);
    }

    function _renderAnalytics(year) {
        _destroyCharts();
        const el = document.getElementById('saContent');
        if (!el) return;
        const rows = Storage.getAll(STORE) || [];
        const yearRows = rows.filter(r => String(r.date || '').slice(0, 4) === year);
        const prevRows = rows.filter(r => String(r.date || '').slice(0, 4) === String(Number(year) - 1));

        const yearAmount = yearRows.reduce((s, r) => s + _num(r.amount), 0);
        const yearQty    = yearRows.reduce((s, r) => s + _num(r.qty), 0);
        const prevAmount = prevRows.reduce((s, r) => s + _num(r.amount), 0);
        const yoy = prevAmount > 0 ? ((yearAmount - prevAmount) / prevAmount * 100) : null;
        const activeMonths = new Set(yearRows.map(r => String(r.date || '').slice(5, 7))).size || 1;
        const monthAvg = yearAmount / activeMonths;

        // 월별 집계
        const monthly = Array.from({ length: 12 }, () => ({ amount: 0, qty: 0 }));
        yearRows.forEach(r => {
            const m = Number(String(r.date || '').slice(5, 7)) - 1;
            if (m >= 0 && m < 12) { monthly[m].amount += _num(r.amount); monthly[m].qty += _num(r.qty); }
        });

        // 주별 집계 (saWeekStart ~ saWeekEnd 필터 적용)
        const weekFilterStart = document.getElementById('saWeekStart')?.value || '';
        const weekFilterEnd   = document.getElementById('saWeekEnd')?.value   || '';
        const weekMap = {};
        rows.forEach(r => {
            if (weekFilterStart && r.date < weekFilterStart) return;
            if (weekFilterEnd   && r.date > weekFilterEnd)   return;
            const ws = _weekStart(r.date);
            if (!ws) return;
            if (!weekMap[ws]) weekMap[ws] = 0;
            weekMap[ws] += _num(r.amount);
        });
        const weeks = Object.keys(weekMap).sort();

        // 납품처별 (연간 기준)
        const byCust = {};
        yearRows.forEach(r => { const k = r.customer || '(미지정)'; byCust[k] = (byCust[k] || 0) + _num(r.amount); });
        const custRows = Object.entries(byCust).sort((a, b) => b[1] - a[1]);

        // 차종별 (연간 기준)
        const byCar = {};
        yearRows.forEach(r => { const k = r.carModel || '(미지정)'; byCar[k] = (byCar[k] || 0) + _num(r.amount); });
        const carRows = Object.entries(byCar).sort((a, b) => b[1] - a[1]);

        // 지표 카드 (compact)
        const kpiCard = (label, value, sub, color) =>
            `<div style="flex:1;min-width:130px;padding:10px 14px;background:#fff;border:1px solid var(--border-color);
                         border-top:3px solid ${color};border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                <div style="font-size:1.1rem;font-weight:800;color:${color};line-height:1.2;">${value}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${label}</div>
                ${sub ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:1px;">${sub}</div>` : ''}
            </div>`;

        el.innerHTML = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                ${kpiCard(`${year}년 연 매출`, _won(yearAmount), '', '#3b82f6')}
                ${kpiCard('전년 대비', yoy == null ? '-' : (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '%', _won(prevAmount), yoy == null ? '#94a3b8' : yoy >= 0 ? '#10b981' : '#ef4444')}
                ${kpiCard('월 평균 매출', _won(monthAvg), `활성 ${activeMonths}개월`, '#f59e0b')}
                ${kpiCard('총 출고수량', _fmt(yearQty) + ' EA', `${yearRows.length}건`, '#8b5cf6')}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <!-- 월간 차트 -->
                <div class="card">
                    <div class="card-header" style="padding:10px 14px;">
                        <h4 style="font-size:0.88rem;"><span class="material-symbols-outlined" style="font-size:16px;">bar_chart</span> 월간 매출 (${year}년)</h4>
                    </div>
                    <div class="card-body" style="padding:10px 14px;">
                        <div style="height:170px;"><canvas id="saMonthlyChart"></canvas></div>
                    </div>
                </div>
                <!-- 주간 차트 -->
                <div class="card">
                    <div class="card-header" style="padding:10px 14px;">
                        <h4 style="font-size:0.88rem;"><span class="material-symbols-outlined" style="font-size:16px;">calendar_view_week</span> 주간 매출
                            ${weekFilterStart && weekFilterEnd ? `<span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">${_mmdd(weekFilterStart)}~${_mmdd(weekFilterEnd)}</span>` : ''}
                        </h4>
                    </div>
                    <div class="card-body" style="padding:10px 14px;">
                        ${weeks.length
                            ? `<div style="height:170px;"><canvas id="saWeeklyChart"></canvas></div>`
                            : `<p style="color:var(--text-muted);text-align:center;padding:40px 0;font-size:0.84rem;">조회 기간에 데이터가 없습니다.</p>`}
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <!-- 납품처별 -->
                <div class="card">
                    <div class="card-header" style="padding:10px 14px;">
                        <h4 style="font-size:0.88rem;"><span class="material-symbols-outlined" style="font-size:16px;">storefront</span> 납품처별 매출 (${year}년)</h4>
                    </div>
                    <div class="card-body" style="padding:10px 14px;">
                        ${custRows.length ? `<div style="height:150px;"><canvas id="saCustomerChart"></canvas></div>` : ''}
                        <div class="data-table-wrapper" style="margin-top:8px;max-height:130px;overflow-y:auto;">
                            <table class="data-table" style="font-size:0.8rem;">
                                <thead><tr><th>납품처</th><th style="text-align:right;">매출</th><th style="text-align:right;">비중</th></tr></thead>
                                <tbody>
                                    ${custRows.length ? custRows.map(([k, v]) => `<tr><td>${_esc(k)}</td><td style="text-align:right;font-weight:600;">${_won(v)}</td><td style="text-align:right;">${yearAmount ? (v/yearAmount*100).toFixed(1) : '0.0'}%</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">데이터 없음</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <!-- 차종별 -->
                <div class="card">
                    <div class="card-header" style="padding:10px 14px;">
                        <h4 style="font-size:0.88rem;"><span class="material-symbols-outlined" style="font-size:16px;">directions_car</span> 차종별 매출 (${year}년)</h4>
                    </div>
                    <div class="card-body" style="padding:10px 14px;">
                        ${carRows.length ? `<div style="height:150px;"><canvas id="saCarChart"></canvas></div>` : ''}
                        <div class="data-table-wrapper" style="margin-top:8px;max-height:130px;overflow-y:auto;">
                            <table class="data-table" style="font-size:0.8rem;">
                                <thead><tr><th>차종</th><th style="text-align:right;">매출</th><th style="text-align:right;">비중</th></tr></thead>
                                <tbody>
                                    ${carRows.length ? carRows.map(([k, v]) => `<tr><td>${_esc(k)}</td><td style="text-align:right;font-weight:600;">${_won(v)}</td><td style="text-align:right;">${yearAmount ? (v/yearAmount*100).toFixed(1) : '0.0'}%</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">데이터 없음</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;

        if (typeof Chart === 'undefined') return;
        const moneyTick = { callback: function (v) { return _fmt(v); }, font: { size: 10 } };
        const compactOpt = (color) => ({
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: moneyTick, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { font: { size: 10 } } } }
        });

        const mCtx = document.getElementById('saMonthlyChart');
        if (mCtx) {
            _charts.monthly = new Chart(mCtx, {
                type: 'bar',
                data: { labels: monthly.map((_, i) => `${i+1}월`), datasets: [{ label: '매출', data: monthly.map(m => m.amount), backgroundColor: '#3b82f6', borderRadius: 3 }] },
                options: compactOpt('#3b82f6')
            });
        }
        const wCtx = document.getElementById('saWeeklyChart');
        if (wCtx && weeks.length) {
            _charts.weekly = new Chart(wCtx, {
                type: 'bar',
                data: { labels: weeks.map(w => _mmdd(w)), datasets: [{ label: '주간 매출', data: weeks.map(w => weekMap[w]), backgroundColor: '#10b981', borderRadius: 3 }] },
                options: compactOpt('#10b981')
            });
        }
        const doughnutOpt = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } } } };
        const cCtx = document.getElementById('saCustomerChart');
        if (cCtx && custRows.length) {
            const top = custRows.slice(0, 6);
            _charts.customer = new Chart(cCtx, { type: 'doughnut', data: { labels: top.map(r => r[0]), datasets: [{ data: top.map(r => r[1]), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] }, options: doughnutOpt });
        }
        const carCtx = document.getElementById('saCarChart');
        if (carCtx && carRows.length) {
            const top = carRows.slice(0, 6);
            _charts.car = new Chart(carCtx, { type: 'doughnut', data: { labels: top.map(r => r[0]), datasets: [{ data: top.map(r => r[1]), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] }, options: doughnutOpt });
        }
    }

    return { render: render, init: render, onYearChange: onYearChange };
})();

/**
 * 2) 매입관리 (Purchase Management)
 */
var SalesPurchaseModule = (function() {
    const STORE = DB.STORES.SALES_PURCHASE;
    const CATEGORIES = ['사출품', '도료', '소모품', '기타'];

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="spFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="spFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">항목</label>
                <select class="form-select" id="spFilterCategory">
                    <option value="">전체</option>
                    ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="SalesPurchaseModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '일자', '매입항목', '거래처', '품명/규격', '수량', '금액', '지불상태', '비고'];
        SalesUtils.renderMain(container, '매입관리', '원재료 및 소모품 매입 내역을 관리합니다.', 'SalesPurchaseModule.openAddModal()', 'SalesPurchaseModule.exportData()', filterHTML, 'spTable', headers);
        search();
    }

    function search() {
        const start = document.getElementById('spFilterStart').value;
        const end = document.getElementById('spFilterEnd').value;
        const cat = document.getElementById('spFilterCategory').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (cat) data = data.filter(d => d.category === cat);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const total = data.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        document.getElementById('spTableStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">₩${UIUtils.formatNumber(total)}</div>
                <div class="stat-card-label">총 매입금액</div>
            </div>
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('spTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><span class="badge badge-outline">${d.category}</span></td>
                    <td>${d.supplier}</td>
                    <td><strong>${d.itemName}</strong></td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td style="text-align:right; font-weight:700;">₩${UIUtils.formatNumber(d.amount)}</td>
                    <td><span class="badge ${d.status === '완료' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                    <td>${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="SalesPurchaseModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="SalesPurchaseModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">매입일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="spDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">매입항목 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="spCategory">
                        ${CATEGORIES.map(c => `<option value="${c}" ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">거래처 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="spSupplier" value="${d.supplier || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명/규격 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="spItemName" value="${d.itemName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="spQty" value="${d.qty || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">매입금액 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="spAmount" value="${d.amount || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">지불상태</label>
                    <select class="form-select" id="spStatus">
                        <option value="대기" ${d.status === '대기' ? 'selected' : ''}>대기</option>
                        <option value="완료" ${d.status === '완료' ? 'selected' : ''}>완료</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="spNote">${d.note || ''}</textarea>
            </div>
        `;
    }

    function collectData() {
        return {
            date: document.getElementById('spDate').value,
            category: document.getElementById('spCategory').value,
            supplier: document.getElementById('spSupplier').value.trim(),
            itemName: document.getElementById('spItemName').value.trim(),
            qty: Number(document.getElementById('spQty').value) || 0,
            amount: Number(document.getElementById('spAmount').value) || 0,
            status: document.getElementById('spStatus').value,
            note: document.getElementById('spNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('매입 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesPurchaseModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.amount) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('매입 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesPurchaseModule.saveEdit('${id}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
        const data = collectData();
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        const headers = ['일자', '카테고리', '공급처', '품명', '수량', '금액', '상태', '비고'];
        const rows = data.map(d => [d.date, d.category, d.supplier, d.itemName, d.qty, d.amount, d.status, d.note]);
        Storage.exportToCSV(headers, rows, '매입관리');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();

/**
 * 3) 외주처관리 (Outsourcing Management)
 */
var SalesOutsourcingModule = (function() {
    const STORE = DB.STORES.SALES_OUTSOURCING;

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="soFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="soFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">외주처</label>
                <input type="text" class="form-input" id="soFilterPartner" placeholder="외주처 검색">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="SalesOutsourcingModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '일자', '구분', '외주처', '차종/품명', '수량', '진행상태', '비고'];
        SalesUtils.renderMain(container, '외주처관리', '사출/도장 외주 발주 및 입고 내역을 관리합니다.', 'SalesOutsourcingModule.openAddModal()', 'SalesOutsourcingModule.exportData()', filterHTML, 'soTable', headers);
        search();
    }

    function search() {
        const start = document.getElementById('soFilterStart').value;
        const end = document.getElementById('soFilterEnd').value;
        const partner = document.getElementById('soFilterPartner').value.trim();

        let data = Storage.getByDateRange(STORE, start, end);
        if (partner) data = data.filter(d => d.partner.includes(partner));
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const inQty = data.filter(d => d.type === '입고').reduce((s, d) => s + (Number(d.qty) || 0), 0);
        const outQty = data.filter(d => d.type === '출고').reduce((s, d) => s + (Number(d.qty) || 0), 0);
        document.getElementById('soTableStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(outQty)}</div>
                <div class="stat-card-label">총 외주출고</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(inQty)}</div>
                <div class="stat-card-label">총 외주입고</div>
            </div>
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('soTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><span class="badge ${d.type === '입고' ? 'badge-success' : 'badge-info'}">${d.type}</span></td>
                    <td><strong>${d.partner}</strong></td>
                    <td>${d.itemName}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td><span class="badge badge-outline">${d.status}</span></td>
                    <td>${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="SalesOutsourcingModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="SalesOutsourcingModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="soDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">구분 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="soType">
                        <option value="출고" ${d.type === '출고' ? 'selected' : ''}>외주출고</option>
                        <option value="입고" ${d.type === '입고' ? 'selected' : ''}>외주입고</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">외주처 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="soPartner" value="${d.partner || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명/차종 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="soItemName" value="${d.itemName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="soQty" value="${d.qty || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">진행상태</label>
                    <input type="text" class="form-input" id="soStatus" value="${d.status || '진행중'}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="soNote">${d.note || ''}</textarea>
            </div>
        `;
    }

    function collectData() {
        return {
            date: document.getElementById('soDate').value,
            type: document.getElementById('soType').value,
            partner: document.getElementById('soPartner').value.trim(),
            itemName: document.getElementById('soItemName').value.trim(),
            qty: Number(document.getElementById('soQty').value) || 0,
            status: document.getElementById('soStatus').value.trim(),
            note: document.getElementById('soNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('외주 내역 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesOutsourcingModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.partner || !data.qty) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('외주 내역 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesOutsourcingModule.saveEdit('${id}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
        const data = collectData();
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        const headers = ['일자', '구분', '외주처', '품명', '수량', '상태', '비고'];
        const rows = data.map(d => [d.date, d.type, d.partner, d.itemName, d.qty, d.status, d.note]);
        Storage.exportToCSV(headers, rows, '외주처관리');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();

/**
 * 납품 출하(금일) — 완제품 창고 재고 선택 후 자동 출고
 * 저장: config (sales_today_shipment_v1) + product_inventory 출고 기록
 */
var SalesTodayShipmentModule = (function () {
    const CONFIG_KEY = 'sales_today_shipment_v1';
    const INVENTORY_STORE = DB.STORES.PRODUCT_INVENTORY;
    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    /** onclick 인라인 문자열 인자용 이스케이프 (따옴표·역슬래시 깨짐 방지) */
    const _js = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    let _records = [];
    /** 영업계획 행에서 [출하 완료]를 눌렀을 때 폼에 채울 값 */
    let _prefill = null;

    function init() {}

    async function _load() {
        _records = (await Storage.getConfigValue(CONFIG_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(_records)) _records = [];
    }
    async function _save() { await Storage.setConfigValue(CONFIG_KEY, _records); }

    function _lotKey(lot) {
        return `${lot.paintingDate || '미표기'}||${lot.color || ''}||${lot.lotNo || ''}`;
    }

    function _getLotBalances(carModel, partName, ignoreShipmentId = '') {
        const inv = Storage.getAll(INVENTORY_STORE) || [];
        const lotMap = {};
        inv.filter(r => (!carModel || r.carModel === carModel) && (!partName || r.partName === partName))
            .forEach(r => {
                if (ignoreShipmentId && r.todayShipmentId === ignoreShipmentId) return;
                const paintingDate = r.paintingDate || r.date || '미표기';
                const color = r.color || '';
                const lotNo = r.lotNo || '';
                const key = `${paintingDate}||${color}||${lotNo}`;
                if (!lotMap[key]) {
                    lotMap[key] = { paintingDate, color, lotNo, balance: 0, carModel: r.carModel, partName: r.partName };
                }
                if (r.type === '출고') lotMap[key].balance -= Number(r.quantity) || 0;
                else lotMap[key].balance += Number(r.quantity) || 0;
            });
        return Object.values(lotMap)
            .filter(l => l.balance > 0)
            .sort((a, b) =>
                (a.paintingDate || '').localeCompare(b.paintingDate || '') ||
                (a.lotNo || '').localeCompare(b.lotNo || '')
            );
    }

    function _carsFromStock(ignoreShipmentId = '') {
        const inv = Storage.getAll(INVENTORY_STORE) || [];
        const balanceMap = {};
        inv.forEach(r => {
            if (ignoreShipmentId && r.todayShipmentId === ignoreShipmentId) return;
            const key = `${r.carModel || ''}||${r.partName || ''}`;
            if (!balanceMap[key]) balanceMap[key] = { carModel: r.carModel, partName: r.partName, balance: 0 };
            if (r.type === '출고') balanceMap[key].balance -= Number(r.quantity) || 0;
            else balanceMap[key].balance += Number(r.quantity) || 0;
        });
        return [...new Set(Object.values(balanceMap).filter(x => x.balance > 0 && x.carModel).map(x => x.carModel))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _partsFromStock(car, ignoreShipmentId = '') {
        const inv = Storage.getAll(INVENTORY_STORE) || [];
        const balanceMap = {};
        inv.filter(r => r.carModel === car).forEach(r => {
            if (ignoreShipmentId && r.todayShipmentId === ignoreShipmentId) return;
            const key = r.partName || '';
            if (!key) return;
            if (!balanceMap[key]) balanceMap[key] = 0;
            if (r.type === '출고') balanceMap[key] -= Number(r.quantity) || 0;
            else balanceMap[key] += Number(r.quantity) || 0;
        });
        return Object.keys(balanceMap).filter(k => balanceMap[k] > 0).sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _products() { return Storage.getAll(DB.STORES.PRODUCTS) || []; }
    function _customerFor(car, part, color) {
        const list = _products();
        const p = list.find(x => x.carModel === car && x.partName === part && (!color || x.color === color))
            || list.find(x => x.carModel === car && x.partName === part);
        return p ? (p.customer || p.deliveryCustomer || p.client || '') : '';
    }

    /* ── 영업계획(납품계획) 연동 ─────────────────────────────────────────────
     * 금일 출하 목록은 "영업 관리 > 영업 계획"의 같은 날짜 계획을 자동으로 끌어와
     * 납품처별로 묶어 보여준다. 계획은 SALES_DELIVERY_PLAN 스토어에 날짜·품목별로
     * 쪼개져 저장되므로 여기서 납품처·차종·품명·컬러 기준으로 합산한다.
     * 납품처는 계획의 customer 값이 오염된 사례가 있어(엑셀 업로드 시 날짜 열 혼입)
     * 영업 계획 화면과 같이 제품 마스터를 우선한다.
     */
    function _normKey(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ''); }

    function _findProductFor(plan) {
        const list = _products();
        if (plan.productId) {
            const byId = list.find(p => p.id === plan.productId);
            if (byId) return byId;
        }
        return list.find(p =>
            _normKey(p.partName) === _normKey(plan.partName) &&
            (!plan.carModel || _normKey(p.carModel) === _normKey(plan.carModel)) &&
            (!plan.color || !p.color || _normKey(p.color) === _normKey(plan.color))
        ) || list.find(p =>
            _normKey(p.partName) === _normKey(plan.partName) &&
            (!plan.carModel || _normKey(p.carModel) === _normKey(plan.carModel))
        ) || null;
    }

    /** 해당 일자의 영업계획을 납품처·차종·품명·컬러로 합산한 목록 */
    function _planRowsFor(date) {
        const plans = (Storage.getAll(DB.STORES.SALES_DELIVERY_PLAN) || [])
            .filter(p => String(p.date || '').slice(0, 10) === date);
        const map = {};
        plans.forEach(plan => {
            const qty = Number(plan.planQty) || 0;
            if (qty <= 0) return;
            const product = _findProductFor(plan);
            const customer = (product && (product.customer || product.deliveryCustomer || product.client)) || plan.customer || '';
            const carModel = (product && product.carModel) || plan.carModel || '';
            const partName = (product && product.partName) || plan.partName || '';
            const color = plan.color || (product && product.color) || '';
            const key = [_normKey(customer), _normKey(carModel), _normKey(partName), _normKey(color)].join('||');
            if (!map[key]) map[key] = { key, customer, carModel, partName, color, planQty: 0 };
            map[key].planQty += qty;
        });
        return Object.values(map).sort((a, b) =>
            (a.customer || '').localeCompare(b.customer || '', 'ko') ||
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko'));
    }

    /** 등록 레코드 ↔ 계획 행 매칭 키(컬러는 양쪽에 있을 때만 비교) */
    function _itemKey(r, withColor) {
        return [_normKey(r.carModel), _normKey(r.partName)].concat(withColor ? [_normKey(r.color)] : []).join('||');
    }

    /** 계획 + 등록 실적을 납품처별로 묶은 화면용 구조 */
    function _buildGroups(date) {
        const planRows = _planRowsFor(date);
        const records = _records.filter(r => (r.date || '') === date);
        const used = new Set();
        const groups = {};
        const _group = name => {
            const label = name || '(납품처 미지정)';
            if (!groups[label]) groups[label] = { customer: label, items: [] };
            return groups[label];
        };

        planRows.forEach(pr => {
            const matched = records.filter(r => !used.has(r.id) && (
                _itemKey(r, true) === _itemKey(pr, true) ||
                (!pr.color && _itemKey(r, false) === _itemKey(pr, false))
            ));
            matched.forEach(r => used.add(r.id));
            _group(pr.customer).items.push({ plan: pr, records: matched });
        });

        records.filter(r => !used.has(r.id)).forEach(r => {
            _group(r.customer).items.push({ plan: null, records: [r] });
        });

        return Object.values(groups).sort((a, b) => a.customer.localeCompare(b.customer, 'ko'));
    }

    /** 제품 마스터의 판매가격(원/EA) — 없으면 0 */
    function _unitPriceFor(car, part, color) {
        const list = _products();
        const p = list.find(x => x.carModel === car && x.partName === part && (!color || x.color === color))
            || list.find(x => x.carModel === car && x.partName === part);
        return p ? (Number(p.salePrice) || 0) : 0;
    }

    function _opts(values, selected, placeholder) {
        return `<option value="">${placeholder}</option>` +
            values.map(v => `<option value="${_esc(v)}" ${v === selected ? 'selected' : ''}>${_esc(v)}</option>`).join('');
    }

    function _lotOpts(lots, selectedKey, placeholder) {
        return `<option value="">${placeholder}</option>` +
            lots.map(l => {
                const key = _lotKey(l);
                const label = `${l.paintingDate || '미표기'}${l.lotNo ? ' / ' + l.lotNo : ''}${l.color ? ' / ' + l.color : ''} — ${UIUtils.formatNumber(l.balance)} EA`;
                return `<option value="${_esc(key)}" ${key === selectedKey ? 'selected' : ''}>${_esc(label)}</option>`;
            }).join('');
    }

    function _todayField() {
        const el = document.getElementById('tsFilterDate');
        return el && el.value ? el.value : UIUtils.today();
    }

    function _lotLabel(r) {
        const parts = [r.paintingDate || '', r.lotNo || ''].filter(Boolean);
        return parts.length ? parts.join(' / ') : '-';
    }

    async function _removeInventoryOut(shipmentId) {
        const records = (Storage.getAll(INVENTORY_STORE) || [])
            .filter(r => r.todayShipmentId === shipmentId && r.type === '출고');
        for (const record of records) {
            await Storage.remove(INVENTORY_STORE, record.id);
        }
    }

    async function _addInventoryOut(shipmentId, data, lot) {
        await Storage.add(INVENTORY_STORE, {
            date: data.date,
            type: '출고',
            carModel: data.carModel,
            partName: data.partName,
            color: lot.color || '',
            paintingDate: lot.paintingDate === '미표기' ? '' : (lot.paintingDate || ''),
            lotNo: lot.lotNo || '',
            quantity: data.qty,
            source: '금일 출하',
            todayShipmentId: shipmentId
        });
    }

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${SalesProcessUI.renderSection('sales-today-shipment')}
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-orange);">outbox</span>
                        납품 출하(금일)
                        <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">영업계획 자동 연동 · 완제품 창고 출고</span>
                    </h4>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <label class="form-label" style="margin:0;white-space:nowrap;">출하일자</label>
                        <input type="date" class="form-input" id="tsFilterDate" value="${UIUtils.today()}" style="width:150px;" onchange="SalesTodayShipmentModule.renderList()">
                        <button class="btn btn-primary btn-sm" onclick="SalesTodayShipmentModule.openForm()">
                            <span class="material-symbols-outlined" style="font-size:16px;">done_all</span> 출하 완료
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:12px 16px;">
                    <div id="tsSummary" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
                    <div style="margin-top:10px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                        선택한 출하일자의 <strong>영업 계획</strong>을 <strong>납품처별 카드</strong>로 자동 리스트업합니다.
                        각 행의 [출하 완료]로 완제품 창고 재고(차종·품명·LOT)를 선택하면 완료 처리와 동시에 창고에서 자동 출고됩니다.
                    </div>
                </div>
            </div>
            <div id="tsCards"><div class="card"><div class="card-body" style="padding:28px;text-align:center;color:var(--text-muted);">로딩 중...</div></div></div>
        </div>`;
        renderList();
    }

    /** 납품처 카드마다 다른 색을 주기 위한 팔레트 (이름 해시로 고정 배정 → 재렌더링해도 같은 색) */
    const _CARD_THEMES = [
        { accent: '#f97316', soft: 'rgba(249,115,22,0.10)', icon: 'local_shipping' },
        { accent: '#2563eb', soft: 'rgba(37,99,235,0.10)',  icon: 'store' },
        { accent: '#059669', soft: 'rgba(5,150,105,0.10)',  icon: 'factory' },
        { accent: '#7c3aed', soft: 'rgba(124,58,237,0.10)', icon: 'apartment' },
        { accent: '#db2777', soft: 'rgba(219,39,119,0.10)', icon: 'inventory_2' },
        { accent: '#0891b2', soft: 'rgba(8,145,178,0.10)',  icon: 'conveyor_belt' },
        { accent: '#ca8a04', soft: 'rgba(202,138,4,0.10)',  icon: 'warehouse' }
    ];
    function _themeFor(customer) {
        const name = String(customer || '');
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
        return _CARD_THEMES[hash % _CARD_THEMES.length];
    }

    const _won = n => UIUtils.formatNumber(Math.round(Number(n) || 0));

    /** 카드 헤더의 요약 뱃지 */
    function _badge(label, value, color) {
        return `<span style="display:inline-flex;align-items:baseline;gap:4px;padding:3px 10px;border-radius:999px;
                    background:var(--bg-primary);border:1px solid var(--border);font-size:0.75rem;white-space:nowrap;">
                    <span style="color:var(--text-muted);">${label}</span>
                    <strong style="color:${color};font-size:0.84rem;">${value}</strong>
                </span>`;
    }

    async function renderList() {
        await _load();
        const wrap = document.getElementById('tsCards');
        if (!wrap) return;
        const date = _todayField();
        const groups = _buildGroups(date);
        const summary = document.getElementById('tsSummary');

        if (!groups.length) {
            if (summary) summary.innerHTML = '';
            wrap.innerHTML = `
                <div class="card"><div class="card-body" style="padding:40px;text-align:center;color:var(--text-muted);">
                    ${_esc(date)} 영업계획·출하 실적이 없습니다.<br>
                    <span style="font-size:0.82rem;">영업 관리 &gt; 영업 계획에 해당 일자 계획이 등록되면 납품처별 카드로 자동 표시됩니다.</span>
                </div></div>`;
            return;
        }

        let totalPlan = 0, totalShip = 0, totalAmount = 0;
        const cards = groups.map(g => {
            const theme = _themeFor(g.customer);
            const gPlan = g.items.reduce((acc, it) => acc + (it.plan ? it.plan.planQty : 0), 0);
            const gShip = g.items.reduce((acc, it) => acc + it.records.reduce((a2, r) => a2 + (Number(r.qty) || 0), 0), 0);
            const gAmount = g.items.reduce((acc, it) => {
                const base = it.plan || it.records[0];
                const price = _unitPriceFor(base.carModel, base.partName, base.color);
                return acc + it.records.reduce((a2, r) => a2 + (Number(r.qty) || 0), 0) * price;
            }, 0);
            const gRemain = Math.max(0, gPlan - gShip);
            totalPlan += gPlan; totalShip += gShip; totalAmount += gAmount;

            const rows = g.items.map(it => {
                const base = it.plan || it.records[0];
                const plan = it.plan ? it.plan.planQty : 0;
                const shipped = it.records.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
                const remain = Math.max(0, plan - shipped);
                const price = _unitPriceFor(base.carModel, base.partName, base.color);
                const carArg = _js(base.carModel || '');
                const partArg = _js(base.partName || '');
                const colorArg = _js(base.color || '');
                let out = '';

                if (!it.records.length) {
                    // 계획만 있고 아직 출하 완료되지 않은 행 — 영업계획에서 자동으로 올라온 항목
                    return `
                    <tr>
                        <td>${_esc(base.carModel || '-')}</td>
                        <td><strong>${_esc(base.partName || '-')}</strong></td>
                        <td style="color:var(--text-muted);font-size:0.82rem;">미출고</td>
                        <td>${_esc(base.color || '-')}</td>
                        <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(plan)}</td>
                        <td style="text-align:right;color:var(--text-muted);">0</td>
                        <td style="text-align:right;font-weight:600;color:var(--accent-red);">${UIUtils.formatNumber(remain)}</td>
                        <td style="text-align:right;">${price ? _won(price) : '<span style="color:var(--text-muted);">-</span>'}</td>
                        <td style="text-align:right;color:var(--text-muted);" title="계획 기준 예상 금액">${price ? '(' + _won(plan * price) + ')' : '-'}</td>
                        <td><span style="font-size:0.72rem;color:#d97706;font-weight:600;">영업계획</span></td>
                        <td style="text-align:center;white-space:nowrap;">
                            <button class="btn btn-sm btn-primary" onclick="SalesTodayShipmentModule.openFormForPlan('${carArg}','${partArg}',${remain},'${colorArg}')">출하 완료</button>
                        </td>
                    </tr>`;
                }

                out += it.records.map((r, idx) => {
                    const qty = Number(r.qty) || 0;
                    const rowPrice = _unitPriceFor(r.carModel, r.partName, r.color) || price;
                    return `
                    <tr>
                        <td>${_esc(r.carModel || '-')}</td>
                        <td><strong>${_esc(r.partName || '-')}</strong></td>
                        <td style="font-family:monospace;font-size:0.82rem;">${_esc(_lotLabel(r))}</td>
                        <td>${_esc(r.color || '-')}</td>
                        <td style="text-align:right;">${idx === 0 && plan ? UIUtils.formatNumber(plan) : '-'}</td>
                        <td style="text-align:right;font-weight:600;color:var(--accent-blue);">${UIUtils.formatNumber(qty)}</td>
                        <td style="text-align:right;color:${idx === 0 && remain > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${idx === 0 && plan ? UIUtils.formatNumber(remain) : '-'}</td>
                        <td style="text-align:right;">${rowPrice ? _won(rowPrice) : '<span style="color:var(--text-muted);">-</span>'}</td>
                        <td style="text-align:right;font-weight:600;">${rowPrice ? _won(qty * rowPrice) : '<span style="color:var(--text-muted);">-</span>'}</td>
                        <td style="color:var(--text-muted);font-size:0.85rem;">${_esc(r.note || '')}</td>
                        <td style="text-align:center;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline" onclick="SalesTodayShipmentModule.openForm('${r.id}')">수정</button>
                            <button class="btn btn-sm btn-danger" onclick="SalesTodayShipmentModule.remove('${r.id}')">삭제</button>
                        </td>
                    </tr>`;
                }).join('');

                // 계획 대비 잔량이 남아 있으면 추가 출하 줄을 덧붙인다.
                if (remain > 0) {
                    out += `
                    <tr style="background:var(--bg-secondary);">
                        <td colspan="6" style="text-align:right;font-size:0.82rem;color:var(--text-muted);">
                            ${_esc(base.carModel || '')} / ${_esc(base.partName || '')} 계획 잔량
                        </td>
                        <td style="text-align:right;font-weight:600;color:var(--accent-red);">${UIUtils.formatNumber(remain)}</td>
                        <td colspan="3"></td>
                        <td style="text-align:center;">
                            <button class="btn btn-sm btn-primary" onclick="SalesTodayShipmentModule.openFormForPlan('${carArg}','${partArg}',${remain},'${colorArg}')">추가 출하</button>
                        </td>
                    </tr>`;
                }
                return out;
            }).join('');

            return `
            <div class="card" style="margin-bottom:18px;border-top:3px solid ${theme.accent};">
                <div class="card-header" style="background:${theme.soft};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:8px;color:${theme.accent};">
                        <span class="material-symbols-outlined">${theme.icon}</span>
                        ${_esc(g.customer)}
                        <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted);">${g.items.length}품목 · ${_esc(date)}</span>
                    </h4>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${_badge('계획', UIUtils.formatNumber(gPlan), 'var(--text-primary)')}
                        ${_badge('출하', UIUtils.formatNumber(gShip), 'var(--accent-blue)')}
                        ${_badge('잔량', UIUtils.formatNumber(gRemain), gRemain > 0 ? 'var(--accent-red)' : 'var(--text-muted)')}
                        ${_badge('판매금액', _won(gAmount) + '원', theme.accent)}
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>차종</th><th>품명</th><th>LOT</th><th>컬러</th>
                                    <th style="text-align:right;">계획수량</th><th style="text-align:right;">출하수량</th><th style="text-align:right;">잔량</th>
                                    <th style="text-align:right;">단가</th><th style="text-align:right;">판매금액</th><th>비고</th>
                                    <th style="text-align:center;width:120px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                            <tfoot>
                                <tr style="background:var(--bg-secondary);font-weight:700;">
                                    <td colspan="4" style="text-align:right;">${_esc(g.customer)} 소계</td>
                                    <td style="text-align:right;">${UIUtils.formatNumber(gPlan)}</td>
                                    <td style="text-align:right;color:var(--accent-blue);">${UIUtils.formatNumber(gShip)}</td>
                                    <td style="text-align:right;color:${gRemain > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${UIUtils.formatNumber(gRemain)}</td>
                                    <td></td>
                                    <td style="text-align:right;color:${theme.accent};">${_won(gAmount)}</td>
                                    <td colspan="2"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>`;
        }).join('');

        wrap.innerHTML = cards;

        if (summary) {
            summary.innerHTML =
                _badge('납품처', groups.length + '곳', 'var(--text-primary)') +
                _badge('계획 합계', UIUtils.formatNumber(totalPlan) + ' EA', 'var(--text-primary)') +
                _badge('출하 합계', UIUtils.formatNumber(totalShip) + ' EA', 'var(--accent-blue)') +
                _badge('미출하 잔량', UIUtils.formatNumber(Math.max(0, totalPlan - totalShip)) + ' EA',
                       totalPlan - totalShip > 0 ? 'var(--accent-red)' : 'var(--text-muted)') +
                _badge('판매금액 합계', _won(totalAmount) + '원', '#059669');
        }
    }

    function _renderLotPanel(car, part, ignoreShipmentId = '') {
        const el = document.getElementById('tsLotPanel');
        if (!el) return;
        if (!car || !part) {
            el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px;text-align:center;">차종과 품명을 선택하면 재고 LOT가 표시됩니다.</div>`;
            return;
        }
        const lots = _getLotBalances(car, part, ignoreShipmentId);
        if (!lots.length) {
            el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:10px;text-align:center;">완제품 창고에 가용 재고가 없습니다.</div>`;
            return;
        }
        const total = lots.reduce((s, l) => s + l.balance, 0);
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
                <span style="font-size:0.8rem;color:var(--text-muted);">총 가용 재고</span>
                <span style="font-size:1rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(total)} EA</span>
            </div>
            ${lots.map((l, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;
                        background:${i === 0 ? 'rgba(59,130,246,0.06)' : 'transparent'};
                        border-radius:6px;margin-bottom:3px;border:1px solid ${i === 0 ? 'rgba(59,130,246,0.2)' : 'transparent'};">
                <span style="font-family:monospace;font-weight:600;font-size:0.85rem;flex:1;">${_esc(l.paintingDate || '미표기')}</span>
                ${l.lotNo ? `<span style="font-size:0.75rem;color:var(--text-muted);">${_esc(l.lotNo)}</span>` : ''}
                ${l.color ? `<span style="font-size:0.75rem;color:var(--text-muted);">${_esc(l.color)}</span>` : ''}
                <span style="font-weight:700;color:var(--accent-blue);font-size:0.88rem;">${UIUtils.formatNumber(l.balance)} EA</span>
            </div>`).join('')}`;
    }

    /** 영업계획 행 → 출하 완료 폼 (차종·품명·컬러·계획수량 자동 채움, LOT은 선입선출 1순위) */
    function openFormForPlan(carModel, partName, qty, color) {
        _prefill = { carModel: carModel || '', partName: partName || '', qty: Number(qty) || 0, color: color || '' };
        openForm('');
    }

    /** 계획 컬러와 같은 LOT만 — 해당 컬러 LOT이 하나도 없으면 전체(컬러 미기록 재고 대비) */
    function _lotsForColor(lots, color) {
        if (!color) return lots;
        const want = _normKey(color);
        const hit = lots.filter(l => !l.color || _normKey(l.color) === want);
        return hit.length ? hit : lots;
    }

    function openForm(id) {
        const rec = id ? _records.find(r => r.id === id) : null;
        const pre = (!rec && _prefill) ? _prefill : null;
        _prefill = null;
        const ignoreId = id || '';
        const car = rec ? (rec.carModel || '') : (pre ? pre.carModel : '');
        const part = rec ? (rec.partName || '') : (pre ? pre.partName : '');
        const lots = (car && part) ? _lotsForColor(_getLotBalances(car, part, ignoreId), pre ? pre.color : '') : [];
        // 계획에서 넘어온 경우 재고 LOT 중 선입선출 1순위를 미리 고른다.
        const lotKey = rec
            ? _lotKey({ paintingDate: rec.paintingDate || '미표기', color: rec.color || '', lotNo: rec.lotNo || '' })
            : (pre && lots.length ? _lotKey(lots[0]) : '');
        const selectedLot = lots.find(l => _lotKey(l) === lotKey);
        const maxQty = selectedLot ? selectedLot.balance : 0;
        // 계획 수량을 기본값으로 — 선택 LOT 가용분을 넘으면 가용분까지만(나머지는 다음 LOT으로 추가 출하)
        const prePlanQty = pre ? (Number(pre.qty) || 0) : 0;
        const preQty = pre ? (selectedLot ? Math.min(prePlanQty || selectedLot.balance, selectedLot.balance) : prePlanQty) : 0;
        const preColor = pre ? ((selectedLot && selectedLot.color) || pre.color || '') : '';
        const preCustomer = pre ? _customerFor(car, part, preColor) : '';

        // 계획 품목은 재고가 없어도 차종·품명이 선택된 상태로 보여 준다(재고 0이면 LOT 없음 안내).
        const carList = _carsFromStock(ignoreId);
        if (car && carList.indexOf(car) < 0) carList.push(car);
        const partList = car ? _partsFromStock(car, ignoreId) : [];
        if (part && partList.indexOf(part) < 0) partList.push(part);
        const carOpts = _opts(carList, car, '-- 차종 선택 --');
        const partOpts = car ? _opts(partList, part, '-- 품명 선택 --') : '<option value="">← 차종 먼저 선택</option>';
        const qtyHint = maxQty
            ? `가용 재고: ${UIUtils.formatNumber(maxQty)} EA` + (prePlanQty > maxQty ? ` · 계획 ${UIUtils.formatNumber(prePlanQty)} EA 중 나머지는 다음 LOT으로 추가 출하` : '')
            : (pre && car && part ? '완제품 창고에 이 품목 재고가 없습니다.' : 'LOT를 선택하세요.');
        const lotOpts = (car && part) ? _lotOpts(lots, lotKey, '-- LOT 선택 --') : '<option value="">← 품명 먼저 선택</option>';

        UIUtils.showModal(rec ? '금일 출하 완료 수정' : '금일 출하 완료', `
            <div style="padding:10px 14px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;margin-bottom:14px;font-size:0.84rem;line-height:1.55;">
                완제품 창고 재고를 선택하면 <strong>출하 완료 처리와 동시에 창고 출고</strong>됩니다.
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">출하일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="tsDate" value="${rec ? _esc(rec.date) : _todayField()}"></div>
                <div class="form-group"><label class="form-label">납품처</label>
                    <input class="form-input" id="tsCustomer" value="${rec ? _esc(rec.customer || '') : _esc(preCustomer)}" placeholder="품목 선택 시 자동 채움" readonly style="background:var(--bg-secondary);"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="tsCar" onchange="SalesTodayShipmentModule.onCarChange('${id || ''}')">${carOpts}</select></div>
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="tsPart" onchange="SalesTodayShipmentModule.onPartChange('${id || ''}')">${partOpts}</select></div>
                <div class="form-group"><label class="form-label">LOT <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="tsLot" onchange="SalesTodayShipmentModule.onLotChange('${id || ''}')">${lotOpts}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">컬러</label>
                    <input class="form-input" id="tsColor" value="${rec ? _esc(rec.color || '') : _esc(preColor || (selectedLot ? selectedLot.color || '' : ''))}" readonly style="background:var(--bg-secondary);"></div>
                <div class="form-group"><label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="tsQty" min="1" max="${maxQty || ''}" value="${rec ? _esc(rec.qty || '') : (preQty || '')}" placeholder="출하 수량">
                    <div id="tsQtyHint" style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${qtyHint}</div></div>
                <div class="form-group" style="flex:2;"><label class="form-label">비고</label>
                    <input class="form-input" id="tsNote" value="${rec ? _esc(rec.note || '') : ''}" placeholder="특이사항"></div>
            </div>
            <div style="margin-top:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                <div style="background:var(--accent-blue);color:#fff;padding:8px 14px;display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:0.95rem;">inventory_2</span>
                    완제품 창고 재고 LOT
                </div>
                <div id="tsLotPanel" style="padding:10px 12px;background:var(--bg-primary);max-height:180px;overflow-y:auto;"></div>
            </div>
            <input type="hidden" id="tsEditId" value="${_esc(id || '')}">
            <input type="hidden" id="tsPlanQty" value="${prePlanQty || ''}">
            <input type="hidden" id="tsPlanColor" value="${_esc(pre ? pre.color || '' : '')}">
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesTodayShipmentModule.saveForm('${id || ''}')">${rec ? '저장' : '출하 완료'}</button>
        `, 'lg');
        _renderLotPanel(car, part, ignoreId);
    }

    function onCarChange(editId) {
        const car = document.getElementById('tsCar')?.value || '';
        const partEl = document.getElementById('tsPart');
        const lotEl = document.getElementById('tsLot');
        const colorEl = document.getElementById('tsColor');
        const qtyEl = document.getElementById('tsQty');
        const hintEl = document.getElementById('tsQtyHint');
        if (partEl) partEl.innerHTML = car ? _opts(_partsFromStock(car, editId || ''), '', '-- 품명 선택 --') : '<option value="">← 차종 먼저 선택</option>';
        if (lotEl) lotEl.innerHTML = '<option value="">← 품명 먼저 선택</option>';
        if (colorEl) colorEl.value = '';
        if (qtyEl) { qtyEl.value = ''; qtyEl.max = ''; }
        if (hintEl) hintEl.textContent = 'LOT를 선택하세요.';
        _renderLotPanel(car, '', editId || '');
    }

    function onPartChange(editId) {
        const car = document.getElementById('tsCar')?.value || '';
        const part = document.getElementById('tsPart')?.value || '';
        const lotEl = document.getElementById('tsLot');
        const colorEl = document.getElementById('tsColor');
        const qtyEl = document.getElementById('tsQty');
        const hintEl = document.getElementById('tsQtyHint');
        const planColor = document.getElementById('tsPlanColor')?.value || '';
        const lots = (car && part) ? _lotsForColor(_getLotBalances(car, part, editId || ''), planColor) : [];
        // 선입선출(FIFO): 가장 오래된 도장일 LOT을 기본 선택
        const fifoKey = lots.length ? _lotKey(lots[0]) : '';
        if (lotEl) lotEl.innerHTML = (car && part) ? _lotOpts(lots, fifoKey, '-- LOT 선택 --') : '<option value="">← 품명 먼저 선택</option>';
        if (colorEl) colorEl.value = '';
        if (qtyEl) { qtyEl.value = ''; qtyEl.max = ''; }
        if (hintEl) hintEl.textContent = (car && part && !lots.length) ? '완제품 창고에 이 품목 재고가 없습니다.' : 'LOT를 선택하세요.';
        _autofillCustomer();
        _renderLotPanel(car, part, editId || '');
        if (fifoKey) onLotChange(editId);
    }

    function onLotChange(editId) {
        const car = document.getElementById('tsCar')?.value || '';
        const part = document.getElementById('tsPart')?.value || '';
        const lotKey = document.getElementById('tsLot')?.value || '';
        const colorEl = document.getElementById('tsColor');
        const qtyEl = document.getElementById('tsQty');
        const hintEl = document.getElementById('tsQtyHint');
        const lots = _getLotBalances(car, part, editId || '');
        const lot = lots.find(l => _lotKey(l) === lotKey);
        if (colorEl) colorEl.value = lot ? (lot.color || '') : '';
        if (qtyEl && lot) {
            qtyEl.max = lot.balance;
            const planQty = Number(document.getElementById('tsPlanQty')?.value) || 0;
            if (planQty > 0) qtyEl.value = Math.min(planQty, lot.balance);
            else if (!qtyEl.value || Number(qtyEl.value) > lot.balance) qtyEl.value = lot.balance;
        }
        if (hintEl) hintEl.textContent = lot ? `가용 재고: ${UIUtils.formatNumber(lot.balance)} EA` : 'LOT를 선택하세요.';
        _autofillCustomer();
    }

    function _autofillCustomer() {
        const car = document.getElementById('tsCar')?.value || '';
        const part = document.getElementById('tsPart')?.value || '';
        const color = document.getElementById('tsColor')?.value || '';
        const custEl = document.getElementById('tsCustomer');
        if (!custEl) return;
        const c = _customerFor(car, part, color);
        if (c) custEl.value = c;
    }

    async function saveForm(id) {
        const g = elId => (document.getElementById(elId) || {}).value || '';
        const date = g('tsDate').trim();
        const carModel = g('tsCar').trim();
        const partName = g('tsPart').trim();
        const lotKey = g('tsLot').trim();
        const qty = parseInt(g('tsQty') || 0, 10);
        if (!date) { UIUtils.toast('출하일자를 입력하세요.', 'warning'); return; }
        if (!carModel || !partName) { UIUtils.toast('차종과 품명을 선택하세요.', 'warning'); return; }
        if (!lotKey) { UIUtils.toast('LOT를 선택하세요.', 'warning'); return; }
        if (!qty || qty <= 0) { UIUtils.toast('수량을 입력하세요.', 'warning'); return; }

        const lots = _getLotBalances(carModel, partName, id || '');
        const lot = lots.find(l => _lotKey(l) === lotKey);
        if (!lot) {
            UIUtils.toast('선택한 LOT 재고를 찾을 수 없습니다.', 'warning');
            return;
        }
        if (qty > lot.balance) {
            UIUtils.toast(`재고가 부족합니다. (가용: ${UIUtils.formatNumber(lot.balance)} EA)`, 'warning');
            return;
        }

        if (typeof ProductWarehouseModule !== 'undefined' && ProductWarehouseModule.getShippingReadiness) {
            const shipStatus = await ProductWarehouseModule.getShippingReadiness(carModel, partName, lot.color || '');
            if (!shipStatus.eligible) {
                UIUtils.toast('출하검사(외관)·신뢰성 검사가 모두 합격인 품목만 출하 완료할 수 있습니다.', 'warning');
                return;
            }
        }

        if (typeof ShippingCertificateModule !== 'undefined' && ShippingCertificateModule.hasIssuedForShipment) {
            const certReady = await ShippingCertificateModule.hasIssuedForShipment({
                id: id || '', date, customer: g('tsCustomer').trim() || _customerFor(carModel, partName, lot.color),
                carModel, partName, color: lot.color || ''
            });
            if (!certReady) {
                UIUtils.toast('출하성적서 발행이 완료된 품목만 출하 완료할 수 있습니다.', 'warning');
                return;
            }
        }

        await _load();
        const payload = {
            date, carModel, partName,
            color: lot.color || '',
            paintingDate: lot.paintingDate === '미표기' ? '' : (lot.paintingDate || ''),
            lotNo: lot.lotNo || '',
            customer: g('tsCustomer').trim() || _customerFor(carModel, partName, lot.color),
            qty,
            note: g('tsNote').trim(),
            updatedAt: new Date().toISOString()
        };

        let shipmentId = id;
        try {
            if (id) {
                await _removeInventoryOut(id);
                const idx = _records.findIndex(r => r.id === id);
                if (idx >= 0) _records[idx] = { ..._records[idx], ...payload };
            } else {
                shipmentId = 'tsh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                payload.id = shipmentId;
                payload.createdAt = new Date().toISOString();
                _records.push(payload);
            }
            await _addInventoryOut(shipmentId, payload, lot);
            await _save();
        } catch (err) {
            console.error('[SalesTodayShipment] save failed:', err);
            UIUtils.toast('출고 처리 중 오류가 발생했습니다.', 'error');
            return;
        }

        UIUtils.toast(id ? '금일 출하 완료 내역이 수정·재출고되었습니다.' : '출하 완료 및 창고 출고가 처리되었습니다.', 'success');
        UIUtils.closeModal();
        const filter = document.getElementById('tsFilterDate');
        if (filter && date) filter.value = date;
        renderList();
    }

    function remove(id) {
        UIUtils.confirm('이 출하 계획품을 삭제하고 창고 출고를 취소하시겠습니까?', async () => {
            await _load();
            try {
                await _removeInventoryOut(id);
                _records = _records.filter(r => r.id !== id);
                await _save();
                UIUtils.toast('삭제 및 창고 출고 취소가 완료되었습니다.', 'success');
                renderList();
            } catch (err) {
                console.error('[SalesTodayShipment] remove failed:', err);
                UIUtils.toast('삭제 처리 중 오류가 발생했습니다.', 'error');
            }
        });
    }

    return { init, render, renderList, openForm, openFormForPlan, onCarChange, onPartChange, onLotChange, saveForm, remove };
})();

/**
 * 6) 외주처 관리 — 외주처 마스터(등록·수정·삭제) + 자재창고에서 "외주처"로 출고된 목록 조회
 *    (자재창고 출고 등록에서 출고구분=외주처로 저장된 INJECTION_INVENTORY 출고 기록을 그대로 조회한다)
 */
var SalesOutsourcingModule = (function() {
    const CONFIG_KEY = 'outsourcing_partners_v1';
    let _partners = [];
    let _partnersLoaded = false;

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function _ensurePartnersLoaded(force) {
        if (_partnersLoaded && !force) return _partners;
        const rows = await Storage.getConfigValue(CONFIG_KEY);
        _partners = Array.isArray(rows) ? rows : [];
        _partnersLoaded = true;
        return _partners;
    }

    async function _savePartners() {
        await Storage.setConfigValue(CONFIG_KEY, _partners);
    }

    // 자재창고 출고 모달의 "외주처" datalist 등에서 참조 — 동기 조회
    function getPartnerNames() {
        return _partners.map(function(p) { return p.name; }).filter(Boolean);
    }

    async function init() {
        await _ensurePartnersLoaded();
    }

    async function render(container) {
        await _ensurePartnersLoaded();
        container.innerHTML = SalesProcessUI.renderSection('sales-outsourcing') + `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>외주처 관리</h3>
                        <p>외주처를 등록하고, 자재창고에서 외주처로 출고된 내역을 확인합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="SalesOutsourcingModule.openPartnerModal()">
                            <span class="material-symbols-outlined">add</span> 외주처 등록
                        </button>
                    </div>
                </div>

                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">handshake</span> 외주처 목록</h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">${_partners.length}개 등록됨</span>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead><tr><th>외주처명</th><th>담당자/연락처</th><th>비고</th><th style="width:130px;">작업</th></tr></thead>
                                <tbody id="outsourcingPartnerBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">local_shipping</span> 외주처 출고 목록</h4>
                        <span id="outsourcingOutSummary" style="font-size:0.78rem;color:var(--text-muted);"></span>
                    </div>
                    <div class="filter-bar" style="flex-wrap:wrap;gap:10px;padding:10px 16px;">
                        <input type="date" class="form-input" id="outsourcingFilterStart" value="${UIUtils.daysAgo(30)}" style="width:auto;" onchange="SalesOutsourcingModule.renderOutList()">
                        <span style="align-self:center;">~</span>
                        <input type="date" class="form-input" id="outsourcingFilterEnd" value="${UIUtils.today()}" style="width:auto;" onchange="SalesOutsourcingModule.renderOutList()">
                        <select class="form-select" id="outsourcingFilterPartner" style="width:auto;" onchange="SalesOutsourcingModule.renderOutList()">
                            <option value="">전체 외주처</option>
                        </select>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead><tr>
                                    <th>출고일</th><th>외주처</th><th>차종</th><th>품명</th><th>컬러</th>
                                    <th style="text-align:right;">수량</th><th>LOT</th><th>비고</th>
                                </tr></thead>
                                <tbody id="outsourcingOutBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        _renderPartnerTable();
        _populatePartnerFilter();
        renderOutList();
    }

    function _renderPartnerTable() {
        const body = document.getElementById('outsourcingPartnerBody');
        if (!body) return;
        if (!_partners.length) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">등록된 외주처가 없습니다.</td></tr>';
            return;
        }
        body.innerHTML = _partners.map(function(p) {
            return `<tr>
                <td style="font-weight:600;">${_esc(p.name)}</td>
                <td>${_esc(p.contact || '-')}</td>
                <td style="color:var(--text-muted);">${_esc(p.memo || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="SalesOutsourcingModule.openPartnerModal('${_esc(p.id)}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="SalesOutsourcingModule.removePartner('${_esc(p.id)}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    function _populatePartnerFilter() {
        const sel = document.getElementById('outsourcingFilterPartner');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">전체 외주처</option>' +
            _partners.map(function(p) { return `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`; }).join('');
        sel.value = current;
    }

    function _collectOutsourcingOutRecords() {
        const rows = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        return rows.filter(function(r) {
            return r && String(r.type || '') === '출고' && String(r.outgoingType || '') === '외주처';
        }).sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    }

    function renderOutList() {
        const body = document.getElementById('outsourcingOutBody');
        const summaryEl = document.getElementById('outsourcingOutSummary');
        if (!body) return;
        const start = (document.getElementById('outsourcingFilterStart') || {}).value || '';
        const end = (document.getElementById('outsourcingFilterEnd') || {}).value || '';
        const partnerFilter = (document.getElementById('outsourcingFilterPartner') || {}).value || '';
        let rows = _collectOutsourcingOutRecords();
        rows = rows.filter(function(r) {
            const day = String(r.date || '').slice(0, 10);
            if (start && day < start) return false;
            if (end && day > end) return false;
            if (partnerFilter && String(r.outsourcingName || '') !== partnerFilter) return false;
            return true;
        });
        if (summaryEl) {
            summaryEl.textContent = `${rows.length}건 · ${UIUtils.formatNumber(rows.reduce(function(s, r) { return s + (Number(r.quantity) || 0); }, 0))} EA`;
        }
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">조회된 외주처 출고 내역이 없습니다.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function(r) {
            const lotText = Array.isArray(r.lots) && r.lots.length
                ? r.lots.map(function(l) { return l.lotNo; }).filter(Boolean).join(', ')
                : (r.lotNo || '-');
            return `<tr>
                <td style="white-space:nowrap;">${_esc(r.date || '-')}</td>
                <td style="font-weight:600;">${_esc(r.outsourcingName || '-')}</td>
                <td>${_esc(r.carModel || '-')}</td>
                <td>${_esc(r.partName || '-')}</td>
                <td>${_esc(r.color || '-')}</td>
                <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(r.quantity || 0)}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${_esc(lotText)}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${_esc(r.memo || r.note || '-')}</td>
            </tr>`;
        }).join('');
    }

    function openPartnerModal(id) {
        const existing = id ? _partners.find(function(p) { return p.id === id; }) : null;
        UIUtils.showModal(existing ? '외주처 수정' : '외주처 등록', `
            <input type="hidden" id="outsourcingPartnerId" value="${existing ? _esc(existing.id) : ''}">
            <div class="form-group">
                <label class="form-label">외주처명 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="outsourcingPartnerName" value="${existing ? _esc(existing.name) : ''}" placeholder="예: 대한금형">
            </div>
            <div class="form-group">
                <label class="form-label">담당자/연락처</label>
                <input type="text" class="form-input" id="outsourcingPartnerContact" value="${existing ? _esc(existing.contact || '') : ''}" placeholder="예: 홍길동 010-1234-5678">
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="outsourcingPartnerMemo" rows="2">${existing ? _esc(existing.memo || '') : ''}</textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesOutsourcingModule.savePartner()">저장</button>
        `, 'md');
    }

    async function savePartner() {
        const id = (document.getElementById('outsourcingPartnerId') || {}).value || '';
        const name = ((document.getElementById('outsourcingPartnerName') || {}).value || '').trim();
        const contact = ((document.getElementById('outsourcingPartnerContact') || {}).value || '').trim();
        const memo = ((document.getElementById('outsourcingPartnerMemo') || {}).value || '').trim();
        if (!name) { UIUtils.toast('외주처명을 입력하세요.', 'warning'); return; }
        if (id) {
            const idx = _partners.findIndex(function(p) { return p.id === id; });
            if (idx >= 0) _partners[idx] = Object.assign({}, _partners[idx], { name: name, contact: contact, memo: memo });
        } else {
            if (_partners.some(function(p) { return p.name === name; })) {
                UIUtils.toast('이미 등록된 외주처명입니다.', 'warning');
                return;
            }
            _partners.push({ id: Storage.generateId(), name: name, contact: contact, memo: memo, createdAt: new Date().toISOString() });
        }
        await _savePartners();
        UIUtils.closeModal();
        UIUtils.toast('외주처 정보가 저장되었습니다.', 'success');
        _renderPartnerTable();
        _populatePartnerFilter();
    }

    function removePartner(id) {
        UIUtils.confirm('이 외주처를 삭제하시겠습니까? (이미 등록된 출고 이력은 남습니다)', async function() {
            _partners = _partners.filter(function(p) { return p.id !== id; });
            await _savePartners();
            _renderPartnerTable();
            _populatePartnerFilter();
            UIUtils.toast('삭제되었습니다.', 'success');
        });
    }

    return {
        init: init,
        render: render,
        renderOutList: renderOutList,
        openPartnerModal: openPartnerModal,
        savePartner: savePartner,
        removePartner: removePartner,
        getPartnerNames: getPartnerNames,
        ensurePartnersLoaded: _ensurePartnersLoaded
    };
})();
