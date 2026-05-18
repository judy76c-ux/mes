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

    /* ════════════════════════════════════════════════════════════
       목록
    ════════════════════════════════════════════════════════════ */
    function init(container) { _container = container; render(container); }

    function render(container) {
        if (container) _container = container;
        _editId = null; _editData = null;
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
        const v = k => _esc(d[k]||'');
        return `
        <div class="fade-in-up" style="max-width:1200px;">
            <div style="display:flex;align-items:center;justify-content:space-between;
                        margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="btn btn-outline btn-sm" onclick="WorkStandardModule.render()">
                        <span class="material-symbols-outlined">arrow_back</span> 목록
                    </button>
                    <h3 style="font-size:1.1rem;font-weight:700;">작업 표준서 ${_esc(title)}</h3>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" onclick="WorkStandardModule.preview(null,'edit')">
                        <span class="material-symbols-outlined">preview</span> 미리보기/인쇄
                    </button>
                    <button class="btn btn-primary" onclick="WorkStandardModule.save()">
                        <span class="material-symbols-outlined">save</span> 저장
                    </button>
                </div>
            </div>

            <!-- 기본정보 + 결재 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">info</span> 기본 정보 및 결재</h4></div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px;">
                        <div class="form-group"><label class="form-label">공정 NO</label>
                            <input type="text" class="form-input" id="wsProcessNo" value="${v('processNo')}" placeholder="예) 60_1,2"></div>
                        <div class="form-group"><label class="form-label">공정명 <span style="color:var(--accent-red)">*</span></label>
                            <input type="text" class="form-input" id="wsProcessName" value="${v('processName')}" placeholder="예) 도료 공급"></div>
                        <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                            <input type="text" class="form-input" id="wsCarModel" value="${v('carModel')}" placeholder="예) 전차종"></div>
                        <div class="form-group"><label class="form-label">품명</label>
                            <input type="text" class="form-input" id="wsPartName" value="${v('partName')}" placeholder="예) ALL"></div>
                        <div class="form-group"><label class="form-label">설비명</label>
                            <input type="text" class="form-input" id="wsEquipName" value="${v('equipName')}" placeholder="예) B-LINE 도료탱크"></div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                        <div class="form-group"><label class="form-label">작성자</label>
                            <input type="text" class="form-input" id="wsAuthor" value="${v('author')}"></div>
                        <div class="form-group"><label class="form-label">생산(검토)</label>
                            <input type="text" class="form-input" id="wsReviewer" value="${v('reviewer')}"></div>
                        <div class="form-group"><label class="form-label">품질(승인)</label>
                            <input type="text" class="form-input" id="wsApprover" value="${v('approver')}"></div>
                        <div class="form-group"><label class="form-label">작성일</label>
                            <input type="date" class="form-input" id="wsAuthorDate" value="${v('authorDate')||_today()}"></div>
                        <div class="form-group"><label class="form-label">검토일</label>
                            <input type="date" class="form-input" id="wsReviewerDate" value="${v('reviewerDate')}"></div>
                        <div class="form-group"><label class="form-label">승인일</label>
                            <input type="date" class="form-input" id="wsApproverDate" value="${v('approverDate')}"></div>
                    </div>
                </div>
            </div>

            <!-- 작업 순서 (단계별 사진+설명) -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                    <h4><span class="material-symbols-outlined">format_list_numbered</span> 작업 순서</h4>
                    <button class="btn btn-sm btn-outline" onclick="WorkStandardModule._addStep()">
                        <span class="material-symbols-outlined">add</span> 단계 추가
                    </button>
                </div>
                <div class="card-body" id="wsStepsList" style="display:flex;flex-direction:column;gap:14px;"></div>
            </div>

            <!-- 조건관리 표준 -->
            ${_condCardHtml('condManage','조건관리 표준 (만드는 조건)','table_chart')}
            ${_condCardHtml('selfInspect','자주검사 표준 (만들어진 조건)','fact_check')}
            ${_condCardHtml('abnormalCond','이상처리 기준','warning')}

            <!-- 안전관리 / 이상조치 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">health_and_safety</span> 안전 관리 / 이상 조치</h4></div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        <div class="form-group"><label class="form-label">안전 관리</label>
                            <textarea class="form-input" id="wsSafetyNotes" rows="4"
                                style="resize:vertical;">${_esc(d.safetyNotes||'')}</textarea></div>
                        <div class="form-group"><label class="form-label">이상 발생기 조치사항</label>
                            <textarea class="form-input" id="wsAbnormalActions" rows="4"
                                style="resize:vertical;">${_esc(d.abnormalActions||'')}</textarea></div>
                    </div>
                </div>
            </div>

            <!-- 개정 내용 -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header"><h4><span class="material-symbols-outlined">history</span> 개정 내용</h4></div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table" style="font-size:0.82rem;">
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

    function _condCardHtml(key, title, icon) {
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                <h4><span class="material-symbols-outlined">${icon}</span> ${_esc(title)}</h4>
                <button class="btn btn-sm btn-outline" onclick="WorkStandardModule._addCondRow('${key}')">
                    <span class="material-symbols-outlined">add</span> 행 추가
                </button>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:0.81rem;">
                        <thead><tr>
                            <th style="width:36px;text-align:center;">순</th>
                            <th>관리항목</th><th>관리기준</th>
                            <th style="width:100px;">확인방법</th><th style="width:70px;">주기</th>
                            <th>관리방안</th><th style="width:40px;"></th>
                        </tr></thead>
                        <tbody id="wsCondBody_${key}"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
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
        const inp = (id,val,ph='') => `<input class="form-input" id="${id}" value="${_esc(val||'')}"
            placeholder="${ph}" style="width:100%;font-size:0.78rem;padding:3px 5px;">`;
        return `<tr>
            <td style="text-align:center;color:var(--text-muted);">${i+1}</td>
            <td>${inp(`wsCi_${key}_${i}`,c.item,'관리항목')}</td>
            <td>${inp(`wsCs_${key}_${i}`,c.standard,'관리기준')}</td>
            <td>${inp(`wsCm_${key}_${i}`,c.method,'확인방법')}</td>
            <td>${inp(`wsCc_${key}_${i}`,c.cycle,'주기')}</td>
            <td>${inp(`wsCr_${key}_${i}`,c.measure,'관리방안')}</td>
            <td style="text-align:center;">
                <button type="button" class="btn btn-sm btn-danger"
                    style="padding:2px 7px;font-size:0.75rem;"
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

    /* ── 개정 내용 ──────────────────────────────────────────── */
    function _renderRevTable() {
        const tb = document.getElementById('wsRevBody');
        if (!tb) return;
        tb.innerHTML = (_editData.revisions||[]).map((r,i) => `<tr>
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
        _addCondRow, _delCondRow,
    };
})();
