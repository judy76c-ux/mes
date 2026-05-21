/**
 * 제품 파지 기준서 (PajiStdModule)
 * 로딩 공정 파지 위치 기준 문서 — A/B 라인별 편집 가능
 */
var PajiStdModule = (function () {
    'use strict';

    const DATA_STORE = DB.STORES.PAJI_STD_DATA;
    const KEY_A = 'PAJI_A';
    const KEY_B = 'PAJI_B';

    let _editMode   = false;
    let _currentLine = 'A';
    let _dataA = null;
    let _dataB = null;

    // ── Undo 히스토리 ──────────────────────────────────────────────
    let _historyA   = [];
    let _historyB   = [];
    const _MAX_HIST  = 30;
    let _kbListener  = null;

    // ════════════════════════════════════════════════════════════════
    // 기본 데이터 (엑셀 파지 기준서에서 추출)
    // ════════════════════════════════════════════════════════════════
    const _P = p => {
        if (!p) return null;
        const b64 = ((window.STD_ASSETS_B64 || {})['paji-std'] || {})[p];
        return b64 || ('assets/paji-std/' + p);
    };
    const _uid = () => '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    function _defaultA() {
        return {
            id: KEY_A,
            line: 'A라인', process: '로딩', revision: 'Rev.00',
            purpose: {
                ko: '제품의 파지위치를 지정하여 제품의 오염을 방지하여 품질을 향상시키고 불량을 방지하기 위함',
                en: "To prevent contamination of the product by specifying the product's location, thereby improving quality and preventing defects.",
                ru: 'Предотвращение загрязнения продукта путем определения местоположения продукта, тем самым улучшая качество и предотвращая дефекты.'
            },
            legend: [
                { id: 'l1', label: '파지 위치',             labelEn: 'Contactable area',        labelRu: 'Контактная зона',  color: '#3b82f6' },
                { id: 'l2', label: '사출 도장 라인 파지 위치', labelEn: 'Contactable area (line)', labelRu: 'Контактная зона',  color: '#f59e0b' },
                { id: 'l3', label: '접촉 최소화(A면)',        labelEn: 'Minimize contact',        labelRu: 'Минимум контакта', color: '#ef4444' }
            ],
            notes: {
                ko: '* 단 로딩 공정은 안정적인 고정을 위한 지그 작업이 우선이므로 A면 접촉이 불가피하지만 접촉을 최소화 하여야 한다.',
                ru: '* Поскольку процесс загрузки начинается с работы кондуктора для стабильной фиксации, контакт со стороной А должен быть сведен к минимуму.'
            },
            sections: [
                {
                    id: 's1', label: '섹션 1',
                    products: [
                        { id: 'p1',  car: 'GOLF-7',    part: 'KNOB',        photo: _P('image24.png') },
                        { id: 'p2',  car: 'XFD',       part: 'KNOB',        photo: _P('image20.png') },
                        { id: 'p3',  car: 'XFD',       part: 'SEESAW',      photo: _P('image4.png')  },
                        { id: 'p4',  car: 'A3 / Q2',   part: 'KNOBS',       photo: _P('image7.png')  },
                        { id: 'p5',  car: 'A3 PA',     part: 'KNOBS',       photo: _P('image5.png')  },
                        { id: 'p6',  car: 'A3 / Q2',   part: 'PAO COVER',   photo: _P('image8.png')  }
                    ]
                },
                {
                    id: 's2', label: '섹션 2',
                    products: [
                        { id: 'p7',  car: 'T1XX',      part: 'LENS 하도 ①', photo: _P('image14.png') },
                        { id: 'p8',  car: 'T1XX',      part: 'LENS 하도 ②', photo: _P('image15.png') },
                        { id: 'p9',  car: 'J34A',      part: 'KNOBS LH/RH', photo: _P('image13.png') },
                        { id: 'p10', car: 'P702',      part: 'KNOB',        photo: _P('image2.png')  },
                        { id: 'p11', car: 'P702',      part: 'LENS',        photo: _P('image19.png') }
                    ]
                }
            ]
        };
    }

    function _defaultB() {
        return {
            id: KEY_B,
            line: 'B라인', process: '로딩', revision: 'Rev.00',
            purpose: {
                ko: '제품의 파지위치를 지정하여 제품의 오염을 방지하여 품질을 향상시키고 불량을 방지하기 위함',
                en: "To prevent contamination of the product by specifying the product's location, thereby improving quality and preventing defects.",
                ru: 'Предотвращение загрязнения продукта путем определения местоположения продукта, тем самым улучшая качество и предотвращая дефекты.'
            },
            legend: [
                { id: 'l1', label: '파지 위치',          labelEn: 'Contactable area',        labelRu: 'Контактная зона',  color: '#3b82f6' },
                { id: 'l2', label: '로딩 지그 누름 위치', labelEn: 'Loading jig press area',  labelRu: 'Контактная зона',  color: '#f59e0b' },
                { id: 'l3', label: '접촉 최소화(A면)',    labelEn: 'Minimize contact',        labelRu: 'Минимум контакта', color: '#ef4444' }
            ],
            notes: {
                ko: '* 단 로딩 공정은 안정적인 고정을 위한 지그 작업이 우선이므로 A면 접촉이 불가피하지만 접촉을 최소화 하여야 한다.',
                ru: '* Поскольку процесс загрузки начинается с работы кондуктора для стабильной фиксации, контакт со стороной А должен быть сведен к минимуму.'
            },
            sections: [
                {
                    id: 's1', label: '섹션 1',
                    products: [
                        { id: 'p1',  car: 'A8',        part: 'HOUSING',         photo: _P('image26.png') },
                        { id: 'p2',  car: 'A8',        part: 'UPPER CASE',      photo: _P('image27.png') },
                        { id: 'p3',  car: 'A8',        part: 'LOWER CASE',      photo: _P('image35.png') },
                        { id: 'p4',  car: 'A3 (PA)',   part: 'E-CALL KNOB',     photo: _P('image38.png') },
                        { id: 'p5',  car: 'A3',        part: 'LENS',            photo: _P('image32.png') },
                        { id: 'p6',  car: 'P702',      part: 'LENS',            photo: _P('image18.png') }
                    ]
                },
                {
                    id: 's2', label: '섹션 2',
                    products: [
                        { id: 'p7',  car: 'T1XX',      part: 'LENS UV',         photo: _P('image40.png') },
                        { id: 'p8',  car: 'T1XX',      part: 'P BUTTON CLEAR',  photo: _P('image42.png') },
                        { id: 'p9',  car: 'T1XX',      part: 'IL BUTTON',       photo: _P('image43.png') },
                        { id: 'p10', car: 'C223',      part: 'DECO HOR VANE',   photo: _P('image30.png') },
                        { id: 'p11', car: 'C223',      part: 'X VANE',          photo: _P('image52.png') },
                        { id: 'p12', car: 'C223',      part: 'DECO HOR VANE ②', photo: _P('image31.png') }
                    ]
                },
                {
                    id: 's3', label: '섹션 3',
                    products: [
                        { id: 'p13', car: 'T/G',       part: 'BADGE',           photo: _P('image54.png') },
                        { id: 'p14', car: 'T1XX',      part: 'DECO#1,2',        photo: _P('image46.png') },
                        { id: 'p15', car: '?',         part: '미확인',           photo: _P('image48.png') },
                        { id: 'p16', car: '?',         part: '미확인',           photo: _P('image44.png') },
                        { id: 'p17', car: '?',         part: '미확인',           photo: _P('image58.png') },
                        { id: 'p18', car: '?',         part: '미확인',           photo: _P('image50.png') }
                    ]
                }
            ]
        };
    }

    // ════════════════════════════════════════════════════════════════
    // 데이터 로드/저장
    // ════════════════════════════════════════════════════════════════
    function _migrateAssets(d) {
        const B64 = (window.STD_ASSETS_B64 || {})['paji-std'] || {};
        let dirty = false;
        const _fix = v => {
            if (v && typeof v === 'string' && v.startsWith('assets/paji-std/')) {
                const key = v.replace('assets/paji-std/', '');
                if (B64[key]) { dirty = true; return B64[key]; }
            }
            return v;
        };
        (d.sections || []).forEach(sec => {
            (sec.products || []).forEach(prod => { prod.photo = _fix(prod.photo); });
        });
        return dirty;
    }

    async function _loadData() {
        let a = Storage.getById(DATA_STORE, KEY_A);
        let b = Storage.getById(DATA_STORE, KEY_B);
        if (!a) { a = _defaultA(); await Storage.add(DATA_STORE, a).catch(() => {}); }
        if (!b) { b = _defaultB(); await Storage.add(DATA_STORE, b).catch(() => {}); }
        if (_migrateAssets(a)) await Storage.update(DATA_STORE, a).catch(() => {});
        if (_migrateAssets(b)) await Storage.update(DATA_STORE, b).catch(() => {});
        _dataA = a;
        _dataB = b;
    }

    function _currentData() { return _currentLine === 'A' ? _dataA : _dataB; }

    async function _save() {
        _collectEdits();
        const data = _currentData();
        data.savedAt = new Date().toISOString().slice(0, 10);
        try {
            await Storage.update(DATA_STORE, data);
            UIUtils.toast('저장되었습니다.', 'success');
        } catch (_) {
            try { await Storage.add(DATA_STORE, data); UIUtils.toast('저장되었습니다.', 'success'); }
            catch (e) { UIUtils.toast('저장 실패: ' + e.message, 'error'); }
        }
    }

    async function _reset() {
        UIUtils.confirm('기본값으로 초기화하시겠습니까? 저장된 내용이 모두 사라집니다.', async () => {
            const fresh = _currentLine === 'A' ? _defaultA() : _defaultB();
            if (_currentLine === 'A') _dataA = fresh; else _dataB = fresh;
            try { await Storage.update(DATA_STORE, fresh); }
            catch (_) { await Storage.add(DATA_STORE, fresh).catch(() => {}); }
            UIUtils.toast('초기화되었습니다.', 'success');
            _rerender();
        });
    }

    // ════════════════════════════════════════════════════════════════
    // Undo 히스토리
    // ════════════════════════════════════════════════════════════════
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
        const btn = document.getElementById('psUndoBtn');
        if (!btn) return;
        const cnt = _currentHistory().length;
        btn.disabled = cnt === 0;
        const badge = btn.querySelector('.ps-undo-cnt');
        if (badge) badge.textContent = cnt > 0 ? `(${cnt})` : '';
    }

    // ════════════════════════════════════════════════════════════════
    // 편집 내용 수집 (contenteditable → 데이터 구조 반영)
    // ════════════════════════════════════════════════════════════════
    function _collectEdits() {
        const data = _currentData();
        const container = document.getElementById('psWrap');
        if (!container || !data || !_editMode) return;

        container.querySelectorAll('.ps-ce[contenteditable="true"]').forEach(el => {
            const f   = el.dataset.field;
            const sid = el.dataset.sid;
            const pid = el.dataset.pid;
            const val = el.innerText.trim();

            if (f === 'line')        { data.line    = val; return; }
            if (f === 'process')     { data.process = val; return; }
            if (f === 'revision')    { data.revision= val; return; }
            if (f === 'purpose.ko')  { (data.purpose = data.purpose||{}).ko = val; return; }
            if (f === 'purpose.en')  { (data.purpose = data.purpose||{}).en = val; return; }
            if (f === 'purpose.ru')  { (data.purpose = data.purpose||{}).ru = val; return; }
            if (f === 'notes.ko')    { (data.notes   = data.notes  ||{}).ko = val; return; }
            if (f === 'notes.ru')    { (data.notes   = data.notes  ||{}).ru = val; return; }

            if (!sid) return;
            const sec = (data.sections||[]).find(s => s.id === sid);
            if (!sec) return;

            if (f === 'secLabel') { sec.label = val; return; }

            if (!pid) return;
            const prod = (sec.products||[]).find(p => p.id === pid);
            if (!prod) return;
            if (f === 'car')  prod.car  = val;
            if (f === 'part') prod.part = val;
        });

        // legend 편집
        container.querySelectorAll('.ps-ce[data-lid]').forEach(el => {
            const lid = el.dataset.lid;
            const f   = el.dataset.field;
            const leg = (data.legend||[]).find(l => l.id === lid);
            if (!leg) return;
            const val = el.innerText.trim();
            if (f === 'label')   leg.label   = val;
            if (f === 'labelEn') leg.labelEn = val;
            if (f === 'labelRu') leg.labelRu = val;
        });
    }

    // ════════════════════════════════════════════════════════════════
    // HTML 렌더링
    // ════════════════════════════════════════════════════════════════
    const _e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function CE(val, field, sid, pid) {
        if (!_editMode) return _e(val);
        const a = `data-field="${field}" data-sid="${sid||''}" data-pid="${pid||''}"`;
        return `<span class="ps-ce" contenteditable="true" ${a}>${_e(val)}</span>`;
    }
    function _CE(val, field) {
        if (!_editMode) return _e(val);
        return `<span class="ps-ce" contenteditable="true" data-field="${field}">${_e(val)}</span>`;
    }
    function _LE(val, field, lid) {
        if (!_editMode) return _e(val);
        return `<span class="ps-ce" contenteditable="true" data-field="${field}" data-lid="${lid}">${_e(val)}</span>`;
    }

    // ── 헤더 테이블 ────────────────────────────────────────────────
    function _renderHeader(data) {
        return `
        <table class="ps-tbl ps-tbl-hd">
          <tbody>
            <tr>
              <td rowspan="2" class="ps-logo-cell"><div class="ps-logo">KC<br>PAINT</div></td>
              <td class="ps-lbl-cell">제조 라인</td>
              <td class="ps-val-cell ps-line-val">${_CE(data.line,'line')}</td>
              <td rowspan="2" class="ps-title-cell">제품 파지 기준서</td>
              <td class="ps-sign-lbl">작성</td>
              <td class="ps-sign-lbl">검토</td>
              <td class="ps-sign-lbl">승인</td>
            </tr>
            <tr>
              <td class="ps-lbl-cell">적용 공정</td>
              <td class="ps-val-cell">${_CE(data.process,'process')}</td>
              <td class="ps-sign-box"></td>
              <td class="ps-sign-box"></td>
              <td class="ps-sign-box"></td>
            </tr>
            <tr>
              <td class="ps-lbl-cell" colspan="2" style="font-size:0.7rem;color:#6b7280;">문서번호</td>
              <td style="font-size:0.72rem;color:#6b7280;padding:3px 6px;">${_CE(data.revision,'revision')}</td>
              <td colspan="4"></td>
            </tr>
          </tbody>
        </table>`;
    }

    // ── 목적 테이블 ────────────────────────────────────────────────
    function _renderPurpose(data) {
        const p = data.purpose || {};
        return `
        <table class="ps-tbl ps-tbl-purpose">
          <tbody>
            <tr>
              <td class="ps-lbl-cell" rowspan="3" style="width:70px;font-size:0.78rem;">
                목&nbsp;&nbsp;적<br><span style="font-size:0.65rem;font-weight:400;color:#9ca3af;">Цель<br>Purpose</span>
              </td>
              <td class="ps-purpose-ko">${_CE(p.ko||'','purpose.ko')}</td>
            </tr>
            <tr><td class="ps-purpose-sub">${_CE(p.ru||'','purpose.ru')}</td></tr>
            <tr><td class="ps-purpose-sub" style="color:#1d4ed8;">${_CE(p.en||'','purpose.en')}</td></tr>
          </tbody>
        </table>`;
    }

    // ── 파지 기준 범례 ─────────────────────────────────────────────
    function _renderLegend(data) {
        const legend = data.legend || [];
        const cells = legend.map(l => `
            <td class="ps-legend-cell" style="position:relative;">
                <div class="ps-legend-dot" style="background:${_e(l.color)};"></div>
                <div class="ps-legend-txt">
                    <div class="ps-legend-ko">${_LE(l.label,'label',l.id)}</div>
                    <div class="ps-legend-sub">${_LE(l.labelEn,'labelEn',l.id)}</div>
                    <div class="ps-legend-sub">${_LE(l.labelRu,'labelRu',l.id)}</div>
                </div>
            </td>`).join('');
        return `
        <table class="ps-tbl ps-tbl-legend">
          <tbody>
            <tr>
              <td class="ps-lbl-cell" style="width:58px;font-size:0.73rem;font-weight:700;background:#fef9c3;">파지<br>기준</td>
              ${cells}
            </tr>
          </tbody>
        </table>`;
    }

    // ── 섹션 테이블 ────────────────────────────────────────────────
    function _renderSections(data) {
        return (data.sections || []).map((sec, si) => _renderSection(sec, si)).join('');
    }

    function _renderSection(sec, si) {
        const prods = sec.products || [];
        const colCount = prods.length;

        const addProdBtn = _editMode
            ? `<button class="ps-btn-add-prod" onclick="PajiStdModule.addProduct('${sec.id}')">＋ 제품 추가</button>`
            : '';
        const secLabelInner = _editMode
            ? `<span class="ps-ce" contenteditable="true" data-field="secLabel" data-sid="${sec.id}">${_e(sec.label)}</span>${addProdBtn}`
            : _e(sec.label);

        const secLabelRow = `<tr class="ps-sec-label">
            <td colspan="${colCount + 1}" style="position:relative;">${secLabelInner}</td>
        </tr>`;

        // 차종 행
        const carRow = `<tr class="ps-row-car">
            <td class="ps-rl">차종</td>
            ${prods.map(p => {
                const delBtn = _editMode
                    ? `<button class="ps-btn-del-prod" title="제품 삭제"
                           onclick="PajiStdModule.delProduct('${sec.id}','${p.id}')">✕</button>`
                    : '';
                return `<td class="ps-car" style="position:relative;">${CE(p.car,'car',sec.id,p.id)}${delBtn}</td>`;
            }).join('')}
        </tr>`;

        // 품명 행
        const partRow = `<tr class="ps-row-part">
            <td class="ps-rl">품명</td>
            ${prods.map(p => `<td class="ps-part">${CE(p.part,'part',sec.id,p.id)}</td>`).join('')}
        </tr>`;

        // 파지 구역 사진 행
        const photoRow = `<tr class="ps-row-photo">
            <td class="ps-rl">파지<br>구역</td>
            ${prods.map(p => {
                const src = p.photo;
                const imgHtml = src
                    ? `<img src="${_e(src)}" class="ps-img" alt="${_e(p.car)}"
                           onclick="PajiStdModule._zoomImg(this)"
                           onerror="this.parentNode.innerHTML='<div class=ps-no-img>이미지<br>없음</div>'">`
                    : `<div class="ps-no-img">사진<br>없음</div>`;
                const upBtn = _editMode
                    ? `<button class="ps-btn-photo"
                           onclick="PajiStdModule.uploadPhoto('${sec.id}','${p.id}')">
                           <span class="material-symbols-outlined" style="font-size:12px;">upload</span>
                       </button>` : '';
                return `<td class="ps-photo-td" style="position:relative;">${imgHtml}${upBtn}</td>`;
            }).join('')}
        </tr>`;

        return `<table class="ps-tbl ps-tbl-sec">
            <colgroup>
                <col style="width:58px">
                ${prods.map(() => '<col style="min-width:100px;max-width:160px;">').join('')}
            </colgroup>
            <tbody>${secLabelRow}${carRow}${partRow}${photoRow}</tbody>
        </table>`;
    }

    // ── 비고 (notes) 테이블 ───────────────────────────────────────
    function _renderNotes(data) {
        const n = data.notes || {};
        return `
        <table class="ps-tbl ps-tbl-notes">
          <tbody>
            <tr>
              <td class="ps-lbl-cell" rowspan="2" style="font-size:0.73rem;font-weight:700;width:58px;background:#fef9c3;">비&nbsp;&nbsp;고</td>
              <td class="ps-notes-ko">${_CE(n.ko||'','notes.ko')}</td>
            </tr>
            <tr><td class="ps-notes-sub">${_CE(n.ru||'','notes.ru')}</td></tr>
          </tbody>
        </table>`;
    }

    // ── 전체 문서 ─────────────────────────────────────────────────
    function _renderDoc(data) {
        return `
        <div class="ps-doc ${_editMode ? 'ps-edit-mode' : ''}">
            ${_renderHeader(data)}
            ${_renderPurpose(data)}
            ${_renderLegend(data)}
            ${_renderSections(data)}
            ${_renderNotes(data)}
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════
    // 편집 작업
    // ════════════════════════════════════════════════════════════════
    function addProduct(secId) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        if (!sec) return;
        _pushHistory();
        sec.products.push({ id: _uid(), car: '차종', part: '품명', photo: null });
        _rerender();
    }

    function delProduct(secId, pid) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        if (!sec || (sec.products||[]).length <= 1) {
            UIUtils.toast('최소 1개 제품이 필요합니다.', 'warning'); return;
        }
        _pushHistory();
        sec.products = sec.products.filter(p => p.id !== pid);
        _rerender();
    }

    function addSection() {
        _collectEdits();
        _pushHistory();
        const data = _currentData();
        data.sections.push({
            id: _uid(), label: '섹션 ' + (data.sections.length + 1),
            products: [{ id: _uid(), car: '차종', part: '품명', photo: null }]
        });
        _rerender();
    }

    function delSection(secId) {
        _collectEdits();
        const data = _currentData();
        if ((data.sections||[]).length <= 1) { UIUtils.toast('최소 1개 섹션이 필요합니다.', 'warning'); return; }
        _pushHistory();
        data.sections = data.sections.filter(s => s.id !== secId);
        _rerender();
    }

    function uploadPhoto(secId, pid) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                _collectEdits();
                const sec = (_currentData().sections||[]).find(s => s.id === secId);
                const prod = sec && (sec.products||[]).find(p => p.id === pid);
                if (prod) { _pushHistory(); prod.photo = ev.target.result; _rerender(); }
            };
            reader.readAsDataURL(file);
        };
        inp.click();
    }

    // ════════════════════════════════════════════════════════════════
    // UI 제어
    // ════════════════════════════════════════════════════════════════
    function _toggleEdit() {
        _collectEdits();
        _editMode = !_editMode;

        if (_editMode) {
            if (_currentLine === 'A') _historyA = []; else _historyB = [];
            _pushHistory();
            _kbListener = function (e) {
                if (!_editMode) return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    if (document.activeElement && document.activeElement.classList.contains('ps-ce')) return;
                    e.preventDefault();
                    _undo();
                }
            };
            document.addEventListener('keydown', _kbListener);
        } else {
            if (_currentLine === 'A') _historyA = []; else _historyB = [];
            if (_kbListener) { document.removeEventListener('keydown', _kbListener); _kbListener = null; }
        }

        document.getElementById('psEditBtn').className = _editMode ? 'btn btn-warning' : 'btn btn-outline';
        document.getElementById('psEditBtn').innerHTML = _editMode
            ? '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit_off</span> 편집 종료'
            : '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit</span> 편집';
        document.getElementById('psSaveBtn').style.display    = _editMode ? '' : 'none';
        document.getElementById('psResetBtn').style.display   = _editMode ? '' : 'none';
        document.getElementById('psUndoBtn').style.display    = _editMode ? '' : 'none';
        document.getElementById('psAddSecBtn').style.display  = _editMode ? '' : 'none';
        _rerender();
        if (_editMode) _updateUndoBtn();
    }

    function _switchLine(line) {
        if (line === _currentLine) return;
        if (_editMode) _collectEdits();
        _currentLine = line;
        document.getElementById('psBtnA').classList.toggle('active', line === 'A');
        document.getElementById('psBtnB').classList.toggle('active', line === 'B');
        _rerender();
        if (_editMode) _updateUndoBtn();
    }

    function _rerender() {
        const wrap = document.getElementById('psWrap');
        if (wrap) wrap.innerHTML = _renderDoc(_currentData());
    }

    function _zoomImg(el) {
        const existing = document.querySelector('.ps-zoom-overlay');
        if (existing) { existing.remove(); return; }
        const ov = document.createElement('div');
        ov.className = 'ps-zoom-overlay';
        ov.innerHTML = `<img src="${el.src}" style="max-width:92vw;max-height:92vh;object-fit:contain;border-radius:8px;">`;
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
    }

    function _print() {
        _collectEdits();
        const data = _currentData();
        const printWin = window.open('', '_blank', 'width=1200,height=900');
        const css = document.getElementById('ps-css') ? document.getElementById('ps-css').textContent : '';
        printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
            <title>제품 파지 기준서 - ${data.line}</title>
            <style>
                body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:11px;}
                ${css}
                .ps-btn-add-prod,.ps-btn-del-prod,.ps-btn-photo,.ps-btn-add-sec,.ps-btn-del-sec{display:none!important;}
                @media print{body{padding:0;} @page{size:A3 landscape;margin:10mm;}}
            </style></head><body>
            ${_renderDoc(data)}
            <script>window.onload=()=>window.print();<\/script>
        </body></html>`);
        printWin.document.close();
    }

    // ════════════════════════════════════════════════════════════════
    // CSS 주입
    // ════════════════════════════════════════════════════════════════
    function _injectCSS() {
        if (document.getElementById('ps-css')) return;
        const s = document.createElement('style');
        s.id = 'ps-css';
        s.textContent = `
/* ── 툴바 ─────────────────────────────── */
.ps-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--border-color,#e5e7eb);margin-bottom:14px;}
.ps-title-block{flex:1;min-width:200px;}
.ps-title-block h2{margin:0;font-size:1rem;font-weight:800;color:#166534;}
.ps-title-block p{margin:2px 0 0;font-size:0.73rem;color:#6b7280;}
.ps-line-btn{padding:6px 16px;border:1.5px solid #cbd5e1;border-radius:20px;background:#fff;font-weight:700;font-size:0.8rem;cursor:pointer;transition:all .15s;}
.ps-line-btn.active{background:#166534;color:#fff;border-color:#166534;}

/* ── 문서 래퍼 ────────────────────────── */
.ps-doc{overflow-x:auto;background:#fff;border:1px solid #94a3b8;border-radius:4px;}

/* ── 공통 테이블 ──────────────────────── */
.ps-tbl{border-collapse:collapse;width:100%;font-size:0.78rem;font-family:Arial,sans-serif;}
.ps-tbl td{border:1px solid #94a3b8;padding:4px 6px;vertical-align:middle;}
.ps-tbl-hd td{padding:5px 8px;}
.ps-tbl-purpose td{border-color:#cbd5e1;padding:3px 8px;}
.ps-tbl-legend td{border-color:#cbd5e1;}
.ps-tbl-notes td{border-color:#d1d5db;}
.ps-tbl-sec td{border:1px solid #94a3b8;}

/* ── 헤더 셀 ──────────────────────────── */
.ps-logo-cell{width:90px;text-align:center;border-right:2px solid #64748b!important;background:#f8fafc;}
.ps-logo{font-size:1rem;font-weight:900;color:#166534;letter-spacing:-0.5px;line-height:1.3;}
.ps-lbl-cell{width:66px;font-weight:700;font-size:0.75rem;background:#f1f5f9;text-align:center;white-space:nowrap;}
.ps-val-cell{min-width:60px;font-weight:700;}
.ps-line-val{color:#166534;font-weight:800;}
.ps-title-cell{text-align:center;font-size:1.05rem;font-weight:900;color:#166534;letter-spacing:0.5px;background:#f0fdf4;}
.ps-sign-lbl{width:52px;text-align:center;font-size:0.7rem;font-weight:700;background:#f8fafc;color:#374151;}
.ps-sign-box{height:36px;width:52px;}

/* ── 목적 셀 ──────────────────────────── */
.ps-purpose-ko{font-size:0.79rem;line-height:1.5;}
.ps-purpose-sub{font-size:0.72rem;color:#6b7280;line-height:1.4;}

/* ── 범례 ─────────────────────────────── */
.ps-legend-cell{padding:6px 10px!important;min-width:160px;}
.ps-legend-dot{width:18px;height:18px;border-radius:3px;display:inline-block;margin-right:8px;vertical-align:middle;flex-shrink:0;}
.ps-legend-txt{display:inline-block;vertical-align:middle;}
.ps-legend-ko{font-size:0.77rem;font-weight:700;color:#1f2937;}
.ps-legend-sub{font-size:0.68rem;color:#6b7280;line-height:1.3;}

/* ── 섹션 레이블 ──────────────────────── */
.ps-sec-label td{background:#166534;color:#fff;font-weight:700;font-size:0.73rem;letter-spacing:0.06em;padding:5px 10px!important;}

/* ── 행 레이블 ────────────────────────── */
.ps-rl{width:58px;min-width:50px;font-weight:700;font-size:0.72rem;text-align:center;background:#f1f5f9;color:#374151;line-height:1.4;white-space:nowrap;}

/* ── 차종 행 ──────────────────────────── */
.ps-car{background:#dcfce7;font-weight:800;font-size:0.82rem;text-align:center;color:#166534;padding:5px 4px!important;position:relative;}

/* ── 품명 행 ──────────────────────────── */
.ps-part{background:#f0fdf4;font-weight:600;text-align:center;color:#15803d;font-size:0.77rem;padding:5px 4px!important;}

/* ── 사진 셀 ──────────────────────────── */
.ps-photo-td{text-align:center;padding:4px!important;height:150px;position:relative;min-width:100px;}
.ps-img{max-width:100%;max-height:145px;object-fit:contain;display:block;margin:0 auto;cursor:zoom-in;}
.ps-no-img{height:100px;display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:0.68rem;border:1px dashed #e5e7eb;border-radius:4px;background:#fafafa;line-height:1.5;text-align:center;}

/* ── 비고 ─────────────────────────────── */
.ps-notes-ko{font-size:0.8rem;padding:5px 10px!important;}
.ps-notes-sub{font-size:0.73rem;color:#6b7280;padding:4px 10px!important;}

/* ── 편집 span (.ps-ce) ───────────────── */
.ps-ce{display:inline;outline:none;cursor:text;white-space:pre-wrap;word-break:break-word;}
.ps-edit-mode .ps-ce{border-bottom:1.5px dashed rgba(22,101,52,0.6);}
.ps-edit-mode .ps-ce:focus{background:rgba(22,101,52,0.07);border-radius:2px;outline:none;}
.ps-edit-mode .ps-ce:empty::before{content:'입력';color:#d1d5db;font-style:italic;}
.ps-car .ps-ce,.ps-part .ps-ce{display:block;width:100%;text-align:center;}
.ps-val-cell .ps-ce{display:inline-block;min-width:60px;}
.ps-purpose-ko .ps-ce,.ps-purpose-sub .ps-ce{display:block;width:100%;}
.ps-notes-ko .ps-ce,.ps-notes-sub .ps-ce{display:block;width:100%;}
.ps-legend-ko .ps-ce,.ps-legend-sub .ps-ce{display:inline;}

/* ── 편집 버튼들 ──────────────────────── */
.ps-btn-add-prod{float:right;padding:2px 8px;font-size:0.71rem;background:rgba(255,255,255,0.18);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:4px;cursor:pointer;font-weight:600;}
.ps-btn-add-prod:hover{background:rgba(255,255,255,0.32);}
.ps-btn-del-prod{position:absolute;top:2px;right:2px;width:16px;height:16px;padding:0;font-size:0.6rem;line-height:16px;text-align:center;background:#ef4444;color:#fff;border:none;border-radius:3px;cursor:pointer;z-index:5;}
.ps-btn-photo{position:absolute;bottom:4px;right:4px;padding:3px 6px;font-size:0.65rem;background:rgba(22,101,52,0.8);color:#fff;border:none;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:2px;z-index:5;}
.ps-btn-photo:hover{background:#166534;}

/* ── 뒤로가기(Undo) 버튼 ──────────────── */
.ps-undo-btn:disabled{opacity:0.38;cursor:not-allowed;}
.ps-undo-btn:not(:disabled){border-color:#f59e0b;color:#b45309;}
.ps-undo-btn:not(:disabled):hover{background:#fef3c7;}
.ps-undo-cnt{font-size:0.7rem;color:#9ca3af;font-weight:400;min-width:1em;display:inline-block;}

/* ── 이미지 확대 오버레이 ─────────────── */
.ps-zoom-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;}
        `;
        document.head.appendChild(s);
    }

    // ════════════════════════════════════════════════════════════════
    // 페이지 초기화
    // ════════════════════════════════════════════════════════════════
    async function init(container) {
        _editMode = false;
        _currentLine = 'A';
        _injectCSS();

        container.innerHTML = `
        <div style="padding:16px 20px;">
            <div class="ps-toolbar">
                <div class="ps-title-block">
                    <h2>제품 파지 기준서</h2>
                    <p>로딩 공정 파지 위치 기준 — 편집 및 저장 가능 / 클릭 시 이미지 확대</p>
                </div>
                <button class="ps-line-btn active" id="psBtnA" onclick="PajiStdModule._switchLine('A')">🅰 A라인</button>
                <button class="ps-line-btn" id="psBtnB" onclick="PajiStdModule._switchLine('B')">🅱 B라인</button>
                <button class="btn btn-outline" id="psEditBtn" onclick="PajiStdModule._toggleEdit()">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit</span> 편집
                </button>
                <button class="btn btn-success" id="psSaveBtn" style="display:none;" onclick="PajiStdModule._save()">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">save</span> 저장
                </button>
                <button class="btn btn-outline ps-undo-btn" id="psUndoBtn" style="display:none;" disabled
                    onclick="PajiStdModule._undo()" title="되돌리기 (Ctrl+Z)">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">undo</span> 되돌리기 <span class="ps-undo-cnt"></span>
                </button>
                <button class="btn btn-outline" id="psAddSecBtn" style="display:none;font-size:0.78rem;"
                    onclick="PajiStdModule.addSection()">＋ 섹션</button>
                <button class="btn btn-danger" id="psResetBtn" style="display:none;font-size:0.78rem;"
                    onclick="PajiStdModule._reset()">초기화</button>
                <button class="btn btn-outline" onclick="PajiStdModule._print()" title="인쇄/PDF">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">print</span>
                </button>
            </div>
            <div id="psWrap"></div>
        </div>`;

        await _loadData();
        _rerender();
    }

    return {
        render: init,
        init,
        _toggleEdit, _switchLine,
        _save, _reset, _undo,
        _print, _zoomImg,
        addProduct, delProduct,
        addSection, delSection,
        uploadPhoto
    };
})();
