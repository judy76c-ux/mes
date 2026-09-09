/**
 * print-fit.js — 인쇄 미리보기 창을 화면 폭(A4/A3 용지 폭)에 맞춰 축소해서 보여준다.
 *
 * 각 모듈이 window.open + document.write 로 만드는 모든 인쇄 창에 공통 적용된다.
 * - window.open 을 감싸서 자식 창에 스케일 스크립트를 주입한다.
 * - 화면(screen)에서만 body.zoom 으로 축소하고, 실제 인쇄(beforeprint) 시에는 원래 배율로 되돌린다.
 *   → 인쇄 결과물(@page size/mm 레이아웃)에는 전혀 영향을 주지 않는다.
 */
(function() {
    'use strict';
    if (window.__printFitInstalled) return;
    window.__printFitInstalled = true;

    const MARK_ID = '__printFitMark';

    function injectFit(win) {
        let doc;
        try { doc = win.document; } catch (e) { return false; }
        if (!doc || !doc.body || !doc.body.firstChild) return false;
        if (doc.getElementById(MARK_ID)) return true;

        const mark = doc.createElement('meta');
        mark.id = MARK_ID;
        try { (doc.head || doc.body).appendChild(mark); } catch (e) { return false; }

        const body = doc.body;

        function fit() {
            try {
                body.style.zoom = '';
                const avail = doc.documentElement.clientWidth || win.innerWidth || 0;
                if (!avail) return;
                // 용지 폭(고정 mm 레이아웃)을 실제로 차지하는 폭 측정
                let need = Math.max(body.scrollWidth || 0, doc.documentElement.scrollWidth || 0);
                const nodes = doc.querySelectorAll('.print-page,.sheet,.print-sheet,.page,table');
                for (let i = 0; i < nodes.length; i++) {
                    const w = nodes[i].getBoundingClientRect().width;
                    if (w > need) need = w;
                }
                if (need > avail + 2) {
                    body.style.zoom = String(Math.max(0.2, avail / need).toFixed(4));
                }
            } catch (e) {}
        }
        function unfit() { try { body.style.zoom = ''; } catch (e) {} }

        win.__printFitApply = fit;
        try {
            win.addEventListener('resize', function() { setTimeout(fit, 40); });
            win.addEventListener('beforeprint', unfit);
            win.addEventListener('afterprint', function() { setTimeout(fit, 60); });
            // 이미지/폰트 로드 후 폭이 바뀌는 경우까지 커버
            win.addEventListener('load', function() { setTimeout(fit, 80); });
        } catch (e) {}
        setTimeout(fit, 60);
        setTimeout(fit, 400);
        setTimeout(fit, 1200);
        return true;
    }

    // 자식 창은 document.write 로 여러 번 다시 그려질 수 있으므로(준비중 → 실제 양식)
    // 일정 시간 동안 주입 여부를 계속 확인한다.
    function watch(win) {
        let ticks = 0;
        const timer = setInterval(function() {
            ticks++;
            let closed = true;
            try { closed = !win || win.closed; } catch (e) { closed = true; }
            if (closed || ticks > 150) { clearInterval(timer); return; }
            try { injectFit(win); } catch (e) {}
        }, 120);
    }

    const nativeOpen = window.open;
    window.open = function() {
        const win = nativeOpen.apply(window, arguments);
        try { if (win) watch(win); } catch (e) {}
        return win;
    };
})();
