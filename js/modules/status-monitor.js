/**
 * 현황 모니터 전용 페이지
 * 일반 대시보드와 분리해 TV 송출용 레이아웃으로 사용한다.
 */
const StatusMonitorModule = (function() {
    let refreshTimer = null;
    let refreshing = false;

    async function refreshLive() {
        if (refreshing || typeof Storage === 'undefined' || typeof DashboardModule === 'undefined') return;
        refreshing = true;
        try {
            const stores = [
                DB.STORES.PRODUCTION_PLANS,
                DB.STORES.PAINTING_WORK,
                DB.STORES.INJECTION_INVENTORY,
                DB.STORES.PAINT_INVENTORY,
                DB.STORES.INJECTION_INSPECTIONS,
                DB.STORES.SALES_DELIVERY_PLAN,
                DB.STORES.JIG_MASTER,
                DB.STORES.JIG_LOG,
                DB.STORES.EQUIP_FPROOF_LOG,
                DB.STORES.EQUIP_ILLUMINATION_LOG,
                DB.STORES.PROD_IMPROVEMENT_ACTIVITIES,
                DB.STORES.PROD_QUALITY_PERFORMANCE,
                DB.STORES.LASER_INSPECTIONS
            ].filter(Boolean);
            await Promise.allSettled(stores.map(store => Storage.refresh(store)));
            if (typeof AuthModule !== 'undefined' && AuthModule.refreshMessages) {
                await AuthModule.refreshMessages();
            }
            if (typeof Router !== 'undefined' && Router.getCurrentPage && Router.getCurrentPage() === 'status-monitor') {
                DashboardModule.refresh(true);
            }
        } finally {
            refreshing = false;
        }
    }

    function render(container) {
        document.body.classList.add('monitor-mode');
        document.body.classList.add('sidebar-hidden');
        try { sessionStorage.setItem('mes_sidebar_hidden', '1'); } catch (e) {}
        if (typeof DashboardModule === 'undefined' || !DashboardModule.render) {
            container.innerHTML = '<div class="empty-state"><h4>현황 모니터를 불러올 수 없습니다.</h4></div>';
            return;
        }
        DashboardModule.render(container);
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function() {
            if (typeof Router !== 'undefined' && Router.getCurrentPage && Router.getCurrentPage() === 'status-monitor') {
                refreshLive();
            }
        }, 300000);
        setTimeout(refreshLive, 250);
    }

    return { render };
})();
