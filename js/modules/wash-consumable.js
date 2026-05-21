/**
 * 세척 소모품 교체관리 기준서 모듈
 * 페이지: wash-consumable
 * DB 스토어: wash_consumable_data
 */
(function () {
    const STORE = DB.STORES.WASH_CONSUMABLE_DATA;
    const KEY_A = 'A_LINE';
    const KEY_B = 'B_LINE';
    const _MAX_HIST = 30;

    let _currentLine = 'A'; // 'A' | 'B'
    let _dataA = null;
    let _dataB = null;
    let _editMode = false;
    let _historyA = [];
    let _historyB = [];
    let _kbListener = null;
    let _container = null;

    // ── 기본 데이터 ─────────────────────────────────────────────────────────
    function _defaultA() {
        const B64 = (window.STD_ASSETS_B64 || {})['wash-consumable'] || {};
        return {
            id: KEY_A,
            line: 'A',
            docTitle: 'A라인 세척 소모품 교체관리 기준서',
            revision: 'Rev.01',
            commonInfo: {
                cycleNote: '교체 주기 발생 시, 손상 및 오염 시 즉시 교체',
                checkTime: '오후 12:40 / 오후 17:30 (2회)'
            },
            history: [
                { no: '1', date: '24.09.01', content: '초도작성' },
                { no: '2', date: '24.11.05', content: '장갑 변경' }
            ],
            items: [
                {
                    id: 'a1', name: '라텍스 장갑', process: 'LOADING',
                    cycle: '4 Pair/day, 2HR 사용후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: null, photoAfter: null
                },
                {
                    id: 'a2', name: '탑 코팅 장갑', process: 'UNLOADING',
                    cycle: '2 pair/day, 2HR 사용 후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: null, photoAfter: null
                },
                {
                    id: 'a3', name: '비닐 + 마사지 장갑', process: '1st WASH',
                    cycle: '4 Pair/day, 2HR사용후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: null, photoAfter: null
                },
                {
                    id: 'a4', name: '롤러 패드', process: '2st WASH',
                    cycle: '조업 전 1회 교체',
                    usageMethod: '제품 세척',
                    disposal: '1. 조업전 교체\n사용 오염 전/후 보관함 구분\n▶ 사용후 롤러는 세척 재사용 가능\n▶ 신규 롤러는 실먼지 제거를 위해 세척 사용\n★ 세척은 세탁기에 세제 사용',
                    photoBefore: B64['image14.png'] || 'assets/wash-consumable/image14.png',
                    photoAfter: B64['image15.png'] || 'assets/wash-consumable/image15.png'
                }
            ]
        };
    }

    function _defaultB() {
        const B64 = (window.STD_ASSETS_B64 || {})['wash-consumable'] || {};
        return {
            id: KEY_B,
            line: 'B',
            docTitle: 'B라인 세척 소모품 교체관리 기준서',
            revision: 'Rev.01',
            commonInfo: {
                cycleNote: '교체 주기 발생 시, 손상 및 오염 시 즉시 교체',
                checkTime: '오후 12:40 / 오후 17:30 (2회)'
            },
            history: [
                { no: '1', date: '24.09.01', content: '초도작성' },
                { no: '2', date: '24.11.05', content: '장갑 변경' }
            ],
            items: [
                {
                    id: 'b1', name: '크린와이퍼', process: '1st WASH',
                    cycle: '2EA/day, 4HR 사용 후 교체',
                    usageMethod: '1장씩 사용\nIPA 도포 후 사용\n30회 사용 후 면 변경\n6면 사용 후 폐기\n1장에 6면',
                    disposal: '제품의 세척 면에 오염 없을 것\n4번 접어 32면 뒤집어 사용\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: B64['image21.png'] || 'assets/wash-consumable/image21.png',
                    photoAfter: B64['image22.png'] || 'assets/wash-consumable/image22.png'
                },
                {
                    id: 'b2', name: '라텍스 장갑', process: '2st WASH',
                    cycle: '4 Pair/day, 2HR 사용후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: null, photoAfter: null
                },
                {
                    id: 'b3', name: '텍렉', process: '1st WASH',
                    cycle: '4EA/day, 2HR 사용 후 교체',
                    usageMethod: '10회 사용 후 면 변경\n32면 사용 가능',
                    disposal: '제품의 세척 면에 오염 없을 것\n1번 접어 6면 뒤집어 사용\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: B64['image23.png'] || 'assets/wash-consumable/image23.png',
                    photoAfter: B64['image13.png'] || 'assets/wash-consumable/image13.png'
                },
                {
                    id: 'b4', name: '비닐 장갑', process: 'Loading / Unloading / Inspection / Packaging',
                    cycle: '4 Pair/day, 2HR 사용후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: B64['image17.png'] || 'assets/wash-consumable/image17.png',
                    photoAfter: B64['image18.png'] || 'assets/wash-consumable/image18.png'
                },
                {
                    id: 'b5', name: '라텍스 장갑', process: 'Loading / Unloading / Inspection / Packaging',
                    cycle: '4 Pair/day, 2HR 사용후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: B64['image7.png'] || 'assets/wash-consumable/image7.png',
                    photoAfter: B64['image8.png'] || 'assets/wash-consumable/image8.png'
                },
                {
                    id: 'b6', name: '탑 코팅 장갑', process: 'Loading / Unloading / Inspection / Packaging',
                    cycle: '2 pair/day, 2HR 사용 후 교체',
                    usageMethod: '양손 착용',
                    disposal: '1. 쉬는, 점심 시간에 교체\n2. 손상 및 오염시 즉시 교체\n▼\n세척 소모품 폐기함에 폐기',
                    photoBefore: null, photoAfter: null
                }
            ]
        };
    }

    // ── 저장된 파일경로 → base64 마이그레이션 ────────────────────────────────
    function _migrateAssets(d) {
        const B64 = (window.STD_ASSETS_B64 || {})['wash-consumable'] || {};
        const _b = (val, key) => (val && val.startsWith('assets/') && B64[key]) ? B64[key] : val;
        let dirty = false;
        const _chk = (obj, f, k) => { const n = _b(obj[f], k); if (n !== obj[f]) { obj[f] = n; dirty = true; } };
        const photoMap = {
            a4: { before: 'image14.png', after: 'image15.png' },
            b1: { before: 'image21.png', after: 'image22.png' },
            b3: { before: 'image23.png', after: 'image13.png' },
            b4: { before: 'image17.png', after: 'image18.png' },
            b5: { before: 'image7.png',  after: 'image8.png'  }
        };
        (d.items || []).forEach(item => {
            const m = photoMap[item.id];
            if (m) { _chk(item, 'photoBefore', m.before); _chk(item, 'photoAfter', m.after); }
        });
        return dirty;
    }

    // ── 데이터 로드 ──────────────────────────────────────────────────────────
    async function _loadData() {
        const all = Storage.getAll(STORE) || [];
        _dataA = all.find(r => r.id === KEY_A) || _defaultA();
        _dataB = all.find(r => r.id === KEY_B) || _defaultB();
        if (_migrateAssets(_dataA)) await Storage.put(STORE, _dataA);
        if (_migrateAssets(_dataB)) await Storage.put(STORE, _dataB);
    }

    async function _save() {
        const d = _currentLine === 'A' ? _dataA : _dataB;
        await Storage.put(STORE, d);
    }

    // ── 현재 데이터 참조 ─────────────────────────────────────────────────────
    function _currentData() { return _currentLine === 'A' ? _dataA : _dataB; }

    // ── Undo ─────────────────────────────────────────────────────────────────
    function _currentHistory() { return _currentLine === 'A' ? _historyA : _historyB; }

    function _pushHistory() {
        const hist = _currentHistory();
        hist.push(JSON.parse(JSON.stringify(_currentData())));
        if (hist.length > _MAX_HIST) hist.shift();
        _updateUndoBtn();
    }

    function _undo() {
        if (!_editMode) return;
        _collectEdits();
        const hist = _currentHistory();
        if (!hist.length) { UIUtils.toast('더 이상 되돌릴 내용이 없습니다.', 'info'); return; }
        const snap = hist.pop();
        if (_currentLine === 'A') _dataA = snap; else _dataB = snap;
        _updateUndoBtn();
        _rerender();
        UIUtils.toast('되돌렸습니다.', 'info');
    }

    function _updateUndoBtn() {
        const btn = document.getElementById('wcUndoBtn');
        if (!btn) return;
        const cnt = _currentHistory().length;
        btn.disabled = cnt === 0;
        const badge = btn.querySelector('.wc-undo-cnt');
        if (badge) badge.textContent = cnt > 0 ? `(${cnt})` : '';
    }

    // ── 편집 내용 수집 ────────────────────────────────────────────────────────
    function _collectEdits() {
        if (!_editMode || !_container) return;
        const d = _currentData();

        // commonInfo
        const cycleEl = _container.querySelector('#wcCycleNote');
        if (cycleEl) d.commonInfo.cycleNote = cycleEl.innerText.trim();
        const timeEl = _container.querySelector('#wcCheckTime');
        if (timeEl) d.commonInfo.checkTime = timeEl.innerText.trim();

        // 개정이력
        _container.querySelectorAll('.wc-hist-row').forEach(row => {
            const idx = parseInt(row.dataset.idx, 10);
            if (isNaN(idx) || !d.history[idx]) return;
            const cells = row.querySelectorAll('.wc-ce');
            if (cells[0]) d.history[idx].no = cells[0].innerText.trim();
            if (cells[1]) d.history[idx].date = cells[1].innerText.trim();
            if (cells[2]) d.history[idx].content = cells[2].innerText.trim();
        });

        // 소모품 아이템 텍스트
        _container.querySelectorAll('.wc-item-card').forEach(card => {
            const itemId = card.dataset.itemId;
            const item = d.items.find(i => i.id === itemId);
            if (!item) return;
            const n = card.querySelector('.wc-item-name');
            if (n) item.name = n.innerText.trim();
            const p = card.querySelector('.wc-item-process');
            if (p) item.process = p.innerText.trim();
            const c = card.querySelector('.wc-item-cycle');
            if (c) item.cycle = c.innerText.trim();
            const u = card.querySelector('.wc-item-usage');
            if (u) item.usageMethod = u.innerText.trim();
            const di = card.querySelector('.wc-item-disposal');
            if (di) item.disposal = di.innerText.trim();
        });
    }

    // ── 편집 모드 토글 ────────────────────────────────────────────────────────
    function _toggleEdit() {
        if (!_editMode) {
            _editMode = true;
            if (_currentLine === 'A') _historyA = []; else _historyB = [];
            _pushHistory();
            _kbListener = function (e) {
                if (!_editMode) return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    if (document.activeElement && document.activeElement.classList.contains('wc-ce')) return;
                    e.preventDefault();
                    _undo();
                }
            };
            document.addEventListener('keydown', _kbListener);
        } else {
            _collectEdits();
            _editMode = false;
            if (_currentLine === 'A') _historyA = []; else _historyB = [];
            if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
            _save();
            UIUtils.toast('저장되었습니다.', 'success');
        }
        _rerender();
    }

    // ── 아이템 추가 ───────────────────────────────────────────────────────────
    function _addItem() {
        if (!_editMode) return;
        _collectEdits();
        _pushHistory();
        const d = _currentData();
        const prefix = _currentLine === 'A' ? 'a' : 'b';
        const newId = prefix + Date.now();
        d.items.push({
            id: newId, name: '새 소모품', process: '공정명',
            cycle: '교체 주기',
            usageMethod: '사용 방법',
            disposal: '폐기 방법',
            photoBefore: null, photoAfter: null
        });
        _rerender();
    }

    // ── 아이템 삭제 ───────────────────────────────────────────────────────────
    function _delItem(itemId) {
        if (!_editMode) return;
        _collectEdits();
        _pushHistory();
        const d = _currentData();
        if (d.items.length <= 1) { UIUtils.toast('마지막 항목은 삭제할 수 없습니다.', 'warning'); return; }
        d.items = d.items.filter(i => i.id !== itemId);
        _rerender();
    }

    // ── 개정이력 행 추가/삭제 ─────────────────────────────────────────────────
    function _addHistRow() {
        if (!_editMode) return;
        _collectEdits();
        _pushHistory();
        const d = _currentData();
        d.history.push({ no: String(d.history.length + 1), date: '', content: '' });
        _rerender();
    }

    function _delHistRow(idx) {
        if (!_editMode) return;
        _collectEdits();
        _pushHistory();
        const d = _currentData();
        if (d.history.length <= 1) return;
        d.history.splice(idx, 1);
        _rerender();
    }

    // ── 사진 업로드 ───────────────────────────────────────────────────────────
    function _uploadPhoto(itemId, which) {
        if (!_editMode) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function () {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) {
                _collectEdits();
                _pushHistory();
                const d = _currentData();
                const item = d.items.find(i => i.id === itemId);
                if (!item) return;
                if (which === 'before') item.photoBefore = ev.target.result;
                else item.photoAfter = ev.target.result;
                _rerender();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function _removePhoto(itemId, which) {
        if (!_editMode) return;
        _collectEdits();
        _pushHistory();
        const d = _currentData();
        const item = d.items.find(i => i.id === itemId);
        if (!item) return;
        if (which === 'before') item.photoBefore = null;
        else item.photoAfter = null;
        _rerender();
    }

    // ── 라인 전환 ─────────────────────────────────────────────────────────────
    function _switchLine(line) {
        if (_currentLine === line) return;
        if (_editMode) {
            _collectEdits();
            _editMode = false;
            if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
            _save();
        }
        _historyA = [];
        _historyB = [];
        _currentLine = line;
        _rerender();
    }

    // ── 렌더링 ────────────────────────────────────────────────────────────────
    function _rerender() {
        if (!_container) return;
        _container.innerHTML = _buildHTML();
        _updateUndoBtn();
    }

    function _buildHTML() {
        const d = _currentData();
        const ce = _editMode;

        // ── 공통 헤더 영역 ──────────────────────────────────────────────
        const headerHTML = `
        <div class="wc-doc">
            <div class="wc-doc-header">
                <div class="wc-doc-title-block">
                    <div class="wc-doc-title" style="font-size:1.35rem;font-weight:800;color:#0f172a;">${d.docTitle}</div>
                    <div class="wc-doc-sub" style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${d.revision}</div>
                </div>
                <div class="wc-doc-meta-block" style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
                    <div class="wc-meta-item">
                        <span class="wc-meta-label">교체 주기</span>
                        <span class="wc-ce wc-meta-val" id="wcCycleNote"
                            contenteditable="${ce}"
                            style="white-space:pre-line;">${d.commonInfo.cycleNote}</span>
                    </div>
                    <div class="wc-meta-item">
                        <span class="wc-meta-label">점검 시간</span>
                        <span class="wc-ce wc-meta-val" id="wcCheckTime"
                            contenteditable="${ce}">${d.commonInfo.checkTime}</span>
                    </div>
                </div>
            </div>
        </div>`;

        // ── 소모품 카드 영역 ─────────────────────────────────────────────
        const itemsHTML = d.items.map(item => `
        <div class="wc-item-card" data-item-id="${item.id}">
            ${ce ? `<button class="wc-del-item-btn" onclick="WashConsumableModule._delItem('${item.id}')" title="삭제">
                <span class="material-symbols-outlined">delete</span>
            </button>` : ''}
            <div class="wc-item-top">
                <div class="wc-item-name-block">
                    <span class="material-symbols-outlined wc-item-icon">cleaning_services</span>
                    <span class="wc-ce wc-item-name" contenteditable="${ce}">${item.name}</span>
                </div>
                <div class="wc-item-process-block">
                    <span class="wc-process-label">공정</span>
                    <span class="wc-ce wc-item-process" contenteditable="${ce}">${item.process}</span>
                </div>
            </div>
            <div class="wc-item-body">
                <div class="wc-item-section">
                    <div class="wc-section-label"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">autorenew</span> 교체 주기</div>
                    <div class="wc-ce wc-item-cycle" contenteditable="${ce}" style="white-space:pre-line;">${item.cycle}</div>
                </div>
                <div class="wc-item-section">
                    <div class="wc-section-label"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">info</span> 사용 방법</div>
                    <div class="wc-ce wc-item-usage" contenteditable="${ce}" style="white-space:pre-line;">${item.usageMethod}</div>
                </div>
                <div class="wc-item-section wc-item-disposal-section">
                    <div class="wc-section-label"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">delete_sweep</span> 폐기 방법</div>
                    <div class="wc-ce wc-item-disposal" contenteditable="${ce}" style="white-space:pre-line;">${item.disposal}</div>
                </div>
            </div>
            <div class="wc-item-photos">
                <div class="wc-photo-slot">
                    <div class="wc-photo-label">사용 전</div>
                    ${_photoHTML(item, 'before')}
                </div>
                <div class="wc-photo-slot">
                    <div class="wc-photo-label">사용 후</div>
                    ${_photoHTML(item, 'after')}
                </div>
            </div>
        </div>`).join('');

        // ── 개정이력 테이블 ──────────────────────────────────────────────
        const histRows = d.history.map((h, idx) => `
        <tr class="wc-hist-row" data-idx="${idx}">
            <td><span class="wc-ce" contenteditable="${ce}">${h.no}</span></td>
            <td><span class="wc-ce" contenteditable="${ce}">${h.date}</span></td>
            <td><span class="wc-ce" contenteditable="${ce}">${h.content}</span></td>
            ${ce ? `<td><button class="wc-del-row-btn" onclick="WashConsumableModule._delHistRow(${idx})"><span class="material-symbols-outlined">remove</span></button></td>` : ''}
        </tr>`).join('');

        const histHTML = `
        <div class="wc-section-card">
            <div class="wc-section-card-title">
                <span class="material-symbols-outlined">history</span> 개정이력
                ${ce ? `<button class="wc-add-row-btn" onclick="WashConsumableModule._addHistRow()"><span class="material-symbols-outlined">add</span> 행 추가</button>` : ''}
            </div>
            <table class="wc-hist-tbl">
                <thead>
                    <tr>
                        <th style="width:50px;">No</th>
                        <th style="width:100px;">개정일자</th>
                        <th>개정내용</th>
                        ${ce ? '<th style="width:40px;"></th>' : ''}
                    </tr>
                </thead>
                <tbody>${histRows}</tbody>
            </table>
        </div>`;

        return `
        <div class="wc-root fade-in-up">
            <!-- 툴바 -->
            <div class="wc-toolbar">
                <div class="wc-line-tabs">
                    <button class="wc-line-btn ${_currentLine === 'A' ? 'active' : ''}"
                        onclick="WashConsumableModule._switchLine('A')">A라인</button>
                    <button class="wc-line-btn ${_currentLine === 'B' ? 'active' : ''}"
                        onclick="WashConsumableModule._switchLine('B')">B라인</button>
                </div>
                <div class="wc-toolbar-actions">
                    <button class="btn btn-outline wc-undo-btn" id="wcUndoBtn"
                        style="display:${ce ? '' : 'none'};" disabled
                        onclick="WashConsumableModule._undo()" title="되돌리기 (Ctrl+Z)">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">undo</span>
                        되돌리기 <span class="wc-undo-cnt"></span>
                    </button>
                    ${ce ? `
                    <button class="btn btn-primary" onclick="WashConsumableModule._addItem()">
                        <span class="material-symbols-outlined">add</span> 항목 추가
                    </button>` : ''}
                    <button class="btn ${ce ? 'btn-success' : 'btn-outline'}"
                        onclick="WashConsumableModule._toggleEdit()">
                        <span class="material-symbols-outlined">${ce ? 'save' : 'edit'}</span>
                        ${ce ? '저장' : '편집'}
                    </button>
                </div>
            </div>

            <!-- 문서 헤더 -->
            ${headerHTML}

            <!-- 소모품 카드 그리드 -->
            <div class="wc-items-grid">
                ${itemsHTML}
            </div>

            <!-- 개정이력 -->
            ${histHTML}
        </div>

        <style>
        .wc-root { padding:16px; max-width:1200px; margin:0 auto; }

        /* 툴바 */
        .wc-toolbar {
            display:flex; align-items:center; justify-content:space-between;
            gap:10px; flex-wrap:wrap; margin-bottom:16px;
        }
        .wc-line-tabs { display:flex; gap:6px; }
        .wc-line-btn {
            padding:7px 18px; border-radius:8px; border:1.5px solid var(--border-color);
            background:var(--bg-primary); font-weight:600; cursor:pointer;
            color:var(--text-secondary); font-size:.9rem; transition:all .18s;
        }
        .wc-line-btn.active {
            background:#0e7490; border-color:#0e7490; color:#fff;
        }
        .wc-toolbar-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

        /* 되돌리기 버튼 */
        .wc-undo-btn:disabled { opacity:.38; cursor:not-allowed; }
        .wc-undo-btn:not(:disabled) { border-color:#f59e0b; color:#b45309; }
        .wc-undo-btn:not(:disabled):hover { background:#fef3c7; }
        .wc-undo-cnt { font-size:.7rem; color:#9ca3af; font-weight:400; min-width:1em; display:inline-block; }

        /* 문서 헤더 */
        .wc-doc { background:var(--bg-primary); border-radius:12px; border:1px solid var(--border-color); padding:18px 22px; margin-bottom:16px; }
        .wc-doc-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; flex-wrap:wrap; }
        .wc-doc-meta-block { flex:1; min-width:200px; }
        .wc-meta-item { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }
        .wc-meta-label { font-size:.75rem; font-weight:700; color:#0e7490; background:#ecfeff; border-radius:4px; padding:2px 7px; white-space:nowrap; flex-shrink:0; }
        .wc-meta-val { font-size:.82rem; color:var(--text-secondary); }

        /* 소모품 카드 그리드 */
        .wc-items-grid {
            display:grid;
            grid-template-columns:repeat(auto-fill,minmax(320px,1fr));
            gap:14px;
            margin-bottom:20px;
        }
        .wc-item-card {
            position:relative;
            background:var(--bg-primary);
            border:1px solid var(--border-color);
            border-left:4px solid #0e7490;
            border-radius:12px;
            padding:16px;
            transition:box-shadow .18s;
        }
        .wc-item-card:hover { box-shadow:0 2px 12px rgba(0,0,0,.08); }

        /* 삭제 버튼 */
        .wc-del-item-btn {
            position:absolute; top:8px; right:8px;
            background:none; border:none; cursor:pointer;
            color:#ef4444; opacity:.6; padding:2px;
            border-radius:4px; transition:opacity .15s;
        }
        .wc-del-item-btn:hover { opacity:1; background:#fee2e2; }
        .wc-del-item-btn .material-symbols-outlined { font-size:18px; }

        .wc-item-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .wc-item-name-block { display:flex; align-items:center; gap:6px; }
        .wc-item-icon { font-size:20px; color:#0e7490; flex-shrink:0; }
        .wc-item-name { font-size:1rem; font-weight:800; color:var(--text-primary); }
        .wc-item-process-block { display:flex; align-items:center; gap:5px; }
        .wc-process-label { font-size:.68rem; font-weight:700; color:#fff; background:#0e7490; border-radius:4px; padding:2px 7px; white-space:nowrap; }
        .wc-item-process { font-size:.78rem; color:#0e7490; font-weight:600; max-width:160px; }

        .wc-item-body { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
        .wc-item-section { background:var(--bg-secondary); border-radius:7px; padding:8px 10px; }
        .wc-section-label { font-size:.72rem; font-weight:700; color:var(--text-muted); margin-bottom:4px; display:flex; align-items:center; gap:3px; }
        .wc-item-cycle, .wc-item-usage, .wc-item-disposal { font-size:.82rem; color:var(--text-secondary); line-height:1.55; }

        /* 사진 영역 */
        .wc-item-photos { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .wc-photo-slot { display:flex; flex-direction:column; gap:4px; }
        .wc-photo-label { font-size:.7rem; font-weight:700; color:var(--text-muted); text-align:center; }
        .wc-photo-box {
            width:100%; min-height:90px; max-height:160px;
            display:flex; align-items:center; justify-content:center;
            border:1.5px dashed var(--border-color); border-radius:7px;
            overflow:hidden; background:var(--bg-secondary); position:relative;
        }
        .wc-photo-box img { width:100%; height:100%; object-fit:cover; }
        .wc-photo-overlay {
            display:none; position:absolute; inset:0;
            background:rgba(0,0,0,.45);
            align-items:center; justify-content:center; gap:6px; border-radius:6px;
        }
        .wc-photo-box:hover .wc-photo-overlay { display:flex; }
        .wc-photo-overlay button {
            background:none; border:none; cursor:pointer;
            color:#fff; padding:4px; border-radius:4px;
        }
        .wc-photo-overlay button:hover { background:rgba(255,255,255,.2); }
        .wc-photo-upload-btn {
            display:flex; flex-direction:column; align-items:center; gap:3px;
            cursor:pointer; color:var(--text-muted); padding:10px;
            font-size:.72rem; width:100%; background:none; border:none;
        }
        .wc-photo-upload-btn .material-symbols-outlined { font-size:24px; }
        .wc-photo-upload-btn:hover { color:#0e7490; }

        /* contenteditable 스타일 */
        .wc-ce[contenteditable="true"] {
            outline:none; border-bottom:1.5px dashed #0e7490;
            padding-bottom:1px; cursor:text; border-radius:2px;
            display:inline-block; min-width:20px;
        }
        .wc-ce[contenteditable="true"]:focus {
            background:#ecfeff; border-bottom-color:#0e7490; border-radius:2px;
        }
        .wc-item-cycle[contenteditable="true"],
        .wc-item-usage[contenteditable="true"],
        .wc-item-disposal[contenteditable="true"] {
            display:block; border:1.5px dashed #0e7490; padding:4px 6px;
            border-radius:4px; background:transparent; min-height:24px;
        }
        .wc-item-cycle[contenteditable="true"]:focus,
        .wc-item-usage[contenteditable="true"]:focus,
        .wc-item-disposal[contenteditable="true"]:focus { background:#ecfeff; }

        /* 개정이력 섹션 */
        .wc-section-card {
            background:var(--bg-primary); border-radius:12px;
            border:1px solid var(--border-color); padding:16px 18px; margin-bottom:16px;
        }
        .wc-section-card-title {
            display:flex; align-items:center; gap:6px;
            font-size:.9rem; font-weight:700; color:var(--text-primary);
            margin-bottom:12px;
        }
        .wc-section-card-title .material-symbols-outlined { font-size:18px; color:#0e7490; }
        .wc-add-row-btn {
            margin-left:auto; display:flex; align-items:center; gap:3px;
            font-size:.75rem; padding:3px 9px; border-radius:5px;
            background:none; border:1px solid #0e7490; color:#0e7490; cursor:pointer;
        }
        .wc-add-row-btn:hover { background:#ecfeff; }
        .wc-add-row-btn .material-symbols-outlined { font-size:14px; }
        .wc-hist-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .wc-hist-tbl th, .wc-hist-tbl td { padding:7px 10px; border:1px solid var(--border-color); text-align:left; }
        .wc-hist-tbl th { background:var(--bg-secondary); font-weight:700; color:var(--text-muted); }
        .wc-del-row-btn {
            background:none; border:none; cursor:pointer; color:#ef4444;
            padding:2px; border-radius:3px; opacity:.6;
        }
        .wc-del-row-btn:hover { opacity:1; background:#fee2e2; }
        .wc-del-row-btn .material-symbols-outlined { font-size:16px; vertical-align:middle; }

        @media (max-width:600px) {
            .wc-items-grid { grid-template-columns:1fr; }
            .wc-doc-header { flex-direction:column; }
        }
        </style>`;
    }

    // ── 사진 HTML 헬퍼 ────────────────────────────────────────────────────────
    function _photoHTML(item, which) {
        const src = which === 'before' ? item.photoBefore : item.photoAfter;
        const ce = _editMode;
        if (src) {
            return `<div class="wc-photo-box">
                <img src="${src}" alt="${which}">
                ${ce ? `<div class="wc-photo-overlay">
                    <button onclick="WashConsumableModule._uploadPhoto('${item.id}','${which}')" title="교체">
                        <span class="material-symbols-outlined" style="font-size:20px;">upload</span>
                    </button>
                    <button onclick="WashConsumableModule._removePhoto('${item.id}','${which}')" title="삭제">
                        <span class="material-symbols-outlined" style="font-size:20px;">delete</span>
                    </button>
                </div>` : ''}
            </div>`;
        } else if (ce) {
            return `<div class="wc-photo-box">
                <button class="wc-photo-upload-btn"
                    onclick="WashConsumableModule._uploadPhoto('${item.id}','${which}')">
                    <span class="material-symbols-outlined">add_photo_alternate</span>
                    사진 추가
                </button>
            </div>`;
        } else {
            return `<div class="wc-photo-box">
                <span style="font-size:.75rem;color:var(--text-muted);">사진 없음</span>
            </div>`;
        }
    }

    // ── 퍼블릭 render ─────────────────────────────────────────────────────────
    async function render(container) {
        _container = container;
        _editMode = false;
        _historyA = [];
        _historyB = [];
        if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }

        await _loadData();
        _rerender();
    }

    const WashConsumableModule = {
        render,
        _toggleEdit,
        _undo,
        _addItem,
        _delItem,
        _addHistRow,
        _delHistRow,
        _uploadPhoto,
        _removePhoto,
        _switchLine
    };

    window.WashConsumableModule = WashConsumableModule;
})();
