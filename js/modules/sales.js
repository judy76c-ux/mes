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
                        <button class="btn btn-secondary" onclick="${onExport}">
                            <span class="material-symbols-outlined">download</span> 내보내기
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

/**
 * 1) 납품관리 (Delivery Management)
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
        return _uniqueSorted([
            ...deliveries
                .filter(d => !customer || d.customer === customer)
                .map(d => d.carModel),
            ...products
                .filter(p => !customer || (p.customer || p.deliveryCustomer || p.client) === customer)
                .map(p => p.carModel)
        ]);
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
        SalesUtils.renderMain(container, '납품관리', '납품처별 제품 출고 및 매출 실적을 관리합니다.', 'SalesDeliveryModule.openAddModal()', 'SalesDeliveryModule.exportData()', filterHTML, 'sdTable', headers, '출고');
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
        renderTable(data);
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

    function renderTable(data) {
        const tbody = document.getElementById('sdTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><strong>${d.customer}</strong></td>
                    <td>${d.carModel}</td>
                    <td>${d.partName}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.qty)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.unitPrice)}</td>
                    <td style="text-align:right; font-weight:700; color:var(--accent-blue);">₩${UIUtils.formatNumber(d.amount)}</td>
                    <td>${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="SalesDeliveryModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="SalesDeliveryModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function _sdCarModelOptions(selected) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const cars = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
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
        UIUtils.showModal('납품 출고', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveNew()">출고</button>`, 'lg');
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

        const delivery = await Storage.add(STORE, { ...data, lotAllocations: allocations });
        try {
            await _addInventoryOutRecords(delivery.id, data, allocations);
        } catch (err) {
            await Storage.remove(STORE, delivery.id).catch(() => {});
            throw err;
        }
        UIUtils.closeModal();
        UIUtils.toast('제품 출고가 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('출고 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveEdit('${id}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
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
        await _removeInventoryOutRecords(id);
        await Storage.update(STORE, id, { ...data, lotAllocations: allocations });
        await _addInventoryOutRecords(id, data, allocations);
        UIUtils.closeModal();
        UIUtils.toast('제품 출고가 수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await _removeInventoryOutRecords(id);
            await Storage.remove(STORE, id);
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
 * 2) 납품 계획 (Delivery Plan)
 */
