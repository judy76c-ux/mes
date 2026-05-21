/**
 * 사출품 COLOR 기준서 (InjectColorStdModule)
 * 엑셀 레이아웃 기반 편집 가능한 사출컬러 기준 문서
 */
var InjectColorStdModule = (function () {
    'use strict';

    const DATA_STORE = DB.STORES.INJECT_COLOR_STD_DATA;
    const KEY_A = 'A_LINE';
    const KEY_B = 'B_LINE';

    let _editMode = false;
    let _currentLine = 'A';
    let _dataA = null;
    let _dataB = null;

    // ════════════════════════════════════════════════════════════════
    // 기본 데이터 (엑셀에서 추출)
    // ════════════════════════════════════════════════════════════════
    const _P = p => p ? 'assets/inject-color-std/' + p : null;
    const _uid = () => '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    function _defaultA() {
        return {
            id: KEY_A,
            line: 'A라인', process: '로딩', revision: 'Rev. 241120',
            purpose: {
                ko: '도장 컬러별 도장 적합성인 은폐력 및 색차 기준을 맞추기 위함.',
                ru: 'Для соответствия стандартам укрывистости и цветового различия для каждого цвета краски.',
                en: 'To meet the standards of hiding power and color difference for each paint color.'
            },
            action: {
                ko: '계획과 상이한 사출 컬러시 라인 정지 후 관리자 통보 후 조치 기준에 맞는 컬러로 사출물을 투입한다.',
                ru: 'При несоответствии цвета литья плану линия останавливается, уведомляется руководитель, затем вводится материал нужного цвета.',
                en: 'If the injection color differs from the plan, the line stops, the manager is notified, and the correct color is used.'
            },
            sections: [
                {
                    id: 's1', label: '섹션 1',
                    groups: [
                        { id: 'g1', car: 'GOLF7', part: 'KNOB류', colors: [
                            { id: 'c1', paint: 'WHI',     inject: 'DYS QAW', photo: _P('image4.png') },
                            { id: 'c2', paint: 'WHITE',   inject: 'GRAY',    photo: _P('image6.png') }
                        ]},
                        { id: 'g2', car: 'XFD', part: '1,3 SPOT', colors: [
                            { id: 'c3', paint: 'BLACK',   inject: 'GRAY',    photo: _P('image7.png') },
                            { id: 'c4', paint: 'WHITE',   inject: 'GRAY',    photo: _P('image8.png') }
                        ]},
                        { id: 'g3', car: 'A3 / A3 PA', part: 'Knob류', colors: [
                            { id: 'c5', paint: '6PS(AZ3)',inject: 'AZ3',     photo: _P('image3.png') },
                            { id: 'c6', paint: 'WHITE',   inject: 'WHITE',   photo: null }
                        ]},
                        { id: 'g4', car: 'Q2', part: 'KNOB류', colors: [
                            { id: 'c7', paint: 'BC5(ET1)',inject: 'ET1',     photo: _P('image5.png') },
                            { id: 'c8', paint: 'S/M GRAY',inject: 'S/M GRAY',photo: null }
                        ]},
                        { id: 'g5', car: 'A3 / A3 PA', part: 'PAO COVER', colors: [
                            { id: 'c9', paint: '6PS(AZ3)',inject: 'AZ3',     photo: _P('image10.png') },
                            { id: 'c10',paint: 'WHITE',   inject: 'WHITE',   photo: null }
                        ]},
                        { id: 'g6', car: 'Q2', part: 'PAO COVER', colors: [
                            { id: 'c11',paint: 'BC5(ET1)',inject: 'ET1',     photo: _P('image11.png') },
                            { id: 'c12',paint: 'S/M GRAY',inject: 'S/M GRAY',photo: null }
                        ]}
                    ]
                },
                {
                    id: 's2', label: '섹션 2',
                    groups: [
                        { id: 'g7', car: 'T1XX', part: 'Lens', colors: [
                            { id: 'c13',paint: 'BLACK',   inject: '',        photo: _P('image13.png') },
                            { id: 'c14',paint: 'CLEAR/BK',inject: '',        photo: null }
                        ]},
                        { id: 'g8', car: 'T1XX', part: 'P-BUTTON', colors: [
                            { id: 'c15',paint: 'BLACK',   inject: '',        photo: _P('image12.png') },
                            { id: 'c16',paint: 'WHITE',   inject: '',        photo: null }
                        ]},
                        { id: 'g9', car: 'P702', part: 'M-BUTTON', colors: [
                            { id: 'c17',paint: 'BLACK',   inject: '',        photo: _P('image15.png') },
                            { id: 'c18',paint: 'white',   inject: '',        photo: null }
                        ]},
                        { id: 'g10',car: 'P702', part: 'LENS', colors: [
                            { id: 'c19',paint: 'BLACK',   inject: '',        photo: _P('image14.png') },
                            { id: 'c20',paint: 'WHITE',   inject: '',        photo: null }
                        ]},
                        { id: 'g11',car: 'J34A', part: 'LH, RH', colors: [
                            { id: 'c21',paint: '02 WHITE',inject: '',        photo: _P('image18.png') },
                            { id: 'c22',paint: '750 GRAY',inject: '',        photo: _P('image9.png')  },
                            { id: 'c23',paint: 'WHITE',   inject: '',        photo: null },
                            { id: 'c24',paint: 'S/M GRAY',inject: '',        photo: null }
                        ]}
                    ]
                }
            ]
        };
    }

    function _defaultB() {
        return {
            id: KEY_B,
            line: 'B라인', process: '로딩', revision: 'Rev. 241120',
            purpose: {
                ko: '도장 컬러별 도장 적합성인 은폐력 및 색차 기준을 맞추기 위함.',
                ru: 'Для соответствия стандартам укрывистости и цветового различия для каждого цвета краски.',
                en: 'To meet the standards of hiding power and color difference for each paint color.'
            },
            action: {
                ko: '계획과 상이한 사출 컬러시 라인 정지 후 관리자 통보 후 조치 기준에 맞는 컬러로 사출물을 투입한다.',
                ru: 'При несоответствии цвета литья плану линия останавливается, уведомляется руководитель, затем вводится материал нужного цвета.',
                en: 'If the injection color differs from the plan, the line stops, the manager is notified, and the correct color is used.'
            },
            sections: [
                {
                    id: 's1', label: '섹션 1',
                    groups: [
                        { id: 'g1', car: 'A8', part: 'HOUSING', colors: [
                            { id: 'c1', paint: '1PH', inject: 'GRAY',  photo: _P('image24.png') },
                            { id: 'c2', paint: '6PS', inject: 'BLACK', photo: _P('image25.png') },
                            { id: 'c3', paint: '1KF', inject: 'BEIGE', photo: _P('image28.png') }
                        ]},
                        { id: 'g2', car: 'A8', part: 'UPPER CASE', colors: [
                            { id: 'c4', paint: '1PH', inject: 'GRAY',  photo: _P('image22.png') },
                            { id: 'c5', paint: '6PS', inject: 'BLACK', photo: _P('image27.png') },
                            { id: 'c6', paint: '1KF', inject: 'BEIGE', photo: _P('image29.png') }
                        ]},
                        { id: 'g3', car: 'A8', part: 'LOWER CASE', colors: [
                            { id: 'c7', paint: '1PH', inject: 'GRAY',  photo: _P('image23.png') },
                            { id: 'c8', paint: '6PS', inject: 'BLACK', photo: _P('image26.png') },
                            { id: 'c9', paint: '1KF', inject: 'BEIGE', photo: _P('image30.png') }
                        ]},
                        { id: 'g4', car: 'A3', part: 'E-CALL COVER', colors: [
                            { id: 'c10',paint: '6PS', inject: 'RED',   photo: _P('image32.png') },
                            { id: 'c11',paint: 'AZ3', inject: 'RED',   photo: null },
                            { id: 'c12',paint: 'BC5', inject: 'RED',   photo: null },
                            { id: 'c13',paint: 'ET1', inject: 'RED',   photo: null }
                        ]},
                        { id: 'g5', car: 'A3', part: 'PA E-CALL COVER', colors: [
                            { id: 'c14',paint: 'BC5', inject: 'RED',   photo: _P('image21.png') },
                            { id: 'c15',paint: 'ET1', inject: 'RED',   photo: null }
                        ]},
                        { id: 'g6', car: 'Q2', part: 'E-CALL COVER', colors: [
                            { id: 'c16',paint: 'BC5', inject: 'RED',   photo: null },
                            { id: 'c17',paint: 'ET1', inject: 'RED',   photo: null }
                        ]}
                    ]
                },
                {
                    id: 's2', label: '섹션 2',
                    groups: [
                        { id: 'g7', car: 'A3, Q2', part: 'LENS', colors: [
                            { id: 'c18',paint: '투명(CLEAR)',inject: '', photo: _P('image20.png') }
                        ]},
                        { id: 'g8', car: 'T1XX', part: 'IL-BUTTON', colors: [
                            { id: 'c19',paint: 'BLACK',    inject: '', photo: _P('image19.png') }
                        ]},
                        { id: 'g9', car: 'CHEVY / GMC', part: 'EMBLEM', colors: [
                            { id: 'c20',paint: 'BLACK',    inject: '', photo: _P('image31.png') }
                        ]}
                    ]
                }
            ]
        };
    }

    // ════════════════════════════════════════════════════════════════
    // 데이터 로드/저장
    // ════════════════════════════════════════════════════════════════
    async function _loadData() {
        let a = Storage.getById(DATA_STORE, KEY_A);
        let b = Storage.getById(DATA_STORE, KEY_B);
        if (!a) { a = _defaultA(); await Storage.add(DATA_STORE, a).catch(() => {}); }
        if (!b) { b = _defaultB(); await Storage.add(DATA_STORE, b).catch(() => {}); }
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
            try { await Storage.update(DATA_STORE, fresh); } catch (_) { await Storage.add(DATA_STORE, fresh).catch(()=>{}); }
            UIUtils.toast('초기화되었습니다.', 'success');
            _rerender();
        });
    }

    // ════════════════════════════════════════════════════════════════
    // 편집 내용 수집 (contenteditable → 데이터 구조 반영)
    // ════════════════════════════════════════════════════════════════
    function _collectEdits() {
        const data = _currentData();
        const container = document.getElementById('icsWrap');
        if (!container || !data || !_editMode) return;

        container.querySelectorAll('[contenteditable="true"]').forEach(el => {
            const f   = el.dataset.field;
            const sid = el.dataset.sid;
            const gid = el.dataset.gid;
            const cid = el.dataset.cid;
            const val = el.innerText.trim();

            if (f === 'line')       { data.line    = val; return; }
            if (f === 'process')    { data.process = val; return; }
            if (f === 'revision')   { data.revision= val; return; }
            if (f === 'purpose.ko') { (data.purpose = data.purpose||{}).ko = val; return; }
            if (f === 'purpose.ru') { (data.purpose = data.purpose||{}).ru = val; return; }
            if (f === 'purpose.en') { (data.purpose = data.purpose||{}).en = val; return; }
            if (f === 'action.ko')  { (data.action  = data.action ||{}).ko = val; return; }
            if (f === 'action.ru')  { (data.action  = data.action ||{}).ru = val; return; }
            if (f === 'action.en')  { (data.action  = data.action ||{}).en = val; return; }

            if (!sid) return;
            const sec = (data.sections||[]).find(s => s.id === sid);
            if (!sec) return;

            if (f === 'secLabel') { sec.label = val; return; }

            const grp = (sec.groups||[]).find(g => g.id === gid);
            if (!grp) return;

            if (f === 'car')  { grp.car  = val; return; }
            if (f === 'part') { grp.part = val; return; }

            if (!cid) return;
            const clr = (grp.colors||[]).find(c => c.id === cid);
            if (!clr) return;
            if (f === 'paint')  clr.paint  = val;
            if (f === 'inject') clr.inject = val;
        });
    }

    // ════════════════════════════════════════════════════════════════
    // HTML 렌더링
    // ════════════════════════════════════════════════════════════════
    const _e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    function _ce(val, attrs) {
        // contenteditable cell span
        const ea = _editMode ? ' contenteditable="true"' : '';
        return `<span class="ics-txt"${ea} ${attrs||''}>${_e(val)}</span>`;
    }

    // ── 문서 헤더 ──────────────────────────────────────────────────
    function _renderHeader(data) {
        const ea = _editMode ? ' contenteditable="true"' : '';
        return `
        <table class="ics-tbl ics-tbl-hd">
          <tbody>
            <tr>
              <td rowspan="2" class="ics-logo-cell">
                <div class="ics-logo">KC<br>PAINT</div>
              </td>
              <td class="ics-lbl-cell">제조라인</td>
              <td class="ics-val-cell ics-line-val"${ea} data-field="line">${_e(data.line)}</td>
              <td rowspan="2" class="ics-title-cell">사출품 COLOR 기준서</td>
              <td class="ics-sign-lbl">작성</td>
              <td class="ics-sign-lbl">검토</td>
              <td class="ics-sign-lbl">승인</td>
            </tr>
            <tr>
              <td class="ics-lbl-cell">공&nbsp;&nbsp;정</td>
              <td class="ics-val-cell"${ea} data-field="process">${_e(data.process)}</td>
              <td class="ics-sign-box"></td>
              <td class="ics-sign-box"></td>
              <td class="ics-sign-box"></td>
            </tr>
            <tr>
              <td class="ics-lbl-cell" colspan="2" style="font-size:0.7rem;color:#6b7280;">문서번호</td>
              <td${ea} data-field="revision" style="font-size:0.72rem;color:#6b7280;padding:3px 6px;">${_e(data.revision)}</td>
              <td colspan="4"></td>
            </tr>
          </tbody>
        </table>`;
    }

    // ── 목적 ──────────────────────────────────────────────────────
    function _renderPurpose(data) {
        const ea = _editMode ? ' contenteditable="true"' : '';
        const p = data.purpose || {};
        return `
        <table class="ics-tbl ics-tbl-purpose">
          <tbody>
            <tr>
              <td class="ics-lbl-cell" rowspan="3" style="width:70px;font-size:0.78rem;">목&nbsp;&nbsp;적<br><span style="font-size:0.65rem;font-weight:400;color:#9ca3af;">Цель<br>Purpose</span></td>
              <td${ea} data-field="purpose.ko" class="ics-purpose-ko">${_e(p.ko||'')}</td>
            </tr>
            <tr><td${ea} data-field="purpose.ru" class="ics-purpose-sub">${_e(p.ru||'')}</td></tr>
            <tr><td${ea} data-field="purpose.en" class="ics-purpose-sub" style="color:#1d4ed8;">${_e(p.en||'')}</td></tr>
          </tbody>
        </table>`;
    }

    // ── 섹션 테이블 ────────────────────────────────────────────────
    function _renderSections(data) {
        return (data.sections || []).map((sec, si) => _renderSection(sec, si, data)).join('');
    }

    function _renderSection(sec, si, data) {
        const groups = sec.groups || [];
        const ea = _editMode ? ' contenteditable="true"' : '';

        // 차종 merge: 연속된 동일 차종은 colspan 합산
        const carMerges = [];
        groups.forEach(g => {
            const cnt = (g.colors||[]).length;
            const last = carMerges[carMerges.length - 1];
            if (last && last.car === g.car) { last.span += cnt; last.gids.push(g.id); }
            else carMerges.push({ car: g.car, span: cnt, gid: g.id, gids: [g.id] });
        });

        // 행 생성 helper
        const ROW_LABEL = (txt, rowspan) =>
            `<td class="ics-rl" ${rowspan > 1 ? `rowspan="${rowspan}"` : ''}>${txt}</td>`;

        // ── 차종 행
        const carRow = `<tr class="ics-row-car">
            ${ROW_LABEL('차종')}
            ${carMerges.map(m =>
                `<td colspan="${m.span}" class="ics-car"${ea} data-field="car" data-sid="${sec.id}" data-gid="${m.gid}">${_e(m.car)}</td>`
            ).join('')}
            ${_editMode ? `<td class="ics-edit-action-col" rowspan="5">
                <button class="ics-btn-add-grp" onclick="InjectColorStdModule.addGroup('${sec.id}')">+ 그룹</button>
            </td>` : ''}
        </tr>`;

        // ── 품명 행
        const partRow = `<tr class="ics-row-part">
            ${ROW_LABEL('품명')}
            ${groups.map(g => {
                const cnt = (g.colors||[]).length;
                const delBtn = _editMode
                    ? `<button class="ics-btn-del-grp" title="그룹 삭제"
                         onclick="InjectColorStdModule.delGroup('${sec.id}','${g.id}')">✕</button>`
                    : '';
                return `<td colspan="${cnt}" class="ics-part" ${ea} data-field="part" data-sid="${sec.id}" data-gid="${g.id}">${_e(g.part)}${delBtn}</td>`;
            }).join('')}
        </tr>`;

        // ── 사진 행
        const photoRow = `<tr class="ics-row-photo">
            ${ROW_LABEL('사진')}
            ${groups.flatMap(g =>
                (g.colors||[]).map(c => {
                    const src = c.photo;
                    const imgHtml = src
                        ? `<img src="${_e(src)}" class="ics-img"
                               alt="${_e(c.paint)}"
                               onclick="InjectColorStdModule._zoomImg(this)"
                               onerror="this.parentNode.innerHTML='<div class=ics-no-img>이미지<br>없음</div>'">`
                        : `<div class="ics-no-img">사진<br>없음</div>`;
                    const upBtn = _editMode
                        ? `<button class="ics-btn-photo"
                               onclick="InjectColorStdModule.uploadPhoto('${sec.id}','${g.id}','${c.id}')">
                               <span class="material-symbols-outlined" style="font-size:13px;">upload</span>
                           </button>` : '';
                    return `<td class="ics-photo-td">${imgHtml}${upBtn}</td>`;
                })
            ).join('')}
        </tr>`;

        // ── 도장COLOR 행
        const paintRow = `<tr class="ics-row-paint">
            ${ROW_LABEL('도장<br>COLOR')}
            ${groups.flatMap(g =>
                (g.colors||[]).map((c, ci) => {
                    const addBtn = _editMode && ci === (g.colors||[]).length - 1
                        ? `<button class="ics-btn-add-clr"
                               onclick="InjectColorStdModule.addColor('${sec.id}','${g.id}')">+</button>` : '';
                    const delBtn = _editMode && (g.colors||[]).length > 1
                        ? `<button class="ics-btn-del-clr"
                               onclick="InjectColorStdModule.delColor('${sec.id}','${g.id}','${c.id}')">✕</button>` : '';
                    return `<td class="ics-paint" ${ea}
                                data-field="paint" data-sid="${sec.id}" data-gid="${g.id}" data-cid="${c.id}"
                            >${_e(c.paint)}${delBtn}${addBtn}</td>`;
                })
            ).join('')}
        </tr>`;

        // ── 사출컬러 행
        const injectRow = `<tr class="ics-row-inject">
            ${ROW_LABEL('사출<br>컬러')}
            ${groups.flatMap(g =>
                (g.colors||[]).map(c =>
                    `<td class="ics-inject" ${ea}
                         data-field="inject" data-sid="${sec.id}" data-gid="${g.id}" data-cid="${c.id}"
                     >${_e(c.inject)}</td>`
                )
            ).join('')}
        </tr>`;

        // 섹션 레이블 행 (구분선)
        const totalCols = groups.reduce((s, g) => s + (g.colors||[]).length, 0);
        const labelEa = _editMode ? ` contenteditable="true"` : '';
        const secLabel = `<tr class="ics-sec-label">
            <td colspan="${totalCols + 1 + (_editMode ? 1 : 0)}"${labelEa}
                data-field="secLabel" data-sid="${sec.id}">${_e(sec.label)}</td>
        </tr>`;

        return `<table class="ics-tbl ics-tbl-sec">
            <colgroup>
                <col style="width:60px">
                ${groups.flatMap(g => (g.colors||[]).map(() => '<col>')).join('')}
                ${_editMode ? '<col style="width:60px">' : ''}
            </colgroup>
            <tbody>${secLabel}${carRow}${partRow}${photoRow}${paintRow}${injectRow}</tbody>
        </table>`;
    }

    // ── 부적합시 조치사항 ──────────────────────────────────────────
    function _renderAction(data) {
        const ea = _editMode ? ' contenteditable="true"' : '';
        const a = data.action || {};
        return `
        <table class="ics-tbl ics-tbl-action">
          <tbody>
            <tr>
              <td class="ics-rl ics-action-lbl" rowspan="3">부적합시<br>조치사항<br><span style="font-size:0.62rem;font-weight:400;color:#9ca3af;">Меры<br>Actions</span></td>
              <td${ea} data-field="action.ko" class="ics-action-ko">${_e(a.ko||'')}</td>
            </tr>
            <tr><td${ea} data-field="action.ru" class="ics-action-sub">${_e(a.ru||'')}</td></tr>
            <tr><td${ea} data-field="action.en" class="ics-action-sub" style="color:#1d4ed8;">${_e(a.en||'')}</td></tr>
          </tbody>
        </table>`;
    }

    // ── 전체 문서 ─────────────────────────────────────────────────
    function _renderDoc(data) {
        return `
        <div class="ics-doc ${_editMode ? 'ics-edit-mode' : ''}">
            ${_renderHeader(data)}
            ${_renderPurpose(data)}
            ${_renderSections(data)}
            ${_renderAction(data)}
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════
    // 편집 작업
    // ════════════════════════════════════════════════════════════════
    function addGroup(secId) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        if (!sec) return;
        sec.groups.push({ id: _uid(), car: '차종', part: '품명',
            colors: [{ id: _uid(), paint: '도장COLOR', inject: '사출컬러', photo: null }] });
        _rerender();
    }

    function delGroup(secId, gid) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        if (!sec || (sec.groups||[]).length <= 1) { UIUtils.toast('최소 1개 그룹이 필요합니다.', 'warning'); return; }
        sec.groups = sec.groups.filter(g => g.id !== gid);
        _rerender();
    }

    function addColor(secId, gid) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        const grp = sec && (sec.groups||[]).find(g => g.id === gid);
        if (!grp) return;
        grp.colors.push({ id: _uid(), paint: '도장COLOR', inject: '사출컬러', photo: null });
        _rerender();
    }

    function delColor(secId, gid, cid) {
        _collectEdits();
        const sec = (_currentData().sections||[]).find(s => s.id === secId);
        const grp = sec && (sec.groups||[]).find(g => g.id === gid);
        if (!grp || (grp.colors||[]).length <= 1) { UIUtils.toast('최소 1개 컬러가 필요합니다.', 'warning'); return; }
        grp.colors = grp.colors.filter(c => c.id !== cid);
        _rerender();
    }

    function uploadPhoto(secId, gid, cid) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                _collectEdits();
                const sec = (_currentData().sections||[]).find(s => s.id === secId);
                const grp = sec && (sec.groups||[]).find(g => g.id === gid);
                const clr = grp && (grp.colors||[]).find(c => c.id === cid);
                if (clr) { clr.photo = ev.target.result; _rerender(); }
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
        document.getElementById('icsEditBtn').className = _editMode ? 'btn btn-warning' : 'btn btn-outline';
        document.getElementById('icsEditBtn').innerHTML = _editMode
            ? '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit_off</span> 편집 종료'
            : '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit</span> 편집';
        document.getElementById('icsSaveBtn').style.display = _editMode ? '' : 'none';
        document.getElementById('icsResetBtn').style.display = _editMode ? '' : 'none';
        _rerender();
    }

    function _switchLine(line) {
        if (line === _currentLine) return;
        if (_editMode) _collectEdits();
        _currentLine = line;
        document.getElementById('icsBtnA').classList.toggle('active', line === 'A');
        document.getElementById('icsBtnB').classList.toggle('active', line === 'B');
        _rerender();
    }

    function _rerender() {
        const wrap = document.getElementById('icsWrap');
        if (wrap) wrap.innerHTML = _renderDoc(_currentData());
    }

    function _zoomImg(el) {
        const existing = document.querySelector('.ics-zoom-overlay');
        if (existing) { existing.remove(); return; }
        const ov = document.createElement('div');
        ov.className = 'ics-zoom-overlay';
        ov.innerHTML = `<img src="${el.src}" style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;">`;
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
    }

    function _print() {
        _collectEdits();
        const data = _currentData();
        const printWin = window.open('', '_blank', 'width=1100,height=800');
        const css = document.getElementById('ics-css') ? document.getElementById('ics-css').textContent : '';
        printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
            <title>사출컬러 기준서 - ${data.line}</title>
            <style>
                body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:11px;}
                ${css}
                .ics-btn-add-grp,.ics-btn-del-grp,.ics-btn-add-clr,.ics-btn-del-clr,.ics-btn-photo{display:none!important;}
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
        if (document.getElementById('ics-css')) return;
        const s = document.createElement('style');
        s.id = 'ics-css';
        s.textContent = `
/* ── 툴바 ─────────────────────────────── */
.ics-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--border-color,#e5e7eb);margin-bottom:14px;}
.ics-title-block{flex:1;min-width:200px;}
.ics-title-block h2{margin:0;font-size:1rem;font-weight:800;color:#1e3a8a;}
.ics-title-block p{margin:2px 0 0;font-size:0.73rem;color:#6b7280;}
.ics-line-btn{padding:6px 16px;border:1.5px solid #cbd5e1;border-radius:20px;background:#fff;font-weight:700;font-size:0.8rem;cursor:pointer;transition:all .15s;}
.ics-line-btn.active{background:#1e40af;color:#fff;border-color:#1e40af;}

/* ── 문서 래퍼 ────────────────────────── */
.ics-doc{overflow-x:auto;background:#fff;border:1px solid #94a3b8;border-radius:4px;}

/* ── 공통 테이블 ──────────────────────── */
.ics-tbl{border-collapse:collapse;width:100%;font-size:0.78rem;font-family:Arial,sans-serif;}
.ics-tbl td{border:1px solid #94a3b8;padding:4px 6px;vertical-align:middle;}
.ics-tbl-hd td{padding:5px 8px;}
.ics-tbl-purpose td{border-color:#cbd5e1;padding:3px 8px;}
.ics-tbl-action td{border-color:#d1d5db;}
.ics-tbl-sec td{border:1px solid #94a3b8;}

/* ── 헤더 셀 ──────────────────────────── */
.ics-logo-cell{width:90px;text-align:center;border-right:2px solid #64748b!important;background:#f8fafc;}
.ics-logo{font-size:1rem;font-weight:900;color:#1e40af;letter-spacing:-0.5px;line-height:1.3;}
.ics-lbl-cell{width:66px;font-weight:700;font-size:0.75rem;background:#f1f5f9;text-align:center;white-space:nowrap;}
.ics-val-cell{min-width:60px;font-weight:700;}
.ics-line-val{color:#1e3a8a;font-weight:800;}
.ics-title-cell{text-align:center;font-size:1.05rem;font-weight:900;color:#1e3a8a;letter-spacing:0.5px;background:#eff6ff;}
.ics-sign-lbl{width:52px;text-align:center;font-size:0.7rem;font-weight:700;background:#f8fafc;color:#374151;}
.ics-sign-box{height:36px;width:52px;}

/* ── 목적 셀 ──────────────────────────── */
.ics-purpose-ko{font-size:0.79rem;line-height:1.5;}
.ics-purpose-sub{font-size:0.72rem;color:#6b7280;line-height:1.4;}

/* ── 섹션 레이블 ──────────────────────── */
.ics-sec-label td{background:#1e3a8a;color:#fff;font-weight:700;font-size:0.73rem;letter-spacing:0.06em;padding:5px 10px!important;}

/* ── 행 레이블 ────────────────────────── */
.ics-rl{width:58px;min-width:50px;font-weight:700;font-size:0.72rem;text-align:center;background:#f1f5f9;color:#374151;line-height:1.4;white-space:nowrap;}

/* ── 차종 행 ──────────────────────────── */
.ics-car{background:#dbeafe;font-weight:800;font-size:0.82rem;text-align:center;color:#1e3a8a;padding:5px 4px!important;}

/* ── 품명 행 ──────────────────────────── */
.ics-part{background:#eff6ff;font-weight:600;text-align:center;color:#1e40af;font-size:0.77rem;position:relative;padding:5px 4px!important;}

/* ── 사진 셀 ──────────────────────────── */
.ics-photo-td{text-align:center;padding:4px!important;height:130px;position:relative;min-width:90px;}
.ics-img{max-width:100%;max-height:125px;object-fit:contain;display:block;margin:0 auto;cursor:zoom-in;}
.ics-no-img{height:90px;display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:0.68rem;border:1px dashed #e5e7eb;border-radius:4px;background:#fafafa;line-height:1.5;text-align:center;}

/* ── 도장 / 사출컬러 셀 ──────────────── */
.ics-paint{text-align:center;font-weight:700;background:#fef9c3;color:#854d0e;font-size:0.76rem;position:relative;padding:5px 4px!important;}
.ics-inject{text-align:center;font-size:0.76rem;background:#f0fdf4;color:#166534;position:relative;padding:5px 4px!important;}

/* ── 조치사항 ─────────────────────────── */
.ics-action-lbl{font-size:0.7rem;line-height:1.5;text-align:center;background:#fef3c7;color:#92400e;font-weight:700;}
.ics-action-ko{font-size:0.8rem;padding:5px 10px!important;}
.ics-action-sub{font-size:0.73rem;color:#6b7280;padding:4px 10px!important;}

/* ── 편집 모드 강조 ───────────────────── */
.ics-edit-mode [contenteditable="true"]{
    outline:none;min-width:20px;display:inline-block;
    border-bottom:1.5px dashed #3b82f6;cursor:text;
}
.ics-edit-mode [contenteditable="true"]:empty::before{content:attr(data-placeholder,'입력');color:#d1d5db;font-style:italic;}
.ics-edit-mode [contenteditable="true"]:focus{background:rgba(59,130,246,0.07);border-radius:2px;}

/* ── 편집 버튼들 ──────────────────────── */
.ics-btn-add-grp{display:block;width:100%;margin:2px 0;padding:3px 6px;font-size:0.7rem;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;}
.ics-btn-add-grp:hover{background:#2563eb;}
.ics-btn-del-grp{position:absolute;top:2px;right:2px;padding:1px 4px;font-size:0.65rem;line-height:1;background:#ef4444;color:#fff;border:none;border-radius:3px;cursor:pointer;z-index:5;}
.ics-btn-add-clr{padding:1px 5px;font-size:0.68rem;background:#22c55e;color:#fff;border:none;border-radius:3px;cursor:pointer;margin-left:2px;vertical-align:middle;}
.ics-btn-del-clr{position:absolute;top:1px;right:1px;padding:1px 4px;font-size:0.62rem;line-height:1;background:#ef4444;color:#fff;border:none;border-radius:3px;cursor:pointer;z-index:5;}
.ics-btn-photo{position:absolute;bottom:3px;right:3px;padding:2px 5px;font-size:0.68rem;background:rgba(30,64,175,0.82);color:#fff;border:none;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:2px;z-index:5;}
.ics-btn-photo:hover{background:#1e3a8a;}
.ics-edit-action-col{background:#f8fafc;border-left:1px dashed #3b82f6!important;padding:4px!important;vertical-align:top;}

/* ── 이미지 확대 오버레이 ─────────────── */
.ics-zoom-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;}
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
            <div class="ics-toolbar">
                <div class="ics-title-block">
                    <h2>사출품 COLOR 기준서</h2>
                    <p>사출 컬러 기준 문서 — 편집 및 저장 가능 / 클릭 시 이미지 확대</p>
                </div>
                <button class="ics-line-btn active" id="icsBtnA" onclick="InjectColorStdModule._switchLine('A')">🅰 A라인</button>
                <button class="ics-line-btn" id="icsBtnB" onclick="InjectColorStdModule._switchLine('B')">🅱 B라인</button>
                <button class="btn btn-outline" id="icsEditBtn" onclick="InjectColorStdModule._toggleEdit()">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit</span> 편집
                </button>
                <button class="btn btn-success" id="icsSaveBtn" style="display:none;" onclick="InjectColorStdModule._save()">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">save</span> 저장
                </button>
                <button class="btn btn-danger" id="icsResetBtn" style="display:none;font-size:0.78rem;" onclick="InjectColorStdModule._reset()">초기화</button>
                <button class="btn btn-outline" onclick="InjectColorStdModule._print()" title="인쇄/PDF">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">print</span>
                </button>
            </div>
            <div id="icsWrap"></div>
        </div>`;

        await _loadData();
        _rerender();
    }

    return {
        render: init,   // Router가 render(container) 호출
        init,
        _toggleEdit,
        _switchLine,
        _save,
        _reset,
        _print,
        _zoomImg,
        addGroup, delGroup,
        addColor, delColor,
        uploadPhoto
    };
})();
