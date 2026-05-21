/**
 * 배합공정 교반시간 작업기준서 모듈
 * 페이지: agit-std
 * DB 스토어: agit_std_data
 */
(function () {
    const STORE = DB.STORES.AGIT_STD_DATA;
    const KEY = 'AGIT_STD';
    const _MAX_HIST = 30;

    let _data = null;
    let _editMode = false;
    let _history = [];
    let _kbListener = null;
    let _container = null;

    // ── 기본 데이터 ─────────────────────────────────────────────────────────
    function _defaultData() {
        const B64 = (window.STD_ASSETS_B64 || {})['agit-std'] || {};
        return {
            id: KEY,
            title: '배합공정 교반시간 작업기준서',
            titleEn: 'Mixing Process Agitation Time Work Standard Document',
            revision: 'Rev.01',
            companyLogo: B64['image2.png'] || 'assets/agit-std/image2.png',
            machinePhoto: B64['image11.png'] || 'assets/agit-std/image11.png',
            history: [
                { no: '1', date: '24.08.30', content: 'SQ인증에 따른 표준류 재정' },
                { no: '2', date: '24.08.30', content: '이물 혼입방지 커버 추가' }
            ],
            mixingTimeRows: [
                {
                    id: 'r1',
                    company: 'ALL',
                    color: 'ALL COLOR',
                    onlyMain: '5분이상\nMore than 5 minutes',
                    withAll: '15분 이상\nMore than 15 minutes',
                    rpm: '300이상\nMore than 300',
                    note: 'ALL'
                },
                {
                    id: 'r2',
                    company: 'ALL',
                    color: 'CLEAR',
                    onlyMain: '필요없음',
                    withAll: '5분 이내\nLower than 5 minutes',
                    rpm: '300이상\nMore than 300',
                    note: '★ 가시시간이 짧아 빠른 교반 진행'
                }
            ],
            mixingSteps: [
                {
                    id: 'step1',
                    no: '1',
                    title: '주제 통 오픈 후 교반',
                    titleEn: 'Mixing after Opening the Base',
                    desc: '도료 안료 희석을 위해 5분 이상 교반 진행',
                    descEn: 'Mix for more than 5 minutes to remove settling in the paint.',
                    photo: B64['image3.png'] || 'assets/agit-std/image3.png'
                },
                {
                    id: 'step2',
                    no: '2',
                    title: '배합 후 교반',
                    titleEn: "Mixing of 'Main + Thinner' or 'Main + Hardener + Thinner'",
                    desc: '『주제 + 희석제』혹은 『주제 + 경화제 + 희석제』배합 후 교반\n교반이 진행시 커버를 씌워 덮어 이물 혼입을 방지한다.',
                    descEn: "Mixing of 'Main + Thinner' or 'Main + Hardener + Thinner'.\nDuring mixing, cover the container with a lid to prevent foreign substances from entering.",
                    photo: B64['image4.png'] || 'assets/agit-std/image4.png'
                },
                {
                    id: 'step3',
                    no: '3',
                    title: 'RPM · 시간 설정',
                    titleEn: 'RPM & Time Setting',
                    desc: 'RPM 조정 : ENT 누른 후 △,▽로 조절 (500~600 RPM 설정)\n시간 조정 : TIME 누른 후 △,▽로 조정 후 TIME 한번 더 눌러 셋팅 (15min 이상 설정)',
                    descEn: 'RPM Setting : Press ENT, then adjust with △,▽ (set 500~600 RPM).\nTime Setting : Press TIME, adjust with △,▽, then press TIME again to set (set 15min+).',
                    photo: B64['image10.png'] || 'assets/agit-std/image10.png'
                },
                {
                    id: 'step4',
                    no: '4',
                    title: '교반 시작',
                    titleEn: 'Start Mixing',
                    desc: 'start를 누르면 타이머가 시작되며, 셋팅된 시간(15min)이 도달하면 교반완료 램프와 벨소리 작동.',
                    descEn: 'When you press start, the timer will start operating and when the set time (15 minutes) is reached, the stirring completion lamp will sound and a bell will sound.',
                    photo: B64['image12.png'] || 'assets/agit-std/image12.png'
                }
            ],
            notes: '점도 재조정에 필요한 주제, 신너 추가 투입시 추가 교반을 실시 한다.\nWhen adding thinner, additional stirring is required for viscosity readjustment.'
        };
    }

    // ── 저장된 파일경로 → base64 마이그레이션 ────────────────────────────────
    function _migrateAssets(d) {
        const B64 = (window.STD_ASSETS_B64 || {})['agit-std'] || {};
        const _b = (val, key) => (val && val.startsWith('assets/') && B64[key]) ? B64[key] : val;
        let dirty = false;
        const _check = (obj, field, key) => { const n = _b(obj[field], key); if (n !== obj[field]) { obj[field] = n; dirty = true; } };
        _check(d, 'companyLogo', 'image2.png');
        _check(d, 'machinePhoto', 'image11.png');
        const stepMap = { step1:'image3.png', step2:'image4.png', step3:'image10.png', step4:'image12.png' };
        (d.mixingSteps || []).forEach(s => { if (stepMap[s.id]) _check(s, 'photo', stepMap[s.id]); });
        return dirty;
    }

    // ── 데이터 로드/저장 ─────────────────────────────────────────────────────
    async function _load() {
        const all = Storage.getAll(STORE) || [];
        _data = all.find(r => r.id === KEY) || _defaultData();
        if (_migrateAssets(_data)) await Storage.put(STORE, _data);
    }

    async function _save() {
        await Storage.put(STORE, _data);
    }

    // ── Undo ─────────────────────────────────────────────────────────────────
    function _pushHistory() {
        _history.push(JSON.parse(JSON.stringify(_data)));
        if (_history.length > _MAX_HIST) _history.shift();
        _updateUndoBtn();
    }

    function _undo() {
        if (!_editMode) return;
        _collectEdits();
        if (!_history.length) { UIUtils.toast('더 이상 되돌릴 내용이 없습니다.', 'info'); return; }
        _data = _history.pop();
        _updateUndoBtn();
        _rerender();
        UIUtils.toast('되돌렸습니다.', 'info');
    }

    function _updateUndoBtn() {
        const btn = document.getElementById('agitUndoBtn');
        if (!btn) return;
        const cnt = _history.length;
        btn.disabled = cnt === 0;
        const badge = btn.querySelector('.agit-undo-cnt');
        if (badge) badge.textContent = cnt > 0 ? `(${cnt})` : '';
    }

    // ── 편집 내용 수집 ────────────────────────────────────────────────────────
    function _collectEdits() {
        if (!_editMode || !_container) return;

        // 제목/서브
        const t = _container.querySelector('#agitTitle');
        if (t) _data.title = t.innerText.trim();
        const te = _container.querySelector('#agitTitleEn');
        if (te) _data.titleEn = te.innerText.trim();
        const rev = _container.querySelector('#agitRevision');
        if (rev) _data.revision = rev.innerText.trim();
        const notes = _container.querySelector('#agitNotes');
        if (notes) _data.notes = notes.innerText.trim();

        // 교반 시간 테이블
        _container.querySelectorAll('.agit-mixing-row').forEach(row => {
            const rid = row.dataset.rid;
            const r = _data.mixingTimeRows.find(x => x.id === rid);
            if (!r) return;
            const cells = row.querySelectorAll('.agit-ce');
            if (cells[0]) r.company = cells[0].innerText.trim();
            if (cells[1]) r.color = cells[1].innerText.trim();
            if (cells[2]) r.onlyMain = cells[2].innerText.trim();
            if (cells[3]) r.withAll = cells[3].innerText.trim();
            if (cells[4]) r.rpm = cells[4].innerText.trim();
            if (cells[5]) r.note = cells[5].innerText.trim();
        });

        // 교반 단계
        _container.querySelectorAll('.agit-step-card').forEach(card => {
            const sid = card.dataset.sid;
            const s = _data.mixingSteps.find(x => x.id === sid);
            if (!s) return;
            const no = card.querySelector('.agit-step-no-ce');
            if (no) s.no = no.innerText.trim();
            const title = card.querySelector('.agit-step-title-ce');
            if (title) s.title = title.innerText.trim();
            const te = card.querySelector('.agit-step-titleen-ce');
            if (te) s.titleEn = te.innerText.trim();
            const desc = card.querySelector('.agit-step-desc-ce');
            if (desc) s.desc = desc.innerText.trim();
            const desce = card.querySelector('.agit-step-descen-ce');
            if (desce) s.descEn = desce.innerText.trim();
        });

        // 개정이력
        _container.querySelectorAll('.agit-hist-row').forEach(row => {
            const idx = parseInt(row.dataset.idx, 10);
            if (isNaN(idx) || !_data.history[idx]) return;
            const cells = row.querySelectorAll('.agit-ce');
            if (cells[0]) _data.history[idx].no = cells[0].innerText.trim();
            if (cells[1]) _data.history[idx].date = cells[1].innerText.trim();
            if (cells[2]) _data.history[idx].content = cells[2].innerText.trim();
        });
    }

    // ── 편집 모드 토글 ────────────────────────────────────────────────────────
    function _toggleEdit() {
        if (!_editMode) {
            _editMode = true;
            _history = [];
            _pushHistory();
            _kbListener = function (e) {
                if (!_editMode) return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    if (document.activeElement && document.activeElement.classList.contains('agit-ce')) return;
                    e.preventDefault();
                    _undo();
                }
            };
            document.addEventListener('keydown', _kbListener);
        } else {
            _collectEdits();
            _editMode = false;
            _history = [];
            if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
            _save();
            UIUtils.toast('저장되었습니다.', 'success');
        }
        _rerender();
    }

    // ── 행/단계 추가/삭제 ─────────────────────────────────────────────────────
    function _addMixingRow() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.mixingTimeRows.push({
            id: 'r' + Date.now(), company: 'ALL', color: '신규 색상',
            onlyMain: '-', withAll: '-', rpm: '300이상', note: ''
        });
        _rerender();
    }

    function _delMixingRow(rid) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.mixingTimeRows.length <= 1) { UIUtils.toast('마지막 행은 삭제할 수 없습니다.', 'warning'); return; }
        _data.mixingTimeRows = _data.mixingTimeRows.filter(r => r.id !== rid);
        _rerender();
    }

    function _addStep() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.mixingSteps.push({
            id: 'step' + Date.now(),
            no: String(_data.mixingSteps.length + 1),
            title: '새 단계', titleEn: 'New Step',
            desc: '내용 입력', descEn: 'Enter description',
            photo: null
        });
        _rerender();
    }

    function _delStep(sid) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.mixingSteps.length <= 1) { UIUtils.toast('마지막 단계는 삭제할 수 없습니다.', 'warning'); return; }
        _data.mixingSteps = _data.mixingSteps.filter(s => s.id !== sid);
        _rerender();
    }

    function _addHistRow() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.history.push({ no: String(_data.history.length + 1), date: '', content: '' });
        _rerender();
    }

    function _delHistRow(idx) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.history.length <= 1) return;
        _data.history.splice(idx, 1);
        _rerender();
    }

    // ── 사진 업로드/삭제 ─────────────────────────────────────────────────────
    function _uploadStepPhoto(sid) {
        if (!_editMode) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = function () {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) {
                _collectEdits(); _pushHistory();
                const s = _data.mixingSteps.find(x => x.id === sid);
                if (s) s.photo = ev.target.result;
                _rerender();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function _removeStepPhoto(sid) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        const s = _data.mixingSteps.find(x => x.id === sid);
        if (s) s.photo = null;
        _rerender();
    }

    function _uploadMachinePhoto() {
        if (!_editMode) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = function () {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) {
                _collectEdits(); _pushHistory();
                _data.machinePhoto = ev.target.result;
                _rerender();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function _removeMachinePhoto() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.machinePhoto = null;
        _rerender();
    }

    // ── 렌더링 ────────────────────────────────────────────────────────────────
    function _rerender() {
        if (!_container) return;
        _container.innerHTML = _buildHTML();
        _updateUndoBtn();
    }

    function _buildHTML() {
        const d = _data;
        const ce = _editMode;
        const CA = '#d97706'; // amber accent

        // ── 교반 시간 테이블 ─────────────────────────────────────────────
        const mixingRowsHTML = d.mixingTimeRows.map(r => `
        <tr class="agit-mixing-row" data-rid="${r.id}">
            <td><span class="agit-ce" contenteditable="${ce}" style="white-space:pre-line;">${r.company}</span></td>
            <td><span class="agit-ce agit-color-cell" contenteditable="${ce}">${r.color}</span></td>
            <td><span class="agit-ce" contenteditable="${ce}" style="white-space:pre-line;">${r.onlyMain}</span></td>
            <td><span class="agit-ce" contenteditable="${ce}" style="white-space:pre-line;">${r.withAll}</span></td>
            <td><span class="agit-ce" contenteditable="${ce}" style="white-space:pre-line;">${r.rpm}</span></td>
            <td><span class="agit-ce agit-note-cell" contenteditable="${ce}" style="white-space:pre-line;">${r.note}</span>
                ${ce ? `<button class="agit-del-row-btn" onclick="AgitStdModule._delMixingRow('${r.id}')"><span class="material-symbols-outlined">remove</span></button>` : ''}
            </td>
        </tr>`).join('');

        // ── 교반 단계 카드 ───────────────────────────────────────────────
        const stepsHTML = d.mixingSteps.map((s, idx) => `
        <div class="agit-step-card" data-sid="${s.id}">
            ${ce ? `<button class="agit-del-step-btn" onclick="AgitStdModule._delStep('${s.id}')" title="단계 삭제"><span class="material-symbols-outlined">delete</span></button>` : ''}
            <div class="agit-step-num">
                <span class="agit-ce agit-step-no-ce" contenteditable="${ce}">${s.no}</span>
            </div>
            <div class="agit-step-body">
                <div class="agit-step-title-row">
                    <span class="agit-ce agit-step-title-ce" contenteditable="${ce}">${s.title}</span>
                    <span class="agit-ce agit-step-titleen-ce" contenteditable="${ce}">${s.titleEn}</span>
                </div>
                <div class="agit-step-photo-area">
                    ${_stepPhotoHTML(s)}
                </div>
                <div class="agit-step-desc-block">
                    <div class="agit-ce agit-step-desc-ce" contenteditable="${ce}" style="white-space:pre-line;">${s.desc}</div>
                    <div class="agit-ce agit-step-descen-ce agit-en-text" contenteditable="${ce}" style="white-space:pre-line;">${s.descEn}</div>
                </div>
            </div>
        </div>`).join('');

        // ── 개정이력 ─────────────────────────────────────────────────────
        const histRows = d.history.map((h, idx) => `
        <tr class="agit-hist-row" data-idx="${idx}">
            <td><span class="agit-ce" contenteditable="${ce}">${h.no}</span></td>
            <td><span class="agit-ce" contenteditable="${ce}">${h.date}</span></td>
            <td><span class="agit-ce" contenteditable="${ce}">${h.content}</span></td>
            ${ce ? `<td><button class="agit-del-row-btn" onclick="AgitStdModule._delHistRow(${idx})"><span class="material-symbols-outlined">remove</span></button></td>` : ''}
        </tr>`).join('');

        return `
        <div class="agit-root fade-in-up">

            <!-- 툴바 -->
            <div class="agit-toolbar">
                <div class="agit-toolbar-left">
                    <span class="material-symbols-outlined" style="color:${CA};font-size:22px;">blender</span>
                    <span style="font-weight:700;color:var(--text-primary);">교반시간 작업기준서</span>
                </div>
                <div class="agit-toolbar-right">
                    <button class="btn btn-outline agit-undo-btn" id="agitUndoBtn"
                        style="display:${ce ? '' : 'none'};" disabled
                        onclick="AgitStdModule._undo()" title="되돌리기 (Ctrl+Z)">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">undo</span>
                        되돌리기 <span class="agit-undo-cnt"></span>
                    </button>
                    <button class="btn ${ce ? 'btn-success' : 'btn-outline'}"
                        onclick="AgitStdModule._toggleEdit()">
                        <span class="material-symbols-outlined">${ce ? 'save' : 'edit'}</span>
                        ${ce ? '저장' : '편집'}
                    </button>
                </div>
            </div>

            <!-- 문서 헤더 -->
            <div class="agit-doc-header">
                <div class="agit-logo-block">
                    ${d.companyLogo
                        ? `<img src="${d.companyLogo}" alt="logo" class="agit-logo-img">`
                        : `<div class="agit-logo-placeholder">LOGO</div>`}
                </div>
                <div class="agit-title-block">
                    <div class="agit-ce agit-main-title" id="agitTitle" contenteditable="${ce}">${d.title}</div>
                    <div class="agit-ce agit-en-title" id="agitTitleEn" contenteditable="${ce}">${d.titleEn}</div>
                    <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">
                        <span class="agit-ce" id="agitRevision" contenteditable="${ce}">${d.revision}</span>
                    </div>
                </div>
                <div class="agit-machine-block">
                    ${_machinePhotoHTML()}
                </div>
            </div>

            <!-- 교반 시간 섹션 -->
            <div class="agit-section-card">
                <div class="agit-section-title" style="color:${CA};">
                    <span class="material-symbols-outlined">timer</span>
                    ■ 교반 시간 &nbsp;<span class="agit-en-inline">Mixing Time</span>
                </div>
                <div class="agit-tbl-wrap">
                    <table class="agit-mixing-tbl">
                        <thead>
                            <tr>
                                <th rowspan="2">도료사<br><span class="agit-en-th">Paint Company</span></th>
                                <th rowspan="2">색상<br><span class="agit-en-th">Color</span></th>
                                <th colspan="2">교반 시간 / Mixing Time</th>
                                <th rowspan="2">RPM</th>
                                <th rowspan="2">특기 사항<br><span class="agit-en-th">Special Notes</span></th>
                            </tr>
                            <tr>
                                <th style="font-size:.72rem;">Only 주제 &amp; 점도 조정 후<br><span class="agit-en-th">Only Main Paint &amp; Viscosity Adjustment</span></th>
                                <th style="font-size:.72rem;">주제 + 신너 + 경화제<br><span class="agit-en-th">Main Paint + Thinner + Hardener</span></th>
                            </tr>
                        </thead>
                        <tbody>${mixingRowsHTML}</tbody>
                    </table>
                </div>
                ${ce ? `
                <div style="margin-top:8px;">
                    <button class="agit-add-row-btn" onclick="AgitStdModule._addMixingRow()">
                        <span class="material-symbols-outlined">add</span> 행 추가
                    </button>
                </div>` : ''}
            </div>

            <!-- 교반 순서 및 방법 섹션 -->
            <div class="agit-section-card">
                <div class="agit-section-title" style="color:${CA};">
                    <span class="material-symbols-outlined">format_list_numbered</span>
                    ■ 교반 순서 및 방법 &nbsp;<span class="agit-en-inline">Mixing Sequence and Method</span>
                    ${ce ? `
                    <button class="agit-add-row-btn" onclick="AgitStdModule._addStep()" style="margin-left:auto;">
                        <span class="material-symbols-outlined">add</span> 단계 추가
                    </button>` : ''}
                </div>
                <div class="agit-steps-wrap">
                    ${stepsHTML}
                </div>
            </div>

            <!-- 특기 사항 -->
            <div class="agit-section-card">
                <div class="agit-section-title" style="color:${CA};">
                    <span class="material-symbols-outlined">stars</span>
                    특기 사항 &nbsp;<span class="agit-en-inline">Special Notes</span>
                </div>
                <div class="agit-ce agit-notes" id="agitNotes"
                    contenteditable="${ce}" style="white-space:pre-line;">${d.notes}</div>
            </div>

            <!-- 개정이력 -->
            <div class="agit-section-card">
                <div class="agit-section-title" style="color:${CA};">
                    <span class="material-symbols-outlined">history</span>
                    개정이력
                    ${ce ? `<button class="agit-add-row-btn" onclick="AgitStdModule._addHistRow()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 행 추가</button>` : ''}
                </div>
                <table class="agit-hist-tbl">
                    <thead>
                        <tr>
                            <th style="width:50px;">No</th>
                            <th style="width:110px;">개정일자</th>
                            <th>개정내용</th>
                            ${ce ? '<th style="width:40px;"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${histRows}</tbody>
                </table>
            </div>
        </div>

        <style>
        .agit-root { padding:16px; max-width:1100px; margin:0 auto; }

        /* 툴바 */
        .agit-toolbar {
            display:flex; align-items:center; justify-content:space-between;
            gap:10px; flex-wrap:wrap; margin-bottom:16px;
        }
        .agit-toolbar-left { display:flex; align-items:center; gap:8px; }
        .agit-toolbar-right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .agit-undo-btn:disabled { opacity:.38; cursor:not-allowed; }
        .agit-undo-btn:not(:disabled) { border-color:#f59e0b; color:#b45309; }
        .agit-undo-btn:not(:disabled):hover { background:#fef3c7; }
        .agit-undo-cnt { font-size:.7rem; color:#9ca3af; font-weight:400; min-width:1em; display:inline-block; }

        /* 문서 헤더 */
        .agit-doc-header {
            display:grid; grid-template-columns:140px 1fr 200px;
            gap:16px; align-items:center;
            background:var(--bg-primary); border-radius:12px;
            border:1px solid var(--border-color); padding:18px 20px;
            margin-bottom:14px;
        }
        .agit-logo-img { max-width:130px; max-height:70px; object-fit:contain; }
        .agit-logo-placeholder { width:110px; height:60px; background:var(--bg-secondary); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:.75rem; }
        .agit-main-title { font-size:1.25rem; font-weight:800; color:#0f172a; }
        .agit-en-title { font-size:.82rem; color:var(--text-muted); margin-top:3px; }

        /* 기계 사진 */
        .agit-machine-block { display:flex; flex-direction:column; align-items:center; gap:4px; }
        .agit-machine-photo-box {
            width:100%; max-height:120px; overflow:hidden;
            border-radius:8px; border:1px solid var(--border-color);
            display:flex; align-items:center; justify-content:center;
            background:var(--bg-secondary); position:relative;
        }
        .agit-machine-photo-box img { width:100%; max-height:120px; object-fit:cover; }
        .agit-photo-overlay {
            display:none; position:absolute; inset:0;
            background:rgba(0,0,0,.45); align-items:center; justify-content:center;
            gap:6px; border-radius:7px;
        }
        .agit-machine-photo-box:hover .agit-photo-overlay { display:flex; }
        .agit-photo-overlay button {
            background:none; border:none; cursor:pointer; color:#fff; padding:4px; border-radius:4px;
        }
        .agit-photo-overlay button:hover { background:rgba(255,255,255,.2); }
        .agit-photo-upload-btn {
            display:flex; flex-direction:column; align-items:center; gap:3px;
            cursor:pointer; color:var(--text-muted); padding:10px;
            font-size:.72rem; width:100%; background:none; border:none;
        }
        .agit-photo-upload-btn:hover { color:#d97706; }
        .agit-photo-upload-btn .material-symbols-outlined { font-size:22px; }

        /* 섹션 카드 */
        .agit-section-card {
            background:var(--bg-primary); border-radius:12px;
            border:1px solid var(--border-color); padding:16px 18px; margin-bottom:14px;
        }
        .agit-section-title {
            display:flex; align-items:center; gap:6px;
            font-size:.92rem; font-weight:700;
            margin-bottom:14px;
        }
        .agit-section-title .material-symbols-outlined { font-size:18px; }
        .agit-en-inline { font-size:.78rem; color:var(--text-muted); font-weight:400; }

        /* 교반 시간 테이블 */
        .agit-tbl-wrap { overflow-x:auto; }
        .agit-mixing-tbl { width:100%; border-collapse:collapse; font-size:.82rem; min-width:600px; }
        .agit-mixing-tbl th, .agit-mixing-tbl td { padding:8px 10px; border:1px solid var(--border-color); text-align:center; vertical-align:middle; }
        .agit-mixing-tbl th { background:var(--bg-secondary); font-weight:700; color:var(--text-muted); font-size:.75rem; }
        .agit-en-th { font-weight:400; font-size:.68rem; color:#9ca3af; }
        .agit-color-cell { font-weight:700; color:#0f172a; }
        .agit-note-cell { font-size:.78rem; color:#d97706; font-weight:600; }

        /* 교반 단계 */
        .agit-steps-wrap { display:flex; flex-direction:column; gap:12px; }
        .agit-step-card {
            position:relative; display:grid;
            grid-template-columns:52px 1fr;
            gap:12px; align-items:flex-start;
            background:var(--bg-secondary); border-radius:10px;
            border:1px solid var(--border-color);
            border-left:4px solid #d97706; padding:14px 14px 14px 12px;
        }
        .agit-del-step-btn {
            position:absolute; top:8px; right:8px;
            background:none; border:none; cursor:pointer;
            color:#ef4444; opacity:.55; padding:2px; border-radius:4px;
        }
        .agit-del-step-btn:hover { opacity:1; background:#fee2e2; }
        .agit-del-step-btn .material-symbols-outlined { font-size:18px; }

        .agit-step-num {
            display:flex; align-items:flex-start; justify-content:center;
            padding-top:4px;
        }
        .agit-step-no-ce {
            width:36px; height:36px; border-radius:50%;
            background:#d97706; color:#fff;
            display:flex; align-items:center; justify-content:center;
            font-size:1rem; font-weight:800;
            text-align:center; line-height:36px;
        }
        .agit-step-body { display:flex; flex-direction:column; gap:8px; }
        .agit-step-title-row { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
        .agit-step-title-ce { font-size:.95rem; font-weight:700; color:var(--text-primary); }
        .agit-step-titleen-ce { font-size:.75rem; color:var(--text-muted); }

        .agit-step-photo-area { display:flex; align-items:center; gap:8px; }
        .agit-step-photo-box {
            width:160px; min-height:90px; max-height:130px;
            border-radius:7px; border:1px solid var(--border-color);
            overflow:hidden; flex-shrink:0; background:var(--bg-primary);
            display:flex; align-items:center; justify-content:center;
            position:relative;
        }
        .agit-step-photo-box img { width:100%; max-height:130px; object-fit:cover; }
        .agit-step-photo-box:hover .agit-photo-overlay { display:flex; }

        .agit-step-desc-block { display:flex; flex-direction:column; gap:4px; }
        .agit-step-desc-ce { font-size:.85rem; color:var(--text-secondary); line-height:1.6; }
        .agit-en-text { font-size:.75rem; color:var(--text-muted); }

        /* 특기 사항 */
        .agit-notes { font-size:.85rem; color:var(--text-secondary); line-height:1.7; background:var(--bg-secondary); border-radius:7px; padding:10px 12px; }

        /* 개정이력 */
        .agit-hist-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .agit-hist-tbl th, .agit-hist-tbl td { padding:7px 10px; border:1px solid var(--border-color); text-align:left; }
        .agit-hist-tbl th { background:var(--bg-secondary); font-weight:700; color:var(--text-muted); }

        /* 공통 버튼 */
        .agit-add-row-btn {
            display:inline-flex; align-items:center; gap:3px;
            font-size:.75rem; padding:3px 9px; border-radius:5px;
            background:none; border:1px solid #d97706; color:#d97706; cursor:pointer;
        }
        .agit-add-row-btn:hover { background:#fef3c7; }
        .agit-add-row-btn .material-symbols-outlined { font-size:14px; }
        .agit-del-row-btn {
            background:none; border:none; cursor:pointer; color:#ef4444;
            padding:2px; border-radius:3px; opacity:.6; margin-left:4px;
        }
        .agit-del-row-btn:hover { opacity:1; background:#fee2e2; }
        .agit-del-row-btn .material-symbols-outlined { font-size:16px; vertical-align:middle; }

        /* contenteditable */
        .agit-ce[contenteditable="true"] {
            outline:none; border-bottom:1.5px dashed #d97706;
            padding-bottom:1px; cursor:text; border-radius:2px;
            display:inline-block; min-width:20px;
        }
        .agit-ce[contenteditable="true"]:focus {
            background:#fef3c7; border-bottom-color:#d97706; border-radius:2px;
        }
        .agit-step-desc-ce[contenteditable="true"],
        .agit-step-descen-ce[contenteditable="true"],
        .agit-notes[contenteditable="true"],
        .agit-mixing-row .agit-ce[contenteditable="true"] {
            display:block; border:1.5px dashed #d97706; padding:4px 6px;
            border-radius:4px; background:transparent; min-height:22px;
        }
        .agit-step-desc-ce[contenteditable="true"]:focus,
        .agit-step-descen-ce[contenteditable="true"]:focus,
        .agit-notes[contenteditable="true"]:focus { background:#fef3c7; }
        .agit-step-no-ce[contenteditable="true"] {
            border:2px dashed #fff; background:#b45309 !important; outline:none;
        }

        @media (max-width:700px) {
            .agit-doc-header { grid-template-columns:1fr; }
            .agit-machine-block { width:100%; }
            .agit-step-card { grid-template-columns:1fr; }
            .agit-step-num { display:none; }
        }
        </style>`;
    }

    // ── 사진 HTML 헬퍼 ────────────────────────────────────────────────────────
    function _stepPhotoHTML(s) {
        const ce = _editMode;
        if (s.photo) {
            return `<div class="agit-step-photo-box">
                <img src="${s.photo}" alt="step">
                ${ce ? `<div class="agit-photo-overlay">
                    <button onclick="AgitStdModule._uploadStepPhoto('${s.id}')" title="교체"><span class="material-symbols-outlined" style="font-size:20px;">upload</span></button>
                    <button onclick="AgitStdModule._removeStepPhoto('${s.id}')" title="삭제"><span class="material-symbols-outlined" style="font-size:20px;">delete</span></button>
                </div>` : ''}
            </div>`;
        } else if (ce) {
            return `<div class="agit-step-photo-box">
                <button class="agit-photo-upload-btn" onclick="AgitStdModule._uploadStepPhoto('${s.id}')">
                    <span class="material-symbols-outlined">add_photo_alternate</span>사진 추가
                </button>
            </div>`;
        }
        return '';
    }

    function _machinePhotoHTML() {
        const ce = _editMode;
        const d = _data;
        if (d.machinePhoto) {
            return `<div class="agit-machine-photo-box">
                <img src="${d.machinePhoto}" alt="machine">
                ${ce ? `<div class="agit-photo-overlay">
                    <button onclick="AgitStdModule._uploadMachinePhoto()" title="교체"><span class="material-symbols-outlined" style="font-size:20px;">upload</span></button>
                    <button onclick="AgitStdModule._removeMachinePhoto()" title="삭제"><span class="material-symbols-outlined" style="font-size:20px;">delete</span></button>
                </div>` : ''}
            </div>
            <div style="font-size:.68rem;color:var(--text-muted);text-align:center;margin-top:3px;">교반기</div>`;
        } else if (ce) {
            return `<div class="agit-machine-photo-box">
                <button class="agit-photo-upload-btn" onclick="AgitStdModule._uploadMachinePhoto()">
                    <span class="material-symbols-outlined">add_photo_alternate</span>사진 추가
                </button>
            </div>`;
        }
        return '';
    }

    // ── 퍼블릭 render ─────────────────────────────────────────────────────────
    async function render(container) {
        _container = container;
        _editMode = false;
        _history = [];
        if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
        await _load();
        _rerender();
    }

    const AgitStdModule = {
        render,
        _toggleEdit,
        _undo,
        _addMixingRow,
        _delMixingRow,
        _addStep,
        _delStep,
        _addHistRow,
        _delHistRow,
        _uploadStepPhoto,
        _removeStepPhoto,
        _uploadMachinePhoto,
        _removeMachinePhoto
    };

    window.AgitStdModule = AgitStdModule;
})();
