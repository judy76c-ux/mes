/**
 * 작업 표준서 모듈 (WorkStandardModule)
 * A3 가로 2단 레이아웃: 좌=작업순서(사진), 우=조건관리표+안전관리
 */
const WorkStandardModule = (function () {

    const STORE = DB.STORES.WORK_STANDARDS;

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _js  = s => String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const _all  = () => Storage.getAll(STORE) || [];
    const _today = () => new Date().toISOString().slice(0,10);

    const _defCondRows = (n=6) => Array.from({length:n},(_,i)=>({no:i+1,item:'',standard:'',method:'',cycle:'',measure:''}));
    const _defSteps    = (n=3) => Array.from({length:n},(_,i)=>({no:i+1,name:'',photos:[],desc:''}));
    const _defRevs     = (n=7) => Array.from({length:n},(_,i)=>({no:i,date:'',reason:'',confirm:''}));

    /* ─ 구 데이터 호환 ─ */
    function _normalizeStep(s, i) {
        return {
            no:     s.no ?? i+1,
            name:   s.name || '',
            photos: s.photos || (s.photo ? [s.photo] : []),
            desc:   s.desc || s.workContent || ''
        };
    }

    let _container = null;
    let _editId    = null;
    let _editData  = null;

    function _openProdStandardsDoc(docType) {
        Router.navigate('prod-standards');
        const applyDocType = () => {
            if (window.ProdStandardsModule && typeof window.ProdStandardsModule.selectDocType === 'function') {
                window.ProdStandardsModule.selectDocType(docType);
                return true;
            }
            return false;
        };
        if (applyDocType()) return;
        let retry = 0;
        const timer = setInterval(() => {
            retry += 1;
            if (applyDocType() || retry >= 20) clearInterval(timer);
        }, 100);
    }

    function _renderTopMenu(active) {
        const items = [
            { key: 'cp-status', label: '\uAD00\uB9AC\uACC4\uD68D\uC11C\uD604\uD669', icon: 'fact_check', onClick: "WorkStandardModule._openProdStandardsDoc('cp-status')" },
            { key: 'work-standard', label: '\uC791\uC5C5\uD45C\uC900\uC11C', icon: 'assignment', onClick: "Router.navigate('work-standard')" },
            { key: 'film-thickness', label: '\uB3C4\uB9C9\uB450\uAED8 \uAE30\uC900\uC11C', icon: 'layers', onClick: "WorkStandardModule._openProdStandardsDoc('film-thickness')" },
            { key: 'color-gloss', label: '\uC0C9\uCC28/\uAD11\uD0DD \uAE30\uC900\uC11C', icon: 'palette', onClick: "WorkStandardModule._openProdStandardsDoc('color-gloss')" },
            { key: 'filter-mesh', label: '\uC5EC\uACFC\uB9DD \uAE30\uC900\uC11C', icon: 'filter_alt', onClick: "WorkStandardModule._openProdStandardsDoc('filter-mesh')" },
            { key: 'paint-tds', label: '\uB3C4\uC7A5 \uC0AC\uC591\uC11C(TDS)', icon: 'description', onClick: "WorkStandardModule._openProdStandardsDoc('paint-tds')" },
            { key: 'process-flow-chart', label: '\uACF5\uC815 \uD750\uB984\uB3C4', icon: 'account_tree', onClick: "WorkStandardModule._openProdStandardsDoc('process-flow-chart')" },
            { key: 'pfmea', label: 'PFMEA', icon: 'report_problem', onClick: "WorkStandardModule._openProdStandardsDoc('pfmea')" },
            { key: 'mixing', label: '\uBC30\uD569 \uAE30\uC900\uC11C', icon: 'science', onClick: "WorkStandardModule._openProdStandardsDoc('mixing')" },
            { key: 'paint-usage', label: '\uC0AC\uC6A9\uB7C9 \uAE30\uC900\uD45C', icon: 'straighten', onClick: "WorkStandardModule._openProdStandardsDoc('paint-usage')" }
        ];
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;">
                ${items.map(item => {
                    const isActive = active === item.key;
                    return `<button type="button" onclick="${item.onClick}"
                        style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                               border:${isActive ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)'};
                               background:var(--bg-primary);color:var(--text-primary);
                               cursor:pointer;min-width:130px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                     background:${isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)'};">
                            <span class="material-symbols-outlined" style="font-size:24px;color:${isActive ? '#fff' : 'var(--text-muted)'};">${item.icon}</span>
                        </span>
                        <span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">${item.label}</span>
                    </button>`;
                }).join('')}
            </div>
        `;
    }

    /* ════════════════════════════════════════════════════════════
       목록
    ════════════════════════════════════════════════════════════ */
    function init(container) { _container = container; render(container); }

    function render(container) {
        if (container) _container = container;
        _editId = null; _editData = null;
        _container.innerHTML = `
        <div class="fade-in-up">
            ${_renderTopMenu('work-standard')}
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="WorkStandardModule.openEditor()">
                        <span class="material-symbols-outlined">add</span> 표준서 등록
                    </button>
                </div>
            </div>
            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" id="wsFilterCar" placeholder="차종 검색..."
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group">
                    <label class="form-label">공정명</label>
                    <input type="text" class="form-input" id="wsFilterProc" placeholder="공정명 검색..."
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="wsFilterPart" placeholder="품명 검색..."
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-outline" onclick="WorkStandardModule.search()">
                        <span class="material-symbols-outlined">search</span> 조회
                    </button>
                </div>
            </div>
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th style="width:60px;text-align:center;">공정NO</th>
                                <th>공정명</th><th>차종</th><th>품명</th><th>설비명</th>
                                <th style="width:60px;text-align:center;">개정</th>
                                <th style="width:90px;text-align:center;">수정일</th>
                                <th style="width:170px;text-align:center;">작업</th>
                            </tr></thead>
                            <tbody id="wsBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        search();
    }

    function search() {
        const car  = (document.getElementById('wsFilterCar')?.value  || '').toLowerCase();
        const proc = (document.getElementById('wsFilterProc')?.value || '').toLowerCase();
        const part = (document.getElementById('wsFilterPart')?.value || '').toLowerCase();
        const rows = _all()
            .filter(r => !car  || (r.carModel||r.model||'').toLowerCase().includes(car))
            .filter(r => !proc || (r.processName||'').toLowerCase().includes(proc))
            .filter(r => !part || (r.partName||'').toLowerCase().includes(part))
            .sort((a,b) => (a.processNo||'').localeCompare(b.processNo||'','ko'));
        const tbody = document.getElementById('wsBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">
                등록된 작업 표준서가 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;"
                    onclick="WorkStandardModule.openEditor()">
                    <span class="material-symbols-outlined">add</span> 첫 표준서 등록</button></td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const lastRev = (r.revisions||[]).filter(v=>v.date).pop();
            return `<tr>
                <td style="text-align:center;">${_esc(r.processNo)}</td>
                <td><strong>${_esc(r.processName)}</strong></td>
                <td>${_esc(r.carModel||r.model||'-')}</td>
                <td>${_esc(r.partName)}</td>
                <td>${_esc(r.equipName)}</td>
                <td style="text-align:center;">${lastRev ? lastRev.no : 0}</td>
                <td style="text-align:center;font-size:0.8rem;">${(r.updatedAt||'').slice(0,10)}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm" style="background:#4b5563;color:#fff;"
                        onclick="WorkStandardModule.preview('${_js(r.id)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">preview</span>
                    </button>
                    <button class="btn btn-sm btn-outline"
                        onclick="WorkStandardModule.openEditor('${_js(r.id)}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="WorkStandardModule.remove('${_js(r.id)}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    /* ════════════════════════════════════════════════════════════
       편집기 (전체 화면)
    ════════════════════════════════════════════════════════════ */
    function openEditor(id) {
        _editId = id || null;
        const rec = id ? _all().find(r => r.id === id) : null;
        if (rec) {
            _editData = JSON.parse(JSON.stringify(rec));
            _editData.workSteps = (_editData.workSteps || _defSteps()).map(_normalizeStep);
            if (!_editData.condManage)   _editData.condManage   = _editData.conditions || _defCondRows();
            if (!_editData.selfInspect)  _editData.selfInspect  = _defCondRows();
            if (!_editData.abnormalCond) _editData.abnormalCond = _defCondRows();
            if (!_editData.carModel)     _editData.carModel     = _editData.model || '';
        } else {
            _editData = {
                processNo:'', processName:'', equipName:'', partName:'', carModel:'',
                author:'', reviewer:'', approver:'',
                authorDate:_today(), reviewerDate:'', approverDate:'',
                workSteps: _defSteps(),
                condManage:   _defCondRows(),
                selfInspect:  _defCondRows(),
                abnormalCond: _defCondRows(),
                safetyNotes:'', abnormalActions:'',
                revisions: _defRevs(),
            };
        }
        _container.innerHTML = _editorHtml(rec ? '수정' : '신규 등록');
        _renderAll();
    }

    function _editorHtml(title) {
        const d = _editData;
        const B  = 'border:1px solid #222;';
        const C  = B+'padding:2px 4px;';
        const HB = B+'padding:3px 5px;background:#bdd7ee;font-weight:700;text-align:center;font-size:8.5pt;';
        const inp = (id,val,ph) => `<input id="${id}" value="${_esc(val||'')}" placeholder="${_esc(ph||'')}"
            style="width:100%;border:none;background:transparent;font-size:8.5pt;padding:2px;font-family:inherit;">`;
        const dateInp = (id,val) => `<input type="date" id="${id}" value="${_esc(val||'')}"
            style="width:100%;border:none;background:transparent;font-size:7.5pt;padding:2px;text-align:center;font-family:inherit;">`;

        return `
        <div class="fade-in-up" style="max-width:1400px;">
            ${_renderTopMenu('work-standard')}
            <div style="display:flex;align-items:center;justify-content:space-between;
                        margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--border-color);flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="btn btn-outline btn-sm" onclick="WorkStandardModule.render()">
                        <span class="material-symbols-outlined">arrow_back</span> 목록
                    </button>
                    <h3 style="font-size:1.05rem;font-weight:700;">작업 표준서 ${_esc(title)}
                        <span style="font-weight:400;font-size:0.8rem;color:var(--text-muted);margin-left:6px;">실제 양식에 바로 입력합니다</span>
                    </h3>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" onclick="WorkStandardModule.preview(null,'edit')">
                        <span class="material-symbols-outlined">print</span> 인쇄용 미리보기
                    </button>
                    <button class="btn btn-primary" onclick="WorkStandardModule.save()">
                        <span class="material-symbols-outlined">save</span> 저장
                    </button>
                </div>
            </div>

            <div style="overflow-x:auto;background:#cbd5e1;padding:12px;border-radius:8px;">
            <div id="wsEditDocArea" style="background:#fff;margin:0 auto;width:277mm;min-height:190mm;padding:6mm 7mm;
                font-family:'맑은 고딕','나눔고딕',Arial,sans-serif;color:#000;font-size:9.5pt;line-height:1.3;">

                <!-- 헤더 -->
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:-1px;">
                    <colgroup>
                        <col style="width:8%"><col style="width:14%">
                        <col style="width:32%">
                        <col style="width:8%">
                        <col style="width:12%"><col style="width:13%"><col style="width:13%">
                    </colgroup>
                    <tbody>
                        <tr>
                            <td style="${C}font-weight:700;white-space:nowrap;font-size:8.5pt;">공정 NO</td>
                            <td style="${C}">${inp('wsProcessNo', d.processNo, '예) 60_1,2')}</td>
                            <td rowspan="5" style="${B}text-align:center;vertical-align:middle;
                                font-size:26pt;font-weight:900;letter-spacing:8px;padding:4px;">
                                작 업 표 준 서
                            </td>
                            <td style="${HB}"></td>
                            <td style="${HB}">작 성</td>
                            <td style="${HB}">생 산</td>
                            <td style="${HB}">품 질</td>
                        </tr>
                        <tr>
                            <td style="${C}font-weight:700;font-size:8.5pt;">공 정 명</td>
                            <td style="${C}">${inp('wsProcessName', d.processName, '예) 도료 공급')}</td>
                            <td rowspan="3" style="${C}font-weight:700;text-align:center;vertical-align:middle;font-size:9pt;">결<br>재</td>
                            <td rowspan="3" style="${C}text-align:center;vertical-align:middle;height:48px;">${inp('wsAuthor', d.author)}</td>
                            <td rowspan="3" style="${C}text-align:center;vertical-align:middle;">${inp('wsReviewer', d.reviewer)}</td>
                            <td rowspan="3" style="${C}text-align:center;vertical-align:middle;">${inp('wsApprover', d.approver)}</td>
                        </tr>
                        <tr>
                            <td style="${C}font-weight:700;font-size:8.5pt;">설 비 명</td>
                            <td style="${C}">${inp('wsEquipName', d.equipName, '예) B-LINE 도료탱크')}</td>
                        </tr>
                        <tr>
                            <td style="${C}font-weight:700;font-size:8.5pt;">품&nbsp;&nbsp;&nbsp;명</td>
                            <td style="${C}">${inp('wsPartName', d.partName, '예) ALL')}</td>
                        </tr>
                        <tr>
                            <td style="${C}font-weight:700;font-size:8.5pt;">모&nbsp;&nbsp;&nbsp;델</td>
                            <td style="${C}">${inp('wsCarModel', d.carModel, '예) 전차종')}</td>
                            <td style="${C}font-size:7.5pt;text-align:center;">/</td>
                            <td style="${C}">${dateInp('wsAuthorDate', d.authorDate||_today())}</td>
                            <td style="${C}">${dateInp('wsReviewerDate', d.reviewerDate)}</td>
                            <td style="${C}">${dateInp('wsApproverDate', d.approverDate)}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- 본문 2단: 좌=작업순서, 우=조건표+안전관리+이상조치 -->
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
                    <colgroup><col style="width:54%"><col style="width:46%"></colgroup>
                    <tbody>
                        <tr>
                            <td style="vertical-align:top;${B}padding:0;">
                                <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;display:flex;align-items:center;">
                                    <span style="flex:1;">작 업 순 서</span>
                                    <button type="button" class="btn btn-sm btn-outline" style="padding:1px 8px;font-size:0.68rem;"
                                        onclick="WorkStandardModule._addStep()">
                                        <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> 단계 추가
                                    </button>
                                </div>
                                <div id="wsStepsList" style="min-height:400px;padding:6px;display:flex;flex-direction:column;gap:10px;"></div>
                            </td>
                            <td style="vertical-align:top;border:1px solid #222;border-left:none;padding:0;">
                                ${_condTblEditHtml('condManage','조건관리 표준 (만드는 조건)')}
                                <div style="height:1px;background:#222;"></div>
                                ${_condTblEditHtml('selfInspect','자주검사 표준 (만들어진 조건)')}
                                <div style="height:1px;background:#222;"></div>
                                ${_condTblEditHtml('abnormalCond','이상처리 기준')}
                                <div style="height:1px;background:#222;"></div>
                                <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;">안 전 관 리</div>
                                <textarea id="wsSafetyNotes" rows="4" placeholder="줄바꿈으로 항목을 구분해 입력하세요"
                                    style="width:100%;border:none;resize:vertical;font-size:8.5pt;padding:4px 6px;font-family:inherit;">${_esc(d.safetyNotes||'')}</textarea>
                                <div style="height:1px;background:#222;"></div>
                                <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:2px;">이상 발생 시 조치사항</div>
                                <textarea id="wsAbnormalActions" rows="4" placeholder="줄바꿈으로 항목을 구분해 입력하세요"
                                    style="width:100%;border:none;resize:vertical;font-size:8.5pt;padding:4px 6px;font-family:inherit;">${_esc(d.abnormalActions||'')}</textarea>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- 개정 내용 -->
                <div style="margin-top:-1px;">
                    <div style="display:flex;align-items:center;background:#bdd7ee;${C}font-weight:700;font-size:9pt;letter-spacing:3px;">
                        <span style="flex:1;text-align:center;">개 정 내 용</span>
                        <button type="button" class="btn btn-sm btn-outline" style="padding:1px 8px;font-size:0.68rem;"
                            onclick="WorkStandardModule._addRevRow()">
                            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> 행 추가
                        </button>
                    </div>
                    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                        <colgroup>
                            <col style="width:3%"><col style="width:9%"><col style="width:30%"><col style="width:8%">
                            <col style="width:3%"><col style="width:9%"><col style="width:30%"><col style="width:8%">
                        </colgroup>
                        <thead><tr>
                            <th style="${HB}">NO</th><th style="${HB}">개정일자</th>
                            <th style="${HB}">개정사유</th><th style="${HB}">확인</th>
                            <th style="${HB}border-left:none;">NO</th><th style="${HB}border-left:none;">개정일자</th>
                            <th style="${HB}border-left:none;">개정사유</th><th style="${HB}border-left:none;">확인</th>
                        </tr></thead>
                        <tbody id="wsRevBody"></tbody>
                    </table>
                </div>

                <div style="display:flex;justify-content:space-between;margin-top:4px;
                            font-size:8pt;color:#555;border-top:1px solid #bbb;padding-top:3px;">
                    <span>(주)케이씨케미칼</span>
                    <span>A3 (420 × 297mm)</span>
                </div>
            </div>
            </div>
        </div>`;
    }

    function _condTblEditHtml(key, label) {
        const C  = 'border:1px solid #222;padding:2px 4px;';
        const HB = 'border:1px solid #222;padding:3px 4px;background:#bdd7ee;font-weight:700;text-align:center;font-size:7.8pt;';
        return `
        <div style="background:#bdd7ee;border:1px solid #222;padding:3px 5px;text-align:center;
                    font-weight:700;font-size:9pt;letter-spacing:2px;display:flex;align-items:center;">
            <span style="flex:1;">${_esc(label)}</span>
            <button type="button" onclick="WorkStandardModule._addCondRow('${key}')"
                style="border:1px solid #fff;background:rgba(255,255,255,.35);border-radius:4px;
                       color:#1e3a5f;cursor:pointer;font-size:0.65rem;padding:0 6px;line-height:1.6;">+ 행</button>
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <colgroup>
                <col style="width:6%"><col style="width:15%"><col style="width:26%">
                <col style="width:13%"><col style="width:9%"><col style="width:23%"><col style="width:8%">
            </colgroup>
            <thead><tr>
                <th style="${HB}">순</th><th style="${HB}">관리항목</th>
                <th style="${HB}">관리기준</th><th style="${HB}">확인방법</th>
                <th style="${HB}">주기</th><th style="${HB}">관리방안</th><th style="${HB}"></th>
            </tr></thead>
            <tbody id="wsCondBody_${key}"></tbody>
        </table>`;
    }

    /* ── 렌더 전체 ──────────────────────────────────────────── */
    function _renderAll() {
        _renderSteps();
        _renderCondTable('condManage');
        _renderCondTable('selfInspect');
        _renderCondTable('abnormalCond');
        _renderRevTable();
    }

    /* ── 작업 단계 카드 ─────────────────────────────────────── */
    function _renderSteps() {
        const list = document.getElementById('wsStepsList');
        if (!list) return;
        list.innerHTML = _editData.workSteps.map((s,i) => _stepCardHtml(s,i)).join('');
    }

    function _stepCardHtml(s, i) {
        const photos = s.photos || [];
        const photoSlots = photos.map((p,pi) => `
            <div style="position:relative;display:inline-block;margin:3px;">
                <img src="${p}" style="width:110px;height:88px;object-fit:cover;border-radius:5px;
                            display:block;cursor:pointer;border:2px solid var(--border-color);"
                     onclick="WorkStandardModule._replacePhoto(${i},${pi})" title="클릭하여 변경">
                <button style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.9);
                               color:#fff;border:none;border-radius:50%;width:20px;height:20px;
                               cursor:pointer;font-size:12px;line-height:1;padding:0;display:flex;
                               align-items:center;justify-content:center;"
                    onclick="WorkStandardModule._removePhoto(${i},${pi})">×</button>
            </div>`).join('');
        const addPhotoBtn = `
            <div style="display:inline-block;margin:3px;vertical-align:top;">
                <div style="width:110px;height:88px;border:2px dashed var(--border-color);border-radius:5px;
                            display:flex;flex-direction:column;align-items:center;justify-content:center;
                            cursor:pointer;color:var(--text-muted);gap:4px;background:var(--bg-secondary);"
                     onclick="WorkStandardModule._addPhoto(${i})">
                    <span class="material-symbols-outlined" style="font-size:26px;color:var(--accent-blue);">add_photo_alternate</span>
                    <span style="font-size:0.72rem;">사진 추가</span>
                </div>
            </div>`;
        return `
        <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
            <div style="background:#5da03a;color:#fff;padding:7px 12px;
                        display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:10px;flex:1;">
                    <span style="font-weight:700;font-size:0.88rem;white-space:nowrap;">Step ${i+1}.</span>
                    <input type="text" id="wsStepName_${i}" value="${_esc(s.name)}"
                           placeholder="단계 제목 입력 (예: 도료공급 통 위치 확인)"
                           style="flex:1;background:rgba(255,255,255,0.2);border:none;border-radius:4px;
                                  padding:3px 8px;color:#fff;font-size:0.85rem;font-weight:600;"
                           oninput="this.style.color='#fff'">
                </div>
                <button style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);
                               color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:0.78rem;"
                    onclick="WorkStandardModule._delStep(${i})">단계 삭제</button>
            </div>
            <div style="padding:10px;">
                <div style="display:flex;flex-wrap:wrap;align-items:flex-start;margin-bottom:8px;">
                    ${photoSlots}${addPhotoBtn}
                </div>
                <textarea class="form-input" id="wsStepDesc_${i}" rows="2"
                    style="resize:vertical;font-size:0.8rem;padding:6px 8px;width:100%;"
                    placeholder="작업 설명 입력...">${_esc(s.desc)}</textarea>
            </div>
        </div>`;
    }

    function _addStep() {
        _syncSteps();
        _editData.workSteps.push({no:_editData.workSteps.length+1, name:'', photos:[], desc:''});
        _renderSteps();
        setTimeout(() => {
            const list = document.getElementById('wsStepsList');
            if (list) list.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }, 100);
    }

    function _delStep(idx) {
        _syncSteps();
        _editData.workSteps.splice(idx,1);
        _editData.workSteps.forEach((s,i) => s.no = i+1);
        _renderSteps();
    }

    function _syncSteps() {
        _editData.workSteps.forEach((s,i) => {
            const nameEl = document.getElementById(`wsStepName_${i}`);
            const descEl = document.getElementById(`wsStepDesc_${i}`);
            if (nameEl) s.name = nameEl.value;
            if (descEl) s.desc = descEl.value;
        });
    }

    function _addPhoto(stepIdx) {
        _syncSteps();
        _openFilePicker(file => {
            _editData.workSteps[stepIdx].photos.push(file);
            _renderSteps();
        });
    }

    function _replacePhoto(stepIdx, photoIdx) {
        _syncSteps();
        _openFilePicker(file => {
            _editData.workSteps[stepIdx].photos[photoIdx] = file;
            _renderSteps();
        });
    }

    function _removePhoto(stepIdx, photoIdx) {
        _syncSteps();
        _editData.workSteps[stepIdx].photos.splice(photoIdx, 1);
        _renderSteps();
    }

    function _openFilePicker(cb) {
        const input = document.createElement('input');
        input.type  = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 3 * 1024 * 1024) { UIUtils.toast('사진은 3MB 이하로 선택하세요.','warning'); return; }
            const reader = new FileReader();
            reader.onload = ev => cb(ev.target.result);
            reader.readAsDataURL(file);
        };
        input.click();
    }

    /* ── 조건 표 ─────────────────────────────────────────────── */
    function _renderCondTable(key) {
        const tb = document.getElementById(`wsCondBody_${key}`);
        if (!tb) return;
        tb.innerHTML = (_editData[key]||[]).map((c,i) => _condRowHtml(key,c,i)).join('');
    }

    function _condRowHtml(key, c, i) {
        const C = 'border:1px solid #222;padding:1px 2px;';
        const cellInp = (id,val,ph='') => `<input id="${id}" value="${_esc(val||'')}" placeholder="${ph}"
            style="width:100%;border:none;background:transparent;font-size:7.8pt;padding:2px 3px;font-family:inherit;">`;
        return `<tr>
            <td style="${C}text-align:center;font-size:7.8pt;color:#555;">${i+1}</td>
            <td style="${C}">${cellInp(`wsCi_${key}_${i}`,c.item,'관리항목')}</td>
            <td style="${C}">${cellInp(`wsCs_${key}_${i}`,c.standard,'관리기준')}</td>
            <td style="${C}">${cellInp(`wsCm_${key}_${i}`,c.method,'확인방법')}</td>
            <td style="${C}">${cellInp(`wsCc_${key}_${i}`,c.cycle,'주기')}</td>
            <td style="${C}">${cellInp(`wsCr_${key}_${i}`,c.measure,'관리방안')}</td>
            <td style="${C}text-align:center;">
                <button type="button" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:0.75rem;font-weight:700;"
                    onclick="WorkStandardModule._delCondRow('${key}',${i})">×</button>
            </td>
        </tr>`;
    }

    function _addCondRow(key) { _syncCond(key); _editData[key].push({no:_editData[key].length+1,item:'',standard:'',method:'',cycle:'',measure:''}); _renderCondTable(key); }
    function _delCondRow(key,idx) { _syncCond(key); _editData[key].splice(idx,1); _renderCondTable(key); }

    function _syncCond(key) {
        const arr=[]; let i=0;
        while (document.getElementById(`wsCi_${key}_${i}`) !== null) {
            arr.push({no:i+1,
                item:     document.getElementById(`wsCi_${key}_${i}`).value,
                standard: document.getElementById(`wsCs_${key}_${i}`).value,
                method:   document.getElementById(`wsCm_${key}_${i}`).value,
                cycle:    document.getElementById(`wsCc_${key}_${i}`).value,
                measure:  document.getElementById(`wsCr_${key}_${i}`).value,
            });
            i++;
        }
        _editData[key] = arr;
    }

    /* ── 개정 내용 (좌/우 2열 대응 표시, id는 순차 인덱스 유지) ──── */
    function _renderRevTable() {
        const tb = document.getElementById('wsRevBody');
        if (!tb) return;
        const revs = _editData.revisions || [];
        const C = 'border:1px solid #222;padding:1px 2px;';
        const cellInp = (id,val,type) => `<input type="${type||'text'}" id="${id}" value="${_esc(val||'')}"
            style="width:100%;border:none;background:transparent;font-size:7.6pt;padding:2px 3px;font-family:inherit;
                   text-align:${type==='date'?'center':'left'};">`;
        const half = Math.ceil(revs.length/2);
        const L = revs.slice(0, half), R = revs.slice(half);
        tb.innerHTML = L.map((l, i) => {
            const leftIdx = i, rightIdx = half + i;
            const r = R[i];
            return `<tr style="height:20px;">
                <td style="${C}text-align:center;font-size:7.6pt;color:#555;">${l.no}</td>
                <td style="${C}">${cellInp('wsRd_'+leftIdx, l.date, 'date')}</td>
                <td style="${C}">${cellInp('wsRr_'+leftIdx, l.reason)}</td>
                <td style="${C}">${cellInp('wsRc_'+leftIdx, l.confirm)}</td>
                ${r ? `
                <td style="${C}border-left:none;text-align:center;font-size:7.6pt;color:#555;">${r.no}</td>
                <td style="${C}border-left:none;">${cellInp('wsRd_'+rightIdx, r.date, 'date')}</td>
                <td style="${C}border-left:none;">${cellInp('wsRr_'+rightIdx, r.reason)}</td>
                <td style="${C}border-left:none;">${cellInp('wsRc_'+rightIdx, r.confirm)}</td>`
                    : `<td colspan="4" style="${C}border-left:none;"></td>`}
            </tr>`;
        }).join('');
    }

    function _syncRevs() {
        const arr=[]; let i=0;
        while (document.getElementById(`wsRd_${i}`) !== null) {
            arr.push({no:_editData.revisions[i]?.no??i,
                date:    document.getElementById(`wsRd_${i}`).value,
                reason:  document.getElementById(`wsRr_${i}`).value,
                confirm: document.getElementById(`wsRc_${i}`).value,
            });
            i++;
        }
        _editData.revisions = arr;
    }

    function _addRevRow() {
        _syncRevs();
        _editData.revisions.push({no:_editData.revisions.length, date:'', reason:'', confirm:''});
        _renderRevTable();
    }

    /* ── 전체 수집 ──────────────────────────────────────────── */
    function _collectAll() {
        _syncSteps(); _syncCond('condManage'); _syncCond('selfInspect'); _syncCond('abnormalCond'); _syncRevs();
        return {
            processNo:       document.getElementById('wsProcessNo')?.value.trim()    ||'',
            processName:     document.getElementById('wsProcessName')?.value.trim()  ||'',
            carModel:        document.getElementById('wsCarModel')?.value.trim()     ||'',
            partName:        document.getElementById('wsPartName')?.value.trim()     ||'',
            equipName:       document.getElementById('wsEquipName')?.value.trim()    ||'',
            author:          document.getElementById('wsAuthor')?.value.trim()       ||'',
            reviewer:        document.getElementById('wsReviewer')?.value.trim()     ||'',
            approver:        document.getElementById('wsApprover')?.value.trim()     ||'',
            authorDate:      document.getElementById('wsAuthorDate')?.value          ||'',
            reviewerDate:    document.getElementById('wsReviewerDate')?.value        ||'',
            approverDate:    document.getElementById('wsApproverDate')?.value        ||'',
            workSteps:       _editData.workSteps,
            condManage:      _editData.condManage,
            selfInspect:     _editData.selfInspect,
            abnormalCond:    _editData.abnormalCond,
            safetyNotes:     document.getElementById('wsSafetyNotes')?.value         ||'',
            abnormalActions: document.getElementById('wsAbnormalActions')?.value      ||'',
            revisions:       _editData.revisions,
            updatedAt:       new Date().toISOString(),
        };
    }

    /* ════════════════════════════════════════════════════════════
       저장 / 삭제
    ════════════════════════════════════════════════════════════ */
    async function save() {
        const data = _collectAll();
        if (!data.processName) { UIUtils.toast('공정명을 입력하세요.','error'); return; }
        if (!data.carModel)    { UIUtils.toast('차종을 입력하세요.','error'); return; }
        try {
            if (_editId) {
                await Storage.update(STORE, {id:_editId, ...data});
                UIUtils.toast('저장되었습니다.','success');
            } else {
                await Storage.add(STORE, data);
                UIUtils.toast('등록되었습니다.','success');
            }
            render();
        } catch(e) { UIUtils.toast('저장 실패: '+e.message,'error'); }
    }

    async function remove(id) {
        UIUtils.confirm('이 작업 표준서를 삭제하시겠습니까?', async () => {
            try { await Storage.remove(STORE, id); UIUtils.toast('삭제되었습니다.','success'); search(); }
            catch(e) { UIUtils.toast('삭제 실패: '+e.message,'error'); }
        });
    }

    /* ════════════════════════════════════════════════════════════
       미리보기 / 인쇄
    ════════════════════════════════════════════════════════════ */
    function preview(id, mode) {
        const rec = mode === 'edit' ? _collectAll() : _all().find(r => r.id === id);
        if (!rec) return;
        _showPreview(rec);
    }

    function _showPreview(rec) {
        const old = document.getElementById('wsPreviewOverlay');
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.id = 'wsPreviewOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999;'+
            'display:flex;flex-direction:column;overflow:auto;padding:16px;';
        overlay.innerHTML = `
            <div style="max-width:1240px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;width:100%;">
                <div style="background:#1e293b;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#fff;font-weight:600;">
                        작업 표준서 — ${_esc(rec.processName)} [${_esc(rec.carModel||'')}]
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="WorkStandardModule._doPrint()">
                            <span class="material-symbols-outlined">print</span> 인쇄
                        </button>
                        <button class="btn btn-secondary btn-sm"
                            onclick="document.getElementById('wsPreviewOverlay').remove()">닫기</button>
                    </div>
                </div>
                <div style="padding:12px;overflow-x:auto;background:#cbd5e1;">
                    <div id="wsDocArea" style="background:#fff;margin:0 auto;
                        width:277mm;min-height:190mm;padding:6mm 7mm;
                        font-family:'맑은 고딕','나눔고딕',Arial,sans-serif;
                        color:#000;font-size:9.5pt;line-height:1.3;">
                        ${_buildDocHtml(rec)}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    function _doPrint() {
        const content = document.getElementById('wsDocArea')?.innerHTML;
        if (!content) return;
        const w = window.open('','_blank','width=1280,height=900');
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>작업 표준서</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:'맑은 고딕','나눔고딕',Arial,sans-serif;color:#000;background:#fff;font-size:9.5pt;}
            table{border-collapse:collapse;}
            @media print{
                @page{size:A3 landscape;margin:6mm;}
                body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
                .no-print{display:none;}
            }
        </style></head><body>${content}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(()=>{w.print();},600);
    }

    /* ════════════════════════════════════════════════════════════
       A3 문서 HTML 빌더 — 이미지와 동일한 2단 레이아웃
    ════════════════════════════════════════════════════════════ */
    function _buildDocHtml(rec) {
        const B  = 'border:1px solid #222;';
        const C  = B+'padding:2px 4px;';
        const HB = B+'padding:3px 5px;background:#bdd7ee;font-weight:700;text-align:center;font-size:8.5pt;';

        /* ── 헤더 행 ─────────────────────────────────────────── */
        /* 비율: 기본정보(8+14=22%) | 제목(32%) | 결재라벨(8%) | 작성·생산·품질(12+13+13=38%) */
        const header = `
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:-1px;">
            <colgroup>
                <col style="width:8%"><col style="width:14%">
                <col style="width:32%">
                <col style="width:8%">
                <col style="width:12%"><col style="width:13%"><col style="width:13%">
            </colgroup>
            <tbody>
                <tr>
                    <td style="${C}font-weight:700;white-space:nowrap;font-size:8.5pt;">공정 NO</td>
                    <td style="${C}font-size:8.5pt;">${_esc(rec.processNo)}</td>
                    <td rowspan="5" style="${B}text-align:center;vertical-align:middle;
                        font-size:26pt;font-weight:900;letter-spacing:8px;padding:4px;">
                        작 업 표 준 서
                    </td>
                    <td style="${HB}"></td>
                    <td style="${HB}">작 성</td>
                    <td style="${HB}">생 산</td>
                    <td style="${HB}">품 질</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">공 정 명</td>
                    <td style="${C}font-size:8.5pt;">${_esc(rec.processName)}</td>
                    <td rowspan="3" style="${C}font-weight:700;text-align:center;vertical-align:middle;font-size:9pt;">결<br>재</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;height:48px;font-size:9pt;">${_esc(rec.author)}</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;font-size:9pt;">${_esc(rec.reviewer)}</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;font-size:9pt;">${_esc(rec.approver)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">설 비 명</td>
                    <td style="${C}font-size:8.5pt;">${_esc(rec.equipName)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">품&nbsp;&nbsp;&nbsp;명</td>
                    <td style="${C}font-size:8.5pt;">${_esc(rec.partName)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">모&nbsp;&nbsp;&nbsp;델</td>
                    <td style="${C}font-size:8.5pt;">${_esc(rec.carModel||rec.model||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">/</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(rec.authorDate||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(rec.reviewerDate||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(rec.approverDate||'')}</td>
                </tr>
            </tbody>
        </table>`;

        /* ── 좌측: 작업 순서 (각 단계 = 녹색 헤더 + 사진행 + 설명) ─ */
        const steps = (rec.workSteps||[]).map(_normalizeStep);
        const stepsHtml = steps.length ? steps.map((s,i) => {
            const photos = s.photos || [];
            const photoTdW = photos.length > 0
                ? Math.floor(100 / Math.max(photos.length, 1)) + '%'
                : '100%';
            const photoRow = photos.length > 0
                ? `<tr>${photos.map(p => `
                    <td style="padding:2px;text-align:center;vertical-align:top;width:${photoTdW};">
                        <img src="${p}" style="width:100%;max-height:92px;object-fit:cover;display:block;">
                    </td>`).join('')}</tr>`
                : '';
            const descRow = s.desc
                ? `<tr><td colspan="${Math.max(photos.length,1)}"
                        style="padding:4px 5px;font-size:8.5pt;white-space:pre-wrap;vertical-align:top;${B}">
                        ${_esc(s.desc).replace(/\n/g,'<br>')}
                   </td></tr>`
                : '';
            return `
            <div style="margin-bottom:0;">
                <div style="background:#5da03a;color:#fff;padding:3px 7px;
                            font-weight:700;font-size:9pt;letter-spacing:0.5px;">
                    ${i+1}. ${_esc(s.name||'작업 단계 '+(i+1))}
                </div>
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                    <tbody>${photoRow}${descRow}</tbody>
                </table>
            </div>`;
        }).join('<div style="height:1px;background:#222;"></div>')
        : `<div style="padding:20px;text-align:center;color:#999;">작업 순서를 입력하세요.</div>`;

        /* ── 우측: 조건관리 표준 ─────────────────────────────── */
        const _condTbl = (rows, label) => {
            const data = [...(rows||[])];
            while (data.length < 5) data.push({no:data.length+1,item:'',standard:'',method:'',cycle:'',measure:''});
            return `
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;
                        font-size:9pt;letter-spacing:2px;">${label}</div>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                <colgroup>
                    <col style="width:6%"><col style="width:16%"><col style="width:27%">
                    <col style="width:14%"><col style="width:9%"><col style="width:28%">
                </colgroup>
                <thead><tr>
                    <th style="${HB}">순</th><th style="${HB}">관리항목</th>
                    <th style="${HB}">관리기준</th><th style="${HB}">확인방법</th>
                    <th style="${HB}">주기</th><th style="${HB}">관리방안</th>
                </tr></thead>
                <tbody>${data.map(c=>`<tr style="height:23px;">
                    <td style="${C}text-align:center;">${c.no}</td>
                    <td style="${C}">${_esc(c.item)}</td>
                    <td style="${C}">${_esc(c.standard)}</td>
                    <td style="${C}text-align:center;">${_esc(c.method)}</td>
                    <td style="${C}text-align:center;">${_esc(c.cycle)}</td>
                    <td style="${C}">${_esc(c.measure)}</td>
                </tr>`).join('')}</tbody>
            </table>`;
        };

        const safetyLines = (rec.safetyNotes||'').split('\n').filter(Boolean);
        const safetyHtml = safetyLines.map((l,i)=>`<div style="padding:2px 0;">${i+1}. ${_esc(l)}</div>`).join('') ||
            '<div style="height:40px;"></div>';

        const actionLines = (rec.abnormalActions||'').split('\n').filter(Boolean);
        const actionHtml = actionLines.map((l,i)=>`<div style="padding:2px 0;">${i+1}. ${_esc(l)}</div>`).join('') ||
            '<div style="height:40px;"></div>';

        const rightCol = `
            ${_condTbl(rec.condManage, '조건관리 표준 (만드는 조건)')}
            ${rec.selfInspect && rec.selfInspect.some(r=>r.item) ? '<div style="height:1px;background:#222;"></div>' + _condTbl(rec.selfInspect,'자주검사 표준 (만들어진 조건)') : ''}
            ${rec.abnormalCond && rec.abnormalCond.some(r=>r.item) ? '<div style="height:1px;background:#222;"></div>' + _condTbl(rec.abnormalCond,'이상처리 기준') : ''}
            <div style="height:1px;background:#222;"></div>
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;">안 전 관 리</div>
            <div style="${C}font-size:8.5pt;min-height:38px;padding:4px 6px;">${safetyHtml}</div>
            <div style="height:1px;background:#222;"></div>
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:2px;">이상 발생 시 조치사항</div>
            <div style="${C}font-size:8.5pt;min-height:38px;padding:4px 6px;">${actionHtml}</div>`;

        /* ── 2단 본문: 좌54% 우46% ─────────────────────────── */
        const body = `
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
            <colgroup><col style="width:54%"><col style="width:46%"></colgroup>
            <tbody>
                <tr>
                    <td style="vertical-align:top;${B}padding:0;">
                        ${stepsHtml}
                    </td>
                    <td style="vertical-align:top;border:1px solid #222;border-left:none;padding:0;">
                        ${rightCol}
                    </td>
                </tr>
            </tbody>
        </table>`;

        /* ── 개정 내용 ─────────────────────────────────────── */
        const revs = rec.revisions || _defRevs();
        const half = Math.ceil(revs.length/2);
        const lR = revs.slice(0,half), rR = revs.slice(half);
        const revRows = lR.map((l,i) => {
            const r = rR[i];
            return `<tr style="height:20px;">
                <td style="${C}text-align:center;">${l.no}</td>
                <td style="${C}text-align:center;">${_esc(l.date)}</td>
                <td style="${C}">${_esc(l.reason)}</td>
                <td style="${C}text-align:center;">${_esc(l.confirm)}</td>
                ${r ? `<td style="${C}text-align:center;">${r.no}</td>
                       <td style="${C}text-align:center;">${_esc(r.date)}</td>
                       <td style="${C}">${_esc(r.reason)}</td>
                       <td style="${C}text-align:center;">${_esc(r.confirm)}</td>`
                    : '<td colspan="4" style="'+B+'"></td>'}
            </tr>`;
        }).join('');

        /* 개정내용: NO(3%) 날짜(9%) 사유(30%) 확인(8%) × 2 = 100% */
        const revision = `
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
            <colgroup>
                <col style="width:3%"><col style="width:9%"><col style="width:30%"><col style="width:8%">
                <col style="width:3%"><col style="width:9%"><col style="width:30%"><col style="width:8%">
            </colgroup>
            <tbody>
                <tr>
                    <td colspan="4" style="${HB}letter-spacing:3px;">개 정 내 용</td>
                    <td colspan="4" style="${HB}letter-spacing:3px;border-left:none;">개 정 내 용</td>
                </tr>
                <tr>
                    <th style="${HB}">NO</th><th style="${HB}">개정일자</th>
                    <th style="${HB}">개정사유</th><th style="${HB}">확인</th>
                    <th style="${HB}border-left:none;">NO</th><th style="${HB}border-left:none;">개정일자</th>
                    <th style="${HB}border-left:none;">개정사유</th><th style="${HB}border-left:none;">확인</th>
                </tr>
                ${revRows}
            </tbody>
        </table>`;

        const footer = `
        <div style="display:flex;justify-content:space-between;margin-top:4px;
                    font-size:8pt;color:#555;border-top:1px solid #bbb;padding-top:3px;">
            <span>(주)케이씨케미칼</span>
            <span>A3 (420 × 297mm)</span>
        </div>`;

        return header + body + revision + footer;
    }

    /* ════════════════════════════════════════════════════════════
       공개 API
    ════════════════════════════════════════════════════════════ */
    return {
        init, render, search,
        openEditor, save, remove, preview, _doPrint,
        _addStep, _delStep, _addPhoto, _replacePhoto, _removePhoto,
        _addCondRow, _delCondRow, _addRevRow,
        _openProdStandardsDoc,
    };
})();
