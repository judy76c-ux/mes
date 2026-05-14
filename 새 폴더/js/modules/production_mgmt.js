/**
 * 생산 관리 모듈 (작업조건 관리, 초중종물 관리, 설비관리)
 */

const ProdUtils = {
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
 * 0) 제조 관리 표준 (ProdStandardsModule)
 */
var ProdStandardsModule = (function() {
    const STORE = DB.STORES.PROD_STANDARDS;

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">차종/품명 검색</label>
                <input type="text" class="form-input" id="psFilterSearch" placeholder="검색어 입력">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="ProdStandardsModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '차종', '품명', '라인', '컨베이어 속도', '부스 압력/RPM', '건조 온도', '최종수정'];
        ProdUtils.renderMain(container, '제조 관리 표준', '제품별 최적의 공정 표준 파라미터를 정의하고 관리합니다.', 'ProdStandardsModule.openAddModal()', 'ProdStandardsModule.exportData()', filterHTML, 'psTable', headers);
        search();
    }

    function search() {
        const query = document.getElementById('psFilterSearch').value.trim();
        let data = Storage.getAll(STORE);
        if (query) data = data.filter(d => d.carModel.includes(query) || d.partName.includes(query));
        data.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('psTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:30px;">표준 데이터가 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.carModel}</td>
                    <td style="font-weight:600;">${d.partName}</td>
                    <td><span class="badge badge-outline">${d.line}</span></td>
                    <td>${d.convSpeed || '-'}</td>
                    <td style="font-size:12px;">${d.boothParams || '-'}</td>
                    <td>${d.ovenTemp || '-'}</td>
                    <td style="font-size:12px;color:var(--text-muted);">${(d.updatedAt || d.createdAt || '-').substring(0, 16)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdStandardsModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdStandardsModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        const selectedLine = d.line || 'A-LINE';
        const h = d.hvacTargets || {};
        const i = d.irTargets || {};

        return `
            <div style="max-height: 75vh; overflow-y: auto; padding-right: 10px;">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="psCarModel" value="${d.carModel || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="psPartName" value="${d.partName || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">해당 라인</label>
                        <select class="form-select" id="psLine" onchange="ProdStandardsModule.toggleLine(this.value, '${d.id || ''}')">
                            <option value="A-LINE" ${selectedLine === 'A-LINE' ? 'selected' : ''}>도장-A</option>
                            <option value="B-LINE" ${selectedLine === 'B-LINE' ? 'selected' : ''}>도장-B</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">컨베이어 속도 (Hz)</label>
                        <input type="text" class="form-input" id="psConvSpeed" value="${d.convSpeed || ''}" placeholder="예: 25.0">
                    </div>
                </div>

                <div id="psLineSpecificContent">
                    ${renderLineSpecificStandardFields(selectedLine, d)}
                </div>

                <div class="form-group" style="margin-top:20px;">
                    <label class="form-label">공조 설정 (HVAC Hz)</label>
                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; background:var(--bg-secondary); padding:12px; border-radius:8px;">
                        <div>
                            <p style="font-size:11px; color:var(--text-muted);">Booth 1 (급기/배기)</p>
                            <input type="text" class="form-input btn-sm" id="hvac_b1" value="${h.booth1 || '20~60/20~50'}">
                        </div>
                        <div>
                            <p style="font-size:11px; color:var(--text-muted);">Booth 2 (급기/배기)</p>
                            <input type="text" class="form-input btn-sm" id="hvac_b2" value="${h.booth2 || '20~60/20~50'}">
                        </div>
                        <div>
                            <p style="font-size:11px; color:var(--text-muted);">Booth 3 (급기/배기)</p>
                            <input type="text" class="form-input btn-sm" id="hvac_b3" value="${h.booth3 || '20~60/20~50'}">
                        </div>
                        <div>
                            <p style="font-size:11px; color:var(--text-muted);">ION 1 (급기/배기)</p>
                            <input type="text" class="form-input btn-sm" id="hvac_ion1" value="${h.ion1 || '20~60/20~50'}">
                        </div>
                        <div>
                            <p style="font-size:11px; color:var(--text-muted);">IR/UV (급기/배기)</p>
                            <input type="text" class="form-input btn-sm" id="hvac_uv" value="${h.uv || '10~60/10~60'}">
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">기타 참고사항</label>
                    <textarea class="form-textarea" id="psBoothParams" style="height:60px;">${d.boothParams || ''}</textarea>
                </div>
            </div>
        `;
    }

    function renderLineSpecificStandardFields(line, d = {}) {
        const b = d.boothStandards || {};
        const ir = d.irTargets || {};

        if (line === 'A-LINE') {
            return `
                <div style="margin:20px 0 10px; font-weight:700; color:var(--accent-blue); display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined">precision_manufacturing</span> 도장-A 부스 및 IR 표준
                </div>
                <div style="background:var(--bg-secondary); padding:12px; border-radius:8px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">Booth 1~3 Spindle (RPM)</p>
                            <input type="text" class="form-input" id="psSpindle" value="${b.spindle || '1000~1500'}" placeholder="기준 범위">
                        </div>
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">Spray Pressure (Air/Pattern)</p>
                            <input type="text" class="form-input" id="psSpray" value="${b.spray || '부하/패턴 매칭 확인'}" placeholder="기준">
                        </div>
                    </div>
                    <div style="border-top:1px solid #ddd; padding-top:10px;">
                        <p style="font-size:12px; font-weight:600; margin-bottom:8px;">IR 건조로 온도 표준 (Zone 1~8)</p>
                        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
                            ${[1, 2, 3, 4, 5, 6, 7, 8].map(z => `
                                <div>
                                    <span style="font-size:10px; color:var(--text-muted);">#${z}</span>
                                    <input type="text" class="form-input btn-sm" id="ir_z${z}" value="${ir['z' + z] || ''}" placeholder="temp">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div style="margin:20px 0 10px; font-weight:700; color:var(--accent-warning); display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined">precision_manufacturing</span> 도장-B 공정 표준
                </div>
                <div style="background:var(--bg-secondary); padding:12px; border-radius:8px;">
                    <p style="font-size:12px; color:var(--text-muted);">도장-B 특화 표준 항목을 추후 확장 가능합니다.</p>
                    <input type="text" class="form-input" id="psBOther" value="${d.bOther || ''}" placeholder="도장-B 기타 기준">
                </div>
            `;
        }
    }

    function toggleLine(line, id) {
        const d = id ? Storage.getById(STORE, id) : {};
        document.getElementById('psLineSpecificContent').innerHTML = renderLineSpecificStandardFields(line, d);
    }

    function collectData() {
        const line = document.getElementById('psLine').value;
        const data = {
            carModel: document.getElementById('psCarModel').value.trim(),
            partName: document.getElementById('psPartName').value.trim(),
            line: line,
            convSpeed: document.getElementById('psConvSpeed').value.trim(),
            boothParams: document.getElementById('psBoothParams').value.trim(),
            updatedAt: UIUtils.now(),
            hvacTargets: {
                booth1: document.getElementById('hvac_b1').value,
                booth2: document.getElementById('hvac_b2').value,
                booth3: document.getElementById('hvac_b3').value,
                ion1: document.getElementById('hvac_ion1').value,
                uv: document.getElementById('hvac_uv').value
            }
        };

        if (line === 'A-LINE') {
            data.boothStandards = {
                spindle: document.getElementById('psSpindle').value.trim(),
                spray: document.getElementById('psSpray').value.trim()
            };
            data.irTargets = {};
            for (let z = 1; z <= 8; z++) {
                data.irTargets['z' + z] = document.getElementById('ir_z' + z).value.trim();
            }
        } else {
            data.bOther = document.getElementById('psBOther') ? document.getElementById('psBOther').value.trim() : '';
        }

        return data;
    }

    function openAddModal() {
        UIUtils.showModal('제조 관리 표준 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdStandardsModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.carModel || !data.partName) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('표준 정보 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdStandardsModule.saveEdit('${id}')">저장</button>`, 'lg');
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
        const headers = ['차종', '품명', '라인', '컨베이어속도', '부스파라미터', '건조온도', '최종수정'];
        const rows = data.map(d => [d.carModel, d.partName, d.line, d.convSpeed, d.boothParams, d.ovenTemp, d.updatedAt]);
        Storage.exportToCSV(headers, rows, '제조관리표준');
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
 * 1) 작업조건 관리 (ProdConditionsModule) - 도장-A/도장-B C/SHEET 기반 고도화
 */
var ProdConditionsModule = (function() {
    const STORE = DB.STORES.PROD_CONDITIONS;

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="pcFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="pcFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">라인</label>
                <select class="form-select" id="pcFilterLine">
                    <option value="">전체 라인</option>
                    <option value="A-LINE">도장-A</option>
                    <option value="B-LINE">도장-B</option>
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="ProdConditionsModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '일자', '라인', '차종/품명', '컨베이어', '작업항목 확인', '작업자'];
        ProdUtils.renderMain(container, '작업조건 관리', '공정조건 C/SHEET 기반의 매일 정밀 작업 조건을 기록합니다.', 'ProdConditionsModule.openAddModal()', 'ProdConditionsModule.exportData()', filterHTML, 'pcTable', headers);
        search();
    }

    function search() {
        const start = document.getElementById('pcFilterStart').value;
        const end = document.getElementById('pcFilterEnd').value;
        const line = document.getElementById('pcFilterLine').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (line) data = data.filter(d => d.line === line);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('pcTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><span class="badge ${d.line === 'A-LINE' ? 'badge-info' : 'badge-warning'}">${d.line === 'A-LINE' ? '도장-A' : '도장-B'}</span></td>
                    <td style="font-weight:600;">${d.carModel} / ${d.partName}</td>
                    <td>${d.convSpeed || '-'} Hz</td>
                    <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        부스: ${d.boothData ? Object.keys(d.boothData).length : 0}개 항목 체크됨
                    </td>
                    <td>${d.operator}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdConditionsModule.edit('${d.id}')">상세/수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdConditionsModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        const selectedLine = d.line || 'A-LINE';

        return `
            <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">기록일자 <span style="color:var(--accent-red)">*</span></label>
                        <input type="date" class="form-input" id="pcDate" value="${d.date || UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">작업 라인 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="pcLine" onchange="ProdConditionsModule.toggleLine(this.value, '${d.id || ''}')">
                            <option value="A-LINE" ${selectedLine === 'A-LINE' ? 'selected' : ''}>도장-A</option>
                            <option value="B-LINE" ${selectedLine === 'B-LINE' ? 'selected' : ''}>도장-B</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <input type="text" class="form-input" id="pcCarModel" value="${d.carModel || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">품명</label>
                        <input type="text" class="form-input" id="pcPartName" value="${d.partName || ''}">
                    </div>
                </div>

                <div style="margin:20px 0 10px; font-weight:700; color:var(--accent-blue); display:flex; align-items:center; gap:8px;">
                     <span class="material-symbols-outlined">settings_input_component</span> 주요 공정 조건 설정
                </div>

                <div id="pcLineSpecificContent">
                    ${renderLineSpecificFields(selectedLine, d)}
                </div>

                <div class="form-group" style="margin-top:20px;">
                    <label class="form-label">작업자</label>
                    <input type="text" class="form-input" id="pcOperator" value="${d.operator || ''}" placeholder="기록인">
                </div>
            </div>
        `;
    }

    function renderLineSpecificFields(line, d = {}) {
        const b = d.boothData || {};

        if (line === 'A-LINE') {
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">컨베이어 속도 (Hz)</label>
                        <input type="text" class="form-input" id="pcConvSpeed" value="${d.convSpeed || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">#1 ION 에어 압력</label>
                        <input type="text" class="form-input" id="pcIonAir" value="${d.ionAir || ''}">
                    </div>
                </div>
                <!-- 부스별 상세 (C/SHEET 기준) -->
                <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; margin-top:10px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">#1 Booth (1번 로봇/PG/스핀들)</p>
                            <input type="text" class="form-input btn-sm" id="booth1_rob" value="${b.booth1_rob || ''}" placeholder="압력/RPM">
                        </div>
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">#1 Booth (스프레이 압력)</p>
                            <input type="text" class="form-input btn-sm" id="booth1_spr" value="${b.booth1_spr || ''}" placeholder="Air 압력">
                        </div>
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">#2 Booth (Robot PG/스핀들)</p>
                            <input type="text" class="form-input btn-sm" id="booth2_rob" value="${b.booth2_rob || ''}" placeholder="압력/RPM">
                        </div>
                        <div>
                            <p style="font-size:12px; font-weight:600; margin-bottom:5px;">#3 Booth (Robot PG/스핀들)</p>
                            <input type="text" class="form-input btn-sm" id="booth3_rob" value="${b.booth3_rob || ''}" placeholder="압력/RPM">
                        </div>
                    </div>
                    <div style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                        <p style="font-size:12px; font-weight:600; margin-bottom:5px;">IR 건조 조건 (1~8구간 실측)</p>
                        <input type="text" class="form-input btn-sm" id="ir_temps" value="${d.irTemps || ''}" placeholder="예: 41: 30±5, 42: 35±5...">
                    </div>
                </div>
            `;
        } else {
            // 도장-B
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">컨베이어 속도 (Hz)</label>
                        <input type="text" class="form-input" id="pcConvSpeed" value="${d.convSpeed || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">#1 ION 제전건 위치/에어압력</label>
                        <input type="text" class="form-input" id="pcIonAir" value="${d.ionAir || ''}">
                    </div>
                </div>
                <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; margin-top:10px;">
                    <p style="font-size:12px; font-weight:600; margin-bottom:8px;">Booth 공조 (1~4 Booth, UV)</p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                         <input type="text" class="form-input btn-sm" id="booth1_hvac" value="${b.booth1_hvac || ''}" placeholder="1B: 급기/배기">
                         <input type="text" class="form-input btn-sm" id="booth2_hvac" value="${b.booth2_hvac || ''}" placeholder="2B: 급기/배기">
                         <input type="text" class="form-input btn-sm" id="booth3_hvac" value="${b.booth3_hvac || ''}" placeholder="3B: 급기/배기">
                         <input type="text" class="form-input btn-sm" id="booth4_hvac" value="${b.booth4_hvac || ''}" placeholder="4B: 급기/배기">
                         <input type="text" class="form-input btn-sm" id="uv_hvac" value="${b.uv_hvac || ''}" placeholder="UV: 급기/배기">
                    </div>
                    <div style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                        <p style="font-size:12px; font-weight:600; margin-bottom:5px;">IR 건조 조건 & UV Lamp 체크</p>
                        <input type="text" class="form-input btn-sm" id="oven_check" value="${d.ovenCheck || ''}" placeholder="IR 온도, UV Lamp 13±2A 등">
                    </div>
                </div>
            `;
        }
    }

    function toggleLine(line, id) {
        const d = id ? Storage.getById(STORE, id) : {};
        document.getElementById('pcLineSpecificContent').innerHTML = renderLineSpecificFields(line, d);
    }

    function collectData() {
        const line = document.getElementById('pcLine').value;
        const data = {
            date: document.getElementById('pcDate').value,
            line: line,
            carModel: document.getElementById('pcCarModel').value.trim(),
            partName: document.getElementById('pcPartName').value.trim(),
            convSpeed: document.getElementById('pcConvSpeed') ? document.getElementById('pcConvSpeed').value.trim() : '',
            ionAir: document.getElementById('pcIonAir') ? document.getElementById('pcIonAir').value.trim() : '',
            operator: document.getElementById('pcOperator').value.trim(),
            boothData: {}
        };

        // 라인별 상세 필드 수집
        if (line === 'A-LINE') {
            data.boothData = {
                booth1_rob: document.getElementById('booth1_rob').value.trim(),
                booth1_spr: document.getElementById('booth1_spr').value.trim(),
                booth2_rob: document.getElementById('booth2_rob').value.trim(),
                booth3_rob: document.getElementById('booth3_rob').value.trim()
            };
            data.irTemps = document.getElementById('ir_temps').value.trim();
        } else {
            data.boothData = {
                booth1_hvac: document.getElementById('booth1_hvac').value.trim(),
                booth2_hvac: document.getElementById('booth2_hvac').value.trim(),
                booth3_hvac: document.getElementById('booth3_hvac').value.trim(),
                booth4_hvac: document.getElementById('booth4_hvac').value.trim(),
                uv_hvac: document.getElementById('uv_hvac').value.trim()
            };
            data.ovenCheck = document.getElementById('oven_check').value.trim();
        }

        return data;
    }

    function openAddModal() {
        UIUtils.showModal('작업조건 상세 기록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdConditionsModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.line) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('작업조건 상세 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdConditionsModule.saveEdit('${id}')">저장</button>`, 'lg');
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
        const headers = ['일자', '라인', '차종', '품명', '컨베이어속도', '작업자'];
        const rows = data.map(d => [d.date, d.line, d.carModel, d.partName, d.convSpeed, d.operator]);
        Storage.exportToCSV(headers, rows, '공정조건기록');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData,
        toggleLine
    };
})();

/**
 * 2) 초중종물 관리 (ProdQualityModule)
 */
var ProdQualityModule = (function() {
    const STORE = DB.STORES.PROD_QUALITY_CHECK;

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="pqFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="pqFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">구분</label>
                <select class="form-select" id="pqFilterType">
                    <option value="">전체</option>
                    <option value="초물">초물</option>
                    <option value="중물">중물</option>
                    <option value="종물">종물</option>
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="ProdQualityModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '일자', '구분', '공정명', '차종/품명', '검사항목', '판정', '검사자', '비고'];
        ProdUtils.renderMain(container, '초중종물 관리', '공정별 초물, 중물, 종물 품질 확인 내역을 기록합니다.', 'ProdQualityModule.openAddModal()', 'ProdQualityModule.exportData()', filterHTML, 'pqTable', headers);
        search();
    }

    function search() {
        const start = document.getElementById('pqFilterStart').value;
        const end = document.getElementById('pqFilterEnd').value;
        const type = document.getElementById('pqFilterType').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (type) data = data.filter(d => d.type === type);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('pqTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><span class="badge ${d.type === '초물' ? 'badge-info' : d.type === '중물' ? 'badge-warning' : 'badge-success'}">${d.type}</span></td>
                    <td>${d.process}</td>
                    <td>${d.itemName}</td>
                    <td>${d.checkItem}</td>
                    <td><span class="badge ${d.result === 'OK' ? 'badge-success' : 'badge-danger'}">${d.result}</span></td>
                    <td>${d.inspector}</td>
                    <td>${d.note || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdQualityModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdQualityModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="pqDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">구분 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pqType">
                        <option value="초물" ${d.type === '초물' ? 'selected' : ''}>초물 (First)</option>
                        <option value="중물" ${d.type === '중물' ? 'selected' : ''}>중물 (Middle)</option>
                        <option value="종물" ${d.type === '종물' ? 'selected' : ''}>종물 (Last)</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">공정명</label>
                    <input type="text" class="form-input" id="pqProcess" value="${d.process || ''}" placeholder="예: 사출 1호기">
                </div>
                <div class="form-group">
                    <label class="form-label">차종/품명</label>
                    <input type="text" class="form-input" id="pqItemName" value="${d.itemName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사항목</label>
                    <input type="text" class="form-input" id="pqCheckItem" value="${d.checkItem || ''}" placeholder="예: 외관, 치수">
                </div>
                <div class="form-group">
                    <label class="form-label">판정</label>
                    <select class="form-select" id="pqResult">
                        <option value="OK" ${d.result === 'OK' ? 'selected' : ''}>OK</option>
                        <option value="NG" ${d.result === 'NG' ? 'selected' : ''}>NG</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">검사자</label>
                    <input type="text" class="form-input" id="pqInspector" value="${d.inspector || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="pqNote">${d.note || ''}</textarea>
            </div>
        `;
    }

    function collectData() {
        return {
            date: document.getElementById('pqDate').value,
            type: document.getElementById('pqType').value,
            process: document.getElementById('pqProcess').value.trim(),
            itemName: document.getElementById('pqItemName').value.trim(),
            checkItem: document.getElementById('pqCheckItem').value.trim(),
            result: document.getElementById('pqResult').value,
            inspector: document.getElementById('pqInspector').value.trim(),
            note: document.getElementById('pqNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('품질 확인 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdQualityModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.type) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('품질 확인 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdQualityModule.saveEdit('${id}')">저장</button>`, 'lg');
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
        const headers = ['일자', '구분', '공정', '차종/품명', '검사항목', '판정', '검사자', '비고'];
        const rows = data.map(d => [d.date, d.type, d.process, d.itemName, d.checkItem, d.result, d.inspector, d.note]);
        Storage.exportToCSV(headers, rows, '초중종물관리');
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
 * 3) 설비관리 (ProdEquipmentModule)
 */
var ProdEquipmentModule = (function() {
    const STORE = DB.STORES.PROD_EQUIPMENT;

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="peFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="peFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="ProdEquipmentModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '일자', '설비명', '구분', '내용', '시간(min)', '스페어관리', '상태'];
        ProdUtils.renderMain(container, '설비관리', '설비 비가동, 성능 저하 및 소모품/스페어 파트를 관리합니다.', 'ProdEquipmentModule.openAddModal()', 'ProdEquipmentModule.exportData()', filterHTML, 'peTable', headers);
        search();
    }

    function search() {
        const start = document.getElementById('peFilterStart').value;
        const end = document.getElementById('peFilterEnd').value;

        let data = Storage.getByDateRange(STORE, start, end);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('peTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${d.date}</td>
                    <td><strong>${d.equipment}</strong></td>
                    <td><span class="badge ${d.type === '비가동' ? 'badge-danger' : d.type === '속도저하' ? 'badge-warning' : 'badge-info'}">${d.type}</span></td>
                    <td>${d.content}</td>
                    <td style="text-align:right;">${d.duration || '-'}</td>
                    <td>${d.sparePart || '-'}</td>
                    <td><span class="badge badge-outline">${d.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdEquipmentModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdEquipmentModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function fillForm(d = {}) {
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="peDate" value="${d.date || UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">설비명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="peEquipment" value="${d.equipment || ''}" placeholder="예: 사출 1호기">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구분 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="peType">
                        <option value="비가동" ${d.type === '비가동' ? 'selected' : ''}>비가동 등록</option>
                        <option value="속도저하" ${d.type === '속도저하' ? 'selected' : ''}>속도 저하 등록</option>
                        <option value="스페어관리" ${d.type === '스페어관리' ? 'selected' : ''}>스페어 파트 관리</option>
                        <option value="예방보전" ${d.type === '예방보전' ? 'selected' : ''}>예방 보전</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">시간 (분)</label>
                    <input type="number" class="form-input" id="peDuration" value="${d.duration || ''}" placeholder="손실 시간">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">내용/원인</label>
                <input type="text" class="form-input" id="peContent" value="${d.content || ''}" placeholder="예: 금형 교체, 센서 오작동">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">교체/관리 부품 (스페어)</label>
                    <input type="text" class="form-input" id="peSparePart" value="${d.sparePart || ''}" placeholder="부품명">
                </div>
                <div class="form-group">
                    <label class="form-label">상태</label>
                    <input type="text" class="form-input" id="peStatus" value="${d.status || '완료'}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="peNote">${d.note || ''}</textarea>
            </div>
        `;
    }

    function collectData() {
        return {
            date: document.getElementById('peDate').value,
            equipment: document.getElementById('peEquipment').value.trim(),
            type: document.getElementById('peType').value,
            duration: Number(document.getElementById('peDuration').value) || 0,
            content: document.getElementById('peContent').value.trim(),
            sparePart: document.getElementById('peSparePart').value.trim(),
            status: document.getElementById('peStatus').value.trim(),
            note: document.getElementById('peNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('설비 내역 등록', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdEquipmentModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.equipment || !data.type) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('설비 내역 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdEquipmentModule.saveEdit('${id}')">저장</button>`, 'lg');
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
        const headers = ['일자', '설비명', '구분', '내용', '시간', '스페어', '상태'];
        const rows = data.map(d => [d.date, d.equipment, d.type, d.content, d.duration, d.sparePart, d.status]);
        Storage.exportToCSV(headers, rows, '설비관리');
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