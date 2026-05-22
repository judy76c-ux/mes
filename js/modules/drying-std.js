/**
 * 건조 및 셋팅룸 온도 기준서 (Drying & Setting Room Temperature Standard)
 * 페이지: drying-std
 * DB 스토어: drying_std_data
 * A라인 / B라인 탭 구성
 * 컬럼: 도료유형, 차종, 품명, 컨베이어속도(셋팅값/하한), Flash Off OVEN(#1-1/#2/#3), MAIN OVEN(#4~#8)
 */
var DryingStdModule = (function () {
    'use strict';

    const STORE = DB.STORES.DRYING_STD_DATA;
    const KEY   = 'DRYING_STD';

    let _data      = null;
    let _line      = 'A';
    let _container = null;

    // ── 기본 행 생성 ───────────────────────────────────────────────────
    function _row(id, paintType, car, part, speed, flashOff1, flashOff2, flashOff3, ov4, ov5, ov6, ov7, ov8) {
        return {
            id,
            paintType: paintType || '',
            car:       car       || '',
            part:      part      || '',
            speed:     speed     != null ? speed : '',
            speedLow:  speed     != null ? speed - 30 : '',
            fo1: flashOff1 != null ? flashOff1 : '',
            fo2: flashOff2 != null ? flashOff2 : '',
            fo3: flashOff3 != null ? flashOff3 : '',
            ov4: ov4 != null ? ov4 : '',
            ov5: ov5 != null ? ov5 : '',
            ov6: ov6 != null ? ov6 : '',
            ov7: ov7 != null ? ov7 : '',
            ov8: ov8 != null ? ov8 : ''
        };
    }

    function _defaultRowsA() {
        return [
            _row('a01', '2도 무광',     'golf-7',    'KNOB',          490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a02', '2도 무광',     'J34A',      'KNOB',          490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a03', '2도 무광',     'XFD',       'KNOB',          490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a04', '2도 무광',     'XFD',       'Seesaw Knob',   490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a05', '2도 무광',     'P702',      'BUTTON',        490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a06', '2도 무광 (★)', 'A3',        'PAO, ECALL',    350, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a07', '2도 무광 (★)', 'A3',        'ECALL',         400, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a08', '2도 무광 (★)', 'A3,Q2',     'KNOB',          490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a09', '2도 무광',     'T1xx',      'UM,S/Cover',    400, 20, 20, 40, 60, 80, 80, 80, 80),
            _row('a10', '2도 무광',     'GM',        'EMBLEM',        450, 20, 20, 40, 60, 80, 80, 80, 80),
            _row('a11', '2도 솔리드',   'RVIN',      'Thinted',       270, 25, 25, 40, 60, 70, 70, 70, 70),
            _row('a12', '2도 솔리드',   'T1XX',      'P-BUTTON',      490, 25, 25, 40, 60, 70, 70, 70, 70),
            _row('a13', '1도 솔리드',   'T1XX',      'LENS BK',       490, 25, 25, 40, 60, 80, 80, 80, 80),
            _row('a14', '1도 솔리드',   'P702',      'LENS',          300, 25, 25, 40, 60, 80, 80, 80, 80),
        ];
    }

    function _defaultRowsB() {
        return [];
    }

    function _defaultData() {
        return {
            id:      KEY,
            docNoA:  'KC-D-온도-A',
            docNoB:  'KC-D-온도-B',
            revA:    '2025.01',
            revB:    '2025.01',
            note:    '±5℃ 허용 / 컨베이어 속도 허용 하한(-) 30',
            history: [
                { no: '1', date: '2025.01.01', content: '최초 제정' }
            ],
            lineA: { rows: _defaultRowsA() },
            lineB: { rows: _defaultRowsB() }
        };
    }

    // ── 로드 / 저장 ─────────────────────────────────────────────────────
    async function _load() {
        const all   = Storage.getAll(STORE) || [];
        const found = all.find(r => r.id === KEY);
        _data = found ? found : _defaultData();
    }

    async function _save() {
        if (!_data) return;
        await Storage.put(STORE, _data);
    }

    function _uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _rows() { return _line === 'A' ? _data.lineA.rows : _data.lineB.rows; }

    // ── 초기화 / 렌더 ───────────────────────────────────────────────────
    async function init() { await _load(); }

    function render(container) {
        _container = container;
        if (!_data) {
            _load().then(() => _renderAll()).catch(err => {
                console.error('[DryingStd] load error:', err);
                container.innerHTML = `<div class="empty-state"><p style="color:red;">${err.message}</p></div>`;
            });
        } else {
            _renderAll();
        }
    }

    function _renderAll() {
        if (!_container) return;
        const isA   = _line === 'A';
        const rows  = _rows();
        const nRobot = isA ? 6 : 4;

        _container.innerHTML = `
        <div class="fade-in-up">

            <!-- 헤더 카드 -->
            <div class="card" style="margin-bottom:14px;padding:14px 18px;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <div>
                        <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:4px;">문서번호: <b>${_esc(isA ? _data.docNoA : _data.docNoB)}</b> &nbsp;|&nbsp; 개정일: <b>${_esc(isA ? _data.revA : _data.revB)}</b></div>
                        <div style="font-size:.78rem;color:var(--text-secondary);">${_esc(_data.note || '')}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <button class="btn btn-sm btn-secondary" onclick="DryingStdModule.editDocInfo()">
                            <span class="material-symbols-outlined" style="font-size:15px;">edit</span> 문서정보
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="DryingStdModule.addHistory()">
                            <span class="material-symbols-outlined" style="font-size:15px;">history</span> 개정이력
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="DryingStdModule.addRow()">
                            <span class="material-symbols-outlined" style="font-size:15px;">add</span> 행 추가
                        </button>
                    </div>
                </div>
            </div>

            <!-- 라인 탭 -->
            <div style="display:flex;gap:0;margin-bottom:0;">
                <button onclick="DryingStdModule.setLine('A')"
                    style="padding:8px 28px;border:1px solid ${isA ? '#b45309' : 'var(--border-color)'};border-bottom:none;border-radius:8px 8px 0 0;
                           background:${isA ? '#b45309' : 'var(--bg-secondary)'};color:${isA ? '#fff' : 'var(--text-secondary)'};font-weight:${isA ? 700 : 400};cursor:pointer;">
                    A 라인
                </button>
                <button onclick="DryingStdModule.setLine('B')"
                    style="padding:8px 28px;border:1px solid ${!isA ? '#0369a1' : 'var(--border-color)'};border-bottom:none;border-radius:8px 8px 0 0;
                           background:${!isA ? '#0369a1' : 'var(--bg-secondary)'};color:${!isA ? '#fff' : 'var(--text-secondary)'};font-weight:${!isA ? 700 : 400};cursor:pointer;">
                    B 라인
                </button>
            </div>

            <!-- 테이블 카드 -->
            <div class="card" style="padding:0;border-radius:0 8px 8px 8px;overflow:hidden;">
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.78rem;min-width:900px;">
                        <thead>
                            <tr style="background:${isA ? '#92400e' : '#075985'};color:#fff;text-align:center;">
                                <th rowspan="3" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);min-width:90px;">도료 유형</th>
                                <th rowspan="3" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);min-width:70px;">차종</th>
                                <th rowspan="3" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);min-width:110px;">품명</th>
                                <th colspan="2" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);">컨베이어 속도<br><span style="font-size:.68rem;font-weight:400;">허용 하한(-) 30</span></th>
                                <th colspan="8" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);">검장기준 온도 설정 &nbsp;±5℃ (허용)</th>
                                <th rowspan="3" style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);width:40px;"></th>
                            </tr>
                            <tr style="background:${isA ? '#b45309' : '#0369a1'};color:#fff;text-align:center;">
                                <th rowspan="2" style="padding:5px 8px;border:1px solid rgba(255,255,255,0.2);min-width:60px;">셋팅값</th>
                                <th rowspan="2" style="padding:5px 8px;border:1px solid rgba(255,255,255,0.2);min-width:55px;">-30</th>
                                <th colspan="3" style="padding:5px 8px;border:1px solid rgba(255,255,255,0.2);">Flash Off Time Setting OVEN</th>
                                <th colspan="5" style="padding:5px 8px;border:1px solid rgba(255,255,255,0.2);">MAIN OVEN</th>
                            </tr>
                            <tr style="background:${isA ? '#d97706' : '#0284c7'};color:#fff;text-align:center;">
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#1-1</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#2</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#3</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#4</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#5</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#6</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#7</th>
                                <th style="padding:4px 6px;border:1px solid rgba(255,255,255,0.2);min-width:44px;">#8</th>
                            </tr>
                        </thead>
                        <tbody id="dryingTbody">
                            ${rows.length === 0
                                ? `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">데이터가 없습니다. [행 추가] 버튼으로 추가하세요.</td></tr>`
                                : rows.map((r, idx) => _rowHtml(r, idx)).join('')
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 개정이력 -->
            ${_historyHtml()}
        </div>`;

        _attachEditListeners();
    }

    // ── 행 HTML ─────────────────────────────────────────────────────────
    function _rowHtml(r, idx) {
        const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
        function td(val, key) {
            return `<td data-id="${_esc(r.id)}" data-key="${key}"
                        style="padding:5px 7px;border:1px solid #e2e8f0;text-align:center;cursor:pointer;background:${bg};"
                        title="클릭하여 편집">${_esc(val)}</td>`;
        }
        // speedLow는 speed 기반 자동계산 — 편집 가능하되 speed 변경 시 자동 갱신
        return `<tr>
            ${td(r.paintType, 'paintType')}
            ${td(r.car,       'car')}
            ${td(r.part,      'part')}
            ${td(r.speed,     'speed')}
            ${td(r.speedLow,  'speedLow')}
            ${td(r.fo1,       'fo1')}
            ${td(r.fo2,       'fo2')}
            ${td(r.fo3,       'fo3')}
            ${td(r.ov4,       'ov4')}
            ${td(r.ov5,       'ov5')}
            ${td(r.ov6,       'ov6')}
            ${td(r.ov7,       'ov7')}
            ${td(r.ov8,       'ov8')}
            <td style="padding:3px;text-align:center;border:1px solid #e2e8f0;background:${bg};">
                <button onclick="DryingStdModule.deleteRow('${_esc(r.id)}')"
                    style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;padding:2px 4px;"
                    title="행 삭제">✕</button>
            </td>
        </tr>`;
    }

    // ── 셀 인라인 편집 ───────────────────────────────────────────────────
    function _attachEditListeners() {
        const tbody = document.getElementById('dryingTbody');
        if (!tbody) return;
        tbody.querySelectorAll('td[data-id]').forEach(td => {
            td.addEventListener('click', function () {
                if (this.querySelector('input')) return;
                const rowId = this.dataset.id;
                const key   = this.dataset.key;
                const cur   = this.textContent.trim();

                const inp = document.createElement('input');
                inp.value = cur;
                inp.style.cssText = 'width:100%;border:none;outline:none;background:transparent;text-align:center;font-size:.78rem;';

                const isNum = ['speed','speedLow','fo1','fo2','fo3','ov4','ov5','ov6','ov7','ov8'].includes(key);
                if (isNum) inp.type = 'number';

                this.innerHTML = '';
                this.appendChild(inp);
                inp.focus();
                inp.select();

                const commit = () => {
                    const val = isNum ? (inp.value === '' ? '' : Number(inp.value)) : inp.value.trim();
                    _commitCell(rowId, key, val);
                };
                inp.addEventListener('blur', commit);
                inp.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { _renderAll(); }
                });
            });
        });
    }

    function _commitCell(rowId, key, val) {
        const rows = _rows();
        const row  = rows.find(r => r.id === rowId);
        if (!row) return;
        row[key] = val;
        // speed 변경 시 speedLow 자동 갱신
        if (key === 'speed' && val !== '') {
            row.speedLow = Number(val) - 30;
        }
        _save().then(() => _renderAll());
    }

    // ── 개정이력 HTML ────────────────────────────────────────────────────
    function _historyHtml() {
        const hist = (_data.history || []);
        return `
        <div class="card" style="margin-top:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <h4 style="margin:0;font-size:.9rem;">개정 이력</h4>
                <button class="btn btn-sm btn-secondary" onclick="DryingStdModule.addHistory()">
                    <span class="material-symbols-outlined" style="font-size:14px;">add</span> 추가
                </button>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                <thead><tr style="background:var(--bg-secondary);">
                    <th style="padding:6px 10px;border:1px solid var(--border-color);width:50px;">No.</th>
                    <th style="padding:6px 10px;border:1px solid var(--border-color);width:110px;">개정일</th>
                    <th style="padding:6px 10px;border:1px solid var(--border-color);">개정 내용</th>
                    <th style="padding:6px 10px;border:1px solid var(--border-color);width:40px;"></th>
                </tr></thead>
                <tbody>
                    ${hist.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">이력 없음</td></tr>` :
                        hist.map(h => `<tr>
                            <td style="padding:5px 10px;border:1px solid var(--border-color);text-align:center;">${_esc(h.no)}</td>
                            <td style="padding:5px 10px;border:1px solid var(--border-color);text-align:center;">${_esc(h.date)}</td>
                            <td style="padding:5px 10px;border:1px solid var(--border-color);">${_esc(h.content)}</td>
                            <td style="padding:5px 10px;border:1px solid var(--border-color);text-align:center;">
                                <button onclick="DryingStdModule.deleteHistory('${_esc(h.no)}')"
                                    style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:15px;">✕</button>
                            </td>
                        </tr>`).join('')
                    }
                </tbody>
            </table>
        </div>`;
    }

    // ── 공개 API ─────────────────────────────────────────────────────────
    function setLine(line) { _line = line; _renderAll(); }

    function addRow() {
        const rows = _rows();
        const id   = _uid(_line === 'A' ? 'a' : 'b');
        rows.push(_row(id, '', '', '', '', '', '', '', '', '', '', '', ''));
        _save().then(() => _renderAll());
    }

    function deleteRow(id) {
        UIUtils.confirm('이 행을 삭제하시겠습니까?', () => {
            const rows = _rows();
            const idx  = rows.findIndex(r => r.id === id);
            if (idx >= 0) {
                rows.splice(idx, 1);
                _save().then(() => _renderAll());
            }
        });
    }

    function editDocInfo() {
        const isA = _line === 'A';
        UIUtils.openModal({
            title: '문서 정보 편집',
            size: 'md',
            body: `
            <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
                <div class="form-group">
                    <label class="form-label">A라인 문서번호</label>
                    <input class="form-input" id="dsDocNoA" value="${_esc(_data.docNoA)}">
                </div>
                <div class="form-group">
                    <label class="form-label">A라인 개정일</label>
                    <input class="form-input" id="dsRevA" value="${_esc(_data.revA)}">
                </div>
                <div class="form-group">
                    <label class="form-label">B라인 문서번호</label>
                    <input class="form-input" id="dsDocNoB" value="${_esc(_data.docNoB)}">
                </div>
                <div class="form-group">
                    <label class="form-label">B라인 개정일</label>
                    <input class="form-input" id="dsRevB" value="${_esc(_data.revB)}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고/허용오차</label>
                    <input class="form-input" id="dsNote" value="${_esc(_data.note || '')}">
                </div>
            </div>`,
            buttons: [
                { label: '저장', class: 'btn-primary', onClick: () => {
                    _data.docNoA = document.getElementById('dsDocNoA').value.trim();
                    _data.revA   = document.getElementById('dsRevA').value.trim();
                    _data.docNoB = document.getElementById('dsDocNoB').value.trim();
                    _data.revB   = document.getElementById('dsRevB').value.trim();
                    _data.note   = document.getElementById('dsNote').value.trim();
                    UIUtils.closeModal();
                    _save().then(() => _renderAll());
                }},
                { label: '취소', class: 'btn-secondary', onClick: UIUtils.closeModal }
            ]
        });
    }

    function addHistory() {
        UIUtils.openModal({
            title: '개정 이력 추가',
            size: 'sm',
            body: `
            <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
                <div class="form-group">
                    <label class="form-label">No.</label>
                    <input class="form-input" id="dsHno" value="${(_data.history || []).length + 1}">
                </div>
                <div class="form-group">
                    <label class="form-label">개정일</label>
                    <input class="form-input" id="dsHdate" placeholder="예: 2025.01.01">
                </div>
                <div class="form-group">
                    <label class="form-label">개정 내용</label>
                    <input class="form-input" id="dsHcontent" placeholder="개정 내용 입력">
                </div>
            </div>`,
            buttons: [
                { label: '추가', class: 'btn-primary', onClick: () => {
                    if (!_data.history) _data.history = [];
                    _data.history.push({
                        no:      document.getElementById('dsHno').value.trim(),
                        date:    document.getElementById('dsHdate').value.trim(),
                        content: document.getElementById('dsHcontent').value.trim()
                    });
                    UIUtils.closeModal();
                    _save().then(() => _renderAll());
                }},
                { label: '취소', class: 'btn-secondary', onClick: UIUtils.closeModal }
            ]
        });
    }

    function deleteHistory(no) {
        UIUtils.confirm('이 개정 이력을 삭제하시겠습니까?', () => {
            _data.history = (_data.history || []).filter(h => h.no !== no);
            _save().then(() => _renderAll());
        });
    }

    return { init, render, setLine, addRow, deleteRow, editDocInfo, addHistory, deleteHistory };
})();
