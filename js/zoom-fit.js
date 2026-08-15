/**
 * MesZoomFit — 화면 확대 시 글자가 줄바꿈되지 않도록 콘텐츠 글자/블록을 역으로 축소한다.
 * 브라우저 확대(Ctrl +)로 CSS 픽셀이 줄면 표·카드 폭이 좁아져 품명 등이 두 줄이 된다.
 * 확대 배율만큼 #contentArea·모달 콘텐츠에 zoom을 낮춰 한 줄을 유지한다.
 */
var MesZoomFit = (function () {
    'use strict';

    var _raf = 0;
    var _bound = false;
    var _observer = null;

    function _browserZoom() {
        var zoom = 1;
        var inner = window.innerWidth || 1;
        var outer = window.outerWidth || 0;
        if (outer > 0) {
            var ratio = outer / inner;
            if (ratio >= 1.08 && ratio <= 3) zoom = ratio;
        }
        var vv = window.visualViewport;
        if (vv && vv.scale > 1.02) zoom = Math.max(zoom, vv.scale);
        return zoom;
    }

    function _fitScale() {
        var zoom = _browserZoom();
        var ca = document.getElementById('contentArea');
        var cw = (ca && ca.clientWidth) || (window.innerWidth || 1100);
        var squeeze = cw > 0 ? (1000 / cw) : 1;
        if (squeeze > 1.08 && squeeze <= 2.2) zoom = Math.max(zoom, squeeze);
        if (zoom <= 1.05) return 1;
        return Math.max(0.72, Math.min(1, 1 / zoom));
    }

    function _applyZoom(el, scale) {
        if (!el) return;
        if (scale >= 0.995) {
            el.style.removeProperty('zoom');
            return;
        }
        el.style.zoom = String(scale);
    }

    function _fitOverflowBlocks(root, minScale) {
        if (!root) return;
        var nodes = root.querySelectorAll(
            '.pw-stock-card, .pw-section-head, .jig-block, .jig-life-table, .card, .section-card'
        );
        var list = Array.prototype.slice.call(nodes).filter(function (el) {
            if (el.classList.contains('data-table--content')) return false;
            if (el.closest('svg, canvas')) return false;
            return !nodes.length || !Array.prototype.some.call(nodes, function (other) {
                return other !== el && other.contains(el);
            });
        });
        list.forEach(function (el) {
            el.style.removeProperty('zoom');
            var parent = el.parentElement;
            var avail = parent ? parent.clientWidth : el.clientWidth;
            if (avail <= 0) return;
            var need = avail / Math.max(el.scrollWidth, 1);
            if (need < 0.995) {
                el.style.zoom = String(Math.max(minScale, need));
            }
        });
    }

    function _sidebarBaseWidth(sidebar) {
        if (!sidebar) return 190;
        if (document.body.classList.contains('sidebar-hidden')) return 0;
        if (sidebar.classList.contains('collapsed')) {
            var collapsed = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-collapsed-width');
            return parseFloat(collapsed) || 68;
        }
        var live = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-live-width');
        return parseFloat(live) || 190;
    }

    function apply() {
        var scale = _fitScale();
        var sidebar = document.getElementById('sidebar');
        var main = document.querySelector('.main-area');
        var content = document.getElementById('contentArea');
        document.documentElement.style.setProperty('--mes-fit-scale', String(scale));
        var fitW = Math.round(_sidebarBaseWidth(sidebar) * scale);
        document.documentElement.style.setProperty('--sidebar-fit-width', fitW + 'px');
        if (sidebar) {
            sidebar.style.removeProperty('zoom');
            sidebar.style.removeProperty('width');
        }
        if (main) {
            main.style.removeProperty('zoom');
            main.style.removeProperty('margin-left');
        }
        _applyZoom(content, scale);
        _applyZoom(document.querySelector('#modal .modal-container'), scale);
        _applyZoom(document.querySelector('#modalChild .modal-container'), scale);
        _fitOverflowBlocks(content, 0.72);
        var modalBody = document.getElementById('modalBody');
        if (modalBody) _fitOverflowBlocks(modalBody, 0.72);
    }

    function schedule() {
        if (_raf) cancelAnimationFrame(_raf);
        _raf = requestAnimationFrame(function () {
            _raf = 0;
            apply();
        });
    }

    function install() {
        if (_bound) {
            schedule();
            return;
        }
        _bound = true;
        window.addEventListener('resize', schedule);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', schedule);
            window.visualViewport.addEventListener('scroll', schedule);
        }
        var content = document.getElementById('contentArea');
        if (content && typeof MutationObserver !== 'undefined') {
            _observer = new MutationObserver(function () { schedule(); });
            _observer.observe(content, { childList: true, subtree: true });
            var sidebar = document.getElementById('sidebar');
            if (sidebar) {
                _observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });
            }
            _observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        schedule();
    }

    return {
        install: install,
        apply: apply,
        schedule: schedule
    };
})();
