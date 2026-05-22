/**
 * 1층 소재 / 완제품 보관창고 레이아웃 편집기
 * - 사출 자재 창고 + 완제품 창고 통합 배치도
 * - 박스 드래그 이동, 리사이즈, 텍스트 편집
 * - 저장: Storage.setConfigValue('injection_layout_v1', {...})
 */
var InjectionLayoutModule = (function () {

    /* ══════════════════════════════════════
       상수
    ══════════════════════════════════════ */
    const CONFIG_KEY      = 'injection_layout_v2';
    const CANVAS_W        = 1200;   // 원본 이미지 비율 1.47:1 → 1200×820
    const CANVAS_H        = 820;
    const GRID            = 5;
    const SNAP_THRESHOLD  = 10;

    /* ─── 색상 세트 ─────────────────────── */
    /* 완제품 (청록/Cyan) */
    const FP_HDR   = { color:'#06b6d4', borderColor:'#0e7490', textColor:'#083344' };   // 헤더
    const FP_SLOT  = { color:'#cffafe', borderColor:'#67e8f9', textColor:'#155e75' };   // 슬롯
    const FP_EMPTY = { color:'#f0feff', borderColor:'#a5f3fc', textColor:'#9ca3af' };   // 빈 슬롯
    /* 소재 (주황/Orange) */
    const SM_HDR   = { color:'#f97316', borderColor:'#c2410c', textColor:'#431407' };   // 헤더
    const SM_SLOT  = { color:'#fff7ed', borderColor:'#fdba74', textColor:'#9a3412' };   // 슬롯
    const SM_EMPTY = { color:'#fffbf5', borderColor:'#fed7aa', textColor:'#9ca3af' };   // 빈 슬롯
    /* 기타 */
    const GREEN    = { color:'#bbf7d0', borderColor:'#16a34a', textColor:'#14532d' };   // 출입문/수입검사
    const IN_BOX   = { color:'#dcfce7', borderColor:'#16a34a', textColor:'#14532d' };
    const OUT_BOX  = { color:'#fecdd3', borderColor:'#e11d48', textColor:'#881337' };

    const PALETTE = [
        '#cffafe','#fff7ed','#bbf7d0','#fce7f3','#fef9c3',
        '#dcfce7','#e0f2fe','#fef2f2','#f1f5f9','#ede9fe',
        '#06b6d4','#f97316',
    ];
    const BORDER_PALETTE = [
        '#0e7490','#c2410c','#16a34a','#db2777','#ca8a04',
        '#2563eb','#dc2626','#7c3aed','#64748b','#0284c7',
        '#374151','#1d4ed8',
    ];

    /* ─── 레이아웃 좌표 상수 ──────────────────────────────────────────
       캔버스 1200px 기준 비율:
         완제품2열(400)+통로(190)+소재RACK(255)+소재PLT(215) + 여백(140) = 1200
       ────────────────────────────────────────────────────────────── */
    const FP_W   = 200;   // 완제품 랙 너비 (각 열)
    const SM3W   = 255;   // 소재 RACK 너비
    const SM4W   = 215;   // 소재 PLT 너비

    const FP1X   = 20;            // 완제품 col1 시작 x
    const FP2X   = FP1X + FP_W + 12;            // 완제품 col2 시작 x  (=232)
    const SM3X   = FP2X + FP_W + 190;           // 소재 RACK 시작 x — 통로 190px (=622)
    const SM4X   = SM3X + SM3W + 10;            // 소재 PLT 시작 x    (=887)

    const HDR_H  = 33;    // 헤더 높이
    const SLT_H  = 28;    // 슬롯 높이
    const SLT_G  = 1;     // 슬롯 간격
    const RCK_G  = 14;    // 랙 그룹 간 간격

    const ROW1_Y  = 45;
    const R1_SLOTS = 6;
    const ROW1_H  = HDR_H + R1_SLOTS * (SLT_H + SLT_G);
    const ROW2_Y  = ROW1_Y + ROW1_H + RCK_G;
    const R2_SLOTS = 7;
    const ROW2_H  = HDR_H + R2_SLOTS * (SLT_H + SLT_G);
    const ROW3_Y  = ROW2_Y + ROW2_H + RCK_G;
    const R3_SLOTS = 6;
    const INOUT_Y = ROW3_Y + HDR_H + R3_SLOTS * (SLT_H + SLT_G) + 2;
    const BOT_Y   = INOUT_Y + SLT_H + 25;

    /* ══════════════════════════════════════
       박스 생성 헬퍼
    ══════════════════════════════════════ */
    let _uid = 1;
    function _b(label, x, y, w, h, scheme, extra) {
        return Object.assign(
            { id: 'il_' + (_uid++), label, x, y, w, h, fontSize: 11, bold: true },
            scheme, extra || {}
        );
    }

    /* 랙 슬롯 배열 생성
     * labels: 문자열 배열 (빈문자='') */
    function _slots(labels, x, rackY, w, scheme, emptyScheme) {
        return labels.map((lbl, i) => {
            const s = lbl ? scheme : (emptyScheme || scheme);
            const ex = lbl ? {} : { bold: false };
            return _b(lbl, x, rackY + HDR_H + i * (SLT_H + SLT_G), w, SLT_H, s, ex);
        });
    }

    /* ══════════════════════════════════════
       기본 레이아웃 (1층 소재/완제품 보관창고)
    ══════════════════════════════════════ */
    const DEFAULT_BOXES = (function () {
        _uid = 1;
        const boxes = [];

        /* ── 제목 ── */
        /* 제목: CANVAS_W 중앙 정렬 */
        boxes.push(_b('■  1층 소재 / 완제품 보관창고  LAY-OUT  ■',
            Math.round((CANVAS_W - 800) / 2), 6, 800, 30,
            { color: '#ffffff', borderColor: 'transparent', textColor: '#0f172a', fontSize: 17, bold: true }));

        /* ══════════════════════
           완제품 구역 (CYAN)
        ══════════════════════ */

        /* ── 완제품 RACK 5 (col1 / row1) ── */
        boxes.push(_b('완제품  RACK 5', FP1X, ROW1_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots([
            'PAO COVER 6PS',
            'PAO COVER AZ3',
            'A3 PA BCALL KNOB 6PS',
            'A3 PA  DOOR KNOB 6PS',
            'A3 PA  ROOR KNOB 6PS',
            'A3 PA BCALL KNOB AZ3',
        ], FP1X, ROW1_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* ── 완제품 RACK 6 (col2 / row1) ── */
        boxes.push(_b('완제품  RACK 6', FP2X, ROW1_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots([
            '', '', '', '', '',
            'A3 PA ECALL KNOB(RED)',
        ], FP2X, ROW1_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* ── 완제품 RACK 3 (col1 / row2) ── */
        boxes.push(_b('완제품  RACK 3', FP1X, ROW2_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots([
            'XFD 3SPOT BLACK (알리)',
            'XFD 1SPOT BLACK (알리)',
            'T1XX IL BUTTON',
            'T1XX PARK BUTTON',
            'T1XX LENS UV',
            'J34A KNOB LH GY',
            'J34A KNOB RH GY',
        ], FP1X, ROW2_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* ── 완제품 RACK 4 (col2 / row2) ── */
        boxes.push(_b('완제품  RACK 4', FP2X, ROW2_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots([
            'A3 PA  DOOR KNOB AZ3',
            'A3 PA  ROOR KNOB AZ3',
            'PA2 BCALL KNOB 6PS',
            'PA2 BCALL KNOB AZ3',
            'A3 PA ECALL COVER 6PS',
            'A3 PA ECALL COVER AZ3',
            '',
        ], FP2X, ROW2_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* ── 완제품 RACK 1 (col1 / row3) ── */
        boxes.push(_b('완제품  RACK 1', FP1X, ROW3_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots([
            'J34A KNOB LH BK',
            'J34A KNOB RH BK',
            'XFD 1SPOT BLACK (일홍)',
            'A3 LENS HIGH 투명',
            'A3 LENS HIGH 투명',
            'A3 LENS HIGH 투명',
        ], FP1X, ROW3_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* IN / OUT 레이블 (RACK 1 하단) */
        boxes.push(_b('IN',  FP1X,             INOUT_Y, FP_W/2 - 2, SLT_H, IN_BOX,  { fontSize: 12 }));
        boxes.push(_b('OUT', FP1X + FP_W/2 + 2, INOUT_Y, FP_W/2 - 2, SLT_H, OUT_BOX, { fontSize: 12 }));

        /* ── 완제품 RACK 2 (col2 / row3) ── */
        boxes.push(_b('완제품  RACK 2', FP2X, ROW3_Y, FP_W, HDR_H, FP_HDR, { fontSize: 12 }));
        _slots(['', '', '', '', '', '', ''],
            FP2X, ROW3_Y, FP_W, FP_SLOT, FP_EMPTY).forEach(b => boxes.push(b));

        /* ══════════════════════
           소재 구역 (ORANGE)
        ══════════════════════ */

        /* ── 소재 RACK 3 (col3 / row1) ── */
        boxes.push(_b('소재  RACK 3', SM3X, ROW1_Y, SM3W, HDR_H, SM_HDR, { fontSize: 12 }));
        _slots([
            '', '',
            'PAO COVER  WHITE',
            'PAO COVER  WHITE',
            'PAO COVER  WHITE',
            'PAO COVER  WHITE',
        ], SM3X, ROW1_Y, SM3W, SM_SLOT, SM_EMPTY).forEach(b => boxes.push(b));

        /* ── 소재 PLT3 (col4 / row1) ── */
        boxes.push(_b('소재  PLT3', SM4X, ROW1_Y, SM4W, ROW1_H, SM_HDR, { fontSize: 13 }));

        /* ── 소재 RACK 2 (col3 / row2) ── */
        boxes.push(_b('소재  RACK 2', SM3X, ROW2_Y, SM3W, HDR_H, SM_HDR, { fontSize: 12 }));
        _slots([
            'J34A KNOB RH GY',
            'J34A KNOB LH GY',
            'J34A KNOB RH BK',
            'J34A KNOB LH BK',
            'XFD 1SPOT  WHITE',
            'XFD 1SPOT  WHITE',
            'XFD 1SPOT  WHITE',
        ], SM3X, ROW2_Y, SM3W, SM_SLOT, SM_EMPTY).forEach(b => boxes.push(b));

        /* ── 소재 PLT2 (col4 / row2) ── */
        boxes.push(_b('소재  PLT2', SM4X, ROW2_Y, SM4W, ROW2_H, SM_HDR, { fontSize: 13 }));

        /* ── 소재 RACK 1 (col3 / row3) ── */
        boxes.push(_b('소재  RACK 1', SM3X, ROW3_Y, SM3W, HDR_H, SM_HDR, { fontSize: 12 }));
        _slots([
            'T1XX PARK BUTTON BLACK',
            'T1XX PARK BUTTON BLACK',
            'T1XX IL BUTTON BLACK',
            'T1XX LENS BLACK',
            'T1XX LENS BLACK',
            'T1XX LENS BLACK',
            'T1XX LENS BLACK',
        ], SM3X, ROW3_Y, SM3W, SM_SLOT, SM_EMPTY).forEach(b => boxes.push(b));

        /* ── 소재 PLT1 (col4 / row3) ── */
        const plt1H = HDR_H + 7 * (SLT_H + SLT_G);
        boxes.push(_b('소재  PLT1', SM4X, ROW3_Y, SM4W, plt1H, SM_HDR, { fontSize: 13 }));

        /* ── 하단 ── */
        /* 출입문: 완제품 2열 중앙 하단 */
        boxes.push(_b('출 입 문',   FP1X + Math.floor((FP2X + FP_W - FP1X - 150) / 2), BOT_Y, 150, 35, GREEN, { fontSize: 13 }));
        /* 수입검사: 소재 RACK 하단 */
        boxes.push(_b('수 입 검 사', SM3X + Math.floor((SM3W - 190) / 2), BOT_Y, 190, 35, GREEN, { fontSize: 13 }));

        /* ── 소화기 ── */
        boxes.push(_b('🧯 #10', FP1X, BOT_Y - 2, 55, 28,
            { color: '#fee2e2', borderColor: '#ef4444', textColor: '#7f1d1d', fontSize: 9, bold: false }));
        boxes.push(_b('🧯 #11', SM4X + SM4W - 55, BOT_Y - 2, 55, 28,
            { color: '#fee2e2', borderColor: '#ef4444', textColor: '#7f1d1d', fontSize: 9, bold: false }));

        return boxes;
    })();

    /* ══════════════════════════════════════
       상태
    ══════════════════════════════════════ */
    let _boxes      = [];
    let _sel        = null;
    let _drag       = null;
    let _resize     = null;
    let _canvas     = null;
    let _propPanel  = null;
    let _isDirty    = false;
    let _nextId     = 300;
    let _snapEnabled = true;
    let _guideEls   = [];

    /* ── 화살표 상태 ── */
    let _arrows     = [];      // { id, x1,y1,x2,y2, color, strokeWidth, dashed, label }
    let _selArrow   = null;    // 선택된 화살표 id
    let _arrowMode  = false;   // 화살표 그리기 모드
    let _arrowDraft = null;    // 드래그 중인 임시 화살표 { x1,y1,x2,y2 }
    let _svgLayer   = null;    // SVG 오버레이 element

    /* ── 다중 선택 ── */
    let _selSet     = new Set();
    let _lasso      = null;
    let _lassoEl    = null;

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
            <button class="btn btn-outline btn-sm" onclick="InjectionLayoutModule.goBack()">
              <span class="material-symbols-outlined">arrow_back</span> 목록으로
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-secondary btn-sm" onclick="InjectionLayoutModule.addBox()">
              <span class="material-symbols-outlined">add_box</span> 박스 추가
            </button>
            <button class="btn btn-outline btn-sm" id="ilBtnDup" disabled
                    onclick="InjectionLayoutModule.dupBox()">
              <span class="material-symbols-outlined">content_copy</span> 복제
            </button>
            <button class="btn btn-outline btn-sm" id="ilBtnDel" disabled
                    style="color:var(--danger);border-color:var(--danger);"
                    onclick="InjectionLayoutModule.delBox()">
              <span class="material-symbols-outlined">delete</span> 삭제
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-outline btn-sm" onclick="InjectionLayoutModule.resetLayout()">
              <span class="material-symbols-outlined">restart_alt</span> 초기화
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="ilSnapBtn" class="btn btn-sm" onclick="InjectionLayoutModule.toggleSnap()"
                    title="박스 간 자석 정렬 (ON/OFF)"
                    style="background:#6366f1;color:#fff;border:2px solid #6366f1;gap:4px;">
              자석 ON
            </button>
            <button id="ilArrowBtn" class="btn btn-sm" onclick="InjectionLayoutModule.toggleArrowMode()"
                    title="동선 화살표 그리기 모드 (ON/OFF)"
                    style="background:transparent;color:var(--text-secondary);border:2px solid var(--border);gap:4px;">
              <span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표
            </button>
            <div style="flex:1;min-width:0;"></div>
            <span id="ilDirtyBadge" style="display:none;font-size:0.77rem;
                  color:var(--warning);background:rgba(245,158,11,0.12);
                  padding:3px 10px;border-radius:20px;white-space:nowrap;">
              ● 저장되지 않음
            </span>
            <button class="btn btn-primary btn-sm" onclick="InjectionLayoutModule.saveLayout()">
              <span class="material-symbols-outlined">save</span> 저장
            </button>
            <button class="btn btn-outline btn-sm" onclick="InjectionLayoutModule.printLayout()"
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
                &nbsp;·&nbsp; <span style="color:#06b6d4;font-weight:600;">■ 완제품</span>
                &nbsp;<span style="color:#f97316;font-weight:600;">■ 소재</span>
              </div>
              <div id="ilCanvas" style="
                    position:relative;
                    width:${CANVAS_W}px; height:${CANVAS_H}px;
                    background:#c8d3dc;
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
            <div id="ilPropPanel" style="
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

        _canvas    = document.getElementById('ilCanvas');
        _propPanel = document.getElementById('ilPropPanel');

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
            _nextId = Math.max(..._boxes.map(b => parseInt(b.id.replace(/\D/g, '')) || 0)) + 1;
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
        const isPrim = (b.id === _sel);
        const isSel  = isPrim || _selSet.has(b.id);
        const div   = document.createElement('div');
        div.id = 'ilbox_' + b.id;
        div.style.cssText = [
            `position:absolute`,
            `left:${b.x}px`, `top:${b.y}px`,
            `width:${b.w}px`, `height:${b.h}px`,
            `background:${b.color || '#fff'}`,
            `border:${isPrim ? '2.5px solid #6366f1' : isSel ? '2.5px solid #3b82f6' : b.borderColor === 'transparent' ? 'none' : `2px solid ${b.borderColor || '#94a3b8'}`}`,
            `border-radius:4px`,
            `display:flex`, `align-items:center`, `justify-content:center`,
            `cursor:move`, `box-sizing:border-box`,
            `box-shadow:${isPrim
                ? '0 0 0 3px rgba(99,102,241,0.45),0 4px 16px rgba(99,102,241,0.3)'
                : isSel ? '0 0 0 3px rgba(59,130,246,0.45)'
                : '0 1px 3px rgba(0,0,0,0.10)'}`,
            `outline:${isSel && !isPrim ? '2px dashed #3b82f6' : 'none'}`,
            `outline-offset:2px`,
            `overflow:hidden`, `transition:box-shadow 0.12s`,
            `z-index:${isPrim ? 10 : isSel ? 8 : 1}`,
        ].join(';');

        const span = document.createElement('span');
        span.style.cssText = [
            `color:${b.textColor || '#1e293b'}`,
            `font-size:${b.fontSize || 11}px`,
            `font-weight:${b.bold ? '700' : '500'}`,
            `text-align:center`,
            `pointer-events:none`,
            `padding:2px 4px`,
            `white-space:pre-line`,
            `line-height:1.3`,
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
            if (e.target === _canvas || e.target === _svgLayer) {
                const rect = _canvas.getBoundingClientRect();
                const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
                if (!e.ctrlKey && !e.metaKey) {
                    _sel = null; _selSet.clear(); _selArrow = null;
                    _renderBoxes(); _renderArrows(); _renderPropPanel();
                }
                _lasso = { sx, sy, ex: sx, ey: sy };
                if (!_lassoEl) {
                    _lassoEl = document.createElement('div');
                    _lassoEl.style.cssText = 'position:absolute;border:2px dashed #3b82f6;' +
                        'background:rgba(59,130,246,0.08);pointer-events:none;z-index:9999;display:none;';
                    _canvas.appendChild(_lassoEl);
                }
                _lassoEl.style.display = 'none';
                e.preventDefault();
            }
        });
        document.addEventListener('keydown', function _ilKeyDown(e) {
            if (!document.getElementById('ilCanvas')) {
                document.removeEventListener('keydown', _ilKeyDown); return;
            }
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'Delete' && (_selSet.size > 0 || _sel)) { delBox(); return; }
            const ARROW_KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
            if (ARROW_KEYS.includes(e.key) && (_selSet.size > 0 || _sel)) {
                const step = e.ctrlKey ? 5 : e.altKey ? 1 : 0;
                if (step === 0) return;
                e.preventDefault();
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
                const ids = _selSet.size > 0 ? [..._selSet] : (_sel ? [_sel] : []);
                ids.forEach(id => {
                    const b = _getBox(id); if (!b) return;
                    b.x = Math.max(0, Math.min(CANVAS_W - b.w, b.x + dx));
                    b.y = Math.max(0, Math.min(CANVAS_H - b.h, b.y + dy));
                });
                _markDirty(); _renderBoxes(); _renderArrows();
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
        const boxId = this.id.replace('ilbox_', '');

        if (e.ctrlKey || e.metaKey) {
            if (_selSet.has(boxId)) {
                _selSet.delete(boxId);
                if (_sel === boxId) _sel = _selSet.size > 0 ? [..._selSet][_selSet.size-1] : null;
            } else {
                _selSet.add(boxId); _sel = boxId;
            }
            _selArrow = null; _renderBoxes(); _renderArrows(); _renderPropPanel();
            e.preventDefault(); e.stopPropagation(); return;
        }

        if (!_selSet.has(boxId)) { _selSet.clear(); _selSet.add(boxId); }
        _sel = boxId; _selArrow = null;
        _renderBoxes(); _renderArrows(); _renderPropPanel();
        const b = _getBox(boxId);
        const others = [..._selSet].filter(id => id !== boxId)
            .map(id => { const ob = _getBox(id); return ob ? { id, bx: ob.x, by: ob.y } : null; }).filter(Boolean);
        _drag   = { id: boxId, ox: e.clientX, oy: e.clientY, bx: b.x, by: b.y, others };
        _resize = null;
        e.preventDefault(); e.stopPropagation();
    }

    function _onResizeStart(e) {
        e.stopPropagation(); e.preventDefault();
        const boxId = this.getAttribute('data-resize');
        const dir   = this.getAttribute('data-rdir') || 'corner';
        const b     = _getBox(boxId);
        const others = [..._selSet].filter(id => id !== boxId)
            .map(id => { const ob = _getBox(id); return ob ? { id, bw: ob.w, bh: ob.h } : null; }).filter(Boolean);
        _resize = { id: boxId, ox: e.clientX, oy: e.clientY, bw: b.w, bh: b.h, dir, others };
        _drag   = null;
    }

    function _onMouseMove(e) {
        if (_lasso && !_drag && !_resize) {
            const rect = _canvas.getBoundingClientRect();
            _lasso.ex = e.clientX - rect.left; _lasso.ey = e.clientY - rect.top;
            const lx = Math.min(_lasso.sx,_lasso.ex), ly = Math.min(_lasso.sy,_lasso.ey);
            const lw = Math.abs(_lasso.ex-_lasso.sx), lh = Math.abs(_lasso.ey-_lasso.sy);
            if (lw > 4 || lh > 4) {
                _lassoEl.style.display = 'block';
                _lassoEl.style.left = lx+'px'; _lassoEl.style.top = ly+'px';
                _lassoEl.style.width = lw+'px'; _lassoEl.style.height = lh+'px';
            }
            return;
        }
        /* 화살표 드래프트 미리보기 */
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
            const dx = nx - _drag.bx, dy = ny - _drag.by;
            b.x = nx; b.y = ny;
            _renderGuides(snapped.guides);
            const el = document.getElementById('ilbox_' + b.id);
            if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
            (_drag.others || []).forEach(ob => {
                const other = _getBox(ob.id); if (!other) return;
                other.x = Math.max(0, Math.min(CANVAS_W-other.w, ob.bx+dx));
                other.y = Math.max(0, Math.min(CANVAS_H-other.h, ob.by+dy));
                const oel = document.getElementById('ilbox_'+other.id);
                if (oel) { oel.style.left = other.x+'px'; oel.style.top = other.y+'px'; }
            });
            _markDirty();
        }
        if (_resize) {
            const b   = _getBox(_resize.id);
            const dir = _resize.dir;
            const rawW = dir !== 'bottom'
                ? _resize.bw + e.clientX - _resize.ox : b.w;
            const rawH = dir !== 'right'
                ? _resize.bh + e.clientY - _resize.oy : b.h;
            const snapped = _calcResizeSnap(b, rawW, rawH, dir);
            const newW = Math.max(40, Math.min(CANVAS_W - b.x, snapped.w));
            const newH = Math.max(22, Math.min(CANVAS_H - b.y, snapped.h));
            const dw = newW - _resize.bw, dh = newH - _resize.bh;
            b.w = newW; b.h = newH;
            _renderGuides(snapped.guides);
            const el = document.getElementById('ilbox_' + b.id);
            if (el) { el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; }
            (_resize.others || []).forEach(ob => {
                const other = _getBox(ob.id); if (!other) return;
                other.w = Math.max(40, Math.min(CANVAS_W-other.x, ob.bw + dw));
                other.h = Math.max(22, Math.min(CANVAS_H-other.y, ob.bh + dh));
                const oel = document.getElementById('ilbox_'+other.id);
                if (oel) { oel.style.width = other.w+'px'; oel.style.height = other.h+'px'; }
            });
            _markDirty();
        }
    }

    function _onMouseUp(e) {
        if (_lasso) {
            const lx1 = Math.min(_lasso.sx,_lasso.ex), ly1 = Math.min(_lasso.sy,_lasso.ey);
            const lx2 = Math.max(_lasso.sx,_lasso.ex), ly2 = Math.max(_lasso.sy,_lasso.ey);
            if (lx2-lx1 > 6 || ly2-ly1 > 6) {
                if (!e || (!e.ctrlKey && !e.metaKey)) _selSet.clear();
                _boxes.forEach(b => {
                    if (b.x < lx2 && b.x+b.w > lx1 && b.y < ly2 && b.y+b.h > ly1) _selSet.add(b.id);
                });
                _sel = _selSet.size > 0 ? [..._selSet][_selSet.size-1] : null;
                _selArrow = null;
                _renderBoxes(); _renderArrows(); _renderPropPanel();
            }
            _lasso = null;
            if (_lassoEl) _lassoEl.style.display = 'none';
        }
        /* 화살표 확정 */
        if (_arrowDraft && _arrowDraft.x2 !== undefined) {
            const dx = _arrowDraft.x2 - _arrowDraft.x1;
            const dy = _arrowDraft.y2 - _arrowDraft.y1;
            if (Math.hypot(dx, dy) > 15) {
                const id = 'arr_' + (_nextId++);
                const newArr = {
                    id,
                    x1: _arrowDraft.x1, y1: _arrowDraft.y1,
                    x2: _arrowDraft.x2, y2: _arrowDraft.y2,
                    color: '#1e293b',
                    strokeWidth: 2,
                    dashed: false,
                    label: '',
                };
                _arrows.push(newArr);
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
        _startInlineEdit(this.id.replace('ilbox_', ''));
        e.stopPropagation();
    }

    /* ══════════════════════════════════════
       인라인 편집
    ══════════════════════════════════════ */
    function _startInlineEdit(boxId) {
        const b  = _getBox(boxId);
        const el = document.getElementById('ilbox_' + boxId);
        if (!b || !el) return;
        el.innerHTML = '';

        const ta = document.createElement('textarea');
        ta.value = b.label;
        ta.style.cssText = `
            width:92%;height:82%;resize:none;
            background:rgba(255,255,255,0.92);
            border:none;border-bottom:2px solid #6366f1;
            border-radius:4px;
            font-size:${b.fontSize || 11}px;
            font-weight:${b.bold ? '700' : '500'};
            color:${b.textColor || '#1e293b'};
            text-align:center;outline:none;
            padding:3px;line-height:1.3;`;
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
        const b      = _sel ? _getBox(_sel) : null;
        const dupBtn = document.getElementById('ilBtnDup');
        const delBtn = document.getElementById('ilBtnDel');
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
                   oninput="InjectionLayoutModule._arrowPropChange('label', this.value)"
                   placeholder="예: 입고 동선">

            <label style="font-size:0.75rem;color:var(--text-secondary);">색상</label>
            <div style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;flex-wrap:wrap;">
              <input type="color" value="${a.color || '#1e293b'}"
                     style="width:28px;height:28px;padding:0;border-radius:3px;cursor:pointer;"
                     onchange="InjectionLayoutModule._arrowPropChange('color', this.value)">
              ${ARROW_COLORS.map(c => `
                <div onclick="InjectionLayoutModule._arrowPropChange('color','${c}')"
                     style="width:22px;height:22px;border-radius:4px;background:${c};
                            cursor:pointer;border:2px solid ${a.color===c?'#6366f1':'transparent'};"></div>
              `).join('')}
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
              <input type="range" min="1" max="10" value="${a.strokeWidth || 2}"
                     style="flex:1;"
                     oninput="InjectionLayoutModule._arrowPropChange('strokeWidth',+this.value);
                              this.nextElementSibling.textContent=this.value+'px'">
              <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${a.strokeWidth || 2}px</span>
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">선 스타일</label>
            <div style="display:flex;gap:5px;margin:3px 0 12px;">
              <button class="btn btn-sm ${!a.dashed ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="InjectionLayoutModule._arrowPropChange('dashed',false)">━ 실선</button>
              <button class="btn btn-sm ${a.dashed ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="InjectionLayoutModule._arrowPropChange('dashed',true)">┄ 점선</button>
            </div>

            <label style="font-size:0.75rem;color:var(--text-secondary);">화살표 방향</label>
            <div style="display:flex;gap:5px;margin:3px 0 14px;">
              <button class="btn btn-sm ${a.twoWay ? 'btn-outline' : 'btn-primary'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="InjectionLayoutModule._arrowPropChange('twoWay',false)">→ 단방향</button>
              <button class="btn btn-sm ${a.twoWay ? 'btn-primary' : 'btn-outline'}"
                      style="flex:1;font-size:0.8rem;"
                      onclick="InjectionLayoutModule._arrowPropChange('twoWay',true)">↔ 양방향</button>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;">
              <button class="btn btn-outline btn-sm"
                      style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                      onclick="InjectionLayoutModule._delArrow()">
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
        <textarea id="ilPropLabel" rows="3" class="form-input"
            style="width:100%;margin:3px 0 10px;resize:vertical;font-size:0.82rem;"
            oninput="InjectionLayoutModule._propChange('label', this.value)">${_esc(b.label)}</textarea>

        <label style="font-size:0.75rem;color:var(--text-secondary);">위치 X / Y</label>
        <div style="display:flex;gap:5px;margin:3px 0 8px;">
          <input type="number" value="${b.x}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="InjectionLayoutModule._propChange('x',+this.value)">
          <input type="number" value="${b.y}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="InjectionLayoutModule._propChange('y',+this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">크기 W × H</label>
        <div style="display:flex;gap:5px;margin:3px 0 10px;">
          <input type="number" value="${b.w}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="InjectionLayoutModule._propChange('w',Math.max(40,+this.value))">
          <input type="number" value="${b.h}" class="form-input" style="width:50%;font-size:0.82rem;"
                 onchange="InjectionLayoutModule._propChange('h',Math.max(22,+this.value))">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자 크기</label>
        <div style="display:flex;align-items:center;gap:6px;margin:3px 0 10px;">
          <input type="range" min="8" max="22" value="${b.fontSize || 11}"
                 style="flex:1;"
                 oninput="InjectionLayoutModule._propChange('fontSize',+this.value);
                          this.nextElementSibling.textContent=this.value+'px'">
          <span style="font-size:0.75rem;color:var(--text-muted);width:28px;">${b.fontSize || 11}px</span>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">굵기</label>
        <div style="display:flex;gap:5px;margin:3px 0 12px;">
          <button class="btn btn-sm ${b.bold ? 'btn-primary' : 'btn-outline'}" style="flex:1;font-weight:700;font-size:0.8rem;"
                  onclick="InjectionLayoutModule._propChange('bold',true)">굵게</button>
          <button class="btn btn-sm ${!b.bold ? 'btn-primary' : 'btn-outline'}" style="flex:1;font-size:0.8rem;"
                  onclick="InjectionLayoutModule._propChange('bold',false)">보통</button>
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">배경색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${PALETTE.map(c => `
            <div title="${c}" onclick="InjectionLayoutModule._propChange('color','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.color === c ? '#6366f1' : '#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.color || '#ffffff'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="InjectionLayoutModule._propChange('color',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">테두리색</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px;">
          ${BORDER_PALETTE.map(c => `
            <div title="${c}" onclick="InjectionLayoutModule._propChange('borderColor','${c}')"
                 style="width:20px;height:20px;border-radius:3px;background:${c};cursor:pointer;
                        border:2px solid ${b.borderColor === c ? '#6366f1' : '#d1d5db'};"></div>`).join('')}
          <input type="color" value="${b.borderColor || '#94a3b8'}"
                 style="width:20px;height:20px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="InjectionLayoutModule._propChange('borderColor',this.value)">
        </div>

        <label style="font-size:0.75rem;color:var(--text-secondary);">글자색</label>
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 16px;">
          <input type="color" value="${b.textColor || '#1e293b'}"
                 style="width:34px;height:26px;padding:0;border-radius:3px;cursor:pointer;border:1px solid #d1d5db;"
                 onchange="InjectionLayoutModule._propChange('textColor',this.value)">
          <span style="font-size:0.77rem;color:var(--text-secondary);">클릭해서 선택</span>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <button class="btn btn-outline btn-sm" style="width:100%;color:var(--danger);border-color:var(--danger);font-size:0.82rem;"
                  onclick="InjectionLayoutModule.delBox()">
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
        const multiKeys = ['color','borderColor','textColor','fontSize','bold'];
        if (multiKeys.includes(key) && _selSet.size > 1) {
            _selSet.forEach(id => { const ob = _getBox(id); if (ob) ob[key] = value; });
        } else {
            b[key] = value;
        }
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
            id, label: '새 품목', x: _snap(50), y: _snap(50),
            w: 90, h: 28, color: '#cffafe', borderColor: '#06b6d4',
            textColor: '#155e75', fontSize: 11, bold: true,
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
            const badge = document.getElementById('ilDirtyBadge');
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
        _nextId   = 300;
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
        Router.navigate('injection-warehouse');
    }

    /* ══════════════════════════════════════
       화살표 모드 토글
    ══════════════════════════════════════ */
    function toggleArrowMode() {
        _arrowMode = !_arrowMode;
        _arrowDraft = null;
        const btn = document.getElementById('ilArrowBtn');
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

        /* defs — 마커(화살촉) */
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const allArrows = _arrowDraft && _arrowDraft.x2 !== undefined
            ? [..._arrows, { id:'__draft__', color:'#6366f1', twoWay:false }]
            : _arrows;

        allArrows.forEach(a => {
            const color = a.id === '__draft__' ? '#6366f1' : (a.color || '#1e293b');
            /* 끝 화살촉 */
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
                /* 시작 화살촉 */
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

        /* 실제 화살표 */
        _arrows.forEach(a => {
            const isSel  = (a.id === _selArrow);
            const color  = a.color || '#1e293b';
            const sw     = a.strokeWidth || 2;
            const dash   = a.dashed ? '10,5' : '';

            /* 선택 하이라이트 */
            if (isSel) {
                const hl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hl.setAttribute('x1', a.x1); hl.setAttribute('y1', a.y1);
                hl.setAttribute('x2', a.x2); hl.setAttribute('y2', a.y2);
                hl.setAttribute('stroke', 'rgba(99,102,241,0.3)');
                hl.setAttribute('stroke-width', sw + 8);
                hl.setAttribute('stroke-linecap', 'round');
                _svgLayer.appendChild(hl);
            }

            /* 본 화살표 */
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

            /* 히트 영역 (클릭 감지용 넓은 투명 선) */
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hit.setAttribute('x1', a.x1); hit.setAttribute('y1', a.y1);
            hit.setAttribute('x2', a.x2); hit.setAttribute('y2', a.y2);
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', '14');
            hit.style.cursor = 'pointer';
            hit.style.pointerEvents = 'all';
            hit.addEventListener('mousedown', ev => {
                ev.stopPropagation();
                _selArrow = a.id;
                _sel      = null;
                _renderBoxes();
                _renderArrows();
                _renderPropPanel();
            });
            _svgLayer.appendChild(hit);

            /* 레이블 */
            if (a.label) {
                const mx = (a.x1 + a.x2) / 2;
                const my = (a.y1 + a.y2) / 2;
                const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const tw = a.label.length * 7 + 8;
                bg.setAttribute('x', mx - tw/2); bg.setAttribute('y', my - 17);
                bg.setAttribute('width', tw);     bg.setAttribute('height', 14);
                bg.setAttribute('rx', '3');
                bg.setAttribute('fill', 'rgba(255,255,255,0.85)');
                _svgLayer.appendChild(bg);

                const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                txt.setAttribute('x', mx); txt.setAttribute('y', my - 6);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('fill', isSel ? '#6366f1' : color);
                txt.setAttribute('font-size', '11');
                txt.setAttribute('font-weight', '700');
                txt.setAttribute('pointer-events', 'none');
                txt.textContent = a.label;
                _svgLayer.appendChild(txt);
            }
        });

        /* 드래프트 (그리는 중) */
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

    /* 화살표 속성 변경 */
    function _arrowPropChange(key, value) {
        const a = _arrows.find(x => x.id === _selArrow);
        if (!a) return;
        a[key] = value;
        _markDirty();
        _renderArrows();
        if (key !== 'label') _renderPropPanel();
    }

    /* 화살표 삭제 */
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
        const pw = window.open('', '_blank', 'width=1000,height=800');
        if (!pw) {
            alert('팝업이 차단되었습니다.\n브라우저 팝업 허용 후 다시 시도하세요.');
            return;
        }

        /* 박스 HTML 생성 */
        const boxesHtml = _boxes.map(b => {
            const border = (b.borderColor === 'transparent')
                ? 'none'
                : `2px solid ${b.borderColor || '#94a3b8'}`;
            /* 줄바꿈 처리 */
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
                border-radius:4px;
                display:flex; align-items:center; justify-content:center;
                box-sizing:border-box;
                overflow:hidden;">
              <span style="
                color:${b.textColor || '#1e293b'};
                font-size:${b.fontSize || 11}px;
                font-weight:${b.bold ? '700' : '500'};
                text-align:center;
                padding:2px 4px;
                white-space:pre-line;
                line-height:1.3;
                word-break:break-word;
                pointer-events:none;">${labelHtml}</span>
            </div>`;
        }).join('');

        /* 화살표 SVG 문자열 생성 */
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

        /* 현재 날짜 */
        const today = new Date().toLocaleDateString('ko-KR',
            { year:'numeric', month:'2-digit', day:'2-digit' });

        pw.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>창고 레이아웃 — 현장 게시용</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:'맑은 고딕','Malgun Gothic','Apple SD Gothic Neo',sans-serif;
    background:#f1f5f9;
    display:flex; flex-direction:column; align-items:center;
    padding:10px 12px 16px;
    min-height:100vh;
  }

  /* ── 인쇄 전용 ── */
  @page { size: A3 landscape; margin: 8mm; }
  @media print {
    body { background:#fff; padding:0; justify-content:flex-start; }
    .no-print { display:none !important; }
    /* 인쇄 시 래퍼·캔버스를 원본 크기(1200×820)로 원복 */
    #scaleWrap { width:${CANVAS_W}px !important; height:${CANVAS_H}px !important; }
    #canvasInner { transform:none !important; }
    .footer-bar { margin-top:6px; }
  }

  /* 상단 안내바 */
  .top-bar {
    width:100%; max-width:${CANVAS_W}px;
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:8px;
    font-size:12px; color:#64748b;
    background:#fff; border:1px solid #e2e8f0; border-radius:6px;
    padding:6px 12px;
  }

  /* 스케일 래퍼 — JS가 스케일 후 크기로 설정 */
  #scaleWrap {
    position:relative;
    overflow:hidden;           /* 잘림 방지 */
    flex-shrink:0;
    border-radius:8px;
    box-shadow:0 4px 20px rgba(0,0,0,0.15);
  }

  /* 캔버스 원본 크기 — transform-origin top left 으로 축소 */
  #canvasInner {
    position:absolute; top:0; left:0;
    width:${CANVAS_W}px; height:${CANVAS_H}px;
    transform-origin:top left;
    background:#c8d3dc;
    background-image:
      linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
    background-size:50px 50px;
  }

  /* 하단 바 */
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
    letter-spacing:0.3px;
  }
  .btn-print:hover { background:#0e7490; }
</style>
</head>
<body>

  <div class="top-bar no-print">
    <span>🖨&nbsp; 인쇄 버튼을 누르거나 <kbd>Ctrl+P</kbd> 를 사용하세요</span>
    <span>${today} 출력</span>
  </div>

  <!-- 래퍼: JS가 스케일된 크기로 width/height 설정 -->
  <div id="scaleWrap">
    <div id="canvasInner">${boxesHtml}${arrowsSvg}</div>
  </div>

  <div class="footer-bar">
    <span>1층 소재 / 완제품 보관창고 &nbsp;LAY-OUT</span>
    <button class="btn-print no-print" onclick="window.print()">
      🖨 &nbsp;인쇄 / PDF 저장
    </button>
    <span>출력일: ${today}</span>
  </div>

<script>
(function() {
  var CW = ${CANVAS_W}, CH = ${CANVAS_H};
  var PAD = 24;   /* 좌우 패딩 합계 */
  var TOP = 100;  /* 상단바 + 여백 */
  var BOT = 60;   /* 하단바 + 여백 */

  function applyScale() {
    var availW = window.innerWidth  - PAD;
    var availH = window.innerHeight - TOP - BOT;
    /* 가로·세로 모두 맞아야 하므로 작은 쪽 기준 */
    var scale  = Math.min(availW / CW, availH / CH, 1);

    var wrap  = document.getElementById('scaleWrap');
    var inner = document.getElementById('canvasInner');

    /* 래퍼를 스케일된 크기로 확정 → overflow:hidden 으로 깔끔하게 */
    wrap.style.width  = Math.round(CW * scale) + 'px';
    wrap.style.height = Math.round(CH * scale) + 'px';

    /* 내부 캔버스(원본 크기)를 해당 비율로 축소 */
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
        el.addEventListener('mousedown', _onResizeStart, { passive: false });
        return el;
    }

    /* ══════════════════════════════════════
       자석 스냅 기능
    ══════════════════════════════════════ */
    function toggleSnap() {
        _snapEnabled = !_snapEnabled;
        const btn = document.getElementById('ilSnapBtn');
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
            const ol  = o.x, or_ = o.x + o.w, ocx = o.x + o.w / 2;
            const ot  = o.y, ob  = o.y + o.h, ocy = o.y + o.h / 2;
            const dl  = rawX, dr = rawX + b.w, dcx = rawX + b.w / 2;
            const dt  = rawY, db = rawY + b.h, dcy = rawY + b.h / 2;

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
            guides.push({ type: 'v', pos: guideX, start: guideXRange.start, end: guideXRange.end });
        if (bestYDist <= SNAP_THRESHOLD && guideY !== null)
            guides.push({ type: 'h', pos: guideY, start: guideYRange.start, end: guideYRange.end });

        return { x: nx, y: ny, guides };
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
                    { d: Math.abs(rawW - o.w),              sw: o.w,            gx: b.x + o.w    },
                    { d: Math.abs(rightEdge - o.x),         sw: o.x - b.x,      gx: o.x          },
                    { d: Math.abs(rightEdge - (o.x + o.w)), sw: o.x + o.w - b.x, gx: o.x + o.w   },
                    { d: Math.abs(rightEdge - (o.x+o.w/2)), sw: o.x+o.w/2-b.x,  gx: o.x+o.w/2   },
                ];
                for (const c of cands) {
                    if (c.d < bestD && c.sw >= 40) {
                        bestD = c.d; nw = c.sw; guideX = c.gx;
                        gRange = { start: Math.min(o.y, b.y), end: Math.max(o.y + o.h, b.y + rawH) };
                    }
                }
            }
            if (bestD <= SNAP_THRESHOLD && guideX !== null)
                guides.push({ type: 'v', pos: guideX, start: gRange.start, end: gRange.end });
        }

        if (dir !== 'right') {
            const bottomEdge = b.y + rawH;
            let bestD = SNAP_THRESHOLD + 1;
            let guideY = null, gRange = null;
            for (const o of others) {
                const cands = [
                    { d: Math.abs(rawH - o.h),               sh: o.h,            gy: b.y + o.h    },
                    { d: Math.abs(bottomEdge - o.y),         sh: o.y - b.y,      gy: o.y          },
                    { d: Math.abs(bottomEdge - (o.y + o.h)), sh: o.y + o.h - b.y, gy: o.y + o.h   },
                    { d: Math.abs(bottomEdge - (o.y+o.h/2)), sh: o.y+o.h/2-b.y,  gy: o.y+o.h/2   },
                ];
                for (const c of cands) {
                    if (c.d < bestD && c.sh >= 22) {
                        bestD = c.d; nh = c.sh; guideY = c.gy;
                        gRange = { start: Math.min(o.x, b.x), end: Math.max(o.x + o.w, b.x + rawW) };
                    }
                }
            }
            if (bestD <= SNAP_THRESHOLD && guideY !== null)
                guides.push({ type: 'h', pos: guideY, start: gRange.start, end: gRange.end });
        }

        return { w: nw, h: nh, guides };
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

    /* ══════════════════════════════════════
       유틸
    ══════════════════════════════════════ */
    function _getBox(id) { return _boxes.find(b => b.id === id); }
    function _snap(v)    { return Math.round(v / GRID) * GRID; }
    function _esc(s)     {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function _markDirty() {
        _isDirty = true;
        const badge = document.getElementById('ilDirtyBadge');
        if (badge) badge.style.display = '';
    }

    return {
        init, render, addBox, dupBox, delBox,
        saveLayout, resetLayout, goBack, printLayout,
        _propChange, toggleSnap,
        toggleArrowMode, _arrowPropChange, _delArrow,
    };

})();
