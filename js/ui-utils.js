/**
 * UIUtils — 전역 UI 유틸리티
 * toast / modal / formatNumber / date helpers / badge 등
 * 모든 모듈에서 UIUtils.xxx() 형태로 사용
 */

const UIUtils = (function () {
    'use strict';

    let modalDragObserverInitialized = false;

    // ── 태블릿/모바일 뒤로가기(<) 가드 ──────────────────────────────────
    // 입력 창(모달)이 열려 있을 때 하드웨어 뒤로가기 버튼을 누르면 창이 닫히거나
    // 페이지가 이동해 입력값이 사라지는 것을 막는다. 모달이 열리면 히스토리 상태를
    // 하나 쌓아 두고, 뒤로가기가 눌리면 그 상태만 소비시켜 입력 창을 그대로 유지한다.
    let modalBackGuardArmed = false;

    function _armModalBackGuard() {
        if (modalBackGuardArmed) return;
        try {
            history.pushState({ __mesModalGuard: true }, '');
            modalBackGuardArmed = true;
        } catch (e) { /* history 미지원 환경 무시 */ }
    }

    function _releaseModalBackGuard() {
        // 정상 닫기(X·취소·저장 완료 등)로 닫힌 경우, 쌓아 둔 가드 상태를 정리한다.
        if (!modalBackGuardArmed) return;
        modalBackGuardArmed = false;
        try { history.back(); } catch (e) { /* 무시 */ }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('popstate', function () {
            const overlay = document.getElementById('modal');
            const modalOpen = !!(overlay && overlay.classList.contains('active'));
            modalBackGuardArmed = false; // 방금 우리가 쌓아 둔 가드 상태가 소비됨
            if (modalOpen) {
                // 입력 창을 그대로 둔다 — 뒤로가기를 무효화하고 가드를 다시 건다.
                _armModalBackGuard();
            }
        });
    }

    // ── 날짜 유틸 ────────────────────────────────────────────────────────
    // 로컬(브라우저) 기준 날짜 — toISOString(UTC)는 KST 00:00~08:59에 하루 전으로 어긋남
    function _pad2(n) {
        return String(n).padStart(2, '0');
    }

    function _localYmd(d) {
        return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate());
    }

    function _localHm(d) {
        return _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
    }

    function today() {
        return _localYmd(new Date());
    }

    function now() {
        const d = new Date();
        return _localYmd(d) + ' ' + _localHm(d) + ':' + _pad2(d.getSeconds());
    }

    function monthAgo() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return _localYmd(d);
    }

    function daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return _localYmd(d);
    }

    // ── 숫자 포맷 ─────────────────────────────────────────────────────────
    function formatNumber(n) {
        if (n == null || n === '') return '-';
        const num = Number(n);
        if (isNaN(num)) return String(n);
        if (num === 0) return '-';
        return num.toLocaleString('ko-KR');
    }

    // ── 토스트 알림 ───────────────────────────────────────────────────────
    // type: 'success' | 'error' | 'warning' | 'info'
    function toast(message, type) {
        const container = document.getElementById('toastContainer');
        if (!container) { console.log('[toast]', message); return; }

        const colorMap = {
            success: '#10b981',
            error:   '#ef4444',
            warning: '#f59e0b',
            info:    '#3b82f6'
        };
        const iconMap = {
            success: 'check_circle',
            error:   'error',
            warning: 'warning',
            info:    'info'
        };
        const t = type || 'info';
        const color = colorMap[t] || colorMap.info;
        const icon  = iconMap[t]  || iconMap.info;

        const el = document.createElement('div');
        el.style.cssText = `
            display:flex;align-items:center;gap:10px;
            background:#fff;border-left:4px solid ${color};
            border-radius:8px;padding:12px 16px;
            box-shadow:0 4px 16px rgba(0,0,0,0.12);
            font-size:.85rem;color:#1e293b;font-weight:600;
            animation:slideInRight .25s ease;max-width:360px;
            pointer-events:auto;cursor:pointer;`;
        el.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;color:${color};">${icon}</span>${_esc(message)}`;
        el.addEventListener('click', () => el.remove());
        container.appendChild(el);

        setTimeout(() => {
            el.style.animation = 'fadeOut .3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    function _clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function _resetModalPosition(box) {
        if (!box) return;
        box.style.left = '';
        box.style.top = '';
        box.style.right = '';
        box.style.bottom = '';
        box.style.position = '';
        box.style.margin = '';
        box.style.transform = '';
    }

    function _findDragHandle(box) {
        if (!box) return null;
        return box.querySelector('.modal-header, [data-modal-drag-handle]') || box.firstElementChild || box;
    }

    function _primeDraggableBoxPosition(box) {
        if (!box) return;
        const rect = box.getBoundingClientRect();
        box.style.position = 'fixed';
        box.style.left = `${Math.max(8, rect.left)}px`;
        box.style.top = `${Math.max(8, rect.top)}px`;
        box.style.margin = '0';
        box.style.transform = 'none';
    }

    function makeDraggableModal(box, handle) {
        if (!box) return;
        const dragHandle = handle || _findDragHandle(box);
        if (!dragHandle || box.dataset.draggableModalBound === 'true') return;

        box.dataset.draggableModalBound = 'true';
        dragHandle.dataset.modalDragHandle = 'true';
        if (!dragHandle.style.cursor) dragHandle.style.cursor = 'move';

        dragHandle.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target.closest('button, a, input, select, textarea, label, [role="button"], .btn, .modal-close-btn')) return;

            _primeDraggableBoxPosition(box);
            const rect = box.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startLeft = rect.left;
            const startTop = rect.top;

            document.body.style.userSelect = 'none';

            function onMove(moveEvent) {
                const nextLeft = _clamp(startLeft + (moveEvent.clientX - startX), 8, Math.max(8, window.innerWidth - rect.width - 8));
                const nextTop = _clamp(startTop + (moveEvent.clientY - startY), 8, Math.max(8, window.innerHeight - rect.height - 8));
                box.style.left = `${nextLeft}px`;
                box.style.top = `${nextTop}px`;
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function _looksLikeFullOverlay(el) {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.position !== 'fixed') return false;
        if (el.classList.contains('modal-overlay')) return true;
        const rect = el.getBoundingClientRect();
        return rect.width >= window.innerWidth * 0.7 && rect.height >= window.innerHeight * 0.7;
    }

    function _enhanceDraggableModals(root) {
        if (!(root instanceof HTMLElement)) return;

        if (root.classList?.contains('modal-overlay')) {
            const box = root.querySelector('.modal-container') || root.firstElementChild;
            makeDraggableModal(box);
        }

        if (_looksLikeFullOverlay(root) && root.firstElementChild instanceof HTMLElement) {
            makeDraggableModal(root.firstElementChild);
        }

        root.querySelectorAll?.('.modal-overlay').forEach((overlay) => {
            const box = overlay.querySelector('.modal-container') || overlay.firstElementChild;
            makeDraggableModal(box);
        });
    }

    function _initModalDragObserver() {
        if (modalDragObserverInitialized) return;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _initModalDragObserver, { once: true });
            return;
        }
        modalDragObserverInitialized = true;
        _enhanceDraggableModals(document.body);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) _enhanceDraggableModals(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── 모달 ──────────────────────────────────────────────────────────────
    // options: { title, body, footer, buttons, size }
    // buttons: [{ label, class, onClick }]
    // size: 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
    function openModal(options) {
        const overlay = document.getElementById('modal');
        const titleEl = document.getElementById('modalTitle');
        const bodyEl  = document.getElementById('modalBody');
        const footerEl= document.getElementById('modalFooter');
        if (!overlay) return;

        const container = overlay.querySelector('.modal-container');
        const header = overlay.querySelector('.modal-header');
        if (header) {
            header.classList.remove('plan-day-modal-header');
            header.querySelector('.plan-day-line-switch')?.remove();
            header.setAttribute('data-modal-drag-handle', 'true');
        }
        if (container) {
            container.style.borderTop = '';
            container.style.boxShadow = '';
            _resetModalPosition(container);
            const sizeMap = {
                sm: 'min(420px, calc(100vw - 32px))',
                md: 'min(920px, calc(100vw - 32px))',
                lg: 'min(1100px, calc(100vw - 32px))',
                xl: 'min(1240px, calc(100vw - 32px))',
                xxl: 'min(1360px, calc(100vw - 24px))',
                xxxl: 'min(1500px, calc(100vw - 16px))'
            };
            const resolvedWidth = sizeMap[options.size || 'md'] || options.size || sizeMap.md;
            container.style.setProperty('max-width', resolvedWidth, 'important');
        }

        if (titleEl) titleEl.innerHTML = options.title || '';
        if (bodyEl)  bodyEl.innerHTML  = options.body  || '';

        // 버튼
        if (footerEl) {
            if (options.footer) {
                footerEl.innerHTML = options.footer;
            } else if (Array.isArray(options.buttons) && options.buttons.length) {
                footerEl.innerHTML = options.buttons.map(b =>
                    `<button class="btn ${b.class || 'btn-secondary'}" data-btn-label="${_esc(b.label)}">${_esc(b.label)}</button>`
                ).join('');
                // attach event listeners
                options.buttons.forEach(b => {
                    const el = footerEl.querySelector(`[data-btn-label="${CSS.escape(b.label)}"]`);
                    if (el && typeof b.onClick === 'function') el.addEventListener('click', b.onClick);
                });
            } else {
                footerEl.innerHTML = '';
            }
        }

        overlay.classList.add('active');
        _armModalBackGuard();
        makeDraggableModal(container, header);

        // 닫기 버튼
        const closeBtn = document.getElementById('modalCloseBtn');
        if (closeBtn) {
            closeBtn.onclick = () => closeModal();
        }
        // 오버레이 클릭 닫기 (noBackdropClose 옵션이면 비활성)
        // Backdrop clicks are ignored by default so form modals do not close accidentally.
        // Pass allowBackdropClose:true only for simple preview dialogs that should dismiss this way.
        overlay.onclick = (e) => {
            if (e.target === overlay && options.allowBackdropClose === true) closeModal();
        };
    }

    function closeModal() {
        const overlay = document.getElementById('modal');
        if (overlay) {
            overlay.classList.remove('active');
            const header = overlay.querySelector('.modal-header');
            const container = overlay.querySelector('.modal-container');
            if (header) {
                header.classList.remove('plan-day-modal-header');
                header.querySelector('.plan-day-line-switch')?.remove();
            }
            if (container) {
                container.style.borderTop = '';
                container.style.boxShadow = '';
                _resetModalPosition(container);
            }
        }
        _releaseModalBackGuard();
    }

    // showModal: 객체 형식({ title, body, footer, size }) 또는 위치 인자(title, body, footer, size) 모두 지원
    function showModal(titleOrOptions, body, footer, size) {
        if (titleOrOptions !== null && typeof titleOrOptions === 'object') {
            openModal(titleOrOptions);
        } else {
            openModal({ title: titleOrOptions, body, footer, size });
        }
    }

    // ── 확인 다이얼로그 ───────────────────────────────────────────────────
    function confirm(message, onConfirm, onCancel) {
        let settled = false;
        const cleanup = () => {
            document.removeEventListener('keydown', keyHandler, true);
        };
        const accept = () => {
            if (settled) return;
            settled = true;
            cleanup();
            closeModal();
            if (typeof onConfirm === 'function') onConfirm();
        };
        const cancel = () => {
            if (settled) return;
            settled = true;
            cleanup();
            closeModal();
            if (typeof onCancel === 'function') onCancel();
        };
        const keyHandler = (e) => {
            if (e.key === 'Enter') {
                // 텍스트 입력 중에는 무시 — confirm 모달에 입력 필드는 없지만 안전 가드
                const tag = (e.target && e.target.tagName || '').toLowerCase();
                if (tag === 'textarea' || (tag === 'input' && e.target.type === 'text')) return;
                e.preventDefault();
                accept();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        };
        openModal({
            title: '확인',
            body:  `<p style="margin:8px 0;font-size:.9rem;color:var(--text-primary);">${_esc(message)}</p>`,
            buttons: [
                { label: '확인', class: 'btn-primary',   onClick: accept },
                { label: '취소', class: 'btn-secondary', onClick: cancel }
            ]
        });
        document.addEventListener('keydown', keyHandler, true);
        // 확인 버튼에 포커스
        setTimeout(() => {
            const btn = document.querySelector('.modal .modal-footer .btn-primary, .modal-footer .btn-primary');
            if (btn) btn.focus();
        }, 50);
    }

    // ── 배지 HTML ─────────────────────────────────────────────────────────
    // badge(text, type)  — type은 색상 키워드 또는 색상 문자열
    const _BADGE_COLORS = {
        '합격': '#10b981', '불합격': '#ef4444', '보류': '#f59e0b',
        '완료': '#10b981', '대기': '#f59e0b',   '진행': '#3b82f6',
        '취소': '#94a3b8', '반려': '#ef4444',   '승인': '#10b981',
        'success': '#10b981', 'error': '#ef4444', 'warning': '#f59e0b',
        'info': '#3b82f6',    'default': '#64748b'
    };

    function badge(text, colorOrKey) {
        if (text == null || text === '') return '';
        const t = String(text);
        let color;
        if (colorOrKey && colorOrKey.startsWith('#')) {
            color = colorOrKey;
        } else {
            color = _BADGE_COLORS[colorOrKey] || _BADGE_COLORS[t] || _BADGE_COLORS.default;
        }
        return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.72rem;
                font-weight:700;background:${color}20;color:${color};border:1px solid ${color}44;">
                ${_esc(t)}</span>`;
    }

    // ── 아이템 타입 배지 (차종/품명/색상) ──────────────────────────────────
    function itemTypeBadge(carModel, partName, color) {
        const parts = [carModel, partName, color].filter(Boolean).map(s => _esc(String(s)));
        if (!parts.length) return '';
        return `<span style="display:inline-flex;gap:4px;align-items:center;">
            ${parts.map(p => `<span style="background:#f1f5f9;border-radius:4px;padding:1px 6px;
                font-size:.7rem;font-weight:700;color:#475569;">${p}</span>`).join('')}
        </span>`;
    }

    function sortCarModels(values, sourceRows) {
        const models = [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
        const rows = Array.isArray(sourceRows) && sourceRows.length
            ? sourceRows
            : (typeof Storage !== 'undefined' && Storage.getAll && typeof DB !== 'undefined'
                ? (Storage.getAll(DB.STORES.PRODUCTS) || [])
                : []);
        const massModels = new Set();
        rows.forEach(r => {
            const car = String((r && r.carModel) || '').trim();
            const itemType = String((r && r.itemType) || '').trim();
            if (car && itemType.includes('양산')) massModels.add(car);
        });
        return models.sort((a, b) => {
            const am = massModels.has(a) ? 0 : 1;
            const bm = massModels.has(b) ? 0 : 1;
            if (am !== bm) return am - bm;
            return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
        });
    }

    // ── 페이지네이션 ──────────────────────────────────────────────────────
    // renderPagination(currentPage, totalPages, onPageClick)
    function renderPagination(currentPage, totalPages, onPageClick) {
        if (!totalPages || totalPages <= 1) return '';
        const pages = [];
        const cur = Number(currentPage) || 1;
        const tot = Number(totalPages) || 1;

        pages.push(`<button onclick="${onPageClick}(1)" ${cur===1?'disabled':''}
            style="padding:4px 8px;margin:0 2px;border-radius:4px;border:1px solid var(--border-color);
                   background:${cur===1?'var(--bg-tertiary)':'#fff'};cursor:pointer;">&laquo;</button>`);

        const range = [];
        for (let p = Math.max(1, cur-2); p <= Math.min(tot, cur+2); p++) range.push(p);
        range.forEach(p => {
            pages.push(`<button onclick="${onPageClick}(${p})"
                style="padding:4px 10px;margin:0 2px;border-radius:4px;
                       border:1px solid ${p===cur?'var(--accent-blue)':'var(--border-color)'};
                       background:${p===cur?'var(--accent-blue)':'#fff'};
                       color:${p===cur?'#fff':'inherit'};cursor:pointer;font-weight:${p===cur?700:400};">${p}</button>`);
        });

        pages.push(`<button onclick="${onPageClick}(${tot})" ${cur===tot?'disabled':''}
            style="padding:4px 8px;margin:0 2px;border-radius:4px;border:1px solid var(--border-color);
                   background:${cur===tot?'var(--bg-tertiary)':'#fff'};cursor:pointer;">&raquo;</button>`);

        return `<div style="display:flex;justify-content:center;align-items:center;
                            gap:0;padding:12px 0;flex-wrap:wrap;">
            ${pages.join('')}
        </div>`;
    }

    // ── 내부 이스케이프 ───────────────────────────────────────────────────
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── 토스트 애니메이션 CSS 삽입 (한 번만) ─────────────────────────────
    (function _injectStyles() {
        if (document.getElementById('_uiUtilsStyle')) return;
        const style = document.createElement('style');
        style.id = '_uiUtilsStyle';
        style.textContent = `
            @keyframes slideInRight {
                from { opacity:0; transform:translateX(30px); }
                to   { opacity:1; transform:translateX(0); }
            }
            @keyframes fadeOut {
                to { opacity:0; transform:translateX(30px); }
            }
            .toast-container {
                position:fixed;bottom:24px;right:24px;
                display:flex;flex-direction:column;gap:8px;
                z-index:9999;pointer-events:none;
            }
            [data-modal-drag-handle="true"] {
                cursor: move;
            }
        `;
        document.head.appendChild(style);
    })();

    _initModalDragObserver();

    // ── 컬러 별칭 정규화 (BK→black, 블랙→black 등) ───────────────────────
    function normalizeColorAlias(c) {
        const s = String(c || '').trim().toLowerCase().replace(/\s+/g, '');
        const MAP = {
            '블랙': 'black', '검정': 'black', '검은색': 'black', '흑': 'black',
            '화이트': 'white', '흰색': 'white', '백색': 'white', '백': 'white',
            '그레이': 'gray', '회색': 'gray', '그레': 'gray',
            '실버': 'silver', '은색': 'silver', '은': 'silver',
            '레드': 'red', '빨강': 'red', '빨간색': 'red', '적색': 'red',
            '블루': 'blue', '파랑': 'blue', '파란색': 'blue', '청색': 'blue',
            '그린': 'green', '초록': 'green', '녹색': 'green',
            '옐로우': 'yellow', '노랑': 'yellow', '노란색': 'yellow', '황색': 'yellow',
            '골드': 'gold', '금색': 'gold', '금': 'gold',
            '오렌지': 'orange', '주황': 'orange', '주황색': 'orange',
            '퍼플': 'purple', '보라': 'purple', '보라색': 'purple',
            '브라운': 'brown', '갈색': 'brown',
            '베이지': 'beige', '크림': 'beige',
            'bk': 'black', 'blk': 'black',
            'wh': 'white', 'wht': 'white',
            'si': 'silver', 'sil': 'silver', 'sl': 'silver',
            'gy': 'gray', 'gry': 'gray',
            'rd': 'red',
            'bl': 'blue', 'blu': 'blue',
            'gn': 'green', 'grn': 'green',
            'yl': 'yellow', 'yel': 'yellow',
            'gd': 'gold',
            'or': 'orange', 'org': 'orange',
            'vi': 'purple', 'vio': 'purple',
            'br': 'brown', 'brn': 'brown'
        };
        if (MAP[s] !== undefined) return MAP[s];
        const sortedKeys = Object.keys(MAP).sort(function(a, b) { return b.length - a.length; });
        for (let i = 0; i < sortedKeys.length; i++) {
            const k = sortedKeys[i];
            if (s.startsWith(k)) return MAP[k];
        }
        return s;
    }

    // ── Public API ───────────────────────────────────────────────────────
    return {
        today,
        now,
        monthAgo,
        daysAgo,
        formatNumber,
        toast,
        openModal,
        closeModal,
        showModal,
        confirm,
        badge,
        itemTypeBadge,
        sortCarModels,
        renderPagination,
        makeDraggableModal,
        normalizeColorAlias
    };
})();


