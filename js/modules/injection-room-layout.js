/**
 * 사출실 레이아웃 편집기
 * - 사출 공정실 설비 배치도 (사출기, 금형 보관, 원재료, 대기팔레트 등)
 * - 박스 드래그 이동, 리사이즈, 텍스트 편집, 화살표
 * - 저장: Storage.setConfigValue('injection_room_layout_v1', {...})
 */
var InjectionRoomLayoutModule = (function () {

    /* ══════════════════════════════════════
       상수
    ══════════════════════════════════════ */
    const CONFIG_KEY     = 'injection_room_layout_v1';
    const CANVAS_W       = 1300;
    const CANVAS_H       = 860;
    const GRID           = 2;
    const SNAP_THRESHOLD = 12;

    /* 색상 세트 */
    const MACHINE = { color:'#dbeafe', borderColor:'#2563eb', textColor:'#1e3a8a' };   // 사출기
    const DRYER   = { color:'#fef9c3', borderColor:'#ca8a04', textColor:'#713f12' };   // 건조기
    const MOLD    = { color:'#ede9fe', borderColor:'#7c3aed', textColor:'#4c1d95' };   // 금형
    const MAT     = { color:'#fff7ed', borderColor:'#ea580c', textColor:'#7c2d12' };   // 원재료
    const WIP     = { color:'#dcfce7', borderColor:'#16a34a', textColor:'#14532d' };   // 재공품
    const PASSAGE = { color:'#f8fafc', borderColor:'#cbd5e1', textColor:'#64748b' };   // 통로
    const WALL    = { color:'#e2e8f0', borderColor:'#94a3b8', textColor:'#334155' };   // 벽/구조물
    const SPECIAL = { color:'#fce7f3', borderColor:'#db2777', textColor:'#831843' };   // 특수

    const PALETTE = [
        '#dbeafe','#fef9c3','#ede9fe','#fff7ed','#dcfce7',
        '#f8fafc','#e2e8f0','#fce7f3','#cffafe','#fef2f2',
        '#2563eb','#ca8a04','#7c3aed','#ea580c','#16a34a',
    ];
    const BORDER_PALETTE = [
        '#2563eb','#ca8a04','#7c3aed','#ea580c','#16a34a',
        '#cbd5e1','#94a3b8','#db2777','#0891b2','#dc2626',
        '#374151','#1d4ed8','#059669','#9333ea','#c2410c',
    ];

    /* ══════════════════════════════════════
       박스 생성 헬퍼
    ══════════════════════════════════════ */
    let _uid = 1;
    function _b(label, x, y, w, h, scheme, extra) {
        return Object.assign(
            { id: 'irl_' + (_uid++), label, x, y, w, h, fontSize: 11, bold: true },
            scheme, extra || {}
        );
    }

    /* ══════════════════════════════════════
       기본 레이아웃
    ══════════════════════════════════════ */
    const DEFAULT_BOXES = (function () {
        _uid = 1;
        const boxes = [];

        /* ── 제목 ── */
        boxes.push(_b('사출실  LAY - OUT', 380, 8, 520, 44,
            { color: '#ffffff', borderColor: 'transparent', textColor: '#0f172a', fontSize: 18, bold: true }));

        /* ── 벽/출입문 ── */
        boxes.push(_b('출입구', 580, 800, 140, 50, PASSAGE, { fontSize: 13 }));
        boxes.push(_b('비상구', 0, 380, 30, 80, SPECIAL, { fontSize: 10 }));

        /* ═══════════════════════════════════
           사출기 구역 (상단 2열)
        ═══════════════════════════════════ */
        const MX = 40, MW = 170, MH = 120, MG = 20;
        const m = n => MX + n * (MW + MG);

        /* 사출기 1~4호기 (1행) */
        const MY1 = 70;
        for (let i = 0; i < 4; i++) {
            boxes.push(_b(`사출기\n${i + 1}호기`, m(i), MY1, MW, MH, MACHINE, { fontSize: 13 }));
        }

        /* 사출기 5~8호기 (2행) */
        const MY2 = 240;
        for (let i = 0; i < 4; i++) {
            boxes.push(_b(`사출기\n${i + 5}호기`, m(i), MY2, MW, MH, MACHINE, { fontSize: 13 }));
        }

        /* 로봇 암 (각 사출기 옆) */
        for (let i = 0; i < 4; i++) {
            boxes.push(_b('취출\n로봇', m(i) + MW - 32, MY1 + 10, 30, 40,
                { color: '#bfdbfe', borderColor: '#3b82f6', textColor: '#1e3a8a', fontSize: 8, bold: false }));
        }

        /* 컨베이어 (1행 → 2행 연결) */
        boxes.push(_b('컨 베 이 어', m(0), MY1 + MH + 2, m(3) + MW - m(0), 16,
            { color: '#f1f5f9', borderColor: '#94a3b8', textColor: '#64748b', fontSize: 9, bold: false }));

        /* ═══════════════════════════════════
           수지 건조기 구역
        ═══════════════════════════════════ */
        const DX = 40, DY = 430, DW = 90, DH = 80, DG = 15;
        const d = n => DX + n * (DW + DG);
        for (let i = 0; i < 4; i++) {
            boxes.push(_b(`건조기\n${i + 1}`, d(i), DY, DW, DH, DRYER, { fontSize: 11 }));
        }
        boxes.push(_b('수지 건조기 구역', DX, DY - 24, DW * 4 + DG * 3, 22,
            { color: 'transparent', borderColor: 'transparent', textColor: '#92400e', fontSize: 11, bold: true }));

        /* ═══════════════════════════════════
           원재료 보관 구역
        ═══════════════════════════════════ */
        const RX = 40, RY = 560;
        boxes.push(_b('원재료\n보관 구역', RX, RY, 480, 120, MAT, { fontSize: 14 }));
        /* 원재료 슬롯 */
        const slotW = 90, slotH = 60, slotG = 6;
        const slotLabels = ['PP\n(A)', 'PP\n(B)', 'ABS\n(A)', 'ABS\n(B)', '색상\n마스터'];
        slotLabels.forEach((lbl, i) => {
            boxes.push(_b(lbl, RX + 10 + i * (slotW + slotG), RY + 50, slotW, slotH,
                { color: '#fff7ed', borderColor: '#fb923c', textColor: '#7c2d12', fontSize: 10, bold: false }));
        });

        /* ═══════════════════════════════════
           금형 보관대
        ═══════════════════════════════════ */
        const FX = 560, FY = 430;
        boxes.push(_b('금형 보관대', FX, FY - 24, 320, 22,
            { color: 'transparent', borderColor: 'transparent', textColor: '#4c1d95', fontSize: 11, bold: true }));
        const moldW = 95, moldH = 68, moldG = 8;
        const molds = ['금형\nA-1', '금형\nA-2', '금형\nB-1', '금형\nB-2',
                        '금형\nC-1', '금형\nC-2'];
        molds.forEach((lbl, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            boxes.push(_b(lbl, FX + col * (moldW + moldG), FY + row * (moldH + moldG), moldW, moldH, MOLD));
        });

        /* ═══════════════════════════════════
           재공품 대기 구역 (팔레트)
        ═══════════════════════════════════ */
        const WX = 560, WY = 560;
        boxes.push(_b('재공품 대기 구역', WX, WY - 24, 520, 22,
            { color: 'transparent', borderColor: 'transparent', textColor: '#14532d', fontSize: 11, bold: true }));
        const palW = 110, palH = 70, palG = 10;
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 4; c++) {
                const idx = r * 4 + c + 1;
                boxes.push(_b(`팔레트\n${idx}`, WX + c * (palW + palG), WY + r * (palH + palG), palW, palH, WIP));
            }
        }

        /* ═══════════════════════════════════
           우측 구역 (작업 테이블, 검사대)
        ═══════════════════════════════════ */
        const TX = 1080, TY = 70;
        boxes.push(_b('작업 테이블', TX, TY, 180, 80, PASSAGE, { fontSize: 12 }));
        boxes.push(_b('수입\n검사대', TX, TY + 100, 180, 80, WIP, { fontSize: 12 }));
        boxes.push(_b('포장\n테이블', TX, TY + 200, 180, 80, PASSAGE, { fontSize: 12 }));
        boxes.push(_b('계량기', TX, TY + 300, 180, 60, WALL, { fontSize: 12 }));

        /* 냉각 수조 */
        boxes.push(_b('냉각\n수조', TX, TY + 380, 85, 80,
            { color: '#cffafe', borderColor: '#0e7490', textColor: '#083344', fontSize: 12 }));
        boxes.push(_b('에어\n컴프레셔', TX + 95, TY + 380, 85, 80,
            { color: '#e0f2fe', borderColor: '#0284c7', textColor: '#0c4a6e', fontSize: 11 }));

        /* 소화기 */
        boxes.push(_b('🧯', 1240, 800, 44, 48,
            { color: '#fff', borderColor: 'transparent', textColor: '#dc2626', fontSize: 20, bold: false }));
        boxes.push(_b('🧯', 40, 800, 44, 48,
            { color: '#fff', borderColor: 'transparent', textColor: '#dc2626', fontSize: 20, bold: false }));

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
    let _nextId     = 500;
    let _snapEnabled = true;
    let _guideEls   = [];

    let _arrows     = [];
    let _selArrow   = null;
    let _arrowMode  = false;
    let _arrowDraft = null;
    let _svgLayer   = null;
    let _selSet     = new Set();  // 다중 선택 ID 집합
    let _lasso      = null;       // { sx, sy, ex, ey }
    let _lassoEl    = null;       // lasso rect DOM 요소

    /* ══════════════════════════════════════
       진입점
    ══════════════════════════════════════ */
    async function init() {}

    async function render(container) {
        container.innerHTML = `
        <div class="fade-in-up" style="display:flex;flex-direction:column;height:100%;min-height:0;">

          <!-- 툴바 -->
          <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;
                      background:var(--bg-card);border-bottom:1px solid var(--border);
                      flex-wrap:wrap;flex-shrink:0;">
            <button class="btn btn-outline btn-sm" onclick="InjectionRoomLayoutModule.goBack()">
              <span class="material-symbols-outlined">arrow_back</span> 목록으로
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-secondary btn-sm" onclick="InjectionRoomLayoutModule.addBox()">
              <span class="material-symbols-outlined">add_box</span> 박스 추가
            </button>
            <button class="btn btn-outline btn-sm" id="irlBtnDup" disabled
                    onclick="InjectionRoomLayoutModule.dupBox()">
              <span class="material-symbols-outlined">content_copy</span> 복제
            </button>
            <button class="btn btn-outline btn-sm" id="irlBtnDel" disabled
                    style="color:var(--danger);border-color:var(--danger);"
                    onclick="InjectionRoomLayoutModule.delBox()">
              <span class="material-symbols-outlined">delete</span> 삭제
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button class="btn btn-outline btn-sm" onclick="InjectionRoomLayoutModule.resetLayout()">
              <span class="material-symbols-outlined">restart_alt</span> 초기화
            </button>
            <div style="width:1px;height:22px;background:var(--border);"></div>
            <button id="irlSnapBtn" class="btn btn-sm" onclick="InjectionRoomLayoutModule.toggleSnap()"
                    style="background:#6366f1;color:#fff;border:2px solid #6366f1;">
              자석 ON
            </button>
            <button id="irlArrowBtn" class="btn btn-sm" onclick="InjectionRoomLayoutModule.toggleArrowMode()"
                    style="background:transparent;color:var(--text-secondary);border:2px solid var(--border);">
              <span class="material-symbols-outlined" style="font-size:15px;">east</span> 화살표
            </button>
            <div style="flex:1;"></div>
            <span id="irlDirtyBadge" style="display:none;font-size:0.77rem;color:var(--warning);
                  background:rgba(245,158,11,0.12);padding:3px 10px;border-radius:20px;">
              ● 저장되지 않음
            </span>
            <button class="btn btn-primary btn-sm" onclick="InjectionRoomLayoutModule.saveLayout()">
              <span class="material-symbols-outlined">save</span> 저장
            </button>
            <button class="btn btn-outline btn-sm" onclick="InjectionRoomLayoutModule.printLayout()"
                    style="color:#0891b2;border-color:#0891b2;">
              <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
            </button>
          </div>

          <!-- 본문 -->
          <div style="display:flex;flex:1;overflow:hidden;min-height:0;">

            <!-- 캔버스 -->
            <div style="flex:1;overflow:auto;padding:14px;background:var(--bg-secondary);">
              <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;">
                💡 <strong>클릭</strong> 선택 &nbsp;·&nbsp; <strong>드래그</strong> 이동 &nbsp;·&nbsp;
                <strong>더블클릭</strong> 이름 편집 &nbsp;·&nbsp; 모서리·엣지 핸들 <strong>드래그로 크기 조절</strong> (8방향)
              </div>
              <div id="irlCanvas" style="
                    position:relative;
                    width:${CANVAS_W}px;height:${CANVAS_H}px;
                    background:#d1d5db;
                    border:2px solid var(--border);
                    border-radius:8px;
                    box-shadow:0 2px 12px rgba(0,0,0,0.1);
                    background-image:
                      linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                      linear-gradient(90deg,rgba(0,0,0,0.03) 1px, transparent 1px);
                    background-size:${GRID * 10}px ${GRID * 10}px;
                    user-select:none;cursor:default;">
              </div>
            </div>

            <!-- 속성 패널 -->
            <div id="irlPropPanel" style="
                  width:215px;min-width:215px;
                  background:var(--bg-card);
                  border-left:1px solid var(--border);
                  overflow-y:auto;padding:14px;
                  font-size:.84rem;">
              <div style="color:var(--text-muted);text-align:center;margin-top:40px;">
                박스를 선택하면<br>속성을 편집합니다
              </div>
            </div>

          </div>
        </div>`;

        _canvas    = document.getElementById('irlCanvas');
        _propPanel = document.getElementById('irlPropPanel');
        _isDirty   = false;

        /* 저장 데이터 로드 */
        try {
            const saved = await Storage.getConfigValue(CONFIG_KEY);
            if (saved && saved.boxes) {
                _boxes  = saved.boxes;
                _arrows = saved.arrows || [];
                _nextId = (saved.nextId || 500);
            } else {
                _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
                _arrows = [];
            }
        } catch {
            _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
            _arrows = [];
        }

        _svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        _svgLayer.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;`;
        _canvas.appendChild(_svgLayer);

        _drawAll();
        _bindCanvas();
    }

    /* ══════════════════════════════════════
       그리기
    ══════════════════════════════════════ */
    function _drawAll() {
        /* 기존 박스 엘리먼트 제거 */
        _canvas.querySelectorAll('.irl-box').forEach(el => el.remove());
        _guideEls.forEach(el => el.remove());
        _guideEls = [];

        _boxes.forEach(b => _drawBox(b));
        _drawArrows();
    }

    /* 8방향 핸들 정의 */
    const HANDLES = [
        { dir:'nw', cursor:'nw-resize', top:'-5px',  left:'-5px',   transform:'' },
        { dir:'n',  cursor:'n-resize',  top:'-5px',  left:'50%',    transform:'translateX(-50%)' },
        { dir:'ne', cursor:'ne-resize', top:'-5px',  right:'-5px',  transform:'' },
        { dir:'w',  cursor:'w-resize',  top:'50%',   left:'-5px',   transform:'translateY(-50%)' },
        { dir:'e',  cursor:'e-resize',  top:'50%',   right:'-5px',  transform:'translateY(-50%)' },
        { dir:'sw', cursor:'sw-resize', bottom:'-5px',left:'-5px',  transform:'' },
        { dir:'s',  cursor:'s-resize',  bottom:'-5px',left:'50%',   transform:'translateX(-50%)' },
        { dir:'se', cursor:'se-resize', bottom:'-5px',right:'-5px', transform:'' },
    ];

    function _drawBox(b) {
        const isPrim = _sel && b.id === _sel.id;
        const isSel  = _selSet.has(b.id) || isPrim;
        const el = document.createElement('div');
        el.className = 'irl-box';
        el.dataset.id = b.id;
        el.style.cssText = `
            position:absolute;
            left:${b.x}px;top:${b.y}px;
            width:${b.w}px;height:${b.h}px;
            background:${b.color};
            border:${isPrim ? '2.5px solid #6366f1' : isSel ? '2.5px solid #3b82f6' : '2px solid ' + b.borderColor};
            border-radius:6px;
            display:flex;align-items:center;justify-content:center;
            text-align:center;
            font-size:${b.fontSize || 11}px;
            font-weight:${b.bold !== false ? '700' : '400'};
            color:${b.textColor};
            white-space:pre-wrap;
            cursor:grab;
            box-sizing:border-box;
            overflow:visible;
            transition:box-shadow .1s;
            outline:${isSel && !isPrim ? '2px dashed #3b82f6' : 'none'};
            outline-offset:2px;
            box-shadow:${isPrim
                ? '0 0 0 3px rgba(99,102,241,0.5),0 4px 12px rgba(99,102,241,0.3)'
                : isSel
                    ? '0 0 0 3px rgba(59,130,246,0.45)'
                    : '0 1px 3px rgba(0,0,0,0.10)'};
            z-index:${isPrim ? 10 : isSel ? 8 : 1};
        `;
        el.textContent = b.label;

        /* 랙 아이템 수 뱃지 */
        if (b.rackItems && b.rackItems.length > 0) {
            const badge = document.createElement('div');
            badge.style.cssText = `
                position:absolute;top:3px;right:14px;
                background:#2563eb;color:#fff;
                font-size:9px;font-weight:700;
                padding:1px 5px;border-radius:8px;
                pointer-events:none;z-index:15;line-height:1.5;
            `;
            badge.textContent = b.rackItems.length + '행';
            el.appendChild(badge);
        }

        /* 8방향 리사이즈 핸들 */
        HANDLES.forEach(h => {
            const hEl = document.createElement('div');
            hEl.className = 'irl-handle';
            hEl.dataset.dir = h.dir;
            let posStyle = '';
            if (h.top    !== undefined) posStyle += `top:${h.top};`;
            if (h.bottom !== undefined) posStyle += `bottom:${h.bottom};`;
            if (h.left   !== undefined) posStyle += `left:${h.left};`;
            if (h.right  !== undefined) posStyle += `right:${h.right};`;
            hEl.style.cssText = `
                position:absolute;${posStyle}
                width:10px;height:10px;
                background:#ffffff;
                border:2px solid #6366f1;
                border-radius:2px;
                cursor:${h.cursor};
                transform:${h.transform};
                opacity:${isSel ? '1' : '0'};
                transition:opacity .1s;
                z-index:20;
                box-sizing:border-box;
            `;
            el.appendChild(hEl);
        });

        /* hover 시 핸들 표시 */
        el.addEventListener('mouseenter', () => {
            el.querySelectorAll('.irl-handle').forEach(h => h.style.opacity = '1');
        });
        el.addEventListener('mouseleave', () => {
            if (b.id !== (_sel && _sel.id)) {
                el.querySelectorAll('.irl-handle').forEach(h => h.style.opacity = '0');
            }
        });

        _canvas.insertBefore(el, _svgLayer);
        return el;
    }

    function _drawArrows() {
        while (_svgLayer.firstChild) _svgLayer.removeChild(_svgLayer.firstChild);

        _arrows.forEach((a, idx) => {
            const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;
            const headLen = 12;
            const x2h = a.x2 - ux * headLen, y2h = a.y2 - uy * headLen;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x1); line.setAttribute('y1', a.y1);
            line.setAttribute('x2', x2h);  line.setAttribute('y2', y2h);
            line.setAttribute('stroke', a.color || '#374151');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('marker-end', `url(#irl-arrow-${idx})`);
            line.style.pointerEvents = 'stroke';
            line.style.cursor = 'pointer';
            line.addEventListener('click', () => _selectArrow(idx));

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', `irl-arrow-${idx}`);
            marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
            marker.setAttribute('refX', '3'); marker.setAttribute('refY', '3');
            marker.setAttribute('orient', 'auto');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', '0 0, 6 3, 0 6');
            poly.setAttribute('fill', a.color || '#374151');
            marker.appendChild(poly);
            defs.appendChild(marker);
            _svgLayer.appendChild(defs);
            _svgLayer.appendChild(line);

            if (a.label) {
                const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2;
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', mx); text.setAttribute('y', my - 6);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', '10');
                text.setAttribute('fill', a.color || '#374151');
                text.textContent = a.label;
                _svgLayer.appendChild(text);
            }
        });
    }

    /* ══════════════════════════════════════
       이벤트
    ══════════════════════════════════════ */
    function _bindCanvas() {
        _canvas.addEventListener('mousedown', _onMouseDown);
        _canvas.addEventListener('mousemove', _onMouseMove);
        _canvas.addEventListener('mouseup',   _onMouseUp);
        _canvas.addEventListener('dblclick',  _onDblClick);

        document.addEventListener('keydown', function _irlKeyDown(e) {
            if (!document.getElementById('irlCanvas')) {
                document.removeEventListener('keydown', _irlKeyDown); return;
            }
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            // Ctrl+Z 되돌리기 (있으면)
            const ARROW_KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
            if (ARROW_KEYS.includes(e.key) && (_selSet.size > 0 || _sel)) {
                const step = e.ctrlKey ? 5 : e.altKey ? 1 : 0;
                if (step === 0) return;
                e.preventDefault();
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
                const ids = _selSet.size > 0 ? [..._selSet] : (_sel ? [_sel.id] : []);
                ids.forEach(id => {
                    const b = _boxes.find(bx => bx.id === id);
                    if (!b) return;
                    b.x = Math.max(0, Math.min(CANVAS_W - b.w, b.x + dx));
                    b.y = Math.max(0, Math.min(CANVAS_H - b.h, b.y + dy));
                });
                _drawAll(); _markDirty();
            }
            // Delete 키로 선택 박스 삭제
            if (e.key === 'Delete' && (_selSet.size > 0 || _sel)) {
                const ids = _selSet.size > 0 ? [..._selSet] : (_sel ? [_sel.id] : []);
                _boxes = _boxes.filter(b => !ids.includes(b.id));
                _sel = null; _selSet.clear();
                _drawAll(); _showProps(null); _updateToolbar(); _markDirty();
            }
        });
    }

    function _findBox(el) {
        let cur = el;
        while (cur && cur !== _canvas) {
            if (cur.classList && cur.classList.contains('irl-box')) {
                return _boxes.find(b => b.id === cur.dataset.id);
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function _onMouseDown(e) {
        const rect = _canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

        /* 화살표 모드 */
        if (_arrowMode) {
            _arrowDraft = { x1: mx, y1: my, x2: mx, y2: my, color: '#374151', label: '' };
            return;
        }

        /* 리사이즈 핸들 (8방향) */
        if (e.target.classList.contains('irl-handle')) {
            const dir = e.target.dataset.dir;
            const box = _findBox(e.target.parentElement);
            if (box) {
                _sel = box;
                const resOthers = [..._selSet].filter(id => id !== box.id)
                    .map(id => { const ob = _boxes.find(b => b.id === id); return ob ? { box: ob, origW: ob.w, origH: ob.h } : null; }).filter(Boolean);
                _resize = {
                    box, dir,
                    startX: mx, startY: my,
                    origX: box.x, origY: box.y,
                    origW: box.w, origH: box.h,
                    others: resOthers
                };
                _drawAll();
                _showProps(box);
                _updateToolbar();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        /* 박스 선택 / 드래그 */
        const box = _findBox(e.target);
        if (box) {
            if (e.ctrlKey || e.metaKey) {
                /* Ctrl+클릭: 다중 선택 토글 */
                if (_selSet.has(box.id)) {
                    _selSet.delete(box.id);
                    if (_sel === box) _sel = _selSet.size > 0 ? _boxes.find(b => b.id === [..._selSet][_selSet.size-1]) : null;
                } else {
                    _selSet.add(box.id);
                    _sel = box;
                }
                _drawAll();
                _showProps(_sel);
                _updateToolbar();
                e.preventDefault(); e.stopPropagation(); return;
            }
            /* 단일 클릭: 이미 선택된 박스 중 하나면 다중 선택 유지, 아니면 단독 선택 */
            if (!_selSet.has(box.id)) {
                _selSet.clear();
                _selSet.add(box.id);
            }
            _sel = box;
            /* 다중 선택 드래그: 다른 선택 박스의 초기위치 저장 */
            const others = [..._selSet]
                .filter(id => id !== box.id)
                .map(id => { const ob = _boxes.find(b => b.id === id); return ob ? { box: ob, bx: ob.x, by: ob.y } : null; })
                .filter(Boolean);
            _drag = { box, offX: mx - box.x, offY: my - box.y, others, bx: box.x, by: box.y };
            _drawAll();
            _showProps(box);
            e.preventDefault();
        } else {
            if (!e.ctrlKey && !e.metaKey) {
                _sel = null;
                _selSet.clear();
                _selArrow = null;
                _drawAll();
                _showProps(null);
            }
            /* lasso 시작 */
            _lasso = { sx: mx, sy: my, ex: mx, ey: my };
            if (!_lassoEl) {
                _lassoEl = document.createElement('div');
                _lassoEl.style.cssText = 'position:absolute;border:2px dashed #3b82f6;' +
                    'background:rgba(59,130,246,0.08);pointer-events:none;z-index:9999;display:none;';
                _canvas.appendChild(_lassoEl);
            }
            _lassoEl.style.display = 'none';
        }
        _updateToolbar();
    }

    /**
     * 8방향 엣지 스냅
     * - 좌변/우변/상변/하변을 다른 박스의 4개 변에 모두 비교
     * - 인접 붙기: 내 우변 → 타 좌변, 내 좌변 → 타 우변 (겹침 없음)
     * - 정렬 붙기: 내 좌변 → 타 좌변, 내 우변 → 타 우변 (같은 선 정렬)
     */
    function _snapBox(nx, ny, b) {
        if (!_snapEnabled) return [nx, ny];

        let bestX = nx, bestY = ny;
        let minDX = SNAP_THRESHOLD + 1, minDY = SNAP_THRESHOLD + 1;

        _boxes.forEach(other => {
            if (other.id === b.id) return;
            const oL = other.x, oR = other.x + other.w;
            const oT = other.y, oB = other.y + other.h;
            const bR = nx + b.w, bB = ny + b.h;

            // ── X 스냅 후보 (우리 박스 기준)
            const xCandidates = [
                [nx,      oL],           // 내 좌변 → 타 좌변 (좌 정렬)
                [nx,      oR],           // 내 좌변 → 타 우변 (인접 오른쪽)
                [bR,      oL, -b.w],     // 내 우변 → 타 좌변 (인접 왼쪽)
                [bR,      oR, -b.w],     // 내 우변 → 타 우변 (우 정렬)
            ];

            xCandidates.forEach(([edge, ref, offset = 0]) => {
                const d = Math.abs(edge - ref);
                if (d < SNAP_THRESHOLD && d < minDX) {
                    minDX = d;
                    bestX = ref + offset;
                }
            });

            // ── Y 스냅 후보
            const yCandidates = [
                [ny,      oT],
                [ny,      oB],
                [bB,      oT, -b.h],
                [bB,      oB, -b.h],
            ];

            yCandidates.forEach(([edge, ref, offset = 0]) => {
                const d = Math.abs(edge - ref);
                if (d < SNAP_THRESHOLD && d < minDY) {
                    minDY = d;
                    bestY = ref + offset;
                }
            });
        });

        /* 그리드 정렬 (스냅 없으면 그리드에만 맞춤) */
        bestX = minDX <= SNAP_THRESHOLD ? bestX : Math.round(nx / GRID) * GRID;
        bestY = minDY <= SNAP_THRESHOLD ? bestY : Math.round(ny / GRID) * GRID;

        /* 캔버스 경계 */
        bestX = Math.max(0, Math.min(CANVAS_W - b.w, bestX));
        bestY = Math.max(0, Math.min(CANVAS_H - b.h, bestY));

        return [bestX, bestY];
    }

    function _onMouseMove(e) {
        const rect = _canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

        if (_lasso && !_drag && !_resize) {
            _lasso.ex = mx; _lasso.ey = my;
            const lx = Math.min(_lasso.sx, _lasso.ex);
            const ly = Math.min(_lasso.sy, _lasso.ey);
            const lw = Math.abs(_lasso.ex - _lasso.sx);
            const lh = Math.abs(_lasso.ey - _lasso.sy);
            if (lw > 4 || lh > 4) {
                _lassoEl.style.display = 'block';
                _lassoEl.style.left   = lx + 'px';
                _lassoEl.style.top    = ly + 'px';
                _lassoEl.style.width  = lw + 'px';
                _lassoEl.style.height = lh + 'px';
            }
            return;
        }

        if (_arrowDraft) {
            _arrowDraft.x2 = mx; _arrowDraft.y2 = my;
            _drawAll();
            /* 임시 선 그리기 */
            const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tmp.setAttribute('x1', _arrowDraft.x1); tmp.setAttribute('y1', _arrowDraft.y1);
            tmp.setAttribute('x2', mx); tmp.setAttribute('y2', my);
            tmp.setAttribute('stroke', '#6366f1'); tmp.setAttribute('stroke-width', '2');
            tmp.setAttribute('stroke-dasharray', '6,3');
            _svgLayer.appendChild(tmp);
            return;
        }

        if (_resize) {
            const { box: b, dir, startX, startY, origX, origY, origW, origH } = _resize;
            const dx = mx - startX, dy = my - startY;

            let newX = origX, newY = origY, newW = origW, newH = origH;

            /* 동쪽(오른쪽) */
            if (dir === 'e' || dir === 'ne' || dir === 'se')
                newW = Math.max(40, origW + dx);
            /* 서쪽(왼쪽) */
            if (dir === 'w' || dir === 'nw' || dir === 'sw') {
                newW = Math.max(40, origW - dx);
                newX = origX + origW - newW;
            }
            /* 남쪽(아래) */
            if (dir === 's' || dir === 'se' || dir === 'sw')
                newH = Math.max(24, origH + dy);
            /* 북쪽(위) */
            if (dir === 'n' || dir === 'ne' || dir === 'nw') {
                newH = Math.max(24, origH - dy);
                newY = origY + origH - newH;
            }

            b.x = Math.round(newX / GRID) * GRID;
            b.y = Math.round(newY / GRID) * GRID;
            b.w = Math.round(newW / GRID) * GRID;
            b.h = Math.round(newH / GRID) * GRID;

            const dw = b.w - _resize.origW, dh = b.h - _resize.origH;
            (_resize.others || []).forEach(ob => {
                ob.box.w = Math.max(40, ob.origW + dw);
                ob.box.h = Math.max(24, ob.origH + dh);
            });

            _drawAll();
            _showProps(b);
            _markDirty();
            return;
        }

        if (_drag) {
            const b = _drag.box;
            let nx = mx - _drag.offX, ny = my - _drag.offY;

            /* 8방향 엣지 스냅 (경계 클램프 포함) */
            [nx, ny] = _snapBox(nx, ny, b);

            const dx = nx - _drag.bx;
            const dy = ny - _drag.by;
            b.x = nx; b.y = ny;
            // 다중 선택된 나머지 박스도 같은 델타로 이동
            (_drag.others || []).forEach(ob => {
                ob.box.x = Math.max(0, Math.min(CANVAS_W - ob.box.w, ob.bx + dx));
                ob.box.y = Math.max(0, Math.min(CANVAS_H - ob.box.h, ob.by + dy));
            });
            _drawAll();
            _showProps(b);
            _markDirty();
        }
    }

    function _onMouseUp(e) {
        if (_arrowDraft) {
            const a = _arrowDraft;
            if (Math.abs(a.x2 - a.x1) > 10 || Math.abs(a.y2 - a.y1) > 10) {
                const label = prompt('화살표 레이블 (없으면 빈칸):') || '';
                _arrows.push({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, color: '#374151', label });
                _markDirty();
            }
            _arrowDraft = null;
            _drawAll();
        }
        if (_lasso) {
            const lx1 = Math.min(_lasso.sx, _lasso.ex);
            const ly1 = Math.min(_lasso.sy, _lasso.ey);
            const lx2 = Math.max(_lasso.sx, _lasso.ex);
            const ly2 = Math.max(_lasso.sy, _lasso.ey);
            if (lx2 - lx1 > 6 || ly2 - ly1 > 6) {
                const additive = e && (e.ctrlKey || e.metaKey);
                if (!additive) _selSet.clear();
                _boxes.forEach(b => {
                    if (b.x < lx2 && b.x + b.w > lx1 && b.y < ly2 && b.y + b.h > ly1) {
                        _selSet.add(b.id);
                    }
                });
                _sel = _selSet.size > 0 ? _boxes.find(b => b.id === [..._selSet][_selSet.size-1]) : null;
                _selArrow = null;
                _drawAll();
                _showProps(_sel);
                _updateToolbar();
            }
            _lasso = null;
            if (_lassoEl) _lassoEl.style.display = 'none';
        }
        _drag = null;
        _resize = null;
    }

    function _onDblClick(e) {
        if (_arrowMode) return;
        const box = _findBox(e.target);
        if (!box) return;
        const newLabel = prompt('레이블 편집:', box.label);
        if (newLabel !== null) { box.label = newLabel; _drawAll(); _markDirty(); }
    }

    /* ══════════════════════════════════════
       속성 패널
    ══════════════════════════════════════ */
    function _showProps(b) {
        if (!b) {
            _propPanel.innerHTML = `<div style="color:var(--text-muted);text-align:center;margin-top:40px;">박스를 선택하면<br>속성을 편집합니다</div>`;
            return;
        }

        const paletteHtml = PALETTE.map(c =>
            `<div onclick="InjectionRoomLayoutModule._setProp('color','${c}')"
                  style="width:18px;height:18px;border-radius:3px;cursor:pointer;
                         background:${c};border:2px solid ${c === b.color ? '#6366f1' : '#ccc'};"></div>`
        ).join('');
        const bpaletteHtml = BORDER_PALETTE.map(c =>
            `<div onclick="InjectionRoomLayoutModule._setProp('borderColor','${c}')"
                  style="width:18px;height:18px;border-radius:3px;cursor:pointer;
                         background:${c};border:2px solid ${c === b.borderColor ? '#6366f1' : '#ccc'};"></div>`
        ).join('');

        _propPanel.innerHTML = `
        <div style="font-weight:700;margin-bottom:12px;font-size:.9rem;color:var(--text-primary);">속성 편집</div>

        <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:2px;">레이블</label>
        <textarea oninput="InjectionRoomLayoutModule._setProp('label',this.value)"
                  style="width:100%;box-sizing:border-box;border:1px solid var(--border);
                         border-radius:6px;padding:6px;font-size:.82rem;resize:vertical;min-height:48px;"
                  >${b.label}</textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
          <div>
            <label style="font-size:.78rem;color:var(--text-muted);">X</label>
            <input type="number" value="${b.x}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px;"
                   oninput="InjectionRoomLayoutModule._setProp('x',+this.value)">
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-muted);">Y</label>
            <input type="number" value="${b.y}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px;"
                   oninput="InjectionRoomLayoutModule._setProp('y',+this.value)">
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-muted);">너비</label>
            <input type="number" value="${b.w}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px;"
                   oninput="InjectionRoomLayoutModule._setProp('w',+this.value)">
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-muted);">높이</label>
            <input type="number" value="${b.h}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px;"
                   oninput="InjectionRoomLayoutModule._setProp('h',+this.value)">
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-muted);">폰트크기</label>
            <input type="number" value="${b.fontSize || 11}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px;"
                   oninput="InjectionRoomLayoutModule._setProp('fontSize',+this.value)">
          </div>
          <div style="display:flex;align-items:flex-end;">
            <label style="display:flex;align-items:center;gap:4px;font-size:.8rem;cursor:pointer;">
              <input type="checkbox" ${b.bold !== false ? 'checked' : ''}
                     onchange="InjectionRoomLayoutModule._setProp('bold',this.checked)">
              굵게
            </label>
          </div>
        </div>

        <div style="margin-top:10px;">
          <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">배경색</label>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${paletteHtml}</div>
        </div>
        <div style="margin-top:10px;">
          <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">테두리색</label>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${bpaletteHtml}</div>
        </div>
        <div style="margin-top:10px;">
          <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">글자색</label>
          <input type="color" value="${b.textColor}"
                 oninput="InjectionRoomLayoutModule._setProp('textColor',this.value)"
                 style="width:100%;height:30px;border:none;cursor:pointer;">
        </div>

        <!-- 랙 내용 편집 -->
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:6px;">
            랙 적재 내용
            <span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:10px;
                          font-size:.75rem;font-weight:700;margin-left:4px;">
              ${(b.rackItems || []).length}행
            </span>
          </div>
          <button onclick="InjectionRoomLayoutModule.editRackItems('${b.id}')"
                  style="width:100%;padding:7px;border:1px solid #2563eb;
                         background:#eff6ff;color:#1d4ed8;border-radius:6px;
                         cursor:pointer;font-size:.83rem;font-weight:600;margin-bottom:8px;">
            ✏️ 랙 내용 편집
          </button>
          <button onclick="InjectionRoomLayoutModule.delBox()"
                  style="width:100%;padding:6px;border:1px solid #dc2626;
                         background:transparent;color:#dc2626;border-radius:6px;cursor:pointer;font-size:.83rem;">
            삭제
          </button>
        </div>`;
    }

    function _setProp(key, val) {
        if (!_sel) return;
        const multiKeys = ['color','borderColor','textColor','fontSize','bold'];
        if (multiKeys.includes(key) && _selSet.size > 1) {
            _selSet.forEach(id => { const ob = _boxes.find(b => b.id === id); if (ob) ob[key] = val; });
        } else {
            _sel[key] = val;
        }
        _drawAll();
        _showProps(_sel);
        _markDirty();
    }

    /* ══════════════════════════════════════
       랙 내용 편집
    ══════════════════════════════════════ */
    function _rackTableHtml(items) {
        const rows = (items || []).map((item, i) => `
            <tr>
              <td style="padding:4px 6px;">
                <input type="text" value="${item.carModel || ''}" placeholder="차종"
                       oninput="InjectionRoomLayoutModule._rackRowChange(${i},'carModel',this.value)"
                       style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
              </td>
              <td style="padding:4px 6px;">
                <input type="text" value="${item.partName || ''}" placeholder="부품명"
                       oninput="InjectionRoomLayoutModule._rackRowChange(${i},'partName',this.value)"
                       style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
              </td>
              <td style="padding:4px 6px;">
                <input type="text" value="${item.color || ''}" placeholder="색상"
                       oninput="InjectionRoomLayoutModule._rackRowChange(${i},'color',this.value)"
                       style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
              </td>
              <td style="padding:4px 6px;text-align:center;">
                <button onclick="InjectionRoomLayoutModule._rackRowDelete(${i})"
                        style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:16px;line-height:1;">×</button>
              </td>
            </tr>`).join('');

        return `
        <div style="max-height:420px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
            <thead>
              <tr style="background:var(--bg-secondary);">
                <th style="padding:7px 6px;text-align:left;font-weight:600;color:var(--text-secondary);min-width:80px;">차종</th>
                <th style="padding:7px 6px;text-align:left;font-weight:600;color:var(--text-secondary);min-width:140px;">부품명</th>
                <th style="padding:7px 6px;text-align:left;font-weight:600;color:var(--text-secondary);min-width:80px;">색상</th>
                <th style="width:32px;"></th>
              </tr>
            </thead>
            <tbody id="irlRackTbody">
              ${rows || '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">행을 추가하세요.</td></tr>'}
            </tbody>
          </table>
        </div>
        <button onclick="InjectionRoomLayoutModule._rackRowAdd()"
                style="margin-top:10px;width:100%;padding:8px;border:1px dashed #2563eb;
                       background:#eff6ff;color:#1d4ed8;border-radius:6px;cursor:pointer;font-size:.85rem;font-weight:600;">
          + 행 추가
        </button>`;
    }

    /* 편집 중인 랙 임시 데이터 */
    let _editingRackId  = null;
    let _editingRackItems = [];

    function editRackItems(boxId) {
        const box = _boxes.find(b => b.id === boxId);
        if (!box) return;
        _editingRackId    = boxId;
        _editingRackItems = JSON.parse(JSON.stringify(box.rackItems || []));

        UIUtils.showModal(
            `랙 내용 편집 — ${box.label}`,
            _rackTableHtml(_editingRackItems),
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="InjectionRoomLayoutModule._saveRackItems()">저장</button>`
        );
    }

    function _rackRowChange(idx, field, val) {
        if (_editingRackItems[idx]) _editingRackItems[idx][field] = val;
    }

    function _rackRowAdd() {
        _editingRackItems.push({ carModel: '', partName: '', color: '' });
        const body = document.getElementById('irlRackTbody');
        if (!body) return;
        const i = _editingRackItems.length - 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:4px 6px;">
            <input type="text" placeholder="차종"
                   oninput="InjectionRoomLayoutModule._rackRowChange(${i},'carModel',this.value)"
                   style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
          </td>
          <td style="padding:4px 6px;">
            <input type="text" placeholder="부품명"
                   oninput="InjectionRoomLayoutModule._rackRowChange(${i},'partName',this.value)"
                   style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
          </td>
          <td style="padding:4px 6px;">
            <input type="text" placeholder="색상"
                   oninput="InjectionRoomLayoutModule._rackRowChange(${i},'color',this.value)"
                   style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.83rem;box-sizing:border-box;">
          </td>
          <td style="padding:4px 6px;text-align:center;">
            <button onclick="InjectionRoomLayoutModule._rackRowDelete(${i})"
                    style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:16px;line-height:1;">×</button>
          </td>`;
        /* 빈 상태 행 제거 */
        const emptyRow = body.querySelector('td[colspan]');
        if (emptyRow) emptyRow.closest('tr').remove();
        body.appendChild(tr);
        tr.querySelector('input').focus();
    }

    function _rackRowDelete(idx) {
        _editingRackItems.splice(idx, 1);
        /* 모달 내용 재렌더 */
        const wrap = document.getElementById('irlRackTbody');
        if (wrap) {
            const modal = wrap.closest('div[style]');
            if (modal) modal.innerHTML = _rackTableHtml(_editingRackItems);
        }
    }

    function _saveRackItems() {
        const box = _boxes.find(b => b.id === _editingRackId);
        if (!box) return;
        box.rackItems = _editingRackItems.filter(r => r.carModel || r.partName || r.color);
        _editingRackId    = null;
        _editingRackItems = [];
        UIUtils.closeModal();
        _drawAll();
        _showProps(box);
        _markDirty();
        UIUtils.toast('랙 내용이 저장되었습니다.', 'success');
    }

    /* ══════════════════════════════════════
       툴바 액션
    ══════════════════════════════════════ */
    function goBack() { Router.navigate('injection-process'); }

    function addBox() {
        const b = {
            id: 'irl_' + (_nextId++),
            label: '새 박스', x: 100, y: 100, w: 120, h: 70,
            color: '#f1f5f9', borderColor: '#94a3b8', textColor: '#334155',
            fontSize: 11, bold: true
        };
        _boxes.push(b);
        _sel = b;
        _drawAll();
        _showProps(b);
        _updateToolbar();
        _markDirty();
    }

    function dupBox() {
        if (!_sel) return;
        const b = JSON.parse(JSON.stringify(_sel));
        b.id = 'irl_' + (_nextId++);
        b.x += 20; b.y += 20;
        _boxes.push(b);
        _sel = b;
        _drawAll();
        _showProps(b);
        _markDirty();
    }

    function delBox() {
        if (!_sel) return;
        _boxes = _boxes.filter(b => b.id !== _sel.id);
        _sel = null;
        _drawAll();
        _showProps(null);
        _updateToolbar();
        _markDirty();
    }

    function resetLayout() {
        if (!confirm('레이아웃을 초기 상태로 되돌리겠습니까?')) return;
        _uid = 1;
        _boxes  = JSON.parse(JSON.stringify(DEFAULT_BOXES));
        _arrows = [];
        _sel    = null;
        _drawAll();
        _showProps(null);
        _updateToolbar();
        _markDirty();
    }

    function toggleSnap() {
        _snapEnabled = !_snapEnabled;
        const btn = document.getElementById('irlSnapBtn');
        if (btn) {
            btn.textContent = _snapEnabled ? '자석 ON' : '자석 OFF';
            btn.style.background = _snapEnabled ? '#6366f1' : 'transparent';
            btn.style.color      = _snapEnabled ? '#fff'    : 'var(--text-secondary)';
            btn.style.border     = _snapEnabled ? '2px solid #6366f1' : '2px solid var(--border)';
        }
    }

    function toggleArrowMode() {
        _arrowMode = !_arrowMode;
        const btn = document.getElementById('irlArrowBtn');
        if (btn) {
            btn.style.background   = _arrowMode ? '#f59e0b' : 'transparent';
            btn.style.color        = _arrowMode ? '#fff'    : 'var(--text-secondary)';
            btn.style.borderColor  = _arrowMode ? '#f59e0b' : 'var(--border)';
        }
        _canvas.style.cursor = _arrowMode ? 'crosshair' : 'default';
    }

    function _selectArrow(idx) {
        _selArrow = idx;
        const a = _arrows[idx];
        if (!a) return;
        const color = prompt('화살표 색 (hex):', a.color || '#374151');
        if (color !== null) { a.color = color; _drawAll(); _markDirty(); }
    }

    async function saveLayout() {
        try {
            await Storage.setConfigValue(CONFIG_KEY, { boxes: _boxes, arrows: _arrows, nextId: _nextId });
            _isDirty = false;
            const badge = document.getElementById('irlDirtyBadge');
            if (badge) badge.style.display = 'none';
            UIUtils.toast('레이아웃이 저장되었습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function printLayout() {
        const style = `<style>
          body{margin:0;padding:0;}
          #printCanvas{position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;
            background:#d1d5db;
            background-image:linear-gradient(rgba(0,0,0,0.03) 1px,transparent 1px),
              linear-gradient(90deg,rgba(0,0,0,0.03) 1px,transparent 1px);
            background-size:50px 50px;}
          .pb{position:absolute;display:flex;align-items:center;justify-content:center;
            text-align:center;white-space:pre-wrap;box-sizing:border-box;border-radius:6px;border-width:2px;border-style:solid;}
          @media print{@page{size:A3 landscape;margin:10mm;}}
        </style>`;
        const boxHtml = _boxes.map(b => `
          <div class="pb" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;
               background:${b.color};border-color:${b.borderColor};color:${b.textColor};
               font-size:${b.fontSize || 11}px;font-weight:${b.bold !== false ? '700' : '400'};">${b.label}</div>
        `).join('');
        const svgHtml = `<svg style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;">
          ${_arrows.map((a, idx) => `
            <defs><marker id="pa${idx}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <polygon points="0 0,6 3,0 6" fill="${a.color || '#374151'}"/></marker></defs>
            <line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}"
                  stroke="${a.color || '#374151'}" stroke-width="2" marker-end="url(#pa${idx})"/>
            ${a.label ? `<text x="${(a.x1 + a.x2) / 2}" y="${(a.y1 + a.y2) / 2 - 6}"
              text-anchor="middle" font-size="10" fill="${a.color || '#374151'}">${a.label}</text>` : ''}
          `).join('')}
        </svg>`;
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>사출실 레이아웃</title>${style}</head>
          <body><div id="printCanvas">${boxHtml}${svgHtml}</div><script>window.onload=()=>window.print();<\/script></body></html>`);
        win.document.close();
    }

    function _markDirty() {
        _isDirty = true;
        const badge = document.getElementById('irlDirtyBadge');
        if (badge) badge.style.display = '';
    }

    function _updateToolbar() {
        const dupBtn = document.getElementById('irlBtnDup');
        const delBtn = document.getElementById('irlBtnDel');
        const hasSel = _sel || _selSet.size > 0;
        if (dupBtn) dupBtn.disabled = !hasSel;
        if (delBtn) delBtn.disabled = !hasSel;
    }

    return {
        render,
        init,
        goBack,
        addBox,
        dupBox,
        delBox,
        resetLayout,
        toggleSnap,
        toggleArrowMode,
        saveLayout,
        printLayout,
        _setProp,
        editRackItems,
        _rackRowChange,
        _rackRowAdd,
        _rackRowDelete,
        _saveRackItems
    };
})();
