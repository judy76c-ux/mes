/**
 * 작업 표준서 모듈 (WorkStandardModule)
 * 생산관리 > 제조관리 표준 > 작업 표준서
 */

const WorkStandardModule = (function () {

    const STORE = DB.STORES.WORK_STANDARDS;

    /* ── 헬퍼 ─────────────────────────────────────────────────── */
    function _esc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                              .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function _js(s)  { return String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
    function _all()  { return Storage.getAll(STORE) || []; }
    function _today(){ return new Date().toISOString().slice(0,10); }

    /* ── 기본 데이터 팩토리 ────────────────────────────────────── */
    function _defConds(n) {
        return Array.from({length: n}, (_, i) =>
            ({no:i+1, item:'', standard:'', method:'', cycle:'', measure:'', action:''}));
    }
    function _defRevs() {
        return Array.from({length: 7}, (_, i) =>
            ({no:i, date:'', reason:'', confirm:''}));
    }

    /* ════════════════════════════════════════════════════════════
       목록 페이지
    ════════════════════════════════════════════════════════════ */
    function init(container) { render(container); }

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-header-left">
                    <h3>작업 표준서</h3>
                    <p>공정별 작업 표준서를 등록·관리합니다</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="WorkStandardModule.openModal()">
                        <span class="material-symbols-outlined">add</span> 표준서 등록
                    </button>
                </div>
            </div>

            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                <div class="form-group">
                    <label class="form-label">공정명</label>
                    <input type="text" class="form-input" id="wsFilterProc"
                           placeholder="공정명 검색..." style="min-width:120px;"
                           onkeydown="if(event.key==='Enter') WorkStandardModule.search()">
                </div>
                <div class="form-group">
                    <label class="form-label">모델</label>
                    <input type="text" class="form-input" id="wsFilterModel"
                           placeholder="모델 검색..." style="min-width:110px;"
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
                        <table class="data-table" style="border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="width:70px;text-align:center;">공정NO</th>
                                    <th>공정명</th>
                                    <th>설비명</th>
                                    <th>품명</th>
                                    <th>모델</th>
                                    <th style="width:72px;text-align:center;">개정NO</th>
                                    <th style="width:92px;text-align:center;">최종수정일</th>
                                    <th style="width:160px;text-align:center;">작업</th>
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
        const proc  = (document.getElementById('wsFilterProc')?.value  || '').toLowerCase();
        const model = (document.getElementById('wsFilterModel')?.value || '').toLowerCase();
        const part  = (document.getElementById('wsFilterPart')?.value  || '').toLowerCase();
        const rows  = _all()
            .filter(r => !proc  || (r.processName||'').toLowerCase().includes(proc))
            .filter(r => !model || (r.model||'').toLowerCase().includes(model))
            .filter(r => !part  || (r.partName||'').toLowerCase().includes(part))
            .sort((a,b) => (a.processNo||'').localeCompare(b.processNo||'', 'ko'));

        const tbody = document.getElementById('wsBody');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8"
                style="text-align:center;padding:32px;color:var(--text-muted);">
                등록된 작업 표준서가 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;"
                    onclick="WorkStandardModule.openModal()">
                    <span class="material-symbols-outlined">add</span> 첫 표준서 등록
                </button></td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const lastRev = (r.revisions||[]).filter(v=>v.date).pop();
            const revNo   = lastRev ? lastRev.no : 0;
            return `<tr>
                <td style="text-align:center;">${_esc(r.processNo)}</td>
                <td>${_esc(r.processName)}</td>
                <td>${_esc(r.equipName)}</td>
                <td>${_esc(r.partName)}</td>
                <td>${_esc(r.model)}</td>
                <td style="text-align:center;">${revNo}</td>
                <td style="text-align:center;font-size:0.8rem;">${(r.updatedAt||'').slice(0,10)}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm" style="background:#4b5563;color:#fff;"
                        onclick="WorkStandardModule.preview('${_js(r.id)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">preview</span>
                    </button>
                    <button class="btn btn-sm btn-outline"
                        onclick="WorkStandardModule.openModal('${_js(r.id)}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="WorkStandardModule.remove('${_js(r.id)}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    /* ════════════════════════════════════════════════════════════
       등록 / 수정 모달
    ════════════════════════════════════════════════════════════ */
    let _editId   = null;
    let _editConds = [];
    let _editRevs  = [];

    function openModal(id) {
        _editId = id || null;
        const rec = id ? _all().find(r => r.id === id) : null;
        _editConds = rec ? JSON.parse(JSON.stringify(rec.conditions || _defConds(12))) : _defConds(12);
        _editRevs  = rec ? JSON.parse(JSON.stringify(rec.revisions  || _defRevs()))    : _defRevs();

        const v = k => _esc((rec && rec[k]) || '');

        UIUtils.showModal(
            id ? '작업 표준서 수정' : '작업 표준서 등록',
            `<!-- 기본 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">공정 NO</label>
                    <input type="text" class="form-input" id="wsProcessNo" value="${v('processNo')}" placeholder="예) P-001">
                </div>
                <div class="form-group">
                    <label class="form-label">공정명 <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="wsProcessName" value="${v('processName')}" placeholder="예) 도장">
                </div>
                <div class="form-group">
                    <label class="form-label">설비명</label>
                    <input type="text" class="form-input" id="wsEquipName" value="${v('equipName')}" placeholder="설비명">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="wsPartName" value="${v('partName')}" placeholder="품명">
                </div>
                <div class="form-group">
                    <label class="form-label">모델</label>
                    <input type="text" class="form-input" id="wsModel" value="${v('model')}" placeholder="모델명">
                </div>
            </div>

            <!-- 결재 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
                <div class="form-group"><label class="form-label">작성자</label>
                    <input type="text" class="form-input" id="wsAuthor" value="${v('author')}"></div>
                <div class="form-group"><label class="form-label">생산(검토)</label>
                    <input type="text" class="form-input" id="wsReviewer" value="${v('reviewer')}"></div>
                <div class="form-group"><label class="form-label">품질(승인)</label>
                    <input type="text" class="form-input" id="wsApprover" value="${v('approver')}"></div>
                <div class="form-group"><label class="form-label">작성일</label>
                    <input type="date" class="form-input" id="wsAuthorDate" value="${v('authorDate') || _today()}"></div>
                <div class="form-group"><label class="form-label">검토일</label>
                    <input type="date" class="form-input" id="wsReviewerDate" value="${v('reviewerDate')}"></div>
                <div class="form-group"><label class="form-label">승인일</label>
                    <input type="date" class="form-input" id="wsApproverDate" value="${v('approverDate')}"></div>
            </div>

            <!-- 작업 내용 -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label">작업 내용 (표준서 좌측 영역)</label>
                <textarea class="form-input" id="wsWorkContent" rows="4"
                    style="resize:vertical;font-size:0.85rem;"
                    placeholder="작업 절차, 주의사항, 작업 방법 등을 입력하세요...">${_esc(rec?.workContent||'')}</textarea>
            </div>

            <!-- 조건관리 표준 -->
            <div style="margin-bottom:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <strong style="font-size:0.9rem;">조건관리 표준</strong>
                    <button type="button" class="btn btn-sm btn-outline"
                        onclick="WorkStandardModule._addCondRow()">
                        <span class="material-symbols-outlined" style="font-size:14px;">add</span> 행 추가
                    </button>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.78rem;min-width:680px;" id="wsCondTable">
                        <thead>
                            <tr style="background:var(--bg-tertiary);">
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:28px;text-align:center;">순</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);min-width:110px;">관리항목</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);min-width:110px;">관리기준</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);min-width:80px;">확인방법</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:55px;">주기</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);min-width:80px;">관리방안</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);min-width:80px;">조치사항</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:28px;"></th>
                            </tr>
                        </thead>
                        <tbody id="wsCondBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- 안전 관리 -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label">안전 관리</label>
                <textarea class="form-input" id="wsSafetyNotes" rows="2"
                    style="resize:vertical;">${_esc(rec?.safetyNotes||'')}</textarea>
            </div>

            <!-- 개정 내용 -->
            <div>
                <strong style="font-size:0.9rem;display:block;margin-bottom:6px;">개정 내용</strong>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                        <thead>
                            <tr style="background:var(--bg-tertiary);">
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:28px;text-align:center;">NO</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:120px;">개정일자</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);">개정사유</th>
                                <th style="padding:4px 5px;border:1px solid var(--border-color);width:80px;">확인</th>
                            </tr>
                        </thead>
                        <tbody id="wsRevBody"></tbody>
                    </table>
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary"   onclick="WorkStandardModule.save()">저장</button>`
        );

        _renderCondRows();
        _renderRevRows();
    }

    /* ── 조건관리 행 ── */
    const _INP = (id, val, ph, w) =>
        `<input class="form-input" id="${id}" value="${_esc(val||'')}" placeholder="${ph||''}"
         style="width:${w||'100%'};font-size:0.75rem;padding:2px 4px;">`;

    function _condRowHtml(c, i) {
        return `<tr>
            <td style="padding:2px 3px;border:1px solid var(--border-color);text-align:center;
                color:var(--text-muted);font-size:0.75rem;">${i+1}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsCitem_${i}`,c.item,'관리항목')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsCstd_${i}`, c.standard,'관리기준')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsCmet_${i}`, c.method,'확인방법')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsClcy_${i}`, c.cycle,'주기')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsCmea_${i}`, c.measure,'관리방안')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsCact_${i}`, c.action,'조치사항')}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);text-align:center;">
                <button type="button" class="btn btn-sm btn-danger"
                    style="padding:1px 5px;font-size:0.72rem;"
                    onclick="WorkStandardModule._delCondRow(${i})">×</button>
            </td>
        </tr>`;
    }

    function _renderCondRows() {
        const tb = document.getElementById('wsCondBody');
        if (tb) tb.innerHTML = _editConds.map((c,i) => _condRowHtml(c,i)).join('');
    }

    function _readCondRows() {
        const arr = []; let i = 0;
        while (document.getElementById(`wsCitem_${i}`) !== null) {
            arr.push({
                no:       i+1,
                item:     document.getElementById(`wsCitem_${i}`).value,
                standard: document.getElementById(`wsCstd_${i}`).value,
                method:   document.getElementById(`wsCmet_${i}`).value,
                cycle:    document.getElementById(`wsClcy_${i}`).value,
                measure:  document.getElementById(`wsCmea_${i}`).value,
                action:   document.getElementById(`wsCact_${i}`).value,
            });
            i++;
        }
        return arr;
    }

    function _addCondRow() {
        _editConds = _readCondRows();
        _editConds.push({no:_editConds.length+1,item:'',standard:'',method:'',cycle:'',measure:'',action:''});
        _renderCondRows();
    }

    function _delCondRow(idx) {
        _editConds = _readCondRows();
        _editConds.splice(idx,1);
        _renderCondRows();
    }

    /* ── 개정 내용 행 ── */
    function _revRowHtml(r, i) {
        return `<tr>
            <td style="padding:2px 3px;border:1px solid var(--border-color);text-align:center;
                color:var(--text-muted);">${r.no}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">
                <input type="date" class="form-input" id="wsRdate_${i}" value="${_esc(r.date||'')}"
                    style="width:100%;font-size:0.75rem;padding:2px 4px;"></td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsRreason_${i}`,r.reason)}</td>
            <td style="padding:2px 3px;border:1px solid var(--border-color);">${_INP(`wsRconfirm_${i}`,r.confirm)}</td>
        </tr>`;
    }

    function _renderRevRows() {
        const tb = document.getElementById('wsRevBody');
        if (tb) tb.innerHTML = _editRevs.map((r,i) => _revRowHtml(r,i)).join('');
    }

    function _readRevRows() {
        const arr = []; let i = 0;
        while (document.getElementById(`wsRdate_${i}`) !== null) {
            arr.push({
                no:      _editRevs[i]?.no ?? i,
                date:    document.getElementById(`wsRdate_${i}`).value,
                reason:  document.getElementById(`wsRreason_${i}`).value,
                confirm: document.getElementById(`wsRconfirm_${i}`).value,
            });
            i++;
        }
        return arr;
    }

    /* ════════════════════════════════════════════════════════════
       저장 / 삭제
    ════════════════════════════════════════════════════════════ */
    async function save() {
        const processName = document.getElementById('wsProcessName')?.value?.trim();
        if (!processName) { UIUtils.toast('공정명을 입력하세요', 'error'); return; }

        const data = {
            processNo:    document.getElementById('wsProcessNo')?.value?.trim()    || '',
            processName,
            equipName:    document.getElementById('wsEquipName')?.value?.trim()    || '',
            partName:     document.getElementById('wsPartName')?.value?.trim()     || '',
            model:        document.getElementById('wsModel')?.value?.trim()        || '',
            workContent:  document.getElementById('wsWorkContent')?.value          || '',
            author:       document.getElementById('wsAuthor')?.value?.trim()       || '',
            reviewer:     document.getElementById('wsReviewer')?.value?.trim()     || '',
            approver:     document.getElementById('wsApprover')?.value?.trim()     || '',
            authorDate:   document.getElementById('wsAuthorDate')?.value           || '',
            reviewerDate: document.getElementById('wsReviewerDate')?.value         || '',
            approverDate: document.getElementById('wsApproverDate')?.value         || '',
            conditions:   _readCondRows(),
            safetyNotes:  document.getElementById('wsSafetyNotes')?.value          || '',
            revisions:    _readRevRows(),
            updatedAt:    new Date().toISOString(),
        };

        try {
            if (_editId) {
                await Storage.update(STORE, { id: _editId, ...data });
                UIUtils.toast('작업 표준서가 수정되었습니다', 'success');
            } else {
                await Storage.add(STORE, data);
                UIUtils.toast('작업 표준서가 등록되었습니다', 'success');
            }
            UIUtils.closeModal();
            search();
        } catch(e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    async function remove(id) {
        if (!confirm('이 작업 표준서를 삭제하시겠습니까?')) return;
        try {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다', 'success');
            search();
        } catch(e) {
            UIUtils.toast('삭제 실패: ' + e.message, 'error');
        }
    }

    /* ════════════════════════════════════════════════════════════
       미리보기 / 인쇄 (A3 가로 레이아웃)
    ════════════════════════════════════════════════════════════ */
    function preview(id) {
        const rec = _all().find(r => r.id === id);
        if (!rec) return;
        _showPreview(rec);
    }

    function _showPreview(rec) {
        /* 기존 오버레이 제거 */
        const old = document.getElementById('wsPreviewOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wsPreviewOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;' +
            'display:flex;flex-direction:column;overflow:auto;padding:16px;';
        overlay.innerHTML = `
            <div style="max-width:1120px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;width:100%;">
                <!-- 오버레이 상단 툴바 -->
                <div style="background:#1e293b;padding:10px 16px;display:flex;
                            align-items:center;justify-content:space-between;">
                    <span style="color:#fff;font-weight:600;font-size:0.95rem;">
                        작업 표준서 미리보기 — ${_esc(rec.processName)} ${_esc(rec.model||'')}
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm"
                            onclick="WorkStandardModule._doPrint('wsDocArea')">
                            <span class="material-symbols-outlined">print</span> 인쇄
                        </button>
                        <button class="btn btn-secondary btn-sm"
                            onclick="document.getElementById('wsPreviewOverlay').remove()">닫기</button>
                    </div>
                </div>
                <!-- 문서 본문 -->
                <div style="padding:16px;overflow-x:auto;background:#f1f5f9;">
                    <div id="wsDocArea" style="background:#fff;padding:14px 18px;
                                               min-width:960px;font-family:'맑은 고딕','나눔고딕',sans-serif;
                                               color:#000;font-size:11px;">
                        ${_buildDocHtml(rec)}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    /* ── A3 문서 HTML 빌더 ─────────────────────────────────── */
    function _buildDocHtml(rec) {
        const C  = 'border:1px solid #111;padding:3px 5px;';           /* 일반 셀 */
        const HB = 'border:1px solid #111;padding:3px 6px;background:#bdd7ee;font-weight:700;text-align:center;'; /* 헤더 (파란 배경) */

        /* 조건관리 표준 행 — 최소 12행 */
        const conds = [...(rec.conditions || [])];
        while (conds.length < 12) conds.push({no:conds.length+1,item:'',standard:'',method:'',cycle:'',measure:'',action:''});

        const condRows = conds.map(c => `
            <tr style="height:26px;">
                <td style="${C}text-align:center;">${c.no}</td>
                <td style="${C}">${_esc(c.item)}</td>
                <td style="${C}">${_esc(c.standard)}</td>
                <td style="${C}">${_esc(c.method)}</td>
                <td style="${C}text-align:center;">${_esc(c.cycle)}</td>
                <td style="${C}">${_esc(c.measure)}</td>
                <td style="${C}">${_esc(c.action)}</td>
            </tr>`).join('');

        /* 개정 내용 — 좌/우 분할 */
        const revs = rec.revisions || _defRevs();
        const half = Math.ceil(revs.length / 2);
        const lRevs = revs.slice(0, half);
        const rRevs = revs.slice(half);

        const revRows = lRevs.map((l, i) => {
            const r = rRevs[i];
            return `<tr>
                <td style="${C}text-align:center;">${l.no}</td>
                <td style="${C}text-align:center;">${_esc(l.date)}</td>
                <td style="${C}">${_esc(l.reason)}</td>
                <td style="${C}text-align:center;">${_esc(l.confirm)}</td>
                ${r ? `<td style="${C}text-align:center;">${r.no}</td>
                       <td style="${C}text-align:center;">${_esc(r.date)}</td>
                       <td style="${C}">${_esc(r.reason)}</td>
                       <td style="${C}text-align:center;">${_esc(r.confirm)}</td>`
                    : '<td colspan="4" style="border:1px solid #111;"></td>'}
            </tr>`;
        }).join('');

        /* 작업 내용 — 줄바꿈 처리 */
        const workHtml = _esc(rec.workContent||'').replace(/\n/g,'<br>');
        const safetyHtml = _esc(rec.safetyNotes||'').replace(/\n/g,'<br>');

        return `
        <!-- ① 상단 헤더 (좌: 기본정보 | 중: 제목 | 우: 결재) -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0;">
            <colgroup>
                <col style="width:12%"><col style="width:20%"><!-- 기본정보 2열 -->
                <col style="width:24%">                       <!-- 제목 -->
                <col style="width:11%">                       <!-- 결재 라벨 -->
                <col style="width:11%"><col style="width:11%"><col style="width:11%"><!-- 작성/생산/품질 -->
            </colgroup>
            <tbody>
                <tr>
                    <!-- 기본 정보 (rowspan 5) -->
                    <td colspan="2" rowspan="5"
                        style="${C}vertical-align:top;padding:6px 8px;">
                        <table style="width:100%;border-collapse:collapse;font-size:11px;">
                            <tr><td style="font-weight:700;white-space:nowrap;padding:3px 0;width:46px;">공정 NO</td>
                                <td style="padding:3px 4px;border-bottom:1px solid #ddd;">${_esc(rec.processNo)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:3px 0;">공 정 명</td>
                                <td style="padding:3px 4px;border-bottom:1px solid #ddd;">${_esc(rec.processName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:3px 0;">설 비 명</td>
                                <td style="padding:3px 4px;border-bottom:1px solid #ddd;">${_esc(rec.equipName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:3px 0;">품&nbsp;&nbsp;&nbsp;명</td>
                                <td style="padding:3px 4px;border-bottom:1px solid #ddd;">${_esc(rec.partName)}</td></tr>
                            <tr><td style="font-weight:700;white-space:nowrap;padding:3px 0;">모&nbsp;&nbsp;&nbsp;델</td>
                                <td style="padding:3px 4px;">${_esc(rec.model)}</td></tr>
                        </table>
                    </td>
                    <!-- 제목 (rowspan 5) -->
                    <td rowspan="5" style="${C}text-align:center;vertical-align:middle;
                        font-size:26px;font-weight:900;letter-spacing:8px;">
                        작 업 표 준 서
                    </td>
                    <!-- 결재 헤더 -->
                    <td style="${HB}"></td>
                    <td style="${HB}">작 성</td>
                    <td style="${HB}">생 산</td>
                    <td style="${HB}">품 질</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;text-align:center;vertical-align:middle;">결<br>재</td>
                    <td style="${C}text-align:center;font-size:12px;vertical-align:middle;height:30px;">${_esc(rec.author)}</td>
                    <td style="${C}text-align:center;font-size:12px;vertical-align:middle;">${_esc(rec.reviewer)}</td>
                    <td style="${C}text-align:center;font-size:12px;vertical-align:middle;">${_esc(rec.approver)}</td>
                </tr>
                <tr>
                    <td style="${C}height:24px;"></td>
                    <td style="${C}"></td><td style="${C}"></td><td style="${C}"></td>
                </tr>
                <tr>
                    <td style="${C}height:24px;"></td>
                    <td style="${C}"></td><td style="${C}"></td><td style="${C}"></td>
                </tr>
                <tr>
                    <td style="${C}font-size:10px;text-align:center;">/</td>
                    <td style="${C}font-size:10px;text-align:center;">${_esc(rec.authorDate||'')}</td>
                    <td style="${C}font-size:10px;text-align:center;">${_esc(rec.reviewerDate||'')}</td>
                    <td style="${C}font-size:10px;text-align:center;">${_esc(rec.approverDate||'')}</td>
                </tr>
            </tbody>
        </table>

        <!-- ② 중단 : 좌(작업내용) | 우(조건관리 표준) -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <colgroup>
                <col style="width:35%"> <!-- 작업 내용 -->
                <col style="width:65%"> <!-- 조건관리 표준 -->
            </colgroup>
            <tbody>
                <tr>
                    <!-- 좌: 작업 내용 -->
                    <td style="${C}vertical-align:top;padding:6px 8px;">
                        <div style="font-weight:700;text-align:center;background:#bdd7ee;
                                    border:1px solid #111;padding:3px;margin:-6px -8px 8px;
                                    font-size:12px;letter-spacing:3px;">작 업 내 용</div>
                        <div style="font-size:11px;line-height:1.7;min-height:240px;
                                    white-space:pre-wrap;">${workHtml}</div>
                    </td>
                    <!-- 우: 조건관리 표준 -->
                    <td style="vertical-align:top;padding:0;">
                        <div style="background:#bdd7ee;border:1px solid #111;padding:3px;
                                    text-align:center;font-weight:700;font-size:12px;letter-spacing:3px;">
                            조 건 관 리 &nbsp; 표 준
                        </div>
                        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                            <colgroup>
                                <col style="width:4%"><col style="width:17%"><col style="width:20%">
                                <col style="width:13%"><col style="width:7%">
                                <col style="width:18%"><col style="width:21%">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style="${HB}">순</th>
                                    <th style="${HB}">관리항목</th>
                                    <th style="${HB}">관리기준</th>
                                    <th style="${HB}">확인방법</th>
                                    <th style="${HB}">주기</th>
                                    <th style="${HB}">관리방안</th>
                                    <th style="${HB}">조치사항</th>
                                </tr>
                            </thead>
                            <tbody>${condRows}</tbody>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- ③ 안전 관리 -->
        <table style="width:100%;border-collapse:collapse;">
            <tbody>
                <tr><td style="background:#bdd7ee;border:1px solid #111;padding:3px;
                               text-align:center;font-weight:700;font-size:12px;letter-spacing:3px;">
                    안 전 관 리
                </td></tr>
                <tr><td style="${C}min-height:32px;height:36px;font-size:11px;
                                   line-height:1.6;">${safetyHtml || '&nbsp;'}</td></tr>
            </tbody>
        </table>

        <!-- ④ 이상 발생 시 조치사항 -->
        <table style="width:100%;border-collapse:collapse;">
            <tbody>
                <tr><td style="background:#bdd7ee;border:1px solid #111;padding:3px;
                               text-align:center;font-weight:700;font-size:12px;letter-spacing:2px;">
                    이 상 발 생 시 조 치 사 항
                </td></tr>
                <tr><td style="${C}font-size:11px;padding:4px 8px;">
                    1. 경미한 사항 : 작업자는 선조치 후 조, 반장에게 보고한다.
                </td></tr>
                <tr><td style="${C}font-size:11px;padding:4px 8px;">
                    2. 조·반장의 역할 : &lt;설비이상일 경우&gt; - 설비이상 발생보고서를 작성하고 생산 담당자에게 통보한다.
                </td></tr>
                <tr><td style="${C}font-size:11px;padding:4px 8px;">
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;제품이상일 경우&gt; - 품질 담당자 및 생산 담당자에게 통보한다.
                </td></tr>
            </tbody>
        </table>

        <!-- ⑤ 개정 내용 -->
        <table style="width:100%;border-collapse:collapse;">
            <tbody>
                <tr>
                    <td colspan="9" style="background:#bdd7ee;border:1px solid #111;
                        padding:3px;text-align:center;font-weight:700;font-size:12px;letter-spacing:2px;">
                        개 정 내 용
                    </td>
                </tr>
                <tr>
                    <td rowspan="${lRevs.length+1}"
                        style="${C}text-align:center;vertical-align:middle;
                               font-weight:700;font-size:11px;width:20px;
                               writing-mode:vertical-rl;letter-spacing:4px;">개정&nbsp;내용</td>
                    <th style="${HB}width:5%;">NO</th>
                    <th style="${HB}width:14%;">개정일자</th>
                    <th style="${HB}width:25%;">개정사유</th>
                    <th style="${HB}width:7%;">확인</th>
                    <th style="${HB}width:5%;">NO</th>
                    <th style="${HB}width:14%;">개정일자</th>
                    <th style="${HB}width:25%;">개정사유</th>
                    <th style="${HB}width:7%;">확인</th>
                </tr>
                ${revRows}
            </tbody>
        </table>

        <!-- ⑥ 하단 풋터 -->
        <table style="width:100%;border-collapse:collapse;margin-top:3px;">
            <tbody>
                <tr>
                    <td style="font-size:10px;padding:1px 0;text-align:left;">케이씨케미칼㈜</td>
                    <td style="font-size:10px;padding:1px 0;text-align:right;">A3 (420 × 297mm)</td>
                </tr>
            </tbody>
        </table>`;
    }

    /* ── 실제 인쇄 ── */
    function _doPrint(areaId) {
        const area = document.getElementById(areaId || 'wsDocArea');
        if (!area) return;
        const w = window.open('', '_blank', 'width=1200,height=900');
        w.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8"><title>작업 표준서</title>
            <style>
                body{margin:8mm;font-family:'맑은 고딕','나눔고딕',sans-serif;}
                @media print{@page{size:A3 landscape;margin:8mm;}}
                table{border-collapse:collapse;}
            </style>
            </head><body>${area.innerHTML}
            <script>window.onload=function(){window.print();window.close();}<\/script>
            </body></html>`);
        w.document.close();
    }

    /* ════════════════════════════════════════════════════════════
       Public API
    ════════════════════════════════════════════════════════════ */
    return {
        init,
        render,
        search,
        openModal,
        save,
        remove,
        preview,
        _addCondRow,
        _delCondRow,
        _doPrint,
    };

})();
