/**
 * UIUtils — 전역 UI 유틸리티
 * toast / modal / formatNumber / date helpers / badge 등
 * 모든 모듈에서 UIUtils.xxx() 형태로 사용
 */

const UIUtils = (function () {
    'use strict';

    // ── 날짜 유틸 ────────────────────────────────────────────────────────
    function today() {
        return new Date().toISOString().split('T')[0];
    }

    function now() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    function monthAgo() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    }

    function daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    }

    // ── 숫자 포맷 ─────────────────────────────────────────────────────────
    function formatNumber(n) {
        if (n == null || n === '') return '-';
        const num = Number(n);
        if (isNaN(num)) return String(n);
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
        if (container) {
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
        if (overlay) overlay.classList.remove('active');
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
        openModal({
            title: '확인',
            body:  `<p style="margin:8px 0;font-size:.9rem;color:var(--text-primary);">${_esc(message)}</p>`,
            buttons: [
                {
                    label: '확인',
                    class: 'btn-primary',
                    onClick: () => {
                        closeModal();
                        if (typeof onConfirm === 'function') onConfirm();
                    }
                },
                {
                    label: '취소',
                    class: 'btn-secondary',
                    onClick: () => {
                        closeModal();
                        if (typeof onCancel === 'function') onCancel();
                    }
                }
            ]
        });
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
        `;
        document.head.appendChild(style);
    })();

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
        renderPagination
    };
})();