/* =========================================================
   ProdAppleMenu — Apple-style card tab menu (global)
   card()  : 개별 카드 버튼 HTML
   strip() : 가로 배열 컨테이너 HTML
   hero()  : 제목+설명+카드 탭 전체 블록 HTML
   ========================================================= */
const ProdAppleMenu = (function() {
    function card({ label, icon, subtitle, active, onClick, accent, tabKey }) {
        subtitle = subtitle || '';
        active = active || false;
        onClick = onClick || '';
        accent = accent || '#2563eb';
        tabKey = tabKey || '';
        return '<button type="button"' +
            ' class="mes-apple-menu-card' + (active ? ' active' : '') + '"' +
            ' style="--menu-accent:' + accent + ';"' +
            (tabKey ? ' data-tab="' + tabKey + '"' : '') +
            (onClick ? ' onclick="' + onClick.replace(/"/g, '&quot;') + '"' : '') +
            '>' +
            '<span class="mes-apple-menu-card-icon">' +
            '<span class="material-symbols-outlined">' + icon + '</span>' +
            '</span>' +
            '<span class="mes-apple-menu-card-body">' +
            '<span class="mes-apple-menu-card-title">' + label + '</span>' +
            (subtitle ? '<span class="mes-apple-menu-card-subtitle">' + subtitle + '</span>' : '') +
            '</span>' +
            '</button>';
    }
    function strip(items) {
        return '<div class="mes-apple-menu-strip">' + items.map(function(i) { return card(i); }).join('') + '</div>';
    }
    function hero(title, desc, items) {
        return '<div class="mes-apple-menu-hero">' +
            '<div class="mes-apple-menu-head">' +
            '<h3>' + title + '</h3>' +
            (desc ? '<p>' + desc + '</p>' : '') +
            '</div>' +
            strip(items) +
            '</div>';
    }
    return { card: card, strip: strip, hero: hero };
})();
