/**
 * 작업 표준서 모듈 (WorkStandardModule)
 * 생산관리 > 제조관리 표준 > 작업 표준서
 * - 차종/공정별 조회
 * - 사진 업로드 (작업 순서별)
 * - 3개 조건관리 표 (조건관리표준 / 자주검사표준 / 이상처리기준)
 * - A3 미리보기/인쇄
 */
const WorkStandardModule = (function () {

    const STORE = DB.STORES.WORK_STANDARDS;

    /* ── 헬퍼 ────────────────────────────────────────────────── */
    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _js  = s => String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const _all  = () => Storage.getAll(STORE) || [];
    const _today = () => new Date().toISOString().slice(0,10);

    /* ── 기본 데이터 ─────────────────────────────────────────── */
    const _defCondRows = (n=5) => Array.from({length:n}, (_,i) =>
        ({no:i+1, item:'', standard:'', method:'', cycle:'', measure:''}));
    const _defSteps    = (n=6) => Array.from({length:n}, (_,i) =>
        ({no:i+1, desc:'', photo:''}));
    const _defRevs     = (n=7) => Array.from({length:n}, (_,i) =>
        ({no:i, date:'', reason:'', confirm:''}));

    /* ── 편집 상태 ───────────────────────────────────────────── */
    let _container = null;   // 메인 컨테이너
    let _editId    = null;
    let _editData  = null;   // 편집 중인 전체 데이터 (steps, conds 포함)

    /* ════════════════════════════════════════════════════════════
       목록 페이지
    ════════════════════════════════════════════════════════════ */
    function init(container) {
        _container = container;
        render(container);
    }

    function render(container) {
        if (container) _container = container;
        _editId   = null;
        _editData = null;
        _container.innerHTML = `
        <div class="fade-in-up">
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
                    <input type="text" class="form-input" id="wsFilterCar"
                           placeholder="차종 검색..." style="min-width:110px;"
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group">
                    <label class="form-label">공정명</label>
                    <input type="text" class="form-input" id="wsFilterProc"
                           placeholder="공정명 검색..." style="min-width:120px;"
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="wsFilterPart"
                           placeholder="품명 검색..." style="min-width:110px;"
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
                            <thead>
                                <tr>
                                    <th style="width:60px;text-align:center;">공정NO</th>
                                    <th>공정명</th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>설비명</th>
                                    <th style="width:60px;text-align:center;">개정NO</th>
                                    <th style="width:90px;text-align:center;">수정일</th>
                                    <th style="width:170px;text-align:center;">작업</th>
                                </tr>
                            </thead>
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
                    <span class="material-symbols-outlined">add</span> 첫 표준서 등록
                </button></td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const lastRev = (r.revisions||[]).filter(v=>v.date).pop();
            const revNo   = lastRev ? lastRev.no : 0;
            return `<tr>
                <td style="text-align:center;">${_esc(r.processNo)}</td>
                <td><strong>${_esc(r.processName)}</strong></td>
                <td>${_esc(r.carModel||r.model||'-')}</td>
                <td>${_esc(r.partName)}</td>
                <td>${_esc(r.equipName)}</td>
                <td style="text-align:center;">${revNo}</td>
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
       전체 화면 편집기
    ════════════════════════════════════════════════════════════ */
    function openEditor(id) {
        _editId   = id || null;
        const rec = id ? _all().find(r => r.id === id) : null;
        _editData = rec ? JSON.parse(JSON.stringify(rec)) : {
            processNo: '', processName: '', equipName: '', partName: '',
            carModel: '', author: '', reviewer: '', approver: '',
            authorDate: _today(), reviewerDate: '', approverDate: '',
            workSteps:    _defSteps(),
            condManage:   _defCondRows(5),
            selfInspect:  _defCondRows(5),
            abnormalCond: _defCondRows(5),
            safetyNotes: '', abnormalActions: '',
            revisions: _defRevs(),
            updatedAt: ''
        };
        /* 기존 데이터 호환 */
        if (!_editData.workSteps)    _editData.workSteps    = _defSteps();
        if (!_editData.condManage)   _editData.condManage   = _editData.conditions || _defCondRows(5);
        if (!_editData.selfInspect)  _editData.selfInspect  = _defCondRows(5);
        if (!_editData.abnormalCond) _editData.abnormalCond = _defCondRows(5);
        if (!_editData.carModel)     _editData.carModel     = _editData.model || '';

        _container.innerHTML = _editorHtml(rec ? '수정' : '신규 등록');
        _renderAll();
    }

    function _editorHtml(title) {
        const d = _editData;
        const v = k => _esc(d[k] || '');
        return `
        <div class="fade-in-up" style="max-width:1200px;">
            <!-- 편집기 헤더 -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="btn btn-outline btn-sm" onclick="WorkStandardModule.render()">
                        <span class="material-symbols-outlined">arrow_back</span> 목록
                    </button>
                    <h3 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);">
                        작업 표준서 ${_esc(title)}
                    </h3>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" onclick="WorkStandardModule.preview(null,'edit')">
                        <span class="material-symbols-outlined">preview</span> 미리보기
                    </button>
                    <button class="btn btn-primary" onclick="WorkStandardModule.save()">
                        <span class="material-symbols-outlined">save</span> 저장
                    </button>
                </div>
            </div>

            <!-- ① 기본 정보 + 결재 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">info</span> 기본 정보 및 결재</h4></div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;">
                        <div class="form-group">
                            <label class="form-label">공정 NO</label>
                            <input type="text" class="form-input" id="wsProcessNo" value="${v('processNo')}" placeholder="예) P-001">
                        </div>
                        <div class="form-group">
                            <label class="form-label">공정명 <span style="color:var(--accent-red);">*</span></label>
                            <input type="text" class="form-input" id="wsProcessName" value="${v('processName')}" placeholder="예) 도장">
                        </div>
                        <div class="form-group">
                            <label class="form-label">차종 <span style="color:var(--accent-red);">*</span></label>
                            <input type="text" class="form-input" id="wsCarModel" value="${v('carModel')}" placeholder="예) A3, Q2">
                        </div>
                        <div class="form-group">
                            <label class="form-label">품명</label>
                            <input type="text" class="form-input" id="wsPartName" value="${v('partName')}" placeholder="품명">
                        </div>
                        <div class="form-group">
                            <label class="form-label">설비명</label>
                            <input type="text" class="form-input" id="wsEquipName" value="${v('equipName')}" placeholder="설비명">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                        <div class="form-group"><label class="form-label">작성자</label>
                            <input type="text" class="form-input" id="wsAuthor" value="${v('author')}"></div>
                        <div class="form-group"><label class="form-label">검토자</label>
                            <input type="text" class="form-input" id="wsReviewer" value="${v('reviewer')}"></div>
                        <div class="form-group"><label class="form-label">승인자</label>
                            <input type="text" class="form-input" id="wsApprover" value="${v('approver')}"></div>
                        <div class="form-group"><label class="form-label">작성일</label>
                            <input type="date" class="form-input" id="wsAuthorDate" value="${v('authorDate') || _today()}"></div>
                        <div class="form-group"><label class="form-label">검토일</label>
                            <input type="date" class="form-input" id="wsReviewerDate" value="${v('reviewerDate')}"></div>
                        <div class="form-group"><label class="form-label">승인일</label>
                            <input type="date" class="form-input" id="wsApproverDate" value="${v('approverDate')}"></div>
                    </div>
                </div>
            </div>

            <!-- ② 작업 순서 (사진 + 설명) -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                    <h4><span class="material-symbols-outlined">format_list_numbered</span> 작업 순서</h4>
                    <button class="btn btn-sm btn-outline" onclick="WorkStandardModule._addStep()">
                        <span class="material-symbols-outlined">add</span> 단계 추가
                    </button>
                </div>
                <div class="card-body">
                    <div id="wsStepsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;"></div>
                </div>
            </div>

            <!-- ③ 조건관리 표준 -->
            ${_condSectionHtml('condManage','조건관리 표준 (만드는 조건)')}

            <!-- ④ 자주검사 표준 -->
            ${_condSectionHtml('selfInspect','자주검사 표준 (만들어진 조건)')}

            <!-- ⑤ 이상처리 기준 -->
            ${_condSectionHtml('abnormalCond','이상처리 기준')}

            <!-- ⑥ 안전 관리 / 이상 발생기 조치사항 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">health_and_safety</span> 안전 관리 / 이상 조치</h4></div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        <div class="form-group">
                            <label class="form-label">안전 관리</label>
                            <textarea class="form-input" id="wsSafetyNotes" rows="4"
                                style="resize:vertical;"
                                placeholder="안전 주의사항을 줄바꿈으로 구분하여 입력...">${_esc(d.safetyNotes||'')}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">이상 발생기 조치사항</label>
                            <textarea class="form-input" id="wsAbnormalActions" rows="4"
                                style="resize:vertical;"
                                placeholder="이상 발생 시 조치사항을 입력...">${_esc(d.abnormalActions||'')}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ⑦ 개정 내용 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">history</span> 개정 내용</h4></div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table" style="font-size:0.82rem;" id="wsRevTable">
                            <thead><tr>
                                <th style="width:50px;text-align:center;">NO</th>
                                <th style="width:130px;">개정일자</th>
                                <th>개정사유</th>
                                <th style="width:100px;">확인</th>
                            </tr></thead>
                            <tbody id="wsRevBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _condSectionHtml(key, title) {
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                <h4><span class="material-symbols-outlined">table_chart</span> ${_esc(title)}</h4>
                <button class="btn btn-sm btn-outline" onclick="WorkStandardModule._addCondRow('${key}')">
                    <span class="material-symbols-outlined">add</span> 행 추가
                </button>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:0.81rem;" id="wsCondTable_${key}">
                        <thead><tr>
                            <th style="width:36px;text-align:center;">순</th>
                            <th>관리항목</th>
                            <th>관리기준</th>
                            <th style="width:100px;">확인방법</th>
                            <th style="width:70px;">주기</th>
                            <th>관리방안</th>
                            <th style="width:40px;"></th>
                        </tr></thead>
                        <tbody id="wsCondBody_${key}"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    /* ── 전체 렌더 ───────────────────────────────────────────── */
    function _renderAll() {
        _renderSteps();
        _renderCondTable('condManage');
        _renderCondTable('selfInspect');
        _renderCondTable('abnormalCond');
        _renderRevTable();
    }

    /* ── 작업 순서 카드 ─────────────────────────────────────── */
    function _renderSteps() {
        const grid = document.getElementById('wsStepsGrid');
        if (!grid) return;
        grid.innerHTML = _editData.workSteps.map((s, i) => _stepCardHtml(s, i)).join('');
    }

    function _stepCardHtml(s, i) {
        const photoHtml = s.photo
            ? `<img src="${s.photo}" style="width:100%;height:140px;object-fit:cover;display:block;cursor:pointer;border-radius:6px;"
                   onclick="WorkStandardModule._uploadPhoto(${i})" title="클릭하여 사진 변경">`
            : `<div style="width:100%;height:140px;display:flex;flex-direction:column;align-items:center;
                           justify-content:center;background:var(--bg-secondary);border:2px dashed var(--border-color);
                           border-radius:6px;cursor:pointer;color:var(--text-muted);gap:6px;"
                    onclick="WorkStandardModule._uploadPhoto(${i})">
                    <span class="material-symbols-outlined" style="font-size:32px;color:var(--accent-blue);">add_photo_alternate</span>
                    <span style="font-size:0.75rem;">사진 추가</span>
               </div>`;
        return `
        <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff;">
            <div style="background:var(--bg-tertiary);padding:6px 10px;display:flex;
                        align-items:center;justify-content:space-between;">
                <span style="font-weight:700;color:var(--accent-blue);font-size:0.88rem;">Step ${i+1}</span>
                <div style="display:flex;gap:4px;">
                    ${s.photo ? `<button class="btn btn-sm" style="padding:2px 6px;font-size:0.72rem;background:var(--accent-red);color:#fff;border:none;"
                        onclick="WorkStandardModule._clearPhoto(${i})" title="사진 삭제">
                        <span class="material-symbols-outlined" style="font-size:13px;">delete</span>
                    </button>` : ''}
                    <button class="btn btn-sm" style="padding:2px 6px;font-size:0.72rem;border:1px solid var(--border-color);"
                        onclick="WorkStandardModule._delStep(${i})" title="단계 삭제">
                        <span class="material-symbols-outlined" style="font-size:13px;">close</span>
                    </button>
                </div>
            </div>
            <div style="padding:8px;">
                ${photoHtml}
                <textarea class="form-input" id="wsStep_${i}" rows="2"
                    style="margin-top:8px;resize:none;font-size:0.8rem;padding:5px 7px;width:100%;"
                    placeholder="작업 내용 입력...">${_esc(s.desc)}</textarea>
            </div>
        </div>`;
    }

    function _addStep() {
        _syncSteps();
        _editData.workSteps.push({no: _editData.workSteps.length+1, desc:'', photo:''});
        _renderSteps();
    }

    function _delStep(idx) {
        _syncSteps();
        _editData.workSteps.splice(idx, 1);
        _editData.workSteps.forEach((s,i) => s.no = i+1);
        _renderSteps();
    }

    function _syncSteps() {
        _editData.workSteps.forEach((s, i) => {
            const ta = document.getElementById(`wsStep_${i}`);
            if (ta) s.desc = ta.value;
        });
    }

    function _uploadPhoto(idx) {
        const input = document.createElement('input');
        input.type  = 'file';
        input.accept = 'image/*';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                UIUtils.toast('사진 크기는 2MB 이하로 선택하세요.', 'warning');
                return;
            }
            _syncSteps();
            const reader = new FileReader();
            reader.onload = ev => {
                _editData.workSteps[idx].photo = ev.target.result;
                _renderSteps();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function _clearPhoto(idx) {
        _syncSteps();
        _editData.workSteps[idx].photo = '';
        _renderSteps();
    }

    /* ── 조건 표 ─────────────────────────────────────────────── */
    function _renderCondTable(key) {
        const tb = document.getElementById(`wsCondBody_${key}`);
        if (!tb) return;
        tb.innerHTML = (_editData[key] || []).map((c,i) => _condRowHtml(key,c,i)).join('');
    }

    function _condRowHtml(key, c, i) {
        const inp = (id, val, ph='') =>
            `<input class="form-input" id="${id}" value="${_esc(val||'')}" placeholder="${ph}"
             style="width:100%;font-size:0.78rem;padding:3px 5px;">`;
        return `<tr>
            <td style="text-align:center;color:var(--text-muted);">${i+1}</td>
            <td>${inp(`wsCi_${key}_${i}`, c.item, '관리항목')}</td>
            <td>${inp(`wsCs_${key}_${i}`, c.standard, '관리기준')}</td>
            <td>${inp(`wsCm_${key}_${i}`, c.method, '확인방법')}</td>
            <td>${inp(`wsCc_${key}_${i}`, c.cycle, '주기')}</td>
            <td>${inp(`wsCr_${key}_${i}`, c.measure, '관리방안')}</td>
            <td style="text-align:center;">
                <button type="button" class="btn btn-sm btn-danger"
                    style="padding:2px 7px;font-size:0.75rem;"
                    onclick="WorkStandardModule._delCondRow('${key}',${i})">×</button>
            </td>
        </tr>`;
    }

    function _addCondRow(key) {
        _syncCond(key);
        _editData[key].push({no:_editData[key].length+1, item:'', standard:'', method:'', cycle:'', measure:''});
        _renderCondTable(key);
    }

    function _delCondRow(key, idx) {
        _syncCond(key);
        _editData[key].splice(idx, 1);
        _renderCondTable(key);
    }

    function _syncCond(key) {
        const arr = [];
        let i = 0;
        while (document.getElementById(`wsCi_${key}_${i}`) !== null) {
            arr.push({
                no:       i+1,
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

    /* ── 개정 내용 표 ───────────────────────────────────────── */
    function _renderRevTable() {
        const tb = document.getElementById('wsRevBody');
        if (!tb) return;
        tb.innerHTML = (_editData.revisions || []).map((r,i) => `<tr>
            <td style="text-align:center;color:var(--text-muted);">${r.no}</td>
            <td><input type="date" class="form-input" id="wsRd_${i}" value="${_esc(r.date||'')}"
                style="width:100%;font-size:0.78rem;padding:3px 5px;"></td>
            <td><input class="form-input" id="wsRr_${i}" value="${_esc(r.reason||'')}"
                style="width:100%;font-size:0.78rem;padding:3px 5px;"></td>
            <td><input class="form-input" id="wsRc_${i}" value="${_esc(r.confirm||'')}"
                style="width:100%;font-size:0.78rem;padding:3px 5px;"></td>
        </tr>`).join('');
    }

    function _syncRevs() {
        const arr = []; let i = 0;
        while (document.getElementById(`wsRd_${i}`) !== null) {
            arr.push({
                no:      _editData.revisions[i]?.no ?? i,
                date:    document.getElementById(`wsRd_${i}`).value,
                reason:  document.getElementById(`wsRr_${i}`).value,
                confirm: document.getElementById(`wsRc_${i}`).value,
            });
            i++;
        }
        _editData.revisions = arr;
    }

    /* ── 전체 수집 ──────────────────────────────────────────── */
    function _collectAll() {
        _syncSteps();
        _syncCond('condManage');
        _syncCond('selfInspect');
        _syncCond('abnormalCond');
        _syncRevs();
        return {
            processNo:      document.getElementById('wsProcessNo')?.value.trim()    || '',
            processName:    document.getElementById('wsProcessName')?.value.trim()  || '',
            carModel:       document.getElementById('wsCarModel')?.value.trim()     || '',
            partName:       document.getElementById('wsPartName')?.value.trim()     || '',
            equipName:      document.getElementById('wsEquipName')?.value.trim()    || '',
            author:         document.getElementById('wsAuthor')?.value.trim()       || '',
            reviewer:       document.getElementById('wsReviewer')?.value.trim()     || '',
            approver:       document.getElementById('wsApprover')?.value.trim()     || '',
            authorDate:     document.getElementById('wsAuthorDate')?.value          || '',
            reviewerDate:   document.getElementById('wsReviewerDate')?.value        || '',
            approverDate:   document.getElementById('wsApproverDate')?.value        || '',
            workSteps:      _editData.workSteps,
            condManage:     _editData.condManage,
            selfInspect:    _editData.selfInspect,
            abnormalCond:   _editData.abnormalCond,
            safetyNotes:    document.getElementById('wsSafetyNotes')?.value         || '',
            abnormalActions:document.getElementById('wsAbnormalActions')?.value      || '',
            revisions:      _editData.revisions,
            updatedAt:      new Date().toISOString(),
        };
    }

    /* ════════════════════════════════════════════════════════════
       저장 / 삭제
    ════════════════════════════════════════════════════════════ */
    async function save() {
        const data = _collectAll();
        if (!data.processName) { UIUtils.toast('공정명을 입력하세요.', 'error'); return; }
        if (!data.carModel)    { UIUtils.toast('차종을 입력하세요.', 'error'); return; }
        try {
            if (_editId) {
                await Storage.update(STORE, {id:_editId, ...data});
                UIUtils.toast('저장되었습니다.', 'success');
            } else {
                await Storage.add(STORE, data);
                UIUtils.toast('등록되었습니다.', 'success');
            }
            render();
        } catch(e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    async function remove(id) {
        UIUtils.confirm('이 작업 표준서를 삭제하시겠습니까?', async () => {
            try {
                await Storage.remove(STORE, id);
                UIUtils.toast('삭제되었습니다.', 'success');
                search();
            } catch(e) {
                UIUtils.toast('삭제 실패: ' + e.message, 'error');
            }
        });
    }

    /* ════════════════════════════════════════════════════════════
       미리보기 / 인쇄 (A3 가로)
    ════════════════════════════════════════════════════════════ */
    function preview(id, mode) {
        let rec;
        if (mode === 'edit') {
            rec = _collectAll();
        } else {
            rec = _all().find(r => r.id === id);
        }
        if (!rec) return;
        _showPreview(rec);
    }

    function _showPreview(rec) {
        const old = document.getElementById('wsPreviewOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wsPreviewOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;' +
            'display:flex;flex-direction:column;overflow:auto;padding:16px;';
        overlay.innerHTML = `
            <div style="max-width:1200px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;width:100%;">
                <div style="background:#1e293b;padding:10px 16px;display:flex;
                            align-items:center;justify-content:space-between;">
                    <span style="color:#fff;font-weight:600;font-size:0.95rem;">
                        작업 표준서 미리보기 — ${_esc(rec.processName)} [${_esc(rec.carModel||'')}]
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="WorkStandardModule._doPrint()">
                            <span class="material-symbols-outlined">print</span> 인쇄
                        </button>
                        <button class="btn btn-secondary btn-sm"
                            onclick="document.getElementById('wsPreviewOverlay').remove()">닫기</button>
                    </div>
                </div>
                <div style="padding:16px;overflow-x:auto;background:#e2e8f0;">
                    <div id="wsDocArea" style="background:#fff;padding:16px 20px;min-width:900px;
                        font-family:'맑은 고딕','나눔고딕',sans-serif;color:#000;font-size:10.5px;">
                        ${_buildDocHtml(rec)}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    function _doPrint() {
        const content = document.getElementById('wsDocArea')?.innerHTML;
        if (!content) return;
        const w = window.open('','_blank','width=1200,height=900');
        w.document.write(`<!DOCTYPE html><html><head><title>작업 표준서</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body{font-family:'맑은 고딕','나눔고딕',sans-serif;color:#000;font-size:10.5px;}
                @media print{
                    @page{size:A3 landscape;margin:8mm;}
                    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
                }
            </style></head><body>${content}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 500);
    }

    /* ── A3 문서 HTML 빌더 ─────────────────────────────────── */
    function _buildDocHtml(rec) {
        const C  = 'border:1px solid #333;padding:3px 5px;';
        const HB = 'border:1px solid #333;padding:3px 6px;background:#bdd7ee;font-weight:700;text-align:center;';

        /* 조건 표 빌더 (5행 최소) */
        const _condTable = (rows, label) => {
            const data = [...(rows||[])];
            while (data.length < 5) data.push({no:data.length+1,item:'',standard:'',method:'',cycle:'',measure:''});
            return `
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;
                        font-size:11px;letter-spacing:2px;padding:4px;">${label}</div>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                <colgroup>
                    <col style="width:4%"><col style="width:18%"><col style="width:22%">
                    <col style="width:14%"><col style="width:7%"><col style="width:35%">
                </colgroup>
                <thead><tr>
                    <th style="${HB}">순</th><th style="${HB}">관리항목</th>
                    <th style="${HB}">관리기준</th><th style="${HB}">확인방법</th>
                    <th style="${HB}">주기</th><th style="${HB}">관리방안</th>
                </tr></thead>
                <tbody>${data.map(c=>`<tr style="height:24px;">
                    <td style="${C}text-align:center;">${c.no}</td>
                    <td style="${C}">${_esc(c.item)}</td>
                    <td style="${C}">${_esc(c.standard)}</td>
                    <td style="${C}">${_esc(c.method)}</td>
                    <td style="${C}text-align:center;">${_esc(c.cycle)}</td>
                    <td style="${C}">${_esc(c.measure)}</td>
                </tr>`).join('')}</tbody>
            </table>`;
        };

        /* 작업 순서 사진 카드 */
        const steps = [...(rec.workSteps || [])];
        const stepCols = steps.map((s,i) => `
            <td style="vertical-align:top;padding:4px;border:1px solid #333;width:${Math.floor(100/Math.max(steps.length,1))}%;">
                <div style="font-weight:700;text-align:center;background:#bdd7ee;padding:2px;
                            margin:-4px -4px 4px;font-size:10px;">Step ${i+1}</div>
                ${s.photo ? `<img src="${s.photo}" style="width:100%;max-height:120px;object-fit:cover;display:block;margin-bottom:4px;">` : '<div style="width:100%;height:80px;background:#f0f0f0;margin-bottom:4px;border:1px dashed #ccc;"></div>'}
                <div style="font-size:9.5px;line-height:1.5;white-space:pre-wrap;">${_esc(s.desc)}</div>
            </td>`).join('');

        /* 개정 내용 */
        const revs = rec.revisions || _defRevs();
        const half = Math.ceil(revs.length/2);
        const lR = revs.slice(0,half), rR = revs.slice(half);
        const revRows = lR.map((l,i) => {
            const r = rR[i];
            return `<tr>
                <td style="${C}text-align:center;">${l.no}</td>
                <td style="${C}text-align:center;">${_esc(l.date)}</td>
                <td style="${C}">${_esc(l.reason)}</td>
                <td style="${C}text-align:center;">${_esc(l.confirm)}</td>
                ${r ? `<td style="${C}text-align:center;">${r.no}</td>
                       <td style="${C}text-align:center;">${_esc(r.date)}</td>
                       <td style="${C}">${_esc(r.reason)}</td>
                       <td style="${C}text-align:center;">${_esc(r.confirm)}</td>`
                    : `<td colspan="4" style="border:1px solid #333;"></td>`}
            </tr>`;
        }).join('');

        return `
        <!-- ① 헤더: 기본정보 | 제목 | 결재 -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0;">
            <colgroup>
                <col style="width:10%"><col style="width:18%">
                <col style="width:24%">
                <col style="width:10%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:13%">
            </colgroup>
            <tbody>
                <tr>
                    <td colspan="2" rowspan="5" style="${C}vertical-align:top;padding:6px 8px;">
                        <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
                            <tr><td style="font-weight:700;white-space:nowrap;padding:2px 0;width:46px;">공정 NO</td>
                                <td style="padding:2px 4px;border-bottom:1px solid #ddd;">${_esc(rec.processNo)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:2px 0;">공 정 명</td>
                                <td style="padding:2px 4px;border-bottom:1px solid #ddd;">${_esc(rec.processName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:2px 0;">설 비 명</td>
                                <td style="padding:2px 4px;border-bottom:1px solid #ddd;">${_esc(rec.equipName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:2px 0;">품&nbsp;&nbsp;&nbsp;명</td>
                                <td style="padding:2px 4px;border-bottom:1px solid #ddd;">${_esc(rec.partName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:2px 0;">모&nbsp;&nbsp;&nbsp;델</td>
                                <td style="padding:2px 4px;">${_esc(rec.carModel||rec.model||'')}</td></tr>
                        </table>
                    </td>
                    <td rowspan="5" style="${C}text-align:center;vertical-align:middle;
                        font-size:24px;font-weight:900;letter-spacing:8px;">
                        작 업 표 준 서
                    </td>
                    <td style="${HB}"></td>
                    <td style="${HB}">작 성</td>
                    <td style="${HB}">검 토</td>
                    <td style="${HB}">승 인</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;text-align:center;vertical-align:middle;">결<br>재</td>
                    <td style="${C}text-align:center;vertical-align:middle;height:32px;">${_esc(rec.author)}</td>
                    <td style="${C}text-align:center;vertical-align:middle;">${_esc(rec.reviewer)}</td>
                    <td style="${C}text-align:center;vertical-align:middle;">${_esc(rec.approver)}</td>
                </tr>
                <tr><td style="${C}height:22px;"></td><td style="${C}"></td><td style="${C}"></td><td style="${C}"></td></tr>
                <tr><td style="${C}height:22px;"></td><td style="${C}"></td><td style="${C}"></td><td style="${C}"></td></tr>
                <tr>
                    <td style="${C}font-size:9px;text-align:center;">/</td>
                    <td style="${C}font-size:9px;text-align:center;">${_esc(rec.authorDate||'')}</td>
                    <td style="${C}font-size:9px;text-align:center;">${_esc(rec.reviewerDate||'')}</td>
                    <td style="${C}font-size:9px;text-align:center;">${_esc(rec.approverDate||'')}</td>
                </tr>
            </tbody>
        </table>

        <!-- ② 작업 순서 (사진) -->
        <table style="width:100%;border-collapse:collapse;margin-top:-1px;">
            <tbody>
                <tr>
                    <td colspan="${Math.max(steps.length,1)}" style="${HB}letter-spacing:3px;font-size:11px;">
                        작 업 순 서
                    </td>
                </tr>
                <tr>${stepCols || `<td style="${C}height:120px;"></td>`}</tr>
            </tbody>
        </table>

        <!-- ③ 조건관리 표준 / 자주검사 표준 / 이상처리 -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
            <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
            <tbody>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        ${_condTable(rec.condManage, '조건관리 표준 (만드는 조건)')}
                    </td>
                    <td style="vertical-align:top;padding:0;border-left:1px solid #333;">
                        ${_condTable(rec.selfInspect, '자주검사 표준 (만들어진 조건)')}
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="vertical-align:top;padding:0;border-top:1px solid #333;">
                        ${_condTable(rec.abnormalCond, '이상처리 기준')}
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- ④ 안전 관리 / 이상 발생기 조치사항 -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
            <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
            <tbody>
                <tr>
                    <td style="${HB}letter-spacing:3px;font-size:11px;">안 전 관 리</td>
                    <td style="${HB}letter-spacing:3px;font-size:11px;border-left:none;">이 상 발 생 기 조 치 사 항</td>
                </tr>
                <tr>
                    <td style="${C}vertical-align:top;min-height:60px;padding:6px 8px;white-space:pre-wrap;">
                        ${_esc(rec.safetyNotes||'').replace(/\n/g,'<br>')}</td>
                    <td style="${C}vertical-align:top;min-height:60px;padding:6px 8px;white-space:pre-wrap;border-left:none;">
                        ${_esc(rec.abnormalActions||'').replace(/\n/g,'<br>')}</td>
                </tr>
            </tbody>
        </table>

        <!-- ⑤ 개정 내용 -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
            <colgroup>
                <col style="width:3%"><col style="width:9%"><col style="width:28.5%"><col style="width:9.5%">
                <col style="width:3%"><col style="width:9%"><col style="width:28.5%"><col style="width:9.5%">
            </colgroup>
            <thead>
                <tr>
                    <th colspan="4" style="${HB}letter-spacing:2px;">개 정 내 용</th>
                    <th colspan="4" style="${HB}letter-spacing:2px;border-left:none;">개 정 내 용</th>
                </tr>
                <tr>
                    <th style="${HB}">NO</th><th style="${HB}">개정일자</th>
                    <th style="${HB}">개정사유</th><th style="${HB}">확인</th>
                    <th style="${HB}border-left:none;">NO</th><th style="${HB}border-left:none;">개정일자</th>
                    <th style="${HB}border-left:none;">개정사유</th><th style="${HB}border-left:none;">확인</th>
                </tr>
            </thead>
            <tbody>${revRows}</tbody>
        </table>

        <!-- ⑥ 푸터 -->
        <div style="display:flex;justify-content:space-between;align-items:center;
                    margin-top:6px;font-size:9.5px;color:#555;border-top:1px solid #ccc;padding-top:4px;">
            <span>${_esc(rec.carModel||rec.model||'')} ${_esc(rec.processName||'')} 작업 표준서</span>
            <span>A3 (420 × 297mm)</span>
        </div>`;
    }

    /* ════════════════════════════════════════════════════════════
       공개 API
    ════════════════════════════════════════════════════════════ */
    return {
        init, render, search,
        openEditor, save, remove, preview, _doPrint,
        _addStep, _delStep, _uploadPhoto, _clearPhoto,
        _addCondRow, _delCondRow,
    };
})();
