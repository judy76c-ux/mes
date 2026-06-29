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
            const active = m.key === activeKey;
            const onclick = m.key === 'rawmat-inv' ? "Router.navigate('raw-material-inventory')"
                          : m.key === 'wip'        ? "Router.navigate('injection-wip')"
                          : m.key === 'layout'     ? "Router.navigate('injection-room-layout')"
                          : "InjectionNavUI.goTab('" + m.key + "')";
            return '<button type="button" onclick="' + onclick + '"' +
                ' style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;' +
                'border:' + (active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)') + ';' +
                'background:var(--bg-primary);color:var(--text-primary);cursor:pointer;min-width:130px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">' +
                '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex-shrink:0;' +
                'background:' + (active ? 'var(--accent-blue)' : 'var(--bg-secondary)') + ';">' +
                '<span class="material-symbols-outlined" style="font-size:24px;color:' + (active ? '#fff' : 'var(--text-muted)') + ';">' + m.icon + '</span></span>' +
                '<span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">' + m.label + '</span></button>';
        }).join('');
        return '<div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">' +
            tabs +
            (actionsHtml ? '<div style="margin-left:auto;display:flex;gap:8px;">' + actionsHtml + '</div>' : '') +
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
                ${ProdAppleMenu.strip(tabs)}
            </div>
        `;
    }

    return {
        render,
        init: render,
        goWorkTab: InjectionNavUI.goTab
    };
})();
