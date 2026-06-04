/**
 * 수입검사 기준서 모듈 (InjIncomingStdModule)
 * 사출 수입검사 기준서 등록 / 조회 / 편집 / 출력
 */
var InjIncomingStdModule = (function () {
    const STORE    = DB.STORES.INJ_INCOMING_STD;
    const PROD_ST  = DB.STORES.INJECTION_MATERIALS; // 사출 자재 마스터 (외주 입고품)

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    /* ═══════════════════════════════════════════════════════════════
       LIST 페이지
    ═══════════════════════════════════════════════════════════════ */
    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('inj-incoming-std')}
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="InjIncomingStdModule.openNewForm()">
                        <span class="material-symbols-outlined">add</span> 신규 기준서 등록
                    </button>
                </div>
            </div>

            <!-- 필터 -->
            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="stdFilterCar" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>
                        ${_carOptions()}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품목구분</label>
                    <select class="form-select" id="stdFilterType" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>
                        <option value="양산품">양산품</option>
                        <option value="A/S품">A/S품</option>
                        <option value="개발품">개발품</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">등록여부</label>
                    <select class="form-select" id="stdFilterReg" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>
                        <option value="등록">등록</option>
                        <option value="미등록">미등록</option>
                    </select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <input type="text" class="form-input" id="stdFilterKeyword" placeholder="품명 검색..." oninput="InjIncomingStdModule.renderList()" style="min-width:160px;">
                </div>
            </div>

            <!-- 집계 배지 -->
            <div id="stdSummary" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;"></div>

            <!-- 리스트 테이블 -->
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>컬러</th>
                                    <th style="text-align:center;">품목구분</th>
                                    <th style="text-align:center;">등록여부</th>
                                    <th>문서번호</th>
                                    <th>Rev</th>
                                    <th>제정일자</th>
                                    <th style="text-align:center;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="stdListBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

        renderList();
    }

    function _carOptions() {
        const mats = Storage.getAll(PROD_ST) || [];
        const cars = [...new Set(mats.map(p => p.carModel).filter(Boolean))].sort();
        return cars.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('');
    }

    function renderList() {
        const carFilter  = (document.getElementById('stdFilterCar')     || {}).value || '';
        const typeFilter = (document.getElementById('stdFilterType')    || {}).value || '';
        const regFilter  = (document.getElementById('stdFilterReg')     || {}).value || '';
        const kw         = ((document.getElementById('stdFilterKeyword') || {}).value || '').toLowerCase();

        // 사출 자재 마스터 전체 (INJECTION_MATERIALS = 외주 입고품)
        const allProds = (Storage.getAll(PROD_ST) || []).filter(p =>
            p.carModel && p.injPartName
        ).map(p => ({
            ...p,
            partName: p.injPartName,  // 표시용 통일
            color:    p.injColor || ''
        }));

        // 기준서 목록
        const allStds = Storage.getAll(STORE) || [];
        const stdMap  = {}; // productId -> std
        allStds.forEach(s => { stdMap[s.productId] = s; });

        // 필터 적용
        let rows = allProds.filter(p => {
            if (carFilter  && p.carModel  !== carFilter)  return false;
            if (typeFilter && (p.itemType || '') !== typeFilter) return false;
            if (kw && !(p.partName || '').toLowerCase().includes(kw) &&
                       !(p.carModel || '').toLowerCase().includes(kw)) return false;
            const hasStd = !!stdMap[p.id];
            if (regFilter === '등록'  && !hasStd) return false;
            if (regFilter === '미등록' &&  hasStd) return false;
            return true;
        });

        // 요약
        const totalReg   = rows.filter(p =>  stdMap[p.id]).length;
        const totalUnreg = rows.filter(p => !stdMap[p.id]).length;
        const summary = document.getElementById('stdSummary');
        if (summary) summary.innerHTML = `
            <span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:0.82rem;font-weight:700;">전체 ${rows.length}종</span>
            <span style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:4px 14px;font-size:0.82rem;font-weight:700;">✓ 등록 ${totalReg}</span>
            <span style="background:#fff7ed;color:#d97706;border:1px solid #fcd34d;border-radius:20px;padding:4px 14px;font-size:0.82rem;font-weight:700;">⚠ 미등록 ${totalUnreg}</span>`;

        const tbody = document.getElementById('stdListBody');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">해당하는 품목이 없습니다.</td></tr>`;
            return;
        }

        const ITEM_COLORS = { '양산품':'#059669', 'A/S품':'#d97706', '개발품':'#7c3aed' };

        tbody.innerHTML = rows.map((p, i) => {
            const std    = stdMap[p.id];
            const hasStd = !!std;
            const it     = p.itemType || '';
            const itColor = ITEM_COLORS[it] || '#6b7280';
            const itBadge = it ? `<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;
                background:${itColor}22;color:${itColor};border:1px solid ${itColor}44;">${it}</span>` : '-';
            const regBadge = hasStd
                ? `<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;
                    background:#dcfce7;color:#16a34a;border:1px solid #86efac;">✓ 등록</span>`
                : `<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;
                    background:#fef9c3;color:#d97706;border:1px solid #fde047;">미등록</span>`;

            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${_esc(p.carModel)}</strong></td>
                <td>${_esc(p.partName)}</td>
                <td>${_esc(p.color || '-')}</td>
                <td style="text-align:center;">${itBadge}</td>
                <td style="text-align:center;">${regBadge}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${hasStd ? _esc(std.docNo || '-') : '-'}</td>
                <td style="text-align:center;">${hasStd ? _esc(std.revNo || '00') : '-'}</td>
                <td>${hasStd ? _esc(std.createdDate || '-') : '-'}</td>
                <td style="text-align:center;">
                    ${hasStd
                        ? `<button class="btn btn-sm btn-outline" onclick="InjIncomingStdModule.openEditForm('${std.id}')">편집</button>
                           <button class="btn btn-sm btn-outline" onclick="InjIncomingStdModule.printStd('${std.id}')" title="출력">
                               <span class="material-symbols-outlined" style="font-size:.9rem;">print</span>
                           </button>`
                        : `<button class="btn btn-sm btn-primary" onclick="InjIncomingStdModule.openNewFormForProduct('${p.id}')">등록</button>`
                    }
                </td>
            </tr>`;
        }).join('');
    }

    /* ═══════════════════════════════════════════════════════════════
       FORM (신규 / 편집)
    ═══════════════════════════════════════════════════════════════ */
    function openNewForm() {
        _openForm(null, null);
    }

    function openNewFormForProduct(productId) {
        const p = Storage.getById(PROD_ST, productId);
        _openForm(null, p);
    }

    function openEditForm(id) {
        const std = Storage.getById(STORE, id);
        if (!std) { UIUtils.toast('기준서를 찾을 수 없습니다.', 'error'); return; }
        const p = std.productId ? Storage.getById(PROD_ST, std.productId) : null;
        _openForm(std, p);
    }

    function _openForm(std, prod) {
        const isEdit = !!std;
        const v = k => _esc(std ? (std[k] || '') : (prod ? (prod[k] || '') : ''));

        // 주요검사 Point 기본 10행
        const defaultPoints = std ? (std.checkPoints || []) : [
            { item:'외관',       standard:'BURR, 이물, 흠 없을 것', method:'육안', sample:'10EA/LOT', management:'' },
            { item:'치수',       standard:'도면 규격 이내',           method:'V/C',  sample:'5EA/LOT',  management:'' },
            { item:'표면장력',   standard:'TEST 시약이 물방울 형태로 맺히지 않을 것', method:'육안', sample:'1EA/LOT', management:'' },
            { item:'내포장 상태',standard:'포장 BOX 내부에 이물없을 것\n내부 포장비닐등의 찢어짐이 없을 것', method:'육안', sample:'3Box/LOT', management:'' },
            { item:'포장·수량',  standard:'포장사양, 명세표대비 현품 동일할 것', method:'육안', sample:'BOX', management:'포장사양서' },
            {},{},{},{},{}
        ];
        const defaultRevisions = std ? (std.revisions || []) : [
            { no:'00', date: std ? (std.createdDate || '') : '', reason:'최초 작성', confirmer:'' }
        ];

        const checkRowsHtml = defaultPoints.map((pt, i) => `
            <tr>
                <td style="text-align:center;padding:4px;">${i + 1}</td>
                <td style="padding:2px;"><input type="text" class="form-input std-pt-item" style="min-width:80px;font-size:0.8rem;" value="${_esc(pt.item||'')}" placeholder="항목"></td>
                <td style="padding:2px;"><textarea class="form-input std-pt-std" rows="2" style="min-width:120px;font-size:0.8rem;resize:vertical;">${_esc(pt.standard||'')}</textarea></td>
                <td style="padding:2px;"><input type="text" class="form-input std-pt-method" style="min-width:60px;font-size:0.8rem;" value="${_esc(pt.method||'')}" placeholder="확인방법"></td>
                <td style="padding:2px;"><input type="text" class="form-input std-pt-sample" style="min-width:70px;font-size:0.8rem;" value="${_esc(pt.sample||'')}" placeholder="시료"></td>
                <td style="padding:2px;"><input type="text" class="form-input std-pt-mgmt" style="min-width:80px;font-size:0.8rem;" value="${_esc(pt.management||'')}" placeholder="관리방안"></td>
                <td style="text-align:center;padding:2px;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()" title="행 삭제">
                        <span class="material-symbols-outlined" style="font-size:.85rem;">remove</span>
                    </button>
                </td>
            </tr>`).join('');

        const revRowsHtml = defaultRevisions.map((r, i) => `
            <tr>
                <td style="padding:2px;"><input type="text" class="form-input std-rev-no" style="width:50px;font-size:0.8rem;text-align:center;" value="${_esc(r.no||String(i).padStart(2,'0'))}"></td>
                <td style="padding:2px;"><input type="text" class="form-input std-rev-date" style="width:90px;font-size:0.8rem;" value="${_esc(r.date||'')}"></td>
                <td style="padding:2px;"><input type="text" class="form-input std-rev-reason" style="min-width:120px;font-size:0.8rem;" value="${_esc(r.reason||'')}"></td>
                <td style="padding:2px;"><input type="text" class="form-input std-rev-confirm" style="width:70px;font-size:0.8rem;" value="${_esc(r.confirmer||'')}"></td>
                <td style="text-align:center;padding:2px;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()" title="행 삭제">
                        <span class="material-symbols-outlined" style="font-size:.85rem;">remove</span>
                    </button>
                </td>
            </tr>`).join('');

        // 제품 목록 (productId select) — INJECTION_MATERIALS
        const allProds = (Storage.getAll(PROD_ST) || []).filter(p => p.carModel && p.injPartName);
        const prodOptions = allProds.map(p =>
            `<option value="${p.id}" ${std && std.productId === p.id ? 'selected' : ''}
                data-car="${_esc(p.carModel)}" data-part="${_esc(p.injPartName)}" data-color="${_esc(p.injColor||'')}"
                data-type="${_esc(p.itemType||'')}">
                [${_esc(p.carModel)}] ${_esc(p.injPartName)} ${p.injColor ? '/ ' + _esc(p.injColor) : ''}
            </option>`).join('');

        UIUtils.showModal(isEdit ? '수입검사 기준서 편집' : '수입검사 기준서 등록', `
        <div style="font-size:0.88rem;">

            <!-- ── 헤더 정보 ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">문서번호</label>
                    <input type="text" class="form-input" id="stdDocNo" value="${v('docNo')}" placeholder="예: KC-IT-009">
                </div>
                <div class="form-group">
                    <label class="form-label">Rev No</label>
                    <input type="text" class="form-input" id="stdRevNo" value="${std ? _esc(std.revNo||'00') : '00'}" style="width:80px;">
                </div>
                <div class="form-group">
                    <label class="form-label">공정명</label>
                    <input type="text" class="form-input" id="stdProcessName" value="${v('processName') || '수입검사'}" placeholder="수입검사">
                </div>
                <div class="form-group">
                    <label class="form-label">제정일자</label>
                    <input type="date" class="form-input" id="stdCreatedDate" value="${std ? (std.createdDate||'') : UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">개정일자</label>
                    <input type="date" class="form-input" id="stdRevisedDate" value="${v('revisedDate')}">
                </div>
                <div class="form-group">
                    <label class="form-label">설비명</label>
                    <input type="text" class="form-input" id="stdEquipment" value="${v('equipment')}" placeholder="검사대 등">
                </div>
            </div>

            <!-- ── 제품 연결 ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">제품 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="stdProductId" onchange="InjIncomingStdModule._onProductChange()">
                        <option value="">-- 제품 선택 --</option>
                        ${prodOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">모델(차종)</label>
                    <input type="text" class="form-input" id="stdCarModel" value="${v('carModel')}" placeholder="자동 입력">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="stdPartName" value="${v('partName')}" placeholder="자동 입력">
                </div>
                <div class="form-group">
                    <label class="form-label">품목구분</label>
                    <input type="text" class="form-input" id="stdItemType" value="${v('itemType')}" readonly style="background:var(--bg-secondary);">
                </div>
            </div>

            <!-- ── 작성/검토/승인 ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">작성</label>
                    <input type="text" class="form-input" id="stdAuthor" value="${v('author')}">
                </div>
                <div class="form-group">
                    <label class="form-label">검토</label>
                    <input type="text" class="form-input" id="stdReviewer" value="${v('reviewer')}">
                </div>
                <div class="form-group">
                    <label class="form-label">승인</label>
                    <input type="text" class="form-input" id="stdApprover" value="${v('approver')}">
                </div>
            </div>

            <!-- ── 주요검사 Point ── -->
            <div style="margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <strong style="font-size:0.9rem;">주요검사 Point</strong>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjIncomingStdModule._addCheckRow()">
                        <span class="material-symbols-outlined" style="font-size:.9rem;">add</span> 행 추가
                    </button>
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" id="stdCheckTable" style="min-width:600px;">
                        <thead>
                            <tr>
                                <th style="width:36px;text-align:center;">No</th>
                                <th>항목</th>
                                <th>기준</th>
                                <th>확인방법</th>
                                <th>시료</th>
                                <th>관리방안</th>
                                <th style="width:36px;"></th>
                            </tr>
                        </thead>
                        <tbody id="stdCheckBody">${checkRowsHtml}</tbody>
                    </table>
                </div>
            </div>

            <!-- ── 검사순서 / 조치사항 ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">검사 순서</label>
                    <textarea class="form-input" id="stdProcedure" rows="6" style="resize:vertical;">${std ? _esc(std.procedure||'') : '1. 소재의 표면상태를 검사한다.\n 1-1. 전면 → 후면 순으로 검사한다.\n2. 소재불량은 해당부위 마킹 후 별도의 불량 박스에 보관한다.'}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">조치 사항</label>
                    <textarea class="form-input" id="stdCorrective" rows="6" style="resize:vertical;">${std ? _esc(std.corrective||'') : '1. 무결함을 원칙으로 한다.\n2. 불량 발생 시 반품, 선별, 폐기, 특채 의 조치를 취할 수 있다.'}</textarea>
                </div>
            </div>

            <!-- ── 이미지 첨부 ── -->
            <div style="margin-bottom:14px;">
                <label class="form-label">제품 이미지 (외관/치수포인트)</label>
                <div id="stdImgPreview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;min-height:60px;padding:8px;background:var(--bg-secondary);border:1px dashed var(--border-color);border-radius:6px;">
                    ${_renderImgPreviews(std ? (std.images || []) : [])}
                </div>
                <input type="file" id="stdImgInput" accept="image/*" multiple style="margin-top:8px;" onchange="InjIncomingStdModule._addImages(this)">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">※ 여러 장 선택 가능. 클릭하면 삭제.</div>
            </div>

            <!-- ── 개정 이력 ── -->
            <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <strong style="font-size:0.9rem;">개정 내용</strong>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjIncomingStdModule._addRevRow()">
                        <span class="material-symbols-outlined" style="font-size:.9rem;">add</span> 행 추가
                    </button>
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" id="stdRevTable" style="min-width:400px;">
                        <thead>
                            <tr><th>NO</th><th>개정일자</th><th>개정사유</th><th>확인</th><th style="width:36px;"></th></tr>
                        </thead>
                        <tbody id="stdRevBody">${revRowsHtml}</tbody>
                    </table>
                </div>
            </div>
        </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-outline" onclick="InjIncomingStdModule.printStd('${isEdit ? std.id : ''}')">
                <span class="material-symbols-outlined">print</span> 출력
            </button>
            <button class="btn btn-primary" onclick="InjIncomingStdModule.saveForm('${isEdit ? std.id : ''}')">저장</button>
        `, 'xl');

        // 저장된 이미지 복원
        if (std && std.images) _formImages = [...std.images];
        else _formImages = [];
    }

    let _formImages = [];

    function _renderImgPreviews(images) {
        return images.map((src, i) => `
            <div style="position:relative;display:inline-block;" id="imgThumb_${i}">
                <img src="${src}" style="width:100px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;"
                     onclick="InjIncomingStdModule._removeImage(${i})" title="클릭하면 삭제">
                <span style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.8);color:#fff;border-radius:50%;width:18px;height:18px;
                              display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;pointer-events:none;">✕</span>
            </div>`).join('');
    }

    function _addImages(input) {
        const files = Array.from(input.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = e => {
                _formImages.push(e.target.result);
                const preview = document.getElementById('stdImgPreview');
                if (preview) preview.innerHTML = _renderImgPreviews(_formImages);
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    }

    function _removeImage(idx) {
        _formImages.splice(idx, 1);
        const preview = document.getElementById('stdImgPreview');
        if (preview) preview.innerHTML = _renderImgPreviews(_formImages);
    }

    function _onProductChange() {
        const sel = document.getElementById('stdProductId');
        if (!sel || !sel.value) return;
        const opt = sel.options[sel.selectedIndex];
        const car   = opt.dataset.car   || '';
        const part  = opt.dataset.part  || '';
        const color = opt.dataset.color || '';
        const type  = opt.dataset.type  || '';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        set('stdCarModel',  car);
        set('stdPartName',  part);
        set('stdItemType',  type);
        // 문서번호 자동 제안 (미입력 시)
        const docEl = document.getElementById('stdDocNo');
        if (docEl && !docEl.value) {
            const allStds = Storage.getAll(STORE) || [];
            const maxNo = allStds.reduce((m, s) => {
                const n = parseInt((s.docNo || '').replace(/\D/g, '')) || 0;
                return Math.max(m, n);
            }, 8);
            docEl.value = `KC-IT-${String(maxNo + 1).padStart(3, '0')}`;
        }
    }

    function _addCheckRow() {
        const tbody = document.getElementById('stdCheckBody');
        if (!tbody) return;
        const i = tbody.rows.length + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;padding:4px;">${i}</td>
            <td style="padding:2px;"><input type="text" class="form-input std-pt-item" style="min-width:80px;font-size:0.8rem;" placeholder="항목"></td>
            <td style="padding:2px;"><textarea class="form-input std-pt-std" rows="2" style="min-width:120px;font-size:0.8rem;resize:vertical;"></textarea></td>
            <td style="padding:2px;"><input type="text" class="form-input std-pt-method" style="min-width:60px;font-size:0.8rem;" placeholder="확인방법"></td>
            <td style="padding:2px;"><input type="text" class="form-input std-pt-sample" style="min-width:70px;font-size:0.8rem;" placeholder="시료"></td>
            <td style="padding:2px;"><input type="text" class="form-input std-pt-mgmt" style="min-width:80px;font-size:0.8rem;" placeholder="관리방안"></td>
            <td style="text-align:center;padding:2px;">
                <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">
                    <span class="material-symbols-outlined" style="font-size:.85rem;">remove</span>
                </button>
            </td>`;
        tbody.appendChild(tr);
    }

    function _addRevRow() {
        const tbody = document.getElementById('stdRevBody');
        if (!tbody) return;
        const i = tbody.rows.length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:2px;"><input type="text" class="form-input std-rev-no" style="width:50px;font-size:0.8rem;text-align:center;" value="${String(i).padStart(2,'0')}"></td>
            <td style="padding:2px;"><input type="text" class="form-input std-rev-date" style="width:90px;font-size:0.8rem;"></td>
            <td style="padding:2px;"><input type="text" class="form-input std-rev-reason" style="min-width:120px;font-size:0.8rem;"></td>
            <td style="padding:2px;"><input type="text" class="form-input std-rev-confirm" style="width:70px;font-size:0.8rem;"></td>
            <td style="text-align:center;padding:2px;">
                <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">
                    <span class="material-symbols-outlined" style="font-size:.85rem;">remove</span>
                </button>
            </td>`;
        tbody.appendChild(tr);
    }

    /* ═══════════════════════════════════════════════════════════════
       저장
    ═══════════════════════════════════════════════════════════════ */
    async function saveForm(editId) {
        const g  = id => (document.getElementById(id) || {}).value || '';
        const productId = g('stdProductId');
        const carModel  = g('stdCarModel');
        const partName  = g('stdPartName');

        if (!productId && !partName) {
            UIUtils.toast('제품을 선택하거나 품명을 입력하세요.', 'warning'); return;
        }

        // 주요검사 Point 수집
        const checkPoints = [];
        document.querySelectorAll('#stdCheckBody tr').forEach(tr => {
            const item   = (tr.querySelector('.std-pt-item')   || {}).value || '';
            const std    = (tr.querySelector('.std-pt-std')    || {}).value || '';
            const method = (tr.querySelector('.std-pt-method') || {}).value || '';
            const sample = (tr.querySelector('.std-pt-sample') || {}).value || '';
            const mgmt   = (tr.querySelector('.std-pt-mgmt')   || {}).value || '';
            if (item || std) checkPoints.push({ item, standard: std, method, sample, management: mgmt });
        });

        // 개정 이력 수집
        const revisions = [];
        document.querySelectorAll('#stdRevBody tr').forEach(tr => {
            const no       = (tr.querySelector('.std-rev-no')      || {}).value || '';
            const date     = (tr.querySelector('.std-rev-date')    || {}).value || '';
            const reason   = (tr.querySelector('.std-rev-reason')  || {}).value || '';
            const confirm  = (tr.querySelector('.std-rev-confirm') || {}).value || '';
            if (no || reason) revisions.push({ no, date, reason, confirmer: confirm });
        });

        const data = {
            productId:    productId || '',
            docNo:        g('stdDocNo'),
            revNo:        g('stdRevNo'),
            processName:  g('stdProcessName') || '수입검사',
            equipment:    g('stdEquipment'),
            carModel:     carModel,
            partName:     partName,
            itemType:     g('stdItemType'),
            createdDate:  g('stdCreatedDate'),
            revisedDate:  g('stdRevisedDate'),
            author:       g('stdAuthor'),
            reviewer:     g('stdReviewer'),
            approver:     g('stdApprover'),
            procedure:    g('stdProcedure'),
            corrective:   g('stdCorrective'),
            images:       [..._formImages],
            checkPoints,
            revisions
        };

        if (editId) {
            await Storage.update(STORE, editId, data);
            UIUtils.toast('기준서가 수정되었습니다.', 'success');
        } else {
            await Storage.add(STORE, data);
            UIUtils.toast('기준서가 등록되었습니다.', 'success');
        }
        UIUtils.closeModal();
        renderList();
    }

    /* ═══════════════════════════════════════════════════════════════
       출력
    ═══════════════════════════════════════════════════════════════ */
    function printStd(id) {
        if (!id) { UIUtils.toast('저장 후 출력할 수 있습니다.', 'info'); return; }
        const std = Storage.getById(STORE, id);
        if (!std) { UIUtils.toast('기준서를 찾을 수 없습니다.', 'error'); return; }

        const checkRows = (std.checkPoints || []).map((pt, i) => `
            <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td>${_esc(pt.item || '')}</td>
                <td style="white-space:pre-wrap;">${_esc(pt.standard || '')}</td>
                <td style="text-align:center;">${_esc(pt.method || '')}</td>
                <td style="text-align:center;">${_esc(pt.sample || '')}</td>
                <td>${_esc(pt.management || '')}</td>
            </tr>`).join('');

        const imgHtml = (std.images || []).map(src =>
            `<img src="${src}" style="width:160px;height:130px;object-fit:cover;border:1px solid #ccc;margin:4px;">`
        ).join('');

        const revRows = (std.revisions || []).map(r => `
            <tr>
                <td style="text-align:center;">${_esc(r.no||'')}</td>
                <td style="text-align:center;">${_esc(r.date||'')}</td>
                <td>${_esc(r.reason||'')}</td>
                <td style="text-align:center;">${_esc(r.confirmer||'')}</td>
            </tr>`).join('');

        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <title>수입검사 기준서 - ${_esc(std.partName || '')}</title>
        <style>
            * { box-sizing:border-box; margin:0; padding:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; }
            body { padding:15mm 10mm; }
            table { border-collapse:collapse; width:100%; }
            th,td { border:1px solid #333; padding:4px 6px; vertical-align:middle; }
            th { background:#d0e4f7; font-weight:700; text-align:center; }
            .hdr-title { font-size:20px; font-weight:900; text-align:center; }
            .section-title { background:#d0e4f7; text-align:center; font-weight:700; font-size:12px; padding:5px; border:1px solid #333; }
            .no-border { border:none; }
            @media print { body { padding:0; } }
        </style></head><body>
        <table style="margin-bottom:0;">
            <tr>
                <td rowspan="3" style="width:120px;border:1px solid #333;text-align:center;padding:4px;font-size:10px;">
                    <div>공정NO</div><div style="font-weight:700;font-size:13px;">10</div>
                    <div style="margin-top:4px;">공정명</div><div style="font-weight:700;">${_esc(std.processName||'수입검사')}</div>
                    <div style="margin-top:4px;">설비명</div><div style="font-weight:700;">${_esc(std.equipment||'검사대')}</div>
                </td>
                <td rowspan="3" class="hdr-title">수입검사 기준서</td>
                <td style="width:60px;text-align:center;border:1px solid #333;">문서번호</td>
                <td style="width:120px;border:1px solid #333;font-weight:700;">${_esc(std.docNo||'')}</td>
                <td style="width:40px;text-align:center;border:1px solid #333;">작성</td>
                <td style="width:60px;border:1px solid #333;text-align:center;">${_esc(std.author||'')}</td>
                <td style="width:40px;text-align:center;border:1px solid #333;">검토</td>
                <td style="width:60px;border:1px solid #333;text-align:center;">${_esc(std.reviewer||'')}</td>
                <td style="width:40px;text-align:center;border:1px solid #333;">승인</td>
                <td style="width:60px;border:1px solid #333;text-align:center;">${_esc(std.approver||'')}</td>
            </tr>
            <tr>
                <td style="text-align:center;border:1px solid #333;">Rev No</td>
                <td style="border:1px solid #333;font-weight:700;text-align:center;">${_esc(std.revNo||'00')}</td>
                <td colspan="6" style="border:1px solid #333;"></td>
            </tr>
            <tr>
                <td style="text-align:center;border:1px solid #333;">제정일자</td>
                <td style="border:1px solid #333;">${_esc(std.createdDate||'')}</td>
                <td colspan="6" style="border:1px solid #333;"></td>
            </tr>
        </table>

        <table style="margin-top:0;">
            <tr>
                <td style="width:60px;text-align:center;border:1px solid #333;">모 델</td>
                <td style="border:1px solid #333;font-weight:700;">${_esc(std.carModel||'')}</td>
                <td style="width:60px;text-align:center;border:1px solid #333;">품 명</td>
                <td style="border:1px solid #333;font-weight:700;">${_esc(std.partName||'')}</td>
                <td style="width:60px;text-align:center;border:1px solid #333;">구 분</td>
                <td style="border:1px solid #333;font-weight:700;">${_esc(std.itemType||'')}</td>
            </tr>
        </table>

        <table style="margin-top:8px;">
            <tr>
                <td style="width:45%;vertical-align:top;border:1px solid #333;padding:6px;">
                    <div style="font-weight:700;margin-bottom:6px;text-align:center;">외관 / 치수포인트</div>
                    <div style="display:flex;flex-wrap:wrap;justify-content:center;">${imgHtml || '<div style="color:#aaa;text-align:center;padding:30px;">이미지 없음</div>'}</div>
                </td>
                <td style="width:55%;vertical-align:top;border:1px solid #333;padding:0;">
                    <div class="section-title">주요검사 Point</div>
                    <table style="border:none;">
                        <thead><tr>
                            <th style="width:24px;">No</th>
                            <th style="width:70px;">항 목</th>
                            <th>기 준</th>
                            <th style="width:50px;">확인방법</th>
                            <th style="width:65px;">시 료</th>
                            <th style="width:70px;">관리방안</th>
                        </tr></thead>
                        <tbody>${checkRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>

        <table style="margin-top:8px;">
            <tr>
                <td style="width:45%;vertical-align:top;border:1px solid #333;padding:0;">
                    <div class="section-title">검 사 순 서</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.7;">${_esc(std.procedure||'')}</div>
                </td>
                <td style="width:55%;vertical-align:top;border:1px solid #333;padding:0;">
                    <div class="section-title">조 치 사 항</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.7;">${_esc(std.corrective||'')}</div>
                    <table style="border:none;margin-top:10px;">
                        <tr>
                            <td colspan="9" style="border:none;padding-bottom:4px;">
                                <table style="width:100%;border:1px solid #333;">
                                    <tr>
                                        <td rowspan="${(std.revisions||[]).length + 2}" style="width:28px;text-align:center;writing-mode:vertical-rl;font-weight:700;">개<br>정<br>내<br>용</td>
                                        <th style="width:24px;text-align:center;">NO</th>
                                        <th style="width:70px;text-align:center;">개정일자</th>
                                        <th>개정사유</th>
                                        <th style="width:40px;text-align:center;">확인</th>
                                    </tr>
                                    ${revRows}
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        <div style="text-align:right;font-size:9px;margin-top:4px;color:#666;">A4(297×210)</div>

        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
    }

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC
    ═══════════════════════════════════════════════════════════════ */
    return {
        init,
        render,
        renderList,
        openNewForm,
        openNewFormForProduct,
        openEditForm,
        saveForm,
        printStd,
        _onProductChange,
        _addCheckRow,
        _addRevRow,
        _addImages,
        _removeImage
    };
})();
