/**
 * 잔여 도료 포장 방법 작업기준서 모듈
 * 페이지: remain-paint
 * DB 스토어: remain_paint_data
 */
(function () {
    const STORE = DB.STORES.REMAIN_PAINT_DATA;
    const KEY   = 'REMAIN_PAINT_STD';
    const MAX_H = 30;
    const AC    = '#7c3aed'; // violet accent

    let _data       = null;
    let _editMode   = false;
    let _history    = [];
    let _kbListener = null;
    let _container  = null;

    // ── 기본 데이터 ──────────────────────────────────────────────────────────
    function _defaultData() {
        const B64 = (window.STD_ASSETS_B64 || {})['remain-paint'] || {};
        return {
            id: KEY,
            title: '잔여 도료 포장 방법 작업기준서',
            titleEn: 'Remaining Paint Packaging Method Work Standard',
            revision: 'Rev.01',
            companyLogo: B64['image2.png'] || 'assets/remain-paint/image2.png',
            history: [
                { no: '1', date: '',        content: '최초작성' },
                { no: '2', date: '25.01.23', content: '도료 잔량표 양식 개정' }
            ],
            purpose: '개봉후 잔여량이 남은 도료캔 포장으로 이물의 유입이나 용재 휘발을 방지하여 도료 물성 상태를 유지 하기 위함.',
            purposeEn: "The purpose is to maintain the paint's properties by preventing foreign material ingress or solvent evaporation through the packaging of paint cans with remaining quantities after opening.",
            // ■ 잔량 도료 표기 — 라벨 작성 단계
            labelExamplePhoto: B64['image3.png'] || 'assets/remain-paint/image3.png',
            labelSteps: [
                { id: 'ls1', text: '도료사 선택 표시 (✔)',    textEn: 'Selecting the paint type (✔)' },
                { id: 'ls2', text: '도료 COLOR 입력',          textEn: 'Inputting Paint COLOR' },
                { id: 'ls3', text: '잔량 분류에 맞게 해당란에 날짜 및 시간 기입', textEn: 'Enter the date and time in the corresponding field according to the remaining quantity classification.' },
                { id: 'ls4', text: '사용기한 필히 확인 후 기입', textEn: 'Mandatory verification of the expiration date' }
            ],
            // □ 사용기한 작성 방법
            expiryRule: {
                validPeriod: '제조유효기간 12개월',
                openLabel: 'Open',
                cases: [
                    {
                        id: 'ec1',
                        no: '1)',
                        title: '개봉 후 6개월이 사용기간',
                        example: '개봉일이 25년 4월 1일이면 → 사용기한: 25년 10월 1일',
                        note: '( 개봉 후 11개월의 유효기간이 남아있지만 6개월로 사용기한 )'
                    },
                    {
                        id: 'ec2',
                        no: '2)',
                        title: '제조유효기간 기록',
                        example: '개봉일이 25년 12월 1일이면 → 사용기한: 26년 3월 1일',
                        note: '( 개봉 전 3개월의 유효기간이므로 유효기간을 사용기한 )'
                    }
                ]
            },
            // ■ 포장 방법
            packagingNote: '■ 잔여 도료통 랩핑 후 노란 커버 사용\nWrap the remaining paint cans and use a yellow cover.',
            packagingSteps: [
                {
                    id: 'ps1', no: '①',
                    title: '공기 차단 랩핑',
                    titleEn: 'Air-tight wrapping',
                    photo: B64['image10.png'] || 'assets/remain-paint/image10.png'
                },
                {
                    id: 'ps2', no: '②',
                    title: '노란 커버로 막음',
                    titleEn: 'Sealed with a yellow cover',
                    photo: B64['image8.png'] || 'assets/remain-paint/image8.png'
                },
                {
                    id: 'ps3', no: '③',
                    title: '포장 완료',
                    titleEn: 'Packaging complete',
                    photo: B64['image9.png'] || 'assets/remain-paint/image9.png'
                }
            ],
            // 특기 사항
            notes: [
                { id: 'n1', text: '1. 유효기간내여도 겔화(GEL) 된 도료는 사용을 금지한다.\n   Paint that has gelled (GEL), even within the valid period, is prohibited from use.' },
                { id: 'n2', text: '2. 유효기간내여도 굳어(경화)있는 도료는 사용을 금지한다.\n   Paint that has hardened (cured), even within the valid period, is prohibited from use.' }
            ],
            // 잔량표 양식 (Sheet2)
            labelForm: {
                paintCompanies: 'NOROO / KCC / 도로명\nPPG / REDSPOT',
                openPeriod: '개봉 후 유효기한 : 6 개 월',
                expiryNote: '사용기한: 년   월   일\n(단, 유통기한이 6개월 이내일 시 도료 유효기간 기록)',
                complianceNote: '램핑·커버 준수'
            }
        };
    }

    // ── 저장된 파일경로 → base64 마이그레이션 ────────────────────────────────
    function _migrateAssets(d) {
        const B64 = (window.STD_ASSETS_B64 || {})['remain-paint'] || {};
        const _b = (val, key) => (val && val.startsWith('assets/') && B64[key]) ? B64[key] : val;
        let dirty = false;
        const _check = (obj, field, key) => { const n = _b(obj[field], key); if (n !== obj[field]) { obj[field] = n; dirty = true; } };
        _check(d, 'companyLogo', 'image2.png');
        _check(d, 'labelExamplePhoto', 'image3.png');
        const stepMap = { ps1:'image10.png', ps2:'image8.png', ps3:'image9.png' };
        (d.packagingSteps || []).forEach(s => { if (stepMap[s.id]) _check(s, 'photo', stepMap[s.id]); });
        return dirty;
    }

    // ── 로드/저장 ─────────────────────────────────────────────────────────────
    async function _load() {
        const all = Storage.getAll(STORE) || [];
        _data = all.find(r => r.id === KEY) || _defaultData();
        if (_migrateAssets(_data)) await Storage.put(STORE, _data);
    }
    async function _save() { await Storage.put(STORE, _data); }

    // ── Undo ─────────────────────────────────────────────────────────────────
    function _pushHistory() {
        _history.push(JSON.parse(JSON.stringify(_data)));
        if (_history.length > MAX_H) _history.shift();
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
        const btn = document.getElementById('rpUndoBtn');
        if (!btn) return;
        btn.disabled = !_history.length;
        const badge = btn.querySelector('.rp-undo-cnt');
        if (badge) badge.textContent = _history.length > 0 ? `(${_history.length})` : '';
    }

    // ── 편집 내용 수집 ────────────────────────────────────────────────────────
    function _collectEdits() {
        if (!_editMode || !_container) return;
        const get = id => { const el = _container.querySelector(`#${id}`); return el ? el.innerText.trim() : null; };

        if (get('rpTitle')) _data.title = get('rpTitle');
        if (get('rpTitleEn')) _data.titleEn = get('rpTitleEn');
        if (get('rpRevision')) _data.revision = get('rpRevision');
        if (get('rpPurpose')) _data.purpose = get('rpPurpose');
        if (get('rpPurposeEn')) _data.purposeEn = get('rpPurposeEn');
        if (get('rpPackagingNote')) _data.packagingNote = get('rpPackagingNote');

        // 라벨 작성 단계
        _container.querySelectorAll('.rp-ls-row').forEach(row => {
            const id = row.dataset.id;
            const s = _data.labelSteps.find(x => x.id === id);
            if (!s) return;
            const t = row.querySelector('.rp-ls-text'); if (t) s.text = t.innerText.trim();
            const e = row.querySelector('.rp-ls-texten'); if (e) s.textEn = e.innerText.trim();
        });

        // 사용기한 케이스
        _container.querySelectorAll('.rp-ec-row').forEach(row => {
            const id = row.dataset.id;
            const c = _data.expiryRule.cases.find(x => x.id === id);
            if (!c) return;
            const no = row.querySelector('.rp-ec-no'); if (no) c.no = no.innerText.trim();
            const ti = row.querySelector('.rp-ec-title'); if (ti) c.title = ti.innerText.trim();
            const ex = row.querySelector('.rp-ec-example'); if (ex) c.example = ex.innerText.trim();
            const nt = row.querySelector('.rp-ec-note'); if (nt) c.note = nt.innerText.trim();
        });
        const vp = _container.querySelector('#rpValidPeriod'); if (vp) _data.expiryRule.validPeriod = vp.innerText.trim();

        // 포장 단계
        _container.querySelectorAll('.rp-ps-card').forEach(card => {
            const id = card.dataset.id;
            const s = _data.packagingSteps.find(x => x.id === id);
            if (!s) return;
            const no = card.querySelector('.rp-ps-no'); if (no) s.no = no.innerText.trim();
            const ti = card.querySelector('.rp-ps-title'); if (ti) s.title = ti.innerText.trim();
            const te = card.querySelector('.rp-ps-titleen'); if (te) s.titleEn = te.innerText.trim();
        });

        // 특기 사항
        _container.querySelectorAll('.rp-note-row').forEach(row => {
            const id = row.dataset.id;
            const n = _data.notes.find(x => x.id === id);
            if (!n) return;
            const t = row.querySelector('.rp-note-text'); if (t) n.text = t.innerText.trim();
        });

        // 개정이력
        _container.querySelectorAll('.rp-hist-row').forEach(row => {
            const idx = parseInt(row.dataset.idx, 10);
            if (isNaN(idx) || !_data.history[idx]) return;
            const cells = row.querySelectorAll('.rp-ce');
            if (cells[0]) _data.history[idx].no = cells[0].innerText.trim();
            if (cells[1]) _data.history[idx].date = cells[1].innerText.trim();
            if (cells[2]) _data.history[idx].content = cells[2].innerText.trim();
        });

        // 잔량표 양식
        const lf = _data.labelForm;
        const pc = _container.querySelector('#rpLfPaintCompanies'); if (pc) lf.paintCompanies = pc.innerText.trim();
        const op = _container.querySelector('#rpLfOpenPeriod'); if (op) lf.openPeriod = op.innerText.trim();
        const en = _container.querySelector('#rpLfExpiryNote'); if (en) lf.expiryNote = en.innerText.trim();
        const cn = _container.querySelector('#rpLfComplianceNote'); if (cn) lf.complianceNote = cn.innerText.trim();
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
                    if (document.activeElement && document.activeElement.classList.contains('rp-ce')) return;
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

    // ── 항목 추가/삭제 ────────────────────────────────────────────────────────
    function _addLabelStep() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.labelSteps.push({ id: 'ls' + Date.now(), text: '새 항목', textEn: 'New item' });
        _rerender();
    }
    function _delLabelStep(id) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.labelSteps.length <= 1) return;
        _data.labelSteps = _data.labelSteps.filter(s => s.id !== id);
        _rerender();
    }
    function _addExpiryCase() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.expiryRule.cases.push({ id: 'ec' + Date.now(), no: String(_data.expiryRule.cases.length + 1) + ')', title: '새 케이스', example: '예시', note: '' });
        _rerender();
    }
    function _delExpiryCase(id) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.expiryRule.cases.length <= 1) return;
        _data.expiryRule.cases = _data.expiryRule.cases.filter(c => c.id !== id);
        _rerender();
    }
    function _addPackagingStep() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.packagingSteps.push({ id: 'ps' + Date.now(), no: '④', title: '새 단계', titleEn: 'New step', photo: null });
        _rerender();
    }
    function _delPackagingStep(id) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.packagingSteps.length <= 1) return;
        _data.packagingSteps = _data.packagingSteps.filter(s => s.id !== id);
        _rerender();
    }
    function _addNote() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.notes.push({ id: 'n' + Date.now(), text: '새 특기 사항' });
        _rerender();
    }
    function _delNote(id) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.notes.length <= 1) return;
        _data.notes = _data.notes.filter(n => n.id !== id);
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

    // ── 사진 업로드 ──────────────────────────────────────────────────────────
    function _uploadPhoto(field, stepId) {
        if (!_editMode) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = function () {
            const file = input.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) {
                _collectEdits(); _pushHistory();
                if (field === 'labelExample') {
                    _data.labelExamplePhoto = ev.target.result;
                } else if (field === 'packagingStep') {
                    const s = _data.packagingSteps.find(x => x.id === stepId);
                    if (s) s.photo = ev.target.result;
                }
                _rerender();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }
    function _removePhoto(field, stepId) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (field === 'labelExample') _data.labelExamplePhoto = null;
        else if (field === 'packagingStep') {
            const s = _data.packagingSteps.find(x => x.id === stepId);
            if (s) s.photo = null;
        }
        _rerender();
    }

    // ── 렌더링 ────────────────────────────────────────────────────────────────
    function _rerender() {
        if (!_container) return;
        _container.innerHTML = _buildHTML();
        _updateUndoBtn();
    }

    // ── 공통 inline contenteditable ──────────────────────────────────────────
    function _ce(text, id, style) {
        const ce = _editMode;
        return `<span class="rp-ce" id="${id}" contenteditable="${ce}" ${style ? `style="${style}"` : ''}>${text}</span>`;
    }
    function _ceBlock(text, id, style) {
        const ce = _editMode;
        return `<div class="rp-ce rp-ce-block" id="${id}" contenteditable="${ce}" style="white-space:pre-line;${style ? style : ''}">${text}</div>`;
    }

    // ── 사진 박스 공통 ────────────────────────────────────────────────────────
    function _photoBox(src, field, stepId, cls) {
        const ce = _editMode;
        const call = stepId ? `'${field}','${stepId}'` : `'${field}'`;
        if (src) {
            return `<div class="rp-photo-box ${cls || ''}">
                <img src="${src}" alt="photo">
                ${ce ? `<div class="rp-photo-overlay">
                    <button onclick="RemainPaintModule._uploadPhoto(${call})" title="교체"><span class="material-symbols-outlined">upload</span></button>
                    <button onclick="RemainPaintModule._removePhoto(${call})" title="삭제"><span class="material-symbols-outlined">delete</span></button>
                </div>` : ''}
            </div>`;
        } else if (ce) {
            return `<div class="rp-photo-box ${cls || ''}">
                <button class="rp-upload-btn" onclick="RemainPaintModule._uploadPhoto(${call})">
                    <span class="material-symbols-outlined">add_photo_alternate</span>사진 추가
                </button>
            </div>`;
        }
        return '';
    }

    function _buildHTML() {
        const d = _data;
        const ce = _editMode;

        // ── 라벨 단계 ──────────────────────────────────────────────────────
        const labelStepsHTML = d.labelSteps.map((s, i) => `
        <div class="rp-ls-row" data-id="${s.id}">
            <div class="rp-ls-num">${i + 1}</div>
            <div class="rp-ls-content">
                <span class="rp-ce rp-ls-text" contenteditable="${ce}">${s.text}</span>
                <span class="rp-ce rp-ls-texten rp-en" contenteditable="${ce}">${s.textEn}</span>
            </div>
            ${ce ? `<button class="rp-icon-btn rp-del" onclick="RemainPaintModule._delLabelStep('${s.id}')"><span class="material-symbols-outlined">remove_circle</span></button>` : ''}
        </div>`).join('');

        // ── 사용기한 케이스 ────────────────────────────────────────────────
        const expiryCasesHTML = d.expiryRule.cases.map(c => `
        <div class="rp-ec-row" data-id="${c.id}">
            <div class="rp-ec-badge">
                <span class="rp-ce rp-ec-no" contenteditable="${ce}">${c.no}</span>
            </div>
            <div class="rp-ec-body">
                <div class="rp-ec-title-row">
                    <span class="rp-ce rp-ec-title" contenteditable="${ce}">${c.title}</span>
                </div>
                <div class="rp-ce rp-ec-example" contenteditable="${ce}" style="white-space:pre-line;">${c.example}</div>
                <div class="rp-ce rp-ec-note rp-en" contenteditable="${ce}" style="white-space:pre-line;">${c.note}</div>
            </div>
            ${ce ? `<button class="rp-icon-btn rp-del" onclick="RemainPaintModule._delExpiryCase('${c.id}')"><span class="material-symbols-outlined">remove_circle</span></button>` : ''}
        </div>`).join('');

        // ── 포장 단계 ──────────────────────────────────────────────────────
        const packagingStepsHTML = d.packagingSteps.map(s => `
        <div class="rp-ps-card" data-id="${s.id}">
            ${ce ? `<button class="rp-icon-btn rp-del rp-ps-del" onclick="RemainPaintModule._delPackagingStep('${s.id}')"><span class="material-symbols-outlined">delete</span></button>` : ''}
            <div class="rp-ps-num-badge">
                <span class="rp-ce rp-ps-no" contenteditable="${ce}">${s.no}</span>
            </div>
            ${_photoBox(s.photo, 'packagingStep', s.id, 'rp-ps-photo')}
            <div class="rp-ps-label">
                <span class="rp-ce rp-ps-title" contenteditable="${ce}">${s.title}</span>
                <span class="rp-ce rp-ps-titleen rp-en" contenteditable="${ce}">${s.titleEn}</span>
            </div>
        </div>`).join('');

        // ── 특기 사항 ──────────────────────────────────────────────────────
        const notesHTML = d.notes.map(n => `
        <div class="rp-note-row" data-id="${n.id}">
            <div class="rp-ce rp-note-text" contenteditable="${ce}" style="white-space:pre-line;">${n.text}</div>
            ${ce ? `<button class="rp-icon-btn rp-del" onclick="RemainPaintModule._delNote('${n.id}')"><span class="material-symbols-outlined">remove_circle</span></button>` : ''}
        </div>`).join('');

        // ── 개정이력 ──────────────────────────────────────────────────────
        const histHTML = d.history.map((h, idx) => `
        <tr class="rp-hist-row" data-idx="${idx}">
            <td><span class="rp-ce" contenteditable="${ce}">${h.no}</span></td>
            <td><span class="rp-ce" contenteditable="${ce}">${h.date}</span></td>
            <td><span class="rp-ce" contenteditable="${ce}">${h.content}</span></td>
            ${ce ? `<td><button class="rp-tbl-del-btn" onclick="RemainPaintModule._delHistRow(${idx})"><span class="material-symbols-outlined">remove</span></button></td>` : ''}
        </tr>`).join('');

        return `
        <div class="rp-root fade-in-up">

            <!-- 툴바 -->
            <div class="rp-toolbar">
                <div class="rp-toolbar-left">
                    <span class="material-symbols-outlined" style="color:${AC};font-size:22px;">format_color_fill</span>
                    <span style="font-weight:700;color:var(--text-primary);">잔여 도료 작업기준서</span>
                </div>
                <div class="rp-toolbar-right">
                    <button class="btn btn-outline rp-undo-btn" id="rpUndoBtn"
                        style="display:${ce ? '' : 'none'};" disabled
                        onclick="RemainPaintModule._undo()" title="되돌리기 (Ctrl+Z)">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">undo</span>
                        되돌리기 <span class="rp-undo-cnt"></span>
                    </button>
                    <button class="btn ${ce ? 'btn-success' : 'btn-outline'}"
                        onclick="RemainPaintModule._toggleEdit()">
                        <span class="material-symbols-outlined">${ce ? 'save' : 'edit'}</span>
                        ${ce ? '저장' : '편집'}
                    </button>
                </div>
            </div>

            <!-- 문서 헤더 -->
            <div class="rp-doc-header">
                <div class="rp-logo-block">
                    ${d.companyLogo
                        ? `<img src="${d.companyLogo}" alt="logo" class="rp-logo-img">`
                        : `<div class="rp-logo-ph">LOGO</div>`}
                </div>
                <div class="rp-header-title">
                    <div class="rp-ce rp-main-title" id="rpTitle" contenteditable="${ce}">${d.title}</div>
                    <div class="rp-ce rp-en-title" id="rpTitleEn" contenteditable="${ce}">${d.titleEn}</div>
                    <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">
                        <span class="rp-ce" id="rpRevision" contenteditable="${ce}">${d.revision}</span>
                    </div>
                </div>
            </div>

            <!-- 관리 목적 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">info</span>
                    관리 목적 <span class="rp-en-inline">Management Objective</span>
                </div>
                ${_ceBlock(d.purpose, 'rpPurpose', 'font-size:.85rem;color:var(--text-secondary);line-height:1.65;')}
                ${_ceBlock(d.purposeEn, 'rpPurposeEn', 'font-size:.78rem;color:var(--text-muted);margin-top:6px;')}
            </div>

            <!-- ■ 잔량 도료 표기 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">label</span>
                    ■ 잔량 도료 표기 <span class="rp-en-inline">Residual Paint Labeling</span>
                </div>
                <div class="rp-labeling-layout">
                    <div class="rp-labeling-steps">
                        <div class="rp-sub-title" style="margin-bottom:10px;">라벨 작성 방법</div>
                        ${labelStepsHTML}
                        ${ce ? `<button class="rp-add-btn" onclick="RemainPaintModule._addLabelStep()"><span class="material-symbols-outlined">add</span> 단계 추가</button>` : ''}
                    </div>
                    <div class="rp-label-example">
                        <div class="rp-sub-title" style="margin-bottom:8px;">Example / 잔량표 예시</div>
                        ${_photoBox(d.labelExamplePhoto, 'labelExample', null, 'rp-label-photo')}
                    </div>
                </div>
            </div>

            <!-- □ 사용기한 작성 방법 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">event_available</span>
                    □ 사용기한 작성 방법
                </div>
                <div class="rp-expiry-header">
                    <div class="rp-expiry-pill">
                        <span class="rp-ce" id="rpValidPeriod" contenteditable="${ce}">${d.expiryRule.validPeriod}</span>
                    </div>
                    <span style="font-size:.82rem;color:var(--text-muted);">→ 개봉 후 6개월이 기본 사용기간</span>
                </div>
                <div class="rp-expiry-cases">
                    ${expiryCasesHTML}
                </div>
                ${ce ? `<button class="rp-add-btn" onclick="RemainPaintModule._addExpiryCase()"><span class="material-symbols-outlined">add</span> 케이스 추가</button>` : ''}
            </div>

            <!-- ■ 포장 방법 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">inventory_2</span>
                    ■ 포장 방법
                    ${ce ? `<button class="rp-add-btn" onclick="RemainPaintModule._addPackagingStep()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 단계 추가</button>` : ''}
                </div>
                ${_ceBlock(d.packagingNote, 'rpPackagingNote', `font-size:.82rem;color:${AC};font-weight:600;margin-bottom:14px;`)}
                <div class="rp-ps-grid">
                    ${packagingStepsHTML}
                </div>
            </div>

            <!-- 특기 사항 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">stars</span>
                    특기 사항 <span class="rp-en-inline">Special Notes</span>
                    ${ce ? `<button class="rp-add-btn" onclick="RemainPaintModule._addNote()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 항목 추가</button>` : ''}
                </div>
                <div class="rp-notes-list">${notesHTML}</div>
            </div>

            <!-- 잔량표 양식 참조 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">description</span>
                    도 료 잔 량 표 양식
                </div>
                <div class="rp-lf-grid">
                    <div class="rp-lf-item">
                        <div class="rp-lf-label">도료사</div>
                        ${_ceBlock(d.labelForm.paintCompanies, 'rpLfPaintCompanies', 'font-size:.82rem;')}
                    </div>
                    <div class="rp-lf-item">
                        <div class="rp-lf-label">유효기한</div>
                        ${_ceBlock(d.labelForm.openPeriod, 'rpLfOpenPeriod', 'font-size:.82rem;')}
                    </div>
                    <div class="rp-lf-item">
                        <div class="rp-lf-label">사용기한 기재</div>
                        ${_ceBlock(d.labelForm.expiryNote, 'rpLfExpiryNote', 'font-size:.82rem;')}
                    </div>
                    <div class="rp-lf-item">
                        <div class="rp-lf-label">준수사항</div>
                        ${_ceBlock(d.labelForm.complianceNote, 'rpLfComplianceNote', 'font-size:.82rem;')}
                    </div>
                </div>
            </div>

            <!-- 개정이력 -->
            <div class="rp-section-card">
                <div class="rp-section-title">
                    <span class="material-symbols-outlined">history</span>
                    개정이력
                    ${ce ? `<button class="rp-add-btn" onclick="RemainPaintModule._addHistRow()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 행 추가</button>` : ''}
                </div>
                <table class="rp-hist-tbl">
                    <thead>
                        <tr>
                            <th style="width:50px;">No</th>
                            <th style="width:110px;">개정일자</th>
                            <th>개정내용</th>
                            ${ce ? '<th style="width:40px;"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${histHTML}</tbody>
                </table>
            </div>

        </div>

        <style>
        .rp-root { padding:16px; max-width:1100px; margin:0 auto; }

        /* 툴바 */
        .rp-toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
        .rp-toolbar-left { display:flex; align-items:center; gap:8px; }
        .rp-toolbar-right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .rp-undo-btn:disabled { opacity:.38; cursor:not-allowed; }
        .rp-undo-btn:not(:disabled) { border-color:#f59e0b; color:#b45309; }
        .rp-undo-btn:not(:disabled):hover { background:#fef3c7; }
        .rp-undo-cnt { font-size:.7rem; color:#9ca3af; font-weight:400; display:inline-block; }

        /* 헤더 */
        .rp-doc-header {
            display:flex; align-items:center; gap:20px;
            background:var(--bg-primary); border-radius:12px;
            border:1px solid var(--border-color); padding:16px 20px; margin-bottom:14px;
        }
        .rp-logo-img { max-width:130px; max-height:70px; object-fit:contain; flex-shrink:0; }
        .rp-logo-ph { width:110px; height:55px; background:var(--bg-secondary); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:.75rem; flex-shrink:0; }
        .rp-main-title { font-size:1.25rem; font-weight:800; color:#0f172a; }
        .rp-en-title { font-size:.82rem; color:var(--text-muted); margin-top:3px; }

        /* 섹션 카드 */
        .rp-section-card { background:var(--bg-primary); border-radius:12px; border:1px solid var(--border-color); padding:16px 18px; margin-bottom:14px; }
        .rp-section-title {
            display:flex; align-items:center; gap:6px;
            font-size:.92rem; font-weight:700; color:${AC};
            margin-bottom:14px;
        }
        .rp-section-title .material-symbols-outlined { font-size:18px; }
        .rp-en-inline { font-size:.76rem; color:var(--text-muted); font-weight:400; }
        .rp-sub-title { font-size:.78rem; font-weight:700; color:var(--text-muted); }

        /* 라벨 작성 */
        .rp-labeling-layout { display:grid; grid-template-columns:1fr 280px; gap:16px; align-items:start; }
        .rp-ls-row { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:8px; background:var(--bg-secondary); margin-bottom:7px; }
        .rp-ls-num { width:22px; height:22px; border-radius:50%; background:${AC}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:.75rem; font-weight:700; flex-shrink:0; margin-top:1px; }
        .rp-ls-content { flex:1; display:flex; flex-direction:column; gap:2px; }
        .rp-ls-text { font-size:.85rem; color:var(--text-primary); font-weight:600; }
        .rp-ls-texten { font-size:.74rem; color:var(--text-muted); }

        /* 라벨 예시 사진 */
        .rp-label-photo { width:100%; min-height:160px; max-height:280px; }
        .rp-photo-box {
            display:flex; align-items:center; justify-content:center;
            border:1.5px dashed var(--border-color); border-radius:8px;
            overflow:hidden; background:var(--bg-secondary); position:relative;
        }
        .rp-photo-box img { width:100%; object-fit:cover; }
        .rp-photo-overlay {
            display:none; position:absolute; inset:0;
            background:rgba(0,0,0,.45); align-items:center; justify-content:center;
            gap:8px; border-radius:7px;
        }
        .rp-photo-box:hover .rp-photo-overlay { display:flex; }
        .rp-photo-overlay button { background:none; border:none; cursor:pointer; color:#fff; padding:4px; border-radius:4px; }
        .rp-photo-overlay button:hover { background:rgba(255,255,255,.2); }
        .rp-photo-overlay .material-symbols-outlined { font-size:22px; }
        .rp-upload-btn { display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; color:var(--text-muted); padding:16px; font-size:.73rem; width:100%; background:none; border:none; }
        .rp-upload-btn:hover { color:${AC}; }
        .rp-upload-btn .material-symbols-outlined { font-size:26px; }

        /* 사용기한 */
        .rp-expiry-header { display:flex; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
        .rp-expiry-pill { background:#ede9fe; border:1.5px solid ${AC}; border-radius:20px; padding:4px 16px; font-size:.82rem; font-weight:700; color:${AC}; }
        .rp-expiry-cases { display:flex; flex-direction:column; gap:10px; }
        .rp-ec-row { display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border-radius:10px; background:var(--bg-secondary); border-left:3px solid ${AC}; }
        .rp-ec-badge { width:28px; height:28px; border-radius:50%; background:${AC}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:.78rem; font-weight:700; flex-shrink:0; margin-top:2px; }
        .rp-ec-body { flex:1; display:flex; flex-direction:column; gap:4px; }
        .rp-ec-title { font-size:.85rem; font-weight:700; color:var(--text-primary); }
        .rp-ec-example { font-size:.82rem; color:var(--text-secondary); }
        .rp-ec-note { font-size:.75rem; color:var(--text-muted); }

        /* 포장 단계 */
        .rp-ps-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; }
        .rp-ps-card {
            position:relative; display:flex; flex-direction:column; align-items:center;
            gap:8px; padding:14px 12px;
            background:var(--bg-secondary); border-radius:10px;
            border:1px solid var(--border-color); border-top:4px solid ${AC};
        }
        .rp-ps-del { position:absolute; top:6px; right:6px; }
        .rp-ps-num-badge { width:32px; height:32px; border-radius:50%; background:${AC}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:.9rem; font-weight:800; flex-shrink:0; }
        .rp-ps-photo { width:100%; min-height:110px; max-height:150px; }
        .rp-ps-label { text-align:center; display:flex; flex-direction:column; gap:2px; }
        .rp-ps-title { font-size:.88rem; font-weight:700; color:var(--text-primary); }
        .rp-ps-titleen { font-size:.72rem; color:var(--text-muted); }

        /* 특기 사항 */
        .rp-notes-list { display:flex; flex-direction:column; gap:8px; }
        .rp-note-row { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:8px; background:var(--bg-secondary); border-left:3px solid #ef4444; }
        .rp-note-text { flex:1; font-size:.83rem; color:var(--text-secondary); line-height:1.6; }

        /* 잔량표 양식 */
        .rp-lf-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
        .rp-lf-item { background:var(--bg-secondary); border-radius:8px; padding:10px 12px; }
        .rp-lf-label { font-size:.7rem; font-weight:700; color:${AC}; margin-bottom:5px; text-transform:uppercase; letter-spacing:.03em; }

        /* 개정이력 */
        .rp-hist-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .rp-hist-tbl th, .rp-hist-tbl td { padding:7px 10px; border:1px solid var(--border-color); text-align:left; }
        .rp-hist-tbl th { background:var(--bg-secondary); font-weight:700; color:var(--text-muted); }
        .rp-tbl-del-btn { background:none; border:none; cursor:pointer; color:#ef4444; padding:2px; border-radius:3px; opacity:.6; }
        .rp-tbl-del-btn:hover { opacity:1; background:#fee2e2; }
        .rp-tbl-del-btn .material-symbols-outlined { font-size:16px; vertical-align:middle; }

        /* 공통 버튼 */
        .rp-add-btn {
            display:inline-flex; align-items:center; gap:3px;
            font-size:.75rem; padding:4px 10px; border-radius:5px;
            background:none; border:1px solid ${AC}; color:${AC}; cursor:pointer;
            margin-top:8px;
        }
        .rp-add-btn:hover { background:#ede9fe; }
        .rp-add-btn .material-symbols-outlined { font-size:14px; }
        .rp-icon-btn { background:none; border:none; cursor:pointer; padding:2px; border-radius:4px; flex-shrink:0; }
        .rp-del { color:#ef4444; opacity:.55; }
        .rp-del:hover { opacity:1; background:#fee2e2; }
        .rp-del .material-symbols-outlined { font-size:18px; }

        /* contenteditable */
        .rp-ce[contenteditable="true"] {
            outline:none; border-bottom:1.5px dashed ${AC};
            padding-bottom:1px; cursor:text; border-radius:2px;
            display:inline-block; min-width:20px;
        }
        .rp-ce[contenteditable="true"]:focus { background:#ede9fe; border-bottom-color:${AC}; }
        .rp-ce-block[contenteditable="true"],
        .rp-ec-example[contenteditable="true"],
        .rp-ec-note[contenteditable="true"],
        .rp-note-text[contenteditable="true"] {
            display:block !important; border:1.5px dashed ${AC}; padding:4px 7px;
            border-radius:5px; background:transparent; min-height:22px;
        }
        .rp-ce-block[contenteditable="true"]:focus,
        .rp-ec-example[contenteditable="true"]:focus,
        .rp-note-text[contenteditable="true"]:focus { background:#ede9fe; }
        .rp-ls-text[contenteditable="true"],
        .rp-ls-texten[contenteditable="true"],
        .rp-ec-title[contenteditable="true"],
        .rp-ps-title[contenteditable="true"],
        .rp-ps-titleen[contenteditable="true"] {
            display:block; border:1.5px dashed ${AC}; padding:2px 5px;
            border-radius:4px; min-width:60px;
        }

        .rp-en { color:var(--text-muted); font-size:.77rem; }

        @media (max-width:680px) {
            .rp-labeling-layout { grid-template-columns:1fr; }
            .rp-ps-grid { grid-template-columns:1fr 1fr; }
        }
        </style>`;
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

    const RemainPaintModule = {
        render,
        _toggleEdit, _undo,
        _addLabelStep, _delLabelStep,
        _addExpiryCase, _delExpiryCase,
        _addPackagingStep, _delPackagingStep,
        _addNote, _delNote,
        _addHistRow, _delHistRow,
        _uploadPhoto, _removePhoto
    };

    window.RemainPaintModule = RemainPaintModule;
})();
