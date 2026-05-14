/**
 * 영업 관리 모듈 (납품관리, 매입관리, 외주처관리)
 */

// 공통 유틸리티: 컬럼 정의 및 테이블 렌더링
const SalesUtils = {
    renderMain(container, title, desc, onAdd, onExport, filterHTML, tableID, headers) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>${title}</h3>
                        <p>${desc}</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="${onAdd}">
                            <span class="material-symbols-outlined">add</span> 등록
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
        const headers = ['No', '일자', '납품처', '차종', '품명', '수량', '단가', '금액', '비고'];
        SalesUtils.renderMain(container, '납품관리', '납품처별 매출 실적을 관리합니다.', 'SalesDeliveryModule.openAddModal()', 'SalesDeliveryModule.exportData()', filterHTML, 'sdTable', headers);
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
                <div class="stat-card-label">총 납품수량</div>
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

    function fillForm(d = {}) {
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="sdDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="sdCustomer" value="${d.customer || ''}" placeholder="거래처명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" id="sdCarModel" value="${d.carModel || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="sdPartName" value="${d.partName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="sdQty" value="${d.qty || ''}" oninput="SalesDeliveryModule.calcAmount()">
                </div>
                <div class="form-group">
                    <label class="form-label">단가</label>
                    <input type="number" class="form-input" id="sdUnitPrice" value="${d.unitPrice || ''}" oninput="SalesDeliveryModule.calcAmount()">
                </div>
                <div class="form-group">
                    <label class="form-label">금액 (자동)</label>
                    <input type="number" class="form-input" id="sdAmount" value="${d.amount || ''}" readonly style="background:var(--bg-secondary);">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="sdNote">${d.note || ''}</textarea>
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
        UIUtils.showModal('납품 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.customer || !data.qty) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('납품 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="SalesDeliveryModule.saveEdit('${id}')">저장</button>`, 'lg');
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
        const headers = ['일자', '납품처', '차종', '품명', '수량', '단가', '금액', '비고'];
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
        exportData
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