var SalesDeliveryPlanModule = (function() {
    const STORE = DB.STORES.SALES_DELIVERY_PLAN;

    let _lastRows = [];
    let _lastDays = [];
    let _gridRows = [];
    let _dragPlan = null;
    let _dragSuppressClickUntil = 0;

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
        const className = (week === 0 || isHoliday) ? 'sdp-red-col' : (week === 6 ? 'sdp-sat-col' : '');
        return {
            dateLabel: day.slice(5).replace('-', '/'),
            monthLabel: `${Number(day.slice(5, 7))}월`,
            dayLabel: `${Number(day.slice(8))}`,
            weekday: DELIVERY_WEEKDAYS[week] || '',
            className
        };
    }

    function _matches(row, item) {
        if (_norm(row.partName) !== _norm(item.partName)) return false;
        if (item.carModel && row.carModel && _norm(row.carModel) !== _norm(item.carModel)) return false;
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
            item?.carModel || '',
            item?.partName || item?.name || '',
            item?.color || item?.paintColor || ''
        ].map(v => _norm(v)).join('||');
    }

    function _findProduct(item) {
        const products = _products();
        return products.find(p =>
            _norm(p.partName) === _norm(item.partName) &&
            (!item.carModel || _norm(p.carModel) === _norm(item.carModel)) &&
            (!item.color || !p.color || _norm(p.color) === _norm(item.color))
        ) || products.find(p =>
            _norm(p.partName) === _norm(item.partName) &&
            (!item.carModel || _norm(p.carModel) === _norm(item.carModel))
        ) || null;
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
        const customers = [
            ...products.map(p => p.customer),
            ...(Storage.getAll(DB.STORES.SALES_DELIVERY) || []).map(d => d.customer),
            ...(Storage.getAll(STORE) || []).map(d => d.customer)
        ];
        return `
            <datalist id="sdpCarList">${_optionList(products.map(p => p.carModel))}</datalist>
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

    function _deliveryCustomers() {
        return [
            ..._products().map(_customerOf),
            ...(Storage.getAll(DB.STORES.SALES_DELIVERY) || []).map(_customerOf),
            ...(Storage.getAll(STORE) || []).map(_customerOf)
        ];
    }

    function _deliveryCars(customer = '') {
        const customerKey = _norm(customer);
        const planCars = (Storage.getAll(STORE) || [])
            .filter(r => !customerKey || _norm(_customerOf(r)) === customerKey)
            .map(r => r.carModel);
        const deliveryCars = (Storage.getAll(DB.STORES.SALES_DELIVERY) || [])
            .filter(r => !customerKey || _norm(_customerOf(r)) === customerKey)
            .map(r => r.carModel);
        // 납품처 미선택 시에만 제품 마스터 포함, 선택 시엔 실제 계획/납품 기록만 사용
        const productCars = customerKey ? [] : _products().map(p => p.carModel);
        return [...productCars, ...planCars, ...deliveryCars];
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

        const cars = _deliveryCars(customer);
        const current = carEl.value || '';
        const keepCurrent = !current || _unique(cars).some(c => _norm(c) === _norm(current));
        carEl.innerHTML = _selectOptions(cars, keepCurrent ? current : '', '-- 차종 선택 --');
        if (!keepCurrent) carEl.value = '';
    }

    function onGridCustomerChange() {
        _refreshGridCarOptions();
        renderGridEditorRows();
    }

    function _productBase(product, selectedCustomer = '') {
        return {
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
        return (Storage.getAll(STORE) || []).filter(plan =>
            plan.date === date &&
            _matches(plan, base) &&
            (!base.packUnit || !plan.packUnit || _norm(plan.packUnit) === _norm(base.packUnit))
        );
    }

    function _planQtyForCell(base, date) {
        return _recordsForCell(base, date).reduce((sum, plan) => sum + _num(plan.planQty), 0);
    }

    async function _upsertPlanCell(base, date, qty, note = '') {
        const records = _recordsForCell(base, date);
        const data = {
            date,
            customer: base.customer || '',
            carModel: base.carModel || '',
            partName: base.partName || '',
            color: base.color || '',
            packUnit: base.packUnit || '',
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
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>납품 계획</h3>
                        <p>납품 스케쥴, 계획·납품·미납과 공정별 부족 현황을 관리합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.openAddModal()">
                            <span class="material-symbols-outlined">grid_on</span> 계획 등록
                        </button>
                        <button class="btn btn-secondary" onclick="SalesDeliveryPlanModule.openSingleModal()">
                            <span class="material-symbols-outlined">add</span> 단건 등록
                        </button>
                        <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.openExcelUploadModal()">
                            <span class="material-symbols-outlined">upload_file</span> 엑셀 업로드
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="sdpStart" value="${start}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="sdpEnd" value="${end}">
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
                    <div class="form-group">
                        <label class="form-label">품명</label>
                        <input type="text" class="form-input" id="sdpKeyword" placeholder="품명 또는 컬러">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="sdpStats"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">event_note</span> 납품 계획/부족 현황</h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">
                            녹색: 계획 대비 납품 완료 · 노랑: 미납 · 빨강: 부족
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

    function search() {
        const start = document.getElementById('sdpStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpEnd')?.value || _addDays(start, 30);
        const customer = _norm(document.getElementById('sdpCustomerFilter')?.value);
        const car = _norm(document.getElementById('sdpCarFilter')?.value);
        const keyword = _norm(document.getElementById('sdpKeyword')?.value);
        const days = _days(start, end);

        let plans = Storage.getByDateRange(STORE, start, end);
        if (customer) plans = plans.filter(p => _norm(_customerOf(p)) === customer);
        if (car) plans = plans.filter(p => _norm(p.carModel) === car);
        if (keyword) {
            plans = plans.filter(p =>
                _norm(p.partName).includes(keyword) ||
                _norm(p.color).includes(keyword)
            );
        }

        const rows = _buildRows(plans, days, start, end);
        _lastRows = rows;
        _lastDays = days;
        _renderStats(rows);
        _renderTable(rows, days);
    }

    function _buildRows(plans, days, start, end) {
        const deliveries = Storage.getByDateRange(DB.STORES.SALES_DELIVERY, start, end);
        const map = {};

        plans.forEach(plan => {
            const key = [
                plan.customer || '',
                plan.carModel || '',
                plan.partName || '',
                plan.color || '',
                plan.packUnit || ''
            ].join('||');
            if (!map[key]) {
                const product = _findProduct(plan);
                map[key] = {
                    key,
                    ids: [],
                    customer: plan.customer || product?.customer || '',
                    carModel: plan.carModel || product?.carModel || '',
                    partName: plan.partName || '',
                    color: plan.color || product?.color || '',
                    packUnit: _packUnitFromProduct(product, plan.packUnit),
                    product,
                    processEnd: _endProcess(product),
                    planByDate: {},
                    deliveryByDate: {},
                    totalPlan: 0,
                    delivered: 0
                };
            }
            const row = map[key];
            row.ids.push(plan.id);
            row.totalPlan += _num(plan.planQty);
            row.planByDate[plan.date] = (row.planByDate[plan.date] || 0) + _num(plan.planQty);
        });

        Object.values(map).forEach(row => {
            deliveries.filter(d => _matches(d, row)).forEach(d => {
                const qty = _num(d.qty ?? d.quantity);
                row.delivered += qty;
                row.deliveryByDate[d.date] = (row.deliveryByDate[d.date] || 0) + qty;
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

        return Object.values(map).sort((a, b) =>
            a.customer.localeCompare(b.customer, 'ko') ||
            a.carModel.localeCompare(b.carModel, 'ko') ||
            a.partName.localeCompare(b.partName, 'ko')
        );
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

    function _dayCell(row, day) {
        const plan = row.planByDate[day] || 0;
        const delivered = row.deliveryByDate[day] || 0;
        const past = day < UIUtils.today();
        const info = _dayColumnInfo(day);
        const bg = !plan && !delivered
            ? (info.className === 'sdp-red-col' ? 'rgba(254,226,226,0.55)' : (info.className === 'sdp-sat-col' ? 'rgba(219,234,254,0.45)' : 'transparent'))
            : delivered >= plan && plan > 0
            ? 'rgba(16,185,129,0.16)'
            : past && plan > delivered
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(245,158,11,0.14)';
        return `
            <td onclick="SalesDeliveryPlanModule.handleDayCellClick(event,'${_js(row.key)}','${day}')"
                draggable="${plan > 0 ? 'true' : 'false'}"
                ondragstart="SalesDeliveryPlanModule.startPlanDrag(event,'${_js(row.key)}','${day}')"
                ondragover="SalesDeliveryPlanModule.overPlanDrop(event,'${_js(row.key)}','${day}')"
                ondragleave="SalesDeliveryPlanModule.leavePlanDrop(event)"
                ondrop="SalesDeliveryPlanModule.dropPlan(event,'${_js(row.key)}','${day}')"
                ondragend="SalesDeliveryPlanModule.endPlanDrag(event)"
                title="클릭해서 납품 계획 수량 입력 / 드래그해서 같은 품목 날짜로 이동"
                class="${info.className} sdp-plan-day-cell ${plan > 0 ? 'sdp-plan-draggable' : ''}"
                style="min-width:42px;background:${bg};text-align:center;font-size:10px;cursor:pointer;padding:3px 4px;">
                ${plan ? `<div style="font-weight:800;">${_fmt(plan)}</div>` : ''}
                ${delivered ? `<div style="color:var(--accent-green);font-weight:700;">납 ${_fmt(delivered)}</div>` : ''}
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
            else groups.push({ month, count: 1 });
        });
        return groups.map(g => `<th colspan="${g.count}" style="text-align:center;">${g.month}</th>`).join('');
    }

    function _renderTable(rows, days) {
        const wrap = document.getElementById('sdpTableWrap');
        if (!rows.length) {
            wrap.innerHTML = `<div style="padding:46px;text-align:center;color:var(--text-muted);">등록된 납품 계획이 없습니다.</div>`;
            return;
        }

        wrap.innerHTML = `
            <table class="data-table sdp-status-table" style="min-width:${560 + days.length * 38}px;font-size:10px;">
                <thead>
                    <tr>
                        <th colspan="9"></th>
                        ${_monthHeaderCells(days)}
                        <th rowspan="2">작업</th>
                    </tr>
                    <tr>
                        <th>차종</th>
                        <th>품명</th>
                        <th>컬러</th>
                        <th>포장</th>
                        <th>계획<br><span style="font-size:9px;font-weight:600;">(납품/미납)</span></th>
                        <th>사출<br>현재고/필요량</th>
                        <th>도장<br>현재고/필요량</th>
                        <th>레이져<br>현재고/필요량</th>
                        <th>완제품<br>수량</th>
                        ${days.map(d => {
                            const info = _dayColumnInfo(d);
                            return `<th class="${info.className}" style="min-width:38px;text-align:center;"><div>${Number(d.slice(8))}</div><div style="font-size:9px;font-weight:600;">${info.weekday}</div></th>`;
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr style="${row.hasShortage ? 'background:rgba(239,68,68,0.035);' : ''}">
                            <td>${_esc(row.carModel || '-')}</td>
                            <td style="font-weight:800;">${_esc(row.partName || '-')}</td>
                            <td>${_esc(row.color || '-')}</td>
                            <td>${_esc(row.packUnit || '-')}</td>
                            <td class="sdp-plan-summary">
                                <div class="sdp-plan-main">${_fmt(row.totalPlan)}</div>
                                <div class="sdp-plan-sub">
                                    <span class="sdp-plan-delivered">${_fmt(row.delivered)}</span>
                                    <span style="color:var(--text-muted);"> / </span>
                                    <span class="sdp-plan-remaining" style="color:${row.remaining > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${_fmt(row.remaining)}</span>
                                </div>
                            </td>
                            <td>${_stockNeedCell(row.injectionStock, row.injectionShortage, !row.injectionHasData)}</td>
                            <td>${_stockNeedCell(row.finishedStock + row.shippingStandby, row.paintShortage, !_isPaintEnd(row))}</td>
                            <td>${_stockNeedCell(row.finishedStock + row.shippingStandby + row.laserStandby, row.laserShortage, !_isLaserEnd(row))}</td>
                            <td style="font-weight:700;">${row.finishedHasData ? _fmt(row.finishedStock) : '-'}</td>
                            ${days.map(d => _dayCell(row, d)).join('')}
                            <td>
                                <button class="btn btn-sm btn-outline" onclick="SalesDeliveryPlanModule.editGroup('${_js(row.key)}')">수정</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
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
        return {
            date: document.getElementById('sdpDate')?.value || '',
            customer: document.getElementById('sdpCustomer')?.value.trim() || '',
            carModel: document.getElementById('sdpCarModel')?.value.trim() || '',
            partName: document.getElementById('sdpPartName')?.value.trim() || '',
            color: document.getElementById('sdpColor')?.value.trim() || '',
            packUnit: document.getElementById('sdpPackUnit')?.value.trim() || '',
            planQty: _num(document.getElementById('sdpPlanQty')?.value),
            note: document.getElementById('sdpNote')?.value.trim() || ''
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
        const customers = [
            ...products.map(p => p.customer),
            ...(Storage.getAll(DB.STORES.SALES_DELIVERY) || []).map(d => d.customer),
            ...(Storage.getAll(STORE) || []).map(d => d.customer)
        ];
        const start = document.getElementById('sdpStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpEnd')?.value || _addDays(start, 30);

        return `
            <div style="padding:6px 8px;border:1px solid var(--border-color);background:#fff;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">
                납품처와 차종을 선택한 뒤, 날짜 칸을 클릭해서 수량을 입력하세요. 기존 계획이 있는 칸은 수량이 표시되며, 빈칸으로 저장하면 해당 계획은 삭제됩니다.
            </div>
            <div class="filter-bar" style="flex-wrap:wrap;gap:6px;margin-bottom:8px;padding:8px;font-size:11px;">
                <div class="form-group">
                    <label class="form-label">시작일</label>
                    <input type="date" class="form-input" id="sdpGridStart" value="${_esc(start)}" onchange="SalesDeliveryPlanModule.renderGridEditorRows()">
                </div>
                <div class="form-group">
                    <label class="form-label">종료일</label>
                    <input type="date" class="form-input" id="sdpGridEnd" value="${_esc(end)}" onchange="SalesDeliveryPlanModule.renderGridEditorRows()">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <select class="form-select" id="sdpGridCustomer" onchange="SalesDeliveryPlanModule.onGridCustomerChange()">
                        ${_selectOptions(customers, '', '-- 납품처 선택 --')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="sdpGridCar" onchange="SalesDeliveryPlanModule.renderGridEditorRows()">
                        ${_selectOptions(products.map(p => p.carModel), '', '-- 차종 선택 --')}
                    </select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-outline" onclick="SalesDeliveryPlanModule.renderGridEditorRows()">
                        <span class="material-symbols-outlined">refresh</span> 목록 적용
                    </button>
                </div>
            </div>
            <div id="sdpGridEditorBody" class="data-table-wrapper" style="max-height:calc(100vh - 210px);overflow:auto;border:1px solid #94a3b8;border-radius:0;"></div>
        `;
    }

    function _gridInputStyle(qty) {
        return [
            'width:100%',
            'height:17px',
            'border:0',
            'border-radius:0',
            'text-align:right',
            'font-weight:800',
            'font-size:10px',
            'line-height:17px',
            'padding:0 2px',
            qty > 0 ? 'background:rgba(59,130,246,0.08);color:var(--accent-blue)' : 'background:transparent;color:var(--text-primary)'
        ].join(';');
    }

    function renderGridEditorRows() {
        const start = document.getElementById('sdpGridStart')?.value || UIUtils.today();
        const end = document.getElementById('sdpGridEnd')?.value || _addDays(start, 30);
        const customer = document.getElementById('sdpGridCustomer')?.value || '';
        const car = document.getElementById('sdpGridCar')?.value || '';
        const days = _days(start, end);
        const dayInfos = days.map(_dayColumnInfo);

        const products = _productsByCustomer(customer)
            .filter(p => p.partName || p.name)
            .filter(p => !car || _norm(p.carModel) === _norm(car))
            .sort((a, b) =>
                String(a.customer || '').localeCompare(String(b.customer || ''), 'ko') ||
                String(a.carModel || '').localeCompare(String(b.carModel || ''), 'ko') ||
                String(a.partName || a.name || '').localeCompare(String(b.partName || b.name || ''), 'ko')
            );

        _gridRows = products.map(p => _productBase(p, customer));
        const wrap = document.getElementById('sdpGridEditorBody');
        if (!wrap) return;

        if (!_gridRows.length) {
            wrap.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-muted);">선택 조건에 맞는 제품이 없습니다.</div>`;
            return;
        }

        wrap.innerHTML = `
            <table class="data-table sdp-grid-entry-table" style="min-width:${332 + dayInfos.length * 34}px;font-size:10px;">
                <thead>
                    <tr>
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
                        <tr>
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
                                            style="${_gridInputStyle(qty)}">
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function openGridModal() {
        UIUtils.showModal('납품 계획 등록', _gridEditorHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveGridPlans()">저장</button>
        `, 'xxl');
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

        UIUtils.closeModal();
        UIUtils.toast(`${changed}개 납품 계획 셀이 저장되었습니다.`, 'success');
        search();
    }

    function openCellModal(rowKey, date) {
        const row = _lastRows.find(r => r.key === rowKey);
        if (!row) return;
        const qty = _planQtyForCell(row, date);
        UIUtils.showModal('납품 계획 수량 입력', `
            <div style="display:grid;grid-template-columns:110px 1fr;gap:8px 12px;font-size:0.9rem;margin-bottom:14px;">
                <div style="color:var(--text-muted);">납품일</div><div style="font-weight:800;">${_esc(date)}</div>
                <div style="color:var(--text-muted);">납품처</div><div>${_esc(row.customer || '-')}</div>
                <div style="color:var(--text-muted);">차종</div><div>${_esc(row.carModel || '-')}</div>
                <div style="color:var(--text-muted);">품명</div><div style="font-weight:800;">${_esc(row.partName || '-')}</div>
            </div>
            <div class="form-group">
                <label class="form-label">계획수량</label>
                <input type="number" min="0" class="form-input" id="sdpCellQty" value="${qty || ''}" placeholder="" style="text-align:right;font-weight:800;">
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">0 또는 빈칸으로 저장하면 해당 날짜의 계획이 삭제됩니다.</div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SalesDeliveryPlanModule.saveCellPlan('${_js(rowKey)}','${date}')">저장</button>
        `, 'sm');
        setTimeout(() => document.getElementById('sdpCellQty')?.select(), 0);
    }

    async function saveCellPlan(rowKey, date) {
        const row = _lastRows.find(r => r.key === rowKey);
        if (!row) return;
        const qty = _num(document.getElementById('sdpCellQty')?.value);
        await _upsertPlanCell(row, date, qty);
        UIUtils.closeModal();
        UIUtils.toast('납품 계획 수량이 저장되었습니다.', 'success');
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
    let _xlsxLastBuffer = null; // 재파싱용 원본 버퍼

    // ── 프리셋 저장/로드 ──
    function _getXlsxPresets() {
        try { return JSON.parse(localStorage.getItem(_XLSX_PRESET_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function _saveXlsxPreset(customer, cfg) {
        if (!customer) return;
        const presets = _getXlsxPresets();
        presets[customer] = { ...cfg, customer, savedAt: new Date().toISOString() };
        localStorage.setItem(_XLSX_PRESET_KEY, JSON.stringify(presets));
    }
    function _deleteXlsxPreset(customer) {
        const presets = _getXlsxPresets();
        delete presets[customer];
        localStorage.setItem(_XLSX_PRESET_KEY, JSON.stringify(presets));
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
    }

    // ── 납품처 변경 → 프리셋 로드 ──
    function onXlsxCustomerChange() {
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        const presets = _getXlsxPresets();
        const preset = presets[customer];
        const badge = document.getElementById('xlsxPresetBadge');
        const delBtn = document.getElementById('xlsxPresetDelBtn');
        if (preset) {
            _applyXlsxConfig(preset);
            if (badge) badge.style.display = '';
            if (delBtn) delBtn.style.display = '';
        } else {
            const def = _defaultXlsxConfig();
            def.companyFilter = customer;
            _applyXlsxConfig(def);
            if (badge) badge.style.display = 'none';
            if (delBtn) delBtn.style.display = 'none';
        }
        // 파일이 이미 선택되어 있으면 설정 변경 후 재파싱
        if (_xlsxLastBuffer) {
            try { _parseDeliveryExcel(_xlsxLastBuffer); } catch (e) { /* ignore */ }
        }
    }

    function openExcelUploadModal() {
        _xlsxParsedData = null;
        _xlsxLastBuffer = null;
        const presets = _getXlsxPresets();
        const presetKeys = Object.keys(presets);
        const allCustomers = _unique([
            ..._products().map(p => _customerOf(p)),
            ...(Storage.getAll(STORE) || []).map(r => _customerOf(r)),
            ...presetKeys
        ]);
        const def = _defaultXlsxConfig();

        const customerOptions = allCustomers.map(c =>
            `<option value="${_esc(c)}">${presets[c] ? '⭐ ' : ''}${_esc(c)}</option>`
        ).join('');

        const html = `
            <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;">
                <div class="form-group" style="flex:1;min-width:180px;">
                    <label class="form-label">납품처 <span style="font-size:0.73rem;color:var(--text-muted);">⭐ = 프리셋 저장됨</span></label>
                    <select class="form-select" id="xlsxCustomerSel" onchange="SalesDeliveryPlanModule.onXlsxCustomerChange()">
                        <option value="">-- 납품처 선택 --</option>
                        ${customerOptions}
                    </select>
                </div>
                <span id="xlsxPresetBadge" style="display:none;background:rgba(16,185,129,0.15);color:var(--accent-green);font-size:0.75rem;padding:4px 10px;border-radius:20px;white-space:nowrap;margin-bottom:4px;border:1px solid rgba(16,185,129,0.3);">⭐ 프리셋 적용됨</span>
                <button id="xlsxPresetDelBtn" class="btn btn-sm" style="display:none;color:var(--accent-red);border:1px solid var(--accent-red);margin-bottom:4px;" onclick="SalesDeliveryPlanModule._deleteCurrentPreset()">
                    <span class="material-symbols-outlined" style="font-size:0.85rem;">delete</span> 프리셋 삭제
                </button>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label">엑셀 파일 선택 <span style="color:var(--accent-red)">*</span></label>
                <input type="file" class="form-input" id="xlsxFileInput" accept=".xlsx,.xls"
                    onchange="SalesDeliveryPlanModule._handleExcelFile(this)">
            </div>

            <details id="xlsxConfigDetails" style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px;">
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
                            <label class="form-label" style="font-size:0.74rem;">업체명 필터 키워드</label>
                            <input class="form-input" style="padding:5px 8px;font-size:0.82rem;" id="xlsxCompanyFilter" value="${def.companyFilter}" placeholder="KC 케미칼">
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
                    <div style="display:flex;align-items:center;gap:10px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;">
                            <input type="checkbox" id="xlsxSavePreset" checked> 이 설정을 납품처 프리셋으로 저장
                        </label>
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
                    <div id="xlsxPreviewTable" style="overflow-x:auto;max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;"></div>
                </div>
            </div>
        `;
        UIUtils.showModal('엑셀 업로드 — 납품계획 자동입력', html,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-primary" id="xlsxConfirmBtn" style="display:none;" onclick="SalesDeliveryPlanModule._confirmExcelImport()">
                 <span class="material-symbols-outlined">playlist_add</span> 납품계획 등록
             </button>`, 'xl');
    }

    function _deleteCurrentPreset() {
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        if (!customer) return;
        UIUtils.confirm(`"${customer}" 프리셋을 삭제하시겠습니까?`, () => {
            _deleteXlsxPreset(customer);
            UIUtils.toast(`"${customer}" 프리셋이 삭제되었습니다.`, 'success');
            const badge = document.getElementById('xlsxPresetBadge');
            const delBtn = document.getElementById('xlsxPresetDelBtn');
            if (badge) badge.style.display = 'none';
            if (delBtn) delBtn.style.display = 'none';
            // 납품처 옵션에서 ⭐ 제거
            const opt = document.querySelector(`#xlsxCustomerSel option[value="${customer}"]`);
            if (opt) opt.textContent = customer;
        });
    }

    function _reparse() {
        if (!_xlsxLastBuffer) { UIUtils.toast('먼저 파일을 선택하세요.', 'warning'); return; }
        try { _parseDeliveryExcel(_xlsxLastBuffer); }
        catch (e) { UIUtils.toast(`파싱 오류: ${e.message}`, 'error'); }
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

        for (let ri = headerRowTarget + 1; ri < rawData.length; ri++) {
            const row = rawData[ri];
            const companyCell   = companyColIdx >= 0 ? _norm(String(row[companyColIdx] || '')) : '';
            const partNameExcel = partNameColIdx >= 0 ? String(row[partNameColIdx] || '').trim() : '';
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
            if (statusEl) statusEl.innerHTML =
                `<span style="color:var(--accent-orange);">조건에 맞는 행이 없습니다.</span>` +
                `<span style="color:var(--text-muted);font-size:0.78rem;margin-left:6px;">업체명 필터: "${cfg.companyFilter}" / 구분 키워드: "${cfg.categoryKeyword}" / 시트: ${sheetName}</span>`;
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

        // 프리셋 저장 여부 확인
        const savePreset = document.getElementById('xlsxSavePreset')?.checked;
        const customer = document.getElementById('xlsxCustomerSel')?.value || '';
        if (savePreset && customer) {
            _saveXlsxPreset(customer, _readXlsxConfig());
            UIUtils.toast(`"${customer}" 파싱 프리셋이 저장되었습니다.`, 'info');
        }

        const confirmBtn = document.getElementById('xlsxConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> 등록 중...';
        }

        let insertCount = 0;
        try {
            for (const row of _xlsxParsedData) {
                const base = {
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
                    insertCount++;
                }
            }
        } catch (err) {
            UIUtils.toast(`등록 중 오류: ${err.message}`, 'error');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span> 납품계획 등록';
            }
            return;
        }

        _xlsxParsedData = null;
        _xlsxLastBuffer = null;
        UIUtils.closeModal();
        UIUtils.toast(`납품계획 ${insertCount}건 등록 완료!`, 'success');
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
        openAddModal,
        openGridModal,
        openSingleModal,
        onGridCustomerChange,
        onMainCustomerChange,
        renderGridEditorRows,
        saveGridPlans,
        openCellModal,
        saveCellPlan,
        handleDayCellClick,
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
        openExcelUploadModal,
        onXlsxCustomerChange,
        _handleExcelFile,
        _parseDeliveryExcel,
        _reparse,
        _deleteCurrentPreset,
        _confirmExcelImport
    };
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
