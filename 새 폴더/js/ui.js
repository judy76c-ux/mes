/**
 * UI 컴포넌트 모듈
 * 화면 렌더링 및 이벤트 처리
 */

const UI = (function() {
    // 현재 상태
    let state = {
        selectedProduct: null,
        currentCounts: {},
        currentPage: 'inspection'
    };

    // DOM 요소 캐시
    const elements = {};

    // 초기화
    function init() {
        cacheElements();
        setupEventListeners();
        renderAll();
        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    // DOM 요소 캐시
    function cacheElements() {
        // 네비게이션
        elements.navBtns = document.querySelectorAll('.nav-btn');
        elements.pages = document.querySelectorAll('.page');

        // 검사 화면
        elements.productList = document.getElementById('productList');
        elements.selectedProductName = document.getElementById('selectedProductName');
        elements.defectButtons = document.getElementById('defectButtons');
        elements.currentCounts = document.getElementById('currentCounts');
        elements.saveBtn = document.getElementById('saveBtn');
        elements.resetBtn = document.getElementById('resetBtn');

        // 관리 화면
        elements.tabBtns = document.querySelectorAll('.tab-btn');
        elements.tabContents = document.querySelectorAll('.tab-content');
        elements.carModelInput = document.getElementById('carModelInput');
        elements.partNameInput = document.getElementById('partNameInput');
        elements.colorInput = document.getElementById('colorInput');
        elements.addProductBtn = document.getElementById('addProductBtn');
        elements.productsTable = document.getElementById('productsTable');
        elements.exportProductsBtn = document.getElementById('exportProductsBtn');
        elements.importProductsBtn = document.getElementById('importProductsBtn');
        elements.importProductsFile = document.getElementById('importProductsFile');
        elements.newDefectInput = document.getElementById('newDefectInput');
        elements.addDefectBtn = document.getElementById('addDefectBtn');
        elements.defectsTable = document.getElementById('defectsTable');
        elements.spreadsheetId = document.getElementById('spreadsheetId');
        elements.apiKey = document.getElementById('apiKey');
        elements.ollamaServer = document.getElementById('ollamaServer');
        elements.ollamaModel = document.getElementById('ollamaModel');
        elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        elements.testConnectionBtn = document.getElementById('testConnectionBtn');
        elements.testOllamaBtn = document.getElementById('testOllamaBtn');
        elements.connectionStatus = document.getElementById('connectionStatus');
        elements.ollamaStatus = document.getElementById('ollamaStatus');

        // 리포트 화면
        elements.reportStartDate = document.getElementById('reportStartDate');
        elements.reportEndDate = document.getElementById('reportEndDate');
        elements.reportType = document.getElementById('reportType');
        elements.generateReportBtn = document.getElementById('generateReportBtn');
        elements.exportReportBtn = document.getElementById('exportReportBtn');
        elements.reportTableBody = document.getElementById('reportTableBody');
        elements.reportSummary = document.getElementById('reportSummary');

        // 대시보드 화면
        elements.dashStartDate = document.getElementById('dashStartDate');
        elements.dashEndDate = document.getElementById('dashEndDate');
        elements.refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
        elements.totalInspections = document.getElementById('totalInspections');
        elements.totalDefects = document.getElementById('totalDefects');
        elements.defectRate = document.getElementById('defectRate');

        // 모달
        elements.modal = document.getElementById('modal');
        elements.modalTitle = document.getElementById('modalTitle');
        elements.modalBody = document.getElementById('modalBody');
    }

    // 이벤트 리스너 설정
    function setupEventListeners() {
        // 네비게이션
        elements.navBtns.forEach(btn => {
            btn.addEventListener('click', () => switchPage(btn.dataset.page));
        });

        // 검사 화면
        elements.saveBtn.addEventListener('click', saveCounts);
        elements.resetBtn.addEventListener('click', resetCounts);

        // 관리 화면 - 탭
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // 관리 화면 - 제품
        elements.addProductBtn.addEventListener('click', addProduct);
        elements.carModelInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') elements.partNameInput.focus();
        });
        elements.partNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') elements.colorInput.focus();
        });
        elements.colorInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addProduct();
        });
        elements.exportProductsBtn.addEventListener('click', exportProducts);
        elements.importProductsBtn.addEventListener('click', () => elements.importProductsFile.click());
        elements.importProductsFile.addEventListener('change', importProducts);

        // 관리 화면 - 불량 항목
        elements.addDefectBtn.addEventListener('click', addDefect);
        elements.newDefectInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addDefect();
        });

        // 관리 화면 - 설정
        elements.saveSettingsBtn.addEventListener('click', saveSettings);
        elements.testConnectionBtn.addEventListener('click', testConnection);
        if (elements.testOllamaBtn) {
            elements.testOllamaBtn.addEventListener('click', () => SettingsModule.testOllama());
        }

        // 리포트 화면
        elements.generateReportBtn.addEventListener('click', generateReport);
        elements.exportReportBtn.addEventListener('click', exportReport);
        setDefaultDates();

        // 대시보드 화면
        elements.refreshDashboardBtn.addEventListener('click', refreshDashboard);

        // 모달 닫기
        document.querySelector('.modal-close').addEventListener('click', closeModal);
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });
    }

    // 페이지 전환
    function switchPage(pageName) {
        state.currentPage = pageName;

        elements.navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        });

        elements.pages.forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        // 페이지 진입 시 데이터 새로고침
        if (pageName === 'report') {
            renderReport();
        } else if (pageName === 'dashboard') {
            refreshDashboard();
        }
    }

    // 탭 전환
    function switchTab(tabName) {
        elements.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // 설정 탭 진입 시 현재 설정 로드
        if (tabName === 'settings') {
            loadSettings();
        }
    }

    // 전체 렌더링
    function renderAll() {
        renderProducts();
        renderDefects();
        renderProductsTable();
        renderDefectsTable();
    }

    // 제품 목록 렌더링 (검사 화면) - 계층적 표시
    function renderProducts() {
        const grouped = DataManager.ProductManager.getGrouped();
        const carModels = Object.keys(grouped);
        
        if (carModels.length === 0) {
            elements.productList.innerHTML = '<p class="no-data">등록된 제품이 없습니다. 관리에서 제품을 추가하세요.</p>';
            return;
        }

        let html = '';
        
        carModels.forEach(carModel => {
            html += `<div class="product-group">`;
            html += `<div class="car-model-header">${carModel}</div>`;
            
            const partNames = Object.keys(grouped[carModel]);
            partNames.forEach(partName => {
                html += `<div class="part-group">`;
                html += `<div class="part-header">${partName}</div>`;
                html += `<div class="color-list">`;
                
                grouped[carModel][partName].forEach(product => {
                    const displayName = DataManager.ProductManager.getDisplayName(product);
                    const isSelected = state.selectedProduct?.id === product.id;
                    html += `
                        <button class="product-btn ${isSelected ? 'selected' : ''}" 
                                data-id="${product.id}" 
                                data-name="${displayName}">
                            ${product.color || displayName}
                        </button>
                    `;
                });
                
                html += `</div></div>`;
            });
            
            html += `</div>`;
        });

        elements.productList.innerHTML = html;

        // 이벤트 바인딩
        elements.productList.querySelectorAll('.product-btn').forEach(btn => {
            btn.addEventListener('click', () => selectProduct(btn.dataset.id, btn.dataset.name));
        });
    }

    // 불량 버튼 렌더링
    function renderDefects() {
        const defects = DataManager.DefectManager.getAll();
        
        if (defects.length === 0) {
            elements.defectButtons.innerHTML = '<p class="no-data">등록된 불량 항목이 없습니다. 관리에서 불량 항목을 추가하세요.</p>';
            return;
        }

        elements.defectButtons.innerHTML = defects.map(defect => `
            <button class="defect-btn" data-id="${defect.id}" data-name="${defect.name}">
                <span class="defect-name">${defect.name}</span>
                <span class="defect-count">${state.currentCounts[defect.id] || 0}</span>
            </button>
        `).join('');

        // 이벤트 바인딩
        elements.defectButtons.querySelectorAll('.defect-btn').forEach(btn => {
            btn.addEventListener('click', () => incrementCount(btn.dataset.id, btn.dataset.name));
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                decrementCount(btn.dataset.id);
            });
        });
    }

    // 제품 선택
    function selectProduct(id, name) {
        state.selectedProduct = { id, name };
        elements.selectedProductName.textContent = name;
        renderProducts(); // 선택 상태 업데이트
        resetCounts();
    }

    // 카운트 증가
    function incrementCount(defectId, defectName) {
        if (!state.selectedProduct) {
            showModal('알림', '<p>먼저 제품을 선택하세요.</p>');
            return;
        }

        state.currentCounts[defectId] = (state.currentCounts[defectId] || 0) + 1;
        updateCountDisplay(defectId);
    }

    // 카운트 감소
    function decrementCount(defectId) {
        if (state.currentCounts[defectId] && state.currentCounts[defectId] > 0) {
            state.currentCounts[defectId]--;
            updateCountDisplay(defectId);
        }
    }

    // 카운트 표시 업데이트
    function updateCountDisplay(defectId) {
        const btn = elements.defectButtons.querySelector(`[data-id="${defectId}"]`);
        if (btn) {
            btn.querySelector('.defect-count').textContent = state.currentCounts[defectId] || 0;
        }
        renderCurrentCounts();
    }

    // 현재 집계 표시
    function renderCurrentCounts() {
        const defects = DataManager.DefectManager.getAll();
        const counts = defects
            .filter(d => state.currentCounts[d.id] > 0)
            .map(d => `
                <div class="count-item">
                    <span>${d.name}</span>
                    <span>${state.currentCounts[d.id]}</span>
                </div>
            `).join('');

        elements.currentCounts.innerHTML = counts || '<p class="no-data">집계된 불량이 없습니다.</p>';
    }

    // 저장
    function saveCounts() {
        if (!state.selectedProduct) {
            showModal('알림', '<p>먼저 제품을 선택하세요.</p>');
            return;
        }

        const defects = DataManager.DefectManager.getAll();
        const records = defects
            .filter(d => state.currentCounts[d.id] > 0)
            .map(d => ({
                productId: state.selectedProduct.id,
                productName: state.selectedProduct.name,
                defectId: d.id,
                defectName: d.name,
                count: state.currentCounts[d.id]
            }));

        if (records.length === 0) {
            showModal('알림', '<p>저장할 불량 데이터가 없습니다.</p>');
            return;
        }

        DataManager.RecordManager.addBatch(records);
        showModal('저장 완료', `<p>${records.length}건의 불량 기록이 저장되었습니다.</p>`);
        resetCounts();
    }

    // 초기화
    function resetCounts() {
        state.currentCounts = {};
        renderDefects();
        renderCurrentCounts();
    }

    // 관리 - 제품 테이블 렌더링
    function renderProductsTable() {
        const products = DataManager.ProductManager.getAll();

        if (products.length === 0) {
            elements.productsTable.innerHTML = '<p class="no-data">등록된 제품이 없습니다.</p>';
            return;
        }

        elements.productsTable.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>차종</th>
                        <th>품명</th>
                        <th>컬러</th>
                        <th>등록일</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td>${p.carModel || p.name || '-'}</td>
                            <td>${p.partName || '-'}</td>
                            <td>${p.color || '-'}</td>
                            <td>${new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
                            <td>
                                <button class="delete-btn" data-id="${p.id}">삭제</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // 삭제 이벤트
        elements.productsTable.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
        });
    }

    // 관리 - 불량 항목 테이블 렌더링
    function renderDefectsTable() {
        const defects = DataManager.DefectManager.getAll();

        if (defects.length === 0) {
            elements.defectsTable.innerHTML = '<p class="no-data">등록된 불량 항목이 없습니다.</p>';
            return;
        }

        elements.defectsTable.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>불량 항목명</th>
                        <th>등록일</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${defects.map(d => `
                        <tr>
                            <td>${d.name}</td>
                            <td>${new Date(d.createdAt).toLocaleDateString('ko-KR')}</td>
                            <td>
                                <button class="delete-btn" data-id="${d.id}">삭제</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // 삭제 이벤트
        elements.defectsTable.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteDefect(btn.dataset.id));
        });
    }

    // 제품 추가
    function addProduct() {
        const carModel = elements.carModelInput.value.trim();
        const partName = elements.partNameInput.value.trim();
        const color = elements.colorInput.value.trim();
        
        if (!carModel) {
            showModal('알림', '<p>차종을 입력하세요.</p>');
            return;
        }
        if (!partName) {
            showModal('알림', '<p>품명을 입력하세요.</p>');
            return;
        }
        if (!color) {
            showModal('알림', '<p>컬러를 입력하세요.</p>');
            return;
        }

        try {
            DataManager.ProductManager.add(carModel, partName, color);
            elements.carModelInput.value = '';
            elements.partNameInput.value = '';
            elements.colorInput.value = '';
            elements.carModelInput.focus();
            renderProducts();
            renderProductsTable();
        } catch (error) {
            showModal('오류', `<p>${error.message}</p>`);
        }
    }

    // 제품 삭제
    function deleteProduct(id) {
        if (confirm('정말 삭제하시겠습니까?')) {
            DataManager.ProductManager.delete(id);
            renderProducts();
            renderProductsTable();
        }
    }

    // 불량 항목 추가
    function addDefect() {
        const name = elements.newDefectInput.value.trim();
        if (!name) {
            showModal('알림', '<p>불량 항목명을 입력하세요.</p>');
            return;
        }

        try {
            DataManager.DefectManager.add(name);
            elements.newDefectInput.value = '';
            renderDefects();
            renderDefectsTable();
        } catch (error) {
            showModal('오류', `<p>${error.message}</p>`);
        }
    }

    // 불량 항목 삭제
    function deleteDefect(id) {
        if (confirm('정말 삭제하시겠습니까?')) {
            DataManager.DefectManager.delete(id);
            renderDefects();
            renderDefectsTable();
        }
    }

    // 제품 내보내기
    function exportProducts() {
        const products = DataManager.ProductManager.getAll();
        if (products.length === 0) {
            showModal('알림', '<p>내보낼 제품이 없습니다.</p>');
            return;
        }
        Storage.exportProducts();
    }

    // 제품 가져오기
    function importProducts(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            const fileType = file.name.endsWith('.csv') ? 'csv' : 'json';
            
            const result = Storage.importProducts(content, fileType);
            
            if (result.success) {
                showModal('가져오기 완료', `<p>추가: ${result.added}건, 건너뜀(중복): ${result.skipped}건</p>`);
                renderProducts();
                renderProductsTable();
            } else {
                showModal('오류', `<p>${result.error}</p>`);
            }
            
            // 파일 입력 초기화
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    // 설정 로드
    function loadSettings() {
        const config = Storage.getConfig();
        elements.spreadsheetId.value = config.spreadsheetId || '';
        elements.apiKey.value = config.apiKey || '';
    }

    // 설정 저장
    function saveSettings() {
        Storage.saveConfig({
            spreadsheetId: elements.spreadsheetId.value.trim(),
            apiKey: elements.apiKey.value.trim()
        });
        showModal('저장 완료', '<p>설정이 저장되었습니다.</p>');
    }

    // 연결 테스트
    async function testConnection() {
        elements.connectionStatus.textContent = '테스트 중...';
        elements.connectionStatus.className = 'status-message';

        try {
            await Storage.testConnection();
            elements.connectionStatus.textContent = '연결 성공!';
            elements.connectionStatus.className = 'status-message success';
        } catch (error) {
            elements.connectionStatus.textContent = error.message;
            elements.connectionStatus.className = 'status-message error';
        }
    }

    // 기본 날짜 설정
    function setDefaultDates() {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        const formatDate = (date) => date.toISOString().split('T')[0];

        elements.reportStartDate.value = formatDate(monthAgo);
        elements.reportEndDate.value = formatDate(today);
        elements.dashStartDate.value = formatDate(monthAgo);
        elements.dashEndDate.value = formatDate(today);
    }

    // 리포트 생성
    function generateReport() {
        const startDate = elements.reportStartDate.value;
        const endDate = elements.reportEndDate.value;
        const type = elements.reportType.value;

        if (!startDate || !endDate) {
            showModal('알림', '<p>날짜를 선택하세요.</p>');
            return;
        }

        let report;
        if (type === 'daily') {
            report = DataManager.ReportGenerator.generateDaily(startDate);
        } else if (type === 'weekly') {
            report = DataManager.ReportGenerator.generateWeekly(startDate);
        } else {
            const start = new Date(startDate);
            report = DataManager.ReportGenerator.generateMonthly(start.getFullYear(), start.getMonth() + 1);
        }

        renderReportContent(report);
    }

    // 리포트 내용 렌더링
    function renderReportContent(report) {
        // 테이블 렌더링
        elements.reportTableBody.innerHTML = report.records.map(r => `
            <tr>
                <td>${r.date}</td>
                <td>${r.productName}</td>
                <td>${r.defectName}</td>
                <td>${r.count}</td>
            </tr>
        `).join('');

        // 요약 렌더링
        elements.reportSummary.innerHTML = `
            <h3>요약</h3>
            <p>총 불량 건수: ${report.summary.totalRecords}건</p>
            <p>총 불량 수량: ${report.summary.totalDefects}개</p>
            <p>생성 일시: ${report.generatedAt}</p>
        `;
    }

    // 리포트 내보내기
    function exportReport() {
        const startDate = elements.reportStartDate.value;
        const endDate = elements.reportEndDate.value;

        const records = DataManager.RecordManager.getByDateRange(startDate, endDate);
        if (records.length === 0) {
            showModal('알림', '<p>내보낼 데이터가 없습니다.</p>');
            return;
        }

        DataManager.exportToCSV(records);
    }

    // 대시보드 새로고침
    function refreshDashboard() {
        const startDate = elements.dashStartDate.value;
        const endDate = elements.dashEndDate.value;

        if (!startDate || !endDate) {
            showModal('알림', '<p>날짜를 선택하세요.</p>');
            return;
        }

        const summary = DataManager.Statistics.getSummary(startDate, endDate);

        // 요약 카드 업데이트
        elements.totalInspections.textContent = summary.totalRecords;
        elements.totalDefects.textContent = summary.totalDefects;
        elements.defectRate.textContent = summary.totalRecords > 0 
            ? DataManager.Statistics.getDefectRate(summary.totalRecords, summary.totalDefects) + '%'
            : '0%';

        // 차트 업데이트
        ChartManager.updateAllCharts(startDate, endDate);
    }

    // 리포트 화면 렌더링
    function renderReport() {
        generateReport();
    }

    // 날짜/시간 업데이트
    function updateDateTime() {
        const now = new Date();
        document.getElementById('currentDate').textContent = now.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    }

    // 모달 표시
    function showModal(title, content) {
        elements.modalTitle.textContent = title;
        elements.modalBody.innerHTML = content;
        elements.modal.classList.add('active');
    }

    // 모달 닫기
    function closeModal() {
        elements.modal.classList.remove('active');
    }

    // 공개 API
    return {
        init,
        showModal,
        closeModal,
        refreshDashboard,
        renderAll
    };
})();
