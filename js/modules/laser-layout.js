/**
 * 레이져 대기품 창고 레이아웃 편집기
 * - 2층 도장라인 레이져 대기 LAY-OUT
 * - 박스 드래그/리사이즈/더블클릭 편집, 화살표, 자석 스냅
 * - 저장: Storage.setConfigValue('laser_layout_v1', {...})
 */
var LaserLayoutModule = (function () {

    const CONFIG_KEY = 'laser_layout_v1';
    const CANVAS_W   = 1600;
    const CANVAS_H   = 840;
    const GRID           = 5;
    const SNAP_THRESHOLD = 10;

    /* ══════════════════════════════════════
       색상 세트
    ══════════════════════════════════════ */
    const BLUE   = { color:'#dbeafe', borderColor:'#3b82f6', textColor:'#1e3a8a' };
    const LBLUE  = { color:'#e0f2fe', borderColor:'#0284c7', textColor:'#0c4a6e' };
    const YELLOW = { color:'#fef9c3', borderColor:'#ca8a04', textColor:'#713f12' };
    const ORANGE = { color:'#fed7aa', borderColor:'#ea580c', textColor:'#7c2d12' };
    const GREEN  = { color:'#dcfce7', borderColor:'#16a34a', textColor:'#14532d' };
    const PINK   = { color:'#fce7f3', borderColor:'#db2777', textColor:'#831843' };
    const GRAY   = { color:'#f1f5f9', borderColor:'#cbd5e1', textColor:'#475569' };
    const LGRAY  = { color:'#f8fafc', borderColor:'#e2e8f0', textColor:'#94a3b8' };
    const DRED   = { color:'#ef4444', borderColor:'#b91c1c', textColor:'#ffffff' };

    const PALETTE = [
        '#dbeafe','#e0f2fe','#bfdbfe','#fce7f3','#fef9c3',
        '#dcfce7','#fff7ed','#fef2f2','#f1f5f9','#fafafa',
        '#ede9fe','#ecfdf5','#fed7aa','#ffffff',
    ];
    const BORDER_PALETTE = [
        '#3b82f6','#0284c7','#1d4ed8','#db2777','#ca8a04',
        '#16a34a','#ea580c','#dc2626','#7c3aed','#64748b',
        '#0891b2','#374151','#ef4444','transparent',
    ];

    /* ══════════════════════════════════════
       박스 생성 헬퍼
    ══════════════════════════════════════ */
    let _uid = 1;
    function _b(label, x, y, w, h, scheme, extra) {
        return Object.assign(
            { id:'ll_'+(_uid++), label, x, y, w, h, fontSize:11, bold:true },
            scheme, extra || {}
        );
    }

    /* ══════════════════════════════════════
       기본 레이아웃 (2층 도장라인 레이져 대기)
       선입선출 다이어그램 제외 — 위치 배치도만
    ══════════════════════════════════════ */
    const DEFAULT_BOXES = (function () {
        _uid = 1;
        const boxes = [];

        /* ── 셀 기본 상수 ── */
        const CW   = 92;              // 셀 너비
        const CH   = 31;              // 셀 높이
        const CG   = 2;               // 셀 간격
        const cx   = n => n*(CW+CG);  // n번 열 x 오프셋

        /* ── 제목 ── */
        boxes.push(_b('■  2층 도장라인 레이져 대기 LAY-OUT  ■',
            300, 6, 1000, 38,
            { color:'#ffffff', borderColor:'transparent', textColor:'#0f172a', fontSize:16, bold:true }));

        /* ════════════════════════════════════
           [1] 왼쪽 테이블  (B-LINE / A-LINE)
           x=30, 열2개 + 박스NO
        ════════════════════════════════════ */
        const LX    = 30;
        const HDR_Y = 50;

        /* 헤더 행 */
        boxes.push(_b('2열', LX+cx(0), HDR_Y, CW, 24, GRAY, { fontSize:10 }));
        boxes.push(_b('1열', LX+cx(1), HDR_Y, CW, 24, GRAY, { fontSize:10 }));
        boxes.push(_b('박스NO', LX+cx(2), HDR_Y, 38, 24, LGRAY, { fontSize:9 }));

        /* B-LINE 라벨 */
        const BL_Y = HDR_Y + 26;
        boxes.push(_b('━  B - L I N E  ━', LX, BL_Y, cx(2)+38, 22, DRED, { fontSize:10 }));

        /* B-LINE 제품 행 */
        const B_START = BL_Y + 24;
        const brow = r => B_START + r*(CH+CG);

        const BPRODS = [
            ['6PS\nECALL', '6PS\nECALL', '3'],
            ['6PS\nECALL', '6PS\nECALL', '4'],
            ['AZ3\nBCALL2','AZ3\nBCALL2','2'],
            ['6PS\nBCALL2','6PS\nBCALL2','2'],
            ['6PS\nBCALL', '6PS\nBCALL', '2'],
            ['6PS\nDOOR',  '6PS\nDOOR',  '2'],
            ['6PS\nROOM',  '6PS\nROOM',  '2'],
            ['6PS\nPAO',   '6PS\nPAO',   '1'],
            ['AZ3\nECALL', 'AZ3\nECALL', '4'],
            ['AZ3\nBCALL', 'AZ3\nBCALL', '2'],
            ['AZ3\nDOOR',  'AZ3\nDOOR',  '2'],
            ['AZ3\nROOM',  'AZ3\nROOM',  '2'],
            ['AZ3\nPAO',   'AZ3\nPAO',   '1'],
        ];
        BPRODS.forEach(([l2,l1,no], r) => {
            boxes.push(_b(l2, LX+cx(0), brow(r), CW, CH, BLUE));
            boxes.push(_b(l1, LX+cx(1), brow(r), CW, CH, BLUE));
            boxes.push(_b(no, LX+cx(2), brow(r), 38, CH, LGRAY, { fontSize:12 }));
        });

        /* A-LINE 라벨 */
        const AL_Y = brow(BPRODS.length) + 5;
        boxes.push(_b('━  A - L I N E  ━', LX, AL_Y, cx(2)+38, 22, DRED, { fontSize:10 }));

        /* A-LINE 제품 행 */
        const A_START = AL_Y + 24;
        const arow = r => A_START + r*(CH+CG);

        const APRODS = [
            ['AZ3\nECALL', 'AZ3\nECALL', '1'],
            ['AZ3\nBCALL', 'AZ3\nBCALL', '2'],
            ['AZ3\nDOOR',  'AZ3\nDOOR',  '2'],
            ['AZ3\nROOM',  'AZ3\nROOM',  '2'],
            ['AZ3\nPAO',   'AZ3\nPAO',   '1'],
            ['6PS\nPAO',   '6PS\nPAO',   '1'],
        ];
        APRODS.forEach(([l2,l1,no], r) => {
            boxes.push(_b(l2, LX+cx(0), arow(r), CW, CH, YELLOW));
            boxes.push(_b(l1, LX+cx(1), arow(r), CW, CH, YELLOW));
            boxes.push(_b(no, LX+cx(2), arow(r), 38, CH, LGRAY, { fontSize:12 }));
        });

        /* ════════════════════════════════════
           [2] 가운데 테이블
        ════════════════════════════════════ */
        const MX = LX + cx(2) + 38 + 22;  // ~282

        boxes.push(_b('2열', MX+cx(0), HDR_Y, CW, 24, GRAY, { fontSize:10 }));
        boxes.push(_b('1열', MX+cx(1), HDR_Y, CW, 24, GRAY, { fontSize:10 }));
        boxes.push(_b('박스NO', MX+cx(2), HDR_Y, 38, 24, LGRAY, { fontSize:9 }));

        const mrow = r => B_START + r*(CH+CG);

        const MPRODS = [
            ['P702\nM button', 'P702\nM button', '3.4'],
            ['P702\nM button', 'P702\nM button', '1.2'],
            ['XFD BK\nSEESAW', 'XFD BK\nSEESAW', '3.4'],
            ['XFD BK\nSEESAW', 'XFD BK\nSEESAW', '1.2'],
            ['J34A BK\nLH',    'J34A BK\nLH',    '1'],
            ['J34A BK\nRH',    'J34A BK\nRH',    '1'],
            ['J34A GY\nLH',    'J34A GY\nLH',    '3'],
            ['J34A GY\nLH',    'J34A GY\nLH',    '4'],
            ['J34A GY\nRH',    'J34A GY\nRH',    '3'],
            ['J34A GY\nRH',    'J34A GY\nRH',    '4'],
            ['XFD BK\nKNOB',   'XFD BK\nKNOB',   '5'],
            ['XFD BK\nKNOB',   'XFD BK\nKNOB',   '5'],
            ['XFD BK\nKNOB',   'XFD BK\nKNOB',   '6'],
        ];
        MPRODS.forEach(([l2,l1,no], r) => {
            boxes.push(_b(l2, MX+cx(0), mrow(r), CW, CH, BLUE));
            boxes.push(_b(l1, MX+cx(1), mrow(r), CW, CH, BLUE));
            boxes.push(_b(no, MX+cx(2), mrow(r), 38, CH, LGRAY, { fontSize:12 }));
        });

        /* ════════════════════════════════════
           [3] 오른쪽 영역
        ════════════════════════════════════ */
        const RX = MX + cx(2) + 38 + 22;  // ~534

        /* 출하검사장 (왼쪽) */
        boxes.push(_b('출하검사장', RX, 0, 280, 240, ORANGE, { fontSize:18 }));

        /* 무무 */
        boxes.push(_b('무무\n🧑‍🔧', RX+282, 0, 52, 105,
            { color:'#fffbeb', borderColor:'#fbbf24', textColor:'#92400e', fontSize:11, bold:false }));

        /* 출하검사장 (오른쪽, 조금 더 크게) */
        boxes.push(_b('출하검사장', RX+338, 0, 400, 240,
            { color:'#f97316', borderColor:'#c2410c', textColor:'#fff', fontSize:18, bold:true }));

        /* 공박스 (출하검사장 오른쪽 아래 공간) */
        boxes.push(_b('공박스', RX+748, 130, 80, 55,
            { color:'#f1f5f9', borderColor:'#94a3b8', textColor:'#475569', fontSize:13, bold:false }));

        /* ────────────────────────────────
           레이져 공정 (오른쪽 세로 블록)
        ──────────────────────────────── */
        const LASER_X = RX + 742;           // ~1276
        const LASER_W = CANVAS_W - LASER_X; // ~324

        /* 레이져 공정 배경 */
        boxes.push(_b('레이져\n공정', LASER_X, 0, LASER_W, CANVAS_H,
            { color:'#bfdbfe', borderColor:'#2563eb', textColor:'#1e3a8a', fontSize:18, bold:true }));

        /* 내부 제품 셀 상단 라벨 */
        boxes.push(_b('1,200ea/BOX\n3열 2행 5간', LASER_X-100, 245, 96, 50,
            { color:'#eff6ff', borderColor:'#bfdbfe', textColor:'#1e3a8a', fontSize:8, bold:false }));

        /* 내부 열 헤더 (1열, 2열, 3열) */
        const LCX  = LASER_X + 10;
        const LCW  = Math.floor((LASER_W - 20 - 6) / 3);  // ~99
        const LCH  = 34;
        const LCGAP= 3;
        const lcx  = n => LCX + n*(LCW+LCGAP);

        boxes.push(_b('1열', lcx(0), 225, LCW, 22, GRAY, { fontSize:9 }));
        boxes.push(_b('2열', lcx(1), 225, LCW, 22, GRAY, { fontSize:9 }));
        boxes.push(_b('3열', lcx(2), 225, LCW, 22, GRAY, { fontSize:9 }));

        const lrow = r => 249 + r*(LCH+LCGAP);

        /* PARK / p-button 2행 */
        for (let r = 0; r < 2; r++) {
            boxes.push(_b('T1xx\nPARK',    lcx(0), lrow(r), LCW, LCH, LBLUE, { fontSize:8 }));
            boxes.push(_b('p-button',      lcx(1), lrow(r), LCW, LCH, LBLUE, { fontSize:8 }));
            boxes.push(_b('p-button',      lcx(2), lrow(r), LCW, LCH, LBLUE, { fontSize:8 }));
        }

        /* 360ea/box 라벨 */
        boxes.push(_b('360ea/box\n3열×4행 5간', LASER_X-100, 395, 96, 50,
            { color:'#eff6ff', borderColor:'#bfdbfe', textColor:'#1e3a8a', fontSize:8, bold:false }));

        /* T1xx LENS 4행 */
        for (let r = 0; r < 4; r++) {
            boxes.push(_b('T1xx\nLENS', lcx(0), lrow(r+3), LCW, LCH, LBLUE, { fontSize:8 }));
            boxes.push(_b('LENS',       lcx(1), lrow(r+3), LCW, LCH, LBLUE, { fontSize:8 }));
            boxes.push(_b('LENS',       lcx(2), lrow(r+3), LCW, LCH, LBLUE, { fontSize:8 }));
        }

        /* ── 하단 라벨 ── */
        boxes.push(_b('EV 입구', 588, 806, 130, 28, GRAY, { fontSize:11 }));
        boxes.push(_b('홍입구',  1440, 806, 130, 28, GRAY, { fontSize:11 }));

        return boxes;
    })();

    /* ══════════════════════════════════════
       상태
    ══════════════════════════════════════ */
    let _boxes      = [];
    let _sel        = null;          // 단일 선택 ID (속성 패널용)
    let _selSet     = new Set();     // 다중 선택 ID 집합
    let _drag       = null;
    let _resize     = null;
    let _canvas     = null;
    let _propPanel  = null;
    let _isDirty    = false;
    let _nextId     = 500;
    let _snapEnabled= true;
    let _guideEls   = [];

    let _arrows     = [];
    let _selArrow   = null;
    let _arrowMode  = false;
    let _arrowDraft = null;
    let _svgLayer   = null;

    /* ── 되돌리기 히스토리 ── */
    let _history    = [];
    const MAX_HISTORY = 30;

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
            <button class="btn btn-outline btn-sm" onclick="LaserLayoutModule.goBack()">
              <span class="material-symbols-outlined">arrow_back</span> 목록으로
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="llUndoBtn" class="btn btn-outline btn-sm" disabled
                    onclick="LaserLayoutModule.undo()" title="되돌리기 (Ctrl+Z)">
              <span class="material-symbols-outlined">undo</span> 되돌리기
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-secondary btn-sm" onclick="LaserLayoutModule.addBox()">
              <span class="material-symbols-outlined">add_box</span> 박스 추가
            </button>
            <button class="btn btn-outline btn-sm" id="llBtnDup" disabled
                    onclick="LaserLayoutModule.dupBox()">
              <span class="material-symbols-outlined">content_copy</span> 복제
            </button>
            <button class="btn btn-outline btn-sm" id="llBtnDel" disabled
                    style="color:var(--danger);border-color:var(--danger);"
                    onclick="LaserLayoutModule.delBox()">
              <span class="material-symbols-outlined">delete</span> 삭제
            </button>
            <span id="llSelCount" style="display:none;font-size:0.77rem;
                  color:#6366f1;background:rgba(99,102,241,0.1);
                  padding:3px 10px;border-radius:20px;white-space:nowrap;font-weight:600;">
            </span>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-outline btn-sm" onclick="LaserLayoutModule.resetLayout()">
              <span class="material-symbols-outlined">restart_alt</span> 초기화
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="llSnapBtn" class="btn btn-sm" onclick="LaserLayoutModule.toggleSnap()"
                    style="background:#6366f1;color:#fff;border:2px solid #6366f1;gap:4px;">
              자석 ON
            </button>
            <button id="llArrowBtn" class="btn btn-sm" onclick="LaserLayoutModule.toggleArrowMode()"
                    style="background:transparent;color:var(--text-secondary);border:2px solid var(--border);gap:4px;">
              <span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표
            </button>
            <div style="flex:1;min-width:0;"></div>
            <span id="llDirtyBadge" style="display:none;font-size:0.77rem;
                  color:var(--warning);background:rgba(245,158,11,0.12);
                  padding:3px 10px;border-radius:20px;white-space:nowrap;">
              ● 저장되지 않음
            </span>
            <button class="btn btn-primary btn-sm" onclick="LaserLayoutModule.saveLayout()">
              <span class="material-symbols-outlined">save</span> 저장
            </button>
            <button class="btn btn-outline btn-sm" onclick="LaserLayoutModule.printLayout()"
                    style="color:#0891b2;border-color:#0891b2;gap:4px;">
              <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
            </button>
          </div>

          <!-- ── 본문 ── -->
          <div style="display:flex;flex:1;overflow:hidden;min-height:0;">

            <!-- 캔버스 영역 -->
            <div style="flex:1;overflow:auto;padding:14px;background:var(--bg-secondary);">
              <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;line-height:1.6;">
                💡 <strong>클릭</strong> 선택 &nbsp;·&nbsp; <strong>드래그</strong> 이동 &nbsp;·&nbsp;
                <strong>더블클릭</strong> 이름 편집 &nbsp;·&nbsp; 우하단 핸들 <strong>리사이즈</strong>
              </div>
              <div id="llCanvas" style="
                    position:relative;
                    width:${CANVAS_W}px; height:${CANVAS_H}px;
                    background:#d1d5db;
                    border:2px solid var(--border);
                    border-radius:8px;
                    box-shadow:0 2px 12px rgba(0,0,0,0.1);
                    background-image:
                      linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
                    background-size:${GRID*10}px ${GRID*10}px;
                    user-select:none; cursor:default;">
              </div>
            </div>

            <!-- 속성 패널 -->
            <div id="llPropPanel" style="
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

        _canvas    = document.getElementById('llCanvas');
        _propPanel = document.getElementById('llPropPanel');

        /* SVG 화살표 오버레이 */
        _svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        _svgLayer.style.cssText = `position:absolute;top:0;left:0;
            width:${CANVAS_W}px;height:${CANVAS_H}px;
            pointer-events:none;overflow:visible;z-index:20;`;
        _canvas.appendChild(_svgLayer);

        const saved = await Storage.getConfigValue(CONFIG_KEY);
        if (saved && Array.isArray(saved.boxes) && saved.boxes.length) {
            _boxes  = saved.boxes;
            _arrows = Array.isArray(saved.arrows) ? saved.arrows : [];
            _nextId = Math.max(..._boxes.map(b => parseInt(b.id.replace(/\D/g,'')) || 0)) + 1;
        } else {
            _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
            _arrows = [];
        }

        _sel = _selArrow = null;
        _arrowMode = false;
        _isDirty   = false;
        _renderBoxes();
        _renderArrows();
        _bindCanvasEvents();
    }

    /* ══════════════════════════════════════
       박스 렌더링
    ══════════════════════════════════════ */
    function _renderBoxes() {
        if (!_canvas) return;
        _canvas.innerHTML = '';
        _boxes.forEach(b => _canvas.appendChild(_makeBoxEl(b)));
        _svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        _svgLayer.style.cssText = `position:absolute;top:0;left:0;
            width:${CANVAS_W}px;height:${CANVAS_H}px;
            pointer-events:none;overflow:visible;z-index:20;`;
        _canvas.appendChild(_svgLayer);
        _renderArrows();
    }

    function _makeBoxEl(b) {
        const isSel  = _selSet.has(b.id);
        const isPrim = (b.id === _sel);   // 속성 패널 기준 박스
        const div    = document.createElement('div');
        div.id = 'llbox_' + b.id;
        div.style.cssText = [
            `position:absolute`,
            `left:${b.x}px`, `top:${b.y}px`,
            `width:${b.w}px`, `height:${b.h}px`,
            `background:${b.color || '#fff'}`,
            `border:${b.borderColor==='transparent' ? 'none' : `2px solid ${b.borderColor||'#94a3b8'}`}`,
            `border-radius:5px`,
            `display:flex`, `align-items:center`, `justify-content:center`,
            `cursor:move`, `box-sizing:border-box`,
            `box-shadow:${isPrim
                ? '0 0 0 2.5px #6366f1,0 4px 16px rgba(99,102,241,0.3)'
                : isSel
                    ? '0 0 0 2px #a5b4fc,0 2px 8px rgba(99,102,241,0.2)'
                    : '0 1px 3px rgba(0,0,0,0.10)'}`,
            `overflow:hidden`, `transition:box-shadow 0.12s`,
        ].join(';');

        const span = document.createElement('span');
        span.style.cssText = [
            `color:${b.textColor||'#1e293b'}`,
            `font-size:${b.fontSize||11}px`,
            `font-weight:${b.bold?'700':'500'}`,
            `text-align:center`,
            `pointer-events:none`,
            `padding:3px 5px`,
            `white-space:pre-line`,
            `line-height:1.35`,
            `word-break:break-word`,
        ].join(';');
        span.textContent = b.label || '';
        div.appendChild(span);

        if (isPrim) {
            div.appendChild(_makeHandle(b.id, 'right'));
            div.appendChild(_makeHandle(b.id, 'bottom'));
            div.appendChild(_makeHandle(b.id, 'corner'));
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
       이벤트 바인딩
    ══════════════════════════════════════ */
    function _bindCanvasEvents() {
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup',   _onMouseUp);

        // Ctrl+Z 되돌리기
        document.addEventListener('keydown', function _llKeyDown(e) {
            // 페이지 이탈 시 이벤트 제거
            if (!document.getElementById('llCanvas')) {
                document.removeEventListener('keydown', _llKeyDown); return;
            }
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault(); undo();
            }
            // Delete 키로 선택 박스 삭제
            if (e.key === 'Delete' && _selSet.size > 0 && !_selArrow) {
                delBox();
            }
        });
        _canvas.addEventListener('mousedown', e => {
            if (_arrowMode) {
                const rect = _canvas.getBoundingClientRect();
                _arrowDraft = { x1: Math.round(e.clientX-rect.left), y1: Math.round(e.clientY-rect.top) };
                e.preventDefault(); return;
            }
            if (e.target === _canvas) {
                _sel = _selArrow = null;
                _selSet.clear();
                _renderBoxes(); _renderArrows(); _renderPropPanel();
            }
        });
    }

    function _onBoxMouseDown(e) {
        if (e.button !== 0) return;
        if (_arrowMode) {
            const rect = _canvas.getBoundingClientRect();
            _arrowDraft = { x1: Math.round(e.clientX-rect.left), y1: Math.round(e.clientY-rect.top) };
            e.preventDefault(); e.stopPropagation(); return;
        }
        if (e.target.hasAttribute('data-resize')) return;
        const boxId = this.id.replace('llbox_', '');

        if (e.ctrlKey || e.metaKey) {
            /* ── Ctrl+클릭: 다중 선택 토글 ── */
            if (_selSet.has(boxId)) {
                _selSet.delete(boxId);
                if (_sel === boxId) {
                    _sel = _selSet.size > 0 ? [..._selSet][_selSet.size-1] : null;
                }
            } else {
                _selSet.add(boxId);
                _sel = boxId;
            }
            _selArrow = null;
            _renderBoxes(); _renderArrows(); _renderPropPanel();
            e.preventDefault(); e.stopPropagation(); return;
        }

        /* ── 일반 클릭: 단독 선택 ── */
        if (!_selSet.has(boxId)) {
            _selSet.clear();
            _selSet.add(boxId);
        }
        _sel = boxId; _selArrow = null;
        _renderBoxes(); _renderArrows(); _renderPropPanel();

        const b = _getBox(boxId);
        _pushHistory();   // 드래그 시작 전 상태 저장
        // 다중 선택된 박스들의 초기 위치 저장
        const others = [..._selSet]
            .filter(id => id !== boxId)
            .map(id => { const ob = _getBox(id); return ob ? {id, bx:ob.x, by:ob.y} : null; })
            .filter(Boolean);
        _drag = { id:boxId, ox:e.clientX, oy:e.clientY, bx:b.x, by:b.y, others };
        _resize = null;
        e.preventDefault(); e.stopPropagation();
    }

    function _onResizeStart(e) {
        e.stopPropagation(); e.preventDefault();
        const boxId = this.getAttribute('data-resize');
        const dir   = this.getAttribute('data-rdir') || 'corner';
        const b     = _getBox(boxId);
        _pushHistory();   // 리사이즈 시작 전 상태 저장
        _resize = { id:boxId, ox:e.clientX, oy:e.clientY, bw:b.w, bh:b.h, dir };
        _drag   = null;
    }

    function _onMouseMove(e) {
        if (_arrowDraft) {
            const rect = _canvas.getBoundingClientRect();
            _arrowDraft.x2 = Math.round(e.clientX-rect.left);
            _arrowDraft.y2 = Math.round(e.clientY-rect.top);
            _renderArrows(); return;
        }
        if (_drag) {
            const b    = _getBox(_drag.id);
            const rawX = _drag.bx + e.clientX - _drag.ox;
            const rawY = _drag.by + e.clientY - _drag.oy;
            const s = _calcSnap(b, rawX, rawY);
            b.x = Math.max(0, Math.min(CANVAS_W-b.w, s.x));
            b.y = Math.max(0, Math.min(CANVAS_H-b.h, s.y));
            _renderGuides(s.guides);
            const el = document.getElementById('llbox_'+b.id);
            if (el) { el.style.left = b.x+'px'; el.style.top = b.y+'px'; }
            // 다중 선택된 나머지 박스들도 같은 델타로 이동
            const dx = b.x - _drag.bx;
            const dy = b.y - _drag.by;
            (_drag.others || []).forEach(ob => {
                const other = _getBox(ob.id);
                if (!other) return;
                other.x = Math.max(0, Math.min(CANVAS_W-other.w, ob.bx + dx));
                other.y = Math.max(0, Math.min(CANVAS_H-other.h, ob.by + dy));
                const oel = document.getElementById('llbox_'+other.id);
                if (oel) { oel.style.left = other.x+'px'; oel.style.top = other.y+'px'; }
            });
            _markDirty();
        }
        if (_resize) {
            const b   = _getBox(_resize.id);
            const dir = _resize.dir;
            const rawW = dir!=='bottom' ? _resize.bw + e.clientX-_resize.ox : b.w;
            const rawH = dir!=='right'  ? _resize.bh + e.clientY-_resize.oy : b.h;
            const s = _calcResizeSnap(b, rawW, rawH, dir);
            b.w = Math.max(50, Math.min(CANVAS_W-b.x, s.w));
            b.h = Math.max(30, Math.min(CANVAS_H-b.y, s.h));
            _renderGuides(s.guides);
            const el = document.getElementById('llbox_'+b.id);
            if (el) { el.style.width = b.w+'px'; el.style.height = b.h+'px'; }
            _markDirty();
        }
    }

    function _onMouseUp() {
        if (_arrowDraft && _arrowDraft.x2 !== undefined) {
            const dx = _arrowDraft.x2-_arrowDraft.x1, dy = _arrowDraft.y2-_arrowDraft.y1;
            if (Math.hypot(dx,dy) > 15) {
                const id = 'arr_'+(_nextId++);
                _arrows.push({ id,
                    x1:_arrowDraft.x1, y1:_arrowDraft.y1,
                    x2:_arrowDraft.x2, y2:_arrowDraft.y2,
                    color:'#1e293b', strokeWidth:2, dashed:false, label:'',
                });
                _selArrow = id; _sel = null;
                _markDirty(); _renderPropPanel();
            }
            _arrowDraft = null; _renderArrows(); return;
        }
        if (_drag || _resize) {
            _drag = null; _resize = null;
            _clearGuides(); _renderBoxes();
        }
    }

    function _onBoxDblClick(e) {
        _startInlineEdit(this.id.replace('llbox_',''));
        e.stopPropagation();
    }

    /* ══════════════════════════════════════
       인라인 편집
    ══════════════════════════════════════ */
    function _startInlineEdit(boxId) {
        const b  = _getBox(boxId);
        const el = document.getElementById('llbox_'+boxId);
        if (!b || !el) return;
        el.innerHTML = '';
        const ta = document.createElement('textarea');
        ta.value = b.label;
        ta.style.cssText = `
            width:92%;height:82%;resize:none;
            background:rgba(255,255,255,0.92);
            border:none;border-bottom:2px solid #6366f1;
            border-radius:4px;
            font-size:${b.fontSize||11}px;
            font-weight:${b.bold?'700':'500'};
            color:${b.textColor||'#1e293b'};
            text-align:center;outline:none;
            padding:3px;line-height:1.35;`;
        el.appendChild(ta);
        ta.focus(); ta.select();
        const commit = () => {
            b.label = ta.value; _markDirty();
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
        const b      = _sel ? _getBox(_sel) : null;
        const dupBtn = document.getElementById('llBtnDup');
        const delBtn = document.getElementById('llBtnDel');
        const cntBadge = document.getElementById('llSelCount');
        const hasSel = _selSet.size > 0;
        if (dupBtn) dupBtn.disabled = !hasSel;
        if (delBtn) delBtn.disabled = !hasSel;
        if (cntBadge) {
            if (_selSet.size > 1) {
                cntBadge.textContent = `${_selSet.size}개 선택`;
                cntBadge.style.display = '';
            } else {
                cntBadge.style.display = 'none';
            }
        }

        /* 화살표 속성 */
        const a = (!b && _selArrow) ? _arrows.find(x => x.id === _selArrow) : null;
        if (a) {
            const AC = ['#1e293b','#dc2626','#2563eb','#16a34a','#ca8a04','#7c3aed','#0891b2','#ea580c'];
            _propPanel.innerHTML = `
            <div style="font-weight:600;font-size:0.88rem;margin-bottom:12px;">↗ 화살표 속성</div>
            <label style="font-size:0.75rem;color:var(--text-secondary);">레이블</label>
            <input type="text" value="${_esc(a.label||'')}" class="form-input"
                   style="width:100%;margin:3px 0 10px;font-size:0.82rem;"
                   oninput="LaserLayoutModule._arrowPropChange('label',this.value)" placeholder="예: 입고 동선">
            <label style="font-size:0.75rem;color:var(--text-secondary);">색상</label>
            <div style="display:flex;align-items:center;gap:5px;margin:4px 0 10px;flex-wrap:wrap;">
              <input type="color" value="${a.color||'#1e293b'}"
                     style="width:28px;height:28px;padding:0;border-radius:3px;cursor:pointer;"
                     onchange="LaserLayoutModule._arrowPropChange('color',this.value)">
              ${AC.map(c=>`<div onclick="LaserLayoutModule._arrowPropChange('color','${c}')"
                   style="width:22px;height:22px;border-radius:4px;background:${c};cursor:pointer;
                          border:2px solid ${a.color===c?'#6366f1':'transparent'};"></div>`).join('')}
            </div>
            <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
              <input type="range" min="1" max="10" value="${a.strokeWidth||2}" style="flex:1;"
                     oninput="LaserLayoutModule._arrowPropChange('strokeWidth',+this.value);this.nextElementSibling.textContent=this.value+'px'">
              <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${a.strokeWidth||2}px</span>
            </div>
            <label style="font-size:0.75rem;color:var(--text-secondary);">선 스타일</label>
            <div style="display:flex;gap:5px;margin:3px 0 12px;">
              <button class="btn btn-sm ${!a.dashed?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                      onclick="LaserLayoutModule._arrowPropChange('dashed',false)">━ 실선</button>
              <button class="btn btn-sm ${a.dashed?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                      onclick="LaserLayoutModule._arrowPropChange('dashed',true)">┄ 점선</button>
            </div>
            <label style="font-size:0.75rem;color:var(--text-secondary);">방향</label>
            <div style="display:flex;gap:5px;margin:3px 0 14px;">
              <button class="btn btn-sm ${!a.twoWay?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                      onclick="LaserLayoutModule._arrowPropChange('twoWay',false)">→ 단방향</button>
              <button class="btn btn-sm ${a.twoWay?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                      onclick="LaserLayoutModule._arrowPropChange('twoWay',true)">↔ 양방향</button>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:10px;">
              <button class="btn btn-outline btn-sm" style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                      onclick="LaserLayoutModule._delArrow()">
                <span class="material-symbols-outlined" style="font-size:14px;">delete</span> 화살표 삭제
              </button>
            </div>`;
            return;
        }

        if (!b) {
            _propPanel.innerHTML = `<p style="color:var(--text-muted);font-size:0.83rem;
                text-align:center;margin-top:50px;line-height:1.8;">
                박스를 선택하면<br>속성을 편집할 수 있습니다</p>`;
            return;
        }

        _propPanel.innerHTML = `
        <div style="font-weight:600;font-size:0.88rem;margin-bottom:12px;">✏️ 박스 속성</div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">이름 (줄바꿈: Enter)</label>
        <textarea id="llPropLabel" rows="3" class="form-input"
            style="width:100%;margin:3px 0 10px;resize:vertical;font-size:0.82rem;"
            oninput="LaserLayoutModule._propChange('label',this.value)">${_esc(b.label)}</textarea>
        <label style="font-size:0.75rem;color:var(--text-secondary);">위치 X / Y</label>
        <div style="display:flex;gap:5px;margin:3px 0 8px;">
          <input type="number" value="${b.x}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="LaserLayoutModule._propChange('x',+this.value)">
          <input type="number" value="${b.y}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="LaserLayoutModule._propChange('y',+this.value)">
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">크기 W × H</label>
        <div style="display:flex;gap:5px;margin:3px 0 10px;">
          <input type="number" value="${b.w}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="LaserLayoutModule._propChange('w',Math.max(50,+this.value))">
          <input type="number" value="${b.h}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="LaserLayoutModule._propChange('h',Math.max(30,+this.value))">
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">글자 크기</label>
        <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
          <input type="range" min="8" max="22" value="${b.fontSize||11}" style="flex:1;"
                 oninput="LaserLayoutModule._propChange('fontSize',+this.value);this.nextElementSibling.textContent=this.value+'px'">
          <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${b.fontSize||11}px</span>
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
        <div style="display:flex;gap:5px;margin:3px 0 12px;">
          <button class="btn btn-sm ${b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-weight:700;font-size:0.8rem;"
                  onclick="LaserLayoutModule._propChange('bold',true)">굵게</button>
          <button class="btn btn-sm ${!b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                  onclick="LaserLayoutModule._propChange('bold',false)">보통</button>
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">배경색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${PALETTE.map(c=>`
            <div onclick="LaserLayoutModule._propChange('color','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.color===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.color||'#ffffff'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="LaserLayoutModule._propChange('color',this.value)">
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">테두리색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${BORDER_PALETTE.map(c=>`
            <div onclick="LaserLayoutModule._propChange('borderColor','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.borderColor===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.borderColor||'#94a3b8'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="LaserLayoutModule._propChange('borderColor',this.value)">
        </div>
        <label style="font-size:0.75rem;color:var(--text-secondary);">글자색</label>
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 16px;">
          <input type="color" value="${b.textColor||'#1e293b'}"
                 style="width:34px;height:26px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="LaserLayoutModule._propChange('textColor',this.value)">
          <span style="font-size:0.77rem;color:var(--text-secondary);">클릭해서 선택</span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <button class="btn btn-outline btn-sm" style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                  onclick="LaserLayoutModule.delBox()">
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
        if (key !== 'label') _pushHistory();   // 레이블은 타이핑 중 히스토리 폭발 방지
        b[key] = value;
        _markDirty();
        _renderBoxes();
        if (key !== 'label') _renderPropPanel();
    }

    /* ══════════════════════════════════════
       박스 CRUD
    ══════════════════════════════════════ */
    function addBox() {
        _pushHistory();
        const id = 'box_'+(_nextId++);
        _boxes.push({ id, label:'새 품목', x:_snap(50), y:_snap(50),
            w:90, h:60, color:'#dbeafe', borderColor:'#3b82f6',
            textColor:'#1e3a8a', fontSize:11, bold:true });
        _sel = id; _selSet.clear(); _selSet.add(id);
        _markDirty(); _renderBoxes(); _renderPropPanel();
        setTimeout(() => _startInlineEdit(id), 40);
    }

    function dupBox() {
        if (_selSet.size === 0) return;
        _pushHistory();
        const newSel = new Set();
        let lastId = null;
        _selSet.forEach(sid => {
            const b = _getBox(sid);
            if (!b) return;
            const id = 'box_'+(_nextId++);
            _boxes.push(Object.assign({}, b, { id, x:b.x+15, y:b.y+15 }));
            newSel.add(id); lastId = id;
        });
        _selSet = newSel; _sel = lastId;
        _markDirty(); _renderBoxes(); _renderPropPanel();
    }

    function delBox() {
        if (_selSet.size === 0) return;
        const count = _selSet.size;
        if (!confirm(`선택한 박스 ${count}개를 삭제할까요?`)) return;
        _pushHistory();
        _boxes = _boxes.filter(b => !_selSet.has(b.id));
        _sel   = null; _selSet.clear();
        _markDirty(); _renderBoxes(); _renderPropPanel();
    }

    /* ══════════════════════════════════════
       저장 / 초기화 / 뒤로가기
    ══════════════════════════════════════ */
    async function saveLayout() {
        try {
            await Storage.setConfigValue(CONFIG_KEY, { boxes:_boxes, arrows:_arrows });
            _isDirty = false;
            const badge = document.getElementById('llDirtyBadge');
            if (badge) badge.style.display = 'none';
            UIUtils.toast('레이아웃을 저장했습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function resetLayout() {
        if (!confirm('기본 레이아웃으로 초기화할까요?\n현재 배치가 모두 사라집니다.')) return;
        _pushHistory();
        _boxes    = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        _arrows   = [];
        _sel      = _selArrow = null; _selSet.clear();
        _nextId   = 500;
        _markDirty(); _renderBoxes(); _renderArrows(); _renderPropPanel();
        UIUtils.toast('기본 레이아웃으로 초기화했습니다.', 'info');
    }

    function goBack() {
        if (_isDirty && !confirm('저장하지 않은 변경 사항이 있습니다.\n그래도 이동할까요?')) return;
        document.removeEventListener('mousemove', _onMouseMove);
        document.removeEventListener('mouseup',   _onMouseUp);
        Router.navigate('laser-standby');
    }

    /* ══════════════════════════════════════
       화살표 모드 토글
    ══════════════════════════════════════ */
    function toggleArrowMode() {
        _arrowMode  = !_arrowMode;
        _arrowDraft = null;
        const btn = document.getElementById('llArrowBtn');
        if (btn) {
            if (_arrowMode) {
                btn.style.background  = '#0891b2';
                btn.style.color       = '#fff';
                btn.style.borderColor = '#0891b2';
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표 ON';
                if (_canvas) _canvas.style.cursor = 'crosshair';
            } else {
                btn.style.background  = 'transparent';
                btn.style.color       = 'var(--text-secondary)';
                btn.style.borderColor = 'var(--border)';
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표';
                if (_canvas) _canvas.style.cursor = 'default';
            }
        }
    }

    /* ══════════════════════════════════════
       화살표 SVG 렌더링
    ══════════════════════════════════════ */
    function _renderArrows() {
        if (!_svgLayer) return;
        _svgLayer.innerHTML = '';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const allArrows = _arrowDraft && _arrowDraft.x2 !== undefined
            ? [..._arrows, { id:'__draft__', color:'#6366f1', twoWay:false }]
            : _arrows;

        allArrows.forEach(a => {
            const color = a.id === '__draft__' ? '#6366f1' : (a.color||'#1e293b');
            const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            m.setAttribute('id','ah_e_'+a.id); m.setAttribute('markerWidth','10'); m.setAttribute('markerHeight','7');
            m.setAttribute('refX','9'); m.setAttribute('refY','3.5'); m.setAttribute('orient','auto');
            const p = document.createElementNS('http://www.w3.org/2000/svg','polygon');
            p.setAttribute('points','0 0,10 3.5,0 7'); p.setAttribute('fill',color);
            m.appendChild(p); defs.appendChild(m);
            if (a.twoWay) {
                const m2 = document.createElementNS('http://www.w3.org/2000/svg','marker');
                m2.setAttribute('id','ah_s_'+a.id); m2.setAttribute('markerWidth','10'); m2.setAttribute('markerHeight','7');
                m2.setAttribute('refX','1'); m2.setAttribute('refY','3.5'); m2.setAttribute('orient','auto-start-reverse');
                const p2 = document.createElementNS('http://www.w3.org/2000/svg','polygon');
                p2.setAttribute('points','0 0,10 3.5,0 7'); p2.setAttribute('fill',color);
                m2.appendChild(p2); defs.appendChild(m2);
            }
        });
        _svgLayer.appendChild(defs);

        _arrows.forEach(a => {
            const isSel = (a.id === _selArrow);
            const color = a.color||'#1e293b';
            const sw    = a.strokeWidth||2;
            const dash  = a.dashed ? '10,5' : '';

            if (isSel) {
                const hl = document.createElementNS('http://www.w3.org/2000/svg','line');
                hl.setAttribute('x1',a.x1); hl.setAttribute('y1',a.y1);
                hl.setAttribute('x2',a.x2); hl.setAttribute('y2',a.y2);
                hl.setAttribute('stroke','rgba(99,102,241,0.3)'); hl.setAttribute('stroke-width',sw+8);
                hl.setAttribute('stroke-linecap','round'); _svgLayer.appendChild(hl);
            }

            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1',a.x1); line.setAttribute('y1',a.y1);
            line.setAttribute('x2',a.x2); line.setAttribute('y2',a.y2);
            line.setAttribute('stroke', isSel?'#6366f1':color); line.setAttribute('stroke-width',sw);
            line.setAttribute('stroke-linecap','round');
            if (dash) line.setAttribute('stroke-dasharray',dash);
            line.setAttribute('marker-end','url(#ah_e_'+a.id+')');
            if (a.twoWay) line.setAttribute('marker-start','url(#ah_s_'+a.id+')');
            _svgLayer.appendChild(line);

            const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
            hit.setAttribute('x1',a.x1); hit.setAttribute('y1',a.y1);
            hit.setAttribute('x2',a.x2); hit.setAttribute('y2',a.y2);
            hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','14');
            hit.style.cursor='pointer'; hit.style.pointerEvents='all';
            hit.addEventListener('mousedown', ev => {
                ev.stopPropagation();
                _selArrow=a.id; _sel=null;
                _renderBoxes(); _renderArrows(); _renderPropPanel();
            });
            _svgLayer.appendChild(hit);

            if (a.label) {
                const mx=(a.x1+a.x2)/2, my=(a.y1+a.y2)/2, tw=a.label.length*7+8;
                const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
                bg.setAttribute('x',mx-tw/2); bg.setAttribute('y',my-17);
                bg.setAttribute('width',tw); bg.setAttribute('height',14); bg.setAttribute('rx','3');
                bg.setAttribute('fill','rgba(255,255,255,0.85)'); _svgLayer.appendChild(bg);
                const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
                txt.setAttribute('x',mx); txt.setAttribute('y',my-6); txt.setAttribute('text-anchor','middle');
                txt.setAttribute('fill', isSel?'#6366f1':color);
                txt.setAttribute('font-size','11'); txt.setAttribute('font-weight','700');
                txt.setAttribute('pointer-events','none'); txt.textContent=a.label;
                _svgLayer.appendChild(txt);
            }
        });

        if (_arrowDraft && _arrowDraft.x2 !== undefined) {
            const dl = document.createElementNS('http://www.w3.org/2000/svg','line');
            dl.setAttribute('x1',_arrowDraft.x1); dl.setAttribute('y1',_arrowDraft.y1);
            dl.setAttribute('x2',_arrowDraft.x2); dl.setAttribute('y2',_arrowDraft.y2);
            dl.setAttribute('stroke','#6366f1'); dl.setAttribute('stroke-width','2');
            dl.setAttribute('stroke-dasharray','8,4'); dl.setAttribute('stroke-linecap','round');
            dl.setAttribute('marker-end','url(#ah_e___draft__)'); _svgLayer.appendChild(dl);
        }
    }

    function _arrowPropChange(key, value) {
        const a = _arrows.find(x => x.id === _selArrow);
        if (!a) return;
        if (key !== 'label') _pushHistory();
        a[key] = value; _markDirty(); _renderArrows();
        if (key !== 'label') _renderPropPanel();
    }

    function _delArrow() {
        if (!_selArrow) return;
        _pushHistory();
        _arrows   = _arrows.filter(a => a.id !== _selArrow);
        _selArrow = null; _markDirty(); _renderArrows(); _renderPropPanel();
    }

    /* ══════════════════════════════════════
       인쇄
    ══════════════════════════════════════ */
    function printLayout() {
        const pw = window.open('', '_blank', 'width=1100,height=850');
        if (!pw) { alert('팝업이 차단되었습니다.\n브라우저 팝업 허용 후 다시 시도하세요.'); return; }

        const boxesHtml = _boxes.map(b => {
            const border = b.borderColor==='transparent' ? 'none' : `2px solid ${b.borderColor||'#94a3b8'}`;
            const lbl = String(b.label||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
            return `<div style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;
                background:${b.color||'#fff'};border:${border};border-radius:5px;
                display:flex;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;">
              <span style="color:${b.textColor||'#1e293b'};font-size:${b.fontSize||11}px;
                font-weight:${b.bold?'700':'500'};text-align:center;padding:3px 5px;
                white-space:pre-line;line-height:1.35;word-break:break-word;">${lbl}</span>
            </div>`;
        }).join('');

        let arrowsSvg = '';
        if (_arrows.length) {
            let defs = '<defs>';
            _arrows.forEach(a => {
                const c = a.color||'#1e293b';
                defs += `<marker id="pah_e_${a.id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                           <polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
                if (a.twoWay) defs += `<marker id="pah_s_${a.id}" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
                           <polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
            });
            defs += '</defs>';
            let lines = '';
            _arrows.forEach(a => {
                const c=a.color||'#1e293b', sw=a.strokeWidth||2;
                const dash=a.dashed?'stroke-dasharray="10,5"':'';
                const tw=a.twoWay?`marker-start="url(#pah_s_${a.id})"`:'';
                lines += `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}"
                    stroke="${c}" stroke-width="${sw}" stroke-linecap="round" ${dash} ${tw}
                    marker-end="url(#pah_e_${a.id})"/>`;
                if (a.label) {
                    const mx=(a.x1+a.x2)/2, my=(a.y1+a.y2)/2, tw2=a.label.length*7+8;
                    lines += `<rect x="${mx-tw2/2}" y="${my-17}" width="${tw2}" height="14" rx="3" fill="rgba(255,255,255,0.85)"/>
                              <text x="${mx}" y="${my-6}" text-anchor="middle" fill="${c}" font-size="11" font-weight="700">${a.label}</text>`;
                }
            });
            arrowsSvg = `<svg style="position:absolute;top:0;left:0;width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:visible;pointer-events:none;">${defs}${lines}</svg>`;
        }

        const today = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'});
        pw.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>레이져 대기품 레이아웃</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;background:#f1f5f9;
       display:flex;flex-direction:column;align-items:center;padding:10px 12px 16px;}
  @page{size:A3 landscape;margin:8mm;}
  @media print{body{background:#fff;padding:0;} .no-print{display:none!important;}
    #scaleWrap{width:${CANVAS_W}px!important;height:${CANVAS_H}px!important;}
    #canvasInner{transform:none!important;}}
  .top-bar{width:100%;max-width:${CANVAS_W}px;display:flex;justify-content:space-between;
    align-items:center;margin-bottom:8px;font-size:12px;color:#64748b;
    background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;}
  #scaleWrap{position:relative;overflow:hidden;flex-shrink:0;border-radius:8px;
    box-shadow:0 4px 20px rgba(0,0,0,0.15);}
  #canvasInner{position:absolute;top:0;left:0;width:${CANVAS_W}px;height:${CANVAS_H}px;
    transform-origin:top left;background:#d1d5db;
    background-image:linear-gradient(rgba(0,0,0,0.04) 1px,transparent 1px),
      linear-gradient(90deg,rgba(0,0,0,0.04) 1px,transparent 1px);
    background-size:50px 50px;}
  .footer-bar{width:100%;max-width:${CANVAS_W}px;display:flex;justify-content:space-between;
    align-items:center;margin-top:10px;font-size:11px;color:#94a3b8;}
  .btn-print{padding:9px 32px;background:#0891b2;color:#fff;border:none;border-radius:6px;
    font-size:14px;font-weight:700;cursor:pointer;}
  .btn-print:hover{background:#0e7490;}
</style></head><body>
  <div class="top-bar no-print">
    <span>🖨&nbsp; 인쇄 버튼을 누르거나 <kbd>Ctrl+P</kbd> 를 사용하세요</span>
    <span>${today} 출력</span>
  </div>
  <div id="scaleWrap"><div id="canvasInner">${boxesHtml}${arrowsSvg}</div></div>
  <div class="footer-bar">
    <span>2층 도장라인 레이져 대기 LAY-OUT</span>
    <button class="btn-print no-print" onclick="window.print()">🖨 &nbsp;인쇄 / PDF 저장</button>
    <span>출력일: ${today}</span>
  </div>
<script>
(function(){
  var CW=${CANVAS_W},CH=${CANVAS_H},PAD=24,TOP=100,BOT=60;
  function applyScale(){
    var availW=window.innerWidth-PAD, availH=window.innerHeight-TOP-BOT;
    var scale=Math.min(availW/CW,availH/CH,1);
    var wrap=document.getElementById('scaleWrap'), inner=document.getElementById('canvasInner');
    wrap.style.width=Math.round(CW*scale)+'px'; wrap.style.height=Math.round(CH*scale)+'px';
    inner.style.transform='scale('+scale+')';
  }
  applyScale(); window.addEventListener('resize',applyScale);
})();
<\/script></body></html>`);
        pw.document.close();
    }

    /* ══════════════════════════════════════
       리사이즈 핸들
    ══════════════════════════════════════ */
    function _makeHandle(boxId, dir) {
        const el = document.createElement('div');
        const C  = '#6366f1';
        if (dir === 'right') {
            el.style.cssText = `position:absolute;right:-4px;top:50%;transform:translateY(-50%);
                width:8px;height:28px;background:${C};border-radius:4px;cursor:ew-resize;z-index:5;opacity:0.9;`;
        } else if (dir === 'bottom') {
            el.style.cssText = `position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);
                width:28px;height:8px;background:${C};border-radius:4px;cursor:ns-resize;z-index:5;opacity:0.9;`;
        } else {
            el.style.cssText = `position:absolute;right:0;bottom:0;width:16px;height:16px;background:${C};
                border-radius:3px 0 4px 0;cursor:nwse-resize;z-index:5;
                display:flex;align-items:center;justify-content:center;`;
            el.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <line x1="1" y1="9" x2="9" y2="1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="4" y1="9" x2="9" y2="4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="7" y1="9" x2="9" y2="7" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        }
        el.setAttribute('data-resize', boxId);
        el.setAttribute('data-rdir',   dir);
        el.addEventListener('mousedown', _onResizeStart, { passive:false });
        return el;
    }

    /* ══════════════════════════════════════
       자석 스냅
    ══════════════════════════════════════ */
    function toggleSnap() {
        _snapEnabled = !_snapEnabled;
        const btn = document.getElementById('llSnapBtn');
        if (btn) {
            if (_snapEnabled) {
                btn.style.background='#6366f1'; btn.style.color='#fff'; btn.style.borderColor='#6366f1';
                btn.innerHTML='자석 ON';
            } else {
                btn.style.background='transparent'; btn.style.color='var(--text-secondary)'; btn.style.borderColor='var(--border)';
                btn.innerHTML='자석 OFF';
            }
        }
    }

    function _calcSnap(b, rawX, rawY) {
        let nx = _snap(rawX), ny = _snap(rawY);
        const guides = [];
        if (!_snapEnabled) return { x:nx, y:ny, guides };
        const others = _boxes.filter(o => o.id !== b.id);
        let bestX=SNAP_THRESHOLD+1, bestY=SNAP_THRESHOLD+1, gX=null, gY=null, gXR=null, gYR=null;
        for (const o of others) {
            const ol=o.x, or_=o.x+o.w, ot=o.y, ob=o.y+o.h;
            const xC=[
                {d:Math.abs(rawX-ol),snap:ol,g:ol},{d:Math.abs(rawX-or_),snap:or_,g:or_},
                {d:Math.abs(rawX+b.w-ol),snap:ol-b.w,g:ol},{d:Math.abs(rawX+b.w-or_),snap:or_-b.w,g:or_},
                {d:Math.abs(rawX+b.w/2-(ol+o.w/2)),snap:ol+o.w/2-b.w/2,g:ol+o.w/2},
            ];
            for (const c of xC) if(c.d<bestX){bestX=c.d;nx=c.snap;gX=c.g;gXR={start:Math.min(o.y,rawY),end:Math.max(ob,rawY+b.h)};}
            const yC=[
                {d:Math.abs(rawY-ot),snap:ot,g:ot},{d:Math.abs(rawY-ob),snap:ob,g:ob},
                {d:Math.abs(rawY+b.h-ot),snap:ot-b.h,g:ot},{d:Math.abs(rawY+b.h-ob),snap:ob-b.h,g:ob},
                {d:Math.abs(rawY+b.h/2-(ot+o.h/2)),snap:ot+o.h/2-b.h/2,g:ot+o.h/2},
            ];
            for (const c of yC) if(c.d<bestY){bestY=c.d;ny=c.snap;gY=c.g;gYR={start:Math.min(o.x,rawX),end:Math.max(or_,rawX+b.w)};}
        }
        if(bestX<=SNAP_THRESHOLD&&gX!==null) guides.push({type:'v',pos:gX,start:gXR.start,end:gXR.end});
        if(bestY<=SNAP_THRESHOLD&&gY!==null) guides.push({type:'h',pos:gY,start:gYR.start,end:gYR.end});
        return {x:nx,y:ny,guides};
    }

    function _calcResizeSnap(b, rawW, rawH, dir) {
        let nw=_snap(rawW), nh=_snap(rawH);
        const guides=[];
        if(!_snapEnabled) return {w:nw,h:nh,guides};
        const others=_boxes.filter(o=>o.id!==b.id);
        if(dir!=='bottom'){
            const re=b.x+rawW; let bestD=SNAP_THRESHOLD+1,gX=null,gR=null;
            for(const o of others){
                const cands=[
                    {d:Math.abs(rawW-o.w),sw:o.w,gx:b.x+o.w},{d:Math.abs(re-o.x),sw:o.x-b.x,gx:o.x},
                    {d:Math.abs(re-(o.x+o.w)),sw:o.x+o.w-b.x,gx:o.x+o.w},
                ];
                for(const c of cands) if(c.d<bestD&&c.sw>=50){bestD=c.d;nw=c.sw;gX=c.gx;gR={start:Math.min(o.y,b.y),end:Math.max(o.y+o.h,b.y+rawH)};}
            }
            if(bestD<=SNAP_THRESHOLD&&gX!==null) guides.push({type:'v',pos:gX,start:gR.start,end:gR.end});
        }
        if(dir!=='right'){
            const be=b.y+rawH; let bestD=SNAP_THRESHOLD+1,gY=null,gR=null;
            for(const o of others){
                const cands=[
                    {d:Math.abs(rawH-o.h),sh:o.h,gy:b.y+o.h},{d:Math.abs(be-o.y),sh:o.y-b.y,gy:o.y},
                    {d:Math.abs(be-(o.y+o.h)),sh:o.y+o.h-b.y,gy:o.y+o.h},
                ];
                for(const c of cands) if(c.d<bestD&&c.sh>=30){bestD=c.d;nh=c.sh;gY=c.gy;gR={start:Math.min(o.x,b.x),end:Math.max(o.x+o.w,b.x+rawW)};}
            }
            if(bestD<=SNAP_THRESHOLD&&gY!==null) guides.push({type:'h',pos:gY,start:gR.start,end:gR.end});
        }
        return {w:nw,h:nh,guides};
    }

    function _renderGuides(guides) {
        _clearGuides();
        if (!_canvas || !guides.length) return;
        guides.forEach(g => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute;pointer-events:none;z-index:999;background:rgba(99,102,241,0.75);`;
            if (g.type==='v') { el.style.left=(g.pos-0.5)+'px'; el.style.top=(g.start||0)+'px'; el.style.width='1.5px'; el.style.height=((g.end-g.start)||CANVAS_H)+'px'; }
            else               { el.style.left=(g.start||0)+'px'; el.style.top=(g.pos-0.5)+'px'; el.style.width=((g.end-g.start)||CANVAS_W)+'px'; el.style.height='1.5px'; }
            _canvas.appendChild(el);
            _guideEls.push(el);
        });
    }

    function _clearGuides() { _guideEls.forEach(el=>el.remove()); _guideEls=[]; }

    /* ══════════════════════════════════════
       되돌리기 (Undo)
    ══════════════════════════════════════ */
    function _pushHistory() {
        _history.push({
            boxes:   JSON.parse(JSON.stringify(_boxes)),
            arrows:  JSON.parse(JSON.stringify(_arrows)),
        });
        if (_history.length > MAX_HISTORY) _history.shift();
        _updateUndoBtn();
    }

    function undo() {
        if (_history.length === 0) { UIUtils.toast('더 이상 되돌릴 수 없습니다.', 'info'); return; }
        const snap = _history.pop();
        _boxes  = snap.boxes;
        _arrows = snap.arrows;
        _sel    = null; _selSet.clear(); _selArrow = null;
        _markDirty(); _renderBoxes(); _renderArrows(); _renderPropPanel();
        _updateUndoBtn();
        UIUtils.toast('되돌렸습니다.', 'info');
    }

    function _updateUndoBtn() {
        const btn = document.getElementById('llUndoBtn');
        if (!btn) return;
        btn.disabled = (_history.length === 0);
        btn.title = _history.length > 0 ? `되돌리기 (${_history.length}단계)` : '되돌릴 내용 없음';
    }

    /* ══════════════════════════════════════
       유틸
    ══════════════════════════════════════ */
    function _getBox(id) { return _boxes.find(b=>b.id===id); }
    function _snap(v)    { return Math.round(v/GRID)*GRID; }
    function _esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _markDirty() {
        _isDirty = true;
        const badge = document.getElementById('llDirtyBadge');
        if (badge) badge.style.display = '';
    }

    return {
        init, render, addBox, dupBox, delBox,
        saveLayout, resetLayout, goBack, printLayout,
        undo, _propChange, toggleSnap,
        toggleArrowMode, _arrowPropChange, _delArrow,
    };
})();
