/**
 * 배합공정 도료 점도 측정 작업기준서 모듈
 * 페이지: viscosity-std
 * DB 스토어: viscosity_std_data
 */
(function () {
    const STORE = DB.STORES.VISCOSITY_STD_DATA;
    const KEY   = 'VISCOSITY_STD';
    const MAX_H = 30;
    const AC    = '#0891b2'; // cyan

    let _data       = null;
    let _editMode   = false;
    let _history    = [];
    let _kbListener = null;
    let _container  = null;

    // ── 기본 데이터 ──────────────────────────────────────────────────────────
    function _defaultData() {
        const B64 = (window.STD_ASSETS_B64 || {})['viscosity-std'] || {};
        return {
            id: KEY,
            title: '배합공정 도료 점도 측정 작업기준서',
            titleEn: 'Batch Process Paint Viscosity Measurement Work Standard Document',
            revision: 'Rev.01',
            companyLogo: B64['image3.png'] || 'assets/viscosity-std/image3.png',
            history: [
                { no: '1', date: '',        content: '최초작성' },
                { no: '2', date: '24.02.22', content: 'SQ인증에 따른 표준류 개정' }
            ],
            measurementCondition: '희석 신너 배합 후 15분이상 교반한 후 측정한다.',
            measurementConditionEn: 'Measure after mixing the diluent thinner for at least 15 minutes.',
            measurer: '배합 작업자, 작업 관리자, 검사원',
            measurerEn: 'Mixing operator, operation manager, inspector.',
            measurementSteps: [
                {
                    id: 'ms1', no: '①',
                    text: '세척된 점도계 준비\n스톱워치를 00.00.00 로 셋팅',
                    textEn: 'Prepare a cleaned viscometer.\nSet the stopwatch to 00:00:00.',
                    photo: B64['image10.jpeg'] || 'assets/viscosity-std/image10.jpeg'
                },
                {
                    id: 'ms2', no: '②',
                    text: '도료 안에 점도계 침수 후 교반기는 작동을 멈추어 둔다.',
                    textEn: 'Immerse the viscometer into the paint, and stop the operation of the mixer.',
                    photo: B64['image13.png'] || 'assets/viscosity-std/image13.png'
                },
                {
                    id: 'ms3', no: '③',
                    text: '침수된 점도계를 들어올리는 순간에 스톱워치 시작 누름.',
                    textEn: 'At the moment when the immersed viscometer is raised, press the start button on the stopwatch.',
                    photo: B64['image11.jpeg'] || 'assets/viscosity-std/image11.jpeg'
                },
                {
                    id: 'ms4', no: '④',
                    text: '도료가 모두 나오는 시점에 스톱워치 종료',
                    textEn: 'Stop the stopwatch when all the paint has come out.',
                    photo: B64['image12.png'] || 'assets/viscosity-std/image12.png'
                },
                {
                    id: 'ms5', no: '⑤',
                    text: '측정의 정확도를 위해 2~3회 반복한다.',
                    textEn: 'Repeat the process 2-3 times for measurement accuracy.',
                    photo: null
                },
                {
                    id: 'ms6', no: '⑥',
                    text: '평균치를 배합일지에 기록한다.',
                    textEn: 'Record the average value in the mixing log.',
                    photo: null
                }
            ],
            adjustmentDiagram: B64['image4.png'] || 'assets/viscosity-std/image4.png',
            adjustmentCases: [
                {
                    id: 'ac1',
                    condition: '점도가 기준보다 높을 시',
                    conditionEx: '(예 : 기준 10.2 < 측정 11.00 sec)',
                    conditionEn: 'If the viscosity is higher than the standard',
                    conditionEnEx: '(Example: Standard 10.2 < Measurement 11.00 sec)',
                    action: '▶ 희석 신너 소량 추가 투입',
                    actionNote: '(양은 기준 점도와의 차에 비례하여 결정한다.)',
                    actionEn: 'Add a small amount of diluent',
                    actionEnNote: '(The quantity is determined in proportion to the difference from the standard viscosity.)',
                    color: '#ef4444'  // red — too high
                },
                {
                    id: 'ac2',
                    condition: '점도가 기준보다 낮을 시',
                    conditionEx: '(예 : 기준 10.2 > 측정 9.50 sec)',
                    conditionEn: 'If the viscosity is lower than the standard',
                    conditionEnEx: '(Example: Standard 10.2 > Measurement 9.50 sec)',
                    action: '▶ 도료 주제 원액 소량 추가 투입',
                    actionNote: '(양은 기준 점도와의 차에 비례하여 결정한다.)',
                    actionEn: 'Add a small amount of undiluted base paint',
                    actionEnNote: '(The quantity is determined in proportion to the difference from the standard viscosity.)',
                    color: '#2563eb'  // blue — too low
                }
            ],
            notes: '측정 후 점도계는 신너로 세척하여 보관한다.\nClean the viscometer with thinner after measurement and store it properly.'
        };
    }

    // ── 저장된 파일경로 → base64 마이그레이션 ────────────────────────────────
    function _migrateAssets(d) {
        const B64 = (window.STD_ASSETS_B64 || {})['viscosity-std'] || {};
        const _b = (val, key) => (val && val.startsWith('assets/') && B64[key]) ? B64[key] : val;
        let dirty = false;
        const _check = (obj, field, key) => {
            const n = _b(obj[field], key);
            if (n !== obj[field]) { obj[field] = n; dirty = true; }
        };
        _check(d, 'companyLogo', 'image3.png');
        _check(d, 'adjustmentDiagram', 'image4.png');
        const stepMap = { ms1:'image10.jpeg', ms2:'image13.png', ms3:'image11.jpeg', ms4:'image12.png' };
        (d.measurementSteps || []).forEach(s => { if (stepMap[s.id]) _check(s, 'photo', stepMap[s.id]); });
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
        const btn = document.getElementById('vsUndoBtn');
        if (!btn) return;
        btn.disabled = !_history.length;
        const b = btn.querySelector('.vs-undo-cnt');
        if (b) b.textContent = _history.length > 0 ? `(${_history.length})` : '';
    }

    // ── 편집 내용 수집 ────────────────────────────────────────────────────────
    function _collectEdits() {
        if (!_editMode || !_container) return;
        const g = id => { const el = _container.querySelector(`#${id}`); return el ? el.innerText.trim() : null; };

        const map = [
            ['vsTitle',              'title'],
            ['vsTitleEn',            'titleEn'],
            ['vsRevision',           'revision'],
            ['vsMeasCond',           'measurementCondition'],
            ['vsMeasCondEn',         'measurementConditionEn'],
            ['vsMeasurer',           'measurer'],
            ['vsMeasurerEn',         'measurerEn'],
            ['vsNotes',              'notes'],
        ];
        map.forEach(([id, key]) => { const v = g(id); if (v !== null) _data[key] = v; });

        // 측정 단계
        _container.querySelectorAll('.vs-step-card').forEach(card => {
            const sid = card.dataset.sid;
            const s = _data.measurementSteps.find(x => x.id === sid);
            if (!s) return;
            const no   = card.querySelector('.vs-step-no');   if (no)   s.no      = no.innerText.trim();
            const txt  = card.querySelector('.vs-step-text'); if (txt)  s.text    = txt.innerText.trim();
            const txte = card.querySelector('.vs-step-texten'); if (txte) s.textEn = txte.innerText.trim();
        });

        // 점도 조정 케이스
        _container.querySelectorAll('.vs-ac-card').forEach(card => {
            const aid = card.dataset.aid;
            const c = _data.adjustmentCases.find(x => x.id === aid);
            if (!c) return;
            ['condition','conditionEx','conditionEn','conditionEnEx',
             'action','actionNote','actionEn','actionEnNote'].forEach(k => {
                const el = card.querySelector(`.vs-ac-${k.replace(/([A-Z])/g, m => '-' + m.toLowerCase())}`);
                if (el) c[k] = el.innerText.trim();
            });
        });

        // 개정이력
        _container.querySelectorAll('.vs-hist-row').forEach(row => {
            const idx = parseInt(row.dataset.idx, 10);
            if (isNaN(idx) || !_data.history[idx]) return;
            const cells = row.querySelectorAll('.vs-ce');
            if (cells[0]) _data.history[idx].no      = cells[0].innerText.trim();
            if (cells[1]) _data.history[idx].date     = cells[1].innerText.trim();
            if (cells[2]) _data.history[idx].content  = cells[2].innerText.trim();
        });
    }

    // ── 편집 모드 토글 ────────────────────────────────────────────────────────
    function _toggleEdit() {
        if (!_editMode) {
            _editMode = true; _history = []; _pushHistory();
            _kbListener = e => {
                if (!_editMode) return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    if (document.activeElement?.classList.contains('vs-ce')) return;
                    e.preventDefault(); _undo();
                }
            };
            document.addEventListener('keydown', _kbListener);
        } else {
            _collectEdits(); _editMode = false; _history = [];
            if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
            _save();
            UIUtils.toast('저장되었습니다.', 'success');
        }
        _rerender();
    }

    // ── 단계/항목 추가·삭제 ───────────────────────────────────────────────────
    function _addStep() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        const n = _data.measurementSteps.length + 1;
        _data.measurementSteps.push({ id: 'ms' + Date.now(), no: `(${n})`, text: '새 단계', textEn: 'New step', photo: null });
        _rerender();
    }
    function _delStep(sid) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.measurementSteps.length <= 1) return;
        _data.measurementSteps = _data.measurementSteps.filter(s => s.id !== sid);
        _rerender();
    }
    function _addAdjCase() {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        _data.adjustmentCases.push({ id: 'ac' + Date.now(), condition: '조건', conditionEx: '', conditionEn: 'Condition', conditionEnEx: '', action: '▶ 조치', actionNote: '', actionEn: 'Action', actionEnNote: '', color: '#6b7280' });
        _rerender();
    }
    function _delAdjCase(aid) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (_data.adjustmentCases.length <= 1) return;
        _data.adjustmentCases = _data.adjustmentCases.filter(c => c.id !== aid);
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
    function _uploadPhoto(field, id) {
        if (!_editMode) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                _collectEdits(); _pushHistory();
                if (field === 'step') {
                    const s = _data.measurementSteps.find(x => x.id === id);
                    if (s) s.photo = ev.target.result;
                } else if (field === 'diagram') {
                    _data.adjustmentDiagram = ev.target.result;
                }
                _rerender();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }
    function _removePhoto(field, id) {
        if (!_editMode) return;
        _collectEdits(); _pushHistory();
        if (field === 'step') {
            const s = _data.measurementSteps.find(x => x.id === id);
            if (s) s.photo = null;
        } else if (field === 'diagram') {
            _data.adjustmentDiagram = null;
        }
        _rerender();
    }

    // ── 사진 박스 헬퍼 ────────────────────────────────────────────────────────
    function _photoBox(src, field, id, cls) {
        const ce = _editMode;
        const callArgs = id ? `'${field}','${id}'` : `'${field}'`;
        if (src) return `
            <div class="vs-photo-box ${cls||''}">
                <img src="${src}" alt="">
                ${ce ? `<div class="vs-photo-ov">
                    <button onclick="ViscosityStdModule._uploadPhoto(${callArgs})"><span class="material-symbols-outlined">upload</span></button>
                    <button onclick="ViscosityStdModule._removePhoto(${callArgs})"><span class="material-symbols-outlined">delete</span></button>
                </div>` : ''}
            </div>`;
        if (ce) return `
            <div class="vs-photo-box ${cls||''}">
                <button class="vs-upload-btn" onclick="ViscosityStdModule._uploadPhoto(${callArgs})">
                    <span class="material-symbols-outlined">add_photo_alternate</span>사진 추가
                </button>
            </div>`;
        return '';
    }

    // ── 빌드 ─────────────────────────────────────────────────────────────────
    function _buildHTML() {
        const d = _data, ce = _editMode;

        // ── 측정 단계 카드 ──────────────────────────────────────────────
        const stepsHTML = d.measurementSteps.map(s => `
        <div class="vs-step-card" data-sid="${s.id}">
            ${ce ? `<button class="vs-icon-del" onclick="ViscosityStdModule._delStep('${s.id}')"><span class="material-symbols-outlined">delete</span></button>` : ''}
            <div class="vs-step-num">
                <span class="vs-ce vs-step-no" contenteditable="${ce}">${s.no}</span>
            </div>
            <div class="vs-step-body">
                ${_photoBox(s.photo, 'step', s.id, 'vs-step-photo')}
                <div class="vs-step-texts">
                    <div class="vs-ce vs-step-text" contenteditable="${ce}" style="white-space:pre-line;">${s.text}</div>
                    <div class="vs-ce vs-step-texten vs-en" contenteditable="${ce}" style="white-space:pre-line;">${s.textEn}</div>
                </div>
            </div>
        </div>`).join('');

        // ── 점도 조정 케이스 ────────────────────────────────────────────
        const adjHTML = d.adjustmentCases.map(c => `
        <div class="vs-ac-card" data-aid="${c.id}" style="border-top:4px solid ${c.color};">
            ${ce ? `<button class="vs-icon-del" onclick="ViscosityStdModule._delAdjCase('${c.id}')"><span class="material-symbols-outlined">delete</span></button>` : ''}
            <div class="vs-ac-condition-block" style="background:${c.color}18;border-left:3px solid ${c.color};">
                <div class="vs-ce vs-ac-condition" contenteditable="${ce}" style="font-weight:700;color:${c.color};">${c.condition}</div>
                <div class="vs-ce vs-ac-condition-ex" contenteditable="${ce}" style="font-size:.75rem;color:var(--text-muted);">${c.conditionEx}</div>
                <div class="vs-ce vs-ac-condition-en vs-en" contenteditable="${ce}">${c.conditionEn}</div>
                <div class="vs-ce vs-ac-condition-en-ex vs-en" contenteditable="${ce}" style="font-size:.7rem;">${c.conditionEnEx}</div>
            </div>
            <div class="vs-ac-arrow">→</div>
            <div class="vs-ac-action-block">
                <div class="vs-ce vs-ac-action" contenteditable="${ce}" style="font-weight:700;color:${c.color};">${c.action}</div>
                <div class="vs-ce vs-ac-action-note" contenteditable="${ce}" style="font-size:.78rem;color:var(--text-secondary);">${c.actionNote}</div>
                <div class="vs-ce vs-ac-action-en vs-en" contenteditable="${ce}">${c.actionEn}</div>
                <div class="vs-ce vs-ac-action-en-note vs-en" contenteditable="${ce}" style="font-size:.7rem;">${c.actionEnNote}</div>
            </div>
        </div>`).join('');

        // ── 개정이력 ────────────────────────────────────────────────────
        const histHTML = d.history.map((h, idx) => `
        <tr class="vs-hist-row" data-idx="${idx}">
            <td><span class="vs-ce" contenteditable="${ce}">${h.no}</span></td>
            <td><span class="vs-ce" contenteditable="${ce}">${h.date}</span></td>
            <td><span class="vs-ce" contenteditable="${ce}">${h.content}</span></td>
            ${ce ? `<td><button class="vs-tbl-del" onclick="ViscosityStdModule._delHistRow(${idx})"><span class="material-symbols-outlined">remove</span></button></td>` : ''}
        </tr>`).join('');

        return `
        <div class="vs-root fade-in-up">

            <!-- 툴바 -->
            <div class="vs-toolbar">
                <div class="vs-toolbar-left">
                    <span class="material-symbols-outlined" style="color:${AC};font-size:22px;">speed</span>
                    <span style="font-weight:700;color:var(--text-primary);">점도 측정 작업기준서</span>
                </div>
                <div class="vs-toolbar-right">
                    <button class="btn btn-outline vs-undo-btn" id="vsUndoBtn"
                        style="display:${ce ? '' : 'none'};" disabled
                        onclick="ViscosityStdModule._undo()" title="되돌리기 (Ctrl+Z)">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">undo</span>
                        되돌리기 <span class="vs-undo-cnt"></span>
                    </button>
                    <button class="btn ${ce ? 'btn-success' : 'btn-outline'}" onclick="ViscosityStdModule._toggleEdit()">
                        <span class="material-symbols-outlined">${ce ? 'save' : 'edit'}</span>
                        ${ce ? '저장' : '편집'}
                    </button>
                </div>
            </div>

            <!-- 문서 헤더 -->
            <div class="vs-doc-header">
                <div class="vs-logo-wrap">
                    ${d.companyLogo ? `<img src="${d.companyLogo}" class="vs-logo-img" alt="logo">` : `<div class="vs-logo-ph">LOGO</div>`}
                </div>
                <div class="vs-header-title">
                    <div class="vs-ce vs-main-title" id="vsTitle" contenteditable="${ce}">${d.title}</div>
                    <div class="vs-ce vs-en-title" id="vsTitleEn" contenteditable="${ce}">${d.titleEn}</div>
                    <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">
                        <span class="vs-ce" id="vsRevision" contenteditable="${ce}">${d.revision}</span>
                    </div>
                </div>
            </div>

            <!-- 측정 조건 + 측정자 -->
            <div class="vs-conditions-row">
                <div class="vs-condition-card">
                    <div class="vs-cond-label"><span class="material-symbols-outlined">rule</span> 측정 조건 <span class="vs-en-inline">Measurement Conditions</span></div>
                    <div class="vs-ce vs-cond-text" id="vsMeasCond" contenteditable="${ce}">${d.measurementCondition}</div>
                    <div class="vs-ce vs-en" id="vsMeasCondEn" contenteditable="${ce}">${d.measurementConditionEn}</div>
                </div>
                <div class="vs-condition-card">
                    <div class="vs-cond-label"><span class="material-symbols-outlined">person</span> 측정자 <span class="vs-en-inline">Measurer</span></div>
                    <div class="vs-ce vs-cond-text" id="vsMeasurer" contenteditable="${ce}">${d.measurer}</div>
                    <div class="vs-ce vs-en" id="vsMeasurerEn" contenteditable="${ce}">${d.measurerEn}</div>
                </div>
            </div>

            <!-- ■ 점도 측정 단계 -->
            <div class="vs-section-card">
                <div class="vs-section-title">
                    <span class="material-symbols-outlined">speed</span>
                    ■ 점도 측정 <span class="vs-en-inline">Viscosity Measurement</span>
                    ${ce ? `<button class="vs-add-btn" onclick="ViscosityStdModule._addStep()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 단계 추가</button>` : ''}
                </div>
                <div class="vs-steps-grid">
                    ${stepsHTML}
                </div>
            </div>

            <!-- ■ 점도 조정 방법 -->
            <div class="vs-section-card">
                <div class="vs-section-title">
                    <span class="material-symbols-outlined">tune</span>
                    ■ 점도의 조정 방법 <span class="vs-en-inline">Method of Adjusting Viscosity</span>
                    ${ce ? `<button class="vs-add-btn" onclick="ViscosityStdModule._addAdjCase()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 케이스 추가</button>` : ''}
                </div>
                <div class="vs-adj-grid">
                    ${adjHTML}
                </div>
                <div class="vs-adj-diagram-wrap">
                    <div class="vs-adj-diag-label">참고 도표</div>
                    ${_photoBox(d.adjustmentDiagram, 'diagram', null, 'vs-diag-photo')}
                </div>
            </div>

            <!-- 특기사항 -->
            <div class="vs-section-card">
                <div class="vs-section-title">
                    <span class="material-symbols-outlined">stars</span>
                    특기사항 <span class="vs-en-inline">Special Notes</span>
                </div>
                <div class="vs-ce vs-notes" id="vsNotes" contenteditable="${ce}" style="white-space:pre-line;">${d.notes}</div>
            </div>

            <!-- 개정이력 -->
            <div class="vs-section-card">
                <div class="vs-section-title">
                    <span class="material-symbols-outlined">history</span>
                    개정이력
                    ${ce ? `<button class="vs-add-btn" onclick="ViscosityStdModule._addHistRow()" style="margin-left:auto;"><span class="material-symbols-outlined">add</span> 행 추가</button>` : ''}
                </div>
                <table class="vs-hist-tbl">
                    <thead>
                        <tr>
                            <th style="width:48px;">No</th>
                            <th style="width:110px;">개정일자</th>
                            <th>개정내용</th>
                            ${ce ? '<th style="width:38px;"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${histHTML}</tbody>
                </table>
            </div>
        </div>

        <style>
        .vs-root { padding:16px; max-width:1100px; margin:0 auto; }

        /* 툴바 */
        .vs-toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
        .vs-toolbar-left,.vs-toolbar-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .vs-undo-btn:disabled { opacity:.38; cursor:not-allowed; }
        .vs-undo-btn:not(:disabled) { border-color:#f59e0b; color:#b45309; }
        .vs-undo-btn:not(:disabled):hover { background:#fef3c7; }
        .vs-undo-cnt { font-size:.7rem; color:#9ca3af; font-weight:400; }

        /* 헤더 */
        .vs-doc-header { display:flex; align-items:center; gap:18px; background:var(--bg-primary); border-radius:12px; border:1px solid var(--border-color); padding:16px 20px; margin-bottom:12px; }
        .vs-logo-img { max-width:130px; max-height:68px; object-fit:contain; flex-shrink:0; }
        .vs-logo-ph { width:110px; height:56px; background:var(--bg-secondary); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:.75rem; flex-shrink:0; }
        .vs-main-title { font-size:1.2rem; font-weight:800; color:#0f172a; }
        .vs-en-title { font-size:.8rem; color:var(--text-muted); margin-top:3px; }

        /* 측정 조건 */
        .vs-conditions-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
        .vs-condition-card { background:var(--bg-primary); border-radius:10px; border:1px solid var(--border-color); border-top:3px solid ${AC}; padding:12px 14px; }
        .vs-cond-label { display:flex; align-items:center; gap:5px; font-size:.78rem; font-weight:700; color:${AC}; margin-bottom:7px; }
        .vs-cond-label .material-symbols-outlined { font-size:16px; }
        .vs-cond-text { font-size:.85rem; color:var(--text-secondary); font-weight:600; }

        /* 섹션 카드 */
        .vs-section-card { background:var(--bg-primary); border-radius:12px; border:1px solid var(--border-color); padding:16px 18px; margin-bottom:12px; }
        .vs-section-title { display:flex; align-items:center; gap:6px; font-size:.92rem; font-weight:700; color:${AC}; margin-bottom:14px; }
        .vs-section-title .material-symbols-outlined { font-size:18px; }
        .vs-en-inline { font-size:.75rem; color:var(--text-muted); font-weight:400; }

        /* 측정 단계 그리드 */
        .vs-steps-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:14px; }
        .vs-step-card {
            position:relative; background:var(--bg-secondary);
            border-radius:10px; border:1px solid var(--border-color);
            border-top:4px solid ${AC}; padding:14px 12px;
            display:flex; flex-direction:column; gap:10px;
        }
        .vs-step-num { display:flex; justify-content:center; }
        .vs-step-no {
            width:36px; height:36px; border-radius:50%;
            background:${AC}; color:#fff;
            display:flex; align-items:center; justify-content:center;
            font-size:1rem; font-weight:800; text-align:center;
        }
        .vs-step-body { display:flex; flex-direction:column; gap:8px; flex:1; }
        .vs-step-texts { display:flex; flex-direction:column; gap:4px; }
        .vs-step-text  { font-size:.85rem; color:var(--text-primary); font-weight:600; line-height:1.5; }
        .vs-step-texten { font-size:.74rem; color:var(--text-muted); line-height:1.4; }

        /* 사진 박스 */
        .vs-photo-box { position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border-color); background:var(--bg-primary); display:flex; align-items:center; justify-content:center; }
        .vs-photo-box img { width:100%; object-fit:cover; }
        .vs-step-photo { min-height:100px; max-height:150px; }
        .vs-photo-ov { display:none; position:absolute; inset:0; background:rgba(0,0,0,.45); align-items:center; justify-content:center; gap:8px; border-radius:7px; }
        .vs-photo-box:hover .vs-photo-ov { display:flex; }
        .vs-photo-ov button { background:none; border:none; cursor:pointer; color:#fff; padding:4px; border-radius:4px; }
        .vs-photo-ov button:hover { background:rgba(255,255,255,.2); }
        .vs-photo-ov .material-symbols-outlined { font-size:22px; }
        .vs-upload-btn { display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; color:var(--text-muted); padding:14px; font-size:.73rem; width:100%; background:none; border:none; }
        .vs-upload-btn:hover { color:${AC}; }
        .vs-upload-btn .material-symbols-outlined { font-size:24px; }

        /* 점도 조정 */
        .vs-adj-grid { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
        .vs-ac-card {
            position:relative; display:grid;
            grid-template-columns:1fr 40px 1fr;
            gap:10px; align-items:center;
            background:var(--bg-secondary); border-radius:10px;
            border:1px solid var(--border-color); padding:14px 16px;
        }
        .vs-ac-condition-block,.vs-ac-action-block { display:flex; flex-direction:column; gap:3px; padding:8px 10px; border-radius:7px; background:var(--bg-primary); }
        .vs-ac-arrow { text-align:center; font-size:1.3rem; font-weight:700; color:var(--text-muted); }

        /* 참고 도표 */
        .vs-adj-diagram-wrap { border-top:1px dashed var(--border-color); padding-top:12px; }
        .vs-adj-diag-label { font-size:.74rem; color:var(--text-muted); font-weight:700; margin-bottom:7px; }
        .vs-diag-photo { width:100%; max-width:400px; min-height:80px; max-height:200px; }

        /* 특기사항 */
        .vs-notes { font-size:.85rem; color:var(--text-secondary); line-height:1.7; background:var(--bg-secondary); border-radius:7px; padding:10px 12px; }

        /* 개정이력 */
        .vs-hist-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .vs-hist-tbl th,.vs-hist-tbl td { padding:7px 10px; border:1px solid var(--border-color); text-align:left; }
        .vs-hist-tbl th { background:var(--bg-secondary); font-weight:700; color:var(--text-muted); }
        .vs-tbl-del { background:none; border:none; cursor:pointer; color:#ef4444; padding:2px; border-radius:3px; opacity:.6; }
        .vs-tbl-del:hover { opacity:1; background:#fee2e2; }
        .vs-tbl-del .material-symbols-outlined { font-size:16px; vertical-align:middle; }

        /* 공통 */
        .vs-add-btn { display:inline-flex; align-items:center; gap:3px; font-size:.75rem; padding:4px 9px; border-radius:5px; background:none; border:1px solid ${AC}; color:${AC}; cursor:pointer; }
        .vs-add-btn:hover { background:#ecfeff; }
        .vs-add-btn .material-symbols-outlined { font-size:14px; }
        .vs-icon-del { position:absolute; top:6px; right:6px; background:none; border:none; cursor:pointer; color:#ef4444; opacity:.5; padding:2px; border-radius:4px; }
        .vs-icon-del:hover { opacity:1; background:#fee2e2; }
        .vs-icon-del .material-symbols-outlined { font-size:18px; }
        .vs-en { font-size:.76rem; color:var(--text-muted); }

        /* contenteditable */
        .vs-ce[contenteditable="true"] { outline:none; border-bottom:1.5px dashed ${AC}; padding-bottom:1px; cursor:text; border-radius:2px; display:inline-block; min-width:20px; }
        .vs-ce[contenteditable="true"]:focus { background:#ecfeff; border-bottom-color:${AC}; border-radius:2px; }
        .vs-step-text[contenteditable="true"],
        .vs-step-texten[contenteditable="true"],
        .vs-notes[contenteditable="true"],
        .vs-cond-text[contenteditable="true"],
        .vs-ac-condition[contenteditable="true"],
        .vs-ac-condition-ex[contenteditable="true"],
        .vs-ac-condition-en[contenteditable="true"],
        .vs-ac-condition-en-ex[contenteditable="true"],
        .vs-ac-action[contenteditable="true"],
        .vs-ac-action-note[contenteditable="true"],
        .vs-ac-action-en[contenteditable="true"],
        .vs-ac-action-en-note[contenteditable="true"] {
            display:block; border:1.5px dashed ${AC}; padding:3px 6px; border-radius:4px; min-height:18px;
        }
        .vs-step-text[contenteditable="true"]:focus,
        .vs-notes[contenteditable="true"]:focus { background:#ecfeff; }
        .vs-step-no[contenteditable="true"] { border:2px dashed #fff; background:#0e7490; outline:none; }

        @media (max-width:640px) {
            .vs-conditions-row { grid-template-columns:1fr; }
            .vs-steps-grid { grid-template-columns:1fr 1fr; }
            .vs-ac-card { grid-template-columns:1fr; }
            .vs-ac-arrow { display:none; }
        }
        </style>`;
    }

    function _rerender() {
        if (!_container) return;
        _container.innerHTML = _buildHTML();
        _updateUndoBtn();
    }

    async function render(container) {
        _container = container;
        _editMode = false; _history = [];
        if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
        await _load();
        _rerender();
    }

    const ViscosityStdModule = {
        render, _toggleEdit, _undo,
        _addStep, _delStep,
        _addAdjCase, _delAdjCase,
        _addHistRow, _delHistRow,
        _uploadPhoto, _removePhoto
    };

    window.ViscosityStdModule = ViscosityStdModule;
})();
