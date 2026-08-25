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

    const _defCondRows = (n=3) => Array.from({length:n},(_,i)=>({no:i+1,item:'',standard:'',method:'',cycle:'',measure:''}));
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
    let _activePageIdx = 0;

    /* ── 페이지 단위 데이터 — 각 페이지가 완전히 독립된 문서(헤더/결재/개정내용 포함) ── */
    function _defPage() {
        return {
            processNo:'', processName:'', equipName:'', partName:'', carModel:'',
            author:'', reviewer:'', approver:'',
            authorDate:_today(), reviewerDate:'', approverDate:'',
            workSteps: _defSteps(),
            stepCols: 3, stepGap: 8,
            condManage:   _defCondRows(),
            selfInspect:  _defCondRows(),
            abnormalCond: _defCondRows(),
            condVisible: { condManage:true, selfInspect:true, abnormalCond:true },
            condColWidths: [6,15,26,13,9,23,8],
            safetyNotes:'', abnormalActions:'',
            revisions: _defRevs(),
        };
    }
    function _normalizePage(p) {
        p = p || {};
        return {
            processNo: p.processNo || '', processName: p.processName || '',
            equipName: p.equipName || '', partName: p.partName || '',
            carModel: p.carModel || p.model || '',
            author: p.author || '', reviewer: p.reviewer || '', approver: p.approver || '',
            authorDate: p.authorDate || _today(), reviewerDate: p.reviewerDate || '', approverDate: p.approverDate || '',
            workSteps: (p.workSteps || _defSteps()).map(_normalizeStep),
            stepCols: p.stepCols || 3,
            stepGap: p.stepGap ?? 8,
            condManage:   p.condManage   || _defCondRows(),
            selfInspect:  p.selfInspect  || _defCondRows(),
            abnormalCond: p.abnormalCond || _defCondRows(),
            condVisible: p.condVisible || { condManage:true, selfInspect:true, abnormalCond:true },
            condColWidths: (p.condColWidths && p.condColWidths.length === 7) ? p.condColWidths : [6,15,26,13,9,23,8],
            safetyNotes: p.safetyNotes || '', abnormalActions: p.abnormalActions || '',
            revisions: (p.revisions && p.revisions.length) ? p.revisions : _defRevs(),
        };
    }
    function _curPage() { return _editData.pages[_activePageIdx]; }

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
                                <th style="width:60px;text-align:center;">페이지</th>
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

    /* 문서마다 페이지가 완전히 독립된 표준서이므로, 페이지 단위로 펼쳐서 공정번호순으로 나열 */
    function _flattenPages() {
        const out = [];
        _all().forEach(r => {
            const pages = (Array.isArray(r.pages) && r.pages.length) ? r.pages : [r];
            pages.forEach((p, idx) => out.push({ doc: r, pageIdx: idx, pageCount: pages.length, page: p }));
        });
        return out;
    }

    function search() {
        const car  = (document.getElementById('wsFilterCar')?.value  || '').toLowerCase();
        const proc = (document.getElementById('wsFilterProc')?.value || '').toLowerCase();
        const part = (document.getElementById('wsFilterPart')?.value || '').toLowerCase();
        const rows = _flattenPages()
            .filter(x => !car  || (x.page.carModel||x.page.model||'').toLowerCase().includes(car))
            .filter(x => !proc || (x.page.processName||'').toLowerCase().includes(proc))
            .filter(x => !part || (x.page.partName||'').toLowerCase().includes(part))
            .sort((a,b) => (a.page.processNo||'').localeCompare(b.page.processNo||'','ko'));
        const tbody = document.getElementById('wsBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">
                등록된 작업 표준서가 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;"
                    onclick="WorkStandardModule.openEditor()">
                    <span class="material-symbols-outlined">add</span> 첫 표준서 등록</button></td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(({doc, pageIdx, pageCount, page: p}) => {
            const lastRev = (p.revisions||[]).filter(v=>v.date).pop();
            return `<tr>
                <td style="text-align:center;">${_esc(p.processNo)}</td>
                <td><strong>${_esc(p.processName)}</strong></td>
                <td>${_esc(p.carModel||p.model||'-')}</td>
                <td>${_esc(p.partName)}</td>
                <td>${_esc(p.equipName)}</td>
                <td style="text-align:center;">${pageCount>1 ? (pageIdx+1)+' / '+pageCount : '-'}</td>
                <td style="text-align:center;">${lastRev ? lastRev.no : 0}</td>
                <td style="text-align:center;font-size:0.8rem;">${(doc.updatedAt||'').slice(0,10)}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm" style="background:#4b5563;color:#fff;"
                        onclick="WorkStandardModule.preview('${_js(doc.id)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">preview</span>
                    </button>
                    <button class="btn btn-sm btn-outline"
                        onclick="WorkStandardModule.openEditor('${_js(doc.id)}',${pageIdx})">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="WorkStandardModule.remove('${_js(doc.id)}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    /* ════════════════════════════════════════════════════════════
       편집기 (전체 화면)
    ════════════════════════════════════════════════════════════ */
    function openEditor(id, pageIdx) {
        _editId = id || null;
        const rec = id ? _all().find(r => r.id === id) : null;
        if (rec) {
            const clone = JSON.parse(JSON.stringify(rec));
            if (Array.isArray(clone.pages) && clone.pages.length) {
                _editData = { pages: clone.pages.map(_normalizePage) };
            } else {
                // 구 데이터 호환: 문서 전체에 공통이던 헤더/개정내용을 페이지 1장으로 이전
                _editData = { pages: [_normalizePage({
                    processNo: clone.processNo, processName: clone.processName,
                    equipName: clone.equipName, partName: clone.partName,
                    carModel: clone.carModel || clone.model,
                    author: clone.author, reviewer: clone.reviewer, approver: clone.approver,
                    authorDate: clone.authorDate, reviewerDate: clone.reviewerDate, approverDate: clone.approverDate,
                    workSteps: clone.workSteps, stepCols: clone.stepCols, stepGap: clone.stepGap,
                    condManage: clone.condManage || clone.conditions,
                    selfInspect: clone.selfInspect, abnormalCond: clone.abnormalCond,
                    condVisible: clone.condVisible,
                    safetyNotes: clone.safetyNotes, abnormalActions: clone.abnormalActions,
                    revisions: clone.revisions,
                })] };
            }
        } else {
            _editData = { pages: [_defPage()] };
        }
        _activePageIdx = Math.min(Math.max(parseInt(pageIdx,10)||0, 0), _editData.pages.length - 1);
        _container.innerHTML = _editorHtml(rec ? '수정' : '신규 등록');
        _renderAll();
    }

    function _editorHtml(title) {
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
                        <span style="font-weight:400;font-size:0.8rem;color:var(--text-muted);margin-left:6px;">실제 양식에 바로 입력합니다 · 페이지마다 독립된 문서입니다</span>
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

            <!-- 페이지 탭 (각 페이지가 헤더/결재/개정내용까지 포함한 독립 문서) -->
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-right:2px;">페이지</span>
                <div id="wsPageTabs" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;"></div>
                <button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;"
                    onclick="WorkStandardModule._addPage()">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">add</span> 페이지 추가
                </button>
            </div>

            <div style="overflow-x:auto;background:#cbd5e1;padding:12px;border-radius:8px;">
                <div id="wsPageBody"></div>
            </div>
        </div>`;
    }

    function _condTblEditHtml(key, label) {
        const C  = 'border:1px solid #222;padding:2px 4px;';
        const HB = 'border:1px solid #222;padding:3px 4px;background:#bdd7ee;font-weight:700;text-align:center;font-size:7.8pt;position:relative;';
        const visible = _curPage().condVisible ? _curPage().condVisible[key] !== false : true;
        const w = _curPage().condColWidths || [6,15,26,13,9,23,8];
        const heads = ['순','관리항목','관리기준','확인방법','주기','관리방안',''];
        const thHtml = heads.map((h, i) => {
            const handle = i < heads.length - 1
                ? `<div class="ws-col-handle" title="드래그하여 열 너비 조절" onmousedown="WorkStandardModule._startColDrag(event,${i})"
                       onmouseenter="this.style.background='rgba(234,179,8,0.85)'" onmouseleave="this.style.background='rgba(250,204,21,0.55)'"
                       style="position:absolute;top:0;bottom:0;right:-3px;width:6px;cursor:col-resize;z-index:3;
                              background:rgba(250,204,21,0.55);border-left:1px solid rgba(202,138,4,0.6);border-right:1px solid rgba(202,138,4,0.6);"></div>`
                : '';
            return `<th style="${HB}">${h}${handle}</th>`;
        }).join('');
        return `
        <div id="wsCondWrap_${key}">
            <div style="background:#bdd7ee;border:1px solid #222;padding:3px 5px;text-align:center;
                        font-weight:700;font-size:9pt;letter-spacing:2px;display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:400;
                              letter-spacing:0;cursor:pointer;white-space:nowrap;">
                    <input type="checkbox" id="wsCondOn_${key}" ${visible ? 'checked' : ''}
                        onchange="WorkStandardModule._toggleCondSection('${key}')" style="width:12px;height:12px;">사용
                </label>
                <span style="flex:1;">${_esc(label)}</span>
                <button type="button" onclick="WorkStandardModule._addCondRow('${key}')"
                    style="border:1px solid #fff;background:rgba(255,255,255,.35);border-radius:4px;
                           color:#1e3a5f;cursor:pointer;font-size:0.65rem;padding:0 6px;line-height:1.6;">+ 행</button>
            </div>
            <table id="wsCondTable_${key}" style="width:100%;border-collapse:collapse;table-layout:fixed;${visible ? '' : 'display:none;'}">
                <colgroup>
                    ${w.map(pct => `<col style="width:${pct}%">`).join('')}
                </colgroup>
                <thead><tr>${thHtml}</tr></thead>
                <tbody id="wsCondBody_${key}"></tbody>
            </table>
        </div>`;
    }

    /* ── 조건표 열 너비(드래그) / 행 높이(공통) 조절 ─────────────── */
    let _colDragState = null;

    function _startColDrag(e, colIdx) {
        e.preventDefault();
        e.stopPropagation();
        const table = e.target.closest('table');
        const tableWidth = table ? table.getBoundingClientRect().width : 700;
        _colDragState = {
            colIdx, startX: e.clientX, tableWidth,
            startWidths: (_curPage().condColWidths || [6,15,26,13,9,23,8]).slice(),
        };
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', _onColDrag);
        document.addEventListener('mouseup', _endColDrag);
    }

    function _onColDrag(e) {
        if (!_colDragState) return;
        const { colIdx, startX, tableWidth, startWidths } = _colDragState;
        const deltaPct = ((e.clientX - startX) / tableWidth) * 100;
        const MIN = 4;
        let a = startWidths[colIdx] + deltaPct;
        let b = startWidths[colIdx + 1] - deltaPct;
        if (a < MIN) { b -= (MIN - a); a = MIN; }
        if (b < MIN) { a -= (MIN - b); b = MIN; }
        const widths = startWidths.slice();
        widths[colIdx] = Math.round(a * 10) / 10;
        widths[colIdx + 1] = Math.round(b * 10) / 10;
        _curPage().condColWidths = widths;
        _applyCondColWidths(widths);
    }

    function _endColDrag() {
        _colDragState = null;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', _onColDrag);
        document.removeEventListener('mouseup', _endColDrag);
    }

    function _applyCondColWidths(widths) {
        ['condManage', 'selfInspect', 'abnormalCond'].forEach(key => {
            const table = document.getElementById('wsCondTable_' + key);
            if (!table) return;
            const cols = table.querySelectorAll('colgroup col');
            cols.forEach((col, i) => { if (widths[i] != null) col.style.width = widths[i] + '%'; });
        });
    }

    function _toggleCondSection(key) {
        const cb = document.getElementById('wsCondOn_' + key);
        const tbl = document.getElementById('wsCondTable_' + key);
        if (!cb || !tbl) return;
        if (!_curPage().condVisible) _curPage().condVisible = { condManage:true, selfInspect:true, abnormalCond:true };
        _curPage().condVisible[key] = !!cb.checked;
        tbl.style.display = cb.checked ? '' : 'none';
    }

    /* ── 페이지 탭 + 페이지 본문(작업순서/조건표/안전관리) ─────── */
    /* 페이지 본문 전체 — 헤더/결재부터 개정내용까지 완전히 독립된 한 장의 문서 */
    function _pageBodyHtml() {
        const p = _curPage();
        const B  = 'border:1px solid #222;';
        const C  = B + 'padding:2px 4px;';
        const HB = B + 'padding:3px 5px;background:#bdd7ee;font-weight:700;text-align:center;font-size:8.5pt;';
        const inp = (id,val,ph) => `<input id="${id}" value="${_esc(val||'')}" placeholder="${_esc(ph||'')}"
            style="width:100%;border:none;background:transparent;font-size:8.5pt;padding:2px;font-family:inherit;">`;
        const dateInp = (id,val) => `<input type="date" id="${id}" value="${_esc(val||'')}"
            style="width:100%;border:none;background:transparent;font-size:7.5pt;padding:2px;text-align:center;font-family:inherit;">`;

        return `
        <div id="wsEditDocArea" style="background:#fff;margin:0 auto;width:100%;max-width:1587px;aspect-ratio:420/297;padding:6mm 7mm;box-sizing:border-box;
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
                        <td style="${C}">${inp('wsProcessNo', p.processNo, '예) 60_1,2')}</td>
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
                        <td style="${C}">${inp('wsProcessName', p.processName, '예) 도료 공급')}</td>
                        <td rowspan="3" style="${C}font-weight:700;text-align:center;vertical-align:middle;font-size:9pt;">결<br>재</td>
                        <td rowspan="3" style="${C}text-align:center;vertical-align:middle;height:48px;">${inp('wsAuthor', p.author)}</td>
                        <td rowspan="3" style="${C}text-align:center;vertical-align:middle;">${inp('wsReviewer', p.reviewer)}</td>
                        <td rowspan="3" style="${C}text-align:center;vertical-align:middle;">${inp('wsApprover', p.approver)}</td>
                    </tr>
                    <tr>
                        <td style="${C}font-weight:700;font-size:8.5pt;">설 비 명</td>
                        <td style="${C}">${inp('wsEquipName', p.equipName, '예) B-LINE 도료탱크')}</td>
                    </tr>
                    <tr>
                        <td style="${C}font-weight:700;font-size:8.5pt;">품&nbsp;&nbsp;&nbsp;명</td>
                        <td style="${C}">${inp('wsPartName', p.partName, '예) ALL')}</td>
                    </tr>
                    <tr>
                        <td style="${C}font-weight:700;font-size:8.5pt;">모&nbsp;&nbsp;&nbsp;델</td>
                        <td style="${C}">${inp('wsCarModel', p.carModel, '예) 전차종')}</td>
                        <td style="${C}font-size:7.5pt;text-align:center;">/</td>
                        <td style="${C}">${dateInp('wsAuthorDate', p.authorDate||_today())}</td>
                        <td style="${C}">${dateInp('wsReviewerDate', p.reviewerDate)}</td>
                        <td style="${C}">${dateInp('wsApproverDate', p.approverDate)}</td>
                    </tr>
                </tbody>
            </table>

            <!-- 본문 2단: 좌=작업순서, 우=조건표+안전관리+이상조치 -->
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px;">
                <colgroup><col style="width:54%"><col style="width:46%"></colgroup>
                <tbody>
                    <tr>
                        <td style="vertical-align:top;${B}padding:0;">
                            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;display:flex;align-items:center;gap:10px;">
                                <span style="flex:1;">작 업 순 서</span>
                                <label style="display:flex;align-items:center;gap:3px;font-size:0.65rem;font-weight:400;letter-spacing:0;">열
                                    <select id="wsStepCols" onchange="WorkStandardModule._applyStepLayout()" style="font-size:0.7rem;padding:1px 3px;">
                                        <option value="1"${(p.stepCols||3)===1?' selected':''}>1</option>
                                        <option value="2"${(p.stepCols||3)===2?' selected':''}>2</option>
                                        <option value="3"${(p.stepCols||3)===3?' selected':''}>3</option>
                                        <option value="4"${(p.stepCols||3)===4?' selected':''}>4</option>
                                    </select>
                                </label>
                                <label style="display:flex;align-items:center;gap:3px;font-size:0.65rem;font-weight:400;letter-spacing:0;">간격
                                    <input type="number" id="wsStepGap" min="4" max="40" value="${p.stepGap??8}"
                                        onchange="WorkStandardModule._applyStepLayout()" style="width:42px;font-size:0.7rem;padding:1px 3px;">
                                </label>
                                <button type="button" class="btn btn-sm btn-outline" style="padding:1px 8px;font-size:0.68rem;"
                                    onclick="WorkStandardModule._addStep()">
                                    <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> 단계 추가
                                </button>
                            </div>
                            <div id="wsStepsList" style="min-height:400px;padding:6px;"></div>
                        </td>
                        <td style="vertical-align:top;border:1px solid #222;border-left:none;padding:0;">
                            ${_condTblEditHtml('condManage','조건관리 표준 (만드는 조건)')}
                            <div style="height:1px;background:#222;"></div>
                            ${_condTblEditHtml('selfInspect','자주검사 표준 (만들어진 조건)')}
                            <div style="height:1px;background:#222;"></div>
                            ${_condTblEditHtml('abnormalCond','소모품 / 치공구 / 교환주기')}
                            <div style="height:1px;background:#222;"></div>
                            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;">안 전 관 리</div>
                            <textarea id="wsSafetyNotes" rows="4" placeholder="줄바꿈으로 항목을 구분해 입력하세요"
                                style="width:100%;border:none;resize:vertical;font-size:8.5pt;padding:4px 6px;font-family:inherit;">${_esc(p.safetyNotes||'')}</textarea>
                            <div style="height:1px;background:#222;"></div>
                            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:2px;">이상 발생 시 조치사항</div>
                            <textarea id="wsAbnormalActions" rows="4" placeholder="줄바꿈으로 항목을 구분해 입력하세요"
                                style="width:100%;border:none;resize:vertical;font-size:8.5pt;padding:4px 6px;font-family:inherit;">${_esc(p.abnormalActions||'')}</textarea>
                            <div style="height:1px;background:#222;"></div>
                            <div style="display:flex;align-items:center;background:#bdd7ee;${C}font-weight:700;font-size:9pt;letter-spacing:3px;">
                                <span style="flex:1;text-align:center;">개 정 내 용</span>
                                <button type="button" class="btn btn-sm btn-outline" style="padding:1px 8px;font-size:0.68rem;"
                                    onclick="WorkStandardModule._addRevRow()">
                                    <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">add</span> 행 추가
                                </button>
                            </div>
                            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                                <colgroup>
                                    <col style="width:5%"><col style="width:14%"><col style="width:24%"><col style="width:7%">
                                    <col style="width:5%"><col style="width:14%"><col style="width:24%"><col style="width:7%">
                                </colgroup>
                                <thead><tr>
                                    <th style="${HB}">NO</th><th style="${HB}">개정일자</th><th style="${HB}">개정사유</th><th style="${HB}">확인</th>
                                    <th style="${HB}border-left:none;">NO</th><th style="${HB}border-left:none;">개정일자</th><th style="${HB}border-left:none;">개정사유</th><th style="${HB}border-left:none;">확인</th>
                                </tr></thead>
                                <tbody id="wsRevBody"></tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style="display:flex;justify-content:space-between;margin-top:4px;
                        font-size:8pt;color:#555;border-top:1px solid #bbb;padding-top:3px;">
                <span>(주)케이씨케미칼</span>
                <span>A3 (420 × 297mm)</span>
            </div>
        </div>`;
    }

    function _renderPageTabs() {
        const el = document.getElementById('wsPageTabs');
        if (!el) return;
        const n = _editData.pages.length;
        el.innerHTML = _editData.pages.map((pg, idx) => `
            <span style="display:inline-flex;align-items:center;gap:2px;">
                <button type="button" onclick="WorkStandardModule._switchPage(${idx})"
                    style="padding:3px 10px;font-size:0.74rem;font-weight:700;border-radius:6px 6px 0 0;cursor:pointer;
                           border:1px solid var(--border-color);border-bottom:${idx===_activePageIdx?'2px solid var(--bg-primary)':'1px solid var(--border-color)'};
                           background:${idx===_activePageIdx?'var(--accent-blue)':'var(--bg-secondary)'};color:${idx===_activePageIdx?'#fff':'var(--text-secondary)'};"
                    title="${_esc(pg.processNo || pg.processName || '')}">
                    ${idx+1} 페이지${pg.processNo ? ' · ' + _esc(pg.processNo) : ''}
                </button>
                ${n>1 ? `<button type="button" onclick="WorkStandardModule._removePage(${idx})" title="이 페이지 삭제"
                    style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:0.72rem;font-weight:700;padding:0 2px;">×</button>` : ''}
            </span>`).join('');
    }

    function _renderPageBody() {
        const el = document.getElementById('wsPageBody');
        if (!el) return;
        el.innerHTML = _pageBodyHtml();
        _renderPageTabs();
        _renderSteps();
        _renderCondTable('condManage');
        _renderCondTable('selfInspect');
        _renderCondTable('abnormalCond');
        _renderRevTable();
    }

    function _syncCurrentPage() {
        _syncSteps();
        _syncCond('condManage'); _syncCond('selfInspect'); _syncCond('abnormalCond');
        _syncRevs();
        const p = _curPage();
        p.processNo   = document.getElementById('wsProcessNo')?.value.trim()   || '';
        p.processName = document.getElementById('wsProcessName')?.value.trim() || '';
        p.carModel    = document.getElementById('wsCarModel')?.value.trim()    || '';
        p.partName    = document.getElementById('wsPartName')?.value.trim()    || '';
        p.equipName   = document.getElementById('wsEquipName')?.value.trim()   || '';
        p.author      = document.getElementById('wsAuthor')?.value.trim()      || '';
        p.reviewer    = document.getElementById('wsReviewer')?.value.trim()    || '';
        p.approver    = document.getElementById('wsApprover')?.value.trim()    || '';
        p.authorDate   = document.getElementById('wsAuthorDate')?.value   || '';
        p.reviewerDate = document.getElementById('wsReviewerDate')?.value || '';
        p.approverDate = document.getElementById('wsApproverDate')?.value || '';
        const safetyEl = document.getElementById('wsSafetyNotes');
        const actionEl = document.getElementById('wsAbnormalActions');
        if (safetyEl) p.safetyNotes = safetyEl.value;
        if (actionEl) p.abnormalActions = actionEl.value;
    }

    function _switchPage(idx) {
        if (idx === _activePageIdx || idx < 0 || idx >= _editData.pages.length) return;
        _syncCurrentPage();
        _activePageIdx = idx;
        _renderPageBody();
    }

    function _addPage() {
        _syncCurrentPage();
        _editData.pages.push(_defPage());
        _activePageIdx = _editData.pages.length - 1;
        _renderPageBody();
    }

    function _removePage(idx) {
        if (_editData.pages.length <= 1) return;
        UIUtils.confirm((idx+1) + '페이지를 삭제하시겠습니까?', () => {
            _editData.pages.splice(idx, 1);
            if (_activePageIdx >= _editData.pages.length) _activePageIdx = _editData.pages.length - 1;
            else if (_activePageIdx > idx) _activePageIdx -= 1;
            _renderPageBody();
        });
    }

    /* ── 렌더 전체 ──────────────────────────────────────────── */
    function _renderAll() {
        _renderPageBody();
    }

    /* ── 작업 단계 타일 (열/행 사이 선을 그리드 자체 트랙으로 만들어 드래그 조절) ── */
    const MIN_STEP_GAP = 4;
    const MAX_STEP_GAP = 40;

    function _renderSteps() {
        const list = document.getElementById('wsStepsList');
        if (!list) return;
        const page = _curPage();
        const cols = page.stepCols || 3;
        const gap  = Math.max(MIN_STEP_GAP, page.stepGap ?? 8);
        page.stepGap = gap;
        const n = page.workSteps.length;
        const rows = Math.max(1, Math.ceil(n / cols));

        // 타일 트랙(1fr) 사이사이에 간격 트랙(gapPx)을 끼워 넣어 간격 자체를 그리드 셀로 만든다.
        // → 별도 좌표 계산 없이 그리드가 알아서 정확히 그 위치에 드래그 핸들을 배치해준다.
        const colTracks = []; for (let c = 0; c < cols; c++) { colTracks.push('1fr'); if (c < cols - 1) colTracks.push(gap + 'px'); }
        const rowTracks = []; for (let r = 0; r < rows; r++) { rowTracks.push('auto'); if (r < rows - 1) rowTracks.push(gap + 'px'); }

        list.style.display = 'grid';
        list.style.gridTemplateColumns = colTracks.join(' ');
        list.style.gridTemplateRows = rowTracks.join(' ');
        list.style.gap = '0';
        list.style.alignItems = 'start';

        const tilesHtml = page.workSteps.map((s, i) => {
            const r = Math.floor(i / cols), c = i % cols;
            return _stepCardHtml(s, i, `grid-row:${r * 2 + 1};grid-column:${c * 2 + 1};`);
        }).join('');

        let resizersHtml = '';
        for (let c = 0; c < cols - 1; c++) {
            resizersHtml += `<div class="ws-gap-handle" data-axis="col" title="드래그하여 열 간격 조절"
                style="grid-row:1 / -1;grid-column:${c * 2 + 2};cursor:col-resize;position:relative;
                       background:rgba(250,204,21,0.55);border-left:1px solid rgba(202,138,4,0.6);border-right:1px solid rgba(202,138,4,0.6);">
            </div>`;
        }
        for (let r = 0; r < rows - 1; r++) {
            resizersHtml += `<div class="ws-gap-handle" data-axis="row" title="드래그하여 행 간격 조절"
                style="grid-column:1 / -1;grid-row:${r * 2 + 2};cursor:row-resize;position:relative;
                       background:rgba(250,204,21,0.55);border-top:1px solid rgba(202,138,4,0.6);border-bottom:1px solid rgba(202,138,4,0.6);">
            </div>`;
        }

        list.innerHTML = tilesHtml + resizersHtml;
        list.querySelectorAll('.ws-gap-handle').forEach(h => {
            h.addEventListener('mousedown', e => _startGapDrag(e, h.dataset.axis));
            h.addEventListener('mouseenter', () => { h.style.background = 'rgba(234,179,8,0.85)'; });
            h.addEventListener('mouseleave', () => { h.style.background = 'rgba(250,204,21,0.55)'; });
        });
    }

    function _applyStepLayout() {
        _syncSteps();
        const colsEl = document.getElementById('wsStepCols');
        const gapEl  = document.getElementById('wsStepGap');
        const page = _curPage();
        page.stepCols = parseInt(colsEl && colsEl.value, 10) || 3;
        const gap = parseInt(gapEl && gapEl.value, 10);
        page.stepGap = Number.isFinite(gap) ? Math.max(MIN_STEP_GAP, gap) : 8;
        _renderSteps();
    }

    let _gapDragState = null;

    function _startGapDrag(e, axis) {
        e.preventDefault();
        _gapDragState = { axis, startX: e.clientX, startY: e.clientY, startGap: _curPage().stepGap ?? 8 };
        document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';
        document.addEventListener('mousemove', _onGapDrag);
        document.addEventListener('mouseup', _endGapDrag);
    }

    function _onGapDrag(e) {
        if (!_gapDragState) return;
        const delta = _gapDragState.axis === 'col' ? (e.clientX - _gapDragState.startX) : (e.clientY - _gapDragState.startY);
        const newGap = Math.max(MIN_STEP_GAP, Math.min(MAX_STEP_GAP, Math.round(_gapDragState.startGap + delta)));
        const page = _curPage();
        if (newGap !== page.stepGap) {
            _syncSteps();
            page.stepGap = newGap;
            const gapEl = document.getElementById('wsStepGap');
            if (gapEl) gapEl.value = newGap;
            _renderSteps();
        }
    }

    function _endGapDrag() {
        _gapDragState = null;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', _onGapDrag);
        document.removeEventListener('mouseup', _endGapDrag);
    }

    function _stepCardHtml(s, i, gridArea) {
        const photos = s.photos || [];
        const photoSlots = photos.map((p,pi) => `
            <div style="position:relative;flex:1;min-width:0;">
                <img src="${p}" style="width:100%;height:110px;object-fit:cover;display:block;
                            cursor:pointer;border:1px solid #222;"
                     onclick="WorkStandardModule._replacePhoto(${i},${pi})" title="클릭하여 변경">
                <button style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.9);
                               color:#fff;border:none;border-radius:50%;width:18px;height:18px;
                               cursor:pointer;font-size:11px;line-height:1;padding:0;display:flex;
                               align-items:center;justify-content:center;"
                    onclick="WorkStandardModule._removePhoto(${i},${pi})">×</button>
            </div>`).join('');
        const addPhotoBtn = `
            <div style="flex:${photos.length ? '0 0 auto' : '1'};min-width:${photos.length ? '54px' : '0'};">
                <div tabindex="0" title="클릭해 파일 선택, 또는 여기를 클릭한 뒤 Ctrl+V로 붙여넣기"
                     style="width:${photos.length ? '54px' : '100%'};height:110px;border:2px dashed #94a3b8;
                            display:flex;flex-direction:column;align-items:center;justify-content:center;
                            cursor:pointer;color:#64748b;gap:2px;background:#f8fafc;outline:none;"
                     onclick="WorkStandardModule._addPhoto(${i})"
                     onpaste="WorkStandardModule._pastePhoto(event,${i})"
                     onfocus="this.style.borderColor='var(--accent-blue)'"
                     onblur="this.style.borderColor='#94a3b8'">
                    <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">add_photo_alternate</span>
                    ${photos.length ? '' : '<span style="font-size:0.62rem;text-align:center;line-height:1.3;">사진 추가<br>(Ctrl+V 붙여넣기)</span>'}
                </div>
            </div>`;
        return `
        <div class="ws-step-tile" style="${gridArea||''}border:1px solid #222;display:flex;flex-direction:column;background:#fff;min-width:0;overflow:hidden;box-sizing:border-box;">
            <div style="background:#bdd7ee;border-bottom:1px solid #222;padding:5px 8px;
                        display:flex;align-items:center;gap:6px;min-width:0;">
                <span style="font-weight:700;font-size:0.82rem;white-space:nowrap;">${i+1}.</span>
                <input type="text" id="wsStepName_${i}" value="${_esc(s.name)}"
                       placeholder="단계 제목 입력"
                       style="flex:1;background:transparent;border:none;font-size:0.82rem;
                              font-weight:700;text-align:center;min-width:0;">
                <button type="button" style="border:none;background:none;color:#dc2626;
                               cursor:pointer;font-size:0.72rem;font-weight:700;white-space:nowrap;"
                    onclick="WorkStandardModule._delStep(${i})">삭제</button>
            </div>
            <div style="display:flex;gap:2px;padding:2px;min-width:0;">
                ${photoSlots}${addPhotoBtn}
            </div>
            <textarea id="wsStepDesc_${i}" rows="2"
                style="width:100%;border:none;border-top:1px solid #222;background:#ffef9f;
                       resize:vertical;font-size:0.78rem;font-weight:700;text-align:center;
                       padding:6px 8px;font-family:inherit;box-sizing:border-box;"
                placeholder="작업 설명 입력...">${_esc(s.desc)}</textarea>
        </div>`;
    }

    function _addStep() {
        _syncSteps();
        const steps = _curPage().workSteps;
        steps.push({no:steps.length+1, name:'', photos:[], desc:''});
        _renderSteps();
        setTimeout(() => {
            const tiles = document.querySelectorAll('#wsStepsList .ws-step-tile');
            const last = tiles[tiles.length - 1];
            if (last) last.scrollIntoView({behavior:'smooth',block:'nearest'});
        }, 100);
    }

    function _delStep(idx) {
        _syncSteps();
        const steps = _curPage().workSteps;
        steps.splice(idx,1);
        steps.forEach((s,i) => s.no = i+1);
        _renderSteps();
    }

    function _syncSteps() {
        _curPage().workSteps.forEach((s,i) => {
            const nameEl = document.getElementById(`wsStepName_${i}`);
            const descEl = document.getElementById(`wsStepDesc_${i}`);
            if (nameEl) s.name = nameEl.value;
            if (descEl) s.desc = descEl.value;
        });
    }

    function _addPhoto(stepIdx) {
        _syncSteps();
        _openFilePicker(file => {
            _curPage().workSteps[stepIdx].photos.push(file);
            _renderSteps();
        });
    }

    function _replacePhoto(stepIdx, photoIdx) {
        _syncSteps();
        _openFilePicker(file => {
            _curPage().workSteps[stepIdx].photos[photoIdx] = file;
            _renderSteps();
        });
    }

    function _removePhoto(stepIdx, photoIdx) {
        _syncSteps();
        _curPage().workSteps[stepIdx].photos.splice(photoIdx, 1);
        _renderSteps();
    }

    /* ── 사진 추가 칸을 클릭(포커스)한 뒤 Ctrl+V로 클립보드 이미지 붙여넣기 ── */
    function _pastePhoto(e, stepIdx) {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === 'file' && it.type.indexOf('image') === 0) {
                e.preventDefault();
                const file = it.getAsFile();
                if (!file) continue;
                if (file.size > 3 * 1024 * 1024) { UIUtils.toast('사진은 3MB 이하로 붙여넣으세요.','warning'); return; }
                _syncSteps();
                const reader = new FileReader();
                reader.onload = ev => {
                    _curPage().workSteps[stepIdx].photos.push(ev.target.result);
                    _renderSteps();
                };
                reader.readAsDataURL(file);
                return;
            }
        }
        UIUtils.toast('클립보드에 이미지가 없습니다.', 'warning');
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
        tb.innerHTML = (_curPage()[key]||[]).map((c,i) => _condRowHtml(key,c,i)).join('');
    }

    function _condRowHtml(key, c, i) {
        const C = 'border:1px solid #222;padding:1px 2px;';
        const cellInp = (id,val,ph='') => `<input id="${id}" value="${_esc(val||'')}" placeholder="${ph}"
            style="width:100%;border:none;background:transparent;font-size:7.8pt;padding:2px 3px;font-family:inherit;">`;
        return `<tr style="height:23px;">
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

    function _addCondRow(key) { _syncCond(key); const arr=_curPage()[key]; arr.push({no:arr.length+1,item:'',standard:'',method:'',cycle:'',measure:''}); _renderCondTable(key); }
    function _delCondRow(key,idx) { _syncCond(key); _curPage()[key].splice(idx,1); _renderCondTable(key); }

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
        _curPage()[key] = arr;
    }

    /* ── 개정 내용 (좌/우 2열 대응 표시, id는 순차 인덱스 유지) ──── */
    function _renderRevTable() {
        const tb = document.getElementById('wsRevBody');
        if (!tb) return;
        const revs = _curPage().revisions || [];
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
        const page = _curPage();
        const arr=[]; let i=0;
        while (document.getElementById(`wsRd_${i}`) !== null) {
            arr.push({no:page.revisions[i]?.no??i,
                date:    document.getElementById(`wsRd_${i}`).value,
                reason:  document.getElementById(`wsRr_${i}`).value,
                confirm: document.getElementById(`wsRc_${i}`).value,
            });
            i++;
        }
        page.revisions = arr;
    }

    function _addRevRow() {
        _syncRevs();
        const revs = _curPage().revisions;
        revs.push({no:revs.length, date:'', reason:'', confirm:''});
        _renderRevTable();
    }

    /* ── 전체 수집 (페이지마다 완전히 독립된 문서) ────────────── */
    function _collectAll() {
        _syncCurrentPage();
        return {
            pages:     _editData.pages,
            updatedAt: new Date().toISOString(),
        };
    }

    /* ════════════════════════════════════════════════════════════
       저장 / 삭제
    ════════════════════════════════════════════════════════════ */
    async function save() {
        const data = _collectAll();
        const badIdx = data.pages.findIndex(p => !p.processName || !p.carModel);
        if (badIdx >= 0) {
            UIUtils.toast((badIdx+1) + '페이지의 공정명/차종을 입력하세요.', 'error');
            _switchPage(badIdx);
            return;
        }
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
    function _recWithPages(rec) {
        if (Array.isArray(rec.pages) && rec.pages.length) return rec;
        return Object.assign({}, rec, { pages: [_normalizePage({
            processNo: rec.processNo, processName: rec.processName,
            equipName: rec.equipName, partName: rec.partName,
            carModel: rec.carModel || rec.model,
            author: rec.author, reviewer: rec.reviewer, approver: rec.approver,
            authorDate: rec.authorDate, reviewerDate: rec.reviewerDate, approverDate: rec.approverDate,
            workSteps: rec.workSteps, stepCols: rec.stepCols, stepGap: rec.stepGap,
            condManage: rec.condManage || rec.conditions, selfInspect: rec.selfInspect,
            abnormalCond: rec.abnormalCond, condVisible: rec.condVisible,
            safetyNotes: rec.safetyNotes, abnormalActions: rec.abnormalActions,
            revisions: rec.revisions,
        })] });
    }

    function preview(id, mode) {
        const raw = mode === 'edit' ? _collectAll() : _all().find(r => r.id === id);
        if (!raw) return;
        _showPreview(_recWithPages(raw));
    }

    function _showPreview(rec) {
        const old = document.getElementById('wsPreviewOverlay');
        if (old) old.remove();
        const pages = rec.pages && rec.pages.length ? rec.pages : [_defPage()];
        const pagesHtml = pages.map((_, idx) => `
            <div class="ws-print-page" style="background:#fff;margin:0 auto 16px;width:420mm;min-height:297mm;padding:6mm 7mm;box-sizing:border-box;
                font-family:'맑은 고딕','나눔고딕',Arial,sans-serif;color:#000;font-size:9.5pt;line-height:1.3;">
                ${_buildDocHtml(rec, idx)}
            </div>`).join('');
        const overlay = document.createElement('div');
        overlay.id = 'wsPreviewOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999;'+
            'display:flex;flex-direction:column;overflow:auto;padding:16px;';
        overlay.innerHTML = `
            <div style="max-width:1240px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;width:100%;">
                <div style="background:#1e293b;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#fff;font-weight:600;">
                        작업 표준서 — ${_esc(pages[0].processName||'')} [${_esc(pages[0].carModel||'')}] · 총 ${pages.length}페이지
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
                    <div id="wsDocArea">${pagesHtml}</div>
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
            .ws-print-page{width:420mm;min-height:297mm;padding:6mm 7mm;margin:0 auto;}
            @media print{
                @page{size:A3 landscape;margin:6mm;}
                body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
                .ws-print-page{page-break-after:always;margin:0;}
                .ws-print-page:last-child{page-break-after:auto;}
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
    function _buildDocHtml(rec, pageIdx) {
        pageIdx = pageIdx || 0;
        const pageList = (rec.pages && rec.pages.length) ? rec.pages : [_defPage()];
        const page = pageList[pageIdx] || _defPage();
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
                    <td style="${C}font-size:8.5pt;">${_esc(page.processNo)}</td>
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
                    <td style="${C}font-size:8.5pt;">${_esc(page.processName)}</td>
                    <td rowspan="3" style="${C}font-weight:700;text-align:center;vertical-align:middle;font-size:9pt;">결<br>재</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;height:48px;font-size:9pt;">${_esc(page.author)}</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;font-size:9pt;">${_esc(page.reviewer)}</td>
                    <td rowspan="3" style="${C}text-align:center;vertical-align:middle;font-size:9pt;">${_esc(page.approver)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">설 비 명</td>
                    <td style="${C}font-size:8.5pt;">${_esc(page.equipName)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">품&nbsp;&nbsp;&nbsp;명</td>
                    <td style="${C}font-size:8.5pt;">${_esc(page.partName)}</td>
                </tr>
                <tr>
                    <td style="${C}font-weight:700;font-size:8.5pt;">모&nbsp;&nbsp;&nbsp;델</td>
                    <td style="${C}font-size:8.5pt;">${_esc(page.carModel||page.model||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">/</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(page.authorDate||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(page.reviewerDate||'')}</td>
                    <td style="${C}font-size:7.5pt;text-align:center;">${_esc(page.approverDate||'')}</td>
                </tr>
            </tbody>
        </table>`;

        /* ── 좌측: 작업 순서 (열/간격 조절 가능한 타일 그리드) ───── */
        const steps = (page.workSteps||[]).map(_normalizeStep);
        const stepCols = page.stepCols || 3;
        const stepGap  = page.stepGap ?? 8;
        const stepsHtml = steps.length ? `
            <div style="display:grid;grid-template-columns:repeat(${stepCols},1fr);gap:${stepGap}px;padding:${stepGap}px;">
                ${steps.map((s,i) => {
                    const photos = s.photos || [];
                    const photoRow = photos.length
                        ? `<div style="display:flex;gap:2px;padding:2px;">${photos.map(p => `
                            <div style="flex:1;min-width:0;"><img src="${p}"
                                style="width:100%;height:110px;object-fit:cover;display:block;border:1px solid #222;"></div>`).join('')}</div>`
                        : '';
                    return `
                    <div style="${B}display:flex;flex-direction:column;background:#fff;">
                        <div style="background:#bdd7ee;border-bottom:1px solid #222;padding:5px 8px;
                                    text-align:center;font-weight:700;font-size:8.5pt;">
                            ${i+1}. ${_esc(s.name||'작업 단계 '+(i+1))}
                        </div>
                        ${photoRow}
                        <div style="border-top:1px solid #222;background:#ffef9f;font-weight:700;
                                    font-size:8pt;text-align:center;padding:6px 8px;white-space:pre-wrap;">
                            ${_esc(s.desc).replace(/\n/g,'<br>')}
                        </div>
                    </div>`;
                }).join('')}
            </div>`
        : `<div style="padding:20px;text-align:center;color:#999;">작업 순서를 입력하세요.</div>`;

        /* ── 우측: 조건관리 표준 ─────────────────────────────── */
        const condW = page.condColWidths || [6,15,26,13,9,23,8];
        const _condTbl = (rows, label) => {
            const data = [...(rows||[])];
            while (data.length < 3) data.push({no:data.length+1,item:'',standard:'',method:'',cycle:'',measure:''});
            return `
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;
                        font-size:9pt;letter-spacing:2px;">${label}</div>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                <colgroup>
                    <col style="width:${condW[0]}%"><col style="width:${condW[1]}%"><col style="width:${condW[2]}%">
                    <col style="width:${condW[3]}%"><col style="width:${condW[4]}%"><col style="width:${condW[5]+condW[6]}%">
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

        const safetyLines = (page.safetyNotes||'').split('\n').filter(Boolean);
        const safetyHtml = safetyLines.map((l,i)=>`<div style="padding:2px 0;">${i+1}. ${_esc(l)}</div>`).join('') ||
            '<div style="height:40px;"></div>';

        const actionLines = (page.abnormalActions||'').split('\n').filter(Boolean);
        const actionHtml = actionLines.map((l,i)=>`<div style="padding:2px 0;">${i+1}. ${_esc(l)}</div>`).join('') ||
            '<div style="height:40px;"></div>';

        const condVisible = key => page.condVisible ? page.condVisible[key] !== false : true;
        const condBlocks = [];
        if (condVisible('condManage'))   condBlocks.push(_condTbl(page.condManage,   '조건관리 표준 (만드는 조건)'));
        if (condVisible('selfInspect'))  condBlocks.push(_condTbl(page.selfInspect,  '자주검사 표준 (만들어진 조건)'));
        if (condVisible('abnormalCond')) condBlocks.push(_condTbl(page.abnormalCond, '소모품 / 치공구 / 교환주기'));
        const condHtml = condBlocks.join('<div style="height:1px;background:#222;"></div>');

        /* ── 개정 내용 (우측 칼럼 하단에 축소 배치) ──────────── */
        const revs = page.revisions || _defRevs();
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

        const revision = `
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;">개 정 내 용</div>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                <colgroup>
                    <col style="width:5%"><col style="width:14%"><col style="width:24%"><col style="width:7%">
                    <col style="width:5%"><col style="width:14%"><col style="width:24%"><col style="width:7%">
                </colgroup>
                <thead><tr>
                    <th style="${HB}">NO</th><th style="${HB}">개정일자</th><th style="${HB}">개정사유</th><th style="${HB}">확인</th>
                    <th style="${HB}border-left:none;">NO</th><th style="${HB}border-left:none;">개정일자</th><th style="${HB}border-left:none;">개정사유</th><th style="${HB}border-left:none;">확인</th>
                </tr></thead>
                <tbody>${revRows}</tbody>
            </table>`;

        const rightCol = `
            ${condHtml}
            ${condHtml ? '<div style="height:1px;background:#222;"></div>' : ''}
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:3px;">안 전 관 리</div>
            <div style="${C}font-size:8.5pt;min-height:38px;padding:4px 6px;">${safetyHtml}</div>
            <div style="height:1px;background:#222;"></div>
            <div style="background:#bdd7ee;${C}text-align:center;font-weight:700;font-size:9pt;letter-spacing:2px;">이상 발생 시 조치사항</div>
            <div style="${C}font-size:8.5pt;min-height:38px;padding:4px 6px;">${actionHtml}</div>
            <div style="height:1px;background:#222;"></div>
            ${revision}`;

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

        const footer = `
        <div style="display:flex;justify-content:space-between;margin-top:4px;
                    font-size:8pt;color:#555;border-top:1px solid #bbb;padding-top:3px;">
            <span>(주)케이씨케미칼</span>
            <span>${pageIdx+1} / ${pageList.length} 페이지</span>
            <span>A3 (420 × 297mm)</span>
        </div>`;

        return header + body + footer;
    }

    /* ════════════════════════════════════════════════════════════
       공개 API
    ════════════════════════════════════════════════════════════ */
    return {
        init, render, search,
        openEditor, save, remove, preview, _doPrint,
        _addStep, _delStep, _addPhoto, _replacePhoto, _removePhoto, _pastePhoto,
        _applyStepLayout,
        _addCondRow, _delCondRow, _addRevRow, _toggleCondSection,
        _startColDrag,
        _switchPage, _addPage, _removePage,
        _openProdStandardsDoc,
    };
})();
