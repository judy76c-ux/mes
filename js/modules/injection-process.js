/**
 * 사출 공정 공통 네비게이션 + 메인 허브
 */

/* ── 사출 공정 공통 탭바 ─────────────────────────────────────────── */
var InjectionNavUI = (function () {
    // activeKey: 'hub' | 'worklog' | 'mold' | 'rawmat' | 'schedule' | 'rawmat-inv' | 'wip' | 'layout'
    const MENUS = [
        { key: 'worklog',   label: '작업일지',    icon: 'assignment',      go: function () { _goTab('worklog'); } },
        { key: 'mold',      label: '금형 교체',   icon: 'construction',    go: function () { _goTab('mold'); } },
        { key: 'rawmat',    label: '원재료 변경', icon: 'inventory_2',     go: function () { _goTab('rawmat'); } },
        { key: 'schedule',  label: '월간 스케쥴', icon: 'calendar_month',  go: function () { _goTab('schedule'); } },
        { key: 'rawmat-inv',label: '원재료 입출고',icon: 'warehouse',      go: function () { Router.navigate('raw-material-inventory'); } },
        { key: 'wip',       label: '사출 재공품', icon: 'layers',          go: function () { Router.navigate('injection-wip'); } },
        { key: 'layout',    label: '사출실 레이아웃', icon: 'space_dashboard', go: function () { Router.navigate('injection-room-layout'); } }
    ];

    function _goTab(tab) {
        try { sessionStorage.setItem('injectionWorkTab', tab); } catch {}
        Router.navigate('injection-work');
    }

    function renderSection(activeKey, actionsHtml) {
        const tabs = MENUS.map(function (m) {
            const onclick = m.key === 'rawmat-inv' ? "Router.navigate('raw-material-inventory')"
                          : m.key === 'wip'        ? "Router.navigate('injection-wip')"
                          : m.key === 'layout'     ? "Router.navigate('injection-room-layout')"
                          : "InjectionNavUI.goTab('" + m.key + "')";
            return '<button type="button" onclick="' + onclick + '" class="mes-bar-tab ' + (m.key === activeKey ? 'active' : '') + '">' +
                '<span class="material-symbols-outlined">' + m.icon + '</span>' + m.label +
            '</button>';
        }).join('');
        return '<div class="mes-action-bar">' +
            '<div class="mes-action-bar-tabs">' + tabs + '</div>' +
            (actionsHtml ? '<div class="mes-action-bar-sep"></div><div class="mes-action-bar-btns">' + actionsHtml + '</div>' : '') +
        '</div>';
    }

    return {
        renderSection,
        goTab: _goTab
    };
})();

/* ── 사출 공정 메인 허브 ─────────────────────────────────────────── */
var InjectionProcessModule = (function () {
    const WORK_LOG_STORE = DB.STORES.INJECTION_WORK_LOG;
    const MOLD_STORE     = DB.STORES.MOLD_CHANGE_LOG;
    const RAW_CHANGE_STORE = DB.STORES.RAW_MAT_CHANGE_LOG;
    const RAW_INV_STORE  = DB.STORES.RAW_MATERIAL_INVENTORY;

    function _count(store) {
        try { return (Storage.getAll(store) || []).length; } catch { return 0; }
    }

    function render(container) {
        const workCount   = _count(WORK_LOG_STORE);
        const moldCount   = _count(MOLD_STORE);
        const rawChgCount = _count(RAW_CHANGE_STORE);
        const rawInvCount = _count(RAW_INV_STORE);

        const tabs = [
            { label: '사출 작업일지',    icon: 'assignment',      subtitle: `${workCount}건 · 생산 실적`,    accent: '#2563eb', onClick: "InjectionNavUI.goTab('worklog')" },
            { label: '금형 교체 이력',   icon: 'construction',    subtitle: `${moldCount}건 · 교체 이력`,    accent: '#f59e0b', onClick: "InjectionNavUI.goTab('mold')" },
            { label: '원재료 변경이력',  icon: 'inventory_2',     subtitle: `${rawChgCount}건 · 변경 기록`,  accent: '#10b981', onClick: "InjectionNavUI.goTab('rawmat')" },
            { label: '월간 스케쥴',      icon: 'calendar_month',  subtitle: '생산 일정 분석',                accent: '#8b5cf6', onClick: "InjectionNavUI.goTab('schedule')" },
            { label: '원재료 입출고',    icon: 'warehouse',       subtitle: `${rawInvCount}건 · 재고 현황`,  accent: '#0891b2', onClick: "Router.navigate('raw-material-inventory')" },
            { label: '사출 재공품',      icon: 'layers',          subtitle: '도장 투입 전 재공품 현황',      accent: '#2563eb', onClick: "Router.navigate('injection-wip')" },
            { label: '사출실 레이아웃',  icon: 'space_dashboard', subtitle: '설비 배치도 편집·인쇄',         accent: '#2563eb', onClick: "Router.navigate('injection-room-layout')" }
        ];

        container.innerHTML = `
            <div class="fade-in-up">
                ${ProdAppleMenu.hero('사출 공정', '작업일지 · 금형 교체 · 원재료 변경 · 월간 스케쥴 · 재공품 현황을 통합 관리합니다.', tabs)}
            </div>
        `;
    }

    return {
        render,
        init: render,
        goWorkTab: InjectionNavUI.goTab
    };
})();
