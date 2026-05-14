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

    function render(container) {
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
                <input type="text" class="form-input" id="sdFilterCustomer" placeholder="납품처 검색">
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
        const customer = document.getElementById('sdFilterCustomer').value.trim();

        let data = Storage.getByDateRange(STORE, start, end);
        if (customer) data = data.filter(d => d.customer.includes(customer));
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
        _renderPaintLotList
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
