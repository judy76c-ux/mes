/**
 * 도료 보관 창고 레이아웃 편집기
 * - 도료 보관 창고의 배치를 시각적으로 편집
 * - 박스 드래그 이동, 리사이즈, 텍스트 편집
 * - 저장: Storage.setConfigValue('paint_layout_v1', {...})
 */
var PaintLayoutModule = (function () {

    /* ══════════════════════════════════════
       상수
    ══════════════════════════════════════ */
    const CONFIG_KEY = 'paint_layout_v1';
    const CANVAS_W   = 1420;
    const CANVAS_H   = 800;
    const GRID            = 5;
    const SNAP_THRESHOLD  = 10;  // 자석 스냅 감지 거리(px)

    /* 메인 그리드 (10열) */
    const MX = 10, MCW = 85, MCG = 3;     // 시작X, 열너비, 간격
    const mc  = n => MX + n * (MCW + MCG); // n번 열 x좌표
    const mw  = n => MCW * n + MCG * (n-1);// n열 합산 너비

    /* 섹션1 행 (파란) */
    const S1Y = 120, S1H = 70, S1G = 3;
    const s1y = r => S1Y + r * (S1H + S1G);

    /* 섹션2 행 (노란) */
    const S2Y = 448, S2H = 63, S2G = 3;
    const s2y = r => S2Y + r * (S2H + S2G);

    /* 오른쪽 패널 */
    const RA_X = 910, RB_X = 1035, RC_X = 1165;
    const R_W  = 115, RC_W = 215;
    const RRY  = 200, RRH  = 90,  RRG = 4;
    const rry  = r => RRY + r * (RRH + RRG);

    /* 색상 세트 */
    const BLUE   = { color:'#bfdbfe', borderColor:'#2563eb', textColor:'#1e3a8a' };
    const YELLOW = { color:'#fef9c3', borderColor:'#ca8a04', textColor:'#713f12' };
    const PINK   = { color:'#fce7f3', borderColor:'#db2777', textColor:'#831843' };
    const LBLUE  = { color:'#e0f2fe', borderColor:'#0284c7', textColor:'#0c4a6e' };
    const GRAY   = { color:'#f1f5f9', borderColor:'#cbd5e1', textColor:'#64748b' };
    const LGRAY  = { color:'#f8fafc', borderColor:'#e2e8f0', textColor:'#94a3b8' };

    const PALETTE = [
        '#bfdbfe','#e0f2fe','#dbeafe','#fce7f3','#fef9c3',
        '#dcfce7','#fff7ed','#fef2f2','#f1f5f9','#fafafa',
        '#ede9fe','#ecfdf5',
    ];
    const BORDER_PALETTE = [
        '#2563eb','#0284c7','#1d4ed8','#db2777','#ca8a04',
        '#16a34a','#ea580c','#dc2626','#7c3aed','#64748b',
        '#0891b2','#374151',
    ];

    /* ══════════════════════════════════════
       박스 생성 헬퍼
    ══════════════════════════════════════ */
    let _uid = 1;
    function _b(label, x, y, w, h, scheme, extra) {
        return Object.assign(
            { id:'pb_'+(_uid++), label, x, y, w, h, fontSize:11, bold:true },
            scheme, extra || {}
        );
    }

    /* ══════════════════════════════════════
       기본 레이아웃 (도료 보관 창고 실제 배치)
    ══════════════════════════════════════ */
    const DEFAULT_BOXES = (function () {
        _uid = 1;
        const boxes = [];

        /* ── 제목 ── */
        boxes.push(_b('도료 보관 창고  LAY - OUT', 290, 6, 560, 46,
            { color:'#ffffff', borderColor:'transparent', textColor:'#0f172a', fontSize:18, bold:true }));

        /* ── 현황판 ── */
        boxes.push(_b('현 황 판', 910, 118, 180, 42, LGRAY, { fontSize:13 }));

        /* ────────────────────────────────
           섹션1 (파란색 구역)
        ──────────────────────────────── */
        /* 선입선출 마커 */
        boxes.push(_b('↑ 선입선출', mc(1), 95, 175, 22,
            { color:'transparent', borderColor:'transparent', textColor:'#1d4ed8', fontSize:12, bold:true }));

        /* 세척신나 (col9, 4행 공통) */
        for (let r = 0; r < 4; r++) {
            boxes.push(_b('세척신나', mc(9), s1y(r), MCW, S1H, BLUE));
        }
        /* 빈칸 (col7,8 행0~3) */
        for (let r = 0; r < 4; r++) {
            boxes.push(_b('', mc(7), s1y(r), MCW, S1H, LGRAY, { bold:false }));
            boxes.push(_b('', mc(8), s1y(r), MCW, S1H, LGRAY, { bold:false }));
        }

        /* 섹션1 행0 */
        const r0 = [
            '995 C.A','995 C.A','0278(HMC)신나','KUB 1000\nBLACK(S)',
            'KUT-1000(L) uv','A-PRIMER\n(DARK)','TH0003',
        ];
        r0.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s1y(0), MCW, S1H, BLUE)));

        /* 섹션1 행1 */
        const r1 = [
            '1PH','GRAY(75)','BLACK\n(J71E02)','KCD\n회석제',
            'KCD\n회석제','XFD-BLACK','XFD-BLACK',
        ];
        r1.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s1y(1), MCW, S1H, BLUE)));

        /* 섹션1 행2 */
        const r2 = [
            'PIANO BLACK\n(PK-2)','RUT-1210\n하도신나','080F신나\n(BTX-F)','B/C\nPIANO BLACK',
            'SHIELDING\nBLACK','INTEC#100\nP-PRIMER','KUB-CLEAR\n(TH)',
        ];
        r2.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s1y(2), MCW, S1H, BLUE)));

        /* 섹션1 행3 (빈칸) */
        for (let c = 0; c < 7; c++) {
            boxes.push(_b('', mc(c), s1y(3), MCW, S1H, LGRAY, { bold:false }));
        }

        /* ────────────────────────────────
           섹션2 (노란색 구역)
        ──────────────────────────────── */
        boxes.push(_b('↑ 선입선출', mc(1), S2Y - 25, 175, 22,
            { color:'transparent', borderColor:'transparent', textColor:'#ca8a04', fontSize:12, bold:true }));

        /* 섹션2 행0 */
        const y0 = [
            'DH-230','NAU-700\nXFD BLACK','NUH#3000\nCR-CLEAR\n(KC)-MATT','DH-350',
            'DH-350','SY#6000\nEXR-CLEAR','SY#6000\nEXR-CLEAR',
            'DR-705\n신나(표준)','DR-705\n신나(표준)','DR-705\n신나(표준)',
        ];
        y0.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s2y(0), MCW, S2H, YELLOW)));

        /* 섹션2 행1 */
        const y1 = [
            'NAU-700\nPEAL GREY\n(DYS)','NAU-700\nXFD GRAY','NUH#1100\nBASE WHITE','NAU-700 6PS',
            'NAU-700 6PS','CF 3000\nTOP CLEAR','CF 3000\nTOP CLEAR',
            'DR-705\n신나(지건)','DR-705\n신나(지건)','DR-705\n신나(지건)',
        ];
        y1.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s2y(1), MCW, S2H, YELLOW)));

        /* 섹션2 행2 */
        const y2 = [
            'NAU-700 1PH\n(GRAY)','NAU-700 STORM\nGREY(QAW)','DR-600(TD)\n회석제','NAU-700 AZ3',
            'NAU-700 AZ3','NUH#3000\nCR-CLEAR(KC)','NUH#3000\nCR-CLEAR(KC)',
            'NAL# 100\n무광 차폐\n블랙','NAL# 100\n무광 차폐\n블랙','NAL# 100\n무광 차폐\n블랙',
        ];
        y2.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s2y(2), MCW, S2H, YELLOW)));

        /* 섹션2 행3 */
        const y3 = [
            'NAU-700 GF\nBLACK (WHI)','NAU-700 BC5','DR-570회석제\n(BTX-FREE)','NAU-700 ET1',
            'NAU-700 ET1','DAU#차폐\nBASE BLACK','DAU#차폐\nBASE BLACK',
        ];
        y3.forEach((lbl, c) => boxes.push(_b(lbl, mc(c), s2y(3), MCW, S2H, YELLOW)));
        /* 행3 col7~9 빈칸 */
        for (let c = 7; c < 10; c++) {
            boxes.push(_b('', mc(c), s2y(3), MCW, S2H, LGRAY, { bold:false }));
        }

        /* 하단 선입선출 */
        boxes.push(_b('↑ 선입선출', mc(1), s2y(3) + S2H + 8, 175, 22,
            { color:'transparent', borderColor:'transparent', textColor:'#ca8a04', fontSize:12, bold:true }));

        /* ────────────────────────────────
           오른쪽 패널
        ──────────────────────────────── */
        /* Col A (노란) */
        boxes.push(_b('KC-BK001',  RA_X, rry(0), R_W, RRH, YELLOW));
        boxes.push(_b('',          RA_X, rry(1), R_W, RRH, LGRAY, { bold:false }));
        boxes.push(_b('',          RA_X, rry(2), R_W, RRH, LGRAY, { bold:false }));
        boxes.push(_b('NH-500',    RA_X, rry(3), R_W, RRH, YELLOW));
        boxes.push(_b('XPH8002',   RA_X, rry(4), R_W, RRH, YELLOW));
        boxes.push(_b('958 C.A',   RA_X, rry(5), R_W, RRH, YELLOW, { fontSize:12 }));

        /* Col B (분홍) */
        boxes.push(_b('LE9425B\n(경화제)',  RB_X, rry(0), R_W, RRH, PINK));
        boxes.push(_b('UVT454',             RB_X, rry(1), R_W, RRH, PINK));
        boxes.push(_b('UVT454',             RB_X, rry(2), R_W, RRH, PINK));
        boxes.push(_b('SV4380\n(신너)',      RB_X, rry(3), R_W, RRH, PINK));
        boxes.push(_b('4800LE18B',          RB_X, rry(4), R_W, RRH, PINK, { fontSize:10 }));
        boxes.push(_b('',                   RB_X, rry(5), R_W, RRH, LGRAY, { bold:false }));

        /* Col C (하늘색) */
        boxes.push(_b('4800LE794A\n(유광 블랙)',  RC_X, rry(0), RC_W, RRH, LBLUE, { fontSize:10 }));
        boxes.push(_b('4800LE781A\n(무광 블랙)',  RC_X, rry(1), RC_W, RRH, LBLUE, { fontSize:10 }));
        boxes.push(_b('',                         RC_X, rry(2), RC_W, RRH, LGRAY, { bold:false }));
        /* 세척신나 - 3행 스팬 */
        const ssH = RRH * 3 + RRG * 2;
        boxes.push(_b('세\n척\n신\n나', RC_X, rry(3), RC_W, ssH, LBLUE,
            { fontSize:16, bold:true }));

        /* ────────────────────────────────
           하단 요소
        ──────────────────────────────── */
        boxes.push(_b('출입문', 620, 737, 120, 55, GRAY, { fontSize:13 }));
        boxes.push(_b('에어컨',  1295, 700, 105, 72,
            { color:'#f0f9ff', borderColor:'#0284c7', textColor:'#0c4a6e', fontSize:13, bold:false }));
        boxes.push(_b('🧯', mc(9)+15, 747, 50, 48, GRAY, { fontSize:20, bold:false }));
        boxes.push(_b('🧯', 1165,    747, 50, 48, GRAY, { fontSize:20, bold:false }));
        boxes.push(_b('🧯', 1220,    747, 50, 48, GRAY, { fontSize:20, bold:false }));

        return boxes;
    })();

    /* ══════════════════════════════════════
       상태
    ══════════════════════════════════════ */
    let _boxes     = [];
    let _sel       = null;
    let _drag      = null;
    let _resize    = null;
    let _canvas    = null;
    let _propPanel = null;
    let _isDirty     = false;
    let _nextId      = 500;
    let _snapEnabled = true;
    let _guideEls    = [];

    /* ── 화살표 상태 ── */
    let _arrows     = [];
    let _selArrow   = null;
    let _arrowMode  = false;
    let _arrowDraft = null;
    let _svgLayer   = null;

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
            <button class="btn btn-outline btn-sm" onclick="PaintLayoutModule.goBack()">
              <span class="material-symbols-outlined">arrow_back</span> 목록으로
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-secondary btn-sm" onclick="PaintLayoutModule.addBox()">
              <span class="material-symbols-outlined">add_box</span> 박스 추가
            </button>
            <button class="btn btn-outline btn-sm" id="plBtnDup" disabled
                    onclick="PaintLayoutModule.dupBox()">
              <span class="material-symbols-outlined">content_copy</span> 복제
            </button>
            <button class="btn btn-outline btn-sm" id="plBtnDel" disabled
                    style="color:var(--danger);border-color:var(--danger);"
                    onclick="PaintLayoutModule.delBox()">
              <span class="material-symbols-outlined">delete</span> 삭제
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-outline btn-sm" onclick="PaintLayoutModule.resetLayout()">
              <span class="material-symbols-outlined">restart_alt</span> 초기화
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="plSnapBtn" class="btn btn-sm" onclick="PaintLayoutModule.toggleSnap()"
                    title="박스 간 자석 정렬 (ON/OFF)"
                    style="background:#6366f1;color:#fff;border:2px solid #6366f1;gap:4px;">
              자석 ON
            </button>
            <button id="plArrowBtn" class="btn btn-sm" onclick="PaintLayoutModule.toggleArrowMode()"
                    title="동선 화살표 그리기 모드 (ON/OFF)"
                    style="background:transparent;color:var(--text-secondary);border:2px solid var(--border);gap:4px;">
              <span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표
            </button>
            <div style="flex:1;min-width:0;"></div>
            <span id="plDirtyBadge" style="display:none;font-size:0.77rem;
                  color:var(--warning);background:rgba(245,158,11,0.12);
                  padding:3px 10px;border-radius:20px;white-space:nowrap;">
              ● 저장되지 않음
            </span>
            <button class="btn btn-primary btn-sm" onclick="PaintLayoutModule.saveLayout()">
              <span class="material-symbols-outlined">save</span> 저장
            </button>
            <button class="btn btn-outline btn-sm" onclick="PaintLayoutModule.printLayout()"
                    style="color:#0891b2;border-color:#0891b2;gap:4px;"
                    title="현장 게시용 A3 인쇄">
              <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
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
              <div id="plCanvas" style="
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
            <div id="plPropPanel" style="
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

        _canvas    = document.getElementById('plCanvas');
        _propPanel = document.getElementById('plPropPanel');

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

        _sel       = null;
        _selArrow  = null;
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
    }

    function _makeBoxEl(b) {
        const isSel = (b.id === _sel);
        const div   = document.createElement('div');
        div.id = 'plbox_' + b.id;
        div.style.cssText = [
            `position:absolute`,
            `left:${b.x}px`, `top:${b.y}px`,
            `width:${b.w}px`, `height:${b.h}px`,
            `background:${b.color || '#fff'}`,
            `border:${b.borderColor === 'transparent' ? 'none' : `2px solid ${b.borderColor||'#94a3b8'}`}`,
            `border-radius:5px`,
            `display:flex`, `align-items:center`, `justify-content:center`,
            `cursor:move`, `box-sizing:border-box`,
            `box-shadow:${isSel
                ? '0 0 0 2.5px #6366f1,0 4px 16px rgba(99,102,241,0.3)'
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

        if (isSel) {
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
       이벤트
    ══════════════════════════════════════ */
    function _bindCanvasEvents() {
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup',   _onMouseUp);
        _canvas.addEventListener('mousedown', e => {
            if (_arrowMode) {
                const rect = _canvas.getBoundingClientRect();
                _arrowDraft = {
                    x1: Math.round(e.clientX - rect.left),
                    y1: Math.round(e.clientY - rect.top),
                };
                e.preventDefault();
                return;
            }
            if (e.target === _canvas) {
                _sel      = null;
                _selArrow = null;
                _renderBoxes();
                _renderArrows();
                _renderPropPanel();
            }
        });
    }

    function _onBoxMouseDown(e) {
        if (e.button !== 0) return;
        if (_arrowMode) {
            const rect = _canvas.getBoundingClientRect();
            _arrowDraft = {
                x1: Math.round(e.clientX - rect.left),
                y1: Math.round(e.clientY - rect.top),
            };
            e.preventDefault(); e.stopPropagation();
            return;
        }
        if (e.target.hasAttribute('data-resize')) return;
        const boxId = this.id.replace('plbox_', '');
        _sel      = boxId;
        _selArrow = null;
        _renderBoxes();
        _renderArrows();
        _renderPropPanel();
        const b = _getBox(boxId);
        _drag   = { id:boxId, ox:e.clientX, oy:e.clientY, bx:b.x, by:b.y };
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
        if (_arrowDraft) {
            const rect = _canvas.getBoundingClientRect();
            _arrowDraft.x2 = Math.round(e.clientX - rect.left);
            _arrowDraft.y2 = Math.round(e.clientY - rect.top);
            _renderArrows();
            return;
        }
        if (_drag) {
            const b    = _getBox(_drag.id);
            const rawX = _drag.bx + e.clientX - _drag.ox;
            const rawY = _drag.by + e.clientY - _drag.oy;
            const snapped = _calcSnap(b, rawX, rawY);
            const nx = Math.max(0, Math.min(CANVAS_W - b.w, snapped.x));
            const ny = Math.max(0, Math.min(CANVAS_H - b.h, snapped.y));
            b.x = nx; b.y = ny;
            _renderGuides(snapped.guides);
            const el = document.getElementById('plbox_' + b.id);
            if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
            _markDirty();
        }
        if (_resize) {
            const b   = _getBox(_resize.id);
            const dir = _resize.dir;
            const rawW = dir !== 'bottom'
                ? _resize.bw + e.clientX - _resize.ox
                : b.w;
            const rawH = dir !== 'right'
                ? _resize.bh + e.clientY - _resize.oy
                : b.h;
            const snapped = _calcResizeSnap(b, rawW, rawH, dir);
            b.w = Math.max(50, Math.min(CANVAS_W - b.x, snapped.w));
            b.h = Math.max(30, Math.min(CANVAS_H - b.y, snapped.h));
            _renderGuides(snapped.guides);
            const el = document.getElementById('plbox_' + b.id);
            if (el) { el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; }
            _markDirty();
        }
    }

    function _onMouseUp() {
        if (_arrowDraft && _arrowDraft.x2 !== undefined) {
            const dx = _arrowDraft.x2 - _arrowDraft.x1;
            const dy = _arrowDraft.y2 - _arrowDraft.y1;
            if (Math.hypot(dx, dy) > 15) {
                const id = 'arr_' + (_nextId++);
                _arrows.push({
                    id,
                    x1: _arrowDraft.x1, y1: _arrowDraft.y1,
                    x2: _arrowDraft.x2, y2: _arrowDraft.y2,
                    color: '#1e293b', strokeWidth: 2, dashed: false, label: '',
                });
                _selArrow = id;
                _sel      = null;
                _markDirty();
                _renderPropPanel();
            }
            _arrowDraft = null;
            _renderArrows();
            return;
        }
        if (_drag || _resize) {
            _drag = null; _resize = null;
            _clearGuides();
            _renderBoxes();
        }
    }

    function _onBoxDblClick(e) {
        _startInlineEdit(this.id.replace('plbox_', ''));
        e.stopPropagation();
    }

    /* ══════════════════════════════════════
       인라인 편집
    ══════════════════════════════════════ */
    function _startInlineEdit(boxId) {
        const b  = _getBox(boxId);
        const el = document.getElementById('plbox_' + boxId);
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
            const v = ta.value.trim();
            if (v !== undefined) { b.label = v; _markDirty(); }
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
        const dupBtn = document.getElementById('plBtnDup');
        const delBtn = document.getElementById('plBtnDel');
        if (dupBtn) dupBtn.disabled = !b;
        if (delBtn) delBtn.disabled = !b;

        /* ── 화살표 속성 패널 ── */
        const a = (!b && _selArrow) ? _arrows.find(x => x.id === _selArrow) : null;
        if (a) {
            const ARROW_COLORS = [
                '#1e293b','#dc2626','#2563eb','#16a34a',
                '#ca8a04','#7c3aed','#0891b2','#ea580c',
            ];
            _propPanel.innerHTML = `
            <div style="font-weight:600;font-size:0.88rem;margin-bottom:12px;">↗ 화살표 속성</div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">레이블 (선택)</label>
            <input type="text" value="${_esc(a.label || '')}" class="form-input"
                   style="width:100%;margin:3px 0 10px;font-size:0.82rem;"
                   oninput="PaintLayoutModule._arrowPropChange('label', this.value)"
                   placeholder="예: 입고 동선">

            <label style="font-size:0.75rem;color:var(--text-secondary);">색상</label>
            <div style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;flex-wrap:wrap;">
              <input type="color" value="${a.color || '#1e293b'}"
                     style="width:28px;height:28px;padding:0;border-radius:3px;cursor:pointer;"
                     onchange="PaintLayoutModule._arrowPropChange('color', this.value)">
              ${ARROW_COLORS.map(c => `
                <div onclick="PaintLayoutModule._arrowPropChange('color','${c}')"
                     style="width:22px;height:22px;border-radius:4px;background:${c};
                            cursor:pointer;border:2px solid ${a.color===c?'#6366f1':'transparent'};"></div>
              `).join('')}
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
              <input type="range" min="1" max="10" value="${a.strokeWidth || 2}"
                     style="flex:1;"
                     oninput="PaintLayoutModule._arrowPropChange('strokeWidth',+this.value);
                              this.nextElementSibling.textContent=this.value+'px'">
              <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${a.strokeWidth || 2}px</span>
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">선 스타일</label>
            <div style="display:flex;gap:5px;margin:3px 0 12px;">
              <button class="btn btn-sm ${!a.dashed ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="PaintLayoutModule._arrowPropChange('dashed',false)">━ 실선</button>
              <button class="btn btn-sm ${a.dashed ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="PaintLayoutModule._arrowPropChange('dashed',true)">┄ 점선</button>
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">화살표 방향</label>
            <div style="display:flex;gap:5px;margin:3px 0 14px;">
              <button class="btn btn-sm ${a.twoWay ? 'btn-outline' : 'btn-primary'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="PaintLayoutModule._arrowPropChange('twoWay',false)">→ 단방향</button>
              <button class="btn btn-sm ${a.twoWay ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="PaintLayoutModule._arrowPropChange('twoWay',true)">↔ 양방향</button>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;">
              <button class="btn btn-outline btn-sm"
                      style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                      onclick="PaintLayoutModule._delArrow()">
                <span class="material-symbols-outlined" style="font-size:14px;">delete</span> 이 화살표 삭제
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
        <textarea id="plPropLabel" rows="3" class="form-input"
            style="width:100%;margin:3px 0 10px;resize:vertical;font-size:0.82rem;"
            oninput="PaintLayoutModule._propChange('label', this.value)">${_esc(b.label)}</textarea>

        <label style="font-size:0.75rem;color:var(--text-secondary);">위치 X / Y</label>
        <div style="display:flex;gap:5px;margin:3px 0 8px;">
          <input type="number" value="${b.x}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="PaintLayoutModule._propChange('x',+this.value)">
          <input type="number" value="${b.y}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="PaintLayoutModule._propChange('y',+this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">크기 W × H</label>
        <div style="display:flex;gap:5px;margin:3px 0 10px;">
          <input type="number" value="${b.w}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="PaintLayoutModule._propChange('w',Math.max(50,+this.value))">
          <input type="number" value="${b.h}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="PaintLayoutModule._propChange('h',Math.max(30,+this.value))">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자 크기</label>
        <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
          <input type="range" min="8" max="22" value="${b.fontSize||11}"
                 style="flex:1;"
                 oninput="PaintLayoutModule._propChange('fontSize',+this.value);
                          this.nextElementSibling.textContent=this.value+'px'">
          <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${b.fontSize||11}px</span>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
        <div style="display:flex;gap:5px;margin:3px 0 12px;">
          <button class="btn btn-sm ${b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-weight:700;font-size:0.8rem;"
                  onclick="PaintLayoutModule._propChange('bold',true)">굵게</button>
          <button class="btn btn-sm ${!b.bold?'btn-primary':'btn-outline'}" style="flex:1;font-size:0.8rem;"
                  onclick="PaintLayoutModule._propChange('bold',false)">보통</button>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">배경색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${PALETTE.map(c => `
            <div title="${c}" onclick="PaintLayoutModule._propChange('color','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.color===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.color||'#ffffff'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="PaintLayoutModule._propChange('color',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">테두리색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${BORDER_PALETTE.map(c => `
            <div title="${c}" onclick="PaintLayoutModule._propChange('borderColor','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.borderColor===c?'#6366f1':'#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.borderColor||'#94a3b8'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="PaintLayoutModule._propChange('borderColor',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자색</label>
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 16px;">
          <input type="color" value="${b.textColor||'#1e293b'}"
                 style="width:34px;height:26px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="PaintLayoutModule._propChange('textColor',this.value)">
          <span style="font-size:0.77rem;color:var(--text-secondary);">클릭해서 선택</span>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <button class="btn btn-outline btn-sm" style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                  onclick="PaintLayoutModule.delBox()">
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
        if (key !== 'label') _renderPropPanel();
    }

    /* ══════════════════════════════════════
       박스 CRUD
    ══════════════════════════════════════ */
    function addBox() {
        const id = 'box_' + (_nextId++);
        _boxes.push({
            id, label:'새 품목', x:_snap(50), y:_snap(50),
            w:85, h:65, color:'#bfdbfe', borderColor:'#2563eb',
            textColor:'#1e3a8a', fontSize:11, bold:true,
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
            x: _snap(Math.min(b.x + 10, CANVAS_W - b.w)),
            y: _snap(Math.min(b.y + 10, CANVAS_H - b.h)),
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
            await Storage.setConfigValue(CONFIG_KEY, { boxes: _boxes, arrows: _arrows });
            _isDirty = false;
            const badge = document.getElementById('plDirtyBadge');
            if (badge) badge.style.display = 'none';
            UIUtils.toast('레이아웃을 저장했습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function resetLayout() {
        if (!confirm('기본 레이아웃으로 초기화할까요?\n현재 배치가 모두 사라집니다.')) return;
        _boxes    = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        _arrows   = [];
        _sel      = null;
        _selArrow = null;
        _nextId   = 500;
        _markDirty();
        _renderBoxes();
        _renderArrows();
        _renderPropPanel();
        UIUtils.toast('기본 레이아웃으로 초기화했습니다.', 'info');
    }

    function goBack() {
        if (_isDirty && !confirm('저장하지 않은 변경 사항이 있습니다.\n그래도 이동할까요?')) return;
        document.removeEventListener('mousemove', _onMouseMove);
        document.removeEventListener('mouseup',   _onMouseUp);
        Router.navigate('paint-inventory');
    }

    /* ══════════════════════════════════════
       화살표 모드 토글
    ══════════════════════════════════════ */
    function toggleArrowMode() {
        _arrowMode  = !_arrowMode;
        _arrowDraft = null;
        const btn = document.getElementById('plArrowBtn');
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
            const color = a.id === '__draft__' ? '#6366f1' : (a.color || '#1e293b');
            const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            m.setAttribute('id', 'ah_e_' + a.id);
            m.setAttribute('markerWidth', '10'); m.setAttribute('markerHeight', '7');
            m.setAttribute('refX', '9');         m.setAttribute('refY', '3.5');
            m.setAttribute('orient', 'auto');
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            p.setAttribute('points', '0 0,10 3.5,0 7');
            p.setAttribute('fill', color);
            m.appendChild(p); defs.appendChild(m);
            if (a.twoWay) {
                const m2 = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                m2.setAttribute('id', 'ah_s_' + a.id);
                m2.setAttribute('markerWidth', '10'); m2.setAttribute('markerHeight', '7');
                m2.setAttribute('refX', '1');         m2.setAttribute('refY', '3.5');
                m2.setAttribute('orient', 'auto-start-reverse');
                const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                p2.setAttribute('points', '0 0,10 3.5,0 7');
                p2.setAttribute('fill', color);
                m2.appendChild(p2); defs.appendChild(m2);
            }
        });
        _svgLayer.appendChild(defs);

        _arrows.forEach(a => {
            const isSel = (a.id === _selArrow);
            const color = a.color || '#1e293b';
            const sw    = a.strokeWidth || 2;
            const dash  = a.dashed ? '10,5' : '';

            if (isSel) {
                const hl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hl.setAttribute('x1', a.x1); hl.setAttribute('y1', a.y1);
                hl.setAttribute('x2', a.x2); hl.setAttribute('y2', a.y2);
                hl.setAttribute('stroke', 'rgba(99,102,241,0.3)');
                hl.setAttribute('stroke-width', sw + 8);
                hl.setAttribute('stroke-linecap', 'round');
                _svgLayer.appendChild(hl);
            }

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x1); line.setAttribute('y1', a.y1);
            line.setAttribute('x2', a.x2); line.setAttribute('y2', a.y2);
            line.setAttribute('stroke', isSel ? '#6366f1' : color);
            line.setAttribute('stroke-width', sw);
            line.setAttribute('stroke-linecap', 'round');
            if (dash) line.setAttribute('stroke-dasharray', dash);
            line.setAttribute('marker-end', `url(#ah_e_${a.id})`);
            if (a.twoWay) line.setAttribute('marker-start', `url(#ah_s_${a.id})`);
            _svgLayer.appendChild(line);

            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hit.setAttribute('x1', a.x1); hit.setAttribute('y1', a.y1);
            hit.setAttribute('x2', a.x2); hit.setAttribute('y2', a.y2);
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', '14');
            hit.style.cursor = 'pointer';
            hit.style.pointerEvents = 'all';
            hit.addEventListener('mousedown', ev => {
                ev.stopPropagation();
                _selArrow = a.id; _sel = null;
                _renderBoxes(); _renderArrows(); _renderPropPanel();
            });
            _svgLayer.appendChild(hit);

            if (a.label) {
                const mx = (a.x1+a.x2)/2, my = (a.y1+a.y2)/2;
                const tw = a.label.length*7+8;
                const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bg.setAttribute('x', mx-tw/2); bg.setAttribute('y', my-17);
                bg.setAttribute('width', tw);  bg.setAttribute('height', 14);
                bg.setAttribute('rx', '3');    bg.setAttribute('fill', 'rgba(255,255,255,0.85)');
                _svgLayer.appendChild(bg);
                const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                txt.setAttribute('x', mx); txt.setAttribute('y', my-6);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('fill', isSel ? '#6366f1' : color);
                txt.setAttribute('font-size', '11'); txt.setAttribute('font-weight', '700');
                txt.setAttribute('pointer-events', 'none');
                txt.textContent = a.label;
                _svgLayer.appendChild(txt);
            }
        });

        if (_arrowDraft && _arrowDraft.x2 !== undefined) {
            const dl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            dl.setAttribute('x1', _arrowDraft.x1); dl.setAttribute('y1', _arrowDraft.y1);
            dl.setAttribute('x2', _arrowDraft.x2); dl.setAttribute('y2', _arrowDraft.y2);
            dl.setAttribute('stroke', '#6366f1');
            dl.setAttribute('stroke-width', '2');
            dl.setAttribute('stroke-dasharray', '8,4');
            dl.setAttribute('stroke-linecap', 'round');
            dl.setAttribute('marker-end', 'url(#ah_e___draft__)');
            _svgLayer.appendChild(dl);
        }
    }

    function _arrowPropChange(key, value) {
        const a = _arrows.find(x => x.id === _selArrow);
        if (!a) return;
        a[key] = value;
        _markDirty();
        _renderArrows();
        if (key !== 'label') _renderPropPanel();
    }

    function _delArrow() {
        if (!_selArrow) return;
        _arrows   = _arrows.filter(a => a.id !== _selArrow);
        _selArrow = null;
        _markDirty();
        _renderArrows();
        _renderPropPanel();
    }

    /* ══════════════════════════════════════
       현장 게시용 인쇄
    ══════════════════════════════════════ */
    function printLayout() {
        const pw = window.open('', '_blank', 'width=1100,height=850');
        if (!pw) {
            alert('팝업이 차단되었습니다.\n브라우저 팝업 허용 후 다시 시도하세요.');
            return;
        }

        /* 박스 HTML 생성 */
        const boxesHtml = _boxes.map(b => {
            const border = (b.borderColor === 'transparent')
                ? 'none'
                : `2px solid ${b.borderColor || '#94a3b8'}`;
            const labelHtml = String(b.label || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            return `<div style="
                position:absolute;
                left:${b.x}px; top:${b.y}px;
                width:${b.w}px; height:${b.h}px;
                background:${b.color || '#fff'};
                border:${border};
                border-radius:5px;
                display:flex; align-items:center; justify-content:center;
                box-sizing:border-box;
                overflow:hidden;">
              <span style="
                color:${b.textColor || '#1e293b'};
                font-size:${b.fontSize || 11}px;
                font-weight:${b.bold ? '700' : '500'};
                text-align:center;
                padding:3px 5px;
                white-space:pre-line;
                line-height:1.35;
                word-break:break-word;
                pointer-events:none;">${labelHtml}</span>
            </div>`;
        }).join('');

        /* 화살표 SVG */
        let arrowsSvg = '';
        if (_arrows.length) {
            let defs = '<defs>';
            _arrows.forEach(a => {
                const c = a.color || '#1e293b';
                defs += `<marker id="pah_e_${a.id}" markerWidth="10" markerHeight="7"
                                 refX="9" refY="3.5" orient="auto">
                           <polygon points="0 0,10 3.5,0 7" fill="${c}"/>
                         </marker>`;
                if (a.twoWay) {
                    defs += `<marker id="pah_s_${a.id}" markerWidth="10" markerHeight="7"
                                     refX="1" refY="3.5" orient="auto-start-reverse">
                               <polygon points="0 0,10 3.5,0 7" fill="${c}"/>
                             </marker>`;
                }
            });
            defs += '</defs>';
            let lines = '';
            _arrows.forEach(a => {
                const c = a.color || '#1e293b';
                const sw = a.strokeWidth || 2;
                const dash = a.dashed ? 'stroke-dasharray="10,5"' : '';
                const twoWay = a.twoWay ? `marker-start="url(#pah_s_${a.id})"` : '';
                lines += `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}"
                                stroke="${c}" stroke-width="${sw}" stroke-linecap="round"
                                ${dash} ${twoWay} marker-end="url(#pah_e_${a.id})"/>`;
                if (a.label) {
                    const mx = (a.x1+a.x2)/2, my = (a.y1+a.y2)/2;
                    const tw = a.label.length*7+8;
                    lines += `<rect x="${mx-tw/2}" y="${my-17}" width="${tw}" height="14" rx="3"
                                    fill="rgba(255,255,255,0.85)"/>
                              <text x="${mx}" y="${my-6}" text-anchor="middle"
                                    fill="${c}" font-size="11" font-weight="700">${a.label}</text>`;
                }
            });
            arrowsSvg = `<svg style="position:absolute;top:0;left:0;
                width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:visible;pointer-events:none;">
                ${defs}${lines}</svg>`;
        }

        const today = new Date().toLocaleDateString('ko-KR',
            { year:'numeric', month:'2-digit', day:'2-digit' });

        pw.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>도료 보관 창고 레이아웃 — 현장 게시용</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:'맑은 고딕','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
    background:#f1f5f9;
    display:flex; flex-direction:column; align-items:center;
    padding:10px 12px 16px;
    min-height:100vh;
  }

  @page { size: A3 landscape; margin: 8mm; }
  @media print {
    body { background:#fff; padding:0; justify-content:flex-start; }
    .no-print { display:none !important; }
    #scaleWrap { width:${CANVAS_W}px !important; height:${CANVAS_H}px !important; }
    #canvasInner { transform:none !important; }
    .footer-bar { margin-top:6px; }
  }

  .top-bar {
    width:100%; max-width:${CANVAS_W}px;
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:8px;
    font-size:12px; color:#64748b;
    background:#fff; border:1px solid #e2e8f0; border-radius:6px;
    padding:6px 12px;
  }

  #scaleWrap {
    position:relative;
    overflow:hidden;
    flex-shrink:0;
    border-radius:8px;
    box-shadow:0 4px 20px rgba(0,0,0,0.15);
  }

  #canvasInner {
    position:absolute; top:0; left:0;
    width:${CANVAS_W}px; height:${CANVAS_H}px;
    transform-origin:top left;
    background:#d1d5db;
    background-image:
      linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
    background-size:50px 50px;
  }

  .footer-bar {
    width:100%; max-width:${CANVAS_W}px;
    display:flex; justify-content:space-between; align-items:center;
    margin-top:10px;
    font-size:11px; color:#94a3b8;
  }
  .btn-print {
    padding:9px 32px;
    background:#0891b2; color:#fff; border:none; border-radius:6px;
    font-size:14px; font-weight:700; cursor:pointer;
    box-shadow:0 2px 8px rgba(8,145,178,0.3);
  }
  .btn-print:hover { background:#0e7490; }
</style>
</head>
<body>

  <div class="top-bar no-print">
    <span>🖨&nbsp; 인쇄 버튼을 누르거나 <kbd>Ctrl+P</kbd> 를 사용하세요</span>
    <span>${today} 출력</span>
  </div>

  <div id="scaleWrap">
    <div id="canvasInner">${boxesHtml}${arrowsSvg}</div>
  </div>

  <div class="footer-bar">
    <span>도료 보관 창고 &nbsp;LAY-OUT</span>
    <button class="btn-print no-print" onclick="window.print()">
      🖨 &nbsp;인쇄 / PDF 저장
    </button>
    <span>출력일: ${today}</span>
  </div>

<script>
(function() {
  var CW = ${CANVAS_W}, CH = ${CANVAS_H};
  var PAD = 24, TOP = 100, BOT = 60;

  function applyScale() {
    var availW = window.innerWidth  - PAD;
    var availH = window.innerHeight - TOP - BOT;
    var scale  = Math.min(availW / CW, availH / CH, 1);

    var wrap  = document.getElementById('scaleWrap');
    var inner = document.getElementById('canvasInner');

    wrap.style.width  = Math.round(CW * scale) + 'px';
    wrap.style.height = Math.round(CH * scale) + 'px';
    inner.style.transform = 'scale(' + scale + ')';
  }

  applyScale();
  window.addEventListener('resize', applyScale);
})();
<\/script>
</body>
</html>`);
        pw.document.close();
    }

    /* ══════════════════════════════════════
       리사이즈 핸들 생성
    ══════════════════════════════════════ */
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
        } else {
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
        el.addEventListener('mousedown', _onResizeStart, { passive:false });
        return el;
    }

    /* ══════════════════════════════════════
       자석 스냅 기능
    ══════════════════════════════════════ */

    function toggleSnap() {
        _snapEnabled = !_snapEnabled;
        const btn = document.getElementById('plSnapBtn');
        if (btn) {
            if (_snapEnabled) {
                btn.style.background  = '#6366f1';
                btn.style.color       = '#fff';
                btn.style.borderColor = '#6366f1';
                btn.innerHTML = '자석 ON';
            } else {
                btn.style.background  = 'transparent';
                btn.style.color       = 'var(--text-secondary)';
                btn.style.borderColor = 'var(--border)';
                btn.innerHTML = '자석 OFF';
            }
        }
    }

    function _calcSnap(b, rawX, rawY) {
        let nx = _snap(rawX);
        let ny = _snap(rawY);
        const guides = [];
        if (!_snapEnabled) return { x: nx, y: ny, guides };

        const others = _boxes.filter(o => o.id !== b.id);
        let bestXDist = SNAP_THRESHOLD + 1;
        let bestYDist = SNAP_THRESHOLD + 1;
        let guideX = null, guideY = null;
        let guideXRange = null, guideYRange = null;

        for (const o of others) {
            const ol  = o.x,        or_ = o.x + o.w, ocx = o.x + o.w / 2;
            const ot  = o.y,        ob  = o.y + o.h, ocy = o.y + o.h / 2;
            const dl  = rawX,       dr  = rawX + b.w, dcx = rawX + b.w / 2;
            const dt  = rawY,       db  = rawY + b.h, dcy = rawY + b.h / 2;

            const xCandidates = [
                { d: Math.abs(dl  - ol),  snap: ol,            guide: ol  },
                { d: Math.abs(dl  - or_), snap: or_,           guide: or_ },
                { d: Math.abs(dr  - ol),  snap: ol  - b.w,     guide: ol  },
                { d: Math.abs(dr  - or_), snap: or_ - b.w,     guide: or_ },
                { d: Math.abs(dcx - ocx), snap: ocx - b.w / 2, guide: ocx },
            ];
            for (const c of xCandidates) {
                if (c.d < bestXDist) {
                    bestXDist = c.d; nx = c.snap; guideX = c.guide;
                    guideXRange = { start: Math.min(o.y, rawY), end: Math.max(o.y + o.h, rawY + b.h) };
                }
            }

            const yCandidates = [
                { d: Math.abs(dt  - ot),  snap: ot,            guide: ot  },
                { d: Math.abs(dt  - ob),  snap: ob,            guide: ob  },
                { d: Math.abs(db  - ot),  snap: ot  - b.h,     guide: ot  },
                { d: Math.abs(db  - ob),  snap: ob  - b.h,     guide: ob  },
                { d: Math.abs(dcy - ocy), snap: ocy - b.h / 2, guide: ocy },
            ];
            for (const c of yCandidates) {
                if (c.d < bestYDist) {
                    bestYDist = c.d; ny = c.snap; guideY = c.guide;
                    guideYRange = { start: Math.min(o.x, rawX), end: Math.max(o.x + o.w, rawX + b.w) };
                }
            }
        }

        if (bestXDist <= SNAP_THRESHOLD && guideX !== null)
            guides.push({ type:'v', pos: guideX, start: guideXRange.start, end: guideXRange.end });
        if (bestYDist <= SNAP_THRESHOLD && guideY !== null)
            guides.push({ type:'h', pos: guideY, start: guideYRange.start, end: guideYRange.end });

        return { x: nx, y: ny, guides };
    }

    function _renderGuides(guides) {
        _clearGuides();
        if (!_canvas || !guides.length) return;
        guides.forEach(g => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute;pointer-events:none;z-index:999;background:rgba(99,102,241,0.75);`;
            if (g.type === 'v') {
                el.style.left   = (g.pos - 0.5) + 'px';
                el.style.top    = (g.start || 0) + 'px';
                el.style.width  = '1.5px';
                el.style.height = ((g.end - g.start) || CANVAS_H) + 'px';
            } else {
                el.style.left   = (g.start || 0) + 'px';
                el.style.top    = (g.pos - 0.5) + 'px';
                el.style.width  = ((g.end - g.start) || CANVAS_W) + 'px';
                el.style.height = '1.5px';
            }
            _canvas.appendChild(el);
            _guideEls.push(el);
        });
    }

    function _clearGuides() {
        _guideEls.forEach(el => el.remove());
        _guideEls = [];
    }

    function _calcResizeSnap(b, rawW, rawH, dir) {
        let nw = _snap(rawW);
        let nh = _snap(rawH);
        const guides = [];
        if (!_snapEnabled) return { w: nw, h: nh, guides };

        const others = _boxes.filter(o => o.id !== b.id);

        if (dir !== 'bottom') {
            const rightEdge = b.x + rawW;
            let bestD = SNAP_THRESHOLD + 1;
            let guideX = null, gRange = null;
            for (const o of others) {
                const cands = [
                    { d: Math.abs(rawW - o.w),              sw: o.w,           gx: b.x + o.w   },
                    { d: Math.abs(rightEdge - o.x),         sw: o.x - b.x,     gx: o.x         },
                    { d: Math.abs(rightEdge - (o.x+o.w)),   sw: o.x+o.w-b.x,   gx: o.x+o.w     },
                    { d: Math.abs(rightEdge - (o.x+o.w/2)), sw: o.x+o.w/2-b.x, gx: o.x+o.w/2   },
                ];
                for (const c of cands) {
                    if (c.d < bestD && c.sw >= 50) {
                        bestD = c.d; nw = c.sw; guideX = c.gx;
                        gRange = { start: Math.min(o.y,b.y), end: Math.max(o.y+o.h,b.y+rawH) };
                    }
                }
            }
            if (bestD <= SNAP_THRESHOLD && guideX !== null)
                guides.push({ type:'v', pos: guideX, start: gRange.start, end: gRange.end });
        }

        if (dir !== 'right') {
            const bottomEdge = b.y + rawH;
            let bestD = SNAP_THRESHOLD + 1;
            let guideY = null, gRange = null;
            for (const o of others) {
                const cands = [
                    { d: Math.abs(rawH - o.h),               sh: o.h,           gy: b.y + o.h    },
                    { d: Math.abs(bottomEdge - o.y),         sh: o.y - b.y,     gy: o.y          },
                    { d: Math.abs(bottomEdge - (o.y+o.h)),   sh: o.y+o.h-b.y,   gy: o.y+o.h      },
                    { d: Math.abs(bottomEdge - (o.y+o.h/2)), sh: o.y+o.h/2-b.y, gy: o.y+o.h/2    },
                ];
                for (const c of cands) {
                    if (c.d < bestD && c.sh >= 30) {
                        bestD = c.d; nh = c.sh; guideY = c.gy;
                        gRange = { start: Math.min(o.x,b.x), end: Math.max(o.x+o.w,b.x+rawW) };
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
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function _markDirty() {
        _isDirty = true;
        const badge = document.getElementById('plDirtyBadge');
        if (badge) badge.style.display = '';
    }

    return {
        init, render, addBox, dupBox, delBox,
        saveLayout, resetLayout, goBack, printLayout,
        _propChange, toggleSnap,
        toggleArrowMode, _arrowPropChange, _delArrow,
    };

})();
