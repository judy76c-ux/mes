/**
 * JIG 레이아웃 편집기
 * - 지그보관창고 배치를 시각적으로 편집
 * - 박스 드래그 이동, 리사이즈, 텍스트 편집
 * - 저장: Storage.setConfigValue('jig_layout_v1', {...})
 */
var JigLayoutModule = (function () {

    /* ══════════════════════════════════════
       상수
    ══════════════════════════════════════ */
    const CONFIG_KEY = 'jig_layout_v1';
    const CANVAS_W   = 1250;
    const CANVAS_H   = 740;
    const GRID            = 5;
    const SNAP_THRESHOLD  = 10;  // 자석 스냅 감지 거리(px)

    /* 컬럼 그리드 (오른쪽 섹션) */
    const C0 = 445, CW = 95, CG = 5;  // col0 시작, col 너비, 간격
    const cx = n => C0 + n * (CW + CG); // n번 컬럼 x좌표
    const cw = n => CW * n + CG * (n - 1); // n컬럼 합산 너비

    const BOX_COLOR  = '#bfdbfe';
    const BOX_BORDER = '#1d4ed8';
    const BOX_TEXT   = '#1e3a8a';

    const PALETTE = [
        '#bfdbfe','#e0f2fe','#dbeafe','#ede9fe','#fce7f3',
        '#dcfce7','#fef9c3','#fff7ed','#fef2f2','#f0fdf4',
        '#f1f5f9','#fafafa',
    ];
    const BORDER_PALETTE = [
        '#1d4ed8','#0284c7','#2563eb','#7c3aed','#db2777',
        '#16a34a','#ca8a04','#ea580c','#dc2626',
        '#0891b2','#64748b','#374151',
    ];

    /* ══════════════════════════════════════
       기본 레이아웃 (지그보관창고 실제 배치)
    ══════════════════════════════════════ */
    function _makeBox(id, label, x, y, w, h, opts) {
        return Object.assign({
            id, label, x, y, w, h,
            color: BOX_COLOR, borderColor: BOX_BORDER, textColor: BOX_TEXT,
            fontSize: 13, bold: true,
        }, opts || {});
    }

    const DEFAULT_BOXES = [
        /* ── 제목 ── */
        _makeBox('title', '■ 지그보관창고 LAY-OUT ■', 390, 6, 490, 42, {
            color:'#ffffff', borderColor:'transparent', textColor:'#0f172a', fontSize:17, bold:true }),

        /* ── 왼쪽 열: AXIX HANGER B-LINE ── */
        _makeBox('l1', '18 AXIX\nHANGER\nB-LINE',  10, 55,  185, 115),
        _makeBox('l2', '16 AXIX\nHANGER\nB-LINE',  10, 175, 185, 115),
        _makeBox('l3', '9 AXIX\nHANGER\nB-LINE',   10, 295, 185, 115),
        _makeBox('l4', '4 AXIX\nHANGER\nB-LINE',   10, 415, 185, 115),

        /* ── 상단 행 (col 0~7, y=55) ── */
        _makeBox('t1', 'A3\nPA2\nBCALL',    cx(0), 55, CW, 115),
        _makeBox('t2', 'XFD\n1SPOT',        cx(1), 55, CW, 115),
        _makeBox('t3', 'XFD\n3SPOT',        cx(2), 55, CW, 115),
        _makeBox('t4', 'J34A\nKNOBS',       cx(3), 55, CW, 115),
        _makeBox('t5', 'A3\nPA\nDOOR',      cx(4), 55, CW, 115),
        _makeBox('t6', 'A3\nPA\nROOM',      cx(5), 55, CW, 115),
        _makeBox('t7', 'A3\nPA\nBCALL',     cx(6), 55, CW, 115),
        _makeBox('t8', 'FORD\nBUTTON',      cx(7), 55, CW, 115),

        /* ── 중간 1행 RIVN RH (y=280) ── */
        _makeBox('m1', 'RIVN\nRECL\nKNOB\nRH',  cx(0), 280, CW,     110, {fontSize:11}),
        _makeBox('m2', 'RIVN\nSLIDE\nKNOB\nRH', cx(1), 280, CW,     110, {fontSize:11}),
        _makeBox('m3', 'RIVN\nTBU\nSPIN',       cx(2), 280, CW,     110, {fontSize:11}),
        _makeBox('m4', 'RIVN\nBACK\nRH',        cx(3), 280, CW,     110, {fontSize:11}),
        _makeBox('m5', 'RIVN\n2ND\nLH',         cx(4), 280, CW,     110, {fontSize:11}),
        _makeBox('m6', 'RIVN\nFR\nCAMP',        cx(5), 280, CW,     110, {fontSize:11}),
        _makeBox('m7', 'RIVN\nA/REST',           cx(6), 280, cw(2), 110, {fontSize:12}), // 2컬럼

        /* ── 중간 2행 RIVN LH (y=395) ── */
        _makeBox('n1', 'RIVN\nRECL\nKNOB\nLH',  cx(0), 395, CW,     110, {fontSize:11}),
        _makeBox('n2', 'RIVN\nSLIDE\nKNOB\nLH', cx(1), 395, CW,     110, {fontSize:11}),
        /* col2 비어있음 */
        _makeBox('n3', 'RIVN\nBACK\nLH',        cx(3), 395, CW,     110, {fontSize:11}),
        _makeBox('n4', 'RIVN\n2ND\nRH',         cx(4), 395, CW,     110, {fontSize:11}),
        _makeBox('n5', 'RIVN\nRR\nFR',          cx(5), 395, CW,     110, {fontSize:11}),
        _makeBox('n6', '27 AXIX\nHANGER',       cx(6), 395, cw(2), 110, {fontSize:12}), // 2컬럼

        /* ── 하단 행 T1xx (y=580) ── */
        _makeBox('b0', 'T1xx\nIL',           340,   580, 100, 105, {fontSize:12}),
        _makeBox('b1', 'T1xx\nP.BUTTON\nA',  cx(0), 580, CW,  105, {fontSize:11}),
        _makeBox('b2', 'T1xx\nLENS\nA',      cx(1), 580, CW,  105, {fontSize:11}),
        _makeBox('b3', 'T1XX\nP-BUTTON\nB',  cx(2), 580, cw(2),105,{fontSize:11}), // 2컬럼
        _makeBox('b4', 'T1xx\nLENS\nB',      cx(4), 580, CW,  105, {fontSize:11}),
        _makeBox('b5', 'T1XX\nDECO\nLINER',  cx(5), 580, CW,  105, {fontSize:11}),
        _makeBox('b6', 'T1XX\nDECO\n#2',     cx(6), 580, CW,  105, {fontSize:12}),
        _makeBox('b7', 'T1XX\nDECO\n#1',     cx(7), 580, CW,  105, {fontSize:12}),

        /* ── 출입문 ── */
        _makeBox('door', '출입문', 10, 605, 185, 80, {
            color:'#f8fafc', borderColor:'#64748b', textColor:'#334155', fontSize:14 }),
    ];

    /* ══════════════════════════════════════
       상태
    ══════════════════════════════════════ */
    let _boxes  = [];
    let _sel    = null;
    let _drag   = null;
    let _resize = null;
    let _canvas = null;
    let _propPanel = null;
    let _isDirty     = false;
    let _nextId      = 200;
    let _snapEnabled = true;   // 자석 기능 ON/OFF
    let _guideEls    = [];     // 스냅 가이드라인 DOM 요소들

    /* ══════════════════════════════════════
       진입점
    ══════════════════════════════════════ */
    async function init() {}

    async function render(container) {
        container.innerHTML = `
        <div class="fade-in-up" style="display:flex;flex-direction:column;height:100%;min-height:0;">

          <!-- ── 툴바 ── -->
          <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;
                      background:var(--bg-card);border-bottom:1px solid var(--border);
                      flex-wrap:wrap;flex-shrink:0;">
            <button class="btn btn-outline btn-sm" onclick="JigLayoutModule.goBack()">
              <span class="material-symbols-outlined">arrow_back</span> 목록으로
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-secondary btn-sm" onclick="JigLayoutModule.addBox()">
              <span class="material-symbols-outlined">add_box</span> 박스 추가
            </button>
            <button class="btn btn-outline btn-sm" id="jlBtnDup" disabled
                    onclick="JigLayoutModule.dupBox()">
              <span class="material-symbols-outlined">content_copy</span> 복제
            </button>
            <button class="btn btn-outline btn-sm" id="jlBtnDel" disabled
                    style="color:var(--danger);border-color:var(--danger);"
                    onclick="JigLayoutModule.delBox()">
              <span class="material-symbols-outlined">delete</span> 삭제
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-outline btn-sm" onclick="JigLayoutModule.resetLayout()">
              <span class="material-symbols-outlined">restart_alt</span> 초기화
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="jlSnapBtn" class="btn btn-sm" onclick="JigLayoutModule.toggleSnap()"
                    title="박스 간 자석 정렬 (ON/OFF)"
                    style="background:#6366f1;color:#fff;border:2px solid #6366f1;gap:4px;">
              자석 ON
            </button>
            <div style="flex:1;min-width:0;"></div>
            <span id="jlDirtyBadge" style="display:none;font-size:0.77rem;
                  color:var(--warning);background:rgba(245,158,11,0.12);
                  padding:3px 10px;border-radius:20px;white-space:nowrap;">
              ● 저장되지 않음
            </span>
            <button class="btn btn-primary btn-sm" onclick="JigLayoutModule.saveLayout()">
              <span class="material-symbols-outlined">save</span> 저장
            </button>
          </div>

          <!-- ── 본문 ── -->
          <div style="display:flex;flex:1;overflow:hidden;min-height:0;">

            <!-- 캔버스 스크롤 영역 -->
            <div style="flex:1;overflow:auto;padding:14px;background:var(--bg-secondary);">
              <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;line-height:1.6;">
                💡 <strong>클릭</strong> 선택 &nbsp;·&nbsp; <strong>드래그</strong> 이동 &nbsp;·&nbsp;
                <strong>더블클릭</strong> 이름 편집 &nbsp;·&nbsp; 우하단 핸들 <strong>리사이즈</strong>
              </div>
              <div id="jlCanvas" style="
                    position:relative;
                    width:${CANVAS_W}px; height:${CANVAS_H}px;
                    background:#e5e7eb;
                    border:2px solid var(--border);
                    border-radius:8px;
                    box-shadow:0 2px 12px rgba(0,0,0,0.1);
                    background-image:
                      linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px);
                    background-size:${GRID*10}px ${GRID*10}px;
                    user-select:none; cursor:default;">
              </div>
            </div>

            <!-- 속성 패널 -->
            <div id="jlPropPanel" style="
                  width:215px;min-width:215px;
                  background:var(--bg-card);
                  border-left:1px solid var(--border);
                  overflow-y:auto;padding:14px 12px;
                  flex-shrink:0;">
              <p style="color:var(--text-muted);font-size:0.83rem;
                        text-align:center;margin-top:50px;line-height:1.8;">
                박스를 선택하면<br>속성을 편집할 수 있습니다
              </p>
            </div>

          </div>
        </div>`;

        _canvas    = document.getElementById('jlCanvas');
        _propPanel = document.getElementById('jlPropPanel');

        /* 저장된 레이아웃 로드 */
        const saved = await Storage.getConfigValue(CONFIG_KEY);
        if (saved && Array.isArray(saved.boxes) && saved.boxes.length) {
            _boxes  = saved.boxes;
            _nextId = Math.max(..._boxes.map(b => parseInt(b.id.replace(/\D/g,'')) || 0)) + 1;
        } else {
            _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        }

        _sel     = null;
        _isDirty = false;
        _renderBoxes();
        _bindCanvasEvents();
    }

    /* ══════════════════════════════════════
       박스 렌더링
    ══════════════════════════════════════ */
    function _renderBoxes() {
        if (!_canvas) return;
        _canvas.innerHTML = '';
        _boxes.forEach(b => _canvas.appendChild(_makeBoxEl(b)));
    }

    function _makeBoxEl(b) {
        const isSel = (b.id === _sel);
        const div   = document.createElement('div');
        div.id = 'jlbox_' + b.id;
        div.style.cssText = [
            `position:absolute`,
            `left:${b.x}px`, `top:${b.y}px`,
            `width:${b.w}px`, `height:${b.h}px`,
            `background:${b.color || '#fff'}`,
            `border:2px solid ${b.borderColor || '#94a3b8'}`,
            `border-radius:5px`,
            `display:flex`, `align-items:center`, `justify-content:center`,
            `cursor:move`, `box-sizing:border-box`,
            `box-shadow:${isSel
                ? '0 0 0 2.5px #6366f1,0 4px 16px rgba(99,102,241,0.3)'
                : '0 1px 3px rgba(0,0,0,0.12)'}`,
            `overflow:hidden`, `transition:box-shadow 0.12s`,
        ].join(';');

        /* 텍스트 */
        const span = document.createElement('span');
        span.style.cssText = [
            `color:${b.textColor || '#1e293b'}`,
            `font-size:${b.fontSize || 13}px`,
            `font-weight:${b.bold ? '700' : '500'}`,
            `text-align:center`,
            `pointer-events:none`,
            `padding:4px 6px`,
            `white-space:pre-line`,
            `line-height:1.4`,
            `word-break:break-word`,
        ].join(';');
        span.textContent = b.label || '';
        div.appendChild(span);

        /* 선택 시 리사이즈 핸들 3종 + 삭제 버튼 */
        if (isSel) {
            div.appendChild(_makeHandle(b.id, 'right'));   // ▶ 오른쪽 (너비)
            div.appendChild(_makeHandle(b.id, 'bottom'));  // ▼ 아래쪽 (높이)
            div.appendChild(_makeHandle(b.id, 'corner'));  // ◢ 모서리 (너비+높이)

            /* 삭제 ✕ 버튼 */
            const xBtn = document.createElement('div');
            xBtn.style.cssText = `
                position:absolute;right:-7px;top:-7px;
                width:17px;height:17px;
                background:#ef4444;border-radius:50%;
                cursor:pointer;display:flex;align-items:center;justify-content:center;
                font-size:10px;color:#fff;font-weight:bold;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:10;`;
            xBtn.textContent = '✕';
            xBtn.addEventListener('mousedown', e => { e.stopPropagation(); delBox(); });
            div.appendChild(xBtn);
        }

        div.addEventListener('mousedown', _onBoxMouseDown);
        div.addEventListener('dblclick',  _onBoxDblClick);
        return div;
    }

    /* ══════════════════════════════════════
       이벤트
    ══════════════════════════════════════ */
    function _bindCanvasEvents() {
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup',   _onMouseUp);
        _canvas.addEventListener('mousedown', e => {
            if (e.target === _canvas) {
                _sel = null;
                _renderBoxes();
                _renderPropPanel();
            }
        });
    }

    function _onBoxMouseDown(e) {
        if (e.button !== 0) return;
        if (e.target.hasAttribute('data-resize')) return;
        const boxId = this.id.replace('jlbox_', '');
        _sel = boxId;
        _renderBoxes();
        _renderPropPanel();
        const b = _getBox(boxId);
        _drag  = { id:boxId, ox:e.clientX, oy:e.clientY, bx:b.x, by:b.y };
        _resize = null;
        e.preventDefault(); e.stopPropagation();
    }

    function _onResizeStart(e) {
        e.stopPropagation(); e.preventDefault();
        const boxId = this.getAttribute('data-resize');
        const dir   = this.getAttribute('data-rdir') || 'corner';
        const b     = _getBox(boxId);
        _resize = { id:boxId, ox:e.clientX, oy:e.clientY, bw:b.w, bh:b.h, dir };
        _drag   = null;
    }

    function _onMouseMove(e) {
        if (_drag) {
            const b    = _getBox(_drag.id);
            const rawX = _drag.bx + e.clientX - _drag.ox;
            const rawY = _drag.by + e.clientY - _drag.oy;
            const snapped = _calcSnap(b, rawX, rawY);
            const nx = Math.max(0, Math.min(CANVAS_W - b.w, snapped.x));
            const ny = Math.max(0, Math.min(CANVAS_H - b.h, snapped.y));
            b.x = nx; b.y = ny;
            _renderGuides(snapped.guides);
            const el = document.getElementById('jlbox_' + b.id);
            if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
            _markDirty();
        }
        if (_resize) {
            const b   = _getBox(_resize.id);
            const dir = _resize.dir;
            /* 방향별 raw 치수 계산 */
            const rawW = dir !== 'bottom'
                ? _resize.bw + e.clientX - _resize.ox
                : b.w;
            const rawH = dir !== 'right'
                ? _resize.bh + e.clientY - _resize.oy
                : b.h;
            const snapped = _calcResizeSnap(b, rawW, rawH, dir);
            b.w = Math.max(60, Math.min(CANVAS_W - b.x, snapped.w));
            b.h = Math.max(40, Math.min(CANVAS_H - b.y, snapped.h));
            _renderGuides(snapped.guides);
            const el = document.getElementById('jlbox_' + b.id);
            if (el) { el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; }
            _markDirty();
        }
    }

    function _onMouseUp() {
        if (_drag || _resize) {
            _drag = null; _resize = null;
            _clearGuides();
            _renderBoxes();
        }
    }

    function _onBoxDblClick(e) {
        _startInlineEdit(this.id.replace('jlbox_', ''));
        e.stopPropagation();
    }

    /* ══════════════════════════════════════
       인라인 편집 (더블클릭)
    ══════════════════════════════════════ */
    function _startInlineEdit(boxId) {
        const b  = _getBox(boxId);
        const el = document.getElementById('jlbox_' + boxId);
        if (!b || !el) return;
        el.innerHTML = '';

        const ta = document.createElement('textarea');
        ta.value = b.label;
        ta.style.cssText = `
            width:90%;height:80%;resize:none;
            background:rgba(255,255,255,0.9);
            border:none;border-bottom:2px solid #6366f1;
            border-radius:4px;
            font-size:${b.fontSize || 13}px;
            font-weight:${b.bold ? '700' : '500'};
            color:${b.textColor || '#1e293b'};
            text-align:center;outline:none;
            padding:4px;line-height:1.4;`;
        el.appendChild(ta);
        ta.focus(); ta.select();

        const commit = () => {
            const v = ta.value.trim();
            if (v) { b.label = v; _markDirty(); }
            _renderBoxes(); _renderPropPanel();
        };
        ta.addEventListener('blur', commit);
        ta.addEventListener('keydown', e => {
            if (e.key === 'Escape') { ta.value = b.label; ta.blur(); }
        });
    }

    /* ══════════════════════════════════════
       속성 패널
    ══════════════════════════════════════ */
    function _renderPropPanel() {
        if (!_propPanel) return;
        const b = _sel ? _getBox(_sel) : null;
        const dupBtn = document.getElementById('jlBtnDup');
        const delBtn = document.getElementById('jlBtnDel');
        if (dupBtn) dupBtn.disabled = !b;
        if (delBtn) delBtn.disabled = !b;

        if (!b) {
            _propPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.83rem;
                text-align:center;margin-top:50px;line-height:1.8;">
                박스를 선택하면<br>속성을 편집할 수 있습니다</p>`;
            return;
        }

        _propPanel.innerHTML = `
        <div style="font-weight:600;font-size:0.88rem;margin-bottom:12px;">✏️ 박스 속성</div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">이름 (줄바꿈: Enter)</label>
        <textarea id="jlPropLabel" rows="3" class="form-input"
            style="width:100%;margin:3px 0 10px;resize:vertical;font-size:0.85rem;"
            oninput="JigLayoutModule._propChange('label', this.value)">${_esc(b.label)}</textarea>

        <label style="font-size:0.75rem;color:var(--text-secondary);">위치 X / Y</label>
        <div style="display:flex;gap:5px;margin:3px 0 8px;">
          <input type="number" value="${b.x}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="JigLayoutModule._propChange('x',+this.value)">
          <input type="number" value="${b.y}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="JigLayoutModule._propChange('y',+this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">크기 W × H</label>
        <div style="display:flex;gap:5px;margin:3px 0 10px;">
          <input type="number" value="${b.w}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="JigLayoutModule._propChange('w',Math.max(60,+this.value))">
          <input type="number" value="${b.h}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="JigLayoutModule._propChange('h',Math.max(40,+this.value))">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자 크기</label>
        <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
          <input type="range" min="9" max="22" value="${b.fontSize||13}"
                 style="flex:1;"
                 oninput="JigLayoutModule._propChange('fontSize',+this.value);
                          this.nextElementSibling.textContent=this.value+'px'">
          <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${b.fontSize||13}px</span>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
        <div style="display:flex;gap:5px;margin:3px 0 12px;">
          <button class="btn btn-sm ${b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-weight:700;font-size:0.8rem;"
                  onclick="JigLayoutModule._propChange('bold',true)">굵게</button>
          <button class="btn btn-sm ${!b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                  onclick="JigLayoutModule._propChange('bold',false)">보통</button>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">배경색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${PALETTE.map(c => `
            <div title="${c}" onclick="JigLayoutModule._propChange('color','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.color===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.color||'#ffffff'}" title="직접 선택"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="JigLayoutModule._propChange('color',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">테두리색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${BORDER_PALETTE.map(c => `
            <div title="${c}" onclick="JigLayoutModule._propChange('borderColor','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.borderColor===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.borderColor||'#94a3b8'}" title="직접 선택"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="JigLayoutModule._propChange('borderColor',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자색</label>
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 16px;">
          <input type="color" value="${b.textColor||'#1e293b'}"
                 style="width:34px;height:26px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="JigLayoutModule._propChange('textColor',this.value)">
          <span style="font-size:0.77rem;color:var(--text-secondary);">클릭해서 선택</span>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <button class="btn btn-outline btn-sm" style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                  onclick="JigLayoutModule.delBox()">
            <span class="material-symbols-outlined" style="font-size:14px;">delete</span> 이 박스 삭제
          </button>
        </div>`;
    }

    /* ══════════════════════════════════════
       속성 변경
    ══════════════════════════════════════ */
    function _propChange(key, value) {
        const b = _sel ? _getBox(_sel) : null;
        if (!b) return;
        b[key] = value;
        _markDirty();
        _renderBoxes();
        // label 변경 시에는 패널 전체 재렌더 불필요 (입력 포커스 유지를 위해)
        if (key !== 'label') _renderPropPanel();
    }

    /* ══════════════════════════════════════
       박스 CRUD
    ══════════════════════════════════════ */
    function addBox() {
        const id = 'box_' + (_nextId++);
        _boxes.push({
            id, label:'새 구역', x:_snap(50), y:_snap(50),
            w:120, h:100, color:'#f8fafc', borderColor:'#94a3b8',
            textColor:'#334155', fontSize:13, bold:false,
        });
        _sel = id;
        _markDirty();
        _renderBoxes();
        _renderPropPanel();
        setTimeout(() => _startInlineEdit(id), 40);
    }

    function dupBox() {
        const b = _sel ? _getBox(_sel) : null;
        if (!b) return;
        const id = 'box_' + (_nextId++);
        _boxes.push({
            ...JSON.parse(JSON.stringify(b)),
            id,
            x: _snap(Math.min(b.x + 15, CANVAS_W - b.w)),
            y: _snap(Math.min(b.y + 15, CANVAS_H - b.h)),
        });
        _sel = id;
        _markDirty();
        _renderBoxes();
        _renderPropPanel();
    }

    function delBox() {
        if (!_sel) return;
        if (!confirm('선택한 박스를 삭제할까요?')) return;
        _boxes = _boxes.filter(b => b.id !== _sel);
        _sel   = null;
        _markDirty();
        _renderBoxes();
        _renderPropPanel();
    }

    /* ══════════════════════════════════════
       저장 / 초기화 / 뒤로가기
    ══════════════════════════════════════ */
    async function saveLayout() {
        try {
            await Storage.setConfigValue(CONFIG_KEY, { boxes: _boxes });
            _isDirty = false;
            const badge = document.getElementById('jlDirtyBadge');
            if (badge) badge.style.display = 'none';
            UIUtils.toast('레이아웃을 저장했습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function resetLayout() {
        if (!confirm('기본 레이아웃으로 초기화할까요?\n현재 배치가 모두 사라집니다.')) return;
        _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        _sel    = null;
        _nextId = 200;
        _markDirty();
        _renderBoxes();
        _renderPropPanel();
        UIUtils.toast('기본 레이아웃으로 초기화했습니다.', 'info');
    }

    function goBack() {
        if (_isDirty && !confirm('저장하지 않은 변경 사항이 있습니다.\n그래도 이동할까요?')) return;
        document.removeEventListener('mousemove', _onMouseMove);
        document.removeEventListener('mouseup',   _onMouseUp);
        Router.navigate('jig-management');
    }

    /* ══════════════════════════════════════
       리사이즈 핸들 생성
    ══════════════════════════════════════ */

    /**
     * dir: 'right' | 'bottom' | 'corner'
     * 각각 너비 전용 / 높이 전용 / 동시 조절 핸들
     */
    function _makeHandle(boxId, dir) {
        const el = document.createElement('div');
        const C  = '#6366f1';
        if (dir === 'right') {
            el.style.cssText = `
                position:absolute; right:-4px; top:50%; transform:translateY(-50%);
                width:8px; height:28px; background:${C}; border-radius:4px;
                cursor:ew-resize; z-index:5; opacity:0.9;`;
        } else if (dir === 'bottom') {
            el.style.cssText = `
                position:absolute; bottom:-4px; left:50%; transform:translateX(-50%);
                width:28px; height:8px; background:${C}; border-radius:4px;
                cursor:ns-resize; z-index:5; opacity:0.9;`;
        } else { /* corner */
            el.style.cssText = `
                position:absolute; right:0; bottom:0;
                width:16px; height:16px; background:${C};
                border-radius:3px 0 4px 0; cursor:nwse-resize; z-index:5;
                display:flex; align-items:center; justify-content:center;`;
            el.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <line x1="1" y1="9" x2="9" y2="1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="4" y1="9" x2="9" y2="4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="7" y1="9" x2="9" y2="7" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        }
        el.setAttribute('data-resize', boxId);
        el.setAttribute('data-rdir',   dir);
        el.addEventListener('mousedown', _onResizeStart, { passive: false });
        return el;
    }

    /* ══════════════════════════════════════
       자석 스냅 기능
    ══════════════════════════════════════ */

    /** 자석 ON/OFF 토글 */
    function toggleSnap() {
        _snapEnabled = !_snapEnabled;
        const btn = document.getElementById('jlSnapBtn');
        if (btn) {
            if (_snapEnabled) {
                btn.style.background    = '#6366f1';
                btn.style.color         = '#fff';
                btn.style.borderColor   = '#6366f1';
                btn.innerHTML = '자석 ON';
            } else {
                btn.style.background    = 'transparent';
                btn.style.color         = 'var(--text-secondary)';
                btn.style.borderColor   = 'var(--border)';
                btn.innerHTML = '자석 OFF';
            }
        }
    }

    /**
     * 드래그 중인 박스(b)의 rawX/rawY 위치에서
     * 그리드 스냅 + 박스 간 자석 스냅을 계산한다.
     * 반환: { x, y, guides: [{type:'v'|'h', pos, start, end}] }
     */
    function _calcSnap(b, rawX, rawY) {
        // 기본: 그리드 스냅
        let nx = _snap(rawX);
        let ny = _snap(rawY);
        const guides = [];

        if (!_snapEnabled) return { x: nx, y: ny, guides };

        const others = _boxes.filter(o => o.id !== b.id);
        let bestXDist = SNAP_THRESHOLD + 1;
        let bestYDist = SNAP_THRESHOLD + 1;
        let guideX = null, guideY = null;
        let guideXRange = null, guideYRange = null; // 가이드라인 표시 범위

        for (const o of others) {
            const ol  = o.x,        or_ = o.x + o.w, ocx = o.x + o.w / 2;
            const ot  = o.y,        ob  = o.y + o.h, ocy = o.y + o.h / 2;

            // X축: (내 엣지, 상대 엣지) 쌍 비교
            const dl = rawX, dr = rawX + b.w, dcx = rawX + b.w / 2;
            const xCandidates = [
                { d: Math.abs(dl  - ol),  snap: ol,            guide: ol  },  // 좌←좌
                { d: Math.abs(dl  - or_), snap: or_,           guide: or_ },  // 좌←우
                { d: Math.abs(dr  - ol),  snap: ol  - b.w,     guide: ol  },  // 우←좌
                { d: Math.abs(dr  - or_), snap: or_ - b.w,     guide: or_ },  // 우←우
                { d: Math.abs(dcx - ocx), snap: ocx - b.w / 2, guide: ocx },  // 중←중
            ];
            for (const c of xCandidates) {
                if (c.d < bestXDist) {
                    bestXDist = c.d;
                    nx       = c.snap;
                    guideX   = c.guide;
                    guideXRange = {
                        start: Math.min(o.y, rawY),
                        end:   Math.max(o.y + o.h, rawY + b.h),
                    };
                }
            }

            // Y축
            const dt = rawY, db = rawY + b.h, dcy = rawY + b.h / 2;
            const yCandidates = [
                { d: Math.abs(dt  - ot),  snap: ot,            guide: ot  },
                { d: Math.abs(dt  - ob),  snap: ob,            guide: ob  },
                { d: Math.abs(db  - ot),  snap: ot  - b.h,     guide: ot  },
                { d: Math.abs(db  - ob),  snap: ob  - b.h,     guide: ob  },
                { d: Math.abs(dcy - ocy), snap: ocy - b.h / 2, guide: ocy },
            ];
            for (const c of yCandidates) {
                if (c.d < bestYDist) {
                    bestYDist = c.d;
                    ny       = c.snap;
                    guideY   = c.guide;
                    guideYRange = {
                        start: Math.min(o.x, rawX),
                        end:   Math.max(o.x + o.w, rawX + b.w),
                    };
                }
            }
        }

        if (bestXDist <= SNAP_THRESHOLD && guideX !== null) {
            guides.push({ type:'v', pos: guideX,
                          start: guideXRange.start, end: guideXRange.end });
        }
        if (bestYDist <= SNAP_THRESHOLD && guideY !== null) {
            guides.push({ type:'h', pos: guideY,
                          start: guideYRange.start, end: guideYRange.end });
        }
        return { x: nx, y: ny, guides };
    }

    /** 스냅 가이드라인을 캔버스에 그린다 */
    function _renderGuides(guides) {
        _clearGuides();
        if (!_canvas || !guides.length) return;
        guides.forEach(g => {
            const el = document.createElement('div');
            el.style.cssText = `
                position:absolute;pointer-events:none;z-index:999;
                background:rgba(99,102,241,0.75);
            `;
            if (g.type === 'v') {
                const len = (g.end - g.start) || CANVAS_H;
                el.style.left   = (g.pos - 0.5) + 'px';
                el.style.top    = (g.start || 0) + 'px';
                el.style.width  = '1.5px';
                el.style.height = len + 'px';
            } else {
                const len = (g.end - g.start) || CANVAS_W;
                el.style.left   = (g.start || 0) + 'px';
                el.style.top    = (g.pos - 0.5) + 'px';
                el.style.width  = len + 'px';
                el.style.height = '1.5px';
            }
            _canvas.appendChild(el);
            _guideEls.push(el);
        });
    }

    /** 가이드라인 제거 */
    function _clearGuides() {
        _guideEls.forEach(el => el.remove());
        _guideEls = [];
    }

    /**
     * 리사이즈 스냅 계산
     * dir: 'right'(너비만) | 'bottom'(높이만) | 'corner'(둘 다)
     * 반환: { w, h, guides }
     */
    function _calcResizeSnap(b, rawW, rawH, dir) {
        let nw = _snap(rawW);
        let nh = _snap(rawH);
        const guides = [];
        if (!_snapEnabled) return { w: nw, h: nh, guides };

        const others = _boxes.filter(o => o.id !== b.id);

        /* ── 너비(오른쪽 엣지) 스냅 ── */
        if (dir !== 'bottom') {
            const rightEdge = b.x + rawW;
            let bestD = SNAP_THRESHOLD + 1;
            let guideX = null, gRange = null;

            for (const o of others) {
                const candidates = [
                    /* 같은 너비 (크기 맞춤) */
                    { d: Math.abs(rawW - o.w),            sw: o.w,         gx: b.x + o.w },
                    /* 오른쪽 엣지 → 상대 왼쪽 엣지 */
                    { d: Math.abs(rightEdge - o.x),       sw: o.x - b.x,   gx: o.x       },
                    /* 오른쪽 엣지 → 상대 오른쪽 엣지 */
                    { d: Math.abs(rightEdge - (o.x+o.w)), sw: o.x+o.w-b.x, gx: o.x+o.w  },
                    /* 오른쪽 엣지 → 상대 중앙 */
                    { d: Math.abs(rightEdge - (o.x+o.w/2)), sw: o.x+o.w/2-b.x, gx: o.x+o.w/2 },
                ];
                for (const c of candidates) {
                    if (c.d < bestD && c.sw >= 50) {
                        bestD  = c.d;
                        nw     = c.sw;
                        guideX = c.gx;
                        gRange = { start: Math.min(o.y, b.y), end: Math.max(o.y+o.h, b.y+rawH) };
                    }
                }
            }
            if (bestD <= SNAP_THRESHOLD && guideX !== null)
                guides.push({ type:'v', pos: guideX, start: gRange.start, end: gRange.end });
        }

        /* ── 높이(아래쪽 엣지) 스냅 ── */
        if (dir !== 'right') {
            const bottomEdge = b.y + rawH;
            let bestD = SNAP_THRESHOLD + 1;
            let guideY = null, gRange = null;

            for (const o of others) {
                const candidates = [
                    /* 같은 높이 (크기 맞춤) */
                    { d: Math.abs(rawH - o.h),              sh: o.h,         gy: b.y + o.h },
                    /* 아래 엣지 → 상대 위 엣지 */
                    { d: Math.abs(bottomEdge - o.y),        sh: o.y - b.y,   gy: o.y       },
                    /* 아래 엣지 → 상대 아래 엣지 */
                    { d: Math.abs(bottomEdge - (o.y+o.h)),  sh: o.y+o.h-b.y, gy: o.y+o.h  },
                    /* 아래 엣지 → 상대 중앙 */
                    { d: Math.abs(bottomEdge - (o.y+o.h/2)), sh: o.y+o.h/2-b.y, gy: o.y+o.h/2 },
                ];
                for (const c of candidates) {
                    if (c.d < bestD && c.sh >= 30) {
                        bestD  = c.d;
                        nh     = c.sh;
                        guideY = c.gy;
                        gRange = { start: Math.min(o.x, b.x), end: Math.max(o.x+o.w, b.x+rawW) };
                    }
                }
            }
            if (bestD <= SNAP_THRESHOLD && guideY !== null)
                guides.push({ type:'h', pos: guideY, start: gRange.start, end: gRange.end });
        }

        return { w: nw, h: nh, guides };
    }

    /* ══════════════════════════════════════
       유틸
    ══════════════════════════════════════ */
    function _getBox(id)  { return _boxes.find(b => b.id === id); }
    function _snap(v)     { return Math.round(v / GRID) * GRID; }
    function _esc(s)      {
        return String(s || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;');
    }
    function _markDirty() {
        _isDirty = true;
        const badge = document.getElementById('jlDirtyBadge');
        if (badge) badge.style.display = '';
    }

    /* ══════════════════════════════════════
       공개 API
    ══════════════════════════════════════ */
    return { init, render, addBox, dupBox, delBox, saveLayout, resetLayout, goBack, _propChange, toggleSnap };

})();
