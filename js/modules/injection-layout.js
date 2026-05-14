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
              <span class="material-symbols-outlined" style="font-size:15px;">magnet</span> 자석 ON
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

        const saved = await Storage.getConfigValue(CONFIG_KEY);
        if (saved && Array.isArray(saved.boxes) && saved.boxes.length) {
            _boxes  = saved.boxes;
            _nextId = Math.max(..._boxes.map(b => parseInt(b.id.replace(/\D/g, '')) || 0)) + 1;
        } else {
            _boxes = JSON.parse(JSON.stringify(DEFAULT_BOXES));
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
        div.id = 'ilbox_' + b.id;
        div.style.cssText = [
            `position:absolute`,
            `left:${b.x}px`, `top:${b.y}px`,
            `width:${b.w}px`, `height:${b.h}px`,
            `background:${b.color || '#fff'}`,
            `border:${b.borderColor === 'transparent' ? 'none' : `2px solid ${b.borderColor || '#94a3b8'}`}`,
            `border-radius:4px`,
            `display:flex`, `align-items:center`, `justify-content:center`,
            `cursor:move`, `box-sizing:border-box`,
            `box-shadow:${isSel
                ? '0 0 0 2.5px #6366f1,0 4px 16px rgba(99,102,241,0.3)'
                : '0 1px 3px rgba(0,0,0,0.10)'}`,
            `overflow:hidden`, `transition:box-shadow 0.12s`,
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
        const boxId = this.id.replace('ilbox_', '');
        _sel = boxId;
        _renderBoxes();
        _renderPropPanel();
        const b = _getBox(boxId);
        _drag   = { id: boxId, ox: e.clientX, oy: e.clientY, bx: b.x, by: b.y };
        _resize = null;
        e.preventDefault(); e.stopPropagation();
    }

    function _onResizeStart(e) {
        e.stopPropagation(); e.preventDefault();
        const boxId = this.getAttribute('data-resize');
        const dir   = this.getAttribute('data-rdir') || 'corner';
        const b     = _getBox(boxId);
        _resize = { id: boxId, ox: e.clientX, oy: e.clientY, bw: b.w, bh: b.h, dir };
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
            const el = document.getElementById('ilbox_' + b.id);
            if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
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
            b.w = Math.max(40, Math.min(CANVAS_W - b.x, snapped.w));
            b.h = Math.max(22, Math.min(CANVAS_H - b.y, snapped.h));
            _renderGuides(snapped.guides);
            const el = document.getElementById('ilbox_' + b.id);
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
            await Storage.setConfigValue(CONFIG_KEY, { boxes: _boxes });
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
        _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        _sel    = null;
        _nextId = 300;
        _markDirty();
        _renderBoxes();
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
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">magnet</span> 자석 ON';
            } else {
                btn.style.background  = 'transparent';
                btn.style.color       = 'var(--text-secondary)';
                btn.style.borderColor = 'var(--border)';
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">magnet</span> 자석 OFF';
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

    return { init, render, addBox, dupBox, delBox, saveLayout, resetLayout, goBack, _propChange, toggleSnap };

})();
