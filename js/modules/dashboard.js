/**
 * 대시보드 모듈 — 타일 형식 리디자인
 * 생산현황 + 점검/관리 현황을 컴팩트 타일로 표시
 */

const DashboardModule = (function() {
    const STORE = DB.STORES;

    // background cache warm → 대시보드 1회 재렌더 (토스트/과도한 반복 방지)
    let _cacheWarmUnsub = null;
    let _cacheWarmRefreshTimer = null;
    let _summary = null;

    async function _loadSummary() {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.getDashboardSummary !== 'function') return;
        try {
            _summary = await ApiClient.getDashboardSummary(UIUtils.today());
            renderExecutiveSummary();
            renderLineProgress();
        } catch (e) {
            console.warn('[Dashboard] summary load failed:', e);
        }
    }
    function _bindCacheWarmRefreshOnce() {
        if (typeof Storage === 'undefined' || typeof Storage.onCacheWarm !== 'function') return;
        if (_cacheWarmUnsub) return;

        const watch = new Set([
            STORE.PRODUCTION_PLANS,
            STORE.INJECTION_INVENTORY,
            STORE.INJECTION_INSPECTIONS,
            STORE.PAINTING_INCOMING,
            STORE.PAINTING_WORK,
            STORE.PAINTING_INSPECTIONS,
            STORE.SHIPPING_STANDBY,
            STORE.PRODUCT_INVENTORY,
            STORE.PRODUCT_OUTGOING,
            STORE.PROD_QUALITY_CHECK,
            STORE.PROD_QUALITY_PERFORMANCE,
            STORE.JIG_MASTER,
            STORE.JIG_LOG,
            STORE.JIG_ORDERING
        ].filter(Boolean));

        _cacheWarmUnsub = Storage.onCacheWarm(function(storeName, meta) {
            // 현재 화면이 대시보드일 때만 (컨테이너 존재로 판단)
            if (!document.getElementById('dashLineProgress') && !document.getElementById('dashMonitorTiles')) return;
            if (storeName !== '*' && !watch.has(storeName)) return;

            // 과도한 리렌더 방지: 1회만, 약간 지연
            if (_cacheWarmRefreshTimer) return;
            _cacheWarmRefreshTimer = setTimeout(function() {
                _cacheWarmRefreshTimer = null;
                try { DashboardModule.refresh(true); } catch (e) {}
            }, 250);
        });
    }

    const FPROOF_ITEMS = [
        { key:'fp01', name:'부스 온습도/IR 모니터링' },
        { key:'fp02', name:'세척용 카운터' },
        { key:'fp03', name:'텐렉 카운터' },
        { key:'fp04', name:'도료 배합 시간' },
        { key:'fp05', name:'도료 배합 비율' },
        { key:'fp06', name:'가사시간 - PC A,B' },
        { key:'fp07', name:'가사시간 - A-2부스' },
        { key:'fp08', name:'가사시간 - A-4부스' },
        { key:'fp09', name:'가사시간 - B-2부스' },
        { key:'fp10', name:'가사시간 - B-3부스' },
        { key:'fp11', name:'저수위 - A-1부스' },
        { key:'fp12', name:'저수위 - A-2부스' },
        { key:'fp13', name:'저수위 - A-4부스' },
        { key:'fp14', name:'저수위 - B-2부스' },
        { key:'fp15', name:'저수위 - B-3부스' }
    ];
    const ILLUMINATION_POINTS = [
        { pointNo:1, posNo:1, location:'배합실',       standard:500 },
        { pointNo:2, posNo:1, location:'A라인 로딩',   standard:500 },
        { pointNo:2, posNo:2, location:'A라인 언로딩', standard:500 },
        { pointNo:3, posNo:1, location:'B라인 로딩',   standard:500 },
        { pointNo:3, posNo:2, location:'B라인 언로딩', standard:500 },
        { pointNo:4, posNo:1, location:'B라인 검사대', standard:2000 },
        { pointNo:5, posNo:1, location:'레이저 #1',    standard:2000 },
        { pointNo:5, posNo:2, location:'레이저 #2',    standard:2000 },
        { pointNo:5, posNo:3, location:'레이저 #3',    standard:2000 }
    ];

    /* ══════════════════════════════════════════════════════════
       공통 유틸
    ══════════════════════════════════════════════════════════ */
    function _illumKey(p) { return `${p.pointNo}_${p.posNo}`; }
    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ══════════════════════════════════════════════════════════
       타일 HTML 빌더
       size: 'sm' = 생산현황(소), 'xs' = 점검/관리(초소형)
       valueColor 컬러에 따라 배경/테두리 자동 결정
    ══════════════════════════════════════════════════════════ */
    function _tile({ icon, title, value, valueColor, sub, onClick, badge = '', size = 'xs' }) {
        const C = valueColor || '#64748b';
        const palettes = {
            '#ef4444': { bg:'#fff5f5', border:'#fca5a5' },
            '#f59e0b': { bg:'#fffbeb', border:'#fde68a' },
            '#22c55e': { bg:'#f0fdf4', border:'#bbf7d0' },
            '#3b82f6': { bg:'#eff6ff', border:'#bfdbfe' },
            '#8b5cf6': { bg:'#f5f3ff', border:'#ddd6fe' },
            '#0891b2': { bg:'#ecfeff', border:'#a5f3fc' },
            '#10b981': { bg:'#ecfdf5', border:'#a7f3d0' },
            '#64748b': { bg:'#f8fafc', border:'#e2e8f0' },
            '#94a3b8': { bg:'#f8fafc', border:'#e2e8f0' }
        };
        const pal = palettes[C] || { bg:'#f8fafc', border:'#e2e8f0' };

        // 사이즈별 수치 정의
        const sm = size === 'sm';
        const pad     = sm ? '10px 14px 8px'  : '8px 10px 6px';
        const minH    = sm ? '82px'            : '66px';
        const iconSz  = sm ? '20px'            : '16px';
        const valSz   = sm ? '1.55rem'         : '1.2rem';
        const subSz   = sm ? '.72rem'          : '.63rem';
        const titleSz = sm ? '.65rem'          : '.6rem';
        const badgeSz = sm ? '.58rem'          : '.55rem';
        const badgePad= sm ? '2px 6px'         : '1px 5px';
        const radius  = '9px';
        const leftBdr = '4px';

        return `
        <div class="dash-tile" onclick="${onClick}"
             style="padding:${pad};border-radius:${radius};
                    border:1px solid ${pal.border};border-left:${leftBdr} solid ${C};
                    background:${pal.bg};cursor:pointer;
                    min-height:${minH};display:flex;flex-direction:column;justify-content:space-between;
                    transition:box-shadow .18s,transform .12s;"
             onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,0.09)';this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='';this.style.transform='none'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                <span class="material-symbols-outlined" style="font-size:${iconSz};color:${C};opacity:.85;">${icon}</span>
                ${badge
                    ? `<span style="font-size:${badgeSz};padding:${badgePad};background:${C};color:#fff;
                                   border-radius:4px;font-weight:700;white-space:nowrap;">${badge}</span>`
                    : ''}
            </div>
            <div>
                <div style="font-size:${valSz};font-weight:900;color:${C};line-height:1;margin-bottom:2px;">
                    ${value}
                </div>
                <div style="font-size:${subSz};font-weight:700;color:${C};margin-bottom:2px;opacity:.9;">${sub}</div>
                <div style="font-size:${titleSz};color:var(--text-muted);font-weight:500;">${title}</div>
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       메인 렌더
    ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       대시보드 블럭 자유 배치 엔진
       - 블럭 이름을 끌면 원하는 위치(픽셀 단위)로 자유 이동
       - 다른 블럭/그리드 가장자리 12px 이내로 오면 자석처럼 붙음 (Alt 누르고 끌면 자석 해제)
       - 오른쪽 아래 모서리를 끌어 가로 폭(1/12 단위)과 높이 조절
       - 배치/크기는 브라우저에 저장되어 다음 접속에도 유지
       - 좁은 화면(900px 이하)에서는 기존 세로 흐름 배치로 표시
    ══════════════════════════════════════════════════════════ */
    const LAYOUT_KEY = 'mes_dashboard_layout_v2';
    const LAYOUT_COLS = 12;
    const LAYOUT_GAP = 6;
    const SNAP_DIST = 12;
    const FREE_MIN_WIDTH = 900;
    const MIN_SPAN = 3;
    const MIN_HEIGHT = 100;
    let _moveCtx = null;
    let _resizeCtx = null;
    let _blockObserver = null;
    let _winResizeBound = false;
    let _layoutTimer = null;

    function _readLayout() {
        try {
            const parsed = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
            return (parsed && parsed.blocks) ? parsed : null;
        } catch (e) { return null; }
    }

    function _hasPos(el) { return el.dataset.x !== undefined && el.dataset.x !== ''; }

    function _saveLayout() {
        const grid = document.getElementById('dashLayoutGrid'); if (!grid) return;
        const blocks = Array.from(grid.querySelectorAll(':scope > .dash-block')).map(function(el) {
            const row = {
                key: el.dataset.block,
                w: Number(el.dataset.w) || 6,
                h: Number(el.dataset.h) || 0
            };
            if (_hasPos(el)) { row.x = Number(el.dataset.x); row.y = Number(el.dataset.y) || 0; }
            return row;
        });
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ blocks: blocks })); } catch (e) {}
    }

    function _isFree(grid) { return !!grid && grid.classList.contains('is-free'); }

    function _spanWidth(grid, w) {
        const colW = (grid.clientWidth - (LAYOUT_COLS - 1) * LAYOUT_GAP) / LAYOUT_COLS;
        return w * colW + (w - 1) * LAYOUT_GAP;
    }

    // x 는 그리드 폭 대비 비율(0~1), y 는 px — 창 폭이 바뀌어도 상대 위치 유지
    function _placeBlock(grid, el) {
        const width = _spanWidth(grid, Number(el.dataset.w) || 6);
        const maxLeft = Math.max(0, grid.clientWidth - width);
        const left = Math.min(maxLeft, Math.max(0, (Number(el.dataset.x) || 0) * grid.clientWidth));
        el.style.width = width + 'px';
        el.style.left = left + 'px';
        el.style.top = Math.max(0, Number(el.dataset.y) || 0) + 'px';
    }

    function _applyBlockStyle(el) {
        const w = Math.min(LAYOUT_COLS, Math.max(MIN_SPAN, Number(el.dataset.w) || 6));
        el.dataset.w = w;
        el.style.gridColumn = 'span ' + w;
        const h = Number(el.dataset.h) || 0;
        const body = el.querySelector(':scope > .dash-block-body');
        if (body) {
            body.style.height = h > 0 ? h + 'px' : '';
            body.style.overflowY = h > 0 ? 'auto' : '';
        }
        const label = el.querySelector('.dash-block-size');
        if (label) label.textContent = w + '/' + LAYOUT_COLS + (h > 0 ? ' · ' + h + 'px' : '');
        if (_isFree(el.parentElement)) _placeBlock(el.parentElement, el);
    }

    function _updateGridHeight(grid) {
        if (!_isFree(grid)) { grid.style.height = ''; return; }
        let bottom = 0;
        grid.querySelectorAll(':scope > .dash-block').forEach(function(el) {
            bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
        });
        grid.style.height = (bottom + 8) + 'px';
    }

    // 카드의 폭을 유지하면서 위쪽 빈 공간부터 채워 배치한다.
    function autoArrangeLayout(silent = false) {
        const grid = document.getElementById('dashLayoutGrid');
        if (!grid) return;
        const blocks = Array.from(grid.querySelectorAll(':scope > .dash-block'));
        blocks.forEach(function(block) {
            // 이전 화면 크기에서 저장된 고정 높이는 해제하고 현재 콘텐츠 높이를 사용한다.
            block.dataset.h = 0;
            _applyBlockStyle(block);
        });
        if (window.innerWidth <= FREE_MIN_WIDTH) {
            _enterFreeMode(grid);
            if (!silent) UIUtils.toast('화면 폭에 맞춰 대시보드 블럭을 세로로 자동 배치했습니다.', 'success');
            return;
        }

        _enterFreeMode(grid);
        if (!blocks.length) return;
        const colW = (grid.clientWidth - (LAYOUT_COLS - 1) * LAYOUT_GAP) / LAYOUT_COLS;
        const placed = [];

        blocks.forEach(function(block) {
            const span = Math.min(LAYOUT_COLS, Math.max(MIN_SPAN, Number(block.dataset.w) || 6));
            block.style.width = (span * colW + (span - 1) * LAYOUT_GAP) + 'px';
        });
        blocks.forEach(function(block) {
            const span = Math.min(LAYOUT_COLS, Math.max(MIN_SPAN, Number(block.dataset.w) || 6));
            const width = span * colW + (span - 1) * LAYOUT_GAP;
            let best = null;
            for (let col = 0; col <= LAYOUT_COLS - span; col += 1) {
                const left = col * (colW + LAYOUT_GAP);
                const top = placed.reduce(function(y, other) {
                    const overlapsX = left < other.right && left + width > other.left;
                    return overlapsX ? Math.max(y, other.bottom + LAYOUT_GAP) : y;
                }, 0);
                if (!best || top < best.top || (top === best.top && left < best.left)) {
                    best = { left: left, top: top };
                }
            }
            const height = block.offsetHeight;
            block.dataset.x = best.left / (grid.clientWidth || 1);
            block.dataset.y = best.top;
            block.style.left = best.left + 'px';
            block.style.top = best.top + 'px';
            placed.push({ left: best.left, top: best.top, right: best.left + width, bottom: best.top + height });
        });
        _updateGridHeight(grid);
        _saveLayout();
        if (!silent) UIUtils.toast('대시보드 카드를 빈 공간 없이 자동 정렬했습니다.', 'success');
    }

    // 넓은 화면 = 자유 배치(절대 위치), 좁은 화면 = 기존 흐름 배치
    function _enterFreeMode(grid) {
        const blocks = Array.from(grid.querySelectorAll(':scope > .dash-block'));
        if (window.innerWidth <= FREE_MIN_WIDTH) {
            if (_isFree(grid)) {
                grid.classList.remove('is-free');
                blocks.forEach(function(el) { el.style.left = el.style.top = el.style.width = ''; });
            }
            _updateGridHeight(grid);
            return;
        }
        if (!_isFree(grid)) {
            // 위치가 저장되지 않은 블럭은 현재 흐름 배치 자리를 시작 위치로 사용
            const gw = grid.clientWidth || 1;
            blocks.forEach(function(el) {
                if (!_hasPos(el)) { el.dataset.x = el.offsetLeft / gw; el.dataset.y = el.offsetTop; }
            });
            grid.classList.add('is-free');
        }
        blocks.forEach(function(el) { _placeBlock(grid, el); });
        // 저장된 예전 좌표가 겹쳐 있더라도 화면을 열 때 자동으로 분리한다.
        blocks.forEach(function(el) {
            const safe = _resolveCardCollision(grid, el, el.offsetLeft, el.offsetTop);
            if (!safe.moved) return;
            el.dataset.x = safe.left / (grid.clientWidth || 1);
            el.dataset.y = safe.top;
            el.style.left = safe.left + 'px';
            el.style.top = safe.top + 'px';
        });
        _updateGridHeight(grid);
    }

    function _applySavedLayout() {
        const grid = document.getElementById('dashLayoutGrid'); if (!grid) return;
        const layout = _readLayout();
        if (layout) {
            layout.blocks.forEach(function(row) {
                const el = grid.querySelector('.dash-block[data-block="' + row.key + '"]');
                if (!el) return;
                if (row.w) el.dataset.w = row.w;
                if (row.h) el.dataset.h = row.h;
                if (typeof row.x === 'number') { el.dataset.x = row.x; el.dataset.y = row.y || 0; }
                grid.appendChild(el);   // 저장된 순서대로 재배치
            });
            // 새 카드가 추가된 뒤 기존 저장 레이아웃을 사용하는 경우에는
            // 기본 배치(왼쪽 큰 카드 오른쪽 위·아래)를 한 번만 적용한다.
            const savedKeys = new Set(layout.blocks.map(row => row.key));
            const incoming = grid.querySelector('.dash-block[data-block="incoming"]');
            const production = grid.querySelector('.dash-block[data-block="productionTiles"]');
            const improvement = grid.querySelector('.dash-block[data-block="improvement"]');
            if (incoming && production && !savedKeys.has('productionTiles')) {
                grid.insertBefore(production, incoming.nextElementSibling);
            }
            if (production && improvement && !savedKeys.has('improvement')) {
                grid.insertBefore(improvement, production.nextElementSibling);
            }
        }
        Array.from(grid.querySelectorAll(':scope > .dash-block')).forEach(_applyBlockStyle);
        _enterFreeMode(grid);
    }

    function resetLayout() {
        try { localStorage.removeItem(LAYOUT_KEY); } catch (e) {}
        const container = document.getElementById('contentArea');
        if (container) renderStandardDashboard(container);
        UIUtils.toast('블럭 배치를 기본값으로 되돌렸습니다.', 'success');
    }

    // 자석: 후보 좌표 중 SNAP_DIST 이내에서 가장 가까운 값으로 붙인다
    function _snapAxis(value, candidates) {
        let best = value, bestD = Infinity;
        candidates.forEach(function(c) {
            const d = Math.abs(c - value);
            if (d <= SNAP_DIST && d < bestD) { bestD = d; best = c; }
        });
        return { value: best, snapped: bestD !== Infinity };
    }

    function _magnet(grid, block, left, top) {
        const w = block.offsetWidth, h = block.offsetHeight;
        const xs = [0, grid.clientWidth - w], ys = [0];
        grid.querySelectorAll(':scope > .dash-block').forEach(function(o) {
            if (o === block) return;
            const l = o.offsetLeft, t = o.offsetTop, r = l + o.offsetWidth, b = t + o.offsetHeight;
            // 카드의 같은 가장자리에 맞추면 서로 포개질 수 있으므로,
            // 자석 후보는 항상 다른 카드의 바깥쪽(간격 포함)만 사용한다.
            xs.push(r + LAYOUT_GAP, l - w - LAYOUT_GAP);
            ys.push(b + LAYOUT_GAP, t - h - LAYOUT_GAP);
        });
        const sx = _snapAxis(left, xs), sy = _snapAxis(top, ys);
        return { left: sx.value, top: sy.value, snapped: sx.snapped || sy.snapped };
    }

    // 자유 배치 카드가 서로 겹치지 않도록, 충돌하면 가장 가까운 빈 자리로 옮긴다.
    // 자석을 끈(Alt) 상태에서도 겹침만은 방지한다.
    function _resolveCardCollision(grid, block, left, top) {
        const w = block.offsetWidth, h = block.offsetHeight;
        const maxLeft = Math.max(0, grid.clientWidth - w);
        const clamp = function(x, y) {
            return { left: Math.min(maxLeft, Math.max(0, Math.round(x))), top: Math.max(0, Math.round(y)) };
        };
        const others = Array.from(grid.querySelectorAll(':scope > .dash-block')).filter(function(el) {
            return el !== block;
        }).map(function(el) {
            return { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };
        });
        const overlaps = function(x, y, o) {
            return x < o.right + LAYOUT_GAP && x + w > o.left - LAYOUT_GAP &&
                y < o.bottom + LAYOUT_GAP && y + h > o.top - LAYOUT_GAP;
        };
        const clear = function(pos) { return !others.some(function(o) { return overlaps(pos.left, pos.top, o); }); };
        const initial = clamp(left, top);
        if (clear(initial)) return Object.assign(initial, { moved: false });

        const candidates = [];
        others.forEach(function(o) {
            candidates.push(clamp(o.left - w - LAYOUT_GAP, initial.top));
            candidates.push(clamp(o.right + LAYOUT_GAP, initial.top));
            candidates.push(clamp(initial.left, o.top - h - LAYOUT_GAP));
            candidates.push(clamp(initial.left, o.bottom + LAYOUT_GAP));
        });
        const clearCandidate = candidates.filter(clear).sort(function(a, b) {
            const da = Math.pow(a.left - initial.left, 2) + Math.pow(a.top - initial.top, 2);
            const db = Math.pow(b.left - initial.left, 2) + Math.pow(b.top - initial.top, 2);
            return da - db;
        })[0];
        if (clearCandidate) return Object.assign(clearCandidate, { moved: true });

        // 주변에 즉시 빈 자리가 없으면, 모든 카드 아래의 첫 빈 줄로 이동한다.
        const below = clamp(initial.left, others.reduce(function(max, o) {
            return Math.max(max, o.bottom + LAYOUT_GAP);
        }, 0));
        return Object.assign(below, { moved: true });
    }

    // 기준 카드(fixed)는 그 자리에 두고, 나머지 카드는 좌우 위치를 유지한 채
    // 겹치지 않는 가장 위쪽 자리로 다시 쌓는다. (끌기·크기 조절 중 카드가 맨 아래로 밀려나거나
    // 빈 자리가 없어 다시 옮길 수 없게 되는 문제 방지)
    function _reflowAround(grid, fixed) {
        const gw = grid.clientWidth || 1;
        const others = Array.from(grid.querySelectorAll(':scope > .dash-block')).filter(function(el) {
            return el !== fixed;
        }).sort(function(a, b) {
            return (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft);
        });
        const rect = function(el, left, top) {
            return { left: left, right: left + el.offsetWidth, top: top, bottom: top + el.offsetHeight };
        };
        const placed = [rect(fixed, fixed.offsetLeft, fixed.offsetTop)];
        others.forEach(function(el) {
            const left = el.offsetLeft;
            const right = left + el.offsetWidth;
            const h = el.offsetHeight;
            const ys = [0].concat(placed.map(function(p) { return p.bottom + LAYOUT_GAP; }))
                .sort(function(a, b) { return a - b; });
            let top = ys[ys.length - 1];
            for (let i = 0; i < ys.length; i += 1) {
                const y = ys[i];
                const hit = placed.some(function(p) {
                    return left < p.right + LAYOUT_GAP && right > p.left - LAYOUT_GAP &&
                        y < p.bottom + LAYOUT_GAP && y + h > p.top - LAYOUT_GAP;
                });
                if (!hit) { top = y; break; }
            }
            el.dataset.x = left / gw;
            el.dataset.y = top;
            el.style.top = top + 'px';
            placed.push(rect(el, left, top));
        });
    }

    function _initLayoutDnD() {
        const grid = document.getElementById('dashLayoutGrid'); if (!grid) return;

        grid.addEventListener('pointerdown', function(e) {
            if (e.button !== 0) return;
            // ── 크기 조절 (오른쪽 아래 모서리) ──
            const resizeHandle = e.target.closest('.dash-block-resize');
            if (resizeHandle) {
                const block = resizeHandle.closest('.dash-block');
                const body = block.querySelector(':scope > .dash-block-body');
                const colW = (grid.clientWidth - (LAYOUT_COLS - 1) * LAYOUT_GAP) / LAYOUT_COLS;
                _resizeCtx = {
                    block: block,
                    startX: e.clientX, startY: e.clientY,
                    startW: Number(block.dataset.w) || 6,
                    startH: Number(block.dataset.h) || (body ? body.getBoundingClientRect().height : 200),
                    colW: colW
                };
                block.classList.add('is-resizing');
                document.body.classList.add('dash-layout-resizing');
                resizeHandle.setPointerCapture(e.pointerId);
                e.preventDefault();
                return;
            }
            // ── 자유 이동 (블럭 이름 영역) ──
            const moveHandle = e.target.closest('.dash-block-handle');
            if (!moveHandle || !_isFree(grid)) return;
            const block = moveHandle.closest('.dash-block');
            _moveCtx = {
                block: block,
                startX: e.clientX, startY: e.clientY,
                startLeft: block.offsetLeft, startTop: block.offsetTop
            };
            grid.querySelectorAll(':scope > .dash-block').forEach(function(el) { el.style.zIndex = ''; });
            block.style.zIndex = 5;   // 끌고 있는 블럭을 맨 앞으로
            block.classList.add('is-dragging');
            document.body.classList.add('dash-layout-dragging');
            moveHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        grid.addEventListener('pointermove', function(e) {
            if (_moveCtx) {
                const c = _moveCtx;
                let left = c.startLeft + (e.clientX - c.startX);
                let top = c.startTop + (e.clientY - c.startY);
                let snapped = false;
                if (!e.altKey) {
                    const m = _magnet(grid, c.block, left, top);
                    left = m.left; top = m.top; snapped = m.snapped;
                }
                left = Math.min(Math.max(0, grid.clientWidth - c.block.offsetWidth), Math.max(0, left));
                top = Math.max(0, Math.round(top));
                c.block.dataset.x = left / (grid.clientWidth || 1);
                c.block.dataset.y = top;
                c.block.style.left = left + 'px';
                c.block.style.top = top + 'px';
                _reflowAround(grid, c.block);
                c.block.classList.toggle('is-snapped', snapped);
                _updateGridHeight(grid);
                return;
            }
            if (!_resizeCtx) return;
            const c = _resizeCtx;
            const spanDelta = Math.round((e.clientX - c.startX) / (c.colW + LAYOUT_GAP));
            c.block.dataset.w = Math.min(LAYOUT_COLS, Math.max(MIN_SPAN, c.startW + spanDelta));
            const h = Math.round((c.startH + (e.clientY - c.startY)) / 8) * 8;
            c.block.dataset.h = Math.max(MIN_HEIGHT, h);
            _applyBlockStyle(c.block);
            if (_isFree(grid)) {
                // 폭이 늘어 오른쪽 끝을 넘으면 왼쪽으로만 당기고, 겹치는 다른 카드는 아래로 밀어낸다
                const maxLeft = Math.max(0, grid.clientWidth - c.block.offsetWidth);
                if (c.block.offsetLeft > maxLeft) {
                    c.block.dataset.x = maxLeft / (grid.clientWidth || 1);
                    c.block.style.left = maxLeft + 'px';
                }
                _reflowAround(grid, c.block);
            }
            _updateGridHeight(grid);
        });
        ['pointerup', 'pointercancel'].forEach(function(evt) {
            grid.addEventListener(evt, function() {
                if (_moveCtx) {
                    _moveCtx.block.classList.remove('is-dragging', 'is-snapped');
                    document.body.classList.remove('dash-layout-dragging');
                    _moveCtx = null;
                    _saveLayout();
                }
                if (!_resizeCtx) return;
                _resizeCtx.block.classList.remove('is-resizing');
                document.body.classList.remove('dash-layout-resizing');
                _resizeCtx = null;
                _saveLayout();
            });
        });
        // 모서리 더블클릭 = 높이 자동(내용에 맞춤)
        grid.addEventListener('dblclick', function(e) {
            const handle = e.target.closest('.dash-block-resize');
            if (!handle) return;
            const block = handle.closest('.dash-block');
            block.dataset.h = 0;
            _applyBlockStyle(block);
            _saveLayout();
        });

        // 블럭 내용이 늦게 채워져 높이가 바뀌면 그리드 높이도 따라간다
        if (_blockObserver) _blockObserver.disconnect();
        if (window.ResizeObserver) {
            _blockObserver = new ResizeObserver(function() {
                _updateGridHeight(grid);
                if (_isFree(grid) && !_moveCtx && !_resizeCtx) {
                    clearTimeout(_layoutTimer);
                    _layoutTimer = setTimeout(function() { autoArrangeLayout(true); }, 100);
                }
            });
            grid.querySelectorAll(':scope > .dash-block').forEach(function(el) { _blockObserver.observe(el); });
        }
        if (!_winResizeBound) {
            _winResizeBound = true;
            window.addEventListener('resize', function() {
                const g = document.getElementById('dashLayoutGrid');
                if (!g) return;
                clearTimeout(_layoutTimer);
                _layoutTimer = setTimeout(function() { autoArrangeLayout(true); }, 120);
            });
        }
    }

    function _removeDuplicateBlocks(grid) {
        const seen = new Set();
        Array.from(grid.querySelectorAll(':scope > .dash-block')).forEach(function(el) {
            const key = el.dataset.block || '';
            if (!key || !seen.has(key)) {
                if (key) seen.add(key);
                return;
            }
            el.remove();
        });
    }

    function renderStandardDashboard(container) {
        container.innerHTML = `
        <div class="dash-standard-page fade-in-up">
            <div class="dash-free-grid" id="dashLayoutGrid">
                <div class="dash-block" data-block="incoming" data-w="7"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>수입검사 현황<span class="dash-block-size"></span></div><div class="dash-block-body"><div class="card dash-standard-incoming-panel"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">TODAY / INCOMING INSPECTION</span><h2>수입검사 현황</h2></div><span class="dash-section-note">오늘 입고된 품목</span></div><div id="dashIncomingSummary"></div></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="productionTiles" data-w="5"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>생산 현황<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashProdTiles"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="improvement" data-w="5"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>개선활동 / 우수 사원<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashImprovementTiles"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="monitorTiles" data-w="5"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>점검 / 관리 현황<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashMonitorTiles"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="fifoViolation" data-w="12"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>선입선출(FIFO) 위반 — 사출 · 도료<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashFifoViolation"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="processViolation" data-w="12"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>프로세스 위반 — 직접 입고(미검사)<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashProcessViolation"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="managerAlerts" data-w="7"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>관리자 보고 누락<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashManagerAlerts"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="qualityStandby" data-w="7"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>초중종물 · 출하검사 대기<span class="dash-block-size"></span></div><div class="dash-block-body"><div class="dash-standard-row"><div id="dashQualityStdWarnings"></div><div id="dashShippingStandby"></div></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="paintPending" data-w="5"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>도료 입고 대기<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashPaintPending"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="jigLife" data-w="12"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>도장 지그 교체 임박<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashJigLifeAlerts"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
                <div class="dash-block" data-block="alertRow" data-w="12"><div class="dash-block-handle"><span class="material-symbols-outlined">drag_indicator</span>경보<span class="dash-block-size"></span></div><div class="dash-block-body"><div id="dashAlertRow" style="display:none;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;"></div></div><div class="dash-block-resize" title="끌어서 크기 조절 · 더블클릭 시 높이 자동"></div></div>
            </div>
            <div class="dash-layout-tools">
                <span class="dash-layout-tip">블럭 이름을 끌어 자유 이동(가장자리 자석 · Alt 누르면 해제) · 오른쪽 아래 모서리를 끌어 크기 조절</span>
                <button class="dash-layout-reset" onclick="DashboardModule.autoArrangeLayout()">
                    <span class="material-symbols-outlined">auto_awesome_mosaic</span>자동 정렬
                </button>
                <button class="dash-layout-reset" onclick="DashboardModule.resetLayout()">
                    <span class="material-symbols-outlined">restart_alt</span>블럭 배치 초기화
                </button>
            </div>
        </div>`;
        _removeDuplicateBlocks(document.getElementById('dashLayoutGrid'));
        _applySavedLayout();
        _initLayoutDnD();
        renderIncomingSummary();
        renderProductionTiles();
        _scheduleIdleWork(renderProcessViolation);
        _scheduleIdleWork(renderFifoViolation);
        _scheduleIdleWork(_notifyLaserShipGapOnce);
        renderManagerAlerts();
        renderQualityStdWarnings();
        renderShippingStandby();
        renderPaintPending();
        renderAlertRow().catch(e => console.warn('[Dashboard] 경보 렌더 실패:', e));
        _scheduleIdleWork(renderJigLifeAlerts);
        _scheduleIdleWork(renderMonitorTiles);
        renderImprovementTiles();
        _bindCacheWarmRefreshOnce();
        _loadSummary();
        // 저장된 좌표나 높이를 따르지 않고, 현재 화면과 타일 콘텐츠에 맞춰 매 진입 시 재배치한다.
        setTimeout(function() {
            if (document.getElementById('dashLayoutGrid')) autoArrangeLayout(true);
        }, 800);
    }

    /* ══════════════════════════════════════════════════════════
       현황 모니터(TV) 슬라이드 — 내용이 있는 화면만 자동으로 순환
    ══════════════════════════════════════════════════════════ */
    const TV_SLIDE_SEC = 12;          // 화면당 노출 시간(초)
    let _tvTimer = null, _tvClock = null, _tvIndex = 0, _tvSlides = [], _tvElapsed = 0;

    function _tvHasContent(slide) {
        if (slide.dataset.keep === '1') return true;
        // 숨겨지지 않은 자식 중 실제 글자가 있으면 표시 대상
        return Array.from(slide.querySelectorAll('.dash-monitor-panel, .dash-monitor-section, .dash-executive-summary, #dashAlertRow, #dashImprovementTiles'))
            .some(function(el) {
                if (!el || el.style.display === 'none') return false;
                if (!el.offsetParent && el.style.display !== '') return false;
                return (el.textContent || '').trim().length > 0;
            });
    }

    function _tvShow(index) {
        if (!_tvSlides.length) return;
        _tvIndex = (index + _tvSlides.length) % _tvSlides.length;
        _tvSlides.forEach(function(sl, i) { sl.classList.toggle('is-active', i === _tvIndex); });
        const name = document.getElementById('dashTvSlideName');
        if (name) name.textContent = _tvSlides[_tvIndex].dataset.slide || '';
        const dots = document.getElementById('dashTvDots');
        if (dots) {
            Array.from(dots.children).forEach(function(d, i) { d.classList.toggle('is-on', i === _tvIndex); });
        }
        _tvElapsed = 0;
    }

    /* ── TV 차트 (Chart.js) ─────────────────────────────── */
    const _tvCharts = {};
    const TV_FONT = 20;   // TV 차트 기본 글자 크기

    function _tvRecentDays(n) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            out.push(d.toISOString().slice(0, 10));
        }
        return out;
    }

    function _tvDraw(id, config) {
        if (typeof Chart === 'undefined') return;
        const el = document.getElementById(id); if (!el) return;
        if (_tvCharts[id]) { _tvCharts[id].destroy(); delete _tvCharts[id]; }
        Chart.defaults.font.size = TV_FONT;
        Chart.defaults.font.weight = '700';
        Chart.defaults.color = '#475569';
        _tvCharts[id] = new Chart(el, config);
    }

    function _renderTvCharts() {
        const days = _tvRecentDays(7);
        const labels = days.map(d => d.slice(5).replace('-', '/'));
        const works = Storage.getAll(STORE.PAINTING_WORK) || [];
        const plans = Storage.getAll(STORE.PRODUCTION_PLANS) || [];
        const qtyOf = w => Number(w.productionQty) || Number(w.inputQty) || 0;

        // 1) 최근 7일 도장 생산 추이 (라인 A/B)
        const seriesA = days.map(d => works.filter(w => w.date === d && String(w.line || '').replace(/\s/g, '') === '도장-A').reduce((s2, w) => s2 + qtyOf(w), 0));
        const seriesB = days.map(d => works.filter(w => w.date === d && String(w.line || '').replace(/\s/g, '') === '도장-B').reduce((s2, w) => s2 + qtyOf(w), 0));
        _tvDraw('dashTvTrend', {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: '도장-A', data: seriesA, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', borderWidth: 4, tension: .35, fill: true, pointRadius: 5 },
                    { label: '도장-B', data: seriesB, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.12)', borderWidth: 4, tension: .35, fill: true, pointRadius: 5 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { labels: { boxWidth: 18, font: { size: TV_FONT + 2 } } } },
                scales: { y: { beginAtZero: true, ticks: { font: { size: TV_FONT } } }, x: { ticks: { font: { size: TV_FONT } } } }
            }
        });

        // 2) 금일 라인별 계획 대비 실적
        const today = UIUtils.today();
        const lineStats = ['도장-A', '도장-B'].map(line => _todayWorkSummary(line));
        _tvDraw('dashTvLine', {
            type: 'bar',
            data: {
                labels: ['도장-A', '도장-B'],
                datasets: [
                    { label: '계획', data: lineStats.map(s2 => s2.planQty), backgroundColor: '#cbd5e1', borderRadius: 8 },
                    { label: '실적', data: lineStats.map(s2 => s2.actualQty), backgroundColor: '#16b981', borderRadius: 8 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: {
                    legend: { labels: { boxWidth: 18, font: { size: TV_FONT + 2 } } },
                    tooltip: { enabled: false }
                },
                scales: { y: { beginAtZero: true, ticks: { font: { size: TV_FONT } } }, x: { ticks: { font: { size: TV_FONT + 4 } } } }
            }
        });

        // 3) 최근 7일 수입검사 입고량
        const insp = Storage.getAll(STORE.INJECTION_INSPECTIONS) || [];
        const incomingSeries = days.map(d => insp
            .filter(r => String(r.date || '').slice(0, 10) === d)
            .reduce((s2, r) => s2 + (Number(r.incomingQty) || 0), 0));
        _tvDraw('dashTvIncoming', {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: '입고 EA', data: incomingSeries, backgroundColor: '#8b5cf6', borderRadius: 8 }] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { font: { size: TV_FONT } } }, x: { ticks: { font: { size: TV_FONT } } } }
            }
        });

        // 4) 금일 출하 예정 상위 품목
        const ship = (Storage.getAll(STORE.SALES_DELIVERY_PLAN) || [])
            .filter(r => String(r.date || '').slice(0, 10) === today);
        const byPart = {};
        ship.forEach(r => {
            const key = r.partName || '품명 미등록';
            byPart[key] = (byPart[key] || 0) + (Number(r.planQty) || 0);
        });
        const top = Object.keys(byPart).map(k => [k, byPart[k]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
        _tvDraw('dashTvShipping', {
            type: 'bar',
            data: {
                labels: top.map(t => t[0]),
                datasets: [{ label: '출하 예정 EA', data: top.map(t => t[1]), backgroundColor: '#a855f7', borderRadius: 8 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { font: { size: TV_FONT } } }, y: { ticks: { font: { size: TV_FONT } } } }
            }
        });
    }

    function toggleFullscreen() {
        if (typeof Router !== 'undefined' && Router.toggleMonitorFullscreen) {
            Router.toggleMonitorFullscreen();
        } else if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function() {});
        } else if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(function() {});
        }
        setTimeout(_syncFullscreenBtn, 200);
    }

    function _syncFullscreenBtn() {
        const btn = document.getElementById('dashTvFsBtn'); if (!btn) return;
        const on = !!document.fullscreenElement;
        btn.querySelector('.material-symbols-outlined').textContent = on ? 'fullscreen_exit' : 'fullscreen';
        btn.querySelector('span:last-child').textContent = on ? '전체 화면 종료' : '전체 화면';
    }

    /* ── TV 전용 표: 금일 수입검사 / 금일 창고 입출고 ─────────── */
    function _tvTable(headers, rows, emptyText) {
        if (!rows.length) {
            return '<div class="dash-tv-empty"><span class="material-symbols-outlined">inbox</span>' + emptyText + '</div>';
        }
        return '<table class="dash-tv-table"><thead><tr>'
            + headers.map(function(h) { return '<th' + (h[1] ? ' style="text-align:' + h[1] + '"' : '') + '>' + h[0] + '</th>'; }).join('')
            + '</tr></thead><tbody>'
            + rows.map(function(r) { return '<tr>' + r.join('') + '</tr>'; }).join('')
            + '</tbody></table>';
    }

    function _renderTvIncomingTable() {
        const el = document.getElementById('dashTvIncomingTable'); if (!el) return;
        const today = UIUtils.today();
        const rows = (Storage.getAll(STORE.INJECTION_INSPECTIONS) || [])
            .filter(r => String(r.date || '').slice(0, 10) === today)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 10)
            .map(r => {
                const time = String(r.date || '').slice(11, 16) || '-';
                const verdict = String(r.verdict || '').trim();
                const pass = verdict === '합격';
                const badge = verdict
                    ? '<span class="dash-tv-badge ' + (pass ? 'ok' : 'ng') + '">' + _esc(verdict) + '</span>'
                    : '<span class="dash-tv-badge wait">검사중</span>';
                return [
                    '<td class="t-time">' + _esc(time) + '</td>',
                    '<td class="t-name"><b>' + _esc(r.partName || '품명 미등록') + '</b></td>',
                    '<td>' + _esc(r.carModel || '-') + '</td>',
                    '<td class="t-num">' + UIUtils.formatNumber(r.incomingQty || 0) + ' <em>EA</em></td>',
                    '<td class="t-center">' + badge + '</td>'
                ];
            });
        el.innerHTML = _tvTable(
            [['입고시간'], ['품목'], ['차종'], ['수량', 'right'], ['판정', 'center']],
            rows, '금일 수입검사 내역이 없습니다.');
    }

    function _tvMoveRows(store, unit, nameKeys, withType) {
        const today = UIUtils.today();
        return (store ? (Storage.getAll(store) || []) : [])
            .filter(r => String(r.date || '').slice(0, 10) === today)
            .filter(r => r.type === '입고' || r.type === '출고')
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 10)
            .map(r => {
                const name = nameKeys.map(k => r[k]).find(Boolean) || '품목 미등록';
                const time = String(r.time || String(r.date || '').slice(11, 16) || '').slice(0, 5) || '-';
                const cells = [];
                if (withType) cells.push('<td>' + _esc(r.carModel || '-') + '</td>');
                cells.push('<td class="t-name"><b>' + _esc(name) + '</b></td>');
                cells.push('<td class="t-num">' + UIUtils.formatNumber(r.quantity || 0) + ' <em>' + unit + '</em></td>');
                cells.push('<td class="t-center"><span class="dash-tv-badge ' + (r.type === '출고' ? 'out' : 'in') + '">'
                    + _esc(r.type) + '</span></td>');
                if (!withType) cells.push('<td class="t-time">' + _esc(time) + '</td>');
                return cells;
            });
    }

    function _renderTvWarehouseTables() {
        const inj = document.getElementById('dashTvInjMoves');
        if (inj) {
            inj.innerHTML = _tvTable(
                [['차종'], ['자재명'], ['수량', 'right'], ['구분', 'center']],
                _tvMoveRows(STORE.INJECTION_INVENTORY, 'EA', ['partName', 'materialName'], true),
                '금일 사출 입출고 기록이 없습니다.');
        }
        const paint = document.getElementById('dashTvPaintMoves');
        if (paint) {
            paint.innerHTML = _tvTable(
                [['도료명'], ['수량', 'right'], ['구분', 'center'], ['입고시간']],
                _tvMoveRows(STORE.PAINT_INVENTORY, 'KG', ['paintName', 'materialName', 'partName'], false),
                '금일 도료 입출고 기록이 없습니다.');
        }
    }

    /* ── 지그 수명 차트 + 교체 임박 목록 ─────────────────────── */
    function _tvJigData() {
        if (typeof JigModule === 'undefined') return [];
        if (JigModule.getAllJigLife) return JigModule.getAllJigLife() || [];
        return (JigModule.getLifeActionJigs ? JigModule.getLifeActionJigs() : []) || [];
    }

    function _tvJigColor(pct) {
        if (pct >= 90) return '#dc2626';
        if (pct >= 70) return '#f59e0b';
        return '#16a34a';
    }

    // 금일 도장-A/B 계획·작업에 올라온 품목(차종+품명) 집합
    function _tvTodayItems() {
        const today = UIUtils.today();
        const keys = new Map();
        const push = function(car, part) {
            const c = String(car || '').trim(), p = String(part || '').trim();
            if (!p) return;
            keys.set(c + '|' + p, { carModel: c, partName: p });
        };
        (Storage.getAll(STORE.PRODUCTION_PLANS) || [])
            .filter(r => r.date === today && /도장-?[AB]/.test(String(r.line || '')))
            .forEach(r => push(r.carModel, r.partName));
        (Storage.getAll(STORE.PAINTING_WORK) || [])
            .filter(r => r.date === today && /도장-?[AB]/.test(String(r.line || '')))
            .forEach(r => push(r.carModel, r.partName));
        return Array.from(keys.values());
    }

    function _renderTvJigCharts() {
        const jigs = _tvJigData();
        const items = _tvTodayItems();

        // 금일 생산 품목과 짝이 맞는 지그만 추출 (차종+품명 일치, 없으면 품명 일치)
        const matched = [];
        items.forEach(function(it) {
            const hit = jigs.filter(j =>
                String(j.partName || '').trim() === it.partName &&
                (!it.carModel || !j.carModel || String(j.carModel).trim() === it.carModel));
            (hit.length ? hit : jigs.filter(j => String(j.partName || '').trim() === it.partName))
                .forEach(j => { if (matched.indexOf(j) === -1) matched.push(j); });
        });
        const rows = (matched.length ? matched : jigs).slice(0, 10)
            .sort((a, b) => (b.pct || 0) - (a.pct || 0));

        _tvDraw('dashTvJigLife', {
            type: 'bar',
            data: {
                labels: rows.map(j => [
                    ((j.carModel ? j.carModel + ' ' : '') + (j.partName || '-')),
                    UIUtils.formatNumber(j.usedCount || 0) + ' / ' + UIUtils.formatNumber(j.manage || 0) + '회'
                ]),
                datasets: [{
                    label: '사용률 %',
                    data: rows.map(j => Math.round(j.pct || 0)),
                    backgroundColor: rows.map(j => _tvJigColor(j.pct || 0)),
                    borderRadius: 8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: !matched.length,
                        text: '금일 도장 생산 품목이 없어 전체 지그를 표시합니다',
                        color: '#94a3b8', font: { size: TV_FONT }
                    }
                },
                scales: {
                    x: { beginAtZero: true, max: 100, ticks: { font: { size: TV_FONT }, callback: v => v + '%' } },
                    y: { ticks: { font: { size: TV_FONT - 1 } } }
                }
            }
        });
    }

    function _renderTvJigList() {
        ['dashTvJigList', 'dashTvJigAction'].forEach(_renderTvJigListInto);
    }

    function _renderTvJigListInto(elId) {
        const el = document.getElementById(elId); if (!el) return;
        const action = (typeof JigModule !== 'undefined' && JigModule.getLifeActionJigs)
            ? (JigModule.getLifeActionJigs() || []) : [];
        const rows = action.slice(0, 8).map(j => {
            const pct = Math.round(j.pct || 0);
            const color = _tvJigColor(pct);
            return [
                '<td>' + _esc(j.carModel || '-') + '</td>',
                '<td class="t-name"><b>' + _esc(j.partName || '-') + '</b></td>',
                '<td>' + _esc(j.line || '-') + '</td>',
                '<td class="t-num">' + UIUtils.formatNumber(j.usedCount || 0) + ' <em>/ ' + UIUtils.formatNumber(j.manage || 0) + '</em></td>',
                '<td class="t-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + color + '"></i>'
                    + '<b style="color:' + color + '">' + pct + '%</b></td>',
                '<td class="t-center">' + (j.orderDate && j.orderDate !== '-'
                    ? '<span class="dash-tv-badge in">발주 ' + _esc(j.orderDate) + '</span>'
                    : '<span class="dash-tv-badge ng">미발주</span>') + '</td>'
            ];
        });
        el.innerHTML = _tvTable(
            [['차종'], ['제품명'], ['라인'], ['사용/수명', 'right'], ['수명 진행률'], ['발주', 'center']],
            rows, '교체 임박 지그가 없습니다.');
    }

    /* ── 품질 실적 (PROD_QUALITY_PERFORMANCE) ─────────────────── */
    function _qualityRows(year) {
        const store = DB.STORES.PROD_QUALITY_PERFORMANCE;
        if (!store) return [];
        return (Storage.getAll(store) || [])
            .filter(r => r && !r._docKind && Number(r.year) === Number(year));
    }

    function _qualitySum(rows, category) {
        const list = category ? rows.filter(r => r.category === category) : rows;
        const input = list.reduce((s2, r) => s2 + (Number(r.inputQty) || 0), 0);
        const defect = list.reduce((s2, r) => s2 + (Number(r.defectQty) || 0)
            + (r.category === 'process' ? (Number(r.reworkQty) || 0) : 0), 0);
        return { input: input, defect: defect, ppm: input > 0 ? Math.round(defect / input * 1000000) : 0 };
    }

    function _renderTvQuality() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const rows = _qualityRows(year);
        const monthRows = rows.filter(r => Number(r.month) === month);
        const yearNote = document.getElementById('dashTvQualityYear');
        if (yearNote) yearNote.textContent = year + '년 · ' + month + '월 기준';

        // KPI 카드 (공정 / 고객 / 외주)
        const kpi = document.getElementById('dashTvQualityKpi');
        if (kpi) {
            const cats = [
                ['precision_manufacturing', 'process', '공정불량', '#ef4444'],
                ['support_agent', 'customer', '고객불량', '#f59e0b'],
                ['inventory_2', 'outsourcing', '외주불량', '#0891b2']
            ];
            const base = monthRows.length ? monthRows : rows;
            const baseLabel = monthRows.length ? (month + '월') : (year + '년 누계');
            kpi.innerHTML = cats.map(function(c) {
                const s2 = _qualitySum(base, c[1]);
                const rate = s2.input > 0 ? (s2.defect / s2.input * 100).toFixed(2) : '0.00';
                return '<div class="dash-kpi-card" style="--kpi-color:' + c[3] + '">'
                    + '<span class="material-symbols-outlined">' + c[0] + '</span>'
                    + '<div><strong>' + UIUtils.formatNumber(s2.ppm) + '</strong>'
                    + '<small>' + baseLabel + ' ' + c[2] + ' PPM · 불량률 ' + rate + '%</small></div></div>';
            }).join('');
        }

        // 1) 월별 공정불량 PPM 추이
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const ppmSeries = months.map(function(m) {
            return _qualitySum(rows.filter(r => Number(r.month) === m), 'process').ppm;
        });
        const lastMonth = new Date().getMonth() + 1;
        _tvDraw('dashTvQualityPpm', {
            type: 'line',
            data: {
                labels: months.map(m => m + '월'),
                datasets: [{
                    label: '공정불량 PPM',
                    data: ppmSeries.map((v, i) => (i + 1) <= lastMonth ? v : null),
                    borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.12)',
                    borderWidth: 4, tension: .3, fill: true, pointRadius: 5, spanGaps: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { labels: { boxWidth: 18, font: { size: TV_FONT + 2 } } } },
                scales: {
                    y: { beginAtZero: true, ticks: { font: { size: TV_FONT } } },
                    x: { ticks: { font: { size: TV_FONT } } }
                }
            }
        });

        // 3) 라인별 실적 — 불량수(막대) + 불량률%(선), 이중 축
        const byLine = {};
        (monthRows.length ? monthRows : rows).forEach(function(r) {
            const key = String(r.line || r.process || '').trim() || '라인 미등록';
            const b = byLine[key] || (byLine[key] = { input: 0, defect: 0 });
            b.input += Number(r.inputQty) || 0;
            b.defect += (Number(r.defectQty) || 0) + (r.category === 'process' ? (Number(r.reworkQty) || 0) : 0);
        });
        const lineRows = Object.keys(byLine)
            .map(k => ({ name: k, input: byLine[k].input, defect: byLine[k].defect,
                         rate: byLine[k].input > 0 ? (byLine[k].defect / byLine[k].input * 100) : 0 }))
            .sort((a, b) => b.defect - a.defect)
            .slice(0, 6);
        _tvDraw('dashTvQualityLine', {
            data: {
                labels: lineRows.map(r => r.name),
                datasets: [
                    { type: 'bar', label: '불량수', data: lineRows.map(r => r.defect),
                      backgroundColor: 'rgba(248,113,113,.75)', borderRadius: 8, yAxisID: 'y', order: 2 },
                    { type: 'line', label: '불량률(%)', data: lineRows.map(r => Number(r.rate.toFixed(2))),
                      borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 4,
                      pointRadius: 6, tension: .2, yAxisID: 'y1', order: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { labels: { boxWidth: 18, font: { size: TV_FONT + 2 } } } },
                scales: {
                    y: { beginAtZero: true, position: 'left', title: { display: true, text: '불량수', font: { size: TV_FONT } },
                         ticks: { font: { size: TV_FONT } } },
                    y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false },
                          title: { display: true, text: '불량률(%)', font: { size: TV_FONT } },
                          ticks: { font: { size: TV_FONT }, callback: v => v + '%' } },
                    x: { ticks: { font: { size: TV_FONT } } }
                }
            }
        });

        // 2) 불량 유형별 상위 8
        const byType = {};
        (monthRows.length ? monthRows : rows).forEach(function(r) {
            const key = String(r.defectType || '').trim() || '유형 미등록';
            byType[key] = (byType[key] || 0) + (Number(r.defectQty) || 0);
        });
        const top = Object.keys(byType).map(k => [k, byType[k]])
            .filter(t => t[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
        _tvDraw('dashTvDefectType', {
            type: 'bar',
            data: {
                labels: top.map(t => t[0]),
                datasets: [{ label: '불량수', data: top.map(t => t[1]), backgroundColor: '#fbbf24', borderRadius: 8 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { font: { size: TV_FONT } } },
                    y: { ticks: { font: { size: TV_FONT } } }
                }
            }
        });
    }

    function _initTvSlides() {
        const stage = document.getElementById('dashTvStage'); if (!stage) return;
        try { _renderTvCharts(); } catch (e) { console.warn('[Dashboard] TV 차트 실패:', e); }
        try { _renderTvIncomingTable(); _renderTvWarehouseTables(); } catch (e) { console.warn('[Dashboard] TV 표 실패:', e); }
        try { _renderTvJigCharts(); _renderTvJigList(); } catch (e) { console.warn('[Dashboard] TV 지그 실패:', e); }
        try { _renderTvQuality(); } catch (e) { console.warn('[Dashboard] TV 품질 실적 실패:', e); }
        try { _renderTvFifo(); } catch (e) { console.warn('[Dashboard] TV FIFO 실패:', e); }
        _syncFullscreenBtn();
        document.addEventListener('fullscreenchange', _syncFullscreenBtn);
        const all = Array.from(stage.querySelectorAll('.dash-tv-slide'));
        all.forEach(function(sl) { sl.classList.toggle('is-empty', !_tvHasContent(sl)); });
        _tvSlides = all.filter(function(sl) { return !sl.classList.contains('is-empty'); });
        if (!_tvSlides.length) _tvSlides = all.slice(0, 1);

        const dots = document.getElementById('dashTvDots');
        if (dots) {
            dots.innerHTML = _tvSlides.map(function(sl) {
                return '<span class="dash-tv-dot" title="' + (sl.dataset.slide || '') + '"></span>';
            }).join('');
            Array.from(dots.children).forEach(function(d, i) {
                d.addEventListener('click', function() { _tvShow(i); });
            });
        }
        _tvShow(0);

        if (_tvTimer) clearInterval(_tvTimer);
        _tvTimer = setInterval(function() {
            if (!document.body.classList.contains('monitor-mode')) { clearInterval(_tvTimer); _tvTimer = null; return; }
            if (document.body.classList.contains('dash-tv-paused')) return;
            _tvElapsed += 0.2;
            const bar = document.getElementById('dashTvProgress');
            if (bar) bar.style.width = Math.min(100, (_tvElapsed / TV_SLIDE_SEC) * 100) + '%';
            if (_tvElapsed >= TV_SLIDE_SEC) _tvShow(_tvIndex + 1);
        }, 200);

        if (_tvClock) clearInterval(_tvClock);
        const paintClock = function() {
            const el = document.getElementById('dashTvClock');
            if (el) el.textContent = new Date().toTimeString().slice(0, 5);
        };
        paintClock();
        _tvClock = setInterval(paintClock, 10000);

        // 조작: 클릭 = 일시정지 / 방향키·PageUp·PageDown = 페이지 이동
        stage.onclick = function() { document.body.classList.toggle('dash-tv-paused'); };
        _bindTvKeysOnce();
    }

    let _tvKeysBound = false;
    function _bindTvKeysOnce() {
        if (_tvKeysBound) return;
        _tvKeysBound = true;
        document.addEventListener('keydown', function(e) {
            // 현황 모니터 화면이 떠 있을 때만, 입력 중에는 동작하지 않음
            if (!document.getElementById('dashTvStage')) return;
            const tag = (e.target && e.target.tagName) || '';
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                case 'PageDown':
                    e.preventDefault(); _tvShow(_tvIndex + 1); break;
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault(); _tvShow(_tvIndex - 1); break;
                case 'Home':
                    e.preventDefault(); _tvShow(0); break;
                case 'End':
                    e.preventDefault(); _tvShow(_tvSlides.length - 1); break;
                case ' ':
                    e.preventDefault(); document.body.classList.toggle('dash-tv-paused'); break;
                default: break;
            }
        }, true);
    }

    function render(container) {
        if (!document.body.classList.contains('monitor-mode')) {
            renderStandardDashboard(container);
            return;
        }
        container.innerHTML = `
        <div class="dash-monitor-page dash-tv fade-in-up">
            <header class="dash-tv-bar">
                <div class="dash-tv-title"><span class="material-symbols-outlined">monitor_heart</span>생산 현황 모니터</div>
                <div class="dash-tv-slide-name" id="dashTvSlideName">—</div>
                <div class="dash-tv-date"><strong>${UIUtils.today()}</strong><span id="dashTvClock"></span></div>
                <button class="dash-tv-fs" id="dashTvFsBtn" type="button" onclick="DashboardModule.toggleFullscreen()">
                    <span class="material-symbols-outlined">fullscreen</span><span>전체 화면</span>
                </button>
            </header>

            <div class="dash-tv-stage" id="dashTvStage">
                <section class="dash-tv-slide" data-slide="출하 · 생산">
                    <div id="dashExecutiveSummary" class="dash-executive-summary"></div>
                    <div class="dash-monitor-grid dash-pair-grid">
                        <div class="dash-monitor-panel"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">01 / SHIPPING</span><h2>금일 출하 계획</h2></div></div><div id="dashShippingSummary"></div></div>
                        <section class="dash-monitor-section"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">02 / PRODUCTION</span><h2>금일 생산 현황</h2></div></div><div id="dashLineProgress" class="dash-line-progress"></div></section>
                    </div>
                </section>

                <section class="dash-tv-slide" data-slide="품질 실적" data-keep="1">
                    <div id="dashTvQualityKpi" class="dash-executive-summary"></div>
                    <div class="dash-tv-chart-wrap">
                        <div class="dash-monitor-section dash-tv-chart">
                            <div class="dash-section-heading compact"><div><span class="dash-section-kicker">QUALITY 1 / PPM</span><h2>월별 공정불량 PPM</h2></div><span class="dash-section-note" id="dashTvQualityYear"></span></div>
                            <div class="dash-tv-canvas"><canvas id="dashTvQualityPpm"></canvas></div>
                        </div>
                        <div class="dash-monitor-section dash-tv-chart">
                            <div class="dash-section-heading compact"><div><span class="dash-section-kicker">QUALITY 2 / DEFECT</span><h2>이번달 불량 유형별 실적 (상위 8)</h2></div></div>
                            <div class="dash-tv-canvas"><canvas id="dashTvDefectType"></canvas></div>
                        </div>
                        <div class="dash-monitor-section dash-tv-chart">
                            <div class="dash-section-heading compact"><div><span class="dash-section-kicker">QUALITY 3 / LINE</span><h2>이번달 라인별 실적 (불량수 · 불량률)</h2></div></div>
                            <div class="dash-tv-canvas"><canvas id="dashTvQualityLine"></canvas></div>
                        </div>
                    </div>
                </section>

                <section class="dash-tv-slide" data-slide="지그 수명 현황" data-keep="1">
                    <div class="dash-tv-chart-wrap">
                        <div class="dash-monitor-section dash-tv-chart">
                            <div class="dash-section-heading compact"><div><span class="dash-section-kicker">CHART 5 / TODAY JIG</span><h2>금일 생산 품목 지그 수명</h2></div><span class="dash-section-note">도장-A · 도장-B</span></div>
                            <div class="dash-tv-canvas"><canvas id="dashTvJigLife"></canvas></div>
                        </div>
                        <div class="dash-monitor-section dash-tv-chart">
                            <div class="dash-section-heading compact"><div><span class="dash-section-kicker">06 / JIG ACTION</span><h2>교체 임박 지그 (사용률 90%+)</h2></div></div>
                            <div id="dashTvJigAction" class="dash-tv-table-wrap"></div>
                        </div>
                    </div>
                </section>

                <section class="dash-tv-slide" data-slide="금일 수입검사">
                    <div class="dash-monitor-panel"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">03 / INCOMING</span><h2>금일 수입검사 현황</h2></div></div><div id="dashTvIncomingTable" class="dash-tv-table-wrap"></div></div>
                </section>

                <section class="dash-tv-slide" data-slide="금일 창고 입출고">
                    <div class="dash-monitor-grid dash-pair-grid">
                        <div class="dash-monitor-panel"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">04A / INJECTION</span><h2>사출 자재 입출고</h2></div></div><div id="dashTvInjMoves" class="dash-tv-table-wrap"></div></div>
                        <div class="dash-monitor-panel"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">04B / PAINT</span><h2>도료 입고</h2></div></div><div id="dashTvPaintMoves" class="dash-tv-table-wrap"></div></div>
                    </div>
                </section>

                <div class="dash-tv-hidden2">
                    <div id="dashAttentionSummary"></div>
                    <div id="dashMonitorTiles"></div>
                    <div id="dashJigLifeAlerts"></div>
                    <div id="dashIncomingSummary"></div>
                    <div id="dashWarehouseSummary" class="dash-warehouse-grid"></div>
                </div>

                <section class="dash-tv-slide" data-slide="경보 · 미입력">
                    <div id="dashAlertRow" style="display:none;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;"></div>
                </section>

                <section class="dash-tv-slide" data-slide="선입선출 위반">
                    <section class="dash-monitor-section"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">08 / FIFO</span><h2>선입선출 위반 (사출 · 도료)</h2></div><span class="dash-section-note">구 LOT 잔량 · 신 LOT 선소진</span></div><div id="dashTvFifo" class="dash-tv-table-wrap"></div></section>
                </section>

                <section class="dash-tv-slide dash-tv-notify" data-slide="알림 발송 현황">
                    <section class="dash-monitor-section dash-notification-section"><div class="dash-section-heading compact"><div><span class="dash-section-kicker">07 / NOTIFICATIONS</span><h2>알림 발송 현황</h2></div><span class="dash-section-note">대상 · 사유 · 발송시각</span></div><div id="dashNotificationSummary"></div></section>
                </section>

                <section class="dash-tv-slide" data-slide="개선활동 · 우수사원">
                    <div id="dashImprovementTiles"></div>
                </section>

                <div class="dash-tv-hidden">
                    <div id="dashManagerAlerts"></div>
                    <div id="dashQualityStdWarnings"></div>
                    <div id="dashShippingStandby"></div>
                    <div id="dashPaintPending"></div>
                </div>
            </div>

            <footer class="dash-tv-foot">
                <div class="dash-tv-dots" id="dashTvDots"></div>
                <div class="dash-tv-progress"><i id="dashTvProgress"></i></div>
                <span class="dash-tv-hint">← → 페이지 이동 · Space 일시정지</span>
            </footer>
        </div>`;

        renderExecutiveSummary();
        renderLineProgress();
        renderIncomingSummary();
        renderShippingSummary();
        renderWarehouseSummary();
        renderAttentionSummary();
        _scheduleIdleWork(_notifyLaserShipGapOnce);
        renderNotificationSummary();
        renderManagerAlerts();
        renderQualityStdWarnings();
        renderShippingStandby();
        renderPaintPending();
        renderAlertRow().catch(e => console.warn('[Dashboard] 경보 렌더 실패:', e));
        _scheduleIdleWork(renderJigLifeAlerts);  // 지그 사용횟수 집계가 무거워 유휴 시간에
        _scheduleIdleWork(renderMonitorTiles);   // async + config fetch
        renderImprovementTiles();
        _bindCacheWarmRefreshOnce();
        _loadSummary();
        setTimeout(_initTvSlides, 400);   // 비동기 렌더(지그·점검 타일)까지 반영 후 빈 슬라이드 판정
    }

    function _todayWorkSummary(line) {
        const today = UIUtils.today();
        const plans = (Storage.getAll(STORE.PRODUCTION_PLANS) || []).filter(p => p.date === today && (line ? String(p.line || '').replace(/\s/g, '') === line.replace(/\s/g, '') : true));
        const works = Storage.getAll(STORE.PAINTING_WORK) || [];
        const workRows = works.filter(w => w.date === today && (line ? String(w.line || '').replace(/\s/g, '') === line.replace(/\s/g, '') : true));
        const planQty = plans.reduce((s, p) => s + (Number(p.planQty) || 0), 0);
        const actualQty = workRows.reduce((s, w) => s + (Number(w.productionQty) || Number(w.inputQty) || 0), 0);
        const linkedIds = new Set(workRows.filter(w => w.planId).map(w => String(w.planId)));
        return { planQty, actualQty, rate: planQty ? Math.min(100, Math.round(actualQty / planQty * 100)) : 0, planCount: plans.length, workCount: workRows.length, linkedIds };
    }

    function renderExecutiveSummary() {
        const el = document.getElementById('dashExecutiveSummary'); if (!el) return;
        const today = UIUtils.today();
        const plans = (Storage.getAll(STORE.PRODUCTION_PLANS) || []).filter(p => p.date === today);
        const works = (Storage.getAll(STORE.PAINTING_WORK) || []).filter(w => w.date === today);
        const incoming = (Storage.getAll(STORE.INJECTION_INSPECTIONS) || []).filter(r => String(r.date || '').slice(0, 10) === today);
        const shipments = (Storage.getAll(STORE.SALES_DELIVERY_PLAN) || []).filter(r => String(r.date || '').slice(0, 10) === today);
        const cards = [
            ['assignment', plans.reduce((s, p) => s + (Number(p.planQty) || 0), 0), '오늘 생산 계획', '#4f8cff', 'EA'],
            ['play_circle', works.reduce((s, w) => s + (Number(w.productionQty) || Number(w.inputQty) || 0), 0), '도장 실적', '#16b981', 'EA'],
            ['fact_check', incoming.reduce((s, r) => s + (Number(r.incomingQty) || 0), 0), '수입검사 입고', '#f59e0b', 'EA'],
            ['local_shipping', shipments.reduce((s, r) => s + (Number(r.planQty) || 0), 0), '출하 예정', '#a855f7', 'EA']
        ];
        const visibleCards = document.body.classList.contains('monitor-mode') ? cards.filter(c => Number(c[1]) > 0) : cards;
        if (document.body.classList.contains('monitor-mode') && !visibleCards.length) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.innerHTML = visibleCards.map(c => `<div class="dash-kpi-card" style="--kpi-color:${c[3]}"><span class="material-symbols-outlined">${c[0]}</span><div><strong>${UIUtils.formatNumber(c[1])}</strong><small>${c[2]} · ${c[4]}</small></div></div>`).join('');
    }

    function renderLineProgress() {
        const el = document.getElementById('dashLineProgress'); if (!el) return;
        const today = UIUtils.today();
        const plans = Storage.getAll(STORE.PRODUCTION_PLANS) || [];
        const works = Storage.getAll(STORE.PAINTING_WORK) || [];
        const monitorOnly = document.body.classList.contains('monitor-mode');
        const rows = ['도장-A', '도장-B'].map(line => {
            const s = _todayWorkSummary(line);
            const lineKey = line.replace(/\s/g, '');
            const linePlans = plans.filter(p => p.date === today && String(p.line || '').replace(/\s/g, '') === lineKey);
            if (monitorOnly && !linePlans.length && !s.workCount) return '';
            const items = linePlans.slice(0, 4).map(p => {
                const actual = works.filter(w => w.date === today && String(w.planId || '') === String(p.id)).reduce((sum, w) => sum + (Number(w.productionQty) || Number(w.inputQty) || 0), 0);
                const planQty = Number(p.planQty) || 0;
                const rate = planQty ? Math.min(100, Math.round(actual / planQty * 100)) : 0;
                const detail = [p.carModel, p.color].filter(Boolean).join(' · ');
                return `<div class="dash-production-item"><span><b>${_esc(p.partName || '품목 미등록')}</b><small>${_esc(detail || '상세정보 없음')}</small></span><span class="dash-item-qty">${UIUtils.formatNumber(actual)} / ${UIUtils.formatNumber(planQty)} <em>EA</em></span><i><b style="width:${rate}%"></b></i></div>`;
            }).join('');
            const more = linePlans.length > 4 ? `<div class="dash-item-more">외 ${linePlans.length - 4}개 품목 더 있음</div>` : '';
            return `<div class="dash-line-card"><div class="dash-line-title"><span class="dash-line-dot ${line === '도장-A' ? 'a' : 'b'}"></span><strong>${line}</strong><b>${s.rate}%</b></div><div class="dash-progress-track"><i style="width:${s.rate}%"></i></div><div class="dash-line-metrics"><span>계획 <b>${UIUtils.formatNumber(s.planQty)}</b> EA</span><span>진행 <b>${UIUtils.formatNumber(s.actualQty)}</b> EA</span><span>${s.planCount}건 계획 · ${s.workCount}건 작업</span></div><div class="dash-production-items">${items || '<div class="dash-item-empty">금일 생산 품목이 없습니다.</div>'}${more}</div></div>`;
        });
        const unregistered = plans.filter(p => p.date === today && !p.line);
        if (unregistered.length) rows.push(`<div class="dash-unregistered-production"><span class="material-symbols-outlined">warning</span><b>라인 미등록 생산계획 ${unregistered.length}건</b><small>${unregistered.slice(0, 2).map(p => _esc(p.partName || '품목 미등록')).join(' · ')}</small></div>`);
        const visibleRows = rows.filter(Boolean);
        const section = el.closest('.dash-monitor-section');
        if (monitorOnly && !visibleRows.length) { if (section) section.style.display = 'none'; return; }
        if (section) section.style.display = '';
        el.innerHTML = visibleRows.join('');
    }

    /* 수입검사 없이 창고로 직접 입고된 건(프로세스 위반) — 수입검사 현황 화면과 같은 기준 */
    /* 창고 선입선출(FIFO) 위반 — 구 LOT 재고가 남아 있는데 신 LOT를 먼저 소진한 건 */
    function _fifoRows() {
        try {
            if (typeof WarehouseOverviewModule !== 'undefined' && WarehouseOverviewModule.getFifoViolations) {
                const r = WarehouseOverviewModule.getFifoViolations() || {};
                const inj = (r.injection || []).map(x => ({
                    kind: '사출', unit: 'EA',
                    name: x.partName || '-', sub: [x.carModel, x.color].filter(Boolean).join(' · '),
                    qty: x.qty || 0, oldLots: x.oldLots || [], consumedLots: x.consumedLots || []
                }));
                const paint = (r.paint || []).map(x => ({
                    kind: '도료', unit: 'KG',
                    name: x.matName || '-', sub: x.supplier || '',
                    qty: x.qty || 0, oldLots: x.oldLots || [], consumedLots: x.consumedLots || []
                }));
                return inj.concat(paint);
            }
        } catch (e) {
            console.warn('[Dashboard] FIFO 위반 조회 실패:', e);
        }
        return [];
    }

    function _fifoSummaryCell(row) {
        const oldLot = (row.oldLots[0] || {}).lot || '-';
        const newLot = (row.consumedLots[0] || {}).lot || '-';
        return '<span class="fifo-old">' + _esc(oldLot) + '</span> 잔량 <b>→</b> '
             + '<span class="fifo-new">' + _esc(newLot) + '</span> 선소진';
    }

    function renderFifoViolation() {
        const el = document.getElementById('dashFifoViolation'); if (!el) return;
        const rows = _fifoRows();
        const block = el.closest('.dash-block');
        if (!rows.length) {
            el.innerHTML = '';
            if (block) block.style.display = 'none';
            return;
        }
        if (block) block.style.display = '';
        const injCount = rows.filter(r => r.kind === '사출').length;
        const paintCount = rows.length - injCount;
        const preview = rows.slice(0, 5);
        el.innerHTML = `
        <div class="dash-violation-card fifo">
            <div class="dash-violation-head">
                <span class="material-symbols-outlined">swap_vert</span>
                <div>
                    <b>선입선출(FIFO) 위반</b>
                    <small>구 LOT 재고가 남아 있는데 신 LOT를 먼저 소진한 항목입니다.</small>
                </div>
                <span class="dash-violation-count">사출 ${injCount}건 · 도료 ${paintCount}건</span>
                <button onclick="Router.navigate('warehouse-overview')">자재 창고 현황 →</button>
            </div>
            <table class="dash-violation-table">
                <thead><tr><th>구분</th><th>품목</th><th>상세</th><th style="text-align:right;">재고</th><th>요약</th></tr></thead>
                <tbody>
                    ${preview.map(r => `<tr>
                        <td><span class="fifo-kind ${r.kind === '도료' ? 'paint' : 'inj'}">${r.kind}</span></td>
                        <td><b>${_esc(r.name)}</b></td>
                        <td>${_esc(r.sub || '-')}</td>
                        <td class="qty">${UIUtils.formatNumber(r.qty)} ${r.unit}</td>
                        <td class="lot">${_fifoSummaryCell(r)}</td>
                    </tr>`).join('')}
                    ${rows.length > preview.length
                        ? `<tr><td colspan="5" class="more">외 ${rows.length - preview.length}건</td></tr>` : ''}
                </tbody>
            </table>
        </div>`;
    }

    /* 현황 모니터(TV)용 FIFO 위반 표 */
    function _renderTvFifo() {
        const el = document.getElementById('dashTvFifo'); if (!el) return;
        const rows = _fifoRows().slice(0, 8).map(r => [
            '<td class="t-center"><span class="dash-tv-badge ' + (r.kind === '도료' ? 'out' : 'in') + '">' + r.kind + '</span></td>',
            '<td class="t-name"><b>' + _esc(r.name) + '</b></td>',
            '<td>' + _esc(r.sub || '-') + '</td>',
            '<td class="t-num">' + UIUtils.formatNumber(r.qty) + ' <em>' + r.unit + '</em></td>',
            '<td class="t-lot">' + _fifoSummaryCell(r) + '</td>'
        ]);
        el.innerHTML = _tvTable(
            [['구분', 'center'], ['품목'], ['상세'], ['재고', 'right'], ['위반 요약']],
            rows, '선입선출 위반이 없습니다.');
    }

    function renderProcessViolation() {
        const el = document.getElementById('dashProcessViolation'); if (!el) return;
        let rows = [];
        try {
            if (typeof IncomingOverviewModule !== 'undefined' && IncomingOverviewModule.getProcessViolations) {
                rows = IncomingOverviewModule.getProcessViolations() || [];
            }
        } catch (e) {
            console.warn('[Dashboard] 프로세스 위반 조회 실패:', e);
        }
        const block = el.closest('.dash-block');
        if (!rows.length) {
            el.innerHTML = '';
            if (block) block.style.display = 'none';
            return;
        }
        if (block) block.style.display = '';
        const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const preview = rows.slice(0, 5);
        el.innerHTML = `
        <div class="dash-violation-card">
            <div class="dash-violation-head">
                <span class="material-symbols-outlined">gavel</span>
                <div>
                    <b>프로세스 위반 — 수입검사 없는 직접 입고</b>
                    <small>수입검사 없이 창고로 입고된 건입니다. 즉시 수입검사 등록이 필요합니다.</small>
                </div>
                <span class="dash-violation-count">${rows.length}건 · ${UIUtils.formatNumber(totalQty)} EA</span>
                <button onclick="Router.navigate('incoming-overview')">수입검사 현황 →</button>
            </div>
            <table class="dash-violation-table">
                <thead><tr><th>입고일</th><th>차종</th><th>품명</th><th>LOT</th><th style="text-align:right;">수량</th></tr></thead>
                <tbody>
                    ${preview.map(r => `<tr>
                        <td>${_esc(String(r.date || '-').split(' ')[0])}</td>
                        <td>${_esc(r.carModel || '-')}</td>
                        <td><b>${_esc(r.partName || '-')}</b></td>
                        <td class="lot">${_esc(r.lotNo || '-')}</td>
                        <td class="qty">${UIUtils.formatNumber(r.quantity || 0)}</td>
                    </tr>`).join('')}
                    ${rows.length > preview.length
                        ? `<tr><td colspan="5" class="more">외 ${rows.length - preview.length}건</td></tr>` : ''}
                </tbody>
            </table>
        </div>`;
    }

    function renderIncomingSummary() {
        const el = document.getElementById('dashIncomingSummary'); if (!el) return;
        const today = UIUtils.today();
        const injectionRows = (Storage.getAll(STORE.INJECTION_INSPECTIONS) || []).filter(r => String(r.date || '').slice(0, 10) === today).map(r => ({ ...r, inspectionType: '사출' }));
        const paintRows = (Storage.getAll(STORE.PAINT_INCOMING_INSPECTIONS) || []).filter(r => String(r.date || '').slice(0, 10) === today).map(r => ({ ...r, partName: r.partName || r.paintName, inspectionType: '도료' }));
        const rows = injectionRows.concat(paintRows).sort((a, b) => String(b.id || '').localeCompare(String(a.id || ''))).slice(0, 8);
        const panel = el.closest('.dash-monitor-panel');
        if (document.body.classList.contains('monitor-mode') && !rows.length) { if (panel) panel.style.display = 'none'; return; }
        if (panel) panel.style.display = '';
        el.innerHTML = rows.length ? `<div class="dash-list">${rows.map(r => `<div class="dash-list-row"><span><b>${_esc(r.partName || '품명 미등록')}</b><small>${_esc(r.inspectionType || '검사')} · ${_esc(r.lotNo || 'LOT 미등록')}</small></span><strong>${UIUtils.formatNumber(r.incomingQty || 0)} <em>EA</em></strong></div>`).join('')}</div><button class="dash-link-btn" onclick="Router.navigate('incoming-overview')">수입검사 전체 보기 →</button>` : `<div class="dash-empty"><span class="material-symbols-outlined">inbox</span><b>금일 입고 내역 없음</b><small>수입검사 등록 시 여기에 표시됩니다.</small></div>`;
    }

    function renderShippingSummary() {
        const el = document.getElementById('dashShippingSummary'); if (!el) return;
        const today = UIUtils.today();
        const rows = (Storage.getAll(STORE.SALES_DELIVERY_PLAN) || []).filter(r => String(r.date || '').slice(0, 10) === today).slice(0, 5);
        const panel = el.closest('.dash-monitor-panel');
        if (document.body.classList.contains('monitor-mode') && !rows.length) { if (panel) panel.style.display = 'none'; return; }
        if (panel) panel.style.display = '';
        el.innerHTML = rows.length ? `<div class="dash-list">${rows.map(r => `<div class="dash-list-row"><span><b>${_esc(r.partName || '품명 미등록')}</b><small>${_esc(r.customer || r.company || '영업 출하계획')}</small></span><strong>${UIUtils.formatNumber(r.planQty || 0)} <em>EA</em></strong></div>`).join('')}</div><button class="dash-link-btn" onclick="Router.navigate('sales-delivery-plan')">영업 일정 전체 보기 →</button>` : `<div class="dash-empty"><span class="material-symbols-outlined">event_available</span><b>금일 출하 일정 없음</b><small>영업 출하계획이 등록되면 표시됩니다.</small></div>`;
    }

    function renderWarehouseSummary() {
        const el = document.getElementById('dashWarehouseSummary'); if (!el) return;
        const today = UIUtils.today();
        const configs = [
            { store: STORE.INJECTION_INVENTORY, name:'사출 자재', unit:'EA', color:'#8b5cf6', icon:'warehouse', page:'warehouse-overview' },
            { store: STORE.PAINT_INVENTORY, name:'도료 자재', unit:'KG', color:'#0891b2', icon:'format_paint', page:'paint-inventory' }
        ];
        const cards = configs.map(cfg => {
            const records = cfg.store ? (Storage.getAll(cfg.store) || []) : [];
            const todayRows = records.filter(r => String(r.date || '').slice(0, 10) === today);
            const inbound = todayRows.filter(r => r.type === '입고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
            const outbound = todayRows.filter(r => r.type === '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
            const stock = typeof InvCalc !== 'undefined' && InvCalc.totalStock ? InvCalc.totalStock(records) : records.reduce((s, r) => s + (r.type === '출고' ? -1 : 1) * (Number(r.quantity) || 0), 0);
            const moves = todayRows.filter(r => r.type === '입고' || r.type === '출고').slice(-3).reverse();
            if (!records.length) return '';
            return `<div class="dash-warehouse-card" style="--warehouse-color:${cfg.color}"><div class="dash-warehouse-title"><span class="material-symbols-outlined">${cfg.icon}</span><b>${cfg.name}</b><button onclick="Router.navigate('${cfg.page}')">상세 →</button></div><div class="dash-warehouse-metrics"><span><b>${UIUtils.formatNumber(stock)}</b><small>현재고 ${cfg.unit}</small></span><span><b>${UIUtils.formatNumber(inbound)}</b><small>금일 입고</small></span><span><b>${UIUtils.formatNumber(outbound)}</b><small>금일 출고</small></span></div><div class="dash-warehouse-moves">${moves.length ? moves.map(r => `<span class="${r.type === '출고' ? 'out' : 'in'}"><i>${r.type === '출고' ? '출' : '입'}</i>${_esc(r.partName || r.materialName || r.paintName || '품목 미등록')} <b>${UIUtils.formatNumber(r.quantity || 0)} ${cfg.unit}</b></span>`).join('') : '<small>금일 입출고 기록 없음</small>'}</div></div>`;
        }).filter(Boolean);
        const section = el.closest('.dash-warehouse-section');
        if (document.body.classList.contains('monitor-mode') && !cards.length) { if (section) section.style.display = 'none'; return; }
        if (section) section.style.display = '';
        el.innerHTML = cards.join('');
    }

    /* 레이져 외관검사 → 출하검사 대기 누락 건수 (매일 자동 점검)
       버튼을 누르지 않아도 대시보드/현황 모니터 진입 시 집계되고,
       누락이 있으면 하루 1회 알림을 띄운다. */
    let _laserGapCache = { key: '', count: 0 };

    function _laserShipGapCount() {
        if (typeof ShippingStandbyModule === 'undefined'
            || !ShippingStandbyModule.getLaserAuditSummary) return 0;
        const sbLen = (Storage.getAll(STORE.SHIPPING_STANDBY) || []).length;
        const inspLen = DB.STORES.LASER_INSPECTIONS
            ? (Storage.getAll(DB.STORES.LASER_INSPECTIONS) || []).length : 0;
        const key = UIUtils.today() + '|' + sbLen + '|' + inspLen;
        if (_laserGapCache.key === key) return _laserGapCache.count;
        let count = 0;
        try {
            const st = ShippingStandbyModule.getLaserAuditSummary() || {};
            count = (Number(st.missing) || 0) + (Number(st.dup) || 0) + (Number(st.link) || 0);
        } catch (e) {
            console.warn('[Dashboard] 레이져 대조 점검 실패:', e);
        }
        _laserGapCache = { key: key, count: count };
        return count;
    }

    // 하루 1회 알림 (당일 첫 진입 시에만)
    function _notifyLaserShipGapOnce() {
        const count = _laserShipGapCount();
        if (!count) return;
        const key = 'mes_laser_ship_gap_notified';
        try {
            if (localStorage.getItem(key) === UIUtils.today()) return;
            localStorage.setItem(key, UIUtils.today());
        } catch (e) {}
        UIUtils.toast('레이져 외관검사 ↔ 출하검사 불일치 ' + count + '건이 있습니다. 출하검사(외관) > 레이져 대조에서 확인하세요.', 'warning');
    }

    function renderAttentionSummary() {
        const el = document.getElementById('dashAttentionSummary'); if (!el) return;
        const today = UIUtils.today();
        const plans = (Storage.getAll(STORE.PRODUCTION_PLANS) || []).filter(p => p.date === today);
        const works = (Storage.getAll(STORE.PAINTING_WORK) || []).filter(w => w.date === today);
        const unregisteredPlan = plans.filter(p => !p.line || !p.planQty).length;
        const unlinkedWork = works.filter(w => !w.planId).length;
        const jigAlerts = (typeof JigModule !== 'undefined' && JigModule.getLifeActionJigs) ? JigModule.getLifeActionJigs().length : 0;
        const fpStore = DB.STORES.EQUIP_FPROOF_LOG;
        const fpDone = fpStore ? new Set((Storage.getAll(fpStore) || []).filter(r => r.date === today).map(r => r.itemKey)).size : 0;
        const fpMissing = Math.max(0, FPROOF_ITEMS.length - fpDone);
        const laserGap = _laserShipGapCount();
        const items = [['rule', laserGap, '레이져→출하검사 누락', 'shipping-standby'],
            ['warning_amber', jigAlerts, '지그 교체 알림', 'painting-jig'], ['fact_check', fpMissing, '설비 일일점검 미완료', 'prod-equipment'], ['link_off', unlinkedWork, '계획 미연동 작업', 'painting-process'], ['edit_note', unregisteredPlan, '생산계획 미등록', 'production-plan']];
        const visibleItems = document.body.classList.contains('monitor-mode') ? items.filter(i => i[1] > 0) : items;
        const section = el.closest('.dash-attention-section');
        if (document.body.classList.contains('monitor-mode') && !visibleItems.length) { if (section) section.style.display = 'none'; return; }
        if (section) section.style.display = '';
        el.innerHTML = visibleItems.map(i => `<button class="dash-alert-card ${i[1] ? 'has-alert' : 'is-clear'}" onclick="Router.navigate('${i[3]}')"><span class="material-symbols-outlined">${i[0]}</span><span><b>${i[1] ? i[1] + '건' : '정상'}</b><small>${i[2]}</small></span><span class="material-symbols-outlined arrow">chevron_right</span></button>`).join('');
    }

    function renderNotificationSummary() {
        const el = document.getElementById('dashNotificationSummary');
        if (!el || typeof AuthModule === 'undefined' || typeof AuthModule.getAllMessages !== 'function') return;
        const messages = AuthModule.getAllMessages()
            .filter(m => m && m.sentAt)
            .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
        const section = el.closest('.dash-notification-section');
        if (document.body.classList.contains('monitor-mode') && !messages.length) { if (section) section.style.display = 'none'; return; }
        if (section) section.style.display = '';
        const isTv = !!document.querySelector('.dash-tv-notify');
        const rows = messages.map(m => {
            const recipients = Array.isArray(m.recipients) && m.recipients.length
                ? m.recipients.map(r => r.type === 'all' ? '전체 사용자' : (r.label || r.id || '')).filter(Boolean).join(', ')
                : '수신자 미상';
            const when = new Date(m.sentAt);
            const time = Number.isNaN(when.getTime()) ? String(m.sentAt).slice(0, 16) : when.toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
            // 현황 모니터(TV)에서는 수신자 대신 알림 내용을 크게 보여준다.
            if (isTv) {
                return `<div class="dash-notification-row tv"><span class="dash-notification-status ${m.priority === 'high' ? 'high' : ''}"><span class="material-symbols-outlined">${m.priority === 'high' ? 'priority_high' : 'notifications'}</span></span><span class="dash-notification-main"><b>${_esc(m.title || '알림')}</b><small>${_esc(m.body || '')}</small></span><time>${_esc(time)}</time></div>`;
            }
            return `<div class="dash-notification-row"><span class="dash-notification-status ${m.priority === 'high' ? 'high' : ''}"><span class="material-symbols-outlined">${m.priority === 'high' ? 'priority_high' : 'notifications'}</span></span><span class="dash-notification-main"><b>${_esc(m.title || '알림')}</b><small>${_esc(m.body || '')}</small></span><span class="dash-notification-to"><b>수신: ${_esc(recipients)}</b><small>발송: ${_esc(m.senderName || '시스템')} · ${_esc(m.category || '일반')}</small></span><time>${_esc(time)}</time></div>`;
        }).join('');
        el.innerHTML = `<div class="dash-notification-list${isTv ? ' is-tv' : ''}">${rows}</div>`;
    }

    function _scheduleIdleWork(fn, timeoutMs) {
        const t = Number(timeoutMs) || 1200;
        try {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => {
                    try { fn(); } catch (e) { console.warn('[Dashboard idle work]', e); }
                }, { timeout: t });
                return;
            }
        } catch (_) {}
        setTimeout(() => {
            try { fn(); } catch (e) { console.warn('[Dashboard deferred work]', e); }
        }, 0);
    }

    /* ══════════════════════════════════════════════════════════
       도료 입고 대기 (물류담당자/관리자 전용)
    ══════════════════════════════════════════════════════════ */
    function renderPaintPending() {
        const el = document.getElementById('dashPaintPending');
        if (!el) return;

        // 담당자 권한 확인: paint-inventory 페이지 쓰기 권한 또는 admin/prod_manager/logistics_worker
        function _canSeePaint() {
            if (typeof AuthModule === 'undefined') return true;
            const user = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
            if (!user) return false;
            const roles = (user.roles || [user.role]).map(String).filter(Boolean);
            if (roles.some(r => ['admin', 'prod_manager', 'logistics_worker'].includes(r))) return true;
            if (typeof AuthModule.canWritePage === 'function' && AuthModule.canWritePage('paint-inventory')) return true;
            return false;
        }

        if (!_canSeePaint()) { el.style.display = 'none'; return; }

        const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        const materials   = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];

        function _isBulkRecord(r) {
            return r && (r.inventoryMode === 'current_stock_edit' ||
                r.source === '도료 창고 현재 재고 설정' ||
                r.source === '도료 창고 일괄 등록 및 설정');
        }

        const processedIds = new Set(
            inventory.filter(i => i.sourceInspectionId && !_isBulkRecord(i)).map(i => i.sourceInspectionId)
        );
        const legacySet = new Set(
            inventory.filter(i => i.type !== '출고' && !i.sourceInspectionId && !_isBulkRecord(i))
                .map(i => `${i.materialId}||${i.lotNo}`)
        );
        const bulkMatIds = new Set(
            inventory.filter(i => _isBulkRecord(i)).map(i => i.materialId)
        );
        function getMid(name) {
            const m = materials.find(function(m) { return m.name === name; });
            return m ? m.id : null;
        }

        const pending = inspections
            .filter(function(i) {
                if (i.verdict !== '합격' || (Number(i.incomingQty) || 0) <= 0) return false;
                if (i.warehouseStatus === '입고취소') return false;
                if (processedIds.has(i.id)) return false;
                const mid = getMid(i.paintName);
                if (mid && legacySet.has(`${mid}||${i.lotNo}`)) return false;
                if (mid && bulkMatIds.has(mid)) return false;
                return true;
            })
            .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

        if (!pending.length) { el.innerHTML = ''; return; }

        el.innerHTML = `
        <div style="border:1px solid var(--border-color);border-top:3px solid #0891b2;border-radius:8px;overflow:hidden;background:var(--bg-primary);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#0891b20d;">
                <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:#0891b2;letter-spacing:.04em;text-transform:uppercase;">
                    <span class="material-symbols-outlined" style="font-size:14px;">inventory</span>
                    도료 입고 대기
                    <span style="background:#0891b2;color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;">${pending.length}건</span>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="DashboardModule.openNotifyModal('paint_pending',${pending.length})"
                        style="border:1px solid #0891b2;background:none;cursor:pointer;font-size:.72rem;color:#0891b2;font-weight:600;padding:2px 8px;border-radius:5px;display:flex;align-items:center;gap:3px;">
                        <span class="material-symbols-outlined" style="font-size:13px;">notifications</span>알림 발송
                    </button>
                    <button onclick="Router.navigate('paint-inventory')" style="border:none;background:none;cursor:pointer;font-size:.72rem;color:#0891b2;font-weight:600;padding:2px 6px;">도료창고 →</button>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">검사일</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">도료명</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">LOT No.</th>
                        <th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">색상</th>
                        <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-muted);font-size:.7rem;">수량</th>
                        <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-muted);font-size:.7rem;">공급사</th>
                    </tr>
                </thead>
                <tbody>
                    ${pending.slice(0, 15).map(function(r) {
                        return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                            <td style="padding:5px 10px;white-space:nowrap;color:var(--text-muted);">${r.date || '-'}</td>
                            <td style="padding:5px 8px;font-weight:600;">${r.paintName || '-'}</td>
                            <td style="padding:5px 8px;font-size:.72rem;color:var(--text-muted);">${r.lotNo || '-'}</td>
                            <td style="padding:5px 8px;font-size:.72rem;">${r.color || ''}</td>
                            <td style="padding:5px 10px;text-align:right;font-weight:700;color:#0891b2;">${UIUtils.formatNumber(r.incomingQty || 0)}</td>
                            <td style="padding:5px 10px;font-size:.72rem;color:var(--text-muted);">${r.supplier || ''}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            ${pending.length > 15 ? `<div style="padding:5px 12px;font-size:.72rem;color:var(--text-muted);border-top:1px solid var(--border-color);">외 ${pending.length - 15}건 더 있음</div>` : ''}
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       도장 지그 교체 임박 (수명 90% 이상) — 대상이 있을 때만 표시
    ══════════════════════════════════════════════════════════ */
    function renderJigLifeAlerts() {
        const el = document.getElementById('dashJigLifeAlerts');
        if (!el) return;
        let list = [];
        try {
            if (typeof JigModule !== 'undefined' && typeof JigModule.getLifeActionJigs === 'function') {
                list = JigModule.getLifeActionJigs();
            }
        } catch (e) {
            console.warn('[Dashboard] 지그 수명 조회 실패:', e);
        }
        const jigSection = el.closest('.dash-jig-section');
        if (!list.length) { el.innerHTML = ''; if (jigSection && document.body.classList.contains('monitor-mode')) jigSection.style.display = 'none'; return; }
        if (jigSection) jigSection.style.display = '';
        const color = '#b91c1c';
        const notOrdered = list.filter(r => !r.orderDate).length;
        el.innerHTML = `
        <div style="border:1px solid var(--border-color);border-top:3px solid ${color};border-radius:8px;overflow:hidden;background:var(--bg-primary);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${color}0d;">
                <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:${color};letter-spacing:.04em;">
                    <span class="material-symbols-outlined" style="font-size:14px;">warning</span>
                    도장 지그 교체 임박 (수명 90% 이상)
                    <span style="background:${color};color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;">${list.length}건</span>
                    ${notOrdered ? `<span style="font-weight:600;">· 미발주 ${notOrdered}건</span>` : ''}
                </div>
                <button onclick="Router.navigate('jig-management')" style="border:none;background:none;cursor:pointer;font-size:.72rem;color:${color};font-weight:600;padding:2px 6px;">지그 수명관리 →</button>
            </div>
            <div style="max-height:200px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                <tbody>
                    ${list.map(r => {
                        const pct = Math.round(r.pct);
                        const pctColor = pct >= 100 ? '#dc2626' : '#ea580c';
                        return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                            <td style="padding:4px 10px;white-space:nowrap;font-weight:700;color:var(--accent-blue);">${_esc(r.carModel || '-')}</td>
                            <td style="padding:4px 8px;white-space:nowrap;font-weight:600;">${_esc(r.partName || '-')}</td>
                            <td style="padding:4px 8px;white-space:nowrap;font-size:0.72rem;color:#0891b2;font-weight:600;">${_esc(r.line)}</td>
                            <td style="padding:4px 8px;white-space:nowrap;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(r.usedCount)} / ${UIUtils.formatNumber(r.manage)}회</td>
                            <td style="padding:4px 8px;white-space:nowrap;text-align:right;font-weight:800;color:${pctColor};">${pct}%</td>
                            <td style="padding:4px 10px;white-space:nowrap;width:100%;">${r.orderDate
                                ? `<span style="padding:1px 6px;background:var(--accent-blue);color:#fff;border-radius:4px;font-size:0.68rem;font-weight:600;">발주 ${_esc(r.orderDate)}</span>`
                                : `<span style="padding:1px 6px;border:1px solid ${color};color:${color};border-radius:4px;font-size:0.68rem;font-weight:700;">미발주</span>`}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       경보 그룹 (생산실적 경보 / 자재관리 경보)
    ══════════════════════════════════════════════════════════ */
    async function renderAlertRow() {
        const el = document.getElementById('dashAlertRow');
        if (!el) return;
        const today = UIUtils.today();

        /* ① 사출 입고 대기 */
        // 검사 후 며칠째 창고 입고가 안 된 건지 — 대기가 길수록 그 사이 출고가 "입고 없이 나간
        // 출고"가 되어 미차감(과다출고)으로 잡힌다. 오래된 건을 눈에 띄게 하려고 경과일을 붙인다.
        function _waitDaysSince(dateLike) {
            const day = String(dateLike || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
            const from = new Date(day + 'T00:00:00');
            const to = new Date(String(today).slice(0, 10) + 'T00:00:00');
            if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
            return Math.max(0, Math.round((to - from) / 86400000));
        }
        // 대기 목록은 사출 창고 모듈의 판정을 그대로 쓴다 — 여기서 따로 계산하면
        // 숨김 처리·컷오버·검사건(inspId) 매칭이 빠져 창고 화면과 건수가 어긋난다
        // (창고에서는 사라진 항목이 대시보드에는 계속 남아 있는 문제).
        let injPending = [];
        if (typeof InjectionWarehouseModule !== 'undefined'
            && typeof InjectionWarehouseModule.getPendingInboundRows === 'function') {
            try {
                injPending = (await InjectionWarehouseModule.getPendingInboundRows()).map(r => ({
                    date: r.date, carModel: r.carModel, partName: r.partName, color: r.color,
                    lotNo: r.lotNo, qty: r.qty,
                    waitDays: r.waitDays != null ? r.waitDays : _waitDaysSince(r.date)
                }));
            } catch (e) {
                console.warn('[Dashboard] 입고 대기 조회 실패:', e);
            }
        }

        /* ② 실적 미입력 (하루 이상 지난 계획 — 수량 있는 작업실적 없음)
           - status '완료'는 종료시각 자동갱신일 수 있음
           - planId 연동 + 수량>0 인 실적만 "입력됨"으로 본다
           - 당일 미입력은 아직 입력 가능 구간이므로 경보에서 제외 */
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];
        const works = Storage.getAll(DB.STORES.PAINTING_WORK)    || [];
        function _dashPlanDay(p) { return String(p.date || '').trim().slice(0, 10); }
        function _dashWorkFulfills(w, planId) {
            if (!w || planId == null || planId === '') return false;
            if (String(w.planId) !== String(planId)) return false;
            const input = Number(w.inputQty) || 0;
            const prod = Number(w.productionQty) || 0;
            const lotSum = Array.isArray(w.lots)
                ? w.lots.reduce(function (s, l) { return s + (Number(l && l.qty) || 0); }, 0) : 0;
            return (input + prod + lotSum) > 0;
        }
        // 생산계획 수정 시 구 문서가 남는 구조 — 일자+라인+시작시각 최신 1건만 남겨야
        // 수정 전 계획이 '실적 미입력'으로 계속 잡히지 않는다 (도장 작업현황과 동일 규칙)
        const _dashLivePlans = (function () {
            const byKey = {};
            const noKey = [];
            plans.forEach(function (p) {
                if (!p) return;
                const slot = String(p.startTime || p.slot || '').trim();
                if (!slot) { noKey.push(p); return; }
                const key = _dashPlanDay(p) + '||' + String(p.line || '').replace(/\s/g, '') + '||' + slot;
                const prev = byKey[key];
                if (!prev) { byKey[key] = p; return; }
                const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                    || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
                if (newer) byKey[key] = p;
            });
            return Object.values(byKey).concat(noKey);
        })();

        const unenteredPlans = _dashLivePlans
            .filter(function (p) {
                const day = _dashPlanDay(p);
                if (!day || day >= today) return false;
                if (!(p.carModel || p.partName)) return false;
                if (!(Number(p.planQty) > 0)) return false;
                if (!p.id) return false;
                return !works.some(function (w) { return _dashWorkFulfills(w, p.id); });
            })
            .sort(function (a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });

        /* ③ 도료 사용 미등록 (전일 이전 작업일지 중 도료 배합 기록 없음)
           - 도료사용등록 대상에서 '제외'한 작업은 알림에서도 빼 둔다 */
        const mixes = (Storage.getAll(DB.STORES.PROD_CONDITIONS) || []).filter(d => d._docKind === 'paint_mix');
        const mixedWorkIds = new Set(mixes.map(m => m.workId).filter(Boolean));
        // A/S 품목은 도료 유통기한·재고 관리 대상이 아니라 도료사용등록을 생략한다.
        const _prodList = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _isAsPaintWork = w => {
            const direct = String(w.itemType || '').trim();
            const p = direct ? null : (_prodList.find(x => x.carModel === w.carModel && x.partName === w.partName && (!w.color || !x.color || x.color === w.color))
                || _prodList.find(x => x.carModel === w.carModel && x.partName === w.partName));
            const t = direct || String((p && p.itemType) || '').trim();
            return !!t && (t.indexOf('A/S') >= 0 || t.charAt(0) === 'A');
        };
        let paintMissing = works
            .filter(w => w.date && w.date < today && !mixedWorkIds.has(w.id) && !_isAsPaintWork(w))
            .sort((a, b) => (b.date||'').localeCompare(a.date||''));

        /* ④ 사출 LOT 번호 형식 오류 (설정 화면 스캔 로직과 동일 소스) */
        let lotErrors = [];
        try {
            if (typeof SettingsModule !== 'undefined' && SettingsModule.scanInjLotErrorsData) {
                lotErrors = SettingsModule.scanInjLotErrorsData();
            }
        } catch (e) { console.warn('[Dashboard] LOT 오류 스캔 실패:', e); }

        function _alertGroupCard(icon, iconColor, title, items, emptyMsg) {
            const activeItems = items.filter(item => item.count > 0);
            const total = activeItems.reduce((sum, item) => sum + item.count, 0);
            if (!total) return `<div style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;background:var(--bg-secondary);display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:0.82rem;">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-green);">check_circle</span>${emptyMsg}</div>`;

            const sections = activeItems.map(item => `<section>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:var(--bg-secondary);border-top:1px solid var(--border-color);">
                    <span style="font-size:.7rem;font-weight:700;color:${item.color || iconColor};">${item.label} <b style="background:${item.color || iconColor};color:#fff;border-radius:10px;padding:1px 6px;font-size:.65rem;">${item.count}건</b></span>
                    <button onclick="${item.onClickJs || `Router.navigate('${item.nav}')`}" style="border:none;background:none;cursor:pointer;font-size:.68rem;color:${item.color || iconColor};font-weight:600;padding:2px 4px;">바로가기 →</button>
                </div>
                <div style="max-height:160px;overflow-y:auto;">${item.rows}</div>
            </section>`).join('');

            return `<div style="border:1px solid var(--border-color);border-top:3px solid ${iconColor};border-radius:8px;overflow:hidden;background:var(--bg-primary);">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${iconColor}0d;">
                    <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:${iconColor};letter-spacing:.04em;">
                        <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>${title}
                        <span style="background:${iconColor};color:#fff;border-radius:10px;padding:1px 7px;font-size:.68rem;">${total}건</span>
                    </div>
                </div>
                ${sections}
            </div>`;
        }

        function _paintRowsHtml(list) {
            if (!list.length) return '';
            return `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                list.slice(0, 20).map(w => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${(w.date||'-').split(' ')[0]}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#0891b2;font-weight:600;">${w.line||''}</td>
                    <td style="padding:4px 8px;font-weight:600;">${w.carModel||''}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${w.partName||''}</td>
                </tr>`).join('') + `</table>`;
        }

        function _paintHtml(list) {
            const injOverdue = injPending.filter(r => (r.waitDays || 0) >= 3);
            const injRows = injPending.length ? (injOverdue.length ? `
                <div style="padding:6px 10px;margin-bottom:4px;border-radius:6px;background:rgba(220,38,38,.08);
                            color:#dc2626;font-size:0.74rem;font-weight:700;">
                    3일 이상 대기 ${injOverdue.length}건 · 최장 ${Math.max(...injOverdue.map(r => r.waitDays || 0))}일
                    <span style="font-weight:400;color:var(--text-muted);">— 늦게 입고하면 그 사이 출고가 미차감으로 잡힙니다</span>
                </div>` : '') + `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                injPending.slice(0, 20).map(r => {
                    const wd = r.waitDays;
                    const wdColor = wd >= 7 ? '#dc2626' : (wd >= 3 ? '#b45309' : 'var(--text-muted)');
                    return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${r.date||'-'}</td>
                    <td style="padding:4px 6px;white-space:nowrap;font-size:0.72rem;font-weight:${wd >= 3 ? '700' : '400'};color:${wdColor};">${wd != null ? wd + '일' : ''}</td>
                    <td style="padding:4px 8px;font-weight:600;">${r.partName||'-'}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${r.carModel||''} ${r.color||''}</td>
                    <td style="padding:4px 10px;text-align:right;font-weight:700;color:#8b5cf6;">${UIUtils.formatNumber(r.qty||0)}</td>
                </tr>`; }).join('') + `</table>` : '';

            const unenteredRows = unenteredPlans.length ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                unenteredPlans.slice(0, 20).map(p => `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${p.date||'-'}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#0891b2;font-weight:600;">${p.line||''}</td>
                    <td style="padding:4px 8px;font-weight:600;">${p.carModel||''}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-muted);">${p.partName||''}</td>
                    <td style="padding:4px 10px;text-align:right;font-weight:700;color:#f59e0b;">${UIUtils.formatNumber(p.planQty||0)}</td>
                </tr>`).join('') + `</table>` : '';

            const lotErrorRows = lotErrors.length ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">` +
                lotErrors.slice(0, 20).map(e => `<tr onclick="App.goToLotErrorSource('${_esc(e.src||'')}','${_esc(e.id||'')}')"
                        title="문제 발생지로 이동" style="cursor:pointer;"
                        onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:4px 10px;white-space:nowrap;color:var(--text-muted);">${_esc((e.date||'-').split(' ')[0])}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;color:#dc2626;font-weight:600;">${_esc(e.src||'')}</td>
                    <td style="padding:4px 8px;font-weight:600;">${_esc(e.partName||'')}</td>
                    <td style="padding:4px 8px;font-size:0.72rem;font-family:monospace;color:var(--text-muted);">${_esc(e.original||'')}</td>
                </tr>`).join('') + `</table>` : '';

            const productionAlertCount = unenteredPlans.length + list.length;
            const materialAlertCount = injPending.length + lotErrors.length;
            const total = (productionAlertCount > 0 ? 1 : 0) + (materialAlertCount > 0 ? 1 : 0);
            if (!total) { el.style.display = 'none'; el.innerHTML = ''; return; }
            el.style.display = 'grid';
            el.innerHTML =
                _alertGroupCard('precision_manufacturing', '#ef4444', '생산실적 경보', [
                    { label:'실적 미입력', count:unenteredPlans.length, rows:unenteredRows, nav:'painting-work-a', color:'#f59e0b' },
                    { label:'도료 사용 미등록', count:list.length, rows:_paintRowsHtml(list), nav:'paint-mix', color:'#ef4444' }
                ], '생산실적 경보 없음') +
                _alertGroupCard('inventory_2', '#8b5cf6', '자재관리 경보', [
                    { label:'사출 입고 대기', count:injPending.length, rows:injRows, nav:'warehouse-overview', color:'#8b5cf6' },
                    { label:'사출 LOT 형식 오류', count:lotErrors.length, rows:lotErrorRows, onClickJs:lotErrors.length === 1
                        ? `App.goToLotErrorSource('${_esc(lotErrors[0].src||'')}','${_esc(lotErrors[0].id||'')}')`
                        : 'App.goToLotRepairTab()', color:'#dc2626' }
                ], '자재관리 경보 없음');
        }

        _paintHtml(paintMissing);

        Storage.getConfigValue('paint_mix_hidden_works_v1').then(function(list) {
            const hidden = new Set((Array.isArray(list) ? list : []).map(String));
            if (!hidden.size) return;
            const filtered = paintMissing.filter(w => !hidden.has(String(w.id)));
            if (filtered.length === paintMissing.length) return;
            _paintHtml(filtered);
        }).catch(function() {});
    }

    /* ══════════════════════════════════════════════════════════
       출하검사 대기 섹션
    ══════════════════════════════════════════════════════════ */
    function renderShippingStandby() {
        const el = document.getElementById('dashShippingStandby');
        if (!el) return;
        const waiting = (Storage.getAll(STORE.SHIPPING_STANDBY) || [])
            .filter(d => d.status === '대기');
        if (!waiting.length) { el.innerHTML = ''; return; }

        const today = UIUtils.today();
        const laser = waiting.filter(d => d.source === 'laser_inspection').length;
        const paint = waiting.length - laser;
        const overdue = waiting.filter(d => d.date && String(d.date).slice(0, 10) < today).length;
        const color = overdue ? '#ef4444' : '#f59e0b';
        const parts = [];
        if (paint) parts.push('도장 ' + paint);
        if (laser) parts.push('레이져 ' + laser);
        if (overdue) parts.push('전일 이전 ' + overdue);

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,240px));gap:8px;">
                ${_tile({
                    icon: 'pending_actions',
                    title: '출하검사 대기',
                    value: waiting.length + '건',
                    valueColor: color,
                    sub: parts.length ? parts.join(' · ') : '검사 등록 대기',
                    size: 'sm',
                    badge: '대기',
                    onClick: "Router.navigate('shipping-standby')"
                })}
            </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       관리자 보고 누락 섹션
    ══════════════════════════════════════════════════════════ */
    function renderManagerAlerts() {
        const el = document.getElementById('dashManagerAlerts');
        if (!el) return;

        const WORK_STORE = DB.STORES.PAINTING_WORK;
        const works = Storage.getAll(WORK_STORE) || [];

        // 관리자 미통보 항목 수집
        const items = [];
        works.forEach(function(d) {
            const types = [];
            if (d.timeReason && !d.timeManagerNotified)
                types.push({ label: '시간 변동', detail: d.timeReason + (d.timeReasonDetail ? ' — ' + d.timeReasonDetail : ''), color: '#ef4444', icon: 'schedule' });
            if (d.qtyDiffReason && !d.qtyDiffManagerNotified)
                types.push({ label: '투입/산출 차이', detail: d.qtyDiffReason + (d.qtyDiffDetail ? ' — ' + d.qtyDiffDetail : ''), color: '#ca8a04', icon: 'swap_vert' });
            if (d.planReason && !d.planManagerNotified)
                types.push({ label: '계획수량 미달', detail: d.planReason + (d.planReasonDetail ? ' — ' + d.planReasonDetail : ''), color: '#dc2626', icon: 'trending_down' });
            if (types.length) items.push({ d, types });
        });

        if (!items.length) { el.innerHTML = ''; return; }

        // 등록일 최신순 정렬, 최대 20건
        items.sort(function(a, b) {
            return (b.d.registeredAt || b.d.date || '').localeCompare(a.d.registeredAt || a.d.date || '');
        });
        const show = items.slice(0, 20);

        var rows = show.map(function(item) {
            const d = item.d;
            const wp = (d.date || '').split('-');
            const dateStr = wp.length === 3 ? wp[1] + '-' + wp[2] : (d.date || '-');
            const badges = item.types.map(function(t) {
                return '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,.04);' +
                    'border:1px solid ' + t.color + '33;border-radius:4px;padding:1px 7px;font-size:0.75rem;color:' + t.color + ';font-weight:600;margin-right:4px;">' +
                    '<span class="material-symbols-outlined" style="font-size:12px;">' + t.icon + '</span>' + t.label + '</span>';
            }).join('');
            const detail = item.types.map(function(t){ return t.detail; }).join(' / ');
            return '<tr style="cursor:pointer;" onclick="PaintingWorkModule&&PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">' +
                '<td style="white-space:nowrap;font-size:0.82rem;color:var(--text-muted);">' + dateStr + '</td>' +
                '<td style="font-size:0.83rem;font-weight:600;">' + (d.carModel || '-') + '</td>' +
                '<td style="font-size:0.83rem;">' + (d.partName || '-') + '</td>' +
                '<td>' + badges + '</td>' +
                '<td style="font-size:0.78rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(detail) + '</td>' +
                '</tr>';
        }).join('');

        el.innerHTML =
            '<div class="card" style="margin-bottom:0;border-left:3px solid #ef4444;">' +
            '<div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:#ef4444;">notification_important</span>' +
            '<span style="font-weight:700;font-size:0.88rem;color:#dc2626;">관리자 보고 누락</span>' +
            '<span style="background:#ef4444;color:#fff;border-radius:10px;padding:0 7px;font-size:0.73rem;font-weight:700;">' + items.length + '</span>' +
            '</div>' +
            '<span style="font-size:0.75rem;color:var(--text-muted);">도장 작업 실적 중 관리자 미통보 항목 · 클릭하여 이동</span>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">' +
            '<thead><tr style="background:var(--bg-secondary);">' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">작업일</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">차종</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">품명</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">누락 항목</th>' +
            '<th style="padding:6px 12px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;">사유</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table></div></div>';
    }

    /* ══════════════════════════════════════════════════════════
       초중종물 기준 발행 누락 — 대시보드는 최근 7일만 타일로 표시
       미발행 정의: 연결된 quality_issue에 printedAt/발행완료가 없음
       (계획 시작 5분 후 자동 생성되는 문서는 기본값이 '발행대기')
    ══════════════════════════════════════════════════════════ */
    function renderQualityStdWarnings() {
        const el = document.getElementById('dashQualityStdWarnings');
        if (!el) return;

        const WORK_STORE = DB.STORES.PAINTING_WORK;
        const Q_STORE    = DB.STORES.PROD_QUALITY_CHECK;
        if (!WORK_STORE || !Q_STORE) { el.innerHTML = ''; return; }

        const works = Storage.getAll(WORK_STORE) || [];
        const qAll  = Storage.getAll(Q_STORE)    || [];

        const ISSUE_KIND    = 'quality_issue';
        const TEMPLATE_KIND = 'quality_template';
        const LOOKBACK_DAYS = 7;

        function _normText(v) { return String(v || '').trim(); }
        function _dayOf(v) { return String(v || '').slice(0, 10); }
        function _ymdDaysAgo(days) {
            const d = new Date();
            d.setDate(d.getDate() - Number(days || 0));
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        }
        function _fp(x) {
            if (!x) return '';
            return [
                _dayOf(x.date),
                _normText(x.line),
                String(x.startTime || x.slot || '').trim().slice(0, 5),
                _normText(x.carModel),
                _normText(x.partName),
                _normText(x.color)
            ].join('|').toLowerCase();
        }
        function _isPrinted(issue) {
            if (!issue) return false;
            if (issue.printedAt) return true;
            return String(issue.status || '') === '발행완료';
        }
        function _rank(issue) {
            if (!issue) return 0;
            let n = 0;
            if (_isPrinted(issue)) n += 20;
            if (issue.workId) n += 5;
            return n;
        }
        function _best(list) {
            return (list || []).reduce(function(best, cur) {
                if (!best) return cur;
                if (_rank(cur) !== _rank(best)) return _rank(cur) > _rank(best) ? cur : best;
                return String(cur.updatedAt || cur.createdAt || cur.id || '') >
                    String(best.updatedAt || best.createdAt || best.id || '') ? cur : best;
            }, null);
        }

        const templates = qAll.filter(d => d && d._docKind === TEMPLATE_KIND);
        const issues = qAll.filter(d => d && (d._docKind || ISSUE_KIND) === ISSUE_KIND);

        function _templateFor(carModel, color) {
            const car = _normText(carModel);
            const clr = _normText(color);
            const rows = templates.filter(t => _normText(t.carModel) === car);
            if (clr) {
                const exact = rows.find(t => _normText(t.color) === clr);
                if (exact) return exact;
            }
            return rows.find(t => !_normText(t.color)) || rows[0] || null;
        }

        const byWork = {};
        const byPlan = {};
        const byFp = {};
        issues.forEach(function(i) {
            if (i.workId) {
                const k = String(i.workId);
                (byWork[k] = byWork[k] || []).push(i);
            }
            if (i.planId) {
                const k = String(i.planId);
                (byPlan[k] = byPlan[k] || []).push(i);
            }
            const fp = _fp(i);
            if (fp && _dayOf(i.date)) {
                (byFp[fp] = byFp[fp] || []).push(i);
            }
        });

        function _issueFor(src) {
            const cands = [];
            if (src && src.id && byWork[String(src.id)]) cands.push(_best(byWork[String(src.id)]));
            if (src && src.planId && byPlan[String(src.planId)]) cands.push(_best(byPlan[String(src.planId)]));
            const fp = _fp(src);
            if (fp && byFp[fp]) cands.push(_best(byFp[fp]));
            return _best(cands.filter(Boolean));
        }

        const today = UIUtils.today();
        const fromDate = _ymdDaysAgo(LOOKBACK_DAYS);
        const seen = new Set();
        const missing = [];

        works.forEach(function(w) {
            if (!w || !w.id) return;
            const day = _dayOf(w.date);
            if (day && day < fromDate) return;
            if (!_templateFor(w.carModel, w.color)) return;
            const issue = _issueFor(w);
            if (_isPrinted(issue)) return;
            seen.add(w.id);
            if (w.planId) seen.add('plan:' + w.planId);
            missing.push({ date: day, issue: issue });
        });

        issues.forEach(function(issue) {
            if (_isPrinted(issue)) return;
            const day = _dayOf(issue.date);
            if (day && day < fromDate) return;
            const key = issue.workId || (issue.planId ? 'plan:' + issue.planId : issue.id);
            if (seen.has(key) || (issue.workId && seen.has(String(issue.workId))) ||
                (issue.planId && seen.has('plan:' + issue.planId))) return;
            if (!_templateFor(issue.carModel, issue.color) && !(issue.items || []).length) return;
            if (_isPrinted(_issueFor(issue))) return;
            seen.add(key);
            missing.push({ date: day, issue: issue });
        });

        if (!missing.length) { el.innerHTML = ''; return; }

        const overdue = missing.filter(function(w) { return w.date && w.date < today; }).length;
        const color = overdue ? '#ef4444' : '#f59e0b';
        el.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,240px));gap:8px;">
                ${_tile({
                    icon: 'checklist',
                    title: '초중종물 기준 발행',
                    value: missing.length + '건',
                    valueColor: color,
                    sub: overdue ? ('전일 이전 ' + overdue + '건 · 최근 7일') : '최근 7일 발행 필요',
                    size: 'sm',
                    badge: '미발행',
                    onClick: "Router.navigate('prod-quality')"
                })}
            </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       생산 현황 타일 행
    ══════════════════════════════════════════════════════════ */
    function renderProductionTiles() {
        const el = document.getElementById('dashProdTiles');
        if (!el) return;

        const todayStr  = UIUtils.today();
        const plans     = Storage.getAll(STORE.PRODUCTION_PLANS);
        const injInv    = Storage.getAll(STORE.INJECTION_INVENTORY);
        const paintWork = Storage.getAll(STORE.PAINTING_WORK);
        const paintInsp = Storage.getAll(STORE.PAINTING_INSPECTIONS);
        const prodInv   = Storage.getAll(STORE.PRODUCT_INVENTORY);
        const standby   = Storage.getAll(STORE.SHIPPING_STANDBY);

        const todayPlans  = _summary ? Number(_summary.todayPlans) || 0 : plans.filter(p => p.date === todayStr).length;
        const injTotal    = _summary ? Number(_summary.injectionInventory) || 0 : injInv.reduce((s,i) => s + (Number(i.quantity) || 0), 0);
        const paintTodayRows = paintWork.filter(p => p.date === todayStr);
        const paintTodayA = _summary ? Number(_summary.paintingTodayA) || 0 : paintTodayRows.filter(p => !/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(String(p.line || '').trim())).length;
        const paintTodayB = _summary ? Number(_summary.paintingTodayB) || 0 : paintTodayRows.filter(p => /도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(String(p.line || '').trim())).length;
        const defectToday = _summary ? Number(_summary.defectToday) || 0 : paintInsp.filter(p => p.date === todayStr).reduce((s,d) => s + (Number(d.defectCount) || 0), 0);
        const prodTotal   = _summary ? Number(_summary.productInventory) || 0 : prodInv.reduce((s,i) => s + (Number(i.quantity) || 0), 0);
        const sbCount     = _summary ? Number(_summary.shippingWaiting) || 0 : standby.filter(s => s.status === '대기').length;

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:7px;">
                <span class="material-symbols-outlined" style="font-size:13px;">factory</span>
                생산 현황
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;">
                ${_tile({ icon:'assignment',     title:'생산 계획 지시서', value: todayPlans,
                          valueColor:'#3b82f6',  sub:'오늘 계획 건수',    size:'sm',
                          onClick:"Router.navigate('production-plan')" })}
                ${_tile({ icon:'warehouse',      title:'사출 창고 재고',   value: UIUtils.formatNumber(injTotal),
                          valueColor:'#8b5cf6',  sub:'전체 재고 (EA)',    size:'sm',
                          onClick:"Router.navigate('warehouse-overview')" })}
                ${_tile({ icon:'format_paint',   title:'도장-A 작업',     value: paintTodayA,
                          valueColor:'#0891b2',  sub:'오늘 도장-A',       size:'sm',
                          onClick:"Router.navigate('painting-work-a')" })}
                ${_tile({ icon:'format_paint',   title:'도장-B 작업',     value: paintTodayB,
                          valueColor:'#f59e0b',  sub:'오늘 도장-B',       size:'sm',
                          onClick:"Router.navigate('painting-work-b')" })}
                ${_tile({ icon:'report_problem', title:'도장 불량 현황',   value: defectToday,
                          valueColor: defectToday > 0 ? '#ef4444' : '#22c55e',
                          sub:'오늘 불량 수',    size:'sm',
                          onClick:"Router.navigate('painting-inspection')",
                          badge: defectToday > 0 ? '발생' : '' })}
                ${_tile({ icon:'inventory_2',    title:'제품 창고 재고',   value: UIUtils.formatNumber(prodTotal),
                          valueColor:'#10b981',  sub:'전체 재고 (EA)',    size:'sm',
                          onClick:"Router.navigate('product-warehouse')" })}
                ${_tile({ icon:'local_shipping', title:'출하검사 대기',    value: sbCount,
                          valueColor: sbCount > 0 ? '#f59e0b' : '#22c55e',
                          sub:'출하 대기 건',    size:'sm',
                          onClick:"Router.navigate('shipping-standby')",
                          badge: sbCount > 0 ? '대기' : '' })}
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       점검/관리 타일 행 (async — 3정5S 계획 비동기 로드)
    ══════════════════════════════════════════════════════════ */
    async function renderMonitorTiles() {
        const el = document.getElementById('dashMonitorTiles');
        if (!el) return;

        const today     = UIUtils.today();
        const now       = new Date();
        const year      = now.getFullYear();
        const month     = now.getMonth() + 1;
        const thisMonth = today.slice(0, 7);

        // ── F/PROOF ───────────────────────────────────────────
        let fpMissing = FPROOF_ITEMS.length, fpDone = 0;
        const fpStore = DB.STORES.EQUIP_FPROOF_LOG;
        if (fpStore) {
            const chk = new Set(
                (Storage.getAll(fpStore) || []).filter(r => r.date === today).map(r => r.itemKey)
            );
            fpDone    = FPROOF_ITEMS.filter(i => chk.has(i.key)).length;
            fpMissing = FPROOF_ITEMS.length - fpDone;
        }

        // ── 조도관리 ──────────────────────────────────────────
        let illumMissing = ILLUMINATION_POINTS.length, illumFailed = 0;
        const luxStore = DB.STORES.EQUIP_ILLUMINATION_LOG;
        if (luxStore) {
            const recs = (Storage.getAll(luxStore) || [])
                .filter(r => Number(r.year) === year && Number(r.month) === month);
            const byKey = {};
            recs.forEach(r => { byKey[r.pointKey] = r; });
            const doneList = ILLUMINATION_POINTS.filter(p => byKey[_illumKey(p)]);
            illumMissing = ILLUMINATION_POINTS.length - doneList.length;
            illumFailed  = doneList.filter(p => Number(byKey[_illumKey(p)].lux) < p.standard).length;
        }

        // ── 3정5S ─────────────────────────────────────────────
        let s5Monthly = 0, s5Open = 0, s5Overdue = 0, s5Missed = 0;
        const s5Store    = DB.STORES.S5_INSPECTIONS;
        const s5IssStore = DB.STORES.S5_ISSUES;
        if (s5Store && s5IssStore) {
            const insps  = Storage.getAll(s5Store)    || [];
            const issues = Storage.getAll(s5IssStore) || [];
            s5Monthly = insps.filter(r => (r.date || '').startsWith(thisMonth)).length;
            s5Open    = issues.filter(r => r.status !== '완료').length;
            s5Overdue = issues.filter(r => r.status !== '완료' && r.dueDate && r.dueDate < today).length;
            try {
                const planData    = await Storage.getConfigValue('s5_plan').catch(() => null);
                const assignments = planData?.assignments || [];
                const upcoming    = _calcUpcomingForDash(assignments, today);
                s5Missed = upcoming.filter(n =>
                    n.date <= today && !insps.some(i => i.date === n.date && i.area === n.area)
                ).length;
            } catch (e) {}
        }

        // ── 설비 일정 ─────────────────────────────────────────
        let es = null;
        if (typeof ProdEquipmentModule !== 'undefined' && ProdEquipmentModule.getScheduleSummary) {
            try { es = ProdEquipmentModule.getScheduleSummary(); } catch (e) {}
        }

        /* ── 타일 조립 ───────────────────────────────────── */
        const tiles = [];

        // F/PROOF
        const fpC = fpMissing > 0 ? '#ef4444' : '#22c55e';
        tiles.push(_tile({
            icon:'task_alt', title:'F/PROOF 일일점검', size:'xs',
            value: fpMissing > 0 ? fpMissing + '건' : '완료',
            valueColor: fpC,
            sub: fpMissing > 0 ? '오늘 미점검' : `${fpDone}/${FPROOF_ITEMS.length} 완료`,
            onClick:"DashboardModule.openFProof()",
            badge: fpMissing > 0 ? '미점검' : ''
        }));

        // 조도관리
        const illumC = (illumMissing + illumFailed) === 0 ? '#22c55e'
                     : illumFailed > 0 ? '#ef4444' : '#f59e0b';
        tiles.push(_tile({
            icon:'lightbulb', title:'조도관리 (월간)', size:'xs',
            value: illumMissing > 0 ? illumMissing + '곳' : illumFailed > 0 ? illumFailed + '건' : '완료',
            valueColor: illumC,
            sub: illumMissing > 0 ? '미등록 위치'
               : illumFailed  > 0 ? '기준 미달'
               : `${ILLUMINATION_POINTS.length}곳 완료`,
            onClick:"DashboardModule.openIlluminationCheck()",
            badge: illumFailed > 0 ? '기준미달' : illumMissing > 0 ? '미등록' : ''
        }));

        // 3정5S
        const s5C = s5Missed > 0 || s5Overdue > 0 ? '#ef4444'
                  : s5Open > 0 ? '#f59e0b' : '#22c55e';
        tiles.push(_tile({
            icon:'cleaning_services', title:'3정5S 관리', size:'xs',
            value: s5Missed > 0   ? s5Missed + '건'
                 : s5Open   > 0   ? s5Open   + '건'
                 : s5Monthly + '회',
            valueColor: s5C,
            sub: s5Missed  > 0 ? '점검 미실시'
               : s5Overdue > 0 ? `기한초과 ${s5Overdue}건`
               : s5Open    > 0 ? '미결 이슈'
               : '이번달 점검',
            onClick:"Router.navigate('five-s')",
            badge: s5Missed > 0 ? '미실시' : s5Overdue > 0 ? '기한초과' : ''
        }));

        // 설비 타일 헬퍼
        function _equipTile(icon, title, mode, planned, missing) {
            const noplan = planned.length === 0;
            const mc     = missing.length;
            const C      = noplan ? '#94a3b8' : mc > 0 ? '#ef4444' : '#22c55e';
            const val    = noplan ? '—' : mc > 0 ? mc + '건' : '완료';
            const sub    = noplan ? '이번달 계획없음'
                         : mc > 0 ? `${planned.length - mc}/${planned.length} 완료`
                         : '모두 완료';
            return _tile({ icon, title, value: val, valueColor: C, sub, size:'xs',
                onClick: `DashboardModule.openEquipMode('${mode}')`,
                badge: mc > 0 ? '미완료' : '' });
        }

        if (es) {
            tiles.push(_equipTile('device_thermostat', '온도 프로파일',
                'temperature',  es.tempProfile.planned,  es.tempProfile.missing));
            tiles.push(_equipTile('filter_alt',        '압축에어 필터',
                'airfilter',    es.airFilter.planned,    es.airFilter.missing));
            tiles.push(_equipTile('air',               '급기 필터',
                'supplyfilter', es.supplyFilter.planned, es.supplyFilter.missing));
            tiles.push(_equipTile('local_fire_department', '건조로 청소',
                'dryerclean',   es.dryerClean.planned,   es.dryerClean.missing));
            tiles.push(_tile({
                icon:'handyman', title:'정비/청소', size:'xs',
                value: es.maintenance.items.length + '건',
                valueColor:'#3b82f6',
                sub:'이번달 예정',
                onClick:"DashboardModule.openEquipMode('maintenance')"
            }));
        }

        const prodAdjustLogs = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        const monthAdjustLogs = prodAdjustLogs.filter(r => String(r.date || r.at || '').slice(0, 7) === thisMonth);
        const latestAdjust = prodAdjustLogs[0];
        tiles.push(_tile({
            icon:'manage_history',
            title:'제품 현재고 보정 이력',
            value: monthAdjustLogs.length + '건',
            valueColor: monthAdjustLogs.length > 0 ? '#f59e0b' : '#64748b',
            sub: latestAdjust ? `${latestAdjust.item?.partName || '-'} / ${latestAdjust.reason || '-'}` : '보정 이력 없음',
            size:'xs',
            onClick:"DashboardModule.openProductAdjustLogs()",
            badge: monthAdjustLogs.length > 0 ? '보정' : ''
        }));

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;margin-bottom:7px;">
                <span class="material-symbols-outlined" style="font-size:13px;">monitor_heart</span>
                점검 / 관리 현황 (${year}년 ${month}월)
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;">
                ${tiles.join('')}
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       3정5S 예정일 계산 (대시보드용 간소화)
    ══════════════════════════════════════════════════════════ */
    /* 이름으로 등록 사진 찾기 — 작업자/검사자 마스터, 사용자 계정 순으로 조회 */
    function _personPhoto(name) {
        const key = String(name || '').replace(/\s+/g, '');
        if (!key) return '';
        const pick = function(rec) {
            if (!rec) return '';
            return rec.photo || rec.photoUrl || rec.avatar || rec.image || '';
        };
        const stores = [DB.STORES.OPERATORS, DB.STORES.INSPECTORS].filter(Boolean);
        for (const st of stores) {
            const hit = (Storage.getAll(st) || []).find(r =>
                String(r.name || '').replace(/\s+/g, '') === key);
            const photo = pick(hit);
            if (photo) return photo;
        }
        try {
            if (typeof AuthModule !== 'undefined' && AuthModule.getUsers) {
                const u = (AuthModule.getUsers() || []).find(x =>
                    String(x.displayName || x.username || '').replace(/\s+/g, '') === key);
                const photo = pick(u);
                if (photo) return photo;
            }
        } catch (e) {}
        return '';
    }

    function _personAvatarHtml(name, size) {
        const px = size || 54;
        const photo = _personPhoto(name);
        const initial = _esc(String(name || '-').trim().slice(0, 1) || '-');
        if (photo) {
            return '<img class="dash-star-photo" src="' + _esc(photo) + '" alt="' + _esc(name || '') + '"'
                + ' style="width:' + px + 'px;height:' + px + 'px;" onerror="this.style.display=\'none\'">';
        }
        return '<span class="dash-star-photo is-initial" style="width:' + px + 'px;height:' + px + 'px;'
            + 'font-size:' + Math.round(px * 0.45) + 'px;">' + initial + '</span>';
    }

    function renderImprovementTiles() {
        const el = document.getElementById('dashImprovementTiles');
        if (!el) return;

        const storeName = DB.STORES.PROD_IMPROVEMENT_ACTIVITIES;
        const rows = storeName ? (Storage.getAll(storeName) || []) : [];
        if (document.body.classList.contains('monitor-mode') && !rows.length) { el.style.display = 'none'; return; }
        el.style.display = '';
        const month = UIUtils.today().slice(0, 7);
        const monthRows = rows.filter(r => String(r.date || r.createdAt || '').slice(0, 7) === month);

        const rankMap = {};
        monthRows.forEach(r => {
            const name = r.proposer || '미지정';
            if (!rankMap[name]) rankMap[name] = { proposed: 0, approved: 0, closed: 0, score: 0 };
            rankMap[name].proposed += 1;
            if (r.approval === 'approved') rankMap[name].approved += 1;
            if (r.status === 'closed') rankMap[name].closed += 1;
            rankMap[name].score += 1 + (r.approval === 'approved' ? 2 : 0) + (r.status === 'closed' ? 3 : 0);
        });
        const top = Object.entries(rankMap)
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.score - a.score || b.proposed - a.proposed)[0];

        const pending = rows.filter(r => !r.approval || r.approval === 'pending' || r.status === 'reviewing' || r.status === 'draft').length;
        const approved = rows.filter(r => r.approval === 'approved').length;
        const running = rows.filter(r => ['planning', 'running', 'checking', 'maintaining'].includes(r.status)).length;
        const closed = rows.filter(r => r.status === 'closed').length;
        const recent = rows.slice()
            .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
            .slice(0, 3);

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;padding:8px 12px 10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-muted);
                        letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:5px;">
                <span class="material-symbols-outlined" style="font-size:13px;">emoji_events</span>
                개선활동 / 우수 사원
            </div>

            <!-- 우수 사원 -->
            <div onclick="Router.navigate('improvement-activity')"
                 style="border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:9px;background:#eff6ff;
                        padding:8px 10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                ${_personAvatarHtml(top?.name || '', 54)}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.6rem;color:#1d4ed8;font-weight:800;">이달의 우수 사원 후보</div>
                    <div style="font-size:1.15rem;font-weight:900;color:#0f172a;line-height:1.1;margin-top:2px;">${_esc(top?.name || '-')}</div>
                    <div style="display:flex;gap:8px;font-size:.62rem;color:#475569;font-weight:700;margin-top:3px;">
                        <span>점수 ${top ? top.score : 0}</span>
                        <span>제안 ${top ? top.proposed : 0}</span>
                        <span>승인 ${top ? top.approved : 0}</span>
                        <span>완료 ${top ? top.closed : 0}</span>
                    </div>
                </div>
                <span class="material-symbols-outlined" style="font-size:26px;color:#f59e0b;flex-shrink:0;">workspace_premium</span>
            </div>

            <!-- 개선 제안 현황 -->
            <div onclick="Router.navigate('improvement-activity')"
                 style="border:1px solid #bbf7d0;border-left:4px solid #10b981;border-radius:9px;background:#f0fdf4;
                        padding:8px 10px;cursor:pointer;flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                    <div style="font-size:.63rem;color:#047857;font-weight:800;">개선 제안 현황</div>
                    <span class="material-symbols-outlined" style="font-size:16px;color:#10b981;">tips_and_updates</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:7px;">
                    ${_improveMini('검토대기', pending, '#f59e0b')}
                    ${_improveMini('승인', approved, '#10b981')}
                    ${_improveMini('진행', running, '#3b82f6')}
                    ${_improveMini('완료', closed, '#6366f1')}
                </div>
                <div style="display:grid;gap:3px;font-size:.63rem;color:#334155;">
                    ${recent.length ? recent.map(r => `
                        <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px dashed #bbf7d0;padding-top:3px;">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;">${_esc(r.title || r.problem || '제목 없음')}</span>
                            <span style="white-space:nowrap;color:#64748b;">${_esc(r.proposer || '-')}</span>
                        </div>`).join('') : '<div style="color:#64748b;font-size:.63rem;">등록된 개선 제안이 없습니다.</div>'}
                </div>
            </div>
        </div>`;
    }

    function _improveMini(label, value, color) {
        return `<div style="border:1px solid ${color}33;background:#fff;border-radius:6px;padding:5px 4px;text-align:center;">
            <div style="font-size:.95rem;font-weight:900;color:${color};line-height:1;">${UIUtils.formatNumber(value)}</div>
            <div style="font-size:.58rem;color:#64748b;font-weight:800;margin-top:2px;">${label}</div>
        </div>`;
    }

    function _calcUpcomingForDash(assignments, today) {
        const results = [];
        const ms1day  = 24 * 3600 * 1000;
        const dayMap  = { '월요일':1, '화요일':2, '수요일':3, '목요일':4, '금요일':5 };
        const base    = new Date(today);

        assignments.forEach(a => {
            if (!a.assignee) return;
            const targetDay = dayMap[a.day] ?? 1;
            for (let w = -1; w <= 5; w++) {
                if (a.cycle === '격주' && ((w + 10) % 2 !== 0)) continue;
                if (a.cycle === '월간' && w !== 0) continue;
                const pivot = new Date(base.getTime() + w * 7 * ms1day);
                const diff  = (targetDay - pivot.getDay() + 7) % 7;
                const date  = new Date(pivot.getTime() + diff * ms1day);
                const dateStr = date.toISOString().split('T')[0];
                if (!results.find(r => r.date === dateStr && r.area === a.area))
                    results.push({ date: dateStr, area: a.area, assignee: a.assignee });
            }
        });

        const from  = new Date(base.getTime() -  7 * ms1day).toISOString().split('T')[0];
        const until = new Date(base.getTime() + 35 * ms1day).toISOString().split('T')[0];
        return results.filter(r => r.date >= from && r.date <= until)
                      .sort((a, b) => a.date.localeCompare(b.date));
    }

    /* ══════════════════════════════════════════════════════════
       운영 게시판 섹션
    ══════════════════════════════════════════════════════════ */
    function renderBoardSection() {
        const el = document.getElementById('dashBoardSection');
        if (!el) return;

        const CAT_COLOR = {
            '오류 보고': { bg:'#fee2e2', text:'#dc2626' },
            '개선 요청': { bg:'#fef3c7', text:'#d97706' },
            '문의':      { bg:'#dbeafe', text:'#2563eb' },
            '기타':      { bg:'#f1f5f9', text:'#64748b' }
        };

        const posts = (Storage.getAll(DB.STORES.BOARD_POSTS) || [])
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .slice(0, 5);

        const replies = Storage.getAll(DB.STORES.BOARD_REPLIES) || [];

        function relDate(iso) {
            if (!iso) return '';
            const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
            if (diff === 0) return '오늘';
            if (diff === 1) return '어제';
            if (diff < 7)  return `${diff}일 전`;
            return iso.slice(0, 10);
        }

        const rows = posts.length ? posts.map(p => {
            const cc  = CAT_COLOR[p.category] || CAT_COLOR['기타'];
            const cnt = (replies).filter(r => r.postId === p.id).length;
            return `
            <div onclick="Router.navigate('board')"
                 style="display:flex;align-items:center;gap:10px;padding:7px 12px;
                        border-bottom:1px solid var(--border-color);cursor:pointer;
                        transition:background .15s;"
                 onmouseover="this.style.background='var(--bg-secondary)'"
                 onmouseout="this.style.background=''">
                <span style="flex-shrink:0;font-size:.72rem;font-weight:700;padding:2px 7px;
                             border-radius:10px;background:${cc.bg};color:${cc.text};
                             white-space:nowrap;">${_esc(p.category || '기타')}</span>
                <span style="flex:1;font-size:.85rem;color:var(--text-primary);
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${_esc(p.title || '(제목 없음)')}
                    ${cnt ? `<span style="font-size:.72rem;color:var(--accent-blue);margin-left:4px;">[${cnt}]</span>` : ''}
                </span>
                <span style="flex-shrink:0;font-size:.75rem;color:var(--text-muted);white-space:nowrap;">${_esc(p.author || '')}</span>
                <span style="flex-shrink:0;font-size:.72rem;color:var(--text-muted);white-space:nowrap;min-width:42px;text-align:right;">${relDate(p.createdAt)}</span>
            </div>`;
        }).join('') : `<div style="text-align:center;padding:20px;font-size:.85rem;color:var(--text-muted);">
            등록된 게시글이 없습니다.
        </div>`;

        el.innerHTML = `
        <div class="card" style="margin-bottom:0;">
            <div class="card-header" style="padding:8px 12px;">
                <h4 style="font-size:.8rem;display:flex;align-items:center;gap:5px;margin:0;">
                    <span class="material-symbols-outlined" style="font-size:15px;color:var(--accent-blue);">forum</span>
                    운영 게시판
                    ${posts.length ? `<span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:2px;">최근 ${posts.length}건</span>` : ''}
                </h4>
                <button onclick="Router.navigate('board')" class="btn btn-sm btn-outline"
                    style="font-size:.75rem;padding:2px 10px;height:24px;">
                    전체보기
                </button>
            </div>
            <div style="overflow:hidden;">${rows}</div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       네비게이션 헬퍼
    ══════════════════════════════════════════════════════════ */
    function openIlluminationCheck(pointKey) {
        try {
            sessionStorage.setItem('prodEquipmentMode', 'illumination');
            if (pointKey) {
                const m = new Date().getMonth() + 1;
                sessionStorage.setItem('prodEquipmentIlluminationPoint', JSON.stringify({ pointKey, month: m }));
            }
        } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function openFProof() {
        try { sessionStorage.setItem('prodEquipmentMode', 'fproof'); } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function openEquipMode(mode) {
        try { sessionStorage.setItem('prodEquipmentMode', mode); } catch (e) {}
        Router.navigate('prod-equipment');
    }

    function toggleQualityWarnSelectAll(el) {
        const on = !!(el && el.checked);
        document.querySelectorAll('#dashQualityStdWarnings input.dash-pq-check').forEach(function(cb) {
            cb.checked = on;
        });
    }

    function _writePrintPreparing(win) {
        if (!win) return;
        try {
            win.document.open();
            win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>인쇄 준비</title></head>' +
                '<body style="font-family:Malgun Gothic,sans-serif;padding:28px;color:#334155;">초중종물 기준 양식을 준비하는 중입니다...</body></html>');
            win.document.close();
        } catch (e) {}
    }

    function printSelectedQualityIssues() {
        const ids = Array.from(document.querySelectorAll('#dashQualityStdWarnings input.dash-pq-check:checked'))
            .map(function(el) { return el.getAttribute('data-work-id') || ''; })
            .filter(Boolean);
        if (!ids.length) {
            UIUtils.toast('발행할 항목을 선택하세요.', 'warning');
            return;
        }
        const win = window.open('', '_blank');
        if (!win) {
            UIUtils.toast('팝업 차단을 해제하세요.', 'warning');
            return;
        }
        _writePrintPreparing(win);
        window.__pqPendingPrint = { sourceIds: ids, win: win };
        try { sessionStorage.setItem('dash_prodQuality_batchIds', JSON.stringify(ids)); } catch (e) {}
        const run = function() {
            if (window.ProdQualityModule && typeof window.ProdQualityModule.printSelectedFromWorks === 'function') {
                window.__pqPendingPrint = null;
                try { sessionStorage.removeItem('dash_prodQuality_batchIds'); } catch (e2) {}
                window.ProdQualityModule.printSelectedFromWorks(ids, { win: win });
                return true;
            }
            return false;
        };
        if (typeof Router !== 'undefined' && typeof Router.ensureLazyLoaded === 'function') {
            Router.ensureLazyLoaded('prod-quality').then(function() {
                if (!run()) Router.navigate('prod-quality');
            }).catch(function() { Router.navigate('prod-quality'); });
        } else {
            Router.navigate('prod-quality');
        }
    }

    // 대시보드 → 초중종물(기준 발행) 화면 오픈
    function openQualityIssueFromWork(workId) {
        try {
            const sourceId = String(workId || '');
            if (sourceId.indexOf('plan:') !== 0) {
                if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.openWorkViewPage === 'function') {
                    try { PaintingWorkModule.openWorkViewPage(workId); } catch (e) {}
                }
            }

            try { sessionStorage.setItem('dash_prodQuality_workId', sourceId); } catch (e) {}
            Router.navigate('prod-quality');

            let retry = 0;
            const timer = setInterval(function() {
                retry += 1;
                let id = '';
                try { id = sessionStorage.getItem('dash_prodQuality_workId') || ''; } catch (e) {}
                if (!id) { clearInterval(timer); return; }

                if (window.ProdQualityModule && typeof window.ProdQualityModule.openWriteFromWork === 'function') {
                    try {
                        window.ProdQualityModule.openWriteFromWork(id);
                        try { sessionStorage.removeItem('dash_prodQuality_workId'); } catch (e) {}
                        clearInterval(timer);
                        return;
                    } catch (e) {}
                }
                if (retry >= 20) clearInterval(timer);
            }, 120);
        } catch (e) {
            Router.navigate('prod-quality');
        }
    }

    async function openProductAdjustLogs() {
        const logs = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        const rows = logs.slice(0, 50).map(log => `
            <tr>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);white-space:nowrap;">${_esc((log.at || log.date || '').slice(0, 10))}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.item?.carModel || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);font-weight:700;">${_esc(log.item?.partName || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.item?.color || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);font-family:monospace;">${_esc(log.before?.lotNo || '-')} → ${_esc(log.after?.lotNo || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);text-align:right;">${UIUtils.formatNumber(log.before?.quantity || 0)} → ${UIUtils.formatNumber(log.after?.quantity || 0)}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.reason || '-')}</td>
                <td style="padding:7px 8px;border-bottom:1px solid var(--border-color);">${_esc(log.user || '-')}</td>
            </tr>
        `).join('');
        UIUtils.showModal('제품 현재고 보정 이력', `
            <div style="max-height:520px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:8px;text-align:left;">일자</th>
                            <th style="padding:8px;text-align:left;">차종</th>
                            <th style="padding:8px;text-align:left;">품명</th>
                            <th style="padding:8px;text-align:left;">컬러</th>
                            <th style="padding:8px;text-align:left;">LOT 변경</th>
                            <th style="padding:8px;text-align:right;">수량 변경</th>
                            <th style="padding:8px;text-align:left;">수정 사유</th>
                            <th style="padding:8px;text-align:left;">작업자</th>
                        </tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-muted);">보정 이력이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    function refresh(silent) {
        const container = document.getElementById('contentArea');
        render(container);
        if (!silent) UIUtils.toast('대시보드를 새로고침했습니다.', 'success');
    }

    function refreshQualityWarnings() {
        renderQualityStdWarnings();
    }

    /* ══════════════════════════════════════════════════════════
       쪽지 + Slack 채널 알림 발송 모달
    ══════════════════════════════════════════════════════════ */
    async function openNotifyModal(templateKey, count) {
        const LABELS = {
            paint_pending:     '도료 입고 대기',
            inj_pending:       '사출 입고 대기',
            work_missing:      '실적 미입력',
            paint_mix_missing: '도료 사용 미등록'
        };
        const label = LABELS[templateKey] || templateKey;

        const allUsers = (typeof AuthModule !== 'undefined' && AuthModule.getUsers)
            ? AuthModule.getUsers().filter(function(u) { return u.active !== false; }) : [];

        let slackReady = false;
        let telegramReady = false;
        try {
            const cfg = (typeof ApiClient !== 'undefined' && ApiClient.checkNotifyConfig)
                ? await ApiClient.checkNotifyConfig() : null;
            slackReady = !!(cfg && cfg.slackWebhookSet);
            telegramReady = !!(cfg && (cfg.botTokenSet || cfg.configured));
        } catch (e) {}

        const DEFAULT_NOTIFY_ROLES = ['admin', 'prod_manager', 'quality_manager', 'logistics_worker'];
        const userRows = allUsers.map(function(u) {
            const keys = [].concat(u.roles || [], u.role ? [u.role] : []);
            const precheck = keys.some(function(k) { return DEFAULT_NOTIFY_ROLES.indexOf(String(k)) >= 0; });
            return `<label style="display:flex;align-items:center;gap:8px;padding:7px 0;cursor:pointer;border-bottom:1px solid var(--border-color);">
                <input type="checkbox" class="notify-recipient" value="${u.id}"${precheck ? ' checked' : ''} style="width:15px;height:15px;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;color:#4A154B;">mail</span>
                <span style="font-weight:600;min-width:80px;">${u.displayName || u.username}</span>
                <span style="font-size:.72rem;color:var(--text-muted);margin-left:auto;">${(u.roles||[u.role||'']).join(', ')}</span>
            </label>`;
        }).join('');

        UIUtils.showModal(`알림 발송 — ${label}`,
            `<div style="min-width:360px;max-width:500px;">
                <div style="background:#4A154B12;border:1px solid #4A154B40;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:#4A154B;">campaign</span>
                    <div><strong>${label}</strong> ${count}건 알림을<br>MES 쪽지, Slack 채널, 텔레그램(Chat ID 있는 수신자)에 함께 보냅니다.</div>
                </div>
                <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:10px;line-height:1.55;">
                    <div style="color:${slackReady ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${slackReady
                            ? 'Slack Webhook 연결됨 — 채널에도 1건 전달됩니다.'
                            : 'Slack Webhook 미설정 — 채널 전달은 건너뜁니다.'}
                    </div>
                    <div style="color:${telegramReady ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${telegramReady
                            ? '텔레그램 Bot 연결됨 — Chat ID가 있는 수신자 개인 대화로 전달됩니다.'
                            : '텔레그램 Bot 미설정 — 개인 텔레그램은 건너뜁니다. 설정 → 시스템에서 Token을 저장하세요.'}
                    </div>
                </div>
                <div style="font-size:.8rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">쪽지 수신자</div>
                ${allUsers.length
                    ? `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:0 10px;">${userRows}</div>`
                    : `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:.85rem;border:1px solid var(--border-color);border-radius:6px;">
                        활성 사용자가 없습니다.
                    </div>`}
                <div id="notifyStatusMsg" style="margin-top:10px;min-height:20px;font-size:.82rem;"></div>
            </div>`,
            allUsers.length
                ? `<button class="btn btn-primary" onclick="DashboardModule._doSendNotify('${templateKey}',${count})">
                        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">send</span> 쪽지+채널 발송
                    </button>
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>`
                : `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`
        );
    }

    async function _doSendNotify(templateKey, count) {
        const statusEl = document.getElementById('notifyStatusMsg');
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">발송 중…</span>';

        const LABELS = {
            paint_pending:     '도료 입고 대기',
            inj_pending:       '사출 입고 대기',
            work_missing:      '실적 미입력',
            paint_mix_missing: '도료 사용 미등록'
        };
        const label = LABELS[templateKey] || templateKey;
        const title = '[MES 알림] ' + label;
        const body = count + '건이 처리 대기 중입니다.';

        const checked = Array.from(document.querySelectorAll('.notify-recipient:checked'));
        if (!checked.length) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 수신자를 선택하세요.</span>';
            return;
        }
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 기능을 사용할 수 없습니다.</span>';
            return;
        }
        // 이 발송은 Slack 채널과 수신자 개인 텔레그램까지 함께 나간다. 대시보드는 로그아웃
        // 상태에서도 열리므로 로그인 게이트가 없으면 누구나 외부 채널에 알림을 뿌릴 수 있다.
        // 확인은 여기서 한 번만 — sendInternalMessage는 미로그인 시 수신자마다 토스트를
        // 띄우므로, 루프 전에 막아야 같은 경고가 인원수만큼 쌓이지 않는다.
        if (typeof AuthModule.getCurrentUser === 'function' && !AuthModule.getCurrentUser()) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">로그인 후 발송할 수 있습니다. Slack·텔레그램으로 함께 나가는 알림입니다.</span>';
            return;
        }

        let noteOk = 0;
        checked.forEach(function(cb) {
            const ok = AuthModule.sendInternalMessage({
                targetType: 'user',
                targetId: cb.value,
                title: title,
                body: body,
                category: 'dashboard-notify',
                priority: 'high'
            });
            if (ok) noteOk += 1;
        });

        if (!noteOk) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent-red);">쪽지 발송에 실패했습니다. 로그인 상태를 확인하세요.</span>';
            return;
        }
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ 쪽지 ' + noteOk +
                '건 저장. Chat ID가 있는 수신자 텔레그램과 Slack 채널에도 전달됩니다.</span>';
        }
        setTimeout(function() { UIUtils.closeModal(); }, 1600);
    }

    return {
        render,
        resetLayout,
        autoArrangeLayout,
        toggleFullscreen,
        refresh,
        refreshQualityWarnings,
        openIlluminationCheck,
        openFProof,
        openEquipMode,
        openQualityIssueFromWork,
        toggleQualityWarnSelectAll,
        printSelectedQualityIssues,
        openProductAdjustLogs,
        openNotifyModal,
        _doSendNotify
    };
})();
